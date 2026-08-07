// I moduli per collegare una fonte. Stessi campi nell'onboarding e nel
// pannello Connessioni: si scrivono una volta sola.
//
// Le credenziali le digiti tu, nella tua app, e vanno al tuo server locale.

import { useEffect, useState, type CSSProperties } from 'react'
import { api } from '../api'

export type Tema = 'scuro' | 'chiaro'

const CHIARO = '#F4EFE8'

export function campo(tema: Tema): CSSProperties {
  const scuro = tema === 'scuro'
  return {
    width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '12px 15px',
    borderRadius: 13,
    border: `1px solid ${scuro ? 'rgba(244,239,232,.22)' : 'rgba(34,39,31,.18)'}`,
    background: scuro ? 'rgba(244,239,232,.06)' : 'rgba(255,255,255,.7)',
    color: scuro ? CHIARO : '#22271F',
    fontSize: 15, fontFamily: 'inherit', outline: 'none'
  }
}

export function etichetta(tema: Tema): CSSProperties {
  return {
    fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
    color: tema === 'scuro' ? 'rgba(244,239,232,.45)' : 'rgba(34,39,31,.5)',
    marginTop: 12
  }
}

function nota(tema: Tema): CSSProperties {
  return {
    fontSize: '12.5px', lineHeight: 1.55, marginBottom: 4,
    color: tema === 'scuro' ? 'rgba(244,239,232,.62)' : 'rgba(34,39,31,.62)'
  }
}

function Errore({ testo }: { testo: string }) {
  if (!testo) return null
  return <div style={{ fontSize: '12.5px', color: '#D4674A', marginTop: 12, lineHeight: 1.5 }}>{testo}</div>
}

function Conferma({ onClick, occupato, tema, children }: {
  onClick: () => void; occupato: boolean; tema: Tema; children: React.ReactNode
}) {
  const scuro = tema === 'scuro'
  return (
    <button onClick={onClick} disabled={occupato} style={{
      marginTop: 18, padding: '11px 22px', borderRadius: 99, border: 'none',
      background: occupato
        ? (scuro ? 'rgba(244,239,232,.2)' : 'rgba(34,39,31,.18)')
        : (scuro ? CHIARO : 'linear-gradient(120deg,#C4623B,#7E9C82)'),
      color: occupato ? (scuro ? 'rgba(244,239,232,.6)' : 'rgba(34,39,31,.5)') : (scuro ? '#191715' : '#FFF7F0'),
      fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit',
      cursor: occupato ? 'default' : 'pointer'
    }}>{occupato ? 'Provo…' : children}</button>
  )
}

type Props = { tema: Tema; ok: () => void }

export function FormClaude({ tema, ok, senzaNota }: Props & { senzaNota?: boolean }) {
  const [apiKey, setApiKey] = useState('')
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  const collega = async () => {
    setOccupato(true); setErr('')
    try { await api.collegaClaude(apiKey); setApiKey(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  return (
    <div>
      <div style={nota(tema)}>
        {senzaNota
          ? 'Da console.anthropic.com.'
          : 'La chiave da console.anthropic.com. Senza, Myynd non ragiona.'}
      </div>
      <div style={etichetta(tema)}>Chiave API</div>
      <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
        placeholder="sk-ant-…" autoComplete="new-password" style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && apiKey) collega() }} />
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>Collega Claude</Conferma>
    </div>
  )
}

