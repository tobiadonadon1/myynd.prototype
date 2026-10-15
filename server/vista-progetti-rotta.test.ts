// Le rotte della pagina dei Progetti, sul server vero: il succo per ogni
// progetto vivo, letto da `quadri.json` della persona che chiede; le cartelle
// proposte; e una cartella che diventa progetto solo se è fra le proposte.
//
//   node --import ./build/test-profile.mjs --test server/vista-progetti-rotta.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATI = mkdtempSync(join(tmpdir(), 'myynd-vista-rotta-'))
process.env.MYYND_DATI = DATI
delete process.env.ANTHROPIC_API_KEY
const TOKEN = 'sviluppo-non-in-produzione'

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')

let server: ChildProcess | null = null
let base = ''
after(() => { server?.kill('SIGTERM'); rmSync(DATI, { recursive: true, force: true }) })

const oggi = new Date().toISOString()
const giorno = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const cartella = (percorso: string, corpo: string) =>
  ({ id: `lavoro:${percorso}`, fonte: 'lavoro', tipo: 'cartella', titolo: `Lavoro: ${percorso.split('/').pop()}`, corpo, percorso, quando: oggi }) as never

// la semina, come `prove/semina.ts`: il conto di sviluppo, due progetti, un
// quadro scritto com'è su disco (uno di prima, senza sintesi né letto), le cartelle
const conto = await conti.registra('sviluppo@myynd.local', TOKEN)
assert.ok(conto.ok)
const ids = chi.dentro(conto.id, () => {
  cfg.scrivi({ lingua: 'en', nome: 'Alex', onboarding: true, giro: true, diSerie: false })
  const ev = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship Evermute 1.0' })
  const nw = progetti.scrivi({ nome: 'Northwind', obiettivo: '' })
  const chiuso = progetti.scrivi({ nome: 'Archivio' })
  progetti.chiudi(chiuso.id)
  store.salvaDocumenti([
    cartella('/casa/Desktop/Evermute', `Cartella di lavoro: Evermute.\n\nUltimi commit:\n${giorno(1)}  bump build 15`),
    cartella('/casa/Code/harbor-api', `Cartella di lavoro: harbor-api.\n\nUltimi commit:\n${giorno(2)}  routes`),
    cartella('/casa/Code/archivio', `Cartella di lavoro: archivio.\n\nUltimi commit:\n${giorno(2)}  x`),
    cartella('/casa/Code/fermo', `Cartella di lavoro: fermo.\n\nUltimi commit:\n${giorno(60)}  init`)
  ])
  const dove = cfg.cartella()
  mkdirSync(dove, { recursive: true })
  writeFileSync(join(dove, 'quadri.json'), JSON.stringify({ quadri: {
    [ev.id]: {
      progetto: ev.id, nome: 'Evermute', quando: oggi, impronta: 'x', versione: 3,
      stato: 'Build 15 is uploaded. Review is pending since Monday. Ads are paused. Nothing else moved.',
      traguardo: 'Evermute 1.0 live on the App Store', blocco: '',
      mosse: [{ genere: 'sblocco', titolo: 'Ask Tommaso for the signing access', testo: 'The build waits for it.', leva: 3, urgenza: 'oggi', offerta: 'I draft the note.', prova: 'waits for signing access', doc: null, origine: 'memoria' }]
    }
  } }))
  return { ev: ev.id, nw: nw.id }
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
  return { stato: r.status, dati: await r.json() as Record<string, unknown> }
}

type Vista = {
  progetti: { id: string; nome: string; obiettivo: string; sintesi: string; capito: string | null; ultima: string | null; mossa: { titolo: string } | null; traguardo: string; letto: { tipo: string; quanti: number }[] }[]
  suggeriti: { nome: string; percorso: string; ultima: string }[]
}

test('GET /api/progetti/quadro: il succo dei progetti vivi e le cartelle senza progetto; si legge e basta', async () => {
  await avvia()
  const quadriPrima = chi.dentro(conto.id, () => readFileSync(join(cfg.cartella(), 'quadri.json'), 'utf8'))
  const senza = await fetch(`${base}/api/progetti/quadro`)
  assert.equal(senza.status, 401, 'senza sessione niente')
  await senza.arrayBuffer()

  const { stato, dati } = await chiama('GET', '/api/progetti/quadro')
  assert.equal(stato, 200)
  const v = dati as unknown as Vista
  assert.deepEqual(v.progetti.map(p => p.nome).sort(), ['Evermute', 'Northwind'], 'un progetto chiuso non ha pagina')
  const ev = v.progetti.find(p => p.id === ids.ev)!
  assert.equal(ev.sintesi, 'Build 15 is uploaded. Review is pending since Monday. Ads are paused.', 'un quadro di prima: le prime frasi di dove sta')
  assert.equal(ev.mossa?.titolo, 'Ask Tommaso for the signing access')
  assert.equal(ev.traguardo, 'Evermute 1.0 live on the App Store')
  assert.ok(ev.capito)
  assert.deepEqual(ev.letto, [{ tipo: 'memoria', quanti: 1 }, { tipo: 'cartelle', quanti: 1 }], 'un quadro senza conteggio: quello che c’è da leggere adesso (la memoria del progetto, la cartella)')
  assert.equal(ev.ultima?.slice(0, 10), giorno(1), 'l’ultima attività è il commit di ieri, non la riga del progetto scritta adesso')
  const nw = v.progetti.find(p => p.id === ids.nw)!
  assert.equal(nw.sintesi, '')
  assert.equal(nw.capito, null)
  assert.equal(nw.ultima, null, 'senza materiale non si inventa un’attività')
  assert.deepEqual(nw.letto, [])
  assert.equal(nw.mossa, null)
  assert.deepEqual(v.suggeriti.map(s => s.nome), ['harbor-api'], 'Evermute ha il suo progetto, archivio è chiuso, fermo è vecchio')
  assert.equal(chi.dentro(conto.id, () => readFileSync(join(cfg.cartella(), 'quadri.json'), 'utf8')), quadriPrima, 'la rotta non scrive i quadri')
})

test('POST /api/progetti/suggeriti: solo una cartella proposta diventa progetto, e poi non si propone più', async () => {
  const storto = await chiama('POST', '/api/progetti/suggeriti', { percorso: '/casa/Code/fermo' })
  assert.equal(storto.stato, 404, 'una cartella vecchia non è fra le proposte')
  assert.equal((await chiama('POST', '/api/progetti/suggeriti', { percorso: '/etc' })).stato, 404)
  assert.equal((await chiama('POST', '/api/progetti/suggeriti', {})).stato, 404)

  const fatto = await chiama('POST', '/api/progetti/suggeriti', { percorso: '/casa/Code/harbor-api' })
  assert.equal(fatto.stato, 200)
  assert.equal((fatto.dati.progetto as { nome: string }).nome, 'harbor-api')
  assert.equal((fatto.dati.progetto as { origine: string }).origine, 'mano', 'l’ha fatto lui, con un tocco')

  const dopo = (await chiama('GET', '/api/progetti/quadro')).dati as unknown as Vista
  assert.deepEqual(dopo.suggeriti, [])
  const nuovo = dopo.progetti.find(p => p.nome === 'harbor-api')!
  assert.equal(nuovo.capito, null, 'nato adesso: non l’ha ancora capito')
  assert.equal(nuovo.sintesi, '')
})
