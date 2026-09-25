// Il registro dei segnali: i fatti piccoli che l'indice dimentica.
//
// L'indice è una fotografia di adesso: una mail archiviata dopo la risposta
// sparisce con la riconciliazione, una riunione spostata è una riga cancellata
// e una nuova, la bozza che lui ha tenuto viene sovrascritta dalla sua. Per
// dire «a Nora rispondi sempre» fra novanta giorni servono i fatti com'erano
// quando sono successi, e questo file li scrive man mano, una riga ciascuno,
// con un id che non cambia: riscriverli non fa niente.
//
// Ci stanno solo i **fatti primari**: la posta arrivata e quella mandata, i
// cambi dell'agenda, i giorni con un agente sulla cartella, i commit suoi, la
// bozza com'era prima che la tenesse. Tutto il resto (le mail senza risposta,
// i compiti chiusi, le carte del feed) si ricava al momento dalle tabelle
// che ce l'hanno già.
//
// Niente di questo file parla con un modello, e i nomi che scrive sono
// ripuliti: solo lettere, cifre, spazi e `.'-`, quaranta caratteri.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { statSync } from 'node:fs'
import { join, basename } from 'node:path'
import db from './store.ts'
import * as store from './store.ts'
import * as cfg from './config.ts'
import * as conti from './conti.ts'
import * as chi from './chi.ts'
import * as fuso from './fuso.ts'
import * as ospitato from './ospitato.ts'
import { contieneRichiesta, indirizzoAttenzione, mittenteAutomatico } from './rilevanza.ts'
import { progettoDelTesto, cercatoreDiProgetti } from './attenzione.ts'

const execFileP = promisify(execFile)
const GIORNO = 86_400_000

export type Segnale = {
  id: string; genere: string; quando: string; giorno?: string
  chi?: string | null; progetto?: string | null; ref?: string | null; valore?: number | null; dati?: object | null
}

export type SegnaleArrivata = {
  id: string; quando: string; chi: string; ref: string; progetto: string | null
  dati: { messageId: string | null; filo: string | null; nome: string; titolo: string; richiesta: boolean; ricostruito?: boolean }
}
export type SegnaleInviata = {
  id: string; quando: string; chi: string | null; ref: string
  dati: { messageId: string | null; risponde: string | null; filo: string | null; destinatari: string[]; ricostruito?: boolean }
}

/** Una risposta e la mail che ha risposto, in secondi di attesa. */
export type Coppia = { arrivata: string; inviata: string; latenza: number }

// — scrivere —

const INSERISCI = 'INSERT OR IGNORE INTO segnali (id, genere, quando, giorno, chi, progetto, ref, valore, dati) VALUES (?,?,?,?,?,?,?,?,?)'
type Istruzione = ReturnType<typeof db.prepare>

/** Scrive un segnale; torna `true` se era nuovo. Chi ne scrive migliaia di fila passa l'istruzione preparata una volta. */
export function scrivi(s: Segnale, ins: Istruzione = db.prepare(INSERISCI)): boolean {
  const giorno = s.giorno ?? fuso.giornoIn(new Date(s.quando))
  const r = ins.run(s.id, s.genere, s.quando, giorno, s.chi ?? null, s.progetto ?? null, s.ref ?? null, s.valore ?? null, s.dati ? JSON.stringify(s.dati) : null)
  return Number(r.changes) > 0
}

type Riga = { id: string; genere: string; quando: string; giorno: string; chi: string | null; progetto: string | null; ref: string | null; valore: number | null; dati: string | null }

function daRiga<T>(r: Riga): T {
  let dati: unknown = null
  try { dati = r.dati ? JSON.parse(r.dati) : null } catch { dati = null }
  return { id: r.id, genere: r.genere, quando: r.quando, giorno: r.giorno, chi: r.chi, progetto: r.progetto, ref: r.ref, valore: r.valore, dati: dati ?? {} } as T
}

