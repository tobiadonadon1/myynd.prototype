// Account access shares the onboarding artwork; authentication stays local to its existing flow.

import { useEffect, useState } from 'react'
import { LightField } from './onboarding/LightField'
import { api, DaVerificare, type Accesso as TipoAccesso } from './api'
import { lingua, ricordaLingua, t } from './lingua'
import { Marchio } from './components/Marchio'
import { Hov, useLarghezza } from './ui'
import './accesso.css'

const INCHIOSTRO = '#f6f2eb'
const ACCESO = '#f6f2eb'
/** Il colore di una cosa che non va, sotto al campo che non va. */
const SBAGLIATO = '#f3b49d'

type Modo = 'entra' | 'crea' | 'scordata' | 'nuova'

/**
 * Un indirizzo che sembri un indirizzo.
 *
 * Il campo era `type="email"` e basta, e senza un modulo attorno il browser
 * non controlla niente: «tobia» passava, arrivava al server, e il server
 * rispondeva con una riga generica sotto al bottone. Qui si guarda prima e si
 * dice sotto al campo: qualcosa prima della chiocciola che non cominci col
 * punto, un dominio con un punto e almeno due lettere dopo, niente spazi e
 * niente punti doppi. La stessa regola sta in `server/conti.ts`: il server
 * non si fida di nessuno, ma la persona la risposta la vede qui.
 */
