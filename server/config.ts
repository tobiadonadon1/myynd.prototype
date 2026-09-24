// Configurazione locale, in ~/.myynd/config.json con permessi 0600.
//
// Le credenziali le scrivi tu nella tua app, sul tuo computer: restano qui e
// non escono mai da questa macchina se non verso il servizio a cui servono.
// Non finiscono mai nelle risposte dell'API né nei log.

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, copyFileSync, renameSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as chi from './chi.ts'
import * as conti from './conti.ts'
import * as postgres from './postgres.ts'

/**
 * I modelli fra cui si può scegliere, dal più economico al più capace.
 *
 * Sonnet 5 è il predefinito perché sul lavoro che fa Myynd — rispondere su
 * documenti che ha già in mano, non ragionare nel vuoto — la differenza con
 * Opus non si vede, e costa poco più della metà.
 */
export const MODELLI = [
  { id: 'claude-haiku-4-5', nome: 'Haiku 4.5', nota: 'Il più rapido e il più economico. Va bene finché le domande sono semplici.' },
  { id: 'claude-sonnet-5', nome: 'Sonnet 5', nota: 'Il predefinito: quasi la qualità di Opus sul materiale che hai, a meno della metà.' },
  { id: 'claude-opus-5', nome: 'Opus 5', nota: 'Il più capace. Si sente sulle domande che intrecciano più documenti, e costa cinque volte tanto.' }
] as const

/** Un nome di modello che conosciamo, o niente. */
function modelloValido(m: string | undefined): string | null {
  return m && MODELLI.some(x => x.id === m) ? m : null
}

/**
 * Quello scelto nelle preferenze per il lavoro di frontiera, o il predefinito.
 *
 * È il modello «principale»: quello della chat, delle bozze e del punto. I
 * livelli sotto hanno il loro, vedi `modelloDelLivello`.
 */
export function modello(c: Config = leggi()): string {
  return modelloValido(c.modelli?.frontiera) ?? modelloValido(c.modello) ?? 'claude-sonnet-5'
}

/**
 * I tre livelli di lavoro, e cosa ci finisce dentro.
 *
 * Rispecchiano `LAVORI` in modello.ts: `casa` sono le manovre interne che
 * nessuno legge, `media` le letture di ogni giorno che restano dentro l'app,
 * `frontiera` quello che lei legge e firma. La persona sceglie un modello per
 * ciascuno nelle preferenze: è il modo di dire «per i titoli spendi poco, per
 * le bozze spendi quello che serve» senza dover conoscere la tabella.
 */
export type Livello = 'casa' | 'media' | 'frontiera'
export const LIVELLI: readonly Livello[] = ['casa', 'media', 'frontiera']

/** Il modello economico della famiglia: il predefinito delle manovre interne. */
export const ECONOMICO = 'claude-haiku-4-5'

/**
 * Il modello per un livello.
 *
 * Senza una scelta: le manovre interne vanno sull'economico, le letture di
 * ogni giorno seguono la frontiera — che è quello che è sempre successo, e
 * `livelli.test.ts` lo pretende — e la frontiera è `modello()`.
 */
export function modelloDelLivello(livello: Livello, c: Config = leggi()): string {
  const scelto = modelloValido(c.modelli?.[livello])
  if (scelto) return scelto
  return livello === 'casa' ? ECONOMICO : modello(c)
}

/** Tutti e tre insieme, come li mostra la schermata. */
export function modelliPerLivello(c: Config = leggi()): Record<Livello, string> {
  return { casa: modelloDelLivello('casa', c), media: modelloDelLivello('media', c), frontiera: modelloDelLivello('frontiera', c) }
}

/**
 * Il tono e l'autonomia, con i nomi che il ragionamento conosce davvero.
 *
 * Per un pezzo l'interfaccia ne scriveva altri — 'cordiale', 'osservare',
 * 'agire' — e `claude.ts`, che cerca 'caldo', 'chiedere' e 'fare', non trovava
 * niente: la riga spariva dal prompt senza un errore, senza un log, senza
 * niente. Due scelte su tre non facevano nulla e non c'era modo di accorgersene.
 *
 * L'interfaccia adesso scrive i nomi giusti, ma i config.json già scritti no:
 * la traduzione sta qui, in un posto solo, e vale per chiunque abbia usato
 * l'app prima di oggi. Non si riscrive il file — un valore vecchio che si legge
 * bene è meno rischioso di una migrazione che gira a ogni avvio.
 */
const TONI_VECCHI: Record<string, string> = { cordiale: 'caldo' }
const AUTONOMIE_VECCHIE: Record<string, string> = { osservare: 'chiedere', agire: 'fare' }

/** I nomi che `claude.ts` sa interpretare. Fuori da qui non esiste altro. */
export const TONI_VALIDI = ['diretto', 'caldo', 'formale']
export const AUTONOMIE_VALIDE = ['chiedere', 'preparare', 'fare']
/**
 * Chiaro, scuro, o come il sistema.
 *
 * Sta qui e non solo nel browser perche e una preferenza come la lingua: chi
 * apre Myynd da un altro computer se la ritrova com'era. Il browser ne tiene
 * comunque una copia, ma solo per non lampeggiare di panna al primo disegno.
 */
export const TEMI_VALIDI = ['sistema', 'chiaro', 'scuro']

export function tono(c: Config = leggi()): string {
  const t = c.tono ?? 'diretto'
  const vero = TONI_VECCHI[t] ?? t
  return TONI_VALIDI.includes(vero) ? vero : 'diretto'
}

export function autonomia(c: Config = leggi()): string {
  const a = c.autonomia ?? 'preparare'
  const vera = AUTONOMIE_VECCHIE[a] ?? a
  return AUTONOMIE_VALIDE.includes(vera) ? vera : 'preparare'
}

/**
 * La lingua in cui il modello deve scrivere.
 *
 * Sta qui e non dentro un modulo solo perché la chiedono in quattro: il feed,
 * il timone, le domande e la memoria. Ognuno aveva «in italiano» scritto a mano
 * dentro il suo prompt — e il risultato era un'interfaccia in inglese piena di
 * roba generata in italiano, che è esattamente quello che non deve succedere.
 */
/**
 * In che lingua è questa installazione. Una funzione sola, per tutti.
 *
 * Undici punti nel server scrivevano da soli `leggi().lingua === 'en'`, o il
 * suo gemello cattivo `!== 'en'`, e tutti e undici finivano nello stesso
 * posto: **su un conto nuovo `lingua` non c'è**, quindi non è `'en'`, quindi
 * italiano. Il risultato è la cosa che si vede peggio di tutte — un'interfaccia
 * inglese con dentro roba italiana: le automazioni di serie, le voci del feed,
 * le domande, il ritratto.
 *
 * Non era un difetto in undici posti: era lo stesso difetto scritto undici
 * volte, perché la domanda «che lingua parliamo» non aveva un posto dove
 * stare. Adesso ce l'ha, e la risposta di partenza è l'inglese: l'italiano si
 * sceglie, non si eredita dal silenzio.
 */
export function lingua(c: Config = leggi()): 'it' | 'en' {
  return c.lingua === 'it' ? 'it' : 'en'
}

export function nellaLingua(): string {
  /*
   * L'italiano solo se è stato scelto.
   *
   * Era il contrario, e produceva la cosa peggiore di tutte: metà e metà.
   * L'interfaccia seguiva la lingua del browser e finiva in inglese, mentre
   * tutto quello che scrive il modello — la rassegna, le righe in lista, le
   * domande — nasceva in italiano perché nessuno aveva ancora scelto niente.
   * Due lingue nella stessa schermata, e nessuna delle due scelta da qualcuno.
   */
  return lingua() === 'it' ? 'italiano' : 'inglese'
}

