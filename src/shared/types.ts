/**
 * Myynd — contratti condivisi.
 *
 * Questo file è l'unico punto di accordo fra main, preload e renderer.
 * Il livello dati è sostituibile: qualunque cosa implementi `DataSource`
 * (fixture su disco oggi, Gmail/Drive domani) funziona senza toccare la UI.
 */

/* ────────────────────────────── persone ────────────────────────────── */

export interface Person {
  name: string
  email: string
  role?: string
  org?: string
}

export interface Profile {
  company: {
    name: string
    legalName: string
    description: string
    city: string
    site?: string
  }
  owner: Person
  colleagues: Person[]
  clients: Person[]
  suppliers: Person[]
}

/* ─────────────────────────── materiale grezzo ──────────────────────── */

export type DocKind =
  | 'mail'
  | 'documento'
  | 'listino'
  | 'preventivo'
  | 'trascrizione'

export interface MailMessage {
  id: string
  threadId: string
  from: Person
  to: Person[]
  cc?: Person[]
  subject: string
  /** ISO 8601 */
  date: string
  body: string
  attachments?: { name: string; path: string }[]
  direction: 'ricevuta' | 'inviata'
  /** true = ancora senza risposta da parte nostra */
  unanswered?: boolean
  /**
   * locatore opaco deciso dalla DataSource (oggi un percorso su disco,
   * domani un id di messaggio Gmail): nessuno strato sopra la DataSource
   * lo costruisce o lo indovina, lo legge e basta.
   */
  path: string
}

export interface Thread {
  id: string
  subject: string
  /** ordinati dal più vecchio al più recente */
  messages: MailMessage[]
  /** locatore opaco deciso dalla DataSource, stesso principio di MailMessage.path */
  path: string
}

export interface Doc {
  id: string
  title: string
  kind: DocKind
  /** percorso relativo dentro data/ */
  path: string
  /** ISO 8601 */
  date?: string
  body: string
  /** un listino superato resta leggibile ma va segnalato come non corrente */
  superseded?: boolean
  supersededBy?: string
  supersededNote?: string
}

/**
 * Il livello dati. Sostituibile senza ricostruire l'interfaccia.
 */
export interface DataSource {
  id: string
  label: string
  listThreads(): Promise<Thread[]>
  listDocs(): Promise<Doc[]>
  getProfile(): Promise<Profile>
  /** contenuto integrale di un documento, per il pannello sorgente */
  readDoc(id: string): Promise<Doc | null>
  /**
   * cose che l'ultima scansione non è riuscita a leggere, in italiano
   * piano, pronte per la pagina trasparenza — mai solo un log in console.
   * Array vuoto quando non c'è nulla da segnalare.
   */
  getIssues(): string[]
}

/* ────────────────────────────── sorgenti ───────────────────────────── */

/**
 * Una sorgente citata. Nel testo compare come marcatore inline ⟦s1⟧,
 * reso come un segno tenue e rivelato solo al passaggio del mouse.
 */
export interface SourceRef {
  /** "s1", "s2", … — corrisponde al marcatore nel testo */
  id: string
  docId: string
  title: string
  kind: DocKind
  /** riferimento opaco deciso dalla DataSource — non necessariamente un percorso dentro data/ */
  path: string
  /** il testo effettivo che fonda l'affermazione */
  excerpt: string
  date?: string
  /** vero se la sorgente è un documento superato */
  superseded?: boolean
}

/* ─────────────────────────── risposta a domanda ────────────────────── */

export type AnswerStatus =
  /** ha trovato materiale e risponde */
  | 'ok'
  /** non ha materiale sufficiente: lo dice e si ferma */
  | 'insufficiente'
  /** il modello non è raggiungibile */
  | 'non_disponibile'

export interface Answer {
  text: string
  sources: SourceRef[]
  status: AnswerStatus
  /** motivo leggibile quando status ≠ 'ok' */
  note?: string
}

/* ──────────────────────── lavoro in attesa ─────────────────────────── */

export type ProposalKind = 'risposta' | 'documento' | 'richiesta'

export interface Attachment {
  id: string
  name: string
  path: string
  /** perché questo allegato e non un altro — mostrato in chiaro */
  reason: string
}

