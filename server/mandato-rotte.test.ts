// Le rotte del mandato e del numero della settimana, sul server vero.
//
// Il mandato si legge (proposto, senza scriverlo), si cambia e si conferma
// solo da `PUT /api/progetti/:id/mandato`; un «Fatto» su una carta
// consegnata è una traccia accettata, e la settimana la conta.
//
//   node --import ./build/test-profile.mjs --test server/mandato-rotte.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATI = mkdtempSync(join(tmpdir(), 'myynd-mandato-rotte-'))
process.env.MYYND_DATI = DATI
delete process.env.ANTHROPIC_API_KEY
const TOKEN = 'sviluppo-non-in-produzione'

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const tracce = await import('./tracce.ts')

let server: ChildProcess | null = null
let base = ''
after(() => { server?.kill('SIGTERM'); rmSync(DATI, { recursive: true, force: true }) })

const oggi = new Date().toISOString()
const conto = await conti.registra('sviluppo@myynd.local', TOKEN)
assert.ok(conto.ok)
const ids = chi.dentro(conto.id, () => {
  cfg.scrivi({ lingua: 'en', nome: 'Alex', onboarding: true, giro: true, diSerie: false })
  const p = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship Evermute 1.0' })
  const dove = cfg.cartella()
  mkdirSync(dove, { recursive: true })
  writeFileSync(join(dove, 'quadri.json'), JSON.stringify({ quadri: {
    [p.id]: { progetto: p.id, nome: 'Evermute', quando: oggi, impronta: 'x', versione: 3, stato: 'Build 15 is up.', traguardo: 'Evermute 1.0 live on the App Store', blocco: '', mosse: [] }
  } }))
  // una carta consegnata da Myynd, con la sua traccia
  store.scriviCompito({ id: 'k1', testo: 'Write the release notes', ordine: 'a', progetto: p.id })
  store.affidaCompito('k1', 'bozza')
  store.risultatoCompito('k1', 'Release notes, ready.', [], 'pronto')
  tracce.inizia({ compito: 'k1', progetto: p.id })
  tracce.consegnata('k1', { uscita: '/tmp/notes.md' })
  return { p: p.id }
})
store.chiudiIndici()

async function avvia() {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: join(DATI, 'casa-finta'), MYYND_DATI: DATI, MYYND_PORT: '0', MYYND_DEV: '1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise<void>((pronto, guaio) => {
    const orologio = setTimeout(() => guaio(new Error('il server non è partito')), 15_000)
    let fuori = '', errori = ''
    server!.stdout!.on('data', p => {
      fuori += String(p)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { base = m[1]!; clearTimeout(orologio); pronto() }
    })
    server!.stderr!.on('data', p => { errori += String(p).slice(0, 1000) })
    server!.on('exit', c => { if (!base) { clearTimeout(orologio); guaio(new Error(`il server è uscito ${c}: ${errori}`)) } })
  })
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${base}/api/progetti`, { headers: { authorization: `Bearer ${TOKEN}` } })
    await r.arrayBuffer()
    if (r.ok) break
    await new Promise(r2 => setTimeout(r2, 200))
  }
}

const chiama = async (metodo: string, strada: string, corpo?: unknown) => {
  const r = await fetch(`${base}${strada}`, {
    method: metodo,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', origin: base },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  })
  return { stato: r.status, dati: await r.json() as Record<string, any> }
}

test('il mandato: si legge proposto, si cambia, si conferma solo dalla sua rotta', async () => {
  await avvia()
  const senza = await fetch(`${base}/api/progetti/${ids.p}/mandato`)
  assert.equal(senza.status, 401)
  await senza.arrayBuffer()

  const letto = await chiama('GET', `/api/progetti/${ids.p}/mandato`)
  assert.equal(letto.stato, 200)
  assert.equal(letto.dati.mandato.stato, 'proposto')
  assert.equal(letto.dati.mandato.esito, 'Evermute 1.0 live on the App Store', 'dal traguardo del quadro')
  assert.equal(letto.dati.mandato.misura, 'It is live and opens')
  assert.equal(letto.dati.autonomia, 'prepara')
  assert.equal(letto.dati.regole.paga, 'mai')

  const cambiato = await chiama('PUT', `/api/progetti/${ids.p}/mandato`, { classi: { invio: 'auto' }, budget: 5 })
  assert.equal(cambiato.stato, 200)
  assert.equal(cambiato.dati.mandato.stato, 'proposto')
  assert.equal(cambiato.dati.mandato.esito, 'Evermute 1.0 live on the App Store', 'la prima scrittura parte dalla proposta')
  assert.equal(cambiato.dati.mandato.classi.invio, 'auto')
  assert.equal(cambiato.dati.regole.invio, 'chiedi', 'da proposto non si allarga')

  const confermato = await chiama('PUT', `/api/progetti/${ids.p}/mandato`, { conferma: true })
  assert.equal(confermato.dati.mandato.stato, 'confermato')
  assert.equal(confermato.dati.regole.invio, 'auto')
  assert.equal(confermato.dati.autonomia, 'agisce')
  assert.equal(confermato.dati.mandato.budget, 5)

  const male = await chiama('PUT', `/api/progetti/${ids.p}/mandato`, { classi: { volare: 'auto' } })
  assert.equal(male.stato, 400)
  const nessuno = await chiama('GET', '/api/progetti/non-esiste/mandato')
  assert.equal(nessuno.stato, 404)
})

test('un «Fatto» su una carta consegnata è una traccia accettata, e la settimana la conta', async () => {
  const vuota = await chiama('GET', '/api/tracce/settimana')
  assert.equal(vuota.stato, 200)
  assert.equal(vuota.dati.accettate, 0)
  assert.equal(vuota.dati.inAttesa, 1)
  const vista = await chiama('POST', '/api/lavoro/visti', { ids: ['k1'] })
  assert.equal(vista.stato, 200)
  const chiusa = await chiama('POST', '/api/compiti/k1/chiudi', { stato: 'fatto' })
  assert.equal(chiusa.stato, 200)
  const s = await chiama('GET', '/api/tracce/settimana')
  assert.equal(s.dati.accettate, 1)
  assert.equal(s.dati.tasso, 1)
  const t = (s.dati.tracce as { compito: string; esito: string; mostrata: string | null; secondi: number | null }[]).find(x => x.compito === 'k1')!
  assert.equal(t.esito, 'accettato')
  assert.ok(t.mostrata)
  assert.equal(typeof t.secondi, 'number')
})
