import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'myynd-sender-rules-'))
const oldData = process.env.MYYND_DATI
process.env.MYYND_DATI = home
const rules = await import('./sender-rules.ts')
const store = await import('./store.ts')
const config = await import('./config.ts')
const chi = await import('./chi.ts')
after(() => {
  store.chiudiIndici()
  if (oldData === undefined) delete process.env.MYYND_DATI
  else process.env.MYYND_DATI = oldData
  rmSync(home, { recursive: true, force: true })
})

function profile<T>(name: string, fn: () => T): T { return chi.dentro(name, fn) }

test('only a complete exact address may be enabled; disabling is reversible', async () => profile('exact', async () => {
  for (const invalid of ['example.com', '@example.com', '*@example.com', 'person@', 'person@example.com extra', 'person@other.example.com,friend@example.com']) {
    assert.throws(() => rules.normalizeSender(invalid), /indirizzo email completo/)
  }
  assert.equal(rules.normalizeSender(' Person+Tag@Example.com '), 'person+tag@example.com')
  const added = await rules.enableSenderRule('Person+Tag@Example.com', 'archive')
  assert.equal(added.sender, 'person+tag@example.com')
  assert.equal(added.enabled, true)
  await assert.rejects(() => rules.enableSenderRule('person@example.com', 'trash' as 'archive'), /solo archiviare/)
  const disabled = await rules.disableSenderRule(added.id)
  assert.equal(disabled[0].enabled, false)
  const restored = await rules.enableSenderRule('person+tag@example.com', 'archive')
  assert.equal(restored.id, added.id)
  assert.equal(restored.enabled, true)
}))

test('feed suppression is exact, incoming only, and per profile', async () => profile('suppress-a', async () => {
  await rules.enableSenderRule('sales@example.com', 'archive')
  const same = { fonte: 'google', tipo: 'email', autore: 'Sales Team <sales@example.com>', inviato: false }
  assert.equal(rules.suppressSender(same), true)
  assert.equal(rules.suppressSender({ ...same, autore: 'Other <other@example.com>' }), false)
  assert.equal(rules.suppressSender({ ...same, autore: 'Sales <sales@example.com>, Other <other@example.com>' }), false)
  assert.equal(rules.suppressSender({ ...same, inviato: true }), false)
  assert.equal(rules.suppressSender({ ...same, fonte: 'github' }), false)
  assert.equal(profile('suppress-b', () => rules.suppressSender(same)), false)
}))

test('preview and execution exclude outgoing and wrong-sender messages', async () => profile('preview', async () => {
  await rules.enableSenderRule('wanted@example.com', 'archive')
  const received = new Date().toISOString()
  store.salvaDocumenti([
    { id: 'google:incoming', fonte: 'google', tipo: 'email', titolo: 'Relevant', corpo: 'Body', autore: 'Wanted <wanted@example.com>', inviato: false, quando: received },
    { id: 'google:outgoing', fonte: 'google', tipo: 'email', titolo: 'Sent', corpo: 'Body', autore: 'Wanted <wanted@example.com>', inviato: true, quando: received },
    { id: 'google:other', fonte: 'google', tipo: 'email', titolo: 'Other', corpo: 'Body', autore: 'Other <other@example.com>', inviato: false, quando: received },
    { id: 'posta:INBOX:8', fonte: 'posta', tipo: 'email', titolo: 'Relevant IMAP', corpo: 'Body', autore: 'Wanted <wanted@example.com>', inviato: false, quando: received },
    { id: 'google:old', fonte: 'google', tipo: 'email', titolo: 'Older', corpo: 'Body', autore: 'Wanted <wanted@example.com>', inviato: false, quando: '2020-01-01T00:00:00.000Z' }
  ])
  const preview = rules.previewSender('wanted@example.com')
  assert.deepEqual(preview.map(p => p.id).sort(), ['google:incoming', 'google:old', 'posta:INBOX:8'])
  const moved: string[] = []
  const result = await rules.runSenderRules({
    googleArchive: async ids => { moved.push(...ids); return ids.length },
    imapArchive: async ids => { moved.push(...ids); return ids.length },
    forget: () => {}, log: () => {}
  })
  assert.equal(result.archived, 2)
  assert.ok(result.skipped >= 1)
  assert.deepEqual(moved.sort(), ['google:incoming', 'posta:INBOX:8'])
  assert.equal(rules.listSenderRules()[0].archivedCount, 2)
  assert.ok(rules.listSenderRules()[0].lastCheckedAt)
}))

