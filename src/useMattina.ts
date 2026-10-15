// La ricevuta della prima pagina: quando chiederla.
//
// Al primo disegno, a ogni ritorno nella finestra, e quando cambia quello che
// conta (`firma`: le carte, la domanda di Myynd), con un attimo di respiro
// perché uno spostamento di righe non faccia dieci richieste. Il guscio
// (`App.tsx`) la tiene, perché la usa anche il numero nel menù.
//
// Da quando contare non lo dice più la finestra (15 ottobre 2026): lo sa il
// server, che si segna quando lui guarda (`server/via.ts`). La finestra dice
// solo «è qui», mentre ha il fuoco: ogni pochi minuti, e quando lo perde.

import { useEffect, useRef, useState } from 'react'
import { api, type Mattina } from './api'

/** Ogni quanto, mentre ha il fuoco, la finestra dice che è qui. */
const BATTITO_MS = 5 * 60_000

const conIlFuoco = () => typeof document !== 'undefined' && !document.hidden && document.hasFocus()

export function useMattina(firma: string): Mattina | null {
  const [m, setM] = useState<Mattina | null>(null)
  const ultima = useRef(0)

  useEffect(() => {
    let vivo = true
    const chiedi = () => {
      ultima.current = Date.now()
      api.mattina(conIlFuoco()).then(x => { if (vivo) setM(x) }).catch(() => {
        // la ricevuta non è il motivo per cui si apre Myynd: resta quella di prima
      })
    }
    const qui = () => { api.qui().catch(() => { /* al prossimo battito */ }) }
    const seVisibile = () => { if (!document.hidden) chiedi() }
    chiedi()
    const battito = setInterval(() => { if (conIlFuoco()) qui() }, BATTITO_MS)
    window.addEventListener('focus', seVisibile)
    window.addEventListener('blur', qui)
    return () => {
      vivo = false
      clearInterval(battito)
      window.removeEventListener('focus', seVisibile)
      window.removeEventListener('blur', qui)
    }
  }, [])

  // quello che conta è cambiato: si richiede, ma non più di una volta al secondo
  const prima = useRef(true)
  useEffect(() => {
    if (prima.current) { prima.current = false; return }
    let vivo = true
    const t = setTimeout(() => {
      ultima.current = Date.now()
      api.mattina(conIlFuoco()).then(x => { if (vivo) setM(x) }).catch(() => {})
    }, Math.max(400, 1000 - (Date.now() - ultima.current)))
    return () => { vivo = false; clearTimeout(t) }
  }, [firma])

  return m
}
