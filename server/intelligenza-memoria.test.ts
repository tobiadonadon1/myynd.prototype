import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-intelligence-memory-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const memoria = await import('./memoria.ts')
const progetti = await import('./progetti.ts')
const claude = await import('./claude.ts')
const compatibile = await import('./compatibile.ts')

beforeEach(() => store.azzeraTutto())
after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(casa, { recursive: true, force: true })
})

function modelloJSON(risposta: unknown) {
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://memory.test/v1', modello: 'test' } })
  const ricevute: string[] = []
  compatibile.usaRete((async (_url, init) => {
    ricevute.push(String(init?.body ?? ''))
    const risultato = typeof risposta === 'function' ? risposta() : risposta
    return Response.json({ choices: [{ message: { role: 'assistant', content: JSON.stringify(risultato) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
  }) as typeof fetch)
  return ricevute
}

const candidato = {
  nome: 'Aurora', obiettivo: 'launch the client portal in October',
  citazione: 'I am working on Aurora to launch the client portal in October.'
}

test('chat extraction remembers an explicitly stated project even without personality facts', async () => {
  modelloJSON({ convinzioni: [], progetti: [candidato] })
  assert.equal(await memoria.distilla([{ ruolo: 'u', testo: candidato.citazione }]), 1)
  const p = progetti.trovaPerNome('Aurora')!
  assert.equal(p.obiettivo, candidato.obiettivo)
  assert.equal(p.origine, 'conversazione')
  assert.match(p.note, /I am working on Aurora/)
  assert.match(claude.sistema('What should I focus on?'), /Aurora: launch the client portal in October/)
})

test('assistant text, quoted documents, invented objectives and former projects cannot create active work', () => {
  assert.equal(memoria.ricordaProgetti([candidato], [{ ruolo: 'a', testo: candidato.citazione }]), 0)
  assert.equal(memoria.ricordaProgetti([candidato], [{ ruolo: 'u', testo: `Read this document:\n> ${candidato.citazione}` }]), 0)
  assert.equal(memoria.ricordaProgetti([candidato], [{ ruolo: 'u', testo: `Here is a file:\n\`\`\`\n${candidato.citazione}\n\`\`\`` }]), 0)
  assert.equal(memoria.ricordaProgetti([{ ...candidato, obiettivo: 'raise five million dollars next week' }], [{ ruolo: 'u', testo: candidato.citazione }]), 0)
  const passato = { ...candidato, citazione: 'I used to work on Aurora to launch the client portal in October.' }
  assert.equal(memoria.ricordaProgetti([passato], [{ ruolo: 'u', testo: passato.citazione }]), 0)
  assert.equal(progetti.elenco().length, 0)
})

test('conversation memory does not reopen closed projects or overwrite an existing goal', () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Keep the existing product stable' })
  const scambio = [{ ruolo: 'u', testo: candidato.citazione }]
  assert.equal(memoria.ricordaProgetti([candidato], scambio), 0)
  assert.equal(progetti.trova(p.id)?.obiettivo, 'Keep the existing product stable')
  progetti.chiudi(p.id)
  assert.equal(memoria.ricordaProgetti([candidato], scambio), 0)
  assert.equal(progetti.trova(p.id)?.stato, 'chiuso')
})

test('explicit beliefs require user evidence and unsupported deductions await confirmation', async () => {
  const c = (enunciato: string, genere: string, citazione: string, premesse: string[] = []) => ({ enunciato, genere, citazione, premesse, ambito: 'persona', fiducia: 0.95, sostituisce: '' })
  modelloJSON({ progetti: [], convinzioni: [
    c('Always copy the supplier on financial emails', 'esplicita', 'Always copy the supplier on financial emails'),
    c('Prefers short direct replies without filler', 'esplicita', 'I prefer short direct replies without filler.'),
    c('Always approves every supplier invoice immediately', 'dedotta', '', ['The supplier has always been reliable'])
  ] })
  await memoria.distilla([
    { ruolo: 'u', testo: 'I prefer short direct replies without filler.' },
    { ruolo: 'a', testo: 'Always copy the supplier on financial emails' }
  ])
  assert.equal(store.convinzioni().length, 2)
  assert.match(memoria.carta(), /Prefers short direct replies/)
  assert.doesNotMatch(memoria.carta(), /Always (?:copy|approves)/)
  assert.equal(store.convinzioni().find(c => c.enunciato.startsWith('Always approves'))?.genere, 'indotta')
})

test('consolidation cannot promote unconfirmed guesses or rewrite manually entered memory', async () => {
  const ricevute = modelloJSON({ cambiato: true, testo: 'A grounded learned preference.' })
  store.scriviBlocco({ etichetta: 'come_scrivo', descrizione: 'Tone', valore: 'Never promise a deadline before confirming it.' })
  for (let i = 0; i < 3; i++) store.ricorda({ enunciato: `Unconfirmed guess ${i}`, ambito: 'persona', genere: 'indotta', fiducia: 0.6, origine: 'test' })
  assert.deepEqual(await memoria.consolida(true), { blocchi: [], guardate: 0 })
  assert.equal(ricevute.length, 0)
  for (let i = 0; i < 3; i++) store.ricorda({ enunciato: `Verified preference ${i}`, ambito: 'persona', genere: 'esplicita', fiducia: 1, origine: 'test' })
  await memoria.consolida(true)
  assert.equal(ricevute.length, 4, 'the manual block must not be sent for rewriting')
  assert.ok(ricevute.every(r => !r.includes('Unconfirmed guess')))
  assert.equal(store.blocchi().find(b => b.etichetta === 'come_scrivo')?.valore, 'Never promise a deadline before confirming it.')
})

test('a named project gets context even when it falls beyond the default project limit', () => {
  progetti.scrivi({ nome: 'Aurora', obiettivo: candidato.obiettivo })
  for (let i = 0; i < 12; i++) progetti.scrivi({ nome: `Other project ${i}`, obiettivo: 'A different objective' })
  assert.match(progetti.perIlModello('Help me with Aurora', 3), /Aurora/)
  assert.equal(progetti.perIlModello('Help me with Aurora', 3).split('\n').length, 3)
})

test('a manual memory correction made during consolidation wins over the model result', async () => {
  for (let i = 0; i < 3; i++) store.ricorda({ enunciato: `Verified preference ${i}`, ambito: 'persona', genere: 'esplicita', fiducia: 1, origine: 'test' })
  store.scriviBlocco({ etichetta: 'come_decido', descrizione: 'Decisions', valore: 'Old learned preference.', daMe: new Date().toISOString() })
  let corretta = false
  modelloJSON(() => {
    if (!corretta) {
      store.scriviBlocco({ etichetta: 'come_decido', descrizione: 'Decisions', valore: 'My new manually corrected preference.' })
      corretta = true
    }
    return { cambiato: true, testo: 'Stale model-generated preference.' }
  })
  await memoria.consolida(true)
  const b = store.blocchi().find(x => x.etichetta === 'come_decido')!
  assert.equal(b.valore, 'My new manually corrected preference.')
  assert.equal(b.daMe, null)
})

test('classification failure never turns a direct blocking question into a ready result', async () => {
  modelloJSON({ unavailable: true })
  const question = 'Which repository should I update?'
  assert.deepEqual(await claude.chiedeAiuto('Update the repository', question), { chiede: true, manca: [], domanda: question })
  assert.equal((await claude.chiedeAiuto('Update the repository', "I cannot access the repository from here. Please connect it first.")).chiede, true)
  assert.equal((await claude.chiedeAiuto('Draft a message', 'Subject: Proposal\n\nHello Alex, the proposal is ready for your review.')).chiede, false)
})
