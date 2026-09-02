// Le automazioni: il lavoro che si fa da solo.
//
// Un'automazione è una *ricetta*, non un programma. Quattro campi: quando
// guardare, cosa guardare, cosa farne, dove metterlo. Chi costruisce Myynd le
// scrive per un'azienda; chi la usa se le ritrova già lì, e può spegnerle.
//
// La distinzione fra ricetta e programma è la cosa più importante di questo
// file, e non è pignoleria architettonica. Se un'automazione fosse codice,
// installarne una vorrebbe dire far girare il programma di qualcun altro su una
// macchina che legge la posta di un'azienda: non c'è modo di renderlo sicuro né
// di renderlo verificabile da chi lo subisce. Essendo dati, invece, il motore è
// uno solo — questo, controllabile una volta per tutte — e quello che viaggia
// da azienda ad azienda sono quattro campi che non possono fare niente di
// diverso da quello che il motore già sa fare.
//
// Il secondo effetto è che una ricetta non contiene niente di nessuno. Nessun
// nome, nessun indirizzo, nessuna cifra. Si può tenere in un repository, si può
// leggere in un diff, si può spedire: non c'è dentro un solo dato del cliente.
//
// E la regola che non si tratta, la stessa di tutto il resto: **un'automazione
// prepara, non manda**. Scrive la bozza e la mette in lista; premere invio
// resta un gesto di una persona. Il giorno che un'automazione scrive da sola a
// un cliente, questo prodotto ha smesso di essere affidabile e non torna più.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { cartella, leggi, nellaLingua , lingua as cfgLingua } from './config.ts'
import * as ricettario from './ricettario.ts'
import { chiediJSON } from './modello.ts'
import * as store from './store.ts'
import * as compiti from './compiti.ts'
import * as ordine from './ordine.ts'
import * as attrezzi from './attrezzi.ts'

// — la forma di una ricetta —

export type Quando =
  /** Ogni giorno a un'ora. */
  | { ogni: 'giorno'; ora: number }
  /** Ogni settimana, in un giorno (1 = lunedì) a un'ora. */
  | { ogni: 'settimana'; giorno: number; ora: number }
  /** Dopo una lettura delle fonti che ha portato qualcosa di nuovo. */
  | { quandoArriva: true }

export type Automazione = {
  id: string
  nome: string
  /** Una riga, per chi la legge nell'elenco. Non è un commento: si vede. */
  spiega: string
  quando: Quando
  guarda: {
    /** Una ricerca nell'indice, con le parole che userebbe chi ha scritto il documento. */
    cerca?: string
    /** Solo quello che è arrivato dall'ultima volta che è girata. */
    soloNuovi?: boolean
    limite?: number
  }
  /** L'istruzione: cosa deve farne. È il testo che leggerà il modello. */
  fai: string
  metti: {
    inLista: 'oggi' | 'settimana' | 'poi'
    /** 'io' la scrive e basta; 'bozza' e 'tutto' la fanno anche svolgere. */
    modo?: 'io' | 'bozza' | 'tutto'
  }
  /**
   * Invece di scrivere un testo, sceglie dei messaggi e propone di metterli via.
   *
   * È l'unico modo in cui un'automazione può arrivare a *toccare* qualcosa, e
   * arriva a un passo dal farlo: sceglie, mostra l'elenco uno per uno con il
   * perché di ognuno, e si ferma. Il verbo lo esegue il bottone di una persona.
   * Vocabolario chiuso: il motore sa fare queste due cose e nient'altro, e
   * nessuna delle due cancella niente — il cestino e l'archivio sono cartelle.
   */
  proponi?: 'posta.cestina' | 'posta.archivia'
  /**
   * Cosa può aprire mentre gira.
   *
   * Vocabolario chiuso — quello di `attrezzi.ts` — e per la stessa ragione per
   * cui `proponi` lo è: un nome qui dentro è un *permesso*, e un permesso che
   * si può inventare non è un permesso. Vuoto vuol dire quello che le
   * automazioni hanno sempre fatto: frugare nell'indice e basta.
   *
   * Il senso vero si vede sulla scheda: chi la guarda legge in chiaro che
   * quella cosa lì, alle sette di mattina, apre la sua posta. E può togliere
   * la riga.
   */
  attrezzi?: string[]
  /**
   * In che cartella lavora Claude Code, per le automazioni che ce l'hanno.
   *
   * Sta nella ricetta e non nel database perché è parte di *cosa fa*, non di
   * come te la sei organizzata: un'automazione che guarda il progetto sbagliato
   * non è la stessa automazione. Il recinto lo mette comunque `lavoro.ts` —
   * solo dentro le cartelle collegate — e questo campo non lo allarga.
   */
  cartella?: string
  /** Spenta nella ricetta stessa: serve a spedirne una senza accenderla. */
  spenta?: boolean
  /**
   * La stessa ricetta in inglese. Obbligatoria, e non per pignoleria.
   *
   * Quello che c'è qui dentro non resta nel file: `nome` diventa la riga che
   * compare nella lista di chi usa Myynd, `spiega` la frase sotto il nome nella
   * schermata, e `fai` l'istruzione che legge il modello. Una ricetta scritta
   * solo in italiano è un pezzo di app che non sa cambiare lingua — e si vede
   * subito, perché la riga italiana si siede in mezzo a una lista inglese.
   * Rifiutarla qui è l'unico posto in cui il difetto non può passare.
   *
   * `cerca` è la metà che non si vede ed è la più importante. Sono le parole
   * con cui l'automazione fruga l'indice: cercare «fattura importo scadenza»
   * dentro una casella inglese non trova poco, non trova *niente*, e
   * l'automazione gira ogni giorno dicendo che non c'era nulla da fare. Sembra
   * spenta, e invece sta cercando in una lingua che quei documenti non parlano.
   */
  en: { nome: string; spiega: string; fai: string; cerca?: string }
}

// — leggerle dal disco —

const CAMPI = new Set([
  'id', 'nome', 'spiega', 'quando', 'guarda', 'fai', 'metti', 'spenta', 'en', 'proponi',
  'attrezzi', 'cartella'
])
const PROPOSTE = ['posta.cestina', 'posta.archivia']
const SECCHI = ['oggi', 'settimana', 'poi']
const MODI = ['io', 'bozza', 'tutto']

/**
 * Una ricetta valida, o un errore che dice cosa non va.
 *
 * Severo apposta, e rumoroso apposta. Un campo che il motore non conosce non si
 * ignora: si rifiuta la ricetta e si stampa perché. Una ricetta accettata a
 * metà è la cosa peggiore che possa succedere qui — girerebbe ogni giorno
 * facendo *quasi* quello che c'era scritto, e nessuno se ne accorgerebbe.
 */
