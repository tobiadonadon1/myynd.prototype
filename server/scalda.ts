// Scaldare il modello di questo Mac quando la chat prende il fuoco (P10).
//
// Un modello su Ollama o LM Studio che dorme ci mette secondi a caricarsi, e
// quei secondi cadevano tutti sulla prima parola. Quando la casella della
// chat prende il fuoco (o si apre il richiamo) gli si manda la stessa
// richiesta compatta con cui parte una domanda, con un token solo: il modello
// si carica con la stessa finestra, e la domanda vera lo trova sveglio.
//
// Solo per un modello su questo Mac: un indirizzo in rete, la chiave di
// OpenAI, ChatGPT, la chiave o l'account di Claude, mai. Non passa da `chiedi`
// (che potrebbe cadere su un motore a pagamento), non guarda il tetto, non si
// scrive fra gli usi: è gratis, e resta qui. Una volta ogni cinque minuti per
// conto, e la domanda vera la ferma (`ferma`).

import * as chi from './chi.ts'
import * as mod from './modello.ts'
import * as compatibile from './compatibile.ts'
import * as claude from './claude.ts'
import { OSPITATO } from './ospitato.ts'

const CINQUE_MINUTI = 5 * 60_000
const ultimi = new Map<string, number>()
const inCorso = new Map<string, AbortController>()
let ospitato = OSPITATO

/** Un indirizzo su questo Mac: localhost, *.localhost, 127.x.x.x, ::1. Nient'altro. */
export function sulQuestoMac(url: string): boolean {
  let h: string
  try { h = new URL(url).hostname.toLowerCase() } catch { return false }
  h = h.replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '::1') return true
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
}

export type Esito = { avviato: boolean; perche?: 'ospitato' | 'motore' | 'lontano' | 'presto' }

/** Parte, se tocca: non aspetta la risposta. */
export function scalda(): Esito {
  const conto = chi.adesso() ?? ''
  if (ospitato) return { avviato: false, perche: 'ospitato' }
  if (mod.motore()?.tipo !== 'compatibile') return { avviato: false, perche: 'motore' }
  const f = mod.fornitore()
  if (!f || !sulQuestoMac(f.url)) return { avviato: false, perche: 'lontano' }
  const ultimo = ultimi.get(conto)
  if (ultimo !== undefined && Date.now() - ultimo < CINQUE_MINUTI) return { avviato: false, perche: 'presto' }
  ultimi.set(conto, Date.now())
  const controllo = new AbortController()
  inCorso.get(conto)?.abort()
  inCorso.set(conto, controllo)
  const base = claude.corpoRichiesta('', [], [], true, true, false)
  const richiesta = { ...base, messages: [{ role: 'user' as const, content: '.' }], max_tokens: 1 }
  delete (richiesta as { tools?: unknown }).tools
  const inizio = performance.now()
  void compatibile.crea(f, richiesta, mod.attesaDi('scalda'), controllo.signal)
    .then(() => console.log(`myynd · tempi · scaldato il modello in ${Math.round(performance.now() - inizio)} ms`))
    .catch(() => { /* scaldare è un regalo: se non riesce, la domanda farà come prima */ })
    .finally(() => { if (inCorso.get(conto) === controllo) inCorso.delete(conto) })
  return { avviato: true }
}

/** La domanda vera è arrivata: lo scaldare di questo conto si ferma. */
export function ferma(): void {
  const conto = chi.adesso() ?? ''
  inCorso.get(conto)?.abort()
  inCorso.delete(conto)
}

export function perProva(o: { ospitato?: boolean } = {}): void {
  for (const c of inCorso.values()) c.abort()
  inCorso.clear(); ultimi.clear()
  ospitato = o.ospitato ?? OSPITATO
}
