// Chi ragiona, e con quali parametri.
//
// Prima ogni modulo che parlava con un modello si costruiva il suo client:
// `claude.ts`, `timone.ts`, `domande.ts`, `memoria.ts`, `traduci.ts`. Cinque
// copie della stessa riga, e quattro di quelle senza timeout — cioè con il
// valore di serie dell'SDK, dieci minuti più due tentativi silenziosi, fino a
// mezz'ora appesi. `claude.ts` aveva scelto sessanta secondi *di proposito*, e
// spiegava perché in un paragrafo; le altre quattro non avevano letto quel
// paragrafo. È il modo in cui una decisione buona si perde: non viene
// contraddetta, viene semplicemente non copiata.
//
// Qui la decisione sta in un posto solo. E siccome sta in un posto solo,
// diventa anche il punto in cui si possono fare tre cose che prima non si
// potevano fare affatto:
//
//   · dare a ogni modello i parametri che quel modello accetta davvero.
//     `output_config.effort` non esiste su Haiku 4.5 e il pensiero adattivo
//     nemmeno: mandarglieli è un 400. Con la tabella qui sotto, scegliere
//     Haiku nelle preferenze smette di rompere tutta l'app.
//   · mandare il lavoro piccolo a un modello che gira su questa macchina.
//     Dare un titolo a una conversazione o decidere se un testo è una bozza o
//     una domanda non ha bisogno di un modello di frontiera; scrivere l'email
//     che esce dall'azienda sì. La differenza è nella tabella LAVORI.
//   · tradurre gli errori dell'SDK in italiano una volta per tutti.
//
// La regola che tiene insieme il tutto: **il locale non deve mai poter
// peggiorare niente**. Se non c'è, se non risponde, se risponde male, si passa
// a Claude e chi ha chiamato non se ne accorge. Un'app che si rompe perché non
// hai installato una cosa che non ti abbiamo chiesto di installare è peggio di
// un'app che costa.

import Anthropic from '@anthropic-ai/sdk'
import { leggi, modello, nellaLingua } from './config.ts'
import * as abbonamento from './abbonamento.ts'

// — chi c'è —

/** C'è una chiave a consumo su cui appoggiarsi? */
function conLaChiave(): boolean {
  return !!(leggi().claude?.apiKey || process.env.ANTHROPIC_API_KEY)
}

/**
 * Myynd può ragionare?
 *
 * La domanda che fa tutta l'app — «Claude è collegato?» — non ha mai voluto
 * dire «c'è una chiave API». Voleva dire questo. Finché la chiave era l'unica
 * strada le due cose coincidevano, e la funzione poteva permettersi di
 * rispondere alla domanda sbagliata senza che si vedesse.
 *
 * Adesso non coincidono più. Chi collega il suo abbonamento e nessuna chiave ha
 * un'app che ragiona benissimo, e con la vecchia riga si sarebbe trovato ogni
 * schermata a dirgli di collegare Claude — mentre Claude rispondeva. Cambiare
 * qui le sistema tutte insieme: sono tre i posti che lo chiedono, e nessuno di
 * loro ha mai voluto sapere *come* ragiona, solo *se*.
 */
export function collegato(): boolean {
  return conLaChiave() || abbonamento.pronto()
}

/**
 * Il client di Claude, con i tempi che hanno senso per qualcuno che guarda.
 *
 * L'SDK aspetta dieci minuti la prima risposta del server e poi *riprova* due
 * volte: mezz'ora, in silenzio, con la rotella che gira. È una scelta giusta
 * per un lavoro in coda e sbagliata per qualcuno che sta guardando lo schermo,
 * perché il modo in cui si manifesta non è «lento» — è «rotto». Sessanta
 * secondi per cominciare a rispondere sono già larghi: se non ha cominciato,
 * non comincerà, e vale più dirlo che aspettarlo. Chi ha bisogno di più tempo
 * lo chiede per la singola chiamata.
 */
export function cliente(): Anthropic | null {
  const chiave = leggi().claude?.apiKey || process.env.ANTHROPIC_API_KEY
  return chiave ? new Anthropic({ apiKey: chiave, timeout: 60_000, maxRetries: 1 }) : null
}

// — cosa accetta ogni modello —

