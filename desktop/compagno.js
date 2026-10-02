// I gesti del mostriciattolo, la pastiglia sotto di lui, e la scena che li riceve.
//
// Il cursore che gli passa sopra lo sveglia: si drizza con un saltello, apre
// gli occhi, muove le antenne e lo segue con lo sguardo, e sotto di lui
// compare la pastiglia scura con due bottoni: scrivi (il fumetto, con la
// casella pronta) e parla (il fumetto, con la dettatura). La pastiglia resta
// finché il cursore è su di lui o su di lei, e se ne va 400 ms dopo.
//
// Un clic su di lui apre o chiude il fumetto; oltre tre punti con il tasto
// giù è un trascinamento, e allora al rilascio non si apre niente e il posto
// si salva. Al guscio parte, una volta per fotogramma, tutto lo spostamento
// dal momento della presa (non il pezzo dall'ultimo passo): il guscio mette
// la finestra dov'era alla presa più quello, dentro uno schermo. La finestra
// si muove sotto il puntatore, quindi si contano le coordinate dello schermo
// e non quelle della pagina.
//
// La finestra è per lo più trasparente, e una finestra che si prende i clic
// tutt'intorno a lui sarebbe un buco nello schermo: il guscio lascia passare
// il mouse finché questa pagina non dice che il cursore è sopra il corpo o
// sopra la pastiglia (`sopra`). I movimenti arrivano lo stesso, inoltrati
// dal guscio, ed è da quelli che ci si accorge del cursore.
//
// Senza WebGL resta l'immagine ferma di prima: meglio lui piatto che niente.
import { creaScena } from './compagno-scena.js'

const c = window.compagno
const q = new URLSearchParams(location.search)
const tela = document.getElementById('tela')
const pastiglia = document.getElementById('pastiglia')
/** Quanto la pastiglia resta dopo che il cursore se n'è andato. */
const RESTA = 400

let scena = null
let sopraOra = false
let giu = null
let trascina = false
let dalla = null
let fotogramma = 0
let vaVia = 0

/** Il guscio prende i clic solo quando il cursore è su di lui o sulla pastiglia. */
const dillo = s => {
  if (s === sopraOra) return
  sopraOra = s
  c?.sopra?.(s)
}

const sullaPastiglia = (x, y) => {
  if (!document.body.classList.contains('sopra')) return false
  const r = pastiglia.getBoundingClientRect()
  return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4
}

const sulCorpo = (x, y) => (scena ? scena.sopra(x, y) : x >= 36 && x <= 108 && y >= 30 && y <= 140)

function mostraPastiglia() {
  clearTimeout(vaVia)
  vaVia = 0
  document.body.classList.add('sopra')
}

function nascondiPastiglia() {
  if (vaVia || !document.body.classList.contains('sopra')) return
  vaVia = setTimeout(() => {
    vaVia = 0
    document.body.classList.remove('sopra')
    scena?.tocca(null)
    dillo(false)
  }, RESTA)
}

/** Dove sta il cursore, in punti della pagina: su di lui, sulla pastiglia, o altrove. */
function dove(x, y) {
  if (giu) return
  const corpo = sulCorpo(x, y)
  const sullaP = sullaPastiglia(x, y)
  if (corpo) scena?.tocca(x, y)
  if (corpo || sullaP) { mostraPastiglia(); dillo(true) } else {
    // fuori da tutti e due: il mouse torna a chi sta sotto, la pastiglia aspetta un poco
    dillo(false)
    nascondiPastiglia()
  }
}

function piatto() {
  const img = document.createElement('img')
  img.src = 'icone/compagno.png'
  img.alt = ''
  img.draggable = false
  img.style.cssText = 'position:absolute;left:36px;top:36px;width:72px;height:72px;pointer-events:none'
  tela.replaceWith(img)
}

const manda = () => {
  fotogramma = 0
  if (dalla) c.trascina(dalla.dx, dalla.dy)
  dalla = null
}

if (c) {
  document.addEventListener('mousemove', e => dove(e.clientX, e.clientY))
  document.addEventListener('mouseleave', () => { if (!giu) { dillo(false); nascondiPastiglia() } })
  for (const [id, fai] of [['scrivi', () => c.scrivi?.()], ['parla', () => c.detta?.()]]) {
    const b = document.getElementById(id)
    b.addEventListener('pointerdown', e => e.stopPropagation())
    b.addEventListener('click', e => { e.stopPropagation(); fai() })
  }
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || pastiglia.contains(e.target)) return
    giu = { x: e.screenX, y: e.screenY }
    trascina = false
    dalla = null
    c.afferra()
    try { document.body.setPointerCapture(e.pointerId) } catch { /* pazienza */ }
  })
  document.addEventListener('pointermove', e => {
    if (!giu) return
    if (!trascina && Math.hypot(e.screenX - giu.x, e.screenY - giu.y) > 3) trascina = true
    if (!trascina) return
    dalla = { dx: e.screenX - giu.x, dy: e.screenY - giu.y }
    if (!fotogramma) fotogramma = requestAnimationFrame(manda)
  })
  document.addEventListener('pointerup', e => {
    if (!giu || e.button !== 0) return
    giu = null
    if (trascina) {
      if (fotogramma) { cancelAnimationFrame(fotogramma); manda() }
      c.lascia()
    } else {
      c.premuto()
    }
    trascina = false
    dove(e.clientX, e.clientY)
  })
  document.addEventListener('contextmenu', e => {
    e.preventDefault()
    c.menu()
  })
  c.stato(s => {
    document.body.classList.toggle('spenta', !(s && s.guarda === true))
    document.body.classList.toggle('attesa', !!(s && s.attesa === true))
    // le parole dei bottoni arrivano dal guscio, nella lingua dell'app
    for (const [id, testo] of [['scrivi', s?.testi?.scrivi], ['parla', s?.testi?.parla]]) {
      if (typeof testo !== 'string' || !testo) continue
      const b = document.getElementById(id)
      b.title = testo
      b.setAttribute('aria-label', testo)
    }
    scena?.stato({ guarda: s?.guarda === true, attesa: s?.attesa === true })
  })
  c.sguardo?.(s => scena?.guarda(s.x, s.y))
}

try {
  scena = await creaScena(tela, { glb: q.get('glb') === '1' ? 'icone/compagno.glb' : '', prova: q.get('prova') === '1' })
  scena.stato({ guarda: !document.body.classList.contains('spenta'), attesa: document.body.classList.contains('attesa') })
  // le prove lo guidano da qui, e leggono quanto ha disegnato
  if (q.get('prova') === '1' || q.get('misura') === '1') window.scena = scena
} catch (e) {
  console.warn('compagno · niente WebGL, resta l’immagine', e)
  piatto()
}
c?.pronto()
