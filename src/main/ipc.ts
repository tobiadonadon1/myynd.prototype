import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AskChunk } from '@shared/types'
import type { Engine } from './engine'

/** Registra l'intera superficie di MyyndApi (vedi src/shared/types.ts) su ipcMain. */
export function registerIpc(engine: Engine, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('dashboard:get', () => engine.getDashboard())
  ipcMain.handle('proposals:get', () => engine.getProposals())
  ipcMain.handle('proposal:get', (_event, id: string) => engine.getProposal(id))
  ipcMain.handle(
    'proposal:act',
    (_event, id: string, action: 'invia' | 'ignora', editedBody?: string) =>
      engine.actOnProposal(id, action, editedBody),
  )
  ipcMain.handle('activity:get', () => engine.getActivity())
  ipcMain.handle('transparency:get', () => engine.getTransparency())
  ipcMain.handle('source:get', (_event, docId: string) => engine.getSource(docId))
  ipcMain.handle('model:get', () => engine.getModelStatus())
  ipcMain.handle('model:setApiKey', (_event, key: string) => engine.setApiKey(key))

  // ask() torna un requestId subito; i token arrivano su 'ask:chunk'.
  ipcMain.handle('ask', (event, question: string) => {
    const requestId = randomUUID()
    const sender = getWindow()?.webContents ?? event.sender

    const send = (chunk: AskChunk): void => {
      if (!sender.isDestroyed()) sender.send('ask:chunk', chunk)
    }

    engine
      .ask(
        question,
        (text) => send({ requestId, type: 'token', text }),
        () => send({ requestId, type: 'reset' }),
      )
      .then((answer) => send({ requestId, type: 'done', answer }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'errore sconosciuto'
        send({ requestId, type: 'error', message })
      })

    return { requestId }
  })

  ipcMain.on('window:hide', () => {
    getWindow()?.hide()
  })
}
