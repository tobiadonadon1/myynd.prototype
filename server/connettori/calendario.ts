// L'agenda, senza chiedere il permesso a nessuno.
//
// La strada normale per leggere Google Calendar è OAuth: un progetto su Google
// Cloud, uno schermo di consenso da far verificare, un token da rinfrescare. Da
// far fare a un cliente, è la fine del collegamento — e per Gmail c'è pure un
// audit di sicurezza a pagamento dietro.
//
// Ma ogni agenda al mondo espone già sé stessa come file iCalendar a un
// indirizzo segreto, e leggerlo è leggere un indirizzo. Google lo chiama
// «indirizzo privato in formato iCal», Outlook «pubblica un calendario»,
// iCloud «calendario pubblico». Nessuno dei tre chiede una verifica, perché
// non c'è nessuna API di mezzo: c'è un file.
//
// È lo stesso ragionamento del resto di Myynd: non chiedere una chiave per una
// cosa che è già lì. Il prezzo è che quell'indirizzo *è* la credenziale — chi
// ce l'ha legge l'agenda — e per questo si tratta come una password: non esce
// mai dall'API, e la schermata dice di non girarlo.
//
// Cosa c'è qui dentro, in ordine: leggere un .ics (che è un formato con tre
// trappole vere), capire le date con il loro fuso, e srotolare le ricorrenze.

import type { Documento } from '../store.ts'
import { OSPITATO, hostRaggiungibile, hostRaggiungibileDavvero } from '../ospitato.ts'
import { lingua } from '../config.ts'
import { fusoDi } from '../fuso.ts'
import { zonaDi, zonaIana, ZONA_UTC, leggiVtimezone, type Zona } from './fusiIcal.ts'

export type ConfigCalendario = {
  /** L'indirizzo segreto in formato iCal. È una credenziale: non esce mai. */
  url: string
  /** Come si chiama l'agenda, per l'interfaccia. Vuoto = quello che dice il file. */
  nome?: string
  /** Quanti giorni indietro guardare. Trenta se non lo dice nessuno. */
  giorni?: number
}

/** Quanto avanti si guarda. Un semestre: oltre, in agenda non c'è quasi mai niente di deciso. */
const AVANTI = 180
const INDIETRO = 30

/** Il tetto di eventi. Un'agenda condivisa di un'azienda può averne migliaia. */
const TETTO = 2000

/** Quanto può pesare un file iCal. Le agende grosse stanno sotto il megabyte. */
const PESO_MAX = 8 * 1024 * 1024

// — leggere il file —

/**
 * Le righe di un file iCalendar, riunite.
 *
 * Prima trappola del formato: le righe lunghe si spezzano a 75 ottetti, e la
 * continuazione comincia con **uno spazio o un tab**. Chi legge riga per riga
 * senza rimetterle insieme trova la descrizione di una riunione tagliata a
 * metà, e nessun errore da nessuna parte — semplicemente metà del testo
 * diventa una riga che non è una proprietà e viene buttata.
 */
function righe(testo: string): string[] {
  const fuori: string[] = []
  for (const r of testo.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if ((r.startsWith(' ') || r.startsWith('\t')) && fuori.length) {
      fuori[fuori.length - 1] += r.slice(1)
    } else if (r.length) {
      fuori.push(r)
    }
  }
  return fuori
}

/**
 * Il valore di una proprietà, ripulito.
 *
 * Seconda trappola: dentro TEXT il formato scrive `\n` per l'a capo e mette la
 * barra davanti a virgole e punti e virgola, perché quelli separano i valori.
 * Senza questo passaggio una descrizione arriva piena di `\,` e le note di una
 * riunione si leggono come un file di configurazione.
 */
function ripulisci(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim()
}

type Riga = { nome: string; parametri: Record<string, string>; valore: string }

