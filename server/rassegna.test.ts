// La rassegna legge roba scritta da altri diciannove server.
//
// È la differenza fra questo modulo e tutti gli altri: qui dentro non arriva
// niente che abbiamo prodotto noi. Un feed che cambia forma, un titolo con
// dentro un'entità HTML, una data in un formato che non avevamo previsto — non
// sono casi limite, sono martedì. E quando uno di questi va storto non si vede
// un errore: si vede una fascia con dentro «&#8216;» al posto di una virgoletta,
// o quattro titoli di borsa di fila, o la stessa notizia scritta due volte da
// due giornali. Cose che nessuno segnala e che si smettono di leggere.
//
// Perciò le prove stanno sul pezzo che tocca il mondo — il parser, la cernita,
// la scelta a mano — e nessuna di loro va in rete: i feed sono qui sotto, scritti
// come li scrivono davvero BBC, Bloomberg e The Verge.
//
//   node --test server/rassegna.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cernita, contestoDi, daRifare, entita, impronta, inTema, leggiFeed, ordina, pareUnRilascio, pulisciLink, rappresenta, rilascioDiUnLaboratorio, ricuciScelte, rilevanza, ripulisci, sceltaAMano, selezioneVisibile, sensato, simili, MINUTI_GIRO, QUANTE, SEMPRE, type Grezza
} from './rassegna.ts'
import { giornoIn } from './fuso.ts'
import type { Notizia } from './store.ts'

const FONTE = { nome: 'Prova', url: 'https://x', argomento: 'mondo', lingua: '*' } as const

// — l'XML —

test('un item RSS con CDATA torna intero', () => {
  const [n] = leggiFeed(`<rss><channel><item>
    <title><![CDATA[Stocks Fall as Strikes Spur Rally in Oil]]></title>
    <description><![CDATA[A flare-up in geopolitical risks sent stocks lower.]]></description>
    <link>https://www.bloomberg.com/news/articles/2026-08-30/x</link>
    <pubDate>Sun, 30 Aug 2026 22:13:50 GMT</pubDate>
  </item></channel></rss>`, FONTE)

  assert.equal(n.titolo, 'Stocks Fall as Strikes Spur Rally in Oil')
  assert.equal(n.riassunto, 'A flare-up in geopolitical risks sent stocks lower.')
  assert.equal(n.link, 'https://www.bloomberg.com/news/articles/2026-08-30/x')
  assert.equal(n.quando, '2026-08-30T22:13:50.000Z')
  assert.equal(n.fonte, 'Prova')
})

test('un entry Atom ha il link in un attributo, non nel testo', () => {
  // è la differenza che spacca in due i parser scritti in fretta: `<link>` in
  // Atom è vuoto, e chi legge solo il testo del tag esce con la stringa vuota
  const [n] = leggiFeed(`<feed><entry>
    <title type="html"><![CDATA[New York governor to 3D-printed gun leader]]></title>
    <link rel="alternate" type="text/html" href="https://www.theverge.com/policy/986733/x" />
    <id>https://www.theverge.com/?p=986733</id>
    <published>2026-08-31T10:20:00-04:00</published>
    <summary type="html"><![CDATA[<p>Cody Wilson announced a tool last week.</p>]]></summary>
  </entry></feed>`, FONTE)

  assert.equal(n.link, 'https://www.theverge.com/policy/986733/x')
  assert.equal(n.riassunto, 'Cody Wilson announced a tool last week.')
})

test('Google News: il giornale vero sulla carta, il titolo senza la coda, niente riassunto di link', () => {
  const xml = `<rss><channel><item>
    <title>Anthropic releases Claude Opus 5 - Reuters</title>
    <link>https://news.google.com/rss/articles/CBMiabc?oc=5</link>
    <pubDate>Tue, 22 Sep 2026 18:07:05 GMT</pubDate>
    <description>&lt;a href="https://news.google.com/rss/articles/CBMiabc"&gt;Anthropic releases Claude Opus 5&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Reuters&lt;/font&gt;</description>
    <source url="https://www.reuters.com">Reuters</source>
  </item></channel></rss>`
  const [n] = leggiFeed(xml, { nome: 'Google News', url: 'https://x', argomento: 'ia', lingua: '*', aggregatore: true })
  assert.equal(n.titolo, 'Anthropic releases Claude Opus 5')
  assert.equal(n.fonte, 'Reuters')
  assert.equal(n.riassunto, '')
  assert.equal(n.argomento, 'ia')
})

