// L'ordine frazionario si rompe in silenzio: la lista continua a mostrarsi,
// solo nell'ordine sbagliato, e te ne accorgi settimane dopo. Questi test
// provano che i modi di romperlo restano rumorosi.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fra, dopo, prima } from './ordine.ts'

test('la prima riga di una lista vuota sta in mezzo, non in fondo', () => {
  const k = fra('', '')
  assert.ok(k > '0' && k < 'z', `«${k}» non lascia spazio da tutte e due le parti`)
})

test('una chiave in mezzo ci sta davvero in mezzo', () => {
  const k = fra('a', 'c')
  assert.ok('a' < k && k < 'c', `«${k}» non sta fra «a» e «c»`)
})

test('fra due cifre attaccate ci sta comunque qualcosa', () => {
  const k = fra('a', 'b')
  assert.ok('a' < k && k < 'b', `«${k}» non sta fra «a» e «b» — due cifre vicine non lasciano spazio`)
})

test('mille inserimenti nello stesso punto continuano a stare in mezzo', () => {
  // è il caso che rompe l'ordine a virgola mobile: dopo una cinquantina di
  // trascinamenti fra le stesse due righe i numeri non si distinguono più
  let a = fra('', '')
  const b = dopo(a)
  let ultima = a
  for (let i = 0; i < 1000; i++) {
    const k = fra(ultima, b)
    assert.ok(ultima < k && k < b, `al giro ${i} «${k}» è uscito dall'intervallo`)
    ultima = k
  }
})

test('mille righe in fondo restano in ordine crescente', () => {
  let k = fra('', '')
  for (let i = 0; i < 1000; i++) {
    const nuova = dopo(k)
    assert.ok(nuova > k, `al giro ${i}: «${nuova}» non viene dopo «${k}»`)
    k = nuova
  }
})

test('mille righe in cima restano in ordine decrescente', () => {
  let k = fra('', '')
  for (let i = 0; i < 1000; i++) {
    const nuova = prima(k)
    assert.ok(nuova < k, `al giro ${i}: «${nuova}» non viene prima di «${k}»`)
    k = nuova
  }
})

test('nessuna chiave finisce con lo zero', () => {
  // una chiave che finisce per '0' non ha più niente fra sé e quella prima:
  // è il modo in cui l'algoritmo smette di funzionare senza dirlo
  let k = fra('', '')
  const chiavi = [k]
  for (let i = 0; i < 200; i++) { k = dopo(k); chiavi.push(k) }
  let j = fra('', '')
  for (let i = 0; i < 200; i++) { j = prima(j); chiavi.push(j) }
  let a = fra('', ''); const b = dopo(a)
  for (let i = 0; i < 200; i++) { a = fra(a, b); chiavi.push(a) }
  for (const c of chiavi) {
    assert.notEqual(c.slice(-1), '0', `«${c}» finisce con lo zero: sotto di lei non c'è più spazio`)
  }
})

test('un ordine al contrario è un errore, non una chiave sbagliata in silenzio', () => {
  assert.throws(() => fra('c', 'a'), /non viene prima/, 'ha accettato due chiavi invertite')
})

test('una lista riordinata mille volte resta coerente', () => {
  // il vero collaudo: si costruisce una lista, si sposta a caso, e alla fine
  // l'ordine delle chiavi deve corrispondere all'ordine delle righe
  const righe: { id: number; ordine: string }[] = []
  let k = fra('', '')
  for (let i = 0; i < 40; i++) { righe.push({ id: i, ordine: k }); k = dopo(k) }

  let seme = 12345
  const caso = (n: number) => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % n }

  for (let giro = 0; giro < 1000; giro++) {
    righe.sort((x, y) => (x.ordine < y.ordine ? -1 : x.ordine > y.ordine ? 1 : 0))
    const da = caso(righe.length)
    const a = caso(righe.length)
    const sopra = a > 0 ? righe[a - 1].ordine : ''
    const sotto = a < righe.length ? righe[a].ordine : ''
    if (righe[da].ordine === sopra || righe[da].ordine === sotto) continue
    righe[da].ordine = fra(sopra, sotto)
  }

  const ordinate = [...righe].sort((x, y) => (x.ordine < y.ordine ? -1 : 1))
  const chiavi = ordinate.map(r => r.ordine)
  for (let i = 1; i < chiavi.length; i++) {
    assert.ok(chiavi[i - 1] < chiavi[i], `dopo mille spostamenti «${chiavi[i - 1]}» e «${chiavi[i]}» non sono più in ordine`)
  }
  assert.equal(new Set(chiavi).size, chiavi.length, 'due righe hanno finito con la stessa chiave')
})

test('una chiave malformata è un errore, non una risposta sbagliata', () => {
  // erano tutti casi che tornavano una chiave *fuori* dall'intervallo chiesto,
  // in silenzio: la lista si riordinava da sola e nessuno sapeva perché
  assert.throws(() => fra('', '0'), /zero/, "«0» come limite superiore è passata")
  assert.throws(() => fra('!', '~'), /non è una chiave/, 'caratteri fuori alfabeto passati')
  assert.throws(() => fra('a0', 'b'), /zero/, 'una chiave che finisce per zero è passata')
})

test('due chiavi identiche non producono una chiave in mezzo', () => {
  // succede se due secchi diversi hanno distribuito la stessa chiave e una
  // riga passa dall'uno all'altro: meglio rumoroso che un ordine arbitrario
  assert.throws(() => fra('i', 'i'), /non viene prima/)
})
