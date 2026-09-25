// L'agenda del Mac, letta e scritta come fosse la nostra.
//
// `agenda.ts` scrive in Calendario da una proposta della lista: una riga alla
// volta, in AppleScript, con la prova che ogni evento sia arrivato. Qui c'è
// l'altra metà, quella che serve a una vista della settimana: leggere tutti i
// calendari e tutti gli eventi di un intervallo, crearne uno, spostarlo,
// cancellarlo. Google Calendar sarebbe la strada ovvia e vuole un'app
// registrata che non abbiamo; Calendario è già collegato agli stessi account e
// sincronizza da sé. Scrivere lì è scrivere ovunque.
//
// Tre scelte, e le ragioni:
//
//   · **JavaScript for Automation, non AppleScript.** Lo script torna JSON,
//     e JSON si legge senza inventarsi separatori. Le date arrivano come
//     `Date` di JavaScript, e `toISOString` le mette in UTC senza dover
//     interpretare «venerdì 18 settembre 2026 alle 15:00» nella lingua del Mac.
//   · **Il testo di chi usa passa da `argv`, mai dentro lo script.** Un
//     titolo con una virgoletta chiudeva la stringa e diventava programma. Lo
//     script è una costante; quello che cambia arriva come JSON in un
//     argomento e lo script lo legge con `JSON.parse`.
//   · **Un evento si cerca per uid, mai per titolo.** Due riunioni che si
//     chiamano «Punto» sono due riunioni.
//
// La prima volta macOS chiede il permesso di controllare Calendario. Finché la
// finestra resta aperta gli eventi non ricevono risposta e scadono: da qui si
// vede come «Calendario non ha risposto», e la strada per sbloccarlo la dice
// il messaggio su PERMESSO.

import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { userInfo } from 'node:os'
import { OSPITATO } from './ospitato.ts'
import * as chi from './chi.ts'
import { ripetizioni } from './connettori/calendario.ts'
import { zonaIana } from './connettori/fusiIcal.ts'

export type Fonte = 'apple' | 'ical'

export type Calendario = {
  id: string
  nome: string
  colore: string
  scrivibile: boolean
  fonte: Fonte
}

export type EventoAgenda = {
  /** L'uid dell'evento. Un'occorrenza di una serie porta `uid#istante`: si legge, non si sposta. */
  id: string
  /** L'uid del calendario in cui sta: stabile da una chiamata all'altra. */
  calendario: string
  titolo: string
  /** ISO in UTC. Un giorno intero sta a mezzanotte UTC, e `fine` è il giorno dopo (escluso). */
  inizio: string
  fine: string
  tuttoIlGiorno: boolean
  luogo?: string | null
  note?: string | null
  fonte: Fonte
}

export type NuovoEvento = {
  titolo: string
  inizio: string
  fine: string
  tuttoIlGiorno?: boolean
  calendario?: string
  luogo?: string
  note?: string
}

export type Ritocco = Partial<Pick<NuovoEvento, 'titolo' | 'inizio' | 'fine' | 'tuttoIlGiorno' | 'luogo' | 'note'>>

/** Il calendario in cui si scrive se nessuno ne sceglie uno. Nasce alla prima scrittura. */
export const PREDEFINITO = 'Myynd'

// — le frasi —

export const NON_QUI = 'L’agenda del Mac non è disponibile qui.'
export const PERMESSO = 'Per l’agenda serve il permesso al Calendario: Impostazioni di Sistema › Privacy e sicurezza › Calendari › Myynd.'
export const NON_RISPONDE = 'Calendario non ha risposto.'
export const NON_C_E = 'Calendario non è disponibile su questo Mac.'
export const NON_TROVATO = 'Evento non trovato.'
export const CALENDARIO_NON_TROVATO = 'Non ho trovato quel calendario.'
export const SI_RIPETE = 'Questo evento si ripete: spostalo o cancellalo da Calendario.'

/**
 * Un guasto con il numero giusto per la rotta.
 *
 * 503 quando l'agenda non c'è (ospitati, non un Mac, permesso negato, nessuna
 * risposta); 404 per un evento sparito; 400 per una richiesta che non si può
 * fare. Il resto è 500. La rotta non deve sapere niente di più.
 */
export class GuaioAgenda extends Error {
  stato: number
  constructor(messaggio: string, stato: number) {
    super(messaggio)
    this.stato = stato
  }
}

