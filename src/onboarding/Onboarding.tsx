import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo } from './campo'
import { api, type Stato } from '../api'
import { Hov } from '../ui'
import { IconPiu } from '../icons'
import { Form, FormClaude } from '../components/forms'
import { Stato as Indicatore } from '../components/Stato'

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
        background: 'radial-gradient(58% 46% at 50% 50%, rgba(16,14,12,.82) 0%, rgba(16,14,12,.62) 45%, rgba(16,14,12,0) 100%)'
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
              avanti={async () => { await api.profilo({ nome, ruolo }); setPasso('connetti') }}
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
            <Pronta nome={nome} totale={s.conteggi.totale} entra={async () => { await api.profilo({ onboarding: true }); fatto() }} />
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
  return <div style={{ fontSize: '12.5px', color: '#E8907A', marginTop: 12, lineHeight: 1.5 }}>{testo}</div>
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
      <div style={{ fontSize: 13, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(244,239,232,.45)', marginBottom: 22 }}>myynd</div>
      <Titolo>Questa è la tua mente.<br />Adesso è vuota.</Titolo>
      <Sotto>
        Passaci sopra il cursore: reagisce già, ma non sa ancora niente di te.
        Collegale le cose che leggi e scrivi ogni giorno e smette di essere
        una decorazione.
      </Sotto>
      <Primario onClick={avanti}>Cominciamo</Primario>
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

/** Il primo collegamento: senza Claude, Myynd non ragiona. */
function PassoClaude({ collegato, ricarica, avanti }: {
  collegato: boolean; ricarica: () => Promise<Stato>; avanti: () => void
}) {
  return (
    <div style={{ animation: 'fadein .5s ease' }}>
      <Titolo>Prima di tutto,<br />collega Claude.</Titolo>
      <Sotto>
        Senza, Myynd resta un archivio: cerca e trova, ma non ti dice mai
        cosa conta.
      </Sotto>
      {collegato ? (
        <>
          <div style={{ marginTop: 26, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 14, background: 'rgba(126,156,130,.16)', border: '1px solid rgba(126,156,130,.4)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7FA98A' }} />
            <span style={{ fontSize: 14, color: CHIARO }}>Claude è collegato.</span>
          </div>
          <Primario onClick={avanti}>Avanti</Primario>
        </>
      ) : (
        <>
          <div style={{ marginTop: 26, maxWidth: 460 }}>
            <FormClaude tema="scuro" senzaNota ok={async () => { await ricarica() }} />
          </div>
          <Hov as="button" onClick={avanti}
            style={{ marginTop: 22, border: 'none', background: 'none', color: TENUE, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'block' }}
            hover={{ color: CHIARO }}>Lo collego dopo</Hov>
        </>
      )}
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
      <Titolo>Chi sei?</Titolo>
      <Sotto>Serve solo perché Myynd scriva come scriveresti tu.</Sotto>
      <div style={{ display: 'flex', gap: 14, marginTop: 30 }}>
        <div style={{ flex: 1 }}>
          <div style={ETICHETTA}>Nome</div>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Tobia" autoFocus style={CAMPO} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={ETICHETTA}>Ruolo</div>
          <input value={ruolo} onChange={e => setRuolo(e.target.value)} placeholder="Titolare" style={CAMPO} />
        </div>
      </div>
      <Primario onClick={avanti} disabilitato={!nome.trim()}>Avanti</Primario>
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
      <Titolo>Cosa le do da leggere?</Titolo>
      <Sotto>
        Tutto resta su questo computer: le credenziali finiscono in
        <code style={{ color: CHIARO, background: 'rgba(244,239,232,.1)', padding: '1px 6px', borderRadius: 5, margin: '0 4px' }}>~/.myynd</code>
        e vanno solo al servizio a cui servono.
      </Sotto>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
        {pronti.map(c => (
          <Scheda key={c.id} c={c} aperto={aperto === c.id}
            apri={() => setAperto(aperto === c.id ? null : c.id)}
            ricarica={ricarica} chiudi={() => setAperto(null)} />
        ))}
      </div>

      <div style={{ ...ETICHETTA, marginTop: 28, marginBottom: 12 }}>Più avanti</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {dopo.map(c => (
          <span key={c.id} title={c.nota} style={{
            padding: '8px 14px', borderRadius: 99, fontSize: '12.5px',
            border: '1px dashed rgba(244,239,232,.2)', color: 'rgba(244,239,232,.42)'
          }}>{c.nome}</span>
        ))}
      </div>

      <Primario onClick={avanti} disabilitato={quanti === 0}>
        {quanti === 0 ? 'Collegane almeno una' : `Avanti · ${quanti} collegate`}
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
            {c.collegato ? (c.documenti ? `${c.documenti} documenti letti` : 'collegato') : c.nota}
          </div>
        </div>
        {c.collegato ? (
          <Hov as="button"
            onClick={async (e: React.MouseEvent) => { e.stopPropagation(); await api.scollega(c.id); await ricarica() }}
            style={{ border: 'none', background: 'none', color: 'rgba(244,239,232,.45)', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}
            hover={{ color: '#E08A6A' }}>Scollega</Hov>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12.5px', color: CHIARO }}>
            <IconPiu size={13} />Collega
          </span>
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
        setRighe(r => [...r.slice(-4), `${m.fase} · ${m.stato}${m.documenti ? ` (${m.documenti})` : ''}`])
      }
    }).then(ricarica).catch(e => setErr(e instanceof Error ? e.message : String(e)))
  }, [ricarica])

  return (
    <div style={{ animation: 'fadein .5s ease' }}>
      <Titolo>{finito ? 'Ho letto tutto.' : 'Sto leggendo.'}</Titolo>
      <Sotto>
        {finito
          ? `${totale} documenti indicizzati su questa macchina. Da qui in poi posso cercarci dentro e ragionarci sopra.`
          : 'La prima lettura è la più lunga: dopo tiene solo il passo delle novità.'}
      </Sotto>
      <div style={{ marginTop: 26 }}>
        {!finito && <Indicatore tipo="leggo" testo={righe.at(-1) ?? 'mi collego'} chiaro />}
        <div style={{
          marginTop: finito ? 0 : 14, padding: '14px 18px', borderRadius: 16,
          background: 'rgba(244,239,232,.05)', border: '1px solid rgba(244,239,232,.12)',
          fontSize: '12.5px', lineHeight: 1.9, color: TENUE, minHeight: 84, fontVariantNumeric: 'tabular-nums'
        }}>
          {righe.length ? righe.map((r, i) => <div key={i}>{r}</div>) : <div>mi collego…</div>}
        </div>
      </div>
      <Errore testo={err} />
      <Primario onClick={avanti} disabilitato={!finito && !err}>Avanti</Primario>
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
      <Titolo>La prima lettura.</Titolo>
      <Sotto>
        {senzaClaude
          ? 'Per questo passaggio serve Claude collegato. Puoi saltarlo: la mente resta consultabile, ma non tirerà fuori niente da sola.'
          : quante === null
            ? 'Myynd guarda quello che ha appena letto e tira fuori le cose che meritano la tua attenzione. Sono le prime voci del tuo feed.'
            : quante === 0
              ? 'Non ha trovato abbastanza materiale per tirare fuori qualcosa. Collega un’altra fonte e riprova più tardi.'
              : `${quante} cose messe da parte per te. Le trovi appena entri.`}
      </Sotto>
      <Errore testo={err} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {!senzaClaude && quante === null && (
          occupato
            ? <div style={{ marginTop: 34 }}><Indicatore tipo="cerco" testo="Leggo tutto e scelgo cosa conta" chiaro /></div>
            : <Primario onClick={genera}>Fai la prima lettura</Primario>
        )}
        {(senzaClaude || quante !== null) && <Primario onClick={avanti}>Avanti</Primario>}
        {!senzaClaude && quante === null && !occupato && (
          <Hov as="button" onClick={avanti}
            style={{ marginTop: 34, border: 'none', background: 'none', color: TENUE, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            hover={{ color: CHIARO }}>Salta</Hov>
        )}
      </div>
    </div>
  )
}

function Pronta({ nome, totale, entra }: { nome: string; totale: number; entra: () => void }) {
  return (
    <div style={{ animation: 'fadein .6s ease' }}>
      <Titolo>{nome ? `È pronta, ${nome}.` : 'È pronta.'}</Titolo>
      <Sotto>
        {totale
          ? `${totale} documenti dentro. Da adesso puoi chiederle qualsiasi cosa sul tuo materiale, e sa dirti da dove viene la risposta.`
          : 'Non ha ancora letto niente, ma i connettori sono al loro posto: torna nelle impostazioni quando vuoi darle qualcosa.'}
      </Sotto>
      <Primario onClick={entra}>Entra</Primario>
    </div>
  )
}
