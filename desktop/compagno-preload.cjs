// Il ponte del mostriciattolo: i gesti e i bottoni verso il guscio, lo stato e lo sguardo indietro.
//
// CommonJS per forza, come `preload.cjs`: con `sandbox: true` un preload non
// può essere un modulo. La pagina non vede `ipcRenderer`, solo queste funzioni.

const { contextBridge, ipcRenderer } = require('electron')

const numero = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

contextBridge.exposeInMainWorld('compagno', {
  premuto: () => ipcRenderer.send('compagno:premuto'),
  /** I due bottoni della pastiglia: la casella per scrivergli, le sue impostazioni. */
  scrivi: () => ipcRenderer.send('compagno:scrivi'),
  impostazioni: () => ipcRenderer.send('compagno:impostazioni'),
  menu: () => ipcRenderer.send('compagno:menu'),
  afferra: () => ipcRenderer.send('compagno:afferra'),
  trascina: (dx, dy) => ipcRenderer.send('compagno:trascina', Number(dx), Number(dy)),
  lascia: () => ipcRenderer.send('compagno:lascia'),
  pronto: () => ipcRenderer.send('compagno:pronto'),
  /** Il cursore è sopra il corpo: solo allora la finestra si prende i clic. */
  sopra: on => ipcRenderer.send('compagno:sopra', on === true),
  stato: cb => {
    ipcRenderer.on('compagno:stato', (_e, s) => cb({
      guarda: s?.guarda === true,
      attesa: s?.attesa === true,
      giocoso: s?.giocoso !== false,
      testi: { scrivi: String(s?.testi?.scrivi ?? ''), impostazioni: String(s?.testi?.impostazioni ?? '') }
    }))
  },
  /** Un gesto che decide il guscio (la risatina quando gli si scrive): solo nomi conosciuti. */
  gesto: cb => {
    ipcRenderer.on('compagno:gesto', (_e, nome) => { if (['salto', 'giravolta', 'ridacchia'].includes(nome)) cb(nome) })
  },
  /** Dove sta il cursore rispetto a lui, fra -1 e 1: il guscio lo manda finché lo si vede. */
  sguardo: cb => {
    ipcRenderer.on('compagno:sguardo', (_e, s) => cb({ x: numero(s?.x), y: numero(s?.y) }))
  }
})
