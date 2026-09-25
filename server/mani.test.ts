// Le mani, senza toccare niente di vero.
//
// Quello che si prova qui è il recinto: dove una mano può arrivare e dove no.
// Un file fuori casa, un indirizzo di casa, una nota che porterebbe Note
// davanti, un file scritto fuori dalla cartella Myynd. La rete, il
// risolutore dei nomi, osascript e Claude Code sono finti: una prova che apre
// Note sul suo Mac non è una prova.
//
//   node --test server/mani.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const radice = mkdtempSync(join(tmpdir(), 'myynd-mani-'))
process.env.MYYND_DATI = join(radice, 'profilo')
const mani = await import('./mani.ts')
const cfg = await import('./config.ts')
type Attrezzo = import('./mani.ts').Attrezzo
type Fatto = import('./mani.ts').Fatto

const casa = join(radice, 'casa')
const fuori = join(radice, 'fuori')
const progetto = join(radice, 'progetto')
const scrivania = join(casa, 'Desktop')
const copie = join(radice, 'profilo', 'project-work')
for (const d of [casa, fuori, progetto, scrivania, join(casa, '.ssh'), join(casa, 'Library', 'Mail'), copie]) mkdirSync(d, { recursive: true })
writeFileSync(join(casa, 'appunti.md'), '# Appunti\n\nIl pilota parte a ottobre.\n')
writeFileSync(join(casa, 'config.ts'), 'export const porta = 5189\n')
writeFileSync(join(casa, 'pagina.html'), '<html><head><title>Pilota</title><script>x()</script></head><body><p>Quattro settimane.</p></body></html>')
writeFileSync(join(casa, 'binario.dat'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13]))
writeFileSync(join(casa, '.env'), 'SEGRETO=1\n')
writeFileSync(join(casa, '.ssh', 'id_rsa'), 'chiave\n')
writeFileSync(join(casa, 'Library', 'Mail', 'posta.emlx'), 'posta\n')
writeFileSync(join(casa, 'lungo.txt'), 'a'.repeat(70_000))
writeFileSync(join(fuori, 'segreto.txt'), 'fuori casa\n')
symlinkSync(join(fuori, 'segreto.txt'), join(casa, 'link.txt'))
writeFileSync(join(progetto, 'README.md'), '# Progetto\n')

const finto = (f: Parameters<typeof mani.perProva>[0]) => mani.perProva({
  casa: () => casa, scrivania: () => scrivania, copie: () => copie, piattaforma: () => 'darwin', ospitato: () => false,
  scaricati: () => join(casa, 'Downloads'), documenti: () => join(casa, 'Documents'), apri: async () => {},
  risolvi: async () => [{ address: '93.184.216.34' }],
  // la posa finta: la vera scrive sul disco, e una prova non posa niente
  // dentro un progetto di nessuno
  posa: async r => ({ backup: `${r.reportFile}/before`, applied: r.changedFiles, skipped: [] }),
  ...f
})

beforeEach(() => { cfg.scrivi({ lingua: 'en' }); finto({}) })
after(() => { mani.perProva(null); rmSync(radice, { recursive: true, force: true }) })

// — leggere un file —

