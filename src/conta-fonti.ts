// I conti di quello che si è letto, detti con il loro nome (P4).
//
// «312 email, 42 eventi, 1.204 file», non «1.558 documenti». Qui si
// compongono le parole: il genere di ogni fonte lo decide `server/generi.ts`,
// i numeri si scrivono con il separatore della lingua (in italiano «1.204»,
// che `toLocaleString('it-IT')` da solo non mette sotto i diecimila). Niente
// React e niente rete: le prove lo guardano da Node.

import { lingua, loc } from './lingua.ts'
import { ORDINE_GENERI, perGenere, type Genere } from '../server/generi.ts'

const en = () => lingua() === 'en'

/** Un numero con il separatore delle migliaia della lingua, sempre. */
export function numero(n: number): string {
  return new Intl.NumberFormat(loc(), { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.max(0, Math.round(n)))
}

const NOMI: Record<Genere, { it: [string, string]; en: [string, string] }> = {
  email: { it: ['email', 'email'], en: ['email', 'emails'] },
  evento: { it: ['evento', 'eventi'], en: ['event', 'events'] },
  file: { it: ['file', 'file'], en: ['file', 'files'] },
  nota: { it: ['nota', 'note'], en: ['note', 'notes'] },
  pagina: { it: ['pagina', 'pagine'], en: ['page', 'pages'] },
  conversazione: { it: ['conversazione', 'conversazioni'], en: ['conversation', 'conversations'] },
  riunione: { it: ['riunione', 'riunioni'], en: ['meeting', 'meetings'] },
  documento: { it: ['documento', 'documenti'], en: ['document', 'documents'] }
}

/** «312 email», «1 evento», «1,204 files». */
export function contaGenere(g: Genere, n: number): string {
  const [uno, tanti] = NOMI[g][en() ? 'en' : 'it']
  return `${numero(n)} ${n === 1 ? uno : tanti}`
}

/**
 * La riga di quello che si è trovato: i generi con qualcosa dentro, prima
 * email, eventi e file, poi gli altri dal più grande, al massimo quattro.
 * Niente dentro: nessuna riga (mai «0 email», mai «niente»).
 */
export function trovato(conti: Partial<Record<Genere, number>> | null | undefined): string | null {
  const pieni = (Object.entries(conti ?? {}) as [Genere, number][]).filter(([, n]) => Number(n) > 0)
  if (!pieni.length) return null
  const posto = (g: Genere) => { const i = ORDINE_GENERI.indexOf(g); return i >= 0 ? i : ORDINE_GENERI.length }
  pieni.sort((a, b) => posto(a[0]) - posto(b[0]) || b[1] - a[1])
  return pieni.slice(0, 4).map(([g, n]) => contaGenere(g, n)).join(', ')
}

/**
 * La riga di quello che si è trovato mentre si guardano le righe della
 * lettura: le fonti la cui riga è ancora «In coda» non si contano. Il resto
 * della prima lettura può aver già letto la posta del Mac mentre la sua riga
 * aspetta ancora il turno, e lo schermo direbbe due cose diverse: «60 email»
 * sopra, «In coda» sotto. Senza i conti per fonte (un server più vecchio),
 * quelli per genere, com'erano.
 */
export function trovatoDurante(
  pagina: { trovato?: Partial<Record<Genere, number>>; perFonte?: Record<string, number> } | null | undefined,
  inCoda: string[]
): string | null {
  if (!pagina) return null
  if (!pagina.perFonte) return trovato(pagina.trovato)
  const fuori = new Set(inCoda)
  return trovato(perGenere(Object.entries(pagina.perFonte).filter(([f]) => !fuori.has(f)).map(([fonte, n]) => ({ fonte, n }))))
}

// — le conferme delle schede, una frase ciascuna —
//
// Le due lingue affiancate, `{ it, en }`: frasi con i numeri dentro, che nel
// dizionario non starebbero, e che così si leggono insieme.

const scegli = (x: { it: string; en: string }) => en() ? x.en : x.it
const n1 = (n: number, uno: string, tanti: string) => n === 1 ? uno : tanti

export const carta = {
  /** Posta: «Collegata: 312 email degli ultimi 90 giorni.» */
  posta: (n: number, giorni: number) => scegli({
    it: `Collegata: ${contaGenere('email', n)} degli ultimi ${numero(giorni)} giorni.`,
    en: `Connected: ${contaGenere('email', n)} from the last ${numero(giorni)} days.`
  }),
  /** Mail del Mac: «Collegata: 1.240 email degli ultimi 90 giorni, da 3 caselle.» */
  postaMac: (n: number, caselle: number, giorni = 90) => scegli({
    it: `Collegata: ${contaGenere('email', n)} degli ultimi ${numero(giorni)} giorni, da ${n1(caselle, 'una casella', `${numero(caselle)} caselle`)}.`,
    en: `Connected: ${contaGenere('email', n)} from the last ${numero(giorni)} days, from ${n1(caselle, '1 account', `${numero(caselle)} accounts`)}.`
  }),
  /** Calendario del Mac: «Collegata: 42 eventi da 5 calendari.» */
  agendaMac: (n: number, calendari: number) => scegli({
    it: `Collegata: ${contaGenere('evento', n)} da ${numero(calendari)} ${n1(calendari, 'calendario', 'calendari')}.`,
    en: `Connected: ${contaGenere('evento', n)} from ${numero(calendari)} ${n1(calendari, 'calendar', 'calendars')}.`
  }),
  notion: (n: number) => scegli({ it: `Collegata: ${contaGenere('pagina', n)}.`, en: `Connected: ${contaGenere('pagina', n)}.` }),
  slack: (n: number, oltre = false) => oltre
    ? scegli({ it: `Collegata: più di ${numero(n)} canali.`, en: `Connected: more than ${numero(n)} channels.` })
    : scegli({ it: `Collegata: ${numero(n)} ${n1(n, 'canale', 'canali')}.`, en: `Connected: ${numero(n)} ${n1(n, 'channel', 'channels')}.` }),
  note: (n: number) => scegli({ it: `Collegata: ${contaGenere('nota', n)}.`, en: `Connected: ${contaGenere('nota', n)}.` }),
  conversazioni: (n: number) => scegli({ it: `Collegata: ${contaGenere('conversazione', n)}.`, en: `Connected: ${contaGenere('conversazione', n)}.` }),
  /** Il Mac intero, o le cartelle scelte, sempre in sola lettura. */
  desktop: (o: { tutto: boolean; cartelle: number; mac: boolean }) => o.tutto
    ? scegli({ it: `Collegata: tutto il ${o.mac ? 'Mac' : 'PC'}, in sola lettura.`, en: `Connected: your whole ${o.mac ? 'Mac' : 'PC'}, read only.` })
    : scegli({ it: `Collegata: ${numero(o.cartelle)} ${n1(o.cartelle, 'cartella', 'cartelle')}, in sola lettura.`, en: `Connected: ${numero(o.cartelle)} ${n1(o.cartelle, 'folder', 'folders')}, read only.` })
}

/** «400 di 3.000 letti finora». */
export function lettiFinora(letti: number, totale?: number): string {
  return typeof totale === 'number'
    ? scegli({ it: `${numero(letti)} di ${numero(totale)} letti finora`, en: `${numero(letti)} of ${numero(totale)} read so far` })
    : scegli({ it: `${numero(letti)} letti finora`, en: `${numero(letti)} read so far` })
}
