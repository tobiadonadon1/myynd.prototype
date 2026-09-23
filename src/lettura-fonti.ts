// La lettura di più fonti insieme, una riga per fonte.
//
// La lettura del server arriva come un filo di avanzamenti, uno alla volta e
// di fonti diverse: `{ fase: 'desktop', stato: 'apro le cartelle' }`, poi
// `{ fase: 'desktop', stato: 'fatto', documenti: 5 }`, poi il calendario. Chi
// guarda una riga sola vede passare i nomi e alla fine non sa quale fonte è
// andata e quale no. Qui quel filo diventa una riga per fonte, ognuna col suo
// stato, così la stessa lettura si legge nel primo avvio e nelle Fonti.
//
// Niente React e niente rete: sono conti su una lista, e le prove li
// guardano da Node.

import { frasi, lingua, t } from './lingua.ts'

/** In coda, in lettura, letta, o non letta. */
export type StatoRiga = 'attesa' | 'leggo' | 'fatto' | 'guaio'
export type RigaLettura = { id: string; stato: StatoRiga; testo: string }

/**
 * Il pezzo di una riga di avanzamento che viene dopo il nome della fonte.
 *
 * Stava tutto dentro `rigaSincronizzazione`, attaccato al nome: qui il nome
 * sta già accanto all'icona, e ripeterlo in ogni riga sarebbe leggerlo due
 * volte. `rigaSincronizzazione` lo rimette davanti, e dice le stesse cose.
 */
export function dettaglioSincronizzazione(m: Record<string, unknown>): string {
  const en = lingua() === 'en'
  // una fonte andata storta porta la sua frase: «calendario · guaio» non diceva niente
  if (m.stato === 'guaio') return t(String(m.errore ?? 'Non ce l’ha fatta.'))
  // con i numeri si compone qui: «40 di 120 messaggi» scritto dal server non si traduce
  if (m.stato !== 'fatto' && typeof m.fatti === 'number') {
    if (typeof m.tot === 'number') return `${m.fatti} ${en ? 'of' : 'di'} ${m.tot} ${en ? 'messages' : 'messaggi'}`
    return `${m.fatti} ${en ? 'documents' : 'documenti'}`
  }
  if (m.stato !== 'fatto') return t(String(m.stato ?? ''))
  const parti = [frasi.nDocumenti(String(Number(m.documenti ?? 0)))]
  if (Number(m.tolti)) parti.push(`${Number(m.tolti)} ${en ? 'gone' : 'spariti'}`)
  // la posta che c'era già e non è stata riscaricata: è quello che rende la rilettura leggera
  if (Number(m.giaLetti)) parti.push(`${Number(m.giaLetti)} ${en ? 'already read' : 'già letti'}`)
  if (Number(m.saltati)) parti.push(`${Number(m.saltati)} ${en ? 'code projects skipped' : 'progetti saltati'}`)
  /*
   * Quello che c'era e non è entrato, diviso per quello che è.
   *
   * «66 documenti» su un Mac con dentro dieci anni di lavoro è una riga che
   * sembra un guasto, e non lo è: sono duemilaquattrocento file lasciati
   * fuori apposta. Il totale da solo lasciava aperta la domanda che viene
   * subito dopo — «perché così tanti?» — e la risposta è che il grosso sono
   * foto e video, poi codice, poi roba di app e di sistema.
   */
  if (Number(m.saltatiPerTipo)) {
    const st = (m.saltatiTipi ?? {}) as Record<string, unknown>
    parti.push(frasi.tipiFuori(Number(st.media ?? 0), Number(st.codice ?? 0), Number(st.sistema ?? 0), Number(st.altro ?? 0)))
  }
  if (Number(m.falliti)) parti.push(`${Number(m.falliti)} ${en ? 'unreadable' : 'illeggibili'}`)
  if (Number(m.parziali)) parti.push(`${Number(m.parziali)} ${en ? 'half pages' : 'pagine a metà'}`)
  // le pagine di Notion che non sono cambiate e non si sono riscaricate
  if (Number(m.invariate)) parti.push(`${Number(m.invariate)} ${en ? 'unchanged' : 'invariate'}`)
  /*
   * Le riunioni di Granola senza una parola dentro.
   *
   * Una riunione che parte e finisce senza che nessuno scriva niente resta
   * nel file di Granola, e qui non diventa un documento — giusto, perché non
   * c'è niente da indicizzare. Ma senza questa riga chi ha quaranta riunioni e
   * legge «Granola · 12 documenti» conclude che il collegamento perde roba.
   */
  if (Number(m.vuote)) parti.push(`${Number(m.vuote)} ${en ? 'with no notes' : 'senza note'}`)
  /*
   * «Tetto raggiunto» non diceva la cosa che serve sapere.
   *
   * Ogni giro legge al massimo un tot per fonte, e prima quella riga era tutto
   * quello che si sapeva: chi la leggeva non poteva distinguere «ne mancano
   * dieci» da «ne mancano quattromila», né sapere che il giro dopo riprende da
   * dove si era fermato. Adesso il connettore dice a che punto è, e questa riga
   * lo ripete con i numeri suoi.
   */
  const resto = m.resto as { letti?: number; totale?: number; aGiorno?: boolean } | undefined
  if (resto?.aGiorno) parti.push(en ? 'all in' : 'è tutto dentro')
  else if (typeof resto?.letti === 'number') {
    parti.push(typeof resto.totale === 'number'
      ? `${resto.letti} ${en ? 'of' : 'di'} ${resto.totale} ${en ? 'read so far' : 'letti finora'}`
      : `${resto.letti} ${en ? 'read so far' : 'letti finora'}`)
  } else if (m.troncato) parti.push(en ? 'cap reached' : 'tetto raggiunto')
  if (m.interrotto) parti.push(en ? 'interrupted by Notion' : 'interrotto da Notion')
  const dirs = (m.illeggibili as string[] | undefined) ?? []
  if (dirs.length) parti.push(`${dirs.length} ${en ? 'folders without permission' : 'cartelle senza permessi'}`)
  /**
   * Le cartelle di posta che non si sono aperte.
   *
   * Il server le contava già e le mandava in fondo alla lettura; qui non le
   * leggeva nessuno. Quindi una casella con cinque cartelle di cui tre andate
   * storte diceva «Posta · 40 documenti», identica a una andata bene — e da lì
   * in poi Myynd rispondeva su un terzo della posta convinto di averla tutta.
   * Il modo peggiore di sbagliare: non dice niente, e la risposta sembra buona.
   */
  const kaputt = (m.cartelleFallite as string[] | undefined) ?? []
  if (kaputt.length) parti.push(frasi.cartelleNonLette(kaputt.length))
  return parti.join(' · ')
}

