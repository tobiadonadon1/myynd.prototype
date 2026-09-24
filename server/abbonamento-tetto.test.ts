// L'account Claude rispetta il tetto di oggi, e compare nel registro dell'uso.
//
// Prima `abbonamento.chiedi` e `inStreaming` lanciavano `claude` senza guardare
// il tetto e senza scrivere niente in `uso`: scegliere l'account Claude era un
// modo di scavalcare una scelta sua, e la pagina dell'uso non vedeva metà del
// lavoro. Qui un `claude` finto nella casa di prova, che dice quanti token ha
// usato (o non lo dice), e conta quante volte è stato lanciato.
//
//   node --test server/abbonamento-tetto.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-abbonamento-tetto-'))
const CASA_VERA = process.env.HOME
// `lavoro.ts` cerca `claude` in `~/.local/bin` quando si carica: la casa va
// cambiata prima di qualunque import
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY

const CONTA = join(CASA, 'lanci.txt')
process.env.FINTO_CONTA = CONTA
mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
const finto = join(CASA, '.local', 'bin', 'claude')
writeFileSync(finto, `#!/bin/sh
cat > /dev/null
echo lancio >> "$FINTO_CONTA"
case "$*" in
  *stream-json*)
    echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}}'
    echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"there."}}}'
    echo '{"type":"result","subtype":"success","is_error":false,"result":"Hello there.","usage":{"input_tokens":40,"cache_creation_input_tokens":0,"cache_read_input_tokens":900,"output_tokens":7}}'
    ;;
  *)
    if [ "$FINTO_MODO" = "senza" ]; then
      echo '{"type":"result","subtype":"success","is_error":false,"result":"An answer with no usage at all."}'
    else
      echo '{"type":"result","subtype":"success","is_error":false,"result":"Here is the outline.","usage":{"input_tokens":100,"cache_creation_input_tokens":50,"cache_read_input_tokens":5000,"output_tokens":20}}'
    fi
    ;;
esac
`)
chmodSync(finto, 0o755)

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const abbonamento = await import('./abbonamento.ts')
const mod = await import('./modello.ts')
const { delTetto, TETTO_RAGGIUNTO } = await import('./tetto.ts')

const lanci = () => existsSync(CONTA) ? readFileSync(CONTA, 'utf8').split('\n').filter(Boolean).length : 0
const righe = () => (store.default.prepare('SELECT lavoro, motore, entrata, cache, uscita FROM uso ORDER BY rowid').all() as
  { lavoro: string; motore: string; entrata: number; cache: number; uscita: number }[]).map(r => ({ ...r }))

before(() => {
  cfg.scrivi({ lingua: 'en', claudeCon: 'abbonamento', tetto: 0 })
})
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
  abbonamento.riprova()
}

test('i token detti da Claude Code finiscono nel registro, come per ogni altra strada', async () => {
  azzera()
  const testo = await abbonamento.chiedi({ system: 'Be brief.', messages: [{ role: 'user', content: 'Outline?' }], attesa: 10_000, lavoro: 'bozza' })
  assert.equal(testo, 'Here is the outline.')
  assert.deepEqual(righe(), [{ lavoro: 'bozza', motore: 'Claude account', entrata: 150, cache: 5000, uscita: 20 }])
})

test('senza i token nella busta si stima, e la riga dice che è una stima', async () => {
  azzera()
  process.env.FINTO_MODO = 'senza'
  const system = 'x'.repeat(400)
  const domanda = 'y'.repeat(399)
  const testo = await abbonamento.chiedi({ system, messages: [{ role: 'user', content: domanda }], attesa: 10_000, lavoro: 'titolo' })
  const [r] = righe()
  assert.equal(r.motore, 'Claude account (stima)')
  assert.equal(r.lavoro, 'titolo')
  assert.equal(r.entrata, Math.ceil((400 + 399) / 4))
  assert.equal(r.uscita, Math.ceil(testo.length / 4))
  assert.equal(r.cache, 0)
})

test('anche la chat in streaming si conta, dalla riga finale', async () => {
  azzera()
  const pezzi: string[] = []
  const testo = await abbonamento.inStreaming({ system: 'Chat.', messages: [{ role: 'user', content: 'Hi' }], silenzio: 10_000, onTesto: p => pezzi.push(p) })
  assert.equal(testo, 'Hello there.')
  assert.deepEqual(pezzi, ['Hello ', 'there.'])
  assert.deepEqual(righe(), [{ lavoro: 'risposta', motore: 'Claude account', entrata: 40, cache: 900, uscita: 7 }])
})