/** I segnali di un genere (o di un prefisso con `%`) con `quando` in [da, a). */
export function leggi<T = Segnale & { dati: Record<string, unknown> }>(genere: string, da: string, a: string): T[] {
  const op = genere.includes('%') ? 'LIKE' : '='
  return (db.prepare(`SELECT * FROM segnali WHERE genere ${op} ? AND quando >= ? AND quando < ? ORDER BY quando`).all(genere, da, a) as Riga[]).map(r => daRiga<T>(r))
}

export function arrivate(da: string, a: string): SegnaleArrivata[] { return leggi<SegnaleArrivata>('posta.arrivata', da, a) }
export function inviate(da: string, a: string): SegnaleInviata[] { return leggi<SegnaleInviata>('posta.inviata', da, a) }

// — i nomi, ripuliti —

/**
 * Senza un nome, la parte prima della chiocciola, a parole: «tom.brill» →
 * «Tom Brill», «bob» → «Bob». Mai l'indirizzo intero: la regola è nomi, non
 * indirizzi, sulla pagina e nel prompt.
 */
export function nomeDallIndirizzo(indirizzo: string): string {
  const locale = String(indirizzo ?? '').split('@')[0] ?? ''
  const parole = locale.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean)
  return parole.map(p => p[0]!.toUpperCase() + p.slice(1)).join(' ').slice(0, 40).trim()
}

/** Un nome da mostrare e da mettere in un prompt: niente segni, niente istruzioni, e mai una chiocciola. */
export function nomePulito(grezzo: string | null | undefined, indirizzo: string): string {
  const n = String(grezzo ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N} .'-]+/gu, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 40).trim()
  return n || nomeDallIndirizzo(indirizzo)
}

/** Un nome già salvato, reso mostrabile: se porta una chiocciola (righe scritte prima della regola) torna quello dell'indirizzo. */
export function nomeMostrabile(nome: string | null | undefined, indirizzo: string): string {
  const n = String(nome ?? '').trim()
  return n && !n.includes('@') ? n : nomeDallIndirizzo(indirizzo)
}

