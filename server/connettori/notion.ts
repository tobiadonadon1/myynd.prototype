// Notion. Serve un token di integrazione interna (ntn_…) e le pagine devono
// essere condivise con l'integrazione, altrimenti l'API non le vede.

import { Client } from '@notionhq/client'
import * as chi from '../chi.ts'
import type { ConfigNotion } from '../config.ts'
import * as store from '../store.ts'
import type { Documento } from '../store.ts'
import { daDove, segna, type Resto } from './ripresa.ts'

/** Quante pagine si rileggono per giro. Oltre, si riprende al giro dopo. */
const TETTO = 800

/**
 * Il cliente, da una parte sola, così le prove possono metterne uno finto.
 *
 * Senza questo, provare che una pagina non toccata non viene riletta vorrebbe
 * dire un vero spazio Notion e una vera chiave — cioè non provarlo.
 */
let fabbrica: ((c: ConfigNotion) => Client) | null = null
export function usaCliente(f: ((c: ConfigNotion) => Client) | null) { fabbrica = f }
function cliente(c: ConfigNotion): Client {
  return fabbrica ? fabbrica(c) : new Client({ auth: c.token })
}

/**
 * Quando avevamo letto questa pagina l'ultima volta.
 *
 * È il perno di tutto il risparmio qui sotto. Notion dice per ogni pagina il
 * suo `last_edited_time`; se non si è mosso da quello che abbiamo in casa, i
 * blocchi sono gli stessi di sei ore fa e rileggerli è tempo buttato — non
 * poco: uno spazio da ottocento pagine sono decine di minuti di chiamate, ogni
 * sei ore, e per tutto quel tempo una lettura chiesta a mano si becca un 409
 * «ne sta già girando una».
 *
 * Un guaio nel leggere l'indice torna `null`, cioè «rileggila»: sbagliare per
 * eccesso qui costa una chiamata, sbagliare per difetto costa una pagina
 * vecchia tenuta per buona.
 */
function quandoLAvevamoLetta(id: string): string | null {
  try { return store.documento(id)?.quando ?? null } catch { return null }
}

function titolo(p: any): string {
  const props = p.properties ?? {}
  for (const v of Object.values<any>(props)) {
    if (v?.type === 'title' && Array.isArray(v.title) && v.title.length) {
      return v.title.map((t: any) => t.plain_text).join('').trim() || '(senza titolo)'
    }
  }
  return '(senza titolo)'
}

/**
 * Notion concede circa tre richieste al secondo per integrazione, e oltre
 * risponde 429. Prima non c'era nessun freno: una pagina con molti blocchi
 * annidati partiva a raffica, il 429 finiva nel `catch` che segna la pagina
 * come letta a metà, e la pagina veniva saltata — in silenzio, a ogni giro.
 * Qui si tiene un passo minimo fra le chiamate e, sul 429, si aspetta quanto
 * dice Notion e si riprova una volta.
 */
// per persona: il limite di Notion è per token di integrazione, cioè per
// conto. Con un contatore solo, N persone che leggono Notion si rallentavano
// a vicenda per un limite che nessuna delle due stava raggiungendo.
const ultimaChiamata = new Map<string, number>()
const PASSO = 350

async function conCalma<T>(f: () => Promise<T>): Promise<T> {
  const di = chi.adesso() ?? ''
  const attesa = (ultimaChiamata.get(di) ?? 0) + PASSO - Date.now()
  if (attesa > 0) await new Promise(r => setTimeout(r, attesa))
  ultimaChiamata.set(di, Date.now())
  try {
    return await f()
  } catch (e) {
    const err = e as { status?: number; code?: string; headers?: Record<string, string> }
    if (err?.status !== 429 && err?.code !== 'rate_limited') throw e
    const dopo = Math.min(10, Number(err.headers?.['retry-after']) || 1)
    await new Promise(r => setTimeout(r, dopo * 1000))
    ultimaChiamata.set(di, Date.now())
    return await f()
  }
}

