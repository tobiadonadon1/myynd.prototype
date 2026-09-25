// Le misure del lavoro affidato: l'aritmetica, i tassi che tacciono, la riga di comando.
//
//   node --test server/misura-lavoro.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-misura-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const store = await import('./store.ts')
const lavoroDati = await import('./lavoro-dati.ts')
const { calcola, eLaCasaVera, leggiArgomenti, misuraLavoro } = await import('./misura-lavoro.ts')
type Misura = import('./lavoro-dati.ts').Misura

before(() => store.azzeraTutto())
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const giorniFa = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const riga = (r: Partial<Misura> & { compito: string }): Misura => ({
  affidato: giorniFa(2), modo: 'tutto', origine: 'mano', domande: 0, presunte: 0, cercate: 0, correzioni: 0,
  mossa: 'produci', genere: null, tipo: 'risposta', consegnato: giorniFa(2), inviato: null, via: null, distanza: null, parole: null, classe: null, ...r
})

test('l\'aritmetica: senza domande, con una, presunte, blocchi e guai a parte, il fondo a parte, le bozze per classe', () => {
  const righe: Misura[] = [
    riga({ compito: 'a' }), riga({ compito: 'b', domande: 1, mossa: 'chiedi', consegnato: null }), riga({ compito: 'c', mossa: 'presumi', presunte: 1 }),
    riga({ compito: 'd', mossa: 'segnaposto', correzioni: 2 }), riga({ compito: 'e', domande: 1 }),
    riga({ compito: 'f', mossa: 'blocco', consegnato: null }), riga({ compito: 'g', mossa: 'guaio', consegnato: null }),
    riga({ compito: 'h', origine: 'fondo', mossa: 'segnaposto' }), riga({ compito: 'i', origine: 'fondo' }),
    riga({ compito: 'j', affidato: giorniFa(40), consegnato: giorniFa(40) }),
    riga({ compito: 'k', inviato: giorniFa(1), via: 'smtp', classe: 'identico' }), riga({ compito: 'l', inviato: giorniFa(1), via: 'casella', classe: 'ritocco' }),
    riga({ compito: 'm', inviato: giorniFa(1), via: 'casella', classe: 'modificato' }), riga({ compito: 'n', inviato: giorniFa(1), via: 'propria', classe: 'riscritto' }),
    riga({ compito: 'o', inviato: giorniFa(1), via: 'copia' }), riga({ compito: 'p', inviato: giorniFa(1), via: 'smtp', classe: 'ritocco' })
  ]
  const m = calcola(righe, { giorni: 30, dal: giorniFa(30), postaInviata: true })
  // a, b, c, d, e, k..p sono lavori (j è fuori finestra, f e g a parte, h e i fondo)
  assert.equal(m.lavori.arrivati, 11)
  assert.equal(m.lavori.senzaDomande, 9)
  assert.equal(m.lavori.conUna, 2)
  assert.equal(m.lavori.max, 1)
  assert.equal(m.lavori.presunte, 1)
  assert.equal(m.lavori.segnaposto, 1)
  assert.equal(m.lavori.correzioni, 2)
  assert.equal(m.lavori.tassoSenza, Math.round((9 / 11) * 1000) / 1000)
  assert.equal(m.blocchi, 1)
  assert.equal(m.guai, 1)
  assert.deepEqual(m.fondo, { arrivati: 2, segnaposto: 1, domande: 0 })
  assert.equal(m.bozze.inviate, 5)
  assert.deepEqual([m.bozze.identiche, m.bozze.ritocchi, m.bozze.modificate, m.bozze.riscritte], [1, 2, 1, 1])
  assert.equal(m.bozze.tassoBuone, 0.6)
  assert.deepEqual(m.bozze.via, { smtp: 2, casella: 2, propria: 1, copia: 1 })
})