test('col tetto raggiunto non si lancia niente, e l’errore si riconosce come tetto', async () => {
  azzera()
  store.segnaUso({ lavoro: 'bozza', motore: 'Claude account', entrata: 800, cache: 0, uscita: 300 })
  cfg.aggiorna({ tetto: 1000 })
  await assert.rejects(
    () => abbonamento.chiedi({ system: 's', messages: [{ role: 'user', content: 'q' }], attesa: 10_000 }),
    (e: unknown) => delTetto(e) && (e as Error).message === TETTO_RAGGIUNTO
  )
  await assert.rejects(
    () => abbonamento.inStreaming({ system: 's', messages: [{ role: 'user', content: 'q' }], silenzio: 10_000, onTesto: () => {} }),
    (e: unknown) => delTetto(e)
  )
  assert.equal(lanci(), 0, 'ha lanciato Claude Code oltre il tetto')
  assert.equal(righe().length, 1, 'ha scritto una riga per una chiamata mai fatta')
})

test('sotto il tetto, o senza tetto, si lavora', async () => {
  azzera()
  store.segnaUso({ lavoro: 'bozza', motore: 'Claude account', entrata: 800, cache: 0, uscita: 100 })
  cfg.aggiorna({ tetto: 1000 })   // 900 su 1000: c'è ancora posto
  assert.equal(await abbonamento.chiedi({ system: 's', messages: [{ role: 'user', content: 'q' }], attesa: 10_000 }), 'Here is the outline.')
  // la cache non conta per il tetto: 5000 letti dalla cache non lo fanno scattare da soli
  cfg.aggiorna({ tetto: 0 })
  store.segnaUso({ lavoro: 'bozza', motore: 'Claude account', entrata: 10_000_000, cache: 0, uscita: 10_000_000 })
  assert.equal(await abbonamento.chiedi({ system: 's', messages: [{ role: 'user', content: 'q' }], attesa: 10_000 }), 'Here is the outline.')
  assert.equal(lanci(), 2)
})

test('dalla porta di sempre: modello.chiedi conta la chiamata con il suo lavoro', async () => {
  azzera()
  const r = await mod.chiedi({ lavoro: 'punto', system: 'Summarize.', messages: [{ role: 'user', content: 'Day?' }], max_tokens: 500 })
  assert.equal(r.da, 'abbonamento')
  assert.deepEqual(righe().map(x => [x.lavoro, x.motore]), [['punto', 'Claude account']])
  assert.equal(mod.usoDiOggi().entrata, 150)
})

test('dalla porta di sempre, il tetto non mette a riposo l’account e non cerca una chiave', async () => {
  azzera()
  store.segnaUso({ lavoro: 'bozza', motore: 'Claude account', entrata: 5000, cache: 0, uscita: 0 })
  cfg.aggiorna({ tetto: 1000 })
  await assert.rejects(
    () => mod.chiedi({ lavoro: 'punto', system: 's', messages: [{ role: 'user', content: 'q' }], max_tokens: 100 }),
    (e: unknown) => (e as Error).message === TETTO_RAGGIUNTO
  )
  assert.equal(lanci(), 0)
  // il contro-caso che conta: il riposo di cinque minuti è per un account che
  // non risponde, non per un tetto. Messo a riposo, il lavoro di domani
  // mattina (col tetto alzato) andrebbe sulla chiave, cioè costerebbe denaro
  assert.equal(abbonamento.disponibile(), true, 'il tetto ha messo a riposo l’account')
})

test('la busta: detta, parziale, assente', () => {
  assert.deepEqual(abbonamento.usoDellaBusta({ input_tokens: 3, output_tokens: 4 }, 'abcd', 'ab'), { entrata: 3, cache: 0, uscita: 4, stima: false })
  assert.deepEqual(abbonamento.usoDellaBusta({ input_tokens: 3 }, 'abcdefgh', 'abcde'), { entrata: 2, cache: 0, uscita: 2, stima: true })
  assert.deepEqual(abbonamento.usoDellaBusta(undefined, '', ''), { entrata: 0, cache: 0, uscita: 0, stima: true })
  assert.deepEqual(abbonamento.usoDellaBusta({ input_tokens: -1, output_tokens: 'x' }, 'abcd', ''), { entrata: 1, cache: 0, uscita: 0, stima: true })
})
