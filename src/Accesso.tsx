// L'accesso. Sullo stesso campo dell'onboarding, così l'app ha una voce sola.
//
// Due colonne dove c'è spazio: a sinistra perché uno dovrebbe volerlo, a
// destra le due caselle per averlo. Non è decorazione — questa è l'unica
// schermata che parla a chi non ha ancora niente, e un modulo da solo, in
// mezzo a uno schermo nero, non dice cosa si compra. Sotto i mille pixel la
// colonna di sinistra si riduce al titolo: la promessa resta, il resto no.
//
// La password non lascia mai il tuo computer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo } from './onboarding/campo'
import { api, DaVerificare, type Accesso as TipoAccesso } from './api'
import { lingua, ricordaLingua, t } from './lingua'
import { Logo } from './components/Marchio'
import { Hov, useLarghezza } from './ui'

const CHIARO = '#F4EFE8'
/** Il colore dell'accento: il bordo di quello che stai scrivendo adesso. */
const ACCESO = 'rgba(196,98,59,.8)'

type Modo = 'entra' | 'crea' | 'scordata' | 'nuova'

/**
 * Le tre righe della colonna di sinistra: prima metà chiara, seconda spenta.
 *
 * Sono coppie e non frasi intere perché il ritmo è il lavoro che fanno: la
 * prima metà è quello che Myynd fa, la seconda è quello che *non* devi fare
 * tu. Tre obiezioni in ordine — «dovrò caricare della roba», «deciderà al
 * posto mio», «quanto ci metto» — e la risposta a ognuna in quattro parole.
 */
const PROVE: [string, string][] = [
  ['Legge la tua posta e i tuoi file.', 'Non carichi niente.'],
  ['Risponde come risponderesti tu.', 'Invio lo premi tu.'],
  ['Dieci minuti la prima volta.', 'Poi impara da sola.']
]

/**
 * Il turno di ogni pezzo.
 *
 * Tutto insieme è un lampo e non si legge; a scaletta l'occhio arriva al
 * titolo, poi alle tre righe, poi al modulo — che è anche l'ordine in cui
 * servono. `both` tiene il pezzo invisibile *prima* del suo turno.
 */
