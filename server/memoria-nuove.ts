// Il punto accanto a «Memoria», nel menù del conto (P5).
//
// Conta solo le cose da guardare nate dopo l'ultima volta che ha aperto la
// Memoria: le convinzioni che aspettano (indotte e non ancora tenute) e le
// righe di «Come lavori» che non valgono ancora da sole. Quelle vecchie non
// accendono niente: il punto dice «c'è del nuovo», non «hai dei compiti».
// Senza una prima visita (vista null) non si accende mai: dopo
// l'aggiornamento nessuno trova un punto a sorpresa.
//
// Per conto per costruzione: store e config sono di chi chiede.

import db from './store.ts'
import * as store from './store.ts'
import * as memoria from './memoria.ts'
import * as abitudini from './abitudini.ts'

export type Nuove = { quante: number; dove: 'come-lavori' | 'ritratto' | null }

export function nuove(vista: string | null): Nuove {
  if (!vista) return { quante: 0, dove: null }
  type Voce = { quando: string; dove: 'come-lavori' | 'ritratto' }
  const voci: Voce[] = []
  for (const k of store.convinzioni()) {
    if (!memoria.attendibile(k) && k.dal > vista) voci.push({ quando: k.dal, dove: 'ritratto' })
  }
  // le righe osservate: la regola di quando valgono è quella di P1B, non una copia
  const inAttesa = new Set(abitudini.tutte().filter(a => !a.inVigore && a.stato !== 'superata').map(a => a.chiave))
  if (inAttesa.size) {
    const righe = db.prepare('SELECT chiave, visto FROM abitudini WHERE visto > ?').all(vista) as { chiave: string; visto: string }[]
    for (const r of righe) if (inAttesa.has(r.chiave)) voci.push({ quando: r.visto, dove: 'come-lavori' })
  }
  if (!voci.length) return { quante: 0, dove: null }
  const nuova = voci.reduce((a, b) => (b.quando > a.quando ? b : a))
  return { quante: voci.length, dove: nuova.dove }
}
