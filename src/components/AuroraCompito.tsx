import { useEffect, useRef } from 'react'
import type { PassoCompito } from '../api'
// con l'estensione, perché i pezzi puri di questo file (il rumore, il fascio,
// la posa) li esegue anche `aurora-compito.test.ts` in Node
import { frasi, t, loc } from '../lingua.ts'
import './aurora-compito.css'

/*
 * Il fuoco sulla riga che lavora: le righe sono la cosa viva.
 *
 * La prima versione muoveva due strati di righe in CSS, uno verso destra e uno
 * verso sinistra. La seconda teneva le righe ferme e ci faceva passare dentro
 * un'onda: sulla carta sembrava giusto, in pagina no. Le sue parole, il 21
 * settembre: «it still doesn't really move… it's not performing well. It is
 * very, very weak.» Misurato, aveva ragione da vendere: fra un fotogramma e
 * quello dopo, dentro il rettangolo della riga, cambiavano due decimi di punto
 * su duecentocinquantacinque. Un luccichio, non un fuoco.
 *
 * Quindi qui si muove tutto, e tutto nello stesso verso — da sinistra a
 * destra, mai indietro, mai due strati che si incrociano:
 *
 *   1. il disegno delle righe scivola di lato, piano (trentaquattro pixel al
 *      secondo scarsi). Le righe *sono* quelle che si spostano: il disegno è
 *      periodico sulla larghezza, così quando una esce a destra rientra a
 *      sinistra senza che si veda il punto di ricucitura;
 *   2. un fascio di luce viaggia dentro le righe molto più in fretta (il giro
 *      in quattro secondi), con il fronte corto e morbido e la scia lunga, e
 *      rientra da sinistra mentre la coda sta ancora uscendo a destra: non si
 *      spegne mai e non riparte mai;
 *   3. ogni riga ha la sua fiamma, e l'altezza guizza con un rumore a due
 *      ottave — non un seno, che si riconosce dopo tre secondi. È questo che
 *      tiene vivo il bordo di sopra, dove sta l'ambra;
 *   4. dal fondo salgono le striature scure, con un'onda più lenta nello
 *      stesso verso, e passano *davanti* alla luce, come fumo sul vetro;
 *   5. qualche brace sfocata sale e va a destra, e svanisce prima di sparire.
 *
 * Come è disegnato, perché sia fluido: le sfumature verticali costano care se
 * si rifanno a ogni fotogramma (novanta righe per due gradienti l'una, sessanta
 * volte al secondo). Qui le colonne di colore si disegnano *una volta sola* per
 * misura della riga — tre per la luce, una per il rame freddo, una per la
 * cresta, una per il fumo, una per la brace — e poi si stirano con `drawImage`:
 * la scheda grafica fa il resto. Il costo di un fotogramma sta sotto il
 * mezzo millisecondo. La tela è `desynchronized`, il devicePixelRatio è
 * tagliato a due, e il disegno si ferma del tutto quando la riga esce dallo
 * schermo o la finestra va in secondo piano. Con il moto ridotto resta un
 * fotogramma fermo.
 *
 * Il colore di fondo — ambra, rame, buio — resta al CSS, che lo tiene anche
 * senza JavaScript. Qui sopra ci va solo la luce (additiva, perché è luce) e
 * il fumo.
 *
 * Quando il lavoro finisce, `fase="finita"`: un secondo e quattro decimi in
 * cui il fascio si raccoglie e si ferma, il fuoco si raffredda dall'ambra a un
 * rame quieto, le righe si posano tutte alla stessa altezza e svaniscono. Poi
 * `onFinita`. Non è un avviso che compare: è una cosa che si spegne.
 */
export function AuroraCompito({ fase = 'lavora', onFinita }: { fase?: 'lavora' | 'finita'; onFinita?: () => void }) {
  const tela = useRef<HTMLCanvasElement | null>(null)
  const fuoco = useRef<Fuoco | null>(null)
  // la richiamata cambia a ogni disegno del componente: si tiene in un
  // riferimento, o l'animazione ripartirebbe da capo ogni volta
  const fine = useRef(onFinita)
  fine.current = onFinita
  useEffect(() => {
    const c = tela.current
    if (!c) return
    const f = accendi(c)
    fuoco.current = f
    return () => { fuoco.current = null; f.spegni() }
  }, [])
  useEffect(() => {
    if (fase !== 'finita') return
    const f = fuoco.current
    if (!f) { fine.current?.(); return }
    f.posa(() => fine.current?.())
  }, [fase])
  return (
    <span className="task-aurora" aria-hidden="true" data-fase={fase === 'finita' ? 'finita' : undefined}>
      <canvas ref={tela} />
    </span>
  )
}

