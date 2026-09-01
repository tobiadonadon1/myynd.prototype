// Slack: quello che si sono detti, che quasi mai è scritto da un'altra parte.
//
// Perché è la fonte che mancava di più. La posta tiene i documenti — fatture,
// contratti, preventivi — ma la *decisione* quasi sempre non sta lì: sta in
// tre righe in un canale, un martedì pomeriggio, fra due persone che si erano
// capite. Un assistente che ha letto tutta la casella e non ha mai visto Slack
// sa cosa è stato mandato e non sa cosa è stato deciso.
//
// **Un token incollato, non un OAuth.** Slack non accetta un indirizzo di
// ritorno su `http://127.0.0.1` — l'unico che un'app che gira sul computer di
// qualcuno può offrire — quindi il ballo del browser qui non si può ballare, e
// fingere il contrario vorrebbe dire un bottone che fallisce sempre. Si fa
// come con Notion: si crea un'app, si scelgono gli ambiti, si installa nel
// proprio spazio, si incolla il token. Cinque minuti, una volta.
//
// **Un token da utente (`xoxp-`), non da bot.** Un bot vede solo i canali in
// cui qualcuno lo ha invitato, e quei canali sono l'insieme sbagliato: sono
// quelli dove si è pensato a lui, non quelli dove si lavora. Un token da utente
// vede quello che vede la persona che lo ha creato, che è esattamente il
// recinto giusto — non un permesso in più di quelli che ha già.
//
// **Un documento è un giorno di conversazione, non un messaggio.** Il singolo
// messaggio di Slack è «ok», «arrivo», «👍»: indicizzarlo uno per uno
// riempirebbe la mente di rumore e romperebbe la ricerca, che pesa il titolo e
// la freschezza. Una giornata dentro un canale invece è un'unità che si legge:
// ha un titolo che dice dove, ha le persone dentro, e quando la si ritrova
// cercando si capisce di cosa si stava parlando.

import type { Documento } from '../store.ts'
import { riflua } from '../testo.ts'

export type ConfigSlack = {
  token: string
  /** Come si chiama lo spazio: si mostra, non si usa. */
  squadra?: string
  utente?: string
  /** Quante giornate indietro leggere. */
  giorni?: number
}

const API = 'https://slack.com/api/'

/** Quanti canali guardare, e quanti messaggi tenere per ciascuno. */
const MAX_CANALI = 60
const MAX_PER_CANALE = 400
const MAX_DOCUMENTI = 900

type Risposta = { ok: boolean; error?: string; response_metadata?: { next_cursor?: string } }

/**
 * Una chiamata a Slack, con i suoi due modi di dire di no.
 *
 * Slack risponde quasi sempre 200: il no sta dentro il corpo, in `ok: false`.
 * Chi guarda solo lo stato HTTP legge un fallimento come un successo e va
 * avanti con una lista vuota — che da fuori è indistinguibile da «non c'era
 * niente». I due casi vanno separati qui, dove si sa ancora quale sia quale.
 */
async function api<T>(c: ConfigSlack, metodo: string, q: Record<string, string> = {}): Promise<T & Risposta> {
  const u = new URL(metodo, API)
  for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v)

  const r = await fetch(u, {
    headers: { authorization: `Bearer ${c.token}` },
    signal: AbortSignal.timeout(30_000)
  })

  // 429: Slack dice quanti secondi aspettare, e ha ragione lui
  if (r.status === 429) {
    const aspetta = Math.min(30, Number(r.headers.get('retry-after') ?? 5))
    await new Promise(f => setTimeout(f, aspetta * 1000))
    return api<T>(c, metodo, q)
  }

  const j = await r.json().catch(() => ({ ok: false, error: 'risposta_illeggibile' })) as T & Risposta
  if (!j.ok) throw new Error(spiega(j.error ?? ''))
  return j
}

/** Gli errori di Slack che capitano davvero, detti a chi li subisce. */
function spiega(e: string): string {
  if (e === 'invalid_auth' || e === 'not_authed') return 'Il token di Slack non è valido.'
  if (e === 'token_revoked' || e === 'account_inactive') return 'Il token di Slack è stato revocato: rifallo.'
  if (e === 'missing_scope') return 'A questo token mancano dei permessi: rifai l’installazione dell’app.'
  if (e === 'ratelimited') return 'Slack ha detto di rallentare. Riprovo più tardi.'
  return 'Slack non ha risposto come mi aspettavo.'
}

