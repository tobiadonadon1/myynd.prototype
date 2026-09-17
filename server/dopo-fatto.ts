// Quando lui segna una cosa fatta.
//
// «Quando dico che una cosa è fatta, vorrei sapere se lo registra davvero:
// questa l'ha già fatta, non devo più dirgliela, è passato ad altro, su cosa
// sta lavorando adesso? Dovrebbe segnarsi che è una cosa che ha ottenuto, e
// passare al passo dopo del progetto. E se non lo sa, che me lo chieda.» Le
// sue parole, e la ragione di questo file.
//
// Finora «Fatto» cambiava uno stato e basta. La riga spariva dalla lista, la
// voce dal feed, e di quello che aveva ottenuto non restava niente da
// nessuna parte: il giro dopo poteva riproporgli la stessa cosa con una
// parola cambiata, e nessuno guardava cosa venisse dopo. Qui si fanno le tre
// cose che mancavano, in quest'ordine e dopo che la rotta ha già risposto:
//
//   1. si segna il traguardo nella memoria del progetto, come un fatto suo
//      che non invecchia con la riga (`recordDoneByUser`);
//   2. si chiede al modello, in una riga sola, qual è il passo dopo dentro
//      quel progetto, e se lo sa si scrive in lista come figlia della cosa
//      appena chiusa, senza affidarla a nessuno: è una cosa sua, proposta;
//   3. se non lo sa, lo si chiede a lui, con una domanda sola per progetto
//      e con un po' di silenzio dopo che ha risposto o l'ha lasciata cadere.
//
// Quello che non si fa conta quanto quello che si fa: una cosa lasciata
// perdere o scartata non è un traguardo; una cosa senza progetto non ha un
// «passo dopo del progetto»; senza un modello si segna e basta; e una riga
// simile già in lista non si raddoppia. E non fallisce mai verso la rotta:
// chiudere una riga funziona anche se tutto questo va storto.

import * as store from './store.ts'
import * as progetti from './progetti.ts'
import * as compiti from './compiti.ts'
import * as ordine from './ordine.ts'
import * as riferimento from './riferimento.ts'
import { lingua } from './config.ts'
import { collegato } from './modello.ts'
import { nominaAmbito } from './ambiti-memoria.ts'
import { senzaTrattini } from './testo.ts'
import { recordDoneByUser, recordNextResult } from './project-memory.ts'
import { prossimoPasso, simili } from './revisione-lavoro.ts'

/** Cosa ha chiuso: una riga della lista o una voce del feed. */
export type Fatto = { genere: 'compito' | 'voce'; id: string }

/** Com'è andata: il nome del progetto, e cosa ne è seguito. */
export type Registrato = { progetto: string | null; prossimo: 'passo' | 'domanda' | 'niente' }

/** Il prefisso del tema della domanda: uno per progetto, si riapre. */
export const TEMA = 'fatto:'

/** Dopo una risposta, o una domanda lasciata cadere, sullo stesso progetto non si richiede per tanti giorni. */
const GIORNI_SILENZIO = 7

/**
 * Le mani, sostituibili solo nelle prove.
 *
 * Stesso motivo di `compiti.ts`: la cosa da provare è quello che sta attorno
 * alla chiamata, e una prova che chiama un modello non è una prova. Il
 * «collegato» sta qui e non dentro `prossimoPasso` perché le due cose si
 * distinguono: senza modello si segna e basta, con un modello che non sa si
 * chiede a lui.
 */
type Ferri = {
  prossimoPasso: typeof prossimoPasso
  collegato: () => boolean
}
const VERI: Ferri = {
  prossimoPasso: (...a) => prossimoPasso(...a),
  collegato: () => collegato()
}
let ferri: Ferri = VERI

/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) {
  ferri = f ? { ...VERI, ...f } : VERI
}

type Cosa = {
  testo: string
  progetto: progetti.Progetto | null
  stato: string
  origine: string
  madre: string | null
}

/** Un progetto che esiste e non è chiuso: un chiuso non ha un passo dopo. */
function vivo(id: string | null | undefined): progetti.Progetto | null {
  if (!id) return null
  const p = progetti.trova(id)
  return p && p.stato !== 'chiuso' ? p : null
}

/**
 * Di quale progetto è una voce del feed che non lo dice.
 *
 * La stessa lettura di `feedAttuale` in `attenzione.ts`: si guarda se titolo
 * e testo nominano un progetto attivo, il nome più lungo vince, e poi gli
 * altri nomi delle sue cose dal riferimento («Evermute (everwave)»). Si
 * rifà qui perché `feedAttuale` legge solo le voci aperte, e questa è
 * appena stata chiusa.
 */
