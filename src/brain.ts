// La palla di nodi della Mappa, costruita sul materiale vero: un nodo per
// documento indicizzato, e un legame dove due documenti condividono parole che
// non sono comuni a tutti.
//
// Prima le posizioni erano rumore gaussiano attorno a un centro per gruppo:
// bello, stabile, e senza nessun rapporto con quello che c'era dentro. Due
// nodi vicini non volevano dire niente. Adesso la forma esce dai legami — un
// assestamento a molle, poche decine di giri — e la vicinanza significa
// qualcosa: documenti che parlano delle stesse cose finiscono insieme.
//
// Resta la sfera, perché è la forma giusta per questa cosa e perché è quella
// che l'app ha sempre avuto: le molle assestano *dentro* il guscio.
//
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
  /** L'id del documento vero, quando il nodo ne rappresenta uno. */
  doc?: string
  titolo?: string
}

export type Ball = { nodes: Nodo[]; edges: [number, number][] }

/** Il grafo come arriva dal server. */
export type Grafo = {
  nodi: { id: string; titolo: string; gruppo: string; fonte: string; quando: string | null }[]
  archi: [number, number, number][]
}

const MAX_NODI = 2600

// Tarate su un corpus di prova con tre argomenti separati e misurando quanto i
// gruppi si staccano: con i valori di prima (0.0016 / 0.00028) i temi restavano
// sovrapposti — la distanza fra i centri era più piccola del raggio dei gruppi
// stessi, cioè la posizione non voleva dire niente. Con questi il rapporto è
// circa 6, e la vicinanza si legge a occhio.
const ATTRAZIONE = 0.05
const REPULSIONE = 0.0012

function prng(seed: number) {
  let x = seed
  return () => {
    // Math.imul tiene la moltiplicazione a 32 bit: senza, si supera 2^53,
    // i bit bassi si perdono e la sequenza si ripete dopo poche migliaia
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 4294967296
  }
}

/**
 * La forma vera: i legami tirano, tutto il resto si respinge, il guscio
 * trattiene. Poche iterazioni bastano — non serve un minimo assoluto, serve
 * che le cose vicine si vedano vicine.
 */
export function costruisciDaGrafo(g: Grafo): Ball {
  const n = Math.min(g.nodi.length, MAX_NODI)
  if (!n) return { nodes: [], edges: [] }

  const rnd = prng(90210)
  const x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n)

  // partenza deterministica sulla sfera, ma già raggruppata per gruppo: dà
  // all'assestamento un punto di partenza sensato invece del caos
  const centri = new Map<string, [number, number, number]>()
  const centro = (gr: string): [number, number, number] => {
    let c = centri.get(gr)
    if (!c) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u)
      c = [Math.cos(th) * s * 0.6, u * 0.6, Math.sin(th) * s * 0.6]
      centri.set(gr, c)
    }
    return c
  }
  for (let i = 0; i < n; i++) {
    const c = centro(g.nodi[i].gruppo)
    x[i] = c[0] + (rnd() - 0.5) * 0.5
    y[i] = c[1] + (rnd() - 0.5) * 0.5
    z[i] = c[2] + (rnd() - 0.5) * 0.5
  }

  const archi = g.archi.filter(([i, j]) => i < n && j < n)
  const pesoMax = archi.reduce((m, a) => Math.max(m, a[2]), 1)

  const GIRI = 240
  const CAMPIONI = 26          // la repulsione si stima su un campione: O(n·k)
  const fx = new Float64Array(n), fy = new Float64Array(n), fz = new Float64Array(n)

  for (let giro = 0; giro < GIRI; giro++) {
    fx.fill(0); fy.fill(0); fz.fill(0)
    const raffredda = 1 - giro / GIRI

    // le molle: i documenti che condividono parole si tirano
    for (const [i, j, w] of archi) {
      const dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i]
      const d = Math.hypot(dx, dy, dz) || 1e-4
      const k = ATTRAZIONE * (w / pesoMax) * d
      fx[i] += (dx / d) * k; fy[i] += (dy / d) * k; fz[i] += (dz / d) * k
      fx[j] -= (dx / d) * k; fy[j] -= (dy / d) * k; fz[j] -= (dz / d) * k
    }

    // la repulsione, stimata: senza, tutto collassa in un punto
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < CAMPIONI; s++) {
        const j = Math.floor(rnd() * n)
        if (j === i) continue
        const dx = x[i] - x[j], dy = y[i] - y[j], dz = z[i] - z[j]
        const d2 = dx * dx + dy * dy + dz * dz + 0.0015
        const k = REPULSIONE / d2
        fx[i] += dx * k; fy[i] += dy * k; fz[i] += dz * k
      }
    }

    for (let i = 0; i < n; i++) {
      x[i] += fx[i] * raffredda; y[i] += fy[i] * raffredda; z[i] += fz[i] * raffredda
      // il guscio: la palla resta una palla
      const l = Math.hypot(x[i], y[i], z[i])
      if (l > 1.04) { const f = 1.04 / l; x[i] *= f; y[i] *= f; z[i] *= f }
      else if (l < 0.12) { const f = 0.12 / (l || 1e-4); x[i] *= f; y[i] *= f; z[i] *= f }
    }
  }

  // quanto è legato un nodo decide quanto è grosso: i documenti che tengono
  // insieme il resto si vedono, ed è l'informazione che la Mappa deve dare
  const grado = new Int32Array(n)
  for (const [i, j] of archi) { grado[i]++; grado[j]++ }
  const gradoMax = grado.reduce((m, v) => Math.max(m, v), 1)

  const nodes: Nodo[] = []
  for (let i = 0; i < n; i++) {
    const forza = grado[i] / gradoMax
    nodes.push({
      cluster: g.nodi[i].gruppo,
      x: x[i], y: y[i] * 0.97, z: z[i],
      r: 0.8 + forza * 3.4,
      hub: forza > 0.55,
      rim: grado[i] === 0,
      doc: g.nodi[i].id,
      titolo: g.nodi[i].titolo
    })
  }

  // per il disegno servono solo le coppie: il peso ha già fatto il suo lavoro
  const edges: [number, number][] = archi.map(([i, j]) => [i, j] as [number, number]).slice(0, 6000)
  return { nodes, edges }
}

/**
 * La versione vecchia, dai soli conteggi. Resta perché la Mappa deve avere una
 * forma anche prima che il grafo arrivi dal server — ma è dichiaratamente una
 * scenografia, non un ritratto del materiale.
 */
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
      if (rnd() > 0.55) {
        edges.push([mio, hub])
      } else if (mio - hub > 2) {
        edges.push([mio, hub + 1 + Math.floor(rnd() * (mio - hub - 1))])
      }
    }
  })

  const N = nodes.length
  if (N > 4) {
    for (let k = 0; k < Math.min(120, N / 8); k++) {
      const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N)
      if (nodes[i].cluster !== nodes[j].cluster) edges.push([i, j])
    }
  }

  return { nodes, edges }
}
