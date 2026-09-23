// Il fatto «un collegamento è cambiato», e da dove parte.
//
// La prova che conta è la prima del secondo gruppo: una chiave buona su un
// conto senza credito. La scheda si ferma a dirlo e non chiama `ok()`: è il
// caso della prima tester esterna, che ha chiuso la finestra con la croce e si
// è trovata la prima pagina ancora a dire «serve Claude». Il fatto deve partire
// dalla risposta del server, non dall'«Avanti».
//
//   node --test src/collegamenti.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import * as ts from 'typescript'
import { readFileSync } from 'node:fs'
import { cambiaIlCollegamento, rilettura, suCollegamento } from './collegamenti.ts'

const apiUrl = new URL('./api.ts', import.meta.url).href
const hooks = registerHooks({ load(url, context, nextLoad) {
  if (url !== apiUrl) return nextLoad(url, context)
  return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText }
} })
const { api } = await import('./api.ts')
hooks.deregister()

test('le rotte che collegano, scollegano o cambiano chi lavora dicono il fatto', () => {
  for (const [metodo, url] of [
    ['POST', '/api/connettori/claude'],
    ['POST', '/api/connettori/claude/ambiente'],
    ['POST', '/api/modello/claude-con'],
    ['POST', '/api/modello/abbonamento'],
    ['POST', '/api/modello/motore'],
    ['POST', '/api/modello/chatgpt'],
    ['POST', '/api/connettori/openai'],
    ['POST', '/api/connettori/compatibile'],
    ['POST', '/api/connettori/desktop'],
    ['DELETE', '/api/connettori/claude']
  ]) assert.equal(cambiaIlCollegamento(metodo, url, { ok: true }), true, `${metodo} ${url}`)
})

test('aprire, annullare o elencare non cambia niente, e nemmeno leggere', () => {
  for (const [metodo, url] of [
    ['POST', '/api/modello/abbonamento/accesso'],
    ['POST', '/api/modello/abbonamento/accesso/abc/annulla'],
    ['POST', '/api/modello/chatgpt/login'],
    ['POST', '/api/modello/chatgpt/login/abc/cancel'],
    ['POST', '/api/connettori/google/avvia'],
    ['POST', '/api/connettori/granola/avvia'],
    // annullare l'accesso a Granola a metà: il collegamento è quello di prima
    ['DELETE', '/api/connettori/granola/avvia/g1'],
    ['POST', '/api/connettori/dropbox/inizia'],
    ['POST', '/api/connettori/openai/modelli'],
    ['POST', '/api/modello/openai/modelli'],
    ['GET', '/api/stato'],
    ['GET', '/api/modello/claude'],
    ['GET', '/api/connettori/posta/scopri?email=a@b.it'],
    ['POST', '/api/compiti'],
    ['POST', '/api/profilo']
  ]) assert.equal(cambiaIlCollegamento(metodo, url, { ok: true }), false, `${metodo} ${url}`)
})

test('un accesso nel browser conta quando risponde «completed», non prima', () => {
  for (const url of ['/api/modello/abbonamento/accesso/l1', '/api/modello/chatgpt/login/l1']) {
    assert.equal(cambiaIlCollegamento('GET', url, { stato: 'pending' }), false)
    assert.equal(cambiaIlCollegamento('GET', url, { stato: 'failed' }), false)
    assert.equal(cambiaIlCollegamento('GET', url, { stato: 'completed' }), true)
  }
  // Granola, con le sue parole: l'attesa e la lettura no, «fatto» sì
  const granola = '/api/connettori/granola/avvia/g1'
  assert.equal(cambiaIlCollegamento('GET', granola, { stato: 'attesa' }), false)
  assert.equal(cambiaIlCollegamento('GET', granola, { stato: 'lettura' }), false)
  assert.equal(cambiaIlCollegamento('GET', granola, { stato: 'errore' }), false)
  assert.equal(cambiaIlCollegamento('GET', granola, { stato: 'fatto', note: 3 }), true)
})

/** Il server finto: risponde quello che gli si dice, e conta chi ha sentito il fatto. */
async function conIlServer(risposte: (url: string, metodo: string) => Response, prova: (fatti: () => number) => Promise<void>) {
  const fetchPrima = globalThis.fetch
  const memoria = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'sessione-di-prova', setItem() {}, removeItem() {} } })
  globalThis.fetch = async (input, init) => risposte(String(input), init?.method ?? 'GET')
  let n = 0
  const via = suCollegamento(() => { n++ })
  try { await prova(() => n) }
  finally {
    via()
    globalThis.fetch = fetchPrima
    if (memoria) Object.defineProperty(globalThis, 'localStorage', memoria)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

test('una chiave salvata con un avviso dice il fatto, anche se nessuno preme «Avanti»', async () => {
  await conIlServer(() => Response.json({ ok: true, avviso: 'La chiave è valida, ma il conto Anthropic non ha ancora credito.' }), async fatti => {
    const r = await api.collegaClaude('sk-ant-prova')
    assert.ok(r.avviso)
    assert.equal(fatti(), 1, 'la prima pagina resterebbe a «serve Claude» finché qualcuno non preme «Avanti»')
  })
})

test('una chiave rifiutata non cambia niente, e non lo dice', async () => {
  await conIlServer(() => Response.json({ errore: 'Chiave API non valida.' }, { status: 400 }), async fatti => {
    await assert.rejects(api.collegaClaude('sk-ant-sbagliata'))
    assert.equal(fatti(), 0)
  })
})

test('l’accesso con l’account lo dice quando è fatto, e scollegare lo dice anche lui', async () => {
  let stato = 'pending'
  await conIlServer((url, metodo) => url.includes('/accesso/') ? Response.json({ stato }) : metodo === 'DELETE' ? Response.json({ ok: true }) : Response.json({}), async fatti => {
    await api.statoAccessoClaude('l1')
    assert.equal(fatti(), 0, 'mentre aspetta il browser non è cambiato niente')
    stato = 'completed'
    await api.statoAccessoClaude('l1')
    assert.equal(fatti(), 1)
    await api.scollega('claude')
    assert.equal(fatti(), 2, 'scollegare deve arrivare dappertutto come collegare')
    await api.claudeCon('abbonamento')
    assert.equal(fatti(), 3, '«Usa il mio account» cambia chi lavora')
  })
})

test('rileggere lo stato non lo annuncia: nessun giro in tondo', async () => {
  await conIlServer(() => Response.json({ config: {}, connettori: [] }), async fatti => {
    await api.stato()
    await api.claude().catch(() => {})
    assert.equal(fatti(), 0)
  })
})

test('una lettura partita prima del cambio non ricopre quella partita dopo', async () => {
  const lenti: ((v: string) => void)[] = []
  const visti: string[] = []
  const rileggi = rilettura(() => new Promise<string>(r => lenti.push(r)), v => visti.push(v))
  const vecchia = rileggi()
  const nuova = rileggi()
  lenti[1]('collegato')
  await nuova
  lenti[0]('da collegare')
  await vecchia
  assert.deepEqual(visti, ['collegato'], 'la risposta vecchia ha rimesso «da collegare» sopra «collegato»')
  // nell'ordine giusto passano tutte e due
  const terza = rileggi()
  const quarta = rileggi()
  lenti[2]('a'); await terza
  lenti[3]('b'); await quarta
  assert.deepEqual(visti, ['collegato', 'a', 'b'])
})
