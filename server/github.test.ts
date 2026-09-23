// GitHub: i punti in cui sbaglierebbe senza dirlo.
//
// Non si prova la rete: si prova quello che succede *ai dati* intorno alla
// rete, che è dove i guasti restano invisibili. Le cinque cose che si guardano,
// e perché ognuna:
//
//   · **gli id.** Sono la chiave con cui un documento si riconosce fra un giro
//     e l'altro. Sbagliarne la forma non dà nessun errore: dà la stessa pull
//     request salvata due volte a ogni lettura, e un indice che cresce da solo.
//   · **le issue che sono pull request.** GitHub le mette in tutti e due gli
//     elenchi. Chi non le filtra indicizza ogni proposta due volte, con due id
//     diversi — e la rassegna del mattino la racconta due volte.
//   · **il recinto dei repository.** Se l'elenco scritto a mano non venisse
//     rispettato, chi ha chiesto «guarda solo questi tre» si ritroverebbe
//     l'indice pieno degli altri quaranta, senza un errore da nessuna parte.
//   · **il tetto.** Senza, un giro di GitHub si prende tutta la lettura e le
//     altre fonti restano indietro per ore.
//   · **nessuna scrittura.** È la promessa scritta in cima al connettore, ed è
//     l'unica che se salta non si vede: si vede sul repository di qualcuno.
//
//   node --test --disable-warning=ExperimentalWarning server/github.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import * as gh from './connettori/github.ts'

const VERA = globalThis.fetch
after(() => { globalThis.fetch = VERA })

/** Quello che il finto GitHub si è sentito chiedere: indirizzo e metodo. */
let chiamate: { url: string; metodo: string }[] = []
beforeEach(() => { chiamate = [] })

/**
 * Un finto GitHub: una tabella da pezzo di indirizzo a risposta.
 *
 * La chiave è una porzione dell'URL, così una prova dice solo quello che le
 * interessa e tutto il resto risponde con un elenco vuoto — che è il modo in
 * cui una fonte si comporta davvero quasi sempre.
 */
function rispondi(tabella: Record<string, unknown>, intestazioni: Record<string, string> = {}) {
  globalThis.fetch = (async (url: string | URL, o?: RequestInit) => {
    const u = String(url)
    chiamate.push({ url: u, metodo: (o?.method ?? 'GET').toUpperCase() })
    for (const [pezzo, corpo] of Object.entries(tabella)) {
      if (!u.includes(pezzo)) continue
      if (corpo instanceof Response) return corpo.clone()
      return Response.json(corpo, { headers: intestazioni })
    }
    return Response.json([])
  }) as typeof fetch
}

const TOKEN = { token: 'github_pat_finto' }

// — il token —

test('un token buono torna il nome di chi è, e quanti repository vede', async () => {
  // '/user/repos' prima di '/user': il finto GitHub risponde con la prima
  // chiave contenuta nell'indirizzo, e '/user' sta dentro tutti e due
  rispondi({ '/user/repos': [{ full_name: 'tobia/myynd' }, { full_name: 'tobia/sito' }], '/user': { login: 'tobia' } }, { 'x-oauth-scopes': 'repo, read:org' })
  const e = await gh.prova(TOKEN)
  assert.deepEqual(e, { ok: true, login: 'tobia', repos: 2, oltre: false, letti: 2, sso: false })
  assert.ok(chiamate.every(c => c.metodo === 'GET'))
})

test('un token sbagliato, scaduto o revocato dice cosa fare, non «non valido»', async () => {
  // GitHub risponde 401 «Bad credentials» a tutti e tre: a scadenza il token
  // è revocato (docs.github.com, «Token expiration and revocation»)
  rispondi({ '/user': new Response('{"message":"Bad credentials"}', { status: 401 }) })
  const e = await gh.prova(TOKEN)
  assert.equal(e.ok, false)
  assert.match((e as { errore: string }).errore, /scaduto.*cancellato.*copiato a metà.*Creane uno nuovo/)
})

test('un token senza l’ambito «repo» si ferma qui, non fra sei ore a zero documenti', async () => {
  /*
   * È il difetto che non dà errore: `/user` passa anche a un token cieco, la
   * scheda dice «collegato», e la fonte resta a zero per sempre. L'unico
   * momento in cui si può dire è questo, mentre le mani sono ancora sulla
   * tastiera.
   */
  rispondi({ '/user': { login: 'tobia' } }, { 'x-oauth-scopes': 'gist, read:user' })
  const e = await gh.prova(TOKEN)
  assert.equal(e.ok, false)
  assert.match((e as { errore: string }).errore, /ambito/)
})

