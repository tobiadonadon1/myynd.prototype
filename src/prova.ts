// Le frasi della prova sugli ultimi 30 giorni e del vassoio (P6).
//
// Pure: una data e dei numeri dentro, una frase nella lingua dell'app fuori.
// Intere invece che a pezzi, così l'inglese mette le parole nel suo ordine.
// Nessuna lineetta: il separatore è « · ».

import { lingua, loc, t } from './lingua.ts'
import type { RiassuntoProva } from './api.ts'

const en = () => lingua() === 'en'

/** «14 set», «14 Sep». */
export function data(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' }).replace(/\bSept\b/, 'Sep').replace(/\.$/, '')
}

/** «all'8», «al 14»: l'articolo che vuole il giorno in italiano. */
function alGiorno(iso: string): string {
  const g = new Date(iso).getDate()
  return `${g === 1 || g === 8 || g === 11 ? "all'" : 'al '}${data(iso)}`
}

function giorni(date: string[]): string {
  const d = date.map(x => new Date(x)).filter(x => Number.isFinite(x.getTime()))
  const stessoMese = d.every(x => x.getMonth() === d[0]?.getMonth())
  const pezzi = d.map((x, i) => stessoMese && i < d.length - 1 ? String(x.getDate()) : data(x.toISOString()))
  if (en()) return pezzi.length > 1 ? `${pezzi.slice(0, -1).join(', ')} and ${pezzi[pezzi.length - 1]}` : pezzi[0] ?? ''
  const conIl = pezzi.map(p => `il ${p}`)
  return conIl.length > 1 ? `${conIl.slice(0, -1).join(', ')} e ${conIl[conIl.length - 1]}` : conIl[0] ?? ''
}

/** Le due lingue della stessa frase: l'italiano è la sorgente, l'inglese la sua metà. */
const du = (x: { it: string; en: string }) => en() ? x.en : x.it

export const frasiProva = {
  giuste: (g: number, n: number) => du({ it: `${g} su ${n} giuste`, en: `${g} of ${n} right` }),
  poche: (n: number) => n === 0
    ? t('Ancora pochi risultati per giudicare')
    : du({ it: `${n} ${n === 1 ? 'risultato' : 'risultati'}: ancora pochi per giudicare`, en: `${n} ${n === 1 ? 'result' : 'results'}: not enough to judge yet` }),
  letti: (n: number) => du({
    it: `Ha letto ${n} ${n === 1 ? 'documento' : 'documenti'} e non avrebbe fatto niente.`,
    en: `It read ${n} ${n === 1 ? 'document' : 'documents'} and would have done nothing.`
  }),
  fermata: (d: string) => du({ it: `Fermata al limite della prova, arrivata ${alGiorno(d)}.`, en: `Stopped at the practice limit, up to ${data(d)}.` }),
  inCoda: (nome: string) => du({ it: `In coda dopo «${nome}»`, en: `Queued after “${nome}”` }),
  inProvaFino: (d: string) => du({ it: `In prova fino ${alGiorno(d)}`, en: `In practice until ${data(d)}` }),
  anche: (date: string[]) => {
    if (!date.length) return ''
    if (date.length > 3) return du({ it: `anche altri ${date.length} giorni`, en: `also ${date.length} more days` })
    return du({ it: `anche ${giorni(date)}`, en: `also ${giorni(date)}` })
  },
  altri: (n: number) => du({ it: `e altri ${n}`, en: `and ${n} more` }),
  risposto: (d: string) => du({ it: `Hai risposto il ${data(d)}`, en: `You replied on ${data(d)}` }),
  fatta: (d: string) => du({ it: `L'hai segnata fatta il ${data(d)}`, en: `You marked it done on ${data(d)}` }),
  riga: (d: string) => du({ it: `Ne hai fatto una riga il ${data(d)}`, en: `You made it a row on ${data(d)}` }),
  scartata: (d: string) => du({ it: `L'hai scartata il ${data(d)}`, en: `You dismissed it on ${data(d)}` }),
  giaRisposto: (d: string) => du({ it: `Hai già risposto il ${data(d)}.`, en: `You already replied on ${data(d)}.` }),
  neProvo: (n: number) => n === 1 ? du({ it: 'Ne provo una…', en: 'Testing one…' }) : du({ it: `Ne provo ${n}…`, en: `Testing ${n}…` }),
  avrebbeChiesto: (q: string) => du({ it: `Avrebbe chiesto: ${q}`, en: `Would have asked: ${q}` }),
  /** La riga del conto nell'intestazione della prova. */
  conto: (g: number, n: number, tue: number) => [
    frasiProva.giuste(g, n),
    du({ it: 'ultimi 30 giorni', en: 'last 30 days' }),
    ...(tue ? [du({ it: `${tue} ${tue === 1 ? "l'hai decisa" : 'le hai decise'} tu`, en: `${tue} decided by you` })] : [])
  ].join(' · '),
  /** Il conto sotto il nome, nell'editor. */
  contoEditor: (g: number, n: number) => du({ it: `${g} su ${n} giuste negli ultimi 30 giorni`, en: `${g} of ${n} right in the last 30 days` }),
  /** Il conto sulla scheda di un suggerimento. */
  contoIdea: (g: number, n: number) => du({ it: `${g} su ${n} giuste nella prova`, en: `${g} of ${n} right in practice` })
}

