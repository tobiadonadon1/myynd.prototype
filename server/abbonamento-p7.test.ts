// L'account Claude dopo P7: niente trascrizioni (`--no-session-persistence`),
// con la ritirata per un `claude` vecchio; la chat sull'account torna
// `via abbonamento`, estratti interi, senza la riga «cerca prima»; e dentro
// la prova l'uso porta l'etichetta.
//
//   node --test server/abbonamento-p7.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-abbonamento-p7-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY

const ARGS = join(CASA, 'argomenti.txt')
process.env.FINTO_ARGS = ARGS
mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
const finto = join(CASA, '.local', 'bin', 'claude')
writeFileSync(finto, `#!/bin/sh
cat > /dev/null
echo "$*" >> "$FINTO_ARGS"
if [ "$FINTO_VECCHIO" = "1" ]; then
  case "$*" in
    *--no-session-persistence*) echo "error: unknown option '--no-session-persistence'" >&2; exit 1 ;;
  esac
fi
case "$*" in
  *stream-json*)
    echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"The fee is €4,800 [1]."}}}'
    echo '{"type":"result","subtype":"success","is_error":false,"result":"The fee is €4,800 [1].","usage":{"input_tokens":40,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":7}}'
    ;;
  *)
    echo '{"type":"result","subtype":"success","is_error":false,"result":"Here is the outline.","usage":{"input_tokens":100,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":20}}'
    ;;
esac
`)
chmodSync(finto, 0o755)

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const abbonamento = await import('./abbonamento.ts')
const claude = await import('./claude.ts')
const { conEtichetta } = await import('./etichetta-uso.ts')

const lanci = () => existsSync(ARGS) ? readFileSync(ARGS, 'utf8').split('\n').filter(Boolean) : []
const righe = () => (store.default.prepare('SELECT lavoro, motore FROM uso ORDER BY rowid').all() as { lavoro: string; motore: string }[])
const HARBOR = 'Hi Alex, we confirm the Harbor pilot starts on 14 October 2026. The fee is €4,800 for the first phase. Nora'

before(() => {
  cfg.scrivi({ lingua: 'en', claudeCon: 'abbonamento', tetto: 0, diSerie: false, onboarding: true, giro: true })
  store.salvaDocumenti([{ id: 'posta:INBOX:701', fonte: 'posta', tipo: 'email', titolo: 'Harbor pilot kickoff', corpo: HARBOR, autore: 'Nora <n@h.example>', quando: new Date().toISOString() }])
})
after(() => {
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  delete process.env.FINTO_ARGS
  delete process.env.FINTO_VECCHIO
  rmSync(CASA, { recursive: true, force: true })
})

function azzera() {
  store.default.exec('DELETE FROM uso')
  rmSync(ARGS, { force: true })
  delete process.env.FINTO_VECCHIO
  abbonamento.riprova()
  abbonamento.dimenticaLaVersione()
}

test('«--no-session-persistence» sta negli argomenti, per json e per stream-json', async () => {
  azzera()
  await abbonamento.chiedi({ system: 'Be brief.', messages: [{ role: 'user', content: 'Outline?' }], attesa: 10_000, lavoro: 'bozza' })
  await abbonamento.inStreaming({ system: 'Chat.', messages: [{ role: 'user', content: 'Hi' }], silenzio: 10_000, onTesto: () => {} })
  const l = lanci()
  assert.equal(l.length, 2)
  assert.ok(l.every(a => a.includes('--no-session-persistence')), l.join('\n'))
  assert.ok(l.every(a => a.indexOf('-p') < a.indexOf('--no-session-persistence')))
})

test('un claude che non conosce l’opzione: si ritenta senza, e da lì in poi non si passa più', async () => {
  azzera()
  process.env.FINTO_VECCHIO = '1'
  const testo = await abbonamento.chiedi({ system: 'Be brief.', messages: [{ role: 'user', content: 'Outline?' }], attesa: 10_000, lavoro: 'bozza' })
  assert.equal(testo, 'Here is the outline.')
  let l = lanci()
  assert.equal(l.length, 2, 'uno che cade, uno che passa')
  assert.ok(l[0].includes('--no-session-persistence') && !l[1].includes('--no-session-persistence'))
  const chat = await abbonamento.inStreaming({ system: 'Chat.', messages: [{ role: 'user', content: 'Hi' }], silenzio: 10_000, onTesto: () => {} })
  assert.equal(chat, 'The fee is €4,800 [1].')
  l = lanci()
  assert.equal(l.length, 3, 'la chiamata dopo non ci riprova nemmeno')
  assert.ok(!l[2].includes('--no-session-persistence'))
})

test('la chat sull’account: via abbonamento, estratti da quattromila, senza «cerca prima»; nella prova l’uso è «prova:risposta»', async () => {
  azzera()
  assert.ok(abbonamento.disponibile(), 'il claude finto è quello dell’account')
  const r = await conEtichetta('prova', () => claude.rispondiInStreaming('What is the fee for the Harbor pilot?', [], () => {}, undefined, undefined, undefined, { prova: true }))
  assert.equal(r.verifica.via, 'abbonamento')
  assert.equal(r.verifica.ricominciata, false)
  assert.deepEqual(r.estratti, { 'posta:INBOX:701': 4000 })
  assert.ok(r.fonti[0].passo?.includes('€4,800'))
  // il prompt di sistema va a capo: si legge il file intero, che azzera() ha appena svuotato
  const prompt = readFileSync(ARGS, 'utf8')
  assert.ok(prompt.includes('I don’t have that.'), 'la riga del rifiuto nel prompt')
  assert.ok(!prompt.includes(claude.REGOLA_CERCA_PRIMA.trim()), 'senza strumenti, niente «cerca prima»')
  assert.ok(prompt.includes('[M]'), 'la regola della memoria c’è')
  assert.deepEqual(righe().map(x => x.lavoro), ['prova:risposta'])
  assert.equal(righe()[0].motore, 'Claude account')
  // e fuori dalla prova la stessa chat conta come «risposta»
  await claude.rispondiInStreaming('What is the fee for the Harbor pilot?', [], () => {})
  assert.deepEqual(righe().map(x => x.lavoro), ['prova:risposta', 'risposta'])
})
