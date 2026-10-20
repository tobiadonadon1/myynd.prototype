// Notare il lato, chiederlo una volta, e fare del sì un mandato.
//
// «it is something that myynd should text you because it changes based per
// user» (20 ottobre 2026). Quindi il lato non è un'impostazione: Myynd guarda
// la posta di un mese, vede dove le cose si accumulano e restano senza la sua
// risposta, e glielo scrive in chat come un collega. Una volta sola: un sì
// diventa un progetto con il mandato già confermato, un no (o il silenzio per
// sette giorni) chiude la cosa per sempre.
//
// La cornice del messaggio la scrive il codice; il modello riempie soltanto il
// perché, cosa farebbe e cosa chiederebbe, e se sbaglia lingua o mette «—» si
// torna alle righe di serie di `LATI`. Del costo non si parla mai.

import * as cfg from './config.ts'
import { lingua, nellaLingua } from './config.ts'
import * as store from './store.ts'
import type { Documento, Domanda } from './store.ts'
import * as progetti from './progetti.ts'
import * as mandato from './mandato.ts'
import { misuraDa } from './mandato-proposta.ts'
import { chiediJSON } from './modello.ts'
import { linguaSbagliata, senzaTrattini } from './testo.ts'
import * as regole from './turno-regole.ts'
import * as x from './connettori/x.ts'
import { POST_MIN } from './da-se.ts'
import { LATI, TEMA_PRIMO, aggiorna, automatica, combacia, idMessaggio, indirizzoDi, lato, leggi, type DefLato, type LatoId } from './lato-lati.ts'

/** Sotto queste mail arrivate in un mese non si sa ancora com'è fatto il suo lavoro di posta. */
export const MAIL_MIN = 15
/** Per X il materiale sono i suoi post: tre volte il minimo di `da-se`, in un mese. */
export const POST_X_MIN = POST_MIN * 3
/** Le settimane diverse in cui deve aver scritto perché X sia una presenza e non un lampo. */
export const SETTIMANE_X_MIN = 3
/** Per un lato di posta servono almeno tante persone diverse che aspettano lui. */
export const CORRISPONDENTI_MIN = 2
/** I punti che servono al primo lato per valere una domanda. */
export const SOGLIA = 10
/** Lasciata senza risposta tanto, la domanda vale un no. */
export const GIORNI_SCADENZA = 7
/** Una riga aperta da più di tanto «scivola». */
const GIORNI_SCIVOLA = 3
const GIORNO = 86_400_000
const SETTIMANA = 7 * GIORNO
const CHAT = 'myynd'

/** Una cosa sua che può scivolare: una riga aperta o una carta scartata. */
export type Cosa = { testo: string; stato: string; quando: string }

export type Segnale = {
  id: LatoId; punti: number; esempi: string[]
  /** Le mail che combaciano (per X, i suoi post), i fili che aspettano lui, le settimane, le cose che scivolano. */
  arrivate: number; aspettano: number; settimane: number; scivolano: number
  /** Le persone diverse che aspettano una sua risposta su questo lato. */
  corrispondenti: number
}

const tempo = (s: string | null | undefined) => { const t = Date.parse(s ?? ''); return Number.isFinite(t) ? t : NaN }
const postX = (d: Pick<Documento, 'id'>) => d.id.startsWith('x:mio:')

/**
 * I lati che la sua roba racconta, il più forte per primo. Pura.
 *
 * `docs`: la posta arrivata (e, se c'è, quella mandata da lui negli stessi
 * fili, con `inviato`) più i suoi post su X (`x:mio:`). Ogni lato ha il suo
 * materiale, e senza non c'è:
 *
 *   · un lato di posta vuole almeno `MAIL_MIN` mail arrivate da persone (né
 *     di massa né di un noreply), conta solo le mail che parlano del lato
 *     (`combacia`), e almeno `CORRISPONDENTI_MIN` persone diverse che
 *     aspettano una sua risposta. Punti = mail + 3 × fili che aspettano +
 *     settimane distinte + 2 × cose che scivolano;
 *   · X si giudica dai suoi post, mai dalle parole delle mail: almeno
 *     `POST_X_MIN` in un mese, in `SETTIMANE_X_MIN` settimane diverse. Punti =
 *     post (fino a 12) + 2 × settimane;
 *   · il video e `libero` non si notano mai: nascono solo dalle sue parole.
 */
