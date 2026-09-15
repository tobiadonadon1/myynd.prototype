import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const casa = mkdtempSync(join(tmpdir(), 'myynd-mail-signals-'))
process.env.MYYND_DATI = casa
const cfg = await import('./config.ts')
const google = await import('./connettori/google.ts')
const microsoft = await import('./connettori/microsoft.ts')
const { postaAutomatica } = await import('./connettori/segnaliPosta.ts')
const { dovePortare, paginaBuona } = await import('./scrivania.ts')
const rete = globalThis.fetch
after(() => { globalThis.fetch = rete; rmSync(casa, { recursive: true, force: true }); delete process.env.MYYND_DATI })

test('mailing list and automation headers survive provider differences', () => {
  assert.equal(postaAutomatica([{ name: 'List-ID', value: 'weekly.example' }]), true)
  assert.equal(postaAutomatica([{ name: 'Auto-Submitted', value: 'auto-generated' }]), true)
  assert.equal(postaAutomatica([{ name: 'Auto-Submitted', value: 'no' }]), false)
  assert.equal(postaAutomatica([{ name: 'Precedence', value: 'bulk' }]), true)
  assert.equal(postaAutomatica([]), false)
})

test('Gmail import preserves sent/read/list signals and a message link for the connected account', async () => {
  const g = { clientId: 'test', refresh: 'test', email: 'work@example.com' }
  cfg.scrivi({ google: g })
  google.scordaIlToken()
  const items = [
    { id: 'personal', labels: ['INBOX', 'UNREAD'], headers: [] },
    { id: 'sent', labels: ['SENT'], headers: [] },
    { id: 'promo', labels: ['INBOX', 'CATEGORY_PROMOTIONS'], headers: [] },
    { id: 'list', labels: ['INBOX'], headers: [{ name: 'List-Unsubscribe', value: '<https://example.com/unsubscribe>' }] }
  ]
  globalThis.fetch = (async (url) => {
    const u = String(url)
    if (u.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'test', expires_in: 3600 })
    const item = items.find(x => u.includes(`/messages/${x.id}`))
    if (!item) return Response.json({ messages: items.map(x => ({ id: x.id })) })
    return Response.json({ id: item.id, threadId: `thread-${item.id}`, labelIds: item.labels, internalDate: String(Date.now()),
      payload: { mimeType: 'text/plain', body: { data: Buffer.from('Please review the proposal.').toString('base64url') },
        headers: [{ name: 'Subject', value: 'Proposal' }, { name: 'From', value: 'Anna <anna@example.com>' },
          { name: 'Message-ID', value: `<${item.id}@example.com>` }, ...item.headers] } })
  }) as typeof fetch
  const r = await google.sincronizza(g)
  const doc = (id: string) => r.docs.find(d => d.id === `google:${id}`)!
  assert.equal(doc('personal').letto, false)
  assert.equal(doc('personal').inviato, false)
  assert.equal(doc('personal').massa, false)
  assert.equal(doc('sent').inviato, true)
  assert.equal(doc('sent').letto, true)
  assert.equal(doc('promo').massa, true)
  assert.equal(doc('list').massa, true)
  const target = dovePortare({ doc: doc('personal').id }, doc('personal'))
  assert.equal(target.dove, 'pagina')
  if (target.dove === 'pagina') {
    assert.equal(new URL(target.url).searchParams.get('authuser'), g.email)
    assert.match(target.url, /rfc822msgid:personal%40example.com$/)
  }
})

test('Outlook import retains the provider message URL and request identity', async () => {
  const m = { clientId: 'test', refresh: 'test', email: 'me@example.com', parti: ['posta' as const] }
  cfg.scrivi({ ...cfg.leggi(), microsoft: m })
  microsoft.scordaIlToken()
  let selected = ''
  globalThis.fetch = (async (url) => {
    const u = String(url)
    if (u.includes('/token')) return Response.json({ access_token: 'test', expires_in: 3600 })
    selected = new URL(u).searchParams.get('$select') ?? ''
    return Response.json({ value: [{ id: 'exact', subject: 'Proposal', receivedDateTime: new Date().toISOString(),
      from: { emailAddress: { address: 'me@example.com' } }, body: { contentType: 'text', content: 'Please review the proposal.' },
      isRead: true, webLink: 'https://outlook.office.com/mail/deeplink/read/exact', internetMessageId: '<exact@example.com>',
      internetMessageHeaders: [{ name: 'List-ID', value: 'team.example' }] }] })
  }) as typeof fetch
  const { docs: [d] } = await microsoft.sincronizzaPosta(m)
  assert.match(selected, /webLink/)
  assert.equal(d.messageId, 'exact@example.com')
  assert.equal(d.letto, true)
  assert.equal(d.inviato, true)
  assert.equal(d.massa, true)
  assert.deepEqual(dovePortare({ doc: d.id }, d), { dove: 'pagina', url: 'https://outlook.office.com/mail/deeplink/read/exact' })
})

test('source opening fails honestly without identity and rejects embedded URL credentials', () => {
  assert.equal(dovePortare({ doc: 'posta:INBOX:1' }, { fonte: 'posta' }).dove, 'niente')
  assert.equal(dovePortare({ doc: 'google:missing' }, { fonte: 'google' }).dove, 'niente')
  assert.equal(paginaBuona('https://user:password@example.com/path'), '')
})
