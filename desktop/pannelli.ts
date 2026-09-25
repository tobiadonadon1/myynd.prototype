// Le schermate delle Impostazioni di Sistema che il guscio può aprire.
//
// `x-apple.systempreferences:` apre qualunque pannello, e la pagina è un sito:
// il guscio non apre un prefisso, apre questi indirizzi e basta, uguali alla
// lettera. Il disco per le Note e le cartelle del Mac; i calendari e
// l'automazione per le fonti del Mac che li chiedono. L'Accessibilità no: la
// apre l'osservatore con il suo canale, senza passare di qui.
//
// Nessun import di Electron: lo leggono le prove, e la stessa lista sta in
// `server/connettori/accesso.ts` (`PANNELLI`) e in `src/components/forms.tsx`.

/** Accesso completo al disco. */
export const PANNELLO_DISCO = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
/** Calendari. */
export const PANNELLO_CALENDARI = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars'
/** Automazione. */
export const PANNELLO_AUTOMAZIONE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'

/** Gli unici indirizzi di sistema che `myynd:apri-fuori` apre. */
export const PANNELLI_AMMESSI: ReadonlySet<string> = new Set([PANNELLO_DISCO, PANNELLO_CALENDARI, PANNELLO_AUTOMAZIONE])