/**
 * Dove vive tutto: la configurazione, l'indice, le automazioni tue.
 *
 * Era una costante e adesso è una funzione, ed è il cardine su cui gira tutta
 * la faccenda delle più persone. Ottantuno punti nel codice chiamano `leggi()`
 * senza chiedersi di chi sia quella configurazione: se la cartella la decide
 * questa funzione, guardando chi è dentro la richiesta in corso, quegli
 * ottantuno punti continuano a funzionare **senza toccarne uno** e di colpo
 * lavorano ognuno sui dati del proprio utente.
 *
 * Su un computer di casa non cambia niente: nessuno apre un contesto, `chi`
 * torna null, e la cartella è `~/.myynd` come è sempre stata.
 *
 * Su un server ogni persona ha la sua sotto `utenti/<id>`, e non c'è nessun
 * percorso che porti dall'una all'altra: non è una convenzione di nomi, è che
 * il pezzo di percorso lo mette questa funzione e nient'altro.
 */
export const RADICE = (process.env.MYYND_DATI ?? '').trim() || join(homedir(), '.myynd')

export function cartella(): string {
  const u = chi.adesso()
  if (!u) return RADICE
  return cartellaDi(u)
}

/**
 * La cartella di uno preciso, anche fuori da una richiesta.
 *
 * La usano i giri di sfondo, che passano da tutti gli utenti uno per uno e non
 * stanno dentro nessuna richiesta.
 */
export function cartellaDi(utente: string): string {
  // quasi sempre `utenti/<id>`; l'eccezione è chi c'era prima che le persone
  // potessero essere più di una, e ha i suoi file nella radice
  return conti.cartellaDi(utente) ?? join(RADICE, 'utenti', utente)
}

/**
 * Il vecchio nome, per chi lo usava come costante.
 *
 * Non è un alias di comodo: `DIR` compariva in tre posti che lo leggevano al
 * caricamento del modulo — e un valore letto una volta sola all'avvio è
 * esattamente quello che non può funzionare quando le persone sono più di una.
 * Quei tre sono diventati funzioni; questa resta per non lasciare in giro un
 * nome che significa una cosa diversa da prima.
 */
export function DIR(): string { return cartella() }
const file = () => join(cartella(), 'config.json')

// ——— su Postgres: in memoria, e il database la tiene ———

/*
 * Perché una copia in memoria e non una lettura dal database.
 *
 * `leggi()` è sincrona e la chiamano novantasette punti in venticinque file,
 * nessuno dei quali potrebbe aspettare. Postgres è asincrono. L'unico modo di
 * tenere insieme le due cose è che la configurazione di ogni persona stia qui,
 * già letta: si carica all'avvio, si aggiorna a ogni scrittura, e ogni tanto si
 * rilegge per vedere quello che un'altra replica ha scritto nel frattempo.
 *
 * La scrittura va nell'altro verso: `scrivi()` aggiorna la copia e torna
 * subito, e il database si allinea un attimo dopo. Dieci `aggiorna()` di fila
 * — che è quello che fa una lettura della posta — diventano una scrittura
 * sola. Se il database non risponde lo si dice nel registro e si riprova: la
 * copia in memoria resta quella giusta, e a `scaricato()` — che `index.ts`
 * chiama prima di spegnersi — non si va via finché non è tutto sul database.
 *
 * Il file `config.json` alla radice, quello senza contesto, resta un file: è
 * il caso di chi c'era prima che le persone fossero più di una, e su un
 * server con Postgres non esiste.
 */
/*
 * Quello che si tiene per ognuno, e perché non basta la configurazione.
 *
 * `versione` è la versione della riga sul database da cui questa discende, e
 * `base` è com'era quella riga. Senza le due, due repliche si mangiavano a
 * vicenda in silenzio: A scriveva la posta di Ugo, B scriveva il nome di Vera
 * un secondo dopo, e la scrittura di B — che portava con sé *tutta* la
 * configurazione di Vera com'era prima — non poteva sapere di essere partita
 * da una copia vecchia. Nessun errore, nessun log: la password della casella
 * appena salvata semplicemente non c'era più.
 *
 * Con la versione, chi parte da una copia vecchia perde la scrittura invece di
 * vincerla; con `base` si sa *cosa abbiamo cambiato noi*, e allora quando si
 * perde si può rimettere solo quello sopra la riga nuova, invece di buttare la
 * modifica di qualcuno.
 */
type Tenuta = {
  config: Config
  versione: number
  base: Config
  /** L'`aggiornato` della riga che abbiamo visto: serve solo a riconoscere un cambio. */
  aggiornato: string
}
const inMemoria = new Map<string, Tenuta>()
const sporchi = new Set<string>()
const scrivendo = new Set<string>()
const basiLette = new WeakMap<Config, { cartella: string; config: Config }>()
function ricorda(c: Config): Config {
  basiLette.set(c, { cartella: cartella(), config: structuredClone(c) })
  return c
}
let scaricoInCorso: Promise<void> | null = null
let scaricoProgrammato: ReturnType<typeof setTimeout> | null = null

function tenuta(utente: string): Tenuta {
  let t = inMemoria.get(utente)
  if (!t) {
    t = { config: {}, versione: 0, base: {}, aggiornato: '' }
    inMemoria.set(utente, t)
  }
  return t
}

function segnaSporco(utente: string) {
  sporchi.add(utente)
  if (!scaricoProgrammato) {
    scaricoProgrammato = setTimeout(() => { scaricoProgrammato = null; void scarica() }, 50)
  }
}

/**
 * Le tre configurazioni messe insieme: quella da cui siamo partiti, la nostra,
 * e quella che nel frattempo ha scritto un'altra replica.
 *
 * Si fondono anche i campi di una sezione: cambiare il modello non deve
 * ripristinare la vecchia chiave che un'altra scrittura ha appena ruotato.
 * Quando cambia l'identità del servizio o dell'account, invece, quella
 * sezione si sostituisce: una credenziale non si eredita da un altro server.
 *
 * Quello che noi non abbiamo toccato lo prende da loro. Quello che abbiamo
 * toccato noi vince, perché è la modifica che una persona ha appena fatto e
 * che sta guardando sullo schermo.
 */
function fondi(base: Config, nostro: Config, loro: Config): Config {
  const oggetto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const unisci = (b: unknown, n: unknown, l: unknown, percorso = ''): unknown => {
    if (JSON.stringify(b) === JSON.stringify(n)) return structuredClone(l)
    if (l === undefined && oggetto(b) && oggetto(n) && ['claude', 'compatibile'].includes(percorso)) {
      // Changing an old model/name snapshot is not permission to restore a
      // credential explicitly disconnected after that snapshot was read.
      const cambiata = [...CAMPI_SEGRETI].some(k => segretoPresente(n[k]) && n[k] !== b[k])
      if (!cambiata) return undefined
    }
    if (oggetto(n) && oggetto(l) && (b === undefined || oggetto(b))) {
      const fuso = { ...l }
      const prima = oggetto(b) ? b : {}
      const identita = percorso === 'compatibile' ? ['url'] : percorso === 'posta' ? ['host', 'utente'] : ['clientId', 'tenant']
      if (identita.some(k => n[k] !== undefined && n[k] !== prima[k] && n[k] !== l[k])) return structuredClone(n)
      for (const k of new Set([...Object.keys(prima), ...Object.keys(n)])) {
        const v = unisci(prima[k], n[k], l[k], percorso ? `${percorso}.${k}` : k)
        if (v === undefined) delete fuso[k]
        else fuso[k] = v
      }
      return fuso
    }
    return structuredClone(n)
  }
  return unisci(base, nostro, loro) as Config
}