test('sotto le cinque righe un tasso è null, e senza posta inviata nell\'indice il tasso delle bozze tace', () => {
  const poche = [riga({ compito: 'a' }), riga({ compito: 'b' }), riga({ compito: 'c', inviato: giorniFa(1), via: 'smtp', classe: 'identico' })]
  const m = calcola(poche, { giorni: 30, dal: giorniFa(30), postaInviata: true })
  assert.equal(m.lavori.tassoSenza, null)
  assert.equal(m.bozze.tassoBuone, null)
  const tante = Array.from({ length: 6 }, (_, i) => riga({ compito: `s${i}`, inviato: giorniFa(1), via: 'smtp', classe: 'identico' }))
  assert.equal(calcola(tante, { giorni: 30, dal: giorniFa(30), postaInviata: true }).bozze.tassoBuone, 1)
  const senzaPosta = calcola(tante, { giorni: 30, dal: giorniFa(30), postaInviata: false })
  assert.equal(senzaPosta.bozze.tassoBuone, null)
  assert.equal(senzaPosta.copertura.postaInviata, false)
})

test('misuraLavoro legge le righe scritte da lavoro-dati, sul conto di chi chiede', async () => {
  store.scriviCompito({ id: 'm1', testo: 'Reply to Marco', ordine: 'm1' })
  store.default.prepare("UPDATE compiti SET chiesto = ? WHERE id = 'm1'").run(giorniFa(1))
  lavoroDati.registraAffido(store.compito('m1')!, true)
  lavoroDati.registraEsito('m1', { mossa: 'presumi', genere: 'data', tipo: 'risposta', consegnato: giorniFa(1) })
  lavoroDati.registraInvio('m1', { via: 'smtp', inviato: giorniFa(0.5), distanza: 0, parole: 40, classe: 'identico' })
  // il secondo invio non vince
  assert.equal(lavoroDati.registraInvio('m1', { via: 'casella', inviato: giorniFa(0.2), classe: 'riscritto' }), false)
  const m = await misuraLavoro(30)
  assert.equal(m.lavori.arrivati, 1)
  assert.equal(m.lavori.presunte, 1)
  assert.equal(m.bozze.via.smtp, 1)
  assert.equal(m.bozze.via.casella, 0)
  assert.equal(m.copertura.postaInviata, false)
  assert.equal(m.giorni, 30)
  assert.equal((await misuraLavoro(0)).giorni, 30)
})

test('la riga di comando rifiuta senza --dati, rifiuta la casa vera senza aprirla, e non parla con la rete', () => {
  const cli = fileURLToPath(new URL('./misura-lavoro.ts', import.meta.url))
  assert.deepEqual(leggiArgomenti(['--dati', '/x', '--giorni', '14']), { dati: '/x', conto: null, giorni: 14, aiuto: false, sbagliato: null })
  assert.equal(leggiArgomenti(['--boh']).sbagliato, '--boh')
  assert.equal(eLaCasaVera(join(CASA, '.myynd'), CASA), true)
  assert.equal(eLaCasaVera(join(CASA, '.myynd', 'utenti', 'x'), CASA), true)
  assert.equal(eLaCasaVera(join(CASA, 'copia'), CASA), false)
  // un collegamento alla casa vera, o le maiuscole cambiate, sono la casa vera
  mkdirSync(join(CASA, '.myynd', 'utenti'), { recursive: true })
  symlinkSync(join(CASA, '.myynd'), join(CASA, 'link-alla-casa'))
  assert.equal(eLaCasaVera(join(CASA, 'link-alla-casa'), CASA), true)
  assert.equal(eLaCasaVera(join(CASA, 'link-alla-casa', 'utenti', 'x'), CASA), true)
  assert.equal(eLaCasaVera(join(CASA, '.MYYND'), CASA), true)
  assert.equal(eLaCasaVera(join(CASA, '.MYYND', 'utenti', 'non-esiste'), CASA), true)
  // niente rete in questo file: nessun fetch, nessun modulo http
  const sorgente = readFileSync(cli, 'utf8')
  assert.doesNotMatch(sorgente, /fetch\(|node:http|node:https|node:net/)

  const casaFinta = join(CASA, 'casa-finta')
  mkdirSync(join(casaFinta, '.myynd'), { recursive: true })
  const lancia = (args: string[]) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', cli, ...args], { env: { PATH: process.env.PATH, HOME: casaFinta }, encoding: 'utf8' })
  const senza = lancia([])
  assert.equal(senza.status, 2)
  assert.match(senza.stderr, /--dati/)
  const vera = lancia(['--dati', join(casaFinta, '.myynd')])
  assert.equal(vera.status, 2)
  assert.match(vera.stderr, /dati veri/)
  assert.deepEqual(readdirSync(join(casaFinta, '.myynd')), []) // resta vuota: non ha scritto niente
})
