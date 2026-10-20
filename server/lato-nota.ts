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
import { LATI, TEMA_PRIMO, aggiorna, idMessaggio, lato, leggi, type DefLato, type LatoId } from './lato-lati.ts'

/** Sotto queste mail arrivate in un mese non si sa ancora com'è fatto il suo lavoro. */
export const MAIL_MIN = 15
/** I punti che servono al primo lato per valere una domanda. */
export const SOGLIA = 6
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
  /** Le mail che combaciano, i fili che aspettano lui, le settimane, le cose che scivolano. */
  arrivate: number; aspettano: number; settimane: number; scivolano: number
}

const tempo = (s: string | null | undefined) => { const t = Date.parse(s ?? ''); return Number.isFinite(t) ? t : NaN }
const postX = (d: Pick<Documento, 'id'>) => d.id.startsWith('x:mio:')

/**
 * I lati che la sua roba racconta, il più forte per primo. Pura.
 *
 * `docs`: la posta arrivata (e, se c'è, quella mandata da lui negli stessi
 * fili, con `inviato`) più i suoi post su X (`x:mio:`). Per lato: punti =
 * mail che combaciano + 2 × fili che aspettano una sua risposta + settimane
 * distinte in cui compare + 2 × cose che scivolano. X conta solo con almeno
 * `POST_MIN` post suoi. `libero` non si nota mai: è solo per le sue parole.
 */
