// L'accesso locale.
//
// L'account vive su questa macchina: email, nome azienda e la password
// passata per scrypt con il suo sale. La password in chiaro non viene mai
// scritta da nessuna parte, e l'hash non esce mai dall'API.
//
// Onestà su cosa protegge: chiude l'interfaccia, non cifra l'indice. I file
// in ~/.myynd restano leggibili da chiunque abbia accesso a questo utente del
// Mac. Serve a evitare che chi ti passa davanti al portatile apra la tua
// mente, non a difenderti da chi ha già la macchina.

import type { Request, Response, NextFunction } from 'express'

import { timingSafeEqual } from 'node:crypto'
import * as conti from './conti.ts'
import * as chi from './chi.ts'
import * as gettoni from './gettoni.ts'
import * as gettoniEmail from './gettoniEmail.ts'
import * as postaUscita from './postaUscita.ts'
import { REGISTRAZIONE, REGISTRAZIONE_SCELTA, INVITO, DOMINI_AMMESSI, OSPITATO, type Registrazione } from './ospitato.ts'



// Le sessioni scadute si potano in `conti.avvia()`, che `index.ts` aspetta
// prima di mettersi in ascolto: su Postgres non c'è niente da potare finché
// il database non ha risposto.

/**
 * Quanti tentativi falliti di fila, e da quando. Scrypt costa mezzo secondo di
 * proposito, ma mezzo secondo per tentativo è comunque un milione di tentativi
 * a settimana se nessuno conta: qui si conta.
 */
const tentativi = new Map<string, { quanti: number; ultimo: number }>()
const ATTESA_DA = 5
const ATTESA_MASSIMA = 5 * 60_000

/*
 * La chiave del conto dei tentativi è «chi prova, su quale conto», non il
 * conto e basta. Con il solo indirizzo, una password sbagliata ogni cinque
 * minuti — da chiunque — teneva fuori per sempre la persona giusta: il freno
 * diventava un modo di chiudere la porta a un altro. Con l'indirizzo di rete
 * dentro la chiave, chi prova a indovinare frena solo sé stesso.
 */
function chiave(email: string, da: string): string {
  return `${email.trim().toLowerCase()}|${da}`
}

/** La mappa non cresce per sempre: quello che è fermo da più del massimo non conta più. */
function pota() {
  if (tentativi.size < 2000) return
  const ora = Date.now()
  for (const [k, t] of tentativi) if (ora - t.ultimo > ATTESA_MASSIMA) tentativi.delete(k)
}

function attesaDi(k: string): number {
  const t = tentativi.get(k)
  if (!t || t.quanti < ATTESA_DA) return 0
  const dovuta = Math.min(2 ** (t.quanti - ATTESA_DA) * 1000, ATTESA_MASSIMA)
  return Math.max(0, t.ultimo + dovuta - Date.now())
}

/** Quanto bisogna aspettare prima di riprovare, in millisecondi. */
export function attesa(email: string, da = ''): number {
  return attesaDi(chiave(email, da))
}

function segna(k: string, riuscito: boolean) {
  if (riuscito) { tentativi.delete(k); return }
  pota()
  const t = tentativi.get(k) ?? { quanti: 0, ultimo: 0 }
  tentativi.set(k, { quanti: t.quanti + 1, ultimo: Date.now() })
}

/**
 * La password di chi è già dentro, con lo stesso freno dell'accesso.
 *
 * Cambiare la password e portarsi via tutto la chiedono di nuovo apposta: una
 * sessione rubata non deve bastare. Ma chiederla senza contare i tentativi
 * vuol dire che quella sessione rubata può provarle tutte, a otto al secondo,
 * e l'esportazione consegna ogni credenziale. Qui si conta per conto.
 */
export async function verificaPassword(utente: string, password: string):
  Promise<{ ok: true } | { ok: false; attesa: number }> {
  const k = `conto:${utente}`
  const a = attesaDi(k)
  if (a > 0) return { ok: false, attesa: a }
  const buona = await conti.verifica(utente, password)
  segna(k, buona)
  return buona ? { ok: true } : { ok: false, attesa: 0 }
}

export const DEV = process.env.MYYND_DEV === '1'

