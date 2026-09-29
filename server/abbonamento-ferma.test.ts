// «Stop now» arriva fino a Claude Code (F9): un lavoro fermato uccide il
// processo `claude` e tutto il suo gruppo, e chi aspettava lo sa subito.
//
//   node --test server/abbonamento-ferma.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-abbonamento-ferma-'))
process.env.MYYND_DATI = dati
const abbonamento = await import('./abbonamento.ts')
after(() => { abbonamento.perProva(null); rmSync(dati, { recursive: true, force: true }) })

test('un lavoro fermato uccide il processo e il suo gruppo, e la domanda si chiude subito', async () => {
  let figlio: ChildProcess | null = null
  let opzioni: Record<string, unknown> = {}
  abbonamento.perProva({
    installato: () => '/opt/finto/claude',
    // al posto di `claude`: un node che non finisce mai, con le stesse opzioni (il gruppo suo)
    spawn: ((_exe: string, _argomenti: string[], o: Record<string, unknown>) => {
      opzioni = o
      figlio = spawn(process.execPath, ['-e', 'process.stdin.resume(); setInterval(() => {}, 1000)'], o as never)
      return figlio
    }) as never
  })
  const controller = new AbortController()
  const domanda = abbonamento.chiedi({ system: 'x', messages: [{ role: 'user', content: 'y' }], attesa: 60_000, lavoro: 'bozza', signal: controller.signal })
  await new Promise(r => setTimeout(r, 300))
  assert.ok(figlio, 'il processo è partito')
  assert.equal(opzioni.detached, true, 'in un gruppo suo, così il segnale arriva anche ai figli')
  const uscito = new Promise<NodeJS.Signals | null>(r => (figlio as unknown as ChildProcess).once('exit', (_c, segnale) => r(segnale)))
  const prima = Date.now()
  controller.abort()
  await assert.rejects(domanda)
  assert.ok(Date.now() - prima < 1000, 'chi aspettava lo sa subito')
  assert.equal(await uscito, 'SIGTERM')
})

test('un segnale già fermato non lancia niente', async () => {
  let lanci = 0
  abbonamento.perProva({ installato: () => '/opt/finto/claude', spawn: (() => { lanci++; throw new Error('non doveva partire') }) as never })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(abbonamento.chiedi({ system: 'x', messages: [{ role: 'user', content: 'y' }], attesa: 1000, signal: controller.signal }))
  assert.equal(lanci, 0)
})