async function scarica(): Promise<void> {
  if (scaricoInCorso) return scaricoInCorso
  scaricoInCorso = (async () => {
    while (sporchi.size) {
      const utente = sporchi.values().next().value as string
      sporchi.delete(utente)
      const t = inMemoria.get(utente)
      if (!t) continue
      const quando = new Date().toISOString()
      const nuova = t.versione + 1
      const inviata = structuredClone(t.config)
      const cifrato = postgres.cifra(JSON.stringify(inviata))
      scrivendo.add(utente)
      try {
        /*
         * Si scrive **solo se la riga è ancora quella da cui siamo partiti.**
         *
         * L'`ON CONFLICT DO UPDATE` di prima vinceva sempre, ed è esattamente
         * il modo in cui una replica cancellava il lavoro dell'altra. Qui la
         * `WHERE` sulla versione fa decidere al database, che è l'unico posto
         * da cui si vede l'ordine vero delle due scritture.
         */
        const { rows } = await postgres.q(
          'UPDATE myynd_configurazioni SET cifrato = $2, aggiornato = $3, versione = $4 ' +
          'WHERE utente = $1 AND versione = $5 RETURNING versione',
          [utente, cifrato, quando, nuova, t.versione])
        let vinto = rows.length > 0
        if (!vinto && t.versione === 0) {
          // la riga può non esserci proprio: è la prima volta per questa persona
          const nato = await postgres.q(
            'INSERT INTO myynd_configurazioni (utente, cifrato, aggiornato, versione) VALUES ($1,$2,$3,$4) ' +
            'ON CONFLICT (utente) DO NOTHING RETURNING versione',
            [utente, cifrato, quando, nuova])
          vinto = nato.rows.length > 0
        }
        if (vinto) {
          t.versione = nuova
          t.aggiornato = quando
          t.base = inviata
          continue
        }
        /*
         * Persa. Si rilegge quello che c'è adesso e ci si rimette sopra solo
         * quello che abbiamo cambiato noi — poi si riprova. Buttare la nostra
         * scrittura sarebbe la stessa perdita silenziosa vista dall'altro lato.
         */
        const { rows: viste } = await postgres.q(
          'SELECT cifrato, aggiornato, versione FROM myynd_configurazioni WHERE utente = $1', [utente])
        const r = viste[0] as { cifrato: string; aggiornato: string; versione: number } | undefined
        if (!r) { sporchi.add(utente); continue }
        const loro = JSON.parse(postgres.decifra(r.cifrato)) as Config
        // `t.config` e non una copia presa prima dell'await: fra le due c'è
        // stato un giro di eventi, e in mezzo può esserci una `scrivi()`
        t.config = fondi(t.base, t.config, loro)
        t.base = loro
        t.versione = Number(r.versione)
        t.aggiornato = r.aggiornato
        sporchi.add(utente)
      } catch (e) {
        console.error(
          `myynd · la configurazione di ${utente} non è arrivata su Postgres ` +
          `(${e instanceof Error ? e.message : e}): riprovo fra cinque secondi`)
        sporchi.add(utente)
        setTimeout(() => void scarica(), 5000).unref()
        break
      } finally {
        scrivendo.delete(utente)
      }
    }
  })().finally(() => { scaricoInCorso = null })
  return scaricoInCorso
}

/**
 * Tutto quello che è in memoria e non ancora sul database, scritto adesso.
 *
 * Con un limite, si insiste: `scarica()` al primo errore si ferma e si
 * riprogramma fra cinque secondi, che va bene a processo vivo e non va bene
 * mentre ci si sta spegnendo — la promessa tornava, si usciva, e la password
 * di posta salvata durante un singhiozzo di Supabase restava in memoria di un
 * processo che non c'era più. Qui si riprova finché c'è tempo.
 */
export async function scaricato(limite = 0): Promise<void> {
  if (!postgres.ATTIVO) return
  if (scaricoProgrammato) { clearTimeout(scaricoProgrammato); scaricoProgrammato = null }
  const entro = Date.now() + limite
  await scarica()
  while (sporchi.size && Date.now() < entro) {
    await new Promise(r => setTimeout(r, 500))
    if (scaricoProgrammato) { clearTimeout(scaricoProgrammato); scaricoProgrammato = null }
    await scarica()
  }
}

type Riga = { utente: string; cifrato: string; aggiornato: string; versione: number }

function accogli(r: Riga) {
  /*
   * Quello che è in memoria e non è ancora partito è più nuovo di qualunque
   * cosa stia sul database: non lo si sovrascrive — e nemmeno si aggiorna la
   * versione. Alzarla qui sarebbe la seconda metà del guasto: la nostra
   * scrittura, ancora in coda con un blob vecchio, si troverebbe la versione
   * giusta in mano e vincerebbe sopra la modifica appena letta. Lasciandola
   * com'è, quella scrittura perde e passa dalla fusione, che è il posto in cui
   * quel conflitto si risolve senza perdere niente.
   */
  if (sporchi.has(r.utente) || scrivendo.has(r.utente)) return
  const config = JSON.parse(postgres.decifra(r.cifrato)) as Config
  inMemoria.set(r.utente, {
    config,
    base: structuredClone(config),
    versione: Number(r.versione),
    aggiornato: r.aggiornato
  })
}

async function caricaUno(utente: string): Promise<void> {
  const { rows } = await postgres.q(
    'SELECT utente, cifrato, aggiornato, versione FROM myynd_configurazioni WHERE utente = $1', [utente])
  if (rows[0]) accogli(rows[0] as Riga)
}

/**
 * Cosa è cambiato sul database da quando l'abbiamo guardato.
 *
 * Prima c'era una data sola per tutti — «dammi tutto quello che è più recente
 * di questa» — e quella data la alzavano anche le *nostre* scritture. Bastava
 * che questa replica scrivesse la configurazione di Vera perché la scrittura
 * che un'altra replica aveva fatto un istante prima su quella di Ugo restasse
 * indietro alla data e non venisse mai letta. Non per un giro: per sempre.
 *
 * Adesso si chiede l'elenco delle versioni — due colonne, una riga per
 * persona — e si va a prendere per intero solo quello che non combacia con
 * quello che abbiamo. Nessuna data da confrontare, quindi nessun orologio di
 * due macchine diverse da mettere d'accordo.
 */
async function caricaLeNuove(): Promise<void> {
  const { rows } = await postgres.q('SELECT utente, aggiornato, versione FROM myynd_configurazioni')
  const cambiati = (rows as { utente: string; aggiornato: string; versione: number }[]).filter(r => {
    const t = inMemoria.get(r.utente)
    return !t || t.versione !== Number(r.versione) || t.aggiornato !== r.aggiornato
  })
  for (const r of cambiati) await caricaUno(r.utente)
}

/**
 * Prima di tutto il resto, dopo `conti.avvia()`.
 *
 * Senza la chiave non si parte: la configurazione contiene la password della
 * casella e i token delle fonti, e scriverli in chiaro su un database
 * ospitato perché una variabile mancava sarebbe la cosa peggiore che questo
 * file possa fare. Meglio un server che non si accende e lo dice.
 */
export async function avvia(): Promise<void> {
  if (!postgres.ATTIVO) return
  if (!postgres.chiavePronta()) {
    throw new Error(
      'MYYND_POSTGRES è impostata ma MYYND_CHIAVE no, o è più corta di sedici caratteri. ' +
      'Serve a cifrare le credenziali prima di scriverle sul database: scegline una lunga e a caso.')
  }
  await caricaLeNuove()
  await ruotaLaChiave()
  conti.quandoArrivaUnUtente(id => {
    caricaUno(id).catch(e => console.error(`myynd · non riesco a leggere la configurazione di ${id}:`, e instanceof Error ? e.message : e))
  })
  setInterval(() => {
    caricaLeNuove().catch(e => console.error('myynd · non riesco a rileggere le configurazioni:', e instanceof Error ? e.message : e))
  }, 5 * 60_000).unref()
}

/**
 * La chiave si può cambiare, e il cambio finisce da solo.
 *
 * `MYYND_CHIAVE` cifra ogni credenziale sul database, e il README diceva da
 * sempre «non cambiarla»: una promessa che non si può mantenere, perché una
 * chiave si può scoprire, si può essere incollata nel posto sbagliato, o
 * semplicemente cambia chi ospita. Senza una strada, l'unica risposta era
 * «ricollegate tutte le fonti, tutti quanti».
 *
 * Con `MYYND_CHIAVE_VECCHIA` la strada c'è: si passa su tutte le righe una
 * volta sola, all'avvio, e quelle che si aprono con la vecchia si riscrivono
 * con la nuova. Passa dalla scrittura normale — quindi anche qui la versione
 * decide, e una riscrittura non può passare sopra a un cambio fatto da
 * un'altra replica un istante prima.
 *
 * Si dice quante ne restano mentre si va, e si dice quando è finita: il
 * momento in cui la variabile vecchia si può togliere dev'essere un fatto che
 * qualcuno ha letto, non una speranza.
 */
