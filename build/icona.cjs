// Il disegno delle icone: la piastrella del Dock e le sagome della barra.
//
// Sta in un file suo e non dentro build/icone.cjs perché sono due mestieri
// diversi: qui si decide *come è fatta* l'icona (forma, colori, misure),
// là si decide *come si rasterizza*. Chi vuole ritoccare il disegno tocca
// solo questo, e non rischia di rompere il giro di Electron.
//
// Non c'è un .svg committato: l'SVG si genera. Il marchio arriva da
// src/components/marchio-forma.ts (la stessa sagoma che usa l'app, e una
// prova la confronta con public/marchio.svg), e il tracciato della squircle
// va calcolato dai numeri qui sotto — un file statico sarebbe una copia
// da tenere allineata a mano.

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

/*
 * La squircle di Apple.
 *
 * Non è un rettangolo con gli angoli arrotondati: negli angoli la curvatura
 * cresce piano invece di saltare di colpo da zero al raggio del cerchio, e
 * si vede — un'icona con gli angoli a compasso, accanto alle altre nel Dock,
 * si riconosce subito come fatta in casa.
 *
 * La costruzione è quella di figma-squircle: per ogni angolo un arco vero al
 * centro e due Bézier che lo raccordano ai lati dritti. Due numeri la
 * governano — il raggio e quanta lisciatura — e li abbiamo *misurati* invece
 * di fidarci di quello che gira in rete:
 *
 *   iconutil -c iconset /System/Applications/Podcasts.app/…/AppIcon.icns
 *
 * l'icona di Podcasts (e quelle di Musica, Borsa, News: la maschera è la
 * stessa al pixel) a 256 px, letto l'alfa con l'interpolazione sub-pixel sul
 * bordo, e cercato la coppia che sbaglia meno. Su macOS 15.6.1:
 *
 *   corpo    206,16 px su 256  →  0,8053  (824/1024 = 0,8047: torna)
 *   raggio   0,219 · lato      →  180,6 su 824
 *   lisciatura 0,97            →  residuo 0,38 px su 256
 *
 * Per confronto, il miglior cerchio puro sbaglia di 7 px su 256 — trenta
 * volte tanto, cioè 28 px su 1024: visibile a occhio nudo. Anche lo 0,6 che
 * si legge in giro sbaglia di 3 px. Da qui i numeri fissi qui sotto.
 */
const RAGGIO = 0.219      // frazione del lato della piastrella
const LISCIATURA = 0.97

/** I sei parametri di un angolo: quanto arco, quanto raccordo, dove comincia. */
function angolo(r, s) {
  const g = Math.PI / 180
  const arco = 90 * (1 - s)                                  // gradi di arco vero che restano
  const lArco = Math.sin((arco / 2) * g) * r * Math.SQRT2     // la corda di quell'arco
  const d34 = r * Math.tan((((90 - arco) / 2) / 2) * g)
  const beta = 45 * s
  const c = d34 * Math.cos(beta * g)
  const d = c * Math.tan(beta * g)
  const p = (1 + s) * r                                       // dove l'angolo stacca dal lato dritto
  const b = (p - lArco - c - d) / 3
  return { a: 2 * b, b, c, d, p, lArco }
}

