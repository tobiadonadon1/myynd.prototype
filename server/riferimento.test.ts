// Il riferimento: chiesto una volta, tenuto con le sue parole, richiesto
// quando invecchia. E la lettura che ne fa il codice: chi è morto, chi è
// bloccato.
//
//   node --test server/riferimento.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-riferimento-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Tobia' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const riferimento = await import('./riferimento.ts')
const domande = await import('./domande.ts')
after(() => { domande.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

const GIORNO = 86_400_000
const evermute = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship Evermute 1.0' })
const sito = progetti.scrivi({ nome: 'Sito', obiettivo: 'Three offers online' })
const ceru = progetti.scrivi({ nome: 'Ceru', obiettivo: 'Move in' })
// le alte si chiedono per prime
progetti.cambia(evermute.id, { priorita: 'alta' })

test('la domanda è una, corta, su un progetto solo, nella lingua dell’app', () => {
  assert.equal(riferimento.leggi().testo, '')
  assert.equal(riferimento.chiediRiferimento(), true)
  const d = store.domandaAperta()
  assert.ok(d && d.tema === riferimento.TEMA)
  // il 20 ottobre era «For each project: … The projects I know: …» con sette nomi
  assert.equal(d.testo, 'What are you working on in Evermute right now?')
  assert.equal(d.progetto, evermute.id)
  assert.doesNotMatch(d.testo, /Sito|Ceru/)
  // già aperta: non se ne apre un'altra
  assert.equal(riferimento.chiediRiferimento(), false)
  assert.equal(store.domandeConTema('riferimento').length, 1)
})

test('la risposta è la riga del progetto, parola per parola; il progetto dopo si chiede il giorno dopo', async () => {
  let chiamate = 0
  domande.perProva({ chiediJSON: (async () => { chiamate++; return null }) as never })
  riferimento.scrivi('Sito: dead, I dropped it.\nEvermute: old line', { registra: false })
  const d = store.domandaAperta()!
  const { esito } = await domande.rispondiADomanda(d.id, 'shipping 1.0, waiting on Apple.')
  assert.equal(chiamate, 0, 'il riferimento non passa dal modello')
  assert.equal(esito, 'Noted.')
  assert.equal(riferimento.leggi().testo, 'Sito: dead, I dropped it.\nEvermute: shipping 1.0, waiting on Apple.')
  assert.equal(store.domandaAperta(), null)
  assert.equal(store.domanda(d.id)?.stato, 'risposta')
  // lo stesso giorno non si chiede altro
  assert.equal(riferimento.chiediRiferimento(), false)
  // il giorno dopo: Evermute è detto, Sito è nel blocco scritto adesso, tocca a Ceru
  assert.equal(riferimento.chiediRiferimento(Date.now() + 1.1 * GIORNO), true)
  const dopo = store.domandaAperta()!
  assert.equal(dopo.id, d.id, 'la stessa riga, riaperta')
  assert.equal(dopo.testo, 'What are you working on in Ceru right now?')
  assert.equal(dopo.progetto, ceru.id)
})

test('la lettura del codice: morti e bloccati per nome, e la negazione spegne la parola', () => {
  const suoi = [evermute, sito, ceru]
  const testo = 'Evermute: shipping 1.0, waiting on Apple. Sito: dead, I dropped it. Ceru: blocked on the contract with Marta.'
  const morti = riferimento.progettiMorti(testo, suoi)
  assert.deepEqual([...morti], [sito.id])
  const bloccati = riferimento.progettiBloccati(testo, suoi)
  assert.ok(bloccati.has(ceru.id))
  assert.ok(bloccati.has(evermute.id), '«waiting on Apple» è un blocco')
  assert.ok(!bloccati.has(sito.id))
  assert.deepEqual([...riferimento.progettiMorti('Evermute is not dead, just slow.\nSito: still alive.', suoi)], [])
  assert.deepEqual([...riferimento.progettiMorti('', suoi)], [])
})

test('«niente di abbandonato» non uccide un progetto, e «dropped the port» nemmeno', () => {
  const suoi = [evermute, sito, ceru]
  const morti = (t: string) => [...riferimento.progettiMorti(t, suoi)]
  const bloccati = (t: string) => [...riferimento.progettiBloccati(t, suoi)]
  // la risposta più comune per un progetto vivo, nelle due lingue
  assert.deepEqual(morti('Evermute: working on 1.0, nothing dropped, nothing blocked.'), [])
  assert.deepEqual(bloccati('Evermute: working on 1.0, nothing dropped, nothing blocked.'), [])
  assert.deepEqual(morti('Evermute: lavoro alla 1.0, niente di abbandonato, niente di bloccato.'), [])
  assert.deepEqual(bloccati('Evermute: lavoro alla 1.0, niente di abbandonato, niente di bloccato.'), [])
  assert.deepEqual(morti('Evermute: nessun progetto abbandonato.'), [])
  // una parte del progetto lasciata non è il progetto lasciato
  assert.deepEqual(morti('Evermute: working on 1.0, dropped the Windows port.'), [])
  assert.deepEqual(morti('Evermute: ho chiuso il contratto con Apple.'), [])
  // la negazione vale fino alla virgola: dopo, la parola torna a contare
  assert.deepEqual(bloccati('Ceru: nothing new, blocked on the contract.'), [ceru.id])
  // i plurali italiani
  assert.deepEqual(morti('Sito e Ceru: abbandonati.').sort(), [sito.id, ceru.id].sort())
  assert.deepEqual(bloccati('Ceru e Sito: bloccati.').sort(), [sito.id, ceru.id].sort())
  // e quello che valeva prima vale ancora
  assert.deepEqual(morti('Sito: dead, I dropped it in August.'), [sito.id])
  assert.deepEqual(morti('Evermute is not dead, just slow.'), [])
})

test('lasciata cadere, tace per una settimana; e quando di tutti ha detto da poco, non chiede', async () => {
  const d = store.domandaAperta()!
  domande.ignora(d.id)
  assert.equal(store.domandaAperta(), null)
  assert.equal(riferimento.chiediRiferimento(Date.now() + 2 * GIORNO), false)
  assert.equal(riferimento.chiediRiferimento(Date.now() + 8 * GIORNO), true)
  const di = store.domandaAperta()!
  assert.equal(di.progetto, ceru.id)
  await domande.rispondiADomanda(di.id, 'Blocked on the contract with Marta')
  assert.ok(riferimento.progettiBloccati(riferimento.leggi().testo, [evermute, sito, ceru]).has(ceru.id))
  // tutti detti da meno di due settimane: niente da chiedere
  assert.equal(riferimento.daChiedere(Date.now() + 2 * GIORNO), null)
  assert.equal(riferimento.chiediRiferimento(Date.now() + 2 * GIORNO), false)
  // dopo due settimane si ricomincia
  assert.ok(riferimento.daChiedere(Date.now() + 15 * GIORNO))
})

test('«paused» e «in pausa» fermano le proposte come «dropped»', () => {
  assert.deepEqual([...riferimento.progettiMorti('Ceru: paused until January', [evermute, sito, ceru])], [ceru.id])
  assert.deepEqual([...riferimento.progettiMorti('Ceru: in pausa fino a gennaio', [evermute, sito, ceru])], [ceru.id])
})

test('un nome lungo una frase si accorcia nella domanda', () => {
  assert.equal(riferimento.nomeBreve('H-Farm: I want to help to solidify AI Systems to Streamline company efforts.'), 'H-Farm')
  assert.equal(riferimento.domandaDiRiferimento({ nome: 'H-Farm: I want to help to solidify AI Systems.' }), 'What are you working on in H-Farm right now?')
})

test('scrivi: vuoto non si accetta, e il tetto vale', () => {
  assert.throws(() => riferimento.scrivi('   '), /Scrivi qualcosa/)
  riferimento.scrivi('x'.repeat(2000))
  assert.equal(riferimento.leggi().testo.length, 1500)
})

test('i nomi in testa alle righe del riferimento che sono cartelle di lavoro diventano progetti; gli altri no', async () => {
  const store = await import('./store.ts')
  const progetti = await import('./progetti.ts')
  const r = await import('./riferimento.ts')
  assert.deepEqual(r.nomiNelRiferimento('x-engine: on: posting. dead: nothing.\nNextas, H-Brain and soleagencyweb: status unknown\nEvermute (everwave): on: the review\nno colon here\nNote: nothing else'),
    ['x-engine', 'Nextas', 'H-Brain', 'soleagencyweb', 'Evermute', 'Note'])
  store.salvaDocumenti([
    { id: 'lavoro:/Users/t/x-engine', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: x-engine', corpo: 'Cartella di lavoro', percorso: '/Users/t/x-engine', quando: new Date().toISOString() },
    { id: 'lavoro:/Users/t/nextas-outreach-agent', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: nextas-outreach-agent', corpo: 'Cartella di lavoro', percorso: '/Users/t/nextas-outreach-agent', quando: new Date().toISOString() },
    { id: 'lavoro:/Users/t/Desktop/everwave', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: everwave', corpo: 'Cartella di lavoro', percorso: '/Users/t/Desktop/everwave', quando: new Date().toISOString() }
  ] as never)
  progetti.scrivi({ nome: 'Evermute deck', obiettivo: 'Ship the deck' })
  const creati = r.registraProgettiNominati('x-engine: on: posting.\nNextas, H-Brain: status unknown\nEvermute (everwave): on: the review\nNote: nothing else')
  assert.deepEqual(creati, ['x-engine', 'Nextas'], 'H-Brain non ha cartella qui, Evermute esiste già, everwave è fra parentesi, Note non è una cartella')
  assert.ok(progetti.trovaPerNome('x-engine'))
  assert.equal(r.registraProgettiNominati('x-engine: still on').length, 0, 'la seconda volta non ne crea un altro')
})

test('«Evermute (everwave)» nel riferimento fa di everwave un altro nome di Evermute', async () => {
  const progetti = await import('./progetti.ts')
  const r = await import('./riferimento.ts')
  // il nome esatto vince sul prefisso: se una prova prima ha creato «Evermute», è quello
  const ev = progetti.trovaPerNome('Evermute') ?? progetti.trovaPerNome('Evermute deck')!
  const a = r.aliasDalTesto('Evermute (everwave, EverMute app): on: the review\nx-engine: on: posting\nNote (irrelevant): nothing', progetti.vivi())
  assert.equal(a.get('everwave'), ev.id)
  assert.equal(a.get('evermute app'), ev.id)
  assert.equal(a.has('irrelevant'), false, 'un nome che non è un progetto non porta alias')
})

/*
 * La domanda aperta dice i progetti di adesso.
 *
 * Il testo si scriveva all'apertura, e con tre progetti vivi diceva ancora
 * «I progetti che conosco: Sito Northwind». Si riscrive servendola: la stessa
 * domanda, con lo stesso orario, non una nuova.
 */
test('la domanda di prima, su tutti i progetti insieme, diventa quella corta su uno solo', () => {
  const gia = store.domandaPerTema(riferimento.TEMA)!
  store.riapriDomanda(gia.id, 'For each project: what are you working on now, what have you dropped, and what is blocked? The projects I know: Evermute.', ['Evermute'], null)
  const prima = store.domandaAperta()!
  assert.equal(prima.progetto ?? null, null)
  const nw = progetti.scrivi({ nome: 'Northwind', obiettivo: 'Launch the new site' })
  const d = riferimento.aggiornata(store.domandaAperta())!
  assert.equal(d.id, prima.id)
  assert.equal(d.testo, 'What are you working on in Northwind right now?')
  assert.equal(d.progetto, nw.id)
  const salvata = store.domandaAperta()!
  assert.equal(salvata.testo, d.testo, 'what the page shows is what is stored')
  assert.equal(salvata.progetto, nw.id)
  assert.equal(salvata.creata, prima.creata, 'it is the same question, asked at the same time')
  assert.equal(store.domandeConTema(riferimento.TEMA).length, 1)
  // una domanda d'altro tema non si tocca
  assert.equal(riferimento.aggiornata(null), null)
})

test('una riga del riferimento è del progetto nominato per primo, e di nessun altro', () => {
  const farm = progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Bring AI into the family company' })
  const myynd = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Sell the Mac app' })
  const nomi: [string, string][] = [['H-Farm', farm.id], ['Myynd', myynd.id], ['H-Farm audit', 'audit']]
  // la sua riga del 29 settembre: H-Farm, che nomina Myynd; fino al 21 ottobre andava a tutti e due
  const riga = 'H Farm is my family company. I just want to get more involved in it. Myynd is a part of it.'
  assert.equal(riferimento.diChiERiga(riga, nomi), farm.id)
  assert.equal(riferimento.diChiERiga('Myynd, that product is basically you. Maybe H-Farm later.', nomi), myynd.id)
  assert.equal(riferimento.diChiERiga('H-Farm audit: due Friday', nomi), 'audit', 'a pari posto vince il nome più lungo')
  assert.equal(riferimento.diChiERiga('My website right now is good.', nomi), null)
  const testo = `${riga}\n\nMyynd, that product is basically you.`
  assert.deepEqual(riferimento.righeDel(myynd.id, testo, nomi), ['Myynd, that product is basically you.'])
  assert.deepEqual(riferimento.righeDel(farm.id, testo, nomi), [riga])
})

test('il riferimento vecchio di più di due settimane lo dice al modello', () => {
  const ora = Date.parse('2026-10-21T12:00:00Z')
  assert.equal(riferimento.vecchio({ testo: 'Myynd: x', aggiornato: '2026-09-29T18:58:07Z' }, ora), true)
  assert.match(riferimento.avvisoVecchio({ testo: 'Myynd: x', aggiornato: '2026-09-29T18:58:07Z' }, ora), /2026-09-29/)
  assert.equal(riferimento.avvisoVecchio({ testo: 'Myynd: x', aggiornato: '2026-10-15T00:00:00Z' }, ora), '')
  assert.equal(riferimento.vecchio({ testo: '', aggiornato: '2026-09-01T00:00:00Z' }, ora), false)
})

test('il progetto di un testo è quello nominato per primo, non quello dal nome più lungo', async () => {
  const attenzione = await import('./attenzione.ts')
  const nextas = progetti.scrivi({ nome: 'Nextas', obiettivo: 'Book paid audits' })
  const myynd = progetti.elenco('attivo').find(p => p.nome === 'Myynd')!
  assert.equal(attenzione.progettoDelTesto('Draft the X posts that announce Myynd for Nextas'), myynd.id)
  assert.equal(attenzione.progettoDelTesto('Send the Nextas audit deck, then a Myynd update'), nextas.id)
})

test('una riga con più nomi in testa è di tutti quelli della testa', () => {
  const nomi: [string, string][] = [['Nextas', 'n'], ['H-Brain', 'h'], ['Myynd', 'm']]
  assert.deepEqual(riferimento.diChiSonoRiga('Nextas, H-Brain: waiting on the quote', nomi), ['n', 'h'])
  assert.deepEqual(riferimento.righeDel('h', 'Nextas, H-Brain: waiting on the quote\nMyynd: shipping', nomi), ['Nextas, H-Brain: waiting on the quote'])
  assert.deepEqual(riferimento.diChiSonoRiga('H Farm is family. Myynd is a part of it.', [['H-Farm', 'f'], ['Myynd', 'm']]), ['f'])
})
