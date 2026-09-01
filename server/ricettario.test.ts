// Le ricette che arrivano dalla rete.
//
// È l'unico posto in cui questa app prende qualcosa da fuori e lo scrive sul
// disco, e i modi in cui una cosa così si rompe sono tutti silenziosi: un nome
// di file che esce dalla cartella, una risposta a metà che cancella le ricette
// di un cliente, una ricetta scritta male che entra lo stesso. Nessuno di
// questi darebbe un errore. Perciò stanno tutti qui sotto, con la rete finta.
//
//   node --test server/ricettario.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-ricette-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const r = await import('./ricettario.ts')

const VERA = globalThis.fetch
after(() => {
  globalThis.fetch = VERA
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

/** Una ricetta qualsiasi: al ricettario interessa solo che `valida` la passi. */
const ricetta = (id: string) => JSON.stringify({ id, nome: id })

/** `valida` finta: passa tutto tranne quello che ha «rotta» dentro. */
const valida = (x: unknown, da: string) => {
  if (JSON.stringify(x).includes('rotta')) throw new Error(`${da}: è rotta`)
  return x
}

type Finto = { elenco: Record<string, { name: string; sha: string; size: number; type: string }[]>; file: Record<string, string> }
let chiamate: string[] = []

/** La rete finta: un elenco per cartella e un corpo per file. */
function rete(f: Finto, stato: Record<string, number> = {}) {
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url)
    chiamate.push(u)
    const percorso = decodeURIComponent(u.split('/contents/')[1].split('?')[0])
    if (stato[percorso]) return new Response('no', { status: stato[percorso] })
    if (f.elenco[percorso]) return Response.json(f.elenco[percorso])
    if (f.file[percorso] !== undefined) return new Response(f.file[percorso])
    return new Response('non c’è', { status: 404 })
  }) as typeof fetch
}

const voce = (name: string, sha: string, size = 100) => ({ name, sha, size, type: 'file' })
const SORGENTE = { repo: 'myynd/ricette', licenza: 'acme' }
const dove = (c: string, f: string) => join(CASA, '.myynd', 'automazioni', c, f)

beforeEach(() => {
  chiamate = []
  rmSync(join(CASA, '.myynd', 'automazioni'), { recursive: true, force: true })
})

test('una ricetta pubblicata arriva sul disco', async () => {
  rete({
    elenco: { 'automazioni/_comuni': [voce('prova.json', 'aaa')], 'automazioni/acme': [] },
    file: { 'automazioni/_comuni/prova.json': ricetta('prova') }
  })
  const e = await r.aggiorna(SORGENTE, valida)
  assert.equal(e.guaio, null)
  assert.equal(e.nuove, 1)
  assert.ok(existsSync(dove('_comuni', 'prova.json')))
})

test('la cartella del cliente vive accanto a quella di tutti', async () => {
  rete({
    elenco: {
      'automazioni/_comuni': [voce('a.json', '1')],
      'automazioni/acme': [voce('b.json', '2')]
    },
    file: { 'automazioni/_comuni/a.json': ricetta('a'), 'automazioni/acme/b.json': ricetta('b') }
  })
  await r.aggiorna(SORGENTE, valida)
  assert.ok(existsSync(dove('_comuni', 'a.json')))
  assert.ok(existsSync(dove('acme', 'b.json')))
  assert.deepEqual(r.cartelleScaricate('acme').map(p => p.split('/').pop()), ['_comuni', 'acme'])
})

test('una ricetta che non passa da valida non tocca il disco', async () => {
  rete({
    elenco: { 'automazioni/_comuni': [voce('rotta.json', '1'), voce('buona.json', '2')], 'automazioni/acme': [] },
    file: {
      'automazioni/_comuni/rotta.json': JSON.stringify({ id: 'rotta' }),
      'automazioni/_comuni/buona.json': ricetta('buona')
    }
  })
  const e = await r.aggiorna(SORGENTE, valida)
  assert.equal(e.scartate, 1)
  assert.equal(e.nuove, 1)
  assert.ok(!existsSync(dove('_comuni', 'rotta.json')), 'una ricetta rifiutata è finita sul disco lo stesso')
})

test('un nome di file che esce dalla cartella viene ignorato', async () => {
  // il nome arriva da una risposta HTTP e finisce dentro un join(): senza il
  // filtro, «../../..» è un nome di file come un altro
  rete({
    elenco: {
      'automazioni/_comuni': [
        voce('../../../fuori.json', '1'), voce('/etc/passwd.json', '2'),
        voce('Maiuscolo.json', '3'), voce('script.js', '4'), voce('buona.json', '5')
      ],
      'automazioni/acme': []
    },
    file: { 'automazioni/_comuni/buona.json': ricetta('buona') }
  })
  const e = await r.aggiorna(SORGENTE, valida)
  assert.equal(e.nuove, 1, 'ha scritto qualcosa che non doveva')
  assert.ok(!existsSync(join(CASA, '.myynd', 'fuori.json')))
  assert.ok(!existsSync(join(CASA, 'fuori.json')))
})

