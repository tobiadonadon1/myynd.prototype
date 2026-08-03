/**
 * Marcatori inline ⟦sN⟧ <-> SourceRef. Condiviso tra answer.ts e
 * proposals.ts: stesso formato di prompt, stessa logica di estrazione e di
 * verifica.
 *
 * Un marcatore non è mai preso sulla fiducia. Prima di diventare una
 * SourceRef deve superare due controlli sulla clausola che lo precede:
 *   (1) sostegno lessicale — almeno due parole di contenuto in comune con
 *       il chunk citato, dopo stopword e stemming;
 *   (2) sostegno numerico — solo il numero più vicino al marcatore (prezzo,
 *       quantità, percentuale, totale — non una data) deve comparire nel
 *       chunk citato, tollerando le diverse formattazioni italiane
 *       (4.302,00 / 4302,00…). Ogni altro numero della frase è ignorato:
 *       un marcatore vouch per quello che gli sta appiccicato davanti, non
 *       per l'intera frase — pretendere il contrario ha già ucciso
 *       citazioni vere due volte (vedi `numbersGrounded` più sotto).
 * Un marcatore che fallisce viene scartato in silenzio: sparisce sia dalle
 * fonti sia dal testo. Un punto mancante non costa niente, un punto che
 * mente costa tutto.
 */
import type { SourceRef } from '@shared/types'
import type { Chunk } from '../retrieval/chunk.js'
import { isStopword, normalize, tokenize } from '../retrieval/tokenize.js'

const MARKER_RE = /⟦s(\d+)⟧/g

const MIN_CONTENT_WORD_OVERLAP = 2

/**
 * Un marcatore va "subito dopo, senza spazio" per prompt, ma il modello non
 * lo rispetta sempre: se resta uno spazio prima, il segno tenue che lo
 * rappresenta finisce visivamente staccato dalla parola che dovrebbe
 * marcare ("…ottone e inox . il prezzo…"). Non è una cosa su cui contare
 * che il modello obbedisca — si applica qui, sempre, prima di qualunque
 * altra elaborazione del testo.
 */
function stripSpaceBeforeMarkers(text: string): string {
  return text.replace(/[ \t]+(?=⟦s\d+⟧)/g, '')
}

/**
 * Sweep finale: rimuove qualunque ⟦…⟧ rimasto nel testo che non sia stato
 * già gestito come marcatore valido. `MARKER_RE` riconosce solo la forma
 * esatta ⟦sN⟧ — qualunque altra cosa il modello scriva fra quelle parentesi
 * (es. ⟦s2,s5→s5⟧, un errore di battitura del modello mai osservato prima
 * ma non per questo impossibile) non viene né verificata né tolta dalla
 * logica sopra, e arriverebbe grezza sullo schermo. Va applicata su ogni
 * strada che porta testo del modello a video, non solo su quella con i
 * marcatori ben formati.
 */
export function sweepMalformedBrackets(text: string): string {
  return text.replace(/⟦[^⟧]*⟧/g, (match) => (/^⟦s\d+⟧$/.test(match) ? match : ''))
}

/**
 * Markdown leggero tolto per la visualizzazione (nel popover della fonte,
 * mai nella verifica): cancelletti dei titoli, asterischi di grassetto e
 * corsivo, righe separatore delle tabelle, pipe delle celle sostituiti da
 * un punto medio leggibile. Il chunk verificato resta quello vero, intatto
 * — questa è solo pulizia estetica di quello che si mostra.
 */
function stripMarkdownForDisplay(text: string): string {
  const isTableRule = (line: string) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line)

  return text
    .split('\n')
    .filter((line) => line.trim() === '' || !isTableRule(line))
    .map((line) => {
      let l = line.replace(/^#{1,6}\s+/, '')
      l = l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
      const row = l.match(/^\s*\|(.*)\|\s*$/)
      if (row) {
        l = row[1]
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(' · ')
      }
      return l
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* ─────────────────────────── frasi associate ai marcatori ────────────────────────── */

/**
 * Ultima frase (o clausola) di un segmento di testo, dopo l'ultimo . ! ? ; :
 * o dall'inizio. Punto e virgola e due punti contano come confine: separano
 * spesso due fatti distinti nella stessa frase ("il vecchio prezzo era del
 * listino 2025, superato: quello attuale è X⟦sN⟧") e restringere la pretesa
 * alla sola clausola citata rende la verifica più precisa senza indebolirla
 * — una clausola più stretta può solo essere più facile da fondare, mai più
 * difficile: se il numero calato dentro quella clausola più stretta non è
 * comunque nel chunk, resta scartata esattamente come prima.
 */
function lastSentence(segment: string): string {
  const trimmed = segment.trim()
  if (!trimmed) return ''
  const re = /[.!?;:](?:\s|$)/g
  let lastIdx = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed))) lastIdx = m.index
  const start = lastIdx === -1 ? 0 : lastIdx + 1
  return trimmed.slice(start).trim()
}

