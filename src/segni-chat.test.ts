// La chat come Claude e ChatGPT (21 ott 2026): i segni dentro una riga, le
// tabelle e i link veri, «Copia», «Ferma» e lo scorrimento. Tutto senza la
// pagina: le regole stanno in funzioni pure.
//
//   node --test src/segni-chat.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pezzi, testoDaCopiare, urlSicuro } from './segni-chat.ts'
import { CHAT, IMPAGINATO, leggibile } from './leggibile.ts'
import { avvia, fermata, frammento, lontanoDalFondo, nessunaCorsa, restaInFondo, vista } from './chat-in-corso.ts'
import { rispostaFermata } from '../server/testo.ts'

test('un link Markdown diventa un link, con la sua parola', () => {
  assert.deepEqual(pezzi('leggi [le regole](https://developer.apple.com/app-store/review/) prima', true), [
    { tipo: 'testo', testo: 'leggi ' },
    { tipo: 'link', testo: 'le regole', url: 'https://developer.apple.com/app-store/review/' },
    { tipo: 'testo', testo: ' prima' }
  ])
})

test('un indirizzo nudo diventa link, senza la punteggiatura della frase', () => {
  const p = pezzi('Vedi https://example.com/a?b=1. Poi rispondi.', true)
  assert.deepEqual(p[1], { tipo: 'link', testo: 'https://example.com/a?b=1', url: 'https://example.com/a?b=1' })
  assert.deepEqual(p[2], { tipo: 'testo', testo: '. Poi rispondi.' })
})

test('javascript:, data: e indirizzi strani non diventano mai link', () => {
  for (const url of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'file:///etc/passwd', '//evil.example']) {
    assert.equal(urlSicuro(url), null, url)
    const p = pezzi(`[clicca](${url})`, true)
    assert.ok(p.every(x => x.tipo !== 'link'), url)
  }
  assert.equal(urlSicuro('https://ok.example/x'), 'https://ok.example/x')
  assert.equal(urlSicuro('mailto:nora@harbor.example'), 'mailto:nora@harbor.example')
})

test('l\'HTML scritto dal modello resta testo: nessun pezzo è HTML', () => {
  const p = pezzi('<script>alert(1)</script> e <img src=x onerror=alert(1)> e **<b>forte</b>**', true)
  const tipi = new Set<string>()
  const giro = (xs: typeof p) => { for (const x of xs) { tipi.add(x.tipo); if (x.tipo === 'grassetto' || x.tipo === 'corsivo') giro(x.dentro) } }
  giro(p)
  assert.deepEqual([...tipi].sort(), ['grassetto', 'testo'])
  assert.equal(p[0]!.tipo === 'testo' && p[0]!.testo.startsWith('<script>'), true)
  // e chi disegna non inietta mai HTML: niente dangerouslySetInnerHTML nella chat e nel compositore
  for (const f of ['./Testo.tsx', './screens/Chat.tsx']) {
    assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /dangerouslySetInnerHTML/, f)
  }
})