export function FormPosta({ tema, ok }: Props) {
  const [host, setHost] = useState('imap.register.it')
  const [utente, setUtente] = useState('')
  const [password, setPassword] = useState('')
  const [giorni, setGiorni] = useState(30)
  const [err, setErr] = useState('')
  const [avviso, setAvviso] = useState('')
  const [occupato, setOccupato] = useState(false)

  const collega = async () => {
    setOccupato(true); setErr(''); setAvviso('')
    try {
      const r = await api.collegaPosta({ host, porta: 993, utente, password, giorni })
      setPassword('')
      if (r.certificatoAdattato) {
        setAvviso(`Il certificato è intestato a ${r.certificatoAdattato}: normale su questo provider.`)
      }
      ok()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  return (
    <div>
      <div style={nota(tema)}>La password resta su questa macchina.</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 2 }}>
          <div style={etichetta(tema)}>Server IMAP</div>
          <input value={host} onChange={e => setHost(e.target.value)} style={campo(tema)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={etichetta(tema)}>Giorni</div>
          <input type="number" value={giorni} onChange={e => setGiorni(Number(e.target.value))} style={campo(tema)} />
        </div>
      </div>
      <div style={etichetta(tema)}>Indirizzo</div>
      <input value={utente} onChange={e => setUtente(e.target.value)}
        placeholder="tu@tuodominio.it" autoComplete="off" style={campo(tema)} />
      <div style={etichetta(tema)}>Password della casella</div>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
        autoComplete="new-password" style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && utente && password) collega() }} />
      <Errore testo={err} />
      {avviso && <div style={{ ...nota(tema), marginTop: 12 }}>{avviso}</div>}
      <Conferma onClick={collega} occupato={occupato} tema={tema}>Collega la posta</Conferma>
    </div>
  )
}

export function FormDesktop({ tema, ok }: Props) {
  const [cartelle, setCartelle] = useState<string[]>([])
  const [manuale, setManuale] = useState('')
  const [suggeriti, setSuggeriti] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  useEffect(() => { api.stato().then(s => setSuggeriti(s.suggerimentiDesktop)).catch(() => {}) }, [])

  const alterna = (c: string) => setCartelle(v => (v.includes(c) ? v.filter(x => x !== c) : [...v, c]))

  const collega = async () => {
    setOccupato(true); setErr('')
    const tutte = manuale.trim() ? [...cartelle, manuale.trim()] : cartelle
    try { await api.collegaDesktop(tutte); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  const scuro = tema === 'scuro'
  return (
    <div>
      <div style={nota(tema)}>PDF, Word, testo. Solo lettura, solo dove dici tu.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {suggeriti.map(c => {
          const on = cartelle.includes(c)
          return (
            <button key={c} onClick={() => alterna(c)} style={{
              padding: '9px 14px', borderRadius: 99, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${on ? '#C4623B' : scuro ? 'rgba(244,239,232,.22)' : 'rgba(34,39,31,.2)'}`,
              background: on ? 'rgba(196,98,59,.16)' : 'none',
              color: on ? (scuro ? '#E8A87C' : '#8E3F1F') : (scuro ? 'rgba(244,239,232,.62)' : 'rgba(34,39,31,.62)')
            }}>{c.split('/').pop()}</button>
          )
        })}
      </div>
      <div style={etichetta(tema)}>Oppure un percorso</div>
      <input value={manuale} onChange={e => setManuale(e.target.value)} placeholder="/Users/…/Lavoro" style={campo(tema)} />
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>Collega il desktop</Conferma>
    </div>
  )
}

export function FormNotion({ tema, ok }: Props) {
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  const collega = async () => {
    setOccupato(true); setErr('')
    try { await api.collegaNotion(token); setToken(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  return (
    <div>
      <div style={nota(tema)}>
        Token da notion.so/my-integrations. Poi condividi con l'integrazione
        le pagine da leggere, o non le vede.
      </div>
      <div style={etichetta(tema)}>Token di integrazione</div>
      <input type="password" value={token} onChange={e => setToken(e.target.value)}
        placeholder="ntn_…" autoComplete="new-password" style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && token) collega() }} />
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>Collega Notion</Conferma>
    </div>
  )
}

export function Form({ id, tema, ok }: { id: string } & Props) {
  if (id === 'claude') return <FormClaude tema={tema} ok={ok} />
  if (id === 'posta') return <FormPosta tema={tema} ok={ok} />
  if (id === 'desktop') return <FormDesktop tema={tema} ok={ok} />
  if (id === 'notion') return <FormNotion tema={tema} ok={ok} />
  return null
}
