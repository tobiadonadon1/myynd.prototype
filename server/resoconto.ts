// Quello che Myynd ha fatto per lui (P9): la lettura.
//
// Letture strette dal database del conto, le settimane nel suo fuso, il
// giorno in cui ha cominciato, la regola del lunedì. Non chiama il modello,
// non scrive niente in `mente.db`: l'unica scrittura è `resoconto.json`
// (il lunedì visto), ed è un gesto suo, non una lettura.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import db from './store.ts'
import * as fuso from './fuso.ts'
import * as conti from './conti.ts'
import * as chi from './chi.ts'
import * as cfg from './config.ts'
import * as progetti from './progetti.ts'
import * as automazioni from './automazioni.ts'
import * as misuraFeed from './misura-feed.ts'
import { conta, numeri as numeriDi, type Genere, type Materiale, type RigaAzione, type RigaCompito, type RigaFeed, type Voce } from './resoconto-conta.ts'


export type Quale = 'questa' | 'scorsa' | 'inizio'
export type VoceResoconto = Voce & { perso?: boolean }
export type Resoconto = {
  quale: Quale; da: string; a: string
  lunedi: string
  inizio: string
  numeri: { mail: number; lavori: number; scadenze: number; segnalate: number; minuti: number }
  preparate: { mail: number; lavori: number }
  stime: { genere: Genere; minuti: number }[]; riscritte: number
  punteggio: { giuste: number; totale: number; base: number } | null
  notato: { chiave: string; genere: string; dati: unknown; testoSuo: string | null; stato: string }[]
  segnalate: { utili: number; viste: number; mancate: number } | null
  voci: VoceResoconto[]
  automazioni: { id: string; nome: string; usate: number; prodotte: number }[]
  copertura: { postaInviata: boolean; bozzeInCasella: number }
  vuoto: boolean
}

const GIORNO = 86_400_000

let misuraPronta = false
/** Carica i moduli della misura del feed (P2) la prima volta: la rotta lo fa prima di leggere. */
export async function prepara(): Promise<void> {
  if (misuraPronta) return
  await misuraFeed.caricaModuli()
  misuraPronta = true
}
const QUALI: Quale[] = ['questa', 'scorsa', 'inizio']
export const eQuale = (x: unknown): x is Quale => typeof x === 'string' && (QUALI as string[]).includes(x)

/** Per le prove: quante volte si è letto il materiale (il lunedì fuori finestra non deve contare niente). */
export const sonda = { letture: 0 }

/**
 * L'ora di adesso. Solo per chi sviluppa (MYYND_DEV=1): MYYND_ADESSO sposta
 * l'orologio delle rotte del resoconto, così una scena può essere un lunedì.
 */
export function adesso(): Date {
  if (process.env.MYYND_DEV === '1' && process.env.MYYND_ADESSO) {
    const d = new Date(process.env.MYYND_ADESSO)
    if (Number.isFinite(d.getTime())) return d
  }
  return new Date()
}

/** Questa settimana (da lunedì a mezzanotte fino ad adesso) o quella scorsa, nel suo fuso. */
export function settimana(ora: Date, quale: 'questa' | 'scorsa', f = fuso.fusoDi()): { da: string; a: string; lunedi: string } {
  const p = fuso.parti(ora, f)
  const lun = p.giorno - ((p.settimana + 6) % 7)
  const questo = fuso.istante(p.anno, p.mese, lun, 0, f)
  const lunedi = fuso.giornoIn(questo, f)
  if (quale === 'questa') return { da: questo.toISOString(), a: ora.toISOString(), lunedi }
  return { da: fuso.istante(p.anno, p.mese, lun - 7, 0, f).toISOString(), a: questo.toISOString(), lunedi }
}

const inizi = new Map<string, { valore: string; scade: number }>()

/** Quando ha cominciato: il primo fra il conto, la prima riga e la prima carta. */
export function inizio(): string {
  const chiave = cfg.cartella()
  const c = inizi.get(chiave)
  if (c && c.scade > Date.now()) return c.valore
  const date: string[] = []
  const u = chi.adesso()
  if (u) { const k = conti.conto(u); if (k?.creato) date.push(k.creato) }
  const r1 = db.prepare('SELECT MIN(creato) AS m FROM compiti').get() as { m: string | null } | undefined
  const r2 = db.prepare('SELECT MIN(quando) AS m FROM feed').get() as { m: string | null } | undefined
  if (r1?.m) date.push(r1.m)
  if (r2?.m) date.push(r2.m)
  const buone = date.map(d => Date.parse(d)).filter(Number.isFinite)
  const valore = new Date(buone.length ? Math.min(...buone) : Date.now()).toISOString()
  inizi.set(chiave, { valore, scade: Date.now() + 10 * 60_000 })
  return valore
}

