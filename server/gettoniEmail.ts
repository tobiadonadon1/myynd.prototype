// I gettoni che viaggiano dentro una mail: conferma dell'indirizzo, e password
// rimessa.
//
// **Del gettone non si tiene il gettone.** Solo la sua impronta sha256, per la
// stessa ragione per cui delle sessioni si tiene quella e delle password si
// tiene uno scrypt: chi legge questa tabella non deve poter entrare nel conto
// di nessuno. Un collegamento che rimette una password vale quanto la
// password, e sul database sta come vale una sessione — cioè non sta.
//
// **Valgono una volta sola, e poi scadono comunque.** Le due cose insieme, non
// una: quel collegamento resta per sempre nella casella di posta di qualcuno, e
// una casella di posta è il primo posto in cui guarda chi ha rubato un
// portatile. Ventiquattro ore per confermare un indirizzo — è un gesto che si
// può rimandare a domani — e un'ora per la password, che è un gesto che si fa
// mentre lo si chiede.
//
// La tabella la crea `conti.ts` (SQLite) o `postgres.schema()`: sta accanto
// alle sessioni perché dice la stessa cosa, di chi è una chiave.

import { createHash, randomBytes } from 'node:crypto'
import * as conti from './conti.ts'
import * as postgres from './postgres.ts'

export type Scopo = 'verifica' | 'reimposta'

/** Quanto vive ognuno dei due. Vedi il commento in cima per il perché. */
const DURA: Record<Scopo, number> = {
  verifica: 24 * 3_600_000,
  reimposta: 3_600_000
}

const db = conti.suDisco()

function impronta(gettone: string): string {
  return createHash('sha256').update(gettone).digest('hex')
}

/**
 * Trentadue byte a caso, in esadecimale, come una sessione.
 *
 * Finiscono in un indirizzo web, quindi niente base64: una `+` o una `/` in
 * mezzo a un collegamento sopravvive a un client di posta e non sopravvive
 * all'altro, e il modo in cui la cosa si presenta è «il link non funziona» per
 * una persona su dieci.
 */
export async function crea(utente: string, scopo: Scopo): Promise<string> {
  const gettone = randomBytes(32).toString('hex')
  const imp = impronta(gettone)
  const scade = new Date(Date.now() + DURA[scopo]).toISOString()
  if (db) {
    db.prepare('INSERT INTO gettoni_email (impronta, utente, scopo, scade) VALUES (?,?,?,?)')
      .run(imp, utente, scopo, scade)
  } else {
    await postgres.q('INSERT INTO myynd_gettoni_email (impronta, utente, scopo, scade) VALUES ($1,$2,$3,$4)',
      [imp, utente, scopo, scade])
  }
  return gettone
}

/**
 * Speso: di chi era, se valeva.
 *
 * Una scrittura sola, non un «guarda e poi segna». Fra le due ci starebbero due
 * richieste con lo stesso collegamento — due schede aperte, un client di posta
 * che visita i link per controllarli — e passerebbero tutte e due. `usato IS
 * NULL` dentro la `WHERE` fa decidere al database, che è l'unico posto dove
 * quella domanda ha una risposta sola.
 */
export async function consuma(gettone: string, scopo: Scopo): Promise<string | null> {
  if (!gettone) return null
  const imp = impronta(gettone)
  const ora = new Date().toISOString()
  if (db) {
    const r = db.prepare(
      'UPDATE gettoni_email SET usato = ? WHERE impronta = ? AND scopo = ? AND usato IS NULL AND scade > ? RETURNING utente'
    ).get(ora, imp, scopo, ora) as { utente: string } | undefined
    return r?.utente ?? null
  }
  const { rows } = await postgres.q(
    'UPDATE myynd_gettoni_email SET usato = $1 WHERE impronta = $2 AND scopo = $3 AND usato IS NULL AND scade > $1 RETURNING utente',
    [ora, imp, scopo])
  return (rows[0]?.utente as string | undefined) ?? null
}

// Quelli spenti li pota `conti.pota()`, all'avvio, insieme alle sessioni
// scadute: sta di là perché questo file importa quello, e chiamarlo dall'altro
// verso chiuderebbe un giro fra i due.
