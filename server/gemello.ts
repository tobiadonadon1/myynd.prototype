// Il gemello: il giro che raccoglie, prevede, verifica e conta.
//
// Ogni quarto d'ora, per ogni conto con una fonte collegata:
//   1. si raccolgono i segnali (la posta, e sul Mac il codice);
//   2. si chiudono i giorni passati: un giorno è definitivo quando una lettura
//      partita dopo la sua mezzanotte è finita con la posta a posto (cursore
//      `gemello:letta`), o subito se non c'è una casella; le affermazioni sulla
//      posta ancora sospese a due giorni e mezzo diventano `annullata`;
//   3. una volta al giorno, dalle tre di notte: le righe di «Come lavori», la
//      scala della fiducia, la potatura;
//   4. la mattina, dalle sei: le affermazioni di oggi, sigillate.
//
// Il sigillo lo tiene il server: prima delle venti `vista()` dà solo il
// numero; dalle venti le affermazioni, con l'esito solo per quelle già
// decise. Niente si scrive prima che il giorno sia chiuso.
//
// Il registro della posta cammina a pezzi (segnali.ts): finché è indietro
// rispetto all'indice, nessun giorno si chiude, nessuna mattina afferma
// niente e la notte non conta le righe, perché una risposta non ancora nel
// registro farebbe «sbagliata» una previsione giusta e «resta senza risposta»
// una mail risposta. Una lettura finita mentre il registro è indietro resta
// in attesa (`gemello:letta:attesa`) e vale come letta al primo giro in cui
// il registro è arrivato in fondo.
//
// La conservazione delle osservazioni (i titoli delle finestre restano
// trenta giorni) sta prima di ogni altra condizione: vale anche per un conto
// senza fonti o con l'indice fermo, perché non dipende dalle fonti.
//
// Nessun modello, da nessuna parte: tutto è contato.

import db from './store.ts'
import * as store from './store.ts'
import * as cfg from './config.ts'
import * as chi from './chi.ts'
import * as fuso from './fuso.ts'
import * as ospitato from './ospitato.ts'
import * as segnali from './segnali.ts'
import * as abitudini from './abitudini.ts'
import * as osservatore from './osservatore.ts'
import * as previsioni from './previsioni.ts'
import * as progetti from './progetti.ts'
import * as desktopConn from './connettori/desktop.ts'
import { progettoDelTesto } from './attenzione.ts'
import { esitoCarta } from './feed-esiti.ts'
import { ritocco, classe as classeDi } from './ritocco.ts'
import type { Compito } from './store.ts'

const GIORNO = 86_400_000
export const ORA_SIGILLO = 20
export const ORA_MATTINA = 6
export const ORA_NOTTE = 3
const CURS = { letta: 'gemello:letta', attesa: 'gemello:letta:attesa', notte: 'gemello:notte', mattina: 'gemello:mattina', conserva: 'gemello:conserva' }

export type EsitoPrev = 'giusta' | 'sbagliata' | 'annullata'
export type PrevisioneVista = { id: string; genere: string; nome: string; titolo: string | null; esito: EsitoPrev | null }
export type Gemello = {
  punteggio: { giuste: number; totale: number; base: number } | null
  oggi: { quante: number; sigillate: boolean; previsioni: PrevisioneVista[] }
  ieri: { giorno: string; chiuso: boolean; giuste: number; totale: number; previsioni: PrevisioneVista[] } | null
  fiducia: { genere: string; giuste: number; totale: number }[]
  abitudini: abitudini.AbitudineVista[]
  guai: 'posta-inviata'[]
}
type RigaPrev = { id: string; giorno: string; genere: string; ref: string; probabilita: number; dati: string; fatta: string; esito: EsitoPrev | null; verificata: string | null; prova: string | null }
type Prev = Omit<RigaPrev, 'dati'> & { dati: Record<string, unknown> }

const leggiPrev = (r: RigaPrev): Prev => { let dati: Record<string, unknown> = {}; try { dati = JSON.parse(r.dati) } catch { /* vuoto */ } return { ...r, dati } }
const previsioniDel = (giorno: string): Prev[] =>
  (db.prepare('SELECT * FROM previsioni WHERE giorno = ? ORDER BY probabilita DESC, id').all(giorno) as RigaPrev[]).map(leggiPrev)

// — il tempo, nel fuso di chi usa —

const numeri = (g: string) => g.split('-').map(Number) as [number, number, number]
export const inizioGiorno = (g: string) => { const [a, m, d] = numeri(g); return fuso.istante(a, m, d, 0) }
export const fineGiorno = (g: string) => { const [a, m, d] = numeri(g); return fuso.istante(a, m, d + 1, 0) }
export const giornoPrima = (g: string, n = 1) => fuso.giornoIn(new Date(inizioGiorno(g).getTime() - n * GIORNO + 12 * 3_600_000))

// — le fonti —

