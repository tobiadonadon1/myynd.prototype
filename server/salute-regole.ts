// Le regole della salute delle fonti, senza niente intorno.
//
// Qui si decide, a numeri, quando un guaio si mostra, com'è andata una
// giornata, quando una fonte che tace è un fatto da dire e come si conta il
// traguardo: «almeno 29 giorni su 30 con ogni fonte letta per bene». Nessun
// database, nessuna rete, nessun orologio: chi chiama passa i numeri, e le
// prove possono provare ogni caso e il suo contrario.

import type { Rimedio } from './connettori/guaio.ts'

/** Un guaio passeggero si mostra dopo tre letture fallite contate. */
export const FILA_VISIBILE = 3
/** Due letture fallite più vicine di così contano una volta: il giro dopo un risveglio non raddoppia. */
export const SPAZIO_FILA_MS = 8 * 60_000
/** I guai passeggeri così presto dopo un risveglio non contano: la rete non è ancora tornata. */
export const DOPO_RISVEGLIO_MS = 2 * 60_000
/** Una giornata pulita può avere fino a due guai passeggeri, se poi la fonte si è ripresa (decisione 82). */
export const TRANSITORI_MAX = 2
/** λ·k > ln(100): meno di una possibilità su cento che k giorni vuoti siano un caso. */
export const SOGLIA_SILENZIO = 4.6
/** Un giorno vuoto solo non è mai un silenzio. */
export const SILENZIO_GIORNI_MIN = 2
/** Quanti giorni di storia si guardano per sapere il solito, e quanti ne servono almeno. */
export const STORIA_GIORNI = 14
export const STORIA_MIN = 7
/** Lo stesso, per le fonti che portano l'inventario intero. */
export const INVENTARIO_GIORNI = 7
export const INVENTARIO_MIN = 5
/** Il traguardo: giorni puliti su trenta. */
export const OBIETTIVO = 29
/** I motori: contano solo quando lavorano, e mai come un episodio. */
export const TESTE = new Set(['claude', 'openai'])
/** Fonti la cui lettura porta l'inventario intero; tutte le altre portano arrivi. */
export const INVENTARIO = new Set(['calendario', 'agendamac', 'note', 'x'])   // e 'granola' quando si legge dalla cache (lo decide chi chiama)

export type Verdetto = 'pulito' | 'muto' | 'guasto' | 'spento'

export type RigaGiorno = {
  giorno: string; fonte: string; letture: number; pulite: number; incomplete: number; guai: number; fila: number
  documenti: number; totale: number | null; sonda: string | null; rimedio: Rimedio | null; versione: string | null; verdetto: Verdetto | null
}

export type Sintesi = { puliti: number; misurati: number; obiettivo: number; muti: number; dopoAggiornamento: number; aperti: number }

/** Una causa che resta si mostra subito; una passeggera solo dopo tre letture fallite contate. */
export function visibile(ep: { rimedio: Rimedio | null; fila: number }): boolean {
  return ep.rimedio !== 'attendi' || ep.fila >= FILA_VISIBILE
}

/** Una lettura fallita conta se è la prima, o se la precedente contata è di almeno otto minuti prima. */
export function contata(ultimaContata: number | null, quando: number): boolean {
  return ultimaContata === null || quando - ultimaContata >= SPAZIO_FILA_MS
}

function verdettoTesta(r: RigaGiorno | null): Verdetto {
  if (!r) return 'spento'
  if (r.guai > 0) return 'guasto'
  if (r.pulite > 0) return 'pulito'
  return 'spento'
}

const duratura = (r: Rimedio | null) => r !== null && r !== 'attendi'

/**
 * Com'è andata una giornata chiusa, per una fonte o un motore.
 *
 * `ripreso` dice se la lettura dopo (anche il giorno dopo) è andata bene:
 * `null` quando non c'è ancora stata, e allora il giorno resta aperto.
 * `muto` è il silenzio già misurato da chi chiama.
 */
