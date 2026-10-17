// Cosa ha visto sul Mac: le osservazioni, gli episodi, e il diritto di dimenticare.
//
// Ogni cosa vista è una riga di `osservazioni`: una sessione davanti a
// un'app, il testo della finestra (se l'ha acceso), una pagina del browser
// messa insieme per giorno, un file usato, un commit, lo stato di un
// repository, una cartella aperta nell'editor. Ogni riga sa da dove viene
// (`sourceId`), quando l'ha vista lui (`observedAt`), quando è successa la
// cosa (`eventAt`), di quale progetto è (`projectId`), e l'impronta del suo
// testo (`contentHash`). Il testo arriva qui già ripulito: numeri di carta,
// IBAN, chiavi e password diventano un segnaposto prima di toccare il disco.
//
// Gli episodi non si scrivono: si calcolano ogni volta dalle righe del
// giorno, così una riga dimenticata non lascia dietro di sé un episodio che
// la ricorda. Il diario del giorno sì (lo scrive `diario.ts`), e per questo
// dimenticare un'ora toglie anche le righe del diario che poggiavano su
// quell'ora, e segna l'ora come dimenticata: nessuna fonte la riporta dentro.
//
// Niente di qui va a un modello. Al modello va solo il diario, corto.

import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import db from './store.ts'
import * as fuso from './fuso.ts'
import { cercatoreDiProgetti } from './attenzione.ts'

export type Genere = 'app' | 'finestra' | 'web' | 'file' | 'commit' | 'commit-altri' | 'repo' | 'editor'

export type Osservazione = {
  id: number; kind: Genere; sourceId: string; app: string | null; title: string | null; text: string | null
  observedAt: string; eventAt: string | null; endAt: string | null; seconds: number; day: string
  projectId: string | null; contentHash: string | null; retention: string; spans: string | null
}

/** Quanti giorni restano le osservazioni grezze. */
export const GIORNI_GREZZE = 14
/** Quanti giorni resta il diario del giorno. */
export const GIORNI_DIARIO = 90
/** Quanti giorni si ricorda che un'ora è stata dimenticata: oltre, nessuna fonte la rilegge più. */
export const GIORNI_DIMENTICATE = 30
/** Il testo tenuto per riga, già ripulito. */
export const TESTO_MAX = 4000
/** Sopra questa somiglianza il testo nuovo non è un cambio: si allunga la riga di prima. */
export const SIMILE = 0.9
/** Oltre questo vuoto un episodio si spezza. */
export const VUOTO_EPISODIO = 10 * 60_000
/** Quanto prima e dopo una sessione si guarda per capire di quale progetto era. */
const MARGINE = 2 * 60_000
const GIORNO = 86_400_000

/** I generi che hanno una riga sola per fonte e per giorno: la seconda passata aggiorna la prima. */
const UNA_AL_GIORNO = new Set<Genere>(['web', 'file', 'repo', 'editor'])

/** I browser: la cronologia vale come prova solo per le sessioni davanti a uno di loro. */
export const BROWSER = new Set([
  'com.google.Chrome', 'com.google.Chrome.canary', 'company.thebrowser.Browser', 'com.brave.Browser', 'com.microsoft.edgemac',
  'com.apple.Safari', 'org.mozilla.firefox', 'com.operasoftware.Opera', 'com.vivaldi.Vivaldi'
])
const EDITOR = new Set(['com.microsoft.VSCode', 'com.todesktop.230313mzl4w4u92', 'com.exafunction.windsurf', 'com.apple.dt.Xcode', 'com.jetbrains.intellij', 'dev.zed.Zed', 'com.sublimetext.4'])

/*
 * Le app che non si leggono mai, oltre a quelle dell'osservatore (Myynd,
 * gestori di password, finestre di accesso): banche, salute, portafogli.
 */
export const APP_RISERVATE = /bank|banca|banking|wallet|health|salute|medical|clinic|therapy|1password|bitwarden|lastpass|dashlane|keepass|keychain|passwords?\b|authenticator|authy/i

