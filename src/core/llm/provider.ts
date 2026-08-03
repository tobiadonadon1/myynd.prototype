/**
 * Il seam del motore linguistico. Qualunque cosa implementi `Provider`
 * funziona sotto engine/answer.ts ed engine/proposals.ts senza modifiche:
 * oggi è la CLI `claude` già autenticata sull'abbonamento dell'utente,
 * domani potrebbe essere qualunque altra cosa parli lo stesso contratto.
 */
import type { ModelStatus } from '@shared/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CompleteRequest {
  system: string
  messages: ChatMessage[]
  maxTokens?: number
  /**
   * Quando presente, chiede al provider di vincolare l'output a questo
   * schema json, se lo sa fare. Un provider che non lo supporta lo ignora:
   * il chiamante deve comunque essere in grado di interpretare del testo
   * libero come ripiego.
   */
  jsonSchema?: Record<string, unknown>
}

/**
 * Un evento dello streaming. 'reset' significa: il tentativo precedente è
 * morto a metà ed è stato ripetuto da capo — tutto il testo accumulato fin
 * qui va scartato, non solo quello che arriva dopo. Un processo `claude`
 * ucciso a metà risposta non deve mai lasciare la sua coda tagliata saldata
 * al tentativo che lo sostituisce.
 */
export type StreamEvent = { type: 'token'; text: string } | { type: 'reset' }

export interface Provider {
  name: string
  ready(): boolean
  /** stato leggibile: pronto o no, e perché */
  getStatus(): ModelStatus
  stream(req: CompleteRequest): AsyncIterable<StreamEvent>
  complete(req: CompleteRequest): Promise<string>
}
