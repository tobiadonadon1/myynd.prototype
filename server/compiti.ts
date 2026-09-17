import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { withBackgroundWork } from './lavoro-background.ts'
import { verificaBaseRevisione } from './revisioni.ts'
// La delega: quando un compito passa a Myynd.
//
// È il punto in cui la lista smette di essere una lista. Scrivi «mandare il
// preventivo a Rossi» perché devi ricordartelo, e poi ti accorgi che quella
// riga, così com'è, è già un ordine di lavoro completo — perché chi la legge sa
// chi è Rossi, quale preventivo, e come scrivi tu. Non serve riformularla.
//
// Tre cose che questo file tiene ferme, e che sono la ragione per cui esiste
// invece di essere due righe dentro una rotta:
//
//   · Uno alla volta. Non per pudore verso l'API, ma perché ogni delega apre
//     una lettura dell'indice e una risposta lunga: dieci insieme vogliono dire
//     dieci volte l'attesa per tutte. In fila sono più veloci per chi guarda.
//   · Chi aspetta lo sa. La rotta risponde subito, il lavoro va avanti dietro,
//     e chi guarda lo scopre da un flusso — non ricaricando la pagina. È anche
//     il modo in cui la barra dei menù accende il suo punto senza aprire nulla.
//   · Un compito non si perde mai. Se il server muore a metà, all'avvio dopo il
//     compito torna aperto invece di restare per sempre «da Myynd». Meglio una
//     cosa da riaffidare che una che finge di essere in corso.

import * as store from './store.ts'
import * as claude from './claude.ts'
import * as attrezzi from './attrezzi.ts'
import * as memoria from './memoria.ts'
import * as chi from './chi.ts'
import * as cfg from './config.ts'
import * as invio from './invio.ts'
import * as progetti from './progetti.ts'
import { fonteValida } from './iniziativa.ts'
import { salvaBozzaCasella, salvaRevisioneCasella } from './mailbox-drafts.ts'
import { senzaTrattini, soloDomanda } from './testo.ts'
import { feedbackPer, giudica, prossimoPasso, simili, type Giudizio } from './revisione-lavoro.ts'
import * as ordine from './ordine.ts'

export type Evento =
  | { fase: 'preso'; id: string }
  /** Cosa sta facendo adesso su quella riga: cerca, apre, scrive. */
  | { fase: 'lavoro'; id: string; passo: claude.Passo }
  | { fase: 'pronto'; id: string; compito: store.Compito }
  | { fase: 'chiede'; id: string; compito: store.Compito }
  | { fase: 'guaio'; id: string; guaio: string }
  | { fase: 'richiamato'; id: string }
  | { fase: 'cambiato' }
  /** Il feed è cambiato: qualcosa è arrivato, o una voce ha cambiato stato. Si rilegge. */
  | { fase: 'feed' }

/*
 * Ogni ascoltatore sa di chi vuole sentire.
 *
 * Il filo dei compiti è uno per finestra aperta, e le finestre aperte sono di
 * persone diverse: senza questa chiave un `pronto` — con dentro la bozza, che
 * di solito è una email — partiva verso *tutti* i browser collegati, e ognuno
 * lo scartava solo perché non riconosceva l'id. Il testo però era già uscito.
 * Si consegna soltanto a chi ha lo stesso nome di chi sta annunciando.
 */
type Ascoltatore = { f: (e: Evento) => void; di: string | null }
const ascoltatori = new Set<Ascoltatore>()

/** Chi vuole sapere come vanno i compiti affidati — i suoi. Torna come smettere. */
export function ascolta(f: (e: Evento) => void, di: string | null = chi.adesso()): () => void {
  const a: Ascoltatore = { f, di }
  ascoltatori.add(a)
  for (const lavoro of passiAttivi.values()) {
    if (lavoro.di === di) { try { f(lavoro.evento) } catch { /* listener owns errors */ } }
  }
  return () => { ascoltatori.delete(a) }
}

/**
 * «È cambiato qualcosa, rileggi.»
 *
 * Le finestre aperte sono due, e presto saranno due macchine. Chi ha premuto il
 * bottone ha già la lista giusta nella risposta; sono tutti gli *altri* a non
 * saperne niente — spunti una riga nella lista e il numero accanto a «Oggi»
 * nell'altra finestra resta quello di prima finché non ricarichi.
 *
 * Non si manda la lista, si manda il fatto che è cambiata: il destinatario la
 * rilegge da sé. Costa una query locale e toglie di mezzo tutta la categoria di
 * bachi in cui due finestre credono cose diverse.
 */
