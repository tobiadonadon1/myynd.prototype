// Il lavoro affidato, letto dal client: cosa mostra una riga pronta (P3).
//
// Le regole piccole che decidono cosa si disegna sotto una riga consegnata:
// se la bozza è partita dalla sua posta, se la correzione passa dalla
// revisione, se c'è una voce da nominare, se la riga è ferma su un blocco,
// se si può mandare. Pure, senza React, provate in `lavoro-affidato.test.ts`.
// La cornice (l'ipotesi, il segnaposto, il corpo per chi riceve) è la stessa
// del server: `server/cornice.ts`, senza import, letta da tutte e due le parti.

import type { Compito } from './api'
import { haSegnaposto, MANCA, testoMostrato } from '../server/cornice.ts'

export { corpoPerChiRiceve, haSegnaposto, rigaIpotesi, senzaRigaIpotesi, testoMostrato } from '../server/cornice.ts'

/** Le quattro frasi con cui una riga si ferma su una fonte che manca: le stesse del server. */
export const BLOCCHI = [
  'Collega la posta e la riprendo da qui.',
  'Collega i file del Mac e la riprendo da qui.',
  'Collega la fonte che serve e la riprendo da qui.',
  'Dai a Myynd il permesso che serve e la riprendo da qui.'
]

/** La frase con cui una riga si ferma dopo il secondo giro: un dato che nessuna fonte aveva. La stessa del server. */
export const MANCA_UN_DATO = 'Non sono riuscito a finirla senza un dato che manca.'

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

/**
 * Il testo della bozza com'è mostrato nella lista: senza la riga dell'ipotesi,
 * che sta sotto da sola con «Cambia». Una correzione si misura contro questo.
 */
export function testoDellaBozza(c: Pick<Compito, 'risultato' | 'ipotesi'>): string {
  return testoMostrato(c.risultato, c.ipotesi)
}

/** La riga dell'ipotesi è una riga «Manca»: la casella chiede cosa ci va, non cosa vale invece. */
export function eUnaMancanza(c: Pick<Compito, 'ipotesi' | 'email'>): boolean {
  const riga = c.ipotesi?.[0] ?? ''
  return MANCA.test(riga) || haSegnaposto(c.email?.corpo)
}

/**
 * Le righe appena passate da affidate a finite, fra una lista e l'altra:
 * `pronte` sono quelle da annunciare («Fatto: …»), `finite` quelle che
 * tengono il posto finché il fuoco si posa. Una riga rimessa com'era dopo
 * un errore (`ripristinate`, da `indietro`) è passata da affidata a pronta
 * senza che nessuno abbia fatto niente: non è finita, e dire «Fatto» sopra
 * «Non sono riuscito a rifarla» sarebbe dire una cosa falsa.
 */
export function appenaFinite(
  prima: Readonly<Record<string, string>> | null,
  adesso: readonly { id: string; stato: string }[],
  ripristinate: ReadonlySet<string> = new Set()
): { pronte: string[]; finite: string[] } {
  const pronte: string[] = []
  const finite: string[] = []
  if (!prima) return { pronte, finite }
  for (const c of adesso) {
    if (prima[c.id] !== 'delegato' || ripristinate.has(c.id)) continue
    if (c.stato === 'pronto') pronte.push(c.id)
    if (c.stato === 'pronto' || c.stato === 'chiede') finite.push(c.id)
  }
  return { pronte, finite }
}
