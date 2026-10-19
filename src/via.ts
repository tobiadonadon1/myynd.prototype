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

import type { LavoroVia, NotteVia, Via } from './api'
import { blocchiFeed, type Blocco, type CompitoDaBlocco, type ProgettoDaBlocco, type RigaBlocco, type VoceDaBlocco } from './blocchi-feed.ts'

export type GenereConto = 'letti' | 'bozze' | 'file' | 'notion' | 'daParte'
export type Conti = Record<GenereConto, number>
/** L'ordine in cui si dicono, che è anche quello in cui si legge il lavoro: prima quello che ha guardato, in fondo quello che ha lasciato. */
export const ORDINE_CONTI: readonly GenereConto[] = ['letti', 'bozze', 'file', 'notion', 'daParte']

/** Quante cose fatte stanno in cima, una riga ciascuna. */
export const IN_CIMA = 3

/**
 * I conti della frase. Bozze sono le risposte e i testi pronti da rileggere:
 * per lui sono la stessa cosa, una cosa scritta che aspetta il suo occhio.
 * Il server li conta su tutto (`conti`): l'elenco `lavori` è tagliato, e
 * contare da lì diceva «100» dove erano centoventi.
 */
export function contiVia(v: Pick<Via, 'letti' | 'daParte' | 'lavori' | 'conti'> | null | undefined): Conti {
  const c: Conti = { letti: 0, bozze: 0, file: 0, notion: 0, daParte: 0 }
  if (!v) return c
  c.letti = Math.max(0, v.letti | 0)
  c.daParte = Math.max(0, v.daParte | 0)
  if (v.conti) return { ...c, bozze: v.conti.bozze, file: v.conti.file, notion: v.conti.notion }
  for (const x of v.lavori) {
    if (x.genere === 'file') c.file++
    else if (x.genere === 'notion') c.notion++
    else c.bozze++
  }
  return c
}

/**
 * I conti che sono cose fatte: una bozza, un file, una pagina. «If he doesn't
 * think they are relevant, why would you clutter my screen with a view of
 * something that is irrelevant? They should have just been read and set
 * aside» (19 ott 2026): leggere e mettere da parte non sono notizie. I due
 * conti restano nel server e nel punto; la carta non li dice.
 */
export const FATTI: readonly GenereConto[] = ['bozze', 'file', 'notion']

/** C'è una cosa fatta da dire: letto e messo da parte, da soli, non bastano a far nascere la carta. */
export const qualcosa = (c: Conti): boolean => FATTI.some(k => c[k] > 0)

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
 * La frase sola, a pezzi: «I prepared 2 drafts and wrote 1 file.» Solo le
 * cose fatte (`FATTI`): quante ne ha lette e messe da parte non si dice più
 * qui. Ogni conto è un pezzo suo, perché si apre; i conti a zero non si
 * dicono. Senza niente di fatto, nessun pezzo.
 */
export function frase(c: Conti, l: string): Pezzo[] {
  const lingua = l === 'it' ? 'it' : 'en'
  const conti = FATTI.filter(k => c[k] > 0)
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
  mandata?: unknown | null
  visto?: string | null
}

export type StatoLavoro = 'te' | 'nuovo' | 'visto'

/**
 * Consegnata e finita lì: un file, o una bozza già partita. Una bozza salvata
 * nella sua casella e non mandata aspetta lui finché non parte (o non la
 * butta): aprirla una volta non la fa «vista», e non si piega.
 */
export const consegnata = (c: LavoroInRiga): boolean => !!c.consegna || (!!c.email && !!c.mandata)

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
 * blocco dice in una riga quieta («2 fatte») e apre a richiesta. Si tolgono
 * prima del tetto delle righe (`COMPITI_IN_PAGINA`): piegate dopo, le viste
 * prendevano il posto di una carta che aspetta lui, che restava fuori dalla
 * pagina e dentro il conto. Un blocco che ha solo cose viste non c'è. Le
 * righe aperte in questa visita non sono «viste» qui (lo decide chi chiama):
 * piegarle sotto il dito sarebbe una riga che scappa.
 */
export function blocchiConViste<V extends VoceDaBlocco, C extends CompitoDaBlocco>(dati: {
  voci: V[]; compiti: C[]; progetti: ProgettoDaBlocco[]; nomeResto: string
  fermi?: ReadonlySet<string>; corrette?: ReadonlySet<string>; vuoti?: readonly string[]
}, vista: (c: C) => boolean): (Blocco<V, C> & { piegate: RigaBlocco<V, C>[] })[] {
  const viste = dati.compiti.filter(vista)
  const blocchi = blocchiFeed({ ...dati, compiti: dati.compiti.filter(c => !vista(c)) })
  if (!viste.length) return blocchi.map(b => ({ ...b, piegate: [] }))
  const piegati = blocchiFeed({ ...dati, voci: [], compiti: viste, vuoti: [], massimoCompiti: Number.MAX_SAFE_INTEGER })
  const per = new Map(piegati.map(b => [b.progetto, b.righe]))
  return blocchi.map(b => ({ ...b, piegate: (b.righe.length ? per.get(b.progetto) : undefined) ?? [] }))
}