test('il link «self» del feed non diventa il link della notizia', () => {
  const [n] = leggiFeed(`<feed><entry>
    <title>Una cosa</title>
    <published>2026-09-14T10:00:00Z</published>
    <link rel="self" type="application/atom+xml" href="https://esempio.it/feed.xml" />
    <link rel="alternate" type="text/html" href="https://esempio.it/articolo" />
  </entry></feed>`, FONTE)
  assert.equal(n.link, 'https://esempio.it/articolo')
})

test('una voce senza link non entra: sarebbe un titolo che non si apre', () => {
  const fuori = leggiFeed(`<rss><channel>
    <item><title>Senza indirizzo</title></item>
    <item><title>Con indirizzo</title><link>https://esempio.it/a</link><pubDate>2026-09-14T10:00:00Z</pubDate></item>
  </channel></rss>`, FONTE)
  assert.equal(fuori.length, 1)
  assert.equal(fuori[0].titolo, 'Con indirizzo')
})

test('le entità HTML tornano lettere, anche quelle numeriche', () => {
  assert.equal(entita('&#8216;tell Cody&#8217;'), '‘tell Cody’')
  assert.equal(entita('AT&amp;T &lt;3'), 'AT&T <3')
  assert.equal(entita('&#x27;ciao&#x27;'), "'ciao'")
  // quella che non conosciamo resta com'è invece di sparire
  assert.equal(entita('&nonesiste; qui'), '&nonesiste; qui')
})

test('il riassunto perde i tag e finisce dove finisce una frase', () => {
  const lungo = `<p>${'Prima frase molto lunga. '.repeat(20)}Ultima.</p>`
  const corto = ripulisci(lungo)
  assert.ok(!corto.includes('<'), 'sono rimasti dei tag')
  assert.ok(corto.length <= 341, `${corto.length} caratteri: troppo`)
  assert.ok(/[.…]$/.test(corto), `finisce male: «${corto.slice(-40)}»`)
})

test('un riassunto corto non si tocca', () => {
  assert.equal(ripulisci('<p>Due parole.</p>'), 'Due parole.')
})

test('la coda di tracciamento non cambia l’identità di un articolo', () => {
  const a = pulisciLink('https://esempio.it/a?utm_source=rss&utm_medium=feed&id=7')
  assert.equal(a, 'https://esempio.it/a?id=7', 'ha tolto anche quello che serve')

  const stesso = (u: string) => leggiFeed(`<rss><item><title>T</title><link>${u}</link><pubDate>2026-09-14T10:00:00Z</pubDate></item></rss>`, FONTE)[0].id
  assert.equal(
    stesso('https://esempio.it/a?utm_source=rss'),
    stesso('https://esempio.it/a#commenti'),
    'lo stesso articolo con due code diverse conta come due notizie'
  )
})

// — la cernita —

const ora = Date.UTC(2026, 7, 31, 12)
const fa = (ore: number) => new Date(ora - ore * 3600_000).toISOString()

function finta(x: Partial<Grezza> & { id: string }): Grezza {
  return {
    titolo: `Titolo ${x.id}`, riassunto: '', fonte: 'A', link: `https://e.it/${x.id}`,
    argomento: 'mondo', quando: fa(2), ...x
  }
}

test('le notizie vecchie restano fuori', () => {
  const dentro = cernita([
    finta({ id: 'nuova', quando: fa(3) }),
    finta({ id: 'vecchia', titolo: 'Tutt’altra cosa', quando: fa(400) })
  ], ora)
  assert.deepEqual(dentro.map(n => n.id), ['nuova'])
})

/** Titoli che non si somigliano fra loro: servono a provare tutto il resto. */
const TITOLI = [
  'Il grano vola dopo la chiusura dello stretto',
  'Apple presenta i portatili con il processore nuovo',
  'La banca centrale lascia fermi i tassi fino a dicembre',
  'Trovata acqua liquida sotto la superficie di Marte',
  'Sciopero dei treni annunciato per lunedì mattina',
  'Il campionato riparte senza tre squadre iscritte',
  'Nuova stretta europea sulle etichette alimentari',
  'Ricercatori misurano il ghiaccio perso in Groenlandia',
  'Una startup francese raccoglie duecento milioni',
  'Riaperto il valico di frontiera dopo sei settimane'
]