export async function ruotaLaChiave(): Promise<{ riscritte: number; giaAPosto: number; illeggibili: number }> {
  const esito = { riscritte: 0, giaAPosto: 0, illeggibili: 0 }
  if (!postgres.ATTIVO || !postgres.cambioDiChiaveInCorso()) return esito

  const { rows } = await postgres.q('SELECT utente FROM myynd_configurazioni')
  const quanti = rows.length
  console.log(`myynd · MYYND_CHIAVE_VECCHIA c’è: guardo ${quanti} configurazion${quanti === 1 ? 'e' : 'i'} e riscrivo quelle ancora sulla chiave di prima.`)

  for (const [i, riga] of rows.entries()) {
    const utente = String(riga.utente)
    try {
      const { rows: r } = await postgres.q(
        'SELECT utente, cifrato, aggiornato, versione FROM myynd_configurazioni WHERE utente = $1', [utente])
      if (!r[0]) continue
      const { conLaVecchia } = postgres.apriCifrato(String(r[0].cifrato))
      if (!conLaVecchia) { esito.giaAPosto++; continue }
      accogli(r[0] as Riga)
      // rimarcata sporca senza cambiare niente: `scarica()` la riscrive, e la
      // riscrive cifrata con la chiave di adesso
      segnaSporco(utente)
      await scaricato(30_000)
      esito.riscritte++
    } catch (e) {
      /*
       * Non si apre con nessuna delle due. Non si tocca — riscriverla sarebbe
       * cancellare le credenziali di qualcuno — e si dice di chi è, perché la
       * risposta è che quella persona deve ricollegare le sue fonti.
       */
      esito.illeggibili++
      console.error(`myynd · la configurazione di ${utente} non si apre con nessuna delle due chiavi:`, e instanceof Error ? e.message : e)
    }
    if (quanti > 20 && (i + 1) % 20 === 0) console.log(`myynd · rotazione della chiave: ${i + 1} di ${quanti}.`)
  }

  if (esito.illeggibili) {
    console.error(
      `myynd · rotazione finita a metà: ${esito.riscritte} riscritte, ${esito.giaAPosto} già a posto, ` +
      `${esito.illeggibili} illeggibili. **Non togliere MYYND_CHIAVE_VECCHIA**: quelle righe sono cifrate con una terza chiave.`)
  } else {
    console.log(
      `myynd · rotazione finita: ${esito.riscritte} riscritte, ${esito.giaAPosto} erano già sulla chiave nuova. ` +
      'Adesso MYYND_CHIAVE_VECCHIA si può togliere.')
  }
  return esito
}

/**
 * Il conto se n'è andato: la sua configurazione non deve restare.
 *
 * Anche dalla memoria, e anche da `sporchi`: una scrittura in coda che partisse
 * dopo la cancellazione ricreerebbe la riga di una persona che non esiste più
 * — con dentro le sue credenziali.
 */
export async function cancella(utente: string): Promise<void> {
  sporchi.delete(utente)
  inMemoria.delete(utente)
  giaMessiDaParte.delete(join(cartellaDi(utente), 'config.json'))
  if (postgres.ATTIVO) await postgres.q('DELETE FROM myynd_configurazioni WHERE utente = $1', [utente])
}

/** Da usare nei test. */
export const perProva = {
  /** Come se il processo fosse appena ripartito: la memoria vuota, il database intatto. */
  dimentica() {
    inMemoria.clear()
    sporchi.clear()
  }
}

export type ConfigPosta = {
  host: string
  porta: number
  utente: string
  password: string
  cartelle?: string[]
  giorni?: number
  /**
   * L'UIDVALIDITY di ogni cartella all'ultima lettura.
   *
   * Finché non cambia, gli uid già nell'indice sono gli stessi messaggi, e non
   * si riscaricano. Se cambia — il server ha rinumerato la cartella — si
   * rilegge tutto, perché gli uid vecchi non vogliono più dire niente.
   */
  validita?: Record<string, string>
  /**
   * Da dove esce la posta, quando esce.
   *
   * Assente vuol dire «deducilo»: quasi tutti i provider tengono lo stesso
   * nome con smtp al posto di imap, e per quelli che conosciamo c'è il
   * PRESET. Si scrive solo quando la deduzione sbaglia — e allora è
   * l'unica cosa che si può scrivere a mano invece di indovinare.
   */
  smtp?: { host: string; porta: number }
}

/**
 * Il desktop: le cartelle scelte, o tutto il Mac.
 *
 * Con `tutto` le `cartelle` sono quelle che `desktop.radiciTutto()` ha
 * deciso — la casa e iCloud Drive — e si scrivono lo stesso, così tutto
 * quello che legge `cartelle` (la vedetta, la scheda, il recinto degli
 * attrezzi) continua a funzionare senza sapere della differenza. `tutto`
 * cambia solo i tetti e le cartelle da saltare.
 */
export type ConfigDesktop = {
  cartelle: string[]
  estensioni?: string[]
  tutto?: boolean
  /**
   * Le cartelle le ha scelte una persona, a mano.
   *
   * Serve a una cosa sola, e non è un'impostazione: distinguere «ho deciso di
   * leggere solo queste tre» da «avevo collegato il computer quando collegare
   * il computer voleva dire tre cartelle». Le prime non si toccano; le
   * seconde diventano tutto il computer al primo avvio (vedi `daAggiornare`
   * in `connettori/desktop.ts`). Chi preme «Solo alcune cartelle» se la
   * trova scritta, e da lì in poi la sua scelta è sua.
   */
  scelte?: boolean
}
/**
 * Le Note di Apple: come Granola, un collegamento senza niente dentro.
 * Il file sta sempre nello stesso posto; resta scritto solo che c'è, e quante
 * note aveva l'ultima volta.
 */
export type ConfigNote = { note?: number }
export type ConfigNotion = { token: string }

/**
 * GitHub: un token incollato, in sola lettura.
 *
 * `repos` è un recinto, non una comodità: vuoto vuol dire «i miei trenta più
 * vivi», e un elenco `owner/nome` vuol dire quelli e basta — chi lo scrive sta
 * escludendo il resto, e va preso alla lettera. Il token è una credenziale come
 * le altre: non esce mai da `pubblica()`.
 */
export type ConfigGithub = { token: string; repos?: string[] }

/**
 * Granola: quante note, e — da quando si collega con l'account — le chiavi.
 *
 * Collegato dalla cache (`connettori/granola.ts`) non c'è niente dentro oltre
 * al numero: il file sta sempre nello stesso posto. Collegato con l'account
 * (`connettori/granolaMcp.ts`) c'è l'app che si è registrata da sola presso
 * Granola e il suo refresh. Stanno in cima e non in un oggetto dentro,
 * apposta: `refresh` e `clientSecret` sono fra i campi che `scrivi` non lascia
 * sparire da una scrittura qualunque, e lo guarda solo al primo livello.
 */
export type RegistrazioneMcp = { emittente: string; redirect: string; clientId: string; quando: number }

export type ConfigGranola = {
  /** Quante riunioni ha letto, per la scheda. */
  note?: number
  refresh?: string
  clientId?: string
  clientSecret?: string
  /** Come si presenta l'app al token endpoint, se Granola le ha dato un segreto. */
  metodo?: string
  /** Il token endpoint scoperto al collegamento: si rinnova lì. */
  gettoni?: string
  /** La risorsa per cui valgono i token (RFC 8707). */
  risorsa?: string
  /** Il server MCP. */
  mcp?: string
  /** Granola ha detto che il piano dà solo gli ultimi trenta giorni. */
  trentaGiorni?: boolean
}

