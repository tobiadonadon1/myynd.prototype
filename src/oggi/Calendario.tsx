import { useEffect, useRef, useState } from 'react'
import { api, type Compito, type Progetto } from '../api'
import { frasi, t } from '../lingua'
import { Marchio } from '../components/Marchio'
import { IconCestino } from '../icons'
import { coloreProgetto } from '../colori-progetto'
import type { Lista } from './useCompiti'
import { dataLocale, giornoCompito, giornoLocale, secchioDelGiorno, spostaGiorno } from './giorni'
import { leggiRiga } from './scrivi-riga'
import { localeDelGiorno, statoRiga } from './bacheca'
import './calendario.css'
import './quaderno.css'

/**
 * Il calendario delle cose da fare, come un quaderno.
 *
 * «The to-do list is kind of uncomfortable to fill out. Do you know
 * TeuxDeux? This is a better view of a to-do list, and having it like this
 * allows me to really visualize what has to be done.» Erano tre colonne di
 * carte, e per scrivere una riga si premeva «+ Aggiungi» e si compilava una
 * scheda. Adesso ogni giorno è una pagina a righe: le cose da fare sono
 * righe, le righe vuote sotto sono dove si scrive, e si scrive e basta,
 * Invio, la riga dopo. L'ora, il progetto e la priorità si dicono scrivendo
 * («@10», «#Northwind», «!»: vedi `scrivi-riga.ts`), o dal dettaglio.
 *
 * Il sapore del calendario resta: il mese in testa, i giorni con la loro
 * data, le frecce, «Oggi», e «Espandi» che apre la settimana con le ore.
 * Quanti giorni vedere lo sceglie lui, come su TeuxDeux: 1, 3, 5 o 7; la
 * finestra stretta ne mostra quanti ci stanno.
 *
 * Una riga sta su una linea sola: se il testo è lungo mostra il titolo
 * corto che gli ha scritto il modello (`server/titolo-riga.ts`), e il testo
 * intero si legge aprendola. Chi aspetta chi non si scrive a parole: il
 * cerchio color rame dice «c'è qualcosa per te», il punto verde «ci lavora
 * Myynd». «"Waits for tomorrow's budget" … it's not clear what it means, and
 * they occupy too much space» (29 set 2026).
 */

export type QuantiGiorni = 1 | 3 | 5 | 7
const SCELTE: QuantiGiorni[] = [1, 3, 5, 7]
const CHIAVE_QUANTI = 'myynd.giorniQuaderno'
/** La colonna più stretta in cui una riga si legge ancora. */
const COLONNA_MIN = 190

function quantiSalvati(): QuantiGiorni {
  try {
    const n = Number(localStorage.getItem(CHIAVE_QUANTI))
    return (SCELTE as number[]).includes(n) ? n as QuantiGiorni : 5
  } catch { return 5 }
}

/** Le righe di un giorno: oggi ha anche quelle rimaste indietro, prime della fila. */
export function righeDelGiorno(compiti: Compito[], g: string, oggi: string): Compito[] {
  const suoi = compiti.filter(c => giornoCompito(c, oggi) === g)
  if (g !== oggi) return suoi
  const arretrati = compiti.filter(c => { const x = giornoCompito(c, oggi); return !!x && x < oggi })
  return [...arretrati, ...suoi]
}

/** Le righe chiuse in quel giorno: restano sulla pagina, barrate, come su un quaderno vero. */
export function fatteDelGiorno(chiusi: Compito[], g: string): Compito[] {
  return chiusi.filter(c => c.stato === 'fatto' && !!c.chiuso && localeDelGiorno(c.chiuso) === g)
}

type Apri = { apri: (c: Compito) => void; modifica: (c: Compito) => void }

