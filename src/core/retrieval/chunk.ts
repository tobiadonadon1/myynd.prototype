/**
 * Suddivide documenti e thread mail in passaggi da circa 400-700 caratteri,
 * su confini naturali: paragrafi per i documenti, messaggi per la mail.
 * Ogni chunk porta con sé docId, title, kind, path, date e lo stato
 * "superato" del documento di origine.
 */
import type { Doc, DocKind, Thread } from '@shared/types'

export interface Chunk {
  /** identificatore univoco del chunk */
  id: string
  /** id del documento o del messaggio di origine */
  docId: string
  title: string
  kind: DocKind
  /** percorso relativo dentro data/ */
  path: string
  date?: string
  /** vero se il documento di origine è superato — mai nascosto, sempre portato nel chunk */
  superseded?: boolean
  supersededNote?: string
  text: string
}

const MIN_CHARS = 400
const MAX_CHARS = 700
const HARD_MAX = 900

// Nessun chunk citabile può essere una domanda nuda o un frammento senza
// sostanza (es. la battuta dell'intervistatore in una trascrizione, o un
// separatore "---" isolato tra due paragrafi). Sotto questa soglia di
// caratteri, o quando il paragrafo è manifestamente solo una domanda, viene
// fuso col vicino prima di essere impacchettato in chunk — mai lasciato solo.
const MIN_SUBSTANTIVE_CHARS = 120
const QUESTION_MAX_CHARS = 280

function isBareQuestion(paragraph: string): boolean {
  const trimmed = paragraph.trim()
  return trimmed.length > 0 && trimmed.length <= QUESTION_MAX_CHARS && trimmed.endsWith('?')
}

function isSubstantive(paragraph: string): boolean {
  const trimmed = paragraph.trim()
  return trimmed.length >= MIN_SUBSTANTIVE_CHARS && !isBareQuestion(paragraph)
}

/**
 * Fonde ogni paragrafo troppo corto o che è solo una domanda nel vicino
 * successivo (es. la domanda dell'intervistatore si fonde con la risposta
 * che segue), così che nessun paragrafo resti da solo privo di sostanza.
 * Se l'ultimo paragrafo della lista resta comunque sotto soglia (non ha un
 * successivo con cui fondersi), si fonde all'indietro nel precedente.
 */
function mergeShortParagraphs(paragraphs: string[]): string[] {
  if (paragraphs.length <= 1) return paragraphs
  const merged: string[] = []
  let i = 0
  while (i < paragraphs.length) {
    let current = paragraphs[i]
    i += 1
    while (!isSubstantive(current) && i < paragraphs.length) {
      current = `${current}\n\n${paragraphs[i]}`
      i += 1
    }
    merged.push(current)
  }
  if (merged.length > 1 && !isSubstantive(merged[merged.length - 1])) {
    const last = merged.pop() as string
    merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${last}`
  }
  return merged
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : [text]
}

function hardSlice(text: string, max: number): string[] {
  const pieces: string[] = []
  let rest = text
  while (rest.length > max) {
    pieces.push(rest.slice(0, max).trim())
    rest = rest.slice(max)
  }
  if (rest.trim()) pieces.push(rest.trim())
  return pieces
}

/** Impacchetta paragrafi in passaggi di lunghezza ~MIN_CHARS-MAX_CHARS, rispettando i confini naturali. */
function packParagraphs(paragraphs: string[]): string[] {
  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }

  for (const para of paragraphs) {
    if (para.length > HARD_MAX) {
      flush()
      for (const sentence of splitSentences(para)) {
        if (sentence.length > HARD_MAX) {
          flush()
          for (const piece of hardSlice(sentence, MAX_CHARS)) chunks.push(piece)
          continue
        }
        if (current && current.length + sentence.length + 1 > MAX_CHARS) flush()
        current = current ? `${current} ${sentence}` : sentence
        if (current.length >= MAX_CHARS) flush()
      }
      continue
    }

    if (current && current.length + para.length + 2 > MAX_CHARS && current.length >= MIN_CHARS) {
      flush()
    }
    current = current ? `${current}\n\n${para}` : para
    if (current.length >= MAX_CHARS) flush()
  }
  flush()
  return chunks
}

function packBody(body: string): string[] {
  const paragraphs = mergeShortParagraphs(splitParagraphs(body))
  if (paragraphs.length > 0) return packParagraphs(paragraphs)
  const trimmed = body.trim()
  return trimmed ? [trimmed] : []
}

export function chunkDoc(doc: Doc): Chunk[] {
  return packBody(doc.body).map((text, i) => ({
    id: `${doc.id}#${i}`,
    docId: doc.id,
    title: doc.title,
    kind: doc.kind,
    path: doc.path,
    date: doc.date,
    superseded: doc.superseded,
    supersededNote: doc.supersededNote,
    text,
  }))
}

export function chunkThread(thread: Thread): Chunk[] {
  const chunks: Chunk[] = []
  for (const message of thread.messages) {
    const pieces = packBody(message.body)
    pieces.forEach((text, i) => {
      chunks.push({
        id: `${message.id}#${i}`,
        docId: message.id,
        title: message.subject || thread.subject,
        kind: 'mail',
        path: message.path || thread.path,
        date: message.date,
        text,
      })
    })
  }
  return chunks
}
