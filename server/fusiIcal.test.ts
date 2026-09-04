// L'agenda, un'ora avanti in quattro modi diversi.
//
// Nessuno dei quattro dà un errore, e questa è tutta la ragione per cui questo
// file esiste. Un `TZID` di Outlook che non è un nome IANA, una serie
// giornaliera contata a colpi di ventiquattro ore, «ogni lunedì» rimesso in ora
// con l'orologio della macchina, e il testo dell'evento scritto senza dire in
// che fuso: quattro strade per far dire all'agenda un orario che non è quello,
// e per farlo ripetere al modello che quel testo lo legge e lo cita.
//
// Le prove qui sotto sono tutte sulla stessa domanda: alle 15 a Roma, cosa
// dice Myynd?
//
//   node --test server/fusiIcal.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-fusi-'))
process.env.MYYND_DATI = CASA

const cal = await import('./connettori/calendario.ts')
const fusi = await import('./connettori/fusiIcal.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')

// il fuso di chi usa si dichiara: senza, questa prova direbbe cose diverse
// sulla macchina di qualcun altro — che è esattamente il difetto che indaga
cfg.scrivi({ ...cfg.leggi(), fuso: 'Europe/Rome' })

after(() => {
  cal.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const ics = (dentro: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//prova//IT\r\n${dentro}\r\nEND:VCALENDAR\r\n`
const evento = (righe: string) => ics(`BEGIN:VEVENT\r\n${righe}\r\nEND:VEVENT`)
const finestra = (iso: string, giorni = 400): [Date, Date] =>
  [new Date(Date.parse(iso) - giorni * 864e5), new Date(Date.parse(iso) + giorni * 864e5)]
const quando = (f: string, iso: string) =>
  cal.leggiIcal(f, ...finestra(iso)).eventi.map(e => e.inizio.toISOString())

// — i nomi che Outlook scrive al posto di quelli veri —

test('«W. Europe Standard Time» è un fuso, non un nome che non esiste', () => {
  /*
   * È il caso che sposta di due ore ogni riunione mandata da Outlook. Quel nome
   * non sta nella tabella IANA, `Intl` lo rifiuta, e il vecchio controllo lo
   * mandava nel ramo «ora nuda»: su un contenitore in UTC diventava un'ora UTC.
   */
  const f = evento('UID:w\r\nDTSTART;TZID=W. Europe Standard Time:20260910T090000\r\nSUMMARY:Caffè')
  assert.deepEqual(quando(f, '2026-09-10'), ['2026-09-10T07:00:00.000Z'])
})

test('e lo è anche fra virgolette, come lo scrive davvero', () => {
  const f = evento('UID:w2\r\nDTSTART;TZID="Romance Standard Time":20260115T090000\r\nSUMMARY:Caffè')
  assert.deepEqual(quando(f, '2026-01-15'), ['2026-01-15T08:00:00.000Z'])
})

test('la tabella conosce i posti da cui arriva un invito', () => {
  assert.equal(fusi.daWindows('Pacific Standard Time'), 'America/Los_Angeles')
  assert.equal(fusi.daWindows('India Standard Time'), 'Asia/Kolkata')
  // spazi doppi e maiuscole non fanno differenza: gli esportatori li maltrattano
  assert.equal(fusi.daWindows('  gmt  standard  time '), 'Europe/London')
  assert.equal(fusi.daWindows('Fuso di Marte'), null)
})

test('il TZID di Thunderbird, che è un percorso con dentro un nome vero', () => {
  const f = evento('UID:moz\r\nDTSTART;TZID=/mozilla.org/20050126_1/Europe/Rome:20260910T090000\r\nSUMMARY:Caffè')
  assert.deepEqual(quando(f, '2026-09-10'), ['2026-09-10T07:00:00.000Z'])
})

// — il fuso scritto dentro il file —

const VTIMEZONE =
  'BEGIN:VTIMEZONE\r\nTZID:Fuso della ditta\r\n' +
  'BEGIN:STANDARD\r\nDTSTART:16011025T030000\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\n' +
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\r\nEND:STANDARD\r\n' +
  'BEGIN:DAYLIGHT\r\nDTSTART:16010329T020000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\n' +
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE'

test('un TZID inventato si legge dal VTIMEZONE che il file si porta dietro', () => {
  const f = ics(VTIMEZONE + '\r\nBEGIN:VEVENT\r\nUID:v1\r\n' +
    'DTSTART;TZID=Fuso della ditta:20260910T090000\r\nSUMMARY:Caffè\r\nEND:VEVENT')
  assert.deepEqual(quando(f, '2026-09-10'), ['2026-09-10T07:00:00.000Z'])
})

test('e il VTIMEZONE sa anche quando finisce l’ora legale', () => {
  const f = ics(VTIMEZONE + '\r\nBEGIN:VEVENT\r\nUID:v2\r\n' +
    'DTSTART;TZID=Fuso della ditta:20260115T090000\r\nSUMMARY:Caffè\r\nEND:VEVENT')
  assert.deepEqual(quando(f, '2026-01-15'), ['2026-01-15T08:00:00.000Z'])
})

test('un VTIMEZONE senza ora legale è uno scarto fisso, e basta', () => {
  const fisso =
    'BEGIN:VTIMEZONE\r\nTZID:Sempre uguale\r\n' +
    'BEGIN:STANDARD\r\nDTSTART:16010101T000000\r\nTZOFFSETFROM:+0530\r\nTZOFFSETTO:+0530\r\n' +
    'END:STANDARD\r\nEND:VTIMEZONE'
  const f = ics(fisso + '\r\nBEGIN:VEVENT\r\nUID:v3\r\n' +
    'DTSTART;TZID=Sempre uguale:20260910T090000\r\nSUMMARY:Caffè\r\nEND:VEVENT')
  assert.deepEqual(quando(f, '2026-09-10'), ['2026-09-10T03:30:00.000Z'])
})

// — il cambio d'ora —

test('«ogni giorno alle 9» resta alle 9 anche la notte che dura venticinque ore', () => {
  /*
   * In Europa l'ora legale finisce alle 3 del 25 ottobre 2026. Con il vecchio
   * conto — più ventiquattro ore tonde — il 25 e il 26 la riunione scivolava
   * alle 8, e ci restava fino al cambio dopo. Non un errore: una serie intera
   * spostata di un'ora, in silenzio, per cinque mesi.
   */
  const f = evento('UID:dst\r\nDTSTART;TZID=Europe/Rome:20261024T090000\r\n' +
    'RRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Il punto')
  assert.deepEqual(quando(f, '2026-10-25'), [
    '2026-10-24T07:00:00.000Z',  // ancora ora legale: le 9 sono le 7 UTC
    '2026-10-25T08:00:00.000Z',  // ora solare: le 9 sono le 8 UTC
    '2026-10-26T08:00:00.000Z'
  ])
})

test('e «ogni lunedì» pure, che prima rimetteva l’ora con l’orologio della macchina', () => {
  const f = evento('UID:sett\r\nDTSTART;TZID=Europe/Rome:20261019T090000\r\n' +
    'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3\r\nSUMMARY:Il punto')
  assert.deepEqual(quando(f, '2026-10-25'), [
    '2026-10-19T07:00:00.000Z',
    '2026-10-26T08:00:00.000Z',
    '2026-11-02T08:00:00.000Z'
  ])
})

test('anche a marzo, quando la notte ne dura ventitré', () => {
  // l'ora legale comincia alle 2 del 29 marzo 2026
  const f = evento('UID:marzo\r\nDTSTART;TZID=Europe/Rome:20260328T090000\r\n' +
    'RRULE:FREQ=DAILY;COUNT=2\r\nSUMMARY:Il punto')
  assert.deepEqual(quando(f, '2026-03-28'), [
    '2026-03-28T08:00:00.000Z',
    '2026-03-29T07:00:00.000Z'
  ])
})

test('un mese e un anno più in là sono lo stesso orario, non lo stesso scarto', () => {
  const mese = evento('UID:m\r\nDTSTART;TZID=Europe/Rome:20260915T090000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=3\r\nSUMMARY:Fattura')
  assert.deepEqual(quando(mese, '2026-10-15'), [
    '2026-09-15T07:00:00.000Z',
    '2026-10-15T07:00:00.000Z',
    '2026-11-15T08:00:00.000Z'   // novembre è già ora solare
  ])
})

// — quello che finisce sotto gli occhi, e dentro l'indice —

test('il corpo dell’evento dice l’ora di chi legge, non quella del contenitore', async () => {
  /*
   * Il difetto che si vede solo leggendo un documento: l'ora nel testo la
   * scriveva `Intl` senza `timeZone`, cioè nell'ora della macchina. Su un
   * server in UTC, una consegna alle 15 a Roma diventava «13:00» — e quel
   * «13:00» è quello che il modello legge e ripete a chi ha chiesto.
   */
  const f = evento(
    'UID:corpo\r\nDTSTART;TZID=Europe/Rome:20260910T150000\r\nDTEND;TZID=Europe/Rome:20260910T160000\r\n' +
    'SUMMARY:Consegna\r\nLOCATION:Via Torino 4'
  )
  cal.usaRete((async () => new Response(f, { headers: { 'content-type': 'text/calendar' } })) as typeof fetch)
  const e = await cal.sincronizza({ url: 'https://esempio.test/a.ics', giorni: 365 })
  assert.equal(e.docs.length, 1)
  assert.match(e.docs[0]!.corpo, /15:00/)
  assert.doesNotMatch(e.docs[0]!.corpo, /13:00/)
})

test('un giorno intero resta quel giorno, ovunque lo si legga', async () => {
  // sta a mezzanotte UTC e va scritto in UTC: riscritto in un fuso a ovest
  // diventerebbe il giorno prima
  const f = evento('UID:ferie\r\nDTSTART;VALUE=DATE:20260910\r\nSUMMARY:Ferie')
  cal.usaRete((async () => new Response(f, { headers: { 'content-type': 'text/calendar' } })) as typeof fetch)
  const e = await cal.sincronizza({ url: 'https://esempio.test/a.ics', giorni: 365 })
  assert.match(e.docs[0]!.corpo, /10/)
  assert.doesNotMatch(e.docs[0]!.corpo, /\b9\b/)
})
