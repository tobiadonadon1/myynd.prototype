import type Anthropic from '@anthropic-ai/sdk'

/** Only the user's delegated task selects an app. Source text cannot grant writes. */
export function appDocumento(testo: string, modo: string): 'Pages' | 'TextEdit' | 'Word' | null {
  if (modo === 'prompt') return null
  if (!/\b(write|draft|create|produce|prepare|make|compose|scrivi|scrivere|redigi|crea|creare|prepara|preparare|componi)\b/i.test(testo)) return null
  if (/\b(?:in|using|with|on|su|con|usando)\s+(?:microsoft\s+)?word\b|\bmicrosoft\s+word\b/i.test(testo)) return 'Word'
  if (/\btextedit\b/i.test(testo)) return 'TextEdit'
  if (/\b(?:in|using|with|on|su|con|usando)\s+(?:apple\s+)?pages\b|\bapple\s+pages\b/i.test(testo)) return 'Pages'
  // A writing deliverable has a useful default; questions about existing essays do not.
  if (/\b(essay|saggio|tesina)\b/i.test(testo)) return 'Pages'
  return null
}

export const CREA_DOCUMENTO: Anthropic.Tool = {
  name: 'crea_documento_app',
  description: 'Create the finished document in the requested native app, save it as a new file and verify its body. Supply the complete deliverable, not a plan, progress report or placeholder. Never sends or publishes anything. Only the app selected by the user task is allowed.',
  input_schema: {
    type: 'object', properties: {
      app: { type: 'string', enum: ['Pages', 'TextEdit'] },
      titolo: { type: 'string', description: 'Document title' },
      testo: { type: 'string', description: 'Full finished document body, with paragraph breaks. No commentary about doing the task.' }
    }, required: ['app', 'titolo', 'testo'], additionalProperties: false
  }
}

export function validaDocumento(input: unknown, app: string) {
  if (!input || typeof input !== 'object') throw new Error('Missing document contents.')
  const v = input as Record<string, unknown>
  if (v.app !== app) throw new Error(`This task authorizes a document in ${app} only.`)
  if (typeof v.titolo !== 'string' || !v.titolo.trim() || typeof v.testo !== 'string' || !v.testo.trim()) throw new Error('A title and complete document are required.')
  return { app: app as 'Pages' | 'TextEdit', titolo: v.titolo, testo: v.testo }
}

/** Feedback appears first; its explicit length overrides the previous brief. */
export function pagineDocumento(testo: string): number {
  const words: Record<string,number> = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,una:1,uno:1,due:2,tre:3,quattro:4,cinque:5,sei:6,sette:7,otto:8,nove:9,dieci:10}
  const m=testo.toLowerCase().match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|una|uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)[ -]+(?:pages?|pagin[ae])\b/)
  return m ? words[m[1]] ?? Number(m[1]) : 0
}
