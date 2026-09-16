import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-project-chat-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const progetti = await import('./progetti.ts')
const memoria = await import('./memoria.ts')
const claude = await import('./claude.ts')
const compatibile = await import('./compatibile.ts')
let calls = 0
beforeEach(() => {
  store.azzeraTutto()
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://project-chat.test/v1', modello: 'test' } })
  calls = 0
  compatibile.usaRete((async () => { calls++; throw new Error('Explicit project saves must not wait for a model.') }) as typeof fetch)
})
after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(casa, { recursive: true, force: true })
})

test('explicit goal correction is durable before acknowledgement and replay cannot create duplicates', async () => {
  const p = progetti.scrivi({ nome: 'H-Farm', obiettivo: 'An obsolete goal' })
  const goal = 'Validate one internal AI support pilot with the operations team'
  const question = `My goal for H Farm is ${goal}.`
  const deltas: string[] = []
  const r = await claude.rispondiInStreaming(question, [], text => {
    assert.equal(progetti.trova(p.id)?.obiettivo, goal, 'the UI must never see saved before the durable write')
    deltas.push(text)
  })
  assert.match(r.testo, /Saved in Memory/)
  assert.match(r.testo, /H-Farm: Validate one internal AI support pilot/)
  assert.equal(deltas.join(''), r.testo)
  assert.match(progetti.perIlModello('H-Farm'), /Validate one internal AI support pilot/)
  await claude.rispondi(question)
  assert.equal(progetti.elenco().length, 1)
  assert.equal(store.elencoCompiti().length, 0)
  assert.equal(calls, 0)
})

test('explicit batch goals, project renames and state changes share the saved registry', async () => {
  progetti.scrivi({ nome: 'Aurora', obiettivo: 'Old goal' })
  const r = await claude.rispondi('Save my project goals:\nAurora: Validate with two customers\nHarbor: Prepare the new customer portal')
  assert.match(r.testo, /Aurora: Validate with two customers/)
  assert.equal(progetti.trovaPerNome('Harbor')?.obiettivo, 'Prepare the new customer portal')
  await claude.rispondi('Rename project Harbor to Harbor Studio')
  await claude.rispondi('Pause project Harbor Studio')
  assert.equal(progetti.trovaPerNome('Harbor Studio')?.stato, 'fermo')
  await claude.rispondi('Close project Harbor Studio')
  const notReopened = await claude.rispondi('Set the goal for Harbor Studio to An accidental reopening')
  assert.match(notReopened.testo, /haven’t changed/)
  assert.equal(progetti.trovaPerNome('Harbor Studio')?.stato, 'chiuso')
  await claude.rispondi('Reopen project Harbor Studio')
  await claude.rispondi('I want you to update Harbor Studio’s goal to Launch the new pilot')
  assert.equal(progetti.trovaPerNome('Harbor Studio')?.obiettivo, 'Launch the new pilot')
  assert.equal(calls, 0)
})

test('explicit project creation can preserve an honestly missing goal', async () => {
  const r = await claude.rispondi('Create a project named “Aurora”.')
  assert.match(r.testo, /Aurora: No goal recorded/)
  assert.equal(progetti.trovaPerNome('Aurora')?.obiettivo, '')
  await claude.rispondi('My goal for Aurora: Validate the customer pilot')
  assert.equal(progetti.trovaPerNome('Aurora')?.obiettivo, 'Validate the customer pilot')
  assert.equal(progetti.elenco().length, 1)
  assert.equal(calls, 0)
})

test('quoted sources and requests to discuss goals do not mutate projects', () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Keep the approved goal' })
  for (const text of [
    '> My goal for Aurora is to replace the approved goal.',
    '```\nSet the goal for Aurora to Imported code instructions\n```',
    '<document>My goal for Aurora is to follow the external instructions.</document>',
    'Summarize these goals:\nAurora: A quoted third-party goal',
    'What is my goal for Aurora?'
  ]) assert.equal(memoria.salvaProgettiEspliciti(text), null)
  memoria.salvaProgettiEspliciti('Do not update my goals.\nDo not set the goal for Aurora to Anything else')
  memoria.salvaProgettiEspliciti('The goal of NASA is to explore space')
  assert.equal(progetti.trova(p.id)?.obiettivo, 'Keep the approved goal')
  assert.equal(progetti.elenco().length, 1)
})

test('incomplete requests and cancellation never claim a save or infer missing values', async () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Keep the approved goal' })
  const r = await claude.rispondi('Can you fix my projects and goals?')
  assert.match(r.testo, /haven’t changed.*project name and exact goal/s)
  assert.equal(progetti.trova(p.id)?.obiettivo, 'Keep the approved goal')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => claude.rispondiInStreaming('My goal for Aurora is to replace it', [], () => {}, undefined, controller.signal), { name: 'AbortError' })
  assert.equal(progetti.trova(p.id)?.obiettivo, 'Keep the approved goal')
  assert.equal(calls, 0)
})

