// La palla di nodi della Mappa. Generata una volta sola, con un PRNG a seme
// fisso: la forma del cervello deve essere identica a ogni avvio.

import { CLUSTERS, NAMES } from './data'

export type Nodo = {
  cluster: string
  x: number
  y: number
  z: number
  r: number
  hub?: boolean
  rim?: boolean
  name?: string
}

export type Ball = { nodes: Nodo[]; edges: [number, number][] }

function prng(seed: number) {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x / 0x7fffffff
  }
}

function buildBall(): Ball {
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
  const W = [0.58, 0.12, 0.07, 0.16, 0.07]
  const pickCluster = () => {
    let r = rnd(), acc = 0
    for (let i = 0; i < W.length; i++) {
      acc += W[i]
      if (r <= acc) return i
    }
    return 0
  }
  const nodes: Nodo[] = []
  const push = (x: number, y: number, z: number, r: number, ci: number, extra?: Partial<Nodo> | null) => {
    const n: Nodo = { cluster: CLUSTERS[ci].id, x, y, z, r }
    if (extra) Object.assign(n, extra)
    nodes.push(n)
    return nodes.length - 1
  }
  const shell = (v: [number, number, number], rad: number): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [(v[0] / l) * rad, (v[1] / l) * rad, (v[2] / l) * rad]
  }

  // grappoli organici di dimensione diversa, sparsi nel volume
  const seeds: { p: [number, number, number]; ci: number; sigma: number; count: number; i: number }[] = []
  CLUSTERS.forEach((_c, ci) => {
    const d = dir(), rad = 0.5 + rnd() * 0.42
    const p = shell(d, rad)
    seeds.push({
      p, ci, sigma: 0.14 + rnd() * 0.05, count: 90 + Math.floor(rnd() * 40),
      i: push(p[0], p[1], p[2], 4.6, ci, { hub: true })
    })
  })
  for (let g = 0; g < 40; g++) {
    const ci = pickCluster(), d = dir()
    const rad = 0.28 + Math.pow(rnd(), 0.6) * 0.72
    const p = shell(d, rad)
    const tight = rnd() > 0.55
    seeds.push({
      p, ci,
      sigma: tight ? 0.035 + rnd() * 0.035 : 0.075 + rnd() * 0.08,
      count: tight ? 14 + Math.floor(rnd() * 30) : 34 + Math.floor(rnd() * 70),
      i: push(p[0], p[1], p[2], 1.6 + rnd() * 2.2, ci)
    })
  }
  seeds.forEach(sd => {
    for (let k = 0; k < sd.count; k++) {
      const s = sd.sigma * (1 + Math.abs(gauss()) * 0.5)
      let x = sd.p[0] + gauss() * s, y = sd.p[1] + gauss() * s, z = sd.p[2] + gauss() * s
      const l = Math.hypot(x, y, z)
      if (l > 1.04) { x = (x / l) * 1.04; y = (y / l) * 1.04; z = (z / l) * 1.04 }
      const big = rnd() > 0.965
      const pool = NAMES[CLUSTERS[sd.ci].id]
      push(x, y * 0.97, z, big ? 3 + rnd() * 1.4 : 0.85 + rnd() * 1.15, sd.ci,
        big ? { name: pool[Math.floor(rnd() * pool.length)] } : null)
    }
  })
  // informazione ovunque: riempimento di tutto il volume
  for (let k = 0; k < 900; k++) {
    const ci = pickCluster(), d = dir()
    const p = shell(d, 0.12 + Math.pow(rnd(), 0.42) * 0.9)
    push(p[0], p[1] * 0.97, p[2], 0.7 + rnd() * 0.95, ci)
  }
  // guscio esterno, più denso sulla silhouette
  for (let k = 0; k < 520; k++) {
    const ci = pickCluster(), d = dir()
    const p = shell(d, 0.99 + rnd() * 0.05)
    push(p[0], p[1] * 0.97, p[2], 0.7 + rnd() * 0.5, ci, { rim: true })
  }

  // collegamenti: vicini più prossimi dentro un campione casuale, come in un grafo vero
  const edges: [number, number][] = []
  const N = nodes.length
  for (let i = 0; i < N; i++) {
    const ni = nodes[i]
    const wanted = ni.hub ? 5 : rnd() > 0.78 ? 3 : rnd() > 0.3 ? 2 : 1
    const cand: { j: number; d: number }[] = []
    for (let t = 0; t < 90; t++) {
      const j = Math.floor(rnd() * N)
      if (j === i) continue
      const nj = nodes[j]
      const d2 = (ni.x - nj.x) ** 2 + (ni.y - nj.y) ** 2 + (ni.z - nj.z) ** 2
      cand.push({ j, d: d2 })
    }
    cand.sort((p, q) => p.d - q.d)
    for (let k = 0; k < Math.min(wanted, cand.length); k++) {
      if (cand[k].d > 0.34) break
      edges.push([i, cand[k].j])
    }
  }
  // qualche collegamento a lunga distanza fra aree lontane
  for (let k = 0; k < 90; k++) {
    const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N)
    if (nodes[i].cluster !== nodes[j].cluster) edges.push([i, j])
  }
  return { nodes, edges }
}

export const BALL = buildBall()
