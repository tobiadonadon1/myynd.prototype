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

test('la domanda nasce una volta, nella lingua dell’app, con i nomi dei progetti', () => {
  assert.equal(riferimento.leggi().testo, '')
  assert.equal(riferimento.chiediRiferimento(), true)
  const d = store.domandaAperta()
  assert.ok(d && d.tema === riferimento.TEMA)
  // senza metafore in testa, e con le parole che la lettura riconosce nella risposta
  assert.match(d.testo, /^For each project: /)
  assert.doesNotMatch(d.testo, /bearings/i)
  assert.match(d.testo, /\bdropped\b/)
  assert.match(d.testo, /\bblocked\b/)
  const suoi = [evermute, sito, ceru]
  assert.deepEqual([...riferimento.progettiMorti('Sito: dropped.', suoi)], [sito.id])
  assert.deepEqual([...riferimento.progettiBloccati('Ceru: blocked.', suoi)], [ceru.id])
  for (const n of ['Evermute', 'Sito', 'Ceru']) assert.ok(d.testo.includes(n), `la domanda nomina ${n}`)
  // già aperta: non se ne apre un'altra
  assert.equal(riferimento.chiediRiferimento(), false)
  assert.equal(store.domandeConTema('riferimento').length, 1)
})

test('la risposta diventa il blocco, parola per parola, senza passare dal modello', async () => {
  let chiamate = 0
  domande.perProva({ chiediJSON: (async () => { chiamate++; return null }) as never })
  const d = store.domandaAperta()!
  const testo = 'Evermute: shipping 1.0, waiting on Apple. Sito: dead, I dropped it. Ceru: blocked on the contract with Marta.'
  const { esito } = await domande.rispondiADomanda(d.id, testo)
  assert.equal(chiamate, 0, 'il riferimento non passa dal modello')
  assert.match(esito, /^Noted\./)
  assert.equal(riferimento.leggi().testo, testo)
  assert.ok(riferimento.leggi().aggiornato)
  assert.equal(store.domandaAperta(), null)
  assert.equal(store.domanda(d.id)?.stato, 'risposta')
  assert.equal(riferimento.fresco(), true)
  // fresco: non si richiede
  assert.equal(riferimento.chiediRiferimento(), false)
})

test('la lettura del codice: morti e bloccati per nome, e la negazione spegne la parola', () => {
  const suoi = [evermute, sito, ceru]
  const morti = riferimento.progettiMorti(riferimento.leggi().testo, suoi)
  assert.deepEqual([...morti], [sito.id])
  const bloccati = riferimento.progettiBloccati(riferimento.leggi().testo, suoi)
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

test('dopo due settimane si richiede, riaprendo la stessa riga', () => {
  const fra15 = Date.now() + 15 * GIORNO
  assert.equal(riferimento.fresco(fra15), false)
  assert.equal(riferimento.chiediRiferimento(fra15), true)
  const d = store.domandaAperta()
  assert.ok(d && d.tema === riferimento.TEMA)
  assert.equal(d.stato, 'aperta')
  assert.equal(d.risposta, null)
  assert.equal(store.domandeConTema('riferimento').length, 1, 'la riga è la stessa, riaperta')
})

test('lasciata cadere, tace per una settimana', () => {
  const d = store.domandaAperta()!
  domande.ignora(d.id)
  assert.equal(store.domandaAperta(), null)
  // senza riferimento l'unico cancello che resta è il silenzio dopo l'ignorata
  store.scordaBlocco(riferimento.ETICHETTA)
  assert.equal(riferimento.chiediRiferimento(Date.now() + GIORNO), false)
  assert.equal(riferimento.chiediRiferimento(Date.now() + 8 * GIORNO), true)
  assert.equal(store.domandaAperta()?.tema, riferimento.TEMA)
  domande.ignora(store.domandaAperta()!.id)
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
test('la domanda aperta si riscrive con i progetti di adesso, senza diventarne un’altra', () => {
  const gia = store.domandaPerTema(riferimento.TEMA)!
  store.riapriDomanda(gia.id, 'For each project: what are you working on now, what have you dropped, and what is blocked? The projects I know: Evermute.', ['Evermute'])
  const prima = store.domandaAperta()!
  progetti.scrivi({ nome: 'Northwind', obiettivo: 'Launch the new site' })
  const d = riferimento.aggiornata(store.domandaAperta())!
  assert.equal(d.id, prima.id)
  for (const p of progetti.vivi()) assert.ok(d.testo.includes(p.nome), `the question names ${p.nome}: ${d.testo}`)
  assert.deepEqual(d.spunto, progetti.vivi().map(p => p.nome))
  const salvata = store.domandaAperta()!
  assert.equal(salvata.testo, d.testo, 'what the page shows is what is stored')
  assert.equal(salvata.creata, prima.creata, 'it is the same question, asked at the same time')
  assert.equal(store.domandeConTema(riferimento.TEMA).length, 1)
  // una domanda d'altro tema non si tocca
  assert.equal(riferimento.aggiornata(null), null)
})
