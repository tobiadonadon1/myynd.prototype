// La giostra: le carte in fila, di tre quarti, come i dischi in uno scaffale.
//
// Il meccanismo è quello del coverflow, e la cosa che lo tiene in piedi è una
// sola: **la posizione è un numero con la virgola**, non un indice. `2.4` vuol
// dire «fra la terza e la quarta, più vicino alla terza», ed è quello che
// permette al trascinamento di essere continuo e allo scatto finale di essere
// un'animazione invece di un salto.
//
// Tre scelte che vale la pena non dimenticare:
//
//   · le trasformazioni si scrivono a mano nel DOM, non passano da React. A
//     sessanta fotogrammi al secondo, farle passare da uno stato vorrebbe dire
//     ridisegnare ogni carta per dei numeri che React non deve mai vedere.
//   · il giro non ha carte clonate. La distanza fra due carte si ripiega sul
//     giro più corto dell'anello, quindi l'ultima è a un passo dalla prima
//     senza che nessun nodo si sposti. Una carta «teletrasportata» dall'altra
//     parte lo fa a mezzo giro esatto, dove è già invisibile.
//   · l'inclinazione cresce meno della distanza (`smorzo`). Con una rampa
//     lineare la seconda carta si chiude di taglio e non si legge più; così
//     invece si apre, e una fascia di notizie deve restare leggibile anche di
//     lato — è tutto il punto di metterle qui invece che in elenco.
//
// Qui dentro non c'è niente che sappia cosa sono le carte: disegna quello che
// le passi, e dice quale sta al centro. Le notizie stanno in `Rassegna.tsx`.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Il movimento è spento per chi ha chiesto meno movimento. */
function menoMoto(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export type GiostraProps = {
  quante: number
  /** Cosa disegnare al posto i. `centrata` serve a mostrare i comandi solo lì. */
  figlio: (i: number, centrata: boolean) => ReactNode
  /** Un tocco sulla carta al centro: sulle altre, il tocco la porta al centro. */
  apri?: (i: number) => void
  /** Qualunque lunghezza CSS: tutto il resto è derivato da qui. */
  larghezza?: string
  /** Quanto è alta rispetto a quanto è larga. */
  proporzione?: number
  /** I gradi a cui si inclina la prima vicina. */
  rotazione?: number
  /** Quanto arretra la prima vicina, in frazioni di larghezza. */
  profondita?: number
  /** La distanza dell'occhio, in multipli della larghezza: meno è più grandangolo. */
  prospettiva?: number
  /** L'esponente sulla distanza. Sotto 1 l'inclinazione si smorza andando fuori. */
  smorzo?: number
  /** Quanta opacità si perde a ogni passo dal centro. */
  velo?: number
  /** Lo spazio fra due carte, in frazioni di larghezza. */
  spazio?: number
  etichetta?: string
}

export function Giostra({
  quante,
  figlio,
  apri,
  larghezza = 'clamp(186px, 27vw, 258px)',
  proporzione = 0.78,
  rotazione = 42,
  profondita = 0.58,
  prospettiva = 3,
  smorzo = 0.56,
  velo = 0.07,
  spazio = 0.06,
  etichetta = 'Carosello'
}: GiostraProps) {
  const telaio = useRef<HTMLDivElement>(null)
  const carte = useRef<(HTMLDivElement | null)[]>([])
  /** L'indice frazionario al centro: l'unica verità. */
  const posizione = useRef(0)
  /**
   * Dove sta andando lo scatto in corso.
   *
   * Serve separata da `posizione`: partire da quella vorrebbe dire che una
   * freccia premuta a metà volo si perde, perché l'arrotondamento non si è
   * ancora mosso e il passo successivo torna sulla carta da cui si stava
   * uscendo.
   */
  const meta = useRef(0)
  const largo = useRef(0)
  const battito = useRef<number | null>(null)
  const strascico = useRef<{ id: number; x: number; da: number; v: number; t: number } | null>(null)
  /** Un trascinamento non è un clic: senza questo, ogni scorrimento apre una notizia. */
  const mosso = useRef(false)

  const [scelta, setScelta] = useState(0)

  // Con poche carte l'anello non gira: a due, la vicina starebbe a mezzo giro
  // esatto — cioè nel punto in cui il codice la fa sparire — e resterebbe una
  // carta sola in mezzo al vuoto.
  const anello = quante >= 5

  const indiceA = useCallback(
    (p: number) => ((Math.round(p) % quante) + quante) % quante,
    [quante]
  )

  const disegna = useCallback(() => {
    const l = largo.current
    if (!l) return
    const passo = l * (1 + spazio)
    const p = posizione.current

    carte.current.forEach((carta, i) => {
      if (!carta) return

      // la distanza ripiegata sul giro più corto: è tutto il meccanismo
      // dell'anello, senza un nodo clonato e senza toccare il DOM
      let scarto = i - p
      if (anello) {
        scarto = ((scarto % quante) + quante) % quante
        if (scarto > quante / 2) scarto -= quante
      }

      const distanza = Math.abs(scarto)
      const rampa = Math.pow(distanza, smorzo)
      // fermata prima del taglio netto: una carta lontana non deve mai voltarsi
      const piega = Math.min(rotazione * rampa, 80) * Math.sign(scarto)

      carta.style.transform =
        `translateX(calc(-50% + ${scarto * passo}px)) ` +
        `translateZ(${-profondita * l * rampa}px) rotateY(${-piega}deg)`

      // a mezzo giro la carta salta dall'altra parte dell'anello: deve essere
      // già sparita, o il salto si vede
      const bordo = anello ? Math.min(1, Math.max(0, quante / 2 - distanza)) : 1
      const visibile = Math.max(0, 1 - velo * distanza) * bordo
      carta.style.opacity = String(visibile)
      carta.style.zIndex = String(100 - Math.round(distanza))
      /**
       * Chi riceve i clic.
       *
       * Qui c'era «solo quella al centro», ed era un errore che si mangiava
       * metà del carosello: toccare una carta di lato deve portarla al centro,
       * ed è il gesto più naturale che ci sia davanti a un mazzo del genere —
       * ma una carta con `pointer-events: none` il tocco non lo riceve, quindi
       * non succedeva niente e sembrava che la fascia si muovesse solo
       * trascinando. I comandi restano appannaggio della carta al centro: quello
       * lo decide la carta stessa, che sa se è centrata. Qui si spengono solo
       * quelle ormai trasparenti, che sarebbero bersagli invisibili.
       */
      carta.style.pointerEvents = visibile < 0.25 ? 'none' : 'auto'
    })
  }, [anello, profondita, quante, rotazione, smorzo, spazio, velo])

  const assesta = useCallback((verso: number) => {
    if (battito.current !== null) cancelAnimationFrame(battito.current)
    meta.current = verso
    setScelta(indiceA(verso))

    if (menoMoto()) {
      posizione.current = verso
      disegna()
      return
    }

    const passo = () => {
      const resta = verso - posizione.current
      if (Math.abs(resta) < 0.0004) {
        posizione.current = verso
        disegna()
        battito.current = null
        return
      }
      // frenata esponenziale, non una molla: qui non serve rimbalzo
      posizione.current += resta * 0.16
      disegna()
      battito.current = requestAnimationFrame(passo)
    }
    battito.current = requestAnimationFrame(passo)
  }, [disegna, indiceA])

  const dentro = useCallback(
    (p: number) => (anello ? p : Math.max(0, Math.min(quante - 1, p))),
    [anello, quante]
  )

  const vaiA = useCallback((i: number) => {
    // per la via più corta, invece di srotolare tutto l'anello
    const verso = anello ? i + Math.round((meta.current - i) / quante) * quante : i
    assesta(dentro(verso))
  }, [anello, assesta, dentro, quante])

  const spingi = useCallback(
    (di: number) => assesta(dentro(Math.round(meta.current) + di)),
    [assesta, dentro]
  )

  /**
   * Il trascinamento, senza `setPointerCapture`.
   *
   * La cattura sembrava la cosa giusta — è quella che tiene il dito agganciato
   * anche fuori dal telaio — e rompeva tutto quello che c'è dentro le carte.
   * Con la cattura attiva il `click` non viene consegnato al bottone che hai
   * premuto ma all'elemento che ha catturato: la × e «Letta» erano morte, e
   * toccare una carta di lato non la portava al centro. Funzionava solo il
   * trascinamento, cioè l'unica cosa che non passa da un clic.
   *
   * Gli ascoltatori sulla finestra fanno lo stesso lavoro — il dito resta
   * agganciato anche uscendo dal riquadro — e non toccano il percorso dei
   * clic. Passano da un ref perché si registrano una volta sola, e devono
   * vedere lo stato di adesso e non quello del ridisegno in cui sono nati.
   */
  const muoviQui = useRef<(e: PointerEvent) => void>(() => {})
  const suQui = useRef<(e: PointerEvent) => void>(() => {})

  const giu = (e: React.PointerEvent<HTMLDivElement>) => {
    if (battito.current !== null) {
      cancelAnimationFrame(battito.current)
      battito.current = null
    }
    meta.current = posizione.current
    mosso.current = false
    strascico.current = { id: e.pointerId, x: e.clientX, da: posizione.current, v: 0, t: performance.now() }

    const m = (ev: PointerEvent) => muoviQui.current(ev)
    const u = (ev: PointerEvent) => {
      suQui.current(ev)
      window.removeEventListener('pointermove', m)
      window.removeEventListener('pointerup', u)
      window.removeEventListener('pointercancel', u)
    }
    window.addEventListener('pointermove', m)
    window.addEventListener('pointerup', u)
    window.addEventListener('pointercancel', u)
  }

  const muovi = (e: { pointerId: number; clientX: number }) => {
    const s = strascico.current
    if (!s || s.id !== e.pointerId) return

    const passo = largo.current * (1 + spazio)
    if (!passo) return
    if (Math.abs(e.clientX - s.x) > 5) mosso.current = true

    const ora = performance.now()
    const prima = posizione.current
    posizione.current = dentro(s.da - (e.clientX - s.x) / passo)
    // carte al secondo, per il lancio
    s.v = ((posizione.current - prima) / Math.max(ora - s.t, 1)) * 1000
    s.t = ora

    const i = indiceA(posizione.current)
    if (i !== scelta) setScelta(i)
    disegna()
  }

  const su = (e: { pointerId: number }) => {
    const s = strascico.current
    if (!s || s.id !== e.pointerId) return
    strascico.current = null

    if (!mosso.current) return assesta(dentro(Math.round(posizione.current)))

    /**
     * Dopo un trascinamento arriva comunque un clic, su qualunque cosa si trovi
     * sotto il dito quando lo alzi — e sotto il dito, alla fine di uno
     * scorrimento, c'è una carta che si è appena mossa lì. Senza questa
     * trappola, scorrere il mazzo segnava letta una notizia a caso.
     */
    const t = telaio.current
    if (t) {
      const blocca = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
      t.addEventListener('click', blocca, { capture: true, once: true })
      // se il clic non arriva — il dito si è alzato fuori dal telaio — la
      // trappola si toglie da sola invece di restare armata per il prossimo
      setTimeout(() => t.removeEventListener('click', blocca, true), 350)
    }

    // un colpo secco porta avanti, ma mai più di due carte
    const portata = Math.max(-2, Math.min(2, s.v * 0.18))
    assesta(dentro(Math.round(posizione.current + portata)))
  }

  muoviQui.current = muovi
  suQui.current = su

  /** Il tocco: al centro apre, di lato porta al centro. */
  const tocca = (i: number) => {
    if (mosso.current) return
    if (i === scelta) apri?.(i)
    else vaiA(i)
  }

  // la larghezza della carta comanda passo, profondità e prospettiva: è l'unica
  // cosa che valga la pena misurare, e solo quando la scatola cambia davvero
  useLayoutEffect(() => {
    const t = telaio.current
    if (!t) return
    const misura = () => {
      const c = carte.current[0]
      if (!c) return
      largo.current = c.offsetWidth
      disegna()
    }
    misura()
    const occhio = new ResizeObserver(misura)
    occhio.observe(t)
    return () => occhio.disconnect()
  }, [disegna])

  /**
   * Le carte finiscono.
   *
   * Ne leggi una e sparisce dal mazzo: se la posizione restasse dov'era,
   * puntereb­be a una carta che non c'è più — e con l'anello spento andrebbe
   * fuori dai bordi, lasciando lo schermo vuoto con dentro ancora tre notizie.
   */
  useEffect(() => {
    carte.current.length = quante
    if (!quante) return
    const stretta = anello ? posizione.current : Math.max(0, Math.min(quante - 1, posizione.current))
    posizione.current = stretta
    meta.current = anello ? meta.current : stretta
    setScelta(indiceA(stretta))
    disegna()
  }, [anello, disegna, indiceA, quante])

  useEffect(() => () => {
    if (battito.current !== null) cancelAnimationFrame(battito.current)
  }, [])

  if (!quante) return null

  return (
    <div style={{
      // Le vicine finiscono sotto il bordo della colonna. Tagliate di netto
      // sembrano un impaginato rotto; sfumate sembrano quello che sono, cioè
      // altre carte che continuano di là — ed è anche il modo in cui la fascia
      // dice «si scorre» senza scriverlo da nessuna parte.
      //
      // La sfumatura è stretta apposta. Larga, si mangiava la carta di fianco
      // per intero e il mazzo sembrava fuori fuoco: quelle di lato vanno lette,
      // non intuite — è la ragione per cui stanno lì.
      maskImage: 'linear-gradient(90deg,transparent 0,#000 4%,#000 96%,transparent 100%)',
      WebkitMaskImage: 'linear-gradient(90deg,transparent 0,#000 4%,#000 96%,transparent 100%)'
    }}>
    <div
      ref={telaio}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label={etichetta}
      onPointerDown={giu}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); spingi(-1) }
        else if (e.key === 'ArrowRight') { e.preventDefault(); spingi(1) }
      }}
      className="giostra"
      style={{
        // @ts-expect-error una variabile CSS non sta nei tipi di React
        '--gio': larghezza,
        // il margine verticale tiene le ombre dentro al ritaglio
        overflow: 'hidden', padding: '14px 0 20px',
        perspective: `calc(var(--gio) * ${prospettiva})`,
        // il trascinamento orizzontale è nostro, la pagina si scorre lo stesso
        touchAction: 'pan-y'
      }}>
      {/*
        La pista non deve ricevere niente.

        Le carte di lato hanno un `translateZ` negativo: in un contesto
        `preserve-3d` questo le manda *dietro* al piano della pista, e la pista
        — che è un div con una sua area — vinceva ogni prova di collisione. Il
        risultato era che l'unica carta cliccabile era quella al centro, cioè
        l'unica che sta a Z zero: toccare una vicina per portarla al centro non
        funzionava, e non c'era modo di accorgersene guardando lo schermo,
        perché le carte si vedono benissimo.

        Spenta la pista, i clic arrivano alle carte; quelli che cadono fuori
        arrivano al telaio, che è quello che deve trascinare.
      */}
      <div style={{
        position: 'relative', userSelect: 'none', pointerEvents: 'none',
        height: `calc(var(--gio) * ${proporzione})`,
        transformStyle: 'preserve-3d'
      }}>
        {Array.from({ length: quante }, (_, i) => (
          <div
            key={i}
            ref={n => { carte.current[i] = n }}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${quante}`}
            onClick={() => tocca(i)}
            style={{
              position: 'absolute', left: '50%', top: 0,
              width: 'var(--gio)', height: `calc(var(--gio) * ${proporzione})`,
              willChange: 'transform'
            }}>
            {figlio(i, i === scelta)}
          </div>
        ))}
      </div>
    </div>
    </div>
  )
}