const segnaposti = (n: number) => Array.from({ length: n }, () => '?').join(',')
function aPezzi<T>(ids: string[], f: (pezzo: string[]) => T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 500) out.push(...f(ids.slice(i, i + 500)))
  return out
}
const colonne = (xs: { id: string }[]) => xs.map(x => x.id)

const TIPI_REGISTRO = "('email','lavoro.fatto','agenda','posta.cestina','posta.archivia','documento')"

/**
 * Le righe che servono a contare [da, a), e nient'altro: niente corpi, niente
 * `compitoDaRiga`, le colonne JSON lette come testo e aperte in JS.
 */
export function materiale(da: string, a: string): Materiale {
  sonda.letture++
  // le carte prima: le righe nate da una carta entrano fra i candidati
  const feed = db.prepare(`
    SELECT id, tipo, titolo, urgenza, quando, stato, motivo, ragione, vista, risposto, doc, progetto FROM feed
    WHERE (vista >= ? AND vista < ?) OR (stato = 'fatto' AND risposto >= ? AND risposto < ?)
  `).all(da, a, da, a) as RigaFeed[]

  const candidati = new Set<string>()
  const aggiungi = (xs: { id: string | null }[]) => { for (const x of xs) if (x.id) candidati.add(x.id) }
  aggiungi(db.prepare(`SELECT compito AS id FROM azioni WHERE esito = 'fatta' AND tipo IN ${TIPI_REGISTRO} AND quando >= ? AND quando < ?`).all(da, a) as { id: string | null }[])
  aggiungi(db.prepare('SELECT compito AS id FROM misure_compiti WHERE consegnato >= ? AND consegnato < ?').all(da, a) as { id: string }[])
  aggiungi(db.prepare('SELECT id FROM compiti WHERE chiuso >= ? AND chiuso < ?').all(da, a) as { id: string }[])
  aggiungi(db.prepare('SELECT id FROM compiti WHERE consegna IS NOT NULL AND COALESCE(chiuso, chiesto) >= ? AND COALESCE(chiuso, chiesto) < ?').all(da, a) as { id: string }[])
  aggiungi(db.prepare("SELECT id FROM compiti WHERE origine LIKE 'auto:%' AND creato >= ? AND creato < ?").all(da, a) as { id: string }[])
  aggiungi(db.prepare(`SELECT id FROM compiti WHERE email LIKE '%"salvata"%' AND chiesto >= ? AND chiesto < ?`).all(da, a) as { id: string }[])
  for (const r of db.prepare('SELECT id, mandata FROM compiti WHERE mandata IS NOT NULL').all() as { id: string; mandata: string }[]) {
    try {
      const q = Date.parse((JSON.parse(r.mandata) as { quando?: string }).quando ?? '')
      if (q >= Date.parse(da) && q < Date.parse(a)) candidati.add(r.id)
    } catch { /* una riga storta non conta */ }
  }
  const idFeed = feed.map(f => f.id)
  if (idFeed.length) aggiungi(aPezzi(idFeed, p => db.prepare(`SELECT id FROM compiti WHERE voce IN (${segnaposti(p.length)})`).all(...p) as { id: string }[]))

  // le catene intere: le madri delle revisioni, e le revisioni delle madri
  let nuovi = [...candidati]
  while (nuovi.length) {
    const prossimi: string[] = []
    const madri = aPezzi(nuovi.filter(x => x.startsWith('rev-')), p => db.prepare(`SELECT madre AS id FROM compiti WHERE id IN (${segnaposti(p.length)}) AND madre IS NOT NULL`).all(...p) as { id: string }[])
    const figlie = aPezzi(nuovi, p => db.prepare(`SELECT id FROM compiti WHERE madre IN (${segnaposti(p.length)}) AND id LIKE 'rev-%'`).all(...p) as { id: string }[])
    for (const id of [...colonne(madri), ...colonne(figlie)]) if (!candidati.has(id)) { candidati.add(id); prossimi.push(id) }
    nuovi = prossimi
  }
  const ids = [...candidati]

  const compiti = aPezzi(ids, p => db.prepare(`
    SELECT id, testo, stato, origine, voce, madre, doc, progetto, chiesto, chiuso, esito, sparito, creato, consegna, email, mandata,
      substr(risultato, 1, 2000) AS risultato
    FROM compiti WHERE id IN (${segnaposti(p.length)})
  `).all(...p) as RigaCompito[])
  const presenti = compiti.map(c => c.id)
  const azioni = aPezzi(presenti, p => db.prepare(`SELECT id, tipo, verso, cosa, compito, esito, dettaglio, quando FROM azioni WHERE compito IN (${segnaposti(p.length)})`).all(...p) as RigaAzione[])
  const misure = aPezzi(presenti, p => db.prepare(`SELECT compito, consegnato, via, distanza FROM misure_compiti WHERE compito IN (${segnaposti(p.length)})`).all(...p) as Materiale['misure'])
  const tenute = aPezzi(presenti, p => db.prepare(`SELECT ref, valore, quando FROM segnali WHERE genere = 'myynd.bozza' AND ref IN (${segnaposti(p.length)}) AND valore IS NOT NULL`).all(...p) as Materiale['tenute'])

  // il registro senza riga, e le pulizie delle regole
  azioni.push(...db.prepare(`
    SELECT id, tipo, verso, cosa, compito, esito, dettaglio, quando FROM azioni
    WHERE tipo = 'email' AND esito = 'fatta' AND quando >= ? AND quando < ?
      AND (compito IS NULL OR NOT EXISTS (SELECT 1 FROM compiti c WHERE c.id = azioni.compito))
  `).all(da, a) as RigaAzione[])
  azioni.push(...db.prepare(`
    SELECT id, tipo, verso, cosa, compito, esito, dettaglio, quando FROM azioni
    WHERE tipo = 'posta.regola.archivia' AND esito = 'fatta' AND quando >= ? AND quando < ?
  `).all(da, a) as RigaAzione[])

  // chi ha scritto, e quali documenti sono ancora nell'indice
  const docs = new Set<string>()
  for (const c of compiti) {
    if (c.doc) docs.add(c.doc)
    if (c.mandata) try { const d = (JSON.parse(c.mandata as string) as { doc?: string }).doc; if (d) docs.add(d) } catch { /* niente */ }
  }
  for (const f of feed) if (f.doc) docs.add(f.doc)
  const autori: Record<string, string> = {}
  for (const r of aPezzi([...docs], p => db.prepare(`SELECT id, autore FROM documenti WHERE id IN (${segnaposti(p.length)})`).all(...p) as { id: string; autore: string | null }[])) autori[r.id] = r.autore ?? ''

  return { compiti, azioni, misure, tenute, feed, autori }
}

