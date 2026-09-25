// Quanto si aspetta, in numeri (P10).
//
// «Quando premo Leggi adesso ci mette un'eternità»: prima di aggiustare le
// attese bisogna vederle. Qui si contano le richieste (metodo e forma della
// rotta, mai l'indirizzo vero: niente query, niente id, niente percorsi), il
// ciclo degli eventi quando c'è lavoro in volo, i lavori di fondo, le tappe di
// una risposta in chat, e tre numeri di bordo: quanto dopo l'arrivo di una
// posta nasce la sua carta, quanto dopo il risveglio del Mac, quanto ci mette
// un lavoro affidato.
//
// E un segnale per chi lavora di fondo: «qualcuno sta aspettando» (una
// richiesta contata è in volo, o è finita meno di due secondi fa). I pezzi
// lunghi cedono il passo con `cedi()`, la manutenzione aspetta `quieto()`.
//
// Importa solo `node:perf_hooks` e `chi.ts`: `store.ts` importa questo file.

import { monitorEventLoopDelay } from 'node:perf_hooks'
import * as chi from './chi.ts'

export const SOGLIA = Number(process.env.MYYND_TEMPI_SOGLIA) || 150

type Monitor = { enable(): boolean; disable(): boolean; reset(): void; max: number; percentile(p: number): number }
type Ferri = { ora: () => number; monitor: () => Monitor; log: (riga: string) => void }
const VERI: Ferri = {
  ora: () => performance.now(),
  monitor: () => monitorEventLoopDelay({ resolution: 50 }),
  log: riga => console.log(riga)
}
let ferri: Ferri = VERI

// — le richieste —

const ANELLO = 200
const durate = new Map<string, { v: number[]; i: number }>()
let inVolo = 0
let ultimaFine = Number.NEGATIVE_INFINITY

/** Non si contano: i flussi (restano aperti per minuti), questa rotta, e la rassegna che chiede ogni minuto. */
function nonContata(metodo: string, percorso: string): boolean {
  if (percorso === '/api/tempi' || percorso === '/api/compiti/flusso' || percorso === '/api/sincronizza') return true
  return metodo === 'GET' && percorso === '/api/rassegna'
}

function registra(chiave: string, ms: number) {
  let a = durate.get(chiave)
  if (!a) { a = { v: [], i: 0 }; durate.set(chiave, a) }
  if (a.v.length < ANELLO) a.v.push(ms)
  else { a.v[a.i] = ms; a.i = (a.i + 1) % ANELLO }
}

type Req = { method: string; path?: string; baseUrl?: string; route?: { path?: unknown } }
type Res = {
  write: (...a: never[]) => unknown
  getHeader(n: string): unknown
  once(ev: string, f: () => void): unknown
}

/** Il middleware: una riga nel registro sopra la soglia, e il segnale «qualcuno aspetta». */
export function misuraRichieste(req: Req, res: Res, next: () => void): void {
  const inizio = ferri.ora()
  const metodo = req.method
  let contata = !nonContata(metodo, req.path ?? '')
  let primo: number | null = null
  let chiusa = false
  if (contata) comincia()
  const scrivi = res.write as (...a: unknown[]) => unknown
  res.write = ((...a: unknown[]) => {
    if (primo === null) {
      primo = ferri.ora()
      // un flusso resta aperto: chi guarda non aspetta più, ha già la prima riga
      if (contata && flusso(res)) { contata = false; finisce() }
    }
    return scrivi.apply(res, a)
  }) as Res['write']
  const fine = () => {
    if (chiusa) return
    chiusa = true
    const r = req.route?.path
    const forma = r == null ? 'altro' : (req.baseUrl ?? '') + String(r)
    const fino = flusso(res) && primo !== null ? primo : ferri.ora()
    const ms = Math.max(0, Math.round(fino - inizio))
    const chiave = `${metodo} ${forma}`
    registra(chiave, ms)
    if (ms > SOGLIA) ferri.log(`myynd · tempi · ${chiave} ${ms} ms`)
    if (contata) { contata = false; finisce() }
  }
  res.once('finish', fine)
  res.once('close', fine)
  next()
}

