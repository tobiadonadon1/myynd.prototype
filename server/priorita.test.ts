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
const cfg = await import('./config.ts')
const jev = await import('./jev.ts')
const giudizi = await import('./giudizi.ts')
const rifinitura = await import('./rifinitura.ts')
const { feedAttuale } = await import('./attenzione.ts')
after(() => { priorita.perProva(null); jev.perProva(null); rifinitura.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

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

/** Dove `ripulisci` cerca le prove, nelle prove: la mail di App Review, la memoria di Evermute, un riferimento. */
const RIFERIMENTO = 'Evermute: waiting on Apple, the recording goes out on Friday.\nSito: the three offers are drafted, pricing pending.'
const fontiDiProva = (): import('./priorita.ts').FontiPriorita => ({
  testoDoc: id => {
    const d = store.documento(id)
    return d ? { titolo: d.titolo, testo: d.corpo, quando: d.quando ?? null, autore: d.autore ?? null } : null
  },
  memoria: id => priorita.testoDelProgetto(id),
  riferimento: RIFERIMENTO,
  nomiDi: id => id === p.id ? ['Evermute'] : [],
  progetti: [p]
})
const PROVA_APPLE = 'we need a recording of the app on a physical device and setup instructions'

test('ripulisci chiude la porta: verbo, misure, documento fra quelli letti, progetto per nome, niente doppioni, niente lineette', () => {
  const ids = new Set(['posta:INBOX:1'])
  const nomi = new Map([['evermute', p.id]])
  const fonti = fontiDiProva()
  const buona = priorita.ripulisci({ genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked twelve days ago for a recording on a physical device and setup instructions — nothing went back yet.', perche: 'Apple waits for the device recording to continue the review.', progetto: 'Evermute', doc: 'posta:INBOX:1', offerta: 'I draft the reply with the recording checklist and the setup steps.', prova: PROVA_APPLE }, ids, nomi, [], new Set(), fonti)
  assert.ok(buona)
  assert.equal(buona.progetto, p.id)
  assert.equal(buona.doc, 'posta:INBOX:1')
  assert.equal(buona.origine, 'doc')
  assert.doesNotMatch(buona.testo, /—/)
  // un documento non fra quelli letti diventa «nessuno»: allora serve il progetto e la prova nella sua memoria
  const senza = priorita.ripulisci({ genere: 'proposta', titolo: 'Write three info products from the website material', testo: 'The offers note lists audit, workshop and retainer: each can become a paid guide.', perche: 'The App Store release waits on the three products.', progetto: 'Evermute', doc: 'posta:INBOX:99', offerta: 'I outline the three products with a price and a first chapter each.', prova: 'Ship Evermute 1.0 on the App Store' }, ids, nomi, [], new Set(), fonti)
  assert.ok(senza && senza.progetto === p.id && senza.doc === null && senza.origine === 'memoria')
  // già in lista con altre parole: fuori
  assert.equal(priorita.ripulisci({ genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked for a recording on a physical device and setup instructions.', perche: 'Apple waits for the device recording to continue the review.', progetto: '', doc: 'posta:INBOX:1', offerta: 'I draft the reply with the recording checklist.', prova: PROVA_APPLE }, ids, nomi, ['Reply to Apple App Review with the recording of the device'], new Set(), fonti), null)
  // senza offerta non è una priorità di Myynd: è un appunto
  assert.equal(priorita.ripulisci({ genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked for a recording on a physical device and setup instructions.', perche: 'Apple waits for the device recording to continue the review.', progetto: '', doc: 'posta:INBOX:1', offerta: '', prova: PROVA_APPLE }, ids, nomi, [], new Set(), fonti), null)
  assert.equal(priorita.ripulisci({ genere: 'boh', titolo: 'x', testo: 'y', perche: 'z', progetto: '', doc: '', offerta: 'w' }, ids, nomi, [], new Set(), fonti), null)
  // il gergo non arriva sulla prima pagina: «non capisco, parole semplici e dirette»
  assert.equal(priorita.ripulisci({ genere: 'priorita', titolo: 'Redesign the two text-heavy cards', testo: 'The note asks for a cleaner layout of the two project cards on the first page.', perche: 'The first page waits on the two cards.', progetto: 'Evermute', doc: '', offerta: 'I will turn the note into a concise UI specification with layout, hierarchy, and acceptance criteria.', prova: 'Ship Evermute 1.0 on the App Store' }, ids, nomi, [], new Set(), fonti), null)
  assert.equal(priorita.conGergo('Ti preparo la risposta ad Apple con il video e le istruzioni'), false)
})

test('la prova: nel documento citato, nella memoria del progetto, o in una riga del riferimento che lo nomina; altrimenti la voce non c’è', () => {
  const ids = new Set(['posta:INBOX:1', 'posta:INBOX:3'])
  const nomi = new Map([['evermute', p.id]])
  const fonti = fontiDiProva()
  const base = { genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked twelve days ago for a recording on a physical device and setup instructions.', perche: 'Apple waits for the device recording to continue the review.', offerta: 'I draft the reply with the recording checklist.' }
  // nel documento
  assert.equal(priorita.ripulisci({ ...base, progetto: '', doc: 'posta:INBOX:1', prova: PROVA_APPLE }, ids, nomi, [], new Set(), fonti)?.origine, 'doc')
  // un documento vero, ma la prova non ci sta: la carta «appesa a un documento a caso» non nasce
  assert.equal(priorita.ripulisci({ ...base, progetto: '', doc: 'posta:INBOX:3', prova: PROVA_APPLE }, ids, nomi, [], new Set(), fonti), null)
  // nella memoria del progetto
  const memoria = priorita.ripulisci({ ...base, perche: 'The App Store release waits on the recording.', progetto: 'Evermute', doc: '', prova: 'Ship Evermute 1.0 on the App Store' }, ids, nomi, [], new Set(), fonti)
  assert.equal(memoria?.origine, 'memoria')
  // una citazione dalla memoria, senza progetto: non si sa di chi è
  assert.equal(priorita.ripulisci({ ...base, perche: 'The App Store release waits on the recording.', progetto: '', doc: '', prova: 'Ship Evermute 1.0 on the App Store' }, ids, nomi, [], new Set(), fonti), null)
  // in una riga del riferimento che nomina il progetto
  const rif = priorita.ripulisci({ ...base, perche: 'The recording for Apple goes out on Friday.', progetto: 'Evermute', doc: '', prova: 'the recording goes out on Friday' }, ids, nomi, [], new Set(), fonti)
  assert.equal(rif?.origine, 'riferimento')
  // una riga del riferimento che nomina un altro progetto: no
  assert.equal(priorita.ripulisci({ ...base, perche: 'The three offers wait on the pricing.', progetto: 'Evermute', doc: '', prova: 'the three offers are drafted' }, ids, nomi, [], new Set(), fonti), null)
  // una prova che non sta da nessuna parte
  assert.equal(priorita.ripulisci({ ...base, progetto: 'Evermute', doc: '', prova: 'this sentence was never written anywhere' }, ids, nomi, [], new Set(), fonti), null)
  // un perché che parla del progetto invece che di chi aspetta
  assert.equal(priorita.ripulisci({ ...base, perche: 'Matters for the Evermute project.', progetto: '', doc: 'posta:INBOX:1', prova: PROVA_APPLE }, ids, nomi, [], new Set(), fonti), null)
  // la voce di una carta dalla memoria: fonte «memoria», niente documento, l'istantanea con la prova
  const voce = priorita.voceDelFeed(memoria!) as { fonte?: string; doc?: string }
  assert.equal(voce.fonte, 'memoria')
  assert.ok(!('doc' in voce))
  assert.deepEqual(JSON.parse((voce as { contesto: string }).contesto), { fonte: 'memoria', progetto: p.id, prova: 'Ship Evermute 1.0 on the App Store' })
  // lo schema e il prompt non dicono un numero di voci
  assert.doesNotMatch(JSON.stringify(priorita.FORMA_PER_PROVA.properties.priorita.description), /\d|sei|fino a/i)
})

test('i generi nuovi: una scadenza vuole la data letta nella fonte, una cosa da leggere vuole il documento', () => {
  const ids = new Set(['posta:INBOX:1'])
  const nomi = new Map([['evermute', p.id]])
  const fonti = fontiDiProva()
  const base = { titolo: 'Renew the Apple developer membership', testo: 'The renewal notice sits in the inbox and the card on file has expired.', perche: 'Apple waits for the recording before the review continues.', progetto: 'Evermute', doc: 'posta:INBOX:1', offerta: 'I prepare the renewal with the new card details.', prova: PROVA_APPLE }
  const pulisci = (g: Record<string, unknown>, gia: string[] = []) => priorita.ripulisci(g, ids, nomi, gia, new Set(), fonti)
  assert.equal(pulisci({ genere: 'scadenza', ...base, quando: '' }), null, 'senza data non è una scadenza')
  assert.equal(pulisci({ genere: 'scadenza', ...base, quando: 'soon' }), null)
  const con = pulisci({ genere: 'scadenza', ...base, quando: 'renews 3 October' })
  assert.ok(con && con.genere === 'scadenza' && con.quando === 'renews 3 October')
  const voce = priorita.voceDelFeed(con!)
  assert.equal(voce.tipo, 'Scadenza')
  assert.equal(voce.urgenza, 'renews 3 October')
  assert.equal(priorita.eProposta(voce), true, 'una scadenza del giro ha l’offerta, e il feed la tratta come le priorità')
  assert.equal(priorita.eProposta({ tipo: 'Scadenza', offerta: '' }), false, 'una scadenza della lettura normale no')
  // la data può stare nel testo
  const nelTesto = pulisci({ genere: 'scadenza', ...base, testo: 'The membership renews on 2026-10-03 and the card on file has expired.', quando: '' })
  assert.ok(nelTesto)
  assert.equal(priorita.conUnaData('entro venerdì'), true)
  assert.equal(priorita.conUnaData('next week maybe'), false)
  // da leggere: senza un documento fra quelli letti non c'è niente da aprire
  assert.equal(pulisci({ genere: 'da-leggere', ...base, doc: '' }), null)
  const leggi = pulisci({ genere: 'da-leggere', ...base })
  assert.ok(leggi && priorita.voceDelFeed(leggi).tipo === 'Da leggere')
  // «Imposto un'automazione…» è una proposta anche se l'ha chiamata priorità
  const auto = pulisci({ genere: 'priorita', ...base, offerta: 'I set up an automation that files the App Review mails every Monday.' })
  assert.equal(auto?.genere, 'proposta')
})

test('con il riferimento, un progetto che lui ha detto morto non si propone, nemmeno per nome', () => {
  const sito = progetti.scrivi({ nome: 'Sito', obiettivo: 'Three offers online' })
  const ids = new Set(['posta:INBOX:1'])
  const nomi = new Map([['evermute', p.id], ['sito', sito.id]])
  const morti = riferimento.progettiMorti('Evermute: shipping. Sito: dead, I dropped it in August.', [p, sito])
  assert.deepEqual([...morti], [sito.id])
  const fonti = { ...fontiDiProva(), nomiDi: (id: string) => id === p.id ? ['Evermute'] : id === sito.id ? ['Sito'] : [] }
  const g = { genere: 'proposta', titolo: 'Turn the three website offers into info products', testo: 'The offers note lists audit, workshop and retainer: each can become a paid guide.', perche: 'The three offers wait on the pricing.', progetto: 'Sito', doc: '', offerta: 'I outline the three products with a price each.', prova: 'Three offers online' }
  assert.equal(priorita.ripulisci(g, ids, nomi, [], morti, fonti), null, 'il progetto morto non passa')
  assert.equal(priorita.ripulisci({ ...g, progetto: '', titolo: 'Rewrite the Sito offers page' }, ids, nomi, [], morti, fonti), null, 'nemmeno nominato nel titolo senza progetto')
  assert.ok(priorita.ripulisci({ ...g, progetto: 'Evermute', titolo: 'Write the Evermute release notes', perche: 'The App Store release waits on the notes.', prova: 'Ship Evermute 1.0 on the App Store' }, ids, nomi, [], morti, fonti), 'un progetto vivo passa')
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
      // l'asticella, e nessun numero: né «fino a sei», né «zero è sbagliato», né «almeno metà»
      assert.match(o.system, /Scrivi solo le priorità che passano l'asticella/)
      assert.match(o.system, /Zero è una risposta giusta\./)
      assert.doesNotMatch(o.system, /zero voci è una risposta sbagliata|Almeno metà|Scrivi fino a/)
      assert.match(o.system, /citi alla lettera in «prova»/)
      return { priorita: [
        { genere: 'priorita', titolo: 'Reply to App Review with the device recording', testo: 'Apple asked twelve days ago for a recording on a physical device and setup instructions; nothing went back yet.', perche: 'Apple waits for the recording before the review continues.', progetto: 'Evermute', doc: 'posta:INBOX:1', offerta: 'I draft the reply with the recording checklist and the setup steps.', prova: 'we need a recording of the app on a physical device and setup instructions' },
        { genere: 'proposta', titolo: 'Turn the three website offers into info products', testo: 'The offers note lists audit, workshop and retainer: each can become a paid guide with a price.', perche: 'The draft pricing is still pending on the offers note.', progetto: '', doc: 'desktop:/Users/t/Desktop/note.md', offerta: 'I outline the three products with a price and a first chapter each.', prova: 'Draft pricing pending.' },
        { genere: 'priorita', titolo: 'short', testo: 'no', perche: 'no', progetto: '', doc: '', offerta: '', prova: '' }
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
          { genere: 'proposta', titolo: 'Turn the three website offers into info products', testo: 'The offers note lists audit, workshop and retainer: each can become a paid guide.', perche: 'The draft pricing is still pending on the offers note.', progetto: 'Sito', doc: 'desktop:/Users/t/Desktop/note.md', offerta: 'I outline the three products with a price each.', quando: '', prova: 'Draft pricing pending.' },
          { genere: 'scadenza', titolo: 'Sign the Ceru contract before the keys', testo: 'Marta wrote two months ago that the keys wait on your signature.', perche: 'Marta waits for your signature before the keys.', progetto: '', doc: 'posta:INBOX:3', offerta: 'I draft the reply to Marta with the signed pages.', quando: '', prova: 'we still need your signature on the contract' }
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

test('una priorità che non si capisce arriva sul feed riscritta, con il peso; senza Jev arriva com’è', async () => {
  priorita.dimentica()
  // senza documento: la prova sta nella memoria di Evermute (il suo obiettivo)
  const confusa = { genere: 'priorita', titolo: 'Verify Jev keeps Myynd data local before expanding it', testo: 'The September 20 commit uses Jev for reading decisions, while the TypeSafe review says real use calls its service.', perche: 'The App Store release waits on the privacy check.', progetto: 'Evermute', doc: '', offerta: 'I read the TypeSafe terms and write down what leaves the Mac.', quando: '', prova: 'Ship Evermute 1.0 on the App Store' }
  priorita.perProva({ collegato: () => true, chiediJSON: (async () => ({ priorita: [confusa], domande: [] })) as never })
  let riscritture = 0
  rifinitura.perProva({ collegato: () => true, chiediJSON: (async () => {
    riscritture++
    return { titolo: 'Record the Myynd walkthrough video', testo: 'Your founder post needs the app video you asked for on September 18.', urgenza: '', perche: 'The founder post waits on the app video.' }
  }) as never })
  // senza Jev: la carta arriva sul feed com’è, senza peso, e il modello non riscrive
  assert.equal(await priorita.forse(true), 1)
  let voce = (feedAttuale() as Record<string, unknown>[]).find(v => v.tipo === 'Priorità' && /Jev/.test(String(v.titolo)))
  assert.ok(voce, 'la priorità è sul feed')
  assert.equal(voce.titolo, confusa.titolo)
  assert.equal(voce.peso, null)
  assert.equal(riscritture, 0)
  store.cambiaStatoFeed(String(voce.id), 'scartato', 'prova')

  // con Jev che la dice confusa: riscritta dal modello grande, e con il peso
  priorita.dimentica()
  cfg.aggiorna({ jev: { apiKey: 'apikey_prova' } })
  giudizi.scorda(); jev.dimentica()
  jev.perProva(async (_u, opz) => {
    const corpo = JSON.parse(String((opz as RequestInit).body)) as { questions: Record<string, unknown> }
    if (corpo.questions.chiara) return Response.json({ answers: {
      chiara: { type: 'noul', noul: 0.2 },
      peso: { type: 'score', score: 2.4, confidence: 0.9, probabilities: {}, legend: {} }
    } })
    if (corpo.questions.doppione) return Response.json({ answers: { doppione: { type: 'choice', choice: 'nessuno', confidence: 0.9, probabilities: { nessuno: 0.9 } } } })
    // il peso dei documenti, con cui si scelgono i quarantotto
    return Response.json({ answers: { peso: { type: 'score', score: 1.5, confidence: 0.9, probabilities: {}, legend: {} } } })
  })
  // un'altra carta confusa: la prima è stata scartata, e una scartata non si ripropone
  const cucita = { ...confusa, titolo: 'Record the Myynd walkthrough and attach it to the founder post', testo: 'Your September 18 request specified an app video, while recent feedback says the posts lack pictures and links.', perche: 'The App Store release waits on the walkthrough video.', offerta: 'I write the shot list for the walkthrough video.' }
  priorita.perProva({ collegato: () => true, chiediJSON: (async () => ({ priorita: [cucita], domande: [] })) as never })
  try {
    assert.equal(await priorita.forse(true), 1)
    voce = (feedAttuale() as Record<string, unknown>[]).find(v => v.tipo === 'Priorità' && /walkthrough/.test(String(v.titolo)))
    assert.ok(voce, 'la priorità è sul feed')
    assert.equal(voce.titolo, 'Record the Myynd walkthrough video', 'riscritta dal modello grande, perché Jev l’ha detta confusa')
    assert.equal(voce.testo, 'Your founder post needs the app video you asked for on September 18.')
    assert.equal(voce.peso, 2.4, 'con il peso giudicato sulla carta')
    assert.equal(voce.progetto, p.id, 'e il progetto scelto dal modello resta')
    assert.equal(riscritture, 1)
  } finally {
    jev.perProva(null); rifinitura.perProva(null); giudizi.scorda()
    const c = cfg.leggi(); delete c.jev; cfg.scrivi(c, { togli: ['jev'] })
  }
})

test('progettoDelTesto: il nome vince, il più lungo prima, l’alias del riferimento conta, due parole dell’obiettivo no', async () => {
  const { progettoDelTesto } = await import('./attenzione.ts')
  const progetti = await import('./progetti.ts')
  const ev = progetti.trovaPerNome('Evermute')!
  assert.equal(progettoDelTesto('Reply to App Review about Evermute'), ev.id)
  assert.equal(progettoDelTesto('Ship the thing on the App Store this week'), null, 'parole dell’obiettivo senza il nome non bastano')
})

// — adesso: il lavoro degli ultimi tre giorni, e il feed che lo segue —
//
// «It has to be things that are relevant to the things that I'm working on.»
// Il 22 settembre il feed teneva sette carte, quattro di giorni prima, e la
// sessione del pomeriggio su InfoProducts non era diventata niente: i giri
// partivano solo col feed quasi vuoto, e il materiale lo sceglieva il peso,
// non il tempo.

test('adesso: le sessioni e i commit degli ultimi tre giorni per cartella, i file toccati a parte, il vecchio fuori', () => {
  const ora = Date.now()
  const fa = (ore: number) => new Date(ora - ore * 3_600_000).toISOString()
  const oggi = fa(0).slice(0, 10)
  const docs = [
    { id: 'conversazioni:codice:1', fonte: 'conversazioni', tipo: 'chat', titolo: 'myynd.prototype · App testing fixes', corpo: 'x', quando: fa(1) },
    { id: 'conversazioni:codex:2', fonte: 'conversazioni', tipo: 'chat', titolo: 'InfoProducts · Infoproducts for Jev trading guides', corpo: 'x', quando: fa(2) },
    { id: 'conversazioni:codice:3', fonte: 'conversazioni', tipo: 'chat', titolo: 'myynd.prototype · Feed task intelligence', corpo: 'x', quando: fa(30) },
    { id: 'conversazioni:codice:4', fonte: 'conversazioni', tipo: 'chat', titolo: 'everwave · old session', corpo: 'x', quando: fa(5 * 24) },
    { id: 'lavoro:/x/myynd.prototype', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: myynd.prototype', quando: fa(1),
      corpo: `Cartella di lavoro: myynd.prototype.\n\nUltimi commit:\n${oggi}  myynd: la rassegna si rinnova\n${oggi}  Merge branch 'worktree-x'\n2026-01-02  un commit di gennaio` },
    { id: 'desktop:/x/Offer.pages', fonte: 'desktop', tipo: 'documento', titolo: 'Offer for H-Farm', corpo: 'x', quando: fa(5) },
    { id: 'posta:9', fonte: 'posta', tipo: 'email', titolo: 'A newsletter', corpo: 'x', quando: fa(1) }
  ]
  const l = priorita.lavoroInCorso(docs as never, ora)
  assert.deepEqual(l.filoni.map(f => f.nome), ['myynd.prototype', 'InfoProducts'], 'una sessione di cinque giorni fa non è adesso')
  const myynd = l.filoni[0]
  assert.deepEqual(myynd.sessioni, ['App testing fixes', 'Feed task intelligence'], 'la sessione e la cartella si incontrano per nome')
  assert.deepEqual(myynd.commit, ['myynd: la rassegna si rinnova'], 'né i merge né un commit di gennaio')
  assert.deepEqual(l.documenti, [`Offer for H-Farm (documento, ${fa(5).slice(0, 10)})`], 'un file toccato sì, una mail no')
  const testo = priorita.scriviLavoroInCorso(l)
  assert.match(testo, /InfoProducts .*Infoproducts for Jev trading guides/)
  assert.equal(priorita.scriviLavoroInCorso({ filoni: [], documenti: [] }), '')
  // una nota che si chiama come una chiave non ricopia la chiave nel prompt
  assert.equal(priorita.senzaChiavi('Jev apikey_21090110fd0d8e6942c2b42bb9607'), 'Jev […]')
  assert.equal(priorita.senzaChiavi('Infoproducts_for_Jev_trading_guides'), 'Infoproducts_for_Jev_trading_guides', 'le parole lunghe senza cifre restano')
})

test('col feed pieno il giro riparte quando il lavoro è cambiato, dopo quattro ore e non prima', () => {
  priorita.perProva({ collegato: () => true })
  store.salvaFeed(['Record the Evermute walkthrough', 'Send the H-Farm audit outline', 'Price the three website offers'].map(titolo => (
    { tipo: 'Priorità', titolo, testo: 'Nobody has moved this for a while and it blocks the next step.', perche: 'Moves the project', offerta: 'I draft it for you.', progetto: null }
  )))
  assert.ok(feedAttuale().length >= priorita.ABBASTANZA)
  const archivio = (ore: number) => writeFileSync(join(dati, 'priorita.json'), JSON.stringify({ ultimo: new Date(Date.now() - ore * 3_600_000).toISOString(), proposte: 1 }))
  archivio(5)
  assert.equal(priorita.pronta(), true, 'cinque ore e una cartella toccata dopo: si rifà')
  archivio(2)
  assert.equal(priorita.pronta(), false, 'due ore: aspetta, anche se il lavoro è cambiato')
  // senza niente di nuovo dopo l'ultimo giro non riparte, nemmeno dopo quattro ore
  assert.equal(priorita.lavoroNuovoDal(new Date(Date.now() + 60_000).toISOString(), store.recenti(200)), false)
  assert.equal(priorita.lavoroNuovoDal(null, []), true, 'mai fatto un giro: c’è tutto da guardare')
  priorita.dimentica()
})

test('il giro toglie le sue carte superate, e solo le sue: la carta di una mail resta', async () => {
  priorita.dimentica()
  store.salvaFeed([{ tipo: 'Da leggere', titolo: 'Sign the Ceru contract', testo: 'Marta still needs your signature before she hands over the keys.', perche: 'The house', progetto: null, doc: 'posta:INBOX:3' }])
  const aperte = store.feedAperto(40)
  const mia = aperte.find(v => v.titolo === 'Record the Evermute walkthrough')!
  const posta = aperte.find(v => v.titolo === 'Sign the Ceru contract')!
  assert.ok(mia && posta)
  let sistema = ''
  priorita.perProva({
    collegato: () => true,
    chiediJSON: (async (o: { system: string }) => {
      sistema = o.system
      return { priorita: [], domande: [], superate: [
        { id: mia.id, motivo: 'recorded in yesterday’s session' },
        { id: posta.id, motivo: 'looks old' },
        { id: 'non-esiste', motivo: 'whatever' }
      ] }
    }) as never
  })
  await priorita.forse(true)
  assert.match(sistema, /IN QUESTI TRE GIORNI LAVORA SU QUESTO/, 'il lavoro di adesso sta nel prompt')
  assert.ok(sistema.includes(`[${mia.id}]`), 'le carte aperte ci stanno con il loro id, così si possono dire superate')
  const dopo = store.feedAperto(40)
  assert.ok(!dopo.some(v => v.id === mia.id), 'la sua carta superata esce')
  assert.equal(store.voceFeed(mia.id)?.stato, 'scaduto', 'scaduta, non fatta: non l’ha fatta lui')
  assert.equal(store.voceFeed(mia.id)?.ragione, 'superata', 'la ragione dice che l’ha tolta il giro, non il tempo')
  assert.ok(dopo.some(v => v.id === posta.id), 'la carta di una mail la toglie solo lui')
  priorita.perProva(null)
})
