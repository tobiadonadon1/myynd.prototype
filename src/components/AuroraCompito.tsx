import { useEffect, useRef } from 'react'
import type { PassoCompito } from '../api'
import { frasi, t, loc } from '../lingua'
import './aurora-compito.css'

/*
 * Il fuoco sulla riga che lavora: le righe sono la cosa viva.
 *
 * La prima versione muoveva due strati di righe in CSS, uno verso destra e
 * uno verso sinistra, sopra un gradiente che respirava. Lui, la sera del 21
 * settembre: «I don't really love the animation… it could be a bit more
 * continuous and not two layers overlapping each other and going in
 * opposite directions… where the lines are actually moving, there's a kind
 * of energy, and it looks more alive and more sophisticated.»
 *
 * Quindi niente strati che scorrono. Le righe stanno ferme dove sono nate —
 * larghezze e spazi irregolari, decisi una volta — e quello che si muove è
 * la *luce* dentro di loro: un'onda lunga che viaggia da sinistra a destra,
 * sempre nello stesso verso, accende una riga dopo l'altra e le lascia
 * spegnersi; sotto, ogni riga ha il suo tremolio lento, così due righe
 * vicine non fanno mai la stessa cosa. Dal basso salgono le striature scure,
 * con un'onda più lenta nello stesso verso, che mangiano il rosso come nella
 * sua prima immagine. È vetro rigato con una fiamma dietro, non un nastro
 * che passa.
 *
 * Una tela, non il CSS, perché un'onda che modula l'altezza e la luce di
 * novanta righe indipendenti non si scrive con dei gradienti ripetuti. Trenta
 * fotogrammi al secondo, ferma quando la riga esce dallo schermo, un
 * fotogramma solo con il moto ridotto. Il colore di fondo — ambra, rame,
 * buio — resta al CSS, che lo tiene anche senza JavaScript.
 */
export function AuroraCompito() {
  const tela = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const c = tela.current
    if (!c) return
    return accendi(c)
  }, [])
  return <span className="task-aurora" aria-hidden="true"><canvas ref={tela} /></span>
}

/** Una riga di luce: dove sta, quanto è larga, e il suo passo. */
type Riga = {
  x: number; w: number
  /** La fase con cui entra nell'onda: due righe vicine non si accendono insieme. */
  fase: number
  /** Il passo del tremolio suo, in radianti al secondo. */
  passo: number
  /** Quanto può accendersi al massimo: certe righe restano sempre in ombra. */
  peso: number
  /** Quanto scende la luce dalla cima, in frazione dell'altezza. */
  base: number
  /** Quanto sale il buio dal fondo, e con che fase. */
  buio: number; faseBuio: number
}

/** Le righe, disposte una volta: sottili quasi sempre, larghe ogni tanto, con spazi irregolari. */
function disponi(larghezza: number): Riga[] {
  const righe: Riga[] = []
  let x = 0
  while (x < larghezza) {
    const w = 1 + Math.random() ** 2 * 12
    righe.push({
      x, w,
      fase: Math.random() * Math.PI * 2,
      passo: .25 + Math.random() * .45,
      peso: .45 + Math.random() * .55,
      base: .35 + Math.random() * .5,
      buio: .25 + Math.random() * .55,
      faseBuio: Math.random() * Math.PI * 2
    })
    x += w + 1 + Math.random() * 5
  }
  return righe
}

/** Quanti fotogrammi al secondo: trenta bastano a un'onda lenta, e costano la metà. */
const PASSO_MS = 1000 / 30

function accendi(tela: HTMLCanvasElement): () => void {
  const ctx = tela.getContext('2d')
  if (!ctx) return () => {}
  const fermo = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  let righe: Riga[] = []
  let W = 0
  let H = 0
  let vivo = true
  let visibile = true
  let raf = 0
  let ultimo = 0

  const misura = () => {
    const r = tela.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    W = Math.max(1, Math.round(r.width))
    H = Math.max(1, Math.round(r.height))
    tela.width = Math.round(W * dpr)
    tela.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    righe = disponi(W)
  }

  const disegna = (tms: number) => {
    raf = 0
    if (!vivo) return
    if (tms - ultimo < PASSO_MS) { chiedi(); return }
    ultimo = tms
    const t = tms / 1000
    ctx.clearRect(0, 0, W, H)
    for (const r of righe) {
      // l'energia che passa: un'onda lunga che viaggia verso destra, sempre
      // nello stesso verso, più il tremolio lento della riga stessa
      const onda = .5 + .5 * Math.sin(r.x * .011 - t * .85 + r.fase * .3)
      const tremolio = .5 + .5 * Math.sin(t * r.passo + r.fase)
      const luce = (.55 * onda + .45 * tremolio) * r.peso
      const giu = H * (r.base + .22 * Math.sin(t * r.passo * .6 + r.fase * 2))
      const g = ctx.createLinearGradient(0, 0, 0, giu)
      // lo strato intero sta al sessanta per cento: qui la luce si scrive
      // piena, o sotto quel velo non si vede più muoversi
      g.addColorStop(0, `rgba(255,228,190,${(.95 * luce).toFixed(3)})`)
      g.addColorStop(.45, `rgba(255,165,95,${(.5 * luce).toFixed(3)})`)
      g.addColorStop(1, 'rgba(255,140,70,0)')
      ctx.fillStyle = g
      ctx.fillRect(r.x, 0, r.w, giu)
      // la striatura scura che sale dal fondo: un'onda più lenta, stesso verso
      const ondaBuia = .5 + .5 * Math.sin(r.x * .008 - t * .5 + r.faseBuio)
      const scuro = (.35 + .65 * ondaBuia) * r.buio
      const su = H * (.28 + .5 * scuro)
      const b = ctx.createLinearGradient(0, H, 0, H - su)
      b.addColorStop(0, `rgba(18,9,5,${(.15 + .85 * scuro).toFixed(3)})`)
      b.addColorStop(1, 'rgba(18,9,5,0)')
      ctx.fillStyle = b
      ctx.fillRect(r.x, H - su, r.w, su)
    }
    // con il moto ridotto resta questo fotogramma: il fuoco fermo
    if (fermo) return
    chiedi()
  }
  const chiedi = () => { if (vivo && visibile && !raf) raf = requestAnimationFrame(disegna) }

  misura()
  chiedi()
  const dimensioni = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { misura(); if (fermo) { ultimo = 0; disegna(performance.now()) } }) : null
  dimensioni?.observe(tela)
  // fuori dallo schermo non si disegna: la riga che lavora può stare in fondo a una pagina lunga
  const vista = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(voci => { visibile = voci.some(v => v.isIntersecting); if (visibile) chiedi() })
    : null
  vista?.observe(tela)

  return () => {
    vivo = false
    if (raf) cancelAnimationFrame(raf)
    dimensioni?.disconnect()
    vista?.disconnect()
  }
}

export function PassoAttivo({ passo }: { passo: PassoCompito }) {
  const testo = passo.passo === 'preparo' ? (loc().startsWith('en') ? 'Preparing your task…' : 'Preparazione…')
    : passo.passo === 'cerco' ? frasi.passoCerco(passo.dettaglio ?? '')
    : passo.passo === 'apro' ? frasi.passoApro(passo.dettaglio ?? '')
      : [t('Scrivo…'), passo.dettaglio].filter(Boolean).join(' ')
  return <div className="task-working-step" role="status" aria-live="polite">{testo}</div>
}
