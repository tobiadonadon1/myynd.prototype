import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-priorita-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Tobia' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const priorita = await import('./priorita.ts')
const riferimento = await import('./riferimento.ts')
const { feedAttuale } = await import('./attenzione.ts')
after(() => { priorita.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

const giorniFa = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const p = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship Evermute 1.0 on the App Store' })
store.salvaDocumenti([
  { id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'App Store review: Evermute needs more information', corpo: 'Hello, we need a recording of the app on a physical device and setup instructions before we can continue the review of Evermute.', autore: 'App Review <review@apple.example>', quando: giorniFa(12), letto: 1 },
  { id: 'posta:INBOX:2', fonte: 'posta', tipo: 'email', titolo: 'Follow the money. Get 60% off.', corpo: 'Unsubscribe here. Promo code inside, limited offer, buy now.', autore: 'News <news@promo.example>', quando: giorniFa(1), massa: 1 },
  { id: 'desktop:/Users/t/Desktop/note.md', fonte: 'desktop', tipo: 'documento', titolo: 'Website offers', corpo: 'Three offers for tobiadonadon.com: audit, workshop, retainer. Draft pricing pending.', percorso: '/Users/t/Desktop/note.md', quando: giorniFa(20) },
  { id: 'desktop:/Users/t/x/node_modules/a/README.md', fonte: 'desktop', tipo: 'documento', titolo: 'README', corpo: 'npm install this package to use it in your project', percorso: '/Users/t/x/node_modules/a/README.md', quando: giorniFa(1) },
  { id: 'posta:INBOX:3', fonte: 'posta', tipo: 'email', titolo: 'Living in Ceru: the contract', corpo: 'Hi Tobia, we still need your signature on the contract before we can hand over the keys.', autore: 'Marta <marta@ceru.example>', quando: giorniFa(60), letto: 1 },
  { id: 'posta:INBOX:4', fonte: 'posta', tipo: 'email', titolo: 'Old thread', corpo: 'This was a long time ago and does not matter now.', autore: 'Luca <luca@example.com>', quando: giorniFa(120) },
  { id: 'lavoro:/Users/t/x-engine', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: x-engine', corpo: 'Cartella di lavoro: x-engine. Ultimi commit:\n2026-09-17  browser reply path working', percorso: '/Users/t/x-engine', quando: giorniFa(0) },
  // una chat con Claude Code parla di «system prompt»: per il feed sarebbero istruzioni interne, qui sono parole sue
  { id: 'conversazioni:claude:abc', fonte: 'conversazioni', tipo: 'chat', titolo: 'Evermute onboarding copy', corpo: 'Tobia: rewrite the system prompt for the Evermute onboarding.\nClaude: here is a draft.\n' + 'Tobia: good, and the App Review reply is still pending, I will send the recording on Friday. '.repeat(6), quando: giorniFa(2) }
] as never)

test('per le priorità contano anche le mail lette e i file vecchi, non la posta in serie e la roba di macchina', () => {
  const ids = priorita.documentiPerLePriorita(store.recenti(50)).map(d => d.id)
  assert.ok(ids.includes('posta:INBOX:1'), 'una mail letta di dodici giorni fa racconta un problema ancora aperto')
  assert.ok(ids.includes('desktop:/Users/t/Desktop/note.md'), 'un appunto di venti giorni fa è ancora il quadro')
  assert.ok(!ids.includes('posta:INBOX:2'), 'una promozione non dice niente su cosa fare')
  assert.ok(!ids.includes('desktop:/Users/t/x/node_modules/a/README.md'), 'un README di una libreria non è roba sua')
  assert.ok(ids.includes('posta:INBOX:3'), 'una mail di due mesi fa su un contratto ancora da firmare conta')
  assert.ok(!ids.includes('posta:INBOX:4'), 'oltre i novanta giorni è archeologia')
  assert.ok(ids.includes('lavoro:/Users/t/x-engine'), 'una cartella di lavoro con i suoi commit è il quadro')
  assert.ok(ids.includes('conversazioni:claude:abc'), 'una sua chat con un modello è il quadro, anche se parla di system prompt')
})

test('ripulisci chiude la porta: verbo, misure, documento fra quelli letti, progetto per nome, niente doppioni, niente lineette', () => {
  const ids = new Set(['posta:INBOX:1'])
  const nomi = new Map([['evermute', p.id]])
  const buona = priorita.ripulisci({ genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked twelve days ago for a recording on a physical device and setup instructions — nothing went back yet.', perche: 'Unblocks the Evermute App Store release', progetto: 'Evermute', doc: 'posta:INBOX:1', offerta: 'I draft the reply with the recording checklist and the setup steps.' }, ids, nomi, [])
  assert.ok(buona)
  assert.equal(buona.progetto, p.id)
  assert.equal(buona.doc, 'posta:INBOX:1')
  assert.doesNotMatch(buona.testo, /—/)
  // un documento non fra quelli letti e un progetto sconosciuto diventano «nessuno», non un errore
  const senza = priorita.ripulisci({ genere: 'proposta', titolo: 'Write three info products from the website material', testo: 'The offers note lists audit, workshop and retainer: each can become a paid guide.', perche: 'Moves tobiadonadon.com from copy to products', progetto: 'Nope', doc: 'posta:INBOX:99', offerta: 'I outline the three products with a price and a first chapter each.' }, ids, nomi, [])
  assert.ok(senza && senza.progetto === null && senza.doc === null)
  // già in lista con altre parole: fuori
  assert.equal(priorita.ripulisci({ genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked for a recording on a physical device and setup instructions.', perche: 'Unblocks the Evermute App Store release', progetto: '', doc: '', offerta: 'I draft the reply with the recording checklist.' }, ids, nomi, ['Reply to Apple App Review with the recording of the device']), null)
  // senza offerta non è una priorità di Myynd: è un appunto
  assert.equal(priorita.ripulisci({ genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked for a recording on a physical device and setup instructions.', perche: 'Unblocks the Evermute App Store release', progetto: '', doc: '', offerta: '' }, ids, nomi, []), null)
  assert.equal(priorita.ripulisci({ genere: 'boh', titolo: 'x', testo: 'y', perche: 'z', progetto: '', doc: '', offerta: 'w' }, ids, nomi, []), null)
  // il gergo non arriva sulla prima pagina: «non capisco, parole semplici e dirette»
  assert.equal(priorita.ripulisci({ genere: 'priorita', titolo: 'Redesign the two text-heavy cards', testo: 'The note asks for a cleaner layout of the two project cards on the first page.', perche: 'Moves Myynd toward a finished product', progetto: '', doc: '', offerta: 'I will turn the note into a concise UI specification with layout, hierarchy, and acceptance criteria.' }, ids, nomi, []), null)
  assert.equal(priorita.conGergo('Ti preparo la risposta ad Apple con il video e le istruzioni'), false)
})

test('i generi nuovi: una scadenza vuole la data letta nella fonte, una cosa da leggere vuole il documento', () => {
  const ids = new Set(['posta:INBOX:1'])
  const nomi = new Map([['evermute', p.id]])
  const base = { titolo: 'Renew the Apple developer membership', testo: 'The renewal notice sits in the inbox and the card on file has expired.', perche: 'Keeps Evermute on the App Store', progetto: 'Evermute', doc: 'posta:INBOX:1', offerta: 'I prepare the renewal with the new card details.' }
  assert.equal(priorita.ripulisci({ genere: 'scadenza', ...base, quando: '' }, ids, nomi, []), null, 'senza data non è una scadenza')
  assert.equal(priorita.ripulisci({ genere: 'scadenza', ...base, quando: 'soon' }, ids, nomi, []), null)
  const con = priorita.ripulisci({ genere: 'scadenza', ...base, quando: 'renews 3 October' }, ids, nomi, [])
  assert.ok(con && con.genere === 'scadenza' && con.quando === 'renews 3 October')
  const voce = priorita.voceDelFeed(con!)
  assert.equal(voce.tipo, 'Scadenza')
  assert.equal(voce.urgenza, 'renews 3 October')
  assert.equal(priorita.eProposta(voce), true, 'una scadenza del giro ha l’offerta, e il feed la tratta come le priorità')
  assert.equal(priorita.eProposta({ tipo: 'Scadenza', offerta: '' }), false, 'una scadenza della lettura normale no')
  // la data può stare nel testo
  const nelTesto = priorita.ripulisci({ genere: 'scadenza', ...base, testo: 'The membership renews on 2026-10-03 and the card on file has expired.', quando: '' }, ids, nomi, [])
  assert.ok(nelTesto)
  assert.equal(priorita.conUnaData('entro venerdì'), true)
  assert.equal(priorita.conUnaData('next week maybe'), false)
  // da leggere: senza un documento fra quelli letti non c'è niente da aprire
  assert.equal(priorita.ripulisci({ genere: 'da-leggere', ...base, doc: '' }, ids, nomi, []), null)
  const leggi = priorita.ripulisci({ genere: 'da-leggere', ...base }, ids, nomi, [])
  assert.ok(leggi && priorita.voceDelFeed(leggi).tipo === 'Da leggere')
  // «Imposto un'automazione…» è una proposta anche se l'ha chiamata priorità
  const auto = priorita.ripulisci({ genere: 'priorita', ...base, offerta: 'I set up an automation that files the App Review mails every Monday.' }, ids, nomi, [])
  assert.equal(auto?.genere, 'proposta')
})

test('con il riferimento, un progetto che lui ha detto morto non si propone, nemmeno per nome', () => {
  const sito = progetti.scrivi({ nome: 'Sito', obiettivo: 'Three offers online' })
  const ids = new Set(['posta:INBOX:1'])
  const nomi = new Map([['evermute', p.id], ['sito', sito.id]])
  const morti = riferimento.progettiMorti('Evermute: shipping. Sito: dead, I dropped it in August.', [p, sito])
  assert.deepEqual([...morti], [sito.id])
  const g = { genere: 'proposta', titolo: 'Turn the three website offers into info products', testo: 'The offers note lists audit, workshop and retainer: each can become a paid guide.', perche: 'Moves the site from copy to products', progetto: 'Sito', doc: '', offerta: 'I outline the three products with a price each.' }
  assert.equal(priorita.ripulisci(g, ids, nomi, [], morti), null, 'il progetto morto non passa')
  assert.equal(priorita.ripulisci({ ...g, progetto: '', titolo: 'Rewrite the Sito offers page' }, ids, nomi, [], morti), null, 'nemmeno nominato nel titolo senza progetto')
  assert.ok(priorita.ripulisci({ ...g, progetto: 'Evermute', titolo: 'Write the Evermute release notes' }, ids, nomi, [], morti), 'un progetto vivo passa')
  progetti.chiudi(sito.id)
})

test('forse: con un modello mette le priorità sul feed, con l’offerta, e non le rifà per mezz’ora', async () => {
  let chiamate = 0
  priorita.perProva({
    collegato: () => true,
    chiediJSON: (async (o: { system: string; messages: { content: string }[] }) => {
      chiamate++
      assert.match(o.system, /Evermute/, 'il progetto e il suo obiettivo stanno nel prompt')
      assert.match(o.messages[0].content, /App Store review/, 'la mail letta di dodici giorni fa sta nel materiale')
      assert.match(o.messages[0].content, /browser reply path working/, 'i commit della cartella di lavoro stanno nel materiale, per intero')
      assert.match(o.system, /cartelle di lavoro/, 'e il prompt dice come usarli')
      assert.match(o.messages[0].content, /send the recording on Friday. Tobia: good/, 'una chat entra per intero, come una cartella di lavoro')
      assert.match(o.system, /conversazioni con i modelli/, 'e il prompt dice cosa sono')
      assert.match(o.system, /Non ha ancora scritto a che punto è ogni progetto/, 'senza riferimento il prompt lo dice, e chiede di domandare')
      assert.match(o.system, /Collega quello che vedi fra progetti/, 'il collegamento fra progetti è una richiesta esplicita')
      return { priorita: [
        { genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked twelve days ago for a recording on a physical device and setup instructions; nothing went back yet.', perche: 'Unblocks the Evermute App Store release', progetto: 'Evermute', doc: 'posta:INBOX:1', offerta: 'I draft the reply with the recording checklist and the setup steps.' },
        { genere: 'proposta', titolo: 'Turn the three website offers into info products', testo: 'The offers note lists audit, workshop and retainer: each can become a paid guide with a price.', perche: 'Moves tobiadonadon.com from copy to products', progetto: '', doc: 'desktop:/Users/t/Desktop/note.md', offerta: 'I outline the three products with a price and a first chapter each.' },
        { genere: 'priorita', titolo: 'short', testo: 'no', perche: 'no', progetto: '', doc: '', offerta: '' }
      ] }
    }) as never
  })
  assert.equal(priorita.pronta(true), true)
  assert.equal(await priorita.forse(true), 2)
  assert.equal(chiamate, 1)
  // la prima pagina gli chiede il riferimento, prima di tutto
  const rif = store.domandaAperta()
  assert.ok(rif && rif.tema === riferimento.TEMA, 'senza riferimento, il giro lo chiede')
  const feed = feedAttuale() as Record<string, unknown>[]
  const voce = feed.find(v => v.tipo === 'Priorità')
  assert.ok(voce, 'una priorità sta sul feed anche se la sua mail ha dodici giorni')
  assert.equal(voce.doc, 'posta:INBOX:1')
  assert.match(String(voce.offerta), /^I draft the reply/)
  assert.equal(voce.progetto, p.id, 'la voce sa di quale progetto è, e la prima pagina la mette nel suo blocco')
  const proposta = feed.find(v => v.tipo === 'Proposta')
  assert.ok(proposta && proposta.doc === 'desktop:/Users/t/Desktop/note.md')
  // subito dopo: niente, né da sola né su richiesta
  assert.equal(priorita.pronta(true), false)
  assert.equal(await priorita.forse(true), 0)
  assert.equal(chiamate, 1)
  // e senza modello non parte mai
  priorita.dimentica()
  priorita.perProva({ collegato: () => false })
  assert.equal(priorita.pronta(true), false)
})

test('con il riferimento scritto: sta nel prompt, il progetto morto cade dal giro, e le domande si salvano una volta', async () => {
  priorita.dimentica()
  const sito = progetti.scrivi({ nome: 'Sito', obiettivo: 'Three offers online' })
  // risponde alla domanda sul riferimento: da qui in poi vale quello che ha scritto
  const rif = store.domandaAperta()!
  const domande = await import('./domande.ts')
  await domande.rispondiADomanda(rif.id, 'Evermute: waiting on Apple, I send the recording Friday. Sito: dead, dropped it in August.')
  assert.equal(store.domandaAperta(), null)
  let chiamate = 0
  priorita.perProva({
    collegato: () => true,
    chiediJSON: (async (o: { system: string }) => {
      chiamate++
      assert.match(o.system, /QUELLO CHE HA SCRITTO LUI/)
      assert.match(o.system, /Sito: dead, dropped it in August/)
      assert.match(o.system, /Morti, secondo lui: Sito/)
      assert.match(o.system, /Bloccati, secondo lui: Evermute/)
      return {
        priorita: [
          { genere: 'proposta', titolo: 'Turn the three website offers into info products', testo: 'The offers note lists audit, workshop and retainer: each can become a paid guide.', perche: 'Moves the site from copy to products', progetto: 'Sito', doc: 'desktop:/Users/t/Desktop/note.md', offerta: 'I outline the three products with a price each.', quando: '' },
          { genere: 'scadenza', titolo: 'Sign the Ceru contract before the keys', testo: 'Marta wrote two months ago that the keys wait on your signature.', perche: 'Unblocks the move to Ceru', progetto: '', doc: 'posta:INBOX:3', offerta: 'I draft the reply to Marta with the signed pages.', quando: '' }
        ],
        domande: [
          { progetto: 'Evermute', testo: 'Did the recording for App Review go out on Friday?', fonti: ['posta:INBOX:1', 'boh'] },
          { progetto: 'Sito', testo: 'Is the site really dead?', fonti: [] },
          { progetto: '', testo: 'Did the recording for the App Review go out?', fonti: [] }
        ]
      }
    }) as never
  })
  assert.equal(await priorita.forse(true), 0, 'il progetto morto cade, la scadenza senza data cade')
  assert.equal(chiamate, 1)
  const fatte = store.domandeConTema('priorita:')
  assert.equal(fatte.length, 1, 'una domanda: quella sul morto non si fa, quella ripetuta con altre parole nemmeno')
  assert.equal(fatte[0].progetto, p.id)
  assert.deepEqual(fatte[0].spunto, ['posta:INBOX:1'], 'lo spunto sono le fonti lette davvero')
  assert.equal(store.domandaAperta()?.tema, fatte[0].tema)
  // un altro giro con le stesse domande: niente doppioni
  priorita.dimentica()
  assert.equal(await priorita.forse(true), 0)
  assert.equal(store.domandeConTema('priorita:').length, 1)
  progetti.chiudi(sito.id)
})
