// Il filo delle email: la chiave, e come allarga il materiale.
//
// Due cose che sbaglierebbero in silenzio. La chiave: se «Re: Preventivo» e
// «preventivo» finiscono in due fili diversi, la conversazione si spezza e il
// modello legge metà di quello che c'è — senza nessun errore, solo una bozza
// che non sa cosa era già stato promesso. L'allargamento: se i fratelli si
// mettono *prima* dei risultati, la numerazione delle citazioni si sposta e
// [2] punta a un altro documento; se non c'è un tetto, un filo di quaranta
// messaggi si porta via tutto il contesto.
//
//   node --test server/filo.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-filo-'))
process.env.MYYND_DATI = CASA

const { filoDi, oggettoNormalizzato, idPulito } = await import('./filo.ts')
const store = await import('./store.ts')
const claude = await import('./claude.ts')

before(() => store.azzeraTutto())
after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

// — la chiave —

test('la radice di References vince su tutto', () => {
  assert.equal(filoDi({
    messageId: '<c@x>', inReplyTo: '<b@x>', references: ['<a@x>', '<b@x>'], oggetto: 'Re: Ciao'
  }), 'a@x')
  // come testo, con gli id in fila: è come arrivano da Gmail e da Graph
  assert.equal(filoDi({ references: '<a@x>\r\n <b@x> <c@x>', messageId: '<d@x>' }), 'a@x')
})

test('senza References si usa In-Reply-To, poi il Message-ID', () => {
  assert.equal(filoDi({ messageId: '<c@x>', inReplyTo: '<b@x>' }), 'b@x')
  assert.equal(filoDi({ messageId: '<c@x>' }), 'c@x')
  // e il primo messaggio di una conversazione ha per chiave il suo id: è
  // quello che tutte le risposte citeranno
  assert.equal(filoDi({ messageId: ' <c@x> ', oggetto: 'Preventivo' }), 'c@x')
})

test('senza identificativi resta l’oggetto normalizzato, con «s:» davanti', () => {
  assert.equal(filoDi({ oggetto: 'Re: R: FWD: Fw:  Preventivo   impianto' }), 's:preventivo impianto')
  assert.equal(filoDi({ oggetto: 'I: AW: Angebot' }), 's:angebot')
  assert.equal(filoDi({ oggetto: 'RE[2]: Preventivo' }), 's:preventivo')
  // un prefisso in mezzo non è un prefisso
  assert.equal(filoDi({ oggetto: 'Il re: una storia' }), 's:il re: una storia')
})

test('un oggetto vuoto o fatto solo di prefissi non è un filo', () => {
  assert.equal(filoDi({}), null)
  assert.equal(filoDi({ oggetto: '   ' }), null)
  assert.equal(filoDi({ oggetto: 'Re: ' }), null)
  // parentesi vuote non sono un id: altrimenti diventerebbero il filo di tutte
  assert.equal(filoDi({ messageId: '<>', oggetto: 'X' }), 's:x')
})

test('la pulizia degli id e degli oggetti, da sola', () => {
  assert.equal(idPulito('  <a@b>  '), 'a@b')
  assert.equal(idPulito('<<a@b>>'), 'a@b')
  assert.equal(idPulito(null), '')
  assert.equal(oggettoNormalizzato('Fwd:   Re: Ciao  a   tutti '), 'ciao a tutti')
  assert.equal(oggettoNormalizzato(undefined), '')
})

// — nell’indice —

const mail = (id: string, filo: string | null, quando: string, sopra: Partial<Documento> = {}): Documento => ({
  id: `posta:INBOX:${id}`, fonte: 'posta', tipo: 'email', titolo: `Messaggio ${id}`,
  corpo: `Testo del messaggio ${id}.`, autore: 'Rossi <rossi@esempio.it>', percorso: 'INBOX',
  quando, gruppo: 'posta', filo, ...sopra
})

test('stessoFilo torna i fratelli, i più recenti prima, senza quelli esclusi', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    mail('1', 'f1', '2026-01-01T00:00:00.000Z'),
    mail('2', 'f1', '2026-01-03T00:00:00.000Z'),
    mail('3', 'f1', '2026-01-02T00:00:00.000Z'),
    mail('9', 'f2', '2026-01-09T00:00:00.000Z')
  ])
  const f = store.stessoFilo('f1', ['posta:INBOX:2'], 5)
  assert.deepEqual(f.map(d => d.id), ['posta:INBOX:3', 'posta:INBOX:1'])
  assert.deepEqual(store.stessoFilo('f1', [], 1).map(d => d.id), ['posta:INBOX:2'])
  assert.deepEqual(store.stessoFilo('', [], 5), [])
  assert.deepEqual(store.stessoFilo('non-esiste', [], 5), [])
})

