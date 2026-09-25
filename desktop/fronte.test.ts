// Le letture delle due fonti, su righe vere e su righe storte.
// Nessuna fonte vera parte qui: guarderebbe chi sta lavorando.
//
//   node --test desktop/fronte.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creaRipiego, leggiAsn, leggiLsappinfo, leggiRiga, percorsoHelper, spacchettato } from './fronte.ts'
import type { EventoFronte } from './sessioni.ts'

test('leggiRiga: una riga valida', () => {
  const riga = '{"bundle":"com.apple.Safari","app":"Safari","pid":123,"titolo":"Inbox (3) - Gmail","t":1727160000000}'
  assert.deepEqual(leggiRiga(riga), { bundle: 'com.apple.Safari', app: 'Safari', pid: 123, titolo: 'Inbox (3) - Gmail', t: 1727160000000 })
})

test('leggiRiga: titolo null, e virgolette e a capo scappati', () => {
  assert.deepEqual(leggiRiga('{"bundle":"com.microsoft.VSCode","app":"Code","pid":9,"titolo":null,"t":1}'),
    { bundle: 'com.microsoft.VSCode', app: 'Code', pid: 9, titolo: null, t: 1 })
  assert.equal(leggiRiga('{"bundle":"a.b","app":"A","pid":1,"titolo":"due \\"righe\\"\\nqui","t":2}')?.titolo, 'due "righe"\nqui')
})

test('leggiRiga: JSON rotto, campi mancanti o sbagliati, rumore', () => {
  assert.equal(leggiRiga('{"bundle":"com.apple.Safari",'), null)
  assert.equal(leggiRiga(''), null)
  assert.equal(leggiRiga('{"bundle":"a.b","app":"A","pid":1,"t":2}'), null, 'manca titolo')
  assert.equal(leggiRiga('{"app":"A","pid":1,"titolo":null,"t":2}'), null, 'manca bundle')
  assert.equal(leggiRiga('{"bundle":"a.b","app":"A","pid":"1","titolo":null,"t":2}'), null, 'pid stringa')
  assert.equal(leggiRiga('{"bundle":"a.b","app":"A","pid":1.5,"titolo":null,"t":2}'), null, 'pid non intero')
  assert.equal(leggiRiga('{"bundle":"a.b","app":"A","pid":1,"titolo":3,"t":2}'), null, 'titolo numero')
  assert.equal(leggiRiga('{"bundle":"a.b","app":"A","pid":1,"titolo":null,"t":"ora"}'), null, 't stringa')
  assert.equal(leggiRiga('2026-09-24 avviso: {"bundle":"a.b","app":"A","pid":1,"titolo":null,"t":2}'), null)
  assert.equal(leggiRiga('[1,2,3]'), null)
  assert.equal(leggiRiga('null'), null)
  assert.equal(leggiRiga('{"versione":1}'), null)
})

test('leggiRiga: i campi in più non passano oltre', () => {
  const e = leggiRiga('{"bundle":"a.b","app":"A","pid":1,"titolo":null,"t":2,"altro":"x"}')
  assert.deepEqual(e, { bundle: 'a.b', app: 'A', pid: 1, titolo: null, t: 2 })
})

// l'uscita vera di `lsappinfo info -only name -only bundleid -only pid`, col
// segno di direzione U+200E davanti al nome come la scrive macOS
const LSAPPINFO = '"LSDisplayName"="\u200EWhatsApp"\n"CFBundleIdentifier"="net.whatsapp.WhatsApp"\n"pid"=75956\n'

test('leggiLsappinfo: l’esempio vero, senza il segno di direzione', () => {
  assert.deepEqual(leggiLsappinfo(LSAPPINFO, 5), { bundle: 'net.whatsapp.WhatsApp', app: 'WhatsApp', pid: 75956, titolo: null, t: 5 })
})