/**
 * Non tutti i modelli prendono gli stessi parametri, e mandarne uno di troppo
 * non è un avviso: è un 400 che si porta via la richiesta.
 *
 * `effort` e il pensiero adattivo sono arrivati con la generazione 4.6. Su
 * Haiku 4.5 il pensiero, se lo si vuole, si chiede ancora con `budget_tokens`,
 * e `effort` non esiste. Undici delle dodici chiamate dell'app mandavano tutti
 * e due — e la dodicesima era proprio quella che prova la chiave. Il risultato:
 * sceglievi Haiku nelle preferenze, la prova della chiave passava, e da lì in
 * poi non funzionava più niente.
 */
type Capacita = { adattivo: boolean; sforzo: boolean }

const CAPACITA: Record<string, Capacita> = {
  'claude-haiku-4-5': { adattivo: false, sforzo: false },
  'claude-sonnet-5': { adattivo: true, sforzo: true },
  'claude-opus-5': { adattivo: true, sforzo: true }
}

/** In dubbio si assume la generazione nuova: i modelli che aggiungeremo saranno quelli. */
const CAPACITA_IGNOTE: Capacita = { adattivo: true, sforzo: true }

export function capacita(m = modello()): Capacita {
  return CAPACITA[m] ?? CAPACITA_IGNOTE
}

// — che tipo di lavoro è —

/**
 * I lavori, e cosa serve a ciascuno.
 *
 * `frontiera` è la riga che conta. Vera vuol dire: questo testo lo legge una
 * persona fuori dall'azienda, o è la risposta su cui prenderà una decisione —
 * e allora non si risparmia. Falsa vuol dire: è una manovra interna, il
 * risultato non esce da qui, e un modello piccolo che gira su questa macchina
 * fa lo stesso lavoro per zero.
 *
 * Il brief è netto sul perché la distinzione non si può sfumare: «una risposta
 * sbagliata detta con sicurezza sul lavoro della tua azienda costa più fiducia
 * di quanta ne guadagnino cinquanta risposte giuste». Un titolo sbagliato in
 * un elenco di chat costa nulla. Non sono la stessa cosa e non vanno trattate
 * allo stesso modo.
 */
export type Lavoro =
  | 'risposta'      // la chat: quello che legge lei e su cui decide
  | 'bozza'         // svolgere un compito: quello che esce dall'azienda
  | 'lettura'       // il feed: cosa merita la sua attenzione oggi
  | 'titolo'        // il nome di una conversazione
  | 'classifica'    // è una cosa fatta o una domanda?
  | 'traduzione'    // le stesse frasi, nell'altra lingua
  | 'estrazione'    // cosa vale la pena ricordare di questo scambio
  | 'giudizio'      // cosa vuole dirmi con questa risposta
  | 'cernita'       // quali di questi messaggi si possono mettere via
  | 'domande'       // cosa gli serve sapere per andare avanti, con le opzioni
  | 'rassegna'      // quali titoli di giornale vale la pena leggere stamattina
  | 'ricetta'       // da una frase sua a un'automazione che gira davvero
  | 'ritratto'      // mettere in ordine quello che ha già capito di come lavora

type Profilo = {
  frontiera: boolean
  ragiona: boolean
  sforzo: 'low' | 'medium' | 'high'
  attesa: number
}

