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
import { chiediJSON, collegato, conLaLingua } from './modello.ts'
import { nominaAmbito } from './ambiti-memoria.ts'
import { senzaTrattini } from './testo.ts'
import { recordCurrentWork, recordDoneByUser, recordNextResult } from './project-memory.ts'
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
  /** La sua risposta a «qual è il passo dopo?»: un passo, uno stato, o altro. */
  classificaPasso: typeof classificaPasso
}
const VERI: Ferri = {
  prossimoPasso: (...a) => prossimoPasso(...a),
  collegato: () => collegato(),
  classificaPasso: (...a) => classificaPasso(...a)
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
 * Una risposta che è uno stato, e si vede senza modello.
 *
 * «I have completed it, i have approved it.» comincia con un participio
 * passato: è una cosa successa, non una cosa da fare. Un passo comincia con
 * un verbo che ordina — «Mandare», «Send» — e non ci casca. Il filtro è
 * volutamente stretto: quello che non prende lo decide il modello.
 */
const E_UNO_STATO = /^(?:(?:i(?:'ve|’ve| have| had|'d)?|we(?:'ve|’ve| have)?|ho|l'ho|l’ho|abbiamo|l'abbiamo|l’abbiamo|è|e'|it'?s|it’s|it is|it was|that'?s|that’s|this is|they(?:'ve|’ve| have)?|apple|the (?:client|team|build|review))\s+)?(?:(?:already|just|già|appena)\s+)?(?:done|completed|finished|approved|sent|closed|handled|shipped|released|submitted|delivered|merged|fixed|resolved|blocked|waiting|stuck|fatt[oa]|completat[oa]|finit[oa]|approvat[oa]|mandat[oa]|inviat[oa]|chius[oa]|consegnat[oa]|pubblicat[oa]|risolt[oa]|bloccat[oa]|in attesa|fermo|ferma)\b/i

export type Classificata = { tipo: 'passo' | 'stato' | 'altro'; passo?: string }

const SCHEMA_RISPOSTA = {
  type: 'object',
  properties: {
    tipo: {
      type: 'string',
      enum: ['passo', 'stato', 'altro'],
      description:
        '«passo» se la risposta dice una cosa DA FARE, un\'azione concreta che viene dopo. ' +
        '«stato» se dice una cosa già successa o com\'è messa la cosa: l\'ho fatta, l\'ho ' +
        'approvata, è mandata, aspetto Apple, è bloccata. «altro» per il resto: un commento, ' +
        'una domanda, un no, un pensiero.'
    },
    passo: {
      type: 'string',
      description:
        'Solo se è un passo: la cosa da fare in una riga che comincia con un verbo, sotto le ' +
        'dodici parole, con le sue parole. Vuota altrimenti.'
    }
  },
  required: ['tipo', 'passo'],
  additionalProperties: false
} as const

/**
 * Cos'è la sua risposta: un passo, uno stato, o altro.
 *
 * Il diciotto settembre a «You closed «Approve the X draft…». What is the
 * next step there?» lui ha risposto «I have completed it, i have approved
 * it.», e quella frase è finita in lista come una cosa da fare. Le sue
 * parole: «That is a faulty feature.» Prima di scrivere una riga si guarda
 * cosa ha detto: solo un'azione da fare diventa una riga. Modello piccolo,
 * schema stretto; `null` se non risponde.
 */
async function classificaPasso(o: { domanda: string; risposta: string; progetto: string }): Promise<Classificata | null> {
  const out = await chiediJSON<{ tipo: string; passo: string }>({
    lavoro: 'classifica',
    max_tokens: 200,
    system: conLaLingua(
      'Myynd ha chiesto a una persona qual è il passo dopo dentro un suo progetto, e lei ha ' +
      'risposto. Di\' cos\'è la risposta. Un passo è una cosa DA FARE, un\'azione concreta che ' +
      'viene dopo: «Mandare il contratto firmato a Rossi». Uno stato è una cosa già successa o ' +
      'com\'è messa la cosa: «l\'ho fatta», «l\'ho approvata», «è mandata», «aspetto Apple», ' +
      '«è bloccata». Altro è un commento, una domanda, un no. Se è un passo, riscrivilo in ' +
      'una riga che comincia con un verbo, con le sue parole. Non inventare un passo da uno stato.'
    ),
    formato: SCHEMA_RISPOSTA,
    messages: [{ role: 'user', content: `Progetto: ${o.progetto}\nDomanda: ${o.domanda}\nRisposta: ${o.risposta.slice(0, 1000)}` }]
  })
  if (!out || (out.tipo !== 'passo' && out.tipo !== 'stato' && out.tipo !== 'altro')) return null
  return { tipo: out.tipo, passo: typeof out.passo === 'string' ? senzaTrattini(out.passo).trim() : '' }
}

/** Una riga di passo, pulita: senza virgolette attorno, senza il punto in fondo. */
function rigaDiPasso(s: string): string {
  return senzaTrattini(s).trim().split(/\n+/)[0].replace(/^["'«]+|["'»]+$/g, '').replace(/[.]+$/, '').trim().slice(0, 160)
}

/**
 * La sua risposta a «qual è il passo dopo?».
 *
 * Prima si guarda cos'è (`classificaPasso`, con un filtro senza modello
 * davanti per gli stati ovvi). Un passo va in lista sotto quel progetto e
 * si segna come il prossimo risultato nella memoria del progetto; l'esito
 * dice dove è finito, così può controllare che sia vero. Uno stato va nella
 * memoria del progetto — «Told me: …» — e la domanda si chiude con
 * «segnato». Altro si chiude e basta. Senza modello, quello che il filtro
 * non riconosce come stato resta un passo, com'era prima: meglio una riga
 * di troppo che una persa in silenzio.
 */
export async function rispostaSulPasso(d: store.Domanda, risposta: string): Promise<string> {
  const segnato = lingua() === 'en' ? 'Noted.' : 'Me lo sono segnato.'
  const p = vivo(d.progetto)
  const riga = rigaDiPasso(risposta)
  if (!p || !riga || riga.split(/\s+/).length < 2 || riga.endsWith('?') || NON_E_UN_PASSO.test(riga)) return segnato

  let cosa: Classificata
  if (E_UNO_STATO.test(riga)) cosa = { tipo: 'stato' }
  else if (!ferri.collegato()) cosa = { tipo: 'passo', passo: riga }
  else cosa = (await ferri.classificaPasso({ domanda: d.testo, risposta: senzaTrattini(risposta).trim(), progetto: p.nome }).catch(() => null)) ?? { tipo: 'passo', passo: riga }

  if (cosa.tipo === 'stato') {
    try { recordCurrentWork(p.id, `Told me: ${senzaTrattini(risposta).trim().slice(0, 500)}`) } catch { /* la memoria è un di più */ }
    console.info(`myynd · fatto · ${d.id} · ${p.nome} · stato, segnato in memoria`)
    return segnato
  }
  if (cosa.tipo !== 'passo') return segnato
  const passo = rigaDiPasso(cosa.passo || riga)
  if (!passo || passo.split(/\s+/).length < 2) return segnato
  try { recordNextResult(p.id, passo) } catch { /* la memoria è un di più */ }
  if (store.elencoCompiti().some(v => simili(v.testo, passo))) {
    return lingua() === 'en' ? `Already in your list for ${p.nome}.` : `Già in lista per ${p.nome}.`
  }
  scriviPasso(passo, p.id, null, null)
  compiti.annunciaCambio()
  return lingua() === 'en' ? `In your list for ${p.nome}: «${passo}».` : `In lista per ${p.nome}: «${passo}».`
}
