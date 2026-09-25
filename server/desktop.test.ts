// Il Mac nella prima lettura (P4): prima i file degli ultimi novanta giorni,
// un tetto di nuovi per giro con la sua bandiera, e la riga che si muove
// mentre legge. Niente di quello rimandato sparisce dall'indice.
//
//   node --test server/desktop.test.ts

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const casa = mkdtempSync(join(tmpdir(), 'myynd-desktop-p4-'))
process.env.MYYND_DATI = join(casa, 'dati')
const store = await import('./store.ts')
const desktop = await import('./connettori/desktop.ts')

const GIORNO = 86_400_000
const cartella = join(casa, 'cartella')
const testo = (i: number) => `Appunto numero ${i} sul progetto del sito nuovo, con abbastanza parole da essere letto davvero.`

function file(nome: string, giorni: number) {
  const p = join(cartella, nome)
  writeFileSync(p, testo(nome.length))
  const quando = new Date(Date.now() - giorni * GIORNO)
  utimesSync(p, quando, quando)
  return p
}

beforeEach(() => {
  store.azzeraTutto()
  rmSync(cartella, { recursive: true, force: true })
  mkdirSync(cartella, { recursive: true })
})
after(() => { store.chiudiIndici(); rmSync(casa, { recursive: true, force: true }) })

test('con `dal` i file vecchi si rimandano: visti, non letti, e riconcilia non li tocca', async () => {
  for (let i = 0; i < 6; i++) file(`nuovo-${i}.md`, 5 + i)
  const vecchi = Array.from({ length: 4 }, (_, i) => file(`vecchio-${i}.md`, 200 + i))
  const e = await desktop.sincronizza({ cartelle: [cartella], scelte: true }, undefined, undefined, undefined, { dal: Date.now() - 90 * GIORNO, nuoviMax: 1500 })
  assert.equal(e.docs.length, 6)
  assert.equal(e.rimandati, 4)
  assert.equal(e.pieno, false)
  for (const v of vecchi) assert.ok(e.visti.includes(`desktop:${v}`))
  // uno vecchio era già nell'indice da prima: non se ne va
  store.salvaDocumenti([{ id: `desktop:${vecchi[0]}`, fonte: 'desktop', tipo: 'md', titolo: 'vecchio', corpo: 'x', percorso: vecchi[0], quando: null }])
  await store.salvaDocumentiAPezzi(e.docs)
  const tolti = store.riconcilia('desktop', { completo: !!e.complete.length, radiciViste: e.complete }, [...e.docs.map(d => d.id), ...e.visti])
  assert.equal(tolti, 0)
  // il giro dopo, senza `dal`, legge quelli rimandati
  const gia = store.quandoPerPrefisso('desktop:')
  const poi = await desktop.sincronizza({ cartelle: [cartella], scelte: true }, undefined, gia, undefined, { nuoviMax: 2000 })
  assert.equal(poi.rimandati, 0)
  assert.ok(poi.docs.length >= 3, 'i vecchi arrivano al giro dopo')
})

test('un file già nell’indice non si rimanda anche se è vecchio (counter-case)', async () => {
  const p = file('vecchio-noto.md', 300)
  const gia = new Map([[`desktop:${p}`, '2020-01-01T00:00:00.000Z']])
  const e = await desktop.sincronizza({ cartelle: [cartella], scelte: true }, undefined, gia, undefined, { dal: Date.now() - 90 * GIORNO })
  assert.equal(e.rimandati, 0)
  assert.equal(e.docs.length, 1, 'cambiato rispetto all’indice: si rilegge')
})

test('al tetto dei nuovi il giro si ferma e lo dice con `pieno`, e troncato impedisce di cancellare', async () => {
  for (let i = 0; i < 12; i++) file(`n-${String(i).padStart(2, '0')}.md`, 1)
  const e = await desktop.sincronizza({ cartelle: [cartella], scelte: true }, undefined, undefined, undefined, { nuoviMax: 5 })
  assert.equal(e.docs.length, 5)
  assert.equal(e.pieno, true)
  assert.equal(e.troncato, true)
  assert.deepEqual(e.complete, [])
})

test('senza tetto nessuna bandiera: `pieno` non è `troncato` (counter-case)', async () => {
  for (let i = 0; i < 3; i++) file(`n-${i}.md`, 1)
  const e = await desktop.sincronizza({ cartelle: [cartella], scelte: true })
  assert.equal(e.pieno, false)
  assert.equal(e.troncato, false)
})

test('la riga riceve il conto intero ogni duecento nuovi e alla fine di ogni radice', async () => {
  for (let i = 0; i < 450; i++) file(`m-${String(i).padStart(3, '0')}.md`, 1)
  const altra = join(casa, 'altra')
  rmSync(altra, { recursive: true, force: true }); mkdirSync(altra)
  for (let i = 0; i < 3; i++) writeFileSync(join(altra, `a-${i}.md`), testo(i))
  const visti: number[] = []
  const e = await desktop.sincronizza({ cartelle: [cartella, altra], scelte: true }, n => visti.push(n), undefined, async () => {}, { nuoviMax: 2000 })
  assert.deepEqual(visti, [200, 400, 450, 453])
  assert.equal(e.versati + e.docs.length, 453)
})

test('verso un server ospitato (senza `gia`) si legge tutto a ogni giro: nessun tetto, la radice è completa', async () => {
  const { opzioniMac } = await import('./prima-lettura.ts')
  for (let i = 0; i < 1600; i++) file(`r-${String(i).padStart(4, '0')}.md`, 1 + (i % 200))
  // come in index.ts con MYYND_DESKTOP_REMOTO: `gia` non c'è, prima lettura in corso
  const e = await desktop.sincronizza({ cartelle: [cartella], scelte: true }, undefined, undefined, async () => {}, opzioniMac(true, true))
  assert.equal(e.docs.length + e.versati, 1600, 'tutti i file, anche oltre i millecinquecento')
  assert.equal(e.rimandati, 0, 'niente `dal`: i vecchi non si rimandano, si spingono')
  assert.equal(e.pieno, false, 'la prima lettura finisce al primo giro')
  assert.equal(e.complete.length, 1, 'e la radice si può riconciliare')
  // counter-case: sulla macchina la prima lettura rimanda i vecchi, e il tetto c'è
  const qui = await desktop.sincronizza({ cartelle: [cartella], scelte: true }, undefined, undefined, async () => {}, opzioniMac(true, false))
  assert.ok(qui.rimandati > 0, 'i file oltre i novanta giorni aspettano')
  assert.ok(qui.docs.length + qui.versati < 1600)
  const tetto = await desktop.sincronizza({ cartelle: [cartella], scelte: true }, undefined, undefined, async () => {}, { nuoviMax: 1500 })
  assert.equal(tetto.docs.length + tetto.versati, 1500)
  assert.equal(tetto.pieno, true)
})