function spezza(r: string): Riga | null {
  // il nome della proprietà finisce al primo «:» che non sta dentro le virgolette
  let i = 0, virgolette = false
  for (; i < r.length; i++) {
    const c = r[i]
    if (c === '"') virgolette = !virgolette
    else if (c === ':' && !virgolette) break
  }
  if (i >= r.length) return null
  const testa = r.slice(0, i)
  const valore = r.slice(i + 1)
  const pezzi = testa.split(';')
  const parametri: Record<string, string> = {}
  for (const p of pezzi.slice(1)) {
    const e = p.indexOf('=')
    if (e > 0) parametri[p.slice(0, e).toUpperCase()] = p.slice(e + 1).replace(/^"|"$/g, '')
  }
  return { nome: (pezzi[0] ?? '').toUpperCase(), parametri, valore }
}

// — le date —

/**
 * Quello che serve sapere per leggere le date di *questo* file.
 *
 * `dalFile` sono i fusi che il .ics si porta dietro nei suoi VTIMEZONE; `nuda`
 * è il fuso in cui leggere un'ora scritta senza dire dove — che non è quello
 * della macchina. Su un contenitore in UTC «locale» vuol dire Greenwich, e una
 * riunione delle 15 a Roma diventa una riunione delle 15 UTC: due ore avanti,
 * senza un errore da nessuna parte.
 */
export type Contesto = { dalFile?: Map<string, Zona>; nuda?: Zona }

type Istante = { quando: Date; tuttoIlGiorno: boolean; zona: Zona }

/**
 * Da un'ora scritta in un fuso al momento vero.
 *
 * Terza trappola, e la più insidiosa perché sbaglia in silenzio: `DTSTART` può
 * arrivare in tre forme — con la Z finale (UTC), con un `TZID` (ora locale di
 * quel posto), o nuda. Trattarle tutte come UTC sposta ogni riunione italiana
 * di due ore in estate e di una in inverno.
 *
 * Il `TZID` non è per forza un nome IANA: Outlook ci scrive «W. Europe Standard
 * Time», e il vecchio controllo — chiedere a `Intl` se quel fuso esiste —
 * rispondeva no e mandava l'ora nel ramo «nuda». Da chi cerca quel nome, e in
 * che ordine, si occupa `fusiIcal.ts`.
 *
 * Il fuso torna insieme all'istante, e non è un di più: senza, chi srotola «ogni
 * giorno alle 9» non sa in quale orologio sono quelle 9, e finisce per sommare
 * ventiquattro ore — che la notte del cambio d'ora sono un'ora di troppo.
 */
export function data(r: Riga, ctx?: Contesto): Istante | null {
  const v = r.valore.trim()
  const giorno = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (giorno) {
    // un giorno intero non ha un'ora, quindi non ha nemmeno un fuso: resta a
    // mezzanotte UTC, e va anche scritto in UTC — altrimenti «10 settembre»
    // letto a New York diventa il 9
    return {
      quando: new Date(Date.UTC(Number(giorno[1]), Number(giorno[2]) - 1, Number(giorno[3]))),
      tuttoIlGiorno: true,
      zona: ZONA_UTC
    }
  }
  const pieno = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v)
  if (!pieno) return null
  const [, a, m, g, o, mi, s, z] = pieno as unknown as string[]
  const n = (x: string) => Number(x)
  if (z === 'Z') {
    return {
      quando: new Date(Date.UTC(n(a), n(m) - 1, n(g), n(o), n(mi), n(s))),
      tuttoIlGiorno: false,
      zona: ZONA_UTC
    }
  }
  const zona = zonaDi(r.parametri.TZID, ctx?.dalFile) ?? ctx?.nuda ?? zonaIana(fusoDi())
  return {
    quando: zona.istante(n(a), n(m), n(g), n(o), n(mi), n(s)),
    tuttoIlGiorno: false,
    zona
  }
}

// — le ricorrenze —

