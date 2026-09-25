// Il resoconto si apre da più posti (la carta del lunedì, la Memoria) e si
// mostra in uno solo (`ResocontoAperto`, montato una volta in App): chi lo
// chiede e chi lo mostra si parlano con un biglietto, come `chiediProgetto`.

import { useEffect, useRef, useState } from 'react'
import { resocontoApi, type LunediResoconto, type QualeResoconto } from './api'
import { inTempo } from './resoconto-gesti'

const inAscolto = new Set<(q: QualeResoconto) => void>()
const allaChiusura = new Set<() => void>()

/** «Apri il resoconto di questa finestra»: lo dice chiunque, lo mostra l'ospite. */
export function apriResoconto(quale: QualeResoconto) { for (const f of inAscolto) f(quale) }
export function ascoltaResoconto(f: (q: QualeResoconto) => void): () => void {
  inAscolto.add(f)
  return () => { inAscolto.delete(f) }
}
/** Il foglio si è chiuso: chi aspettava per rimettersi a posto (la carta, se «visto» non è passato) lo sa. */
export function resocontoChiuso() { for (const f of [...allaChiusura]) f() }
export function ascoltaChiusura(f: () => void): () => void {
  allaChiusura.add(f)
  return () => { allaChiusura.delete(f) }
}

/**
 * La carta del lunedì: una domanda sola quando la prima pagina si monta,
 * niente al ritorno sulla finestra o agli eventi della lista. Se la risposta
 * arriva tardi, la carta aspetta la prossima volta.
 */
export function useLunedi(feedCaricato: boolean): { carta: Extract<LunediResoconto, { mostra: true }> | null; nascondi: () => void; rimetti: () => void } {
  const [risposta, setRisposta] = useState<Extract<LunediResoconto, { mostra: true }> | null>(null)
  const [nascosta, setNascosta] = useState(false)
  const feedPronto = useRef<number | null>(feedCaricato ? Date.now() : null)
  if (feedCaricato && feedPronto.current === null) feedPronto.current = Date.now()

  useEffect(() => {
    let vivo = true
    resocontoApi.lunedi().then(r => {
      if (!vivo || !r.mostra) return
      if (inTempo(Date.now(), feedPronto.current)) setRisposta(r)
    }).catch(() => { /* la carta è un di più */ })
    return () => { vivo = false }
  }, [])

  return { carta: nascosta ? null : risposta, nascondi: () => setNascosta(true), rimetti: () => setNascosta(false) }
}
