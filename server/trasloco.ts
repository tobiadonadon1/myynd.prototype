// Portare il proprio Myynd da una macchina a un'altra.
//
// Serve perché la cosa più ovvia del mondo — «ho il mio Myynd qui, lo rivoglio
// là» — non aveva nessuna strada. Il codice si spinge su git; i dati no, e non
// devono: dentro `mente.db` ci sono la posta letta, i documenti, e in
// `config.json` le password delle caselle e i token di Google. Roba che in un
// repository non ci va nemmeno per sbaglio.
//
// L'alternativa era la riga di comando di chi ospita, che è una cosa che si
// può chiedere a chi sviluppa e non a chi usa. Quindi: **un file.** Si scarica
// da un Myynd e si carica in un altro, dalla schermata, senza sapere niente di
// niente.
//
// **Dentro c'è tutto, credenziali comprese**, e va detto forte a chi lo
// scarica: quel file apre la casella di posta di chi l'ha fatto. Non è un
// backup da tenere nei Download — è una cosa che si sposta e si butta.
//
// Cosa non entra nel pacco: le istantanee delle migrazioni. Sono copie vecchie
// dell'indice, servono a tornare indietro *su quella macchina*, e da sole
// pesano dieci volte quello che pesa la mente vera.

import { gzipSync, gunzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { cartella } from './config.ts'
import { OSPITATO } from './ospitato.ts'
import * as store from './store.ts'
import * as automazioni from './automazioni.ts'

/** La forma del pacco. Cambia solo se cambia cosa c'è dentro. */
const VERSIONE = 1

type Pacco = {
  versione: number
  quando: string
  /** La configurazione: preferenze e credenziali delle fonti. */
  config: unknown
  /** L'indice, com'è sul disco, in base64. */
  mente: string
  /** Le automazioni scritte da questa persona. */
  automazioni: Record<string, string>
}

/**
 * Il pacco da portarsi via.
 *
 * Il checkpoint del WAL prima di leggere non è un dettaglio: SQLite tiene le
 * scritture recenti in un file accanto, e copiare il solo `mente.db` senza
 * averle riversate dentro vuol dire portarsi via una mente **ferma a
 * settimane fa**, senza che niente lo dica. Il file si apre benissimo: gli
 * mancano solo le ultime cose.
 */
export function esporta(): Buffer {
  const dove = cartella()
  store.riversaIlWal()

  const mente = join(dove, 'mente.db')
  const automazioni: Record<string, string> = {}
  const cartellaAuto = join(dove, 'automazioni')
  if (existsSync(cartellaAuto)) {
    for (const f of readdirSync(cartellaAuto).filter(n => n.endsWith('.json'))) {
      automazioni[f] = readFileSync(join(cartellaAuto, f), 'utf8')
    }
  }

  const pacco: Pacco = {
    versione: VERSIONE,
    quando: new Date().toISOString(),
    config: existsSync(join(dove, 'config.json'))
      ? JSON.parse(readFileSync(join(dove, 'config.json'), 'utf8'))
      : {},
    mente: existsSync(mente) ? readFileSync(mente).toString('base64') : '',
    automazioni
  }
  return gzipSync(Buffer.from(JSON.stringify(pacco)), { level: 9 })
}

export type Esito = { documenti: number; automazioni: number }

/**
 * Il pacco, scaricato dentro questo conto.
 *
 * **Sostituisce, non fonde**, e non è pigrizia: fondere due indici vorrebbe
 * dire decidere cosa vince per ogni documento, ogni compito e ogni convinzione
 * che esiste in tutt'e due — e sbagliare una di quelle decisioni è perdere
 * qualcosa senza accorgersene. Sostituire è una cosa sola, che si capisce
 * prima di premere: quello che c'era qui non c'è più.
 *
 * L'account resta quello di *qui*: email e password sono di questo conto, e il
 * pacco non le porta con sé. Altrimenti importare vorrebbe dire cambiarsi
 * l'accesso sotto i piedi, e chi lo fa da un telefono resta fuori.
 */
/**
 * Quanto può diventare un pacco una volta aperto. La base64 di un indice non si
 * comprime quasi, quindi un pacco legittimo è poco più grande del file che
 * arriva; un file costruito apposta per gonfiarsi, invece, senza questo tetto
 * riempiva la memoria del processo — cioè di tutti.
 */
const TETTO_APERTO = 400 * 1024 * 1024

export function importa(dati: Buffer): Esito {
  let pacco: Pacco
  try {
    pacco = JSON.parse(gunzipSync(dati, { maxOutputLength: TETTO_APERTO }).toString('utf8')) as Pacco
  } catch {
    throw new Error('Questo file non è un Myynd da spostare.')
  }
  if (pacco.versione !== VERSIONE || typeof pacco.mente !== 'string') {
    throw new Error('Questo file viene da una versione che non so leggere.')
  }

  const dove = cartella()
  if (!existsSync(dove)) mkdirSync(dove, { recursive: true, mode: 0o700 })

  /*
   * L'indice si chiude prima di scriverci sopra.
   *
   * È aperto in questo processo, con il suo WAL accanto: sovrascrivere il file
   * sotto a un handle vivo lascia SQLite convinto di sapere cosa c'è dentro, e
   * quello che segue non è un errore — è un database che risponde cose che non
   * ci sono più.
   */
  // Prima si guarda cosa è arrivato, e solo dopo si tocca quello che c'è.
  const mente = join(dove, 'mente.db')
  const inArrivo = join(dove, 'mente.in-arrivo.db')
  if (pacco.mente) {
    writeFileSync(inArrivo, Buffer.from(pacco.mente, 'base64'), { mode: 0o600 })
    try {
      store.controlla(inArrivo)
    } catch (e) {
      rmSync(inArrivo, { force: true })
      throw e
    } finally {
      // aprirlo per controllarlo gli mette accanto i file di lavoro di SQLite:
      // vuoti, e con un nome che dopo il rinomino non apparterrebbe più a niente
      for (const coda of ["-wal", "-shm"]) rmSync(`${inArrivo}${coda}`, { force: true })
    }
  }

  // solo l'indice di questo conto: chiuderli tutti, com'era prima, faceva
  // cadere le richieste in volo di tutti gli altri
  store.chiudiIndice(dove)
  for (const coda of ['-wal', '-shm']) {
    const f = join(dove, `mente.db${coda}`)
    if (existsSync(f)) rmSync(f, { force: true })
  }
  if (pacco.mente) {
    // quello che c'era si mette da parte invece di sparire: «sostituisce»
    // deve voler dire che si può tornare indietro, se il pacco era quello sbagliato
    if (existsSync(mente)) {
      const prima = join(dove, 'istantanee')
      if (!existsSync(prima)) mkdirSync(prima, { recursive: true, mode: 0o700 })
      renameSync(mente, join(prima, `mente-prima-del-trasloco-${new Date().toISOString().replace(/[:.]/g, '-')}.db`))
    }
    renameSync(inArrivo, mente)
  }

  // Non tutto quello che c'è nel pacco vale qui. `account` era il conto di là
  // — qui si entra con il proprio — e `desktop` sono cartelle di un altro
  // disco: su un server sarebbero cartelle del server.
  const config: Record<string, unknown> =
    typeof pacco.config === 'object' && pacco.config ? { ...(pacco.config as Record<string, unknown>) } : {}
  delete config.account
  if (OSPITATO) delete config.desktop
  writeFileSync(join(dove, 'config.json'), JSON.stringify(config, null, 2), { mode: 0o600 })

  const auto = join(dove, 'automazioni')
  if (!existsSync(auto)) mkdirSync(auto, { recursive: true, mode: 0o700 })
  let quante = 0
  for (const [nome, testo] of Object.entries(pacco.automazioni ?? {})) {
    // solo nomi di file, mai percorsi: un `../../` qui dentro scriverebbe
    // fuori dalla cartella di chi sta importando
    if (!/^[\w.-]+\.json$/.test(nome)) continue
    writeFileSync(join(auto, nome), testo, { mode: 0o600 })
    quante++
  }

  /*
   * Le ricette si rileggono dal disco.
   *
   * `ricette()` le tiene in memoria, e quella copia è di prima dell'importazione:
   * senza questa riga il pacco arriva, i file ci sono, e la schermata continua a
   * mostrare quelle di un attimo fa — comprese zero, se il conto era vuoto.
   */
  automazioni.scordaLeRicette()
  return { documenti: store.conteggi().totale, automazioni: automazioni.elenco().length }
}
