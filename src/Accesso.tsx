// L'accesso. Sullo stesso campo dell'onboarding, così l'app ha una voce sola.
//
// Al primo avvio crea l'account su questa macchina; dopo chiede solo email e
// password. La password non lascia mai il tuo computer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo } from './onboarding/campo'
import { api } from './api'

const CHIARO = '#F4EFE8'
const TENUE = 'rgba(244,239,232,.6)'
export const VERSIONE = '4'

export function Accesso({ registrato, azienda, entrato }: {
  registrato: boolean
  azienda: string | null
  entrato: (a: { email: string; azienda: string }) => void
}) {
  const cv = useRef<HTMLCanvasElement>(null)
  const campo = useMemo(() => new Campo(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nomeAzienda, setNomeAzienda] = useState('')
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  useEffect(() => {
    if (cv.current) campo.monta(cv.current)
    campo.imposta({ coesione: 0.42, colori: ['#D8A46E', '#C4623B', '#7E9C82'], legami: true, quantita: 620 })
    return () => campo.smonta()
  }, [campo])

  const invia = async () => {
    setOccupato(true); setErr('')
    try {
      const r = registrato
        ? await api.entra(email, password)
        : await api.registra(email, password, nomeAzienda)
      entrato(r.account)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setOccupato(false)
  }

  const pronto = registrato
    ? email.trim() && password.length > 0
    : email.trim() && password.length >= 8 && nomeAzienda.trim()

  const tasto = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && pronto && !occupato) invia() }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#141210', color: CHIARO,
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", overflow: 'hidden'
    }}>
      <canvas ref={cv} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(52% 44% at 50% 50%, rgba(16,14,12,.86) 0%, rgba(16,14,12,.66) 46%, rgba(16,14,12,0) 100%)'
      }} />

      <div style={{
        position: 'relative', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24
      }}>
        <div style={{ width: 380, maxWidth: '100%', textShadow: '0 1px 24px rgba(12,10,8,.8)' }}>
          {/* il marchio: Myynd e la versione, l'azienda sotto */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 34, fontWeight: 300, letterSpacing: '.01em', lineHeight: 1 }}>myynd</span>
              <span style={{
                fontSize: 15, fontWeight: 500, color: '#D8A46E',
                border: '1px solid rgba(216,164,110,.45)', borderRadius: 8, padding: '2px 8px'
              }}>{VERSIONE}</span>
            </div>
            <div style={{ fontSize: 14, color: TENUE, marginTop: 10, letterSpacing: '.02em' }}>
              {registrato ? (azienda ?? '') : 'Il secondo cervello della tua azienda'}
            </div>
          </div>

          {!registrato && (
            <div style={{ fontSize: 14, lineHeight: 1.6, color: TENUE, marginBottom: 24 }}>
              Crea l'accesso a questa mente. Resta su questo computer: non c'è
              nessun account da nessun'altra parte.
            </div>
          )}

          <div style={ETICHETTA}>Email</div>
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={tasto}
            type="email" autoComplete="username" autoFocus placeholder="tu@tuodominio.it" style={CAMPO} />

          <div style={ETICHETTA}>Password</div>
          <input value={password} onChange={e => setPassword(e.target.value)} onKeyDown={tasto}
            type="password" autoComplete={registrato ? 'current-password' : 'new-password'}
            placeholder={registrato ? '' : 'almeno otto caratteri'} style={CAMPO} />

          {!registrato && (
            <>
              <div style={ETICHETTA}>Azienda</div>
              <input value={nomeAzienda} onChange={e => setNomeAzienda(e.target.value)} onKeyDown={tasto}
                placeholder="Donadon Srl" style={CAMPO} />
            </>
          )}

          {err && <div style={{ fontSize: '12.5px', color: '#E8907A', marginTop: 14, lineHeight: 1.5 }}>{err}</div>}

          <button onClick={invia} disabled={!pronto || occupato} style={{
            marginTop: 28, width: '100%', padding: '14px 24px', borderRadius: 99, border: 'none',
            background: pronto && !occupato ? CHIARO : 'rgba(244,239,232,.16)',
            color: pronto && !occupato ? '#141210' : 'rgba(244,239,232,.45)',
            fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
            cursor: pronto && !occupato ? 'pointer' : 'default', transition: 'background .2s'
          }}>
            {occupato ? 'Un attimo…' : registrato ? 'Entra' : 'Crea l’accesso'}
          </button>

          <div style={{ fontSize: '11.5px', color: 'rgba(244,239,232,.38)', marginTop: 20, lineHeight: 1.6 }}>
            La password chiude l'interfaccia, non cifra l'archivio: i file in
            ~/.myynd restano leggibili da chi ha accesso a questo utente del Mac.
          </div>
        </div>
      </div>
    </div>
  )
}

const CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '13px 16px',
  borderRadius: 14, border: '1px solid rgba(244,239,232,.22)', background: 'rgba(244,239,232,.06)',
  color: CHIARO, fontSize: 15, fontFamily: 'inherit', outline: 'none'
}

const ETICHETTA: React.CSSProperties = {
  fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
  color: 'rgba(244,239,232,.45)', marginTop: 16
}
