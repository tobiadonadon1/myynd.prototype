// Il computer si è svegliato: si recupera quello che è successo nel frattempo.
//
// Un portatile chiuso alle sei e riaperto alle nove non ha letto niente per
// tutta la notte, e i timer delle sei ore non sanno che ore sono davvero:
// la prossima rilettura può essere fra cinque ore. Il guscio dell'app lo sa
// — riceve il risveglio dal sistema — e lo dice al server con un messaggio
// su `parentPort`, il filo che c'è solo dentro Electron.
//
// Il contratto è tutto qui: `{ tipo: 'sveglia' }`. Fuori da Electron non c'è
// nessun filo e non deve essere un errore — il server parte anche da solo.
//
// E due risvegli vicini — il coperchio aperto, richiuso, riaperto — sono un
// recupero solo: cinque minuti di silenzio, non un giro per ogni volta.

const MINIMO = 5 * 60_000

let ultima = 0

/**
 * Fa girare `fai` se dall'ultima volta è passato abbastanza tempo.
 *
 * Torna `true` se è partito. `adesso` si passa solo nelle prove.
 */
export function sveglia(fai: () => unknown, adesso = Date.now()): boolean {
  if (adesso - ultima < MINIMO) return false
  ultima = adesso
  fai()
  return true
}

/** Il filo che Electron mette a un utilityProcess; con `on` come un emitter. */
type Filo = { on(evento: 'message', f: (m: { data?: unknown }) => void): unknown }

/**
 * Si mette in ascolto sul filo, se c'è.
 *
 * Il filo si può passare a mano — è così che si prova — altrimenti è quello
 * di `process`, quando Electron ce l'ha messo. Torna `true` se c'era.
 */
export function ascolta(fai: () => unknown, filo?: Filo | null): boolean {
  const f = filo ?? (process as unknown as { parentPort?: Filo }).parentPort
  if (!f) return false
  f.on('message', m => {
    const d = m?.data as { tipo?: unknown } | undefined
    if (d?.tipo === 'sveglia') sveglia(fai)
  })
  return true
}

/** Solo per le prove: si dimentica l'ultimo risveglio. */
export function perProva() { ultima = 0 }
