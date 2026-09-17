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
  { id: 'lavoro:/Users/t/x-engine', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: x-engine', corpo: 'Cartella di lavoro: x-engine. Ultimi commit:\n2026-09-17  browser reply path working', percorso: '/Users/t/x-engine', quando: giorniFa(0) }
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
