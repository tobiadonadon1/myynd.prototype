// Il contratto di una carta (F1): la base senza modello, il criterio del
// modello ripulito, chi l'ha scritto, e la prova contro il «fatto».
//
//   node --test server/contratto.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-contratto-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const contratto = await import('./contratto.ts')

before(() => { store.azzeraTutto(); cfg.aggiorna({ lingua: 'en' }) })
after(() => {
  contratto.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

let n = 0
function carta(testo: string, extra: Partial<Parameters<typeof store.scriviCompito>[0]> & { modo?: string } = {}): string {
  const id = `k${++n}`
  const { modo, ...resto } = extra
  store.scriviCompito({ id, testo, ordine: `o${String(n).padStart(3, '0')}`, ...resto })
  if (modo) store.affidaCompito(id, modo)
  return id
}

beforeEach(() => contratto.perProva({ collegato: () => false, postaCollegata: () => true, codiceDisponibile: () => false }))

test('una risposta nata da una mail: la base nomina chi riceve, la casella e cosa deve fare', () => {
  store.salvaDocumenti([{ id: 'posta:k-riccardo', fonte: 'posta', tipo: 'email', titolo: 'Pilot questions', corpo: 'Three questions about the pilot.', autore: 'Riccardo Rossi <riccardo@h-farm.com>', quando: new Date().toISOString() }])
  const id = carta('Reply to Riccardo about the pilot', { doc: 'posta:k-riccardo', modo: 'tutto' })
  const k = contratto.diBase(store.compito(id)!)
  assert.equal(k.scritto, 'myynd')
  assert.deepEqual(k.mani, ['posta'])
  assert.match(k.criterio, /draft reply to Riccardo Rossi in your mailbox/)
  assert.match(k.criterio, /answers everything they asked/)
  assert.doesNotMatch(k.criterio, /—/)
  assert.deepEqual(k.budget, { giri: 7, minuti: 15 })
})

test('senza posta collegata la risposta non promette la casella', () => {
  contratto.perProva({ collegato: () => false, postaCollegata: () => false, codiceDisponibile: () => false })
  const id = carta('Reply to Marco about the invoice', { modo: 'bozza' })
  const k = contratto.diBase(store.compito(id)!)
  assert.deepEqual(k.mani, [])
  assert.doesNotMatch(k.criterio, /mailbox/)
  assert.equal(k.budget.minuti, 10)
})

test('un documento finisce nel luogo delle consegne, e cerca sul web se non ha una fonte', () => {
  const id = carta('Write the privacy policy for the Mac app', { modo: 'tutto' })
  const k = contratto.diBase(store.compito(id)!)
  assert.deepEqual(k.mani, ['file', 'web'])
  assert.match(k.criterio, /^A file on your Desktop: Write the privacy policy for the Mac app, complete/)
})

test('il lavoro sul codice ha la sua mano e trenta minuti, solo se Claude Code c’è', () => {
  contratto.perProva({ collegato: () => false, postaCollegata: () => true, codiceDisponibile: () => true })
  const id = carta('Fix the failing test in the site repo', { modo: 'tutto' })
  const k = contratto.diBase(store.compito(id)!)
  assert.deepEqual(k.mani, ['codice'])
  assert.equal(k.budget.minuti, 30)
  assert.match(k.criterio, /copy of the project, with its checks passing/)
})

test('una carta di un’automazione non riceve mani', () => {
  const id = carta('Summarize direct email', { attrezzi: { nomi: ['posta.leggi'], origine: 'automazione' } })
  assert.deepEqual(contratto.diBase(store.compito(id)!).mani, [])
})

test('il criterio del modello: ripulito, una frase, niente promesse di gesti', async () => {
  const id = carta('Reply to Riccardo about the pilot', { modo: 'tutto' })
  let chiesto = ''
  contratto.perProva({
    collegato: () => true, postaCollegata: () => true, codiceDisponibile: () => false,
    chiediJSON: (async (o: { system: string; messages: { content: string }[] }) => {
      chiesto = o.messages[0].content
      return { criterio: 'Done means: a draft reply to Riccardo — in your mailbox — that answers his three questions about dates. It should be friendly.' }
    }) as never
  })
  const k = await contratto.assicura(id)
  assert.ok(k)
  assert.equal(k.criterio, 'A draft reply to Riccardo, in your mailbox, that answers his three questions about dates.')
  assert.match(chiesto, /La carta: Reply to Riccardo about the pilot/)
  assert.equal(store.compito(id)?.contratto?.criterio, k.criterio)

  // un criterio che promette di mandare vale meno della base: si tiene la base
  const id2 = carta('Reply to Anna about the offsite', { modo: 'tutto' })
  contratto.perProva({
    collegato: () => true, postaCollegata: () => true, codiceDisponibile: () => false,
    chiediJSON: (async () => ({ criterio: 'The reply is sent to Anna with the three dates she asked for.' })) as never
  })
  const k2 = await contratto.assicura(id2)
  assert.match(k2!.criterio, /^A draft reply/)
})

test('se il modello tarda, torna la base già salvata e il modello la sostituisce dopo', async () => {
  const id = carta('Write the onboarding checklist', { modo: 'tutto' })
  let lascia: (v: unknown) => void = () => {}
  contratto.perProva({
    collegato: () => true, postaCollegata: () => true, codiceDisponibile: () => false,
    chiediJSON: (() => new Promise(r => { lascia = r })) as never
  })
  const k = await contratto.assicura(id, { attesa: 30 })
  assert.match(k!.criterio, /^A file on your Desktop/)
  assert.equal(store.compito(id)?.contratto?.criterio, k!.criterio)
  lascia({ criterio: 'A checklist file on your Desktop with the six onboarding steps from the Notion page.' })
  await new Promise(r => setTimeout(r, 20))
  assert.equal(store.compito(id)?.contratto?.criterio, 'A checklist file on your Desktop with the six onboarding steps from the Notion page.')
})

test('scritto da lei resta suo: Myynd non lo riscrive, vuoto lo toglie', async () => {
  const id = carta('Prepare the board update', { modo: 'tutto' })
  const suo = contratto.scriviDaLei(id, '  the board deck with Q3 numbers — five slides  ')
  assert.equal(suo?.scritto, 'tu')
  assert.equal(suo?.criterio, 'The board deck with Q3 numbers, five slides')
  contratto.perProva({
    collegato: () => true, postaCollegata: () => true, codiceDisponibile: () => false,
    chiediJSON: (async () => { throw new Error('non doveva chiamare') }) as never
  })
  const k = await contratto.assicura(id, { rifai: true })
  assert.equal(k?.scritto, 'tu')
  assert.equal(contratto.scriviDaLei(id, '   '), null)
  assert.equal(store.compito(id)?.contratto, null)
})

test('la prova: un file che c’è e un criterio che regge passano', () => {
  const file = join(CASA, 'Policy.md')
  writeFileSync(file, '# Policy')
  const p = contratto.prova({
    compito: { consegna: { app: 'File', titolo: 'Policy.md', percorso: file }, email: null, contratto: null },
    verdetto: { esito: 'pass', per: '', comeTe: 'Holds.', comeLoro: '', problemi: [], verificato: [], criterio: { esito: 'met', perche: 'Covers what leaves the Mac and why.' } },
    lingua: 'en'
  })
  assert.equal(p?.esito, 'pass')
  assert.equal(p?.perche, 'Covers what leaves the Mac and why.')
  assert.deepEqual(p?.controlli, ['The file is there: Policy.md', 'Done means: met. Covers what leaves the Mac and why.'])
})

test('la prova: il revisore che boccia solo perché non vede il file, con il file sul disco, non boccia (2 ottobre)', () => {
  const file = join(CASA, 'Draft the X posts.md')
  writeFileSync(file, '# Posts')
  const perche = 'the five posts and the thread meet every rule, but no tool shows the file was written to Desktop/Myynd/Myynd.'
  const p = contratto.prova({
    compito: { consegna: { app: 'File', titolo: 'Draft the X posts.md', percorso: file }, email: null, contratto: null },
    verdetto: { esito: 'revise', per: '', comeTe: '', comeLoro: '', problemi: ['No tool shows the file was saved in the Myynd folder.'], verificato: [], criterio: { esito: 'not_met', perche } },
    lingua: 'en'
  })
  assert.equal(p?.esito, 'pass')
  assert.deepEqual(p?.controlli, ['The file is there: Draft the X posts.md', 'Done means: met. The file is saved.'])
  // controcaso: un contenuto che manca boccia ancora, anche col file sul disco
  const manca = contratto.prova({
    compito: { consegna: { app: 'File', titolo: 'Draft the X posts.md', percorso: file }, email: null, contratto: null },
    verdetto: { esito: 'revise', per: '', comeTe: '', comeLoro: '', problemi: ['The thread is missing.'], verificato: [], criterio: { esito: 'not_met', perche: 'The thread is missing.' } },
    lingua: 'en'
  })
  assert.equal(manca?.esito, 'fail')
  assert.equal(manca?.perche, 'The thread is missing.')
})

test('la prova: un file sparito boccia anche se il revisore dice di sì', () => {
  const p = contratto.prova({
    compito: { consegna: { app: 'File', titolo: 'Ghost.md', percorso: join(CASA, 'non-ce.md') }, email: null, contratto: null },
    verdetto: { esito: 'pass', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [], criterio: { esito: 'met', perche: 'ok' } },
    lingua: 'en'
  })
  assert.equal(p?.esito, 'fail')
  assert.equal(p?.perche, 'The file Ghost.md is not on the disk.')
})

test('la prova: il criterio che non regge e un posto vuoto bocciano, con il perché', () => {
  const noCriterio = contratto.prova({
    compito: { consegna: null, email: { a: 'r@x.com', oggetto: 'Pilot', corpo: '...', conosciuto: true, casella: { stato: 'salvata', id: '1' } }, contratto: null },
    verdetto: { esito: 'revise', per: '', comeTe: '', comeLoro: '', problemi: ['Misses the budget question.'], verificato: [], criterio: { esito: 'not_met', perche: 'Two of three questions answered: the budget one is missing.' } },
    lingua: 'en'
  })
  assert.equal(noCriterio?.esito, 'fail')
  assert.equal(noCriterio?.perche, 'Two of three questions answered: the budget one is missing.')
  assert.ok(noCriterio?.controlli.includes('The draft is in your mailbox, not sent.'))

  const vuoto = contratto.prova({ compito: { consegna: null, email: null, contratto: null }, verdetto: null, segnaposto: 'Missing: the invoice amount', lingua: 'en' })
  assert.equal(vuoto?.esito, 'fail')
  assert.equal(vuoto?.perche, 'Missing: the invoice amount')
})

test('la prova: senza revisore e senza controlli si dice, non si finge', () => {
  const p = contratto.prova({ compito: { consegna: null, email: null, contratto: null }, verdetto: { esito: 'unavailable', per: '', comeTe: '', comeLoro: '', problemi: [], verificato: [] }, lingua: 'en' })
  assert.equal(p?.esito, 'unavailable')
  assert.match(p!.perche, /read it before you use it/)
})

test('pulisci: niente etichetta, niente virgolette, una frase, maiuscola', () => {
  assert.equal(contratto.pulisci('«done means: a file on your desktop with the plan.» Then send it.'), 'A file on your desktop with the plan.')
  assert.equal(contratto.pulisci(42), '')
  assert.equal(contratto.pulisci('x'.repeat(400)).length, 220)
})

test('all\'avvio: la prova bocciata solo per il file regge, la domanda se ne va, e il .md diventa un .docx (9 ottobre)', async () => {
  const mani = await import('./mani.ts')
  const scrivania = join(CASA, 'Desktop')
  mani.perProva({ scrivania: () => scrivania })
  try {
    const cartella = join(scrivania, 'Myynd', 'Myynd')
    const { mkdirSync, existsSync, readFileSync } = await import('node:fs')
    mkdirSync(cartella, { recursive: true })
    const md = join(cartella, 'Draft the X posts.md')
    writeFileSync(md, 'Post 1\n\nclaude remembers.\nmyynd learns.')
    const id = carta('Draft the X posts')
    store.scriviConsegnaCompito(id, { app: 'File', titolo: 'Draft the X posts.md', percorso: md, dove: 'myynd' })
    store.scriviProvaCompito(id, { esito: 'fail', perche: 'the posts meet every rule, but no tool shows the file was written to Desktop/Myynd/Myynd.', controlli: [], quando: new Date().toISOString() })
    store.chiediSuCompito(id, [{ domanda: 'Which file should the X drafts be saved as?', opzioni: ['a.md', 'b.md'], multipla: false }])
    store.cambiaStatoCompito(id, 'pronto', 'Done: the posts.')
    const buttati: string[] = []
    assert.equal(store.compito(id)!.stato, 'pronto')
    assert.equal(contratto.riparaConsegne({ butta: p => buttati.push(p), nelLuogoDelleConsegne: p => p.startsWith(scrivania) }), 2)
    const c = store.compito(id)!
    assert.equal(c.prova?.esito, 'pass')
    assert.equal(c.prova?.perche, 'The file is saved.')
    assert.ok(!c.chieste?.length, 'la domanda «in che file salvo?» resta sotto un file salvato')
    assert.equal(c.consegna?.titolo, 'Draft the X posts.docx')
    assert.ok(existsSync(c.consegna!.percorso))
    assert.equal(readFileSync(c.consegna!.percorso).subarray(0, 2).toString(), 'PK')
    assert.deepEqual(buttati, [md])
    assert.equal(contratto.riparaConsegne({ butta: p => buttati.push(p), nelLuogoDelleConsegne: p => p.startsWith(scrivania) }), 0, 'una seconda volta non c\'è più niente da fare')
  } finally { mani.perProva(null) }
})
