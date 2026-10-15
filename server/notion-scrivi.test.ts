// Notion in scrittura: una pagina sola, scelta da lui, e solo figlie di quella.
//
// Tutto con una Notion finta (`usaCliente`): una prova che scrive nel suo
// Notion vero non è una prova. Quello che conta qui è il recinto: senza
// pagina scelta non parte niente; la stessa chiave riprende la stessa pagina;
// una pagina che non è più figlia della scelta non si tocca; i blocchi che
// sono pagine non si buttano; e il Markdown arriva a Notion nella forma e nei
// pezzi che l'API accetta.
//
//   node --import ./build/test-profile.mjs --test server/notion-scrivi.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from '@notionhq/client'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-notion-scrivi-'))
process.env.MYYND_DATI = CASA

const notion = await import('./connettori/notion.ts')
const ns = await import('./connettori/notion-scrivi.ts')
const cfg = await import('./config.ts')
const mani = await import('./mani.ts')
const contratto = await import('./contratto.ts')
const store = await import('./store.ts')

after(() => {
  notion.usaCliente(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const MADRE = '11111111-1111-1111-1111-111111111111'
const ALTRA = '22222222-2222-2222-2222-222222222222'

type PaginaFinta = { id: string; parent: { type: 'page_id'; page_id: string } | { type: 'workspace' }; titolo: string; in_trash?: boolean }
type BloccoFinto = { id: string; type: string; dentro: string; archiviato?: boolean; corpo: any }

/** Uno spazio Notion finto: pagine, blocchi, e ogni chiamata che riceve. */
function finto() {
  let n = 100
  const nuovoId = () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`
  const pagine = new Map<string, PaginaFinta>()
  const blocchi: BloccoFinto[] = []
  const chiamate: { metodo: string; id?: string; quanti?: number }[] = []
  /** `append: n`: la n-esima aggiunta di blocchi da qui in poi cade. */
  const guasti = { append: 0 }
  pagine.set(MADRE, { id: MADRE, parent: { type: 'workspace' }, titolo: 'Myynd' })
  pagine.set(ALTRA, { id: ALTRA, parent: { type: 'workspace' }, titolo: 'Diario' })
  const vista = (p: PaginaFinta) => ({
    object: 'page', id: p.id, url: `https://notion.so/${p.id.replace(/-/g, '')}`, parent: p.parent, in_trash: !!p.in_trash, archived: !!p.in_trash,
    properties: { title: { type: 'title', title: [{ plain_text: p.titolo }] } }
  })
  const nonTrovata = () => Object.assign(new Error('Could not find page'), { code: 'object_not_found', status: 404 })
  const aggiungi = (dentro: string, figli: any[]) => {
    assert.ok(figli.length <= 100, `una richiesta con ${figli.length} blocchi: Notion ne vuole cento al massimo`)
    for (const b of figli) {
      for (const r of b[b.type]?.rich_text ?? []) assert.ok(r.text.content.length <= 2000, 'un pezzo di testo oltre i duemila caratteri')
      assert.ok((b[b.type]?.rich_text ?? []).length <= 100, 'un blocco con oltre cento pezzi di testo')
      blocchi.push({ id: nuovoId(), type: b.type, dentro, corpo: b[b.type] })
    }
  }
  const cl = {
    search: async () => {
      chiamate.push({ metodo: 'search' })
      return { results: [...pagine.values()].map(vista), has_more: false, next_cursor: null }
    },
    pages: {
      retrieve: async (a: { page_id: string }) => {
        chiamate.push({ metodo: 'pages.retrieve', id: a.page_id })
        const p = pagine.get(a.page_id)
        if (!p) throw nonTrovata()
        return vista(p)
      },
      create: async (a: any) => {
        chiamate.push({ metodo: 'pages.create', id: a.parent.page_id, quanti: a.children?.length ?? 0 })
        if (!pagine.has(a.parent.page_id)) throw nonTrovata()
        const id = nuovoId()
        pagine.set(id, { id, parent: { type: 'page_id', page_id: a.parent.page_id }, titolo: a.properties.title.title.map((t: any) => t.text.content).join('') })
        // una pagina figlia è anche un blocco della madre, come in Notion
        blocchi.push({ id, type: 'child_page', dentro: a.parent.page_id, corpo: { title: '' } })
        aggiungi(id, a.children ?? [])
        return vista(pagine.get(id)!)
      },
      update: async (a: any) => {
        chiamate.push({ metodo: 'pages.update', id: a.page_id })
        const p = pagine.get(a.page_id)
        if (!p) throw nonTrovata()
        if (a.archived || a.in_trash) throw new Error('una pagina messa nel cestino: vietato')
        p.titolo = a.properties.title.title.map((t: any) => t.text.content).join('')
        return vista(p)
      }
    },
    blocks: {
      children: {
        list: async (a: { block_id: string }) => {
          chiamate.push({ metodo: 'blocks.children.list', id: a.block_id })
          return { results: blocchi.filter(b => b.dentro === a.block_id && !b.archiviato).map(b => ({ id: b.id, type: b.type, [b.type]: b.corpo, has_children: false })), has_more: false, next_cursor: null }
        },
        append: async (a: any) => {
          chiamate.push({ metodo: 'blocks.children.append', id: a.block_id, quanti: a.children.length })
          if (guasti.append > 0 && --guasti.append === 0) throw Object.assign(new Error('Notion è caduta'), { status: 502 })
          aggiungi(a.block_id, a.children)
          return { results: [] }
        }
      },
      delete: async (a: { block_id: string }) => {
        chiamate.push({ metodo: 'blocks.delete', id: a.block_id })
        const b = blocchi.find(x => x.id === a.block_id)
        if (!b) throw nonTrovata()
        assert.notEqual(b.type, 'child_page', 'una pagina non si butta mai')
        b.archiviato = true
        return {}
      }
    }
  }
  notion.usaCliente(() => cl as unknown as Client)
  const corpo = (id: string) => blocchi.filter(b => b.dentro === id && !b.archiviato && b.type !== 'child_page')
  return { pagine, blocchi, chiamate, corpo, guasti, cl }
}

const scritture = (f: ReturnType<typeof finto>) => f.chiamate.filter(c => !/retrieve|list|search/.test(c.metodo))

beforeEach(() => {
  const c = cfg.leggi()
  delete c.notion
  delete c.notionScritte
  cfg.scrivi(c, { togli: ['notion'] })
  cfg.aggiorna({ notion: { token: 'ntn_finto' } })
})

test('senza una pagina scelta non si scrive niente, e Notion non riceve nemmeno una chiamata', async () => {
  const f = finto()
  assert.equal(ns.attiva(), false)
  await assert.rejects(() => ns.scrivi({ chiave: 'progetto:a', titolo: 'A', markdown: 'ciao' }), (e: unknown) => e instanceof ns.NonScrive)
  assert.equal(f.chiamate.length, 0)
  // e senza Notion collegato, nemmeno
  cfg.scrivi((() => { const c = cfg.leggi(); delete c.notion; return c })(), { togli: ['notion'] })
  await assert.rejects(() => ns.scrivi({ chiave: 'progetto:a', titolo: 'A', markdown: 'ciao' }), (e: unknown) => e instanceof ns.NonScrive)
  assert.equal(f.chiamate.length, 0)
})

test('scegliere la pagina chiede a Notion e salva il suo titolo; null la toglie', async () => {
  const f = finto()
  const scelta = await ns.scegli(MADRE)
  assert.deepEqual(scelta, { id: MADRE, titolo: 'Myynd' })
  assert.deepEqual(cfg.leggi().notion?.paginaMyynd, { id: MADRE, titolo: 'Myynd' })
  assert.equal(cfg.leggi().notion?.token, 'ntn_finto', 'il token resta')
  assert.equal(ns.attiva(), true)
  // una pagina che Notion non dà all'integrazione non si sceglie
  await assert.rejects(() => ns.scegli('33333333-3333-3333-3333-333333333333'), (e: unknown) => e instanceof ns.NonScrive)
  await assert.rejects(() => ns.scegli('../../etc'), (e: unknown) => e instanceof ns.NonScrive)
  assert.equal(cfg.leggi().notion?.paginaMyynd?.id, MADRE)
  assert.equal(await ns.scegli(null), null)
  assert.equal(cfg.leggi().notion?.paginaMyynd, undefined)
  assert.equal(cfg.leggi().notion?.token, 'ntn_finto')
  assert.equal(ns.attiva(), false)
  assert.equal(f.chiamate.filter(c => /create|update|append|delete/.test(c.metodo)).length, 0, 'scegliere non scrive niente in Notion')
})

test('la stessa chiave crea la pagina la prima volta e la riscrive dopo: una pagina sola, sotto la scelta', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const prima = await ns.scrivi({ chiave: 'progetto:p1', titolo: 'Sito nuovo', markdown: '# Stato\n\n- uno\n- due' })
  assert.equal(prima.creata, true)
  assert.deepEqual(f.pagine.get(prima.id)?.parent, { type: 'page_id', page_id: MADRE })
  assert.equal(f.corpo(prima.id).length, 3)
  assert.equal(cfg.leggi().notionScritte?.['progetto:p1'], prima.id)

  const dopo = await ns.scrivi({ chiave: 'progetto:p1', titolo: 'Sito nuovo, settimana 2', markdown: 'Solo questo.' })
  assert.equal(dopo.creata, false)
  assert.equal(dopo.id, prima.id)
  assert.equal(f.pagine.get(prima.id)?.titolo, 'Sito nuovo, settimana 2')
  assert.deepEqual(f.corpo(prima.id).map(b => b.corpo.rich_text[0].text.content), ['Solo questo.'], 'il corpo è sostituito, non aggiunto')
  const figlie = [...f.pagine.values()].filter(p => p.parent.type === 'page_id' && p.parent.page_id === MADRE)
  assert.equal(figlie.length, 1)
  // ogni scrittura è dentro la pagina scelta o dentro la pagina di Myynd
  for (const c of scritture(f)) assert.ok(c.id === MADRE || c.id === prima.id || f.blocchi.find(b => b.id === c.id)?.dentro === prima.id, `${c.metodo} su ${c.id}`)
})