/**
 * Le conversazioni con ChatGPT, Claude, Claude Code e Codex.
 *
 * `file` sono i `conversations.json` esportati — percorsi di *questo* disco,
 * scelti da chi collega — e `codice` dice se leggere anche le sessioni degli
 * agenti di codice: Claude Code in `~/.claude/projects` e Codex in
 * `~/.codex/sessions`, quelle che ci sono. Non c'è nessuna credenziale: i
 * file sono già suoi, e stanno dove li ha messi.
 */
export type ConfigConversazioni = { file: string[]; codice: boolean }

/**
 * X, letto dal database del motore che ci scrive per lei.
 *
 * `db` è il percorso dell'SQLite di `x-engine` su questo disco. Si apre in
 * sola lettura e non ci vuole nessuna credenziale: le credenziali di X le
 * tiene il motore, e Myynd non ne ha bisogno per leggere quello che ha fatto.
 */
export type ConfigX = { db: string }

/**
 * Il calendario, letto da un indirizzo invece che da un'API.
 *
 * `url` è l'indirizzo segreto in formato iCal della propria agenda. **È una
 * credenziale**: chi ce l'ha legge il calendario, senza password e senza
 * scadenza. Sta qui insieme alle altre e non esce mai da `pubblica()`.
 */
export type ConfigCalendario = { url: string; nome?: string; giorni?: number }
export type ConfigClaude = { apiKey: string }
/**
 * La chiave di TypeSafe, con cui Jev risponde alle domande piccole.
 *
 * **È una credenziale**, come quella di Claude, e come quella non esce mai da
 * `pubblica()`. Senza, Myynd fa quello che faceva prima: Jev affina, non regge.
 */
export type ConfigJev = { apiKey: string }

export type Account = { email: string; sale: string; hash: string }

