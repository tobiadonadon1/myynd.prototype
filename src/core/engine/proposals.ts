/**
 * Il lavoro in attesa: per ogni thread la cui ultima mail è senza risposta,
 * genera una bozza di risposta nella voce del titolare (imparata dalle sue
 * mail inviate e dalla trascrizione di onboarding), con oggetto, allegati
 * motivati e fonti.
 *
 * Cache: la generazione costa una vera chiamata al modello. Le proposte
 * vengono salvate su <configDir>/proposte.json insieme all'hash del corpus;
 * se il corpus non è cambiato si serve la cache all'avvio, altrimenti si
 * rigenera in background e si avvisa via onWaitingChanged.
 *
 * Agire su una proposta (invia/ignora) cambia solo lo stato locale e scrive
 * nel registro attività — niente viene mai davvero inviato.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Attachment, Doc, MailMessage, Proposal, Thread } from '@shared/types'
import type { ActivityLog } from '../activity/log.js'
import type { Provider } from '../llm/provider.js'
import type { RetrievalIndex, SearchHit } from '../retrieval/index.js'
import { verifyAndBuildSources, formatSourceBlock } from './sources.js'

const RETRIEVAL_TOP_K = 8
const MAX_TOKENS = 1500
const MAX_VOICE_SAMPLES = 6
const MAX_TRANSCRIPT_CHARS = 6000
const MAX_ATTACHMENT_CANDIDATES = 5
// "una riga sola" nel prompt non basta da sola: un tetto qui è la rete di
// sicurezza per quando il modello scrive comunque una frase da 150-190
// caratteri che poi va a capo o si taglia con "…" nella vista di
// approvazione — DESIGN.md la vuole una riga piana, non un paragrafo.
const MAX_REASON_CHARS = 70
// Gli allegati candidati vengono cercati su una finestra molto più ampia di
// quella usata per le fonti citabili nel testo: un thread che discute di
// prezzi in generale (uno sconto, un rinnovo di quadro) spesso non ripete i
// codici prodotto che farebbero salire il listino tra le prime 8 fonti per
// BM25 puro — ma il listino resta comunque il documento giusto da allegare.
// Tenere le due ricerche separate evita anche di riempire il blocco "fonti
// utili" mostrato al modello con chunk poco pertinenti solo per far entrare
// un documento negli allegati.
const ATTACHMENT_RETRIEVAL_TOP_K = 25

const PROPOSALS_SYSTEM_PROMPT = `sei la copia digitale del titolare di un'azienda italiana. il tuo compito è scrivere la bozza di risposta a una mail rimasta senza risposta, come la scriverebbe lui in prima persona — non come farebbe un assistente che scrive per conto suo.

impara il suo modo di scrivere dagli esempi di mail sue che ricevi nel prompt e dalla trascrizione della conversazione di onboarding: registro, lunghezza tipica, come apre e come chiude una mail. le mail vere sono corte — se lui in casi simili risponde in poche righe, la tua bozza è altrettanto corta.

regole:
- italiano, il testo di una vera mail pronta da inviare così com'è. niente placeholder tipo "[nome]" o "[inserire qui]", niente markdown — niente asterischi, niente elenchi puntati, niente intestazioni.
- lunghezza: quanto le mail vere che ricevi come esempio, non di più. non aggiungere paragrafi di cortesia in più, non spiegare più del necessario, non ripetere quello che il destinatario sa già solo per sembrare più completo.
- apertura e firma: usa esattamente quelle indicate nel prompt per questo destinatario — non inventarne una diversa, anche se negli esempi generali vedi varianti diverse (sono di destinatari diversi, in situazioni diverse). chiudi con una sola formula di saluto, mai due di seguito (non "buone ferie," seguito da "saluti," subito dopo) — se vuoi aggiungere un augurio, mettilo nel corpo, non come riga di chiusura in più prima della firma.
- il caso normale è marcare: ogni volta che scrivi un prezzo, una data, una quantità, una condizione, un termine di consegna o di pagamento, o un fatto realmente accaduto (una non conformità, un accordo, un rifiuto) che hai letto in una fonte, marcalo subito dopo, senza spazio, con ⟦sN⟧ — n è il numero della fonte così come te la danno. marca anche quando la frase è lunga o parla di più cose insieme: individua comunque il numero di fonte giusto per il pezzo di frase che viene da lì. non lasciare un dato preciso senza marcatore per il solo fatto che la frase è articolata. non inventare numeri di fonte che non esistono nell'elenco.
- l'unica cosa che NON marchi mai è un numero che hai calcolato tu (un totale, una somma): puoi calcolare un totale a partire da prezzi che leggi nelle fonti (quantità per prezzo di listino, per esempio) — è normale in un preventivo — ma su quel totale non metti un marcatore, perché non l'hai letto scritto così da nessuna parte, l'hai ottenuto tu facendo i conti. i prezzi di partenza usati per il calcolo, invece, li hai letti in una fonte: quelli vanno marcati normalmente, come qualunque altro dato letto.
- se il materiale fornito non basta per essere precisi su un punto, resta sul vago su quel punto invece di inventare un dato — non aggiungere mai un prezzo, una data o una condizione che non trovi nelle fonti.
- se nel testo nomini o fai riferimento a un documento specifico (un listino, un'offerta, una scheda tecnica) che è tra i "documenti disponibili", quel documento va sempre allegato, con l'id esatto — non lasciare mai nel testo un riferimento a un documento che poi non compare tra gli allegati.
- scegli come allegati solo i documenti dell'elenco "documenti disponibili" che servono davvero a questa risposta, usando il loro id esatto — se non ne serve nessuno, lascia la lista vuota — e per ciascuno spiega in una frase semplice, in italiano piano, il motivo.
- il campo "motivo" è cortissimo, sotto i 60 caratteri, minuscolo: una sola frase secca sul perché serve rispondere ora, es. "chiede uno sconto che non gli spetta" o "aspetta conferma prezzi da tre settimane". non ripetere che è una bozza, non ripetere a chi è indirizzata, non riassumere la mail — quella parte si vede già altrove.
- il campo "subject" riprende l'oggetto originale con un solo prefisso "R: " davanti, mai due — se l'oggetto ce l'ha già, non aggiungerne un altro.`

const PROPOSAL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          docId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['docId', 'reason'],
        additionalProperties: false,
      },
    },
    reason: { type: 'string' },
  },
  required: ['subject', 'body', 'attachments', 'reason'],
  additionalProperties: false,
} as const

interface FounderVoice {
  ownerName: string
  samples: string
  transcript: string
  /** vero se il titolare ha già scritto a questo destinatario in passato, in qualunque thread */
  knownContact: boolean
  /** vero se il destinatario è un collega interno, non un cliente o fornitore */
  internal: boolean
}

