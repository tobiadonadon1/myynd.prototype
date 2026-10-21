// Perché nasce una riga nella lista. Senza modello.
//
// «There is no reason for it to create some action items that have nothing to
// do with the actual things that I have to do.» Una riga che Myynd scrive da
// sé nella lista di una persona ha una ragione sola fra tre, e la ragione si
// controlla sui fatti, non sulle parole del modello:
//
//   · l'ha chiesta lei: un gesto (una carta presa, un lato detto di sì, un
//     mandato confermato, una pagina di Notion scelta);
//   · qualcuno aspetta lei: una mail di una persona vera, a lei, recente, a cui
//     non ha ancora risposto;
//   · l'ha promesso lei: un impegno scritto in una sua risposta (`seguito`).
//
// Tutto il resto («una cosa vera del progetto», «un passo che avvicina il
// traguardo», un'idea per X) non è una riga: al massimo una carta del feed,
// che lei prende o lascia. Vale per ogni persona, non per una.

import * as store from './store.ts'
import * as cfg from './config.ts'
import * as mandato from './mandato.ts'
import * as lavoroDati from './lavoro-dati.ts'
import { contieneRichiesta, corpoAttuale, mittenteAutomatico } from './rilevanza.ts'
import { FONTI_POSTA } from './connettori/registro.ts'

export type Motivo = 'chiesto' | 'aspetta' | 'impegno'

/** Oltre questi giorni un messaggio senza risposta non aspetta più: è passato. */
export const GIORNI_ATTESA = 14

/** Le fonti dove una persona scrive a un'altra: la posta e le chat. */
const MESSAGGI = /^(?:posta|google|microsoft|postamac|imap|gmail|outlook|slack|whatsapp|imessage|teams|telegram)/

/**
 * Una persona vera aspetta lei per questo documento? Arrivato (non suo, non
 * di massa, non di un programma), di meno di `GIORNI_ATTESA` giorni, e: un
 * messaggio di una persona a cui non ha ancora risposto, o un testo che le
 * chiede qualcosa (le azioni date a lei in una riunione, una nota con una
 * richiesta). Un file qualunque che «parla del progetto» no.
 */
export function aspetta(d: store.Documento | null | undefined, adesso = Date.now()): boolean {
  if (!d || d.inviato || d.massa || mittenteAutomatico(d.autore)) return false
  const quando = Date.parse(d.quando ?? '')
  if (!Number.isFinite(quando) || adesso - quando > GIORNI_ATTESA * 86_400_000) return false
  const posta = d.tipo === 'email' || (FONTI_POSTA as readonly string[]).includes(d.fonte)
  if (posta) {
    try { if (lavoroDati.inviatiDopo(d.messageId ?? null, d.filo ?? null, d.quando!).length) return false } catch { /* senza indice, si guarda il resto */ }
  }
  if (posta) return true
  // una chat o una nota aspetta lei solo se le chiede qualcosa, o le dà un'azione: una conversazione dove
  // ha scritto per ultima lei, o dove nessuno ha chiesto niente, non aspetta nessuno
  const testo = corpoAttuale(d)
  if (MESSAGGI.test(d.fonte) && ultimaSua(testo)) return false
  return contieneRichiesta(testo) || AZIONI.test(testo) || azioneSua(testo) || IMPERATIVO.test(testo)
}

// «Action items:», «Next steps:», «Azioni:», «Prossimi passi:», «To do:»
const AZIONI = /(?:^|\n)\s*(?:action items?|next steps?|to-?dos?|azioni|prossimi passi|da fare|cose da fare)\s*:/i
// «mandami», «inviami», «fammi sapere», «send me», «let me know»
const IMPERATIVO = /\b(?:mandami|inviami|mandaci|inviaci|fammi sapere|fateci sapere|send me|let me know|get back to me)\b/i

/** Un'azione data a lei per nome: «Anna to send the deck», «Anna will share», «Anna manda la bozza». */
function azioneSua(testo: string): boolean {
  const nome = (cfg.leggi().nome ?? '').trim().split(/\s+/)[0]
  if (!nome || nome.length < 2) return false
  const n = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${n}\\b\\s+(?:to|will|should|needs to|must|manda|invia|deve|dovrebbe|prepara|scrive|chiama)\\b`, 'i').test(testo)
}

/** L'ultima riga di una conversazione è sua: «Anna: …» o «Me: …» o «Io: …». */
function ultimaSua(testo: string): boolean {
  const ultima = testo.trim().split('\n').filter(r => r.trim()).pop() ?? ''
  const nome = (cfg.leggi().nome ?? '').trim().split(/\s+/)[0]
  return /^\s*(?:me|io|you|tu)\s*:/i.test(ultima) || (!!nome && new RegExp(`^\\s*${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^:]{0,30}:`, 'i').test(ultima))
}

/** Il progetto ha un mandato che lei ha confermato: lì Myynd lavora da sé, la notte. */
export function mandatoConfermato(progetto: string | null | undefined): boolean {
  if (!progetto) return false
  try { return mandato.scritto(progetto)?.stato === 'confermato' } catch { return false }
}

/**
 * La ragione di una carta che Myynd mette in lista da sé, o null se non ne ha.
 *
 * Due strade la scrivevano senza che nessuno l'avesse chiesta, e sono le due
 * che si controllano qui: il lavoro del quadro («un passo che avvicina il
 * traguardo») e il punto del giorno. Le altre portano la loro ragione dentro
 * e non passano di qui per niente: le proposte dalla posta e dalle riunioni
 * nascono solo da un testo che chiede (`iniziativa.ts`), la risposta
 * guadagnata e le carte del primo giorno da una mail che aspetta, il seguito
 * da un impegno scritto in una sua risposta, il lato da un suo sì, le idee per
 * X e il copione da un lato detto di sì o da carte prese
 * (`lato-lavoro.tieneRicorrente`), la pagina di Notion dalla pagina che ha
 * scelto.
 */
export function motivoDi(c: { origine: string; doc?: string | null; progetto?: string | null }, adesso = Date.now()): Motivo | null {
  if (c.origine === 'quadro') return mandatoConfermato(c.progetto) ? 'chiesto' : null
  if (c.origine === 'punto') return aspetta(c.doc ? store.documento(c.doc) : null, adesso) ? 'aspetta' : null
  return 'chiesto'
}