test('una ricetta ritirata sparisce anche di qua', async () => {
  rete({
    elenco: { 'automazioni/_comuni': [voce('a.json', '1'), voce('b.json', '2')], 'automazioni/acme': [] },
    file: { 'automazioni/_comuni/a.json': ricetta('a'), 'automazioni/_comuni/b.json': ricetta('b') }
  })
  await r.aggiorna(SORGENTE, valida)
  rete({
    elenco: { 'automazioni/_comuni': [voce('a.json', '1')], 'automazioni/acme': [] },
    file: { 'automazioni/_comuni/a.json': ricetta('a') }
  })
  const e = await r.aggiorna(SORGENTE, valida)
  assert.equal(e.tolte, 1)
  assert.ok(!existsSync(dove('_comuni', 'b.json')))
  assert.ok(existsSync(dove('_comuni', 'a.json')))
})

test('quello che non è cambiato non si riscarica', async () => {
  const f: Finto = {
    elenco: { 'automazioni/_comuni': [voce('a.json', 'sha1')], 'automazioni/acme': [] },
    file: { 'automazioni/_comuni/a.json': ricetta('a') }
  }
  rete(f)
  await r.aggiorna(SORGENTE, valida)
  chiamate = []
  rete(f)
  const e = await r.aggiorna(SORGENTE, valida)
  assert.equal(e.nuove + e.cambiate, 0)
  assert.ok(!chiamate.some(u => u.includes('a.json')), 'ha riscaricato un file identico')
})

test('un elenco che non arriva non cancella niente', async () => {
  rete({
    elenco: { 'automazioni/_comuni': [voce('a.json', '1')], 'automazioni/acme': [] },
    file: { 'automazioni/_comuni/a.json': ricetta('a') }
  })
  await r.aggiorna(SORGENTE, valida)
  // adesso il repository risponde 500: le ricette di prima devono restare
  rete({ elenco: {}, file: {} }, { 'automazioni/_comuni': 500 })
  const e = await r.aggiorna(SORGENTE, valida)
  assert.ok(e.guaio, 'un 500 è passato per un successo')
  assert.equal(e.tolte, 0)
  assert.ok(existsSync(dove('_comuni', 'a.json')), 'una risposta rotta ha svuotato la cartella')
})

test('la cartella di un cliente che non esiste ancora non è un guasto', async () => {
  rete({
    elenco: { 'automazioni/_comuni': [voce('a.json', '1')] },
    file: { 'automazioni/_comuni/a.json': ricetta('a') }
  }, { 'automazioni/acme': 404 })
  const e = await r.aggiorna(SORGENTE, valida)
  assert.equal(e.guaio, null)
  assert.equal(e.nuove, 1)
})

test('un repository scritto male non fa partire nessuna chiamata', async () => {
  rete({ elenco: {}, file: {} })
  for (const repo of ['non-un-repo', 'https://github.com/a/b', 'a/b/c', '../../x']) {
    const e = await r.aggiorna({ repo }, valida)
    assert.ok(e.guaio, `«${repo}» è passato`)
  }
  assert.deepEqual(chiamate, [], 'ha chiamato la rete con un repository storto')
})

test('il token esce solo se c’è, e solo verso GitHub', async () => {
  let intestazioni: Record<string, string> = {}
  globalThis.fetch = (async (url: string | URL, o?: RequestInit) => {
    intestazioni = (o?.headers ?? {}) as Record<string, string>
    assert.ok(String(url).startsWith('https://api.github.com/'), 'sta parlando con un altro')
    return Response.json([])
  }) as typeof fetch

  await r.aggiorna({ repo: 'a/b' }, valida)
  assert.ok(!('authorization' in intestazioni), 'ha mandato un’intestazione di autorizzazione senza token')
  await r.aggiorna({ repo: 'a/b', token: 'segreto' }, valida)
  assert.equal(intestazioni.authorization, 'Bearer segreto')
})

test('un file troppo grosso non si scarica nemmeno', async () => {
  rete({
    elenco: { 'automazioni/_comuni': [voce('enorme.json', '1', 5 * 1024 * 1024)], 'automazioni/acme': [] },
    file: {}
  })
  const e = await r.aggiorna(SORGENTE, valida)
  assert.equal(e.nuove, 0)
  assert.ok(!chiamate.some(u => u.includes('enorme')), 'è andato a prendere cinque mega')
})

test('l’indice si tiene com’è andata, per la schermata', async () => {
  rete({
    elenco: { 'automazioni/_comuni': [voce('a.json', '1')], 'automazioni/acme': [] },
    file: { 'automazioni/_comuni/a.json': ricetta('a') }
  })
  await r.aggiorna(SORGENTE, valida)
  const s = r.stato()
  assert.ok(s.quando, 'non ha segnato quando')
  assert.equal(s.guaio, null)
})

test('un indice illeggibile non impedisce di ricominciare', async () => {
  mkdirSync(join(CASA, '.myynd', 'automazioni'), { recursive: true })
  writeFileSync(join(CASA, '.myynd', 'automazioni', 'indice.json'), 'non è json')
  rete({
    elenco: { 'automazioni/_comuni': [voce('a.json', '1')], 'automazioni/acme': [] },
    file: { 'automazioni/_comuni/a.json': ricetta('a') }
  })
  const e = await r.aggiorna(SORGENTE, valida)
  assert.equal(e.nuove, 1)
  assert.ok(JSON.parse(readFileSync(join(CASA, '.myynd', 'automazioni', 'indice.json'), 'utf8')).sha)
})
