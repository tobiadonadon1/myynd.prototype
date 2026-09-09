import { useEffect, useRef, useState } from 'react'
import { t } from '../lingua'
import { ConnectorIcon } from '../components/ConnectorIcon'
import { Marchio } from '../components/Marchio'
import { IconFreccia } from '../icons'

/**
 * Quanto resta ogni momento, da solo.
 *
 * Abbastanza per leggere due righe e guardare una figura; non abbastanza per
 * annoiarsi. Il mouse sopra ferma il tempo — chi sta leggendo non va
 * interrotto — e un clic, una freccia, «Salta» lo mandano avanti.
 */
const DURATA = 5200

type Visivo = 'marchio' | 'fonti' | 'pagina' | 'bozza' | 'tuo'
type Momento = { chiave: string; kicker: string; titolo: [string, string]; riga: string; visivo: Visivo }

/**
 * Cinque momenti, nell'ordine in cui una persona capisce un prodotto:
 * cos'è, cosa legge, cosa le dà ogni mattina, cosa fa per lei, cosa non
 * le toglie. Frasi corte, una figura per momento, e poi la prima cosa da
 * fare davvero — il progetto — che è il primo strato su cui Myynd lavora.
 */
const MOMENTI: Momento[] = [
  { chiave: 'benvenuto', kicker: 'Il tuo digital brain', titolo: ['Meno rumore.', 'Più spazio per te.'], riga: 'I tuoi progetti, le tue idee. Una mente in più per portarli avanti.', visivo: 'marchio' },
  { chiave: 'legge', kicker: 'Quello che legge', titolo: ['Legge quello', 'che hai già.'], riga: 'Posta, file, note, agenda. Li colleghi una volta; li rilegge ogni giorno.', visivo: 'fonti' },
  { chiave: 'pagina', kicker: 'La prima pagina', titolo: ['Una pagina', 'ogni mattina.'], riga: 'Cosa aspetta te, cosa può aspettare, cosa è già a posto.', visivo: 'pagina' },
  { chiave: 'bozza', kicker: 'Prepara, tu decidi', titolo: ['Scrive la bozza.', 'Tu premi Invia.'], riga: 'Risposte, brief, riassunti: pronti prima che li chieda. Niente esce senza di te.', visivo: 'bozza' },
  { chiave: 'tuo', kicker: 'Resta tuo', titolo: ['Sul tuo computer.', 'Con la tua chiave.'], riga: 'Nessun modello incluso: colleghi Claude, o un modello che hai già. Cancelli tutto quando vuoi.', visivo: 'tuo' }
]

/** Le figure: costruite, non disegnate. Stessi colori del palco, stesse forme dell'app. */
function Figura({ visivo }: { visivo: Visivo }) {
  if (visivo === 'marchio') return (
    <div className="intro-figura intro-marchio"><div className="intro-alone" /><Marchio dim={150} /></div>
  )
  if (visivo === 'fonti') return (
    <div className="intro-figura intro-fonti">
      <div className="intro-tessere">
        {([['posta', 'Posta'], ['desktop', 'File'], ['note', 'Note'], ['calendario', 'Agenda']] as const).map(([id, nome], i) => (
          <div key={id} className="intro-tessera" style={{ animationDelay: `${.15 + i * .12}s` }}><ConnectorIcon id={id} size={22} /><span>{t(nome)}</span></div>
        ))}
      </div>
      <div className="intro-freccia"><IconFreccia size={18} /></div>
      <div className="intro-cervello"><Marchio dim={54} animato={false} /></div>
      <div className="intro-didascalia">{t('Restano dove sono.')}</div>
    </div>
  )
  if (visivo === 'pagina') return (
    <div className="intro-figura intro-pagina">
      <div className="intro-pagina-titolo">{t('Una cosa da fare.')}</div>
      <div className="intro-scura">
        <span className="intro-tag">{t('Da fare · oggi')}</span>
        <strong>{t('Rispondere a Rossi sul preventivo')}</strong>
      </div>
      <div className="intro-riga"><span>{t('Da leggere')}</span><b>2</b></div>
      <div className="intro-riga"><span>{t('Già gestito')}</span><b>5</b></div>
    </div>
  )
  if (visivo === 'bozza') return (
    <div className="intro-figura intro-bozza">
      <div className="intro-bozza-testa">{t('Re: Preventivo impianto')}</div>
      <p>{t('Gentile Rossi, ecco il preventivo aggiornato: consegna in quattro settimane dalla conferma.')}</p>
      <div className="intro-bozza-azioni"><span className="intro-pieno">{t('Manda')}</span><span className="intro-contorno">{t('Rivedi')}</span></div>
      <div className="intro-scala">
        {([['Osserva', false], ['Prepara', true], ['Fino in fondo', false]] as const).map(([nome, acceso]) => (
          <span key={nome} className={acceso ? 'is-on' : ''}><i />{t(nome)}</span>
        ))}
      </div>
    </div>
  )
  return (
    <div className="intro-figura intro-fatti">
      {([['I dati', 'Su questo computer'], ['Chi ragiona', 'Claude, o il tuo modello'], ['Chi decide', 'Tu, a ogni passo']] as const).map(([k, v]) => (
        <div key={k} className="intro-fatto"><span>{t(k)}</span><strong>{t(v)}</strong></div>
      ))}
    </div>
  )
}

