// Le opzioni nuove di `claude` (P10): solo quando la versione installata le
// elenca, guardate di fondo, e una volta sola indietro se poi le rifiuta.
//
//   node --test server/bandiere-cli.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-bandiere-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY

const ARGS = join(CASA, 'argomenti.txt')
const AIUTO = join(CASA, 'aiuto.txt')
process.env.FINTO_ARGS = ARGS
process.env.FINTO_AIUTO = AIUTO
mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
const finto = join(CASA, '.local', 'bin', 'claude')
// ogni lancio scrive i suoi argomenti su una riga, separati da «|» (così si vede anche '')
writeFileSync(finto, `#!/bin/sh
if [ "$1" = "--help" ]; then cat "$FINTO_AIUTO"; exit 0; fi
cat > /dev/null
printf '%s|' "$@" >> "$FINTO_ARGS"; echo >> "$FINTO_ARGS"
if [ "$FINTO_RIFIUTA" = "1" ]; then
  case "$*" in
    *--tools*) echo "error: unknown option '--tools'" >&2; exit 1 ;;
  esac
fi
case "$*" in
  *stream-json*)
    echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Friday."}}}'
    echo '{"type":"result","subtype":"success","is_error":false,"result":"Friday.","usage":{"input_tokens":40,"output_tokens":2}}'
    ;;
  *) echo '{"type":"result","subtype":"success","is_error":false,"result":"Done.","usage":{"input_tokens":10,"output_tokens":2}}' ;;
esac
`)
chmodSync(finto, 0o755)
const CON_TUTTO = 'Usage: claude [options]\n  --tools <tools...>\n  --no-session-persistence\n  --effort <level>\n'
writeFileSync(AIUTO, CON_TUTTO)

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const abbonamento = await import('./abbonamento.ts')
const bandiere = await import('./bandiere-cli.ts')

const lanci = () => existsSync(ARGS) ? readFileSync(ARGS, 'utf8').split('\n').filter(Boolean).map(r => r.split('|').slice(0, -1)) : []
const chiedi = () => abbonamento.chiedi({ system: 'Be brief.', messages: [{ role: 'user', content: 'Outline?' }], attesa: 10_000, lavoro: 'bozza' })
const flusso = (sforzo?: 'low') => abbonamento.inStreaming({ system: 'Chat.', messages: [{ role: 'user', content: 'When?' }], silenzio: 10_000, onTesto: () => {}, sforzo })

cfg.scrivi({ lingua: 'en', claudeCon: 'abbonamento', tetto: 0, diSerie: false, onboarding: true, giro: true })
beforeEach(() => {
  rmSync(ARGS, { force: true })
  delete process.env.FINTO_RIFIUTA
  writeFileSync(AIUTO, CON_TUTTO)
  bandiere.perProva()
  abbonamento.riprova()
  abbonamento.dimenticaLaVersione()
})
after(() => {
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

test('prima della sonda non si sa niente, e gli argomenti sono quelli di sempre', async () => {
  assert.equal(bandiere.note(finto), null)
  await chiedi(); await flusso('low')
  for (const a of lanci()) {
    assert.ok(!a.includes('--tools'), a.join(' '))
    assert.ok(!a.includes('--effort'), a.join(' '))
    assert.ok(a.includes('--no-session-persistence'))
    assert.equal(a.at(-1 - (a.length - 1 - a.indexOf('--disallowed-tools'))), '--disallowed-tools')
  }
})

test('con la sonda: --tools \'\' prima di --disallowed-tools; --effort low solo sulla chat secca', async () => {
  const b = await bandiere.sonda(finto)
  assert.deepEqual(b, { tools: true, sessione: true, effort: true })
  await chiedi()
  await flusso()
  await flusso('low')
  const [intero, normale, secca] = lanci()
  for (const a of [intero, normale, secca]) {
    const i = a.indexOf('--tools')
    assert.ok(i > 0, a.join(' '))
    assert.equal(a[i + 1], '')
    assert.ok(i < a.indexOf('--disallowed-tools'))
  }
  assert.ok(!intero.includes('--effort'), '`chiedi` non chiede mai meno sforzo')
  assert.ok(!normale.includes('--effort'))
  const e = secca.indexOf('--effort')
  assert.ok(e > 0 && secca[e + 1] === 'low' && e < secca.indexOf('--disallowed-tools'))
})

test('senza --effort nell’aiuto, niente --effort nemmeno per la chat secca', async () => {
  writeFileSync(AIUTO, 'Usage: claude\n  --tools <tools...>\n')
  await bandiere.sonda(finto)
  await flusso('low')
  const [a] = lanci()
  assert.ok(a.includes('--tools') && !a.includes('--effort'))
})

test('un claude aggiornato (file cambiato) si riguarda da capo', async () => {
  await bandiere.sonda(finto)
  assert.equal(bandiere.note(finto)?.effort, true)
  writeFileSync(AIUTO, 'Usage: claude\n')
  const dopo = new Date(Date.now() + 5000)
  utimesSync(finto, dopo, dopo)
  assert.equal(bandiere.note(finto), null, 'la versione nuova non è ancora stata guardata')
  assert.deepEqual(await bandiere.sonda(finto), { tools: false, sessione: false, effort: false })
})

test('elencata ma rifiutata: un ritentativo senza, e da lì in poi niente opzioni nuove', async () => {
  await bandiere.sonda(finto)
  process.env.FINTO_RIFIUTA = '1'
  const testo = await chiedi()
  assert.equal(testo, 'Done.')
  let l = lanci()
  assert.equal(l.length, 2, 'uno che cade, uno che passa')
  assert.ok(l[0].includes('--tools') && !l[1].includes('--tools'))
  rmSync(ARGS, { force: true })
  await flusso('low')
  l = lanci()
  assert.equal(l.length, 1)
  assert.ok(!l[0].includes('--tools') && !l[0].includes('--effort'))
})
