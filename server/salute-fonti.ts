// La salute delle fonti, giorno per giorno, e lo stato di adesso.
//
// Ogni lettura di ogni fonte lascia qui una riga per giorno (`salute_fonti`):
// quante letture, quante pulite, quante a metà o fallite, la causa peggiore,
// la versione dell'app. Il guaio di adesso, se c'è, è un episodio in
// `stato_fonti`: nasce alla prima lettura fallita, si allunga a ogni lettura
// fallita contata, si chiude alla prima pulita. Tutti e due stanno nel
// database di chi legge, quindi sopravvivono a un riavvio (la vecchia `Map`
// in memoria no: dopo ogni aggiornamento la riga fissa spariva finché la
// lettura dopo non la ritrovava).
//
// Qui si registra e si legge; le regole — quando un guaio si mostra, com'è
// andata una giornata, quando un silenzio è un fatto — stanno in
// `salute-regole.ts`, senza niente intorno.

import { readFileSync } from 'node:fs'
import db, { cursore, segnaCursore } from './store.ts'
import * as cfg from './config.ts'
import * as chi from './chi.ts'
import { fonteCollegata } from './fonti-collegate.ts'
import { giornoIn, istante } from './fuso.ts'
import { ultimoRisveglio } from './sveglia.ts'
import * as granolaMcp from './connettori/granolaMcp.ts'
import * as whatsapp from './connettori/whatsapp.ts'
import { peggiore, type Rimedio } from './connettori/guaio.ts'
import {
  DOPO_RISVEGLIO_MS, INVENTARIO, INVENTARIO_GIORNI, STORIA_GIORNI, TESTE,
  contata, mediana, provvisorio, silenzioArrivi, silenzioInventario, sintesi, verdetto, visibile,
  type RigaGiorno, type Sintesi, type Verdetto
} from './salute-regole.ts'

export type Esito = 'pulita' | 'incompleta' | 'guaio'
export type Registrazione = {
  fonte: string; esito: Esito; rimedio: Rimedio | null; frase: string | null
  durata: number; tolti: number; inventario: number | null; sonda?: 'ok' | Rimedio; quando: number
}
export type Motivo = 'non-disponibile' | 'incompleta'
export type Episodio = { fonte: string; motivo: Motivo; rimedio: Rimedio | null; frase: string | null; dal: string; fila: number; visto: string }
export type FonteIncompleta = { fonte: string; motivo: Motivo; rimedio: Rimedio; dal: string; dopoAggiornamento?: boolean }
export type Silenzio = { forma: 'arrivi' | 'inventario'; giorni: number; n: number }

export type GiornoSalute = {
  giorno: string; chiuso: boolean; misurato: boolean; pulito: boolean | null
  fonti: {
    fonte: string; verdetto: Verdetto; provvisorio: boolean; rimedio: Rimedio | null; letture: number; pulite: number
    incomplete: number; guai: number; documenti: number; totale: number | null; durata: number; versione: string | null; frase: string | null
  }[]
}
export type RispostaSalute = {
  giorni: GiornoSalute[]
  /** Sempre tutte le fonti, sempre i trenta giorni chiusi prima di oggi. */
  sintesi: Sintesi
  adesso: (Episodio & { visibile: boolean })[]
}

type Riga = RigaGiorno & { durata: number; tolti: number; frase: string | null; prima: string | null; ultima: string | null }

// — la versione dell'app —

let versioneLetta: string | null | undefined
/**
 * La versione dell'app che sta leggendo.
 *
 * Il guscio la passa in `MYYND_VERSIONE`; senza (un server lanciato a mano)
 * vale quella di `package.json`. Serve a una cosa sola: sapere che le Note
 * hanno smesso di leggersi *dopo un aggiornamento*, che con la firma ad hoc
 * vuol dire l'accesso completo al disco perso, non un guasto di Myynd.
 */
export function versioneApp(): string | null {
  const env = process.env.MYYND_VERSIONE?.trim()
  if (env) return env.slice(0, 40)
  if (versioneLetta === undefined) {
    try {
      const v = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: unknown }).version
      versioneLetta = typeof v === 'string' && v ? v.slice(0, 40) : null
    } catch { versioneLetta = null }
  }
  return versioneLetta
}

