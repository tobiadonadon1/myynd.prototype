// Il recinto della verifica: uno script di prova cattivo dentro `npm test`
// non vede le chiavi, non esce in rete, non scrive fuori dalla copia, non
// legge i segreti. E un `npm test` normale con node gira ancora.
//
//   node --import ./build/test-profile.mjs --test server/recinto.test.ts

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeInCopy } from './esecuzione-isolata.ts'
import { execFileSync, spawnSync } from 'node:child_process'
import { ambienteClaude, ambienteMinimo, pathPulita, perProvaSandbox, profilo, profiloClaude, sandboxDisponibile, segreti } from './recinto.ts'

const mac = process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec')
const dati = process.env.MYYND_DATI!
const prima = { ...process.env }
after(() => { perProvaSandbox(); for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MYYND_SEGRETO', 'GITHUB_TOKEN']) { if (prima[k] === undefined) delete process.env[k]; else process.env[k] = prima[k] } })

/** Lo script cattivo: prova tutto, scrive l'esito nella copia, ed esce 0 (la verifica passa se node gira). */
const cattivo = (fuori: string) => `
import fs from 'node:fs'
const r = {}
const prova = async (k, f) => { try { await f(); r[k] = 'ok' } catch (e) { r[k] = 'blocked ' + (e.cause?.code || e.code || e.message) } }
await prova('fetchNome', () => fetch('https://example.com', { signal: AbortSignal.timeout(4000) }))
await prova('fetchIp', () => fetch('https://1.1.1.1', { signal: AbortSignal.timeout(4000) }))
await prova('scriviFuori', () => fs.writeFileSync(${JSON.stringify(fuori)}, 'x'))
await prova('leggiSegreto', () => fs.readFileSync(${JSON.stringify(join(dati, 'config.json'))}))
await prova('leggiSsh', () => fs.readdirSync(${JSON.stringify(join(homedir(), '.ssh'))}))
await prova('scriviCasaVera', () => fs.writeFileSync(${JSON.stringify(join(homedir(), '.myynd-recinto-prova'))}, 'x'))
r.env = Object.keys(process.env).sort()
r.chiavi = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MYYND_SEGRETO', 'GITHUB_TOKEN'].filter(k => process.env[k])
fs.writeFileSync('esito.json', JSON.stringify(r))
`

async function progettoCattivo(fuori: string): Promise<{ root: string; base: string }> {
  const base = await mkdtemp(join(tmpdir(), 'myynd-recinto-'))
  const root = join(base, 'source')
  await mkdir(root)
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node cattivo.mjs' } }))
  await writeFile(join(root, 'cattivo.mjs'), cattivo(fuori))
  return { root, base }
}

test('lo script dentro npm test non vede chiavi, rete, segreti, e non scrive fuori; npm test gira', { skip: !mac && 'serve sandbox-exec' }, async () => {
  perProvaSandbox()
  assert.equal(await sandboxDisponibile(), true)
  await writeFile(join(dati, 'config.json'), '{"claude":{"apiKey":"sk-ant-segretissima"}}')
  process.env.ANTHROPIC_API_KEY = 'sk-ant-prova-recinto'
  process.env.OPENAI_API_KEY = 'sk-openai-prova'
  process.env.MYYND_SEGRETO = 'x'
  process.env.GITHUB_TOKEN = 'ghp_prova'
  const fuoriDir = await mkdtemp(join(tmpdir(), 'myynd-recinto-fuori-'))
  const fuori = join(fuoriDir, 'scritto.txt')
  const { root, base } = await progettoCattivo(fuori)
  try {
    // senza baseDir: la copia sta dentro la cartella di Myynd, che per tutto il resto è chiusa
    const report = await executeInCopy(root, async workspace => {
      await writeFile(join(workspace, 'README.md'), 'changed\n')
      return { exitCode: 0, finished: true, text: 'ok' }
    })
    assert.equal(report.verification.status, 'passed', report.verification.output ?? '')
    assert.equal(report.verification.containment, 'sandbox')
    assert.equal(report.state, 'verified')
    const esito = JSON.parse(await readFile(join(report.workspace, 'esito.json'), 'utf8')) as Record<string, unknown>
    assert.deepEqual(esito.chiavi, [], 'nessuna chiave nell’ambiente')
    assert.deepEqual(esito.env, ['CI', 'HOME', 'LANG', 'PATH', 'TMPDIR'].concat((esito.env as string[]).filter(k => !['CI', 'HOME', 'LANG', 'PATH', 'TMPDIR'].includes(k) && /^(npm_|NODE|INIT_CWD|COLOR|EDITOR|SHLVL|PWD|_|__CF)/.test(k))).sort(),
      'solo l’ambiente minimo, più quello che npm aggiunge da sé')
    for (const k of ['fetchNome', 'fetchIp', 'scriviFuori', 'leggiSegreto', 'leggiSsh', 'scriviCasaVera']) {
      assert.match(String(esito[k]), /^blocked/, `${k}: ${esito[k]}`)
    }
    assert.equal(existsSync(fuori), false, 'niente scritto fuori dalla copia')
    assert.equal(existsSync(join(homedir(), '.myynd-recinto-prova')), false)
  } finally {
    await rm(base, { recursive: true, force: true })
    await rm(fuoriDir, { recursive: true, force: true })
  }
})

test('senza sandbox-exec la verifica gira con l’ambiente minimo e lo dice: parziale', async () => {
  perProvaSandbox(false)
  process.env.ANTHROPIC_API_KEY = 'sk-ant-prova-recinto'
  const base = await mkdtemp(join(tmpdir(), 'myynd-recinto-p-'))
  const root = join(base, 'source')
  await mkdir(root)
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node chiavi.mjs' } }))
  await writeFile(join(root, 'chiavi.mjs'), "import fs from 'node:fs'; fs.writeFileSync('chiavi.json', JSON.stringify(Object.keys(process.env).filter(k => /KEY|TOKEN|MYYND/.test(k))))\n")
  try {
    const report = await executeInCopy(root, async workspace => {
      await writeFile(join(workspace, 'x.txt'), 'x')
      return { exitCode: 0, finished: true, text: 'ok' }
    }, { baseDir: join(base, 'copie') })
    assert.equal(report.verification.status, 'passed', report.verification.output ?? '')
    assert.equal(report.verification.containment, 'parziale')
    assert.deepEqual(JSON.parse(await readFile(join(report.workspace, 'chiavi.json'), 'utf8')), [])
  } finally {
    perProvaSandbox()
    await rm(base, { recursive: true, force: true })
  }
})

test('l’ambiente minimo e quello di Claude Code', () => {
  const m = ambienteMinimo('/tmp/casa')
  assert.deepEqual(Object.keys(m).sort(), ['CI', 'HOME', 'LANG', 'PATH', 'TMPDIR'])
  assert.equal(m.HOME, '/tmp/casa')
  assert.equal(m.CI, '1')
  const c = ambienteClaude({ PATH: '/bin', HOME: '/h', USER: 'u', SHELL: '/bin/zsh', LANG: 'en', TERM: 'xterm', LC_ALL: 'C', CLAUDE_CONFIG_DIR: '/c',
    ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k', MYYND_POSTGRES: 'pg', AWS_SECRET_ACCESS_KEY: 's', GITHUB_TOKEN: 't', NOTION_TOKEN: 'n' })
  assert.deepEqual(Object.keys(c).sort(), ['CLAUDE_CONFIG_DIR', 'DISABLE_AUTOUPDATER', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'SHELL', 'TERM', 'USER'])
})

test('il profilo: la rete solo locale, le scritture solo dove si dice, i segreti chiusi e la copia riaperta', () => {
  const p = profilo({ rete: 'locale', scrivibili: ['/private/tmp/copia'], leggibili: [], segreti: ['/private/tmp'] })
  assert.match(p, /\(deny network\*\)/)
  assert.match(p, /\(deny file-write\*\)/)
  assert.ok(p.indexOf('(deny file-read-data file-read-xattr file-write* (subpath "/private/tmp")') < p.lastIndexOf('(allow file-read-data file-read-xattr (subpath "/private/tmp/copia")'), 'la copia si riapre dopo la chiusura')
  const c = profiloClaude('/private/tmp/copia', false)
  assert.doesNotMatch(c, /deny network/, 'Claude Code parla con Anthropic')
  assert.ok(!c.includes('(subpath "/private/tmp/copia")') || !/allow file-write\*[^\n]*copia/.test(c.split('\n').find(r => r.startsWith('(allow file-write*'))!), 'il piano non scrive nella cartella vera')
  assert.ok(segreti().some(s => s.endsWith('.ssh')))
})

test('Claude Code parte dentro il suo recinto', { skip: (!mac || !existsSync(join(homedir(), '.local/bin/claude'))) && 'serve claude e sandbox-exec' }, async () => {
  const { execFile } = await import('node:child_process')
  const copia = await mkdtemp(join(tmpdir(), 'myynd-recinto-claude-'))
  try {
    const out = await new Promise<string>((ok, ko) => execFile('/usr/bin/sandbox-exec', ['-p', profiloClaude(copia, true), join(homedir(), '.local/bin/claude'), '--version'],
      { cwd: copia, env: ambienteClaude(), timeout: 30_000 }, (e, so, se) => e ? ko(new Error(`${e.message}\n${se}`)) : ok(so)))
    assert.match(out, /\d+\.\d+/)
  } finally { await rm(copia, { recursive: true, force: true }) }
})

// — le uscite senza rete: app, Apple Events, letture fuori elenco, le impostazioni di Claude Code —

/** Esegue un comando dentro un profilo e dice com'è andata, senza mai aprire niente. */
function dentro(prof: string, argv: string[], cwd: string, env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' }): { codice: number | null; testo: string } {
  const r = spawnSync('/usr/bin/sandbox-exec', ['-p', prof, ...argv], { cwd, env, encoding: 'utf8', timeout: 20_000 })
  return { codice: r.status, testo: `${r.stdout}${r.stderr}` }
}

/** Python di sistema, per chiedere a launchd un servizio per nome senza parlarci: c'è solo con gli strumenti di sviluppo. */
const python = mac && (() => { try { return execFileSync('/usr/bin/python3', ['-c', 'print(1)'], { encoding: 'utf8', timeout: 20_000 }).trim() === '1' } catch { return false } })()
const CERCA = `import ctypes, sys
libc = ctypes.CDLL('/usr/lib/libSystem.B.dylib')
porta = ctypes.c_uint32()
bp = ctypes.c_uint32.in_dll(libc, 'bootstrap_port')
print(' '.join(str(libc.bootstrap_look_up(bp, n.encode(), ctypes.byref(porta))) for n in sys.argv[1:]))
`

test('nessuna app da lanciare: open, osascript e shortcuts non partono (con argomenti finti, senza aprire niente)', { skip: !mac && 'serve sandbox-exec' }, async () => {
  const copia = await mkdtemp(join(tmpdir(), 'myynd-recinto-app-'))
  try {
    // prima: senza i divieti osascript parte, e si lamenta solo dell'opzione finta
    assert.doesNotMatch(dentro('(version 1)(allow default)', ['/usr/bin/osascript', '-z-myynd-prova'], copia).testo, /Operation not permitted/)
    for (const prof of [profilo({ rete: 'locale', scrivibili: [copia], segreti: segreti(), soloElenco: true }), profiloClaude(copia, true)]) {
      for (const argv of [['/usr/bin/osascript', '-z-myynd-prova'], ['/usr/bin/open', '--myynd-prova-inesistente'], ['/usr/bin/shortcuts', '--myynd-prova']]) {
        const r = dentro(prof, argv, copia)
        assert.match(r.testo, /Operation not permitted/, `${argv[0]}: ${r.testo}`)
      }
    }
  } finally { await rm(copia, { recursive: true, force: true }) }
})

test('niente LaunchServices né Apple Events: il servizio non si trova dentro il recinto, fuori sì', { skip: (!mac || !python) && 'serve sandbox-exec e python3' }, async () => {
  const copia = await mkdtemp(join(tmpdir(), 'myynd-recinto-mach-'))
  try {
    await writeFile(join(copia, 'cerca.py'), CERCA)
    const nomi = ['com.apple.coreservices.launchservicesd', 'com.apple.coreservices.appleevents']
    assert.equal(dentro('(version 1)(allow default)', ['/usr/bin/python3', '-I', 'cerca.py', ...nomi], copia).testo.trim(), '0 0', 'prima: si trovano')
    for (const prof of [profilo({ rete: 'locale', scrivibili: [copia], segreti: segreti(), soloElenco: true }), profiloClaude(copia, true)]) {
      const r = dentro(prof, ['/usr/bin/python3', '-I', 'cerca.py', ...nomi], copia, { PATH: '/usr/bin:/bin', TMPDIR: copia, HOME: copia })
      assert.match(r.testo, /^1100 1100$/m, `dentro no: ${r.testo}`)
    }
  } finally { await rm(copia, { recursive: true, force: true }) }
})

test('la verifica legge per elenco: un file fuori dalla copia non si legge, node sì', { skip: !mac && 'serve sandbox-exec' }, async () => {
  const base = await mkdtemp(join(tmpdir(), 'myynd-recinto-elenco-'))
  const copia = join(base, 'copia'), fuori = join(base, 'Documents')
  await mkdir(copia); await mkdir(fuori)
  await writeFile(join(fuori, 'nota.txt'), 'privata')
  try {
    assert.equal(dentro(profilo({ rete: 'locale', scrivibili: [copia], segreti: [] }), ['/bin/cat', join(fuori, 'nota.txt')], copia).testo, 'privata', 'prima: per divieti si leggeva')
    const prof = profilo({ rete: 'locale', scrivibili: [copia], segreti: [], soloElenco: true })
    assert.match(dentro(prof, ['/bin/cat', join(fuori, 'nota.txt')], copia).testo, /Operation not permitted/)
    assert.equal(dentro(prof, [process.execPath, '-e', 'console.log(process.platform)'], copia).testo.trim(), 'darwin')
  } finally { await rm(base, { recursive: true, force: true }) }
})

test('Claude Code non riscrive le sue impostazioni né ~/.local/bin, e non legge Documenti o la cronologia; il suo stato sì', { skip: !mac && 'serve sandbox-exec' }, async () => {
  const casa = await mkdtemp(join(tmpdir(), 'myynd-recinto-casa-'))
  const copia = join(casa, 'lavoro')
  for (const d of ['lavoro', '.claude/projects', '.claude/commands', '.local/bin', 'Documents']) await mkdir(join(casa, d), { recursive: true })
  await writeFile(join(casa, 'Documents', 'nota.txt'), 'privata')
  await writeFile(join(casa, '.zsh_history'), 'segreta')
  try {
    const prof = profiloClaude(copia, true, casa)
    const scrivi = (p: string) => dentro(prof, ['/bin/sh', '-c', 'echo x > "$1"', 'sh', join(casa, p)], copia)
    for (const p of ['.claude/settings.json', '.claude/settings.local.json', '.claude/CLAUDE.md', '.claude/commands/x.md', '.local/bin/npm']) {
      assert.match(scrivi(p).testo, /Operation not permitted/, p)
    }
    for (const p of ['.claude/projects/s.jsonl', '.claude.json', 'lavoro/file.ts']) assert.equal(scrivi(p).codice, 0, `${p}: ${scrivi(p).testo}`)
    for (const p of ['Documents/nota.txt', '.zsh_history']) assert.match(dentro(prof, ['/bin/cat', join(casa, p)], copia).testo, /Operation not permitted/, p)
    // il piano legge la cartella vera anche se sta nei Documenti
    assert.equal(dentro(profiloClaude(join(casa, 'Documents'), false, casa), ['/bin/cat', join(casa, 'Documents', 'nota.txt')], copia).testo, 'privata')
  } finally { await rm(casa, { recursive: true, force: true }) }
})

test('~/.local/bin non sta sulla PATH della verifica: ci va la cartella vera di node', () => {
  assert.ok(!pathPulita().split(':').includes(join(homedir(), '.local/bin')))
})
