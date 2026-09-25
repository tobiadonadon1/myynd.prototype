// Il voto alle priorità, con il giro e il modello finti: il rapporto, i
// totali, la lunghezza decisa dal codice, il file salvato. E la lettura degli
// argomenti della riga di comando, che è pura.
//
//   node --test server/valuta-feed.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-valuta-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Tobia' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const riferimento = await import('./riferimento.ts')
const valutaFeed = await import('./valuta-feed.ts')
after(() => { valutaFeed.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

const evermute = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship Evermute 1.0' })
const sito = progetti.scrivi({ nome: 'Sito', obiettivo: 'Three offers online' })

test('leggiArgomenti: pura, e severa su quello che non conosce', () => {
  const a = valutaFeed.leggiArgomenti(['--conto', 'tobia@esempio.it', '--riferimento', 'rif.txt', '--dati', '/tmp/x', '--secco'])
  assert.deepEqual(a, { conto: 'tobia@esempio.it', riferimento: 'rif.txt', dati: '/tmp/x', secco: true, aiuto: false, sbagliato: null })
  assert.equal(valutaFeed.leggiArgomenti([]).conto, null)
  assert.equal(valutaFeed.leggiArgomenti(['--help']).aiuto, true)
  assert.equal(valutaFeed.leggiArgomenti(['--boh']).sbagliato, '--boh')
  // un valore che manca non ruba il flag dopo
  const b = valutaFeed.leggiArgomenti(['--conto', '--secco'])
  assert.equal(b.conto, null)
  assert.equal(b.sbagliato, '--conto')
  assert.equal(b.secco, true)
})

test('senza riferimento non si valuta niente', async () => {
  await assert.rejects(valutaFeed.valuta(), /Manca il riferimento/)
})

test('il rapporto: un giro nuovo non salvato più il feed, i totali, la lunghezza dal codice, il file', async () => {
  riferimento.scrivi('Evermute: shipping 1.0, waiting on Apple. Sito: dead, I dropped it.')
  // una carta già sul feed, che il giudizio deve vedere accanto alle nuove
  store.salvaFeed([{ tipo: 'Priorità', titolo: 'Rewrite the three offers on the site', testo: 'The offers note is twenty days old and nothing moved since.', perche: 'Moves the site forward', offerta: 'I draft the three offers with a price each.', progetto: sito.id }])
  let sistema = ''
  let carte = ''
  valutaFeed.perProva({
    proponi: async () => ({
      voci: [
        { genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked twelve days ago for a recording; nothing went back yet.', perche: 'Unblocks the Evermute release', progetto: evermute.id, doc: null, offerta: 'I draft the reply with the checklist.', quando: '', prova: 'Waiting on Apple for the review.', origine: 'memoria' as const },
        { genere: 'proposta', titolo: 'Turn the notes into a guide that is far too long a title to fit the card at all, really', testo: 'x'.repeat(201), perche: 'Moves the site from copy to products', progetto: null, doc: null, offerta: 'I outline the guide.', quando: '', prova: 'The notes could become a guide.', origine: 'memoria' as const }
      ],
      domande: [], superate: [], guardati: 48, cartelle: 9, conversazioni: 3
    }),
    chiediJSON: (async (o: { lavoro: string; system: string; messages: { content: string }[] }) => {
      assert.equal(o.lavoro, 'valutazione')
      sistema = o.system; carte = o.messages[0].content
      return { giudizi: [
        { n: 1, attuale: true, finitoOMorto: false, progettoGiusto: true, motivo: 'The reference says Evermute is waiting on Apple.' },
        { n: 2, attuale: false, finitoOMorto: false, progettoGiusto: true, motivo: 'Not in the reference.' },
        { n: 3, attuale: false, finitoOMorto: true, progettoGiusto: true, motivo: 'The reference says the site is dead.' }
      ] }
    }) as never
  })
  const r = await valutaFeed.valuta()
  assert.match(sistema, /Sito: dead/, 'il riferimento sta nel prompt')
  assert.match(carte, /\[1\] composta adesso .* progetto: Evermute/)
  assert.match(carte, /\[3\] già sul feed/)
  assert.equal(r.composto, true)
  assert.deepEqual(r.guardati, { documenti: 48, cartelle: 9, conversazioni: 3 })
  assert.equal(r.voci.length, 3)
  assert.equal(r.voci[0].origine, 'nuova')
  assert.equal(r.voci[0].progettoNome, 'Evermute')
  assert.equal(r.voci[1].lunghezzaOk, false, 'la lunghezza la decide il codice: titolo oltre 90 o testo oltre 200')
  assert.equal(r.voci[2].origine, 'feed')
  assert.equal(r.voci[2].finitoOMorto, true)
  assert.deepEqual(r.totali, { attuali: 1, finiteOMorte: 1, progettoGiusto: 3, lunghezzaOk: 2, quante: 3 })
  assert.ok(r.file && existsSync(r.file) && r.file.startsWith(join(dati, 'valutazioni')))
  assert.equal(JSON.parse(readFileSync(r.file, 'utf8')).totali.quante, 3)
  // niente è finito sul feed dal giro nuovo
  assert.equal(store.feedAperto().length, 1)
  // la tabella si stampa, una riga per carta più il motivo
  const t = valutaFeed.tabella(r, true)
  assert.match(t, /Totals: current 1\/3/)
  assert.match(t, /\[on the feed\]/)
})

test('secco: niente giro nuovo, e un riferimento passato vince su quello salvato', async () => {
  let composto = 0
  valutaFeed.perProva({
    proponi: (async () => { composto++; return null }) as never,
    chiediJSON: (async (o: { system: string }) => {
      assert.match(o.system, /Ceru: blocked/)
      return { giudizi: [{ n: 1, attuale: true, finitoOMorto: false, progettoGiusto: false, motivo: 'ok' }] }
    }) as never
  })
  const r = await valutaFeed.valuta({ riferimento: 'Ceru: blocked on the contract.', secco: true })
  assert.equal(composto, 0)
  assert.equal(r.composto, false)
  assert.equal(r.voci.length, 1)
  assert.equal(r.totali.progettoGiusto, 0)
})

test('se il modello non risponde, la valutazione lo dice invece di tornare tutti zeri', async () => {
  valutaFeed.perProva({ proponi: (async () => null) as never, chiediJSON: (async () => null) as never })
  await assert.rejects(valutaFeed.valuta({ riferimento: 'x' }), /Il modello non ha risposto/)
})
