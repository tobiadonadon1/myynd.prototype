import * as store from './store.ts'
import * as progetti from './progetti.ts'
import { classificaAttenzione, corpoAttuale } from './rilevanza.ts'
import { nominaAmbito } from './ambiti-memoria.ts'

export type NodoConoscenza = store.NodoMappa & {
  autore: string | null
  estratto: string
  progetti: Pick<progetti.Progetto, 'id' | 'nome' | 'obiettivo' | 'stato'>[]
  attenzione: 'feed' | 'brief' | 'ignora'
  motivoAttenzione: string
  feedback: 'fatto' | 'scartato' | null
}

/** Related projects are an identity claim, not a topical search. Goal words
 * such as "site", "offers" and "live" cannot establish that relationship. */
function nominaProgetto(testo: string, nome: string): boolean {
  const dominio = nome.trim().match(/^(?:https?:\/\/)?(?:www\.)?([\p{L}\p{N}](?:[\p{L}\p{N}.-]*\.)[\p{L}]{2,})\/?$/iu)?.[1]
  if (!dominio) return nominaAmbito(testo, nome)
  const letterale = dominio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // A billing address or a lookalike hostname does not prove that a receipt
  // belongs to the website project. Exact bare domains and www URLs do.
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_.@-])(?:www\\.)?${letterale}(?![\\p{L}\\p{N}_-]|\\.[\\p{L}\\p{N}_-])`, 'iu').test(testo)
}

function collegamentiConfermati(): Map<string, Set<string>> {
  const righe = store.default.prepare(`SELECT DISTINCT doc, progetto FROM compiti
    WHERE doc IS NOT NULL AND progetto IS NOT NULL AND sparito IS NULL
      AND (origine IN ('mano', 'feed', 'voce', 'chat', 'conversazione')
        OR stato = 'fatto' OR chiesto IS NOT NULL)`).all() as { doc: string; progetto: string }[]
  const out = new Map<string, Set<string>>()
  for (const r of righe) {
    const ids = out.get(r.doc) ?? new Set<string>()
    ids.add(r.progetto); out.set(r.doc, ids)
  }
  return out
}

/** The map is knowledge, not an inbox. Old or dismissed sources remain
 * inspectable; relevance and explicit feedback explain their current role. */
export function mappa(tetto = 2600, adesso = Date.now()): { nodi: NodoConoscenza[]; archi: store.ArcoMappa[] } {
  const grafo = store.mappa(tetto)
  const documenti = new Map(grafo.nodi.flatMap(n => {
    const d = store.documento(n.id)
    return d ? [[d.id, d] as const] : []
  }))
  const feedback = store.feedbackAttenzione([...documenti.values()])
  const registrati = progetti.perContesto(true)
  const collegamenti = collegamentiConfermati()
  return {
    ...grafo,
    nodi: grafo.nodi.map(n => {
      const d = documenti.get(n.id)
      if (!d) return { ...n, autore: null, estratto: '', progetti: [], attenzione: 'ignora', motivoAttenzione: 'fonte_non_disponibile', feedback: null }
      const testo = `${d.titolo}\n${corpoAttuale(d).slice(0, 12000)}`
      const suoi = registrati.filter(p => collegamenti.get(d.id)?.has(p.id) || nominaProgetto(testo, p.nome))
      const f = feedback.get(d.id)
      const attenzione = classificaAttenzione(d, { adesso, progettoAttivo: suoi.some(p => p.stato === 'attivo') })
      return {
        ...n, autore: d.autore ?? null, estratto: corpoAttuale(d).replace(/\s+/g, ' ').slice(0, 400),
        progetti: suoi.map(({ id, nome, obiettivo, stato }) => ({ id, nome, obiettivo, stato })),
        attenzione: f ? 'ignora' : attenzione.destinazione,
        motivoAttenzione: f ? `feedback_${f.stato}` : attenzione.motivo,
        feedback: f?.stato ?? null
      }
    })
  }
}
