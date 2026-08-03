/**
 * Wrapper tipizzato su `window.myynd`.
 *
 * Il renderer non parla mai direttamente con `window.myynd`: passa sempre
 * da qui. Se il preload non è (ancora) caricato — finestra aperta fuori da
 * Electron, script non montato, eccetera — `window.myynd` è `undefined`.
 * Invece di lasciar esplodere ogni schermata con un errore, ogni metodo
 * qui sotto torna un valore onesto e vuoto: le schermate vedono gli stessi
 * stati "niente in attesa" / "modello non collegato" che vedrebbero con un
 * motore vero ma senza dati.
 */

import type {
  ActivityDay,
  AskChunk,
  DashboardState,
  Doc,
  ModelStatus,
  MyyndApi,
  Profile,
  Proposal,
  TransparencyInfo,
} from '@shared/types'

const profiloVuoto: Profile = {
  company: { name: '', legalName: '', description: '', city: '' },
  owner: { name: '', email: '' },
  colleagues: [],
  clients: [],
  suppliers: [],
}

const modelloAssente: ModelStatus = {
  ready: false,
  reason: 'claude non collegato.',
  model: '—',
}

const transparenzaVuota: TransparencyInfo = {
  reads: [],
  writes: [],
  leaves: [],
  counts: { threads: 0, messages: 0, docs: 0, chunks: 0 },
  modelName: '—',
}

function bridge(): MyyndApi | null {
  return typeof window !== 'undefined' && window.myynd ? window.myynd : null
}

/** true se il preload è caricato e il ponte verso il main è disponibile. */
export function bridgeDisponibile(): boolean {
  return bridge() !== null
}

export const api = {
  async getDashboard(): Promise<DashboardState> {
    const b = bridge()
    if (!b) return { profile: profiloVuoto, waiting: [], recent: [], model: modelloAssente }
    return b.getDashboard()
  },

  async getProposals(): Promise<Proposal[]> {
    const b = bridge()
    if (!b) return []
    return b.getProposals()
  },

  async getProposal(id: string): Promise<Proposal | null> {
    const b = bridge()
    if (!b) return null
    return b.getProposal(id)
  },

  async actOnProposal(
    id: string,
    action: 'invia' | 'ignora',
    editedBody?: string,
  ): Promise<Proposal[]> {
    const b = bridge()
    if (!b) return []
    return b.actOnProposal(id, action, editedBody)
  },

  async ask(question: string): Promise<{ requestId: string }> {
    const b = bridge()
    if (!b) return { requestId: '' }
    return b.ask(question)
  },

  onAskChunk(cb: (chunk: AskChunk) => void): () => void {
    const b = bridge()
    if (!b) return () => {}
    return b.onAskChunk(cb)
  },

  async getActivity(): Promise<ActivityDay[]> {
    const b = bridge()
    if (!b) return []
    return b.getActivity()
  },

  async getTransparency(): Promise<TransparencyInfo> {
    const b = bridge()
    if (!b) return transparenzaVuota
    return b.getTransparency()
  },

  async getSource(docId: string): Promise<Doc | null> {
    const b = bridge()
    if (!b) return null
    return b.getSource(docId)
  },

  async getModelStatus(): Promise<ModelStatus> {
    const b = bridge()
    if (!b) return modelloAssente
    return b.getModelStatus()
  },

  hideWindow(): void {
    bridge()?.hideWindow()
  },

  onShown(cb: () => void): () => void {
    const b = bridge()
    if (!b) return () => {}
    return b.onShown(cb)
  },
}
