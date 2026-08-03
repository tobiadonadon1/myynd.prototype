import { existsSync } from 'node:fs'
import { app, Menu } from 'electron'
import path from 'node:path'
import { createFixtureDataSource } from '@core'
import { loadEngine } from './engine'
import { registerIpc } from './ipc'
import { createTray, setWaiting } from './tray'
import { getBoundShortcut, registerShortcut, shortcutLabel, unregisterShortcut } from './shortcut'
import { bringToFront, createMainWindow, getMainWindow, markQuitting, summon } from './window'

app.setName('Myynd')

function resolveDataDir(): string {
  // in produzione i dati vengono impacchettati nelle risorse dell'app;
  // in sviluppo si legge direttamente data/ dalla radice del progetto.
  //
  // mai process.cwd(): dipende da dove è stata lanciata l'app, non da dove
  // sta il progetto. lanciandola da un'altra cartella il corpus risultava
  // vuoto, l'indice si costruiva su zero file e la cache delle proposte
  // veniva scritta vuota — un fallimento silenzioso, il peggior tipo.
  if (app.isPackaged) return path.join(process.resourcesPath, 'data')

  const candidati = [
    path.join(app.getAppPath(), 'data'),
    path.join(process.cwd(), 'data'),
  ]
  const trovata = candidati.find((c) => existsSync(path.join(c, 'profilo.json')))
  if (!trovata) {
    // se non c'è, si dice: meglio fermarsi che indicizzare il vuoto.
    throw new Error(
      `corpus non trovato. cercato in:\n  ${candidati.join('\n  ')}`,
    )
  }
  return trovata
}

function resolveConfigDir(): string {
  // stato locale scrivibile (registro attività, proposte…), separato dal
  // corpus di sola lettura in data/ — la cartella standard dell'app.
  return app.getPath('userData')
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  // solo il menu "Myynd" obbligatorio su macOS (About/Nascondi/Esci…),
  // niente File/Edit/View/Window: nessuna barra dei menu applicativa.
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }]))

  const win = createMainWindow()

  registerShortcut(() => getMainWindow())

  const tray = createTray({
    onOpen: () => {
      const w = getMainWindow()
      if (w) summon(w)
    },
    onQuit: () => app.quit(),
    shortcutLabel: () => shortcutLabel(),
  })

  // il punto di iniezione del livello dati: oggi file locali, domani una
  // vera casella di posta — basta passare un'altra DataSource qui, senza
  // toccare il motore.
  const dataSource = createFixtureDataSource(resolveDataDir())
  const engine = await loadEngine(dataSource, resolveConfigDir())
  await engine.init()
  engine.onWaitingChanged((count) => setWaiting(count))

  registerIpc(engine, () => getMainWindow())

  app.on('activate', () => {
    const w = getMainWindow()
    if (w) bringToFront(w)
  })

  console.log('myynd pronto — scorciatoia:', getBoundShortcut() ?? 'nessuna')
  void tray
  void win
}

// app "summonabile": chiudere la finestra la nasconde, non esce dall'app.
app.on('window-all-closed', () => {
  // intenzionalmente vuoto su macOS: l'app resta viva in dock e tray.
})

app.on('before-quit', () => {
  markQuitting()
})

app.on('will-quit', () => {
  unregisterShortcut()
})

bootstrap().catch((err: unknown) => {
  console.error('avvio fallito', err)
})
