// Tipi e le poche costanti che sono davvero statiche (le opzioni delle
// preferenze). Il resto — feed, chat, mappa, connettori — arriva dal server,
// da quello che Myynd ha letto sul tuo materiale.

import { loc } from './lingua'

export type Screen = 'myynd' | 'oggi' | 'chat' | 'auto' | 'mappa' | 'pref' | 'conn' | 'memoria' | 'aiuto'

export type Campo = { k: string; v: string }
export type Fonte = { id: string; label: string }
export type Messaggio = { id: string; role: string; text: string; sources?: Fonte[] }
export type Thread = { id: string; titolo: string; quando: string }

export type VoceFeed = {
  id: string
  tipo: string
  titolo: string
  testo: string
  urgenza: string | null
  fonte: string | null
  doc: string | null
  stato: string
  quando: string
  /** Perché sta sul feed, e per quale obiettivo. Vuoto per le voci di prima. */
  perche?: string | null
  /** Per una priorità proposta da Myynd: cosa farebbe lui da solo, se gliela affidi. */
  offerta?: string | null
  /** Il progetto di cui è, se si sa: la prima pagina la mette nel suo blocco. */
  progetto?: string | null
  /** Verified document metadata, rather than a model-generated source label. */
  fonteTitolo?: string | null
  fonteQuando?: string | null
  fonteAutore?: string | null
}

export type Gruppo = { id: string; nome: string; colore: string; nodi: number }

/**
 * Gli `id` sono le chiavi che il server cerca in AUTONOMIE dentro claude.ts, e
 * devono combaciare alla lettera.
 *
 * Non è pignoleria: qui c'erano 'osservare' e 'agire', là 'chiedere' e 'fare'.
 * La ricerca falliva, tornava `undefined`, e `sistema()` saltava la riga in
 * silenzio — due scelte su tre non arrivavano mai al modello, e niente lo
 * diceva. Se un giorno vanno rinominate si rinominano in tutti e due i posti,
 * e `server/index.ts` rifiuta un valore che il server non conosce.
 */
export const AUTONOMIE = [
  { id: 'chiedere', titolo: 'Solo osservare', nota: 'Legge e indicizza. Prima di proporti qualcosa di operativo, chiede.' },
  { id: 'preparare', titolo: 'Preparare e aspettare', nota: 'Scrive bozze e brief, niente esce senza il tuo Invia.' },
  // l'apostrofo è quello dritto perché è quello della chiave nel dizionario:
  // con quello tipografico la ricerca falliva e il titolo restava in italiano
  { id: 'fare', titolo: "Fino all'ultimo passo", nota: 'Prepara tutto fino in fondo. L’ultimo passo, premere invio, resta tuo.' }
]

/** I modelli fra cui scegliere, dal più economico al più capace. Rispecchia MODELLI in server/config.ts. */
export const MODELLI = [
  { id: 'claude-haiku-4-5', nome: 'Haiku 4.5', nota: 'Il più rapido e il più economico. Basta finché le domande sono semplici.' },
  { id: 'claude-sonnet-5', nome: 'Sonnet 5', nota: 'Il predefinito. Quasi la qualità di Opus sul tuo materiale, a meno della metà.' },
  { id: 'claude-opus-5', nome: 'Opus 5', nota: 'Il più capace. Si sente sulle domande che intrecciano più documenti; costa cinque volte tanto.' }
]

/**
 * I tre livelli di lavoro, per scegliere un modello a ciascuno.
 *
 * Rispecchiano `LAVORI` in server/modello.ts, ma detti come li vede chi paga:
 * cosa ci finisce dentro, non come si chiama nella tabella. `id` è la chiave
 * che il server conosce.
 */
