// Le cose fatte che ha aperto in questa visita.
//
// Il server se le segna (`/api/lavoro/visti`), e alla prossima volta la riga
// si piega fuori dal suo blocco. Ma non subito: una riga che scappa mentre la
// si sta leggendo è un bottone che si sposta sotto il dito. Quindi qui si
// tiene quello che ha aperto adesso: perde il pallino nell'istante, e resta
// dov'è finché lui non se ne va per davvero (mezz'ora, come la ricevuta).

import { useSyncExternalStore } from 'react'
import { api } from './api'
import { MINUTI_VIA } from './mattina'

let ora = new Set<string>()
const chi = new Set<() => void>()
const avvisa = () => { for (const f of chi) f() }

/** Le segna viste: subito qui, e sul server. Un guaio del server non rimette il pallino. */
export function segnaVisto(...ids: string[]) {
  const nuovi = ids.filter(id => id && !ora.has(id))
  if (!nuovi.length) return
  ora = new Set([...ora, ...nuovi])
  avvisa()
  api.lavoriVisti(nuovi).catch(() => { /* alla prossima apertura si risegna */ })
}

/** Quelle aperte in questa visita. */
export function useVistiOra(): ReadonlySet<string> {
  return useSyncExternalStore(f => { chi.add(f); return () => chi.delete(f) }, () => ora, () => ora)
}

/*
 * Un'assenza vera chiude la visita: tornando, quello che aveva aperto si
 * piega. Un passaggio su un'altra finestra (il file appena aperto in Anteprima)
 * no: si torna e la riga è ancora lì.
 */
if (typeof window !== 'undefined') {
  let via = 0
  window.addEventListener('blur', () => { via = Date.now() })
  window.addEventListener('focus', () => {
    if (via && Date.now() - via >= MINUTI_VIA * 60_000 && ora.size) { ora = new Set(); avvisa() }
    via = 0
  })
}
