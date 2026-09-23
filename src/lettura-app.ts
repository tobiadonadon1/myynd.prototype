// La lettura delle fonti dell'app: una sola, per la pagina delle Fonti, il
// pannello delle connessioni e il primo avvio. Come funziona sta in
// `lettura-fonti.ts`, che non sa niente di React né della rete; qui gli si
// danno le due cose, e un gancio per chi la mostra.

import { useEffect, useState } from 'react'
import { api, rigaSincronizzazione } from './api'
import { creaLettura, type Lettura } from './lettura-fonti'

/** I collegati che non portano documenti: i motori e la lista, che è dentro l'app. */
const NON_SI_LEGGONO = new Set(['claude', 'openai', 'compatibile', 'jev', 'mind2do'])

export const letturaFonti = creaLettura({
  sincronizza: (su, fonte) => api.sincronizza(su, fonte),
  collegate: async () => {
    const s = await api.stato()
    return Object.fromEntries(s.connettori.filter(c => c.collegato && !NON_SI_LEGGONO.has(c.id)).map(c => [c.id, c.documenti]))
  },
  riga: rigaSincronizzazione
})

/** Lo stato della lettura, che si ridisegna a ogni cambio. */
export function useLettura(): Lettura {
  const [s, setS] = useState(letturaFonti.stato())
  useEffect(() => letturaFonti.ascolta(setS), [])
  return s
}
