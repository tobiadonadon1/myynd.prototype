import { useEffect, useRef, useState } from 'react'
import { api, type Compito, type Progetto } from '../api'
import { frasi, t } from '../lingua'
import { Marchio } from '../components/Marchio'
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
 * Le righe di Myynd dicono chi aspetta chi con una parola a destra
 * («al lavoro», «pronta», «ti chiede», «stanotte»), la stessa della bacheca.
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
export function Giorno({ l, g, oggi, locale, progetti, righe, fatte, apri, modifica, compatto = false }: {
  l: Lista; g: string; oggi: string; locale: string; progetti: Progetto[]
  righe: Compito[]; fatte: Compito[]
  /** Sulla prima pagina: meno righe vuote, e il nome del giorno più piccolo. */
  compatto?: boolean
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
        minime={compatto ? 3 : 9} apri={apri} modifica={modifica} />
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
          <span className="quaderno-testo"><span className="quaderno-parole">{c.testo}</span></span>
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
 * Il cerchio a sinistra la chiude. Il testo si tocca e si riscrive lì, come
 * su un foglio; una riga con un lavoro di Myynd dentro (pronta, che chiede)
 * invece si apre, perché lì c'è qualcosa da leggere. A destra, la parola di
 * chi aspetta chi; sotto la mano, «A Myynd», il dettaglio e il cestino.
 */
function RigaQuaderno({ c, oggi, locale, l, progetto, progetti, sopra, suSopra, lascia, apri, modifica }: {
  c: Compito; oggi: string; locale: string; l: Lista; progetto: Progetto | null; progetti: Progetto[]
  sopra: boolean; suSopra: () => void; lascia: (e: React.DragEvent) => void
} & Apri) {
  const [scrivo, setScrivo] = useState(false)
  const [testo, setTesto] = useState(c.testo)
  useEffect(() => { if (!scrivo) setTesto(c.testo) }, [c.testo, scrivo])
  const stato = statoRiga(c, l.passi[c.id], l.turno)
  const suo = giornoCompito(c, oggi)
  const ritardo = !!suo && suo < oggi
  const siApre = c.stato === 'pronto' || c.stato === 'chiede'
  const siScrive = c.stato === 'aperto' && !c.guaio
  const salva = () => {
    setScrivo(false)
    const r = testo.replace(/\s+/g, ' ').trim()
    if (!r || r === c.testo) { setTesto(c.testo); return }
    void l.cambia(c.id, { testo: r })
  }
  const classi = ['quaderno-riga', stato ? `di-${stato.tipo}` : '', ritardo ? 'tardi' : '', sopra ? 'sopra' : '', c.priorita === 'alta' ? 'alta' : ''].filter(Boolean).join(' ')
  return (
    <li className={classi} data-id={c.id} draggable={!scrivo}
      onDragStart={e => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move' }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); suSopra() }}
      onDrop={lascia}>
      <button type="button" className="quaderno-spunta" aria-label={`${t('Fatto')}: ${c.testo}`} title={t('Fatto')} onClick={() => l.chiudi(c.id)} />
      {scrivo ? (
        <input className="quaderno-modifica" value={testo} autoFocus aria-label={t('Attività')}
          onChange={e => setTesto(e.target.value)} onBlur={salva}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); salva() }
            if (e.key === 'Escape') { e.preventDefault(); setTesto(c.testo); setScrivo(false) }
          }} />
      ) : (
        <button type="button" className="quaderno-testo"
          onClick={() => { if (siApre) apri(c); else if (siScrive) setScrivo(true); else modifica(c) }}>
          {ritardo && <span className="quaderno-tardi">{dataLocale(suo!).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}<span className="task-sr">, {t('Da recuperare')}</span></span>}
          {c.ora && <span className="quaderno-ora">{c.ora}</span>}
          {progetto && <i className="quaderno-punto" style={{ background: coloreProgetto(progetto, progetti) }} title={progetto.nome} />}
          <span className="quaderno-parole">{c.testo}</span>
        </button>
      )}
      {/*
        La fine della riga: un posto fisso, stretto, dove sta la parola di chi
        aspetta chi e, sotto la mano, i due gesti. «When I overlap it… items
        don't overlap»: prima i gesti galleggiavano sopra il testo e lo
        coprivano, con un suggerimento del sistema sopra. Adesso si danno il
        cambio nello stesso posto, e il testo non si tocca mai. Il cestino sta
        nel dettaglio.
      */}
      {!scrivo && (
        <span className="quaderno-fine">
          {stato && (
            <span className={`quaderno-stato ${stato.tipo}`}>
              {stato.tipo === 'lavora' && <i aria-hidden="true" />}
              {stato.giorno ? frasi.laNottePrima(stato.giorno) : t(stato.chiave)}
            </span>
          )}
          <span className="quaderno-gesti">
            {siScrive && (!c.modo || c.modo === 'io') && (
              <button type="button" className="quaderno-icona" onClick={() => void l.mettiInCoda(c.id)} aria-label={`${t('A Myynd')}: ${c.testo}`}>
                <Marchio dim={14} animato={false} />
              </button>
            )}
            <button type="button" className="quaderno-icona" onClick={() => modifica(c)} aria-label={`${t('Dettagli attività')}: ${c.testo}`}>⋯</button>
          </span>
        </span>
      )}
    </li>
  )
}

/**
 * Oggi e domani, sulla destra della prima pagina, quando la finestra è larga.
 *
 * «If I'm on deep work, when I open my Myynd app at max I want to deep dive
 * into a session. I want to have my to-do list on the right, claiming that
 * white space.» Le stesse pagine del quaderno, più corte: si scrive, si
 * spunta, si passa a Myynd, senza lasciare la prima pagina.
 */
export function ListaDiLato({ l, lingua, apri, modifica, vaiALista }: {
  l: Lista; lingua: string; vaiALista: () => void
} & Apri) {
  const oggi = giornoLocale()
  const domani = spostaGiorno(oggi, 1)
  const progetti = useProgetti()
  const locale = lingua === 'it' ? 'it-IT' : 'en-US'
  return (
    <aside className="quaderno-lato" aria-label={t('Da fare')}>
      <Giorno l={l} g={oggi} oggi={oggi} locale={locale} progetti={progetti} compatto
        righe={righeDelGiorno(l.compiti, oggi, oggi)} fatte={fatteDelGiorno(l.chiusi, oggi)} apri={apri} modifica={modifica} />
      <Giorno l={l} g={domani} oggi={oggi} locale={locale} progetti={progetti} compatto
        righe={righeDelGiorno(l.compiti, domani, oggi)} fatte={[]} apri={apri} modifica={modifica} />
      <button type="button" className="quaderno-tutto" onClick={vaiALista}>{t('Tutta la settimana')} ›</button>
    </aside>
  )
}