test('i link si aprono fuori: target _blank con noopener, e il guscio fa passare solo http, https e mailto', () => {
  const testo = readFileSync(new URL('./Testo.tsx', import.meta.url), 'utf8')
  assert.match(testo, /<a key=\{k\} href=\{p\.url\} target="_blank" rel="noopener noreferrer"/)
  const guscio = readFileSync(new URL('../desktop/finestra.ts', import.meta.url), 'utf8')
  assert.match(guscio, /setWindowOpenHandler\(\(\{ url \}\) => \{\s*apriFuoriSePuoi\(url\)\s*return \{ action: 'deny' \}/)
})

test('fuori dalla chat i link restano come erano: niente pezzi link', () => {
  assert.ok(pezzi('vedi https://example.com e [x](https://example.com)').every(x => x.tipo !== 'link'))
})

test('le citazioni restano numerini, anche attaccate, e un link non è una citazione', () => {
  const p = pezzi('prezzo[1][2] e [M] e [listino](https://x.example)', true)
  const segni = p.filter(x => x.tipo === 'segno')
  assert.deepEqual(segni, [
    { tipo: 'segno', n: 1, prima: false, dopo: true },
    { tipo: 'segno', n: 2, prima: true, dopo: false },
    { tipo: 'segno', n: 'M', prima: false, dopo: false }
  ])
  assert.ok(p.some(x => x.tipo === 'link'))
})

test('grassetto, corsivo e codice come prima', () => {
  assert.deepEqual(pezzi('**a** *b* `c`', true), [
    { tipo: 'grassetto', dentro: [{ tipo: 'testo', testo: 'a' }] },
    { tipo: 'testo', testo: ' ' },
    { tipo: 'corsivo', dentro: [{ tipo: 'testo', testo: 'b' }] },
    { tipo: 'testo', testo: ' ' },
    { tipo: 'codice', testo: 'c' }
  ])
  // un indirizzo dentro il codice resta codice
  assert.deepEqual(pezzi('`https://x.example`', true), [{ tipo: 'codice', testo: 'https://x.example' }])
})

test('in chat una tabella resta una tabella, con tante celle quante l\'intestazione', () => {
  const b = leggibile('Prima\n\n| Step | Owner | When |\n| --- | --- | --- |\n| Fix | Alex | Today |\n| Upload | Alex |\n\nDopo', CHAT)
  const t = b.find(x => x.tipo === 'tabella')
  assert.deepEqual(t?.celle, [['Step', 'Owner', 'When'], ['Fix', 'Alex', 'Today'], ['Upload', 'Alex', '']])
  assert.deepEqual(b.map(x => x.tipo), ['riga', 'vuota', 'tabella', 'vuota', 'riga'])
  // fuori dalla chat resta com'era: una riga col puntino
  assert.ok(leggibile('| a | b |\n| - | - |\n| 1 | 2 |', IMPAGINATO).every(x => x.tipo === 'riga'))
})

test('in chat il link resta scritto per Testo; il codice sa la sua lingua; il titolo il suo livello', () => {
  const b = leggibile('## Piano\n\nLeggi [qui](https://x.example).\n\n```bash\nls -la\n```', CHAT)
  assert.deepEqual(b[0], { tipo: 'titolo', testo: 'Piano', livello: 2 })
  assert.equal(b.find(x => x.tipo === 'riga')?.testo, 'Leggi [qui](https://x.example).')
  assert.deepEqual(b.find(x => x.tipo === 'codice'), { tipo: 'codice', testo: 'ls -la', lingua: 'bash' })
  // IMPAGINATO non cambia
  assert.equal(leggibile('Leggi [qui](https://x.example).', IMPAGINATO)[0]!.testo, 'Leggi qui (https://x.example).')
})

test('«Copia» copia il testo senza i numerini delle citazioni', () => {
  assert.equal(testoDaCopiare('Nora vuole giovedì [1]. Hai risposto[2][M].\n'), 'Nora vuole giovedì. Hai risposto.')
  // un link Markdown non perde la sua parentesi quadra
  assert.equal(testoDaCopiare('[1](https://x.example)'), '[1](https://x.example)')
})

test('lo streaming si ricompone: i pezzi si sommano nella risposta viva', () => {
  let c = avvia(nessunaCorsa, 'A', { id: 'tmp1', role: 'u', text: 'domanda' })
  for (const d of ['Nora ', 'vuole ', 'giovedì.']) c = frammento(c, 'A', d)
  assert.deepEqual(vista([], c.get('A')).map(m => m.text), ['domanda', 'Nora vuole giovedì.'])
})

test('«Ferma» tiene la domanda e quello che era già arrivato', () => {
  const dom = { id: 'tmp1', role: 'u', text: 'domanda' }
  assert.deepEqual(fermata([], dom, 'mezza risp').map(m => [m.role, m.text]), [['u', 'domanda'], ['a', 'mezza risp']])
  // fermata prima della prima parola: resta la domanda sola
  assert.deepEqual(fermata([], dom, '  ').map(m => [m.role, m.text]), [['u', 'domanda']])
  // la domanda già salvata non si raddoppia
  const salvati = [{ id: 'u1', role: 'u', text: 'domanda' }]
  assert.deepEqual(fermata(salvati, dom, 'x').map(m => m.text), ['domanda', 'x'])
})

test('il server salva la risposta fermata senza lineette e col codice chiuso', () => {
  assert.equal(rispostaFermata('Ecco il piano — in breve.  \n'), rispostaFermata('Ecco il piano — in breve.'))
  assert.doesNotMatch(rispostaFermata('Ecco il piano — in breve.'), /—/)
  assert.equal(rispostaFermata('Prova:\n```bash\nls -la'), 'Prova:\n```bash\nls -la\n```')
  assert.equal(rispostaFermata('```\na\n```\nfine'), '```\na\n```\nfine')
})

test('la colonna segue la risposta solo se lui è in fondo; la freccia solo se sotto c\'è davvero qualcosa', () => {
  // alta 2000, vista 600: in fondo con sopra a 1400, o quasi
  assert.equal(restaInFondo(2000, 1400, 600), true)
  assert.equal(restaInFondo(2000, 1360, 600), true)
  assert.equal(restaInFondo(2000, 1200, 600), false)
  assert.equal(lontanoDalFondo(2000, 1300, 600), false)
  assert.equal(lontanoDalFondo(2000, 0, 600), true)
})