/* ------------------------------------------------------------- ripulire */

/** Il controllo di Luhn: una sequenza di cifre che è davvero un numero di carta. */
export function luhn(cifre: string): boolean {
  let somma = 0
  let doppio = false
  for (let i = cifre.length - 1; i >= 0; i--) {
    let n = cifre.charCodeAt(i) - 48
    if (n < 0 || n > 9) return false
    if (doppio) { n *= 2; if (n > 9) n -= 9 }
    somma += n
    doppio = !doppio
  }
  return somma % 10 === 0
}

/**
 * Il testo senza le cose che non devono mai restare scritte: numeri di carta
 * (che passano Luhn), IBAN, chiavi d'accesso e gettoni dei servizi noti,
 * JWT, password dopo la loro etichetta, e le stringhe lunghe a caso che
 * sembrano un segreto. Al loro posto un segnaposto che dice cos'era.
 */
export function redigi(testo: string): string {
  return testo
    // chiavi dei servizi noti
    .replace(/\b(?:sk|pk|rk)-(?:ant-|proj-|live_|test_)?[A-Za-z0-9_-]{16,}/g, '[chiave]')
    .replace(/\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[chiave]')
    .replace(/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '[chiave]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[chiave]')
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, '[chiave]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[gettone]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 [gettone]')
    // la password, il codice, il segreto dopo la sua etichetta
    .replace(/\b(password|passwd|pwd|passcode|pin|parola d'ordine|api[_ -]?key|secret|segreto|token|otp)(\s*[:=]\s*|\s+is\s+|\s+è\s+)("[^"]*"|'[^']*'|\S+)/gi, '$1$2[nascosto]')
    // IBAN: due lettere, due cifre, poi da undici a trenta caratteri
    .replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, m => /\d{6,}/.test(m.replace(/ /g, '')) ? '[iban]' : m)
    // numeri di carta: da tredici a diciannove cifre, con spazi o trattini, che passano Luhn
    .replace(/\b\d(?:[ -]?\d){12,18}\b/g, m => luhn(m.replace(/[ -]/g, '')) ? '[carta]' : m)
    // stringhe lunghe a caso: lettere e cifre mescolate, quaranta e più caratteri
    .replace(/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{40,}={0,2}/g, '[chiave]')
}

/** Spazi e controlli via, al massimo `tetto` caratteri veri. */
export function compatto(s: string, tetto = TESTO_MAX): string {
  const c = Array.from(s.replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim())
  return c.length > tetto ? c.slice(0, tetto).join('') : c.join('')
}

/** La forma su cui si fa l'impronta: minuscolo, cifre uguali, spazi compattati. */
export function normalizza(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\d/g, '0').replace(/\s+/g, ' ').trim()
}

export function impronta(s: string): string {
  return createHash('sha256').update(normalizza(s)).digest('hex').slice(0, 32)
}

/** Quanto due testi dicono le stesse parole (Jaccard sulle parole normalizzate), da 0 a 1. */
export function somiglianza(a: string, b: string): number {
  const pa = new Set(normalizza(a).split(/[^\p{L}\p{N}]+/u).filter(Boolean))
  const pb = new Set(normalizza(b).split(/[^\p{L}\p{N}]+/u).filter(Boolean))
  if (!pa.size && !pb.size) return 1
  let comuni = 0
  for (const p of pa) if (pb.has(p)) comuni++
  return comuni / (pa.size + pb.size - comuni)
}

/* --------------------------------------------------------------- progetti */

/**
 * Di quale progetto è una cosa vista: prima il percorso o il documento (il
 * segno più preciso), poi il titolo, poi l'inizio del testo. La cartella di
 * casa non conta: «/Users/anna» non è un progetto.
 */
export function progettoDi(c: { percorso?: string | null; sourceId?: string; title?: string | null; text?: string | null }, cerca: (t: string) => string | null): string | null {
  const casa = homedir()
  const percorso = (c.percorso ?? '').startsWith(casa) ? c.percorso!.slice(casa.length) : (c.percorso ?? '')
  for (const t of [percorso, c.title ?? '', (c.text ?? '').slice(0, 500)]) {
    if (!t) continue
    const p = cerca(t)
    if (p) return p
  }
  return null
}