function su(ritardo: number): React.CSSProperties {
  return { animation: 'entrasu .7s cubic-bezier(.2,.8,.3,1) both', animationDelay: `${ritardo}s` }
}

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
  const [modo, setModo] = useState<Modo>('entra')
  const registrato = modo === 'entra'
  const cv = useRef<HTMLCanvasElement>(null)
  const campo = useMemo(() => new Campo(), [])
  const largo = useLarghezza() >= 1000

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
    campo.imposta({ colori: ['#D8A46E', '#C4623B', '#7E9C82'], legami: true, quantita: 620 })
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

  /**
   * Quanto manca, da zero a uno.
   *
   * Non serve a spegnere il bottone — a quello ci pensa `pronto` — ma al
   * campo dietro: le particelle si raccolgono man mano che riempi, e mentre il
   * server risponde si stringono ancora. È la stessa idea dell'onboarding, dove
   * la mente si forma a ogni fonte collegata, portata qui: la schermata reagisce
   * a quello che fai invece di guardarti scrivere.
   */
  const passi =
    modo === 'scordata' ? [!!email.trim()] :
    modo === 'nuova' ? [password.length >= 8, ripeti.length >= 8 && ripeti === password] :
    [!!email.trim(), registrato ? password.length > 0 : password.length >= 8]
  const avanzamento = passi.filter(Boolean).length / passi.length

  useEffect(() => {
    campo.imposta({ coesione: 0.26 + avanzamento * 0.3 + (occupato ? 0.3 : 0) })
  }, [campo, avanzamento, occupato])

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
  const vaiA = (m: Modo) => { setModo(m); setErr(''); setDetto(''); setDaConfermare(false) }

  const pronto =
    modo === 'scordata' ? !!email.trim() :
    modo === 'nuova' ? password.length >= 8 && ripeti.length >= 8 :
    registrato
      ? !!email.trim() && password.length > 0
      : !!email.trim() && password.length >= 8 && (registrazione !== 'invito' || !!invito.trim())

  const tasto = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && pronto && !occupato) invia() }

  const schede = ([['entra', 'Accedi'], ['crea', 'Crea un account']] as const)
    .filter(([id]) => id === 'entra' || registrazione !== 'chiusa')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#141210', color: CHIARO,
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", overflow: 'hidden'
    }}>
      <canvas ref={cv} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {/* il velo: il testo deve restare leggibile qualunque cosa passi dietro,
          e su due colonne deve coprire tutte e due invece del solo centro */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: largo
          ? 'radial-gradient(ellipse 54vw 56vh at 50% 50%, rgba(16,14,12,.66) 0%, rgba(16,14,12,.60) 56%, rgba(16,14,12,.30) 84%, rgba(16,14,12,0) 100%)'
          : 'radial-gradient(circle 47vmin at 50% 48%, rgba(16,14,12,.72) 0%, rgba(16,14,12,.70) 58%, rgba(16,14,12,.42) 82%, rgba(16,14,12,0) 100%)'
      }} />

      {/*
        `margin: auto` e non `alignItems: center`.

        Un contenuto centrato che diventa più alto del suo contenitore perde la
        testa: la parte che sborda finisce *sopra* al bordo, dove non ci si può
        scorrere. Con il margine automatico resta centrato finché ci sta, e
        appena non ci sta più si comporta da pagina. Qui succede davvero — «Crea
        un account» con codice d'invito e file da portare è alto il doppio.
      */}
      <div style={{
        position: 'relative', height: '100%', display: 'flex', overflowY: 'auto',
        pointerEvents: 'none'   // le particelle devono sentire il cursore
      }}>
        <div style={{
          margin: 'auto', display: 'flex', alignItems: 'flex-start',
          gap: largo ? 84 : 0, padding: largo ? '44px 40px' : '32px 24px'
        }}>
          {largo && <Pitch modo={modo} />}

          <div style={{
            width: 380, maxWidth: '100%', flex: 'none',
            textShadow: '0 1px 24px rgba(12,10,8,.8)', pointerEvents: 'auto'
          }}>
            {/* stretta, il marchio sta qui: è comunque la prima cosa che si vede */}
            {!largo && (
              <div style={{ marginBottom: 26, ...su(0) }}>
                <Logo dim={38} testo={26} tinta={CHIARO} />
              </div>
            )}
            {!largo && modo === 'crea' && (
              <div style={{ fontSize: 27, lineHeight: 1.18, letterSpacing: '-.03em', marginBottom: 22, textWrap: 'pretty', ...su(.06) }}>
                {t('Smetti di essere il passaggio obbligato.')}
              </div>
            )}

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
              <div style={su(.1)}>
                <Schede schede={schede} modo={modo} vai={vaiA} />
              </div>
            )}

            <div style={{
              fontSize: '13px', lineHeight: 1.55, color: 'rgba(244,239,232,.5)',
              marginBottom: 22, textWrap: 'pretty', ...su(.14)
            }}>
              {modo === 'scordata'
                ? t('Scrivi il tuo indirizzo: se è qui, ti mandiamo un collegamento per scegliere una password nuova.')
                : modo === 'nuova'
                  ? t('Scegli una password nuova. Le sessioni aperte altrove si chiudono tutte.')
                  : registrato
                    ? t('Entra con l’indirizzo con cui l’hai creato.')
                    : t('Un indirizzo e una password. Il resto te lo chiede dopo.')}
            </div>

            {/*
              La porta chiusa si dice, invece di sparire.

              Con le registrazioni chiuse la scheda «Crea un account» veniva
              tolta e basta: chi arriva qui senza un conto trovava un modulo
              d'accesso e nient'altro — nessuna spiegazione, nessuna strada, e
              nemmeno il sospetto che una strada esistesse da qualche parte. È
              il caso in cui una persona vera è rimasta fuori: mandi l'indirizzo
              a qualcuno, e quel qualcuno non ha *niente* da premere.

              Dirlo non regala niente a nessuno — chi tenta di registrarsi lo
              sente comunque dal server, con la stessa frase — e a chi è stato
              invitato davvero dice l'unica cosa che lo sblocca: chiedere a chi
              tiene su questo Myynd.
            */}
            {registrazione === 'chiusa' && modo === 'entra' && (
              <div style={{
                fontSize: '12.5px', lineHeight: 1.6, color: 'rgba(244,239,232,.42)',
                marginTop: -8, marginBottom: 22, textWrap: 'pretty', ...su(.16)
              }}>
                {t('Le registrazioni sono chiuse su questo server.')}{' '}
                {t('Se ti aspettavi di poterti fare un conto, chiedilo a chi tiene su questo Myynd.')}
              </div>
            )}

            <div style={su(.18)}>
              {modo !== 'nuova' && (
                <Casella etichetta={t('Email')} value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={tasto} type="email" autoComplete="username" autoFocus
                  placeholder={t('tu@tuodominio.it')} />
              )}

              {modo !== 'scordata' && (
                <Casella etichetta={modo === 'nuova' ? t('Password nuova') : t('Password')}
                  value={password} onChange={e => setPassword(e.target.value)} onKeyDown={tasto}
                  type={vedi ? 'text' : 'password'}
                  autoComplete={registrato ? 'current-password' : 'new-password'}
                  autoFocus={modo === 'nuova'}
                  placeholder={registrato ? '' : t('otto caratteri')}
                  coda={
                    <button type="button" onClick={() => setVedi(v => !v)}
                      aria-label={vedi ? t('Nascondi la password') : t('Mostra la password')}
                      title={vedi ? t('Nascondi la password') : t('Mostra la password')}
                      style={{
                        position: 'absolute', right: 6, top: 8, bottom: 0, width: 40,
                        display: 'grid', placeItems: 'center',
                        border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                        color: vedi ? 'rgba(244,239,232,.8)' : 'rgba(244,239,232,.4)',
                        transition: 'color .18s'
                      }}>
                      <Occhio aperto={vedi} />
                    </button>
                  } />
              )}

              {modo === 'nuova' && (
                <Casella etichetta={t('Ripeti la password')} value={ripeti}
                  onChange={e => setRipeti(e.target.value)} onKeyDown={tasto}
                  type={vedi ? 'text' : 'password'} autoComplete="new-password" />
              )}

              {!registrato && registrazione === 'invito' && modo === 'crea' && (
                <Casella etichetta={t('Codice d’invito')} value={invito}
                  onChange={e => setInvito(e.target.value)} onKeyDown={tasto}
                  autoComplete="off" placeholder={t('te lo dà chi ti ha invitato')} />
              )}
            </div>

            {err && <Riga colore="#E8907A">{t(err)}</Riga>}
            {detto && <Riga colore="#9DBF9F">{detto}</Riga>}

            <div style={su(.26)}>
              <Bottone pronto={pronto} occupato={occupato} premi={invia}>
                {modo === 'scordata' ? t('Mandami il collegamento')
                  : modo === 'nuova' ? t('Salva ed entra')
                    : registrato ? t('Accedi')
                      : pacco ? t('Crea l\'accesso e portalo qui') : t('Crea il tuo Myynd')}
              </Bottone>
            </div>

            {/*
              Il trasloco sta *sotto* al bottone, e non fra le caselle.

              Portarsi dietro un Myynd che si ha già è la strada di uno su
              cento, e stava in mezzo alla strada di tutti gli altri: fra la
              password e il bottone, con due righe di spiegazione, proprio nel
              punto in cui uno vuole solo finire. Sotto si vede lo stesso — chi
              ha quel file lo sta cercando — e la strada principale torna a
              essere tre cose in fila.
            */}
            {modo === 'crea' && (
              <div style={{ marginTop: 18, ...su(.3) }}>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 9, cursor: 'pointer', maxWidth: '100%',
                  fontSize: '12.5px', color: pacco ? CHIARO : 'rgba(244,239,232,.5)'
                }}>
                  <span style={{
                    display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 7,
                    borderWidth: 1, borderStyle: 'solid',
                    borderColor: pacco ? 'rgba(244,239,232,.5)' : 'rgba(244,239,232,.25)',
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


            {/*
              Le due vie di scampo, sotto al bottone e non fra i campi.

              «Ho dimenticato la password» si vede solo dove serve a qualcosa: in
              casa, e su un server senza posta configurata, non c'è nessun modo di
              mandare quel collegamento — e un bottone che porta a una mail che non
              arriverà mai è peggio di nessun bottone.
            */}
            <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', ...su(.3) }}>
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
              marginTop: 24, fontSize: '11.5px', color: 'rgba(244,239,232,.34)', lineHeight: 1.6,
              ...su(.34)
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
                  <Hov as="button" key={l} type="button"
                    onClick={() => { ricordaLingua(l); ridisegna(n => n + 1) }}
                    style={{
                      border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '11.5px', letterSpacing: '.06em',
                      textTransform: 'uppercase', transition: 'color .18s',
                      color: lingua() === l ? 'rgba(244,239,232,.75)' : 'rgba(244,239,232,.3)'
                    }}
                    hover={{ color: 'rgba(244,239,232,.75)' }}>{l === 'it' ? 'Italiano' : 'English'}</Hov>
                ))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * La colonna di sinistra: perché uno dovrebbe volerlo.
 *
 * Cambia con quello che stai facendo, e su tre delle quattro strade è una riga
 * sola. Le tre prove stanno solo su «crea un account»: a chi ha già un conto
 * non si vende niente — si dice bentornato e ci si toglie di mezzo.
 */
