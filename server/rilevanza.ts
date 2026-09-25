import { suppressSender } from './sender-rules.ts'
import type { Documento } from './store.ts'
import { documentoVero } from './veri.ts'
import { FONTI_POSTA } from './connettori/registro.ts'

/** Arrival/indexing time never substitutes for the date of the source. */
export const GIORNI_ATTENZIONE = 7
/**
 * Unread mail from a person stays in view for a month, not a week: a request
 * nobody has opened is still a request. Read mail, bulk mail and files keep
 * the short window, or the feed fills with the past.
 */
export const GIORNI_POSTA_NON_LETTA = 30
const GIORNO = 86_400_000
const normalizza = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

export function indirizzoAttenzione(autore?: string | null): string {
  return autore?.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0].toLowerCase() ?? ''
}

/** Shared mailboxes (hello/info/team/support) can contain real human requests. */
export function mittenteAutomatico(autore?: string | null): boolean {
  const locale = indirizzoAttenzione(autore).split('@')[0] ?? ''
  return /(^|[._+-])(no[._-]?reply|do[._-]?not[._-]?reply|donotreply|newsletters?|promo(tions?)?|marketing|notifications?|notify|alerts?|mailer|bounces?|digest)([._+-]|$)/i.test(locale)
}

const INTERNO = /(?:\b(?:claude|agents?|skill)\.md\b|\b(?:system prompt|developer instructions|tool_use|tool_result|prompt injection)\b|\b(?:agent|agente)\s+[a-z0-9]\s+(?:must|should|will|to|deve)|\b(?:ignore|ignora)\b.{0,45}\b(?:previous|precedenti|system)\b.{0,30}\b(?:instructions|istruzioni)\b)/i
const COMANDO_AGENTE = /\b(?:agent|agente)\s+[a-z0-9]\s+(?:must|should|will|to|deve)|\b(?:ignore|ignora)\b.{0,45}\b(?:previous|precedenti|system)\b.{0,30}\b(?:instructions|istruzioni)\b/i
const DI_POSTA = new Set<string>([...FONTI_POSTA, 'gmail', 'outlook', 'imap'])
const eEmail = (d: Pick<Documento, 'tipo' | 'fonte'>) => d.tipo === 'email' || DI_POSTA.has(d.fonte)
const istruzioniInterne = (testo: string, d: Pick<Documento, 'tipo' | 'fonte'>) => (eEmail(d) ? COMANDO_AGENTE : INTERNO).test(testo)
const ARCHIVIO = /(?:^|[\s_./-])(?:cv|résumé|resume|curriculum(?: vitae)?)(?:$|[\s_./-])|\b(?:employment history|work experience|esperienze lavorative)\b/i
const PROMO = /\b(?:unsubscribe|disiscriviti|annulla l.iscrizione|view (?:this email )?in (?:your )?browser|offerta esclusiva|exclusive offer|limited.time offer|shop now|buy now|flash sale|sale ends|newsletter|weekly digest|daily digest|codice sconto|discount code)\b/i
const TRANSAZIONE = /\b(?:(?:your |il tuo |la tua )?(?:order|package|parcel|shipment|delivery|ordine|pacco|spedizione|consegna)\b.{0,70}\b(?:confirmed|confirmation|shipped|delivered|arrived|arrivato|confermato|consegnat[oa]|spedito|on (?:its|the) way|out for delivery|update|aggiornamento|tracking)|(?:subscription|abbonamento)\b.{0,65}\b(?:renew(?:al|ed|s)?|scadenz[ae]|rinnov[oa]|expires?|payment|pagamento|receipt)|(?:payment|pagamento)\s+(?:received|confirmed|ricevuto|confermato)|(?:receipt (?:for|from)|ricevuta di|order confirmation|conferma (?:dell.?ordine|ordine)))/i
const AZIONE = /\b(?:reply|respond|answer|confirm|approve|review|sign|send|share|choose|decide|update|fix|resolve|schedule|book|submit|provide|complete|pay|return|check|prepare|review|give|tell|rispond(?:i|ere)|conferm(?:a|are)|approv(?:a|are)|rived(?:i|ere)|verific(?:a|are)|firm(?:a|are)|invi(?:a|are)|mand(?:a|are)|scegl(?:i|iere)|decid(?:i|ere)|aggiorn(?:a|are)|corregg(?:i|ere)|risolv(?:i|ere)|fiss(?:a|are)|prenot(?:a|are)|complet(?:a|are)|pag(?:a|are)|restitui(?:sci|re)|controll(?:a|are)|prepar(?:a|are))\b/i
const RICHIESTA = /\b(?:can|could|would|will) you\b|\b(?:please|kindly|ti chiedo|potresti|puoi|per favore|ti va|mi serve|ci serve|need your|needs your|awaiting your|waiting for your|aspetto (?:la tua|una)|attendo (?:la tua|una)|review requested|requested (?:your|a) review|assigned to you|assegnat[oa] a te|action required|richiesta (?:la tua|una)|(?:mi|ci) (?:confermi|confermate|mandi|mandate|dici|dite|fai sapere|fate sapere))\b/i
const DOMANDA_DIRETTA = /\b(?:are you|do you|did you|have you|what (?:do you|are your)|does .{0,65} work|is .{0,65} (?:ok|okay)|sei disponibile|siete disponibili|che ne pensi|cosa ne pensi|ti (?:va|torna)|vi (?:va|torna))\b[^?]{0,200}\?/i

