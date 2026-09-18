import * as store from './store.ts'
import * as progetti from './progetti.ts'
import { leggi } from './config.ts'
import { projectInitiatives } from './project-initiative.ts'
import { classificaAttenzione, validaVoceFeed } from './rilevanza.ts'
import { eProposta } from './priorita.ts'
import { nominaAmbito } from './ambiti-memoria.ts'
import * as riferimento from './riferimento.ts'

function pertinente(d: store.Documento, adesso: number) {
  return classificaAttenzione(d, {
    adesso,
    progettoAttivo: progetti.toccaUnProgetto(`${d.titolo}\n${d.corpo.slice(0, 1500)}`, progetti.elenco('attivo'))
  }).destinazione === 'feed'
}

/**
 * Di quale progetto parla un testo: solo se lo nomina.
 *
 * `tocca` accetta anche due parole dell'obiettivo, e con quello «Review
 * x-engine's posting cycle» finiva sotto Myynd. Qui vale il nome, il nome
 * più lungo per primo («H-Farm audit» batte «H-Farm»), e gli altri nomi
 * delle sue cose scritti nel riferimento («Evermute (everwave)»). Lo usano
 * la prima pagina per le voci e la lista per le righe nate da una voce:
 * «Define a Myynd pilot inside H-Farm» stava in «Il resto» perché la riga
 * nasceva senza progetto.
 */
export function progettoDelTesto(testo: string): string | null {
  const attivi = [...progetti.elenco('attivo')].sort((a, b) => b.nome.length - a.nome.length)
  const trovato = attivi.find(p => nominaAmbito(testo, p.nome))?.id
  if (trovato) return trovato
  // gli altri nomi: quelli scritti nella Memoria e quelli fra parentesi nel riferimento
  for (const [nome, id] of riferimento.alias()) if (nominaAmbito(testo, nome)) return id
  return null
}

/** Apply the same admission rules to old cached cards as to a new reading.
 * Keep the stored evidence and feedback intact; this is only a view. */
export function feedAttuale(adesso = Date.now()) {
  const preparati = new Set(store.elencoCompiti().filter(c => c.origine === 'iniziativa').map(c => c.doc))
  const voci = store.elencoFeed('aperto').filter(v => !preparati.has(v.doc))
  /*
   * Di quale progetto è una voce: la colonna, se chi l'ha scritta lo sapeva
   * (le priorità); altrimenti si guarda se titolo e testo nominano un
   * progetto attivo. È quello che permette alla prima pagina di mettere ogni
   * voce nel blocco del suo progetto invece che in una lista sola.
   */
  // Solo se lo nomina: `tocca` accetta anche due parole dell'obiettivo, e
  // con quello «Review x-engine's posting cycle» finiva sotto Myynd e
  // «H-Brain» sotto H-Farm. Il nome più lungo vince, così «H-Farm audit»
  // batte «H-Farm».
  const progettoDi = (v: Record<string, string | null>) => v.progetto || progettoDelTesto(`${v.titolo}\n${v.testo ?? ''}\n${v.perche ?? ''}`)
  const docs = new Map(voci.flatMap(v => {
    const d = v.doc ? store.documento(v.doc) : null
    return d ? [[d.id, d] as const] : []
  }))
  const ignorati = store.docsIgnoratiDalFeed([...docs.values()])
  return voci.flatMap(v => {
    const d = v.doc ? docs.get(v.doc) : null
    // Una priorità proposta da Myynd non nasce da una richiesta in un
    // documento recente: nasce dal quadro. Le regole della fonte non la
    // riguardano, e un documento vecchio o assente non la toglie di mezzo.
    if (eProposta(v)) return [{ ...v, progetto: progettoDi(v), doc: d?.id ?? null, fonte: d?.fonte ?? null, fonteTitolo: d?.titolo ?? null, fonteQuando: d?.quando ?? null, fonteAutore: d?.autore ?? null }]
    if (!d || !pertinente(d, adesso) || ignorati.has(d.id) || !validaVoceFeed(v, d, { richiediProva: false })) return []
    return [{ ...v, progetto: progettoDi(v), doc: d.id, fonte: d.fonte, fonteTitolo: d.titolo, fonteQuando: d.quando ?? null, fonteAutore: d.autore ?? null }]
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

/** Non-urgent project progress, separate from source-backed feed cards. */
export function iniziativeProgetti() { return projectInitiatives(compitiAttuali()) }