function progettoNominato(v: Record<string, string | null>): progetti.Progetto | null {
  const testo = `${v.titolo}\n${v.testo ?? ''}\n${v.perche ?? ''}`
  const attivi = [...progetti.elenco('attivo')].sort((a, b) => b.nome.length - a.nome.length)
  const suo = attivi.find(p => nominaAmbito(testo, p.nome))
  if (suo) return suo
  const alias = [...riferimento.alias()].find(([nome]) => nominaAmbito(testo, nome))
  return alias ? vivo(alias[1]) : null
}

/** Quello che è stato chiuso, com'è adesso, con il suo progetto. */
function leggi(f: Fatto): Cosa | null {
  if (f.genere === 'compito') {
    const c = store.compito(f.id)
    if (!c || c.sparito) return null
    return { testo: c.testo, progetto: vivo(c.progetto), stato: c.stato, origine: c.origine, madre: c.madre ?? null }
  }
  const v = store.voceFeed(f.id)
  if (!v) return null
  return {
    testo: v.titolo,
    progetto: v.progetto ? vivo(v.progetto) : progettoNominato(v),
    stato: v.stato, origine: 'voce', madre: null
  }
}

/** È ancora fatta? Mentre il modello pensava può averla riaperta. */
function ancoraFatta(f: Fatto): boolean {
  return (f.genere === 'compito' ? store.compito(f.id)?.stato : store.voceFeed(f.id)?.stato) === 'fatto'
}

/**
 * Il nome del progetto, subito e senza modello: è quello che la rotta mette
 * nella risposta, così l'avviso sotto il bottone può dirlo.
 */
export function progettoDelFatto(f: Fatto): string | null {
  try { return leggi(f)?.progetto?.nome ?? null } catch { return null }
}

/** L'id come quello della rotta: l'ora in base trentasei e un pizzico di caso. */
function nuovoId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Una riga in lista, in fondo a «oggi», figlia della cosa da cui nasce. */
function scriviPasso(testo: string, progetto: string, madre: string | null, voce: string | null): string {
  const id = nuovoId()
  store.scriviCompito({
    id, testo, quando: 'oggi', origine: 'seguito', madre, voce, progetto,
    ordine: ordine.dopo(store.ultimoOrdine('oggi'))
  })
  return id
}

/** La domanda, nella lingua dell'app. */
function testoDomanda(progetto: string, cosa: string): string {
  const c = senzaTrattini(cosa).trim().slice(0, 120)
  return lingua() === 'en'
    ? `You closed «${c}» for ${progetto}. What is the next step there?`
    : `Hai chiuso «${c}» di ${progetto}. Qual è il passo dopo?`
}

/**
 * Chiede a lui il passo dopo, se è il momento. Torna vero se ha aperto la domanda.
 *
 * Non è il momento se su quel progetto c'è già una domanda aperta, se è
 * aperta quella del riferimento (che chiede la stessa cosa su tutti i
 * progetti insieme), o se su questo tema ha risposto o lasciato cadere da
 * meno di una settimana: chi non risponde ha detto qualcosa anche lui.
 */
function chiedi(p: progetti.Progetto, cosa: string): boolean {
  const aperta = store.domandaAperta()
  if (aperta && (aperta.progetto === p.id || aperta.tema === riferimento.TEMA)) return false
  if (store.domandaPerTema(riferimento.TEMA)?.stato === 'aperta') return false
  const tema = `${TEMA}${p.id}`
  const gia = store.domandaPerTema(tema)
  if (gia) {
    if (gia.stato === 'aperta') return false
    const chiusa = Date.parse(gia.chiusa ?? '')
    if (Number.isFinite(chiusa) && Date.now() - chiusa < GIORNI_SILENZIO * 86_400_000) return false
  }
  const testo = testoDomanda(p.nome, cosa)
  if (gia) store.riapriDomanda(gia.id, testo, [cosa])
  else if (!store.apriDomanda({ tema, testo, spunto: [cosa], progetto: p.id })) return false
  return true
}

/**
 * Registra una cosa fatta: la memoria, il passo dopo o la domanda.
 *
 * Si chiama *dopo* che la rotta ha risposto, mai prima: segnare una cosa
 * fatta non deve aspettare che Myynd rifletta. E non lancia mai: al peggio
 * scrive una riga nel registro e torna «niente».
 */