const LAVORI: Record<Lavoro, Profilo> = {
  // Frontiera: qui non si risparmia.
  risposta:   { frontiera: true,  ragiona: true,  sforzo: 'medium', attesa: 60_000 },
  // Cinque minuti, non uno: è lavoro di sfondo, nessuno sta guardando, e con
  // sedicimila token di tetto una bozza lunga scadrebbe sempre.
  bozza:      { frontiera: true,  ragiona: true,  sforzo: 'medium', attesa: 300_000 },
  lettura:    { frontiera: true,  ragiona: true,  sforzo: 'medium', attesa: 120_000 },
  // La domanda è semplice — «questa è una newsletter?» — ma la risposta toglie
  // roba dalla casella di qualcuno. Sbagliarne una costa più di quanto costi
  // qui il modello grande, quindi frontiera anche per una cosa da poco.
  cernita:    { frontiera: true,  ragiona: false, sforzo: 'low',    attesa: 120_000 },
  // Le opzioni buone valgono più della domanda: sono il momento in cui si
  // scopre cosa sa fare. Un modello piccolo le fa generiche, e generiche non
  // servono a niente — si preferisce pagare qui che far scrivere a mano.
  domande:    { frontiera: true,  ragiona: false, sforzo: 'low',    attesa: 90_000 },
  // Frontiera, e per una volta non per il costo di sbagliare in pubblico: una
  // ricetta scritta male gira ogni mattina per mesi, e il modo in cui sbaglia è
  // il peggiore — non si rompe, fa *quasi* quello che avevi chiesto. Si scrive
  // due o tre volte in tutta la vita di un'installazione: pagarla bene è la
  // spesa più facile da giustificare che ci sia in questa tabella.
  ricetta:    { frontiera: true,  ragiona: false, sforzo: 'medium', attesa: 90_000 },

  // Manovre interne: il locale le fa uguale.
  //
  // La rassegna sta qui e non fra le frontiera, e la ragione è la stessa che
  // vale per il titolo di una chat: sbagliare non fa danno. Scegliere otto
  // titoli di giornale su settanta è un lavoro di gusto, il materiale è
  // pubblico, e la notizia scartata a torto è ancora lì domani. Girando quattro
  // volte al giorno su un modello di frontiera diventerebbe la voce di spesa
  // più grossa dell'app senza essere la cosa più importante che fa.
  rassegna:   { frontiera: false, ragiona: false, sforzo: 'low', attesa: 90_000 },
  titolo:     { frontiera: false, ragiona: false, sforzo: 'low', attesa: 20_000 },
  classifica: { frontiera: false, ragiona: false, sforzo: 'low', attesa: 30_000 },
  traduzione: { frontiera: false, ragiona: false, sforzo: 'low', attesa: 60_000 },
  estrazione: { frontiera: false, ragiona: false, sforzo: 'low', attesa: 60_000 },
  giudizio:   { frontiera: false, ragiona: false, sforzo: 'low', attesa: 30_000 },
  /*
   * Il ritratto: riordinare quello che ha già capito, non capirlo.
   *
   * Sta fra le manovre interne per due ragioni che vanno insieme. Il giudizio
   * l'ha già dato qualcun altro — `distilla` e `imparaDallaCorrezione`, che
   * sono frontiera — e qui si tratta solo di riscrivere in cinque righe delle
   * frasi già scritte. E gira da solo, ogni sei ore, per sempre: un lavoro
   * ricorrente e senza rischio pagato al modello grande diventa la voce di
   * spesa più stupida dell'app.
   *
   * Quello che produce non esce da questa macchina e nessuno lo firma: se una
   * riga viene storta, sta in una schermata fatta apposta per correggerla.
   */
  ritratto:   { frontiera: false, ragiona: false, sforzo: 'low', attesa: 90_000 }
}

// — il modello di casa —

const PORTA_LOCALE = process.env.MYYND_OLLAMA ?? 'http://127.0.0.1:11434'

/**
 * I modelli locali che sappiamo fare questo lavoro, dal più capace al più
 * leggero. Si prende il primo che è davvero installato: non chiediamo a
 * nessuno di scaricare niente, si usa quello che c'è già.
 */
const LOCALI_BUONI = [
  'qwen2.5:14b', 'qwen2.5:7b', 'qwen3:8b', 'llama3.1:8b',
  'mistral-nemo', 'gemma2:9b', 'phi4', 'qwen2.5:3b', 'llama3.2:3b'
]

type Sonda = { modello: string | null; quando: number }
let sonda: Sonda = { modello: null, quando: 0 }
const SONDA_VALE = 60_000

/**
 * C'è un modello locale acceso, e ne abbiamo uno che va bene?
 *
 * Si guarda al massimo una volta al minuto: bussare a ogni chiamata
 * aggiungerebbe un giro di rete a un percorso che esiste per essere veloce.
 * Un fallimento non si segna come definitivo — chi accende Ollama a metà
 * giornata deve poterlo usare senza riavviare Myynd.
 */
