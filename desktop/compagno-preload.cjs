// Il ponte del mostriciattolo: i gesti verso il guscio, uno stato indietro.
//
// CommonJS per forza, come `preload.cjs`: con `sandbox: true` un preload non
// può essere un modulo. La pagina non vede `ipcRenderer`, solo queste funzioni.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('compagno', {
  premuto: () => ipcRenderer.send('compagno:premuto'),
  menu: () => ipcRenderer.send('compagno:menu'),
  afferra: () => ipcRenderer.send('compagno:afferra'),
  trascina: (dx, dy) => ipcRenderer.send('compagno:trascina', Number(dx), Number(dy)),
  lascia: () => ipcRenderer.send('compagno:lascia'),
  pronto: () => ipcRenderer.send('compagno:pronto'),
  stato: cb => {
    ipcRenderer.on('compagno:stato', (_e, s) => cb({ guarda: s?.guarda === true, attesa: s?.attesa === true }))
  }
})