function fonteCollegata(): boolean {
  const c = cfg.leggi()
  return !!(c.desktop || c.notion || c.posta || c.google || c.slack || c.drive || c.microsoft || c.dropbox || c.calendario || c.granola || c.note || c.conversazioni || c.github)
}
/** Le caselle collegate, coi nomi delle fasi della lettura: Microsoft conta solo se legge la posta. */
export function casellePostali(c: { posta?: unknown; google?: unknown; microsoft?: { parti?: string[] } | null } = cfg.leggi()): string[] {
  const fuori: string[] = []
  if (c.posta) fuori.push('posta')
  if (c.google) fuori.push('google')
  if (c.microsoft?.parti?.includes('posta')) fuori.push('microsoft')
  return fuori
}
function fontePosta(): boolean { return casellePostali().length > 0 }

/**
 * La posta è «a posto» dopo una lettura solo se ogni casella collegata è
 * arrivata in fondo in quella lettura, nessuna ha avuto un guaio, e nessuno
 * l'ha fermata. Una lettura di una fonte sola (il calendario, Slack), una
 * fermata a metà o una che ha lanciato non l'ha letta: il giorno non chiude.
 */
export function postaLettaBene(o: { fasi: { fase?: string; stato?: string }[]; collegate: string[]; fermata: boolean }): boolean {
  if (o.fermata || !o.collegate.length) return false
  const finite = new Set(o.fasi.filter(x => x.stato === 'fatto' && x.fase).map(x => x.fase))
  if (o.fasi.some(x => x.fase && o.collegate.includes(x.fase) && x.stato === 'guaio')) return false
  return o.collegate.every(f => finite.has(f))
}
function indicizzatoDiRecente(adesso: Date): boolean {
  const r = db.prepare('SELECT MAX(indicizzato) AS m FROM documenti').get() as { m: string | null }
  return !!r.m && Date.parse(r.m) >= adesso.getTime() - 30 * GIORNO
}

// — i minuti di un progetto in un giorno —

/** Sessioni, giorni con un agente, commit suoi, righe chiuse, mail mandate: in minuti, per progetto. */
export function minutiProgetto(giorno: string): Map<string, number> {
  const m = new Map<string, number>()
  const metti = (p: string | null | undefined, min: number) => { if (p && min > 0) m.set(p, (m.get(p) ?? 0) + min) }
  for (const r of db.prepare('SELECT progetto, SUM(secondi) AS s FROM sessioni_app WHERE giorno = ? AND progetto IS NOT NULL GROUP BY progetto').all(giorno) as { progetto: string; s: number }[]) metti(r.progetto, r.s / 60)
  const da = inizioGiorno(giorno).toISOString(), a = fineGiorno(giorno).toISOString()
  const perCartella = new Map<string, number>()
  for (const s of segnali.leggi('codice.sessione', da, a)) {
    const k = `${s.progetto ?? ''}|${s.ref ?? ''}`
    perCartella.set(k, Math.min(120, (perCartella.get(k) ?? 0) + 15))
  }
  for (const [k, min] of perCartella) metti(k.split('|')[0], min)
  const perOra = new Map<string, number>()
  for (const c of segnali.leggi('codice.commit', da, a)) {
    if (c.dati.agente) continue
    const k = `${c.progetto ?? ''}|${c.quando.slice(0, 13)}`
    perOra.set(k, Math.min(60, (perOra.get(k) ?? 0) + 10))
  }
  for (const [k, min] of perOra) metti(k.split('|')[0], min)
  for (const r of db.prepare("SELECT progetto, COUNT(*) AS n FROM compiti WHERE stato = 'fatto' AND chiuso >= ? AND chiuso < ? AND progetto IS NOT NULL AND sparito IS NULL GROUP BY progetto").all(da, a) as { progetto: string; n: number }[]) metti(r.progetto, r.n * 15)
  const inviate = segnali.inviate(da, a)
  if (inviate.length) {
    const arrivate = segnali.arrivate(new Date(inizioGiorno(giorno).getTime() - 30 * GIORNO).toISOString(), a)
    const perId = new Map(arrivate.map(x => [x.id, x]))
    for (const c of segnali.coppieRisposta(arrivate, inviate, segnali.mieiIndirizzi())) metti(perId.get(c.arrivata)?.progetto, 5)
  }
  return m
}

// — le affermazioni del mattino —

