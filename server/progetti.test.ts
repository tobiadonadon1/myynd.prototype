// I progetti: la tabella, l'importazione dal foglio vecchio, e la promessa
// che un progetto chiuso non torna.
//
// Quello che si prova qui non è la qualità di niente: è che «chiudi» non
// cancella, che lo stesso nome è lo stesso progetto, che i progetti che il
// punto aveva già capito entrano una volta sola, e che la riga per il modello
// sia corta e senza i chiusi. Il pezzo che tocca un documento — `tocca` — è
// un conteggio di parole, e si prova come tale.
//
//   node --test server/progetti.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-progetti-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const punto = await import('./punto.ts')

before(() => store.azzeraTutto())
after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

function pulisci() {
  store.azzeraTutto()
  rmSync(punto.perProva.file(), { force: true })
}

// — la tabella —

test('scrivere, cambiare, chiudere: e chiudere non cancella', () => {
  pulisci()
  const p = progetti.scrivi({ nome: 'Nextas', obiettivo: 'Chiudere il round seed entro ottobre' })
  assert.ok(p.id.startsWith('p'))
  assert.equal(p.stato, 'attivo')
  assert.equal(p.origine, 'mano')
  assert.equal(progetti.elenco().length, 1)

  const cambiato = progetti.cambia(p.id, { obiettivo: 'Chiudere il round seed entro novembre', stato: 'fermo', note: 'aspetta Bianchi' })
  assert.equal(cambiato?.obiettivo, 'Chiudere il round seed entro novembre')
  assert.equal(cambiato?.stato, 'fermo')
  assert.equal(cambiato?.note, 'aspetta Bianchi')
  assert.ok(cambiato!.aggiornato >= p.aggiornato)

  assert.ok(progetti.chiudi(p.id))
  assert.equal(progetti.trova(p.id)?.stato, 'chiuso', 'chiudere ha cancellato la riga')
  assert.equal(progetti.elenco().length, 1, 'un progetto chiuso è sparito dalla storia')
  assert.deepEqual(progetti.vivi(), [], 'un progetto chiuso conta ancora come vivo')
  assert.deepEqual(progetti.chiusi(), ['Nextas'])

  assert.equal(progetti.cambia('inesistente', { nome: 'x' }), null)
  assert.throws(() => progetti.scrivi({ nome: '   ' }), /bisogno di un nome/)
  assert.throws(() => progetti.cambia(p.id, { stato: 'finito' }), /attivo, fermo o chiuso/)
})

test('lo stesso nome è lo stesso progetto, anche scritto diverso; riaprirlo a mano si può, dal punto no', () => {
  pulisci()
  const a = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Un gemello che sceglie per me' })
  const b = progetti.scrivi({ nome: '  myynd ' })
  assert.equal(b.id, a.id)
  assert.equal(b.obiettivo, 'Un gemello che sceglie per me', 'un obiettivo già scritto è stato sovrascritto dal vuoto')
  assert.equal(progetti.trovaPerNome('MYYND')?.id, a.id)

  progetti.chiudi(a.id)
  // il punto lo rivede nel materiale: resta chiuso
  assert.equal(progetti.scrivi({ nome: 'Myynd', origine: 'punto' }).stato, 'chiuso')
  // lui lo riscrive nella Memoria: si riapre, è una scelta sua
  assert.equal(progetti.scrivi({ nome: 'Myynd' }).stato, 'attivo')
})

// — dal foglio vecchio —

