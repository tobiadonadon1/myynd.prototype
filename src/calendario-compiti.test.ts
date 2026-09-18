import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ORE_IN_VISTA, affianca, celleDelMese, colonneSettimana, giornoLocale, giornoCompito, giorniVisibili,
  inizioMese, inizioSettimana, mezzanotte, miniMese, minutiDa, posaAdesso, posaEvento, quantiGiorni,
  righeOre, secchioDelGiorno, spostaGiorno, spostaMese
} from './oggi/giorni.ts'
import { secchioVivo } from './oggi/secchi.ts'

/** Lunedì 0 … domenica 6, come legge la griglia della vista intera. */
const colonna = (g: string) => (new Date(`${g}T12:00:00`).getDay() + 6) % 7

test('calendar days cross month/year and leap days without UTC conversion', () => {
  assert.equal(spostaGiorno('2026-12-31', 1), '2027-01-01')
  assert.equal(spostaGiorno('2024-02-28', 1), '2024-02-29')
  assert.equal(spostaGiorno('2026-03-01', -1), '2026-02-28')
  assert.equal(inizioSettimana('2026-09-13'), '2026-09-07')
})

test('planner shows readable adjacent days: three at most, so each day is tall and wide, even on a wide window', () => {
  assert.equal(quantiGiorni(380), 1)
  assert.equal(quantiGiorni(520), 2)
  assert.equal(quantiGiorni(760), 3)
  assert.equal(quantiGiorni(1280), 3)
  assert.deepEqual(giorniVisibili('2026-09-30', 3), ['2026-09-30', '2026-10-01', '2026-10-02'])
  assert.deepEqual(giorniVisibili('2026-09-09', 7), ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'])
})

test('the full view is whole weeks, Monday to Sunday, around the month it shows', () => {
  // settembre 2026 comincia di martedì: la griglia parte dal lunedì prima
  const settembre = celleDelMese('2026-09-18')
  assert.equal(settembre[0], '2026-08-31')
  assert.equal(settembre.at(-1), '2026-10-04')
  assert.equal(settembre.length % 7, 0)
  assert.equal(colonna(settembre[0]), 0)
  assert.equal(colonna(settembre.at(-1)!), 6)
  // il primo e l'ultimo del mese ci sono, e nell'ordine giusto
  assert.ok(settembre.includes('2026-09-01') && settembre.includes('2026-09-30'))
  assert.deepEqual([...settembre].sort(), settembre)

  // febbraio 2027 comincia di lunedì e finisce di domenica: quattro righe, niente caselle in più
  const febbraio = celleDelMese('2027-02-10')
  assert.equal(febbraio.length, 28)
  assert.equal(febbraio[0], '2027-02-01')
  assert.equal(febbraio.at(-1), '2027-02-28')

  // un mese che sfora su sei righe resta una griglia intera
  const agosto = celleDelMese('2026-08-20')
  assert.equal(agosto.length % 7, 0)
  assert.equal(colonna(agosto[0]), 0)
  assert.ok(agosto.includes('2026-08-01') && agosto.includes('2026-08-31'))
})

test('month arrows keep the chosen day where the month has one', () => {
  assert.equal(inizioMese('2026-09-18'), '2026-09-01')
  assert.equal(spostaMese('2026-09-18', 1), '2026-10-18')
  assert.equal(spostaMese('2026-01-01', -1), '2025-12-01')
  // il 31 più un mese è l'ultimo giorno del mese d'arrivo, non il primo di quello dopo
  assert.equal(spostaMese('2026-01-31', 1), '2026-02-28')
  assert.equal(spostaMese('2024-01-31', 1), '2024-02-29')
  assert.equal(spostaMese('2026-12-15', 1), '2027-01-15')
})

/** Un istante locale da un giorno e un'ora, come lo scrive la settimana aperta. */
const alle = (g: string, ore: number, minuti = 0) =>
  new Date(mezzanotte(g).getTime() + (ore * 60 + minuti) * 60000).toISOString()

test('the expanded week is Monday to Sunday around the chosen day, whatever the day', () => {
  assert.deepEqual(colonneSettimana('2026-09-18'),
    ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'])
  // domenica sta in fondo alla settimana che comincia il lunedì prima, non in cima a quella dopo
  assert.equal(colonneSettimana('2026-09-20')[0], '2026-09-14')
  assert.equal(colonneSettimana('2026-09-14')[0], '2026-09-14')
  // a cavallo di due mesi la settimana resta intera
  assert.deepEqual(colonneSettimana('2026-10-01').slice(0, 2), ['2026-09-28', '2026-09-29'])
})

test('the hour grid holds the whole day, and the morning is only what opens first', () => {
  assert.equal(righeOre().length, 24)
  assert.equal(righeOre()[0], 0)
  assert.equal(righeOre().at(-1), 23)
  // le etichette partono dall'una: «00» a filo del bordo si taglia a metà
  assert.deepEqual(righeOre(1, 24).slice(0, 3), [1, 2, 3])
  assert.equal(righeOre(1, 24).length, 23)
  assert.deepEqual(righeOre(9, 9), [])
  // quello che si vede senza scorrere è una giornata di lavoro, non il giorno intero
  assert.equal(ORE_IN_VISTA.a - ORE_IN_VISTA.da, 16)
  assert.ok(ORE_IN_VISTA.da > 0 && ORE_IN_VISTA.a < 24)
})

test('an event sits where its hours are, and is cut at the edges of what is drawn', () => {
  const g = '2026-09-16'
  assert.equal(minutiDa(g, alle(g, 9, 30)), 570)
  assert.equal(minutiDa(g, alle(spostaGiorno(g, -1), 23)), -60)

  // dalle nove alle dieci, sul giorno intero: un ventiquattresimo, a tre ottavi
  const mattina = posaEvento(g, alle(g, 9), alle(g, 10))
  assert.deepEqual(mattina, { top: 9 / 24, altezza: 1 / 24 })

  // sulla fascia disegnata da sola i conti cambiano, e la fascia è quella
  const inVista = posaEvento(g, alle(g, 9), alle(g, 10), 6, 22)
  assert.deepEqual(inVista, { top: 3 / 16, altezza: 1 / 16 })

  // quello che comincia ieri notte comincia dal bordo, e finisce dove finisce
  const notturno = posaEvento(g, alle(spostaGiorno(g, -1), 22), alle(g, 1))
  assert.deepEqual(notturno, { top: 0, altezza: 1 / 24 })

  // quello che sfora dall'altra parte si taglia alla mezzanotte
  const tardi = posaEvento(g, alle(g, 23), alle(spostaGiorno(g, 1), 1))
  assert.deepEqual(tardi, { top: 23 / 24, altezza: 1 / 24 })

  // fuori dalla fascia non c'è niente da disegnare: né un blocco alto zero, né uno in cima
  assert.equal(posaEvento(g, alle(spostaGiorno(g, -1), 9), alle(spostaGiorno(g, -1), 10)), null)
  assert.equal(posaEvento(g, alle(g, 5), alle(g, 5, 30), 6, 22), null)
  assert.equal(posaEvento(g, alle(g, 23), alle(g, 23, 30), 6, 22), null)

  // dieci minuti restano un quarto d'ora: sotto non si legge e non si clicca
  const breve = posaEvento(g, alle(g, 9), alle(g, 9, 10))
  assert.equal(breve?.altezza, 15 / 1440)
  // e un evento senza durata non sparisce
  assert.equal(posaEvento(g, alle(g, 9), alle(g, 9))?.altezza, 15 / 1440)
})

test('the copper line is only on the day that is happening now', () => {
  const g = '2026-09-16'
  assert.equal(posaAdesso(g, new Date(mezzanotte(g).getTime() + 12 * 3600_000)), 0.5)
  assert.equal(posaAdesso(g, new Date(mezzanotte(spostaGiorno(g, 1)).getTime() + 3600_000)), null)
  // e nemmeno su oggi, se l'ora è fuori dalla fascia disegnata
  assert.equal(posaAdesso(g, new Date(mezzanotte(g).getTime() + 3 * 3600_000), 6, 22), null)
  assert.equal(posaAdesso(g, new Date(mezzanotte(g).getTime() + 14 * 3600_000), 6, 22), 0.5)
})

test('events that overlap stand side by side, and a free hour gets the full width back', () => {
  const g = '2026-09-16'
  const e = (id: string, da: number, a: number) => ({ id, inizio: alle(g, da), fine: alle(g, a) })
  const dove = (r: { evento: { id: string }; colonna: number; colonne: number }[], id: string) =>
    r.find(x => x.evento.id === id)!

  // due alle dieci: mezza colonna ciascuna
  let r = affianca([e('a', 10, 11), e('b', 10, 11)])
  assert.equal(dove(r, 'a').colonne, 2)
  assert.equal(dove(r, 'b').colonne, 2)
  assert.notEqual(dove(r, 'a').colonna, dove(r, 'b').colonna)

  // a catena: A tocca B, B tocca C. Il gruppo è uno solo — le larghezze devono
  // combaciare — ma le colonne sono due e non tre, perché A e C non si sfiorano
  // e quella che A lascia libera la riprende C
  r = affianca([e('a', 9, 10), e('b', 9.5, 10.5), e('c', 10, 11)])
  assert.equal(dove(r, 'a').colonne, 2)
  assert.equal(dove(r, 'c').colonne, 2)
  assert.equal(dove(r, 'a').colonna, dove(r, 'c').colonna)
  assert.notEqual(dove(r, 'a').colonna, dove(r, 'b').colonna)

  // uno di seguito all'altro non è una sovrapposizione: larghezza piena a tutti e due
  r = affianca([e('a', 9, 10), e('b', 10, 11)])
  assert.equal(dove(r, 'a').colonne, 1)
  assert.equal(dove(r, 'b').colonne, 1)

  // una mattina affollata non stringe il pomeriggio
  r = affianca([e('a', 9, 11), e('b', 9, 9.5), e('c', 15, 16)])
  assert.equal(dove(r, 'a').colonne, 2)
  assert.equal(dove(r, 'c').colonne, 1)
  assert.equal(dove(r, 'c').colonna, 0)

  // la colonna si riusa appena si libera, invece di crescere all'infinito
  r = affianca([e('a', 9, 12), e('b', 9, 10), e('c', 10, 11)])
  assert.equal(dove(r, 'b').colonna, dove(r, 'c').colonna)
  assert.equal(dove(r, 'a').colonne, 2)

  assert.deepEqual(affianca([]), [])
})

test('the little month is always six rows of seven, so the rail never jumps', () => {
  for (const g of ['2026-09-18', '2027-02-10', '2026-08-20', '2026-11-30']) {
    const righe = miniMese(g)
    assert.equal(righe.length, 6)
    for (const r of righe) assert.equal(r.length, 7)
    // comincia dove comincerebbe la griglia del mese, e resta in ordine
    assert.equal(righe[0][0], celleDelMese(g)[0])
    const piatto = righe.flat()
    assert.deepEqual([...piatto].sort(), piatto)
    assert.equal(colonna(piatto[0]), 0)
    assert.equal(colonna(piatto.at(-1)!), 6)
    // febbraio 2027 sta in quattro righe: le due che mancano sono giorni veri, non caselle vuote
    assert.ok(piatto.every(c => /^\d{4}-\d{2}-\d{2}$/.test(c)))
  }
  assert.equal(miniMese('2027-02-10')[0][0], '2027-02-01')
  assert.equal(miniMese('2027-02-10').at(-1)!.at(-1), '2027-03-14')
})

test('planned dates remain fixed; legacy today tasks keep their original semantics', () => {
  assert.equal(giornoCompito({ quando: 'oggi', giorno: '2026-09-07' }, '2026-09-08'), '2026-09-07')
  assert.equal(giornoCompito({ quando: 'oggi' }, '2026-09-08'), '2026-09-08')
  assert.equal(giornoCompito({ quando: 'settimana' }, '2026-09-08'), null)
  assert.equal(secchioDelGiorno('2026-09-09', '2026-09-08'), 'settimana')
  assert.equal(secchioDelGiorno('2026-09-07', '2026-09-08'), 'oggi')
  assert.equal(secchioDelGiorno(null, '2026-09-08'), 'poi')
})

test('secchioVivo brings a live task with a past planned day forward to today, without touching a closed one', () => {
  // giorno passato, viva: la lista di oggi la vede lì, non dov'è scritta
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-09-07', quando: 'settimana' }, '2026-09-08'), 'oggi')
  assert.equal(secchioVivo({ stato: 'delegato', giorno: '2026-09-01', quando: 'poi' }, '2026-09-08'), 'oggi')
  // giorno passato, chiusa: `quando` scritto resta quello che dice — non compare mai in questa lista comunque
  assert.equal(secchioVivo({ stato: 'fatto', giorno: '2026-09-07', quando: 'settimana' }, '2026-09-08'), 'settimana')
  assert.equal(secchioVivo({ stato: 'lasciato', giorno: '2026-09-01', quando: 'poi' }, '2026-09-08'), 'poi')
  // giorno futuro: si deriva da secchioDelGiorno, come nel calendario
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-09-09', quando: 'poi' }, '2026-09-08'), 'settimana')
  // una data lontana non sposta niente: «prima o poi» resta «prima o poi»
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-12-01', quando: 'poi' }, '2026-09-08'), 'poi')
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-09-15', quando: 'poi' }, '2026-09-08'), 'settimana')
  // giorno di oggi: viva, non passata — resta 'oggi'
  assert.equal(secchioVivo({ stato: 'aperto', giorno: '2026-09-08', quando: 'settimana' }, '2026-09-08'), 'oggi')
  // senza giorno: si fida di `quando`, qualunque sia lo stato
  assert.equal(secchioVivo({ stato: 'aperto', giorno: null, quando: 'settimana' }, '2026-09-08'), 'settimana')
  assert.equal(secchioVivo({ stato: 'aperto', quando: 'poi' }, '2026-09-08'), 'poi')
})

test('local date arithmetic stays stable across daylight saving and negative UTC offsets', () => {
  const precedente = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    assert.equal(giornoLocale(new Date('2026-09-09T02:00:00Z')), '2026-09-08')
    assert.equal(spostaGiorno('2026-03-07', 1), '2026-03-08')
    assert.equal(spostaGiorno('2026-03-08', 1), '2026-03-09')
    assert.equal(spostaGiorno('2026-11-01', 1), '2026-11-02')
  } finally { if (precedente === undefined) delete process.env.TZ; else process.env.TZ = precedente }
})