/**
 * Comodità di sviluppo, non una scorciatoia nella verifica: con MYYND_DEV=1
 * apriamo in anticipo una sessione dal token noto, così non si ripassa
 * dall'accesso a ogni riavvio. `valida` resta a un cammino solo — chi non ha
 * il token non entra, in sviluppo come altrove.
 */
export const TOKEN_SVILUPPO = 'sviluppo-non-in-produzione'

export async function apriSessioneDiSviluppo(): Promise<string> {
  // in sviluppo c'è una persona sola: se non c'è ancora un conto se ne fa uno
  let utente = conti.tutti()[0] ?? ''
  if (!utente) {
    const e = await conti.registra('sviluppo@myynd.local', TOKEN_SVILUPPO)
    if (e.ok) utente = e.id
  }
  if (utente) await conti.perProva.apriCon(TOKEN_SVILUPPO, utente)
  return TOKEN_SVILUPPO
}

/**
 * C'è almeno un conto su questa installazione?
 *
 * Serve ancora a una cosa sola — la guardia, che vuole sapere se ha senso
 * parlare di sessioni — e **non serve più a decidere cosa mostra la schermata
 * d'accesso.** Prima decideva quello: un conto esisteva e allora si «entrava»,
 * non esisteva e allora si «creava». Con più persone quella domanda non ha
 * risposta: chi apre la pagina può essere uno che ha già un conto o uno che
 * non ce l'ha, e lo sa lui, non il server. Adesso sceglie lui.
 */
export function registrato(): boolean {
  return conti.quanti() > 0
}

/** Chi è entrato in questa richiesta. */
export function conto(): { email: string } | null {
  const u = chi.adesso()
  if (!u) return null
  const c = conti.conto(u)
  return c ? { email: c.email } : null
}

/**
 * Un conto nuovo, per chiunque.
 *
 * Niente invito e niente «esiste già un account»: erano tutti e due la stessa
 * toppa sullo stesso buco, cioè che l'installazione aveva un conto solo e chi
 * arrivava secondo sarebbe finito dentro la posta del primo. Adesso ognuno ha
 * la sua cartella e il suo indice, e registrare un estraneo non gli fa vedere
 * niente di nessuno — che è la ragione per cui la porta si può riaprire.
 */
/**
 * Come ci si registra *adesso*.
 *
 * Chi ospita decide con `MYYND_REGISTRAZIONE`, e quella vale. Ma un server
 * pubblico con la variabile dimenticata non può restare aperto a chiunque
 * passi: ogni conto costa disco e un posto in ogni giro di sfondo, e con un
 * conto in mano si arriva a cose che da fuori non si toccano. Quindi, ospitati
 * e senza una scelta scritta: la porta è aperta finché non entra il primo —
 * chi ha messo su il server — e poi si chiude, o passa all'invito se ce n'è
 * uno. Una riga all'avvio lo dice.
 */
export function registrazione(): Registrazione {
  if (REGISTRAZIONE_SCELTA || !OSPITATO) return REGISTRAZIONE
  if (conti.quanti() === 0) return 'aperta'
  return INVITO ? 'invito' : 'chiusa'
}