export function annunciaCambio() {
  annuncia({ fase: 'cambiato' })
}

/**
 * «Il feed è cambiato, rileggi.»
 *
 * Viaggia sullo stesso filo dei compiti, ed è la riga che mancava: la
 * rilettura automatica salvava le voci nuove alle tre di notte e la prima
 * pagina restava quella di ieri finché non si ricaricava — a nessuno
 * arrivava niente. Come per i compiti non si manda la voce, si manda il fatto:
 * chi ascolta rilegge da sé, e solo chi è la stessa persona.
 */
export function annunciaFeed() {
  annuncia({ fase: 'feed' })
}

/**
 * «Questa riga è pronta»: si apre da sola, come una bozza appena scritta.
 *
 * Serve alle automazioni che propongono. Il loro lavoro non passa da `affida()`
 * — non c'è niente da far scrivere al modello, la scelta è già fatta — quindi
 * senza questa riga la proposta nascerebbe chiusa: una riga in più in lista,
 * uguale a tutte le altre, e nessun modo di capire che dentro c'è qualcosa che
 * aspetta solo un sì.
 */
export function annunciaPronto(id: string) {
  const c = store.compito(id)
  if (c) annuncia({ fase: 'pronto', id, compito: c })
}

const passiAttivi = new Map<string, { di: string | null; evento: Extract<Evento, { fase: 'lavoro' }> }>()

function annuncia(e: Evento) {
  const di = chi.adesso()
  if (e.fase === 'lavoro') passiAttivi.set(chiave(e.id, di), { di, evento: e })
  else if ('id' in e) passiAttivi.delete(chiave(e.id, di))
  for (const a of ascoltatori) {
    if (a.di !== di) continue
    // un ascoltatore che esplode non deve fermare gli altri né il lavoro
    try { a.f(e) } catch { /* chi ascolta si arrangia */ }
  }
}

/*
 * Ogni voce porta con sé di chi è.
 *
 * La coda è una sola per tutto il processo, ma i compiti no: con più persone
 * sullo stesso server il giro parte nel contesto di chi ha affidato per primo,
 * e una riga di B messa in fila mentre A stava girando veniva cercata
 * nell'indice di A — non trovata, e lasciata «da Myynd» fino al prossimo
 * riavvio. Qui la persona si segna quando la riga entra, e si rimette prima di
 * lavorarla. Gli id li fa il client, quindi da soli non bastano a distinguere.
 */
type Voce = { utente: string | null; id: string; nativa: boolean; accodato: number }
const coda: Voce[] = []
/**
 * Su cosa sta lavorando adesso, per persona. Una riga alla volta per ciascuno
 * — due bozze della stessa persona insieme si pestano i piedi sul suo indice —
 * ma persone diverse non si aspettano: con una fila sola per tutto il server,
 * la delega di B restava «da Myynd» per i cinque minuti del lavoro di A.
 */
const inCorsoDi = new Map<string, string>()
/** Quanti lavori insieme, in tutto il processo: ogni lavoro è un modello che scrive. */
const LAVORANTI = 2

/** La chiave di una riga: la persona e l'id insieme. */
const chiave = (id: string, utente: string | null = chi.adesso()) => `${utente ?? ''}·${id}`
const inLavoro = (k: string, utente: string | null) => inCorsoDi.get(utente ?? '') === k

/**
 * I compiti che hai richiamato indietro mentre Myynd ci lavorava.
 *
 * Togliere dalla coda non basta: se il lavoro è già partito, la chiamata al
 * modello va avanti comunque e trenta secondi dopo scriverebbe una bozza sopra
 * a un compito che nel frattempo hai ripreso in mano. Qui si segna che il
 * risultato non lo vuoi più, e quando arriva si butta.
 */
const richiamati = new Set<string>()
const interruzioni = new Map<string, AbortController>()

/**
 * Affida un compito a Myynd.
 *
 * Torna subito: il lavoro vero comincia dopo, e chi ha chiamato non deve stare
 * ad aspettarlo. Riaffidare un compito già in coda non lo mette due volte —
 * capita, cliccando due volte, e due bozze per la stessa riga sono un difetto.
 */
