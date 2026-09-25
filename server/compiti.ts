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
import * as riferimento from './riferimento.ts'
import * as lavoro from './lavoro.ts'
import { OSPITATO } from './ospitato.ts'
import { nominaAmbito } from './ambiti-memoria.ts'
import { projectMemoryContext } from './project-memory.ts'
import { fonteValida } from './iniziativa.ts'
import { salvaBozzaCasella, salvaRevisioneCasella } from './mailbox-drafts.ts'
import { tutteLeDomande } from './testo.ts'
import { giudica, prossimoPasso, simili } from './revisione-lavoro.ts'
import * as mani from './mani.ts'
import * as ordine from './ordine.ts'
import * as lavoroDati from './lavoro-dati.ts'
import * as voce from './voce.ts'
import { collegato as motoreCollegato, rifiutata, testaAlLavoro } from './modello.ts'
import { stendi, type Stesa } from './stesura.ts'
import { corpoPerChiRiceve, rigaIpotesi } from './cornice.ts'
import { BLOCCHI, bloccoDalTesto, generaBlocco, MANCA_UN_DATO, tipoDiLavoro } from './domanda-sola.ts'
import type { Lettura } from './lettura-chiesta.ts'

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
  /** Un collegamento è cambiato: chi mostra lo stato dei collegamenti lo rilegge. */
  | { fase: 'collegamento' }
  /** P10 · la lettura chiesta con l'occhio: corre (con il suo passo), finisce, o va storta. */
  | { fase: 'lettura'; stato: 'corre' | 'fine' | 'guaio'; lettura: Lettura; nuove?: number; errore?: string }

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
  // P10 · una finestra che si apre (o si riapre) a metà lettura vede subito la riga
  const lettura = lettureInCorso.get(di ?? '')
  if (lettura) { try { f(lettura) } catch { /* listener owns errors */ } }
  return () => { ascoltatori.delete(a) }
}

/** P10 · la lettura chiesta con l'occhio, sul filo: `corre` si ricorda finché non arriva `fine` o `guaio`. */
export function annunciaLettura(e: Omit<Extract<Evento, { fase: 'lettura' }>, 'fase'>) {
  annuncia({ fase: 'lettura', ...e })
}
const lettureInCorso = new Map<string, Extract<Evento, { fase: 'lettura' }>>()

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
 * «Un collegamento è cambiato, rileggi lo stato.»
 *
 * La finestra che ha collegato lo sa già da sé (`src/collegamenti.ts`); sono
 * le altre — il richiamo, un'altra scheda del browser — a restare indietro.
 * `aTutti` serve a Claude Code, che è uno per macchina: quando dice «non sei
 * più entrato» vale per chiunque abbia l'app aperta su questo computer, e la
 * notizia non porta niente di nessuno, solo il fatto.
 */
export function annunciaCollegamento(aTutti = false, o: { riprendi?: boolean } = {}) {
  if (!aTutti) {
    annuncia({ fase: 'collegamento' })
    // una fonte in più può sbloccare una riga ferma (P3): si guarda, senza
    // aspettare. Una fonte tolta no: rifare il lavoro per un collegamento
    // in meno lo farebbe fermare di nuovo sulla stessa riga
    if (o.riprendi !== false) void riprendiBloccati().catch(() => {})
    return
  }
  for (const a of ascoltatori) {
    try { a.f({ fase: 'collegamento' }) } catch { /* chi ascolta si arrangia */ }
  }
}

/**
 * «La salute di una fonte è cambiata, rileggi lo stato.»
 *
 * Lo stesso fatto sul filo, per la riga fissa delle fonti (P8): una fonte
 * che si rompe o guarisce a una lettura. Non è un collegamento in più: una
 * fonte che si rompe non riprende le righe ferme (P3), perché rifare un
 * lavoro intero per un guaio non sbloccherebbe niente. Una che guarisce sì:
 * un permesso dato nelle Impostazioni di sistema, un token rimesso, una
 * cartella tornata leggibile non passano da nessuna rotta di collegamento,
 * e Myynd li vede solo così, alla lettura dopo. «La riprendo da qui» vale
 * anche per loro.
 */
