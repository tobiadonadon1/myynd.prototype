import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { AskChunk, MyyndApi } from '@shared/types'

const api: MyyndApi = {
  getDashboard: () => ipcRenderer.invoke('dashboard:get'),
  getProposals: () => ipcRenderer.invoke('proposals:get'),
  getProposal: (id) => ipcRenderer.invoke('proposal:get', id),
  actOnProposal: (id, action, editedBody) =>
    ipcRenderer.invoke('proposal:act', id, action, editedBody),

  ask: (question) => ipcRenderer.invoke('ask', question),
  onAskChunk: (cb) => {
    const listener = (_event: IpcRendererEvent, chunk: AskChunk): void => cb(chunk)
    ipcRenderer.on('ask:chunk', listener)
    return () => ipcRenderer.removeListener('ask:chunk', listener)
  },

  getActivity: () => ipcRenderer.invoke('activity:get'),
  getTransparency: () => ipcRenderer.invoke('transparency:get'),
  getSource: (docId) => ipcRenderer.invoke('source:get', docId),
  getModelStatus: () => ipcRenderer.invoke('model:get'),
  setApiKey: (key) => ipcRenderer.invoke('model:setApiKey', key),

  hideWindow: () => {
    ipcRenderer.send('window:hide')
  },
  onShown: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('window:shown', listener)
    return () => ipcRenderer.removeListener('window:shown', listener)
  },
}

contextBridge.exposeInMainWorld('myynd', api)
