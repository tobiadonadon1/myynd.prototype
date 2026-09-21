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
//      invece di continuare a spendere. Il conto del giorno sta su disco, così
//      un riavvio non lo azzera.
//
// Le domande si scrivono in inglese anche se tutto il resto dell'app parla
// italiano, e non è una svista: provato il 20 settembre 2026 su materiale vero
// nelle due lingue, la stessa domanda in inglese su una mail italiana risponde
// come su una inglese («mi confermi il preventivo entro venerdì?» → 0.97),
// mentre la documentazione, gli esempi e la calibrazione del modello sono
// inglesi. Il *materiale* resta nella sua lingua: è dato, non istruzione.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as chi from './chi.ts'
import { cartella, leggi } from './config.ts'
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
 * lettura del feed ne chiede al massimo sessanta documenti per quattro
 * domande, le priorità novanta per una, le carte nuove due per carta, e i
 * documenti già giudicati non si richiedono — nemmeno dopo un riavvio, da
 * quando `giudizi.ts` li tiene su disco), e sono comunque un tetto: se
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

/*
 * Il conto del giorno sta anche su disco, per conto.
 *
 * In memoria e basta, un riavvio lo azzerava: l'app sul Mac si riapre più
 * volte al giorno, e un tetto che ricomincia da zero a ogni apertura non è
 * un tetto. Un file piccolo nella cartella del conto, riscritto a ogni
 * giudizio (sono tre numeri), letto una volta alla prima domanda.
 *
 * `senzaDisco` lo spegne: la prova sui documenti veri (`prova-jev.ts`) legge
 * la cartella di una persona e non deve lasciarci niente.
 */
let disco = true
export function senzaDisco(si = true) { disco = !si }

function fileConsumo(): string | null {
  if (!disco || (OSPITATO && !chi.adesso())) return null
  return join(cartella(), 'jev.json')
}

function ricorda(di: string) {
  if (consumi.has(di) || di !== conto()) return
  const f = fileConsumo()
  if (f) {
    try {
      const c = JSON.parse(readFileSync(f, 'utf8')) as Partial<Consumo>
      if (typeof c?.giorno === 'string' && typeof c.giudizi === 'number') {
        consumi.set(di, { giorno: c.giorno, giudizi: c.giudizi, gettoni: Number(c.gettoni) || 0 })
      }
    } catch { /* nessun file, o storto: il giorno ricomincia da zero */ }
  }
  if (!consumi.has(di)) consumi.set(di, { giorno: oggi(), giudizi: 0, gettoni: 0 })
}

function scriviConsumo(c: Consumo) {
  const f = fileConsumo()
  if (!f) return
  try {
    const dir = cartella()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
    const tmp = `${f}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(c), { mode: 0o600 })
    renameSync(tmp, f)
  } catch { /* contare non deve mai fermare un giudizio */ }
}

/** Quanto ha giudicato oggi questo conto. Una Map per conto, come tutto il resto. */
export function consumo(di = conto()): Consumo {
  ricorda(di)
  const c = consumi.get(di)
  return c && c.giorno === oggi() ? { ...c } : { giorno: oggi(), giudizi: 0, gettoni: 0 }
}

function segna(giudizi: number, gettoni: number) {
  const di = conto()
  const c = consumo(di)
  const nuovo = { giorno: c.giorno, giudizi: c.giudizi + giudizi, gettoni: c.gettoni + gettoni }
  consumi.set(di, nuovo)
  scriviConsumo(nuovo)
}

/** Il tetto del giorno è finito: da qui in poi si tace, e si torna alle regole. */
function finito(): boolean {
  return consumo().giudizi >= TETTO_AL_GIORNO
}

/** Quanti giudizi restano oggi: è quello che decide quante domande partono in un giro. */
export function restanti(): number {
  return Math.max(0, TETTO_AL_GIORNO - consumo().giudizi)
}

export function dimentica(di?: string) {
  if (di) consumi.delete(di); else consumi.clear()
  const f = fileConsumo()
  if (f) { try { unlinkSync(f) } catch { /* non c'era */ } }
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
 *
 * `facoltative` sono le domande a cui si può anche non rispondere: se manca
 * quella, le altre valgono lo stesso e la sua casella resta `undefined`. Serve
 * a chi aggiunge una domanda a una chiamata che esisteva già senza rompere chi
 * la faceva (e chi la finge, nelle prove).
 */
export async function giudica<D extends Record<string, Domanda>>(
  stato: unknown,
  domande: D,
  opz: { attesa?: number; chiave?: string; facoltative?: readonly string[] } = {}
): Promise<Risposte<D> | null> {
  const k = opz.chiave ?? chiave()
  if (!k || !Object.keys(domande).length) return null
  if (!opz.chiave && finito()) return null
  const corpo = JSON.stringify({ model: MODELLO, state: stato, questions: domande })
  const facoltative = new Set(opz.facoltative ?? [])

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
      // a chi si fida dei tipi — tranne per le facoltative, che si tolgono
      let date = 0
      for (const nome of Object.keys(domande)) {
        if (valida(risposte[nome], domande[nome])) { date++; continue }
        if (!facoltative.has(nome)) return null
        delete risposte[nome]
      }
      segna(date, (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0))
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
 *
 * Il tetto del giorno si rispetta al giudizio: prima di ogni gruppo si guarda
 * quanti ne restano e partono solo le chiamate che ci stanno. Sei chiamate
 * parallele a tre domande l'una non possono più sforare di diciassette.
 */
export async function giudicaTanti<T, D extends Record<string, Domanda>>(
  cose: readonly T[],
  statoDi: (c: T) => unknown,
  domande: D,
  opz: { attesa?: number; insieme?: number; facoltative?: readonly string[] } = {}
): Promise<Map<T, Risposte<D> | null>> {
  const fuori = new Map<T, Risposte<D> | null>()
  if (!collegato()) return fuori
  const insieme = Math.max(1, opz.insieme ?? INSIEME)
  const perChiamata = Math.max(1, Object.keys(domande).length)
  for (let i = 0; i < cose.length;) {
    // il tetto si controlla anche in mezzo: un giro lungo non deve scoprirlo solo alla fine
    const quante = Math.min(insieme, Math.floor(restanti() / perChiamata))
    if (quante <= 0) break
    const gruppo = cose.slice(i, i + quante)
    const esiti = await Promise.all(gruppo.map(c => giudica(statoDi(c), domande, opz)))
    gruppo.forEach((c, n) => fuori.set(c, esiti[n]))
    i += quante
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
