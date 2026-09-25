// La prova dal vivo, con un Claude Code finto: gira sui suoi dati, entro il
// tetto, senza la chiave API e senza toccare ~/.myynd.
//
//   node --test server/valuta-lavoro.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CORPUS, giudicaCaso, leggiArgomenti, totali } from './valuta-lavoro.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-valuta-lavoro-'))
const DATI = join(CASA, 'dati-prova')
after(() => rmSync(CASA, { recursive: true, force: true }))

/**
 * Claude Code finto: risponde con la busta JSON che `abbonamento.ts` legge.
 * Guarda il prompt di sistema (che arriva come argomento) per rispondere con
 * la forma giusta a chi classifica, a chi pesa e al revisore; a chi svolge
 * risponde una consegna con la cifra del listino. Scrive l'ambiente che vede.
 */
const FINTO = `#!/bin/sh
env | grep -E '^(ANTHROPIC_API_KEY|HOME|MYYND_DATI)=' >> "$FC_DIR/ambiente"
echo "$*" >> "$FC_DIR/chiamate"
cat > /dev/null
if [ "$1" = "auth" ]; then echo '{"loggedIn":true}'; exit 0; fi
busta() { printf '{"type":"result","subtype":"success","is_error":false,"result":%s}\\n' "$1"; }
case "$*" in
  *"Guardi il risultato di un compito"*) busta '"{\\"chiede\\":false,\\"manca\\":[],\\"domanda\\":\\"\\",\\"visto\\":\\"\\"}"' ;;
  *"di che genere è il dato che manca"*) busta '"{\\"genere\\":\\"data\\",\\"costo\\":\\"basso\\"}"' ;;
  *"Sei il revisore di un lavoro"*) busta '"{\\"esito\\":\\"pass\\",\\"per\\":\\"Marco\\",\\"comeTe\\":\\"ok\\",\\"comeLoro\\":\\"ok\\",\\"problemi\\":[],\\"verificato\\":[\\"the price\\"]}"' ;;
  *) busta '"Done: the reply to Marco, with the price from the list.\\n\\nCiao Marco,\\n\\nil corso da dodici persone costa 890 euro a persona, come da listino, con la consegna in tre settimane dalla firma.\\n\\nA presto,\\nAlex\\n\\nPrice from the price list [1]."' ;;
esac
`

test('giudicaCaso: un intero passa senza domande e senza dati inventati; un duro passa con una domanda sola', () => {
  const intero = CORPUS.find(c => c.id === 'v01')!
  assert.deepEqual(giudicaCaso(intero, { mossa: 'produci', testo: 'Ciao Marco, 890 euro a persona.', domanda: '' }), { ok: true, motivo: 'produci' })
  assert.equal(giudicaCaso(intero, { mossa: 'produci', testo: 'Ciao Marco, 980 euro a persona.', domanda: '' }).ok, false)
  assert.match(giudicaCaso(intero, { mossa: 'produci', testo: 'Ciao Marco, 980 EUR a persona.', domanda: '' }).motivo, /dato inventato/)
  assert.equal(giudicaCaso(intero, { mossa: 'chiedi', testo: '', domanda: 'Which price?' }).ok, false)
  assert.equal(giudicaCaso(intero, { mossa: 'presumi', testo: 'Ciao Marco, 890.', domanda: '' }).ok, true)
  const duro = CORPUS.find(c => c.id === 'd01')!
  assert.deepEqual(giudicaCaso(duro, { mossa: 'chiedi', testo: '', domanda: 'Where is the signed contract?' }), { ok: true, motivo: 'una domanda' })
  assert.equal(giudicaCaso(duro, { mossa: 'chiedi', testo: '', domanda: 'Where is it? And who signs?' }).ok, false)
  assert.equal(giudicaCaso(duro, { mossa: 'produci', testo: 'Done.', domanda: '' }).ok, false)
  assert.equal(CORPUS.length, 14)
  assert.equal(CORPUS.filter(c => c.duro).length, 4)
  assert.deepEqual(totali([]), { interi: 0, interiOk: 0, duri: 0, duriOk: 0, inventati: 0 })
  assert.deepEqual(leggiArgomenti(['--vivo', '--dati', '/x', '--tetto', '3']), { vivo: true, dati: '/x', tetto: 3, solo: null, aiuto: false, sbagliato: null })
})

