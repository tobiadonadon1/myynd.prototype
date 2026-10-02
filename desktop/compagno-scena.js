// Il mostriciattolo in 3D: il corpo, la faccia, la luce e come si muove.
//
// Un peluche di quelli belli, come `public/mascotte.png`: arancio pulito e
// saturo, mai marrone, con una peluria fitta e corta (`pelliccia`: gusci
// istanziati, peli sottili quasi dello stesso colore, le punte che prendono
// il contorno freddo), la pancia panna col suo pelo più chiaro, gli occhi
// neri lucidi con due punti di luce cuciti sopra, il sorriso largo coi
// dentini, due antenne lisce con un ciuffo in cima, braccia e piedi corti.
// La prima pelliccia (0.2.35) aveva peli grossi e contrastati e a 110 punti
// era grana; il vinile liscio (0.2.36) era pulito ma di plastica. Questa sta
// in mezzo: morbida, e si legge a 1x e a 2x.
//
// La profondità è luce: un ambiente da studio fatto qui (pannelli luminosi in
// una stanza, passati da PMREMGenerator), una luce calda davanti a sinistra,
// due luci fredde da dietro che disegnano il contorno anche su uno sfondo
// scuro, un'ombra finta dove le parti si toccano (sotto le braccia, verso i
// piedi) e un'ombra morbida per terra.
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
// Costa poco per scelta: 30 fotogrammi al secondo solo quando qualcosa si
// muove davvero, 4 a riposo, 2 dormendo, nessuno quando la finestra non si
// vede. La pagina che lo ospita è `compagno.html`, i gesti sono in
// `compagno.js`.

import * as THREE from 'three'

/* ------------------------------------------------------------ i colori */

const ARANCIO = '#F57A30'
const ARANCIO_PIEDI = '#E86A2A'
const PANNA = '#FFF1D8'
const GUANCE = '#FF5A3C'
const BOCCA = '#3A0F08'
const DENTI = '#FFF8EE'
const OCCHI = '#120C0A'
const ANTENNA = '#4A2516'

/* ------------------------------------------------------------ le misure (unità della scena) */

/** Il profilo del corpo, dal fondo alla cima: [raggio, altezza]. Il davanti è schiacciato di `PROFONDITA`. */
const PROFILO_CORPO = [
  [0, 0], [0.4, 0.02], [0.6, 0.09], [0.71, 0.24], [0.75, 0.48], [0.755, 0.78],
  [0.74, 1.06], [0.71, 1.3], [0.645, 1.53], [0.54, 1.73], [0.38, 1.89], [0.19, 1.975], [0, 2]
]
const PROFONDITA = 0.86
/** Il corpo sta su questo: sotto ci sono i piedi. */
const SOLLEVATO = 0.1

/* ------------------------------------------------------------ geometria */

/** Il profilo addolcito con una spline e girato intorno all'asse y. */
function tornio(punti, campioni = 48, giri = 64) {
  const curva = new THREE.SplineCurve(punti.map(([r, y]) => new THREE.Vector2(r, y)))
  const fitti = curva.getSpacedPoints(campioni).map(p => new THREE.Vector2(Math.max(0, p.x), p.y))
  fitti[0].x = 0
  fitti[fitti.length - 1].x = 0
  const g = new THREE.LatheGeometry(fitti, giri)
  g.computeVertexNormals()
  saldaCucitura(g, giri, fitti.length)
  return { geometria: g, fitti }
}

/** La cucitura del tornio: le normali dei due bordi diventano la loro media, senza riga. */
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

/**
 * Più pezzi fermi in una geometria sola, ognuno al suo posto (`matrice`):
 * un disegno invece di tanti. Ogni fotogramma costa un tanto a disegno, e a
 * riposo è il grosso del conto.
 */
function unisci(pezzi) {
  const attributi = { position: [], normal: [], uv: [] }
  for (const { geometria, matrice } of pezzi) {
    const g = geometria.index ? geometria.toNonIndexed() : geometria.clone()
    g.applyMatrix4(matrice)
    for (const nome of Object.keys(attributi)) {
      const a = g.getAttribute(nome)
      if (a) attributi[nome].push(...a.array)
      else if (nome === 'uv') attributi.uv.push(...new Array(g.getAttribute('position').count * 2).fill(0))
    }
  }
  const u = new THREE.BufferGeometry()
  u.setAttribute('position', new THREE.Float32BufferAttribute(attributi.position, 3))
  u.setAttribute('normal', new THREE.Float32BufferAttribute(attributi.normal, 3))
  u.setAttribute('uv', new THREE.Float32BufferAttribute(attributi.uv, 2))
  return u
}

