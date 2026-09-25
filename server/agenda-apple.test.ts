// L'agenda del Mac, provata senza un Mac.
//
// Tutto passa da un corridore solo, e qui il corridore è finto: risponde il
// JSON che risponderebbe Calendario, o si rompe come si romperebbe osascript.
// Quello che si prova è il contratto con la vista della settimana: le forme
// che escono, i JSON che entrano, i numeri dei guasti. La lettura vera del
// Calendario si fa a mano, su un Mac, e non qui.
//
//   node --test server/agenda-apple.test.ts

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { EventoAgenda } from './agenda-apple.ts'

const apple = await import('./agenda-apple.ts')
const agenda = await import('./agenda.ts')
const { daDocumento } = await import('./connettori/calendario.ts')

type Chiamata = { azione: string; argomento: unknown }

/** Un corridore che risponde a copione e si ricorda cosa gli è stato chiesto. */
function corridore(risposte: Record<string, unknown | ((a: unknown) => unknown)>) {
  const chiamate: Chiamata[] = []
  apple.perProva({
    corri: async (azione, argomento) => {
      chiamate.push({ azione, argomento })
      const r = risposte[azione]
      if (r === undefined) throw new Error(`nessuna risposta per ${azione}`)
      const v = typeof r === 'function' ? (r as (a: unknown) => unknown)(argomento) : r
      if (v instanceof Error) throw v
      return typeof v === 'string' ? v : JSON.stringify(v)
    },
    piattaforma: () => 'darwin',
    ospitato: () => false,
    // la casa delle prove non è quella vera: qui Calendario è finto, e si può
    vietato: () => false
  })
  return chiamate
}

afterEach(() => apple.perProva(null))

const CAL = [
  { id: 'cal-1', nome: 'Lavoro', colore: '#1A73E8', scrivibile: true },
  { id: 'cal-2', nome: 'Compleanni', colore: '', scrivibile: false }
]

// — i calendari —

test('i calendari escono con la forma della vista, e per un minuto non si richiedono', async () => {
  let ora = 1_000_000
  const chiamate = corridore({ calendari: CAL })
  apple.perProva({
    corri: async (azione, argomento) => { chiamate.push({ azione, argomento }); return JSON.stringify(CAL) },
    piattaforma: () => 'darwin', ospitato: () => false, adesso: () => ora, vietato: () => false
  })
  const prima = await apple.calendari()
  assert.deepEqual(prima, [
    { id: 'cal-1', nome: 'Lavoro', colore: '#1A73E8', scrivibile: true, fonte: 'apple' },
    { id: 'cal-2', nome: 'Compleanni', colore: '', scrivibile: false, fonte: 'apple' }
  ])
  await apple.calendari()
  assert.equal(chiamate.length, 1, 'il secondo giro viene dalla cache')
  ora += 61_000
  await apple.calendari()
  assert.equal(chiamate.length, 2, 'dopo un minuto si richiede')
})

// — gli eventi —

test('gli eventi: con l’ora, un giorno intero, e quello a cui manca qualcosa', async () => {
  corridore({
    eventi: {
      eventi: [
        { id: 'b', calendario: 'cal-1', titolo: 'Punto', inizio: '2026-09-21T13:00:00.000Z', fine: '2026-09-21T14:00:00.000Z', tuttoIlGiorno: false, luogo: 'Via Torino 1', note: 'portare il preventivo', ripete: null },
        { id: 'a', calendario: 'cal-2', titolo: 'Ferie', inizio: '2026-09-21T00:00:00.000Z', fine: '2026-09-23T00:00:00.000Z', tuttoIlGiorno: true, luogo: null, note: null, ripete: null },
        { id: 'c', calendario: 'cal-1', titolo: '', inizio: '2026-09-22T08:00:00.000Z', fine: null, tuttoIlGiorno: false, ripete: null },
        { id: '', calendario: 'cal-1', titolo: 'senza uid', inizio: '2026-09-22T08:00:00.000Z', fine: null, tuttoIlGiorno: false },
        { id: 'd', calendario: 'cal-1', titolo: 'data rotta', inizio: 'boh', fine: null, tuttoIlGiorno: false }
      ],
      serie: []
    }
  })
  const e = await apple.eventi(new Date('2026-09-21T00:00:00Z'), new Date('2026-09-28T00:00:00Z'))
  assert.deepEqual(e.map(x => x.id), ['a', 'b', 'c'], 'in ordine di inizio; senza uid o senza data non entrano')
  assert.deepEqual(e[0], { id: 'a', calendario: 'cal-2', titolo: 'Ferie', inizio: '2026-09-21T00:00:00.000Z', fine: '2026-09-23T00:00:00.000Z', tuttoIlGiorno: true, luogo: null, note: null, fonte: 'apple' })
  assert.equal(e[1]!.luogo, 'Via Torino 1')
  assert.equal(e[1]!.note, 'portare il preventivo')
  assert.equal(e[2]!.titolo, '(senza titolo)')
  assert.equal(e[2]!.fine, '2026-09-22T09:00:00.000Z', 'senza fine: un’ora')
})

