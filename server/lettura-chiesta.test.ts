// «Leggi adesso» di fondo (P10): una lettura per conto, la fine una volta sola.
//
//   node --import ./build/test-profile.mjs --test server/lettura-chiesta.test.ts

import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const compiti = await import('./compiti.ts')
const lc = await import('./lettura-chiesta.ts')

let A = '', B = ''
before(async () => {
  const a = await conti.registra('lettura-a@example.com', 'password-di-prova-1')
  const b = await conti.registra('lettura-b@example.com', 'password-di-prova-2')
  assert.ok(a.ok && b.ok)
  A = a.id; B = b.id
})
beforeEach(() => lc.perProva())

type Ev = { fase: string; stato?: string; lettura?: { id: string; passo: string; n: number | null }; nuove?: number; errore?: string }
function sente(conto: string) {
  const ev: Ev[] = []
  const via = compiti.ascolta(e => { if (e.fase === 'lettura') ev.push(e as Ev) }, conto)
  return { ev, via }
}
const aspetta = (ms: number) => new Promise(r => setTimeout(r, ms))
function fermo() {
  let lascia!: () => void, rompi!: (e: Error) => void
  const p = new Promise<void>((ok, no) => { lascia = ok; rompi = no })
  return { p, lascia, rompi }
}

test('due avvia: la stessa lettura, la seconda non è nuova; la fine porta le carte nate', async () => {
  const s = sente(A)
  const f = fermo()
  const catena = async () => {
    await f.p
    chi.dentro(A, () => store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Sign the order', testo: 'Harbor waits.', urgenza: 'by Monday', fonte: 'posta' }]))
  }
  const uno = lc.avvia(A, catena, { unita: false })
  const due = lc.avvia(A, catena, { unita: false })
  assert.equal(uno.nuova, true)
  assert.equal(due.nuova, false)
  assert.equal(due.lettura.id, uno.lettura.id)
  assert.equal(lc.inCorso(A)?.id, uno.lettura.id)
  assert.equal(uno.lettura.passo, 'arrivato')
  f.lascia()
  await aspetta(30)
  assert.equal(lc.inCorso(A), null, 'dopo la fine non resta niente')
  const fine = s.ev.filter(e => e.stato === 'fine')
  assert.equal(fine.length, 1)
  assert.equal(fine[0].nuove, 1)
  assert.equal(s.ev[0].stato, 'corre')
  s.via()
})

test('unita: parte dal passo delle fonti', async () => {
  const f = fermo()
  const { lettura } = lc.avvia(A, () => f.p, { unita: true })
  assert.equal(lettura.passo, 'fonti')
  assert.equal(lettura.unita, true)
  f.lascia(); await aspetta(10)
})

test('una catena che si rompe dà guaio con la frase, e libera il conto', async () => {
  const s = sente(A)
  const f = fermo()
  lc.avvia(A, () => f.p, { unita: false })
  f.rompi(new Error('Collega Claude e potrò lavorarci.'))
  await aspetta(20)
  const g = s.ev.find(e => e.stato === 'guaio')
  assert.equal(g?.errore, 'Collega Claude e potrò lavorarci.')
  assert.equal(lc.inCorso(A), null)
  // e una nuova pressione è di nuovo una lettura nuova
  const f2 = fermo()
  assert.equal(lc.avvia(A, () => f2.p, { unita: false }).nuova, true)
  f2.lascia(); await aspetta(10)
  s.via()
})

test('oltre il tempo della posa: fine alla posa, il registro se ne va, e la fine vera non dice più niente', async () => {
  lc.perProva({ posa: 50 })
  const s = sente(A)
  const f = fermo()
  lc.avvia(A, () => f.p, { unita: false })
  await aspetta(90)
  assert.equal(s.ev.filter(e => e.stato === 'fine').length, 1)
  assert.equal(lc.inCorso(A), null)
  const prima = s.ev.length
  f.lascia()
  await aspetta(20)
  assert.equal(s.ev.length, prima, 'la catena che finisce dopo la posa non annuncia niente')
  s.via()
})

test('staScegliendo è vero solo dentro scegli', async () => {
  const f = fermo()
  const dentro: boolean[] = []
  lc.avvia(A, async c => {
    dentro.push(lc.staScegliendo(A))
    await c.scegli(async () => { dentro.push(lc.staScegliendo(A)); await f.p })
    dentro.push(lc.staScegliendo(A))
  }, { unita: false })
  await aspetta(5)
  assert.equal(lc.staScegliendo(A), true)
  assert.equal(lc.staScegliendo(B), false)
  f.lascia(); await aspetta(10)
  assert.deepEqual(dentro, [false, true, false])
})

test('due conti leggono insieme, ognuno la sua', async () => {
  const sa = sente(A), sb = sente(B)
  const fa = fermo(), fb = fermo()
  const la = lc.avvia(A, () => fa.p, { unita: false })
  const lb = lc.avvia(B, () => fb.p, { unita: false })
  assert.equal(la.nuova && lb.nuova, true)
  assert.notEqual(la.lettura.id, lb.lettura.id)
  fa.lascia(); await aspetta(10)
  assert.equal(lc.inCorso(A), null)
  assert.equal(lc.inCorso(B)?.id, lb.lettura.id)
  assert.ok(sa.ev.every(e => e.lettura?.id === la.lettura.id), 'A non sente la lettura di B')
  assert.ok(sb.ev.every(e => e.lettura?.id === lb.lettura.id), 'B non sente la lettura di A')
  fb.lascia(); await aspetta(10)
  sa.via(); sb.via()
})

test('un passo ripetuto si annuncia una volta sola', async () => {
  const s = sente(A)
  const f = fermo()
  lc.avvia(A, async c => {
    c.passo('scelgo', 38); c.passo('scelgo', 38); c.passo('ordine'); c.passo('ordine')
    await f.p
  }, { unita: false })
  await aspetta(5)
  const corre = s.ev.filter(e => e.stato === 'corre').map(e => `${e.lettura!.passo}:${e.lettura!.n}`)
  assert.deepEqual(corre, ['arrivato:null', 'scelgo:38', 'ordine:null'])
  f.lascia(); await aspetta(10)
  s.via()
})

test('il filo dei compiti ridà la lettura che corre a chi arriva dopo; dopo la fine niente; a un altro conto niente', async () => {
  const f = fermo()
  lc.avvia(A, async c => { c.passo('scelgo', 3); await f.p }, { unita: false })
  await aspetta(5)
  const tardi = sente(A)
  assert.equal(tardi.ev.length, 1)
  assert.equal(tardi.ev[0].stato, 'corre')
  assert.equal(tardi.ev[0].lettura!.passo, 'scelgo')
  const altro = sente(B)
  assert.equal(altro.ev.length, 0)
  f.lascia(); await aspetta(10)
  const dopo = sente(A)
  assert.equal(dopo.ev.length, 0, 'finita la lettura, chi arriva non riceve niente')
  tardi.via(); altro.via(); dopo.via()
})
