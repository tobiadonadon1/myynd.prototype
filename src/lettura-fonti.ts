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
import { genereDi } from '../server/generi.ts'
import { contaGenere, lettiFinora } from './conta-fonti.ts'

/**
 * In coda, in lettura, letta, letta a metà, o non letta.
 *
 * `avviso` è una fonte che ha risposto ma non tutta: una cartella del Mac che
 * non si apre, una cartella di posta caduta, un canale di Slack. Non è verde,
 * perché il verde vuol dire «fatto», e non è rosso, perché qualcosa è entrato.
 * Con zero documenti, invece, è una fonte non letta: «✓ 0 documenti · 1
 * cartella senza permessi» era un successo solo nel colore.
 */
export type StatoRiga = 'attesa' | 'leggo' | 'fatto' | 'avviso' | 'guaio'
export type RigaLettura = {
  id: string; stato: StatoRiga; testo: string
  /** L'ultimo avanzamento di questa fonte: a lettura finita la riga si riscrive con quanti documenti ha davvero. */
  ultimo?: Record<string, unknown>
}

/**
 * Il pezzo di una riga di avanzamento che viene dopo il nome della fonte.
 *
 * Stava tutto dentro `rigaSincronizzazione`, attaccato al nome: qui il nome
 * sta già accanto all'icona, e ripeterlo in ogni riga sarebbe leggerlo due
 * volte. `rigaSincronizzazione` lo rimette davanti, e dice le stesse cose.
 */
/**
 * `breve` (il primo avvio, P4): solo il conto, quanto manca della posta e i
 * guasti. Il conto porta il nome di quello che è: «312 email», «42 eventi»,
 * «1.204 file», non «documenti».
 */
