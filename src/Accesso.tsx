// L'accesso. Sullo stesso campo dell'onboarding, così l'app ha una voce sola.
//
// Al primo avvio crea l'account su questa macchina; dopo chiede solo email e
// password. La password non lascia mai il tuo computer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo } from './onboarding/campo'
import { api } from './api'
import { t } from './lingua'
import { Logo } from './components/Marchio'

const CHIARO = '#F4EFE8'

export function Accesso({ registrato, entrato }: {
  registrato: boolean
  entrato: (a: { email: string }) => void
}) {
  const cv = useRef<HTMLCanvasElement>(null)
  const campo = useMemo(() => new Campo(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        : await api.registra(email, password)
      entrato(r.account)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setOccupato(false)
  }

  const pronto = registrato
    ? !!email.trim() && password.length > 0
    : !!email.trim() && password.length >= 8

  const tasto = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && pronto && !occupato) invia() }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#141210', color: CHIARO,
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", overflow: 'hidden'
    }}>
      <canvas ref={cv} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle 47vmin at 50% 48%, rgba(16,14,12,.72) 0%, rgba(16,14,12,.70) 58%, rgba(16,14,12,.42) 82%, rgba(16,14,12,0) 100%)'
      }} />

      <div style={{
        position: 'relative', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        pointerEvents: 'none'   // le particelle devono sentire il cursore
      }}>
        <div style={{ width: 380, maxWidth: '100%', textShadow: '0 1px 24px rgba(12,10,8,.8)', pointerEvents: 'auto' }}>
          <div style={{ marginBottom: 44 }}>
            <Logo dim={38} testo={26} tinta={CHIARO} />
          </div>

          <div style={ETICHETTA}>{t('Email')}</div>
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={tasto}
            type="email" autoComplete="username" autoFocus placeholder="tu@tuodominio.it" className="scuro" style={CAMPO} />

          <div style={ETICHETTA}>{t('Password')}</div>
          <input value={password} onChange={e => setPassword(e.target.value)} onKeyDown={tasto}
            type="password" autoComplete={registrato ? 'current-password' : 'new-password'}
            placeholder={registrato ? '' : 'otto caratteri'} className="scuro" style={CAMPO} />

          {err && <div style={{ fontSize: '12.5px', color: '#E8907A', marginTop: 14, lineHeight: 1.5 }}>{t(err)}</div>}

          <button onClick={invia} disabled={!pronto || occupato} style={{
            marginTop: 28, width: '100%', padding: '14px 24px', borderRadius: 99, border: 'none',
            background: pronto && !occupato ? CHIARO : 'rgba(244,239,232,.16)',
            color: pronto && !occupato ? '#141210' : 'rgba(244,239,232,.45)',
            fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
            cursor: pronto && !occupato ? 'pointer' : 'default', transition: 'background .2s'
          }}>
            {/* su una macchina senza account non si «entra» da nessuna parte:
                lo si crea, ed è la prima cosa che uno legge del prodotto */}
            {occupato ? '…' : registrato ? t('Entra') : t('Crea l\'accesso')}
          </button>

          <div style={{ fontSize: '11.5px', color: 'rgba(244,239,232,.34)', marginTop: 22, lineHeight: 1.6 }}>{t('Resta su questo computer.')}</div>
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
