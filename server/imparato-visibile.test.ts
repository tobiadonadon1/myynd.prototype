// Che si veda quello che ha imparato, dove lo usa.
//
// «I don't feel like it's learning from how I work.» Imparava, ma la bozza
// non lo diceva. Qui si prova che:
//
//   · una bozza a Leo che segue una regola sul tono porta sulla riga quale
//     regola, con quante correzioni l'hanno insegnata; la prima volta lo dice
//     sul filo, una volta sola; tolta la regola, la riga smette di dirla;
//   · un documento segue le convinzioni tenute da un lavoro corretto, e lo dice;
//   · un documento corretto fa nascere una convinzione che chiede «Lo faccio
//     sempre?» sul filo, e il sì la fa pesare;
//   · una frase su un'altra persona, per nome, non entra nella memoria.
//
//   node --test server/imparato-visibile.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-imparato-visibile-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const compiti = await import('./compiti.ts')
const ab = await import('./abitudini.ts')
const voce = await import('./voce.ts')
const memoria = await import('./memoria.ts')
const attenzione = await import('./attenzione.ts')
const compatibile = await import('./compatibile.ts')
type Evento = import('./compiti.ts').Evento
type Ferri = NonNullable<Parameters<typeof compiti.perProva>[0]>

before(() => store.azzeraTutto())
beforeEach(() => { store.azzeraTutto(); voce.dimentica(); cfg.scrivi({ lingua: 'en', nome: 'Alex' }) })
after(() => {
  compiti.perProva(null)
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const CONSEGNE = join(CASA, 'consegne')
const salvaInCasa: Ferri['salvaConsegna'] = o => {
  mkdirSync(join(CONSEGNE, o.luogo), { recursive: true })
  const nome = `${o.titolo.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.md`
  const percorso = join(CONSEGNE, o.luogo, nome)
  writeFileSync(percorso, o.testo)
  return { percorso, nome, luogo: o.luogo }
}
const nonDisponibile: Ferri['giudica'] = async () => ({ esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [] })
const nonChiede: Ferri['chiedeAiuto'] = async () => ({ chiede: false, manca: [], domanda: '' })
function prova(f: Ferri) {
  compiti.perProva({ giudica: nonDisponibile, prossimoPasso: async () => null, salvaConsegna: salvaInCasa, chiedeAiuto: nonChiede,
    domandeDaFare: async () => [], postaCollegata: () => false, ...f })
}

/** Tutto quello che passa sul filo di chi ascolta, anche gli avvisi senza riga. */
function filo() {
  const sentiti: Evento[] = []
  const smetti = compiti.ascolta(e => { sentiti.push(e) }, null)
  const aspetta = (vale: (e: Evento) => boolean, ms = 3000) => new Promise<Evento>((ok, no) => {
    const t0 = Date.now()
    const giro = () => {
      const e = sentiti.find(vale)
      if (e) return ok(e)
      if (Date.now() - t0 > ms) return no(new Error(`niente entro ${ms}ms: ${sentiti.map(x => x.fase).join(' → ')}`))
      setTimeout(giro, 15)
    }
    giro()
  })
  return { sentiti, aspetta, smetti }
}

const LEO = 'leo@studio.example'
/** Una regola sul tono in vigore: il saluto tolto, due volte, da bozze a Leo e a Nora. */
function regolaSaluto() {
  const ora = new Date().toISOString()
  store.default.prepare(`INSERT INTO abitudini (chiave, genere, dati, prova, fiducia, stato, testoSuo, visto, aggiornato, tolta) VALUES (?, 'bozza.tono', ?, ?, 1, 'osservata', NULL, ?, ?, NULL)`)
    .run('bozza.tono:saluto-via', JSON.stringify({ tratto: 'saluto-via', da: 'Dear {nome},', chi: `${LEO},nora@harbor.example` }),
      JSON.stringify({ casi: 2, su: null, esempi: [], dal: ora }), ora, ora)
}

async function affidaEAspetta(id: string, testo: string) {
  store.scriviCompito({ id, testo, ordine: id })
  const f = filo()
  compiti.affida(id, 'bozza')
  await f.aspetta(e => e.fase === 'pronto' && e.id === id)
  // gli avvisi arrivano nello stesso giro del pronto
  await new Promise(r => setTimeout(r, 30))
  f.smetti()
  return f.sentiti
}

test('una bozza a Leo che segue una regola sul tono lo dice sulla riga, e la prima volta sul filo, una volta sola', async () => {
  regolaSaluto()
  prova({ svolgi: async () => ({ testo: 'Leo, the logo files are attached in all four formats.\n\nBest,', fonti: [] }) })
  const sentiti = await affidaEAspetta('c-leo-1', `Reply to ${LEO} about the logo files`)
  const regole = store.compito('c-leo-1')!.voceScritta?.regole
  assert.deepEqual(regole?.map(r => [r.chiave, r.genere, r.casi]), [['bozza.tono:saluto-via', 'bozza.tono', 2]])
  assert.equal(regole?.[0]?.dati?.tratto, 'saluto-via', 'i dati, per dirla nella lingua dell\'app')
  const usata = sentiti.filter(e => e.fase === 'usata')
  assert.equal(usata.length, 1)
  assert.equal(usata[0]!.fase === 'usata' && usata[0]!.regola.chiave, 'bozza.tono:saluto-via')
  // la seconda bozza la segue ancora, ma non lo ridice
  const ancora = await affidaEAspetta('c-leo-2', `Reply to ${LEO} about the invoice`)
  assert.equal(store.compito('c-leo-2')!.voceScritta?.regole?.length, 1)
  assert.equal(ancora.filter(e => e.fase === 'usata').length, 0)
  // un caso in più non cancella la prima volta
  ab.aggiungiCaso({ chiave: 'bozza.tono:saluto-via', genere: 'bozza.tono', dati: { tratto: 'saluto-via' }, esempio: { quando: new Date().toISOString(), testo: 'x', doc: null } })
  assert.ok(ab.riga('bozza.tono:saluto-via')!.prova.usata)
  // tolta dalla Memoria (o con «Undo»): la riga smette di dirla, la prossima bozza non la segue
  ab.cambia('bozza.tono:saluto-via', 'togli')
  const vista = attenzione.compitiAttuali().find(c => c.id === 'c-leo-1')!
  assert.deepEqual(vista.voceScritta?.regole, [])
  assert.equal(voce.perRiga({ doc: null, testo: `Reply to ${LEO} about the logo`, nota: null })?.regole, undefined)
})

test('il blocco che legge il modello e le regole che la bozza dice di aver seguito sono le stesse', () => {
  regolaSaluto()
  const v = voce.perRiga({ doc: null, testo: `Reply to ${LEO} about the logo`, nota: null })!
  assert.match(v.blocco, /Non apre con un saluto/)
  assert.deepEqual(v.regole?.map(r => r.chiave), ['bozza.tono:saluto-via'])
  // una regola di una persona sola non è seguita da una bozza per un'altra
  store.default.prepare("UPDATE abitudini SET dati = json_set(dati, '$.soloA', 'nora@harbor.example')").run()
  const altra = voce.perRiga({ doc: null, testo: `Reply to ${LEO} about the logo`, nota: null })
  assert.equal(altra?.regole, undefined)
  assert.doesNotMatch(altra?.blocco ?? '', /Non apre con un saluto/)
})

test('un documento segue le convinzioni tenute da un lavoro corretto, e lo dice; quelle che aspettano no', async () => {
  const tenuta = store.ricorda({ enunciato: 'Puts the decision in the first line of every document', ambito: 'persona', genere: 'indotta', fiducia: 0.6, origine: 'correzione' })
  store.confermaConvinzione(tenuta)
  store.ricorda({ enunciato: 'Uses tables for every comparison', ambito: 'persona', genere: 'indotta', fiducia: 0.6, origine: 'correzione' })
  store.ricorda({ enunciato: 'Prefers morning meetings over afternoon ones', ambito: 'persona', genere: 'esplicita', fiducia: 0.95, origine: 'conversazione' })
  prova({ svolgi: async () => ({ testo: 'Decision: we start the pilot on Tuesday.\n\nThe plan for the pilot, in three short parts that say who does what and when, with the budget and the two goals.', fonti: [] }) })
  const sentiti = await affidaEAspetta('c-doc-1', 'Write the kickoff plan for the Harbor pilot')
  const regole = store.compito('c-doc-1')!.voceScritta?.regole
  assert.deepEqual(regole?.map(r => [r.chiave, r.genere, r.testo]), [[tenuta, 'convinzione', 'Puts the decision in the first line of every document']])
  assert.equal(sentiti.filter(e => e.fase === 'usata').length, 1)
  // scordata in Memoria: la riga non la dice più
  store.scordaConvinzione(tenuta)
  assert.deepEqual(attenzione.compitiAttuali().find(c => c.id === 'c-doc-1')!.voceScritta?.regole, [])
})

test('un documento corretto: la convinzione che nasce chiede «Lo faccio sempre?» sul filo, e il sì la fa pesare', async () => {
  // il percorso intero, con il modello finto dietro la memoria vera
  compiti.perProva(null)
  cfg.scrivi({ lingua: 'en', nome: 'Alex', motore: 'compatibile', compatibile: { url: 'https://memoria.test/v1', modello: 'test' } })
  compatibile.usaRete((async () => Response.json({
    choices: [{ message: { role: 'assistant', content: JSON.stringify({ progetti: [], convinzioni: [
      { enunciato: 'Puts the decision in the first line of every document', ambito: 'persona', genere: 'indotta', fiducia: 0.5, premesse: [], citazione: '', sostituisce: '', soggetto: 'lei' }
    ] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 }
  })) as typeof fetch)
  const f = filo()
  assert.equal(compiti.imparaSeCorretto('The pilot plan.\n\nWe start on Tuesday.', 'We start on Tuesday.\n\nThe pilot plan.'), null)
  const e = await f.aspetta(x => x.fase === 'sempre')
  f.smetti()
  assert.ok(e.fase === 'sempre')
  assert.equal(e.convinzione.enunciato, 'Puts the decision in the first line of every document')
  // finché non dice sì non pesa; il sì è il «Tienila» di sempre
  assert.doesNotMatch(memoria.carta(), /decision in the first line/)
  assert.ok(store.confermaConvinzione(e.convinzione.id))
  assert.match(memoria.carta(), /decision in the first line/)
  assert.deepEqual(memoria.imparateDaCorrezioni().map(k => k.id), [e.convinzione.id])
  compatibile.usaRete(null)
})

test('una mail corretta non chiede «Lo faccio sempre?»: va alle regole sul tono', async () => {
  let chiesto = false
  prova({ svolgi: async () => ({ testo: '', fonti: [] }), imparaDalDocumento: async () => { chiesto = true; return { id: 'x', enunciato: 'y' } } })
  compiti.imparaSeCorretto('Dear Leo,\n\nthe files are attached here for you.\n\nBest,', 'Hi Leo,\n\nthe files are attached here for you.\n\nBest,', { email: true, destinatario: { indirizzo: LEO, nome: 'Leo' } })
  await new Promise(r => setTimeout(r, 20))
  assert.equal(chiesto, false)
})

test('una frase su un\'altra persona, per nome, non entra nella memoria; una su di lui sì', async () => {
  compiti.perProva(null)
  cfg.scrivi({ lingua: 'en', nome: 'Tobia', motore: 'compatibile', compatibile: { url: 'https://memoria.test/v1', modello: 'test' } })
  const c = (enunciato: string, soggetto: string) => ({ enunciato, ambito: 'persona', genere: 'indotta', fiducia: 0.5, premesse: [], citazione: '', sostituisce: '', soggetto })
  compatibile.usaRete((async () => Response.json({
    choices: [{ message: { role: 'assistant', content: JSON.stringify({ progetti: [], convinzioni: [
      // il modello dice il soggetto giusto: si scarta per quello
      c('Nick evaluates audit levers by their impact on the margin', 'Nick'),
      // il modello sbaglia il soggetto: si scarta lo stesso, perché «Nick» è un nome nello scambio
      c("Nick's team reviews the audit every Friday", 'lei'),
      c('Starts every audit conversation from the numbers', 'lei'),
      c('With Nick, leads with the margin before the levers', 'lei')
    ] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 }
  })) as typeof fetch)
  const n = await memoria.distilla([
    { ruolo: 'u', testo: 'I talked with Nick about the audit: he evaluates every lever by margin impact. I always start from the numbers.' },
    { ruolo: 'a', testo: 'Got it.' }
  ])
  assert.equal(n, 2)
  assert.deepEqual(store.convinzioni().map(k => k.enunciato).sort(), ['Starts every audit conversation from the numbers', 'With Nick, leads with the margin before the levers'])
  compatibile.usaRete(null)
})

test('il controllo del soggetto, senza modello', () => {
  const scambio = 'I met Priya yesterday and she said the board wants numbers. Prefers short notes.'
  assert.equal(memoria.parlaDiUnAltro('Priya wants the numbers before the board', { scambio }), true)
  assert.equal(memoria.parlaDiUnAltro('Priya wants the numbers before the board', { noti: new Set(['priya']) }), true)
  assert.equal(memoria.parlaDiUnAltro('Prefers short notes over long decks', { scambio }), false, 'un verbo in testa non è un nome')
  assert.equal(memoria.parlaDiUnAltro('Tobia prefers short notes', { scambio: 'and Tobia said', nomeSuo: 'Tobia Donadon' }), false, 'il suo nome è lui')
  assert.equal(memoria.parlaDiUnAltro('Always copies the accountant on invoices', { scambio: 'and Always' }), false)
  assert.equal(memoria.parlaDiUnAltro('Checks the margin first', { soggetto: 'Lei' }), false)
  assert.equal(memoria.parlaDiUnAltro('Checks the margin first', { soggetto: 'Marco' }), true)
  assert.equal(memoria.parlaDiUnAltro('Claude Code is the main tool for the app', { scambio: 'with Claude Code' }), false)
})
