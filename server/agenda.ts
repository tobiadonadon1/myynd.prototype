// Il calendario, passando dal Mac invece che da Google.
//
// La strada ovvia sarebbe OAuth su Google Calendar: un progetto su Google
// Cloud, un client id, un token da rinfrescare, una schermata di consenso da
// far verificare. Settimane, per scrivere una riga in un'agenda.
//
// Ma questa applicazione gira sul computer di chi la usa, e su quel computer
// c'è già Calendario, che è già collegato ai suoi account — G Suite compreso —
// e che sincronizza da sé. Scrivere lì significa scrivere su Google senza
// toccare Google: la sincronizzazione l'ha già fatta lui, anni fa, e continua a
// farla mentre noi dormiamo.
//
// È lo stesso ragionamento del resto di Myynd, applicato ancora: non chiedere
// una chiave per una cosa che è già lì.
//
// Il prezzo, ed è giusto dirlo: la prima volta macOS chiede il permesso di
// controllare Calendario, con una finestra di sistema. Va data, altrimenti qui
// non succede niente — e non c'è modo di aggirarla, che è esattamente come
// dev'essere.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import * as apple from './agenda-apple.ts'
import * as store from './store.ts'
import { leggi as leggiConfig } from './config.ts'
import { daDocumento } from './connettori/calendario.ts'
import { vietato } from './prova-chiusa.ts'

const esegui = promisify(execFile)

export type Evento = {
  titolo: string
  /** ISO 8601 con l'ora locale: «2026-09-03T15:00». */
  inizio: string
  /** Quanto dura, in minuti. Un'ora se non lo dice nessuno. */
  minuti?: number
  dove?: string
  note?: string
  /** In quale calendario. Il primo, se non detto. */
  calendario?: string
}

/**
 * Il testo dentro uno script è testo, non codice.
 *
 * AppleScript non ha parametri: lo script è una stringa, e quello che ci si
 * infila dentro diventa programma. Un titolo di riunione che contiene una
 * virgoletta chiuderebbe la stringa e il resto verrebbe eseguito — che è la
 * stessa vecchia storia dell'SQL, con trent'anni di ritardo. Qui si fugge, e
 * si fugge prima di comporre.
 */
