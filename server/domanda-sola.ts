// Chiedere o presumere: la decisione, scritta nel codice.
//
// Le sue parole del 24 settembre: «One question at most... The whole point is
// that there is no friction.» Di regola nessuna domanda; una sola, e solo
// quando mancano insieme due cose: un dato duro che nessuna fonte contiene, e
// un errore che costerebbe. Altrimenti si fa il lavoro e si scrive l'ipotesi
// in una riga sola.
//
// Un modello piccolo non deve poter convincersi di presumere un indirizzo o
// un prezzo. Perciò il pavimento è deterministico: cinque espressioni che
// riconoscono i generi duri dalla domanda stessa, prima di qualunque
// etichetta. L'etichetta del modello (`presumere`, in `claude.ts`) può solo
// far chiedere, mai far presumere una cosa che il pavimento ha detto dura.
// E chi lavora nel fondo (le iniziative, le automazioni) non chiede mai.
//
// Puro: importa solo la cornice, e si prova con una tabella in un secondo.

import { SE_NON_RISPONDI } from './cornice.ts'

export type Genere = 'destinatario' | 'cifra' | 'identita' | 'file' | 'impegno' | 'data' | 'preferenza' | 'collegamento' | 'permesso' | 'altro'
export type Mossa = 'produci' | 'presumi' | 'segnaposto' | 'chiedi' | 'blocco' | 'guaio'
export type Tipo = 'risposta' | 'preventivo' | 'riassunto' | 'documento' | 'proposta-incontro' | 'codice' | 'prompt'

/** I generi che non si presumono mai: un errore lì finisce in una mail sbagliata o in un prezzo sbagliato. */
export const DURI: readonly Genere[] = ['destinatario', 'cifra', 'identita', 'file', 'impegno']

