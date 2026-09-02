// Il calendario letto da un indirizzo iCal.
//
// Tutto quello che può andare storto qui va storto **in silenzio**: una riunione
// spostata di due ore perché il fuso non è stato letto, una descrizione tagliata
// a metà perché il file spezza le righe lunghe, una riunione settimanale che
// compare una volta sola nel 2023. Nessuno di questi casi produce un errore.
// L'agenda si limita a dire cose false, e chi la legge non ha modo di saperlo.
//
// Per questo le prove qui sotto sono tutte sulla stessa domanda: quello che
// esce è quello che c'è davvero in agenda?
//
//   node --test server/calendario.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-calendario-'))
process.env.MYYND_DATI = CASA

const cal = await import('./connettori/calendario.ts')
const store = await import('./store.ts')

after(() => {
  cal.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const ics = (dentro: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//prova//IT\r\nX-WR-CALNAME:Agenda di prova\r\n${dentro}\r\nEND:VCALENDAR\r\n`

const evento = (righe: string) => ics(`BEGIN:VEVENT\r\n${righe}\r\nEND:VEVENT`)

/** Una finestra larga attorno a una data, per non dipendere da quando gira la prova. */
const attorno = (iso: string, giorni = 400) => ({
  da: new Date(Date.parse(iso) - giorni * 864e5),
  a: new Date(Date.parse(iso) + giorni * 864e5)
})

// — il formato —

test('una riga lunga spezzata dal formato torna intera', () => {
  /*
   * iCalendar spezza a 75 ottetti e fa cominciare la continuazione con uno
   * spazio. Chi legge riga per riga trova la descrizione tagliata a metà, e
   * nessun errore: metà del testo semplicemente non è più una proprietà.
   */
  const f = evento(
    'UID:uno\r\nDTSTART:20260910T090000Z\r\nSUMMARY:Riunione\r\n' +
    'DESCRIPTION:Portare il preventivo aggiornato e le\r\n  ultime tre fatture del fornitore'
  )
  const { eventi } = cal.leggiIcal(f, ...Object.values(attorno('2026-09-10')) as [Date, Date])
  assert.equal(eventi.length, 1)
  assert.equal(eventi[0]!.note, 'Portare il preventivo aggiornato e le ultime tre fatture del fornitore')
})

test('le virgole e gli a capo scritti con la barra tornano quello che erano', () => {
  const f = evento('UID:due\r\nDTSTART:20260910T090000Z\r\nSUMMARY:Marco\\, Anna e Luca\r\nDESCRIPTION:Primo punto\\nSecondo punto')
  const { eventi } = cal.leggiIcal(f, ...Object.values(attorno('2026-09-10')) as [Date, Date])
  assert.equal(eventi[0]!.titolo, 'Marco, Anna e Luca')
  assert.equal(eventi[0]!.note, 'Primo punto\nSecondo punto')
})

test('il nome dell’agenda si legge, e non si confonde con un evento', () => {
  const f = evento('UID:tre\r\nDTSTART:20260910T090000Z\r\nSUMMARY:Una cosa')
  const { nome } = cal.leggiIcal(f, ...Object.values(attorno('2026-09-10')) as [Date, Date])
  assert.equal(nome, 'Agenda di prova')
})

// — le date —

test('un’ora con il fuso è quell’ora lì, non la stessa cifra in UTC', () => {
  /*
   * È l'errore che sposta ogni riunione italiana di due ore in estate. Le 9:00
   * a Roma il 10 settembre sono le 7:00 UTC, non le 9:00 UTC.
   */
  const f = evento('UID:fuso\r\nDTSTART;TZID=Europe/Rome:20260910T090000\r\nSUMMARY:Caffè')
  const { eventi } = cal.leggiIcal(f, ...Object.values(attorno('2026-09-10')) as [Date, Date])
  assert.equal(eventi[0]!.inizio.toISOString(), '2026-09-10T07:00:00.000Z')
})

test('e d’inverno lo scarto è un’ora, non due: il fuso lo sa da sé', () => {
  const f = evento('UID:inverno\r\nDTSTART;TZID=Europe/Rome:20260115T090000\r\nSUMMARY:Caffè')
  const { eventi } = cal.leggiIcal(f, ...Object.values(attorno('2026-01-15')) as [Date, Date])
  assert.equal(eventi[0]!.inizio.toISOString(), '2026-01-15T08:00:00.000Z')
})

test('una data senza ora è un giorno intero, non mezzanotte', () => {
  const f = evento('UID:tutto\r\nDTSTART;VALUE=DATE:20260910\r\nSUMMARY:Ferie')
  const { eventi } = cal.leggiIcal(f, ...Object.values(attorno('2026-09-10')) as [Date, Date])
  assert.equal(eventi[0]!.tuttoIlGiorno, true)
})

test('un fuso che non esiste non fa cadere tutto il calendario', () => {
  const f = evento('UID:strano\r\nDTSTART;TZID=Mars/Olympus:20260910T090000\r\nSUMMARY:Caffè')
  const { eventi } = cal.leggiIcal(f, ...Object.values(attorno('2026-09-10')) as [Date, Date])
  assert.equal(eventi.length, 1)
})

// — le ricorrenze —

test('una riunione settimanale compare tutte le settimane, non una volta sola', () => {
  const f = evento('UID:sett\r\nDTSTART;TZID=Europe/Rome:20260907T100000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4\r\nSUMMARY:Punto della settimana')
  const { eventi } = cal.leggiIcal(f, new Date('2026-09-01'), new Date('2026-10-15'))
  assert.equal(eventi.length, 4)
  assert.deepEqual(eventi.map(e => e.inizio.toISOString().slice(0, 10)),
    ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
})

test('UNTIL ferma la serie, e la finestra la ferma comunque', () => {
  const f = evento('UID:fino\r\nDTSTART:20260907T080000Z\r\nRRULE:FREQ=DAILY;UNTIL=20260910T080000Z\r\nSUMMARY:Ogni giorno')
  const { eventi } = cal.leggiIcal(f, new Date('2026-09-01'), new Date('2026-12-31'))
  assert.equal(eventi.length, 4)
})

test('un giorno tolto dalla serie non compare', () => {
  const f = evento(
    'UID:tolto\r\nDTSTART:20260907T080000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\n' +
    'EXDATE:20260908T080000Z\r\nSUMMARY:Ogni giorno'
  )
  const { eventi } = cal.leggiIcal(f, new Date('2026-09-01'), new Date('2026-12-31'))
  assert.deepEqual(eventi.map(e => e.inizio.toISOString().slice(0, 10)), ['2026-09-07', '2026-09-09'])
})

test('quel martedì la riunione è a un’altra ora: l’eccezione vince, e non si sdoppia', () => {
  /*
   * Le eccezioni arrivano come VEVENT a parte con lo stesso UID. Senza questo,
   * l'agenda mostra due volte la stessa riunione a due ore diverse — che è
   * peggio che mostrarla all'ora sbagliata, perché non si sa a quale credere.
   */
  const f = ics(
    'BEGIN:VEVENT\r\nUID:ecc\r\nDTSTART:20260907T080000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Punto\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nUID:ecc\r\nRECURRENCE-ID:20260908T080000Z\r\nDTSTART:20260908T140000Z\r\nSUMMARY:Punto (spostato)\r\nEND:VEVENT'
  )
  const { eventi } = cal.leggiIcal(f, new Date('2026-09-01'), new Date('2026-12-31'))
  assert.equal(eventi.length, 3)
  const otto = eventi.filter(e => e.inizio.toISOString().startsWith('2026-09-08'))
  assert.equal(otto.length, 1)
  assert.equal(otto[0]!.titolo, 'Punto (spostato)')
  assert.equal(otto[0]!.inizio.toISOString(), '2026-09-08T14:00:00.000Z')
})

test('una regola che non sappiamo srotolare torna una volta, non zero e non mille', () => {
  const f = evento('UID:strana\r\nDTSTART:20260907T080000Z\r\nRRULE:FREQ=HOURLY;INTERVAL=3\r\nSUMMARY:Boh')
  const { eventi } = cal.leggiIcal(f, new Date('2026-09-01'), new Date('2026-12-31'))
  assert.equal(eventi.length, 1)
})

test('un evento annullato non è un evento', () => {
  const f = evento('UID:morto\r\nDTSTART:20260910T090000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Non si fa più')
  const { eventi } = cal.leggiIcal(f, ...Object.values(attorno('2026-09-10')) as [Date, Date])
  assert.equal(eventi.length, 0)
})

test('quello che sta fuori dalla finestra non entra nell’indice', () => {
  const f = evento('UID:vecchio\r\nDTSTART:20200910T090000Z\r\nSUMMARY:Tre anni fa')
  const { eventi } = cal.leggiIcal(f, new Date('2026-09-01'), new Date('2026-12-31'))
  assert.equal(eventi.length, 0)
})

// — l'indirizzo —

test('webcal è https con un altro nome, e non si rifiuta', () => {
  const r = cal.indirizzo('webcal://calendar.google.com/calendar/ical/x/basic.ics')
  assert.equal(r.ok, true)
  assert.match(r.ok ? r.url : '', /^https:\/\//)
})

test('quello che non è un indirizzo lo si dice, con la frase giusta', () => {
  const r = cal.indirizzo('la mia agenda')
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.errore, /non è un indirizzo/)
})

// — dalla rete all'indice —

test('un evento diventa un documento con il posto e l’ora dentro', async () => {
  const f = evento(
    'UID:doc\r\nDTSTART;TZID=Europe/Rome:20260910T150000\r\nDTEND;TZID=Europe/Rome:20260910T160000\r\n' +
    'SUMMARY:Consegna\r\nLOCATION:Via Torino 4\r\nORGANIZER;CN=Marco:mailto:marco@esempio.it'
  )
  cal.usaRete((async () => new Response(f, { headers: { 'content-type': 'text/calendar' } })) as typeof fetch)
  const e = await cal.sincronizza({ url: 'https://esempio.test/a.ics', giorni: 365 })
  assert.equal(e.docs.length, 1)
  const d = e.docs[0]!
  assert.equal(d.fonte, 'calendario')
  assert.equal(d.titolo, 'Consegna')
  // il posto sta anche fuori dal corpo: `agenda.leggi` lo legge da lì
  assert.equal(d.percorso, 'Via Torino 4')
  assert.match(d.corpo, /Via Torino 4/)
  assert.match(d.autore ?? '', /marco@esempio\.it/)
})

test('due occorrenze della stessa riunione sono due documenti, non uno', () => {
  /*
   * Il difetto che si sarebbe visto solo guardando l'indice: con `calendario:<uid>`
   * come identità, il punto del lunedì sovrascrive quello del lunedì prima, e
   * di una riunione settimanale nell'indice ne resta una sola.
   */
  const f = evento('UID:stesso\r\nDTSTART:20260907T080000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Punto')
  const { eventi } = cal.leggiIcal(f, new Date('2026-09-01'), new Date('2026-12-31'))
  const ids = eventi.map(e => `calendario:${e.uid}:${e.inizio.getTime()}`)
  assert.equal(new Set(ids).size, 3)
})

test('a quell’indirizzo non c’è un calendario: si dice dove cercarlo', async () => {
  cal.usaRete((async () => new Response('<html>ciao</html>')) as typeof fetch)
  const r = await cal.prova({ url: 'https://esempio.test/a.ics' })
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.errore, /Indirizzo privato in formato iCal/)
})

test('un indirizzo scaduto manda a rigenerarlo, non a riprovare', async () => {
  cal.usaRete((async () => new Response('', { status: 401 })) as typeof fetch)
  const r = await cal.prova({ url: 'https://esempio.test/a.ics' })
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.errore, /rigeneralo/)
})