test('una serie si srotola nella finestra: la prima volta tiene l’uid, le altre no, le escluse mancano', async () => {
  corridore({
    eventi: {
      eventi: [
        // la lunedì spostata a mano è un evento suo: vince su quella calcolata
        { id: 's', calendario: 'cal-1', titolo: 'Settimanale', inizio: '2026-09-28T09:00:00.000Z', fine: '2026-09-28T10:00:00.000Z', tuttoIlGiorno: false, ripete: null }
      ],
      serie: [
        {
          id: 's', calendario: 'cal-1', titolo: 'Settimanale',
          inizio: '2026-09-14T07:00:00.000Z', fine: '2026-09-14T08:00:00.000Z', tuttoIlGiorno: false,
          ripete: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', escluse: ['2026-09-21T07:00:00.000Z']
        }
      ]
    }
  })
  const e = await apple.eventi(new Date('2026-09-14T00:00:00Z'), new Date('2026-10-06T00:00:00Z'))
  const s = e.filter(x => x.id.startsWith('s'))
  assert.deepEqual(s.map(x => [x.id, x.inizio]), [
    ['s', '2026-09-14T07:00:00.000Z'],
    // il 21 è escluso; il 28 c'è già come evento suo, alle 9
    ['s', '2026-09-28T09:00:00.000Z'],
    [apple.idOccorrenza('s', new Date('2026-10-05T07:00:00.000Z')), '2026-10-05T07:00:00.000Z']
  ])
  assert.ok(apple.eUnaOccorrenza(s[2]!.id))
  assert.equal(s[2]!.fine, '2026-10-05T08:00:00.000Z', 'la durata è quella della serie')
})

// — scrivere —

test('creare manda il JSON giusto, con «Myynd» come calendario se nessuno lo dice, e torna la forma', async () => {
  const chiamate = corridore({
    calendari: CAL,
    crea: (a: unknown) => {
      const p = a as Record<string, unknown>
      return { id: 'nuovo-uid', calendario: 'cal-myynd', titolo: p.titolo, inizio: p.inizio, fine: p.fine, tuttoIlGiorno: p.tuttoIlGiorno, luogo: p.luogo || null, note: p.note || null, ripete: null }
    }
  })
  await apple.calendari()
  const ev = await agenda.creaEvento({ titolo: '  Riunione "con" Marco ', inizio: '2026-09-21T13:00:00Z', fine: '2026-09-21T14:00:00Z', luogo: 'Ufficio' })
  const c = chiamate.find(x => x.azione === 'crea')!
  assert.deepEqual(c.argomento, {
    titolo: 'Riunione "con" Marco', inizio: '2026-09-21T13:00:00.000Z', fine: '2026-09-21T14:00:00.000Z',
    tuttoIlGiorno: false, calendario: 'Myynd', predefinito: 'Myynd', luogo: 'Ufficio', note: ''
  })
  assert.deepEqual(ev, { id: 'nuovo-uid', calendario: 'cal-myynd', titolo: 'Riunione "con" Marco', inizio: '2026-09-21T13:00:00.000Z', fine: '2026-09-21T14:00:00.000Z', tuttoIlGiorno: false, luogo: 'Ufficio', note: null, fonte: 'apple' })
  await apple.calendari()
  assert.equal(chiamate.filter(x => x.azione === 'calendari').length, 2, 'dopo una scrittura l’elenco si richiede: può esserci un calendario nuovo')
})