test('--vivo gira il corpo sui suoi dati con il Claude Code finto, entro il tetto, senza chiave e senza ~/.myynd', () => {
  const cli = fileURLToPath(new URL('./valuta-lavoro.ts', import.meta.url))
  const fc = join(CASA, 'fc'); mkdirSync(fc, { recursive: true })
  mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
  writeFileSync(join(CASA, '.local', 'bin', 'claude'), FINTO)
  chmodSync(join(CASA, '.local', 'bin', 'claude'), 0o755)
  const ambiente = { PATH: process.env.PATH, HOME: CASA, FC_DIR: fc, ANTHROPIC_API_KEY: 'sk-ant-non-deve-uscire', TMPDIR: CASA }

  // senza --dati si rifiuta; sulla casa vera pure, senza aprirla
  const senza = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', cli, '--vivo'], { env: ambiente, encoding: 'utf8' })
  assert.equal(senza.status, 2)
  assert.match(senza.stderr, /--dati/)
  mkdirSync(join(CASA, '.myynd'), { recursive: true })
  const vera = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', cli, '--vivo', '--dati', join(CASA, '.myynd')], { env: ambiente, encoding: 'utf8' })
  assert.equal(vera.status, 2)
  assert.match(vera.stderr, /dati veri/)
  assert.deepEqual(readdirSync(join(CASA, '.myynd')), [])

  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', cli, '--vivo', '--dati', DATI, '--tetto', '5'], { env: ambiente, encoding: 'utf8', timeout: 120_000 })
  assert.ok(r.status === 0 || r.status === 1, `uscito ${r.status}: ${r.stderr.slice(0, 800)}`)
  const rapporti = readdirSync(join(DATI, 'valutazioni')).filter(f => f.startsWith('lavoro-'))
  assert.equal(rapporti.length, 1, r.stdout + r.stderr)
  const rapporto = JSON.parse(readFileSync(join(DATI, 'valutazioni', rapporti[0]), 'utf8')) as { casi: { id: string; chiamate: number; mossa: string }[]; totali: { interi: number; duri: number } }
  assert.equal(rapporto.casi.length, 14)
  assert.ok(rapporto.casi.every(c => c.chiamate >= 1 && c.chiamate <= 5), JSON.stringify(rapporto.casi.map(c => [c.id, c.chiamate, c.mossa])))
  assert.deepEqual([rapporto.totali.interi, rapporto.totali.duri], [10, 4])
  // il finto ha risposto la stessa consegna a tutti: nessuna domanda e niente
  // inventato sugli interi (due mancano di una parola attesa), i duri no, e il conto lo dice
  assert.match(r.stdout, /Interi senza domande e senza dati inventati: (?:8|9|10)\/10 \(inventati: 0\)/)
  assert.match(r.stdout, /Duri con una domanda sola: 0\/4/)
  assert.ok(rapporto.casi.every(c => c.mossa === 'produci'))
  // la chiave API non è arrivata a Claude Code, e i dati sono quelli della prova
  const visto = readFileSync(join(fc, 'ambiente'), 'utf8')
  assert.ok(!visto.includes('ANTHROPIC_API_KEY'), 'la chiave è uscita verso Claude Code')
  assert.ok(visto.includes(`MYYND_DATI=${DATI}`))
  assert.deepEqual(readdirSync(join(CASA, '.myynd')), [], 'ha toccato ~/.myynd')
  assert.ok(existsSync(join(DATI, 'utenti')))
})
