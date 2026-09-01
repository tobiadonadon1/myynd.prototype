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
  const { registrato } = accesso
  const serveInvito = !!accesso.serveInvito
  /*
   * Ospitato e senza invito sul server: qui non si registra nessuno, e la cosa
   * va detta *prima*, non dopo tre campi riempiti. La parola d'invito non si
   * trova da nessuna parte — la sceglie chi mette su il server — e senza
   * saperlo si resta fermi a cercarla.
   */
  const chiusa = accesso.registrazioneAperta === false && !registrato
  const ospitato = !!accesso.ospitato
  const cv = useRef<HTMLCanvasElement>(null)
  const campo = useMemo(() => new Campo(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invito, setInvito] = useState('')
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
        : await api.registra(email, password, invito)
      entrato(r.account)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setOccupato(false)
  }

  const pronto = registrato
    ? !!email.trim() && password.length > 0
    : !!email.trim() && password.length >= 8 && (!serveInvito || !!invito.trim())

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
          <div style={{ fontSize: 19, letterSpacing: '-.01em', marginBottom: 6 }}>
            {chiusa ? t('Qui non si può ancora entrare.')
              : registrato ? t('Bentornato.') : t('Crea il tuo accesso.')}
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.55, color: 'rgba(244,239,232,.5)', marginBottom: 26, textWrap: 'pretty' }}>
            {chiusa
              ? t('Questo Myynd è su un indirizzo pubblico e nessuno ha ancora messo una parola d’invito sul server. Non è una parola da trovare: la scegli tu. Mettila in MYYND_INVITO fra le variabili del server, aspetta che riparta, e poi scrivila qui.')
              : registrato
              ? t('Entra con l’indirizzo con cui l’hai creato.')
              : ospitato
                /*
                  Perché non c'è un «entra».
                  È la domanda che si fa chiunque abbia già un Myynd sul proprio
                  computer e apra questo indirizzo: la password non gli viene
                  riconosciuta e sembra un guasto. Non lo è — non esiste nessun
                  accesso centrale, e non è un pezzo che manca: ogni Myynd tiene
                  il suo account e la sua memoria dove gira. Detto qui, prima di
                  provare, invece che dedotto dopo tre tentativi falliti.
                */
                ? t('Questo indirizzo è un Myynd a parte, con una memoria sua. L’account che hai sul tuo computer qui non esiste: non c’è nessun accesso centrale, e ogni Myynd tiene il suo dove gira.')
                : t('Non c’è ancora nessun account su questo computer: quello che scrivi adesso lo crea.')}
          </div>

          {!chiusa && <>
          <div style={ETICHETTA}>{t('Email')}</div>
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={tasto}
            type="email" autoComplete="username" autoFocus placeholder={t('tu@tuodominio.it')} className="scuro" style={CAMPO} />

          <div style={ETICHETTA}>{t('Password')}</div>
          <input value={password} onChange={e => setPassword(e.target.value)} onKeyDown={tasto}
            type="password" autoComplete={registrato ? 'current-password' : 'new-password'}
            placeholder={registrato ? '' : t('otto caratteri')} className="scuro" style={CAMPO} />

          {serveInvito && (
            <>
              <div style={ETICHETTA}>{t('Invito')}</div>
              <input value={invito} onChange={e => setInvito(e.target.value)} onKeyDown={tasto}
                autoComplete="off" className="scuro" style={CAMPO} />
              <div style={{ fontSize: '11.5px', color: 'rgba(244,239,232,.34)', marginTop: 8, lineHeight: 1.55 }}>
                {/*
                  Prima diceva solo perché quel campo esiste, e non cosa
                  scriverci: chi lo guardava restava fermo davanti a una casella
                  che chiedeva una parola che nessuno gli aveva detto. Il perché
                  serve, ma dopo — la prima riga dev'essere quella che sblocca.
                */}
                {t('La parola che hai messo in MYYND_INVITO sul server. Senza, qui non si registra nessuno — ed è voluto: su un indirizzo pubblico il primo che si registra diventerebbe il padrone della casella collegata.')}
              </div>
            </>
          )}

          {err && <div style={{ fontSize: '12.5px', color: '#E8907A', marginTop: 14, lineHeight: 1.5 }}>{t(err)}</div>}

          </>}

          {!chiusa && <button onClick={invia} disabled={!pronto || occupato} style={{
            marginTop: 28, width: '100%', padding: '14px 24px', borderRadius: 99, border: 'none',
            background: pronto && !occupato ? CHIARO : 'rgba(244,239,232,.16)',
            color: pronto && !occupato ? '#141210' : 'rgba(244,239,232,.45)',
            fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
            cursor: pronto && !occupato ? 'pointer' : 'default', transition: 'background .2s'
          }}>
            {/* su una macchina senza account non si «entra» da nessuna parte:
                lo si crea, ed è la prima cosa che uno legge del prodotto */}
            {occupato ? '…' : registrato ? t('Entra') : t('Crea l\'accesso')}
          </button>}

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
