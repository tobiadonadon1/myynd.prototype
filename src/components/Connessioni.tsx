// Il pannello Connessioni: si apre da qualsiasi punto dell'app per collegare
// o scollegare una fonte. Non fa ricominciare l'onboarding.

import { useEffect, useRef, useState } from 'react'
import { api, rigaSincronizzazione, type Stato } from '../api'
import { Form } from './forms'
import { frasi, lingua, loc, t } from '../lingua'
import { BottoneSicuro, Hov, daTastiera, useFocoDialogo } from '../ui'
import { IconPiu } from '../icons'

/**
 * Il pallino di ogni fonte.
 *
 * Le tinte sono le stesse degli attrezzi in `attrezzi.ts`, e devono restare
 * le stesse: una fonte che è verde nel pannello delle connessioni e blu sulla
 * pastiglia di un'automazione è una fonte che sembra due cose diverse.
 */
const COLORE: Record<string, string> = {
  posta: '#C4553C', calendario: '#A8763F', desktop: '#E0A44A', notion: '#5B9BC9', claude: '#7FA98A',
  google: '#C4623B', microsoft: '#B4573A', slack: '#3D8A6E', whatsapp: '#4E8C3F',
  drive: '#2E6FBF', sharepoint: '#1F6F74', dropbox: '#3B5BC4', mind2do: '#8E7CC3',
  compatibile: '#6B7FB3'
}

/** Quelli che ragionano e non leggono: niente da rileggere, niente da contare. */
const MOTORI = ['claude', 'compatibile']