/*
 * I colori. Sono i soli valori scritti a mano in tutta l'app, ed è una
 * deroga decisa: il fuoco non è un componente, è un'immagine, e una sfumatura
 * a cinque fermate non si scrive con i gettoni. Restano comunque in famiglia —
 * la crema dell'ambra chiara, l'ambra, il rame, il rame cupo, il bruno quasi
 * nero della carta di notte. Niente di freddo.
 */
const CREMA = '255,228,190'
const AMBRA = '233,163,92'   /* --ambra #D98A5A / #E9A35C */
const RAME = '196,98,59'     /* --rame #C4623B */
const CUPO = '142,63,31'     /* --rame-cupo #8E3F1F */
const BUIO = '31,26,23'      /* il bruno quasi nero, #1F1A17 */

/** Quanto ci mette la luce a fare il giro della riga, in secondi. */
const GIRO_FASCIO = 4
/** Quanto scivola di lato il disegno delle righe, in pixel al secondo. */
const VELOCITA_DERIVA = 34
/** Quanto corre l'onda del fumo, in pixel al secondo: più del disegno, meno della luce. */
const VELOCITA_FUMO = 62
/** Quanto è lunga la scia del fascio, in frazioni di larghezza. */
const CODA = .26
/** E quanto corto il fronte. */
const TESTA = .09
/** Quanto stanno accese le righe fuori dal fascio. */
const BRACE = .34
/** Quanto le accende il fascio quando passa. */
const FASCIO = 1
/**
 * Quanto dura la posa, in millisecondi.
 *
 * Lo stesso numero sta in `aurora-compito.css` come `1.4s`: la tela e il
 * fondo devono spegnersi insieme, o sulla carta chiara resta per un istante
 * l'uno senza l'altro. Se si cambia qui si cambia anche là.
 */
const POSA_MS = 1400

/* — I pezzi che si possono provare da soli — */

