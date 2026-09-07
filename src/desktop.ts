// Il ponte con l'app da scrivania.
//
// Nel browser `window.myynd` non c'è, e tutto quello che sta qui risponde
// `null`: le schermate chiedono `desktop()` e, se manca, fanno come hanno
// sempre fatto. Dentro l'app il preload lo espone con `contextBridge`, e da
// qui passa tutto quello che il sito non sa fare da solo — scegliere una
// cartella con la finestra di sistema, mostrare un file nel Finder, dire al
// guscio quante cose aspettano una persona.
//
// Questo file non importa niente di suo: lo legge `lingua.ts`, che a sua volta
// leggono tutti, e un giro fra i due si vedrebbe solo all'avvio, come uno
// schermo vuoto.

export type Aggiornamento =
  /** Gli aggiornamenti qui non girano, e il perché. */
  | { stato: 'spento'; perche: 'non-firmata' | 'sviluppo' | 'nessun-feed' }
  | { stato: 'controllo' }
  /** È già l'ultima. */
  | { stato: 'aggiornata' }
  | { stato: 'scarico'; percento: number; versione: string }
  /** Scaricata: si installa al prossimo riavvio, o adesso. */
  | { stato: 'pronta'; versione: string }
  | { stato: 'errore'; messaggio: string }

export type Desktop = {
  /** La versione dell'app, dal package.json. */
  versione: string
  piattaforma: 'darwin' | 'win32' | 'linux'
  /** La finestra di sistema per scegliere cartelle, anche più d'una; `[]` se si annulla. */
  scegliCartelle(): Promise<string[]>
  /** La stessa finestra per dei file, filtrati per estensione (`['json']`); `[]` se si annulla. */
  scegliFile(estensioni: string[]): Promise<string[]>
  /** Apre un http(s)/mailto nel browser di sistema. Tutto il resto il guscio lo rifiuta. */
  apriFuori(url: string): Promise<void>
  /** Mostra un percorso nel Finder / Esplora file. */
  mostraNelFinder(percorso: string): Promise<void>
  /** Quante cose aspettano la persona: il segno nella barra dei menù e il numero sul Dock. */
  segnala(inAttesa: number): void
  /** La lingua dell'interfaccia: menù, tooltip e finestre del guscio la seguono. */
  lingua(l: 'it' | 'en'): void
  /** La scorciatoia globale com'è adesso, es. `CommandOrControl+Shift+M`. */
  scorciatoia(): Promise<string>
  impostaScorciatoia(acc: string): Promise<{ ok: boolean; errore?: string }>
  avvioAutomatico(): Promise<boolean>
  impostaAvvioAutomatico(acceso: boolean): Promise<void>
  aggiornamenti: {
    /** Com'è adesso, per chi arriva dopo gli eventi già mandati. */
    attuale(): Promise<Aggiornamento>
    /** Chiede adesso. Risponde con l'esito; il guscio manda anche gli eventi di `stato`. */
    controlla(): Promise<Aggiornamento>
    /** Chiude e installa quello che ha scaricato. */
    installa(): Promise<void>
    /** Si iscrive; torna la funzione per smettere. */
    stato(cb: (a: Aggiornamento) => void): () => void
  }
  /** Il guscio chiede di andare da qualche parte: 'preferenze', 'chat', 'oggi', 'aiuto', 'nuova-chat'. */
  naviga(cb: (dove: string) => void): () => void
}

declare global {
  interface Window { myynd?: Desktop }
}

/** Il ponte, se questa pagina sta dentro l'app; `null` nel browser e nelle prove. */
export function desktop(): Desktop | null {
  if (typeof window === 'undefined') return null
  return window.myynd ?? null
}

export type Piattaforma = Desktop['piattaforma']

/** Il nome della piattaforma come lo si scrive, non come lo dice Node. */
export function nomePiattaforma(p: Piattaforma): string {
  return p === 'darwin' ? 'macOS' : p === 'win32' ? 'Windows' : 'Linux'
}

/*
 * La scorciatoia come la scrive Electron e come la legge una persona.
 *
 * Electron vuole `CommandOrControl+Shift+M`; su un Mac si legge ⇧⌘M, come in
 * ogni menù del sistema, e su Windows «Ctrl+Shift+M». L'ordine dei simboli
 * sul Mac è quello di Apple — ⌃ ⌥ ⇧ ⌘ — qualunque sia l'ordine in cui è
 * scritta: è lo stesso che il menù nativo mostrerà accanto alla voce, e due
 * scritture diverse della stessa combinazione farebbero pensare a due
 * combinazioni.
 */
const ORDINE_MAC = ['Control', 'Alt', 'Shift', 'CommandOrControl', 'Super'] as const
/** Su Windows si scrive Ctrl+Alt+Shift, che è l'ordine in cui lo scrive Windows. */
const ORDINE_ALTRI = ['CommandOrControl', 'Control', 'Super', 'Alt', 'Shift'] as const
type Modificatore = (typeof ORDINE_MAC)[number]

