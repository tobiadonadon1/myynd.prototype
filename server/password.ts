// Cambiare la password di un conto, da questa macchina.
//
// Non c'è nessun modo di *recuperare* una password: nel database c'è uno
// scrypt del suo sale, e da lì non si torna indietro — è esattamente la
// proprietà per cui la si scrive così. Quello che si può fare, sulla macchina
// dove sta il database, è metterne una nuova.
//
// Si scrive a mano e non si passa da un argomento della riga di comando: gli
// argomenti finiscono nella cronologia della shell e nell'elenco dei processi,
// dove li legge chiunque. Qui la digitazione è nascosta e non lascia traccia.
//
//   npm run password

import { createInterface } from 'node:readline'
import * as conti from './conti.ts'

const utenti = conti.tutti().map(id => conti.conto(id)!).filter(Boolean)

if (!utenti.length) {
  console.error('Non c’è nessun conto su questa installazione.')
  process.exit(1)
}

/**
 * Una sola interfaccia per tutte le domande.
 *
 * Aprirne una per domanda sembra più pulito e non funziona: `close()` chiude
 * anche lo stdin che le sta sotto, e la domanda dopo resta lì ad aspettare per
 * sempre un'immissione che non può più arrivare.
 */
const aTerminale = process.stdin.isTTY === true
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: aTerminale })

/**
 * Digitazione nascosta.
 *
 * `_writeToOutput` è il punto in cui readline ridisegna la riga mentre si
 * scrive: zittendolo dopo la domanda, quello che si batte non compare — né
 * sullo schermo di chi passa, né nel terminale che qualcuno scorrerà domani.
 */
function chiedi(domanda: string, nascosta = false): Promise<string> {
  return new Promise(risolvi => {
    const io = rl as unknown as { _writeToOutput?: (s: string) => void }
    const vero = io._writeToOutput
    // nascondere ha senso solo davanti a un terminale: con l'immissione che
    // arriva da una pipe non c'è nessun eco da zittire, e `terminal: false`
    // non chiama nemmeno questa funzione
    const nascondi = nascosta && aTerminale
    if (nascondi) io._writeToOutput = (s: string) => { if (s.includes(domanda)) vero?.call(io, s) }
    // se lo stdin finisce prima della risposta — un Ctrl-D, o un'immissione
    // che arriva da un file — non si resta appesi in silenzio
    rl.once('close', () => risolvi(''))
    rl.question(domanda, r => {
      if (nascondi) { io._writeToOutput = vero; process.stdout.write('\n') }
      risolvi(r)
    })
  })
}

const scelto = await (async () => {
  if (utenti.length === 1) {
    console.log(`Conto: ${utenti[0].email}`)
    return utenti[0]
  }
  console.log('Conti su questa installazione:')
  utenti.forEach((u, i) => console.log(`  ${i + 1}. ${u.email}`))
  const n = Number(await chiedi('Quale? '))
  return utenti[n - 1]
})()

if (!scelto) {
  console.error('Non ho capito quale.')
  rl.close()
  process.exit(1)
}

const nuova = await chiedi('Nuova password (almeno otto caratteri): ', true)
if (nuova.length < 8) {
  console.error('Almeno otto caratteri.')
  rl.close()
  process.exit(1)
}
const ancora = await chiedi('Riscrivila: ', true)
if (nuova !== ancora) {
  console.error('Le due non coincidono: non ho cambiato niente.')
  rl.close()
  process.exit(1)
}

const e = await conti.cambiaPassword(scelto.id, nuova)
rl.close()
if (!e.ok) {
  console.error(e.errore)
  process.exit(1)
}
console.log(`Fatto: ${scelto.email} ha una password nuova.`)
if (e.sessioniChiuse) {
  console.log(`Le sessioni aperte (${e.sessioniChiuse}) sono state chiuse: rientra con quella nuova.`)
}