test('la finestra non si allarga quando c’è poco: tre giorni fa non è «adesso»', () => {
  // ogni giro guarda solo i titoli nuovi, quindi «poco» è la regola; allargare
  // ripescava le notizie di due giorni prima, quelle che «feel old»
  const vecchie = TITOLI.slice(0, 5).map((titolo, i) => finta({ id: `v${i}`, titolo, quando: fa(60) }))
  assert.equal(cernita(vecchie, ora).length, 0)
  // un laboratorio resta tre giorni: un rilascio di ieri l'altro vale ancora
  assert.equal(cernita([finta({ id: 'lab', fonte: 'Anthropic', titolo: 'Introducing Claude for Chrome', quando: fa(60) })], ora).length, 1)
})

test('la stessa notizia da due giornali entra una volta sola', () => {
  const fuori = cernita([
    finta({ id: 'a', titolo: 'Il prezzo del grano vola per la guerra', fonte: 'BBC' }),
    finta({ id: 'b', titolo: 'Il prezzo del grano vola: ecco perché', fonte: 'ANSA' })
  ], ora)
  assert.equal(fuori.length, 1, 'lo stesso fatto compare due volte nella rassegna')
})

test('lo stesso modello alla stessa versione è lo stesso fatto, anche con titoli che non si somigliano', () => {
  // il 22 settembre: la stessa uscita, due carte una sotto l'altra
  assert.ok(simili(impronta('Introducing GPT-6 Sol and Luna'), impronta('OpenAI launches GPT-6 Sol and Luna, boasting lower cost and fewer mistakes')))
  assert.ok(simili(impronta('Anthropic launches Claude Opus 5.5, promising Fable-level performance at a lower price'),
    impronta('Anthropic launches Claude Opus 5.5 with stricter safeguards for cybersecurity')))
  // versioni diverse sono uscite diverse
  assert.ok(!simili(impronta('OpenAI ships GPT-6'), impronta('OpenAI ships GPT-6.1 to developers')))
  assert.ok(!simili(impronta('Gemini 3 arrives in Chrome'), impronta('Gemini 4 arrives in Chrome for everyone')))
  // e senza un modello nel titolo la regola di prima resta quella
  assert.ok(!simili(impronta('Anthropic hires a new policy chief'), impronta('Anthropic opens an office in Tokyo')))
})

test('l’impronta non si fa ingannare da maiuscole, accenti e punteggiatura', () => {
  assert.deepEqual(impronta('Perché il grano vola, oggi'), impronta('PERCHE IL GRANO VOLA — oggi'))
  assert.ok(!simili(impronta('Il grano vola in Europa'), impronta('Il petrolio scende a Londra')))
})

test('due titoli lunghi che si somigliano per caso restano due notizie', () => {
  // il rischio dell'altra direzione: buttare una notizia buona perché condivide
  // qualche parola con un'altra. Due parole in comune non bastano.
  assert.ok(!simili(
    impronta('Apple presenta il nuovo processore per i portatili'),
    impronta('Apple perde la causa sui brevetti in Germania')
  ))
})

test('un giornale prolifico non si prende la rassegna', () => {
  // otto pezzi da uno e uno dagli altri due: senza il giro fra le code, i primi
  // candidati sarebbero tutti dello stesso giornale
  const tante = [
    ...TITOLI.slice(0, 8).map((titolo, i) => finta({ id: `x${i}`, titolo, fonte: 'Prolifico' })),
    finta({ id: 'q', titolo: 'Il porto di Genova chiude per due giorni', fonte: 'Quieto' }),
    finta({ id: 'z', titolo: 'Vinta la causa sui brevetti in Germania', fonte: 'Zitto' })
  ]
  const primi = cernita(tante, ora).slice(0, 3).map(n => n.fonte)
  assert.equal(new Set(primi).size, 3, `i primi tre vengono da ${primi.join(', ')}`)
})

// — la scelta senza modello —

