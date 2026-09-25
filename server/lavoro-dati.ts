// Le righe e le misure del lavoro affidato, sull'indice di chi chiede.
//
// Tutto quello che P3 scrive sul database sta qui, e solo qui: le domande
// fatte, l'ipotesi, la voce usata, la bozza mandata dalla sua posta, e la
// tabella `misure_compiti` (una riga per compito affidato). Il resto del
// lavoro (`stesura.ts`, `voce.ts`, `domanda-sola.ts`) non scrive niente, e
// P6 può riusarlo in un recinto che non scrive.
//
// I contatori crescono e basta: una domanda fatta resta fatta anche se la
// riga viene riaffidata, e il primo invio vince sul secondo.

import db from './store.ts'
import * as store from './store.ts'
import { BLOCCHI } from './domanda-sola.ts'

const ora = () => new Date().toISOString()

export type Misura = {
  compito: string
  affidato: string
  modo: string | null
  origine: string | null
  domande: number
  presunte: number
  cercate: number
  correzioni: number
  mossa: string | null
  genere: string | null
  tipo: string | null
  consegnato: string | null
  inviato: string | null
  via: string | null
  distanza: number | null
  parole: number | null
  classe: string | null
}

/** Una domanda scritta davvero sotto la riga: si conta sulla riga e sulle misure. */
export function contaDomanda(id: string) {
  db.prepare('UPDATE compiti SET domandeFatte = domandeFatte + 1 WHERE id = ?').run(id)
  db.prepare('UPDATE misure_compiti SET domande = domande + 1 WHERE compito = ?').run(id)
}

export function scriviIpotesi(id: string, ipotesi: string[] | null) {
  db.prepare('UPDATE compiti SET ipotesi = ? WHERE id = ?')
    .run(ipotesi && ipotesi.length ? JSON.stringify(ipotesi) : null, id)
}

export function scriviVoceScritta(id: string, v: store.Compito['voceScritta'] | null) {
  db.prepare('UPDATE compiti SET voceScritta = ? WHERE id = ?').run(v ? JSON.stringify(v) : null, id)
}

/** La bozza è partita dalla sua posta: si scrive una volta sola. Torna false se c'era già. */
export function segnaMandata(id: string, m: NonNullable<store.Compito['mandata']>): boolean {
  const r = db.prepare('UPDATE compiti SET mandata = ?, aggiornato = ?, versione = versione + 1 WHERE id = ? AND mandata IS NULL')
    .run(JSON.stringify(m), ora(), id)
  return Number(r.changes) > 0
}

/** All'affido: una riga di misure, se non c'è. Il fondo (iniziative, automazioni) si segna come tale. */
export function registraAffido(c: Pick<store.Compito, 'id' | 'modo' | 'origine' | 'chiesto'>, nativa: boolean) {
  db.prepare('INSERT OR IGNORE INTO misure_compiti (compito, affidato, modo, origine) VALUES (?, ?, ?, ?)')
    .run(c.id, c.chiesto ?? ora(), c.modo ?? null, nativa ? (c.origine || 'mano') : 'fondo')
  // l'ipotesi e la voce erano del risultato di prima: il nuovo le riscrive, o non le ha
  db.prepare('UPDATE compiti SET ipotesi = NULL, voceScritta = NULL WHERE id = ?').run(c.id)
}

/** Com'è finita: la mossa, il genere del dato mancante, il tipo di lavoro, quando è stata consegnata. */
export function registraEsito(id: string, e: { mossa: string; genere?: string | null; tipo?: string | null; consegnato?: string | null }) {
  db.prepare(`
    UPDATE misure_compiti SET mossa = ?, genere = ?, tipo = COALESCE(?, tipo), consegnato = COALESCE(?, consegnato),
      presunte = presunte + ?
    WHERE compito = ?
  `).run(e.mossa, e.genere ?? null, e.tipo ?? null, e.consegnato ?? null, e.mossa === 'presumi' ? 1 : 0, id)
}

/** Lei ha cambiato l'ipotesi: si conta, anche su una riga vecchia senza misure. */
export function registraCorrezione(id: string) {
  const c = store.compito(id)
  db.prepare('INSERT OR IGNORE INTO misure_compiti (compito, affidato, modo, origine) VALUES (?, ?, ?, ?)')
    .run(id, c?.chiesto ?? ora(), c?.modo ?? null, c?.origine || 'mano')
  db.prepare('UPDATE misure_compiti SET correzioni = correzioni + 1 WHERE compito = ?').run(id)
}

/**
 * Un invio: dalla casella (SMTP), dalla sua posta (osservato), scritto da
 * lei («propria»), o copiato. Il primo vince. Una riga vecchia senza misure
 * ne riceve una, con l'affido alla data della delega.
 */
