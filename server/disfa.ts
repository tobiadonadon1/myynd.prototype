// Disfare il lavoro di una notte (F5).
//
// «Everything it did overnight can be undone», detto nella pagina del 28
// settembre. Qui cosa vuol dire, e dove si ferma:
//
//   · il file che Myynd ha scritto nel luogo delle consegne va nel Cestino,
//     non si cancella: si ripesca dal Finder come ogni altra cosa buttata;
//   · una bozza salvata nella sua casella resta lì. Myynd non cancella niente
//     dalla posta di nessuno, nemmeno quello che ha scritto lui: lo si dice, e
//     la si toglie da Drafts con un gesto suo;
//   · la carta torna sua, senza il lavoro (come «Riprendila»).
//
// Un file fuori dai luoghi delle consegne non si tocca mai: se il percorso
// scritto sulla carta non sta dentro uno di quei posti, qualcosa non torna, e
// il file resta dov'è.

import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'
import * as store from './store.ts'
import * as mani from './mani.ts'
import * as compiti from './compiti.ts'

type Ferri = { cestino: () => string }
const VERI: Ferri = { cestino: () => join(homedir(), '.Trash') }
let ferri: Ferri = VERI
/** Solo per le prove: il Cestino in una cartella loro. */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/** Il percorso sta dentro uno dei luoghi delle consegne? */
export function nelLuogoDelleConsegne(percorso: string): boolean {
  const vero = resolve(percorso)
  return mani.LUOGHI.some(l => {
    const cartella = resolve(mani.cartellaDelLuogo(l))
    return vero.startsWith(cartella.endsWith(sep) ? cartella : cartella + sep)
  })
}

/** Un nome libero nel Cestino: «Piano.md», poi «Piano 2.md», come fa il Finder. */
function nomeLibero(cartella: string, nome: string): string {
  if (!existsSync(join(cartella, nome))) return join(cartella, nome)
  const est = extname(nome)
  const base = nome.slice(0, nome.length - est.length)
  for (let i = 2; i < 1000; i++) {
    const p = join(cartella, `${base} ${i}${est}`)
    if (!existsSync(p)) return p
  }
  return join(cartella, `${base} ${Date.now()}${est}`)
}

export type Disfatto = { file: 'cestino' | 'fuori' | null; bozzaResta: boolean }

/**
 * Disfa il lavoro consegnato di una carta: il file nel Cestino, la carta
 * torna sua. Lancia con una frase sua se la carta non ha un lavoro da disfare.
 */
export function disfaLavoro(id: string): Disfatto {
  const c = store.compito(id)
  if (!c) throw new Error('Compito non trovato.')
  if (c.stato !== 'pronto' && c.stato !== 'chiede') throw new Error('Qui non c’è un lavoro da disfare.')
  let file: Disfatto['file'] = null
  const percorso = c.consegna?.app === 'File' ? c.consegna.percorso : null
  if (percorso && existsSync(percorso) && statSync(percorso).isFile()) {
    if (nelLuogoDelleConsegne(percorso)) {
      const cestino = ferri.cestino()
      mkdirSync(cestino, { recursive: true })
      renameSync(percorso, nomeLibero(cestino, basename(percorso)))
      file = 'cestino'
    } else file = 'fuori'
  }
  const bozzaResta = c.email?.casella?.stato === 'salvata'
  store.segnaNelDiario(id, { tipo: 'fermato', dettaglio: file === 'cestino' ? 'disfatto: file nel Cestino' : 'disfatto' })
  compiti.richiama(id)
  return { file, bozzaResta }
}
