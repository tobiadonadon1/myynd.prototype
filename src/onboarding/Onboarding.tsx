import { useEffect, useMemo, useRef, useState } from 'react'
import { frasi, t } from '../lingua'
import { Campo } from './campo'
import { api, rigaSincronizzazione, type Abbonamento, type Stato } from '../api'
import { Hov } from '../ui'
import { IconPiu } from '../icons'
import { Form, FormClaude } from '../components/forms'
import { Stato as Indicatore } from '../components/Stato'
import { Logo } from '../components/Marchio'

const COLORI: Record<string, string> = {
  posta: '#C4553C',
  desktop: '#E0A44A',
  notion: '#5B9BC9',
  claude: '#7FA98A'
}

type Passo = 'risveglio' | 'claude' | 'nome' | 'connetti' | 'leggi' | 'genera' | 'pronta'

const CHIARO = '#F4EFE8'
const TENUE = 'rgba(244,239,232,.62)'

export function Onboarding({ stato, fatto }: { stato: Stato; fatto: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const campo = useMemo(() => new Campo(), [])
  const [passo, setPasso] = useState<Passo>('risveglio')
  const [s, setS] = useState(stato)
  const [nome, setNome] = useState(stato.config.nome ?? '')
  const [ruolo, setRuolo] = useState(stato.config.ruolo ?? '')

  const collegati = s.connettori.filter(c => c.pronto && c.collegato)
  const colori = collegati.length ? collegati.map(c => COLORI[c.id] ?? '#C4623B') : ['#8A7A6A']

  useEffect(() => {
    if (cv.current) campo.monta(cv.current)
    return () => campo.smonta()
  }, [campo])

  useEffect(() => {
    const coesione =
      passo === 'risveglio' ? 0 :
      passo === 'claude' ? 0.12 :
      passo === 'nome' ? 0.22 :
      passo === 'connetti' ? 0.2 + Math.min(0.55, collegati.length * 0.16) :
      passo === 'leggi' ? 0.86 : 1
    campo.imposta({
      coesione,
      colori,
      legami: passo === 'leggi' || passo === 'genera' || passo === 'pronta',
      quantita: passo === 'risveglio' ? 520 : 520 + Math.min(900, s.conteggi.totale * 2)
    })
  }, [passo, collegati.length, s.conteggi.totale, campo, colori])

  const ricarica = async () => { const n = await api.stato(); setS(n); return n }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#191715', color: CHIARO,
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", overflow: 'hidden'
    }}>
      <canvas ref={cv} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

      {/* il velo: il testo deve restare leggibile qualunque cosa passi dietro */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle 47vmin at 50% 48%, rgba(16,14,12,.72) 0%, rgba(16,14,12,.70) 58%, rgba(16,14,12,.42) 82%, rgba(16,14,12,0) 100%)'
      }} />

      <div style={{
        position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 24px', pointerEvents: 'none'
      }}>
        <div style={{
          width: 640, maxWidth: '100%', pointerEvents: 'auto',
          textShadow: '0 1px 24px rgba(12,10,8,.75)'
        }}>
          {passo === 'risveglio' && <Risveglio avanti={() => setPasso('claude')} />}
          {passo === 'claude' && (
            <PassoClaude
              collegato={!!s.connettori.find(c => c.id === 'claude')?.collegato}
              ricarica={ricarica}
              avanti={() => setPasso('nome')}
            />
          )}
          {passo === 'nome' && (
            <Nome
              nome={nome} setNome={setNome} ruolo={ruolo} setRuolo={setRuolo}
              avanti={async () => {
                try { await api.profilo({ nome, ruolo }) } catch { /* riprovabile dalle preferenze */ }
                setPasso('connetti')
              }}
            />
          )}
          {passo === 'connetti' && (
            <Connetti s={s} ricarica={ricarica} avanti={() => setPasso('leggi')} />
          )}
          {passo === 'leggi' && (
            <Leggi ricarica={ricarica} avanti={() => setPasso('genera')} />
          )}
          {passo === 'genera' && (
            <Genera s={s} avanti={() => setPasso('pronta')} />
          )}
          {passo === 'pronta' && (
            <Pronta totale={s.conteggi.totale} entra={async () => {
              try { await api.profilo({ onboarding: true }) } catch { /* si riapre al prossimo avvio */ }
              fatto()
            }} />
          )}
        </div>
      </div>

      <Passi corrente={passo} />
    </div>
  )
}

