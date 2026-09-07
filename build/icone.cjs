// Le icone dell'app, da public/marchio.svg.
//
// Si disegna il vettore a ogni misura invece di rimpicciolire un PNG grande:
// a 16 pixel un marchio ridimensionato è una macchia, uno disegnato apposta
// no. Il rasterizzatore è quello di macOS (`qlmanage`, lo stesso che fa le
// anteprime di Quick Look), che rende l'SVG con l'alfa intatto. Quindi questo
// script gira solo su un Mac — che è anche l'unico posto dove gira `iconutil`.
//
// Il marchio nell'SVG tocca i bordi. Un'icona del Dock vuole aria intorno,
// altrimenti accanto alle altre sembra gonfia: si allarga il viewBox in modo
// che il disegno occupi l'82% del quadrato, come vuole la griglia di Apple.
//
//   node build/icone.cjs      → build/icon.png (1024), build/icon.icns, build/icon.ico,
//                               desktop/icone/tray.ico e trayAttesa.ico (la barra di Windows)
const { execFileSync } = require('node:child_process')
const { mkdtempSync, readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { basename, join } = require('node:path')
const { ico } = require('./ico.cjs')

const radice = join(__dirname, '..')
const sorgente = readFileSync(join(radice, 'public', 'marchio.svg'), 'utf8')

// il viewBox originale è un quadrato di 105.55; lo si allarga a 105.55/0.82
// e si sposta l'origine di metà della differenza, così il marchio resta al centro
const vb = /viewBox="([^"]+)"/.exec(sorgente)
if (!vb) throw new Error('public/marchio.svg non ha un viewBox')
const [x, y, w, h] = vb[1].split(/\s+/).map(Number)
const lato = Math.max(w, h) / 0.82
const largo = sorgente.replace(vb[0],
  `viewBox="${x - (lato - w) / 2} ${y - (lato - h) / 2} ${lato} ${lato}"`)

const lavoro = mkdtempSync(join(tmpdir(), 'myynd-icone-'))
const svg = join(lavoro, 'marchio.svg')
writeFileSync(svg, largo)

/** Un PNG di un SVG a `n` pixel di lato; la stessa misura si disegna una volta sola. */
const fatti = new Map()
function png(n, sorgente = svg) {
  const chiave = `${sorgente}:${n}`
  if (fatti.has(chiave)) return fatti.get(chiave)
  const cartella = join(lavoro, `${basename(sorgente, '.svg')}-${n}`)
  mkdirSync(cartella)
  execFileSync('qlmanage', ['-t', '-s', String(n), '-o', cartella, sorgente], { stdio: 'ignore' })
  const fuori = join(cartella, 'marchio.png')
  renameSync(join(cartella, `${basename(sorgente)}.png`), fuori)
  fatti.set(chiave, fuori)
  return fuori
}

// — icns: le dieci misure che iconutil pretende, ciascuna disegnata alla sua
const iconset = join(lavoro, 'icon.iconset')
mkdirSync(iconset)
for (const base of [16, 32, 128, 256, 512]) {
  copyFileSync(png(base), join(iconset, `icon_${base}x${base}.png`))
  copyFileSync(png(base * 2), join(iconset, `icon_${base}x${base}@2x.png`))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(__dirname, 'icon.icns')])

// — png: il 1024, che electron-builder usa anche per Linux e come ripiego
copyFileSync(join(iconset, 'icon_512x512@2x.png'), join(__dirname, 'icon.png'))

// — ico: le sei misure classiche di Windows, PNG dentro
const misure = [16, 32, 48, 64, 128, 256]
writeFileSync(join(__dirname, 'icon.ico'), ico(misure.map(n => readFileSync(png(n)))))

// — la barra di Windows: il marchio a colori, senza aria intorno (a 16 pixel
// non ce n'è da regalare), nelle misure che la barra usa dal 100% al 300%.
// La variante «in attesa» ha un puntino in basso a destra: scuro con un
// bordo chiaro, così si vede sulla barra scura e su quella chiara.
const tray = join(lavoro, 'tray.svg')
writeFileSync(tray, sorgente)
const trayAttesa = join(lavoro, 'trayAttesa.svg')
writeFileSync(trayAttesa, sorgente.replace('</svg>',
  '  <circle cx="84" cy="87" r="15" fill="#22271F" stroke="#F2E9DC" stroke-width="6"/>\n</svg>'))
const misureBarra = [16, 20, 24, 32, 48]
const icone = join(radice, 'desktop', 'icone')
writeFileSync(join(icone, 'tray.ico'), ico(misureBarra.map(n => readFileSync(png(n, tray)))))
writeFileSync(join(icone, 'trayAttesa.ico'), ico(misureBarra.map(n => readFileSync(png(n, trayAttesa)))))

rmSync(lavoro, { recursive: true, force: true })
console.log('build/icon.png, build/icon.icns, build/icon.ico, desktop/icone/tray.ico, trayAttesa.ico: fatte da public/marchio.svg')
