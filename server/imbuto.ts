// L'imbuto del primo giorno, contato in casa e da nessun'altra parte.
//
// Quanti conti nuovi collegano una fonte, finiscono una lettura, vedono una
// carta, fanno un gesto; e quanti lo fanno entro il primo giorno. Due file:
// quello del conto, con le date dei suoi primi passi (viaggia solo dentro
// «Scarica tutti i miei dati»), e quello della macchina, con numeri interi e
// basta. Nessuna rotta, nessuna rete: si legge con `npm run imbuto`.
//
// Il file del conto nasce solo alla registrazione: i conti di prima non si
// contano mai, e l'imbuto parla solo di chi è arrivato dopo.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as cfg from './config.ts'
import * as chi from './chi.ts'
import * as store from './store.ts'
import * as cancellati from './cancellati.ts'
import { FONTI } from './connettori/registro.ts'
import { fonteCollegata } from './fonti-collegate.ts'
import { fileMacchinaIn, leggiAggregatoIn, vuoto, type Aggregato, type Dopo, type Passo } from './imbuto-riga.ts'

export type { Passo, Aggregato } from './imbuto-riga.ts'
export { riga } from './imbuto-riga.ts'
export const PASSI: readonly Passo[] = ['conto', 'fonte', 'lettura', 'pagina', 'gesto']
const DOPO: readonly Dopo[] = ['fonte', 'lettura', 'pagina', 'gesto']
const GIORNO_MS = 24 * 3_600_000

export type DelConto = { versione: 1; conto: string } & Partial<Record<Dopo, string>>

const fileConto = () => join(cfg.cartella(), 'imbuto.json')
export const fileMacchina = (radice = cfg.RADICE) => fileMacchinaIn(radice)

function scriviSubito(file: string, dati: unknown) {
  mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 })
  const accanto = `${file}.${process.pid}.tmp`
  writeFileSync(accanto, JSON.stringify(dati, null, 2), { mode: 0o600 })
  renameSync(accanto, file)
}

function leggiJSON<T>(file: string): T | null {
  try { return JSON.parse(readFileSync(file, 'utf8')) as T } catch { return null }
}

/** Il file della macchina, se c'è: solo numeri interi. */
export function leggiAggregato(radice?: string): Aggregato | null {
  return leggiAggregatoIn(radice ?? cfg.RADICE)
}

function conta(p: Passo, giornoUno: boolean, adesso: Date) {
  const file = fileMacchina()
  const a = leggiAggregato() ?? vuoto(adesso)
  a.passi[p] = Math.max(0, Math.floor(Number(a.passi[p] ?? 0))) + 1
  if (giornoUno && p !== 'conto') a.giornoUno[p] = Math.max(0, Math.floor(Number(a.giornoUno[p] ?? 0))) + 1
  scriviSubito(file, a)
}

/** I passi già fatti, per conto: chi li ha tutti, o non ha il file, non si guarda più. */
const visti = new Map<string, Set<Passo> | 'fuori'>()
const chiave = () => chi.adesso() ?? ''

/** Un conto è nato adesso. */
export function nasce(adesso = new Date()): void {
  if (cancellati.cancellata(cfg.cartella())) return
  if (existsSync(fileConto())) return
  const mio: DelConto = { versione: 1, conto: adesso.toISOString() }
  scriviSubito(fileConto(), mio)
  conta('conto', false, adesso)
  visti.set(chiave(), new Set(['conto']))
}

/**
 * Guarda se questo conto ha fatto un passo nuovo, con la data vera del
 * passo, e lo conta una volta. Costa niente per chi ha finito o non conta.
 */
export function controlla(adesso = new Date()): void {
  const k = chiave()
  const noto = visti.get(k)
  if (noto === 'fuori' || (noto && noto.size === PASSI.length)) return
  if (cancellati.cancellata(cfg.cartella())) return
  const mio = leggiJSON<DelConto>(fileConto())
  if (!mio || mio.versione !== 1 || !mio.conto) { visti.set(k, 'fuori'); return }
  const nato = Date.parse(mio.conto)
  const fatti = new Set<Passo>(['conto', ...DOPO.filter(p => !!mio[p])])
  const quando: Record<Dopo, () => string | null> = {
    fonte: () => FONTI.some(f => fonteCollegata(f)) ? adesso.toISOString() : null,
    lettura: () => store.primoIndicizzato(),
    pagina: () => store.primaVista(),
    gesto: () => store.primoGesto()
  }
  for (const p of DOPO) {
    if (fatti.has(p)) continue
    const q = quando[p]()
    if (!q) continue
    const t = Date.parse(q)
    if (Number.isNaN(t)) continue
    mio[p] = new Date(t).toISOString()
    scriviSubito(fileConto(), mio)
    conta(p, !Number.isNaN(nato) && t - nato <= GIORNO_MS, adesso)
    fatti.add(p)
  }
  visti.set(k, fatti)
}

/** Solo per le prove. */
export function dimentica() { visti.clear() }
