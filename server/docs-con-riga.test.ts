// Quello che sta già in lista non torna sul feed.
//
//   node --test server/docs-con-riga.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-conriga-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({ lingua: 'it' }), { mode: 0o600 })

const store = await import('./store.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const ADESSO = new Date().toISOString()
store.salvaDocumenti([{
  id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'Preventivo di marzo',
  corpo: 'Buongiorno, mi confermate il preventivo di marzo? Grazie, Rossi',
  autore: 'Mario Rossi <rossi@example.com>', quando: ADESSO, filo: 'f1'
}])
store.scriviCompito({ id: 'riga-rossi', testo: 'Rispondere a Rossi', nota: null, quando: 'oggi', ordine: 'a', origine: 'mano', doc: 'posta:INBOX:1' })

test('quello che sta già in lista si riconosce, così il feed non lo ripropone', () => {
  const s = store.docsConRiga(['posta:INBOX:1', 'posta:INBOX:99', 'niente'])
  assert.ok(s.has('posta:INBOX:1'))
  assert.ok(!s.has('posta:INBOX:99'))
  assert.equal(s.size, 1)
  // e un elenco vuoto non fa nemmeno la query
  assert.equal(store.docsConRiga([]).size, 0)
})

test('per il feed una riga chiusa da mesi non tiene fuori il documento per sempre', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const ADESSO = new Date().toISOString()
  store.salvaDocumenti([{
    id: 'desktop:/vivo/contratto.md', fonte: 'desktop', tipo: 'md', titolo: 'Contratto',
    corpo: 'Il contratto, che intanto è cambiato.', autore: null, quando: ADESSO, gruppo: 'documenti'
  }])
  store.scriviCompito({ id: 'riga-vecchia', testo: 'Rileggere il contratto', nota: null, quando: 'oggi', ordine: 'a', origine: 'mano', doc: 'desktop:/vivo/contratto.md' })
  // viva: conta, con o senza finestra
  assert.ok(store.docsConRiga(['desktop:/vivo/contratto.md'], 30).has('desktop:/vivo/contratto.md'))
  store.cambiaStatoCompito('riga-vecchia', 'fatto', 'Letto.')
  // chiusa adesso: conta ancora nella finestra
  assert.ok(store.docsConRiga(['desktop:/vivo/contratto.md'], 30).has('desktop:/vivo/contratto.md'))
  // chiusa quattro mesi fa: per il feed non conta più, senza finestra sì
  const db = new DatabaseSync(join(CASA, '.myynd', 'mente.db'))
  db.prepare('UPDATE compiti SET chiuso = ?, aggiornato = ? WHERE id = ?')
    .run('2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', 'riga-vecchia')
  db.close()
  assert.ok(!store.docsConRiga(['desktop:/vivo/contratto.md'], 30).has('desktop:/vivo/contratto.md'))
  assert.ok(store.docsConRiga(['desktop:/vivo/contratto.md']).has('desktop:/vivo/contratto.md'))
})
