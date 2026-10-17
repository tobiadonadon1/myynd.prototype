// «Cosa ho visto oggi»: gli episodi del giorno, ora per ora, e il diario.
//
// Sta in Memoria, sopra «Come lavori», solo dentro l'app sul Mac. Ogni ora
// ha il suo «Dimentica quest'ora», e in fondo «Dimentica oggi»: tolgono le
// osservazioni, gli episodi che ne nascono e le righe del diario che ci
// poggiavano. La pagina si rifà con quello che il server rimanda, che è
// già senza. Una riga di stato dice cosa esce dal Mac; nient'altro spiega.

import { useCallback, useEffect, useState } from 'react'
import { gemelloApi, type VistaOggi } from '../api'
import { loc, t } from '../lingua'
import { BottoneSicuro } from '../ui'
import { Bottone, Carta } from '../components/forme'
import { useOsservatoreDisponibile } from './PreferenzeOsservatore'

const ora = (iso: string) => new Date(iso).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })

/** Gli episodi messi per ora d'inizio, in ordine: la chiave è l'istante dell'ora piena. */
export function perOra(episodi: VistaOggi['episodi']): { ora: string; episodi: VistaOggi['episodi'] }[] {
  const gruppi = new Map<string, VistaOggi['episodi']>()
  for (const e of episodi) {
    const d = new Date(e.inizio)
    d.setMinutes(0, 0, 0)
    const k = d.toISOString()
    gruppi.set(k, [...(gruppi.get(k) ?? []), e])
  }
  return [...gruppi.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ ora: k, episodi: v }))
}

export function CosaHoVisto() {
  const disponibile = useOsservatoreDisponibile()
  const [v, setV] = useState<VistaOggi | null>(null)
  const [guaio, setGuaio] = useState('')
  const [via, setVia] = useState<string | null>(null)

  const carica = useCallback(async () => {
    try { setV(await gemelloApi.oggi()) } catch { setV(null) }
  }, [])
  useEffect(() => { if (disponibile) void carica() }, [disponibile, carica])

  if (!disponibile || !v) return null

  // il gesto si vede subito: l'ora sparisce, e torna se il server dice di no
  const dimenticaOra = async (quando: string) => {
    const prima = v
    setVia(quando); setGuaio('')
    setV({ ...v, episodi: v.episodi.filter(e => !perOra([e]).some(g => g.ora === quando)) })
    try { setV(await gemelloApi.dimenticaOra(quando)) } catch (e) { setV(prima); setGuaio(e instanceof Error ? t(e.message) : String(e)) } finally { setVia(null) }
  }
  const dimenticaOggi = async () => {
    const prima = v
    setV({ ...v, episodi: [], diario: [] })
    try { setV(await gemelloApi.dimenticaOggi()) } catch (e) { setV(prima); throw e }
  }

  const ore = perOra(v.episodi)
  const progetti = [...new Set(v.diario.map(r => r.nomeProgetto ?? ''))]
  return (
    <div className="f-griglia">
      <Carta titolo={t('Cosa ho visto oggi')} id="visto-oggi" larga
        stato={t('Al modello: nomi di app, documenti e siti, e il diario. Il testo delle finestre mai.')}>
        {v.avviso && (
          <div className="f-riga">
            <div className="f-nome">{t('La linea delle attività è accesa. Si mette in pausa dalla barra dei menu o qui nelle Preferenze.')}</div>
            <Bottone tipo="parola" piccolo onClick={() => { setV({ ...v, avviso: false }); gemelloApi.imposta({ avvisoVisto: true }).catch(() => setV(v)) }}>{t('Ho capito')}</Bottone>
          </div>
        )}
        {!ore.length && <div className="f-stato">{t('Niente ancora oggi.')}</div>}
        {ore.map(g => (
          <div key={g.ora} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="mem-titoletto" style={{ margin: 0 }}>{ora(g.ora)}</span>
              <Bottone tipo="parola" piccolo occupato={via === g.ora} onClick={() => void dimenticaOra(g.ora)}>{t('Dimentica quest’ora')}</Bottone>
            </div>
            {g.episodi.map(e => (
              <div key={e.id} className="f-riga" style={{ minWidth: 0 }}>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div className="f-nome" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.etichetta}</div>
                  <div className="f-stato">{`${ora(e.inizio)}-${ora(e.fine)}${e.nomeProgetto ? ` · ${e.nomeProgetto}` : ''}${e.minuti ? ` · ${e.minuti} min` : ''}`}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {progetti.map(p => (
          <div key={p || 'altro'} style={{ marginTop: 8 }}>
            <div className="mem-titoletto">{p || t('Senza progetto')}</div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {v.diario.filter(r => (r.nomeProgetto ?? '') === p).map(r => <li key={r.id}>{r.testo}</li>)}
            </ul>
          </div>
        ))}
        {(ore.length > 0 || v.diario.length > 0) && (
          <div className="f-riga">
            <div className="f-nome">{t('Dimentica oggi')}</div>
            <BottoneSicuro fai={dimenticaOggi} guaio={f => setGuaio(t(f))} titolo={t('Dimentica oggi')}>{t('Dimentica')}</BottoneSicuro>
          </div>
        )}
        {guaio && <div className="f-stato rame">{guaio}</div>}
      </Carta>
    </div>
  )
}
