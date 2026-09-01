// Tipi e le poche costanti che sono davvero statiche (le opzioni delle
// preferenze). Il resto — feed, chat, mappa, connettori — arriva dal server,
// da quello che Myynd ha letto sul tuo materiale.

import { loc } from './lingua'

export type Screen = 'myynd' | 'oggi' | 'chat' | 'auto' | 'mappa' | 'pref' | 'conn' | 'memoria'

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
  { id: 'fare', titolo: 'Fino all’ultimo passo', nota: 'Prepara tutto fino in fondo. L’ultimo passo, premere invio, resta tuo.' }
]

/** I modelli fra cui scegliere. Rispecchia MODELLI in server/config.ts. */
export const MODELLI = [
  { id: 'claude-haiku-4-5', nome: 'Haiku 4.5', nota: 'Il più rapido e il più economico. Basta finché le domande sono semplici.' },
  { id: 'claude-sonnet-5', nome: 'Sonnet 5', nota: 'Il predefinito. Quasi la qualità di Opus sul tuo materiale, a meno della metà.' },
  { id: 'claude-opus-5', nome: 'Opus 5', nota: 'Il più capace. Si sente sulle domande che intrecciano più documenti; costa cinque volte tanto.' }
]

export const LINGUE = [
  { id: 'it', nome: 'Italiano' },
  { id: 'en', nome: 'English' }
]

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