test('senza modello la rassegna esce lo stesso, e gira fra gli argomenti', () => {
  const candidate = [
    ...Array.from({ length: 6 }, (_, i) => finta({ id: `e${i}`, fonte: `Borsa${i}`, argomento: 'economia', quando: fa(1) })),
    finta({ id: 't1', fonte: 'Tech', argomento: 'tecnologia', quando: fa(20) }),
    finta({ id: 'm1', fonte: 'Mondo', argomento: 'mondo', quando: fa(20) })
  ]
  const scelte = sceltaAMano(candidate, '', ora)
  const argomenti = new Set(scelte.map(s => candidate[s.n - 1].argomento))

  assert.ok(scelte.length > 0, 'non ha scelto niente')
  assert.equal(argomenti.size, 3, 'una rassegna di soli titoli di borsa non è una prima pagina')
})

test('quello che ti interessa passa davanti, anche se è di ieri', () => {
  const candidate = [
    finta({ id: 'fresca', titolo: 'Notizia freschissima di calcio', quando: fa(1) }),
    finta({ id: 'mia', titolo: 'Nuovo modello di intelligenza artificiale', quando: fa(30) })
  ]
  const scelte = sceltaAMano(candidate, 'intelligenza artificiale, startup', ora)
  assert.equal(candidate[scelte[0].n - 1].id, 'mia')
})

test('i numeri scelti stanno dentro l’elenco: uno fuori aprirebbe la notizia sbagliata', () => {
  const candidate = Array.from({ length: 4 }, (_, i) => finta({ id: `n${i}`, fonte: `F${i}` }))
  for (const s of sceltaAMano(candidate, '', ora)) {
    assert.ok(s.n >= 1 && s.n <= candidate.length, `${s.n} non è una notizia di questo elenco`)
  }
})

test('nessuna notizia scelta due volte', () => {
  const candidate = Array.from({ length: 20 }, (_, i) =>
    finta({ id: `n${i}`, fonte: `F${i % 4}`, argomento: (['mondo', 'tecnologia', 'economia', 'italia'] as const)[i % 4] }))
  const scelte = sceltaAMano(candidate, '', ora)
  assert.equal(new Set(scelte.map(s => s.n)).size, scelte.length)
})

test('con pochissime notizie non gira a vuoto', () => {
  const scelte = sceltaAMano([finta({ id: 'sola' })], '', ora)
  assert.equal(scelte.length, 1)
})

test('quello che hai già letto ieri non torna raccontato da un altro giornale', () => {
  const gia = [{ id: 'vecchia', parole: impronta('Il grano vola dopo la chiusura dello stretto') }]
  const fuori = cernita([
    finta({ id: 'nuova', titolo: 'Il grano vola: chiusura dello stretto, dice Ankara', fonte: 'ANSA' }),
    finta({ id: 'altra', titolo: 'Sciopero dei treni annunciato per lunedì mattina', fonte: 'BBC' })
  ], ora, gia)
  assert.deepEqual(fuori.map(n => n.id), ['altra'])
})

test('lo stesso identico articolo ripassa: si aggiorna, e si tiene il segno di letto', () => {
  // è la differenza fra «l’ho già visto» e «me lo stanno ridicendo»: l’articolo
  // con lo stesso indirizzo deve poter rientrare, altrimenti una notizia che
  // resta in prima pagina due giorni sparisce dalla rassegna il secondo
  const gia = [{ id: 'x', parole: impronta('Il grano vola dopo la chiusura dello stretto') }]
  const fuori = cernita([finta({ id: 'x', titolo: 'Il grano vola dopo la chiusura dello stretto' })], ora, gia)
  assert.deepEqual(fuori.map(n => n.id), ['x'])
})

test('con giornali a sufficienza se ne prende uno per uno', () => {
  const candidate = TITOLI.map((titolo, i) => finta({
    id: `n${i}`, titolo, fonte: `Giornale${i}`,
    argomento: (['mondo', 'tecnologia', 'economia', 'italia'] as const)[i % 4]
  }))
  const fonti = sceltaAMano(candidate, '', ora).map(s => candidate[s.n - 1].fonte)
  assert.equal(new Set(fonti).size, fonti.length, `due volte lo stesso giornale: ${fonti.join(', ')}`)
})

test('con pochi giornali si allarga a due invece di uscire corta', () => {
  const candidate = TITOLI.map((titolo, i) => finta({
    id: `n${i}`, titolo, fonte: `Giornale${i % 3}`,
    argomento: (['mondo', 'tecnologia', 'economia'] as const)[i % 3]
  }))
  assert.equal(sceltaAMano(candidate, '', ora).length, 6, 'tre giornali per due: sei notizie')
})

