// La pagina dei Progetti: il succo di un quadro (anche di quelli di prima,
// senza sintesi), la mossa che resta da fare, cosa ha letto, e le cartelle
// in cui lavora che non sono ancora un progetto.
//
//   node --import ./build/test-profile.mjs --test server/vista-progetti.test.ts

import { test, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-vista-progetti-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Tobia' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const quadro = await import('./quadro.ts')
const vista = await import('./vista-progetti.ts')
afterEach(() => { quadro.perProva(null) })
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

const ADESSO = Date.parse('2026-10-15T10:00:00.000Z')
const giorniFa = (n: number) => new Date(ADESSO - n * 86_400_000).toISOString()
const giorno = (n: number) => giorniFa(n).slice(0, 10)
const cartella = (percorso: string, corpo: string, quando: string) =>
  ({ id: `lavoro:${percorso}`, fonte: 'lavoro', tipo: 'cartella', titolo: `Lavoro: ${percorso.split('/').pop()}`, corpo, percorso, quando }) as never

test('il succo: la sintesi se c’è, sennò le prime frasi di dove sta, mai una lineetta', () => {
  assert.equal(vista.succo(undefined), '', 'senza quadro non ha capito niente, e non lo finge')
  assert.equal(vista.succo({ sintesi: 'Evermute is an iOS app. Build 15 waits for review.', stato: 'ignored' }), 'Evermute is an iOS app. Build 15 waits for review.')
  const vecchio = { stato: 'Build 15 is ready. The App Store review is pending since Monday. Ads are paused. A fourth sentence that never shows.' }
  assert.equal(vista.succo(vecchio), 'Build 15 is ready. The App Store review is pending since Monday. Ads are paused.', 'tre frasi al massimo')
  assert.doesNotMatch(vista.succo({ stato: 'Shipped the site — the blog is stale.' }), /—/)
  const lungo = vista.primeFrasi('x'.repeat(900))
  assert.ok(lungo.length <= 420 && lungo.endsWith('…'), 'una frase senza fine si taglia al tetto')
})

test('la prossima mossa: la più forte, ma non quella a cui ha già risposto sul feed', () => {
  const m = (titolo: string, leva: 1 | 2 | 3, urgenza: 'oggi' | 'settimana' | 'poi') =>
    ({ genere: 'consiglio', titolo, testo: 'perché', leva, urgenza, offerta: 'faccio io', prova: 'p', doc: null, origine: 'memoria' }) as const
  const q = { mosse: [m('Write a new blog post about the launch', 1, 'poi'), m('Ask Tommaso for the signing access', 3, 'oggi')] }
  assert.equal(vista.prossimaMossa(q, [], false)?.titolo, 'Ask Tommaso for the signing access')
  assert.equal(vista.prossimaMossa(q, ['Ask Tommaso for signing access'], false)?.titolo, 'Write a new blog post about the launch', 'scartata (anche riscritta) non torna')
  assert.equal(vista.prossimaMossa({ mosse: [] }, [], false), null)
  assert.equal(vista.prossimaMossa(undefined, [], false), null)
})

test('cosa ha letto: le cose sue prima, niente zeri, un genere sconosciuto è «altro»', () => {
  assert.deepEqual(vista.lettoInFila({ posta: 3, cartelle: 2, riferimento: 1, sito: 0, strano: 1 }), [
    { tipo: 'riferimento', quanti: 1 }, { tipo: 'cartelle', quanti: 2 }, { tipo: 'posta', quanti: 3 }, { tipo: 'altro', quanti: 1 }
  ])
  assert.deepEqual(vista.lettoInFila(undefined), [])
  assert.equal(quadro.tipoDiFonte('postamac'), 'posta')
  assert.equal(quadro.tipoDiFonte('conversazioni'), 'sessioni')
  assert.equal(quadro.tipoDiFonte('chissà'), 'altro')
})

test('le cartelle proposte: recenti per i commit, di nessun progetto (nemmeno chiuso), le più nuove prima', () => {
  const tutti = [
    { nome: 'Evermute deck', alias: [] },
    { nome: 'Il sito', alias: ['tobiaweb'] },
    { nome: 'Vecchio', alias: [] }
  ]
  const docs = [
    cartella('/Users/t/Desktop/Evermute', `Cartella di lavoro: Evermute.\n\nUltimi commit:\n${giorno(1)}  bump build`, giorniFa(1)),
    cartella('/Users/t/Desktop/tobiaweb', `Cartella di lavoro: tobiaweb.\n\nUltimi commit:\n${giorno(2)}  copy`, giorniFa(2)),
    cartella('/Users/t/Code/x-engine', `Cartella di lavoro: x-engine.\n\nUltimi commit:\n${giorno(3)}  scorer\n${giorno(40)}  init`, giorniFa(0)),
    cartella('/Users/t/Code/harbor-api', `Cartella di lavoro: harbor-api.\n\nUltimi commit:\n${giorno(1)}  routes`, giorniFa(1)),
    // i file cambiano (registri), ma l'ultimo commit è di un mese fa: non ci lavora
    cartella('/Users/t/Code/logger', `Cartella di lavoro: logger.\n\nUltimi commit:\n${giorno(30)}  init`, giorniFa(0)),
    // senza git vale la data della cartella
    cartella('/Users/t/Documents/bozze', 'Cartella di lavoro: bozze.\n\nNessuna storia git.', giorniFa(5)),
    cartella('/Users/t/Documents/archivio', 'Cartella di lavoro: archivio.\n\nNessuna storia git.', giorniFa(20)),
    cartella('/Users/t/Documents/Vecchio', `Cartella di lavoro: Vecchio.\n\nUltimi commit:\n${giorno(1)}  x`, giorniFa(1)),
    { id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'x-engine', corpo: 'non una cartella', quando: giorniFa(0) } as never
  ]
  const s = vista.suggeriti(docs, tutti, ADESSO)
  assert.deepEqual(s.map(x => x.nome), ['harbor-api', 'x-engine', 'bozze'])
  assert.equal(s[0]!.percorso, '/Users/t/Code/harbor-api')
  assert.equal(vista.suggeriti(docs, tutti, ADESSO, '/Users/t')[0]!.dove, '~/Code', 'la casa si scrive «~»')
  assert.equal(vista.suggeriti(docs, tutti, ADESSO, '/Users/altro')[0]!.dove, '/Users/t/Code')
  assert.equal(s[1]!.ultima.slice(0, 10), giorno(3), 'l’ultima attività è l’ultimo commit, non la data dei file')
  const molte = Array.from({ length: 9 }, (_, i) => cartella(`/Users/t/Code/p${i}`, `Ultimi commit:\n${giorno(i)}  x`, giorniFa(i)))
  assert.equal(vista.suggeriti(molte, [], ADESSO).length, vista.SUGGERITI_MAX)
})

test('il materiale conta cosa ha letto, per genere; il quadro tiene sintesi e letto, e senza sintesi resta com’era', async () => {
  const ev = progetti.scrivi({ nome: 'Evermute deck', obiettivo: 'Ship Evermute 1.0' })
  store.salvaDocumenti([
    cartella('/Users/t/Desktop/Evermute', 'Cartella di lavoro: Evermute. README: Evermute, the iOS app.', new Date().toISOString()),
    { id: 'conversazioni:codice:e1', fonte: 'conversazioni', tipo: 'chat', titolo: 'Evermute · build', corpo: 'Project: /Users/t/Desktop/Evermute\n\nYou: upload build 15\n\nClaude: done.', quando: new Date().toISOString() },
    { id: 'posta:INBOX:9', fonte: 'posta', tipo: 'email', titolo: 'Evermute deck feedback', corpo: 'Send me the Evermute numbers slide before Friday.', quando: new Date().toISOString() }
  ] as never)
  const m = await quadro.materiale(ev, store.recenti(100), async () => 'README:\nEvermute build 15.')
  assert.equal(m.letto.cartelle, 1)
  assert.equal(m.letto.sessioni, 1)
  assert.equal(m.letto.posta, 1)

  quadro.perProva({ chiediJSON: (async () => ({
    obiettivo: { testo: 'Ship Evermute 1.0', certezza: 0.9 }, domanda: '', domandaTipo: '',
    stato: 'Build 15 is uploaded. Review is pending.', sintesi: 'Evermute is an iOS app about to ship 1.0 — build 15 is in review and the deck goes to Marco on Friday.',
    traguardo: 'Evermute 1.0 live on the App Store', blocco: '', mosse: []
  })) as never })
  const q = await quadro.quadroDi(ev, m)
  assert.ok(q)
  assert.match(q.sintesi ?? '', /^Evermute is an iOS app/)
  assert.doesNotMatch(q.sintesi ?? '', /—/, 'il testo generato passa da senzaTrattini')
  assert.deepEqual(q.letto, m.letto)

  quadro.perProva({ chiediJSON: (async () => ({ obiettivo: { testo: 'Ship', certezza: 0.9 }, domanda: '', domandaTipo: '', stato: 'Build 15 is uploaded.', traguardo: '', blocco: '', mosse: [] })) as never })
  const senza = await quadro.quadroDi(ev, m)
  assert.equal(senza?.sintesi, undefined, 'un modello che non la scrive non inventa una sintesi')
  assert.equal(vista.succo(senza!), 'Build 15 is uploaded.')
})
