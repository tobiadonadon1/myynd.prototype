// L'AI inclusa con Myynd (F8): il ponte sul server, e lo stato per le preferenze.
//
// «For customers the AI is in the price, on our key.» La chiave nostra non va
// mai su un computer: sta sul server ospitato (`MYYND_INCLUSO_CHIAVE`), e
// l'app sul Mac parla con il ponte come parlerebbe con Anthropic, la stessa
// lingua dei Messaggi, con il gettone del suo conto Myynd al posto della
// chiave (`modello.fornitoreIncluso`). Il ponte fa tre cose e basta:
//
//   · riconosce chi chiede (una sessione di `conti.ts`), o risponde 401;
//   · guarda la dose di oggi di quella persona nel *suo* registro dell'uso,
//     sul server, dove lei non può alzarla, e se è finita risponde 429
//     `budget_exhausted`, che l'app legge come il tetto e non come un guasto;
//   · inoltra ad Anthropic, anche in streaming, e segna i token veri.
//
// Finché il conto aziendale con Anthropic non c'è, la chiave non c'è, e il
// ponte risponde 503 `not_configured` a tutti: le preferenze dicono «non
// ancora disponibile», e nessuno legge «in uso» per una cosa che non ha mai
// risposto. Qui non si finge niente.

import type express from 'express'
import * as store from './store.ts'
import * as chi from './chi.ts'
import * as conti from './conti.ts'
import { tettoDelPianoSulServer } from './tetto.ts'

export const URL_ANTHROPIC = 'https://api.anthropic.com/v1/messages'
/** Il nome con cui il ponte compare nel registro dell'uso di ognuno, sul server. */
export const MOTORE_INCLUSO = 'Myynd included'
/** Il tetto di una sola risposta: il ponte non inoltra richieste da un milione di token. */
const USCITA_MAX = 32_000

export type FerriPonte = {
  /** La chiave del conto aziendale, solo sul server. Assente = il ponte non c'è ancora. */
  chiave: () => string | undefined
  utente: (gettone: string) => Promise<string | null>
  dentro: <T>(utente: string, fai: () => T) => T
  /** I token di oggi della persona in cui si è dentro, entrata più uscita. */
  usati: () => number
  tetto: () => number
  segna: (u: store.Uso) => void
  rete: typeof fetch
}

function inizioDiOggi(): string {
  return new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
}

export const PONTE_VERO: FerriPonte = {
  chiave: () => (process.env.MYYND_INCLUSO_CHIAVE ?? '').trim() || undefined,
  utente: g => conti.utenteDelToken(g),
  dentro: (u, fai) => chi.dentro(u, fai),
  usati: () => { const t = store.usoDal(inizioDiOggi()); return t.entrata + t.uscita },
  tetto: () => tettoDelPianoSulServer(),
  segna: u => { try { store.segnaUso(u) } catch { /* contare non rompe la risposta */ } },
  rete: (...a) => fetch(...a)
}

/** Un errore nella forma di Anthropic: l'SDK dall'altra parte lo legge come i suoi. */
function no(res: express.Response, stato: number, tipo: string, messaggio: string) {
  if (stato === 429) res.setHeader('x-should-retry', 'false')
  res.status(stato).json({ type: 'error', error: { type: tipo, message: messaggio } })
}

/** Il gettone: l'SDK lo manda come `x-api-key`; un `Authorization: Bearer` vale uguale. */
function gettoneDi(req: express.Request): string {
  const k = req.headers['x-api-key']
  if (typeof k === 'string' && k.trim()) return k.trim()
  const a = req.headers.authorization ?? ''
  return a.startsWith('Bearer ') ? a.slice(7).trim() : ''
}

/** Chi chiede, e se il ponte c'è: il pezzo comune alle due rotte. */
async function chiEntra(f: FerriPonte, req: express.Request, res: express.Response): Promise<{ chiave: string; utente: string } | null> {
  const chiave = f.chiave()
  if (!chiave) { no(res, 503, 'not_configured', 'Included AI is not available yet.'); return null }
  const g = gettoneDi(req)
  const utente = g ? await f.utente(g) : null
  if (!utente) { no(res, 401, 'authentication_error', 'Sign in to Myynd to use the included AI.'); return null }
  return { chiave, utente }
}

type UsoAnthropic = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
const n = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : 0

function rigaDiUso(u: UsoAnthropic, modello: string): store.Uso {
  const scritti = n(u.cache_creation_input_tokens)
  return { lavoro: 'incluso', motore: MOTORE_INCLUSO, entrata: n(u.input_tokens) + scritti, cache: n(u.cache_read_input_tokens), uscita: n(u.output_tokens), scritti, modello }
}