async function localeDisponibile(): Promise<string | null> {
  const scelto = leggi().locale
  if (scelto?.attivo === false) return null

  const ora = Date.now()
  if (ora - sonda.quando < SONDA_VALE) return sonda.modello

  let trovato: string | null = null
  try {
    const r = await fetch(`${PORTA_LOCALE}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (r.ok) {
      const j = await r.json() as { models?: { name: string }[] }
      const installati = (j.models ?? []).map(m => m.name)
      // quello scelto a mano vince, se c'è davvero
      const preferito = scelto?.modello
      if (preferito && installati.includes(preferito)) trovato = preferito
      else {
        trovato = LOCALI_BUONI.find(b => installati.some(i => i === b || i === `${b}:latest`)) ?? null
        if (trovato) trovato = installati.find(i => i === trovato || i === `${trovato}:latest`) ?? trovato
      }
    }
  } catch { /* non c'è, o non risponde: si va da Claude */ }

  sonda = { modello: trovato, quando: ora }
  return trovato
}

/** Cosa c'è in mano, per dirlo nelle preferenze invece di farlo di nascosto. */
export async function statoLocale(): Promise<{ acceso: boolean; modello: string | null; spento: boolean }> {
  const spento = leggi().locale?.attivo === false
  // la sonda si azzera apposta: chi apre le preferenze vuole lo stato di adesso
  sonda = { modello: null, quando: 0 }
  const m = spento ? null : await localeDisponibile()
  return { acceso: !!m, modello: m, spento }
}

type Messaggio = { role: 'user' | 'assistant'; content: string }

async function chiediAlLocale(
  nome: string,
  o: { system: string; messages: Messaggio[]; max_tokens: number; formato?: object; attesa: number }
): Promise<string> {
  const r = await fetch(`${PORTA_LOCALE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: nome,
      stream: false,
      messages: [{ role: 'system', content: o.system }, ...o.messages],
      // Ollama accetta uno schema JSON qui e ci vincola l'uscita: è quello che
      // rende utilizzabile un modello piccolo su un compito strutturato.
      ...(o.formato ? { format: o.formato } : {}),
      options: {
        // basso di proposito: nessuno di questi lavori vuole fantasia
        temperature: 0.2,
        num_predict: o.max_tokens
      }
    }),
    signal: AbortSignal.timeout(o.attesa)
  })
  if (!r.ok) throw new Error(`ollama ${r.status}`)
  const j = await r.json() as { message?: { content?: string } }
  const testo = j.message?.content ?? ''
  if (!testo.trim()) throw new Error('ollama: risposta vuota')
  return testo
}

// — gli errori, come li direbbe lui —

export function inItaliano(e: unknown): Error {
  if (e instanceof Anthropic.AuthenticationError) return new Error('La chiave di Claude non è più valida.')
  if (e instanceof Anthropic.PermissionDeniedError) return new Error('La chiave non ha accesso a questo modello.')
  if (e instanceof Anthropic.RateLimitError) return new Error('Claude è sotto sforzo in questo momento. Riprova fra poco.')
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new Error('Ci ha messo troppo e ho lasciato perdere. Riprova.')
  if (e instanceof Anthropic.APIConnectionError) return new Error('Non riesco a raggiungere Claude. Controlla la rete.')
  /**
   * Il credito finito arriva come un 400, cioè come «richiesta sbagliata».
   *
   * E finora si leggeva così: «Il modello ha rifiutato la richiesta. Prova a
   * cambiarlo nelle preferenze». Che manda a cambiare modello — l'unica cosa
   * che di sicuro non serve — chi invece deve solo ricaricare la chiave. È il
   * genere di errore che costa un pomeriggio a chi lo riceve, ed è a due
   * righe di distanza dall'essere detto bene.
   */
  if (e instanceof Anthropic.BadRequestError) {
    return /credit balance|billing|quota/i.test(e.message)
      ? new Error('La chiave di Claude è senza credito. Ricaricala su console.anthropic.com.')
      : new Error('Il modello ha rifiutato la richiesta. Prova a cambiarlo nelle preferenze.')
  }
  // un messaggio dell'SDK è in inglese, e la colonna dove finisce dice
  // «in italiano»: meglio una frase generica che una riga di libreria
  return e instanceof Error && /^[A-Z][a-z]+ /.test(e.message) === false ? e : new Error('Non ce l\'ho fatta. Riprova.')
}

// — la richiesta —

export type Esito = { testo: string; rifiutata: boolean; da: 'claude' | 'locale' | 'abbonamento' }

/**
 * I parametri giusti per il modello che ci si trova in mano.
 *
 * Esportata perché la chat li costruisce da sé — ha bisogno di aggiungerci gli
 * strumenti e di andare in streaming — ma la scelta di *quali* parametri sono
 * leciti deve restare una sola, qui.
 */
/** Tutto quello che serve a una richiesta tranne cosa le si sta chiedendo. */
export type Parametri = Omit<Anthropic.MessageCreateParamsNonStreaming, 'messages' | 'system'>