export type ProposalStatus =
  | 'in_attesa'
  | 'inviata'
  | 'ignorata'

export interface Proposal {
  id: string
  kind: ProposalKind
  /** una riga, minuscolo */
  title: string
  who: Person
  /** ISO 8601 — quando è arrivata la cosa che l'ha innescata */
  receivedAt: string
  /** una riga sul perché è stata preparata */
  reason: string
  subject?: string
  /** il testo preparato, può contenere marcatori ⟦s1⟧ */
  body: string
  attachments: Attachment[]
  sources: SourceRef[]
  threadId?: string
  status: ProposalStatus
}

/* ───────────────────────────── registro ────────────────────────────── */

export type ActivityKind =
  | 'lettura'
  | 'bozza'
  | 'invio'
  | 'domanda'
  | 'ignorata'
  | 'modifica'

export interface ActivityEntry {
  id: string
  /** ISO 8601 */
  at: string
  kind: ActivityKind
  /** una riga, minuscolo, italiano piano */
  text: string
}

/** raggruppato per giorno, come lo legge una persona */
export interface ActivityDay {
  /** "oggi" | "ieri" | "12 marzo" */
  label: string
  date: string
  entries: ActivityEntry[]
}

/* ────────────────────────── pagina trasparenza ─────────────────────── */

export interface TransparencyInfo {
  /** cosa può leggere */
  reads: { label: string; detail: string }[]
  /** cosa può scrivere */
  writes: { label: string; detail: string }[]
  /** cosa esce dal computer */
  leaves: { label: string; detail: string }[]
  /** conteggi reali sul corpus effettivamente indicizzato */
  counts: { threads: number; messages: number; docs: number; chunks: number }
  modelName: string
}

/* ─────────────────────────── stato modello ─────────────────────────── */

export interface ModelStatus {
  ready: boolean
  /** motivo in italiano piano quando non è pronto */
  reason?: string
  model: string
}

/* ──────────────────────────── dashboard ────────────────────────────── */

export interface DashboardState {
  profile: Profile
  waiting: Proposal[]
  recent: ActivityEntry[]
  model: ModelStatus
  /**
   * vero mentre le proposte sono in corso di (ri)generazione in background
   * (al primo avvio, o dopo che il corpus è cambiato) — additivo: un
   * consumatore che non lo riconosce può ignorarlo in sicurezza, ma senza
   * di lui "niente in attesa" si mostra anche quando in realtà si sta
   * ancora preparando qualcosa, per 50-90 secondi.
   */
  preparing?: boolean
}

/* ──────────────────────── ponte main ↔ renderer ────────────────────── */

export interface AskChunk {
  requestId: string
  /**
   * 'reset' è additivo: un client che non lo riconosce può ignorarlo in
   * sicurezza, perché il successivo 'done' porta comunque il testo finale
   * corretto — segnala solo che il testo accumulato fin qui va scartato
   * (un tentativo è morto a metà ed è stato ripetuto da capo).
   */
  type: 'token' | 'done' | 'error' | 'reset'
  /** presente su 'token' */
  text?: string
  /** presente su 'done' */
  answer?: Answer
  /** presente su 'error' */
  message?: string
}

export interface MyyndApi {
  getDashboard(): Promise<DashboardState>
  getProposals(): Promise<Proposal[]>
  getProposal(id: string): Promise<Proposal | null>
  actOnProposal(
    id: string,
    action: 'invia' | 'ignora',
    editedBody?: string,
  ): Promise<Proposal[]>
  /** avvia una domanda; i token arrivano su onAskChunk */
  ask(question: string): Promise<{ requestId: string }>
  onAskChunk(cb: (chunk: AskChunk) => void): () => void
  getActivity(): Promise<ActivityDay[]>
  getTransparency(): Promise<TransparencyInfo>
  getSource(docId: string): Promise<Doc | null>
  getModelStatus(): Promise<ModelStatus>
  setApiKey(key: string): Promise<ModelStatus>
  hideWindow(): void
  /** il main segnala che la finestra è tornata in primo piano */
  onShown(cb: () => void): () => void
}

declare global {
  interface Window {
    myynd: MyyndApi
  }
}
