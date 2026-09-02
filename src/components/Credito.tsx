// Il cartellino del conto a secco.
//
// Il credito finito non è un guasto: è una cosa da fare, e ha tre passi. Ma
// arriva sempre nel momento sbagliato — dentro una risposta, dentro
// un'automazione che gira alle sette del mattino — e lì diventa una riga rossa
// che sparisce, o niente. Chi la riceve non capisce di aver toccato una
// questione di soldi, riprova, e conclude che l'app è rotta.
//
// Il 2 settembre 2026 è successo due volte alla stessa persona, sulla stessa
// schermata, la seconda volta con la correzione già installata. Quindi adesso
// non è più una riga: è una finestra, con la frase di chi ha detto di no, cosa
// fare, e il bottone che ci porta.

import { useRef, useState } from 'react'
import { Hov, useFocoDialogo } from '../ui'
import { t } from '../lingua'
import { api } from '../api'

const BILLING = 'https://console.anthropic.com/settings/billing'

/**
 * Un passo, numerato.
 *
 * Numerati perché sono davvero in ordine: senza il conto aperto non c'è la
 * voce Billing, senza credito non riparte niente. È l'unico caso in cui una
 * cifra davanti a una riga dice qualcosa invece di decorarla.
 */
function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'baseline' }}>
      <span aria-hidden="true" style={{
        flex: '0 0 auto', width: 19, height: 19, borderRadius: 99,
        background: 'rgba(34,39,31,.07)', color: 'rgba(34,39,31,.55)',
        fontSize: 11, fontVariantNumeric: 'tabular-nums',
        display: 'grid', placeItems: 'center', transform: 'translateY(2px)'
      }}>{n}</span>
      <span style={{ flex: 1, fontSize: '13.5px', lineHeight: 1.55, color: 'rgba(34,39,31,.78)' }}>{children}</span>
    </div>
  )
}

export function Credito({ motivo, claude, chiudi }: {
  /** La frase con cui il fornitore ha detto di no. Sua, e quindi nella sua lingua. */
  motivo: string
  /** Il motore è Claude: allora la voce Billing è quella di Anthropic e la si può aprire. */
  claude: boolean
  chiudi: () => void
}) {
  const finestra = useRef<HTMLDivElement>(null)
  const [chiudendo, setChiudendo] = useState(false)
  useFocoDialogo(finestra, chiudi)

  // Il segno sta sul server, e va tolto lì: chiuderlo solo qui vorrebbe dire
  // ritrovarselo al prossimo caricamento senza che sia successo niente di nuovo.
  const capito = async () => {
    setChiudendo(true)
    try { await api.creditoVisto() } catch { /* si richiude comunque: è un avviso, non un lucchetto */ }
    chiudi()
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) capito() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center',
        background: 'rgba(40,30,22,.34)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        WebkitAppRegion: 'no-drag', padding: 24
      } as React.CSSProperties}>
      <div ref={finestra} role="dialog" aria-modal="true" aria-labelledby="credito-titolo" style={{
        width: 460, maxWidth: '100%', borderRadius: 20, padding: '26px 26px 20px',
        background: 'rgba(250,246,239,.98)', border: '1px solid rgba(255,255,255,.9)',
        boxShadow: '0 40px 90px rgba(60,44,30,.34)', animation: 'toastin .3s ease',
        color: '#22271F'
      }}>
        <div id="credito-titolo" style={{ fontSize: 21, letterSpacing: '-.02em', fontWeight: 500 }}>
          {claude ? t('Il conto Anthropic è senza credito') : t('Il conto del fornitore è senza credito')}
        </div>
        <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.6)', marginTop: 7, lineHeight: 1.5 }}>
          {t('La chiave funziona. È il credito che manca: senza, ogni richiesta viene respinta e Myynd resta un archivio.')}
        </div>

        {/*
          La frase di chi ha detto di no, testuale.
          Non si traduce e non si riassume: è l'unica riga che dice cosa è
          successo davvero, e riportarla per intero è il motivo per cui la
          prossima persona che ci finisce sopra ci mette un minuto e non un
          pomeriggio. Sfonda se è lunga, quindi scorre invece di sbordare.
        */}
        <div style={{
          marginTop: 16, padding: '11px 13px', borderRadius: 11,
          background: 'rgba(34,39,31,.05)', border: '1px solid rgba(34,39,31,.07)',
          fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(34,39,31,.7)',
          maxHeight: 108, overflowY: 'auto', overflowWrap: 'anywhere'
        }}>{motivo}</div>

        {claude && (
          <div style={{ display: 'grid', gap: 9, marginTop: 18 }}>
            <Passo n={1}>{t('Entra su console.anthropic.com con lo stesso conto della chiave.')}</Passo>
            <Passo n={2}>{t('Apri Billing e aggiungi credito: anche il minimo basta per cominciare.')}</Passo>
            <Passo n={3}>{t('Torna qui. Non c’è niente da ricollegare: riparte da sola.')}</Passo>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
          <div style={{ flex: 1 }} />
          <Hov as="button" type="button" onClick={capito}
            style={{
              border: 'none', background: 'none', padding: '8px 6px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '13px', color: 'rgba(34,39,31,.5)'
            }}
            hover={{ color: '#22271F' }}>{chiudendo ? t('Chiudo…') : t('Ho capito')}</Hov>
          {claude && (
            <Hov as="a" href={BILLING} target="_blank" rel="noreferrer" onClick={capito}
              style={{
                padding: '9px 20px', borderRadius: 99, background: '#22271F', color: '#FFF7F0',
                fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', textDecoration: 'none'
              }}
              hover={{ background: '#3E5140' }}>{t('Apri Billing')}</Hov>
          )}
        </div>
      </div>
    </div>
  )
}
