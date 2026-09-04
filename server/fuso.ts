// L'ora di chi usa, non quella del server.
//
// «Ogni giorno alle 7» lo dice una persona guardando il suo orologio. Su un
// server la macchina sta in UTC, e alle 7 di Roma sono le 5: senza questo file
// l'automazione partiva alle 9 d'estate e il tetto delle bozze si azzerava alle
// due di notte. Il fuso lo manda il browser una volta, sta nella
// configurazione, e da lì ogni conto che parla di giorni e di ore passa di qui.
// Senza, vale quello della macchina — che in casa è quello giusto.

import { leggi } from './config.ts'

export function fusoValido(f: string): boolean {
  if (!f || f.length > 64) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: f }); return true } catch { return false }
}

export function fusoDi(): string {
  const f = leggi().fuso
  if (f && fusoValido(f)) return f
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export type Parti = { anno: number; mese: number; giorno: number; ora: number; minuti: number; settimana: number }

const FORMATI = new Map<string, Intl.DateTimeFormat>()
function formato(fuso: string): Intl.DateTimeFormat {
  let f = FORMATI.get(fuso)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short'
    })
    FORMATI.set(fuso, f)
  }
  return f
}
const SETTIMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Cosa segna l'orologio in quel fuso, in quell'istante. */
export function parti(d: Date, fuso = fusoDi()): Parti {
  const p: Record<string, string> = {}
  for (const x of formato(fuso).formatToParts(d)) p[x.type] = x.value
  return {
    anno: Number(p.year), mese: Number(p.month), giorno: Number(p.day),
    ora: Number(p.hour) % 24, minuti: Number(p.minute), settimana: SETTIMANA[p.weekday] ?? 0
  }
}

/**
 * L'istante in cui, in quel fuso, l'orologio segna quella data e quell'ora.
 *
 * Si parte dall'ipotesi UTC e si corregge con lo scarto che quel fuso mostra
 * lì; due passaggi bastano anche a cavallo del cambio d'ora. Il giorno può
 * sforare il mese — `Date.UTC` lo normalizza da sé.
 */
export function istante(anno: number, mese: number, giorno: number, ora: number, fuso = fusoDi()): Date {
  const voluto = Date.UTC(anno, mese - 1, giorno, ora)
  let t = voluto
  for (let i = 0; i < 2; i++) {
    const p = parti(new Date(t), fuso)
    const visto = Date.UTC(p.anno, p.mese - 1, p.giorno, p.ora, p.minuti)
    if (visto === voluto) break
    t += voluto - visto
  }
  return new Date(t)
}

const due = (n: number) => String(n).padStart(2, '0')

/** Il giorno solare in quel fuso, come AAAA-MM-GG. */
export function giornoIn(d: Date, fuso = fusoDi()): string {
  const p = parti(d, fuso)
  return `${p.anno}-${due(p.mese)}-${due(p.giorno)}`
}

/** «AAAA-MM-GG HH:MM» in quel fuso: com'è scritto sull'agenda, non com'è scritto nel database. */
export function oraIn(iso: string, fuso = fusoDi()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16)
  const p = parti(d, fuso)
  return `${giornoIn(d, fuso)} ${due(p.ora)}:${due(p.minuti)}`
}
