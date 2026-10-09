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

import type { Attrezzo, Proponi, RicettaComposta } from '../api'

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
  // dal lunedì al venerdì: prima dei giorni, perché «dal lunedì» nomina un giorno
  if (/\b(?:giorn[io] (?:feriali|lavorativi|feriale|lavorativo)|nei feriali|weekdays?|working days?|every workday|monday (?:to|through) friday)\b|\bdal luned[iì] al venerd[iì](?![\p{L}])/iu.test(frase)) {
    return { ogni: 'feriali', ora: h ?? 8 }
  }
  /*
   * Un ritmo detto per esteso vince su un «mese» nominato di passaggio: «Ogni
   * lunedì: paga l'affitto mensile», «every Friday, what is due by the end of
   * the month», «abbonamenti da 20 euro al mese» sono settimanali, e leggerli
   * al mese era il guaio di «Fallo ogni settimana» su ogni carta che diceva
   * «mensile». Prima «ogni <giorno>» e «ogni giorno», attaccati; poi il mese.
   */
  const detto = GIORNI.find(([re]) => new RegExp(`(?<![\\p{L}])(?:ogni|every|each|tutti i|on)\\s+${re.source}`, 'iu').test(frase))
  if (detto) return { ogni: 'settimana', giorno: detto[1], ora: h ?? 8 }
  if (/\b(?:ogni (?:giorno|mattina|sera|pomeriggio)|every (?:day|morning|evening|afternoon)|daily|tutti i giorni)\b/i.test(frase)) {
    return { ogni: 'giorno', ora: h ?? 8 }
  }
  // una volta al mese: il giorno detto («il 15 di ogni mese», «on the 1st of the month»), o il primo.
  // «al mese» e «mensile» da soli no: sono quasi sempre un prezzo o un aggettivo.
  const giornoDelMese = frase.match(/\b(?:il|on the|the)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:di ogni mese|del mese|of (?:the|each|every) month)\b/i)
  if (giornoDelMese || /\b(?:ogni mese|una volta al mese|tutti i mesi|every month|monthly|once a month|each month|mensilmente)\b/i.test(frase)) {
    const g = giornoDelMese ?? frase.match(/\b(?:il|on the|the)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
    const giorno = g ? Number(g[1]) : 1
    return { ogni: 'mese', giorno: giorno >= 1 && giorno <= 31 ? giorno : 1, ora: h ?? 8 }
  }
  const giorno = GIORNI.find(([re]) => re.test(frase))
  if (giorno && /\b(?:ogni|every|on|each|tutti i|all)\b/i.test(frase)) return { ogni: 'settimana', giorno: giorno[1], ora: h ?? 8 }
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

/**
 * Cosa consegna, se la frase lo dice: le bozze nella casella, l'agenda, una
 * nota, un file. Niente = una riga in lista, come sempre. Mai «manda»: la
 * frase «mandagli la risposta» resta una riga con la bozza, e partire resta
 * un gesto suo.
 */
export function consegnaDetta(frase: string): Proponi | null {
  if (/\b(?:fra le bozze|nelle bozze|nella casella|(?:in|into|to) (?:my )?drafts?|as drafts?|draft repl(?:y|ies))\b/i.test(frase)) return 'posta.bozza'
  if (/\b(?:in agenda|nel calendario|in calendario|(?:to|on|in|into) (?:my )?calendar)\b/i.test(frase)) return 'agenda.aggiungi'
  // «in Note» da solo può voler dire da dove legge: serve che sia una nota da scrivere
  if (/\b(?:in una nota|come nota|una nota in note|scrivi una nota|as a note|into a note|a note in notes|write a note)\b/i.test(frase)) return 'nota.crea'
  if (/\b(?:in un file|come file|in un documento|as a file|into a file|as a document)\b|\b(?:salva\w*|metti\w*|save|put)\b[^.]{0,30}\b(?:sulla scrivania|on (?:my|the) desktop)\b/i.test(frase)) return 'file.crea'
  return null
}

export function interpreta(frase: string, catalogo: Pick<Attrezzo, 'nome' | 'etichetta'>[]): { quando: Quando | null; attrezzi: string[]; proponi: Proponi | null } {
  return { quando: quandoDetto(frase), attrezzi: fontiDette(frase, catalogo), proponi: consegnaDetta(frase) }
}