/** Un valore casuale ma sempre lo stesso, dato un numero intero e un seme. */
function pesca(i: number, semi: number): number {
  let n = Math.imul(i | 0, 374761393) + Math.imul(semi | 0, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

/** Rumore a una dimensione: valori pescati agli interi, raccordati dolcemente. */
export function rumore(x: number, semi = 0): number {
  const i = Math.floor(x)
  const f = x - i
  const s = f * f * (3 - 2 * f)
  return pesca(i, semi) * (1 - s) + pesca(i + 1, semi) * s
}

/**
 * Il guizzo di una fiamma: due ottave di rumore, non un seno.
 *
 * Un seno si riconosce dopo tre secondi — la riga respira a tempo e sembra un
 * indicatore. Due ottave sovrapposte a frequenze non multiple non si ripetono
 * mai a orecchio, e costano due moltiplicazioni.
 */
export function fiamma(x: number, semi = 0): number {
  return rumore(x, semi) * .66 + rumore(x * 2.17 + 11.3, semi + 7) * .34
}

/**
 * Quanto è accesa una riga dal fascio che passa.
 *
 * `u` e `centro` stanno in frazioni di larghezza, e il giro si chiude su sé
 * stesso: la differenza si riporta fra meno mezzo e più mezzo, così quando il
 * fascio esce a destra la sua scia sta già rientrando da sinistra e non c'è
 * un fotogramma in cui riparte. Dietro (la scia) la luce cala piano, davanti
 * (il fronte) cala in fretta e morbida. Il valore che resta all'antipodo si
 * toglie, o quel gradino girerebbe per la riga come un'ombra.
 */
export function fascio(u: number, centro: number, coda = CODA, testa = TESTA): number {
  let d = centro - u
  d -= Math.round(d)
  const grezzo = d >= 0 ? Math.exp(-((d / coda) ** 1.7)) : Math.exp(-((-d / testa) ** 2))
  const orlo = Math.exp(-((.5 / coda) ** 1.7))
  return Math.max(0, (grezzo - orlo) / (1 - orlo))
}

/**
 * Le due fasi della posa, da quanto ne è passata (da zero a uno).
 *
 * `raccolta` è il fascio che rallenta, si stringe e si accende: finisce al
 * trenta per cento. `svanire` comincia al trentaquattro, così la luce raccolta
 * si vede per un istante prima di andarsene. Le due si accavallano di poco:
 * è quello che fa sembrare la fine una cosa sola e non due.
 */
export function posaFasi(p: number): { raccolta: number; svanire: number } {
  const q = Math.min(1, Math.max(0, p))
  const dolce = (v: number) => v * v * (3 - 2 * v)
  return {
    raccolta: dolce(Math.min(1, q / .30)),
    svanire: dolce(q <= .34 ? 0 : (q - .34) / .66)
  }
}

/** Quante righe stanno in una riga larga così: fitte, ma mai oltre il conto. */
export function quanteRighe(larghezza: number): number {
  return Math.min(120, Math.max(24, Math.round(larghezza / 6.5)))
}

/* — Il disegno — */

/** Una riga di vetro: dove sta nel disegno, quanto è larga, e come brucia. */
type Riga = {
  /** la sua casa nel disegno, prima della deriva */
  px: number
  w: number
  /** quanto arriva in basso la sua luce, a riposo, in frazione dell'altezza */
  lunga: number
  /** il seme del suo rumore: due righe vicine non guizzano mai insieme */
  semi: number
  /** il passo del suo guizzo, in valori nuovi al secondo */
  passo: number
  /** quanto può accendersi: certe righe restano in ombra */
  peso: number
  /** quale delle tre colonne di luce usa */
  forma: number
  /** quanto sale il fumo dal fondo, e con che fase */
  fumo: number
  faseFumo: number
}

/** Una brace: sale, va a destra, e svanisce prima di sparire. */
type Scintilla = { x: number; y: number; vx: number; vy: number; r: number; vita: number; durata: number }

type Fuoco = { spegni(): void; posa(fine: () => void): void }

/** Le righe, disposte una volta sul periodo del disegno. */
function disponi(periodo: number): Riga[] {
  const n = quanteRighe(periodo)
  const passo = periodo / n
  const righe: Riga[] = []
  for (let i = 0; i < n; i++) {
    righe.push({
      // sempre dentro il periodo: una riga che nascesse a sinistra dello zero
      // non avrebbe la sua metà che rientra da destra, e lì resterebbe un vuoto
      px: ((i + Math.random() * .8 - .4) * passo + periodo) % periodo,
      // sottili quasi sempre, larghe ogni tanto: il quadrato schiaccia verso il basso
      w: 1 + Math.random() ** 2 * passo * .95,
      lunga: .72 + Math.random() * .45,
      semi: Math.floor(Math.random() * 9973),
      passo: .55 + Math.random() * .8,
      peso: .42 + Math.random() * .58,
      forma: i % 3,
      fumo: .28 + Math.random() * .6,
      faseFumo: Math.random() * Math.PI * 2
    })
  }
  return righe
}

/** Una colonna di colore, disegnata una volta e poi solo stirata. */
function colonna(alta: number, fermate: [number, string][]): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = alta
  const x = c.getContext('2d')
  if (!x) return c
  const g = x.createLinearGradient(0, 0, 0, alta)
  for (const [p, col] of fermate) g.addColorStop(p, col)
  x.fillStyle = g
  x.fillRect(0, 0, 8, alta)
  return c
}

/**
 * L'alone del fascio: la luce che si vede *dietro* il vetro, non dentro le
 * righe.
 *
 * Senza, il fascio esiste solo come righe che si accendono, e a occhio sembra
 * un pettine che lampeggia. Con, si legge una sorgente che passa: la coda a
 * sinistra sale piano fino al cuore, e subito dopo il fronte si chiude. In
 * verticale si spegne verso il basso, perché il calore sta in cima.
 */
function alone(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const x = c.getContext('2d')
  if (!x) return c
  const g = x.createLinearGradient(0, 0, 256, 0)
  g.addColorStop(0, `rgba(${AMBRA},0)`)
  g.addColorStop(.36, `rgba(${AMBRA},.10)`)
  g.addColorStop(.62, `rgba(${AMBRA},.30)`)
  g.addColorStop(.74, `rgba(${CREMA},.52)`)
  g.addColorStop(.87, `rgba(${AMBRA},.20)`)
  g.addColorStop(1, `rgba(${AMBRA},0)`)
  x.fillStyle = g
  x.fillRect(0, 0, 256, 64)
  const v = x.createLinearGradient(0, 0, 0, 64)
  v.addColorStop(0, 'rgba(0,0,0,1)')
  v.addColorStop(.55, 'rgba(0,0,0,.42)')
  v.addColorStop(1, 'rgba(0,0,0,0)')
  x.globalCompositeOperation = 'destination-in'
  x.fillStyle = v
  x.fillRect(0, 0, 256, 64)
  return c
}

/** La brace: un punto sfocato, disegnato una volta. */
function scintilla(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')
  if (!x) return c
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, `rgba(${CREMA},.85)`)
  g.addColorStop(.32, `rgba(${AMBRA},.4)`)
  g.addColorStop(1, `rgba(${RAME},0)`)
  x.fillStyle = g
  x.fillRect(0, 0, 64, 64)
  return c
}