export function affida(id: string, modo: string, nativa = true) {
  const c = store.compito(id)
  if (!c) return

  // Lo stesso compito, lo stesso modo, già in fila: non c'è niente da fare.
  // Ma se il modo è *cambiato* — hai chiesto la bozza e adesso vuoi che se ne
  // occupi tutto lui — allora bisogna rifarlo. Prima si usciva e basta, e la
  // colonna nuova si accendeva per un istante per poi tornare indietro da sola:
  // era questo il «a volte non funziona».
  const utente = chi.adesso()
  const k = chiave(id, utente)
  if (c.modo === modo && (coda.some(v => v.id === id && v.utente === utente) || inLavoro(k, utente))) return

  // quello che sta girando adesso non serve più: si butta invece di lasciarlo
  // scrivere una bozza del modo vecchio sopra a quella che stai per chiedere
  if (inLavoro(k, utente)) { richiamati.add(k); interruzioni.get(k)?.abort() }

  const dove = coda.findIndex(v => v.id === id && v.utente === utente)
  if (dove >= 0) coda.splice(dove, 1)

  console.info(`myynd · worker · queued · ${id} · busy=${inCorsoDi.has(utente ?? '')} · native=${nativa}`)
  store.affidaCompito(id, modo)
  coda.push({ utente, id, nativa, accodato: Date.now() })
  gira()
}

/**
 * Il giro: prende dalla fila la prima riga di una persona che non ha già un
 * lavoro in corso, finché c'è posto. Non lancia mai — un compito che esplode
 * non deve fermare quelli dietro di lui — e si richiama da solo quando uno
 * finisce.
 */
function gira() {
  while (inCorsoDi.size < LAVORANTI) {
    const dove = coda.findIndex(v => !inCorsoDi.has(v.utente ?? ''))
    if (dove < 0) break
    const [voce] = coda.splice(dove, 1)
    const k = chiave(voce.id, voce.utente)
    inCorsoDi.set(voce.utente ?? '', k)
    console.info(`myynd · worker · starting · ${voce.id} · queue_ms=${Date.now() - voce.accodato}`)
    // si lavora come la persona che l'ha affidato, non come chi ha acceso il
    // giro: è la differenza fra il suo indice e quello di un altro
    void Promise.resolve()
      .then(() => withBackgroundWork(() => voce.utente ? chi.dentro(voce.utente, () => svolgiUno(voce.id, voce.nativa)) : svolgiUno(voce.id, voce.nativa)))
      .catch(e => console.error('myynd · compito', voce.id, e))
      .finally(() => {
        console.info(`myynd · worker · released · ${voce.id}`)
        inCorsoDi.delete(voce.utente ?? '')
        interruzioni.delete(k)
        passiAttivi.delete(k)
        richiamati.delete(k)
        gira()
      })
  }
}

/**
 * Un guaio che passa da solo — il modello sotto sforzo, la rete, un flusso
 * caduto — non merita una riga rossa in lista alle sette di mattina: si
 * riprova una volta, fra due minuti, in silenzio. Alla seconda si dice.
 */
const PASSEGGERO = /sotto sforzo|ha un problema in questo momento|Ci ha messo troppo|Non riesco a raggiungere|interrotta a metà|Non ce l’ho fatta|Non ce l'ho fatta/
const RIPROVA_FRA = 2 * 60_000
const ritentati = new Set<string>()

/**
 * Le mani con cui lavora, sostituibili solo nelle prove.
 *
 * `svolgiUno` è il pezzo che tiene insieme coda, richiami e annunci, ed è
 * proprio quello che vale la pena provare — ma in mezzo chiama un modello, e
 * una prova che chiama un modello non è una prova. Qui le tre chiamate passano
 * da un oggetto che le prove possono sostituire; in produzione è sempre quello
 * vero, e non c'è nessun'altra strada per cambiarlo.
 */
type Ferri = {
  svolgi: typeof claude.svolgi
  chiedeAiuto: typeof claude.chiedeAiuto
  domandeDaFare: typeof claude.domandeDaFare
  /** Da bozza pronta a email pronta: quarta chiamata, stesso motivo delle altre tre. */
  preparaEmail: typeof claude.preparaEmail
  /** Se c'è una casella da cui mandare: senza, non si prepara niente. */
  salvaBozzaCasella: typeof salvaBozzaCasella
  postaCollegata: () => boolean
  /** La rilettura del lavoro, come lei e come chi lo riceve: quinta chiamata, stesso motivo. */
  giudica: typeof giudica
  /** La cosa dopo, in una riga: sesta, e l'ultima. */
  prossimoPasso: typeof prossimoPasso
}
const VERI: Ferri = {
  salvaBozzaCasella,
  svolgi: (...a) => claude.svolgi(...a),
  chiedeAiuto: (...a) => claude.chiedeAiuto(...a),
  domandeDaFare: (...a) => claude.domandeDaFare(...a),
  preparaEmail: (...a) => claude.preparaEmail(...a),
  giudica: (...a) => giudica(...a),
  prossimoPasso: (...a) => prossimoPasso(...a),
  postaCollegata: () => {
    const c = cfg.leggi()
    return !!(c.posta || c.google || c.microsoft?.parti.includes('posta'))
  }
}
let ferri: Ferri = VERI

