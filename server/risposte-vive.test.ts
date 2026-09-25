// Le risposte vive: la correzione si riconosce e si segna solo dove deve,
// la riga di registro non porta contenuti, le somme raggruppano per strada.
//
//   node --test server/risposte-vive.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-vive-'))
process.env.MYYND_DATI = CASA
const store = await import('./store.ts')
const { eUnaCorrezione, segnaCorrezione, rigaRisposta, vive } = await import('./risposte-vive.ts')
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const verbale = (via: string, extra: Record<string, unknown> = {}) =>
  ({ v: 1, via, ricominciata: false, citazioni: 0, memoria: false, nonValide: [], scoperti: [], rifiuto: false, senzaFonti: false, ...extra })

test('una correzione si riconosce; un «no» che continua, o un «no problem», no', () => {
  for (const s of ['no, it starts in November', 'Nope', 'that’s wrong', 'sbagliato, è venerdì', 'non è così', 'No.', 'Wrong: it is Friday']) {
    assert.ok(eUnaCorrezione(s), s)
  }
  for (const s of ['no, and also the invoice?', 'No worries, thanks', 'No problem', 'No, thanks', 'No, grazie', 'no thanks', 'No. Thanks!', 'note the date', 'No, but can you also check the fee?', 'no e anche il preventivo', 'Nothing else', '']) {
    assert.ok(!eUnaCorrezione(s), s)
  }
})

test('la correzione segna solo l’ultima risposta di quella chat, e solo entro tre minuti', () => {
  store.creaChat('c1', 'una'); store.creaChat('c2', 'due')
  const scrivi = (id: string, chat: string, quando: string) =>
    store.default.prepare('INSERT INTO messaggi (id, chat, ruolo, testo, fonti, verifica, quando) VALUES (?,?,?,?,?,?,?)')
      .run(id, chat, 'a', 'risposta', null, JSON.stringify(verbale('claude')), quando)
  const adesso = new Date('2026-09-24T10:00:00.000Z')
  scrivi('a1', 'c1', '2026-09-24T09:50:00.000Z')   // vecchia
  scrivi('a2', 'c1', '2026-09-24T09:58:30.000Z')   // l'ultima, fresca
  scrivi('a3', 'c2', '2026-09-24T09:59:00.000Z')   // un'altra chat
  assert.equal(segnaCorrezione('c1', 'Thanks!', adesso), false, 'non è una correzione')
  assert.equal(segnaCorrezione('c1', 'No, it starts in November', adesso), true)
  const letto = (id: string) => JSON.parse(store.default.prepare('SELECT verifica FROM messaggi WHERE id = ?').get(id)!.verifica as string)
  assert.equal(letto('a2').corretta, true)
  assert.equal(letto('a1').corretta, undefined)
  assert.equal(letto('a3').corretta, undefined)
  // troppo tardi: quattro minuti dopo
  scrivi('a4', 'c2', '2026-09-24T09:55:30.000Z')
  assert.equal(segnaCorrezione('c2', 'wrong', new Date('2026-09-24T10:03:00.000Z')), false)
  assert.equal(letto('a3').corretta, undefined)
})

test('la riga di registro dice i numeri e mai la domanda', () => {
  const r = rigaRisposta(verbale('compatibile', { citazioni: 2, memoria: true, nonValide: [9], scoperti: ['4800'] }) as never)
  assert.equal(r, 'myynd · risposta · via compatibile · fonti 2 · memoria si · rifiuto no · scoperti 1 · tolte 1')
  assert.ok(!r.includes('risposta ·  '))
})

test('le somme contano tutto e per strada', () => {
  store.default.exec('DELETE FROM messaggi')
  const quando = new Date().toISOString()
  const scrivi = (id: string, v: unknown) =>
    store.default.prepare('INSERT INTO messaggi (id, chat, ruolo, testo, fonti, verifica, quando) VALUES (?,?,?,?,?,?,?)')
      .run(id, 'c1', 'a', 'x', null, JSON.stringify(v), quando)
  scrivi('s1', verbale('claude', { citazioni: 1 }))
  scrivi('s2', verbale('claude', { rifiuto: true }))
  scrivi('s3', verbale('abbonamento', { memoria: true, corretta: true }))
  scrivi('s4', verbale('abbonamento', { senzaFonti: true, scoperti: ['1'], nonValide: [7] }))
  store.default.prepare('INSERT INTO messaggi (id, chat, ruolo, testo, fonti, verifica, quando) VALUES (?,?,?,?,?,?,?)').run('u1', 'c1', 'u', 'domanda', null, null, quando)
  const v = vive(7)
  assert.equal(v.totale.risposte, 4)
  assert.equal(v.totale.conFonti, 2)
  assert.equal(v.totale.conMemoria, 1)
  assert.equal(v.totale.rifiuti, 1)
  assert.equal(v.totale.senzaFonti, 1)
  assert.equal(v.totale.conScoperti, 1)
  assert.equal(v.totale.conTolte, 1)
  assert.equal(v.totale.corrette, 1)
  assert.equal(v.perVia.claude.risposte, 2)
  assert.equal(v.perVia.abbonamento.corrette, 1)
  // una risposta di dieci giorni fa non sta nella finestra di sette
  store.default.prepare('INSERT INTO messaggi (id, chat, ruolo, testo, fonti, verifica, quando) VALUES (?,?,?,?,?,?,?)')
    .run('s5', 'c1', 'a', 'x', null, JSON.stringify(verbale('claude')), new Date(Date.now() - 10 * 86_400_000).toISOString())
  assert.equal(vive(7).totale.risposte, 4)
  assert.equal(vive(30).totale.risposte, 5)
})
