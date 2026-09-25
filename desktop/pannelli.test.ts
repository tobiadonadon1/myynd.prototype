import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PANNELLI_AMMESSI, PANNELLO_AUTOMAZIONE, PANNELLO_CALENDARI, PANNELLO_DISCO } from './pannelli.ts'

const leggi = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
/** La stringa del pannello del disco, com'è scritta in un file. */
const disco = (testo: string) => testo.match(/'(x-apple\.systempreferences:[^']*Privacy_AllFiles)'/)?.[1]

test('il pannello del disco è uguale alla lettera nel guscio, nel server e nella pagina', () => {
  assert.equal(disco(leggi('./pannelli.ts')), PANNELLO_DISCO)
  assert.equal(disco(leggi('../server/connettori/accesso.ts')), PANNELLO_DISCO)
  assert.equal(disco(leggi('../src/components/forms.tsx')), PANNELLO_DISCO)
})

test('il guscio apre esattamente i tre pannelli, e nessun altro indirizzo di sistema', () => {
  assert.deepEqual([...PANNELLI_AMMESSI].sort(), [PANNELLO_AUTOMAZIONE, PANNELLO_CALENDARI, PANNELLO_DISCO].sort())
  assert.equal(PANNELLI_AMMESSI.has('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'), false)
  assert.equal(PANNELLI_AMMESSI.has('x-apple.systempreferences:com.apple.preference.security'), false)
  assert.equal(PANNELLI_AMMESSI.has(PANNELLO_DISCO + '&altro'), false)
  // il server dice gli stessi tre
  const server = leggi('../server/connettori/accesso.ts')
  for (const p of [PANNELLO_CALENDARI, PANNELLO_AUTOMAZIONE]) assert.ok(server.includes(`'${p}'`), p)
})

test('main.ts apre i pannelli solo dall\'insieme, e non ha più una sua copia dell\'indirizzo', () => {
  const main = leggi('./main.ts')
  assert.ok(main.includes('PANNELLI_AMMESSI.has(String(url))'))
  assert.equal(disco(main), undefined)
  assert.ok(main.includes("ipcMain.handle('myynd:riavvia'"))
  assert.ok(leggi('./preload.cjs').includes("riavvia: () => chiedi('myynd:riavvia')"))
  assert.ok(leggi('./server.ts').includes('MYYND_VERSIONE: app.getVersion()'))
})
