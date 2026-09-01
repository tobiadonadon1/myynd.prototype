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
  cernita, entita, impronta, leggiFeed, pulisciLink, ripulisci, sceltaAMano, sensato, simili, type Grezza
} from './rassegna.ts'

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

test('il link «self» del feed non diventa il link della notizia', () => {
  const [n] = leggiFeed(`<feed><entry>
    <title>Una cosa</title>
    <link rel="self" type="application/atom+xml" href="https://esempio.it/feed.xml" />
    <link rel="alternate" type="text/html" href="https://esempio.it/articolo" />
  </entry></feed>`, FONTE)
  assert.equal(n.link, 'https://esempio.it/articolo')
})

test('una voce senza link non entra: sarebbe un titolo che non si apre', () => {
  const fuori = leggiFeed(`<rss><channel>
    <item><title>Senza indirizzo</title></item>
    <item><title>Con indirizzo</title><link>https://esempio.it/a</link></item>
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

  const stesso = (u: string) => leggiFeed(`<rss><item><title>T</title><link>${u}</link></item></rss>`, FONTE)[0].id
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

test('se nelle ultime ore non c’è niente si guarda più indietro, invece di uscire vuoti', () => {
  const vecchie = TITOLI.slice(0, 5).map((titolo, i) => finta({ id: `v${i}`, titolo, quando: fa(60) }))
  assert.equal(cernita(vecchie, ora).length, 5)
})

test('la stessa notizia da due giornali entra una volta sola', () => {
  const fuori = cernita([
    finta({ id: 'a', titolo: 'Il prezzo del grano vola per la guerra', fonte: 'BBC' }),
    finta({ id: 'b', titolo: 'Il prezzo del grano vola: ecco perché', fonte: 'ANSA' })
  ], ora)
  assert.equal(fuori.length, 1, 'lo stesso fatto compare due volte nella rassegna')
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