test('la scheda di indirizzi che manda Hacker News non è un riassunto', () => {
  // è quello che arriva davvero: due URL, i punti, i commenti. Sulla carta
  // finiva così com'è — e un indirizzo senza spazi usciva pure dai bordi.
  const scheda = 'Article URL: https://jobs.ashbyhq.com/workweave Comments URL: ' +
    'https://news.ycombinator.com/item?id=40512805 Points: 0 # Comments: 0'
  assert.equal(sensato(scheda), '', 'una carta con dentro un URL è rumore, non una notizia')
})

test('la prosa vera sopravvive, e perde solo il link in coda', () => {
  const buono = 'Cody Wilson, the creator of the first 3D-printed gun, announced a tool. https://x.com/a'
  assert.equal(sensato(buono), 'Cody Wilson, the creator of the first 3D-printed gun, announced a tool.')
})

test('un riassunto che è per lo più indirizzi si butta', () => {
  assert.equal(sensato('Vedi https://esempio.it/una/pagina/molto/lunga e https://altro.it/pure'), '')
})

test('due parole non sono un riassunto', () => {
  assert.equal(sensato('Leggi qui'), '')
})

const focus = contestoDi([{ nome: 'Myynd', doveSei: 'Release Electron macOS' }], [], '', 'politica estera')
const notizia = (n: Grezza): Notizia => ({ ...n, perche: 'Un commento generato non verificato.', presa: fa(1), letta: null, scartata: null, importante: false, interesse: null })

test('prima il lavoro, poi quello che ha chiesto di seguire, e l’IA di frontiera c’è sempre', () => {
  // «Di cosa ti tengo aggiornato» è la domanda a cui risponde la rassegna:
  // quello che ha scritto lì conta anche quando ha dei progetti
  assert.deepEqual(focus.map(f => f.nome), ['Myynd', 'Interessi', SEMPRE.nome])
  assert.ok(rilevanza(finta({ id: 'app', titolo: 'Electron fixes macOS sandbox security' }), focus) > 0)
  assert.ok(rilevanza(finta({ id: 'world', titolo: 'La politica estera cambia dopo il vertice' }), focus) > 0)
  assert.ok(rilevanza(finta({ id: 'lab', titolo: 'OpenAI releases GPT-6 to developers' }), focus) > 0)
  assert.equal(rilevanza(finta({ id: 'forno', titolo: 'Local bakery wins regional award' }), focus), 0)
  // senza niente di scritto resta l'IA, non il vuoto
  assert.deepEqual(contestoDi([], [], '', '').map(f => f.nome), [SEMPRE.nome])
})

test('un laboratorio che rilascia qualcosa è importante anche senza modello', () => {
  assert.ok(pareUnRilascio({ fonte: 'Anthropic', titolo: 'Introducing Claude Opus 5' }))
  assert.ok(pareUnRilascio({ fonte: 'The Verge', titolo: 'OpenAI launches GPT-6 with a cheaper API' }))
  assert.ok(pareUnRilascio({ fonte: 'Reuters', titolo: 'Google rolls out Gemini 4 to all users' }))
  assert.ok(!pareUnRilascio({ fonte: 'The Verge', titolo: 'OpenAI’s CEO talks about the future of work' }), 'un’intervista non è un rilascio')
  assert.ok(!pareUnRilascio({ fonte: 'TechCrunch', titolo: 'A startup launches an HR tool' }), 'un rilascio non di un laboratorio non conta')
})

test('un rilascio di un laboratorio entra sempre: la regola stretta, che non scambia una startup per OpenAI', () => {
  assert.ok(rilascioDiUnLaboratorio({ fonte: 'OpenAI', titolo: 'Introducing GPT-6 Sol and Luna' }))
  assert.ok(rilascioDiUnLaboratorio({ fonte: 'Reuters', titolo: 'Anthropic unveils Claude Opus 5.5' }))
  assert.ok(rilascioDiUnLaboratorio({ fonte: 'The New Stack', titolo: 'OpenAI releases GPT-6 Sol and Luna — and cuts token prices in half' }))
  assert.ok(rilascioDiUnLaboratorio({ fonte: 'The Verge', titolo: 'Google rolls out Gemini 4 to all users' }))
  assert.ok(!rilascioDiUnLaboratorio({ fonte: 'TechCrunch', titolo: 'A startup launches a ChatGPT plugin for lawyers' }))
  assert.ok(!rilascioDiUnLaboratorio({ fonte: 'The Guardian', titolo: 'British Columbia sues OpenAI and Sam Altman' }))
  // la regex con la «g» non deve ricordarsi dove era arrivata fra una chiamata e l'altra
  for (let i = 0; i < 3; i++) assert.ok(rilascioDiUnLaboratorio({ fonte: 'Wired', titolo: 'Anyone can now try GPT-6, released today' }))
})

