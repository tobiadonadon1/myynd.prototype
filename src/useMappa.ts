import { useEffect, useRef, type RefObject } from 'react'
import { evidenzaMappa, type Ball } from './brain'
import type { Gruppo } from './data'
import { t } from './lingua'
import { disponiEtichette, nodoAlPunto, separaNodi, type PuntoMappa } from './mappa-layout.ts'

type Vista = { yaw: number; pitch: number; zoom: number; drag: null | { x: number; y: number; yaw: number; pitch: number; moved: number }; t: number }
type Proiezione = PuntoMappa & { pers: number }

export type MappaCtl = { reset: () => void }

/**
 * Disegna la palla di nodi sul canvas attivo (piccolo o a tutto schermo) e
 * gestisce trascinamento, zoom e selezione di un nodo.
 */
export function useMappa(
  cvA: RefObject<HTMLCanvasElement | null>,
  cvB: RefObject<HTMLCanvasElement | null>,
  /**
   * Se la Mappa è davvero sullo schermo. Senza questo il ciclo di disegno
   * girava a 60 fotogrammi al secondo su *ogni* schermata, anche dove nessun
   * canvas era montato: la GPU restava occupata a ridipingere, e i pannelli in
   * backdrop-filter — la colonna di sinistra — tremolavano di conseguenza.
   */
  attivo: boolean,
  mapFull: boolean,
  filtro: string | null,
  sel: string,
  onPick: (sel: string, cluster: string) => void,
  ball: Ball,
  gruppi: Gruppo[]
): MappaCtl {
  const vista = useRef<Vista>({ yaw: 0.5, pitch: -0.18, zoom: 1, drag: null, t: 0 })
  const proj = useRef<Proiezione[] | null>(null)
  const chiave = useRef<string>('')
  const ultimo = useRef<HTMLCanvasElement | null>(null)
  const ultimaPalla = useRef<Ball | null>(null)
  const sopra = useRef<number | null>(null)
  const stato = useRef({ mapFull, filtro, sel, onPick, ball, gruppi })
  stato.current = { mapFull, filtro, sel, onPick, ball, gruppi }

  useEffect(() => {
    // fuori dalla Mappa non c'è niente da disegnare: non si parte nemmeno
    if (!attivo) return
    let raf = 0
    // Gli ascoltatori si attaccavano dietro un flag `__wired` e non si
    // staccavano mai: uscendo e rientrando nella Mappa restavano appesi al
    // canvas vecchio, con dentro la chiusura di un effetto già smontato. Un
    // AbortController li porta via tutti insieme quando l'effetto finisce.
    const basta = new AbortController()

    const pick = (cv: HTMLCanvasElement, e: PointerEvent) => {
      const P = proj.current
      if (!P) return
      const b = cv.getBoundingClientRect()
      const mx = e.clientX - b.left, my = e.clientY - b.top
      const best = nodoAlPunto(P, mx, my)
      if (best) {
        const n = stato.current.ball.nodes[best.i]
        if (n) stato.current.onPick(n.doc ?? n.cluster, n.cluster)
      }
    }

    const collegati = new WeakSet<HTMLCanvasElement>()
    const wire = (cv: HTMLCanvasElement | null) => {
      if (!cv || collegati.has(cv)) return
      collegati.add(cv)
      const v = vista.current
      const su = { signal: basta.signal }
      cv.addEventListener('pointerdown', e => {
        v.drag = { x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch, moved: 0 }
        cv.style.cursor = 'grabbing'
      }, su)
      cv.addEventListener('pointermove', e => {
        if (!v.drag) {
          const b = cv.getBoundingClientRect()
          sopra.current = nodoAlPunto(proj.current ?? [], e.clientX - b.left, e.clientY - b.top)?.i ?? null
          cv.style.cursor = sopra.current === null ? 'grab' : 'pointer'
          return
        }
        const dx = e.clientX - v.drag.x, dy = e.clientY - v.drag.y
        v.drag.moved = Math.max(v.drag.moved, Math.abs(dx) + Math.abs(dy))
        v.yaw = v.drag.yaw + dx * 0.006
        v.pitch = Math.max(-1.2, Math.min(1.2, v.drag.pitch + dy * 0.006))
      }, su)
      cv.addEventListener('pointerup', e => {
        cv.style.cursor = 'grab'
        if (v.drag && v.drag.moved < 5) pick(cv, e)
        v.drag = null
      }, su)
      cv.addEventListener('pointerleave', () => { v.drag = null; sopra.current = null; cv.style.cursor = 'grab' }, su)
      cv.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
        e.preventDefault()
        const { ball: b, filtro: f, sel: s, onPick: scegli } = stato.current
        const candidati = b.nodes.filter(n => n.doc && (!f || n.cluster === f))
        if (!candidati.length) return
        const i = candidati.findIndex(n => n.doc === s), passo = ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1
        const n = candidati[i < 0 ? (passo > 0 ? 0 : candidati.length - 1) : (i + passo + candidati.length) % candidati.length]
        scegli(n.doc!, n.cluster)
      }, su)
      cv.addEventListener('wheel', e => {
        e.preventDefault()
        v.zoom = Math.max(0.6, Math.min(4.2, v.zoom * (e.deltaY > 0 ? 0.92 : 1.09)))
      }, { passive: false, signal: basta.signal })
    }

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const v = vista.current
      v.t += 1
      const cv = stato.current.mapFull ? cvB.current : cvA.current
      if (!cv) return
      // rientrando nella Mappa il canvas è un altro, e nasce vuoto: se non
      // azzero la cache il disegno viene saltato e resta nero
      if (cv !== ultimo.current) { ultimo.current = cv; chiave.current = '' }
      if (stato.current.ball !== ultimaPalla.current) { ultimaPalla.current = stato.current.ball; chiave.current = ''; sopra.current = null }
      wire(cv)
      const w = cv.clientWidth, h = cv.clientHeight
      if (!w || !h) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      const f_ = stato.current.filtro, s_ = stato.current.sel
      const key = [v.yaw.toFixed(3), v.pitch.toFixed(3), v.zoom.toFixed(3), w, h, f_, s_, sopra.current, stato.current.ball.nodes.length].join('|')
      if (key === chiave.current) return
      chiave.current = key

      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const R = Math.min(w, h) * 0.43 * v.zoom, cx = w / 2, cy = h / 2, f = 3.1
      const cy0 = Math.cos(v.yaw), sy0 = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch)

      const BALL = stato.current.ball
      const CLUSTERS = stato.current.gruppi
      if (!BALL.nodes.length) { proj.current = []; ctx.globalAlpha = 1; return }
      let P: Proiezione[] = new Array(BALL.nodes.length)
      BALL.nodes.forEach((n, i) => {
        const x1 = n.x * cy0 + n.z * sy0, z1 = -n.x * sy0 + n.z * cy0
        const y2 = n.y * cp - z1 * sp, z2 = n.y * sp + z1 * cp
        const pers = f / (f - z2)
        const scelto = s_ === n.doc
        P[i] = { x: cx + x1 * R * pers, y: cy + y2 * R * pers, r: Math.max(.8, n.r * pers * v.zoom * .82) + (scelto ? 2 : 0), z: z2, pers, i, scelto }
      })
      P = separaNodi(P, w, h)
      proj.current = P

      const evidenza = evidenzaMappa(BALL, s_, f_)
      const back = new Path2D(), front = new Path2D(), hot = new Path2D()
      BALL.edges.forEach(([a, b], i) => {
        const pa = P[a], pb = P[b]
        if (!pa?.visibile || !pb?.visibile) return
        const isHot = evidenza.archi.has(i)
        const p = isHot ? hot : (pa.z + pb.z) / 2 < 0 ? back : front
        p.moveTo(pa.x, pa.y)
        p.lineTo(pb.x, pb.y)
      })
      ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(206,214,222,.045)'; ctx.stroke(back)
      ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(214,222,230,.1)'; ctx.stroke(front)
      if (evidenza.archi.size) { ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(240,246,252,.34)'; ctx.stroke(hot) }

      const order = P.slice().sort((a, b) => a.z - b.z)
      const COL: Record<string, string> = {}
      CLUSTERS.forEach(c => { COL[c.id] = c.colore })
      order.forEach(p => {
        if (!p.visibile) return
        const n = BALL.nodes[p.i]
        const dim = evidenza.nodi.size > 0 && !evidenza.nodi.has(p.i)
        const isSel = s_ === n.doc
        let a = (0.34 + (0.66 * (p.z + 1)) / 2) * (n.rim ? 0.72 : 1)
        if (dim) a *= 0.18
        ctx.globalAlpha = Math.min(1, a)
        ctx.fillStyle = COL[n.cluster] ?? '#A5AAB0'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, 6.2832)
        ctx.fill()
        if (isSel) {
          ctx.globalAlpha = 1
          ctx.lineWidth = 1.4
          ctx.strokeStyle = 'rgba(255,247,240,.92)'
          ctx.stroke()
        }
      })
      ctx.globalAlpha = 1
      ctx.font = '500 11px "Helvetica Neue", Helvetica, Arial, sans-serif'
      ctx.textAlign = 'left'
      const etichette = CLUSTERS.flatMap(c => {
        const punti = P.filter(p => p.visibile && BALL.nodes[p.i].cluster === c.id)
        if (!punti.length || (f_ && f_ !== c.id)) return []
        const ancora = { x: punti.reduce((a, p) => a + p.x, 0) / punti.length, y: punti.reduce((a, p) => a + p.y, 0) / punti.length }
        const testo = t(c.nome)
        return [{ id: `gruppo:${c.id}`, testo, ancora, w: ctx.measureText(testo).width + 16, h: 23, scelta: false }]
      })
      const evidenziato = P.find(p => p.visibile && p.scelto) ?? P.find(p => p.visibile && p.i === sopra.current)
      if (evidenziato) {
        const n = BALL.nodes[evidenziato.i], titolo = n.titolo ?? ''
        const testo = titolo.length > 38 ? `${titolo.slice(0, 37)}…` : titolo
        if (testo) etichette.unshift({ id: `doc:${n.doc}`, testo, ancora: evidenziato, w: Math.min(w - 30, ctx.measureText(testo).width + 16), h: 23, scelta: true })
      }
      const ostacoli = P.filter(p => p.visibile).map(p => ({ x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 }))
      for (const e of disponiEtichette(etichette, w, h, ostacoli)) {
        ctx.globalAlpha = e.scelta ? 1 : .88
        ctx.strokeStyle = 'rgba(244,239,232,.35)'; ctx.lineWidth = .7
        ctx.beginPath(); ctx.moveTo(e.ancora.x, e.ancora.y); ctx.lineTo(e.x + e.w / 2, e.y + e.h / 2); ctx.stroke()
        ctx.fillStyle = 'rgba(24,21,19,.96)'; ctx.beginPath(); ctx.roundRect(e.x, e.y, e.w, e.h, 6); ctx.fill()
        ctx.fillStyle = '#F4EFE8'; ctx.fillText(e.testo, e.x + 8, e.y + 15, e.w - 16)
      }
      ctx.globalAlpha = 1
    }

    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); basta.abort() }
  }, [cvA, cvB, attivo])

  return {
    reset: () => {
      vista.current.yaw = 0.5
      vista.current.pitch = -0.18
      vista.current.zoom = 1
    }
  }
}
