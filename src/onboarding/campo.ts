// Il campo di particelle dell'onboarding.
//
// All'inizio sono sparse e senza forma. Man mano che colleghi le fonti la
// coesione sale e si raccolgono in una sfera: la mente che prende forma.
// Il cursore le sposta — è la cosa che rende chiaro che sono vive.

type Particella = {
  x: number; y: number          // posizione sullo schermo
  vx: number; vy: number        // velocità
  ax: number; ay: number; az: number  // punto di riposo sulla sfera unitaria
  sx: number; sy: number        // punto di riposo quando sono sparse
  r: number
  c: number                     // indice del colore
  fase: number                  // sfasamento del respiro
}

export type Opzioni = {
  coesione: number              // 0 sparse · 1 sfera
  colori: string[]
  quantita: number
  legami: boolean
}

const PREDEFINITE: Opzioni = { coesione: 0, colori: ['#C4623B'], quantita: 520, legami: false }

export class Campo {
  private cv: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private p: Particella[] = []
  private raf = 0
  private t = 0
  private mouse = { x: -9999, y: -9999, dentro: false }
  private opt: Opzioni = { ...PREDEFINITE }
  private obiettivo = 0                 // coesione inseguita dolcemente
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
    const primaQuantita = this.opt.quantita
    this.opt = { ...this.opt, ...o }
    if (this.opt.quantita !== primaQuantita) this.genera()
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

  private genera() {
    this.seme = 20260805
    const n = this.opt.quantita
    this.p = []
    for (let i = 0; i < n; i++) {
      // punto uniforme sulla sfera
      const u = this.rnd() * 2 - 1
      const th = this.rnd() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      const rad = 0.55 + Math.pow(this.rnd(), 0.4) * 0.45
      this.p.push({
        x: this.rnd() * this.w,
        y: this.rnd() * this.h,
        vx: 0, vy: 0,
        ax: Math.cos(th) * s * rad,
        ay: u * rad,
        az: Math.sin(th) * s * rad,
        sx: this.rnd(),
        sy: this.rnd(),
        r: 0.7 + Math.pow(this.rnd(), 2) * 2.6,
        c: Math.floor(this.rnd() * 999),
        fase: this.rnd() * Math.PI * 2
      })
    }
  }

  private disegna = () => {
    this.raf = requestAnimationFrame(this.disegna)
    const ctx = this.ctx
    if (!ctx || !this.w || !this.h) return

    this.t += 0.0045
    // la coesione insegue il valore richiesto: il passaggio si vede
    this.obiettivo += (this.opt.coesione - this.obiettivo) * 0.045
    const k = this.obiettivo

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)

    const cx = this.w / 2
    const cy = this.h / 2
    const R = Math.min(this.w, this.h) * 0.34
    const yaw = this.t * 0.9
    const cyw = Math.cos(yaw), syw = Math.sin(yaw)
    const pitch = -0.2
    const cp = Math.cos(pitch), sp = Math.sin(pitch)
    const colori = this.opt.colori.length ? this.opt.colori : PREDEFINITE.colori

    const vicini: { x: number; y: number; z: number }[] = []

    for (const q of this.p) {
      // dove vorrebbe stare: sparso oppure sulla sfera, secondo la coesione
      const x1 = q.ax * cyw + q.az * syw
      const z1 = -q.ax * syw + q.az * cyw
      const y2 = q.ay * cp - z1 * sp
      const z2 = q.ay * sp + z1 * cp
      const pers = 2.6 / (2.6 - z2)

      const sferaX = cx + x1 * R * pers
      const sferaY = cy + y2 * R * pers

      // da sparse: deriva lenta, così anche il caos respira
      const sparseX = q.sx * this.w + Math.sin(this.t * 1.7 + q.fase) * 26
      const sparseY = q.sy * this.h + Math.cos(this.t * 1.3 + q.fase) * 26

      const tx = sparseX + (sferaX - sparseX) * k
      const ty = sparseY + (sferaY - sparseY) * k

      // molla verso il punto di riposo
      let fx = (tx - q.x) * 0.026
      let fy = (ty - q.y) * 0.026

      // il cursore le scosta
      if (this.mouse.dentro) {
        const dx = q.x - this.mouse.x
        const dy = q.y - this.mouse.y
        const d2 = dx * dx + dy * dy
        const RAGGIO = 132
        if (d2 < RAGGIO * RAGGIO && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const forza = (1 - d / RAGGIO) ** 2 * 2.9
          fx += (dx / d) * forza
          fy += (dy / d) * forza
        }
      }

      q.vx = (q.vx + fx) * 0.86
      q.vy = (q.vy + fy) * 0.86
      q.x += q.vx
      q.y += q.vy

      const profondita = k > 0.25 ? (z2 + 1) / 2 : 0.7
      const alpha = (0.2 + 0.72 * profondita) * (0.55 + 0.45 * k)
      const raggio = q.r * (k > 0.25 ? 0.6 + pers * 0.5 : 1)

      ctx.globalAlpha = Math.min(1, alpha)
      ctx.fillStyle = colori[q.c % colori.length]
      ctx.beginPath()
      ctx.arc(q.x, q.y, raggio, 0, 6.2832)
      ctx.fill()

      if (this.opt.legami && vicini.length < 190 && q.r > 1.9) {
        vicini.push({ x: q.x, y: q.y, z: profondita })
      }
    }

    // i legami compaiono solo quando la mente si è formata
    if (this.opt.legami && k > 0.35) {
      ctx.lineWidth = 0.55
      ctx.globalAlpha = (k - 0.35) * 0.5
      ctx.strokeStyle = 'rgba(120,100,84,.5)'
      ctx.beginPath()
      for (let i = 0; i < vicini.length; i++) {
        for (let j = i + 1; j < vicini.length; j++) {
          const a = vicini[i], b = vicini[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < 5200) {
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
          }
        }
      }
      ctx.stroke()
    }

    ctx.globalAlpha = 1
  }
}
