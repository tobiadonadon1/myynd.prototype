// Una Notion finta per le prove dal vivo: tre pagine condivise, nessuna scrittura.
//
//   FINTO_PORTA=18912 node prove/finto-notion.mjs
//   NOTION_URL=http://127.0.0.1:18912 ... prove/scena.sh
//
// Il server la usa solo con MYYND_DEV=1 e MYYND_NOTION_URL (`connettori/notion.ts`).
// Risponde alla ricerca, a una pagina e ai suoi blocchi (vuoti); tutto il resto
// è un 405, così una scrittura che parte per sbaglio si vede nel registro.
//
// Con FINTO_SCRIVE=1 accetta anche le scritture di `connettori/notion-scrivi.ts`
// (una pagina figlia, il titolo, i blocchi aggiunti, quelli nel cestino), le
// tiene in memoria, e GET /__pagine le dice tutte: le prove del lavoro da sé
// guardano lì la pagina che Myynd ha scritto.

import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PORTA = Number(process.env.FINTO_PORTA || 18912)
const SCRIVE = process.env.FINTO_SCRIVE === '1'
const ora = new Date().toISOString()
const pagina = (id, titolo, parent = { type: 'workspace', workspace: true }) => ({
  object: 'page', id, url: `https://www.notion.so/${id.replace(/-/g, '')}`, archived: false, in_trash: false,
  parent, last_edited_time: ora, created_time: ora,
  properties: { title: { id: 'title', type: 'title', title: [{ type: 'text', plain_text: titolo, text: { content: titolo } }] } }
})
const PAGINE = [
  pagina('11111111-1111-4111-8111-111111111111', 'Myynd'),
  pagina('22222222-2222-4222-8222-222222222222', 'Northwind roadmap'),
  pagina('33333333-3333-4333-8333-333333333333', 'Reading list and notes from the spring conference season')
]
/** Le pagine scritte (solo con FINTO_SCRIVE): id → { pagina, blocchi }. */
const scritte = new Map()
const senza = id => id.replace(/-/g, '')
const trova = id => PAGINE.find(x => senza(x.id) === senza(id)) ?? scritte.get(senza(id))?.pagina
const testo = rt => (rt ?? []).map(r => r.text?.content ?? r.plain_text ?? '').join('')
const conId = bs => (bs ?? []).map(b => ({ ...b, id: randomUUID() }))

function corpo(req) {
  return new Promise(r => { let s = ''; req.on('data', d => { s += d }); req.on('end', () => { try { r(JSON.parse(s || '{}')) } catch { r({}) } }) })
}

createServer(async (req, res) => {
  const fuori = (stato, c) => { res.writeHead(stato, { 'content-type': 'application/json' }); res.end(JSON.stringify(c)) }
  console.log(`${req.method} ${req.url}`)
  if (req.method === 'GET' && req.url === '/__pagine') {
    return fuori(200, [...scritte.values()].map(s => ({
      id: s.pagina.id, madre: s.pagina.parent.page_id, titolo: testo(s.pagina.properties.title.title),
      testo: s.blocchi.filter(b => !b.cestino).map(b => { const v = b[b.type]; return `${b.type}: ${testo(v?.rich_text)}` }).join('\n')
    })))
  }
  if (req.method === 'POST' && req.url.startsWith('/v1/search')) return fuori(200, { object: 'list', results: PAGINE, has_more: false, next_cursor: null })
  const p = /^\/v1\/pages\/([^/?]+)/.exec(req.url)
  if (req.method === 'GET' && p) {
    const trovata = trova(p[1])
    return trovata ? fuori(200, trovata) : fuori(404, { object: 'error', status: 404, code: 'object_not_found', message: 'Could not find page.' })
  }
  const figli = /^\/v1\/blocks\/([^/?]+)\/children/.exec(req.url)
  if (req.method === 'GET' && figli) {
    const s = scritte.get(senza(figli[1]))
    return fuori(200, { object: 'list', results: s ? s.blocchi.filter(b => !b.cestino) : [], has_more: false, next_cursor: null })
  }
  if (SCRIVE) {
    const c = await corpo(req)
    if (req.method === 'POST' && req.url.startsWith('/v1/pages')) {
      const madre = c.parent?.page_id
      if (!madre || !trova(madre)) return fuori(404, { object: 'error', status: 404, code: 'object_not_found', message: 'Could not find parent.' })
      const id = randomUUID()
      const nuova = pagina(id, testo(c.properties?.title?.title), { type: 'page_id', page_id: trova(madre).id })
      scritte.set(senza(id), { pagina: nuova, blocchi: conId(c.children) })
      return fuori(200, nuova)
    }
    if (req.method === 'PATCH' && p) {
      const s = scritte.get(senza(p[1]))
      if (!s) return fuori(404, { object: 'error', status: 404, code: 'object_not_found', message: 'Could not find page.' })
      if (c.properties?.title) s.pagina.properties.title.title = c.properties.title.title
      return fuori(200, s.pagina)
    }
    if (req.method === 'PATCH' && figli) {
      const s = scritte.get(senza(figli[1]))
      if (!s) return fuori(404, { object: 'error', status: 404, code: 'object_not_found', message: 'Could not find block.' })
      const nuovi = conId(c.children)
      s.blocchi.push(...nuovi)
      return fuori(200, { object: 'list', results: nuovi })
    }
    const via = /^\/v1\/blocks\/([^/?]+)$/.exec(req.url)
    if (req.method === 'DELETE' && via) {
      for (const s of scritte.values()) for (const b of s.blocchi) if (senza(b.id) === senza(via[1])) b.cestino = true
      return fuori(200, { object: 'block', id: via[1], in_trash: true })
    }
  }
  fuori(405, { object: 'error', status: 405, code: 'invalid_request', message: 'La Notion finta non scrive.' })
}).listen(PORTA, '127.0.0.1', () => console.log(`notion finta su ${PORTA}${SCRIVE ? ' (scrive)' : ''}`))