// — cornice comune —

function Errore({ testo }: { testo: string }) {
  if (!testo) return null
  return <div style={{ fontSize: '12.5px', color: '#E8907A', marginTop: 12, lineHeight: 1.5 }}>{t(testo)}</div>
}

function Titolo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 42, lineHeight: 1.14, letterSpacing: '-.035em', textWrap: 'pretty' }}>{children}</div>
}

function Sotto({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 16, lineHeight: 1.6, color: TENUE, marginTop: 16, maxWidth: 520, textWrap: 'pretty' }}>{children}</div>
}

function Primario({ onClick, children, disabilitato }: { onClick: () => void; children: React.ReactNode; disabilitato?: boolean }) {
  return (
    <Hov as="button" onClick={disabilitato ? undefined : onClick} disabled={disabilitato}
      style={{
        marginTop: 34, padding: '13px 28px', borderRadius: 99, border: 'none',
        background: disabilitato ? 'rgba(244,239,232,.16)' : CHIARO,
        color: disabilitato ? 'rgba(244,239,232,.45)' : '#191715',
        fontSize: 15, fontWeight: 500, cursor: disabilitato ? 'default' : 'pointer',
        fontFamily: 'inherit', transition: 'background .2s'
      }}
      hover={disabilitato ? {} : { background: '#FFFFFF' }}>{children}</Hov>
  )
}

function Passi({ corrente }: { corrente: Passo }) {
  const tutti: Passo[] = ['risveglio', 'claude', 'nome', 'connetti', 'leggi', 'genera', 'pronta']
  const i = tutti.indexOf(corrente)
  return (
    <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 7 }}>
      {tutti.map((p, k) => (
        <span key={p} style={{
          width: k === i ? 22 : 6, height: 6, borderRadius: 99,
          background: k <= i ? 'rgba(244,239,232,.8)' : 'rgba(244,239,232,.22)',
          transition: 'width .3s, background .3s'
        }} />
      ))}
    </div>
  )
}

// — i passi —

function Risveglio({ avanti }: { avanti: () => void }) {
  return (
    <div style={{ animation: 'fadein .8s ease' }}>
      <div style={{ marginBottom: 30 }}><Logo dim={34} testo={23} tinta={CHIARO} /></div>
      <Titolo>{t('Questa mente è vuota.')}</Titolo>
      <Sotto>{t('Riempila con quello che leggi e scrivi.')}</Sotto>
      <Primario onClick={avanti}>{t('Cominciamo')}</Primario>
    </div>
  )
}

const CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', marginTop: 10, padding: '13px 16px',
  borderRadius: 14, border: '1px solid rgba(244,239,232,.22)', background: 'rgba(244,239,232,.06)',
  color: CHIARO, fontSize: 15, fontFamily: 'inherit', outline: 'none'
}

const ETICHETTA: React.CSSProperties = {
  fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(244,239,232,.45)'
}

/** Una scelta che non è quella principale: testo, non bottone. */
function Secondario({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Hov as="button" onClick={onClick}
      style={{
        border: 'none', background: 'none', color: TENUE, fontSize: 14,
        cursor: 'pointer', fontFamily: 'inherit', padding: 0
      }}
      hover={{ color: CHIARO }}>{children}</Hov>
  )
}

/**
 * Il primo collegamento: senza Claude, Myynd non ragiona.
 *
 * Qui c'erano una strada sola e un campo per la chiave API, e quella strada
 * manda a chi compra Myynd una bolletta a consumo per un'app che gira tutti i
 * giorni. Adesso ce ne sono due, e l'ordine in cui stanno è tutta la decisione:
 * se Claude Code è su questa macchina, l'abbonamento che ha già è il bottone, e
 * la chiave diventa la riga di testo per chi la preferisce.
 *
 * Se Claude Code non c'è, di scelta non ce n'è e non se ne inventa una: resta il
 * campo di prima, senza un'offerta che rimanda a un programma che non ha. Un
 * bivio con un ramo che non porta da nessuna parte è peggio di una strada sola.
 */
