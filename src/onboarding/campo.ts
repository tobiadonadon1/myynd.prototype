// Il campo dell'onboarding: una sfera di energia nei nostri colori.
//
// Il fondo non è nero pieno — è attraversato da lavate di terracotta e salvia
// che respirano. Al centro un orbe che si accende man mano che colleghi le
// fonti: da bagliore appena percettibile a sfera piena, con la grana sopra.
// Le particelle ci orbitano dentro e il cursore le scosta.

type Particella = {
  x: number; y: number
  vx: number; vy: number
  ax: number; ay: number; az: number   // punto di riposo sulla sfera unitaria
  sx: number; sy: number               // punto di riposo quando sono sparse
  r: number
  c: number
  fase: number
}

export type Opzioni = {
  coesione: number
  colori: string[]
  quantita: number
  legami: boolean
}

// La nostra tavolozza, dal cuore caldo al bordo verde. Le fasce restano
// sature fin quasi al bordo: è quello che rende l'orbe energia e non foschia.
const ORBE: [number, string, number][] = [
  [0.00, '255,244,222', 0.99],
  [0.10, '250,206,132', 0.98],
  [0.26, '238,146,74',  0.97],
  [0.44, '212,100,54',  0.95],
  [0.62, '176,80,42',   0.88],
  [0.78, '134,116,72',  0.62],
  [0.90, '96,126,100',  0.32],
  [1.00, '92,118,96',   0.00]
]

const PREDEFINITE: Opzioni = { coesione: 0, colori: ['#D8A46E'], quantita: 520, legami: false }

export class Campo {
  private cv: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private grana: HTMLCanvasElement | null = null
  private p: Particella[] = []
  private raf = 0
  private t = 0
  private mouse = { x: -9999, y: -9999, dentro: false }
  private opt: Opzioni = { ...PREDEFINITE }
  private obiettivo = 0
  private w = 0
  private h = 0
  private dpr = 1
  private seme = 1

  private rnd() {
    this.seme = (this.seme * 1103515245 + 12345) & 0x7fffffff
    return this.seme / 0x7fffffff
  }

  monta(cv: HTMLCanvasElement) {
    this.cv = cv
    this.ctx = cv.getContext('2d')
    this.misura()
    this.genera()
    this.creaGrana()
    cv.addEventListener('pointermove', this.muovi)
    cv.addEventListener('pointerleave', this.esci)
    window.addEventListener('resize', this.misura)
    this.raf = requestAnimationFrame(this.disegna)
  }

  smonta() {
    cancelAnimationFrame(this.raf)
    this.cv?.removeEventListener('pointermove', this.muovi)
    this.cv?.removeEventListener('pointerleave', this.esci)
    window.removeEventListener('resize', this.misura)
    this.cv = null
  }

  imposta(o: Partial<Opzioni>) {
    const prima = this.opt.quantita
    this.opt = { ...this.opt, ...o }
    if (this.opt.quantita !== prima) this.genera()
  }

  private muovi = (e: PointerEvent) => {
    const b = this.cv!.getBoundingClientRect()
    this.mouse.x = e.clientX - b.left
    this.mouse.y = e.clientY - b.top
    this.mouse.dentro = true
  }

  private esci = () => { this.mouse.dentro = false }

  private misura = () => {
    if (!this.cv) return
    this.w = this.cv.clientWidth
    this.h = this.cv.clientHeight
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.cv.width = Math.round(this.w * this.dpr)
    this.cv.height = Math.round(this.h * this.dpr)
  }

  /** Una piastrella di rumore, disegnata una volta e poi ripetuta. */
  private creaGrana() {
    const L = 180
    const g = document.createElement('canvas')
    g.width = L
    g.height = L
    const c = g.getContext('2d')!
    const img = c.createImageData(L, L)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.floor(this.rnd() * 135)
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    c.putImageData(img, 0, 0)
    this.grana = g
  }

