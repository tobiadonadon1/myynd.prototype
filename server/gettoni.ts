// Un gettone che non è una sessione: ha un nome, non scade, e arriva solo dove
// gli è concesso.
//
// **Perché serve.** `MYYND_DESKTOP_REMOTO_TOKEN` — il Mac di casa che spinge i
// documenti letti verso il Myynd sul server — finora era un normale token di
// sessione, cioè trenta giorni di vita e la morte a ogni cambio di password o
// «esci da tutti i dispositivi». Quando muore, la spinta fallisce **in
// silenzio, per sempre**: nessuno guarda i log di un giro che gira di notte, e
// la cosa si scopre settimane dopo dal fatto che sul server mancano dei
// documenti. Un credenziale che una persona incolla in una variabile
// d'ambiente non può avere la vita di una scheda del browser.
//
// **Perché ha un ambito, e perché l'ambito è tutto il punto.** Un gettone
// eterno che apre l'API intera sarebbe molto peggio di quello che sostituisce:
// sta scritto in chiaro dentro un file di configurazione su un portatile, e da
// lì aprirebbe la posta, la memoria, l'esportazione di tutto. Un gettone
// `desktop` arriva a due rotte — quelle a cui la spinta bussa davvero — e a
// nient'altro. In particolare non arriva a `/api/conto/…`: non può cambiare la
// password, non può cancellare il conto, non può scaricare i dati. Chi lo
// rubasse potrebbe scrivere documenti nell'indice di chi l'ha creato, che è
// esattamente quello per cui esiste, e niente di più.
//
// La tabella la crea `conti.ts` (SQLite) o `postgres.schema()`, accanto alle
// sessioni: dice la stessa cosa, di chi è una chiave.

import { createHash, randomBytes } from 'node:crypto'
import * as conti from './conti.ts'
import * as postgres from './postgres.ts'

/**
 * Il prefisso serve a chi legge e a chi controlla.
 *
 * A chi legge: un valore incollato in una variabile d'ambiente si riconosce a
 * colpo d'occhio per quello che è, invece di sembrare sessanta caratteri a caso
 * come tutti gli altri. A chi controlla: la guardia sa subito quale delle due
 * strade prendere, e non fa un giro di database per ognuna delle due.
 */
export const PREFISSO = 'myyk_'

export type Ambito = 'desktop'

/**
 * Cosa apre ogni ambito, per intero.
 *
 * Percorsi esatti, non prefissi. Un prefisso qui sarebbe la stessa comodità che
 * trasforma un permesso in un altro: `/api/connettori/` domani conterrebbe una
 * rotta che scollega una fonte, e il gettone del Mac potrebbe scollegare la
 * posta di chi l'ha creato senza che nessuno abbia deciso niente.
 */
const ROTTE: Record<Ambito, string[]> = {
  desktop: ['/api/connettori/desktop/carica', '/api/connettori/desktop/carica-file']
}

/**
 * Quelli che esistono. La schermata li mostra per nome e li spiega da sé, in
 * tutt'e due le lingue: una frase italiana che parte da qui arriverebbe in
 * italiano sotto un'interfaccia inglese.
 */
export const AMBITI: Ambito[] = ['desktop']

export function ambitoValido(a: string): a is Ambito {
  return (AMBITI as string[]).includes(a)
}

/** Questo gettone può bussare qui? */
export function puoi(ambito: string, percorso: string): boolean {
  return ambitoValido(ambito) && ROTTE[ambito].includes(percorso)
}

export type Gettone = {
  id: string
  nome: string
  ambito: string
  creato: string
  /** L'ultima volta che è servito a qualcosa. `null` = mai. */
  usato: string | null
}

const db = conti.suDisco()

function impronta(gettone: string): string {
  return createHash('sha256').update(gettone).digest('hex')
}

/**
 * Uno nuovo. Si vede una volta e poi mai più: sul database c'è l'impronta.
 *
 * Il nome lo scrive chi lo crea ed è l'unica cosa che gli permetterà di
 * decidere quale revocare fra sei mesi. Vuoto non si accetta — un elenco di tre
 * righe senza nome è un elenco su cui non si può agire.
 */
