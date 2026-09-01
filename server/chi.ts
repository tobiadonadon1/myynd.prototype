// Di chi è questa richiesta.
//
// Myynd è nato per una persona sola su una macchina sola: `config.leggi()`
// tornava *la* configurazione, `store` apriva *il* database, e nessuna delle
// due doveva chiedersi di chi fossero. Ottantuno punti nel codice si appoggiano
// a quella comodità, e centoventisette query con loro.
//
// Con più persone sullo stesso server quella domanda diventa obbligatoria — e
// la risposta non si può passare di funzione in funzione senza riscrivere
// duecento firme. Peggio: bisognerebbe *ricordarsi* di passarla ogni volta, e
// il giorno che qualcuno se ne dimentica non compare nessun errore. Compare la
// posta di un'altra persona.
//
// Quindi la si mette dove sta già il resto del contesto di una richiesta:
// `AsyncLocalStorage`. Lo apre la guardia dell'accesso quando riconosce il
// token, e da lì in poi tutto quello che gira dentro quella richiesta — anche
// venti chiamate più in fondo, anche dopo un `await` — sa a chi appartiene
// senza che nessuno glielo dica.
//
// **La cosa importante è cosa succede quando nessuno l'ha aperto.** Non si
// tira a indovinare e non si prende il primo che capita: si torna `null`, e
// chi legge decide. Su un computer di casa `null` vuol dire «la cartella di
// sempre», che è giusto — lì c'è una persona sola. Su un server vuol dire che
// qualcosa sta girando fuori da una richiesta, e allora deve dirlo invece di
// scegliere un utente a caso.

import { AsyncLocalStorage } from 'node:async_hooks'

const filo = new AsyncLocalStorage<string>()

/** Fa girare `fn` come se fosse questa persona. */
export function dentro<T>(utente: string, fn: () => T): T {
  return filo.run(utente, fn)
}

/** Chi è, adesso. `null` fuori da una richiesta. */
export function adesso(): string | null {
  return filo.getStore() ?? null
}

/**
 * Chi è, e guai se non si sa.
 *
 * Da usare dove lavorare sull'utente sbagliato sarebbe peggio di non lavorare
 * affatto: scrivere un documento, aprire una casella, salvare una credenziale.
 * Un errore rumoroso qui è un pomeriggio perso; il suo contrario è la posta di
 * qualcuno nell'indice di qualcun altro.
 */
export function serve(): string {
  const u = adesso()
  if (!u) throw new Error('Non so di chi sia questa richiesta.')
  return u
}