/**
 * Le carte che aspettano lui e che i blocchi non mostrano: nella ricevuta, e
 * in nessun blocco (oltre il tetto delle righe). Il titolo le conta, quindi
 * la pagina le mostra, in una riga «altre N» che le apre sul posto.
 */
export function aspettanoFuori(
  blocchi: readonly { righe: readonly RigaBlocco<{ id: string }, { id: string }>[] }[],
  ricevuta: readonly { genere: string; id: string }[]
): string[] {
  const inPagina = new Set<string>()
  for (const b of blocchi) for (const r of b.righe) if (r.genere === 'compito') inPagina.add(r.compito.id)
  return ricevuta.filter(a => a.genere === 'carta' && !inPagina.has(a.id)).map(a => a.id)
}

/** Da piegare: fatta, consegnata e vista, ma non in questa visita. Lo stesso per il guscio e per la pagina. */
export const vistaDaPiegare = (c: LavoroInRiga & { id: string }, oraViste: { has(id: string): boolean }): boolean =>
  statoLavoro(c) === 'visto' && !oraViste.has(c.id)

// — la coda unica: inizio —

/** Perché una cosa è stata trattenuta, nelle parole che la carta usa. */
export type Trattenuta = 'mandato' | 'mese' | 'notte' | 'budget_progetto' | 'budget'
export type RigheNotte = {
  /** Aspettano il Mac: quante, e i tratti in cui dormiva. */
  mac: { n: number; buchi: { da: string; a: string }[]; titoli: string[] } | null
  /** Hanno perso la finestra, o la fonte è cambiata. */
  saltate: { n: number; titoli: string[] } | null
  /** Trattenute, contate per perché, nell'ordine in cui si dicono. */
  trattenute: { n: number; perche: [Trattenuta, number][]; titoli: string[] } | null
  /** La notte non aveva niente che valesse: si dice solo se non c'è niente di fatto. */
  niente: boolean
}

const ORDINE_TRATTENUTE: readonly Trattenuta[] = ['mandato', 'budget_progetto', 'mese', 'budget', 'notte']

/**
 * Le righe di quello che non è successo, sotto la frase: al più una per
 * genere, coi conti. «Niente da fare» solo quando è la verità intera: niente
 * fatto, niente che aspetta, niente trattenuto.
 */
export function righeNotte(n: NotteVia | null | undefined, c: Conti): RigheNotte {
  const vuote: RigheNotte = { mac: null, saltate: null, trattenute: null, niente: false }
  if (!n) return vuote
  const titoli = (xs: readonly { titolo: string }[]) => xs.map(x => x.titolo).filter(Boolean).slice(0, 5)
  const perche = new Map<Trattenuta, number>()
  for (const x of n.trattenute) {
    const k = (ORDINE_TRATTENUTE as readonly string[]).includes(x.motivo ?? '') ? x.motivo as Trattenuta : 'notte'
    perche.set(k, (perche.get(k) ?? 0) + 1)
  }
  const fatto = c.bozze + c.file + c.notion > 0
  return {
    mac: n.inAttesaDelMac.length ? { n: n.inAttesaDelMac.length, buchi: n.buchi.slice(0, 2), titoli: titoli(n.inAttesaDelMac) } : null,
    saltate: n.saltate.length ? { n: n.saltate.length, titoli: titoli(n.saltate) } : null,
    trattenute: n.trattenute.length ? { n: n.trattenute.length, perche: ORDINE_TRATTENUTE.filter(k => perche.has(k)).map(k => [k, perche.get(k)!] as [Trattenuta, number]), titoli: titoli(n.trattenute) } : null,
    niente: n.nienteDaFare && !fatto && !n.inAttesaDelMac.length && !n.saltate.length && !n.trattenute.length
  }
}

/**
 * C'è qualcosa da dire della notte: il Mac che dormiva, una finestra persa,
 * una cosa trattenuta. «Niente che valesse la pena» da solo non è una
 * notizia (19 ott 2026): si dice se la carta c'è per altro, non la fa nascere.
 */
export const qualcosaDellaNotte = (r: RigheNotte): boolean => !!(r.mac || r.saltate || r.trattenute)

// — la coda unica: fine —
