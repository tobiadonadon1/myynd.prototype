// La riga della prova delle risposte, nelle preferenze: un interruttore e
// una riga di stato scritta dal server. Sta in un componente suo perché
// vive dentro «Quanto ha ragionato» e domani può cambiare casa.
//
// Senza un insieme di domande non si disegna niente: la prova la costruisce
// un comando, e finché non c'è l'interruttore accenderebbe il nulla.

import { useEffect, useRef, useState } from 'react'
import { provaRisposte, type ProvaRisposteStato } from '../api'
import { t } from '../lingua'
import { knob, track } from '../ui'

export function ProvaRisposte() {
  const [s, setS] = useState<ProvaRisposteStato | null>(null)
  const [guaio, setGuaio] = useState('')
  const vivo = useRef(true)
  const leggi = () => provaRisposte.stato().then(x => { if (vivo.current) setS(x) }).catch(() => { /* senza risposta la riga non c'è */ })
  useEffect(() => { vivo.current = true; void leggi(); return () => { vivo.current = false } }, [])
  // mentre gira si rilegge ogni dieci secondi, e si smette quando finisce
  useEffect(() => {
    if (!s?.inCorso) return
    const orologio = setInterval(() => { void leggi() }, 10_000)
    return () => clearInterval(orologio)
  }, [s?.inCorso])

  if (!s?.insieme) return null

  const cambia = async () => {
    const prima = s.attiva
    const on = !prima
    // subito, e indietro se il server dice di no
    setS({ ...s, attiva: on }); setGuaio('')
    try {
      await provaRisposte.attiva(on)
      void leggi()
    } catch {
      setS(x => (x ? { ...x, attiva: prima } : x))
      setGuaio(t('Non sono riuscito a salvare la preferenza.'))
    }
  }

  return (
    <>
      <div className="prefs-riga">
        <div><div className="prefs-nome">{t('Verifica le risposte ogni settimana')}</div></div>
        <button type="button" role="switch" aria-checked={s.attiva} aria-label={t('Verifica le risposte ogni settimana')}
          onClick={cambia} style={track(s.attiva)}><span style={knob()} /></button>
      </div>
      {s.riga && <div className="prefs-stato">{s.riga}</div>}
      {guaio && <div className="prefs-stato rame">{guaio}</div>}
    </>
  )
}
