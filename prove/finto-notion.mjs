// Una Notion finta per le prove dal vivo: tre pagine condivise, nessuna scrittura.
//
//   FINTO_PORTA=18912 node prove/finto-notion.mjs
//   NOTION_URL=http://127.0.0.1:18912 ... prove/scena.sh
//
// Il server la usa solo con MYYND_DEV=1 e MYYND_NOTION_URL (`connettori/notion.ts`).
// Risponde alla ricerca, a una pagina e ai suoi blocchi (vuoti); tutto il resto
// è un 405, così una scrittura che parte per sbaglio si vede nel registro.

import { createServer } from 'node:http'

const PORTA = Number(process.env.FINTO_PORTA || 18912)
const ora = new Date().toISOString()
const pagina = (id, titolo) => ({
  object: 'page', id, url: `https://www.notion.so/${id.replace(/-/g, '')}`, archived: false, in_trash: false,
  parent: { type: 'workspace', workspace: true }, last_edited_time: ora, created_time: ora,
  properties: { title: { id: 'title', type: 'title', title: [{ type: 'text', plain_text: titolo, text: { content: titolo } }] } }
})
const PAGINE = [
  pagina('11111111-1111-4111-8111-111111111111', 'Myynd'),
  pagina('22222222-2222-4222-8222-222222222222', 'Northwind roadmap'),
  pagina('33333333-3333-4333-8333-333333333333', 'Reading list and notes from the spring conference season')
]

createServer((req, res) => {
  const fuori = (stato, corpo) => { res.writeHead(stato, { 'content-type': 'application/json' }); res.end(JSON.stringify(corpo)) }
  console.log(`${req.method} ${req.url}`)
  if (req.method === 'POST' && req.url.startsWith('/v1/search')) return fuori(200, { object: 'list', results: PAGINE, has_more: false, next_cursor: null })
  const p = /^\/v1\/pages\/([^/?]+)/.exec(req.url)
  if (req.method === 'GET' && p) {
    const trovata = PAGINE.find(x => x.id.replace(/-/g, '') === p[1].replace(/-/g, ''))
    return trovata ? fuori(200, trovata) : fuori(404, { object: 'error', status: 404, code: 'object_not_found', message: 'Could not find page.' })
  }
  if (req.method === 'GET' && /^\/v1\/blocks\/[^/]+\/children/.test(req.url)) return fuori(200, { object: 'list', results: [], has_more: false, next_cursor: null })
  fuori(405, { object: 'error', status: 405, code: 'invalid_request', message: 'La Notion finta non scrive.' })
}).listen(PORTA, '127.0.0.1', () => console.log(`notion finta su ${PORTA}`))
