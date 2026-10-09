// La ricevuta della prima pagina: quando chiederla.
//
// Al primo disegno, a ogni ritorno nella finestra, e quando cambia quello che
// conta (`firma`: le carte, la domanda di Myynd), con un attimo di respiro
// perché uno spostamento di righe non faccia dieci richieste. Il guscio
// (`App.tsx`) la tiene, perché la usa anche il numero nel menù.

import { useEffect, useRef, useState } from 'react'
import { api, type Mattina } from './api'
import { dalDopoIlRitorno } from './mattina'

/** Quando ha lasciato la finestra l'ultima volta. */
const CHIAVE_VIA = 'myynd.mattina.via'
/** L'inizio dell'ultima assenza vera: da lì conta «da quando te ne sei andato». */
const CHIAVE_DAL = 'myynd.mattina.dal'

function leggi(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}
function scrivi(k: string, v: string) {
  try { localStorage.setItem(k, v) } catch { /* senza memoria conta dall'inizio della giornata, e basta */ }
}

export function useMattina(firma: string): Mattina | null {
  const [m, setM] = useState<Mattina | null>(null)
  const dal = useRef<string | null>(null)
  const ultima = useRef(0)

  useEffect(() => {
    let vivo = true
    const chiedi = () => {
      ultima.current = Date.now()
      api.mattina(dal.current).then(x => { if (vivo) setM(x) }).catch(() => {
        // la ricevuta non è il motivo per cui si apre Myynd: resta quella di prima
      })
    }
    const tornato = () => {
      const prima = Number(leggi(CHIAVE_VIA) ?? 0) || null
      dal.current = dalDopoIlRitorno(prima, leggi(CHIAVE_DAL), Date.now())
      if (dal.current) scrivi(CHIAVE_DAL, dal.current)
      chiedi()
    }
    const partito = () => scrivi(CHIAVE_VIA, String(Date.now()))
    const seVisibile = () => { if (!document.hidden) tornato() }
    tornato()
    window.addEventListener('focus', seVisibile)
    window.addEventListener('blur', partito)
    return () => { vivo = false; window.removeEventListener('focus', seVisibile); window.removeEventListener('blur', partito) }
  }, [])

  // quello che conta è cambiato: si richiede, ma non più di una volta al secondo
  const prima = useRef(true)
  useEffect(() => {
    if (prima.current) { prima.current = false; return }
    let vivo = true
    const t = setTimeout(() => {
      ultima.current = Date.now()
      api.mattina(dal.current).then(x => { if (vivo) setM(x) }).catch(() => {})
    }, Math.max(400, 1000 - (Date.now() - ultima.current)))
    return () => { vivo = false; clearTimeout(t) }
  }, [firma])

  return m
}