export async function registra(email: string, password: string, invito = ''):
  Promise<{ ok: true; token: string; utente: string; daVerificare?: boolean; mailPartita?: boolean } | { ok: false; errore: string }> {
  // il cancello di chi ospita, prima di toccare il database
  const regola = registrazione()
  if (regola === 'chiusa') return { ok: false, errore: 'Le registrazioni sono chiuse su questo server.' }
  if (regola === 'invito') {
    const a = Buffer.from(invito.trim()), b = Buffer.from(INVITO)
    if (!INVITO || a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, errore: 'Serve il codice d’invito per registrarsi qui.' }
    }
  }
  if (DOMINI_AMMESSI.length) {
    const dominio = email.trim().toLowerCase().split('@')[1] ?? ''
    if (!DOMINI_AMMESSI.includes(dominio)) return { ok: false, errore: 'Questo server accetta solo indirizzi dell’azienda.' }
  }
  /*
   * Il primo conto entra senza confermare niente, ed è l'unica eccezione.
   *
   * È la persona che ha appena messo su il server: non c'è nessuno che possa
   * farla entrare, e se la mail non partisse — un host sbagliato, una porta
   * chiusa, la prima volta che si prova quella configurazione — resterebbe
   * fuori dalla propria installazione senza nessuna strada che non sia la riga
   * di comando. Dal secondo in poi la conferma vale per tutti.
   */
  const primo = conti.quanti() === 0
  const serveVerifica = postaUscita.verificaObbligatoria() && !primo
  const e = await conti.registra(email, password, !serveVerifica)
  if (!e.ok) return e
  if (!serveVerifica) return { ok: true, token: e.token, utente: e.id }

  /*
   * Se la mail non parte, il conto resta — ma non si dice che è partita.
   *
   * Il conto non si butta: la configurazione SMTP di chi ospita può essere
   * sbagliata oggi e giusta domani, e cancellare il conto vorrebbe dire che
   * quella persona non può più nemmeno riprovare con il suo indirizzo. Ma
   * «guarda la posta» detto a chi non riceverà niente è la bugia che questo
   * prodotto non si può permettere: chi chiama riceve `mailPartita`, e la
   * schermata dice l'altra cosa.
   */
  let mailPartita = true
  try {
    await mandaLaConferma(e.id, email)
  } catch (guaio) {
    mailPartita = false
    console.error('myynd · non sono riuscito a mandare la conferma dell’indirizzo:',
      guaio instanceof Error ? guaio.message : guaio)
  }
  return { ok: true, token: '', utente: e.id, daVerificare: true, mailPartita }
}

export async function entra(email: string, password: string, da = ''):
  Promise<{ ok: true; token: string; utente: string } | { ok: false; errore: string; daVerificare?: boolean }> {
  const e = await conti.entra(email, password, postaUscita.verificaObbligatoria())
  // «giusta ma non confermata» conta come riuscita per il freno: la password
  // l'ha indovinata, e continuare a contarla chiuderebbe fuori la persona
  // giusta proprio mentre le si sta dicendo cosa fare per entrare
  segna(chiave(email, da), e.ok || e.daVerificare === true)
  if (!e.ok) return e
  return { ok: true, token: e.token, utente: e.id }
}

// ——— confermare l'indirizzo, e rimettere la password ———
//
// Le due strade che partono da una casella di posta. Esistono solo dove la
// posta del server è configurata, e la differenza non è una comodità in meno:
// senza, `MYYND_DOMINI` non prova niente — chiunque può scrivere
// `@azienda.it` senza avere quella casella — e chi dimentica la password deve
// scrivere a chi ospita. Con, un indirizzo che entra è un indirizzo che
// qualcuno ha davvero.

function collegamento(campo: 'verifica' | 'reimposta', gettone: string): string {
  return `${postaUscita.origine()}/?${campo}=${gettone}`
}

async function mandaLaConferma(utente: string, email: string): Promise<void> {
  const g = await gettoniEmail.crea(utente, 'verifica')
  await postaUscita.manda({ ...postaUscita.mailDiVerifica(collegamento('verifica', g)), a: email })
}

/**
 * «Rimandamela»: la conferma che non è arrivata, o che è scaduta.
 *
 * Risponde sempre la stessa cosa, come la richiesta di rimettere la password e
 * per la stessa ragione — vedi `chiediReimpostazione` qui sotto.
 */
export async function rimandaLaConferma(email: string): Promise<{ mailPartita: boolean }> {
  if (!postaUscita.verificaObbligatoria()) return { mailPartita: true }
  /*
   * La risposta la dà `funziona()`, che parla del server, e non l'esito del
   * singolo invio, che parlerebbe dell'indirizzo.
   *
   * È la stessa regola di `chiediReimpostazione`, e qui si sbaglia facilmente:
   * rispondere «non è partita» solo quando l'indirizzo esiste davvero
   * trasforma questa rotta in un modo di chiedere chi è iscritto — basta
   * spegnere la posta del server e provare gli indirizzi uno a uno.
   */
  const sana = await postaUscita.funziona()
  try {
    const c = await conti.aQuestoIndirizzo(email)
    if (c && !c.verificato) await mandaLaConferma(c.id, email)
  } catch (e) {
    console.error('myynd · non sono riuscito a rimandare la conferma di un indirizzo:', e instanceof Error ? e.message : e)
  }
  return { mailPartita: sana }
}