const CURSORE_VERSIONE = (fonte: string) => `salute:versione:${fonte}`

// — le righe —

function riga(giorno: string, fonte: string): Riga | null {
  return (db.prepare('SELECT * FROM salute_fonti WHERE giorno = ? AND fonte = ?').get(giorno, fonte) as Riga | undefined) ?? null
}

function episodio(fonte: string): Episodio | null {
  return (db.prepare('SELECT * FROM stato_fonti WHERE fonte = ?').get(fonte) as Episodio | undefined) ?? null
}

/** Tutti gli episodi aperti di chi chiede. */
export function episodi(): Episodio[] {
  return db.prepare('SELECT * FROM stato_fonti ORDER BY dal, rowid').all() as Episodio[]
}

function scriviRiga(r: Riga) {
  db.prepare(`
    INSERT INTO salute_fonti (giorno, fonte, letture, pulite, incomplete, guai, fila, documenti, tolti, totale, durata,
      sonda, rimedio, frase, versione, prima, ultima, verdetto)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(giorno, fonte) DO UPDATE SET letture = excluded.letture, pulite = excluded.pulite,
      incomplete = excluded.incomplete, guai = excluded.guai, fila = excluded.fila, documenti = excluded.documenti,
      tolti = excluded.tolti, totale = excluded.totale, durata = excluded.durata, sonda = excluded.sonda,
      rimedio = excluded.rimedio, frase = excluded.frase, versione = excluded.versione, prima = excluded.prima,
      ultima = excluded.ultima, verdetto = excluded.verdetto
  `).run(r.giorno, r.fonte, r.letture, r.pulite, r.incomplete, r.guai, r.fila, r.documenti, r.tolti, r.totale, r.durata,
    r.sonda, r.rimedio, r.frase, r.versione, r.prima, r.ultima, r.verdetto)
}

function rigaNuova(giorno: string, fonte: string): Riga {
  return {
    giorno, fonte, letture: 0, pulite: 0, incomplete: 0, guai: 0, fila: 0, documenti: 0, tolti: 0, totale: null, durata: 0,
    sonda: null, rimedio: null, frase: null, versione: null, prima: null, ultima: null, verdetto: null
  }
}

/**
 * Una lettura, o una sonda, di una fonte: la riga del giorno e l'episodio.
 *
 * Tutto in una transazione, nel database di chi legge. Un guaio passeggero
 * nei primi due minuti dopo un risveglio non si scrive nemmeno; due letture
 * fallite a meno di otto minuti contano una volta. Torna se la riga fissa in
 * prima pagina deve cambiare: l'episodio di questa fonte è diventato
 * visibile, o ha smesso di esserlo.
 */
