// Il filo che apre i PDF, e che può morire senza portarsi via il server.
//
// Questo file gira dentro un `worker_thread`. Non sa niente di chi ha chiesto,
// non tocca l'indice, non legge la configurazione: riceve dei byte e un nome,
// torna del testo. È tutto quello che deve sapere — ed è anche la ragione per
// cui si può ammazzare a metà lavoro senza pensarci due volte.
//
// Perché sta qui e non nel filo principale: pdfjs, dentro `pdf-parse`, è codice
// che macina. Un PDF di dodici mega scritto male lo tiene occupato per minuti,
// e finché è occupato **Node non fa altro**: non risponde a una chat, non manda
// una mail, non serve un'altra persona. Peggio ancora, il riparo che c'era —
// una corsa contro un `setTimeout` — non poteva scattare, perché il timer per
// scattare ha bisogno del giro degli eventi, e il giro degli eventi era proprio
// la cosa che quel PDF aveva bloccato. Un riparo che non può scattare non è un
// riparo: è una riga che rassicura.
//
// Qui invece il tempo lo conta il filo principale, che è libero, e quando è
// scaduto chiude questo di forza. Il conto è un documento perso, non un
// pomeriggio di tutti.

import { parentPort } from 'node:worker_threads'
import { quiDentro } from './estrai.ts'

type Richiesta = { id: number; byte: ArrayBuffer; nome: string }

parentPort?.on('message', async (m: Richiesta) => {
  try {
    const testo = await quiDentro(Buffer.from(m.byte), m.nome)
    parentPort?.postMessage({ id: m.id, ok: true, testo })
  } catch (e) {
    // il messaggio torna come stringa: un `Error` con dentro un oggetto di
    // pdfjs non passa dalla struttura clonata, e il guaio diventerebbe un
    // guaio diverso da quello vero
    parentPort?.postMessage({ id: m.id, ok: false, errore: e instanceof Error ? e.message : String(e) })
  }
})
