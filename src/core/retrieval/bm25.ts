/**
 * BM25 (k1≈1.2, b≈0.75) su un indice in memoria. Deterministico: a parità di
 * punteggio l'ordine originale dei chunk è preservato (Array.sort è stabile).
 */
import type { Chunk } from './chunk.js'
import { tokenize } from './tokenize.js'

export interface SearchHit {
  chunk: Chunk
  score: number
}

interface Posting {
  chunkIndex: number
  freq: number
}

const K1 = 1.2
const B = 0.75

export class BM25Index {
  private chunks: Chunk[] = []
  private lengths: number[] = []
  private avgLength = 0
  private postings = new Map<string, Posting[]>()

  build(chunks: Chunk[]): void {
    this.chunks = chunks
    this.lengths = new Array(chunks.length).fill(0)
    this.postings = new Map()

    let totalLength = 0
    chunks.forEach((chunk, idx) => {
      const tokens = tokenize(`${chunk.title} ${chunk.text}`)
      this.lengths[idx] = tokens.length
      totalLength += tokens.length

      const freq = new Map<string, number>()
      for (const tok of tokens) freq.set(tok, (freq.get(tok) ?? 0) + 1)
      for (const [term, f] of freq) {
        let list = this.postings.get(term)
        if (!list) {
          list = []
          this.postings.set(term, list)
        }
        list.push({ chunkIndex: idx, freq: f })
      }
    })

    this.avgLength = chunks.length > 0 ? totalLength / chunks.length : 0
  }

  search(query: string, topK = 6): SearchHit[] {
    if (this.chunks.length === 0) return []
    const queryTerms = Array.from(new Set(tokenize(query)))
    if (queryTerms.length === 0) return []

    const N = this.chunks.length
    const scores = new Map<number, number>()

    for (const term of queryTerms) {
      const list = this.postings.get(term)
      if (!list || list.length === 0) continue
      const df = list.length
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1)
      for (const { chunkIndex, freq } of list) {
        const len = this.lengths[chunkIndex] || 0
        const denom = freq + K1 * (1 - B + (B * len) / (this.avgLength || 1))
        const score = idf * ((freq * (K1 + 1)) / denom)
        scores.set(chunkIndex, (scores.get(chunkIndex) ?? 0) + score)
      }
    }

    return Array.from(scores.entries())
      .map(([idx, score]) => ({ chunk: this.chunks[idx], score }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }
}
