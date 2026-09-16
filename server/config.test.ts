// La configurazione non perde credenziali per sbaglio.
//
// Il 13 settembre 2026 la chiave di Claude è sparita dal disco mentre l'app
// girava, senza una riga che dicesse chi l'aveva tolta. Da allora `scrivi`
// tiene ogni campo con dentro una credenziale a meno che chi scrive non dica
// «togli questo», e il bottone «Scollega» lo dice.
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

const dati = mkdtempSync(join(tmpdir(), 'myynd-config-'))
process.env.MYYND_DATI = dati
before(() => { process.env.MYYND_DATI = dati })
after(() => rmSync(dati, { recursive: true, force: true }))

test('una scrittura senza la chiave di Claude non la toglie: la tiene e lo dice', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ nome: 'Tobia', claude: { apiKey: 'sk-prova' } })
  const avvisi: string[] = []
  const warn = console.warn
  console.warn = (...a: unknown[]) => { avvisi.push(a.map(String).join(' ')) }
  try {
    cfg.scrivi({ nome: 'Tobia', tono: 'caldo' } as Parameters<typeof cfg.scrivi>[0])
  } finally { console.warn = warn }
  assert.equal(cfg.leggi().claude?.apiKey, 'sk-prova', 'la chiave è sparita')
  assert.equal(cfg.leggi().tono, 'caldo', 'il resto della scrittura non è passato')
  assert.ok(avvisi.some(a => a.includes('«claude»')), 'nessun avviso nel registro')
})

test('«Scollega» la toglie davvero, perché lo dice', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ nome: 'Tobia', claude: { apiKey: 'sk-prova' } })
  cfg.scrivi({ nome: 'Tobia' }, { togli: ['claude'] })
  assert.equal(cfg.leggi().claude, undefined)
})

test('aggiorna non tocca le credenziali che non nomina', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ nome: 'Tobia', claude: { apiKey: 'sk-prova' }, posta: { indirizzo: 'a@b.c', password: 'x' } } as unknown as Parameters<typeof cfg.scrivi>[0])
  cfg.aggiorna({ nome: 'Tobia D.' })
  const c = cfg.leggi()
  assert.equal(c.claude?.apiKey, 'sk-prova')
  assert.equal(c.nome, 'Tobia D.')
})

test('blank, masked and missing nested secrets retain the saved credential', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ claude: { apiKey: 'test-claude-key' }, compatibile: { url: 'https://provider.example/v1', modello: 'first', chiave: 'test-provider-key' } }, { togli: [...cfg.CON_SEGRETI] })
  for (const apiKey of ['', '   ', '••••••']) {
    cfg.aggiorna({ claude: { apiKey } })
    assert.equal(cfg.leggi().claude?.apiKey, 'test-claude-key')
  }
  cfg.aggiorna({ compatibile: { url: 'https://provider.example/v1/', modello: 'second', chiave: '' } })
  assert.equal(cfg.leggi().compatibile?.chiave, 'test-provider-key')
  assert.equal(cfg.leggi().compatibile?.modello, 'second')
  const masked = { nome: 'Changed', claude: {}, compatibile: { url: 'https://provider.example/v1', modello: 'third' } }
  cfg.scrivi(masked as Parameters<typeof cfg.scrivi>[0])
  assert.equal(cfg.leggi().claude?.apiKey, 'test-claude-key')
  assert.equal(cfg.leggi().compatibile?.chiave, 'test-provider-key')
  assert.deepEqual(masked.claude, {}, 'saving must not insert private keys into a caller-owned/public object')
})

test('stale whole-config saves cannot revert a rotated key or resurrect an explicitly removed key', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ claude: { apiKey: 'old-test-key' } }, { togli: [...cfg.CON_SEGRETI] })
  const earlier = cfg.leggi()
  cfg.aggiorna({ claude: { apiKey: 'new-test-key' } })
  earlier.tono = 'caldo'
  cfg.scrivi(earlier)
  assert.equal(cfg.leggi().claude?.apiKey, 'new-test-key')
  assert.equal(cfg.leggi().tono, 'caldo')
  const beforeRemoval = cfg.leggi()
  const disconnect = cfg.leggi(); delete disconnect.claude
  cfg.scrivi(disconnect, { togli: ['claude'] })
  beforeRemoval.nome = 'Another settings update'
  cfg.scrivi(beforeRemoval)
  assert.equal(cfg.leggi().claude, undefined)
})

