// Il mostriciattolo in 3D: il corpo, la faccia, la luce, e come si muove.
//
// È il personaggio del disegno di riferimento (`~/Desktop/Mascot.png`, la
// posa grande e i cinque angoli): un fagiolo a pera arancio ruggine, testa e
// corpo una massa sola, più largo in basso, la pancia panna grande e bassa,
// due piedini ovali, braccia corte attaccate ai fianchi con le manopole a tre
// dita, gli occhi grandi neri e lucidi con un punto di luce forte, due
// sopracciglia scure, un sorriso aperto con la linguetta rosa e due
// dentini, e due antenne sottili con un ciuffo di setole che va dal quasi
// nero alla base all'arancio acceso in punta.
//
// Il pelo sono gusci (`pelliccia`): la stessa superficie disegnata `STRATI`
// volte in un disegno solo (istanze), ogni strato un po' più fuori lungo la
// normale, e in ogni strato restano solo i punti dove passa un pelo. Peli
// fitti e un poco a punta, con le punte più chiare che prendono il contorno
// freddo da dietro. Le setole delle antenne sono lo stesso trucco su un fuso
// sottile, con peli lunghi e il colore che sale dalla base alla punta.
//
// Ha le sue ossa (`parti`): il busto che respira, la testa che si gira un
// poco, le due spalle e i due polsi, i due piedi, le due antenne a molla.
// Così fa le sue cose: respira e sbatte gli occhi; col cursore sopra saluta
// con la mano come nel disegno; salta (si accuccia, stacca con le gambe
// raccolte, si allunga, atterra schiacciandosi) quando qualcosa finisce o
// aspetta e, se è giocoso, ogni tanto da solo; fa una giravolta col doppio
// clic e ogni tanto; ridacchia con le mani sulla bocca quando gli si scrive;
// e ogni tanto fa un passetto di lato e torna, senza andarsene in giro.
// Dormendo chiude gli occhi.
//
// La profondità è luce: un ambiente da studio fatto qui (pannelli luminosi
// passati da PMREMGenerator), una luce calda davanti a sinistra, due fredde
// da dietro che disegnano il contorno anche sul bosco scuro, un'ombra finta
// dove le parti si toccano e un'ombra morbida per terra.
//
// Un modello vero può prendere il suo posto: se accanto c'è
// `icone/compagno.glb`, `caricaModello` lo legge con GLTFLoader e il resto
// (sguardo, respiro, salto) muove quello. Le parti che il GLB non ha
// semplicemente non si muovono. Nel pacchetto electron-builder lascia fuori
// ogni `node_modules/*/examples`, cioè anche GLTFLoader: senza una copia del
// loader accanto a questa pagina, il GLB non si legge e resta quello fatto a
// mano (lo dice la console, non si rompe niente).
//
// Costa poco per scelta: 30 fotogrammi al secondo solo quando qualcosa si
// muove davvero, 3 a riposo, 2 dormendo, nessuno quando la finestra non si
// vede. La pagina che lo ospita è `compagno.html`, i gesti sono in
// `compagno.js`.

import * as THREE from 'three'

/* ------------------------------------------------------------ i colori */

const ARANCIO = '#EA6E30'
const ARANCIO_PIEDI = '#DC6129'
const PANNA = '#FCF1DE'
const BOCCA = '#3A0C08'
const LINGUA = '#F08C8C'
const DENTI = '#FFF8EE'
const OCCHI = '#0E0907'
const SOPRACCIGLIA = '#2A1610'
const SETOLE_BUIE = '#21140F'
const SETOLE_VIVE = '#FF7A2C'

/* ------------------------------------------------------------ le misure (unità della scena) */

/** Il profilo del corpo, dal fondo alla cima: [raggio, altezza]. Più largo in basso, la testa nella stessa massa. */
const PROFILO_CORPO = [
  [0, 0], [0.42, 0.02], [0.64, 0.09], [0.76, 0.26], [0.8, 0.46], [0.79, 0.7],
  [0.75, 0.93], [0.71, 1.16], [0.665, 1.4], [0.6, 1.58], [0.47, 1.73], [0.27, 1.82], [0, 1.86]
]
const PROFONDITA = 0.88
/** Il corpo sta su questo: sotto ci sono i piedi. */
const SOLLEVATO = 0.15
/** Dove stanno occhi, sopracciglia e bocca sul corpo (spazio del tronco). */
const OCCHIO = { x: 0.28, y: 1.31, r: 0.104 }
const SOPRA_OCCHIO = 0.19
const BOCCA_Y = 1.08
/** Dove si attaccano le braccia, e quanto sono lunghe fino al polso. */
const SPALLA = { x: 0.73, y: 0.93, z: 0.04 }
const BRACCIO = 0.46

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

/** Pezzi già al loro posto, ognuno del suo colore: una geometria sola coi colori sui vertici. */
function colorata(pezzi) {
  const pos = [], nor = [], col = []
  const c = new THREE.Color()
  for (const { geometria, colore } of pezzi) {
    const g = geometria.index ? geometria.toNonIndexed() : geometria
    c.set(colore)
    pos.push(...g.attributes.position.array)
    nor.push(...g.attributes.normal.array)
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b)
  }
  const u = new THREE.BufferGeometry()
  u.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  u.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  u.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
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

