// «Leggi adesso» premuto due volte non è un errore.
//
// «There is an error that comes up every time that I click that eye. There is
// a small banner at the top right that comes up and disappears pretty fast…
// and it added two things to my feed while giving me an error.» Le due cose
// erano la stessa: quel bottone, dopo aver risposto, fa partire *lui* una
// rilettura delle fonti di sottofondo, che tiene il lucchetto per una mezza
// minuto e alla fine mette le sue carte sul feed. In quel mezzo minuto ogni
// altra pressione tornava un 409 — «A source read is already running» — cioè
// una striscia rossa addosso a chi aveva appena premuto, mentre il lavoro che
// aveva chiesto stava andando avanti.
//
// La prova sta fuori dal processo perché la cosa da provare è la *rotta*: due
// POST insieme, e nessuno dei due deve essere un errore.
//
//   node --test server/lettura-a-mano.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const casa = mkdtempSync(join(tmpdir(), 'myynd-lettura-a-mano-'))
process.env.MYYND_DATI = casa
/*
 * Una casa finta, e una cartella scelta dentro di lei.
 *
 * Il server figlio senza HOME ripiegava sulla casa vera, e un desktop senza
 * `scelte: true` veniva allargato all'avvio a tutta la casa più iCloud: la
 * prova leggeva e sorvegliava il Mac di chi la lanciava, e accendeva le
 * conversazioni di Claude Code e Codex che trovava lì. Adesso non c'è niente
 * di vero da trovare.
 */
const home = join(casa, 'casa-finta')
const cartella = join(home, 'Documents')
mkdirSync(cartella, { recursive: true })
// un file da leggere: la rilettura che parte dopo la prima pressione lo trova
// nuovo e chiede al modello (lento apposta) cosa farne, tenendo il lucchetto
writeFileSync(join(cartella, 'launch-plan.md'), '# Launch plan\n\nConfirm the scope with Giulia by Friday.\n')
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')

let servizio: ChildProcess | undefined
let modello: ChildProcess | undefined
let base = ''
const token = 'manual-read-regression-token'

/**
 * Un fornitore compatibile finto, in un processo suo: risponde un feed vuoto,
 * dopo un secondo e mezzo. La lentezza è la prova: prima la dava la casa vera
 * del Mac, che la rilettura leggeva tutta; adesso la casa è finta, e quello che
 * tiene il lucchetto abbastanza a lungo è il modello.
 */
const FINTO = `
import { createServer } from 'node:http'
createServer((req, res) => {
  req.resume()
  req.on('end', () => setTimeout(() => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: 'x', model: 'finto', choices: [{ index: 0, message: { role: 'assistant', content: '{"voci":[]}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))
  }, 1500))
}).listen(0, '127.0.0.1', function () { console.log('finto su ' + this.address().port) })
`

/** Aspetta che un processo scriva la riga che dice dov'è, e torna quella porta. */
function porta(p: ChildProcess, quale: RegExp, cosa: string): Promise<string> {
  return new Promise((ok, no) => {
    const scade = setTimeout(() => no(new Error(`${cosa} non è partito`)), 15000)
    let fuori = ''
    p.stdout!.on('data', c => {
      fuori += String(c)
      const m = fuori.match(quale)
      if (m) { clearTimeout(scade); ok(m[1]) }
    })
    p.on('exit', code => { clearTimeout(scade); if (!fuori.match(quale)) no(new Error(`${cosa} è uscito ${code}`)) })
    p.on('error', no)
  })
}

before(async () => {
  modello = spawn(process.execPath, ['--input-type=module', '-e', FINTO], { stdio: ['ignore', 'pipe', 'pipe'] })
  const portaFinto = await porta(modello, /finto su (\d+)/, 'il fornitore finto')

  const account = await conti.registra('manual-read@example.com', 'isolated-test-password')
  assert.ok(account.ok)
  await conti.perProva.apriCon(token, account.id)
  chi.dentro(account.id, () => {
    cfg.scrivi({
      lingua: 'en', diSerie: false,
      // una fonte collegata, o la rilettura di sottofondo non parte nemmeno
      desktop: { cartelle: [cartella], scelte: true },
      motore: 'compatibile',
      compatibile: { url: `http://127.0.0.1:${portaFinto}/v1/`, chiave: 'sk-finta', modello: 'finto' }
    })
    store.salvaDocumenti([{
      id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'Launch',
      corpo: 'Can you confirm the scope by Friday?', autore: 'Giulia <giulia@example.com>',
      quando: new Date().toISOString(), percorso: 'INBOX', messageId: 'launch@example.com'
    }])
  })
  store.chiudiIndici()

  servizio = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: home, MYYND_DATI: casa, MYYND_PORT: '0', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe']
  })
  base = `http://127.0.0.1:${await porta(servizio, /server su http:\/\/127\.0\.0\.1:(\d+)/, 'il server')}`
})

after(async () => {
  for (const p of [servizio, modello]) {
    if (p && p.exitCode === null) {
      const spento = new Promise<void>(r => p.once('exit', () => r()))
      p.kill('SIGTERM')
      await spento
    }
  }
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(casa, { recursive: true, force: true })
})

const leggi = async () => {
  const r = await fetch(`${base}/api/feed/genera`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  })
  return { stato: r.status, corpo: await r.json() as Record<string, unknown> }
}

test('premere «Leggi adesso» durante una lettura non torna un errore, ma dice che sta già leggendo', async () => {
  // la prima genera e, dopo aver risposto, fa partire la rilettura delle fonti;
  // la seconda arriva mentre quella rilettura aspetta il modello
  const prima = await leggi()
  const seconda = await leggi()
  for (const [quale, r] of [['la prima', prima], ['la seconda', seconda]] as const) {
    assert.equal(r.stato, 200, `${quale} pressione ha risposto ${r.stato}: ${JSON.stringify(r.corpo)}`)
    assert.equal(r.corpo.ok, true, `${quale} pressione non è andata bene`)
    assert.equal(r.corpo.errore, undefined, `${quale} pressione ha risposto un errore`)
  }
  // almeno una ha trovato il lucchetto già preso — l'altra pressione, o la
  // rilettura che parte all'avvio — e quella lo dice invece di sbagliare
  const gia = [prima, seconda].filter(r => r.corpo.gia === true)
  assert.ok(gia.length >= 1, 'nessuna delle due ha trovato una lettura in corso: la prova non prova niente')
  // e chi lo dice non promette niente di più: il feed di adesso, e le fonti
  for (const r of gia) {
    assert.ok(Array.isArray(r.corpo.feed), 'la risposta calma porta comunque il feed di adesso')
    assert.equal(r.corpo.generate, 0, 'niente voci nuove: la lettura è quella già in corso')
    // P10 · e la lettura a cui si è attaccata (o null, se la riga è di un altro)
    assert.ok('lettura' in r.corpo, 'la risposta calma dice a quale lettura si attacca')
  }
  // P10 · la prima risponde subito con la lettura avviata, la seconda si attacca alla stessa
  const l1 = prima.corpo.lettura as { id?: string } | null
  const l2 = seconda.corpo.lettura as { id?: string } | null
  if (l1 && l2) assert.equal(l2.id, l1.id, 'due pressioni, una lettura sola')
})
