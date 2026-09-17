// Il riferimento: quello che dice lui, progetto per progetto.
//
// Le priorità leggono la posta, i file, le cartelle di lavoro e le chat, e da
// lì deducono a che punto è ogni cosa. I documenti però sono in ritardo sulla
// realtà quasi sempre: un progetto con dieci commit può essere stato
// abbandonato ieri a voce, e uno fermo da un mese può essere bloccato da una
// firma che aspetta. Chi lo sa è lui, e finora non gli si chiedeva.
//
// Qui gli si chiede, una volta ogni due settimane: su cosa sta lavorando
// adesso per ogni progetto, cosa è morto, cosa è bloccato. La risposta è un
// blocco della memoria, con le sue parole, e vale più dei file: un progetto
// che ha detto morto non si propone, uno bloccato riceve il passo che lo
// sblocca. Ed è anche il metro con cui si misurano le priorità
// (`valuta-feed.ts`): quante sono attuali, quante parlano di roba finita.
//
// La domanda passa dal meccanismo delle domande (`domande.ts`), con un tema
// solo che si riapre: sulla prima pagina compare come le altre, e la risposta
// arriva da lì.

import * as store from './store.ts'
import * as progetti from './progetti.ts'
import { lingua } from './config.ts'
import { nominaAmbito } from './ambiti-memoria.ts'

/** L'etichetta del blocco dove vive: uno solo, si riscrive. */
export const ETICHETTA = 'riferimento'
/** Il tema della domanda: uno, che si riapre quando il riferimento invecchia. */
export const TEMA = 'riferimento'
/** Dopo tanti giorni il riferimento è vecchio e si richiede. */
export const GIORNI_VALIDO = 14
/** Se l'ha lasciata cadere (o risposta) da meno di tanti giorni, non si insiste. */
export const GIORNI_SILENZIO = 7
const TETTO = 1500

export type Riferimento = { testo: string; aggiornato: string | null }

export function leggi(): Riferimento {
  const b = store.blocchi().find(b => b.etichetta === ETICHETTA)
  return { testo: b?.valore?.trim() ?? '', aggiornato: b?.aggiornato ?? null }
}

export function scrivi(testo: string) {
  const pulito = testo.trim()
  if (!pulito) throw new Error('Scrivi qualcosa.')
  store.scriviBlocco({
    etichetta: ETICHETTA,
    descrizione: 'Su cosa sta lavorando adesso, progetto per progetto; cosa è morto; cosa è bloccato.',
    valore: pulito,
    tetto: TETTO
  })
  registraProgettiNominati(pulito)
}

/**
 * I nomi in testa alle righe del riferimento («x-engine: …», «Nextas, H-Brain: …»).
 *
 * Una riga comincia col nome e i due punti; una lista con le virgole sono
 * più nomi; quello fra parentesi è un altro nome della stessa cosa, e non
 * conta. Serve a `registraProgettiNominati`, ed è puro.
 */
export function nomiNelRiferimento(testo: string): string[] {
  const nomi: string[] = []
  for (const riga of testo.split(/\n+/)) {
    const m = riga.match(/^\s*([^:\n]{2,60}?)\s*:/)
    if (!m) continue
    for (const pezzo of m[1].split(/\s*(?:,|\/|\be\b|\band\b)\s*/)) {
      const nome = pezzo.replace(/\(.*?\)/g, '').trim()
      if (nome.length >= 2 && nome.length <= 40 && !/\s{2,}/.test(nome) && nome.split(/\s+/).length <= 4) nomi.push(nome)
    }
  }
  return [...new Set(nomi)]
}

/**
 * Gli altri nomi delle sue cose: «Evermute (everwave)» dice che la cartella
 * everwave è il progetto Evermute. Torna alias in minuscolo → id del
 * progetto, letti dal riferimento salvato; una voce che nomina «Everwave»
 * finisce così sotto Evermute invece che in «Il resto». Puro sul testo,
 * risolve i nomi sui progetti vivi.
 */
export function aliasDalTesto(testo: string, suoi = progetti.vivi()): Map<string, string> {
  const normale = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const idDi = (nome: string) => {
    const n = normale(nome)
    if (n.length < 3) return null
    return suoi.find(p => normale(p.nome) === n)?.id ?? suoi.find(p => normale(p.nome).startsWith(n) || n.startsWith(normale(p.nome)))?.id ?? null
  }
  const alias = new Map<string, string>()
  for (const riga of testo.split(/\n+/)) {
    const m = riga.match(/^\s*([^:(\n]{2,40}?)\s*\(([^)]{2,80})\)\s*:/)
    if (!m) continue
    const id = idDi(m[1])
    if (!id) continue
    for (const a of m[2].split(/\s*(?:,|\/|\bo\b|\bor\b)\s*/)) {
      const nome = a.trim().toLowerCase()
      if (nome.length >= 3 && nome.length <= 40) alias.set(nome, id)
    }
  }
  return alias
}
export function alias(): Map<string, string> { return aliasDalTesto(leggi().testo) }

/**
 * Un nome del riferimento che è anche una cartella di lavoro sul disco, e
 * non è ancora un progetto, diventa un progetto.
 *
 * Le priorità su x-engine, Everwave e Nextas finivano in «Il resto» perché
 * quelle cose esistevano come cartelle, non come progetti: lui le conosce,
 * Myynd no. Il riferimento è l'elenco dei suoi progetti scritto da lui, e
 * una cartella con quel nome è la prova che non è una parola qualsiasi:
 * «Note: …» non diventa un progetto, «x-engine: …» sì.
 */