export function statoDi(e: unknown): number {
  return e instanceof GuaioAgenda ? e.stato : 500
}

// — lo script —

/**
 * Tutto quello che si chiede a Calendario, in uno script solo.
 *
 * `argv[0]` dice cosa fare e `argv[1]` porta i dati in JSON. I giorni interi
 * hanno una convenzione da rispettare nei due sensi: Calendario li tiene a
 * mezzanotte *locale*, e per noi stanno a mezzanotte UTC del giorno di
 * calendario — come nel connettore iCal, così una settimana mette insieme le
 * due fonti senza spostare niente di un giorno. La fine, in lettura, è il
 * giorno dopo l'ultimo (escluso); in scrittura si mette alle 23:59:59
 * dell'ultimo giorno, che Calendario legge nello stesso modo in tutte le sue
 * versioni.
 *
 * Gli errori escono come codici senza spazi: li traduce `traduciGuasto`, di
 * qua, dove c'è il dizionario.
 */
export const SCRIPT = String.raw`
function run(argv) {
  var azione = String(argv[0] || '')
  var p = JSON.parse(argv[1] || '{}')
  var Calendar = Application('Calendar')

  var iso = function (d) { return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : null }
  var giornoUtc = function (d) { return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString() }
  var giornoLocale = function (isoUtc) { var g = new Date(isoUtc); return new Date(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate()) }
  var testo = function (v) { return typeof v === 'string' ? v : '' }

  var calendari = function () { return Calendar.calendars() }
  var descrivi = function (c) { return { id: c.uid(), nome: c.name(), colore: testo(c.color()), scrivibile: !!c.writable() } }

  var costruisci = function (cid, uid, titolo, inizio, fine, giorno, luogo, note, ripete) {
    giorno = !!giorno
    var fineBuona = fine instanceof Date && !isNaN(fine.getTime())
    return {
      id: uid, calendario: cid, titolo: testo(titolo),
      inizio: giorno ? giornoUtc(inizio) : iso(inizio),
      fine: giorno ? giornoUtc(new Date((fineBuona ? fine : inizio).getTime() - 1000 + 86400000)) : iso(fine),
      tuttoIlGiorno: giorno,
      luogo: testo(luogo) || null,
      note: testo(note) || null,
      ripete: testo(ripete) || null
    }
  }
  var leggi = function (cid, e) {
    return costruisci(cid, e.uid(), e.summary(), e.startDate(), e.endDate(), e.alldayEvent(), e.location(), e.description(), e.recurrence())
  }
  // tutte le proprietà di tutti gli eventi di una scelta in otto viaggi, non otto per evento
  var leggiTutti = function (cid, scelta, conEscluse) {
    var uids = scelta.uid()
    if (!uids.length) return []
    var titoli = scelta.summary(), inizi = scelta.startDate(), fini = scelta.endDate(), giorni = scelta.alldayEvent()
    var luoghi = scelta.location(), note = scelta.description(), regole = scelta.recurrence()
    var escluse = conEscluse ? scelta.excludedDates() : null
    var fuori = []
    for (var i = 0; i < uids.length; i++) {
      var ev = costruisci(cid, uids[i], titoli[i], inizi[i], fini[i], giorni[i], luoghi[i], note[i], regole[i])
      if (escluse) ev.escluse = (escluse[i] || []).map(iso).filter(Boolean)
      fuori.push(ev)
    }
    return fuori
  }

  var trova = function (uid) {
    var cs = calendari()
    for (var i = 0; i < cs.length; i++) {
      var t = cs[i].events.whose({ uid: uid })()
      if (t.length) return { c: cs[i], e: t[0] }
    }
    return null
  }

  var trovaCalendario = function (id) {
    var cs = calendari()
    for (var i = 0; i < cs.length; i++) if (cs[i].uid() === id) return cs[i]
    for (var j = 0; j < cs.length; j++) if (cs[j].name() === id) return cs[j]
    return null
  }

  var date = function (e, giorno) {
    if (giorno) {
      var ultimo = giornoLocale(e.fine)
      // la fine che ci arriva è il giorno dopo, escluso: l'ultimo giorno è quello prima
      var fineLocale = new Date(ultimo.getTime() - 1000)
      var inizioLocale = giornoLocale(e.inizio)
      if (fineLocale < inizioLocale) fineLocale = new Date(inizioLocale.getTime() + 86400000 - 1000)
      return { inizio: inizioLocale, fine: fineLocale }
    }
    return { inizio: new Date(e.inizio), fine: new Date(e.fine) }
  }

  if (azione === 'calendari') return JSON.stringify(calendari().map(descrivi))

  if (azione === 'eventi') {
    var da = new Date(p.da), a = new Date(p.a)
    var cs = calendari(), fuori = [], serie = []
    for (var i = 0; i < cs.length; i++) {
      var cid = cs[i].uid()
      var dentro = cs[i].events.whose({ _and: [{ startDate: { _lessThan: a } }, { endDate: { _greaterThan: da } }] })
      fuori = fuori.concat(leggiTutti(cid, dentro, false))
      // le serie stanno a parte: Calendario le espone come la loro prima volta, e le srotoliamo noi
      var ripetuti = cs[i].events.whose({ recurrence: { _contains: 'FREQ=' } })
      serie = serie.concat(leggiTutti(cid, ripetuti, true))
    }
    return JSON.stringify({ eventi: fuori, serie: serie })
  }

  if (azione === 'crea') {
    var c = trovaCalendario(p.calendario)
    if (!c) {
      if (p.calendario !== p.predefinito) throw new Error('CALENDARIO_NON_TROVATO')
      c = Calendar.Calendar({ name: p.predefinito })
      Calendar.calendars.push(c)
    }
    var q = date(p, !!p.tuttoIlGiorno)
    var nuovo = Calendar.Event({
      summary: p.titolo, startDate: q.inizio, endDate: q.fine, alldayEvent: !!p.tuttoIlGiorno,
      location: p.luogo || '', description: p.note || ''
    })
    c.events.push(nuovo)
    return JSON.stringify(leggi(c.uid(), nuovo))
  }

  if (azione === 'modifica') {
    var t = trova(p.id)
    if (!t) throw new Error('NON_TROVATO')
    var m = p.modifiche
    var ripete = !!testo(t.e.recurrence())
    if (ripete && (m.inizio !== undefined || m.fine !== undefined || m.tuttoIlGiorno !== undefined)) throw new Error('SI_RIPETE')
    if (m.titolo !== undefined) t.e.summary = m.titolo
    if (m.luogo !== undefined) t.e.location = m.luogo || ''
    if (m.note !== undefined) t.e.description = m.note || ''
    if (m.inizio !== undefined || m.fine !== undefined || m.tuttoIlGiorno !== undefined) {
      // quello che non cambia resta com'è, letto con la stessa convenzione con cui lo scriviamo
      var attuale = leggi(t.c.uid(), t.e)
      var giorno = m.tuttoIlGiorno !== undefined ? !!m.tuttoIlGiorno : attuale.tuttoIlGiorno
      var q2 = date({
        inizio: m.inizio !== undefined ? m.inizio : attuale.inizio,
        fine: m.fine !== undefined ? m.fine : attuale.fine
      }, giorno)
      t.e.alldayEvent = giorno
      t.e.startDate = q2.inizio
      t.e.endDate = q2.fine
    }
    return JSON.stringify(leggi(t.c.uid(), t.e))
  }

  if (azione === 'elimina') {
    var d = trova(p.id)
    if (!d) throw new Error('NON_TROVATO')
    if (testo(d.e.recurrence())) throw new Error('SI_RIPETE')
    Calendar.delete(d.e)
    return JSON.stringify({ ok: true })
  }

  throw new Error('AZIONE_SCONOSCIUTA')
}
`

