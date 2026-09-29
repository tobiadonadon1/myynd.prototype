// «Myynd takes it» con l'account Claude, senza chiave API.
//
// Il 22 settembre 2026, con l'account Claude acceso e nessuna chiave, affidare
// una riga rispondeva «Per le bozze serve una chiave API o un fornitore:
// l'abbonamento basta per la chat». Era falso: `svolgi` lavora
// sull'abbonamento da tempo — il materiale lo trova Myynd, all'account si
// chiede una passata sola — ma la rotta guardava `motore()`, che l'account
// non lo conta. Qui il server vero, un `claude` finto nella casa di prova, e
// le due strade: con l'account si affida, senza niente si dice cosa collegare.
//
//   node --test server/delega-abbonamento.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dati = mkdtempSync(join(tmpdir(), 'myynd-delega-dati-'))
const casa = mkdtempSync(join(tmpdir(), 'myynd-delega-casa-'))
process.env.MYYND_DATI = dati
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')

// Claude Code finto dove lo cerca Myynd (`~/.local/bin/claude`): risponde con
// una busta JSON buona, come `claude -p --output-format json`. F8 · quando il
// prompt di sistema porta gli attrezzi (lo schema `{ text, calls }`), tiene il
// conto dei giri nella casa di prova: al primo chiede `scrivi_file`, poi
// scrive la riga finale. Al revisore dice «passa» nella sua forma; al resto
// risponde una riga, come prima.
mkdirSync(join(casa, '.local', 'bin'), { recursive: true })
const finto = join(casa, '.local', 'bin', 'claude')
writeFileSync(finto, `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path')
const args = process.argv.slice(2)
if (args[0] === 'auth') { console.log('{"loggedIn":true}'); process.exit(0) }
if (args[0] === '--help') { process.exit(0) }
let dentro = ''
process.stdin.on('data', d => { dentro += d })
process.stdin.on('end', () => {
  const sistema = args[args.indexOf('--system-prompt') + 1] || ''
  fs.appendFileSync(path.join(process.env.HOME, 'argomenti.jsonl'), JSON.stringify(args.filter(a => a !== sistema)) + '\\n')
  let result = 'Here is the outline.'
  if (sistema.includes('calls (requested Myynd functions)')) {
    const f = path.join(process.env.HOME, 'giri.txt')
    const n = (fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8')) : 0) + 1
    fs.writeFileSync(f, String(n))
    result = n === 1
      ? JSON.stringify({ text: '', calls: [{ name: 'scrivi_file', arguments: JSON.stringify({ percorso: 'h-farm-outline.md', testo: '# H-Farm audit outline\\n\\n1. Scope\\n2. Interviews\\n3. Findings' }) }] })
      : JSON.stringify({ text: 'Done: the outline is saved as h-farm-outline.md.\\n\\nHere is the outline: scope, interviews, findings.', calls: [] })
  } else if (sistema.includes('"comeLoro"')) {
    result = JSON.stringify({ esito: 'pass', per: 'chi legge', comeTe: 'Va bene così.', comeLoro: 'Chiaro.', problemi: [], verificato: ['Il file c’è.'], criterio: 'met', criterioPerche: 'The outline is saved as a file.' })
  }
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, usage: { input_tokens: 100, output_tokens: 20 } }))
})
`)
chmodSync(finto, 0o755)

let servizio: ChildProcess | undefined
let base = ''
const conAccount = 'delega-con-account'
const senzaNiente = 'delega-senza-niente'

before(async () => {
  for (const [token, email, config] of [
    [conAccount, 'account@example.com', { lingua: 'en', motore: 'claude', claudeCon: 'abbonamento' }],
    [senzaNiente, 'nothing@example.com', { lingua: 'en' }]
  ] as const) {
    const a = await conti.registra(email, 'isolated-test-password')
    assert.ok(a.ok)
    await conti.perProva.apriCon(token, a.id)
    chi.dentro(a.id, () => cfg.scrivi(config as never))
  }
  store.chiudiIndici()
  servizio = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: casa, MYYND_DATI: dati, MYYND_PORT: '0', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe']
  })
  base = await new Promise<string>((ok, no) => {
    const scade = setTimeout(() => no(new Error('il server non è partito')), 15_000)
    let fuori = ''
    servizio!.stdout!.on('data', c => {
      fuori += String(c)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { clearTimeout(scade); ok(m[1]) }
    })
    servizio!.on('exit', c => { clearTimeout(scade); no(new Error(`il server è uscito ${c}`)) })
  })
})