function fuga(s: string): string {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function osascript(righe: string[]): Promise<string> {
  try {
    const { stdout } = await esegui('/usr/bin/osascript', ['-e', righe.join('\n')], {
      timeout: 20_000,
      maxBuffer: 1024 * 1024
    })
    return stdout.trim()
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    // il rifiuto del permesso è il caso normale, non un guasto: va detto come
    // una cosa da fare, non come un errore
    if (/-1743|not allowed|assistive access/i.test(m)) {
      throw new Error('macOS non mi lascia usare Calendario. Concedilo in Impostazioni › Privacy › Automazione.')
    }
    if (/-600|isn’t running|can’t be found/i.test(m)) throw new Error('Calendario non è disponibile su questo Mac.')
    throw new Error('Calendario non ha risposto.')
  }
}

/**
 * Cosa c'è in calendario nei prossimi giorni.
 *
 * L'unico modo di leggere il Calendario del Mac senza chiedere a nessuno una
 * password è chiederlo a lui, e lui risponde in AppleScript. Il formato del
 * ritorno è la parte delicata: `get summary of every event` torna una riga
 * unica separata da virgole, e una riunione che si chiama «Rossi, preventivo»
 * la spezza in due. Perciò si sceglie un separatore che nei titoli non compare
 * — e le tre liste (titolo, inizio, dove) si chiedono in tre passate sullo
 * stesso insieme di eventi, che AppleScript restituisce nello stesso ordine.
 *
 * Il filtro sulle date sta dentro lo script e non qui: chiedere tutti gli
 * eventi di tutti i calendari e scartarli in JavaScript vuol dire aspettare
 * mezzo minuto su un calendario di qualche anno.
 */
export async function prossimi(giorni = 7): Promise<Evento[]> {
  vietato('agenda.prossimi')
  const g = Math.min(30, Math.max(1, Math.round(giorni)))
  const S = '\u001f'   // separatore di unità: nei titoli non c'è mai
  const R = '\u001e'   // separatore di record

  const fuori = await osascript([
    'set da to current date',
    `set a to (current date) + (${g} * days)`,
    'set righe to {}',
    'tell application "Calendar"',
    '  repeat with c in calendars',
    '    tell c',
    '      set trovati to (every event whose start date is greater than da and start date is less than a)',
    '      repeat with e in trovati',
    '        set fine to ""',
    '        try',
    '          set fine to (location of e) as string',
    '        end try',
    '        set copy (((summary of e) as string) & "' + S + '" & ' +
      '((start date of e) as string) & "' + S + '" & ' +
      '((end date of e) as string) & "' + S + '" & fine & "' + S + '" & (name of c)) to end of righe',
    '      end repeat',
    '    end tell',
    '  end repeat',
    'end tell',
    `set testo to ""`,
    'repeat with r in righe',
    `  set testo to testo & r & "${R}"`,
    'end repeat',
    'return testo'
  ])

  const eventi: Evento[] = []
  for (const riga of fuori.split(R)) {
    const p = riga.split(S)
    if (p.length < 5 || !p[0]?.trim()) continue
    const inizio = new Date(p[1])
    const fine = new Date(p[2])
    if (Number.isNaN(inizio.getTime())) continue
    const minuti = Number.isNaN(fine.getTime()) ? undefined : Math.round((fine.getTime() - inizio.getTime()) / 60000)
    eventi.push({
      titolo: p[0].trim(),
      inizio: inizio.toISOString(),
      ...(minuti && minuti > 0 ? { minuti } : {}),
      ...(p[3]?.trim() ? { dove: p[3].trim() } : {}),
      calendario: p[4]?.trim() || undefined
    })
  }
  return eventi.sort((a, b) => a.inizio.localeCompare(b.inizio)).slice(0, 60)
}

/** I calendari che ci sono, in ordine: il primo è quello predefinito. */
export async function calendari(): Promise<string[]> {
  const fuori = await osascript([
    'tell application "Calendar" to get name of every calendar'
  ])
  return fuori.split(', ').map(s => s.trim()).filter(Boolean)
}

/**
 * Una data come la capisce AppleScript, senza passare per il testo.
 *
 * `date "03/09/2026"` è ambiguo — il tre settembre o il nove marzo, dipende da
 * come è impostato il Mac — e il modo in cui si scopre di aver sbagliato è una
 * riunione segnata a sei mesi di distanza. Impostare i campi uno per uno non è
 * ambiguo in nessuna lingua.
 */
function comeData(nome: string, d: Date): string[] {
  return [
    `set ${nome} to current date`,
    `set day of ${nome} to 1`,
    `set year of ${nome} to ${d.getFullYear()}`,
    `set month of ${nome} to ${d.getMonth() + 1}`,
    `set day of ${nome} to ${d.getDate()}`,
    `set hours of ${nome} to ${d.getHours()}`,
    `set minutes of ${nome} to ${d.getMinutes()}`,
    `set seconds of ${nome} to ${d.getSeconds()}`
  ]
}

/**
 * Quando: letto come ora locale, non come UTC.
 *
 * «2026-09-03T15:00» senza fuso vuol dire le tre del pomeriggio *qui*. Passarlo
 * a `new Date()` così com'è lo fa leggere come UTC in certi casi, e l'evento
 * finisce spostato di due ore — l'errore più fastidioso possibile, perché
 * l'evento c'è e sembra giusto.
 */
export function quando(iso: string): Date {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?)?$/)
  if (!m) throw new Error('Non ho capito la data.')
  const [y,mo,d,h,mi,se] = [Number(m[1]),Number(m[2]),Number(m[3]),Number(m[4] ?? 9),Number(m[5] ?? 0),Number(m[6] ?? 0)]
  const check = new Date(Date.UTC(y,mo-1,d,h,mi,se))
  if (y < 1900 || check.getUTCFullYear() !== y || check.getUTCMonth() !== mo-1 || check.getUTCDate() !== d || h>23 || mi>59 || se>59) throw new Error('Data non valida.')
  const date = m[7] ? new Date(iso.replace(' ', 'T')) : new Date(y,mo-1,d,h,mi,se)
  if (!Number.isFinite(date.getTime()) || (!m[7] && (date.getHours() !== h || date.getDate() !== d))) throw new Error('Ora non valida nel fuso locale.')
  return date
}

/** Stable per-task markers make partial batches recoverable without duplicates.
 * Every event is read back before success; a script is not a transaction. */
