// Mentre non c'eri, dalla parte della pagina: le regole piccole, senza React.
//
// Il server conta (`server/via.ts`); qui si decide come si dice, quali cose
// fatte meritano una riga in cima, e in che stato sta ogni cosa che Myynd ha
// prodotto. Gli stati sono tre, e la pagina ne mostra uno per volta:
//
// — `te`: aspetta lui, con un gesto solo (una domanda, un sì, una bozza da mandare);
// — `nuovo`: fatta e consegnata, e non ancora aperta: un pallino, e basta;
// — `visto`: fatta, consegnata, e aperta: si piega fuori dai blocchi.
//
//   node --test src/via.test.ts

import type { LavoroVia, Via } from './api'

export type GenereConto = 'letti' | 'bozze' | 'file' | 'notion' | 'daParte'
export type Conti = Record<GenereConto, number>
/** L'ordine in cui si dicono, che è anche quello in cui si legge il lavoro: prima quello che ha guardato, in fondo quello che ha lasciato. */
export const ORDINE_CONTI: readonly GenereConto[] = ['letti', 'bozze', 'file', 'notion', 'daParte']

/** Quante cose fatte stanno in cima, una riga ciascuna. */
export const IN_CIMA = 3

/**
 * I conti della frase. Bozze sono le risposte e i testi pronti da rileggere:
 * per lui sono la stessa cosa, una cosa scritta che aspetta il suo occhio.
 */
export function contiVia(v: Pick<Via, 'letti' | 'daParte' | 'lavori'> | null | undefined): Conti {
  const c: Conti = { letti: 0, bozze: 0, file: 0, notion: 0, daParte: 0 }
  if (!v) return c
  c.letti = Math.max(0, v.letti | 0)
  c.daParte = Math.max(0, v.daParte | 0)
  for (const x of v.lavori) {
    if (x.genere === 'file') c.file++
    else if (x.genere === 'notion') c.notion++
    else c.bozze++
  }
  return c
}

export const qualcosa = (c: Conti): boolean => ORDINE_CONTI.some(k => c[k] > 0)

/** Un pezzo della frase: testo semplice, o un conto che si apre. */
export type Pezzo = { testo: string; conto?: GenereConto }

const PAROLE: Record<'it' | 'en', Record<GenereConto, (n: number) => string>> = {
  en: {
    letti: n => `read ${n} ${n === 1 ? 'thing' : 'things'}`,
    bozze: n => `prepared ${n} ${n === 1 ? 'draft' : 'drafts'}`,
    file: n => `wrote ${n} ${n === 1 ? 'file' : 'files'}`,
    notion: n => `updated ${n} Notion ${n === 1 ? 'page' : 'pages'}`,
    daParte: n => `set aside ${n}`
  },
  it: {
    letti: n => `letto ${n} ${n === 1 ? 'cosa' : 'cose'}`,
    bozze: n => `preparato ${n} ${n === 1 ? 'bozza' : 'bozze'}`,
    file: n => `scritto ${n} file`,
    notion: n => `aggiornato ${n} ${n === 1 ? 'pagina' : 'pagine'} di Notion`,
    daParte: n => `messo da parte ${n}`
  }
}

/**
 * La frase sola, a pezzi: «I read 41 things, prepared 2 drafts, wrote 1 file
 * and set aside 29.» Ogni conto è un pezzo suo, perché si apre; i conti a
 * zero non si dicono. Senza niente, nessun pezzo: la carta non c'è.
 */
export function frase(c: Conti, l: string): Pezzo[] {
  const lingua = l === 'it' ? 'it' : 'en'
  const conti = ORDINE_CONTI.filter(k => c[k] > 0)
  if (!conti.length) return []
  const fuori: Pezzo[] = [{ testo: lingua === 'it' ? 'Ho ' : 'I ' }]
  conti.forEach((k, i) => {
    if (i > 0) fuori.push({ testo: i === conti.length - 1 ? (lingua === 'it' ? ' e ' : ' and ') : ', ' })
    fuori.push({ testo: PAROLE[lingua][k](c[k]), conto: k })
  })
  fuori.push({ testo: '.' })
  return fuori
}

/**
 * Le cose fatte da aprire, in cima: quelle che non ha ancora visto, la più
 * recente prima, al più tre. Quelle che aspettano il suo sì stanno nei
 * blocchi, con il loro gesto: qui sarebbero la stessa riga due volte.
 */
