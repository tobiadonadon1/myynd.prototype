import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dimenticaLetture, fontiIncomplete, generaDaFontiFresche, LetturaInCorso, motivoLettura, osservaLettura } from './lettura-feed.ts'

test('la lettura a mano rilegge le fonti una volta, e poi genera con quello che ha letto', async () => {
  const ordine: string[] = [], lock = new Set<string>()
  let fonte = 'old indexed body'
  const r = await generaDaFontiFresche('conto', lock,
    async () => { assert.equal(lock.has('conto'), true); ordine.push('read'); fonte = 'fresh provider body' },
    async () => { ordine.push('generate'); return fonte })
  assert.equal(r, 'fresh provider body'); assert.deepEqual(ordine, ['read', 'generate']); assert.equal(lock.size, 0)
})

test('una fonte che non risponde o letta a metà non ferma la lettura: si segna, e si genera lo stesso', async () => {
  for (const evento of [{ fase: 'note', stato: 'guaio', errore: 'Current access denied' },
    { fase: 'posta', stato: 'fatto', cartelleFallite: ['Drafts'] },
    { fase: 'slack', stato: 'fatto', falliti: ['channel'] }, { fase: 'github', stato: 'fatto', falliti: ['repo'] },
    { fase: 'notion', stato: 'fatto', interrotto: true },
    { fase: 'desktop', stato: 'fatto', illeggibili: ['/Users/private/folder'] }]) {
    dimenticaLetture('conto')
    const oss = osservaLettura('conto', null)
    let generato = false
    await generaDaFontiFresche('conto', new Set(), async () => { oss.avvisa(evento); oss.chiudi() }, async () => { generato = true })
    assert.equal(generato, true, evento.fase)
    assert.deepEqual(fontiIncomplete('conto'), [{ fonte: evento.fase, motivo: evento.stato === 'guaio' ? 'non-disponibile' : 'incompleta' }])
  }
})

test('un file che non si apre in mezzo a cento non è una fonte che non si legge; un tetto nemmeno', () => {
  for (const evento of [
    { fase: 'desktop', stato: 'fatto', falliti: 3, illeggibili: [], troncato: true },
    { fase: 'note', stato: 'fatto', illeggibili: 1, troncato: true },
    { fase: 'drive', stato: 'fatto', falliti: 2 },
    { fase: 'notion', stato: 'fatto', parziali: 1, interrotto: false },
    { fase: 'posta', stato: 'fatto', cartelleFallite: [], troncato: true },
    { fase: 'desktop', stato: '12 documenti', fatti: 12 },
    { fase: 'fine', totale: 3 }
  ]) assert.equal(motivoLettura(evento), null, JSON.stringify(evento))
})

test('la lettura dopo pulisce quello che si è sistemato; una fonte sola tocca solo se stessa; fermata a metà, aggiunge e basta', () => {
  dimenticaLetture('conto')
  let oss = osservaLettura('conto', null)
  oss.avvisa({ fase: 'note', stato: 'guaio', errore: 'x' })
  oss.avvisa({ fase: 'desktop', stato: 'fatto', illeggibili: ['/a'] })
  // il guaio pesa più della lettura a metà, in qualunque ordine arrivino
  oss.avvisa({ fase: 'note', stato: 'fatto', illeggibili: ['/b'] })
  oss.chiudi()
  assert.deepEqual(fontiIncomplete('conto'), [{ fonte: 'note', motivo: 'non-disponibile' }, { fonte: 'desktop', motivo: 'incompleta' }])

  oss = osservaLettura('conto', 'desktop')
  oss.avvisa({ fase: 'desktop', stato: 'fatto', illeggibili: [] })
  oss.chiudi()
  assert.deepEqual(fontiIncomplete('conto'), [{ fonte: 'note', motivo: 'non-disponibile' }])

  oss = osservaLettura('conto', null)
  oss.avvisa({ fase: 'slack', stato: 'guaio', errore: 'token' })
  oss.chiudi(true)
  assert.deepEqual(fontiIncomplete('conto'), [{ fonte: 'note', motivo: 'non-disponibile' }, { fonte: 'slack', motivo: 'non-disponibile' }])

  oss = osservaLettura('conto', null)
  oss.chiudi()
  assert.deepEqual(fontiIncomplete('conto'), [])
  assert.deepEqual(fontiIncomplete('altro'), [])
})

test('il nome della fonte non porta fuori un percorso o un segreto', () => {
  assert.deepEqual(motivoLettura({ fase: '/private/account/notes', stato: 'guaio', errore: 'token=private-secret' }), { fonte: 'source', motivo: 'non-disponibile' })
})

test('la lettura a mano condivide il lucchetto del conto, e lo lascia anche quando va storta', async () => {
  const lock = new Set(['conto'])
  await assert.rejects(generaDaFontiFresche('conto', lock, async () => assert.fail('no second import'), async () => assert.fail('no generation')),
    e => e instanceof LetturaInCorso && e.status === 409 && e.perLingua('en') === 'A source read is already running. Wait for it to finish and try again.')
  assert.equal(lock.has('conto'), true)
  lock.clear()
  await assert.rejects(generaDaFontiFresche('conto', lock, async () => { throw new Error('network') }, async () => assert.fail('no generation')), /network/)
  assert.equal(lock.size, 0)
})
