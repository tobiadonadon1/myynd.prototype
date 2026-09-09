import type { ReactNode } from 'react'
import { Marchio } from '../components/Marchio'
import { IconFreccia } from '../icons'
import { t } from '../lingua'
import { LightField } from './LightField'
import './onboarding.css'

export type Momento = 0 | 1 | 2 | 3

export function Scena({ momento, children, progetto, salvato, esci, occupato, uscita, accountEmail, progressione, benvenuto = false, intro = false }: {
  momento: Momento; children: ReactNode; progetto?: string; salvato?: boolean; esci?: () => void; occupato?: boolean; uscita?: string; accountEmail: string; progressione: number; benvenuto?: boolean
  /** L'introduzione: testo e figura affiancati, più larghi delle domande. */
  intro?: boolean
}) {
  return <main className={`onboard-scene moment-${momento} ${benvenuto ? 'is-welcome' : 'is-question'}${intro ? ' is-intro' : ''}`}>
    <LightField quiet={!benvenuto} stage={progressione} />
    <div className="onboard-shade" aria-hidden="true" />
    <header className="onboard-header">
      {/* il marchio da solo: la parola la dice la schermata */}
      <Marchio dim={34} animato={false} />
      {/* si esce: la freccia va fuori dall'angolo, non avanti */}
      {esci && <button disabled={occupato} className="onboard-exit" onClick={esci}>{uscita ?? t('Completo più tardi')}<span className="onboard-arrow"><IconFreccia verso="fuori" size={13} /></span></button>}
    </header>
    <div className="onboard-composition">
      <section className="onboard-panel" key={benvenuto ? 'welcome' : momento} aria-label={t('Il primo avvio')}>
        {!benvenuto && momento > 0 && progetto && <span className="onboard-kicker">{progetto}</span>}
        {children}
      </section>
    </div>
    <footer className="onboard-footer"><span className="onboard-account-email">{accountEmail}</span><span>{salvato ? t('Puoi chiudere. Ripartirai da qui.') : 'Your mind. In motion.'}</span></footer>
  </main>
}

export function OnboardErrore({ testo }: { testo: string }) {
  return testo ? <div className="onboard-error" role="alert">{t(testo)}</div> : null
}
export function OnboardAttesa({ testo }: { testo: string }) {
  return <div className="onboard-working" role="status"><span aria-hidden="true" className="onboard-working-mark" /><p>{t(testo)}</p></div>
}
