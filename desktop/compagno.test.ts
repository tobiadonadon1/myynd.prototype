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


test('un clic su di lui (o «scrivi») apre e chiude la casella sotto di lui, e spostandolo lo segue', () => {
  assert.match(guscio, /ipcMain\.on\('compagno:premuto', e => \{ const w = suo\(e\); if \(w\) azioni\?\.parla\(corpo\(w\)\) \}\)/)
  assert.match(guscio, /ipcMain\.on\('compagno:scrivi', e => \{ const w = suo\(e\); if \(w\) azioni\?\.parla\(corpo\(w\)\) \}\)/)
  assert.match(main, /parla: r => \{ if \(!richiamo\.alternaSotto\(r, 'scrivi'\)\) finestra\.alterna\(\) \}/)
  assert.match(main, /impostazioni: r => \{ if \(!richiamo\.alternaSotto\(r, 'impostazioni'\)\) finestra\.alterna\(\) \}/)
  assert.match(main, /mosso: r => richiamo\.segui\(r\)/)
  const richiamo = leggi('./richiamo.ts')
  const alterna = richiamo.slice(richiamo.indexOf('export function alternaSotto('), richiamo.indexOf('export function segui('))
  // aperta la stessa: un altro clic la chiude
  assert.match(alterna, /if \(visibile\(\) && sotto && pannello === quale\) \{ nascondi\(\); return true \}/)
})

test('la casella si chiude: Esc e la × dalla pagina, un clic altrove dal blur', () => {
  const richiamo = leggi('./richiamo.ts')
  const pagina = readFileSync(fileURLToPath(new URL('../src/richiamo/Richiamo.tsx', import.meta.url)), 'utf8')
  assert.match(pagina, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); chiudi\(\) \}/)
  assert.match(pagina, /\{accanto && <Chiudi chiudi=\{chiudi\} \/>\}/)
  assert.match(richiamo, /w\.on\('blur', \(\) => \{[\s\S]*?via\(false\)/)
  // niente più dettatura
  assert.doesNotMatch(richiamo, /startDictation|dettaAccanto/)
  assert.doesNotMatch(pagina, /fn due volte/)
})

test('la casella si tira dal bordo e la misura resta; la barra e le impostazioni no', () => {
  const richiamo = leggi('./richiamo.ts')
  assert.match(richiamo, /w\.on\('will-resize', \(\) => \{ if \(sotto && pannello === 'scrivi'\) tirando = true \}\)/)
  assert.match(richiamo, /impostazioni\.scrivi\(\{ casella: \{ larghezza: b\.width, altezza: b\.height \} \}\)/)
  assert.match(richiamo, /const si = !!sotto && pannello === 'scrivi'\s*\n\s*w\.setResizable\(si\)/)
  // tirata dalla persona: la pagina che misura non la rimpicciolisce più
  assert.match(richiamo, /if \(tirando \|\| tirata\) return/)
})