function flusso(res: Res): boolean {
  return String(res.getHeader('Content-Type') ?? '').includes('text/event-stream')
}

/** Una richiesta contata è in volo, o è finita meno di due secondi fa. */
export function qualcunoAspetta(): boolean {
  return inVolo > 0 || ferri.ora() - ultimaFine < 2000
}

/** Nessuna richiesta contata da `ms`. */
export function quieto(ms: number): boolean {
  return inVolo === 0 && ferri.ora() - ultimaFine >= ms
}

/** Cede il passo: un giro del ciclo, e se qualcuno aspetta un poco di più. */
export async function cedi(): Promise<void> {
  contaCessioni++
  await new Promise<void>(r => setImmediate(r))
  if (qualcunoAspetta()) await new Promise<void>(r => setTimeout(r, 25))
}
let contaCessioni = 0
/** Quante volte si è ceduto il passo (per le prove). */
export const cessioni = () => contaCessioni

// — il ciclo degli eventi, solo quando c'è lavoro —

let monitor: Monitor | null = null
let acceso = false
let accesoNelMinuto = false
let spegni: ReturnType<typeof setTimeout> | null = null
let minuto: ReturnType<typeof setInterval> | null = null
let ultimoFermo: { max: number; p99: number; quando: string } | null = null
const lavori = new Map<string, number>()

function comincia() {
  inVolo++
  sveglia()
}
function finisce() {
  inVolo = Math.max(0, inVolo - 1)
  ultimaFine = ferri.ora()
  forseDorme()
}

function sveglia() {
  if (spegni) { clearTimeout(spegni); spegni = null }
  if (acceso) return
  try {
    monitor ??= ferri.monitor()
    monitor.enable()
    acceso = true
    accesoNelMinuto = true
  } catch { return }
  if (!minuto) {
    minuto = setInterval(guardaIlMinuto, 60_000)
    minuto.unref?.()
  }
}

function forseDorme() {
  if (inVolo > 0 || lavori.size > 0 || !acceso || spegni) return
  spegni = setTimeout(() => {
    spegni = null
    if (inVolo > 0 || lavori.size > 0) return
    try { monitor?.disable() } catch { /* niente */ }
    acceso = false
  }, 10_000)
  spegni.unref?.()
}

/** Ogni minuto: se il ciclo è stato fermo oltre la soglia, lo si dice (per le prove si chiama a mano). */
export function guardaIlMinuto() {
  if (!monitor) return
  if (accesoNelMinuto) {
    const max = Math.round(monitor.max / 1e6)
    const p99 = Math.round(monitor.percentile(99) / 1e6)
    if (max > SOGLIA) {
      ultimoFermo = { max, p99, quando: new Date().toISOString() }
      const chi = [...lavori.keys()]
      ferri.log(`myynd · tempi · ciclo fermo max ${max} ms, p99 ${p99} ms${chi.length ? ` · lavori: ${chi.join(', ')}` : ''}`)
    }
  }
  try { monitor.reset() } catch { /* niente */ }
  accesoNelMinuto = acceso
}

/** Il monitor sta misurando adesso (per le prove). */
export const misura = () => acceso

// — i lavori di fondo —

export type NomeLavoro = 'rilettura' | 'arrivi' | 'lettura-chiesta' | 'recupero' | 'manutenzione' | 'rassegna' | 'priorita' | 'automazioni'

export async function misuraLavoro<T>(nome: NomeLavoro, fai: () => Promise<T>): Promise<T> {
  const inizio = ferri.ora()
  lavori.set(nome, (lavori.get(nome) ?? 0) + 1)
  sveglia()
  try { return await fai() }
  finally {
    const n = (lavori.get(nome) ?? 1) - 1
    if (n > 0) lavori.set(nome, n); else lavori.delete(nome)
    const ms = ferri.ora() - inizio
    if (ms > 2000) ferri.log(`myynd · tempi · lavoro ${nome} ${(ms / 1000).toFixed(1)} s`)
    forseDorme()
  }
}

// — le tappe di una risposta in chat —

