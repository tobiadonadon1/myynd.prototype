// Prima di scrivere, quello che serve: cosa prendere, e prenderlo davvero.
//
//   node --import ./build/test-profile.mjs --test server/raccolta.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-raccolta-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Anna' }))
const store = await import('./store.ts')
const raccolta = await import('./raccolta.ts')

beforeEach(() => raccolta.perProva(null))
after(() => { raccolta.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

test('i bisogni: niente di suo sul web, solo indirizzi pubblici veri, al massimo cinque, senza doppioni', () => {
  const b = raccolta.bisogniValidi([
    { tipo: 'web', cosa: 'how top agencies write a construction audit proposal', perche: 'the shape of the best ones' },
    { tipo: 'web', cosa: 'reply to marco@studio.example about the quote', perche: 'x' },
    { tipo: 'web', cosa: 'invoice 4512339 status', perche: 'x' },
    { tipo: 'pagina', cosa: 'http://127.0.0.1:3000/admin', perche: 'x' },
    { tipo: 'pagina', cosa: 'https://www.youtube.com/watch?v=abc123', perche: 'the talk he mentioned' },
    { tipo: 'suoi', cosa: 'kitchen quote Marco', perche: 'what Marco already sent' },
    { tipo: 'web', cosa: 'How top agencies write a construction audit proposal', perche: 'doppione' },
    { tipo: 'telefono', cosa: 'call Marco', perche: 'x' }
  ])
  assert.deepEqual(b.map(x => `${x.tipo}:${x.cosa}`), [
    'web:how top agencies write a construction audit proposal',
    'pagina:https://www.youtube.com/watch?v=abc123',
    'suoi:kitchen quote Marco'
  ])
  // il nome di chi scrive non esce, il dominio del suo indirizzo sì (è una parola di tutti)
  const vietate = raccolta.paroleVietate('Anna Bruni', 'Marco Rossi <marco@studio.example>')
  assert.deepEqual(raccolta.bisogniValidi([
    { tipo: 'web', cosa: 'Marco Rossi architect reviews', perche: 'x' },
    { tipo: 'web', cosa: 'how an architecture studio prices a renovation', perche: 'x' }
  ], vietate).map(b => b.cosa), ['how an architecture studio prices a renovation'])
  // un link che fa qualcosa solo a guardarlo non si apre
  assert.equal(raccolta.paginaSicura('https://news.example.com/unsubscribe?u=1'), false)
  assert.equal(raccolta.paginaSicura('https://app.example.com/login?token=abcdef'), false)
  assert.equal(raccolta.paginaSicura('https://www.youtube.com/watch?v=abc123'), true)
  assert.equal(raccolta.paginaSicura('https://blog.example.com/author/jane'), true, '«author» non è «auth»')
  assert.equal(raccolta.paginaSicura('https://hr.example.com/payroll-guide'), true, '«payroll» non è «pay»')
  // un indirizzo scritto da lei sulla carta si apre com'è, anche con i numeri lunghi di un post
  const suo = 'https://x.com/user/status/1849276318472938512'
  assert.equal(raccolta.bisogniValidi([{ tipo: 'pagina', cosa: suo, perche: 'x' }], new Set(), { suoi: `Reply to this post ${suo}` }).length, 1)
  assert.equal(raccolta.bisogniValidi([{ tipo: 'pagina', cosa: suo, perche: 'x' }]).length, 0, 'composto dal modello, con un numero lungo: no')
  // il mandato senza web: restano solo le sue cose
  assert.deepEqual(raccolta.bisogniValidi([{ tipo: 'web', cosa: 'renovation permits Milan', perche: 'x' }, { tipo: 'suoi', cosa: 'permit', perche: 'x' }], new Set(), { web: false }).map(b => b.tipo), ['suoi'])
  assert.equal(raccolta.puoUscire('Atlas launch checklist'), true)
  assert.equal(raccolta.puoUscire('wire 12,500.00 to the supplier'), false)
})

test('raccogli: una chiamata decide, poi va a prendere tutto; le letture diventano fatti delle mani e un blocco per chi scrive', async () => {
  store.salvaDocumenti([
    { id: 'posta:7', fonte: 'posta', tipo: 'email', titolo: 'Kitchen quote', corpo: 'Hi Anna, the quote is 4,200 euros, valid until May.', autore: 'Marco <marco@studio.example>', quando: new Date().toISOString() }
  ] as never)
  const cercate: string[] = []
  const segnate: string[] = []
  raccolta.perProva({
    collegato: () => true,
    chiediJSON: (async () => ({ bisogni: [
      { tipo: 'web', cosa: 'kitchen renovation quote what to check', perche: 'what a good reply asks' },
      { tipo: 'suoi', cosa: 'kitchen quote', perche: 'what Marco already sent' }
    ] })) as never,
    cercaWeb: (async (q: string) => { cercate.push(q); return [{ titolo: 'Checklist', url: 'https://example.org/checklist', riassunto: 'Ask about timing.' }] }) as never,
    leggiPagina: (async (u: string) => ({ url: u, testo: 'Always ask for the timeline and what is excluded.' })) as never,
    cerca: () => [store.documento('posta:7')!]
  })
  const r = await raccolta.raccogli({ compito: 'Reply to Marco about the kitchen quote', lingua: 'en', segna: c => segnate.push(c) })
  assert.deepEqual(cercate, ['kitchen renovation quote what to check'])
  assert.deepEqual(r.fatti.map(f => `${f.attrezzo}:${f.esito}`), ['cerca_web:ok', 'leggi_pagina:ok', 'cerca:ok'])
  assert.equal(segnate.length, 2, 'la carta dice cosa sta cercando')
  assert.match(r.testo, /Before starting, you went and got what this work needs/)
  assert.match(r.testo, /timeline and what is excluded/)
  assert.match(r.testo, /4,200 euros/)
  // il secondo giro della stessa carta riusa quello che ha preso
  const prima = await raccolta.raccogli({ compito: 'Reply to Marco about the kitchen quote', lingua: 'en', carta: 'c1' })
  const dopo = await raccolta.raccogli({ compito: 'Reply to Marco about the kitchen quote', lingua: 'en', carta: 'c1' })
  assert.equal(dopo, prima)
  assert.equal(cercate.length, 2, 'una ricerca per la prima raccolta, una per la carta c1, nessuna per il secondo giro')
})

test('senza modello, o con zero bisogni, la raccolta è vuota e il lavoro va avanti com\'era; una lettura che fallisce si dice', async () => {
  raccolta.perProva({ collegato: () => false })
  assert.deepEqual(await raccolta.raccogli({ compito: 'x', lingua: 'en' }), { bisogni: [], testo: '', fatti: [] })
  raccolta.perProva({ collegato: () => true, chiediJSON: (async () => ({ bisogni: [] })) as never })
  assert.equal((await raccolta.raccogli({ compito: 'Reply yes to the dinner', lingua: 'en' })).testo, '')
  raccolta.perProva({
    collegato: () => true,
    chiediJSON: (async () => ({ bisogni: [{ tipo: 'pagina', cosa: 'https://example.org/gone', perche: 'x' }] })) as never,
    leggiPagina: (async () => { throw new Error('404') }) as never
  })
  const r = await raccolta.raccogli({ compito: 'Summarise the page', lingua: 'en' })
  assert.equal(r.fatti[0]!.esito, 'errore')
  assert.equal(r.testo, '', 'niente letto, niente blocco')
})