test('fra due articoli sullo stesso fatto vale l’annuncio del laboratorio, poi il titolo che nomina il modello', () => {
  const ufficiale = { fonte: 'OpenAI', titolo: 'Introducing GPT-6 Sol and Luna' }
  const col_modello = { fonte: 'Mashable', titolo: 'Anthropic launches Claude Opus 5.5, promising Fable-level performance' }
  const vago = { fonte: 'ft.com', titolo: 'Anthropic releases cheaper AI model ahead of IPO' }
  const riassunto = { fonte: 'CNBC', titolo: 'Anthropic and OpenAI roll out cheaper models' }
  assert.ok(rappresenta(ufficiale) > rappresenta(riassunto))
  assert.ok(rappresenta(col_modello) > rappresenta(vago))
  assert.equal(rappresenta(vago), rappresenta(riassunto))
  // fra due post di OpenAI su GPT-6 vince l'annuncio, non il più recente
  assert.ok(rappresenta({ fonte: 'OpenAI', titolo: 'Introducing GPT-6 Sol and Luna' }) > rappresenta({ fonte: 'OpenAI', titolo: 'Better prompt caching for GPT-6' }))
  const lancio = finta({ id: 'lancio-gpt', fonte: 'OpenAI', titolo: 'Introducing GPT-6 Sol and Luna', quando: fa(3) })
  const cache = finta({ id: 'cache-gpt', fonte: 'OpenAI', titolo: 'Better prompt caching for GPT-6', quando: fa(1) })
  assert.deepEqual(cernita([cache, lancio], ora).map(n => n.id), ['lancio-gpt'])
  // il rilascio detto dal laboratorio vale più del posto in cui è arrivato
  assert.ok(rappresenta(col_modello) > rappresenta({ fonte: 'Amazon Web Services (AWS)', titolo: 'Claude Opus 5.5 is now available on AWS' }))
})

test('la regola gratis sulle parole tiene l’articolo migliore, non il più fresco', () => {
  const aws = finta({ id: 'aws', fonte: 'AWS', titolo: 'Claude Opus 5.5 is now available on AWS', quando: fa(1) })
  const lancio = finta({ id: 'lancio', fonte: 'Mashable', titolo: 'Anthropic launches Claude Opus 5.5 at a lower price', quando: fa(2) })
  assert.deepEqual(cernita([aws, lancio], ora).map(n => n.id), ['lancio'])
})

test('in tema: l’IA e la tecnologia passano, la cronaca solo se tocca il lavoro', () => {
  assert.ok(inTema(finta({ id: 'ia', argomento: 'ia', titolo: 'Anything from an AI desk' }), focus))
  assert.ok(inTema(finta({ id: 'mondo-ia', argomento: 'mondo', titolo: 'Anthropic signs a deal with the EU', riassunto: 'Claude will be offered to agencies.' }), focus))
  assert.ok(!inTema(finta({ id: 'guerra', argomento: 'mondo', titolo: 'Ceasefire talks resume in Geneva' }), focus))
  assert.ok(!inTema(finta({ id: 'borsa', argomento: 'economia', titolo: 'Oil prices slide as demand cools' }), focus))
})

test('le importanti stanno in cima, e dentro ognuna la più fresca prima', () => {
  const n = (id: string, importante: boolean, ore: number) => ({ id, importante, quando: fa(ore) })
  assert.deepEqual(ordina([n('a', false, 1), n('b', true, 20), n('c', false, 3), n('d', true, 2)]).map(x => x.id), ['d', 'b', 'a', 'c'])
})

