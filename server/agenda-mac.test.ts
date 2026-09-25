// Calendario del Mac nell'indice (P4): solo con le mani finte di
// `agenda-apple.perProva`, mai con osascript vero. E la guardia che tiene
// Calendario fuori dalle prove dal vivo.
//
//   node --test server/agenda-mac.test.ts

import { test, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, userInfo } from 'node:os'

const casa = mkdtempSync(join(tmpdir(), 'myynd-agendamac-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const apple = await import('./agenda-apple.ts')
const agendaMac = await import('./connettori/agenda-mac.ts')
const cfg = await import('./config.ts')
const primaLettura = await import('./prima-lettura.ts')
const { GuaioFonte } = await import('./connettori/guaio.ts')

const GIORNO = 86_400_000
const ora = Date.now()
const CAL = [
  { id: 'lavoro', nome: 'Work', colore: '#f00', scrivibile: true },
  { id: 'casa', nome: 'Home', colore: '#0f0', scrivibile: true },
  { id: 'compleanni', nome: 'Birthdays', colore: '#00f', scrivibile: false },
  { id: 'feste', nome: 'Italian Holidays', colore: '#00f', scrivibile: false },
  { id: 'siri', nome: 'Siri Suggestions', colore: '#00f', scrivibile: false }
]
const ev = (id: string, calendario: string, giorni: number) => ({ id, calendario, titolo: `Evento ${id}`, inizio: new Date(ora + giorni * GIORNO).toISOString(), fine: new Date(ora + giorni * GIORNO + 3_600_000).toISOString(), tuttoIlGiorno: false, luogo: 'Studio', note: null })
const EVENTI = [ev('a', 'lavoro', -10), ev('b', 'lavoro', 2), ev('c', 'casa', -60), ev('d', 'compleanni', 5), ev('e', 'feste', 1), ev('f', 'siri', 3)]

let chiamate: { azione: string; argomento: unknown; attesa?: number }[] = []
function mani(o: { eventi?: (a: { da: string; a: string }) => unknown } = {}) {
  chiamate = []
  apple.perProva({
    corri: async (azione, argomento, attesa) => {
      chiamate.push({ azione, argomento, attesa })
      if (azione === 'calendari') return JSON.stringify(CAL)
      if (azione === 'eventi') {
        const r = o.eventi ? o.eventi(argomento as { da: string; a: string }) : { eventi: EVENTI, serie: [] }
        if (r instanceof Error) throw r
        return JSON.stringify(r)
      }
      throw new Error(`nessuna risposta per ${azione}`)
    },
    piattaforma: () => 'darwin', ospitato: () => false, vietato: () => false, adesso: () => ora
  })
}

beforeEach(() => { store.azzeraTutto(); mani() })
afterEach(() => apple.perProva(null))
after(() => { store.chiudiIndici(); rmSync(casa, { recursive: true, force: true }) })

test('la prova conta gli eventi tenuti e i calendari che ne hanno, e aspetta un minuto', async () => {
  const p = await agendaMac.prova(ora)
  assert.deepEqual(p, { eventi: 3, calendari: 2 })
  const e = chiamate.find(c => c.azione === 'eventi')!
  assert.equal(e.attesa, agendaMac.ATTESA)
  const { da, a } = e.argomento as { da: string; a: string }
  assert.equal(Math.round((ora - Date.parse(da)) / GIORNO), 90)
  assert.equal(Math.round((Date.parse(a) - ora) / GIORNO), 180)
})

test('compleanni, festività e suggerimenti di Siri restano fuori, in inglese e in italiano', () => {
  for (const n of ['Birthdays', 'Compleanni', 'Siri Suggestions', 'Suggerimenti di Siri', 'Scheduled Reminders', 'Promemoria programmati', 'US Holidays', 'Festività in Italia'])
    assert.equal(agendaMac.calendarioSaltato(n), true, n)
  for (const n of ['Work', 'Casa', 'Holiday party planning team'.replace('Holiday', 'Party')]) assert.equal(agendaMac.calendarioSaltato(n), false, n)
})

test('la lettura scrive documenti come quelli del calendario iCal, con il loro id', async () => {
  const e = await agendaMac.sincronizza({ dal: new Date(ora - 90 * GIORNO), al: new Date(ora + 180 * GIORNO) })
  assert.equal(e.troncato, false)
  assert.equal(e.calendari, 2)
  const a = e.docs.find(d => d.titolo === 'Evento a')!
  assert.equal(a.id, `agendamac:a:${Date.parse(EVENTI[0]!.inizio)}`)
  assert.equal(a.fonte, 'agendamac')
  assert.equal(a.tipo, 'evento')
  assert.equal(a.gruppo, 'agenda')
  assert.equal(a.percorso, 'Studio')
  assert.match(a.corpo, /Studio/)
})

test('un evento già letto dal calendario iCal non si scrive due volte', async () => {
  const b = EVENTI[1]!
  store.salvaDocumenti([{ id: `calendario:b:${Date.parse(b.inizio)}`, fonte: 'calendario', tipo: 'evento', titolo: 'Evento b', corpo: 'x', quando: b.inizio }])
  const e = await agendaMac.sincronizza({ dal: new Date(ora - 90 * GIORNO), al: new Date(ora + 180 * GIORNO) })
  assert.deepEqual(e.docs.map(d => d.titolo).sort(), ['Evento a', 'Evento c'])
  // un'occorrenza di una serie porta l'uid della serie: stessa regola
  mani({ eventi: () => ({ eventi: [{ ...b, id: `b#${Date.parse(b.inizio)}` }], serie: [] }) })
  const r = await agendaMac.sincronizza({ dal: new Date(ora - 90 * GIORNO), al: new Date(ora + 180 * GIORNO) })
  assert.equal(r.docs.length, 0)
})

test('se la chiamata intera non risponde si legge a pezzi di trenta giorni', async () => {
  let intere = 0
  mani({
    eventi: q => {
      const giorni = (Date.parse(q.a) - Date.parse(q.da)) / GIORNO
      if (giorni > 31) { intere++; return new Error('SCADUTO\n') }
      return { eventi: EVENTI.filter(x => x.inizio >= q.da && x.inizio < q.a), serie: [] }
    }
  })
  const e = await agendaMac.sincronizza({ dal: new Date(ora - 90 * GIORNO), al: new Date(ora + 180 * GIORNO) })
  assert.equal(intere, 1)
  assert.equal(e.troncato, false)
  assert.equal(e.docs.length, 3)
  assert.equal(chiamate.filter(c => c.azione === 'eventi').length, 1 + 9)
})

test('un pezzo che non risponde vuol dire troncato: poi non si cancella niente', async () => {
  let pezzi = 0
  mani({ eventi: q => (Date.parse(q.a) - Date.parse(q.da)) / GIORNO > 31 || ++pezzi === 2 ? new Error('SCADUTO') : { eventi: [], serie: [] } })
  const e = await agendaMac.sincronizza({ dal: new Date(ora - 90 * GIORNO), al: new Date(ora + 180 * GIORNO) })
  assert.equal(e.troncato, true)
})

test('il permesso negato è un guaio con il suo rimedio; Calendario assente è «apri-app»', async () => {
  mani({ eventi: () => new Error('execution error: Error: Not authorized to send Apple events to Calendar. (-1743)') })
  await assert.rejects(agendaMac.sincronizza({ dal: new Date(ora - GIORNO), al: new Date(ora + GIORNO) }),
    (e: unknown) => e instanceof GuaioFonte && e.message === apple.PERMESSO && e.rimedio === 'guarda')
  apple.perProva({ piattaforma: () => 'win32', ospitato: () => false, vietato: () => false })
  await assert.rejects(agendaMac.prova(), (e: unknown) => e instanceof GuaioFonte && e.rimedio === 'apri-app')
})

test('la guardia: con MYYND_SENZA_APP_MAC Calendario non si tocca, nemmeno per sapere se è aperto', async () => {
  apple.perProva(null)
  const prima = process.env.MYYND_SENZA_APP_MAC
  const casaVera = process.env.HOME
  try {
    process.env.HOME = userInfo().homedir
    process.env.MYYND_SENZA_APP_MAC = '1'
    if (process.platform === 'darwin') assert.equal(apple.disponibile(), false)
    assert.equal(await apple.aperto(), false)
    await assert.rejects(agendaMac.prova(), (e: unknown) => e instanceof GuaioFonte && e.rimedio === 'apri-app')
    delete process.env.MYYND_SENZA_APP_MAC
    // una casa che non è quella vera è una prova: niente Calendario
    process.env.HOME = casa
    assert.equal(apple.disponibile(), false)
    // la casa vera, senza la variabile: su un Mac si può
    process.env.HOME = userInfo().homedir
    assert.equal(apple.disponibile(), process.platform === 'darwin')
  } finally {
    if (prima === undefined) delete process.env.MYYND_SENZA_APP_MAC; else process.env.MYYND_SENZA_APP_MAC = prima
    if (casaVera === undefined) delete process.env.HOME; else process.env.HOME = casaVera
  }
})

test('«aperto» chiede alle mani, e senza Calendario disponibile non chiede nemmeno (counter-case)', async () => {
  let chiesto = 0
  apple.perProva({ piattaforma: () => 'darwin', ospitato: () => false, vietato: () => false, aperto: async () => { chiesto++; return true } })
  assert.equal(await apple.aperto(), true)
  apple.perProva({ piattaforma: () => 'darwin', ospitato: () => false, vietato: () => true, aperto: async () => { chiesto++; return true } })
  assert.equal(await apple.aperto(), false)
  assert.equal(chiesto, 1)
})

test('quando un giro legge Calendario del Mac, e quando lo salta', () => {
  const adesso = ora
  const fa = (min: number) => new Date(adesso - min * 60_000).toISOString()
  // la prima lettura premuta da lui: sempre
  assert.equal(agendaMac.daLeggere({ prima: true, sfondo: false, aperto: false, ultima: null, adesso }), true)
  // la prima lettura di sottofondo con Calendario chiuso: no, non lo si apre (counter-case)
  assert.equal(agendaMac.daLeggere({ prima: true, sfondo: true, aperto: false, ultima: null, adesso }), false)
  assert.equal(agendaMac.daLeggere({ prima: true, sfondo: true, aperto: true, ultima: null, adesso }), true)
  // dopo: aperto e più di un'ora fa
  assert.equal(agendaMac.daLeggere({ prima: false, sfondo: true, aperto: true, ultima: fa(61), adesso }), true)
  assert.equal(agendaMac.daLeggere({ prima: false, sfondo: true, aperto: true, ultima: fa(20), adesso }), false)
  assert.equal(agendaMac.daLeggere({ prima: false, sfondo: false, aperto: false, ultima: fa(600), adesso }), false)
})

test('una prima lettura saltata con Calendario chiuso conta fra i giri: finisce, e il primo giro di apprendimento parte', { skip: process.platform !== 'darwin' }, async () => {
  cfg.aggiorna({ agendamac: { attiva: true } })
  primaLettura.perProva({ pausa: 1, giri: 12, occupato: 1 })
  apple.perProva({ piattaforma: () => 'darwin', ospitato: () => false, vietato: () => false, aperto: async () => false })
  let imparato = 0
  primaLettura.quandoFinisce(() => { imparato++ })
  try {
    // premuta da lui si legge, e non si conta (counter-case)
    assert.equal(await agendaMac.questoGiro({ sfondo: false }), true)
    assert.equal(store.cursore('prima:agendamac'), 'in-corso')
    assert.equal(store.cursore('prima:agendamac:giri'), null)
    // come `leggiUna` in index.ts: una lettura saltata si mette da parte per quel giro
    let letture = 0
    const leggiUna = async () => { letture++; return await agendaMac.questoGiro({ sfondo: true }) ? 'letta' as const : 'guaio' as const }
    await primaLettura.continua('', leggiUna)
    assert.equal(letture, 1, 'una volta per giro, non dodici')
    assert.equal(store.cursore('prima:agendamac:giri'), '1')
    assert.equal(primaLettura.eUnaPrima(), true)
    // un giro dei dieci minuti dopo l'altro: finisce in un numero finito di giri
    let cicli = 1
    while (primaLettura.inCorso().includes('agendamac') && cicli < 100) { await primaLettura.continua('', leggiUna); cicli++ }
    assert.equal(cicli, primaLettura.GIRI_MASSIMI)
    assert.equal(store.cursore('prima:agendamac'), 'fatto')
    assert.equal(primaLettura.eUnaPrima(), false)
    assert.equal(imparato, 1)
    assert.ok(store.cursore('prima:imparato'))
  } finally {
    primaLettura.perProva(null)
    cfg.scrivi({}, { togli: ['agendamac'] })
  }
})
