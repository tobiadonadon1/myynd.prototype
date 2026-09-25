// L'osservatore del Mac, nelle Preferenze.
//
// Due parti (P5): «osservazione» è la scheda Osservazione del primo pannello
// (guarda come lavori, anche i titoli delle finestre, la pausa, cancella le
// osservazioni); «schermo» è la riga «Myynd sullo schermo» nella scheda
// «L'app», dove P1B l'aveva messa. Si vede solo dentro l'app sul Mac
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
import { BottoneSicuro } from '../ui'
import { Bottone, Interruttore } from '../components/forme'
import { inPausaFino } from '../gemello-frasi'

const vero = (x: unknown): boolean => x === true

/** Vero se l'osservatore c'è su questo Mac (lo dice il server): la scheda Osservazione si disegna solo allora. */
export function useOsservatoreDisponibile(): boolean {
  const d = desktop()
  const [si, setSi] = useState(false)
  useEffect(() => {
    if (d?.piattaforma !== 'darwin') return
    let vivo = true
    gemelloApi.osservatore().then(v => { if (vivo) setSi(!!v.disponibile) }).catch(() => {})
    return () => { vivo = false }
  }, [d])
  return si
}

export function PreferenzeOsservatore({ parte }: { parte: 'osservazione' | 'schermo' }) {
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
    const leggiCompagno = () => { Promise.resolve(d.compagno?.acceso?.()).then(v => setCompagno(vero(v))).catch(() => {}) }
    void carica(); void leggiPermesso(); leggiCompagno()
    // il mostriciattolo si toglie anche dal suo menu: l'interruttore lo segue, e si rilegge al fuoco
    let smetti: unknown = null
    try { smetti = d.compagno?.suCambio?.(on => setCompagno(vero(on))) } catch { /* un guscio vecchio non lo sa fare */ }
    const alFuoco = () => { void leggiPermesso(); void carica(); leggiCompagno() }
    window.addEventListener('focus', alFuoco)
    return () => {
      window.removeEventListener('focus', alFuoco)
      try { if (typeof smetti === 'function') smetti() } catch { /* niente da smettere */ }
    }
  }, [d, carica, leggiPermesso])

  if (d?.piattaforma !== 'darwin' || !s) return null

  const male = (e: unknown) => setGuaio(e instanceof Error ? t(e.message) : String(e))
  const chiediTitoli = async () => {
    try { setPermesso(vero(await Promise.resolve(d.osservatore?.chiediPermessoTitoli?.()))) } catch { /* il guscio vecchio non lo sa fare */ }
  }

  // il permesso lo chiede solo un gesto che accende davvero i titoli: il server
  // ricorda «titoli spenti» di prima, e allora riaccendere non chiede niente
  const accendi = async () => {
    const prima = s
    const on = !s.acceso || s.altroConto
    setS({ ...s, acceso: on, titoli: on ? true : false, altroConto: false, pausaFino: null }); setGuaio('')
    try {
      const nuovo = await gemelloApi.imposta({ acceso: on })
      setS(nuovo)
      if (on && nuovo.titoli === true) await chiediTitoli()
    } catch (e) { setS(prima); male(e) }
  }
  const titoli = async () => {
    const prima = s
    const on = !s.titoli
    setS({ ...s, titoli: on }); setGuaio('')
    try {
      const nuovo = await gemelloApi.imposta({ titoli: on })
      setS(nuovo)
      if (on && nuovo.titoli === true) await chiediTitoli()
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
  if (parte === 'schermo') {
    return (
      <>
        <div className="f-riga">
          <div className="f-nome">{t('Myynd sullo schermo')}</div>
          <Interruttore acceso={compagno} cambia={() => void schermo()} etichetta={t('Myynd sullo schermo')} />
        </div>
        {guaio && <div className="f-stato rame">{guaio}</div>}
      </>
    )
  }
  return (
    <>
      <div className="f-riga">
        <div>
          <div className="f-nome">{t('Guarda come lavori')}</div>
          {s.altroConto && <div className="f-stato">{t('Lo usa un altro conto su questo Mac')}</div>}
          {acceso && s.pausaFino && (
            <div className="f-stato" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>{inPausaFino(s.pausaFino)}</span>
              <Bottone tipo="parola" piccolo onClick={() => void riprendi()}>{t('Riprendi a guardare')}</Bottone>
            </div>
          )}
          {acceso && !s.pausaFino && (
            <div className="f-stato"><Bottone tipo="parola" piccolo onClick={() => void pausa()}>{t('Pausa per un’ora')}</Bottone></div>
          )}
        </div>
        <Interruttore acceso={acceso} cambia={() => void accendi()} etichetta={t('Guarda come lavori')} />
      </div>

      {acceso && (
        <div className="f-riga">
          <div>
            <div className="f-nome">{t('Anche i titoli delle finestre')}</div>
            {s.titoli && permesso !== true && (
              <div className="f-stato" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>{t('I titoli aspettano il permesso')}</span>
                <Bottone tipo="parola" piccolo onClick={() => { Promise.resolve(d.osservatore?.apriImpostazioniTitoli?.()).catch(() => {}) }}>{t('Apri Impostazioni')}</Bottone>
              </div>
            )}
          </div>
          <Interruttore acceso={s.titoli} cambia={() => void titoli()} etichetta={t('Anche i titoli delle finestre')} />
        </div>
      )}

      {(acceso || s.osservate > 0) && (
        <div className="f-riga">
          <div className="f-nome">{t('Cancella le osservazioni')}</div>
          <BottoneSicuro fai={cancella} guaio={f => setGuaio(t(f))} titolo={t('Cancella le osservazioni')}>{t('Cancella')}</BottoneSicuro>
        </div>
      )}

      {guaio && <div className="f-stato rame">{guaio}</div>}
    </>
  )
}
