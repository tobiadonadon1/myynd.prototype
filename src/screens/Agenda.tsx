/*
 * La settimana, aperta su tutta l'applicazione.
 *
 * Non è una seconda vista del calendario delle cose da fare: è la stessa
 * settimana, guardata da vicino. Da «Da fare» si preme «Espandi» e la
 * settimana prende lo schermo — gli attrezzi a sinistra, i sette giorni a
 * destra, la fascia del tutto il giorno sopra la griglia delle ore — e con
 * «Riduci» o con Esc si torna esattamente dov'era.
 *
 * Dentro ci stanno due cose che in questa app vivevano separate: gli eventi
 * dell'agenda del Mac e le righe della lista. Una riga con un giorno è una
 * targhetta nella fascia del tutto il giorno, si trascina da un giorno
 * all'altro come un evento, e la si può creare da qui senza cambiare
 * schermata. È il pezzo che rende questa una sola agenda invece che due.
 *
 * Il ponte con il server è in `api.ts` e segue il contratto di `/api/agenda`.
 * Finché quel contratto non esiste davvero, c'è l'agenda finta qui sotto: si
 * accende scrivendo `myynd.agenda.finta` nel localStorage e serve soltanto a
 * guardare questa schermata con qualcosa dentro.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type Agenda as DatiAgenda, type BozzaEvento, type CalendarioAgenda, type Compito, type EventoAgenda } from '../api'
import { desktop } from '../desktop'
import { t } from '../lingua'
import {
  ORE_IN_VISTA, affianca, colonneSettimana, dataLocale, giornoCompito, inizioSettimana,
  mezzanotte, miniMese, posaAdesso, posaEvento, righeOre, spostaGiorno, spostaMese
} from '../oggi/giorni'
import './agenda.css'

/* ————— quello che la finestra si ricorda ————— */

const CHIAVE_SPENTI = 'myynd.agenda.spenti'
const CHIAVE_COMPITI = 'myynd.agenda.compiti'

/**
 * L'agenda finta, per guardare questa schermata prima che il server la sappia dare.
 *
 * Si accende solo scrivendo `myynd.agenda.finta` = `1` nel localStorage, e si
 * spegne togliendo quella chiave: non c'è nessun altro modo di accenderla, e
 * chi apre l'app non la incontra mai. Serve alle prove con lo schermo, dove
 * una settimana vuota non direbbe se la griglia sta in piedi.
 */
const CHIAVE_FINTA = 'myynd.agenda.finta'

function letta(chiave: string): string | null {
  try { return localStorage.getItem(chiave) } catch { return null }
}
function scritta(chiave: string, valore: string) {
  try { localStorage.setItem(chiave, valore) } catch { /* niente memoria: si riparte dal predefinito */ }
}

const conFinta = () => letta(CHIAVE_FINTA) === '1'