test('il fallback non riempie una selezione corta con notizie generiche', () => {
  const tutte = [notizia(finta({ id: 'app', titolo: 'Electron fixes macOS sandbox security' })),
    ...TITOLI.map((titolo, i) => notizia(finta({ id: `g${i}`, titolo })))]
  assert.deepEqual(selezioneVisibile(tutte, focus, undefined, ora).map(n => n.id), ['app'])
  assert.deepEqual(selezioneVisibile(tutte, [], undefined, ora), [])
})

test('una parola generica condivisa non basta a rendere una notizia pertinente', () => {
  const f = contestoDi([], [{ testo: 'Review the project with the team', nota: null }], '', '')
  assert.equal(rilevanza(finta({ id: 'rumore', titolo: 'The world has a new project for today' }), f), 0)
})

test('new e only non fanno rientrare la cronaca mondiale dalla cache con un task sulla posta', () => {
  const f = contestoDi([], [{ testo: 'Inbox Priorities', nota: 'Find only the new actionable items in my inbox.' }], '', '')
  const irrilevante = notizia(finta({
    id: 'mappa-onu',
    titolo: "UN votes to adopt new world map to reflect Africa's true size",
    riassunto: 'The Togo-sponsored resolution was backed by 164 nations - the US the only nation to vote against it.'
  }))
  assert.equal(rilevanza(irrilevante, f), 0)
  assert.deepEqual(selezioneVisibile([irrilevante], f, undefined, ora), [])
})

test('le parole grammaticali italiane non sono interessi, i nomi tecnici rimangono validi', () => {
  const f = contestoDi([], [{ testo: 'Solo le nuove cose', nota: 'Tutto quello che posso fare quando sono pronto.' }], '', '')
  assert.equal(rilevanza(finta({ id: 'rumore-it', titolo: 'Sono tutti pronti: cosa possiamo fare', riassunto: 'Tutto quello che cambia quando arriva il momento.' }), f), 0)
  assert.ok(rilevanza(finta({ id: 'utile', titolo: 'Electron improves security on macOS' }), focus) > 0)
})

test('le risposte accumulate e le edizioni salvate rispettano entrambe il tetto', () => {
  const tutte = Array.from({ length: 20 }, (_, i) => notizia(finta({ id: `n${i}`, titolo: `Electron ${'x'.repeat(i + 4)} ${'z'.repeat(i + 4)} sicurezza` })))
  assert.equal(selezioneVisibile(tutte, focus, undefined, ora).length, QUANTE)
  assert.equal(selezioneVisibile(tutte, focus, tutte.map(n => n.id), ora).length, QUANTE)
})

test('le notizie lette non consumano posti prima del limite della selezione visibile', () => {
  const tutte = Array.from({ length: 16 }, (_, i) => ({
    ...notizia(finta({ id: `n${i}`, titolo: `Electron ${'x'.repeat(i + 4)} ${'z'.repeat(i + 4)} sicurezza` })),
    letta: i < 8 ? fa(1) : null
  }))
  const attese = tutte.slice(8).map(n => n.id)
  assert.deepEqual(selezioneVisibile(tutte, focus, undefined, ora).map(n => n.id), attese)
  assert.deepEqual(selezioneVisibile(tutte, focus, tutte.map(n => n.id), ora).map(n => n.id), attese)
})

test('l’edizione contiene solo gli ID scelti e preserva il riassunto della fonte giusta', () => {
  const tutte = [notizia(finta({ id: 'canada', titolo: 'Canada updates tariffs', riassunto: 'Tariffs change in Canada.' })),
    notizia(finta({ id: 'libano', titolo: 'Lebanon peace talks resume', riassunto: 'Peace talks resume in Lebanon.' }))]
  const scelte = ricuciScelte(tutte as Grezza[], [{ id: 'libano' }, { id: 1.5 }, { id: 'inesistente' }, { id: 'libano' }])
  assert.deepEqual(scelte, [{ n: 2, riga: '', importante: false }])
  // «importante» passa solo se è davvero vero: una stringa non è un sì
  assert.deepEqual(ricuciScelte(tutte as Grezza[], [{ id: 'canada', importante: true }, { id: 'libano', importante: 'true' }]).map(s => s.importante), [true, false])
  const visibili = selezioneVisibile(tutte, focus, scelte.map(s => tutte[s.n - 1].id), ora)
  assert.equal(visibili.length, 1)
  assert.equal(visibili[0].titolo, 'Lebanon peace talks resume')
  assert.equal(visibili[0].riassunto, 'Peace talks resume in Lebanon.')
  assert.equal(visibili[0].perche, null)
})

