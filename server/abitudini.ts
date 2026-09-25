// «Come lavori»: le righe contate, non dedotte.
//
// Ogni riga è una frase che il codice può dimostrare con dei numeri: «a Nora
// rispondi sempre, di solito entro tre ore» sono quindici mail e quattordici
// risposte, con la mediana dei tempi. Nessun modello le scrive, nessun modello
// le legge finché non valgono: una riga vale (`inVigore`) quando lui l'ha
// tenuta o corretta, oppure quando i casi sono almeno venti e il genere lo
// permette. Le righe sulle app no: quelle nascono da un sensore, e aspettano
// un tocco.
//
// Gli stati: `osservata` (appena nata), `tenuta` (ha premuto Tienila),
// `corretta` (ha scritto la sua frase in `testoSuo`; i numeri si aggiornano,
// la frase resta sua), `tolta` (via, e non torna mai: `ricalcola` salta la
// chiave), `superata` (non regge più; si vede novanta giorni sotto «Non
// valgono più», poi sparisce). Se una superata torna a reggere, torna
// osservata.
//
// `perIlRitratto()` è l'unica cosa che arriva a un modello: le righe in
// vigore, in italiano, in terza persona, con i numeri negli stessi secchi
// dell'interfaccia (così il testo cambia solo quando cambia un secchio e la
// cache del prompt regge), e mai un titolo, un percorso o un indirizzo.

import { basename } from 'node:path'
import db from './store.ts'
import * as chi from './chi.ts'
import * as fuso from './fuso.ts'
import * as segnali from './segnali.ts'
import { senzaTrattini } from './testo.ts'

const GIORNO = 86_400_000
/** Da qui in su una riga osservata vale da sola (tranne le app). */
export const CASI_DA_SOLA = 20
/** Un giorno attivo: almeno trenta minuti di sessioni. */
export const MINUTI_GIORNO_ATTIVO = 30
/** Quanto resta una riga superata prima di sparire. */
export const GIORNI_SUPERATA = 90
/** Entro quanto si può annullare un «togli». */
export const MINUTI_ANNULLA = 10

export type Stato = 'osservata' | 'tenuta' | 'corretta' | 'tolta' | 'superata'
export type Esempio = { quando: string; testo: string; doc: string | null }
export type Prova = { casi: number; su: number | null; esempi: Esempio[] }
export type Abitudine = {
  chiave: string; genere: string; dati: Record<string, string | number>; prova: Prova; fiducia: number
  stato: Stato; testoSuo: string | null; visto: string; aggiornato: string; tolta: string | null
}
export type AbitudineVista = {
  chiave: string; genere: string; dati: Record<string, string | number>; testoSuo: string | null; casi: number; su: number | null
  stato: 'osservata' | 'tenuta' | 'corretta' | 'superata'; inVigore: boolean; fino: string | null; esempi: Esempio[]
}
type Candidata = { chiave: string; genere: string; dati: Record<string, string | number>; prova: Prova; fiducia: number }

/** I generi che valgono da soli a venti casi. Le app no: sono un sensore. */
const DA_SOLA = new Set(['posta.risponde_sempre', 'posta.lascia', 'posta.tempo', 'posta.ore', 'agenda.sposta', 'agenda.rifiuta', 'codice.con_agenti'])

const genereDi = (chiave: string) => chiave.split(':')[0]!

/** La riga conta nel ragionamento di Myynd. */
export function inVigore(a: Pick<Abitudine, 'genere' | 'stato' | 'prova'>): boolean {
  if (a.stato === 'tenuta' || a.stato === 'corretta') return true
  if (a.stato !== 'osservata') return false
  return DA_SOLA.has(a.genere) && (a.prova.su ?? a.prova.casi) >= CASI_DA_SOLA
}

const mediana = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = xs.slice().sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

// — i conti —

type Arr = segnali.SegnaleArrivata
type Inv = segnali.SegnaleInviata

