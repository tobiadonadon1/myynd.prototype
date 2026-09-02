// Il pacco che porta via tutto: si controlla prima di sostituire, e quello che
// c'era non sparisce.
//
//   node --test server/trasloco.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-trasloco-'))
process.env.MYYND_DATI = CASA

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const trasloco = await import('./trasloco.ts')

let anna = ''
const doc = (id: string, titolo: string) => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `il testo di ${titolo} con abbastanza parole dentro`,
  autore: null, percorso: null, quando: '2026-01-01T00:00:00.000Z', gruppo: 'posta'
})

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  assert.ok(a.ok)
  anna = a.ok ? a.id : ''
  chi.dentro(anna, () => {
    cfg.aggiorna({ nome: 'Anna', posta: { host: 'imap.esempio.it', porta: 993, utente: 'anna@esempio.it', password: 'segreta', giorni: 30 } })
    store.salvaDocumenti([doc('posta:1', 'Preventivo Rossi'), doc('posta:2', 'Fattura Bianchi')])
  })
})

after(() => {
  store.chiudiIndici()
  rmSync(CASA, { recursive: true, force: true })
})

test('un file che non è un pacco viene rifiutato con una frase', () => {
  chi.dentro(anna, () => {
    assert.throws(() => trasloco.importa(Buffer.from('non gzip')), /non è un Myynd/)
    assert.throws(() => trasloco.importa(gzipSync(Buffer.from('{"versione":99}'))), /versione che non so leggere/)
  })
})

test('un pacco con dentro un finto indice non tocca quello vero', () => {
  chi.dentro(anna, () => {
    const prima = store.conteggi().totale
    const finto = { versione: 1, quando: 'x', config: {}, mente: Buffer.from('non sono sqlite, sono testo lungo abbastanza').toString('base64'), automazioni: {} }
    assert.throws(() => trasloco.importa(gzipSync(Buffer.from(JSON.stringify(finto)))), /non è un indice/)
    assert.equal(store.conteggi().totale, prima, 'l’indice vero è stato toccato')
    assert.ok(!existsSync(join(cfg.cartella(), 'mente.in-arrivo.db')), 'il file provvisorio è rimasto')
  })
})

test('esporta e reimporta: i documenti tornano, l’indice di prima resta da parte, e «account» non entra', () => {
  chi.dentro(anna, () => {
    const pacco = trasloco.esporta()
    assert.ok(pacco.length > 100)

    // fra l'uno e l'altro si aggiunge un documento: l'importazione sostituisce,
    // quindi dopo non deve esserci più
    store.salvaDocumenti([doc('posta:3', 'Dopo il pacco')])
    assert.equal(store.conteggi().totale, 3)

    // e nel pacco si infila un account, che qui non deve arrivare
    const dentro = JSON.parse(gunzipSync(pacco).toString('utf8'))
    dentro.config.account = { email: 'altro@esempio.it', sale: 'x', hash: 'y' }
    const esito = trasloco.importa(gzipSync(Buffer.from(JSON.stringify(dentro))))

    assert.equal(esito.documenti, 2)
    assert.equal(store.conteggi().totale, 2)
    assert.equal(store.documento('posta:3'), null)
    const c = cfg.leggi()
    assert.equal(c.account, undefined, 'l’account del pacco è entrato')
    assert.equal(c.nome, 'Anna')
    assert.equal(c.posta?.password, 'segreta', 'le credenziali delle fonti viaggiano nel pacco')

    const istantanee = readdirSync(join(cfg.cartella(), 'istantanee')).filter(n => n.startsWith('mente-prima-del-trasloco'))
    assert.equal(istantanee.length, 1, 'quello che c’era prima non è stato messo da parte')
  })
})

test('controlla() legge l’intestazione e rifiuta uno schema più nuovo', () => {
  const finto = join(CASA, 'finto.db')
  writeFileSync(finto, 'SQLite format 3\0 ma poi niente di sensato')
  assert.throws(() => store.controlla(finto), /danneggiato|non è un indice/)
})