/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) {
  ferri = f ? { ...VERI, ...f } : VERI
}

async function svolgiUno(id: string, nativa: boolean) {
  // tutto dentro il try, compresa la lettura: `compito()` può fallire come
  // qualunque altra query, e se fallisce fuori di qui si porta via la coda
  let c: store.Compito | null = null
  try {
    c = store.compito(id)
  } catch (e) {
    console.error('myynd · non riesco a leggere il compito', id, e)
    return
  }
  // può essere stato tolto o richiamato mentre era in fila: non è un errore
  if (!c || c.stato !== 'delegato' || richiamati.has(chiave(id))) return

  const controller = new AbortController()
  interruzioni.set(chiave(id), controller)
  annuncia({ fase: 'preso', id })
  annuncia({ fase: 'lavoro', id, passo: { passo: 'preparo' } })
  const iniziato = Date.now()
  let ultimoPasso: string | undefined

  try {
    // Il permesso viaggia con la riga: qui non si va a rileggere niente, si
    // usa quello che c'era scritto quando la riga è nata. Un compito scritto a
    // mano non ne ha, e lavora come ha sempre lavorato.
    if (c.origine === 'iniziativa' && !fonteValida(c.doc)) {
      // Withdraw automatic work without inventing user dismissal feedback.
      store.cambiaStatoCompito(id, 'ritirato', 'Source changed or preparation paused')
      annuncia({ fase: 'richiamato', id }); annunciaCambio(); return
    }
    const dato = c.attrezzi
    const progetto = c.progetto ? progetti.trova(c.progetto) : null
    const nota = progetto && progetto.stato !== 'chiuso'
      ? [`Progetto: ${progetto.nome}`, `Obiettivo: ${progetto.obiettivo}`, c.nota].filter(Boolean).join('\n')
      : c.nota
    console.info(`myynd · worker · entering-production · ${id} · elapsed_ms=${Date.now() - iniziato}`)
    // ogni passo esce sul filo, a chi ha affidato la riga: la rotella da
    // sola non diceva se stesse cercando, leggendo o scrivendo. Dopo un
    // richiamo si tace: quella riga non è più sua
    const passo = (p: claude.Passo) => { if (!richiamati.has(chiave(id))) {
      if (p.passo !== ultimoPasso) {
        console.info(`myynd · worker · stage=${p.passo} · ${id} · elapsed_ms=${Date.now() - iniziato}`)
        ultimoPasso = p.passo
      }
      annuncia({ fase: 'lavoro', id, passo: p })
    } }
    const lavora = (notaGiro: string | null) => ferri.svolgi(
      c.testo, notaGiro, c.modo,
      (dato?.nomi ?? []) as attrezzi.Nome[],
      dato?.cartella ?? null,
      passo,
      // la riga può essere nata da un documento preciso — «rispondere a
      // Rossi» — e allora la bozza parte da lì, non da una ricerca
      c.doc,
      dato,
      { nativa, signal: controller.signal, taskId: c.id }
    )

    /*
     * Il giro della rilettura.
     *
     * Una bozza non è pronta perché il modello ha smesso di scrivere: è pronta
     * quando qualcuno l'ha riletta. Qui la rilegge `giudica`, come lei e come
     * chi la riceve, e se non passa si riscrive una volta con i problemi in
     * coda alla nota. Una volta, non finché passa: un lavoro che non passa
     * due giri ha un problema che una terza stesura non risolve, e a quel
     * punto la cosa onesta è consegnarlo con il verdetto accanto, così chi
     * legge sa dove guardare. Il tetto è `GIRI_MAX`.
     *
     * Non si rilegge tutto. Una domanda non è un lavoro da giudicare; un
     * documento creato in Pages l'ha già guardato la revisione visiva; un
     * prompt non esce dall'azienda. Restano la bozza e il «tutto», cioè le due
     * cose che portano la sua firma.
     */
    let giri = 1
    let notaGiro = nota
    let verdetto: Giudizio | null = null
    let uscita = await lavora(notaGiro)
    let testo = ''
    let esito: { chiede: boolean; domanda: string; visto?: string }
    for (;;) {
      // il richiamo può essere arrivato mentre il modello scriveva: la bozza si
      // butta invece di comparire sotto una riga che hai già ripreso in mano
      if (richiamati.has(chiave(id))) return

      // Via le lineette prima che questo testo vada da qualunque parte: dalla
      // domanda che classifica se è una bozza pronta, dalla rilettura, dalla
      // riga che finisce salvata, dall'email che ne nasce. Un posto solo, una
      // volta sola — non una bozza pulita e un'email che porta ancora gli
      // incisi del modello.
      testo = senzaTrattini(uscita.testo)

      // Una risposta che dice «mi manca il tuo indirizzo» non è una bozza pronta,
      // ed è quello che stava succedendo: la riga si accendeva come se ci fosse
      // qualcosa da mandare. Adesso si distingue, e la riga lo dice.
      esito = uscita.eseguito
        ? { chiede: !!uscita.consegna?.revisione && uscita.consegna.revisione.esito !== 'pass', domanda: '' }
        : uscita.daChiedere ? { chiede: true, domanda: testo } : await ferri.chiedeAiuto(c.testo, testo)
      if (richiamati.has(chiave(id))) return
      if (esito.chiede || uscita.eseguito || !RILETTI.has(c.modo)) break

      verdetto = await ferri.giudica({
        compito: c, nota: notaGiro, risultato: testo,
        doc: c.doc ? store.documento(c.doc) : null,
        progetto: progetto && progetto.stato !== 'chiuso' ? progetto : null,
        fonti: uscita.fonti
      })
      if (richiamati.has(chiave(id))) return
      if (verdetto.esito !== 'revise' || giri >= GIRI_MAX) break

      giri++
      console.info(`myynd · revisione · ${id} · revise · riscrivo (giro ${giri})`)
      notaGiro = [nota, feedbackPer(verdetto.problemi)].filter(Boolean).join('\n\n')
      uscita = await lavora(notaGiro)
    }
    const { fonti, verificaDocumenti, eseguito, consegna } = uscita
    const { chiede, domanda } = esito

    /*
     * Quando chiede, sotto la riga ci va la domanda. Solo quella, e davanti
     * la riga di cosa ha visto, se c'è.
     *
     * Ci andava tutto quello che aveva scritto, e quando un modello si ferma
     * quello che ha scritto non è lavoro: è il ragionamento sul lavoro. Il
     * quattordici settembre erano quattro punti numerati, un file di curriculum
     * che non c'entrava niente, e in coda tre domande insieme. Sotto, la
     * casella per rispondere. Per rispondere bisognava leggere duecento parole
     * e capire quale delle tre contava.
     *
     * Adesso quelle duecento parole restano dove sono nate — servono a
     * `domandeDaFare`, che da lì ricava le risposte da toccare — e sulla riga
     * compare la domanda sola. Se il modello non riesce a formularla si tiene
     * quello che c'era: una riga che chiede male è meglio di una riga che non
     * chiede niente. La riga di cosa ha visto sta sopra, sulla stessa
     * paragrafata: è quella che fa capire perché la domanda è quella.
     */
    const detto = chiede && domanda ? [esito.visto ?? '', soloDomanda(domanda)].filter(Boolean).join('\n') : testo

    // Classification is asynchronous too: feedback arriving after drafting
    // must still win before an automated current-email summary becomes ready.
    const controlla = verificaDocumenti ?? [...fonti.map(f => f.id), ...(c.doc ? [c.doc] : [])]
    if (!claude.verificaFontiSelezione(controlla, dato, `${c.testo}\n${nota ?? ''}`)) {
      throw new Error('Una fonte è stata completata, scartata o non è più pertinente. Rileggi le fonti prima di riprovare.')
    }

    if (c.origine === 'iniziativa' && !fonteValida(c.doc)) {
      // Withdraw automatic work without inventing user dismissal feedback.
      store.cambiaStatoCompito(id, 'ritirato', 'Source changed or preparation paused')
      annuncia({ fase: 'richiamato', id }); annunciaCambio(); return
    }

    await verificaBaseRevisione(c)

    // `risultatoCompito` scrive solo se la riga è ancora affidata: se nel
    // frattempo l'hai chiusa tu, la bozza in ritardo non la riapre
    if (!store.risultatoCompito(id, detto, chiede ? [] : fonti, chiede ? 'chiede' : 'pronto')) return
    if (consegna) store.scriviConsegnaCompito(id, consegna)
    // il verdetto si riscrive a ogni giro, anche quando non c'è: una riga
    // riaffidata che stavolta chiede non deve portarsi dietro il «passa» di ieri
    const revisione = verdetto ? { ...verdetto, giri } : null
    store.scriviRevisioneCompito(id, revisione)
    if (revisione) console.info(`myynd · revisione · ${id} · ${revisione.esito} · ${giri} giri`)
    ritentati.delete(chiave(id))

    // Se si è fermato, le stesse cose dette come si dicono a voce: tre domande
    // con le risposte da toccare. Se non ci riesce resta il paragrafo di prima,
    // che funzionava già — non vale la pena bloccare una riga per delle opzioni.
    if (chiede && !eseguito) {
      const righe = await ferri.domandeDaFare(c.testo, testo).catch(() => [])
      if (righe.length && !richiamati.has(chiave(id))) store.chiediSuCompito(id, righe)
    } else if (!eseguito) {
      // e se è pronta, l'email lo è già: si annuncia dopo, così il «pronto»
      // arriva con dentro a chi va — un gesto solo, non due attese
      await preparaLaMail(c, testo, fonti)
    }

    const fatto = store.compito(id)
    if (fatto) annuncia({ fase: fatto.stato === 'chiede' ? 'chiede' : 'pronto', id, compito: fatto })
    // e la cosa dopo: si cerca *dopo* aver annunciato, perché il risultato
    // non deve aspettare una riga in più che quasi sempre non c'è
    if (fatto?.stato === 'pronto') await proponiIlSeguito(c, testo, progetto)
  } catch (e) {
    if (richiamati.has(chiave(id))) return
    const guaio = e instanceof Error ? e.message : String(e)
    const k = chiave(id)
    if (PASSEGGERO.test(guaio) && !ritentati.has(k)) {
      ritentati.add(k)
      annuncia({ fase: 'preso', id })
      console.warn(`myynd · compito ${id}: ${guaio} — riprovo fra due minuti`)
      const utente = chi.adesso()
      setTimeout(() => {
        const ancora = () => store.compito(id)?.stato === 'delegato'
        if (utente ? chi.dentro(utente, ancora) : ancora()) { coda.push({ utente, id, nativa, accodato: Date.now() }); gira() }
        else ritentati.delete(k)
      }, RIPROVA_FRA).unref()
      return
    }
    ritentati.delete(k)
    try {
      if (!store.guaioCompito(id, guaio)) return
    } catch (ancora) {
      console.error('myynd · non riesco nemmeno a segnare il guaio', id, ancora)
      return
    }
    annuncia({ fase: 'guaio', id, guaio })
  }
}