export function parametri(lavoro: Lavoro, max_tokens: number, formato?: object): Parametri {
  const p = LAVORI[lavoro]
  const cap = capacita()
  const fuori: Record<string, unknown> = { model: modello(), max_tokens }

  if (p.ragiona) {
    if (cap.adattivo) {
      fuori.thinking = { type: 'adaptive' }
    } else if (max_tokens > 2048) {
      // la generazione vecchia il pensiero lo chiede ancora così, e il tetto
      // deve stare sotto max_tokens
      fuori.thinking = { type: 'enabled', budget_tokens: Math.min(4000, max_tokens - 1024) }
    }
    // sotto i 2048 token non c'è spazio per pensare: si lascia stare invece di
    // mandare un budget che il server rifiuta
  } else if (cap.adattivo) {
    fuori.thinking = { type: 'disabled' }
  }
  // sui modelli senza pensiero adattivo, «non pensare» è il comportamento di
  // serie: non si manda niente

  const uscita: Record<string, unknown> = {}
  if (cap.sforzo) uscita.effort = p.sforzo
  if (formato) uscita.format = { type: 'json_schema', schema: formato }
  if (Object.keys(uscita).length) fuori.output_config = uscita

  // Si costruisce come un oggetto libero perché *quali* campi esistono dipende
  // dal modello, e si esce tipizzato perché chi chiama non deve saperlo.
  return fuori as Parametri
}

/**
 * Una domanda al modello, e il testo che torna.
 *
 * Il lavoro decide tutto: chi risponde, con quanto sforzo, quanto si aspetta.
 * Chi chiama non sa e non deve sapere se ha risposto Claude o la macchina qui
 * sotto — sa solo che ha una risposta, o un errore in italiano.
 */
/**
 * La lingua, attaccata a ogni istruzione che parte da qui.
 *
 * Stava scritta a mano dentro i prompt, uno per uno, e in tre non c'era. Il
 * risultato lo si vedeva in faccia: l'app in inglese, e in mezzo alla lista una
 * domanda in italiano. Non è un difetto di traduzione — è testo *nato* nella
 * lingua sbagliata, e nessun dizionario del client lo può recuperare.
 *
 * Un'istruzione che va ricordata in venti punti è un'istruzione che prima o poi
 * si dimentica in uno. Qui è impossibile dimenticarla: passa da `chiedi()`, cioè
 * dall'unica porta verso qualsiasi modello, e `src/lingua.test.ts` ha una
 * gemella che controlla che ogni `system:` di questo server ci passi davvero.
 *
 * È idempotente: applicarla due volte non raddoppia la frase.
 */
const REGOLA = '— LINGUA —'

export function conLaLingua(system: string): string {
  if (system.includes(REGOLA)) return system
  return `${system}\n\n${REGOLA}\nScrivi in ${nellaLingua()}: ogni parola che leggerà una ` +
    'persona — titoli, domande, spiegazioni, righe di lista, motivi — va in quella lingua, ' +
    'anche quando il materiale che stai leggendo è scritto in un\'altra. I nomi propri, le ' +
    'citazioni testuali e le cifre restano come sono.'
}