/** Il tracciato di una squircle di `lato`, con l'angolo alto-sinistro in (x, y). */
function squircle(lato, x = 0, y = 0, r = RAGGIO * lato, s = LISCIATURA) {
  const { a, b, c, d, p, lArco } = angolo(r, s)
  const n = v => Number(v.toFixed(3))
  return [
    `M${n(x + lato - p)} ${n(y)}`,
    `c${n(a)} 0 ${n(a + b)} 0 ${n(a + b + c)} ${n(d)}`,
    `a${n(r)} ${n(r)} 0 0 1 ${n(lArco)} ${n(lArco)}`,
    `c${n(d)} ${n(c)} ${n(d)} ${n(b + c)} ${n(d)} ${n(a + b + c)}`,
    `L${n(x + lato)} ${n(y + lato - p)}`,
    `c0 ${n(a)} 0 ${n(a + b)} ${n(-d)} ${n(a + b + c)}`,
    `a${n(r)} ${n(r)} 0 0 1 ${n(-lArco)} ${n(lArco)}`,
    `c${n(-c)} ${n(d)} ${n(-(b + c))} ${n(d)} ${n(-(a + b + c))} ${n(d)}`,
    `L${n(x + p)} ${n(y + lato)}`,
    `c${n(-a)} 0 ${n(-(a + b))} 0 ${n(-(a + b + c))} ${n(-d)}`,
    `a${n(r)} ${n(r)} 0 0 1 ${n(-lArco)} ${n(-lArco)}`,
    `c${n(-d)} ${n(-c)} ${n(-d)} ${n(-(b + c))} ${n(-d)} ${n(-(a + b + c))}`,
    `L${n(x)} ${n(y + p)}`,
    `c0 ${n(-a)} 0 ${n(-(a + b))} ${n(d)} ${n(-(a + b + c))}`,
    `a${n(r)} ${n(r)} 0 0 1 ${n(lArco)} ${n(-lArco)}`,
    `c${n(c)} ${n(-d)} ${n(b + c)} ${n(-d)} ${n(a + b + c)} ${n(-d)}`,
    'Z'
  ].join('')
}

/*
 * Il marchio.
 *
 * Il tracciato viene da src/components/marchio-forma.ts, letto a mano perché
 * questo è un .cjs e quello è un modulo TypeScript: due righe di espressione
 * regolare costano meno di un passaggio di compilazione dentro il build.
 * Il riquadro pieno del tracciato l'ha misurato il browser (getBBox) una
 * volta sola: serve per centrare il marchio *davvero*, non il suo viewBox —
 * il viewBox ha dell'aria a sinistra che sposterebbe tutto di un pelo.
 */
const forma = readFileSync(join(__dirname, '..', 'src', 'components', 'marchio-forma.ts'), 'utf8')
const cervello = /export const (?:ONDA|CERVELLO): Forma = \{[^}]*?tracciato: '([^']+)'/s.exec(forma)
if (!cervello) throw new Error('src/components/marchio-forma.ts: non trovo il tracciato del marchio')
const TRACCIATO = cervello[1]
const RIQUADRO = { x: 11.661, y: 10, w: 76.678, h: 80 }   // getBBox del tracciato, nelle sue coordinate

/** La tavolozza dell'app, la stessa di src/index.css e di Marchio.tsx. */
const COLORI = {
  terraScura: '#A34E2D',
  terra: '#C4623B',
  sabbia: '#D8A46E',
  salvia: '#8FA593',
  crema: '#F2E9DC',
  inchiostro: '#22271F'
}

/**
 * Mette il marchio dentro un quadrato di lato `lato` con l'angolo in (x, y):
 * largo `larghezza` volte il lato, centrato, e alzato di `alzata` (frazione
 * del lato) perché il centro geometrico e quello che si vede non coincidono.
 */
function marchio({ lato, x, y, larghezza, alzata, riempimento }) {
  const k = (larghezza * lato) / RIQUADRO.w
  const tx = x + lato / 2 - (RIQUADRO.x + RIQUADRO.w / 2) * k
  const ty = y + lato / 2 - alzata * lato - (RIQUADRO.y + RIQUADRO.h / 2) * k
  return `<path transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${k.toFixed(5)})"`
    + ` d="${TRACCIATO}" fill="${riempimento}"/>`
}

/*
 * La griglia di Apple, su una tela di 1024: la piastrella è 824×824 al
 * centro, cioè 100 px di trasparente per lato. Quei 100 px non sono aria
 * sprecata: il Dock ci mette il riflesso e il pallino, e senza margine
 * l'icona sembra più grande delle altre.
 */
const TELA = 1024
const LATO = 824                       // 0,8047 della tela: misurato, vedi sopra
const BORDO = (TELA - LATO) / 2        // 100

/*
 * Quanto è grande il marchio dentro la piastrella.
 *
 * 62% della larghezza della piastrella (66% alle misure piccole, vedi sotto).
 * Provate 58, 62 e 66 una accanto all'altra: a 58 galleggia, a 66 comincia a
 * spingere sugli angoli, 62 respira.
 *
 * E alzato dell'1,5% del lato. Il centro geometrico non è quello che si
 * vede: il cervello ha i due lobi grossi in basso e una cuspide sottile in
 * alto, quindi centrato col righello sembra seduto. Guardate 0, 1,5% e 3%
 * in fila: a 0 è basso, a 3 è già scappato in alto.
 */
