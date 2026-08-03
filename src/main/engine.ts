/**
 * Ponte verso il motore (src/core), scritto in parallelo da un altro agente.
 *
 * L'interfaccia `Engine` è duplicata qui (invece di importarla da `@core`)
 * per restare tipizzata anche se `src/core/index.ts` sparisse momentaneamente
 * mentre l'altro agente lavora — il caricamento resta comunque protetto da
 * un try/catch.
 *
 * Nota tecnica su come viene caricato: si passa dall'alias `@core` (risolto
 * da Rollup in fase di build), non da un percorso file letto a runtime.
 * È stato provato l'approccio opposto (import di un percorso assoluto
 * calcolato a runtime, che Node può eseguire nativamente da sorgente .ts
 * senza bundler) ma non regge con un modulo multi-file reale: `src/core`
 * usa import relativi con estensione `.js` che puntano a file `.ts` — una
 * convenzione TypeScript/NodeNext standard che Rollup risolve correttamente
 * ma che il resolver nativo di Node non riscrive, quindi fallirebbe con
 * ERR_MODULE_NOT_FOUND. Passare dall'alias è quindi l'unica via corretta;
 * il limite noto è che se `src/core/index.ts` fosse del tutto assente la
 * build fallirebbe in fase di bundling (non a runtime) — accettabile perché
 * il file esiste già.
 */

import type {
  ActivityDay,
  Answer,
  DashboardState,
  DataSource,
  Doc,
  ModelStatus,
  Profile,
  Proposal,
  TransparencyInfo,
} from '@shared/types'

export interface Engine {
  init(): Promise<void>
  getDashboard(): Promise<DashboardState>
  getProposals(): Promise<Proposal[]>
  getProposal(id: string): Promise<Proposal | null>
  actOnProposal(id: string, action: 'invia' | 'ignora', editedBody?: string): Promise<Proposal[]>
  /** `onReset` (opzionale) segnala che un tentativo morto a metà è stato ripetuto da capo */
  ask(question: string, onToken: (t: string) => void, onReset?: () => void): Promise<Answer>
  getActivity(): Promise<ActivityDay[]>
  getTransparency(): Promise<TransparencyInfo>
  getSource(docId: string): Promise<Doc | null>
  getModelStatus(): Promise<ModelStatus>
  setApiKey(key: string): Promise<ModelStatus>
  onWaitingChanged(cb: (count: number) => void): void
}

interface CoreModule {
  createEngine(source: DataSource, configDir: string): Engine
}

/** Carica il motore vero da src/core. Se non è (ancora) disponibile, torna
 *  a uno stub locale così la shell si avvia comunque.
 *
 *  `configDir` è dove il motore scrive stato locale (registro attività,
 *  proposte in corso…), separato dalla `source` (una DataSource già
 *  costruita da chi chiama — oggi file locali, domani una vera casella di
 *  posta) che resta di sola lettura. */
export async function loadEngine(source: DataSource, configDir: string): Promise<Engine> {
  try {
    const mod = (await import('@core')) as CoreModule
    if (typeof mod?.createEngine !== 'function') {
      throw new Error('createEngine non esportata da @core')
    }
    return mod.createEngine(source, configDir)
  } catch (err) {
    console.warn('motore non disponibile', err)
    return createStubEngine()
  }
}

function createStubEngine(): Engine {
  const profile: Profile = {
    company: { name: 'myynd', legalName: 'myynd', description: '', city: '' },
    owner: { name: '—', email: '' },
    colleagues: [],
    clients: [],
    suppliers: [],
  }

  const model: ModelStatus = {
    ready: false,
    reason: 'motore non disponibile',
    model: '—',
  }

  let waitingCb: ((count: number) => void) | null = null
  void waitingCb

  return {
    async init() {},
    async getDashboard(): Promise<DashboardState> {
      return { profile, waiting: [], recent: [], model }
    },
    async getProposals() {
      return []
    },
    async getProposal() {
      return null
    },
    async actOnProposal() {
      return []
    },
    async ask(_question, onToken) {
      const text = 'il motore non è disponibile.'
      onToken(text)
      return { text, sources: [], status: 'non_disponibile', note: 'motore non disponibile' }
    },
    async getActivity() {
      return []
    },
    async getTransparency(): Promise<TransparencyInfo> {
      return {
        reads: [],
        writes: [],
        leaves: [],
        counts: { threads: 0, messages: 0, docs: 0, chunks: 0 },
        modelName: '—',
      }
    },
    async getSource() {
      return null
    },
    async getModelStatus() {
      return model
    },
    async setApiKey() {
      return model
    },
    onWaitingChanged(cb) {
      waitingCb = cb
    },
  }
}
