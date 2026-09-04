// Andarsene, e portarsi via anche quello che resta indietro.
//
// **Perché è un file suo.** Cancellare un conto tocca quattro posti che non si
// conoscono fra loro — il database dei conti, la configurazione (che su un
// server sta su Postgres e in casa in un file), l'indice aperto in questo
// processo, e una cartella sul disco — e l'ordine in cui li si tocca non è un
// dettaglio. Se si cancella la riga del conto per prima e poi qualcosa si
// rompe, quello che resta sul disco non appartiene più a nessuno: nessuno sa
// di chi sia, e nessuno lo cancellerà mai. Quindi prima si chiudono le porte,
// poi si tolgono i dati, e la riga del conto va per ultima — è l'unica cosa che
// dice a chi appartiene tutto il resto.
//
// **L'indice va chiuso prima.** È aperto in questo processo, con il suo WAL
// accanto: cancellare il file sotto a un handle vivo lascia SQLite convinto di
// sapere cosa c'è dentro, e la richiesta successiva scriverebbe dentro un file
// che non esiste più — ricreandolo.
//
// Non si chiede conferma qui: la chiede la rotta, con la password *e*
// l'indirizzo scritto a mano. Qui si esegue, e quello che si esegue non torna
// indietro.

import { rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import * as conti from './conti.ts'
import * as cfg from './config.ts'
import * as store from './store.ts'

/**
 * La cartella di questo conto si può cancellare?
 *
 * Ce n'è una che no: quella di chi c'era prima che le persone potessero essere
 * più di una, e che ha i suoi file **nella radice** insieme a `conti.db` e a
 * tutti gli altri. Cancellarla vorrebbe dire cancellare l'installazione. Se il
 * percorso non sta dentro `<dati>/utenti/`, i file restano dove sono e si
 * dice: meglio un residuo che una cartella di dati sparita.
 */
function suaDavvero(dove: string): boolean {
  const dentro = resolve(cfg.RADICE, 'utenti') + sep
  return resolve(dove).startsWith(dentro)
}

export type Esito = { file: boolean }

/**
 * Il conto, via.
 *
 * Torna `file: false` quando la cartella non si poteva cancellare — vedi
 * `suaDavvero`. Il conto se n'è andato lo stesso: quello che resta sul disco
 * non apre più niente, perché senza la riga nel database non c'è nessun modo
 * di entrarci.
 */
export async function cancella(utente: string): Promise<Esito> {
  // 1. le chiavi. Da qui in avanti nessuna richiesta nuova può arrivare a
  //    questo conto, nemmeno mentre stiamo cancellando.
  await conti.chiudiTutte(utente)

  // 2. l'indice aperto in questo processo. Solo il suo: `chiudiIndici()`
  //    farebbe cadere le richieste in volo di tutti gli altri.
  const dove = cfg.cartellaDi(utente)
  try { store.chiudiIndice(dove) } catch { /* non era aperto: tanto meglio */ }

  // 3. la configurazione — la riga su Postgres, e la copia in memoria con
  //    dentro le credenziali.
  await cfg.cancella(utente)

  // 4. i file: l'indice, i documenti, le automazioni scritte da lei.
  let file = false
  if (suaDavvero(dove)) {
    rmSync(dove, { recursive: true, force: true })
    file = true
  } else {
    console.error(`myynd · il conto ${utente} è stato cancellato, ma i suoi file stanno in ${dove} — fuori da utenti/ — e li ho lasciati lì.`)
  }

  // 5. per ultima la riga del conto, con le sessioni e i gettoni che le stanno
  //    attaccati: finché c'è, quello che sta sul disco ha ancora un nome.
  await conti.cancella(utente)
  return { file }
}

/** Dove starebbero i file di questo conto: serve solo a chi scrive le prove. */
export const perProva = { cartella: (u: string) => join(cfg.RADICE, 'utenti', u) }
