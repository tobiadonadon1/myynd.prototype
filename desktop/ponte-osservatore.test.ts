// Il ponte dell'osservatore e del mostriciattolo sta in tutti e cinque i posti:
// il canale nel guscio, il preload, il tipo della pagina, la prova dell'app,
// e questa prova. Si leggono i sorgenti: niente Electron qui.
//
//   node --test desktop/ponte-osservatore.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leggi = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const main = leggi('./main.ts')
const preload = leggi('./preload.cjs')
const tipi = leggi('../src/desktop.ts')
const prova = leggi('../prove/app.mjs')
const compagnoPreload = leggi('./compagno-preload.cjs')
const compagno = leggi('./compagno.ts')

const CANALI = [
  ['permessoTitoli', 'myynd:osservatore-permesso'],
  ['chiediPermessoTitoli', 'myynd:osservatore-chiedi-permesso'],
  ['apriImpostazioniTitoli', 'myynd:osservatore-impostazioni'],
  ['acceso', 'myynd:compagno-acceso'],
  ['accendi', 'myynd:compagno-accendi']
]

test('ogni metodo del ponte ha il suo canale nel preload e il suo gestore nel guscio', () => {
  for (const [metodo, canale] of CANALI) {
    assert.match(preload, new RegExp(`${metodo}: [^\\n]*chiedi\\('${canale}'`), metodo)
    assert.match(main, new RegExp(`ipcMain\\.handle\\('${canale}'`), canale)
    assert.match(tipi, new RegExp(`${metodo}\\(`), `src/desktop.ts: ${metodo}`)
  }
  assert.match(tipi, /osservatore\?: \{ permessoTitoli\(\): Promise<boolean>; chiediPermessoTitoli\(\): Promise<boolean>; apriImpostazioniTitoli\(\): Promise<void> \}/)
  assert.match(tipi, /compagno\?: \{ acceso\(\): Promise<boolean>; accendi\(on: boolean\): Promise<void> \}/)
  assert.match(prova, /'osservatore', 'compagno'/)
})

test('la schermata delle Impostazioni è un indirizzo fisso, e apri-fuori non cambia', () => {
  assert.match(main, /PANNELLO_ACCESSIBILITA = 'x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_Accessibility'/)
  assert.match(main, /ipcMain\.handle\('myynd:osservatore-impostazioni', async \(\) => \{\n\s+if \(MAC\) await shell\.openExternal\(PANNELLO_ACCESSIBILITA\)/)
  const apriFuori = main.slice(main.indexOf("ipcMain.handle('myynd:apri-fuori'"), main.indexOf("ipcMain.handle('myynd:mostra'"))
  assert.doesNotMatch(apriFuori, /ACCESSIBILITA/)
})

test('la richiesta di sistema passa solo da chiediPermesso, una volta per versione', () => {
  const chiamate = main.match(/isTrustedAccessibilityClient\(true\)/g) ?? []
  assert.equal(chiamate.length, 1)
  const corpo = main.slice(main.indexOf('function chiediPermesso()'), main.indexOf('/** Tutti i canali del ponte'))
  assert.match(corpo, /accessibilitaChiesta !== versione/)
  assert.match(corpo, /impostazioni\.scrivi\(\{ accessibilitaChiesta: versione \}\)[\s\S]*isTrustedAccessibilityClient\(true\)/)
})

test('il mostriciattolo: i canali della pagina esistono da tutti e due i lati', () => {
  for (const c of ['compagno:premuto', 'compagno:menu', 'compagno:trascina', 'compagno:lascia', 'compagno:pronto']) {
    assert.ok(compagnoPreload.includes(`'${c}'`), `preload: ${c}`)
    assert.ok(compagno.includes(`ipcMain.on('${c}'`), `guscio: ${c}`)
  }
  assert.ok(compagno.includes("send('compagno:stato'"))
  assert.doesNotMatch(compagno.replace(/\/\/.*$/gm, ''), /\.focus\(\)|\.show\(\)|app\.focus/, 'il mostriciattolo non prende mai il fuoco')
})
