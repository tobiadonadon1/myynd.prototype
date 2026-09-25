// Il lavoro affidato, letto dal client: cosa mostra una riga pronta (P3).
//
// Le regole piccole che decidono cosa si disegna sotto una riga consegnata:
// se la bozza è partita dalla sua posta, se la correzione passa dalla
// revisione, se c'è una voce da nominare, se la riga è ferma su un blocco,
// se si può mandare. Pure, senza React, provate in `lavoro-affidato.test.ts`.
// La cornice (l'ipotesi, il segnaposto, il corpo per chi riceve) è la stessa
// del server: `server/cornice.ts`, senza import, letta da tutte e due le parti.

import type { Compito } from './api'
import { haSegnaposto, MANCA } from '../server/cornice.ts'

export { corpoPerChiRiceve, haSegnaposto, rigaIpotesi, senzaRigaIpotesi } from '../server/cornice.ts'

/** Le quattro frasi con cui una riga si ferma su una fonte che manca: le stesse del server. */
export const BLOCCHI = [
  'Collega la posta e la riprendo da qui.',
  'Collega i file del Mac e la riprendo da qui.',
  'Collega la fonte che serve e la riprendo da qui.',
  'Dai a Myynd il permesso che serve e la riprendo da qui.'
]

/** Quante mail a quella persona servono perché la voce sia la sua, e si dica. */
export const VOCE_MINIMA = 3

/** La bozza è partita dalla sua posta dopo questa delega: una `mandata` più vecchia è di un giro prima. */
export function mandataValida(c: Pick<Compito, 'mandata' | 'chiesto'>): boolean {
  return !!c.mandata && !!c.chiesto && c.mandata.quando >= c.chiesto
}

/** Una correzione passa dalla revisione (riga figlia) quando c'è una bozza salvata nella posta o un file consegnato. */
export function siRivede(c: Pick<Compito, 'email' | 'consegna'>): boolean {
  return c.email?.casella?.stato === 'salvata' || !!c.consegna
}

/** «Come le tue 4 mail a Marco»: solo con almeno tre mail a quella persona, e la più recente da aprire. */
export function rigaDellaVoce(c: Pick<Compito, 'voceScritta'>): { n: number; nome: string; apri: string } | null {
  const v = c.voceScritta
  if (!v || !v.destinatario || !v.quanti || v.quanti < VOCE_MINIMA || !v.esempi?.length) return null
  return { n: v.quanti, nome: v.destinatario, apri: v.esempi[0].id }
}

/** La riga è ferma su una fonte che manca: il guaio è una delle quattro frasi fisse. */
export function bloccoDi(c: Pick<Compito, 'guaio'>): boolean {
  return !!c.guaio && BLOCCHI.includes(c.guaio)
}

/** Con un segnaposto nel corpo non si manda: manca ancora un dato. Il server guarda `mandata`. */
export function puoMandare(c: Pick<Compito, 'email'>): boolean {
  return !haSegnaposto(c.email?.corpo)
}

/** La riga dell'ipotesi è una riga «Manca»: la casella chiede cosa ci va, non cosa vale invece. */
export function eUnaMancanza(c: Pick<Compito, 'ipotesi' | 'email'>): boolean {
  const riga = c.ipotesi?.[0] ?? ''
  return MANCA.test(riga) || haSegnaposto(c.email?.corpo)
}