test('leggiLsappinfo: senza bundle è null; senza nome resta il bundle', () => {
  assert.equal(leggiLsappinfo('"LSDisplayName"="Qualcosa"\n"pid"=12\n', 1), null)
  assert.equal(leggiLsappinfo('"LSDisplayName"="X"\n"CFBundleIdentifier"=""\n"pid"=1\n', 1), null)
  assert.equal(leggiLsappinfo('', 1), null)
  assert.deepEqual(leggiLsappinfo('"CFBundleIdentifier"="com.x.y"\n"pid"=3\n', 1), { bundle: 'com.x.y', app: 'com.x.y', pid: 3, titolo: null, t: 1 })
})

test('leggiAsn: dall’uscita di `lsappinfo front`', () => {
  assert.equal(leggiAsn('ASN:0x0-0x1d01d:\n'), 'ASN:0x0-0x1d01d:')
  assert.equal(leggiAsn('[ NULL ]'), null)
  assert.equal(leggiAsn(''), null)
})

test('percorsoHelper: dentro app.asar si guarda in app.asar.unpacked, senza toccare il disco', () => {
  const url = new URL('file:///Applications/Myynd.app/Contents/Resources/app.asar/desktop/bin/myynd-fronte')
  const visti: string[] = []
  const p = percorsoHelper({ url, esiste: x => { visti.push(x); return true } })
  assert.equal(p, '/Applications/Myynd.app/Contents/Resources/app.asar.unpacked/desktop/bin/myynd-fronte')
  assert.deepEqual(visti, [p])
  assert.equal(percorsoHelper({ url, esiste: () => false }), null)
  const dev = new URL('file:///Users/x/myynd/desktop/bin/myynd-fronte')
  assert.equal(percorsoHelper({ url: dev, esiste: () => true }), '/Users/x/myynd/desktop/bin/myynd-fronte')
})

test('spacchettato: solo la cartella app.asar, non un nome che la contiene', () => {
  assert.equal(spacchettato('/a/app.asar/b'), '/a/app.asar.unpacked/b')
  assert.equal(spacchettato('/a/myapp.asarx/b'), '/a/myapp.asarx/b')
  assert.equal(spacchettato('/a/app.asar.unpacked/b'), '/a/app.asar.unpacked/b')
})

test('ripiego: un chiedi() arrivato a metà di un giro si rifà appena il giro finisce', async () => {
  // un finto `lsappinfo`: ogni chiamata aspetta finché la prova non la lascia andare
  let davanti = { nome: 'Safari', bundle: 'com.apple.Safari', pid: 11 }
  const attese: Array<() => void> = []
  const esegui = (_cmd: string, argomenti: string[]) => new Promise<string>(risolvi => {
    attese.push(() => risolvi(argomenti[0] === 'front'
      ? 'ASN:0x0-0x1:\n'
      : `"LSDisplayName"="${davanti.nome}"\n"CFBundleIdentifier"="${davanti.bundle}"\n"pid"=${davanti.pid}\n`))
  })
  const passo = async () => { attese.shift()?.(); await new Promise(r => setImmediate(r)) }
  const lascia = async () => { while (attese.length) await passo() }
  const eventi: EventoFronte[] = []
  const f = creaRipiego({ titoli: false, suEvento: e => eventi.push(e), suFine: () => {} }, esegui)
  try {
    await lascia()
    assert.deepEqual(eventi.map(e => e.app), ['Safari'], 'il primo giro dice chi c’è')
    // un giro parte e vede ancora Safari; a metà lo schermo si sblocca su Mail
    f.chiedi()
    await passo()
    f.chiedi()
    await passo()
    assert.deepEqual(eventi.map(e => e.app), ['Safari', 'Safari'])
    davanti = { nome: 'Mail', bundle: 'com.apple.mail', pid: 12 }
    await lascia()
    assert.deepEqual(eventi.map(e => e.app), ['Safari', 'Safari', 'Mail'], 'il chiedi() arrivato a metà si rifà e vede Mail')
    // controcaso: senza chiedi() a metà, un giro solo
    const prima = eventi.length
    f.chiedi()
    await lascia()
    assert.equal(eventi.length, prima + 1)
  } finally {
    f.ferma()
  }
})