function valida(x: unknown, da: string): Automazione {
  const male = (p: string): never => { throw new Error(`${da}: ${p}`) }
  if (!x || typeof x !== 'object' || Array.isArray(x)) male('non è un oggetto')
  const a = x as Record<string, unknown>

  for (const k of Object.keys(a)) if (!CAMPI.has(k)) male(`non so cosa sia il campo «${k}»`)
  for (const k of ['id', 'nome', 'spiega', 'fai']) {
    if (typeof a[k] !== 'string' || !(a[k] as string).trim()) male(`«${k}» manca o è vuoto`)
  }

  const q = a.quando as Record<string, unknown> | undefined
  if (!q || typeof q !== 'object') male('«quando» manca')
  if (q!.quandoArriva !== true) {
    if (q!.ogni !== 'giorno' && q!.ogni !== 'settimana') male('«quando.ogni» dev\'essere giorno o settimana')
    const ora = Number(q!.ora)
    if (!Number.isInteger(ora) || ora < 0 || ora > 23) male('«quando.ora» dev\'essere un\'ora fra 0 e 23')
    if (q!.ogni === 'settimana') {
      const g = Number(q!.giorno)
      if (!Number.isInteger(g) || g < 0 || g > 6) male('«quando.giorno» dev\'essere fra 0 (domenica) e 6')
    }
  }

  const g = a.guarda as Record<string, unknown> | undefined
  if (!g || typeof g !== 'object') male('«guarda» manca')
  if (!g!.cerca && !g!.soloNuovi) male('«guarda» dev\'essere almeno una ricerca o soloNuovi')
  if (g!.cerca !== undefined && typeof g!.cerca !== 'string') male('«guarda.cerca» dev\'essere testo')

  const en = a.en as Record<string, unknown> | undefined
  if (!en || typeof en !== 'object' || Array.isArray(en)) male('«en» manca: una ricetta si scrive in tutte e due le lingue')
  for (const k of ['nome', 'spiega', 'fai']) {
    if (typeof en![k] !== 'string' || !(en![k] as string).trim()) male(`«en.${k}» manca o è vuoto`)
  }
  if (!!g!.cerca !== !!en!.cerca) {
    male('«en.cerca» dev\'esserci se e solo se c\'è «guarda.cerca»: una ricerca in italiano non trova documenti inglesi')
  }

  if (a.proponi !== undefined && !PROPOSTE.includes(String(a.proponi))) {
    male(`«proponi» dev'essere ${PROPOSTE.join(' o ')}`)
  }

  /*
   * Gli attrezzi si controllano uno per uno, e un nome sconosciuto **rifiuta
   * la ricetta** invece di essere ignorato.
   *
   * Ignorarlo sarebbe la cosa peggiore: una ricetta che chiede `posta.manda`
   * e gira lo stesso è un'automazione che una persona crede faccia una cosa
   * e ne fa un'altra — la stessa trappola contro cui è scritto tutto il resto
   * di questo `valida`. Meglio un errore rumoroso adesso.
   */
  if (a.attrezzi !== undefined) {
    if (!Array.isArray(a.attrezzi)) male('«attrezzi» dev\'essere un elenco')
    for (const x of a.attrezzi as unknown[]) {
      if (typeof x !== 'string' || !attrezzi.esiste(x)) {
        male(`«attrezzi» non conosce «${String(x)}»: sono ${attrezzi.ATTREZZI.map(t => t.nome).join(', ')}`)
      }
    }
  }
  if (a.cartella !== undefined && typeof a.cartella !== 'string') male('«cartella» dev\'essere un percorso')

  const m = a.metti as Record<string, unknown> | undefined
  if (!m || typeof m !== 'object') male('«metti» manca')
  if (!SECCHI.includes(String(m!.inLista))) male('«metti.inLista» dev\'essere oggi, settimana o poi')
  if (m!.modo !== undefined && !MODI.includes(String(m!.modo))) male('«metti.modo» dev\'essere io, bozza o tutto')

  return a as unknown as Automazione
}

/**
 * Dove stanno le tue.
 *
 * Un file JSON in `~/.myynd/automazioni`, cioè esattamente la stessa cosa che
 * arriva dall'azienda. Non una tabella a parte, non un formato «per l'utente»:
 * la ricetta che ti scrivi tu e quella che ti scrive chi ti ha installato
 * Myynd sono lo stesso oggetto, passano dallo stesso `valida()` e girano nello
 * stesso motore. È quello che rende vera la risposta alla domanda «posso farne
 * una io?» — sì, e non è una versione ridotta di niente.
 */
// una funzione e non una costante: con più persone, «le tue» sono di chi chiede
export const MIE = () => join(cartella(), 'automazioni')

/** Dove stanno le ricette: le tue, quelle di tutti, quelle di questa azienda. */
function cartelle(): string[] {
  const radice = join(import.meta.dirname, '..', 'automazioni')
  if (!existsSync(radice)) return []
  /*
   * Quelle del pacchetto solo se le ha chieste.
   *
   * Prima si caricavano sempre, e su un conto nuovo volevano dire undici
   * automazioni che nessuno aveva scritto — su fatture, preventivi e clienti
   * di un'azienda immaginaria. Chi apriva Myynd per la prima volta cominciava
   * cancellandole. Sono un buon punto di partenza per chi le vuole e un
   * ingombro per tutti gli altri, e la differenza fra le due cose è una riga
   * che si accende.
   */
  if (!leggi().diSerie) return [MIE()].filter(existsSync)
  const fuori = [join(radice, '_comuni')]
  // La licenza dice di che azienda è questa installazione, e quindi quali
  // ricette le appartengono. Non è un dato personale: è il nome di un cliente,
  // e serve solo a scegliere una cartella.
  const azienda = (leggi().licenza ?? '').trim()
  if (azienda && /^[a-z0-9-]+$/i.test(azienda)) fuori.push(join(radice, azienda))
  // e quelle arrivate dopo, che vincono su quelle del pacchetto: è tutto il
  // punto: correggere una ricetta senza rifare l'app. Le tue vincono su tutte,
  // e in ultima fila apposta: quello che ti sei scritto tu non deve poterti
  // essere sovrascritto da un aggiornamento.
  return [...fuori, ...ricettario.cartelleScaricate(azienda), MIE()].filter(existsSync)
}

/*
 * Una cache per cartella, non una sola.
 *
 * Le ricette dipendono da chi chiede: `cartelle()` passa da `cartella()` e da
 * `leggi()`, che con più persone sullo stesso server rispondono ognuna per la
 * sua. Con una variabile sola chi la riempiva per primo — all'avvio, il primo
 * conto dell'elenco — decideva l'elenco per tutti: le automazioni personali di
 * A comparivano a B, e il giro delle sette le faceva girare sull'indice di B,
 * mentre quelle di B non giravano mai. Senza un errore da nessuna parte.
 */
const cache = new Map<string, Automazione[]>()

export function ricette(): Automazione[] {
  const chiave = cartella()
  const pronte = cache.get(chiave)
  if (pronte) return pronte
  const fuori: Automazione[] = []
  const visti = new Set<string>()
  for (const c of cartelle()) {
    for (const f of readdirSync(c).filter(n => n.endsWith('.json')).sort()) {
      const dove = join(c, f)
      try {
        const a = valida(JSON.parse(readFileSync(dove, 'utf8')), f)
        // la cartella dell'azienda vince su quella comune: si può correggere
        // una ricetta per un cliente solo senza toccare quella di tutti
        if (visti.has(a.id)) {
          const i = fuori.findIndex(x => x.id === a.id)
          fuori[i] = a
        } else {
          visti.add(a.id)
          fuori.push(a)
        }
      } catch (e) {
        console.error(`myynd · automazione scartata (${dove}):`, e instanceof Error ? e.message : e)
      }
    }
  }
  cache.set(chiave, fuori)
  return fuori
}

/** Rileggerle dal disco, per tutti: serve in sviluppo, e dopo un aggiornamento. */
export function scordaLeRicette() { cache.clear() }

// — le tue —

/** È tua? Cioè: si può cambiare e si può buttare. */
export function eMia(id: string): boolean {
  return existsSync(join(MIE(), `${id}.json`))
}

/**
 * Un identificativo che non collide e che si legge.
 *
 * Dal nome, come si fa con i file, e con un numero in coda se quel nome c'è
 * già. Non un UUID: questi file uno se li ritrova in una cartella e deve poter
 * capire quale sia quale senza aprirli.
 */
