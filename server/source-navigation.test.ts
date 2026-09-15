import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const casa = mkdtempSync(join(tmpdir(), 'myynd-source-api-'))
process.env.MYYND_DATI = casa
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const progetti = await import('./progetti.ts')
const idsProgetto = { base: '', alias: '', distinto: '', manuale: '', chiuso: '' }
let servizio: ChildProcess | undefined
let base = ''
const token = 'isolated-navigation-regression-token'

before(async () => {
  const account = await conti.registra('source-test@example.com', 'isolated-test-password')
  assert.ok(account.ok)
  await conti.perProva.apriCon(token, account.id)
  chi.dentro(account.id, () => {
    cfg.scrivi({ lingua: 'en', diSerie: false })
    store.salvaDocumenti([
      { id: 'github:pr:42', fonte: 'github', tipo: 'attività', titolo: 'Launch review', corpo: 'Please review the launch.', quando: new Date().toISOString(), percorso: 'https://github.com/example/project/pull/42' },
      { id: 'google:mail', fonte: 'google', tipo: 'email', titolo: 'Launch', corpo: 'Please review the launch.', quando: new Date().toISOString(), messageId: 'launch@example.com' },
      { id: 'posta:missing', fonte: 'posta', tipo: 'email', titolo: 'Missing identity', corpo: 'Please review the launch.', quando: new Date().toISOString() }
    ])
    store.scriviCompito({ id: 'repo-task', testo: 'Review the launch', origine: 'mano', doc: 'github:pr:42', ordine: 'a' })
    idsProgetto.base = progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Improve internal AI systems' }).id
    idsProgetto.alias = progetti.scrivi({ nome: 'H-Farm: I want to improve internal AI systems' }).id
    store.default.prepare("UPDATE progetti SET origine = 'punto' WHERE id = ?").run(idsProgetto.alias)
    idsProgetto.distinto = progetti.scrivi({ nome: 'H-Farm: Culture pilot', origine: 'punto' }).id
    idsProgetto.manuale = progetti.scrivi({ nome: 'H-Farm: I want to build a separate campus project' }).id
    idsProgetto.chiuso = progetti.scrivi({ nome: 'Completed project' }).id
    progetti.chiudi(idsProgetto.chiuso)
    store.scriviCompito({ id: 'legacy-project-task', testo: 'Keep the existing task', progetto: idsProgetto.alias, ordine: 'z' })
  })
  store.chiudiIndici()
  servizio = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, MYYND_DATI: casa, MYYND_PORT: '0', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('isolated API did not start')), 10000)
    let out = ''
    servizio!.stdout!.on('data', chunk => {
      out += String(chunk)
      const match = out.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) { base = match[1]; clearTimeout(timeout); resolve() }
    })
    servizio!.on('exit', code => { clearTimeout(timeout); if (!base) reject(new Error(`isolated API exited ${code}`)) })
    servizio!.on('error', reject)
  })
})

after(async () => {
  if (servizio && servizio.exitCode === null) {
    const spento = new Promise<void>(resolve => servizio!.once('exit', () => resolve()))
    servizio.kill('SIGTERM')
    await spento
  }
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(casa, { recursive: true, force: true })
})

async function post(path: string, body: object = {}) {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() as Record<string, unknown> }
}

test('task and document API return the exact web source for the client to open', async () => {
  const expected = { ok: true, dove: 'pagina', url: 'https://github.com/example/project/pull/42' }
  assert.deepEqual((await post('/api/compiti/repo-task/portami')).body, expected)
  assert.deepEqual((await post('/api/documento/portami', { id: 'github:pr:42' })).body, expected)
  const email = await post('/api/documento/portami', { id: 'google:mail' })
  assert.deepEqual(email.body, { ok: true, dove: 'pagina', url: 'https://mail.google.com/mail/u/0/#search/rfc822msgid:launch%40example.com' })
})

test('source routes reject missing identity and do not bypass account authentication', async () => {
  assert.equal((await post('/api/documento/portami', { id: 'posta:missing' })).body.ok, false)
  assert.equal((await post('/api/documento/portami', { id: 'unknown' })).status, 404)
  const r = await fetch(`${base}/api/documento/portami`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'github:pr:42' }) })
  assert.equal(r.status, 401)
  const list = await fetch(`${base}/api/compiti`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()) as { compiti: { puoInviare: boolean }[] }
  assert.equal(list.compiti[0].puoInviare, false, 'read-only connectors must not promise direct sending')
})

test('project API uses canonical records without deleting legacy associations or distinct projects', async () => {
  const headers = { authorization: `Bearer ${token}` }
  const list = async (query = '') => await fetch(`${base}/api/progetti${query}`, { headers }).then(r => r.json()) as { progetti: { id: string; nome: string; stato: string }[] }
  const normal = (await list()).progetti
  assert.equal(normal.length, 4)
  assert.ok(normal.some(p => p.id === idsProgetto.base))
  assert.ok(!normal.some(p => p.id === idsProgetto.alias))
  assert.ok(normal.some(p => p.id === idsProgetto.distinto), 'a distinct inferred subproject is not an alias')
  assert.ok(normal.some(p => p.id === idsProgetto.manuale), 'a name explicitly created by the user remains visible')
  assert.ok(normal.some(p => p.id === idsProgetto.chiuso && p.stato === 'chiuso'), 'closed projects remain editable in Memory')
  assert.equal((await list('?includiAlias=1')).progetti.length, 5, 'the original record still exists')
  assert.ok((await list(`?collegato=${idsProgetto.alias}`)).progetti.some(p => p.id === idsProgetto.alias), 'an existing task can display its exact linked record')
  const tasks = await fetch(`${base}/api/compiti`, { headers }).then(r => r.json()) as { compiti: { id: string; progetto: string }[] }
  assert.equal(tasks.compiti.find(c => c.id === 'legacy-project-task')?.progetto, idsProgetto.alias)
  const edited = await fetch(`${base}/api/progetti/${idsProgetto.alias}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ obiettivo: 'A separately confirmed user goal' }) })
  assert.equal(edited.status, 200)
  assert.ok((await list()).progetti.some(p => p.id === idsProgetto.alias), 'explicitly confirming a legacy record restores it to the ordinary list')
})