/** Quello che i materiali condividono: il sonno toglie un filo di colore, niente di più. */
const condivisi = {
  uSonno: { value: 0 },
  uPanna: { value: new THREE.Color(PANNA) },
  uBuio: { value: new THREE.Color(SETOLE_BUIE) },
  uVivo: { value: new THREE.Color(SETOLE_VIVE) }
}

/*
 * I pezzi di shader che la pelliccia aggiunge, secondo la parte: la pancia
 * panna sul corpo, il colore che sale lungo le setole delle antenne, e
 * un'ombra finta dove le parti si toccano. Sono nello spazio dell'oggetto
 * (`vPosO`), così seguono il corpo che respira e si gira.
 */
const PITTURA = {
  corpo: /* glsl */ `
    vec2 qp = (vPosO.xy - vec2(0.0, 0.56)) / vec2(0.6, 0.5);
    float pancia = (1.0 - smoothstep(0.95, 1.02, length(qp) + (r - 0.5) * 0.05)) * smoothstep(0.04, 0.18, vPosO.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, uPanna, pancia);
    float ao = 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.3, vPosO.y));
    float sottoBraccio = smoothstep(0.58, 0.72, abs(vPosO.x)) * (1.0 - smoothstep(0.0, 0.42, abs(vPosO.y - 0.67))) * (1.0 - smoothstep(0.05, 0.42, abs(vPosO.z)));
    ao *= 1.0 - 0.32 * sottoBraccio;
    diffuseColor.rgb *= ao;
  `,
  // il braccio: più scuro in cima, dove si attacca
  braccio: /* glsl */ `
    diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(-0.05, 0.08, vPosO.y);
  `,
  // il piede: più scuro in cima, sotto la pancia
  piede: /* glsl */ `
    diffuseColor.rgb *= 1.0 - 0.3 * smoothstep(0.1, 0.18, vPosO.y);
  `,
  // le setole: quasi nere alla base e dentro, arancio acceso in punta e in alto
  antenna: /* glsl */ `
    float lungoA = clamp(vPosO.y / 0.75, 0.0, 1.0);
    diffuseColor.rgb = mix(uBuio, uVivo, smoothstep(0.45, 0.92, vH * 0.9 + lungoA * 0.35));
  `,
  liscio: ''
}

/*
 * Dove il pelo si abbassa sul viso: occhi, sopracciglia e bocca sono cuciti
 * sopra, come su un peluche, e il pelo intorno si apre un poco.
 */
const VISO = /* glsl */ `
  if (vPosO.z > 0.0) {
    float oS = length(vec2(vPosO.x + ${OCCHIO.x}, (vPosO.y - ${OCCHIO.y}) * 0.9)) / 0.14;
    float oD = length(vec2(vPosO.x - ${OCCHIO.x}, (vPosO.y - ${OCCHIO.y}) * 0.9)) / 0.14;
    float sS = length(vec2((vPosO.x + ${OCCHIO.x + 0.01}) / 0.1, (vPosO.y - ${(OCCHIO.y + SOPRA_OCCHIO).toFixed(3)}) / 0.045));
    float sD = length(vec2((vPosO.x - ${OCCHIO.x + 0.01}) / 0.1, (vPosO.y - ${(OCCHIO.y + SOPRA_OCCHIO).toFixed(3)}) / 0.045));
    float labbra = length(vec2(vPosO.x / 0.25, (vPosO.y - ${(BOCCA_Y - 0.06).toFixed(3)}) / 0.13));
    float vicino = min(min(min(oS, oD), min(sS, sD)), labbra);
    tetto = min(tetto, smoothstep(0.8, 1.3, vicino));
  }
`

/* le setole delle antenne: il fusto in basso resta nudo, il ciuffo è in alto */
const SETOLE = /* glsl */ `
  tetto *= smoothstep(0.18, 0.42, vPosO.y / 0.75);
`

/*
 * La pelliccia: la stessa superficie disegnata `STRATI` volte in un disegno
 * solo (istanze), ogni strato un po' più fuori lungo la normale; in ogni
 * strato restano solo i punti dove passa un pelo abbastanza lungo. La luce è
 * quella vera della scena (MeshStandardMaterial), e le punte prendono il
 * contorno freddo da dietro.
 */
const STRATI = 26
/** Quanto è largo un pelo, in unità della scena: un punto o poco più sullo schermo. */
const PASSO_PELO = 0.013

