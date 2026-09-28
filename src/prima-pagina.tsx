// La riga «Preparo la prima pagina» sulla home di un conto nuovo (P4).
//
// Si chiede al server una volta al montaggio, poi ogni tre secondi finché la
// prima pagina è in attesa o in lavoro, e di nuovo quando il feed cambia.
// Sotto, il primo giorno (F6): «Imparo come lavori» finché il ritratto e le
// carte per la notte non ci sono, con quante righe e quante carte; si chiede
// ogni dieci secondi, perché la posta di novanta giorni può metterci un po'.
// Pronta (o andata storta): il fuoco si posa e la riga se ne va; le carte
// arrivano da sole. Senza modello, o per un conto che la sua pagina l'ha già
// avuta, non si mostra niente: la riga fissa di sopra dice cosa manca.

import { useEffect, useRef, useState } from 'react'
import { api, apiP4, type PaginaAvvio } from './api'
import { frasi, t } from './lingua'
import { trovato } from './conta-fonti'
import { RigaCheLavora } from './components/RigaCheLavora'

const OGNI_MS = 3000
const OGNI_MS_PRIMO_GIORNO = 10_000

/** Lo stato della prima pagina, dal server, finché serve. */
export function usePrimaPagina(): PaginaAvvio | null {
  const [s, setS] = useState<PaginaAvvio | null>(null)
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const chiedi = async () => {
      if (timer) { clearTimeout(timer); timer = null }
      try {
        const n = await apiP4.avvioPagina()
        if (!vivo.current) return
        setS(n)
        if (n.pagina === 'attesa' || n.pagina === 'lavoro') timer = setTimeout(() => { void chiedi() }, OGNI_MS)
        else if (imparaInVista(n)) timer = setTimeout(() => { void chiedi() }, OGNI_MS_PRIMO_GIORNO)
      } catch { /* una risposta persa non è uno stato: si resta come si era */ }
    }
    void chiedi()
    const via = api.flussoCompiti(e => { if (e.fase === 'feed') void chiedi() })
    return () => { vivo.current = false; if (timer) clearTimeout(timer); via() }
  }, [])
  return s
}

/** Se la riga è in vista: mentre la prima pagina aspetta o lavora. */
export const inVista = (s: PaginaAvvio | null) => !!s && (s.pagina === 'attesa' || s.pagina === 'lavoro')

/** Se la riga del primo giorno è in vista: finché il ritratto e le carte non sono fatti. */
export const imparaInVista = (s: PaginaAvvio | null) => !!s?.primoGiorno && s.primoGiorno.fase !== 'fatto'

export function PrimaPagina({ s }: { s: PaginaAvvio | null }) {
  return <>
    <RigaPrimaPagina s={s} />
    <RigaPrimoGiorno s={s} />
  </>
}

/** «Imparo come lavori»: il primo giorno che lavora, poi il fuoco si posa e la riga se ne va. */
function RigaPrimoGiorno({ s }: { s: PaginaAvvio | null }) {
  const [finita, setFinita] = useState(false)
  const [via, setVia] = useState(false)
  const eraInVista = useRef(false)
  const mostra = imparaInVista(s)
  useEffect(() => {
    if (eraInVista.current && !mostra) setFinita(true)
    if (mostra) { eraInVista.current = true; setVia(false) }
  }, [mostra])
  if (via || (!mostra && !finita)) return null
  const g = s?.primoGiorno
  return <RigaCheLavora titolo={t('Imparo come lavori')} passo={g ? frasi.imparoCome(g.righe, g.carte) || null : null} finita={finita}
    onFinita={() => { setFinita(false); setVia(true); eraInVista.current = false }} />
}

function RigaPrimaPagina({ s }: { s: PaginaAvvio | null }) {
  const [finita, setFinita] = useState(false)
  const [via, setVia] = useState(false)
  const eraInVista = useRef(false)
  const mostra = inVista(s)
  useEffect(() => {
    if (eraInVista.current && !mostra && (s?.pagina === 'pronta' || s?.pagina === 'guaio')) setFinita(true)
    if (mostra) { eraInVista.current = true; setVia(false) }
  }, [mostra, s?.pagina])
  if (via || (!mostra && !finita)) return null
  const passo = s && (s.lettura === 'prima' || s.lettura === 'coda') ? trovato(s.trovato) : null
  return <RigaCheLavora titolo={t('Preparo la prima pagina')} passo={passo} finita={finita}
    onFinita={() => { setFinita(false); setVia(true); eraInVista.current = false }} />
}