export async function registraFatto(f: Fatto): Promise<Registrato> {
  const dire = (progetto: string | null, prossimo: Registrato['prossimo'], perche = '') => {
    console.info(`myynd · fatto · ${f.id} · ${progetto ?? 'senza progetto'} · ${prossimo}${perche ? ` · ${perche}` : ''}`)
    return { progetto, prossimo }
  }
  try {
    const cosa = leggi(f)
    // una cosa lasciata perdere o scartata non è un traguardo: qui non c'è niente
    if (!cosa || cosa.stato !== 'fatto') return dire(cosa?.progetto?.nome ?? null, 'niente', cosa ? cosa.stato : 'sparita')
    const p = cosa.progetto
    if (!p) return dire(null, 'niente')

    // 1 · il traguardo, nella memoria del progetto
    recordDoneByUser(p.id, cosa.testo, f.id)

    // il seguito di un seguito: se la madre ha già un'altra figlia in lista,
    // la catena è già andata avanti da un'altra parte, e non si raddoppia
    if (cosa.origine === 'seguito' && cosa.madre && store.elencoCompiti().some(v => v.madre === cosa.madre && v.id !== f.id)) {
      return dire(p.nome, 'niente', 'la madre ha già un seguito')
    }
    // senza modello si segna e basta: non c'è nessuno a cui chiedere il passo
    if (!ferri.collegato()) return dire(p.nome, 'niente', 'senza modello')

    // 2 · il passo dopo, in una riga
    const vivi = store.elencoCompiti().filter(v => v.id !== f.id)
    const passo = await ferri.prossimoPasso({
      compito: { testo: cosa.testo },
      risultato: `Fatto: ${cosa.testo}`,
      progetto: p,
      inLista: vivi.filter(v => v.progetto === p.id).map(v => v.testo)
    })
    if (passo) {
      if (vivi.some(v => simili(v.testo, passo))) return dire(p.nome, 'niente', `già in lista: «${passo.slice(0, 80)}»`)
      if (!ancoraFatta(f)) return dire(p.nome, 'niente', 'riaperta nel frattempo')
      const id = scriviPasso(passo, p.id, f.genere === 'compito' ? f.id : null, f.genere === 'voce' ? f.id : null)
      compiti.annunciaCambio()
      return dire(p.nome, 'passo', `→ ${id}`)
    }

    // 3 · non lo sa: lo chiede a lui
    if (!ancoraFatta(f)) return dire(p.nome, 'niente', 'riaperta nel frattempo')
    if (!chiedi(p, cosa.testo)) return dire(p.nome, 'niente', 'sta già chiedendo')
    // la domanda compare sulla prima pagina, che si rilegge con il feed
    compiti.annunciaFeed()
    return dire(p.nome, 'domanda')
  } catch (e) {
    console.warn(`myynd · fatto · ${f.id}: segnata, ma il passo dopo no:`, e instanceof Error ? e.message : e)
    return { progetto: null, prossimo: 'niente' }
  }
}

/** Una risposta che dice «no», «niente» o «non lo so» non è un passo. */
const NON_E_UN_PASSO = /^(?:no|niente|nulla|nessun[oa]?|boh|nothing|none|nope|non (?:lo )?so|non saprei|i don'?t know|no idea|not sure)\b/i

/**
 * La sua risposta a «qual è il passo dopo?».
 *
 * Se è un passo, va in lista sotto quel progetto e si segna come il prossimo
 * risultato nella memoria del progetto; l'esito dice dove è finito, così può
 * controllare che sia vero. Se non è un passo («non lo so», «niente»), ci
 * si segna la risposta e basta. Non passa dal modello: le parole sono le sue.
 */
export function rispostaSulPasso(d: store.Domanda, risposta: string): string {
  const segnato = lingua() === 'en' ? 'Noted.' : 'Me lo sono segnato.'
  const p = vivo(d.progetto)
  const riga = senzaTrattini(risposta).trim().split(/\n+/)[0].replace(/^["'«]+|["'»]+$/g, '').replace(/[.]+$/, '').trim().slice(0, 160)
  if (!p || !riga || riga.split(/\s+/).length < 2 || riga.endsWith('?') || NON_E_UN_PASSO.test(riga)) return segnato
  try { recordNextResult(p.id, riga) } catch { /* la memoria è un di più */ }
  if (store.elencoCompiti().some(v => simili(v.testo, riga))) {
    return lingua() === 'en' ? `Already in your list for ${p.nome}.` : `Già in lista per ${p.nome}.`
  }
  scriviPasso(riga, p.id, null, null)
  compiti.annunciaCambio()
  return lingua() === 'en' ? `In your list for ${p.nome}: «${riga}».` : `In lista per ${p.nome}: «${riga}».`
}