after(async () => {
  if (servizio && servizio.exitCode === null) {
    const spento = new Promise<void>(r => servizio!.once('exit', () => r()))
    servizio.kill('SIGTERM')
    await spento
  }
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(dati, { recursive: true, force: true })
  rmSync(casa, { recursive: true, force: true })
})

async function chiama(token: string, strada: string, corpo: object) {
  const r = await fetch(base + strada, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo)
  })
  return { stato: r.status, dati: await r.json() as { ok?: boolean; errore?: string } }
}

test('con l’account Claude e nessuna chiave, «Myynd takes it» affida il lavoro, e il giro intero scrive il file (F8)', async () => {
  assert.equal((await chiama(conAccount, '/api/compiti', { id: 'riga', testo: 'Write the H-Farm audit outline and save it as a markdown file' })).stato, 200)
  const r = await chiama(conAccount, '/api/compiti/riga/delega', { modo: 'tutto' })
  assert.equal(r.stato, 200, `rifiutato: ${r.dati.errore}`)
  assert.equal(r.dati.ok, true)
  assert.doesNotMatch(String(r.dati.errore ?? ''), /API/)
  // e il lavoro si fa davvero, sull'account: la riga torna pronta, con il
  // file scritto dalla mano al primo giro e la prova del «fatto» che regge
  type Riga = { stato: string; risultato: string | null; guaio: string | null; prova?: { esito: string } | null }
  let riga: Riga | undefined
  for (let i = 0; i < 80; i++) {
    const l = await fetch(`${base}/api/compiti`, { headers: { authorization: `Bearer ${conAccount}` } })
    riga = ((await l.json()) as { compiti: (Riga & { id: string })[] }).compiti.find(c => c.id === 'riga')
    if (riga && riga.stato !== 'delegato') break
    await new Promise(r2 => setTimeout(r2, 250))
  }
  assert.ok(riga, 'la riga è sparita')
  assert.equal(riga.guaio ?? null, null, `si è fermata: ${riga.guaio}`)
  assert.equal(riga.stato, 'pronto')
  assert.match(String(riga.risultato), /h-farm-outline\.md/)
  assert.ok(Number(readFileSync(join(casa, 'giri.txt'), 'utf8')) >= 2, 'almeno due giri sull’account')
  const scritto = cerca(casa, 'h-farm-outline.md')
  assert.ok(scritto, 'il file non è nella casa di prova')
  assert.match(readFileSync(scritto, 'utf8'), /H-Farm audit outline/)
  assert.equal(riga.prova?.esito, 'pass', `la prova: ${JSON.stringify(riga.prova)}`)
  // il recinto di Claude Code: nessun attrezzo nativo, nessun server MCP
  const lanci = readFileSync(join(casa, 'argomenti.jsonl'), 'utf8').trim().split('\n').map(x => JSON.parse(x) as string[])
  for (const a of lanci) {
    assert.ok(a.includes('--disallowed-tools') && a.includes('Bash') && a.includes('Write'))
    assert.ok(!a.includes('--allowedTools') && !a.includes('--mcp-config'))
  }
})

/** Il primo file con quel nome sotto la casa di prova. */
function cerca(dove: string, nome: string): string | null {
  for (const e of readdirSync(dove, { withFileTypes: true })) {
    const p = join(dove, e.name)
    if (e.isFile() && e.name === nome) return p
    if (e.isDirectory() && !e.isSymbolicLink()) { const t = cerca(p, nome); if (t) return t }
  }
  return null
}

test('senza chiave e senza account si dice cosa collegare, non si finge di lavorare', async () => {
  assert.equal((await chiama(senzaNiente, '/api/compiti', { id: 'riga', testo: 'Write the H-Farm audit outline' })).stato, 200)
  const r = await chiama(senzaNiente, '/api/compiti/riga/delega', { modo: 'tutto' })
  assert.equal(r.stato, 400)
  assert.match(String(r.dati.errore), /Collega Claude|Connect Claude/)
})
