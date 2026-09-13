// La configurazione non perde credenziali per sbaglio.
//
// Il 13 settembre 2026 la chiave di Claude è sparita dal disco mentre l'app
// girava, senza una riga che dicesse chi l'aveva tolta. Da allora `scrivi`
// tiene ogni campo con dentro una credenziale a meno che chi scrive non dica
// «togli questo», e il bottone «Scollega» lo dice.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

const dati = mkdtempSync(join(tmpdir(), 'myynd-config-'))
process.env.MYYND_DATI = dati
before(() => { process.env.MYYND_DATI = dati })
after(() => rmSync(dati, { recursive: true, force: true }))

test('una scrittura senza la chiave di Claude non la toglie: la tiene e lo dice', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ nome: 'Tobia', claude: { apiKey: 'sk-prova' } })
  const avvisi: string[] = []
  const warn = console.warn
  console.warn = (...a: unknown[]) => { avvisi.push(a.map(String).join(' ')) }
  try {
    cfg.scrivi({ nome: 'Tobia', tono: 'caldo' } as Parameters<typeof cfg.scrivi>[0])
  } finally { console.warn = warn }
  assert.equal(cfg.leggi().claude?.apiKey, 'sk-prova', 'la chiave è sparita')
  assert.equal(cfg.leggi().tono, 'caldo', 'il resto della scrittura non è passato')
  assert.ok(avvisi.some(a => a.includes('«claude»')), 'nessun avviso nel registro')
})

test('«Scollega» la toglie davvero, perché lo dice', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ nome: 'Tobia', claude: { apiKey: 'sk-prova' } })
  cfg.scrivi({ nome: 'Tobia' }, { togli: ['claude'] })
  assert.equal(cfg.leggi().claude, undefined)
})

test('aggiorna non tocca le credenziali che non nomina', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ nome: 'Tobia', claude: { apiKey: 'sk-prova' }, posta: { indirizzo: 'a@b.c', password: 'x' } } as unknown as Parameters<typeof cfg.scrivi>[0])
  cfg.aggiorna({ nome: 'Tobia D.' })
  const c = cfg.leggi()
  assert.equal(c.claude?.apiKey, 'sk-prova')
  assert.equal(c.nome, 'Tobia D.')
})
