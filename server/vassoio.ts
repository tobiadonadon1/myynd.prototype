// Il vassoio di prova (P6): i primi quattordici giorni di un'automazione accesa.
//
// Gira dal vivo, sui documenti di adesso, ma quello che farebbe non va in lista:
// resta qui come risultato in attesa. Le bozze si scrivono da un lavoro loro,
// una per giro, nella stessa fila delle prove. Un dito su «Metti in lista» ne
// fa una riga vera, che da lì in poi si comporta come una nata dal vivo (il
// file, la bozza nella casella, la cosa dopo). I risultati che non sposta non
// si muovono da soli, nemmeno dopo i quattordici giorni.
//
// Questo modulo scrive: la prova statica di collaudo.ts non vale qui.

import * as store from './store.ts'
import * as chi from './chi.ts'
import * as compiti from './compiti.ts'
import * as claude from './claude.ts'
import * as automazioni from './automazioni.ts'
import * as collaudo from './collaudo.ts'
import * as ordine from './ordine.ts'
import * as voce from './voce.ts'
import * as lavoroDati from './lavoro-dati.ts'
import type { Stesa } from './stesura.ts'
import type { EsitoVista } from './collaudo.ts'

// la fila delle prove aspetta il suo lavoro dal vivo: glielo dice chi conosce compiti.ts
collaudo.registraOccupato(u => compiti.occupatoPer(u))

const IN_ATTESA = new Set(['senza bozza', 'da scrivere', 'scritta'])
export const VISTO = 'vassoio:visto'

export class Superata extends Error {
  codice = 'superata' as const
  quando: string
  constructor(quando: string) { super('Hai già risposto.'); this.quando = quando }
}

/** Il documento ha avuto nel frattempo una riga vera: il risultato è superato. */
function superato(e: store.RigaEsito): boolean {
  if (!e.doc) return false
  return store.docsConRiga([e.doc]).has(e.doc)
}

/** Una risposta sua nel filo, dopo che il risultato è nato. */
function rispostaDopo(e: store.RigaEsito): string | null {
  const d = e.doc ? store.documento(e.doc) : null
  if (!d?.filo) return null
  const r = store.stessoFilo(d.filo, [d.id], 50).filter(x => x.inviato && (x.quando ?? '') > e.creato)
    .sort((a, b) => (a.quando ?? '').localeCompare(b.quando ?? ''))[0]
  return r?.quando ?? null
}

/**
 * Un giro del vassoio, per la persona di adesso: al più una bozza, la più
 * vecchia da scrivere, solo se la fila è libera e lui non ha lavoro dal vivo.
 */
export async function giro(): Promise<boolean> {
  const utente = chi.adesso() ?? ''
  const e = store.daScrivereNelVassoio()
  if (!e) return false
  if (superato(e)) { store.aggiornaEsito(e.id, { stato: 'superata' }); return false }
  if (compiti.occupatoPer(utente)) return false
  const libera = collaudo.turno()
  if (!libera) return false
  try {
    const abort = new AbortController()
    const err = await collaudo.stendiEsito(e, {
      tipo: 'vassoio', prova: e.prova, al: null, signal: abort.signal,
      conto: { gettoni: 0, tetto: collaudo.PROVA_GETTONI, sforato: false }, parziale: new Set(),
      ancora: () => store.esito(e.id)?.stato === 'da scrivere'
    })
    if (err) console.warn(`myynd · vassoio · ${e.id}:`, err instanceof Error ? err.message : err)
    return !err
  } finally { libera() }
}

function nomeDi(id: string): string {
  const r = automazioni.ricette().find(a => a.id === id)
  return r ? automazioni.nella(r).nome : id
}

/** Quello che aspetta nel vassoio, per automazione, dal più nuovo. */
export function elenco(): { automazione: string; nome: string; esiti: EsitoVista[] }[] {
  const gruppi = new Map<string, EsitoVista[]>()
  for (const e of store.vassoioInAttesa()) {
    if (superato(e)) { store.aggiornaEsito(e.id, { stato: 'superata' }); continue }
    const perDocumento = !!automazioni.ricette().find(a => a.id === e.automazione)?.metti.perDocumento
    gruppi.set(e.automazione, [...(gruppi.get(e.automazione) ?? []), collaudo.vistaDiEsito(e, perDocumento)])
  }
  return [...gruppi].map(([automazione, esiti]) => ({ automazione, nome: nomeDi(automazione), esiti }))
}