test('un giorno intero si mette a mezzanotte UTC e finisce il giorno dopo, anche se il browser manda le 15', () => {
  const e = agenda.nuovoEvento({ titolo: 'Ferie', inizio: '2026-09-21T15:00:00Z', fine: '2026-09-21T15:00:00Z', tuttoIlGiorno: true })
  assert.equal(e.inizio, '2026-09-21T00:00:00.000Z')
  assert.equal(e.fine, '2026-09-22T00:00:00.000Z')
  const due = agenda.nuovoEvento({ titolo: 'Ferie', inizio: '2026-09-21T00:00:00Z', fine: '2026-09-23T00:00:00Z', tuttoIlGiorno: true })
  assert.equal(due.fine, '2026-09-23T00:00:00.000Z')
})

test('quello che non si può creare risponde 400 con una frase del dizionario', () => {
  const guaio = (corpo: unknown, frase: string) => {
    try { agenda.nuovoEvento(corpo); assert.fail('doveva rifiutare') }
    catch (e) { assert.equal(agenda.statoDi(e), 400); assert.equal((e as Error).message, frase) }
  }
  guaio({ inizio: '2026-09-21T13:00:00Z', fine: '2026-09-21T14:00:00Z' }, 'Serve un titolo.')
  guaio({ titolo: 'x', inizio: 'ieri', fine: '2026-09-21T14:00:00Z' }, 'Non ho capito la data.')
  guaio({ titolo: 'x', inizio: '2026-09-21T14:00:00Z', fine: '2026-09-21T13:00:00Z' }, 'La fine deve venire dopo l’inizio.')
})

test('modificare manda solo i campi che cambiano e cerca per uid', async () => {
  const chiamate = corridore({
    modifica: (a: unknown) => {
      const p = a as { id: string; modifiche: Record<string, unknown> }
      return { id: p.id, calendario: 'cal-1', titolo: p.modifiche.titolo ?? 'Punto', inizio: p.modifiche.inizio ?? '2026-09-21T13:00:00.000Z', fine: p.modifiche.fine ?? '2026-09-21T14:00:00.000Z', tuttoIlGiorno: false, luogo: null, note: null, ripete: null }
    }
  })
  const ev = await agenda.modificaEvento('uid-7', { titolo: 'Punto lungo', inizio: '2026-09-21T13:30:00Z', fine: '2026-09-21T15:00:00Z', note: '' })
  assert.deepEqual(chiamate[0], { azione: 'modifica', argomento: { id: 'uid-7', modifiche: { titolo: 'Punto lungo', inizio: '2026-09-21T13:30:00.000Z', fine: '2026-09-21T15:00:00.000Z', note: '' } } })
  assert.equal(ev.titolo, 'Punto lungo')
  assert.equal(ev.fine, '2026-09-21T15:00:00.000Z')
  assert.equal(ev.fonte, 'apple')
  await assert.rejects(agenda.modificaEvento('uid-7', {}), (e: Error) => agenda.statoDi(e) === 400 && e.message === 'Dimmi cosa vuoi cambiare.')
})

test('cancellare manda l’uid e torna; un’occorrenza di una serie non si tocca da qui', async () => {
  const chiamate = corridore({ elimina: { ok: true } })
  await agenda.eliminaEvento('uid-9')
  assert.deepEqual(chiamate, [{ azione: 'elimina', argomento: { id: 'uid-9' } }])
  const occ = apple.idOccorrenza('uid-9', new Date('2026-10-05T07:00:00Z'))
  await assert.rejects(agenda.eliminaEvento(occ), (e: Error) => agenda.statoDi(e) === 400 && e.message === apple.SI_RIPETE)
  await assert.rejects(agenda.modificaEvento(occ, { inizio: '2026-10-05T08:00:00Z' }), (e: Error) => e.message === apple.SI_RIPETE)
  assert.equal(chiamate.length, 1, 'senza chiedere niente al Mac')
})

test('gli id dell’agenda iCal si leggono e basta', async () => {
  const chiamate = corridore({ elimina: { ok: true } })
  await assert.rejects(agenda.eliminaEvento('calendario:abc:123'), (e: Error) => agenda.statoDi(e) === 400)
  await assert.rejects(agenda.modificaEvento('calendario:abc:123', { titolo: 'x' }), (e: Error) => agenda.statoDi(e) === 400)
  assert.equal(chiamate.length, 0)
})

// — quando il Mac non c'è —