test('un token a grana fine non dichiara ambiti, e non per questo è cieco', async () => {
  // GitHub non manda `x-oauth-scopes` per i token a grana fine: leggere la sua
  // assenza come «nessun permesso» vorrebbe dire rifiutare proprio i token che
  // consigliamo di fare
  rispondi({ '/user/repos': [{ full_name: 'tobia/myynd' }], '/user': { login: 'tobia' } })
  assert.deepEqual(await gh.prova(TOKEN), { ok: true, login: 'tobia', repos: 1, oltre: false, letti: 1, sso: false })
})

// — i no di GitHub, uno per uno: feedback del 23 settembre 2026 —

test('un token che non vede nessun repository si ferma qui, e dice «Repository access»', async () => {
  /*
   * Il difetto che non dà errore: `/user` passa, la scheda dice «collegato»,
   * e la fonte resta a zero. Succede lasciando «Public repositories», o con
   * un token d'organizzazione che aspetta l'approvazione: si dicono tutte e
   * due, la seconda come caso da amministratore, ma solo «forse».
   */
  rispondi({ '/user/repos': [], '/user': { login: 'tobia' } })
  const e = await gh.prova(TOKEN) as { ok: false; errore: string; amministratore?: { servizio: string; forse?: boolean } }
  assert.equal(e.ok, false)
  assert.match(e.errore, /«Repository access».*«All repositories»/)
  assert.deepEqual(e.amministratore, { servizio: 'github-org', forse: true })
})

test('un permesso che manca si scopre adesso, con i nomi che GitHub mostra', async () => {
  // 403 «Resource not accessible by personal access token», con
  // `X-Accepted-GitHub-Permissions`: docs.github.com, «Troubleshooting the REST API»
  rispondi({
    '/user/repos': [{ full_name: 'tobia/myynd' }],
    '/user': { login: 'tobia' },
    '/commits': new Response('{"message":"Resource not accessible by personal access token"}', {
      status: 403, headers: { 'x-accepted-github-permissions': 'contents=read' }
    })
  })
  const e = await gh.prova(TOKEN) as { ok: false; errore: string }
  assert.equal(e.ok, false)
  assert.match(e.errore, /«Permissions».*Contents, Issues e Pull requests.*«Read-only»/)
})

test('un repository vuoto o senza issue non è un permesso che manca', async () => {
  // 409 «Git Repository is empty», 410 issue spente: niente da leggere, ma
  // nessun permesso da aggiungere
  rispondi({
    '/user/repos': [{ full_name: 'tobia/vuoto' }],
    '/user': { login: 'tobia' },
    '/commits': new Response('{"message":"Git Repository is empty."}', { status: 409 }),
    '/issues': new Response('{"message":"Issues are disabled for this repo"}', { status: 410 })
  })
  assert.deepEqual(await gh.prova(TOKEN), { ok: true, login: 'tobia', repos: 1, oltre: false, letti: 1, sso: false })
})

test('l’SSO dell’organizzazione si dice con l’indirizzo che manda GitHub', async () => {
  // `X-GitHub-SSO: required; url=…` (docs.github.com, «Authenticating to the
  // REST API», SAML SSO): l'indirizzo vale un'ora, e porta dritto al bottone
  const url = 'https://github.com/orgs/acme/sso?authorization_request=abc'
  rispondi({
    '/user/repos': [{ full_name: 'acme/app' }],
    '/user': { login: 'tobia' },
    '/commits': new Response('{"message":"Resource protected by organization SAML enforcement."}', {
      status: 403, headers: { 'x-github-sso': `required; url=${url}` }
    })
  })
  const e = await gh.prova(TOKEN) as { ok: false; errore: string; dove?: string }
  assert.match(e.errore, /«Configure SSO».*«Authorize»/)
  assert.equal(e.dove, url)
})