export function registraInvio(id: string, i: { via: 'smtp' | 'casella' | 'propria' | 'copia'; inviato: string; distanza?: number | null; parole?: number | null; classe?: string | null }): boolean {
  const c = store.compito(id)
  db.prepare('INSERT OR IGNORE INTO misure_compiti (compito, affidato, modo, origine) VALUES (?, ?, ?, ?)')
    .run(id, c?.chiesto ?? ora(), c?.modo ?? null, c?.origine || 'mano')
  const r = db.prepare(`
    UPDATE misure_compiti SET via = ?, inviato = ?, distanza = ?, parole = ?, classe = ?
    WHERE compito = ? AND inviato IS NULL
  `).run(i.via, i.inviato, i.distanza ?? null, i.parole ?? null, i.classe ?? null, id)
  return Number(r.changes) > 0
}

export function misura(id: string): Misura | null {
  return (db.prepare('SELECT * FROM misure_compiti WHERE compito = ?').get(id) as Misura | undefined) ?? null
}

/** Le misure che toccano una finestra: affidate o inviate da quel momento in poi. */
export function misureDal(iso: string): Misura[] {
  return db.prepare('SELECT * FROM misure_compiti WHERE affidato >= ? OR inviato >= ? ORDER BY affidato').all(iso, iso) as Misura[]
}

/** C'è almeno una mail mandata da lei, indicizzata in quella finestra? Senza, l'osservatore non può vedere niente. */
export function postaInviataDal(iso: string): boolean {
  return !!db.prepare('SELECT 1 FROM documenti WHERE inviato = 1 AND quando >= ? LIMIT 1').get(iso)
}

/** Le righe ferme su un blocco, ancora aperte, toccate negli ultimi sette giorni. */
export function bloccatiDaRiprendere(): store.Compito[] {
  const da = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const frasi = Object.values(BLOCCHI)
  const righe = db.prepare(`
    SELECT * FROM compiti
    WHERE stato = 'aperto' AND sparito IS NULL AND aggiornato >= ? AND guaio IN (${frasi.map(() => '?').join(',')})
    ORDER BY aggiornato
  `).all(da, ...frasi) as Record<string, unknown>[]
  return righe.map(r => store.compito(String(r.id))).filter((c): c is store.Compito => !!c)
}

/** Le colonne che si leggono di un documento, per nome: le stesse di `store.documento`. */
const CAMPI = 'id, fonte, tipo, titolo, corpo, autore, percorso, quando, gruppo, filo, inviato, messageId, letto, massa, risponde, destinatari'

function documenti(righe: Record<string, unknown>[]): store.Documento[] {
  return righe.map(r => ({ ...r, inviato: !!r.inviato }) as unknown as store.Documento)
}

/**
 * Le mail che ha mandato a quell'indirizzo: quelle in un filo dove quella
 * persona ha scritto (mai un filo `s:`, che è un filo per oggetto e non per
 * conversazione), più quelle degli ultimi novanta giorni che lo portano fra i
 * destinatari. Le più recenti prima, senza doppioni.
 */
export function inviatiVerso(indirizzo: string, limite = 12): store.Documento[] {
  const chi = indirizzo.trim().toLowerCase()
  if (!chi) return []
  const da = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const righe = db.prepare(`
    SELECT ${CAMPI} FROM documenti
    WHERE inviato = 1 AND (
      (filo IS NOT NULL AND filo NOT LIKE 's:%' AND filo IN (
        SELECT filo FROM documenti WHERE autoreIndirizzo = ? AND inviato = 0 AND filo IS NOT NULL
      ))
      OR (quando >= ? AND destinatari IS NOT NULL AND (',' || destinatari || ',') LIKE ?)
    )
    ORDER BY quando DESC
    LIMIT ?
  `).all(chi, da, `%,${chi},%`, limite) as Record<string, unknown>[]
  return documenti(righe)
}

/** Le ultime mail che ha mandato, a chiunque: la voce di tutti i giorni. */
export function ultimiInviati(n = 30): store.Documento[] {
  const righe = db.prepare(`SELECT ${CAMPI} FROM documenti WHERE inviato = 1 ORDER BY quando DESC LIMIT ?`).all(n) as Record<string, unknown>[]
  return documenti(righe)
}

/**
 * Le mail mandate dopo un momento, che rispondono a quel messaggio o che
 * stanno nello stesso filo senza dire a cosa rispondono. La prima è la più
 * vecchia: è quella che ha preso il posto della bozza.
 */
export function inviatiDopo(risponde: string | null | undefined, filo: string | null | undefined, dopo: string): store.Documento[] {
  const r = risponde?.trim() || null
  const f = filo && !filo.startsWith('s:') ? filo : null
  if (!r && !f) return []
  const righe = db.prepare(`
    SELECT ${CAMPI} FROM documenti
    WHERE inviato = 1 AND quando > ? AND (
      (? IS NOT NULL AND risponde = ?) OR (? IS NOT NULL AND risponde IS NULL AND filo = ?)
    )
    ORDER BY quando ASC
    LIMIT 5
  `).all(dopo, r, r, f, f) as Record<string, unknown>[]
  return documenti(righe)
}
