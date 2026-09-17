// La fine di una chat su un progetto, decisa da noi e non dal modello.
//
// Lo strumento `concludi_progetto` c'era, e il modello con il ponte ChatGPT
// non lo chiamava mai: alla terza risposta — «yes», «Yes good.» — rilanciava
// con un'altra domanda, e la conversazione non finiva. «Gli ho dato tutte
// quelle risposte e sul feed non c'è niente.» Un'istruzione nel prompt è un
// consiglio; qui si chiude sul serio: alla terza risposta, o quando lei
// dice di sì a un passo proposto, si legge la conversazione con una chiamata
// a schema, si salva il risultato sul progetto e i passi vanno in lista.
// Poi il modello risponde sapendo cosa è stato salvato, e senza strumenti.

import { chiediJSON } from './modello.ts'
import { recordNextResult } from './project-memory.ts'
import * as progetti from './progetti.ts'
import { senzaTrattini } from './testo.ts'
import { nellaLingua } from './config.ts'

export type Turno = { ruolo: string; testo: string }
export type Chiusura = { risultato: string; passi: string[] }

/** Alla terza risposta si chiude, punto: contando anche questa. */
export const RISPOSTE_MASSIME = 3

/** «Sì», «ok», «va bene», «yes good»: ha detto di sì a quello che le è stato proposto. */
export function accordoBreve(s: string): boolean {
  const t = s.trim()
  return t.length <= 60 && !t.includes('?') &&
    /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|s[iì]|va bene|perfetto|good|great|sounds good|d'accordo|certo|esatto|fine|deal|let'?s (?:do it|go)|go(?: ahead)?|agreed|correct)\b/i.test(t)
}

/** Una domanda, o una carta incollata con «dimmi di più»: non è una risposta, e non si chiude sopra. */
export function nonEUnaRisposta(s: string): boolean {
  const t = s.trim()
  return t.includes('?') || /(?::\s*)?\b(?:tell me more|dimmi di più|what do you mean|cosa (?:vuol dire|intendi|significa)|spiega(?:mi)?|explain)\b/i.test(t)
}

/**
 * È il momento di chiudere: terza risposta, o un sì a quello che le è stato
 * proposto. Mai sopra una domanda: «Build Myynd's choose-project…: tell me
 * more» incollato da una carta non è la sua risposta, e chiudere lì ha messo
 * in memoria un titolo di carta come risultato e tre «definisci» in lista.
 */
export function toccaConcludere(domanda: string, storico: Turno[]): boolean {
  if (nonEUnaRisposta(domanda)) return false
  const risposte = storico.filter(t => t.ruolo === 'u').length + 1
  return risposte >= RISPOSTE_MASSIME || (risposte >= 2 && accordoBreve(domanda))
}

/**
 * Un passo che comincia con «definisci», «chiarisci», «decidi cosa» è una
 * domanda travestita: la rigira a lei. «Perché non ha contesto? È lui
 * stesso: dovrebbe fare un po' di ricerca prima di chiedermi queste cose.»
 * Un passo è una cosa che si fa; se serve capire, il passo è il lavoro che
 * lo fa capire.
 */
export const DOMANDA_TRAVESTITA = /^(?:define|clarify|decide|determine|identify|specify|figure out|establish|agree on|confirm|defini(?:sci|re)|chiari(?:sci|re)|decid(?:i|ere)|stabili(?:sci|re)|individua(?:re)?|specifica(?:re)?|concorda(?:re)?)\b/i

const FORMA = {
  type: 'object',
  properties: {
    risultato: { type: 'string', description: 'Il prossimo risultato concreto che la persona vuole raggiungere, in una riga, con le sue parole quando possibile. Vuoto se la conversazione non dice niente di concreto.' },
    passi: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'Da uno a tre primi passi concreti che può fare da subito, ognuno una riga che comincia con un verbo. Vuoto se il risultato è vuoto.' }
  },
  required: ['risultato', 'passi'],
  additionalProperties: false
}

type Ferri = { chiediJSON: typeof chiediJSON }
const VERI: Ferri = { chiediJSON: o => chiediJSON(o) }
let ferri: Ferri = VERI
/** Solo per le prove: sostituisce la chiamata al modello, o la rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/**
 * Legge la conversazione e chiude: il risultato sul progetto, i passi in
 * lista. Torna quello che ha salvato, o null se non c'era niente di
 * concreto da salvare (e allora la chat va avanti come prima).
 */
export async function concludiDaTrascrizione(
  progettoId: string, domanda: string, storico: Turno[],
  aggiungiCompito: (c: { testo: string; quando?: string; modo?: string; progetto?: string }) => { id: string }
): Promise<Chiusura | null> {
  const p = progetti.trova(progettoId)
  if (!p) return null
  const trascrizione = [...storico, { ruolo: 'u', testo: domanda }]
    .map(t => `${t.ruolo === 'u' ? 'Persona' : 'Myynd'}: ${t.testo.trim()}`).join('\n\n')
  const out = await ferri.chiediJSON<{ risultato?: unknown; passi?: unknown }>({
    lavoro: 'estrazione', max_tokens: 800, formato: FORMA,
    system: `Sei Myynd. Qui sotto c'è una conversazione fra te e la persona sul suo progetto «${p.nome}»${p.obiettivo ? ` (obiettivo registrato: ${p.obiettivo})` : ''}: le hai chiesto su cosa sta lavorando e qual è il prossimo risultato concreto. La conversazione è finita: scrivi il prossimo risultato concreto da inseguire, in una riga, con le SUE parole (quello che LEI ha detto di voler ottenere, non un titolo che hai proposto tu o che ha incollato da una carta), e da uno a tre primi passi che può fare da subito, ognuno una riga che comincia con un verbo. I passi sono cose che si fanno, con parole semplici e dirette: mai «definire», «chiarire», «decidere cosa», «stabilire i criteri», che sono domande rigirate a lei. Se per fare un passo serve capire qualcosa, il passo è il lavoro che lo fa capire, e lo fai tu («Preparo…», «Cerco…»). Se lei ha detto di sì a un passo che tu avevi proposto, quello è il primo passo. Niente domande, niente gergo, niente inventato: solo quello che sta nella conversazione. Se non c'è niente di concreto, risultato vuoto e nessun passo. Scrivi in ${nellaLingua()}.`,
    messages: [{ role: 'user', content: trascrizione }]
  })
  const risultato = typeof out?.risultato === 'string' ? senzaTrattini(out.risultato.replace(/\s+/g, ' ').trim()).slice(0, 300) : ''
  if (risultato.length < 8) return null
  const passi = (Array.isArray(out?.passi) ? out!.passi : [])
    .map(x => typeof x === 'string' ? senzaTrattini(x.replace(/\s+/g, ' ').trim()).slice(0, 200) : '')
    .filter(x => x.length >= 6 && !DOMANDA_TRAVESTITA.test(x)).slice(0, 3)
  recordNextResult(progettoId, risultato)
  for (const testo of passi) aggiungiCompito({ testo, quando: 'oggi', modo: 'io', progetto: progettoId })
  return { risultato, passi }
}
