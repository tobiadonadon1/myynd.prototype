// La palla di nodi della Mappa, costruita sui gruppi veri: un nodo per
// documento indicizzato (con un tetto, per non affogare il canvas).
// Seme fisso: a parità di dati la forma non cambia fra un avvio e l'altro.

import type { Gruppo } from './data'

export type Nodo = {
  cluster: string
  x: number
  y: number
  z: number
  r: number
  hub?: boolean
  rim?: boolean
}

export type Ball = { nodes: Nodo[]; edges: [number, number][] }

const MAX_NODI = 2600

function prng(seed: number) {
  let x = seed
  return () => {
    // Math.imul tiene la moltiplicazione a 32 bit: senza, si supera 2^53,
    // i bit bassi si perdono e la sequenza si ripete dopo poche migliaia
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 4294967296
  }
}

export function costruisci(gruppi: Gruppo[]): Ball {
  const nodes: Nodo[] = []
  const edges: [number, number][] = []
  if (!gruppi.length) return { nodes, edges }

  const rnd = prng(90210)
  const gauss = () => {
    let u = 0, v = 0
    while (u === 0) u = rnd()
    while (v === 0) v = rnd()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const dir = (): [number, number, number] => {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u)
    return [Math.cos(th) * s, u, Math.sin(th) * s]
  }
  const shell = (v: [number, number, number], rad: number): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [(v[0] / l) * rad, (v[1] / l) * rad, (v[2] / l) * rad]
  }

  const totale = gruppi.reduce((t, g) => t + g.nodi, 0) || 1
  const scala = Math.min(1, MAX_NODI / totale)

  gruppi.forEach(g => {
    // ogni gruppo ha il suo grumo, in un punto stabile della sfera
    const d = dir()
    const centro = shell(d, 0.45 + rnd() * 0.4)
    nodes.push({ cluster: g.id, x: centro[0], y: centro[1], z: centro[2], r: 4.6, hub: true })
    const hub = nodes.length - 1

    const quanti = Math.max(6, Math.round(g.nodi * scala))
    const sigma = 0.13 + Math.min(0.14, quanti / 4000)
    for (let i = 0; i < quanti; i++) {
      const s = sigma * (1 + Math.abs(gauss()) * 0.5)
      let x = centro[0] + gauss() * s
      let y = centro[1] + gauss() * s
      let z = centro[2] + gauss() * s
      const l = Math.hypot(x, y, z)
      if (l > 1.04) { x = (x / l) * 1.04; y = (y / l) * 1.04; z = (z / l) * 1.04 }
      const bordo = rnd() > 0.86
      nodes.push({
        cluster: g.id, x, y: y * 0.97, z,
        r: bordo ? 0.7 + rnd() * 0.5 : 0.85 + rnd() * 1.3,
        rim: bordo
      })
      const mio = nodes.length - 1
      // ogni nodo si aggancia al proprio hub o a un fratello vicino
      if (rnd() > 0.55) {
        edges.push([mio, hub])
      } else if (mio - hub > 2) {
        edges.push([mio, hub + 1 + Math.floor(rnd() * (mio - hub - 1))])
      }
    }
  })

  // qualche ponte fra gruppi diversi: le fonti non vivono separate
  const N = nodes.length
  if (N > 4) {
    for (let k = 0; k < Math.min(120, N / 8); k++) {
      const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N)
      if (nodes[i].cluster !== nodes[j].cluster) edges.push([i, j])
    }
  }

  return { nodes, edges }
}