export function annunciaSalute(o: { guarite?: string[] } = {}) {
  annuncia({ fase: 'collegamento' })
  if (o.guarite?.length) void riprendiBloccati().catch(() => {})
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
  if (e.fase === 'lettura') {
    if (e.stato === 'corre') lettureInCorso.set(di ?? '', e)
    else lettureInCorso.delete(di ?? '')
  }
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
  // solo se è ancora affidata: una riga tornata sua (richiamata, o ferma su un
  // blocco) si riaffida anche se il giro di prima sta ancora chiudendo
  if (c.stato === 'delegato' && c.modo === modo && (coda.some(v => v.id === id && v.utente === utente) || inLavoro(k, utente))) return

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
  /** Il motore che lavora ha la chiave respinta (P8): riprendere una riga ferma adesso la manderebbe a sbattere. */
  motoreRifiutato: () => boolean
  /** C'è un motore che può lavorare: all'avvio, senza, una riga ferma ripresa morirebbe e il guaio del motore coprirebbe «la riprendo da qui». */
  motorePronto: () => boolean
  /** La rilettura del lavoro, come lei e come chi lo riceve: quinta chiamata, stesso motivo. */
  giudica: typeof giudica
  /** La cosa dopo, in una riga: sesta, e l'ultima. */
  prossimoPasso: typeof prossimoPasso
  /** Quello che si impara chiudendo una riga: settima, per poter guardare cosa impara. */
  distilla: typeof memoria.distilla
  /** Il lavoro finito scritto come file nel luogo scelto: le prove lo fanno in una cartella loro. */
  salvaConsegna: typeof mani.salvaConsegna
  /** Di che genere è il dato che manca, e se sbagliarlo costa (P3): ottava, per la stessa ragione. */
  pesaLaDomanda: typeof claude.pesaLaDomanda
  /** Come scrive a chi riceve (P3): senza modello, ma legge l'indice, e le prove vogliono poterlo dire. */
  voce: { perRiga: typeof voce.perRiga }
}
const VERI: Ferri = {
  salvaBozzaCasella,
  svolgi: (...a) => claude.svolgi(...a),
  chiedeAiuto: (...a) => claude.chiedeAiuto(...a),
  domandeDaFare: (...a) => claude.domandeDaFare(...a),
  preparaEmail: (...a) => claude.preparaEmail(...a),
  pesaLaDomanda: (...a) => claude.pesaLaDomanda(...a),
  voce: { perRiga: c => voce.perRiga(c) },
  giudica: (...a) => giudica(...a),
  salvaConsegna: (...a) => mani.salvaConsegna(...a),
  prossimoPasso: (...a) => prossimoPasso(...a),
  distilla: (...a) => memoria.distilla(...a),
  postaCollegata: () => {
    const c = cfg.leggi()
    return !!(c.posta || c.google || c.microsoft?.parti.includes('posta'))
  },
  motoreRifiutato: () => {
    const t = testaAlLavoro()
    return (t === 'claude' || t === 'openai') && !!rifiutata(t)
  },
  motorePronto: () => motoreCollegato()
}
let ferri: Ferri = VERI

/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) {
  ferri = f ? { ...VERI, ...f } : VERI
}

/**
 * C'è lavoro dal vivo di questa persona, in fila o in corso? (P6)
 *
 * La prova e il vassoio aspettano: il suo lavoro affidato viene prima.
 */
