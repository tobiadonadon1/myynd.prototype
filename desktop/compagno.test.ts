// Il mostriciattolo in 3D: la pagina si carica sotto la sua CSP, three c'è,
// è acceso di serie, e costa poco.
//
//   node --test desktop/compagno.test.ts
//
// Il disegno vero si guarda con `prove/compagno-foto.cjs`, in una finestra
// nascosta; qui si controlla quello che si può leggere senza Electron.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const leggi = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
const pagina = leggi('./compagno.html')
const gesti = leggi('./compagno.js')
const scena = leggi('./compagno-scena.js')
const guscio = leggi('./compagno.ts')
const main = leggi('./main.ts')
const preload = leggi('./compagno-preload.cjs')

test('la mappa degli import passa la CSP: la sua impronta è quella scritta', () => {
  const mappa = /<script type="importmap">([\s\S]*?)<\/script>/.exec(pagina)
  assert.ok(mappa, 'c’è una mappa degli import')
  const impronta = createHash('sha256').update(mappa[1]).digest('base64')
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(pagina)?.[1] ?? ''
  assert.match(csp, new RegExp(`script-src 'self' 'sha256-${impronta.replace(/[+/=]/g, c => `\\${c}`)}'`), 'rifare l’impronta dopo aver cambiato la mappa')
  assert.doesNotMatch(csp, /unsafe-eval|unsafe-inline'[^;]*script|https?:/, 'niente da fuori, niente eval')
})

test('three sta dove la mappa dice, e nessuno lo prende da una CDN', () => {
  const { imports } = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(pagina)![1]) as { imports: Record<string, string> }
  assert.ok(existsSync(fileURLToPath(new URL(imports.three, import.meta.url))), imports.three)
  const pacchetto = JSON.parse(leggi('../package.json')) as { dependencies: Record<string, string> }
  // fra le dipendenze di produzione: electron-builder porta nel pacchetto solo quelle
  assert.ok(pacchetto.dependencies.three, 'three fra le dependencies')
  for (const s of [pagina, gesti, scena]) assert.doesNotMatch(s, /https?:\/\/(?!www\.w3)/)
  assert.match(gesti, /import \{ creaScena \} from '\.\/compagno-scena\.js'/)
  const importati = [...scena.matchAll(/(?:from|import\()\s*'([^']+)'/g)].map(m => m[1])
  assert.deepEqual([...new Set(importati)].sort(), ['three', 'three/addons/loaders/GLTFLoader.js'])
})

test('acceso di serie, una volta riacceso per chi l’aveva spento, e il suo interruttore lo segue', () => {
  assert.match(guscio, /export function acceso\(\): boolean \{\s*return impostazioni\.leggi\(\)\.compagno\?\.acceso !== false/)
  const prepara = guscio.slice(guscio.indexOf('export function prepara('), guscio.indexOf('export function accendi('))
  assert.match(prepara, /compagno3d !== true\) impostazioni\.scrivi\(\{ compagno: \{ \.\.\.s\.compagno, acceso: true \}, compagno3d: true \}\)/)
  assert.match(prepara, /if \(acceso\(\) && !attuale\(\)\) crea\(\)/)
  assert.match(main, /ipcMain\.handle\('myynd:compagno-acceso', \(\) => compagno\.acceso\(\)\)/)
})

test('un clic apre il fumetto accanto a lui, e spostandolo il fumetto lo segue', () => {
  assert.match(guscio, /ipcMain\.on\('compagno:premuto', e => \{ const w = suo\(e\); if \(w\) azioni\?\.parla\(corpoDelCompagno\(w\.getBounds\(\)\)\) \}\)/)
  assert.match(main, /parla: r => \{ if \(!richiamo\.alternaAccanto\(r\)\) finestra\.alterna\(\) \}/)
  assert.match(main, /mosso: r => richiamo\.segui\(r\)/)
})

test('il mouse passa attraverso il quadrato, tranne sopra il corpo', () => {
  assert.match(guscio, /w\.setIgnoreMouseEvents\(true, \{ forward: true \}\)/)
  assert.match(guscio, /ipcMain\.on\('compagno:sopra'[\s\S]{0,120}setIgnoreMouseEvents\(on !== true, \{ forward: true \}\)/)
  assert.ok(preload.includes("'compagno:sopra'"))
})

test('costa poco: sguardo al massimo 15 volte al secondo e solo visibile, fotogrammi al massimo 30 e mai nascosto', () => {
  const ogni = Number(/const OGNI_SGUARDO = (\d+)/.exec(guscio)?.[1])
  assert.ok(ogni >= 1000 / 15, `lo sguardo ogni ${ogni} ms`)
  assert.match(guscio, /w\.on\('hide', fermaSguardo\)/)
  assert.match(guscio, /if \(!w \|\| !w\.isVisible\(\)\) \{ fermaSguardo\(\); return \}/)
  const passo = /const passo = \(\) => 1000 \/ \(([^\n]+)\)\n/.exec(scena)?.[1] ?? ''
  const numeri = [...passo.matchAll(/(?<![.\d])\d+(?![.\d])/g)].map(m => Number(m[0]))
  assert.ok(numeri.length && Math.max(...numeri) <= 30, `fotogrammi al secondo: ${passo}`)
  assert.match(scena, /if \(!prova && document\.hidden\) return/)
  assert.match(scena, /prefers-reduced-motion: reduce/)
})

test('la pastiglia: due bottoni, scrivi apre il fumetto e parla chiede anche la dettatura', () => {
  const richiamo = leggi('./richiamo.ts')
  for (const c of ['compagno:scrivi', 'compagno:detta']) {
    assert.ok(preload.includes(`'${c}'`), `preload: ${c}`)
    assert.ok(guscio.includes(`ipcMain.on('${c}'`), `guscio: ${c}`)
  }
  assert.match(main, /scrivi: r => \{ if \(!richiamo\.mostraAccanto\(r\)\) finestra\.alterna\(\) \}/)
  assert.match(main, /detta: r => \{ if \(!richiamo\.dettaAccanto\(r\)\) finestra\.alterna\(\) \}/)
  const detta = richiamo.slice(richiamo.indexOf('export function dettaAccanto('), richiamo.indexOf('/** Dove va:'))
  // la dettatura si chiede solo al fumetto che ha davvero il fuoco
  assert.match(detta, /w\.isFocused\(\)[\s\S]*Menu\.sendActionToFirstResponder\('startDictation:'\)/)
  // i bottoni hanno le parole, nella lingua dell'app
  for (const id of ['scrivi', 'parla']) assert.match(pagina, new RegExp(`<button id="${id}" type="button" title="[^"]+" aria-label="[^"]+">`))
  assert.match(guscio, /testi: \{ scrivi: t\('Scrivi a Myynd'\), parla: t\('Parla con Myynd'\) \}/)
  const lingua = leggi('./lingua.ts')
  assert.match(lingua, /'Scrivi a Myynd': 'Write to Myynd'/)
  assert.match(lingua, /'Parla con Myynd': 'Talk to Myynd'/)
  // e la pastiglia sta dentro la finestra, che è cresciuta per tenerla
  assert.match(guscio, /width: LATO_COMPAGNO, height: ALTO_COMPAGNO/)
  const cima = Number(/#pastiglia \{[\s\S]*?top: (\d+)px/.exec(pagina)?.[1])
  assert.ok(cima + 36 <= 188, `la pastiglia finisce dentro la finestra (${cima})`)
})

test('dormendo non diventa grigio, e la tela è nitida anche a 1x', () => {
  assert.doesNotMatch(pagina, /\.spenta[^{]*\{[^}]*(opacity|filter)/)
  assert.match(scena, /mix\(diffuseColor\.rgb, vec3\(grigio\), 0\.1 \* uSonno\)/)
  assert.match(scena, /setPixelRatio\(Math\.min\(Math\.max\(window\.devicePixelRatio \|\| 1, 2\), 3\)\)/)
})
