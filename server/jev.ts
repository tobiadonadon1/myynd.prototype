// Jev: il giudizio piccolo.
//
// Myynd ha un modello grande che scrive, e fino a ieri era anche quello che
// decideva. Decidere però è un'altra cosa dallo scrivere: «questa mail chiede
// qualcosa a lui?» non ha bisogno di un paragrafo, ha bisogno di un sì o un no
// con dentro quanto ci crede. Finché la domanda la faceva il modello grande, la
// risposta costava come una pagina, arrivava in qualche secondo, e cambiava
// forma da un giro all'altro; e siccome costava, la si chiedeva su trenta
// documenti scelti da una fila di espressioni regolari — che non sanno leggere.
//
// Jev è un modello di TypeSafe che risponde solo a domande tipizzate: un
// numero fra zero e uno, una scelta fra opzioni date, un livello su una scala
// descritta. Non genera testo, non ragiona ad alta voce, non si inventa un id.
// Mezzo secondo, qualche centesimo di quello che costa una lettura, e la
// risposta è già un dato: `if (g.chiede > 0.5)`.
//
// Tre regole, e sono quelle che rendono sicuro appoggiarcisi:
//
//   1. È un affinamento, mai una dipendenza. Senza chiave, con la rete giù,
//      con TypeSafe fermo: `giudica` torna `null` e ogni chiamante fa quello
//      che faceva prima. Nessuna schermata dice «Jev non risponde», perché per
//      chi guarda non è successo niente.
//   2. Non decide da solo quello che si vede. Jev sceglie *cosa far leggere* al
//      modello grande e in che ordine; le voci del feed, le righe della lista e
//      le bozze restano scritte da chi le scriveva prima.
//   3. Ha un tetto al giorno, per conto. La paura del conto salato è sua e ha
//      ragione: qui il numero è scritto, si vede, e quando è finito Jev tace
//      invece di continuare a spendere.
//
// Le domande si scrivono in inglese anche se tutto il resto dell'app parla
// italiano, e non è una svista: provato il 20 settembre 2026 su materiale vero
// nelle due lingue, la stessa domanda in inglese su una mail italiana risponde
// come su una inglese («mi confermi il preventivo entro venerdì?» → 0.97),
// mentre la documentazione, gli esempi e la calibrazione del modello sono
// inglesi. Il *materiale* resta nella sua lingua: è dato, non istruzione.

import * as chi from './chi.ts'
import { leggi } from './config.ts'
import { OSPITATO } from './ospitato.ts'

const INDIRIZZO = 'https://api.typesafe.ai/v1/systemone'
const MODELLO = 'jev-latest'

/**
 * Quanto si aspetta una risposta.
 *
 * Jev risponde in mezzo secondo. Otto sono già la prova che qualcosa non va, e
 * un affinamento che fa aspettare la prima pagina ha smesso di essere un
 * affinamento: si lascia perdere e si va avanti con le regole di sempre.
 */
const ATTESA = 8_000

/** Quante domande si possono fare in parallelo senza farsi dire di rallentare. */
const INSIEME = 6

/**
 * Quanti giudizi al giorno, per conto.
 *
 * Seicento sono molti più di quelli che servono a una giornata vera (una
 * lettura del feed ne chiede al massimo sessanta, le priorità sessanta, e i
 * documenti già giudicati non si richiedono), e sono comunque un tetto: se
 * qualcosa gira in tondo, si ferma qui invece che sulla carta di credito.
 */
export const TETTO_AL_GIORNO = 600

// — le domande —

type Testo = string | Record<string, unknown> | unknown[]

export type Noul = { type: 'noul'; instructions: Testo; criteria?: { true?: Testo; false?: Testo } }
export type Scelta = { type: 'choice'; instructions: Testo; criteria: Record<string, Testo> }
export type Livelli = { type: 'score'; instructions: Testo; criteria: Testo[] }
export type Domanda = Noul | Scelta | Livelli