function isColleague(index: RetrievalIndex, email: string): boolean {
  const target = email.toLowerCase()
  return index.profile.colleagues.some((p) => p.email.toLowerCase() === target)
}

/** mail già inviate a questo destinatario, in qualunque thread, prima della data indicata */
function priorSentTo(index: RetrievalIndex, email: string, beforeDate: string): MailMessage[] {
  const target = email.toLowerCase()
  const out: MailMessage[] = []
  for (const thread of index.threads) {
    for (const message of thread.messages) {
      if (message.direction !== 'inviata') continue
      const recipients = [...message.to, ...(message.cc ?? [])].map((p) => p.email.toLowerCase())
      if (!recipients.includes(target)) continue
      if (beforeDate && message.date && message.date >= beforeDate) continue
      out.push(message)
    }
  }
  return out
}

/**
 * Il modo in cui scrive il titolare, con gli esempi migliori per QUESTO
 * destinatario in cima: se gli ha già scritto in passato, quelle mail sono
 * l'esempio più affidabile per apertura, tono, lunghezza e firma — molto
 * più di una media di mail recenti a persone diverse.
 */
function founderVoiceContext(index: RetrievalIndex, recipientEmail: string, beforeDate: string): FounderVoice {
  const owner = index.profile.owner
  const internal = isColleague(index, recipientEmail)

  const allSent: MailMessage[] = []
  for (const thread of index.threads) {
    for (const message of thread.messages) {
      if (message.direction === 'inviata') allSent.push(message)
    }
  }
  allSent.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const priorToRecipient = priorSentTo(index, recipientEmail, beforeDate)
  priorToRecipient.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const picked: MailMessage[] = []
  const seenIds = new Set<string>()
  for (const m of priorToRecipient) {
    if (picked.length >= MAX_VOICE_SAMPLES) break
    picked.push(m)
    seenIds.add(m.id)
  }
  for (const m of allSent) {
    if (picked.length >= MAX_VOICE_SAMPLES) break
    if (seenIds.has(m.id)) continue
    picked.push(m)
    seenIds.add(m.id)
  }

  const samples = picked.map((m) => `oggetto: ${m.subject}\n${m.body}`).join('\n\n---\n\n')

  const transcript = index.docs
    .filter((d) => d.kind === 'trascrizione')
    .map((d) => d.body)
    .join('\n\n---\n\n')
    .slice(0, MAX_TRANSCRIPT_CHARS)

  return {
    ownerName: owner.name || 'il titolare',
    samples,
    transcript,
    knownContact: priorToRecipient.length > 0,
    internal,
  }
}