function righePosta(adesso: Date): Candidata[] {
  const fuori: Candidata[] = []
  const da90 = new Date(adesso.getTime() - 90 * GIORNO).toISOString()
  const da30 = new Date(adesso.getTime() - 30 * GIORNO).toISOString()
  const ora = adesso.toISOString()
  const miei = segnali.mieiIndirizzi()
  const arrivate = segnali.arrivate(da90, ora)
  const inviate = segnali.inviate(da90, ora)
  if (!inviate.length) return fuori
  const coppie = segnali.coppieRisposta(arrivate, inviate, miei)
  const risposta = new Map<string, Inv & { latenza: number }>()
  const perId = new Map(inviate.map(s => [s.id, s]))
  for (const c of coppie) { const s = perId.get(c.inviata); if (s) risposta.set(c.arrivata, { ...s, latenza: c.latenza }) }
  // la copertura: da quando c'è posta mandata (con una settimana di margine, perché la
  // prima mandata risponde a una arrivata prima), le mail arrivate si possono giudicare
  const primaInviata = inviate.reduce((m, s) => (s.quando < m ? s.quando : m), ora)
  const copertura = new Date(Date.parse(primaInviata) - 7 * GIORNO).toISOString()
  const giudicabili = new Date(adesso.getTime() - GIORNO).toISOString()

  // per mittente
  const perMittente = new Map<string, Arr[]>()
  for (const a of arrivate) {
    if (a.quando < copertura || a.quando > giudicabili) continue
    const l = perMittente.get(a.chi) ?? []; l.push(a); perMittente.set(a.chi, l)
  }
  for (const [addr, mail] of perMittente) {
    const risposte = mail.filter(m => risposta.has(m.id))
    const rate = risposte.length / mail.length
    const nome = segnali.nomeMostrabile(mail[mail.length - 1]!.dati.nome, addr)
    const esempi = (xs: Arr[]) => xs.slice(-5).reverse().map(m => ({ quando: m.quando, testo: m.dati.titolo, doc: m.ref }))
    if (mail.length >= 5 && rate >= 0.85) {
      const latenzaMin = Math.round(mediana(risposte.map(m => risposta.get(m.id)!.latenza)) / 60)
      fuori.push({ chiave: `posta.risponde_sempre:${addr}`, genere: 'posta.risponde_sempre', dati: { nome, latenzaMin }, prova: { casi: risposte.length, su: mail.length, esempi: esempi(risposte) }, fiducia: rate })
    } else if (mail.length >= 6 && rate <= 0.1) {
      const lasciate = mail.filter(m => !risposta.has(m.id))
      fuori.push({ chiave: `posta.lascia:${addr}`, genere: 'posta.lascia', dati: { nome }, prova: { casi: lasciate.length, su: mail.length, esempi: esempi(lasciate) }, fiducia: 1 - rate })
    }
  }

  // i tempi e le ore, sugli ultimi trenta giorni di risposte
  const recenti = [...risposta.entries()].filter(([, s]) => s.quando >= da30)
  if (recenti.length >= 10) {
    const latenzaMin = Math.round(mediana(recenti.map(([, s]) => s.latenza)) / 60)
    const esempi = recenti.slice(-5).reverse().map(([id, s]) => ({ quando: s.quando, testo: arrivate.find(a => a.id === id)?.dati.titolo ?? '', doc: s.ref }))
    fuori.push({ chiave: 'posta.tempo', genere: 'posta.tempo', dati: { latenzaMin }, prova: { casi: recenti.length, su: null, esempi }, fiducia: 1 })
    const ore = recenti.map(([, s]) => fuso.parti(new Date(s.quando)).ora)
    let meglio = { da: 0, n: 0 }
    for (let h = 0; h < 24; h++) {
      const n = ore.filter(o => (o - h + 24) % 24 < 3).length
      if (n > meglio.n) meglio = { da: h, n }
    }
    if (meglio.n / recenti.length >= 0.35) {
      fuori.push({ chiave: 'posta.ore', genere: 'posta.ore', dati: { da: meglio.da, a: (meglio.da + 3) % 24 }, prova: { casi: meglio.n, su: recenti.length, esempi: [] }, fiducia: meglio.n / recenti.length })
    }
  }
  return fuori
}

type Vista = { uid: string; titolo: string | null; inizio: string | null; originale: string | null; mio: string | null; organizzatore: string | null }

