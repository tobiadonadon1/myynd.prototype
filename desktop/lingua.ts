// Le due lingue del guscio.
//
// Il guscio ha poche frasi sue — voci di menu, la nuvoletta della barra, due
// finestre di dialogo — e non può usare `src/lingua.ts`: quello vive nel
// renderer, questo nel processo principale. Stesso criterio però: la chiave è
// la frase italiana, una che manca degrada in italiano invece che in un codice.
//
// Si parte dalla lingua del sistema e poi si segue quello che dice il renderer
// via `lingua()`: chi ha scelto l'inglese nelle preferenze deve trovare
// inglese anche nel menu, senza dover scegliere due volte.

export type Lingua = 'it' | 'en'

let corrente: Lingua = 'it'

const EN: Record<string, string> = {
  'Myynd si sta svegliando.': 'Waking up.',
  'Il server di Myynd si è fermato.': 'The Myynd server stopped.',
  'Riapri': 'Reopen',
  'Esci': 'Quit',
  'Non ha scritto niente prima di fermarsi.': 'It did not say anything before stopping.',
  'Qualcosa è andato storto nel guscio.': 'Something went wrong in the shell.',
  'Continua': 'Continue',
  'Preferenze…': 'Preferences…',
  'Nuova chat': 'New chat',
  'Apri Myynd': 'Open Myynd',
  'Informazioni su Myynd': 'About Myynd',
  'Servizi': 'Services',
  'Nascondi Myynd': 'Hide Myynd',
  'Nascondi gli altri': 'Hide Others',
  'Mostra tutto': 'Show All',
  'Esci da Myynd': 'Quit Myynd',
  'File': 'File',
  'Chiudi finestra': 'Close Window',
  'Modifica': 'Edit',
  'Annulla': 'Undo',
  'Ripeti': 'Redo',
  'Taglia': 'Cut',
  'Copia': 'Copy',
  'Incolla': 'Paste',
  'Incolla senza formattazione': 'Paste and Match Style',
  'Elimina': 'Delete',
  'Seleziona tutto': 'Select All',
  'Vista': 'View',
  'Ricarica': 'Reload',
  'Ricarica da capo': 'Force Reload',
  'Dimensione normale': 'Actual Size',
  'Ingrandisci': 'Zoom In',
  'Riduci': 'Zoom Out',
  'Schermo intero': 'Toggle Full Screen',
  'Finestra': 'Window',
  'Contrai': 'Minimize',
  'Zoom': 'Zoom',
  'Porta tutto in primo piano': 'Bring All to Front',
  'Aiuto': 'Help',
  'Guida di Myynd': 'Myynd Help',
  'Cartella dei dati': 'Data Folder',
  'Registro del guscio': 'Shell Log',
  'in attesa': 'waiting',
  'La combinazione deve avere un modificatore e un tasto, per esempio CommandOrControl+Shift+M.':
    'The shortcut needs a modifier and a key, for example CommandOrControl+Shift+M.',
  'Questa combinazione non si può usare qui.': 'This shortcut cannot be used here.',
  'Questo indirizzo non si apre fuori da Myynd.': 'This address cannot be opened outside Myynd.',
  'Gli aggiornamenti non sono disponibili.': 'Updates are not available.'
}

/** Quale lingua parla il guscio adesso. */
export function lingua(): Lingua {
  return corrente
}

export function imposta(l: Lingua) {
  corrente = l
}

/** Da `app.getLocale()`: italiano se comincia con `it`, altrimenti inglese. */
export function daLocale(locale: string): Lingua {
  return /^it\b/i.test(locale) ? 'it' : 'en'
}

/** La frase nella lingua corrente. Una chiave che manca resta in italiano. */
export function t(frase: string): string {
  if (corrente === 'it') return frase
  return EN[frase] ?? frase
}
