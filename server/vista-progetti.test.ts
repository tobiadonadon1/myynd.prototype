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
    // senza storia vale la data della cartella, ma solo se ha l'aria di un progetto (un README, degli appunti)
    cartella('/Users/t/Documents/bozze', 'Cartella di lavoro: bozze.\n\nNessuna storia git.\n\nREADME: Drafts for the newsletter.', giorniFa(5)),
    cartella('/Users/t/Documents/venv', 'Cartella di lavoro: venv.\n\nNessuna storia git.', giorniFa(1)),
    cartella('/Users/t/Documents/archivio', 'Cartella di lavoro: archivio.\n\nNessuna storia git.\n\nREADME: old stuff.', giorniFa(20)),
    // un repository senza commit è una cartella senza storia: senza README non si propone
    cartella('/Users/t/Code/vuoto', 'Cartella di lavoro: vuoto.\n\nNessuna storia git.', giorniFa(0)),
    cartella('/Users/t/Documents/Vecchio', `Cartella di lavoro: Vecchio.\n\nUltimi commit:\n${giorno(1)}  x`, giorniFa(1)),
    // un progetto dal nome cortissimo, nato da una cartella: la cartella è sua
    cartella('/Users/t/Code/ux', `Cartella di lavoro: ux.\n\nUltimi commit:\n${giorno(1)}  x`, giorniFa(1)),
    // un nome che non diventerebbe mai riconoscibile non si propone
    cartella('/Users/t/Code/___', `Cartella di lavoro: ___.\n\nUltimi commit:\n${giorno(1)}  x`, giorniFa(1)),
    { id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'x-engine', corpo: 'non una cartella', quando: giorniFa(0) } as never
  ]
  assert.ok(vista.suggeriti(docs, [], ADESSO).some(x => x.nome === 'ux'), 'controcaso: senza il progetto «ux» la cartella si propone')
  tutti.push({ nome: 'ux', alias: [] })
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

test('l’attività senza il materiale: le stesse fonti del quadro, senza testo e senza aprire cartelle', () => {
  const ev = progetti.elenco().find(p => p.nome === 'Evermute deck')!
  const a = quadro.attivitaDi(ev, store.recenti(100))
  assert.equal(a.letto.cartelle, 1)
  assert.equal(a.letto.sessioni, 1)
  assert.equal(a.letto.posta, 1)
  assert.ok(a.recente)
  const vuoto = quadro.attivitaDi(progetti.scrivi({ nome: 'Senza niente' }), store.recenti(100))
  assert.equal(vuoto.recente, null)
})

test('i testi lunghi si normalizzano una volta, e il risultato è lo stesso di prima', async () => {
  const am = await import('./ambiti-memoria.ts')
  const lungo = `Évermute Deck — the ÀPP ${'and more words here '.repeat(20)}`
  assert.equal(am.nomeNormalizzato(lungo), am.nomeNormalizzato(lungo))
  assert.match(am.nomeNormalizzato(lungo), /^evermute deck the app and more/)
  assert.equal(am.paroleNormalizzate(lungo), am.paroleNormalizzate(lungo), 'lo stesso insieme, non rifatto')
  assert.ok(am.paroleNormalizzate(lungo).has('evermute'))
  assert.ok(progetti.tocca({ nome: 'Evermute deck', obiettivo: '' }, lungo))
  assert.ok(!progetti.tocca({ nome: 'Northwind', obiettivo: '' }, lungo))
})

test('tagliare a una fine di frase: «1.0» non è una fine, e una frase sola troppo lunga si taglia a una parola', () => {
  assert.equal(quadro.tagliaAFrase('Ship 1.0 this week. Then the blog. Then rest.', 36), 'Ship 1.0 this week. Then the blog.')
  assert.equal(quadro.tagliaAFrase('Ship 1.0 this week. Then the blog.', 400, 1), 'Ship 1.0 this week.')
  const lunga = quadro.tagliaAFrase('word '.repeat(100), 40)
  assert.ok(lunga.length <= 40 && lunga.endsWith('word…'), lunga)
})