test('una scelta vuota del modello rimane vuota e non diventa un ripiego generale', () => {
  assert.deepEqual(ricuciScelte([finta({ id: 'x' })], []), [])
  assert.deepEqual(selezioneVisibile([notizia(finta({ id: 'x' }))], focus, [], ora), [])
})

test('gli articoli scaduti non rientrano quando tutte le fonti sono ferme', () => {
  const vecchia = finta({ id: 'vecchia', titolo: 'Electron improves macOS security', quando: fa(120) })
  assert.deepEqual(cernita([vecchia], ora), [])
  assert.deepEqual(selezioneVisibile([notizia(vecchia)], focus, ['vecchia'], ora), [])
})

test('una nota ufficiale per sviluppatori resta tre giorni, la cronaca due', () => {
  // era due settimane, ed è così che il 22 settembre la rassegna mostrava
  // ancora «Get ready with the latest beta releases» del 16
  const rilascio = finta({ id: 'rosetta', fonte: 'Apple Developer', titolo: 'Upcoming changes to Rosetta support for Intel-based macOS apps', quando: fa(60) })
  const cronaca = finta({ id: 'cronaca', fonte: 'BBC', titolo: 'Parliament reaches a trade agreement', quando: fa(60) })
  assert.deepEqual(cernita([rilascio, cronaca], ora).map(n => n.id), ['rosetta'])
  assert.deepEqual(selezioneVisibile([notizia(rilascio)], focus, undefined, ora).map(n => n.id), ['rosetta'])
  const scaduto = { ...rilascio, quando: fa(4 * 24) }
  assert.deepEqual(cernita([scaduto], ora), [])
  assert.deepEqual(selezioneVisibile([notizia(scaduto)], focus, [scaduto.id], ora), [])
})

// — quando si rifà —
//
// La regola non guarda l'orologio da sola: le si dice che ore sono. Qui il
// giorno «di oggi» si costruisce con `giornoIn`, lo stesso che usa il codice,
// così le prove valgono a Roma, a Tokyo e su un server in UTC senza cambiare
// una riga — e il giorno «nuovo» è un giorno che non esiste per nessuno.

const QUANDO = '2026-09-14T22:00:00.000Z'
const T = Date.parse(QUANDO)
const ORA = 3600_000
/** Lo stesso giorno di `QUANDO`, comunque sia messo l'orologio di chi prova. */
const stessoGiorno = (ora: number) => ({ giorno: giornoIn(new Date(T)), ora })
const giornoNuovo = (ora: number) => ({ giorno: '1999-01-01', ora })

test('dentro i venti minuti non si rifà, dopo sì', () => {
  assert.equal(MINUTI_GIRO, 20)
  const e = { controllata: QUANDO, ids: ['a', 'b'] }
  assert.equal(daRifare(e, T + 19 * 60_000, stessoGiorno(10)), false)
  assert.equal(daRifare(e, T + 20 * 60_000, stessoGiorno(10)), true)
  assert.equal(daRifare(e, T + ORA, stessoGiorno(10)), true)
})

test('il giorno nuovo la rifà dalle sei in poi, e prima di dormire no', () => {
  const e = { controllata: QUANDO, ids: ['a', 'b'] }
  // le cinque e mezza: è un altro giorno, ma non è ancora mattina per nessuno
  assert.equal(daRifare(e, T + 10 * 60_000, giornoNuovo(5)), false)
  // le sei e dieci: dieci minuti dall'ultimo controllo, e si rifà lo stesso
  assert.equal(daRifare(e, T + 10 * 60_000, giornoNuovo(6)), true)
})

test('vuota o piena, il giro è lo stesso: venti minuti', () => {
  // un'edizione vecchia con «riprovaMinuti: 60» scritto sopra non tiene ferma
  // la rassegna un'ora dopo l'aggiornamento
  const e = { controllata: QUANDO, ids: [], riprovaMinuti: 60 }
  assert.equal(daRifare(e, T + 10 * 60_000, stessoGiorno(10)), false)
  assert.equal(daRifare(e, T + 21 * 60_000, stessoGiorno(10)), true)
})

test('senza la data dell’ultimo controllo si rifà e basta', () => {
  assert.equal(daRifare({ ids: ['a'] }, T, stessoGiorno(10)), true)
})
