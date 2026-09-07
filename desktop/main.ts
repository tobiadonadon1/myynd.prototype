// Myynd da scrivania: il guscio.
//
// Non è un'altra app, è la stessa: il server di `server/` gira sul computer
// della persona come utilityProcess (`server.ts`), la finestra carica
// l'interfaccia dal suo indirizzo locale (`finestra.ts`) e il renderer parla
// con il sistema attraverso un solo ponte, `window.myynd` (`preload.cjs`).
// Il resto è quello che un'app nativa deve avere e una pagina web no: il menu
// con ⌘C che funziona (`menu.ts`), il segno nella barra (`tray.ts`), una
// scorciatoia da qualunque app (`scorciatoia.ts`), gli aggiornamenti quando
// si possono fare (`aggiornamenti.ts`), e tre preferenze in un JSON
// (`impostazioni.ts`). Le frasi passano tutte da `lingua.ts`.
//
// Questo file fa da regista e basta: ordine di avvio, chi risponde a quale
// canale IPC, e come si esce senza lasciare processi in giro.
//
// Gira così com'è: Electron legge il TypeScript con il solo type stripping,
// quindi qui valgono le stesse regole di `server/` — niente enum, niente
// namespace, import con l'estensione `.ts`.

import { app, dialog, ipcMain, shell, session } from 'electron'
import { join } from 'node:path'
import * as server from './server.ts'
import * as finestra from './finestra.ts'
import * as menu from './menu.ts'
import * as tray from './tray.ts'
import * as scorciatoia from './scorciatoia.ts'
import * as aggiornamenti from './aggiornamenti.ts'
import * as impostazioni from './impostazioni.ts'
import * as lingua from './lingua.ts'
import { t } from './lingua.ts'

app.setName('Myynd')

