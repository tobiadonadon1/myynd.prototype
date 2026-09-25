// La riga di comando del resoconto (P9): rifiuta quello che deve rifiutare, e
// sullo schermo non mette né oggetti né indirizzi.
//
//   node --test server/resoconto-prova.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const copia = mkdtempSync(join(tmpdir(), 'myynd-resoconto-prova-'))
const CLI = fileURLToPath(new URL('./resoconto-prova.ts', import.meta.url))
const lancia = (args: string[]) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...args], {
  env: { PATH: process.env.PATH, HOME: join(copia, 'casa') }, encoding: 'utf8', timeout: 60_000
})

after(() => rmSync(copia, { recursive: true, force: true }))

test('rifiuta senza --dati, con la cartella vera, con un argomento sconosciuto', () => {
  const senza = lancia(['--conto', 'x@y.example'])
  assert.equal(senza.status, 2)
  assert.match(senza.stderr, /--dati/)
  const vera = lancia(['--conto', 'x@y.example', '--dati', join(userInfo().homedir, '.myynd')])
  assert.equal(vera.status, 2)
  assert.match(vera.stderr, /cartella vera/)
  const dentro = lancia(['--conto', 'x@y.example', '--dati', join(userInfo().homedir, '.myynd', 'utenti')])
  assert.equal(dentro.status, 2)
  const strano = lancia(['--conto', 'x@y.example', '--dati', copia, '--jev'])
  assert.equal(strano.status, 2)
  assert.match(strano.stderr, /--jev/)
})

test('su una copia seminata non stampa oggetti né indirizzi, e scrive solo dentro --dati', async () => {
  // si semina in un processo a parte: questo non apre lo store
  const semina = `
    process.env.MYYND_DATI = ${JSON.stringify(copia)}
    const conti = await import(${JSON.stringify(new URL('./conti.ts', import.meta.url).href)})
    const chi = await import(${JSON.stringify(new URL('./chi.ts', import.meta.url).href)})
    const cfg = await import(${JSON.stringify(new URL('./config.ts', import.meta.url).href)})
    const store = await import(${JSON.stringify(new URL('./store.ts', import.meta.url).href)})
    const k = await conti.registra('prova-cli@esempio.test', 'parola-di-prova-lunga')
    chi.dentro(k.id, () => {
      cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome' })
      store.scriviCompito({ id: 'm1', testo: 'Reply to Dana', quando: 'oggi', ordine: 'a0' })
      const quando = new Date(Date.now() - 2 * 86400000).toISOString()
      store.default.prepare("INSERT INTO azioni (id, tipo, verso, cosa, compito, esito, quando) VALUES ('az1','email','dana@northwind.example','Secret subject line','m1','fatta',?)").run(quando)
    })
    store.chiudiIndici()
  `
  const s = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', semina], { env: { PATH: process.env.PATH, HOME: join(copia, 'casa') }, encoding: 'utf8', timeout: 60_000 })
  assert.equal(s.status, 0, s.stderr)
  const r = lancia(['--conto', 'prova-cli@esempio.test', '--dati', copia])
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /mail\s+compito:m1\s+azioni:az1\s+4/)
  assert.doesNotMatch(r.stdout, /Secret subject|dana@|Dana/)
  const val = join(copia, 'valutazioni')
  assert.ok(existsSync(val))
  const file = readdirSync(val).find(x => x.startsWith('resoconto-'))!
  assert.match(readFileSync(join(val, file), 'utf8'), /Secret subject line/)
})