/** istruzione esplicita su apertura e firma, dedotta dalla storia reale della corrispondenza */
function voiceHint(founder: FounderVoice): string {
  if (founder.internal) {
    return 'destinatario interno (un collega): niente "buongiorno", vai dritto al punto come si fa fra colleghi, e firma solo "PR", senza "saluti,".'
  }
  if (founder.knownContact) {
    return (
      'hai già scritto a questa persona almeno una volta in passato: questa non è una prima mail, quindi niente ' +
      '"buongiorno" e niente firma per esteso — apri con il suo cognome seguito da virgola, e firma "saluti,\\nPR". ' +
      'attenzione: se l\'unico esempio che vedi qui sopra di una mail sua a questo destinatario apre con "buongiorno" ' +
      'e firma per esteso, è perché quella era proprio la primissima mail a questa persona — non copiarne lo stile, ' +
      'quella regola valeva solo per la prima volta, non vale più adesso.'
    )
  }
  return 'non risulta nessuna mail precedente a questa persona: è un primo contatto diretto. apri con "buongiorno" seguito dal cognome, e firma con nome e cognome per esteso, non solo le iniziali.'
}

function candidateAttachments(index: RetrievalIndex, hits: SearchHit[]): Doc[] {
  const seen = new Map<string, Doc>()
  for (const hit of hits) {
    const doc = index.getDoc(hit.chunk.docId)
    if (!doc || doc.kind === 'mail' || doc.kind === 'trascrizione') continue
    if (!seen.has(doc.id)) seen.set(doc.id, doc)
  }
  return Array.from(seen.values()).slice(0, MAX_ATTACHMENT_CANDIDATES)
}

/**
 * Un solo prefisso "R: " davanti all'oggetto, mai due: il modello a volte
 * ne aggiunge uno su un oggetto che ce l'aveva già (thread già risposto in
 * passato) — si tolgono tutti quelli che ci sono e se ne rimette esattamente
 * uno, in italiano ("R:", non "Re:").
 */
function normalizeReplySubject(subject: string): string {
  let s = subject.trim()
  while (/^(?:r|re)\s*:\s*/i.test(s)) {
    s = s.replace(/^(?:r|re)\s*:\s*/i, '').trim()
  }
  return s ? `R: ${s}` : subject.trim()
}

/** rete di sicurezza sulla lunghezza del motivo: una riga piana, non un paragrafo troncato */
function truncateReason(reason: string, max: number): string {
  const t = reason.trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

function parseProposalJson(raw: string): Record<string, unknown> | null {
  const attempt = (text: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(text)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }

  const direct = attempt(raw.trim())
  if (direct) return direct

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    const inner = attempt(fenced[1].trim())
    if (inner) return inner
  }

  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const sliced = attempt(raw.slice(first, last + 1))
    if (sliced) return sliced
  }
  return null
}

