// Quando gira un ordine fisso, e com'è andata l'ultima volta (E).
//
// Pure: una ricetta o una ricevuta dentro, una frase nella lingua dell'app
// fuori. Stavano in `Scheda.tsx`, che non disegnava più niente da mesi e
// restava in piedi solo per queste due funzioni; e in `Costruttore.tsx` ce
// n'era una terza copia della stessa frase. Una sola, qui, e le prove la
// girano in tutte e due le lingue.
//
// La ricevuta è la riga che mancava: un ordine fisso che gira e non fa niente
// si scriveva identico a uno che lavora. Adesso ogni giro dice quanti
// documenti ha guardato, quante cose ha fatto, o perché niente.

import { lingua, loc, t } from '../lingua.ts'
import type { Giro, Quando } from '../api.ts'

const en = () => lingua() === 'en'
/** Le due lingue della stessa frase: l'italiano è la sorgente, l'inglese la sua metà. */
const du = (x: { it: string; en: string }) => en() ? x.en : x.it

export const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
/** «09:00», o «16:30» com'è scritto un orario. */
const oraDi = (iso: string) => new Date(iso).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })

/** Quando gira, detto in una frase corta: «ogni lunedì alle 09:00», «il 1 di ogni mese alle 09:00». */
export function quandoGira(q: Quando): string {
  if ('quandoArriva' in q) return t('quando arriva qualcosa di nuovo')
  const ora = hh(q.ora)
  if (q.ogni === 'giorno') return `${t('ogni giorno alle')} ${ora}`
  if (q.ogni === 'feriali') return du({ it: `dal lunedì al venerdì alle ${ora}`, en: `weekdays at ${ora}` })
  if (q.ogni === 'mese') return du({ it: `il ${q.giorno} di ogni mese alle ${ora}`, en: `on day ${q.giorno} of each month at ${ora}` })
  return `${t('ogni')} ${t(GIORNI[q.giorno] ?? 'lunedì')} ${t('alle')} ${ora}`
}

/**
 * Il giorno e l'ora della prossima volta: «giovedì 09:00». Oltre la settimana
 * anche la data, «domenica 1 nov 09:00»: un ordine al mese scritto «domenica»
 * si legge come fra tre giorni, ed è fra tre settimane.
 */
export function quandoData(iso: string, adesso = Date.now()): string {
  const d = new Date(iso)
  const lontano = d.getTime() - adesso > 6 * 86_400_000
  return d.toLocaleString(loc(), lontano
    ? { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { weekday: 'long', hour: '2-digit', minute: '2-digit' })
}

const documenti = (n: number) => du({ it: `${n} ${n === 1 ? 'documento' : 'documenti'}`, en: `${n} ${n === 1 ? 'document' : 'documents'}` })

/**
 * La ricevuta di un giro, in una riga: quanti documenti, quante cose, o perché
 * niente. `riprova` c'è solo se l'ultimo è andato storto.
 */
export function ricevuta(g: Giro | null | undefined, riprova?: string | null): string {
  if (!g?.quando) return t('Non è ancora girata.')
  if (g.esito === 'guaio' || g.perche === 'guaio') {
    return riprova
      ? du({ it: `Non è riuscita: riprovo alle ${oraDi(riprova)}.`, en: `It failed: retrying at ${oraDi(riprova)}.` })
      : t('L’ultima volta è andata storta.')
  }
  if (g.esito === 'fatta') {
    const n = g.fatti ?? 1
    return du({
      it: `Ha guardato ${documenti(g.quanti)} e fatto ${n} ${n === 1 ? 'cosa' : 'cose'}.`,
      en: `Looked at ${documenti(g.quanti)} and made ${n} ${n === 1 ? 'item' : 'items'}.`
    })
  }
  switch (g.perche) {
    case 'gia': return t('Aspetta che chiudi la sua riga.')
    case 'tetto': return t('Il budget di oggi è finito: riprende domani.')
    case 'condizione': return du({ it: `Ha guardato ${documenti(g.quanti)}: un passo «solo se» l’ha fermata.`, en: `Looked at ${documenti(g.quanti)}: an “only if” step stopped it.` })
    case 'vuoto': return t('Non c’era niente di nuovo da guardare.')
    default: return g.quanti
      ? du({ it: `Ha guardato ${documenti(g.quanti)}: niente da fare.`, en: `Looked at ${documenti(g.quanti)}: nothing needed doing.` })
      : t('Non c’era niente di nuovo da guardare.')
  }
}

/** «Il mese scorso: fino a 6 cose, da 9 documenti.» L'anteprima che ha preso il posto del vassoio. */
export function mesePrima(cose: number, docs: number): string {
  if (!cose) return t('Il mese scorso non avrebbe fatto niente.')
  // un promemoria non legge niente: le sue righe sono una per volta
  if (!docs) return du({ it: `Il mese scorso: ${cose} ${cose === 1 ? 'riga' : 'righe'} in lista.`, en: `Last month: ${cose} ${cose === 1 ? 'line' : 'lines'} on your list.` })
  return du({
    it: `Il mese scorso: fino a ${cose} ${cose === 1 ? 'cosa' : 'cose'}, da ${documenti(docs)}.`,
    en: `Last month: up to ${cose} ${cose === 1 ? 'item' : 'items'}, from ${documenti(docs)}.`
  })
}

/** Il bottone di una proposta: «Approva» per una cosa, «Approva tutto (3)» per più d'una. */
export function approva(n: number): string {
  return n > 1 ? du({ it: `Approva tutto (${n})`, en: `Approve all (${n})` }) : t('Approva')
}

/**
 * La frase con cui una carta diventa un ordine fisso: «Ogni lunedì mattina:
 * Richiamare Rossi». Il testo della carta resta com'è, maiuscola compresa:
 * abbassarla sbaglierebbe su ogni carta che comincia con un nome. Quello che
 * gli si mette davanti è il ritmo, che il costruttore legge senza modello.
 */
export function fraseOgniSettimana(testo: string): string {
  const corpo = testo.replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '')
  if (!corpo) return ''
  return du({ it: `Ogni lunedì mattina: ${corpo}`, en: `Every Monday morning: ${corpo}` })
}

/** L'avviso dopo «Approva»: cosa è successo, detto per quello che è. Mai «mandata»: non parte niente. */
export function approvata(azione: string, n: number, nome: string): string {
  if (azione === 'posta.bozza') return n === 1
    ? du({ it: 'Una bozza nella casella.', en: 'One draft in your mailbox.' })
    : du({ it: `${n} bozze nella casella.`, en: `${n} drafts in your mailbox.` })
  if (azione === 'agenda.aggiungi') return n === 1
    ? du({ it: 'Un evento in agenda.', en: 'One event in your calendar.' })
    : du({ it: `${n} eventi in agenda.`, en: `${n} events in your calendar.` })
  if (azione === 'nota.crea') return t('La nota è in Note.')
  return du({ it: `Salvato: ${nome}`, en: `Saved: ${nome}` })
}
