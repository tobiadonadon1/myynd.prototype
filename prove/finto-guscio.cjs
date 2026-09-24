// Un finto `window.myynd`, solo per le prove: fa credere alla pagina di girare
// dentro l'app sul Mac (`desktop()?.piattaforma === 'darwin'`), così si vede
// la cornice vera: la barra in alto lascia posto ai semafori.
//
// Tutto il resto risponde con un altro finto, che si può chiamare e da cui si
// può leggere qualunque cosa senza schiantare. Niente di quello che chiama
// esce dalla finestra: non ci sono canali verso il processo principale.
function finto() {
  const f = function () { return finto() }
  return new Proxy(f, {
    get(_t, k) {
      if (k === 'piattaforma') return 'darwin'
      if (k === 'versione') return '0.0.0-prova'
      if (k === 'then' || k === Symbol.toPrimitive || k === Symbol.iterator) return undefined
      return finto()
    },
    apply() { return finto() }
  })
}
window.myynd = finto()