const MARCATORE_INOLTRO = /[- ]{2,}\s*(?:Forwarded message|Messaggio inoltrato)\s*[- ]{2,}/i
const INTESTAZIONI = /^(?:(?:From|Da|Date|Data|Sent|Inviato|Subject|Oggetto|To|A|Cc):.*\n?)+/i

/**
 * Only the current message is evidence; old quoted correspondence is context.
 *
 * A forward with nothing written above it is the exception: what was
 * forwarded *is* the message. Tommaso's «Fwd: There's an issue with your
 * submission» began with the marker line, so the current message was the
 * marker and nothing else; no quote could come from it, and the feed said
 * «nothing to flag». The forwarded body, minus its headers, is the message.
 */
export function corpoAttuale(d: Pick<Documento, 'corpo'>): string {
  const attuale = d.corpo.split(/\n(?:On .{0,160}wrote:|Il .{0,160}(?:ha scritto|scrisse):|[- ]{2,}(?:Original Message|Messaggio originale|Forwarded message|Messaggio inoltrato)|From:|Da:|>)/i)[0].trim()
  const inoltro = d.corpo.match(new RegExp(`${MARCATORE_INOLTRO.source}\\s*\\n([\\s\\S]*)`, 'i'))
  if (inoltro && attuale.replace(MARCATORE_INOLTRO, '').trim().length < 40) {
    const dentro = inoltro[1].replace(INTESTAZIONI, '')
    return dentro.split(/\n(?:On .{0,160}wrote:|Il .{0,160}(?:ha scritto|scrisse):|>)/i)[0].trim()
  }
  return attuale
}

export function contieneRichiesta(testo: string): boolean {
  // A request can be implicit (availability, approval, "let me know").
  // An imperative in an imported task list is not a request from the user.
  return RICHIESTA.test(testo) || DOMANDA_DIRETTA.test(testo)
}