test('il mouse passa attraverso la finestra, tranne sopra il corpo e la pastiglia', () => {
  assert.match(guscio, /w\.setIgnoreMouseEvents\(true, \{ forward: true \}\)/)
  assert.match(guscio, /ipcMain\.on\('compagno:sopra'[\s\S]{0,120}setIgnoreMouseEvents\(on !== true, \{ forward: true \}\)/)
  assert.ok(preload.includes("'compagno:sopra'"))
})

test('costa poco: sguardo al massimo 15 volte al secondo, solo visibile e solo se deve seguire, fotogrammi al massimo 30 e mai nascosto', () => {
  const ogni = Number(/const OGNI_SGUARDO = (\d+)/.exec(guscio)?.[1])
  assert.ok(ogni >= 1000 / 15, `lo sguardo ogni ${ogni} ms`)
  assert.match(guscio, /w\.on\('hide', fermaSguardo\)/)
  assert.match(guscio, /if \(!w \|\| !w\.isVisible\(\) \|\| !scelte\(\)\.segue\) \{ fermaSguardo\(\); return \}/)
  const passo = /const passo = \(\) => 1000 \/ \(([^\n]+)\)\n/.exec(scena)?.[1] ?? ''
  const numeri = [...passo.matchAll(/(?<![.\d])\d+(?![.\d])/g)].map(m => Number(m[0]))
  assert.ok(numeri.length && Math.max(...numeri) <= 30, `fotogrammi al secondo: ${passo}`)
  assert.match(scena, /if \(!prova && document\.hidden\) return/)
  assert.match(scena, /prefers-reduced-motion: reduce/)
  // la pelliccia: una parte, un disegno (gli strati sono istanze)
  assert.match(scena, /g\.instanceCount = STRATI/)
})

test('la pastiglia: scrivi e impostazioni, con le parole nella lingua dell’app', () => {
  for (const c of ['compagno:scrivi', 'compagno:impostazioni']) {
    assert.ok(preload.includes(`'${c}'`), `preload: ${c}`)
    assert.ok(guscio.includes(`ipcMain.on('${c}'`), `guscio: ${c}`)
  }
  assert.doesNotMatch(pagina + preload + guscio, /compagno:detta|id="parla"/)
  for (const id of ['scrivi', 'impostazioni']) assert.match(pagina, new RegExp(`<button id="${id}" type="button" title="[^"]+" aria-label="[^"]+">`))
  assert.match(guscio, /testi: \{ scrivi: t\('Scrivi a Myynd'\), impostazioni: t\('Impostazioni'\) \}/)
  const lingua = leggi('./lingua.ts')
  assert.match(lingua, /'Scrivi a Myynd': 'Write to Myynd'/)
  assert.match(lingua, /'Impostazioni': 'Settings'/)
  // e la pastiglia sta dentro la finestra, che è cresciuta per tenerla
  assert.match(guscio, /width: m\.lato, height: m\.alto/)
  const cima = Number(/#pastiglia \{[\s\S]*?top: (\d+)px/.exec(pagina)?.[1])
  assert.ok(cima + 36 <= 188, `la pastiglia finisce dentro la finestra (${cima})`)
})

test('le sue impostazioni: taglia e sguardo si salvano, e tolto dalla scrivania lo rimette la barra dei menu', () => {
  assert.match(main, /ipcMain\.handle\('myynd:compagno-scelte', \(\) => compagno\.scelte\(\)\)/)
  assert.match(main, /ipcMain\.handle\('myynd:compagno-scegli'/)
  assert.match(main, /compagno: \{ tolto: \(\) => !compagno\.acceso\(\), mostra: \(\) => compagno\.accendi\(true\) \}/)
  const imposta = guscio.slice(guscio.indexOf('export function imposta('), guscio.indexOf('export function prepara('))
  assert.match(imposta, /impostazioni\.scrivi\(\{ compagno: \{ \.\.\.impostazioni\.leggi\(\)\.compagno, acceso: acceso\(\), taglia, segue, giocoso \} \}\)/)
  assert.match(imposta, /w\.webContents\.setZoomFactor\(m\.scala\)/)
})

test('dormendo non diventa grigio, e la tela è nitida anche a 1x', () => {
  assert.doesNotMatch(pagina, /\.spenta[^{]*\{[^}]*(opacity|filter)/)
  assert.match(scena, /mix\(diffuseColor\.rgb, vec3\(grigio\), 0\.1 \* uSonno\)/)
  assert.match(scena, /const densita = \(\) => Math\.min\(Math\.max\(\(window\.devicePixelRatio \|\| 1\) \* 1\.5, 2\), 3\)/)
})

test('il personaggio del disegno: le sue ossa, e le espressioni', () => {
  const costruisci = scena.slice(scena.indexOf('export function costruisciMostriciattolo('), scena.indexOf('export async function caricaModello('))
  // busto, testa, spalle con i polsi, piedi, antenne: ognuno col suo perno
  assert.match(costruisci, /return \{ radice, salto, corpo, parti: \{ busto, testa, occhi, antenne, braccia, piedi, bocca: sorriso \} \}/)
  assert.match(scena, /spalla\.userData = \{ polso \}/)
  // occhi aperti, ^ quando ride, chiusi quando dorme
  assert.match(scena, /arco\.scale\.y = P\.occhi === 'chiusi' \? -1 : 1/)
  assert.match(scena, /if \(sonno > 0\.5 && P\.occhi === 'aperti'\) P\.occhi = 'chiusi'/)
  // le setole vanno dal quasi nero all'arancio acceso
  assert.match(scena, /const SETOLE_BUIE = '#[0-9A-F]{6}'/)
  assert.match(scena, /const SETOLE_VIVE = '#[0-9A-F]{6}'/)
})

test('i gesti: salto, giravolta, risatina e passetto; da solo solo se giocoso, mai col movimento ridotto', () => {
  for (const g of ['salto', 'giravolta', 'ridacchia', 'passetto']) assert.ok(scena.includes(`g.nome === '${g}'`), g)
  // quelli che vengono da soli: mai nelle prove, mai col movimento ridotto, mai mentre dorme
  assert.match(scena, /if \(!prova && !calmo && !gesto && !tocco && stato\.guarda\) \{/)
  assert.match(scena, /else if \(stato\.giocoso && tempo > prossimoGioco\) \{/)
  // col movimento ridotto niente salti né giravolte, nemmeno a comando; la risatina sì
  assert.match(scena, /if \(calmo && nome !== 'ridacchia'\) return false/)
  // qualcosa aspetta: un salto
  assert.match(scena, /if \(stato\.attesa && !primaAttesa\) comincia\('salto'\)/)
  // il doppio clic è una giravolta; il clic singolo aspetta di sapere se ne arriva un secondo
  assert.match(gesti, /scena\?\.gesto\('giravolta'\)/)
  assert.match(gesti, /clicInAttesa = setTimeout\(\(\) => \{ clicInAttesa = 0; c\.premuto\(\) \}, DOPPIO\)/)
  // gli si scrive dalla casella: ridacchia
  const richiamo = readFileSync(fileURLToPath(new URL('../src/richiamo/Richiamo.tsx', import.meta.url)), 'utf8')
  assert.match(richiamo, /if \(accanto\) ponte\?\.inviato\?\.\(\)/)
  assert.match(main, /ipcMain\.on\('myynd:richiamo-inviato', \(\) => compagno\.gesto\('ridacchia'\)\)/)
  assert.ok(preload.includes("'compagno:gesto'"))
  // giocoso si sceglie nelle sue impostazioni e arriva alla pagina con lo stato
  assert.match(guscio, /giocoso: scelte\(\)\.giocoso,/)
  assert.match(gesti, /giocoso: giocosoOra/)
})
