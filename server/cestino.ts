// Il Cestino, per i file che Myynd ha scritto e che si tolgono.
//
// Stava dentro `disfa.ts` (F5). Da F9 lo usa anche la coda: una carta fermata
// a metà (il bottone «Stop now», il budget della notte) non lascia file
// scritti a metà nei luoghi delle consegne. Le regole sono quelle di F5:
//
//   · nel Cestino, mai cancellato: si ripesca dal Finder come ogni altra cosa;
//   · solo dentro i luoghi delle consegne: un percorso fuori da lì vuol dire
//     che qualcosa non torna, e il file resta dov'è.

import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'
import * as mani from './mani.ts'

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

/**
 * Un file nel Cestino, se c'è ed è nei luoghi delle consegne. Torna
 * `cestino` se l'ha spostato, `fuori` se il file c'è ma sta altrove (e resta
 * lì), null se non c'è niente da spostare. Lancia solo se il disco dice di no.
 */
export function butta(percorso: string): 'cestino' | 'fuori' | null {
  if (!percorso || !existsSync(percorso) || !statSync(percorso).isFile()) return null
  if (!nelLuogoDelleConsegne(percorso)) return 'fuori'
  const cestino = ferri.cestino()
  mkdirSync(cestino, { recursive: true })
  renameSync(percorso, nomeLibero(cestino, basename(percorso)))
  return 'cestino'
}
