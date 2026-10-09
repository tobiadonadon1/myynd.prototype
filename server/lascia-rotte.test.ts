// «Not relevant, drop it» con la ragione, e «Take it back» sul primo gradino,
// provati fuori dal processo come li chiama l'app.
//
// Prima la riga mandava «not relevant»: due parole, sotto la soglia di
// `imparaDallaChiusura`, e niente da contare. Qui la ragione è quella del
// feed, e insegna allo stesso modo: tre «Not mine» su righe nate dalla posta
// di Tom, e la sua posta entra solo se chiede qualcosa.
//
//   node --test server/lascia-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const casa = mkdtempSync(join(tmpdir(), 'myynd-lascia-rotte-'))
process.env.MYYND_DATI = casa
const home = join(casa, 'casa-finta')
mkdirSync(join(home, 'Documents'), { recursive: true })
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const gradino = await import('./gradino.ts')

let servizio: ChildProcess | undefined
let base = ''
const token = 'lascia-rotte-token-di-prova'
let utente = ''
const NORA = 'nora@harbor.example'

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
const fa = (ore: number) => new Date(Date.now() - ore * 3_600_000).toISOString()

before(async () => {
  const account = await conti.registra('lascia-rotte@esempio.test', 'parola-di-prova-lunga')
  assert.ok(account.ok)
  utente = account.id
  await conti.perProva.apriCon(token, account.id)
  chi.dentro(account.id, () => {
    cfg.scrivi({ lingua: 'en', diSerie: false, onboarding: true, giro: true, desktop: { cartelle: [join(home, 'Documents')], scelte: true } })
    store.salvaDocumenti([
      ...[1, 2, 3].map(i => ({ id: `posta:INBOX:7${i}`, fonte: 'posta', tipo: 'email', titolo: ['Hiring plan', 'Offsite budget', 'Vendor shortlist'][i - 1]!, corpo: `The document number ${i}, for the team.`, autore: 'Tom Reed <tom@reed.example>', quando: fa(5 + i), percorso: 'INBOX', messageId: `tom${i}@ex`, filo: `tom${i}@ex` })),
      { id: 'posta:INBOX:80', fonte: 'posta', tipo: 'email', titolo: 'Pilot scope', corpo: 'Can you confirm the pilot scope?', autore: `Nora <${NORA}>`, quando: fa(2), percorso: 'INBOX', messageId: 'nora80@ex', filo: 'nora80@ex' }
    ])
    for (const i of [1, 2, 3]) store.scriviCompito({ id: `tom-${i}`, testo: `Read Tom's document ${i}`, ordine: `o${i}`, doc: `posta:INBOX:7${i}` })
    store.scriviCompito({ id: 'gia', testo: 'Send the deck to Nora', ordine: 'o4', doc: 'posta:INBOX:80' })
    store.scriviCompito({ id: 'boh', testo: 'Something unclear', ordine: 'o5' })
    // Nora è salita: quattro risposte partite com'erano, e una riga nata da lì
    for (let i = 0; i < 4; i++) gradino.registraInvio({ compito: `r${i}`, indirizzo: NORA, nome: 'Nora', distanza: 0, quando: fa(30 - i) })
    store.scriviCompito({ id: 'guadagnata-1', testo: 'Draft a reply: Pilot scope', ordine: 'o6', doc: 'posta:INBOX:80', origine: gradino.ORIGINE })
  })
  store.chiudiIndici()
  servizio = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: home, MYYND_DATI: casa, MYYND_PORT: '0', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe']
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

const chiama = (via: string, metodo = 'GET', corpo?: unknown) => fetch(`${base}${via}`, {
  method: metodo, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo)
})
const compito = (id: string) => chi.dentro(utente, () => store.compito(id))
type Risposta = { compiti: { id: string; guadagnato?: { indirizzo: string; nome: string } | null }[]; chiuso?: string; imparato?: { chiave: string; dati: Record<string, string> } }

test('«Not mine» tre volte su righe nate dalla posta di Tom: la terza fa nascere la regola, e la rotta la dice', async () => {
  const lascia = (id: string) => chiama(`/api/compiti/${id}/lascia`, 'POST', { ragione: 'non_mia', esito: 'Not mine: not my job.' })
  const a = await lascia('tom-1')
  assert.equal(a.status, 200)
  const ra = await a.json() as Risposta
  assert.equal(ra.chiuso, 'lasciato')
  assert.equal(ra.imparato, undefined)
  assert.ok(!ra.compiti.some(c => c.id === 'tom-1'))
  assert.equal(compito('tom-1')?.stato, 'lasciato')
  assert.equal(compito('tom-1')?.esito, 'Not mine: not my job.')
  assert.equal(((await (await lascia('tom-2')).json()) as Risposta).imparato, undefined)
  const rc = await (await lascia('tom-3')).json() as Risposta
  assert.equal(rc.imparato?.chiave, 'feed.filtro:mittente:tom@reed.example')
  assert.equal(rc.imparato?.dati.specie, 'persona')
  // riaperta una: la regola si ritira alla prossima conta (lo stato di adesso, non quello di allora)
  assert.equal((await chiama('/api/compiti/tom-3/riapri', 'POST')).status, 200)
  const ab = await import('./abitudini.ts')
  const filtri = chi.dentro(utente, () => { ab.ricalcolaFiltri(); return ab.filtriInVigore() })
  assert.equal(filtri.persone.has('tom@reed.example'), false)
})

test('«Already done» chiude come fatta; una ragione sconosciuta è un errore tradotto e non tocca la riga', async () => {
  const r = await chiama('/api/compiti/gia/lascia', 'POST', { ragione: 'fatta', esito: 'Already done, I handled it.' })
  assert.equal(r.status, 200)
  assert.equal(((await r.json()) as Risposta).chiuso, 'fatto')
  assert.equal(compito('gia')?.stato, 'fatto')
  const male = await chiama('/api/compiti/boh/lascia', 'POST', { ragione: 'non rilevante' })
  assert.equal(male.status, 400)
  assert.equal(((await male.json()) as { errore: string }).errore, 'Ragione sconosciuta.')
  assert.equal(compito('boh')?.stato, 'aperto')
  assert.equal((await chiama('/api/compiti/nessuna/lascia', 'POST', { ragione: 'vecchia' })).status, 404)
})

test('una riga nata dal primo gradino lo dice; «Take it back» la fa tacere', async () => {
  const lista = await (await chiama('/api/compiti')).json() as Risposta | Risposta['compiti']
  const righe = Array.isArray(lista) ? lista : lista.compiti
  assert.deepEqual(righe.find(c => c.id === 'guadagnata-1')?.guadagnato, { indirizzo: NORA, nome: 'Nora' })
  const r = await chiama('/api/gradino/ritira', 'POST', { indirizzo: NORA })
  assert.equal(r.status, 200)
  const dopo = await r.json() as Risposta
  assert.equal(dopo.compiti.find(c => c.id === 'guadagnata-1')?.guadagnato, null)
  const gem = await (await chiama('/api/gemello')).json() as { guadagnati: unknown[] }
  assert.deepEqual(gem.guadagnati, [])
  assert.equal((await chiama('/api/gradino/ritira', 'POST', { indirizzo: 'nessuno' })).status, 400)
})
