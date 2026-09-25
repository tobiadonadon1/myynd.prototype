// Una domanda secca: quando, chi, dove. Niente da scrivere, niente da giudicare (P10).
//
// «Short factual chat questions may use low effort; everything else keeps
// today's effort.» Qui si decide, senza modello e sempre allo stesso modo,
// quale domanda è secca. Nel dubbio no: una risposta pensata di più costa un
// secondo, una risposta sbagliata costa la fiducia.
//
// Non si usa `CONSEGNABILE`: dentro ci sono nomi come «call» e «invoice», che
// stanno proprio nelle domande di fatto («When is the call?»).

export type Contesto = { progettoInChat: boolean; compito: boolean; revisione: boolean; progettiNominati: number; chiusura: boolean }

export const PAROLE_MAX = 14

const APERTURA = /^(?:(?:e|and)\s+)?(?:quando|chi|dove|quanto|quanti|quante|quale|quali|a che ora|che giorno|che ora|di chi|con chi|when|who|whom|whose|where|which|how many|how much|what time|what day|what date)\b/i
const PRODURRE = /\b(scriv\w*|prepar\w*|bozz\w*|rispond\w*\s+a|riassum\w*|pianific\w*|redig\w*|traduc\w*|mand[ao]\w*|invi[ao]\w*|write|draft|reply|respond|summari[sz]e|plan|prepare|translate|send|compose)\b/i
const GIUDICARE = /\b(dovrei|conviene|vale la pena|cosa ne pensi|meglio|consigli\w*|should|worth|what do you think|better|recommend\w*|would you)\b/i

/** Vero solo se tutte le condizioni tengono. */
export function domandaSecca(testo: string, c: Contesto): boolean {
  if (c.progettoInChat || c.compito || c.revisione || c.chiusura || c.progettiNominati !== 0) return false
  const t = String(testo ?? '').trim()
  const parole = t.split(/\s+/).filter(Boolean)
  if (parole.length < 2 || parole.length > PAROLE_MAX) return false
  // una frase sola: tolto l'ultimo carattere, niente punto, domanda, esclamazione, punto e virgola o a capo seguito da altro
  if (/[.?!;\n]\s*\S/.test(t.slice(0, -1))) return false
  if (!APERTURA.test(t)) return false
  if (PRODURRE.test(t)) return false
  if (GIUDICARE.test(t)) return false
  return true
}
