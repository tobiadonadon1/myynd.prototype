import type { PassoCompito } from '../api'
import { frasi, t, loc } from '../lingua'
import './aurora-compito.css'

/** Purely decorative; the visible status below describes actual worker events. */
export function AuroraCompito() {
  return <span className="task-aurora" aria-hidden="true"><i /><i /><i /></span>
}

export function PassoAttivo({ passo }: { passo: PassoCompito }) {
  const testo = passo.passo === 'preparo' ? (loc().startsWith('en') ? 'Preparing your task…' : 'Preparazione…')
    : passo.passo === 'cerco' ? frasi.passoCerco(passo.dettaglio ?? '')
    : passo.passo === 'apro' ? frasi.passoApro(passo.dettaglio ?? '')
      : [t('Scrivo…'), passo.dettaglio].filter(Boolean).join(' ')
  return <div className="task-working-step" role="status" aria-live="polite">{testo}</div>
}