test('leggi_file legge testo, codice e pagine dentro casa e la cartella del compito, e taglia al tetto', async () => {
  assert.match((await mani.leggiFile('~/appunti.md')).testo, /Il pilota parte a ottobre/)
  assert.match((await mani.leggiFile(join(casa, 'config.ts'))).testo, /porta = 5189/)
  const html = await mani.leggiFile(join(casa, 'pagina.html'))
  assert.match(html.testo, /^Pilota\n\nQuattro settimane\./)
  assert.doesNotMatch(html.testo, /x\(\)/)
  // relativo alla cartella del compito
  assert.match((await mani.leggiFile('README.md', progetto)).testo, /# Progetto/)
  const lungo = await mani.leggiFile(join(casa, 'lungo.txt'))
  assert.ok(lungo.testo.length < 70_000)
  assert.match(lungo.testo, /\[tagliato a 60000 caratteri su 70000\]$/)
})

test('leggi_file non esce dal recinto: fuori casa, dietro un link, i segreti, la Libreria, i binari, le cartelle', async () => {
  await assert.rejects(() => mani.leggiFile(join(fuori, 'segreto.txt')), /solo dentro la tua cartella personale/)
  await assert.rejects(() => mani.leggiFile(join(casa, 'link.txt')), /solo dentro la tua cartella personale/)
  await assert.rejects(() => mani.leggiFile('~/.env'), /riservato/)
  await assert.rejects(() => mani.leggiFile('~/.ssh/id_rsa'), /riservato/)
  await assert.rejects(() => mani.leggiFile('~/Library/Mail/posta.emlx'), /riservato/)
  await assert.rejects(() => mani.leggiFile(join(casa, 'binario.dat')), /non è testo/)
  await assert.rejects(() => mani.leggiFile(casa), /è una cartella/)
  await assert.rejects(() => mani.leggiFile('~/non-esiste.md'), /Non esiste nessun file/)
  await assert.rejects(() => mani.leggiFile(''), /Manca il percorso/)
  // la memoria di Myynd stessa, anche se sta sotto casa
  finto({ casa: () => radice })
  mkdirSync(join(radice, 'profilo'), { recursive: true })
  writeFileSync(join(radice, 'profilo', 'config.json'), '{}')
  await assert.rejects(() => mani.leggiFile(join(radice, 'profilo', 'config.json')), /riservato/)
  // su un server non c'è un disco
  finto({ ospitato: () => true })
  await assert.rejects(() => mani.leggiFile('~/appunti.md'), /Su un server/)
})

// — leggere una pagina —

const risposta = (corpo: string | Buffer, init: ResponseInit & { tipo?: string } = {}) =>
  new Response(corpo, { status: init.status ?? 200, headers: { 'content-type': init.tipo ?? 'text/html; charset=utf-8', ...(init.headers ?? {}) } })

test('leggi_pagina legge una pagina pubblica come testo, con il titolo davanti e il lettore dei file html', async () => {
  const chiamate: string[] = []
  finto({ rete: (async (url: string | URL | Request, init?: RequestInit) => {
    chiamate.push(String(url))
    assert.equal(init?.redirect, 'manual')
    assert.match(String((init?.headers as Record<string, string>)['user-agent']), /^Myynd\//)
    return risposta('<html><head><title>Example Domain</title><style>p{}</style></head><body><h1>Example Domain</h1><p>This domain is for use in illustrative examples.</p><script>track()</script></body></html>')
  }) as typeof fetch })
  const p = await mani.leggiPagina('https://example.com/')
  assert.equal(p.url, 'https://example.com/')
  assert.match(p.testo, /^Example Domain\n\nExample Domain\nThis domain is for use in illustrative examples\./)
  assert.doesNotMatch(p.testo, /track\(\)|p\{\}/)
  assert.deepEqual(chiamate, ['https://example.com/'])
})

test('leggi_pagina rifiuta casa e la rete locale prima di chiamare, anche dietro il DNS o una redirezione', async () => {
  let chiamate = 0
  finto({ rete: (async () => { chiamate++; return risposta('<p>x</p>') }) as typeof fetch })
  for (const u of ['http://localhost:5189/', 'http://127.0.0.1/', 'http://10.1.2.3/x', 'http://192.168.1.1/', 'http://172.20.0.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://server.local/', 'http://0.0.0.0/']) {
    await assert.rejects(() => mani.leggiPagina(u), /di casa o della rete locale/, u)
  }
  await assert.rejects(() => mani.leggiPagina('ftp://example.com/'), /solo indirizzi http o https/)
  await assert.rejects(() => mani.leggiPagina('file:///etc/hosts'), /solo indirizzi http o https/)
  await assert.rejects(() => mani.leggiPagina('https://user:pw@example.com/'), /credenziali/)
  await assert.rejects(() => mani.leggiPagina('non è un indirizzo'), /non è un indirizzo web valido/)
  assert.equal(chiamate, 0, 'non doveva chiamare nessuno')

  // il nome è pubblico ma risolve a casa: è casa
  finto({ rete: (async () => { chiamate++; return risposta('<p>x</p>') }) as typeof fetch, risolvi: async () => [{ address: '127.0.0.1' }] })
  await assert.rejects(() => mani.leggiPagina('https://evil.example/'), /di casa o della rete locale/)
  assert.equal(chiamate, 0)

  // una pagina pubblica che rimanda a casa: la redirezione passa dallo stesso controllo
  finto({ rete: (async () => { chiamate++; return risposta('', { status: 302, headers: { location: 'http://127.0.0.1:5189/api' } }) }) as typeof fetch })
  await assert.rejects(() => mani.leggiPagina('https://example.com/vai'), /di casa o della rete locale/)
  assert.equal(chiamate, 1)
})

test('leggi_pagina segue tre redirezioni pubbliche, si ferma alla quarta, taglia a duecento kilobyte e dice i guai', async () => {
  let n = 0
  finto({ rete: (async (url: string | URL | Request) => {
    n++
    const u = String(url)
    if (u.endsWith('/1')) return risposta('', { status: 301, headers: { location: '/2' } })
    if (u.endsWith('/2')) return risposta('<p>Arrivati.</p>')
    if (u.startsWith('https://loop.example/')) return risposta('', { status: 302, headers: { location: `https://loop.example/${n}` } })
    if (u.endsWith('/grande')) return risposta('<p>' + 'parola '.repeat(60_000) + '</p>')
    if (u.endsWith('/pdf')) return risposta(Buffer.from('%PDF-1.4 finto'), { tipo: 'application/octet-stream' })
    if (u.endsWith('/404')) return risposta('<p>no</p>', { status: 404 })
    if (u.endsWith('/testo')) return risposta('Solo testo.\n\n\n\nAltro.', { tipo: 'text/plain' })
    return risposta('<p>x</p>')
  }) as typeof fetch })
  assert.match((await mani.leggiPagina('https://example.com/1')).testo, /Arrivati/)
  await assert.rejects(() => mani.leggiPagina('https://loop.example/0'), /troppe volte/)
  const grande = await mani.leggiPagina('https://example.com/grande')
  assert.ok(grande.testo.length <= mani.TETTO_TESTO_PAGINA + 60)
  assert.match(grande.testo, /\[tagliato a 30000 caratteri\]$/)
  await assert.rejects(() => mani.leggiPagina('https://example.com/pdf'), /non è testo/)
  await assert.rejects(() => mani.leggiPagina('https://example.com/404'), /HTTP 404/)
  assert.equal((await mani.leggiPagina('https://example.com/testo')).testo, 'Solo testo.\n\nAltro.')
  finto({ rete: (async () => { throw new Error('timeout') }) as typeof fetch })
  await assert.rejects(() => mani.leggiPagina('https://example.com/lento'), /entro quindici secondi/)
})

// — cercare sul web —

const paginaDDG = `<html><body>
<div class="result results_links results_links_deep result--ad"><a rel="nofollow" class="result__a" href="https://duckduckgo.com/y.js?ad_provider=x">Pubblicità</a><a class="result__snippet" href="https://duckduckgo.com/y.js?ad_provider=x">compra</a></div>
<div class="result results_links results_links_deep web-result "><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.h%2Dfarm.com%2Fen&amp;rut=4818">H-FARM | Innovation, Education, Startups</a></h2><a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.h%2Dfarm.com%2Fen&amp;rut=4818"><b>H-FARM</b> is a venture builder &amp; spreads the culture of digital innovation.</a></div>
<div class="result results_links results_links_deep web-result "><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fschools.h%2Dfarm.com%2Fen%2F&amp;rut=77c2">H-FARM International School</a></h2><a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fschools.h%2Dfarm.com%2Fen%2F&amp;rut=77c2">Venezia, Ros&#xE0; e Vicenza.</a></div>
<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=http%3A%2F%2F127.0.0.1%2F&amp;rut=1">Casa</a></div>
</body></html>`

test('cerca_web legge titoli, indirizzi veri e due righe dalla pagina HTML di DuckDuckGo, senza le pubblicità né gli indirizzi di casa', async () => {
  const r = mani.risultatiDaDDG(paginaDDG)
  assert.deepEqual(r, [
    { titolo: 'H-FARM | Innovation, Education, Startups', url: 'https://www.h-farm.com/en', riassunto: 'H-FARM is a venture builder & spreads the culture of digital innovation.' },
    { titolo: 'H-FARM International School', url: 'https://schools.h-farm.com/en/', riassunto: 'Venezia, Rosà e Vicenza.' }
  ])
  let url = ''
  finto({ rete: (async (u: string | URL | Request) => { url = String(u); return risposta(paginaDDG) }) as typeof fetch })
  const trovati = await mani.cercaWeb('H-Farm Treviso')
  assert.equal(url, 'https://html.duckduckgo.com/html/?q=H-Farm%20Treviso')
  assert.equal(trovati.length, 2)
  const e = await mani.esegui('cerca_web', { query: 'H-Farm Treviso' })
  assert.match(e.testo, /^1\. H-FARM \| Innovation, Education, Startups\n   https:\/\/www\.h-farm\.com\/en\n   H-FARM is a venture builder/)
  assert.deepEqual(e.fatto, { attrezzo: 'cerca_web', esito: 'ok', dettaglio: 'H-Farm Treviso (2 risultati)', testo: e.testo })
  // quello che ha letto va a chi rilegge, come fonte a parte
  assert.match(mani.lettureInEstratto([e.fatto, { attrezzo: 'crea_nota', esito: 'ok', dettaglio: 'x' }, { attrezzo: 'leggi_pagina', esito: 'ok', dettaglio: 'https://www.h-farm.com/en', testo: 'H-FARM is a venture builder.' }]),
    /^\[L1\] cerca_web · H-Farm Treviso \(2 risultati\)\n1\. H-FARM[\s\S]*\n\n\[L2\] leggi_pagina · https:\/\/www\.h-farm\.com\/en\nH-FARM is a venture builder\.$/)
  assert.equal(mani.lettureInEstratto([{ attrezzo: 'crea_nota', esito: 'ok', dettaglio: 'x' }]), '')
})

test('cerca_web dice quando è bloccata o non trova niente, invece di inventare', async () => {
  finto({ rete: (async () => risposta('<html><body><div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div></body></html>', { status: 202 })) as typeof fetch })
  await assert.rejects(() => mani.cercaWeb('x'), /bloccata in questo momento.*leggi_pagina/)
  finto({ rete: (async () => risposta('<html><body><div class="no-results">No results.</div></body></html>')) as typeof fetch })
  await assert.rejects(() => mani.cercaWeb('zxqv'), /non ha trovato niente/)
  await assert.rejects(() => mani.cercaWeb('  '), /Manca cosa cercare/)
  const e = await mani.esegui('cerca_web', { query: 'zxqv' })
  assert.equal(e.male, true)
  assert.deepEqual(e.fatto, { attrezzo: 'cerca_web', esito: 'errore', dettaglio: 'zxqv' })
})

// — una nota in Note —

test('crea_nota passa titolo, corpo e cartella come argomenti a uno script fisso senza activate, e torna il nome', async () => {
  let argomenti: string[] = []
  finto({ osascript: async a => { argomenti = a; return 'Chiamata con Bianchi\nNotes\n' } })
  const r = await mani.creaNota({ titolo: 'Chiamata con Bianchi', testo: 'Prezzo: 980 <euro> & consegna\n\nGiovedì.', cartella: 'Lavoro' })
  assert.deepEqual(r, { nome: 'Chiamata con Bianchi', cartella: 'Notes' })
  assert.equal(argomenti[0], '-e')
  assert.equal(argomenti[1], mani.SCRIPT_NOTA)
  assert.doesNotMatch(mani.SCRIPT_NOTA, /activate/)
  assert.match(mani.SCRIPT_NOTA, /make new note at folder nomeCartella with properties \{name:titolo, body:corpo\}/)
  assert.equal(argomenti[2], '--')
  assert.deepEqual(argomenti.slice(3), ['Chiamata con Bianchi', '<div><h1>Chiamata con Bianchi</h1></div><div>Prezzo: 980 &lt;euro&gt; &amp; consegna</div><div><br></div><div>Giovedì.</div>', 'Lavoro'])

  const e = await mani.esegui('crea_nota', { titolo: 'Chiamata con Bianchi', testo: 'x' })
  assert.equal(e.testo, 'Nota creata in Note: «Chiamata con Bianchi» nella cartella «Notes».')
  assert.deepEqual(e.fatto, { attrezzo: 'crea_nota', esito: 'ok', dettaglio: 'Chiamata con Bianchi' })
  assert.equal(argomenti[5], '', 'senza cartella l\'argomento è vuoto, e lo script usa quella predefinita')
})

test('crea_nota rifiuta titoli e testi fuori misura, un server e un computer che non è un Mac, senza chiamare osascript', async () => {
  let chiamate = 0
  finto({ osascript: async () => { chiamate++; return 'x\ny' } })
  await assert.rejects(() => mani.creaNota({ titolo: '', testo: 'x' }), /Serve un titolo/)
  await assert.rejects(() => mani.creaNota({ titolo: 'a\nb', testo: 'x' }), /Serve un titolo/)
  await assert.rejects(() => mani.creaNota({ titolo: 'a', testo: '   ' }), /Serve il testo/)
  await assert.rejects(() => mani.creaNota({ titolo: 'a', testo: 'x'.repeat(20_001) }), /Serve il testo/)
  finto({ osascript: async () => { chiamate++; return 'x\ny' }, piattaforma: () => 'linux' })
  await assert.rejects(() => mani.creaNota({ titolo: 'a', testo: 'x' }), /solo da Myynd sul Mac/)
  finto({ osascript: async () => { chiamate++; return 'x\ny' }, ospitato: () => true })
  await assert.rejects(() => mani.creaNota({ titolo: 'a', testo: 'x' }), /solo da Myynd sul Mac/)
  assert.equal(chiamate, 0)
  finto({ osascript: async () => { throw new Error('Permetti a Myynd di controllare Note in Impostazioni di Sistema, Privacy e sicurezza, Automazione, poi riprova.') } })
  const e = await mani.esegui('crea_nota', { titolo: 'a', testo: 'x' })
  assert.equal(e.male, true)
  assert.match(e.testo, /Permetti a Myynd/)
  assert.equal(e.fatto.esito, 'errore')
})

// — scrivere un file —

test('scrivi_file scrive solo nella cartella Myynd sulla Scrivania, non sovrascrive e numera', async () => {
  const p = mani.scriviFile({ percorso: 'pilota.md', testo: '# Pilota\n' }, null, 'myynd')
  assert.equal(p, join(realpathSync(scrivania), 'Myynd', 'pilota.md'))
  assert.equal(readFileSync(p, 'utf8'), '# Pilota\n')
  assert.equal(mani.scriviFile({ percorso: 'pilota.md', testo: 'due' }, null, 'myynd'), join(realpathSync(scrivania), 'Myynd', 'pilota-2.md'))
  assert.equal(mani.scriviFile({ percorso: '~/Desktop/Myynd/pilota.md', testo: 'tre' }), join(realpathSync(scrivania), 'Myynd', 'pilota-3.md'))
  assert.equal(readFileSync(join(scrivania, 'Myynd', 'pilota.md'), 'utf8'), '# Pilota\n', 'il primo file non è stato toccato')
  assert.equal(mani.scriviFile({ percorso: 'h-farm/piano.csv', testo: 'a,b\n' }, null, 'myynd'), join(realpathSync(scrivania), 'Myynd', 'h-farm', 'piano.csv'))
  // il predefinito, dal 21 settembre sera, è la Scrivania nuda: «save it to my Desktop» è la sua opzione
  assert.equal(mani.scriviFile({ percorso: 'sul-tavolo.md', testo: 'x' }), join(realpathSync(scrivania), 'sul-tavolo.md'))
  const e = await mani.esegui('scrivi_file', { percorso: 'note.txt', testo: 'x' }, { luogo: 'myynd' })
  assert.equal(e.testo, `File scritto: ${join(realpathSync(scrivania), 'Myynd', 'note.txt')}`)
  assert.deepEqual(e.fatto, { attrezzo: 'scrivi_file', esito: 'ok', dettaglio: join(realpathSync(scrivania), 'Myynd', 'note.txt') })
})

test('scrivi_file non esce dal recinto: fuori dalla cartella Myynd, sopra la Scrivania, formati che non sono testo, un server', async () => {
  assert.throws(() => mani.scriviFile({ percorso: '../fuori.md', testo: 'x' }), /solo nella cartella Myynd/)
  assert.throws(() => mani.scriviFile({ percorso: join(scrivania, 'sopra.md'), testo: 'x' }, null, 'myynd'), /solo nella cartella Myynd/)
  assert.throws(() => mani.scriviFile({ percorso: '/etc/x.md', testo: 'x' }), /solo nella cartella Myynd/)
  assert.throws(() => mani.scriviFile({ percorso: join(casa, 'appunti.md'), testo: 'x' }), /solo nella cartella Myynd/)
  assert.throws(() => mani.scriviFile({ percorso: 'doc.pages', testo: 'x' }), /solo file di testo/)
  assert.throws(() => mani.scriviFile({ percorso: 'app.sh', testo: 'x' }), /solo file di testo/)
  assert.throws(() => mani.scriviFile({ percorso: 'vuoto.md', testo: '  ' }), /Serve il testo/)
  assert.throws(() => mani.scriviFile({ percorso: '', testo: 'x' }), /Manca il percorso/)
  assert.ok(!existsSync(join(scrivania, 'sopra.md')))
  finto({ ospitato: () => true })
  assert.throws(() => mani.scriviFile({ percorso: 'x.md', testo: 'x' }), /Su un server/)
})

test('scrivi_file scrive e sovrascrive nella copia di lavoro di un progetto, ma non fuori dal suo «project»', () => {
  const copia = join(copie, 'everwave-ab12', 'project')
  mkdirSync(join(copia, 'src'), { recursive: true })
  const p = mani.scriviFile({ percorso: join(copia, 'src', 'a.ts'), testo: 'export const a = 1\n' })
  assert.equal(p, join(realpathSync(copia), 'src', 'a.ts'))
  assert.equal(mani.scriviFile({ percorso: join(copia, 'src', 'a.ts'), testo: 'export const a = 2\n' }), p, 'nella copia si sovrascrive')
  assert.equal(readFileSync(p, 'utf8'), 'export const a = 2\n')
  assert.throws(() => mani.scriviFile({ percorso: join(copie, 'everwave-ab12', 'report.json'), testo: '{}' }), /solo nella cartella Myynd/)
  assert.throws(() => mani.scriviFile({ percorso: join(copie, 'x.md'), testo: 'x' }), /solo nella cartella Myynd/)
})

// — lavorare nel codice —

test('lavora_nel_codice fa il passo che cambia i file in una copia e lo dice; senza le opzioni del recinto ripiega sul piano; senza Claude Code lo dice', async () => {
  const richieste: { passo: string; cartella: string; richiesta: string }[] = []
  finto({
    installato: () => '/x/claude', runtime: async () => ({ status: 'supported' }),
    fai: async (_d, o) => {
      richieste.push({ passo: o.passo, cartella: o.cartella, richiesta: o.richiesta })
      return o.passo === 'fai'
        ? { passo: 'fai', testo: 'Ho aggiunto il test.', finito: true, cartella: '/profilo/project-work/everwave-ab12/project',
          esecuzione: { id: '1', source: o.cartella, workspace: '/profilo/project-work/everwave-ab12/project', reportFile: '/r', state: 'verified', changedFiles: [{ path: 'src/a.test.ts', kind: 'added' }], artifactHashes: {}, verification: { status: 'passed', command: ['npm', 'test'] }, agentExitCode: 0, agentFinished: true, agentText: 'Ho aggiunto il test.', createdAt: 'x' } }
        : { passo: 'piano', testo: 'Aggiungerei un test.', finito: true, cartella: o.cartella }
    }
  })
  const fatto = await mani.lavoraNelCodice({ cartella: progetto, richiesta: 'Add a test for the crash' })
  assert.equal(fatto.passo, 'fai')
  assert.equal(fatto.copia, '/profilo/project-work/everwave-ab12/project')
  assert.equal(fatto.posato, true, 'un giro verificato si posa nel progetto vero')
  assert.match(fatto.testo, /^Fatto nel progetto \(.*progetto\): src\/a\.test\.ts \(added\)\nCom'erano prima: \/r\/before\nFile cambiati dal lavoro: src\/a\.test\.ts \(added\)\nStato: verified · verifica «npm test»: passed\n\nHo aggiunto il test\./)
  assert.deepEqual(richieste, [{ passo: 'fai', cartella: progetto, richiesta: 'Add a test for the crash' }])

  const e = await mani.esegui('lavora_nel_codice', { richiesta: 'Add a test' }, { cartella: progetto })
  assert.deepEqual(e.fatto, { attrezzo: 'lavora', esito: 'ok', dettaglio: `posato in ${progetto}` })
  assert.equal(e.copia, '/profilo/project-work/everwave-ab12/project')
  assert.match(mani.fraseDaiFatti([e.fatto!], 'en'), new RegExp(`the changes are in ${progetto}`))
  assert.equal((await mani.esegui('lavora_nel_codice', { richiesta: 'x' }, {})).male, true)

  // un file che ha cambiato lui nel frattempo non si tocca, e la riga lo dice
  finto({
    installato: () => '/x/claude', runtime: async () => ({ status: 'supported' }),
    posa: async () => ({ backup: '/r/before', applied: [], skipped: [{ path: 'src/a.test.ts', reason: 'changed-meanwhile' as const }] }),
    fai: async (_d, o) => ({ passo: 'fai', testo: 'Ho aggiunto il test.', finito: true, cartella: '/profilo/project-work/everwave-ab12/project',
      esecuzione: { id: '1', source: o.cartella, workspace: '/profilo/project-work/everwave-ab12/project', reportFile: '/r', state: 'verified', changedFiles: [{ path: 'src/a.test.ts', kind: 'added' }], artifactHashes: {}, verification: { status: 'passed' }, agentExitCode: 0, agentFinished: true, agentText: '', createdAt: 'x' } })
  })
  const tuo = await mani.lavoraNelCodice({ cartella: progetto, richiesta: 'Add a test' })
  assert.equal(tuo.posato, false)
  assert.match(tuo.testo, /Lasciati stare perché li hai cambiati tu nel frattempo: src\/a\.test\.ts/)
  assert.match(tuo.testo, /Il lavoro è nella copia/)

  // un giro fallito non si posa: resta nella copia
  let posate = 0
  finto({
    installato: () => '/x/claude', runtime: async () => ({ status: 'supported' }),
    posa: async () => { posate++; return { backup: '', applied: [], skipped: [] } },
    fai: async (_d, o) => ({ passo: 'fai', testo: 'Non ce l’ho fatta.', finito: true, cartella: '/copia',
      esecuzione: { id: '1', source: o.cartella, workspace: '/copia', reportFile: '/r', state: 'failed', changedFiles: [{ path: 'src/a.ts', kind: 'modified' }], artifactHashes: {}, verification: { status: 'failed' }, agentExitCode: 1, agentFinished: true, agentText: '', createdAt: 'x' } })
  })
  const rotto = await mani.lavoraNelCodice({ cartella: progetto, richiesta: 'Add a test' })
  assert.equal(posate, 0, 'un giro fallito non deve toccare il progetto vero')
  assert.equal(rotto.posato, false)
  assert.match(rotto.testo, /Il lavoro è nella copia \(\/copia\) e la cartella vera non è stata toccata\./)

  finto({ installato: () => '/x/claude', runtime: async () => ({ status: 'incompatible' }), fai: async (_d, o) => ({ passo: 'piano', testo: 'Aggiungerei un test.', finito: true, cartella: o.cartella }) })
  const piano = await mani.lavoraNelCodice({ cartella: progetto, richiesta: 'Add a test' })
  assert.equal(piano.passo, 'piano')
  assert.equal(piano.copia, null)
  assert.match(piano.testo, /ha solo letto la cartella.*niente è cambiato\.\n\nAggiungerei un test\./)

  finto({ installato: () => null })
  await assert.rejects(() => mani.lavoraNelCodice({ cartella: progetto, richiesta: 'x' }), /non è installato/)
  await assert.rejects(() => mani.lavoraNelCodice({ cartella: progetto, richiesta: '  ' }), /niente da chiedergli/)
})

// — quali mani, per quale riga —

test('le mani di una riga: leggere sempre, scrivere solo se il compito lo chiede, il codice solo con una cartella e Claude Code', () => {
  const nomi = (o: Parameters<typeof mani.perQuestoCompito>[0]) => mani.perQuestoCompito(o).map(t => t.name)
  finto({ installato: () => null })
  assert.deepEqual(nomi({ compito: 'Define a Myynd pilot inside H-Farm' }), ['leggi_file', 'leggi_pagina', 'cerca_web'])
  assert.deepEqual(nomi({ compito: 'Write a note in Apple Notes with the call summary' }), ['leggi_file', 'leggi_pagina', 'cerca_web', 'crea_nota'])
  assert.deepEqual(nomi({ compito: 'Save the pilot plan as a markdown file' }), ['leggi_file', 'leggi_pagina', 'cerca_web', 'scrivi_file'])
  assert.deepEqual(nomi({ compito: 'Fix the crash in ScreenTimeManager.swift', cartella: progetto }), ['leggi_file', 'leggi_pagina', 'cerca_web'], 'senza Claude Code niente mani sul codice')
  finto({ installato: () => '/x/claude' })
  assert.deepEqual(nomi({ compito: 'Fix the crash in ScreenTimeManager.swift', cartella: progetto }), ['leggi_file', 'leggi_pagina', 'cerca_web', 'lavora_nel_codice'])
  assert.deepEqual(nomi({ compito: 'Reply to App Review', cartella: progetto }), ['leggi_file', 'leggi_pagina', 'cerca_web'], 'una riga che non parla di codice non manda Claude Code')
  assert.deepEqual(nomi({ compito: 'Write a note and save a file', ospitato: true }), ['leggi_pagina', 'cerca_web'], 'su un server restano solo le mani sulla rete')
  for (const t of mani.perQuestoCompito({ compito: 'Write a note in Notes and save a markdown file', cartella: progetto })) {
    assert.equal((t.input_schema as { additionalProperties?: boolean }).additionalProperties, false, `${t.name} non ha uno schema stretto`)
  }
  assert.ok(mani.eUnaMano('leggi_pagina') && !mani.eUnaMano('cerca') && !mani.eUnaMano('claude_lavora'))
  assert.match(mani.spiega(mani.perQuestoCompito({ compito: 'x' })), /già autorizzate/)
  assert.equal(mani.spiega([]), '')
})

// — la frase di chiusura —

test('la frase di chiusura si compone dai fatti quando manca, si tiene quando c\'è, e parla la lingua dell\'app', () => {
  assert.equal(mani.conFraseDiChiusura('Hello Rossi, here is the quote.', [], 'en'), 'Done: the deliverable is below.\n\nHello Rossi, here is the quote.')
  assert.equal(mani.conFraseDiChiusura('Gentile Rossi, ecco.', [], 'it'), 'Fatto: la cosa fatta è qui sotto.\n\nGentile Rossi, ecco.')
  assert.equal(mani.conFraseDiChiusura('Done: the reply is ready below.\nHello Rossi.', [{ attrezzo: 'crea_nota', esito: 'ok', dettaglio: 'x' }], 'en'), 'Done: the reply is ready below.\n\nHello Rossi.')
  assert.equal(mani.conFraseDiChiusura('**Fatto:** la risposta è pronta.\n\nGentile Rossi.', [], 'en'), 'Done: la risposta è pronta.\n\nGentile Rossi.')
  assert.equal(mani.conFraseDiChiusura('Done: saved.', [], 'it'), 'Fatto: saved.')
  assert.equal(mani.conFraseDiChiusura('   ', [], 'en'), '')
  assert.equal(mani.fraseDaiFatti([
    { attrezzo: 'cerca', esito: 'ok', dettaglio: 'H-Farm (2)' },
    { attrezzo: 'leggi_pagina', esito: 'ok', dettaglio: 'https://www.h-farm.com/en' },
    { attrezzo: 'leggi_pagina', esito: 'errore', dettaglio: 'https://x.example' },
    { attrezzo: 'leggi_file', esito: 'ok', dettaglio: '/Users/t/notes.md' },
    { attrezzo: 'crea_documento_app', esito: 'ok', dettaglio: 'Pages: H-Farm pilot' },
    { attrezzo: 'crea_nota', esito: 'ok', dettaglio: 'Call with Bianchi' },
    { attrezzo: 'scrivi_file', esito: 'ok', dettaglio: '/Users/t/Desktop/Myynd/pilot.md' },
    { attrezzo: 'lavora', esito: 'ok', dettaglio: '/p/project-work/everwave-ab12/project' }
  ], 'en'), 'Done: the document «H-Farm pilot» is saved in Pages; the note «Call with Bianchi» is in Apple Notes; the file is written at /Users/t/Desktop/Myynd/pilot.md; the changes are in the copy at /p/project-work/everwave-ab12/project, nothing in the real folder changed; the rest is below after reading 1 web page and 1 file.')
  assert.equal(mani.fraseDaiFatti([{ attrezzo: 'leggi_pagina', esito: 'ok', dettaglio: 'a' }, { attrezzo: 'leggi_pagina', esito: 'ok', dettaglio: 'b' }], 'it'), 'Fatto: la cosa fatta è qui sotto dopo aver letto 2 pagine web.')
  assert.equal(mani.fraseDaiFatti([{ attrezzo: 'lavora', esito: 'ok', dettaglio: 'piano su /p' }], 'it'), 'Fatto: la cosa fatta è qui sotto.')
  assert.doesNotMatch(mani.fraseDaiFatti([{ attrezzo: 'scrivi_file', esito: 'ok', dettaglio: '/x.md' }], 'it'), /—/)
})

test('chiusuraVera boccia una frase che dichiara un salvataggio senza il fatto, e lascia passare quella che regge', () => {
  const ok = (a: Attrezzo): Fatto => ({ attrezzo: a, esito: 'ok', dettaglio: 'x' })
  const no = (a: Attrezzo): Fatto => ({ attrezzo: a, esito: 'errore', dettaglio: 'x' })
  assert.match(mani.chiusuraVera('Done: the pilot definition is saved in Pages as «H-Farm pilot».\n\nBody.', []) ?? '', /crea_documento_app was never called/)
  assert.match(mani.chiusuraVera('Done: the pilot definition is saved in Pages.\n\nBody.', [no('crea_documento_app')]) ?? '', /crea_documento_app/)
  assert.equal(mani.chiusuraVera('Done: the pilot definition is saved in Pages.\n\nBody.', [ok('crea_documento_app')]), null)
  assert.match(mani.chiusuraVera('Done: the note «Call» is in Apple Notes.', []) ?? '', /crea_nota/)
  assert.match(mani.chiusuraVera('Fatto: la nota «Chiamata» è in Note.', []) ?? '', /crea_nota/)
  assert.equal(mani.chiusuraVera('Done: the note «Call» is in Apple Notes.', [ok('crea_nota')]), null)
  assert.match(mani.chiusuraVera('Done: the plan is saved as a markdown file on your desktop.', []) ?? '', /scrivi_file/)
  assert.equal(mani.chiusuraVera('Done: the plan is saved as a markdown file on your desktop.', [ok('scrivi_file')]), null)
  assert.match(mani.chiusuraVera('Done: the changes are in the copy at /p.', []) ?? '', /lavora/)
  assert.equal(mani.chiusuraVera('Done: the changes are in the copy at /p.', [ok('lavora')]), null)
  assert.equal(mani.chiusuraVera('Done: the reply to Rossi is ready below.', []), null)
  assert.equal(mani.chiusuraVera('Hello Rossi, the quote is attached.', []), null, 'senza frase di chiusura non c\'è niente da controllare')
  cfg.scrivi({ lingua: 'it' })
  assert.match(mani.chiusuraVera('Fatto: il documento è salvato in Pages.', []) ?? '', /non è mai stato chiamato con successo/)
  assert.equal(mani.fraseDiChiusura('**Done:** x\ny'), 'Done: x')
  assert.equal(mani.fraseDiChiusura('Hello'), '')
  assert.match(mani.fattiInRighe([], 'it'), /^Nessun attrezzo usato/)
  assert.equal(mani.fattiInRighe([ok('leggi_pagina'), no('crea_nota')], 'en'), '- leggi_pagina (ok): x\n- crea_nota (failed): x')
})

// — dove finiscono le cose che scrive —
//
// «He should tell me, "Hey, I saved it to your desktop"… as I tell more and
// more, "Save it to my Desktop", he will learn that that's my preferred option.»

test('luogoNelTesto legge il posto dalle sue parole, solo con un verbo del salvare, e vince l\'ultima frase', () => {
  assert.equal(mani.luogoNelTesto('Save it to my Desktop'), 'scrivania')
  assert.equal(mani.luogoNelTesto('Write the intro and put it in my Downloads folder.'), 'scaricati')
  assert.equal(mani.luogoNelTesto('Salvalo in Documenti, grazie'), 'documenti')
  assert.equal(mani.luogoNelTesto('keep it in the Myynd folder on the desktop'), 'myynd')
  // dove sta una cosa non è dove metterla
  assert.equal(mani.luogoNelTesto('Read the file on my Desktop and summarise it'), null)
  assert.equal(mani.luogoNelTesto('Introduce Myynd to H-Farm'), null)
  // la risposta si attacca in coda alla nota: l'ultima parola sua vince
  assert.equal(mani.luogoNelTesto('Project: X\nSave to Downloads.\nActually, save it to my Desktop.'), 'scrivania')
})

test('descriviLuogo e luogoDelPercorso parlano dei quattro posti nelle due lingue', () => {
  assert.equal(mani.descriviLuogo('myynd', 'en'), 'on your Desktop, in the Myynd folder')
  assert.equal(mani.descriviLuogo('scrivania', 'it'), 'sulla Scrivania')
  assert.equal(mani.descriviLuogo('scaricati', 'en'), 'in your Downloads folder')
  assert.equal(mani.descriviLuogo('documenti', 'it'), 'in Documenti')
  assert.equal(mani.luogoDelPercorso(join(scrivania, 'Myynd', 'x.md')), 'myynd')
  assert.equal(mani.luogoDelPercorso(join(scrivania, 'x.md')), 'scrivania')
  assert.equal(mani.luogoDelPercorso(join(casa, 'Downloads', 'x.md')), 'scaricati')
  assert.equal(mani.luogoDelPercorso(join(casa, 'x.md')), null)
  assert.equal(mani.luogoPreferito(), 'scrivania')
  cfg.aggiorna({ consegne: { luogo: 'scaricati' } })
  assert.equal(mani.luogoPreferito(), 'scaricati')
})

test('salvaConsegna scrive il file col nome della riga nel luogo scelto, numera, e la frase dice dove', () => {
  const s = mani.salvaConsegna({ titolo: 'Introduce Myynd to H-Farm: a one-page intro?', testo: '# Intro\n\nBody.', luogo: 'scrivania' })
  assert.equal(s.percorso, join(realpathSync(scrivania), 'Introduce Myynd to H-Farm a one-page intro.md'))
  assert.equal(s.nome, 'Introduce Myynd to H-Farm a one-page intro.md')
  assert.equal(readFileSync(s.percorso, 'utf8'), '# Intro\n\nBody.')
  const due = mani.salvaConsegna({ titolo: 'Introduce Myynd to H-Farm: a one-page intro?', testo: 'again', luogo: 'scrivania' })
  assert.equal(due.nome, 'Introduce Myynd to H-Farm a one-page intro-2.md')
  assert.equal(readFileSync(s.percorso, 'utf8'), '# Intro\n\nBody.', 'il primo file non è stato toccato')
  const giu = mani.salvaConsegna({ titolo: 'piano', testo: 'x', luogo: 'scaricati' })
  assert.equal(giu.percorso, join(realpathSync(join(casa, 'Downloads')), 'Piano.md'))
  assert.equal(mani.nomeFile('  ...  '), 'Myynd')
  assert.equal(mani.nomeFile('a'.repeat(100)).length, 70)
  assert.equal(mani.fraseDelFile(s, 'en'), 'Done: «Introduce Myynd to H-Farm a one-page intro.md» is on your Desktop.')
  assert.equal(mani.fraseDelFile(giu, 'it', true), 'Fatto: «Piano.md» è nella cartella Download. D\'ora in poi salvo lì.')
  // e la frase dai fatti conosce il posto, quando è uno dei quattro
  assert.equal(mani.fraseDaiFatti([{ attrezzo: 'scrivi_file', esito: 'ok', dettaglio: s.percorso }], 'en'), 'Done: «Introduce Myynd to H-Farm a one-page intro.md» is on your Desktop; the rest is below.')
  finto({ ospitato: () => true })
  assert.throws(() => mani.salvaConsegna({ titolo: 'x', testo: 'x', luogo: 'myynd' }), /server/)
})

test('vaSalvato: una pagina sì, un messaggio no, una risposta corta no, una cosa già prodotta altrove no, e se lo chiede lei sì', () => {
  const pagina = 'Done: below.\n\n# Introducing Myynd\n\n' + 'Myynd is a personal twin. '.repeat(40) + '\n\nSecond.\n\nThird.'
  assert.equal(mani.vaSalvato({ risultato: pagina, fatti: [], messaggio: false }), true)
  assert.equal(mani.vaSalvato({ risultato: pagina, fatti: [], messaggio: true }), false)
  assert.equal(mani.vaSalvato({ risultato: 'Done: below.\n\nYes: go with the June figures.', fatti: [], messaggio: false }), false)
  assert.equal(mani.vaSalvato({ risultato: 'Done: below.\n\nYes: go with the June figures.', fatti: [], messaggio: false, chiesto: true }), true)
  assert.equal(mani.vaSalvato({ risultato: pagina, fatti: [{ attrezzo: 'crea_nota', esito: 'ok', dettaglio: 'x' }], messaggio: false }), false)
  assert.equal(mani.vaSalvato({ risultato: pagina, fatti: [{ attrezzo: 'scrivi_file', esito: 'errore', dettaglio: 'x' }], messaggio: false }), true)
  assert.equal(mani.vaSalvato({ risultato: 'Done: below.\n\nSubject: Hi\n\n' + 'x '.repeat(600), fatti: [], messaggio: false }), false)
  assert.equal(mani.vaSalvato({ risultato: 'Done: below.\n\nA\n\nB\n\nC\n\nD', fatti: [], messaggio: false }), true)
  assert.equal(mani.vaSalvato({ risultato: 'Done: below.', fatti: [], messaggio: false, chiesto: true }), false)
})

/*
 * La soglia separa una cosa scritta da una risposta, non due lunghezze.
 *
 * «I do not want him to make the brief in-app and deliver it under the feed»:
 * prima ci voleva mezza pagina (novecento caratteri, o quattro paragrafi) per
 * finire su un file, e un brief di due paragrafi restava incollato sotto la
 * voce del feed — cioè esattamente la cosa che lui non vuole vedere.
 */
test('vaSalvato: due paragrafi sono una cosa scritta e vanno su file; due frasi sono una risposta e restano sulla riga', () => {
  const senzaFile = (risultato: string) => mani.vaSalvato({ risultato, fatti: [], messaggio: false })
  assert.equal(senzaFile('Done: below.\n\nThe pilot starts in October.\n\nThree people, four weeks.'), true)
  assert.equal(senzaFile('Done: below.\n\nThe pilot starts in October.\n- Three people\n- Four weeks'), true)
  assert.equal(senzaFile('Done: below.\n\n' + 'The pilot starts in October with three people. '.repeat(8)), true, 'mezza pagina di un paragrafo solo è comunque una cosa scritta')
  assert.equal(senzaFile('Done: below.\n\nThe audit covers H-Farm Education, and Giulia needs the answer before Friday.'), false)
  assert.equal(senzaFile('Done: below.\n\nYes.'), false)
})

test('rigaPerLei stacca la riga per lei dal documento, e nel dubbio la lascia dentro', () => {
  const doc = '# Intro\n\nParagraph one.\n\nParagraph two.\n\nI assumed the audience is the H-Farm leadership team; tell me if it is the students.'
  assert.deepEqual(mani.rigaPerLei(doc), { corpo: '# Intro\n\nParagraph one.\n\nParagraph two.', nota: 'I assumed the audience is the H-Farm leadership team; tell me if it is the students.' })
  assert.deepEqual(mani.rigaPerLei('# Intro\n\nOne.\n\nA closing paragraph about the future of the pilot.'), { corpo: '# Intro\n\nOne.\n\nA closing paragraph about the future of the pilot.', nota: '' })
  // due paragrafi soli: il secondo resta nel documento, a meno che non sia
  // tutto cornice (P3: un'ipotesi dichiarata non finisce mai nel file)
  assert.deepEqual(mani.rigaPerLei('One.\n\nHo ipotizzato che il pilota parta a ottobre.'), { corpo: 'One.', nota: 'Ho ipotizzato che il pilota parta a ottobre.' })
  assert.deepEqual(mani.rigaPerLei('One.\n\nA closing paragraph, based on the plan, about the pilot.'), { corpo: 'One.\n\nA closing paragraph, based on the plan, about the pilot.', nota: '' })
  // tre righe di cornice: le fonti, l'ipotesi, il segnaposto
  assert.deepEqual(mani.rigaPerLei('One.\n\nTwo.\n\nFrom the plan [1].\nI assumed Friday.\nMissing: the owner.'), { corpo: 'One.\n\nTwo.', nota: 'From the plan [1].\nI assumed Friday.\nMissing: the owner.' })
  assert.deepEqual(mani.rigaPerLei('One.\n\nTwo.\n\nHo ipotizzato che il pilota parta a ottobre.'), { corpo: 'One.\n\nTwo.', nota: 'Ho ipotizzato che il pilota parta a ottobre.' })
  assert.equal(mani.senzaChiusura('Done: x.\n\nBody.\n'), 'Body.')
  assert.equal(mani.senzaChiusura('Body.'), 'Body.')
})

test('apriFile apre solo un file di testo dentro uno dei quattro luoghi, con la mano che apre', async () => {
  const aperti: string[] = []
  finto({ apri: async p => { aperti.push(p) } })
  const s = mani.salvaConsegna({ titolo: 'aprimi', testo: 'x', luogo: 'myynd' })
  await mani.apriFile(s.percorso)
  assert.deepEqual(aperti, [s.percorso])
  await assert.rejects(mani.apriFile(join(casa, 'appunti.md')), /non è una consegna/)
  await assert.rejects(mani.apriFile(join(scrivania, 'Myynd', 'manca.md')), /non c’è più/)
  writeFileSync(join(scrivania, 'Myynd', 'app.sh'), 'x')
  await assert.rejects(mani.apriFile(join(scrivania, 'Myynd', 'app.sh')), /non è una consegna/)
  assert.equal(aperti.length, 1)
  finto({ ospitato: () => true })
  await assert.rejects(mani.apriFile(s.percorso), /Mac/)
})

test('scrivi_file scrive nel luogo scelto quando lei ne ha scelto uno, e resta fuori dagli altri posti', () => {
  assert.equal(mani.scriviFile({ percorso: 'note-scelte.md', testo: 'x' }, null, 'scaricati'), join(realpathSync(join(casa, 'Downloads')), 'note-scelte.md'))
  // la cartella Myynd resta scrivibile anche con un altro luogo scelto
  assert.equal(mani.scriviFile({ percorso: join(scrivania, 'Myynd', 'ancora.md'), testo: 'x' }, null, 'scaricati'), join(realpathSync(scrivania), 'Myynd', 'ancora.md'))
  // ma la Scrivania nuda no, se il luogo è Download
  assert.throws(() => mani.scriviFile({ percorso: join(scrivania, 'sopra2.md'), testo: 'x' }, null, 'scaricati'), /solo nella cartella/)
  assert.ok(!existsSync(join(scrivania, 'sopra2.md')))
})