// — il corridore —

/**
 * Una chiamata a Calendario, come la fa davvero.
 *
 * Venti secondi e poi si smette di aspettare: se Calendario non risponde è
 * perché c'è una finestra di sistema aperta o perché sta caricando, e in
 * nessuno dei due casi aspettare di più cambia qualcosa. Niente `activate`:
 * il Mac di chi usa non si tocca.
 */
function corriDavvero(azione: string, argomento: unknown, attesa = 20_000): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    execFile('/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', SCRIPT, azione, JSON.stringify(argomento ?? {})],
      { timeout: attesa, maxBuffer: 16 * 1024 * 1024 },
      (e, stdout, stderr) => {
        if (e) {
          /*
           * Solo quello che osascript ha detto, mai la riga di comando: quella
           * contiene lo script intero, e dentro lo script ci sono le parole
           * («NON_TROVATO», «SI_RIPETE») che `traduciGuasto` cerca. Un'attesa
           * scaduta si presentava come «Evento non trovato».
           */
          const dettaglio = String(stderr ?? '').trim()
          const scaduto = ('killed' in e && e.killed) || ('signal' in e && !!e.signal)
          const codice = 'code' in e ? String(e.code) : '?'
          rifiuta(new Error(scaduto ? `SCADUTO\n${dettaglio}` : dettaglio || `osascript: uscita ${codice}`))
          return
        }
        risolvi(String(stdout).trim())
      })
  })
}