/** Appiattisce i blocchi di una pagina in testo semplice. */
async function testoPagina(notion: Client, pageId: string, profondita = 0): Promise<{ testo: string; completo: boolean }> {
  if (profondita > 2) return { testo: '', completo: true }
  let righe: string[] = []
  let completo = true
  let cursore: string | undefined
  do {
    let r
    try {
      r = await conCalma(() => notion.blocks.children.list({ block_id: pageId, start_cursor: cursore, page_size: 100 }))
    } catch {
      // pagina letta a metà: non deve sostituire una versione completa
      completo = false
      break
    }
    for (const b of r.results as any[]) {
      const t = b[b.type]
      const rt = t?.rich_text
      if (Array.isArray(rt) && rt.length) righe.push(rt.map((x: any) => x.plain_text).join(''))
      if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') {
        const dentro = await testoPagina(notion, b.id, profondita + 1)
        if (dentro.testo) righe.push(dentro.testo)
        if (!dentro.completo) completo = false
      }
    }
    cursore = r.has_more ? (r.next_cursor ?? undefined) : undefined
  } while (cursore)
  return { testo: righe.join('\n').trim(), completo }
}

export async function prova(c: ConfigNotion): Promise<{ ok: true; pagine: number } | { ok: false; errore: string }> {
  try {
    const notion = cliente(c)
    const r = await notion.search({ page_size: 5 })
    return { ok: true, pagine: r.results.length }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    if (/unauthorized|API token is invalid/i.test(m)) return { ok: false, errore: 'Token non valido.' }
    if (/restricted/i.test(m)) return { ok: false, errore: "L'integrazione non ha accesso a nessuna pagina." }
    return { ok: false, errore: m }
  }
}

/**
 * `visti` è la riga che impedisce a una lettura parziale di cancellare roba vera.
 *
 * Una pagina che si legge a metà si salta — giusto, e il commento più sotto lo
 * dice: «meglio tenere quella vecchia intera». Solo che saltarla la teneva
 * fuori da `docs`, e `docs` è esattamente l'elenco che `riconcilia` usa per
 * decidere chi è ancora vivo. Quindi la pagina vecchia e intera non veniva
 * tenuta affatto: veniva cancellata dall'indice, cioè l'esatto contrario di
 * quello che c'era scritto — e in silenzio, perché una pagina che sparisce
 * dall'indice non lascia nessuna traccia da nessuna parte.
 *
 * `visti` dice «questa esiste ancora, anche se stavolta non l'ho riletta». Da
 * quando si saltano anche le pagine non toccate, è la maggioranza di loro.
 */
export type EsitoNotion = {
  docs: Documento[]
  parziali: number
  interrotto: boolean
  visti: string[]
  /** Quante pagine erano identiche a quelle in casa e non si sono riaperte. */
  invariate: number
  /** Dove è arrivata questa lettura, e se è arrivata in fondo. */
  resto: Resto
}

