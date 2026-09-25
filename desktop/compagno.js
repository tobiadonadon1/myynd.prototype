// I gesti del mostriciattolo: clic, trascinamento, tasto destro.
//
// Un clic apre il richiamo; oltre tre punti con il tasto giù è un
// trascinamento, e allora al rilascio non si apre niente e il posto si
// salva. Al guscio parte, una volta per fotogramma, tutto lo spostamento dal
// momento della presa (non il pezzo dall'ultimo passo): il guscio mette la
// finestra dov'era alla presa più quello, dentro uno schermo. Così, spinto
// contro un bordo e riportato indietro, torna sotto il puntatore. La
// finestra si muove sotto il puntatore, quindi si contano le coordinate
// dello schermo e non quelle della pagina.
'use strict'
;(() => {
  const c = window.compagno
  if (!c) return
  let giu = null
  let trascina = false
  let dalla = null
  let fotogramma = 0

  const manda = () => {
    fotogramma = 0
    if (dalla) c.trascina(dalla.dx, dalla.dy)
    dalla = null
  }

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
    if (!document.body.classList.contains('animata')) {
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('animata')))
    }
  })
  c.pronto()
})()
