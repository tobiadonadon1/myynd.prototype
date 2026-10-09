// La lettura del feed sul solo account Claude.
//
// `generaFeed` e la prima pagina chiedevano `motore()`, che l'account non lo
// conta: sul Mac di chi usa l'account la posta nuova non diventava mai una
// carta (nessuna lettura dal 21 settembre). Qui l'account risponde da un
// `lancia` finto, senza chiave e senza fornitore: la lettura deve passare di
// lì, con lo schema detto a parole, e la carta nascere.
//
//   node --test server/feed-account.test.ts

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-feed-account-'))
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const abbonamento = await import('./abbonamento.ts')
const mod = await import('./modello.ts')
const claude = await import('./claude.ts')
const pagina = await import('./prima-pagina.ts')
const priorita = await import('./priorita.ts')
const conti = await import('./conti.ts')

const EXE = join(CASA, 'claude')
writeFileSync(EXE, '#!/bin/sh\nexit 0\n')
chmodSync(EXE, 0o755)

const RECENTE = new Date(Date.now() - 3_600_000).toISOString()
const mail = { id: 'posta:INBOX:11', fonte: 'posta', tipo: 'email', titolo: 'Fattura Bianchi', corpo: 'Puoi pagare la fattura entro venerdì?',
  autore: 'Bianchi <bianchi@esempio.it>', percorso: 'INBOX', quando: RECENTE, gruppo: 'posta', inviato: false, letto: false, massa: false }
const voce = { tipo: 'Da decidere', titolo: 'Paga la fattura di Bianchi', testo: 'Bianchi chiede il pagamento della fattura entro venerdì.', urgenza: 'entro venerdì',
  fonte: 'posta', doc: 'posta:INBOX:11', perche: 'Bianchi attende il pagamento della fattura.', prova: 'Puoi pagare la fattura entro venerdì?' }

/** Le domande arrivate all'account: il sistema (con lo schema) e la domanda. */
let domande: { sistema: string; domanda: string }[] = []
const busta = (result: string) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, usage: { input_tokens: 50, output_tokens: 10 } })

before(async () => {
  await conti.avvia()
  abbonamento.perProva({
    installato: () => EXE,
    lancia: async (args, domanda) => {
      const sistema = args[args.indexOf('--system-prompt') + 1] ?? ''
      domande.push({ sistema, domanda })
      // la lettura vuole le voci; ogni altra domanda piccola (la rifinitura) un oggetto vuoto
      return busta(/id: posta:INBOX:11/.test(domanda) ? JSON.stringify({ voci: [voce] }) : '{}')
    }
  })
})
beforeEach(() => {
  domande = []
  store.azzeraTutto()
  abbonamento.riprova()
  pagina.perProva(null); pagina.dimentica(); priorita.perProva(null)
  cfg.scrivi({ lingua: 'it', claudeCon: 'abbonamento' }, { togli: ['claude', 'motore', 'compatibile'] })
})
after(() => {
  abbonamento.perProva(null)
  pagina.perProva(null); priorita.perProva(null)
  store.chiudiIndici()
  rmSync(CASA, { recursive: true, force: true })
})

test('sul solo account Claude la lettura c’è: nessun motore con la chiave, ma puoLeggere sì', () => {
  assert.equal(mod.motore(), null, 'qui non deve esserci una chiave né un fornitore')
  assert.equal(mod.puoLeggere(), true)
})

test('generaFeed sull’account: la mail nuova arriva all’account con lo schema, e torna una carta', async () => {
  store.salvaDocumenti([mail])
  const voci = await claude.generaFeed()
  const lettura = domande.find(d => /id: posta:INBOX:11/.test(d.domanda))
  assert.ok(lettura, 'la lettura non è passata dall’account')
  assert.match(lettura!.sistema, /"voci"/, 'lo schema della lettura non è arrivato all’account')
  assert.equal(voci.length, 1)
  assert.equal(voci[0]!.doc, 'posta:INBOX:11')
  assert.equal(store.salvaFeed(voci), 1)
})

test('senza account e senza chiave la lettura non chiama nessuno', async () => {
  cfg.scrivi({ lingua: 'it' }, { togli: ['claude', 'claudeCon', 'abbonamento', 'motore', 'compatibile'] })
  store.salvaDocumenti([mail])
  assert.equal(mod.puoLeggere(), false)
  assert.deepEqual(await claude.generaFeed(), [])
  assert.equal(domande.length, 0)
})

test('la prima pagina sull’account legge il feed: la carta nasce dalla posta arrivata', async () => {
  store.salvaDocumenti([mail])
  pagina.perProva({ forse: async () => 0, annuncia: () => {} })
  await pagina.prepara()
  assert.ok(domande.some(d => /id: posta:INBOX:11/.test(d.domanda)), 'la prima pagina ha saltato la lettura sull’account')
  assert.equal(store.elencoFeed('aperto').length, 1)
  assert.equal(pagina.stato().pagina, 'pronta')
})