export const LIVELLI = [
  { id: 'casa', titolo: 'Lavoro di servizio', nota: 'Titoli, smistamento della posta, traduzioni, rassegna, ritratto.' },
  { id: 'media', titolo: 'Letture di ogni giorno', nota: 'Il feed, la cernita della posta, le domande che ti fa.' },
  { id: 'frontiera', titolo: 'Quello che leggi e firmi', nota: 'La chat, le bozze, le email, il punto, le ricette.' }
] as const

export const LINGUE = [
  { id: 'it', nome: 'Italiano' },
  { id: 'en', nome: 'English' }
]

/**
 * Chiaro, scuro, o come il sistema.
 *
 * «Sistema» sta per primo perche e la risposta giusta per quasi tutti: chi
 * mette il Mac in scuro la sera non deve dirlo due volte.
 */
export const TEMI = [
  { id: 'sistema', label: 'Sistema' },
  { id: 'chiaro', label: 'Chiaro' },
  { id: 'scuro', label: 'Scuro' }
] as const

/** Per quanto restano in pagina le cose già chiuse. */
export const TENUTE = [
  { ore: 24, label: 'Un giorno' },
  { ore: 48, label: 'Due giorni' },
  { ore: 168, label: 'Una settimana' },
  { ore: 0, label: 'Sempre' }
]

/** Come sopra: `id` è la chiave che cerca TONI in claude.ts. «caldo», non «cordiale». */
export const TONI = [
  { id: 'diretto', label: 'Diretto' },
  { id: 'caldo', label: 'Cordiale' },
  { id: 'formale', label: 'Formale' }
]

export const ESEMPIO_TONO: Record<string, string> = {
  diretto: '"Ciao Marta, ti mando il preventivo aggiornato. Consegna quattro settimane dalla conferma."',
  caldo: '"Ciao Marta, come promesso ti mando il preventivo aggiornato: spero sia tutto chiaro, fammi sapere."',
  formale: '"Gentile Dott.ssa Ferri, in allegato il preventivo aggiornato come da Sua richiesta. Resto a disposizione."'
}

export const WORDS = ['Niente', 'Una cosa', 'Due cose', 'Tre cose', 'Quattro cose', 'Cinque cose']

export function parole(n: number): string {
  return n < WORDS.length ? WORDS[n] : `${n} cose`
}

/** "3 ago · 14:32" da una data ISO. */
export function quando(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const oggi = new Date()
  const stessoGiorno = d.toDateString() === oggi.toDateString()
  return stessoGiorno
    ? d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' })
}

/*
 * Le cinque domande del ritratto, come si fanno a una persona.
 *
 * I blocchi hanno già una `descrizione`, ma è scritta **per il modello** —
 * «come questa persona prende una decisione» — e messa davanti a chi risponde
 * suona come se parlasse di qualcun altro. Stanno qui e non in una schermata
 * perché le schermate sono due, l'onboarding e la memoria, e devono chiedere
 * la stessa cosa con le stesse parole: se divergono, uno risponde a una
 * domanda e si rilegge un'altra.
 *
 * L'esempio non è decorazione: davanti a un riquadro vuoto la domanda vera è
 * «cosa ci scrivo?», e un esempio la toglie di mezzo meglio di una spiegazione.
 */
export const DOMANDE: Record<string, { domanda: string; esempio: string }> = {
  come_decido: { domanda: 'Come decidi?', esempio: 'es. guardo prima il margine, poi se il cliente paga puntuale' },
  cosa_controllo: { domanda: 'Cosa controlli sempre, prima di dire di sì?', esempio: 'es. che le date siano fattibili, e chi firma dall’altra parte' },
  come_scrivo: { domanda: 'Come scrivi?', esempio: 'es. corta, niente «gentilissimo», chiudo con «a presto»' },
  errori_da_evitare: { domanda: 'Quali errori non vuoi rivedere?', esempio: 'es. promettere consegne senza sentire la produzione' },
  chi_conta: { domanda: 'Chi conta, e come stai con loro?', esempio: 'es. Rossi è il cliente più grosso, ma tratta sempre sul prezzo' }
}