export async function chiedi(o: {
  lavoro: Lavoro
  system: string
  messages: Messaggio[]
  max_tokens: number
  formato?: object
  attesa?: number
}): Promise<Esito> {
  const p = LAVORI[o.lavoro]
  const attesa = o.attesa ?? p.attesa
  // prima di qualsiasi strada: locale o Claude, la lingua è quella dell'app
  o = { ...o, system: conLaLingua(o.system) }

  // Il locale, se il lavoro lo consente e c'è. Un suo fallimento non è un
  // errore dell'app: è solo il motivo per cui adesso si va da Claude.
  if (!p.frontiera) {
    const nome = await localeDisponibile()
    if (nome) {
      try {
        const testo = await chiediAlLocale(nome, { ...o, formato: o.formato, attesa })
        return { testo, rifiutata: false, da: 'locale' }
      } catch (e) {
        console.warn(`myynd · il modello locale non ce l'ha fatta su «${o.lavoro}», passo a Claude:`,
          e instanceof Error ? e.message : e)
      }
    }
  }

  /**
   * L'abbonamento suo, prima della chiave nostra.
   *
   * Qui sta la differenza fra un prodotto che si può vendere e uno che no: chi
   * lo compra non deve trovarsi una bolletta a fine mese per un'app che gira
   * tutti i giorni. Se ha Claude Code sul computer ed è entrato con il suo
   * account, il lavoro passa di lì e non costa niente in più a nessuno.
   *
   * Le due condizioni, e perché sono due.
   *
   * `frontiera` è il lavoro che vale la spesa: una risposta, una bozza, la
   * lettura del feed. Lì si passa di qui sempre, perché sono le chiamate grosse
   * e rade, ed è esattamente il loro profilo che rende conveniente il preambolo
   * da 5.650 token che Claude Code si porta dietro a ogni avvio (misurato in
   * `abbonamento.ts`: non si ammortizza, ogni chiamata li riscrive).
   *
   * `!conLaChiave()` è la seconda, ed è quella che mancava. Il lavoro piccolo —
   * un titolo, una traduzione di quattro righe — al modello di casa costa zero e
   * qui costerebbe 5.650 token del suo tetto: se il modello di casa c'è, questa
   * riga non la raggiunge nemmeno. Ma se non c'è, prima si finiva dritti sulla
   * chiave, cioè a pagare in denaro le sei cose che Myynd fa più spesso — la
   * rassegna gira quattro volte al giorno. Fra spendergli il tetto e mandargli
   * una bolletta, si spende il tetto: è la stessa scelta che ha fatto lui
   * accendendo l'interruttore.
   *
   * Se non risponde non è un guasto: è il motivo per cui adesso si va da Claude.
   */
  if (abbonamento.disponibile() && (p.frontiera || !conLaChiave())) {
    try {
      const testo = await abbonamento.chiedi({ ...o, attesa })
      return { testo, rifiutata: false, da: 'abbonamento' }
    } catch (e) {
      abbonamento.nonRisponde()
      console.warn(`myynd · Claude Code non ce l'ha fatta su «${o.lavoro}», passo alla chiave:`,
        e instanceof Error ? e.message : e)
    }
  }

  const a = cliente()
  if (!a) {
    // Due situazioni diverse, e mandare la seconda a collegare Claude sarebbe
    // mandarla a fare l'unica cosa che ha già fatto.
    throw new Error(abbonamento.scelto()
      ? 'Claude Code non ha risposto, e non c’è una chiave di riserva.'
      : 'Collega Claude e potrò ragionare sul tuo materiale.')
  }

  let r: Anthropic.Message
  try {
    r = await a.messages.create({
      ...parametri(o.lavoro, o.max_tokens, o.formato),
      system: o.system,
      messages: o.messages
    } as Anthropic.MessageCreateParamsNonStreaming, { timeout: attesa })
  } catch (e) {
    throw inItaliano(e)
  }

  if (r.stop_reason === 'refusal') return { testo: '', rifiutata: true, da: 'claude' }

  const testo = r.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
  return { testo, rifiutata: false, da: 'claude' }
}

/**
 * La stessa cosa, ma quello che torna è già un oggetto.
 *
 * Torna `null` invece di lanciare: ogni chiamante di questa funzione fa un
 * lavoro accessorio — la memoria, una domanda, una traduzione — e per tutti
 * quanti «non ci sono riuscito» è una risposta accettabile che non deve
 * rovinare la cosa vera che stava succedendo.
 */
export async function chiediJSON<T>(o: {
  lavoro: Lavoro
  system: string
  messages: Messaggio[]
  max_tokens: number
  formato: object
  attesa?: number
}): Promise<T | null> {
  try {
    const r = await chiedi(o)
    if (r.rifiutata || !r.testo.trim()) return null
    return JSON.parse(estraiJSON(r.testo)) as T
  } catch (e) {
    console.warn(`myynd · «${o.lavoro}» non ha prodotto niente di leggibile:`,
      e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * L'oggetto, ripulito da quello che un modello piccolo ci mette attorno.
 *
 * Claude con uno schema restituisce JSON e basta. Un modello locale, anche
 * vincolato, ogni tanto lo incornicia in un blocco di codice o ci premette una
 * riga di cortesia. Costa tre righe accettarlo, e senza queste tre righe metà
 * del guadagno del locale se ne andrebbe in fallimenti di lettura.
 */
export function estraiJSON(t: string): string {
  const pulito = t.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  if (pulito.startsWith('{') || pulito.startsWith('[')) return pulito
  const primo = pulito.search(/[{[]/)
  if (primo < 0) return pulito
  const apre = pulito[primo]
  const chiude = apre === '{' ? '}' : ']'
  const ultimo = pulito.lastIndexOf(chiude)
  return ultimo > primo ? pulito.slice(primo, ultimo + 1) : pulito
}
