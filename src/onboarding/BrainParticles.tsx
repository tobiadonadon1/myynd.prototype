import { useEffect, useRef } from 'react'

type Point = { x: number; y: number; z: number; r: number; phase: number; tint: number; ridge: boolean }
type Curve = [number, number, number, number, number, number, number, number]
const CONTOUR = 'M241 351C221 377 179 379 158 353C123 365 92 344 89 313C54 305 45 273 61 246C35 225 40 190 61 173C46 141 67 115 94 110C87 77 119 55 149 60C166 30 202 31 223 47C244 42 253 63 248 89L247 323C249 336 246 345 241 351Z'
const RIDGES: Curve[] = [
  [223,66,185,43,155,76,164,106], [164,106,172,137,211,108,230,131],
  [144,81,108,87,112,126,132,135], [132,135,156,147,139,172,113,164],
  [88,137,64,160,83,187,103,191], [103,191,121,195,117,223,93,231],
  [224,148,192,120,164,150,174,174], [174,174,187,195,222,176,230,207],
  [152,192,127,185,118,215,139,231], [139,231,160,247,188,224,201,242],
  [74,257,92,228,118,251,115,270], [115,270,110,291,141,301,155,279],
  [184,267,165,242,145,253,155,279], [184,267,207,276,230,249,232,279],
  [109,319,138,292,170,314,168,335], [168,335,178,359,218,350,232,329],
  [216,225,242,220,234,185,229,172], [199,310,216,295,240,311,232,329]
]

/** A cortex built from particles and folded paths. No media request or stock globe. */
export function BrainParticles() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = media.matches, frame = 0, width = 0, height = 0, seed = 92831, lastDraw = -Infinity
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    const path = new Path2D(CONTOUR)
    const points: Point[] = []
    const point = (x: number, y: number, mirror: boolean, ridge: boolean) => {
      const xx = mirror ? 510 - x : x
      const radial = Math.max(0, 1 - ((x - 158) / 131) ** 2 - ((y - 203) / 181) ** 2)
      const fold = Math.sin(x * .065 + y * .045) * 7 + Math.sin(y * .077 - x * .032) * 5
      const depth = Math.sqrt(radial) * (ridge ? 108 : (random() < .18 ? -68 : 72 + random() * 30)) + fold
      points.push({ x: xx - 255, y: y - 220, z: depth, r: ridge ? 1.05 + random() * .9 : .9 + random() * 1.5, phase: random() * Math.PI * 2, tint: (xx / 510 * .63 + y / 440 * .37), ridge })
      return points.length - 1
    }
    for (const mirror of [false, true]) {
      let count = 0
      while (count < 1700) {
        const x = 40 + random() * 209, y = 34 + random() * 340
        if (ctx.isPointInPath(path, x, y)) { point(x, y, mirror, false); count++ }
      }
      for (const c of RIDGES) {
        for (let j = 0; j <= 38; j++) {
          const t = j / 38, s = 1 - t
          const x = s ** 3 * c[0] + 3 * s ** 2 * t * c[2] + 3 * s * t ** 2 * c[4] + t ** 3 * c[6]
          const y = s ** 3 * c[1] + 3 * s ** 2 * t * c[3] + 3 * s * t ** 2 * c[5] + t ** 3 * c[7]
          point(x + (random() - .5) * 2.4, y + (random() - .5) * 2.4, mirror, true)
        }
      }
    }
    // Two narrow nerve bundles finish the lower silhouette, without an enclosing sphere.
    for (let j = 0; j < 70; j++) {
      const t = j / 70
      points.push({ x: (j % 2 ? 1 : -1) * (10 - t * 4) + random() * 4, y: 128 + t * 56, z: 8, r: .8 + random(), phase: random() * 6, tint: .82, ridge: true })
    }
    const palette = [[255, 139, 94], [224, 134, 211], [83, 244, 230], [168, 245, 154]]
    const rgb = (t: number) => {
      const f = Math.min(2.999, Math.max(0, t * 3)), a = Math.floor(f), k = f - a
      return palette[a].map((n, i) => Math.round(n * (1 - k) + palette[a + 1][i] * k)).join(',')
    }
    const colors = points.map(p => rgb(p.tint))
    const xs = new Float32Array(points.length), ys = new Float32Array(points.length)
    const draw = (now = 0) => {
      if (!width || !height) return
      // Ambient motion stays at 30 fps even on 120 Hz displays.
      if (!reduced && now - lastDraw < 1000 / 30) {
        if (!document.hidden) frame = requestAnimationFrame(draw)
        return
      }
      lastDraw = now
      const time = reduced ? 0 : now / 1000, scale = Math.min(width / 540, height / 470)
      ctx.clearRect(0, 0, width, height)
      const yaw = reduced ? -.23 : -.23 + Math.sin(time * .19) * .065
      const breath = reduced ? 1 : 1 + Math.sin(time * .42) * .006
      for (let i = 0; i < points.length; i++) {
        const p = points[i], perspective = 1 + p.z / 1050
        xs[i] = width / 2 + (p.x * Math.cos(yaw) + p.z * Math.sin(yaw)) * scale * breath * perspective
        ys[i] = height / 2 + (p.y * .992 - p.z * .115) * scale * breath * perspective
      }
      ctx.globalCompositeOperation = 'screen'
      // Low-density colored light supports the particle volume, with no outlined loops.
      for (const [side, color] of [[-1, '255,133,101'], [1, '91,235,216']] as const) {
        const cx = width / 2 + side * 76 * scale, cy = height / 2 - 24 * scale
        const halo = ctx.createRadialGradient(cx, cy, 12 * scale, cx, cy, 173 * scale)
        halo.addColorStop(0, `rgba(${color},.07)`); halo.addColorStop(1, `rgba(${color},0)`)
        ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height)
      }
      for (let i = 0; i < points.length; i++) {
        const p = points[i], x = xs[i], y = ys[i]
        const wave = reduced ? .7 : .64 + Math.sin(time * .75 + p.phase + p.y * .01) * .23
        const alpha = Math.min(.98, p.ridge ? .52 + wave * .37 : .40 + Math.max(0, p.z) / 240 + wave * .22) * (p.z < 0 ? .48 : 1)
        const radius = p.r * scale * (p.z < 0 ? .72 : 1 + p.z / 460)
        if (i % 29 === 0 && p.z > 20) { ctx.beginPath(); ctx.arc(x, y, radius * 2.8, 0, Math.PI * 2); ctx.fillStyle = `rgba(${colors[i]},.10)`; ctx.fill() }
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = `rgba(${colors[i]},${alpha})`; ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      if (!reduced && !document.hidden) frame = requestAnimationFrame(draw)
    }
    const resize = () => {
      const r = canvas.getBoundingClientRect(); width = r.width; height = r.height
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cancelAnimationFrame(frame); lastDraw = -Infinity; draw(performance.now())
    }
    const motion = () => { reduced = media.matches; cancelAnimationFrame(frame); lastDraw = -Infinity; draw(performance.now()) }
    const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden) { lastDraw = -Infinity; draw(performance.now()) } }
    const observer = new ResizeObserver(resize); observer.observe(canvas)
    media.addEventListener('change', motion); document.addEventListener('visibilitychange', visibility)
    resize()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  return <canvas className="onboard-brain" ref={ref} aria-hidden="true" />
}