export type Intestazione = {
  testo: string
  /** Il primo pezzo (fino a « · ») è verde: una prova passata. */
  verde: boolean
  bottone: 'riprova' | 'di nuovo' | 'fonti' | 'collega' | null
  /** La riga sotto: quello che nel passato non si è potuto rifare. */
  seconda: string | null
}

const PARZIALE: Record<string, string> = {
  agenda: 'Senza agenda: nel passato non si legge.',
  codice: 'Senza Claude Code: nel passato non gira.'
}

/** Una riga sola per ogni stato della prova, vera. */
export function intestazione(p: RiassuntoProva): Intestazione {
  const seconda = p.parziale.length ? p.parziale.map(x => t(PARZIALE[x] ?? x)).join(' · ') : null
  const riga = (testo: string, bottone: Intestazione['bottone'] = null, verde = false): Intestazione => ({ testo, verde, bottone, seconda })
  // gli stati del server hanno spazi: qui si confrontano con i trattini bassi
  switch (p.stato.replace(/ /g, '_')) {
    case 'in_coda': return riga(p.davanti ? frasiProva.inCoda(p.davanti) : t('La provo sugli ultimi 30 giorni…'))
    case 'in_corso': return riga(t('La provo sugli ultimi 30 giorni…'))
    case 'senza_modello': return riga(t('Collega un modello per provarla.'), 'fonti')
    case 'scollegata': return riga(t('manca una connessione'), 'collega')
    case 'basta_per_oggi': return riga(t('Sei prove oggi. La prossima domani.'))
    case 'fermata': return riga(p.al ? frasiProva.fermata(p.al) : t('La prova non è riuscita.'), 'riprova')
    case 'tetto': return riga(t('Fermata al tetto di spesa di oggi.'))
    case 'occupato': return riga(t('Fermata: il tuo account Claude è occupato.'), 'riprova')
    case 'interrotta': return riga(t('Interrotta: Myynd si è chiuso.'), 'riprova')
    case 'guaio': return riga(t('La prova non è riuscita.'), 'riprova')
    case 'annullata': return riga(t('Cambiata dopo questa prova.'), 'di nuovo')
  }
  if (p.cambiata) return riga(t('Cambiata dopo questa prova.'), 'di nuovo')
  if (!p.risultati) {
    return riga(p.documenti ? frasiProva.letti(p.documenti) : t('Negli ultimi 30 giorni non ha trovato niente da leggere.'))
  }
  if (p.esito === 'poco' || p.giudicati < 5) return riga(frasiProva.poche(p.giudicati))
  return riga(frasiProva.conto(p.giusti, p.giudicati, p.tue), null, p.esito === 'pronta')
}