/**
 * Le mani con cui si parla al Mac, sostituibili solo nelle prove.
 *
 * In produzione è sempre `corriDavvero`, su un Mac, non ospitati. Le prove ci
 * mettono una funzione che risponde quello che serve, e possono fingere di
 * essere su un server o su Windows.
 */
type Ferri = {
  corri: (azione: string, argomento: unknown, attesa?: number) => Promise<string>
  piattaforma: () => string
  ospitato: () => boolean
  adesso: () => number
  /**
   * Qui Calendario non si tocca mai: nelle prove dal vivo (`MYYND_SENZA_APP_MAC`)
   * e ogni volta che la casa non è quella vera di chi usa il Mac (una casa
   * finta vuol dire una prova, e il Calendario sarebbe il suo).
   */
  vietato: () => boolean
  /** Calendario è aperto adesso: una lettura di sottofondo non lo apre mai. */
  aperto: () => Promise<boolean>
}
function calendarioAperto(): Promise<boolean> {
  return new Promise(risolvi => {
    execFile('/usr/bin/pgrep', ['-x', 'Calendar'], { timeout: 5_000 }, e => risolvi(!e))
  })
}
const VERI: Ferri = {
  corri: corriDavvero,
  piattaforma: () => process.platform,
  ospitato: () => OSPITATO,
  adesso: () => Date.now(),
  vietato: () => process.env.MYYND_SENZA_APP_MAC === '1' || resolve(process.env.HOME ?? '') !== resolve(userInfo().homedir),
  aperto: calendarioAperto
}
let ferri: Ferri = VERI

/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). Svuota anche la cache. */
export function perProva(f: Partial<Ferri> | null) {
  ferri = f ? { ...VERI, ...f } : VERI
  cache.clear()
}

/** Vero quando questa macchina può parlare con Calendario: un Mac, non un server. */
export function disponibile(): boolean {
  return !ferri.ospitato() && ferri.piattaforma() === 'darwin' && !ferri.vietato()
}

/** Calendario è aperto su questo Mac. Mai vero dove Calendario non si può toccare. */
export async function aperto(): Promise<boolean> {
  if (!disponibile()) return false
  try { return await ferri.aperto() } catch { return false }
}

/**
 * Quello che osascript dice quando va storto, tradotto in una frase nostra.
 *
 * I numeri sono quelli degli Apple Events: -1743 è il permesso negato, -1712
 * l'attesa scaduta (che è anche quello che succede mentre la finestra del
 * permesso è aperta), -600 e -10814 un'app che non c'è. I codici senza spazi
 * li tira lo script, e sono i casi che la rotta deve distinguere.
 */
export function traduciGuasto(e: unknown): GuaioAgenda {
  const m = e instanceof Error ? e.message : String(e)
  // prima i guasti di sistema, poi i codici dello script: l'ordine conta se
  // per sbaglio il messaggio si portasse dietro il testo dello script
  if (/^SCADUTO|-1712|timed out|scadut/i.test(m)) return new GuaioAgenda(NON_RISPONDE, 503)
  if (/-1743|not allowed|not authori[sz]ed|non (?:è )?autorizzat|assistive access/i.test(m)) return new GuaioAgenda(PERMESSO, 503)
  if (/-600\b|-10814|isn[’']t running|can[’']t be found|non trovat|ENOENT/i.test(m)) return new GuaioAgenda(NON_C_E, 503)
  if (/\bCALENDARIO_NON_TROVATO\b/.test(m)) return new GuaioAgenda(CALENDARIO_NON_TROVATO, 404)
  if (/\bNON_TROVATO\b/.test(m)) return new GuaioAgenda(NON_TROVATO, 404)
  if (/\bSI_RIPETE\b/.test(m)) return new GuaioAgenda(SI_RIPETE, 400)
  console.error('myynd · agenda del Mac:', m.split('\n')[0])
  return new GuaioAgenda(NON_RISPONDE, 500)
}