function candidatiDiOggi(adesso: Date): previsioni.Candidato[] {
  const oggi = fuso.giornoIn(adesso)
  const fuori: previsioni.Candidato[] = []
  const t0 = adesso.toISOString()
  if (fontePosta() && segnali.coperturaInviata(adesso)) {
    const da = new Date(adesso.getTime() - 97 * GIORNO).toISOString()
    const arrivate = segnali.arrivate(da, t0)
    const inviate = segnali.inviate(da, t0)
    const coppie = segnali.coppieRisposta(arrivate, inviate, segnali.mieiIndirizzi())
    // una mail si afferma una volta sola: una lasciata lì sette giorni non vale sette «non risponde»
    const giaDette = new Set((db.prepare("SELECT ref FROM previsioni WHERE genere LIKE 'posta.%' AND giorno < ?").all(oggi) as { ref: string }[]).map(r => r.ref))
    fuori.push(...previsioni.candidatiPosta(arrivate, coppie, adesso, fineGiorno(oggi)).filter(c => !giaDette.has(c.ref)))
  }
  // il progetto
  const attivita7 = new Map<string, number>()
  for (let i = 1; i <= 7; i++) for (const [p, m] of minutiProgetto(giornoPrima(oggi, i))) attivita7.set(p, (attivita7.get(p) ?? 0) + m)
  const ieri = previsioni.vincitore(minutiProgetto(giornoPrima(oggi)))
  const eventi = new Map<string, number>()
  for (const e of store.eventi(inizioGiorno(oggi).toISOString(), fineGiorno(oggi).toISOString())) {
    const p = progettoDelTesto(e.titolo)
    if (p) eventi.set(p, (eventi.get(p) ?? 0) + 1)
  }
  const aperti = store.elencoCompiti().filter(c => c.giorno === oggi || (!c.giorno && c.quando === 'oggi'))
  const compitiPer = new Map<string, number>()
  for (const c of aperti) if (c.progetto) compitiPer.set(c.progetto, (compitiPer.get(c.progetto) ?? 0) + 1)
  const alta = new Set(progetti.elenco('attivo').filter(p => p.priorita === 'alta').map(p => p.id))
  const prog = previsioni.candidatoProgetto(attivita7, ieri, { eventi, compiti: compitiPer, alta })
  if (prog) fuori.push({ ...prog, dati: { ...prog.dati, nome: progetti.trova(prog.ref)?.nome ?? prog.ref } })
  // i compiti
  const da30 = giornoPrima(oggi, 30)
  const storia = db.prepare('SELECT giorno, stato, chiuso FROM compiti WHERE giorno >= ? AND giorno < ? AND sparito IS NULL').all(da30, oggi) as { giorno: string; stato: string; chiuso: string | null }[]
  const storia30 = { pianificati: storia.length, chiusiInGiornata: storia.filter(c => c.stato === 'fatto' && c.chiuso && fuso.giornoIn(new Date(c.chiuso)) === c.giorno).length }
  fuori.push(...previsioni.candidatiCompiti(aperti.map(c => ({ id: c.id, testo: c.testo, priorita: c.priorita ?? null, stato: c.stato, creato: (c as unknown as { creato: string }).creato ?? t0, progetto: c.progetto ?? null })), storia30, adesso))
  return fuori
}

/**
 * Le affermazioni di oggi, una volta al giorno dalle sei. Col registro della
 * posta indietro si rimanda al giro dopo: una mail già risposta che il registro
 * non ha ancora visto darebbe un «non risponde» facile e falso.
 */