function righeAgenda(adesso: Date): Candidata[] {
  const fuori: Candidata[] = []
  const da30 = new Date(adesso.getTime() - 30 * GIORNO).toISOString()
  const da90 = new Date(adesso.getTime() - 90 * GIORNO).toISOString()
  const ora = adesso.toISOString()
  const viste = db.prepare('SELECT uid, titolo, inizio, originale, mio, organizzatore FROM agenda_viste').all() as Vista[]
  const occorrenze = viste.filter(v => v.originale && v.originale >= da30 && v.originale <= ora)
  const spostate = segnali.leggi('agenda.spostato', da30, ora)
  const spostateRef = new Set(spostate.map(s => s.ref))
  if (occorrenze.length >= 10) {
    const quota = spostateRef.size / occorrenze.length
    if (quota >= 0.1) {
      fuori.push({ chiave: 'agenda.sposta', genere: 'agenda.sposta', dati: { ogni: Math.max(1, Math.round(1 / quota)) },
        prova: { casi: spostateRef.size, su: occorrenze.length, esempi: spostate.slice(-5).reverse().map(s => ({ quando: s.quando, testo: String(s.dati.titolo ?? ''), doc: null })) }, fiducia: quota })
    }
  }
  const perOrganizzatore = new Map<string, { nome: string; inviti: Vista[] }>()
  for (const v of viste) {
    const o = segnali.organizzatoreDi(v.organizzatore)
    if (!o || !v.originale || v.originale < da90) continue
    const l = perOrganizzatore.get(o.indirizzo) ?? { nome: o.nome, inviti: [] }
    l.inviti.push(v); l.nome = o.nome; perOrganizzatore.set(o.indirizzo, l)
  }
  for (const [addr, { nome, inviti }] of perOrganizzatore) {
    const rifiutati = inviti.filter(v => v.mio === 'DECLINED')
    if (inviti.length >= 4 && rifiutati.length / inviti.length >= 0.75) {
      fuori.push({ chiave: `agenda.rifiuta:${addr}`, genere: 'agenda.rifiuta', dati: { nome },
        prova: { casi: rifiutati.length, su: inviti.length, esempi: rifiutati.slice(-5).map(v => ({ quando: v.inizio ?? '', testo: v.titolo ?? '', doc: null })) }, fiducia: rifiutati.length / inviti.length })
    }
  }
  return fuori
}