/** Il gettone speso: il conto è confermato, e da qui si entra. */
export async function confermaIndirizzo(gettone: string):
  Promise<{ ok: true; token: string; utente: string } | { ok: false; errore: string }> {
  const utente = await gettoniEmail.consuma(gettone, 'verifica')
  if (!utente) return { ok: false, errore: 'Questo collegamento non vale più: chiedine un altro dalla schermata d’accesso.' }
  await conti.segnaVerificato(utente)
  return { ok: true, token: await conti.apri(utente), utente }
}

/**
 * «Ho dimenticato la password», e la risposta è sempre la stessa.
 *
 * Sempre «ok», che l'indirizzo esista o no. Il contrario sarebbe un modo di
 * chiedere al server chi è iscritto qui: si prova un indirizzo, si guarda la
 * risposta, e in mezz'ora si ha l'elenco di chi lavora in quell'azienda. La
 * schermata dice «se quell'indirizzo è qui, ti abbiamo scritto» — che è vero e
 * non racconta niente a nessuno.
 *
 * Non lancia mai: un errore SMTP che risalisse fino alla rotta si vedrebbe
 * come una risposta diversa dalle altre, e sarebbe di nuovo l'oracolo dal
 * quale ci si sta guardando.
 */
export async function chiediReimpostazione(email: string): Promise<void> {
  if (!postaUscita.configurata()) return
  try {
    const c = await conti.aQuestoIndirizzo(email)
    if (!c) return
    const g = await gettoniEmail.crea(c.id, 'reimposta')
    await postaUscita.manda({ ...postaUscita.mailDiReimpostazione(collegamento('reimposta', g)), a: email })
  } catch (e) {
    console.error('myynd · non sono riuscito a mandare la mail per rimettere una password:', e instanceof Error ? e.message : e)
  }
}

/**
 * La password nuova, dal collegamento.
 *
 * `conti.cambiaPassword` chiude tutte le sessioni — che è quello che si vuole
 * proprio qui: chi rimette una password quasi sempre lo fa perché qualcosa non
 * gli torna. Poi se ne apre una per chi ha appena premuto, o si ritroverebbe
 * fuori dalla porta che ha appena chiuso a chiave.
 *
 * E l'indirizzo risulta confermato: ha appena dimostrato di ricevere la posta
 * lì, che è esattamente quello che la conferma chiede.
 */
export async function reimposta(gettone: string, nuova: string):
  Promise<{ ok: true; token: string; utente: string } | { ok: false; errore: string }> {
  const utente = await gettoniEmail.consuma(gettone, 'reimposta')
  if (!utente) return { ok: false, errore: 'Questo collegamento non vale più: chiedine un altro dalla schermata d’accesso.' }
  const e = await conti.cambiaPassword(utente, nuova)
  if (!e.ok) return e
  await conti.segnaVerificato(utente)
  return { ok: true, token: await conti.apri(utente), utente }
}

/** Serve la conferma dell'indirizzo, qui? Lo chiede la schermata d'accesso. */
export function verificaAttiva(): boolean {
  return postaUscita.verificaObbligatoria()
}

/** Si può rimettere una password da soli, qui? Senza posta del server, no. */
export function reimpostazionePossibile(): boolean {
  return postaUscita.configurata()
}

/**
 * Cambiare la password dall'app, con quella vecchia in mano.
 *
 * Chiude tutte le sessioni — è quello che vuole chi la cambia — e ne riapre
 * una per chi ha appena premuto, così non si ritrova fuori dalla porta che ha
 * appena chiuso a chiave.
 */
export async function cambiaPassword(utente: string, attuale: string, nuova: string):
  Promise<{ ok: true; token: string } | { ok: false; errore: string }> {
  const v = await verificaPassword(utente, attuale)
  if (!v.ok) {
    if (v.attesa > 0) return { ok: false, errore: fraTroppi(v.attesa) }
    return { ok: false, errore: 'La password attuale non è corretta.' }
  }
  const e = await conti.cambiaPassword(utente, nuova)
  if (!e.ok) return e
  return { ok: true, token: await conti.apri(utente) }
}

