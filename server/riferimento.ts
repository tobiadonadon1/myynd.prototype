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
    descrizione: 'Su cosa sta lavorando adesso, progetto per progetto; cosa ha abbandonato; cosa è bloccato.',
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
/**
 * Tutti gli altri nomi delle sue cose: quelli scritti nella Memoria sul
 * progetto (`progetti.alias`) e quelli fra parentesi nel riferimento. In
 * minuscolo → id, i più lunghi prima, così «H-Farm audit» batte «H-Farm»;
 * a parità di nome vale quello scritto nella Memoria.
 */
export function alias(): Map<string, string> {
  const suoi = progetti.vivi()
  const tutti = new Map<string, string>()
  for (const p of suoi) for (const a of p.alias) tutti.set(a.toLowerCase(), p.id)
  for (const [nome, id] of aliasDalTesto(leggi().testo, suoi)) if (!tutti.has(nome)) tutti.set(nome, id)
  return new Map([...tutti].sort((a, b) => b[0].length - a[0].length))
}

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

/**
 * La domanda, nella lingua dell'app, con i nomi dei suoi progetti dentro.
 *
 * Cominciava con «Per orientarmi» («To get my bearings»), e la prima tester
 * non l'ha capita: una metafora in testa a una domanda che si legge di
 * passaggio. Adesso chiede le tre cose e basta, con le parole che la lettura
 * qui sotto riconosce nella risposta: «abbandonato» e «bloccato», «dropped»
 * e «blocked».
 */
export function domandaDiRiferimento(): string {
  const nomi = progetti.vivi().map(p => p.nome)
  if (lingua() === 'en') {
    return 'For each project: what are you working on now, what have you dropped, and what is blocked?' +
      (nomi.length ? ` The projects I know: ${nomi.join(', ')}.` : '')
  }
  return 'Per ogni progetto: su cosa lavori adesso, cosa hai abbandonato e cosa è bloccato?' +
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

/**
 * La domanda sui progetti, com'è adesso.
 *
 * Il testo si scriveva una volta, quando si apriva la domanda: «I progetti
 * che conosco: Sito Northwind», e restava così anche con tre progetti vivi,
 * o con uno chiuso nel frattempo. Chi serve la domanda aperta la fa passare
 * di qui, e se è questa si riscrive con i progetti di adesso: la stessa
 * domanda, non una nuova, e senza toccare quando è stata aperta.
 */
export function aggiornata<D extends { id: string; tema: string; testo: string; spunto: string[] }>(d: D | null): D | null {
  if (!d || d.tema !== TEMA) return d
  const testo = domandaDiRiferimento()
  const spunto = progetti.vivi().map(p => p.nome)
  if (testo === d.testo && JSON.stringify(spunto) === JSON.stringify(d.spunto)) return d
  store.aggiornaDomanda(d.id, testo, spunto)
  return { ...d, testo, spunto }
}

/** Quello che gli si dice quando ha risposto: cosa cambia da adesso. */
export function esitoDelRiferimento(): string {
  return lingua() === 'en'
    ? 'Noted. From now on the priorities start from what you wrote: dropped projects will not come back, and for the blocked ones I look for the step that unblocks them.'
    : 'Segnato. Da adesso le priorità partono da quello che hai scritto: i progetti abbandonati non te li ripropongo, e su quelli bloccati cerco il passo che li sblocca.'
}

// — leggere il riferimento —
//
// Il riferimento è testo libero, e la lettura vera la fa il modello nel
// prompt delle priorità. Ma «un progetto morto non si propone» è una regola,
// non un consiglio: quando nel testo un progetto è nominato in una frase che
// lo dice morto, la carta si ferma qui, a prescindere da cosa ha capito il
// modello. La stessa lettura serve al prompt per dire quali sono i bloccati.

// I plurali contano quanto i singolari: «Sito e Ceru: abbandonati» è una
// risposta normale a una domanda che chiede «per ogni progetto».
const MORTO = /\b(?:mort[oaie]|abbandonat[oaie]|chius[oaie]|finit[oaie]|archiviat[oaie]|dead|abandoned|killed|dropped|shelved|closed|finished|done|over|scrapped)\b/gi
const BLOCCATO = /\b(?:bloccat[oaie]|ferm[oaie]|in attesa|aspett[oaie]|blocked|stuck|waiting|on hold|stalled)\b/gi
/*
 * «Niente di abbandonato», «nothing dropped», «nessun blocco».
 *
 * La domanda chiede cosa hai abbandonato e cosa è bloccato, e la risposta più
 * comune per un progetto vivo è dire che non c'è niente: senza queste parole
 * «nothing dropped» segnava il progetto come morto, e un progetto morto perde
 * tutte le sue priorità senza che nessuno lo veda.
 */
const NEGATO = /\b(?:non|not|isn'?t|aren'?t|never|mai|nemmeno|nothing|none|no|nulla|niente|nessun[oa]?|zero)\b/i
/*
 * «Dropped the Windows port», «ho chiuso il contratto»: la parola ha un
 * oggetto, e l'oggetto è una parte del progetto, non il progetto. Si guarda la
 * parola che segue: un articolo o un possessivo vuol dire che si parla d'altro.
 */
const HA_UN_OGGETTO = /^\s+(?:the|a|an|my|our|its|his|her|their|this|that|these|those|some|all|with|il|lo|la|i|gli|le|un|una|uno|l['’]|del|dello|della|dei|degli|delle|questo|questa|quel|quello|quella|con)\b/i

/** Le frasi del riferimento, una per riga o per punto. */
function frasi(testo: string): string[] {
  return testo.split(/\n+|(?<=[.;!?])\s+/).map(s => s.trim()).filter(Boolean)
}

/**
 * Vero se la frase nomina il progetto e lo dice come dice `come`, senza negarlo.
 *
 * La negazione vale dentro il suo pezzo di frase, fino alla virgola prima:
 * in «Ceru: niente di nuovo, bloccato sul contratto» il «niente» non spegne
 * il «bloccato» che viene dopo.
 */
function detto(frase: string, nome: string, come: RegExp): boolean {
  if (!nominaAmbito(frase, nome)) return false
  for (const m of frase.matchAll(come)) {
    const i = m.index ?? 0
    const prima = frase.slice(Math.max(0, i - 32), i)
    const pezzo = prima.slice(Math.max(prima.lastIndexOf(','), prima.lastIndexOf(';'), prima.lastIndexOf(':')) + 1)
    if (NEGATO.test(pezzo)) continue
    if (come === MORTO && HA_UN_OGGETTO.test(frase.slice(i + m[0].length))) continue
    return true
  }
  return false
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
