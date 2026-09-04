// L'accesso. Sullo stesso campo dell'onboarding, così l'app ha una voce sola.
//
// Al primo avvio crea l'account su questa macchina; dopo chiede solo email e
// password. La password non lascia mai il tuo computer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo } from './onboarding/campo'
import { api, DaVerificare, type Accesso as TipoAccesso } from './api'
import { lingua, ricordaLingua, t } from './lingua'
import { Logo } from './components/Marchio'

const CHIARO = '#F4EFE8'

export function Accesso({ accesso, entrato }: {
  accesso: TipoAccesso
  /** `avviso` è una cosa andata storta dopo che il conto c'era già: si entra, e la si dice dentro. */
  entrato: (a: { email: string }, avviso?: string) => void
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
  /*
   * Quattro cose e non due, e le ultime due non le sceglie lei.
   *
   * `scordata` la si chiede; `nuova` ci si arriva **solo** da un collegamento
   * arrivato per posta, che è quello che rende sicuro cambiare una password
   * senza sapere quella di prima.
   */
  const [modo, setModo] = useState<'entra' | 'crea' | 'scordata' | 'nuova'>('entra')
  const registrato = modo === 'entra'
  const cv = useRef<HTMLCanvasElement>(null)
  const campo = useMemo(() => new Campo(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  /** Cambiare lingua non passa da React: questo lo obbliga a ridisegnare. */
  const [, ridisegna] = useState(0)
  /**
   * Far vedere la password che si sta scrivendo.
   *
   * Su un campo d'accesso i pallini sono la cosa giusta finché si scrive una
   * password che si conosce. Quando non torna — e capita esattamente lì, sulla
   * riga che dice «non è corretta» — l'unica domanda utile è «l'ho scritta
   * bene?», e senza un modo di guardarla si riprova alla cieca tre volte prima
   * di dubitare della password invece che delle dita.
   */
  const [vedi, setVedi] = useState(false)
  /**
   * Il proprio Myynd, portato dentro mentre ci si registra.
   *
   * Stava nelle preferenze, ed era il passo di troppo: chi arriva su un
   * indirizzo nuovo con il suo file in mano deve prima farsi un conto, poi
   * trovare le preferenze, poi cercare la riga giusta. Sono tre schermate per
   * una cosa che è una sola — «questo sono io, e questa è la mia roba» — ed è
   * proprio il momento in cui uno ha il file sul desktop.
   */
  const [pacco, setPacco] = useState<File | null>(null)
  // il codice che chi ospita dà a chi può registrarsi, se ha scelto così
  const [invito, setInvito] = useState('')
  const registrazione = accesso.registrazione ?? 'aperta'
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)
  /** Una cosa andata bene, da dire qui: «guarda la posta», «te l'ho rimandata». */
  const [detto, setDetto] = useState('')
  /** La password nuova, dopo un collegamento: si chiede due volte come dappertutto. */
  const [ripeti, setRipeti] = useState('')
  /** Il gettone arrivato per posta. Sta qui e non nell'indirizzo: vedi sotto. */
  const [gettone, setGettone] = useState('')
  /** L'indirizzo esiste ma non è confermato: si può chiedere di rimandarla. */
  const [daConfermare, setDaConfermare] = useState(false)

  useEffect(() => {
    if (cv.current) campo.monta(cv.current)
    campo.imposta({ coesione: 0.42, colori: ['#D8A46E', '#C4623B', '#7E9C82'], legami: true, quantita: 620 })
    return () => campo.smonta()
  }, [campo])

  /*
   * I due collegamenti che arrivano per posta.
   *
   * **La prima cosa che si fa è togliere il gettone dall'indirizzo**, prima
   * ancora di usarlo. Un gettone che apre un conto non deve restare nella barra
   * degli indirizzi — dove lo legge chi passa e chi guarda lo schermo condiviso
   * — né nella cronologia del browser, né nel Referer verso qualunque immagine
   * la pagina caricasse. `replaceState` lo toglie da tutte e tre insieme.
   */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const daVerificare = q.get('verifica')
    const daRimettere = q.get('reimposta')
    if (!daVerificare && !daRimettere) return
    q.delete('verifica'); q.delete('reimposta')
    const resto = q.toString()
    window.history.replaceState(null, '', window.location.pathname + (resto ? `?${resto}` : ''))

    if (daRimettere) { setGettone(daRimettere); setModo('nuova'); return }
    setOccupato(true)
    api.confermaIndirizzo(daVerificare!)
      .then(r => entrato(r.account))
      .catch(e => { setErr(e instanceof Error ? e.message : String(e)); setModo('entra') })
      .finally(() => setOccupato(false))
    // una volta sola, all'apertura: il gettone non è più nell'indirizzo, e
    // rileggerlo a ogni ridisegno non troverebbe più niente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const invia = async () => {
    setOccupato(true); setErr(''); setDetto(''); setDaConfermare(false)
    try {
      if (modo === 'scordata') {
        await api.chiediReimpostazione(email)
        // la stessa frase sempre, che l'indirizzo esista o no: è la stessa
        // ragione per cui il server risponde sempre ok
        setDetto(t('Se quell’indirizzo è qui, ti abbiamo scritto: guarda la posta.'))
        setOccupato(false)
        return
      }
      if (modo === 'nuova') {
        if (password !== ripeti) { setErr(t('Le due password non coincidono.')); setOccupato(false); return }
        const r = await api.reimposta(gettone, password)
        entrato(r.account)
        setOccupato(false)
        return
      }
      const r = registrato
        ? await api.entra(email, password)
        : await api.registra(email, password, invito)
      /*
       * Registrato, e non ancora dentro.
       *
       * Dove l'indirizzo va confermato il server non manda nessun token: qui si
       * resta, e si dice di guardare la posta. Il file del trasloco, se ce n'è
       * uno, non si carica adesso — non c'è nessuna sessione con cui caricarlo
       * — e la schermata lo dice invece di lasciar credere che sia entrato.
       */
      // `in` su una proprietà facoltativa restringe il tipo e si porta via le
      // altre: quello che serve qui è la risposta della registrazione, letta intera
      const nuovo = registrato ? null : (r as { daVerificare?: boolean; mailPartita?: boolean })
      if (nuovo?.daVerificare) {
        setDaConfermare(true)
        // il conto c'è comunque, ma «guarda la posta» a chi non riceverà niente
        // è la bugia peggiore che una schermata d'accesso possa dire
        if (nuovo.mailPartita === false) {
          setDetto('')
          setErr(t('Il conto è fatto, ma la mail di conferma non è partita: la posta di questo server non funziona. Riprova a farsela mandare, o dillo a chi lo gestisce.'))
        } else {
          setDetto(pacco
            ? t('Controlla la posta: ti abbiamo mandato un collegamento per confermare il tuo indirizzo. Il tuo Myynd lo porti dentro dalle preferenze, appena entri.')
            : t('Controlla la posta: ti abbiamo mandato un collegamento per confermare il tuo indirizzo.'))
        }
        setPassword('')
        setOccupato(false)
        return
      }
      // il conto è fatto: se si è portato dietro il suo Myynd, entra adesso —
      // prima che la schermata si apra su un account vuoto che non è il suo
      let avviso: string | undefined
      if (!registrato && pacco) {
        /*
         * Se il file non entra, il conto c'è lo stesso, e il token pure.
         * Restare qui con l'errore voleva dire un secondo tentativo che
         * rispondeva «esiste già»: si entra, e lo si dice dentro — il file si
         * può riportare dalle preferenze.
         */
        try { await api.caricaTrasloco(pacco) }
        catch (e) { avviso = `${t('Il conto è pronto, ma il tuo Myynd non è entrato:')} ${t(e instanceof Error ? e.message : String(e))}` }
      }
      entrato(r.account, avviso)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      // la password è giusta e manca solo la conferma: si offre di rimandarla
      if (e instanceof DaVerificare) setDaConfermare(true)
      // chi si registra con un indirizzo che c'è già vuole quasi sempre entrare:
      // lo si porta sulla scheda giusta, con l'indirizzo già scritto
      if (!registrato && /già un account/i.test(msg)) setModo('entra')
    }
    setOccupato(false)
  }

  const rimanda = async () => {
    setOccupato(true); setErr('')
    try {
      const r = await api.rimandaConferma(email)
      if (r.mailPartita === false) {
        setDetto('')
        setErr(t('Non è partita: la posta di questo server non funziona. Dillo a chi lo gestisce.'))
      } else {
        setDetto(t('Te l’abbiamo rimandata: guarda la posta.'))
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  /** Da qui si passa fra le quattro schermate senza portarsi dietro un errore vecchio. */
  const vaiA = (m: typeof modo) => { setModo(m); setErr(''); setDetto(''); setDaConfermare(false) }

  const pronto =
    modo === 'scordata' ? !!email.trim() :
    modo === 'nuova' ? password.length >= 8 && ripeti.length >= 8 :
    registrato
      ? !!email.trim() && password.length > 0
      : !!email.trim() && password.length >= 8 && (registrazione !== 'invito' || !!invito.trim())

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
          {/* le due strade che arrivano da una mail non sono schede: ci si è
              dentro, e l'unica altra cosa che si può fare è tornare indietro */}
          {modo !== 'nuova' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {([['entra', 'Accedi'], ['crea', 'Crea un account']] as const)
              .filter(([id]) => id === 'entra' || registrazione !== 'chiusa')
              .map(([id, testo]) => (
              <button key={id} type="button" onClick={() => vaiA(id)}
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
          )}

          <div style={{ fontSize: '13px', lineHeight: 1.55, color: 'rgba(244,239,232,.5)', marginBottom: 24, textWrap: 'pretty' }}>
            {modo === 'scordata'
              ? t('Scrivi il tuo indirizzo: se è qui, ti mandiamo un collegamento per scegliere una password nuova.')
              : modo === 'nuova'
                ? t('Scegli una password nuova. Le sessioni aperte altrove si chiudono tutte.')
                : registrato
                  ? t('Entra con l’indirizzo con cui l’hai creato.')
                  : t('La tua posta, i tuoi file e le tue automazioni restano tuoi: ogni account ha la sua memoria, separata da quella di chiunque altro.')}
          </div>

          {modo !== 'nuova' && (
            <>
              <div style={ETICHETTA}>{t('Email')}</div>
              <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={tasto}
                type="email" autoComplete="username" autoFocus placeholder={t('tu@tuodominio.it')} className="scuro" style={CAMPO} />
            </>
          )}

          {modo !== 'scordata' && (
          <>
          <div style={ETICHETTA}>{modo === 'nuova' ? t('Password nuova') : t('Password')}</div>
          <div style={{ position: 'relative' }}>
            <input value={password} onChange={e => setPassword(e.target.value)} onKeyDown={tasto}
              type={vedi ? 'text' : 'password'}
              autoComplete={registrato ? 'current-password' : 'new-password'}
              autoFocus={modo === 'nuova'}
              placeholder={registrato ? '' : t('otto caratteri')} className="scuro"
              style={{ ...CAMPO, paddingRight: 52 }} />
            <button type="button" onClick={() => setVedi(v => !v)}
              aria-label={vedi ? t('Nascondi la password') : t('Mostra la password')}
              title={vedi ? t('Nascondi la password') : t('Mostra la password')}
              style={{
                position: 'absolute', right: 6, top: 8, bottom: 0, width: 40,
                display: 'grid', placeItems: 'center',
                border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                color: vedi ? 'rgba(244,239,232,.8)' : 'rgba(244,239,232,.4)'
              }}>
              <Occhio aperto={vedi} />
            </button>
          </div>
          </>
          )}

          {modo === 'nuova' && (
            <>
              <div style={ETICHETTA}>{t('Ripeti la password')}</div>
              <input value={ripeti} onChange={e => setRipeti(e.target.value)} onKeyDown={tasto}
                type={vedi ? 'text' : 'password'} autoComplete="new-password" className="scuro" style={CAMPO} />
            </>
          )}

          {!registrato && registrazione === 'invito' && modo === 'crea' && (
            <>
              <div style={ETICHETTA}>{t('Codice d’invito')}</div>
              <input value={invito} onChange={e => setInvito(e.target.value)} onKeyDown={tasto}
                autoComplete="off" placeholder={t('te lo dà chi ti ha invitato')} className="scuro" style={CAMPO} />
            </>
          )}

          {modo === 'crea' && (
            <div style={{ marginTop: 18 }}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 9, cursor: 'pointer', maxWidth: '100%',
                fontSize: '12.5px', color: pacco ? CHIARO : 'rgba(244,239,232,.5)'
              }}>
                <span style={{
                  display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 7,
                  border: `1px solid ${pacco ? 'rgba(244,239,232,.5)' : 'rgba(244,239,232,.25)'}`,
                  fontSize: 13, lineHeight: 1
                }}>{pacco ? '✓' : '+'}</span>
                {/* il nome di un file lo sceglie chi lo salva: può essere lungo quanto vuole */}
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{pacco ? pacco.name : t('Ho già un Myynd: portalo qui')}</span>
                <input type="file" accept=".myynd,application/gzip" style={{ display: 'none' }}
                  onChange={e => setPacco(e.target.files?.[0] ?? null)} />
              </label>
              <div style={{ fontSize: '11.5px', color: 'rgba(244,239,232,.34)', marginTop: 7, lineHeight: 1.55 }}>
                {t('Il file che hai scaricato da un altro Myynd, con dentro i tuoi documenti e le tue fonti.')}
              </div>
            </div>
          )}

          {err && <div style={{ fontSize: '12.5px', color: '#E8907A', marginTop: 14, lineHeight: 1.5 }}>{t(err)}</div>}
          {detto && <div style={{ fontSize: '12.5px', color: '#9DBF9F', marginTop: 14, lineHeight: 1.5, textWrap: 'pretty' }}>{detto}</div>}

          <button onClick={invia} disabled={!pronto || occupato} style={{
            marginTop: 28, width: '100%', padding: '14px 24px', borderRadius: 99, border: 'none',
            background: pronto && !occupato ? CHIARO : 'rgba(244,239,232,.16)',
            color: pronto && !occupato ? '#141210' : 'rgba(244,239,232,.45)',
            fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
            cursor: pronto && !occupato ? 'pointer' : 'default', transition: 'background .2s'
          }}>
            {occupato ? '…'
              : modo === 'scordata' ? t('Mandami il collegamento')
              : modo === 'nuova' ? t('Salva ed entra')
              : registrato ? t('Accedi')
              : pacco ? t('Crea l\'accesso e portalo qui') : t('Crea l\'accesso')}
          </button>

          {/*
            Le due vie di scampo, sotto al bottone e non fra i campi.

            «Ho dimenticato la password» si vede solo dove serve a qualcosa: in
            casa, e su un server senza posta configurata, non c'è nessun modo di
            mandare quel collegamento — e un bottone che porta a una mail che non
            arriverà mai è peggio di nessun bottone.
          */}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            {registrato && accesso.reimpostazione && (
              <button type="button" onClick={() => vaiA('scordata')} style={SOTTILE}>
                {t('Ho dimenticato la password')}
              </button>
            )}
            {daConfermare && (
              <button type="button" onClick={rimanda} disabled={occupato || !email.trim()} style={SOTTILE}>
                {t('Non è arrivata? Rimandamela')}
              </button>
            )}
            {(modo === 'scordata' || modo === 'nuova') && (
              <button type="button" onClick={() => vaiA('entra')} style={SOTTILE}>
                {t('Torna all’accesso')}
              </button>
            )}
          </div>

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

/**
 * L'occhio: aperto quando la password si vede, sbarrato quando no.
 *
 * La sbarra è quello che rende leggibile lo stato a colpo d'occhio. Un occhio
 * che cambia solo un po' di forma fra i due stati lascia sempre il dubbio su
 * quale dei due sia quello attivo, e allora si preme due volte per capirlo.
 */
function Occhio({ aperto }: { aperto: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.6 12S5.2 5.4 12 5.4 22.4 12 22.4 12 18.8 18.6 12 18.6 1.6 12 1.6 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {!aperto && <path d="M3.5 20.5 20.5 3.5" />}
    </svg>
  )
}

const CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '13px 16px',
  borderRadius: 14, border: '1px solid rgba(244,239,232,.22)', background: 'rgba(244,239,232,.06)',
  color: CHIARO, fontSize: 15, fontFamily: 'inherit', outline: 'none'
}

/** Una via di scampo: si legge, non si preme per sbaglio. */
const SOTTILE: React.CSSProperties = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: '12.5px', color: 'rgba(244,239,232,.55)',
  textDecoration: 'underline', textUnderlineOffset: 3
}

const ETICHETTA: React.CSSProperties = {
  fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
  color: 'rgba(244,239,232,.45)', marginTop: 16
}
