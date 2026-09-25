// L'osservatore del Mac, nella scheda «L'app» delle Preferenze.
//
// Quattro righe: guarda come lavoro, anche i titoli delle finestre, Myynd
// sullo schermo, cancella le osservazioni. Si vede solo dentro l'app sul Mac
// e solo se il server risponde che c'è. Ogni interruttore scatta subito e
// torna indietro se il server dice di no; ogni chiamata al guscio è con `?.`
// e solo un `true` letterale vale sì (il guscio finto delle prove risponde
// con un altro finto, mai con `true`).
//
// Il permesso di Accessibilità lo chiedono solo i due gesti che accendono i
// titoli: è la decisione del 24 settembre, e il guscio lo chiede una volta.

import { useCallback, useEffect, useState } from 'react'
import { gemelloApi, type StatoOsservatore } from '../api'
import { t } from '../lingua'
import { desktop } from '../desktop'
import { BottoneSicuro, knob, track } from '../ui'
import { inPausaFino } from '../gemello-frasi'

const vero = (x: unknown): boolean => x === true

export function PreferenzeOsservatore() {
  const d = desktop()
  const [s, setS] = useState<StatoOsservatore | null>(null)
  const [permesso, setPermesso] = useState<boolean | null>(null)
  const [compagno, setCompagno] = useState(false)
  const [guaio, setGuaio] = useState('')

  // ogni chiamata al guscio passa da Promise.resolve: un guscio vecchio (o quello
  // finto delle prove) può rispondere con qualcosa che non è una promessa
  const leggiPermesso = useCallback(async () => {
    try { setPermesso(vero(await Promise.resolve(d?.osservatore?.permessoTitoli?.()))) } catch { setPermesso(false) }
  }, [d])
  const carica = useCallback(async () => {
    try { const v = await gemelloApi.osservatore(); setS(v.disponibile ? v : null) } catch { setS(null) }
  }, [])

  useEffect(() => {
    if (d?.piattaforma !== 'darwin') return
    void carica(); void leggiPermesso()
    Promise.resolve(d.compagno?.acceso?.()).then(v => setCompagno(vero(v))).catch(() => {})
    const alFuoco = () => { void leggiPermesso(); void carica() }
    window.addEventListener('focus', alFuoco)
    return () => window.removeEventListener('focus', alFuoco)
  }, [d, carica, leggiPermesso])

  if (d?.piattaforma !== 'darwin' || !s) return null

  const male = (e: unknown) => setGuaio(e instanceof Error ? t(e.message) : String(e))
  const chiediTitoli = async () => {
    try { setPermesso(vero(await Promise.resolve(d.osservatore?.chiediPermessoTitoli?.()))) } catch { /* il guscio vecchio non lo sa fare */ }
  }

  const accendi = async () => {
    const prima = s
    const on = !s.acceso || s.altroConto
    setS({ ...s, acceso: on, titoli: on ? true : false, altroConto: false, pausaFino: null }); setGuaio('')
    try {
      setS(await gemelloApi.imposta({ acceso: on }))
      if (on) await chiediTitoli()
    } catch (e) { setS(prima); male(e) }
  }
  const titoli = async () => {
    const prima = s
    const on = !s.titoli
    setS({ ...s, titoli: on }); setGuaio('')
    try {
      setS(await gemelloApi.imposta({ titoli: on }))
      if (on) await chiediTitoli()
    } catch (e) { setS(prima); male(e) }
  }
  const pausa = async () => {
    const prima = s
    setS({ ...s, pausaFino: new Date(Date.now() + 3_600_000).toISOString() }); setGuaio('')
    try { setS(await gemelloApi.pausa(60)) } catch (e) { setS(prima); male(e) }
  }
  const riprendi = async () => {
    const prima = s
    setS({ ...s, pausaFino: null }); setGuaio('')
    try { setS(await gemelloApi.riprendi()) } catch (e) { setS(prima); male(e) }
  }
  const schermo = async () => {
    const on = !compagno
    setCompagno(on); setGuaio('')
    try { await Promise.resolve(d.compagno?.accendi?.(on)) } catch (e) { setCompagno(!on); male(e) }
  }
  const cancella = async () => {
    const prima = s
    setS({ ...s, osservate: 0 }); setGuaio('')
    try { await gemelloApi.cancella() } catch (e) { setS(prima); male(e) }
  }

  const acceso = s.acceso && !s.altroConto
  return (
    <>
      <div className="prefs-riga">
        <div>
          <div className="prefs-nome">{t('Osserva come lavoro')}</div>
          {s.altroConto && <div className="prefs-stato">{t('Lo usa un altro account su questo Mac')}</div>}
          {acceso && s.pausaFino && (
            <div className="prefs-stato" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>{inPausaFino(s.pausaFino)}</span>
              <button type="button" className="prefs-secondario" onClick={() => void riprendi()}>{t('Riprendi a guardare')}</button>
            </div>
          )}
          {acceso && !s.pausaFino && (
            <div className="prefs-stato"><button type="button" className="prefs-secondario" onClick={() => void pausa()}>{t('Pausa per un’ora')}</button></div>
          )}
        </div>
        <button type="button" role="switch" aria-checked={acceso} aria-label={t('Osserva come lavoro')}
          onClick={() => void accendi()} style={track(acceso)}><span style={knob()} /></button>
      </div>

      {acceso && (
        <div className="prefs-riga">
          <div>
            <div className="prefs-nome">{t('Anche i titoli delle finestre')}</div>
            {s.titoli && permesso !== true && (
              <div className="prefs-stato" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>{t('I titoli aspettano il permesso')}</span>
                <button type="button" className="prefs-secondario" onClick={() => { Promise.resolve(d.osservatore?.apriImpostazioniTitoli?.()).catch(() => {}) }}>{t('Apri Impostazioni')}</button>
              </div>
            )}
          </div>
          <button type="button" role="switch" aria-checked={s.titoli} aria-label={t('Anche i titoli delle finestre')}
            onClick={() => void titoli()} style={track(s.titoli)}><span style={knob()} /></button>
        </div>
      )}

      <div className="prefs-riga">
        <div className="prefs-nome">{t('Myynd sullo schermo')}</div>
        <button type="button" role="switch" aria-checked={compagno} aria-label={t('Myynd sullo schermo')}
          onClick={() => void schermo()} style={track(compagno)}><span style={knob()} /></button>
      </div>

      {(acceso || s.osservate > 0) && (
        <div className="prefs-riga">
          <div className="prefs-nome">{t('Cancella le osservazioni')}</div>
          <BottoneSicuro fai={cancella} guaio={f => setGuaio(t(f))} titolo={t('Cancella le osservazioni')}>{t('Cancella le osservazioni')}</BottoneSicuro>
        </div>
      )}

      {guaio && <div className="prefs-stato rame">{guaio}</div>}
    </>
  )
}