/**
 * Per ogni occorrenza di un marcatore nel testo, la frase che lo fonda: il
 * testo fra la fine del marcatore precedente (o l'inizio) e questo, ridotto
 * all'ultima frase. Marcatori consecutivi senza testo fra loro (⟦s1⟧⟦s2⟧,
 * più fonti per la stessa affermazione) ereditano la stessa frase.
 */
function claimsForMarkers(text: string): { num: number; index: number; length: number; claim: string }[] {
  const occurrences: { num: number; index: number; length: number }[] = []
  const segments: string[] = []
  let cursor = 0
  MARKER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MARKER_RE.exec(text))) {
    segments.push(text.slice(cursor, m.index))
    occurrences.push({ num: Number(m[1]), index: m.index, length: m[0].length })
    cursor = m.index + m[0].length
  }

  let carry = ''
  return occurrences.map((occ, i) => {
    const seg = segments[i]
    if (seg.trim()) carry = lastSentence(seg)
    return { ...occ, claim: carry }
  })
}

/* ─────────────────────────── sostegno lessicale ────────────────────────── */

function contentWordOverlap(claim: string, chunkText: string): number {
  const claimTokens = new Set(tokenize(claim))
  if (claimTokens.size === 0) return 0
  const chunkTokens = new Set(tokenize(chunkText))
  let count = 0
  for (const t of claimTokens) {
    if (chunkTokens.has(t)) count += 1
  }
  return count
}

/* ─────────────────────────── sostegno numerico ─────────────────────────── */

// Cattura una sequenza di cifre con eventuali separatori italiani (punto
// delle migliaia, virgola decimale) o inglesi mescolati — la normalizzazione
// avviene dopo, in parseNumber.
const NUMBER_RE = /\d+(?:[.,]\d+)*/g

// Il controllo numerico riguarda prezzi, quantità, percentuali e totali —
// non le date. "il 12 gennaio" o "del 05/05/2026" citati di sfuggita nella
// stessa frase di un prezzo non devono far fallire la verifica: il 12 non è
// una cifra da controllare, è un giorno del mese. Le date si riconoscono e
// si tolgono dalla pretesa prima di estrarre i numeri — solo dal lato della
// pretesa: il chunk citato resta comunque cercato per intero, quindi questo
// può solo rendere il controllo più preciso, mai più permissivo sui prezzi.
const IT_MONTHS =
  'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre'
const DATE_RE = new RegExp(
  `\\b\\d{1,2}\\s+(?:${IT_MONTHS})(?:\\s+\\d{4})?\\b|\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b`,
  'gi',
)

function stripDates(text: string): string {
  return text.replace(DATE_RE, ' ')
}