function Pitch({ modo }: { modo: Modo }) {
  const titolo =
    modo === 'crea' ? t('Smetti di essere il passaggio obbligato.')
      : modo === 'scordata' ? t('Capita.')
        : modo === 'nuova' ? t('Una password nuova.')
          : t('Bentornato.')

  return (
    <div style={{
      width: 420, flex: 'none', pointerEvents: 'auto',
      textShadow: '0 1px 26px rgba(12,10,8,.85)'
    }}>
      <div style={{ marginBottom: 34, ...su(0) }}>
        <Logo dim={40} testo={27} tinta={CHIARO} />
      </div>
      <div style={{ fontSize: 40, lineHeight: 1.14, letterSpacing: '-.035em', textWrap: 'pretty', ...su(.07) }}>
        {titolo}
      </div>

      {modo === 'crea' && (
        <div style={{ display: 'flex', gap: 18, marginTop: 30 }}>
          {/* una riga sola per tutte e tre, nei colori di casa: tiene insieme
              il gruppo senza mettere un segno davanti a ogni frase */}
          <span aria-hidden="true" style={{
            width: 2, flex: 'none', borderRadius: 2,
            background: 'linear-gradient(180deg,#C4623B,#D8A46E 52%,#7E9C82)',
            ...su(.12)
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, minWidth: 0 }}>
            {PROVE.map(([fa, no], i) => (
              <div key={fa} style={{ fontSize: '15.5px', lineHeight: 1.5, textWrap: 'pretty', ...su(.16 + i * .07) }}>
                {t(fa)} <span style={{ color: 'rgba(244,239,232,.52)' }}>{t(no)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {modo === 'entra' && (
        <div style={{
          fontSize: 16, lineHeight: 1.6, color: 'rgba(244,239,232,.6)',
          marginTop: 16, maxWidth: 340, textWrap: 'pretty', ...su(.14)
        }}>
          {t('Riprende da dove l’hai lasciata.')}
        </div>
      )}
    </div>
  )
}

/**
 * Le due schede, con la pastiglia che scivola.
 *
 * Prima il fondo si accendeva di colpo sotto quella premuta, e le due schede
 * sembravano due bottoni scollegati. Una pastiglia sola che si sposta dice che
 * è un interruttore a due posizioni — cioè esattamente cosa sono — e lo dice
 * mentre si muove, che è il momento in cui uno guarda.
 */
function Schede({ schede, modo, vai }: {
  schede: readonly (readonly [Modo, string])[]
  modo: Modo
  vai: (m: Modo) => void
}) {
  /*
   * Una scelta sola non è un interruttore.
   *
   * Con le registrazioni chiuse restava una pastiglia singola con dentro
   * «Accedi», premuta e impremibile: la forma di un interruttore a due
   * posizioni con una posizione sola. Non si legge come «qui si accede» — si
   * legge come una cosa rotta, o come l'altra metà che non ha finito di
   * caricare. Sotto c'è già la riga che dice cosa stai facendo.
   */
  if (schede.length < 2) return null

  const indice = schede.findIndex(([id]) => id === modo)
  return (
    <div style={{
      position: 'relative', display: 'inline-grid', marginBottom: 20,
      gridTemplateColumns: `repeat(${schede.length},minmax(0,1fr))`,
      padding: 4, borderRadius: 99, background: 'rgba(244,239,232,.06)',
      width: 320, maxWidth: '100%'
    }}>
      {/* fuori dal flusso: la pastiglia non deve spostare le scritte */}
      {indice >= 0 && (
        <span aria-hidden="true" style={{
          position: 'absolute', left: 4, top: 4, bottom: 4,
          width: `calc((100% - 8px) / ${schede.length})`,
          borderRadius: 99, background: 'rgba(244,239,232,.15)',
          transform: `translateX(${indice * 100}%)`,
          transition: 'transform .3s cubic-bezier(.4,0,.2,1)'
        }} />
      )}
      {schede.map(([id, testo]) => (
        <button key={id} type="button" onClick={() => vai(id)}
          style={{
            position: 'relative', padding: '8px 14px', borderRadius: 99, border: 'none',
            background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px',
            fontWeight: modo === id ? 500 : 400, transition: 'color .2s',
            color: modo === id ? CHIARO : 'rgba(244,239,232,.45)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>{t(testo)}</button>
      ))}
    </div>
  )
}

/**
 * Il bottone, e il riflesso che lo attraversa mentre il server risponde.
 *
 * Prima diventava «…» e restava spento: la scritta spariva proprio quando uno
 * la stava guardando, e il bottone sembrava rotto invece che occupato. Adesso
 * la scritta resta ferma, il colore resta acceso — l'azione è ancora quella —
 * e una luce lo attraversa finché non è finita.
 */
function Bottone({ pronto, occupato, premi, children }: {
  pronto: boolean; occupato: boolean; premi: () => void; children: React.ReactNode
}) {
  const vivo = pronto && !occupato
  return (
    <Hov as="button" onClick={premi} disabled={!vivo} aria-busy={occupato}
      style={{
        position: 'relative', overflow: 'hidden',
        marginTop: 26, width: '100%', padding: '14px 24px', borderRadius: 99, border: 'none',
        background: pronto ? CHIARO : 'rgba(244,239,232,.16)',
        color: pronto ? '#141210' : 'rgba(244,239,232,.45)',
        fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
        cursor: vivo ? 'pointer' : 'default',
        transition: 'background .2s, transform .18s, box-shadow .2s'
      }}
      hover={vivo ? { background: '#FFFFFF', transform: 'translateY(-1px)', boxShadow: '0 12px 30px rgba(10,8,6,.4)' } : {}}>
      {children}
      {occupato && (
        <span aria-hidden="true" style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: '45%',
          background: 'linear-gradient(100deg,transparent,rgba(20,18,16,.13),transparent)',
          animation: 'lucido 1.15s linear infinite'
        }} />
      )}
    </Hov>
  )
}

/** Una riga di esito — andata male o andata bene — che entra invece di comparire. */
function Riga({ colore, children }: { colore: string; children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '12.5px', color: colore, marginTop: 14, lineHeight: 1.5,
      textWrap: 'pretty', overflowWrap: 'anywhere', animation: 'entrasu .3s ease both'
    }}>{children}</div>
  )
}

/**
 * Una casella con la sua etichetta, e il bordo che si scalda quando ci scrivi.
 *
 * Il bordo caldo non è vezzo: su un fondo scuro con quattro caselle uguali,
 * dove sta il cursore si capisce solo dal cursore stesso — che lampeggia, è
 * alto due millimetri, e sparisce appena passi al mouse. Il colore lo dice da
 * un metro. Non basta un `:focus` nel CSS: qui gli stili sono in linea, e in
 * linea vincono sempre sul foglio.
 */
function Casella({ etichetta, coda, ...campo }: {
  etichetta: string
  /** Quello che sta dentro la casella, a destra: l'occhio della password. */
  coda?: React.ReactNode
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [dentro, setDentro] = useState(false)
  return (
    <label style={{ display: 'block' }}>
      <div style={{
        ...ETICHETTA, transition: 'color .18s',
        color: dentro ? 'rgba(244,239,232,.75)' : 'rgba(244,239,232,.45)'
      }}>{etichetta}</div>
      <div style={{ position: 'relative' }}>
        <input {...campo} className="scuro"
          onFocus={e => { setDentro(true); campo.onFocus?.(e) }}
          onBlur={e => { setDentro(false); campo.onBlur?.(e) }}
          style={{
            ...CAMPO,
            paddingRight: coda ? 52 : 16,
            borderColor: dentro ? ACCESO : 'rgba(244,239,232,.22)',
            background: dentro ? 'rgba(244,239,232,.1)' : 'rgba(244,239,232,.06)'
          }} />
        {coda}
      </div>
    </label>
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

// il bordo scritto per pezzi e non con la scorciatoia: `borderColor` cambia da
// solo quando ci scrivi, e mescolare le due forme fa lampeggiare il bordo
const CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '13px 16px',
  borderRadius: 14, borderWidth: 1, borderStyle: 'solid',
  color: CHIARO, fontSize: 15, fontFamily: 'inherit', outline: 'none',
  transition: 'border-color .18s, background-color .18s'
}

/** Una via di scampo: si legge, non si preme per sbaglio. */
const SOTTILE: React.CSSProperties = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: '12.5px', color: 'rgba(244,239,232,.55)',
  textDecoration: 'underline', textUnderlineOffset: 3
}

const ETICHETTA: React.CSSProperties = {
  fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 16
}
