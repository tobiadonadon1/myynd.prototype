// La rassegna: il mondo, la mattina, in un mazzo di carte.
//
// Perché sta in cima alla prima pagina: quello che si legge la mattina lo si
// legge se è già aperto. Una sezione a parte sarebbe una cosa da ricordarsi di
// andare a vedere, e le cose da ricordarsi di andare a vedere si smette di
// vederle in una settimana.
//
// Perché non assomiglia a niente altro qui dentro: tutta l'app è vetro caldo su
// crema, e vuol dire «questa è roba tua, e aspetta una decisione». Le notizie
// non aspettano niente e non sono tue. Quindi qui il colore non segue il
// marchio — è pieno, saturo, diverso a ogni carta — e sopra ci sta il vetro. Si
// riconosce che non è lavoro prima di aver letto una parola, che è esattamente
// il servizio che questa fascia deve rendere.
//
// E il mazzo si consuma. Una carta letta se ne va, una scartata non torna mai
// più: la mattina dopo quello che resta è quello che non hai ancora guardato.
// È l'unica cosa qui dentro che si svuota, ed è di proposito — una rassegna che
// si accumula è un altro arretrato, e di arretrati questa app ne ha già uno.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { api, type Notizia } from '../api'
import { frasi, loc, t } from '../lingua'
import { Hov, LABEL } from '../ui'
import { IconApri, IconCroce, IconGiro } from '../icons'
import { Giostra } from './Giostra'

/** Cosa vuol dire «oggi» per una notizia: da quante ore è entrata in rassegna. */
const ORE_OGGI = 24

/** Quanto dura l'uscita di una carta prima che sparisca davvero. */
const USCITA = 240

/**
 * Il tetto alle righe del riassunto.
 *
 * Non serve a impaginare: serve a non fidarsi di un conto. Se un giorno la
 * misura sbaglia — un carattere che non ha ancora caricato, un'altezza di riga
 * che il browser non sa dire — il peggio che può succedere è un riassunto
 * corto, non un riassunto che esce dalla carta.
 */
const TETTO_RIGHE = 8

type Periodo = 'oggi' | 'settimana'

/**
 * I colori delle carte.
 *
 * Non seguono il marchio, ed è una scelta: il crema e il rame sono la voce di
 * Myynd, e qui non parla Myynd — parlano i giornali. Un colore pieno e diverso
 * a ogni carta dice «questo viene da fuori» meglio di qualunque etichetta.
 *
 * Il colore lo decide l'indirizzo dell'articolo, non la sua posizione nel
 * mazzo: così una notizia tiene il suo colore fra un giro e l'altro, invece di
 * cambiarne uno ogni volta che quella prima di lei viene letta.
 */
const COLORI: [string, string][] = [
  ['rgba(61,79,127,0.84)', 'rgba(88,122,195,0.76)'],      // blu
  ['rgba(75,75,125,0.84)', 'rgba(108,108,188,0.76)'],     // indaco
  ['rgba(96,61,116,0.84)', 'rgba(149,99,189,0.76)'],      // viola
  ['rgba(85,57,87,0.84)', 'rgba(139,88,147,0.76)'],       // prugna
  ['rgba(118,58,94,0.84)', 'rgba(187,94,149,0.76)'],      // magenta
  ['rgba(127,57,87,0.84)', 'rgba(200,93,130,0.76)'],      // rosa
  ['rgba(129,59,79,0.84)', 'rgba(195,92,110,0.76)'],      // rosso
  ['rgba(54,96,75,0.84)', 'rgba(69,165,117,0.76)'],       // smeraldo
  ['rgba(54,103,92,0.84)', 'rgba(62,156,129,0.76)'],      // verde
  ['rgba(76,102,57,0.84)', 'rgba(133,174,87,0.76)'],      // oliva
  ['rgba(54,103,110,0.84)', 'rgba(69,156,172,0.76)'],     // ottanio
  ['rgba(52,88,112,0.84)', 'rgba(69,146,188,0.76)']       // ciano
]
// I colori sono tenuti indietro di proposito: un terzo di grigio dentro, e
// trasparenti. Pieni facevano dodici cartelloni in cima a una pagina che per il
// resto è crema e vetro — si vedevano prima di tutto il resto, che è più
// attenzione di quanta ne meriti una notizia. Così restano dodici colori
// diversi e riconoscibili, ma il fondo caldo dell'app traspare e li tiene in
// famiglia.
// Non c'è nessun ambra e nessun rame, ed è l'unica regola di questa tavolozza:
// quello è il colore di Myynd. Una carta di quel colore si siede accanto alla
// card scura della prima pagina e sembra della stessa famiglia — che è
// esattamente la cosa che questi colori esistono per non far succedere.

