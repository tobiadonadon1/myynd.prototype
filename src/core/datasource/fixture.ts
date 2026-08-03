/**
 * DataSource su file locali, secondo data/FORMATO.md:
 *   data/profilo.json      -> Profile
 *   data/mail/*.json       -> Thread
 *   data/documenti/*.md    -> Doc (frontmatter + corpo)
 *
 * Tollerante: un file malformato viene segnalato in console e ignorato, non
 * fa mai cadere l'app. Nessuna dipendenza YAML: il frontmatter è
 * `chiave: valore` semplice, parsato a mano.
 *
 * Questa è l'unica classe che sa che i dati vivono su disco. Sostituirla con
 * un'implementazione Gmail/Drive non richiede toccare nulla sopra
 * l'interfaccia DataSource.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { DataSource, Doc, DocKind, MailMessage, Person, Profile, Thread } from '@shared/types'

const VALID_KINDS: DocKind[] = ['mail', 'documento', 'listino', 'preventivo', 'trascrizione']

function log(message: string, err?: unknown): void {
  if (err !== undefined) {
    console.error(`[myynd/fixture] ${message}`, err)
  } else {
    console.error(`[myynd/fixture] ${message}`)
  }
}

/* ─────────────────────────── frontmatter markdown ──────────────────────── */

type FrontmatterValue = string | boolean

function parseFrontmatter(raw: string): { data: Record<string, FrontmatterValue>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, body: raw }
  const [, fm, body] = match
  const data: Record<string, FrontmatterValue> = {}
  for (const line of fm.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    if (value === 'true') data[key] = true
    else if (value === 'false') data[key] = false
    else data[key] = value
  }
  return { data, body: body.trim() }
}

function docFromMarkdown(fileName: string, raw: string): Doc | null {
  const { data, body } = parseFrontmatter(raw)
  const id = typeof data.id === 'string' ? data.id : undefined
  const title = typeof data.title === 'string' ? data.title : undefined
  const kindRaw = typeof data.kind === 'string' ? data.kind : undefined
  const date = typeof data.date === 'string' ? data.date : undefined

  if (!id || !title || !kindRaw || !date) return null
  if (!VALID_KINDS.includes(kindRaw as DocKind)) return null

  const doc: Doc = {
    id,
    title,
    kind: kindRaw as DocKind,
    path: `documenti/${fileName}`,
    date,
    body,
  }
  if (typeof data.superseded === 'boolean') doc.superseded = data.superseded
  if (typeof data.supersededBy === 'string') doc.supersededBy = data.supersededBy
  if (typeof data.supersededNote === 'string') doc.supersededNote = data.supersededNote
  return doc
}

/* ────────────────────────────── mail thread ─────────────────────────────── */

function normalizePerson(p: unknown): Person {
  const obj = (p && typeof p === 'object' ? (p as Record<string, unknown>) : {}) as Record<string, unknown>
  return {
    name: typeof obj.name === 'string' ? obj.name : '',
    email: typeof obj.email === 'string' ? obj.email : '',
    role: typeof obj.role === 'string' ? obj.role : undefined,
    org: typeof obj.org === 'string' ? obj.org : undefined,
  }
}

function threadFromJson(parsed: unknown, locator: string): Thread | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.id !== 'string' || !Array.isArray(obj.messages)) return null

  const subject = typeof obj.subject === 'string' ? obj.subject : ''
  const messages: MailMessage[] = []

  for (const raw of obj.messages) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as Record<string, unknown>
    if (typeof m.id !== 'string' || typeof m.body !== 'string') continue

    const attachments = Array.isArray(m.attachments)
      ? (m.attachments as unknown[])
          .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
          .map((a) => ({
            name: typeof a.name === 'string' ? a.name : '',
            path: typeof a.path === 'string' ? a.path : '',
          }))
      : undefined

    messages.push({
      // identità composta qui, dalla DataSource, e mai più smontata sopra:
      // l'id locale del messaggio ("m-1") non è unico da solo — ogni thread
      // del corpus riparte da m-1 — quindi da solo collide fra thread
      // diversi in ogni mappa chiave->messaggio (Chunk.docId, docsById,
      // SourceRef.docId). Comporlo con l'id del thread lo rende univoco
      // nell'intero corpus restando leggibile in trasparenza e nel registro.
      id: `${obj.id}/${m.id}`,
      threadId: obj.id,
      from: normalizePerson(m.from),
      to: Array.isArray(m.to) ? (m.to as unknown[]).map(normalizePerson) : [],
      cc: Array.isArray(m.cc) ? (m.cc as unknown[]).map(normalizePerson) : undefined,
      subject: typeof m.subject === 'string' ? m.subject : subject,
      date: typeof m.date === 'string' ? m.date : '',
      body: m.body,
      attachments,
      direction: m.direction === 'inviata' ? 'inviata' : 'ricevuta',
      unanswered: m.unanswered === true ? true : undefined,
      // locatore opaco deciso qui, dalla DataSource — mai fabbricato da uno
      // strato sopra (retrieval, engine…): oggi è il file sorgente più l'id
      // del messaggio, domani potrebbe essere un id Gmail.
      path: `${locator}#${m.id}`,
    })
  }

  if (messages.length === 0) return null
  return { id: obj.id, subject, messages, path: locator }
}

