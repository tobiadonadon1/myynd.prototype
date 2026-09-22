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
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

// Claude Code finto dove lo cerca Myynd (`~/.local/bin/claude`): risponde
// sempre con una busta JSON buona, come `claude -p --output-format json`.
mkdirSync(join(casa, '.local', 'bin'), { recursive: true })
const finto = join(casa, '.local', 'bin', 'claude')
writeFileSync(finto, '#!/bin/sh\ncat > /dev/null\necho \'{"type":"result","subtype":"success","is_error":false,"result":"Here is the outline."}\'\n')
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

test('con l’account Claude e nessuna chiave, «Myynd takes it» affida il lavoro invece di chiedere una chiave API', async () => {
  assert.equal((await chiama(conAccount, '/api/compiti', { id: 'riga', testo: 'Write the H-Farm audit outline' })).stato, 200)
  const r = await chiama(conAccount, '/api/compiti/riga/delega', { modo: 'tutto' })
  assert.equal(r.stato, 200, `rifiutato: ${r.dati.errore}`)
  assert.equal(r.dati.ok, true)
  assert.doesNotMatch(String(r.dati.errore ?? ''), /API/)
  // e il lavoro si fa davvero, sull'account: la riga torna pronta con quello
  // che ha scritto Claude Code, non ferma con un guaio
  let riga: { stato: string; risultato: string | null; guaio: string | null } | undefined
  for (let i = 0; i < 60; i++) {
    const l = await fetch(`${base}/api/compiti`, { headers: { authorization: `Bearer ${conAccount}` } })
    riga = ((await l.json()) as { compiti: (NonNullable<typeof riga> & { id: string })[] }).compiti.find(c => c.id === 'riga')
    if (riga && riga.stato !== 'delegato') break
    await new Promise(r2 => setTimeout(r2, 250))
  }
  assert.ok(riga, 'la riga è sparita')
  assert.equal(riga.guaio ?? null, null, `si è fermata: ${riga.guaio}`)
  assert.match(String(riga.risultato), /Here is the outline/)
})

test('senza chiave e senza account si dice cosa collegare, non si finge di lavorare', async () => {
  assert.equal((await chiama(senzaNiente, '/api/compiti', { id: 'riga', testo: 'Write the H-Farm audit outline' })).stato, 200)
  const r = await chiama(senzaNiente, '/api/compiti/riga/delega', { modo: 'tutto' })
  assert.equal(r.stato, 400)
  assert.match(String(r.dati.errore), /Collega Claude|Connect Claude/)
})