function pelliccia({ colore = ARANCIO, parte = 'liscio', lungo = 0.066, scalaUv = [200, 140], gravita = [0, -0.35, 0.06], viso = false, setole = false, punta = 0.62 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: colore, roughness: 0.86, envMapIntensity: 0.7 })
  const propri = {
    uLungo: { value: lungo },
    uStrati: { value: STRATI },
    uGravita: { value: new THREE.Vector3(...gravita) },
    uScalaUv: { value: new THREE.Vector2(...scalaUv) },
    uPunte: { value: new THREE.Color('#BFDCFF') },
    uPunta: { value: punta }
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
        uniform float uSonno; uniform vec3 uPanna; uniform vec3 uBuio; uniform vec3 uVivo; uniform vec2 uScalaUv; uniform vec3 uPunte; uniform float uPunta;
        float casoP(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 cella = vUvP * uScalaUv;
        cella.x += casoP(vec2(floor(cella.y), 9.1));
        vec2 id = floor(cella);
        float r = casoP(id);
        if (vH > 0.0) {
          // ogni pelo ha la sua lunghezza, il suo posto nella cella, e finisce a punta
          float tetto = mix(0.5, 1.0, r);
          ${viso ? VISO : ''}
          ${setole ? SETOLE : ''}
          vec2 centro = (vec2(casoP(id + 3.1), casoP(id + 7.7)) - 0.5) * 0.4;
          float raggio = 0.58 * pow(max(1.0 - vH / max(tetto, 0.001), 0.0), uPunta);
          if (vH > tetto || length(fract(cella) - 0.5 - centro) > raggio) discard;
        }
        ${PITTURA[parte]}
        // alla radice un poco più scuro, in punta più chiaro: il pelo del disegno ha le punte chiare
        diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 0.8, vH)) * (0.96 + 0.08 * r);
        diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.32 + 0.03, vec3(1.0)), vH * vH);
        float grigio = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(grigio), 0.1 * uSonno);`)
      // le punte dei peli prendono la luce di contorno: più fuori sono, più brillano di taglio
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float taglio = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);
        totalEmissiveRadiance += uPunte * taglio * vH * 0.22;`)
  }
  m.customProgramCacheKey = () => `pelliccia-${parte}-${viso}-${setole}`
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
  g.boundingSphere.radius += 0.15
  const m = new THREE.Mesh(g, materiale)
  m.frustumCulled = false
  return m
}

/** Quante celle di pelo lungo il giro e lungo il profilo, perché i peli siano quasi tondi. */
function scalaPer(fitti, passo) {
  let lungo = 0, largo = 0
  for (let i = 1; i < fitti.length; i++) lungo += fitti[i].distanceTo(fitti[i - 1])
  for (const p of fitti) largo = Math.max(largo, p.x)
  return [Math.max(6, Math.round((2 * Math.PI * largo) / passo)), Math.round(lungo / passo)]
}

/** Uno studio fotografico in piccolo: la luce che si riflette negli occhi e sul pelo. */
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

/* ------------------------------------------------------------ la faccia */

/** Una forma piatta appoggiata sulla superficie del corpo davanti, un filo sopra. */
function sullaPelle(forma, fitti, sopra, segmenti = 24) {
  const g = new THREE.ShapeGeometry(forma, segmenti)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i)
    p.setZ(i, davanti(fitti, x, y) + sopra)
  }
  g.computeVertexNormals()
  return g
}

/** Il sorriso aperto: il bordo di sopra quasi dritto, sotto tondo; dentro la linguetta e due dentini. */
function bocca(fitti) {
  const larga = 0.23, alta = 0.15, y0 = BOCCA_Y
  const forma = new THREE.Shape()
  forma.moveTo(-larga, y0 + 0.012)
  forma.quadraticCurveTo(0, y0 - 0.03, larga, y0 + 0.012)
  forma.bezierCurveTo(larga * 0.85, y0 - alta * 1.25, -larga * 0.85, y0 - alta * 1.25, -larga, y0 + 0.012)
  // la bocca, la linguetta e i due dentini: un disegno solo, coi colori sui vertici
  const pezzi = [{ geometria: sullaPelle(forma, fitti, 0.012), colore: BOCCA }]
  const lingua = new THREE.Shape()
  // la linguetta sta dentro la bocca, in basso e un poco di lato
  lingua.absellipse(0.015, y0 - alta * 0.66, 0.08, 0.034, 0, Math.PI * 2, false, 0)
  pezzi.push({ geometria: sullaPelle(lingua, fitti, 0.017), colore: LINGUA })
  // i due dentini in alto, in mezzo
  for (const x of [-0.04, 0.04]) {
    const d = new THREE.Shape()
    d.moveTo(x - 0.026, y0 - 0.006)
    d.lineTo(x + 0.026, y0 - 0.006)
    d.quadraticCurveTo(x + 0.026, y0 - 0.045, x, y0 - 0.048)
    d.quadraticCurveTo(x - 0.026, y0 - 0.045, x - 0.026, y0 - 0.006)
    pezzi.push({ geometria: sullaPelle(d, fitti, 0.019, 8), colore: DENTI })
  }
  const gruppo = new THREE.Group()
  gruppo.add(new THREE.Mesh(colorata(pezzi), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 })))
  // il perno all'altezza della bocca: aprirla e chiuderla si fa lì, non scivola giù
  const perno = new THREE.Group()
  perno.position.y = y0
  gruppo.position.y = -y0
  perno.add(gruppo)
  return perno
}

const materialeOcchio = new THREE.MeshPhysicalMaterial({ color: OCCHI, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 })
const materialeLuce = new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false })
const materialeScuro = new THREE.MeshStandardMaterial({ color: SOPRACCIGLIA, roughness: 0.7 })

/** Un archetto scuro: le sopracciglia, e gli occhi quando ride (^) o dorme (‿). */
function archetto(larga, alta, spesso) {
  const curva = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-larga, 0, 0), new THREE.Vector3(0, alta * 2, 0.01), new THREE.Vector3(larga, 0, 0))
  return new THREE.TubeGeometry(curva, 16, spesso, 6, false)
}