/** Le rifiniture delle voci contate: dove si aprono (solo se c'è ancora), i nomi dei progetti. */
function rifinisci(voci: Voce[], m: Materiale): VoceResoconto[] {
  const per = new Map(m.compiti.map(c => [c.id, c]))
  return voci.map(v => {
    const out: VoceResoconto = { ...v }
    if (out.apre && 'doc' in out.apre && !(out.apre.doc in m.autori)) out.apre = null
    const c = v.chiave.startsWith('compito:') ? per.get(v.chiave.slice(8)) : undefined
    if (v.genere === 'documento' && c) {
      let k: { percorso?: string; desktop?: string } | null = null
      try { k = typeof c.consegna === 'string' ? JSON.parse(c.consegna) : (c.consegna as typeof k) } catch { k = null }
      const dove = k?.desktop || k?.percorso
      if (!dove || !existsSync(dove)) { out.apre = null; out.perso = true }
    }
    if (c && !out.chi && ['documento', 'bozza', 'agenda', 'riordino'].includes(v.genere) && c.progetto) {
      out.chi = progetti.trova(c.progetto)?.nome ?? null
    }
    return out
  })
}

function giornoLocale(iso: string, f: string): string { return fuso.giornoIn(new Date(iso), f) }

function costruisci(quale: Quale, da: string, a: string, lunedi: string, ini: string): Resoconto {
  const f = fuso.fusoDi()
  const m = materiale(da, a)
  const c = conta(m, { da, a, fuso: f })
  const voci = rifinisci(c.voci, m)
  const n = numeriDi(voci)

  // il gemello: da venti affermazioni, sempre con chi non ti conosce accanto
  const giorni = db.prepare('SELECT giuste, sbagliate, base FROM punteggi WHERE giorno >= ? AND giorno < ? AND base IS NOT NULL')
    .all(giornoLocale(da, f), giornoLocale(a, f)) as { giuste: number; sbagliate: number; base: number }[]
  let giuste = 0, totale = 0, base = 0
  for (const g of giorni) { const t = g.giuste + g.sbagliate; giuste += g.giuste; totale += t; base += g.base * t }
  const punteggio = totale >= 20 ? { giuste, totale, base: Math.round(base) } : null

  const notato = (db.prepare(`
    SELECT chiave, genere, dati, testoSuo, stato FROM abitudini
    WHERE tolta IS NULL AND visto >= ? AND visto < ? ORDER BY (stato != 'osservata') DESC, visto
  `).all(da, a) as { chiave: string; genere: string; dati: string; testoSuo: string | null; stato: string }[])
    .map(r => { let dati: unknown = null; try { dati = JSON.parse(r.dati) } catch { dati = null } return { ...r, dati } })

  let segnalate: Resoconto['segnalate'] = null
  // la misura del feed vuole i suoi moduli caricati: `prepara()`, che chiama la rotta
  if (quale !== 'questa' && misuraPronta) {
    const mf = misuraFeed.misura((Date.parse(a) - Date.parse(da)) / GIORNO, Date.parse(a))
    const k = mf.carte
    const utili = k.agite + k.fuori + k.tardive
    const viste = utili + k.scartate.vecchia + k.scartate.non_mia + k.scartate.non_chiara + k.scartate.senza + k.scadute.tempo
    if (viste >= 5) segnalate = { utili, viste, mancate: mf.mancate.totale }
  }

  const postaInviata = !!db.prepare("SELECT 1 FROM documenti WHERE inviato = 1 AND tipo = 'email' AND quando >= ? LIMIT 1").get(new Date(Date.parse(a) - 30 * GIORNO).toISOString())
  const partite = new Set(m.azioni.filter(x => x.tipo === 'email' && x.esito === 'fatta' && x.compito).map(x => x.compito!))
  for (const r of m.compiti) if (r.mandata) partite.add(r.id)
  const misuraDi = new Map(m.misure.map(x => [x.compito, x]))
  const figlie = new Map<string, string[]>()
  for (const r of m.compiti) if (r.madre) figlie.set(r.madre, [...(figlie.get(r.madre) ?? []), r.id])
  const inviataInCatena = (id: string): boolean => partite.has(id) || (figlie.get(id) ?? []).some(inviataInCatena)
  let bozzeInCasella = 0
  for (const r of m.compiti) {
    if (r.sparito || !r.email || !String(r.email).includes('"salvata"')) continue
    const t = misuraDi.get(r.id)?.consegnato ?? r.chiesto
    if (!t || Date.parse(t) < Date.parse(da) || Date.parse(t) >= Date.parse(a)) continue
    if (!inviataInCatena(r.id)) bozzeInCasella++
  }

  const ricette = automazioni.ricette()
  const autom = c.automazioni.map(x => ({ ...x, nome: ricette.find(r => r.id === x.id)?.nome ?? x.id }))

  return {
    quale, da, a, lunedi, inizio: ini,
    ...n, punteggio, notato, segnalate, voci, automazioni: autom,
    copertura: { postaInviata, bozzeInCasella },
    vuoto: !voci.length && !notato.length && !punteggio
  }
}