/** La stesura come la scriverebbe `svolgiUno`, ricomposta dal risultato del vassoio. */
function stesaDa(e: store.RigaEsito): Stesa {
  const rev = e.revisione ? JSON.parse(e.revisione) as { esito?: string | null; problemi?: string[]; giri?: number; ipotesi?: string[]; domanda?: string | null } : {}
  const verdetto = rev.esito ? { esito: rev.esito, problemi: rev.problemi ?? [] } as unknown as Stesa['verdetto'] : null
  return {
    testo: e.bozza ?? '', fonti: e.fonti ? JSON.parse(e.fonti) : [], lette: [], fatti: [], verdetto,
    giri: rev.giri ?? 1, chiamate: 0, mossa: rev.domanda ? 'chiedi' : rev.ipotesi?.length ? 'presumi' : 'produci',
    genere: null, domanda: rev.domanda ?? '', visto: '', ipotesiProposta: rev.ipotesi?.[0] ?? null,
    eseguito: false, consegna: undefined, verificaDocumenti: undefined
  }
}

/** «Metti in lista»: una riga vera, una volta sola. Torna l'id della riga. */
export async function inLista(esitoId: string): Promise<string> {
  const e = store.esito(esitoId)
  if (!e) throw new Error('Non conosco questo risultato.')
  if (e.compito) return e.compito
  // (1) la risposta l'ha già data lui, o la fonte non è più quella giusta
  const risposto = e.stato === 'in lista' ? null : rispostaDopo(e)
  const concessione = e.attrezzi ? JSON.parse(e.attrezzi) as store.Concessione : null
  if (risposto || (e.doc && !claude.verificaFontiSelezione([e.doc], concessione, `${e.testo}\n${e.nota ?? ''}`))) {
    store.aggiornaEsito(e.id, { stato: 'superata' })
    throw new Superata(risposto ?? new Date().toISOString())
  }
  // (2) una volta sola
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  if (!store.prendiEsito(e.id, id)) {
    const ora = store.esito(e.id)
    if (ora?.compito) return ora.compito
    throw new Error('Questo risultato non è più nel vassoio.')
  }
  // (3) la riga, come la scriverebbe il giro dal vivo
  const quando = e.inLista ?? 'oggi'
  store.scriviCompito({
    id, testo: e.testo ?? '', nota: e.nota, quando, ordine: ordine.dopo(store.ultimoOrdine(quando)),
    origine: `auto:${e.automazione}`, doc: e.doc, attrezzi: concessione
  })
  // (4) quello che segue: la proposta pronta, la bozza scritta, o la bozza da scrivere
  const proposta = e.proposta ? JSON.parse(e.proposta) as { proposta: store.Proposta; riassunto: string } : null
  if (proposta) {
    store.proponi(id, proposta.proposta, proposta.riassunto)
    compiti.annunciaPronto(id)
  } else if (e.bozza && e.modo) {
    store.affidaCompito(id, e.modo)
    const riga = store.compito(id)!
    lavoroDati.registraAffido(riga, false)
    let v: voce.Voce | null = null
    try { v = voce.perRiga(riga) } catch { v = null }
    await compiti.dopoLaStesura(riga, stesaDa(e), null, { nota: riga.nota, voce: v, fermato: () => false })
  } else if (e.modo && e.modo !== 'io') {
    // il suo dito è il consenso: la bozza parte adesso
    compiti.affida(id, e.modo, false)
  }
  // (5) come una riga nata da lì
  store.registraAzione({ tipo: 'automazione', cosa: nomeDi(e.automazione), compito: id, esito: 'fatta', dettaglio: 'dal vassoio' })
  compiti.annunciaCambio()
  return id
}

/** «Non serve»: via dal vassoio, e conta come sbagliato. */
export function scarta(esitoId: string): void {
  const e = store.esito(esitoId)
  if (!e) throw new Error('Non conosco questo risultato.')
  if (e.compito) return
  store.aggiornaEsito(esitoId, { suo: 'sbagliato', stato: 'scartata' })
}

/** «Termina la prova»: da adesso le righe vanno in lista. */
export function dalVivo(automazione: string): void {
  store.chiudiVassoio(automazione)
}

export function visto(): void {
  store.segnaCursore(VISTO, new Date().toISOString())
}

/** I risultati in attesa nati dopo l'ultima volta che ha aperto la pagina. */
export function nonVisti(): number {
  const da = store.cursore(VISTO) ?? ''
  return store.vassoioInAttesa().filter(e => e.creato > da && IN_ATTESA.has(e.stato)).length
}

/** Quanti ne aspettano per un'automazione: la scheda lo sa. */
export function inAttesaDi(automazione: string): number {
  return store.vassoioInAttesa().filter(e => e.automazione === automazione).length
}
