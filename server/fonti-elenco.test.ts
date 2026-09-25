// Ogni fonte che porta documenti ha i suoi tre posti (P4): «è collegata?»,
// la scheda nello stato, e «Scollega». Una fonte nuova che ne manca uno è
// una scheda che dice «da collegare» a chi l'ha appena collegata, o che non
// si scollega più.
//
//   node --test server/fonti-elenco.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leggi = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')

test('ogni fonte che legge è in fonteCollegata, nello stato e nella rotta che la scollega', async () => {
  const { CATALOGO } = await import('./connettori/registro.ts')
  const collegate = leggi('./fonti-collegate.ts')
  const indice = leggi('./index.ts')
  const stato = indice.slice(indice.indexOf("app.get('/api/stato'"), indice.indexOf("app.post('/api/argomenti/proposta'"))
  const scollega = indice.slice(indice.indexOf("app.delete('/api/connettori/:id'"), indice.indexOf('// — sincronizzazione, in streaming —'))
  const mancano: string[] = []
  for (const v of CATALOGO.filter(x => x.legge)) {
    if (!collegate.includes(`case '${v.id}'`)) mancano.push(`${v.id}: fonteCollegata`)
    if (!stato.includes(`v.id === '${v.id}'`)) mancano.push(`${v.id}: /api/stato`)
    if (!scollega.includes(`id === '${v.id}'`)) mancano.push(`${v.id}: DELETE`)
  }
  assert.deepEqual(mancano, [])
})

test('le due fonti del Mac rispondono «collegata» solo con la loro configurazione (counter-case)', async () => {
  const { fonteCollegata } = await import('./fonti-collegate.ts')
  assert.equal(fonteCollegata('agendamac', {}), false)
  assert.equal(fonteCollegata('postamac', {}), false)
  assert.equal(fonteCollegata('agendamac', { agendamac: { attiva: true } }), true)
  assert.equal(fonteCollegata('postamac', { postamac: { attiva: true } }), true)
})

test('su un server le due fonti del Mac non si offrono', async () => {
  const { SOLO_IN_CASA } = await import('./ospitato.ts')
  assert.ok(SOLO_IN_CASA.includes('agendamac') && SOLO_IN_CASA.includes('postamac'))
})
