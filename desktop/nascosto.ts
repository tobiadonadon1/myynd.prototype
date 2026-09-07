// L'app è partita da sola?
//
// All'accesso il sistema la apre senza che nessuno l'abbia chiesta, e in quel
// caso la finestra non deve comparire: si carica lo stesso — il filo degli
// eventi, il punto nella barra e il numero sul Dock vivono nel renderer — ma
// resta nascosta finché qualcuno la chiama. Tre segnali, perché nessuno vale
// dappertutto: `wasOpenedAtLogin` e `wasOpenedAsHidden` sul Mac vecchio,
// `--nascosto` fra gli argomenti che si registrano con l'avvio automatico.
// Senza Electron, così si prova a tavolino.

export type Accesso = { wasOpenedAtLogin?: boolean; wasOpenedAsHidden?: boolean }

export const ARGOMENTO_NASCOSTO = '--nascosto'

export function avvioNascosto(argv: readonly string[], accesso: Accesso | null | undefined): boolean {
  if (argv.includes(ARGOMENTO_NASCOSTO)) return true
  return !!(accesso?.wasOpenedAtLogin || accesso?.wasOpenedAsHidden)
}
