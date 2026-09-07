// La scorciatoia dell'app, nei due versi.
//
// Da Electron a una persona: `CommandOrControl+Shift+M` si legge ⇧⌘M sul Mac
// e «Ctrl+Shift+M» altrove. Da una persona a Electron: il tasto premuto
// diventa una combinazione scritta come la vuole lui. Sono quattro righe di
// tabella, ed è esattamente il posto in cui un ⌥M registrato come «µ» resta
// invisibile finché qualcuno non prova la scorciatoia e trova che non fa
// niente.
//
//   node --test src/desktop.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceleratore, desktop, simboli, soloModificatore, type Tasto } from './desktop.ts'

const tasto = (p: Partial<Tasto>): Tasto => ({
  key: '', code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...p
})

test('senza finestra il ponte non c’è', () => {
  assert.equal(desktop(), null)
})

test('sul Mac si legge come nei menù di sistema, nell’ordine di Apple', () => {
  assert.equal(simboli('CommandOrControl+Shift+M', 'darwin'), '⇧⌘M')
  // qualunque sia l'ordine in cui è scritta
  assert.equal(simboli('Shift+Command+M', 'darwin'), '⇧⌘M')
  assert.equal(simboli('Cmd+Alt+Ctrl+Shift+K', 'darwin'), '⌃⌥⇧⌘K')
  assert.equal(simboli('Control+Alt+Space', 'darwin'), '⌃⌥␣')
  assert.equal(simboli('CommandOrControl+Return', 'darwin'), '⌘↩')
  assert.equal(simboli('Alt+F5', 'darwin'), '⌥F5')
  assert.equal(simboli('CommandOrControl+Shift+m', 'darwin'), '⇧⌘M')
})

test('altrove si scrive per esteso, con il più in mezzo', () => {
  assert.equal(simboli('CommandOrControl+Shift+M', 'win32'), 'Ctrl+Shift+M')
  assert.equal(simboli('Super+Alt+Space', 'linux'), 'Win+Alt+Space')
  assert.equal(simboli('Shift+Alt+Ctrl+K', 'win32'), 'Ctrl+Alt+Shift+K')
  assert.equal(simboli('Control+Alt+Delete', 'win32'), 'Ctrl+Alt+Delete')
})

test('il tasto premuto diventa una scorciatoia di Electron', () => {
  assert.equal(acceleratore(tasto({ key: 'M', code: 'KeyM', metaKey: true, shiftKey: true }), 'darwin'), 'CommandOrControl+Shift+M')
  // ⌥M sul Mac dà «µ»: si legge il tasto fisico, non il carattere
  assert.equal(acceleratore(tasto({ key: 'µ', code: 'KeyM', metaKey: true, altKey: true }), 'darwin'), 'CommandOrControl+Alt+M')
  // su Windows il tasto principale è Ctrl, e ⊞ è Super
  assert.equal(acceleratore(tasto({ key: '1', code: 'Digit1', ctrlKey: true }), 'win32'), 'CommandOrControl+1')
  assert.equal(acceleratore(tasto({ key: 'k', code: 'KeyK', metaKey: true }), 'win32'), 'Super+K')
  // ⌃ sul Mac è un modificatore a sé
  assert.equal(acceleratore(tasto({ key: 'k', code: 'KeyK', ctrlKey: true }), 'darwin'), 'Control+K')
  assert.equal(acceleratore(tasto({ key: ' ', code: 'Space', altKey: true }), 'darwin'), 'Alt+Space')
  assert.equal(acceleratore(tasto({ key: 'F5', code: 'F5', metaKey: true }), 'darwin'), 'CommandOrControl+F5')
  assert.equal(acceleratore(tasto({ key: 'ArrowUp', code: 'ArrowUp', metaKey: true, altKey: true }), 'darwin'), 'CommandOrControl+Alt+Up')
})

test('un modificatore da solo aspetta, e ⇧ da solo non basta', () => {
  assert.ok(soloModificatore('Meta'))
  assert.ok(soloModificatore('Shift'))
  assert.ok(!soloModificatore('m'))
  assert.equal(acceleratore(tasto({ key: 'Meta', code: 'MetaLeft', metaKey: true }), 'darwin'), null)
  // ⇧M sarebbe la M maiuscola di ogni programma
  assert.equal(acceleratore(tasto({ key: 'M', code: 'KeyM', shiftKey: true }), 'darwin'), null)
  assert.equal(acceleratore(tasto({ key: 'm', code: 'KeyM' }), 'darwin'), null)
  // un tasto che Electron non sa nominare
  assert.equal(acceleratore(tasto({ key: 'AudioVolumeUp', code: 'AudioVolumeUp', metaKey: true }), 'darwin'), null)
})

test('quello che si registra si rilegge uguale', () => {
  const acc = acceleratore(tasto({ key: 'µ', code: 'KeyM', metaKey: true, altKey: true, shiftKey: true }), 'darwin')!
  assert.equal(simboli(acc, 'darwin'), '⌥⇧⌘M')
  const win = acceleratore(tasto({ key: 'M', code: 'KeyM', ctrlKey: true, shiftKey: true }), 'win32')!
  assert.equal(simboli(win, 'win32'), 'Ctrl+Shift+M')
})