test('una pagina spostata fuori dalla scelta non si tocca: se ne fa una nuova al posto giusto', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const r = await ns.scrivi({ chiave: 'progetto:p2', titolo: 'Fiera', markdown: 'vecchio' })
  // lui la sposta nel suo diario
  f.pagine.get(r.id)!.parent = { type: 'page_id', page_id: ALTRA }
  f.chiamate.length = 0
  const n = await ns.scrivi({ chiave: 'progetto:p2', titolo: 'Fiera', markdown: 'nuovo' })
  assert.equal(n.creata, true)
  assert.notEqual(n.id, r.id)
  assert.deepEqual(f.pagine.get(n.id)?.parent, { type: 'page_id', page_id: MADRE })
  assert.equal(f.corpo(r.id)[0].corpo.rich_text[0].text.content, 'vecchio', 'la pagina spostata è com\'era')
  assert.equal(f.pagine.get(r.id)?.titolo, 'Fiera')
  for (const c of scritture(f)) assert.ok(c.id !== r.id && f.blocchi.find(b => b.id === c.id)?.dentro !== r.id, `${c.metodo} ha toccato la pagina spostata`)

  // nel cestino, lo stesso: non si riprende
  f.pagine.get(n.id)!.in_trash = true
  const t = await ns.scrivi({ chiave: 'progetto:p2', titolo: 'Fiera', markdown: 'ancora' })
  assert.equal(t.creata, true)
  assert.notEqual(t.id, n.id)
})