const matrice = (pos, rot = new THREE.Euler(), scala = new THREE.Vector3(1, 1, 1)) =>
  new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scala)

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

/** La z della superficie davanti al corpo, in (x, y), già schiacciata. */
function davanti(fitti, x, y) {
  const r = raggioA(fitti, y)
  return Math.sqrt(Math.max(r * r - x * x, 0)) * PROFONDITA
}

/* ------------------------------------------------------------ i materiali */

/** Quello che tutti i materiali di vinile condividono: il sonno toglie un filo di colore, niente di più. */
const condivisi = {
  uSonno: { value: 0 },
  uPanna: { value: new THREE.Color(PANNA) },
  uGuance: { value: new THREE.Color(GUANCE) }
}

/*
 * I pezzi di shader che il vinile aggiunge, secondo la parte: la pancia e le
 * guance dipinte sul corpo, e un'ombra finta dove le parti si toccano. Sono
 * nello spazio dell'oggetto (`vPosO`), così seguono il corpo che respira e
 * si gira.
 */
const PITTURA = {
  corpo: /* glsl */ `
    vec2 qp = (vPosO.xy - vec2(0.0, 0.7)) / vec2(0.52, 0.5);
    float pancia = (1.0 - smoothstep(0.95, 1.0, length(qp))) * smoothstep(0.04, 0.16, vPosO.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, uPanna, pancia);
    float guance = 1.0 - smoothstep(0.0, 0.1, length(vec2(abs(vPosO.x) - 0.47, (vPosO.y - 1.36) * 1.3)));
    diffuseColor.rgb = mix(diffuseColor.rgb, uGuance, guance * 0.32 * step(0.0, vPosO.z));
    float ao = 1.0 - 0.32 * (1.0 - smoothstep(0.0, 0.32, vPosO.y));
    float sottoBraccio = smoothstep(0.6, 0.73, abs(vPosO.x)) * (1.0 - smoothstep(0.0, 0.5, abs(vPosO.y - 0.92))) * (1.0 - smoothstep(0.05, 0.42, abs(vPosO.z)));
    ao *= 1.0 - 0.38 * sottoBraccio;
    diffuseColor.rgb *= ao;
  `,
  // il braccio: più scuro dalla parte del corpo e in cima, dove si attacca
  braccio: /* glsl */ `
    float ao = 1.0 - 0.3 * smoothstep(0.25, 0.55, vPosO.y);
    diffuseColor.rgb *= ao;
  `,
  // il piede: più scuro in cima, sotto la pancia
  piede: /* glsl */ `
    diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(0.08, 0.16, vPosO.y);
  `,
  liscio: ''
}

function vinile({ colore = ARANCIO, ruvido = 0.48, velluto = 0.7, lucido = 0.12, parte = 'liscio' } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: colore,
    roughness: ruvido,
    sheen: velluto,
    sheenColor: new THREE.Color('#FFD6B8'),
    sheenRoughness: 0.42,
    clearcoat: lucido,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0.85
  })
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, condivisi)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPosO = position;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosO;\nuniform float uSonno;\nuniform vec3 uPanna;\nuniform vec3 uGuance;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${PITTURA[parte]}
        float grigio = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(grigio), 0.1 * uSonno);`)
  }
  m.customProgramCacheKey = () => `vinile-${parte}`
  return m
}

/*
 * La pelliccia: la stessa superficie disegnata `STRATI` volte in un disegno
 * solo (istanze), ogni strato un po' più fuori lungo la normale; in ogni
 * strato restano solo i punti dove passa un pelo abbastanza lungo. Peli
 * fitti e sottili, quasi dello stesso colore fra loro: da lontano è una
 * peluria morbida, non una grana. La luce è quella vera della scena
 * (MeshStandardMaterial), e le punte prendono il contorno freddo da dietro.
 * Intorno a occhi e bocca il pelo si abbassa fino a sparire: sono cuciti
 * sopra, come su un peluche.
 */
const STRATI = 26
/** Quanto è largo un pelo, in unità della scena: un punto o poco più sullo schermo. */
const PASSO_PELO = 0.013

/** Dove il pelo si abbassa sul viso: occhi e bocca, sul davanti del corpo. */
const VISO = /* glsl */ `
  if (vPosO.z > 0.0) {
    float occhioS = length(vec2(vPosO.x + 0.29, (vPosO.y - 1.6) * 0.9)) / 0.135;
    float occhioD = length(vec2(vPosO.x - 0.29, (vPosO.y - 1.6) * 0.9)) / 0.135;
    float labbra = length(vec2(vPosO.x / 0.47, (vPosO.y - 1.415) / 0.105));
    float vicino = min(min(occhioS, occhioD), labbra);
    tetto = min(tetto, smoothstep(0.75, 1.25, vicino));
  }
