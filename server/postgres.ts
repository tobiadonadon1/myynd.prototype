// Postgres, quando c'è: Supabase, o qualunque altro.
//
// **Perché esiste.** Su un server i conti e le configurazioni stavano su
// disco, e il disco di un contenitore non sopravvive a un redeploy. Il modo in
// cui lo si scopriva era il peggiore: si ridistribuiva, i conti non c'erano
// più, e chi entrava con la password giusta si sentiva dire che era sbagliata.
// Con `MYYND_POSTGRES` impostata, i conti, le sessioni e la configurazione di
// ogni persona vivono qui — e sopravvivono a qualunque cosa succeda al
// contenitore. Senza, non cambia niente: SQLite e i file, come sempre.
//
// **Cosa NON passa di qui.** L'indice — `mente.db`, i documenti, la ricerca —
// resta sul disco di ogni persona: è una copia delle sue fonti, e si rifà
// rileggendole. Portarlo su Postgres vorrebbe dire riscrivere la ricerca
// (FTS5 → tsvector) e rendere asincrone centoventisette query. Non oggi.
//
// **Le credenziali non si scrivono in chiaro.** Nella configurazione ci sono
// la password della casella, il token di Notion, la chiave del modello. Su un
// disco erano un file 0600 sul computer di chi le aveva scritte; in un
// database ospitato sarebbero righe che chiunque abbia accesso al progetto
// può leggere. Quindi si cifrano prima di partire, con una chiave che sta
// solo nell'ambiente del server (`MYYND_CHIAVE`): chi guarda Supabase vede un
// blob, e chi ha il blob senza la chiave non ne fa niente.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** La stringa di connessione. Vuota = Postgres non c'è, e non si prova nemmeno. */
export const URL = (process.env.MYYND_POSTGRES ?? '').trim()
export const ATTIVO = !!URL

/**
 * Chi esegue le query. `pg.Pool` in produzione; nelle prove PGlite, che è un
 * Postgres vero dentro il processo e non vuole né rete né installazioni.
 * La forma è il minimo comune: `query(testo, parametri)` → `{ rows }`.
 */