function accendi(tela: HTMLCanvasElement): Fuoco {
  const ctx = tela.getContext('2d', { alpha: true, desynchronized: true })
  if (!ctx) return { spegni() { }, posa(fine) { fine() } }
  const fermo = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  let righe: Riga[] = []
  let braci: Scintilla[] = []
  let luce: HTMLCanvasElement[] = []
  let raffreddata: HTMLCanvasElement | null = null
  let cresta: HTMLCanvasElement | null = null
  let fumo: HTMLCanvasElement | null = null
  let punto: HTMLCanvasElement | null = null
  let velatura: HTMLCanvasElement | null = null
  let xs = new Float32Array(0)

  let W = 0
  let H = 0
  let vivo = true
  let visibile = true
  let raf = 0
  let ultimo = 0
  /** L'orologio del fuoco: rallenta quando si posa, e non torna mai indietro. */
  let ora = 0
  let deriva = 0
  let centro = 0
  /** Quando è cominciata la posa, sull'orologio della pagina. Zero: non è cominciata. */
  let daQuando = 0
  let finita: (() => void) | null = null

  const misura = () => {
    const r = tela.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    W = Math.max(1, Math.round(r.width))
    H = Math.max(1, Math.round(r.height))
    tela.width = Math.round(W * dpr)
    tela.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    righe = disponi(W)
    xs = new Float32Array(righe.length)
    // tre colonne: una tagliente, una media, una sfumata. Righe vicine con la
    // stessa sfumatura farebbero un pettine
    luce = [
      colonna(128, [[0, `rgba(${CREMA},.98)`], [.07, `rgba(${CREMA},.72)`], [.22, `rgba(${AMBRA},.52)`], [.55, `rgba(${RAME},.32)`], [.88, `rgba(${CUPO},.12)`], [1, `rgba(${CUPO},0)`]]),
      colonna(128, [[0, `rgba(${CREMA},.82)`], [.12, `rgba(${AMBRA},.62)`], [.42, `rgba(${RAME},.36)`], [.85, `rgba(${CUPO},.14)`], [1, `rgba(${CUPO},0)`]]),
      colonna(128, [[0, `rgba(${CREMA},.62)`], [.18, `rgba(${AMBRA},.46)`], [.55, `rgba(${RAME},.28)`], [.85, `rgba(${CUPO},.12)`], [1, `rgba(${CUPO},0)`]])
    ]
    // il fuoco quando si raffredda: niente crema, solo rame
    raffreddata = colonna(128, [[0, `rgba(${AMBRA},.62)`], [.24, `rgba(${RAME},.4)`], [.66, `rgba(${CUPO},.13)`], [1, `rgba(${CUPO},0)`]])
    cresta = colonna(64, [[0, `rgba(${CREMA},.95)`], [.45, `rgba(${CREMA},.34)`], [1, `rgba(${AMBRA},0)`]])
    // il fumo è scritto dall'alto in basso e si posa capovolto: alto trasparente, fondo pieno
    fumo = colonna(128, [[0, `rgba(${BUIO},0)`], [.45, `rgba(${BUIO},.42)`], [1, `rgba(${BUIO},.92)`]])
    punto = punto ?? scintilla()
    velatura = velatura ?? alone()
    braci = Array.from({ length: 5 }, () => nasce(Math.random()))
  }

  /** Una brace nuova, già a un punto qualunque della sua vita. */
  const nasce = (vita: number): Scintilla => ({
    x: Math.random() * W,
    y: H * (.55 + Math.random() * .6),
    vx: 14 + Math.random() * 22,
    vy: 9 + Math.random() * 15,
    r: 5 + Math.random() * 9,
    vita,
    durata: 3.4 + Math.random() * 3.2
  })

  const disegna = (tms: number) => {
    raf = 0
    if (!vivo) return
    const dt = ultimo ? Math.min(.05, (tms - ultimo) / 1000) : 0
    ultimo = tms

    // la posa: quanto si è raccolta la luce, quanto è già svanita
    let raccolta = 0
    let svanire = 0
    if (daQuando) {
      const p = (tms - daQuando) / POSA_MS
      const f = posaFasi(p)
      raccolta = f.raccolta
      svanire = f.svanire
      if (p >= 1) {
        ctx.clearRect(0, 0, W, H)
        vivo = false
        const chi = finita
        finita = null
        chi?.()
        return
      }
    }
    // tutto rallenta insieme, e niente torna indietro
    const ritmo = 1 - svanire * .85
    const ritmoFascio = (1 - raccolta) ** 1.6

    ora += dt * ritmo
    deriva += dt * VELOCITA_DERIVA * ritmo
    if (deriva >= W) deriva -= Math.floor(deriva / W) * W
    centro = (centro + dt / GIRO_FASCIO * ritmoFascio) % 1

    // raccogliendosi il fascio si stringe e si accende
    const coda = CODA + (.05 - CODA) * raccolta
    const testa = TESTA + (.035 - TESTA) * raccolta
    const guadagno = (1 + 1.35 * raccolta) * (1 - svanire)
    const velo = 1 - svanire
    const guizzo = 1 - raccolta * .7

    ctx.clearRect(0, 0, W, H)
    if (velo <= .002) { chiedi(); return }

    // 1. l'alone del fascio, dietro tutto: la sorgente che passa dietro il
    // vetro. Si disegna due volte quando sborda, per chiudere il giro
    ctx.globalCompositeOperation = 'lighter'
    if (velatura) {
      const largo = W * (coda + testa)
      const sinistra = centro * W - W * coda
      ctx.globalAlpha = Math.min(1, (.8 + .7 * raccolta) * velo)
      ctx.drawImage(velatura, sinistra, 0, largo, H)
      if (sinistra + largo > W) ctx.drawImage(velatura, sinistra - W, 0, largo, H)
      if (sinistra < 0) ctx.drawImage(velatura, sinistra + W, 0, largo, H)
    }

    // 2. la luce nelle righe, additiva: si somma al fondo di CSS invece di coprirlo
    for (let i = 0; i < righe.length; i++) {
      const r = righe[i]
      let x = r.px + deriva
      if (x >= W) x -= W
      xs[i] = x
      const e = fascio(x / W, centro, coda, testa)
      const viva = fiamma(ora * r.passo + r.semi, r.semi)
      // posandosi le righe si pareggiano tutte alla stessa altezza
      const alta = H * ((r.lunga + .42 * guizzo * (viva - .5)) * (1 - svanire) + .4 * svanire)
      const a = Math.min(1, (BRACE + FASCIO * e * guadagno) * r.peso * velo)
      if (a > .004 && alta > 1) {
        ctx.globalAlpha = a * (1 - svanire)
        strisce(luce[r.forma], x, r.w, alta)
        if (svanire > .01 && raffreddata) {
          ctx.globalAlpha = a * svanire * 1.15
          strisce(raffreddata, x, r.w, alta)
        }
      }
      // 3. la cresta: il cappello acceso in cima, che cambia spessore e tiene
      // vivo il bordo di sopra
      if (cresta && velo > .05) {
        const hc = H * (.05 + .12 * fiamma(ora * r.passo * .8 + 31, r.semi + 5)) * (1 - svanire)
        const ac = (.14 + .5 * e * guadagno) * r.peso * velo
        if (ac > .01 && hc > 1) { ctx.globalAlpha = Math.min(1, ac); strisce(cresta, x, r.w, hc) }
      }
    }

    // 4. le braci: salgono e vanno a destra, e svaniscono prima di sparire
    if (punto) {
      for (const b of braci) {
        b.vita += dt / b.durata * ritmo
        if (b.vita >= 1) Object.assign(b, nasce(0))
        b.x += b.vx * dt * ritmo
        b.y -= b.vy * dt * ritmo
        if (b.x - b.r > W) b.x -= W + b.r * 2
        const a = Math.sin(Math.PI * b.vita) * .5 * velo
        if (a > .01) {
          ctx.globalAlpha = a
          ctx.drawImage(punto, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2)
        }
      }
    }

    // 5. il fumo, davanti alla luce: un'onda più lenta, sempre verso destra
    ctx.globalCompositeOperation = 'source-over'
    if (fumo) {
      const k = (Math.PI * 2) / Math.max(120, W * .75)
      for (let i = 0; i < righe.length; i++) {
        const r = righe[i]
        const onda = .5 + .5 * Math.sin(xs[i] * k - ora * VELOCITA_FUMO * k + r.faseFumo)
        const h = H * (.3 + .5 * onda * r.fumo) * (1 - svanire)
        const a = (.2 + .7 * onda) * r.fumo * velo * (1 - svanire) ** 1.4
        if (a > .01 && h > 1) {
          ctx.globalAlpha = Math.min(1, a)
          ctx.drawImage(fumo, 0, 0, 8, 128, xs[i], H - h, r.w, h)
          if (xs[i] + r.w > W) ctx.drawImage(fumo, 0, 0, 8, 128, xs[i] - W, H - h, r.w, h)
        }
      }
    }
    ctx.globalAlpha = 1

    // con il moto ridotto resta questo fotogramma: il fuoco fermo
    if (fermo && !daQuando) return
    chiedi()
  }

  /** Una colonna stirata, e la sua metà che rientra da sinistra quando sborda. */
  const strisce = (sprite: HTMLCanvasElement, x: number, w: number, h: number) => {
    ctx.drawImage(sprite, 0, 0, 8, sprite.height, x, 0, w, h)
    if (x + w > W) ctx.drawImage(sprite, 0, 0, 8, sprite.height, x - W, 0, w, h)
  }
  const chiedi = () => { if (vivo && visibile && !raf) raf = requestAnimationFrame(disegna) }
  const sveglia = () => { ultimo = 0; chiedi() }

  misura()
  chiedi()
  const dimensioni = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { misura(); if (fermo && !daQuando) { disegna(performance.now()) } else sveglia() })
    : null
  dimensioni?.observe(tela)
  // fuori dallo schermo non si disegna: la riga che lavora può stare in fondo
  // a una pagina lunga
  const vista = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(voci => { visibile = voci.some(v => v.isIntersecting); if (visibile) sveglia() })
    : null
  vista?.observe(tela)
  // e nemmeno con la finestra in secondo piano
  const nascosta = () => { visibile = !document.hidden; if (visibile) sveglia() }
  document.addEventListener('visibilitychange', nascosta)

  return {
    spegni() {
      vivo = false
      if (raf) cancelAnimationFrame(raf)
      dimensioni?.disconnect()
      vista?.disconnect()
      document.removeEventListener('visibilitychange', nascosta)
    },
    posa(fine) {
      if (daQuando) return
      // con il moto ridotto non c'è niente da guardare: si spegne e si va avanti
      if (fermo) { vivo = false; ctx.clearRect(0, 0, W, H); fine(); return }
      daQuando = performance.now()
      finita = fine
      visibile = true
      sveglia()
    }
  }
}

export function PassoAttivo({ passo }: { passo: PassoCompito }) {
  const testo = passo.passo === 'preparo' ? (loc().startsWith('en') ? 'Preparing your task…' : 'Preparazione…')
    : passo.passo === 'cerco' ? frasi.passoCerco(passo.dettaglio ?? '')
    : passo.passo === 'apro' ? frasi.passoApro(passo.dettaglio ?? '')
      : [t('Scrivo…'), passo.dettaglio].filter(Boolean).join(' ')
  return <div className="task-working-step" role="status" aria-live="polite">{testo}</div>
}
