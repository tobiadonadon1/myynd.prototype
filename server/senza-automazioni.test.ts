// Le automazioni non ci sono più (17 ottobre 2026): chi le aveva riapre Myynd e
// riparte pulito. La configurazione con le chiavi di prima, la cartella delle
// ricette, le tabelle con le loro righe e le righe «auto:» in lista restano
// dove sono: niente si cancella, niente si rompe, nessuna riga di guaio.
//
//   node --test server/senza-automazioni.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const casa = mkdtempSync(join(tmpdir(), 'myynd-senza-automazioni-'))
process.env.MYYND_DATI = casa
const home = join(casa, 'casa-finta')
mkdirSync(join(home, 'Documents'), { recursive: true })
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')

let servizio: ChildProcess | undefined
let base = ''
let errori = ''
let cartellaDiLei = ''
const token = 'senza-automazioni-token-di-prova'

function porta(p: ChildProcess): Promise<string> {
  return new Promise((ok, no) => {
    const scade = setTimeout(() => no(new Error('il server non è partito')), 20000)
    let fuori = ''
    p.stdout!.on('data', c => {
      fuori += String(c)
      const m = fuori.match(/server su http:\/\/127\.0\.0\.1:(\d+)/)
      if (m) { clearTimeout(scade); ok(m[1]) }
    })
    p.stderr!.on('data', c => { errori += String(c) })
    p.on('exit', code => { clearTimeout(scade); no(new Error(`il server è uscito ${code}`)) })
    p.on('error', no)
  })
}

before(async () => {
  const account = await conti.registra('senza-automazioni@esempio.test', 'parola-di-prova-lunga')
  assert.ok(account.ok)
  await conti.perProva.apriCon(token, account.id)
  chi.dentro(account.id, () => {
    // le chiavi di prima: il tipo non le conosce più, il file sì
    cfg.scrivi({
      lingua: 'en', onboarding: true, giro: true, desktop: { cartelle: [join(home, 'Documents')], scelte: true },
      diSerie: true, pacchettoOfferto: true, licenza: 'acme', ricette: { repo: 'acme/ricette', ramo: 'main', token: 'ghp_finto' }
    } as unknown as Parameters<typeof cfg.scrivi>[0])
    cartellaDiLei = cfg.cartella()
    // la cartella delle ricette e i fogli accanto
    mkdirSync(join(cartellaDiLei, 'automazioni'), { recursive: true })
    writeFileSync(join(cartellaDiLei, 'automazioni', 'mia.json'), JSON.stringify({ id: 'mia', nome: 'Old one', quando: { ogni: 'giorno', ora: 7 } }))
    writeFileSync(join(cartellaDiLei, 'scoperte.json'), JSON.stringify({ quando: new Date().toISOString(), suggerimenti: [] }))
    writeFileSync(join(cartellaDiLei, 'punto.json'), JSON.stringify({ ultimo: null, progetti: [], scartati: [], chiamate: [], avviate: ['every monday'] }))
    // le tabelle di prima, con le loro righe
    store.default.prepare("INSERT INTO automazioni (id, spenta, quante, esito, ultima, riprova) VALUES ('mia', 0, 3, 'guaio', ?, ?)")
      .run(new Date().toISOString(), new Date(Date.now() + 3600_000).toISOString())
    store.default.prepare("INSERT INTO prove (id, automazione, tipo, stato, creata) VALUES ('p1', 'mia', 'vassoio', 'finita', ?)").run(new Date().toISOString())
    store.default.prepare("INSERT INTO esiti (id, prova, automazione, tipo, stato, creato) VALUES ('e1', 'p1', 'mia', 'riga', 'scritta', ?)").run(new Date().toISOString())
    // una riga scritta da un ordine fisso, con il permesso com'era scritto allora
    store.scriviCompito({ id: 'riga-auto', testo: 'Reply to Nora about the quote', nota: null, quando: 'oggi', ordine: 'a', origine: 'auto:mia' })
    store.default.prepare('UPDATE compiti SET attrezzi = ? WHERE id = ?')
      .run(JSON.stringify({ nomi: ['posta.leggi'], origine: 'automazione', selezione: 'richieste-dirette', ambitoSelezione: 'Nora' }), 'riga-auto')
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

const chiama = (via: string, metodo = 'GET') => fetch(`${base}${via}`, {
  method: metodo, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
})

test('con le chiavi di prima l’app parte, e lo stato non parla di automazioni', async () => {
  const r = await chiama('/api/stato')
  assert.equal(r.status, 200)
  const stato = await r.json() as Record<string, unknown> & { config: Record<string, unknown> }
  for (const k of ['suggerimentiNuovi', 'vassoioNuovi', 'automazioniInGuaio']) assert.ok(!(k in stato), `lo stato porta ancora «${k}»`)
  assert.ok(!('diSerie' in stato.config), 'la configurazione pubblica porta ancora «diSerie»')
  assert.equal(stato.config.lingua, 'en')
})

test('le rotte delle automazioni non ci sono più', async () => {
  for (const [via, metodo] of [['/api/automazioni', 'GET'], ['/api/automazioni/suggerimenti', 'GET'], ['/api/automazioni/pacchetto', 'GET'],
    ['/api/automazioni/mia/adesso', 'POST'], ['/api/vassoio', 'GET'], ['/api/raccolte', 'GET'], ['/api/attrezzi', 'GET'], ['/api/punto/avvia', 'POST']] as const) {
    assert.equal((await chiama(via, metodo)).status, 404, `${metodo} ${via}`)
  }
})

test('la riga scritta da un ordine fisso resta in lista, e il resto non si cancella', async () => {
  const r = await chiama('/api/compiti')
  assert.equal(r.status, 200)
  const { compiti } = await r.json() as { compiti: { id: string; origine: string | null }[] }
  assert.ok(compiti.some(c => c.id === 'riga-auto' && c.origine === 'auto:mia'), 'la riga di prima è sparita')
  // niente si butta: la cartella delle ricette, e le righe delle tabelle
  assert.ok(existsSync(join(cartellaDiLei, 'automazioni', 'mia.json')))
  const db = store.default
  const conta = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
  const conto = conti.tutti()[0]!
  assert.deepEqual(chi.dentro(conto, () => [conta('automazioni'), conta('prove'), conta('esiti')]), [1, 1, 1])
})

test('il resoconto e il punto leggono i dati di prima senza inciampare', async () => {
  assert.equal((await chiama('/api/resoconto?quale=questa')).status, 200)
  assert.equal((await chiama('/api/punto')).status, 200)
})

test('nessun errore nel registro del server', () => {
  assert.doesNotMatch(errori, /automazion|automation|ricett|vassoio/i, errori)
  assert.doesNotMatch(errori, /errore non gestito/i, errori)
})
