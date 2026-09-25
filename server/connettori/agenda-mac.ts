// Calendario del Mac, nell'indice: i calendari che Calendario ha già, senza
// incollare niente (P4).
//
// La vista della settimana legge già Calendario dal vivo (`agenda-apple.ts`);
// qui gli stessi eventi entrano nell'indice come quelli di un indirizzo iCal,
// così la prima pagina, le priorità e le risposte li vedono. Si legge e
// basta: niente si crea, niente si sposta. Un evento che arriva anche dal
// calendario collegato con l'indirizzo iCal (stesso uid, stesso inizio) non
// si scrive due volte. I calendari che non sono impegni di nessuno
// (compleanni, festività, i suggerimenti di Siri) restano fuori.

import * as apple from '../agenda-apple.ts'
import * as store from '../store.ts'
import type { Documento } from '../store.ts'
import { corpoEvento, type Evento } from './calendario.ts'
import { GuaioFonte } from './guaio.ts'

/** Quanto si aspetta Calendario: la prima volta macOS chiede il permesso proprio qui. */
export const ATTESA = 60_000
/** Il tempo totale per leggere a pezzi quando la chiamata intera non risponde. */
export const ATTESA_A_PEZZI = 120_000
const PEZZO_GIORNI = 30
export const GIORNI_AVANTI = 180

/** I calendari che non sono impegni: si saltano per nome, in inglese e in italiano. */
export const CALENDARI_SALTATI = ['birthdays', 'compleanni', 'siri suggestions', 'suggerimenti di siri', 'scheduled reminders', 'promemoria programmati']
export function calendarioSaltato(nome: string): boolean {
  const n = nome.trim().toLowerCase()
  return CALENDARI_SALTATI.includes(n) || /holidays|festività/i.test(n)
}

/**
 * Se questo giro legge Calendario del Mac.
 *
 * La prima lettura sì, ma da un giro di sottofondo solo con Calendario già
 * aperto: una lettura che nessuno ha chiesto non apre mai un'app. Dopo, con
 * Calendario aperto e l'ultima lettura più vecchia di un'ora. Altrimenti si
 * salta, e la riga dice perché.
 */
export function daLeggere(o: { prima: boolean; sfondo: boolean; aperto: boolean; ultima: string | null; adesso?: number }): boolean {
  if (o.prima) return !o.sfondo || o.aperto
  const ultima = Date.parse(o.ultima ?? '')
  const vecchia = Number.isNaN(ultima) || (o.adesso ?? Date.now()) - ultima >= 60 * 60_000
  return o.aperto && vecchia
}

/** Un guaio di Calendario, detto con il suo rimedio. */
function guaio(e: unknown): GuaioFonte {
  const m = e instanceof Error ? e.message : String(e)
  if (m === apple.PERMESSO) return new GuaioFonte(apple.PERMESSO, 'guarda')
  if (m === apple.NON_C_E || m === apple.NON_QUI) return new GuaioFonte(apple.NON_C_E, 'apri-app')
  if (m === apple.NON_RISPONDE) return new GuaioFonte(apple.NON_RISPONDE, 'attendi')
  return new GuaioFonte(apple.NON_RISPONDE, 'guarda')
}

const uidDi = (id: string) => id.split('#')[0]!

/** Gli eventi tenuti: non nei calendari saltati, e non già letti dal calendario iCal. */
function tenuti(eventi: apple.EventoAgenda[], nomi: Map<string, string>): apple.EventoAgenda[] {
  const dallIcal = new Set(store.idsConPrefisso('calendario:'))
  const visti = new Set<string>()
  return eventi.filter(e => {
    if (calendarioSaltato(nomi.get(e.calendario) ?? '')) return false
    const k = `${uidDi(e.id)}:${Date.parse(e.inizio)}`
    if (dallIcal.has(`calendario:${k}`) || visti.has(k)) return false
    visti.add(k)
    return true
  })
}

async function nomiDeiCalendari(): Promise<Map<string, string>> {
  const lista = await apple.calendari(ATTESA)
  return new Map(lista.map(c => [c.id, c.nome]))
}

/** Prova: legge davvero, e dice quanti eventi e da quanti calendari. */
export async function prova(adesso = Date.now()): Promise<{ eventi: number; calendari: number }> {
  if (!apple.disponibile()) throw new GuaioFonte(apple.NON_C_E, 'apri-app')
  try {
    const nomi = await nomiDeiCalendari()
    const eventi = await apple.eventi(new Date(adesso - 90 * 86_400_000), new Date(adesso + GIORNI_AVANTI * 86_400_000), ATTESA)
    const buoni = tenuti(eventi, nomi)
    return { eventi: buoni.length, calendari: new Set(buoni.map(e => e.calendario)).size }
  } catch (e) { throw guaio(e) }
}

export type EsitoAgendaMac = { docs: Documento[]; calendari: number; troncato: boolean; dal: string; al: string }

/** Il documento di un evento, scritto come quelli del calendario iCal. */
function documento(e: apple.EventoAgenda): Documento {
  const inizio = new Date(e.inizio)
  const ev: Evento = {
    uid: uidDi(e.id), titolo: e.titolo, inizio, fine: new Date(e.fine), tuttoIlGiorno: e.tuttoIlGiorno,
    dove: e.luogo ?? '', note: e.note ?? '', organizzatore: '', invitati: [], stato: ''
  }
  return {
    id: `agendamac:${ev.uid}:${inizio.getTime()}`,
    fonte: 'agendamac',
    tipo: 'evento',
    titolo: e.titolo,
    corpo: corpoEvento(ev),
    autore: null,
    percorso: e.luogo || null,
    quando: inizio.toISOString(),
    gruppo: 'agenda'
  }
}

/**
 * Legge gli eventi fra `dal` e `al`, con una chiamata sola.
 *
 * Se Calendario non risponde in tempo (un calendario grande, o la finestra
 * del permesso aperta), si riprova a pezzi di trenta giorni, entro due
 * minuti in tutto: un pezzo che manca vuol dire `troncato`, e allora non si
 * cancella niente.
 */
export async function sincronizza(o: { dal: Date; al: Date }): Promise<EsitoAgendaMac> {
  if (!apple.disponibile()) throw new GuaioFonte(apple.NON_C_E, 'apri-app')
  let troncato = false
  let eventi: apple.EventoAgenda[] = []
  let nomi: Map<string, string>
  try { nomi = await nomiDeiCalendari() } catch (e) { throw guaio(e) }
  try {
    eventi = await apple.eventi(o.dal, o.al, ATTESA)
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    if (m !== apple.NON_RISPONDE) throw guaio(e)
    const fine = Date.now() + ATTESA_A_PEZZI
    for (let da = o.dal.getTime(); da < o.al.getTime(); da += PEZZO_GIORNI * 86_400_000) {
      const resta = fine - Date.now()
      if (resta <= 0) { troncato = true; break }
      const a = Math.min(o.al.getTime(), da + PEZZO_GIORNI * 86_400_000)
      try { eventi.push(...await apple.eventi(new Date(da), new Date(a), Math.min(ATTESA, resta))) }
      catch (err) {
        const mm = err instanceof Error ? err.message : String(err)
        if (mm === apple.PERMESSO) throw guaio(err)
        troncato = true
      }
    }
  }
  const buoni = tenuti(eventi, nomi)
  return {
    docs: buoni.map(documento),
    calendari: new Set(buoni.map(e => e.calendario)).size,
    troncato,
    dal: o.dal.toISOString(),
    al: o.al.toISOString()
  }
}