export type TappaChat = 'materiale' | 'prompt' | 'chiusura' | 'avvio' | 'prima-parola' | 'fine'
export type Via = 'chiave' | 'abbonamento' | 'compatibile' | 'chatgpt' | 'scorciatoia'
export type RecordChat = {
  quando: string; via: Via; breve: boolean
  materiale?: number; prompt?: number; chiusura?: number; avvio?: number; primaParola?: number
  fine: number; entrata?: number; cache?: number
}
const chat = new Map<string, RecordChat[]>()
const CAMPO: Record<Exclude<TappaChat, 'fine'>, 'materiale' | 'prompt' | 'chiusura' | 'avvio' | 'primaParola'> = {
  materiale: 'materiale', prompt: 'prompt', chiusura: 'chiusura', avvio: 'avvio', 'prima-parola': 'primaParola'
}
const NOME_TAPPA: [keyof RecordChat, string][] = [['materiale', 'materiale'], ['prompt', 'prompt'], ['chiusura', 'chiusura'], ['avvio', 'avvio'], ['primaParola', 'prima parola'], ['fine', 'fine']]

export function tappeChat(): { segna(t: TappaChat): void; chiudi(x: { via: Via; breve: boolean; entrata?: number; cache?: number }): void } {
  const inizio = ferri.ora()
  const segnate: Partial<Record<TappaChat, number>> = {}
  let chiusa = false
  return {
    segna(t) {
      if (segnate[t] === undefined) segnate[t] = Math.round(ferri.ora() - inizio)
    },
    chiudi(x) {
      if (chiusa) return
      chiusa = true
      const r: RecordChat = { quando: new Date().toISOString(), via: x.via, breve: x.breve, fine: Math.round(ferri.ora() - inizio) }
      for (const [t, campo] of Object.entries(CAMPO) as [Exclude<TappaChat, 'fine'>, typeof CAMPO[keyof typeof CAMPO]][]) {
        if (segnate[t] !== undefined) r[campo] = segnate[t]
      }
      if (typeof x.entrata === 'number') r.entrata = x.entrata
      if (typeof x.cache === 'number') r.cache = x.cache
      const conto = chi.adesso() ?? ''
      const l = chat.get(conto) ?? []
      l.push(r)
      while (l.length > 20) l.shift()
      chat.set(conto, l)
      const pezzi = NOME_TAPPA.filter(([k]) => typeof r[k] === 'number').map(([k, n]) => `${n} ${r[k]}`)
      ferri.log(`myynd · tempi · chat · ${pezzi.join(' · ')} · via ${r.via}${r.breve ? ' · breve' : ''}`)
    }
  }
}

// — i numeri di bordo —

const sveglie = new Map<string, number>()
const ultimaSveglia = new Map<string, number>()

/** Il Mac si è svegliato: il recupero parte adesso, per questo conto. */
export function segnaSveglia(): void {
  sveglie.set(chi.adesso() ?? '', Date.now())
}

/** Sono nate `n` carte: se è la prima volta dopo un risveglio, si dice quanto dopo. */
export function carteNate(n: number): void {
  if (!(n > 0)) return
  const conto = chi.adesso() ?? ''
  const da = sveglie.get(conto)
  if (da === undefined) return
  sveglie.delete(conto)
  const s = Math.round((Date.now() - da) / 1000)
  ultimaSveglia.set(conto, s)
  ferri.log(`myynd · tempi · sveglia → prima carta ${s} s`)
}

export type Quantili = { p50: number | null; p95: number | null; n: number }
export type Bordo = { arrivoCarta: Quantili; affidatoPronto: Quantili; svegliaCarta: number | null }

function quantili(v: number[]): Quantili {
  const s = v.filter(x => Number.isFinite(x) && x >= 0).sort((a, b) => a - b)
  if (!s.length) return { p50: null, p95: null, n: 0 }
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]
  return { p50: q(0.5), p95: q(0.95), n: s.length }
}

/** Arrivo → carta e affidato → pronto (ms), più l'ultimo risveglio → prima carta (s) di questo conto. */
export function bordo(carte: number[], lavori: number[]): Bordo {
  return { arrivoCarta: quantili(carte), affidatoPronto: quantili(lavori), svegliaCarta: ultimaSveglia.get(chi.adesso() ?? '') ?? null }
}

