// Il ponte tra la pagina e il guscio: `window.myynd`.
//
// È CommonJS e non TypeScript per forza: un preload con `sandbox: true` non
// può essere un modulo ES né passare dal type stripping. Espone esattamente
// la superficie descritta in `src/desktop.ts`, e niente altro — nessun
// `require`, nessun `ipcRenderer` nudo arriva alla pagina.
//
// Versione e piattaforma arrivano dagli argomenti del processo, messi lì dal
// guscio: niente IPC sincrono per due stringhe che non cambiano mai.

const { contextBridge, ipcRenderer } = require('electron')

function argomento(nome) {
  const prefisso = `--myynd-${nome}=`
  const voce = process.argv.find(a => a.startsWith(prefisso))
  return voce ? voce.slice(prefisso.length) : ''
}

function ascolta(canale, cb) {
  const f = (_evento, carico) => cb(carico)
  ipcRenderer.on(canale, f)
  return () => ipcRenderer.removeListener(canale, f)
}

contextBridge.exposeInMainWorld('myynd', {
  versione: argomento('versione'),
  piattaforma: argomento('piattaforma') || process.platform,
  scegliCartelle: () => ipcRenderer.invoke('myynd:scegli-cartelle'),
  apriFuori: url => ipcRenderer.invoke('myynd:apri-fuori', String(url)),
  mostraNelFinder: percorso => ipcRenderer.invoke('myynd:mostra', String(percorso)),
  segnala: inAttesa => ipcRenderer.send('myynd:segnala', Number(inAttesa)),
  lingua: l => ipcRenderer.send('myynd:lingua', l === 'en' ? 'en' : 'it'),
  scorciatoia: () => ipcRenderer.invoke('myynd:scorciatoia'),
  impostaScorciatoia: acc => ipcRenderer.invoke('myynd:imposta-scorciatoia', String(acc)),
  avvioAutomatico: () => ipcRenderer.invoke('myynd:avvio-automatico'),
  impostaAvvioAutomatico: acceso => ipcRenderer.invoke('myynd:imposta-avvio-automatico', !!acceso),
  aggiornamenti: {
    controlla: () => ipcRenderer.invoke('myynd:aggiornamenti-controlla'),
    installa: () => ipcRenderer.invoke('myynd:aggiornamenti-installa'),
    stato: cb => ascolta('myynd:aggiornamento', cb)
  },
  naviga: cb => ascolta('myynd:naviga', cb)
})
