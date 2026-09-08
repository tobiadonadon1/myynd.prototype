// Myynd da scrivania: il guscio.
//
// Non è un'altra app, è la stessa: il server di `server/` gira sul computer
// della persona come utilityProcess (`server.ts`), la finestra carica
// l'interfaccia dal suo indirizzo locale (`finestra.ts`) e il renderer parla
// con il sistema attraverso un solo ponte, `window.myynd` (`preload.cjs`).
// Il resto è quello che un'app nativa deve avere e una pagina web no: il menu
// con ⌘C che funziona (`menu.ts`), il segno nella barra (`tray.ts`), una
// scorciatoia da qualunque app che apre il richiamo (`scorciatoia.ts`,
// `richiamo.ts`), gli aggiornamenti quando si possono fare
// (`aggiornamenti.ts`), e tre preferenze in un JSON (`impostazioni.ts`). Le
// frasi passano tutte da `lingua.ts`.
//
// L'app vive anche a finestra chiusa: la X nasconde, il segno nella barra e
// il Dock la tengono viva, e il server con le sue automazioni continua a
// girare. Si esce da «Esci» — nella barra, nel menù, o con ⌘Q.
//
// Questo file fa da regista e basta: ordine di avvio, chi risponde a quale
// canale IPC, e come si esce senza lasciare processi in giro.
//
// Gira così com'è: Electron legge il TypeScript con il solo type stripping,
// quindi qui valgono le stesse regole di `server/` — niente enum, niente
// namespace, import con l'estensione `.ts`.

import { app, dialog, ipcMain, Notification, powerMonitor, shell, session } from 'electron'
import { join } from 'node:path'
import * as server from './server.ts'
import * as finestra from './finestra.ts'
import * as richiamo from './richiamo.ts'
import * as menu from './menu.ts'
import * as tray from './tray.ts'
import * as scorciatoia from './scorciatoia.ts'
import * as aggiornamenti from './aggiornamenti.ts'
import * as impostazioni from './impostazioni.ts'
import * as lingua from './lingua.ts'
import { t } from './lingua.ts'
import { ARGOMENTO_NASCOSTO, avvioNascosto } from './nascosto.ts'

/** Dove il renderer può essere mandato: un posto dell'app, o una chat precisa. */
type Dove = string | { dove: 'chat'; id: string }
const POSTI = new Set(['preferenze', 'chat', 'oggi', 'aiuto', 'nuova-chat'])