export function segnali(docs: readonly Documento[], compiti: readonly Cosa[], adesso: number = Date.now()): Segnale[] {
  const posta = docs.filter(d => !postX(d) && !d.massa && tempo(d.quando) <= adesso + GIORNO)
  const arrivi = posta.filter(d => !d.inviato)
  const post = docs.filter(d => postX(d) && tempo(d.quando) <= adesso + GIORNO)
  // l'ultimo messaggio di ogni filo: se non è suo, il filo aspetta lui
  const ultimo = new Map<string, Documento>()
  for (const d of posta) {
    const k = d.filo || d.id
    const u = ultimo.get(k)
    if (!u || tempo(d.quando) > tempo(u.quando)) ultimo.set(k, d)
  }
  const testoDi = (d: Documento) => `${d.titolo ?? ''} ${(d.corpo ?? '').slice(0, 2000)}`
  const fuori: Segnale[] = []
  for (const def of LATI) {
    if (!def.parole) continue
    const re = def.parole
    if (def.id === 'x' && post.length < POST_MIN) continue
    const dentro = arrivi.filter(d => re.test(testoDi(d)))
    const fili = new Set(dentro.map(d => d.filo || d.id))
    let aspettano = 0
    for (const k of fili) { const u = ultimo.get(k); if (u && !u.inviato) aspettano++ }
    const visti = def.id === 'x' ? [...dentro, ...post] : dentro
    const settimane = new Set(visti.map(d => Math.floor(tempo(d.quando) / SETTIMANA)).filter(Number.isFinite)).size
    const scivolano = compiti.filter(c => {
      if (!re.test(c.testo)) return false
      if (c.stato === 'aperto') return adesso - tempo(c.quando) > GIORNI_SCIVOLA * GIORNO
      return c.stato === 'scartato' || c.stato === 'lasciato'
    }).length
    const arrivate = visti.length
    const punti = arrivate + 2 * aspettano + settimane + 2 * scivolano
    if (!punti) continue
    const esempi = [...new Set([...visti].sort((a, b) => tempo(b.quando) - tempo(a.quando))
      .map(d => (d.titolo ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 5)
    fuori.push({ id: def.id, punti, esempi, arrivate, aspettano, settimane, scivolano })
  }
  // a pari punti vince chi ha più fili che aspettano: è lì che lui manca
  return fuori.sort((a, b) => b.punti - a.punti || b.aspettano - a.aspettano || LATI.findIndex(l => l.id === a.id) - LATI.findIndex(l => l.id === b.id))
}

// — il messaggio —

export type Parti = { perche: string; fa: string[]; chiede: string[] }

const unisci = (v: string[], e: string) => v.length <= 1 ? (v[0] ?? '') : `${v.slice(0, -1).join(', ')} ${e} ${v[v.length - 1]}`
const punto = (s: string) => /[.!?]$/.test(s) ? s : `${s}.`

/** Di cosa parlano le mail di un lato, per dirlo nel perché di serie. */
const ARGOMENTO: Record<Exclude<LatoId, 'x' | 'libero'>, { it: string; en: string }> = {
  investitori: { it: 'di investitori', en: 'from investors' },
  fatture: { it: 'su fatture e pagamenti', en: 'about invoices and payments' },
  partner: { it: 'di partner', en: 'from partners' },
  clienti: { it: 'di clienti', en: 'from clients' },
  video: { it: 'sui video', en: 'about videos' }
}

/** Il perché di serie, coi numeri veri. */
export function percheDiSerie(s: Segnale, l: 'it' | 'en' = lingua()): string {
  if (s.id === 'x' || s.id === 'libero') {
    return l === 'en' ? `You posted on X in ${s.settimane} different weeks this month.` : `Questo mese hai scritto su X in ${s.settimane} settimane diverse.`
  }
  const di = ARGOMENTO[s.id][l]
  const quante = l === 'en' ? `${s.arrivate} emails ${di} came in this month` : `Questo mese sono arrivate ${s.arrivate} mail ${di}`
  const aspettano = s.aspettano
    ? (l === 'en' ? ` and ${s.aspettano} are waiting for your reply.` : ` e ${s.aspettano} aspettano una tua risposta.`)
    : '.'
  return quante + aspettano
}

/** Le parti di serie: il perché coi numeri, e le righe di `LATI`. */
export function partiDiSerie(s: Segnale, l: 'it' | 'en' = lingua()): Parti {
  const def = lato(s.id)!
  return { perche: percheDiSerie(s, l), fa: [...def.fa[l]], chiede: [...def.chiede[l]] }
}

/** La cornice, scritta qui: il modello riempie solo il perché, cosa fa e cosa chiede. */
export function messaggio(def: DefLato, p: Parti, l: 'it' | 'en' = lingua()): string {
  const testo = l === 'en'
    ? `I could take over ${def.nome.en}. ${punto(p.perche)} On my own I'd ${unisci(p.fa, 'and')}. I'd always ask ${unisci(p.chiede, 'or')}. Shall I?`
    : `Potrei prendere in mano ${def.nome.it}. ${punto(p.perche)} Da solo ${unisci(p.fa, 'e')}. Chiederei sempre ${unisci(p.chiede, 'o')}. Lo faccio?`
  return senzaTrattini(testo.replace(/\s+/g, ' ').trim())
}

/** Il testo regge: niente «—», nella lingua giusta. */
export function regge(testo: string, l: 'it' | 'en' = lingua()): boolean {
  return !!testo.trim() && !testo.includes('—') && !linguaSbagliata(testo, l)
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
perche: one sentence with the numbers that show the side piles up (at most 140 characters).
fa: one to three things you would do on your own, each a verb phrase that follows «On my own I'd» (or «Da solo» in Italian), e.g. «draft each follow-up in your Drafts».
chiede: one or two moments you would always ask first, each following «I'd always ask», e.g. «before sending».`

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
    const righe = primi.map(s => `${s.id} · ${lato(s.id)!.nome.en} · ${s.arrivate} emails in 30 days, ${s.aspettano} threads waiting for his reply, seen in ${s.settimane} weeks, ${s.scivolano} things slipping\n` +
      s.esempi.map(e => `  - ${e}`).join('\n')).join('\n')
    const e = await ferri.chiediJSON<{ lato: string; perche: string; fa: string[]; chiede: string[] }>({
      lavoro: 'giudizio', max_tokens: 500, system: ISTRUZIONI_NOTA(), formato: schemaNota(primi.map(s => s.id)),
      messages: [{ role: 'user', content: righe }]
    })
    if (!e) return serie
    const s = primi.find(p => p.id === e.lato)
    const pulite = (v: unknown, max: number, n: number) => Array.isArray(v) && v.length >= 1 && v.length <= n && v.every(x => parteBuona(x, max))
      ? (v as string[]).map(x => x.trim().replace(/[.;,]+$/, '')) : null
    const fa = pulite(e.fa, 90, 3), chiede = pulite(e.chiede, 70, 2)
    if (!s || !parteBuona(e.perche, 140) || !fa || !chiede) return serie
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

/** La posta di un mese con le sue risposte negli stessi fili, e i suoi post su X. */
function materiale(adesso: number): { docs: Documento[]; arrivate: number } {
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
  return { docs: [...arrivi, ...sue, ...post], arrivate: arrivi.length }
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
    if (store.domandaAperta() || store.domandaGiaFatta(TEMA_PRIMO)) return null
    aggiorna(st => { st.tentato = oggi })

    const m = materiale(adesso)
    if (m.arrivate < MAIL_MIN) return null
    const tutti = segnali(m.docs, cose(), adesso)
    if (!tutti.length || tutti[0].punti < SOGLIA) return null
    const l = lingua()
    const { s: vinto, parti } = await scegli(tutti.slice(0, 3), l)
    const def = lato(vinto.id)!
    let testo = messaggio(def, parti, l)
    if (!regge(testo, l)) testo = messaggio(def, partiDiSerie(vinto, l), l)

    // la domanda prima, il messaggio dopo: un messaggio senza domanda non ha risposta
    if (store.domandaAperta()) return null
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
const NO = /^\s*(?:no|nope|non ora|not now|no thanks|no grazie|lascia stare|never mind)\b[\s,.!]*$/i
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

/** Le sue parole che dicono un altro lato: prima il modello, poi le parole di `LATI`, se no `libero`. */
export async function latoDalleParole(testo: string, l: 'it' | 'en' = lingua()): Promise<{ id: LatoId; esito: string }> {
  try {
    const e = await ferri.chiediJSON<{ lato: string; esito: string }>({
      lavoro: 'giudizio', max_tokens: 200,
      system: `${SEGNO_RISPOSTA}.
Myynd offered to take over one side of this person's work, and they answered with other words.
Pick the side they mean from the list (libero if none fits) and write the outcome they want as one short line in ${nellaLingua()}, no dashes, at most 120 characters.
Sides: ${LATI.map(d => `${d.id} (${d.nome.en})`).join(', ')}.`,
      formato: {
        type: 'object',
        properties: { lato: { type: 'string', enum: LATI.map(d => d.id) }, esito: { type: 'string' } },
        required: ['lato', 'esito'], additionalProperties: false
      },
      messages: [{ role: 'user', content: testo }]
    })
    const def = e ? lato(e.lato) : null
    if (def && parteBuona(e!.esito, 140) && !linguaSbagliata(e!.esito, l)) return { id: def.id, esito: pulita(e!.esito, 140) }
  } catch { /* si va a parole */ }
  const def = LATI.find(d => d.parole?.test(testo))
  if (def) return { id: def.id, esito: def.esito[l] }
  return { id: 'libero', esito: pulita(testo.replace(MA, ' '), 140) }
}

/**
 * La risposta alla domanda del lato. Un sì prende il lato notato; un no
 * secco chiude per sempre; altre parole dicono quale lato vuole. Dal sì
 * nascono il progetto e il mandato confermato (`origine: 'lei'`: l'ha detto
 * lei, rispondendo), e due righe in chat. Torna la riga di Myynd; la domanda
 * la chiude chi chiama (`domande.rispondiADomanda`).
 */
export async function rispondi(d: Pick<Domanda, 'id' | 'spunto'>, testo: string): Promise<string> {
  const l = lingua()
  const en = l === 'en'
  const sue = testo.trim()
  const s = leggi()
  if (s.scelto) return en ? 'Already on it.' : 'Ci sto già lavorando.'
  if (sue) inChat(nuovoId(), 'u', sue)
  const dici = (riga: string) => { inChat(nuovoId(), 'a', riga); return riga }

  if (NO.test(sue)) {
    aggiorna(st => { st.rifiutato = new Date().toISOString() })
    console.log('myynd · lato · rifiutato')
    return dici(en ? 'OK. I’ll leave it as it is.' : 'Va bene. Lascio tutto com’è.')
  }

  const notato = lato(s.notato?.id) ?? lato(d.spunto?.[0])
  let id: LatoId, esito: string, parole: string | undefined
  if (SI.test(sue) && !MA.test(sue) && notato) {
    id = notato.id; esito = notato.esito[l]
  } else {
    const r = await latoDalleParole(sue, l)
    id = r.id; esito = r.esito; parole = sue
  }
  const def = lato(id)!
  if (!esito) return dici(en ? 'Noted.' : 'Me lo sono segnato.')

  const nome = id === 'libero' ? pulita(esito, 40).replace(/^./, c => c.toUpperCase()) : NOMI[id][l]
  const { progetto, esisteva } = progetti.crea({ nome, obiettivo: esito, origine: 'conversazione' })
  // un progetto che c'era già (lo stesso nome, o un suo alias) col mandato che
  // lui ha confermato tiene le sue regole: il lato ci lavora dentro, non le riscrive
  const suo = esisteva ? mandato.scritto(progetto.id) : null
  if (!(suo && suo.stato === 'confermato')) {
    mandato.salva(progetto.id, {
      esito, misura: def.misura[l] || misuraDa(esito, l), classi: def.classi
    }, { conferma: true, origine: 'lei' })
  }
  aggiorna(st => { st.scelto = { id, esito, progetto: progetto.id, quando: new Date().toISOString(), ...(parole ? { parole } : {}) } })
  console.log(`myynd · lato · scelto · ${id}`)
  const cosa = id === 'libero' ? progetto.nome : def.nome[l]
  return dici(en ? `Done. From tonight I’ll handle ${cosa}.` : `Fatto. Da stanotte prendo in mano ${cosa}.`)
}

/** Lasciata cadere, o tolta: un no, e non si chiede più. */
export function ignorata(_d?: Pick<Domanda, 'id'> | null, adesso: number = Date.now()) {
  aggiorna(st => { if (!st.scelto) st.rifiutato = new Date(adesso).toISOString() })
  console.log('myynd · lato · rifiutato')
}