export type Attenzione = { destinazione: 'feed' | 'brief' | 'ignora'; motivo: string }
export function classificaAttenzione(
  d: Documento,
  opzioni: { adesso?: number; progettoAttivo?: boolean; giorniMax?: number } = {}
): Attenzione {
  const no = (motivo: string): Attenzione => ({ destinazione: 'ignora', motivo })
  if (suppressSender(d)) return no('mittente_archiviato_dalla_persona')
  if (/(?:^|[/\\])Desktop[/\\]Myynd(?:[/\\]|$)|(?:^|[/\\])\.myynd[/\\]deliverables(?:[/\\]|$)/i.test(d.percorso ?? '')) return no('consegna_gia_preparata')
  const adesso = opzioni.adesso ?? Date.now()
  const quando = Date.parse(d.quando ?? '')
  const giorni = Math.max(1, Math.min(30, opzioni.giorniMax ?? GIORNI_ATTENZIONE))
  const email = eEmail(d)
  const dallaPersona = email && !d.massa && !mittenteAutomatico(d.autore)
  const finestra = dallaPersona && !d.letto && !d.inviato ? Math.max(giorni, GIORNI_POSTA_NON_LETTA) : giorni
  if (!Number.isFinite(quando) || quando < adesso - finestra * GIORNO || quando > adesso + GIORNO) return no('fonte_non_recente')
  if (d.inviato) return no('gia_inviato')
  const testo = `${d.titolo}\n${corpoAttuale(d).slice(0, 6000)}`
  if (istruzioniInterne(testo, d)) return no('istruzioni_interne')
  if (!email && (ARCHIVIO.test(d.titolo) || ARCHIVIO.test(d.percorso ?? ''))) return no('materiale_di_riferimento')
  if (email) {
    if (!indirizzoAttenzione(d.autore)) return no('mittente_sconosciuto')
    // Service events belong in Brief even when their connector correctly
    // classified the sender as automated or bulk.
    if (TRANSAZIONE.test(testo) && (d.massa || mittenteAutomatico(d.autore) || !contieneRichiesta(testo))) {
      return { destinazione: 'brief', motivo: 'aggiornamento_di_servizio' }
    }
    if (d.massa || mittenteAutomatico(d.autore) || PROMO.test(testo)) return no('posta_in_serie')
    if (d.letto && quando < adesso - GIORNO && !contieneRichiesta(testo)) return no('letta_senza_richiesta')
    return { destinazione: 'feed', motivo: 'posta_diretta_recente' }
  }
  if (!documentoVero(d)) return no('file_tecnico')
  /*
   * Le sue chat con i modelli, quello che ha pubblicato su X, le cartelle in
   * cui lavora: sono parole sue, non richieste che gli arrivano. Una sessione
   * di Claude Code è piena di «please» e «can you», e la lettura del feed la
   * prendeva per una richiesta da soddisfare, ogni dieci minuti, col
   * modello. Al massimo sono novità per il punto; le priorità le leggono per
   * conto loro.
   */
  if (d.fonte === 'conversazioni' || d.fonte === 'x' || d.fonte === 'lavoro') return { destinazione: 'brief', motivo: 'parole_sue' }
  if (d.fonte === 'calendario' || d.tipo === 'evento') return { destinazione: 'brief', motivo: 'evento' }
  if (d.fonte === 'github' && !opzioni.progettoAttivo) return { destinazione: 'brief', motivo: 'attivita_repository' }
  if (!opzioni.progettoAttivo) return no('nessun_progetto_attivo')
  if (!contieneRichiesta(testo)) return { destinazione: 'brief', motivo: 'novita_del_progetto' }
  return { destinazione: 'feed', motivo: 'richiesta_del_progetto' }
}

export type CardDaVerificare = { titolo: string; testo: string; perche?: string; prova?: string }

export function tempoFondato(testo: string, fonte: string): boolean {
  const senzaAccenti = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  testo = senzaAccenti(testo)
  fonte = senzaAccenti(fonte)
  const tempi = [
    /\b(?:monday|luned[iì])\b/i, /\b(?:tuesday|marted[iì])\b/i,
    /\b(?:wednesday|mercoled[iì])\b/i, /\b(?:thursday|gioved[iì])\b/i,
    /\b(?:friday|venerd[iì])\b/i, /\b(?:saturday|sabato)\b/i,
    /\b(?:sunday|domenica)\b/i, /\b(?:today|oggi)\b/i,
    /\b(?:tomorrow|domani)\b/i, /\b(?:this week|questa settimana)\b/i
  ]
  return !tempi.some(t => t.test(testo) && !t.test(fonte))
}

const GIORNI_DELLA_SETTIMANA = [
  /\b(?:sunday|domenica)\b/i, /\b(?:monday|luned[iì])\b/i, /\b(?:tuesday|marted[iì])\b/i,
  /\b(?:wednesday|mercoled[iì])\b/i, /\b(?:thursday|gioved[iì])\b/i, /\b(?:friday|venerd[iì])\b/i,
  /\b(?:saturday|sabato)\b/i
]

/**
 * Le parole relative che una fonte può dire, e a quanti giorni dalla sua data
 * stanno: la stessa lista che `data-carta.assoluto` scioglie nel giorno della
 * settimana. Devono restare uguali: una carta nata da «tonight» dice
 * «Thursday evening», e il filtro della pagina la deve leggere come fondata,
 * altrimenti è salvata e mai mostrata.
 */
const RELATIVI_DELLA_FONTE: readonly [RegExp, number][] = [
  [/\b(?:today|oggi|tonight|stasera|stamattina|stanotte|this morning|this evening)\b/i, 0],
  [/\b(?:tomorrow|domani)\b/i, 1],
  [/\bdopodomani\b/i, 2],
  [/\b(?:yesterday|ieri)\b/i, -1]
]

