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
 * `leggeva`: la pagina si è chiusa (o ricaricata) mentre leggeva le fonti. Il
 * server smette di cominciare fonti nuove quando la pagina se ne va, quindi
 * quella lettura non è finita e i suoi estratti non si mostrano: si torna
 * alle schede, dove «Leggi» la riprende. `ritorno`: si torna da un consenso
 * (Google, Microsoft) chiesto da una scheda delle fonti. Un avvio già
 * completato resta sul suo risultato.
 */
export function momentoAllaRipresa(fase: FaseAvvio, { leggeva = false, ritorno = false }: { leggeva?: boolean; ritorno?: boolean } = {}): Momento {
  if (fase === 'completo' || fase === 'progetto') return momentoDi(fase)
  return leggeva || ritorno ? 1 : momentoDi(fase)
}
