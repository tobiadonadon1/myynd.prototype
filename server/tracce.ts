// La traccia di un lavoro: da quando parte la carta a cosa ne ha fatto lei.
//
// Una riga per ogni partenza di una carta. Dice da cosa è partito il lavoro
// (le prove: documenti, fonti), dove è finito (`uscita`: il file, la bozza
// nella casella, la pagina di Notion, la proposta), cosa ne ha fatto lei
// (accettato, modificato, scartato, o scaduto senza una decisione), quanto ci
// ha messo a deciderlo da quando l'ha visto, e quanto è costato (dal registro
// dell'uso, per carta).
//
// Da qui esce il numero solo: in questa settimana, quante cose consegnate ha
// preso (com'erano o ritoccate), su quante decise, e quanto è costata ognuna.
// «This week: 4 accepted · $0.62».
//
// La ricevuta dice com'è finita la partenza, anche quando non c'è niente da
// decidere: `fatto` (consegnato), `in_attesa_del_mac` (serve il Mac, e non
// c'è), `saltato` (la fonte non reggeva più), `trattenuto` (il mandato o il
// budget l'hanno fermato, col motivo), `niente_da_fare`.
//
// `candidato` è per la coda dei candidati che verrà: qui resta null.
// Non lancia mai verso chi la chiama: la traccia racconta il lavoro, non lo regge.

import { randomUUID } from 'node:crypto'
import db from './store.ts'
import * as chi from './chi.ts'
import { classe as classeRitocco } from './ritocco.ts'

export type Esito = 'in_attesa' | 'accettato' | 'modificato' | 'scartato' | 'scaduto'
export type Ricevuta = 'fatto' | 'in_attesa_del_mac' | 'saltato' | 'trattenuto' | 'niente_da_fare'
export const RICEVUTE: readonly Ricevuta[] = ['fatto', 'in_attesa_del_mac', 'saltato', 'trattenuto', 'niente_da_fare']

export type Traccia = {
  id: string
  utente: string | null
  progetto: string | null
  candidato: string | null
  compito: string
  genere: string | null
  prove: string[]
  creata: string
  consegnata: string | null
  uscita: string | null
  esito: Esito
  distanza: number | null
  mostrata: string | null
  decisa: string | null
  secondi: number | null
  /** Dollari spesi dalla carta, dal registro dell'uso. */
  costo: number | null
  ricevuta: Ricevuta | null
  motivo: string | null
}

/** Dopo quanti giorni una consegna senza decisione è scaduta. */
export const GIORNI_PER_DECIDERE = 7

type Riga = Omit<Traccia, 'prove' | 'esito' | 'ricevuta'> & { prove: string | null; esito: string; ricevuta: string | null }

function daRiga(r: Riga): Traccia {
  let prove: string[] = []
  try { const x = r.prove ? JSON.parse(r.prove) : []; if (Array.isArray(x)) prove = x.filter((s): s is string => typeof s === 'string') } catch { /* nessuna */ }
  return { ...r, prove, esito: r.esito as Esito, ricevuta: (r.ricevuta as Ricevuta | null) ?? null }
}

const prova = <T>(fai: () => T, altrimenti: T): T => {
  try { return fai() } catch (e) { console.warn('myynd · traccia:', e instanceof Error ? e.message : e); return altrimenti }
}

/**
 * I dollari spesi da questa partenza: le chiamate della carta da quando la
 * traccia è nata (`da`). Non il conto di tutta la vita della carta: una carta
 * ripartita tre volte non porta tre volte il costo della prima.
 */
function costoDi(compito: string, da: string): number | null {
  const r = db.prepare('SELECT COUNT(costo) AS n, COALESCE(SUM(costo), 0) AS c FROM uso WHERE compito = ? AND quando >= ?').get(compito, da) as { n: number; c: number }
  return r.n ? r.c / 1_000_000 : null
}