test('cambiata la pagina scelta, la chiave vecchia non porta più fuori: si scrive sotto la nuova', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const r = await ns.scrivi({ chiave: 'progetto:p3', titolo: 'Libro', markdown: 'a' })
  await ns.scegli(ALTRA)
  f.chiamate.length = 0
  const n = await ns.scrivi({ chiave: 'progetto:p3', titolo: 'Libro', markdown: 'b' })
  assert.equal(n.creata, true)
  assert.deepEqual(f.pagine.get(n.id)?.parent, { type: 'page_id', page_id: ALTRA })
  assert.equal(f.corpo(r.id)[0].corpo.rich_text[0].text.content, 'a')
})

test('riscrivere non butta le sottopagine che lui ha messo dentro la pagina di Myynd', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const r = await ns.scrivi({ chiave: 'progetto:p4', titolo: 'Casa', markdown: 'uno' })
  f.blocchi.push({ id: 'aaaaaaaa-0000-0000-0000-000000000001', type: 'child_page', dentro: r.id, corpo: { title: 'Sue note' } })
  f.blocchi.push({ id: 'aaaaaaaa-0000-0000-0000-000000000002', type: 'child_database', dentro: r.id, corpo: { title: 'Spese' } })
  await ns.scrivi({ chiave: 'progetto:p4', titolo: 'Casa', markdown: 'due' })
  const vivi = f.blocchi.filter(b => b.dentro === r.id && !b.archiviato)
  assert.deepEqual(vivi.map(b => b.type).sort(), ['child_database', 'child_page', 'paragraph'])
  assert.equal(f.chiamate.filter(c => c.metodo === 'pages.update' && c.id !== r.id).length, 0)
})

