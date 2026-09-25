// In una scena delle prove (`prove/scena.sh`, che accende il server con
// MYYND_PROVA_NIENTE_OPEN=1) niente porta davanti un'app sul Mac di chi la fa
// girare: la regola è «mai guidare il suo Mac», e vale per ogni bottone che
// finirebbe in `/usr/bin/open`. «Portami lì» sulla fonte (scrivania.ts),
// «Apri» su un file consegnato (mani.ts), su un documento di Pages o TextEdit
// (native-document.ts) e sulla copia di un progetto (index.ts) passano tutti
// di qui prima di lanciare qualcosa: col flag acceso scrivono nel registro
// cosa avrebbero aperto, e basta. I controlli sul percorso restano dove sono,
// prima di arrivare qui: una scena deve vedere gli stessi errori del vero.

/** Il flag delle prove: `open` non parte. Solo «1» conta. */
export function nienteOpen(): boolean {
  return process.env.MYYND_PROVA_NIENTE_OPEN === '1'
}

/**
 * Vero, con una riga nel registro, quando `open` non va eseguito. Chi chiama
 * fa `if (openInProva('mani', [percorso])) return` e poi lancia davvero.
 */
export function openInProva(chi: string, argomenti: string[]): boolean {
  if (!nienteOpen()) return false
  console.log(`myynd · ${chi} · open non eseguito (prova): ${argomenti.join(' ')}`)
  return true
}
