// Le ottocento pagine rilette ogni sei ore, per niente.
//
// Notion dice per ogni pagina quando è stata toccata l'ultima volta, e noi non
// lo guardavamo: ogni giro si riaprivano tutti i blocchi di tutte le pagine,
// una chiamata ogni cento blocchi, con un freno di trecentocinquanta
// millisecondi in mezzo perché altrimenti Notion risponde 429. Uno spazio da
// ottocento pagine sono decine di minuti così, quattro volte al giorno — e per
// tutto quel tempo chi preme «leggi adesso» si prende un 409, perché una
// lettura sta già girando.
//
// La cura è una riga di confronto, e la trappola è accanto: una pagina saltata
// deve restare **viva**. Saltarla e basta la teneva fuori dall'elenco che
// `riconcilia` usa per decidere chi esiste ancora, e la pagina non veniva
// risparmiata: veniva cancellata.
//
//   node --test server/notionSalta.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from '@notionhq/client'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-notion-'))
process.env.MYYND_DATI = CASA

const notion = await import('./connettori/notion.ts')
const ripresa = await import('./connettori/ripresa.ts')
const store = await import('./store.ts')

beforeEach(() => {
  store.svuotaFonte('notion')
  ripresa.scorda('notion')
})

after(() => {
  notion.usaCliente(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

type Pagina = { id: string; toccata: string }

/** Uno spazio Notion finto, che conta quante volte gli si aprono i blocchi. */
function finto(pagine: Pagina[], opzioni: { rompiSubito?: boolean } = {}) {
  const conto = { blocchi: 0, cursori: [] as (string | undefined)[] }
  const cl = {
    search: async (a: { start_cursor?: string }) => {
      conto.cursori.push(a.start_cursor)
      if (opzioni.rompiSubito && a.start_cursor) throw new Error('start_cursor non valido')
      return {
        results: pagine.map(p => ({
          object: 'page',
          id: p.id,
          url: `https://notion.so/${p.id}`,
          last_edited_time: p.toccata,
          properties: { Nome: { type: 'title', title: [{ plain_text: `Pagina ${p.id}` }] } }
        })),
        has_more: false,
        next_cursor: null
      }
    },
    blocks: {
      children: {
        list: async (a: { block_id: string }) => {
          conto.blocchi++
          return {
            results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: `il testo di ${a.block_id}` }] } }],
            has_more: false,
            next_cursor: null
          }
        }
      }
    }
  }
  notion.usaCliente(() => cl as unknown as Client)
  return conto
}

const CONTO = { token: 'ntn_finto' }

test('il primo giro legge tutto: non c’è ancora niente da confrontare', async () => {
  const conto = finto([{ id: 'a', toccata: '2026-09-01T10:00:00.000Z' }, { id: 'b', toccata: '2026-09-01T11:00:00.000Z' }])
  const e = await notion.sincronizza(CONTO)
  assert.equal(conto.blocchi, 2)
  assert.equal(e.docs.length, 2)
  assert.equal(e.invariate, 0)
})

test('il secondo non riapre niente, e le pagine restano vive lo stesso', async () => {
  const pagine = [{ id: 'a', toccata: '2026-09-01T10:00:00.000Z' }, { id: 'b', toccata: '2026-09-01T11:00:00.000Z' }]
  finto(pagine)
  store.salvaDocumenti((await notion.sincronizza(CONTO)).docs)

  const conto = finto(pagine)
  const e = await notion.sincronizza(CONTO)
  assert.equal(conto.blocchi, 0, 'ha riletto pagine che non si erano mosse')
  assert.equal(e.invariate, 2)
  assert.equal(e.docs.length, 0)
  /*
   * La riga che conta più di tutto il risparmio: `visti` è l'elenco che dice
   * chi esiste ancora. Senza, il giro dopo `riconcilia` cancellerebbe
   * dall'indice esattamente le pagine che avevamo deciso di risparmiare —
   * in silenzio, perché una pagina che sparisce dall'indice non lascia traccia.
   */
  assert.deepEqual(e.visti, ['notion:a', 'notion:b'])
  assert.equal(e.interrotto, false, 'un giro intero deve poter riconciliare')
})

test('una pagina toccata si rilegge, le altre no', async () => {
  const prima = [{ id: 'a', toccata: '2026-09-01T10:00:00.000Z' }, { id: 'b', toccata: '2026-09-01T11:00:00.000Z' }]
  finto(prima)
  store.salvaDocumenti((await notion.sincronizza(CONTO)).docs)

  const conto = finto([{ id: 'a', toccata: '2026-09-04T09:00:00.000Z' }, prima[1]!])
  const e = await notion.sincronizza(CONTO)
  assert.equal(conto.blocchi, 1)
  assert.deepEqual(e.docs.map(d => d.id), ['notion:a'])
  assert.equal(e.invariate, 1)
})

test('una pagina che non abbiamo si legge, anche se è vecchissima', async () => {
  // l'indice è vuoto per lei: «non si è mossa» non vuol dire niente se non
  // c'era niente da muovere
  const conto = finto([{ id: 'nuova', toccata: '2019-01-01T00:00:00.000Z' }])
  const e = await notion.sincronizza(CONTO)
  assert.equal(conto.blocchi, 1)
  assert.equal(e.docs.length, 1)
})

test('una pagina senza data di modifica si rilegge: nel dubbio, si guarda', async () => {
  const pagine = [{ id: 'a', toccata: '2026-09-01T10:00:00.000Z' }]
  finto(pagine)
  store.salvaDocumenti((await notion.sincronizza(CONTO)).docs)

  const conto = finto([{ id: 'a', toccata: '' }])
  await notion.sincronizza(CONTO)
  assert.equal(conto.blocchi, 1)
})

// — riprendere —

test('un giro ripreso a metà non si dichiara mai completo', async () => {
  /*
   * `visti` copre solo le pagine viste da lì in poi: `interrotto` è quello che
   * impedisce a `index.ts` di riconciliare e cancellare tutto l'inizio dello
   * spazio.
   */
  const conto = finto([{ id: 'a', toccata: '2026-09-01T10:00:00.000Z' }])
  ripresa.segna('notion', 'da-qui')
  const e = await notion.sincronizza(CONTO)
  assert.deepEqual(conto.cursori, ['da-qui'], 'non è ripartito da dove si era fermato')
  assert.equal(e.interrotto, true)
  assert.equal(ripresa.daDove('notion'), null, 'arrivato in fondo, toglie il segno')
})

test('un segno che Notion non riconosce più si butta, invece di bloccare tutto', async () => {
  finto([{ id: 'a', toccata: '2026-09-01T10:00:00.000Z' }], { rompiSubito: true })
  ripresa.segna('notion', 'un cursore di ieri')
  const e = await notion.sincronizza(CONTO)
  assert.equal(e.interrotto, true)
  assert.equal(ripresa.daDove('notion'), null, 'il giro dopo deve poter ripartire da capo')
})