export type Config = {
  account?: Account
  nome?: string
  ruolo?: string
  onboarding?: boolean
  posta?: ConfigPosta
  desktop?: ConfigDesktop
  notion?: ConfigNotion
  github?: ConfigGithub
  granola?: ConfigGranola
  /**
   * Le app che Myynd ha registrato da sola presso un server MCP (DCR), una per
   * emittente e indirizzo di ritorno: si riusano invece di registrarne una
   * nuova a ogni «Collega». Fuori da `granola` apposta, perché scollegare non
   * le butti: la registrazione non è un segreto (client pubblico, nessun
   * `client_secret` qui dentro) e non dà accesso a niente senza il consenso.
   */
  registrazioniMcp?: RegistrazioneMcp[]
  note?: ConfigNote
  /** L'ordine dei blocchi della prima pagina scelto da lui trascinandoli: id di progetto, «resto» per il blocco senza progetto. */
  ordineBlocchi?: string[]
  conversazioni?: ConfigConversazioni
  x?: ConfigX
  /**
   * Le fonti che si sono accese da sole, una volta: le conversazioni degli
   * agenti di codice e X, quando le loro cartelle ci sono. Chi le spegne
   * dalle Fonti non se le ritrova accese all'avvio dopo: il nome resta qui.
   */
  accesiDaSoli?: string[]
  calendario?: ConfigCalendario
  claude?: ConfigClaude
  jev?: ConfigJev
  tono?: string
  autonomia?: string
  /** Il modello con cui ragiona il lavoro di frontiera. Vuoto = quello predefinito. */
  modello?: string
  /** Un modello per livello di lavoro; quello che manca segue la regola di `modelloDelLivello`. */
  modelli?: Partial<Record<Livello, string>>
  /** In che lingua risponde: 'it' | 'en'. */
  lingua?: string
  /** L'ora del giorno dell'interfaccia: 'sistema' | 'chiaro' | 'scuro'. */
  tema?: 'sistema' | 'chiaro' | 'scuro'
  /**
   * Dove lasciare i file che scrive da sé: un nome fra quelli di
   * `mani.LUOGHI`. Manca = la cartella Myynd sulla Scrivania. Lo impara
   * dalle sue parole («save it to my Desktop»), non da una schermata.
   */
  consegne?: { luogo: 'myynd' | 'scrivania' | 'scaricati' | 'documenti' }
  /** Il fuso di chi usa (IANA, es. Europe/Rome): lo manda il browser. Senza, quello della macchina. */
  fuso?: string
  /** Dopo quante ore una voce chiusa sparisce dall'elenco. 0 = mai. */
  oreFatte?: number
  /** Il tetto di token al giorno per il lavoro di frontiera. Zero o assente: nessuno. */
  tetto?: number
  /**
   * Su cosa tenerla aggiornata, con le sue parole.
   *
   * È il gemello del `fuoco`, e non è la stessa cosa: il fuoco dice a Myynd
   * dove guardare *dentro* — nella posta, nei file — e questo dice cosa
   * cercare *fuori*, nei giornali. Uno riguarda il lavoro di oggi, l'altro
   * quello che vuole sapere del mondo, e mescolarli vorrebbe dire che chi si
   * concentra sui preventivi smette di ricevere notizie.
   *
   * Vuoto è una risposta buona, non un campo da riempire: vuol dire «dammi di
   * tutto», ed è quello che serve a chi non ha ancora idea di cosa vuole.
   */
  argomenti?: string
  /**
   * Gli argomenti li ha scritti Myynd, non lei.
   *
   * È il permesso di riscriverli, e vale finché non ci mette mano lei. Nel
   * momento in cui salva quel campo a mano diventa falso e non torna più vero
   * da solo: da lì in avanti quelle sono parole sue, e una cosa che riscrive
   * quello che hai scritto tu senza che tu l'abbia chiesto non è un aiuto —
   * è una cosa di cui non ti puoi fidare.
   */
  argomentiDaMe?: boolean
  /**
   * Il fuoco l'ha scritto Myynd, non lei.
   *
   * Stessa identica semantica di `argomentiDaMe`, sull'altro campo: vero vuol
   * dire «questa riga è mia e la posso tenere aggiornata», falso — o assente
   * con una riga già scritta — vuol dire che le parole sono sue e non si
   * toccano più. Salvare il fuoco a mano lo mette a falso, e da lì in avanti
   * quel campo non si riscrive da solo mai più.
   */
  fuocoDaMe?: boolean
  /**
   * Le undici automazioni che arrivano con il pacchetto: le vuole?
   *
   * Assente vuol dire no, ed è il verso giusto. Erano sempre accese per tutti:
   * chi si faceva un conto nuovo trovava undici cose che non aveva scritto, che
   * non aveva chiesto, e che parlano di fatture e preventivi di qualcun altro —
   * e la prima cosa che faceva era cancellarle una per una. Un prodotto che
   * comincia dandoti da buttare via undici righe comincia male.
   *
   * Restano disponibili: sono un buon punto di partenza per chi le vuole, e si
   * accendono da una riga sola nella schermata delle automazioni.
   */
  diSerie?: boolean
  /**
   * Quando ha messo in ordine da solo, l'ultima volta. Due date, non una.
   *
   * Sono due giri diversi con due ritmi diversi — gli argomenti seguono quello
   * che legge, la memoria segue quello che impara parlando — e un timestamp
   * solo per tutti e due vorrebbe dire che il primo che gira zittisce l'altro
   * fino al giorno dopo. Un difetto che non si vede: nessuno dei due si rompe,
   * uno dei due semplicemente non succede quasi mai.
   */
  imparato?: { argomenti?: string; memoria?: string; fuoco?: string }
  /** Il giro di presentazione della lista: fatto una volta, mai più. */
  giro?: boolean
  /**
   * Ragionare con l'abbonamento di chi usa Myynd, invece che a consumo.
   *
   * Assente vuol dire spento: manda il lavoro sul conto di una persona, e una
   * cosa così si chiede, non si fa e basta.
   */
  abbonamento?: { attivo?: boolean }
  /**
   * Con quale dei due si paga Claude: l'abbonamento che hai già, o la chiave a
   * consumo. Si sceglie, si cambia idea, e vale per tutto il lavoro.
   *
   * Assente si legge dal vecchio `abbonamento.attivo`, che era un
   * interruttore: acceso voleva dire l'abbonamento. Chi aggiorna non trova
   * niente cambiato sotto i piedi.
   */
  claudeCon?: 'abbonamento' | 'chiave'
  /**
   * Chi fa il lavoro grosso: le risposte, le bozze, il feed.
   *
   * Assente vuol dire Claude, ed è il verso giusto: Myynd è stato messo a
   * punto su Claude, e chi non sceglie niente deve trovarsi la qualità su cui
   * è stato costruito. `compatibile` manda quel lavoro al fornitore qui sotto
   * — e vale solo se il fornitore c'è davvero: una scelta senza un indirizzo
   * dietro torna a Claude senza dirlo due volte.
   */
  motore?: 'claude' | 'compatibile' | 'chatgpt' | 'openai'
  /** Consent to use the locally managed ChatGPT account; no OAuth tokens here. */
  chatgpt?: { attivo: boolean; email?: string; modelli?: Partial<Record<Livello, string>> }
  /**
   * OpenAI con una chiave, a consumo: l'altra strada della stessa scheda.
   *
   * L'account ChatGPT passa dal ponte in `chatgpt.ts`; la chiave passa da
   * `compatibile.ts` con l'indirizzo di OpenAI, ed è per questo che qui non
   * c'è un `url`: è sempre quello. La chiave si conserva come le altre.
   */
  openai?: { modello: string; chiave?: string; modelli?: Partial<Record<Livello, string>> }
  /**
   * Un fornitore che parla la lingua di OpenAI: OpenAI stessa, OpenRouter,
   * Groq, Mistral — o Ollama e LM Studio su questa macchina.
   *
   * `url` è la base, fino a `/v1` compreso. La `chiave` manca quando il
   * fornitore è in casa e non ne vuole una. `nome` è come lo chiama lei nelle
   * preferenze: «il mio Ollama», non un indirizzo.
   */
  compatibile?: { url: string; chiave?: string; modello: string; nome?: string }
  /** Saved provider keys, scoped by exact endpoint. Never returned by pubblica(). */
  credenzialiModelli?: Record<string, { chiave: string }>
  /**
   * Di che azienda è questa installazione.
   *
   * Serve a una cosa sola: scegliere quale cartella di automazioni le
   * appartiene. Non è un dato personale — è il nome di un cliente — e non
   * esce mai da qui se non per chiedere «quali automazioni per questa
   * licenza?», che è una domanda a cui si risponde senza sapere chi sia.
   */
  licenza?: string
  /**
   * Da dove arrivano le automazioni, se non solo dal pacchetto.
   *
   * `repo` è «proprietario/nome» su GitHub: dentro, una cartella `automazioni/`
   * con `_comuni` e una cartella per licenza. Il `token` serve solo se il
   * repository è privato — e privato è la scelta giusta: una ricetta non
   * contiene dati di nessuno, ma dice come lavora un'azienda.
   */
  ricette?: { repo?: string; ramo?: string; token?: string }
  /**
   * Google: posta e calendario dalla loro API.
   *
   * Si conserva solo il `refresh`, che è la chiave duratura, e il client id di
   * chi ha registrato l'app. Il token d'accesso vive un'ora e sta in memoria:
   * scriverlo qui vorrebbe dire tenerne una copia scaduta su disco per sempre.
   */
  google?: { clientId: string; clientSecret?: string; refresh: string; email?: string; giorni?: number }
  /**
   * Slack: un token incollato, non un ballo col browser.
   *
   * Slack non accetta un indirizzo di ritorno su 127.0.0.1, che è l'unico che
   * un'app installata può offrire. Il token è da utente (`xoxp-`) apposta:
   * vede quello che vede la persona che l'ha creato, e non un canale di più.
   */
  slack?: { token: string; squadra?: string; utente?: string; giorni?: number }
  /**
   * Google Drive, separato da Gmail perché è un permesso separato.
   *
   * Stesso progetto su Google Cloud, stesse credenziali, consenso diverso: chi
   * ha collegato la posta non ha collegato i suoi file, e non deve ritrovarseli
   * collegati perché faceva comodo a noi.
   */
  drive?: { clientId: string; clientSecret?: string; refresh: string; email?: string; giorni?: number }
  /**
   * Microsoft: una registrazione su Entra ID, due metà che si concedono a parte.
   *
   * `parti` è quello che è stato davvero concesso — `posta` per Outlook e
   * l'agenda, `file` per SharePoint e OneDrive. Un elenco vuoto non capita:
   * quando si stacca l'ultima metà, tutto il blocco sparisce insieme al token.
   */
  microsoft?: {
    clientId: string; clientSecret?: string; tenant?: string; refresh: string
    email?: string; nome?: string; parti: ('posta' | 'file')[]; giorni?: number
  }
  /** Dropbox: la chiave dell'app e il token duraturo. Il codice si incolla. */
  dropbox?: { chiave: string; refresh: string; conto?: string; giorni?: number }
  /**
   * WhatsApp Business: l'unico che non si legge, ma che scrive quando arriva.
   *
   * `segreto` non è facoltativo travestito da tale: è quello che firma i
   * messaggi che entrano da un indirizzo che, per forza, sta aperto al mondo.
   */
  whatsapp?: {
    token: string; numero: string; segreto: string; parola: string
    etichetta?: string; arrivati?: number
  }
  /**
   * L'osservatore del Mac (P1): le app che ha davanti e, se lo accende, i
   * titoli delle finestre. Appartiene al conto che lo accende su questo Mac.
   * `pausaFino` è un istante ISO, o null quando non è in pausa; `escluse` sono
   * gli identificativi delle app da non guardare mai.
   */
  osservatore?: { acceso: boolean; titoli?: boolean; dal?: string; pausaFino?: string | null; escluse?: string[] }
  /** Il gemello (P1): le previsioni sigillate fino alla sera. */
  gemello?: { previsioni?: boolean }
  /** L'esame settimanale delle risposte (P7): spento se manca, perché costa. */
  provaRisposte?: { attiva: boolean }
}

/**
 * La cartella dei dati, e un errore che si può leggere se non si può usare.
 *
 * Su un server questa cartella è un volume montato da fuori, e i volumi si
 * montano di proprietà di root: se il processo non è root, qui non può
 * scrivere. Senza questo controllo il primo segnale arriva molto più tardi e
 * molto peggio — SQLite che non riesce ad aprire il file, con un messaggio che
 * parla di database e non di permessi, dentro un contenitore che riparte in
 * circolo. Meglio una frase, subito, che dica cosa guardare.
 */
function assicuraDir() {
  const dir = cartella()
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    } catch (e) {
      throw new Error(
        `myynd · non riesco a creare ${dir} (${(e as { code?: string }).code ?? e}). ` +
        'Se è un volume montato, il processo non ha il permesso di scriverci.'
      )
    }
  }
}

/**
 * Un file illeggibile non è un file vuoto.
 *
 * Qui c'era `catch { return {} }`, ed è la riga più costosa che questo file
 * abbia mai avuto. Un config.json troncato — un disco pieno a metà scrittura,
 * un riavvio nel momento sbagliato — diventava «nessun account». L'app
 * rimandava alla registrazione, la persona si registrava, e `aggiorna()`
 * scriveva `{...{}, ...patch}`: cioè un file nuovo con dentro solo l'account,
 * e via per sempre la password della casella, il token di Notion e la chiave
 * di Claude. Nessun errore, nessun avviso, e una schermata di benvenuto al
 * posto della propria mente.
 *
 * Adesso il file rotto si mette da parte prima di qualunque altra cosa. Le
 * credenziali restano lì dentro, leggibili, recuperabili a mano — e chi guarda
 * il terminale legge dov'è finito.
 */
