import { useEffect, useRef, type RefObject } from 'react'
import { BALL } from './brain'
import { CLUSTERS } from './data'

type Vista = { yaw: number; pitch: number; zoom: number; drag: null | { x: number; y: number; yaw: number; pitch: number; moved: number }; t: number }
type Proiezione = { x: number; y: number; r: number; z: number; pers: number; i: number }

export type MappaCtl = { reset: () => void }

/**
 * Disegna la palla di nodi sul canvas attivo (piccolo o a tutto schermo) e
 * gestisce trascinamento, zoom e selezione di un nodo.
 */
export function useMappa(
  cvA: RefObject<HTMLCanvasElement | null>,
  cvB: RefObject<HTMLCanvasElement | null>,
  mapFull: boolean,
  filtro: string | null,
  sel: string,
  onPick: (sel: string, cluster: string) => void
): MappaCtl {
  const vista = useRef<Vista>({ yaw: 0.5, pitch: -0.18, zoom: 1, drag: null, t: 0 })
  const proj = useRef<Proiezione[] | null>(null)
  const chiave = useRef<string>('')
  const stato = useRef({ mapFull, filtro, sel, onPick })
  stato.current = { mapFull, filtro, sel, onPick }

  useEffect(() => {
    let raf = 0

    const pick = (cv: HTMLCanvasElement, e: PointerEvent) => {
      const P = proj.current
      if (!P) return
      const b = cv.getBoundingClientRect()
      const mx = e.clientX - b.left, my = e.clientY - b.top
      let best: Proiezione | null = null, bd = 400
      P.forEach(p => {
        const d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my)
        if (d < bd && d < Math.max(64, p.r * p.r * 9)) { bd = d; best = p }
      })
      if (best) {
        const n = BALL.nodes[(best as Proiezione).i]
        stato.current.onPick(n.name ? n.cluster + '|' + n.name : n.cluster, n.cluster)
      }
    }

    const wire = (cv: HTMLCanvasElement | null) => {
      if (!cv || (cv as HTMLCanvasElement & { __wired?: boolean }).__wired) return
      ;(cv as HTMLCanvasElement & { __wired?: boolean }).__wired = true
      const v = vista.current
      cv.addEventListener('pointerdown', e => {
        v.drag = { x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch, moved: 0 }
        cv.style.cursor = 'grabbing'
      })
      cv.addEventListener('pointermove', e => {
        if (!v.drag) return
        const dx = e.clientX - v.drag.x, dy = e.clientY - v.drag.y
        v.drag.moved = Math.max(v.drag.moved, Math.abs(dx) + Math.abs(dy))
        v.yaw = v.drag.yaw + dx * 0.006
        v.pitch = Math.max(-1.2, Math.min(1.2, v.drag.pitch + dy * 0.006))
      })
      cv.addEventListener('pointerup', e => {
        cv.style.cursor = 'grab'
        if (v.drag && v.drag.moved < 5) pick(cv, e)
        v.drag = null
      })
      cv.addEventListener('pointerleave', () => { v.drag = null; cv.style.cursor = 'grab' })
      cv.addEventListener('wheel', e => {
        e.preventDefault()
        v.zoom = Math.max(0.6, Math.min(4.2, v.zoom * (e.deltaY > 0 ? 0.92 : 1.09)))
      }, { passive: false })
    }

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const v = vista.current
      v.t += 1
      const cv = stato.current.mapFull ? cvB.current : cvA.current
      if (!cv) return
      wire(cv)
      const w = cv.clientWidth, h = cv.clientHeight
      if (!w || !h) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      const f_ = stato.current.filtro, s_ = stato.current.sel
      const key = [v.yaw.toFixed(3), v.pitch.toFixed(3), v.zoom.toFixed(3), w, h, f_, s_].join('|')
      if (key === chiave.current) return
      chiave.current = key

      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const R = Math.min(w, h) * 0.43 * v.zoom, cx = w / 2, cy = h / 2, f = 3.1
      const cy0 = Math.cos(v.yaw), sy0 = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch)
      const selName = s_.includes('|') ? s_.split('|')[1] : null

      const P: Proiezione[] = new Array(BALL.nodes.length)
      BALL.nodes.forEach((n, i) => {
        const x1 = n.x * cy0 + n.z * sy0, z1 = -n.x * sy0 + n.z * cy0
        const y2 = n.y * cp - z1 * sp, z2 = n.y * sp + z1 * cp
        const pers = f / (f - z2)
        P[i] = { x: cx + x1 * R * pers, y: cy + y2 * R * pers, r: Math.max(0.5, n.r * pers * v.zoom * 0.82), z: z2, pers, i }
      })
      proj.current = P

      const back = new Path2D(), front = new Path2D(), hot = new Path2D()
      BALL.edges.forEach(([a, b]) => {
        const pa = P[a], pb = P[b]
        if (!pa || !pb) return
        const isHot = f_ && (BALL.nodes[a].cluster === f_ || BALL.nodes[b].cluster === f_)
        const p = isHot ? hot : (pa.z + pb.z) / 2 < 0 ? back : front
        p.moveTo(pa.x, pa.y)
        p.lineTo(pb.x, pb.y)
      })
      ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(206,214,222,.045)'; ctx.stroke(back)
      ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(214,222,230,.1)'; ctx.stroke(front)
      if (f_) { ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(240,246,252,.34)'; ctx.stroke(hot) }

      const order = P.slice().sort((a, b) => a.z - b.z)
      const COL: Record<string, string> = {}
      CLUSTERS.forEach(c => { COL[c.id] = c.colore })
      order.forEach(p => {
        const n = BALL.nodes[p.i]
        const dim = f_ && f_ !== n.cluster
        const isSel = (!selName && s_ === n.cluster && n.hub) || (selName && n.name === selName)
        let a = (0.34 + (0.66 * (p.z + 1)) / 2) * (n.rim ? 0.72 : 1)
        if (dim) a *= 0.18
        ctx.globalAlpha = Math.min(1, a)
        ctx.fillStyle = COL[n.cluster]
        ctx.beginPath()
        ctx.arc(p.x, p.y, isSel ? p.r + 2.4 : p.r, 0, 6.2832)
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
      ctx.textAlign = 'center'
      BALL.nodes.forEach((n, i) => {
        if (!n.hub) return
        const c = CLUSTERS.find(x => x.id === n.cluster)!
        const p = P[i]
        ctx.globalAlpha = f_ && f_ !== n.cluster ? 0.22 : 0.35 + (0.55 * (p.z + 1)) / 2
        ctx.fillStyle = 'rgba(255,247,240,.9)'
        ctx.fillText(c.nome, p.x, p.y - p.r - 7)
      })
      ctx.globalAlpha = 1
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [cvA, cvB])

  return {
    reset: () => {
      vista.current.yaw = 0.5
      vista.current.pitch = -0.18
      vista.current.zoom = 1
    }
  }
}
