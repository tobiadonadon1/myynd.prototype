// Notion. Serve un token di integrazione interna (ntn_…) e le pagine devono
// essere condivise con l'integrazione, altrimenti l'API non le vede.

import { Client } from '@notionhq/client'
import type { ConfigNotion } from '../config.ts'
import type { Documento } from '../store.ts'

function titolo(p: any): string {
  const props = p.properties ?? {}
  for (const v of Object.values<any>(props)) {
    if (v?.type === 'title' && Array.isArray(v.title) && v.title.length) {
      return v.title.map((t: any) => t.plain_text).join('').trim() || '(senza titolo)'
    }
  }
  return '(senza titolo)'
}

/** Appiattisce i blocchi di una pagina in testo semplice. */
async function testoPagina(notion: Client, pageId: string, profondita = 0): Promise<{ testo: string; completo: boolean }> {
  if (profondita > 2) return { testo: '', completo: true }
  let righe: string[] = []
  let completo = true
  let cursore: string | undefined
  do {
    let r
    try {
      r = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursore, page_size: 100 })
    } catch {
      // pagina letta a metà: non deve sostituire una versione completa
      completo = false
      break
    }
    for (const b of r.results as any[]) {
      const t = b[b.type]
      const rt = t?.rich_text
      if (Array.isArray(rt) && rt.length) righe.push(rt.map((x: any) => x.plain_text).join(''))
      if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') {
        const dentro = await testoPagina(notion, b.id, profondita + 1)
        if (dentro.testo) righe.push(dentro.testo)
        if (!dentro.completo) completo = false
      }
    }
    cursore = r.has_more ? (r.next_cursor ?? undefined) : undefined
  } while (cursore)
  return { testo: righe.join('\n').trim(), completo }
}

export async function prova(c: ConfigNotion): Promise<{ ok: true; pagine: number } | { ok: false; errore: string }> {
  try {
    const notion = new Client({ auth: c.token })
    const r = await notion.search({ page_size: 5 })
    return { ok: true, pagine: r.results.length }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    if (/unauthorized|API token is invalid/i.test(m)) return { ok: false, errore: 'Token non valido.' }
    if (/restricted/i.test(m)) return { ok: false, errore: "L'integrazione non ha accesso a nessuna pagina." }
    return { ok: false, errore: m }
  }
}

/**
 * `visti` è la riga che impedisce a una lettura parziale di cancellare roba vera.
 *
 * Una pagina che si legge a metà si salta — giusto, e il commento più sotto lo
 * dice: «meglio tenere quella vecchia intera». Solo che saltarla la teneva
 * fuori da `docs`, e `docs` è esattamente l'elenco che `riconcilia` usa per
 * decidere chi è ancora vivo. Quindi la pagina vecchia e intera non veniva
 * tenuta affatto: veniva cancellata dall'indice, cioè l'esatto contrario di
 * quello che c'era scritto — e in silenzio, perché una pagina che sparisce
 * dall'indice non lascia nessuna traccia da nessuna parte.
 *
 * `visti` dice «questa esiste ancora, anche se stavolta non l'ho riletta».
 */
export type EsitoNotion = { docs: Documento[]; parziali: number; interrotto: boolean; visti: string[] }

export async function sincronizza(c: ConfigNotion): Promise<EsitoNotion> {
  const notion = new Client({ auth: c.token })
  const docs: Documento[] = []
  const visti: string[] = []
  let parziali = 0
  let cursore: string | undefined

  do {
    let r: any
    try {
      r = await notion.search({
        filter: { property: 'object', value: 'page' },
        start_cursor: cursore,
        page_size: 50
      })
    } catch {
      // un errore a metà elenco non deve buttare via quello che ho già
      return { docs, parziali, interrotto: true, visti }
    }
    for (const p of r.results as any[]) {
      if (p.object !== 'page') continue
      // esiste: qualunque cosa succeda dopo, non è sparita da Notion
      visti.push(`notion:${p.id}`)
      let letto: { testo: string; completo: boolean }
      try {
        letto = await testoPagina(notion, p.id)
      } catch {
        parziali++
        continue
      }
      const corpo = letto.testo
      // una pagina letta a metà la salto: meglio tenere quella vecchia intera
      if (!corpo || !letto.completo) { if (corpo) parziali++; continue }
      docs.push({
        id: `notion:${p.id}`,
        fonte: 'notion',
        tipo: 'pagina',
        titolo: titolo(p),
        corpo: corpo.slice(0, 20_000),
        autore: null,
        percorso: p.url ?? null,
        quando: p.last_edited_time ?? null,
        gruppo: 'note'
      })
      // fermarsi al tetto è una lettura parziale, non una lettura finita
      if (docs.length >= 800) return { docs, parziali, interrotto: true, visti }
    }
    cursore = r.has_more ? r.next_cursor : undefined
  } while (cursore)

  return { docs, parziali, interrotto: false, visti }
}
