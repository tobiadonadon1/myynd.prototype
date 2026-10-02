// Il ponte del mostriciattolo: i gesti e i bottoni verso il guscio, lo stato e lo sguardo indietro.
//
// CommonJS per forza, come `preload.cjs`: con `sandbox: true` un preload non
// può essere un modulo. La pagina non vede `ipcRenderer`, solo queste funzioni.

const { contextBridge, ipcRenderer } = require('electron')

const numero = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

contextBridge.exposeInMainWorld('compagno', {
  premuto: () => ipcRenderer.send('compagno:premuto'),
  /** I due bottoni della pastiglia: il fumetto con la casella pronta, o con la dettatura. */
  scrivi: () => ipcRenderer.send('compagno:scrivi'),
  detta: () => ipcRenderer.send('compagno:detta'),
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
      testi: { scrivi: String(s?.testi?.scrivi ?? ''), parla: String(s?.testi?.parla ?? '') }
    }))
  },
  /** Dove sta il cursore rispetto a lui, fra -1 e 1: il guscio lo manda finché lo si vede. */
  sguardo: cb => {
    ipcRenderer.on('compagno:sguardo', (_e, s) => cb({ x: numero(s?.x), y: numero(s?.y) }))
  }
})
