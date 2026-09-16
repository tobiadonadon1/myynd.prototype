import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { capabilities, capability, proofValid, type CapabilityContext } from './capacita-verificate.ts'
import { executeInCopy } from './esecuzione-isolata.ts'

const empty: CapabilityContext = { desktop: false, claudeInstalled: false, connectedFolders: 0, macCalendarAvailable: false, macCalendarPermission: false, googleConnected: false, mailConnected: false, nativeDocuments: false }

test('a disconnected profile does not claim execution is ready', () => {
  const all = capabilities(empty)
  assert.ok(all.every(c => c.status !== 'ready'))
  assert.equal(capability('project.edit', empty).status, 'needs_setup')
})

test('scoped project runtimes do not grant live Hermes or arbitrary Supabase actions', () => {
  const ready = { ...empty, desktop: true, claudeInstalled: true, connectedFolders: 1 }
  assert.equal(capability('project.edit', ready).status, 'ready')
  assert.equal(capability('hermes.special', ready).status, 'unsupported')
  assert.equal(capability('supabase.arbitrary', ready).status, 'unsupported')
  assert.equal(capability('connector.arbitrary', ready).status, 'unsupported')
  const hermesOnly = {...ready,claudeInstalled:false,hermesInstalled:true}
  assert.equal(capability('project.edit',hermesOnly).status,'ready')
  assert.equal(capability('project.plan',hermesOnly).status,'needs_setup')
})

test('calendar, mail and native document readiness follows the implemented providers', () => {
  const connected = { ...empty, desktop: true, macCalendarAvailable: true, macCalendarPermission: true, googleConnected: true, nativeDocuments: true }
  assert.equal(capability('calendar.create', connected).status, 'ready')
  assert.equal(capability('mail.draft', connected).status, 'ready')
  assert.equal(capability('mail.send', connected).status, 'needs_setup')
  assert.equal(capability('document.native.create', connected).status, 'ready')
  assert.equal(capability('mail.send', { ...empty, mailConnected: true }).status, 'ready')
})

test('provider and local file proofs require actual returned evidence', async () => {
  assert.equal(await proofValid({ id: 'calendar.create', events: [] }), false)
  assert.equal(await proofValid({ id: 'calendar.create', events: [{ id: 'uid', verificato: true }] }), true)
  assert.equal(await proofValid({ id: 'calendar.create', events: [{ id: 'uid', verificato: true }, { id: 'uid', verificato: true }] }), false)
  assert.equal(await proofValid({ id: 'mail.send', providerMessageId: ' ' }), false)
  assert.equal(await proofValid({ id: 'mail.send', providerMessageId: '<id@example.com>' }), true)
  assert.equal(await proofValid({ id: 'mail.draft', providerDraftId: 'draft-id' }), true)
  assert.equal(await proofValid({ id: 'project.plan', exitCode: 0, finished: true, text: ' ' }), false)
  const dir = await mkdtemp(join(tmpdir(), 'myynd-proof-'))
  try {
    const path = join(dir, 'document.txt')
    await writeFile(path, 'created')
    assert.equal(await proofValid({ id: 'document.native.create', path, verified: true }), true)
    assert.equal(await proofValid({ id: 'document.native.create', path: join(dir, 'missing'), verified: true }), false)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('project edit proof is backed by a saved verified report, not agent text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'myynd-edit-proof-'))
  const source = join(dir, 'source')
  try {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(source)
    await writeFile(join(source, 'file.txt'), 'old')
    const report = await executeInCopy(source, async workspace => {
      await writeFile(join(workspace, 'file.txt'), 'new')
      return { exitCode: 0, finished: true, text: 'Done' }
    }, { baseDir: join(dir, 'copies'), verify: async () => ({ status: 'passed', command: ['test'], exitCode: 0, output: 'ok' }) })
    assert.equal(await proofValid({ id: 'project.edit', report }), true)
    await writeFile(join(report.workspace, 'file.txt'), 'tampered after report')
    assert.equal(await proofValid({ id: 'project.edit', report }), false)
    await writeFile(join(report.workspace, 'file.txt'), 'new')
    assert.equal(await proofValid({ id: 'project.edit', report }), true)
    const teamReport={...report,team:{mode:'worker-reviewer',acceptanceCriteria:'file.txt must contain new',accepted:true,roles:[{role:'worker',runtime:'claude',outcome:'verified'},{role:'reviewer',runtime:'claude',outcome:'approved',exitCode:0,finished:true,findings:[] as string[]}]}}
    await writeFile(report.reportFile,JSON.stringify(teamReport))
    assert.equal(await proofValid({id:'project.edit',report:teamReport}),false,'a team verdict needs concrete findings')
    teamReport.team.roles[1].findings=['The supplied file contains new.']
    await writeFile(report.reportFile,JSON.stringify(teamReport))
    assert.equal(await proofValid({id:'project.edit',report:teamReport}),true)
    await rm(report.reportFile)
    assert.equal(await proofValid({ id: 'project.edit', report }), false)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
