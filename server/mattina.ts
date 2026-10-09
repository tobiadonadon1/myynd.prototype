// La ricevuta della mattina: cosa è stato fatto, e cosa aspetta lui.
//
// La prima pagina aveva tre carte che rispondevano a pezzi della stessa
// domanda: «Il punto di oggi», «Mentre dormivi» dentro il punto, e la fascia
// scura «Myynd ti ha scritto». Tre titoli, tre bottoni, e per sapere cosa era
// successo bisognava aprirle tutte. Qui c'è una ricevuta sola, in un posto:
//
// — `done`: quello che è stato consegnato da allora. Un file salvato, una
//   bozza messa nella sua casella, una carta che il turno ha finito. Ognuna
//   con il titolo, dove sta, e la carta che la apre.
// — `needsYou`: quello che aspetta lui adesso, al massimo cinque, il più
//   importante prima. Le carte ferme su una domanda o su un blocco, quelle da
//   approvare, e le domande di Myynd.
// — `week`: le bozze partite questa settimana, così com'erano o ritoccate.
//   È il numero che dice se fidarsi: lo scrivono già `invii-osservati.ts` e
//   «Manda» nelle misure, qui si conta e basta.
//
// «Da allora» è la notte, la mattina; il resto del giorno è da quando se n'è
// andato, che lo sa solo la finestra e lo manda lei. La parte che decide è
// `componi`, pura e provata da sola; `mattina` legge e la chiama.

import * as store from './store.ts'
import * as lavoroDati from './lavoro-dati.ts'
import * as turno from './turno.ts'
import * as regole from './turno-regole.ts'
import * as riferimento from './riferimento.ts'
import { BLOCCHI, MANCA_UN_DATO } from './domanda-sola.ts'
import { settimana, adesso as oraDelResoconto } from './resoconto.ts'
import { iniziativeProgetti } from './attenzione.ts'

/** Per quante ore, dopo la fine della notte, il titolo è «mentre dormivi». */
export const ORE_DI_MATTINA = 6
/** Le cose che aspettano lui, in tutto: la ricevuta si legge in dieci secondi. */
export const ASPETTANO_MAX = 5
/** Le cose fatte che si portano: il foglio le mostra tutte, la carta le prime. */
export const FATTE_MAX = 20
/** Quanto indietro può andare «da quando te ne sei andato»: oltre, vale l'inizio della giornata. */
const DAL_MAX = 36 * 3_600_000

/** Dove sta una cosa fatta: un file, la sua casella, o la carta stessa. */
export type Dove =
  | { genere: 'file'; nome: string; percorso: string | null; luogo: string | null }
  | { genere: 'casella' }
  | { genere: 'carta' }

export type Fatta = {
  /** L'id della carta: aprirla apre il lavoro, il file o la bozza. */
  id: string
  titolo: string
  dove: Dove
  quando: string
  /** Fatta dal turno di notte. */
  notte: boolean
}

export type Aspetta =
  | { genere: 'carta'; id: string; titolo: string; perche: string; motivo: 'domanda' | 'blocco' | 'approva' }
  | { genere: 'domanda'; id: string; titolo: string }
  | { genere: 'iniziativa'; id: string; titolo: string; progetto: string }

export type Settimana = { mandate: number; comeEra: number; ritoccate: number }

/** La prossima cosa che farà, per una ricevuta senza niente da dire. */
export type Prossima = { genere: 'notte'; quando: string; carte: number } | { genere: 'coda'; carte: number } | null

export type Mattina = {
  /** Vero nelle ore dopo la notte: «Done while you slept». Altrimenti «Since you left». */
  mattina: boolean
  /** Da quando si conta `done`. */
  dal: string
  done: Fatta[]
  needsYou: Aspetta[]
  week: Settimana
  prossima: Prossima
}

/** Quello che `componi` legge: righe già prese, niente database. */
export type Materiale = {
  compiti: store.Compito[]
  /** compito → quando è stato consegnato, dalle misure. */
  consegnati: Map<string, string>
  domanda: { id: string; testo: string } | null
  iniziative: { id: string; title: string; question?: string; projectId: string }[]
  /** Gli invii di questa settimana, dalle misure: la classe del ritocco. */
  invii: { via: string | null; classe: string | null }[]
  turno: { inCoda: number; prossimaNotte: string | null; acceso: boolean; motore: boolean; fermo?: boolean }
}