export function collegato(c?: { slack?: ConfigSlack }): boolean {
  return !!c?.slack?.token
}

export async function prova(c: ConfigSlack): Promise<
  { ok: true; squadra: string; utente: string } | { ok: false; errore: string }
> {
  if (!/^xox[pbe]-/.test(c.token.trim())) {
    return { ok: false, errore: 'Un token di Slack comincia per xoxp- o xoxb-.' }
  }
  try {
    const r = await api<{ team?: string; user?: string }>(c, 'auth.test')
    return { ok: true, squadra: r.team ?? '', utente: r.user ?? '' }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

// — leggere —

type Canale = {
  id: string
  name?: string
  is_im?: boolean
  is_mpim?: boolean
  is_private?: boolean
  is_archived?: boolean
  user?: string
}

type Messaggio = {
  ts: string
  user?: string
  bot_id?: string
  text?: string
  subtype?: string
  thread_ts?: string
}

/**
 * I nomi delle persone, presi una volta sola.
 *
 * Senza, ogni riga di ogni conversazione direbbe `U04J8KQ2M`: illeggibile per
 * chi la ritrova, e — quello che conta di più — invisibile alla ricerca.
 * Cercare «Marta preventivo» non trova niente se nell'indice al posto di Marta
 * c'è un codice.
 */
async function nomi(c: ConfigSlack): Promise<Map<string, string>> {
  const per = new Map<string, string>()
  let cursore: string | undefined
  do {
    const r = await api<{ members?: { id: string; real_name?: string; name?: string; deleted?: boolean }[] }>(
      c, 'users.list', { limit: '200', ...(cursore ? { cursor: cursore } : {}) }
    )
    for (const m of r.members ?? []) per.set(m.id, m.real_name || m.name || m.id)
    cursore = r.response_metadata?.next_cursor || undefined
  } while (cursore && per.size < 3000)
  return per
}

/** Solo quelli di cui fa parte: gli altri non sono suoi, e spesso nemmeno leggibili. */
async function canali(c: ConfigSlack): Promise<Canale[]> {
  const fuori: Canale[] = []
  let cursore: string | undefined
  do {
    const r = await api<{ channels?: Canale[] }>(c, 'users.conversations', {
      types: 'public_channel,private_channel,mpim,im',
      exclude_archived: 'true',
      limit: '200',
      ...(cursore ? { cursor: cursore } : {})
    })
    fuori.push(...(r.channels ?? []).filter(x => !x.is_archived))
    cursore = r.response_metadata?.next_cursor || undefined
  } while (cursore && fuori.length < MAX_CANALI)
  return fuori.slice(0, MAX_CANALI)
}

/** Come si chiama un posto, per chi lo ritrova in un elenco di documenti. */
function comeSiChiama(ch: Canale, chi: Map<string, string>): string {
  if (ch.is_im) return chi.get(ch.user ?? '') ?? 'messaggio diretto'
  if (ch.is_mpim) return ch.name?.replace(/^mpdm-|-1$/g, '').replace(/--/g, ', ') ?? 'gruppo'
  return `#${ch.name ?? ch.id}`
}

/** Il giorno di un messaggio, come chiave e come data. */
function giornoDi(ts: string): { chiave: string; data: Date } {
  const data = new Date(Number(ts.split('.')[0]) * 1000)
  const due = (n: number) => String(n).padStart(2, '0')
  return { chiave: `${data.getFullYear()}-${due(data.getMonth() + 1)}-${due(data.getDate())}`, data }
}

/**
 * Le scritte di Slack, ridotte a testo.
 *
 * `<@U04J8KQ2M>` è un nome, `<https://…|il preventivo>` è un link con la sua
 * etichetta, e `<#C01|generale>` è un canale. Lasciarli così vorrebbe dire
 * indicizzare dei codici al posto delle parole — e il ricordo che serve
 * ritrovare è quasi sempre proprio il nome che sta dentro una di queste
 * parentesi.
 */
export function inChiaro(testo: string, chi: Map<string, string>): string {
  return testo
    .replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id) => chi.get(id) ?? '@qualcuno')
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, (_, n) => `#${n}`)
    .replace(/<(https?:[^|>]+)\|([^>]*)>/g, (_, url, testo) => `${testo} (${url})`)
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/<!here>|<!channel>/g, '@tutti')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export type EsitoSlack = {
  docs: Documento[]
  /** I canali che non si sono lasciati leggere: si dice, non si ingoia. */
  falliti: string[]
  troncato: boolean
}