test('due scritture insieme sulla stessa chiave fanno una pagina sola', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const [a, b] = await Promise.all([
    ns.scrivi({ chiave: 'progetto:p5', titolo: 'Viaggio', markdown: 'a' }),
    ns.scrivi({ chiave: 'progetto:p5', titolo: 'Viaggio', markdown: 'b' })
  ])
  assert.equal(a.id, b.id)
  assert.equal(f.chiamate.filter(c => c.metodo === 'pages.create').length, 1)
  assert.equal(f.corpo(a.id)[0].corpo.rich_text[0].text.content, 'b')
})

test('un corpo lungo arriva a pezzi da cento blocchi', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const md = Array.from({ length: 250 }, (_, i) => `Riga ${i + 1}`).join('\n\n')
  const r = await ns.scrivi({ chiave: 'progetto:lungo', titolo: 'Lungo', markdown: md })
  assert.equal(r.blocchi, 250)
  const quanti = f.chiamate.filter(c => c.metodo === 'pages.create' || c.metodo === 'blocks.children.append').map(c => c.quanti)
  assert.deepEqual(quanti, [100, 100, 50])
  assert.equal(f.corpo(r.id).length, 250)
  assert.equal(f.corpo(r.id)[249].corpo.rich_text[0].text.content, 'Riga 250')
})

test('le candidate: le pagine condivise, senza quelle nel cestino né quelle scritte da Myynd', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const r = await ns.scrivi({ chiave: 'progetto:p6', titolo: 'Figlia', markdown: 'x' })
  f.pagine.set('44444444-4444-4444-4444-444444444444', { id: '44444444-4444-4444-4444-444444444444', parent: { type: 'workspace' }, titolo: 'Vecchia', in_trash: true })
  const c = await ns.candidate()
  assert.deepEqual(c.map(p => p.titolo).sort(), ['Diario', 'Myynd'])
  assert.ok(!c.some(p => p.id === r.id))
})

// — il convertitore —

test('il Markdown diventa i blocchi di Notion: titoli, elenchi, cose da fare, citazioni, codice', () => {
  const b = ns.blocchi([
    '# Uno', '## Due', '#### Quattro', '',
    'Un paragrafo', 'sulla riga dopo.', '',
    '- punto', '* stella', '1. primo', '2) secondo',
    '- [ ] da fare', '- [x] fatto',
    '> citata', '---',
    '```ts', 'const a = 1 — 2', '```'
  ].join('\n'))
  assert.deepEqual(b.map(x => x.type), [
    'heading_1', 'heading_2', 'heading_3', 'paragraph',
    'bulleted_list_item', 'bulleted_list_item', 'numbered_list_item', 'numbered_list_item',
    'to_do', 'to_do', 'quote', 'divider', 'code'
  ])
  const testo = (x: any) => x[x.type].rich_text.map((r: any) => r.text.content).join('')
  assert.equal(testo(b[3]), 'Un paragrafo\nsulla riga dopo.')
  assert.equal((b[8] as any).to_do.checked, false)
  assert.equal((b[9] as any).to_do.checked, true)
  assert.equal((b[12] as any).code.language, 'typescript')
  assert.equal(testo(b[12]), 'const a = 1 — 2', 'il codice resta com\'è')
  for (const x of b) assert.equal(x.object, 'block')
})

