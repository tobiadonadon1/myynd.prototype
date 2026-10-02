// Il quadro come un professionista: niente faccende di codice, il lavoro che
// fa da sé in coda per la notte nella sua cartella, la domanda sull'obiettivo
// solo quando il lavoro non basta, il riordino dei progetti chiesto e fatto
// solo con un sì, e la pagina pubblica letta come la vede un cliente.
//
//   node --test server/quadro-consulente.test.ts

import { test, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-consulente-'))
const scrivania = realpathSync(mkdtempSync(join(tmpdir(), 'myynd-scrivania-')))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Tobia' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const quadro = await import('./quadro.ts')
const priorita = await import('./priorita.ts')
const riordino = await import('./riordino.ts')
const domande = await import('./domande.ts')
const rifinitura = await import('./rifinitura.ts')
const mani = await import('./mani.ts')
const { feedAttuale } = await import('./attenzione.ts')
afterEach(() => { quadro.perProva(null); priorita.perProva(null); rifinitura.perProva(null) })
after(() => { mani.perProva(null); store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }); rmSync(scrivania, { recursive: true, force: true }) })

const giorniFa = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
/** Un progetto con un nome che `scrivi` unirebbe a uno che c'è: com'erano nati dal punto, prima. */
function nato(nome: string): import('./progetti.ts').Progetto {
  const p = progetti.scrivi({ nome: `provvisorio ${Math.random().toString(36).slice(2)}`, origine: 'punto' })
  store.default.prepare('UPDATE progetti SET nome = ? WHERE id = ?').run(nome, p.id)
  return progetti.trova(p.id)!
}

test('le faccende di codice non passano, le mosse vere sì', () => {
  const fonti = new Map([['memoria', 'The blog has had no new post since September 14.']])
  const base = { genere: 'consiglio', testo: 'The blog has been quiet for eighteen days and the site loses search traffic.', leva: 2, urgenza: 'settimana', offerta: 'I draft two posts from your recent work.', prova: 'The blog has had no new post since September 14.', fonte: 'memoria' }
  for (const titolo of ['Ship the sito worktree changes to tobiadonadon.com', 'Fill the Myynd website launch values for Vercel', 'Turn the Evermute deck outline into full slides', 'Merge the site branch into main', 'Freeze engine work and post one original weekly', 'Focus on the launch this week'])
    assert.equal(quadro.ripulisciMossa({ ...base, titolo }, fonti, []), null, titolo)
  assert.ok(quadro.ripulisciMossa({ ...base, titolo: 'Write a new blog post: it has been 18 days' }, fonti, []))
  // un'automazione si accende con un tocco solo se l'offerta lo dice così
  assert.equal(quadro.ripulisciMossa({ ...base, genere: 'automazione', titolo: 'Check the blog every Monday' }, fonti, []), null)
  assert.ok(quadro.ripulisciMossa({ ...base, genere: 'automazione', titolo: 'Check the blog every Monday', offerta: 'I set up an automation that checks the blog every Monday.' }, fonti, []))
})