/** I modi che passano dalla rilettura: quelli che portano la sua firma. */
const RILETTI = new Set(['bozza', 'tutto'])
/** Quante stesure al massimo: la prima, e una riscritta con i problemi in coda. */
const GIRI_MAX = 2

/**
 * La cosa dopo, in lista.
 *
 * «Torna con il risultato e con la cosa dopo»: l'ultima delle sue tre
 * richieste. Quando un lavoro è pronto si chiede in una riga cosa viene dopo
 * dentro quel progetto, e la si scrive in lista come figlia della riga
 * finita — con `madre`, così «Da …» porta lì — senza affidarla a nessuno:
 * è una cosa da fare sua, proposta, non un lavoro che parte da solo.
 *
 * Quando non si scrive, ed è la parte che conta di più:
 *   · una riga nata così non ne genera un'altra — niente catene di catene,
 *     che è il modo in cui una lista si riempie di cose che nessuno ha
 *     chiesto;
 *   · una madre che ha già figli non ne fa altri: «rifallo» sulla stessa riga
 *     non deve raddoppiare il seguito (`madriUsate`, la stessa rete del punto);
 *   · una riga simile è già in lista, in qualunque stato vivo;
 *   · un prompt non ha un dopo che non sia «incollalo», e non vale una riga.
 * E non fallisce mai: la riga pronta resta pronta anche se il modello che
 * propone è giù.
 */