`

function pelliccia({ colore = ARANCIO, parte = 'liscio', lungo = 0.062, scalaUv = [200, 140], gravita = [0, -0.4, 0.06], viso = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: colore, roughness: 0.88, envMapIntensity: 0.7 })
  const propri = {
    uLungo: { value: lungo },
    uStrati: { value: STRATI },
    uGravita: { value: new THREE.Vector3(...gravita) },
    uScalaUv: { value: new THREE.Vector2(...scalaUv) },
    uPunte: { value: new THREE.Color('#BFDCFF') }
  }
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, condivisi, propri)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uLungo; uniform float uStrati; uniform vec3 uGravita;
        varying vec3 vPosO; varying vec2 vUvP; varying float vH;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float h = float(gl_InstanceID) / (uStrati - 1.0);
        vH = h; vPosO = position; vUvP = uv;
        transformed += objectNormal * uLungo * h + uGravita * uLungo * h * h;`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPosO; varying vec2 vUvP; varying float vH;
        uniform float uSonno; uniform vec3 uPanna; uniform vec3 uGuance; uniform vec2 uScalaUv; uniform vec3 uPunte;
        float casoP(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 cella = vUvP * uScalaUv;
        cella.x += casoP(vec2(floor(cella.y), 9.1));
        vec2 id = floor(cella);
        float r = casoP(id);
        if (vH > 0.0) {
          // ogni pelo ha la sua lunghezza, il suo posto nella cella, e si assottiglia in punta
          float tetto = mix(0.55, 1.0, r);
          ${viso ? VISO : ''}
          vec2 centro = (vec2(casoP(id + 3.1), casoP(id + 7.7)) - 0.5) * 0.4;
          float raggio = 0.58 * pow(max(1.0 - vH / tetto, 0.0), 0.6);
          if (vH > tetto || length(fract(cella) - 0.5 - centro) > raggio) discard;
        }
        ${PITTURA[parte]}
        // alla radice un poco più scuro, in punta un poco più chiaro: poca differenza fra un pelo e l'altro
        diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 0.85, vH)) * (0.97 + 0.06 * r);
        diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.18 + 0.015, vec3(1.0)), vH * vH);
        float grigio = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(grigio), 0.1 * uSonno);`)
      // le punte dei peli prendono la luce di contorno: più fuori sono, più brillano di taglio
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float taglio = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);
        totalEmissiveRadiance += uPunte * taglio * vH * 0.35;`)
  }
  m.customProgramCacheKey = () => `pelliccia-${parte}-${viso}`
  return m
}

/** Una parte pelosa: la geometria disegnata `STRATI` volte, in un disegno solo. */
function pelosa(geometria, materiale) {
  const g = new THREE.InstancedBufferGeometry()
  g.index = geometria.index
  for (const [nome, attr] of Object.entries(geometria.attributes)) g.setAttribute(nome, attr)
  g.instanceCount = STRATI
  if (!geometria.boundingSphere) geometria.computeBoundingSphere()
  g.boundingSphere = geometria.boundingSphere.clone()
  g.boundingSphere.radius += 0.1
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

/** Uno studio fotografico in piccolo: la luce che si riflette sul vinile e negli occhi. */
function studio(renderer) {
  const s = new THREE.Scene()
  s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: '#2A2522', side: THREE.BackSide })))
  const pannello = (colore, forza, pos, larga, alta) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larga, alta), new THREE.MeshBasicMaterial({ color: new THREE.Color(colore).multiplyScalar(forza), side: THREE.DoubleSide }))
    m.position.set(...pos)
    m.lookAt(0, 1, 0)
    s.add(m)
  }
  pannello('#FFE6CC', 7, [-3.2, 4, 3.4], 3.2, 2.2)   // la luce calda, davanti in alto a sinistra
  pannello('#FFF4EA', 2.2, [3.6, 1.5, 3.2], 2.4, 3)  // il riempimento, più debole, dall'altra parte
  pannello('#BFDAFF', 5, [4, 2.5, -3.5], 1.6, 5)     // i contorni freddi, da dietro
  pannello('#BFDAFF', 4, [-4, 2, -3.5], 1.6, 5)
  pannello('#FFFFFF', 1.6, [0, 5.5, 0], 5, 5)        // il cielo
  const pm = new THREE.PMREMGenerator(renderer)
  const env = pm.fromScene(s, 0.035).texture
  pm.dispose()
  return env
}

