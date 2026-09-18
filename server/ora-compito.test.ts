// L'ora di un'attività, dal lato del server.
//
// Un compito adesso può avere un'ora dentro il suo giorno, e quell'ora arriva
// da fuori: da una carta aperta premendo su una casella, da un blocco
// trascinato in un'altra mezz'ora. Quello che entra da fuori si controlla, e
// qui si controlla che si controlli.
//
// Tre regole, e sono tutte e tre cose che sbagliate non si vedrebbero subito:
//
//   · «HH:MM» o niente. «9», «09:00:00», «21.30», un istante ISO intero: tutti
//     modi di dire la stessa cosa, e tre modi vogliono dire che fra un mese la
//     griglia ne disegna due e ne sbaglia uno.
//   · un'ora senza un giorno non vuol dire niente: non si disegnerebbe da
//     nessuna parte, e resterebbe lì ad aspettare una data che le darebbe le
//     dieci e mezza di una settimana qualunque.
//   · togliere il giorno toglie l'ora. È il gesto vero: una riga trascinata su
//     «Da pianificare» non deve tenersi l'ora di quando era di giovedì.
//
//   node --test server/ora-compito.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { giornoValido, oraValida } from './giorno-compito.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-ora-'))
const TOKEN = 'sviluppo-non-in-produzione'
let server: ChildProcess | undefined
let base = ''

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MYYND_DATI: CASA, MYYND_PORT: '0', MYYND_DEV: '1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise<void>((pronto, guaio) => {
    const orologio = setTimeout(() => guaio(new Error('il server non è partito')), 15_000)
    let fuori = '', errori = ''
    server!.stdout!.on('data', p => {
      fuori += String(p)
      const m = fuori.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) { base = m[1]; clearTimeout(orologio); pronto() }
    })
    server!.stderr!.on('data', p => { errori += String(p).slice(0, 1000) })
    server!.on('exit', c => { if (!base) { clearTimeout(orologio); guaio(new Error(`il server è uscito ${c}: ${errori}`)) } })
    server!.on('error', guaio)
  })
  // la sessione di sviluppo si apre per conto suo, un momento dopo che la porta
  // risponde: si aspetta lei, o le prime chiamate tornano 401 senza ragione
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${base}/api/compiti`, { headers: { authorization: `Bearer ${TOKEN}` } })
    if (r.ok) { await r.arrayBuffer(); break }
    await r.arrayBuffer()
    await new Promise(r2 => setTimeout(r2, 200))
  }
})

after(async () => {
  if (server && server.exitCode === null) {
    const finito = new Promise<void>(r => server!.once('exit', () => r()))
    server.kill('SIGTERM')
    await finito
  }
  rmSync(CASA, { recursive: true, force: true })
})

type Risposta = { stato: number; dati: Record<string, unknown> }
async function chiama(modo: string, strada: string, corpo?: object): Promise<Risposta> {
  const r = await fetch(base + strada, {
    method: modo,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  })
  return { stato: r.status, dati: await r.json() as Record<string, unknown> }
}
const riga = (r: Risposta, id: string) =>
  (r.dati.compiti as { id: string; giorno: string | null; ora: string | null }[]).find(c => c.id === id)

test('an hour is HH:MM, and a day is a day: neither is guessed from something close', () => {
  for (const v of ['00:00', '09:30', '23:59']) assert.equal(oraValida(v), true)
  for (const v of ['9:30', '09:60', '24:00', '09:30:00', '9.30', '2026-09-17T09:30', '', ' 09:30', null, undefined, 930])
    assert.equal(oraValida(v), false)
  // le due guardie restano distinte: un giorno non è un'ora e viceversa
  assert.equal(giornoValido('09:30'), false)
  assert.equal(oraValida('2026-09-17'), false)
})

test('a task is born with its hour, or without one, and a malformed hour is refused', async () => {
  const conOra = await chiama('POST', '/api/compiti', { id: 'con-ora', testo: 'Call the supplier', quando: 'oggi', giorno: '2026-09-17', ora: '10:30' })
  assert.equal(conOra.stato, 200)
  assert.equal(riga(conOra, 'con-ora')?.ora, '10:30')

  const senzaOra = await chiama('POST', '/api/compiti', { id: 'senza-ora', testo: 'Buy bread', quando: 'oggi', giorno: '2026-09-17' })
  assert.equal(senzaOra.stato, 200)
  assert.equal(riga(senzaOra, 'senza-ora')?.ora, null)

  for (const ora of ['9:30', '25:00', '09:30:00', 930]) {
    const no = await chiama('POST', '/api/compiti', { id: `no-${ora}`, testo: 'Nope', quando: 'oggi', giorno: '2026-09-17', ora })
    assert.equal(no.stato, 400, `«${ora}» è passata`)
    assert.equal(no.dati.errore, 'Ora non valida.')
  }

  // un'ora senza un giorno non si disegnerebbe da nessuna parte
  const orfana = await chiama('POST', '/api/compiti', { id: 'orfana', testo: 'Floating', quando: 'poi', ora: '10:00' })
  assert.equal(orfana.stato, 400)
})

test('the hour moves with the task, is cleared on its own, and goes away with the day', async () => {
  const spostata = await chiama('PATCH', '/api/compiti/con-ora', { giorno: '2026-09-18', ora: '15:00', quando: 'settimana' })
  assert.equal(spostata.stato, 200)
  assert.deepEqual([riga(spostata, 'con-ora')?.giorno, riga(spostata, 'con-ora')?.ora], ['2026-09-18', '15:00'])

  // null è «toglila», e la riga torna nella fascia del tutto il giorno
  const tolta = await chiama('PATCH', '/api/compiti/con-ora', { ora: null })
  assert.equal(riga(tolta, 'con-ora')?.ora, null)
  assert.equal(riga(tolta, 'con-ora')?.giorno, '2026-09-18')

  // e rimessa: l'ora da sola, senza ripetere il giorno che c'è già
  const rimessa = await chiama('PATCH', '/api/compiti/con-ora', { ora: '08:15' })
  assert.equal(riga(rimessa, 'con-ora')?.ora, '08:15')

  const storta = await chiama('PATCH', '/api/compiti/con-ora', { ora: '8:15' })
  assert.equal(storta.stato, 400)
  assert.equal(storta.dati.errore, 'Ora non valida.')

  // togliendo il giorno se ne va anche l'ora: un'ora che non sta in nessun
  // giorno tornerebbe a galla il giorno che la riga ne ricevesse uno
  const spianificata = await chiama('PATCH', '/api/compiti/con-ora', { giorno: null, quando: 'poi' })
  assert.equal(spianificata.stato, 200)
  assert.deepEqual([riga(spianificata, 'con-ora')?.giorno, riga(spianificata, 'con-ora')?.ora], [null, null])

  // e non gliela si può rimettere finché non ha di nuovo un giorno
  const no = await chiama('PATCH', '/api/compiti/con-ora', { ora: '09:00' })
  assert.equal(no.stato, 400)
})