export function idPer(nome: string, esistenti: Set<string>): string {
  const base = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'automazione'
  if (!esistenti.has(base)) return base
  for (let i = 2; i < 999; i++) if (!esistenti.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now()}`
}

/**
 * Scrive una ricetta tua.
 *
 * Passa dallo stesso `valida()` di quelle che arrivano dalla rete, e non è una
 * formalità: il motore sa fare quello che sa fare, e una ricetta scritta a mano
 * — o dettata a un modello — può contenere un campo che non esiste o un secchio
 * che non c'è. Meglio un errore adesso, mentre la stai scrivendo, che una cosa
 * che gira ogni mattina facendo *quasi* quello che avevi chiesto.
 */
export function scrivi(x: unknown): Automazione {
  const a = valida(x, 'la tua automazione')
  if (!existsSync(MIE())) mkdirSync(MIE(), { recursive: true, mode: 0o700 })
  writeFileSync(join(MIE(), `${a.id}.json`), JSON.stringify(a, null, 2), { mode: 0o600 })
  // scriverne una vuol dire volerla: se una con questo nome era stata tolta di
  // mezzo, torna. Senza, il file c'è, la ricetta è valida, e in elenco non
  // compare niente — e la scrivi una seconda volta pensando di aver sbagliato.
  store.rivediAutomazione(a.id)
  store.vediAutomazione(a.id)
  scordaLeRicette()
  return a
}

/**
 * La butta.
 *
 * Le tue sono un file e si cancellano. Quelle del pacchetto no — quel file non
 * è tuo — e allora si segna che per te non esistono. Da fuori è la stessa cosa,
 * ed è quello che conta: undici righe che non c'entrano con come lavori non
 * sono un catalogo, sono ingombro, e doverle solo spegnere le lascia lì.
 */
export function butta(id: string): boolean {
  if (!ricette().some(a => a.id === id)) return false
  if (eMia(id)) {
    rmSync(join(MIE(), `${id}.json`), { force: true })
    store.scordaAutomazione(id)
  }
  // anche per una tua: se dietro c'era quella del pacchetto, togliendo il tuo
  // file ricomparirebbe quella
  store.togliAutomazione(id)
  scordaLeRicette()
  return true
}

/**
 * Quand'è il suo turno. Una definizione sola, letta da due parti.
 *
 * Prima ce n'erano due: `prossima()`, che disegnava la riga «domani alle 9»
 * sulla scheda, e `tocca()`, che decideva se farla girare. Scritte separate,
 * con due logiche che si somigliavano — ed è il modo esatto in cui una
 * schermata comincia a promettere una cosa mentre il motore ne fa un'altra,
 * senza che niente vada in errore.
 *
 * **Il turno si conta dall'ultima volta, non dall'orologio di adesso**, ed è
 * la riparazione che conta di più in questo file. La versione di prima
 * chiedeva «che ora è, ed è il giorno giusto?»:
 *
 *   · un'automazione settimanale del lunedì, su un computer spento tutto il
 *     lunedì, saltava la settimana. Non «girava martedì»: non girava, e la
 *     settimana dopo ricominciava da capo. Chi è fuori il lunedì non l'ha mai
 *     vista girare, e non c'era niente da nessuna parte che lo dicesse.
 *   · una giornaliera alle 23 su un computer che alle 23 è spento non girava
 *     mai. Mai una volta. L'interruttore era acceso, la scheda diceva
 *     «domani alle 23», e non succedeva niente per sempre.
 *
 * Adesso il turno è **la prima occorrenza dopo l'ultima volta**: se è passata,
 * è scaduta, e si recupera al primo giro utile. Una sola volta, non una per
 * ogni giorno saltato — tre righe identiche di lunedì non sono un recupero,
 * sono la lista rovinata.
 *
 * `null` vuol dire «mai a orologio»: spenta, o di quelle che aspettano
 * l'arrivo di qualcosa.
 */
export function scadenza(a: Automazione, s: store.StatoAutomazione | null, adesso = new Date()): Date | null {
  if (a.spenta || s?.spenta) return null
  const q = a.quando
  if ('quandoArriva' in q) return null

  /*
   * Da dove si conta.
   *
   * L'ultima volta che è girata, se è girata. Altrimenti da quando esiste — e
   * quel `dal` è tutta la differenza fra «appena scritta, aspetta il suo
   * orario» e «in ritardo di tre giorni, recuperala subito». Senza, una
   * automazione nuova creata a mezzogiorno con «ogni giorno alle 9» partirebbe
   * all'istante, che non è quello che ha chiesto nessuno.
   *
   * Se non c'è nemmeno quello — una ricetta vista per la prima volta proprio
   * adesso — si conta da adesso: aspetta il primo turno vero.
   */
  const base = new Date(s?.ultima ?? s?.dal ?? adesso)

  /*
   * Il confine è aperto o chiuso a seconda di cosa sia la base, e i due casi
   * vogliono davvero risposte opposte.
   *
   * Se la base è **l'ultima volta che è girata**, il confine è aperto: il
   * turno è quello *dopo*, o un'automazione girata alle 9 in punto ripartirebbe
   * alle 9 in punto, per sempre.
   *
   * Se la base è **da quando esiste**, il confine è chiuso: una scritta stamattina
   * alle 8, con «ogni giorno alle 9», deve girare oggi alle 9 — non domani. Con
   * il confine aperto salterebbe il suo primo giorno, che è proprio quello in
   * cui chi l'ha appena scritta sta lì a guardare se funziona.
   */
  const dopoLUltima = !!s?.ultima
  const passato = (x: Date) => dopoLUltima ? x <= base : x < base

  const d = new Date(base)
  d.setMinutes(0, 0, 0)
  d.setHours(q.ora)

  if (q.ogni === 'giorno') {
    if (passato(d)) d.setDate(d.getDate() + 1)
    return d
  }
  // il prossimo giorno giusto della settimana dopo la base
  const manca = (q.giorno - d.getDay() + 7) % 7
  d.setDate(d.getDate() + manca)
  if (passato(d)) d.setDate(d.getDate() + 7)
  return d
}

/**
 * Quando girerà la prossima volta.
 *
 * Serve a una cosa sola, ed è la cosa che mancava: un interruttore acceso non
 * dice *quando*. «Gira da sola» senza un «la prossima volta domani alle 9» è
 * una promessa senza data, e da lì nasce il dubbio se il bottone «provala
 * adesso» serva a farla partire davvero.
 */
export function prossima(a: Automazione, s: store.StatoAutomazione | null, adesso = new Date()): string | null {
  return scadenza(a, s, adesso)?.toISOString() ?? null
}

/**
 * Va a vedere se ce ne sono di nuove, e se sì le prende.
 *
 * Il `valida` che passa di qui è lo stesso che passano le ricette di serie: una
 * scritta male non entra, e non entra prima ancora di toccare il disco. È la
 * sola ragione per cui una cartella che arriva dalla rete si può leggere senza
 * chiedersi cosa contenga.
 */
export async function aggiornaRicette(): Promise<ricettario.Esito | null> {
  const c = leggi()
  const repo = c.ricette?.repo?.trim()
  if (!repo) return null
  const e = await ricettario.aggiorna(
    { repo, ramo: c.ricette?.ramo, token: c.ricette?.token, licenza: c.licenza },
    valida
  )
  if (e.nuove || e.cambiate || e.tolte) {
    scordaLeRicette()
    console.log(
      `myynd · ricette: ${e.nuove} nuove, ${e.cambiate} cambiate, ${e.tolte} tolte` +
      (e.scartate ? `, ${e.scartate} scartate` : '')
    )
  }
  if (e.guaio) console.error('myynd · le ricette non si sono aggiornate:', e.guaio)
  return e
}

/** Quand'è andata l'ultima volta. Serve alla schermata, non al motore. */
export function statoRicette() {
  return { ...ricettario.stato(), repo: leggi().ricette?.repo?.trim() || null }
}

/**
 * La ricetta nella lingua di chi la legge.
 *
 * Va fatto qui e non nell'interfaccia, e la differenza non è di stile. Il nome
 * di un'automazione non finisce solo in una schermata: `fai()` lo scrive dentro
 * il compito, cioè nel database, e da lì passa nella lista di oggi, nella
 * chiamata al modello e nel registro delle azioni. Il client può tradurre
 * quello che disegna adesso; non può tradurre una riga scritta stanotte alle
 * nove da un'automazione. Perciò la lingua si sceglie nel punto in cui la
 * ricetta esce dal file — una volta, per tutti quelli che la useranno.
 */
export function nella(a: Automazione, lingua = leggi().lingua): Automazione {
  // l'italiano solo se è stato scelto: su un conto nuovo `lingua` non c'è, e
  // con il confronto al contrario le ricette di serie uscivano tutte italiane
  if (lingua === 'it') return a
  return {
    ...a,
    nome: a.en.nome,
    spiega: a.en.spiega,
    fai: a.en.fai,
    guarda: a.en.cerca ? { ...a.guarda, cerca: a.en.cerca } : a.guarda
  }
}

/**
 * Le righe già in lista, ridette nell'altra lingua.
 *
 * Un compito nato da un'automazione porta il nome della ricetta e la sua
 * istruzione: è testo nostro, non tuo, e quando cambi lingua deve cambiare con
 * il resto. Senza questo, la lista resta metà e metà — ed è il posto in cui si
 * nota di più, perché è la schermata che si guarda ogni mattina.
 *
 * Si tocca solo quello che è ancora *identico* a come l'ha scritto
 * l'automazione: se ci hai messo mano, quella riga è tua e resta com'è. E non
 * si chiede niente a nessun modello — la stessa frase nell'altra lingua è già
 * scritta nella ricetta.
 */
export function rinominaInLista(lingua: string): number {
  const daltra = lingua === 'it' ? 'en' : 'it'
  const perId = new Map(ricette().map(r => [r.id, r]))
  let n = 0
  for (const c of store.elencoCompiti()) {
    if (!c.origine?.startsWith('auto:')) continue
    const r = perId.get(c.origine.slice(5))
    if (!r) continue
    const da = nella(r, daltra)
    const a = nella(r, lingua)
    const cambio: { testo?: string; nota?: string } = {}
    if (c.testo === da.nome && a.nome !== da.nome) cambio.testo = a.nome
    // la nota è l'istruzione più l'elenco di cosa guardare: si cambia la testa
    // e si lascia la coda, che sono titoli di documenti e non si traducono
    if (c.nota?.startsWith(da.fai) && a.fai !== da.fai) cambio.nota = a.fai + c.nota.slice(da.fai.length)
    if (!cambio.testo && !cambio.nota) continue
    store.cambiaCompito(c.id, cambio)
    n++
  }
  return n
}

// — quando tocca a una —

function stessoGiorno(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function tocca(a: Automazione, s: store.StatoAutomazione | null, adesso = new Date()): boolean {
  const d = scadenza(a, s, adesso)
  return !!d && d <= adesso
}

/**
 * È in ritardo? Cioè: il suo turno è passato mentre nessuno guardava.
 *
 * Non cambia niente a quello che fa il motore — `tocca` la farà girare
 * comunque al primo giro — ma cambia cosa si legge sulla scheda. «Giovedì alle
 * 09:00» scritto di venerdì è una riga che sembra un guasto; «a breve» è
 * quello che sta per succedere davvero.
 */
export function inRitardo(a: Automazione, s: store.StatoAutomazione | null, adesso = new Date()): boolean {
  return tocca(a, s, adesso)
}

// — farne una —

/**
 * Il materiale che questa ricetta guarda.
 *
 * `soloNuovi` parte dall'ultima volta che è girata: è quello che rende
 * un'automazione «guarda cos'è arrivato» invece di «guarda tutto da capo».
 */
function materiale(a: Automazione, s: store.StatoAutomazione | null) {
  const limite = Math.min(Math.max(a.guarda.limite ?? 8, 1), 20)

  /*
   * Le fonti di questa ricetta, se le ha dichiarate.
   *
   * Un'automazione che dice `posta.leggi` non deve ricevere in pasto i file del
   * disco nella pescata iniziale: se li riceve, il modello ci lavora sopra e la
   * dichiarazione diventa una decorazione. Si guardano solo gli attrezzi di
   * lettura dell'indice — `agenda`, `chat` e `claude.lavora` non hanno
   * documenti da restringere, e se sono i soli dichiarati la pescata resta
   * quella di sempre.
   */
  const dentro = fontiDi(a)

  if (a.guarda.soloNuovi) {
    const dal = s?.ultima ?? new Date(Date.now() - 7 * 86_400_000).toISOString()
    const nuovi = store.appenaArrivati(dal, limite * 3)
      .filter(d => !dentro || dentro.includes(d.fonte))
      .slice(0, limite)
    if (!a.guarda.cerca) return nuovi
    // sia nuovi sia pertinenti: l'intersezione, che è quasi sempre quello che
    // si intende con «quando arriva una fattura»
    const pertinenti = new Set(store.cerca(a.guarda.cerca, 40, dentro).map(d => d.id))
    return nuovi.filter(d => pertinenti.has(d.id))
  }
  return store.cerca(a.guarda.cerca ?? '', limite, dentro)
}

/**
 * Le fonti dell'indice che questa ricetta si è concessa.
 *
 * `undefined` vuol dire «tutte», ed è il caso di chi non ha dichiarato niente
 * — cioè ogni ricetta scritta prima di oggi. Un elenco vuoto sarebbe stato lo
 * stesso valore in JavaScript con un significato opposto, ed è la ragione per
 * cui qui si torna `undefined` e non `[]`.
 */
function fontiDi(a: Automazione): string[] | undefined {
  const suoi = attrezzi.ripulisci(a.attrezzi)
  if (!suoi.length) return undefined
  /*
   * La tabella sta in `attrezzi.ts`, e non è una comodità.
   *
   * Qui c'era una catena di `if` che ripeteva a mano la stessa corrispondenza
   * già scritta là dentro. Due elenchi della stessa cosa divergono sempre, e
   * questo divergeva nel modo peggiore: un attrezzo nuovo che nessuno aggiunge
   * qui **non restringe niente**, cioè l'automazione che dichiara «guardo solo
   * Slack» riceve in pasto tutta la posta e tutto il disco. Nessun errore, e la
   * dichiarazione sulla scheda diventa una decorazione. Un elenco solo, letto
   * da tutti e due, non può divergere.
   */
  const fonti = new Set(suoi.flatMap(n => attrezzi.fontiDi(n)))
  // solo attrezzi che non leggono l'indice: la pescata resta quella di sempre
  return fonti.size ? [...fonti] : undefined
}

// — le automazioni che propongono invece di scrivere —

const SCELTA = {
  type: 'object',
  properties: {
    voci: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          perche: { type: 'string' }
        },
        required: ['id', 'perche'],
        additionalProperties: false
      }
    }
  },
  required: ['voci'],
  additionalProperties: false
} as const

/**
 * Quali di questi messaggi si possono mettere via.
 *
 * Due cose rendono questa chiamata diversa da tutte le altre dell'app, e sono
 * scritte nel prompt perché è lì che devono valere:
 *
 * — si sceglie *per esclusione al contrario*. Non «quali sembrano poco
 *   importanti», ma «quali sono certamente posta di massa». Nel dubbio non si
 *   sceglie: una newsletter che resta in casella non è costata niente a
 *   nessuno, una fattura finita nel cestino sì.
 * — ogni scelta porta il suo perché, e il perché dev'essere *controllabile*.
 *   «Sembra pubblicità» non lo è; «Newsletter di Vinted, con il link per
 *   disiscriversi in fondo» lo è. È la riga che una persona legge prima di
 *   premere, ed è tutto quello che ha per accorgersi di un errore.
 */
async function cernita(a: Automazione, docs: store.Documento[]): Promise<store.Proposta | null> {
  if (!a.proponi) return null
  // solo posta: gli altri documenti non hanno una casella da cui toglierli
  const solaPosta = docs.filter(d => d.id.startsWith('posta:'))
  if (!solaPosta.length) return null

  const cestino = a.proponi === 'posta.cestina'
  const out = await chiediJSON<{ voci: { id: string; perche: string }[] }>({
    lavoro: 'cernita',
    max_tokens: 2000,
    system:
      `Scrivi in ${nellaLingua()}.\n\n` +
      (cestino
        ? 'Fra questi messaggi, quali sono con certezza posta di massa — newsletter, ' +
          'promozioni, notifiche automatiche, avvisi di servizi a cui è iscritto? ' +
          'Quelli si possono mettere nel cestino.'
        : 'Fra questi messaggi, quali sono con certezza già chiusi — scambi finiti, ' +
          'conferme di cose andate a buon fine, roba vecchia che non aspetta niente? ' +
          'Quelli si possono archiviare.') + '\n\n' +
      'Nel dubbio non lo scegli. Un messaggio lasciato dov’è non è costato niente ' +
      'a nessuno; uno tolto per sbaglio sì. Non scegli mai qualcosa che sembri ' +
      'scritto da una persona a un’altra, che contenga una fattura, un pagamento, ' +
      'una scadenza, un contratto o una richiesta rimasta senza risposta.\n\n' +
      'Per ognuno scrivi un «perche» che si possa controllare in due secondi: chi ' +
      'lo manda e che cos’è. Non «sembra pubblicità»: «Newsletter settimanale di ' +
      'Vinted». Se non ce n’è nessuno, torni un elenco vuoto — è una risposta ' +
      'normale, non un fallimento.\n\n' +
      'Gli id li copi identici: uno inventato non esiste e non verrà toccato.',
    formato: SCELTA,
    messages: [{
      role: 'user',
      content: JSON.stringify(solaPosta.map(d => ({
        id: d.id, da: d.autore ?? '', titolo: d.titolo, quando: d.quando,
        inizio: d.corpo.slice(0, 400)
      })))
    }]
  })
  if (!out?.voci?.length) return null

  const per = new Map(solaPosta.map(d => [d.id, d]))
  const voci = out.voci
    // un id inventato non deve poter far sparire niente: si tiene solo quello
    // che era davvero nell'elenco mostrato al modello
    .filter(v => per.has(v.id))
    .map(v => ({ doc: v.id, titolo: per.get(v.id)!.titolo, perche: String(v.perche ?? '').trim() }))
    .filter(v => v.perche)
  return voci.length ? { azione: a.proponi, voci } : null
}

/** Quello che si legge sulla riga prima di aprirla: un conto e un verbo. */
function riassunto(p: store.Proposta): string {
  const en = cfgLingua() === 'en'
  if (p.azione === 'agenda.aggiungi') {
    const n = p.eventi.length
    return en
      ? `${n} ${n === 1 ? 'thing' : 'things'} to put in the calendar.`
      : `${n} ${n === 1 ? 'cosa da mettere' : 'cose da mettere'} in agenda.`
  }
  const n = p.voci.length
  const cosa = p.azione === 'posta.cestina'
    ? (en ? 'to move to the bin' : 'da mettere nel cestino')
    : (en ? 'to archive' : 'da archiviare')
  const messaggi = en ? (n === 1 ? 'message' : 'messages') : (n === 1 ? 'messaggio' : 'messaggi')
  return `${n} ${messaggi} ${cosa}.`
}

/**
 * Fa girare una ricetta, una volta.
 *
 * Quello che produce è **un compito**, non un'azione. È la scelta che tiene in
 * piedi tutto il resto: da lì in poi vale la strada che esiste già ed è già
 * provata — il modello cerca, apre i documenti, scrive la bozza, dice se gli
 * manca qualcosa, e tu leggi e premi Manda. Un'automazione non ha bisogno di
 * un suo modo di fare le cose: ha bisogno di scrivere la riga giusta al momento
 * giusto, e di lasciare fare al resto.
 */
/**
 * Quante bozze al giorno può far scrivere una ricetta.
 *
 * Le bozze sono l'unica spesa che in quest'app si ripete da sola. Tutto il
 * resto — la chat, il feed, le domande — succede quando qualcuno preme; una
 * ricetta con `modo: bozza` che aspetta l'arrivo di roba nuova gira dopo ogni
 * lettura della posta, e ogni giro è un lavoro da modello grande a più passate:
 * cerca, apre, scrive. Tre al giorno bastano a chiunque le legga davvero; la
 * quarta è quasi sempre una ricetta scritta troppo larga che sta consumando
 * il conto di qualcuno mentre non guarda. A mano non c'è tetto: un dito che
 * preme non è una spesa ricorrente.
 */
export const BOZZE_AL_GIORNO = 3

/** Quante volte oggi ha scritto una riga davvero, dalla sua storia. */
export function bozzeOggi(s: store.StatoAutomazione | null, adesso = new Date()): number {
  return store.storiaDi(s).filter(g => g.esito === 'fatta' && stessoGiorno(new Date(g.quando), adesso)).length
}

export async function fai(
  ricetta: Automazione,
  opzioni: { aMano?: boolean; adesso?: Date } = {}
): Promise<'fatta' | 'niente' | 'gia' | 'saltata'> {
  // da qui in giù si lavora sulla ricetta nella lingua dell'installazione: il
  // testo che si scrive adesso lo leggerà una persona, e resta scritto
  const a = nella(ricetta)
  const s = store.statoAutomazione(a.id)

  /*
   * Già una viva da questa automazione: non se ne aggiunge un'altra sopra.
   *
   * Si segna con `automazioneRimandata` e non con `automazioneGirata`, e la
   * differenza è la riga più importante di questa funzione. `girata` sposta
   * `ultima` — che è anche il paletto da cui `soloNuovi` riparte a guardare —
   * e qui non si è guardato *niente*. Spostarlo voleva dire che tutto quello
   * che arrivava mentre una riga restava aperta in lista finiva dietro al
   * paletto: non rimandato, saltato. Per sempre, senza un errore, e la cosa
   * saltata era proprio la fattura che l'automazione doveva prendere.
   */
  if (store.compitoVivoDa(a.id)) {
    store.automazioneRimandata(a.id)
    return 'gia'
  }

  /*
   * Il tetto del giorno, per quelle che fanno scrivere.
   *
   * Vale solo per chi affida la riga al modello (`bozza` o `tutto`) senza
   * proporre: quelle che propongono fanno una cernita, non una bozza, e quelle
   * con `io` scrivono una riga e basta. Si esce *prima* di guardare il
   * materiale, e come per `gia` non si sposta `ultima`: qui non si è letto
   * niente, e quello che arriva oggi dev'essere ancora lì domani.
   *
   * Non è un errore e non finisce in `guaio`: la scheda lo mostrerebbe in rosso,
   * e una ricetta che ha già scritto tre bozze oggi sta funzionando. Si segna
   * come esito e si dice nel registro del server.
   */
  const modoScelto = a.metti.modo ?? 'io'
  const scrive = (modoScelto === 'bozza' || modoScelto === 'tutto') && !a.proponi
  if (scrive && !opzioni.aMano && bozzeOggi(s, opzioni.adesso) >= BOZZE_AL_GIORNO) {
    store.automazioneSaltata(a.id)
    console.log(`myynd · automazione «${a.nome}»: tetto del giorno raggiunto (${BOZZE_AL_GIORNO} bozze), riprende domani`)
    return 'saltata'
  }

  const docs = materiale(a, s)
  if (!docs.length) {
    // niente da guardare non è un fallimento: è la risposta normale, quasi
    // sempre. Si segna comunque, così l'elenco può dire «girata, niente da fare»
    store.automazioneGirata(a.id, 'niente', undefined, 0)
    return 'niente'
  }

  // Quelle che propongono scelgono *prima* di scrivere la riga. Se non c'è
  // niente da mettere via non deve comparire nessuna riga: «ho guardato e non
  // c'era niente» detto ogni giorno in cima alla lista è rumore, non un
  // servizio — ed è il modo più veloce per far spegnere un'automazione utile.
  const scelti = a.proponi ? await cernita(a, docs) : null
  if (a.proponi && !scelti) {
    // ha guardato dei documenti e non ne ha scelto nessuno: è un «niente»
    // diverso da quello di sopra, e la storia deve poterli distinguere —
    // «non c'era niente da leggere» e «ho letto e non c'era niente da fare»
    // si riparano in due modi opposti
    store.automazioneGirata(a.id, 'niente', undefined, docs.length)
    return 'niente'
  }

  const quando = a.metti.inLista
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const nota = [
    a.fai,
    '',
    'Da guardare:',
    ...docs.slice(0, 8).map(d => `— ${d.titolo}`)
  ].join('\n')

  store.scriviCompito({
    id,
    testo: a.nome,
    nota,
    quando,
    ordine: ordine.dopo(store.ultimoOrdine(quando)),
    // l'origine dice da quale ricetta è nata: serve alla guardia qui sopra, e
    // serve a chi guarda la riga per capire perché è comparsa
    origine: `auto:${a.id}`,
    doc: docs[0]?.id ?? null,
    // Il permesso viaggia con la riga, non si rilegge dalla ricetta al momento
    // di girare: fra stanotte e domattina la ricetta può essere cambiata, e
    // quello che vale è quello che era stato concesso quando la riga è nata.
    attrezzi: { nomi: attrezzi.ripulisci(a.attrezzi), cartella: a.cartella ?? null }
  })

  if (scelti) {
    // la riga nasce già pronta: non c'è niente da far fare al modello dopo, il
    // lavoro è fatto e quello che manca è il dito di una persona
    store.proponi(id, scelti, riassunto(scelti))
    compiti.annunciaPronto(id)
  } else {
    const modo = a.metti.modo ?? 'io'
    if (modo === 'bozza' || modo === 'tutto') compiti.affida(id, modo)
  }

  store.automazioneGirata(a.id, 'fatta', undefined, docs.length)
  store.registraAzione({
    tipo: 'automazione', cosa: a.nome, compito: id, esito: 'fatta',
    dettaglio: `${docs.length} document${docs.length === 1 ? 'o' : 'i'}`
  })
  compiti.annunciaCambio()
  return 'fatta'
}

// — il giro —

/**
 * Guarda l'orologio e fa girare quello che tocca.
 *
 * Ogni quarto d'ora, e non ogni minuto: un'automazione che parte alle 9 e una
 * che parte alle 9:14 sono la stessa cosa per chiunque, e un giro ogni minuto
 * è solo un modo di consumare la batteria.
 */
export const OGNI = 15 * 60 * 1000

export async function giro(adesso = new Date()) {
  // una data di nascita a chi non ce l'ha, prima di guardare l'orologio: è
  // quella che dice se una mai girata sta aspettando il suo turno o se il suo
  // turno è passato mentre il computer era spento
  for (const a of ricette()) store.vediAutomazione(a.id)
  const stati = store.statiAutomazioni()
  for (const a of ricette()) {
    if (!tocca(a, stati[a.id] ?? null, adesso)) continue
    try {
      const esito = await fai(a)
      if (esito === 'fatta') console.log(`myynd · automazione «${a.nome}»: una riga nuova in lista`)
    } catch (e) {
      const guaio = e instanceof Error ? e.message : String(e)
      store.automazioneGirata(a.id, 'guaio', guaio)
      store.registraAzione({ tipo: 'automazione', cosa: a.nome, esito: 'fallita', dettaglio: guaio })
      console.error(`myynd · automazione «${a.nome}» non è riuscita:`, guaio)
    }
  }
}

/** Quelle che aspettano l'arrivo di roba nuova, chiamate dopo una lettura. */
export async function quandoArriva() {
  const stati = store.statiAutomazioni()
  for (const a of ricette()) {
    if (!('quandoArriva' in a.quando)) continue
    if (a.spenta || stati[a.id]?.spenta) continue
    try {
      await fai(a)
    } catch (e) {
      const guaio = e instanceof Error ? e.message : String(e)
      store.automazioneGirata(a.id, 'guaio', guaio)
      console.error(`myynd · automazione «${a.nome}» non è riuscita:`, guaio)
    }
  }
}

// — scriverne una a parole —

/**
 * Da una frase tua a una ricetta che gira.
 *
 * È la risposta alla domanda «ma queste posso farmele io?». Dettata a voce, non
 * compilata: «ogni lunedì mattina dimmi quali fatture non sono state pagate»
 * deve bastare, perché chi usa Myynd non sa — e non deve sapere — che sotto c'è
 * un JSON con dentro `guarda.cerca` e `metti.inLista`.
 *
 * Quello che il modello scrive non è codice: è un modulo con dei campi, gli
 * stessi quattro che il motore sa eseguire. Non può inventare un'azione nuova,
 * perché non c'è nessun posto dove metterla — e quello che scrive passa
 * comunque da `valida()`, come una ricetta arrivata dalla rete.
 *
 * Le parole di `cerca` sono la metà che decide se funzionerà: sono quelle con
 * cui fruga l'indice, e vanno scritte nella lingua dei documenti, non in quella
 * della richiesta. Chi ha la casella in inglese e chiede l'automazione in
 * italiano deve comunque ritrovarsi «invoice payment overdue» là dentro.
 */
const FORMA = () => ({
  type: 'object',
  properties: {
    nome: { type: 'string', description: 'Due o quattro parole, come lo chiamerebbe lei. Non «Automazione 1».' },
    spiega: { type: 'string', description: 'Una riga sola: cosa fa e quando, come lo diresti a voce.' },
    ogni: { type: 'string', enum: ['giorno', 'settimana', 'arrivo'], description: '«arrivo» = ogni volta che arriva qualcosa di nuovo.' },
    giorno: { type: 'number', description: 'Solo se ogni=settimana: 1 lunedì … 0 domenica.' },
    ora: { type: 'number', description: 'L\'ora del giorno, 0-23. Di mattina presto se non l\'ha detto.' },
    cerca: {
      type: 'string',
      description:
        'Le parole con cui frugare i suoi documenti, separate da spazi, nella lingua in cui sono ' +
        'scritti i documenti. Vuota se l\'automazione deve guardare tutto quello che arriva.'
    },
    soloNuovi: { type: 'boolean', description: 'Vero se deve guardare solo quello che è arrivato dall\'ultima volta.' },
    fai: {
      type: 'string',
      description:
        'L\'istruzione che leggerà il modello quando gira. Diretta, concreta, e con dentro cosa ' +
        'fare quando non c\'è niente da fare. Cinque righe al massimo.'
    },
    inLista: { type: 'string', enum: ['oggi', 'settimana', 'poi'] },
    modo: {
      type: 'string', enum: ['io', 'bozza'],
      description: '«io» mette solo una riga da fare; «bozza» le fa anche scrivere il testo.'
    },
    attrezzi: {
      type: 'array',
      items: { type: 'string', enum: attrezzi.ATTREZZI.map(a => a.nome) },
      description:
        'Cosa deve poter aprire mentre gira. Scegli quelli che le servono davvero e nessun ' +
        'altro: ognuno è un permesso, e chi legge la scheda lo vede scritto.\n\n' +
        'Vai dietro a quello che ha nominato lei, non a quello che potrebbe servire: se dice ' +
        '«nella posta» dai la posta, se dice «su Slack» dai Slack, se dice «i file» guarda ' +
        'quali fonti di file ci sono nell\'elenco qui sopra e dai quelle. Se non ha nominato ' +
        'nessun posto, dai quelli in cui quella roba di solito sta — una fattura arriva per ' +
        'posta, un contratto sta nei file — e non gli altri. claude.lavora solo se parla di ' +
        'un progetto di codice.'
    },
    cartella: {
      type: 'string',
      description:
        'Solo se hai scelto claude.lavora: il percorso della cartella del progetto, se l\'ha ' +
        'detto. Vuota se non l\'ha detto — glielo chiederà la schermata.'
    },
    en: {
      type: 'object',
      description: 'Le stesse cose in inglese: l\'app si può leggere in due lingue.',
      properties: {
        nome: { type: 'string' }, spiega: { type: 'string' },
        fai: { type: 'string' }, cerca: { type: 'string' }
      },
      required: ['nome', 'spiega', 'fai', 'cerca'],
      additionalProperties: false
    }
  },
  required: ['nome', 'spiega', 'ogni', 'ora', 'cerca', 'soloNuovi', 'fai', 'inLista', 'modo', 'attrezzi', 'en'],
  additionalProperties: false
})

/** L'elenco degli attrezzi come lo legge il modello, con cosa apre ciascuno. */
function catalogoScritto(): string {
  return attrezzi.ATTREZZI.map(a => `— \`${a.nome}\` — ${a.spiega.it}`).join('\n')
}