async function proponiIlSeguito(c: store.Compito, risultato: string, progetto: progetti.Progetto | null) {
  try {
    if (c.origine === 'seguito' || c.modo === 'prompt' || !risultato.trim()) return
    if (store.madriUsate().has(c.id)) return
    const vivi = store.elencoCompiti().filter(v => v.id !== c.id)
    const passo = await ferri.prossimoPasso({
      compito: c, risultato,
      progetto: progetto && progetto.stato !== 'chiuso' ? progetto : null,
      inLista: vivi.filter(v => !c.progetto || v.progetto === c.progetto).map(v => v.testo)
    })
    if (!passo) { console.info(`myynd · seguito · ${c.id} · niente da proporre`); return }
    if (richiamati.has(chiave(c.id))) return
    if (vivi.some(v => simili(v.testo, passo))) { console.info(`myynd · seguito · ${c.id} · già in lista: «${passo.slice(0, 80)}»`); return }
    // la riga può essere stata chiusa o richiamata mentre il modello pensava
    if (store.compito(c.id)?.stato !== 'pronto') return
    // l'id come quello della rotta: l'ora in base trentasei e un pizzico di caso
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    store.scriviCompito({
      id, testo: passo, quando: 'oggi', origine: 'seguito', madre: c.id,
      progetto: c.progetto ?? null,
      ordine: ordine.dopo(store.ultimoOrdine('oggi'))
    })
    console.info(`myynd · seguito · ${c.id} → ${id}`)
    annunciaCambio()
  } catch (e) {
    console.warn(`myynd · compito ${c.id}: il risultato è pronto, la cosa dopo no —`, e instanceof Error ? e.message : e)
  }
}

