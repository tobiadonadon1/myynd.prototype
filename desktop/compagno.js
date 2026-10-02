// I gesti del mostriciattolo, e la scena che li riceve.
//
// Un clic apre il fumetto (il richiamo accanto a lui); oltre tre punti con il
// tasto giù è un trascinamento, e allora al rilascio non si apre niente e il
// posto si salva. Al guscio parte, una volta per fotogramma, tutto lo
// spostamento dal momento della presa (non il pezzo dall'ultimo passo): il
// guscio mette la finestra dov'era alla presa più quello, dentro uno
// schermo. La finestra si muove sotto il puntatore, quindi si contano le
// coordinate dello schermo e non quelle della pagina.
//
// Il quadrato è per lo più trasparente, e un quadrato che si prende i clic
// tutt'intorno al corpo sarebbe un buco nello schermo: il guscio lascia
// passare il mouse finché questa pagina non dice che il cursore è sopra il
// corpo (`sopra`). I movimenti arrivano lo stesso, inoltrati dal guscio.
//
// Senza WebGL resta l'immagine ferma di prima: meglio lui piatto che niente.
import { creaScena } from './compagno-scena.js'

const c = window.compagno
const q = new URLSearchParams(location.search)
const tela = document.getElementById('tela')

let scena = null
let sopraOra = false
let giu = null
let trascina = false
let dalla = null
let fotogramma = 0
let primoStato = true

const dillo = s => {
  if (s === sopraOra) return
  sopraOra = s
  c?.sopra?.(s)
}

const manda = () => {
  fotogramma = 0
  if (dalla) c.trascina(dalla.dx, dalla.dy)
  dalla = null
}

function piatto() {
  const img = document.createElement('img')
  img.src = 'icone/compagno.png'
  img.alt = ''
  img.draggable = false
  img.style.cssText = 'position:absolute;left:25%;top:25%;width:50%;height:50%;pointer-events:none'
  tela.replaceWith(img)
}

if (c) {
  document.addEventListener('mousemove', e => {
    if (giu) return
    dillo(scena ? scena.sopra(e.clientX, e.clientY) : true)
  })
  document.addEventListener('mouseleave', () => { if (!giu) dillo(false) })
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0) return
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
    if (scena) dillo(scena.sopra(e.clientX, e.clientY))
  })
  document.addEventListener('contextmenu', e => {
    e.preventDefault()
    c.menu()
  })
  // il primo stato si mette senza dissolvenza: comparire smorto e poi
  // colorarsi sembrerebbe un cambio che non c'è stato
  c.stato(s => {
    document.body.classList.toggle('spenta', !(s && s.guarda === true))
    document.body.classList.toggle('attesa', !!(s && s.attesa === true))
    if (primoStato) {
      primoStato = false
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('animata')))
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