export function verdetto(r: RigaGiorno, o: { testa: boolean; ripreso: boolean | null; muto: boolean }): Verdetto | null {
  if (o.testa) return verdettoTesta(r)
  if (r.letture === 0 && r.sonda === null) return 'spento'
  // una causa che resta, anche se sistemata più tardi, ha fatto un giorno guasto
  if (duratura(r.rimedio)) return 'guasto'
  if (r.guai + r.incomplete > TRANSITORI_MAX) return 'guasto'
  if (r.fila > 0) {
    if (o.ripreso === false) return 'guasto'
    if (o.ripreso === null) return null
  }
  if (o.muto) return 'muto'
  return 'pulito'
}

/** Com'è messo oggi, o un giorno ancora aperto: quello che si sa finora. */
export function provvisorio(r: RigaGiorno | null, o: { testa: boolean; episodioVisibile: boolean }): Verdetto {
  if (o.testa) return verdettoTesta(r)
  if (!r || (r.letture === 0 && r.sonda === null)) return 'spento'
  if (duratura(r.rimedio) || r.guai + r.incomplete > TRANSITORI_MAX || o.episodioVisibile) return 'guasto'
  return 'pulito'
}

export function mediana(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Una fonte che porta arrivi tace da troppo?
 *
 * `storia`: gli arrivi dei giorni chiusi e misurati prima del silenzio (fino
 * a 14). `corsa`: quanti giorni chiusi e puliti di fila, fino a quello che si
 * chiude, con zero arrivi. Una fonte che di solito tace non tace mai troppo.
 */
export function silenzioArrivi(storia: number[], corsa: number): boolean {
  return storia.length >= STORIA_MIN && corsa >= SILENZIO_GIORNI_MIN && mediana(storia) * corsa > SOGLIA_SILENZIO
}

/**
 * Una fonte che porta l'inventario intero è rimasta quasi vuota?
 *
 * `storia`: il totale dei giorni chiusi prima (fino a 7) dove c'era. Zero
 * contro un solito di almeno cinque, o meno di un quinto del solito quando il
 * solito è almeno venti.
 */
export function silenzioInventario(totale: number | null, storia: number[]): boolean {
  if (storia.length < INVENTARIO_MIN || totale === null) return false
  const m = mediana(storia)
  return (totale === 0 && m >= 5) || (totale < 0.2 * m && m >= 20)
}

/**
 * Il conto dei giorni chiusi: misurati, puliti, e i perché accanto.
 *
 * Un giorno è misurato se almeno una riga non è spenta; pulito se nessuna è
 * guasta e nessuna aspetta ancora di essere decisa. Il silenzio non sporca un
 * giorno: si conta a parte, in `muti`. `dopoAggiornamento` sono i giorni
 * guasti solo perché un aggiornamento dell'app ha perso l'accesso al disco.
 */
export function sintesi(giorni: { giorno: string; righe: RigaGiorno[] }[]): Sintesi {
  const ordinati = [...giorni].sort((a, b) => a.giorno.localeCompare(b.giorno))
  const fuori: Sintesi = { puliti: 0, misurati: 0, obiettivo: OBIETTIVO, muti: 0, dopoAggiornamento: 0, aperti: 0 }
  /** La versione dell'ultimo giorno misurato, per fonte. */
  const versioni = new Map<string, string | null>()
  for (const g of ordinati) {
    const contano = g.righe.filter(r => r.verdetto !== 'spento')
    const aperto = g.righe.some(r => r.verdetto === null)
    if (aperto) fuori.aperti++
    if (contano.length) {
      fuori.misurati++
      const guaste = contano.filter(r => r.verdetto === 'guasto')
      if (!guaste.length && !aperto) fuori.puliti++
      if (contano.some(r => r.verdetto === 'muto')) fuori.muti++
      if (guaste.length && guaste.every(r => r.rimedio === 'permesso-disco'
        && versioni.has(r.fonte) && versioni.get(r.fonte) !== r.versione)) fuori.dopoAggiornamento++
    }
    for (const r of contano) versioni.set(r.fonte, r.versione)
  }
  return fuori
}
