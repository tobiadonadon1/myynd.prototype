// I file che una mail chiede (`claude.fileChiesti`): la cosa chiesta, cercata
// fra i file, senza la persona e senza il verbo.
//
//   node --test server/file-chiesti.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-file-chiesti-'))
process.env.MYYND_DATI = CASA
const store = await import('./store.ts')
const claude = await import('./claude.ts')
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

const ora = new Date().toISOString()
const jonas = { id: 'posta:INBOX:105', fonte: 'posta', tipo: 'email', titolo: 'Your pricing?', corpo: 'Hey Alex, could you send me your pricing one-pager? Cheers, Jonas', autore: 'Jonas Weber <jonas@weber.test>', quando: ora }
const listino = { id: 'desktop:pricing', fonte: 'desktop', tipo: 'testo', titolo: 'Northwind pricing 2026.md', corpo: 'Website relaunch: from EUR 14,000. Brand refresh: from EUR 9,500.', quando: ora, percorso: '/u/Documents/Northwind pricing 2026.md' }
const altra = { id: 'posta:INBOX:9', fonte: 'posta', tipo: 'email', titolo: 'Pricing for the venue', corpo: 'The venue pricing is attached.', autore: 'Venue <v@venue.test>', quando: ora }

test('«Send Jonas the pricing one-pager» trova il listino, che di Jonas non parla', () => {
  store.salvaDocumenti([jonas, listino, altra] as never)
  // la ricerca stretta del materiale, da sola, non lo trova: vuole anche «Jonas»
  assert.ok(!claude.materiale('Send Jonas the pricing one-pager', [], null).some(d => d.id === 'desktop:pricing'))
  const trovati = claude.fileChiesti('Send Jonas the pricing one-pager', jonas as never)
  assert.deepEqual(trovati.map(d => d.id), ['desktop:pricing'], 'solo fra i file: la mail sul locale non è un allegato')
})

test('con un recinto senza file, o senza parole dopo aver tolto persona e verbo, non cerca', () => {
  assert.deepEqual(claude.fileChiesti('Send Jonas the pricing one-pager', jonas as never, ['posta']), [])
  assert.deepEqual(claude.fileChiesti('Reply to Jonas', jonas as never), [])
})
