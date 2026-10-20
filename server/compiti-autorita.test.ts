// Chi può posare il codice nel progetto vero, e chi conta nella quota.
//
// `presente` è di serie no: lo dà solo chi chiama `affida` da una rotta sua
// (lui che preme adesso). Un chiamante che se ne dimentica (la coda, un
// ordine fisso, una ripresa) non posa mai da sé. E una carta nata in chat
// esce dal «chi guarda» della chat: è lavoro di fondo, e la quota la conta.
//
//   node --import ./build/test-profile.mjs --test server/compiti-autorita.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-compiti-autorita-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const compiti = await import('./compiti.ts')
const quota = await import('./quota-mese.ts')

before(() => store.azzeraTutto())
after(() => {
  compiti.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

test('l’autorità è di serie no; solo chi la passa la dà; la carta nata in chat esce dal «chi guarda»', async () => {
  const visti: { presente: boolean; guarda: boolean }[] = []
  compiti.perProva({
    giudica: async () => ({ esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [] }),
    chiedeAiuto: async () => ({ chiede: false, manca: [], domanda: '' }),
    domandeDaFare: async () => [],
    svolgi: async (_c, _n, _m, _a, _cart, _passo, _doc, esecuzione) => {
      visti.push({ presente: esecuzione?.presente === true, guarda: quota.chiGuarda() })
      return { testo: 'Ho sistemato la riga.', fonti: [] }
    }
  })
  const casi = [[{}, false], [{ presente: true }, false], [{ presente: true, turno: true }, false], [{}, true]] as const
  for (let i = 0; i < casi.length; i++) {
    const [o, chat] = casi[i]
    const id = `a${i}`
    store.scriviCompito({ id, testo: 'Sistemare il test che fallisce', ordine: `o${i}` })
    const via = () => compiti.affida(id, 'bozza', false, o)
    if (chat) quota.conChiGuarda(via); else via()
    const fine = Date.now() + 5000
    while (visti.length <= i && Date.now() < fine) await new Promise(r => setTimeout(r, 20))
  }
  assert.deepEqual(visti, [
    { presente: false, guarda: false },
    { presente: true, guarda: false },
    { presente: false, guarda: false },
    { presente: false, guarda: false }
  ])
})