/**
 * Il colore di ogni carta del mazzo.
 *
 * Lo decide l'indirizzo dell'articolo e non la sua posizione: così una notizia
 * tiene il suo colore fra un giro e l'altro, invece di cambiarlo ogni volta che
 * quella prima di lei viene letta.
 *
 * Poi si scorre il mazzo e si scansa il vicino. Un hash su dodici colori fa
 * coppie attaccate più spesso di quanto sembri — ed è il tipo di caso che non
 * si vede provando, si vede in produzione: due carte identiche di fianco
 * sembrano un errore di disegno, non un caso. Si sposta la seconda al colore
 * dopo, che costa una riga.
 */
function tinte(ids: string[]): number[] {
  const fuori: number[] = []
  ids.forEach((id, i) => {
    let n = 0
    for (let k = 0; k < id.length; k++) n = (n * 31 + id.charCodeAt(k)) >>> 0
    let scelto = n % COLORI.length
    const vicini = [fuori[i - 1], i === ids.length - 1 ? fuori[0] : undefined]
    while (vicini.includes(scelto)) scelto = (scelto + 1) % COLORI.length
    fuori.push(scelto)
  })
  return fuori
}

/** Da quanto è uscita, detto come lo direbbe una persona. */
function eta(iso: string): string {
  const minuti = (Date.now() - new Date(iso).getTime()) / 60_000
  if (!Number.isFinite(minuti)) return ''
  if (minuti < 90) return frasi.minutiFa(Math.max(1, Math.round(minuti)))
  const ore = minuti / 60
  if (ore < 22) return frasi.oreFa(Math.round(ore))
  if (ore < 46) return t('ieri')
  return new Date(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })
}

/** Il vetro dei bottoni sopra al colore. */
const VETRO: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  border: '1px solid rgba(255,255,255,.34)', background: 'rgba(255,255,255,.16)',
  backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
  color: '#FFFFFF', fontFamily: 'inherit', cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.28)'
}

/**
 * Una carta.
 *
 * Il colore sotto, il vetro sopra, e tre cose sole: da dove viene, cosa dice,
 * cosa ne pensa Myynd. I due bottoni stanno in alto a destra e compaiono solo
 * sulla carta al centro — sulle altre sarebbero bersagli inclinati e mezzi
 * trasparenti, cioè un modo di far sbagliare la gente.
 *
 * Toccare la carta la apre sul sito del giornale: è la cosa che si vuole fare
 * più spesso, e quindi è il bersaglio più grande che c'è.
 */