/*
 * Le fasi che non sono una fonte con la sua scheda.
 *
 * Le cartelle di lavoro si leggono dentro il Mac e dicono «fatto» prima di
 * lui: prese per il Mac, la riga diventerebbe verde mentre il Mac sta ancora
 * leggendo. La copia verso un server ospitato viene dopo che il Mac è già
 * letto. Nessuna delle due tocca una riga.
 */
const NON_RIGHE = new Set(['lavoro', 'desktop-remoto'])

/** Una riga in coda per ogni fonte che si sta per leggere, nell'ordine dato. */
export function iniziaLettura(ids: string[]): RigaLettura[] {
  return [...new Set(ids)].map(id => ({ id, stato: 'attesa', testo: '' }))
}

/**
 * Un avanzamento, dentro la sua riga.
 *
 * Un avanzamento di una fonte che non ha una riga (X, che si accende da sola e
 * non ha una scheda) non aggiunge niente: le righe sono quelle che la persona
 * ha collegato, e basta.
 */
export function avanzaLettura(righe: RigaLettura[], m: Record<string, unknown>): RigaLettura[] {
  const id = String(m.fase ?? '')
  if (NON_RIGHE.has(id) || !righe.some(r => r.id === id)) return righe
  const stato: StatoRiga = m.stato === 'guaio' ? 'guaio' : m.stato === 'fatto' ? 'fatto' : 'leggo'
  return righe.map(r => r.id === id ? { id, stato, testo: dettaglioSincronizzazione(m) } : r)
}

/**
 * La lettura è finita: quello che è rimasto in coda è letto lo stesso.
 *
 * Una fonte che non manda niente (WhatsApp, che si riempie da sé quando
 * arrivano i messaggi, o un computer che su un server non si legge da qui)
 * non è una fonte andata storta. Resta in coda solo perché non ha niente da
 * dire, e alla fine si dice quanti documenti ha, come la sua scheda.
 */
export function chiudiLettura(righe: RigaLettura[], documenti: (id: string) => number | undefined): RigaLettura[] {
  return righe.map(r => r.stato === 'attesa' || r.stato === 'leggo'
    ? { ...r, stato: 'fatto', testo: frasi.nDocumenti(String(documenti(r.id) ?? 0)) }
    : r)
}

/** Quante righe non si sono lette. */
export const nonLette = (righe: RigaLettura[] | null) => righe?.filter(r => r.stato === 'guaio').length ?? 0

/** La lettura del server è già in corso per questo conto: la frase del 409 di `/api/sincronizza`. */
export const GIA_IN_CORSO = 'Una lettura è già in corso.'

/**
 * Leggere, e se sta già leggendo aspettare il proprio turno.
 *
 * Ogni dieci minuti il server rilegge da sé, e la vedetta rilegge quando una
 * cartella cambia: premere «Leggi» in quel momento rispondeva «una lettura è
 * già in corso», che a chi ha appena collegato tre fonti suona come un guasto.
 * Si aspetta che finisca e si legge: la rilettura è incrementale, e quello
 * che è appena stato letto costa poco. Il tetto è di due minuti, poi la frase
 * arriva com'è.
 */
export async function leggiAlProprioTurno(
  leggi: () => Promise<void>,
  attendi: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
  tentativi = 80
): Promise<void> {
  for (let i = 0; ; i++) {
    try { return await leggi() }
    catch (e) {
      if (!(e instanceof Error) || e.message !== GIA_IN_CORSO || i >= tentativi) throw e
      await attendi(1500)
    }
  }
}