/**
 * Un giorno nel testo è fondato se la fonte lo nomina, **oppure** se la fonte
 * dice «domani» e il testo dice il giorno che «domani» voleva dire nel
 * calendario della fonte. Strettamente più permissivo di `tempoFondato`: una
 * mail di lunedì che chiede «tomorrow at 9:30» regge una carta che dice
 * «Tuesday 9:30», che è quello che si vuole leggere anche mercoledì. Lo
 * stesso per «tonight» (il giorno della mail), «yesterday» (quello prima).
 */
export function giornoFondato(testo: string, d: Pick<Documento, 'titolo' | 'corpo' | 'autore' | 'quando'>): boolean {
  const senzaAccenti = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const fonte = senzaAccenti(normalizza(`${d.titolo}\n${d.autore ?? ''}\n${corpoAttuale(d)}`))
  if (tempoFondato(testo, fonte)) return true
  const quando = Date.parse(d.quando ?? '')
  if (!Number.isFinite(quando)) return false
  const s = senzaAccenti(testo)
  // «oggi», «domani», «questa settimana» nel testo vogliono comunque la fonte
  for (const t of [/\b(?:today|oggi)\b/i, /\b(?:tomorrow|domani)\b/i, /\b(?:this week|questa settimana)\b/i]) {
    if (t.test(s) && !t.test(fonte)) return false
  }
  const giorno = new Date(quando).getDay()
  const ammessi = new Set<number>()
  for (const [re, k] of RELATIVI_DELLA_FONTE) if (re.test(fonte)) ammessi.add((giorno + k + 7) % 7)
  return GIORNI_DELLA_SETTIMANA.every((re, i) => !re.test(s) || re.test(fonte) || ammessi.has(i))
}

/** Provider schemas and prompts are advisory; these checks fail closed. */
export function validaVoceFeed(
  voce: CardDaVerificare | Record<string, unknown>,
  d: Documento,
  opzioni: { richiediProva?: boolean } = {}
): boolean {
  if (!voce || typeof voce.titolo !== 'string' || typeof voce.testo !== 'string') return false
  const titolo = voce.titolo.trim(), testo = voce.testo.trim()
  if (titolo.length < 10 || titolo.length > 140 || testo.length < 24 || testo.length > 320) return false
  if (!AZIONE.test(titolo) || istruzioniInterne(`${titolo}\n${testo}`, d)) return false
  if (/\b(?:the note instructs|the document instructs|la nota (?:dice|istruisce)|agent [a-z])\b/i.test(`${titolo} ${testo}`)) return false
  if (typeof voce.perche !== 'string' || voce.perche.trim().length < 12 || voce.perche.length > 200) return false
  if (opzioni.richiediProva !== false) {
    if (typeof voce.prova !== 'string' || voce.prova.trim().length < 12 || voce.prova.length > 500) return false
    const prova = normalizza(voce.prova)
    const fonte = normalizza(`${d.titolo}\n${corpoAttuale(d)}`)
    // The quote must be in the current message. From a person it need not
    // contain "please" or "can you": a forwarded problem is a request too.
    // From files and automated mail the request phrasing is still required.
    const dallaPersona = eEmail(d) && !d.massa && !mittenteAutomatico(d.autore)
    if (!fonte.includes(prova) || (!dallaPersona && !contieneRichiesta(prova)) || istruzioniInterne(prova, d)) return false
    // An unrelated request cannot be used as evidence for a fabricated action.
    const famiglie = [
      /\b(?:sign|signature|firm(?:a|are))\b/i,
      /\b(?:pay|payment|pag(?:a|are)|pagamento)\b/i,
      // a reported problem grounds a «fix» card: «there is an issue with X» is how people ask for one
      /\b(?:update|fix|resolve|aggiorn(?:a|are)|corregg(?:i|ere)|risolv(?:i|ere)|issues?|problems?|bugs?|errors?|broken|not working|fail(?:s|ed|ing)?|problem[ai]|error[ei]|non funziona|guast[oa])\b/i,
      /\b(?:send|share|provide|submit|return|invi(?:a|are)|mand(?:a|are)|condivid(?:i|ere)|restitui(?:sci|re))\b/i
    ]
    if (famiglie.some(f => f.test(titolo) && !f.test(prova))) return false
  }
  // Concrete identities/numbers mentioned in the card must be present in
  // the source. The exact request remains available to audit semantic fit.
  const fonte = normalizza(`${d.titolo}\n${d.autore ?? ''}\n${corpoAttuale(d)}`)
  // il giorno che «domani» voleva dire nella fonte regge: questo filtro gira
  // anche a ogni caricamento della pagina, e non deve essere più severo di ieri
  if (!giornoFondato(`${titolo} ${testo}`, d)) return false
  const numeri = `${titolo} ${testo}`.match(/\b\d+(?:[.,]\d+)*\b/g) ?? []
  if (numeri.some(n => !new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(fonte))) return false
  return true
}

