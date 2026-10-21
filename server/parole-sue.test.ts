// Le sue parole: solo quello che ha scritto lui, mai un post di x-engine.
//
//   node --import ./build/test-profile.mjs --test server/parole-sue.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-parole-sue-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Tobia' }))
const store = await import('./store.ts')
const sue = await import('./parole-sue.ts')
const lavoroDati = await import('./lavoro-dati.ts')

after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

test('una riga buona è sua: niente codice, niente riassunti di sessione, niente comandi', () => {
  assert.ok(sue.buona('I would like us to think through the onboarding as well, because something is not working.'))
  assert.ok(!sue.buona('ok try again'), 'troppo corta per dire come scrive')
  assert.ok(!sue.buona('This session is being continued from a previous conversation that ran out of context.'))
  assert.ok(!sue.buona('const x = await fetch(url).then(r => r.json()) and then return it'))
  assert.ok(!sue.buona('/goal check every bug like this one in the whole code base please'))
  assert.ok(!sue.buona("Run H-Brain's production ingestion and action check: tell me more"), 'il titolo di una carta di Myynd non è suo')
  assert.equal(sue.senzaTesta('About «Video script, Evermute deck.docx»: this is not important'), 'this is not important')
})

test('i campioni girano fra le fonti, il più recente prima, senza doppioni, e il blocco serve solo con almeno tre', () => {
  const p = (testo: string, dove: import('./parole-sue.ts').Dove) => ({ testo, dove, quando: '' })
  const scelti = sue.paroleSue(4, [
    [p('These are not bad, they are just very broad and they miss what works on X.', 'chat'), p('Yeah no need to change anything, this is my focus and what I do.', 'chat')],
    [p('It looks like there is a problem with Posthog that does not track the conversions.', 'assistente')],
    [p('Hello, let us call, I am curious to see what you are doing these days.', 'mail'), p('Hello, let us call, I am curious to see what you are doing these days.', 'mail')]
  ])
  assert.deepEqual(scelti.map(s => s.dove), ['chat', 'assistente', 'mail', 'chat'])
  const blocco = sue.bloccoVoce(true, scelti)
  assert.match(blocco, /his own words, typed by him/)
  assert.match(blocco, /\(email\) Hello, let us call/)
  assert.doesNotMatch(blocco, /[—–]/)
  assert.equal(sue.bloccoVoce(true, scelti.slice(0, 2)), '')
})

test('le mail mandate sono solo mail: i post di X segnati «inviato» non sono la sua voce', () => {
  const ora = new Date().toISOString()
  store.salvaDocumenti([
    { id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'Re: Hi Tobia', corpo: 'Hello, let us call, I am curious to see what you are doing.', quando: ora, inviato: true } as never,
    { id: 'x:mio:1', fonte: 'x', tipo: 'post', titolo: 'a retry is just a failure', corpo: 'a retry is just a failure you were allowed to hide.', quando: ora, inviato: true } as never
  ])
  assert.deepEqual(lavoroDati.ultimiInviati(30).map(d => d.id), ['posta:INBOX:1'])
  assert.ok(!sue.paroleSue().some(s => /a retry is just a failure/.test(s.testo)))
})