/** Il pavimento: la domanda stessa dice di che genere è il dato che manca. */
export const PAVIMENTO: readonly { genere: Genere; forma: RegExp }[] = [
  { genere: 'destinatario', forma: /@|\b(indirizzo|address|e-?mail (?:di|of)|a chi (?:la )?mand\w*|who should (?:i|it) (?:send|go)|to whom)\b/i },
  { genere: 'cifra', forma: /[€$£]|\b(prezzo|price|costo|cost|quanto costa|how much|importo|amount|tariff\w*|fee|budget|sconto|discount|iva|vat)\b|\d+\s?(?:euro|eur|usd)/i },
  { genere: 'identita', forma: /\b(quale dei due|quale delle due|which of the two|which one do you mean|which \w+ do you mean|quale \w+ intendi|chi dei due)\b/i },
  { genere: 'file', forma: /\b(file|allegat\w*|attachment|contratto|contract|pdf)\b.*\b(non (?:c'è|c’è|trovo|esiste)|not (?:there|found)|can['’]?t find|missing|manca)(?!\p{L})/iu },
  { genere: 'impegno', forma: /\b(data (?:della |dell')?(?:firma|consegna promessa|impegno)|signing date|scadenza (?:contrattuale|concordata)|agreed deadline|when did (?:you|we) (?:promise|agree))\b/i }
]

export function duroDalTesto(domanda: string): Genere | null {
  const t = (domanda ?? '').trim()
  if (!t) return null
  for (const { genere, forma } of PAVIMENTO) if (forma.test(t)) return genere
  return null
}

/** La forma di chi si ferma perché gli manca una fonte: la stessa che legge `chiedeAiuto`. */
const BLOCCATO = /^(?:I (?:need|cannot|can't|can’t|don['’]t have)|I['’]m (?:missing|unable)|Mi (?:manca|mancano|serve|servono)|Non (?:posso|ho accesso|riesco)|Collega(?:mi)?\b)/i
const POSTA = /\b(?:mail|e-?mail|posta|casella|inbox|mailbox|gmail|outlook|thread|filo)\b/i
const FILE = /\b(?:file|files|folder|folders|cartell[ae]|disk|disco|desktop|scrivania|documents|documenti|drive|dropbox|sharepoint)\b/i
const PERMESSO = /\b(?:permess\w*|permission\w*|autorizz\w*|authori[sz]\w*|full disk|accessibility|accessibilità)\b/i
/** Le parole che dicono «è una fonte che manca», e non un dato: senza, «I need the price» sarebbe un blocco. */
const COLLEGAMENTO = /\b(?:connect\w*|colleg\w*|linked|link|not (?:available|connected|set up)|non (?:è|e') (?:collegat|disponibil)|unavailable|access|accesso|permission|permess\w*|full disk|read (?:your|the) (?:mail|inbox|files?|folder|calendar)|leggere (?:la|le|i|il) (?:posta|mail|file|cartell|calendario))\b/i

/**
 * Un blocco, non una domanda: gli manca una fonte o un permesso, e nessuna
 * risposta sua lo sblocca. Torna il genere del blocco, o null se il testo è
 * una richiesta di un dato (o non è una richiesta affatto).
 */
export function bloccoDalTesto(testo: string): 'posta' | 'file' | 'fonte' | 'permesso' | null {
  const pulito = (testo ?? '').trim()
  if (!pulito || pulito.length > 700) return null
  const prima = pulito.split(/\n\s*\n/)[0]
  if (!BLOCCATO.test(prima)) return null
  const apertura = /^(?:Collega|Non ho accesso|I cannot access|I can['’]t access|I don['’]t have access)/i.test(prima)
  if (!apertura && !COLLEGAMENTO.test(prima)) return null
  if (PERMESSO.test(prima) && !/\b(?:connect|colleg)/i.test(prima)) return 'permesso'
  if (POSTA.test(prima)) return 'posta'
  if (FILE.test(prima)) return 'file'
  if (PERMESSO.test(prima)) return 'permesso'
  return 'fonte'
}

/** La strada che chi svolge ha proposto sotto la domanda («Se non rispondi: venerdì»), senza la premessa. */
export function ipotesiDaDomanda(testo: string): string | null {
  for (const riga of (testo ?? '').split('\n').map(r => r.trim())) {
    if (!SE_NON_RISPONDI.test(riga)) continue
    const resto = riga.replace(SE_NON_RISPONDI, '').replace(/[.\s]+$/, '').trim()
    return resto || null
  }
  return null
}

/**
 * La decisione, nell'ordine:
 *   1. non chiede: si consegna;
 *   2. una fonte o un permesso che mancano: un blocco, non una domanda;
 *   3. duro se il pavimento lo dice, se l'etichetta manca (fallire è duro),
 *      se l'etichetta è un genere duro, o se sbagliare costa;
 *   4. al secondo giro chiede (se può) o si arrende;
 *   5. duro: chiede, se è lavoro suo e non ha ancora chiesto; altrimenti un segnaposto;
 *   6. tutto il resto: presume.
 * `peso === undefined` vuol dire «non chiesto», e succede solo quando il
 * pavimento ha già deciso.
 */
export function decidi(
  m: { chiede: boolean; blocco: boolean; duro: Genere | null; peso: { genere: Genere; costo: 'alto' | 'basso' } | null | undefined },
  s: { nativa: boolean; domandeFatte: number; secondoGiro: boolean }
): Mossa {
  if (!m.chiede) return 'produci'
  if (m.blocco || m.peso?.genere === 'collegamento' || m.peso?.genere === 'permesso') return 'blocco'
  const hard = m.duro !== null || m.peso === null || (!!m.peso && (DURI.includes(m.peso.genere) || m.peso.costo === 'alto'))
  const puoChiedere = s.nativa && s.domandeFatte === 0
  if (s.secondoGiro) return puoChiedere ? 'chiedi' : 'guaio'
  if (hard) return puoChiedere ? 'chiedi' : 'segnaposto'
  return 'presumi'
}

/** Minuscole, senza accenti, senza punteggiatura, spazi compressi. */
function normale(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Le opzioni che compaiono davvero nel materiale: le altre sono inventate. */
export function opzioniDalMateriale(opzioni: string[], materiale: string): string[] {
  const m = ` ${normale(materiale ?? '')} `
  return opzioni.filter(o => {
    const n = normale(o)
    return !!n && m.includes(` ${n} `)
  })
}

/** Un compito che è scrivere a qualcuno: lo stesso sguardo di `compiti.ts`. */
const MESSAGGIO = /\b(?:mail|e-?mail|reply|repl\w*|respond\w*|answer\w*|send|sending|forward|message|messages|write\s+(?:back\s+)?to\b|rispond\w*|risposta|mand\w*|invi\w*|inoltr\w*|messagg\w*|scriv\w*\s+(?:a|al|alla|allo|ai|agli|alle)\b)/i
const PREVENTIVO = /preventiv|quote|offert|prezz|price|listino/i
const INCONTRO = /incontr|meeting|call\b|riunion|appuntament|slot|chiamata/i
const RIASSUNTO = /riassum|summar|sintesi|recap/i

/**
 * Di che tipo è il lavoro, con un vocabolario chiuso: lo legge P1B dalle
 * misure, quindi qui non si aggiungono parole senza dirlo.
 */
export function tipoDiLavoro(o: { testo: string; modo: string; consegna?: { app: string } | null; email?: unknown; codice: boolean }): Tipo {
  if (o.modo === 'prompt') return 'prompt'
  if (o.codice) return 'codice'
  if (o.consegna) return 'documento'
  const t = o.testo ?? ''
  if (o.email || MESSAGGIO.test(t)) {
    if (PREVENTIVO.test(t)) return 'preventivo'
    if (INCONTRO.test(t)) return 'proposta-incontro'
    return 'risposta'
  }
  if (RIASSUNTO.test(t)) return 'riassunto'
  return 'documento'
}

/** Le quattro frasi di un blocco: fisse, così una riga salvata si traduce sempre. */
export const BLOCCHI: Record<'posta' | 'file' | 'fonte' | 'permesso', string> = {
  posta: 'Collega la posta e la riprendo da qui.',
  file: 'Collega i file del Mac e la riprendo da qui.',
  fonte: 'Collega la fonte che serve e la riprendo da qui.',
  permesso: 'Dai a Myynd il permesso che serve e la riprendo da qui.'
}

/** Quando anche il secondo giro si ferma: la riga torna sua, con questo accanto. */
export const MANCA_UN_DATO = 'Non sono riuscito a finirla senza un dato che manca.'

/** Una frase di blocco, riconosciuta: serve a chi riprende le righe ferme. */
export function generaBlocco(guaio: string | null | undefined): 'posta' | 'file' | 'fonte' | 'permesso' | null {
  for (const k of ['posta', 'file', 'fonte', 'permesso'] as const) if (BLOCCHI[k] === guaio) return k
  return null
}
