import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-chiusura-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const pm = await import('./project-memory.ts')
const chiusura = await import('./chiusura-progetto.ts')
after(() => { chiusura.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

const u = (testo: string) => ({ ruolo: 'u', testo })
const a = (testo: string) => ({ ruolo: 'a', testo })

test('si chiude alla terza risposta, o prima se dice di sì a un passo proposto', () => {
  assert.equal(chiusura.accordoBreve('yes'), true)
  assert.equal(chiusura.accordoBreve('Yes good.'), true)
  assert.equal(chiusura.accordoBreve('Va bene, partiamo'), true)
  assert.equal(chiusura.accordoBreve('yes but what do you mean?'), false)
  assert.equal(chiusura.accordoBreve('I am working on the intelligence so that it works by itself'), false)
  const apertura = a('What are you working on right now?')
  assert.equal(chiusura.toccaConcludere('I am working on the intelligence', [apertura]), false, 'la prima risposta non chiude')
  assert.equal(chiusura.toccaConcludere('yes', [apertura]), false, 'un sì alla prima domanda non è un sì a un passo')
  assert.equal(chiusura.toccaConcludere('yes', [apertura, u('one'), a('Shall we start with X?')]), true)
  assert.equal(chiusura.toccaConcludere('and something else entirely', [apertura, u('one'), a('q'), u('two'), a('q')]), true, 'la terza risposta chiude comunque')
})

test('la chiusura legge la conversazione, salva il risultato sul progetto e mette i passi in lista', async () => {
  const p = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Finish Myynd with useful intelligence' })
  const storico = [
    a('Let’s talk about Myynd. What are you working on right now? And what’s the next concrete result you want to reach?'),
    u('I am working on setting up the intelligence so that it works by itself and helps me run my work life.'),
    a('What is the first concrete result that would prove it works?'),
    u('If it could detect alone some things that have to be done, offer to do them, and actually do them.'),
    a('This week, let’s choose one recurring workflow and test it end to end. Does that first step work for you?')
  ]
  chiusura.perProva({ chiediJSON: (async (o: { messages: { content: string }[] }) => {
    assert.match(o.messages[0].content, /Persona: yes/)
    return { risultato: 'Myynd detects one task on its own, offers to do it, and delivers it — this week.', passi: ['Pick one recurring workflow to pilot', 'Define what Myynd may complete without approval', ''] }
  }) as never })
  const messi: { testo: string; progetto?: string; modo?: string }[] = []
  store.creaChat('th-c', 'Myynd', { progetto: p.id, iniziativa: 'pi-1' })
  const sul = store.chatSulProgetto('th-c')!
  assert.equal(pm.nextResultSince(p.id, sul.quando), null)
  const esito = await chiusura.concludiDaTrascrizione(p.id, 'yes', storico, c => { messi.push(c); return { id: `c${messi.length}` } })
  assert.ok(esito)
  assert.doesNotMatch(esito.risultato, /—/, 'niente lineette nel testo generato')
  assert.deepEqual(esito.passi, ['Pick one recurring workflow to pilot', 'Define what Myynd may complete without approval'])
  assert.deepEqual(messi.map(m => [m.progetto, m.modo]), [[p.id, 'io'], [p.id, 'io']])
  assert.match(pm.projectMemoryContext(p.id), /detects one task on its own/)
  // e la chat sa di aver concluso: da qui il modello non chiude due volte
  assert.match(String(pm.nextResultSince(p.id, sul.quando)?.value), /detects one task/)
})

test('senza niente di concreto non si salva niente, e la chat va avanti', async () => {
  const p = progetti.trovaPerNome('Myynd')!
  chiusura.perProva({ chiediJSON: (async () => ({ risultato: '', passi: [] })) as never })
  const messi: unknown[] = []
  assert.equal(await chiusura.concludiDaTrascrizione(p.id, 'yes', [], c => { messi.push(c); return { id: 'x' } }), null)
  assert.equal(messi.length, 0)
  chiusura.perProva({ chiediJSON: (async () => null) as never })
  assert.equal(await chiusura.concludiDaTrascrizione(p.id, 'yes', [], () => ({ id: 'x' })), null)
})