test('in riga: grassetto, corsivo, codice e link, e un link che Notion rifiuterebbe resta testo', () => {
  const r = ns.inRiga('Vedi **il piano** e *la nota*, poi `npm test` su [il sito](https://myynd.app) o [qui](javascript:alert(1)) e nome_file_lungo.')
  const per = (s: string) => r.find(x => x.text.content === s)
  assert.deepEqual(per('il piano')?.annotations, { bold: true })
  assert.deepEqual(per('la nota')?.annotations, { italic: true })
  assert.deepEqual(per('npm test')?.annotations, { code: true })
  assert.deepEqual(per('il sito')?.text.link, { url: 'https://myynd.app' })
  assert.ok(r.map(x => x.text.content).join('').includes('[qui](javascript:alert(1))'))
  assert.ok(!r.some(x => x.text.link && !/^https:/.test(x.text.link.url)), 'nessun link che non sia http')
  assert.ok(r.map(x => x.text.content).join('').includes('nome_file_lungo'))
  // grassetto con un link dentro
  const g = ns.inRiga('**[A](https://a.it)**')
  assert.deepEqual(g, [{ type: 'text', text: { content: 'A', link: { url: 'https://a.it' } }, annotations: { bold: true } }])
})

test('i tetti di Notion: duemila caratteri per pezzo, cento pezzi per blocco, cento blocchi per richiesta', () => {
  const lungo = 'a'.repeat(4500)
  const [p] = ns.blocchi(lungo) as any[]
  assert.deepEqual(p.paragraph.rich_text.map((x: any) => x.text.content.length), [2000, 2000, 500])
  // centoventi pezzi in una riga: due blocchi di seguito, nessuno oltre cento
  const tanti = Array.from({ length: 60 }, (_, i) => `**b${i}** c${i}`).join(' ')
  const spezzati = ns.blocchi(tanti) as any[]
  assert.ok(spezzati.length >= 2)
  for (const x of spezzati) assert.ok(x.paragraph.rich_text.length <= 100)
  assert.deepEqual(ns.aPezzi(Array.from({ length: 205 }, (_, i) => i)).map(x => x.length), [100, 100, 5])
  assert.ok(ns.blocchi(Array.from({ length: 1500 }, (_, i) => `- ${i}`).join('\n')).length <= ns.TETTO_BLOCCHI)
})

test('le lineette fuori dal codice spariscono anche dalla pagina di Notion', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const r = await ns.scrivi({ chiave: 'progetto:p7', titolo: 'Piano — marzo', markdown: 'Uno — due\n\n```\na — b\n```' })
  assert.ok(!f.pagine.get(r.id)!.titolo.includes('—'))
  const [par, cod] = f.corpo(r.id)
  assert.ok(!par.corpo.rich_text[0].text.content.includes('—'))
  assert.equal(cod.corpo.rich_text[0].text.content, 'a — b')
})

// — la mano del contratto —

test('la mano «notion» esiste solo con la pagina scelta, e solo se il contratto la chiede', async () => {
  finto()
  const conNotion = () => mani.perQuestoCompito({ compito: 'Aggiorna la pagina del progetto', ospitato: true, mani: ['notion'] }).map(m => m.name)
  assert.ok(!conNotion().includes('scrivi_notion'), 'senza pagina scelta, niente mano')
  assert.equal(contratto.manoDisponibile('notion'), false)
  assert.equal(contratto.manoDisponibile('file'), true)
  await ns.scegli(MADRE)
  assert.ok(conNotion().includes('scrivi_notion'))
  assert.equal(contratto.manoDisponibile('notion'), true)
  // il testo che nomina Notion non basta: la mano la dà il contratto
  assert.ok(!mani.perQuestoCompito({ compito: 'Scrivi in Notion la pagina del progetto', ospitato: true }).some(m => m.name === 'scrivi_notion'))
  assert.ok(mani.eUnaMano('scrivi_notion'))
  // nessuna carta di oggi la prende da sola
  assert.ok(!contratto.forma({ testo: 'Update the Notion page of the website project', nota: null, modo: 'tutto', doc: null, progetto: null, attrezzi: null } as never).mani.includes('notion'))
})

test('la mano scrive con la chiave del contesto e dice cosa ha fatto', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const e = await mani.esegui('scrivi_notion', { titolo: 'Sito', testo: '- [ ] logo' }, { chiaveNotion: 'progetto:sito' })
  assert.equal(e.male, undefined)
  assert.deepEqual(e.fatto, { attrezzo: 'scrivi_notion', esito: 'ok', dettaglio: 'Sito' })
  assert.match(e.testo, /creata in Notion: «Sito» dentro «Myynd»/)
  const id = cfg.leggi().notionScritte?.['progetto:sito']
  assert.ok(id && f.corpo(id)[0].type === 'to_do')
  assert.match(mani.fraseDaiFatti([e.fatto], 'en'), /the page «Sito» is in Notion/)
  // senza pagina scelta la mano torna un guaio, non lancia
  await ns.scegli(null)
  const no = await mani.esegui('scrivi_notion', { titolo: 'Sito', testo: 'x' }, { chiaveNotion: 'progetto:sito' })
  assert.equal(no.male, true)
  assert.equal(no.fatto.esito, 'errore')
})

