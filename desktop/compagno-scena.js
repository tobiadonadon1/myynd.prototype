// Il mostriciattolo in 3D: il corpo, la pelliccia, la faccia e come si muove.
//
// Costruito a mano con three.js, sul disegno di `public/mascotte.png`: un
// fagiolo arancio ruggine, la pancia color panna, due occhi a puntino, un
// sorriso largo con qualche dente, due antenne a piuma, braccia corte che
// pendono, due piedini. Ogni parte è un solido di rotazione (LatheGeometry)
// e la pelliccia sono gusci: la stessa superficie disegnata `STRATI` volte,
// ognuna un po' più fuori lungo la normale, e in ognuna restano solo i
// punti dove passa un pelo abbastanza lungo. Un solo disegno per parte: i
// gusci sono istanze, il vertex shader le spinge fuori con `gl_InstanceID`.
//
// Un modello vero può prendere il suo posto: se accanto c'è
// `icone/compagno.glb`, `caricaModello` lo legge con GLTFLoader e il resto
// (sguardo, respiro, salto) muove quello. Le parti che il GLB non ha (occhi
// da chiudere, antenne da far molleggiare) semplicemente non si muovono.
// Attenzione al pacchetto: electron-builder lascia fuori ogni
// `node_modules/*/examples`, cioè anche GLTFLoader. Nel pacchetto, senza
// una copia del loader accanto a questa pagina, il GLB non si legge e resta
// quello fatto a mano (lo dice la console, non si rompe niente).
//
// Costa poco per scelta: al massimo 30 fotogrammi al secondo, 15 quando
// dorme o quando il Mac chiede meno movimento, nessuno quando la finestra
// non si vede. La pagina che lo ospita è `compagno.html`, i gesti sono in
// `compagno.js`.

import * as THREE from 'three'

/* ------------------------------------------------------------ i colori */

const ARANCIO = '#B9532A'
const ARANCIO_PUNTE = '#E2804B'
const PANNA = '#D8BC8C'
const PANNA_PUNTE = '#F2E2C0'
const BUIO = '#1A0F0B'
const DENTI = '#F2E6CC'
const ANTENNA = '#2A1A12'

/* ------------------------------------------------------------ le misure (unità della scena) */

/** Il profilo del corpo, dal fondo alla cima: [raggio, altezza]. Il davanti è schiacciato di `PROFONDITA`. */
const PROFILO_CORPO = [
  [0, 0], [0.36, 0.015], [0.56, 0.07], [0.67, 0.19], [0.715, 0.4], [0.725, 0.7],
  [0.715, 1.0], [0.69, 1.26], [0.635, 1.5], [0.545, 1.71], [0.4, 1.88], [0.21, 1.975], [0, 2]
]
const PROFONDITA = 0.84
/** Il corpo sta su questo: sotto ci sono i piedi. */
const SOLLEVATO = 0.1
const PELO = 0.075
const STRATI = 18

/* ------------------------------------------------------------ geometria */

/** Il profilo addolcito con una spline e girato intorno all'asse y. */
function tornio(punti, campioni = 40, giri = 48) {
  const curva = new THREE.SplineCurve(punti.map(([r, y]) => new THREE.Vector2(r, y)))
  const fitti = curva.getSpacedPoints(campioni).map(p => new THREE.Vector2(Math.max(0, p.x), p.y))
  fitti[0].x = 0
  fitti[fitti.length - 1].x = 0
  const g = new THREE.LatheGeometry(fitti, giri)
  g.computeVertexNormals()
  // la cucitura del tornio: le normali dei due bordi diventano la loro media
  saldaCucitura(g, giri, fitti.length)
  return { geometria: g, fitti }
}