test('la pagina pubblica: gli indirizzi giusti, il testo senza markup, le date del blog', () => {
  assert.deepEqual(quadro.indirizziDi('tobiadonadon.com', 'see https://github.com/x/y and http://localhost:5173'), ['https://tobiadonadon.com'])
  assert.deepEqual(quadro.indirizziDi('Evermute', 'Landing: https://www.evermute.app/ for the app'), ['https://www.evermute.app/'])
  const t = quadro.testoDellaPagina('<html><head><title>Tobia</title><style>x{}</style></head><body><h1>Hello</h1><p>Three offers &amp; a blog</p><script>bad()</script></body></html>')
  assert.match(t, /Titolo: Tobia/)
  assert.match(t, /## Hello/)
  assert.match(t, /Three offers & a blog/)
  assert.doesNotMatch(t, /bad\(\)|x\{\}/)
  assert.deepEqual(quadro.ultimeDate('<url><lastmod>2026-09-14</lastmod></url><url><lastmod>2026-08-01</lastmod></url>'), ['2026-09-14', '2026-08-01'])
})

test('il riordino: due nomi per lo stesso progetto e un nome con una parola di troppo, chiesto per intero e fatto solo con un sì', () => {
  const hfarm = progetti.scrivi({ nome: 'H-Farm' })
  const doppio = nato('H-Farm: I want to help to solidify AI Systems to Streamline company efforts.')
  const deck = nato('Evermute deck')
  const suo = progetti.scrivi({ nome: 'Lumen site' })
  const piano = riordino.trova(progetti.elenco(), ['/Users/t/Desktop/Evermute', '/Users/t/Desktop/Lumen'])
  assert.deepEqual(piano.unisci.map(u => [u.da, u.in]), [[doppio.id, hfarm.id]])
  assert.deepEqual(piano.rinomina.map(r => [r.id, r.dopo]), [[deck.id, 'Evermute']], 'il nome scritto da lui non si tocca')
  assert.ok(!piano.rinomina.some(r => r.id === suo.id))
  const testo = riordino.domanda(piano, 'en')
  assert.match(testo, /«H-Farm» appears twice/)
  assert.match(testo, /rename «Evermute deck» to «Evermute»/)

  // un no si ricorda, e la domanda non torna
  assert.equal(riordino.forse(['/Users/t/Desktop/Evermute']), true)
  const d = store.domandaAperta()!
  assert.ok(d.tema.startsWith(riordino.TEMA))
  assert.match(riordino.rispondi(d.tema, 'no, leave them', 'en'), /leave them/)
  store.chiudiDomanda(d.id, 'risposta', 'no')
  assert.equal(riordino.forse(['/Users/t/Desktop/Evermute']), false)
  assert.ok(progetti.trova(doppio.id), 'niente unito dopo un no')
})

test('un sì al riordino unisce e rinomina, dalla risposta sulla prima pagina', async () => {
  const a = progetti.scrivi({ nome: 'Nextas' })
  const b = nato('Nextas: outreach agent for the audit offer')
  const piano = riordino.trova(progetti.elenco(), [])
  assert.ok(piano.unisci.some(u => u.da === b.id && u.in === a.id))
  assert.equal(riordino.forse([]), true)
  const d = store.domandaAperta()!
  const { esito } = await domande.rispondiADomanda(d.id, 'yes, do it')
  assert.match(esito, /^Done: merged the two «Nextas»/)
  assert.equal(progetti.trova(b.id), null)
  assert.ok(progetti.trova(a.id))
})

test('una risposta qualunque al riordino non tocca niente', () => {
  const x = progetti.scrivi({ nome: 'Atlas' })
  const y = nato('Atlas: the sales deck for the second round of investors')
  const tema = `${riordino.TEMA}${riordino.impronta(riordino.trova(progetti.elenco(), []))}`
  assert.equal(riordino.forse([]), true)
  assert.match(riordino.rispondi(tema, 'what do you mean exactly?', 'en'), /leave them/)
  assert.ok(progetti.trova(x.id) && progetti.trova(y.id))
})

test('il lavoro che fa da sé va in coda per la notte, non sul feed; la domanda sull\'obiettivo solo quando non si capisce', async () => {
  for (const d of store.domandeConTema('')) if (d.stato === 'aperta') store.chiudiDomanda(d.id, 'ignorata')
  const sito = progetti.scrivi({ nome: 'tobiadonadon.com', obiettivo: '' })
  const vaga = progetti.scrivi({ nome: 'Orbita' })
  store.salvaDocumenti([
    { id: 'lavoro:/Users/t/Desktop/tobiaweb', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: tobiaweb', corpo: 'README: the source of tobiadonadon.com. The blog lives in /blog.', percorso: '/Users/t/Desktop/tobiaweb', quando: giorniFa(0) }
  ] as never)
  rifinitura.perProva({ collegato: () => false })
  let guardate = 0
  quadro.perProva({
    collegato: () => true,
    leggi: async () => 'README: the source of tobiadonadon.com. The blog lives in /blog.',
    guarda: async u => { guardate++; return `Titolo: Tobia Donadon\nUltime date di pubblicazione trovate (sitemap o feed): 2026-09-14 (${u})` },
    chiediJSON: (async (o: { system: string; messages: { content: string }[] }) => {
      if (/«Orbita»/.test(o.system)) return { obiettivo: { testo: 'Unclear', certezza: 0.2 }, domanda: 'What do you want Orbita to do for you this month?', stato: 'Little material.', traguardo: '', blocco: '', mosse: [] }
      if (!/«tobiadonadon\.com»/.test(o.system)) return { obiettivo: { testo: 'x', certezza: 0.9 }, domanda: '', stato: 'Quiet.', traguardo: '', blocco: '', mosse: [] }
      assert.match(o.messages[0].content, /\[esterno:https:\/\/tobiadonadon\.com\]/, 'il sito vero sta nel materiale')
      return {
        obiettivo: { testo: 'Sell the info products on the site', certezza: 0.85 },
        domanda: 'What is the site for?',
        stato: 'The site sells one product; the blog stopped on September 14.', traguardo: 'A new post every two weeks', blocco: '',
        mosse: [
          { genere: 'lavoro', titolo: 'Draft two blog posts from your recent work', testo: 'The blog stopped on September 14 and search traffic depends on it.', leva: 2, urgenza: 'settimana', offerta: 'I write two drafts and save them in your Myynd folder.', prova: 'Ultime date di pubblicazione trovate (sitemap o feed): 2026-09-14', fonte: 'esterno:https://tobiadonadon.com' },
          { genere: 'automazione', titolo: 'Watch the blog and draft a post every two weeks', testo: 'A post every two weeks keeps the site alive without you thinking about it.', leva: 2, urgenza: 'settimana', offerta: 'I set up an automation that checks the blog every Monday and drafts a post.', prova: 'The blog lives in /blog.', fonte: 'lavoro:/Users/t/Desktop/tobiaweb' }
        ]
      }
    }) as never
  })
  priorita.perProva({ collegato: () => true, chiediJSON: (async () => ({ priorita: [], domande: [], superate: [] })) as never })
  priorita.dimentica()
  await priorita.forse(true)
  assert.ok(guardate >= 1, 'la pagina pubblica è stata letta')
  const riga = store.elencoCompiti().find(c => c.testo === 'Draft two blog posts from your recent work')
  assert.ok(riga, 'il lavoro è una riga sotto il progetto')
  assert.equal(riga.origine, 'quadro')
  assert.equal(riga.progetto, sito.id)
  assert.equal(riga.turno?.quando, 'notte')
  assert.match(riga.nota ?? '', /subfolder «tobiadonadon\.com»/)
  const feed = feedAttuale() as Record<string, unknown>[]
  assert.ok(!feed.some(v => v.titolo === 'Draft two blog posts from your recent work'), 'il lavoro non è una carta: torna fatto')
  const auto = feed.find(v => v.titolo === 'Watch the blog and draft a post every two weeks')
  assert.ok(auto && auto.tipo === 'Proposta' && /^I set up an automation/.test(String(auto.offerta)))
  // la domanda sull'obiettivo: per Orbita sì, per il sito (certezza 0.85) no
  const aperte = store.domandeConTema(priorita.TEMA_QUADRO).filter(d => d.stato === 'aperta')
  assert.deepEqual(aperte.map(d => d.progetto), [vaga.id])
  assert.equal(quadro.leggiQuadri()[sito.id]!.domanda, undefined)
  // la risposta diventa l'obiettivo, e il quadro di Orbita si rifà
  const { esito } = await domande.rispondiADomanda(aperte[0]!.id, 'Get three paying pilots by November')
  assert.match(esito, /Saved as the goal for Orbita/)
  assert.equal(progetti.trova(vaga.id)!.obiettivo, 'Get three paying pilots by November')
  assert.equal(quadro.leggiQuadri()[vaga.id]!.versione, 0)
})

test('la consegna del quadro va nella sottocartella del progetto', () => {
  mani.perProva({ scrivania: () => scrivania, ospitato: () => false } as never)
  const s = mani.salvaConsegna({ titolo: 'Two blog drafts', testo: '# Draft one\n\nText.', luogo: 'myynd', sotto: 'tobiadonadon.com' })
  assert.equal(s.percorso, join(scrivania, 'Myynd', 'tobiadonadon.com', 'Two blog drafts.md'))
  assert.ok(existsSync(s.percorso))
  assert.match(readFileSync(s.percorso, 'utf8'), /Draft one/)
  const strano = mani.salvaConsegna({ titolo: 'x note', testo: 'Testo.', luogo: 'myynd', sotto: '../../etc' })
  assert.ok(strano.percorso.startsWith(join(scrivania, 'Myynd')), 'un nome storto non esce dalla cartella')
})

test('quello che solo lui può fare va nella sua lista di oggi; una domanda su una cosa vista va nelle note', async () => {
  for (const d of store.domandeConTema('')) if (d.stato === 'aperta') store.chiudiDomanda(d.id, 'ignorata')
  store.default.prepare("DELETE FROM domande").run()
  const ev = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Get Evermute approved in the US' })
  rifinitura.perProva({ collegato: () => false })
  quadro.perProva({
    collegato: () => true, guarda: async () => '',
    leggi: async () => 'README: Evermute. Build 15 waits for signing access from Tommaso.',
    chiediJSON: (async (o: { system: string }) => {
      if (!/«Evermute»/.test(o.system)) return { obiettivo: { testo: 'x', certezza: 0.9 }, domanda: '', domandaTipo: '', stato: 'Quiet.', traguardo: '', blocco: '', mosse: [] }
      return {
        obiettivo: { testo: 'Get Evermute approved in the US', certezza: 0.9 },
        domanda: 'The App Store page still shows the Italian screenshots: is that on purpose for the US listing?', domandaTipo: 'osservazione',
        stato: 'Build 15 is ready.', traguardo: 'Build 15 approved', blocco: 'Signing access from Tommaso',
        mosse: [{ genere: 'sblocco', titolo: 'Ask Tommaso for signing access on build 15', testo: 'The upload of build 15 waits only on this access in his Apple team.', leva: 3, urgenza: 'oggi', offerta: 'I draft the two line message to Tommaso.', prova: 'Build 15 waits for signing access from Tommaso.', fonte: 'lavoro:/Users/t/Desktop/Evermute' }]
      }
    }) as never
  })
  store.salvaDocumenti([{ id: 'lavoro:/Users/t/Desktop/Evermute', fonte: 'lavoro', tipo: 'cartella', titolo: 'Lavoro: Evermute', corpo: 'README: Evermute.', percorso: '/Users/t/Desktop/Evermute', quando: giorniFa(0) }] as never)
  priorita.perProva({ collegato: () => true, chiediJSON: (async () => ({ priorita: [], domande: [], superate: [] })) as never })
  priorita.dimentica()
  await priorita.forse(true)
  const riga = store.elencoCompiti().find(c => c.testo === 'Ask Tommaso for signing access on build 15')
  assert.ok(riga, 'nella sua lista')
  assert.equal(riga.modo, 'io')
  assert.equal(riga.giorno, new Date().toLocaleDateString('en-CA'), 'di oggi')
  assert.match(riga.nota ?? '', /I draft the two line message to Tommaso/)
  assert.ok(!(feedAttuale() as Record<string, unknown>[]).some(v => v.titolo === riga.testo), 'non anche come carta')
  const d = store.domandeConTema(priorita.TEMA_QUADRO).find(x => x.stato === 'aperta')
  assert.ok(d && d.tema.startsWith('quadro:osservazione:'), 'la domanda su una cosa vista, anche con l\'obiettivo chiaro')
  const { esito } = await domande.rispondiADomanda(d.id, 'No, swap them for the English ones')
  assert.match(esito, /Saved in Evermute's notes/)
  assert.match(progetti.trova(ev.id)!.note, /Italian screenshots.*swap them for the English ones/)
})