test('quello che osascript dice diventa un numero e una frase', async () => {
  const casi: [string, number, string][] = [
    ['execution error: Not authorized to send Apple events to Calendar. (-1743)', 503, apple.PERMESSO],
    ['execution error: Calendar got an error: AppleEvent timed out. (-1712)', 503, apple.NON_RISPONDE],
    ['SCADUTO\nkilled', 503, apple.NON_RISPONDE],
    ['execution error: Can’t get application "Calendar". (-600)', 503, apple.NON_C_E],
    ['execution error: Error: NON_TROVATO (-2700)', 404, apple.NON_TROVATO],
    ['execution error: Error: CALENDARIO_NON_TROVATO (-2700)', 404, apple.CALENDARIO_NON_TROVATO],
    ['execution error: Error: SI_RIPETE (-2700)', 400, apple.SI_RIPETE],
    // un'attesa scaduta che si porta dietro lo script intero non diventa «Evento non trovato»
    [`SCADUTO\nCommand failed: osascript -e ${apple.SCRIPT}`, 503, apple.NON_RISPONDE],
    [`Not authorized to send Apple events to Calendar. (-1743)\n${apple.SCRIPT}`, 503, apple.PERMESSO]
  ]
  for (const [testo, stato, frase] of casi) {
    corridore({ elimina: new Error(testo) })
    await assert.rejects(apple.elimina('x'), (e: Error) => {
      assert.equal(agenda.statoDi(e), stato, testo)
      assert.equal(e.message, frase, testo)
      return true
    })
  }
})

test('ospitati, o non su un Mac, l’agenda non c’è: 503 senza nemmeno provare', async () => {
  const chiamate: Chiamata[] = []
  apple.perProva({
    corri: async (azione, argomento) => { chiamate.push({ azione, argomento }); return '[]' },
    piattaforma: () => 'darwin', ospitato: () => true
  })
  assert.equal(apple.disponibile(), false)
  await assert.rejects(apple.calendari(), (e: Error) => agenda.statoDi(e) === 503 && e.message === apple.NON_QUI)
  apple.perProva({
    corri: async (azione, argomento) => { chiamate.push({ azione, argomento }); return '[]' },
    piattaforma: () => 'win32', ospitato: () => false
  })
  assert.equal(apple.disponibile(), false)
  await assert.rejects(agenda.creaEvento({ titolo: 'x', inizio: '2026-09-21T13:00:00Z', fine: '2026-09-21T14:00:00Z' }), (e: Error) => agenda.statoDi(e) === 503)
  assert.equal(chiamate.length, 0)
})

// — la risposta della vista —

const EV = (id: string, inizio: string, fonte: 'apple' | 'ical' = 'apple'): EventoAgenda =>
  ({ id, calendario: fonte === 'apple' ? 'cal-1' : 'ical', titolo: id, inizio, fine: inizio, tuttoIlGiorno: false, fonte })

test('la risposta mette insieme il Mac e l’agenda iCal, in ordine, e dice se si può scrivere', () => {
  const r = agenda.rispostaAgenda(
    { calendari: [{ id: 'cal-1', nome: 'Lavoro', colore: '#000', scrivibile: true, fonte: 'apple' }], eventi: [EV('b', '2026-09-22T09:00:00.000Z')] },
    { nome: 'Google', eventi: [EV('a', '2026-09-21T09:00:00.000Z', 'ical')] }
  )
  assert.equal(r.scrivibile, true)
  assert.equal(r.avviso, undefined)
  assert.deepEqual(r.calendari.map(c => [c.id, c.fonte, c.scrivibile]), [['cal-1', 'apple', true], ['ical', 'ical', false]])
  assert.equal(r.calendari[1]!.nome, 'Google')
  assert.deepEqual(r.eventi.map(e => e.id), ['a', 'b'])
})

test('senza il Mac la settimana resta leggibile: gli eventi iCal ci sono, la frase sta in avviso', () => {
  const r = agenda.rispostaAgenda({ guaio: apple.PERMESSO }, { nome: 'Google', eventi: [EV('a', '2026-09-21T09:00:00.000Z', 'ical')] })
  assert.equal(r.scrivibile, false)
  assert.equal(r.avviso, apple.PERMESSO)
  assert.equal(r.eventi.length, 1)
  assert.deepEqual(r.calendari.map(c => c.id), ['ical'])
  const vuota = agenda.rispostaAgenda({ guaio: apple.NON_QUI }, null)
  assert.deepEqual(vuota, { calendari: [], eventi: [], scrivibile: false, avviso: apple.NON_QUI })
})