export type ContestoAttenzione = Pick<Documento, 'id' | 'fonte' | 'titolo' | 'corpo' | 'autore' | 'quando' | 'filo' | 'messageId'>
export function contestoAttenzione(d: Documento): ContestoAttenzione {
  return { id: d.id, fonte: d.fonte, titolo: d.titolo, corpo: corpoAttuale(d).slice(0, 2500), autore: d.autore, quando: d.quando, filo: d.filo, messageId: d.messageId }
}

const COMUNI = new Set('please could would should your yours their this that with from have will them thank thanks hello regards ciao grazie saluti puoi potresti favore della delle dello degli quale quello questa questo sono perche quindi reply respond response rispondere risposta confirm confermare conferma send inviare review rivedere approve approvare'.split(' '))
export function paroleRilevanti(s: string): Set<string> {
  return new Set(normalizza(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(p => p.length >= 4 && !COMUNI.has(p)))
}
function sovrapposizione(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  const n = [...a].filter(x => b.has(x)).length
  return n / Math.max(a.size, b.size)
}

/** Identity survives folder moves; related feedback is scoped to its sender
 * and subject/content, never to an entire human or their employer. */
export function stessaRichiesta(d: Documento, precedente: ContestoAttenzione): boolean {
  if (d.id === precedente.id) return true
  if (d.messageId && precedente.messageId && d.messageId === precedente.messageId) return true
  const mittente = indirizzoAttenzione(d.autore)
  const stessoMittente = !!mittente && mittente === indirizzoAttenzione(precedente.autore)
  const stessoFilo = !!d.filo && d.filo === precedente.filo && d.fonte === precedente.fonte
  if (!stessoMittente && !stessoFilo && d.fonte !== precedente.fonte) return false
  const corpo = normalizza(corpoAttuale(d)), prima = normalizza(precedente.corpo)
  if ((stessoMittente || d.fonte === precedente.fonte && !mittente) && corpo.length >= 40 && corpo === prima) return true
  if (!stessoMittente && !stessoFilo) return false
  // Invoice/issue numbers, dates and versions distinguish genuinely new work.
  const numeri = (s: string) => (s.match(/\b\d+\b/g) ?? []).sort().join('|')
  if (numeri(`${d.titolo} ${corpo}`) !== numeri(`${precedente.titolo} ${prima}`)) return false
  const soggetto = paroleRilevanti(d.titolo.replace(/^(?:(?:re|fw|fwd|r):\s*)+/i, ''))
  const vecchio = paroleRilevanti(precedente.titolo.replace(/^(?:(?:re|fw|fwd|r):\s*)+/i, ''))
  const parole = paroleRilevanti(corpo), altre = paroleRilevanti(prima)
  return soggetto.size >= 2 && vecchio.size >= 2 && parole.size >= 3 && altre.size >= 3 &&
    sovrapposizione(soggetto, vecchio) >= 0.8 && sovrapposizione(parole, altre) >= 0.7
}

/**
 * Fra quello che è appena arrivato c'è almeno una cosa da feed (P4)?
 *
 * Il giro dei dieci minuti chiamava la lettura del feed per qualunque arrivo:
 * anche per un Mac che aveva appena riletto dei file vecchi di mesi, che il
 * feed poi scarta tutti. Il modello si chiama solo se almeno uno passerebbe.
 * Il progetto conta come attivo: dirlo qui costa meno che sbagliare per difetto.
 */
export function qualcosaDaFeed(nuovi: Pick<Documento, 'id' | 'tipo' | 'fonte' | 'titolo' | 'corpo' | 'autore' | 'quando' | 'percorso'>[], adesso = Date.now()): boolean {
  return nuovi.some(d => classificaAttenzione(d as Documento, { adesso, progettoAttivo: true }).destinazione === 'feed')
}