/* --------------------------------------------------------------- dimenticate */

/** L'istante cade in un'ora che lui ha chiesto di dimenticare? */
export function dimenticata(iso: string | null | undefined): boolean {
  if (!iso) return false
  return !!db.prepare('SELECT 1 FROM osservazioni_dimenticate WHERE da <= ? AND a > ? LIMIT 1').get(iso, iso)
}

/* ----------------------------------------------------------------- scrivere */

export type Nuova = {
  kind: Genere
  sourceId: string
  app?: string | null
  title?: string | null
  text?: string | null
  observedAt: string
  eventAt?: string | null
  endAt?: string | null
  seconds?: number
  /** Solo per capire il progetto: il percorso del file o della cartella. Non si scrive a parte. */
  percorso?: string | null
  /** Già noto da chi scrive (la sessione col suo progetto); altrimenti si cerca. */
  projectId?: string | null
  /** Gli intervalli del giorno in cui è stata davanti (la cronologia), `[da, a]` in epoch ms. */
  spans?: [number, number][]
}

export type Esito = 'nuova' | 'aggiornata' | 'uguale' | 'dimenticata'

/** Unisce gli intervalli che si toccano o distano meno di cinque minuti. */
export function unisciIntervalli(x: readonly [number, number][], vuoto = 5 * 60_000): [number, number][] {
  const s = [...x].filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((p, q) => p[0] - q[0])
  const fuori: [number, number][] = []
  for (const [a, b] of s) {
    const u = fuori[fuori.length - 1]
    if (u && a - u[1] <= vuoto) u[1] = Math.max(u[1], b)
    else fuori.push([a, b])
  }
  return fuori
}

/**
 * Scrive una cosa vista, se è nuova davvero.
 *
 * Il testo si ripulisce e si taglia prima di tutto il resto. Poi tre regole,
 * secondo il genere: una sessione o un commit si scrivono una volta sola
 * (la stessa impronta non entra due volte); il testo di una finestra entra
 * solo se è cambiato abbastanza rispetto all'ultimo della stessa finestra
 * (altrimenti la riga di prima si allunga fino ad adesso); pagine, file,
 * repository e cartelle dell'editor hanno una riga per giorno, che si
 * aggiorna. Una cosa che cade in un'ora dimenticata non entra.
 */
