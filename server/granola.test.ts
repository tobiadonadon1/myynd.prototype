// Granola com'è davvero, non come l'avevamo immaginato.
//
// Il 23 settembre 2026 la prima tester esterna ha premuto «Collega Granola» e
// si è sentita dire «apri Granola una volta e riprova» — lei che Granola lo
// usa tutti i giorni. Il connettore cercava `cache-v3.json`, e quel file non
// c'è più da febbraio. Queste prove mettono sul disco le forme che Granola ha
// scritto davvero, una per epoca, come le documentano quelli che la leggono
// da fuori:
//
//   · `cache-v3.json`, fino al 2025: `cache` è una stringa JSON da aprire due
//     volte (github.com/pedramamini/GranolaMCP, granola_mcp/core/parser.py;
//     github.com/mikedemarais/granola-to-markdown, index.ts);
//   · `cache-v4.json` e `cache-v6.json`, da febbraio 2026: `cache` è un
//     oggetto `{ state, version }`, e la versione dentro non è quella del
//     nome (github.com/proofsh/granola-mcp-server/issues/14,
//     github.com/theantichris/granola/issues/22, graincrawl commit 9b4b6da);
//     i pannelli non ci sono più (github.com/sonomirco, main.ts: «v3 only —
//     absent in v4+»);
//   · da maggio 2026: il `cache-v6.json` in chiaro è un moncherino senza
//     `documents`, accanto a `cache-v6.json.enc` e `granola.db`
//     (github.com/RhysEJF/flow-sales, docs/research/granola-access.md §3.6).
//
// Nessuna di queste forme l'abbiamo vista su un Mac con Granola: su questa
// macchina Granola non c'è. Sono ricostruite dalle fonti qui sopra, campo per
// campo. Il giorno che qualcuno la collega su un Mac vero, questo è il file
// da confrontare.
//
//   node --test --disable-warning=ExperimentalWarning server/granola.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-granola-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
mkdirSync(process.env.MYYND_DATI, { recursive: true })

const granola = await import('./connettori/granola.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const CARTELLA = join(CASA, 'Library', 'Application Support', 'Granola')

beforeEach(() => {
  rmSync(CARTELLA, { recursive: true, force: true })
})

function scrivi(nome: string, contenuto: string | object) {
  mkdirSync(CARTELLA, { recursive: true })
  writeFileSync(join(CARTELLA, nome), typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto))
}

const ID = '0066c654-8fc6-4244-abd0-f53aa895dff3'

/** Una riunione del 2025, con i campi che la cache v3 aveva davvero. */
const RIUNIONE = {
  id: ID,
  title: 'Weekly sync',
  created_at: '2025-06-17T19:00:02.205Z',
  updated_at: '2025-06-17T19:48:32.119Z',
  deleted_at: null,
  type: 'meeting',
  valid_meeting: true,
  notes: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'follow-up next week' }] }] },
  notes_plain: 'follow-up next week\n',
  notes_markdown: 'follow-up next week\n',
  people: { creator: { name: 'Ada', email: 'ada@x.com' }, attendees: [{ email: 'bob@y.com' }] },
  google_calendar_event: { id: 'abc', summary: 'Weekly sync', start: { dateTime: '2025-06-17T21:00:00+02:00' } }
}

/** La cache v3: un JSON che dentro ne contiene un altro, come stringa. */
function cacheV3(stato: object) {
  return { cache: JSON.stringify({ state: stato, version: 3 }) }
}

// — le tre epoche —

test('v3 (2025): la stringa dentro la stringa si apre, e il riassunto HTML diventa testo', async () => {
  scrivi('cache-v3.json', cacheV3({
    documents: { [ID]: RIUNIONE },
    meetingsMetadata: { [ID]: { creator: { name: 'Ada', email: 'ada@x.com' }, attendees: [{ name: 'Bob', email: 'bob@y.com' }] } },
    documentPanels: {
      [ID]: {
        '3b1896d9': {
          id: '3b1896d9', document_id: ID, title: 'Summary', template_slug: 'default-summary',
          // `content` vuoto, `original_content` in HTML: è il caso che prima
          // finiva nell'indice con i tag dentro
          content: null,
          original_content: '<h3>Decisions</h3><ul><li>Ship Friday</li><li>Q&amp;A on Monday</li></ul>'
        }
      }
    }
  }))
  const e = await granola.leggi()
  assert.equal(e.docs.length, 1)
  const d = e.docs[0]!
  assert.equal(d.id, `granola:${ID}`)
  assert.equal(d.titolo, 'Weekly sync')
  assert.ok(!/<\/?(h3|ul|li)\b/i.test(d.corpo), `i tag HTML sono finiti nell'indice: ${d.corpo}`)
  assert.match(d.corpo, /Decisions/)
  assert.match(d.corpo, /· Ship Friday/)
  assert.match(d.corpo, /Q&A on Monday/)
  assert.match(d.corpo, /follow-up next week/)
  // chi c'era, dai tre posti dove Granola lo scrive, una volta sola
  assert.match(d.corpo, /Bob <bob@y\.com>/)
  assert.equal(d.corpo.match(/bob@y\.com/g)?.length, 1)
})

