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
  if(!eventi.length)return 0
  return (await aggiungiVerificati(eventi,'legacy:'+JSON.stringify(eventi),predefinito)).length
}
