// La parte della semina che serve al resoconto (P9).
//
// La chiama `prove/semina.ts` dentro il conto, quando la scena ha «p9», dopo
// le righe e le carte della scena. Scrive quello che una scena normale non
// scrive: il registro delle azioni con le sue ore, le misure del lavoro, il
// punteggio del gemello e le righe di «Come lavori». Tutto a date fisse nel
// passato, così la scena gira con MYYND_ADESSO e nessuna riga è nel futuro.
//
// «p9» (tutto facoltativo; i tempi come ISO o «-3h», «-2d»):
//   config     unita alla configurazione ({ "fuso": "Europe/Rome" })
//   compiti    [{ id, stato?, origine?, voce?, madre?, doc?, chiesto?, chiuso?, esito?, sparito?, creato?, consegna?, email?, mandata? }]
//   feed       [{ id, stato?, ragione?, motivo?, vista?, risposto?, urgenza?, quando? }]
//   azioni     [{ id?, tipo, cosa?, verso?, compito?, esito?, dettaglio?, quando }]
//   misure     [{ compito, consegnato?, via?, distanza?, classe?, affidato? }]
//   punteggi   [{ giorno, giuste, sbagliate, base }]
//   abitudini  [{ chiave, genere, dati, stato?, testoSuo?, visto }]

import { join } from 'node:path'

const SERVER = new URL('../server/', import.meta.url).pathname
const cfg = await import(join(SERVER, 'config.ts'))
const store = await import(join(SERVER, 'store.ts'))
const db = store.default

type Riga = Record<string, unknown>
export type P9 = { config?: Riga; compiti?: Riga[]; feed?: Riga[]; azioni?: Riga[]; misure?: Riga[]; punteggi?: Riga[]; abitudini?: Riga[] }

const COMPITI = ['stato', 'origine', 'voce', 'madre', 'doc', 'chiesto', 'chiuso', 'esito', 'sparito', 'creato', 'consegna', 'email', 'mandata', 'risultato']
const FEED = ['stato', 'ragione', 'motivo', 'vista', 'risposto', 'urgenza', 'quando']
const TEMPI = new Set(['chiesto', 'chiuso', 'sparito', 'creato', 'vista', 'risposto', 'quando', 'consegnato', 'affidato'])

/** «-26h», «-6d», «-15m», o una data: un istante ISO. */
function tempo(v: unknown): string {
  const s = String(v)
  const m = s.match(/^([+-])(\d+(?:\.\d+)?)([mhd])$/)
  if (!m) {
    const d = new Date(s)
    if (!Number.isFinite(d.getTime())) throw new Error(`semina-p9 · tempo che non capisco: ${s}`)
    return d.toISOString()
  }
  const ms = Number(m[2]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 } as Record<string, number>)[m[3]!]!
  return new Date(Date.now() + (m[1] === '-' ? -ms : ms)).toISOString()
}

function valore(k: string, v: unknown, casa: string): string | number | null {
  if (v === null || v === undefined) return null
  if (TEMPI.has(k)) return tempo(v)
  if (k === 'mandata' && typeof v === 'object') return JSON.stringify({ ...(v as Riga), quando: tempo((v as Riga).quando) })
  if (k === 'consegna' && typeof v === 'object') {
    const c = { ...(v as Riga) }
    for (const x of ['percorso', 'desktop']) if (typeof c[x] === 'string' && (c[x] as string).startsWith('~/')) c[x] = join(casa, (c[x] as string).slice(2))
    return JSON.stringify(c)
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return v as string | number
}

function aggiorna(tabella: 'compiti' | 'feed', ammesse: string[], r: Riga, casa: string) {
  const id = String(r.id ?? '')
  if (!id) throw new Error(`semina-p9 · una riga di ${tabella} senza id`)
  for (const [k, v] of Object.entries(r)) {
    if (k === 'id') continue
    if (!ammesse.includes(k)) throw new Error(`semina-p9 · ${tabella}.${k} non si semina`)
    const esito = db.prepare(`UPDATE ${tabella} SET ${k} = ? WHERE id = ?`).run(valore(k, v, casa), id)
    if (!esito.changes) throw new Error(`semina-p9 · ${tabella} ${id} non c'è: va prima nella scena`)
  }
}

export function semina(p9: P9, { casa }: { casa: string }) {
  if (p9.config) cfg.aggiorna(p9.config)
  for (const c of p9.compiti ?? []) aggiorna('compiti', COMPITI, c, casa)
  for (const f of p9.feed ?? []) aggiorna('feed', FEED, f, casa)
  let n = 0
  const insAzione = db.prepare('INSERT INTO azioni (id, tipo, verso, cosa, compito, esito, dettaglio, quando) VALUES (?,?,?,?,?,?,?,?)')
  for (const a of p9.azioni ?? []) {
    for (const k of Object.keys(a)) if (!['id', 'tipo', 'cosa', 'verso', 'compito', 'esito', 'dettaglio', 'quando'].includes(k)) throw new Error(`semina-p9 · azioni.${k} non si semina`)
    insAzione.run(String(a.id ?? `p9-az-${++n}`), String(a.tipo), (a.verso as string) ?? null, String(a.cosa ?? ''), (a.compito as string) ?? null,
      String(a.esito ?? 'fatta'), a.dettaglio === undefined ? null : typeof a.dettaglio === 'string' ? a.dettaglio : JSON.stringify(a.dettaglio), tempo(a.quando))
  }
  for (const m of p9.misure ?? []) {
    for (const k of Object.keys(m)) if (!['compito', 'consegnato', 'via', 'distanza', 'classe', 'affidato'].includes(k)) throw new Error(`semina-p9 · misure.${k} non si semina`)
    db.prepare('INSERT OR REPLACE INTO misure_compiti (compito, affidato, consegnato, via, distanza, classe) VALUES (?,?,?,?,?,?)').run(
      String(m.compito), tempo(m.affidato ?? m.consegnato ?? '-30d'), m.consegnato ? tempo(m.consegnato) : null, (m.via as string) ?? null,
      typeof m.distanza === 'number' ? m.distanza : null, (m.classe as string) ?? null)
  }
  for (const p of p9.punteggi ?? []) {
    db.prepare("INSERT OR REPLACE INTO punteggi (giorno, giuste, sbagliate, annullate, base, calcolato) VALUES (?,?,?,0,?,?)").run(
      String(p.giorno), Number(p.giuste), Number(p.sbagliate), p.base === null ? null : Number(p.base), new Date().toISOString())
  }
  for (const a of p9.abitudini ?? []) {
    const visto = tempo(a.visto)
    db.prepare('INSERT OR REPLACE INTO abitudini (chiave, genere, dati, prova, fiducia, stato, testoSuo, visto, aggiornato, tolta) VALUES (?,?,?,?,?,?,?,?,?,NULL)').run(
      String(a.chiave), String(a.genere), JSON.stringify(a.dati ?? {}), '[]', 0.8, String(a.stato ?? 'osservata'), (a.testoSuo as string) ?? null, visto, visto)
  }
  console.log(`semina · p9: ${p9.compiti?.length ?? 0} righe, ${p9.azioni?.length ?? 0} azioni, ${p9.misure?.length ?? 0} misure, ${p9.punteggi?.length ?? 0} giorni, ${p9.abitudini?.length ?? 0} abitudini`)
}
