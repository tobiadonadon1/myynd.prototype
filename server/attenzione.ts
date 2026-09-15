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

/**
 * Perché il feed è vuoto, in numeri.
 *
 * «Non ho trovato niente da segnalare» detto e basta è la frase che gli fa
 * chiudere l'app: con diciotto cose aperte in lista non ci crede, e ha
 * ragione a non crederci. Quello che è vero è che dei documenti guardati
 * quasi tutti sono fuori dalla finestra, in serie, o già passati di qui. Si
 * conta, e la schermata lo dice: «di 225 documenti, 213 più vecchi di una
 * settimana, 8 in serie, 1 già visto» è una risposta; «niente» no.
 */
export type PercheVuoto = { guardati: number; candidati: number; vecchi: number; inSerie: number; letti: number; giaVisti: number; aperti: number }
export function percheVuoto(adesso = Date.now()): PercheVuoto {
  const docs = store.recenti(300)
  const giaVisti = store.docsSulFeed(docs.map(d => d.id))
  // e quante cose ha già in lista: «niente di nuovo» non vuol dire «niente da fare»
  const conto: PercheVuoto = { guardati: docs.length, candidati: 0, vecchi: 0, inSerie: 0, letti: 0, giaVisti: 0, aperti: store.elencoCompiti().filter(c => c.stato === 'aperto').length }
  for (const d of docs) {
    const r = classificaAttenzione(d, { adesso, progettoAttivo: progetti.toccaUnProgetto(`${d.titolo}\n${d.corpo.slice(0, 1500)}`, progetti.elenco('attivo')) })
    if (r.destinazione === 'feed') { if (giaVisti.has(d.id)) conto.giaVisti++; else conto.candidati++ }
    else if (r.motivo === 'fonte_non_recente') conto.vecchi++
    else if (r.motivo === 'posta_in_serie' || r.motivo === 'aggiornamento_di_servizio') conto.inSerie++
    else if (r.motivo === 'letta_senza_richiesta' || r.motivo === 'gia_inviato') conto.letti++
  }
  return conto
}
