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

export type Evento =
  | { fase: 'preso'; id: string }
  /** Cosa sta facendo adesso su quella riga: cerca, apre, scrive. */
  | { fase: 'lavoro'; id: string; passo: claude.Passo }
  | { fase: 'pronto'; id: string; compito: store.Compito }
  | { fase: 'chiede'; id: string; compito: store.Compito }
  | { fase: 'guaio'; id: string; guaio: string }
  | { fase: 'richiamato'; id: string }
  | { fase: 'cambiato' }

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

function annuncia(e: Evento) {
  const di = chi.adesso()
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
type Voce = { utente: string | null; id: string }
const coda: Voce[] = []
let allOpera = false
/** Quello su cui il modello sta lavorando *adesso*. Non è in coda: è già uscito. */
let inCorso: string | null = null

/** La chiave di una riga: la persona e l'id insieme. */
const chiave = (id: string, utente: string | null = chi.adesso()) => `${utente ?? ''}·${id}`

/**
 * I compiti che hai richiamato indietro mentre Myynd ci lavorava.
 *
 * Togliere dalla coda non basta: se il lavoro è già partito, la chiamata al
 * modello va avanti comunque e trenta secondi dopo scriverebbe una bozza sopra
 * a un compito che nel frattempo hai ripreso in mano. Qui si segna che il
 * risultato non lo vuoi più, e quando arriva si butta.
 */
const richiamati = new Set<string>()

/**
 * Affida un compito a Myynd.
 *
 * Torna subito: il lavoro vero comincia dopo, e chi ha chiamato non deve stare
 * ad aspettarlo. Riaffidare un compito già in coda non lo mette due volte —
 * capita, cliccando due volte, e due bozze per la stessa riga sono un difetto.
 */
export function affida(id: string, modo: string) {
  const c = store.compito(id)
  if (!c) return

  // Lo stesso compito, lo stesso modo, già in fila: non c'è niente da fare.
  // Ma se il modo è *cambiato* — hai chiesto la bozza e adesso vuoi che se ne
  // occupi tutto lui — allora bisogna rifarlo. Prima si usciva e basta, e la
  // colonna nuova si accendeva per un istante per poi tornare indietro da sola:
  // era questo il «a volte non funziona».
  const utente = chi.adesso()
  const k = chiave(id, utente)
  if (c.modo === modo && (coda.some(v => v.id === id && v.utente === utente) || inCorso === k)) return

  // quello che sta girando adesso non serve più: si butta invece di lasciarlo
  // scrivere una bozza del modo vecchio sopra a quella che stai per chiedere
  if (inCorso === k) richiamati.add(k)

  const dove = coda.findIndex(v => v.id === id && v.utente === utente)
  if (dove >= 0) coda.splice(dove, 1)

  store.affidaCompito(id, modo)
  coda.push({ utente, id })
  // il giro va avanti da solo: se esplode non deve portarsi dietro il processo,
  // e soprattutto non deve lasciare in mezzo alla strada quelli ancora in fila
  void gira().catch(e => console.error('myynd · la coda dei compiti si è fermata:', e))
}

async function gira() {
  if (allOpera) return
  allOpera = true
  try {
    for (;;) {
      const voce = coda.shift()
      if (!voce) break
      const k = chiave(voce.id, voce.utente)
      inCorso = k
      try {
        // si lavora come la persona che l'ha affidato, non come chi ha
        // acceso il giro: è la differenza fra il suo indice e quello di un altro
        await (voce.utente ? chi.dentro(voce.utente, () => svolgiUno(voce.id)) : svolgiUno(voce.id))
      } catch (e) {
        // un compito che esplode non deve fermare quelli dietro di lui
        console.error('myynd · compito', voce.id, e)
      } finally {
        inCorso = null
        richiamati.delete(k)
      }
    }
  } finally {
    allOpera = false
    inCorso = null
  }
}

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
}
const VERI: Ferri = {
  svolgi: (...a) => claude.svolgi(...a),
  chiedeAiuto: (...a) => claude.chiedeAiuto(...a),
  domandeDaFare: (...a) => claude.domandeDaFare(...a)
}
let ferri: Ferri = VERI

/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) {
  ferri = f ? { ...VERI, ...f } : VERI
}

async function svolgiUno(id: string) {
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

  annuncia({ fase: 'preso', id })

  try {
    // Il permesso viaggia con la riga: qui non si va a rileggere niente, si
    // usa quello che c'era scritto quando la riga è nata. Un compito scritto a
    // mano non ne ha, e lavora come ha sempre lavorato.
    const dato = c.attrezzi
    const { testo, fonti } = await ferri.svolgi(
      c.testo, c.nota, c.modo,
      (dato?.nomi ?? []) as attrezzi.Nome[],
      dato?.cartella ?? null,
      // ogni passo esce sul filo, a chi ha affidato la riga: la rotella da
      // sola non diceva se stesse cercando, leggendo o scrivendo. Dopo un
      // richiamo si tace: quella riga non è più sua
      p => { if (!richiamati.has(chiave(id))) annuncia({ fase: 'lavoro', id, passo: p }) }
    )
    // il richiamo può essere arrivato mentre il modello scriveva: la bozza si
    // butta invece di comparire sotto una riga che hai già ripreso in mano
    if (richiamati.has(chiave(id))) return

    // Una risposta che dice «mi manca il tuo indirizzo» non è una bozza pronta,
    // ed è quello che stava succedendo: la riga si accendeva come se ci fosse
    // qualcosa da mandare. Adesso si distingue, e la riga lo dice.
    const { chiede } = await ferri.chiedeAiuto(c.testo, testo)
    if (richiamati.has(chiave(id))) return

    // `risultatoCompito` scrive solo se la riga è ancora affidata: se nel
    // frattempo l'hai chiusa tu, la bozza in ritardo non la riapre
    if (!store.risultatoCompito(id, testo, fonti, chiede ? 'chiede' : 'pronto')) return

    // Se si è fermato, le stesse cose dette come si dicono a voce: tre domande
    // con le risposte da toccare. Se non ci riesce resta il paragrafo di prima,
    // che funzionava già — non vale la pena bloccare una riga per delle opzioni.
    if (chiede) {
      const righe = await ferri.domandeDaFare(c.testo, testo).catch(() => [])
      if (righe.length && !richiamati.has(chiave(id))) store.chiediSuCompito(id, righe)
    }

    const fatto = store.compito(id)
    if (fatto) annuncia({ fase: chiede ? 'chiede' : 'pronto', id, compito: fatto })
  } catch (e) {
    if (richiamati.has(chiave(id))) return
    const guaio = e instanceof Error ? e.message : String(e)
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
  if (inCorso === k) richiamati.add(k)
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
export function riprendiAppesi(): number {
  return store.riapriGliAppesi('Il lavoro si è interrotto. Riaffidamelo quando vuoi.')
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
