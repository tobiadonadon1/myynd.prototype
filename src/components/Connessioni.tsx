// Il pannello Connessioni: si apre da qualsiasi punto dell'app per collegare
// o scollegare una fonte. Non fa ricominciare l'onboarding.

import { useEffect, useState } from 'react'
import { api, type Stato } from '../api'
import { Form } from './forms'
import { Hov } from '../ui'
import { IconPiu } from '../icons'

const COLORE: Record<string, string> = {
  posta: '#C4553C', desktop: '#E0A44A', notion: '#5B9BC9', claude: '#7FA98A'
}

export function Connessioni({ chiudi, cambiato }: { chiudi: () => void; cambiato: () => void }) {
  const [s, setS] = useState<Stato | null>(null)
  const [aperto, setAperto] = useState<string | null>(null)
  const [sincronizzando, setSincronizzando] = useState<string | null>(null)

  const ricarica = async () => { const n = await api.stato(); setS(n); return n }
  useEffect(() => { ricarica().catch(() => {}) }, [])

  const leggi = async (fonte: string) => {
    setSincronizzando(fonte)
    try {
      await api.sincronizza(m => { if (m.fase !== 'fine') setSincronizzando(`${m.fase} · ${m.stato}`) }, fonte)
      await ricarica()
      cambiato()
    } catch { /* l'errore si vede dal conteggio che non sale */ }
    setSincronizzando(null)
  }

  const pronti = s?.connettori.filter(c => c.pronto) ?? []
  const dopo = s?.connettori.filter(c => !c.pronto) ?? []

  return (
    <>
      <div onClick={chiudi} style={{
        position: 'absolute', inset: 0, background: 'rgba(40,30,22,.34)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 60
      }} />
      <div style={{
        position: 'absolute', top: 60, bottom: 60, left: '50%', transform: 'translateX(-50%)',
        width: 620, maxWidth: '88%', zIndex: 61, display: 'flex', flexDirection: 'column',
        borderRadius: '26px 22px 26px 20px', background: 'rgba(255,253,249,.97)',
        border: '1px solid rgba(255,255,255,.95)', boxShadow: '0 40px 90px rgba(60,44,30,.34)',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px 16px', borderBottom: '1px solid rgba(34,39,31,.08)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 21, letterSpacing: '-.02em' }}>Connessioni</div>
            <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.6)', marginTop: 3 }}>
              {s ? `${s.conteggi.totale.toLocaleString('it-IT')} documenti letti` : 'carico…'}
            </div>
          </div>
          <button onClick={chiudi} style={{ border: 'none', background: 'none', color: 'rgba(34,39,31,.55)', fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pronti.map(c => {
              const colore = COLORE[c.id] ?? '#C4623B'
              const apertoQui = aperto === c.id
              return (
                <div key={c.id} style={{
                  borderRadius: 18,
                  border: `1px solid ${c.collegato ? 'rgba(34,39,31,.14)' : 'rgba(34,39,31,.09)'}`,
                  background: c.collegato ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.4)',
                  overflow: 'hidden'
                }}>
                  <div onClick={() => setAperto(apertoQui ? null : c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', cursor: 'pointer' }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%', flex: 'none',
                      background: c.collegato ? colore : 'rgba(34,39,31,.2)',
                      boxShadow: c.collegato ? `0 0 0 5px ${colore}22` : 'none'
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15 }}>{c.nome}</div>
                      <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.58)', marginTop: 3 }}>
                        {c.collegato ? (c.documenti ? `${c.documenti.toLocaleString('it-IT')} documenti letti` : 'collegato') : c.nota}
                      </div>
                    </div>
                    {c.collegato ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 'none' }}>
                        {c.id !== 'claude' && (
                          <Hov as="button"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); leggi(c.id) }}
                            style={{ border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.7)', borderRadius: 99, padding: '6px 13px', color: '#22271F', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}
                            hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>
                            {sincronizzando && sincronizzando.startsWith(c.id) ? 'leggo…' : 'Rileggi'}
                          </Hov>
                        )}
                        <Hov as="button"
                          onClick={async (e: React.MouseEvent) => { e.stopPropagation(); await api.scollega(c.id); await ricarica(); cambiato() }}
                          style={{ border: 'none', background: 'none', color: 'rgba(34,39,31,.45)', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}
                          hover={{ color: '#C4623B' }}>Scollega</Hov>
                      </div>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12.5px', color: '#8E3F1F', flex: 'none' }}>
                        <IconPiu size={13} />Collega
                      </span>
                    )}
                  </div>
                  {apertoQui && !c.collegato && (
                    <div style={{ padding: '2px 18px 18px', animation: 'fadein .2s ease' }}>
                      <Form id={c.id} tema="chiaro" ok={async () => {
                        await ricarica()
                        setAperto(null)
                        cambiato()
                        if (c.id !== 'claude') leggi(c.id)
                      }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(34,39,31,.45)', margin: '26px 0 12px' }}>
            Più avanti
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dopo.map(c => (
              <span key={c.id} title={c.nota} style={{
                padding: '8px 14px', borderRadius: 99, fontSize: '12.5px',
                border: '1px dashed rgba(34,39,31,.18)', color: 'rgba(34,39,31,.42)'
              }}>{c.nome}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