/*
 * Uno per cartella, non uno per processo.
 *
 * Era un `boolean` solo, e con una persona sola andava bene. Con più persone
 * sullo stesso processo diventava questo: il primo config rotto veniva messo
 * da parte, e tutti quelli dopo — di altre persone — venivano ingoiati in
 * silenzio, perché la bandierina era già alzata. Cioè esattamente il guasto
 * che questa funzione esiste per impedire, spostato su chi arriva secondo.
 */
const giaMessiDaParte = new Set<string>()

function mettiDaParte(perche: string) {
  const mio = file()
  if (giaMessiDaParte.has(mio)) return
  giaMessiDaParte.add(mio)
  try {
    const dove = `${file()}.rotto-${new Date().toISOString().replace(/[:.]/g, '-')}`
    copyFileSync(file(), dove)
    chmodSync(dove, 0o600)
    console.error(
      `myynd · config.json non è leggibile (${perche}).\n` +
      `        Una copia intatta è in ${dove}: le credenziali sono lì, non sono perse.\n` +
      '        Myynd riparte da vuoto per non scriverci sopra.'
    )
  } catch (e) {
    console.error('myynd · config.json non è leggibile e non sono riuscito a metterlo da parte:', e)
  }
}

export function leggi(): Config {
  const u = chi.adesso()
  // una copia, non l'oggetto in memoria: chi lo modificasse senza passare da
  // `scrivi()` cambierebbe la configurazione senza che il database lo sappia
  if (postgres.ATTIVO && u) return ricorda(structuredClone(inMemoria.get(u)?.config ?? {}))
  assicuraDir()
  if (!existsSync(file())) return ricorda({})
  try {
    const c = JSON.parse(readFileSync(file(), 'utf8')) as unknown
    // `JSON.parse('"ciao"')` e `JSON.parse('null')` non lanciano: tornano un
    // valore che poi si comporta come una configurazione vuota senza esserlo
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      mettiDaParte('non è un oggetto')
      return {}
    }
    return ricorda(c as Config)
  } catch (e) {
    mettiDaParte(e instanceof Error ? e.message : String(e))
    return {}
  }
}

/**
 * La scrittura, in due tempi.
 *
 * `writeFileSync` sul file vero tronca prima di scrivere: se il processo muore
 * in mezzo — o il disco è pieno — quello che resta è mezzo file, cioè il file
 * rotto del commento qui sopra. Si scrive accanto e si rinomina: `rename` su
 * uno stesso filesystem è atomico, quindi il file o è quello di prima o è
 * quello nuovo, mai una via di mezzo.
 */
/** I campi che portano una credenziale: non spariscono da una scrittura qualunque. */
export const CON_SEGRETI = ['claude', 'jev', 'posta', 'notion', 'slack', 'github', 'compatibile', 'openai', 'credenzialiModelli', 'google', 'drive', 'dropbox', 'whatsapp', 'calendario', 'microsoft', 'sharepoint', 'granola', 'note', 'conversazioni'] as const
const CAMPI_SEGRETI = new Set(['apiKey', 'chiave', 'password', 'token', 'refresh', 'clientSecret', 'segreto', 'parola'])
const segretoPresente = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
  && !/^[*•●…\.\s]+$/.test(v) && v !== '[credenziale rimossa / credential removed]'

/** Exact endpoint identity: never reuse one provider's credential on another URL. */
function endpointCredenziale(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null
    u.hash = ''
    return u.href.replace(/\/$/, '')
  } catch { return null }
}

export function chiaveCompatibile(url: string, c: Config = leggi()): string | undefined {
  const endpoint = endpointCredenziale(url)
  if (!endpoint) return undefined
  if (c.compatibile && endpointCredenziale(c.compatibile.url) === endpoint && segretoPresente(c.compatibile.chiave)) return c.compatibile.chiave
  const chiave = c.credenzialiModelli?.[endpoint]?.chiave
  return segretoPresente(chiave) ? chiave : undefined
}

function conservaCredenziali(prima: Config, c: Config, togli: readonly string[]): Config {
  const dopo = structuredClone(c) as Record<string, unknown>
  const vecchia = prima as Record<string, unknown>
  const permessi = new Set(togli)
  for (const k of CON_SEGRETI) {
    if (permessi.has(k) || k === 'credenzialiModelli') continue
    const p = vecchia[k]
    if (p === undefined) continue
    if (dopo[k] == null) {
      dopo[k] = structuredClone(p)
      console.warn(`myynd · una scrittura senza «${k}» conserva la connessione salvata.`)
      continue
    }
    if (!p || typeof p !== 'object' || Array.isArray(p) || typeof dopo[k] !== 'object' || Array.isArray(dopo[k])) continue
    const nuovo = dopo[k] as Record<string, unknown>
    const vecchio = p as Record<string, unknown>
    // A different server/account needs its own secret, never an inherited one.
    const identita = k === 'compatibile' ? ['url'] : k === 'posta' ? ['host', 'utente'] : ['clientId', 'tenant']
    if (identita.some(id => nuovo[id] !== undefined && nuovo[id] !== vecchio[id])) continue
    for (const [campo, valore] of Object.entries(vecchio)) {
      if ((CAMPI_SEGRETI.has(campo) || (k === 'calendario' && campo === 'url')) && segretoPresente(valore) && !segretoPresente(nuovo[campo])) nuovo[campo] = valore
    }
  }

  const risultato = dopo as Config
  const archivio = { ...(!permessi.has('credenzialiModelli') ? prima.credenzialiModelli : {}), ...risultato.credenzialiModelli }
  const precedente = prima.compatibile && endpointCredenziale(prima.compatibile.url)
  if (precedente && segretoPresente(prima.compatibile?.chiave) && !permessi.has('credenzialiModelli')) archivio[precedente] = { chiave: prima.compatibile.chiave }
  if (permessi.has('compatibile') && precedente) delete archivio[precedente]
  const attuale = risultato.compatibile && endpointCredenziale(risultato.compatibile.url)
  if (attuale && risultato.compatibile) {
    if (!segretoPresente(risultato.compatibile.chiave)) {
      const salvata = archivio[attuale]?.chiave
      if (segretoPresente(salvata)) risultato.compatibile.chiave = salvata
      else delete risultato.compatibile.chiave
    }
    if (segretoPresente(risultato.compatibile.chiave)) archivio[attuale] = { chiave: risultato.compatibile.chiave }
  }
  if (Object.keys(archivio).length) risultato.credenzialiModelli = archivio
  else delete risultato.credenzialiModelli
  return risultato
}

/**
 * Scrive la configurazione.
 *
 * Con una regola sola in più: una credenziale che sta sul disco non sparisce
 * perché chi scrive non ce l'aveva in mano. Il 13 settembre 2026 la chiave di
 * Claude è sparita fra le 19:00 e le 19:03 senza una riga di registro che
 * dicesse chi era stato. Togliere una credenziale si fa apposta, dicendolo
 * (`togli`): tutto il resto la tiene, e se ci prova lo scrive nel registro.
 */
export function scrivi(c: Config, opz: { togli?: readonly string[] } = {}) {
  const u = chi.adesso()
  const prima = leggi()
  const base = basiLette.get(c)
  if (base && base.cartella !== cartella()) throw new Error('A configuration from another account cannot be saved here.')
  const unita = base ? fondi(base.config, c, prima) : c
  const dopo = conservaCredenziali(prima, unita, opz.togli ?? [])
  /*
   * La scelta di come si paga Claude è una connessione, anche se non è un
   * segreto: `claudeCon: 'abbonamento'` che sparisce da una scrittura che non
   * l'ha tolto apposta è Anthropic che si spegne sullo schermo senza che
   * nessuno abbia premuto «Scollega». Si tiene, e si scrive nel registro chi
   * ha provato: è la riga che mancava per capire «perché si scollega».
   */
  if (prima.claudeCon && dopo.claudeCon === undefined && !(opz.togli ?? []).includes('claudeCon')) {
    dopo.claudeCon = prima.claudeCon
    console.warn(`myynd · una scrittura senza «claudeCon» conserva la scelta «${prima.claudeCon}».`)
  }
  if (postgres.ATTIVO && u) {
    tenuta(u).config = dopo
    segnaSporco(u)
    basiLette.set(c, { cartella: cartella(), config: structuredClone(c) })
    return ricorda(structuredClone(dopo))
  }
  assicuraDir()
  const accanto = `${file()}.nuovo-${process.pid}-${randomUUID()}`
  writeFileSync(accanto, JSON.stringify(dopo, null, 2), { mode: 0o600, flush: true })
  chmodSync(accanto, 0o600)
  renameSync(accanto, file())
  chmodSync(file(), 0o600)
  basiLette.set(c, { cartella: cartella(), config: structuredClone(c) })
  return ricorda(structuredClone(dopo))
}