test('i criteri dell’organizzazione hanno ognuno la sua frase', async () => {
  // le frasi di GitHub come le riportano composer#12711 e refined-github#6951
  rispondi({
    '/user/repos': [{ full_name: 'acme/app' }],
    '/user': { login: 'tobia' },
    '/commits': new Response('{"message":"`acme` forbids access via a personal access token (classic). Please use a GitHub App, OAuth App, or a personal access token with fine-grained permissions."}', { status: 403 })
  })
  assert.match((await gh.prova(TOKEN) as { errore: string }).errore, /non accetta i token classici/)

  // la durata la decide l'organizzazione, da 1 a 366 giorni: si prende il suo numero, e il suo indirizzo
  rispondi({
    '/user/repos': [{ full_name: 'acme/app' }],
    '/user': { login: 'tobia' },
    '/commits': new Response('{"message":"The \'acme\' organization forbids access via a fine-grained personal access tokens if the token\'s lifetime is greater than 90 days. Please adjust your token\'s lifetime at the following URL: https://github.com/settings/personal-access-tokens/4242"}', { status: 403 })
  })
  const lungo = await gh.prova(TOKEN) as { errore: string; giorni?: number; dove?: string }
  assert.match(lungo.errore, /al massimo 90 giorni/)
  assert.equal(lungo.giorni, 90)
  assert.equal(lungo.dove, 'https://github.com/settings/personal-access-tokens/4242')

  // un'organizzazione che i token a grana fine non li accetta proprio
  rispondi({
    '/user/repos': [{ full_name: 'acme/app' }],
    '/user': { login: 'tobia' },
    '/commits': new Response('{"message":"The \'acme\' organization forbids access via a fine-grained personal access tokens. Please use a GitHub App, OAuth App, or a personal access token (classic)."}', { status: 403 })
  })
  const vietato = await gh.prova(TOKEN) as { errore: string; dove?: string }
  assert.match(vietato.errore, /non accetta i token a grana fine/)
  assert.match(vietato.dove ?? '', /^https:\/\/github\.com\/settings\/tokens\/new\?scopes=repo/)
})

test('ogni repository scritto a mano si guarda, non solo il primo: la conferma li conta', async () => {
  rispondi({
    '/user': { login: 'tobia' },
    '/repos/tobia/segreto': new Response('{"message":"Not Found"}', { status: 404 })
  })
  const e = await gh.prova({ ...TOKEN, repos: ['tobia/myynd', 'tobia/segreto'] }) as { ok: false; errore: string; repo?: string }
  assert.equal(e.ok, false)
  assert.equal(e.repo, 'tobia/segreto')
  // tutti visti: si contano tutti, e si leggono tutti
  rispondi({ '/user': { login: 'tobia' } })
  assert.deepEqual(await gh.prova({ ...TOKEN, repos: ['tobia/a', 'tobia/b', 'tobia/c'] }),
    { ok: true, login: 'tobia', repos: 3, oltre: false, letti: 3, sso: false })
})

test('un token classico che vede solo parte delle organizzazioni si collega, e lo dice', async () => {
  // `X-GitHub-SSO: partial-results; organizations=…` su una risposta buona
  rispondi({ '/user/repos': [{ full_name: 'tobia/myynd' }], '/user': { login: 'tobia' } },
    { 'x-oauth-scopes': 'repo', 'x-github-sso': 'partial-results; organizations=21955855,20582480' })
  const e = await gh.prova(TOKEN) as { ok: true; sso: boolean }
  assert.equal(e.ok, true)
  assert.equal(e.sso, true)
})

test('cento repository e un’altra pagina: «più di», non un numero falso', async () => {
  const cento = Array.from({ length: 100 }, (_, i) => ({ full_name: `tobia/r${i}` }))
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url)
    chiamate.push({ url: u, metodo: 'GET' })
    if (u.includes('/user/repos')) return Response.json(cento, { headers: { link: '<https://api.github.com/user/repos?page=2>; rel="next"' } })
    if (u.endsWith('/user')) return Response.json({ login: 'tobia' })
    return Response.json([])
  }) as typeof fetch
  assert.deepEqual(await gh.prova(TOKEN), { ok: true, login: 'tobia', repos: 100, oltre: true, letti: 30, sso: false })
})

test('i repository delle organizzazioni si guardano: un token d’organizzazione non legge a zero', async () => {
  // senza `organization_member` un token a grana fine fatto per
  // un'organizzazione non vedeva i repository del suo team
  unGiro()
  await gh.sincronizza(TOKEN)
  const elenco = chiamate.find(c => c.url.includes('/user/repos'))!.url
  assert.match(decodeURIComponent(elenco), /affiliation=owner,collaborator,organization_member/)
})