export type RispostaNoul = { type: 'noul'; noul: number }
export type RispostaScelta = { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
export type RispostaLivelli = { type: 'score'; score: number; confidence: number; probabilities: Record<string, number>; legend: Record<string, string> }
export type Risposta = RispostaNoul | RispostaScelta | RispostaLivelli

export type Risposte<D extends Record<string, Domanda>> = {
  [K in keyof D]: D[K] extends Noul ? RispostaNoul : D[K] extends Scelta ? RispostaScelta : RispostaLivelli
}

// — la chiave —

/**
 * La chiave nell'ambiente, se è lecito usarla.
 *
 * La stessa regola di `modello.ts`: sul computer di una persona la chiave
 * nell'ambiente è la sua, su un server è di chi ospita e non si presta a
 * chiunque si registri.
 */
function chiaveDiCasa(): string | undefined {
  return OSPITATO ? undefined : process.env.MYYND_TYPESAFE?.trim() || undefined
}

export function chiave(): string | null {
  return leggi().jev?.apiKey?.trim() || chiaveDiCasa() || null
}

/** C'è di che giudicare? */
export function collegato(): boolean {
  return !!chiave()
}

// — il conto del giorno —

type Consumo = { giorno: string; giudizi: number; gettoni: number }
const consumi = new Map<string, Consumo>()
const oggi = () => new Date().toISOString().slice(0, 10)
const conto = () => chi.adesso() ?? 'casa'

/** Quanto ha giudicato oggi questo conto. Una Map per conto, come tutto il resto. */
export function consumo(di = conto()): Consumo {
  const c = consumi.get(di)
  return c && c.giorno === oggi() ? { ...c } : { giorno: oggi(), giudizi: 0, gettoni: 0 }
}

function segna(giudizi: number, gettoni: number) {
  const di = conto()
  const c = consumo(di)
  consumi.set(di, { giorno: c.giorno, giudizi: c.giudizi + giudizi, gettoni: c.gettoni + gettoni })
}

/** Il tetto del giorno è finito: da qui in poi si tace, e si torna alle regole. */
function finito(): boolean {
  return consumo().giudizi >= TETTO_AL_GIORNO
}

export function dimentica(di?: string) {
  if (di) consumi.delete(di); else consumi.clear()
}

// — chiedere —

/** La rete, sostituibile nelle prove: una prova che chiama TypeSafe non è una prova. */
let rete: typeof fetch = (...a) => fetch(...a)
export function perProva(f: typeof fetch | null) { rete = f ?? ((...a) => fetch(...a)) }

const aspetta = (ms: number) => new Promise(r => setTimeout(r, ms))

type Esito = { answers: Record<string, Risposta>; usage?: { input_tokens?: number; output_tokens?: number } }

/**
 * Una domanda — o dieci insieme — sullo stesso materiale.
 *
 * Le domande indipendenti sullo stesso stato si fanno in una chiamata sola:
 * girano in parallelo dall'altra parte e il tempo non cambia, mentre due
 * chiamate pagherebbero il materiale due volte.
 *
 * Non lancia mai. Un errore di rete, una chiave storta, un tetto raggiunto,
 * una risposta che non ha la forma promessa: tutto torna `null`, e `null` vuol
 * dire «fai come facevi prima», mai «non c'è niente».
 */
export async function giudica<D extends Record<string, Domanda>>(
  stato: unknown,
  domande: D,
  opz: { attesa?: number; chiave?: string } = {}
): Promise<Risposte<D> | null> {
  const k = opz.chiave ?? chiave()
  if (!k || !Object.keys(domande).length) return null
  if (!opz.chiave && finito()) return null
  const corpo = JSON.stringify({ model: MODELLO, state: stato, questions: domande })

  for (let tentativo = 0; tentativo < 2; tentativo++) {
    try {
      const r = await rete(INDIRIZZO, {
        method: 'POST',
        headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' },
        body: corpo,
        signal: AbortSignal.timeout(opz.attesa ?? ATTESA)
      })
      // 429 e 529 sono «riprova fra poco»: una volta sola, e corta. Chi
      // aspetta è una schermata, non una coda.
      if ((r.status === 429 || r.status === 529) && tentativo === 0) { await aspetta(400); continue }
      if (!r.ok) return null
      const j = await r.json() as Esito
      const risposte = j?.answers
      if (!risposte || typeof risposte !== 'object') return null
      // la forma promessa dallo schema è una promessa, non una garanzia: se
      // manca una risposta si torna null invece di lasciar leggere `undefined`
      // a chi si fida dei tipi
      for (const nome of Object.keys(domande)) if (!valida(risposte[nome], domande[nome])) return null
      segna(Object.keys(domande).length, (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0))
      return risposte as Risposte<D>
    } catch {
      return null
    }
  }
  return null
}

function valida(r: Risposta | undefined, d: Domanda): boolean {
  if (!r || typeof r !== 'object') return false
  if (d.type === 'noul') return r.type === 'noul' && Number.isFinite(r.noul)
  if (d.type === 'choice') return r.type === 'choice' && typeof r.choice === 'string' && r.choice in d.criteria
  return r.type === 'score' && Number.isFinite(r.score)
}

/**
 * Le stesse domande su tante cose, a sei per volta.
 *
 * Il materiale cambia a ogni voce, quindi le chiamate sono tante: sei insieme
 * tengono trenta documenti sotto i tre secondi senza farsi rallentare. Chi non
 * risponde torna `null` nella sua casella e non ferma gli altri: mezza lettura
 * giudicata è meglio di nessuna, e chi legge la Map deve comunque sapere cosa
 * fare di una casella vuota.
 */
export async function giudicaTanti<T, D extends Record<string, Domanda>>(
  cose: readonly T[],
  statoDi: (c: T) => unknown,
  domande: D,
  opz: { attesa?: number; insieme?: number } = {}
): Promise<Map<T, Risposte<D> | null>> {
  const fuori = new Map<T, Risposte<D> | null>()
  if (!collegato()) return fuori
  const insieme = Math.max(1, opz.insieme ?? INSIEME)
  for (let i = 0; i < cose.length; i += insieme) {
    const gruppo = cose.slice(i, i + insieme)
    const esiti = await Promise.all(gruppo.map(c => giudica(statoDi(c), domande, opz)))
    gruppo.forEach((c, n) => fuori.set(c, esiti[n]))
    // il tetto si controlla anche in mezzo: un giro lungo non deve scoprirlo solo alla fine
    if (finito()) break
  }
  return fuori
}

/**
 * La chiave funziona?
 *
 * È l'unica funzione che lancia, ed è giusto: qui qualcuno ha appena incollato
 * qualcosa e sta guardando il bottone. Dirgli «fatto» e poi tacere per sempre
 * sarebbe il guasto peggiore di tutti.
 */
export async function prova(k: string): Promise<void> {
  const pulita = k.trim()
  if (!pulita) throw new Error('Incolla la chiave di TypeSafe.')
  const r = await giudica(
    { prova: 'The key works.' },
    { va: { type: 'noul', instructions: 'This sentence says the key works.' } as Noul },
    { chiave: pulita, attesa: 15_000 }
  )
  if (!r) throw new Error('Questa chiave non ha risposto. Controlla di averla copiata tutta.')
}