const durata = (ms: number) => ms < 60_000 ? `${Math.round(ms / 1000)} s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1)} h`

/** La riga di tutti i giorni: solo le parti che hanno qualcosa. Null se niente. */
export function rigaBordo(b: Bordo): string | null {
  const pezzi: string[] = []
  const a = b.arrivoCarta, l = b.affidatoPronto
  if (a.n) pezzi.push(`arrivo → carta p50 ${durata(a.p50!)}, p95 ${durata(a.p95!)} (${a.n})`)
  if (l.n) pezzi.push(`affidato → pronto p50 ${durata(l.p50!)}, p95 ${durata(l.p95!)} (${l.n})`)
  return pezzi.length ? `myynd · tempi · bordo · ${pezzi.join(' · ')}` : null
}

/** La manutenzione di tutti i giorni: dovuta, e quieta (o in ritardo di un giorno intero). */
export function manutenzioneTocca(ora: number, dovuta: number, quietoAdesso: boolean): boolean {
  if (ora < dovuta) return false
  return quietoAdesso || ora - dovuta >= 24 * 3_600_000
}

// — il riassunto per GET /api/tempi —

export type Riassunto = {
  richieste: { rotta: string; n: number; p50: number; p95: number; max: number }[]
  ciclo: { max: number; p99: number; quando: string } | null
  lavori: string[]
  chat: RecordChat[]
}

export function riassunto(): Riassunto {
  const richieste = [...durate.entries()].map(([rotta, a]) => {
    const q = quantili(a.v)
    return { rotta, n: q.n, p50: q.p50 ?? 0, p95: q.p95 ?? 0, max: Math.max(0, ...a.v) }
  }).sort((x, y) => y.p95 - x.p95)
  return { richieste, ciclo: ultimoFermo, lavori: [...lavori.keys()], chat: [...(chat.get(chi.adesso() ?? '') ?? [])] }
}

// — i segni del client —

export const SEGNI_CLIENT = ['accesso', 'stato', 'feed', 'compiti', 'casa-disegnata', 'occhio-premuto', 'invio-premuto', 'prima-parola', 'chat-fine'] as const

/** Solo `{ segni: { nome: numero } }` con nomi della lista: il resto è null. */
export function segniDelClient(corpo: unknown): Record<string, number> | null {
  if (!corpo || typeof corpo !== 'object') return null
  const s = (corpo as { segni?: unknown }).segni
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null
  const voci = Object.entries(s as Record<string, unknown>)
  if (!voci.length || voci.length > SEGNI_CLIENT.length) return null
  const fuori: Record<string, number> = {}
  for (const [k, v] of voci) {
    if (!(SEGNI_CLIENT as readonly string[]).includes(k)) return null
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    fuori[k] = Math.round(Math.min(600_000, Math.max(0, v)))
  }
  return fuori
}

const NOME_SEGNO: Record<string, string> = {
  'casa-disegnata': 'casa disegnata', 'occhio-premuto': 'occhio', 'invio-premuto': 'invio', 'prima-parola': 'prima parola', 'chat-fine': 'fine'
}
/** La riga del registro per i segni di una pagina o di una chat. */
export function rigaSegni(s: Record<string, number>): string {
  const inChat = 'invio-premuto' in s || 'chat-fine' in s
  const pezzi = SEGNI_CLIENT.filter(k => k in s).map(k => `${NOME_SEGNO[k] ?? k} ${s[k]}`)
  return `myynd · tempi · ${inChat ? 'chat' : 'avvio'} · ${pezzi.join(' · ')}`
}

// — per le prove —

export function perProva(f: Partial<Ferri> | null = null): void {
  ferri = f ? { ...VERI, ...f } : VERI
  durate.clear(); chat.clear(); sveglie.clear(); ultimaSveglia.clear(); lavori.clear()
  inVolo = 0; ultimaFine = Number.NEGATIVE_INFINITY; contaCessioni = 0
  if (spegni) clearTimeout(spegni)
  if (minuto) clearInterval(minuto)
  try { monitor?.disable() } catch { /* niente */ }
  spegni = null; minuto = null; monitor = null; acceso = false; accesoNelMinuto = false; ultimoFermo = null
}
