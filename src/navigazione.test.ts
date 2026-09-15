import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkNavigabile, preparaApertura } from './navigazione.ts'

function browser() {
  const urls: string[] = []
  let prenotazioni = 0
  let chiusure = 0
  const finestra = {
    opener: {} as unknown,
    closed: false,
    location: { replace(url: string) { urls.push(url) } },
    close() { chiusure++; this.closed = true }
  }
  return {
    urls, finestra,
    ambiente: { prenota() { prenotazioni++; return finestra } },
    prenotazioni: () => prenotazioni,
    chiusure: () => chiusure
  }
}

test('a real repository or email link opens in the user browser after asynchronous resolution', async () => {
  for (const url of ['https://github.com/example/myynd/pull/42', 'https://mail.google.com/mail/u/0/#all/18f21abc']) {
    const b = browser()
    const apertura = preparaApertura(b.ambiente)
    assert.equal(b.prenotazioni(), 1, 'reserve the tab before awaiting the API')
    assert.equal(b.finestra.opener, null, 'the external site cannot navigate Myynd')
    const r = await apertura.completa(await Promise.resolve({ ok: true, dove: 'pagina', url } as const))
    assert.ok(r.ok)
    assert.deepEqual(b.urls, [url], 'keep the exact thread/PR path and fragment')
    apertura.annulla()
    assert.equal(b.chiusure(), 0, 'successful navigation must survive cleanup')
  }
})

test('desktop uses the system browser and reserves no empty browser tab', async () => {
  const urls: string[] = []
  const apertura = preparaApertura({
    apriFuori: async url => { urls.push(url) },
    prenota: () => { assert.fail('desktop should not reserve a tab') }
  })
  await apertura.completa({ ok: true, dove: 'pagina', url: 'https://github.com/example/myynd/issues/8' })
  assert.deepEqual(urls, ['https://github.com/example/myynd/issues/8'])
})

test('native Mail/file opening closes the unused browser reservation', async () => {
  for (const dove of ['posta', 'file'] as const) {
    const b = browser()
    const apertura = preparaApertura(b.ambiente)
    assert.deepEqual(await apertura.completa({ ok: true, dove }), { ok: true, dove })
    assert.equal(b.chiusure(), 1)
    assert.deepEqual(b.urls, [])
  }
})

test('an unavailable or deleted source leaves no blank tab or invented destination', async () => {
  const b = browser()
  const apertura = preparaApertura(b.ambiente)
  const r = { ok: false, errore: 'Source no longer exists.' } as const
  assert.deepEqual(await apertura.completa(r), r)
  assert.equal(b.chiusure(), 1)
  assert.deepEqual(b.urls, [])
})

test('untrusted source URLs never execute schemes or credentials', async () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', '//example.com', 'https://name:secret@example.com']) {
    assert.equal(linkNavigabile(url), null)
    const b = browser()
    assert.equal((await preparaApertura(b.ambiente).completa({ ok: true, dove: 'pagina', url })).ok, false)
    assert.deepEqual(b.urls, [])
    assert.equal(b.chiusure(), 1)
  }
})

test('blocked or manually closed browser tab reports failure instead of claiming opened', async () => {
  const bloccata = preparaApertura({ prenota: () => null })
  assert.equal((await bloccata.completa({ ok: true, dove: 'pagina', url: 'https://example.com' })).ok, false)
  const b = browser()
  const chiusa = preparaApertura(b.ambiente)
  b.finestra.closed = true
  assert.equal((await chiusa.completa({ ok: true, dove: 'pagina', url: 'https://example.com' })).ok, false)
  assert.deepEqual(b.urls, [])
})

test('browsers that block new tabs can still reach the source in the current tab', async () => {
  const urls: string[] = []
  const apertura = preparaApertura({ prenota: () => null, apriQui: url => { urls.push(url) } })
  assert.equal((await apertura.completa({ ok: true, dove: 'pagina', url: 'https://github.com/example/myynd/issues/12' })).ok, true)
  assert.deepEqual(urls, ['https://github.com/example/myynd/issues/12'])
})

test('a native browser failure is reported, and rejected requests can be cleaned up', async () => {
  const desktop = preparaApertura({ apriFuori: async () => { throw new Error('unavailable') } })
  assert.equal((await desktop.completa({ ok: true, dove: 'pagina', url: 'https://example.com' })).ok, false)
  const b = browser()
  const apertura = preparaApertura(b.ambiente)
  apertura.annulla()
  apertura.annulla()
  assert.equal(b.chiusure(), 1)
})
