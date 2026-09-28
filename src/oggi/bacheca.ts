// La bacheca: in quale corsia sta una carta, e in che ordine.
//
// Cinque corsie, e la regola è una sola: **chi sta aspettando chi**. Le tue
// sono tue. «In coda» sono di Myynd e aspettano il loro turno. «Al lavoro»
// ci sta lavorando adesso (e quando rilegge contro il suo «fatto», lo dice).
// «Aspetta te» vuol dire che senza di te non va avanti: una domanda, un
// blocco, o un lavoro che non ha passato il suo «fatto». «Fatte» sono quelle
// finite e controllate, più quelle chiuse oggi.
//
// Pura: niente React, niente rete. La legge `Tavola.tsx`, la provano le prove.

import type { Compito, PassoCompito, StatoTurno } from '../api'
import { giornoCompito } from './giorni.ts'

export const CORSIE = ['tue', 'coda', 'lavora', 'attende', 'fatte'] as const
export type Corsia = (typeof CORSIE)[number]

/** Le corsie in cui si può lasciare una carta trascinata: a te, o a Myynd. */
export const SI_LASCIA: readonly Corsia[] = ['tue', 'coda']

/**
 * La corsia di una carta viva.
 *
 * `passo` è l'ultimo passo che il filo ha detto per quella carta: c'è solo
 * mentre ci lavora davvero. Una carta affidata senza passo è in fila dietro
 * altre, o aspetta il suo turno: sta «In coda», non «Al lavoro», e non si
 * accende come se stesse girando.
 */
export function corsiaDi(c: Compito, passo?: PassoCompito | null): Corsia {
  if (c.stato === 'chiede') return 'attende'
  if (c.stato === 'pronto') return c.prova?.esito === 'fail' ? 'attende' : 'fatte'
  if (c.stato === 'delegato') return passo ? 'lavora' : 'coda'
  // una riga tornata sua con un guaio o un blocco aspetta lui, anche se era di Myynd
  if (c.guaio) return 'attende'
  if (c.stato === 'aperto' && c.modo && c.modo !== 'io') return 'coda'
  return 'tue'
}

/** Sta rileggendo il lavoro contro il suo «fatto»: è il momento del controllo. */
export function staControllando(passo?: PassoCompito | null): boolean {
  return passo?.passo === 'rileggo'
}

/** Quante carte chiuse oggi tiene «Fatte», sotto quelle da guardare. */
export const CHIUSE_OGGI_MAX = 8

const valore = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0)

/**
 * Le carte per corsia, ognuna nel suo ordine.
 *
 *   · le tue: prima quelle rimaste indietro e quelle di oggi, poi le alte,
 *     poi l'ordine della lista (che è il suo);
 *   · in coda: nell'ordine in cui le ha passate, la prima passata prima;
 *   · al lavoro: da quella partita prima;
 *   · aspetta te: dalla più recente, che è quella che ha appena chiesto;
 *   · fatte: prima quelle da guardare, dalla più recente, poi le chiuse oggi.
 */
export function perCorsia(
  compiti: Compito[],
  passi: Record<string, PassoCompito | undefined>,
  chiusi: Compito[],
  oggi: string
): Record<Corsia, Compito[]> {
  const out: Record<Corsia, Compito[]> = { tue: [], coda: [], lavora: [], attende: [], fatte: [] }
  for (const c of compiti) out[corsiaDi(c, passi[c.id])].push(c)
  const giorno = (c: Compito) => giornoCompito(c, oggi) ?? '9999-99-99'
  const prima = (c: Compito) => (giorno(c) <= oggi ? 0 : 1)
  out.tue.sort((a, b) =>
    prima(a) - prima(b)
    || (a.priorita === 'alta' ? 0 : a.priorita === 'bassa' ? 2 : 1) - (b.priorita === 'alta' ? 0 : b.priorita === 'bassa' ? 2 : 1)
    || giorno(a).localeCompare(giorno(b))
    || a.ordine.localeCompare(b.ordine))
  out.coda.sort((a, b) => valore(a.chiesto) - valore(b.chiesto) || a.ordine.localeCompare(b.ordine))
  out.lavora.sort((a, b) => valore(a.chiesto) - valore(b.chiesto))
  out.attende.sort((a, b) => valore(b.aggiornato) - valore(a.aggiornato))
  out.fatte.sort((a, b) => valore(b.aggiornato) - valore(a.aggiornato))
  const chiuseOggi = chiusi
    .filter(c => c.stato === 'fatto' && !!c.chiuso && localeDelGiorno(c.chiuso) === oggi)
    .sort((a, b) => valore(b.chiuso) - valore(a.chiuso))
    .slice(0, CHIUSE_OGGI_MAX)
  out.fatte.push(...chiuseOggi)
  return out
}

