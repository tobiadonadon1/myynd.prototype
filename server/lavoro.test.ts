// Dare un lavoro a Claude Code.
//
// Qui non si prova che Claude Code funzioni — funziona, è un programma suo. Si
// prova il recinto: che non si possa mettere a lavorare in una cartella che non
// gli è stata data, e che la richiesta resti testo invece di diventare un
// comando.
//
//   node --test server/lavoro.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-lavoro-'))
const PROGETTO = join(CASA, 'Progetti')
const FUORI = join(CASA, 'Altrui')
mkdirSync(PROGETTO, { recursive: true })
mkdirSync(FUORI, { recursive: true })
process.env.HOME = CASA

const l = await import('./lavoro.ts')
after(() => rmSync(CASA, { recursive: true, force: true }))

const DESKTOP = { cartelle: [PROGETTO] }

test('fuori dalle cartelle collegate non lavora', async () => {
  await assert.rejects(
    () => l.fai(DESKTOP, { cartella: FUORI, richiesta: 'fai qualcosa', passo: 'piano' }),
    /solo nelle cartelle/
  )
})

test('un link simbolico non lo porta fuori', async () => {
  const ponte = join(PROGETTO, 'ponte')
  symlinkSync(FUORI, ponte)
  await assert.rejects(
    () => l.fai(DESKTOP, { cartella: ponte, richiesta: 'fai qualcosa', passo: 'piano' }),
    /solo nelle cartelle/
  )
})

test('senza cartelle collegate non parte', async () => {
  await assert.rejects(
    () => l.fai({ cartelle: [] }, { cartella: PROGETTO, richiesta: 'x', passo: 'piano' }),
    /Collega una cartella/
  )
})

test('una richiesta vuota non diventa un lavoro', async () => {
  await assert.rejects(
    () => l.fai(DESKTOP, { cartella: PROGETTO, richiesta: '   ', passo: 'piano' }),
    /niente da chiedergli/
  )
})

test('sa dire se Claude Code c’è su questa macchina', () => {
  // non si controlla *quale* risposta: si controlla che sia una risposta e non
  // un'esplosione, perché la schermata la usa per decidere se offrirlo
  const dove = l.installato()
  assert.ok(dove === null || dove.endsWith('/claude'))
})
