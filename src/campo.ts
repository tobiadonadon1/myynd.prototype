// Il contratto di un campo, senza disegno: quali tasti fanno cosa, e come si
// salva. Sta qui, senza JSX e senza CSS, perché si prova sotto node.
//
// Le regole sono quelle che valgono per ogni campo dell'app (P5): Invio va
// avanti o salva, ⌘Invio salva un testo lungo, Esc rimette com'era un campo
// sporco e altrimenti lascia passare il tasto (una scheda si chiude). Salvare
// è ottimista: la spunta si vede prima della risposta del server, e se il
// server dice di no torna il valore salvato ma resta quello che hai scritto.

export type Tasto = { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; isComposing?: boolean }
export type Gesto = 'salva' | 'avanti' | 'annulla' | 'passa' | 'niente'

/** Il contratto della tastiera di un campo. `mac` decide ⌘ contro Ctrl. */
export function tastiCampo(e: Tasto, o: { multilinea: boolean; sporco: boolean; avanti: boolean; mac: boolean }): Gesto {
  if (e.isComposing) return 'niente'
  if (e.key === 'Escape') return o.sporco ? 'annulla' : 'passa'
  if (e.key !== 'Enter') return 'niente'
  if (!o.multilinea) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) return o.avanti ? 'niente' : 'salva'
    return o.avanti ? 'avanti' : 'salva'
  }
  const comando = o.mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  return comando ? 'salva' : 'niente'
}

export type StatoCampo = {
  testo: string
  salvato: string
  /** Il salvato di prima dell'ultimo commit: dove si torna se il server dice di no. */
  prima: string
  fase: 'fermo' | 'salvato' | 'guaio'
  guaio: string
  fuoco: boolean
  /** Quello che Esc ha tolto da un campo lungo: «Rimetti com’era» lo rimette. */
  annullato: string | null
}

export type Azione =
  | { tipo: 'scrivi'; testo: string } | { tipo: 'fuoco'; si: boolean }
  | { tipo: 'commit' } | { tipo: 'riuscito' } | { tipo: 'fallito'; guaio: string }
  | { tipo: 'annulla'; multilinea?: boolean } | { tipo: 'rimetti' } | { tipo: 'arriva'; valore: string } | { tipo: 'spegni' }

export function iniziale(valore: string): StatoCampo {
  return { testo: valore, salvato: valore, prima: valore, fase: 'fermo', guaio: '', fuoco: false, annullato: null }
}

export const sporco = (s: StatoCampo): boolean => s.testo !== s.salvato

export function riduci(s: StatoCampo, a: Azione, o: { vuotoVietato?: boolean } = {}): StatoCampo {
  switch (a.tipo) {
    case 'scrivi': return { ...s, testo: a.testo, annullato: null, ...(s.fase === 'guaio' && a.testo.trim() ? { fase: 'fermo' as const, guaio: '' } : {}) }
    case 'fuoco': return { ...s, fuoco: a.si }
    case 'commit': {
      if (!sporco(s)) return s
      if (o.vuotoVietato && s.testo.trim() === '') return { ...s, fase: 'guaio', guaio: 'Scrivi qualcosa.' }
      return { ...s, prima: s.salvato, salvato: s.testo, fase: 'salvato', guaio: '' }
    }
    case 'riuscito': return s
    case 'fallito': return { ...s, salvato: s.prima, fase: 'guaio', guaio: a.guaio }
    case 'annulla': return { ...s, annullato: a.multilinea ? s.testo : null, testo: s.salvato, fase: 'fermo', guaio: '' }
    case 'rimetti': return s.annullato === null ? s : { ...s, testo: s.annullato, annullato: null }
    case 'arriva':
      if (s.fuoco && sporco(s)) return s
      if (s.testo === a.valore && s.salvato === a.valore) return s
      return { ...s, testo: a.valore, salvato: a.valore, prima: a.valore }
    case 'spegni': return s.fase === 'fermo' && !s.guaio ? s : { ...s, fase: 'fermo', guaio: '' }
  }
}

/** Il valore che uno smontaggio deve ancora mandare, o null. */
export function daSalvare(s: StatoCampo, o: { vuotoVietato?: boolean } = {}): string | null {
  if (!sporco(s)) return null
  if (o.vuotoVietato && s.testo.trim() === '') return null
  return s.testo
}

/** Un gruppo di scelte: le frecce muovono il fuoco; Spazio o Invio scelgono. 'automatica' sceglie anche con le frecce. */
export function tastiScelte(key: string, i: number, n: number, attivazione: 'manuale' | 'automatica'): { fuoco: number; scegli: boolean } {
  if (n <= 0) return { fuoco: -1, scegli: false }
  const avanti = key === 'ArrowRight' || key === 'ArrowDown'
  const indietro = key === 'ArrowLeft' || key === 'ArrowUp'
  if (avanti || indietro) {
    const f = ((i + (avanti ? 1 : -1)) % n + n) % n
    return { fuoco: f, scegli: attivazione === 'automatica' }
  }
  if (key === 'Home') return { fuoco: 0, scegli: attivazione === 'automatica' }
  if (key === 'End') return { fuoco: n - 1, scegli: attivazione === 'automatica' }
  if (key === ' ' || key === 'Enter') return { fuoco: i, scegli: true }
  return { fuoco: i, scegli: false }
}

/** I tasti di un menù: giù, su, Home, Fine, e si gira. -1 vuol dire che non è un tasto del menù. */
export function prossimaVoce(key: string, i: number, n: number): number {
  if (n <= 0) return -1
  switch (key) {
    case 'ArrowDown': return i < 0 ? 0 : (i + 1) % n
    case 'ArrowUp': return i < 0 ? n - 1 : (i - 1 + n) % n
    case 'Home': return 0
    case 'End': return n - 1
    default: return -1
  }
}
