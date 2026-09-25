// Prova di comportamento per prove/verifica-compiti.mjs: quando l'osservatore
// non è disponibile, GET /api/osservatore risponde 404 con un corpo JSON
// valido ({disponibile:false}), come fa davvero server/index.ts
// (senzaOsservatore). T1 deve leggere quel corpo e dire «non applicabile»,
// non scartarlo per lo stato non-ok e dire «non riuscito».
//
//   node --test prove/verifica-compiti.test.mjs
//
// Non è nel giro di `npm test` (quello prova solo server/, src/, desktop/):
// questo file prova lo script della cornice esterna, non l'app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const qui = dirname(fileURLToPath(import.meta.url))
const TOKEN = 'sviluppo-non-in-produzione'

// Un finto server minimo: solo /api/osservatore risponde come l'app vera
// quando manca l'osservatore (404 + JSON), le altre rotte danno risposte
// neutre (compiti non riusciti, che qui non ci interessano).
function fintoServer() {
  return createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/osservatore') { res.statusCode = 404; res.end(JSON.stringify({ disponibile: false })); return }
    if (req.url === '/api/feed/fuoco') { res.end(JSON.stringify({ fuoco: '' })); return }
    if (req.url === '/api/memoria') { res.end(JSON.stringify({ convinzioni: [], storiche: [] })); return }
    if (req.url === '/api/progetti') { res.end(JSON.stringify({ progetti: [] })); return }
    if (req.url === '/api/stato') { res.end(JSON.stringify({ config: {} })); return }
    res.statusCode = 404
    res.end(JSON.stringify({ __sconosciuto: req.url }))
  })
}

test('T1 dice «non applicabile», non «non riuscito», quando /api/osservatore risponde 404 disponibile:false', async () => {
  const srv = fintoServer()
  await new Promise(risolvi => srv.listen(0, '127.0.0.1', risolvi))
  const { port } = srv.address()
  try {
    // spawn, non spawnSync: quello bloccherebbe il ciclo eventi di QUESTO
    // processo, che è anche il finto server sopra, e nessuna richiesta
    // riceverebbe mai risposta (rimarrebbe appesa).
    const figlio = spawn(process.execPath, [join(qui, 'verifica-compiti.mjs'), `http://127.0.0.1:${port}`], {
      env: { ...process.env, TOKEN }
    })
    let stdout = ''
    figlio.stdout.on('data', d => { stdout += d })
    await new Promise((risolvi, rifiuta) => {
      figlio.on('error', rifiuta)
      figlio.on('close', risolvi)
    })
    assert.match(stdout, /verifica · T1: non applicabile/)
    assert.doesNotMatch(stdout, /verifica · T1: non riuscito/)
  } finally {
    await new Promise(risolvi => srv.close(risolvi))
  }
})