/**
 * Un occhio: il bulbo nero lucido con i due punti di luce, e l'archetto che
 * prende il suo posto quando ride (^) o dorme (‿).
 */
function occhio(fitti, lato) {
  const x = lato * OCCHIO.x
  const y = OCCHIO.y
  const gruppo = new THREE.Group()
  gruppo.position.set(x, y, davanti(fitti, x, y) - 0.03)
  // girato come la superficie, così chiudendolo si schiaccia lungo il viso
  gruppo.rotation.y = Math.asin(Math.max(-1, Math.min(1, x / 0.72))) * 0.85
  const bulbo = new THREE.Group()
  const nero = new THREE.Mesh(new THREE.SphereGeometry(OCCHIO.r, 32, 24), materialeOcchio)
  nero.scale.set(0.92, 1.05, 0.66)
  const luci = new THREE.Mesh(unisci([
    { geometria: new THREE.SphereGeometry(0.034, 16, 12), matrice: matrice(new THREE.Vector3(-0.032, 0.036, 0.058)) },
    { geometria: new THREE.SphereGeometry(0.014, 12, 8), matrice: matrice(new THREE.Vector3(0.036, -0.03, 0.058)) }
  ]), materialeLuce)
  bulbo.add(nero, luci)
  const arco = new THREE.Mesh(archetto(0.078, 0.045, 0.019), materialeScuro)
  arco.position.set(0, -0.01, 0.085)
  arco.visible = false
  gruppo.add(bulbo, arco)
  gruppo.userData = { bulbo, arco }
  return gruppo
}

/** Le due sopracciglia, in un disegno solo: archi scuri sopra gli occhi, un poco inclinati in fuori. */
function sopracciglia(fitti) {
  const pezzi = [-1, 1].map(lato => {
    const x = lato * (OCCHIO.x + 0.01)
    const y = OCCHIO.y + SOPRA_OCCHIO
    return {
      geometria: archetto(0.07, 0.022, 0.012),
      matrice: matrice(new THREE.Vector3(x, y, davanti(fitti, x, y) + 0.03), new THREE.Euler(0, Math.asin(x / 0.7) * 0.8, -lato * 0.18))
    }
  })
  return new THREE.Mesh(unisci(pezzi), materialeScuro)
}

/* ------------------------------------------------------------ antenne, braccia, piedi */

/** Un'antenna: un fuso sottile scuro, con le setole lunghe sulla parte alta. A molla dalla base. */
function antenna(lato, materiale, geometria) {
  const perno = new THREE.Group()
  perno.position.set(lato * 0.2, 1.76, 0.02)
  perno.rotation.z = -lato * 0.38
  const m = pelosa(geometria, materiale)
  perno.add(m)
  return perno
}

/** La manopola: il palmo e tre ditini tondi, che puntano lungo +y dal polso. */
function geometriaMano() {
  const palmo = new THREE.SphereGeometry(1, 24, 16)
  const dito = new THREE.SphereGeometry(1, 14, 10)
  return unisci([
    { geometria: palmo, matrice: matrice(new THREE.Vector3(0, 0.1, 0), new THREE.Euler(), new THREE.Vector3(0.15, 0.14, 0.11)) },
    { geometria: dito, matrice: matrice(new THREE.Vector3(-0.088, 0.21, 0), new THREE.Euler(0, 0, 0.42), new THREE.Vector3(0.055, 0.085, 0.055)) },
    { geometria: dito, matrice: matrice(new THREE.Vector3(0, 0.245, 0), new THREE.Euler(), new THREE.Vector3(0.058, 0.09, 0.058)) },
    { geometria: dito, matrice: matrice(new THREE.Vector3(0.088, 0.21, 0), new THREE.Euler(0, 0, -0.42), new THREE.Vector3(0.055, 0.085, 0.055)) }
  ])
}

/**
 * Un braccio: dalla spalla scende lungo -y fino al polso, e al polso la
 * manopola con le dita in giù. La spalla e il polso sono i due perni: alzata
 * la spalla, le dita vanno in su.
 */
function braccio(lato, materiale, gBraccio, gMano, matMano) {
  const spalla = new THREE.Group()
  spalla.position.set(lato * SPALLA.x, SPALLA.y, SPALLA.z)
  spalla.add(pelosa(gBraccio, materiale))
  const polso = new THREE.Group()
  polso.position.y = -BRACCIO
  polso.rotation.z = Math.PI
  polso.add(pelosa(gMano, matMano))
  spalla.add(polso)
  spalla.userData = { polso }
  return spalla
}

/**
 * Il mostriciattolo intero. `radice` sta per terra; `salto` sale e scende e
 * fa il passetto; `corpo` si gira (sguardo, giravolta); `busto` respira e si
 * schiaccia; `parti` sono le ossa che si animano da sole.
 */