/** La frase di chi ha provato troppe volte, con i secondi che restano. */
export function fraTroppi(attesa: number): string {
  const secondi = Math.ceil(attesa / 1000)
  return `Troppi tentativi. Riprova fra ${secondi} second${secondi === 1 ? 'o' : 'i'}.`
}

/** «Esci da tutti i dispositivi», compreso questo. */
export async function esciOvunque(utente: string): Promise<number> {
  return conti.chiudiTutte(utente)
}

export async function esci(token?: string): Promise<void> {
  await conti.chiudi(token)
}

export async function valida(token?: string): Promise<boolean> {
  return !!(await conti.utenteDelToken(token))
}

function estrai(req: Request): string | undefined {
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ')) return h.slice(7)
  // Solo l'intestazione. Prima i due flussi (compiti, sincronizzazione) lo
  // portavano nell'indirizzo, perché EventSource non manda intestazioni: un
  // token di trenta giorni finiva nei registri del proxy e nella cronologia.
  // Il client adesso legge quei flussi con fetch, e l'intestazione c'è.
  return undefined
}

/**
 * Le porte che stanno prima dell'accesso: queste e nessun'altra.
 *
 * Le quattro che riguardano la posta ci stanno per forza — chi le usa non ha
 * una sessione, è il motivo per cui le usa — e per questo stanno tutte sotto
 * `/api/auth`, che è dove il freno per indirizzo di `index.ts` le prende
 * insieme alle altre. Una rotta che rimette una password senza freno sarebbe
 * un modo di provare gettoni a raffica.
 */
const PRIMA_DELL_ACCESSO = new Set([
  '/api/auth', '/api/auth/registra', '/api/auth/entra', '/api/auth/esci',
  '/api/auth/verifica', '/api/auth/verifica/manda',
  '/api/auth/reimposta', '/api/auth/reimposta/chiedi'
])

/**
 * La guardia, che adesso fa una cosa in più: **apre il contesto**.
 *
 * Riconosciuto il token si sa di chi è la richiesta, e da lì in avanti tutto
 * quello che gira dentro `chi.dentro` lavora sui dati di quella persona —
 * `config.leggi()`, l'indice, le automazioni — senza che nessuna delle
 * duecento funzioni sotto debba saperlo.
 *
 * È l'unico punto in cui quel contesto si apre, ed è voluto: un secondo posto
 * vorrebbe dire due idee di chi sia l'utente corrente, e il giorno che
 * divergono nessuno se ne accorge finché qualcuno non legge la posta di un
 * altro.
 */
export async function guardia(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (PRIMA_DELL_ACCESSO.has(req.path)) return next()
  const portato = estrai(req)

  /*
   * Il gettone con un ambito, prima della sessione.
   *
   * Prima per il prefisso, non per preferenza: si riconosce dalla forma, e
   * chiedere al database «di chi è questa sessione?» per un valore che
   * sessione non è vorrebbe dire un giro a vuoto verso Postgres su ognuna
   * delle migliaia di richieste che spingono i documenti del Mac.
   *
   * **L'ambito si controlla qui e in nessun altro posto.** È la ragione per
   * cui questi gettoni possono esistere: se il permesso lo controllasse la
   * singola rotta, la rotta scritta domani non lo controllerebbe, e un gettone
   * fatto per spingere documenti si troverebbe a poter leggere una casella.
   * Qui la risposta di serie è no.
   */
  if (portato?.startsWith(gettoni.PREFISSO)) {
    const g = await gettoni.trova(portato)
    if (!g) { res.status(401).json({ errore: 'Sessione scaduta.', serve: 'accesso' }); return }
    if (!gettoni.puoi(g.ambito, req.path)) {
      res.status(403).json({ errore: 'Questo gettone non arriva qui: ha un ambito, e questa rotta non ci sta dentro.' })
      return
    }
    chi.dentro(g.utente, next)
    return
  }

  // asincrona perché su Postgres il token si chiede al database: Express 5
  // aspetta una promessa, e se si rompe la passa al gestore degli errori
  const utente = await conti.utenteDelToken(portato)
  if (!utente) { res.status(401).json({ errore: 'Sessione scaduta.', serve: 'accesso' }); return }
  chi.dentro(utente, next)
}

export const tokenDi = estrai