const LARGHEZZA_MARCHIO = 0.62
const LARGHEZZA_MARCHIO_PICCOLA = 0.66
const ALZATA_MARCHIO = 0.015

/** White macOS tile with the same orange/green continuous-line mark as the app. */
function svgApp(misura = TELA) {
  const sq = squircle(LATO, BORDO, BORDO)
  const piccola = misura < 64
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TELA} ${TELA}">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#24211C"/><stop offset=".55" stop-color="#100E0C"/><stop offset="1" stop-color="#080908"/></linearGradient>
    <linearGradient id="energia" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#C26943"/><stop offset=".40" stop-color="#E4A074"/><stop offset=".72" stop-color="#BCCDA6"/><stop offset="1" stop-color="#8FAF98"/></linearGradient>
  </defs>
  <path d="${sq}" fill="url(#fondo)"/>
    ${marchio({ lato: LATO, x: BORDO, y: BORDO, larghezza: piccola ? .73 : .68, alzata: .005, riempimento: 'url(#energia)' })}
  </svg>`
}

/*
 * La barra dei menu, che è un'altra cosa.
 *
 * Nessuna piastrella: nella barra ci va la sagoma nuda. Su macOS un'immagine
 * «template» dev'essere nera su trasparente — il sistema la tinge lei, chiara
 * o scura secondo il tema — quindi niente colori e niente gradienti. Su
 * Windows «template» non vuol dire niente e una sagoma nera sparirebbe sulla
 * barra scura: là va il marchio a colori.
 *
 * La variante «in attesa» ha un puntino in basso a destra, staccato dal
 * marchio da un anello vuoto: su macOS si buca la sagoma con una maschera
 * (non si può usare un bordo chiaro, sarebbe nero anche lui), su Windows
 * basta un bordo color crema.
 */
const PUNTO = { cx: 84, cy: 87, r: 15, stacco: 6 }

function svgBarra({ attesa = false, template = false } = {}) {
  // il marchio riempie l'87,5% dell'altezza: come le icone che c'erano prima,
  // e a 16 px un pixel di margine serve a non incollarsi al bordo della barra
  const alt = Math.max(RIQUADRO.w, RIQUADRO.h) / 0.875
  const vb = `${RIQUADRO.x + RIQUADRO.w / 2 - alt / 2} ${RIQUADRO.y + RIQUADRO.h / 2 - alt / 2} ${alt} ${alt}`
  const tinta = template ? '#000000' : 'url(#g)'
  const defs = template
    ? (attesa ? `<mask id="foro"><rect x="-200" y="-200" width="600" height="600" fill="#fff"/>`
        + `<circle cx="${PUNTO.cx}" cy="${PUNTO.cy}" r="${PUNTO.r + PUNTO.stacco}" fill="#000"/></mask>` : '')
    : `<linearGradient id="g" x1="0" y1="1" x2="0.15" y2="0">`
        + `<stop offset="0" stop-color="#D46A36"/><stop offset="0.42" stop-color="#D7984E"/>`
        + `<stop offset="0.78" stop-color="#88A16C"/><stop offset="1" stop-color="#4E876C"/></linearGradient>`
  const sagoma = template && attesa
    ? `<g mask="url(#foro)"><path d="${TRACCIATO}" fill="${tinta}"/></g>`
    : `<path d="${TRACCIATO}" fill="${tinta}"/>`
  const punto = !attesa ? ''
    : template
      ? `<circle cx="${PUNTO.cx}" cy="${PUNTO.cy}" r="${PUNTO.r}" fill="#000000"/>`
      : `<circle cx="${PUNTO.cx}" cy="${PUNTO.cy}" r="${PUNTO.r}" fill="${COLORI.inchiostro}" stroke="${COLORI.crema}" stroke-width="${PUNTO.stacco}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">`
    + (defs ? `<defs>${defs}</defs>` : '') + sagoma + punto + '</svg>'
}

module.exports = { svgApp, svgBarra, squircle, COLORI, TELA, LATO, BORDO }
