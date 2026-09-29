// Disfare il lavoro di una notte (F5), per sette giorni (F9).
//
// «Everything it did overnight can be undone», detto nella pagina del 28
// settembre; e nel rischio: «everything is undoable for seven days». Qui cosa
// vuol dire, e dove si ferma:
//
//   · il file che Myynd ha scritto nel luogo delle consegne va nel Cestino,
//     non si cancella: si ripesca dal Finder come ogni altra cosa buttata.
//     Il file consegnato e ogni file che una mano ha scritto durante il
//     lavoro (il diario della carta li tiene col percorso intero, F9);
//   · una bozza salvata nella sua casella resta lì. Myynd non cancella niente
//     dalla posta di nessuno, nemmeno quello che ha scritto lui: lo si dice, e
//     la si toglie da Drafts con un gesto suo. Lo stesso per una nota in Note;
//   · la carta torna sua, senza il lavoro (come «Riprendila»). Anche una carta
//     già chiusa, fino a sette giorni dopo: poi il lavoro è suo, e non si
//     disfa più da qui.
//
// Un file fuori dai luoghi delle consegne non si tocca mai: se il percorso
// scritto sulla carta non sta dentro uno di quei posti, qualcosa non torna, e
// il file resta dov'è.

import * as store from './store.ts'
import * as compiti from './compiti.ts'
import * as cestino from './cestino.ts'

/** Solo per le prove: il Cestino in una cartella loro. */
export function perProva(f: Parameters<typeof cestino.perProva>[0]) { cestino.perProva(f) }

export const nelLuogoDelleConsegne = cestino.nelLuogoDelleConsegne

/** Per quanti giorni dopo la chiusura il lavoro di Myynd si disfa ancora. */
export const GIORNI_PER_DISFARE = 7
export const TROPPO_TARDI = 'Sono passati più di sette giorni: questo lavoro non si disfa più da qui.'
const NIENTE = 'Qui non c’è un lavoro da disfare.'

export type Disfatto = { file: 'cestino' | 'fuori' | null; bozzaResta: boolean; noteRestano?: true }

/** C'è un lavoro di Myynd su questa carta: consegnato, scritto, o un file lasciato da una mano. */
function haLavoro(c: store.Compito): boolean {
  return !!c.risultato || !!c.consegna || !!c.diario?.some(v => v.tipo === 'consegnato' || v.tipo === 'file')
}

/**
 * Si può disfare adesso? Per una carta pronta o che chiede, sempre; per una
 * chiusa come fatta, se c'è un lavoro di Myynd e non sono passati sette
 * giorni. Torna la frase del perché no, o null se si può.
 */
export function perche(c: store.Compito, adesso = new Date()): string | null {
  if (c.stato === 'pronto' || c.stato === 'chiede') return null
  if (c.stato !== 'fatto' || !haLavoro(c)) return NIENTE
  const chiuso = Date.parse(c.chiuso ?? '')
  if (!Number.isFinite(chiuso) || adesso.getTime() - chiuso > GIORNI_PER_DISFARE * 86_400_000) return TROPPO_TARDI
  return null
}

/**
 * Disfa il lavoro di una carta: i file nel Cestino, la carta torna sua.
 * Lancia con una frase sua se la carta non ha un lavoro da disfare, o se
 * sono passati più di sette giorni da quando l'ha chiusa.
 */
export function disfaLavoro(id: string, adesso = new Date()): Disfatto {
  const c = store.compito(id)
  if (!c) throw new Error('Compito non trovato.')
  const no = perche(c, adesso)
  if (no) throw new Error(no)
  const percorsi = new Set<string>()
  if (c.consegna?.app === 'File' && c.consegna.percorso) percorsi.add(c.consegna.percorso)
  for (const v of c.diario ?? []) if (v.tipo === 'file' && v.dettaglio) percorsi.add(v.dettaglio)
  let buttati = 0, fuori = 0
  for (const p of percorsi) {
    const r = cestino.butta(p)
    if (r === 'cestino') buttati++
    else if (r === 'fuori') fuori++
  }
  const file: Disfatto['file'] = buttati ? 'cestino' : fuori ? 'fuori' : null
  const bozzaResta = c.email?.casella?.stato === 'salvata'
  const noteRestano = !!c.diario?.some(v => v.tipo === 'nota')
  store.segnaNelDiario(id, { tipo: 'fermato', dettaglio: file === 'cestino' ? 'disfatto: file nel Cestino' : 'disfatto' })
  if (c.stato === 'fatto') {
    // chiusa: si riapre sua, senza il lavoro, come fa «richiama» con una pronta
    store.cambiaStatoCompito(id, 'aperto')
    store.sbozzaCompito(id)
    store.riprendiCompito(id)
    compiti.annunciaCambio()
  } else compiti.richiama(id)
  return { file, bozzaResta, ...(noteRestano ? { noteRestano: true as const } : {}) }
}