const COME_SI_SCRIVE = `Stai trasformando la frase di una persona in un'automazione di Myynd.

Un'automazione fa quattro cose e nient'altro: si sveglia a un'ora, apre quello
che le hai concesso di aprire, ci fa ragionare un modello, e lascia una riga
nella sua lista. Non manda niente a nessuno, non cancella niente. Se quello che
chiede non si può fare così, scegli la cosa più vicina che si può fare — è
meglio un'automazione più piccola che funziona di una grande che non gira.

Gli attrezzi che puoi darle, e nessun altro:

\${ATTREZZI}

Sceglierli è la parte che decide se funzionerà. Uno di troppo è un permesso
regalato a una cosa che gira da sola mentre lei dorme; uno di meno è
un'automazione che ogni mattina dice che non ha trovato niente, perché stava
guardando nel posto sbagliato. Nel dubbio dai quello che il suo esempio nomina,
non quello che potrebbe servire un giorno.

Sull'istruzione: scrivila come la diresti a un collega che aprirà quei documenti
senza sapere perché. Dille cosa cercare, cosa scriverne, e cosa fare quando non
c'è niente — perché «non c'è niente» è la risposta più frequente, e va detta in
una riga invece di inventare qualcosa.

Sull'ora: se non l'ha detta, sceglila tu e scegliela presto — un'automazione
serve prima che la giornata cominci.`