/** L'ultima traccia di una carta: quella della partenza più recente. */
export function ultimaDi(compito: string): Traccia | null {
  return prova(() => {
    const r = db.prepare('SELECT * FROM tracce WHERE compito = ? ORDER BY creata DESC, rowid DESC LIMIT 1').get(compito) as Riga | undefined
    return r ? daRiga(r) : null
  }, null)
}

/** Una carta parte: nasce la sua traccia. */
export function inizia(o: { compito: string; progetto?: string | null; genere?: string | null; prove?: readonly (string | null | undefined)[]; candidato?: string | null }): Traccia | null {
  return prova(() => {
    const id = 'tr-' + randomUUID()
    const prove = [...new Set((o.prove ?? []).filter((x): x is string => !!x))].slice(0, 40)
    db.prepare(`INSERT INTO tracce (id, utente, progetto, candidato, compito, genere, prove, creata, esito) VALUES (?,?,?,?,?,?,?,?, 'in_attesa')`)
      .run(id, chi.adesso() ?? '', o.progetto ?? null, o.candidato ?? null, o.compito, o.genere ?? null, JSON.stringify(prove), new Date().toISOString())
    return ultimaDi(o.compito)
  }, null)
}

/** La carta è consegnata: quando, dove, e le prove che ha letto. Una traccia trattenuta resta trattenuta. */
export function consegnata(compito: string, o: { uscita?: string | null; prove?: readonly (string | null | undefined)[] } = {}) {
  prova(() => {
    const t = ultimaDi(compito) ?? inizia({ compito })
    if (!t) return
    const prove = [...new Set([...t.prove, ...(o.prove ?? []).filter((x): x is string => !!x)])].slice(0, 40)
    db.prepare(`UPDATE tracce SET consegnata = ?, uscita = COALESCE(?, uscita), prove = ?, costo = ?,
      ricevuta = CASE WHEN ricevuta = 'trattenuto' THEN ricevuta ELSE 'fatto' END WHERE id = ?`)
      .run(new Date().toISOString(), o.uscita ?? null, JSON.stringify(prove), costoDi(compito, t.creata), t.id)
  }, undefined)
}

/** Dove è finito il lavoro, scritto dopo (la bozza nella casella arriva dopo il «pronto»). */
export function uscita(compito: string, ref: string) {
  prova(() => {
    const t = ultimaDi(compito)
    if (t && ref) db.prepare('UPDATE tracce SET uscita = ? WHERE id = ?').run(ref.slice(0, 2000), t.id)
  }, undefined)
}

/** Com'è finita la partenza, col motivo se c'è. */
export function ricevuta(compito: string, stato: Ricevuta, motivo?: string | null) {
  prova(() => {
    const t = ultimaDi(compito) ?? inizia({ compito })
    if (t) db.prepare('UPDATE tracce SET ricevuta = ?, motivo = ?, costo = ? WHERE id = ?').run(stato, motivo?.slice(0, 300) ?? null, costoDi(compito, t.creata), t.id)
  }, undefined)
}

/** Lei l'ha vista per la prima volta: da qui si contano i secondi della decisione. Solo consegnate. */
export function mostrata(compiti: readonly string[], adesso = new Date()) {
  prova(() => {
    for (const c of compiti.slice(0, 200)) {
      const t = ultimaDi(c)
      if (t && t.consegnata && !t.mostrata) db.prepare('UPDATE tracce SET mostrata = ? WHERE id = ?').run(adesso.toISOString(), t.id)
    }
  }, undefined)
}

/**
 * Cosa ne ha fatto lei. Vale la prima decisione: un «Fatto» dopo che la
 * bozza è già partita dalla casella non la riscrive. Una consegna scaduta
 * che poi decide sì, invece, si prende la decisione vera.
 */
