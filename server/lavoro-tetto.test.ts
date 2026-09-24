// Il lavoro sul codice è lo stesso account Claude delle domande e della chat.
//
// `lavoro.fai` lancia `claude` da sé, per molti giri, in una copia del
// progetto: è il lavoro più lungo che l'account fa. Prima partiva anche a
// tetto raggiunto, e la pagina dell'uso non lo vedeva mai. Qui un `claude`
// finto nella casa di prova, che risponde con la busta JSON (coi token, o in
// testo come una versione vecchia) e conta quante volte è stato lanciato.
//
//   node --test server/lavoro-tetto.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-lavoro-tetto-'))
const CASA_VERA = process.env.HOME
// `lavoro.ts` cerca `claude` in `~/.local/bin` quando si carica
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, 'dati')
const PROGETTO = join(CASA, 'Progetti', 'sito')
mkdirSync(PROGETTO, { recursive: true })
writeFileSync(join(PROGETTO, 'README.md'), '# Site\n')

const CONTA = join(CASA, 'lanci.txt')
process.env.FINTO_CONTA = CONTA
mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
writeFileSync(join(CASA, '.local', 'bin', 'claude'), `#!/bin/sh
echo lancio >> "$FINTO_CONTA"
case "$FINTO_MODO" in
  testo) echo 'Plan: add a footer.' ;;
  fuori) echo '{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}'; exit 1 ;;
  *) echo '{"type":"result","subtype":"success","is_error":false,"result":"Plan: add a footer.","usage":{"input_tokens":1200,"cache_creation_input_tokens":300,"cache_read_input_tokens":45000,"output_tokens":800}}' ;;
esac
`)
chmodSync(join(CASA, '.local', 'bin', 'claude'), 0o755)

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const lavoro = await import('./lavoro.ts')
const { delTetto, TETTO_RAGGIUNTO } = await import('./tetto.ts')

const DESKTOP = { cartelle: [join(CASA, 'Progetti')] }
const lanci = () => existsSync(CONTA) ? readFileSync(CONTA, 'utf8').split('\n').filter(Boolean).length : 0
const righe = () => (store.default.prepare('SELECT lavoro, motore, entrata, cache, uscita FROM uso ORDER BY rowid').all() as
  { lavoro: string; motore: string; entrata: number; cache: number; uscita: number }[]).map(r => ({ ...r }))

before(() => { cfg.scrivi({ lingua: 'en', tetto: 0 }) })
after(() => {
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  delete process.env.FINTO_CONTA
  delete process.env.FINTO_MODO
  rmSync(CASA, { recursive: true, force: true })
})

function azzera() {
  store.default.exec('DELETE FROM uso')
  rmSync(CONTA, { force: true })
  cfg.aggiorna({ tetto: 0 })
  delete process.env.FINTO_MODO
}

test('il piano chiede la busta JSON, e i token del lavoro intero finiscono nel registro', async () => {
  azzera()
  const a = lavoro.argomentiDi('piano')
  assert.equal(a[a.indexOf('--output-format') + 1], 'json')
  const esito = await lavoro.fai(DESKTOP, { cartella: PROGETTO, richiesta: 'Add a footer', passo: 'piano' })
  assert.equal(esito.testo, 'Plan: add a footer.', 'il testo è quello della busta, non la busta')
  assert.equal(esito.finito, true)
  assert.deepEqual(righe(), [{ lavoro: 'codice', motore: 'Claude account', entrata: 1500, cache: 45000, uscita: 800 }])
})

test('una versione che risponde in testo: il testo vale com’è, e i token si stimano dicendolo', async () => {
  azzera()
  process.env.FINTO_MODO = 'testo'
  const esito = await lavoro.fai(DESKTOP, { cartella: PROGETTO, richiesta: 'x'.repeat(40), passo: 'piano' })
  assert.equal(esito.testo, 'Plan: add a footer.')
  assert.deepEqual(righe(), [{ lavoro: 'codice', motore: 'Claude account (stima)', entrata: 10, cache: 0, uscita: Math.ceil('Plan: add a footer.'.length / 4) }])
})

test('fuori dall’account: lo dice, e non scrive una riga per un lavoro che non c’è stato', async () => {
  azzera()
  process.env.FINTO_MODO = 'fuori'
  await assert.rejects(() => lavoro.fai(DESKTOP, { cartella: PROGETTO, richiesta: 'Add a footer', passo: 'piano' }), /non è collegato/)
  assert.equal(righe().length, 0)
})

test('col tetto raggiunto non parte niente: né il piano, né la copia per «fallo»', async () => {
  azzera()
  store.segnaUso({ lavoro: 'bozza', motore: 'Claude account', entrata: 900, cache: 0, uscita: 200 })
  cfg.aggiorna({ tetto: 1000 })
  for (const passo of ['piano', 'fai'] as const) {
    await assert.rejects(
      () => lavoro.fai(DESKTOP, { cartella: PROGETTO, richiesta: 'Add a footer', passo }),
      (e: unknown) => delTetto(e) && (e as Error).message === TETTO_RAGGIUNTO
    )
  }
  assert.equal(lanci(), 0, 'ha lanciato Claude Code oltre il tetto')
  assert.equal(righe().length, 1, 'ha scritto una riga per un lavoro mai fatto')
  const copie = readdirSync(CASA, { recursive: true }).map(String).filter(p => p.endsWith('project-work'))
  assert.deepEqual(copie, [], 'ha preparato una copia oltre il tetto')
})

test('sotto il tetto si lavora; la cache non conta per il tetto', async () => {
  azzera()
  store.segnaUso({ lavoro: 'bozza', motore: 'Claude account', entrata: 100, cache: 1_000_000, uscita: 100 })
  cfg.aggiorna({ tetto: 1000 })
  const esito = await lavoro.fai(DESKTOP, { cartella: PROGETTO, richiesta: 'Add a footer', passo: 'piano' })
  assert.equal(esito.testo, 'Plan: add a footer.')
  assert.equal(lanci(), 1)
})

test('la busta: un oggetto, un elenco (--verbose), niente', () => {
  const riga = '{"type":"result","is_error":false,"result":" Done. ","usage":{"input_tokens":1,"output_tokens":2}}'
  assert.deepEqual(lavoro.busta(riga), { result: 'Done.', errore: false, usage: { input_tokens: 1, output_tokens: 2 } })
  assert.equal(lavoro.busta(`[{"type":"system"},${riga}]`)?.result, 'Done.')
  assert.equal(lavoro.busta(`qualche riga prima\n${riga}\n`)?.result, 'Done.')
  // il contro-caso: un testo qualunque, anche con delle graffe, non è una busta
  assert.equal(lavoro.busta('Plan: use {braces} here.'), null)
  assert.equal(lavoro.busta('{"type":"assistant","result":"no"}'), null)
  assert.equal(lavoro.busta(''), null)
})