/** «Nora Vance <nora@…>» → Nora Vance; «nora@…» → nora@… */
export function nomeDaAutore(autore: string | null | undefined, indirizzo: string): string {
  const senza = String(autore ?? '').replace(/<[^>]*>/g, '').replace(/^["']|["']$/g, '').trim()
  return nomePulito(senza && !senza.includes('@') ? senza : '', indirizzo)
}

// — i miei indirizzi —

export function mieiIndirizzi(): Set<string> {
  const c = cfg.leggi()
  const s = new Set<string>()
  const metti = (x: unknown) => { if (typeof x === 'string' && x.includes('@')) s.add(x.trim().toLowerCase()) }
  metti(c.posta?.utente)
  metti(c.google?.email)
  metti((c.microsoft as { email?: string } | undefined)?.email)
  metti(c.account?.email)
  const me = chi.adesso()
  if (me) metti(conti.conto(me)?.email)
  return s
}

// — la posta —

const CURSORE_POSTA = 'segnali:posta'
/** La riga (`rid`) fino a cui si è arrivati dentro l'ultimo `indicizzato`: così una seconda chiamata non ripassa il pezzo. */
const CURSORE_POSTA_RID = 'segnali:posta:rid'
/** C'è finché il primo ripasso di tutto l'indice non è arrivato in fondo. */
const CURSORE_RIPASSO = 'segnali:posta:ripasso'
/** Documenti per pezzo, e quanti pezzi per chiamata: il ripasso di quarantamila mail non ferma il server per nessuno. */
const A_PEZZI = 1000
const PEZZI_PER_CHIAMATA = 4
/** Il tempo che una chiamata si concede prima di lasciare il resto alla prossima. */
const BUDGET_MS = 800

type DocPosta = {
  id: string; titolo: string; corpo: string; autore: string | null; autoreIndirizzo: string | null; quando: string | null
  filo: string | null; messageId: string | null; inviato: number | null; massa: number | null
  risponde: string | null; destinatari: string | null; indicizzato: string
}

/** Gli indirizzi di `destinatari`: minuscoli, senza nomi. */
export function indirizziDi(destinatari: string | null | undefined): string[] {
  return String(destinatari ?? '').split(/[,;]/).map(x => indirizzoAttenzione(x)).filter(Boolean)
}

type Attrezzi = { miei: Set<string>; ricostruito: boolean; ins: Istruzione; progettoDi: (testo: string) => string | null }

function scriviDocPosta(d: DocPosta, a: Attrezzi): 'arrivata' | 'inviata' | null {
  if (!d.quando) return null
  const autore = (d.autoreIndirizzo ?? indirizzoAttenzione(d.autore)).toLowerCase()
  const inviata = d.inviato === 1 || (!!autore && a.miei.has(autore))
  if (inviata) {
    const destinatari = indirizziDi(d.destinatari)
    return scrivi({
      id: `posta.inviata|${d.id}`, genere: 'posta.inviata', quando: d.quando, chi: destinatari[0] ?? null, ref: d.id,
      dati: { messageId: d.messageId, risponde: d.risponde, filo: d.filo, destinatari, ...(a.ricostruito ? { ricostruito: true } : {}) }
    }, a.ins) ? 'inviata' : null
  }
  if (d.massa === 1 || !autore || mittenteAutomatico(d.autore ?? autore)) return null
  const titolo = String(d.titolo ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return scrivi({
    id: `posta.arrivata|${d.id}`, genere: 'posta.arrivata', quando: d.quando, chi: autore, ref: d.id,
    progetto: a.progettoDi(titolo),
    dati: {
      messageId: d.messageId, filo: d.filo, nome: nomeDaAutore(d.autore, autore), titolo,
      richiesta: contieneRichiesta(`${titolo} ${String(d.corpo ?? '').slice(0, 1500)}`),
      ...(a.ricostruito ? { ricostruito: true } : {})
    }
  }, a.ins) ? 'arrivata' : null
}

/** Il primo ripasso dell'indice è ancora a metà. */
export function ripassoInCorso(): boolean { return store.cursore(CURSORE_RIPASSO) !== null }

/**
 * La posta indicizzata dall'ultima volta, in righe del registro.
 *
 * La prima volta (senza cursore) si percorre tutto l'indice, e le righe
 * nascono `ricostruito: true`: dicono com'è la posta adesso, non com'era il
 * giorno in cui è arrivata. Ma un indice di quarantamila mail non si percorre
 * in una chiamata sola: ogni chiamata fa pochi pezzi, o meno di un secondo,
 * e lascia il resto alla prossima (il cursore avanza a ogni pezzo, e
 * `segnali:posta:ripasso` resta finché non si è arrivati in fondo). Si chiama
 * alla fine di ogni lettura e a ogni giro, così una mail risposta e
 * archiviata fra due letture è nel registro prima che la riconciliazione la
 * tolga.
 */
export function raccogliPosta(adesso = new Date()): { arrivate: number; inviate: number } {
  void adesso
  const partenza = Date.now()
  let cursore = store.cursore(CURSORE_POSTA)
  if (cursore === null) { store.segnaCursore(CURSORE_RIPASSO, '1'); store.segnaCursore(CURSORE_POSTA, ''); cursore = '' }
  const ricostruito = ripassoInCorso()
  const a: Attrezzi = { miei: mieiIndirizzi(), ricostruito, ins: db.prepare(INSERISCI), progettoDi: cercatoreDiProgetti() }
  const conta = { arrivate: 0, inviate: 0 }
  // Si cammina per (indicizzato, rid): una lettura scrive migliaia di righe con lo
  // stesso `indicizzato`, e «maggiore del cursore» ne salterebbe metà a ogni
  // pezzo. Il rid dell'ultima riga vista si salva anche lui, così la chiamata
  // dopo riparte dalla riga giusta invece di ripassare (e riscrivere per niente)
  // l'ultimo pezzo.
  const q = db.prepare(`
    SELECT rid, id, titolo, corpo, autore, autoreIndirizzo, quando, filo, messageId, inviato, massa, risponde, destinatari, indicizzato
    FROM documenti WHERE tipo = 'email' AND (indicizzato > ? OR (indicizzato = ? AND rid > ?)) ORDER BY indicizzato, rid LIMIT ?`)
  let daIndicizzato = cursore
  let daRid = Number(store.cursore(CURSORE_POSTA_RID) ?? -1)
  if (!Number.isFinite(daRid)) daRid = -1
  let finito = false
  for (let giri = 0; giri < PEZZI_PER_CHIAMATA; giri++) {
    const righe = q.all(daIndicizzato, daIndicizzato, daRid, A_PEZZI) as (DocPosta & { rid: number })[]
    if (!righe.length) { finito = true; break }
    db.exec('BEGIN')
    try {
      for (const d of righe) {
        const che = scriviDocPosta(d, a)
        if (che) conta[che === 'arrivata' ? 'arrivate' : 'inviate']++
      }
      const ultima = righe[righe.length - 1]!
      daIndicizzato = ultima.indicizzato; daRid = ultima.rid
      store.segnaCursore(CURSORE_POSTA, daIndicizzato)
      store.segnaCursore(CURSORE_POSTA_RID, String(daRid))
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
    if (righe.length < A_PEZZI) { finito = true; break }
    if (Date.now() - partenza > BUDGET_MS) break
  }
  if (finito && ricostruito) store.segnaCursore(CURSORE_RIPASSO, null)
  return conta
}

/** C'è posta mandata negli ultimi trenta giorni: senza, le righe sulla posta sarebbero cieche. */
export function coperturaInviata(adesso = new Date()): boolean {
  const da = new Date(adesso.getTime() - 30 * GIORNO).toISOString()
  const r = db.prepare("SELECT 1 FROM segnali WHERE genere = 'posta.inviata' AND quando >= ? AND quando < ? LIMIT 1").get(da, adesso.toISOString())
  return !!r
}

/**
 * Le coppie risposta: per ogni mail mandata, la mail arrivata a cui risponde.
 *
 * Prima quella il cui `messageId` è il `risponde` della mandata; altrimenti,
 * nello stesso filo (mai un filo `s:`, che è solo un oggetto uguale), l'ultima
 * arrivata prima della mandata il cui mittente sta fra i destinatari (o i
 * destinatari mancano). Una mail arrivata si appaia una volta sola, con la
 * risposta più vecchia. Una mail a se stesso non si appaia con niente.
 */
export function coppieRisposta(arrivate: SegnaleArrivata[], inviate: SegnaleInviata[], miei: Set<string> = new Set()): Coppia[] {
  const perMessageId = new Map<string, SegnaleArrivata>()
  const perFilo = new Map<string, SegnaleArrivata[]>()
  for (const a of arrivate) {
    if (a.dati?.messageId) perMessageId.set(a.dati.messageId, a)
    const f = a.dati?.filo
    if (f && !f.startsWith('s:')) {
      const l = perFilo.get(f) ?? []
      l.push(a); perFilo.set(f, l)
    }
  }
  for (const l of perFilo.values()) l.sort((x, y) => x.quando.localeCompare(y.quando))
  const prese = new Set<string>()
  const fuori: Coppia[] = []
  for (const s of inviate.slice().sort((x, y) => x.quando.localeCompare(y.quando))) {
    const dest = (s.dati?.destinatari ?? []).map(x => x.toLowerCase())
    if (dest.length && dest.every(d => miei.has(d))) continue
    let a: SegnaleArrivata | undefined
    if (s.dati?.risponde) {
      const x = perMessageId.get(s.dati.risponde)
      if (x && x.quando <= s.quando && !prese.has(x.id) && !miei.has(x.chi)) a = x
    }
    if (!a && s.dati?.filo && !s.dati.filo.startsWith('s:')) {
      const l = perFilo.get(s.dati.filo) ?? []
      for (let i = l.length - 1; i >= 0; i--) {
        const x = l[i]!
        if (x.quando >= s.quando) continue
        if (prese.has(x.id) || miei.has(x.chi)) continue
        if (dest.length && !dest.includes(x.chi.toLowerCase())) continue
        a = x; break
      }
    }
    if (!a) continue
    prese.add(a.id)
    fuori.push({ arrivata: a.id, inviata: s.id, latenza: Math.max(0, Math.round((Date.parse(s.quando) - Date.parse(a.quando)) / 1000)) })
  }
  return fuori
}

// — il codice: i giorni con un agente, e i commit suoi —

const CURSORE_CODICE = 'segnali:codice'
const CURSORE_COMMIT = 'segnali:commit'

/** Per conto: l'ultima volta che si è guardato `.git/logs/HEAD` di ogni cartella. */
const ultimeOcchiate = new Map<string, Map<string, number>>()
/** Per conto: le cartelle di lavoro note, riempite dal giro notturno. */
const cartelleDiLavoro = new Map<string, string[]>()

export function impostaCartelleDiLavoro(percorsi: string[]) {
  cartelleDiLavoro.set(chi.adesso() ?? '', [...new Set(percorsi)])
}

export function cartelleNote(): string[] { return cartelleDiLavoro.get(chi.adesso() ?? '') ?? [] }

/** Una riga di `git log` col formato di `raccogliCodice`: hash, data, autore, oggetto, trailer. */
export function leggiCommit(stdout: string): { hash: string; quando: string; autore: string; messaggio: string; agente: boolean }[] {
  return stdout.split('\x1e').map(r => r.replace(/^\n+/, '')).filter(Boolean).map(r => {
    const [hash = '', quando = '', autore = '', messaggio = '', trailer = ''] = r.split('\x1f')
    return { hash: hash.trim(), quando: quando.trim(), autore: autore.trim().toLowerCase(), messaggio: messaggio.replace(/\s+/g, ' ').trim().slice(0, 160), agente: !!trailer.trim() }
  }).filter(c => /^[0-9a-f]{7,64}$/.test(c.hash) && !Number.isNaN(Date.parse(c.quando)))
}

async function emailGitGlobale(): Promise<string> {
  try {
    const { stdout } = await execFileP('git', ['config', '--global', 'user.email'], { timeout: 3000 })
    return stdout.trim().toLowerCase()
  } catch { return '' }
}

/** Solo sul Mac, e solo con una fonte che legge la macchina. */
function sensoriCodice(): boolean {
  if (ospitato.OSPITATO) return false
  const c = cfg.leggi()
  return !!(c.desktop || c.conversazioni)
}

export async function raccogliCodice(adesso = new Date()): Promise<{ sessioni: number; commit: number }> {
  const conta = { sessioni: 0, commit: 0 }
  if (!sensoriCodice()) return conta

  // (a) i giorni con un agente: dai documenti delle conversazioni di codice
  const cursore = store.cursore(CURSORE_CODICE) ?? ''
  const righe = db.prepare(`
    SELECT id, percorso, quando, indicizzato FROM documenti
    WHERE fonte = 'conversazioni' AND (id LIKE 'conversazioni:codice:%' OR id LIKE 'conversazioni:codex:%') AND indicizzato >= ?
    ORDER BY indicizzato LIMIT 5000`).all(cursore) as { id: string; percorso: string | null; quando: string | null; indicizzato: string }[]
  const primaVolta = !cursore
  for (const r of righe) {
    if (!r.quando || !r.percorso) continue
    const giorno = fuso.giornoIn(new Date(r.quando))
    const agente = r.id.startsWith('conversazioni:codex:') ? 'Codex' : 'Claude Code'
    if (scrivi({
      id: `codice.sessione|${r.id}|${giorno}`, genere: 'codice.sessione', quando: r.quando, giorno, chi: agente, ref: r.percorso,
      progetto: progettoDelTesto(basename(r.percorso)),
      dati: { cartella: basename(r.percorso), ...(primaVolta ? { ricostruito: true } : {}) }
    })) conta.sessioni++
  }
  if (righe.length) store.segnaCursore(CURSORE_CODICE, righe[righe.length - 1]!.indicizzato)

  // (b) i commit suoi, nelle cartelle di lavoro il cui registro è cambiato
  const cartelle = cartelleNote()
  if (!cartelle.length) return conta
  const me = chi.adesso() ?? ''
  const occhiate = ultimeOcchiate.get(me) ?? new Map<string, number>()
  ultimeOcchiate.set(me, occhiate)
  const daQuando = store.cursore(CURSORE_COMMIT) ?? new Date(adesso.getTime() - 90 * GIORNO).toISOString()
  const miei = mieiIndirizzi()
  const globale = await emailGitGlobale()
  if (globale) miei.add(globale)
  // una cartella su cui git non ha risposto (il tempo scaduto, un registro rotto) tiene fermo il cursore:
  // altrimenti i suoi commit di oggi finirebbero prima di `--since` e non entrerebbero mai
  let guasti = 0
  for (const dir of cartelle) {
    let m = 0
    try { m = statSync(join(dir, '.git', 'logs', 'HEAD')).mtimeMs } catch { continue }
    if ((occhiate.get(dir) ?? 0) >= m) continue
    let stdout = ''
    try {
      const r = await execFileP('git', ['-C', dir, 'log', `--since=${daQuando}`, '--no-merges', '--format=%H%x1f%aI%x1f%ae%x1f%s%x1f%(trailers:key=Co-Authored-By,valueonly,separator=%x2C)%x1e'], { timeout: 5000, maxBuffer: 1 << 22 })
      stdout = r.stdout
    } catch { guasti++; continue }
    occhiate.set(dir, m)
    const progetto = progettoDelTesto(basename(dir))
    for (const c of leggiCommit(stdout)) {
      if (!miei.has(c.autore)) continue
      if (scrivi({
        id: `codice.commit|${c.hash}`, genere: 'codice.commit', quando: new Date(c.quando).toISOString(), chi: c.autore, ref: dir, progetto,
        dati: { agente: c.agente, messaggio: c.messaggio, cartella: basename(dir) }
      })) conta.commit++
    }
  }
  if (!guasti) store.segnaCursore(CURSORE_COMMIT, adesso.toISOString())
  return conta
}

// — l'agenda: cosa è cambiato da una lettura all'altra —

export type VistaAgenda = {
  chiave: string; titolo: string; inizio: string; fine: string | null; originale: string; stato: string
  /** L'indirizzo di chi organizza, minuscolo; e il suo nome (il CN), se il calendario lo dà. */
  organizzatore?: string; organizzatoreNome?: string; partecipanti: { indirizzo: string; stato: string }[]
}

/** La colonna `organizzatore` di `agenda_viste`: «Tom Brill <tom@…>» col nome, l'indirizzo solo senza. */
export function colonnaOrganizzatore(v: Pick<VistaAgenda, 'organizzatore' | 'organizzatoreNome'>): string | null {
  const addr = v.organizzatore?.toLowerCase() ?? ''
  if (!addr) return null
  const nome = nomePulito(v.organizzatoreNome, '')
  return nome ? `${nome} <${addr}>` : addr
}

/** Il rovescio: indirizzo e nome da mostrare (mai l'indirizzo) da quella colonna. */
export function organizzatoreDi(colonna: string | null | undefined): { indirizzo: string; nome: string } | null {
  const c = String(colonna ?? '').trim()
  if (!c) return null
  const m = c.match(/^(.*?)\s*<([^<>]+@[^<>]+)>$/)
  const indirizzo = (m ? m[2]! : c).trim().toLowerCase()
  if (!indirizzo.includes('@')) return null
  return { indirizzo, nome: nomePulito(m?.[1], indirizzo) }
}

type RigaVista = { uid: string; titolo: string | null; inizio: string | null; fine: string | null; originale: string | null; stato: string | null; mio: string | null; visto: string; organizzatore: string | null }

/**
 * Le occorrenze di questa lettura contro quelle dell'ultima: spostate,
 * rifiutate, annullate. Solo dentro la finestra letta, e solo su una lettura
 * intera. Torna quanti segnali nuovi ha scritto.
 */
export function raccogliAgenda(viste: VistaAgenda[], finestra: { da: string; a: string }, adesso = new Date()): number {
  const miei = mieiIndirizzi()
  const note = new Map<string, RigaVista>()
  for (const r of db.prepare('SELECT * FROM agenda_viste').all() as RigaVista[]) note.set(r.uid, r)
  let nuovi = 0
  const oraIso = adesso.toISOString()
  const dentro = (iso: string | null) => !!iso && iso >= finestra.da && iso <= finestra.a
  const mioStato = (v: VistaAgenda) => v.partecipanti.find(p => miei.has(p.indirizzo.toLowerCase()))?.stato?.toUpperCase() ?? null
  const viste_ = new Set<string>()
  db.exec('BEGIN')
  try {
    const up = db.prepare(`
      INSERT INTO agenda_viste (uid, titolo, inizio, fine, originale, stato, mio, visto, organizzatore) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(uid) DO UPDATE SET titolo = excluded.titolo, inizio = excluded.inizio, fine = excluded.fine,
        originale = excluded.originale, stato = excluded.stato, mio = excluded.mio, visto = excluded.visto, organizzatore = excluded.organizzatore`)
    for (const v of viste) {
      viste_.add(v.chiave)
      const mio = mioStato(v)
      const prima = note.get(v.chiave)
      if (prima && dentro(v.originale)) {
        const titolo = String(v.titolo ?? '').slice(0, 120)
        if (prima.inizio && prima.inizio !== v.inizio) {
          const minuti = Math.round((Date.parse(v.inizio) - Date.parse(prima.inizio)) / 60_000)
          const giorno = fuso.giornoIn(adesso)
          if (scrivi({
            id: `agenda.spostato|${v.chiave}|${giorno}`, genere: 'agenda.spostato', quando: oraIso, giorno, chi: v.organizzatore?.toLowerCase() ?? null, ref: v.chiave, valore: minuti,
            dati: { titolo, da: prima.inizio, a: v.inizio, organizzatore: v.organizzatore ?? null }
          })) nuovi++
        }
        if (mio === 'DECLINED' && prima.mio !== 'DECLINED') {
          const giorno = fuso.giornoIn(adesso)
          if (scrivi({
            id: `agenda.rifiutato|${v.chiave}|${giorno}`, genere: 'agenda.rifiutato', quando: oraIso, giorno, chi: v.organizzatore?.toLowerCase() ?? null, ref: v.chiave,
            dati: { titolo, da: v.inizio, a: null, organizzatore: v.organizzatore ?? null }
          })) nuovi++
        }
      }
      up.run(v.chiave, String(v.titolo ?? '').slice(0, 120), v.inizio, v.fine, v.originale, v.stato, mio, oraIso, colonnaOrganizzatore(v))
    }
    for (const [uid, r] of note) {
      if (viste_.has(uid) || !dentro(r.originale) || !r.inizio || r.inizio <= oraIso) continue
      const giorno = fuso.giornoIn(adesso)
      if (scrivi({
        id: `agenda.annullato|${uid}|${giorno}`, genere: 'agenda.annullato', quando: oraIso, giorno, chi: null, ref: uid,
        dati: { titolo: r.titolo, da: r.inizio, a: null, organizzatore: null }
      })) nuovi++
      db.prepare('DELETE FROM agenda_viste WHERE uid = ?').run(uid)
    }
    db.prepare('DELETE FROM agenda_viste WHERE originale < ?').run(new Date(adesso.getTime() - 90 * GIORNO).toISOString())
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
  return nuovi
}

// — la pulizia —

/** Via i segnali vecchi: quattrocento giorni, la posta a centottanta. */
export function pota(adesso = new Date()): number {
  const via = new Date(adesso.getTime() - 400 * GIORNO).toISOString()
  const viaPosta = new Date(adesso.getTime() - 180 * GIORNO).toISOString()
  const a = db.prepare('DELETE FROM segnali WHERE quando < ?').run(via).changes
  const b = db.prepare("DELETE FROM segnali WHERE genere LIKE 'posta.%' AND quando < ?").run(viaPosta).changes
  return Number(a) + Number(b)
}

export const perProva = { ultimeOcchiate, cartelleDiLavoro }