test('un «rallenta» collegando non si traveste da permesso mancante, e non promette un giro che non c’è', async () => {
  rispondi({ '/user': new Response('', { status: 403, headers: { 'retry-after': '60' } }) })
  const e = await gh.prova(TOKEN)
  // niente è stato salvato: «riprendo al prossimo giro» sarebbe una promessa falsa
  assert.deepEqual(e, { ok: false, errore: 'GitHub ha chiesto di rallentare, e il collegamento non è stato salvato. Riprova fra qualche minuto.' })
})

test('il limite secondario si riconosce dalla frase, senza retry-after né contatore a zero', async () => {
  // docs.github.com, «Rate limits for the REST API»: 403 con il messaggio, e basta
  rispondi({
    '/user/repos': [{ full_name: 'tobia/myynd' }],
    '/user': { login: 'tobia' },
    '/commits': new Response('{"message":"You have exceeded a secondary rate limit. Please wait a few minutes before you try again."}', { status: 403 })
  })
  const e = await gh.prova(TOKEN) as { errore: string }
  assert.match(e.errore, /rallentare/)
  assert.doesNotMatch(e.errore, /Permissions/)
})

test('la rete che manca, o che non risponde, si dice in parole, non in «fetch failed»', async () => {
  globalThis.fetch = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
  assert.deepEqual(await gh.prova(TOKEN), { ok: false, errore: 'Non riesco a raggiungere GitHub. Controlla la connessione a internet e riprova.' })
  globalThis.fetch = (async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') }) as typeof fetch
  assert.deepEqual(await gh.prova(TOKEN), { ok: false, errore: 'GitHub non ha risposto in tempo. Controlla la connessione a internet e riprova fra poco.' })
})

// — i documenti —

const PR = {
  number: 12,
  title: 'La rassegna sceglie per corrispondenza',
  state: 'open',
  updated_at: '2026-09-12T10:00:00Z',
  html_url: 'https://github.com/tobia/myynd/pull/12',
  user: { login: 'tobia' },
  labels: [{ name: 'rassegna' }, { name: 'urgente' }],
  comments: 3,
  review_comments: 2,
  body: 'x'.repeat(4000)
}

const VECCHIA = {
  number: 1,
  title: 'Roba di due anni fa',
  state: 'closed',
  updated_at: '2020-01-01T00:00:00Z',
  html_url: 'https://github.com/tobia/myynd/pull/1',
  user: { login: 'tobia' }
}

const ISSUE = {
  number: 7,
  title: 'Il token scade e nessuno lo dice',
  state: 'closed',
  updated_at: '2026-09-11T08:00:00Z',
  html_url: 'https://github.com/tobia/myynd/issues/7',
  user: { login: 'marta' },
  labels: [{ name: 'guasto' }],
  comments: 1
}

const COMMIT = {
  sha: 'abc123def4567890',
  html_url: 'https://github.com/tobia/myynd/commit/abc123def4567890',
  commit: {
    message: 'myynd: il giorno sulle righe\n\ne la versione 0.2.4',
    author: { name: 'Tobia Donadon', date: '2026-09-12T09:00:00Z' }
  },
  author: { login: 'tobia' },
  files: [{}, {}, {}]
}

function unGiro() {
  rispondi({
    '/user/repos': [{ full_name: 'tobia/myynd' }],
    '/pulls': [PR, VECCHIA],
    // la seconda è una pull request travestita da issue: GitHub la mette in
    // tutti e due gli elenchi
    '/issues': [ISSUE, { ...PR, pull_request: { url: 'x' } }],
    '/commits': [COMMIT]
  })
}

test('una pull request diventa un documento che si ritrova e si apre', async () => {
  unGiro()
  const e = await gh.sincronizza(TOKEN)
  const d = e.docs.find(x => x.tipo === 'pull request')!
  assert.ok(d, 'nessuna pull request nei documenti')
  assert.equal(d.id, 'github:pr:tobia/myynd#12')
  assert.equal(d.fonte, 'github')
  assert.equal(d.titolo, 'myynd #12: La rassegna sceglie per corrispondenza')
  assert.equal(d.autore, 'tobia')
  assert.equal(d.quando, '2026-09-12T10:00:00Z')
  // il link va dove lo cerca `apriFonte`, come per Notion e Drive
  assert.equal(d.percorso, 'https://github.com/tobia/myynd/pull/12')
  assert.equal(d.gruppo, 'conversazioni')
  assert.match(d.corpo, /aperta/)
  assert.match(d.corpo, /tobia/)
  assert.match(d.corpo, /rassegna, urgente/)
  // i commenti si contano e non si aprono: tre più due
  assert.match(d.corpo, /5 commenti/)
  // il testo entra tagliato: quattromila caratteri di descrizione dentro
  // l'indice sono rumore, non contenuto
  assert.ok(d.corpo.length < 2000, `corpo lungo ${d.corpo.length}`)
})

test('una issue è una issue, e una pull request travestita da issue non entra due volte', async () => {
  unGiro()
  const e = await gh.sincronizza(TOKEN)
  const issue = e.docs.filter(x => x.tipo === 'issue')
  assert.equal(issue.length, 1, 'la pull request è rientrata dall’elenco delle issue')
  assert.equal(issue[0]!.id, 'github:issue:tobia/myynd#7')
  assert.equal(issue[0]!.titolo, 'myynd #7: Il token scade e nessuno lo dice')
  assert.equal(issue[0]!.autore, 'marta')
  assert.equal(issue[0]!.percorso, 'https://github.com/tobia/myynd/issues/7')
  assert.equal(issue[0]!.quando, '2026-09-11T08:00:00Z')
  // e la proposta resta una sola: un id per cosa successa
  assert.deepEqual(e.docs.filter(x => x.id.startsWith('github:pr:')).map(x => x.id), ['github:pr:tobia/myynd#12'])
})

test('un commit porta la sua prima riga, il suo autore e la sua data', async () => {
  unGiro()
  const e = await gh.sincronizza(TOKEN)
  const d = e.docs.find(x => x.tipo === 'commit')!
  assert.ok(d, 'nessun commit nei documenti')
  assert.equal(d.id, 'github:commit:abc123def4567890')
  // il titolo è la prima riga, non il messaggio intero: il resto sta nel corpo
  assert.equal(d.titolo, 'myynd: myynd: il giorno sulle righe')
  assert.equal(d.autore, 'Tobia Donadon')
  assert.equal(d.quando, '2026-09-12T09:00:00Z')
  assert.equal(d.percorso, 'https://github.com/tobia/myynd/commit/abc123def4567890')
  assert.equal(d.gruppo, 'conversazioni')
  assert.match(d.corpo, /3 file toccati/)
  assert.match(d.corpo, /e la versione 0\.2\.4/)
})

test('quello che è fermo da due anni resta fuori dalla finestra', async () => {
  unGiro()
  const e = await gh.sincronizza(TOKEN)
  assert.equal(e.docs.some(d => d.id.endsWith('#1')), false, 'una proposta del 2020 è entrata fra le novità')
})

test('i commit si chiedono da una data, non tutti', async () => {
  unGiro()
  await gh.sincronizza(TOKEN)
  const c = chiamate.find(x => x.url.includes('/commits'))!
  assert.ok(c, 'non ha chiesto i commit')
  assert.match(c.url, /since=/)
})

test('la finestra si può dire da fuori', async () => {
  unGiro()
  await gh.sincronizza(TOKEN, undefined, new Date('2026-01-02T03:04:05.000Z'))
  const c = chiamate.find(x => x.url.includes('/commits'))!
  assert.match(c.url, /since=2026-01-02T03%3A04%3A05\.000Z/)
})

// — il recinto —

test('l’elenco scritto a mano vince: gli altri repository non si guardano nemmeno', async () => {
  rispondi({ '/pulls': [], '/issues': [], '/commits': [] })
  const e = await gh.sincronizza({ token: 'x', repos: ['tobia/myynd', 'acme/listino'] })
  assert.equal(e.repos, 2)
  assert.equal(chiamate.some(c => c.url.includes('/user/repos')), false,
    'ha chiesto a GitHub i suoi repository, dopo che gli era stato detto quali')
  assert.ok(chiamate.some(c => c.url.includes('/repos/tobia/myynd/pulls')))
  assert.ok(chiamate.some(c => c.url.includes('/repos/acme/listino/pulls')))
})

test('senza elenco si prendono i suoi, ordinati per ultima spinta', async () => {
  rispondi({ '/user/repos': [{ full_name: 'tobia/myynd' }], '/pulls': [], '/issues': [], '/commits': [] })
  await gh.sincronizza(TOKEN)
  const c = chiamate.find(x => x.url.includes('/user/repos'))!
  assert.ok(c, 'non ha chiesto l’elenco dei repository')
  assert.match(c.url, /sort=pushed/)
  assert.match(c.url, /per_page=30/)
})

test('una riga che non è owner/nome non diventa una chiamata', async () => {
  rispondi({ '/pulls': [], '/issues': [], '/commits': [] })
  const e = await gh.sincronizza({ token: 'x', repos: ['non-un-repository'] })
  assert.deepEqual(e.falliti, ['non-un-repository'])
  assert.equal(chiamate.length, 0)
})

// — i limiti —

test('al tetto ci si ferma, e non si chiede più niente', async () => {
  const molti = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))
  // il finto GitHub qui guarda *quale* repository gli si chiede: dieci
  // repository che rispondessero tutti le stesse cose darebbero documenti con
  // lo stesso id, e la prova sugli id non guarderebbe più niente
  globalThis.fetch = (async (url: string | URL, o?: RequestInit) => {
    const u = String(url)
    chiamate.push({ url: u, metodo: (o?.method ?? 'GET').toUpperCase() })
    const r = /\/repos\/o\/(r\d+)\//.exec(u)?.[1] ?? '?'
    if (u.includes('/pulls')) return Response.json(molti(20, i => ({ ...PR, number: 1000 + i })))
    if (u.includes('/issues')) return Response.json(molti(20, i => ({ ...ISSUE, number: 2000 + i })))
    if (u.includes('/commits')) return Response.json(molti(30, i => ({ ...COMMIT, sha: `${r}sha${i}` })))
    return Response.json([])
  }) as typeof fetch

  // dieci repository da settanta documenti: il tetto cade dentro il sesto
  const e = await gh.sincronizza({ token: 'x', repos: molti(10, i => `o/r${i}`) })

  assert.equal(e.docs.length, 400)
  assert.equal(e.troncato, true)
  // gli id restano distinti: un tetto che tagliasse male darebbe quattrocento
  // documenti di cui metà uguali
  assert.equal(new Set(e.docs.map(d => d.id)).size, 400)
  assert.equal(chiamate.some(c => c.url.includes('/repos/o/r6/')), false,
    'ha continuato a chiedere dopo aver toccato il tetto')
})

