import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-chat-progetto-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const memoria = await import('./memoria.ts')
const pm = await import('./project-memory.ts')
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })

test('raccontare su cosa si lavora non è un ordine di salvare un progetto', () => {
  // la frase vera, con i suoi errori: prima finiva nel parser e Myynd rispondeva «dimmi il nome del progetto»
  assert.equal(memoria.salvaProgettiEspliciti('I am working on setting up the inteligence in a way in which it is autonomus, it works by itself, and helps me seriously to run my career and my work life.'), null)
  assert.equal(memoria.salvaProgettiEspliciti('ok, i told you what you asked me'), null)
})

test('«I am working on Aurora to launch the portal» resta una dichiarazione che crea il progetto', () => {
  const r = memoria.salvaProgettiEspliciti('I am working on Aurora to launch the client portal in October.')
  assert.ok(r && !r.incompleta && r.salvati.some(p => p.nome === 'Aurora'))
})

test('una chat nata da «Parliamone» sa di quale progetto parla, e la risposta entra nella memoria del progetto', () => {
  const p = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Finish Myynd' })
  store.creaChat('th1', 'Myynd', { progetto: p.id, iniziativa: 'pi-x' })
  store.creaChat('th2', 'una chat qualsiasi')
  assert.deepEqual(store.chatSulProgetto('th1'), { progetto: p.id, iniziativa: 'pi-x' })
  assert.equal(store.chatSulProgetto('th2'), null)
  pm.recordCurrentWork(p.id, 'Setting up the intelligence so it works by itself.')
  pm.recordCurrentWork(p.id, 'Now the project cards.')
  const ctx = pm.projectMemoryContext(p.id)
  assert.match(ctx, /"kind":"work"/)
  assert.match(ctx, /Now the project cards\./)
  assert.doesNotMatch(ctx, /Setting up the intelligence/)
  assert.match(progetti.perIlModello('Myynd'), /Now the project cards\./)
})

test('«Myynd for Dad» è Myynd: il punto non lo fa nascere come progetto a sé', () => {
  const myynd = progetti.trovaPerNome('Myynd')!
  const doppio = progetti.scrivi({ nome: 'Myynd for Dad', origine: 'punto' })
  assert.equal(doppio.id, myynd.id)
  assert.ok(!progetti.perContesto().some(p => p.nome === 'Myynd for Dad'))
  // ma un nome che condivide solo una parola non è un alias
  assert.notEqual(progetti.scrivi({ nome: 'Myynd Studio', origine: 'punto' }).id, myynd.id)
})

test('il prossimo risultato concordato entra nel contesto del progetto, e l’ultimo vale', () => {
  const p = progetti.trovaPerNome('Myynd')!
  pm.recordNextResult(p.id, 'A build the first three users can install alone.')
  const ctx = pm.projectMemoryContext(p.id)
  assert.match(ctx, /A build the first three users can install alone\./)
  assert.match(ctx, /Now the project cards\./)
})