test('una pagina nuova si ricorda appena creata: se un pezzo dopo cade, il giro dopo la riscrive invece di farne due', async () => {
  const f = finto()
  await ns.scegli(MADRE)
  const md = Array.from({ length: 150 }, (_, i) => `Riga ${i + 1}`).join('\n\n')
  f.guasti.append = 1
  await assert.rejects(() => ns.scrivi({ chiave: 'progetto:caduta', titolo: 'Caduta', markdown: md }))
  const id = cfg.leggi().notionScritte?.['progetto:caduta']
  assert.ok(id, 'la pagina creata è ricordata anche se il secondo pezzo non è passato')
  const r = await ns.scrivi({ chiave: 'progetto:caduta', titolo: 'Caduta', markdown: 'Corta adesso.' })
  assert.equal(r.creata, false)
  assert.equal(r.id, id)
  assert.equal(f.chiamate.filter(c => c.metodo === 'pages.create').length, 1)
  assert.deepEqual(f.corpo(id).map(b => b.corpo.rich_text[0].text.content), ['Corta adesso.'])
})

test('ricollegando con un altro token, la pagina scelta resta solo se il token nuovo la vede', async () => {
  const f = finto()
  const prima = { token: 'ntn_finto', paginaMyynd: { id: MADRE, titolo: 'Myynd' } }
  // stesso token: resta, senza chiedere a Notion
  assert.deepEqual(await ns.tienePagina(prima, 'ntn_finto'), { id: MADRE, titolo: 'Myynd' })
  assert.equal(f.chiamate.length, 0)
  // token nuovo che la vede: resta, col titolo di adesso
  f.pagine.get(MADRE)!.titolo = 'Myynd scrive qui'
  assert.deepEqual(await ns.tienePagina(prima, 'ntn_nuovo'), { id: MADRE, titolo: 'Myynd scrive qui' })
  // token nuovo che non la vede (un altro spazio): se ne va
  f.pagine.delete(MADRE)
  assert.equal(await ns.tienePagina(prima, 'ntn_altro'), undefined)
  // nel cestino: se ne va
  f.pagine.set(MADRE, { id: MADRE, parent: { type: 'workspace' }, titolo: 'Myynd', in_trash: true })
  assert.equal(await ns.tienePagina(prima, 'ntn_altro'), undefined)
  assert.equal(await ns.tienePagina({ token: 'x' }, 'y'), undefined)
})

test('la lettura di Notion salta le pagine che Myynd ha scritto, e solo quelle', async () => {
  const f = finto()
  const ripresa = await import('./connettori/ripresa.ts')
  ripresa.scorda('notion')
  store.svuotaFonte('notion')
  await ns.scegli(MADRE)
  const r = await ns.scrivi({ chiave: 'progetto:letta', titolo: 'Scritta da Myynd', markdown: 'Il punto del progetto.' })
  f.blocchi.push({ id: 'bbbbbbbb-0000-0000-0000-000000000001', type: 'paragraph', dentro: MADRE, corpo: { rich_text: [{ plain_text: 'Le sue note sulla pagina madre.' }] } })
  f.blocchi.push({ id: 'bbbbbbbb-0000-0000-0000-000000000002', type: 'paragraph', dentro: ALTRA, corpo: { rich_text: [{ plain_text: 'Il suo diario.' }] } })
  for (const b of f.blocchi) for (const x of b.corpo?.rich_text ?? []) x.plain_text ??= x.text?.content
  const e = await notion.sincronizza(cfg.leggi().notion!)
  const letti = e.docs.map(d => d.id)
  assert.ok(letti.includes(`notion:${MADRE}`), 'la pagina madre è sua: si legge')
  assert.ok(letti.includes(`notion:${ALTRA}`))
  assert.ok(!letti.includes(`notion:${r.id}`), 'la pagina di Myynd non torna come fonte')
  assert.ok(!e.visti.includes(`notion:${r.id}`), 'e non è fra le viste: se era nell\'indice, ne esce')
})