test('un «rallenta» ferma il giro e tiene quello che ha già letto', async () => {
  let visti = 0
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url)
    chiamate.push({ url: u, metodo: 'GET' })
    if (u.includes('/repos/o/r1/')) {
      return new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
    }
    if (u.includes('/pulls')) { visti++; return Response.json([PR]) }
    return Response.json([])
  }) as typeof fetch

  const e = await gh.sincronizza({ token: 'x', repos: ['o/r0', 'o/r1', 'o/r2'] })
  assert.equal(e.docs.length, 1, 'ha buttato via il repository già letto')
  assert.equal(e.troncato, true)
  assert.equal(e.limite, 'GitHub ha detto di rallentare: riprendo al prossimo giro.')
  assert.equal(visti, 1)
  assert.equal(chiamate.some(c => c.url.includes('/repos/o/r2/')), false,
    'ha insistito dopo che GitHub aveva detto di rallentare')
})

test('un repository che cade non fa cadere gli altri', async () => {
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url)
    chiamate.push({ url: u, metodo: 'GET' })
    if (u.includes('/repos/o/rotto/')) return new Response('', { status: 404 })
    if (u.includes('/pulls')) return Response.json([PR])
    return Response.json([])
  }) as typeof fetch

  const e = await gh.sincronizza({ token: 'x', repos: ['o/rotto', 'o/buono'] })
  assert.deepEqual(e.falliti, ['o/rotto'])
  assert.equal(e.troncato, false)
  assert.equal(e.docs.length, 1)
})

// — la promessa —

test('non c’è una sola chiamata che non sia una GET', async () => {
  unGiro()
  await gh.sincronizza(TOKEN)
  assert.ok(chiamate.length > 0)
  const scritture = chiamate.filter(c => c.metodo !== 'GET')
  assert.deepEqual(scritture, [], 'questo connettore non deve scrivere mai su GitHub')
})

test('l’avanzamento conta i repository, non i documenti', async () => {
  rispondi({ '/pulls': [], '/issues': [], '/commits': [] })
  const passi: string[] = []
  await gh.sincronizza({ token: 'x', repos: ['o/a', 'o/b'] }, (fatti, tot) => passi.push(`${fatti}/${tot}`))
  assert.deepEqual(passi, ['1/2', '2/2'])
})
