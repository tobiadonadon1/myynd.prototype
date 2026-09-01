// Le automazioni arrivano da fuori, senza rifare l'app.
//
// Il modo in cui questo prodotto si vende è: si parla con un cliente, si
// capisce che lavoro fa a mano ogni mattina, e gliene si scrivono tre. Finché
// le ricette stavano *dentro* il pacchetto, quel giro finiva in una nuova
// versione dell'app da firmare, notarizzare e far installare — per tre file di
// testo. Nessuno lo fa, e le automazioni restano quelle di serie per sempre.
//
// Qui le ricette diventano una cosa che si pubblica. Si spinge una cartella nel
// repository e le installazioni di quel cliente se la prendono da sole.
//
// Tre cose che questo file non fa, e sono il motivo per cui si può fare:
//
// — **non scarica codice.** Quello che arriva è JSON, passa dalla stessa
//   `valida()` delle ricette di serie, e il vocabolario è chiuso: una ricetta
//   può dire quando guardare, cosa cercare, cosa farne e dove metterlo. Non
//   c'è modo di scriverne una che faccia una cosa che il motore non sappia già
//   fare. Chi controlla il repository non guadagna un'esecuzione di codice: può
//   solo comporre verbi che esistono già.
// — **non scrive nel pacchetto.** L'app su macOS è firmata: toccarne il
//   contenuto la rompe. Le ricette scaricate stanno in ~/.myynd/automazioni,
//   che è roba di questa macchina.
// — **non manda niente su.** L'unica cosa che esce è il nome della licenza
//   dentro un indirizzo — «quali automazioni per questo cliente» — e la
//   risposta non dice a nessuno chi sia.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cartella } from './config.ts'

/** Dove finiscono. Mai dentro il pacchetto: quello è firmato. */
// una funzione e non una costante: la cartella dipende da chi sta chiedendo
export const DOVE = () => join(cartella(), 'automazioni')

const INDICE = join(DOVE(), 'indice.json')

/** Il tetto per file e per cartella: un repository ostile non riempie il disco. */
const TETTO_FILE = 64 * 1024
const TETTO_QUANTE = 200

/**
 * Un nome di file che si può scrivere su disco senza pensarci.
 *
 * Arriva da una risposta HTTP, quindi è testo di qualcun altro, e finisce in un
 * `join()`. Senza questo filtro «../../.ssh/authorized_keys» è un nome di file
 * come un altro. Minuscole, cifre e trattini: le ricette si chiamano così.
 */
const NOME = /^[a-z0-9][a-z0-9-]*\.json$/

/** `proprietario/repository`, e nient'altro: finisce dentro un indirizzo. */
const REPO = /^[\w.-]+\/[\w.-]+$/

export type Sorgente = { repo: string; ramo?: string; token?: string; licenza?: string }

export type Esito = {
  quando: string
  cartelle: string[]
  nuove: number
  cambiate: number
  tolte: number
  scartate: number
  guaio: string | null
}

type Indice = { quando: string; guaio: string | null; sha: Record<string, Record<string, string>> }

function leggiIndice(): Indice {
  try { return JSON.parse(readFileSync(INDICE, 'utf8')) as Indice }
  catch { return { quando: '', guaio: null, sha: {} } }
}

function scriviIndice(i: Indice) {
  if (!existsSync(DOVE())) mkdirSync(DOVE(), { recursive: true, mode: 0o700 })
  writeFileSync(INDICE, JSON.stringify(i, null, 2), { mode: 0o600 })
}

/** Quand'è andata l'ultima volta, e com'è finita. Per la schermata. */
export function stato(): { quando: string | null; guaio: string | null } {
  const i = leggiIndice()
  return { quando: i.quando || null, guaio: i.guaio }
}

/**
 * Le cartelle scaricate, nell'ordine in cui vanno lette.
 *
 * Quella del cliente dopo quella comune, come per le ricette del pacchetto:
 * l'ultima vince, e correggere una ricetta per un cliente solo non tocca
 * quella di tutti gli altri.
 */
export function cartelleScaricate(licenza?: string): string[] {
  const fuori = [join(DOVE(), '_comuni')]
  const az = (licenza ?? '').trim()
  if (az && /^[a-z0-9-]+$/i.test(az)) fuori.push(join(DOVE(), az))
  return fuori.filter(existsSync)
}

type Voce = { name: string; sha: string; size: number; type: string }