export function dettaglioSincronizzazione(m: Record<string, unknown>, conConteggio = true, breve = false): string {
  const en = lingua() === 'en'
  const genere = genereDi(String(m.fase ?? ''))
  // una fonte andata storta porta la sua frase: «calendario · guaio» non diceva niente
  if (m.stato === 'guaio') return t(String(m.errore ?? 'Non ce l’ha fatta.'))
  // con i numeri si compone qui: «40 di 120 messaggi» scritto dal server non si traduce
  if (m.stato !== 'fatto' && typeof m.fatti === 'number') {
    if (typeof m.tot === 'number') return `${m.fatti} ${en ? 'of' : 'di'} ${m.tot} ${en ? 'messages' : 'messaggi'}`
    return contaGenere(genere, m.fatti)
  }
  if (m.stato !== 'fatto') return t(String(m.stato ?? ''))
  const parti = conConteggio ? [contaGenere(genere, Number(m.documenti ?? 0))] : []
  // Calendario del Mac chiuso: un giro di sottofondo non lo apre, e lo dice
  if (m.saltata) parti.push(t('In pausa finché Calendario è chiuso'))
  if (breve) {
    const r = m.resto as { letti?: number; totale?: number; aGiorno?: boolean } | undefined
    if (r && !r.aGiorno && typeof r.letti === 'number') parti.push(lettiFinora(r.letti, r.totale))
    if (elenco(m.falliti)) parti.push(`${(m.falliti as unknown[]).length} ${en ? 'unreadable' : 'illeggibili'}`)
    const dirs = (m.illeggibili as string[] | undefined) ?? []
    if (dirs.length) parti.push(dirs.length === 1 ? (en ? '1 folder would not open' : '1 cartella non si apre')
      : `${dirs.length} ${en ? 'folders would not open' : 'cartelle non si aprono'}`)
    const cadute = (m.cartelleFallite as string[] | undefined) ?? []
    if (cadute.length) parti.push(frasi.cartelleNonLette(cadute.length))
    return parti.join(' · ')
  }
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
  else if (typeof resto?.letti === 'number') parti.push(lettiFinora(resto.letti, resto.totale))
  else if (m.troncato) parti.push(en ? 'cap reached' : 'tetto raggiunto')
  if (m.interrotto) parti.push(en ? 'interrupted by Notion' : 'interrotto da Notion')
  const dirs = (m.illeggibili as string[] | undefined) ?? []
  // «senza permessi» diceva il perché, e non sempre è quello: anche una
  // cartella sparita o un disco staccato non si aprono
  if (dirs.length) parti.push(dirs.length === 1 ? (en ? '1 folder would not open' : '1 cartella non si apre')
    : `${dirs.length} ${en ? 'folders would not open' : 'cartelle non si aprono'}`)
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
const NON_RIGHE = new Set(['lavoro', 'desktop-remoto', 'inizio'])

/** Una riga in coda per ogni fonte che si sta per leggere, nell'ordine dato. */
export function iniziaLettura(ids: string[]): RigaLettura[] {
  return [...new Set(ids)].map(id => ({ id, stato: 'attesa', testo: '' }))
}

const elenco = (v: unknown) => Array.isArray(v) && v.length > 0

/**
 * Una fonte letta ma non tutta: gli stessi segni che il server usa per dire
 * «letta solo in parte» nella riga fissa del feed (vedi `motivoLettura` in
 * `server/lettura-feed.ts`). I conteggi (`falliti: 3` file su ottanta) sono
 * la norma di un disco vero e non contano; gli elenchi sì.
 */
export function lettaAMeta(m: Record<string, unknown>): boolean {
  return elenco(m.falliti) || elenco(m.illeggibili) || elenco(m.cartelleFallite) || !!m.interrotto
}

/**
 * Un avanzamento, dentro la sua riga.
 *
 * Un avanzamento di una fonte che non ha una riga (X, che si accende da sola e
 * non ha una scheda) non aggiunge niente: le righe sono quelle che la persona
 * ha collegato, e basta. Una fonte scollegata mentre si leggeva esce dalle
 * righe: non c'è più niente da dire su di lei.
 */
export function avanzaLettura(righe: RigaLettura[], m: Record<string, unknown>): RigaLettura[] {
  const id = String(m.fase ?? '')
  if (NON_RIGHE.has(id) || !righe.some(r => r.id === id)) return righe
  if (m.stato === 'scollegata') return righe.filter(r => r.id !== id)
  if (m.stato === 'fatto') {
    /*
     * Quanti documenti ha, non quanti ne ha riscaricati: la lettura salta
     * quello che non è cambiato, e il Mac fermo diceva «✓ 0 documenti».
     * Quelli uguali a prima stanno nel numero, e non si ripetono accanto.
     */
    const visti = { ...m, documenti: Number(m.documenti ?? 0) + Number(m.invariati ?? 0) + Number(m.invariate ?? 0) + Number(m.giaLetti ?? 0), giaLetti: 0, invariate: 0 }
    const niente = !visti.documenti
    const stato: StatoRiga = lettaAMeta(m) ? (niente ? 'guaio' : 'avviso') : 'fatto'
    return righe.map(r => r.id === id ? { id, stato, testo: dettaglioSincronizzazione(visti, stato !== 'guaio'), ultimo: visti } : r)
  }
  const stato: StatoRiga = m.stato === 'guaio' ? 'guaio' : 'leggo'
  return righe.map(r => r.id === id ? { id, stato, testo: dettaglioSincronizzazione(m), ultimo: m } : r)
}

/**
 * La lettura è finita: quello che è rimasto in coda è letto lo stesso.
 *
 * Una fonte che non manda niente (WhatsApp, che si riempie da sé quando
 * arrivano i messaggi, o un computer che su un server non si legge da qui)
 * non è una fonte andata storta. Resta in coda solo perché non ha niente da
 * dire, e alla fine si dice quanti documenti ha, come la sua scheda.
 *
 * E una fonte letta dice quanti documenti ha, non quanti ne ha riletti: la
 * lettura è incrementale, e il Mac che non era cambiato diceva «✓ 0
 * documenti» accanto a cinque documenti veri. Quello che non si è riletto
 * perché uguale («30 già letti») è dentro il totale, e non si ripete.
 */
export function chiudiLettura(righe: RigaLettura[], documenti: (id: string) => number | undefined, o: { vuoteInCoda?: boolean } = {}): RigaLettura[] {
  return righe.map(r => {
    const n = documenti(r.id)
    // dopo aver aspettato invano il proprio turno, una fonte senza documenti non si è letta: resta in coda, mai «✓ 0»
    if (o.vuoteInCoda && aperta(r) && !(n && n > 0)) return { ...r, stato: 'attesa', testo: '' }
    if (aperta(r)) return { ...r, stato: 'fatto', testo: contaGenere(genereDi(r.id), n ?? 0), ultimo: { fase: r.id, stato: 'fatto', documenti: n ?? 0 } }
    if (r.stato === 'fatto' && r.ultimo && n !== undefined) {
      const ultimo = { ...r.ultimo, documenti: n, giaLetti: 0, invariate: 0 }
      return { ...r, testo: dettaglioSincronizzazione(ultimo), ultimo }
    }
    return r
  })
}

/** Quante righe non si sono lette. */
export const nonLette = (righe: RigaLettura[] | null) => righe?.filter(r => r.stato === 'guaio').length ?? 0
/** Quante righe chiedono di essere guardate: non lette, o lette a metà. Con una sola, non si va avanti da soli. */
export const daGuardare = (righe: RigaLettura[] | null) => righe?.filter(r => r.stato === 'guaio' || r.stato === 'avviso').length ?? 0
/** La riga è ancora aperta: in coda o in lettura. */
export const aperta = (r: RigaLettura) => r.stato === 'attesa' || r.stato === 'leggo'

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
/*
 * Il resto della prima lettura (P4) cede il passo solo dopo la fonte che ha
 * in mano, e una passata del Mac o di novanta giorni di posta dura minuti:
 * dopo due minuti le righe restavano «In coda» per sempre. Quando il 409
 * dice `coda` (è il resto, e ha già promesso di fermarsi) si aspetta fino a
 * venti minuti: la lettura sua parte appena il resto molla la serratura.
 */
export async function leggiAlProprioTurno(
  leggi: () => Promise<void>,
  attendi: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
  tentativi = 80,
  tentativiInCoda = 800
): Promise<void> {
  let altri = 0, dietroAlResto = 0
  for (;;) {
    try { return await leggi() }
    catch (e) {
      if (!(e instanceof Error) || e.message !== GIA_IN_CORSO) throw e
      const resto = (e as Error & { coda?: boolean }).coda === true
      if (resto ? dietroAlResto++ >= tentativiInCoda : altri++ >= tentativi) throw e
      await attendi(1500)
    }
  }
}

// — una lettura sola per tutta l'app —

/**
 * Quello che sa chiunque mostri una lettura: la pagina delle Fonti, il
 * pannello delle connessioni, il primo avvio.
 */
export type Lettura = {
  /** Una riga per fonte dell'ultima lettura di tutte: nessuna, finché non ce n'è stata una. */
  righe: RigaLettura[] | null
  /** Si sta leggendo, o c'è una lettura in fila. */
  occupato: boolean
  /** Cosa si sta leggendo adesso: `tutte`, l'id di una fonte sola, o niente. */
  inCorso: string | null
  /** L'ultima riga di avanzamento, con il nome della fonte: per l'indicatore in basso. */
  riga: string | null
  /** L'ultimo guaio che non è di una fonte (la rete, il server), già tradotto. */
  guaio: string | null
  /** L'ultimo «fatto» del computer: i conti della lettura che la sua scheda sa spiegare. */
  fineDesktop: Record<string, unknown> | null
  /** Quante letture sono finite: chi mostra lo stato lo rilegge quando cambia. */
  finite: number
}

export type DipendenzeLettura = {
  sincronizza: (su: (m: Record<string, unknown>) => void, fonte?: string) => Promise<void>
  /** Le fonti collegate adesso che si leggono, con i documenti che hanno. */
  collegate: () => Promise<Record<string, number>>
  /** La riga di avanzamento completa, con il nome della fonte davanti. */
  riga?: (m: Record<string, unknown>) => string
  attendi?: (ms: number) => Promise<void>
}

/**
 * Una lettura alla volta, e una sola verità su cosa sta succedendo.
 *
 * Il pannello delle connessioni leggeva per conto suo e la pagina delle Fonti
 * per conto suo: premere «Rileggi tutto» mentre il pannello leggeva dava «una
 * lettura è già in corso», le schede restavano indietro, e «Rileggi» su una
 * fonte era premibile durante la lettura dell'altro. Adesso passano tutti da
 * qui. Una lettura chiesta mentre un'altra gira si mette in fila invece di
 * perdersi (una fonte collegata durante «Rileggi» su un'altra si legge appena
 * finito), e più richieste di leggere tutto mentre si aspetta valgono una.
 */
export function creaLettura(d: DipendenzeLettura) {
  let stato: Lettura = { righe: null, occupato: false, inCorso: null, riga: null, guaio: null, fineDesktop: null, finite: 0 }
  const ascoltatori = new Set<(s: Lettura) => void>()
  const metti = (p: Partial<Lettura>) => {
    stato = { ...stato, ...p }
    for (const f of [...ascoltatori]) f(stato)
  }
  let fila: Promise<unknown> = Promise.resolve()
  let inFila = 0
  let tutteInAttesa: Promise<RigaLettura[]> | null = null

  const accoda = <T>(lavoro: () => Promise<T>): Promise<T> => {
    inFila++
    metti({ occupato: true })
    const p = fila.then(lavoro).finally(() => {
      inFila--
      metti({ finite: stato.finite + 1, ...(inFila ? {} : { occupato: false, inCorso: null, riga: null }) })
    })
    fila = p.catch(() => {})
    return p
  }
  const ascolta = (m: Record<string, unknown>) => {
    if (m.fase === 'fine' || m.fase === 'errore' || m.fase === 'inizio') return
    if (d.riga) metti({ riga: d.riga(m) })
    if (m.fase === 'desktop' && m.stato === 'fatto') metti({ fineDesktop: m })
  }
  const messaggio = (e: unknown) => e instanceof Error ? e.message : String(e)

  const giroTutte = async (ids?: string[]): Promise<RigaLettura[]> => {
    metti({ inCorso: 'tutte', guaio: null, riga: null })
    let prima: Record<string, number>
    try { prima = await d.collegate() } catch (e) { metti({ guaio: t(messaggio(e)) }); return stato.righe ?? [] }
    let r = iniziaLettura(ids ?? Object.keys(prima))
    const mostra = (nuove: RigaLettura[]) => { r = nuove; metti({ righe: nuove }) }
    mostra(r)
    let guasto = ''
    /** Due minuti in fila dietro un'altra lettura, senza mai leggere: le righe vuote restano in coda. */
    let senzaTurno = false
    /*
     * Le fonti che la lettura visita davvero (P4): chi si attacca a una
     * lettura già partita riceve l'elenco di quella, e una fonte collegata
     * dopo non c'è. La sua riga resta «In coda», e alla fine si legge ancora
     * una volta per lei: mai «✓ 0» per una fonte che non si è letta.
     */
    let visitate: string[] | null = null
    /*
     * La seconda lettura, per le righe rimaste «In coda», rilegge tutto (è una
     * lettura di tutte le fonti: così fa anche la prima pagina con la posta).
     * Le righe già chiuse non tornano indietro: una fonte letta non torna a
     * «apro l'agenda» mentre si aspetta quella che mancava. Il suo conto sì,
     * quando questa lettura la finisce: il Mac riletto per intero ha anche i
     * file più vecchi dei novanta giorni, e la riga dice quanti sono.
     */
    let soloAperte: Set<string> | null = null
    const su = (m: Record<string, unknown>) => {
      if (m.fase === 'inizio') { visitate = Array.isArray(m.fonti) ? m.fonti.map(String) : null; return }
      ascolta(m)
      if (soloAperte && !soloAperte.has(String(m.fase ?? '')) && m.stato !== 'fatto') return
      mostra(avanzaLettura(r, m))
    }
    const fuori = () => { const v: string[] | null = visitate; return v ? r.filter(x => aperta(x) && !v.includes(x.id)) : [] }
    try {
      await leggiAlProprioTurno(() => d.sincronizza(su), d.attendi)
      if (fuori().length) {
        visitate = null
        soloAperte = new Set(r.filter(aperta).map(x => x.id))
        await leggiAlProprioTurno(() => d.sincronizza(su), d.attendi)
      }
    } catch (e) {
      // dopo due minuti di fila dietro a un'altra lettura non è un guasto di
      // nessuna fonte: si guarda com'è l'indice adesso, sotto
      if (messaggio(e) !== GIA_IN_CORSO) guasto = t(messaggio(e))
      else senzaTurno = true
    }
    const dopo = await d.collegate().catch(() => null)
    if (guasto) {
      mostra(r.map(x => aperta(x) ? { ...x, stato: 'guaio', testo: guasto } : x))
      metti({ guaio: guasto })
    } else {
      // una fonte scollegata nel frattempo non ha più una riga
      mostra(chiudiLettura(dopo ? r.filter(x => x.id in dopo) : r, id => dopo?.[id], { vuoteInCoda: senzaTurno }))
    }
    return r
  }

  const giroUna = async (id: string): Promise<void> => {
    metti({ inCorso: id, guaio: null, riga: null })
    try {
      await leggiAlProprioTurno(() => d.sincronizza(m => {
        ascolta(m)
        // se questa fonte ha una riga dall'ultima lettura di tutte, la si aggiorna lì
        if (stato.righe?.some(x => x.id === id)) metti({ righe: avanzaLettura(stato.righe, m) })
      }, id), d.attendi)
    } catch (e) { metti({ guaio: t(messaggio(e)) }) }
  }

  return {
    stato: () => stato,
    /** Iscriversi ai cambi. Torna come disiscriversi. */
    ascolta(f: (s: Lettura) => void): () => void {
      ascoltatori.add(f)
      return () => { ascoltatori.delete(f) }
    },
    /** Leggere tutte le fonti collegate (o queste): in fila se se ne sta leggendo un'altra. */
    leggiTutte(ids?: string[]): Promise<RigaLettura[]> {
      if (tutteInAttesa) return tutteInAttesa
      const p = accoda(() => { tutteInAttesa = null; return giroTutte(ids) })
      tutteInAttesa = p
      return p
    },
    /** Rileggere una fonte sola: anche questa in fila. */
    leggiUna(id: string): Promise<void> { return accoda(() => giroUna(id)) }
  }
}

/**
 * Leggere, poi scegliere: le fonti dell'avvio si salvano solo a lettura finita.
 *
 * Prima si salvavano prima di leggere, e l'avvio passava subito agli
 * estratti: chi ricaricava la pagina a metà lettura (il server smette di
 * cominciare fonti nuove quando la pagina se ne va) atterrava sugli estratti
 * di una lettura mai finita. Adesso l'avvio non sa niente delle fonti finché
 * non sono state lette, e se la lettura non arriva in fondo non si salva
 * niente: si resta sulle schede, con il motivo.
 *
 * Si salvano quelle ancora collegate alla fine, anche se una non si è letta:
 * è stata scelta, e i suoi estratti vengono da quello che c'era.
 */
export async function leggiPoiScegli(
  lettura: { leggiTutte(ids?: string[]): Promise<RigaLettura[]>; stato(): Pick<Lettura, 'guaio'> },
  ids: string[],
  salva: (fonti: string[]) => Promise<void>
): Promise<{ righe: RigaLettura[]; salvate: boolean }> {
  const righe = await lettura.leggiTutte(ids)
  if (lettura.stato().guaio) return { righe, salvate: false }
  await salva(righe.map(r => r.id))
  return { righe, salvate: true }
}