/**
 * L'email già smontata, scritta accanto alla bozza.
 *
 * Non fallisce mai: una bozza pronta resta pronta anche se il modello che la
 * smonta è giù — al peggio si torna a chiederla in due passi, com'era prima.
 * E non si chiama su tutto: un riassunto non ha un destinatario, e pagare un
 * modello per sentirselo dire è la spesa che il registro dei token non
 * perdona. Si prepara dopo aver scritto `pronto`, quindi la riga può essere
 * stata chiusa o richiamata nel frattempo: si scrive solo se è ancora lì.
 */
async function preparaLaMail(c: store.Compito, bozza: string, fonti: claude.Fonte[]) {
  try {
    // Un prompt non è una email, anche quando dentro c'è scritto «scrivi a
    // Rossi» con tanto di saluto: è la richiesta di scriverla, da incollare
    // altrove. `sembraUnMessaggio` guarda i verbi e le formule e ci cascherebbe
    // in pieno — e la riga si accenderebbe con un «Manda a Rossi» sotto un
    // testo che comincia con «Sei un assistente».
    if (c.modo === 'prompt') return
    if (!ferri.postaCollegata()) return
    if (!invio.sembraUnMessaggio(c.testo, bozza, [c.doc, ...fonti.map(f => f.id)])) return
    const e = await ferri.preparaEmail(c.testo, bozza, fonti, c.doc)
    if (!e || richiamati.has(chiave(c.id))) return
    if (store.compito(c.id)?.stato !== 'pronto') return
    const email: store.EmailPronta = { ...e, conosciuto: e.a ? store.indirizzoConosciuto(e.a) : false }
    if (c.doc && (c.origine !== 'iniziativa' || fonteValida(c.doc))) {
      const source = store.documento(c.doc)
      if (source?.messageId) email.rispondeA = { messageId: source.messageId }
      await verificaBaseRevisione(c)
      email.casella = c.madre && /REVISION BASELINE: .*"tipo":"bozza"/.test(c.nota || '')
        ? await salvaRevisioneCasella(c, email)
        : await ferri.salvaBozzaCasella(c.id, c.doc, email)
    }
    if (c.madre && email.casella?.stato === 'errore') throw new Error(email.casella.errore || 'Mailbox revision could not be verified.')
    store.scriviEmailCompito(c.id, email)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (c.madre) {
      store.cambiaStatoCompito(c.id, 'chiede', message)
      store.traduciRisultato(c.id, message)
      store.scriviEmailCompito(c.id, null)
      return
    }
    console.warn(`myynd · compito ${c.id}: la bozza è pronta, l'email no —`, message)
  }
}

/**
 * Richiama indietro un compito affidato.
 *
 * Torna aperto subito — chi ha premuto non deve aspettare che il modello si
 * accorga di niente. Quello che sta girando finisce comunque il suo giro, ma il
 * risultato non lo scrive più nessuno.
 */
export function richiama(id: string) {
  const utente = chi.adesso()
  const dove = coda.findIndex(v => v.id === id && v.utente === utente)
  if (dove >= 0) coda.splice(dove, 1)
  // si segna solo quello che sta girando davvero: segnare anche gli altri
  // lasciava id nell'insieme per sempre, e — peggio — un riaffido subito dopo
  // ripuliva il segno di un lavoro ancora in volo, che quindi tornava a scrivere
  const k = chiave(id, utente)
  if (inLavoro(k, utente)) { richiamati.add(k); interruzioni.get(k)?.abort() }
  const c = store.compito(id)
  // 'chiede' mancava, ed è lo stato in cui si preme «richiama» più spesso:
  // la riga ti fa una domanda, tu decidi di fartela da solo, e la riga
  // restava «ti chiede» per sempre — con la pastiglia accesa su una domanda
  // che non aspettava più nessuna risposta.
  if (c?.stato === 'delegato' || c?.stato === 'pronto' || c?.stato === 'chiede') {
    store.cambiaStatoCompito(id, 'aperto')
    store.sbozzaCompito(id)
  }
  store.riprendiCompito(id)
  annuncia({ fase: 'richiamato', id })
}