/** Il giorno locale di un istante ISO, «AAAA-MM-GG». */
export function localeDelGiorno(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Da dove viene la carta, in due o tre parole: la fonte vera, non il meccanismo. */
export type Provenienza = 'posta' | 'riunione' | 'tu' | 'myynd' | 'seguito' | 'automazione' | 'feed'
export function provenienza(c: Compito): Provenienza {
  if (c.origine === 'seguito') return 'seguito'
  if (c.origine === 'iniziativa' || c.origine === 'punto' || c.origine === 'proposta' || c.origine === 'turno') return 'myynd'
  if (c.origine?.startsWith('auto:')) return 'automazione'
  if (c.doc?.startsWith('posta') || c.doc?.startsWith('gmail') || c.doc?.startsWith('outlook')) return 'posta'
  if (c.doc?.startsWith('granola') || c.doc?.startsWith('riunion')) return 'riunione'
  if (c.origine === 'feed' || c.voce) return 'feed'
  return 'tu'
}

/** La cosa consegnata, in due parole: il file, la bozza nella casella, o niente di speciale. */
export function consegnata(c: Compito): { tipo: 'file' | 'casella' | 'nota' | 'codice' | 'riga'; nome?: string } {
  if (c.consegna?.app === 'File') return { tipo: 'file', nome: c.consegna.titolo }
  if (c.consegna) return { tipo: 'file', nome: c.consegna.titolo }
  if (c.email?.casella?.stato === 'salvata') return { tipo: 'casella' }
  return { tipo: 'riga' }
}

/** La riga di «Aspetta te»: la domanda, il blocco, o quello che non ha passato il suo «fatto». */
export function cosaAspetta(c: Compito): string {
  if (c.stato === 'chiede') {
    const q = c.chieste?.[0]?.domanda?.trim()
    if (q) return q
    const righe = (c.risultato ?? '').split('\n').map(r => r.trim()).filter(Boolean)
    return righe.find(r => r.endsWith('?')) ?? righe[righe.length - 1] ?? ''
  }
  if (c.guaio) return c.guaio
  if (c.prova?.esito === 'fail') return c.prova.perche
  return ''
}

/**
 * Quando parte una carta in coda (F2), come chiave da tradurre: la prossima,
 * stanotte, quando non ci sei, o la notte prima del suo giorno (`giorno`).
 * Se il turno è fermo, lo dice lei. Null se non c'è niente da dire.
 */
export function quandoParte(c: Compito, s: StatoTurno | null | undefined): { chiave: string; giorno?: string; prossima: boolean } | null {
  if (c.stato === 'delegato') return { chiave: 'Prossima', prossima: true }
  if (!s?.acceso || !s.motore) return { chiave: 'Aspetta il turno', prossima: false }
  if (s.pausaFino) return { chiave: 'In pausa', prossima: false }
  if (c.tocca === 'adesso') return s.avviate >= s.carte ? { chiave: 'Domani', prossima: false } : { chiave: 'Prossima', prossima: true }
  if (c.tocca === 'notte') return { chiave: 'Stanotte', prossima: false }
  if (c.tocca === 'via') return { chiave: 'Quando non ci sei', prossima: false }
  // la frase la compone `frasi.laNottePrima(giorno)`: la chiave qui non si legge
  if (c.tocca?.startsWith('prima:')) return { chiave: 'prima', giorno: c.tocca.slice(6), prossima: false }
  return null
}

/** Lo stato di una riga del quaderno, in una parola: chi aspetta chi. Null per una riga sua e basta. */
export type StatoRiga = { tipo: 'lavora' | 'coda' | 'pronta' | 'dafinire' | 'chiede' | 'ferma'; chiave: string; giorno?: string }
export function statoRiga(c: Compito, passo: PassoCompito | null | undefined, s: StatoTurno | null | undefined): StatoRiga | null {
  if (c.stato === 'chiede') return { tipo: 'chiede', chiave: 'ti chiede' }
  if (c.stato === 'pronto') return c.prova?.esito === 'fail' ? { tipo: 'dafinire', chiave: 'da finire' } : { tipo: 'pronta', chiave: 'pronta' }
  if (c.stato === 'delegato') return passo ? { tipo: 'lavora', chiave: 'Al lavoro' } : { tipo: 'coda', chiave: 'Prossima' }
  if (c.guaio) return { tipo: 'ferma', chiave: 'ferma' }
  if (c.stato === 'aperto' && c.modo && c.modo !== 'io') {
    const q = quandoParte(c, s)
    return q ? { tipo: 'coda', chiave: q.chiave, giorno: q.giorno } : { tipo: 'coda', chiave: 'Prossima' }
  }
  return null
}
