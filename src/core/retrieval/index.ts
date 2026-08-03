/**
 * Costruisce l'indice di ricerca in memoria a partire da una DataSource:
 * chunking di documenti e mail, indice BM25, mappa docId -> Doc (anche per i
 * singoli messaggi mail, trattati come documenti citabili), conteggi reali e
 * hash del corpus per la cache delle proposte.
 */
import { createHash } from 'node:crypto'
import type { DataSource, Doc, Profile, Thread } from '@shared/types'
import { BM25Index, type SearchHit } from './bm25.js'
import { chunkDoc, chunkThread } from './chunk.js'

export type { SearchHit } from './bm25.js'
export type { Chunk } from './chunk.js'

export interface RetrievalCounts {
  threads: number
  messages: number
  docs: number
  chunks: number
}

export interface RetrievalIndex {
  readonly profile: Profile
  readonly threads: Thread[]
  readonly docs: Doc[]
  /** hash deterministico del corpus, usato per invalidare la cache delle proposte */
  readonly hash: string
  readonly counts: RetrievalCounts
  search(query: string, topK?: number): SearchHit[]
  /** un documento o un messaggio mail, per id — per il pannello sorgente */
  getDoc(docId: string): Doc | null
}

function computeCorpusHash(threads: Thread[], docs: Doc[], profile: Profile): string {
  const h = createHash('sha256')
  const sortedThreads = [...threads].sort((a, b) => a.id.localeCompare(b.id))
  for (const t of sortedThreads) {
    h.update(t.id)
    for (const m of t.messages) {
      h.update(m.id)
      h.update(m.date)
      h.update(m.body)
      h.update(String(m.unanswered))
    }
  }
  const sortedDocs = [...docs].sort((a, b) => a.id.localeCompare(b.id))
  for (const d of sortedDocs) {
    h.update(d.id)
    h.update(d.body)
    h.update(String(d.superseded))
    h.update(d.date ?? '')
  }
  h.update(JSON.stringify(profile))
  return h.digest('hex')
}

export async function buildIndex(dataSource: DataSource): Promise<RetrievalIndex> {
  const [profile, threads, docs] = await Promise.all([
    dataSource.getProfile(),
    dataSource.listThreads(),
    dataSource.listDocs(),
  ])

  const docsById = new Map<string, Doc>()
  const chunks = []

  for (const doc of docs) {
    docsById.set(doc.id, doc)
    chunks.push(...chunkDoc(doc))
  }

  let messageCount = 0
  for (const thread of threads) {
    messageCount += thread.messages.length
    for (const message of thread.messages) {
      docsById.set(message.id, {
        id: message.id,
        title: message.subject || thread.subject,
        kind: 'mail',
        path: message.path || thread.path,
        date: message.date,
        body: message.body,
      })
    }
    chunks.push(...chunkThread(thread))
  }

  const bm25 = new BM25Index()
  bm25.build(chunks)

  const hash = computeCorpusHash(threads, docs, profile)
  const counts: RetrievalCounts = {
    threads: threads.length,
    messages: messageCount,
    docs: docs.length,
    chunks: chunks.length,
  }

  return {
    profile,
    threads,
    docs,
    hash,
    counts,
    search(query: string, topK = 6) {
      // Il BM25 puro penalizza i chunk più lunghi a parità di termini
      // corrispondenti: un listino corrente più completo (più fasce di
      // sconto, più dettagli di consegna) può risultare più lungo di
      // quello superato e quindi — a punteggio grezzo — finire sotto,
      // anche quando la domanda riguarda esplicitamente il presente.
      // Si recupera un insieme più ampio e si applica una lieve
      // penalità ai chunk superati prima del taglio finale: non li
      // nasconde mai (con un solo riscontro pertinente, un documento
      // superato resta comunque in cima), ma a parità di rilevanza fa
      // vincere la fonte corrente — il confronto resta comunque
      // visibile al modello, che può nominare entrambi.
      const widened = bm25.search(query, Math.max(topK * 3, 15))
      const SUPERSEDED_PENALTY = 0.85
      return widened
        .map((hit) => ({
          ...hit,
          score: hit.chunk.superseded ? hit.score * SUPERSEDED_PENALTY : hit.score,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    },
    getDoc(docId: string) {
      return docsById.get(docId) ?? null
    },
  }
}