/** Dalla frase alla ricetta. Torna quella salvata, già valida. */
export async function daUnaFrase(descrizione: string): Promise<Automazione> {
  const detto = descrizione.trim()
  if (detto.length < 8) throw new Error('Dimmi in una frase cosa dovrebbe fare.')

  const r = await chiediJSON<{
    nome: string; spiega: string; ogni: string; giorno?: number; ora: number
    cerca: string; soloNuovi: boolean; fai: string; inLista: string; modo: string
    attrezzi?: string[]; cartella?: string
    en: { nome: string; spiega: string; fai: string; cerca: string }
  }>({
    lavoro: 'ricetta',
    max_tokens: 2000,
    system: COME_SI_SCRIVE.replace('\${ATTREZZI}', catalogoScritto()),
    formato: FORMA(),
    messages: [{ role: 'user', content: `Ha chiesto:\n«${detto}»` }]
  })
  if (!r) throw new Error('Non sono riuscito a scriverla. Riprova dicendola in un altro modo.')

  const ora = Math.min(23, Math.max(0, Math.round(Number(r.ora) || 8)))
  const quando: Quando = r.ogni === 'arrivo'
    ? { quandoArriva: true }
    : r.ogni === 'settimana'
      ? { ogni: 'settimana', giorno: Math.min(6, Math.max(0, Math.round(Number(r.giorno) || 1))), ora }
      : { ogni: 'giorno', ora }

  const esistenti = new Set(ricette().map(x => x.id))
  return scrivi({
    id: idPer(r.nome, esistenti),
    nome: r.nome,
    spiega: r.spiega,
    quando,
    guarda: {
      ...(r.cerca?.trim() ? { cerca: r.cerca.trim() } : {}),
      ...(r.soloNuovi ? { soloNuovi: true } : {}),
      limite: 8
    },
    fai: r.fai,
    metti: { inLista: r.inLista, modo: r.modo },
    ...(attrezzi.ripulisci(r.attrezzi).length ? { attrezzi: attrezzi.ripulisci(r.attrezzi) } : {}),
    ...(r.cartella?.trim() ? { cartella: r.cartella.trim() } : {}),
    en: { nome: r.en.nome, spiega: r.en.spiega, fai: r.en.fai, ...(r.en.cerca?.trim() ? { cerca: r.en.cerca.trim() } : {}) }
  })
}