/** Il resoconto di una finestra: questa settimana, la scorsa, o da quando ha cominciato. */
export function resoconto(quale: Quale, ora = adesso()): Resoconto {
  const f = fuso.fusoDi()
  const lunedi = settimana(ora, 'questa', f).lunedi
  const ini = inizio()
  if (quale === 'inizio') return costruisci(quale, ini, ora.toISOString(), lunedi, ini)
  const s = settimana(ora, quale, f)
  return costruisci(quale, s.da, s.a, lunedi, ini)
}

/** Le tre righe della Memoria: una lettura sola, tre finestre. Niente gemello, niente misure. */
export function sommario(ora = adesso()): { inizio: string; righe: { quale: Quale; numeri: Resoconto['numeri'] }[] } {
  const f = fuso.fusoDi()
  const ini = inizio()
  const q = settimana(ora, 'questa', f), s = settimana(ora, 'scorsa', f)
  // di solito l'inizio è prima della settimana scorsa; se no, si legge da lì
  const m = materiale(Date.parse(ini) < Date.parse(s.da) ? ini : s.da, ora.toISOString())
  const finestre: [Quale, string, string][] = [['questa', q.da, q.a], ['scorsa', s.da, s.a], ['inizio', ini, ora.toISOString()]]
  const righe: { quale: Quale; numeri: Resoconto['numeri'] }[] = []
  for (const [quale, da, a] of finestre) {
    const voci = conta(m, { da, a, fuso: f }).voci
    if (voci.length) righe.push({ quale, numeri: numeriDi(voci).numeri })
  }
  return { inizio: ini, righe }
}