function PassoClaude({ collegato, ricarica, avanti }: {
  collegato: boolean; ricarica: () => Promise<Stato>; avanti: () => void
}) {
  const [abb, setAbb] = useState<Abbonamento | null>(null)
  /** Ha chiesto lui la chiave: da qui in poi non gli si ripropone l'altra strada. */
  const [conChiave, setConChiave] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { api.abbonamento().then(setAbb).catch(() => setAbb(null)) }, [])

  const usaAbbonamento = async () => {
    setOccupato(true); setErr('')
    try { await api.usaAbbonamento(true); await ricarica() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  if (collegato) {
    return (
      <div style={{ animation: 'fadein .5s ease' }}>
        <Titolo>{t('Collega Claude.')}</Titolo>
        <Sotto>{t('Senza, resta solo un archivio.')}</Sotto>
        <div style={{ marginTop: 26, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 14, background: 'rgba(126,156,130,.16)', border: '1px solid rgba(126,156,130,.4)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7FA98A' }} />
          {/* quale delle due: l'ha appena scelto, ed è giusto vederselo confermare */}
          <span style={{ fontSize: 14, color: CHIARO }}>
            {abb?.acceso ? t('Con il tuo abbonamento.') : t('Collegato.')}
          </span>
        </div>
        <Primario onClick={avanti}>{t('Avanti')}</Primario>
      </div>
    )
  }

  // installato non basta: senza l'accesso fatto, il bottone offrirebbe una
  // strada che fallisce al primo lavoro vero. Si sa gratis, quindi si sa prima.
  const offriAbbonamento = !!abb?.installato && !!abb.entrato && !conChiave

  return (
    <div style={{ animation: 'fadein .5s ease' }}>
      <Titolo>{t('Collega Claude.')}</Titolo>
      <Sotto>{t('Senza, resta solo un archivio.')}</Sotto>

      {offriAbbonamento ? (
        <>
          <div style={{
            marginTop: 26, maxWidth: 460, padding: '15px 18px', borderRadius: 16,
            background: 'rgba(244,239,232,.05)', border: '1px solid rgba(244,239,232,.12)',
            fontSize: '13.5px', lineHeight: 1.65, color: TENUE, textWrap: 'pretty'
          }}>
            {t('Claude Code è su questo computer, già entrato con il tuo account. Myynd può ragionare di lì: non costa niente oltre all’abbonamento che paghi già, e le tue credenziali restano dove sono.')}
          </div>
          <Errore testo={err} />
          <Primario onClick={usaAbbonamento} disabilitato={occupato}>
            {occupato ? t('Un momento…') : t('Usa il tuo abbonamento')}
          </Primario>
        </>
      ) : (
        <div style={{ marginTop: 26, maxWidth: 460 }}>
          <FormClaude tema="scuro" senzaNota ok={async () => { await ricarica() }} />
          {/*
            A chi ha il programma e non ha fatto l'accesso non si nasconde
            l'altra strada: è esattamente la persona a cui conviene di più, ed è
            a dieci secondi di distanza. Una riga, nessun comando da premere —
            l'accesso si fa nel Terminale e non è cosa che Myynd possa fare al
            posto suo.
          */}
          {abb?.installato && !abb.entrato && (
            <div style={{ fontSize: '12.5px', lineHeight: 1.6, color: TENUE, marginTop: 16, textWrap: 'pretty' }}>
              {t('Hai Claude Code su questo computer. Se fai l’accesso — Terminale, scrivi «claude» — Myynd può ragionare con l’abbonamento che paghi già, e non ti serve nessuna chiave.')}
            </div>
          )}
        </div>
      )}

      {/* le altre strade, tutte alla stessa altezza: nessuna è un ripensamento */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginTop: 22 }}>
        {offriAbbonamento
          ? <Secondario onClick={() => setConChiave(true)}>{t('Ho una chiave API')}</Secondario>
          : abb?.installato && abb.entrato && <Secondario onClick={() => setConChiave(false)}>{t('Usa il tuo abbonamento')}</Secondario>}
        <Secondario onClick={avanti}>{t('Lo collego dopo')}</Secondario>
      </div>
    </div>
  )
}

