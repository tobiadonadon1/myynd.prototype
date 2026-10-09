// Il verso di un giro d'automazione (P6): dove vanno a finire le sue scritture.
//
// `faiInterna` e `faiPerDocumento` in automazioni.ts non scrivono più da sé:
// chiamano un `Verso`, negli stessi punti e nello stesso ordine di prima.
// `VERSO_LISTA` fa le chiamate di sempre (la lista, le bozze, gli annunci).
// La prova sul passato ne ha un secondo, qui sotto, che non scrive niente.
// Il vassoio di prova, che ne aveva un terzo, non c'è più: un ordine fisso
// acceso gira dal vivo da subito, e i risultati rimasti nel vassoio da prima
// si svuotano a mano (vassoio.ts).

import * as store from './store.ts'
import * as compiti from './compiti.ts'
import * as giudizi from './giudizi.ts'
import { giornoIn } from './fuso.ts'

export type RigaNuova = Parameters<typeof store.scriviCompito>[0]

export type Verso = {
  stato(id: string): store.StatoAutomazione | null
  vivo(id: string): boolean
  bozzeOggi(s: store.StatoAutomazione | null, adesso?: Date): number
  /** Le bozze fatte partire oggi da tutte le automazioni insieme: il budget si conta su queste. */
  bozzeDiOggi(adesso?: Date): number
  segnaBozza(id: string, giorno: string): number
  arrivati(dal: string, limite: number): store.Documento[]
  docsConRiga(ids: string[], origine: string): Set<string>
  attenzione(docs: store.Documento[], tetto: number): Promise<Map<string, giudizi.Giudizio>>
  /** Una riga nuova; `docs` sono i documenti che ha guardato (la lista la ignora). */
  riga(c: RigaNuova, docs: string[]): void
  affida(id: string, modo: string): void
  proponi(id: string, p: store.Proposta, riassunto: string): void
  girata(id: string, esito: string, guaio?: string, quanti?: number, risultato?: string, ricevuta?: { fatti?: number; perche?: store.PercheNiente }): void
  rimandata(id: string): void
  saltata(id: string): void
  azione(a: Parameters<typeof store.registraAzione>[0]): void
  annuncia(): void
}

/** Il giorno solare, come lo scrive il database. */
const giornoDi = (d: Date) => giornoIn(d)

function bozzeOggi(s: store.StatoAutomazione | null, adesso = new Date()): number {
  return s?.giorno === giornoDi(adesso) ? Number(s.bozze ?? 0) : 0
}

const idDa = (origine: string) => origine.startsWith('auto:') ? origine.slice('auto:'.length) : origine

/** Le righe già fatte, più i documenti rimasti ad aspettare nel vecchio vassoio di quella automazione. */
function giaFatti(ids: string[], origine: string): Set<string> {
  const fuori = store.docsConRiga(ids, origine)
  for (const d of store.docsNelVassoio(ids, idDa(origine))) fuori.add(d)
  return fuori
}

export const VERSO_LISTA: Verso = {
  stato: id => store.statoAutomazione(id),
  vivo: id => store.compitoVivoDa(id),
  bozzeOggi,
  bozzeDiOggi: adesso => Object.values(store.statiAutomazioni()).reduce((n, s) => n + bozzeOggi(s, adesso), 0),
  segnaBozza: (id, giorno) => store.segnaBozza(id, giorno),
  arrivati: (dal, limite) => store.appenaArrivati(dal, limite),
  // dopo il vassoio un documento che aspetta ancora là non si rifà in lista
  docsConRiga: giaFatti,
  attenzione: (docs, tetto) => giudizi.attenzione(docs, tetto),
  riga: c => store.scriviCompito(c),
  affida: (id, modo) => compiti.affida(id, modo, false),
  proponi: (id, p, r) => { store.proponi(id, p, r); compiti.annunciaPronto(id) },
  girata: (id, esito, guaio, quanti, risultato, ricevuta) => store.automazioneGirata(id, esito, guaio, quanti, risultato, ricevuta),
  rimandata: id => store.automazioneRimandata(id),
  saltata: id => store.automazioneSaltata(id),
  azione: a => store.registraAzione(a),
  annuncia: () => compiti.annunciaCambio()
}

/**
 * Il verso della prova sul passato (P6): non scrive niente, annota.
 *
 * Sta qui e non in collaudo.ts perché i nomi dei metodi di un `Verso` sono
 * quelli delle scritture vere, e collaudo.ts non ne nomina nessuna (la prova
 * statica lo controlla). Qui sono solo le chiavi di un oggetto che registra.
 */
export type Annotato = {
  tipo: 'riga' | 'proposta'
  id: string
  testo: string
  nota: string | null
  doc: string | null
  docs: string[]
  inLista: string | null
  attrezzi: store.Concessione | null
  modo: string | null
  scrive: boolean
  proposta: { proposta: store.Proposta; riassunto: string } | null
}

export type Registro = {
  stato: store.StatoAutomazione
  arrivati(dal: string, limite: number): store.Documento[]
  giaFatti(ids: string[], origine: string): Set<string>
  attenzione(docs: store.Documento[], tetto: number): Promise<Map<string, giudizi.Giudizio>>
  annotati: Annotato[]
  letti: number
}

export function versoCheRegistra(r: Registro): Verso {
  const trova = (id: string) => r.annotati.find(x => x.id === id)
  return {
    stato: () => r.stato,
    // come se la riga di prima fosse stata chiusa: si vede tutto quello che avrebbe fatto
    vivo: () => false,
    bozzeOggi: () => 0,
    bozzeDiOggi: () => 0,
    segnaBozza: () => 0,
    arrivati: (dal, limite) => r.arrivati(dal, limite),
    docsConRiga: (ids, origine) => r.giaFatti(ids, origine),
    attenzione: (docs, tetto) => r.attenzione(docs, tetto),
    riga: (c, docs) => {
      r.annotati.push({
        tipo: 'riga', id: c.id, testo: c.testo, nota: c.nota ?? null, doc: c.doc ?? null, docs,
        inLista: c.quando ?? null, attrezzi: c.attrezzi ?? null, modo: null, scrive: false, proposta: null
      })
    },
    affida: (id, modo) => { const x = trova(id); if (x) { x.scrive = true; x.modo = modo } },
    proponi: (id, p, riassunto) => { const x = trova(id); if (x) { x.tipo = 'proposta'; x.proposta = { proposta: p, riassunto } } },
    girata: (_id, _esito, _guaio, quanti) => { r.letti += quanti ?? 0 },
    rimandata: () => {},
    saltata: () => {},
    azione: () => {},
    annuncia: () => {}
  }
}