const fileVisto = () => join(cfg.cartella(), 'resoconto.json')
function lunediVisto(): string | null {
  try { const v = JSON.parse(readFileSync(fileVisto(), 'utf8')) as { visto?: unknown }; return typeof v.visto === 'string' ? v.visto : null } catch { return null }
}

/**
 * La carta del lunedì: da lunedì alle 6 a mercoledì sera, se la settimana
 * scorsa ha una mail o un lavoro, e se non l'ha già aperta. Fuori da quei
 * giorni non conta niente.
 */
export function lunedi(ora = adesso()): { mostra: false } | { mostra: true; lunedi: string; numeri: { mail: number; lavori: number; scadenze: number } } {
  const f = fuso.fusoDi()
  const p = fuso.parti(ora, f)
  const dentro = (p.settimana === 1 && p.ora >= 6) || p.settimana === 2 || p.settimana === 3
  if (!dentro) return { mostra: false }
  const s = settimana(ora, 'scorsa', f)
  if (lunediVisto() === s.lunedi) return { mostra: false }
  const voci = conta(materiale(s.da, s.a), { da: s.da, a: s.a, fuso: f }).voci
  // le sole pulizie delle regole non bastano a una carta
  if (!voci.some(v => (v.genere === 'mail' || ['documento', 'codice', 'agenda', 'riordino', 'bozza'].includes(v.genere)) && !v.chiave.startsWith('regola:'))) return { mostra: false }
  const n = numeriDi(voci).numeri
  return { mostra: true, lunedi: s.lunedi, numeri: { mail: n.mail, lavori: n.lavori, scadenze: n.scadenze } }
}

export const LUNEDI = /^\d{4}-\d{2}-\d{2}$/

/** Ha aperto il resoconto di quel lunedì: la carta non torna. L'unica scrittura di P9. */
export function segnaVisto(l: string): void {
  if (!LUNEDI.test(l)) throw new Error('Non conosco questo periodo.')
  const file = fileVisto()
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ visto: l }), { mode: 0o600 })
  renameSync(tmp, file)
}

// — la prova gratuita, spenta —

/** L3 (Paddle, prova di 14 giorni) la accende. Oggi non c'è nessuna prova, quindi dice sempre di no. */
export type Prova = { dal: string; giorni: number; finisce: string }
let prova: () => Prova | null = () => null
export function usaProva(f: () => Prova | null): void { prova = f }

/** L'ultimo giorno della prova, dalle 6 del mattino: quello che ha fatto dal primo giorno. */
export function bilancio(ora = adesso()): { mostra: false } | { mostra: true; giorni: number; resoconto: Resoconto } {
  const p = prova()
  if (!p) return { mostra: false }
  const fine = Date.parse(p.finisce)
  if (!Number.isFinite(fine) || !Number.isFinite(Date.parse(p.dal))) return { mostra: false }
  const f = fuso.fusoDi()
  const ultimo = fuso.parti(new Date(fine - 1), f)
  const alle6 = fuso.istante(ultimo.anno, ultimo.mese, ultimo.giorno, 6, f).getTime()
  if (ora.getTime() < alle6 || ora.getTime() >= fine) return { mostra: false }
  const lun = settimana(ora, 'questa', f).lunedi
  return { mostra: true, giorni: p.giorni, resoconto: costruisci('inizio', new Date(p.dal).toISOString(), ora.toISOString(), lun, inizio()) }
}