/* ------------------------------------------------------------ le parti */

function bocca(fitti) {
  // un sorriso largo: più aperto in mezzo, gli angoli un po' in su
  const pezzi = 36
  const larga = 0.4
  const y0 = 1.4
  const pos = []
  const indici = []
  const labbra = t => {
    const centro = y0 + 0.05 * t * t
    const meta = 0.05 * Math.pow(1 - t * t, 0.6) + 0.006
    return { su: centro + meta * 0.45, giu: centro - meta * 1.3 }
  }
  for (let i = 0; i <= pezzi; i++) {
    const t = (i / pezzi) * 2 - 1
    const x = t * larga
    const { su, giu } = labbra(t)
    for (const y of [su, giu]) pos.push(x, y, davanti(fitti, x, y) + 0.006)
    if (i < pezzi) {
      const a = i * 2
      indici.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(indici)
  g.computeVertexNormals()
  const nero = new THREE.MeshStandardMaterial({ color: BOCCA, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })
  const gruppo = new THREE.Group()
  gruppo.add(new THREE.Mesh(g, nero))
  // i dentini sul labbro di sopra, uno solo per geometria
  const dente = new THREE.SphereGeometry(1, 12, 8)
  const bianco = new THREE.MeshStandardMaterial({ color: DENTI, roughness: 0.35 })
  const denti = new THREE.InstancedMesh(dente, bianco, 4)
  const m = new THREE.Matrix4()
  ;[[-0.46, 0.042], [-0.16, 0.038], [0.16, 0.038], [0.46, 0.042]].forEach(([t, largo], i) => {
    const x = t * larga
    const y = labbra(t).su - 0.018
    m.compose(new THREE.Vector3(x, y, davanti(fitti, x, y) + 0.01), new THREE.Quaternion(), new THREE.Vector3(largo, 0.026, 0.016))
    denti.setMatrixAt(i, m)
  })
  gruppo.add(denti)
  // il perno all'altezza della bocca: chiudendola si stringe lì, non scivola giù
  const perno = new THREE.Group()
  perno.position.y = y0
  gruppo.position.y = -y0
  perno.add(gruppo)
  return perno
}

const materialeOcchio = new THREE.MeshPhysicalMaterial({ color: OCCHI, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 })
const materialeLuce = new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false })

function occhio(fitti, lato) {
  const x = lato * 0.29
  const y = 1.6
  const gruppo = new THREE.Group()
  gruppo.position.set(x, y, davanti(fitti, x, y) - 0.035)
  // girato come la superficie, così chiudendolo si schiaccia lungo il viso
  gruppo.rotation.y = Math.asin(Math.max(-1, Math.min(1, x / 0.75))) * 0.85
  const bulbo = new THREE.Group()
  const nero = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24), materialeOcchio)
  nero.scale.set(0.9, 1.08, 0.62)
  // due punti di luce, in un disegno solo: quello grande in alto a sinistra, uno piccolo in basso a destra
  const luci = new THREE.Mesh(unisci([
    { geometria: new THREE.SphereGeometry(0.028, 16, 12), matrice: matrice(new THREE.Vector3(-0.03, 0.038, 0.056)) },
    { geometria: new THREE.SphereGeometry(0.012, 12, 8), matrice: matrice(new THREE.Vector3(0.034, -0.03, 0.055)) }
  ]), materialeLuce)
  bulbo.add(nero, luci)
  gruppo.add(bulbo)
  gruppo.userData.bulbo = bulbo
  return gruppo
}