export async function crea(utente: string, nome: string, ambito: string):
  Promise<{ ok: true; id: string; gettone: string } | { ok: false; errore: string }> {
  const n = nome.trim().slice(0, 60)
  if (!n) return { ok: false, errore: 'Dai un nome a questo gettone: senza, non saprai quale revocare.' }
  if (!ambitoValido(ambito)) return { ok: false, errore: 'Non conosco questo ambito.' }

  const id = 'g' + randomBytes(8).toString('hex')
  const gettone = PREFISSO + randomBytes(24).toString('hex')
  const imp = impronta(gettone)
  const creato = new Date().toISOString()
  if (db) {
    db.prepare('INSERT INTO gettoni (id, utente, nome, ambito, impronta, creato) VALUES (?,?,?,?,?,?)')
      .run(id, utente, n, ambito, imp, creato)
  } else {
    await postgres.q('INSERT INTO myynd_gettoni (id, utente, nome, ambito, impronta, creato) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, utente, n, ambito, imp, creato])
  }
  return { ok: true, id, gettone }
}

export async function elenco(utente: string): Promise<Gettone[]> {
  if (db) {
    return db.prepare('SELECT id, nome, ambito, creato, usato FROM gettoni WHERE utente = ? ORDER BY creato DESC')
      .all(utente) as unknown as Gettone[]
  }
  const { rows } = await postgres.q(
    'SELECT id, nome, ambito, creato, usato FROM myynd_gettoni WHERE utente = $1 ORDER BY creato DESC', [utente])
  return rows as unknown as Gettone[]
}

/** L'`utente` nella `WHERE` e non solo nella lettura prima: non si revoca quello di un altro. */
export async function revoca(utente: string, id: string): Promise<boolean> {
  if (db) return Number(db.prepare('DELETE FROM gettoni WHERE id = ? AND utente = ?').run(id, utente).changes) > 0
  const { rows } = await postgres.q('DELETE FROM myynd_gettoni WHERE id = $1 AND utente = $2 RETURNING id', [id, utente])
  return rows.length > 0
}

/**
 * Quando l'abbiamo visto l'ultima volta, al massimo una volta all'ora.
 *
 * La riga «usato» serve a una cosa sola: guardare l'elenco e capire quale di
 * questi gettoni è ancora vivo. Per quello un'ora di precisione è di lusso,
 * mentre una scrittura per richiesta sarebbe una scrittura ogni cinquanta
 * documenti spinti — su Postgres, dall'altra parte del mondo, dentro il giro
 * che deve andare veloce.
 *
 * La chiave è l'impronta del gettone, che appartiene a una persona sola: qui
 * non c'è niente che dipenda da chi sta chiedendo, e quindi niente da tenere
 * per utente.
 */
const segnatiDiRecente = new Map<string, number>()
const SEGNA_OGNI = 3_600_000

function daSegnare(imp: string): boolean {
  const ora = Date.now()
  const prima = segnatiDiRecente.get(imp)
  if (prima && ora - prima < SEGNA_OGNI) return false
  // la mappa non cresce per sempre: quello che è fermo da più di un'ora non serve più
  if (segnatiDiRecente.size > 500) {
    for (const [k, q] of segnatiDiRecente) if (ora - q > SEGNA_OGNI) segnatiDiRecente.delete(k)
  }
  segnatiDiRecente.set(imp, ora)
  return true
}

/**
 * Di chi è questo gettone, e cosa apre.
 *
 * Non scade e non si rinnova: la sola ragione per cui può sparire è che
 * qualcuno l'abbia revocato, e allora qui non c'è più.
 */
export async function trova(gettone?: string): Promise<{ id: string; utente: string; ambito: string } | null> {
  if (!gettone || !gettone.startsWith(PREFISSO)) return null
  const imp = impronta(gettone)
  let r: { id: string; utente: string; ambito: string } | undefined
  if (db) {
    r = db.prepare('SELECT id, utente, ambito FROM gettoni WHERE impronta = ?').get(imp) as typeof r
  } else {
    r = (await postgres.q('SELECT id, utente, ambito FROM myynd_gettoni WHERE impronta = $1', [imp])).rows[0] as typeof r
  }
  if (!r) return null
  if (daSegnare(imp)) {
    const ora = new Date().toISOString()
    try {
      if (db) db.prepare('UPDATE gettoni SET usato = ? WHERE impronta = ?').run(ora, imp)
      else await postgres.q('UPDATE myynd_gettoni SET usato = $1 WHERE impronta = $2', [ora, imp])
    } catch (e) {
      // segnare la data non è il lavoro: se il database singhiozza, la spinta
      // deve passare lo stesso
      console.error('myynd · non riesco a segnare l’ultimo uso di un gettone:', e instanceof Error ? e.message : e)
    }
  }
  return r
}

/** Da usare nelle prove: la mappa dell'ultimo uso, come se il processo fosse appena partito. */
export const perProva = {
  dimentica() { segnatiDiRecente.clear() }
}