test('una sintesi troppo lunga si tiene, tagliata all’ultima frase che ci sta', async () => {
  const p = progetti.scrivi({ nome: 'Lungo', obiettivo: 'Ship it' })
  const frase = 'This sentence is part of a long gist about the project and what comes next. '
  quadro.perProva({ chiediJSON: (async () => ({ obiettivo: { testo: 'Ship it', certezza: 0.9 }, domanda: '', domandaTipo: '', stato: 'Fine.', sintesi: frase.repeat(20), traguardo: '', blocco: '', mosse: [] })) as never })
  const q = await quadro.quadroDi(p, await quadro.materiale(p, [], async () => ''))
  assert.ok(q?.sintesi, 'non si perde')
  assert.ok(q.sintesi.length <= quadro.SINTESI_MAX)
  assert.match(q.sintesi, /next\.$/, 'finisce a una fine di frase')
  progetti.chiudi(p.id)
})

test('un quadro di prima, senza sintesi, si rifà al primo giro utile; uno nuovo senza sintesi no', async () => {
  for (const p of progetti.elenco('attivo')) progetti.chiudi(p.id)
  const vecchio = progetti.scrivi({ nome: 'Vecchio quadro', obiettivo: 'Ship' })
  const nuovo = progetti.scrivi({ nome: 'Nuovo quadro', obiettivo: 'Ship' })
  const leggi = async () => ''
  const docs = store.recenti(1200)
  const tre = new Date(Date.now() - 3 * 3_600_000).toISOString()
  const base = { stato: 'Fine.', traguardo: '', blocco: '', mosse: [], quando: tre, versione: quadro.VERSIONE }
  writeFileSync(join(dati, 'quadri.json'), JSON.stringify({ quadri: {
    [vecchio.id]: { ...base, progetto: vecchio.id, nome: vecchio.nome, impronta: (await quadro.materiale(vecchio, docs, leggi)).impronta },
    [nuovo.id]: { ...base, progetto: nuovo.id, nome: nuovo.nome, impronta: (await quadro.materiale(nuovo, docs, leggi)).impronta, letto: { memoria: 1 } }
  } }))
  const chiesti: string[] = []
  quadro.perProva({ collegato: () => true, leggi, guarda: async () => '', chiediJSON: (async (o: { messages: { content: string }[] }) => {
    chiesti.push(o.messages[0]!.content.match(/«([^»]+)»/)![1]!)
    return { obiettivo: { testo: 'Ship', certezza: 0.9 }, domanda: '', domandaTipo: '', stato: 'Fine.', sintesi: 'A real gist, written now, about this project.', traguardo: '', blocco: '', mosse: [] }
  }) as never })
  await quadro.aggiorna()
  assert.deepEqual(chiesti, ['Vecchio quadro'])
  assert.equal(quadro.leggiQuadri()[vecchio.id]?.sintesi, 'A real gist, written now, about this project.')
})

test('la pagina si tiene un minuto, e si rifà subito se cambiano i quadri o i progetti', async () => {
  vista.svuotaCache()
  const prima = await vista.vista()
  assert.equal(await vista.vista(), prima, 'la seconda volta è la stessa, senza rifarla')
  const p = progetti.scrivi({ nome: 'Appena nato' })
  const dopo = await vista.vista()
  assert.notEqual(dopo, prima)
  assert.ok(dopo.progetti.some(x => x.id === p.id), 'un progetto nuovo si vede subito')
  const archivio = quadro.leggiQuadri()
  archivio[p.id] = { progetto: p.id, nome: p.nome, stato: 'Just born.', traguardo: '', blocco: '', mosse: [], quando: new Date().toISOString(), impronta: 'x', sintesi: 'Born a minute ago, nothing else yet.' }
  await new Promise(r => setTimeout(r, 20))
  writeFileSync(join(dati, 'quadri.json'), JSON.stringify({ quadri: archivio }))
  const conQuadro = await vista.vista()
  assert.equal(conQuadro.progetti.find(x => x.id === p.id)?.sintesi, 'Born a minute ago, nothing else yet.', 'un quadro nuovo si vede subito')
})