function Carta({ n, colore, centrata, uscendo, letta, scarta }: {
  n: Notizia
  colore: [string, string]
  centrata: boolean
  uscendo: boolean
  letta: () => void
  scarta: () => void
}) {
  const [scuro, chiaro] = colore
  const ferma = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault() }

  /**
   * Quante righe di riassunto ci stanno davvero.
   *
   * Lo spazio rimasto diviso l'altezza di una riga dà le righe intere che ci
   * stanno, e il taglio va lì: nessuna riga a metà, i tre puntini dove servono,
   * e tutto lo spazio della carta usato. Cambia da carta a carta — un titolo di
   * due righe ne regala una al riassunto — ed è il motivo per cui non può
   * essere un numero scritto qui.
   *
   * Quello che si misura NON è il testo: è la scatola che lo contiene. La prima
   * versione misurava lo stesso elemento che portava il ritaglio, e quel giro
   * si mangia la coda da solo — il ritaglio a N righe dà all'elemento
   * un'altezza di N righe, la misura successiva legge quell'altezza e ne
   * ricava N più grande, e via così finché il testo esce dalla carta e passa
   * sopra alla riga «Leggi su». Qui la scatola prende la sua altezza solo dal
   * flex (`flex: 1 1 0`), quindi non dipende da quante righe ci mettiamo
   * dentro, e il conto sta fermo.
   */
  /**
   * Certi giornali non mandano un riassunto: mandano metadati. Quando non resta
   * niente da leggere, il pannello si stringe sulla riga del link invece di
   * restare aperto su un rettangolo vuoto, e il titolo si prende le righe che
   * avanzano.
   */
  const testo = (n.perche || n.riassunto || '').trim()
  const vuoto = !testo

  const zona = useRef<HTMLDivElement>(null)
  const [righe, setRighe] = useState(3)

  useLayoutEffect(() => {
    const el = zona.current
    if (!el) return
    const misura = () => {
      const alta = parseFloat(getComputedStyle(el).lineHeight)
      if (!alta) return
      setRighe(Math.max(1, Math.min(TETTO_RIGHE, Math.floor(el.clientHeight / alta))))
    }
    misura()
    const occhio = new ResizeObserver(misura)
    occhio.observe(el)
    return () => occhio.disconnect()
  }, [])

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      borderRadius: 20, padding: '10px 11px 11px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
      // Il fondo scuro finiva al 72% e su una carta piccola voleva dire una
      // carta quasi tutta scura: i colori c'erano ma non si vedevano. Portando
      // la fine del gradiente oltre il bordo, quello che sta dentro la carta è
      // per lo più la metà accesa — che è il motivo per cui questi colori
      // esistono.
      background: `linear-gradient(150deg, ${chiaro} 0%, ${scuro} 128%)`,
      boxShadow: '0 16px 34px -14px rgba(20,14,10,.5), 0 2px 8px rgba(20,14,10,.14)',
      color: '#FFFFFF',
      // l'uscita sta qui e non sul contenitore: quello lo muove la giostra a
      // ogni fotogramma, e due mani sulla stessa trasformazione si accavallano
      opacity: uscendo ? 0 : 1,
      transform: uscendo ? 'scale(.88)' : 'none',
      transition: `opacity ${USCITA}ms ease, transform ${USCITA}ms ease`
    }}>
      {/* la luce del vetro: una sola, dall'alto a sinistra, come su tutto il resto */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(158deg, rgba(255,255,255,.16) 0%, rgba(0,0,0,.05) 38%, rgba(0,0,0,.16) 100%)'
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 20,
        border: '1px solid rgba(255,255,255,.28)'
      }} />

      {/* Il giornale e l'ora su una riga sola, non due: su una carta di questa
          misura una riga di testata in più è un terzo del titolo in meno. */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 24 }}>
        {/* Il nome del giornale si accorcia, l'ora no. Erano una stringa sola
            con i puntini in fondo, e su «Hacker News» i puntini si mangiavano
            proprio l'ora — cioè il pezzo corto e utile, sacrificato al pezzo
            lungo. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            minWidth: 0, fontSize: '10px', fontWeight: 600, letterSpacing: '.08em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,.9)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>{n.fonte}</span>
          <span style={{
            flex: 'none', fontSize: '10px', color: 'rgba(255,255,255,.62)', whiteSpace: 'nowrap'
          }}>{`· ${eta(n.quando)}`}</span>
        </div>

        {/* i comandi: solo sulla carta al centro */}
        <div style={{
          display: 'flex', gap: 5, flex: 'none',
          opacity: centrata ? 1 : 0, transition: 'opacity .2s',
          pointerEvents: centrata ? 'auto' : 'none'
        }}>
          <Hov as="button" type="button"
            onClick={(e: MouseEvent) => { ferma(e); scarta() }}
            title={t('Non mi interessa')} aria-label={t('Non mi interessa')}
            style={{ ...VETRO, width: 22, height: 22, padding: 0, borderRadius: '50%' }}
            hover={{ background: 'rgba(255,255,255,.32)' }}><IconCroce /></Hov>

          <Hov as="button" type="button"
            onClick={(e: MouseEvent) => { ferma(e); letta() }}
            title={t('Letta')}
            style={{ ...VETRO, height: 22, padding: '0 9px', borderRadius: 99, fontSize: '10.5px', fontWeight: 500, gap: 4 }}
            hover={{ background: 'rgba(255,255,255,.32)' }}>
            <span>{t('Letta')}</span>
            <span aria-hidden style={{ fontSize: 9.5 }}>📖</span>
          </Hov>
        </div>
      </div>

      {/*
        Il titolo non si allunga più per riempire la carta.
        Aveva `flex: 1`, e con un titolo corto lasciava un buco di colore in
        mezzo alto quanto mezza carta: sembrava una card che non aveva finito di
        caricare. Adesso il titolo occupa le righe che ha, il vetro gli sta
        subito sotto, e la carta è alta quanto basta a tenerli tutti e due.
      */}
      {/*
        Quando non c'è riassunto, il titolo è la carta.

        Certi giornali non mandano prosa: Hacker News manda una scheda di
        indirizzi, e una volta buttata via non resta niente da mettere nel
        vetro. La tentazione è lasciare il pannello vuoto — e viene fuori una
        carta con un buco, che è il difetto che abbiamo appena finito di
        togliere. Invece il titolo si prende lo spazio e cresce: una carta di
        solo titolo, in mezzo, con il link in fondo. È una variante voluta, non
        una card a cui manca un pezzo.
      */}
      <div style={{
        position: 'relative', marginTop: 8, flex: vuoto ? 1 : 'none', minHeight: 0,
        display: 'flex', alignItems: vuoto ? 'center' : 'flex-start'
      }}>
        <div style={{
          width: '100%',
          fontSize: vuoto ? 'clamp(15px, 1.45vw, 19px)' : 'clamp(13.5px, 1.15vw, 15.5px)',
          lineHeight: 1.28, fontWeight: 500,
          letterSpacing: '-.012em', textWrap: 'pretty', overflowWrap: 'anywhere',
          textShadow: '0 1px 10px rgba(0,0,0,.2)',
          display: '-webkit-box', WebkitLineClamp: vuoto ? 5 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>{n.titolo}</div>
      </div>

      {/*
        Il vetro prende tutto quello che resta.

        Aveva un tetto di due righe, e su una carta con un titolo corto voleva
        dire un riassunto tagliato a metà frase con sotto un dito di colore
        vuoto. Adesso il pannello si allunga fino in fondo alla carta e il testo
        riempie le righe che ci stanno — tre se il titolo ne occupa due, due se
        il titolo ne occupa tre. Niente numero fisso: lo spazio che c'è lo decide
        la carta, non una costante scritta qui.

        Quante righe ci stiano lo dice la carta, misurandosi: vedi `righe` qui
        sopra. Così non si taglia mai una riga a metà altezza, che è la cosa che
        fa sembrare rotta una card.
      */}
      <div style={{
        position: 'relative', marginTop: 8, flex: vuoto ? 'none' : 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        // La regola, e sta qui perché è qui che si rompe: da questa scatola non
        // esce niente. Il testo dentro può essere lungo quanto vuole, può
        // contenere un indirizzo di duecento caratteri senza spazi, può essere
        // misurato male: fuori non va. Il taglio pulito lo fa `righe`; questo è
        // quello che tiene anche quando `righe` sbaglia.
        overflow: 'hidden',
        borderRadius: 13, padding: '7px 9px 6px',
        background: 'rgba(255,255,255,.15)',
        backdropFilter: 'blur(16px) saturate(1.3)', WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        border: '1px solid rgba(255,255,255,.22)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.24)'
      }}>
        {!vuoto && (
          // `flex: 1 1 0` e non `flex: 1`: la base a zero è quello che rende
          // l'altezza indipendente dal contenuto, ed è tutta la ragione per cui
          // questa scatola si può misurare senza rincorrersi
          <div ref={zona} style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
            <div style={{
              fontSize: '11.5px', lineHeight: 1.42, color: 'rgba(255,255,255,.94)', textWrap: 'pretty',
              // un indirizzo lungo senza spazi non si spezza da solo, e uscirebbe
              // di lato invece che di sotto
              overflowWrap: 'anywhere',
              display: '-webkit-box', WebkitLineClamp: righe, WebkitBoxOrient: 'vertical', overflow: 'hidden'
            }}>{testo}</div>
          </div>
        )}

        <div style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 5, marginTop: vuoto ? 0 : 5,
          fontSize: '10px', color: 'rgba(255,255,255,.72)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          <IconApri size={10} />{frasi.leggiSu(n.fonte)}
        </div>
      </div>
    </div>
  )
}

