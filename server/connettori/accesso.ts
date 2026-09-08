// L'accesso completo al disco: c'è o non c'è, e va detto prima di fallire.
//
// macOS protegge alcune cartelle della casa anche da chi la casa ce l'ha: la
// posta di Mail, le Note, i Messaggi. Un programma che prova ad aprirle
// senza il permesso non riceve «non esiste» ma «operazione non permessa» —
// e il permesso non si chiede da codice: lo dà la persona, a mano, nelle
// Impostazioni di Sistema, sotto «Accesso completo al disco». Myynd non può
// aprire quella schermata da solo né fingere di averlo: può solo guardare se
// ce l'ha, dirlo in chiaro, e indicare la strada.
//
// Si guarda una cartella protetta con un `readdir` e basta: se risponde, il
// permesso c'è; se risponde EPERM, non c'è. Non si legge niente di quello che
// c'è dentro — la domanda è «posso», non «cosa».

import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Accesso = 'si' | 'no' | 'non-mac'

/**
 * Le cartelle che macOS protegge, e che a noi servono davvero.
 *
 * La prima è quella delle Note — è la fonte che chiede il permesso — e la
 * seconda quella di Mail, che c'è quasi sempre. Ne basta una che risponda per
 * dire «sì», e una che dica «non permesso» per dire «no»: quella che non
 * esiste non dice niente.
 */
export function cartelleProtette(casa = homedir()): string[] {
  return [
    join(casa, 'Library', 'Group Containers', 'group.com.apple.notes'),
    join(casa, 'Library', 'Mail')
  ]
}

/**
 * Myynd ha l'accesso completo al disco?
 *
 * Solo su Mac: altrove il permesso non esiste e la risposta è «non-mac», che
 * per l'interfaccia vuol dire «non parlarne». Se nessuna delle cartelle
 * protette esiste — un Mac appena installato — si risponde «sì»: niente ci
 * ferma, e non c'è ancora niente da leggere.
 */
export function accessoCompleto(casa = homedir(), piattaforma = process.platform): Accesso {
  if (piattaforma !== 'darwin') return 'non-mac'
  for (const cartella of cartelleProtette(casa)) {
    try {
      readdirSync(cartella)
      return 'si'
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EPERM' || code === 'EACCES') return 'no'
      // ENOENT, ENOTDIR: non c'è, e non dice niente sul permesso
    }
  }
  return 'si'
}

/** L'indirizzo che apre la schermata giusta delle Impostazioni di Sistema. Lo apre il guscio, mai il server. */
export const PANNELLO_ACCESSO_DISCO = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'

/** La strada a mano, per chi legge Myynd in un browser e non ha un bottone che la apra. */
export const STRADA_ACCESSO_DISCO = 'Impostazioni di Sistema › Privacy e sicurezza › Accesso completo al disco › Myynd'
