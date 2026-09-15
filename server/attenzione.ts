import * as store from './store.ts'
import * as progetti from './progetti.ts'
import { leggi } from './config.ts'
import { classificaAttenzione, validaVoceFeed } from './rilevanza.ts'

function pertinente(d: store.Documento, adesso: number) {
  return classificaAttenzione(d, {
    adesso,
    progettoAttivo: progetti.toccaUnProgetto(`${d.titolo}\n${d.corpo.slice(0, 1500)}`, progetti.elenco('attivo'))
  }).destinazione === 'feed'
}

/** Apply the same admission rules to old cached cards as to a new reading.
 * Keep the stored evidence and feedback intact; this is only a view. */
export function feedAttuale(adesso = Date.now()) {
  const voci = store.elencoFeed('aperto')
  const docs = new Map(voci.flatMap(v => {
    const d = v.doc ? store.documento(v.doc) : null
    return d ? [[d.id, d] as const] : []
  }))
  const ignorati = store.docsIgnoratiDalFeed([...docs.values()])
  return voci.flatMap(v => {
    const d = v.doc ? docs.get(v.doc) : null
    if (!d || !pertinente(d, adesso) || ignorati.has(d.id) || !validaVoceFeed(v, d, { richiediProva: false })) return []
    return [{ ...v, doc: d.id, fonte: d.fonte, fonteTitolo: d.titolo, fonteQuando: d.quando ?? null, fonteAutore: d.autore ?? null }]
  })
}

/** User-owned tasks stay on the list. Only untouched suggestions created by
 * the Brief are re-evaluated; moving, editing or delegating one adopts it. */
export function compitiAttuali(adesso = Date.now()): (store.Compito & { puoInviare: boolean })[] {
  const compiti = store.elencoCompiti()
  const fonti = compiti.flatMap(c => c.origine === 'punto' && c.doc ? store.documento(c.doc) ?? [] : [])
  const ignorati = store.docsIgnoratiDalFeed(fonti)
  return compiti.filter(c => {
    if (c.origine !== 'punto' || c.stato !== 'aperto' || c.versione > 1) return true
    const d = c.doc ? store.documento(c.doc) : null
    return !!d && !ignorati.has(d.id) && pertinente(d, adesso) && validaVoceFeed({
      titolo: c.testo, testo: c.nota ?? '', perche: (c.nota ?? '').slice(0, 200)
    }, d, { richiediProva: false })
  }).map(c => ({ ...c, puoInviare: !!leggi().posta }))
}
