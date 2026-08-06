// La forma del marchio: un albero che cresce dentro la sagoma di una mente.
//
// Pochi rami, spessi, con le punte arrotondate — come nei riferimenti. Il
// tronco sale, si apre a ventaglio, e le punte cadono su una cupola: da
// lontano è una testa, da vicino è un albero. Simmetrico sull'asse verticale.
//
// Il seme è fisso: la forma non cambia fra un avvio e l'altro.

export type Ramo = {
  d: string
  spessore: number
  profondita: number
  /** 0 al tronco, 1 alle punte — serve per far crescere il marchio a tempo. */
  t: number
}

export type Punto = { x: number; y: number }

function prng(seme: number) {
  let x = seme
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x / 0x7fffffff
  }
}

const CX = 50
const CY = 56          // centro della cupola
const BASE = 94
const RAGGIO = 36      // dove cadono le punte

export function generaMarchio(seme = 5): { rami: Ramo[]; punte: Punto[] } {
  const rnd = prng(seme)
  const rami: Ramo[] = []
  const punte: Punto[] = []

  const cimaTronco: Punto = { x: CX, y: 70 }
  rami.push({ d: `M ${CX} ${BASE} L ${CX} ${cimaTronco.y}`, spessore: 10, profondita: 0, t: 0 })

  const PROF = 3

  const cresci = (da: Punto, ang: number, len: number, liv: number, spess: number) => {
    // la punta tende verso la cupola: è questo che chiude la sagoma
    const dritto: Punto = { x: da.x + Math.sin(ang) * len, y: da.y - Math.cos(ang) * len }
    const versoCentro = Math.atan2(dritto.x - CX, CY - dritto.y)
    const distanza = Math.hypot(dritto.x - CX, dritto.y - CY)
    const tira = liv >= PROF - 1 ? Math.min(1, Math.max(0, (distanza - RAGGIO * 0.7) / RAGGIO)) * 0.5 : 0
    const fine: Punto = {
      x: dritto.x + (CX + Math.sin(versoCentro) * RAGGIO - dritto.x) * tira,
      y: dritto.y + (CY - Math.cos(versoCentro) * RAGGIO - dritto.y) * tira
    }

    // curva verso l'esterno: dà il movimento, evita l'aria da diagramma
    const fuori = da.x >= CX ? 1 : -1
    const c = (0.30 + rnd() * 0.12) * fuori
    const meta: Punto = {
      x: (da.x + fine.x) / 2 - (fine.y - da.y) * c * 0.5,
      y: (da.y + fine.y) / 2 + (fine.x - da.x) * c * 0.5
    }

    rami.push({
      d: `M ${da.x.toFixed(2)} ${da.y.toFixed(2)} Q ${meta.x.toFixed(2)} ${meta.y.toFixed(2)} ${fine.x.toFixed(2)} ${fine.y.toFixed(2)}`,
      spessore: spess,
      profondita: liv,
      t: liv / PROF
    })

    if (liv >= PROF) { punte.push(fine); return }

    // i figli si aprono, ma nessun ramo va mai oltre l'orizzontale: è quello
    // che tiene la chioma a cupola invece di farla ricadere ai lati
    const MAX = 1.16
    const apertura = 0.70 - liv * 0.16
    for (let i = 0; i < 2; i++) {
      const t = i - 0.5
      let nuovo = ang + t * apertura * 2
      // più si è già larghi, più il ramo viene richiamato verso l'alto
      nuovo -= Math.sign(nuovo) * Math.max(0, Math.abs(nuovo) - 0.6) * 0.45
      nuovo = Math.max(-MAX, Math.min(MAX, nuovo))
      cresci(fine, nuovo, len * 0.72, liv + 1, spess * 0.66)
    }
  }

  // Genero solo la metà destra e la rifletto: un marchio simmetrico si legge
  // come una testa, uno asimmetrico come uno scarabocchio.
  const primo = rami.length
  cresci(cimaTronco, 0, 26, 1, 6.6)
  const dopoCentrale = rami.length
  cresci(cimaTronco, 0.38, 25, 1, 6.6)
  cresci(cimaTronco, 0.80, 21, 1, 6.6)

  const destri = rami.slice(dopoCentrale)
  const punteDestre = punte.filter(p => p.x > CX + 0.01)
  destri.forEach(r => rami.push({ ...r, d: rifletti(r.d) }))
  punteDestre.forEach(p => punte.push({ x: 2 * CX - p.x, y: p.y }))

  void primo
  return { rami, punte }
}

/** Ribalta un path attorno all'asse verticale del marchio. */
function rifletti(d: string): string {
  const pezzi = d.split(' ')
  const fuori: string[] = []
  for (let i = 0; i < pezzi.length; i++) {
    const p = pezzi[i]
    if (p === 'M' || p === 'L' || p === 'Q') {
      fuori.push(p)
      continue
    }
    // le coordinate arrivano a coppie: specchio la x, tengo la y
    const x = Number(p)
    const y = Number(pezzi[i + 1])
    fuori.push((2 * CX - x).toFixed(2), y.toFixed(2))
    i++
  }
  return fuori.join(' ')
}
