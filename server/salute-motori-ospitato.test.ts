// La salute dell'AI inclusa su un server ospitato: il ponte è questo server.
//
// Lì non ci sono né l'indirizzo del ponte né un gettone nel conto: basta la
// chiave di chi ospita. La bussata chiedeva comunque `salute` con indirizzo e
// gettone, si sentiva dire «assente», e l'AI inclusa che lavora sembrava
// morta: la prima pagina diceva «non risponde» a tutti, e alla seconda
// bussata Myynd passava a un altro motore. File a parte: il segno del server
// si legge una volta sola, quando il modulo si carica.
//
//   node --test server/salute-motori-ospitato.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-motori-ospitato-'))
const HOME_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, 'dati')
process.env.FLY_APP_NAME = 'myynd-prova'
process.env.MYYND_INCLUSO_CHIAVE = 'sk-ant-finta'
delete process.env.MYYND_INCLUSO_URL
delete process.env.ANTHROPIC_API_KEY

const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const mod = await import('./modello.ts')
const teste = await import('./salute-teste.ts')
const { OSPITATO } = await import('./ospitato.ts')

after(() => {
  process.env.HOME = HOME_VERA
  delete process.env.FLY_APP_NAME
  delete process.env.MYYND_INCLUSO_CHIAVE
  store.chiudiIndici()
  rmSync(CASA, { recursive: true, force: true })
})

test('ospitati, l’AI inclusa che lavora non sembra morta: niente riga, niente cambio di motore', async () => {
  assert.equal(OSPITATO, true)
  await chi.dentro('utest0001', async () => {
    cfg.scrivi({ lingua: 'en', motore: 'incluso' })
    assert.ok(mod.fornitoreIncluso(), 'la chiave di chi ospita basta')
    for (let i = 0; i < 3; i++) await teste.sonda({ forza: true })
    assert.equal(mod.statoVia('incluso')?.vivo, true)
    assert.equal(mod.morta('incluso'), false)
    assert.equal(teste.testaDaMostrare(), null)
    assert.equal(cfg.leggi().motore, 'incluso')
  })
})