export function registraProgettiNominati(testo: string): string[] {
  const cartelle = store.idsConPrefisso('lavoro:').map(id => id.slice(id.lastIndexOf('/') + 1).toLowerCase())
  const normale = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const creati: string[] = []
  for (const nome of nomiNelRiferimento(testo)) {
    if (progetti.trovaPerNome(nome)) continue
    const n = normale(nome)
    if (n.length < 3 || !cartelle.some(c => { const k = normale(c); return k === n || k.startsWith(n) || n.startsWith(k) })) continue
    if (progetti.vivi().some(p => normale(p.nome).startsWith(n) || n.startsWith(normale(p.nome)))) continue
    progetti.scrivi({ nome, origine: 'conversazione' })
    creati.push(nome)
  }
  if (creati.length) console.log(`myynd · riferimento · progetti nuovi dalle sue righe: ${creati.join(', ')}`)
  return creati
}

/** Vero se c'è un riferimento e non ha ancora l'età per essere richiesto. */
export function fresco(adesso = Date.now()): boolean {
  const r = leggi()
  if (!r.testo || !r.aggiornato) return false
  return adesso - Date.parse(r.aggiornato) < GIORNI_VALIDO * 86_400_000
}

/** La domanda, nella lingua dell'app, con i nomi dei suoi progetti dentro. */
export function domandaDiRiferimento(): string {
  const nomi = progetti.vivi().map(p => p.nome)
  if (lingua() === 'en') {
    return 'To get my bearings: for each project, what are you working on right now? What is dead, and what is blocked? Write it as it comes: it counts more than the files.' +
      (nomi.length ? ` The projects I know: ${nomi.join(', ')}.` : '')
  }
  return 'Per orientarmi: per ogni progetto, su cosa stai lavorando adesso? Cosa è morto, e cosa è bloccato? Scrivilo come viene: vale più dei file.' +
    (nomi.length ? ` I progetti che conosco: ${nomi.join(', ')}.` : '')
}

/**
 * Chiede il riferimento, se è il momento. Torna vero se ha aperto la domanda.
 *
 * Il momento: nessun riferimento, o uno più vecchio di due settimane; e
 * nessuna domanda sul tema già aperta, né lasciata cadere (o risposta) da
 * meno di una settimana. Chi non risponde ha detto qualcosa anche lui, e non
 * gli si rifà la stessa domanda il giorno dopo.
 */
export function chiediRiferimento(adesso = Date.now()): boolean {
  if (fresco(adesso)) return false
  const gia = store.domandaPerTema(TEMA)
  if (gia) {
    if (gia.stato === 'aperta') return false
    const chiusa = Date.parse(gia.chiusa ?? '')
    if (Number.isFinite(chiusa) && adesso - chiusa < GIORNI_SILENZIO * 86_400_000) return false
  }
  const testo = domandaDiRiferimento()
  const spunto = progetti.vivi().map(p => p.nome)
  if (gia) store.riapriDomanda(gia.id, testo, spunto)
  else if (!store.apriDomanda({ tema: TEMA, testo, spunto })) return false
  return true
}

/** Quello che gli si dice quando ha risposto: cosa cambia da adesso. */
export function esitoDelRiferimento(): string {
  return lingua() === 'en'
    ? 'Noted. From now on the priorities start from what you wrote: dead projects will not come back, and for the blocked ones I look for the step that unblocks them.'
    : 'Segnato. Da adesso le priorità partono da quello che hai scritto: i progetti morti non te li ripropongo, e su quelli bloccati cerco il passo che li sblocca.'
}

// — leggere il riferimento —
//
// Il riferimento è testo libero, e la lettura vera la fa il modello nel
// prompt delle priorità. Ma «un progetto morto non si propone» è una regola,
// non un consiglio: quando nel testo un progetto è nominato in una frase che
// lo dice morto, la carta si ferma qui, a prescindere da cosa ha capito il
// modello. La stessa lettura serve al prompt per dire quali sono i bloccati.

const MORTO = /\b(?:mort[oa]|abbandonat[oa]|chius[oa]|finit[oa]|archiviat[oa]|dead|abandoned|killed|dropped|shelved|closed|finished|done|over|scrapped)\b/i
const BLOCCATO = /\b(?:bloccat[oa]|ferm[oa]|in attesa|aspett[oa]|blocked|stuck|waiting|on hold|stalled)\b/i
const NEGATO = /\b(?:non|not|isn'?t|aren'?t|never|mai|nemmeno)\b/i

/** Le frasi del riferimento, una per riga o per punto. */
function frasi(testo: string): string[] {
  return testo.split(/\n+|(?<=[.;!?])\s+/).map(s => s.trim()).filter(Boolean)
}

/** Vero se la frase nomina il progetto e lo dice come dice `come`, senza negarlo. */
function detto(frase: string, nome: string, come: RegExp): boolean {
  if (!nominaAmbito(frase, nome)) return false
  const m = come.exec(frase)
  if (!m) return false
  // «non è morto, va solo piano»: la negazione davanti alla parola la spegne
  const prima = frase.slice(Math.max(0, m.index - 24), m.index)
  return !NEGATO.test(prima)
}

/** Gli id dei progetti che il riferimento dice morti. */
export function progettiMorti(testo: string, suoi: { id: string; nome: string }[]): Set<string> {
  const out = new Set<string>()
  if (!testo.trim()) return out
  const f = frasi(testo)
  for (const p of suoi) if (f.some(s => detto(s, p.nome, MORTO))) out.add(p.id)
  return out
}

/** Gli id dei progetti che il riferimento dice bloccati. */
export function progettiBloccati(testo: string, suoi: { id: string; nome: string }[]): Set<string> {
  const out = new Set<string>()
  if (!testo.trim()) return out
  const f = frasi(testo)
  for (const p of suoi) if (f.some(s => detto(s, p.nome, BLOCCATO))) out.add(p.id)
  return out
}
