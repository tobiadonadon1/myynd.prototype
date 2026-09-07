// Gli aggiornamenti, quando si possono fare.
//
// `electron-updater` funziona solo su un'app impacchettata, con un feed da
// cui scaricare e — su Mac — firmata con un Developer ID: in tutti gli altri
// casi non fallisce con un errore, dice *perché* è spento, e le preferenze
// lo mostrano così com'è. Il modulo si carica tardi e dentro un `try`: in
// sviluppo non deve esistere nemmeno il rischio che manchi.

import { app, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { t } from './lingua.ts'
import { scriviRegistro } from './server.ts'

export type Aggiornamento =
  | { stato: 'spento'; perche: 'non-firmata' | 'sviluppo' | 'nessun-feed' }
  | { stato: 'controllo' }
  | { stato: 'aggiornata' }
  | { stato: 'scarico'; percento: number; versione: string }
  | { stato: 'pronta'; versione: string }
  | { stato: 'errore'; messaggio: string }

type Updater = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  setFeedURL(o: { provider: 'generic'; url: string }): void
  on(evento: string, cb: (...a: unknown[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
  logger: unknown
}

let ultimo: Aggiornamento = { stato: 'spento', perche: 'sviluppo' }
let updater: Updater | null = null
let invia: (a: Aggiornamento) => void = () => {}
let inCorso: Promise<Aggiornamento> | null = null
let primaDiInstallare: () => Promise<void> = async () => {}

function feed(): string | null {
  if (process.env.MYYND_AGGIORNAMENTI_URL) return process.env.MYYND_AGGIORNAMENTI_URL
  try {
    const f = JSON.parse(readFileSync(fileURLToPath(new URL('./feed.json', import.meta.url)), 'utf8'))
    return typeof f?.url === 'string' && f.url ? f.url : null
  } catch {
    return null
  }
}

/** Su Mac Squirrel vuole una firma vera: la si legge da `codesign`, non si indovina. */
function firmata(): Promise<boolean> {
  if (process.platform !== 'darwin') return Promise.resolve(true)
  return new Promise(risolvi => {
    const bundle = resolve(process.execPath, '..', '..', '..')
    try {
      execFile('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], { timeout: 5000 }, (_e, _out, err) => {
        risolvi(/Authority=Developer ID Application/.test(String(err ?? '')))
      })
    } catch {
      risolvi(false)
    }
  })
}

function segna(a: Aggiornamento) {
  ultimo = a
  invia(a)
}

export function stato(): Aggiornamento {
  return ultimo
}

export async function prepara(finestra: () => BrowserWindow | null, spegni: () => Promise<void>) {
  invia = a => finestra()?.webContents.send('myynd:aggiornamento', a)
  primaDiInstallare = spegni
  if (!app.isPackaged) { ultimo = { stato: 'spento', perche: 'sviluppo' }; return }
  const url = feed()
  if (!url) { ultimo = { stato: 'spento', perche: 'nessun-feed' }; return }
  if (!(await firmata())) { ultimo = { stato: 'spento', perche: 'non-firmata' }; return }
  try {
    const modulo = await import('electron-updater') as { autoUpdater?: Updater; default?: { autoUpdater?: Updater } }
    const u = modulo.autoUpdater ?? modulo.default?.autoUpdater
    if (!u) throw new Error('electron-updater senza autoUpdater')
    u.logger = null
    u.autoDownload = true
    u.autoInstallOnAppQuit = true
    u.setFeedURL({ provider: 'generic', url })
    u.on('checking-for-update', () => segna({ stato: 'controllo' }))
    u.on('update-not-available', () => segna({ stato: 'aggiornata' }))
    u.on('update-available', info => segna({ stato: 'scarico', percento: 0, versione: versioneDi(info) }))
    u.on('download-progress', p => {
      const percento = Math.round(Number((p as { percent?: number })?.percent ?? 0))
      segna({ stato: 'scarico', percento, versione: ultimo.stato === 'scarico' ? ultimo.versione : '' })
    })
    u.on('update-downloaded', info => segna({ stato: 'pronta', versione: versioneDi(info) }))
    u.on('error', e => {
      const messaggio = e instanceof Error ? e.message : String(e)
      scriviRegistro(`guscio · aggiornamenti: ${messaggio}`)
      segna({ stato: 'errore', messaggio })
    })
    updater = u
    ultimo = { stato: 'aggiornata' }
  } catch (e) {
    scriviRegistro(`guscio · electron-updater non parte: ${e instanceof Error ? e.message : e}`)
    ultimo = { stato: 'spento', perche: 'nessun-feed' }
  }
}

function versioneDi(info: unknown): string {
  const v = (info as { version?: unknown })?.version
  return typeof v === 'string' ? v : ''
}

/** Chiede adesso. Si risolve al primo esito: già aggiornata, in scarico, o errore. */
export function controlla(): Promise<Aggiornamento> {
  if (!updater) return Promise.resolve(ultimo)
  if (inCorso) return inCorso
  const u = updater
  inCorso = new Promise<Aggiornamento>(risolvi => {
    const fine = (a: Aggiornamento) => { inCorso = null; risolvi(a) }
    const precedente = invia
    invia = a => {
      precedente(a)
      if (a.stato === 'aggiornata' || a.stato === 'scarico' || a.stato === 'errore' || a.stato === 'pronta') {
        invia = precedente
        fine(a)
      }
    }
    u.checkForUpdates().catch(e => {
      invia = precedente
      const messaggio = e instanceof Error ? e.message : String(e)
      segna({ stato: 'errore', messaggio })
      fine({ stato: 'errore', messaggio })
    })
  })
  return inCorso
}

/**
 * Chiude e installa quello che è già sceso. Se non c'è niente, non fa niente.
 *
 * `quitAndInstall` chiude le finestre e poi esce da sé, senza passare da
 * `before-quit`: la X che su Mac nasconde invece di chiudere lo bloccherebbe
 * a metà, con una finestra nascosta e niente installato, e il server non
 * riceverebbe il suo SIGTERM. Quindi prima si spegne tutto come a un'uscita
 * normale, e solo dopo si lascia fare all'aggiornamento.
 */
export async function installa(): Promise<void> {
  if (!updater || ultimo.stato !== 'pronta') {
    scriviRegistro(`guscio · installa chiesto ma ${t('Gli aggiornamenti non sono disponibili.')}`)
    return
  }
  await primaDiInstallare()
  updater.quitAndInstall()
}