/**
 * Legge le conversazioni recenti, una giornata per documento.
 *
 * I messaggi di servizio si saltano — «Marta è entrata nel canale» non è una
 * cosa che qualcuno cercherà mai — e le giornate con meno di due righe vere
 * anche: un «ok» da solo non è una conversazione, è un rumore che si prende il
 * posto di qualcosa nell'indice.
 */
export async function sincronizza(
  c: ConfigSlack,
  avanzamento?: (fatti: number, totale: number) => void
): Promise<EsitoSlack> {
  const giorni = Math.min(365, Math.max(1, c.giorni ?? 30))
  const da = (Date.now() - giorni * 86_400_000) / 1000
  const chi = await nomi(c)
  const elenco = await canali(c)
  const docs: Documento[] = []
  const falliti: string[] = []
  let troncato = false
  let fatti = 0

  for (const ch of elenco) {
    if (docs.length >= MAX_DOCUMENTI) { troncato = true; break }
    const dove = comeSiChiama(ch, chi)
    let messaggi: Messaggio[] = []
    try {
      let cursore: string | undefined
      do {
        const r = await api<{ messages?: Messaggio[]; has_more?: boolean }>(c, 'conversations.history', {
          channel: ch.id,
          oldest: String(da),
          limit: '200',
          ...(cursore ? { cursor: cursore } : {})
        })
        messaggi.push(...(r.messages ?? []))
        cursore = r.response_metadata?.next_cursor || undefined
      } while (cursore && messaggi.length < MAX_PER_CANALE)
    } catch {
      // un canale che non si legge non ferma gli altri, ma non sparisce
      // nemmeno in silenzio: chi guarda deve poter sapere che manca
      falliti.push(dove)
      avanzamento?.(++fatti, elenco.length)
      continue
    }

    // una giornata per volta, in ordine di lettura
    const perGiorno = new Map<string, { righe: string[]; chi: Set<string>; data: Date }>()
    for (const m of messaggi.slice().reverse()) {
      // i messaggi di servizio non sono conversazione
      if (m.subtype && m.subtype !== 'thread_broadcast' && m.subtype !== 'bot_message') continue
      const testo = inChiaro((m.text ?? '').trim(), chi)
      if (!testo) continue
      const { chiave, data } = giornoDi(m.ts)
      const g = perGiorno.get(chiave) ?? { righe: [], chi: new Set<string>(), data }
      const autore = m.user ? (chi.get(m.user) ?? 'qualcuno') : 'un’app'
      g.righe.push(`${autore}: ${testo}`)
      if (m.user) g.chi.add(autore)
      perGiorno.set(chiave, g)
    }

    for (const [chiave, g] of perGiorno) {
      // due righe vere: sotto, è un «ok» che non è una conversazione
      if (g.righe.length < 2) continue
      if (docs.length >= MAX_DOCUMENTI) { troncato = true; break }
      docs.push({
        id: `slack:${ch.id}:${chiave}`,
        fonte: 'slack',
        tipo: ch.is_im || ch.is_mpim ? 'messaggi' : 'canale',
        titolo: `${dove} · ${g.data.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`,
        corpo: riflua(g.righe.join('\n')).slice(0, 20_000),
        autore: [...g.chi].slice(0, 4).join(', ') || null,
        percorso: dove,
        // la fine della giornata: è quando quella conversazione è stata chiusa
        quando: new Date(g.data.getFullYear(), g.data.getMonth(), g.data.getDate(), 23, 59).toISOString(),
        gruppo: 'conversazioni'
      })
    }
    avanzamento?.(++fatti, elenco.length)
  }

  return { docs, falliti, troncato }
}