test('leggere la settimana passa dal corridore con la finestra in UTC, e la finestra storta è un 400', async () => {
  const chiamate = corridore({ calendari: CAL, eventi: { eventi: [], serie: [] } })
  const r = await agenda.leggiAgenda('2026-09-21T00:00:00Z', '2026-09-28T00:00:00Z')
  assert.equal(r.scrivibile, true)
  assert.equal(r.calendari.length, 2)
  const e = chiamate.find(c => c.azione === 'eventi')!
  assert.deepEqual(e.argomento, { da: '2026-09-21T00:00:00.000Z', a: '2026-09-28T00:00:00.000Z' })
  await assert.rejects(agenda.leggiAgenda('2026-09-28T00:00:00Z', '2026-09-21T00:00:00Z'), (x: Error) => agenda.statoDi(x) === 400)
  await assert.rejects(agenda.leggiAgenda('2020-01-01T00:00:00Z', '2026-09-21T00:00:00Z'), (x: Error) => agenda.statoDi(x) === 400)
})

test('se il Mac si rompe mentre si legge, la vista lo dice e non cade', async () => {
  corridore({ calendari: new Error('AppleEvent timed out. (-1712)'), eventi: { eventi: [], serie: [] } })
  const r = await agenda.leggiAgenda('2026-09-21T00:00:00Z', '2026-09-28T00:00:00Z')
  assert.equal(r.scrivibile, false)
  assert.equal(r.avviso, apple.NON_RISPONDE)
})

// — l'agenda iCal, dall'indice —

test('da un documento dell’indice si rileggono la fine e il giorno intero', () => {
  const giorno = daDocumento({ corpo: 'lunedì 21 settembre 2026, tutto il giorno.\nDove: Casa', quando: '2026-09-21T00:00:00.000Z', percorso: 'Casa' })!
  assert.equal(giorno.tuttoIlGiorno, true)
  assert.equal(giorno.fine.toISOString(), '2026-09-22T00:00:00.000Z')
  assert.equal(giorno.luogo, 'Casa')
  const inglese = daDocumento({ corpo: 'Monday 21 September 2026, all day.', quando: '2026-09-21T00:00:00.000Z', percorso: null })!
  assert.equal(inglese.tuttoIlGiorno, true)

  const ora = daDocumento({ corpo: 'lunedì 21 settembre 2026 alle 15:00 — 16:30.\nCon: Marco\n\nPortare il preventivo', quando: '2026-09-21T13:00:00.000Z', percorso: null }, 'Europe/Rome')!
  assert.equal(ora.tuttoIlGiorno, false)
  assert.equal(ora.fine.toISOString(), '2026-09-21T14:30:00.000Z', 'le 16:30 di Roma')
  assert.equal(ora.note, 'Portare il preventivo')
  assert.equal(ora.luogo, null)

  const notte = daDocumento({ corpo: 'sabato 26 settembre 2026 alle 21:00 — 01:00.', quando: '2026-09-26T19:00:00.000Z', percorso: null }, 'Europe/Rome')!
  assert.equal(notte.fine.toISOString(), '2026-09-26T23:00:00.000Z', 'l’una è quella del giorno dopo')

  const senzaFine = daDocumento({ corpo: 'lunedì 21 settembre 2026 alle 15:00.', quando: '2026-09-21T13:00:00.000Z', percorso: null })!
  assert.equal(senzaFine.fine.getTime() - senzaFine.inizio.getTime(), 3600e3)
  assert.equal(daDocumento({ corpo: 'x', quando: null, percorso: null }), null)
})

// — lo script —

test('lo script non contiene testo di chi usa: legge argv, e si chiama senza activate', () => {
  assert.match(apple.SCRIPT, /JSON\.parse\(argv\[1\]/)
  assert.doesNotMatch(apple.SCRIPT, /activate\(\)/)
  assert.match(apple.SCRIPT, /whose\(\{ uid: uid \}\)/, 'si cerca per uid, non per titolo')
  assert.doesNotMatch(apple.SCRIPT, /whose\(\{ summary/)
})