/** Quello che arriva via IPC non è fidato: o è un posto conosciuto, o non si va. */
function doveValido(x: unknown): Dove | null {
  if (typeof x === 'string') return POSTI.has(x) ? x : null
  if (x && typeof x === 'object') {
    const { dove, id } = x as { dove?: unknown; id?: unknown }
    if (dove === 'chat' && typeof id === 'string' && /^[\w-]{1,80}$/.test(id)) return { dove: 'chat', id }
  }
  return null
}

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
  // aperta dal sistema all'accesso: si carica tutto, ma la finestra non compare
  const nascosto = avvioNascosto(process.argv, app.getLoginItemSettings())
  server.scriviRegistro(`guscio · Myynd ${app.getVersion()} parte (${process.platform}, lingua ${lingua.lingua()}${nascosto ? ', nascosta' : ''})`)

  // la pagina è la nostra, ma i permessi del browser restano chiusi
  session.defaultSession.setPermissionRequestHandler((_wc, permesso, rispondi) => {
    rispondi(['notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permesso))
  })

  const argomenti = [`--myynd-versione=${app.getVersion()}`, `--myynd-piattaforma=${process.platform}`]
  const w = finestra.crea(argomenti, nascosto)
  /** La finestra grande davanti, sul posto chiesto. Il richiamo, se era aperto, si toglie. */
  const vai = (dove: Dove) => {
    finestra.mostra()
    richiamo.nascondi()
    finestra.manda('myynd:naviga', dove)
  }
  const azioniMenu: menu.Azioni = {
    naviga: vai,
    cartellaDati: server.cartellaDati,
    registro: () => registro
  }
  menu.costruisci(azioniMenu)
  tray.crea({
    apri: finestra.mostra,
    nuovaChat: () => vai('nuova-chat'),
    preferenze: () => vai('preferenze'),
    esci: () => app.quit()
  })
  // senza il segno nella barra, fuori dal Mac, la X chiude come prima: un'app
  // viva che non si vede e non si riapre è peggio di una chiusa
  finestra.tieniViva(tray.attiva)
  // la scorciatoia apre il richiamo; finché il server non c'è, la finestra
  const alPremere = () => { if (!richiamo.alterna()) finestra.alterna() }
  scorciatoia.attiva(alPremere)
  // con `--inspect` e MYYND_ISPEZIONE=1 si prova il guscio dal vivo: un
  // `import()` dall'inspector non passa, e la scorciatoia non si preme da
  // uno script — questi sono i pezzi che servono, a portata di mano
  if (process.env.MYYND_ISPEZIONE) Object.assign(globalThis, { myynd: { app, richiamo, finestra, alPremere } })
  // il computer si è svegliato: il server deve saperlo (`server.ts`)
  powerMonitor.on('resume', server.sveglia)
  canali(azioniMenu, vai)

  // il renderer appena caricato non sa ancora come stanno gli aggiornamenti
  w.webContents.on('did-finish-load', () => {
    if (finestra.nostra(w.webContents.getURL())) finestra.manda('myynd:aggiornamento', aggiornamenti.stato())
  })

  const caricaApp = (url: string) => {
    finestra.caricaApp(url)
    richiamo.prepara(url, argomenti)
  }
  const ascolto: server.Ascolto = {
    suPorta: porta => caricaApp(`http://127.0.0.1:${porta}/`),
    suMorte: righe => chiediRiapertura(righe, ascolto)
  }
  // in `app:dev` il server ce l'ha già `npm run dev`: un secondo sugli stessi
  // dati farebbe a botte con il primo per l'indice
  if (process.env.MYYND_APP_WEB) caricaApp(process.env.MYYND_APP_WEB)
  else await server.avvia(ascolto)

  // prima di installare un aggiornamento si spegne tutto come a un'uscita
  // normale: il server deve finire di scrivere, e la X deve chiudere davvero
  void aggiornamenti.prepara(finestra.attuale, spegniSenzaUscire)

  app.on('activate', () => finestra.mostra())
  // con un segno nella barra l'app vive anche senza finestre: è il punto
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray.attiva()) app.quit() })
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
  richiamo.distruggi()
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
function canali(azioni: menu.Azioni, vai: (dove: Dove) => void) {
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
    // nascosta: all'accesso non deve comparire una finestra che nessuno ha
    // chiesto. `openAsHidden` lo dice al Mac, l'argomento lo dice a noi
    app.setLoginItemSettings({ openAtLogin: !!acceso, openAsHidden: true, args: [ARGOMENTO_NASCOSTO] })
  })
  // — il richiamo —
  ipcMain.on('myynd:richiamo-chiudi', () => richiamo.nascondi())
  ipcMain.on('myynd:richiamo-misura', (_e, altezza: unknown) => richiamo.ridimensiona(Number(altezza)))
  ipcMain.on('myynd:richiamo-apri', (_e, dove: unknown) => vai(doveValido(dove) ?? 'oggi'))
  /*
   * Un avviso di sistema, su richiesta della pagina.
   *
   * La pagina lo chiede solo se la persona ha acceso gli avvisi e la finestra
   * non è davanti: qui non si decide niente, si mostra. Un clic porta su la
   * finestra sul posto giusto.
   */
  // una alla volta, e non più di una ogni due secondi: tre bozze pronte
  // insieme sono un avviso, non tre — e una pagina impazzita non deve poter
  // riempire il centro notifiche
  let ultimoAvviso = 0
  ipcMain.on('myynd:notifica', (_e, n: unknown) => {
    if (!Notification.isSupported()) return
    if (Date.now() - ultimoAvviso < 2_000) return
    ultimoAvviso = Date.now()
    const { titolo, corpo, dove } = (n && typeof n === 'object' ? n : {}) as { titolo?: unknown; corpo?: unknown; dove?: unknown }
    const title = String(titolo ?? '').trim().slice(0, 120)
    if (!title) return
    const nota = new Notification({ title, body: String(corpo ?? '').trim().slice(0, 300) })
    nota.on('click', () => vai(doveValido(dove) ?? 'oggi'))
    nota.show()
  })
  ipcMain.handle('myynd:aggiornamenti-stato', () => aggiornamenti.stato())
  ipcMain.handle('myynd:aggiornamenti-controlla', () => aggiornamenti.controlla())
  ipcMain.handle('myynd:aggiornamenti-installa', () => aggiornamenti.installa())
}