function righeLavoro(adesso: Date): Candidata[] {
  const fuori: Candidata[] = []
  const da14 = fuso.giornoIn(new Date(adesso.getTime() - 14 * GIORNO))
  const oggi = fuso.giornoIn(adesso)
  const righe = db.prepare('SELECT giorno, app, inizio, fine, secondi, cartella FROM sessioni_app WHERE giorno >= ? AND giorno < ?').all(da14, oggi) as
    { giorno: string; app: string; inizio: string; fine: string; secondi: number; cartella: string | null }[]
  const perGiorno = new Map<string, typeof righe>()
  for (const r of righe) { const l = perGiorno.get(r.giorno) ?? []; l.push(r); perGiorno.set(r.giorno, l) }
  const attivi = [...perGiorno.entries()].filter(([, l]) => l.reduce((s, r) => s + r.secondi, 0) >= MINUTI_GIORNO_ATTIVO * 60)
  const giorniAttivi = new Set(attivi.map(([g]) => g))
  if (attivi.length >= 5) {
    const perApp = new Map<string, number>()
    for (const [, l] of attivi) for (const r of l) perApp.set(r.app, (perApp.get(r.app) ?? 0) + r.secondi)
    const [app] = [...perApp.entries()].sort((a, b) => b[1] - a[1])[0]!
    const oreGiorno = Math.round(mediana(attivi.map(([, l]) => l.filter(r => r.app === app).reduce((s, r) => s + r.secondi, 0) / 3600)) * 10) / 10
    fuori.push({ chiave: 'app.principale', genere: 'app.principale', dati: { app, oreGiorno }, prova: { casi: attivi.length, su: null, esempi: [] }, fiducia: 1 })
    const minuto = (iso: string) => { const p = fuso.parti(new Date(iso)); return p.ora * 60 + p.minuti }
    const da = Math.round(mediana(attivi.map(([, l]) => Math.min(...l.map(r => minuto(r.inizio))))))
    const a = Math.round(mediana(attivi.map(([, l]) => Math.max(...l.map(r => minuto(r.fine))))))
    fuori.push({ chiave: 'app.giornata', genere: 'app.giornata', dati: { da, a }, prova: { casi: attivi.length, su: null, esempi: [] }, fiducia: 1 })
  }
  // le cartelle con un agente: i giorni con una sessione, sui giorni attivi
  const sessioniCodice = segnali.leggi('codice.sessione', new Date(adesso.getTime() - 14 * GIORNO).toISOString(), adesso.toISOString())
  const commit = segnali.leggi('codice.commit', new Date(adesso.getTime() - 14 * GIORNO).toISOString(), adesso.toISOString())
  for (const s of [...sessioniCodice, ...commit]) if (s.giorno && s.giorno < oggi) giorniAttivi.add(s.giorno)
  const perCartella = new Map<string, Map<string, string>>()
  for (const s of sessioniCodice) {
    if (!s.ref || !s.giorno || s.giorno >= oggi) continue
    const c = basename(s.ref)
    const m = perCartella.get(c) ?? new Map<string, string>()
    m.set(s.giorno, s.chi ?? 'Claude Code'); perCartella.set(c, m)
  }
  for (const [cartella, giorni] of perCartella) {
    if (giorni.size >= 5 && giorniAttivi.size && giorni.size / giorniAttivi.size >= 0.6) {
      const agenti = [...giorni.values()]
      const agente = agenti.sort((x, y) => agenti.filter(v => v === y).length - agenti.filter(v => v === x).length)[0]!
      fuori.push({ chiave: `codice.con_agenti:${cartella}`, genere: 'codice.con_agenti', dati: { cartella, agente },
        prova: { casi: giorni.size, su: giorniAttivi.size, esempi: [...giorni.keys()].sort().slice(-5).reverse().map(g => ({ quando: `${g}T12:00:00.000Z`, testo: cartella, doc: null })) }, fiducia: giorni.size / giorniAttivi.size })
    }
  }
  return fuori
}

// — leggere e scrivere —

type Riga = { chiave: string; genere: string; dati: string; prova: string; fiducia: number; stato: Stato; testoSuo: string | null; visto: string; aggiornato: string; tolta: string | null }

const json = <T>(s: string, altrimenti: T): T => { try { return JSON.parse(s) as T } catch { return altrimenti } }
const daRiga = (r: Riga): Abitudine => ({
  ...r, dati: json(r.dati, {}), prova: json(r.prova, { casi: 0, su: null, esempi: [] })
})

function righe(): Abitudine[] {
  return (db.prepare('SELECT * FROM abitudini').all() as Riga[]).map(daRiga)
}

/**
 * Rifà tutte le righe dai fatti. Di notte, e dopo un «cancella le osservazioni».
 *
 * Una `tolta` non rinasce; una `corretta` tiene le sue parole; una che non regge
 * più diventa `superata` (dalla data in `aggiornato`), e se torna a reggere torna
 * `osservata`. Le superate da più di novanta giorni se ne vanno.
 */