const INDIRIZZO = /^[^\s@.][^\s@]*@[^\s@]+\.[a-z]{2,}$/i
function indirizzoValido(e: string): boolean {
  const s = e.trim()
  return INDIRIZZO.test(s) && !s.includes('..')
}

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
  /*
   * Due colonne solo quando ce n'è davvero il posto.
   *
   * A mille pixel ci *stavano* — 420 + 84 + 380 fa 884 — ma «ci sta» e «sta
   * bene» non sono la stessa cosa: le due colonne finivano appiccicate ai due
   * bordi con un vuoto in mezzo e un vuoto sotto, e la pagina sembrava mezza
   * caricata invece che composta. Sotto la soglia la colonna singola è più
   * bella, ed è la ragione per cui la soglia sale invece di stringere ancora
   * le colonne.
   */
  const largo = useLarghezza() >= 980

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
  // il codice che chi ospita dà a chi può registrarsi, se ha scelto così
  const [invito, setInvito] = useState('')
  /**
   * Come si chiama, chiesto subito.
   *
   * Il conto nasceva senza un nome e l'app lo chiamava «tu» finché non lo
   * scriveva nelle preferenze — cioè quasi mai. Ogni risposta e ogni bozza
   * erano scritte per nessuno. Una riga qui, prima dell'indirizzo, e Myynd sa
   * con chi parla dal primo minuto.
   */
  const [nome, setNome] = useState('')
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
  /** Si è usciti dal campo dell'indirizzo: da lì in poi, se non sembra un indirizzo, lo si dice sotto. */
  const [emailToccata, setEmailToccata] = useState(false)

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
    // si guarda l'indirizzo prima di partire: la riga sotto al campo dice cosa non va
    if (modo !== 'nuova' && modo !== 'entra' && !indirizzoValido(email)) { setEmailToccata(true); return }
    if (modo === 'crea' && password !== ripeti) return
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
        : await api.registra(email, password, invito, nome.trim())
      /*
       * Registrato, e non ancora dentro.
       *
       * Dove l'indirizzo va confermato il server non manda nessun token: qui si
       * resta, e si dice di guardare la posta prima di entrare.
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
          setDetto(t('Controlla la posta: ti abbiamo mandato un collegamento per confermare il tuo indirizzo.'))
        }
        setPassword(''); setRipeti('')
        setOccupato(false)
        return
      }
      entrato(r.account)
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
  const vaiA = (m: Modo) => { setModo(m); setErr(''); setDetto(''); setDaConfermare(false); setRipeti(''); setEmailToccata(false) }

  /*
   * Per entrare basta che l'indirizzo non sia vuoto: un conto nato con le
   * regole di prima potrebbe avere un indirizzo che quelle di adesso non
   * accettano, e la porta di casa non si chiude per un punto in più. Per
   * crearne uno, o chiedere il collegamento, l'indirizzo deve sembrare un
   * indirizzo, e la password deve essere scritta due volte uguale.
   */
  const pronto =
    modo === 'scordata' ? indirizzoValido(email) :
    modo === 'nuova' ? password.length >= 8 && ripeti === password :
    registrato
      ? !!email.trim() && password.length > 0
      : !!nome.trim() && indirizzoValido(email) && password.length >= 8 && ripeti === password && (registrazione !== 'invito' || !!invito.trim())

  const tasto = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && pronto && !occupato) invia() }

  const schede = ([['entra', 'Accedi'], ['crea', 'Crea un account']] as const)
    .filter(([id]) => id === 'entra' || registrazione !== 'chiusa')

  return (
    <div className="accesso-page" style={{
      position: 'fixed', inset: 0, color: '#f6f2eb',
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", overflow: 'hidden'
    }}>
      <LightField quiet />
      <div className="accesso-atmosphere" aria-hidden="true" />

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
        pointerEvents: 'none'
      }}>
        <div style={{
          margin: 'auto', display: 'flex', alignItems: 'center',
          gap: largo ? 80 : 0, padding: largo ? '44px 40px' : '32px 20px',
          width: largo ? 'auto' : '100%', boxSizing: 'border-box', justifyContent: 'center'
        }}>
          {largo && <Pitch modo={modo} />}

          <div className="accesso-card" style={{
            width: 430, maxWidth: '100%', flex: 'none', pointerEvents: 'auto', color: INCHIOSTRO
          }}>
            {/* stretta, il marchio sta qui: è comunque la prima cosa che si vede */}
            {!largo && (
              <div style={{ marginBottom: 22, ...su(0) }}>
                <Marchio dim={34} />
              </div>
            )}
            {!largo && (
              <h1 className="accesso-title" style={su(.06)}>
                {titoloAccesso(modo)}
              </h1>
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
              fontSize: '13px', lineHeight: 1.55, color: '#bdb0a4',
              marginBottom: 22, textWrap: 'pretty', ...su(.14)
            }}>
              {modo === 'scordata'
                ? t('Scrivi il tuo indirizzo: se è qui, ti mandiamo un collegamento per scegliere una password nuova.')
                : modo === 'nuova'
                  ? t('Scegli una password nuova. Le sessioni aperte altrove si chiudono tutte.')
                  : registrato
                    ? t('Entra con l’indirizzo con cui l’hai creato.')
                    : t('Il tuo nome, un indirizzo e una password. Il resto te lo chiede dopo.')}
            </div>

            {/*
              La porta chiusa si dice, invece di sparire.

              Con le registrazioni chiuse la scheda «Crea un account» veniva
              tolta e basta: chi arriva qui senza un conto trovava un modulo
              d'accesso e nient'altro — nessuna spiegazione, nessuna strada, e
              nemmeno il sospetto che una strada esistesse da qualche parte.

              Una frase e non due. Prima c'era anche «chiedilo a chi tiene su
              questo Myynd», ed era scritta per un estraneo — ma su un Myynd di
              una persona sola chi legge quella riga è quasi sempre il padrone
              del server, e a lui dice di chiedere a sé stesso. Un consiglio che
              non si può seguire fa dubitare anche della frase che sta accanto.
              Il fatto, secco, non ha quel problema.
            */}
            {registrazione === 'chiusa' && modo === 'entra' && (
              <div style={{
                fontSize: '12.5px', lineHeight: 1.6, color: '#bdb0a4',
                marginTop: -8, marginBottom: 22, textWrap: 'pretty', ...su(.16)
              }}>
                {t('Le registrazioni sono chiuse su questo server.')}
              </div>
            )}

            <div style={su(.18)}>
              {modo === 'crea' && (
                <Casella etichetta={t('Il tuo nome')} value={nome} onChange={e => setNome(e.target.value)}
                  onKeyDown={tasto} autoComplete="name" autoFocus maxLength={80} />
              )}
              {modo !== 'nuova' && (
                <Casella key={modo === 'crea' ? 'crea' : 'accesso'} etichetta={t('Email')} value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={tasto} onBlur={() => setEmailToccata(true)} type="email" autoComplete="username" autoFocus={modo !== 'crea'}
                  placeholder={t('tu@tuodominio.it')}
                  errore={modo !== 'entra' && emailToccata && !!email.trim() && !indirizzoValido(email) ? t('Questo non sembra un indirizzo email.') : undefined} />
              )}

              {modo !== 'scordata' && (
                <Casella etichetta={modo === 'nuova' ? t('Password nuova') : t('Password')}
                  value={password} onChange={e => setPassword(e.target.value)} onKeyDown={tasto}
                  type={vedi ? 'text' : 'password'}
                  autoComplete={registrato ? 'current-password' : 'new-password'}
                  autoFocus={modo === 'nuova'}
                  placeholder={registrato ? '' : t('otto caratteri')}
                  coda={<Occhiello vedi={vedi} cambia={() => setVedi(x => !x)} />} />
              )}

              {/* due volte, qui come dove si cambia: e se non tornano lo si vede mentre si scrive */}
              {(modo === 'nuova' || modo === 'crea') && (
                <Casella etichetta={t('Conferma la password')} value={ripeti}
                  onChange={e => setRipeti(e.target.value)} onKeyDown={tasto}
                  type={vedi ? 'text' : 'password'} autoComplete="new-password"
                  coda={<Occhiello vedi={vedi} cambia={() => setVedi(x => !x)} />}
                  errore={ripeti && password !== ripeti ? t('Le due password non coincidono.') : undefined} />
              )}

              {!registrato && registrazione === 'invito' && modo === 'crea' && (
                <Casella etichetta={t('Codice d’invito')} value={invito}
                  onChange={e => setInvito(e.target.value)} onKeyDown={tasto}
                  autoComplete="off" placeholder={t('te lo dà chi ti ha invitato')} />
              )}
            </div>

            {err && <Riga colore="#f3b49d" ruolo="alert">{t(err)}</Riga>}
            {detto && <Riga colore="#c1d2b9" ruolo="status">{detto}</Riga>}

            <div style={su(.26)}>
              <Bottone pronto={pronto} occupato={occupato} premi={invia}>
                {modo === 'scordata' ? t('Mandami il collegamento')
                  : modo === 'nuova' ? t('Salva ed entra')
                    : registrato ? t('Accedi')
                      : t('Crea il tuo Myynd')}
              </Bottone>
            </div>

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
              marginTop: 24, fontSize: '11.5px', color: '#bdb0a4', lineHeight: 1.6,
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
                    aria-pressed={lingua() === l}
                    onClick={() => { ricordaLingua(l); ridisegna(n => n + 1) }}
                    style={{
                      border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '11.5px', letterSpacing: '.06em',
                      textTransform: 'uppercase', transition: 'color .18s',
                      color: lingua() === l ? '#f6f2eb' : '#bdb0a4'
                    }}
                    hover={{ color: '#f6f2eb' }}>{l === 'it' ? 'Italiano' : 'English'}</Hov>
                ))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function titoloAccesso(modo: Modo) {
  return modo === 'crea' ? t('Crea il tuo Myynd')
    : modo === 'scordata' ? t('Capita.')
      : modo === 'nuova' ? t('Una password nuova.')
        : t('Bentornato.')
}