/**
 * L'introduzione: cinque momenti che si leggono in venti secondi.
 *
 * Non è un tour e non spiega i bottoni: dice cos'è Myynd, cosa legge, cosa dà
 * ogni mattina, cosa prepara e cosa resta suo — nell'ordine in cui uno se lo
 * chiede. Poi finisce da sola nella prima cosa da fare davvero, il progetto.
 * Si salta con un tasto, si torna indietro con una freccia, e il mouse sopra
 * la ferma: chi legge non va interrotto.
 */
export function Introduzione({ avanti, pronto, riprendi, cambiaAccount, occupato }: {
  avanti: () => void
  /** Si può andare avanti: il conto c'è. Finché no, l'ultimo momento aspetta. */
  pronto: boolean
  riprendi: boolean; cambiaAccount: () => void; occupato: boolean
}) {
  const [i, setI] = useState(0)
  const [fermo, setFermo] = useState(false)
  /** Ogni volta che il mouse se ne va il tempo riparte da capo, e la barra con lui. */
  const [giro, setGiro] = useState(0)
  // sempre l'ultima `avanti`: chiusa dentro un timer o un tasto, quella vecchia
  // non saprebbe di un conto arrivato dopo il primo disegno
  const avantiRef = useRef(avanti)
  avantiRef.current = avanti
  const ultimo = i === MOMENTI.length - 1
  const finisci = () => { if (pronto && !occupato) avantiRef.current() }
  const prossimo = () => { if (ultimo) finisci(); else setI(i + 1) }
  const precedente = () => setI(n => Math.max(0, n - 1))

  useEffect(() => {
    if (fermo || occupato) return
    const id = window.setTimeout(prossimo, DURATA)
    return () => window.clearTimeout(id)
    // `prossimo` cambia a ogni momento: è il momento, non la funzione, che riparte il tempo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, fermo, occupato, pronto, giro])

  useEffect(() => {
    const tasti = (e: KeyboardEvent) => {
      if (occupato) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // niente spazio: con un bottone a fuoco lo premerebbe due volte
      if (e.key === 'ArrowRight') { e.preventDefault(); prossimo() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); precedente() }
      else if (e.key === 'Escape') { e.preventDefault(); finisci() }
    }
    window.addEventListener('keydown', tasti)
    return () => window.removeEventListener('keydown', tasti)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, occupato, pronto])

  const m = MOMENTI[i]
  return (
    <div className={`intro${fermo ? ' is-fermo' : ''}`} onMouseEnter={() => setFermo(true)} onMouseLeave={() => { setFermo(false); setGiro(g => g + 1) }}>
      {/* la regione viva: chi ascolta sente ogni momento nuovo, senza che il fuoco si sposti */}
      <div className="intro-testo" key={m.chiave} aria-live="polite">
        <span className="onboard-kicker">{t(m.kicker)}</span>
        <h1>{t(m.titolo[0])}<br /><em>{t(m.titolo[1])}</em></h1>
        <p>{t(m.riga)}</p>
        <div className="intro-azioni">
          <button className="onboard-primary" disabled={occupato || (ultimo && !pronto)} onClick={ultimo ? finisci : prossimo}>
            {ultimo ? (riprendi ? t('Riprendi') : t('Configura il progetto')) : t('Avanti')}<span className="onboard-arrow"><IconFreccia /></span>
          </button>
          {!ultimo && <button className="onboard-secondary" disabled={occupato || !pronto} onClick={finisci}>{t('Salta l’introduzione')}</button>}
          {i === 0 && <button className="onboard-secondary" disabled={occupato} onClick={cambiaAccount}>{t('Usa un altro account')}</button>}
        </div>
        {/* i cinque momenti: quello in corso si riempie nel tempo che gli resta;
            il mouse sopra lo ferma, e quando se ne va riparte da capo con il timer */}
        <div className="intro-passi" aria-label={t('Introduzione')}>
          {MOMENTI.map((x, n) => (
            <button key={x.chiave} type="button" aria-current={n === i ? 'step' : undefined} aria-label={t(x.kicker)} onClick={() => setI(n)}
              className={n < i ? 'is-done' : n === i ? 'is-now' : ''}>
              <i key={n === i ? giro : -1} style={n === i ? { ['--durata' as string]: `${DURATA}ms` } as React.CSSProperties : undefined} />
            </button>
          ))}
        </div>
      </div>
      <div className="intro-visivo" key={`f-${m.chiave}`} onClick={prossimo} aria-hidden="true">
        <Figura visivo={m.visivo} />
      </div>
    </div>
  )
}
