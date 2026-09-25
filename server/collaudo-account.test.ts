// L'account Claude che non risponde, dentro una prova (P6).
//
// Fuori dalla prova un account che fallisce va a riposo per cinque minuti e il
// lavoro passa alla chiave: è il comportamento di oggi. Dentro no: la prova si
// ferma «occupato», l'account non va a riposo, e la chiave non si tocca. Qui un
// `claude` finto che fallisce sempre, e un server finto al posto di Anthropic
// che conta le chiamate con la chiave.
//
//   node --test server/collaudo-account.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-collaudo-account-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, 'dati')
mkdirSync(join(CASA, 'dati'), { recursive: true })
mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
const finto = join(CASA, '.local', 'bin', 'claude')
writeFileSync(finto, `#!/bin/sh
case "$*" in
  *auth*) echo '{"loggedIn":true}'; exit 0 ;;
esac
cat > /dev/null
echo 'rate limited' >&2
exit 1
`)
chmodSync(finto, 0o755)

let colChiave = 0
const anthropic = createServer((_req, res) => { colChiave++; res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"type":"error","error":{"type":"api_error","message":"no"}}') })
await new Promise<void>(r => anthropic.listen(0, '127.0.0.1', r))
const porta = (anthropic.address() as { port: number }).port
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${porta}`

writeFileSync(join(CASA, 'dati', 'config.json'), JSON.stringify({
  lingua: 'en', claudeCon: 'abbonamento', claude: { apiKey: 'sk-ant-prova' },
  posta: { host: 'imap.example.test', porta: 993, utente: 'alex@example.com', password: 'x' }
}), { mode: 0o600 })

const store = await import('./store.ts')
const auto = await import('./automazioni.ts')
const collaudo = await import('./collaudo.ts')
const abbonamento = await import('./abbonamento.ts')
const mod = await import('./modello.ts')

after(() => {
  auto.perProva(null); collaudo.perProva(null)
  anthropic.close()
  delete process.env.ANTHROPIC_BASE_URL
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const ORA = Date.now()
store.salvaDocumenti([0, 1, 2].map(i => ({
  id: `posta:q${i}`, fonte: 'posta', tipo: 'email', titolo: `Quote request ${i}`, corpo: 'Could you send a quote?',
  autore: 'Dana <dana@example.com>', quando: new Date(ORA - (5 + i * 3) * 86_400_000).toISOString(), filo: `f${i}`
})) as never)

test('dentro la prova un account che fallisce ferma la prova «occupato», senza riposo e senza chiave', async () => {
  assert.equal(abbonamento.disponibile(), true, 'la strada dell\'account è pronta')
  auto.perProva({
    collegato: () => true,
    chiediJSON: async o => {
      const docs = JSON.parse(String(o.messages[0].content)) as { id: string }[]
      return { righe: docs.map(d => ({ doc: d.id, testo: 'Reply to Dana' })) }
    }
  })
  // il giudice è quello vero: passa dall'account, che fallisce
  collaudo.perProva({ collegato: () => true, stesura: { ...(await import('./stesura.ts')).FERRI_STESURA, svolgi: (async () => ({ testo: 'Hi Dana.', fonti: [] })) as never, chiedeAiuto: async () => ({ chiede: false, domanda: '' }), pesaLaDomanda: async () => null, giudica: (async () => ({ esito: 'pass', problemi: [] })) as never, voce: () => null } })
  const a = auto.scrivi({
    id: 'risposte', nome: 'Replies', spiega: 'x', quando: { quandoArriva: true }, guarda: { soloNuovi: true, limite: 8 },
    fai: 'One row per reply.', metti: { inLista: 'oggi', modo: 'io', perDocumento: true }, attrezzi: ['posta.leggi'],
    en: { nome: 'Replies', spiega: 'x', fai: 'One row per reply.' }
  })
  auto.accendi(a.id, false)
  const v = collaudo.avvia(auto.ricette().find(x => x.id === a.id)!)
  await collaudo.finche(30_000)
  assert.equal(collaudo.vista(v.id)!.stato, 'occupato')
  assert.equal(abbonamento.disponibile(), true, 'l\'account non va a riposo')
  assert.equal(colChiave, 0, 'la chiave non si tocca')
})

test('fuori dalla prova il comportamento di oggi: riposo e chiave (controcaso)', async () => {
  const r = await mod.chiediJSON({ lavoro: 'collaudo', system: 'x', messages: [{ role: 'user', content: 'x' }], max_tokens: 10, formato: { type: 'object' } })
  assert.equal(r, null)
  assert.ok(colChiave > 0, 'la chiave è stata provata')
  assert.equal(abbonamento.disponibile(), false, 'l\'account è a riposo')
})