const titoloDi = (c: store.Compito) => (c.titolo || c.testo).trim()

/** Una carta ferma su una fonte che manca o su un dato che nessuna fonte aveva: le stesse frasi di `blocchi-feed.fermaDi`. */
const ferma = (c: store.Compito) => !!c.guaio && (Object.values(BLOCCHI).includes(c.guaio) || c.guaio === MANCA_UN_DATO)

/** Dove è finito il lavoro di una carta, se è finito da qualche parte. */
function doveDi(c: store.Compito): Dove | null {
  if (c.consegna) return { genere: 'file', nome: c.consegna.titolo, percorso: c.consegna.desktop ?? c.consegna.percorso ?? null, luogo: c.consegna.dove ?? null }
  if (c.email?.casella?.stato === 'salvata') return { genere: 'casella' }
  return null
}

/** La prima domanda che una carta fa: quella scelta, o l'ultima riga con il punto di domanda. */
function domandaDi(c: store.Compito): string {
  const q = c.chieste?.[0]?.domanda?.trim()
  if (q) return q
  const righe = (c.risultato ?? '').split('\n').map(r => r.trim()).filter(Boolean)
  return righe.find(r => r.endsWith('?')) ?? ''
}

/**
 * La ricevuta, da righe già lette.
 *
 * Una carta finisce al più in una delle due liste: consegnata e non bocciata
 * dalla sua prova è fatta; ferma, con una domanda, o pronta senza essere
 * andata da nessuna parte, aspetta lui. Le fatte contano da `dal`; quelle che
 * aspettano no, perché aspettano adesso, da qualunque ora vengano.
 */
export function componi(m: Materiale, o: { dal: string; mattina: boolean }): Mattina {
  const dal = Date.parse(o.dal)
  const done: Fatta[] = []
  const carte: { a: Aspetta & { genere: 'carta' }; rango: number; quando: string }[] = []
  for (const c of m.compiti) {
    if (c.sparito || c.esito === 'lasciato' || c.stato === 'lasciato') continue
    const notte = !!c.turno?.notte && !!c.turno.ultimo && Date.parse(c.turno.ultimo) >= dal
    const bocciata = c.prova?.esito === 'fail'
    const dove = doveDi(c)
    const quando = m.consegnati.get(c.id) ?? c.turno?.ultimo ?? c.chiuso ?? c.aggiornato
    const consegnata = (c.stato === 'pronto' || c.stato === 'fatto') && !bocciata
    if (consegnata && (dove || notte) && Date.parse(quando) >= dal) {
      done.push({ id: c.id, titolo: titoloDi(c), dove: dove ?? { genere: 'carta' }, quando, notte })
      continue
    }
    if (c.stato === 'chiede') carte.push({ a: { genere: 'carta', id: c.id, titolo: titoloDi(c), perche: domandaDi(c), motivo: 'domanda' }, rango: 0, quando: c.aggiornato })
    else if (c.stato === 'aperto' && ferma(c)) carte.push({ a: { genere: 'carta', id: c.id, titolo: titoloDi(c), perche: c.guaio ?? '', motivo: 'blocco' }, rango: 1, quando: c.aggiornato })
    else if (c.stato === 'pronto' && bocciata) carte.push({ a: { genere: 'carta', id: c.id, titolo: titoloDi(c), perche: domandaDi(c) || c.prova?.perche || '', motivo: 'blocco' }, rango: 1, quando: c.aggiornato })
    // pronta, e non ancora partita né salvata da nessuna parte: si approva lei
    else if (c.stato === 'pronto' && c.modo !== 'io') carte.push({ a: { genere: 'carta', id: c.id, titolo: titoloDi(c), perche: '', motivo: 'approva' }, rango: 2, quando: c.aggiornato })
  }
  done.sort((a, b) => b.quando.localeCompare(a.quando))
  carte.sort((a, b) => a.rango - b.rango || b.quando.localeCompare(a.quando))

  const needsYou: Aspetta[] = carte.map(x => x.a)
  if (m.domanda) needsYou.push({ genere: 'domanda', id: m.domanda.id, titolo: m.domanda.testo })
  for (const i of m.iniziative) needsYou.push({ genere: 'iniziativa', id: i.id, titolo: (i.question || i.title).trim(), progetto: i.projectId })

  /*
   * La settimana: le bozze partite, da «Manda» o dalla sua posta. «Propria»
   * non è una bozza partita, è una mail sua scritta da capo: non si conta.
   */
  const partite = m.invii.filter(i => i.via === 'smtp' || i.via === 'casella')
  const week: Settimana = {
    mandate: partite.length,
    comeEra: partite.filter(i => i.classe === 'identico').length,
    ritoccate: partite.filter(i => i.classe !== 'identico').length
  }

  /*
   * La prossima cosa che farà: la notte, con le carte che ha in coda (anche
   * nessuna: stanotte lavora su quello che gli si affida), o la coda adesso,
   * se è già notte. Spento, fermato o senza un motore non promette niente.
   */
  const t = m.turno
  const prossima: Prossima = !t.acceso || !t.motore || t.fermo ? null
    : t.prossimaNotte ? { genere: 'notte', quando: t.prossimaNotte, carte: t.inCoda }
    : t.inCoda > 0 ? { genere: 'coda', carte: t.inCoda } : null

  return { mattina: o.mattina, dal: o.dal, done: done.slice(0, FATTE_MAX), needsYou: needsYou.slice(0, ASPETTANO_MAX), week, prossima }
}

