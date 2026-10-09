// Il lavoro affidato, letto dal client: cosa mostra una riga pronta (P3).
//
// Le regole piccole che decidono cosa si disegna sotto una riga consegnata:
// se la bozza è partita dalla sua posta, se la correzione passa dalla
// revisione, se c'è una voce da nominare, se la riga è ferma su un blocco,
// se si può mandare. Pure, senza React, provate in `lavoro-affidato.test.ts`.
// La cornice (l'ipotesi, il segnaposto, il corpo per chi riceve) è la stessa
// del server: `server/cornice.ts`, senza import, letta da tutte e due le parti.

import type { Compito, RegolaSeguita } from './api'
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

/**
 * La riga dell'ipotesi con «Cambia» si disegna solo dove cambiare serve a
 * qualcosa: una riga pronta con un'ipotesi, e non ancora partita dalla sua
 * posta. Partita, la bozza nella casella non c'è più e la mail è già andata
 * con quello che diceva: un «Cambia» lì fallirebbe sempre.
 */
export function siCambia(c: Pick<Compito, 'stato' | 'ipotesi' | 'mandata' | 'chiesto'>): boolean {
  return c.stato === 'pronto' && !!c.ipotesi?.[0] && !mandataValida(c)
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

/**
 * Quello che ha imparato e che questa bozza segue, per la riga «Learned: …
 * (n edits) · Undo»: la regola più forte (più correzioni), e quante altre.
 * Solo su una riga pronta: sotto una domanda o un lavoro in corso non c'è
 * ancora niente che l'abbia seguita. Le regole senza una frase si saltano.
 */
export function imparatoDellaBozza(c: Pick<Compito, 'stato' | 'voceScritta'>, frase: (r: RegolaSeguita) => string): { regola: RegolaSeguita; frase: string; altre: RegolaSeguita[]; nuova: boolean } | null {
  if (c.stato !== 'pronto') return null
  const regole = (c.voceScritta?.regole ?? []).filter(r => !!frase(r).trim())
  if (!regole.length) return null
  // quella usata per la prima volta da questa bozza va in testa: è la notizia
  const nuovaChiave = c.voceScritta?.primaVolta
  const [prima, ...altre] = regole.slice().sort((a, b) => Number(b.chiave === nuovaChiave) - Number(a.chiave === nuovaChiave) || b.casi - a.casi)
  return { regola: prima, frase: frase(prima), altre, nuova: prima.chiave === nuovaChiave }
}

/**
 * Le righe che Myynd si è preparato da solo (le proposte, il primo giorno, le
 * risposte guadagnate): la nota è il compito per chi lavora, in inglese e in
 * maiuscolo («PROACTIVE PREPARATION TYPE…»), non una riga per lei.
 */
const DA_SOLO = new Set(['iniziativa', 'primo-giorno', 'guadagnata'])
/**
 * Su quelle righe una nota sua va in coda al compito, dopo questa riga: chi
 * lavora la legge, e il dettaglio mostra solo lei. Scriverla al posto del
 * compito lascerebbe chi lavora senza sapere cosa fare.
 */
const SUA = '\n\nNOTE FROM THE USER:\n'
export function notaPerLei(c: Pick<Compito, 'origine' | 'nota'>): string {
  if (!(c.origine && DA_SOLO.has(c.origine))) return c.nota || ''
  const n = c.nota ?? ''
  const i = n.lastIndexOf(SUA)
  return i >= 0 ? n.slice(i + SUA.length) : ''
}
/** La nota da salvare: su una riga che Myynd si è preparato, il compito resta e la sua nota va in coda. */
export function notaDaSalvare(c: Pick<Compito, 'origine' | 'nota'>, sua: string): string | null {
  if (!(c.origine && DA_SOLO.has(c.origine))) return sua || null
  const n = c.nota ?? ''
  const i = n.lastIndexOf(SUA)
  const compito = i >= 0 ? n.slice(0, i) : n
  return sua ? `${compito}${SUA}${sua}` : compito || null
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