export function Calendario({ l, oggi, inizio, setInizio, lingua, espandi, apri, modifica }: {
  l: Lista; oggi: string
  /** Il primo giorno che si vede: oggi, se lui non si è mosso. */
  inizio: string; setInizio: (g: string) => void
  lingua: string
  /** Apre la settimana con le ore, su tutta l'applicazione. */
  espandi: () => void
} & Apri) {
  const [quanti, setQuantiStato] = useState<QuantiGiorni>(quantiSalvati)
  const setQuanti = (n: QuantiGiorni) => { setQuantiStato(n); try { localStorage.setItem(CHIAVE_QUANTI, String(n)) } catch { /* senza memoria si riparte da cinque */ } }
  const contenitore = useRef<HTMLElement>(null)
  const [stanno, setStanno] = useState(5)
  useEffect(() => {
    const el = contenitore.current
    if (!el) return
    const misura = () => setStanno(Math.max(1, Math.floor((el.clientWidth - 24) / COLONNA_MIN)))
    misura()
    const o = new ResizeObserver(misura)
    o.observe(el)
    return () => o.disconnect()
  }, [])
  const progetti = useProgetti()
  const locale = lingua === 'it' ? 'it-IT' : 'en-US'
  const n = Math.min(quanti, stanno)
  const giorni = Array.from({ length: n }, (_, i) => spostaGiorno(inizio, i))
  const nonPianificati = l.compiti.filter(c => !giornoCompito(c, oggi))

  return (
    <section ref={contenitore} className="quaderno" aria-label={t('Calendario')}>
      <header className="quaderno-testa">
        <h2 className="quaderno-mese">{dataLocale(inizio).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h2>
        <div className="quaderno-comandi">
          <div className="quaderno-quanti" role="group" aria-label={t('Giorni da vedere')}>
            {SCELTE.map(x => <button key={x} type="button" aria-pressed={quanti === x} onClick={() => setQuanti(x)}
              title={frasi.giorniDaVedere(x)}>{x}</button>)}
          </div>
          <button type="button" className="quaderno-oggi" onClick={() => setInizio(oggi)} disabled={inizio === oggi}>{t('Oggi')}</button>
          <div className="quaderno-frecce">
            <button type="button" aria-label={t('Settimana precedente')} onClick={() => setInizio(spostaGiorno(inizio, -7))}>«</button>
            <button type="button" aria-label={t('Giorno precedente')} onClick={() => setInizio(spostaGiorno(inizio, -1))}>‹</button>
            <button type="button" aria-label={t('Giorno successivo')} onClick={() => setInizio(spostaGiorno(inizio, 1))}>›</button>
            <button type="button" aria-label={t('Settimana successiva')} onClick={() => setInizio(spostaGiorno(inizio, 7))}>»</button>
          </div>
          <button type="button" className="quaderno-espandi" onClick={espandi}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 3H3v6M15 21h6v-6M21 9V3h-6M3 15v6h6" />
            </svg>
            {t('Espandi')}
          </button>
        </div>
      </header>

      <div className="quaderno-giorni" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {giorni.map(g => (
          <Giorno key={g} l={l} g={g} oggi={oggi} locale={locale} progetti={progetti}
            righe={righeDelGiorno(l.compiti, g, oggi)} fatte={g <= oggi ? fatteDelGiorno(l.chiusi, g) : []}
            apri={apri} modifica={modifica} />
        ))}
      </div>

      <Pagina titolo={t('Da pianificare')} l={l} g={null} oggi={oggi} locale={locale} progetti={progetti}
        righe={nonPianificati} apri={apri} modifica={modifica} />
    </section>
  )
}

/** I progetti, per il pallino sulla riga e per leggere «#nome»: si chiedono una volta. */
function useProgetti(): Progetto[] {
  const [progetti, setProgetti] = useState<Progetto[]>([])
  useEffect(() => {
    let vivo = true
    api.progetti().then(r => { if (vivo) setProgetti(r.progetti) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  return progetti
}

/**
 * Un giorno: la data piccola sopra, il nome grande, e la pagina a righe.
 * Serve anche alla prima pagina, sulla destra, quando la finestra è larga.
 */
export function Giorno({ l, g, oggi, locale, progetti, righe, fatte, apri, modifica, compatto = false, minime }: {
  l: Lista; g: string; oggi: string; locale: string; progetti: Progetto[]
  righe: Compito[]; fatte: Compito[]
  /** Sulla prima pagina: meno righe vuote, e il nome del giorno più piccolo. */
  compatto?: boolean
  /** Quante righe almeno, contando quella dove si scrive. */
  minime?: number
} & Apri) {
  const nome = dataLocale(g).toLocaleDateString(locale, { weekday: 'long' })
  const data = dataLocale(g).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const classi = ['quaderno-giorno', g === oggi && 'oggi', g < oggi && 'passato', compatto && 'compatto'].filter(Boolean).join(' ')
  return (
    <section className={classi} aria-label={dataLocale(g).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}>
      <header>
        <span className="quaderno-data">{data}</span>
        <h3>{nome.charAt(0).toLocaleUpperCase() + nome.slice(1)}</h3>
      </header>
      <Righe l={l} g={g} oggi={oggi} locale={locale} progetti={progetti} righe={righe} fatte={fatte}
        minime={minime ?? (compatto ? 3 : 9)} apri={apri} modifica={modifica} />
    </section>
  )
}

/** Una pagina senza giorno: le cose da pianificare, sotto i giorni. */
function Pagina({ titolo, l, g, oggi, locale, progetti, righe, apri, modifica }: {
  titolo: string; l: Lista; g: null; oggi: string; locale: string; progetti: Progetto[]; righe: Compito[]
} & Apri) {
  return (
    <section className="quaderno-pagina" aria-label={titolo}>
      <header><h3>{titolo}</h3>{righe.length > 0 && <span>{righe.length}</span>}</header>
      <Righe l={l} g={g} oggi={oggi} locale={locale} progetti={progetti} righe={righe} fatte={[]} minime={3} apri={apri} modifica={modifica} colonne />
    </section>
  )
}

/**
 * Le righe di una pagina: quelle scritte, quelle chiuse oggi (barrate), la
 * riga dove si scrive, e le righe vuote fino al minimo. Si trascina una riga
 * da un giorno all'altro, o fra due righe per metterla lì.
 */
function Righe({ l, g, oggi, locale, progetti, righe, fatte, minime, apri, modifica, colonne = false }: {
  l: Lista; g: string | null; oggi: string; locale: string; progetti: Progetto[]
  righe: Compito[]; fatte: Compito[]; minime: number; colonne?: boolean
} & Apri) {
  const [sopra, setSopra] = useState<string | null>(null)
  const scrivi = useRef<HTMLInputElement>(null)
  const quando = g ? secchioDelGiorno(g, oggi) : 'poi'
  const vuote = Math.max(0, minime - righe.length - fatte.length - 1)

  const lascia = async (e: React.DragEvent, prima: string | null) => {
    e.preventDefault(); e.stopPropagation(); setSopra(null)
    const id = e.dataTransfer.getData('text/plain')
    const c = l.compiti.find(x => x.id === id)
    if (!c) return
    const suo = giornoCompito(c, oggi)
    // un altro giorno (o nessuno): prima il giorno, poi il posto
    if (suo !== g || (g === null && suo !== null)) {
      const ok = await l.cambia(id, { giorno: g, quando })
      if (!ok) return
    }
    const altre = righe.filter(x => x.id !== id)
    const i = prima ? altre.findIndex(x => x.id === prima) : -1
    const sotto = i >= 0 ? altre[i].id : null
    const su = i >= 0 ? (altre[i - 1]?.id ?? null) : (altre[altre.length - 1]?.id ?? null)
    if (su || sotto) void l.sposta(id, su, sotto, quando)
  }

  return (
    <ol className="quaderno-righe" data-colonne={colonne || undefined} data-sopra={sopra === '' || undefined}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (sopra === null) setSopra('') }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSopra(null) }}
      onDrop={e => { void lascia(e, null) }}>
      {righe.map(c => (
        <RigaQuaderno key={c.id} c={c} oggi={oggi} locale={locale} l={l}
          progetto={progetti.find(p => p.id === c.progetto) ?? null} progetti={progetti}
          sopra={sopra === c.id} suSopra={() => setSopra(c.id)} lascia={e => { void lascia(e, c.id) }}
          apri={apri} modifica={modifica} />
      ))}
      {fatte.map(c => (
        <li key={c.id} className="quaderno-riga fatta">
          <span className="quaderno-spunta fatta" aria-hidden="true">✓</span>
          <span className="quaderno-testo" title={c.titolo ? c.testo : undefined}><span className="quaderno-parole">{c.titolo || c.testo}</span></span>
          <button type="button" className="quaderno-riapri" onClick={() => void l.riapri(c.id)}>{t('Riaprila')}</button>
        </li>
      ))}
      <li className="quaderno-riga nuova">
        <NuovaRiga campo={scrivi} l={l} g={g} oggi={oggi} progetti={progetti} />
      </li>
      {Array.from({ length: vuote }, (_, i) => (
        <li key={`vuota-${i}`} className="quaderno-riga vuota" aria-hidden="true" onClick={() => scrivi.current?.focus()} />
      ))}
    </ol>
  )
}

/**
 * La riga dove si scrive: nessun bordo, nessun bottone. Invio la scrive
 * (con «!», «@ora», «#progetto» letti) e lascia il cursore lì per la
 * prossima; incollare più righe ne scrive una per riga.
 */
function NuovaRiga({ campo, l, g, oggi, progetti }: {
  campo: React.RefObject<HTMLInputElement | null>; l: Lista; g: string | null; oggi: string; progetti: Progetto[]
}) {
  const [testo, setTesto] = useState('')
  const quando = g ? secchioDelGiorno(g, oggi) : 'poi'
  const scrivi = async (riga: string) => {
    const r = leggiRiga(riga, progetti)
    if (!r.testo) return
    await l.aggiungi(r.testo, quando, g, g ? r.ora : null, { progetto: r.progetto, priorita: r.priorita })
  }
  return (
    <input ref={campo} className="quaderno-scrivi" value={testo} aria-label={g ? frasi.scriviPer(g) : t('Scrivi una cosa da pianificare')}
      placeholder={t('Scrivi qui')}
      onChange={e => setTesto(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          const r = testo.trim()
          if (!r) return
          setTesto('')
          void scrivi(r)
        }
        if (e.key === 'Escape') { setTesto(''); e.currentTarget.blur() }
      }}
      onPaste={e => {
        const incollato = e.clipboardData.getData('text')
        const righe = incollato.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
        if (righe.length < 2) return
        e.preventDefault()
        void (async () => { for (const r of righe) await scrivi(r) })()
      }} />
  )
}

/**
 * Una riga del quaderno.
 *
 * Il cerchio a sinistra la chiude. Il testo, su una linea sola, la apre: una
 * riga con un lavoro di Myynd dentro (pronta, che chiede) apre quel lavoro,
 * le altre il dettaglio, dove il testo intero si legge e si riscrive. Sotto
 * la mano, in fondo alla riga, «A Myynd», il dettaglio e il cestino: prendono
 * il loro posto accanto al testo, che si accorcia coi puntini e non viene
 * mai coperto («items don't overlap»). Il cestino toglie e basta, senza
 * «Sicuro?»: una riga tolta non si cancella.
 */
function RigaQuaderno({ c, oggi, locale, l, progetto, progetti, sopra, suSopra, lascia, apri, modifica }: {
  c: Compito; oggi: string; locale: string; l: Lista; progetto: Progetto | null; progetti: Progetto[]
  sopra: boolean; suSopra: () => void; lascia: (e: React.DragEvent) => void
} & Apri) {
  const stato = statoRiga(c, l.passi[c.id], l.turno)
  const suo = giornoCompito(c, oggi)
  const ritardo = !!suo && suo < oggi
  const siApre = c.stato === 'pronto' || c.stato === 'chiede'
  const siScrive = c.stato === 'aperto' && !c.guaio
  // la parola di chi aspetta chi non si legge sulla riga: resta sotto la mano e per chi legge lo schermo
  const parola = stato ? (stato.giorno ? frasi.laNottePrima(stato.giorno) : t(stato.chiave)) : ''
  const classi = ['quaderno-riga', stato ? `di-${stato.tipo}` : '', ritardo ? 'tardi' : '', sopra ? 'sopra' : ''].filter(Boolean).join(' ')
  return (
    <li className={classi} data-id={c.id} draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move' }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); suSopra() }}
      onDrop={lascia}>
      <button type="button" className="quaderno-spunta" aria-label={`${t('Fatto')}: ${c.testo}`} title={parola || t('Fatto')} onClick={() => l.chiudi(c.id)} />
      <button type="button" className="quaderno-testo" title={c.titolo ? c.testo : undefined}
        onClick={() => { if (siApre) apri(c); else modifica(c) }}>
        {ritardo && <span className="quaderno-tardi">{dataLocale(suo!).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}<span className="task-sr">, {t('Da recuperare')}</span></span>}
        {c.ora && <span className="quaderno-ora">{c.ora}</span>}
        {progetto && <i className="quaderno-punto" style={{ background: coloreProgetto(progetto, progetti) }} title={progetto.nome} />}
        <span className="quaderno-parole">{c.titolo || c.testo}</span>
        {c.priorita === 'alta' && <span className="quaderno-alta" aria-label={t('Alta')}>!</span>}
        {parola && <span className="task-sr">, {parola}</span>}
      </button>
      <span className="quaderno-fine">
        {(stato?.tipo === 'lavora' || stato?.tipo === 'coda') && <i className={`quaderno-segno ${stato.tipo}`} title={parola} aria-hidden="true" />}
        {/*
          Il cestino a sinistra e il dettaglio in fondo: in fondo alla riga c'è
          il punto verde di chi ci lavora, e chi lo indica deve trovarci sotto
          una cosa innocua. Il primo ottobre, col cestino in fondo, un clic sul
          punto di una carta affidata l'ha tolta a metà lavoro: «the task
          disappeared, and I don't know where the thing went».
        */}
        <span className="quaderno-gesti">
          <button type="button" className="quaderno-icona" data-togli onClick={() => void l.elimina(c.id)} aria-label={`${t('Toglila')}: ${c.testo}`}>
            <IconCestino size={12} />
          </button>
          {siScrive && (!c.modo || c.modo === 'io') && (
            <button type="button" className="quaderno-icona" onClick={() => void l.mettiInCoda(c.id)} aria-label={`${t('A Myynd')}: ${c.testo}`} title={t('A Myynd')}>
              <Marchio dim={14} animato={false} />
            </button>
          )}
          <Sposta c={c} l={l} oggi={oggi} />
          <button type="button" className="quaderno-icona" onClick={() => modifica(c)} aria-label={`${t('Dettagli attività')}: ${c.testo}`}>⋯</button>
        </span>
      </span>
    </li>
  )
}

/**
 * Spostare una riga a un altro giorno senza trascinarla: «I should be able to
 * move my to-do list items from one day to another… right now I can, but it's
 * a bit sketchy to do» (2 ottobre). Trascinare resta; qui c'è un dito solo:
 * oggi, domani, lunedì prossimo, senza data.
 */
function Sposta({ c, l, oggi }: { c: Compito; l: Lista; oggi: string }) {
  const [aperto, setAperto] = useState(false)
  const dove = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => { if (!dove.current?.contains(e.target as Node)) setAperto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAperto(false) }
    document.addEventListener('mousedown', fuori)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc) }
  }, [aperto])
  const lunedi = (() => { const d = dataLocale(oggi).getDay(); return spostaGiorno(oggi, ((8 - d) % 7) || 7) })()
  const scelte: [string, string | null][] = [['Oggi', oggi], ['Domani', spostaGiorno(oggi, 1)], ['Lunedì prossimo', lunedi], ['Senza data', null]]
  const suo = giornoCompito(c, oggi)
  const vai = (g: string | null) => {
    setAperto(false)
    if (g === suo) return
    void l.cambia(c.id, { giorno: g, quando: g ? secchioDelGiorno(g, oggi) : 'poi', ...(g ? {} : { ora: null }) })
  }
  return (
    <span ref={dove} className="quaderno-sposta">
      <button type="button" className="quaderno-icona" aria-haspopup="menu" aria-expanded={aperto}
        aria-label={`${t('Sposta a un altro giorno')}: ${c.testo}`} title={t('Sposta a un altro giorno')} onClick={() => setAperto(a => !a)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </button>
      {aperto && (
        <span className="quaderno-sposta-menu" role="menu">
          {scelte.map(([nome, g]) => (
            <button key={nome} type="button" role="menuitem" aria-current={g === suo || undefined} onClick={() => vai(g)}>{t(nome)}</button>
          ))}
        </span>
      )}
    </span>
  )
}

