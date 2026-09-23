// Una fonte scollegata mentre la si leggeva non torna nell'indice.
//
// «Scollega» svuota la fonte e va via; la lettura partita un attimo prima
// scriveva dopo, e l'agenda tolta tornava dentro con tutti i suoi eventi.
//
//   node --test server/fonti-collegate.test.ts

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const casa = mkdtempSync(join(tmpdir(), 'myynd-fonti-collegate-'))
process.env.MYYND_DATI = casa
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const conti = await import('./conti.ts')
const { fonteCollegata, leggiSeAncoraCollegata } = await import('./fonti-collegate.ts')

before(async () => { await conti.avvia() })
beforeEach(() => { store.azzeraTutto() })
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })

const eventi = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `calendario:prova-${i}:0`, fonte: 'calendario', tipo: 'evento', titolo: `Riunione ${i}`,
  corpo: `Riunione numero ${i} con il gruppo di prova.`, quando: '2026-09-20T10:00:00Z'
}))

/** Quello che fa «Scollega» per l'agenda: via dalla configurazione, via dall'indice. */
function scollegaAgenda() {
  const c = cfg.leggi()
  delete c.calendario
  cfg.scrivi(c, { togli: ['calendario'] })
  store.svuotaFonte('calendario')
}

test('a source disconnected while it was being read leaves nothing in the index', async () => {
  cfg.aggiorna({ calendario: { url: 'https://example.invalid/agenda.ics' } })
  const detti: unknown[] = []
  // la lettura ha già scaricato; la persona scollega; la lettura scrive
  const n = await leggiSeAncoraCollegata('calendario', async () => {
    scollegaAgenda()
    await store.salvaDocumentiAPezzi(eventi(3))
    return 3
  }, d => detti.push(d))
  assert.equal(n, 0, 'nothing read counts for a source that is gone')
  assert.equal(store.idsConPrefisso('calendario:').length, 0, 'the disconnected calendar must not come back')
  assert.deepEqual(detti, [{ fase: 'calendario', stato: 'scollegata' }])
})

test('a source still connected keeps what it read', async () => {
  cfg.aggiorna({ calendario: { url: 'https://example.invalid/agenda.ics' } })
  const n = await leggiSeAncoraCollegata('calendario', async () => {
    await store.salvaDocumentiAPezzi(eventi(2))
    return 2
  }, () => assert.fail('nothing to report'))
  assert.equal(n, 2)
  assert.equal(store.idsConPrefisso('calendario:').length, 2)
})

test('connected means the same thing the source cards say', () => {
  const c: Parameters<typeof fonteCollegata>[1] = {
    desktop: { cartelle: ['/tmp'] },
    slack: { token: 'xoxb-prova' },
    microsoft: { clientId: 'id', refresh: 'r', parti: ['file'] }
  }
  assert.equal(fonteCollegata('desktop', c), true)
  assert.equal(fonteCollegata('slack', c), true)
  assert.equal(fonteCollegata('sharepoint', c), true)
  assert.equal(fonteCollegata('microsoft', c), false, 'Outlook is the other half of Microsoft')
  assert.equal(fonteCollegata('calendario', c), false)
  assert.equal(fonteCollegata('claude', c), false, 'a model is not a source')
})