function saldaCucitura(g, giri, righe) {
  const n = g.attributes.normal
  for (let j = 0; j < righe; j++) {
    const a = j
    const b = giri * righe + j
    const x = (n.getX(a) + n.getX(b)) / 2, y = (n.getY(a) + n.getY(b)) / 2, z = (n.getZ(a) + n.getZ(b)) / 2
    const l = Math.hypot(x, y, z) || 1
    n.setXYZ(a, x / l, y / l, z / l)
    n.setXYZ(b, x / l, y / l, z / l)
  }
}

/** Il raggio del corpo a un'altezza, dal profilo già addolcito. */
function raggioA(fitti, y) {
  for (let i = 1; i < fitti.length; i++) {
    const a = fitti[i - 1], b = fitti[i]
    if ((y >= a.y && y <= b.y) || (y <= a.y && y >= b.y)) {
      const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y)
      return a.x + (b.x - a.x) * t
    }
  }
  return 0
}

/** Il punto sul davanti del corpo a (x, y), già schiacciato: la z della superficie. */
function davanti(fitti, x, y) {
  const r = raggioA(fitti, y)
  return Math.sqrt(Math.max(r * r - x * x, 0)) * PROFONDITA
}

/* ------------------------------------------------------------ la pelliccia */

const VERTICI_PELO = /* glsl */ `
uniform float uLungo;
uniform float uStrati;
uniform vec3 uGravita;
varying vec2 vUv;
varying vec3 vNormaleV;
varying vec3 vPosV;
varying vec3 vPosO;
varying float vH;
void main() {
  float h = float(gl_InstanceID) / (uStrati - 1.0);
  vec3 p = position + normal * uLungo * h + uGravita * uLungo * h * h;
  vUv = uv;
  vH = h;
  vPosO = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vPosV = mv.xyz;
  vNormaleV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`