/**
 * La settimana, sulla destra della prima pagina, quando la finestra è larga.
 *
 * «If I'm on deep work, when I open my Myynd app at max I want to deep dive
 * into a session. I want to have my to-do list on the right, claiming that
 * white space.» Le stesse pagine del quaderno, più corte: si scrive, si
 * spunta, si passa a Myynd, senza lasciare la prima pagina.
 *
 * Quanti giorni lo sceglie lui nelle Preferenze, di serie tre: «Monday,
 * Tuesday, Wednesday. That's it.» Il riquadro comincia all'altezza della
 * prima carta del feed, non in cima alla pagina, è alto quanto le sue righe,
 * e se non ci stanno si scorre dentro: non esce mai dalla finestra.
 */
export function ListaDiLato({ l, lingua, giorni: quanti = 3, apri, modifica, vaiALista }: {
  l: Lista; lingua: string; vaiALista: () => void
  /** Quanti giorni, oggi compreso: da 1 a 7. */
  giorni?: number
} & Apri) {
  const oggi = giornoLocale()
  const progetti = useProgetti()
  const locale = lingua === 'it' ? 'it-IT' : 'en-US'
  const giorni = Array.from({ length: Math.min(7, Math.max(1, quanti)) }, (_, i) => spostaGiorno(oggi, i))
  return (
    <aside className="quaderno-lato" aria-label={t('Da fare')}>
      {giorni.map(g => (
        <Giorno key={g} l={l} g={g} oggi={oggi} locale={locale} progetti={progetti} compatto minime={g === oggi ? 2 : 1}
          righe={righeDelGiorno(l.compiti, g, oggi)} fatte={g === oggi ? fatteDelGiorno(l.chiusi, g) : []} apri={apri} modifica={modifica} />
      ))}
      <button type="button" className="quaderno-tutto" onClick={vaiALista}>{t('Tutta la settimana')} ›</button>
    </aside>
  )
}
