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
  const ordine = await import('./ordine.ts')
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  assert.ok(a.ok); const id = a.ok ? a.id : ''
  const GIORNO = 86_400_000
  const fino = new Date('2026-09-24T06:00:00.000Z')
  chi.dentro(id, () => {
    cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', posta: { host: 'h', porta: 993, utente: 'anna@esempio.it', password: 'x' } })
    store.azzeraTutto()
    let n = 0
    const docs: Parameters<typeof store.salvaDocumenti>[0] = []
    // prima di tutto, in fondo all'indice: 4.500 mail vecchie di gennaio, oltre i quattromila di una chiamata del registro
    for (let i = 0; i < 4500; i++) docs.push({ id: `posta:Archivio:${i}`, fonte: 'posta', tipo: 'email', titolo: `Vecchia ${i}`, corpo: 'x', autore: `p${i % 40}@vecchio.example`, quando: new Date(Date.parse('2026-01-05T00:00:00.000Z') + i * 60_000).toISOString() })
    for (let d = 40; d >= 1; d--) {
      // Nora scrive alle sei di Roma, prima delle otto in cui si afferma, e ha risposta alle nove
      const q = new Date(fino.getTime() - d * GIORNO - 2 * 3_600_000)
      n++
      docs.push({ id: `posta:INBOX:${n}`, fonte: 'posta', tipo: 'email', titolo: `Nora ${n}`, corpo: 'Hi', autore: `Nora <nora@h.example>`, quando: q.toISOString(), filo: `f${n}@x`, messageId: `m${n}@x` })
      docs.push({ id: `posta:Sent:${n}`, fonte: 'posta', tipo: 'email', titolo: `Re: Nora ${n}`, corpo: 'ok', autore: 'Anna <anna@esempio.it>', inviato: true, quando: new Date(q.getTime() + 3 * 3_600_000).toISOString(), filo: `f${n}@x`, messageId: `s${n}@x`, risponde: `m${n}@x`, destinatari: 'nora@h.example' })
      n++
      docs.push({ id: `posta:INBOX:${n}`, fonte: 'posta', tipo: 'email', titolo: `Priya ${n}`, corpo: 'Can you confirm?', autore: `Priya <priya@a.example>`, quando: new Date(q.getTime() + 60_000).toISOString(), filo: `f${n}@x`, messageId: `m${n}@x` })
    }
    for (let i = 0; i < docs.length; i += 2000) store.salvaDocumenti(docs.slice(i, i + 2000))
    // le righe della lista: otto in programma nei giorni della prova (cinque chiuse il loro giorno), tutte scritte prima
    for (let i = 0; i < 8; i++) {
      const g = `2026-09-${String(12 + i).padStart(2, '0')}`
      store.scriviCompito({ id: `c${i}`, testo: `Riga ${i}`, quando: 'oggi', ordine: ordine.dopo(store.ultimoOrdine('oggi')), giorno: g })
      store.default.prepare('UPDATE compiti SET creato = ? WHERE id = ?').run('2026-09-01T08:00:00.000Z', `c${i}`)
      if (i < 5) store.default.prepare("UPDATE compiti SET stato = 'fatto', chiuso = ? WHERE id = ?").run(`${g}T15:00:00.000Z`, `c${i}`)
    }
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
  // per genere, non per famiglia: Nora sempre risposta, Priya mai
  assert.ok(rapporto.perGenere['posta.risponde']!.giuste >= 0.9, JSON.stringify(rapporto.perGenere))
  assert.ok(rapporto.perGenere['posta.non_risponde']!.giuste >= 0.9)
  assert.ok(rapporto.totale.lift > 0, 'batte chi non lo conosce')
  // anche le righe della lista: otto giorni con una riga in programma
  const compiti = Object.entries(rapporto.perGenere).filter(([g]) => g.startsWith('compito.'))
  assert.equal(compiti.reduce((s, [, x]) => s + x.affermazioni, 0), 8, JSON.stringify(rapporto.perGenere))
  // la copertura e il Brier per giorno (sezione 8)
  assert.equal(rapporto.perGiorno.length, 14)
  assert.ok(rapporto.perGiorno.every(g => typeof g.candidati === 'number' && g.candidati >= g.affermazioni))
  assert.equal(rapporto.copertura.giorniAttivi, rapporto.perGiorno.filter(g => g.candidati >= 5).length)
  assert.ok(rapporto.spinta.con.n + rapporto.spinta.senza.n === rapporto.totale.affermazioni)
  assert.equal(rapporto.distorsioni.length, 4)
  const scritto = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(scritto.righe.length, rapporto.totale.affermazioni)
  const testo = prova.stampa(rapporto)
  assert.match(testo, /posta\.risponde/); assert.match(testo, /compito\./); assert.match(testo, /copertura:/); assert.match(testo, /brier per giorno/)
  assert.match(testo, /Distorsioni note/); assert.doesNotMatch(testo, /[—–]/)
  // il registro è arrivato in fondo all'indice: ogni mail c'è, non solo le prime quattromila
  const nelRegistro = chi.dentro(id, () => (store.default.prepare("SELECT COUNT(*) AS n FROM segnali WHERE genere = 'posta.arrivata'").get() as { n: number }).n)
  store.chiudiIndici()
  assert.equal(nelRegistro, 4500 + 80, 'le 4.500 vecchie e le 80 di Nora e Priya')
})