function mattina(adesso: Date, indietro = false): number {
  const oggi = fuso.giornoIn(adesso)
  if (store.cursore(CURS.mattina) === oggi) return 0
  if (fuso.parti(adesso).ora < ORA_MATTINA) return 0
  if (cfg.leggi().gemello?.previsioni === false) { store.segnaCursore(CURS.mattina, oggi); return 0 }
  if (indietro && fontePosta()) return 0
  const candidati = candidatiDiOggi(adesso)
  const { scelte } = previsioni.scegli(candidati)
  const ins = db.prepare('INSERT OR IGNORE INTO previsioni (id, giorno, genere, ref, probabilita, dati, fatta) VALUES (?,?,?,?,?,?,?)')
  let n = 0
  db.exec('BEGIN')
  try {
    // ogni riga porta quante candidate c'erano: un giorno «attivo» (sezione 8) ne ha almeno cinque
    for (const c of scelte) { ins.run(`${oggi}|${c.genere}|${c.ref}`, oggi, c.genere, c.ref, c.p, JSON.stringify({ ...c.dati, candidati: candidati.length }), adesso.toISOString()); n++ }
    store.segnaCursore(CURS.mattina, oggi)
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
  return n
}

// — la verifica: chiudere i giorni passati —

type Decisione = { esito: EsitoPrev; prova: string | null; vero?: string | null }

function decidiPosta(p: Prev, giorno: string, coppie: segnali.Coppia[], quandoInviata: (id: string) => string | null, lettaDopo: boolean): Decisione {
  const c = coppie.find(x => x.arrivata === p.ref)
  const q = c ? quandoInviata(c.inviata) : null
  const t0 = Date.parse(p.fatta), fine = fineGiorno(giorno).getTime()
  // la risposta c'era già quando si è affermato (indicizzata dopo): l'affermazione era su una mail già chiusa, non conta
  if (q && Date.parse(q) < t0) return { esito: 'annullata', prova: c!.inviata }
  const risposta = !!q && Date.parse(q) >= t0 && Date.parse(q) < fine
  if (risposta) return { esito: p.genere === 'posta.risponde' ? 'giusta' : 'sbagliata', prova: c!.inviata }
  if (!lettaDopo) return { esito: 'annullata', prova: null }
  return { esito: p.genere === 'posta.risponde' ? 'sbagliata' : 'giusta', prova: null }
}

function decidiCompito(p: Prev, giorno: string): Decisione {
  const c = db.prepare('SELECT stato, chiuso, sparito FROM compiti WHERE id = ?').get(p.ref) as { stato: string; chiuso: string | null; sparito: string | null } | undefined
  if (!c) return { esito: 'annullata', prova: null }
  if (c.sparito && fuso.giornoIn(new Date(c.sparito)) === giorno) return { esito: 'annullata', prova: null }
  const chiuso = c.stato === 'fatto' && !!c.chiuso && fuso.giornoIn(new Date(c.chiuso)) === giorno
  return { esito: (p.genere === 'compito.chiude') === chiuso ? 'giusta' : 'sbagliata', prova: p.ref }
}

function decidiProgetto(p: Prev, giorno: string): Decisione {
  const vero = previsioni.vincitore(minutiProgetto(giorno))
  if (!vero) return { esito: 'annullata', prova: null, vero: null }
  return { esito: vero === p.ref ? 'giusta' : 'sbagliata', prova: vero, vero }
}

function spintaDi(p: Prev): 'carta' | 'bozza' | null {
  const doc = typeof p.dati.doc === 'string' ? p.dati.doc : null
  if (!doc) return null
  if (db.prepare('SELECT 1 FROM feed WHERE doc = ? LIMIT 1').get(doc)) return 'carta'
  if (db.prepare('SELECT 1 FROM compiti WHERE doc = ? LIMIT 1').get(doc)) return 'bozza'
  return null
}

/**
 * I giorni passati con affermazioni ancora aperte, chiusi quando si può.
 * Col registro della posta indietro (`indietro`) si chiudono solo i giorni
 * scaduti, dove la posta si annulla comunque. Torna i giorni chiusi.
 */
export function chiudiGiorni(adesso = new Date(), o: { indietro?: boolean } = {}): string[] {
  const oggi = fuso.giornoIn(adesso)
  const giorni = (db.prepare('SELECT DISTINCT giorno FROM previsioni WHERE verificata IS NULL AND giorno < ? ORDER BY giorno').all(oggi) as { giorno: string }[]).map(r => r.giorno)
  const letta = store.cursore(CURS.letta)
  const chiusi: string[] = []
  for (const giorno of giorni) {
    const fine = fineGiorno(giorno)
    const lettaDopo = !!letta && Date.parse(letta) >= fine.getTime()
    const scaduto = adesso.getTime() >= fine.getTime() + GIORNO + 12 * 3_600_000
    if (!lettaDopo && fontePosta() && !scaduto) continue
    if (o.indietro && fontePosta() && !scaduto) continue
    // un giorno scaduto col registro indietro: la posta si giudica solo dove la risposta c'è già, il resto si annulla
    const postaAffidabile = (lettaDopo && !o.indietro) || !fontePosta()
    const righe = previsioniDel(giorno).filter(r => !r.verificata)
    const daPosta = new Date(inizioGiorno(giorno).getTime() - 100 * GIORNO).toISOString()
    const arrivate = segnali.arrivate(daPosta, fine.toISOString())
    const inviate = segnali.inviate(daPosta, adesso.toISOString())
    const perInviata = new Map(inviate.map(s => [s.id, s.quando]))
    const coppie = segnali.coppieRisposta(arrivate, inviate, segnali.mieiIndirizzi())
    const quandoInviata = (id: string) => perInviata.get(id) ?? null
    const conta = { giuste: 0, sbagliate: 0, annullate: 0, base: 0 }
    const perBrier: { p: number; giusta: boolean }[] = []
    const upd = db.prepare('UPDATE previsioni SET esito = ?, prova = ?, verificata = ?, dati = ? WHERE id = ?')
    db.exec('BEGIN')
    try {
      for (const p of righe) {
        const d = p.genere.startsWith('posta.') ? decidiPosta(p, giorno, coppie, quandoInviata, postaAffidabile)
          : p.genere.startsWith('compito.') ? decidiCompito(p, giorno) : decidiProgetto(p, giorno)
        let base: boolean | null = null
        if (d.esito === 'annullata') conta.annullate++
        else {
          conta[d.esito === 'giusta' ? 'giuste' : 'sbagliate']++
          base = previsioni.base({ genere: p.genere, ref: p.ref, dati: p.dati as { ieri?: string | null } }, { esito: d.esito, vero: d.vero })
          if (base) conta.base++
          perBrier.push({ p: p.probabilita, giusta: d.esito === 'giusta' })
        }
        upd.run(d.esito, d.prova, adesso.toISOString(), JSON.stringify({ ...p.dati, spinta: spintaDi(p), base, vero: d.vero ?? null }), p.id)
      }
      db.prepare(`INSERT INTO punteggi (giorno, giuste, sbagliate, annullate, brier, base, calcolato) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(giorno) DO UPDATE SET giuste = excluded.giuste, sbagliate = excluded.sbagliate, annullate = excluded.annullate,
        brier = excluded.brier, base = excluded.base, calcolato = excluded.calcolato`)
        .run(giorno, conta.giuste, conta.sbagliate, conta.annullate, perBrier.length ? previsioni.brier(perBrier) : null, conta.base, adesso.toISOString())
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
    chiusi.push(giorno)
    const b = perBrier.length ? previsioni.brier(perBrier).toFixed(2) : '-'
    console.log(`myynd · gemello · ${giorno} · giuste ${conta.giuste} su ${conta.giuste + conta.sbagliate} · senza conoscerti ${conta.base} · brier ${b}`)
  }
  return chiusi
}

// — la notte —

function ricalcolaFiducia(adesso: Date): void {
  const da = new Date(adesso.getTime() - 90 * GIORNO).toISOString()
  const daGiorno = fuso.giornoIn(new Date(adesso.getTime() - 90 * GIORNO))
  const conti = new Map<string, { giuste: number; sbagliate: number }>()
  const segna = (genere: string, giusta: boolean) => {
    const c = conti.get(genere) ?? { giuste: 0, sbagliate: 0 }
    c[giusta ? 'giuste' : 'sbagliate']++; conti.set(genere, c)
  }
  for (const g of ['previsione.posta', 'previsione.progetto', 'previsione.compito', 'bozza.email', 'bozza.documento', 'feed.carta']) conti.set(g, { giuste: 0, sbagliate: 0 })
  for (const r of db.prepare("SELECT genere, esito FROM previsioni WHERE giorno >= ? AND esito IN ('giusta','sbagliata')").all(daGiorno) as { genere: string; esito: string }[]) {
    segna(`previsione.${r.genere.split('.')[0] === 'compito' ? 'compito' : r.genere.split('.')[0]}`, r.esito === 'giusta')
  }
  for (const r of db.prepare('SELECT classe FROM misure_compiti WHERE classe IS NOT NULL AND inviato >= ?').all(da) as { classe: string }[]) {
    segna('bozza.email', r.classe === 'identico' || r.classe === 'ritocco')
  }
  for (const s of segnali.leggi('myynd.bozza', da, adesso.toISOString())) {
    segna('bozza.documento', s.dati.classe === 'identico' || s.dati.classe === 'ritocco')
  }
  // una carta sulla mail a cui ha poi risposto dalla posta: `risposta` dice se dopo la carta o prima
  const daPosta = new Date(adesso.getTime() - 100 * GIORNO).toISOString()
  const arrivate = segnali.arrivate(daPosta, adesso.toISOString())
  const inviate = segnali.inviate(da, adesso.toISOString())
  const perArrivata = new Map(arrivate.map(a => [a.id, a.ref]))
  const perInviata = new Map(inviate.map(s => [s.id, s.quando]))
  const rispostaPerDoc = new Map<string, string>()
  for (const c of segnali.coppieRisposta(arrivate, inviate, segnali.mieiIndirizzi())) {
    const doc = perArrivata.get(c.arrivata), q = perInviata.get(c.inviata)
    if (doc && q) rispostaPerDoc.set(doc, q)
  }
  const carte = db.prepare(`SELECT stato, ragione, motivo, vista, doc, quando FROM feed
    WHERE (stato IN ('fatto','scartato','scaduto') AND COALESCE(risposto, quando) >= ?) OR (stato = 'aperto' AND quando >= ?)`)
    .all(da, da) as { stato: string; ragione: string | null; motivo: string | null; vista: string | null; doc: string | null; quando: string }[]
  for (const r of carte) {
    const q = r.doc ? rispostaPerDoc.get(r.doc) : undefined
    const risposta = q ? (q >= r.quando ? 'dopo' : 'prima') : null
    const e = esitoCarta({ stato: r.stato, ragione: r.ragione, motivo: r.motivo, vista: r.vista, risposta })
    if (e !== 'neutra') segna('feed.carta', e === 'giusta')
  }
  const up = db.prepare(`INSERT INTO fiducia (genere, giuste, sbagliate, aggiornato) VALUES (?,?,?,?)
    ON CONFLICT(genere) DO UPDATE SET giuste = excluded.giuste, sbagliate = excluded.sbagliate, aggiornato = excluded.aggiornato`)
  for (const [g, c] of conti) up.run(g, c.giuste, c.sbagliate, adesso.toISOString())
}

/**
 * Le cartelle di lavoro nelle due cache (i commit e la cartella nel titolo).
 * Le riempie la notte; e il primo giro dopo un avvio, perché stanno in
 * memoria e l'app si riavvia spesso: senza, fino alle tre della notte dopo
 * non si vedrebbe un commit e nessuna sessione avrebbe la sua cartella.
 */
async function aggiornaCartelle(): Promise<void> {
  if (ospitato.OSPITATO) return
  const desk = cfg.leggi().desktop
  if (!desk) return
  try {
    const cartelle = (await desktopConn.cartelleDiLavoro(desktopConn.radici(desk))).map(c => c.percorso)
    segnali.impostaCartelleDiLavoro(cartelle)
    osservatore.impostaCartelleNote(cartelle)
  } catch { /* senza cartelle: niente commit e niente cartella nel titolo */ }
}

async function notte(adesso: Date): Promise<boolean> {
  const oggi = fuso.giornoIn(adesso)
  if (store.cursore(CURS.notte) === oggi || fuso.parti(adesso).ora < ORA_NOTTE) return false
  await aggiornaCartelle()
  abitudini.ricalcola(adesso)
  ricalcolaFiducia(adesso)
  segnali.pota(adesso)
  db.prepare('DELETE FROM previsioni WHERE giorno < ?').run(fuso.giornoIn(new Date(adesso.getTime() - 400 * GIORNO)))
  if (osservatore.proprietario() === chi.adesso()) {
    const n = (db.prepare('SELECT COUNT(*) AS n FROM sessioni_app WHERE giorno = ?').get(giornoPrima(oggi)) as { n: number }).n
    console.log(`myynd · osservatore · ${n} sessioni ieri`)
  }
  const m = misura(30, adesso)
  if (m.affermazioni) console.log(`myynd · gemello · ${rigaMisura(m)}`)
  store.segnaCursore(CURS.notte, oggi)
  return true
}

/**
 * La conservazione delle osservazioni, una volta al giorno locale, per ogni
 * conto: dopo trenta giorni le sessioni perdono il titolo, dopo quattrocento
 * se ne vanno. Non aspetta né una fonte né il registro della posta: la
 * promessa sui titoli vale da sola.
 */
function conservaOsservazioni(adesso: Date): boolean {
  const oggi = fuso.giornoIn(adesso)
  if (store.cursore(CURS.conserva) === oggi) return false
  osservatore.conserva(adesso)
  store.segnaCursore(CURS.conserva, oggi)
  return true
}

// — il giro —

const inCorso = new Set<string>()

/** Il registro della posta non è in pari con l'indice: si aspetta il giro dopo prima di giudicare o affermare. */
function registroIndietro(raccolta: { finito: boolean }): boolean {
  return !raccolta.finito || segnali.ripassoInCorso()
}

/** Una lettura finita mentre il registro era indietro vale come letta appena il registro è in pari. */
function promuoviLetturaInAttesa(): void {
  const attesa = store.cursore(CURS.attesa)
  if (!attesa) return
  const prima = store.cursore(CURS.letta)
  if (!prima || prima < attesa) store.segnaCursore(CURS.letta, attesa)
  store.segnaCursore(CURS.attesa, null)
}

export async function giro(adesso = new Date()): Promise<void> {
  const me = chi.adesso() ?? ''
  if (inCorso.has(me)) return
  inCorso.add(me)
  const partenza = Date.now()
  try {
    conservaOsservazioni(adesso)
    if (!fonteCollegata() || !indicizzatoDiRecente(adesso)) return
    const raccolta = segnali.raccogliPosta(adesso)
    const indietro = registroIndietro(raccolta)
    if (!indietro) promuoviLetturaInAttesa()
    // dopo un avvio la cache delle cartelle è vuota, qualunque cosa dica il cursore della notte
    if (!segnali.cartelleImpostate()) await aggiornaCartelle()
    await segnali.raccogliCodice(adesso)
    chiudiGiorni(adesso, { indietro })
    // la notte aspetta il registro in pari: righe e fiducia contate su metà posta sarebbero false, e in vigore
    if (!indietro) await notte(adesso)
    mattina(adesso, indietro)
  } finally {
    inCorso.delete(me)
    const durata = Date.now() - partenza
    if (durata > 1000) console.warn(`myynd · gemello · giro lento: ${durata} ms`)
  }
}

// — i ganci —

/**
 * Alla fine di ogni lettura: la posta nel registro, e il segno che il giorno
 * si può chiudere. Se il registro non è arrivato in fondo, il segno aspetta
 * il giro che lo porta in pari (`gemello:letta:attesa`).
 */
export function dopoLaLettura(partita: string, postaOk: boolean): void {
  const raccolta = segnali.raccogliPosta()
  if (!postaOk) return
  const chiave = registroIndietro(raccolta) ? CURS.attesa : CURS.letta
  const prima = store.cursore(chiave)
  if (!prima || prima < partita) store.segnaCursore(chiave, partita)
}

/** Dopo una lettura intera dell'agenda: i cambi nel registro. */
export function agendaLetta(e: { viste: segnali.VistaAgenda[]; finestra: { da: string; a: string }; troncato: boolean }): void {
  if (e.troncato || !e.viste) return
  segnali.raccogliAgenda(e.viste, e.finestra)
}

/**
 * Da «Va bene» su una riga si conta solo una bozza di documento vera: senza
 * una consegna (un file consegnato manda la riga per lei, non il documento,
 * e /documento lo ha già contato col testo tenuto davvero) e senza una mail
 * pronta (quella la misura P3 in `misure_compiti`, come «bozza.email»).
 */
export function contaComeDocumento(c: Pick<Compito, 'risultato' | 'consegna' | 'email'>): boolean {
  return !!c.risultato && !c.consegna && !c.email
}

/** Prima che la sua versione sovrascriva la bozza: quanto l'ha ritoccata. */
export function bozzaTenuta(c: Pick<Compito, 'id' | 'risultato'>, tenuto: string, adesso = new Date()): void {
  if (!c.risultato) return
  const r = ritocco(c.risultato, tenuto)
  segnali.scrivi({ id: `myynd.bozza|${c.id}|${adesso.toISOString()}`, genere: 'myynd.bozza', quando: adesso.toISOString(), ref: c.id, valore: r, dati: { classe: classeDi(r), tipo: 'documento' } })
}

// — la vista —

function vistaDi(p: Prev, esito: EsitoPrev | null): PrevisioneVista {
  const nome = p.genere.startsWith('progetto.') ? (progetti.trova(p.ref)?.nome ?? String(p.dati.nome ?? p.ref))
    : p.genere.startsWith('compito.') ? String(p.dati.testo ?? '') : String(p.dati.nome ?? p.dati.chi ?? '')
  const titolo = p.genere.startsWith('posta.') && typeof p.dati.titolo === 'string' ? p.dati.titolo : null
  return { id: p.id, genere: p.genere, nome, titolo, esito }
}

/** L'esito di un'affermazione di oggi, solo se è già decisa: una risposta vista, una riga chiusa. */
function esitoParziale(p: Prev, coppie: segnali.Coppia[] | null, quandoInviata: (id: string) => string | null): EsitoPrev | null {
  if (p.genere.startsWith('posta.')) {
    const c = coppie?.find(x => x.arrivata === p.ref)
    const q = c ? quandoInviata(c.inviata) : null
    if (!q) return null
    // risposta prima dell'affermazione (indicizzata dopo): la mail era già chiusa, non conta
    if (Date.parse(q) < Date.parse(p.fatta)) return 'annullata'
    return p.genere === 'posta.risponde' ? 'giusta' : 'sbagliata'
  }
  if (p.genere.startsWith('compito.')) {
    const c = db.prepare('SELECT stato, chiuso FROM compiti WHERE id = ?').get(p.ref) as { stato: string; chiuso: string | null } | undefined
    if (!c || c.stato !== 'fatto' || !c.chiuso || fuso.giornoIn(new Date(c.chiuso)) !== p.giorno) return null
    return p.genere === 'compito.chiude' ? 'giusta' : 'sbagliata'
  }
  return null
}

export function vista(adesso = new Date()): Gemello {
  const oggi = fuso.giornoIn(adesso)
  const ieri = giornoPrima(oggi)
  const da30 = giornoPrima(oggi, 30)
  const verificate = (db.prepare("SELECT * FROM previsioni WHERE giorno >= ? AND giorno < ? AND esito IN ('giusta','sbagliata')").all(da30, oggi) as RigaPrev[]).map(leggiPrev)
  const punteggio = verificate.length
    ? { giuste: verificate.filter(p => p.esito === 'giusta').length, totale: verificate.length, base: verificate.filter(p => p.dati.base === true).length }
    : null
  const diOggi = previsioniDel(oggi)
  const sigillate = fuso.parti(adesso).ora < ORA_SIGILLO
  let previsioniOggi: PrevisioneVista[] = []
  if (!sigillate && diOggi.length) {
    let coppie: segnali.Coppia[] | null = null
    let perInviata = new Map<string, string>()
    if (diOggi.some(p => p.genere.startsWith('posta.'))) {
      const da = new Date(adesso.getTime() - 100 * GIORNO).toISOString()
      const arrivate = segnali.arrivate(da, adesso.toISOString())
      const inviate = segnali.inviate(da, adesso.toISOString())
      perInviata = new Map(inviate.map(s => [s.id, s.quando]))
      coppie = segnali.coppieRisposta(arrivate, inviate, segnali.mieiIndirizzi())
    }
    previsioniOggi = diOggi.map(p => vistaDi(p, p.esito ?? esitoParziale(p, coppie, id => perInviata.get(id) ?? null)))
  }
  const diIeri = previsioniDel(ieri)
  const chiusoIeri = !!db.prepare('SELECT 1 FROM punteggi WHERE giorno = ?').get(ieri)
  const vistaIeri = diIeri.length ? {
    giorno: ieri, chiuso: chiusoIeri,
    giuste: diIeri.filter(p => p.esito === 'giusta').length,
    totale: diIeri.filter(p => p.esito === 'giusta' || p.esito === 'sbagliata').length,
    previsioni: diIeri.map(p => vistaDi(p, chiusoIeri ? p.esito : null))
  } : null
  const fiducia = (db.prepare('SELECT genere, giuste, sbagliate FROM fiducia').all() as { genere: string; giuste: number; sbagliate: number }[])
    .filter(r => r.giuste + r.sbagliate >= 10).map(r => ({ genere: r.genere, giuste: r.giuste, totale: r.giuste + r.sbagliate }))
  // «non vedo la posta che mandi» solo a registro in pari: mentre il primo ripasso cammina, la cartella Sent può non essere ancora arrivata
  const guai: 'posta-inviata'[] = fontePosta() && !segnali.postaDaRipassare() && !segnali.coperturaInviata(adesso) ? ['posta-inviata'] : []
  return { punteggio, oggi: { quante: diOggi.length, sigillate, previsioni: previsioniOggi }, ieri: vistaIeri, fiducia, abitudini: abitudini.tutte(), guai }
}

/** Per il resoconto (P9): giuste, sbagliate, base e giorni fra due date comprese. */
export function punteggio(o: { dal: string; al: string }): { giuste: number; sbagliate: number; base: number; giorni: number } | null {
  const righe = (db.prepare("SELECT * FROM previsioni WHERE giorno >= ? AND giorno <= ? AND esito IN ('giusta','sbagliata')").all(o.dal, o.al) as RigaPrev[]).map(leggiPrev)
  if (!righe.length) return null
  return { giuste: righe.filter(p => p.esito === 'giusta').length, sbagliate: righe.filter(p => p.esito === 'sbagliata').length, base: righe.filter(p => p.dati.base === true).length, giorni: new Set(righe.map(p => p.giorno)).size }
}

// — le misure —

export type Misura = {
  giorni: number; affermazioni: number; giuste: number; sbagliate: number; annullate: number
  punteggio: number | null; base: number | null; lift: number | null; brier: number | null
  /** I giorni attivi: almeno cinque candidate quella mattina (`dati.candidati`); una riga senza il numero conta solo con cinque affermazioni. */
  giorniAttivi: number; perGiorno: number | null; quotaGiorniConCinque: number | null
  calibrazione: { da: number; a: number; n: number; giuste: number }[]
  perGenere: Record<string, { n: number; giuste: number; base: number }>
  spinta: { con: { n: number; giuste: number }; senza: { n: number; giuste: number } }
  /** I giorni chiusi, uno per riga di `punteggi`: il Brier per giorno sta qui. */
  giorniChiusi: { giorno: string; giuste: number; sbagliate: number; annullate: number; base: number; brier: number | null }[]
}

/** La riga di registro delle misure: punteggio, base, copertura, Brier. */
export function rigaMisura(m: Misura): string {
  const pc = (x: number | null) => (x === null ? '-' : `${Math.round(x * 100)}%`)
  return `${m.giorni} giorni · ${m.affermazioni} affermazioni · giuste ${pc(m.punteggio)} · senza conoscerti ${pc(m.base)} · ` +
    `${m.giorniAttivi} giorni attivi, ${m.perGiorno === null ? '-' : m.perGiorno.toFixed(1)} al giorno, ${pc(m.quotaGiorniConCinque)} con cinque · brier ${m.brier === null ? '-' : m.brier.toFixed(2)}`
}

export function misura(giorni: number, adesso = new Date()): Misura {
  const oggi = fuso.giornoIn(adesso)
  const da = giornoPrima(oggi, giorni)
  const righe = (db.prepare('SELECT * FROM previsioni WHERE giorno >= ? AND giorno < ? AND verificata IS NOT NULL').all(da, oggi) as RigaPrev[]).map(leggiPrev)
  const decise = righe.filter(p => p.esito === 'giusta' || p.esito === 'sbagliata')
  const giuste = decise.filter(p => p.esito === 'giusta').length
  const base = decise.filter(p => p.dati.base === true).length
  const perGiornoMap = new Map<string, { n: number; candidati: number }>()
  for (const p of righe) {
    const g = perGiornoMap.get(p.giorno) ?? { n: 0, candidati: 0 }
    g.n++; g.candidati = Math.max(g.candidati, typeof p.dati.candidati === 'number' ? p.dati.candidati : 0)
    perGiornoMap.set(p.giorno, g)
  }
  const attivi = [...perGiornoMap.values()].filter(g => Math.max(g.candidati, g.n) >= 5).map(g => g.n)
  const giorniChiusi = (db.prepare('SELECT giorno, giuste, sbagliate, annullate, base, brier FROM punteggi WHERE giorno >= ? AND giorno < ? ORDER BY giorno').all(da, oggi) as Misura['giorniChiusi'])
  const calibrazione = [0, 0.2, 0.4, 0.6, 0.8].map(x => {
    const dentro = decise.filter(p => p.probabilita >= x && (x === 0.8 ? true : p.probabilita < x + 0.2))
    return { da: x, a: x + 0.2, n: dentro.length, giuste: dentro.filter(p => p.esito === 'giusta').length }
  })
  const perGenere: Misura['perGenere'] = {}
  for (const p of decise) {
    const g = perGenere[p.genere] ?? (perGenere[p.genere] = { n: 0, giuste: 0, base: 0 })
    g.n++; if (p.esito === 'giusta') g.giuste++; if (p.dati.base === true) g.base++
  }
  const con = decise.filter(p => p.dati.spinta), senza = decise.filter(p => !p.dati.spinta)
  return {
    giorni, affermazioni: righe.length, giuste, sbagliate: decise.length - giuste, annullate: righe.length - decise.length,
    punteggio: decise.length ? giuste / decise.length : null, base: decise.length ? base / decise.length : null,
    lift: decise.length ? (giuste - base) / decise.length : null,
    brier: decise.length ? previsioni.brier(decise.map(p => ({ p: p.probabilita, giusta: p.esito === 'giusta' }))) : null,
    giorniAttivi: attivi.length, perGiorno: attivi.length ? attivi.reduce((s, n) => s + n, 0) / attivi.length : null,
    quotaGiorniConCinque: attivi.length ? attivi.filter(n => n >= 5).length / attivi.length : null,
    calibrazione, perGenere,
    spinta: { con: { n: con.length, giuste: con.filter(p => p.esito === 'giusta').length }, senza: { n: senza.length, giuste: senza.filter(p => p.esito === 'giusta').length } },
    giorniChiusi
  }
}

export const perProva = { mattina, notte, ricalcolaFiducia, candidatiDiOggi, CURS, inCorso, registroIndietro }