async function chiedi(s: Sorgente, percorso: string, grezzo: boolean): Promise<Response> {
  const ramo = encodeURIComponent(s.ramo?.trim() || 'main')
  const url = `https://api.github.com/repos/${s.repo}/contents/${percorso}?ref=${ramo}`
  return fetch(url, {
    headers: {
      accept: grezzo ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'user-agent': 'myynd',
      'x-github-api-version': '2022-11-28',
      // il token esce solo verso api.github.com, e solo se c'è
      ...(s.token ? { authorization: `Bearer ${s.token}` } : {})
    },
    signal: AbortSignal.timeout(20_000)
  })
}

/**
 * Una cartella di ricette, aggiornata sul posto.
 *
 * Si scarica solo quello che è cambiato: l'indice tiene lo `sha` di ogni file e
 * quello che combacia non si richiede nemmeno. Dieci ricette ferme costano una
 * chiamata sola.
 *
 * E si cancella solo se l'elenco è arrivato per intero. È la stessa regola di
 * `riconcilia` nell'indice dei documenti, per la stessa ragione: una risposta a
 * metà non deve poter svuotare la cartella di un cliente — le automazioni
 * smetterebbero di girare senza che nessuno abbia deciso niente.
 */
async function unaCartella(
  s: Sorgente,
  cartella: string,
  valida: (x: unknown, da: string) => unknown,
  indice: Indice,
  e: Esito
): Promise<void> {
  const r = await chiedi(s, `automazioni/${encodeURIComponent(cartella)}`, false)
  // la cartella di un cliente può non esistere ancora: non è un guasto
  if (r.status === 404) return
  if (!r.ok) throw new Error(`${cartella}: il repository ha risposto ${r.status}`)

  const voci = (await r.json() as Voce[])
    .filter(v => v.type === 'file' && NOME.test(v.name) && v.size <= TETTO_FILE)
    .slice(0, TETTO_QUANTE)

  const qui = join(DOVE(), cartella)
  if (!existsSync(qui)) mkdirSync(qui, { recursive: true, mode: 0o700 })
  const sha = indice.sha[cartella] ?? {}
  const nuovoSha: Record<string, string> = {}

  for (const v of voci) {
    if (sha[v.name] === v.sha && existsSync(join(qui, v.name))) {
      nuovoSha[v.name] = v.sha       // ferma: non la si richiede
      continue
    }
    const f = await chiedi(s, `automazioni/${encodeURIComponent(cartella)}/${encodeURIComponent(v.name)}`, true)
    if (!f.ok) { e.scartate++; continue }
    const testo = await f.text()
    if (testo.length > TETTO_FILE) { e.scartate++; continue }
    try {
      // la stessa porta delle ricette di serie: se non passa di lì non si scrive
      valida(JSON.parse(testo), v.name)
    } catch (guaio) {
      console.error(`myynd · ricetta scartata da ${s.repo} (${cartella}/${v.name}):`,
        guaio instanceof Error ? guaio.message : guaio)
      e.scartate++
      continue
    }
    const cera = existsSync(join(qui, v.name))
    writeFileSync(join(qui, v.name), testo, { mode: 0o600 })
    nuovoSha[v.name] = v.sha
    if (cera) e.cambiate++; else e.nuove++
  }

  // quello che non c'è più di là non deve restare di qua: è il modo in cui si
  // ritira un'automazione a un cliente
  for (const f of readdirSync(qui).filter(n => n.endsWith('.json'))) {
    if (nuovoSha[f]) continue
    rmSync(join(qui, f), { force: true })
    e.tolte++
  }

  indice.sha[cartella] = nuovoSha
  e.cartelle.push(cartella)
}

/**
 * Tira giù le ricette di questa installazione: quelle di tutti e le sue.
 *
 * Non lancia mai: gira in sfondo e un repository irraggiungibile non è un
 * guasto dell'app — è una cosa che si riprova fra sei ore, con quello che c'è
 * già sul disco che continua a girare intanto.
 */
export async function aggiorna(s: Sorgente, valida: (x: unknown, da: string) => unknown): Promise<Esito> {
  const e: Esito = {
    quando: new Date().toISOString(), cartelle: [],
    nuove: 0, cambiate: 0, tolte: 0, scartate: 0, guaio: null
  }
  if (!REPO.test(s.repo ?? '')) {
    e.guaio = 'Il repository si scrive «proprietario/nome».'
    return e
  }

  const indice = leggiIndice()
  try {
    await unaCartella(s, '_comuni', valida, indice, e)
    const az = (s.licenza ?? '').trim()
    if (az && /^[a-z0-9-]+$/i.test(az)) await unaCartella(s, az, valida, indice, e)
  } catch (guaio) {
    e.guaio = guaio instanceof Error ? guaio.message : String(guaio)
  }

  indice.quando = e.quando
  indice.guaio = e.guaio
  scriviIndice(indice)
  return e
}
