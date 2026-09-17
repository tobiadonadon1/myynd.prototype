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

/** È il momento di chiudere: terza risposta, o un sì a quello che le è stato proposto. */
export function toccaConcludere(domanda: string, storico: Turno[]): boolean {
  const risposte = storico.filter(t => t.ruolo === 'u').length + 1
  return risposte >= RISPOSTE_MASSIME || (risposte >= 2 && accordoBreve(domanda))
}

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
    system: `Sei Myynd. Qui sotto c'è una conversazione fra te e la persona sul suo progetto «${p.nome}»${p.obiettivo ? ` (obiettivo registrato: ${p.obiettivo})` : ''}: le hai chiesto su cosa sta lavorando e qual è il prossimo risultato concreto. La conversazione è finita: scrivi il prossimo risultato concreto da inseguire, in una riga, con le sue parole quando possibile, e da uno a tre primi passi che può fare da subito, ognuno una riga che comincia con un verbo. Se lei ha detto di sì a un passo che tu avevi proposto, quello è il primo passo. Niente domande, niente inventato: solo quello che sta nella conversazione. Se non c'è niente di concreto, risultato vuoto e nessun passo. Scrivi in ${nellaLingua()}.`,
    messages: [{ role: 'user', content: trascrizione }]
  })
  const risultato = typeof out?.risultato === 'string' ? senzaTrattini(out.risultato.replace(/\s+/g, ' ').trim()).slice(0, 300) : ''
  if (risultato.length < 8) return null
  const passi = (Array.isArray(out?.passi) ? out!.passi : [])
    .map(x => typeof x === 'string' ? senzaTrattini(x.replace(/\s+/g, ' ').trim()).slice(0, 200) : '')
    .filter(x => x.length >= 6).slice(0, 3)
  recordNextResult(progettoId, risultato)
  for (const testo of passi) aggiungiCompito({ testo, quando: 'oggi', modo: 'io', progetto: progettoId })
  return { risultato, passi }
}
