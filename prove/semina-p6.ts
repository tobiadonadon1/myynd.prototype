// La parte della semina che serve alla prova delle automazioni (P6).
//
// La chiama `prove/semina.ts` dentro il conto, quando la scena ha «p6». Scrive
// con i moduli veri: le ricette, il loro stato (il vassoio aperto, finito, o
// mai), i risultati che aspettano nel vassoio, le risposte già mandate, e un
// suggerimento con la sua prova d'idea passata sotto la sua impronta vera.
//
// «p6» (tutto facoltativo):
//   config       unita alla configurazione (cfg.aggiorna): la posta finta su 127.0.0.1
//   ricette      [{ ...ricetta, accesa?: boolean }]: automazioni.scrivi, poi accesa o in pausa
//   stati        [{ id, vassoio: "+8d" | "1970" | null, ultima?: "-2h", quante? }]
//   vassoio      [{ automazione, testo, doc, stato, bozza?, quando }]: risultati nel vassoio
//   inviati      [id]: documenti mandati da lui (inviato = 1)
//   suggerimento { ...Suggerimento, giusti?, giudicati? }: nel foglio delle scoperte, già provato e passato

import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

const SERVER = new URL('../server/', import.meta.url).pathname
const cfg = await import(join(SERVER, 'config.ts'))
const store = await import(join(SERVER, 'store.ts'))
const auto = await import(join(SERVER, 'automazioni.ts'))
const verso = await import(join(SERVER, 'verso.ts'))
const scoperte = await import(join(SERVER, 'scoperte.ts'))

type P6 = {
  config?: Record<string, unknown>
  ricette?: (Record<string, unknown> & { id: string; accesa?: boolean })[]
  stati?: { id: string; vassoio?: string | null; ultima?: string; quante?: number }[]
  vassoio?: { automazione: string; testo: string; doc: string; stato: string; bozza?: string; quando?: string }[]
  inviati?: string[]
  suggerimento?: Record<string, unknown> & { id: string; giusti?: number; giudicati?: number; prove?: string[] }
}

function tempo(v: unknown): string {
  if (typeof v !== 'string' || !v || v === 'adesso') return new Date().toISOString()
  if (v === '1970') return '1970-01-01T00:00:00.000Z'
  const m = v.match(/^([+-])(\d+(?:\.\d+)?)([mhd])$/)
  if (!m) return new Date(v).toISOString()
  const ms = Number(m[2]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 } as Record<string, number>)[m[3]]
  return new Date(Date.now() + (m[1] === '-' ? -ms : ms)).toISOString()
}

export function semina(p6: P6, _o: { dati?: string } = {}) {
  if (p6.config) cfg.aggiorna(p6.config)
  for (const id of p6.inviati ?? []) store.default.prepare('UPDATE documenti SET inviato = 1 WHERE id = ?').run(id)
  for (const r of p6.ricette ?? []) {
    const { accesa, ...ricetta } = r
    auto.scrivi(ricetta)
    store.accendiAutomazione(ricetta.id, !!accesa)
  }
  for (const s of p6.stati ?? []) {
    store.vediAutomazione(s.id)
    store.default.prepare('UPDATE automazioni SET vassoio = ?, ultima = COALESCE(?, ultima), vista = COALESCE(?, vista), quante = COALESCE(?, quante) WHERE id = ?')
      .run(s.vassoio === null || s.vassoio === undefined ? null : tempo(s.vassoio), s.ultima ? tempo(s.ultima) : null, s.ultima ? tempo(s.ultima) : null, s.quante ?? null, s.id)
  }
  for (const [i, e] of (p6.vassoio ?? []).entries()) {
    const quando = tempo(e.quando)
    store.scriviEsito({
      id: `vassoio-${i}`, prova: verso.provaDelVassoio(e.automazione), automazione: e.automazione, tipo: 'riga', stato: e.stato,
      quando, creato: quando, testo: e.testo, doc: e.doc, docs: JSON.stringify({ ids: [e.doc], nuovi: [e.doc], anche: [] }),
      inLista: 'settimana', modo: 'bozza', attrezzi: JSON.stringify({ nomi: ['posta.leggi'], origine: 'automazione' }),
      nota: `Da guardare:\n— [${e.doc}] ${store.documento(e.doc)?.titolo ?? ''}`,
      ...(e.bozza ? { bozza: e.bozza, revisione: JSON.stringify({ esito: 'pass', problemi: [], giri: 1, ipotesi: [], domanda: null, parziale: [] }) } : {})
    })
  }
  if (p6.suggerimento) {
    const { giusti = 9, giudicati = 10, ...s } = p6.suggerimento
    const sugg = s as unknown as Parameters<typeof scoperte.improntaDi>[0]
    const imp = scoperte.improntaDi(sugg)
    const prova = `pidea-${imp.slice(0, 8)}`
    store.nuovaProva({ id: prova, automazione: `idea:${imp}`, tipo: 'prova', origine: 'suggerimento', stato: 'finita', impronta: imp, finita: new Date().toISOString() })
    const docs = s.prove ?? []
    for (let i = 0; i < giudicati; i++) {
      const d = docs[i % Math.max(1, docs.length)] ?? `posta:idea-${i}`
      store.scriviEsito({
        id: `eidea-${i}`, prova, automazione: `idea:${imp}`, tipo: 'riga', stato: 'senza bozza', quando: tempo(`-${20 - i}d`),
        testo: String(s.nome ?? ''), doc: d, docs: JSON.stringify({ ids: [d], nuovi: [d], anche: [] }),
        giudizio: JSON.stringify({ [d]: { giusta: i < giusti, perche: i < giusti ? 'An unpaid invoice.' : 'Already paid.' } })
      })
    }
    scoperte.provata(imp, { id: prova, stato: 'finita', esito: 'pronta', giusti, giudicati, tue: 0, documenti: 0, risultati: giudicati, bozze: 0, al: null, cambiata: false, parziale: [], davanti: null })
    const archivio = join(cfg.cartella(), 'scoperte.json')
    let letto: Record<string, unknown> = {}
    try { letto = JSON.parse(readFileSync(archivio, 'utf8')) } catch { /* ancora nessun foglio */ }
    writeFileSync(archivio, JSON.stringify({
      ...letto, quando: new Date().toISOString(), lingua: cfg.leggi().lingua ?? 'en', contesto: scoperte.contestoAttuale(),
      suggerimenti: [s], visti: []
    }, null, 2), { mode: 0o600 })
  }
}

