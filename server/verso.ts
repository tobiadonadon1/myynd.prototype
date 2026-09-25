// Il verso di un giro d'automazione (P6): dove vanno a finire le sue scritture.
//
// `faiInterna` e `faiPerDocumento` in automazioni.ts non scrivono più da sé:
// chiamano un `Verso`, negli stessi punti e nello stesso ordine di prima.
// `VERSO_LISTA` fa le chiamate di sempre (la lista, le bozze, gli annunci).
// `VERSO_VASSOIO` scrive nel vassoio di prova: le righe restano risultati in
// attesa, finché lui non le mette in lista. La prova sul passato ne ha un terzo,
// in collaudo.ts, che non scrive niente.

import * as store from './store.ts'
import * as compiti from './compiti.ts'
import * as giudizi from './giudizi.ts'
import { giornoIn } from './fuso.ts'

/** I giorni di vassoio di un'automazione appena accesa. */
export const VASSOIO_GIORNI = 14

export type RigaNuova = Parameters<typeof store.scriviCompito>[0]

export type Verso = {
  stato(id: string): store.StatoAutomazione | null
  vivo(id: string): boolean
  bozzeOggi(s: store.StatoAutomazione | null, adesso?: Date): number
  segnaBozza(id: string, giorno: string): number
  arrivati(dal: string, limite: number): store.Documento[]
  docsConRiga(ids: string[], origine: string): Set<string>
  attenzione(docs: store.Documento[], tetto: number): Promise<Map<string, giudizi.Giudizio>>
  /** Una riga nuova; `docs` sono i documenti che ha guardato (la lista la ignora). */
  riga(c: RigaNuova, docs: string[]): void
  affida(id: string, modo: string): void
  proponi(id: string, p: store.Proposta, riassunto: string): void
  girata(id: string, esito: string, guaio?: string, quanti?: number, risultato?: string): void
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

/** Le righe già fatte, più i documenti che aspettano nel vassoio di quella automazione. */
function giaFatti(ids: string[], origine: string): Set<string> {
  const fuori = store.docsConRiga(ids, origine)
  for (const d of store.docsNelVassoio(ids, idDa(origine))) fuori.add(d)
  return fuori
}

export const VERSO_LISTA: Verso = {
  stato: id => store.statoAutomazione(id),
  vivo: id => store.compitoVivoDa(id),
  bozzeOggi,
  segnaBozza: (id, giorno) => store.segnaBozza(id, giorno),
  arrivati: (dal, limite) => store.appenaArrivati(dal, limite),
  // dopo il vassoio un documento che aspetta ancora là non si rifà in lista
  docsConRiga: giaFatti,
  attenzione: (docs, tetto) => giudizi.attenzione(docs, tetto),
  riga: c => store.scriviCompito(c),
  affida: (id, modo) => compiti.affida(id, modo, false),
  proponi: (id, p, r) => { store.proponi(id, p, r); compiti.annunciaPronto(id) },
  girata: (id, esito, guaio, quanti, risultato) => store.automazioneGirata(id, esito, guaio, quanti, risultato),
  rimandata: id => store.automazioneRimandata(id),
  saltata: id => store.automazioneSaltata(id),
  azione: a => store.registraAzione(a),
  annuncia: () => compiti.annunciaCambio()
}

/** La prova del vassoio di un'automazione: una sola, creata la prima volta, sempre «in corso». */
export function provaDelVassoio(automazione: string): string {
  const gia = store.proveDi(automazione, 'vassoio', 1)[0]
  if (gia) return gia.id
  const id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  store.nuovaProva({ id, automazione, tipo: 'vassoio', stato: 'in corso', origine: 'vassoio' })
  return id
}

export const VERSO_VASSOIO: Verso = {
  ...VERSO_LISTA,
  vivo: id => store.esitoVivoDa(id),
  docsConRiga: giaFatti,
  riga: (c, docs) => {
    const automazione = idDa(c.origine ?? '')
    store.scriviEsito({
      id: c.id, prova: provaDelVassoio(automazione), automazione, tipo: 'riga', stato: 'senza bozza',
      quando: new Date().toISOString(), testo: c.testo, nota: c.nota ?? null, doc: c.doc ?? null,
      docs: JSON.stringify({ ids: docs, nuovi: docs, anche: [] }), inLista: c.quando ?? null,
      attrezzi: c.attrezzi ? JSON.stringify(c.attrezzi) : null
    })
  },
  affida: (id, modo) => store.aggiornaEsito(id, { stato: 'da scrivere', modo }),
  proponi: (id, p, r) => store.aggiornaEsito(id, { tipo: 'proposta', proposta: JSON.stringify({ proposta: p, riassunto: r }) }),
  // un giro del vassoio non è una cosa fatta: niente azioni, niente annunci
  azione: () => {},
  annuncia: () => {}
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
