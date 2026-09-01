// L'accesso. Sullo stesso campo dell'onboarding, così l'app ha una voce sola.
//
// Al primo avvio crea l'account su questa macchina; dopo chiede solo email e
// password. La password non lascia mai il tuo computer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo } from './onboarding/campo'
import { api, type Accesso as TipoAccesso } from './api'
import { lingua, ricordaLingua, t } from './lingua'
import { Logo } from './components/Marchio'

const CHIARO = '#F4EFE8'

export function Accesso({ accesso, entrato }: {
  accesso: TipoAccesso
  entrato: (a: { email: string }) => void
}) {
  const ospitato = !!accesso.ospitato
  /*
   * Entrare o crearsi un conto: lo decide chi guarda, non il server.
   *
   * Prima lo decideva il server — «esiste già un account?» — e con una persona
   * sola aveva senso. Con più persone quella domanda non ha risposta: chi apre
   * la pagina sa se ha un conto, il server no. E non deve nemmeno poterlo
   * dire: «esiste un account con questo indirizzo», detto a chi non è ancora
   * entrato, è un modo di raccontare a un estraneo chi è iscritto qui.
   */
  const [modo, setModo] = useState<'entra' | 'crea'>('entra')
  const registrato = modo === 'entra'
  const cv = useRef<HTMLCanvasElement>(null)
  const campo = useMemo(() => new Campo(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  /** Cambiare lingua non passa da React: questo lo obbliga a ridisegnare. */
  const [, ridisegna] = useState(0)
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
          <div style={{ marginBottom: 30 }}>
            <Logo dim={38} testo={26} tinta={CHIARO} />
          </div>

          {/*
            Quale delle due cose si sta facendo.

            Non c'era, e la mancanza costava più di quanto sembri: due campi e
            un bottone si leggono come un accesso, sempre — è la forma che ha un
            accesso ovunque. Chi arrivava su un'installazione nuova credeva che
            la sua password non fosse riconosciuta, mentre gli si stava
            chiedendo di sceglierne una. Il bottone lo diceva, in fondo, dopo.
          */}
          {/*
            Le due cose che si possono fare, tutte e due sempre lì.

            Prima ce n'era una sola e la sceglieva il server: se un account
            esisteva si «entrava», se non esisteva si «creava». Con una persona
            per installazione filava; adesso che le persone sono tante, chi apre
            questa pagina può avere un conto o non averlo — e lo sa lui.
          */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {([['entra', 'Entra'], ['crea', 'Crea un account']] as const).map(([id, testo]) => (
              <button key={id} type="button" onClick={() => { setModo(id); setErr('') }}
                style={{
                  padding: '7px 15px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '13px',
                  fontWeight: modo === id ? 500 : 400,
                  background: modo === id ? 'rgba(244,239,232,.14)' : 'transparent',
                  color: modo === id ? CHIARO : 'rgba(244,239,232,.45)',
                  transition: 'background .18s, color .18s'
                }}>{t(testo)}</button>
            ))}
          </div>

          <div style={{ fontSize: '13px', lineHeight: 1.55, color: 'rgba(244,239,232,.5)', marginBottom: 24, textWrap: 'pretty' }}>
            {registrato
              ? t('Entra con l’indirizzo con cui l’hai creato.')
              : t('La tua posta, i tuoi file e le tue automazioni restano tuoi: ogni account ha la sua memoria, separata da quella di chiunque altro.')}
          </div>

          <div style={ETICHETTA}>{t('Email')}</div>
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={tasto}
            type="email" autoComplete="username" autoFocus placeholder={t('tu@tuodominio.it')} className="scuro" style={CAMPO} />

          <div style={ETICHETTA}>{t('Password')}</div>
          <input value={password} onChange={e => setPassword(e.target.value)} onKeyDown={tasto}
            type="password" autoComplete={registrato ? 'current-password' : 'new-password'}
            placeholder={registrato ? '' : t('otto caratteri')} className="scuro" style={CAMPO} />

          {err && <div style={{ fontSize: '12.5px', color: '#E8907A', marginTop: 14, lineHeight: 1.5 }}>{t(err)}</div>}

          <button onClick={invia} disabled={!pronto || occupato} style={{
            marginTop: 28, width: '100%', padding: '14px 24px', borderRadius: 99, border: 'none',
            background: pronto && !occupato ? CHIARO : 'rgba(244,239,232,.16)',
            color: pronto && !occupato ? '#141210' : 'rgba(244,239,232,.45)',
            fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
            cursor: pronto && !occupato ? 'pointer' : 'default', transition: 'background .2s'
          }}>
            {occupato ? '…' : registrato ? t('Entra') : t('Crea l\'accesso')}
          </button>

          {/* Su un server questa frase era una bugia, ed era la frase su cui si
              basa tutto il prodotto: va detta solo dov'è vera. */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
            marginTop: 22, fontSize: '11.5px', color: 'rgba(244,239,232,.34)', lineHeight: 1.6
          }}>
            <span style={{ flex: 1, minWidth: 180 }}>
              {ospitato
                ? t('Questo Myynd gira su un server, non sul tuo computer.')
                : t('Resta su questo computer.')}
            </span>
            {/*
              Le due lingue, anche qui.
              È la prima schermata che si vede e si disegna prima che il server
              dica quale lingua vuoi: se quella indovinata è quella sbagliata,
              questo è l'unico posto in cui dirlo — e senza, non si può nemmeno
              leggere la frase che lo spiegherebbe.
            */}
            <span style={{ display: 'flex', gap: 12, flex: 'none' }}>
              {(['en', 'it'] as const).map(l => (
                <button key={l} type="button" onClick={() => { ricordaLingua(l); ridisegna(n => n + 1) }}
                  style={{
                    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '11.5px', letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: lingua() === l ? 'rgba(244,239,232,.75)' : 'rgba(244,239,232,.3)'
                  }}>{l === 'it' ? 'Italiano' : 'English'}</button>
              ))}
            </span>
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