  private genera() {
    this.seme = 20260805
    this.p = []
    for (let i = 0; i < this.opt.quantita; i++) {
      const u = this.rnd() * 2 - 1
      const th = this.rnd() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      const rad = 0.5 + Math.pow(this.rnd(), 0.5) * 0.5
      this.p.push({
        x: this.rnd() * this.w,
        y: this.rnd() * this.h,
        vx: 0, vy: 0,
        ax: Math.cos(th) * s * rad,
        ay: u * rad,
        az: Math.sin(th) * s * rad,
        sx: this.rnd(),
        sy: this.rnd(),
        r: 0.6 + Math.pow(this.rnd(), 2.2) * 2.4,
        c: Math.floor(this.rnd() * 999),
        fase: this.rnd() * Math.PI * 2
      })
    }
  }

  /** Le lavate sul fondo: accenti ai bordi, non un'inondazione. */
  private fondo(ctx: CanvasRenderingContext2D) {
    const lavate: [number, number, number, string, number][] = [
      [0.06, 0.06, 0.52, '196,98,59', 0.30],
      [0.96, 0.14, 0.46, '216,164,110', 0.22],
      [0.04, 0.96, 0.54, '92,118,96', 0.28],
      [0.92, 0.94, 0.48, '163,78,45', 0.24]
    ]
    const D = Math.max(this.w, this.h)
    lavate.forEach(([fx, fy, r, rgb, a], i) => {
      const x = fx * this.w + Math.sin(this.t * (0.5 + i * 0.13)) * this.w * 0.04
      const y = fy * this.h + Math.cos(this.t * (0.4 + i * 0.11)) * this.h * 0.04
      const g = ctx.createRadialGradient(x, y, 0, x, y, D * r)
      const alpha = a * (0.7 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * (0.6 + i * 0.2))))
      g.addColorStop(0, `rgba(${rgb},${alpha})`)
      g.addColorStop(0.5, `rgba(${rgb},${alpha * 0.3})`)
      g.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, this.w, this.h)
    })
  }

  /** L'orbe. Le fasce di colore si disegnano piene (source-over) e solo il
   *  nucleo riceve un po' di bloom: così resta energia satura, non foschia. */
  private orbe(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, k: number) {
    if (k < 0.02) return
    const pulsa = 1 + Math.sin(this.t * 1.6) * 0.03
    const forza = Math.pow(k, 0.7)
    const raggio = R * 1.32 * pulsa

    // il nucleo è decentrato: la luce vera non è mai simmetrica
    const ox = cx - R * 0.13 + Math.sin(this.t * 0.9) * R * 0.03
    const oy = cy - R * 0.15 + Math.cos(this.t * 0.7) * R * 0.03

    const g = ctx.createRadialGradient(ox, oy, 0, cx, cy, raggio)
    ORBE.forEach(([stop, rgb, a]) => g.addColorStop(stop, `rgba(${rgb},${(a * forza).toFixed(3)})`))
    ctx.globalAlpha = 1
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, raggio, 0, 6.2832)
    ctx.fill()

    // macchie interne: rompono la simmetria del gradiente
    const macchia = (dx: number, dy: number, r: number, rgb: string, a: number, f: number) => {
      const x = cx + dx * R + Math.sin(this.t * f) * R * 0.07
      const y = cy + dy * R + Math.cos(this.t * f * 0.8) * R * 0.07
      const gg = ctx.createRadialGradient(x, y, 0, x, y, R * r)
      gg.addColorStop(0, `rgba(${rgb},${a * forza})`)
      gg.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = gg
      ctx.fillRect(cx - raggio, cy - raggio, raggio * 2, raggio * 2)
    }
    macchia(-0.30, 0.26, 0.62, '224,120,66', 0.42, 1.1)
    macchia(0.30, -0.24, 0.52, '246,206,140', 0.40, 0.8)
    macchia(0.12, 0.42, 0.48, '110,142,114', 0.30, 0.95)

    // bloom solo attorno al cuore
    ctx.globalCompositeOperation = 'lighter'
    const b = ctx.createRadialGradient(ox, oy, 0, ox, oy, R * 0.75)
    b.addColorStop(0, `rgba(255,236,198,${0.34 * forza})`)
    b.addColorStop(1, 'rgba(255,236,198,0)')
    ctx.fillStyle = b
    ctx.fillRect(0, 0, this.w, this.h)
    ctx.globalCompositeOperation = 'source-over'
  }

  private disegna = () => {
    this.raf = requestAnimationFrame(this.disegna)
    const ctx = this.ctx
    if (!ctx || !this.w || !this.h) return

    this.t += 0.0045
    this.obiettivo += (this.opt.coesione - this.obiettivo) * 0.045
    const k = this.obiettivo

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)

    // fondo caldo, mai nero pieno
    ctx.fillStyle = '#17140F'
    ctx.fillRect(0, 0, this.w, this.h)
    this.fondo(ctx)

    const cx = this.w / 2
    const cy = this.h / 2
    const R = Math.min(this.w, this.h) * 0.30

    this.orbe(ctx, cx, cy, R, k)

    const yaw = this.t * 0.9
    const cyw = Math.cos(yaw), syw = Math.sin(yaw)
    const cp = Math.cos(-0.2), sp = Math.sin(-0.2)
    const colori = this.opt.colori.length ? this.opt.colori : PREDEFINITE.colori
    const vicini: { x: number; y: number }[] = []

    ctx.globalCompositeOperation = 'lighter'
    for (const q of this.p) {
      const x1 = q.ax * cyw + q.az * syw
      const z1 = -q.ax * syw + q.az * cyw
      const y2 = q.ay * cp - z1 * sp
      const z2 = q.ay * sp + z1 * cp
      const pers = 2.6 / (2.6 - z2)

      const sferaX = cx + x1 * R * pers
      const sferaY = cy + y2 * R * pers
      const sparseX = q.sx * this.w + Math.sin(this.t * 1.7 + q.fase) * 26
      const sparseY = q.sy * this.h + Math.cos(this.t * 1.3 + q.fase) * 26

      const tx = sparseX + (sferaX - sparseX) * k
      const ty = sparseY + (sferaY - sparseY) * k

      let fx = (tx - q.x) * 0.026
      let fy = (ty - q.y) * 0.026

      if (this.mouse.dentro) {
        const dx = q.x - this.mouse.x
        const dy = q.y - this.mouse.y
        const d2 = dx * dx + dy * dy
        const RAGGIO = 138
        if (d2 < RAGGIO * RAGGIO && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const forza = (1 - d / RAGGIO) ** 2 * 3.2
          fx += (dx / d) * forza
          fy += (dy / d) * forza
        }
      }

      q.vx = (q.vx + fx) * 0.86
      q.vy = (q.vy + fy) * 0.86
      q.x += q.vx
      q.y += q.vy

      const profondita = k > 0.25 ? (z2 + 1) / 2 : 0.7
      // dentro l'orbe le particelle si schiariscono invece di sparire
      const alpha = (0.22 + 0.6 * profondita) * (0.5 + 0.5 * k)
      ctx.globalAlpha = Math.min(1, alpha)
      ctx.fillStyle = colori[q.c % colori.length]
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.r * (k > 0.25 ? 0.6 + pers * 0.5 : 1), 0, 6.2832)
      ctx.fill()

      if (this.opt.legami && vicini.length < 180 && q.r > 1.8) vicini.push({ x: q.x, y: q.y })
    }
    ctx.globalCompositeOperation = 'source-over'

    if (this.opt.legami && k > 0.35) {
      ctx.lineWidth = 0.55
      ctx.globalAlpha = (k - 0.35) * 0.42
      ctx.strokeStyle = 'rgba(255,226,190,.5)'
      ctx.beginPath()
      for (let i = 0; i < vicini.length; i++) {
        for (let j = i + 1; j < vicini.length; j++) {
          const a = vicini[i], b = vicini[j]
          const dx = a.x - b.x, dy = a.y - b.y
          if (dx * dx + dy * dy < 5200) {
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
          }
        }
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // la grana sopra a tutto: è quella che rende la luce "stampata"
    if (this.grana) {
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = 0.07
      const L = this.grana.width
      const off = (Math.floor(this.t * 60) % 3) * 7
      for (let x = -off; x < this.w; x += L) {
        for (let y = -off; y < this.h; y += L) ctx.drawImage(this.grana, x, y)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
  }
}