const GIORNI = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/**
 * Le date di un evento che si ripete, dentro la finestra che ci interessa.
 *
 * Non è un'implementazione completa di RRULE — quella è un piccolo mostro, con
 * BYSETPOS e BYYEARDAY e le settimane che cominciano di mercoledì. Sono coperte
 * le forme che le persone scrivono davvero premendo «si ripete»: ogni giorno,
 * ogni N settimane in certi giorni, ogni mese, ogni anno, con COUNT o UNTIL.
 *
 * Quello che non si sa srotolare non sparisce: torna la prima data e basta,
 * cioè l'evento compare una volta invece di dieci. Una riunione in meno è un
 * difetto; una riunione inventata ogni martedì per sei mesi sarebbe peggio.
 *
 * **`zona` è l'orologio su cui si contano i giorni, e cambia il risultato.**
 * «Ogni giorno alle 9» era «più ventiquattro ore tonde»: giusto per
 * trecentosessantatré giorni l'anno e sbagliato negli altri due. La notte in
 * cui l'Europa torna all'ora solare ne dura venticinque, e da quella mattina in
 * poi tutta la serie scivolava — la riunione delle 9 diventava delle 8 fino al
 * cambio dopo. Lo stesso «ogni lunedì», che rimetteva l'ora con `setHours`:
 * quella è l'ora della macchina, e su un contenitore in UTC non è l'ora di
 * nessuno.
 *
 * Adesso si conta sull'orologio dell'evento: si legge che ora segna lì, si
 * aggiunge un giorno *di calendario*, e si torna all'istante. Il giorno può
 * sforare il mese e il mese l'anno — `Date.UTC` normalizza da sé.
 */
export function ripetizioni(inizio: Date, regola: string, da: Date, a: Date, escluse: Set<number>, zona?: Zona): Date[] {
  const p: Record<string, string> = {}
  for (const pezzo of regola.split(';')) {
    const i = pezzo.indexOf('=')
    if (i > 0) p[pezzo.slice(0, i).toUpperCase()] = pezzo.slice(i + 1).toUpperCase()
  }
  const freq = p.FREQ
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return [inizio]

  const z = zona ?? ZONA_UTC
  const o = z.orologio(inizio)
  const passo = Math.max(1, Number(p.INTERVAL) || 1)
  const quante = Number(p.COUNT) || 0
  let fine = a
  if (p.UNTIL) {
    const u = data({ nome: 'UNTIL', parametri: {}, valore: p.UNTIL }, { nuda: z })
    if (u && u.quando < fine) fine = u.quando
  }

  const giorniSettimana = (p.BYDAY ?? '')
    .split(',')
    .map(x => GIORNI.indexOf(x.replace(/^[+-]?\d+/, '')))
    .filter(i => i >= 0)

  const fuori: Date[] = []
  // un tetto duro: una regola scritta male non deve poter girare per sempre
  const GIRI_MAX = 2000
  let visti = 0

  const forse = (d: Date) => {
    if (d > fine) return false
    visti++
    if (quante && fuori.length + escluse.size >= quante && d > inizio) return false
    if (d >= da && !escluse.has(d.getTime())) fuori.push(d)
    return true
  }

  /** Lo stesso orario dell'evento, tanti giorni di calendario più in là. */
  const fraGiorni = (quanti: number) => z.istante(o.anno, o.mese, o.giorno + quanti, o.ore, o.minuti, o.secondi)

  if (freq === 'DAILY') {
    for (let k = 0; visti < GIRI_MAX && k < GIRI_MAX; k++) {
      if (!forse(fraGiorni(k * passo))) break
    }
  } else if (freq === 'WEEKLY') {
    const giorni = giorniSettimana.length ? giorniSettimana : [o.settimana]
    // la domenica della settimana in cui comincia, contata sul suo calendario
    const domenica = o.giorno - o.settimana
    for (let s = 0; visti < GIRI_MAX && s < GIRI_MAX; s++) {
      const inizioSettimana = domenica + s * passo * 7 - o.giorno
      if (fraGiorni(inizioSettimana) > fine) break
      for (const g of giorni) {
        const d = fraGiorni(inizioSettimana + g)
        if (d < inizio) continue
        forse(d)
      }
    }
  } else if (freq === 'MONTHLY') {
    for (let k = 0; visti < GIRI_MAX && k < GIRI_MAX; k++) {
      const d = z.istante(o.anno, o.mese + k * passo, o.giorno, o.ore, o.minuti, o.secondi)
      // il 31 di un mese che non ce l'ha: si salta invece di scivolare al mese dopo
      if (z.orologio(d).giorno !== o.giorno) continue
      if (!forse(d)) break
    }
  } else {
    for (let k = 0; visti < GIRI_MAX && k < GIRI_MAX; k++) {
      if (!forse(z.istante(o.anno + k * passo, o.mese, o.giorno, o.ore, o.minuti, o.secondi))) break
    }
  }

  return fuori.length ? fuori : (inizio >= da && inizio <= a ? [inizio] : [])
}

