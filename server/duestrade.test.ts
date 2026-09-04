// Con quale dei due si paga Claude, e cosa succede cambiando idea.
//
// Sono due strade per lo stesso modello, non due modelli: l'abbonamento che uno
// paga già, attraverso Claude Code, e una chiave a consumo. Prima era un
// interruttore acceso/spento; adesso è una scelta, e la scelta va rispettata
// anche quando l'altra strada sarebbe più comoda.
//
// Qui si prova quello che le prove che leggono il sorgente non possono provare:
// che una configurazione vecchia continui a comportarsi come prima, e che una
// nuova comandi davvero.
//
//   node --test server/duestrade.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-duestrade-'))
process.env.MYYND_DATI = CASA

const cfg = await import('./config.ts')
const abbonamento = await import('./abbonamento.ts')

after(() => {
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

test('senza aver scelto niente, si paga con la chiave', () => {
  cfg.scrivi({} as never)
  assert.equal(abbonamento.scelto(), false,
    'l’abbonamento non si accende da sé: manda il lavoro sul conto di qualcuno, e si chiede')
})

/*
 * La configurazione di chi aggiorna.
 *
 * Prima della scelta c'era un interruttore, `abbonamento.attivo`. Chi lo aveva
 * acceso non deve ritrovarsi il lavoro sulla chiave il giorno dell'aggiornamento
 * — e chi lo aveva spento non deve ritrovarselo sull'abbonamento.
 */
test('una configurazione vecchia vale ancora, in tutte e due le direzioni', () => {
  cfg.scrivi({ abbonamento: { attivo: true } } as never)
  assert.equal(abbonamento.scelto(), true, 'l’interruttore acceso di ieri si è spento da solo')

  cfg.scrivi({ abbonamento: { attivo: false } } as never)
  assert.equal(abbonamento.scelto(), false, 'l’interruttore spento di ieri si è acceso da solo')
})

test('la scelta esplicita comanda, anche contro il vecchio interruttore', () => {
  // le due righe si scrivono insieme dalla rotta, ma un file scritto a mano —
  // o rimasto a metà — non deve poter voler dire due cose diverse
  cfg.scrivi({ claudeCon: 'abbonamento', abbonamento: { attivo: false } } as never)
  assert.equal(abbonamento.scelto(), true, 'ha vinto l’interruttore vecchio sulla scelta nuova')

  cfg.scrivi({ claudeCon: 'chiave', abbonamento: { attivo: true } } as never)
  assert.equal(abbonamento.scelto(), false, 'ha vinto l’interruttore vecchio sulla scelta nuova')
})

test('si cambia idea quante volte si vuole', () => {
  for (const con of ['abbonamento', 'chiave', 'abbonamento', 'chiave'] as const) {
    cfg.aggiorna({ claudeCon: con, abbonamento: { attivo: con === 'abbonamento' } })
    assert.equal(abbonamento.scelto(), con === 'abbonamento', `«${con}» non ha attecchito`)
  }
})

/*
 * `utilizzabile()` contro `pronto()`.
 *
 * La schermata deve mostrare tutte e due le strade con lo stato vero di
 * ciascuna, anche quella spenta: `pronto()` risponde no a una strada che
 * funziona benissimo, solo perché non è quella scelta adesso — giusto per il
 * motore, sbagliato per chi guarda un interruttore e vuole sapere cosa succede
 * a girarlo.
 */
test('la schermata vede l’abbonamento anche quando non è quello scelto', () => {
  cfg.aggiorna({ claudeCon: 'chiave', abbonamento: { attivo: false } })
  assert.equal(abbonamento.scelto(), false)
  // le due risposte devono poter divergere: se `utilizzabile()` seguisse la
  // scelta, la scheda direbbe «Claude Code non c'è» a chi ce l'ha installato
  assert.equal(abbonamento.pronto(), false, '`pronto()` non guarda la scelta')
  assert.equal(typeof abbonamento.utilizzabile(), 'boolean')
})
