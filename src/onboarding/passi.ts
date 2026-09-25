// Dove si riprende il primo avvio. Niente React: le prove lo guardano da Node.

import type { Momento } from './Scena'

export type FaseAvvio = 'progetto' | 'fonte' | 'verifica' | 'azione' | 'completo'

/*
 * Prima le fonti, poi l'attività.
 *
 * Le fonti stavano dentro la prima attività, come una riga facoltativa che
 * ne apriva una sola: la prima persona di fuori si aspettava l'opposto, di
 * collegare tutto quello che usa e poi farlo leggere insieme. Adesso vengono
 * subito dopo l'obiettivo: lette tutte, gli estratti, e l'attività per ultima,
 * quando c'è già qualcosa da cui partire.
 */
export const momentoDi = (fase: FaseAvvio): Momento => fase === 'progetto' ? 0 : fase === 'fonte' ? 1 : fase === 'verifica' ? 2 : 3

/**
 * Il momento da cui si riparte aprendo la pagina.
 *
 * `leggeva`: la pagina si è chiusa (o ricaricata) mentre leggeva le fonti: si
 * torna al passo delle fonti. `leggendo`: il server dice che la lettura è
 * ancora in corso (P4), e il passo delle fonti si apre sulle righe. `ritorno`: si torna da un consenso
 * (Google, Microsoft) chiesto da una scheda delle fonti. Un avvio già
 * completato resta sul suo risultato.
 */
export function momentoAllaRipresa(fase: FaseAvvio, { leggeva = false, ritorno = false, leggendo = false, aMetaLettura = false }: { leggeva?: boolean; ritorno?: boolean; leggendo?: boolean; aMetaLettura?: boolean } = {}): Momento {
  if (fase === 'completo' || fase === 'progetto') return momentoDi(fase)
  // la lettura del server va avanti: si resta sulle fonti, a guardarla
  if (riprendeLeggendo(leggendo, aMetaLettura)) return 1
  return leggeva || ritorno ? 1 : momentoDi(fase)
}

/**
 * Si riprende guardando la lettura (P4): il server dice che una prima lettura
 * sta girando, chi ricarica a metà torna alle righe, non alle schede: la
 * lettura non si è fermata con la pagina.
 *
 * Il server segna `fonteScelta` (e quindi la fase passa a `verifica`) nello
 * stesso istante in cui le fonti sono scelte, cioè appena si preme «Leggi»,
 * non quando la lettura finisce: guardare la fase invece del segno di lettura
 * del server faceva credere che quasi nessuna lettura fosse «in corso» e
 * rimandava chi ricaricava al benvenuto (giro 4). Solo un «Continua» premuto
 * apposta a metà lettura (`aMetaLettura`) tiene le righe da parte: lì la
 * persona ha già scelto di andare avanti senza guardarle finire.
 */
export function riprendeLeggendo(leggendo: boolean, aMetaLettura: boolean): boolean {
  return leggendo && !aMetaLettura
}