async function esegui<T>(azione: string, argomento: unknown, attesa?: number): Promise<T> {
  if (!disponibile()) throw new GuaioAgenda(NON_QUI, 503)
  let fuori: string
  try {
    fuori = await ferri.corri(azione, argomento, attesa)
  } catch (e) {
    throw traduciGuasto(e)
  }
  try {
    return JSON.parse(fuori) as T
  } catch {
    throw traduciGuasto(new Error(`risposta non JSON: ${fuori.slice(0, 120)}`))
  }
}

// — i calendari —

/**
 * I calendari, tenuti un minuto per conto.
 *
 * Chiedere l'elenco costa un giro di Apple Events, e la vista lo chiede a ogni
 * settimana che scorre. Un minuto basta: un calendario nuovo compare al giro
 * dopo, e chi lo crea da qui lo vede subito perché `crea` svuota la cache.
 * Per conto e non per processo: su un server con più persone un elenco
 * sarebbe quello di chiunque abbia chiesto per primo.
 */
const cache = new Map<string, { quando: number; lista: Calendario[] }>()
const CACHE_MS = 60_000

const conto = () => chi.adesso() ?? ''

type CalendarioGrezzo = { id: string; nome: string; colore: string; scrivibile: boolean }

export async function calendari(attesa?: number): Promise<Calendario[]> {
  const k = conto()
  const c = cache.get(k)
  if (c && ferri.adesso() - c.quando < CACHE_MS) return c.lista
  const grezzi = await esegui<CalendarioGrezzo[]>('calendari', {}, attesa)
  const lista: Calendario[] = (Array.isArray(grezzi) ? grezzi : []).map((g): Calendario => ({
    id: String(g.id ?? ''), nome: String(g.nome ?? ''), colore: String(g.colore ?? ''),
    scrivibile: !!g.scrivibile, fonte: 'apple'
  })).filter(g => g.id)
  cache.set(k, { quando: ferri.adesso(), lista })
  return lista
}

// — gli eventi —

type EventoGrezzo = {
  id: string; calendario: string; titolo: string; inizio: string | null; fine: string | null
  tuttoIlGiorno: boolean; luogo?: string | null; note?: string | null; ripete?: string | null; escluse?: string[]
}

function pulisci(g: EventoGrezzo): EventoAgenda | null {
  if (!g || typeof g.id !== 'string' || !g.id || !g.inizio) return null
  const inizio = new Date(g.inizio)
  if (Number.isNaN(inizio.getTime())) return null
  let fine = g.fine ? new Date(g.fine) : null
  if (!fine || Number.isNaN(fine.getTime()) || fine < inizio) {
    // senza una fine buona: un'ora, o il giorno intero
    fine = new Date(inizio.getTime() + (g.tuttoIlGiorno ? 864e5 : 3600e3))
  }
  return {
    id: g.id,
    calendario: String(g.calendario ?? ''),
    titolo: typeof g.titolo === 'string' && g.titolo.trim() ? g.titolo.trim() : '(senza titolo)',
    inizio: inizio.toISOString(),
    fine: fine.toISOString(),
    tuttoIlGiorno: !!g.tuttoIlGiorno,
    luogo: typeof g.luogo === 'string' && g.luogo.trim() ? g.luogo.trim() : null,
    note: typeof g.note === 'string' && g.note.trim() ? g.note.trim() : null,
    fonte: 'apple'
  }
}

/** L'id di un'occorrenza che non è la prima: si legge, non si tocca. */
export function idOccorrenza(uid: string, inizio: Date): string {
  return `${uid}#${inizio.getTime()}`
}
export function eUnaOccorrenza(id: string): boolean {
  return id.includes('#')
}

/**
 * Le ripetizioni, srotolate da noi.
 *
 * Calendario espone una serie come un evento solo: quello della prima volta,
 * con la regola in `recurrence`. Chiedere «gli eventi di questa settimana»
 * non trova la riunione del lunedì cominciata a gennaio. Si prendono le serie
 * a parte e si srotolano con la stessa funzione che srotola le regole di un
 * file iCal, sull'orologio del Mac. Un'occorrenza già scritta come evento
 * suo (una volta spostata a mano) vince su quella calcolata lo stesso giorno.
 */
