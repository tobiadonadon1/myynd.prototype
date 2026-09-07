// La vedetta: le cartelle del desktop, guardate dal vivo.
//
// Fino a ieri un file messo sulla scrivania entrava nella mente al giro delle
// sei ore, o quando qualcuno premeva «fai una lettura». Sei ore sono un
// pomeriggio intero in cui Myynd risponde con la versione vecchia del
// contratto che hai appena riscritto. Qui invece si sta in ascolto sulle
// cartelle scelte, e quello che cambia entra nel giro di qualche secondo —
// un file alla volta, con le stesse regole della lettura intera.
//
// Due tempi, apposta diversi:
//
//   · **l'indice** si aggiorna quasi subito: un secondo e mezzo dopo l'ultimo
//     evento su quel file, perché un salvataggio è una raffica di eventi e
//     leggerli tutti vorrebbe dire estrarre lo stesso PDF cinque volte.
//   · **quello che viene dopo** — la prima pagina, una domanda, le automazioni
//     «quando arriva» — aspetta che si faccia silenzio per qualche minuto, e
//     non parte più di una volta ogni dieci. Duecento file trascinati in una
//     cartella sono duecento eventi e *una* chiamata al modello, non duecento.
//
// Solo in casa: su un server le cartelle sono nomi, non percorsi. E per
// persona, come tutto il resto — ognuno ha le sue cartelle e il suo indice.

import { watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import * as chi from '../chi.ts'
import * as store from '../store.ts'
import { OSPITATO } from '../ospitato.ts'
import type { ConfigDesktop } from '../config.ts'
import { daSaltare, leggiUno, leggiCartella } from './desktop.ts'

/** I tempi. Si accorciano solo nelle prove. */
const TEMPI = {
  /** Dopo l'ultimo evento su un percorso, prima di leggerlo. */
  attesa: 1_500,
  /** Il silenzio che deve seguire un cambiamento prima di ragionarci sopra. */
  quiete: 3 * 60_000,
  /** Fra un ragionamento e l'altro, al minimo, per persona. */
  minimo: 10 * 60_000,
  /** Prima di riprovare una cartella che non si è lasciata guardare. */
  riprova: 10 * 60_000
}

/** Cosa succede quando si è fatto silenzio: lo mette `index.ts`, lo sostituiscono le prove. */
let dopoLArrivo: (daQuando: string) => Promise<unknown> = async () => {}

/** Chi ragiona su quello che è arrivato. Una volta per lotto, mai con le mani vuote. */
export function quandoSiCalma(fn: (daQuando: string) => Promise<unknown>) {
  dopoLArrivo = fn
}

/** Solo per le prove: tempi corti, o i tempi veri con `null`. */
export function perProva(t: Partial<typeof TEMPI> | null) {
  Object.assign(TEMPI, t ?? { attesa: 1_500, quiete: 3 * 60_000, minimo: 10 * 60_000, riprova: 10 * 60_000 })
}

type Posto = {
  /** Di chi sono queste cartelle: i lavori in sottofondo rientrano con `chi.dentro`. */
  utente: string | null
  /** Cartella → quello che la guarda; `null` finché non si riesce ad aprirla. */
  cartelle: Map<string, FSWatcher | null>
  /** Percorso → il timer che aspetta la fine della raffica. */
  pendenti: Map<string, NodeJS.Timeout>
  /** Le cartelle da riprovare più tardi. */
  riprove: Map<string, NodeJS.Timeout>
  /** Il timer del silenzio, e quello che aspetta il minimo fra due ragionamenti. */
  quiete: NodeJS.Timeout | null
  /** Quando è cominciato il lotto in corso: da lì si contano gli arrivi. */
  daQuando: string | null
  cambiati: number
  tolti: number
  /** L'ultima volta che si è ragionato sul lotto. */
  ultimoGiro: number
  /** Un ragionamento sta girando: quello dopo aspetta. */
  inCorso: boolean
}

const posti = new Map<string, Posto>()

const chiave = () => chi.adesso() ?? ''

/** Nel contesto di chi ha le cartelle, anche da un timer. */
function dentro<T>(posto: Posto, fn: () => T): T {
  return posto.utente ? chi.dentro(posto.utente, fn) : fn()
}

/**
 * Parte — o riparte — per la persona di adesso, sulle cartelle in configurazione.
 *
 * Si chiama all'avvio per ognuno e ogni volta che le cartelle cambiano: le
 * vecchie si chiudono, le nuove si aprono. Senza cartelle, o su un server,
 * non fa niente e non lascia niente acceso.
 */
export function avvia(c: ConfigDesktop | undefined | null) {
  ferma()
  if (OSPITATO || !c?.cartelle.length) return
  const posto: Posto = {
    utente: chi.adesso(), cartelle: new Map(), pendenti: new Map(), riprove: new Map(),
    quiete: null, daQuando: null, cambiati: 0, tolti: 0, ultimoGiro: 0, inCorso: false
  }
  posti.set(chiave(), posto)
  for (const cartella of c.cartelle) apri(posto, resolve(cartella))
}

/**
 * Apre gli occhi su una cartella. Se non ci riesce — troppi file aperti,
 * cartella sparita, permesso negato — lo dice una volta e riprova più tardi:
 * un disco esterno staccato non deve far morire il server, e quando lo si
 * riattacca deve tornare a essere guardato senza che nessuno riavvii niente.
 */
function apri(posto: Posto, cartella: string) {
  const vecchio = posto.cartelle.get(cartella)
  if (vecchio) vecchio.close()
  posto.cartelle.set(cartella, null)
  try {
    const w = watch(cartella, { recursive: true, persistent: false }, (_evento, nome) => {
      // `nome` può mancare, in teoria: allora non si sa cosa è cambiato, e
      // l'unica cosa onesta è lasciare il lavoro al giro delle sei ore
      if (nome == null) return
      segna(posto, cartella, join(cartella, String(nome)))
    })
    w.on('error', (e: NodeJS.ErrnoException) => {
      console.error(`myynd · vedetta: ${cartella} non si lascia più guardare (${e.code ?? e.message}); riprovo fra dieci minuti`)
      w.close()
      riprovaPiuTardi(posto, cartella)
    })
    posto.cartelle.set(cartella, w)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    console.error(`myynd · vedetta: non riesco a guardare ${cartella} (${code ?? (e instanceof Error ? e.message : e)}); riprovo fra dieci minuti`)
    riprovaPiuTardi(posto, cartella)
  }
}

function riprovaPiuTardi(posto: Posto, cartella: string) {
  if (posto.cartelle.has(cartella)) posto.cartelle.set(cartella, null)
  const t = posto.riprove.get(cartella)
  if (t) clearTimeout(t)
  posto.riprove.set(cartella, setTimeout(() => {
    posto.riprove.delete(cartella)
    // la vedetta può essere stata fermata nel frattempo: allora niente
    if (posti.get(posto.utente ?? '') !== posto) return
    apri(posto, cartella)
  }, TEMPI.riprova).unref())
}

/** Un evento su un percorso: si aspetta la fine della raffica, poi si guarda. */
function segna(posto: Posto, radice: string, percorso: string) {
  const t = posto.pendenti.get(percorso)
  if (t) clearTimeout(t)
  posto.pendenti.set(percorso, setTimeout(() => {
    posto.pendenti.delete(percorso)
    dentro(posto, () => guarda(posto, radice, percorso))
      .catch(e => console.error('myynd · vedetta:', e instanceof Error ? e.message : e))
  }, TEMPI.attesa))
}

/**
 * Cosa è successo a un percorso, e cosa se ne fa l'indice.
 *
 *   · c'è ed è un file → si legge, con le regole di `desktop.ts`, e si salva
 *     (se la data di modifica è quella già in indice, non si estrae niente);
 *   · c'è ed è una cartella → si legge tutta: spostarne una dentro può
 *     arrivare come un evento solo, senza quelli sui file;
 *   · non c'è più → esce dall'indice, e con lei tutto quello che stava sotto.
 */
async function guarda(posto: Posto, radice: string, percorso: string) {
  // il lotto comincia *prima* di leggere: `indicizzato` lo scrive `salvaDocumenti`
  // con la sua ora, e un `daQuando` preso dopo veniva un millisecondo più tardi
  // — `appenaArrivati(daQuando)` non trovava il file che aveva svegliato la
  // vedetta, e un file solo sulla scrivania non arrivava mai alla prima pagina
  const inizio = new Date().toISOString()
  let s
  try { s = await stat(percorso) } catch { s = null }

  if (!s) {
    // per un percorso sparito si giudica dal nome: cancellare un file
    // ignorato non tocca niente, e una cartella si svuota per prefisso
    const id = `desktop:${percorso}`
    const ids = [...(await daSaltare(percorso, radice) ? [] : [id]), ...store.idsConPrefisso(`${id}/`)]
    const n = ids.length ? store.scordaDocumenti(ids) : 0
    if (n) conta(posto, 0, n, inizio)
    return
  }

  if (s.isDirectory()) {
    if (await daSaltare(percorso, radice, true)) return
    const e = await leggiCartella(percorso)
    if (!e.docs.length) return
    const r = store.salvaDocumenti(e.docs)
    conta(posto, r.nuovi + r.cambiati, 0, inizio)
    return
  }

  if (!s.isFile() || await daSaltare(percorso, radice)) return
  const id = `desktop:${percorso}`
  // un evento senza cambiamento — un tocco ai permessi, un'apertura — non
  // deve costare un'estrazione: la data di modifica lo dice prima
  if (store.documento(id)?.quando === s.mtime.toISOString()) return
  const d = await leggiUno(percorso, s)
  if (!d) {
    // c'è ancora, ma non è più un documento: svuotato, o cresciuto troppo
    const n = store.scordaDocumenti([id])
    if (n) conta(posto, 0, n, inizio)
    return
  }
  const r = store.salvaDocumenti([d])
  if (r.nuovi + r.cambiati) conta(posto, r.nuovi + r.cambiati, 0, inizio)
}

/** Un cambiamento vero nell'indice: si aggiunge al lotto e si riaccende il silenzio. */
function conta(posto: Posto, cambiati: number, tolti: number, inizio: string) {
  // da quando si è cominciato a guardare, non da adesso: vedi `guarda`
  if (!posto.daQuando || inizio < posto.daQuando) posto.daQuando = inizio
  posto.cambiati += cambiati
  posto.tolti += tolti
  if (posto.quiete) clearTimeout(posto.quiete)
  posto.quiete = setTimeout(() => { posto.quiete = null; void calma(posto) }, TEMPI.quiete).unref()
}

/**
 * Si è fatto silenzio: una riga per il lotto, e poi il ragionamento — se
 * l'ultimo non è troppo vicino. Se lo è, si aspetta il minimo e si riparte
 * con tutto quello che nel frattempo si è aggiunto: rimandare non è perdere.
 */
async function calma(posto: Posto) {
  if (posti.get(posto.utente ?? '') !== posto) return
  const fra = posto.ultimoGiro + TEMPI.minimo - Date.now()
  if (posto.inCorso || fra > 0) {
    posto.quiete = setTimeout(() => { posto.quiete = null; void calma(posto) }, Math.max(fra, 1_000)).unref()
    return
  }
  const { cambiati, tolti, daQuando } = posto
  posto.cambiati = 0; posto.tolti = 0; posto.daQuando = null
  console.log(`myynd · vedetta: ${cambiati} file cambiat${cambiati === 1 ? 'o' : 'i'}, ${tolti} tolt${tolti === 1 ? 'o' : 'i'}`)
  // niente di nuovo da leggere — solo cancellazioni — non è un arrivo
  if (!cambiati || !daQuando) return
  posto.inCorso = true
  posto.ultimoGiro = Date.now()
  try {
    await dentro(posto, () => dopoLArrivo(daQuando))
  } catch (e) {
    console.error('myynd · vedetta: quello che viene dopo non è riuscito:', e instanceof Error ? e.message : e)
  } finally {
    posto.inCorso = false
  }
}

function chiudi(posto: Posto) {
  for (const w of posto.cartelle.values()) w?.close()
  for (const t of posto.pendenti.values()) clearTimeout(t)
  for (const t of posto.riprove.values()) clearTimeout(t)
  if (posto.quiete) clearTimeout(posto.quiete)
  posto.cartelle.clear(); posto.pendenti.clear(); posto.riprove.clear(); posto.quiete = null
}

/** Chiude gli occhi per la persona di adesso. */
export function ferma() {
  const posto = posti.get(chiave())
  if (!posto) return
  chiudi(posto)
  posti.delete(chiave())
}

/** Tutti, allo spegnimento. */
export function fermaTutti() {
  for (const posto of posti.values()) chiudi(posto)
  posti.clear()
}

/** Com'è messa, per la persona di adesso: in ascolto, e su quante cartelle davvero aperte. */
export function stato(): { attiva: boolean; cartelle: number } {
  const posto = posti.get(chiave())
  const aperte = posto ? [...posto.cartelle.values()].filter(Boolean).length : 0
  return { attiva: aperte > 0, cartelle: aperte }
}
