// L'archivio della prova: il lucchetto, i file scritti interi, i tetti dello
// storico e dei rapporti, la riga delle preferenze in ogni stato.
//
//   node --test server/risposte-archivio.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-archivio-'))
process.env.MYYND_DATI = CASA
const a = await import('./risposte-archivio.ts')
after(() => rmSync(CASA, { recursive: true, force: true }))

const DOVE = join(CASA, 'valutazioni', 'risposte')
const modo = (p: string) => statSync(p).mode & 0o777

const riassunto = (quando: string, extra: Partial<import('./risposte-archivio.ts').Riassunto> = {}): import('./risposte-archivio.ts').Riassunto =>
  ({ quando, origine: 'comando', via: 'claude', fatte: 50, quante: 50, giuste: 46, senzaFonte: 1, sbagliate: 2, inventate: 0, rifiutateMale: 1, daRivedere: 0, passa: true, gettoni: 900_000, file: 'x.json', ...extra })

test('il lucchetto è uno solo, e si lascia', () => {
  const primo = a.prendi()
  assert.ok(primo)
  assert.equal(a.inCorso(), true)
  assert.equal(a.prendi(), null, 'il secondo non lo prende')
  primo!.lascia()
  assert.equal(a.inCorso(), false)
  const terzo = a.prendi()
  assert.ok(terzo, 'dopo averlo lasciato si riprende')
  terzo!.lascia()
})

test('un lucchetto stantio per età o per pid morto non ferma nessuno', () => {
  mkdirSync(DOVE, { recursive: true })
  writeFileSync(join(DOVE, '.in-corso'), JSON.stringify({ pid: process.pid, dal: new Date(Date.now() - 3 * 3_600_000).toISOString() }))
  assert.equal(a.inCorso(), false, 'tre ore fa: stantio')
  const l = a.prendi()
  assert.ok(l); l!.lascia()
  // un pid che non esiste: si cerca uno libero in alto
  let morto = 2_000_000_000
  writeFileSync(join(DOVE, '.in-corso'), JSON.stringify({ pid: morto, dal: new Date().toISOString() }))
  assert.equal(a.inCorso(), false, 'pid morto: stantio')
  const l2 = a.prendi()
  assert.ok(l2); l2!.lascia()
})

test('i file si scrivono interi, con i modi giusti', () => {
  a.scriviStato({ ultimaCompleta: '2026-09-22T10:00:00.000Z' })
  assert.deepEqual(a.leggiStato(), { ultimaCompleta: '2026-09-22T10:00:00.000Z' })
  assert.equal(modo(DOVE), 0o700)
  assert.equal(modo(join(DOVE, 'stato.json')), 0o600)
  assert.ok(!readdirSync(DOVE).some(n => n.includes('.tmp-')), 'nessun temporaneo lasciato')
  a.scriviInsieme({ versione: 1, domande: [] })
  assert.deepEqual(a.leggiInsieme(), { versione: 1, domande: [] })
  assert.deepEqual(a.leggiStato(join(CASA, 'altra')), {}, 'una cartella senza niente è uno stato vuoto')
})

test('lo storico tiene gli ultimi 52, i rapporti gli ultimi 12', () => {
  for (let i = 0; i < 60; i++) a.aggiungiAlloStorico(riassunto(`2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:${String(i).padStart(2, '0')}.000Z`))
  assert.equal(a.leggiStorico().length, 52)
  for (let i = 0; i < 15; i++) a.salvaRapporto({ n: i }, `2026-02-01T00:00:${String(i).padStart(2, '0')}.000Z`)
  const rapporti = readdirSync(DOVE).filter(n => /^2026-02/.test(n))
  assert.equal(rapporti.length, 12)
  assert.ok(rapporti.every(n => modo(join(DOVE, n)) === 0o600))
  assert.deepEqual(a.ultimoRapporto(), { n: 14 })
  const f = a.perIlFascicolo()
  assert.ok(f && Array.isArray(f.storico) && f.domande)
})