export function segnali(docs: readonly Documento[], compiti: readonly Cosa[], adesso: number = Date.now()): Segnale[] {
  const posta = docs.filter(d => !postX(d) && !d.massa && tempo(d.quando) <= adesso + GIORNO && (d.inviato || !automatica(d.autore)))
  const arrivi = posta.filter(d => !d.inviato)
  const post = docs.filter(d => postX(d) && d.tipo !== 'risposta' && tempo(d.quando) <= adesso + GIORNO)
  // l'ultimo messaggio di ogni filo: se non è suo, il filo aspetta lui
  const ultimo = new Map<string, Documento>()
  for (const d of posta) {
    const k = d.filo || d.id
    const u = ultimo.get(k)
    if (!u || tempo(d.quando) > tempo(u.quando)) ultimo.set(k, d)
  }
  const settimaneDi = (v: readonly Documento[]) => new Set(v.map(d => Math.floor(tempo(d.quando) / SETTIMANA)).filter(Number.isFinite)).size
  const titoli = (v: readonly Documento[]) => [...new Set([...v].sort((a, b) => tempo(b.quando) - tempo(a.quando))
    .map(d => (d.titolo ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 5)
  const fuori: Segnale[] = []
  for (const def of LATI) {
    if (!def.parole || def.id === 'video') continue
    if (def.id === 'x') {
      const settimane = settimaneDi(post)
      if (post.length < POST_X_MIN || settimane < SETTIMANE_X_MIN) continue
      fuori.push({ id: 'x', punti: Math.min(post.length, 12) + 2 * settimane, esempi: titoli(post), arrivate: post.length, aspettano: 0, settimane, scivolano: 0, corrispondenti: 0 })
      continue
    }
    if (arrivi.length < MAIL_MIN) continue
    const re = def.parole
    const dentro = arrivi.filter(d => combacia(re, d))
    const fili = new Map<string, string>()
    for (const d of dentro) { const k = d.filo || d.id; if (!fili.has(k)) fili.set(k, indirizzoDi(d.autore) ?? d.id) }
    const chi = new Set<string>()
    let aspettano = 0
    for (const [k, da] of fili) { const u = ultimo.get(k); if (u && !u.inviato) { aspettano++; chi.add(da) } }
    if (chi.size < CORRISPONDENTI_MIN) continue
    const settimane = settimaneDi(dentro)
    const scivolano = compiti.filter(c => {
      if (!re.test(c.testo)) return false
      if (c.stato === 'aperto') return adesso - tempo(c.quando) > GIORNI_SCIVOLA * GIORNO
      return c.stato === 'scartato' || c.stato === 'lasciato'
    }).length
    const punti = dentro.length + 3 * aspettano + settimane + 2 * scivolano
    fuori.push({ id: def.id, punti, esempi: titoli(dentro), arrivate: dentro.length, aspettano, settimane, scivolano, corrispondenti: chi.size })
  }
  // a pari punti vince chi ha più fili che aspettano: è lì che lui manca
  return fuori.sort((a, b) => b.punti - a.punti || b.aspettano - a.aspettano || LATI.findIndex(l => l.id === a.id) - LATI.findIndex(l => l.id === b.id))
}

// — il messaggio —

export type Parti = { perche: string; fa: string[]; chiede: string[] }

/** Chi aspetta, per lato: «4 investors are waiting for your reply». */
const ATTESA: Record<Exclude<LatoId, 'x' | 'libero'>, { it: [string, string]; en: [string, string] }> = {
  investitori: { it: ['investitore aspetta', 'investitori aspettano'], en: ['investor is waiting', 'investors are waiting'] },
  fatture: { it: ['persona aspetta', 'persone aspettano'], en: ['person is waiting', 'people are waiting'] },
  partner: { it: ['partner aspetta', 'partner aspettano'], en: ['partner is waiting', 'partners are waiting'] },
  clienti: { it: ['cliente aspetta', 'clienti aspettano'], en: ['client is waiting', 'clients are waiting'] },
  video: { it: ['persona aspetta', 'persone aspettano'], en: ['person is waiting', 'people are waiting'] }
}

/** Il perché di serie, coi numeri veri: una frase corta, senza punto. */
export function percheDiSerie(s: Segnale, l: 'it' | 'en' = lingua()): string {
  if (s.id === 'x' || s.id === 'libero') {
    return l === 'en' ? `you posted ${s.arrivate} times on X this month` : `questo mese hai pubblicato ${s.arrivate} post su X`
  }
  const n = Math.max(1, s.corrispondenti || s.aspettano)
  const [uno, molti] = ATTESA[s.id][l]
  const chi = `${n} ${n === 1 ? uno : molti}`
  if (l === 'en') return `${chi} for your reply${s.id === 'fatture' ? ' on invoices and payments' : ''}`
  return `${chi} una tua risposta${s.id === 'fatture' ? ' su fatture e pagamenti' : ''}`
}

/** Le parti di serie: il perché coi numeri, e le righe di `LATI`. */
export function partiDiSerie(s: Segnale, l: 'it' | 'en' = lingua()): Parti {
  const def = lato(s.id)!
  return { perche: percheDiSerie(s, l), fa: [...def.fa[l]], chiede: [...def.chiede[l]] }
}

/** Un perché che il modello scrive con la maiuscola e il punto: dopo i due punti si legge in piano. */
const dopoDuePunti = (s: string) => s.trim().replace(/[.!;,]+$/, '').replace(/^([A-Z])([a-z])/, (_, a: string, b: string) => a.toLowerCase() + b)

/**
 * La cornice, scritta qui: due frasi e la domanda, trenta parole al massimo
 * («keep the UI and UX simpler, less clutter»). Il modello riempie solo il
 * perché, la prima cosa che farebbe e il primo momento in cui chiederebbe.
 */
export function messaggio(def: DefLato, p: Parti, l: 'it' | 'en' = lingua()): string {
  const testo = l === 'en'
    ? `I could take over ${def.nome.en}: ${dopoDuePunti(p.perche)}. I'd ${p.fa[0] ?? ''} and always ask ${p.chiede[0] ?? ''}. Shall I?`
    : `Potrei prendere in mano ${def.nome.it}: ${dopoDuePunti(p.perche)}. Da solo ${p.fa[0] ?? ''} e chiedo sempre ${p.chiede[0] ?? ''}. Lo faccio?`
  return senzaTrattini(testo.replace(/\s+/g, ' ').trim())
}

/** Il testo regge: niente «—», breve, nella lingua giusta. */
export function regge(testo: string, l: 'it' | 'en' = lingua()): boolean {
  return !!testo.trim() && !testo.includes('—') && testo.trim().split(/\s+/).length <= 40 && !linguaSbagliata(testo, l)
}

/** Una parte scritta dal modello: corta, senza «—», e mai una parola sul costo. */
const COSTO = /\b(?:costs?|costo|costa|costi|spes[ae]|price[ds]?|tokens?|budget|dollar[is]?|euro)\b|[$€]/i
function parteBuona(s: unknown, max: number): s is string {
  return typeof s === 'string' && !!s.trim() && s.length <= max && !s.includes('—') && !COSTO.test(s)
}

// — le mani, sostituibili solo nelle prove —

type Ferri = { chiediJSON: typeof chiediJSON }
const VERI: Ferri = { chiediJSON: o => chiediJSON(o) }
let ferri: Ferri = VERI
/** Solo per le prove: sostituisce il modello, o lo rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/** Il segno del prompt: il modello finto delle prove lo riconosce da qui. */
export const SEGNO_NOTA = 'SIDE OF THE BUSINESS'
export const SEGNO_RISPOSTA = 'SIDE CHOSEN IN HIS WORDS'

const ISTRUZIONI_NOTA = () => `${SEGNO_NOTA}.
You look at a month of someone's mail and pick the one side of their work you would take over for them, while they sleep and while they work.
You get up to three candidates with real numbers and a few example subjects. Pick one of them.
Write three short parts, in ${nellaLingua()}, plain, no dashes, no numbers you were not given, never about cost or money for the assistant:
perche: one short clause with the numbers that show people are waiting, to follow «I could take over this side:» (at most 90 characters, no full stop).
fa: one to three things you would do on your own, most important first, each a verb phrase that follows «I'd» (or «Da solo» in Italian), at most 60 characters, e.g. «draft each follow-up in your Drafts».
chiede: one or two moments you would always ask first, most important first, each following «always ask», at most 40 characters, e.g. «before sending».`

const schemaNota = (ids: LatoId[]) => ({
  type: 'object',
  properties: {
    lato: { type: 'string', enum: ids },
    perche: { type: 'string' },
    fa: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    chiede: { type: 'array', items: { type: 'string' }, maxItems: 2 }
  },
  required: ['lato', 'perche', 'fa', 'chiede'],
  additionalProperties: false
})

/** Il lato e le parti, dal modello se regge, se no di serie dal primo. Non lancia mai. */
export async function scegli(primi: Segnale[], l: 'it' | 'en' = lingua()): Promise<{ s: Segnale; parti: Parti; daModello: boolean }> {
  const primo = primi[0]
  const serie = { s: primo, parti: partiDiSerie(primo, l), daModello: false }
  try {
    const righe = primi.map(s => `${s.id} · ${lato(s.id)!.nome.en} · ` + (s.id === 'x'
      ? `${s.arrivate} posts of his own in 30 days, seen in ${s.settimane} weeks\n`
      : `${s.arrivate} emails in 30 days, ${s.aspettano} threads waiting for his reply from ${s.corrispondenti} people, seen in ${s.settimane} weeks, ${s.scivolano} things slipping\n`) +
      s.esempi.map(e => `  - ${e}`).join('\n')).join('\n')
    const e = await ferri.chiediJSON<{ lato: string; perche: string; fa: string[]; chiede: string[] }>({
      lavoro: 'giudizio', max_tokens: 500, system: ISTRUZIONI_NOTA(), formato: schemaNota(primi.map(s => s.id)),
      messages: [{ role: 'user', content: righe }]
    })
    if (!e) return serie
    const s = primi.find(p => p.id === e.lato)
    const pulite = (v: unknown, max: number, n: number) => Array.isArray(v) && v.length >= 1 && v.length <= n && v.every(x => parteBuona(x, max))
      ? (v as string[]).map(x => x.trim().replace(/[.;,]+$/, '')) : null
    const fa = pulite(e.fa, 60, 3), chiede = pulite(e.chiede, 40, 2)
    if (!s || !parteBuona(e.perche, 90) || !fa || !chiede) return serie
    const parti = { perche: e.perche.trim(), fa, chiede }
    if (!regge(messaggio(lato(s.id)!, parti, l), l)) return serie
    return { s, parti, daModello: true }
  } catch { return serie }
}

// — scrivere in chat —

function inChat(id: string, ruolo: 'a' | 'u', testo: string) {
  if (!store.esisteChat(CHAT)) store.creaChat(CHAT, 'Myynd')
  store.salvaMessaggio({ id, chat: CHAT, ruolo, testo })
}
const nuovoId = () => `mm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// — notare —

const notte = (adesso: Date) => {
  const t = cfg.leggi().turno ?? {}
  return regole.inNotte(adesso, {
    da: regole.oraValida(t.notteDa) ? t.notteDa : regole.NOTTE_DI_SERIE.da,
    a: regole.oraValida(t.notteA) ? t.notteA : regole.NOTTE_DI_SERIE.a
  })
}

/** La domanda lasciata cadere per sette giorni vale un no. Torna se l'ha chiusa. */
export function scadi(adesso: number = Date.now()): boolean {
  const s = leggi()
  if (!s.notato || s.scelto || s.rifiutato) return false
  const d = store.domanda(s.notato.domanda)
  if (!d || d.stato !== 'aperta') return false
  if (adesso - tempo(d.creata) < GIORNI_SCADENZA * GIORNO) return false
  store.chiudiDomanda(d.id, 'ignorata', undefined, 'lasciata cadere per sette giorni')
  ignorata(d, adesso)
  return true
}

/** Le cose sue che possono scivolare: le righe aperte e le carte scartate in un mese. */
function cose(): Cosa[] {
  const righe = store.elencoCompiti().filter(c => c.stato === 'aperto' && !c.sparito)
    .map(c => ({ testo: `${c.titolo ?? ''} ${c.testo}`, stato: 'aperto', quando: c.creato }))
  const scartate = store.elencoFeed('scartato', 30 * 24)
    .map(r => ({ testo: `${r.titolo ?? ''} ${r.testo ?? ''}`, stato: 'scartato', quando: r.risposto || r.quando }))
  return [...righe, ...scartate]
}

/**
 * C'è una domanda aperta che conta: una di cui lui è ancora in tempo a
 * rispondere. Una lasciata lì da più di sette giorni è stantia (`scadi` fa lo
 * stesso con la nostra): non si chiude e non si tocca, ma non impedisce a
 * Myynd di chiedere il lato. Sul conto di Tobia ce n'erano sette aperte, la
 * più vecchia del 22 settembre, e il lato non veniva mai chiesto.
 */
export function inSospeso(adesso: number = Date.now()): boolean {
  const d = store.domandaAperta()
  if (!d) return false
  const t = tempo(d.creata)
  return !Number.isFinite(t) || adesso - t < GIORNI_SCADENZA * GIORNO
}

/** La posta di un mese con le sue risposte negli stessi fili, e i suoi post su X. */
function materiale(adesso: number): { docs: Documento[] } {
  const arrivi = store.postaArrivataRecente(30, 400).filter(d => !d.massa)
  const visti = new Set(arrivi.map(d => d.id))
  const sue: Documento[] = []
  for (const filo of new Set(arrivi.map(d => d.filo).filter((f): f is string => !!f))) {
    for (const d of store.stessoFilo(filo, [], 30)) if (d.inviato && !visti.has(d.id)) { visti.add(d.id); sue.push(d) }
  }
  let post: Documento[] = []
  try {
    post = x.recenti(30, adesso).post.filter(p => !p.risposta)
      .map(p => ({ id: p.id, fonte: 'x', tipo: 'post', titolo: p.testo.slice(0, 120), corpo: p.testo, quando: p.quando, inviato: true }))
  } catch { /* X è un di più */ }
  return { docs: [...arrivi, ...sue, ...post] }
}

/**
 * Nota il lato e lo chiede, al più una volta al giorno e una volta sola nella
 * vita del conto. Gira dentro la preparazione, ogni quarto d'ora. Torna la
 * domanda aperta, o null. Non lancia mai.
 */
export async function forseNota(adesso: number = Date.now()): Promise<Domanda | null> {
  try {
    scadi(adesso)
    const s = leggi()
    if (s.notato || s.scelto || s.rifiutato) return null
    const ora = new Date(adesso)
    const oggi = regole.giornoDi(ora)
    if (s.tentato === oggi) return null
    if (notte(ora)) return null
    const c = cfg.leggi()
    // l'intervista è fatta quando sa come si chiama e che lavoro fa
    if (!c.nome?.trim() || !c.ruolo?.trim()) return null
    if (inSospeso(adesso) || store.domandaGiaFatta(TEMA_PRIMO)) return null
    aggiorna(st => { st.tentato = oggi })

    // il materiale lo guarda ogni lato per sé (`segnali`): senza materiale per nessuno, nessun lato
    const m = materiale(adesso)
    const tutti = segnali(m.docs, cose(), adesso)
    if (!tutti.length || tutti[0].punti < SOGLIA) return null
    const l = lingua()
    const { s: vinto, parti } = await scegli(tutti.slice(0, 3), l)
    const def = lato(vinto.id)!
    let testo = messaggio(def, parti, l)
    if (!regge(testo, l)) testo = messaggio(def, partiDiSerie(vinto, l), l)

    // la domanda prima, il messaggio dopo: un messaggio senza domanda non ha risposta
    if (inSospeso(adesso)) return null
    const d = store.apriDomanda({ tema: TEMA_PRIMO, testo, spunto: [vinto.id, ...vinto.esempi] })
    if (!d || d.tema !== TEMA_PRIMO) return null
    aggiorna(st => { st.notato = { id: vinto.id, quando: ora.toISOString(), domanda: d.id, punti: vinto.punti } })
    inChat(idMessaggio(d.id), 'a', testo)
    console.log(`myynd · lato · notato · ${vinto.id} · ${vinto.punti}`)
    return d
  } catch (e) {
    console.warn('myynd · lato · la nota non è partita:', e instanceof Error ? e.message : e)
    return null
  }
}

// — la risposta —

// la fine della parola a mano: con «sì» \b non vede il confine dopo la «ì»
const SI = /^\s*(?:s[iì]|yes|yep|yeah|ok(?:ay)?|sure|certo|va bene|go ahead|do it|fallo|vai|d'accordo|perfetto|volentieri)(?=$|[\s,.!;:])/i
/**
 * Un no, o un «non adesso»: una risposta che comincia così rifiuta, qualunque
 * cosa segua («No, thanks», «Not interested», «No grazie, non ora», «later»,
 * «maybe later»). Prima contava solo la risposta intera, e «No, thanks»
 * faceva nascere un progetto «No, thanks» col mandato confermato. «No
 * problem» è un sì, non un no.
 */
const NO = /^\s*(?:no(?!\s+(?:problem|worries|worry|doubt|prob)\b)|nope|nah|nay|non ora|non adesso|non mi interessa|non voglio|non serve|non ho bisogno|non ne ho bisogno|not now|not yet|not interested|not today|not really|maybe later|later|forse dopo|magari dopo|più tardi|dopo|un'altra volta|lascia stare|lascia perdere|leave it|never ?mind|skip|passo|grazie,? no|thanks,? no|thank you,? no|i'?m good|i am good|don'?t|do not|stop)(?=$|[\s,.!;:?'’])/i
const MA = /\b(?:ma|but|però|instead|invece|actually|piuttosto)\b/i

/** Il nome corto del progetto che nasce dal sì, nella sua lingua. */
const NOMI: Record<Exclude<LatoId, 'libero'>, { it: string; en: string }> = {
  investitori: { it: 'Follow-up investitori', en: 'Investor follow-ups' },
  fatture: { it: 'Fatture da incassare', en: 'Invoices to chase' },
  partner: { it: 'Risposte ai partner', en: 'Partner replies' },
  clienti: { it: 'Risposte ai clienti', en: 'Client replies' },
  x: { it: 'Presenza su X', en: 'X presence' },
  video: { it: 'Video dei progetti', en: 'Project videos' }
}

const pulita = (s: string, max: number) => senzaTrattini(s.replace(/\s+/g, ' ').trim()).slice(0, max).trim()

/** Il verbo con cui comincia una frase detta a voce («handle my invoices»): un nome di progetto non lo ha. */
const VERBO = /^(?:please\s+)?(?:(?:take|taking)\s+over|handle|take|do|manage|run|look\s+after|deal\s+with|work\s+on|take\s+care\s+of|prendi(?:\s+in\s+mano)?|gestisci|occupati\s+(?:di|delle|dei|degli)|segui|fai|fare|gestire|prendere(?:\s+in\s+mano)?|seguire)\s+/i
const ARTICOLO = /^(?:(?:my|the|our|all|of|some|di|del|dello|della|dei|degli|delle|il|lo|la|le|i|gli|l'|i\s+miei|le\s+mie|la\s+mia|il\s+mio|i\s+nostri|le\s+nostre|miei|mie|mia|mio|nostri|nostre|nostro|nostra|suoi|sue|tuoi|tue)\s+)+/i
/** Il nome di un progetto `libero`: le sue parole senza il verbo e l'articolo davanti, con la maiuscola. */
export function nomeLibero(esito: string): string {
  const senza = esito.trim().replace(VERBO, '').replace(ARTICOLO, '').replace(/^l'/i, '')
  const nome = pulita(senza || esito, 40).replace(/[.!?]+$/, '')
  return nome.replace(/^./, c => c.toUpperCase())
}

/**
 * Le sue parole che dicono un altro lato: prima le parole di `LATI` (se nomina
 * un lato che conosciamo è quello, anche quando il modello dice `libero`),
 * poi il modello, che per un lato libero deve confermare che è una parte
 * concreta del suo lavoro con un esito. Altrimenti null: niente da creare.
 */
export async function latoDalleParole(testo: string, l: 'it' | 'en' = lingua()): Promise<{ id: LatoId; esito: string } | null> {
  const def = LATI.find(d => d.parole?.test(testo))
  let modello: { id: LatoId; esito: string } | null = null
  try {
    const e = await ferri.chiediJSON<{ lato: string; esito: string; concreto: boolean }>({
      lavoro: 'giudizio', max_tokens: 200,
      system: `${SEGNO_RISPOSTA}.
Myynd offered to take over one side of this person's work, and they answered with other words.
Pick the side they mean from the list (libero if none fits) and write the outcome they want as one short line in ${nellaLingua()}, no dashes, at most 120 characters.
concreto: true only if their words name a concrete part of their work that someone could take over and finish, false for a question, a refusal, thanks or anything vague.
Sides: ${LATI.map(d => `${d.id} (${d.nome.en})`).join(', ')}.`,
      formato: {
        type: 'object',
        properties: { lato: { type: 'string', enum: LATI.map(d => d.id) }, esito: { type: 'string' }, concreto: { type: 'boolean' } },
        required: ['lato', 'esito', 'concreto'], additionalProperties: false
      },
      messages: [{ role: 'user', content: testo }]
    })
    const m = e ? lato(e.lato) : null
    if (m && e!.concreto === true && parteBuona(e!.esito, 140) && !linguaSbagliata(e!.esito, l)) modello = { id: m.id, esito: pulita(e!.esito, 140) }
  } catch { /* si va a parole */ }
  if (def && !(modello && modello.id !== 'libero')) return { id: def.id, esito: def.esito[l] }
  if (modello && modello.id !== 'libero') return { id: modello.id, esito: lato(modello.id)!.esito[l] || modello.esito }
  return modello
}

/** La risposta del lato: la riga di Myynd, e se la domanda si chiude con questa. */
export type Esito = { riga: string; chiusa: boolean }

/**
 * La risposta alla domanda del lato. Un sì prende il lato notato; un no (o un
 * «non adesso») chiude per sempre; altre parole dicono quale lato vuole, e se
 * non dicono niente di concreto la domanda resta aperta e Myynd chiede quale
 * parte, in due parole. Dal sì nascono il progetto e il mandato confermato
 * (`origine: 'lei'`: l'ha detto lei, rispondendo), e due righe in chat.
 */
export async function rispondi(d: Pick<Domanda, 'id' | 'spunto'>, testo: string): Promise<Esito> {
  const l = lingua()
  const en = l === 'en'
  const sue = testo.trim()
  const s = leggi()
  if (s.scelto) return { riga: en ? 'Already on it.' : 'Ci sto già lavorando.', chiusa: true }
  if (sue) inChat(nuovoId(), 'u', sue)
  const dici = (riga: string, chiusa = true): Esito => { inChat(nuovoId(), 'a', riga); return { riga, chiusa } }

  // «No, handle my invoices»: il no è per il lato proposto, non per tutto. Se dopo nomina un altro lato, vale quello
  const altroLato = LATI.some(d => !!d.parole && d.parole.test(sue.replace(NO, '')))
  if (NO.test(sue) && !MA.test(sue) && !altroLato) {
    aggiorna(st => { st.rifiutato = new Date().toISOString() })
    console.log('myynd · lato · rifiutato')
    return dici(en ? 'Okay, I’ll leave it.' : 'Va bene, lascio stare.')
  }

  const notato = lato(s.notato?.id) ?? lato(d.spunto?.[0])
  let id: LatoId, esito: string, parole: string | undefined
  // una domanda non è un sì: «yes? what would you do» chiede, non risponde
  if (SI.test(sue) && !MA.test(sue) && !sue.includes('?') && notato) {
    id = notato.id; esito = notato.esito[l]
  } else {
    const r = await latoDalleParole(sue, l)
    if (!r) return dici(en ? 'Which part? A few words are enough.' : 'Quale parte? Bastano poche parole.', false)
    id = r.id; esito = r.esito; parole = sue
  }
  const def = lato(id)!
  if (!esito) return dici(en ? 'Which part? A few words are enough.' : 'Quale parte? Bastano poche parole.', false)

  const nome = id === 'libero' ? nomeLibero(esito) : NOMI[id][l]
  const { progetto, esisteva } = progetti.crea({ nome, obiettivo: esito, origine: 'conversazione' })
  // un progetto che c'era già (lo stesso nome, o un suo alias) non è più nostro
  // da fermare: `crea` non lo riapre (come fa solo per 'mano') e il giro lo salta
  if (esisteva && progetto.stato !== 'attivo') {
    console.log(`myynd · lato · il progetto c'era già ed è ${progetto.stato}`)
    return dici(en ? `${progetto.nome} is ${progetto.stato === 'chiuso' ? 'closed' : 'paused'}. Reopen it and tell me again.` : `${progetto.nome} è ${progetto.stato === 'chiuso' ? 'chiuso' : 'fermo'}. Riaprilo e dimmelo di nuovo.`, false)
  }
  // se aveva già un mandato scritto, proposto o confermato, le sue regole restano
  // le sue: il lato ci lavora dentro, non le riscrive
  if (!(esisteva && mandato.scritto(progetto.id))) {
    mandato.salva(progetto.id, {
      esito, misura: def.misura[l] || misuraDa(esito, l), classi: def.classi
    }, { conferma: true, origine: 'lei' })
  }
  aggiorna(st => { st.scelto = { id, esito, progetto: progetto.id, quando: new Date().toISOString(), ...(parole ? { parole } : {}) } })
  console.log(`myynd · lato · scelto · ${id}`)
  const cosa = id === 'libero' ? progetto.nome.replace(/^([A-Z])([a-z])/, (_, a: string, b: string) => a.toLowerCase() + b) : def.nome[l]
  return dici(en ? `Done. From tonight I’ll handle ${cosa}.` : `Fatto. Da stanotte prendo in mano ${cosa}.`)
}

/** Lasciata cadere, o tolta: un no, e non si chiede più. */
export function ignorata(_d?: Pick<Domanda, 'id'> | null, adesso: number = Date.now()) {
  aggiorna(st => { if (!st.scelto) st.rifiutato = new Date(adesso).toISOString() })
  console.log('myynd · lato · rifiutato')
}
