/**
 * trasparenza — cosa legge, cosa scrive, cosa esce dal computer, e sotto
 * il registro di quel che è stato fatto davvero, giorno per giorno.
 */

import { useEffect, useState } from 'react'
import type { ActivityDay, TransparencyInfo } from '@shared/types'
import { api } from '../lib/api'

function formattaOra(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function formattaNumero(n: number): string {
  return n.toLocaleString('it-IT')
}

export function Trasparenza() {
  const [info, setInfo] = useState<TransparencyInfo | null>(null)
  const [giorni, setGiorni] = useState<ActivityDay[]>([])

  useEffect(() => {
    let annullato = false
    Promise.all([api.getTransparency(), api.getActivity()]).then(([t, a]) => {
      if (annullato) return
      setInfo(t)
      setGiorni(a)
    })
    return () => {
      annullato = true
    }
  }, [])

  if (!info) return null

  return (
    <div className="screen">
      <h1 className="screen-title">trasparenza</h1>

      <div className="transparency">
        <section className="t-section">
          <p className="t-section__name">cosa legge</p>
          {info.reads.map((r, i) => (
            <div className="t-item" key={i}>
              <span className="t-item__label">{r.label}</span>
              <span className="t-item__detail">{r.detail}</span>
            </div>
          ))}
        </section>

        <section className="t-section">
          <p className="t-section__name">cosa scrive</p>
          {info.writes.map((w, i) => (
            <div className="t-item" key={i}>
              <span className="t-item__label">{w.label}</span>
              <span className="t-item__detail">{w.detail}</span>
            </div>
          ))}
        </section>

        <section className="t-section">
          <p className="t-section__name">cosa esce dal computer</p>
          {info.leaves.map((l, i) => (
            <div className="t-item" key={i}>
              <span className="t-item__label">{l.label}</span>
              <span className="t-item__detail">{l.detail}</span>
            </div>
          ))}
        </section>

        <p className="t-counts">
          {formattaNumero(info.counts.messages)} messaggi · {formattaNumero(info.counts.docs)} documenti ·{' '}
          {formattaNumero(info.counts.chunks)} frammenti · {info.modelName}
        </p>
      </div>

      {giorni.length > 0 && (
        <>
          <hr className="rule" />
          {giorni.map((giorno) => (
            <div className="log-day" key={giorno.date}>
              <p className="log-day__label">{giorno.label}</p>
              {giorno.entries.map((e) => (
                <div className="log-entry" key={e.id}>
                  <span className="log-entry__time">{formattaOra(e.at)}</span>
                  <span className="log-entry__text">{e.text}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