/**
 * Cambiarla dicendo a parole cosa deve cambiare.
 *
 * È il gesto che mancava, e mancava proprio dove serve: una persona apre
 * un'automazione che gira da due settimane e vuole che guardi anche il sabato,
 * o che smetta di frugare nel desktop. Nel modulo a campi vuol dire trovare la
 * tendina giusta fra otto; a parole vuol dire dirlo.
 *
 * Non riscrive da zero: parte da quella che c'è e ci applica la modifica. La
 * differenza si vede su una ricetta a cui qualcuno ha limato l'istruzione per
 * un mese — «falla girare anche il sabato» non deve buttare via quel lavoro.
 * Per questo la ricetta di partenza va nel messaggio, intera.
 */
export async function riscrivi(id: string, richiesta: string): Promise<Automazione> {
  const vecchia = ricette().find(a => a.id === id)
  if (!vecchia) throw new Error('Non la trovo.')
  const detto = richiesta.trim()
  if (detto.length < 3) throw new Error('Dimmi cosa vuoi cambiare.')

  const r = await chiediJSON<{
    nome: string; spiega: string; ogni: string; giorno?: number; ora: number
    cerca: string; soloNuovi: boolean; fai: string; inLista: string; modo: string
    attrezzi?: string[]; cartella?: string
    en: { nome: string; spiega: string; fai: string; cerca: string }
  }>({
    lavoro: 'ricetta',
    max_tokens: 2000,
    system: COME_SI_SCRIVE.replace('\${ATTREZZI}', catalogoScritto()) + `

Questa automazione esiste già: quello che ti sta chiedendo è di **cambiarla**,
non di rifarla. Tieni tutto quello che non c'entra con la sua richiesta — le
parole della ricerca, l'istruzione, l'ora — esattamente com'erano. Cambia
quello che ti ha detto di cambiare e nient'altro, e ridammi la ricetta intera.`,
    formato: FORMA(),
    messages: [{
      role: 'user',
      content: `Adesso è così:\n${JSON.stringify({
        nome: vecchia.nome, spiega: vecchia.spiega, quando: vecchia.quando,
        guarda: vecchia.guarda, fai: vecchia.fai, metti: vecchia.metti,
        attrezzi: vecchia.attrezzi ?? [], cartella: vecchia.cartella ?? '',
        en: vecchia.en
      }, null, 2)}\n\nVuole che cambi questo:\n«${detto}»`
    }]
  })
  if (!r) throw new Error('Non sono riuscito a cambiarla. Riprova dicendola in un altro modo.')

  const ora = Math.min(23, Math.max(0, Math.round(Number(r.ora) || 8)))
  const quando: Quando = r.ogni === 'arrivo'
    ? { quandoArriva: true }
    : r.ogni === 'settimana'
      ? { ogni: 'settimana', giorno: Math.min(6, Math.max(0, Math.round(Number(r.giorno) || 1))), ora }
      : { ogni: 'giorno', ora }

  // lo stesso id: è la stessa automazione, e la sua storia — quante volte è
  // girata, se è accesa, in che cartella l'hai messa — sta appesa a quell'id
  return scrivi({
    ...vecchia,
    id: vecchia.id,
    nome: r.nome, spiega: r.spiega, quando,
    guarda: {
      ...vecchia.guarda,
      ...(r.cerca?.trim() ? { cerca: r.cerca.trim() } : { cerca: undefined }),
      ...(r.soloNuovi ? { soloNuovi: true } : { soloNuovi: undefined })
    },
    fai: r.fai,
    metti: { inLista: r.inLista, modo: r.modo },
    attrezzi: attrezzi.ripulisci(r.attrezzi),
    ...(r.cartella?.trim() ? { cartella: r.cartella.trim() } : { cartella: undefined }),
    en: { nome: r.en.nome, spiega: r.en.spiega, fai: r.en.fai, ...(r.en.cerca?.trim() ? { cerca: r.en.cerca.trim() } : {}) }
  })
}

