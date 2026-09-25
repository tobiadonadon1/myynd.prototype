// Quello che le sue ragioni insegnano, letto dallo stato di adesso.
//
//   node --test server/feed-impara.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-impara-'))
process.env.MYYND_DATI = CASA
const store = await import('./store.ts')
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const giudizi = await import('./giudizi.ts')
const impara = await import('./feed-impara.ts')
before(() => store.azzeraTutto())
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

const ADESSO = Date.now()
const GIORNO = 86_400_000
const giorniFa = (n: number) => new Date(ADESSO - n * GIORNO).toISOString()
let n = 0

/** Una carta chiusa, con il mittente nell'istantanea e la fonte a quella data. */
function carta(o: { stato: 'fatto' | 'scartato'; ragione: string | null; autore: string; fonte?: string; fonteGiorniFa?: number; nataGiorniFa?: number; chiusaGiorniFa?: number; titolo?: string; perche?: string }) {
  const id = `f${++n}`
  const contesto = JSON.stringify({ id: `posta:${id}`, fonte: o.fonte ?? 'posta', titolo: 'x', corpo: 'x', autore: o.autore, quando: giorniFa(o.fonteGiorniFa ?? 1), filo: null, messageId: null })
  store.default.prepare('INSERT INTO feed (id, tipo, titolo, testo, fonte, stato, ragione, quando, risposto, contesto, perche) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, 'Da decidere', o.titolo ?? `Carta ${id}`, 'testo', o.fonte ?? 'posta', o.stato, o.ragione, giorniFa(o.nataGiorniFa ?? 1), giorniFa(o.chiusaGiorniFa ?? 0), contesto, o.perche ?? `Perché ${id}`)
  return id
}
function mancata(mittente: string, agitoGiorniFa: number) {
  store.default.prepare('INSERT INTO mancate (id, genere, doc, prova, mittente, fase, certezza, arrivato, agito, quando) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(`m${++n}`, 'risposta', `posta:${n}`, 'prova', mittente, 'modello', 'id', giorniFa(agitoGiorniFa + 1), giorniFa(agitoGiorniFa), giorniFa(agitoGiorniFa))
}

test('con niente non ha imparato niente, e il prompt non dice niente', () => {
  store.azzeraTutto()
  const i = impara.impara(ADESSO)
  assert.deepEqual(i.vecchie, [])
  assert.equal(i.etaVecchia.size, 0)
  assert.deepEqual(i.oscure, [])
  assert.equal(i.sogliaChiara, giudizi.SOGLIA_CHIARA)
  assert.equal(i.ricontrolla.size + i.nonSuoi.size + i.daNonPerdere.size, 0)
  assert.equal(impara.righePrompt(i), '')
})

test('«vecchia»: le ultime tre con l’età, la mediana per fonte solo con almeno due, e la riga nel prompt', () => {
  store.azzeraTutto()
  carta({ stato: 'scartato', ragione: 'vecchia', autore: 'A <a@x.example>', fonte: 'posta', fonteGiorniFa: 12, nataGiorniFa: 2, chiusaGiorniFa: 1, titolo: 'Vecchia uno' })
  carta({ stato: 'scartato', ragione: 'vecchia', autore: 'B <b@x.example>', fonte: 'posta', fonteGiorniFa: 22, nataGiorniFa: 2, chiusaGiorniFa: 2, titolo: 'Vecchia due' })
  carta({ stato: 'scartato', ragione: 'vecchia', autore: 'C <c@x.example>', fonte: 'desktop', fonteGiorniFa: 40, nataGiorniFa: 3, chiusaGiorniFa: 3, titolo: 'Vecchia tre' })
  carta({ stato: 'scartato', ragione: 'vecchia', autore: 'D <d@x.example>', fonte: 'posta', fonteGiorniFa: 9, nataGiorniFa: 5, chiusaGiorniFa: 4, titolo: 'Vecchia quattro' })
  // di trentacinque giorni fa: fuori dalla finestra corta
  carta({ stato: 'scartato', ragione: 'vecchia', autore: 'E <e@x.example>', fonte: 'posta', fonteGiorniFa: 100, nataGiorniFa: 36, chiusaGiorniFa: 35, titolo: 'Vecchia fuori' })
  const i = impara.impara(ADESSO)
  assert.deepEqual(i.vecchie.map(v => [v.titolo, v.fonte, v.giorni]), [['Vecchia uno', 'posta', 10], ['Vecchia due', 'posta', 20], ['Vecchia tre', 'desktop', 37]])
  assert.deepEqual([...i.etaVecchia], [['posta', 10]], 'posta: mediana di 10, 20 e 4; desktop ne ha una sola')
  assert.match(impara.righePrompt(i), /scartate perché vecchie[\s\S]*«Vecchia uno» \(posta, 10 giorni\)/)
  assert.doesNotMatch(impara.righePrompt(i), /Vecchia quattro|Vecchia fuori/)
})

test('«non si capisce»: la soglia sale di un ventesimo per volta fino a 0.75, gli esempi vanno nel prompt', () => {
  store.azzeraTutto()
  for (let k = 0; k < 6; k++) carta({ stato: 'scartato', ragione: 'non_chiara', autore: `P${k} <p${k}@x.example>`, titolo: `Oscura ${k}`, perche: `Perché oscuro ${k}`, chiusaGiorniFa: k })
  const i = impara.impara(ADESSO)
  assert.equal(i.sogliaChiara, Math.min(0.75, giudizi.SOGLIA_CHIARA + 0.05 * 6))
  assert.equal(i.oscure.length, 3)
  assert.deepEqual(i.oscure[0], { titolo: 'Oscura 0', perche: 'Perché oscuro 0' })
  assert.match(impara.righePrompt(i), /Non scrivere così:\n— «Oscura 0» \/ «Perché oscuro 0»/)
  // un'oscura di due mesi fa non conta più
  store.azzeraTutto()
  carta({ stato: 'scartato', ragione: 'non_chiara', autore: 'Q <q@x.example>', chiusaGiorniFa: 60 })
  assert.equal(impara.impara(ADESSO).sogliaChiara, giudizi.SOGLIA_CHIARA)
})

test('«già fatta» mette il mittente fra quelli da ricontrollare, e inviatoDopo trova la posta mandata a quell’indirizzo', () => {
  store.azzeraTutto()
  carta({ stato: 'scartato', ragione: 'fatta', autore: 'Ana Ruiz <ana@harbor.example>' })
  const i = impara.impara(ADESSO)
  assert.deepEqual([...i.ricontrolla], ['ana@harbor.example'])
  store.salvaDocumenti([
    { id: 'posta:Sent:1', fonte: 'posta', tipo: 'email', titolo: 'Re', corpo: 'Done.', autore: 'Me <me@x.example>', inviato: true, destinatari: 'other@x.example,ana@harbor.example', quando: giorniFa(1) },
    { id: 'posta:Sent:2', fonte: 'posta', tipo: 'email', titolo: 'Re', corpo: 'Done.', autore: 'Me <me@x.example>', inviato: true, destinatari: null, quando: giorniFa(1) }
  ])
  assert.equal(impara.inviatoDopo('ana@harbor.example', giorniFa(2)), true)
  assert.equal(impara.inviatoDopo('ana@harbor.example', giorniFa(0.5)), false, 'mandata prima di quel momento')
  assert.equal(impara.inviatoDopo('ANA@harbor.example', giorniFa(2)), true, 'senza badare alle maiuscole')
  assert.equal(impara.inviatoDopo('nobody@x.example', giorniFa(2)), false)
  assert.equal(impara.inviatoDopo('', giorniFa(2)), false)
})

test('«non è mia» due volte da una persona senza un fatto: la sua posta entra solo se chiede; un mittente automatico no, una persona con un fatto no', () => {
  store.azzeraTutto()
  carta({ stato: 'scartato', ragione: 'non_mia', autore: 'Tom <tom@x.example>' })
  carta({ stato: 'scartato', ragione: 'non_mia', autore: 'Tom <tom@x.example>' })
  carta({ stato: 'scartato', ragione: 'non_mia', autore: 'Una <una@x.example>' })
  carta({ stato: 'scartato', ragione: 'non_mia', autore: 'Con fatto <cf@x.example>' })
  carta({ stato: 'scartato', ragione: 'non_mia', autore: 'Con fatto <cf@x.example>' })
  carta({ stato: 'fatto', ragione: 'lui', autore: 'Con fatto <cf@x.example>' })
  carta({ stato: 'scartato', ragione: 'non_mia', autore: 'Robot <noreply@x.example>' })
  carta({ stato: 'scartato', ragione: 'non_mia', autore: 'Robot <noreply@x.example>' })
  const i = impara.impara(ADESSO)
  assert.deepEqual([...i.nonSuoi], ['tom@x.example'])
  assert.match(impara.righePrompt(i), /La posta di queste persone di solito non è per lei, salvo una richiesta diretta: tom@x\.example\./)
})

test('«da non perdere»: una risposta mandata da solo, o due fatti da quella persona; una «non è mia» dopo la ritira', () => {
  store.azzeraTutto()
  mancata('ana@harbor.example', 3)
  mancata('bob@x.example', 5)
  carta({ stato: 'scartato', ragione: 'non_mia', autore: 'Bob <bob@x.example>', chiusaGiorniFa: 2 })
  carta({ stato: 'fatto', ragione: 'lui', autore: 'Cara <cara@x.example>' })
  carta({ stato: 'fatto', ragione: 'lista', autore: 'Cara <cara@x.example>' })
  carta({ stato: 'fatto', ragione: 'fuori', autore: 'Uno <uno@x.example>' })
  carta({ stato: 'fatto', ragione: 'lui', autore: 'Mista <mista@x.example>' })
  carta({ stato: 'fatto', ragione: 'lui', autore: 'Mista <mista@x.example>' })
  carta({ stato: 'scartato', ragione: 'non_mia', autore: 'Mista <mista@x.example>' })
  const i = impara.impara(ADESSO)
  assert.deepEqual([...i.daNonPerdere].sort(), ['ana@harbor.example', 'cara@x.example'])
  assert.match(impara.righePrompt(i), /ha risposto da sola senza che il feed gliele mostrasse[^\n]*ana@harbor\.example, cara@x\.example\./)
  // una mancata di quattro mesi fa non conta
  store.azzeraTutto()
  mancata('old@x.example', 120)
  assert.equal(impara.impara(ADESSO).daNonPerdere.size, 0)
})

test('«Annulla» (ragione a NULL) ritira quello che aveva insegnato', () => {
  store.azzeraTutto()
  const id = carta({ stato: 'scartato', ragione: 'fatta', autore: 'Ana Ruiz <ana@harbor.example>' })
  assert.equal(impara.impara(ADESSO).ricontrolla.size, 1)
  store.cambiaStatoFeed(id, 'aperto')
  assert.equal(impara.impara(ADESSO).ricontrolla.size, 0)
})

test('due conti non si vedono: quello che ha imparato uno non vale per l’altro', async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok)
  chi.dentro(a.id, () => {
    store.azzeraTutto()
    carta({ stato: 'scartato', ragione: 'fatta', autore: 'Solo di Anna <sa@x.example>' })
  })
  chi.dentro(b.id, () => store.azzeraTutto())
  assert.deepEqual(chi.dentro(a.id, () => [...impara.impara(ADESSO).ricontrolla]), ['sa@x.example'])
  assert.deepEqual(chi.dentro(b.id, () => [...impara.impara(ADESSO).ricontrolla]), [])
})