// — gli eventi —

export type Evento = {
  uid: string
  titolo: string
  inizio: Date
  fine: Date | null
  tuttoIlGiorno: boolean
  dove: string
  note: string
  organizzatore: string
  invitati: string[]
  stato: string
}

/** Un indirizzo, senza il `mailto:` e senza il resto. */
function chi(r: Riga): string {
  const nome = r.parametri.CN
  const posta = r.valore.replace(/^mailto:/i, '').trim()
  return nome && nome !== posta ? `${nome} <${posta}>` : posta
}

/**
 * Gli eventi di un file iCalendar, già srotolati e già dentro la finestra.
 *
 * Le eccezioni di una serie — «quel martedì la riunione è alle 15» — arrivano
 * come VEVENT a parte con lo stesso UID e un `RECURRENCE-ID`. Si tengono da
 * parte e vincono sull'istanza srotolata, altrimenti l'agenda mostra due volte
 * la stessa riunione a due ore diverse.
 */
export function leggiIcal(testo: string, da: Date, a: Date): { eventi: Evento[]; nome: string; troncato: boolean } {
  const eventi: Evento[] = []
  const eccezioni = new Map<string, Evento>()
  let nome = ''
  let dentro = false
  let corrente: Record<string, Riga> & { EXDATE?: Riga } | null = null
  let esclusi: number[] = []
  let invitati: string[] = []
  let troncato = false

  /*
   * I fusi prima degli eventi, e il fuso di chi legge una volta sola.
   *
   * Il VTIMEZONE sta quasi sempre in cima al file, ma «quasi» non basta: si
   * passa sulle righe due volte, che su otto mega di testo già ricucito costa
   * niente, e da lì in poi ogni data del file può chiedere il suo fuso senza
   * dipendere dall'ordine in cui è scritto.
   *
   * `fusoDi()` legge la configurazione dal disco: chiamarlo una volta per
   * evento vorrebbe dire duemila letture di file per un'agenda piena.
   */
  const tutte = righe(testo)
  const ctx: Contesto = { dalFile: leggiVtimezone(tutte), nuda: zonaIana(fusoDi()) }

  for (const grezza of tutte) {
    const r = spezza(grezza)
    if (!r) continue

    if (r.nome === 'BEGIN' && r.valore.toUpperCase() === 'VEVENT') {
      dentro = true; corrente = {}; esclusi = []; invitati = []
      continue
    }
    if (r.nome === 'END' && r.valore.toUpperCase() === 'VEVENT') {
      if (corrente) chiudiEvento(corrente, esclusi, invitati)
      dentro = false; corrente = null
      continue
    }
    if (!dentro) {
      // il nome dell'agenda sta fuori dagli eventi, e i due nomi possibili
      // vogliono dire la stessa cosa a seconda di chi ha scritto il file
      if (r.nome === 'X-WR-CALNAME' && !nome) nome = ripulisci(r.valore)
      continue
    }
    if (!corrente) continue

    if (r.nome === 'EXDATE') {
      for (const v of r.valore.split(',')) {
        const d = data({ ...r, valore: v }, ctx)
        if (d) esclusi.push(d.quando.getTime())
      }
      continue
    }
    if (r.nome === 'ATTENDEE') { invitati.push(chi(r)); continue }
    corrente[r.nome] = r
  }

  function chiudiEvento(v: Record<string, Riga>, esclusi: number[], invitati: string[]) {
    if (troncato) return
    const uid = v.UID?.valore.trim()
    const dt = v.DTSTART ? data(v.DTSTART, ctx) : null
    if (!uid || !dt) return
    // annullato non vuol dire successo: sta nell'agenda ma non succede
    if ((v.STATUS?.valore ?? '').toUpperCase() === 'CANCELLED') return

    const dtFine = v.DTEND ? data(v.DTEND, ctx) : null
    const durata = dtFine ? dtFine.quando.getTime() - dt.quando.getTime() : null

    const base = {
      uid,
      titolo: ripulisci(v.SUMMARY?.valore ?? '') || 'Senza titolo',
      tuttoIlGiorno: dt.tuttoIlGiorno,
      dove: ripulisci(v.LOCATION?.valore ?? ''),
      note: ripulisci(v.DESCRIPTION?.valore ?? '').slice(0, 4000),
      organizzatore: v.ORGANIZER ? chi(v.ORGANIZER) : '',
      invitati: invitati.slice(0, 40),
      stato: (v.STATUS?.valore ?? '').toUpperCase()
    }

    const ricorrenza = v['RECURRENCE-ID'] ? data(v['RECURRENCE-ID'], ctx) : null
    if (ricorrenza) {
      eccezioni.set(`${uid}@${ricorrenza.quando.getTime()}`, {
        ...base, inizio: dt.quando, fine: durata == null ? null : new Date(dt.quando.getTime() + durata)
      })
      return
    }

    const quando = v.RRULE
      ? ripetizioni(dt.quando, v.RRULE.valore, da, a, new Set(esclusi), dt.zona)
      : (dt.quando >= da && dt.quando <= a ? [dt.quando] : [])

    for (const i of quando) {
      if (eventi.length >= TETTO) { troncato = true; return }
      eventi.push({ ...base, inizio: i, fine: durata == null ? null : new Date(i.getTime() + durata) })
    }
  }

  // le eccezioni vincono sull'istanza che sostituiscono
  const finali = eventi.map(e => eccezioni.get(`${e.uid}@${e.inizio.getTime()}`) ?? e)
  for (const [chiave, e] of eccezioni) {
    const uid = chiave.slice(0, chiave.lastIndexOf('@'))
    if (e.inizio >= da && e.inizio <= a && !finali.some(f => f.uid === uid && f.inizio.getTime() === e.inizio.getTime())) {
      finali.push(e)
    }
  }
  return { eventi: finali, nome, troncato }
}

