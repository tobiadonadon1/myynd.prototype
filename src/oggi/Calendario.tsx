import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type Compito, type Priorita, type Progetto } from '../api'
import { t } from '../lingua'
import {
  dataLocale, giornoCompito, giorniVisibili, inizioSettimana, quantiGiorni, spostaGiorno
} from './giorni'
import './calendario.css'

/**
 * Il calendario delle cose da fare: la striscia della settimana e tre giorni alti.
 *
 * Qui c'era anche una vista a mese, scelta da un interruttore a due posizioni.
 * Non è piaciuta, e per una ragione giusta: una griglia di caselle piccole
 * dentro una colonna non è un calendario, è un riassunto. Al suo posto c'è un
 * comando solo — «Espandi» — e la settimana vera si apre su tutta
 * l'applicazione, con gli attrezzi a sinistra e le ore sotto. Un comando, non
 * una scelta da fare ogni volta.
 */
export function Calendario({ compiti, oggi, giorno, scegli, lingua, pianifica, renderRiga, senzaData, setSenzaData, espandi, aggiungi }: {
  compiti: Compito[]; oggi: string; giorno: string; scegli: (g: string) => void; lingua: string
  pianifica: (id: string, giorno: string | null) => void
  /** `ritardo` è la data in cui doveva essere fatta, già scritta per esteso: c'è solo sulle arretrate. */
  renderRiga: (c: Compito, ritardo?: string) => ReactNode
  senzaData: boolean; setSenzaData: (v: boolean | ((v: boolean) => boolean)) => void
  /** Apre la settimana su tutta l'applicazione. */
  espandi: () => void
  /** Una riga nuova, scritta dentro il giorno in cui va, con la sua ora, la priorità e il progetto. */
  aggiungi: (riga: RigaNuova, giorno: string) => void
}) {
  const [sopra, setSopra] = useState<string | null>(null)
  /**
   * Il giorno in cui si sta scrivendo, se si sta scrivendo.
   *
   * «There is a + that comes up on the calendar. It's very small and not very
   * visible… and usually when I click it, it just points me to the bar at the
   * top, which is not efficient at all.» Era vero alla lettera: quel «+»
   * chiamava `focus()` su un campo che sta sopra il calendario, e il gesto
   * finiva a due riquadri di distanza da dove l'aveva cominciato. Adesso la
   * riga si scrive dentro la colonna del suo giorno, e la barra in cima non
   * c'è più.
   */
  const [scrivendo, setScrivendo] = useState<string | null>(null)
  /**
   * Qualcosa si sta trascinando, adesso.
   *
   * Serve a una cosa sola: «Da pianificare» a zero non si disegna — un conto a
   * zero non è una notizia — ma è anche il posto dove si lascia una riga per
   * toglierle il giorno. Mentre una riga è in mano ricompare, e appena si posa
   * se ne va. Gli eventi del trascinamento salgono dalle carte fin qui.
   */
  const [inMano, setInMano] = useState(false)
  const contenitore = useRef<HTMLElement>(null)
  const [colonne, setColonne] = useState(3)
  useEffect(() => {
    const el = contenitore.current
    if (!el) return
    // 36 sono i due lati dell'imbottitura della scheda: chi la cambia cambi qui
    const misura = () => setColonne(quantiGiorni(el.clientWidth - 36))
    misura()
    const observer = new ResizeObserver(misura)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const locale = lingua === 'it' ? 'it-IT' : 'en-US'
  const giorni = Array.from({ length: 7 }, (_, i) => spostaGiorno(inizioSettimana(giorno), i))
  const nonPianificati = compiti.filter(c => !giornoCompito(c, oggi))
  const arretrati = compiti.filter(c => { const g = giornoCompito(c, oggi); return g && g < oggi })
  const visibili = giorniVisibili(giorno, colonne)
  /**
   * Le righe di un giorno — e oggi ha anche quelle che doveva già avere.
   *
   * Le arretrate stavano in un riquadro loro, «Da recuperare», sopra le
   * colonne: una riga sola si prendeva una fascia intera, e soprattutto
   * viveva fuori dalla giornata, come un promemoria di qualcosa che non è
   * di oggi. Ma è di oggi: una cosa in ritardo la fai adesso o non la fai.
   * «The scheduled overdue should put them in today's date.» Quindi entrano
   * nella colonna di oggi, prime della fila, e si riconoscono dal colore e
   * dalla data che portano scritta accanto.
   */
  const delGiorno = (g: string) => {
    const suoi = compiti.filter(c => giornoCompito(c, oggi) === g)
    return g === oggi ? [...arretrati, ...suoi] : suoi
  }
  /** La data in cui scadeva, da mettere sulla riga; niente se non è in ritardo. */
  const scadeva = (c: Compito) => {
    const g = giornoCompito(c, oggi)
    return g && g < oggi ? dataLocale(g).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : undefined
  }
  const nome = (g: string) => g === oggi ? t('Oggi') : g === spostaGiorno(oggi, 1) ? t('Domani')
    : g === spostaGiorno(oggi, 2) ? t('Dopodomani') : dataLocale(g).toLocaleDateString(locale, { weekday: 'long' })
  const perEsteso = (g: string) => dataLocale(g).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
  const lascia = (e: React.DragEvent, data: string | null) => {
    e.preventDefault(); setSopra(null); setInMano(false)
    const id = e.dataTransfer.getData('text/plain')
    if (compiti.some(c => c.id === id)) pianifica(id, data)
  }
  /**
   * Scrivere in un giorno: la sua colonna si apre, e il fuoco ci va.
   *
   * Il giorno si sceglie solo se la sua colonna non è già sullo schermo.
   * Sceglierlo sempre faceva scorrere le tre colonne sotto la mano di chi
   * aveva appena premuto un «+» che vedeva: la riga che stava per scrivere
   * finiva in un'altra posizione, e la si cercava.
   */
  const componi = (g: string) => {
    if (!visibili.includes(g)) scegli(g)
    setSenzaData(false)
    setScrivendo(g)
  }
  const trascina = (e: React.DragEvent, g: string) => { e.preventDefault(); setSopra(g) }

  return <section ref={contenitore} className="task-calendar" aria-label={t('Calendario')}
    onDragStart={() => setInMano(true)} onDragEnd={() => setInMano(false)}>
    <div className="task-calendar-toolbar">
      <div className="task-calendar-month">{dataLocale(giorno).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</div>
      <div className="task-calendar-nav">
        <button type="button" className="task-calendar-espandi" onClick={espandi}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 3H3v6M15 21h6v-6M21 9V3h-6M3 15v6h6" />
          </svg>
          {t('Espandi')}
        </button>
        <button type="button" className="task-calendar-today" onClick={() => { scegli(oggi); setSenzaData(false) }}>{t('Oggi')}</button>
        <button type="button" aria-label={t('Settimana precedente')} onClick={() => scegli(spostaGiorno(giorno, -7))}>‹</button>
        <button type="button" aria-label={t('Settimana successiva')} onClick={() => scegli(spostaGiorno(giorno, 7))}>›</button>
      </div>
    </div>
    <div className="task-calendar-week" role="group" aria-label={t('Scegli un giorno')}>
      {giorni.map(g => {
        const quanti = delGiorno(g).length
        const classi = ['task-calendar-day', g === giorno && !senzaData && 'selected',
          g === oggi && 'today', sopra === g && 'drop-target'].filter(Boolean).join(' ')
        /*
         * Il giorno, e basta.
         *
         * C'era anche un «+» piccolo in ogni casella: «the + on the day of the
         * week is useless, so remove that». Si aggiunge dal «+» largo in fondo
         * alla colonna del giorno, che apre la scheda con ora, priorità e
         * progetto; premere un giorno qui lo porta fra le colonne.
         */
        return <div key={g} className="task-calendar-day-cell">
          <button type="button" className={classi}
            aria-pressed={g === giorno && !senzaData} aria-current={g === oggi ? 'date' : undefined}
            aria-label={`${perEsteso(g)}, ${quanti} ${t('attività')}`}
            onClick={() => { scegli(g); setSenzaData(false) }}
            onDragOver={e => trascina(e, g)} onDragLeave={() => setSopra(null)} onDrop={e => lascia(e, g)}>
            <span className="task-calendar-weekday">{dataLocale(g).toLocaleDateString(locale, { weekday: 'short' })}</span>
            <span className="task-calendar-number">{dataLocale(g).getDate()}</span>
            <span className="task-calendar-dots" aria-hidden="true">{Array.from({ length: Math.min(quanti, 3) }, (_, i) => <i key={i} />)}</span>
          </button>
        </div>
      })}
    </div>
    <div className="task-calendar-agenda-header">
      <div><h2>{senzaData ? t('Da pianificare') : t('In programma')}</h2></div>
      {(nonPianificati.length > 0 || senzaData || inMano) && (
        <button type="button" className={`task-unscheduled ${senzaData ? 'selected' : ''}`} aria-pressed={senzaData}
          onClick={() => setSenzaData(v => !v)} onDragOver={e => e.preventDefault()} onDrop={e => lascia(e, null)}>
          {t('Da pianificare')}<span>{nonPianificati.length}</span>
        </button>
      )}
    </div>
    {senzaData ? <>
      <ul className="task-unscheduled-grid">{nonPianificati.map(c => renderRiga(c))}</ul>
      {!nonPianificati.length && <div className="task-calendar-empty"><span aria-hidden="true">✓</span><p>{t('Tutto pianificato.')}</p></div>}
    </> : <div className="task-calendar-columns" style={{ gridTemplateColumns: `repeat(${colonne}, minmax(0, 1fr))` }}>
      {visibili.map(g => {
        const righe = delGiorno(g)
        const classi = ['task-day-column', g === oggi && 'today', g === giorno && 'selected', sopra === g && 'drop-target'].filter(Boolean).join(' ')
        return <section key={g} className={classi} aria-label={perEsteso(g)}
          onDragOver={e => trascina(e, g)} onDragLeave={() => setSopra(null)} onDrop={e => lascia(e, g)}>
          <header><div><h3>{nome(g)}</h3><span>{dataLocale(g).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</span></div>
            {righe.length > 0 && <span className="task-day-count">{righe.length}</span>}</header>
          <ul className="task-agenda-list">{righe.map(c => renderRiga(c, scadeva(c)))}</ul>
          {scrivendo === g
            ? <Scrittura giorno={g} nome={nome(g)} scrivi={riga => aggiungi(riga, g)} chiudi={() => setScrivendo(null)} />
            : <button type="button" className="task-day-add" aria-label={`${t('Aggiungi per')} ${perEsteso(g)}`}
              onClick={() => componi(g)}><span aria-hidden="true">+</span>{t('Aggiungi')}</button>}
        </section>
      })}
    </div>}
  </section>
}

/** Quello che la scheda del «+» consegna: la riga, e quello che le si è detto attorno. */
export type RigaNuova = { testo: string; ora: string | null; priorita: Priorita | null; progetto: string | null }

const LIVELLI: { id: Priorita | null; nome: string }[] = [
  { id: 'bassa', nome: 'Bassa' }, { id: null, nome: 'Normale' }, { id: 'alta', nome: 'Alta' }
]

/**
 * La scheda che si apre col «+» del giorno.
 *
 * «When I click the + on the little day, I'm not supposed to just write the
 * thing for tomorrow. I should also be able to set a time, a priority, and
 * even a project.» Era una casella sola, di una riga: il testo lungo scorreva
 * a destra e spariva. Adesso il testo va a capo e la casella cresce con lui,
 * e sotto ci sono le tre cose che si possono dire di una riga — tutte già al
 * valore che vale quasi sempre (senza ora, normale, nessun progetto), così
 * chi vuole solo scrivere scrive e preme Invio.
 *
 * Dopo Invio la scheda resta aperta e vuota per la riga dopo, con lo stesso
 * progetto: chi ne aggiunge due a un giorno di solito le aggiunge allo stesso
 * lavoro. Esc chiude; uscire dalla scheda la chiude se non c'è niente scritto.
 */
function Scrittura({ giorno, nome, scrivi, chiudi }: {
  giorno: string; nome: string; scrivi: (riga: RigaNuova) => void; chiudi: () => void
}) {
  const scheda = useRef<HTMLFormElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const [testo, setTesto] = useState('')
  const [ora, setOra] = useState('')
  const [priorita, setPriorita] = useState<Priorita | null>(null)
  const [progetto, setProgetto] = useState('')
  const [progetti, setProgetti] = useState<Progetto[]>([])
  useEffect(() => { campo.current?.focus() }, [giorno])
  useEffect(() => {
    let vivo = true
    api.progetti().then(r => { if (vivo) setProgetti(r.progetti.filter(p => p.stato !== 'chiuso')) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  // la casella cresce con il testo: va a capo invece di scorrere a destra
  useEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [testo])
  const manda = () => {
    const pulito = testo.replace(/\s+/g, ' ').trim()
    if (!pulito) return chiudi()
    scrivi({ testo: pulito, ora: ora || null, priorita, progetto: progetto || null })
    setTesto(''); setOra(''); setPriorita(null)
    campo.current?.focus()
  }
  return (
    <form ref={scheda} className="task-new" aria-label={`${t('Aggiungi per')} ${nome}`}
      onSubmit={e => { e.preventDefault(); manda() }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); chiudi() } }}
      onBlur={e => {
        // si chiude solo se il fuoco esce dalla scheda, e solo se è vuota
        if (scheda.current?.contains(e.relatedTarget as Node | null)) return
        if (!testo.trim()) chiudi()
      }}>
      <textarea ref={campo} rows={1} value={testo} onChange={e => setTesto(e.target.value)}
        placeholder={`${t('Aggiungi per')} ${nome.toLocaleLowerCase()}`}
        aria-label={t('Cosa c’è da fare')}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); manda() } }} />
      <div className="task-new-campi">
        <label className="task-new-campo">
          <span>{t('Ora')}</span>
          <input type="time" value={ora} onChange={e => setOra(e.target.value)} />
        </label>
        <div className="task-new-campo">
          <span id={`priorita-${giorno}`}>{t('Priorità')}</span>
          <div className="task-new-livelli" role="radiogroup" aria-labelledby={`priorita-${giorno}`}>
            {LIVELLI.map(l => (
              <button key={l.nome} type="button" role="radio" aria-checked={priorita === l.id}
                className={l.id ? `livello-${l.id}` : undefined} onClick={() => setPriorita(l.id)}>{t(l.nome)}</button>
            ))}
          </div>
        </div>
        {progetti.length > 0 && <label className="task-new-campo">
          <span>{t('Progetto')}</span>
          <select value={progetto} onChange={e => setProgetto(e.target.value)}>
            <option value="">{t('Nessun progetto')}</option>
            {progetti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>}
      </div>
      <div className="task-new-gesti">
        <button type="button" className="task-new-annulla" onClick={chiudi}>{t('Annulla')}</button>
        <button type="submit" className="task-new-aggiungi" disabled={!testo.trim()}>{t('Aggiungi')}</button>
      </div>
    </form>
  )
}