export async function sincronizza(c: ConfigNotion): Promise<EsitoNotion> {
  const notion = cliente(c)
  const docs: Documento[] = []
  const visti: string[] = []
  let parziali = 0
  let invariate = 0

  /*
   * Si riparte da dove ci si era fermati.
   *
   * Il cursore che Notion dà è opaco e vale per la sua paginazione, non per
   * uno stato nostro: se sei ore dopo non gli piace più, lo dice con un errore
   * e si ricomincia dall'inizio — che è un giro sprecato, non un danno.
   *
   * `ripresa` è vero per tutto il giro quando siamo entrati a metà elenco, e
   * serve a una cosa sola ma importante: `visti` copre solo la coda dello
   * spazio, quindi **riconciliare qui cancellerebbe tutte le pagine
   * dell'inizio**. Un giro ripreso non è mai completo, per definizione.
   */
  const ripresa = daDove('notion')
  let cursore: string | undefined = ripresa ?? undefined
  let interrotto = !!ripresa
  let primoGiro = true

  do {
    let r: any
    try {
      r = await conCalma(() => notion.search({
        filter: { property: 'object', value: 'page' },
        start_cursor: cursore,
        page_size: 50
      }))
    } catch (e) {
      // un cursore vecchio che Notion non riconosce più non è un guaio da
      // raccontare: si butta e si ricomincia da capo al giro dopo
      if (primoGiro && cursore) {
        segna('notion', null)
        return { docs, parziali, interrotto: true, visti, invariate, resto: { aGiorno: false, letti: 0 } }
      }
      // un errore a metà elenco non deve buttare via quello che ho già
      return { docs, parziali, interrotto: true, visti, invariate, resto: { aGiorno: false, letti: visti.length } }
    }
    primoGiro = false
    for (const p of r.results as any[]) {
      if (p.object !== 'page') continue
      const id = `notion:${p.id}`
      // esiste: qualunque cosa succeda dopo, non è sparita da Notion
      visti.push(id)

      /*
       * La pagina non si è mossa: si lascia stare, e si conta come vista.
       *
       * Il confronto è fra istanti e non fra stringhe: Notion scrive
       * `2026-09-04T11:22:00.000Z` e noi riscriviamo quello che ci ha dato, ma
       * basta un giro di normalizzazione da qualche parte perché due scritture
       * dello stesso momento non combacino più — e allora il risparmio
       * sparisce senza che nessuno se ne accorga, perché tutto continua a
       * funzionare, solo lento come prima.
       */
      const mosso = p.last_edited_time ? Date.parse(p.last_edited_time) : NaN
      const nostro = Date.parse(quandoLAvevamoLetta(id) ?? '')
      if (!Number.isNaN(mosso) && !Number.isNaN(nostro) && mosso <= nostro) { invariate++; continue }

      let letto: { testo: string; completo: boolean }
      try {
        letto = await testoPagina(notion, p.id)
      } catch {
        parziali++
        continue
      }
      const corpo = letto.testo
      // una pagina letta a metà la salto: meglio tenere quella vecchia intera
      if (!corpo || !letto.completo) { if (corpo) parziali++; continue }
      docs.push({
        id,
        fonte: 'notion',
        tipo: 'pagina',
        titolo: titolo(p),
        corpo: corpo.slice(0, 20_000),
        autore: null,
        percorso: p.url ?? null,
        quando: p.last_edited_time ?? null,
        gruppo: 'note'
      })
      /*
       * Fermarsi al tetto è una lettura parziale, non una lettura finita — ma
       * adesso lascia un segno. Prima il giro dopo ricominciava dalla stessa
       * pagina e le ottocentouno in poi non le leggeva **nessun giro, mai**.
       *
       * Il segno è il cursore della pagina di elenco in cui ci si è fermati, non
       * di quella dopo: si rifanno cinquanta pagine già viste, che adesso
       * costano un confronto di date a testa invece di una lettura di blocchi.
       */
      if (docs.length >= TETTO) {
        segna('notion', (r.next_cursor as string | null) ?? null)
        return { docs, parziali, interrotto: true, visti, invariate, resto: { aGiorno: false, letti: visti.length } }
      }
    }
    cursore = r.has_more ? r.next_cursor : undefined
  } while (cursore)

  /*
   * In fondo davvero: il segno si toglie, e il giro dopo riparte dall'inizio.
   *
   * `aGiorno` e `interrotto` qui dicono due cose diverse, e nessuna delle due è
   * l'altra: arrivati in fondo non è rimasto niente indietro — quindi `aGiorno`
   * — ma se si era entrati a metà elenco, `visti` copre solo da lì in poi e
   * riconciliare cancellerebbe l'inizio dello spazio. Quello lo dice
   * `interrotto`, e resta vero fino al primo giro che parte da capo.
   */
  segna('notion', null)
  return {
    docs, parziali, visti, invariate,
    interrotto,
    resto: { aGiorno: true, letti: visti.length, restano: 0 }
  }
}