/* ──────────────────────────────── profilo ──────────────────────────────── */

function emptyProfile(): Profile {
  return {
    company: { name: '', legalName: '', description: '', city: '' },
    owner: { name: '', email: '' },
    colleagues: [],
    clients: [],
    suppliers: [],
  }
}

function normalizeProfile(parsed: unknown): Profile {
  if (!parsed || typeof parsed !== 'object') return emptyProfile()
  const obj = parsed as Record<string, unknown>
  const company = (obj.company && typeof obj.company === 'object' ? obj.company : {}) as Record<string, unknown>
  const owner = normalizePerson(obj.owner)

  const people = (value: unknown): Person[] =>
    Array.isArray(value) ? (value as unknown[]).map(normalizePerson) : []

  return {
    company: {
      name: typeof company.name === 'string' ? company.name : '',
      legalName: typeof company.legalName === 'string' ? company.legalName : '',
      description: typeof company.description === 'string' ? company.description : '',
      city: typeof company.city === 'string' ? company.city : '',
      site: typeof company.site === 'string' ? company.site : undefined,
    },
    owner,
    colleagues: people(obj.colleagues),
    clients: people(obj.clients),
    suppliers: people(obj.suppliers),
  }
}

/* ────────────────────────────── data source ─────────────────────────────── */

export class FixtureDataSource implements DataSource {
  id = 'fixture'
  label = 'file locali'

  /**
   * Cose che l'ultima scansione non è riuscita a leggere, in italiano
   * piano. Un file malformato non deve mai sparire senza una parola: la
   * pagina trasparenza le legge da qui invece che da un log in console che
   * l'utente non vedrà mai.
   */
  private issues: string[] = []

  constructor(private readonly dataDir: string) {}

  getIssues(): string[] {
    return [...this.issues]
  }

  private reportIssue(message: string, err?: unknown): void {
    this.issues.push(message)
    log(message, err)
  }

  async getProfile(): Promise<Profile> {
    const full = path.join(this.dataDir, 'profilo.json')
    try {
      const raw = await fs.readFile(full, 'utf-8')
      return normalizeProfile(JSON.parse(raw))
    } catch (err) {
      log('profilo.json mancante o non leggibile, uso un profilo vuoto', err)
      return emptyProfile()
    }
  }

  async listThreads(): Promise<Thread[]> {
    const dir = path.join(this.dataDir, 'mail')
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort()
    } catch {
      return []
    }

    const threads: Thread[] = []
    for (const file of files) {
      const full = path.join(dir, file)
      const locator = `mail/${file}`
      try {
        const raw = await fs.readFile(full, 'utf-8')
        const thread = threadFromJson(JSON.parse(raw), locator)
        if (!thread) {
          this.reportIssue(`la mail "${file}" non è stata letta: il file non è nel formato atteso.`)
          continue
        }
        threads.push(thread)
      } catch (err) {
        this.reportIssue(`la mail "${file}" non è stata letta: non si riesce ad aprirla.`, err)
      }
    }
    return threads
  }

  async listDocs(): Promise<Doc[]> {
    const dir = path.join(this.dataDir, 'documenti')
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).sort()
    } catch {
      return []
    }

    const docs: Doc[] = []
    for (const file of files) {
      const full = path.join(dir, file)
      const locator = `documenti/${file}`
      try {
        const raw = await fs.readFile(full, 'utf-8')
        const doc = docFromMarkdown(file, raw)
        if (!doc) {
          this.reportIssue(`il documento "${file}" non è stato letto: il file non è nel formato atteso.`)
          continue
        }
        docs.push(doc)
      } catch (err) {
        this.reportIssue(`il documento "${file}" non è stato letto: non si riesce ad aprirlo.`, err)
      }
    }
    return docs
  }

  /**
   * Un id può appartenere a un documento vero o a un messaggio mail (che qui
   * non ha un file proprio): in entrambi i casi lo si risolve con lo stesso
   * id composto che questa classe assegna altrove — mai un id locale nudo,
   * mai una ricostruzione fatta da chi chiama.
   */
  async readDoc(id: string): Promise<Doc | null> {
    const docs = await this.listDocs()
    const doc = docs.find((d) => d.id === id)
    if (doc) return doc

    const threads = await this.listThreads()
    for (const thread of threads) {
      const message = thread.messages.find((m) => m.id === id)
      if (message) {
        return {
          id: message.id,
          title: message.subject || thread.subject,
          kind: 'mail',
          path: message.path,
          date: message.date,
          body: message.body,
        }
      }
    }
    return null
  }
}