test('il filo si scrive e si rilegge dall’indice, e cambiarlo non conta come un arrivo', () => {
  store.azzeraTutto()
  store.salvaDocumenti([mail('1', null, '2026-01-01T00:00:00.000Z')])
  const prima = store.documento('posta:INBOX:1')!
  assert.equal(prima.filo, null)
  const indicizzato = (store.default.prepare('SELECT indicizzato FROM documenti WHERE id = ?')
    .get('posta:INBOX:1') as { indicizzato: string }).indicizzato

  // la prima lettura dopo l'aggiornamento riscrive il filo su ogni email: se
  // contasse come «cambiato», domattina il feed vedrebbe tremila email nuove
  const esito = store.salvaDocumenti([mail('1', 'f1', '2026-01-01T00:00:00.000Z')])
  assert.deepEqual(esito, { nuovi: 0, cambiati: 0, invariati: 1 })
  assert.equal(store.documento('posta:INBOX:1')!.filo, 'f1')
  const dopo = (store.default.prepare('SELECT indicizzato FROM documenti WHERE id = ?')
    .get('posta:INBOX:1') as { indicizzato: string }).indicizzato
  assert.equal(dopo, indicizzato, 'ha spostato «indicizzato» per una chiave in più')
})

// — l’allargamento del materiale —

test('ogni email trovata si porta dietro fino a cinque fratelli, dopo i risultati', () => {
  store.azzeraTutto()
  const docs: Documento[] = [
    // quello che la ricerca trova: parla di preventivo
    mail('10', 'f1', '2026-02-10T00:00:00.000Z', { titolo: 'Preventivo impianto', corpo: 'Il preventivo per l\'impianto.' })
  ]
  // sette fratelli, che non parlano di preventivi
  for (let i = 1; i <= 7; i++) docs.push(mail(`${i}`, 'f1', `2026-02-0${i}T00:00:00.000Z`))
  store.salvaDocumenti(docs)

  const m = claude.materiale('preventivo', [])
  assert.equal(m[0].id, 'posta:INBOX:10', 'il risultato vero deve restare per primo')
  const fratelli = m.slice(1).map(d => d.id)
  assert.equal(fratelli.length, 5, 'più di cinque fratelli')
  // i più recenti prima: 7, 6, 5, 4, 3
  assert.deepEqual(fratelli, ['posta:INBOX:7', 'posta:INBOX:6', 'posta:INBOX:5', 'posta:INBOX:4', 'posta:INBOX:3'])
})

test('il totale non supera i sedici, e si allargano al massimo quattro fili', () => {
  // dieci risultati su dieci fili diversi, ognuno con cinque fratelli
  const docs: Documento[] = []
  for (let f = 1; f <= 10; f++) {
    docs.push({ id: `r${f}`, fonte: 'posta', tipo: 'email', titolo: `Risultato ${f}`, corpo: 'parola rara zafferano', quando: `2026-03-${String(f).padStart(2, '0')}T00:00:00.000Z`, filo: `f${f}`, gruppo: 'posta' })
    for (let k = 1; k <= 5; k++) {
      docs.push({ id: `s${f}-${k}`, fonte: 'posta', tipo: 'email', titolo: `Fratello ${f}-${k}`, corpo: 'altro', quando: `2026-02-${String(k).padStart(2, '0')}T00:00:00.000Z`, filo: `f${f}`, gruppo: 'posta' })
    }
  }
  store.azzeraTutto()
  store.salvaDocumenti(docs)
  const largo = claude.conIlFilo(docs.filter(d => d.id.startsWith('r')))
  assert.equal(largo.length, 16)
  // quattro fili al massimo: il quinto risultato non si porta dietro nessuno
  const fili = new Set(largo.slice(10).map(d => d.filo))
  assert.ok(fili.size <= 4, `si sono allargati ${fili.size} fili`)
  // i dieci risultati restano davanti, nell'ordine in cui erano
  assert.deepEqual(largo.slice(0, 10).map(d => d.id), docs.filter(d => d.id.startsWith('r')).map(d => d.id))
})

test('solo le email hanno un filo da allargare: un file col campo pieno si lascia stare', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    { id: 'desktop:/a.pdf', fonte: 'desktop', tipo: 'pdf', titolo: 'A', corpo: 'x', filo: 'f1', gruppo: 'documenti', quando: '2026-01-01T00:00:00.000Z' },
    mail('1', 'f1', '2026-01-02T00:00:00.000Z')
  ])
  const largo = claude.conIlFilo([store.documento('desktop:/a.pdf')!])
  assert.deepEqual(largo.map(d => d.id), ['desktop:/a.pdf'])
})

test('un fratello già fra i risultati non si ripete', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    mail('1', 'f1', '2026-01-01T00:00:00.000Z'),
    mail('2', 'f1', '2026-01-02T00:00:00.000Z')
  ])
  const largo = claude.conIlFilo([store.documento('posta:INBOX:1')!, store.documento('posta:INBOX:2')!])
  assert.deepEqual(largo.map(d => d.id), ['posta:INBOX:1', 'posta:INBOX:2'])
})