/** Il bottoncino di testa: due parole, nessuna cornice finché non è scelto. */
function Scelta({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <Hov as="button" onClick={onClick}
      style={{
        padding: '3px 10px', borderRadius: 99, fontFamily: 'inherit', fontSize: '11.5px',
        cursor: 'pointer', letterSpacing: '.02em',
        border: `1px solid ${on ? 'rgba(34,39,31,.16)' : 'transparent'}`,
        background: on ? 'rgba(255,255,255,.72)' : 'transparent',
        color: on ? '#22271F' : 'rgba(34,39,31,.45)'
      }}
      hover={{ color: '#22271F' }}>{children}</Hov>
  )
}

export function Rassegna() {
  const [notizie, setNotizie] = useState<Notizia[] | null>(null)
  const [quando, setQuando] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('oggi')
  const [carico, setCarico] = useState(false)
  const [guaio, setGuaio] = useState('')
  /** Quelle che stanno svanendo, e quelle già uscite dal mazzo. */
  const [uscendo, setUscendo] = useState<string[]>([])
  const [via, setVia] = useState<string[]>([])
  const orologi = useRef<ReturnType<typeof setTimeout>[]>([])

  const carica = useCallback(() => {
    return api.rassegna()
      .then(r => { setNotizie(r.notizie); setQuando(r.quando); return r.notizie.length })
      // la rassegna non è il motivo per cui si apre Myynd: se non risponde,
      // la fascia sparisce e la pagina resta quella di prima
      .catch(() => { setNotizie([]); return 0 })
  }, [])

  /**
   * Il primo giro, e la pazienza del primo avvio.
   *
   * Appena acceso, il server va a bussare ai giornali una decina di secondi
   * dopo essere partito: chi apre l'app in quella finestra troverebbe la
   * rassegna vuota e non avrebbe più nessun motivo di riguardare. Si richiede
   * un paio di volte, piano, e la fascia compare da sola — che è meglio di un
   * bottone «riprova» per una cosa che sta già succedendo di là.
   */
  useEffect(() => {
    let vivo = true
    let giri = 0
    let attesa: ReturnType<typeof setTimeout> | undefined
    const guarda = () => {
      carica().then(quante => {
        if (!vivo || quante || giri >= 3) return
        giri++
        attesa = setTimeout(guarda, 15_000)
      })
    }
    guarda()
    return () => { vivo = false; clearTimeout(attesa) }
  }, [carica])

  useEffect(() => () => { orologi.current.forEach(clearTimeout) }, [])

  const aggiorna = async () => {
    if (carico) return
    setCarico(true)
    setGuaio('')
    try {
      const r = await api.aggiornaRassegna()
      setNotizie(r.notizie)
      setQuando(r.quando)
    } catch (e) {
      setGuaio(e instanceof Error ? e.message : String(e))
    } finally {
      setCarico(false)
    }
  }

  /**
   * Una carta esce dal mazzo.
   *
   * Prima svanisce, poi sparisce: togliere la riga subito farebbe scattare
   * tutte le altre di una posizione mentre stai ancora guardando quella che
   * hai appena chiuso. Il server lo sa comunque — e se la chiamata fallisce
   * non si rimette la carta a posto: riapparirebbe da sola al ricaricamento,
   * che è già il modo giusto di accorgersene.
   */
  const togli = (n: Notizia, come: 'letta' | 'scartata') => {
    setUscendo(v => (v.includes(n.id) ? v : [...v, n.id]))
    const chiamata = come === 'letta' ? api.notiziaLetta(n.id) : api.notiziaScartata(n.id)
    chiamata.catch(() => { /* torna al prossimo giro: non vale un avviso */ })
    orologi.current.push(setTimeout(() => {
      setVia(v => [...v, n.id])
      setUscendo(v => v.filter(x => x !== n.id))
    }, USCITA))
  }

  // Finché non si sa non c'è niente da mostrare: una fascia che compare vuota e
  // poi si riempie fa saltare in giù tutta la pagina proprio mentre la stai
  // guardando. E se una rassegna non è mai stata fatta non c'è nemmeno la
  // testata: una scatola vuota in cima alla prima pagina, tutti i giorni, è
  // peggio di niente.
  if (!notizie) return null
  if (!notizie.length && !quando && !carico && !guaio) return null

  const soglia = Date.now() - ORE_OGGI * 3600_000
  const restano = notizie.filter(n => !via.includes(n.id))
  const delGiorno = restano.filter(n => new Date(n.presa).getTime() >= soglia)
  const mazzo = periodo === 'oggi' ? delGiorno : restano
  const quante = mazzo.filter(n => !uscendo.includes(n.id)).length
  const colori = tinte(mazzo.map(n => n.id))

  return (
    <div style={{ flex: 'none', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '0 4px' }}>
        <span style={{ ...LABEL, color: 'rgba(34,39,31,.5)' }}>{t('La rassegna')}</span>
        {quante > 0 && (
          <span style={{ fontSize: '11.5px', color: '#8E3F1F' }}>{frasi.daLeggere(quante)}</span>
        )}

        <div style={{ flex: 1, minWidth: 8 }} />

        {restano.length > 0 && (
          <div style={{ display: 'flex', gap: 2 }}>
            <Scelta on={periodo === 'oggi'} onClick={() => setPeriodo('oggi')}>{t('oggi')}</Scelta>
            <Scelta on={periodo === 'settimana'} onClick={() => setPeriodo('settimana')}>{t('la settimana')}</Scelta>
          </div>
        )}

        <Hov as="button" onClick={aggiorna} disabled={carico}
          title={quando ? frasi.guardatiIGiornali(eta(quando)) : t('Guarda i giornali')}
          aria-label={t('Guarda i giornali')}
          style={{
            display: 'grid', placeItems: 'center', width: 24, height: 24, padding: 0,
            border: 'none', background: 'none', cursor: carico ? 'default' : 'pointer',
            color: 'rgba(34,39,31,.4)',
            animation: carico ? 'gira 1.1s linear infinite' : undefined
          }}
          hover={{ color: '#8E3F1F' }}>
          <IconGiro />
        </Hov>
      </div>

      {mazzo.length === 0 ? (
        <div style={{ padding: '14px 4px 4px', fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(34,39,31,.58)' }}>
          {guaio
            ? t(guaio)
            : carico
              ? t('Sto guardando i giornali…')
              : periodo === 'oggi' && restano.length
                ? t('Hai finito la rassegna di oggi. La settimana è qui accanto.')
                : restano.length === 0 && quando
                  ? t('Hai letto tutto. I giornali tornano fra qualche ora.')
                  : quando
                    ? t('Niente di nuovo dai giornali.')
                    : t('Non ho ancora guardato i giornali.')}
        </div>
      ) : (
        <Giostra
          quante={mazzo.length}
          etichetta={t('La rassegna')}
          apri={i => { const n = mazzo[i]; if (n) window.open(n.link, '_blank', 'noopener,noreferrer') }}
          figlio={(i, centrata) => {
            const n = mazzo[i]
            if (!n) return null
            return (
              <Carta
                n={n}
                colore={COLORI[colori[i]]}
                centrata={centrata}
                uscendo={uscendo.includes(n.id)}
                letta={() => togli(n, 'letta')}
                scarta={() => togli(n, 'scartata')}
              />
            )
          }}
        />
      )}

      {mazzo.length > 0 && guaio && (
        <div style={{ padding: '4px 4px 0', fontSize: '12px', color: '#8E3F1F' }}>{t(guaio)}</div>
      )}
    </div>
  )
}