test('journal is written before mailbox mutation; uncertain calls are never retried blindly', async () => profile('uncertain', async () => {
  await rules.enableSenderRule('ambiguous@example.com', 'archive')
  store.salvaDocumenti([{ id: 'google:uncertain', fonte: 'google', tipo: 'email', titolo: 'Ambiguous', corpo: 'Body', autore: 'Ambiguous <ambiguous@example.com>', inviato: false, messageId: 'm@example.com', quando: new Date().toISOString() }])
  let calls = 0
  const archive = async (ids: string[]) => {
    calls++
    const state = JSON.parse(readFileSync(join(config.cartella(), 'sender-rules.json'), 'utf8')) as { journal: Record<string, { status: string; messageId: string }> }
    assert.equal(state.journal[ids[0]].status, 'pending')
    assert.equal(state.journal[ids[0]].messageId, 'm@example.com')
    throw new Error('network reply lost after mutation')
  }
  const first = await rules.runSenderRules({ googleArchive: archive, forget: () => {}, log: () => {} })
  assert.equal(first.processed, 1)
  assert.equal(first.uncertain, 1)
  const second = await rules.runSenderRules({ googleArchive: archive, forget: () => {}, log: () => {} })
  assert.equal(second.processed, 0)
  assert.equal(second.skipped, 1)
  assert.equal(calls, 1)
  assert.match(rules.listSenderRules()[0].lastError ?? '', /network reply lost/)
}))

test('a pending journal entry after interruption prevents a blind retry', async () => profile('pending', async () => {
  await rules.enableSenderRule('pending@example.com', 'archive')
  store.salvaDocumenti([{ id: 'posta:INBOX:42', fonte: 'posta', tipo: 'email', titolo: 'Pending', corpo: 'Body', autore: 'Pending <pending@example.com>', inviato: false, quando: new Date().toISOString() }])
  const path = join(config.cartella(), 'sender-rules.json')
  const state = JSON.parse(readFileSync(path, 'utf8')) as { journal: Record<string, unknown> }
  state.journal['posta:INBOX:42'] = { sender: 'pending@example.com', status: 'pending', messageId: null, at: new Date().toISOString() }
  const { writeFileSync } = await import('node:fs')
  writeFileSync(path, JSON.stringify(state))
  let calls = 0
  const result = await rules.runSenderRules({ imapArchive: async () => { calls++; return 1 }, forget: () => {}, log: () => {} })
  assert.equal(result.processed, 0)
  assert.equal(result.skipped, 1)
  assert.equal(calls, 0)
}))

test('disable requested during an in-flight archive stops subsequent messages', async () => profile('disable-fast', async () => {
  const enabled = await rules.enableSenderRule('stop@example.com', 'archive')
  const received = new Date().toISOString()
  store.salvaDocumenti([
    { id: 'google:stop1', fonte: 'google', tipo: 'email', titolo: 'One', corpo: 'Body', autore: 'Stop <stop@example.com>', quando: received },
    { id: 'google:stop2', fonte: 'google', tipo: 'email', titolo: 'Two', corpo: 'Body', autore: 'Stop <stop@example.com>', quando: received }
  ])
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let started!: () => void
  const firstStarted = new Promise<void>(resolve => { started = resolve })
  let calls = 0
  const work = rules.runSenderRules({ googleArchive: async ids => { calls++; started(); await gate; return ids.length }, forget: () => {}, log: () => {} })
  await firstStarted
  const disable = rules.disableSenderRule(enabled.id)
  release()
  await Promise.all([work, disable])
  assert.equal(calls, 1)
  assert.equal(rules.listSenderRules()[0].enabled, false)
}))

test('only received-after-enable messages are archived, with a 20-call ceiling', async () => profile('bounded', async () => {
  await rules.enableSenderRule('bounded@example.com', 'archive')
  const received = new Date().toISOString()
  const docs = Array.from({ length: 25 }, (_, i) => ({
    id: `google:bounded${i}`, fonte: 'google', tipo: 'email', titolo: `New ${i}`, corpo: 'Body',
    autore: 'Bounded <bounded@example.com>', inviato: false, quando: received
  }))
  docs.push({ id: 'google:stale', fonte: 'google', tipo: 'email', titolo: 'Stale', corpo: 'Body', autore: 'Bounded <bounded@example.com>', inviato: false, quando: '2020-01-01T00:00:00.000Z' })
  docs.push({ id: 'google:future', fonte: 'google', tipo: 'email', titolo: 'Future', corpo: 'Body', autore: 'Bounded <bounded@example.com>', inviato: false, quando: '2999-01-01T00:00:00.000Z' })
  store.salvaDocumenti(docs)
  let calls = 0
  const run = () => rules.runSenderRules({ googleArchive: async ids => { calls++; return ids.length }, forget: () => {}, log: () => {} })
  const first = await run()
  assert.equal(first.processed, 20)
  assert.equal(first.archived, 20)
  const second = await run()
  assert.equal(second.processed, 5)
  assert.equal(calls, 25)
  assert.equal(rules.listSenderRules()[0].archivedCount, 25)
}))

test('corrupt external rule changes fail closed instead of being overwritten', async () => profile('corrupt', async () => {
  await rules.enableSenderRule('corrupt@example.com', 'archive')
  const doc = { fonte: 'google', tipo: 'email', autore: 'Corrupt <corrupt@example.com>', inviato: false }
  assert.equal(rules.suppressSender(doc), true)
  const path = join(config.cartella(), 'sender-rules.json')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(path, '{broken json')
  assert.throws(() => rules.suppressSender(doc))
  await assert.rejects(() => rules.enableSenderRule('another@example.com', 'archive'))
  assert.equal(readFileSync(path, 'utf8'), '{broken json')
}))
