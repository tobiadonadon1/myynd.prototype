// Come vedo la sua settimana, e la frase che la corregge: dai cambi capiti
// alle regole che fermano davvero il lavoro.
//
//   node --import ./build/test-profile.mjs --test server/correzione.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-correzione-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Anna' }))
const db = (await import('./store.ts')).default
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const progetti = await import('./progetti.ts')
const riferimento = await import('./riferimento.ts')
const quadro = await import('./quadro.ts')
const regole = await import('./regole-sue.ts')
const motivo = await import('./motivo.ts')
const daSe = await import('./da-se.ts')
const correzione = await import('./correzione.ts')

after(() => { correzione.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

// una cliente inventata: tre progetti attivi e uno in pausa
const nextas = progetti.scrivi({ nome: 'Nextas', obiettivo: 'Launch the booking app' })
const hfarm = progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Run the pilot with the family company' })
const orbit = progetti.scrivi({ nome: 'Orbit', obiettivo: 'Grow the newsletter' })
const lumen = progetti.scrivi({ nome: 'Lumen', obiettivo: 'Finish the photo book' })
progetti.cambia(hfarm.id, { priorita: 'alta' })
progetti.cambia(lumen.id, { stato: 'fermo' })

/** Il modello finto: torna quello che gli si dà, e conta le chiamate. */
let chiamate = 0
function modello(risposta: unknown) {
  chiamate = 0
  correzione.perProva({ collegato: () => true, chiediJSON: (async () => { chiamate++; return risposta }) as never })
}
const cambio = (c: Record<string, unknown>) => ({ tipo: '', progetto: '', altro: '', stato: '', fino: '', alta: '', regola: '', lavoro: '', parole: [], testo: '', ...c })

beforeEach(() => {
  for (const r of regole.elenco()) regole.togli(r.id)
  db.exec("DELETE FROM feed")
})

test('la vista: gli attivi in ordine, gli alti davanti; in pausa fra quello che lascia stare', async () => {
  const v = await correzione.comeLaVedo()
  assert.equal(v.ordine[0].nome, 'H-Farm', 'la priorità alta viene prima')
  assert.deepEqual(new Set(v.ordine.map(r => r.nome)), new Set(['H-Farm', 'Nextas', 'Orbit']))
  assert.ok(v.lasciati.some(l => l.genere === 'pausa' && l.nome === 'Lumen'))
})

test('una frase diventa cambi dal set chiuso, e ognuno si fa e si disfa', async () => {
  // ordine: Nextas prima di H-Farm; H-Farm è alta, quindi Nextas lo diventa
  modello({ cambi: [cambio({ tipo: 'ordine', progetto: 'Nextas', altro: 'H-Farm' })], domanda: '' })
  let e = await correzione.correggi('Nextas comes before H-Farm')
  assert.equal(chiamate, 1, 'una chiamata sola')
  assert.equal(e.genere, 'cambi')
  if (e.genere !== 'cambi') return
  const ordine = cfg.leggi().ordineBlocchi ?? []
  assert.ok(ordine.indexOf(nextas.id) < ordine.indexOf(hfarm.id))
  assert.equal(progetti.trova(nextas.id)!.priorita, 'alta')
  assert.equal((await correzione.comeLaVedo()).ordine[0].nome, 'Nextas')
  assert.match(e.correzione.cambi[0].riga, /Nextas now comes before H-Farm, and is high priority too/)
  correzione.disfa(e.correzione.id, 0)
  assert.equal(progetti.trova(nextas.id)!.priorita, null, 'annulla toglie anche l\'alta')
  assert.deepEqual(cfg.leggi().ordineBlocchi ?? [], [])

  // pausa con una fine
  modello({ cambi: [cambio({ tipo: 'stato', progetto: 'H-Farm', stato: 'fermo', fino: '2099-12-01' })], domanda: '' })
  e = await correzione.correggi('pause H-Farm until December')
  assert.equal(e.genere, 'cambi')
  if (e.genere !== 'cambi') return
  assert.equal(progetti.trova(hfarm.id)!.stato, 'fermo')
  const lasciato = (await correzione.comeLaVedo()).lasciati.find(l => l.id === hfarm.id)
  assert.ok(lasciato && lasciato.genere === 'pausa' && lasciato.fino === '2099-12-01')
  correzione.disfa(e.correzione.id, 0)
  assert.equal(progetti.trova(hfarm.id)!.stato, 'attivo')
  assert.equal(progetti.trova(hfarm.id)!.priorita, 'alta', 'la priorità di prima torna')
  assert.equal(regole.pausaDi(hfarm.id), null)

  // la cosa di questa settimana: la sua riga nel riferimento, attribuita al progetto
  modello({ cambi: [cambio({ tipo: 'fuoco', progetto: 'Nextas', testo: 'launch' })], domanda: '' })
  e = await correzione.correggi('This week on Nextas I am only on the launch')
  assert.equal(e.genere, 'cambi')
  if (e.genere !== 'cambi') return
  assert.deepEqual(riferimento.righeDel(nextas.id), ['Nextas: This week on Nextas I am only on the launch'])
  const riga = (await correzione.comeLaVedo()).ordine.find(r => r.id === nextas.id)!
  assert.equal(riga.suo, true)
  assert.equal(riga.fuoco, 'This week on Nextas I am only on the launch')
  correzione.disfa(e.correzione.id, 0)
  assert.equal(riferimento.leggi().testo, '')

  // un altro nome
  modello({ cambi: [cambio({ tipo: 'alias', progetto: 'Nextas', altro: 'Trey' })], domanda: '' })
  e = await correzione.correggi('Trey is part of Nextas')
  assert.equal(e.genere, 'cambi')
  if (e.genere !== 'cambi') return
  assert.deepEqual(progetti.trova(nextas.id)!.alias, ['Trey'])
  correzione.disfa(e.correzione.id, 0)
  assert.deepEqual(progetti.trova(nextas.id)!.alias, [])

  // priorità
  modello({ cambi: [cambio({ tipo: 'priorita', progetto: 'Orbit', alta: 'si' })], domanda: '' })
  e = await correzione.correggi('Orbit is the most important thing right now')
  assert.equal(e.genere, 'cambi')
  if (e.genere !== 'cambi') return
  assert.equal(progetti.trova(orbit.id)!.priorita, 'alta')
  correzione.disfa(e.correzione.id, 0)
  assert.equal(progetti.trova(orbit.id)!.priorita, null)
})

test('una regola «mai» si scrive, compare fra quello che lascia stare, e si disfa', async () => {
  modello({ cambi: [cambio({ tipo: 'regola', regola: 'mai', testo: 'No video scripts', lavoro: 'copione-video', parole: ['video script', 'copione video'] })], domanda: '' })
  const e = await correzione.correggi('stop writing video scripts')
  assert.equal(e.genere, 'cambi')
  if (e.genere !== 'cambi') return
  assert.equal(regole.elenco().length, 1)
  assert.ok((await correzione.comeLaVedo()).lasciati.some(l => l.genere === 'regola' && l.nome === 'No video scripts'))
  correzione.disfa(e.correzione.id, 0)
  assert.equal(regole.elenco().length, 0)
})

test('la regola ferma davvero: le mosse del quadro, il lavoro da sé, la riga in lista, la carta già sul feed', async () => {
  const mossa = (titolo: string): import('./quadro.ts').Mossa => ({ genere: 'lavoro', titolo, testo: 'Sixty seconds on what shipped this week.', leva: 3, urgenza: 'oggi', offerta: 'I write it.', prova: 'shipped the booking flow', doc: null, origine: 'memoria' })
  const q = { progetto: nextas.id, nome: 'Nextas', stato: '', traguardo: 'First booking', blocco: '', quando: new Date().toISOString(), impronta: 'x',
    mosse: [mossa('Write a 60 second video script for Nextas'), mossa('Email the beta list about the booking flow')] }
  assert.equal(quadro.scegli([q], [])[0].titolo, 'Write a 60 second video script for Nextas', 'prima della regola è la più forte')
  assert.equal(daSe.lavora.length > 0, true)
  const carta = { id: 'copione-video-x', origine: daSe.ORIGINE_VIDEO, progetto: nextas.id } as never
  assert.equal(motivo.motivoDi({ origine: 'lato', progetto: nextas.id, testo: 'Video script for Nextas' }), 'chiesto')
  store.salvaFeed([{ tipo: 'Proposta', titolo: 'Record a video script for the Nextas launch', testo: 'The launch is next week.', offerta: 'I draft the script.', progetto: nextas.id }])

  modello({ cambi: [cambio({ tipo: 'regola', regola: 'mai', testo: 'No video scripts', lavoro: 'copione-video', parole: ['video script'] })], domanda: '' })
  const e = await correzione.correggi('stop writing video scripts')
  assert.equal(e.genere, 'cambi')

  assert.equal(quadro.scegli([q], [])[0].titolo, 'Email the beta list about the booking flow', 'la mossa fermata cade')
  assert.equal((await daSe.lavora(carta)).ritira, 'Stopped by your rule', 'il copione in coda non parte')
  assert.equal(motivo.motivoDi({ origine: 'lato', progetto: nextas.id, testo: 'Video script for Nextas' }), null, 'la riga non ha più ragione')
  assert.equal(motivo.motivoDi({ origine: 'lato', progetto: nextas.id, testo: 'Email the beta list' }), 'chiesto', 'il resto sì')
  assert.equal(store.feedAperto(10).length, 0, 'la carta del feed esce subito')
  if (e.genere === 'cambi') correzione.disfa(e.correzione.id, 0)
  assert.equal(store.feedAperto(10).length, 1, 'e annulla la rimette')
})

test('una regola di un progetto vale solo lì', () => {
  regole.aggiungi({ tipo: 'mai', testo: 'No research for H-Farm', parole: ['research'], progetto: hfarm.id })
  assert.equal(regole.fermato({ testo: 'Research three competitors', progetto: hfarm.id }), true)
  assert.equal(regole.fermato({ testo: 'Research three competitors', progetto: nextas.id }), false)
})

test('una pausa arrivata alla fine riprende il progetto da sola', () => {
  progetti.cambia(orbit.id, { stato: 'fermo' })
  regole.aggiungi({ tipo: 'pausa', testo: 'Orbit', progetto: orbit.id, fino: '2020-01-01' })
  assert.deepEqual(regole.riprendiScaduti(), [orbit.id])
  assert.equal(progetti.trova(orbit.id)!.stato, 'attivo')
  assert.equal(regole.pausaDi(orbit.id), null)
})

test('una domanda non cambia niente, e non chiama il modello', async () => {
  modello({ cambi: [cambio({ tipo: 'priorita', progetto: 'Nextas', alta: 'si' })], domanda: '' })
  const e = await correzione.correggi('why is H-Farm first?')
  assert.equal(chiamate, 0)
  assert.equal(e.genere, 'risposta')
  if (e.genere === 'risposta') assert.match(e.testo, /H-Farm is first because you marked it high priority/)
  assert.equal(progetti.trova(nextas.id)!.priorita, null)
})

test('un progetto che non c\'è: una domanda di ritorno, e niente fatto', async () => {
  modello({ cambi: [cambio({ tipo: 'stato', progetto: 'Zephyr', stato: 'fermo' }), cambio({ tipo: 'priorita', progetto: 'Orbit', alta: 'si' })], domanda: '' })
  const e = await correzione.correggi('pause Zephyr and make Orbit high priority')
  assert.equal(e.genere, 'domanda')
  if (e.genere === 'domanda') assert.match(e.testo, /I don't have a project called Zephyr/)
  assert.equal(progetti.trova(orbit.id)!.priorita, null, 'nemmeno la metà che si capiva')
})

test('mai un cambio che la frase non dice', () => {
  const ctx = { progetti: progetti.elenco(), regole: [], oggi: '2026-10-21' }
  // il modello tocca Orbit, ma la frase parla solo di Nextas
  const c = correzione.valida({ cambi: [cambio({ tipo: 'priorita', progetto: 'Nextas', alta: 'si' }), cambio({ tipo: 'stato', progetto: 'Orbit', stato: 'fermo' })], domanda: '' }, 'Nextas matters most', ctx)
  assert.deepEqual(c.cambi.map(x => x.tipo), ['priorita'])
  // una regola senza una parola che la dica non nasce
  assert.equal(correzione.valida({ cambi: [cambio({ tipo: 'regola', regola: 'mai', testo: 'No research', parole: ['research'] })], domanda: '' }, 'Nextas research went well', ctx).cambi.length, 0)
  // una pausa senza una fine detta non ne inventa una
  const p = correzione.valida({ cambi: [cambio({ tipo: 'stato', progetto: 'Orbit', stato: 'fermo', fino: '2026-12-01' })], domanda: '' }, 'pause Orbit', ctx).cambi[0]
  assert.ok(p && p.tipo === 'stato' && p.fino === null)
  // una frase che non si capisce: la domanda del modello, o una sua
  assert.equal(correzione.valida({ cambi: [], domanda: 'Which launch do you mean?' }, 'the launch thing', ctx).domanda, 'Which launch do you mean?')
})

test('le parole di una regola: plurali e desinenze, in qualunque ordine', () => {
  assert.equal(regole.contiene('Write two video scripts for the launch', 'video script'), true)
  assert.equal(regole.contiene('Copioni video per Nextas', 'copione video'), true)
  assert.equal(regole.contiene('Email the video team', 'video script'), false)
})
