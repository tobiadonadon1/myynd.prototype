// Un .ico da una manciata di PNG, senza dipendenze.
//
// Il formato è banale: un'intestazione di sei byte, una voce di sedici byte
// per immagine, poi le immagini una dietro l'altra. Da Vista in poi Windows
// accetta PNG dentro l'.ico così come sono, e un PNG a 256 pixel è quello
// che mostra nelle icone grandi. Non serve una libreria per questo.
//
//   node build/ico.cjs fuori.ico 16.png 32.png 48.png 64.png 128.png 256.png
const { readFileSync, writeFileSync } = require('node:fs')

function larghezza(png) {
  // il chunk IHDR è sempre il primo: larghezza e altezza ai byte 16 e 20
  if (png.toString('ascii', 1, 4) !== 'PNG') throw new Error('non è un PNG')
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) }
}

function ico(pngs) {
  const testa = Buffer.alloc(6)
  testa.writeUInt16LE(0, 0)          // riservato
  testa.writeUInt16LE(1, 2)          // 1 = icona (2 sarebbe un cursore)
  testa.writeUInt16LE(pngs.length, 4)

  const voci = []
  let scarto = 6 + 16 * pngs.length
  for (const png of pngs) {
    const { w, h } = larghezza(png)
    if (w > 256 || h > 256) throw new Error(`un .ico arriva a 256 pixel, questo è ${w}×${h}`)
    const v = Buffer.alloc(16)
    v.writeUInt8(w === 256 ? 0 : w, 0)   // 0 vuol dire 256
    v.writeUInt8(h === 256 ? 0 : h, 1)
    v.writeUInt8(0, 2)                   // niente tavolozza
    v.writeUInt8(0, 3)                   // riservato
    v.writeUInt16LE(1, 4)                // piani di colore
    v.writeUInt16LE(32, 6)               // bit per pixel
    v.writeUInt32LE(png.length, 8)
    v.writeUInt32LE(scarto, 12)
    voci.push(v)
    scarto += png.length
  }
  return Buffer.concat([testa, ...voci, ...pngs])
}

module.exports = { ico }

if (require.main === module) {
  const [fuori, ...dentro] = process.argv.slice(2)
  if (!fuori || !dentro.length) {
    console.error('uso: node build/ico.cjs fuori.ico uno.png [altri.png…]')
    process.exit(2)
  }
  const pngs = dentro.map(p => readFileSync(p))
  // dal più piccolo al più grande: è l'ordine che Windows si aspetta
  pngs.sort((a, b) => larghezza(a).w - larghezza(b).w)
  writeFileSync(fuori, ico(pngs))
  console.log(`${fuori}: ${pngs.length} immagini (${pngs.map(p => larghezza(p).w).join(', ')})`)
}
