// La prova sul passato: rifiuta la cartella vera, non tocca la rete, scrive solo dove le si dice.
//
//   node --test server/gemello-prova.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-gemello-prova-'))
after(() => rmSync(CASA, { recursive: true, force: true }))

const prova = await import('./gemello-prova.ts')

test('leggiArgomenti e cartellaVietata', () => {
  assert.deepEqual(prova.leggiArgomenti(['--dati', '/x', '--conto', 'c', '--ora', '09:00']), { dati: '/x', conto: 'c', ora: '09:00' })
  assert.ok(prova.cartellaVietata(join(homedir(), '.myynd')))
  assert.ok(prova.cartellaVietata(join(homedir(), '.myynd', 'utenti', 'x')))
  assert.ok(prova.cartellaVietata('/a/b', '/casa', '/a/b'), 'la radice di serie')
  assert.equal(prova.cartellaVietata(CASA), null)
  // un collegamento simbolico alla cartella vera, e le maiuscole sul disco del Mac: sempre vietata
  const casaFinta = join(CASA, 'casa'); mkdirSync(join(casaFinta, '.myynd'), { recursive: true })
  const ponte = join(CASA, 'ponte'); symlinkSync(join(casaFinta, '.myynd'), ponte)
  assert.ok(prova.cartellaVietata(ponte, casaFinta), 'il collegamento simbolico')
  assert.ok(prova.cartellaVietata(join(ponte, 'utenti', 'x'), casaFinta))
  if (process.platform === 'darwin') assert.ok(prova.cartellaVietata(join(casaFinta, '.MYYND'), casaFinta), 'le maiuscole')
  assert.equal(prova.cartellaVietata(join(CASA, 'copia'), casaFinta), null)
})

test('rifiuta senza --dati, e rifiuta la cartella vera senza crearla né aprirla', async () => {
  await assert.rejects(prova.esegui({ conto: 'x' }), /--dati/)
  const vera = join(homedir(), '.myynd')
  const cEra = existsSync(vera)
  await assert.rejects(prova.esegui({ dati: vera, conto: 'x' }), /copia/)
  await assert.rejects(prova.esegui({ dati: join(vera, 'utenti', 'nessuno-di-prova'), conto: 'x' }), /copia/)
  assert.equal(existsSync(vera), cEra, 'non deve crearla')
  assert.equal(existsSync(join(vera, 'utenti', 'nessuno-di-prova')), false)
})

test('su una copia seminata: nessuna rete, il rapporto solo sotto la copia, i numeri di un mese pianificato', async () => {
  // la copia: un conto con posta, Nora risposta sempre, Priya mai
  process.env.MYYND_DATI = CASA
  const conti = await import('./conti.ts')
  const chi = await import('./chi.ts')
  const cfg = await import('./config.ts')
  const store = await import('./store.ts')
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  assert.ok(a.ok); const id = a.ok ? a.id : ''
  const GIORNO = 86_400_000
  const fino = new Date('2026-09-24T06:00:00.000Z')
  chi.dentro(id, () => {
    cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', posta: { host: 'h', porta: 993, utente: 'anna@esempio.it', password: 'x' } })
    store.azzeraTutto()
    let n = 0
    const docs: Parameters<typeof store.salvaDocumenti>[0] = []
    for (let d = 40; d >= 1; d--) {
      // Nora scrive alle sei di Roma, prima delle otto in cui si afferma, e ha risposta alle nove
      const q = new Date(fino.getTime() - d * GIORNO - 2 * 3_600_000)
      n++
      docs.push({ id: `posta:INBOX:${n}`, fonte: 'posta', tipo: 'email', titolo: `Nora ${n}`, corpo: 'Hi', autore: `Nora <nora@h.example>`, quando: q.toISOString(), filo: `f${n}@x`, messageId: `m${n}@x` })
      docs.push({ id: `posta:Sent:${n}`, fonte: 'posta', tipo: 'email', titolo: `Re: Nora ${n}`, corpo: 'ok', autore: 'Anna <anna@esempio.it>', inviato: true, quando: new Date(q.getTime() + 3 * 3_600_000).toISOString(), filo: `f${n}@x`, messageId: `s${n}@x`, risponde: `m${n}@x`, destinatari: 'nora@h.example' })
      n++
      docs.push({ id: `posta:INBOX:${n}`, fonte: 'posta', tipo: 'email', titolo: `Priya ${n}`, corpo: 'Can you confirm?', autore: `Priya <priya@a.example>`, quando: new Date(q.getTime() + 60_000).toISOString(), filo: `f${n}@x`, messageId: `m${n}@x` })
    }
    store.salvaDocumenti(docs)
  })
  store.chiudiIndici()
  const fetchPrima = globalThis.fetch
  const { rapporto, file } = await prova.esegui({ dati: CASA, conto: id, dal: '2026-09-10', al: '2026-09-23' }, fino)
  assert.throws(() => globalThis.fetch('https://esempio.test'), /rete/)
  globalThis.fetch = fetchPrima
  assert.ok(file.startsWith(CASA))
  assert.ok(existsSync(file))
  assert.deepEqual(readdirSync(join(CASA, 'valutazioni')).length, 1)
  assert.equal(rapporto.giorni, 14)
  assert.ok(rapporto.totale.affermazioni >= 28, String(rapporto.totale.affermazioni))
  assert.ok(rapporto.totale.giuste >= 0.9, `giuste ${rapporto.totale.giuste}`)
  assert.ok(rapporto.totale.lift > 0, 'batte chi non lo conosce')
  assert.equal(rapporto.distorsioni.length, 4)
  const scritto = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(scritto.righe.length, rapporto.totale.affermazioni)
  const testo = prova.stampa(rapporto)
  assert.match(testo, /posta/); assert.match(testo, /Distorsioni note/); assert.doesNotMatch(testo, /[—–]/)
})
