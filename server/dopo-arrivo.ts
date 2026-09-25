// Dopo un arrivo, la lettura del feed si paga solo se serve (P4).
//
// Un giro che ha portato solo file vecchi del Mac, o impegni, non chiama il
// modello per sentirsi dire «niente». Basta un arrivo da feed (una mail
// diretta appena arrivata) perché lo chiami, una volta, con gli arrivi.

import * as claude from './claude.ts'
import { qualcosaDaFeed } from './rilevanza.ts'
import type { Documento } from './store.ts'

/** Le voci del feed nate da questi arrivi; nessuna chiamata se non c'è niente da feed. */
export async function feedDegliArrivi(nuovi: Documento[], adesso = Date.now()): ReturnType<typeof claude.generaFeed> {
  return qualcosaDaFeed(nuovi, adesso) ? claude.generaFeed(nuovi) : []
}