/** `POST /api/incluso/v1/messages`: la rotta dei Messaggi, dietro la dose di oggi. */
export function ponte(f: FerriPonte = PONTE_VERO): express.RequestHandler {
  return async (req, res) => {
    const dentro = await chiEntra(f, req, res)
    if (!dentro) return
    await f.dentro(dentro.utente, async () => {
      if (f.usati() >= f.tetto()) return no(res, 429, 'budget_exhausted', 'Today’s included AI allowance is used up.')
      const corpo = (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? { ...req.body } : null) as Record<string, unknown> | null
      if (!corpo || typeof corpo.model !== 'string' || !/^claude-/.test(corpo.model) || !Array.isArray(corpo.messages)) {
        return no(res, 400, 'invalid_request_error', 'This request is not a Messages API request.')
      }
      corpo.max_tokens = Math.min(n(corpo.max_tokens) || 1024, USCITA_MAX)
      const modello = corpo.model as string
      const fermo = new AbortController()
      res.on('close', () => { if (!res.writableFinished) fermo.abort() })
      let su: Response
      try {
        su = await f.rete(URL_ANTHROPIC, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': dentro.chiave,
            'anthropic-version': typeof req.headers['anthropic-version'] === 'string' ? req.headers['anthropic-version'] : '2023-06-01',
            ...(typeof req.headers['anthropic-beta'] === 'string' ? { 'anthropic-beta': req.headers['anthropic-beta'] } : {})
          },
          body: JSON.stringify(corpo),
          signal: fermo.signal
        })
      } catch {
        if (fermo.signal.aborted) return
        return no(res, 502, 'api_error', 'Anthropic could not be reached.')
      }
      // in streaming si passa tutto com'è, e intanto si leggono i token dagli eventi
      if (corpo.stream === true && su.ok && su.body) {
        res.status(su.status)
        res.setHeader('content-type', su.headers.get('content-type') ?? 'text/event-stream')
        res.setHeader('cache-control', 'no-cache')
        const uso: UsoAnthropic = {}
        const leggi = new TextDecoder()
        let resto = ''
        const r = su.body.getReader()
        try {
          for (;;) {
            const { value, done } = await r.read()
            if (done) break
            res.write(value)
            const righe = (resto + leggi.decode(value, { stream: true })).split('\n')
            resto = righe.pop() ?? ''
            for (const l of righe) {
              if (!l.startsWith('data:')) continue
              try {
                const e = JSON.parse(l.slice(5)) as { type?: string; message?: { usage?: UsoAnthropic }; usage?: UsoAnthropic }
                if (e.type === 'message_start' && e.message?.usage) Object.assign(uso, e.message.usage)
                if (e.type === 'message_delta' && e.usage) Object.assign(uso, e.usage)
              } catch { /* una riga a metà o un ping */ }
            }
          }
        } catch { /* il filo è caduto: si conta quello che si è visto */ }
        f.segna(rigaDiUso(uso, modello))
        return res.end()
      }
      const testo = await su.text()
      if (su.ok) {
        try { f.segna(rigaDiUso((JSON.parse(testo) as { usage?: UsoAnthropic }).usage ?? {}, modello)) } catch { /* non era JSON: si passa com'è */ }
      }
      res.status(su.status).setHeader('content-type', su.headers.get('content-type') ?? 'application/json')
      res.end(testo)
    })
  }
}

/** `GET /api/incluso/stato`: la chiamata di salute, con la dose di oggi. Non costa un token. */
export function statoDelPonte(f: FerriPonte = PONTE_VERO): express.RequestHandler {
  return async (req, res) => {
    const dentro = await chiEntra(f, req, res)
    if (!dentro) return
    f.dentro(dentro.utente, () => res.json({ usati: f.usati(), tetto: f.tetto() }))
  }
}

// — lo stato, per le preferenze —

/**
 * Cosa dire nella riga «Incluso con Myynd». `assente` finché il ponte non ha
 * risposto per davvero: nessun gettone, nessun indirizzo, un 503 o un 401,
 * la rete giù. `pronto` solo dopo un 200 del ponte. `finito` quando la dose
 * di oggi è usata.
 */
export type StatoIncluso = { stato: 'assente' | 'pronto' | 'finito'; usati?: number; tetto?: number }

export async function salute(o: { url?: string; gettone?: string; rete?: typeof fetch; attesa?: number }): Promise<StatoIncluso> {
  const url = (o.url ?? '').trim().replace(/\/+$/, '')
  const g = (o.gettone ?? '').trim()
  if (!url || !g) return { stato: 'assente' }
  try {
    const r = await (o.rete ?? fetch)(`${url}/api/incluso/stato`, { headers: { 'x-api-key': g }, signal: AbortSignal.timeout(o.attesa ?? 8000) })
    if (r.status === 429) return { stato: 'finito' }
    if (!r.ok) return { stato: 'assente' }
    const d = await r.json() as { usati?: unknown; tetto?: unknown }
    const usati = n(d.usati), tetto = n(d.tetto)
    if (!tetto) return { stato: 'assente' }
    return { stato: usati >= tetto ? 'finito' : 'pronto', usati, tetto }
  } catch { return { stato: 'assente' } }
}

/**
 * Lo stato qui, per `/api/incluso`. Sul Mac è la chiamata di salute al ponte,
 * con il gettone del suo conto; ospitati il ponte è questo server, e la dose
 * si legge dal suo registro.
 */
export async function statoQui(o: { ospitato: boolean; motore?: string; gettone?: string; url?: string; rete?: typeof fetch }): Promise<StatoIncluso & { scelto: boolean }> {
  const scelto = o.motore === 'incluso'
  if (o.ospitato) {
    if (!PONTE_VERO.chiave()) return { stato: 'assente', scelto }
    const usati = PONTE_VERO.usati(), tetto = PONTE_VERO.tetto()
    return { stato: usati >= tetto ? 'finito' : 'pronto', usati, tetto, scelto }
  }
  return { ...(await salute({ url: o.url ?? process.env.MYYND_INCLUSO_URL, gettone: o.gettone, rete: o.rete })), scelto }
}