/** Interpreta un numero con formattazione italiana: virgola decimale, punto delle migliaia. */
function parseNumber(raw: string): number | null {
  const cleaned = raw.trim()
  if (!cleaned) return null
  const hasDot = cleaned.includes('.')
  const hasComma = cleaned.includes(',')
  let normalized = cleaned

  if (hasDot && hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.')
  } else if (hasDot) {
    const parts = cleaned.split('.')
    const last = parts[parts.length - 1]
    normalized = last.length === 3 && parts.length > 1 ? parts.join('') : cleaned
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function extractNumbers(text: string): number[] {
  const matches = text.match(NUMBER_RE) ?? []
  const out: number[] = []
  for (const raw of matches) {
    const n = parseNumber(raw)
    if (n !== null) out.push(n)
  }
  return out
}

/**
 * Il numero più vicino al marcatore dentro la clausola — l'ultimo che
 * compare nel testo, non il primo. Due tentativi precedenti hanno provato
 * a decidere "quale porzione della frase il marcatore sta citando" con
 * euristiche testuali (spezzare su virgola, restringere e poi tornare
 * all'intera frase se vuoto) e sono oscillati due volte fra "un prezzo
 * inventato passa" e "un prezzo vero viene scartato": il problema non era
 * la messa a punto, era il tentativo stesso di isolare uno "span" di
 * prosa. Un marcatore vouch per quello che gli sta appiccicato subito
 * davanti, non per la frase intera: si prende quindi solo l'ultimo numero
 * prima del marcatore, si ignora ogni altro numero — compreso uno a tre
 * proposizioni di distanza, che non è mai quello che il marcatore sta
 * affermando — e se non c'è nessun numero nella clausola il controllo
 * numerico si fa da parte, lasciando decidere solo la sovrapposizione
 * lessicale.
 */
function nearestNumber(claim: string): number | null {
  const matches = stripDates(claim).match(NUMBER_RE)
  if (!matches || matches.length === 0) return null
  return parseNumber(matches[matches.length - 1])
}

/**
 * vero se il numero più vicino al marcatore (prezzo, quantità, percentuale,
 * totale — non una data, già tolta) compare nel chunk citato. Nessun altro
 * numero della frase conta: un dato inventato si presenta esattamente come
 * un numero appiccicato al marcatore che non è nel chunk, mentre un numero
 * lontano nella stessa frase può legittimamente venire da un'altra fonte o
 * dalla conoscenza generale — pretendere che sia comunque nel chunk citato
 * è quello che ha già ucciso citazioni vere due volte.
 */
function numbersGrounded(claim: string, chunkText: string): boolean {
  const n = nearestNumber(claim)
  if (n === null) return true
  const chunkNumbers = new Set(extractNumbers(chunkText))
  return chunkNumbers.has(n)
}

/* ─────────────────────────── finestra dell'estratto ─────────────────────── */

// Sopra questa soglia l'estratto mostrato non è più tutto il chunk, ma una
// finestra centrata sul punto che fonda davvero la frase — un chunk può
// arrivare a ~900 caratteri e coprire due tabelle di prezzi diverse; senza
// finestratura, passare il mouse su una frase sulle valvole inox può far
// vedere per prime tre righe di raccordi in ottone, cosa che vanifica lo
// scopo della fonte (dev'essere la prova, vista subito, non un indovinello).
const EXCERPT_WINDOW_THRESHOLD = 380
const EXCERPT_WINDOW = 340
const EXCERPT_LEAD = 60

/**
 * Punto nel chunk dove si trova davvero il dato citato dalla pretesa: prima
 * prova un numero della pretesa (il modo più affidabile — è lì che si legge
 * il prezzo), poi la parola di contenuto più lunga in comune. `null` se non
 * si trova nulla di preciso (la finestratura allora non si applica: meglio
 * mostrare il chunk per intero che tagliarlo a caso).
 */
function findAnchor(claim: string, chunkText: string): number | null {
  // solo numeri distintivi: un bare "25" (spesso il resto di un codice
  // prodotto come "DN25") può comparire per caso altrove nel chunk — es.
  // "RTO-25" in tutt'altra tabella — e ancorare nel punto sbagliato. Un
  // prezzo con virgola o punto, o un numero di almeno 3 cifre, è molto più
  // specifico e molto meno soggetto a falsi incontri.
  const rawNumbers = (claim.match(NUMBER_RE) ?? []).filter((raw) => /[.,]/.test(raw) || raw.length >= 3)
  for (const raw of rawNumbers) {
    const idx = chunkText.indexOf(raw)
    if (idx !== -1) return idx
  }

  const normalizedChunk = normalize(chunkText)
  const words = Array.from(
    new Set(
      normalize(claim)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !isStopword(w)),
    ),
  ).sort((a, b) => b.length - a.length)

  for (const w of words) {
    const idx = normalizedChunk.indexOf(w)
    if (idx !== -1) return idx
  }
  return null
}

/**
 * Ritaglia il chunk intorno all'ancora quando è più lungo della soglia,
 * partendo da un confine di paragrafo vicino così la prima riga mostrata
 * abbia senso da sola, invece che dall'inizio del chunk come prima. Sotto
 * soglia, o senza un'ancora precisa, il chunk resta intero come sempre.
 */
function windowedExcerpt(chunkText: string, claim: string): string {
  if (chunkText.length <= EXCERPT_WINDOW_THRESHOLD) return stripMarkdownForDisplay(chunkText)

  const anchor = findAnchor(claim, chunkText)
  if (anchor === null) return stripMarkdownForDisplay(chunkText)

  const before = chunkText.slice(0, anchor)
  const paraBreak = before.lastIndexOf('\n\n')
  let start =
    paraBreak !== -1 && anchor - paraBreak < EXCERPT_WINDOW
      ? paraBreak + 2
      : Math.max(0, anchor - EXCERPT_LEAD)

  // se il paragrafo appena scelto è preceduto da un titolo breve isolato
  // ("## Valvole a sfera in acciaio inox AISI 316"), includilo: dice subito
  // di cosa si sta parlando invece di aprire su una nuda riga di tabella.
  if (start > 0) {
    const priorBreak = chunkText.slice(0, start - 2).lastIndexOf('\n\n')
    const headingStart = priorBreak === -1 ? 0 : priorBreak + 2
    const heading = chunkText.slice(headingStart, start - 2).trim()
    if (heading && !heading.includes('\n') && heading.length < 80) {
      start = headingStart
    }
  }

  let end = Math.min(chunkText.length, start + EXCERPT_WINDOW)
  if (anchor >= end) end = Math.min(chunkText.length, anchor + EXCERPT_LEAD)

  // chiude su un confine di frase entro la finestra, se ce n'è uno comodo
  const windowSlice = chunkText.slice(start, end)
  const sentenceEnds = ['. ', '.\n', '! ', '!\n', '? ', '?\n']
    .map((sep) => windowSlice.lastIndexOf(sep))
    .filter((i) => i !== -1)
  if (sentenceEnds.length > 0) {
    const cut = Math.max(...sentenceEnds) + 1
    if (start + cut > anchor) end = start + cut
  }

  const prefix = start > 0 ? '…' : ''
  const suffix = end < chunkText.length ? '…' : ''
  // il markdown si toglie sul pezzo di testo vero, prima di attaccare i
  // puntini di sospensione: farlo dopo lascerebbe intatto un "## Titolo"
  // che ora comincia con "…" invece che con "#", e le regex che ripuliscono
  // sono ancorate all'inizio riga.
  const core = stripMarkdownForDisplay(chunkText.slice(start, end).trim())
  return `${prefix}${core}${suffix}`
}

/* ─────────────────────────── api pubblica ──────────────────────────────── */

export interface VerifiedMarkers {
  /** testo originale con i marcatori non verificati rimossi */
  text: string
  sources: SourceRef[]
}

/**
 * Estrae dal testo generato le SourceRef corrispondenti ai marcatori ⟦sN⟧,
 * ma solo quelli che superano la verifica di sostegno lessicale e numerico
 * sulla frase che li precede. Un marcatore che il modello ha inventato (un
 * numero senza chunk corrispondente), o che punta a un chunk che non fonda
 * davvero l'affermazione, viene rimosso anche dal testo restituito — un dot
 * senza sostegno è peggio di nessun dot.
 */
export function verifyAndBuildSources(rawText: string, chunks: Chunk[]): VerifiedMarkers {
  const text = stripSpaceBeforeMarkers(rawText)
  const claims = claimsForMarkers(text)
  const decided = new Map<number, boolean>()
  const refs: SourceRef[] = []

  for (const { num, claim } of claims) {
    if (decided.has(num)) continue
    const chunk = chunks[num - 1]
    if (!chunk) {
      decided.set(num, false)
      continue
    }
    const grounded =
      contentWordOverlap(claim, chunk.text) >= MIN_CONTENT_WORD_OVERLAP && numbersGrounded(claim, chunk.text)
    decided.set(num, grounded)
    if (grounded) {
      refs.push({
        id: `s${num}`,
        docId: chunk.docId,
        title: chunk.title,
        kind: chunk.kind,
        path: chunk.path,
        excerpt: windowedExcerpt(chunk.text, claim),
        date: chunk.date,
        superseded: chunk.superseded,
      })
    }
  }

  refs.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))

  const stripped = text.replace(MARKER_RE, (full, numStr) => (decided.get(Number(numStr)) ? full : ''))
  // Sweep finale: qualunque ⟦…⟧ malformato che MARKER_RE non riconosce come
  // marcatore valido (quindi mai deciso, mai gestito sopra) non deve
  // comunque arrivare grezzo sullo schermo.
  const swept = sweepMalformedBrackets(stripped)
  // Un marcatore rimosso non deve mai lasciare uno spazio orfano prima della
  // punteggiatura che lo seguiva (es. "…inox . il prezzo" dopo aver tolto un
  // marcatore preceduto da uno spazio) — pulizia innocua anche quando non è
  // stato tolto nulla.
  const cleanedText = swept.replace(/[ \t]+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ')

  return { text: cleanedText, sources: refs }
}

/** Blocco di fonti numerate da dare al modello nel prompt. */
export function formatSourceBlock(chunks: Chunk[]): string {
  return chunks
    .map((chunk, i) => {
      const n = i + 1
      const flags: string[] = []
      if (chunk.superseded) {
        flags.push(chunk.supersededNote ? `superato: ${chunk.supersededNote}` : 'superato')
      }
      const meta = [`kind: ${chunk.kind}`, chunk.date ? `data: ${chunk.date}` : null, ...flags]
        .filter(Boolean)
        .join(', ')
      return `⟦s${n}⟧ — "${chunk.title}" (${meta})\n${chunk.text}`
    })
    .join('\n\n')
}
