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

/**
 * Un `invoke` che fallisce arriva alla pagina come «Error invoking remote
 * method 'myynd:…': Error: la frase»: la pagina mostra `message` così com'è,
 * e quella cornice non è di nessuno. Resta la frase.
 */
function chiedi(canale, ...argomenti) {
  return ipcRenderer.invoke(canale, ...argomenti).catch(e => {
    const grezzo = e instanceof Error ? e.message : String(e)
    throw new Error(grezzo.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''))
  })
}

function ascolta(canale, cb) {
  const f = (_evento, carico) => cb(carico)
  ipcRenderer.on(canale, f)
  return () => ipcRenderer.removeListener(canale, f)
}

contextBridge.exposeInMainWorld('myynd', {
  versione: argomento('versione'),
  piattaforma: argomento('piattaforma') || process.platform,
  scegliCartelle: () => chiedi('myynd:scegli-cartelle'),
  apriFuori: url => chiedi('myynd:apri-fuori', String(url)),
  mostraNelFinder: percorso => chiedi('myynd:mostra', String(percorso)),
  segnala: inAttesa => ipcRenderer.send('myynd:segnala', Number(inAttesa)),
  lingua: l => ipcRenderer.send('myynd:lingua', l === 'en' ? 'en' : 'it'),
  scorciatoia: () => chiedi('myynd:scorciatoia'),
  impostaScorciatoia: acc => chiedi('myynd:imposta-scorciatoia', String(acc)),
  avvioAutomatico: () => chiedi('myynd:avvio-automatico'),
  impostaAvvioAutomatico: acceso => chiedi('myynd:imposta-avvio-automatico', !!acceso),
  aggiornamenti: {
    attuale: () => chiedi('myynd:aggiornamenti-stato'),
    controlla: () => chiedi('myynd:aggiornamenti-controlla'),
    installa: () => chiedi('myynd:aggiornamenti-installa'),
    stato: cb => ascolta('myynd:aggiornamento', cb)
  },
  naviga: cb => ascolta('myynd:naviga', cb)
})