export type ProvaAgenda = {id:string; verificato:true}
const inCorso = new Map<string,Promise<ProvaAgenda[]>>()
export async function aggiungiVerificati(eventi:Evento[], operazione:string, predefinito?:string, run=osascript):Promise<ProvaAgenda[]> {
  vietato('agenda.aggiungiVerificati')
  if (!eventi.length || eventi.length>50 || !operazione.trim()) throw new Error('Invalid calendar operation.')
  const key=createHash('sha256').update(operazione+'\0'+JSON.stringify(eventi)).digest('hex')
  if(inCorso.has(key))return inCorso.get(key)!
  const promise=(async()=>{
    const righe=['set prove to ""','tell application "Calendar"']
    eventi.forEach((e,i)=>{
      if(!e.titolo?.trim() || !Number.isFinite(e.minuti ?? 60) || (e.minuti ?? 60)<5 || (e.minuti ?? 60)>10080) throw new Error('Invalid event title or duration.')
      const start=quando(e.inizio),end=new Date(start.getTime()+(e.minuti ?? 60)*60_000)
      const marker='[Myynd:'+key+':'+i+']',calendar=e.calendario || predefinito
      righe.push(...comeData('inizio',start),...comeData('fine',end),
        calendar ? `tell calendar "${fuga(calendar)}"` : 'tell calendar 1',
        `set trovati to every event whose description contains "${marker}"`,
        'if (count of trovati) > 1 then error "Duplicate calendar proof"',
        'if (count of trovati) = 0 then',
        `set ev to make new event with properties {summary:"${fuga(e.titolo)}", start date:inizio, end date:fine, location:"${fuga(e.dove || '')}", description:"${fuga((e.note ? e.note+'\n' : '')+marker)}"}`,
        'else','set ev to item 1 of trovati','end if',
        `if (summary of ev as string) is not "${fuga(e.titolo)}" then error "Calendar event changed"`,
        'if (start date of ev) is not inizio then error "Calendar start mismatch"',
        'if (end date of ev) is not fine then error "Calendar end mismatch"',
        `if (location of ev as string) is not "${fuga(e.dove || '')}" then error "Calendar location mismatch"`,
        'set prove to prove & (uid of ev as string) & linefeed','end tell')
    })
    righe.push('end tell','return prove')
    const ids=(await run(righe)).split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
    if(ids.length!==eventi.length || new Set(ids).size!==ids.length)throw new Error('Calendar did not verify every event. Review Calendar before retrying.')
    return ids.map(id=>({id,verificato:true as const}))
  })()
  inCorso.set(key,promise)
  try{return await promise}finally{inCorso.delete(key)}
}
export async function aggiungi(eventi:Evento[],predefinito?:string):Promise<number>{
  vietato('agenda.aggiungi')
  if(!eventi.length)return 0
  return (await aggiungiVerificati(eventi,'legacy:'+JSON.stringify(eventi),predefinito)).length
}

// — la settimana: il Calendario del Mac e l'agenda iCal, in una vista sola —
//
// Quello che sta qui sopra scrive in agenda da una proposta della lista. Quello
// che sta qui sotto serve alla vista della settimana: i calendari e gli eventi
// di un intervallo, da due fonti che non si somigliano. Il Calendario del Mac
// (`agenda-apple.ts`) si legge e si scrive; l'agenda collegata con un
// indirizzo iCal sta già nell'indice e si legge da lì, e basta. Per chi guarda
// è una settimana: le due fonti si distinguono per `fonte`, e per il fatto che
// una si può trascinare e l'altra no.

export type Calendario = apple.Calendario
export type EventoAgenda = apple.EventoAgenda
export type RispostaAgenda = {
  calendari: Calendario[]
  eventi: EventoAgenda[]
  /** Vero quando il Calendario del Mac risponde: allora si può creare, spostare, cancellare. */
  scrivibile: boolean
  /** Perché il Mac non risponde, quando non risponde: la frase da mostrare, già nel dizionario. */
  avviso?: string
}
export { statoDi, GuaioAgenda, PREDEFINITO } from './agenda-apple.ts'

/** L'agenda iCal come calendario della vista: uno solo, con il colore del gruppo «agenda». */
export const ID_ICAL = 'ical'
const COLORE_ICAL = '#8E6FB8'

/** Quanto può essere larga una finestra. Oltre l'anno non è una vista, è un'esportazione. */
const FINESTRA_MAX = 366 * 864e5

const ordina = (x: EventoAgenda, y: EventoAgenda) =>
  x.inizio.localeCompare(y.inizio) || x.titolo.localeCompare(y.titolo) || x.id.localeCompare(y.id)

