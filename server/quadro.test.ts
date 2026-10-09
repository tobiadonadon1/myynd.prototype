// Il quadro dei progetti: di chi è una cartella, cosa conta di una sessione,
// la prova che deve stare nella fonte, la scelta della mossa che pesa di più,
// e il giro intero dentro le priorità, fino alla carta sul feed.
//
//   node --test server/quadro.test.ts

import { test, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-quadro-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Tobia' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const quadro = await import('./quadro.ts')
const priorita = await import('./priorita.ts')
const rifinitura = await import('./rifinitura.ts')
const { feedAttuale } = await import('./attenzione.ts')
afterEach(() => { quadro.perProva(null); priorita.perProva(null) })
after(() => { rifinitura.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

const giorniFa = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const evermute = progetti.scrivi({ nome: 'Evermute deck', obiettivo: 'Ship Evermute 1.0 on the App Store' })
const myynd = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Sell Myynd to the first twenty founders' })
const sito = progetti.scrivi({ nome: 'tobiadonadon.com', obiettivo: 'Ship the site copy and offers live' })

const FINE_EVERMUTE = 'Once you tell me it\'s done, I\'ll do the rest myself:\n- Upload build 15.\n- Resubmit with release set to your choice.'
store.salvaDocumenti([
  { id: 'lavoro:/Users/t/Desktop/Evermute', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: Evermute', corpo: 'Cartella di lavoro: Evermute. README: Evermute, the iOS app.', percorso: '/Users/t/Desktop/Evermute', quando: giorniFa(0) },
  { id: 'lavoro:/Users/t/Desktop/myynd.prototype', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: myynd.prototype', corpo: 'Cartella di lavoro: myynd.prototype.', percorso: '/Users/t/Desktop/myynd.prototype', quando: giorniFa(1) },
  { id: 'lavoro:/Users/t/Desktop/tobiaweb', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: tobiaweb', corpo: 'Cartella di lavoro: tobiaweb. README: the source of tobiadonadon.com, the personal site.', percorso: '/Users/t/Desktop/tobiaweb', quando: giorniFa(1) },
  { id: 'conversazioni:codice:e1', fonte: 'conversazioni', tipo: 'chat', titolo: 'Evermute · Meta ads SDK', corpo: `Project: /Users/t/Desktop/Evermute\n\nYou: integrate the Meta SDK and push to App Store Connect\n\nClaude: Before I write code, three decisions.\n\n${FINE_EVERMUTE}`, quando: giorniFa(0) },
  { id: 'conversazioni:codice:m1', fonte: 'conversazioni', tipo: 'chat', titolo: 'myynd.prototype · brand', corpo: 'Project: /Users/t/Desktop/myynd.prototype\n\nYou: the brand book is fine\n\nClaude: Noted.', quando: giorniFa(1) },
  { id: 'posta:INBOX:9', fonte: 'posta', tipo: 'email', titolo: 'Evermute deck feedback', corpo: 'Hi Tobia, I read the Evermute deck: send me the numbers slide before Friday.', autore: 'Marco <marco@fund.example>', quando: giorniFa(2) }
] as never)

test('di chi è una cartella: il nome dentro il nome, o il progetto nominato nel README', () => {
  assert.equal(quadro.cartellaDel(evermute, 'Evermute'), true, '«Evermute» è la cartella di «Evermute deck»')
  assert.equal(quadro.cartellaDel(myynd, 'myynd.prototype'), true)
  assert.equal(quadro.cartellaDel(sito, 'tobiaweb', 'the source of tobiadonadon.com, the personal site'), true, 'il README lo nomina')
  assert.equal(quadro.cartellaDel(sito, 'tobiaweb'), false, 'controcaso: senza README «tobiaweb» non è il sito')
  assert.equal(quadro.cartellaDel(evermute, 'everwave'), false, 'controcaso: un nome simile non basta')
  assert.equal(quadro.cartellaDel(myynd, 'x-engine'), false)
})

test('di una sessione contano le sue parole e la fine, non l\'inizio', () => {
  const d = store.documento('conversazioni:codice:e1')!
  assert.equal(quadro.cartellaDellaSessione(d), '/Users/t/Desktop/Evermute')
  const r = quadro.sessioneRidotta(d.corpo)
  assert.match(r, /integrate the Meta SDK/)
  assert.match(r, /Upload build 15/, 'la fine dice dove si è arrivati')
})

test('il materiale di un progetto: la sua cartella letta a fondo, le sue sessioni, la sua posta; non quelle degli altri', async () => {
  const letti: string[] = []
  const m = await quadro.materiale(evermute, store.recenti(100), async p => { letti.push(p); return `README:\nEvermute build 15 is ready to upload.\nUltimi commit:\n2026-10-02 bump build 15` })
  assert.deepEqual(letti, ['/Users/t/Desktop/Evermute'])
  assert.match(m.testo, /\[lavoro:\/Users\/t\/Desktop\/Evermute\]/)
  assert.match(m.testo, /Upload build 15/, 'la sessione nella sua cartella c\'è')
  assert.match(m.testo, /numbers slide before Friday/, 'la mail che nomina il progetto c\'è')
  assert.doesNotMatch(m.testo, /brand book/, 'controcaso: la sessione di Myynd no')
  assert.ok(m.fonti.has('conversazioni:codice:e1') && m.fonti.has('memoria'))
})

test('una mossa regge solo con la prova nella fonte che nomina', () => {
  const fonti = new Map([['conversazioni:codice:e1', FINE_EVERMUTE], ['memoria', 'Ship Evermute 1.0 on the App Store']])
  const buona = { genere: 'sblocco', titolo: 'Sign in to Xcode so build 15 can upload', testo: 'Claude is waiting on your Apple ID sign-in to upload build 15 and resubmit.', leva: 3, urgenza: 'oggi', offerta: 'I upload build 15 and resubmit as soon as you sign in.', prova: 'Upload build 15.', fonte: 'conversazioni:codice:e1' }
  const m = quadro.ripulisciMossa(buona, fonti, [])
  assert.ok(m)
  assert.equal(m.doc, 'conversazioni:codice:e1')
  assert.equal(m.origine, 'doc')
  assert.equal(quadro.ripulisciMossa({ ...buona, prova: 'Upload build 16 tonight.' }, fonti, []), null, 'una prova inventata non passa')
  assert.equal(quadro.ripulisciMossa({ ...buona, fonte: 'memoria' }, fonti, []), null, 'la prova deve stare nella fonte nominata, non altrove')
  assert.equal(quadro.ripulisciMossa(buona, fonti, ['Sign in to Xcode so build 15 uploads']), null, 'quello che ha già non torna')
  assert.equal(quadro.ripulisciMossa({ ...buona, leva: 5 }, fonti, []), null)
  const dallaMemoria = quadro.ripulisciMossa({ ...buona, prova: 'Ship Evermute 1.0 on the App Store', fonte: '[memoria]' }, fonti, [])
  assert.ok(dallaMemoria && dallaMemoria.doc === null && dallaMemoria.origine === 'memoria')
})

test('la scelta: la mossa più forte per progetto, le faccende di leva 1 fuori, il progetto importante prima a parità', () => {
  const mossa = (titolo: string, leva: 1 | 2 | 3, urgenza: 'oggi' | 'settimana' | 'poi') =>
    ({ genere: 'consiglio' as const, titolo, testo: 'x'.repeat(20), leva, urgenza, offerta: 'I do it', prova: 'p'.repeat(12), doc: null, origine: 'memoria' as const })
  const q = (progetto: string, mosse: ReturnType<typeof mossa>[]) => ({ progetto, nome: progetto, stato: '', traguardo: 'Live', blocco: '', mosse, quando: '', impronta: '' })
  const scelte = quadro.scegli([
    q('a', [mossa('Clean the old build folders today', 1, 'settimana'), mossa('Send the deck to Marco with the numbers', 3, 'settimana')]),
    q('b', [mossa('Tidy the logs of the night run', 1, 'poi')]),
    q('c', [mossa('Upload build 15 and resubmit to Apple', 3, 'settimana')])
  ], ['Send the deck to Marco with the numbers slide'], new Set(['c']))
  assert.deepEqual(scelte.map(s => s.titolo), ['Upload build 15 and resubmit to Apple'], 'già in lista fuori, leva 1 non di oggi fuori')
  assert.equal(scelte[0].perche, 'Live')
})

test('il giro intero: il quadro chiede al modello per ogni progetto cambiato, e la mossa forte arriva sul feed con la sua offerta', async () => {
  // la rifinitura senza modello: niente riscrittura, la carta passa com'è
  rifinitura.perProva({ collegato: () => false })
  const chiesti: string[] = []
  quadro.perProva({
    collegato: () => true,
    guarda: async () => '',
    leggi: async p => p.endsWith('Evermute') ? 'README:\nEvermute build 15 is ready to upload.' : '',
    chiediJSON: (async (o: { system: string; messages: { content: string }[] }) => {
      const nome = o.system.match(/su un progetto: «([^»]+)»/)?.[1] ?? ''
      chiesti.push(nome)
      assert.match(o.system, /faccende di codice NON sono mosse/, 'il prompt dice cosa non è una mossa')
      assert.match(o.system, /solo lui può fare[\s\S]*È la prima mossa/, 'un blocco che scioglie solo lui è la prima mossa')
      if (nome !== 'Evermute deck') return { stato: 'Quiet.', traguardo: '', blocco: '', mosse: [] }
      assert.match(o.messages[0].content, /Upload build 15/)
      return {
        stato: 'Build 15 is ready; Claude waits for the Apple ID sign in to upload it.',
        traguardo: 'Evermute 1.0.6 approved on the App Store',
        blocco: 'Xcode needs his Apple ID sign in',
        mosse: [
          { genere: 'consiglio', titolo: 'Sign in to Xcode so build 15 can upload', testo: 'The upload and the resubmission wait only on your Apple ID sign in.', leva: 3, urgenza: 'oggi', offerta: 'I upload build 15 and resubmit once you sign in.', prova: 'Upload build 15.', fonte: 'conversazioni:codice:e1' },
          { genere: 'consiglio', titolo: 'Invent a launch party', testo: 'Nothing in the material says this, it is made up.', leva: 3, urgenza: 'oggi', offerta: 'I plan it.', prova: 'a party for the launch on Friday', fonte: 'posta:INBOX:9' }
        ]
      }
    }) as never
  })
  priorita.perProva({ collegato: () => true, chiediJSON: (async (o: { system: string }) => {
    assert.match(o.system, /IL QUADRO DEI PROGETTI/, 'le priorità vedono il quadro')
    assert.match(o.system, /Sign in to Xcode so build 15 can upload/, 'e sanno quali carte sono già nate dal quadro')
    return { priorita: [], domande: [], superate: [] }
  }) as never })
  const nuove = await priorita.forse(true)
  assert.equal(nuove, 1)
  assert.deepEqual(chiesti.sort(), ['Evermute deck', 'Myynd', 'tobiadonadon.com'])
  const voce = (feedAttuale() as Record<string, unknown>[]).find(v => v.titolo === 'Sign in to Xcode so build 15 can upload')
  assert.ok(voce, 'la mossa è sul feed')
  assert.equal(voce.progetto, evermute.id)
  assert.match(String(voce.offerta), /I upload build 15/)
  assert.equal(voce.doc ?? null, null, 'una sessione regge tante mosse: la carta non la prende come suo documento')
  assert.ok(!(feedAttuale() as Record<string, unknown>[]).some(v => v.titolo === 'Invent a launch party'), 'la mossa senza prova vera non c\'è')
  // il quadro resta: un giro dopo, con il materiale fermo, non si richiede
  chiesti.length = 0
  await quadro.aggiorna()
  assert.equal(chiesti.length, 0, 'materiale uguale, niente chiamate')
  assert.match(quadro.leggiQuadri()[evermute.id]!.traguardo, /approved on the App Store/)
})

test('una mossa già messa non torna, e una seconda mossa dalla stessa cartella non resta bloccata dalla prima', async () => {
  rifinitura.perProva({ collegato: () => false })
  let giro = 0
  quadro.perProva({
    collegato: () => true,
    guarda: async () => '',
    leggi: async p => p.endsWith('Evermute') ? 'README:\nEvermute build 15 is ready to upload.\nThe Italian store listing still needs screenshots.' + ' '.repeat(giro) : '',
    chiediJSON: (async (o: { system: string }) => {
      if (!/«Evermute deck»/.test(o.system)) return { stato: 'Quiet.', traguardo: '', blocco: '', mosse: [] }
      return { stato: 'Ready.', traguardo: 'Approved', blocco: '', mosse: [
        { genere: 'consiglio', titolo: 'Sign in to Xcode so build 15 can upload', testo: 'The upload and the resubmission wait only on your Apple ID sign in.', leva: 3, urgenza: 'oggi', offerta: 'I upload build 15 and resubmit once you sign in.', prova: 'Evermute build 15 is ready to upload.', fonte: 'lavoro:/Users/t/Desktop/Evermute' },
        { genere: 'consiglio', titolo: 'Make the Italian store screenshots for Evermute', testo: 'The Italian listing is the last missing piece before the release goes out.', leva: 2, urgenza: 'settimana', offerta: 'I draft the five screenshots captions in Italian.', prova: 'The Italian store listing still needs screenshots.', fonte: 'lavoro:/Users/t/Desktop/Evermute' }
      ] }
    }) as never
  })
  priorita.perProva({ collegato: () => true, chiediJSON: (async () => ({ priorita: [], domande: [], superate: [] })) as never })
  priorita.dimentica()
  // il giro di prima ha già messo «Sign in to Xcode…»: il quadro va rifatto (materiale cambiato) e la seconda mossa arriva
  giro = 1
  const archivio = quadro.leggiQuadri()
  for (const id of Object.keys(archivio)) archivio[id]!.quando = new Date(Date.now() - 3 * 3_600_000).toISOString()
  writeFileSync(join(dati, 'quadri.json'), JSON.stringify({ quadri: archivio }))
  assert.equal(await priorita.forse(true), 1)
  const titoli = (feedAttuale() as Record<string, unknown>[]).map(v => v.titolo)
  assert.ok(titoli.includes('Make the Italian store screenshots for Evermute'), 'la seconda mossa dalla stessa cartella arriva')
  assert.equal(titoli.filter(t => t === 'Sign in to Xcode so build 15 can upload').length, 1, 'la prima non si rimette')
  assert.deepEqual(quadro.leggiQuadri()[evermute.id]!.messe?.sort(), ['Make the Italian store screenshots for Evermute', 'Sign in to Xcode so build 15 can upload'])
})

test('quello che ha scritto lui regge una mossa solo dentro una riga', () => {
  const fonti = new Map([['riferimento', 'Evermute: waiting on Apple.\nThe recording goes out on Friday.']])
  const base = { genere: 'sblocco', titolo: 'Send Apple the recording on Friday', testo: 'Apple waits for the recording before the review of Evermute continues.', leva: 3, urgenza: 'settimana', offerta: 'I draft the reply to Apple with the recording.', fonte: 'riferimento' }
  assert.ok(quadro.ripulisciMossa({ ...base, prova: 'The recording goes out on Friday.' }, fonti, []))
  assert.equal(quadro.ripulisciMossa({ ...base, prova: 'waiting on Apple. The recording goes out' }, fonti, []), null, 'a cavallo di due righe il feed la nasconderebbe subito')
})

test('un quadro senza risposta non segna il giro delle priorità come fatto: si riprova presto', async () => {
  rifinitura.perProva({ collegato: () => false })
  // il materiale cambia per tutti: ogni quadro va richiesto, e il modello non risponde
  const archivio = quadro.leggiQuadri()
  for (const id of Object.keys(archivio)) archivio[id]!.quando = new Date(Date.now() - 30 * 3_600_000).toISOString()
  writeFileSync(join(dati, 'quadri.json'), JSON.stringify({ quadri: archivio }))
  let chiesti = 0
  quadro.perProva({ collegato: () => true, guarda: async () => '', leggi: async () => 'README:\nnew line ' + Date.now(), chiediJSON: (async () => { chiesti++; return null }) as never })
  // le priorità rispondono: è solo il quadro a mancare
  priorita.perProva({ collegato: () => true, chiediJSON: (async () => ({ priorita: [], domande: [], superate: [] })) as never })
  priorita.dimentica()
  await priorita.forse(true)
  assert.ok(chiesti > 0, 'il quadro è stato chiesto')
  assert.equal(quadro.senzaRispostaAlGiro(), true)
  const letto = JSON.parse(readFileSync(join(dati, 'priorita.json'), 'utf8')) as { ultimo: string | null; fallito?: string }
  assert.equal(letto.ultimo, null, 'il giro non si segna come fatto')
  assert.ok(letto.fallito, 'si segna come andato a vuoto, e il giro di fondo riprova fra un quarto d’ora')
  // il quadro risponde al giro dopo: la serie si chiude
  quadro.perProva({ collegato: () => true, guarda: async () => '', leggi: async () => 'README:\nnew line ' + Date.now(), chiediJSON: (async () => ({ stato: 'Quiet.', traguardo: '', blocco: '', mosse: [] })) as never })
  await priorita.forse(true)
  assert.equal(quadro.senzaRispostaAlGiro(), false)
  assert.ok(JSON.parse(readFileSync(join(dati, 'priorita.json'), 'utf8')).ultimo, 'adesso sì, il giro è fatto')
})