/** Un'antenna: un gambo liscio che sale piegandosi in fuori, e un ciuffo di tre gocce in cima. */
function antenna(lato, materiale) {
  const curva = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lato * 0.0, 0.26, 0.02),
    new THREE.Vector3(lato * 0.1, 0.46, 0)
  )
  const gruppo = new THREE.Group()
  gruppo.position.set(lato * 0.25, 0, 0)
  // la goccia: un profilo girato, larga in basso e a punta in cima; tre in
  // ventaglio fanno il ciuffo. Gambo e ciuffo sono un disegno solo
  const { geometria: goccia } = tornio([[0, 0], [0.05, 0.03], [0.068, 0.08], [0.06, 0.14], [0.035, 0.2], [0, 0.24]], 20, 20)
  const cima = curva.getPoint(1)
  const dir = curva.getTangent(1)
  const ciuffo = new THREE.Object3D()
  ciuffo.position.copy(cima).addScaledVector(dir, -0.03)
  ciuffo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  ciuffo.updateMatrix()
  const pezzi = [{ geometria: new THREE.TubeGeometry(curva, 24, 0.024, 12, false), matrice: new THREE.Matrix4() }]
  for (const [ang, s] of [[0, 1.05], [0.6, 0.8], [-0.6, 0.8]]) {
    const m = matrice(new THREE.Vector3(), new THREE.Euler(0, ang * 0.6, ang), new THREE.Vector3(s, s, s))
    pezzi.push({ geometria: goccia, matrice: ciuffo.matrix.clone().multiply(m) })
  }
  gruppo.add(new THREE.Mesh(unisci(pezzi), materiale))
  return gruppo
}

function braccio(lato, materiale, geometria) {
  // appeso alla spalla: il perno è in cima, così oscilla come un braccio
  const perno = new THREE.Group()
  perno.position.set(lato * 0.73, 1.2, -0.02)
  const m = pelosa(geometria, materiale)
  m.position.set(lato * 0.06, -0.52, 0)
  m.scale.set(1, 1, 0.92)
  perno.add(m)
  perno.rotation.z = lato * 0.1
  return perno
}

/**
 * Il mostriciattolo intero. `radice` sta per terra; `salto` sale e scende
 * coi piedi; `corpo` respira e si gira; `parti` sono i pezzi che si animano
 * da soli.
 */
export function costruisciMostriciattolo() {
  const { geometria: gCorpo, fitti } = tornio(PROFILO_CORPO)

  const radice = new THREE.Group()
  const salto = new THREE.Group()
  const corpo = new THREE.Group()
  radice.add(salto)
  salto.add(corpo)

  const tronco = pelosa(gCorpo, pelliccia({ parte: 'corpo', viso: true, scalaUv: scalaPer(fitti, PASSO_PELO) }))
  tronco.scale.z = PROFONDITA
  const sopra = new THREE.Group()
  sopra.position.y = SOLLEVATO
  sopra.add(tronco)
  corpo.add(sopra)

  const faccia = new THREE.Group()
  const sorriso = bocca(fitti)
  faccia.add(sorriso)
  const occhi = [occhio(fitti, -1), occhio(fitti, 1)]
  faccia.add(...occhi)
  sopra.add(faccia)

  const scuro = vinile({ colore: ANTENNA, ruvido: 0.4, velluto: 0.5, lucido: 0.2 })
  const antenne = [antenna(-1, scuro), antenna(1, scuro)]
  for (const a of antenne) {
    a.position.y = 1.88
    sopra.add(a)
  }

  const { geometria: gBraccio, fitti: fBraccio } = tornio([[0, -0.2], [0.085, -0.185], [0.135, -0.12], [0.15, 0.02], [0.14, 0.22], [0.115, 0.4], [0.07, 0.52], [0, 0.55]], 28, 32)
  const matBraccio = pelliccia({ parte: 'braccio', lungo: 0.045, scalaUv: scalaPer(fBraccio, PASSO_PELO) })
  const braccia = [braccio(-1, matBraccio, gBraccio), braccio(1, matBraccio, gBraccio)]
  sopra.add(...braccia)

  const { geometria: gPiede, fitti: fPiede } = tornio([[0, 0], [0.1, 0], [0.17, 0.012], [0.19, 0.06], [0.175, 0.12], [0.11, 0.16], [0, 0.17]], 16, 32)
  const matPiede = pelliccia({ colore: ARANCIO_PIEDI, parte: 'piede', lungo: 0.035, scalaUv: scalaPer(fPiede, PASSO_PELO), gravita: [0, -0.15, 0.04] })
  // i due piedi in un disegno solo: stanno fermi l'uno rispetto all'altro
  const piedi = [pelosa(unisci([-1, 1].map(lato => ({
    geometria: gPiede,
    matrice: matrice(new THREE.Vector3(lato * 0.31, -0.02, 0.07), new THREE.Euler(), new THREE.Vector3(1.05, 1, 1.2))
  }))), matPiede)]
  salto.add(piedi[0])

  return { radice, salto, corpo, parti: { occhi, antenne, braccia, piedi, bocca: sorriso } }
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
      const s = 2.6 / alto
      gltf.scene.scale.setScalar(s)
      gltf.scene.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s)
      return { radice, salto, corpo, parti: { occhi: [], antenne: [], braccia: [], piedi: [], bocca: null } }
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
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(20,10,6,0.55)')
  r.addColorStop(0.45, 'rgba(20,10,6,0.25)')
  r.addColorStop(1, 'rgba(20,10,6,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.55), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }))
  m.rotation.x = -Math.PI / 2
  m.position.y = -0.02
  m.renderOrder = -1
  return m
}