function srotola(serie: EventoGrezzo[], singoli: EventoAgenda[], da: Date, a: Date): EventoAgenda[] {
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const zona = zonaIana(fuso)
  const giorno = (d: Date) => zona.orologio(d)
  const giaScritti = new Set(singoli.map(e => {
    const o = giorno(new Date(e.inizio))
    return `${e.id}|${o.anno}-${o.mese}-${o.giorno}`
  }))
  const fuori: EventoAgenda[] = []
  for (const s of serie) {
    const base = pulisci(s)
    if (!base || !s.ripete) continue
    const inizio = new Date(base.inizio)
    const durata = new Date(base.fine).getTime() - inizio.getTime()
    const escluse = new Set((s.escluse ?? []).map(x => new Date(x).getTime()).filter(n => Number.isFinite(n)))
    let date: Date[]
    try {
      date = ripetizioni(inizio, s.ripete, da, a, escluse, base.tuttoIlGiorno ? undefined : zona)
    } catch {
      date = [inizio]
    }
    for (const d of date) {
      const fine = new Date(d.getTime() + durata)
      if (d >= a || fine <= da) continue
      const o = giorno(d)
      if (giaScritti.has(`${base.id}|${o.anno}-${o.mese}-${o.giorno}`)) continue
      fuori.push({
        ...base,
        id: d.getTime() === inizio.getTime() ? base.id : idOccorrenza(base.id, d),
        inizio: d.toISOString(),
        fine: fine.toISOString()
      })
    }
  }
  return fuori
}

/** Gli eventi di tutti i calendari fra due istanti, in ordine di inizio. */
export async function eventi(da: Date, a: Date, attesa?: number): Promise<EventoAgenda[]> {
  const r = await esegui<{ eventi: EventoGrezzo[]; serie: EventoGrezzo[] }>('eventi', { da: da.toISOString(), a: a.toISOString() }, attesa)
  const singoli = (Array.isArray(r?.eventi) ? r.eventi : []).filter(g => !g.ripete).map(pulisci).filter((e): e is EventoAgenda => !!e)
  const serie = Array.isArray(r?.serie) ? r.serie : []
  const tutti = [...singoli, ...srotola(serie, singoli, da, a)]
  // «quale, e quando»: un'occorrenza staccata a mano porta l'uid della serie, e non è la serie
  const visti = new Set<string>()
  return tutti
    .filter(e => { const k = `${e.id}|${e.inizio}`; if (visti.has(k)) return false; visti.add(k); return true })
    .sort((x, y) => x.inizio.localeCompare(y.inizio) || x.titolo.localeCompare(y.titolo))
}

// — scrivere —

export async function crea(e: NuovoEvento): Promise<EventoAgenda> {
  const calendario = e.calendario?.trim() || PREDEFINITO
  const g = await esegui<EventoGrezzo>('crea', {
    titolo: e.titolo, inizio: e.inizio, fine: e.fine, tuttoIlGiorno: !!e.tuttoIlGiorno,
    calendario, predefinito: PREDEFINITO, luogo: e.luogo ?? '', note: e.note ?? ''
  })
  // se il calendario è appena nato, l'elenco di un minuto fa non lo sa
  cache.delete(conto())
  const fuori = pulisci(g)
  if (!fuori) throw traduciGuasto(new Error('RISPOSTA_VUOTA'))
  return fuori
}

export async function modifica(id: string, patch: Ritocco): Promise<EventoAgenda> {
  if (eUnaOccorrenza(id)) throw new GuaioAgenda(SI_RIPETE, 400)
  const modifiche: Record<string, unknown> = {}
  for (const k of ['titolo', 'inizio', 'fine', 'tuttoIlGiorno', 'luogo', 'note'] as const) {
    if (patch[k] !== undefined) modifiche[k] = patch[k]
  }
  const g = await esegui<EventoGrezzo>('modifica', { id, modifiche })
  const fuori = pulisci(g)
  if (!fuori) throw traduciGuasto(new Error('RISPOSTA_VUOTA'))
  return fuori
}

export async function elimina(id: string): Promise<void> {
  if (eUnaOccorrenza(id)) throw new GuaioAgenda(SI_RIPETE, 400)
  await esegui<{ ok: true }>('elimina', { id })
}