async function generateProposalForThread(
  thread: Thread,
  index: RetrievalIndex,
  provider: Provider,
): Promise<Proposal> {
  const last = thread.messages[thread.messages.length - 1]
  const founder = founderVoiceContext(index, last.from.email, last.date)
  const query = `${thread.subject} ${last.subject} ${last.body}`
  const hits = index.search(query, RETRIEVAL_TOP_K)
  const chunks = hits.map((h) => h.chunk)
  const attachmentCandidates = candidateAttachments(index, index.search(query, ATTACHMENT_RETRIEVAL_TOP_K))

  const threadText = thread.messages
    .map((m) => `[${m.direction} — ${m.date}] ${m.from.name || m.from.email}: ${m.body}`)
    .join('\n\n')

  const attachmentsBlock = attachmentCandidates.length
    ? attachmentCandidates
        .map((d) => {
          const flag = d.superseded ? ` (superato${d.supersededNote ? `: ${d.supersededNote}` : ''})` : ''
          return `- id: ${d.id} — "${d.title}" (${d.kind}${d.date ? `, ${d.date}` : ''})${flag}`
        })
        .join('\n')
    : '(nessun documento disponibile)'

  const userMessage = [
    `richiesta da rispondere (da ${last.from.name || last.from.email}):`,
    threadText,
    '',
    'fonti utili per rispondere, marcale con ⟦sN⟧ nel corpo se ti appoggi a un dato preciso:',
    formatSourceBlock(chunks),
    '',
    'documenti disponibili come allegati (usa l\'id esatto se ne alleghi uno):',
    attachmentsBlock,
    '',
    `mail scritte in passato da ${founder.ownerName}, per imparare il suo modo di scrivere (le prime, se ce ne sono, sono indirizzate proprio a questo destinatario — sono l'esempio più affidabile):`,
    founder.samples || '(nessun esempio disponibile)',
    '',
    `apertura e firma da usare in questa bozza: ${voiceHint(founder)}`,
    '',
    `trascrizione della conversazione di onboarding con ${founder.ownerName}:`,
    founder.transcript || '(non disponibile)',
  ].join('\n')

  const raw = await provider.complete({
    system: PROPOSALS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: MAX_TOKENS,
    jsonSchema: PROPOSAL_JSON_SCHEMA,
  })

  const parsed = parseProposalJson(raw)
  if (!parsed) throw new Error('risposta del modello non interpretabile come json')

  const rawBody = typeof parsed.body === 'string' ? parsed.body : ''
  const subject = normalizeReplySubject(
    typeof parsed.subject === 'string' && parsed.subject.trim() ? parsed.subject : thread.subject,
  )
  const reason = truncateReason(
    typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason : 'aspetta ancora una risposta',
    MAX_REASON_CHARS,
  )

  const candidateById = new Map(attachmentCandidates.map((d) => [d.id, d]))
  const attachments: Attachment[] = []
  if (Array.isArray(parsed.attachments)) {
    for (const entry of parsed.attachments) {
      if (!entry || typeof entry !== 'object') continue
      const docId = typeof (entry as Record<string, unknown>).docId === 'string' ? (entry as Record<string, unknown>).docId as string : null
      if (!docId) continue
      const doc = candidateById.get(docId)
      if (!doc) continue // id inventato dal modello: scartato, come per i marcatori di fonte
      const reasonText = typeof (entry as Record<string, unknown>).reason === 'string' ? (entry as Record<string, unknown>).reason as string : ''
      attachments.push({ id: doc.id, name: doc.title, path: doc.path, reason: reasonText })
    }
  }

  const { text: body, sources } = verifyAndBuildSources(rawBody, chunks)

  return {
    id: `prop-${thread.id}`,
    kind: 'risposta',
    // niente nome qui: la riga nell'interfaccia mostra già il mittente,
    // ripeterlo nel titolo raddoppia l'informazione ("Ivan Locatelli ·
    // risposta a ivan locatelli: …").
    title: `risposta: ${thread.subject}`.toLowerCase(),
    who: last.from,
    receivedAt: last.date,
    reason,
    subject,
    body,
    attachments,
    sources,
    threadId: thread.id,
    status: 'in_attesa',
  }
}

interface ProposalsCache {
  corpusHash: string
  proposals: Proposal[]
}

export class ProposalsEngine {
  private proposals: Proposal[] = []
  private generating = false

