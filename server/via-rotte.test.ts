// Mentre non c'eri, dalle rotte: segnare una cosa vista, ritrovarla sulla
// carta, l'elenco di quello che è stato messo da parte. Due conti, perché il
// visto di uno non è il visto dell'altro.
//
//   node --test server/via-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const casa = mkdtempSync(join(tmpdir(), 'myynd-via-rotte-'))
process.env.MYYND_DATI = casa
const home = join(casa, 'casa-finta')
mkdirSync(join(home, 'Documents'), { recursive: true })
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const { segnaEsame } = await import('./feed-dati.ts')

let servizio: ChildProcess | undefined
let base = ''
let cartellaUno = ''
const uno = 'via-rotte-uno-gettone'
const due = 'via-rotte-due-gettone'
const ADESSO = '2026-10-15T09:00:00+02:00'

function porta(p: ChildProcess): Promise<string> {
  return new Promise((ok, no) => {
    const scade = setTimeout(() => no(new Error('il server non è partito')), 20000)
    let fuori = ''
    p.stdout!.on('data', c => {
      fuori += String(c)
      const m = fuori.match(/server su http:\/\/127\.0\.0\.1:(\d+)/)
      if (m) { clearTimeout(scade); ok(m[1]) }
    })
    p.on('exit', code => { clearTimeout(scade); no(new Error(`il server è uscito ${code}`)) })
    p.on('error', no)
  })
}

before(async () => {
  const a = await conti.registra('via-uno@esempio.test', 'parola-di-prova-lunga')
  const b = await conti.registra('via-due@esempio.test', 'parola-di-prova-lunga')
  assert.ok(a.ok && b.ok)
  await conti.perProva.apriCon(uno, a.id)
  await conti.perProva.apriCon(due, b.id)
  for (const id of [a.id, b.id]) {
    chi.dentro(id, () => {
      cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', diSerie: false, onboarding: true, giro: true, desktop: { cartelle: [join(home, 'Documents')], scelte: true }, turno: { notteDa: '23:00', notteA: '07:00' } } as Parameters<typeof cfg.scrivi>[0])
      store.scriviCompito({ id: 'c-file', testo: 'Write the course outline', quando: 'oggi', ordine: 'a' })
      store.affidaCompito('c-file', 'tutto')
      store.risultatoCompito('c-file', 'Done: saved the outline.', [])
      store.scriviConsegnaCompito('c-file', { app: 'File', titolo: 'Course outline.md', percorso: '/tmp/Course outline.md', dove: 'scrivania' })
    })
  }
  chi.dentro(a.id, () => {
    cartellaUno = cfg.cartella()
    store.salvaDocumenti([
      { id: 'posta:1', fonte: 'email', tipo: 'email', titolo: 'Weekly digest', corpo: 'news', autore: 'news@x.example', quando: '2026-10-15T05:00:00.000Z' },
      { id: 'posta:2', fonte: 'email', tipo: 'email', titolo: 'Ticket 77 closed', corpo: 'x', autore: 'help@x.example', quando: '2026-10-15T05:00:00.000Z' }
    ] as Parameters<typeof store.salvaDocumenti>[0])
    segnaEsame([{ doc: 'posta:1', fase: 'regole', motivo: 'posta_in_serie' }, { doc: 'posta:2', fase: 'modello' }], '2026-10-15T05:30:00.000Z')
  })
  store.chiudiIndici()
  servizio = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: home, MYYND_DATI: casa, MYYND_PORT: '0', NODE_ENV: 'test', MYYND_DEV: '1', MYYND_ADESSO: ADESSO },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  base = `http://127.0.0.1:${await porta(servizio)}`
})

after(async () => {
  if (servizio && servizio.exitCode === null) {
    const spento = new Promise<void>(r => servizio!.once('exit', () => r()))
    servizio.kill('SIGTERM')
    await spento
  }
  store.chiudiIndici()
  rmSync(casa, { recursive: true, force: true })
})

const chiama = (via: string, gettone: string | null, metodo = 'GET', corpo?: unknown) => fetch(`${base}${via}`, {
  method: metodo, headers: { ...(gettone ? { authorization: `Bearer ${gettone}` } : {}), 'content-type': 'application/json' },
  body: corpo === undefined ? undefined : JSON.stringify(corpo)
})

type Lavoro = { id: string; visto: boolean; genere: string }
const lavori = async (g: string) => ((await (await chiama('/api/mattina', g)).json()) as { via: { lavori: Lavoro[]; letti: number; daParte: number } }).via

test('POST /api/lavoro/visti: la carta perde il pallino, sulla ricevuta e nella lista; l’altro conto no', async () => {
  const prima = await lavori(uno)
  assert.equal(prima.lavori.find(x => x.id === 'c-file')?.visto, false)
  assert.equal(prima.lavori.find(x => x.id === 'c-file')?.genere, 'file')

  const r = await chiama('/api/lavoro/visti', uno, 'POST', { ids: ['c-file'] })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { ok: true, nuovi: 1 })
  assert.deepEqual(await (await chiama('/api/lavoro/visti', uno, 'POST', { ids: ['c-file'] })).json(), { ok: true, nuovi: 0 }, 'una volta sola')
  assert.ok(existsSync(join(cartellaUno, 'lavori-visti.json')))

  assert.equal((await lavori(uno)).lavori.find(x => x.id === 'c-file')?.visto, true)
  const lista = await (await chiama('/api/compiti', uno)).json() as { compiti: { id: string; visto?: string }[] }
  assert.ok(lista.compiti.find(c => c.id === 'c-file')?.visto, 'la lista porta quando l’ha vista')

  // l'altro conto ha la sua carta con lo stesso id, e non l'ha vista
  assert.equal((await lavori(due)).lavori.find(x => x.id === 'c-file')?.visto, false)
  const listaDue = await (await chiama('/api/compiti', due)).json() as { compiti: { id: string; visto?: string }[] }
  assert.equal(listaDue.compiti.find(c => c.id === 'c-file')?.visto, undefined)
})

test('POST /api/lavoro/visti: senza un elenco è un 400, senza sessione un 401', async () => {
  assert.equal((await chiama('/api/lavoro/visti', uno, 'POST', { ids: 'c-file' })).status, 400)
  assert.equal((await chiama('/api/lavoro/visti', null, 'POST', { ids: ['c-file'] })).status, 401)
})

test('GET /api/mattina/elenco: messe da parte con il perché, contate come sulla carta', async () => {
  const v = await lavori(uno)
  assert.equal(v.letti, 2)
  assert.equal(v.daParte, 2)
  const r = await chiama('/api/mattina/elenco?genere=daParte', uno)
  assert.equal(r.status, 200)
  const { righe } = await r.json() as { righe: { titolo: string; ragione: string }[] }
  assert.deepEqual(righe.map(x => [x.titolo, x.ragione]).sort(), [['Ticket 77 closed', 'niente_da_fare'], ['Weekly digest', 'in_serie']])
  assert.equal((await chiama('/api/mattina/elenco?genere=tutto', uno)).status, 400)
  const altro = await (await chiama('/api/mattina/elenco?genere=daParte', due)).json() as { righe: unknown[] }
  assert.deepEqual(altro.righe, [], 'l’esame dell’altro conto è suo')
})
