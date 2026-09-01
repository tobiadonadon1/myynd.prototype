// Google: le parti che sbagliano in silenzio.
//
// Non si prova la rete — si prova quello che succede *ai dati* prima e dopo la
// rete, che è dove i guasti non fanno rumore: un'email letta come una riga
// vuota, un'ora spostata di due, un id di un'altra fonte finito in una chiamata
// che cancella posta.
//
//   node --test server/google.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-google-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const g = await import('./connettori/google.ts')
const VERA = globalThis.fetch
after(() => {
  globalThis.fetch = VERA
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

// — l'ora —

test('un’ora senza fuso è l’ora di qui, non di Greenwich', () => {
  const d = g.quando('2026-09-03T15:00')
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth(), 8)
  assert.equal(d.getDate(), 3)
  // il difetto che questo test esiste per prendere: l'evento c'è, sembra
  // giusto, ed è spostato di due ore
  assert.equal(d.getHours(), 15, 'l’ora è stata letta come UTC')
  assert.equal(d.getMinutes(), 0)
})

test('una data senza ora finisce di mattina, non a mezzanotte', () => {
  // mezzanotte vorrebbe dire un evento «il giorno prima, tardi» per chi guarda
  assert.equal(g.quando('2026-09-03').getHours(), 9)
})

test('una data che non è una data si ferma qui', () => {
  assert.throws(() => g.quando('presto'), /Non ho capito la data/)
})

// — quello che tocca —

test('un id che non è di Gmail non entra in una chiamata che sposta posta', async () => {
  // se passasse, la stessa chiamata riceverebbe un id di un'altra fonte e
  // Google risponderebbe su qualcosa che non c'entra
  let chiamate = 0
  globalThis.fetch = (async () => { chiamate++; return Response.json({}) }) as typeof fetch
  assert.equal(await g.cestina(['posta:INBOX:12', 'desktop:/x/y.pdf']), 0)
  assert.equal(await g.archivia(['notion:abc']), 0)
  assert.equal(chiamate, 0, 'ha chiamato Google per roba che non è sua')
})

test('senza account collegato non parte nessuna chiamata', async () => {
  let chiamate = 0
  globalThis.fetch = (async () => { chiamate++; return Response.json({}) }) as typeof fetch
  await assert.rejects(() => g.cestina(['google:abc']), /Collega Google/)
  await assert.rejects(() => g.mettiInAgenda([{ titolo: 'x', inizio: '2026-09-03T10:00' }]), /Collega Google/)
  assert.equal(chiamate, 0)
})

test('collegato, il cestino è una chiamata sola per tutti', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ ...cfg.leggi(), google: { clientId: 'x', refresh: 'r' } })
  g.scordaIlToken()

  const viste: { url: string; corpo: unknown }[] = []
  globalThis.fetch = (async (url: string | URL, o?: RequestInit) => {
    const u = String(url)
    if (u.includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'vivo', expires_in: 3600 })
    }
    viste.push({ url: u, corpo: JSON.parse(String(o?.body ?? '{}')) })
    return Response.json({})
  }) as typeof fetch

  assert.equal(await g.cestina(['google:a', 'google:b', 'posta:INBOX:1']), 2)
  assert.equal(viste.length, 1, 'una chiamata per messaggio invece che una per tutti')
  const corpo = viste[0].corpo as { ids: string[]; addLabelIds?: string[] }
  assert.deepEqual(corpo.ids, ['a', 'b'], 'ha mandato gli id con il prefisso')
  assert.deepEqual(corpo.addLabelIds, ['TRASH'])
})

test('archiviare toglie dalla casella e non mette nel cestino', async () => {
  const viste: Record<string, string[]>[] = []
  globalThis.fetch = (async (url: string | URL, o?: RequestInit) => {
    if (String(url).includes('/token')) return Response.json({ access_token: 'vivo', expires_in: 3600 })
    viste.push(JSON.parse(String(o?.body ?? '{}')))
    return Response.json({})
  }) as typeof fetch
  g.scordaIlToken()
  await g.archivia(['google:a'])
  assert.deepEqual(viste[0].removeLabelIds, ['INBOX'])
  assert.equal(viste[0].addLabelIds, undefined, 'archiviare ha buttato via il messaggio')
})

test('un rifiuto di Google diventa una frase, non un codice', async () => {
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes('/token')) return Response.json({ access_token: 'vivo', expires_in: 3600 })
    return new Response(JSON.stringify({ error: { message: 'Insufficient Permission' } }), { status: 403 })
  }) as typeof fetch
  g.scordaIlToken()
  await assert.rejects(() => g.cestina(['google:a']), /ricollega l’account/)
})

test('il token si riusa finché è vivo', async () => {
  let token = 0
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes('/token')) { token++; return Response.json({ access_token: 'vivo', expires_in: 3600 }) }
    return Response.json({})
  }) as typeof fetch
  g.scordaIlToken()
  await g.archivia(['google:a'])
  await g.archivia(['google:b'])
  assert.equal(token, 1, 'ha chiesto un token nuovo per ogni chiamata')
})
