// Rispondere alla domanda di un progetto dalla prima pagina, sul posto.
//
// «If it is a question, it should look like the UI of the question that you
// can answer on the feed.» La rotta prende la risposta come quella a «qual è
// il passo dopo?»: un passo va in lista sotto il progetto, uno stato va nella
// memoria del progetto, e la domanda non si ripropone. Senza modello (come
// qui) una frase con un verbo è un passo, e «I have approved it» è uno stato.
//
//   node --test server/iniziativa-rispondi.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-iniziativa-'))
const TOKEN = 'sviluppo-non-in-produzione'
let server: ChildProcess | undefined
let base = ''

const chiama = async (via: string, corpo?: unknown, metodo = corpo === undefined ? 'GET' : 'POST') => {
  const r = await fetch(`${base}${via}`, {
    method: metodo,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  })
  return { stato: r.status, corpo: await r.json() as Record<string, any> }
}

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MYYND_DATI: CASA, MYYND_PORT: '0', MYYND_DEV: '1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise<void>((pronto, guaio) => {
    const orologio = setTimeout(() => guaio(new Error('il server non è partito')), 15_000)
    let fuori = '', errori = ''
    server!.stdout!.on('data', p => {
      fuori += String(p)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { base = m[1]; clearTimeout(orologio); pronto() }
    })
    server!.stderr!.on('data', p => { errori += String(p).slice(0, 1000) })
    server!.on('exit', c => { if (!base) { clearTimeout(orologio); guaio(new Error(`il server è uscito ${c}: ${errori}`)) } })
    server!.on('error', guaio)
  })
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${base}/api/compiti`, { headers: { authorization: `Bearer ${TOKEN}` } })
    await r.arrayBuffer()
    if (r.ok) break
    await new Promise(r2 => setTimeout(r2, 200))
  }
})

after(() => {
  server?.kill()
  rmSync(CASA, { recursive: true, force: true })
})

test('una risposta che è un passo finisce in lista sotto il progetto, e la domanda non torna', async () => {
  const p = await chiama('/api/progetti', { nome: 'H-Farm', obiettivo: 'Solidify AI systems' })
  assert.equal(p.stato, 200)
  const id = p.corpo.progetto.id as string

  const feed = await chiama('/api/feed')
  const domanda = feed.corpo.iniziative.find((i: { projectId: string }) => i.projectId === id)
  assert.ok(domanda, 'con un obiettivo e nessun passo, il progetto ha la sua domanda')

  const vuota = await chiama(`/api/feed/iniziative/${domanda.id}/rispondi`, { testo: '   ' })
  assert.equal(vuota.stato, 400)

  const r = await chiama(`/api/feed/iniziative/${domanda.id}/rispondi`, { testo: 'Write the pilot brief for the board' })
  assert.equal(r.stato, 200)
  assert.match(r.corpo.esito, /H-Farm/)
  assert.match(r.corpo.esito, /Write the pilot brief for the board/)
  // la domanda non c'è più: né in questa risposta né nel feed
  assert.ok(!r.corpo.iniziative.some((i: { id: string }) => i.id === domanda.id))
  const dopo = await chiama('/api/feed')
  assert.ok(!dopo.corpo.iniziative.some((i: { id: string }) => i.id === domanda.id))

  const lista = await chiama('/api/compiti')
  const riga = lista.corpo.compiti.find((c: { testo: string }) => /pilot brief/.test(c.testo))
  assert.ok(riga, 'il passo è in lista')
  assert.equal(riga.progetto, id)

  // la stessa domanda non si risponde due volte: non è più attuale
  const ancora = await chiama(`/api/feed/iniziative/${domanda.id}/rispondi`, { testo: 'Again' })
  assert.equal(ancora.stato, 409)
})

test('una risposta che è uno stato si segna, senza inventare una riga', async () => {
  const p = await chiama('/api/progetti', { nome: 'Nextas', obiettivo: 'Ship the outbox' })
  const id = p.corpo.progetto.id as string
  const feed = await chiama('/api/feed')
  const domanda = feed.corpo.iniziative.find((i: { projectId: string }) => i.projectId === id)
  assert.ok(domanda)
  const r = await chiama(`/api/feed/iniziative/${domanda.id}/rispondi`, { testo: 'I have approved it already' })
  assert.equal(r.stato, 200)
  assert.match(r.corpo.esito, /Noted|segnato/)
  const lista = await chiama('/api/compiti')
  assert.ok(!lista.corpo.compiti.some((c: { progetto: string | null }) => c.progetto === id), 'nessuna riga nata da uno stato')
})