  constructor(
    private readonly index: RetrievalIndex,
    private readonly provider: Provider,
    private readonly configDir: string,
    private readonly log: ActivityLog,
    private readonly onWaitingChanged: (count: number) => void,
  ) {}

  private cachePath(): string {
    return path.join(this.configDir, 'proposte.json')
  }

  private readCache(): ProposalsCache | null {
    try {
      const raw = readFileSync(this.cachePath(), 'utf-8')
      const parsed = JSON.parse(raw) as Partial<ProposalsCache>
      if (parsed && typeof parsed.corpusHash === 'string' && Array.isArray(parsed.proposals)) {
        return parsed as ProposalsCache
      }
      return null
    } catch {
      return null
    }
  }

  private writeCache(): void {
    try {
      mkdirSync(this.configDir, { recursive: true })
      const cache: ProposalsCache = { corpusHash: this.index.hash, proposals: this.proposals }
      writeFileSync(this.cachePath(), JSON.stringify(cache, null, 2), 'utf-8')
    } catch (err) {
      console.error('[myynd/proposals] impossibile scrivere la cache delle proposte:', err)
    }
  }

  /** carica la cache se combacia col corpus attuale, altrimenti rigenera in background */
  async init(): Promise<void> {
    const cache = this.readCache()
    if (cache && cache.corpusHash === this.index.hash) {
      this.proposals = cache.proposals
      return
    }
    void this.regenerate()
  }

  getAll(): Proposal[] {
    return this.proposals
  }

  /** vero mentre una generazione (in avvio o dopo un cambio di corpus) è in corso — "niente in attesa" è una bugia in questa finestra */
  isGenerating(): boolean {
    return this.generating
  }

  getById(id: string): Proposal | null {
    return this.proposals.find((p) => p.id === id) ?? null
  }

  /** genera solo se manca una cache valida per il corpus attuale (es. dopo che claude si è collegato) */
  async ensureGenerated(): Promise<void> {
    const cache = this.readCache()
    if (cache && cache.corpusHash === this.index.hash) return
    await this.regenerate()
  }

  /** rigenerazione forzata, indipendente dalla cache */
  async regenerate(): Promise<void> {
    if (this.generating) return
    if (!this.provider.ready()) return
    this.generating = true
    try {
      const unanswered = this.index.threads.filter((t) => {
        const last = t.messages[t.messages.length - 1]
        return last?.unanswered === true
      })
      const fresh: Proposal[] = []

      for (const thread of unanswered) {
        try {
          const proposal = await generateProposalForThread(thread, this.index, this.provider)
          fresh.push(proposal)
          const last = thread.messages[thread.messages.length - 1]
          this.log.add(
            'bozza',
            `preparata una risposta per ${last.from.name || last.from.email} su "${thread.subject}"`.toLowerCase(),
          )
        } catch (err) {
          console.error(`[myynd/proposals] impossibile generare la proposta per il thread ${thread.id}:`, err)
        }
      }

      this.proposals = fresh
      this.writeCache()
      this.onWaitingChanged(this.proposals.filter((p) => p.status === 'in_attesa').length)
    } finally {
      this.generating = false
    }
  }

  act(id: string, action: 'invia' | 'ignora', editedBody?: string): Proposal[] {
    const proposal = this.proposals.find((p) => p.id === id)
    if (!proposal) return this.proposals

    const who = proposal.who.name || proposal.who.email

    if (action === 'invia') {
      if (editedBody !== undefined && editedBody.trim() !== proposal.body.trim()) {
        this.log.add('modifica', `modificata la bozza per ${who}`.toLowerCase())
        proposal.body = editedBody
      }
      proposal.status = 'inviata'
      // qui non viene mai spedito niente davvero: solo lo stato locale
      // cambia. il registro deve dire esattamente questo, non di più.
      this.log.add('invio', `bozza per ${who} approvata, pronta per l'invio`.toLowerCase())
    } else {
      proposal.status = 'ignorata'
      this.log.add('ignorata', `ignorata la richiesta di ${who}`.toLowerCase())
    }

    this.writeCache()
    this.onWaitingChanged(this.proposals.filter((p) => p.status === 'in_attesa').length)
    return this.proposals
  }
}