const smorza = (da, a, velocita, dt) => a + (da - a) * Math.exp(-velocita * dt)

/**
 * La scena nel `canvas`. Torna i comandi: lo stato del guscio, dove guarda,
 * un salto, il cursore sopra di lui, e la zona del corpo per sapere se il
 * cursore ci sta sopra.
 */
export async function creaScena(canvas, { glb = '', prova = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power', premultipliedAlpha: true })
  renderer.setClearColor(0x000000, 0)
  // nitido: una volta e mezza la densità vera dello schermo, e almeno il
  // doppio: rimpicciolita, la tela in più fa da antialias ai peli sottili
  const densita = () => Math.min(Math.max((window.devicePixelRatio || 1) * 1.5, 2), 3)
  renderer.setPixelRatio(densita())
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05
  const largo = () => canvas.clientWidth || canvas.width
  const alto = () => canvas.clientHeight || canvas.height
  renderer.setSize(largo(), alto(), false)
  // la taglia cambia lo zoom della pagina, cioè la densità: la tela la segue
  const seguiDensita = () => {
    window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`)?.addEventListener?.('change', () => {
      renderer.setPixelRatio(densita())
      renderer.setSize(largo(), alto(), false)
      sveglia()
      seguiDensita()
    }, { once: true })
  }
  seguiDensita()

  const scena = new THREE.Scene()
  scena.environment = studio(renderer)
  scena.environmentIntensity = 0.75
  // tre luci da studio: calda davanti, fredde da dietro per il contorno, un riempimento morbido
  const chiave = new THREE.DirectionalLight('#FFE4C8', 2.1)
  chiave.position.set(-2.4, 3.2, 3.6)
  const contornoD = new THREE.DirectionalLight('#A8CCFF', 3.2)
  contornoD.position.set(3, 2.2, -3)
  const contornoS = new THREE.DirectionalLight('#A8CCFF', 2.4)
  contornoS.position.set(-3, 1.6, -3)
  scena.add(chiave, contornoD, contornoS, new THREE.HemisphereLight('#FFF1E4', '#5A3A2C', 0.55))

  const camera = new THREE.PerspectiveCamera(22, largo() / alto(), 0.1, 50)
  camera.position.set(0, 1.56, 7.9)
  camera.lookAt(0, 1.44, 0)

  const modello = await caricaModello(glb)
  const { radice, salto: saltello, corpo, parti } = modello
  scena.add(radice)
  const suolo = ombra()
  radice.add(suolo)

  const meno = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  let calmo = !!meno?.matches
  meno?.addEventListener?.('change', e => { calmo = e.matches; sveglia() })

  const stato = { guarda: true, attesa: false }
  const voluto = { x: 0, y: 0 }
  const sguardo = { x: 0, y: 0 }
  /** Il cursore sopra di lui: dove, e da quanto. Null se non c'è. */
  let tocco = null
  let attento = 0
  let sonno = 0
  let salto = -1
  let altezzaSalto = 0.12
  let tempo = 0
  let prossimoBattito = 2.5
  let battito = -1
  let inMoto = true
  const molle = parti.antenne.map(() => ({ a: 0, v: 0 }))

  /** Un salto di mezzo secondo, con lo schiacciamento alla partenza e all'arrivo. */
  function saltoA(t) {
    const d = 0.56
    if (t < 0 || t > d) return { y: 0, s: 1 }
    const p = t / d
    if (p < 0.16) return { y: 0, s: 1 - 0.12 * Math.sin((p / 0.16) * Math.PI) }
    if (p > 0.84) return { y: 0, s: 1 - 0.1 * Math.sin(((p - 0.84) / 0.16) * Math.PI) }
    const q = (p - 0.16) / 0.68
    return { y: altezzaSalto * 4 * q * (1 - q), s: 1 + 0.07 * Math.sin(q * Math.PI) }
  }

  function aggiorna(dt) {
    tempo += dt
    const dorme = !stato.guarda && !tocco
    sonno = smorza(sonno, dorme ? 1 : 0, 3, dt)
    attento = smorza(attento, tocco ? 1 : 0, 10, dt)
    // dove guarda: il cursore sopra di lui vince; dormendo, giù e un po' di lato
    const gx = tocco ? tocco.x : dorme ? 0.1 : voluto.x
    const gy = tocco ? tocco.y : dorme ? 0.45 : voluto.y
    const fretta = calmo ? 3 : tocco ? 12 : 6
    sguardo.x = smorza(sguardo.x, gx, fretta, dt)
    sguardo.y = smorza(sguardo.y, gy, fretta, dt)

    const respiro = Math.sin(tempo * Math.PI * 2 * 0.27 * (1 - sonno * 0.4))
    const ondeggia = calmo ? 0 : Math.sin(tempo * 0.7) * 0.02 * (1 - sonno)
    const { y: su, s: schiaccia } = saltoA(salto < 0 ? -1 : tempo - salto)
    if (salto >= 0 && tempo - salto > 0.56) salto = -1

    saltello.position.y = su
    corpo.rotation.y = sguardo.x * 0.5
    corpo.rotation.x = sguardo.y * 0.18 + sonno * 0.05
    corpo.rotation.z = ondeggia - sguardo.x * 0.03
    const r = (calmo ? 0.006 : 0.012) * respiro
    // attento si allunga un poco: è il «sì?» di chi viene chiamato
    const allunga = 1 + attento * 0.025
    corpo.scale.set(1 - r * 0.5 + (1 - schiaccia) * 0.6, (1 + r) * schiaccia * allunga, 1 - r * 0.5 + (1 - schiaccia) * 0.6)
    suolo.scale.setScalar(1 - su * 1.6)
    suolo.material.opacity = 1 - su * 2.5

    // le braccia pendono e oscillano appena; nel salto e quando lo si guarda si alzano un poco
    parti.braccia.forEach((b, i) => {
      const l = i === 0 ? -1 : 1
      b.rotation.z = l * (0.1 + (calmo ? 0 : 0.025 * Math.sin(tempo * 1.1 + i)) + su * 1.6 + attento * 0.12)
      b.rotation.x = -sguardo.x * 0.05 * l
    })

    // le palpebre: un battito ogni tanto; dormendo socchiuse, attento spalancate
    if (!prova && !calmo && battito < 0 && tempo > prossimoBattito) { battito = tempo; prossimoBattito = tempo + 2.4 + Math.random() * 3.6 }
    let chiuso = 0
    if (battito >= 0) {
      const p = (tempo - battito) / 0.15
      if (p >= 1) battito = -1
      else chiuso = Math.sin(p * Math.PI)
    }
    chiuso = Math.max(chiuso, sonno * 0.55)
    for (const o of parti.occhi) {
      const grande = 1 + attento * 0.14
      o.scale.set(grande, Math.max(0.08, 1 - chiuso * 0.92) * grande, grande)
      // gli occhi seguono anche loro, un poco più della testa
      const b = o.userData.bulbo
      if (b) { b.position.x = sguardo.x * 0.016; b.position.y = -sguardo.y * 0.012 }
    }

    // le antenne: una molla, spinta dal salto, dal giro della testa e da un filo d'aria
    molle.forEach((m, i) => {
      const l = i === 0 ? -1 : 1
      const spinta = -su * 7 + (calmo ? 0 : Math.sin(tempo * 1.7 + i * 1.3) * 0.25) - sguardo.x * 0.8
      const bersaglio = l * 0.05 + spinta * 0.07 + sonno * l * 0.22 - attento * l * 0.04
      m.v += ((bersaglio - m.a) * 70 - m.v * 6) * dt
      m.a += m.v * dt
      parti.antenne[i].rotation.z = m.a
      parti.antenne[i].rotation.x = -sonno * 0.15
    })

    // dormendo la bocca si stringe un poco; attento si apre di più
    if (parti.bocca) parti.bocca.scale.y = 1 - sonno * 0.35 + attento * 0.25
    condivisi.uSonno.value = sonno

    const verso = Math.abs(gx - sguardo.x) + Math.abs(gy - sguardo.y)
    const molla = molle.reduce((m, a) => Math.max(m, Math.abs(a.v)), 0)
    inMoto = verso > 0.01 || salto >= 0 || battito >= 0 || molla > 0.08 ||
      Math.abs(sonno - (dorme ? 1 : 0)) > 0.02 || Math.abs(attento - (tocco ? 1 : 0)) > 0.02
  }

  /* il giro dei fotogrammi: un timer per il passo, poi requestAnimationFrame per disegnare */
  let timer = 0
  let raf = 0
  let ultimo = performance.now()
  let fermo = false
  /*
   * Quanti fotogrammi al secondo. Solo quando qualcosa si muove davvero se
   * ne disegnano 30 (15 col movimento ridotto); fermo, il respiro e il
   * dondolio sono così lenti che 4 bastano a non vedere scatti, e dormendo 2.
   * Ogni fotogramma costa, il resto del tempo il Mac è di chi lavora.
   */
  const passo = () => 1000 / (inMoto ? (calmo ? 15 : 30) : sonno > 0.95 ? 2 : 4)

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

  /** Un fotogramma subito: arriva un cambio e il prossimo, a riposo, sarebbe fra un quarto di secondo. */
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

  // la zona del corpo sulla tela, in punti della pagina: un ovale intorno al tronco e alle braccia
  function zona() {
    const box = new THREE.Box3().expandByObject(corpo)
    const a = new THREE.Vector3(box.min.x, box.min.y - 0.1, 0).project(camera)
    const b = new THREE.Vector3(box.max.x, Math.min(box.max.y, 2.15), 0).project(camera)
    const w = largo(), h = alto()
    const x1 = (a.x + 1) / 2 * w, x2 = (b.x + 1) / 2 * w
    const y1 = (1 - (b.y + 1) / 2) * h, y2 = (1 - (a.y + 1) / 2) * h
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2 }
  }
  const ovale = zona()

  pianifica()

  const comandi = {
    /** Lo stato dal guscio: guarda (sveglio o no) e attesa (qualcosa aspetta: un salto quando arriva). */
    stato(s) {
      const primaAttesa = stato.attesa
      stato.guarda = !!s.guarda
      stato.attesa = !!s.attesa
      if (stato.attesa && !primaAttesa) comandi.salta()
      sveglia()
    },
    /** Dove sta il cursore, fra -1 e 1 (x a destra, y in giù). */
    guarda(x, y) {
      voluto.x = Math.max(-1, Math.min(1, Number(x) || 0))
      voluto.y = Math.max(-1, Math.min(1, Number(y) || 0))
      if (!tocco && Math.abs(voluto.x - sguardo.x) + Math.abs(voluto.y - sguardo.y) > 0.01) sveglia()
    },
    salta(alto = 0.12) {
      if (calmo) return
      if (salto < 0) { salto = tempo; altezzaSalto = alto }
      sveglia()
    },
    /**
     * Il cursore sopra di lui, in punti della pagina, o null quando se ne va.
     * Arrivando si drizza con un saltello e le antenne vibrano; poi lo segue
     * con gli occhi.
     */
    tocca(x, y) {
      if (x == null) { if (tocco) { tocco = null; sveglia() } return }
      const nuovo = !tocco
      tocco = {
        x: Math.max(-1, Math.min(1, (x - ovale.cx) / (ovale.rx * 1.6))),
        y: Math.max(-1, Math.min(1, (y - ovale.cy) / (ovale.ry * 1.4)))
      }
      if (nuovo) {
        comandi.salta(0.09)
        molle.forEach((m, i) => { m.v += (i === 0 ? -1 : 1) * 2.2 })
      }
      sveglia()
    },
    /** Il cursore è sopra il corpo? In punti della pagina. */
    sopra(x, y) {
      const dx = (x - ovale.cx) / ovale.rx
      const dy = (y - ovale.cy) / ovale.ry
      return dx * dx + dy * dy <= 1
    },
    zona: () => ({ ...ovale }),
    /** Solo per le prove: ferma il tempo e mette sguardo, sonno, attenzione e salto subito al loro posto. */
    posa(p = {}) {
      if (!prova) return
      fermo = false
      if ('guarda' in p) { voluto.x = p.guarda[0]; voluto.y = p.guarda[1]; sguardo.x = voluto.x; sguardo.y = voluto.y }
      if ('sveglio' in p) { stato.guarda = p.sveglio; sonno = p.sveglio ? 0 : 1 }
      if ('attento' in p) {
        tocco = p.attento ? { x: sguardo.x, y: sguardo.y } : null
        attento = p.attento ? 1 : 0
      }
      if ('tempo' in p) tempo = p.tempo
      if ('salto' in p) { salto = tempo - p.salto; altezzaSalto = 0.12 }
      molle.forEach(m => { m.v = 0 })
      aggiorna(0)
      if (!stato.guarda && !tocco) { sguardo.x = 0.1; sguardo.y = 0.45; aggiorna(0) }
      fermo = true
      renderer.render(scena, camera)
    },
    /** Solo per le prove: quanti fotogrammi ha disegnato finora. */
    info: () => renderer.info.render
  }
  return comandi
}