export function Connessioni({ fonte, chiudi, cambiato }: {
  /** La fonte da aprire già espansa; stringa vuota per l'elenco intero. */
  fonte?: string
  chiudi: () => void
  cambiato: () => void
}) {
  const [s, setS] = useState<Stato | null>(null)
  const [aperto, setAperto] = useState<string | null>(fonte || null)
  /**
   * Una fonte sola, quando è una fonte sola che hai chiesto.
   *
   * Cliccando «Posta» si apriva l'elenco intero con Posta espansa in mezzo:
   * quattro card, tre delle quali non c'entravano niente con quello che
   * stavi per fare. Chi clicca Posta vuole Posta. L'elenco resta a un clic,
   * per chi lo cerca.
   */
  const [soloQuesta, setSoloQuesta] = useState(fonte || '')
  const [sincronizzando, setSincronizzando] = useState<string | null>(null)
  // una password IMAP scaduta, dopo «Rileggi», prima non produceva niente:
  // il conteggio non saliva, e basta
  const [guaio, setGuaio] = useState<string | null>(null)
  // il fuoco entra con il pannello, Esc lo chiude, e alla chiusura torna a chi l'ha aperto
  const finestra = useRef<HTMLDivElement>(null)
  useFocoDialogo(finestra, chiudi)

  const ricarica = async () => { const n = await api.stato(); setS(n); return n }
  useEffect(() => { ricarica().catch(() => {}) }, [])

  const leggi = async (fonte: string) => {
    setSincronizzando(fonte)
    setGuaio(null)
    try {
      await api.sincronizza(m => { if (m.fase !== 'fine') setSincronizzando(rigaSincronizzazione(m)) }, fonte)
      await ricarica()
      cambiato()
    } catch (e) {
      setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a rileggere questa fonte.'))
    }
    setSincronizzando(null)
  }

  const tutti = s?.connettori.filter(c => c.pronto || c.collegato) ?? []
  const pronti = soloQuesta ? tutti.filter(c => c.id === soloQuesta) : tutti
  const dopo = soloQuesta ? [] : (s?.connettori.filter(c => !c.pronto && !c.collegato) ?? [])
  const messaFuoco = !!soloQuesta && pronti.length === 1

  // Quello che si può collegare senza chiedere niente a nessuno: le cartelle
  // di casa, e la chiave di Claude se è già nell'ambiente. Posta e Notion no —
  // una password e un token non si possono indovinare, e fingere che un
  // pulsante li risolva sarebbe solo un pulsante che fallisce.
  const [subito, setSubito] = useState<string[]>([])
  const [collegando, setCollegando] = useState(false)
  useEffect(() => {
    if (!s) return
    const puoi: string[] = []
    const desktop = s.connettori.find(c => c.id === 'desktop')
    if (desktop && !desktop.collegato && s.suggerimentiDesktop.length) puoi.push('desktop')
    api.chiaveNellAmbiente().then(r => {
      const claude = s.connettori.find(c => c.id === 'claude')
      setSubito(r.presente && claude && !claude.collegato ? [...puoi, 'claude'] : puoi)
    }).catch(() => setSubito(puoi))
  }, [s])

  const collegaSubito = async () => {
    setCollegando(true)
    setGuaio(null)
    try {
      if (subito.includes('desktop') && s) await api.collegaDesktop(s.suggerimentiDesktop)
      if (subito.includes('claude')) await api.usaChiaveAmbiente()
      await ricarica()
      cambiato()
      if (subito.includes('desktop')) leggi('desktop')
    } catch (e) {
      setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a collegare.'))
    } finally { setCollegando(false) }
  }

  return (
    <>
      <div onClick={chiudi} style={{
        position: 'absolute', inset: 0, background: 'rgba(40,30,22,.34)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 60
      }} />
      <div ref={finestra} role="dialog" aria-modal="true" aria-labelledby="connessioni-titolo" style={{
        position: 'absolute', top: 60, bottom: 60, left: '50%', transform: 'translateX(-50%)',
        width: 620, maxWidth: '88%', zIndex: 61, display: 'flex', flexDirection: 'column',
        borderRadius: '26px 22px 26px 20px', background: 'rgba(255,253,249,.97)',
        border: '1px solid rgba(255,255,255,.95)', boxShadow: '0 40px 90px rgba(60,44,30,.34)',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px 16px', borderBottom: '1px solid rgba(34,39,31,.08)' }}>
          <div style={{ flex: 1 }}>
            <div id="connessioni-titolo" style={{ fontSize: 21, letterSpacing: '-.02em' }}>
              {messaFuoco ? t(pronti[0].nome) : t('Connessioni')}
            </div>
            <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.6)', marginTop: 3 }}>
              {messaFuoco ? (
                <Hov as="button" onClick={() => { setSoloQuesta(''); setAperto(null) }}
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', color: 'rgba(34,39,31,.6)' }}
                  hover={{ color: '#8E3F1F' }}>{t('‹ tutte le fonti')}</Hov>
              ) : (s ? frasi.documentiLetti(s.conteggi.totale.toLocaleString(loc())) : t('carico…'))}
            </div>
            {/* Una riga sua, e non il posto del ritorno «‹ tutte le fonti»:
                aperto su una fonte sola — che è come ci si arriva dallo schermo
                dei connettori — il guasto della rilettura non compariva, cioè
                proprio nel caso per cui era stato scritto. */}
            {guaio && (
              <div role="status" style={{ fontSize: '12.5px', color: '#8E3F1F', marginTop: 4, overflowWrap: 'anywhere' }}>
                {guaio}
              </div>
            )}
          </div>
          <button onClick={chiudi} title={t('Chiudi')} aria-label={t('Chiudi')} style={{ border: 'none', background: 'none', color: 'rgba(34,39,31,.55)', fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
          {subito.length > 0 && !messaFuoco && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, padding: '15px 18px',
              borderRadius: 18, border: '1px solid rgba(196,98,59,.28)', background: 'rgba(196,98,59,.07)'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15 }}>{frasi.collegabiliOra(subito.length)}</div>
                <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.62)', marginTop: 3, lineHeight: 1.5 }}>
                  {subito.includes('desktop') && t('Scrivania, Documenti e Download in sola lettura')}
                  {subito.length === 2 && t(', e ')}
                  {subito.includes('claude') && t('la chiave di Claude che è già qui')}
                  {t('. Le altre no: servono le tue credenziali.')}
                </div>
              </div>
              <button onClick={collegaSubito} disabled={collegando} style={{
                flex: 'none', padding: '11px 20px', borderRadius: 99, border: 'none',
                background: collegando ? 'rgba(34,39,31,.18)' : 'linear-gradient(120deg,#C4623B,#7E9C82)',
                color: collegando ? 'rgba(34,39,31,.5)' : '#FFF7F0',
                fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit',
                cursor: collegando ? 'default' : 'pointer'
              }}>{collegando ? t('Collego…') : t('Consenti')}</button>
            </div>
          )}

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
                  <div role="button" tabIndex={0} aria-expanded={apertoQui}
                    onClick={() => setAperto(apertoQui ? null : c.id)}
                    onKeyDown={daTastiera(() => setAperto(apertoQui ? null : c.id))}
                    style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', cursor: 'pointer' }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%', flex: 'none',
                      background: c.collegato ? colore : 'rgba(34,39,31,.2)',
                      boxShadow: c.collegato ? `0 0 0 5px ${colore}22` : 'none'
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15 }}>{t(c.nome)}</div>
                      <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.58)', marginTop: 3, overflowWrap: 'anywhere' }}>
                        {c.collegato
                          // per il fornitore compatibile la riga utile è quale: nome e modello, non «collegato»
                          ? (c.id === 'compatibile' && s?.config.compatibile
                            ? [s.config.compatibile.nome, s.config.compatibile.modello].filter(Boolean).join(' · ')
                            : c.documenti ? frasi.nDocumenti(c.documenti.toLocaleString(lingua() === 'en' ? 'en-GB' : 'it-IT')) : t('collegato'))
                          : t(c.nota)}
                      </div>
                    </div>
                    {c.collegato ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 'none' }}>
                        {/*
                          «Rileggi» solo dove c'è qualcosa da rileggere.
                          Claude non è una fonte, e WhatsApp non si può
                          chiedere: i messaggi li spinge Meta mentre arrivano.
                          Un bottone che gira a vuoto è peggio di un bottone
                          che non c'è — fa credere che la fonte sia rotta.
                        */}
                        {!MOTORI.includes(c.id) && c.id !== 'whatsapp' && (
                          <Hov as="button"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); leggi(c.id) }}
                            style={{ border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.7)', borderRadius: 99, padding: '6px 13px', color: '#22271F', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}
                            hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>
                            {sincronizzando && sincronizzando.startsWith(c.id) ? t('leggo…') : t('Rileggi')}
                          </Hov>
                        )}
                        {/* il fornitore si può cambiare senza scollegarlo: indirizzo, modello o chiave */}
                        {c.id === 'compatibile' && (
                          <Hov as="button"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setAperto(apertoQui ? null : c.id) }}
                            style={{ border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.7)', borderRadius: 99, padding: '6px 13px', color: '#22271F', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}
                            hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>
                            {t('Cambia')}
                          </Hov>
                        )}
                        {/* scollegare chiede una volta: le automazioni che aprono questa fonte si fermano */}
                        <BottoneSicuro titolo={t('Scollega')}
                          fai={async () => { await api.scollega(c.id); await ricarica(); cambiato() }}>
                          {t('Scollega')}
                        </BottoneSicuro>
                      </div>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12.5px', color: '#8E3F1F', flex: 'none' }}>
                        <IconPiu size={13} />{t('Collega')}</span>
                    )}
                  </div>
                  {apertoQui && (!c.collegato || c.id === 'compatibile') && (
                    <div style={{ padding: '2px 18px 18px', animation: 'fadein .2s ease' }}>
                      <Form id={c.id} tema="chiaro" ok={async () => {
                        await ricarica()
                        setAperto(null)
                        cambiato()
                        if (!MOTORI.includes(c.id)) leggi(c.id)
                      }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!messaFuoco && <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(34,39,31,.45)', margin: '26px 0 12px' }}>{t('Più avanti')}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dopo.map(c => (
              <span key={c.id} title={t(c.nota)} style={{
                padding: '8px 14px', borderRadius: 99, fontSize: '12.5px',
                border: '1px dashed rgba(34,39,31,.18)', color: 'rgba(34,39,31,.42)'
              }}>{t(c.nome)}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