// In prova si passa `MYYND_DATI` per non toccare `~/.myynd`: la stessa
// cortesia vale per il registro, le impostazioni e la sessione del renderer,
// che altrimenti finirebbero in quelli veri.
if (process.env.MYYND_DATI) {
  app.setPath('userData', join(process.env.MYYND_DATI, 'app'))
} else {
  app.setPath('userData', join(app.getPath('appData'), 'Myynd'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void avvio()
}

let staUscendo = false
let serverFermato = false
let dialogoAperto = false

/** L'ordine conta: registro e impostazioni prima di tutto, così ogni pezzo dopo può parlarne. */
async function avvio() {
  const registro = server.apriRegistro(app.getPath('userData'))
  impostazioni.apri(app.getPath('userData'))

  process.on('unhandledRejection', e => {
    server.scriviRegistro(`guscio ! promessa rifiutata: ${e instanceof Error ? e.stack ?? e.message : String(e)}`)
  })
  process.on('uncaughtException', e => {
    server.scriviRegistro(`guscio ! ${e.stack ?? e.message}`)
    if (dialogoAperto) return
    dialogoAperto = true
    void dialog.showMessageBox({
      type: 'error', message: t('Qualcosa è andato storto nel guscio.'),
      detail: `${e.message}\n\n${registro}`, buttons: [t('Continua')]
    }).finally(() => { dialogoAperto = false })
  })

  // prima di aspettare il PATH e il server: una seconda apertura in quei
  // secondi deve portare su questa, non sparire
  app.on('second-instance', finestra.mostra)

  await app.whenReady()
  lingua.imposta(impostazioni.leggi().lingua ?? lingua.daLocale(app.getLocale()))
  server.scriviRegistro(`guscio · Myynd ${app.getVersion()} parte (${process.platform}, lingua ${lingua.lingua()})`)

  // la pagina è la nostra, ma i permessi del browser restano chiusi
  session.defaultSession.setPermissionRequestHandler((_wc, permesso, rispondi) => {
    rispondi(['notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permesso))
  })

  const w = finestra.crea([`--myynd-versione=${app.getVersion()}`, `--myynd-piattaforma=${process.platform}`])
  const azioniMenu: menu.Azioni = {
    naviga: dove => { finestra.mostra(); finestra.manda('myynd:naviga', dove) },
    cartellaDati: server.cartellaDati,
    registro: () => registro
  }
  menu.costruisci(azioniMenu)
  tray.crea({
    apri: finestra.mostra,
    nuovaChat: () => azioniMenu.naviga('nuova-chat'),
    preferenze: () => azioniMenu.naviga('preferenze'),
    esci: () => app.quit()
  })
  scorciatoia.attiva(finestra.alterna)
  canali(azioniMenu)

  // il renderer appena caricato non sa ancora come stanno gli aggiornamenti
  w.webContents.on('did-finish-load', () => {
    if (finestra.nostra(w.webContents.getURL())) finestra.manda('myynd:aggiornamento', aggiornamenti.stato())
  })

  const ascolto: server.Ascolto = {
    suPorta: porta => finestra.caricaApp(`http://127.0.0.1:${porta}/`),
    suMorte: righe => chiediRiapertura(righe, ascolto)
  }
  // in `app:dev` il server ce l'ha già `npm run dev`: un secondo sugli stessi
  // dati farebbe a botte con il primo per l'indice
  if (process.env.MYYND_APP_WEB) finestra.caricaApp(process.env.MYYND_APP_WEB)
  else await server.avvia(ascolto)

  // prima di installare un aggiornamento si spegne tutto come a un'uscita
  // normale: il server deve finire di scrivere, e la X deve chiudere davvero
  void aggiornamenti.prepara(finestra.attuale, spegniSenzaUscire)

  app.on('activate', () => { if (finestra.attuale()) finestra.mostra(); else finestra.crea() })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.on('before-quit', e => {
    staUscendo = true
    finestra.lasciaChiudere()
    if (serverFermato) return
    e.preventDefault()
    void spegni()
  })
}

async function spegniSenzaUscire() {
  if (serverFermato) return
  serverFermato = true
  staUscendo = true
  finestra.lasciaChiudere()
  scorciatoia.spegni()
  tray.distruggi()
  await server.ferma()
}

async function spegni() {
  if (serverFermato) return
  await spegniSenzaUscire()
  server.scriviRegistro('guscio · esco')
  app.quit()
}

/** Il server è morto tre volte in un minuto: una finestra sola, con le sue ultime righe. */
async function chiediRiapertura(righe: string[], ascolto: server.Ascolto) {
  if (staUscendo || dialogoAperto) return
  dialogoAperto = true
  // la finestra può essere nascosta — l'app vive nel Dock — e un foglio su
  // una finestra nascosta non lo vede nessuno: prima la si porta su
  finestra.mostra()
  const w = finestra.attuale()
  const opzioni = {
    type: 'error' as const,
    message: t('Il server di Myynd si è fermato.'),
    detail: righe.length ? righe.slice(-8).join('\n') : t('Non ha scritto niente prima di fermarsi.'),
    buttons: [t('Riapri'), t('Esci')], defaultId: 0, cancelId: 1
  }
  const { response } = w ? await dialog.showMessageBox(w, opzioni) : await dialog.showMessageBox(opzioni)
  dialogoAperto = false
  if (response === 0) void server.riavvia(ascolto)
  else app.quit()
}

/** Tutti i canali del ponte, nell'ordine del contratto. */
function canali(azioni: menu.Azioni) {
  ipcMain.handle('myynd:scegli-cartelle', async () => {
    const w = finestra.attuale()
    const opzioni = { properties: ['openDirectory', 'multiSelections', 'createDirectory'] as const }
    const r = w ? await dialog.showOpenDialog(w, { properties: [...opzioni.properties] })
      : await dialog.showOpenDialog({ properties: [...opzioni.properties] })
    return r.canceled ? [] : r.filePaths
  })
  // I file esportati delle conversazioni: la stessa finestra, per file e non
  // per cartelle, filtrata sulle estensioni che la pagina chiede.
  ipcMain.handle('myynd:scegli-file', async (_e, estensioni: unknown) => {
    const w = finestra.attuale()
    const ext = Array.isArray(estensioni) ? estensioni.map(String).filter(Boolean) : []
    const opzioni = {
      properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
      filters: ext.length ? [{ name: ext.map(e => e.toUpperCase()).join(', '), extensions: ext }] : []
    }
    const r = w ? await dialog.showOpenDialog(w, opzioni) : await dialog.showOpenDialog(opzioni)
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('myynd:apri-fuori', async (_e, url: unknown) => {
    let u: URL
    try { u = new URL(String(url)) } catch { throw new Error(t('Questo indirizzo non si apre fuori da Myynd.')) }
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) throw new Error(t('Questo indirizzo non si apre fuori da Myynd.'))
    await shell.openExternal(u.toString())
  })
  ipcMain.handle('myynd:mostra', (_e, percorso: unknown) => {
    if (typeof percorso === 'string' && percorso) shell.showItemInFolder(percorso)
  })
  ipcMain.on('myynd:segnala', (_e, n: unknown) => tray.segnala(Number(n)))
  ipcMain.on('myynd:lingua', (_e, l: unknown) => {
    const nuova = l === 'en' ? 'en' : 'it'
    if (nuova === lingua.lingua()) return
    lingua.imposta(nuova)
    impostazioni.scrivi({ lingua: nuova })
    menu.costruisci(azioni)
    tray.aggiorna()
  })
  ipcMain.handle('myynd:scorciatoia', () => scorciatoia.corrente())
  ipcMain.handle('myynd:imposta-scorciatoia', (_e, acc: unknown) => scorciatoia.imposta(String(acc)))
  ipcMain.handle('myynd:avvio-automatico', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('myynd:imposta-avvio-automatico', (_e, acceso: unknown) => {
    app.setLoginItemSettings({ openAtLogin: !!acceso })
  })
  ipcMain.handle('myynd:aggiornamenti-stato', () => aggiornamenti.stato())
  ipcMain.handle('myynd:aggiornamenti-controlla', () => aggiornamenti.controlla())
  ipcMain.handle('myynd:aggiornamenti-installa', () => aggiornamenti.installa())
}