export function occupatoPer(utente: string): boolean {
  return inCorsoDi.has(utente) || coda.some(v => (v.utente ?? '') === utente)
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
    /*
     * Il materiale e le mani di un progetto.
     *
     * La cartella di lavoro, la memoria e il riferimento entrano come
     * materiale (`materialeDelProgetto`), e la cartella arriva a `svolgi` come
     * percorso: se la riga è lavoro di codice e Claude Code c'è, è `svolgi`
     * che si dà la mano `lavora_nel_codice` (vedi `mani.ts`), che lavora in
     * una copia. Un'automazione ha già i suoi attrezzi e la sua cartella, e
     * non si toccano.
     */
    const materiale = progetto && progetto.stato !== 'chiuso' ? materialeDelProgetto(progetto) : null
    const cartella = dato?.cartella ?? materiale?.cartella?.percorso ?? null
    const concessi = [...((dato?.nomi ?? []) as attrezzi.Nome[])]
    if (materiale?.cartella) console.info(`myynd · worker · project-folder · ${id} · ${materiale.cartella.id}${!dato && cartella && leManiSulCodice(c.testo, c.nota) ? ' · codice' : ''}`)
    /*
     * Le misure e la voce (P3).
     *
     * Una riga di `misure_compiti` nasce all'affido, e la voce con cui si
     * scrive a chi riceve si calcola prima di scrivere: entra nel prompt come
     * prova, e decide la lingua della cosa consegnata.
     */
    lavoroDati.registraAffido(c, nativa)
    let v: voce.Voce | null = null
    try { v = ferri.voce.perRiga(c) } catch (e) { console.warn(`myynd · voce · ${id}:`, e instanceof Error ? e.message : e) }
    const lavora = (notaGiro: string | null, extra?: { fissa?: string[]; giri?: number }) => ferri.svolgi(
      c.testo, notaGiro, c.modo,
      concessi,
      cartella,
      passo,
      // la riga può essere nata da un documento preciso — «rispondere a
      // Rossi» — e allora la bozza parte da lì, non da una ricerca
      c.doc,
      dato,
      {
        nativa, signal: controller.signal, taskId: c.id, ...(extra ?? {}),
        ...(v?.blocco ? { voce: v.blocco } : {}), ...(v?.consegna ? { consegna: v.consegna } : {})
      },
      materiale
    )

    /*
     * La stesura: scrive, classifica, decide se chiedere o presumere,
     * rilegge, e se serve riscrive. Sta in `stesura.ts`, senza scritture:
     * qui si prende quello che torna e lo si scrive dove va. Un richiamo
     * arrivato in mezzo torna null: la bozza si butta.
     */
    const progettoVivo = progetto && progetto.stato !== 'chiuso' ? progetto : null
    const stesa = await stendi({
      c, nota, progetto: progettoVivo, nativa,
      doc: c.doc ? store.documento(c.doc) : null,
      lingua: cfg.lingua(), consegna: v?.consegna, voce: v?.blocco,
      lavora,
      ferri: { chiedeAiuto: ferri.chiedeAiuto, pesaLaDomanda: ferri.pesaLaDomanda, giudica: ferri.giudica },
      fermo: () => richiamati.has(chiave(id)),
      controllaVoce: v ? testo => voce.controlla(testo, v) : undefined,
      // un blocco vale solo se la fonte manca davvero: con la posta collegata
      // «non ho accesso alla posta» è una domanda, non «Collega la posta»
      collegata: g => g === 'posta' ? ferri.postaCollegata() : g === 'file' ? !!cfg.leggi().desktop?.cartelle?.length : false
    })
    if (!stesa) return
    await dopoLaStesura(c, stesa, progetto, { nota, voce: v, fermato: () => richiamati.has(chiave(id)) })
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

/**
 * Quello che succede dopo la stesura (P6): il file, la verifica delle fonti,
 * il risultato sulla riga, la domanda o la mail, l'annuncio, la cosa dopo.
 *
 * Era la seconda metà di `svolgiUno`, nello stesso ordine. Sta qui a parte
 * perché la stessa sequenza serve quando un risultato del vassoio di prova
 * va in lista: una bozza promossa fa esattamente quello che fa una bozza
 * nata dal vivo. Le misure di P3 restano dove erano, intrecciate ai passi.
 */
export async function dopoLaStesura(
  c: store.Compito,
  stesa: Stesa,
  progetto: progetti.Progetto | null,
  o: { nota: string | null; voce: voce.Voce | null; fermato: () => boolean }
): Promise<void> {
  const id = c.id
  const nota = o.nota
  const v = o.voce
  const dato = c.attrezzi
  let { testo } = stesa
  const { fonti, verificaDocumenti, eseguito, consegna, mossa, genere, domanda, lette, verdetto, giri } = stesa
  const fatti = stesa.fatti
  /** Il lavoro per intero, prima che la riga ne tenga solo la chiusura: la cosa dopo si cerca da qui. */
  const lavoroIntero = testo
  /** Chiede lei: una domanda scritta, o un documento nativo la cui revisione visiva non è passata. */
  const chiedeNativo = eseguito && !!consegna?.revisione && consegna.revisione.esito !== 'pass'
  const chiede = mossa === 'chiedi' || chiedeNativo

  /*
   * Un blocco non è una domanda (decisioni P3): gli manca una fonte o un
   * permesso, e la riga torna sua con una frase fissa che dice quale; si
   * riprende da sola quando quella fonte si collega (`riprendiBloccati`).
   * Un guaio è il secondo giro che si ferma ancora: la riga torna sua e lo
   * dice. Né l'uno né l'altro contano come domanda.
   */
  if (mossa === 'blocco' || mossa === 'guaio') {
    const frase = mossa === 'blocco'
      ? BLOCCHI[bloccoDalTesto(testo) ?? (genere === 'permesso' ? 'permesso' : 'fonte')]
      : MANCA_UN_DATO
    lavoroDati.registraEsito(id, { mossa, genere })
    ritentati.delete(chiave(id))
    if (!store.guaioCompito(id, frase)) return
    annuncia({ fase: 'guaio', id, guaio: frase })
    return
  }

  /*
   * Il lavoro finito è un file, non un testo incollato sotto la riga.
   *
   * Le sue parole, del ventuno settembre: «once the work was produced, he
   * just pasted it under the task on my feed. That's not okay. He should
   * tell me, "Hey, I saved it to your desktop"». Quindi una pagina scritta
   * — una definizione, un piano, una proposta — si salva come file nel
   * luogo delle consegne (`mani.vaSalvato` decide cosa è una pagina e cosa
   * no: un messaggio da mandare resta sulla riga, e così una risposta
   * corta), e sulla riga resta la frase che dice dove sta, più la riga
   * per lei se c'era. Il luogo lo impara dalle sue parole: «save it to my
   * Desktop» nel compito o nella risposta vale da quel momento in poi.
   * Se il file non si può scrivere — un server, un disco che dice di no —
   * il testo resta sulla riga com'era: meglio incollato che perso.
   */
  // è un messaggio se nasce dalla posta, se il compito è scrivere a
  // qualcuno, o se la bozza ha un saluto o una firma: «write the plan»
  // da solo non basta, o ogni pagina scritta resterebbe sulla riga
  const messaggio = [c.doc, ...fonti.map(f => f.id)].some(x => !!x && x.startsWith('posta:'))
    || EPISTOLARE.test(c.testo) || invio.sembraUnMessaggio('', testo)
  let consegnaFile: store.ConsegnaCompito | null = null
  if (!chiede && !eseguito && RILETTI.has(c.modo)) {
    const dettoDaLei = mani.luogoNelTesto(`${c.testo}\n${claude.dettaglioDellaRiga(nota)}`)
    const diPrima = mani.luogoPreferito()
    const luogo = dettoDaLei ?? diPrima
    const imparato = !!dettoDaLei && dettoDaLei !== diPrima
    if (imparato) {
      try { cfg.aggiorna({ consegne: { luogo } }); console.info(`myynd · consegne · ${id} · da oggi ${luogo}`) }
      catch (e) { console.warn('myynd · non riesco a ricordare dove salvare:', e instanceof Error ? e.message : e) }
    }
    if (mani.vaSalvato({ risultato: testo, fatti, messaggio, chiesto: !!dettoDaLei })) {
      try {
        const { corpo, nota: perLei } = mani.rigaPerLei(mani.senzaChiusura(testo))
        const salvato = ferri.salvaConsegna({ titolo: c.testo, testo: corpo, luogo })
        fatti.push({ attrezzo: 'scrivi_file', esito: 'ok', dettaglio: salvato.percorso })
        testo = mani.fraseDelFile(salvato, cfg.lingua(), imparato) + (perLei ? `\n\n${perLei}` : '')
        consegnaFile = {
          app: 'File', titolo: salvato.nome, percorso: salvato.percorso, dove: salvato.luogo,
          ...(verdetto && verdetto.esito !== 'unavailable' ? { revisione: { esito: verdetto.esito, problemi: verdetto.problemi } } : {})
        }
        console.info(`myynd · consegna · ${id} · file · ${salvato.percorso}`)
      } catch (e) {
        console.warn(`myynd · compito ${id}: il lavoro è pronto, il file no —`, e instanceof Error ? e.message : e)
      }
    }
  }

  /*
   * Quando chiede, sotto la riga ci va la domanda. Una sola, dal 24
   * settembre, e davanti la riga di cosa ha visto, se c'è: le duecento
   * parole del ragionamento restano dove sono nate (servono a
   * `domandeDaFare`) e sulla riga compare la domanda sola.
   */
  const detto = mossa === 'chiedi' && domanda ? [stesa.visto, tutteLeDomande(domanda, 1)].filter(Boolean).join('\n') : testo

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
  if (consegna) store.scriviConsegnaCompito(id, consegna as store.ConsegnaCompito)
  else if (consegnaFile) store.scriviConsegnaCompito(id, consegnaFile)
  // il verdetto si riscrive a ogni giro, anche quando non c'è: una riga
  // riaffidata che stavolta chiede non deve portarsi dietro il «passa» di ieri
  const revisione = verdetto ? { ...verdetto, giri } : null
  store.scriviRevisioneCompito(id, revisione)
  if (revisione) console.info(`myynd · revisione · ${id} · ${revisione.esito} · ${giri} giri`)
  ritentati.delete(chiave(id))

  const tipo = tipoDiLavoro({ testo: c.testo, modo: c.modo, consegna: consegna ?? consegnaFile, email: messaggio, codice: !!dato?.cartella || leManiSulCodice(c.testo, c.nota) })
  if (mossa === 'chiedi') {
    /*
     * La domanda scritta: si conta qui e solo qui, sulla riga e nelle
     * misure. Un documento nativo bocciato dalla revisione visiva, un
     * codice che gira, una revisione della casella fallita non contano.
     */
    lavoroDati.contaDomanda(id)
    lavoroDati.scriviIpotesi(id, null)
    lavoroDati.registraEsito(id, { mossa, genere, tipo })
    // le opzioni vengono dal materiale: il compito, la nota, e i documenti letti
    const materialeDomande = [c.testo, nota ?? '', ...lette.slice(0, 6).map(did => {
      const d = store.documento(did)
      return d ? [d.autore ?? '', d.titolo, (d.corpo ?? '').slice(0, 4000)].filter(Boolean).join('\n') : ''
    })].filter(Boolean).join('\n\n')
    const righe = await ferri.domandeDaFare(c.testo, testo, { genere, materiale: materialeDomande }).catch(() => [])
    if (righe.length && !o.fermato()) store.chiediSuCompito(id, righe.slice(0, 1))
  } else if (!eseguito) {
    // e se è pronta, l'email lo è già: si annuncia dopo, così il «pronto»
    // arriva con dentro a chi va — un gesto solo, non due attese
    const riga = rigaIpotesi(testo)
    lavoroDati.scriviIpotesi(id, riga ? [riga] : null)
    lavoroDati.scriviVoceScritta(id, v?.scritta ?? null)
    lavoroDati.registraEsito(id, { mossa, genere, tipo, consegnato: new Date().toISOString() })
    await preparaLaMail(c, testo, fonti, { consegna: v?.consegna, candidati: claude.candidatiAllegato(lette, fonti) })
  } else {
    // una consegna nativa (Pages, Note) ha la sua ipotesi come le altre: si
    // mostra e si cambia, e «Cambia» passa dalla revisione della consegna.
    // Bocciata dalla revisione visiva, resta «chiede» e senza ipotesi
    const riga = chiedeNativo ? null : rigaIpotesi(testo)
    lavoroDati.scriviIpotesi(id, riga ? [riga] : null)
    lavoroDati.registraEsito(id, { mossa: 'produci', genere: null, tipo, ...(chiedeNativo ? {} : { consegnato: new Date().toISOString() }) })
  }

  const fatto = store.compito(id)
  if (fatto) annuncia({ fase: fatto.stato === 'chiede' ? 'chiede' : 'pronto', id, compito: fatto })
  // e la cosa dopo: si cerca *dopo* aver annunciato, perché il risultato
  // non deve aspettare una riga in più che quasi sempre non c'è
  if (fatto?.stato === 'pronto') await proponiIlSeguito(c, lavoroIntero, progetto)
}

/**
 * Il materiale di un progetto, per chi lavora su una sua riga.
 *
 * Tre cose, e finora non arrivava nessuna delle tre. La cartella di lavoro
 * sul disco — il documento `lavoro:<cartella>` con il README, gli ultimi
 * commit e gli appunti — si trova per nome: il nome del progetto, o uno degli
 * altri nomi che lui ha dato nel riferimento («Evermute (everwave)»), contro
 * l'ultimo pezzo del percorso, con la stessa lettura di
 * `riferimento.registraProgettiNominati`. La memoria del progetto è quella
 * di `projectMemoryContext`. Il riferimento sono le sue righe che nominano
 * il progetto, e basta quelle: il resto parla d'altro.
 *
 * Non lancia mai: una riga di un progetto senza cartella lavora com'era.
 */
export function materialeDelProgetto(p: progetti.Progetto): claude.MaterialeProgetto {
  const normale = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  let altriNomi: string[] = []
  let cartella: store.Documento | null = null
  let testoRiferimento = ''
  try {
    altriNomi = [...riferimento.alias()].filter(([, id]) => id === p.id).map(([nome]) => nome)
    testoRiferimento = riferimento.leggi().testo
  } catch { /* senza riferimento si va avanti con il nome */ }
  const nomi = [normale(p.nome), ...altriNomi.map(normale)].filter(n => n.length >= 3)
  try {
    const ids = store.idsConPrefisso('lavoro:')
    const base = (id: string) => normale(id.slice(id.lastIndexOf('/') + 1))
    const id = ids.find(i => nomi.includes(base(i)))
      ?? ids.find(i => { const b = base(i); return b.length >= 3 && nomi.some(n => b.startsWith(n) || n.startsWith(b)) })
    cartella = id ? store.documento(id) : null
  } catch { /* l'indice può non esserci: la riga lavora senza cartella */ }
  const righe = testoRiferimento.split(/\n+/).map(r => r.trim())
    .filter(r => r && (nominaAmbito(r, p.nome) || altriNomi.some(a => nominaAmbito(r, a))))
  let memoria = ''
  try { memoria = projectMemoryContext(p.id) } catch { /* la memoria è un di più */ }
  return { cartella, memoria, riferimento: righe.join('\n').slice(0, 800) }
}

/**
 * È lavoro di codice, e c'è chi può metterci le mani?
 *
 * La forma la riconosce `mani.sembraLavoroDiCodice`, che la legge anche chi
 * svolge; qui resta la seconda metà — Claude Code c'è e le cartelle sono
 * collegate — che serve solo al registro. Su un server mai: lì non c'è né
 * l'eseguibile né il disco.
 */
export const sembraLavoroDiCodice = mani.sembraLavoroDiCodice
function leManiSulCodice(testo: string, nota: string | null): boolean {
  if (OSPITATO || !sembraLavoroDiCodice(testo, nota)) return false
  try { return !!lavoro.installato() && attrezzi.collegato('claude.lavora') } catch { return false }
}

/**
 * Una risposta che non risponde: congeda la riga.
 *
 * Il diciotto settembre una riga nata da un obiettivo gli ha fatto una
 * domanda, lui ha risposto «this is not relevant.», e la rotta ha fatto
 * quello che faceva con ogni risposta: l'ha attaccata alla nota e ha
 * riaffidato la riga. Il modello, obbediente, ha consegnato «Not relevant.»
 * come lavoro, e la rilettura l'ha fatto passare. Le sue parole: «He should
 * close it. It's not relevant right now.» E: «Me telling him why I removed
 * something is great so that he can learn.»
 *
 * Qui si riconosce la risposta che dice «lascia stare» o «l'ho già fatto» e
 * la si tratta per quello che è: una chiusura, con il motivo. Pura apposta.
 * Corta: oltre i duecentoquaranta caratteri è materiale, non un congedo. Si
 * guarda la prima frase; quello che viene dopo è il perché, e va in memoria.
 * Ma se dopo c'è un ordine — «not now, use the June figures» — non è un
 * congedo: è una risposta, e la riga riparte con quella.
 */
const RIEMPITIVO = /^(?:(?:no|nah|nope|ok|okay|va bene|beh|mah|yes|sì|si)[,.!]?\s+)?(?:(?:this|that|it|this one|this task|questo|questa|quello|quella|questa cosa|questa riga)(?:'s|’s|\s+is|\s+è|\s+e')?\s+)?(?:(?:really|actually|just|honestly|davvero|proprio|semplicemente)\s+)?/i
const CODA = /\s+(?:for now|right now|now|at the moment|at this time|anymore|any more|today|per ora|adesso|ora|al momento|oggi|più|piu)$/i
const LASCIA = /^(?:not (?:relevant|needed|necessary|important|now|required|useful)|no need|no longer (?:relevant|needed|necessary)|irrelevant|unnecessary|pointless|(?:maybe )?later|skip(?: (?:it|this|that|this one))?|drop(?: (?:it|this|that|this one))?|leave it|let it go|forget (?:it|about it)|never ?mind|doesn'?t matter|does not matter|cancel(?: (?:it|this))?|remove (?:it|this)|delete (?:it|this)|not any ?more|non (?:serve|è rilevante|e' rilevante|rilevante|è necessario|e' necessario|necessario|ora|adesso|per ora|importa|conta|è importante|e' importante|serve più|serve piu)|irrilevante|più tardi|piu tardi|lascia(?:mo|lo|la)? (?:stare|perdere)|salta(?:la|lo)?|dopo|togli(?:la|lo)?|cancella(?:la|lo)?|annulla(?:la|lo)?)$/i
const GIA_FATTO = /^(?:(?:already )?(?:done|completed|finished|handled|sent|approved|closed|resolved|solved|taken care of)(?: already)?|i(?:'ve| have|'d| had| already| have already|'ve already)? (?:did|done|completed|finished|handled|sent|approved|closed|resolved|solved|took care of|taken care of) (?:it|that|this|this one|everything|all|them)(?: already| myself| all)?|(?:è |e' )?(?:già )?(?:fatt[oa]|completat[oa]|mandat[oa]|inviat[oa]|chius[oa]|approvat[oa]|risolt[oa]|finit[oa]|sistemat[oa])(?: tutto)?|(?:l'ho |l’ho |ho |l'abbiamo |l’abbiamo |abbiamo )(?:già )?(?:fatt[oa]|completat[oa]|mandat[oa]|inviat[oa]|chius[oa]|approvat[oa]|risolt[oa]|finit[oa]|sistemat[oa])(?: tutto| io)?)$/i
/** Un ordine a Myynd dopo il congedo: allora non era un congedo. */
const ORDINE = /^(?:please |per favore )?(?:send|write|reply|respond|draft|prepare|use|make|add|put|take|go|check|look|find|search|call|book|schedule|update|change|keep|include|remove|ask|tell|try|focus|start|do|manda|scrivi|rispondi|prepara|usa|fai|aggiungi|metti|prendi|vai|controlla|guarda|cerca|chiama|fissa|aggiorna|cambia|tieni|includi|togli|chiedi|di'|prova|comincia|parti)\b/i

export function rispostaCheChiude(testo: string): 'lasciato' | 'fatto' | null {
  const pulito = testo.replace(/\s+/g, ' ').trim()
  if (!pulito || pulito.length > 240) return null
  const frasi = pulito.split(/\s*[.;:!?\n]+\s*|\s*,\s*/).map(f => f.trim()).filter(Boolean)
  // «No, skip it»: l'interiezione davanti non è la frase
  while (frasi.length > 1 && /^(?:no|nah|nope|ok|okay|yes|sì|si|va bene|beh|mah)$/i.test(frasi[0])) frasi.shift()
  if (!frasi.length) return null
  const testa = frasi[0].replace(RIEMPITIVO, '').replace(/['’]/g, "'").trim().toLowerCase()
  // «not relevant now» e «not now»: la coda si toglie, ma non se era la frase
  const forme = [testa, testa.replace(CODA, '').trim()]
  const resto = frasi.slice(1)
  if (resto.some(f => ORDINE.test(f))) return null
  if (forme.some(f => GIA_FATTO.test(f))) return 'fatto'
  if (forme.some(f => LASCIA.test(f))) return 'lasciato'
  return null
}

/** I modi che passano dalla rilettura: quelli che portano la sua firma. */
const RILETTI = new Set(['bozza', 'tutto'])
/** Un compito che è scrivere *a qualcuno*: la cosa resta sulla riga, da dove si manda. */
const EPISTOLARE = /\b(?:mail|e-?mail|reply|repl\w*|respond\w*|answer\w*|send|sending|forward|message|messages|write\s+(?:back\s+)?to\b|rispond\w*|risposta|mand\w*|invi\w*|inoltr\w*|messagg\w*|scriv\w*\s+(?:a|al|alla|allo|ai|agli|alle)\b)/i

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
async function preparaLaMail(c: store.Compito, bozza: string, fonti: claude.Fonte[], o?: { consegna?: 'it' | 'en'; candidati?: { id: string; label: string }[] }) {
  try {
    // Un prompt non è una email, anche quando dentro c'è scritto «scrivi a
    // Rossi» con tanto di saluto: è la richiesta di scriverla, da incollare
    // altrove. `sembraUnMessaggio` guarda i verbi e le formule e ci cascherebbe
    // in pieno — e la riga si accenderebbe con un «Manda a Rossi» sotto un
    // testo che comincia con «Sei un assistente».
    if (c.modo === 'prompt') return
    if (!ferri.postaCollegata()) return
    if (!invio.sembraUnMessaggio(c.testo, bozza, [c.doc, ...fonti.map(f => f.id)])) return
    const e = await ferri.preparaEmail(c.testo, bozza, fonti, c.doc, o)
    if (!e || richiamati.has(chiave(c.id))) return
    if (store.compito(c.id)?.stato !== 'pronto') return
    // la cornice non arriva mai a chi riceve, qualunque cosa abbia capito il modello
    const email: store.EmailPronta = { ...e, corpo: corpoPerChiRiceve(e.corpo), conosciuto: e.a ? store.indirizzoConosciuto(e.a) : false }
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
 * Quello che risponde a una domanda, o come corregge un'ipotesi (P3).
 *
 * Una risposta insegna dove passa il confine di quello che sa; una
 * correzione («lunedì, non venerdì») insegna come decide. Tutte e due vanno
 * in memoria dopo che la rotta ha risposto, e non lanciano mai.
 */
export function imparaDallaRisposta(
  c: { testo: string },
  /** Quello che Myynd aveva chiesto, o l'ipotesi che aveva scritto. */
  detto: string | null | undefined,
  testo: string,
  origine: 'risposta' | 'correzione'
) {
  const risposta = (testo ?? '').trim()
  if (!risposta) return
  const suo = (detto ?? '').trim().slice(0, 600)
  ferri.distilla([
    {
      ruolo: 'a',
      testo: `Aveva affidato: «${c.testo}». ${origine === 'correzione' ? 'Myynd aveva supposto' : 'Myynd le aveva chiesto'}: ${suo || '(niente di scritto)'}`
    },
    { ruolo: 'u', testo: risposta }
  ], origine).catch(() => { /* la memoria è un di più */ })
}

/**
 * Le righe ferme su un blocco, riprese quando la fonte si collega (P3).
 *
 * «Collega la posta e la riprendo da qui» è una promessa: si mantiene qui,
 * a qualunque età della riga, perché la riga la dice finché resta ferma.
 * La posta riparte quando la posta è collegata, i file quando c'è una
 * cartella, gli altri due a ogni collegamento aggiunto o cambiato e a ogni
 * fonte che guarisce (`annunciaSalute`, non quando una si rompe). Nessuna
 * più di una volta al giorno per riga (a memoria, per persona): una riga
 * che torna a bloccarsi non deve rifare il lavoro intero a ogni giro. Non
 * lancia mai.
 *
 * All'avvio (`avvio`) si guarda una volta, per chi ha dato un permesso e
 * riaperto Myynd come la riga fissa gli ha chiesto (P8, «Riapri Myynd»):
 * un permesso non passa da nessuna rotta. Le righe ferme su un'altra fonte
 * no: una fonte si collega solo con Myynd aperto, e una che era rotta
 * guarisce alla prima lettura, che passa da qui da sola.
 *
 * E nessuna finché il motore che lavora ha la chiave respinta (P8): il
 * lavoro ripreso morirebbe sulla chiave, e il guaio della chiave si
 * scriverebbe sulla riga al posto di «la riprendo da qui», che a quel punto
 * non sarebbe più una riga ferma e non riprenderebbe mai più. Si aspetta,
 * senza contare il giorno: la chiave rimessa a posto passa di qui.
 */
const ripresi = new Map<string, number>()
const RIPRESA_OGNI = 24 * 3_600_000
export async function riprendiBloccati(o: { avvio?: boolean } = {}): Promise<number> {
  let quante = 0
  try {
    if (ferri.motoreRifiutato()) return 0
    if (o.avvio && !ferri.motorePronto()) return 0
    const conf = cfg.leggi()
    const posta = ferri.postaCollegata()
    const file = !!conf.desktop?.cartelle?.length
    for (const c of lavoroDati.bloccatiDaRiprendere()) {
      const g = generaBlocco(c.guaio)
      if (!g || (o.avvio && g === 'fonte')) continue
      const k = chiave(c.id)
      const adesso = Date.now()
      const fonteViva = g === 'posta' ? posta : g === 'file' ? file : true
      if (!fonteViva || adesso - (ripresi.get(k) ?? 0) < RIPRESA_OGNI) continue
      ripresi.set(k, adesso)
      const m = lavoroDati.misura(c.id)
      affida(c.id, c.modo && c.modo !== 'io' ? c.modo : 'tutto', m?.origine !== 'fondo')
      quante++
      console.info(`myynd · lavoro · ${c.id} · ripresa · ${g}`)
    }
  } catch (e) {
    console.warn('myynd · non riesco a riprendere le righe bloccate:', e instanceof Error ? e.message : e)
  }
  if (quante) annunciaCambio()
  return quante
}

/** Solo per le prove: dimentica quando ha ripreso le righe. */
export function scordaRiprese() { ripresi.clear() }

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
  memoria.imparaDallaCorrezione(bozza, tenuto)
    .catch(e => console.warn('myynd · la correzione non è arrivata alla memoria:', e instanceof Error ? e.message : e))
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
  esito?: string,
  /**
   * La domanda che Myynd le aveva fatto, se la chiusura è la risposta a una
   * domanda: «this is not relevant.» detto a «cosa deve esserci alla fine?»
   * insegna dove passa il confine, e senza la domanda accanto è solo un no.
   */
  chiesto?: string | null
) {
  const parole = (esito ?? '').trim()
  if (parole.split(/\s+/).filter(Boolean).length < 4) return

  const lasciata = stato === 'lasciato'
  const domanda = (chiesto ?? '').trim()
  ferri.distilla([
    { ruolo: 'a', testo: `Aveva in lista: «${c.testo}»${c.nota ? `\nCon questa nota: ${c.nota}` : ''}${domanda ? `\nMyynd le aveva chiesto: ${domanda.slice(0, 400)}` : ''}` },
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