/** I nomi che Electron accetta, ricondotti a uno per ciascuno. */
const MODIFICATORI: Record<string, Modificatore> = {
  CommandOrControl: 'CommandOrControl', CmdOrCtrl: 'CommandOrControl',
  Command: 'CommandOrControl', Cmd: 'CommandOrControl',
  Control: 'Control', Ctrl: 'Control',
  Alt: 'Alt', Option: 'Alt', AltGr: 'Alt',
  Shift: 'Shift',
  Super: 'Super', Meta: 'Super'
}

const SIMBOLI_MAC: Record<Modificatore, string> = {
  Control: '⌃', Alt: '⌥', Shift: '⇧', CommandOrControl: '⌘', Super: '⌘'
}
const PAROLE: Record<Modificatore, string> = {
  Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', CommandOrControl: 'Ctrl', Super: 'Win'
}

/** I tasti che sul Mac hanno un segno loro. */
const TASTI_MAC: Record<string, string> = {
  Return: '↩', Enter: '↩', Backspace: '⌫', Delete: '⌦', Tab: '⇥', Space: '␣',
  Escape: '⎋', Esc: '⎋', Up: '↑', Down: '↓', Left: '←', Right: '→',
  Home: '↖', End: '↘', PageUp: '⇞', PageDown: '⇟', Plus: '+'
}

/** `CommandOrControl+Shift+M` → «⇧⌘M» sul Mac, «Ctrl+Shift+M» altrove. */
export function simboli(acc: string, p: Piattaforma): string {
  const pezzi = acc.split('+').map(s => s.trim()).filter(Boolean)
  const mods = new Set<Modificatore>()
  let tasto = ''
  for (const pezzo of pezzi) {
    const m = MODIFICATORI[pezzo]
    if (m) mods.add(m); else tasto = pezzo
  }
  if (p === 'darwin') {
    const t = tasto.length === 1 ? tasto.toUpperCase() : (TASTI_MAC[tasto] ?? tasto)
    return ORDINE_MAC.filter(m => mods.has(m)).map(m => SIMBOLI_MAC[m]).join('') + t
  }
  const t = tasto.length === 1 ? tasto.toUpperCase() : tasto
  return [...ORDINE_ALTRI.filter(m => mods.has(m)).map(m => PAROLE[m]), t].filter(Boolean).join('+')
}

/** Quello che serve di un evento da tastiera per farne una scorciatoia. */
export type Tasto = { key: string; code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

/** Un tasto che da solo non è una combinazione: si aspetta il prossimo. */
export function soloModificatore(key: string): boolean {
  return ['Meta', 'Control', 'Alt', 'AltGraph', 'Shift', 'OS', 'Hyper', 'Super', 'CapsLock', 'Fn', 'Dead', 'Unidentified'].includes(key)
}

/** I tasti che non sono una lettera o una cifra, nel nome che vuole Electron. */
const CODICI: Record<string, string> = {
  Space: 'Space', Enter: 'Return', NumpadEnter: 'Return', Tab: 'Tab', Backspace: 'Backspace',
  Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: '\'', Backquote: '`', Comma: ',', Period: '.', Slash: '/',
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec'
}

/**
 * La combinazione appena premuta, scritta per Electron — o `null` se non lo è.
 *
 * Si legge `code` e non `key`, e non è un dettaglio: sul Mac ⌥M dà `key: 'µ'`,
 * e la scorciatoia sarebbe finita registrata su una lettera che sulla
 * tastiera non c'è. Il tasto principale della piattaforma — ⌘ sul Mac, Ctrl
 * altrove — si scrive `CommandOrControl`, che è come è scritta quella di
 * partenza: così una combinazione uguale si legge uguale.
 *
 * Serve almeno uno fra ⌘/Ctrl, ⌃ e ⌥. ⇧ da solo non basta: ⇧M sarebbe la M
 * maiuscola di ogni programma, presa in ostaggio da questo.
 */
export function acceleratore(e: Tasto, p: Piattaforma): string | null {
  if (soloModificatore(e.key)) return null
  const mac = p === 'darwin'
  const principale = mac ? e.metaKey : e.ctrlKey
  const secondario = mac ? e.ctrlKey : e.metaKey
  if (!principale && !secondario && !e.altKey) return null

  let tasto = ''
  let m: RegExpMatchArray | null
  if ((m = /^Key([A-Z])$/.exec(e.code))) tasto = m[1]
  else if ((m = /^Digit(\d)$/.exec(e.code))) tasto = m[1]
  else if ((m = /^Numpad(\d)$/.exec(e.code))) tasto = `num${m[1]}`
  else if ((m = /^F(\d{1,2})$/.exec(e.code)) && Number(m[1]) >= 1 && Number(m[1]) <= 24) tasto = e.code
  else if (CODICI[e.code]) tasto = CODICI[e.code]
  if (!tasto) return null

  const mods: string[] = []
  if (principale) mods.push('CommandOrControl')
  if (secondario) mods.push(mac ? 'Control' : 'Super')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  return [...mods, tasto].join('+')
}