function Pitch({ modo }: { modo: Modo }) {
  return <div className="accesso-pitch">
    <div className="accesso-mark" style={su(0)}><Marchio dim={36} /></div>
    <h1 className="accesso-title" style={su(.07)}>{titoloAccesso(modo)}</h1>
    {modo === 'entra' && <p style={su(.14)}>{t('Riprende da dove l’hai lasciata.')}</p>}
  </div>
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
      padding: 4, borderRadius: 99, background: 'rgba(246,242,235,.045)',
      width: 320, maxWidth: '100%'
    }}>
      {/* fuori dal flusso: la pastiglia non deve spostare le scritte */}
      {indice >= 0 && (
        <span aria-hidden="true" style={{
          position: 'absolute', left: 4, top: 4, bottom: 4,
          width: `calc((100% - 8px) / ${schede.length})`,
          borderRadius: 99, background: 'rgba(246,242,235,.12)',
          transform: `translateX(${indice * 100}%)`,
          transition: 'transform .3s cubic-bezier(.4,0,.2,1)'
        }} />
      )}
      {schede.map(([id, testo]) => (
        <button key={id} type="button" onClick={() => vai(id)} aria-pressed={modo === id}
          style={{
            position: 'relative', padding: '8px 14px', borderRadius: 99, border: 'none',
            background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px',
            fontWeight: modo === id ? 500 : 400, transition: 'color .2s',
            color: modo === id ? INCHIOSTRO : '#bdb0a4',
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
        background: pronto ? '#f6f2eb' : 'rgba(246,242,235,.10)',
        color: pronto ? '#17130f' : '#a99d92',
        fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
        cursor: vivo ? 'pointer' : 'default',
        transition: 'background .2s, transform .18s, box-shadow .2s'
      }}
      hover={vivo ? { background: '#ffffff', transform: 'translateY(-1px)', boxShadow: '0 8px 24px -12px #ffffff50' } : {}}>
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
function Riga({ colore, children, ruolo }: { colore: string; children: React.ReactNode; ruolo: 'alert' | 'status' }) {
  return (
    <div role={ruolo} style={{
      fontSize: '12.5px', color: colore, marginTop: 14, lineHeight: 1.5,
      textWrap: 'pretty', overflowWrap: 'anywhere', animation: 'entrasu .3s ease both'
    }}>{children}</div>
  )
}

/**
 * Neutral focus makes the active field clear without changing the scene palette.
 *
 * L'errore sta sotto al suo campo, non sotto al bottone: «le due password non
 * coincidono» accanto alla seconda password si capisce senza cercare quale.
 */
function Casella({ etichetta, coda, errore, ...campo }: {
  etichetta: string
  /** Quello che sta dentro la casella, a destra: l'occhio della password. */
  coda?: React.ReactNode
  /** Cosa non va in questo campo, se qualcosa non va. */
  errore?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [dentro, setDentro] = useState(false)
  return (
    <label style={{ display: 'block' }}>
      <div style={{
        ...ETICHETTA, transition: 'color .18s',
        color: dentro ? INCHIOSTRO : '#bdb0a4'
      }}>{etichetta}</div>
      <div style={{ position: 'relative' }}>
        <input {...campo} className="scuro" aria-invalid={errore ? true : undefined}
          onFocus={e => { setDentro(true); campo.onFocus?.(e) }}
          onBlur={e => { setDentro(false); campo.onBlur?.(e) }}
          style={{
            ...CAMPO,
            paddingRight: coda ? 52 : 14,
            borderColor: errore ? SBAGLIATO : dentro ? ACCESO : 'rgba(246,242,235,.26)',
            background: dentro ? 'rgba(246,242,235,.05)' : 'rgba(246,242,235,.025)'
          }} />
        {coda}
      </div>
      {errore && (
        <div role="alert" style={{
          fontSize: '12px', color: SBAGLIATO, marginTop: 6, lineHeight: 1.5,
          textWrap: 'pretty', animation: 'entrasu .3s ease both'
        }}>{errore}</div>
      )}
    </label>
  )
}

/** Il bottone con l'occhio, dentro la casella: uno solo, e sta su tutt'e due le password. */
function Occhiello({ vedi, cambia }: { vedi: boolean; cambia: () => void }) {
  return (
    <button type="button" onClick={cambia}
      aria-label={vedi ? t('Nascondi la password') : t('Mostra la password')}
      title={vedi ? t('Nascondi la password') : t('Mostra la password')}
      style={{
        position: 'absolute', right: 6, top: 6, bottom: 0, width: 40,
        display: 'grid', placeItems: 'center',
        border: 'none', background: 'none', cursor: 'pointer', padding: 0,
        color: vedi ? '#f6f2eb' : '#bdb0a4',
        transition: 'color .18s'
      }}>
      <Occhio aperto={vedi} />
    </button>
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
// alto una riga: era 13 sopra e sotto, e per un indirizzo sembrava un riquadro
const CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '10px 14px',
  borderRadius: 8, borderWidth: 1, borderStyle: 'solid',
  color: INCHIOSTRO, fontSize: 15, lineHeight: 1.2, fontFamily: 'inherit', outline: 'none',
  transition: 'border-color .18s, background-color .18s'
}

/** Una via di scampo: si legge, non si preme per sbaglio. */
const SOTTILE: React.CSSProperties = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: '12.5px', color: '#bdb0a4',
  textDecoration: 'underline', textUnderlineOffset: 3
}

const ETICHETTA: React.CSSProperties = {
  fontSize: 11, letterSpacing: '.015em', marginTop: 12
}
