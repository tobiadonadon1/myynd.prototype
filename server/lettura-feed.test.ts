import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dimenticaLetture, fontiIncomplete, LetturaInCorso, motivoLettura, osservaLettura } from './lettura-feed.ts'

test('una fonte che non risponde o letta a metà si segna, per conto, con il suo motivo', () => {
  for (const evento of [{ fase: 'note', stato: 'guaio', errore: 'Current access denied' },
    { fase: 'posta', stato: 'fatto', cartelleFallite: ['Drafts'] },
    { fase: 'slack', stato: 'fatto', falliti: ['channel'] }, { fase: 'github', stato: 'fatto', falliti: ['repo'] },
    { fase: 'notion', stato: 'fatto', interrotto: true },
    { fase: 'desktop', stato: 'fatto', illeggibili: ['/Users/private/folder'] }]) {
    dimenticaLetture('conto')
    const oss = osservaLettura('conto', null)
    oss.avvisa(evento); oss.chiudi()
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

test('una lettura già in corso è un 409 nella lingua scelta', () => {
  const e = new LetturaInCorso()
  assert.equal(e.status, 409)
  assert.equal(e.perLingua('en'), 'A source read is already running. Wait for it to finish and try again.')
  assert.equal(e.perLingua('it'), 'Una lettura delle fonti è già in corso. Attendi che finisca e riprova.')
})
