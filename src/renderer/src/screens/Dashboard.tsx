/**
 * oggi — home. Cosa aspetta, cosa ha fatto. La scena d'apertura del
 * prodotto passa da qui: la finestra torna in primo piano e quel che
 * aspetta una persona è già lì, con il punto d'attesa, senza nient'altro
 * a contendersi l'attenzione.
 */

import { useEffect, useState } from 'react'
import type { DashboardState } from '@shared/types'
import { api } from '../lib/api'
import { pollUntilReady } from '../lib/pollUntilReady'
import { BUDGET_DASHBOARD_PRONTA, dashboardPronta, inPreparazione } from '../lib/preparazione'
import type { Vista } from '../App'

interface DashboardProps {
  onNavigate: (v: Vista) => void
}

function formattaOra(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [stato, setStato] = useState<DashboardState | null>(null)
  const [nonRaggiungibile, setNonRaggiungibile] = useState(false)

  useEffect(() => {
    // stessa ragione di App.tsx: al cold start il modello può risolversi
    // pochi secondi dopo il primo mount, e questa è la scena d'apertura
    // del prodotto — non deve restare bloccata su "non raggiungibile"
    // mentre il lavoro preparato è già lì. Non basta che il modello sia
    // pronto: se le bozze si stanno ancora rigenerando (`preparing`), la
    // lista d'attesa che questa schermata mostra non riflette ancora la
    // realtà, quindi si continua a chiedere finché non si assesta anche
    // quella — non solo il modello.
    return pollUntilReady(() => api.getDashboard(), dashboardPronta, (s) => setStato(s), {
      ...BUDGET_DASHBOARD_PRONTA,
      // tutti i tentativi sono falliti, mai una sola lettura riuscita:
      // senza questo `stato` resterebbe `null` per sempre, uno schermo
      // bianco senza spiegazione invece di uno stato onesto.
      onUnavailable: () => setNonRaggiungibile(true),
    })
  }, [])

  if (!stato) {
    if (!nonRaggiungibile) return null
    return (
      <div className="screen">
        <div className="firstrun">
          <p className="firstrun__lede">claude non raggiungibile.</p>
        </div>
      </div>
    )
  }

  if (!stato.model.ready) {
    return (
      <div className="screen">
        <div className="firstrun">
          <p className="firstrun__lede">{stato.model.reason?.trim() || 'claude non collegato.'}</p>
          <p className="firstrun__status">il lavoro già preparato resta leggibile.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1 className="screen-title">oggi</h1>

      {stato.waiting.length === 0 ? (
        <div className="empty">
          {inPreparazione(stato) ? 'sto preparando il lavoro in attesa.' : 'niente in attesa.'}
        </div>
      ) : (
        <div className="waiting">
          {stato.waiting.map((p) => (
            <button
              key={p.id}
              className="waiting-item"
              onClick={() => onNavigate({ s: 'attesa', id: p.id })}
            >
              <span className="dot-attesa" />
              <span className="waiting-item__title">
                <span className="waiting-item__who">{p.who.name}</span>
                {p.title}
              </span>
              <span className="waiting-item__when">{formattaOra(p.receivedAt)}</span>
              <span className="waiting-item__reason">{p.reason}</span>
            </button>
          ))}
        </div>
      )}

      {stato.recent.length > 0 && (
        <>
          <hr className="rule" />
          <div className="log-day">
            <p className="log-day__label">oggi</p>
            {stato.recent.map((e) => (
              <div className="log-entry" key={e.id}>
                <span className="log-entry__time">{formattaOra(e.at)}</span>
                <span className="log-entry__text">{e.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