export function ricalcola(adesso = new Date()): { righe: number } {
  const ora = adesso.toISOString()
  const candidate = [...righePosta(adesso), ...righeAgenda(adesso), ...righeLavoro(adesso)]
  const esistenti = new Map(righe().map(r => [r.chiave, r]))
  const ins = db.prepare(`INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, testoSuo, visto, aggiornato, tolta) VALUES (?,?,?,?,?,?,?,?,?,NULL)`)
  const upd = db.prepare('UPDATE abitudini SET dati = ?, prova = ?, fiducia = ?, stato = ?, aggiornato = ? WHERE chiave = ?')
  const viste = new Set<string>()
  let n = 0
  db.exec('BEGIN')
  try {
    for (const c of candidate) {
      viste.add(c.chiave)
      const e = esistenti.get(c.chiave)
      if (e?.stato === 'tolta') continue
      n++
      if (!e) { ins.run(c.chiave, c.genere, JSON.stringify(c.dati), JSON.stringify(c.prova), c.fiducia, 'osservata', null, ora, ora); continue }
      const stato: Stato = e.stato === 'superata' ? 'osservata' : e.stato
      upd.run(JSON.stringify(c.dati), JSON.stringify(c.prova), c.fiducia, stato, ora, c.chiave)
    }
    for (const e of esistenti.values()) {
      if (viste.has(e.chiave) || e.stato === 'tolta' || e.stato === 'corretta') continue
      if (e.stato === 'superata') {
        if (Date.parse(e.aggiornato) < adesso.getTime() - GIORNI_SUPERATA * GIORNO) db.prepare('DELETE FROM abitudini WHERE chiave = ?').run(e.chiave)
        continue
      }
      db.prepare("UPDATE abitudini SET stato = 'superata', aggiornato = ? WHERE chiave = ?").run(ora, e.chiave)
    }
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
  return { righe: n }
}

/** Le righe per la pagina: tutte tranne le tolte. */
export function tutte(): AbitudineVista[] {
  return righe().filter(r => r.stato !== 'tolta').map(r => ({
    chiave: r.chiave, genere: r.genere, dati: r.dati, testoSuo: r.testoSuo, casi: r.prova.casi, su: r.prova.su,
    stato: r.stato as AbitudineVista['stato'], inVigore: inVigore(r), fino: r.stato === 'superata' ? r.aggiornato : null,
    esempi: r.prova.esempi ?? []
  })).sort((a, b) => (b.su ?? b.casi) - (a.su ?? a.casi) || a.chiave.localeCompare(b.chiave))
}

/** Tienila, correggila, toglila, o rimettila com'era (entro dieci minuti). */
export function cambia(chiave: string, azione: 'tieni' | 'correggi' | 'togli' | 'ripristina', testo?: string, prima?: string, adesso = new Date()): void {
  if (!['tieni', 'correggi', 'togli', 'ripristina'].includes(azione)) throw new Error('Azione sconosciuta.')
  const r = db.prepare('SELECT * FROM abitudini WHERE chiave = ?').get(chiave) as Riga | undefined
  if (!r) throw new Error('Non la trovo.')
  const ora = adesso.toISOString()
  switch (azione) {
    case 'tieni':
      db.prepare("UPDATE abitudini SET stato = 'tenuta', tolta = NULL WHERE chiave = ?").run(chiave); return
    case 'correggi': {
      const suo = senzaTrattini(String(testo ?? '')).trim()
      if (suo.length < 3 || suo.length > 300) throw new Error('Scrivila in poche parole.')
      db.prepare("UPDATE abitudini SET stato = 'corretta', testoSuo = ?, tolta = NULL WHERE chiave = ?").run(suo, chiave); return
    }
    case 'togli':
      db.prepare("UPDATE abitudini SET stato = 'tolta', tolta = ? WHERE chiave = ?").run(ora, chiave); return
    case 'ripristina': {
      const ok = prima === 'osservata' || prima === 'tenuta' || prima === 'corretta'
      const fresca = r.stato === 'tolta' && !!r.tolta && adesso.getTime() - Date.parse(r.tolta) <= MINUTI_ANNULLA * 60_000
      if (!ok || !fresca) throw new Error('È passato troppo tempo per annullare.')
      db.prepare('UPDATE abitudini SET stato = ?, tolta = NULL WHERE chiave = ?').run(prima, chiave); return
    }
  }
}

// — le frasi per il modello, in italiano, in secchi —

/** Gli stessi secchi della pagina (src/gemello-frasi.ts): il testo cambia solo se cambia il secchio. */
export function durata(min: number): string {
  if (min <= 60) return 'un’ora'
  if (min <= 180) return '3 ore'
  if (min <= 480) return 'qualche ora'
  if (min <= 1440) return 'un giorno'
  return `${Math.round(min / 1440)} giorni`
}
const oraIt = (minutiDelGiorno: number) => String(Math.round(minutiDelGiorno / 60) % 24)

function fraseIt(a: Abitudine): string {
  const d = a.dati
  // un nome con la chiocciola è un indirizzo: non entra in un prompt, la riga si salta
  if (typeof d.nome === 'string' && d.nome.includes('@')) return ''
  switch (a.genere) {
    case 'posta.risponde_sempre': return `A ${d.nome} risponde sempre, di solito entro ${durata(Number(d.latenzaMin))}.`
    case 'posta.lascia': return `Le mail di ${d.nome} di solito restano senza risposta.`
    case 'posta.tempo': return `Di solito risponde entro ${durata(Number(d.latenzaMin))}.`
    case 'posta.ore': return `Scrive le risposte soprattutto tra le ${d.da} e le ${d.a}.`
    case 'agenda.sposta': return `Sposta una riunione su ${d.ogni}.`
    case 'agenda.rifiuta': return `Rifiuta gli inviti di ${d.nome}.`
    case 'app.principale': return `Passa più tempo in ${d.app}, ${String(d.oreGiorno).replace('.', ',')} ore al giorno.`
    case 'app.giornata': return `Comincia verso le ${oraIt(Number(d.da))} e smette verso le ${oraIt(Number(d.a))}.`
    case 'codice.con_agenti': return `Su ${d.cartella} lavora con ${d.agente} quasi ogni giorno.`
    default: return ''
  }
}

/** Al massimo tante righe e tanti caratteri nel ritratto. */
export const RIGHE_RITRATTO = 8
export const CARATTERI_RITRATTO = 500

/**
 * Per `memoria.carta()`: al massimo otto righe e cinquecento caratteri, o niente.
 *
 * Le righe confermate da lei (tenute o scritte da lei) hanno la precedenza
 * sul posto: sono parole sue. Un'intestazione compare solo se sotto ha
 * almeno una riga, anche dopo il taglio dei cinquecento caratteri.
 */
export function perIlRitratto(): string {
  const valide = righe().filter(inVigore).sort((a, b) => a.chiave.localeCompare(b.chiave))
  const pulita = (f: string) => senzaTrattini(f).trim()
  const confermate = valide.filter(a => a.stato !== 'osservata').map(a => a.stato === 'corretta' && a.testoSuo ? a.testoSuo : fraseIt(a)).map(pulita).filter(Boolean).slice(0, RIGHE_RITRATTO)
  const misurate = valide.filter(a => a.stato === 'osservata').map(fraseIt).map(pulita).filter(Boolean).slice(0, RIGHE_RITRATTO - confermate.length)
  const blocchi: { titolo: string; frasi: string[] }[] = [
    { titolo: 'Come lavora, misurato su almeno 20 casi:', frasi: misurate },
    { titolo: 'Come lavora, confermato da lei:', frasi: confermate }
  ]
  const testo = () => blocchi.filter(b => b.frasi.length).flatMap(b => [b.titolo, ...b.frasi.map(f => `· ${f}`)]).join('\n')
  // sopra i cinquecento caratteri si toglie prima una riga misurata, poi una confermata
  let t = testo()
  while (t.length > CARATTERI_RITRATTO) {
    const b = blocchi[0]!.frasi.length ? blocchi[0]! : blocchi[1]!
    if (!b.frasi.length) break
    b.frasi.pop()
    t = testo()
  }
  return t
}

/** Per il feed e la preparazione delle risposte: com'è messo un mittente. */
export function perMittente(addr: string): { risponde: number; latenzaMin: number | null; casi: number; inVigore: boolean } | null {
  const a = addr.trim().toLowerCase()
  const r = righe().find(x => (x.chiave === `posta.risponde_sempre:${a}` || x.chiave === `posta.lascia:${a}`) && x.stato !== 'tolta')
  if (!r) return null
  return { risponde: r.genere === 'posta.lascia' ? 1 - r.fiducia : r.fiducia, latenzaMin: r.dati.latenzaMin != null ? Number(r.dati.latenzaMin) : null, casi: r.prova.su ?? r.prova.casi, inVigore: inVigore(r) }
}

/** Per il resoconto della settimana (P9): le righe nate da quel momento, non tolte. */
export function imparateDal(iso: string): { chiave: string; genere: string; dati: object }[] {
  return righe().filter(r => r.stato !== 'tolta' && r.visto >= iso).map(r => ({ chiave: r.chiave, genere: r.genere, dati: r.dati }))
}

export const perProva = { fraseIt, genereDi, utente: () => chi.adesso() }
