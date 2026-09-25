import * as store from './store.ts'
import * as progetti from './progetti.ts'
import { leggi } from './config.ts'
import { projectInitiatives } from './project-initiative.ts'
import { classificaAttenzione, validaVoceFeed } from './rilevanza.ts'
import { eProposta, normalizzata, testoDelProgetto } from './priorita.ts'
import { nominaAmbito } from './ambiti-memoria.ts'
import * as riferimento from './riferimento.ts'
import { pillolaDi } from './data-carta.ts'
import { risposteFuori } from './feed-dati.ts'

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

/** Una carta come la legge la pagina: la riga del feed più quello che si calcola a ogni caricamento. */
export type VoceInPagina = Record<string, unknown> & { id: string; titolo: string; urgenza: string | null; risposta: string | null; progetto: string | null; doc: string | null; fonte: string | null }

/** Apply the same admission rules to old cached cards as to a new reading.
 * Keep the stored evidence and feedback intact; this is only a view. */
export function feedAttuale(adesso = Date.now()): VoceInPagina[] {
  const preparati = new Set(store.elencoCompiti().filter(c => c.origine === 'iniziativa').map(c => c.doc))
  // le righe con i campi che la pagina legge sempre: l'id, il titolo, la nascita
  type Riga = Record<string, string | null> & { id: string; titolo: string; quando: string; tipo: string; offerta: string | null }
  const voci = (store.elencoFeed('aperto') as Riga[]).filter(v => !preparati.has(v.doc))
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
  /*
   * P2 · quello che si legge a ogni caricamento: la pillola relativa a oggi
   * («Domani 9:30» il lunedì, «Oggi 9:30» il martedì: sul disco è scritta
   * assoluta), e se ha già risposto dalla sua posta (`risposta`: la carta
   * resta aperta, la pagina lo dice con una pastiglia, la chiude lui).
   */
  const oggi = new Date(adesso)
  const fuori = risposteFuori(voci.map(v => ({ id: v.id, doc: v.doc, contesto: v.contesto, quando: v.quando })))
  const vista = (v: Record<string, string | null>) => ({ urgenza: pillolaDi(v.urgenza, v.quando ?? '', oggi) || null, risposta: fuori.get(v.id!)?.quando ?? null })
  /*
   * Le carte nate dalla memoria di un progetto o dal riferimento (P2):
   * l'istantanea porta la riga citata, e la carta resta finché il progetto
   * è attivo e quella riga c'è ancora. Il testo di ogni progetto si legge una
   * volta per chiamata. Le proposte di prima, senza documento e senza questa
   * istantanea, tengono l'esenzione di sempre: scadono da sole.
   */
  const testi = new Map<string, string>()
  const testoDi = (id: string) => { if (!testi.has(id)) testi.set(id, normalizzata(testoDelProgetto(id))); return testi.get(id)! }
  const righeRif = riferimento.leggi().testo.split('\n')
  const nomiDi = (id: string) => {
    const p = progetti.trova(id)
    const altri = [...riferimento.alias()].filter(([, x]) => x === id).map(([n]) => n)
    return p ? [p.nome, ...p.alias, ...altri] : altri
  }
  const daMemoria = (v: Record<string, string | null>): { fonte: 'memoria' | 'riferimento'; progetto: string; prova: string } | null => {
    if (!v.contesto) return null
    try {
      const c = JSON.parse(v.contesto) as { fonte?: unknown; progetto?: unknown; prova?: unknown }
      if ((c.fonte === 'memoria' || c.fonte === 'riferimento') && typeof c.progetto === 'string' && typeof c.prova === 'string') return { fonte: c.fonte, progetto: c.progetto, prova: c.prova }
    } catch { /* un'istantanea storta è un'istantanea di documento, non di memoria */ }
    return null
  }
  const reggeAncora = (m: { fonte: 'memoria' | 'riferimento'; progetto: string; prova: string }) => {
    if (progetti.trova(m.progetto)?.stato !== 'attivo') return false
    const cercata = normalizzata(m.prova)
    if (m.fonte === 'memoria') return testoDi(m.progetto).includes(cercata)
    const nomi = nomiDi(m.progetto)
    return righeRif.some(r => normalizzata(r).includes(cercata) && nomi.some(n => nominaAmbito(r, n)))
  }
  return voci.flatMap((v): VoceInPagina[] => {
    const d = v.doc ? docs.get(v.doc) : null
    const m = daMemoria(v)
    if (m) {
      if (!reggeAncora(m)) return []
      return [{ ...v, ...vista(v), progetto: m.progetto, doc: null, fonte: m.fonte, fonteTitolo: null, fonteQuando: null, fonteAutore: null }]
    }
    // Una priorità proposta da Myynd non nasce da una richiesta in un
    // documento recente: nasce dal quadro. Le regole della fonte non la
    // riguardano, e un documento vecchio o assente non la toglie di mezzo.
    if (eProposta(v)) return [{ ...v, ...vista(v), progetto: progettoDi(v), doc: d?.id ?? null, fonte: d?.fonte ?? null, fonteTitolo: d?.titolo ?? null, fonteQuando: d?.quando ?? null, fonteAutore: d?.autore ?? null }]
    if (!d || !pertinente(d, adesso) || ignorati.has(d.id) || !validaVoceFeed(v, d, { richiediProva: false })) return []
    return [{ ...v, ...vista(v), progetto: progettoDi(v), doc: d.id, fonte: d.fonte, fonteTitolo: d.titolo, fonteQuando: d.quando ?? null, fonteAutore: d.autore ?? null }]
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