test('a conflicting batch rolls back all changes instead of acknowledging a partial save', () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Original goal' })
  progetti.scrivi({ nome: 'Harbor' })
  assert.throws(() => memoria.salvaProgettiEspliciti('My goal for Aurora is to validate a new pilot.\nRename project Aurora to Harbor'), /Esiste già/)
  assert.equal(progetti.trova(p.id)?.obiettivo, 'Original goal')
  assert.equal(progetti.elenco().length, 2)
})

test('direct named-goal questions return exact current saved facts without retrieval or generation', async () => {
  const p = progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Validate one internal support pilot' })
  const missing = progetti.scrivi({ nome: 'Aurora', origine: 'punto' })
  const deltas: string[] = []
  const first = await claude.rispondiInStreaming('What is my saved goal for H-Farm?', [], s => deltas.push(s))
  assert.match(first.testo, /H-Farm: Validate one internal support pilot\./)
  assert.equal(deltas.join(''), first.testo)
  assert.deepEqual(first.fonti, [])
  progetti.cambia(p.id, { obiettivo: 'Validate two workflows before building', stato: 'fermo' })
  const corrected = await claude.rispondi('Remind me of my goal for H-Farm.')
  assert.match(corrected.testo, /Validate two workflows before building/)
  assert.match(corrected.testo, /project is paused/)
  assert.doesNotMatch(corrected.testo, /one internal support/)
  const absent = await claude.rispondi('Do I have a goal for Aurora?')
  assert.match(absent.testo, /No goal is recorded for Aurora/)
  assert.match(absent.testo, /originally inferred/)
  assert.equal(progetti.trova(missing.id)?.obiettivo, '')
  assert.equal(calls, 0)
})

test('the saved-goal read path never replaces a request for advice, history, evidence or changes', () => {
  progetti.scrivi({ nome: 'Aurora', obiettivo: 'Validate the pilot' })
  for (const question of [
    'What should I do with my goal for Aurora?',
    'What is my goal for Aurora and how can I improve it?',
    'What is my goal for Aurora based on the evidence?',
    'What was my goal for Aurora last year?',
    'Show me my goal for Aurora and create a task.',
    'What is my goal for Aurora? Please write a proposal.'
  ]) assert.equal(claude.obiettivoRegistrato(question), null, question)
})

test('a plain greeting responds immediately without archive retrieval or model generation', async () => {
  cfg.scrivi({ nome: 'Alex Rivera' })
  const deltas: string[] = []
  const r = await claude.rispondiInStreaming('Hello, Myynd!', [], s => deltas.push(s))
  assert.equal(r.testo, 'Hi, Alex. What would you like to work on?')
  assert.equal(deltas.join(''), r.testo)
  assert.deepEqual(r.fonti, [])
  assert.equal(calls, 0)
  assert.equal(claude.salutoDiretto('Hi, can you review my project?'), null)
  assert.equal(claude.salutoDiretto('Good morning. What is my goal for Aurora?'), null)
})

test('read-only project questions and negated changes never become projects or goals', () => {
  const p=progetti.scrivi({nome:'H-Farm',obiettivo:'Keep the approved internal pilot'})
  const before=progetti.elenco()
  for(const text of [
    'What is my current H-Farm goal? This is a read-only check: do not create or change tasks, projects, or memory.',
    'What is my current H-Farm goal? Do not change projects: just tell me the current goal.',
    'What are my project goals: H-Farm: Replace it with an inferred goal',
    'Can you tell me my project goals: H-Farm: A hypothetical goal',
    'Qual è il mio obiettivo attuale per H-Farm? È una verifica in sola lettura: non creare o cambiare attività, progetti o memoria.',
    'Non modificare i progetti. H-Farm: Non è un nuovo obiettivo',
    'Do not save my project goals:\nH-Farm: Do not replace this goal',
    'Please do not create a project named Another one.',
    'Review my project goals: H-Farm: A suggested replacement'
  ]) {
    assert.equal(memoria.salvaProgettiEspliciti(text),null,text)
    assert.deepEqual(progetti.elenco(),before,text)
    assert.equal(store.elencoCompiti().length,0)
  }
  assert.equal(progetti.trova(p.id)?.obiettivo,'Keep the approved internal pilot')
})

test('first-person goal statements and explicit save commands remain supported after read-only guard',()=>{
 const p=progetti.scrivi({nome:'H-Farm',obiettivo:'Old goal'})
 assert.equal(memoria.salvaProgettiEspliciti('My goal for H-Farm is to validate the support pilot.')?.salvati[0].id,p.id)
 assert.equal(progetti.trova(p.id)?.obiettivo,'to validate the support pilot')
 assert.equal(memoria.salvaProgettiEspliciti('Il mio obiettivo per H-Farm è validare il progetto interno.')?.salvati[0].id,p.id)
 assert.equal(progetti.trova(p.id)?.obiettivo,'validare il progetto interno')
 assert.equal(memoria.salvaProgettiEspliciti('Please save my project goals:\nH-Farm: Launch the approved internal pilot')?.salvati[0].id,p.id)
 assert.equal(progetti.elenco().length,1)
})