/**
 * Quello che è rimasto in mezzo al guado.
 *
 * Si chiama all'avvio. Un compito «da Myynd» il cui lavoro è morto insieme al
 * processo non tornerà da solo: senza questa riga resta lì a girare per sempre,
 * e la lista mente a chi la guarda.
 */
export function riprendiAppesi(pronto = claude.collegato): number {
  const interrupted = store.compitiAppesi()
  const reopened = store.riapriGliAppesi('Il lavoro si è interrotto. Riaffidamelo quando vuoi.')
  // Only opt-in, read-only proactive email drafts recover automatically. A
  // persistent attempt marker prevents a repeatedly crashing task looping.
  if (!pronto()) return reopened
  const path = join(cfg.cartella(), 'initiative-recovery.json')
  let attempts: Record<string, number> = {}
  try {
    if (existsSync(path)) {
      const value = JSON.parse(readFileSync(path, 'utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value)) return reopened
      attempts = value
    }
  } catch { return reopened }
  const candidates = interrupted.filter(c => c.origine === 'iniziativa' && c.modo === 'bozza' &&
    !c.attrezzi && !c.consegna && !attempts[c.id] && fonteValida(c.doc)).slice(0, 2)
  for (const c of candidates) {
    attempts[c.id] = Date.now()
    // Persist before queueing; after a crash, never duplicate uncertain work.
    writeFileSync(path + '.tmp', JSON.stringify(attempts), { mode: 0o600 })
    renameSync(path + '.tmp', path)
    affida(c.id, 'bozza', false)
    console.info(`myynd · worker · recovered-read-only-draft · ${c.id}`)
  }
  return reopened
}

/**
 * Quello che hai corretto della bozza, Myynd se lo tiene.
 *
 * È l'apprendimento che il brief chiama il più prezioso del prodotto: non ti
 * chiede niente, guarda la differenza fra quello che aveva scritto e quello che
 * hai tenuto, e da lì capisce come scrivi. Gira dopo aver risposto, mai prima:
 * chiudere un compito non deve aspettare la memoria.
 */
export function imparaSeCorretto(bozza: string | null, tenuto: string) {
  if (!bozza?.trim() || !tenuto.trim()) return
  memoria.imparaDallaCorrezione(bozza, tenuto).catch(() => { /* la memoria è un di più */ })
}

/**
 * Le parole con cui hai chiuso una riga.
 *
 * Finora imparava da una cosa sola: la bozza che avevi corretto prima di
 * mandarla. È l'apprendimento più prezioso, ma è anche il più raro — succede
 * solo sui compiti che gli avevi affidato *e* che hai riscritto. Tutto il resto
 * della lista passava senza lasciare niente: chiudevi venti righe scrivendo
 * perché, e di quelle venti non restava una parola.
 *
 * Eppure «l'ho mandato lunedì col listino nuovo» e «lasciamo perdere, il
 * cliente ha rinunciato» dicono di te più di mezza casella di posta. La prima è
 * un fatto, la seconda è un giudizio — e il giudizio è esattamente la cosa che
 * il brief dice che nessuno costruisce.
 *
 * Due cautele. Sotto le quattro parole non si guarda nemmeno: «fatto», «ok»,
 * «sì» non sono frasi, sono clic, e distillarli riempirebbe la memoria di
 * niente. E gira dopo che la rotta ha già risposto: chiudere un compito non
 * deve mai aspettare che Myynd rifletta.
 */
export function imparaDallaChiusura(
  c: { testo: string; nota: string | null },
  stato: string,
  esito?: string
) {
  const parole = (esito ?? '').trim()
  if (parole.split(/\s+/).filter(Boolean).length < 4) return

  const lasciata = stato === 'lasciato'
  memoria.distilla([
    { ruolo: 'a', testo: `Aveva in lista: «${c.testo}»${c.nota ? `\nCon questa nota: ${c.nota}` : ''}` },
    {
      ruolo: 'u',
      testo: lasciata
        // il perché di una cosa NON fatta vale quanto quello di una fatta, e a
        // volte di più: dice dove passa il confine di quello che le interessa
        ? `L'ho lasciata perdere, e il motivo è questo: ${parole}`
        : `L'ho chiusa, e com'è andata è questo: ${parole}`
    }
  ], lasciata ? 'abbandono' : 'chiusura')
    .catch(() => { /* la memoria è un di più: chiudere una riga funziona lo stesso */ })
}