function Nome({ nome, setNome, ruolo, setRuolo, avanti }: {
  nome: string; setNome: (v: string) => void
  ruolo: string; setRuolo: (v: string) => void
  avanti: () => void
}) {
  return (
    <div style={{ animation: 'fadein .5s ease' }}>
      <Titolo>{t('Come ti chiami?')}</Titolo>
      <Sotto>{t('Per scrivere come scrivi tu.')}</Sotto>
      <div style={{ display: 'flex', gap: 14, marginTop: 30 }}>
        <div style={{ flex: 1 }}>
          <div style={ETICHETTA}>{t('Nome')}</div>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Tobia" autoFocus className="scuro" style={CAMPO} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={ETICHETTA}>{t('Ruolo')}</div>
          <input value={ruolo} onChange={e => setRuolo(e.target.value)} placeholder={t('Titolare')} className="scuro" style={CAMPO} />
        </div>
      </div>
      <Primario onClick={avanti} disabilitato={!nome.trim()}>{t('Avanti')}</Primario>
    </div>
  )
}

function Connetti({ s, ricarica, avanti }: { s: Stato; ricarica: () => Promise<Stato>; avanti: () => void }) {
  const [aperto, setAperto] = useState<string | null>(null)
  // Claude l'ha già chiesto il passo prima
  const pronti = s.connettori.filter(c => c.pronto && c.id !== 'claude')
  const dopo = s.connettori.filter(c => !c.pronto)
  const quanti = pronti.filter(c => c.collegato).length

  return (
    <div style={{ animation: 'fadein .5s ease', maxHeight: '74vh', overflowY: 'auto', paddingRight: 4 }}>
      <Titolo>{t('Cosa le fai leggere?')}</Titolo>
<Sotto>{t('Restano su questo computer.')}</Sotto>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
        {pronti.map(c => (
          <Scheda key={c.id} c={c} aperto={aperto === c.id}
            apri={() => setAperto(aperto === c.id ? null : c.id)}
            ricarica={ricarica} chiudi={() => setAperto(null)} />
        ))}
      </div>

      <div style={{ ...ETICHETTA, marginTop: 28, marginBottom: 12 }}>{t('Più avanti')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {dopo.map(c => (
          <span key={c.id} title={c.nota} style={{
            padding: '8px 14px', borderRadius: 99, fontSize: '12.5px',
            border: '1px dashed rgba(244,239,232,.2)', color: 'rgba(244,239,232,.42)'
          }}>{c.nome}</span>
        ))}
      </div>

      <Primario onClick={avanti} disabilitato={quanti === 0}>
        {quanti === 0 ? t('Collegane almeno una') : frasi.avantiCollegate(quanti)}
      </Primario>
    </div>
  )
}

function Scheda({ c, aperto, apri, ricarica, chiudi }: {
  c: Stato['connettori'][number]
  aperto: boolean
  apri: () => void
  ricarica: () => Promise<Stato>
  chiudi: () => void
}) {
  const colore = COLORI[c.id] ?? '#C4623B'
  return (
    <div style={{
      borderRadius: 18, border: `1px solid ${c.collegato ? 'rgba(244,239,232,.3)' : 'rgba(244,239,232,.14)'}`,
      background: c.collegato ? 'rgba(244,239,232,.08)' : 'rgba(244,239,232,.03)', overflow: 'hidden'
    }}>
      <div onClick={apri} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', cursor: 'pointer' }}>
        <span style={{
          width: 9, height: 9, borderRadius: '50%', flex: 'none',
          background: c.collegato ? colore : 'rgba(244,239,232,.25)',
          boxShadow: c.collegato ? `0 0 0 5px ${colore}22` : 'none'
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15 }}>{c.nome}</div>
          <div style={{ fontSize: '12.5px', color: 'rgba(244,239,232,.5)', marginTop: 3 }}>
            {c.collegato ? (c.documenti ? frasi.documentiLetti(String(c.documenti)) : t('collegato')) : t(c.nota)}
          </div>
        </div>
        {c.collegato ? (
          <Hov as="button"
            onClick={async (e: React.MouseEvent) => {
              e.stopPropagation()
              try { await api.scollega(c.id) } catch { /* il vero stato lo dice ricarica */ }
              await ricarica()
            }}
            style={{ border: 'none', background: 'none', color: 'rgba(244,239,232,.45)', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}
            hover={{ color: '#E08A6A' }}>{t('Scollega')}</Hov>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12.5px', color: CHIARO }}>
            <IconPiu size={13} />{t('Collega')}</span>
        )}
      </div>
      {aperto && !c.collegato && (
        <div style={{ padding: '2px 18px 18px', animation: 'fadein .2s ease' }}>
          <Form id={c.id} tema="scuro" ok={async () => { await ricarica(); chiudi() }} />
        </div>
      )}
    </div>
  )
}

function Leggi({ ricarica, avanti }: { ricarica: () => Promise<Stato>; avanti: () => void }) {
  const [righe, setRighe] = useState<string[]>([])
  const [finito, setFinito] = useState(false)
  const [err, setErr] = useState('')
  const [totale, setTotale] = useState(0)
  const partito = useRef(false)

  useEffect(() => {
    if (partito.current) return
    partito.current = true
    api.sincronizza(m => {
      if (m.fase === 'fine') {
        setTotale(Number(m.totale) || 0)
        setFinito(true)
      } else if (m.fase !== 'errore') {
        setRighe(r => [...r.slice(-4), rigaSincronizzazione(m)])
      }
    }).then(ricarica).catch(e => setErr(e instanceof Error ? e.message : String(e)))
  }, [ricarica])

  return (
    <div style={{ animation: 'fadein .5s ease' }}>
      <Titolo>{finito ? t('Fatto.') : t('Leggo.')}</Titolo>
      <Sotto>
        {finito
          ? frasi.documenti(totale)
          : t('La prima volta è la più lunga.')}
      </Sotto>
      <div style={{ marginTop: 26 }}>
        {!finito && <Indicatore tipo="leggo" testo={righe.at(-1) ?? t('mi collego')} chiaro />}
        <div style={{
          marginTop: finito ? 0 : 14, padding: '14px 18px', borderRadius: 16,
          background: 'rgba(244,239,232,.05)', border: '1px solid rgba(244,239,232,.12)',
          fontSize: '12.5px', lineHeight: 1.9, color: TENUE, minHeight: 84, fontVariantNumeric: 'tabular-nums'
        }}>
          {righe.length ? righe.map((r, i) => <div key={i}>{r}</div>) : <div>{t('mi collego…')}</div>}
        </div>
      </div>
      <Errore testo={err} />
      <Primario onClick={avanti} disabilitato={!finito && !err}>{t('Avanti')}</Primario>
    </div>
  )
}

function Genera({ s, avanti }: { s: Stato; avanti: () => void }) {
  const [occupato, setOccupato] = useState(false)
  const [quante, setQuante] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const senzaClaude = !s.connettori.find(c => c.id === 'claude')?.collegato

  const genera = async () => {
    setOccupato(true); setErr('')
    try { const r = await api.generaFeed(); setQuante(r.generate) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  return (
    <div style={{ animation: 'fadein .5s ease' }}>
      <Titolo>{t('Prima lettura.')}</Titolo>
      <Sotto>
        {senzaClaude
          ? t('Serve Claude. Puoi saltarla.')
          : quante === null
            ? t('Metto da parte quello che sembra richiedere te.')
            : quante === 0
              ? t('Niente da segnalare.')
              : frasi.messeDaParte(quante)}
      </Sotto>
      <Errore testo={err} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {!senzaClaude && quante === null && (
          occupato
            ? <div style={{ marginTop: 34 }}><Indicatore tipo="cerco" testo={t('Leggo tutto e scelgo cosa conta')} chiaro /></div>
            : <Primario onClick={genera}>{t('Fai la prima lettura')}</Primario>
        )}
        {(senzaClaude || quante !== null) && <Primario onClick={avanti}>{t('Avanti')}</Primario>}
        {!senzaClaude && quante === null && !occupato && (
          <Hov as="button" onClick={avanti}
            style={{ marginTop: 34, border: 'none', background: 'none', color: TENUE, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            hover={{ color: CHIARO }}>{t('Salta')}</Hov>
        )}
      </div>
    </div>
  )
}

function Pronta({ totale, entra }: { totale: number; entra: () => void }) {
  return (
    <div style={{ animation: 'fadein .6s ease' }}>
      <Titolo>{t('Pronta.')}</Titolo>
      <Sotto>
        {totale
          ? frasi.documentiDentro(String(totale))
          : t('Ancora vuota.')}
      </Sotto>
      <Primario onClick={entra}>{t('Entra')}</Primario>
    </div>
  )
}
