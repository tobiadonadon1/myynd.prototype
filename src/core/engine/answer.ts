/**
 * Fare una domanda e ottenere una risposta: recupera i passaggi migliori,
 * costruisce un prompt compatto, fa lo streaming della risposta, e ne
 * ricava lo stato (ok / insufficiente / non_disponibile) e le fonti citate.
 *
 * Il system prompt qui sotto è il testo più importante di questo motore:
 * impone l'italiano, il minuscolo, la brevità da collega che sa già la
 * risposta, e soprattutto impone di dire "non lo so" invece di inventare.
 */
import type { Answer } from '@shared/types'
import type { ActivityLog } from '../activity/log.js'
import type { Provider } from '../llm/provider.js'
import type { RetrievalIndex } from '../retrieval/index.js'
import { verifyAndBuildSources, formatSourceBlock, sweepMalformedBrackets } from './sources.js'

const TOP_K = 6
const MAX_TOKENS = 700

export const ASK_SYSTEM_PROMPT = `sei la copia digitale del titolare di un'azienda italiana. i colleghi fanno domande a te invece di interrompere lui, e tu rispondi solo con quello che leggi davvero nei passaggi che ti vengono dati — mail, documenti, listini, verbali di riunione.

come rispondi:
- italiano, tutto minuscolo, due o tre frasi al massimo. la risposta diretta, come la direbbe a voce un collega che la sa già — non un ufficio che scrive un documento.
- vai dritto al punto. mai un riassunto dei documenti, mai un elenco puntato, mai markdown, mai la frase "in base ai documenti forniti" o equivalenti — quella frase non va scritta mai.
- ogni affermazione che viene da una fonte va marcata subito dopo, senza spazio, con ⟦sN⟧ — n è il numero della fonte così come te la danno. non inventare numeri che non esistono nell'elenco.
- una fonte segnata come superata serve solo a capire cosa è cambiato: la risposta sul presente si appoggia sempre sulla fonte corrente, mai su quella superata — ma puoi nominare entrambe se la domanda chiede cosa è cambiato.
- se le fonti che ricevi non contengono davvero la risposta, scrivi esattamente "non lo so" seguito da una virgola e una frase brevissima su cosa manca, e nient'altro — niente marcatori in quel caso.
- non inferire, non dedurre da un caso simile, non completare con quello che "di solito" succede. se non è scritto nelle fonti, non lo sai. una risposta sbagliata detta con sicurezza costa più di cinquanta risposte corrette.`

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function buildUserMessage(question: string, chunks: ReturnType<RetrievalIndex['search']>): string {
  const sourceBlock = formatSourceBlock(chunks.map((h) => h.chunk))
  return `domanda: ${question}\n\nfonti (usa solo queste, marcale con ⟦sN⟧ dove serve):\n${sourceBlock}`
}

/** rimuove ogni marcatore residuo, ben formato o no — il ramo "non lo so" non ne deve mostrare nessuno */
function stripMarkers(text: string): string {
  return sweepMalformedBrackets(text.replace(/⟦s\d+⟧/g, ''))
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** ogni riga sola mostrata a schermo finisce con un punto, come tutte le altre nell'app */
function ensurePeriod(text: string): string {
  const t = text.trim()
  if (!t) return t
  return /[.!?…]$/.test(t) ? t : `${t}.`
}

const NON_LO_SO_TEXT = 'non lo so.'

export async function answerQuestion(
  question: string,
  index: RetrievalIndex,
  provider: Provider,
  onToken: (t: string) => void,
  log: ActivityLog,
  onReset?: () => void,
): Promise<Answer> {
  const trimmed = question.trim()
  log.add('domanda', `chiesto: "${truncate(trimmed, 160)}"`)

  if (!trimmed) {
    onToken(NON_LO_SO_TEXT)
    return { text: NON_LO_SO_TEXT, sources: [], status: 'insufficiente', note: 'la domanda è vuota.' }
  }

  // Il solo caso in cui vale la pena non tentare nemmeno è quello statico:
  // il binario claude non è mai stato trovato su questa macchina, e niente
  // lo cambia finché non lo si installa o l'app non riparte. Ogni altro
  // "non pronto" — non collegato al primo avvio, o irraggiungibile dopo un
  // fallimento vero — può essere transitorio: `getStatus()` è solo
  // l'ultimo esito noto, non una verifica fresca, quindi bloccare qui
  // ogni domanda futura sulla base di un fallimento passato lascerebbe
  // l'app bloccata su "non raggiungibile" anche quando si fosse già
  // ripresa. Si tenta comunque, e l'esito vero di questo tentativo — non
  // quello vecchio — decide lo stato restituito.
  const status = provider.getStatus()
  if (!status.ready && status.reason === 'claude non trovato') {
    return {
      text: '',
      sources: [],
      status: 'non_disponibile',
      note: ensurePeriod(status.reason),
    }
  }

  const hits = index.search(trimmed, TOP_K)
  if (hits.length === 0) {
    onToken(NON_LO_SO_TEXT)
    return {
      text: NON_LO_SO_TEXT,
      sources: [],
      status: 'insufficiente',
      note: 'non ho trovato niente su questo nei documenti e nelle mail.',
    }
  }

  const chunks = hits.map((h) => h.chunk)
  const userMessage = buildUserMessage(trimmed, hits)

  let full = ''
  try {
    for await (const event of provider.stream({
      system: ASK_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: MAX_TOKENS,
    })) {
      if (event.type === 'reset') {
        // il tentativo precedente è morto a metà: scarta tutto quello
        // accumulato finora, non solo i token che arrivano da adesso in
        // poi, altrimenti la coda troncata del tentativo morto resta
        // saldata all'inizio della risposta buona.
        full = ''
        onReset?.()
        continue
      }
      full += event.text
      onToken(event.text)
    }
  } catch (err) {
    console.error('[myynd/answer] errore nella generazione della risposta:', err)
    return {
      text: '',
      sources: [],
      status: 'non_disponibile',
      note: 'il modello non è raggiungibile in questo momento.',
    }
  }

  const trimmedFull = full.trim()
  const lower = trimmedFull.toLowerCase()

  if (lower.startsWith('non lo so')) {
    const note = ensurePeriod(
      stripMarkers(
        trimmedFull
          .slice('non lo so'.length)
          .replace(/^[,:\s]+/, ''),
      ),
    )
    return { text: NON_LO_SO_TEXT, sources: [], status: 'insufficiente', note: note || 'materiale insufficiente.' }
  }

  const { text, sources } = verifyAndBuildSources(trimmedFull, chunks)
  return { text, sources, status: 'ok' }
}