export function registra(r: Registrazione, o: { risveglio?: number } = {}): { cambiato: boolean } {
  const fallita = r.esito !== 'pulita'
  if (fallita && r.rimedio === 'attendi' && r.quando - (o.risveglio ?? ultimoRisveglio()) < DOPO_RISVEGLIO_MS) return { cambiato: false }
  const iso = new Date(r.quando).toISOString()
  const giorno = giornoIn(new Date(r.quando))
  const versione = versioneApp()
  db.exec('BEGIN')
  try {
    const ep = episodio(r.fonte)
    const primaVisibile = !!ep && visibile(ep)
    const conta = fallita && contata(ep ? Date.parse(ep.visto) : null, r.quando)

    // l'episodio, prima: la riga del giorno ne prende la fila
    let dopo: Episodio | null = null
    if (!fallita) {
      if (ep) db.prepare('DELETE FROM stato_fonti WHERE fonte = ?').run(r.fonte)
      if (versione) segnaCursore(CURSORE_VERSIONE(r.fonte), versione)
    } else if (!ep) {
      dopo = { fonte: r.fonte, motivo: r.esito === 'guaio' ? 'non-disponibile' : 'incompleta', rimedio: r.rimedio, frase: r.frase, dal: iso, fila: 1, visto: iso }
      db.prepare('INSERT INTO stato_fonti (fonte, motivo, rimedio, frase, dal, fila, visto) VALUES (?,?,?,?,?,?,?)')
        .run(dopo.fonte, dopo.motivo, dopo.rimedio, dopo.frase, dopo.dal, dopo.fila, dopo.visto)
    } else {
      dopo = {
        ...ep,
        motivo: ep.motivo === 'non-disponibile' || r.esito === 'guaio' ? 'non-disponibile' : 'incompleta',
        rimedio: peggiore(ep.rimedio, r.rimedio),
        frase: r.frase ?? ep.frase,
        ...(conta ? { fila: ep.fila + 1, visto: iso } : {})
      }
      db.prepare('UPDATE stato_fonti SET motivo = ?, rimedio = ?, frase = ?, fila = ?, visto = ? WHERE fonte = ?')
        .run(dopo.motivo, dopo.rimedio, dopo.frase, dopo.fila, dopo.visto, r.fonte)
    }

    const g = riga(giorno, r.fonte) ?? rigaNuova(giorno, r.fonte)
    g.letture += 1
    if (!fallita) {
      g.pulite += 1
      g.fila = 0
      if (r.inventario !== null) g.totale = r.inventario
    } else {
      if (conta && r.esito === 'incompleta') g.incomplete += 1
      if (conta && r.esito === 'guaio') g.guai += 1
      g.rimedio = peggiore(g.rimedio, r.rimedio)
      g.fila = dopo?.fila ?? g.fila
    }
    g.durata = Math.max(g.durata, Math.max(0, Math.round(r.durata)))
    g.tolti += Math.max(0, r.tolti)
    g.sonda = r.sonda ?? g.sonda
    g.frase = r.frase ?? g.frase
    g.versione = versione
    g.prima = g.prima ?? iso
    g.ultima = iso
    scriviRiga(g)
    db.exec('COMMIT')
    return { cambiato: primaVisibile !== (!!dopo && visibile(dopo)) }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/**
 * Una lettura di tutto, intera, è finita: le fonti che non ha letto non hanno
 * più un guaio da mostrare (sono state scollegate, o non si leggono più di
 * qui). WhatsApp resta: non si legge mai, lo guarda la sonda del giorno.
 */
export function chiudiAssenti(lette: Set<string>): boolean {
  let tolto = false
  for (const ep of episodi()) {
    if (lette.has(ep.fonte) || ep.fonte === 'whatsapp') continue
    if (visibile(ep)) tolto = true
    db.prepare('DELETE FROM stato_fonti WHERE fonte = ?').run(ep.fonte)
  }
  return tolto
}

/** Toglie l'episodio di una fonte: la lettura ha detto che è stata scollegata. */
export function dimentica(fonte: string): boolean {
  const ep = episodio(fonte)
  if (!ep) return false
  db.prepare('DELETE FROM stato_fonti WHERE fonte = ?').run(fonte)
  return visibile(ep)
}

/**
 * Le fonti da dire nella riga fissa: episodi visibili, di fonti ancora
 * collegate, mai i motori (quelli si guardano dal vivo, `salute-teste.ts`).
 */
export function fontiIncomplete(): FonteIncompleta[] {
  try {
    const c = cfg.leggi()
    const versione = versioneApp()
    return episodi()
      .filter(ep => visibile(ep) && !TESTE.has(ep.fonte) && fonteCollegata(ep.fonte, c))
      .map(ep => {
        const rimedio: Rimedio = ep.rimedio ?? (ep.motivo === 'incompleta' ? 'attendi' : 'guarda')
        const vista = rimedio === 'permesso-disco' ? cursore(CURSORE_VERSIONE(ep.fonte)) : null
        return {
          fonte: ep.fonte, motivo: ep.motivo, rimedio, dal: ep.dal,
          ...(vista && versione && vista !== versione ? { dopoAggiornamento: true } : {})
        }
      })
  } catch { return [] }
}

// — i giorni —

/** Il giorno `n` giorni prima (o dopo, se negativo) di `giorno`, come AAAA-MM-GG. */
function spostaGiorno(giorno: string, n: number): string {
  const [a, m, g] = giorno.split('-').map(Number)
  // a mezzogiorno UTC: nessun cambio d'ora sposta il giorno
  const d = new Date(Date.UTC(a, m - 1, g - n, 12))
  return d.toISOString().slice(0, 10)
}

/** Quanti giorni da `da` a `a` (AAAA-MM-GG), contando le date e non le ore. */
function giorniFra(da: string, a: string): number {
  const t = (s: string) => { const [x, y, z] = s.split('-').map(Number); return Date.UTC(x, y - 1, z) }
  return Math.round((t(a) - t(da)) / 86_400_000)
}

/** L'inizio e la fine di un giorno locale, come istanti ISO. */
function limiti(giorno: string): { inizio: string; fine: string } {
  const [a, m, g] = giorno.split('-').map(Number)
  return { inizio: istante(a, m, g, 0).toISOString(), fine: istante(a, m, g + 1, 0).toISOString() }
}

/** Quanti documenti di ogni fonte sono entrati nell'indice in quel giorno. */
function arriviDel(giorno: string): Map<string, number> {
  const { inizio, fine } = limiti(giorno)
  const r = db.prepare('SELECT fonte, COUNT(*) AS n FROM documenti WHERE indicizzato >= ? AND indicizzato < ? GROUP BY fonte')
    .all(inizio, fine) as { fonte: string; n: number }[]
  return new Map(r.map(x => [x.fonte, x.n]))
}

/** Una fonte porta l'inventario intero a ogni lettura (e non gli arrivi)? */
function conInventario(fonte: string, c: cfg.Config): boolean {
  return INVENTARIO.has(fonte) || (fonte === 'granola' && !granolaMcp.conAccount(c))
}

/** La lettura di questa fonte porta l'inventario intero? Allora il suo `documenti` è il totale. */
export function portaInventario(fonte: string): boolean {
  try { return conInventario(fonte, cfg.leggi()) } catch { return INVENTARIO.has(fonte) }
}

/** Le righe chiuse di una fonte prima di un giorno, dalla più recente. */
function chiusePrima(fonte: string, giorno: string, quante: number): Riga[] {
  return db.prepare(`SELECT * FROM salute_fonti WHERE fonte = ? AND giorno < ? AND verdetto IS NOT NULL
    ORDER BY giorno DESC LIMIT ?`).all(fonte, giorno, quante) as Riga[]
}

/**
 * Il silenzio di una fonte, alla chiusura del giorno `r`.
 *
 * Per chi porta arrivi: la corsa di giorni puliti e vuoti che finisce qui,
 * contro il solito dei giorni prima. Per chi porta l'inventario: il totale
 * dell'ultima lettura contro il solito. È un fatto, mai un guasto.
 */
function tace(r: Riga, c: cfg.Config): boolean {
  if (TESTE.has(r.fonte) || r.fonte === 'x' || r.fonte === 'lavoro') return false
  if (conInventario(r.fonte, c)) {
    const storia = chiusePrima(r.fonte, r.giorno, INVENTARIO_GIORNI * 3)
      .filter(x => x.totale !== null && x.verdetto !== 'spento').slice(0, INVENTARIO_GIORNI).map(x => x.totale as number)
    return silenzioInventario(r.totale, storia)
  }
  if (r.documenti > 0) return false
  let corsa = 1
  const prima = chiusePrima(r.fonte, r.giorno, 120)
  let i = 0
  for (; i < prima.length; i++) {
    const x = prima[i]
    if (x.verdetto === 'spento') continue
    if ((x.verdetto === 'pulito' || x.verdetto === 'muto') && x.documenti === 0) { corsa++; continue }
    break
  }
  const storia = prima.slice(i).filter(x => x.verdetto !== 'spento').slice(0, STORIA_GIORNI).map(x => x.documenti)
  return silenzioArrivi(storia, corsa)
}

/**
 * Chiude i giorni prima di oggi: gli arrivi dall'indice, il silenzio, il
 * verdetto. Un giorno che è finito con una lettura fallita resta aperto
 * finché non si sa com'è andata la lettura dopo. Idempotente: una riga
 * chiusa non si riscrive mai. Torna quante righe ha chiuso.
 */
export function chiudiGiorni(adesso = new Date()): number {
  const oggi = giornoIn(adesso)
  const c = cfg.leggi()
  const giorni = (db.prepare('SELECT DISTINCT giorno FROM salute_fonti WHERE verdetto IS NULL AND giorno < ? ORDER BY giorno')
    .all(oggi) as { giorno: string }[]).map(x => x.giorno)
  let chiuse = 0
  for (const giorno of giorni) {
    const arrivi = arriviDel(giorno)
    const { fine } = limiti(giorno)
    const aperte = db.prepare('SELECT * FROM salute_fonti WHERE giorno = ? AND verdetto IS NULL').all(giorno) as Riga[]
    for (const r of aperte) {
      const testa = TESTE.has(r.fonte)
      if (!testa) r.documenti = arrivi.get(r.fonte) ?? 0
      let ripreso: boolean | null = true
      if (!testa && r.fila > 0 && fonteCollegata(r.fonte, c)) {
        const ep = episodio(r.fonte)
        if (ep && ep.dal < fine) {
          const dopo = db.prepare('SELECT 1 FROM salute_fonti WHERE fonte = ? AND giorno > ? AND (letture > 0 OR sonda IS NOT NULL) LIMIT 1')
            .get(r.fonte, giorno)
          ripreso = dopo ? false : null
        }
      }
      const v = verdetto(r, { testa, ripreso, muto: !testa && tace(r, c) })
      if (v === null) {
        if (!testa) db.prepare('UPDATE salute_fonti SET documenti = ? WHERE giorno = ? AND fonte = ?').run(r.documenti, giorno, r.fonte)
        continue
      }
      db.prepare('UPDATE salute_fonti SET documenti = ?, verdetto = ? WHERE giorno = ? AND fonte = ?').run(r.documenti, v, giorno, r.fonte)
      chiuse++
    }
  }
  return chiuse
}

/**
 * Le fonti che tacciono, per la scheda: solo quelle segnate mute alla
 * chiusura dell'ultimo giorno, e ancora mute adesso (un arrivo di oggi, o un
 * inventario tornato, toglie il segno subito). Sulle giornate sane non costa
 * niente: la domanda all'indice si fa solo per le fonti segnate.
 */
export function silenzi(adesso = new Date()): Map<string, Silenzio> {
  const fuori = new Map<string, Silenzio>()
  try {
    const c = cfg.leggi()
    const oggi = giornoIn(adesso)
    const ultime = db.prepare(`SELECT s.* FROM salute_fonti s WHERE s.giorno < ? AND s.verdetto IS NOT NULL AND s.verdetto <> 'spento'
      AND s.giorno = (SELECT MAX(t.giorno) FROM salute_fonti t WHERE t.fonte = s.fonte AND t.giorno < ? AND t.verdetto IS NOT NULL AND t.verdetto <> 'spento')`)
      .all(oggi, oggi) as Riga[]
    for (const r of ultime) {
      if (r.verdetto !== 'muto' || TESTE.has(r.fonte) || r.fonte === 'x' || r.fonte === 'lavoro' || !fonteCollegata(r.fonte, c)) continue
      if (conInventario(r.fonte, c)) {
        const storia = chiusePrima(r.fonte, r.giorno, INVENTARIO_GIORNI * 3)
          .filter(x => x.totale !== null && x.verdetto !== 'spento').slice(0, INVENTARIO_GIORNI).map(x => x.totale as number)
        const n = (db.prepare('SELECT COUNT(*) AS n FROM documenti WHERE fonte = ?').get(r.fonte) as { n: number }).n
        if (storia.length && n >= 0.2 * mediana(storia)) continue
        fuori.set(r.fonte, { forma: 'inventario', giorni: 0, n })
        continue
      }
      // l'inizio della corsa vuota: all'indietro finché i giorni sono vuoti, saltando quelli spenti
      let inizio = r.giorno
      let ultimoConArrivi: string | null = null
      for (const x of chiusePrima(r.fonte, r.giorno, 120)) {
        if (x.verdetto === 'spento') continue
        if (x.documenti === 0) { inizio = x.giorno; continue }
        ultimoConArrivi = x.giorno
        break
      }
      const [a, m, g] = inizio.split('-').map(Number)
      const dal = istante(a, m, g, 0).toISOString()
      if (db.prepare('SELECT 1 FROM documenti WHERE fonte = ? AND indicizzato >= ? LIMIT 1').get(r.fonte, dal)) continue
      fuori.set(r.fonte, { forma: 'arrivi', giorni: giorniFra(ultimoConArrivi ?? spostaGiorno(inizio, 1), oggi), n: 0 })
    }
  } catch { /* la scheda senza la riga del silenzio è la scheda di sempre */ }
  return fuori
}

// — il permesso delle Note, dal vivo —

const verificate = new Map<string, number>()
/** Ogni quanto si può chiudere dal vivo un episodio delle Note: la lettura che segue deve avere il tempo di dire com'è. */
const VERIFICA_OGNI = 10 * 60_000

/**
 * Le Note guariscono subito, senza aspettare il giro dei dieci minuti.
 *
 * La sonda di `/api/stato` apre gli stessi file che apre la lettura: se dice
 * «leggibile» e l'episodio delle Note è un permesso mancante, l'episodio si
 * chiude adesso e chi chiama rilegge le Note in sottofondo. Una volta ogni
 * dieci minuti al massimo, per persona: se la lettura fallisce di nuovo, la
 * riga torna e non si rincorre. Il desktop no: `accessoCompleto()` guarda
 * altre cartelle da quelle che la lettura apre.
 */
export function verificaPermessi(p: { note: string }, adesso = Date.now()): string[] {
  if (p.note !== 'leggibile') return []
  const ep = episodio('note')
  if (!ep || ep.rimedio !== 'permesso-disco') return []
  const k = chi.adesso() ?? ''
  if (adesso - (verificate.get(k) ?? -Infinity) < VERIFICA_OGNI) return []
  verificate.set(k, adesso)
  db.prepare('DELETE FROM stato_fonti WHERE fonte = ?').run('note')
  return ['note']
}

/** Solo per le prove: si dimentica quando si è verificato. */
export function perProva() { verificate.clear() }

// — il giro del giorno —

/** Il messaggio di Meta per un token che non vale più: l'unico che si sistema dal pannello. */
const WHATSAPP_TOKEN = 'Il token di WhatsApp non è valido o è scaduto.'
const WHATSAPP_ZITTO = 'Meta non ha risposto.'

/**
 * Una volta al giorno: chiude i giorni, bussa a WhatsApp, e scrive una riga.
 *
 * WhatsApp non si legge mai (i messaggi li spinge Meta): la sua salute la dice
 * una chiamata al giorno, gratis. Ogni passo per conto suo: un passo che si
 * rompe non ferma gli altri, perché un giro fallito consuma comunque il suo
 * turno della giornata.
 */
export async function giornaliero(dip: { prova?: typeof whatsapp.prova; adesso?: () => Date } = {}): Promise<void> {
  const adesso = dip.adesso ?? (() => new Date())
  try { chiudiGiorni(adesso()) }
  catch (e) { console.error('myynd · fonti · i giorni non si sono chiusi:', e instanceof Error ? e.message : e) }
  try {
    const c = cfg.leggi()
    if (fonteCollegata('whatsapp', c) && c.whatsapp) {
      const inizio = Date.now()
      const r = await (dip.prova ?? whatsapp.prova)(c.whatsapp)
      const quando = adesso().getTime()
      const durata = Date.now() - inizio
      if (r.ok) registra({ fonte: 'whatsapp', esito: 'pulita', rimedio: null, frase: null, durata, tolti: 0, inventario: null, sonda: 'ok', quando })
      else {
        const rimedio: Rimedio = r.errore === WHATSAPP_TOKEN ? 'credenziale' : r.errore === WHATSAPP_ZITTO ? 'attendi' : 'guarda'
        registra({ fonte: 'whatsapp', esito: 'guaio', rimedio, frase: r.errore, durata, tolti: 0, inventario: null, sonda: rimedio, quando })
      }
    }
  } catch (e) { console.error('myynd · fonti · WhatsApp non si è lasciato provare:', e instanceof Error ? e.message : e) }
  try { console.log(rigaDelGiorno(spostaGiorno(giornoIn(adesso()), 1), adesso())) }
  catch (e) { console.error('myynd · fonti · la riga del giorno non si è scritta:', e instanceof Error ? e.message : e) }
}

/** I giorni chiusi della finestra del traguardo: i trenta prima di oggi. */
function sintesiDi(oggi: string): Sintesi {
  const da = spostaGiorno(oggi, 30)
  const righe = db.prepare('SELECT * FROM salute_fonti WHERE giorno >= ? AND giorno < ? ORDER BY giorno').all(da, oggi) as Riga[]
  const perGiorno = new Map<string, RigaGiorno[]>()
  for (const r of righe) perGiorno.set(r.giorno, [...(perGiorno.get(r.giorno) ?? []), r])
  return sintesi([...perGiorno].map(([giorno, rr]) => ({ giorno, righe: rr })))
}

/**
 * La riga per chi sviluppa, un giorno alla volta: com'è andata, e il conto.
 *
 *   myynd · fonti · 2026-09-23: pulito · 6 fonti · 28 su 30
 *   myynd · fonti · 2026-09-23: guasto · note (permesso-disco), calendario (credenziale) · 27 su 30
 */
export function rigaDelGiorno(g: string, adesso = new Date()): string {
  const righe = db.prepare('SELECT * FROM salute_fonti WHERE giorno = ? ORDER BY fonte').all(g) as Riga[]
  const s = sintesiDi(giornoIn(adesso))
  const conto = `${s.puliti} su ${s.misurati}`
  const guaste = righe.filter(r => r.verdetto === 'guasto')
  const contano = righe.filter(r => r.verdetto !== 'spento')
  let com: string
  if (guaste.length) com = `guasto · ${guaste.map(r => `${r.fonte} (${r.rimedio ?? 'guarda'})`).join(', ')}`
  else if (righe.some(r => r.verdetto === null)) com = `aperto · ${contano.length} fonti`
  else if (!contano.length) com = 'spento'
  else com = `pulito · ${contano.length} fonti`
  return `myynd · fonti · ${g}: ${com} · ${conto}`
}

/**
 * Quello che dà `GET /api/fonti/salute`: i giorni, dal più vecchio a oggi,
 * la sintesi del traguardo e gli episodi di adesso. Oggi (e un giorno ancora
 * aperto) ha il verdetto provvisorio, e gli arrivi contati dal vivo.
 */
export function perRotta(giorni = 30, fonte?: string, adesso = new Date()): RispostaSalute {
  chiudiGiorni(adesso)
  const quanti = Math.min(90, Math.max(1, Math.floor(giorni) || 30))
  const oggi = giornoIn(adesso)
  const primo = spostaGiorno(oggi, quanti - 1)
  const righe = (fonte
    ? db.prepare('SELECT * FROM salute_fonti WHERE giorno >= ? AND giorno <= ? AND fonte = ? ORDER BY giorno, fonte').all(primo, oggi, fonte)
    : db.prepare('SELECT * FROM salute_fonti WHERE giorno >= ? AND giorno <= ? ORDER BY giorno, fonte').all(primo, oggi)) as Riga[]
  const tutti = episodi()
  const visibili = new Set(tutti.filter(visibile).map(e => e.fonte))
  const arriviOggi = arriviDel(oggi)
  const fuori: GiornoSalute[] = []
  for (let i = quanti - 1; i >= 0; i--) {
    const giorno = spostaGiorno(oggi, i)
    const diOggi = giorno === oggi
    const qui = righe.filter(r => r.giorno === giorno)
    const voci = qui.map(r => {
      const testa = TESTE.has(r.fonte)
      const aperta = r.verdetto === null
      const documenti = diOggi && !testa ? arriviOggi.get(r.fonte) ?? 0 : r.documenti
      return {
        fonte: r.fonte,
        verdetto: aperta ? provvisorio({ ...r, documenti }, { testa, episodioVisibile: visibili.has(r.fonte) }) : r.verdetto as Verdetto,
        provvisorio: aperta,
        rimedio: r.rimedio, letture: r.letture, pulite: r.pulite, incomplete: r.incomplete, guai: r.guai,
        documenti, totale: r.totale, durata: r.durata, versione: r.versione, frase: r.frase
      }
    })
    const misurato = voci.some(v => v.verdetto !== 'spento')
    fuori.push({
      giorno,
      chiuso: !diOggi && voci.every(v => !v.provvisorio),
      misurato,
      pulito: misurato ? voci.every(v => v.verdetto !== 'guasto') : null,
      fonti: voci
    })
  }
  return {
    giorni: fuori,
    sintesi: sintesiDi(oggi),
    adesso: tutti.filter(e => !fonte || e.fonte === fonte).map(e => ({ ...e, visibile: visibile(e) }))
  }
}

/** Solo per le prove: il giorno prima e i giorni fra due date, come li conta questo modulo. */
export const perProvaGiorni = { spostaGiorno, giorniFra, limiti }