function spentiSalvati(): Set<string> {
  const g = letta(CHIAVE_SPENTI)
  if (!g) return new Set()
  try {
    const v: unknown = JSON.parse(g)
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch { return new Set() }
}

/* ————— l'agenda finta ————— */

const CALENDARI_FINTI: CalendarioAgenda[] = [
  { id: 'personale', nome: 'Personale', colore: '#C4623B', scrivibile: true, fonte: 'apple' },
  { id: 'lavoro', nome: 'Lavoro', colore: '#5F7A8A', scrivibile: true, fonte: 'apple' },
  { id: 'studio', nome: 'Studio Rossi', colore: '#8E6E53', scrivibile: false, fonte: 'ical' }
]

/** I semi: giorno della settimana, minuto d'inizio, durata, e di chi è. */
const SEMI = [
  { g: 0, da: 9 * 60, per: 30, titolo: 'Punto del lunedì', cal: 'lavoro' },
  { g: 0, da: 11 * 60, per: 90, titolo: 'Preventivo Rossi', cal: 'lavoro' },
  { g: 0, da: 19 * 60, per: 60, titolo: 'Palestra', cal: 'personale' },
  { g: 1, da: 10 * 60, per: 60, titolo: 'Call fornitore', cal: 'lavoro' },
  { g: 1, da: 10 * 60 + 30, per: 60, titolo: 'Consegna sito', cal: 'studio' },
  { g: 1, da: 13 * 60, per: 60, titolo: 'Pranzo con Luca', cal: 'personale' },
  { g: 2, da: 8 * 60 + 30, per: 45, titolo: 'Revisione bozze', cal: 'lavoro' },
  { g: 2, da: 15 * 60, per: 120, titolo: 'Cantiere Marghera', cal: 'studio' },
  { g: 3, da: 9 * 60, per: 60, titolo: 'Punto con Marta', cal: 'lavoro' },
  { g: 3, da: 9 * 60 + 30, per: 60, titolo: 'Fatture', cal: 'personale' },
  { g: 3, da: 10 * 60, per: 45, titolo: 'Colloquio', cal: 'lavoro' },
  { g: 3, da: 17 * 60, per: 90, titolo: 'Corso di tedesco', cal: 'personale' },
  { g: 4, da: 11 * 60, per: 60, titolo: 'Firma contratto', cal: 'studio' },
  { g: 4, da: 14 * 60 + 30, per: 45, titolo: 'Sopralluogo', cal: 'lavoro' },
  { g: 5, da: 10 * 60, per: 180, titolo: 'Mercato', cal: 'personale' },
  { g: 6, da: 18 * 60, per: 120, titolo: 'Cena da Marta', cal: 'personale' },
  { g: 2, da: 0, per: 24 * 60, titolo: 'Fiera di Verona', cal: 'lavoro', tutto: true }
]

const fintiSeminati = new Set<string>()
let finti: EventoAgenda[] = []

const istante = (giorno: string, minuti: number) =>
  new Date(mezzanotte(giorno).getTime() + minuti * 60000).toISOString()

function seminaFinta(lunedi: string) {
  if (fintiSeminati.has(lunedi)) return
  fintiSeminati.add(lunedi)
  for (const [i, s] of SEMI.entries()) {
    const g = spostaGiorno(lunedi, s.g)
    finti.push({
      id: `finto-${lunedi}-${i}`, calendario: s.cal, titolo: s.titolo,
      inizio: istante(g, s.da), fine: istante(g, s.da + s.per),
      tuttoIlGiorno: !!s.tutto, fonte: 'apple'
    })
  }
}

function fintaAgenda(lunedi: string, da: string, a: string): DatiAgenda {
  seminaFinta(lunedi)
  return {
    calendari: CALENDARI_FINTI,
    eventi: finti.filter(e => e.fine > da && e.inizio < a),
    scrivibile: true
  }
}

function fintaScrive(id: string | null, e: Partial<BozzaEvento>): void {
  if (!id) {
    finti.push({
      id: `finto-${Date.now()}`, calendario: e.calendario || CALENDARI_FINTI[0].id,
      titolo: e.titolo ?? '', inizio: e.inizio ?? '', fine: e.fine ?? '',
      tuttoIlGiorno: !!e.tuttoIlGiorno, fonte: 'apple'
    })
    return
  }
  finti = finti.map(v => v.id === id ? { ...v, ...e, tuttoIlGiorno: e.tuttoIlGiorno ?? v.tuttoIlGiorno } : v)
}

/* ————— il pezzo di carta che scrive un evento ————— */

type Bozza = {
  id: string | null
  titolo: string
  giorno: string
  inizio: string
  fine: string
  tuttoIlGiorno: boolean
  calendario: string
  /** Invece di un evento: una riga in lista, su quel giorno. */
  compito: boolean
  x: number
  y: number
  errore: string | null
  salvando: boolean
}

const dueCifre = (n: number) => String(n).padStart(2, '0')
const oreDaMinuti = (m: number) => `${dueCifre(Math.floor(m / 60) % 24)}:${dueCifre(Math.round(m) % 60)}`
function minutiDaOre(hhmm: string): number {
  const [o, m] = hhmm.split(':').map(Number)
  return (Number.isFinite(o) ? o : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/** Dove sta la carta: accanto al dito, ma dentro la finestra. */
function inFinestra(x: number, y: number): { x: number; y: number } {
  const larga = typeof window === 'undefined' ? 1200 : window.innerWidth
  const alta = typeof window === 'undefined' ? 800 : window.innerHeight
  return {
    x: Math.max(12, Math.min(x, larga - 318)),
    y: Math.max(12, Math.min(y, alta - 352))
  }
}

const Spunta = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

const Freccia = ({ su }: { su: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ transform: su ? 'rotate(180deg)' : undefined }}>
    <path d="M7 10l5 5 5-5" />
  </svg>
)

/**
 * Quante targhette stanno nella fascia prima del «+N».
 *
 * Senza un tetto un venerdì con otto cose faceva una fascia alta mezza
 * schermata, e quello che non ci stava restava tagliato a metà dentro il
 * riquadro: la cosa che in quest'app non deve succedere mai. Tre e un conto,
 * e la fascia si apre tutta se serve.
 */
const IN_FASCIA = 3

/**
 * La striscia in cima, dentro l'app sul Mac.
 *
 * Ventiquattro pixel, gli stessi che `App.tsx` lascia alle due colonne: la
 * finestra non ha barra del titolo ma i tre semafori ci sono, in alto a
 * sinistra, e sotto di loro non va messo niente. Da qui esce come `--striscia`
 * e la cornice della schermata se la somma al proprio margine.
 */
const striscia = () => (desktop()?.piattaforma === 'darwin' ? 24 : 0)

/**
 * Dove si dà il permesso al Calendario.
 *
 * È la stessa riga di `server/agenda-apple.ts`, e il dizionario la conosce:
 * sta anche qui perché la colonna la sappia dire da sé quando il guaio arriva
 * senza — «non ha risposto» da solo non dice a nessuno cosa fare.
 */
const PERMESSO = 'Per l’agenda serve il permesso al Calendario: Impostazioni di Sistema › Privacy e sicurezza › Calendari › Myynd.'

/* ————— la schermata ————— */

export function Agenda({ compiti, oggi, giorno, scegli, lingua, pianifica, nuovoCompito, chiudi }: {
  compiti: Compito[]
  /** Il giorno civile di adesso: serve al bollo di rame e alla riga dell'ora. */
  oggi: string
  /** Il giorno scelto: lo stesso che la barra di «Da fare» usa per scrivere. */
  giorno: string
  scegli: (g: string) => void
  lingua: string
  pianifica: (id: string, giorno: string | null) => void
  nuovoCompito: (testo: string, giorno: string) => void
  chiudi: () => void
}) {
  const locale = lingua === 'it' ? 'it-IT' : 'en-GB'
  const lunedi = inizioSettimana(giorno)
  const settimana = useMemo(() => colonneSettimana(giorno), [giorno])
  const da = useMemo(() => mezzanotte(lunedi).toISOString(), [lunedi])
  const a = useMemo(() => mezzanotte(spostaGiorno(lunedi, 7)).toISOString(), [lunedi])

  const [dati, setDati] = useState<DatiAgenda | null>(null)
  const [guasto, setGuasto] = useState<string | null>(null)
  const [spenti, setSpenti] = useState<Set<string>>(spentiSalvati)
  const [conCompiti, setConCompiti] = useState(() => letta(CHIAVE_COMPITI) !== '0')
  const [bozza, setBozza] = useState<Bozza | null>(null)
  /** Su quale casella sta passando quello che si trascina. */
  const [bersaglio, setBersaglio] = useState<string | null>(null)
  /** La fascia del tutto il giorno, aperta su tutto quello che c'è. */
  const [fasciaAperta, setFasciaAperta] = useState(false)
  const [mese, setMese] = useState(giorno)
  const [adesso, setAdesso] = useState(() => new Date())
  const griglia = useRef<HTMLDivElement>(null)
  /** Dove si teneva il blocco quando è partito il trascinamento. */
  const presa = useRef<{ id: string; scarto: number; durata: number } | null>(null)

  const carica = useCallback(async () => {
    if (conFinta()) { setDati(fintaAgenda(lunedi, da, a)); return }
    try {
      setDati(await api.agenda(da, a))
      setGuasto(null)
    } catch (e) {
      setDati(null)
      setGuasto(e instanceof Error ? e.message : String(e))
    }
  }, [lunedi, da, a])

  useEffect(() => { void carica() }, [carica])

  // finché la settimana è aperta prende lei tutta la finestra: quello che sta
  // sotto — la mascotte, la porta della chat — si toglie di mezzo e torna alla
  // chiusura. La regola che le nasconde sta in `agenda.css`
  useEffect(() => {
    document.body.classList.add('agenda-aperta')
    return () => document.body.classList.remove('agenda-aperta')
  }, [])
  useEffect(() => { setMese(m => m.slice(0, 7) === giorno.slice(0, 7) ? m : giorno) }, [giorno])
  useEffect(() => {
    const filo = window.setInterval(() => setAdesso(new Date()), 60_000)
    return () => window.clearInterval(filo)
  }, [])

  // la griglia si apre sulla mattina: le ore piccole ci sono, ma si vanno a cercare
  useLayoutEffect(() => {
    const el = griglia.current
    if (el) el.scrollTop = (ORE_IN_VISTA.da / 24) * el.scrollHeight
  }, [])

  // Esc chiude: prima la carta, e solo dopo la settimana. Un solo tasto per
  // due passi indietro, che è come si aspetta di funzionare
  useEffect(() => {
    const sulTasto = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (bozza) setBozza(null)
      else chiudi()
    }
    window.addEventListener('keydown', sulTasto, true)
    return () => window.removeEventListener('keydown', sulTasto, true)
  }, [bozza, chiudi])

  const calendari = dati?.calendari ?? []
  const colori = useMemo(() => new Map(calendari.map(c => [c.id, c.colore])), [calendari])
  const scrivibili = calendari.filter(c => c.scrivibile)
  /**
   * L'agenda del Mac non c'è: la frase del server, o quella della richiesta
   * andata storta. Le attività restano accese sopra, quindi la colonna non
   * resta mai vuota e la settimana si guarda lo stesso.
   */
  const fonteGiu = dati?.avviso ?? guasto
  /** Il permesso si spiega dove si può dare, e solo se non lo dice già la frase. */
  const conPermesso = !!fonteGiu && fonteGiu !== PERMESSO && desktop()?.piattaforma === 'darwin'
  const eventi = useMemo(
    () => (dati?.eventi ?? []).filter(e => !spenti.has(e.calendario)),
    [dati, spenti])

  const accendi = (id: string) => {
    setSpenti(p => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id); else n.add(id)
      scritta(CHIAVE_SPENTI, JSON.stringify([...n]))
      return n
    })
  }
  const accendiCompiti = () => {
    setConCompiti(v => { scritta(CHIAVE_COMPITI, v ? '0' : '1'); return !v })
  }

  const delGiorno = (g: string) => conCompiti ? compiti.filter(c => giornoCompito(c, oggi) === g) : []
  const tuttoIlGiorno = (g: string) => eventi.filter(e =>
    e.tuttoIlGiorno && e.inizio < istante(g, 24 * 60) && e.fine > istante(g, 0))
  const aOre = (g: string) => affianca(eventi.filter(e => !e.tuttoIlGiorno && posaEvento(g, e.inizio, e.fine)))
  /** Quante targhette la fascia sta tenendo fuori: zero, e non c'è niente da aprire. */
  const nascoste = settimana.reduce((n, g) =>
    n + Math.max(0, tuttoIlGiorno(g).length + delGiorno(g).length - IN_FASCIA), 0)

  /* — scrivere — */

  const apriNuovo = (g: string, minuti: number, x: number, y: number) => {
    const inizio = Math.max(0, Math.min(minuti, 23 * 60))
    const dove = inFinestra(x, y)
    setBozza({
      id: null, titolo: '', giorno: g,
      inizio: oreDaMinuti(inizio), fine: oreDaMinuti(inizio + 60),
      tuttoIlGiorno: false, calendario: scrivibili[0]?.id ?? '',
      // senza un calendario in cui scrivere la carta nasce sull'altra strada —
      // una riga in lista — invece di promettere un evento e poi non farlo
      compito: !scrivibili.length, x: dove.x, y: dove.y, errore: null, salvando: false
    })
  }

  const apriEvento = (e: EventoAgenda, x: number, y: number) => {
    const g = new Date(e.inizio)
    const gg = `${g.getFullYear()}-${dueCifre(g.getMonth() + 1)}-${dueCifre(g.getDate())}`
    const dove = inFinestra(x, y)
    setBozza({
      id: e.id, titolo: e.titolo, giorno: gg,
      inizio: oreDaMinuti(g.getHours() * 60 + g.getMinutes()),
      fine: oreDaMinuti(new Date(e.fine).getHours() * 60 + new Date(e.fine).getMinutes()),
      tuttoIlGiorno: e.tuttoIlGiorno, calendario: e.calendario,
      compito: false, x: dove.x, y: dove.y, errore: null, salvando: false
    })
  }

  const salva = async () => {
    if (!bozza || bozza.salvando) return
    const titolo = bozza.titolo.trim()
    if (!titolo) return
    if (bozza.compito) {
      nuovoCompito(titolo, bozza.giorno)
      scegli(bozza.giorno)
      setBozza(null)
      return
    }
    const corpo: BozzaEvento = bozza.tuttoIlGiorno
      ? { titolo, inizio: istante(bozza.giorno, 0), fine: istante(bozza.giorno, 24 * 60), tuttoIlGiorno: true, calendario: bozza.calendario }
      : {
        titolo, tuttoIlGiorno: false, calendario: bozza.calendario,
        inizio: istante(bozza.giorno, minutiDaOre(bozza.inizio)),
        fine: istante(bozza.giorno, Math.max(minutiDaOre(bozza.fine), minutiDaOre(bozza.inizio) + 15))
      }
    setBozza(b => b && { ...b, salvando: true, errore: null })
    try {
      if (conFinta()) fintaScrive(bozza.id, corpo)
      else if (bozza.id) await api.cambiaEvento(bozza.id, corpo)
      else await api.creaEvento(corpo)
      setBozza(null)
      await carica()
    } catch (e) {
      setBozza(b => b && { ...b, salvando: false, errore: e instanceof Error ? e.message : String(e) })
    }
  }

  const butta = async () => {
    if (!bozza?.id) return
    setBozza(b => b && { ...b, salvando: true, errore: null })
    try {
      if (conFinta()) finti = finti.filter(v => v.id !== bozza.id)
      else await api.eliminaEvento(bozza.id)
      setBozza(null)
      await carica()
    } catch (e) {
      setBozza(b => b && { ...b, salvando: false, errore: e instanceof Error ? e.message : String(e) })
    }
  }

  /** Sposta un evento: stessa durata, altro momento. */
  const sposta = async (id: string, inizio: string, fine: string) => {
    try {
      if (conFinta()) fintaScrive(id, { inizio, fine })
      else await api.cambiaEvento(id, { inizio, fine })
      await carica()
    } catch (e) { setGuasto(e instanceof Error ? e.message : String(e)) }
  }

  /* — trascinare — */

  const prendi = (e: React.DragEvent, cosa: string, durata = 0) => {
    e.dataTransfer.setData('text/plain', cosa)
    e.dataTransfer.effectAllowed = 'move'
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (cosa.startsWith('evento:')) presa.current = { id: cosa.slice(7), scarto: e.clientY - r.top, durata }
  }

  const lasciaSuOre = (e: React.DragEvent, g: string) => {
    e.preventDefault()
    setBersaglio(null)
    const cosa = e.dataTransfer.getData('text/plain')
    if (cosa.startsWith('compito:')) { pianifica(cosa.slice(8), g); return }
    if (!cosa.startsWith('evento:')) return
    const id = cosa.slice(7)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const p = presa.current?.id === id ? presa.current : null
    const grezzi = ((e.clientY - r.top - (p?.scarto ?? 0)) / r.height) * 1440
    const durata = p?.durata || 60
    const minuti = Math.max(0, Math.min(Math.round(grezzi / 15) * 15, 1440 - durata))
    void sposta(id, istante(g, minuti), istante(g, minuti + durata))
  }

  const lasciaSuTutto = (e: React.DragEvent, g: string) => {
    e.preventDefault()
    setBersaglio(null)
    const cosa = e.dataTransfer.getData('text/plain')
    if (cosa.startsWith('compito:')) { pianifica(cosa.slice(8), g); return }
    if (cosa.startsWith('evento:')) void sposta(cosa.slice(7), istante(g, 0), istante(g, 24 * 60))
  }

  const passa = (e: React.DragEvent, dove: string) => { e.preventDefault(); setBersaglio(dove) }

  /* — il disegno — */

  const nomeCorto = (g: string) => dataLocale(g).toLocaleDateString(locale, { weekday: 'short' })
  const perEsteso = (g: string) => dataLocale(g).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
  const oraDi = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  const rail = (
    <aside className="agenda-rail">
      <button type="button" className="agenda-nuovo"
        onClick={e => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const ora = giorno === oggi ? adesso.getHours() + 1 : 9
          apriNuovo(giorno, ora * 60, r.left, r.bottom + 8)
        }}>
        <span aria-hidden="true">+</span><span>{t('Nuovo evento')}</span>
      </button>

      <div>
        <div className="agenda-mese-testa">
          <span>{dataLocale(mese).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</span>
          <button type="button" aria-label={t('Mese precedente')} onClick={() => setMese(m => spostaMese(m, -1))}>‹</button>
          <button type="button" aria-label={t('Mese successivo')} onClick={() => setMese(m => spostaMese(m, 1))}>›</button>
        </div>
        <div className="agenda-mese-iniziali" aria-hidden="true">
          {settimana.map(g => <span key={g}>{dataLocale(g).toLocaleDateString(locale, { weekday: 'narrow' })}</span>)}
        </div>
        <div className="agenda-mese-griglia">
          {miniMese(mese).map((riga, i) => (
            <div className="agenda-mese-riga" key={i}>
              {riga.map(g => {
                const classi = ['agenda-mese-cella', g.slice(0, 7) !== mese.slice(0, 7) && 'fuori',
                  settimana.includes(g) && 'settimana', g === oggi && 'oggi'].filter(Boolean).join(' ')
                return <button type="button" key={g} className={classi} aria-label={perEsteso(g)}
                  aria-current={g === oggi ? 'date' : undefined}
                  onClick={() => { scegli(g); setMese(g) }}>
                  {dataLocale(g).getDate()}
                  {compiti.some(c => giornoCompito(c, oggi) === g) && <i aria-hidden="true" />}
                </button>
              })}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3>{t('I miei calendari')}</h3>
        <div className="agenda-lista">
          {calendari.map(c => (
            <label key={c.id} className={`agenda-voce ${spenti.has(c.id) ? 'spenta' : ''}`} style={{ color: c.colore }}>
              <input type="checkbox" checked={!spenti.has(c.id)} onChange={() => accendi(c.id)} />
              <span className="agenda-casella"><Spunta /></span>
              <span style={{ color: spenti.has(c.id) ? undefined : 'rgba(34,39,31,.8)' }}>{c.nome}</span>
              {!c.scrivibile && <span className="agenda-sola">{t('Sola lettura')}</span>}
            </label>
          ))}
          <label className="agenda-voce" style={{ color: '#C4623B' }}>
            <input type="checkbox" checked={conCompiti} onChange={accendiCompiti} />
            <span className="agenda-casella"><Spunta /></span>
            <span style={{ color: 'rgba(34,39,31,.8)' }}>{t('Le tue attività')}</span>
          </label>
        </div>

        {/* la fonte che manca si dice qui, sotto i calendari che ci sono */}
        {fonteGiu && (
          <p className="agenda-fonte">
            <b>{t('Agenda del Mac')}</b>
            {t(fonteGiu)}
            {conPermesso && ` ${t(PERMESSO)}`}
          </p>
        )}
      </div>
    </aside>
  )

  const carta = bozza && (
    <div className="agenda-carta" style={{ left: bozza.x, top: bozza.y }} role="dialog"
      aria-label={bozza.id ? t('Modifica evento') : t('Nuovo evento')}>
      <input type="text" value={bozza.titolo} autoFocus placeholder={t('Titolo')}
        onChange={e => setBozza(b => b && { ...b, titolo: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') void salva() }} />

      <input type="date" className="agenda-data" value={bozza.giorno} aria-label={t('Data')}
        onChange={e => setBozza(b => b && { ...b, giorno: e.target.value || b.giorno })} />
      {!bozza.tuttoIlGiorno && (
        <div className="agenda-quando">
          <input type="time" value={bozza.inizio} aria-label={t('Inizio')}
            onChange={e => setBozza(b => b && { ...b, inizio: e.target.value })} />
          <span className="agenda-a" aria-hidden="true">→</span>
          <input type="time" value={bozza.fine} aria-label={t('Fine')}
            onChange={e => setBozza(b => b && { ...b, fine: e.target.value })} />
        </div>
      )}

      <label className="agenda-interruttore">
        <input type="checkbox" checked={bozza.tuttoIlGiorno}
          onChange={e => setBozza(b => b && { ...b, tuttoIlGiorno: e.target.checked })} />
        <span className="agenda-binario"><i /></span>{t('Tutto il giorno')}
      </label>

      {!bozza.compito && scrivibili.length > 0 && (
        <select value={bozza.calendario} aria-label={t('Calendario')}
          onChange={e => setBozza(b => b && { ...b, calendario: e.target.value })}>
          {scrivibili.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      )}

      {!bozza.id && (
        <label className="agenda-interruttore">
          <input type="checkbox" checked={bozza.compito}
            onChange={e => setBozza(b => b && { ...b, compito: e.target.checked })} />
          <span className="agenda-binario"><i /></span>{t('Invece un’attività')}
        </label>
      )}

      {bozza.errore && <p className="agenda-nota" style={{ color: '#8E3F1F' }}>{t(bozza.errore)}</p>}

      <footer>
        {bozza.id && <button type="button" className="agenda-butta" onClick={() => void butta()}>{t('Elimina')}</button>}
        <span className="agenda-spinta" />
        <button type="button" onClick={() => setBozza(null)}>{t('Annulla')}</button>
        <button type="button" className="agenda-salva" disabled={!bozza.titolo.trim() || bozza.salvando}
          onClick={() => void salva()}>{t('Salva')}</button>
      </footer>
    </div>
  )

  return createPortal(
    <div className="agenda" role="dialog" aria-modal="true" aria-label={t('Agenda')}
      style={{ '--striscia': `${striscia()}px` } as React.CSSProperties}>
      {rail}

      <div className="agenda-corpo">
        <header className="agenda-testa">
          <h1>{dataLocale(giorno).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h1>
          <button type="button" aria-label={t('Settimana precedente')} onClick={() => scegli(spostaGiorno(giorno, -7))}>‹</button>
          <button type="button" aria-label={t('Settimana successiva')} onClick={() => scegli(spostaGiorno(giorno, 7))}>›</button>
          <button type="button" className="agenda-oggi" onClick={() => { scegli(oggi); setMese(oggi) }}>{t('Oggi')}</button>
          <span className="agenda-spinta" />
          <button type="button" className="agenda-riduci" onClick={chiudi}>{t('Riduci')}</button>
        </header>

        <div className="agenda-settimana">
          <div className="agenda-teste">
            <span />
            {settimana.map(g => (
              <button type="button" key={g} aria-label={perEsteso(g)} aria-current={g === oggi ? 'date' : undefined}
                className={`agenda-giorno-testa ${g === oggi ? 'oggi' : ''} ${g === giorno ? 'scelto' : ''}`}
                onClick={() => scegli(g)}>
                <span className="agenda-nome">{nomeCorto(g)}</span>
                <span className="agenda-numero">{dataLocale(g).getDate()}</span>
              </button>
            ))}
          </div>

          <div className={['agenda-tuttogiorno', fasciaAperta && 'aperta'].filter(Boolean).join(' ')}>
            <div className="agenda-fascia-nome">
              <span>{t('Tutto il giorno')}</span>
              {(fasciaAperta || nascoste > 0) && (
                <button type="button" onClick={() => setFasciaAperta(v => !v)}
                  aria-label={fasciaAperta ? t('Riduci') : t('Espandi')} aria-expanded={fasciaAperta}>
                  <Freccia su={fasciaAperta} />
                </button>
              )}
            </div>
            {settimana.map(g => {
              const dEventi = tuttoIlGiorno(g)
              const dCompiti = delGiorno(g)
              const tetto = fasciaAperta ? Infinity : IN_FASCIA
              const ev = dEventi.slice(0, tetto)
              const co = dCompiti.slice(0, Math.max(0, tetto - ev.length))
              const inPiu = dEventi.length + dCompiti.length - ev.length - co.length
              return (
                <div key={g} className={['agenda-fascia-cella', bersaglio === `tutto:${g}` && 'sopra'].filter(Boolean).join(' ')}
                  onDragOver={e => passa(e, `tutto:${g}`)} onDragLeave={() => setBersaglio(null)}
                  onDrop={e => lasciaSuTutto(e, g)}>
                  {ev.map(e => (
                    <button type="button" key={e.id} className="agenda-chip evento" title={e.titolo}
                      style={{ background: colori.get(e.calendario) ?? '#C4623B' }}
                      draggable onDragStart={ev2 => prendi(ev2, `evento:${e.id}`)}
                      onClick={ev2 => apriEvento(e, ev2.clientX, ev2.clientY)}>{e.titolo}</button>
                  ))}
                  {co.map(c => (
                    <span key={c.id} className="agenda-chip" title={c.testo} draggable
                      onDragStart={ev2 => prendi(ev2, `compito:${c.id}`)}>{c.testo}</span>
                  ))}
                  {inPiu > 0 && (
                    <button type="button" className="agenda-piu" onClick={() => setFasciaAperta(true)}>+{inPiu}</button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="agenda-griglia" ref={griglia}>
            <div className="agenda-ore" aria-hidden="true">
              {/* l'ora sta sotto la sua riga, non a cavallo: a cavallo la prima
                  che si vede dopo lo scorrimento è tagliata a metà */}
              {righeOre(0, 24).map(o => (
                <span key={o} style={{ top: `${(o / 24) * 100}%` }}>
                  {new Date(2000, 0, 1, o).toLocaleTimeString(locale, { hour: 'numeric' })}
                </span>
              ))}
            </div>
            {settimana.map(g => {
              const ora = posaAdesso(g, adesso)
              return (
                <div key={g} className={['agenda-colonna', g === oggi && 'oggi', bersaglio === `ore:${g}` && 'sopra'].filter(Boolean).join(' ')}
                  onDragOver={e => passa(e, `ore:${g}`)} onDragLeave={() => setBersaglio(null)}
                  onDrop={e => lasciaSuOre(e, g)}
                  onClick={e => {
                    if (e.target !== e.currentTarget) return
                    const r = e.currentTarget.getBoundingClientRect()
                    const minuti = Math.round((((e.clientY - r.top) / r.height) * 1440) / 30) * 30
                    apriNuovo(g, minuti, e.clientX + 14, e.clientY - 40)
                  }}>
                  {aOre(g).map(({ evento: e, colonna, colonne }) => {
                    const posa = posaEvento(g, e.inizio, e.fine)
                    if (!posa) return null
                    const durata = (new Date(e.fine).getTime() - new Date(e.inizio).getTime()) / 60000
                    const scrivibile = calendari.find(c => c.id === e.calendario)?.scrivibile
                    return (
                      <button type="button" key={e.id} className={`agenda-blocco ${scrivibile ? '' : 'sola'}`}
                        title={e.titolo}
                        style={{
                          top: `${posa.top * 100}%`, height: `${posa.altezza * 100}%`,
                          left: `${(colonna / colonne) * 96 + 2}%`, width: `${96 / colonne - 1.5}%`,
                          background: colori.get(e.calendario) ?? '#C4623B'
                        }}
                        draggable={!!scrivibile}
                        onDragStart={ev => prendi(ev, `evento:${e.id}`, durata)}
                        onClick={ev => { ev.stopPropagation(); apriEvento(e, ev.clientX, ev.clientY) }}>
                        <b>{e.titolo}</b>
                        {durata >= 45 && <em>{oraDi(e.inizio)}</em>}
                      </button>
                    )
                  })}
                  {ora !== null && <div className="agenda-adesso" style={{ top: `${ora * 100}%` }} aria-label={t('Adesso')} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {carta}
    </div>,
    document.body)
}