/**
 * Da quando si conta, e se è mattina.
 *
 * Mattina sono le ore subito dopo la notte del turno: allora si conta dalla
 * notte, che è quando ha smesso di guardare. Il resto del giorno si conta da
 * quando se n'è andato (`chiesto`, dalla finestra), mai più indietro di un
 * giorno e mezzo e mai nel futuro; senza, dall'inizio della giornata.
 */
export function finestra(adesso: Date, notte: regole.Finestra, chiesto: string | null | undefined): { dal: string; mattina: boolean } {
  const giornata = regole.inizioGiornata(adesso, notte)
  const mattina = !regole.inNotte(adesso, notte) && adesso.getTime() - giornata.getTime() < ORE_DI_MATTINA * 3_600_000
  if (mattina) return { dal: regole.inizioUltimaNotte(adesso, notte).toISOString(), mattina }
  const t = chiesto ? Date.parse(chiesto) : NaN
  const ok = Number.isFinite(t) && t <= adesso.getTime() && adesso.getTime() - t <= DAL_MAX
  return { dal: ok ? new Date(t).toISOString() : giornata.toISOString(), mattina }
}

/** La ricevuta di chi chiede, letta adesso. */
export function mattina(chiesto?: string | null, adesso = oraDelResoconto()): Mattina {
  const s = turno.stato(adesso)
  const f = finestra(adesso, s.notte, chiesto)
  const compiti = [...store.elencoCompiti(), ...store.compitiChiusi(60).filter(c => (c.chiuso ?? '') >= f.dal)]
  const consegnati = new Map<string, string>()
  for (const x of lavoroDati.misureDal(f.dal)) if (x.consegnato) consegnati.set(x.compito, x.consegnato)
  const sett = settimana(adesso, 'questa')
  const invii = lavoroDati.misureDal(sett.da).filter(x => !!x.inviato && x.inviato >= sett.da).map(x => ({ via: x.via, classe: x.classe }))
  const d = riferimento.aggiornata(store.domandaAperta())
  let iniziative: Materiale['iniziative'] = []
  try { iniziative = iniziativeProgetti() } catch { /* senza progetti, nessuna domanda sui progetti */ }
  return componi({
    compiti, consegnati, invii, iniziative,
    domanda: d ? { id: d.id, testo: d.testo } : null,
    turno: { inCoda: s.inCoda, prossimaNotte: s.prossimaNotte, acceso: s.acceso, motore: s.motore, fermo: !!s.fermo }
  }, f)
}
