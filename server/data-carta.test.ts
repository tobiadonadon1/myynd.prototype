// Le date di una carta: scritte assolute alla nascita, lette relative a oggi.
//
// Il caso che regge tutto: una carta nata lunedì 21 settembre 2026 alle 20:00
// con «domani 9:30» si salva «22 set 9:30»; il lunedì sera la pillola dice
// «Domani 9:30», il martedì «Oggi 9:30», e il mercoledì la carta scade
// (quello lo prova `scadi.test.ts`).
//
//   node --test server/data-carta.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-data-carta-'))
process.env.MYYND_DATI = CASA
writeFileSync(join(CASA, 'config.json'), JSON.stringify({ lingua: 'en' }))
const cfg = await import('./config.ts')
const { scadenzaDi, assoluta, pillolaDi, assoluto, conRelativi, dataNel, oraNel } = await import('./data-carta.ts')
after(() => { delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

/** Lunedì 21 settembre 2026, le otto di sera. */
const LUNEDI_SERA = new Date(2026, 8, 21, 20, 0)
const MARTEDI = new Date(2026, 8, 22, 9, 0)
const MERCOLEDI = new Date(2026, 8, 23, 8, 0)
const it = () => cfg.scrivi({ lingua: 'it' })
const en = () => cfg.scrivi({ lingua: 'en' })

test('scadenzaDi: ISO, «entro venerdì» rispetto a un lunedì, «26 set», «Sep 26», e niente per «nessuna fretta»', () => {
  en()
  assert.deepEqual(scadenzaDi('due 2026-10-03', LUNEDI_SERA), new Date(2026, 9, 3))
  assert.deepEqual(scadenzaDi('entro venerdì', LUNEDI_SERA), new Date(2026, 8, 25))
  assert.deepEqual(scadenzaDi('26 set', LUNEDI_SERA), new Date(2026, 8, 26))
  assert.deepEqual(scadenzaDi('Sep 26 9:30', LUNEDI_SERA), new Date(2026, 8, 26))
  assert.deepEqual(scadenzaDi('domani 9:30', LUNEDI_SERA.toISOString()), new Date(2026, 8, 22), 'la nascita si passa anche come ISO')
  assert.equal(scadenzaDi('nessuna fretta', LUNEDI_SERA), null)
  assert.equal(scadenzaDi('No rush', LUNEDI_SERA), null)
  assert.equal(scadenzaDi('This week', LUNEDI_SERA), null)
  assert.equal(scadenzaDi('', LUNEDI_SERA), null)
  assert.equal(scadenzaDi(null, LUNEDI_SERA), null)
  assert.equal(scadenzaDi('26 set', 'non è una data'), null)
})

test('assoluta: «domani 9:30» nato lunedì sera diventa «22 set 9:30»; «entro venerdì» «entro 25 set»; in inglese «by Sep 22»', () => {
  it()
  assert.equal(assoluta('domani 9:30', LUNEDI_SERA), '22 set 9:30')
  assert.equal(assoluta('entro venerdì', LUNEDI_SERA), 'entro 25 set')
  assert.equal(assoluta('questa settimana', LUNEDI_SERA), 'Questa settimana')
  assert.equal(assoluta('senza fretta, quando puoi', LUNEDI_SERA), 'Nessuna fretta')
  assert.equal(assoluta('', LUNEDI_SERA), '')
  assert.equal(assoluta('appena può', LUNEDI_SERA), 'appena può', 'quello che il codice non sa leggere resta com’è')
  en()
  assert.equal(assoluta('by tomorrow', LUNEDI_SERA), 'by Sep 22')
  assert.equal(assoluta('Tuesday Sep 22, 2026, 9:30am. 10am Eastern Time', LUNEDI_SERA), 'Sep 22 9:30')
  assert.equal(assoluta('tomorrow 9:30', LUNEDI_SERA), 'Sep 22 9:30')
  assert.equal(assoluta('no rush', LUNEDI_SERA), 'No rush')
  assert.equal(assoluta('3 October', LUNEDI_SERA), 'Oct 3')
})

test('pillolaDi: nata lunedì sera con «domani 9:30», il lunedì dice «Domani 9:30» e il martedì «Oggi 9:30»', () => {
  it()
  const nata = LUNEDI_SERA.toISOString()
  assert.equal(pillolaDi('22 set 9:30', nata, LUNEDI_SERA), 'Domani 9:30')
  assert.equal(pillolaDi('22 set 9:30', nata, MARTEDI), 'Oggi 9:30')
  // una pillola di prima, relativa: si scioglie rispetto alla nascita, non a oggi
  assert.equal(pillolaDi('Domani 9:30', nata, MARTEDI), 'Oggi 9:30')
  assert.equal(pillolaDi('entro 25 set', nata, MARTEDI), 'Entro venerdì')
  assert.equal(pillolaDi('3 ott', nata, MARTEDI), '3 ott', 'a più di sei giorni resta la data')
  assert.equal(pillolaDi('Nessuna fretta', nata, MARTEDI), 'Nessuna fretta')
  assert.equal(pillolaDi('appena può', nata, MARTEDI), 'appena può')
  assert.equal(pillolaDi('', nata, MARTEDI), '')
  assert.equal(pillolaDi(null, nata, MARTEDI), '')
  // una data passata resta scritta com’è: la carta sta scadendo
  assert.equal(pillolaDi('22 set 9:30', nata, MERCOLEDI), '22 set 9:30')
  en()
  assert.equal(pillolaDi('Sep 22 9:30', nata, LUNEDI_SERA), 'Tomorrow 9:30')
  assert.equal(pillolaDi('Sep 22 9:30', nata, MARTEDI), 'Today 9:30')
  assert.equal(pillolaDi('by Sep 25', nata, MARTEDI), 'By Friday')
  assert.equal(pillolaDi('by Sep 22', nata, MARTEDI), 'By today')
  assert.equal(pillolaDi('Oct 3', nata, MARTEDI), 'Oct 3')
  assert.equal(pillolaDi('Sep 24', nata, MARTEDI), 'Thursday')
  // una nascita illeggibile: si legge rispetto a oggi
  assert.equal(pillolaDi('tomorrow', 'boh', MARTEDI), 'Tomorrow')
})

test('assoluto: «domani» in una fonte di lunedì diventa martedì, in italiano minuscolo in mezzo alla frase', () => {
  it()
  assert.equal(assoluto('Rispondi entro domani', LUNEDI_SERA), 'Rispondi entro martedì')
  assert.equal(assoluto('Domani parte il corso.', LUNEDI_SERA), 'Martedì parte il corso.')
  assert.equal(assoluto('Chiama Sara. Oggi aspetta il sì.', LUNEDI_SERA), 'Chiama Sara. Lunedì aspetta il sì.')
  assert.equal(assoluto('Ha scritto ieri, dopodomani scade', LUNEDI_SERA), 'Ha scritto domenica, mercoledì scade')
  assert.equal(assoluto('Stasera la call, stamattina la mail', LUNEDI_SERA), 'Lunedì sera la call, lunedì mattina la mail')
  assert.equal(assoluto('stanotte', LUNEDI_SERA), 'Lunedì notte')
  en()
  assert.equal(assoluto('Reply by tomorrow', LUNEDI_SERA), 'Reply by Tuesday')
  assert.equal(assoluto('Sam needs your yes on the course price tomorrow.', LUNEDI_SERA), 'Sam needs your yes on the course price Tuesday.')
  assert.equal(assoluto('The call is tonight; this morning she wrote again', LUNEDI_SERA), 'The call is Monday evening; Monday morning she wrote again')
  assert.equal(assoluto('yesterday', LUNEDI_SERA), 'Sunday')
  // controcasi: «domaniale» e un testo senza parole relative restano com’erano
  assert.equal(assoluto('Il fatturato domaniale', LUNEDI_SERA), 'Il fatturato domaniale')
  assert.equal(assoluto('Pay invoice 2231 by the 30th', LUNEDI_SERA), 'Pay invoice 2231 by the 30th')
  assert.equal(assoluto('', LUNEDI_SERA), '')
})

test('conRelativi: le parole relative si vedono, anche accentate o maiuscole; «domaniale» no', () => {
  for (const s of ['entro domani', 'Oggi alle 9', 'TONIGHT', 'this morning', 'dopodomani', 'ieri sera', 'yesterday']) assert.equal(conRelativi(s), true, s)
  for (const s of ['domaniale', 'todays', 'martedì 22', 'Sep 22 9:30', '', 'by the 30th']) assert.equal(conRelativi(s), false, s)
})

test('dataNel e oraNel: quello che sapeva leggere la rifinitura lo legge ancora', () => {
  en()
  assert.deepEqual(dataNel('Sep 22', LUNEDI_SERA), new Date(2026, 8, 22))
  assert.deepEqual(dataNel('22 settembre', LUNEDI_SERA), new Date(2026, 8, 22))
  assert.deepEqual(dataNel('22/9', LUNEDI_SERA), new Date(2026, 8, 22))
  assert.deepEqual(dataNel('2026-10-03', LUNEDI_SERA), new Date(2026, 9, 3))
  assert.deepEqual(dataNel('venerdì', LUNEDI_SERA), new Date(2026, 8, 25))
  assert.deepEqual(dataNel('Monday', LUNEDI_SERA), new Date(2026, 8, 21), 'lunedì detto di lunedì è oggi')
  assert.equal(dataNel('no rush', LUNEDI_SERA), null)
  // una data senza anno passata da più di un mese è dell’anno prossimo
  assert.deepEqual(dataNel('Jan 5', LUNEDI_SERA), new Date(2027, 0, 5))
  assert.equal(oraNel('9:30am'), '9:30')
  assert.equal(oraNel('3pm'), '15:00')
  assert.equal(oraNel('alle 14'), '14:00')
  assert.equal(oraNel('12am'), '0:00')
  assert.equal(oraNel('by Friday'), null)
  assert.equal(oraNel('25:70'), null)
})

test('«entro 3/4 giorni» e «in 2/3 days» sono una durata, non il 3 aprile; «22/9» resta una data', () => {
  it()
  assert.equal(dataNel('entro 3/4 giorni', LUNEDI_SERA), null)
  assert.equal(assoluta('entro 3/4 giorni', LUNEDI_SERA), 'entro 3/4 giorni', 'quello che non è una data resta com’è')
  assert.equal(scadenzaDi('entro 3/4 giorni', LUNEDI_SERA), null)
  assert.deepEqual(dataNel('entro il 22/9', LUNEDI_SERA), new Date(2026, 8, 22))
  en()
  assert.equal(dataNel('in 2/3 days', LUNEDI_SERA), null)
  assert.equal(dataNel('2/3 weeks', LUNEDI_SERA), null)
  assert.equal(dataNel('in 1/2 hour', LUNEDI_SERA), null)
  assert.deepEqual(dataNel('by 9/22', LUNEDI_SERA), new Date(2026, 8, 22))
})

test('«next Monday» detto di lunedì è fra sette giorni, non oggi; «lunedì prossimo» lo stesso; «Monday» da solo resta oggi', () => {
  en()
  assert.deepEqual(dataNel('next Monday', LUNEDI_SERA), new Date(2026, 8, 28))
  assert.deepEqual(scadenzaDi('next Monday', LUNEDI_SERA), new Date(2026, 8, 28))
  assert.equal(assoluta('next Monday', LUNEDI_SERA), 'Sep 28')
  assert.equal(pillolaDi('Sep 28', LUNEDI_SERA.toISOString(), MARTEDI), 'Monday')
  assert.deepEqual(dataNel('next Friday', LUNEDI_SERA), new Date(2026, 8, 25), 'un giorno che deve ancora venire è quello')
  assert.deepEqual(dataNel('Monday', LUNEDI_SERA), new Date(2026, 8, 21), 'senza «next» lunedì è oggi')
  it()
  assert.deepEqual(dataNel('lunedì prossimo', LUNEDI_SERA), new Date(2026, 8, 28))
  assert.deepEqual(dataNel('la prossima settimana, lunedì', LUNEDI_SERA), new Date(2026, 8, 28))
  assert.equal(assoluta('entro lunedì prossimo', LUNEDI_SERA), 'entro 28 set')
})

test('«stasera», «tonight», «this evening», «stamattina» sono il giorno della base: la pillola si salva assoluta e il giorno dopo la carta scade', () => {
  en()
  assert.deepEqual(dataNel('tonight', LUNEDI_SERA), new Date(2026, 8, 21))
  assert.equal(assoluta('tonight', LUNEDI_SERA), 'Sep 21')
  assert.equal(assoluta('tonight 20:00', LUNEDI_SERA), 'Sep 21 20:00')
  assert.equal(assoluta('this evening', LUNEDI_SERA), 'Sep 21')
  assert.equal(assoluta('this morning', LUNEDI_SERA), 'Sep 21')
  assert.equal(pillolaDi('Sep 21 20:00', LUNEDI_SERA.toISOString(), LUNEDI_SERA), 'Today 20:00')
  assert.equal(pillolaDi('tonight', LUNEDI_SERA.toISOString(), LUNEDI_SERA), 'Today', 'una pillola relativa di prima si scioglie sulla nascita')
  assert.deepEqual(scadenzaDi('tonight', LUNEDI_SERA), new Date(2026, 8, 21))
  it()
  assert.equal(assoluta('stasera', LUNEDI_SERA), '21 set')
  assert.equal(assoluta('stamattina alle 9', LUNEDI_SERA), '21 set 9:00')
  assert.equal(assoluta('stanotte', LUNEDI_SERA), '21 set')
  assert.equal(pillolaDi('21 set', LUNEDI_SERA.toISOString(), LUNEDI_SERA), 'Oggi')
})