export type Esecutore = {
  query(testo: string, parametri?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

let esecutore: Esecutore | null = null

/** Da usare nelle prove: un esecutore deciso da fuori, prima di qualunque query. */
export function usa(e: Esecutore) { esecutore = e }

/**
 * Il TLS verso il database.
 *
 * Verso un Postgres in casa non serve. Verso Supabase è obbligatorio, e il
 * certificato che presenta il loro pooler non è sempre firmato da un'autorità
 * che Node conosce: con la verifica accesa la connessione fallisce con un
 * errore che parla di certificati e non di configurazione, e la persona che
 * sta mettendo su il server lo prende per un guasto. Quindi di serie si cifra
 * senza verificare chi c'è dall'altra parte — è quello che fanno gli esempi
 * di Supabase stessi — e chi vuole la verifica intera mette in
 * `MYYND_POSTGRES_CA` il percorso del certificato che Supabase dà da scaricare.
 */
type Pezzi = { user: string; password: string; host: string; port: number; database: string }

/**
 * La stringa di connessione, spaccata a mano — non da `new URL()`.
 *
 * `pg` la farebbe passare da lì, e quella non perdona: una password con
 * dentro una `/` — e la password di un database Postgres può contenere
 * qualunque cosa, Supabase non impone niente — la spezza in un modo che
 * sembra un errore di rete, e invece è un errore di sintassi. Il server non
 * partiva, e il messaggio lo nascondeva dietro un «Invalid URL» senza il
 * valore: Node lo redige da sé, di proposito, per lo stesso motivo per cui
 * anche qui non si stampa mai la stringa intera.
 *
 * Si spacca dai bordi verso dentro. L'unico carattere che conta è l'ultima
 * `@`: quello separa le credenziali dall'host, e in un indirizzo vero non è
 * mai dentro una password — le password possono contenere una `/`, ma
 * un dominio o un IP non contengono mai una `@`.
 *
 * Funziona sia con la password scritta com'è — con la `/` e il resto veri —
 * sia con quella con `%2F` al posto della `/`: `decodeURIComponent` su un
 * carattere che non è già una sequenza `%XX` non fa niente, quindi le due
 * strade arrivano allo stesso posto.
 */
function analizza(stringa: string): Pezzi {
  const senzaSchema = stringa.replace(/^postgres(ql)?:\/\//, '')
  const chiocciola = senzaSchema.lastIndexOf('@')
  if (chiocciola < 0) {
    throw new Error('MYYND_POSTGRES non sembra una stringa postgresql://utente:password@host:porta/database.')
  }
  const credenziali = senzaSchema.slice(0, chiocciola)
  const resto = senzaSchema.slice(chiocciola + 1)

  const decodifica = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
  const duePunti = credenziali.indexOf(':')
  const user = decodifica(duePunti < 0 ? credenziali : credenziali.slice(0, duePunti))
  const password = decodifica(duePunti < 0 ? '' : credenziali.slice(duePunti + 1))

  const barra = resto.indexOf('/')
  const hostPorta = barra < 0 ? resto : resto.slice(0, barra)
  const database = ((barra < 0 ? '' : resto.slice(barra + 1)).split('?')[0] || 'postgres')
  const dueP = hostPorta.lastIndexOf(':')
  const host = dueP < 0 ? hostPorta : hostPorta.slice(0, dueP)
  const port = dueP < 0 ? 5432 : (Number(hostPorta.slice(dueP + 1)) || 5432)

  return { user, password, host, port, database }
}

/** Da usare nelle prove: la stessa lettura che fa `apri()`, senza aprire niente. */
export const perProva = { analizza }

function tls(): false | { rejectUnauthorized: boolean; ca?: string } {
  const inCasa = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(URL)
  if (inCasa) return false
  const ca = (process.env.MYYND_POSTGRES_CA ?? '').trim()
  if (ca) return { rejectUnauthorized: true, ca: readFileSync(ca, 'utf8') }
  return { rejectUnauthorized: false }
}

async function apri(): Promise<Esecutore> {
  if (esecutore) return esecutore
  if (!ATTIVO) throw new Error('Postgres non è configurato: manca MYYND_POSTGRES.')
  /*
   * `pglite:<cartella>` — un Postgres dentro il processo, sul disco.
   *
   * Serve a provare *questo* cammino — conti e configurazioni su Postgres,
   * un server che riparte e ritrova tutto — senza un database da qualche
   * parte. È una dipendenza di sviluppo: su un server vero si mette una
   * stringa di connessione, e questa riga non gira.
   */
  if (URL.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite')
    const dove = URL.slice('pglite:'.length)
    esecutore = new PGlite(dove || undefined) as unknown as Esecutore
    return esecutore
  }
  // caricato qui e non in cima: chi gira in casa, su SQLite, non deve nemmeno
  // avere `pg` in memoria
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ ...analizza(URL), ssl: tls(), max: 5, idleTimeoutMillis: 30_000 })
  // un client caduto nel pool non deve buttare giù il processo: si scrive, e
  // il pool ne apre un altro alla prossima query
  pool.on('error', e => console.error('myynd · postgres:', e.message))
  esecutore = pool
  return pool
}

export async function q(testo: string, parametri: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
  return (await apri()).query(testo, parametri)
}

/**
 * Le tabelle, con un prefisso.
 *
 * Il database può essere un progetto Supabase in cui vive anche altro: un
 * nome come `utenti` è il primo che chiunque userebbe, e due applicazioni che
 * se lo contendono si rompono a vicenda senza dirlo. `myynd_` davanti costa
 * sei lettere e toglie il problema.
 *
 * `creato` e `quando` sono testo ISO e non `timestamptz` di proposito: sono
 * gli stessi valori che SQLite tiene dall'inizio, e così `conti.ts` li
 * confronta nello stesso modo su tutti e due i database — un solo modo di
 * leggere una data, non due.
 */
export async function schema(): Promise<void> {
  await q(`
    CREATE TABLE IF NOT EXISTS myynd_utenti (
      id       TEXT PRIMARY KEY,
      email    TEXT NOT NULL UNIQUE,
      sale     TEXT NOT NULL,
      hash     TEXT NOT NULL,
      creato   TEXT NOT NULL,
      cartella TEXT
    )`)
  await q(`
    CREATE TABLE IF NOT EXISTS myynd_sessioni (
      impronta TEXT PRIMARY KEY,
      utente   TEXT NOT NULL REFERENCES myynd_utenti (id) ON DELETE CASCADE,
      quando   TEXT NOT NULL
    )`)
  await q('CREATE INDEX IF NOT EXISTS myynd_sessioni_utente ON myynd_sessioni (utente)')
  await q(`
    CREATE TABLE IF NOT EXISTS myynd_configurazioni (
      utente     TEXT PRIMARY KEY REFERENCES myynd_utenti (id) ON DELETE CASCADE,
      cifrato    TEXT NOT NULL,
      aggiornato TEXT NOT NULL
    )`)
}

// — la cifratura della configurazione —

/**
 * La chiave si ricava da una frase, non si chiede in esadecimale.
 *
 * Chi mette su un server deve poter scrivere una variabile lunga a caso e
 * basta: scrypt la porta a trentadue byte, e il sale fisso va bene perché
 * qui non si difende una password da un dizionario — si distende una frase
 * che è già segreta. Meno di sedici caratteri non si accetta: non perché
 * scrypt non funzioni, ma perché una chiave corta cifra credenziali vere.
 */
const FRASE = (process.env.MYYND_CHIAVE ?? '').trim()
let chiave: Buffer | null = null

function laChiave(): Buffer {
  if (chiave) return chiave
  if (FRASE.length < 16) throw new Error('MYYND_CHIAVE manca o è più corta di sedici caratteri.')
  chiave = scryptSync(FRASE, 'myynd/configurazione', 32, { N: 16384, r: 8, p: 1 })
  return chiave
}

/** Da usare nelle prove: una chiave decisa da fuori, senza passare dall'ambiente. */
export function usaChiave(frase: string) {
  chiave = scryptSync(frase, 'myynd/configurazione', 32, { N: 16384, r: 8, p: 1 })
}

export function chiavePronta(): boolean {
  try { laChiave(); return true } catch { return false }
}

/**
 * AES-256-GCM: cifra e autentica insieme, quindi un blob manomesso non si
 * decifra in qualcosa di plausibile — si rifiuta. Il formato porta la sua
 * versione davanti, così un giorno si può cambiare algoritmo senza dover
 * indovinare com'era scritto quello che c'è già.
 */
export function cifra(testo: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', laChiave(), iv)
  const dati = Buffer.concat([c.update(testo, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), dati.toString('base64url')].join('.')
}

export function decifra(blob: string): string {
  const [versione, iv, tag, dati] = blob.split('.')
  if (versione !== 'v1' || !iv || !tag || !dati) throw new Error('Configurazione cifrata in un formato che non conosco.')
  const d = createDecipheriv('aes-256-gcm', laChiave(), Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(dati, 'base64url')), d.final()]).toString('utf8')
}