export function inCima(v: Pick<Via, 'lavori'> | null | undefined, giaViste: ReadonlySet<string> = new Set(), max = IN_CIMA): LavoroVia[] {
  if (!v) return []
  return v.lavori.filter(x => !x.visto && !x.aspetta && !giaViste.has(x.id)).slice(0, max)
}

/** Le cose fatte di un genere, per l'elenco dietro un conto. */
export function lavoriDi(v: Pick<Via, 'lavori'> | null | undefined, conto: GenereConto): LavoroVia[] {
  if (!v) return []
  if (conto === 'file') return v.lavori.filter(x => x.genere === 'file')
  if (conto === 'notion') return v.lavori.filter(x => x.genere === 'notion')
  if (conto === 'bozze') return v.lavori.filter(x => x.genere !== 'file' && x.genere !== 'notion')
  return []
}

/** Il perché di una cosa messa da parte, in italiano: la pagina lo passa da `t()`. */
export const RAGIONI: Record<string, string> = {
  in_serie: 'Posta in serie: newsletter o avvisi automatici.',
  letta: 'L’avevi già letta, e non chiedeva niente.',
  sconosciuto: 'Da un mittente che non conosci.',
  archiviato: 'Mittente che archivi sempre.',
  tacere: 'Mittente che mi hai detto di tacere.',
  regola: 'Una regola che mi hai insegnato.',
  non_tua: 'Non era una cosa tua.',
  niente_da_fare: 'Letta: niente da fare per te.',
  non_regge: 'Una carta che non reggeva alla verifica.',
  fuori_obiettivo: 'Fuori dagli obiettivi dei tuoi progetti.',
  meno_urgente: 'Meno urgente delle altre di oggi.'
}

// — i tre stati —

/** Quello che serve a decidere lo stato di una riga: un sottoinsieme di `Compito`. */
export type LavoroInRiga = {
  stato: string
  modo?: string | null
  guaio?: string | null
  consegna?: unknown | null
  email?: { casella?: { stato?: string } | null } | null
  proposta?: unknown | null
  prova?: { esito?: string } | null
  visto?: string | null
}

export type StatoLavoro = 'te' | 'nuovo' | 'visto'

/** Consegnata da qualche parte: un file, la sua casella. */
export const consegnata = (c: LavoroInRiga): boolean => !!c.consegna || c.email?.casella?.stato === 'salvata'

/**
 * Lo stato di una riga che Myynd ha prodotto, o null se la riga è sua e
 * Myynd non c'entra (o ci sta ancora lavorando).
 *
 * Aspetta lui ogni cosa ferma: una domanda, un blocco, una prova non passata,
 * una proposta da approvare, un testo pronto che non è andato da nessuna
 * parte. Una cosa consegnata è fatta: nuova finché non la apre, vista dopo
 * (`vistaOra`: aperta in questa visita, prima che la lista lo sappia).
 */
export function statoLavoro(c: LavoroInRiga, bloccata = false, vistaOra = false): StatoLavoro | null {
  if (c.stato === 'chiede') return 'te'
  if (c.stato === 'aperto') return bloccata ? 'te' : null
  if (c.stato !== 'pronto') return null
  if (c.prova?.esito === 'fail' || c.proposta || !consegnata(c)) return 'te'
  return c.visto || vistaOra ? 'visto' : 'nuovo'
}

/**
 * I blocchi, con le cose viste piegate fuori.
 *
 * Una riga fatta e già aperta lascia il blocco: si piega in `piegate`, che il
 * blocco dice in una riga quieta («2 fatte») e apre a richiesta. Un blocco che
 * resta senza righe se ne va: tutto quello che aveva era già visto. Le righe
 * aperte in questa visita restano dove sono fino alla prossima: piegarle
 * sotto il dito sarebbe una riga che scappa.
 */
export function piegaViste<B extends { righe: unknown[] }>(
  blocchi: readonly B[],
  vista: (r: B['righe'][number]) => boolean
): (B & { piegate: B['righe'] })[] {
  const fuori: (B & { piegate: B['righe'] })[] = []
  for (const b of blocchi) {
    const piegate = b.righe.filter(vista)
    if (!piegate.length) { fuori.push({ ...b, piegate }); continue }
    const righe = b.righe.filter(r => !vista(r))
    if (!righe.length) continue
    fuori.push({ ...b, righe, piegate })
  }
  return fuori
}