test('v6 (inizio 2026): `cache` è un oggetto, il nome ha un numero e la versione un altro', async () => {
  // graincrawl, commit 9b4b6da: `cache-v6.json` con `cache.version` 8
  scrivi('cache-v6.json', {
    cache: {
      version: 8,
      state: {
        documents: { [ID]: { ...RIUNIONE, notes_markdown: '', notes_plain: '', notes: { type: 'doc', content: [] } } },
        // i pannelli non ci sono più; la trascrizione sì
        transcripts: {
          [ID]: [
            { id: 'e7d1', document_id: ID, text: 'Hi all', source: 'microphone', start_timestamp: '2026-02-17T19:02:29.419Z', end_timestamp: '2026-02-17T19:02:31.119Z', is_final: true },
            { id: 'e7d2', document_id: ID, text: 'we ship on Friday', source: 'system', start_timestamp: '2026-02-17T19:02:32.000Z', end_timestamp: '2026-02-17T19:02:34.000Z', is_final: true }
          ]
        },
        meetingsMetadata: {},
        documentLists: {},
        documentListsMetadata: {}
      }
    }
  })
  const e = await granola.leggi()
  assert.equal(e.docs.length, 1)
  /*
   * Senza appunti e senza pannelli resta la trascrizione: da `cache-v4.json`
   * è spesso l'unico testo che la cache tiene, e una riunione senza testo è
   * una riunione che nessuna ricerca trova.
   */
  assert.match(e.docs[0]!.corpo, /Hi all we ship on Friday/)
})

test('con più cache sulla cartella si legge la più nuova', async () => {
  scrivi('cache-v3.json', cacheV3({ documents: { vecchia: { id: 'vecchia', title: 'Vecchia', notes_plain: 'di un anno fa' } } }))
  scrivi('cache-v4.json', { cache: { version: 5, state: { documents: { media: { id: 'media', title: 'Media', notes_plain: 'di febbraio' } } } } })
  scrivi('cache-v6.json', { cache: { version: 6, state: { documents: { nuova: { id: 'nuova', title: 'Nuova', notes_plain: 'di adesso' } } } } })
  const e = await granola.leggi()
  assert.deepEqual(e.docs.map(d => d.id), ['granola:nuova'])
})

test('oggi (da maggio 2026): il moncherino cifrato dice la ragione vera, non «apri Granola»', async () => {
  /*
   * È il caso della tester. Il `cache-v6.json` in chiaro c'è, è piccolo, e
   * non ha `documents`; accanto ci sono i file cifrati e il database. La
   * frase di prima — «apri Granola una volta e riprova» — era falsa per lei.
   */
  scrivi('cache-v6.json', { cache: { version: 8, state: { transcripts: {}, documentLists: {}, documentListsMetadata: {}, entities: {}, generatingPanels: {}, sync_operations_log: [] } } })
  scrivi('cache-v6.json.enc', 'binario cifrato')
  scrivi('supabase.json.enc', 'binario cifrato')
  scrivi('granola.db', 'SQLite cifrato')
  await assert.rejects(() => granola.leggi(), (e: Error) => e.message === granola.CIFRATO)
  const p = await granola.prova()
  assert.deepEqual(p, { ok: false, errore: granola.CIFRATO })
})

test('i soli file cifrati, senza nessuna cache in chiaro: la stessa ragione', async () => {
  scrivi('cache-v6.json.enc', 'binario cifrato')
  scrivi('granola.db', 'SQLite cifrato')
  await assert.rejects(() => granola.leggi(), (e: Error) => e.message === granola.CIFRATO)
})

test('le riunioni ci sono ma senza una parola dentro: lo si dice, e non si svuota l’indice', async () => {
  /*
   * Lanciare qui non è pignoleria. Zero documenti con `troncato` spento vuol
   * dire «Granola è vuoto», e `riconcilia` butterebbe via tutte le riunioni
   * lette quando la cache le conteneva ancora.
   */
  scrivi('cache-v6.json', { cache: { version: 6, state: { documents: {
    a: { id: 'a', title: 'Riunione A', notes_markdown: '' },
    b: { id: 'b', title: 'Riunione B' }
  } } } })
  await assert.rejects(() => granola.leggi(), (e: Error) => e.message === granola.SENZA_TESTO)
})

test('Granola che non c’è, e Granola che non ha ancora scritto niente, sono due frasi', async () => {
  await assert.rejects(() => granola.leggi(), (e: Error) => e.message === granola.NON_INSTALLATO)
  mkdirSync(CARTELLA, { recursive: true })
  await assert.rejects(() => granola.leggi(), (e: Error) => e.message === granola.NIENTE_ANCORA)
})

test('un file che non si capisce, senza cifrati accanto, resta «ha cambiato il modo»', async () => {
  scrivi('cache-v9.json', '{"qualcosa":"d’altro"}')
  await assert.rejects(() => granola.leggi(), (e: Error) => e.message === granola.CAMBIATO)
})

test('un pannello il cui `content` è testo nudo si prende così com’è', async () => {
  // moona3k/granola-export, references/data-shapes.md: circa un pannello su
  // cinque arriva con `content` stringa invece che albero
  scrivi('cache-v3.json', cacheV3({
    documents: { d: { id: 'd', title: 'Budget' } },
    documentPanels: { d: { p: { id: 'p', content: 'Budget approvato per il Q4' } } }
  }))
  const e = await granola.leggi()
  assert.match(e.docs[0]!.corpo, /Budget approvato per il Q4/)
})

test('una nota senza titolo prende quello dell’evento del calendario', async () => {
  scrivi('cache-v6.json', { cache: { state: { documents: { d: {
    id: 'd', title: '', notes_plain: 'qualcosa',
    google_calendar_event: { summary: 'Call con Riccardo', attendees: [{ displayName: 'Riccardo', email: 'r@esempio.it' }] }
  } } } } })
  const e = await granola.leggi()
  assert.equal(e.docs[0]!.titolo, 'Call con Riccardo')
  assert.match(e.docs[0]!.corpo, /Riccardo <r@esempio\.it>/)
})
