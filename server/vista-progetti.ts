// La pagina dei Progetti: il succo che Myynd ha capito di ogni progetto, e le
// cartelle in cui lui lavora che non sono ancora un progetto.
//
// «I want it to have a gist of my projects» (ottobre 2026). Il quadro di ogni
// progetto (`quadro.ts`) c'era già, ma ne uscivano solo le carte del feed: il
// quadro intero non lo vedeva nessuno. Qui si legge e basta. Niente modello,
// niente git, niente rete: quello che c'è in `quadri.json` e nell'indice.
//
// Due regole:
//   · si legge soltanto: questa rotta non scrive niente, nemmeno un quadro;
//   · una cartella nuova si propone, non si fa mai progetto da sola: lo
//     diventa con un tocco suo (`aggiungiCartella`).

import { basename, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import * as store from './store.ts'
import * as progetti from './progetti.ts'
import * as quadro from './quadro.ts'
import { stessaCosa } from './priorita.ts'
import { senzaTrattini } from './testo.ts'
import { cartella } from './config.ts'
import * as regole from './regole-sue.ts'

/** Una cartella si propone se ci ha lavorato in questi giorni. */
export const GIORNI_SUGGERITI = 14
/** Quante cartelle proposte, al massimo: è una riga sotto, non un secondo elenco. */
export const SUGGERITI_MAX = 5
/** L'ordine in cui si dice cosa ha letto: le cose sue prima, poi il resto. */
export const ORDINE_LETTO = ['riferimento', 'memoria', 'cartelle', 'sessioni', 'posta', 'note', 'file', 'agenda', 'messaggi', 'sito', 'altro']

export type VistaProgetto = {
  id: string
  nome: string
  obiettivo: string
  priorita: progetti.Priorita | null
  /** Il succo in un paragrafo; vuoto se non l'ha ancora capito. */
  sintesi: string
  /** Quando l'ha capito l'ultima volta, o null se non c'è ancora un quadro. */
  capito: string | null
  /** L'ultima volta che il progetto si è mosso: il materiale più recente. */
  ultima: string | null
  /** La mossa più forte che ha in mente, se ce n'è una ancora aperta. */
  mossa: { titolo: string; testo: string } | null
  traguardo: string
  /** Cosa ha letto, per genere, nell'ordine di `ORDINE_LETTO`. */
  letto: { tipo: string; quanti: number }[]
}

/** `dove`: la cartella che la contiene, con la casa scritta «~», per riconoscerla a colpo d'occhio. */
export type Suggerito = { nome: string; percorso: string; dove: string; ultima: string }

/**
 * Le prime frasi di un testo, entro un tetto: il succo dei quadri di prima,
 * che una sintesi non ce l'hanno e hanno `stato` (due o tre frasi).
 */
export function primeFrasi(testo: string, frasi = 3, tetto = 420): string {
  return testo.trim() ? quadro.tagliaAFrase(testo, tetto, frasi) : ''
}

/** Il succo di un quadro: la sintesi se l'ha scritta, sennò le prime frasi di dove sta. */
export function succo(q: Pick<quadro.Quadro, 'sintesi' | 'stato'> | undefined): string {
  if (!q) return ''
  return senzaTrattini(q.sintesi?.trim() || primeFrasi(q.stato ?? ''))
}

/**
 * La mossa da dire come prossimo passo: la più forte, fuori quelle che sul
 * feed lui ha già preso, scartato o lasciato scadere (lì ha già risposto).
 */
export function prossimaMossa(q: Pick<quadro.Quadro, 'mosse'> | undefined, decise: readonly string[], alto: boolean): quadro.Mossa | null {
  if (!q?.mosse?.length) return null
  const aperte = q.mosse.filter(m => !decise.some(t => t === m.titolo || stessaCosa(t, m.titolo)))
  return aperte.sort((a, b) => quadro.punteggio(b, alto) - quadro.punteggio(a, alto))[0] ?? null
}

/** Cosa ha letto, da un conteggio per genere a una fila ordinata, senza gli zeri. */
export function lettoInFila(letto: Record<string, number> | undefined): { tipo: string; quanti: number }[] {
  if (!letto) return []
  const tipi = Object.keys(letto).sort((a, b) => {
    const ia = ORDINE_LETTO.indexOf(a), ib = ORDINE_LETTO.indexOf(b)
    return (ia < 0 ? ORDINE_LETTO.length : ia) - (ib < 0 ? ORDINE_LETTO.length : ib)
  })
  return tipi.filter(t => (letto[t] ?? 0) > 0).map(t => ({ tipo: ORDINE_LETTO.includes(t) ? t : 'altro', quanti: letto[t]! }))
}

/**
 * Una cartella su cui si lavora davvero, e quando. Un repository vale per il
 * suo ultimo commit; una cartella senza storia solo se ha l'aria di un
 * progetto (un README o degli appunti: un ambiente Python o una cartella di
 * dati non lo sono) e per la sua data.
 */
export function lavoroNellaCartella(d: Pick<store.Documento, 'corpo' | 'quando'>): string | null {
  if (/Ultimi commit:\n\d{4}-\d{2}-\d{2}/.test(d.corpo)) return quadro.ultimaDellaCartella(d)
  return /(?:^|\n)(?:README|Appunti): \S/.test(d.corpo) ? d.quando ?? null : null
}

/**
 * Le cartelle di lavoro toccate negli ultimi `GIORNI_SUGGERITI` giorni
 * (`lavoroNellaCartella`) che non sono di nessun progetto, nemmeno di uno
 * chiuso (chiuderlo è già una risposta). Le più recenti prima, al massimo
 * `SUGGERITI_MAX`.
 */
export function suggeriti(docs: readonly store.Documento[], tutti: readonly Pick<progetti.Progetto, 'nome' | 'alias'>[], adesso = Date.now(), casaGrezza = homedir()): Suggerito[] {
  // «/var/…/T//casa» e «/var/…/T/casa» sono la stessa casa
  const casa = casaGrezza ? resolve(casaGrezza) : ''
  const soglia = adesso - GIORNI_SUGGERITI * 86_400_000
  const fuori: Suggerito[] = []
  for (const d of docs) {
    if (d.fonte !== 'lavoro' || !d.id.startsWith('lavoro:')) continue
    const percorso = d.id.slice('lavoro:'.length)
    const ultima = lavoroNellaCartella(d)
    if (!ultima || !(Date.parse(ultima) >= soglia)) continue
    const nome = basename(percorso)
    // un nome che `cartellaDel` non sa leggere (niente lettere latine né cifre) non tornerebbe mai suo: resterebbe proposto per sempre
    if (!/[a-z0-9]/i.test(nome.normalize('NFD'))) continue
    if (tutti.some(p => quadro.cartellaDel(p, nome, d.corpo))) continue
    const sopra = dirname(percorso)
    fuori.push({ nome, percorso, dove: casa && (sopra === casa || sopra.startsWith(`${casa}/`)) ? `~${sopra.slice(casa.length)}` : sopra, ultima })
  }
  return fuori.sort((a, b) => b.ultima.localeCompare(a.ultima)).slice(0, SUGGERITI_MAX)
}

/** Le cartelle proposte adesso, per la persona che chiede. */
export function suggeritiAdesso(adesso = Date.now()): Suggerito[] {
  return suggeriti(store.recenti(1200), progetti.elenco(), adesso)
}

/**
 * Una cartella proposta diventa un progetto, col nome della cartella: per la
 * stessa strada di «Nuovo progetto». Solo una cartella che è davvero fra le
 * proposte di adesso: un percorso qualunque non fa nascere niente.
 */
export function aggiungiCartella(percorso: string, adesso = Date.now()): progetti.Creazione | null {
  const s = suggeritiAdesso(adesso).find(x => x.percorso === percorso)
  if (!s) return null
  cache.delete(cartella())
  return progetti.crea({ nome: s.nome })
}

/** Quanto resta buona la pagina già fatta, se i quadri e i progetti non sono cambiati. */
export const CACHE_MS = 60_000
type Vista = { progetti: VistaProgetto[]; suggeriti: Suggerito[] }
/*
 * La pagina già fatta, per persona (la chiave è la sua cartella): rifarla
 * vuol dire scorrere milleduecento documenti per ogni progetto, e la si apre
 * spesso. Si rifà dopo un minuto, o subito se è cambiato `quadri.json` o un
 * progetto (uno nuovo, un nome, uno stato, una priorità).
 */
const cache = new Map<string, { quando: number; firma: string; dati: Vista }>()
/** Solo per le prove. */
export function svuotaCache() { cache.clear() }

function firma(): string {
  const ps = progetti.elenco().map(p => `${p.id}|${p.nome}|${p.alias.join(',')}|${p.stato}|${p.priorita ?? ''}|${p.aggiornato}`).join('\n')
  // e le sue regole: una nuova toglie il prossimo passo che ferma
  return `${quadro.quandoCambiatiIQuadri()}\n${ps}\n${regole.elenco().map(r => r.id).join(',')}`
}

/** La pagina intera: i progetti vivi col loro succo, e le cartelle proposte. */
export async function vista(adesso = Date.now()): Promise<Vista> {
  const chiave = cartella()
  const ora = firma()
  const gia = cache.get(chiave)
  if (gia && gia.firma === ora && Date.now() - gia.quando < CACHE_MS) return gia.dati
  const dati = fai(adesso)
  cache.set(chiave, { quando: Date.now(), firma: ora, dati })
  return dati
}

function fai(adesso: number): Vista {
  const quadri = quadro.leggiQuadri()
  const docs = store.recenti(1200)
  const fuori: VistaProgetto[] = []
  for (const p of quadro.progettiDaGuardare()) {
    const q = quadri[p.id]
    // solo la scelta dei documenti, senza metterli insieme: quando si è mosso
    // e, per i quadri di prima, cosa c'era da leggere
    const m = quadro.attivitaDi(p, docs, adesso)
    const decise = store.feedDelProgetto(p.id, 30).filter(v => v.stato !== 'aperto').map(v => v.titolo)
    // quello che lui ha detto «mai» non è il suo prossimo passo, anche se il quadro è di prima della regola
    const mossa = prossimaMossa(q && { mosse: q.mosse.filter(x => !quadro.fermataDaUnaRegola(p.id, x)) }, decise, progetti.eAlto(p))
    fuori.push({
      id: p.id, nome: p.nome,
      obiettivo: p.obiettivo || q?.obiettivo?.testo || '',
      priorita: p.priorita,
      sintesi: succo(q),
      capito: q?.quando ?? null,
      ultima: m.recente,
      mossa: mossa ? { titolo: mossa.titolo, testo: mossa.testo } : null,
      traguardo: q?.traguardo ?? '',
      letto: q ? lettoInFila(q.letto ?? m.letto) : []
    })
  }
  // quelli segnati alti davanti, poi i più mossi
  fuori.sort((a, b) => Number(b.priorita === 'alta') - Number(a.priorita === 'alta') || (b.ultima ?? '').localeCompare(a.ultima ?? ''))
  return { progetti: fuori, suggeriti: suggeriti(docs, progetti.elenco(), adesso) }
}