export function costruisciMostriciattolo() {
  const { geometria: gCorpo, fitti } = tornio(PROFILO_CORPO)

  const radice = new THREE.Group()
  const salto = new THREE.Group()
  const corpo = new THREE.Group()
  const busto = new THREE.Group()
  radice.add(salto)
  salto.add(corpo)
  busto.position.y = SOLLEVATO
  corpo.add(busto)

  const tronco = pelosa(gCorpo, pelliccia({ parte: 'corpo', viso: true, scalaUv: scalaPer(fitti, PASSO_PELO) }))
  tronco.scale.z = PROFONDITA
  busto.add(tronco)

  // la testa: la stessa massa del corpo, ma la faccia e le antenne hanno il loro perno per girarsi un poco
  const testa = new THREE.Group()
  testa.position.set(0, 1.26, 0)
  const viso = new THREE.Group()
  viso.position.set(0, -1.26, 0)
  testa.add(viso)
  busto.add(testa)
  const sorriso = bocca(fitti)
  const occhi = [occhio(fitti, -1), occhio(fitti, 1)]
  viso.add(sorriso, ...occhi, sopracciglia(fitti))

  const { geometria: gAntenna, fitti: fAntenna } = tornio([[0, 0], [0.016, 0.01], [0.017, 0.24], [0.019, 0.48], [0.016, 0.68], [0, 0.75]], 24, 12)
  const matAntenna = pelliccia({ parte: 'antenna', setole: true, lungo: 0.25, punta: 1.1, scalaUv: scalaPer(fAntenna, 0.011), gravita: [0, 0.35, 0] })
  const antenne = [antenna(-1, matAntenna, gAntenna), antenna(1, matAntenna, gAntenna)]
  viso.add(...antenne)

  const { geometria: gBraccio, fitti: fBraccio } = tornio([[0, -BRACCIO - 0.04], [0.1, -BRACCIO - 0.02], [0.13, -BRACCIO + 0.06], [0.14, -0.2], [0.135, 0], [0.095, 0.08], [0, 0.1]], 28, 32)
  const matBraccio = pelliccia({ parte: 'braccio', lungo: 0.055, scalaUv: scalaPer(fBraccio, PASSO_PELO) })
  const gMano = geometriaMano()
  const matMano = pelliccia({ parte: 'liscio', lungo: 0.045, scalaUv: [60, 40] })
  const braccia = [braccio(-1, matBraccio, gBraccio, gMano, matMano), braccio(1, matBraccio, gBraccio, gMano, matMano)]
  busto.add(...braccia)

  // i piedi: ovali, un poco in avanti, ognuno col suo perno per alzarsi
  const { geometria: gPiede, fitti: fPiede } = tornio([[0, 0], [0.11, 0.004], [0.17, 0.035], [0.19, 0.085], [0.165, 0.145], [0.09, 0.175], [0, 0.18]], 16, 32)
  const matPiede = pelliccia({ colore: ARANCIO_PIEDI, parte: 'piede', lungo: 0.04, scalaUv: scalaPer(fPiede, PASSO_PELO), gravita: [0, -0.15, 0.04] })
  const piedi = [-1, 1].map(lato => {
    const perno = new THREE.Group()
    perno.position.set(lato * 0.32, -0.01, 0.1)
    const p = pelosa(gPiede, matPiede)
    p.scale.set(1.15, 1.0, 1.55)
    perno.add(p)
    corpo.add(perno)
    return perno
  })

  return { radice, salto, corpo, parti: { busto, testa, occhi, antenne, braccia, piedi, bocca: sorriso } }
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
      const s = 2.8 / alto
      gltf.scene.scale.setScalar(s)
      gltf.scene.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s)
      return { radice, salto, corpo, parti: { busto: null, testa: null, occhi: [], antenne: [], braccia: [], piedi: [], bocca: null } }
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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.62), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }))
  m.rotation.x = -Math.PI / 2
  m.position.y = -0.02
  m.renderOrder = -1
  return m
}

const smorza = (da, a, velocita, dt) => a + (da - a) * Math.exp(-velocita * dt)
const GIU = new THREE.Vector3(0, -1, 0)
const direzione = new THREE.Vector3()
const manoAllaBocca = new THREE.Quaternion()
const liscia = x => x * x * (3 - 2 * x)
const tra = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)))

/** Quanto dura ogni gesto, in secondi. */
const DURATE = { salto: 0.95, giravolta: 1.1, ridacchia: 1.7, passetto: 0.9 }