/**
 * Falla guardare a Claude, e falla scrivere meglio.
 *
 * Un'automazione dettata in dieci parole funziona, ma quasi mai bene: le
 * parole con cui fruga l'indice sono quelle della richiesta invece che quelle
 * dei documenti, l'istruzione non dice cosa fare quando non c'è niente da
 * fare, e gli attrezzi sono quelli che il nome suggeriva invece di quelli che
 * servono. Sono tre difetti che non si vedono guardando la scheda: si vedono
 * dopo due settimane in cui non è mai successo niente.
 *
 * Questo è il bottone che li ripara, e sta su un bottone apposta. Una cosa che
 * riscrive da sola quello che hai scritto tu, senza che tu l'abbia chiesto,
 * non è un aiuto: è una cosa di cui non ti puoi fidare. Qui lo chiedi, e quello
 * che torna resta modificabile campo per campo un secondo dopo.
 */
export async function ottimizza(id: string): Promise<Automazione> {
  return riscrivi(id, MIGLIORA)
}

const MIGLIORA = `Guardala come la guarderebbe qualcuno che deve farla funzionare davvero, e
sistemala. Le tre cose che di solito sono sbagliate, in ordine di quanto pesano:

1. **Le parole della ricerca.** Devono essere quelle che userebbe chi ha
   scritto quei documenti, non quelle della richiesta. Un'automazione sulle
   fatture non cerca «fattura»: cerca il numero, l'importo, «scadenza»,
   «pagamento», il nome di chi le manda. E devono essere nella lingua dei
   documenti, non in quella della schermata.

2. **Gli attrezzi.** Se l'istruzione parla di un posto e quel posto non è fra
   gli attrezzi, quell'automazione non troverà mai niente — cercherà, ogni
   mattina, dentro il recinto sbagliato. E al contrario: un attrezzo che non le
   serve è un permesso regalato a una cosa che gira mentre lei dorme — toglilo.

3. **L'istruzione.** Concreta, e con dentro cosa fare quando non c'è niente da
   fare, che è la risposta più frequente. Se dice «controlla le fatture», dille
   *cosa* controllare e *cosa scrivere*.

Non stravolgerla: deve restare l'automazione che voleva lei, con il suo nome e
la sua ora, fatta meglio. Se è già scritta bene, ridammela com'è.`

/**
 * Cambiarne una. Qualunque.
 *
 * Prima si potevano toccare solo le proprie, e quelle dell'azienda andavano
 * prima duplicate: due gesti e due righe in elenco per cambiare una parola. Il
 * ragionamento («una ricetta è scritta una volta per tutti») era giusto sul
 * repository e sbagliato qui — perché quello che si scrive qui non esce da
 * questa macchina.
 *
 * Quindi: si riscrive comunque nella tua cartella, con lo stesso id. La tua
 * copertura vince su quella del pacchetto — `cartelle()` mette `MIE()` per ultima
 * apposta — e un aggiornamento dell'azienda non te la porta via. Il file
 * originale resta dov'è, intatto, per tutti gli altri.
 *
 * Si riscrive il file intero passando da `valida()`: una modifica parziale
 * scritta a pezzi è il modo in cui un file finisce in uno stato che il motore
 * non sa più leggere.
 *
 * Le due lingue: quello che scrivi finisce in tutt'e due. È una ricetta tua,
 * scritta da te, nella tua lingua — tenere una traduzione a metà che nessuno
 * aggiornerà sarebbe peggio che non averla.
 */
export function cambia(id: string, patch: Record<string, unknown>): Automazione {
  const vecchia = ricette().find(a => a.id === id)
  if (!vecchia) throw new Error('Non la trovo.')

  const nome = patch.nome !== undefined ? String(patch.nome).trim() : vecchia.nome
  const spiega = patch.spiega !== undefined ? String(patch.spiega).trim() : vecchia.spiega
  const fai = patch.fai !== undefined ? String(patch.fai).trim() : vecchia.fai
  const cerca = patch.cerca !== undefined ? String(patch.cerca).trim() : (vecchia.guarda.cerca ?? '')

  /*
   * Gli attrezzi si controllano, non si ripuliscono.
   *
   * `ripulisci` scarta in silenzio quello che non conosce, e su questo campo è
   * la cosa sbagliata: una PATCH con dentro un nome storto tornava «ok» dopo
   * aver **azzerato i permessi** che c'erano prima — l'automazione restava in
   * elenco identica, e non apriva più niente. Un errore è la risposta giusta:
   * chi ha mandato quel nome ha un difetto da correggere, e nel frattempo
   * quello che c'era resta dov'è.
   */
  let suoi = vecchia.attrezzi ?? []
  if (patch.attrezzi !== undefined) {
    if (!Array.isArray(patch.attrezzi)) throw new Error('Gli attrezzi devono essere un elenco.')
    const storto = patch.attrezzi.map(String).find(x => !attrezzi.esiste(x))
    if (storto) throw new Error(`Non conosco l’attrezzo «${storto}».`)
    suoi = attrezzi.ripulisci(patch.attrezzi)
  }
  const cartella = patch.cartella !== undefined ? String(patch.cartella).trim() : (vecchia.cartella ?? '')

  return scrivi({
    ...vecchia,
    nome, spiega, fai,
    quando: (patch.quando as Quando) ?? vecchia.quando,
    guarda: { ...vecchia.guarda, ...(cerca ? { cerca } : { cerca: undefined }) },
    metti: (patch.metti as Automazione['metti']) ?? vecchia.metti,
    attrezzi: suoi,
    // vuota vuol dire toglierla: `undefined` sparisce da JSON, `''` non passerebbe
    // da `valida` come percorso e resterebbe scritta nel file
    cartella: cartella || undefined,
    en: { ...vecchia.en, nome, spiega, fai, ...(cerca ? { cerca } : {}) }
  })
}