test('switching providers retains endpoint-bound keys without sending one to another endpoint', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ claude: { apiKey: 'test-anthropic' }, compatibile: { url: 'https://provider.example/v1', modello: 'first', chiave: 'test-provider' } }, { togli: [...cfg.CON_SEGRETI] })
  cfg.aggiorna({ abbonamento: { attivo: true }, claudeCon: 'abbonamento', motore: 'claude' })
  cfg.aggiorna({ chatgpt: { attivo: true }, motore: 'chatgpt' })
  assert.equal(cfg.leggi().claude?.apiKey, 'test-anthropic')
  assert.equal(cfg.chiaveCompatibile('https://provider.example/v1'), 'test-provider')
  cfg.aggiorna({ compatibile: { url: 'http://localhost:11434/v1', modello: 'local' }, motore: 'compatibile' })
  assert.equal(cfg.leggi().compatibile?.chiave, undefined)
  assert.equal(cfg.leggi().claude?.apiKey, 'test-anthropic')
  assert.equal(cfg.chiaveCompatibile('https://provider.example/v1/'), 'test-provider')
  for (const url of ['https://different.example/v1', 'https://provider.example/other', 'http://provider.example/v1', 'https://provider.example:8443/v1']) assert.equal(cfg.chiaveCompatibile(url), undefined)
  cfg.aggiorna({ compatibile: { url: 'https://provider.example/v1', modello: 'second' }, motore: 'compatibile' })
  assert.equal(cfg.leggi().compatibile?.chiave, 'test-provider')
  const shown = cfg.pubblica()
  assert.equal(shown.compatibile?.chiaveSalvata, true)
  assert.ok(!JSON.stringify(shown).includes('test-provider'))
  assert.ok(!('credenzialiModelli' in shown))
  const { senzaLeChiavi } = await import('./fascicolo.ts')
  assert.ok(!JSON.stringify(senzaLeChiavi(cfg.leggi())).includes('test-provider'), 'personal-data exports must redact archived provider keys too')
})

test('explicit provider disconnect removes its saved key and stale settings cannot bring it back', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ compatibile: { url: 'https://remove.example/v1', modello: 'first', chiave: 'test-delete-me' } }, { togli: [...cfg.CON_SEGRETI] })
  const old = cfg.leggi()
  const disconnected = cfg.leggi(); delete disconnected.compatibile
  cfg.scrivi(disconnected, { togli: ['compatibile'] })
  assert.equal(cfg.chiaveCompatibile('https://remove.example/v1'), undefined)
  old.nome = 'Late settings'; old.compatibile!.modello = 'late-model-edit'; cfg.scrivi(old)
  assert.equal(cfg.chiaveCompatibile('https://remove.example/v1'), undefined)
  assert.equal(cfg.leggi().compatibile, undefined)
})

test('a fresh process reads persisted keys after model and source-setting changes', async () => {
  const cfg = await import('./config.ts')
  cfg.scrivi({ claude: { apiKey: 'test-restart-claude' }, compatibile: { url: 'https://restart.example/v1', modello: 'first', chiave: 'test-restart-provider' } }, { togli: [...cfg.CON_SEGRETI] })
  cfg.aggiorna({ desktop: { cartelle: ['/tmp/documents'] }, abbonamento: { attivo: true }, claudeCon: 'abbonamento' })
  cfg.aggiorna({ compatibile: { url: 'http://localhost:11434/v1', modello: 'local' }, motore: 'compatibile' })
  const code = `import assert from 'node:assert/strict'; const c = await import(${JSON.stringify(new URL('./config.ts', import.meta.url).href)}); assert.equal(c.leggi().claude.apiKey, 'test-restart-claude'); assert.equal(c.chiaveCompatibile('https://restart.example/v1'), 'test-restart-provider'); assert.equal(c.leggi().compatibile.chiave, undefined); assert.equal(c.leggi().claudeCon, 'abbonamento'); assert.equal(c.leggi().abbonamento.attivo, true);`
  const child = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, MYYND_DATI: dati } })
  assert.equal(child.status, 0, child.stderr)
  assert.equal(statSync(join(dati, 'config.json')).mode & 0o777, 0o600)
})

test('saved provider keys and pending snapshots belong to their own account', async () => {
  const cfg = await import('./config.ts')
  const chi = await import('./chi.ts')
  const url = 'https://shared-provider.example/v1'
  const a = chi.dentro('credential-account-a', () => {
    cfg.aggiorna({ claude: { apiKey: 'test-account-a' }, compatibile: { url, modello: 'first', chiave: 'test-provider-a' } })
    return cfg.leggi()
  })
  chi.dentro('credential-account-b', () => {
    assert.equal(cfg.chiaveCompatibile(url), undefined)
    cfg.aggiorna({ compatibile: { url, modello: 'first', chiave: 'test-provider-b' } })
    assert.throws(() => cfg.scrivi(a), /another account/)
    assert.equal(cfg.chiaveCompatibile(url), 'test-provider-b')
  })
  assert.equal(chi.dentro('credential-account-a', () => cfg.chiaveCompatibile(url)), 'test-provider-a')
})