const FRAMMENTI_PELO = /* glsl */ `
uniform vec3 uColore;
uniform vec3 uPunte;
uniform vec3 uPanna;
uniform vec3 uPannaPunte;
uniform vec2 uScalaUv;
uniform vec4 uPancia;
uniform float uConPancia;
uniform float uSonno;
uniform float uLuce;
varying vec2 vUv;
varying vec3 vNormaleV;
varying vec3 vPosV;
varying vec3 vPosO;
varying float vH;

float caso(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 cella = vUv * uScalaUv;
  // ogni fila spostata a caso: senza, i peli stanno in colonna e si vedono le righe
  cella.x += caso(vec2(floor(cella.y), 9.1));
  vec2 id = floor(cella);
  vec2 f = fract(cella) - 0.5;
  float r = caso(id);
  // ogni pelo ha la sua lunghezza e il suo posto nella cella; si assottiglia verso la punta
  float lungo = mix(0.45, 1.0, r);
  if (vH > 0.0) {
    vec2 centro = (vec2(caso(id + 3.1), caso(id + 7.7)) - 0.5) * 0.35;
    float raggio = 0.62 * (1.0 - vH / lungo);
    if (vH > lungo || length(f - centro) > raggio) discard;
  }
  // la pancia: un ovale sul davanti, col bordo spettinato
  float pancia = 0.0;
  if (uConPancia > 0.5) {
    vec2 q = (vPosO.xy - uPancia.xy) / uPancia.zw;
    float d = length(q) + (caso(id + 1.7) - 0.5) * 0.08;
    pancia = (1.0 - smoothstep(0.94, 1.02, d)) * smoothstep(0.0, 0.12, vPosO.z);
  }
  vec3 radice = mix(uColore, uPanna, pancia);
  vec3 punta = mix(uPunte, uPannaPunte, pancia);
  // alla radice è più scuro: è l'ombra dei peli intorno. Poco, però: il
  // peluche del disegno è morbido, non a spilli
  vec3 col = mix(radice * mix(0.62, 0.78, pancia), punta, pow(vH, 0.9));
  col *= 0.93 + 0.14 * caso(id + 5.3);
  vec3 n = normalize(vNormaleV);
  vec3 v = normalize(-vPosV);
  vec3 L = normalize(vec3(-0.45, 0.75, 0.75));
  float diffusa = max(dot(n, L), 0.0) * 0.62 + 0.5;
  float bordo = pow(1.0 - max(dot(n, v), 0.0), 2.2);
  col = col * diffusa * uLuce + bordo * 0.3 * mix(punta, vec3(1.0, 0.9, 0.78), 0.5) * vH;
  float grigio = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(grigio) * 0.9, uSonno * 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

/** I materiali della pelliccia: tutti insieme, così il sonno li spegne in un colpo. */
function materialePelo({ colore = ARANCIO, punte = ARANCIO_PUNTE, lungo = PELO, scalaUv, pancia = null, gravita = [0, -0.55, 0.1] }) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTICI_PELO,
    fragmentShader: FRAMMENTI_PELO,
    uniforms: {
      uLungo: { value: lungo },
      uStrati: { value: STRATI },
      uGravita: { value: new THREE.Vector3(...gravita) },
      uColore: { value: new THREE.Color(colore) },
      uPunte: { value: new THREE.Color(punte) },
      uPanna: { value: new THREE.Color(PANNA) },
      uPannaPunte: { value: new THREE.Color(PANNA_PUNTE) },
      uScalaUv: { value: new THREE.Vector2(...scalaUv) },
      uPancia: { value: new THREE.Vector4(...(pancia ?? [0, 0, 1, 1])) },
      uConPancia: { value: pancia ? 1 : 0 },
      uSonno: { value: 0 },
      uLuce: { value: 1 }
    }
  })
}

/** Una parte pelosa: la geometria disegnata `STRATI` volte, in un disegno solo. */
function pelosa(geometria, materiale) {
  const g = new THREE.InstancedBufferGeometry()
  g.index = geometria.index
  for (const [nome, attr] of Object.entries(geometria.attributes)) g.setAttribute(nome, attr)
  g.instanceCount = STRATI
  g.boundingSphere = geometria.boundingSphere ?? (geometria.computeBoundingSphere(), geometria.boundingSphere)
  const m = new THREE.Mesh(g, materiale)
  m.frustumCulled = false
  return m
}

/** Quante celle di pelo lungo il giro e lungo il profilo, perché i peli siano quasi tondi. */
function scalaPer(fitti, passo) {
  let lungo = 0, largo = 0
  for (let i = 1; i < fitti.length; i++) lungo += fitti[i].distanceTo(fitti[i - 1])
  for (const p of fitti) largo = Math.max(largo, p.x)
  return [Math.round((2 * Math.PI * largo) / passo), Math.round(lungo / passo)]
}

/* ------------------------------------------------------------ le parti */

function bocca(fitti, materiale) {
  // un sorriso largo e sottile: più aperto in mezzo, gli angoli un po' in su
  const pezzi = 28
  const larga = 0.43
  const y0 = 1.47
  const pos = []
  const indici = []
  for (let i = 0; i <= pezzi; i++) {
    const t = (i / pezzi) * 2 - 1
    const x = t * larga
    const centro = y0 + 0.045 * t * t
    const meta = 0.034 * Math.pow(1 - t * t, 0.55) + 0.004
    for (const y of [centro + meta * 0.55, centro - meta * 1.25]) {
      pos.push(x, y, davanti(fitti, x, y) + PELO * 0.62)
    }
    if (i < pezzi) {
      const a = i * 2
      indici.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(indici)
  const m = new THREE.Mesh(g, materiale)
  m.renderOrder = 2
  const gruppo = new THREE.Group()
  gruppo.add(m)
  // qualche dente sul labbro di sopra, non tutti uguali
  const dente = new THREE.SphereGeometry(1, 10, 8)
  const bianco = new THREE.MeshLambertMaterial({ color: DENTI })
  for (const [t, largo] of [[-0.5, 0.034], [-0.2, 0.03], [0.13, 0.036], [0.46, 0.03]]) {
    const x = t * larga
    const centro = y0 + 0.045 * t * t
    const meta = 0.034 * Math.pow(1 - t * t, 0.55) + 0.004
    const y = centro + meta * 0.55 - 0.012
    const d = new THREE.Mesh(dente, bianco)
    d.scale.set(largo, 0.02, 0.014)
    d.position.set(x, y, davanti(fitti, x, y) + PELO * 0.66)
    d.renderOrder = 3
    gruppo.add(d)
  }
  // il perno all'altezza della bocca: chiudendola si stringe lì, non scivola giù
  const perno = new THREE.Group()
  perno.position.y = y0
  gruppo.position.y = -y0
  perno.add(gruppo)
  return perno
}

function occhio(fitti, lato) {
  const x = lato * 0.33
  const y = 1.66
  const gruppo = new THREE.Group()
  gruppo.position.set(x, y, davanti(fitti, x, y) + PELO * 0.5)
  // girato come la superficie, così chiudendolo si schiaccia lungo il viso
  gruppo.rotation.y = Math.asin(Math.max(-1, Math.min(1, x / 0.7))) * 0.8
  const nero = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 12), new THREE.MeshBasicMaterial({ color: BUIO }))
  nero.scale.z = 0.6
  const luce = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }))
  luce.position.set(-0.016, 0.017, 0.028)
  gruppo.add(nero, luce)
  return gruppo
}

/** Un'antenna: un gambo sottile e una piuma di peli scuri, larga a metà e stretta in cima. */
function antenna(lato) {
  const base = new THREE.Vector3(lato * 0.27, 0, 0)
  const curva = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lato * 0.02, 0.3, 0.02),
    new THREE.Vector3(lato * 0.1, 0.62, -0.02)
  )
  const gruppo = new THREE.Group()
  gruppo.position.copy(base)
  const scuro = new THREE.MeshBasicMaterial({ color: ANTENNA })
  gruppo.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 16, 0.011, 5, false), scuro))
  // la piuma: peli che escono dal gambo verso l'alto e verso fuori, in tutte le direzioni
  const punti = []
  const colori = []
  const radice = new THREE.Color(ANTENNA)
  const punta = new THREE.Color('#5A4030')
  let seme = lato > 0 ? 11 : 29
  const caso = () => { seme = (seme * 16807) % 2147483647; return seme / 2147483647 }
  const tangente = new THREE.Vector3()
  for (let i = 0; i < 230; i++) {
    const s = 0.12 + caso() * 0.88
    const p = curva.getPoint(s)
    curva.getTangent(s, tangente)
    const ampiezza = 0.14 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.15)), 0.8) + 0.02
    const giro = caso() * Math.PI * 2
    // di lato più che davanti e dietro: da davanti sembra una piuma piatta
    const dir = new THREE.Vector3(Math.cos(giro), 0, Math.sin(giro) * 0.55)
    dir.addScaledVector(tangente, 1.1 + caso() * 0.5).normalize()
    const q = p.clone().addScaledVector(dir, ampiezza * (0.6 + caso() * 0.5))
    punti.push(p.x, p.y, p.z, q.x, q.y, q.z)
    colori.push(radice.r, radice.g, radice.b, punta.r, punta.g, punta.b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(punti, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colori, 3))
  gruppo.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })))
  return gruppo
}

function braccio(lato, materiale, geometria) {
  // appeso alla spalla: il perno è in cima, così oscilla come un braccio
  const perno = new THREE.Group()
  perno.position.set(lato * 0.71, 1.22, -0.02)
  const m = pelosa(geometria, materiale)
  m.position.set(lato * 0.07, -0.5, 0)
  m.scale.set(1, 1, 0.9)
  perno.add(m)
  perno.rotation.z = lato * 0.1
  return perno
}

/**
 * Il mostriciattolo intero. `radice` sta per terra; `corpo` è quello che
 * respira, si gira e salta; `parti` sono i pezzi che si animano da soli.
 */
export function costruisciMostriciattolo() {
  const { geometria: gCorpo, fitti } = tornio(PROFILO_CORPO)
  const materiali = []
  const pelo = opzioni => { const m = materialePelo(opzioni); materiali.push(m); return m }

  // radice per terra; salto sale e scende coi piedi; corpo respira e si gira
  const radice = new THREE.Group()
  const salto = new THREE.Group()
  const corpo = new THREE.Group()
  radice.add(salto)
  salto.add(corpo)

  const tronco = pelosa(gCorpo, pelo({ scalaUv: scalaPer(fitti, 0.034), pancia: [0, 0.66, 0.53, 0.47] }))
  tronco.scale.z = PROFONDITA
  const sopra = new THREE.Group()
  sopra.position.y = SOLLEVATO
  sopra.add(tronco)
  corpo.add(sopra)

  const faccia = new THREE.Group()
  const buio = new THREE.MeshBasicMaterial({ color: BUIO, side: THREE.DoubleSide })
  const sorriso = bocca(fitti, buio)
  faccia.add(sorriso)
  const occhi = [occhio(fitti, -1), occhio(fitti, 1)]
  faccia.add(...occhi)
  sopra.add(faccia)

  const antenne = [antenna(-1), antenna(1)]
  for (const a of antenne) {
    a.position.y = 1.9
    a.position.z = 0.02
    a.rotation.z = -Math.sign(a.position.x) * 0.06
    sopra.add(a)
  }

  const { geometria: gBraccio, fitti: fBraccio } = tornio([[0, -0.2], [0.075, -0.185], [0.12, -0.13], [0.14, 0.0], [0.135, 0.2], [0.115, 0.38], [0.075, 0.5], [0, 0.54]], 24, 20)
  const matBraccio = pelo({ scalaUv: scalaPer(fBraccio, 0.028), lungo: PELO * 0.85 })
  const braccia = [braccio(-1, matBraccio, gBraccio), braccio(1, matBraccio, gBraccio)]
  sopra.add(...braccia)

  // i piedi saltano col corpo, ma non respirano e non si girano
  const { geometria: gPiede, fitti: fPiede } = tornio([[0, 0], [0.09, 0], [0.16, 0.01], [0.175, 0.06], [0.16, 0.12], [0.1, 0.155], [0, 0.16]], 12, 20)
  const matPiede = pelo({ scalaUv: scalaPer(fPiede, 0.026), lungo: PELO * 0.6, gravita: [0, -0.2, 0.05] })
  const piedi = []
  for (const lato of [-1, 1]) {
    const p = pelosa(gPiede, matPiede)
    p.position.set(lato * 0.3, -0.02, 0.06)
    p.scale.set(1.05, 1, 1.15)
    salto.add(p)
    piedi.push(p)
  }

  return { radice, salto, corpo, parti: { occhi, antenne, braccia, piedi, materiali, bocca: sorriso } }
}

/** Il modello: quello in `glb` se c'è e si legge, altrimenti quello fatto a mano. */
export async function caricaModello(glb) {
  if (glb) {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
      const gltf = await new GLTFLoader().loadAsync(glb)
      const radice = new THREE.Group()
      const salto = new THREE.Group()
      const corpo = new THREE.Group()
      corpo.add(gltf.scene)
      salto.add(corpo)
      radice.add(salto)
      // alto come quello fatto a mano, coi piedi per terra
      const box = new THREE.Box3().setFromObject(gltf.scene)
      const alto = box.max.y - box.min.y || 1
      const s = 2.7 / alto
      gltf.scene.scale.setScalar(s)
      gltf.scene.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s)
      return { radice, salto, corpo, parti: { occhi: [], antenne: [], braccia: [], piedi: [], materiali: [], bocca: null } }
    } catch (e) {
      console.warn('compagno · il modello non si legge, uso quello fatto a mano', e)
    }
  }
  return costruisciMostriciattolo()
}

/* ------------------------------------------------------------ la scena e il movimento */

/** L'ombra per terra: un ovale sfumato, che col salto si stringe e si schiarisce. */
function ombra() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(40,20,10,0.42)')
  r.addColorStop(0.55, 'rgba(40,20,10,0.16)')
  r.addColorStop(1, 'rgba(40,20,10,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.62), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  m.position.y = -0.03
  m.renderOrder = -1
  return m
}

const smorza = (da, a, velocita, dt) => a + (da - a) * Math.exp(-velocita * dt)

/**
 * La scena nel `canvas`. Torna i comandi: lo stato del guscio, dove guarda,
 * un salto, e la zona del corpo per sapere se il cursore ci sta sopra.
 */
export async function creaScena(canvas, { glb = '', prova = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power', premultipliedAlpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  const lato = () => canvas.clientWidth || canvas.width
  renderer.setSize(lato(), lato(), false)

  const scena = new THREE.Scene()
  scena.add(new THREE.AmbientLight('#ffffff', 1.4))
  const sole = new THREE.DirectionalLight('#ffffff', 1.6)
  sole.position.set(-2, 3, 4)
  scena.add(sole)

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50)
  camera.position.set(0, 1.42, 8)
  camera.lookAt(0, 1.3, 0)

  const modello = await caricaModello(glb)
  const { radice, salto: saltello, corpo, parti } = modello
  scena.add(radice)
  const suolo = ombra()
  radice.add(suolo)

  const meno = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  let calmo = !!meno?.matches
  meno?.addEventListener?.('change', e => { calmo = e.matches; pianifica() })

  const stato = { guarda: true, attesa: false }
  const voluto = { x: 0, y: 0 }
  const sguardo = { x: 0, y: 0 }
  let sonno = 0
  let salto = -1
  let tempo = 0
  let prossimoBattito = 2.5
  let battito = -1
  /** Qualcosa si sta muovendo davvero (sguardo, salto, battito, antenne): allora 30 al secondo. */
  let inMoto = true
  const molle = parti.antenne.map(() => ({ a: 0, v: 0 }))

  /** Mezzo secondo di salto, con lo schiacciamento alla partenza e all'arrivo. */
  function saltoA(t) {
    if (t < 0) return { y: 0, s: 1 }
    const d = 0.62
    if (t > d) return { y: 0, s: 1 }
    const p = t / d
    if (p < 0.15) return { y: 0, s: 1 - 0.1 * Math.sin((p / 0.15) * Math.PI) }
    if (p > 0.85) return { y: 0, s: 1 - 0.08 * Math.sin(((p - 0.85) / 0.15) * Math.PI) }
    const q = (p - 0.15) / 0.7
    return { y: 0.24 * 4 * q * (1 - q), s: 1 + 0.05 * Math.sin(q * Math.PI) }
  }

  function aggiorna(dt) {
    tempo += dt
    const dorme = !stato.guarda
    sonno = smorza(sonno, dorme ? 1 : 0, 3, dt)
    // dove guarda: dormendo, giù e un po' di lato
    const gx = dorme ? 0.12 : voluto.x
    const gy = dorme ? 0.55 : voluto.y
    sguardo.x = smorza(sguardo.x, gx, calmo ? 3 : 6, dt)
    sguardo.y = smorza(sguardo.y, gy, calmo ? 3 : 6, dt)

    const lento = 1 - sonno * 0.45
    const respiro = Math.sin(tempo * Math.PI * 2 * 0.27 * lento)
    const ondeggia = calmo ? 0 : Math.sin(tempo * 0.7) * 0.022 * (1 - sonno)
    const { y: alto, s: schiaccia } = saltoA(salto < 0 ? -1 : tempo - salto)
    if (salto >= 0 && tempo - salto > 0.62) salto = -1

    saltello.position.y = alto
    corpo.rotation.y = sguardo.x * 0.55
    corpo.rotation.x = sguardo.y * 0.2 + sonno * 0.06
    corpo.rotation.z = ondeggia - sguardo.x * 0.03
    const r = (calmo ? 0.006 : 0.013) * respiro
    corpo.scale.set(1 - r * 0.5 + (1 - schiaccia) * 0.6, (1 + r) * schiaccia, 1 - r * 0.5 + (1 - schiaccia) * 0.6)
    suolo.scale.setScalar(1 - alto * 1.4)
    suolo.material.opacity = 1 - alto * 2

    // le braccia pendono e oscillano appena; nel salto si alzano un poco
    parti.braccia.forEach((b, i) => {
      const l = i === 0 ? -1 : 1
      b.rotation.z = l * (0.1 + (calmo ? 0 : 0.025 * Math.sin(tempo * 1.1 + i)) + alto * 1.4)
      b.rotation.x = -sguardo.x * 0.05 * l
    })

    // le palpebre: un battito ogni tanto; dormendo chiuse
    if (!prova && !calmo && battito < 0 && tempo > prossimoBattito) { battito = tempo; prossimoBattito = tempo + 2.4 + Math.random() * 3.6 }
    let chiuso = 0
    if (battito >= 0) {
      const p = (tempo - battito) / 0.16
      if (p >= 1) battito = -1
      else chiuso = Math.sin(p * Math.PI)
    }
    chiuso = Math.max(chiuso, sonno)
    for (const o of parti.occhi) {
      o.scale.y = Math.max(0.1, 1 - chiuso * 0.9)
      // gli occhi seguono anche loro, un poco più della testa
      o.children[0].position.x = sguardo.x * 0.012
      o.children[0].position.y = -sguardo.y * 0.01
    }

    // le antenne: una molla, spinta dal salto, dal giro della testa e da un filo d'aria
    molle.forEach((m, i) => {
      const l = i === 0 ? -1 : 1
      const spinta = -alto * 6 + (calmo ? 0 : Math.sin(tempo * 1.7 + i * 1.3) * 0.25) - sguardo.x * 0.8
      const bersaglio = l * 0.06 + spinta * 0.08 + sonno * l * 0.35
      m.v += ((bersaglio - m.a) * 60 - m.v * 7) * dt
      m.a += m.v * dt
      parti.antenne[i].rotation.z = m.a
      parti.antenne[i].rotation.x = -sonno * 0.25
    })

    const verso = Math.abs(gx - sguardo.x) + Math.abs(gy - sguardo.y)
    const molla = molle.reduce((m, a) => Math.max(m, Math.abs(a.v)), 0)
    inMoto = verso > 0.01 || salto >= 0 || battito >= 0 || molla > 0.08 || Math.abs(sonno - (dorme ? 1 : 0)) > 0.02

    // dormendo la bocca si chiude a metà
    if (parti.bocca) parti.bocca.scale.y = 1 - sonno * 0.55
    for (const mat of parti.materiali) {
      mat.uniforms.uSonno.value = sonno
      mat.uniforms.uLuce.value = 1 - sonno * 0.12
    }
  }

  /* il giro dei fotogrammi: un timer per il passo, poi requestAnimationFrame per disegnare */
  let timer = 0
  let raf = 0
  let ultimo = performance.now()
  let fermo = false
  /*
   * Quanti fotogrammi al secondo. Solo quando qualcosa si muove davvero se
   * ne disegnano 30 (15 col movimento ridotto); fermo, il respiro e il
   * dondolio sono così lenti che 5 bastano a non vedere scatti, e dormendo 3.
   * Ogni fotogramma costa, il resto del tempo il Mac è di chi lavora.
   */
  const passo = () => 1000 / (inMoto ? (calmo ? 15 : 30) : sonno > 0.95 ? 3 : 5)

  function fotogramma() {
    raf = 0
    const ora = performance.now()
    const dt = Math.min((ora - ultimo) / 1000, 0.1)
    ultimo = ora
    if (!fermo) aggiorna(dt)
    renderer.render(scena, camera)
    pianifica()
  }

  function pianifica() {
    if (timer || raf) return
    if (!prova && document.hidden) return
    const attesa = Math.max(0, passo() - (performance.now() - ultimo))
    timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(fotogramma) }, attesa)
  }

  /** Un fotogramma subito: arriva un cambio e il prossimo, a riposo, sarebbe fra un sesto di secondo. */
  function sveglia() {
    if (raf || fermo) return
    clearTimeout(timer); timer = 0
    inMoto = true
    pianifica()
  }

  function sospendi() {
    clearTimeout(timer); timer = 0
    cancelAnimationFrame(raf); raf = 0
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !prova) sospendi()
    else { ultimo = performance.now(); pianifica() }
  })

  // la zona del corpo sullo schermo, in punti della pagina: un ovale intorno al tronco
  function zona() {
    const box = new THREE.Box3()
    for (const o of [corpo]) box.expandByObject(o)
    const a = new THREE.Vector3(box.min.x, box.min.y, 0).project(camera)
    const b = new THREE.Vector3(box.max.x, Math.min(box.max.y, 2.15), 0).project(camera)
    const l = lato()
    const x1 = (a.x + 1) / 2 * l, x2 = (b.x + 1) / 2 * l
    const y1 = (1 - (b.y + 1) / 2) * l, y2 = (1 - (a.y + 1) / 2) * l
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2 + l * 0.04 }
  }
  const ovale = zona()

  pianifica()

  return {
    /** Lo stato dal guscio: guarda (sveglio o no) e attesa (qualcosa aspetta: un salto quando arriva). */
    stato(s) {
      const primaAttesa = stato.attesa
      stato.guarda = !!s.guarda
      stato.attesa = !!s.attesa
      if (stato.attesa && !primaAttesa) this.salta()
      sveglia()
    },
    /** Dove sta il cursore, fra -1 e 1 (x a destra, y in giù). */
    guarda(x, y) {
      voluto.x = Math.max(-1, Math.min(1, Number(x) || 0))
      voluto.y = Math.max(-1, Math.min(1, Number(y) || 0))
      if (Math.abs(voluto.x - sguardo.x) + Math.abs(voluto.y - sguardo.y) > 0.01) sveglia()
    },
    salta() {
      if (calmo) return
      if (salto < 0) salto = tempo
      sveglia()
    },
    /** Il cursore è sopra il corpo? In punti della pagina. */
    sopra(x, y) {
      const dx = (x - ovale.cx) / ovale.rx
      const dy = (y - ovale.cy) / ovale.ry
      return dx * dx + dy * dy <= 1
    },
    zona: () => ({ ...ovale }),
    /** Solo per le prove: ferma il tempo e mette lo sguardo subito al suo posto. */
    posa(p = {}) {
      if (!prova) return
      fermo = false
      if ('guarda' in p) { voluto.x = p.guarda[0]; voluto.y = p.guarda[1]; sguardo.x = voluto.x; sguardo.y = voluto.y }
      if ('sveglio' in p) { stato.guarda = p.sveglio; sonno = p.sveglio ? 0 : 1 }
      if ('tempo' in p) tempo = p.tempo
      if ('salto' in p) { salto = tempo - p.salto }
      aggiorna(0)
      if (!stato.guarda) { sguardo.x = 0.12; sguardo.y = 0.55; aggiorna(0) }
      fermo = true
      renderer.render(scena, camera)
    },
    /** Solo per le prove: quanti fotogrammi ha disegnato finora. */
    info: () => renderer.info.render
  }
}
