// Tipi e le poche costanti che sono davvero statiche (le opzioni delle
// preferenze). Il resto — feed, chat, mappa, connettori — arriva dal server,
// da quello che Myynd ha letto sul tuo materiale.

export type Screen = 'myynd' | 'chat' | 'auto' | 'mappa' | 'pref' | 'conn'

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

export const AUTONOMIE = [
  { id: 'osservare', titolo: 'Solo osservare', nota: 'Legge e indicizza. Risponde solo se le chiedi.' },
  { id: 'preparare', titolo: 'Preparare e aspettare', nota: 'Scrive bozze e brief, niente esce senza il tuo Invia.' },
  { id: 'agire', titolo: 'Agire sulla routine', nota: 'Archivia e risponde dove hai già confermato tre volte.' }
]

export const TONI = [
  { id: 'diretto', label: 'Diretto' },
  { id: 'cordiale', label: 'Cordiale' },
  { id: 'formale', label: 'Formale' }
]

export const ESEMPIO_TONO: Record<string, string> = {
  diretto: '"Ciao Marta, ti mando il preventivo aggiornato. Consegna quattro settimane dalla conferma."',
  cordiale: '"Ciao Marta, come promesso ti mando il preventivo aggiornato: spero sia tutto chiaro, fammi sapere."',
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
    ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
