/** Screen-space spacing only: the underlying 3D graph and its shape stay intact. */
export type PuntoMappa = { x: number; y: number; r: number; z: number; i: number; scelto?: boolean; visibile?: boolean }
export type Rettangolo = { x: number; y: number; w: number; h: number }
export type EtichettaMappa = Rettangolo & { id: string; testo: string; ancora: { x: number; y: number }; scelta?: boolean }

const urtano = (a: Rettangolo, b: Rettangolo, spazio = 4) =>
  a.x < b.x + b.w + spazio && a.x + a.w + spazio > b.x && a.y < b.y + b.h + spazio && a.y + a.h + spazio > b.y

/** Keep a clear gap between visible circles; nearest free positions are tried first. */
export function separaNodi<T extends PuntoMappa>(punti: T[], w: number, h: number): (T & { visibile: boolean })[] {
  const posti = new Map<string, T[]>()
  const out = punti.map(p => ({ ...p, visibile: false }))
  const cella = 16, spazio = 1.3
  const maxR = punti.reduce((r, p) => Math.max(r, p.r), 0)
  const libero = (p: T, x: number, y: number) => {
    if (x < p.r + 8 || x > w - p.r - 8 || y < p.r + 8 || y > h - p.r - 8) return false
    const gx = Math.floor(x / cella), gy = Math.floor(y / cella)
    const r = p.r
    const celle = Math.ceil((r + maxR + spazio) / cella)
    for (let dx = -celle; dx <= celle; dx++) for (let dy = -celle; dy <= celle; dy++) {
      const gruppo = posti.get(`${gx + dx}:${gy + dy}`)
      if (!gruppo) continue
      for (const q of gruppo) {
        const distanza = p.r + q.r + spazio, qx = q.x - x, qy = q.y - y
        if (qx * qx + qy * qy < distanza * distanza) return false
      }
    }
    return true
  }
  const ordine = out.slice().sort((a, b) => Number(!!b.scelto) - Number(!!a.scelto) || b.z - a.z || b.r - a.r || a.i - b.i)
  for (const p of ordine) {
    // Zoom crops the sphere. Do not pull off-screen material back onto the canvas.
    if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue
    const x = p.x, y = p.y
    let trovato = libero(p, x, y)
    // At large scale, cap local search rather than blocking rotation to pack
    // every far-side glyph. All documents remain selectable from the list.
    const maxAnelli = punti.length > 700 ? 5 : 12
    for (let anello = 1; !trovato && anello <= maxAnelli; anello++) {
      const distanza = anello * 3, passi = Math.max(8, anello * 7)
      for (let k = 0; k < passi; k++) {
        const angolo = k * Math.PI * 2 / passi + (p.i % 7) * .17
        const nx = x + Math.cos(angolo) * distanza, ny = y + Math.sin(angolo) * distanza
        if (!libero(p, nx, ny)) continue
        p.x = nx; p.y = ny; trovato = true; break
      }
    }
    if (!trovato) continue
    p.visibile = true
    const key = `${Math.floor(p.x / cella)}:${Math.floor(p.y / cella)}`
    const gruppo = posti.get(key)
    if (gruppo) gruppo.push(p); else posti.set(key, [p])
  }
  return out
}

/** One collision-free label per group, plus the selected/hovered document. */
export function disponiEtichette(
  etichette: Omit<EtichettaMappa, 'x' | 'y'>[], w: number, h: number, ostacoli: Rettangolo[] = []
): EtichettaMappa[] {
  const messe: EtichettaMappa[] = []
  for (const e of etichette.slice().sort((a, b) => Number(!!b.scelta) - Number(!!a.scelta))) {
    if (messe.some(m => m.id === e.id)) continue
    let posto: EtichettaMappa | null = null
    for (let anello = 0; !posto && anello < 15; anello++) {
      const d = 12 + anello * 12
      const candidati = [
        { x: e.ancora.x - e.w / 2, y: e.ancora.y - d - e.h },
        { x: e.ancora.x + d, y: e.ancora.y - e.h / 2 },
        { x: e.ancora.x - d - e.w, y: e.ancora.y - e.h / 2 },
        { x: e.ancora.x - e.w / 2, y: e.ancora.y + d }
      ]
      for (const c of candidati) {
        const r = { ...e, ...c }
        if (r.x < 12 || r.y < 48 || r.x + r.w > w - 12 || r.y + r.h > h - 66) continue
        if ([...ostacoli, ...messe].some(o => urtano(r, o))) continue
        posto = r; break
      }
    }
    if (posto) messe.push(posto)
  }
  return messe
}

/** Picking uses the same separated, visible geometry that was actually drawn. */
export function nodoAlPunto<T extends PuntoMappa>(punti: T[], x: number, y: number): T | null {
  let migliore: T | null = null, distanza = Infinity
  for (const p of punti) {
    if (p.visibile === false) continue
    const d = Math.hypot(p.x - x, p.y - y)
    if (d <= Math.max(7, p.r + 4) && (d < distanza || (d === distanza && p.z > (migliore?.z ?? -Infinity)))) {
      migliore = p; distanza = d
    }
  }
  return migliore
}