/**
 * La scena nel `canvas`. Torna i comandi: lo stato del guscio, dove guarda,
 * i gesti (salto, giravolta, ridacchia), il cursore sopra di lui, e la zona
 * del corpo per sapere se il cursore ci sta sopra.
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
  scena.add(chiave, contornoD, contornoS, new THREE.HemisphereLight('#FFF1E4', '#5A3A2C', 0.6))

  // lui in piedi, con il posto per le antenne, la mano alzata e il salto
  const camera = new THREE.PerspectiveCamera(24, largo() / alto(), 0.1, 50)
  camera.position.set(0, 1.56, 8.4)
  camera.lookAt(0, 1.45, 0)

  const modello = await caricaModello(glb)
  const { radice, salto: saltello, corpo, parti } = modello
  scena.add(radice)
  const suolo = ombra()
  radice.add(suolo)

  const meno = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  let calmo = !!meno?.matches
  meno?.addEventListener?.('change', e => { calmo = e.matches; sveglia() })

  const stato = { guarda: true, attesa: false, giocoso: true }
  const voluto = { x: 0, y: 0 }
  const sguardo = { x: 0, y: 0 }
  /** Il cursore sopra di lui: dove, fra -1 e 1. Null se non c'è. */
  let tocco = null
  let attento = 0
  let sonno = 0
  let tempo = 0
  let prossimoBattito = 2.5
  let battito = -1
  /** Il gesto in corso: nome, quando è cominciato, e per il passetto da che parte. */
  let gesto = null
  let prossimoPasso = 9 + Math.random() * 10
  let prossimoGioco = 150 + Math.random() * 150
  let inMoto = true
  /** Per le prove: un giro fisso in più, per vederlo di tre quarti o di schiena. */
  let giroFisso = 0
  const molle = parti.antenne.map(() => ({ a: 0, v: 0 }))

  function comincia(nome, opz = {}) {
    if (calmo && nome !== 'ridacchia') return false
    if (gesto && gesto.nome !== 'passetto') return false
    gesto = { nome, da: tempo, lato: opz.lato ?? (Math.random() < 0.5 ? -1 : 1) }
    sveglia()
    return true
  }

  /** La posa di un momento: tutto quello che i gesti cambiano, partendo da fermo. */
  function posa() {
    return {
      su: 0, dx: 0, sy: 1, giro: 0, piega: 0, inchina: 0,
      // spalle: z apre di lato (positivo in fuori), x porta avanti (negativo in avanti)
      spalle: [{ z: 0.16, x: -0.22 }, { z: 0.16, x: -0.22 }],
      polsi: [0, 0],
      piedi: [{ y: 0, x: 0 }, { y: 0, x: 0 }],
      occhi: 'aperti', grandi: 0, bocca: 1, spinta: 0,
      // quanto le mani vanno alla bocca (la risatina), fra 0 e 1
      mani: 0
    }
  }

  /** Il gesto in corso sopra la posa: il suo pezzo, alla fase `p` fra 0 e 1. */
  function applicaGesto(P, g, p) {
    if (g.nome === 'salto') {
      if (p < 0.2) {
        const k = liscia(p / 0.2)
        P.sy = 1 - 0.16 * k
        P.spalle.forEach(s => { s.z = 0.26 - 0.12 * k; s.x = 0.25 * k })
      } else if (p < 0.78) {
        const q = (p - 0.2) / 0.58
        P.su = 0.26 * 4 * q * (1 - q)
        P.sy = 1 + 0.09 * Math.sin(Math.min(1, q * 1.6) * Math.PI)
        const alza = Math.sin(q * Math.PI)
        P.spalle.forEach(s => { s.z = 0.26 + 1.8 * alza; s.x = -0.2 * alza })
        P.piedi.forEach(f => { f.y = 0.08 * alza; f.x = -0.75 * alza })
        P.grandi = alza
        P.spinta = q < 0.5 ? -1 : 1
      } else {
        const k = (p - 0.78) / 0.22
        P.sy = 1 - 0.13 * Math.sin(k * Math.PI)
      }
    } else if (g.nome === 'giravolta') {
      const k = liscia(p)
      P.giro = Math.PI * 2 * k
      P.su = 0.15 * Math.sin(p * Math.PI)
      const apri = Math.sin(p * Math.PI)
      P.spalle.forEach(s => { s.z = 0.26 + 1.0 * apri })
      P.grandi = apri
    } else if (g.nome === 'ridacchia') {
      const env = liscia(tra(0, 0.18, p)) * (1 - liscia(tra(0.8, 1, p)))
      // le mani alla bocca: braccia avanti e in su, verso il centro
      // verso la bocca, davanti alla faccia: la direzione si dà e la spalla la segue
      P.mani = env
      P.polsi = [-0.5 * env, -0.5 * env]
      if (env > 0.35) P.occhi = 'ride'
      P.piega = 0.05 * Math.sin(tempo * 26) * env
      P.su = 0.02 * Math.abs(Math.sin(tempo * 13)) * env
      P.inchina = 0.08 * env
      P.spinta = Math.sin(tempo * 13) * env
    } else if (g.nome === 'passetto') {
      const s = Math.sin(p * Math.PI)
      P.dx = g.lato * 0.07 * s
      P.piega = -g.lato * 0.05 * s
      // prima si alza il piede dalla parte del passo, poi l'altro
      const i = g.lato < 0 ? 0 : 1
      P.piedi[i].y = 0.05 * Math.max(0, Math.sin(p * 2 * Math.PI))
      P.piedi[1 - i].y = 0.05 * Math.max(0, -Math.sin(p * 2 * Math.PI))
    }
  }

  function aggiorna(dt) {
    tempo += dt
    const dorme = !stato.guarda && !tocco
    sonno = smorza(sonno, dorme ? 1 : 0, 3, dt)
    attento = smorza(attento, tocco ? 1 : 0, 9, dt)
    // dove guarda: il cursore sopra di lui vince; dormendo, giù
    const gx = tocco ? tocco.x : dorme ? 0.05 : voluto.x
    const gy = tocco ? tocco.y : dorme ? 0.4 : voluto.y
    const fretta = calmo ? 3 : tocco ? 12 : 6
    sguardo.x = smorza(sguardo.x, gx, fretta, dt)
    sguardo.y = smorza(sguardo.y, gy, fretta, dt)

    // i gesti che vengono da soli: il passetto ogni tanto, e se è giocoso un salto o una giravolta ogni qualche minuto
    if (!prova && !calmo && !gesto && !tocco && stato.guarda) {
      if (tempo > prossimoPasso) { comincia('passetto'); prossimoPasso = tempo + 10 + Math.random() * 14 }
      else if (stato.giocoso && tempo > prossimoGioco) {
        comincia(Math.random() < 0.5 ? 'salto' : 'giravolta')
        prossimoGioco = tempo + 150 + Math.random() * 180
      }
    }

    const P = posa()
    // col cursore sopra: saluta con la mano destra (la sua sinistra, come nel disegno), occhi grandi
    if (attento > 0.01 && !calmo) {
      const d = P.spalle[1]
      d.z = d.z + (2.45 + 0.22 * Math.sin(tempo * 8.5) - d.z) * attento
      d.x = d.x + (-0.35 - d.x) * attento
      P.polsi[1] = 0.25 * Math.sin(tempo * 8.5 + 0.8) * attento
      P.spalle[0].z += 0.12 * attento
    }
    P.grandi = Math.max(P.grandi, attento)
    if (gesto) {
      const p = (tempo - gesto.da) / DURATE[gesto.nome]
      if (p >= 1) gesto = null
      else applicaGesto(P, gesto, p)
    }
    if (sonno > 0.5 && P.occhi === 'aperti') P.occhi = 'chiusi'

    const respiro = Math.sin(tempo * Math.PI * 2 * 0.27 * (1 - sonno * 0.4))
    const ondeggia = calmo ? 0 : Math.sin(tempo * 0.7) * 0.02 * (1 - sonno)

    saltello.position.set(P.dx, P.su, 0)
    corpo.rotation.y = sguardo.x * 0.42 + P.giro + giroFisso
    corpo.rotation.x = sguardo.y * 0.12 + sonno * 0.04 + P.inchina
    corpo.rotation.z = ondeggia + P.piega - sguardo.x * 0.025
    const r = (calmo ? 0.006 : 0.013) * respiro
    const busto = parti.busto
    if (busto) busto.scale.set(1 - r * 0.5 + (1 - P.sy) * 0.55, (1 + r) * P.sy * (1 + attento * 0.02), 1 - r * 0.5 + (1 - P.sy) * 0.55)
    else corpo.scale.set(1, P.sy, 1)
    if (parti.testa) {
      parti.testa.rotation.y = sguardo.x * 0.12
      parti.testa.rotation.x = sguardo.y * 0.08 + sonno * 0.05
    }
    suolo.scale.setScalar(Math.max(0.3, 1 - P.su * 1.5))
    suolo.material.opacity = Math.max(0.2, 1 - P.su * 2.2)

    // le braccia: spalla e polso; un filo d'aria quando non fanno niente
    parti.braccia.forEach((b, i) => {
      const l = i === 0 ? -1 : 1
      const s = P.spalle[i]
      b.rotation.set(s.x, 0, l * (s.z + (calmo ? 0 : 0.02 * Math.sin(tempo * 1.1 + i))))
      // per la risatina le spalle vengono avanti, così le braccia girano intorno alla pancia e non dentro
      b.position.set(l * (SPALLA.x - 0.08 * P.mani), SPALLA.y, SPALLA.z + 0.28 * P.mani)
      if (P.mani > 0) {
        // dalla spalla verso la bocca, quasi tutto in avanti: le mani arrivano davanti alla faccia
        direzione.set(-l * 0.36, 0.24, 0.9).normalize()
        manoAllaBocca.setFromUnitVectors(GIU, direzione)
        b.quaternion.slerp(manoAllaBocca, P.mani)
      }
      if (b.userData.polso) b.userData.polso.rotation.z = Math.PI + l * P.polsi[i]
    })
    parti.piedi.forEach((f, i) => {
      f.position.y = -0.01 + P.piedi[i].y
      f.rotation.x = P.piedi[i].x
    })

    // gli occhi: aperti (con un battito ogni tanto), ^ quando ride, ‿ quando dorme
    if (!prova && !calmo && battito < 0 && tempo > prossimoBattito) { battito = tempo; prossimoBattito = tempo + 2.4 + Math.random() * 3.6 }
    let chiuso = 0
    if (battito >= 0) {
      const p = (tempo - battito) / 0.15
      if (p >= 1) battito = -1
      else chiuso = Math.sin(p * Math.PI)
    }
    for (const o of parti.occhi) {
      const { bulbo, arco } = o.userData
      const aperti = P.occhi === 'aperti'
      bulbo.visible = aperti
      arco.visible = !aperti
      arco.scale.y = P.occhi === 'chiusi' ? -1 : 1
      const g = 1 + P.grandi * 0.12
      bulbo.scale.set(g, Math.max(0.08, 1 - chiuso * 0.92) * g, g)
      // gli occhi seguono anche loro, un poco più della testa
      bulbo.position.x = sguardo.x * 0.016
      bulbo.position.y = -sguardo.y * 0.012
    }
    if (parti.bocca) parti.bocca.scale.y = P.occhi === 'chiusi' ? 0.55 : 1 + P.grandi * 0.12

    // le antenne: una molla, spinta dal salto, dal giro, dalle risate e da un filo d'aria
    molle.forEach((m, i) => {
      const l = i === 0 ? -1 : 1
      const spinta = -P.su * 6 + P.spinta * 0.8 + (calmo ? 0 : Math.sin(tempo * 1.7 + i * 1.3) * 0.2) - sguardo.x * 0.6 + Math.sin(P.giro) * 2
      const bersaglio = spinta * 0.08 + sonno * l * 0.18 - attento * l * 0.05
      m.v += ((bersaglio - m.a) * 70 - m.v * 6) * dt
      m.a += m.v * dt
      parti.antenne[i].rotation.z = -l * 0.38 + m.a
      parti.antenne[i].rotation.x = -sonno * 0.15
    })

    condivisi.uSonno.value = sonno

    const verso = Math.abs(gx - sguardo.x) + Math.abs(gy - sguardo.y)
    const molla = molle.reduce((m, a) => Math.max(m, Math.abs(a.v)), 0)
    inMoto = !!gesto || !!tocco || verso > 0.01 || battito >= 0 || molla > 0.08 ||
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
   * dondolio sono così lenti che 3 bastano a non vedere scatti, e dormendo 2.
   * Ogni fotogramma costa, il resto del tempo il Mac è di chi lavora.
   */
  const passo = () => 1000 / (inMoto ? (calmo ? 15 : 30) : sonno > 0.95 ? 2 : 3)

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

  /** Un fotogramma subito: arriva un cambio e il prossimo, a riposo, sarebbe fra un terzo di secondo. */
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
    const box = new THREE.Box3()
    for (const o of [parti.busto ?? corpo]) box.expandByObject(o)
    const a = new THREE.Vector3(box.min.x, -0.05, 0).project(camera)
    const b = new THREE.Vector3(box.max.x, Math.min(box.max.y, 2.05), 0).project(camera)
    const w = largo(), h = alto()
    const x1 = (a.x + 1) / 2 * w, x2 = (b.x + 1) / 2 * w
    const y1 = (1 - (b.y + 1) / 2) * h, y2 = (1 - (a.y + 1) / 2) * h
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2 }
  }
  const ovale = zona()

  pianifica()

  const comandi = {
    /** Lo stato dal guscio: guarda (sveglio o no), attesa (un salto quando arriva), giocoso (i gesti da solo). */
    stato(s) {
      const primaAttesa = stato.attesa
      stato.guarda = !!s.guarda
      stato.attesa = !!s.attesa
      if (typeof s.giocoso === 'boolean') stato.giocoso = s.giocoso
      if (stato.attesa && !primaAttesa) comincia('salto')
      sveglia()
    },
    /** Dove sta il cursore, fra -1 e 1 (x a destra, y in giù). */
    guarda(x, y) {
      voluto.x = Math.max(-1, Math.min(1, Number(x) || 0))
      voluto.y = Math.max(-1, Math.min(1, Number(y) || 0))
      if (!tocco && Math.abs(voluto.x - sguardo.x) + Math.abs(voluto.y - sguardo.y) > 0.01) sveglia()
    },
    /** Un gesto: salto, giravolta, ridacchia. Falso se ce n'è già uno, o col movimento ridotto. */
    gesto(nome) {
      return DURATE[nome] ? comincia(nome) : false
    },
    salta() { return comincia('salto') },
    /**
     * Il cursore sopra di lui, in punti della pagina, o null quando se ne va.
     * Arrivando apre gli occhi, le antenne vibrano, e saluta con la mano.
     */
    tocca(x, y) {
      if (x == null) { if (tocco) { tocco = null; sveglia() } return }
      const nuovo = !tocco
      tocco = {
        x: Math.max(-1, Math.min(1, (x - ovale.cx) / (ovale.rx * 1.6))),
        y: Math.max(-1, Math.min(1, (y - ovale.cy) / (ovale.ry * 1.4)))
      }
      if (nuovo) molle.forEach((m, i) => { m.v += (i === 0 ? -1 : 1) * 2.2 })
      sveglia()
    },
    /** Il cursore è sopra il corpo? In punti della pagina. */
    sopra(x, y) {
      const dx = (x - ovale.cx) / ovale.rx
      const dy = (y - ovale.cy) / ovale.ry
      return dx * dx + dy * dy <= 1
    },
    zona: () => ({ ...ovale }),
    /**
     * Solo per le prove: ferma il tempo e mette tutto subito al suo posto.
     * `gesto` e `fase` (0..1) mettono un gesto a metà; `giro` lo gira (di tre
     * quarti, di schiena).
     */
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
      giroFisso = p.giro ?? 0
      gesto = p.gesto ? { nome: p.gesto, da: tempo - (p.fase ?? 0.5) * DURATE[p.gesto], lato: 1 } : null
      molle.forEach(m => { m.v = 0; m.a = 0 })
      aggiorna(0)
      if (!stato.guarda && !tocco) { sguardo.x = 0.05; sguardo.y = 0.4; aggiorna(0) }
      fermo = true
      renderer.render(scena, camera)
    },
    /** Il gesto in corso, se c'è: per le prove. */
    gestoInCorso: () => gesto?.nome ?? null,
    /** Solo per le prove: quanti fotogrammi ha disegnato finora. */
    info: () => renderer.info.render
  }
  return comandi
}
