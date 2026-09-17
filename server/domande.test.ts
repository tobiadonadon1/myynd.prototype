// Le domande del giro delle priorità, quando lui risponde: la convinzione
// finisce nell'ambito del progetto, non nel ritratto, e la domanda si chiude
// con un esito che si può controllare.
//
//   node --test server/domande.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-domande-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Tobia' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const domande = await import('./domande.ts')
after(() => { domande.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

const ceru = progetti.scrivi({ nome: 'Ceru', obiettivo: 'Move in' })

test('una domanda su un progetto: la risposta diventa una convinzione nell’ambito del progetto', async () => {
  const d = store.apriDomanda({ tema: 'priorita:abc', testo: 'Is the Ceru contract still waiting on Marta?', spunto: ['posta:INBOX:3'], progetto: ceru.id })
  assert.ok(d && d.progetto === ceru.id)
  domande.perProva({ chiediJSON: (async () => ({ convinzione: 'The Ceru contract is waiting on Marta, not on him.', esito: 'From now on I will not ask you to sign it: I will look for news from Marta.' })) as never })
  const { esito } = await domande.rispondiADomanda(d.id, 'Yes, still waiting on Marta.')
  assert.match(esito, /^From now on/)
  const c = store.convinzioni('progetto:Ceru')
  assert.equal(c.length, 1)
  assert.equal(c[0].genere, 'esplicita')
  assert.equal(store.domanda(d.id)?.stato, 'risposta')
  assert.equal(store.domanda(d.id)?.risposta, 'Yes, still waiting on Marta.')
})

test('una domanda senza progetto resta nel ritratto, come prima', async () => {
  const d = store.apriDomanda({ tema: 'rinnov', testo: 'Do you want to see renewals?', spunto: [] })!
  domande.perProva({ chiediJSON: (async () => ({ convinzione: 'Renewals under a thousand euro do not interest him.', esito: 'No more small renewals.' })) as never })
  await domande.rispondiADomanda(d.id, 'No, not the small ones.')
  assert.equal(store.convinzioni('persona').length, 1)
})