export function decidi(compito: string, esito: 'accettato' | 'modificato' | 'scartato', o: { distanza?: number | null; adesso?: Date } = {}): Traccia | null {
  return prova(() => {
    const t = ultimaDi(compito)
    if (!t || (t.esito !== 'in_attesa' && t.esito !== 'scaduto')) return t
    const adesso = o.adesso ?? new Date()
    const secondi = t.mostrata ? Math.max(0, Math.round((adesso.getTime() - Date.parse(t.mostrata)) / 1000)) : null
    db.prepare('UPDATE tracce SET esito = ?, distanza = ?, decisa = ?, secondi = ?, costo = ? WHERE id = ?')
      .run(esito, o.distanza ?? null, adesso.toISOString(), secondi, costoDi(compito, t.creata), t.id)
    return ultimaDi(compito)
  }, null)
}

/** Da una distanza di ritocco (`ritocco.ts`): identico o ritoccato è accettato, il resto modificato. */
export function esitoDallaDistanza(r: number): 'accettato' | 'modificato' {
  const c = classeRitocco(r)
  return c === 'identico' || c === 'ritocco' ? 'accettato' : 'modificato'
}

/** Le consegne senza decisione da più di `GIORNI_PER_DECIDERE`: scadute. Torna quante. */
export function scadi(adesso = new Date(), giorni = GIORNI_PER_DECIDERE): number {
  return prova(() => {
    const limite = new Date(adesso.getTime() - giorni * 86_400_000).toISOString()
    return Number(db.prepare(`UPDATE tracce SET esito = 'scaduto' WHERE esito = 'in_attesa' AND consegnata IS NOT NULL AND consegnata < ?`).run(limite).changes)
  }, 0)
}

// — il numero —

export type Settimana = {
  /** Da quando conta: lunedì alle zero, ora locale. */
  dal: string
  consegnate: number
  accettate: number
  modificate: number
  scartate: number
  scadute: number
  inAttesa: number
  /** (accettate + modificate) / decise, o null se niente è stato deciso. */
  tasso: number | null
  /** Dollari spesi dalle carte partite questa settimana. */
  costo: number
  /** costo / (accettate + modificate), o null. */
  costoPerAccettata: number | null
  tracce: Traccia[]
}

export function inizioSettimana(adesso = new Date()): Date {
  const d = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** Il numero della settimana. Prima segna come scadute le consegne lasciate lì troppo a lungo. */
export function settimana(adesso = new Date()): Settimana {
  scadi(adesso)
  const dal = inizioSettimana(adesso).toISOString()
  const righe = prova(() => (db.prepare('SELECT * FROM tracce WHERE creata >= ? OR consegnata >= ? OR decisa >= ? ORDER BY creata DESC, rowid DESC LIMIT 500')
    .all(dal, dal, dal) as Riga[]).map(daRiga), [] as Traccia[])
  // una carta può partire più volte: conta l'ultima partenza
  const viste = new Set<string>()
  const tracce = righe.filter(t => !viste.has(t.compito) && !!viste.add(t.compito))
  const conta = (e: Esito) => tracce.filter(t => t.consegnata && t.esito === e).length
  const accettate = conta('accettato'), modificate = conta('modificato'), scartate = conta('scartato'), scadute = conta('scaduto')
  const decise = accettate + modificate + scartate + scadute
  /*
   * Il costo della settimana: per ogni traccia, quello che la sua partenza ha
   * speso da questa settimana in qua. Una carta che lavora da mesi non porta
   * qui il conto di tutta la sua vita.
   */
  const costi = new Map<string, number>()
  for (const t of tracce) costi.set(t.id, costoDi(t.compito, t.creata > dal ? t.creata : dal) ?? 0)
  const costo = [...costi.values()].reduce((s, c) => s + c, 0)
  const prese = accettate + modificate
  return {
    dal, consegnate: tracce.filter(t => t.consegnata).length, accettate, modificate, scartate, scadute,
    inAttesa: conta('in_attesa'), tasso: decise ? prese / decise : null,
    costo: Math.round(costo * 10_000) / 10_000, costoPerAccettata: prese ? Math.round((costo / prese) * 10_000) / 10_000 : null,
    tracce: tracce.map(t => ({ ...t, costo: costoDi(t.compito, t.creata) ?? t.costo }))
  }
}