// — l'indirizzo —

/**
 * Un indirizzo di calendario buono, normalizzato.
 *
 * Google dà quell'indirizzo con `webcal://` in un posto e `https://` in un
 * altro, e chi copia dal punto sbagliato si vede rifiutare un indirizzo che è
 * giusto. `webcal` è `https` con un altro nome: si cambia e si va avanti,
 * invece di spiegare la differenza a qualcuno che non deve saperla.
 */
export function indirizzo(grezzo: string): { ok: true; url: string } | { ok: false; errore: string } {
  const pulito = grezzo.trim().replace(/^webcal:\/\//i, 'https://')
  let u: URL
  try { u = new URL(pulito) } catch { return { ok: false, errore: 'Quello non è un indirizzo. Incolla il link intero, comincia con https.' } }
  // in casa http passa — un calendario su una NAS, per dire; su un server no:
  // là un indirizzo in chiaro è anche una richiesta che chiunque in mezzo può
  // dirottare, e la credenziale sta dentro l'indirizzo stesso
  if (u.protocol !== 'https:' && (u.protocol !== 'http:' || OSPITATO)) {
    return { ok: false, errore: 'Quello non è un indirizzo. Incolla il link intero, comincia con https.' }
  }
  if (!hostRaggiungibile(u.hostname)) {
    return { ok: false, errore: 'Quell’indirizzo non si può raggiungere da qui.' }
  }
  return { ok: true, url: u.toString() }
}

/** La rete, sostituibile nei test. */
let rete: typeof fetch = (...a) => fetch(...a)
export function usaRete(f: typeof fetch | null) { rete = f ?? ((...a) => fetch(...a)) }

/** Quanti rimandi si seguono. Google ne fa uno; tre bastano a chiunque. */
const SALTI_MAX = 3

async function scarica(url: string): Promise<string> {
  let r: Response
  let dove = url
  for (let salto = 0; ; salto++) {
    /*
     * Ogni passaggio si controlla da capo, e i rimandi si seguono a mano.
     *
     * Con `redirect: 'follow'` il controllo sull'host valeva solo per il
     * primo indirizzo: un calendario buono che rispondeva «vai a
     * http://10.0.0.5/» portava la richiesta dentro la rete di chi ospita
     * senza che nessuno guardasse. E il nome si risolve prima di bussare,
     * perché un nome pubblico può puntare dove vuole.
     */
    const i = indirizzo(dove)
    if (!i.ok) throw new Error(i.errore)
    if (!(await hostRaggiungibileDavvero(new URL(i.url).hostname))) {
      throw new Error('Quell’indirizzo non si può raggiungere da qui.')
    }
    try {
      r = await rete(i.url, {
        redirect: 'manual',
        headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' },
        signal: AbortSignal.timeout(30_000)
      })
    } catch (e) {
      const nome = e instanceof Error ? e.name : ''
      if (nome === 'TimeoutError' || nome === 'AbortError') throw new Error('Il calendario ci ha messo troppo a rispondere. Riprova.')
      throw new Error('Non riesco a raggiungere quell’indirizzo. Controlla che sia intero.')
    }
    if (r.status < 300 || r.status >= 400) break
    const verso = r.headers.get('location')
    void r.body?.cancel().catch(() => {})
    if (!verso || salto >= SALTI_MAX) throw new Error('Il calendario ha risposto con un errore. Riprova fra poco.')
    try { dove = new URL(verso, i.url).toString() } catch { throw new Error('Il calendario ha risposto con un errore. Riprova fra poco.') }
  }
  if (r.status === 401 || r.status === 403) {
    throw new Error('Quell’indirizzo non è più valido: rigeneralo nelle impostazioni del calendario e incollalo di nuovo.')
  }
  if (r.status === 404) throw new Error('A quell’indirizzo non c’è nessun calendario. Controlla di aver copiato il link in formato iCal.')
  if (!r.ok) throw new Error('Il calendario ha risposto con un errore. Riprova fra poco.')

  const peso = Number(r.headers.get('content-length') ?? 0)
  if (peso > PESO_MAX) throw new Error('Quel calendario è troppo grande da leggere.')
  const testo = await r.text()
  if (testo.length > PESO_MAX) throw new Error('Quel calendario è troppo grande da leggere.')
  if (!/BEGIN:VCALENDAR/i.test(testo)) {
    throw new Error('A quell’indirizzo non c’è un calendario. Su Google è «Indirizzo privato in formato iCal», in fondo alle impostazioni dell’agenda.')
  }
  return testo
}

/** La prova, che è già una lettura vera: se passa, il collegamento funziona. */
export async function prova(c: ConfigCalendario): Promise<{ ok: true; nome: string; eventi: number } | { ok: false; errore: string }> {
  const i = indirizzo(c.url)
  if (!i.ok) return { ok: false, errore: i.errore }
  try {
    const testo = await scarica(i.url)
    const { eventi, nome } = leggiIcal(testo, finestra(c).da, finestra(c).a)
    return { ok: true, nome: c.nome?.trim() || nome, eventi: eventi.length }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}

function finestra(c: ConfigCalendario) {
  const ora = Date.now()
  const indietro = Math.max(1, Math.min(365, c.giorni ?? INDIETRO))
  return { da: new Date(ora - indietro * 864e5), a: new Date(ora + AVANTI * 864e5) }
}

// — i documenti —

/**
 * Un evento, scritto come lo leggerebbe una persona.
 *
 * Il corpo conta più di quanto sembri: è quello che finisce nell'indice a
 * parole intere, ed è su quello che si cerca. Un documento fatto di campi
 * («LOCATION: …») si trova solo se chiedi con quelle parole; scritto per esteso
 * si trova chiedendo «la riunione con Marco in via Torino».
 */
type Parole = {
  loc: string
  tuttoIlGiorno: string
  dove: string
  organizza: string
  con: string
  daConfermare: string
}

/**
 * Le sei parole che aggiungiamo noi, nella lingua di chi legge.
 *
 * Il resto del documento è roba sua — il titolo della riunione, le note — e
 * resta come l'ha scritta. Ma «Dove» e «Con» li scriviamo noi, e scritti sempre
 * in italiano sarebbero sei parole italiane in mezzo a un'app inglese, dentro
 * ogni singolo evento. Sono anche quello che legge il modello quando cerca:
 * «who am I meeting» trova «Con:» solo se le due cose parlano la stessa lingua.
 */
function parole(): Parole {
  return lingua() === 'it'
    ? { loc: 'it-IT', tuttoIlGiorno: 'tutto il giorno', dove: 'Dove', organizza: 'Organizza', con: 'Con', daConfermare: 'Da confermare.' }
    : { loc: 'en-GB', tuttoIlGiorno: 'all day', dove: 'Where', organizza: 'Organiser', con: 'With', daConfermare: 'Not confirmed yet.' }
}

function corpo(e: Evento, p: Parole, quando: Intl.DateTimeFormat, giorno: Intl.DateTimeFormat, ora: Intl.DateTimeFormat): string {
  const pezzi: string[] = []
  pezzi.push(e.tuttoIlGiorno
    ? `${giorno.format(e.inizio)}, ${p.tuttoIlGiorno}.`
    : `${quando.format(e.inizio)}${e.fine ? ` — ${ora.format(e.fine)}` : ''}.`)
  if (e.dove) pezzi.push(`${p.dove}: ${e.dove}`)
  if (e.organizzatore) pezzi.push(`${p.organizza}: ${e.organizzatore}`)
  if (e.invitati.length) pezzi.push(`${p.con}: ${e.invitati.join(', ')}`)
  if (e.stato === 'TENTATIVE') pezzi.push(p.daConfermare)
  if (e.note) pezzi.push('', e.note)
  return pezzi.join('\n')
}

export type EsitoCalendario = { docs: Documento[]; nome: string; troncato: boolean }

export async function sincronizza(c: ConfigCalendario): Promise<EsitoCalendario> {
  const i = indirizzo(c.url)
  if (!i.ok) throw new Error(i.errore)
  const { da, a } = finestra(c)
  const testo = await scarica(i.url)
  const { eventi, nome, troncato } = leggiIcal(testo, da, a)

  const p = parole()
  /*
   * L'ora nel corpo è quella di chi legge, dichiarata.
   *
   * Senza `timeZone` questi tre formattatori scrivono nell'ora della macchina,
   * e la macchina di un server sta in UTC: il testo di una riunione delle 15 a
   * Roma diceva «13:00». Quel testo non è una decorazione — è quello che finisce
   * nell'indice, quello su cui si cerca, e quello che il modello legge e cita.
   * L'agenda diceva un'ora e il cervello ne ripeteva un'altra.
   *
   * Il giorno intero fa eccezione e va in UTC: non ha un'ora, sta a mezzanotte
   * UTC, e riscritto a New York diventerebbe il giorno prima.
   */
  const mio = fusoDi()
  const quando = new Intl.DateTimeFormat(p.loc, { dateStyle: 'full', timeStyle: 'short', timeZone: mio })
  const giorno = new Intl.DateTimeFormat(p.loc, { dateStyle: 'full', timeZone: 'UTC' })
  const ora = new Intl.DateTimeFormat(p.loc, { hour: '2-digit', minute: '2-digit', timeZone: mio })

  const docs: Documento[] = eventi.map(e => ({
    /*
     * L'istante fa parte dell'identità, non solo l'UID.
     *
     * Un evento che si ripete ha lo stesso UID per tutte le sue occorrenze: con
     * `calendario:<uid>` la riunione del lunedì sovrascriverebbe quella del
     * lunedì prima, e nell'indice ne resterebbe una sola — quella che capita
     * per ultima. L'identità di un impegno è «quale, e quando».
     */
    id: `calendario:${e.uid}:${e.inizio.getTime()}`,
    fonte: 'calendario',
    tipo: 'evento',
    titolo: e.titolo,
    corpo: corpo(e, p, quando, giorno, ora),
    autore: e.organizzatore || null,
    // il posto sta qui e non solo nel corpo: `agenda.leggi` deve poter dire
    // «alle 15, da Marco, in via Torino» senza rileggersi il testo dell'evento
    percorso: e.dove || null,
    quando: e.inizio.toISOString(),
    gruppo: 'agenda'
  }))

  return { docs, nome: c.nome?.trim() || nome, troncato }
}

/** Le occorrenze che non ci sono più: si tolgono solo se la lettura è arrivata in fondo. */
export function collegato(c: { calendario?: ConfigCalendario }): boolean {
  return !!c.calendario?.url
}