test('la riga delle preferenze, in ogni stato e nelle due lingue, senza lineette', () => {
  const ultima = riassunto('2026-09-22T10:00:00.000Z')
  const r = (s: Parameters<typeof a.rigaDiStato>[0], attiva = true, lucchetto = false) => [a.rigaDiStato(s, attiva, false, lucchetto), a.rigaDiStato(s, attiva, true, lucchetto)]
  assert.deepEqual(r({}), [null, null])
  assert.deepEqual(r({ ultima }), ['Ultima prova il 22 set: 46 su 50 giuste, nessuna inventata.', 'Last check on Sep 22: 46 of 50 right, none invented.'])
  assert.deepEqual(r({ ultima: { ...ultima, inventate: 1 } }), ['Ultima prova il 22 set: 46 su 50 giuste, 1 inventata.', 'Last check on Sep 22: 46 of 50 right, 1 invented.'])
  assert.deepEqual(r({ ultima: { ...ultima, inventate: 2 } }), ['Ultima prova il 22 set: 46 su 50 giuste, 2 inventate.', 'Last check on Sep 22: 46 of 50 right, 2 invented.'])
  assert.deepEqual(r({ ultima: { ...ultima, interrotta: 'budget', fatte: 30 } }), ['Prova del 22 set fermata a 30 su 50.', 'Check on Sep 22 stopped at 30 of 50.'])
  const dopo = '2026-09-29T10:00:00.000Z'
  assert.deepEqual(r({ ultima, saltata: { quando: dopo, motivo: 'tetto' } }), ['Saltata il 29 set: tetto di token di oggi raggiunto.', 'Skipped on Sep 29: today’s token limit reached.'])
  assert.deepEqual(r({ ultima, saltata: { quando: dopo, motivo: 'motore' } }), ['Saltata il 29 set: nessun motore collegato.', 'Skipped on Sep 29: no engine connected.'])
  assert.deepEqual(r({ ultima, saltata: { quando: dopo, motivo: 'locale' } }), ['Saltata il 29 set: su un modello locale non la faccio.', 'Skipped on Sep 29: not run on a local model.'])
  // un salto più vecchio dell'ultima prova, o con l'interruttore spento, non si dice; «insieme» mai
  assert.deepEqual(r({ ultima, saltata: { quando: '2026-09-20T10:00:00.000Z', motivo: 'tetto' } }), ['Ultima prova il 22 set: 46 su 50 giuste, nessuna inventata.', 'Last check on Sep 22: 46 of 50 right, none invented.'])
  assert.deepEqual(r({ ultima, saltata: { quando: dopo, motivo: 'tetto' } }, false)[1], 'Last check on Sep 22: 46 of 50 right, none invented.')
  assert.deepEqual(r({ ultima, saltata: { quando: dopo, motivo: 'insieme' } })[1], 'Last check on Sep 22: 46 of 50 right, none invented.')
  assert.deepEqual(r({ ultima, inCorso: { dal: dopo, fatte: 12, quante: 50 } }, true, true), ['Prova in corso: 12 su 50.', 'Checking now: 12 of 50.'])
  assert.deepEqual(r({ ultima, inCorso: { dal: dopo, fatte: 12, quante: 50 } }, true, false)[1], 'Last check on Sep 22: 46 of 50 right, none invented.', 'senza il lucchetto vivo, «in corso» è vecchio')
  for (const s of [{ ultima }, { ultima, saltata: { quando: dopo, motivo: 'tetto' as const } }]) {
    for (const en of [false, true]) {
      const riga = a.rigaDiStato(s, true, en, false)!
      assert.ok(!/[—–()]/.test(riga), riga)
    }
  }
})

test('togli porta via solo valutazioni/risposte', () => {
  mkdirSync(join(CASA, 'valutazioni'), { recursive: true })
  writeFileSync(join(CASA, 'valutazioni', 'feed-vecchio.json'), '{}')
  a.togli()
  assert.ok(!existsSync(DOVE))
  assert.ok(existsSync(join(CASA, 'valutazioni', 'feed-vecchio.json')))
  assert.equal(a.perIlFascicolo(), null)
})