export function registra(n: Nuova, cerca: (t: string) => string | null = cercatoreDiProgetti()): Esito {
  const quando = n.eventAt ?? n.observedAt
  if (dimenticata(n.observedAt) || dimenticata(n.eventAt) || dimenticata(n.endAt)) return 'dimenticata'
  if (n.spans?.some(([a, b]) => dimenticata(new Date(a).toISOString()) || dimenticata(new Date(b).toISOString()))) return 'dimenticata'
  const title = n.title ? compatto(redigi(n.title), 300) || null : null
  const text = n.text ? compatto(redigi(n.text)) || null : null
  const day = fuso.giornoIn(new Date(quando))
  const hash = n.kind === 'app' || n.kind === 'commit' || n.kind === 'commit-altri'
    // l'identità esatta, non la forma normalizzata: due sessioni differiscono proprio nelle cifre dell'ora
    ? createHash('sha256').update(`${n.sourceId}\u0000${quando}\u0000${n.endAt ?? ''}`).digest('hex').slice(0, 32)
    : impronta(`${title ?? ''}\n${text ?? ''}`)
  const projectId = n.projectId !== undefined && n.projectId !== null ? n.projectId : progettoDi({ percorso: n.percorso, sourceId: n.sourceId, title, text }, cerca)
  const seconds = Math.max(0, Math.round(n.seconds ?? 0))

  if (n.kind === 'app' || n.kind === 'commit' || n.kind === 'commit-altri') {
    if (db.prepare('SELECT 1 FROM osservazioni WHERE sourceId = ? AND contentHash = ? LIMIT 1').get(n.sourceId, hash)) return 'uguale'
  } else if (n.kind === 'finestra') {
    const prima = db.prepare('SELECT id, text, title, contentHash FROM osservazioni WHERE sourceId = ? AND observedAt >= ? ORDER BY observedAt DESC LIMIT 1')
      .get(n.sourceId, new Date(Date.parse(n.observedAt) - 12 * 3600_000).toISOString()) as { id: number; text: string | null; title: string | null; contentHash: string | null } | undefined
    if (prima && (prima.contentHash === hash || somiglianza(`${prima.title ?? ''} ${prima.text ?? ''}`, `${title ?? ''} ${text ?? ''}`) >= SIMILE)) {
      db.prepare('UPDATE osservazioni SET endAt = MAX(COALESCE(endAt, observedAt), ?) WHERE id = ?').run(n.endAt ?? n.observedAt, prima.id)
      return 'uguale'
    }
  } else if (UNA_AL_GIORNO.has(n.kind)) {
    const prima = db.prepare('SELECT id, contentHash, seconds, spans, observedAt, endAt, eventAt FROM osservazioni WHERE sourceId = ? AND day = ? LIMIT 1')
      .get(n.sourceId, day) as { id: number; contentHash: string | null; seconds: number; spans: string | null; observedAt: string; endAt: string | null; eventAt: string | null } | undefined
    if (prima) {
      if (n.kind === 'web') {
        const vecchi = prima.spans ? JSON.parse(prima.spans) as [number, number][] : []
        const spans = unisciIntervalli([...vecchi, ...(n.spans ?? [])])
        db.prepare(`UPDATE osservazioni SET title = ?, text = ?, seconds = seconds + ?, spans = ?, contentHash = ?,
          observedAt = MIN(observedAt, ?), endAt = MAX(COALESCE(endAt, observedAt), ?), projectId = COALESCE(projectId, ?) WHERE id = ?`)
          .run(title, text, seconds, JSON.stringify(spans), hash, n.observedAt, n.endAt ?? n.observedAt, projectId, prima.id)
        return 'aggiornata'
      }
      if (prima.contentHash === hash && (prima.eventAt ?? '') >= (n.eventAt ?? '')) return 'uguale'
      db.prepare('UPDATE osservazioni SET title = ?, text = ?, contentHash = ?, eventAt = MAX(COALESCE(eventAt, \'\'), ?), seconds = MAX(seconds, ?), projectId = COALESCE(?, projectId) WHERE id = ?')
        .run(title, text, hash, n.eventAt ?? '', seconds, projectId, prima.id)
      return 'aggiornata'
    }
  }

  db.prepare(`INSERT INTO osservazioni (kind, sourceId, app, title, text, observedAt, eventAt, endAt, seconds, day, projectId, contentHash, retention, spans)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    n.kind, n.sourceId, n.app ?? null, title, text, n.observedAt, n.eventAt ?? null, n.endAt ?? null, seconds, day,
    projectId, hash, 'grezza', n.spans?.length ? JSON.stringify(unisciIntervalli(n.spans)) : null)
  return 'nuova'
}

/* ----------------------------------------------------------------- leggere */

export function delGiorno(giorno: string): Osservazione[] {
  return db.prepare('SELECT * FROM osservazioni WHERE day = ? ORDER BY COALESCE(eventAt, observedAt), id').all(giorno) as Osservazione[]
}

/* ----------------------------------------------------------------- episodi */

export type Episodio = {
  /** `ep:` più l'id della prima osservazione: stabile finché quella riga c'è. */
  id: string
  projectId: string | null
  inizio: string
  fine: string
  /** I minuti davanti allo schermo (le sessioni); zero per un episodio fatto solo di segni. */
  minuti: number
  etichetta: string
  app: string[]
  /** Le osservazioni su cui poggia. */
  prove: number[]
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

/** Gli intervalli in cui una riga dice qualcosa sul tempo, in epoch ms. */
function intervalli(o: Osservazione): [number, number][] {
  if (o.spans) { try { return JSON.parse(o.spans) as [number, number][] } catch { return [] } }
  if (o.kind === 'finestra') { const a = ms(o.observedAt); return [[a, Math.max(a, ms(o.endAt) || a)]] }
  // un file usato, un commit, una cartella dell'editor: un istante, se si sa
  if (o.kind === 'file' || o.kind === 'commit' || o.kind === 'editor') {
    const t = ms(o.eventAt)
    return Number.isFinite(t) ? [[t, t]] : []
  }
  return []
}

/** Quanto conta una prova per una sessione: il testo della stessa app vale più di un file aperto altrove. */
function peso(o: Osservazione, s: Osservazione): number {
  const stessaApp = !!o.app && o.app === s.app
  if (o.kind === 'finestra') return stessaApp ? 4 : 0.5
  if (o.kind === 'web') return BROWSER.has(bundleDi(s)) ? 3 : 0
  if (o.kind === 'editor') return EDITOR.has(bundleDi(s)) ? 3 : 0.5
  if (o.kind === 'file') return 1
  if (o.kind === 'commit') return 1
  return 0
}

/** Il bundle di una sessione: `app:<bundle>|<titolo>`. */
export function bundleDi(s: Pick<Osservazione, 'sourceId'>): string {
  const x = s.sourceId.startsWith('app:') ? s.sourceId.slice(4) : s.sourceId
  const i = x.indexOf('|')
  return i < 0 ? x : x.slice(0, i)
}

/** Il pezzo di titolo che dice la cosa: senza il nome dell'app in coda, senza «●». */
export function titoloCorto(t: string): string {
  let s = t.replace(/^[●•*]\s*/, '').trim()
  s = s.replace(/\s+[-–—|]\s+(Google Chrome|Arc|Brave|Microsoft Edge|Safari|Firefox|Visual Studio Code|Cursor|Windsurf|Xcode|Zed)(\s+[-–—]\s+.*)?$/i, '')
  const pezzi = s.split(/\s+[-–—|]\s+/)
  // «file.ts - progetto» negli editor, «Titolo - Google Docs» sul web: si tiene il primo pezzo
  return (pezzi[0] ?? s).slice(0, 60).trim()
}

function etichettaDi(righe: readonly Osservazione[]): string {
  const conta = new Map<string, number>()
  const metti = (s: string | null | undefined, w: number) => {
    const k = s ? titoloCorto(s) : ''
    if (k.length < 2) return
    conta.set(k, (conta.get(k) ?? 0) + w)
  }
  for (const r of righe) {
    if (r.kind === 'app') metti(r.title, Math.max(1, r.seconds))
    else if (r.kind === 'finestra') metti(r.title, 30)
    else if (r.kind === 'web') metti(r.title, Math.max(30, r.seconds))
    else if (r.kind === 'file' || r.kind === 'editor') metti(r.sourceId.includes(':') ? basename(r.sourceId.slice(r.sourceId.lastIndexOf(':') + 1)) : r.title, 20)
    else if (r.kind === 'commit') metti(r.title, 20)
  }
  const migliori = [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k)
  if (migliori.length) return migliori.join(' · ').slice(0, 90)
  const app = [...new Set(righe.map(r => r.app).filter(Boolean))].slice(0, 2)
  return app.join(', ') || '…'
}

/**
 * Gli episodi di un giorno, deterministici e senza modello.
 *
 * 1. Ogni sessione davanti a un'app senza un progetto suo lo prende dalle
 *    prove che le stanno attorno (due minuti prima e dopo): il testo della
 *    stessa finestra, la cronologia se è un browser, l'editor se è un
 *    editor, i file usati e i commit. Vince il progetto con più peso per
 *    tempo sovrapposto.
 * 2. Una sessione rimasta senza progetto, in mezzo a due dello stesso
 *    progetto a meno di dieci minuti, è di quel progetto.
 * 3. Le sessioni dello stesso progetto si uniscono finché il vuoto fra
 *    l'una e l'altra resta sotto i dieci minuti.
 * 4. I segni senza sessioni (l'osservatore spento, un file usato, un
 *    commit suo) fanno episodi da zero minuti: si vedono, non si contano.
 */
export function episodi(giorno: string, righe: readonly Osservazione[] = delGiorno(giorno)): Episodio[] {
  const sessioni = righe.filter(r => r.kind === 'app' && r.seconds > 0).map(r => ({ ...r })).sort((a, b) => ms(a.observedAt) - ms(b.observedAt))
  const prove = righe.filter(r => r.kind !== 'app' && r.projectId)

  // 1. dalle prove attorno
  for (const s of sessioni) {
    if (s.projectId) continue
    const a = ms(s.observedAt) - MARGINE, b = (ms(s.endAt) || ms(s.observedAt) + s.seconds * 1000) + MARGINE
    const punti = new Map<string, number>()
    for (const p of prove) {
      const w = peso(p, s)
      if (!w) continue
      for (const [x, y] of intervalli(p)) {
        const sovrapposto = Math.min(b, y + MARGINE) - Math.max(a, x - MARGINE)
        if (sovrapposto <= 0) continue
        punti.set(p.projectId!, (punti.get(p.projectId!) ?? 0) + w * Math.max(1, sovrapposto / 1000))
      }
    }
    const migliore = [...punti.entries()].sort((x, y) => y[1] - x[1])[0]
    if (migliore) s.projectId = migliore[0]
  }

  // 2. in mezzo a due dello stesso progetto
  for (let i = 1; i < sessioni.length - 1; i++) {
    const s = sessioni[i]!
    if (s.projectId) continue
    let j = i - 1; while (j >= 0 && !sessioni[j]!.projectId) j--
    let k = i + 1; while (k < sessioni.length && !sessioni[k]!.projectId) k++
    const prima = sessioni[j], dopo = sessioni[k]
    if (!prima || !dopo || prima.projectId !== dopo.projectId) continue
    if (ms(s.observedAt) - ms(prima.endAt) <= VUOTO_EPISODIO && ms(dopo.observedAt) - ms(s.endAt) <= VUOTO_EPISODIO) s.projectId = prima.projectId
  }

  // 3. per progetto, finché il vuoto resta sotto i dieci minuti
  const fuori: Episodio[] = []
  const perProgetto = new Map<string, Osservazione[]>()
  for (const s of sessioni) {
    const k = s.projectId ?? ''
    perProgetto.set(k, [...(perProgetto.get(k) ?? []), s])
  }
  const chiudi = (gruppo: Osservazione[], progetto: string | null) => {
    const inizio = ms(gruppo[0]!.observedAt)
    const fine = Math.max(...gruppo.map(g => ms(g.endAt) || ms(g.observedAt) + g.seconds * 1000))
    // le prove del progetto dentro l'episodio entrano nell'etichetta e nelle prove
    const dentro = progetto ? prove.filter(p => p.projectId === progetto && intervalli(p).some(([x, y]) => y >= inizio - MARGINE && x <= fine + MARGINE)) : []
    fuori.push({
      id: `ep:${gruppo[0]!.id}`, projectId: progetto,
      inizio: new Date(inizio).toISOString(), fine: new Date(fine).toISOString(),
      minuti: Math.round(gruppo.reduce((n, g) => n + g.seconds, 0) / 60),
      etichetta: etichettaDi([...gruppo, ...dentro]),
      app: [...new Set(gruppo.map(g => g.app).filter((x): x is string => !!x))],
      prove: [...gruppo, ...dentro].map(r => r.id)
    })
  }
  for (const [k, lista] of perProgetto) {
    let gruppo: Osservazione[] = []
    for (const s of lista) {
      const ultima = gruppo[gruppo.length - 1]
      if (ultima && ms(s.observedAt) - (ms(ultima.endAt) || ms(ultima.observedAt)) > VUOTO_EPISODIO) { chiudi(gruppo, k || null); gruppo = [] }
      gruppo.push(s)
    }
    if (gruppo.length) chiudi(gruppo, k || null)
  }

  // 4. i segni senza sessioni
  const coperte = new Set(fuori.flatMap(e => e.prove))
  const sole = prove.filter(p => !coperte.has(p.id) && p.kind !== 'commit-altri' && intervalli(p).length)
    .sort((a, b) => intervalli(a)[0]![0] - intervalli(b)[0]![0])
  const perP = new Map<string, Osservazione[]>()
  for (const p of sole) perP.set(p.projectId!, [...(perP.get(p.projectId!) ?? []), p])
  for (const [progetto, lista] of perP) {
    let gruppo: Osservazione[] = []
    let fineGruppo = -Infinity
    const chiudiSegni = () => {
      if (!gruppo.length) return
      const tempi = gruppo.flatMap(intervalli)
      fuori.push({
        id: `ep:${gruppo[0]!.id}`, projectId: progetto,
        inizio: new Date(Math.min(...tempi.map(t => t[0]))).toISOString(), fine: new Date(Math.max(...tempi.map(t => t[1]))).toISOString(),
        minuti: 0, etichetta: etichettaDi(gruppo), app: [...new Set(gruppo.map(g => g.app).filter((x): x is string => !!x))],
        prove: gruppo.map(g => g.id)
      })
      gruppo = []
    }
    for (const p of lista) {
      const [x, y] = intervalli(p)[0]!
      if (gruppo.length && x - fineGruppo > VUOTO_EPISODIO) chiudiSegni()
      gruppo.push(p)
      fineGruppo = Math.max(fineGruppo, y)
    }
    chiudiSegni()
  }
  return fuori.sort((a, b) => a.inizio.localeCompare(b.inizio))
}

/** I minuti attribuiti a ciascun progetto in un giorno ('' per quelli senza progetto). */
export function minutiPerProgetto(eps: readonly Episodio[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of eps) m.set(e.projectId ?? '', (m.get(e.projectId ?? '') ?? 0) + e.minuti)
  return m
}

/* ---------------------------------------------------------------- dimenticare */

export type Dimenticato = { osservazioni: number; sessioni: number; righe: number; progetti: string[] }

/**
 * Dimentica tutto quello che ha visto fra `da` e `a`: le osservazioni che
 * cadono dentro o lo attraversano, le sessioni dell'osservatore che lo
 * toccano, le righe del diario che poggiavano su una di quelle. E segna
 * l'intervallo: nessuna fonte (la cronologia, Spotlight, una sessione ancora
 * in coda nel guscio) lo riporta dentro. Torna anche i progetti le cui righe
 * del diario sono sparite, perché chi ne ha tratto qualcosa lo rifaccia.
 *
 * Non apre una transazione: la apre chi chiama, insieme al ricalcolo.
 */
export function dimentica(da: Date, a: Date, adesso = new Date()): Dimenticato {
  const x = da.toISOString(), y = a.toISOString()
  db.prepare('INSERT INTO osservazioni_dimenticate (da, a, quando) VALUES (?,?,?)').run(x, y, adesso.toISOString())
  const ids = (db.prepare(`SELECT id FROM osservazioni WHERE
      (COALESCE(eventAt, observedAt) >= ? AND COALESCE(eventAt, observedAt) < ?)
      OR (observedAt < ? AND COALESCE(endAt, observedAt) > ?)`).all(x, y, y, x) as { id: number }[]).map(r => r.id)
  const via = new Set(ids)
  let righe = 0
  const progetti = new Set<string>()
  for (const r of db.prepare('SELECT id, projectId, evidence FROM diario').all() as { id: string; projectId: string | null; evidence: string }[]) {
    let prove: number[] = []
    try { prove = JSON.parse(r.evidence) as number[] } catch { prove = [] }
    if (!prove.some(p => via.has(p))) continue
    db.prepare('DELETE FROM diario WHERE id = ?').run(r.id)
    righe++
    if (r.projectId) progetti.add(r.projectId)
  }
  let osservazioni = 0
  for (let i = 0; i < ids.length; i += 500) {
    const pezzo = ids.slice(i, i + 500)
    osservazioni += Number(db.prepare(`DELETE FROM osservazioni WHERE id IN (${pezzo.map(() => '?').join(',')})`).run(...pezzo).changes)
  }
  const sessioni = Number(db.prepare('DELETE FROM sessioni_app WHERE inizio < ? AND fine > ?').run(y, x).changes)
  return { osservazioni, sessioni, righe, progetti: [...progetti] }
}

/** L'ora locale che contiene `t`: da :00 a :00. */
export function oraDi(t: Date, zona = fuso.fusoDi()): { da: Date; a: Date } {
  const p = fuso.parti(t, zona)
  const da = fuso.istante(p.anno, p.mese, p.giorno, p.ora, zona)
  return { da, a: new Date(da.getTime() + 3600_000) }
}

/** Il giorno locale che contiene `t`: da mezzanotte a mezzanotte. */
export function giornoDi(t: Date, zona = fuso.fusoDi()): { da: Date; a: Date } {
  const p = fuso.parti(t, zona)
  return { da: fuso.istante(p.anno, p.mese, p.giorno, 0, zona), a: fuso.istante(p.anno, p.mese, p.giorno + 1, 0, zona) }
}

/** Il buio: spento o in pausa da adesso fino a `fino` (senza, finché non torna la luce). */
export const SEMPRE = '9999-12-31T00:00:00.000Z'
export function buio(adesso = new Date(), fino?: Date): void {
  db.prepare('INSERT INTO osservazioni_dimenticate (da, a, quando) VALUES (?,?,?)').run(adesso.toISOString(), fino ? fino.toISOString() : SEMPRE, adesso.toISOString())
}

/**
 * La luce: il buio aperto finisce adesso. Una pausa finita prima del tempo, o
 * l'osservatore riacceso: da qui in poi si guarda, e il buio di prima resta.
 */
export function luce(adesso = new Date()): void {
  const ora = adesso.toISOString()
  db.prepare('UPDATE osservazioni_dimenticate SET a = ? WHERE a > ? AND da <= ?').run(ora, ora, ora)
}

/** Via tutte le osservazioni e il diario; e tutto il passato fino ad adesso resta dimenticato. */
export function dimenticaTutto(adesso = new Date()): void {
  db.exec('DELETE FROM osservazioni')
  db.exec('DELETE FROM diario')
  db.prepare('INSERT INTO osservazioni_dimenticate (da, a, quando) VALUES (?,?,?)').run('1970-01-01T00:00:00.000Z', adesso.toISOString(), adesso.toISOString())
}

/** La conservazione: grezze quattordici giorni, il diario novanta, le ore dimenticate trenta. */
export function conserva(adesso = new Date()): { grezze: number; diario: number } {
  const soglia = fuso.giornoIn(new Date(adesso.getTime() - GIORNI_GREZZE * GIORNO))
  const grezze = Number(db.prepare('DELETE FROM osservazioni WHERE day < ?').run(soglia).changes)
  const diario = Number(db.prepare('DELETE FROM diario WHERE day < ?').run(fuso.giornoIn(new Date(adesso.getTime() - GIORNI_DIARIO * GIORNO))).changes)
  db.prepare('DELETE FROM osservazioni_dimenticate WHERE a < ?').run(new Date(adesso.getTime() - GIORNI_DIMENTICATE * GIORNO).toISOString())
  return { grezze, diario }
}

/** Il diario di un giorno, per la pagina. */
export function diarioDelGiorno(giorno: string): { id: string; projectId: string | null; kind: string; text: string; evidence: number[] }[] {
  return (db.prepare('SELECT id, projectId, kind, text, evidence FROM diario WHERE day = ? ORDER BY projectId, rowid').all(giorno) as { id: string; projectId: string | null; kind: string; text: string; evidence: string }[])
    .map(r => { let e: number[] = []; try { e = JSON.parse(r.evidence) } catch { e = [] } return { ...r, evidence: e } })
}