test('i progetti che il punto teneva in punto.json entrano una volta sola, con la loro data', () => {
  pulisci()
  writeFileSync(punto.perProva.file(), JSON.stringify({
    ultimo: null, scartati: [], chiamate: [],
    progetti: [
      { nome: 'Myynd', dal: '2026-08-01T08:00:00.000Z', doveSei: 'x', angolo: '', angoliTenuti: ['Un angolo'] },
      { nome: 'myynd', dal: '2026-08-02T08:00:00.000Z', doveSei: 'x', angolo: '', angoliTenuti: [] },
      { nome: 'Nextas', dal: '2026-08-10T08:00:00.000Z', doveSei: 'y', angolo: '', angoliTenuti: [] }
    ]
  }))
  const tutti = progetti.elenco()
  assert.deepEqual(tutti.map(p => p.nome).sort(), ['Myynd', 'Nextas'], 'lo stesso nome due volte è entrato due volte')
  const myynd = progetti.trovaPerNome('Myynd')!
  assert.equal(myynd.dal, '2026-08-01T08:00:00.000Z')
  assert.equal(myynd.origine, 'punto')
  assert.equal(myynd.obiettivo, '', 'l’obiettivo lo scrive lui: dal foglio non c’è')

  // chiuso, e il foglio riscritto: non rientra — l'importazione è una volta sola
  progetti.chiudi(myynd.id)
  writeFileSync(punto.perProva.file(), JSON.stringify({
    ultimo: null, scartati: [], chiamate: [], progetti: [{ nome: 'Myynd', dal: '2026-08-01T08:00:00.000Z' }]
  }))
  assert.equal(progetti.trovaPerNome('Myynd')?.stato, 'chiuso', 'un progetto chiuso è tornato dal foglio')
  assert.equal(progetti.elenco().length, 2)
})

// — per il modello —

test('la riga per il modello: nome, obiettivo, stato; senza i chiusi, e al massimo otto', () => {
  pulisci()
  for (let i = 0; i < 10; i++) progetti.scrivi({ nome: `Progetto ${i}`, obiettivo: i % 2 ? `Arrivare a ${i}` : '' })
  const fermo = progetti.trovaPerNome('Progetto 9')!
  progetti.cambia(fermo.id, { stato: 'fermo' })
  const chiuso = progetti.trovaPerNome('Progetto 0')!
  progetti.chiudi(chiuso.id)

  const righe = progetti.perIlModello().split('\n')
  assert.equal(righe.length, 8, `${righe.length} righe: il tetto è otto`)
  assert.ok(righe.every(r => r.startsWith('— ')))
  assert.ok(righe.some(r => r === '— Progetto 1: Arrivare a 1 (attivo)'), righe.join('\n'))
  assert.ok(righe.some(r => r === '— Progetto 2 (attivo)'), 'senza obiettivo la riga ha solo il nome')
  assert.ok(!righe.some(r => r.includes('Progetto 0')), 'un chiuso è arrivato al modello')
  // gli attivi prima dei fermi: con nove vivi e otto posti, resta fuori il fermo
  assert.ok(!righe.some(r => r.includes('(fermo)')), 'un fermo è passato davanti a un attivo')
})

// — cosa tocca un progetto —

test('«tocca»: il nome intero, o due parole distintive dell’obiettivo; una sola no', () => {
  const p = { nome: 'Nextas', obiettivo: 'Chiudere il round seed con Bianchi entro ottobre' }
  assert.deepEqual(progetti.paroleDi(p), ['chiudere', 'round', 'seed', 'bianchi', 'ottobre'])
  assert.ok(progetti.tocca(p, 'Re: NEXTAS — aggiornamento'), 'il nome, maiuscolo, non è stato riconosciuto')
  assert.ok(progetti.tocca(p, 'Bianchi conferma per il round'), 'due parole dell’obiettivo non bastano')
  assert.ok(!progetti.tocca(p, 'Il round di golf di domenica'), 'una parola sola ha fatto passare un documento')
  assert.ok(!progetti.tocca(p, 'Fattura della luce di settembre'))
  // un obiettivo di una parola non ha «due parole distintive»: solo il nome conta
  assert.ok(!progetti.tocca({ nome: 'Casa', obiettivo: 'Traslocare' }, 'traslocare traslocare'))
  assert.ok(progetti.toccaUnProgetto('nextas', [{ ...p, id: 'x', stato: 'attivo', dal: '', aggiornato: '', note: '', origine: 'mano' }]))
})
