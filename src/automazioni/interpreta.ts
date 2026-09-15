// La frase letta prima del modello.
//
// Chi descrive un'automazione dice quasi sempre due cose che non hanno bisogno
// di un modello per essere capite: quando («ogni lunedì mattina», «when an
// invoice arrives») e dove guardare («la posta», «Notion»). Leggerle subito,
// mentre scrive, vuol dire vedere i binari riempirsi sotto le dita — e non
// dipendere da un motore collegato per cominciare. Il modello, dopo, fa il
// resto: il nome, l'istruzione, le parole con cui cercare.
//
// È volutamente povera: due lingue, poche forme, e in dubbio non tocca niente.
// Un'ora sbagliata scritta al posto di quella detta sarebbe peggio di nessuna.

import type { Attrezzo, RicettaComposta } from '../api'

type Quando = RicettaComposta['quando']

// i confini di parola di JavaScript non conoscono le accentate: «lunedì » per
// \b non ha un confine dopo la ì. Quindi i confini si scrivono a mano, con \p{L}.
const parola = (s: string) => new RegExp(`(?<![\\p{L}])(?:${s})(?![\\p{L}])`, 'iu')
const GIORNI: [RegExp, number][] = [
  [parola('luned[iì]|monday|mondays'), 1],
  [parola('marted[iì]|tuesday|tuesdays'), 2],
  [parola('mercoled[iì]|wednesday|wednesdays'), 3],
  [parola('gioved[iì]|thursday|thursdays'), 4],
  [parola('venerd[iì]|friday|fridays'), 5],
  [parola('sabato|saturday|saturdays'), 6],
  [parola('domenica|sunday|sundays'), 0]
]

/** «alle 9», «at 9», «at 4pm», «alle 16:30» → l'ora intera. Niente = non detta. */
function ora(frase: string): number | null {
  const m = frase.match(/\b(?:alle|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  if (m) {
    let h = Number(m[1])
    if (m[3]?.toLowerCase() === 'pm' && h < 12) h += 12
    if (m[3]?.toLowerCase() === 'am' && h === 12) h = 0
    return h >= 0 && h <= 23 ? h : null
  }
  if (/\b(?:mattina|morning)\b/i.test(frase)) return 8
  if (/\b(?:pomeriggio|afternoon)\b/i.test(frase)) return 15
  if (/\b(?:sera|evening|tonight)\b/i.test(frase)) return 18
  return null
}

/** Quando parte, se la frase lo dice. */
export function quandoDetto(frase: string): Quando | null {
  if (/\b(?:quando|appena|ogni volta che|when(?:ever)?|as soon as|each time)\b.{0,40}\b(?:arriv|ricev|comes? in|lands?|shows? up|receive|get)/i.test(frase)) {
    return { quandoArriva: true }
  }
  const h = ora(frase)
  const giorno = GIORNI.find(([re]) => re.test(frase))
  if (giorno && /\b(?:ogni|every|on|each|tutti i|all)\b/i.test(frase)) return { ogni: 'settimana', giorno: giorno[1], ora: h ?? 8 }
  if (/\b(?:ogni (?:giorno|mattina|sera|pomeriggio)|every (?:day|morning|evening|afternoon)|daily|tutti i giorni|ogni sera)\b/i.test(frase)) {
    return { ogni: 'giorno', ora: h ?? 8 }
  }
  if (/\b(?:ogni settimana|every week|weekly|una volta a settimana|once a week)\b/i.test(frase)) return { ogni: 'settimana', giorno: 1, ora: h ?? 8 }
  return null
}

/** I nomi con cui la gente chiama le fonti, oltre all'etichetta del catalogo. */
const SINONIMI: Record<string, RegExp> = {
  'posta.leggi': /\b(?:posta|e-?mails?|mail|inbox|casella|mailbox|messaggi di posta)\b/i,
  'agenda.leggi': /\b(?:agenda|calendar(?:io)?|meetings?|riunioni|appuntamenti)\b/i,
  'desktop.leggi': /\b(?:desktop|mac|pc|files?|cartell[ae]|folders?|documenti|documents|download)\b/i,
  'notion.leggi': /\bnotion\b/i,
  'slack.leggi': /\bslack\b/i,
  'drive.leggi': /\b(?:google )?drive\b/i,
  'dropbox.leggi': /\bdropbox\b/i,
  'sharepoint.leggi': /\bsharepoint\b/i,
  'whatsapp.leggi': /\bwhatsapp\b/i,
  'github.leggi': /\b(?:github|repo(?:sitor(?:y|ies|io|i))?|pull requests?|issues?)\b/i,
  'note.leggi': /\b(?:note di apple|apple notes|le note|notes|le mie note)\b/i,
  'granola.leggi': /\b(?:granola)\b/i,
  'conversazioni.leggi': /\b(?:conversazioni|conversations|chat export)\b/i,
  'chat.leggi': /\b(?:le chat|chats|chat con myynd)\b/i,
  'claude.lavora': /\bclaude code\b/i
}

/** Le fonti nominate, fra quelle che il catalogo conosce. */
export function fontiDette(frase: string, catalogo: Pick<Attrezzo, 'nome' | 'etichetta'>[]): string[] {
  const trovate: string[] = []
  for (const a of catalogo) {
    const eti = a.etichetta.trim()
    const perNome = eti.length >= 3 && new RegExp(`(?:^|[^\\p{L}])${eti.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}])`, 'iu').test(frase)
    if (perNome || SINONIMI[a.nome]?.test(frase)) trovate.push(a.nome)
  }
  return trovate
}

export function interpreta(frase: string, catalogo: Pick<Attrezzo, 'nome' | 'etichetta'>[]): { quando: Quando | null; attrezzi: string[] } {
  return { quando: quandoDetto(frase), attrezzi: fontiDette(frase, catalogo) }
}
