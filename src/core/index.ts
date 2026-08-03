/**
 * La facciata che il processo main di Electron importa. Tutto il motore
 * (dati, ricerca, modello, attività) vive dietro queste funzioni: sopra
 * questo file nessuno sa che esistono file su disco o un processo claude.
 *
 * Il livello dati è iniettato, non costruito qui dentro: `createEngine`
 * prende una `DataSource` già pronta, e `createFixtureDataSource` è il modo
 * con cui il chiamante ne costruisce una di prova. Sostituire i file locali
 * con una vera casella di posta, domani, vuol dire scrivere un'altra
 * `DataSource` e passarla qui — non toccare una riga di questo file.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  ActivityDay,
  Answer,
  DashboardState,
  DataSource,
  Doc,
  ModelStatus,
  Proposal,
  TransparencyInfo,
} from '@shared/types'
import { ActivityLog } from './activity/log.js'
import { FixtureDataSource } from './datasource/fixture.js'
import { ASK_SYSTEM_PROMPT, answerQuestion } from './engine/answer.js'
import { ProposalsEngine } from './engine/proposals.js'
import { ClaudeCliProvider, MODEL_DISPLAY_NAME } from './llm/claude-cli.js'
import { buildIndex, type RetrievalIndex } from './retrieval/index.js'

export interface Engine {
  init(): Promise<void>
  getDashboard(): Promise<DashboardState>
  getProposals(): Promise<Proposal[]>
  getProposal(id: string): Promise<Proposal | null>
  actOnProposal(id: string, action: 'invia' | 'ignora', editedBody?: string): Promise<Proposal[]>
  /** avvia una domanda; `onReset` (opzionale) segnala che un tentativo morto è stato ripetuto da capo */
  ask(question: string, onToken: (t: string) => void, onReset?: () => void): Promise<Answer>
  getActivity(): Promise<ActivityDay[]>
  getTransparency(): Promise<TransparencyInfo>
  getSource(docId: string): Promise<Doc | null>
  getModelStatus(): Promise<ModelStatus>
  setApiKey(key: string): Promise<ModelStatus>
  onWaitingChanged(cb: (count: number) => void): void
}

/** Costruisce la DataSource di prova su file locali — l'unico punto che sa che esiste una cartella data/. */
export function createFixtureDataSource(dataDir: string): DataSource {
  return new FixtureDataSource(dataDir)
}

function buildTransparency(index: RetrievalIndex, dataSource: DataSource, modelName: string): TransparencyInfo {
  const reads: TransparencyInfo['reads'] = [
    {
      label: dataSource.label,
      // niente "da {label}" qui: la label è già la riga sopra questo
      // dettaglio, ripeterla nel testo suona come "file locali — mail,
      // documenti e listini da file locali".
      detail: `mail, documenti e listini — ${index.counts.messages} messaggi in ${index.counts.threads} conversazioni, ${index.counts.docs} documenti.`,
    },
  ]

  // getIssues() torna già frasi complete e leggibili in italiano piano —
  // non si ripete qui "non letto", non si aggiunge un conteggio tecnico,
  // si mostrano così come sono.
  const issues = dataSource.getIssues()
  if (issues.length > 0) {
    reads.push({
      label: 'non letti',
      detail: issues.join(' '),
    })
  }

  return {
    reads,
    writes: [
      {
        label: 'bozze di risposta',
        detail:
          'risposte pronte per le mail rimaste senza risposta, nella tua voce. restano bozze: myynd non invia nulla da sé, decidi tu quando e se mandarle.',
      },
      {
        label: 'registro attività',
        detail: 'un registro locale di cosa è stato letto, scritto e chiesto, giorno per giorno.',
      },
    ],
    leaves: [
      {
        label: 'claude',
        detail:
          "il testo della domanda e i passaggi trovati nei documenti, per generare una risposta. nient'altro lascia questo computer — nessuna chiave, nessun file intero, nessun dato che non serva a rispondere.",
      },
    ],
    counts: index.counts,
    modelName,
  }
}