// — capire perché non fa niente —

/**
 * Come sta, in una parola.
 *
 * Esiste perché il modo in cui un'automazione fallisce **non assomiglia a un
 * fallimento**. Non va in errore, non si spegne, non lascia un segno: gira
 * ogni mattina, non trova niente, e scrive «girata 47 volte» sulla sua scheda.
 * Da fuori è identica a una che funziona benissimo su una casella in cui
 * davvero non succede niente. È il difetto che questa schermata non sapeva
 * vedere, ed è anche il più frequente di tutti — quasi sempre sono le parole
 * della ricerca, scritte nella lingua della richiesta invece che in quella dei
 * documenti.
 *
 * Le quattro risposte, in ordine di quanto sono urgenti:
 *
 *   · `scollegata` — le manca una connessione che ha dichiarato. Non troverà
 *     mai niente e non è colpa sua: è una cosa da collegare, non da riscrivere.
 *   · `guaio` — l'ultima volta è andata storta, e c'è scritto perché.
 *   · `ferma` — c'è una sua riga ancora aperta in lista, e finché resta lì non
 *     ne nasce un'altra. Non è un guasto: è una cosa da chiudere.
 *   · `muta` — è girata almeno quattro volte e non ha mai trovato niente da
 *     guardare. Questa è quella che vale la pena dire, perché è quella che
 *     nessuno vedrebbe.
 */
export type Salute = { stato: 'bene' | 'scollegata' | 'guaio' | 'ferma' | 'muta'; quante: number }

/** Sotto questo numero di giri a vuoto non si dice niente: capita, ed è normale. */
const MUTA_DOPO = 4

export function salute(a: Automazione, s: store.StatoAutomazione | null): Salute {
  const suoi = attrezzi.ripulisci(a.attrezzi)
  const staccato = suoi.find(n => !attrezzi.collegato(n))
  if (staccato) return { stato: 'scollegata', quante: 0 }
  if (s?.esito === 'guaio') return { stato: 'guaio', quante: 0 }
  if (s?.esito === 'gia') return { stato: 'ferma', quante: 0 }

  /*
   * A vuoto vuol dire «non ha nemmeno avuto qualcosa da leggere».
   *
   * I giri in cui ha letto dei documenti e ha deciso che non c'era niente da
   * fare non contano: quelli sono un'automazione che funziona e che ti sta
   * dicendo che è tutto a posto. Quelli che contano sono i giri in cui la
   * pescata è tornata vuota — perché lì il problema non è il mondo, sono le
   * parole con cui lo sta guardando.
   */
  const storia = store.storiaDi(s)
  const vuoti = storia.filter(g => g.esito === 'niente' && !g.quanti).length
  if (storia.length >= MUTA_DOPO && vuoti === storia.length) {
    return { stato: 'muta', quante: vuoti }
  }
  return { stato: 'bene', quante: 0 }
}

/** Cosa guarderebbe adesso: un documento come lo vede chi legge la scheda. */
export type Assaggio = { id: string; titolo: string; fonte: string; quando: string | null }

export type Anteprima = {
  /** Quello che troverebbe adesso, senza scrivere niente e senza chiedere niente a nessun modello. */
  docs: Assaggio[]
  /** Le fonti in cui ha davvero cercato. Vuoto = tutte. */
  dentro: string[]
  /** Gli attrezzi dichiarati che non sono collegati: sono il motivo più frequente. */
  staccati: string[]
  /** Vero se la ricetta guarda solo il nuovo: allora il vuoto può essere normale. */
  soloNuovi: boolean
  /** Da che momento sta guardando, se guarda solo il nuovo. */
  dal: string | null
}

/**
 * Cosa troverebbe, se girasse adesso.
 *
 * È la cosa che mancava di più a chi ne scrive una, e mancava nel punto
 * peggiore: le parole della ricerca. Si scrivono in una casella di testo, non
 * hanno nessun ritorno, e l'unico modo di sapere se erano giuste era accendere
 * l'automazione e aspettare qualche giorno per vedere se succedeva qualcosa.
 * Se non succedeva, non si sapeva nemmeno *quale* delle quattro cose fosse
 * sbagliata.
 *
 * Questa fa girare **solo la metà che sceglie il materiale** — la stessa
 * identica funzione che userà il motore, non una che le somiglia — e si ferma
 * lì. Non chiama nessun modello, non scrive nessuna riga, non tocca `ultima`.
 * Costa una ricerca nell'indice, e si può premere venti volte di fila mentre
 * si limano le parole.
 *
 * Torna anche il *perché* di un vuoto, che è la metà che serve davvero: in
 * quali fonti ha cercato, quali attrezzi dichiarati non sono collegati, e da
 * che momento sta guardando se guarda solo il nuovo.
 */
export function anteprima(id: string): Anteprima {
  const ricetta = ricette().find(x => x.id === id)
  if (!ricetta) throw new Error('Non la trovo.')
  // nella lingua dell'installazione, come quando gira davvero: `cerca` cambia
  // fra le due, ed è proprio quella che si sta provando
  const a = nella(ricetta)
  const s = store.statoAutomazione(a.id)
  const suoi = attrezzi.ripulisci(a.attrezzi)

  return {
    docs: materiale(a, s).map(d => ({
      id: d.id, titolo: d.titolo, fonte: d.fonte, quando: d.quando ?? null
    })),
    dentro: fontiDi(a) ?? [],
    staccati: suoi.filter(n => !attrezzi.collegato(n)),
    soloNuovi: !!a.guarda.soloNuovi,
    dal: a.guarda.soloNuovi
      ? (s?.ultima ?? new Date(Date.now() - 7 * 86_400_000).toISOString())
      : null
  }
}

// — per l'interfaccia —

export type Vista = Automazione & {
  accesa: boolean
  ultima: string | null
  quante: number
  esito: string | null
  guaio: string | null
  /** Tua: si può cambiare e si può buttare. Le altre no. */
  mia: boolean
  /** Quando girerà da sola la prossima volta. Null = mai, o non a orologio. */
  prossima: string | null
  /** In che cartella te la sei messa. */
  raccolta: string | null
  /** Quelli che esistono davvero, nell'ordine del catalogo. */
  attrezzi: string[]
  /** Come sta: `bene`, o il motivo per cui non fa niente. */
  salute: Salute
  /** Il suo turno è già passato: girerà al primo giro utile, non all'ora scritta. */
  inRitardo: boolean
  /** Le ultime volte, per la strisciata sulla scheda. */
  storia: store.Giro[]
}

export const accendi = store.accendiAutomazione

export function elenco(): Vista[] {
  // la data di nascita anche a chi apre solo la schermata: senza, una
  // installazione che non ha ancora fatto un giro mostrerebbe orari calcolati
  // da un'altra base rispetto a quelli che poi userà il motore
  for (const a of ricette()) store.vediAutomazione(a.id)
  const stati = store.statiAutomazioni()
  const tolte = store.automazioniTolte()
  return ricette().filter(r => !tolte.has(r.id)).map(r => {
    const a = nella(r)
    const s = stati[a.id]
    return {
      ...a,
      accesa: !a.spenta && !s?.spenta,
      ultima: s?.ultima ?? null,
      quante: s?.quante ?? 0,
      esito: s?.esito ?? null,
      guaio: s?.guaio ?? null,
      mia: eMia(a.id),
      prossima: prossima(a, s ?? null),
      raccolta: s?.raccolta ?? null,
      attrezzi: attrezzi.ripulisci(a.attrezzi),
      salute: salute(a, s ?? null),
      inRitardo: inRitardo(a, s ?? null),
      storia: store.storiaDi(s)
    }
  })
}