/**
 * La risposta della vista, messa insieme da quello che le due fonti hanno dato.
 *
 * Pura, e per questo provabile senza un Mac: le rotte le passano quello che
 * hanno ricevuto. Il Mac che non risponde non è un errore della settimana: è
 * una fonte in meno, e la frase sta in `avviso` perché la vista la dica una
 * volta, in alto, invece di rifiutare anche gli eventi dell'altra.
 */
export function rispostaAgenda(
  mac: { calendari: Calendario[]; eventi: EventoAgenda[] } | { guaio: string },
  ical: { nome: string; eventi: EventoAgenda[] } | null
): RispostaAgenda {
  const calendari: Calendario[] = []
  const eventi: EventoAgenda[] = []
  let scrivibile = false
  let avviso: string | undefined
  if ('guaio' in mac) {
    avviso = mac.guaio
  } else {
    calendari.push(...mac.calendari)
    eventi.push(...mac.eventi)
    scrivibile = true
  }
  if (ical) {
    calendari.push({ id: ID_ICAL, nome: ical.nome, colore: COLORE_ICAL, scrivibile: false, fonte: 'ical' })
    eventi.push(...ical.eventi)
  }
  eventi.sort(ordina)
  return { calendari, eventi, scrivibile, ...(avviso ? { avviso } : {}) }
}

/** Un istante scritto bene, o niente. */
function istanteDa(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Da e a, letti dalla query: senza, i prossimi sette giorni. */
export function finestra(daIso: string, aIso: string): { da: Date; a: Date } {
  const da = istanteDa(daIso) ?? new Date()
  const a = istanteDa(aIso) ?? new Date(da.getTime() + 7 * 864e5)
  if (a <= da || a.getTime() - da.getTime() > FINESTRA_MAX) throw new apple.GuaioAgenda('Non ho capito la data.', 400)
  return { da, a }
}

/**
 * Gli eventi dell'agenda iCal, dall'indice.
 *
 * L'indice ha solo l'inizio come colonna: si chiede un giorno in più indietro
 * e si scarta dopo, così un impegno cominciato ieri sera che finisce stanotte
 * sta nella settimana giusta. Gli id sono quelli dei documenti («quale, e
 * quando»), quindi stabili, e la vista li usa solo per aprire.
 */
export function eventiIcal(da: Date, a: Date): { nome: string; eventi: EventoAgenda[] } | null {
  const c = leggiConfig().calendario
  if (!c?.url) return null
  const docs = store.eventi(new Date(da.getTime() - 864e5).toISOString(), a.toISOString(), 500)
  const eventi: EventoAgenda[] = []
  for (const d of docs) {
    const x = daDocumento(d)
    if (!x || x.fine <= da || x.inizio >= a) continue
    eventi.push({
      id: d.id, calendario: ID_ICAL, titolo: d.titolo,
      inizio: x.inizio.toISOString(), fine: x.fine.toISOString(), tuttoIlGiorno: x.tuttoIlGiorno,
      luogo: x.luogo, note: x.note, fonte: 'ical'
    })
  }
  return { nome: c.nome?.trim() || 'Calendario', eventi }
}

/** La settimana intera: il Mac se risponde, l'agenda iCal se c'è. */
export async function leggiAgenda(daIso: string, aIso: string): Promise<RispostaAgenda> {
  const { da, a } = finestra(daIso, aIso)
  let mac: { calendari: Calendario[]; eventi: EventoAgenda[] } | { guaio: string }
  if (!apple.disponibile()) {
    mac = { guaio: apple.NON_QUI }
  } else {
    try {
      const [calendari, eventi] = await Promise.all([apple.calendari(), apple.eventi(da, a)])
      mac = { calendari, eventi }
    } catch (e) {
      mac = { guaio: e instanceof Error ? e.message : String(e) }
    }
  }
  return rispostaAgenda(mac, eventiIcal(da, a))
}

// — scrivere: quello che arriva dal browser, controllato prima di passarlo al Mac —

const TITOLO_MAX = 300
const LUOGO_MAX = 500
const NOTE_MAX = 4000

/** Mezzanotte UTC del giorno di calendario di quell'istante: la convenzione dei giorni interi. */
const aMezzanotteUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

function testoCorto(v: unknown, massimo: number): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v).trim().slice(0, massimo)
}