export function aggiorna(patch: Partial<Config>): Config {
  // i campi undefined non sono "cancella": sono "non toccare"
  const puliti = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  ) as Partial<Config>
  const c = leggi()
  Object.assign(c, puliti)
  return scrivi(c)
}

/** La configurazione senza nessun segreto — questa sì può uscire dall'API. */
export function pubblica(c: Config = leggi()) {
  return {
    account: c.account ? { email: c.account.email } : null,
    nome: c.nome ?? null,
    ruolo: c.ruolo ?? null,
    onboarding: !!c.onboarding,
    // l'ordine dei blocchi della prima pagina scelto da lui; vuoto = quello di serie
    ordineBlocchi: Array.isArray(c.ordineBlocchi) ? c.ordineBlocchi : [],
    // normalizzati: l'interfaccia deve vedere accesa la casella giusta anche
    // per un file scritto quando i nomi erano altri
    tono: tono(c),
    autonomia: autonomia(c),
    modello: modello(c),
    modelli: modelliPerLivello(c),
    lingua: c.lingua ?? 'en',
    tema: c.tema ?? 'sistema',
    fuso: c.fuso ?? null,
    oreFatte: c.oreFatte ?? 48,
    tetto: c.tetto ?? 0,
    giro: !!c.giro,
    argomenti: c.argomenti ?? '',
    // chi ha scritto quella riga: la schermata lo dice, invece di lasciar
    // credere a qualcuno di averla scritta lui
    argomentiDaMe: c.argomentiDaMe === true,
    // e lo stesso per il fuoco: la schermata deve poter dire chi ha scritto
    // quella riga, invece di lasciar credere a qualcuno di averla scritta lui
    fuocoDaMe: c.fuocoDaMe === true,
    diSerie: c.diSerie === true,
    abbonamento: { attivo: c.abbonamento?.attivo === true },
    claudeCon: c.claudeCon ?? (c.abbonamento?.attivo === true ? 'abbonamento' : 'chiave'),
    // «compatibile» solo se il fornitore c'è: una scelta rimasta nel file dopo
    // uno scollega non deve far credere alla schermata che ci sia un motore
    motore: c.motore === 'chatgpt' ? 'chatgpt' : c.motore === 'openai' && segretoPresente(c.openai?.chiave) ? 'openai' : c.motore === 'compatibile' && c.compatibile ? 'compatibile' : 'claude',
    // vuoto = il modello predefinito del piano
    chatgpt: { attivo: c.chatgpt?.attivo === true, modelli: Object.fromEntries(LIVELLI.map(l => [l, c.chatgpt?.modelli?.[l] ?? ''])) as Record<Livello, string> },
    // il modello esce, la chiave no; un livello senza scelta usa il modello della scheda
    openai: c.openai && segretoPresente(c.openai.chiave)
      ? { collegato: true, modello: c.openai.modello, chiaveSalvata: true, modelli: Object.fromEntries(LIVELLI.map(l => [l, c.openai?.modelli?.[l] || c.openai!.modello])) as Record<Livello, string> }
      : null,
    // l'indirizzo e il modello escono, la chiave no
    compatibile: c.compatibile
      ? { collegato: true, url: c.compatibile.url, modello: c.compatibile.modello, nome: c.compatibile.nome ?? null, chiaveSalvata: !!chiaveCompatibile(c.compatibile.url, c) }
      : null,
    posta: c.posta ? { host: c.posta.host, utente: c.posta.utente, giorni: c.posta.giorni ?? 30 } : null,
    desktop: c.desktop ? { cartelle: c.desktop.cartelle, tutto: c.desktop.tutto === true } : null,
    notion: c.notion ? { collegato: true } : null,
    // esce il numero, non le chiavi: con l'account dentro c'è un refresh
    granola: c.granola ? { collegato: true, note: c.granola.note ?? 0 } : null,
    note: c.note ? { collegato: true, note: c.note.note ?? 0 } : null,
    // i percorsi escono come le cartelle del desktop: in casa sono suoi, e la
    // scheda deve poterli mostrare
    conversazioni: c.conversazioni ? { collegato: true, file: c.conversazioni.file, codice: c.conversazioni.codice } : null,
    // il nome dell'agenda esce, l'indirizzo no: quello è la chiave di casa
    calendario: c.calendario ? { collegato: true, nome: c.calendario.nome ?? null, giorni: c.calendario.giorni ?? 30 } : null,
    /*
     * Solo la chiave, e non «Myynd può ragionare con Claude».
     *
     * Sembra la stessa cosa e non lo è da quando le strade sono due: chi ha
     * collegato l'abbonamento e nessuna chiave leggerebbe `null` qui. La
     * risposta vera la sa `modello.conClaude()`, che questo file non può
     * chiamare — `modello.ts` importa `config.ts`, non il contrario — e per
     * questo `index.ts` la sovrascrive nella rotta `/api/stato`. Se un giorno
     * qualcuno legge questo campo senza passare di lì, deve trovare scritto
     * cosa vuol dire davvero.
     */
    claude: segretoPresente(c.claude?.apiKey) ? { collegato: true } : null,
    // come sopra: esce che c'è, non qual è. Chi vuol sapere se Jev può
    // davvero rispondere — chiave nel file *o* nell'ambiente — lo chiede a
    // `jev.collegato()`, e `index.ts` lo sovrascrive nella rotta `/api/stato`.
    jev: segretoPresente(c.jev?.apiKey) ? { collegato: true } : null,
    // di questi esce solo come si chiamano: token, refresh e segreti non
    // attraversano mai questa funzione, ed è l'unica ragione per cui esiste
    slack: c.slack ? { collegato: true, squadra: c.slack.squadra ?? null } : null,
    /*
      Il client id esce, il segreto no, e la differenza non è una svista.

      Su un'app che gira sul computer di qualcuno il «client id» non è una
      credenziale: è il nome pubblico dell'app registrata, e sta in chiaro
      dentro ogni indirizzo che si apre nel browser. Tenerlo nascosto non
      proteggerebbe niente e costerebbe una cosa vera — chi collega Drive dopo
      Gmail dovrebbe ricopiarlo a mano da Google Cloud, con l'unico effetto di
      farlo sbagliare a qualcuno. Il `clientSecret` invece resta di qua, e con
      lui il refresh: quelli sono chiavi.
    */
    google: c.google
      ? { collegato: true, email: c.google.email ?? null, clientId: c.google.clientId }
      : null,
    drive: c.drive
      ? { collegato: true, email: c.drive.email ?? null, clientId: c.drive.clientId }
      : null,
    microsoft: c.microsoft
      ? {
          collegato: true, email: c.microsoft.email ?? null, parti: c.microsoft.parti,
          clientId: c.microsoft.clientId, tenant: c.microsoft.tenant ?? ''
        }
      : null,
    dropbox: c.dropbox ? { collegato: true, conto: c.dropbox.conto ?? null } : null,
    whatsapp: c.whatsapp
      ? { collegato: true, etichetta: c.whatsapp.etichetta ?? null, arrivati: c.whatsapp.arrivati ?? 0 }
      : null
  }
}