/* ─────────────────────── stato del corpus fra un avvio e l'altro ───────────────────── */

function corpusStatePath(configDir: string): string {
  return path.join(configDir, 'corpus.json')
}

function readKnownCorpusHash(configDir: string): string | null {
  try {
    const raw = readFileSync(corpusStatePath(configDir), 'utf-8')
    const parsed = JSON.parse(raw) as { hash?: unknown }
    return typeof parsed.hash === 'string' ? parsed.hash : null
  } catch {
    return null
  }
}

function writeKnownCorpusHash(configDir: string, hash: string): void {
  try {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(corpusStatePath(configDir), JSON.stringify({ hash }), 'utf-8')
  } catch (err) {
    console.error('[myynd/core] impossibile salvare lo stato del corpus:', err)
  }
}

export function createEngine(source: DataSource, configDir: string): Engine {
  const dataSource = source
  const provider = new ClaudeCliProvider()
  const activity = new ActivityLog(configDir)

  let index: RetrievalIndex | null = null
  let proposalsEngine: ProposalsEngine | null = null
  let waitingCb: ((count: number) => void) | null = null

  async function ensureIndex(): Promise<RetrievalIndex> {
    if (!index) index = await buildIndex(dataSource)
    return index
  }

  return {
    async init() {
      const idx = await ensureIndex()

      // "letti N messaggi e M documenti" è un evento reale, non un rumore
      // di avvio: si scrive nel registro solo quando il corpus è
      // effettivamente cambiato da quando è stato letto l'ultima volta,
      // altrimenti ogni riavvio dell'app aggiungerebbe una riga identica.
      const knownHash = readKnownCorpusHash(configDir)
      if (knownHash !== idx.hash) {
        activity.add('lettura', `letti ${idx.counts.messages} messaggi e ${idx.counts.docs} documenti`)
        writeKnownCorpusHash(configDir, idx.hash)
      }

      proposalsEngine = new ProposalsEngine(idx, provider, configDir, activity, (count) => {
        waitingCb?.(count)
      })

      // lo spawn e la verifica di claude non devono bloccare l'apertura dell'app
      void provider.warmup(ASK_SYSTEM_PROMPT).then(() => {
        void proposalsEngine?.init()
      })
    },

    async getDashboard() {
      const idx = await ensureIndex()
      const waiting = proposalsEngine ? proposalsEngine.getAll().filter((p) => p.status === 'in_attesa') : []
      const days = await activity.getActivity()
      const recent = days[0]?.entries.slice(0, 8) ?? []
      return {
        profile: idx.profile,
        waiting,
        recent,
        model: provider.getStatus(),
        preparing: proposalsEngine?.isGenerating() ?? false,
      }
    },

    async getProposals() {
      return proposalsEngine?.getAll() ?? []
    },

    async getProposal(id) {
      return proposalsEngine?.getById(id) ?? null
    },

    async actOnProposal(id, action, editedBody) {
      return proposalsEngine?.act(id, action, editedBody) ?? []
    },

    async ask(question, onToken, onReset) {
      const idx = await ensureIndex()
      return answerQuestion(question, idx, provider, onToken, activity, onReset)
    },

    async getActivity() {
      return activity.getActivity()
    },

    async getTransparency() {
      const idx = await ensureIndex()
      // il nome mostrato è quello leggibile, non l'id tecnico del modello
      // (quello serve solo al flag --model della cli, mai a video).
      return buildTransparency(idx, dataSource, MODEL_DISPLAY_NAME)
    },

    async getSource(docId) {
      const idx = await ensureIndex()
      return idx.getDoc(docId)
    },

    async getModelStatus() {
      return provider.getStatus()
    },

    async setApiKey(_key) {
      // le chiavi api non sono più il percorso di autenticazione: la
      // generazione passa dalla cli claude già collegata all'abbonamento
      // dell'utente. il metodo resta per non rompere il ponte ipc.
      return provider.getStatus()
    },

    onWaitingChanged(cb) {
      waitingCb = cb
    },
  }
}