/**
 * I due istanti di un evento, letti e rimessi in ordine.
 *
 * Un giorno intero sta a mezzanotte UTC e finisce il giorno dopo: se il
 * browser manda le 15 di quel giorno, o una fine uguale all'inizio, si
 * aggiusta invece di rifiutare, perché è chiaro cosa voleva dire. Un'ora di
 * fine prima dell'inizio no: quella non si può indovinare.
 */
function istanti(inizioV: unknown, fineV: unknown, tuttoIlGiorno: boolean): { inizio: string; fine: string } {
  const inizio = istanteDa(inizioV)
  const fine = istanteDa(fineV)
  if (!inizio || !fine) throw new apple.GuaioAgenda('Non ho capito la data.', 400)
  if (tuttoIlGiorno) {
    const i = aMezzanotteUtc(inizio)
    let f = aMezzanotteUtc(fine)
    if (f <= i) f = new Date(i.getTime() + 864e5)
    return { inizio: i.toISOString(), fine: f.toISOString() }
  }
  if (fine <= inizio) throw new apple.GuaioAgenda('La fine deve venire dopo l’inizio.', 400)
  return { inizio: inizio.toISOString(), fine: fine.toISOString() }
}

export function nuovoEvento(corpo: unknown): apple.NuovoEvento {
  const b = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
  const titolo = testoCorto(b.titolo, TITOLO_MAX)
  if (!titolo) throw new apple.GuaioAgenda('Serve un titolo.', 400)
  const tuttoIlGiorno = !!b.tuttoIlGiorno
  const { inizio, fine } = istanti(b.inizio, b.fine, tuttoIlGiorno)
  return {
    titolo, inizio, fine, tuttoIlGiorno,
    calendario: testoCorto(b.calendario, 200) || undefined,
    luogo: testoCorto(b.luogo, LUOGO_MAX),
    note: testoCorto(b.note, NOTE_MAX)
  }
}

/**
 * Un ritocco: solo i campi che ci sono.
 *
 * Con tutti e due gli istanti si controlla l'ordine qui; con uno solo lo
 * controlla Calendario, che conosce l'altro. `tuttoIlGiorno` da solo vale:
 * lo script rilegge gli istanti che ha e li rimette sulla convenzione giusta.
 */
export function ritocco(corpo: unknown): apple.Ritocco {
  const b = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
  const fuori: apple.Ritocco = {}
  if (b.titolo !== undefined) {
    const t = testoCorto(b.titolo, TITOLO_MAX)
    if (!t) throw new apple.GuaioAgenda('Serve un titolo.', 400)
    fuori.titolo = t
  }
  if (b.tuttoIlGiorno !== undefined) fuori.tuttoIlGiorno = !!b.tuttoIlGiorno
  if (b.inizio !== undefined && b.fine !== undefined) {
    Object.assign(fuori, istanti(b.inizio, b.fine, !!b.tuttoIlGiorno))
  } else {
    for (const k of ['inizio', 'fine'] as const) {
      if (b[k] === undefined) continue
      const d = istanteDa(b[k])
      if (!d) throw new apple.GuaioAgenda('Non ho capito la data.', 400)
      fuori[k] = (b.tuttoIlGiorno ? aMezzanotteUtc(d) : d).toISOString()
    }
  }
  if (b.luogo !== undefined) fuori.luogo = testoCorto(b.luogo, LUOGO_MAX) ?? ''
  if (b.note !== undefined) fuori.note = testoCorto(b.note, NOTE_MAX) ?? ''
  if (!Object.keys(fuori).length) throw new apple.GuaioAgenda('Dimmi cosa vuoi cambiare.', 400)
  return fuori
}

export async function creaEvento(corpo: unknown): Promise<EventoAgenda> {
  vietato('agenda.creaEvento')
  return apple.crea(nuovoEvento(corpo))
}

/** Gli id dell'agenda iCal sono documenti dell'indice: si leggono, non si toccano. */
const soloLettura = (id: string) => id === ID_ICAL || id.startsWith('calendario:')

export async function modificaEvento(id: string, corpo: unknown): Promise<EventoAgenda> {
  vietato('agenda.modificaEvento')
  if (soloLettura(id)) throw new apple.GuaioAgenda('Questa agenda si legge e basta.', 400)
  return apple.modifica(id, ritocco(corpo))
}

export async function eliminaEvento(id: string): Promise<void> {
  vietato('agenda.eliminaEvento')
  if (soloLettura(id)) throw new apple.GuaioAgenda('Questa agenda si legge e basta.', 400)
  await apple.elimina(id)
}
