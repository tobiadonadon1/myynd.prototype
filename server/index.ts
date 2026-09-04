// Il server locale di Myynd. Gira solo su 127.0.0.1: le credenziali che
// scrivi nell'onboarding restano su questa macchina.

import express from 'express'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import * as cfg from './config.ts'
import * as store from './store.ts'
import * as claude from './claude.ts'
import * as mod from './modello.ts'
import * as compatibile from './compatibile.ts'
import * as abbonamento from './abbonamento.ts'
import * as memoria from './memoria.ts'
import * as timone from './timone.ts'
import * as rassegna from './rassegna.ts'
import * as gusto from './gusto.ts'
import * as compiti from './compiti.ts'
import * as automazioni from './automazioni.ts'
import * as ordine from './ordine.ts'
import * as attrezzi from './attrezzi.ts'
import * as domande from './domande.ts'
import * as traduci from './traduci.ts'
import * as posta from './connettori/posta.ts'
import * as scrivania from './scrivania.ts'
import * as agenda from './agenda.ts'
import * as lavoro from './lavoro.ts'
import * as google from './connettori/google.ts'
import * as desktop from './connettori/desktop.ts'
import * as desktopRemoto from './connettori/desktopRemoto.ts'
import * as estrai from './connettori/estrai.ts'
import * as notion from './connettori/notion.ts'
import * as calendario from './connettori/calendario.ts'
import * as slack from './connettori/slack.ts'
import * as drive from './connettori/drive.ts'
import * as microsoft from './connettori/microsoft.ts'
import * as dropbox from './connettori/dropbox.ts'
import * as whatsapp from './connettori/whatsapp.ts'
import { CATALOGO } from './connettori/registro.ts'
import * as ospitato from './ospitato.ts'
import * as auth from './auth.ts'
import * as gettoni from './gettoni.ts'
import * as addio from './addio.ts'
import * as fascicolo from './fascicolo.ts'
import * as conti from './conti.ts'
import * as postgres from './postgres.ts'
import * as chi from './chi.ts'
import * as trasloco from './trasloco.ts'
import * as fuso from './fuso.ts'
import * as oauth from './connettori/oauth.ts'
import { riflua } from './testo.ts'

const app = express()

/*
 * L'indirizzo di WhatsApp, e perché sta qui sopra a tutto.
 *
 * Sta **prima** del controllo sull'Host e **prima** della guardia dell'accesso,
 * e sono due eccezioni che vanno guardate in faccia invece che nascoste in
 * mezzo alle altre rotte.
 *
 * L'Host: Meta bussa da fuori, con il nome di dominio del tunnel che hai
 * messo davanti. Il controllo che c'è più sotto pretende `127.0.0.1`, quindi
 * qualunque messaggio in arrivo prenderebbe un 403 — sempre, e in silenzio.
 * La guardia dell'accesso: Meta non ha il tuo token di sessione e non può
 * averlo.
 *
 * Quindi qui la difesa è un'altra, e **più forte di tutte e due**: ogni
 * messaggio porta un HMAC del proprio corpo fatto con il segreto dell'app.
 * Chi non ha quel segreto non può fabbricarne uno valido, e senza segreto
 * configurato questo indirizzo rifiuta *tutto* — non «accetta tutto per
 * comodità», che è come una porta di servizio diventa una porta.
 *
 * `express.raw` e non `express.json`: la firma si calcola sui byte esatti che
 * sono arrivati. Riserializzare un oggetto già letto cambia gli spazi, la
 * firma non torna più, e questo controllo finisce disattivato «perché non
 * funzionava».
 */
/**
 * Di chi è questa bussata di Meta.
 *
 * Il webhook arriva senza nessun token nostro, e finora leggeva la
 * configurazione della *radice* — cioè di nessuno, su un server con più conti.
 * Si prova ogni conto: quello la cui parola d'ordine (o il cui segreto) fa
 * combaciare la richiesta è quello a cui appartiene. I confronti restano a
 * tempo costante: si scorre l'elenco, non si indovina.
 */
function contoDelWebhook(combacia: () => boolean): string | null {
  for (const u of conti.tutti()) {
    try { if (chi.dentro(u, combacia)) return u } catch { /* il prossimo */ }
  }
  return null
}

app.get('/api/whatsapp/webhook', (req, res) => {
  const q = req.query as Record<string, unknown>
  const u = contoDelWebhook(() => whatsapp.verifica(q).ok)
  if (!u) return res.status(403).end()
  const e = chi.dentro(u, () => whatsapp.verifica(q))
  if (!e.ok) return res.status(403).end()
  res.type('text/plain').send(e.sfida)
})

app.post('/api/whatsapp/webhook', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const firma = req.headers['x-hub-signature-256'] as string | undefined
  const u = contoDelWebhook(() => whatsapp.firmaBuona(corpo, firma))
  if (!u) return res.status(403).end()
  /*
   * Il 200 si dà comunque, e non è sciatteria.
   *
   * Meta ripete un messaggio finché non riceve un 200, e dopo qualche
   * tentativo andato male stacca l'iscrizione. Un messaggio scritto in una
   * lingua che non sappiamo leggere non è un guasto suo: rispondere con un
   * errore vorrebbe dire farselo ripetere per giorni, e poi perdere tutto il
   * collegamento per colpa di quell'uno.
   */
  try {
    const quanti = chi.dentro(u, () => whatsapp.incassa(JSON.parse(corpo.toString('utf8'))))
    if (quanti) console.log(`myynd · whatsapp: ${quanti} messagg${quanti === 1 ? 'io' : 'i'} arrivat${quanti === 1 ? 'o' : 'i'}`)
  } catch (e) {
    console.error('myynd · un messaggio di WhatsApp non si è lasciato leggere:', e instanceof Error ? e.message : e)
  }
  res.status(200).end()
})

/*
 * Il tetto del corpo dipende da dove bussa.
 *
 * Due mega bastano a tutta l'API — una chat, una preferenza, una chiave — e
 * sono un tetto giusto: un tetto largo ovunque è un modo di farsi riempire la
 * memoria da chiunque abbia un token. Ma due rotte ricevono *documenti*: il
 * Mac che spinge migliaia di file già letti, e il browser che manda un PDF in
 * base64. Con due mega la prima cadeva alla prima cartella vera, e la seconda
 * al primo PDF da tre mega — con un 413 che la schermata leggeva come «non
 * sono riuscito a collegare».
 */
const CORPO_GRANDE = new Set(['/api/connettori/desktop/carica', '/api/connettori/desktop/carica-file'])
const jsonNormale = express.json({ limit: '2mb' })
const jsonGrande = express.json({ limit: '50mb' })
app.use((req, res, next) => (CORPO_GRANDE.has(req.path) ? jsonGrande : jsonNormale)(req, res, next))

/**
 * La porta.
 *
 * In sviluppo è 5174 e si sa in anticipo. Dentro l'app impacchettata no: una
 * porta fissa è una porta che un giorno trova occupata, e allora l'app non
 * parte e nessuno sa perché. Con `MYYND_PORT=0` il sistema ne assegna una
 * libera, e quella vera si sa solo dopo `listen` — quindi il controllo
 * sull'origine non può essere una costante, va letto a ogni richiesta.
 */
const PORTA_CHIESTA = ospitato.PORTA
let porta = PORTA_CHIESTA

/** I tre secchi della lista. Non di più: una lista con sette scomparti è un archivio. */
const SECCHI = ['oggi', 'settimana', 'poi']

/**
 * Ascoltare su 127.0.0.1 non basta a stare da soli: qualunque pagina aperta nel
 * browser può bussare qui, e un dominio che si ri-risolve su 127.0.0.1 (DNS
 * rebinding) diventa perfino same-origin. Due righe chiudono entrambe le porte:
 * l'Host deve essere il nostro, e un Origin, se c'è, deve venire dall'app.
 */
app.use((req, res, next) => {
  /*
   * Su una macchina di casa gli Host ammessi sono due, e la difesa vera è che
   * da fuori non ci si arriva. Ospitato ce n'è uno in più — il dominio, scritto
   * a mano in `MYYND_PUBBLICO` — e non uno qualunque: allargare questo
   * controllo a `*` vorrebbe dire toglierlo, perché è esattamente lui a fermare
   * un dominio che si ri-risolve su 127.0.0.1.
   */
  const host = (req.headers.host ?? '').toLowerCase()
  if (!ospitato.ospiteAmmesso(host, porta)) {
    return res.status(403).json({ errore: 'Origine non consentita.' })
  }
  const origin = req.headers.origin
  if (origin && !ospitato.origineAmmessa(origin, porta)) {
    return res.status(403).json({ errore: 'Origine non consentita.' })
  }
  next()
})

/**
 * Le intestazioni che costano niente e chiudono qualcosa.
 *
 * L'interfaccia è un bundle nostro, gli stili sono inline (React), le
 * immagini dei giornali arrivano da fuori in https: la regola dice questo e
 * nient'altro. Niente iframe che ci incornicia, niente MIME indovinato, e su
 * un server il browser si ricorda che qui si parla solo https.
 */
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; " +
    "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'")
  if (ospitato.OSPITATO) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  next()
})

/**
 * L'interfaccia, servita dallo stesso server.
 *
 * Sta *prima* della guardia, e deve starci: il pacchetto dell'interfaccia non
 * è un segreto — è lo stesso che chiunque scarica installando l'app — mentre
 * tutto quello che c'è dentro la tua mente sta dietro `/api`, che la guardia
 * copre. Servirla dopo voleva dire una finestra che si apre su
 * «Sessione scaduta» scritto in JSON, prima ancora dell'accesso.
 *
 * Servirla da qui, poi, è quello che tiene in piedi il controllo sull'origine:
 * una finestra che carica da `file://` manda `Origin: file://` e si becca un
 * 403 — giustamente, perché quella regola è la difesa contro il DNS rebinding,
 * e allargarla per far entrare l'app la aprirebbe a chiunque. Da
 * `http://127.0.0.1:<porta>` l'origine è già quella giusta.
 */
const INTERFACCIA = join(import.meta.dirname, '..', 'dist')
if (existsSync(INTERFACCIA)) {
  app.use(express.static(INTERFACCIA))
}

// — accesso —

/*
 * Un freno per indirizzo, su tutto quello che sta prima dell'accesso.
 *
 * Il conto dei tentativi per email c'è già (`auth.attesa`), ma da solo ha due
 * buchi: la registrazione non lo passa, e chi bombarda con email sempre
 * diverse non lo incontra mai — mentre ogni chiamata costa uno scrypt intero,
 * cioè mezzo secondo di processore fermo per tutti. Trenta al minuto per
 * indirizzo bastano a una persona che sbaglia la password e non bastano a uno
 * script. Dietro il proxy di chi ospita l'indirizzo vero sta in
 * `X-Forwarded-For`, e Express lo legge solo se glielo si dice.
 */
if (ospitato.OSPITATO) app.set('trust proxy', 1)
const colpi = new Map<string, { n: number; da: number }>()
const COLPI_AL_MINUTO = 30
app.use('/api/auth', (req, res, next) => {
  if (req.method !== 'POST') return next()
  const ip = req.ip ?? 'ignoto'
  const ora = Date.now()
  if (colpi.size > 5000) for (const [k, v] of colpi) if (ora - v.da > 60_000) colpi.delete(k)
  const c = colpi.get(ip)
  if (!c || ora - c.da > 60_000) { colpi.set(ip, { n: 1, da: ora }); return next() }
  c.n++
  if (c.n > COLPI_AL_MINUTO) return res.status(429).json({ errore: 'Troppi tentativi. Riprova fra un minuto.' })
  next()
})

/**
 * Il ritorno del consenso, ospitati.
 *
 * Google e Microsoft rimandano il browser qui con un codice e lo `state`, e
 * senza nessun token nostro: questa rotta sta *prima* della guardia, e di chi
 * sia il consenso lo dice lo `state` — un segreto che conosce solo il browser
 * che l'ha ricevuto avviando il ballo dentro il suo conto.
 */
const BIGLIETTO = 'myynd_oauth'
/** Il biglietto del consenso, dal cookie: vedi `oauth.biglietto`. */
function bigliettoPortato(req: express.Request): string {
  for (const pezzo of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = pezzo.trim().split('=')
    if (k === BIGLIETTO) return v.join('=')
  }
  return ''
}
/** Al browser che parte per il consenso: dieci minuti, solo su questa strada di ritorno. */
function consegnaIlBiglietto(res: express.Response, b: string) {
  res.setHeader('Set-Cookie', `${BIGLIETTO}=${b}; Path=/api/oauth/ritorno; Max-Age=600; HttpOnly; Secure; SameSite=Lax`)
}

app.get('/api/oauth/ritorno', async (req, res) => {
  const stato = String(req.query.state ?? '')
  const codice = req.query.code ? String(req.query.code) : null
  const guaio = req.query.error ? String(req.query.error) : null
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('Set-Cookie', `${BIGLIETTO}=; Path=/api/oauth/ritorno; Max-Age=0; HttpOnly; Secure; SameSite=Lax`)
  try {
    const { nome } = await oauth.completaWeb(stato, codice, guaio, bigliettoPortato(req))
    res.send(oauth.paginaWeb(true, nome))
  } catch (e) {
    res.status(400).send(oauth.paginaWeb(false, '', e instanceof Error ? e.message : String(e)))
  }
})

app.get('/api/auth', async (req, res) => {
  /*
   * Chi sei, non «esiste un account».
   *
   * Prima questa rotta diceva se sull'installazione c'era un conto, e la
   * schermata ne ricavava se mostrare «entra» o «crea». Con più persone quella
   * domanda non ha senso: chi apre la pagina sa se ha un conto, il server no.
   * La schermata adesso offre tutte e due le cose e lascia scegliere.
   */
  const utente = auth.tokenDi(req)
  const dentro = await auth.valida(utente)
  const rispondi = () => res.json({
    entrato: dentro,
    account: dentro ? auth.conto() : null,
    ospitato: ospitato.OSPITATO,
    // come ci si registra qui: la schermata mostra il campo dell'invito, o
    // toglie la scheda «crea», invece di scoprirlo dopo aver scritto la password
    registrazione: auth.registrazione(),
    /*
     * Cosa può fare la posta di questo server, se c'è.
     *
     * Senza, la schermata non deve offrire «ho dimenticato la password»: un
     * bottone che porta a una richiesta che risponde sempre «ok» e non manda
     * niente è peggio di nessun bottone — chi ci prova aspetta una mail che
     * non arriverà mai, e non ha modo di saperlo.
     */
    verifica: auth.verificaAttiva(),
    reimpostazione: auth.reimpostazionePossibile()
  })
  if (!dentro) return rispondi()
  chi.dentro((await conti.utenteDelToken(utente))!, rispondi)
})

app.post('/api/auth/registra', async (req, res) => {
  const { email, password, invito } = req.body ?? {}
  const e = await auth.registra(String(email ?? ''), String(password ?? ''), String(invito ?? ''))
  if (!e.ok) return res.status(400).json({ errore: e.errore })
  /*
   * Senza token, quando l'indirizzo va confermato.
   *
   * Il conto c'è ma non si entra: la schermata legge `daVerificare` e dice di
   * guardare la posta invece di aprirsi su una mente vuota. Restituire una
   * sessione e poi chiederle di confermare farebbe della conferma una
   * formalità che si può ignorare — cioè niente.
   */
  chi.dentro(e.utente, () => res.json({
    ok: true, token: e.token, account: auth.conto(), daVerificare: e.daVerificare === true,
    // «guarda la posta» si dice solo se la posta è partita davvero
    mailPartita: e.mailPartita !== false
  }))
})

app.post('/api/auth/entra', async (req, res) => {
  const da = req.ip ?? ''
  const attesa = auth.attesa(String(req.body?.email ?? ''), da)
  if (attesa > 0) return res.status(429).json({ errore: auth.fraTroppi(attesa) })
  const { email, password } = req.body ?? {}
  const e = await auth.entra(String(email ?? ''), String(password ?? ''), da)
  if (!e.ok) return res.status(401).json({ errore: e.errore, daVerificare: e.daVerificare === true })
  chi.dentro(e.utente, () => res.json({ ok: true, token: e.token, account: auth.conto() }))
})

app.post('/api/auth/esci', async (req, res) => {
  await auth.esci(auth.tokenDi(req))
  res.json({ ok: true })
})

// — l'indirizzo confermato, e la password dimenticata —
//
// Stanno qui sopra la guardia perché chi le usa una sessione non ce l'ha: è il
// motivo per cui le usa. E stanno sotto `/api/auth`, dove il freno per
// indirizzo qui in cima le prende insieme alle altre — una rotta che rimette
// una password senza freno sarebbe un modo di provare gettoni a raffica.

app.post('/api/auth/verifica', async (req, res) => {
  const e = await auth.confermaIndirizzo(String(req.body?.gettone ?? ''))
  if (!e.ok) return res.status(400).json({ errore: e.errore })
  chi.dentro(e.utente, () => res.json({ ok: true, token: e.token, account: auth.conto() }))
})

/**
 * «Non mi è arrivata».
 *
 * Risponde ok comunque, come la richiesta qui sotto e per la stessa ragione:
 * un «questo indirizzo non c'è» detto a chi non è entrato è un modo di farsi
 * raccontare chi lavora in quest'azienda.
 */
app.post('/api/auth/verifica/manda', async (req, res) => {
  const { mailPartita } = await auth.rimandaLaConferma(String(req.body?.email ?? ''))
  res.json({ ok: true, mailPartita })
})

/**
 * «Ho dimenticato la password»: sempre ok, esista o no quell'indirizzo.
 *
 * Non è pigrizia ed è la parte che va guardata due volte prima di
 * «migliorarla»: rispondere «non c'è nessun conto con questo indirizzo»
 * sembra gentile, e in mezz'ora consegna a chiunque l'elenco di chi è iscritto
 * qui. La schermata dice «se quell'indirizzo è qui, ti abbiamo scritto».
 */
app.post('/api/auth/reimposta/chiedi', async (req, res) => {
  await auth.chiediReimpostazione(String(req.body?.email ?? ''))
  res.json({ ok: true })
})

app.post('/api/auth/reimposta', async (req, res) => {
  const e = await auth.reimposta(String(req.body?.gettone ?? ''), String(req.body?.password ?? ''))
  if (!e.ok) return res.status(400).json({ errore: e.errore })
  chi.dentro(e.utente, () => res.json({ ok: true, token: e.token, account: auth.conto() }))
})

// da qui in giù serve essere dentro
app.use(auth.guardia)

function errore(res: express.Response, e: unknown, stato = 500) {
  const m = e instanceof Error ? e.message : String(e)
  res.status(stato).json({ errore: m })
}

// — stato generale —

// — il conto —

app.post('/api/conto/password', async (req, res) => {
  const attuale = String(req.body?.attuale ?? '')
  const nuova = String(req.body?.nuova ?? '')
  try {
    const e = await auth.cambiaPassword(chi.serve(), attuale, nuova)
    if (!e.ok) return res.status(400).json({ errore: e.errore })
    res.json({ ok: true, token: e.token })
  } catch (e) { errore(res, e) }
})

app.post('/api/conto/esci-ovunque', async (_req, res) => {
  try { res.json({ ok: true, chiuse: await auth.esciOvunque(chi.serve()) }) } catch (e) { errore(res, e) }
})

/**
 * La password di chi è già dentro, per i gesti che non tornano indietro.
 *
 * Passa da `auth.verificaPassword`, che conta i tentativi per conto: chiederla
 * senza contare vorrebbe dire che una sessione rubata può provarle tutte a
 * otto al secondo, e in fondo a quel corridoio c'è la cancellazione del conto.
 */
async function chiediLaPassword(req: express.Request, res: express.Response): Promise<boolean> {
  const v = await auth.verificaPassword(chi.serve(), String(req.body?.password ?? ''))
  if (v.ok) return true
  if (v.attesa > 0) res.status(429).json({ errore: auth.fraTroppi(v.attesa) })
  else res.status(403).json({ errore: 'La password non è corretta.' })
  return false
}

/**
 * Il conto, cancellato.
 *
 * Due cose insieme e non una: la password **e** il proprio indirizzo scritto a
 * mano. La password dice che è lei; l'indirizzo la obbliga a fermarsi un
 * secondo davanti a un gesto che non ha un annulla. Un bottone rosso con
 * «sei sicuro?» si preme per riflesso; ricopiare il proprio indirizzo no.
 */
app.post('/api/conto/cancella', async (req, res) => {
  try {
    const mio = auth.conto()
    const scritto = String(req.body?.email ?? '').trim().toLowerCase()
    if (!mio || scritto !== mio.email.toLowerCase()) {
      return res.status(400).json({ errore: 'Scrivi il tuo indirizzo esattamente com’è, per confermare.' })
    }
    if (!await chiediLaPassword(req, res)) return
    const utente = chi.serve()
    const e = await addio.cancella(utente)
    res.json({ ok: true, ...e })
  } catch (e) { errore(res, e) }
})

/**
 * «Dammi tutto quello che avete su di me», in un file che si legge.
 *
 * Accanto al `.myynd` e non al posto suo: quello serve a spostare
 * un'installazione e contiene le credenziali vere, questo serve a leggere e a
 * inoltrare e le credenziali non ce le ha. Stessa password e stesso freno
 * dell'altro — dentro non ci sono chiavi, ma c'è tutta la posta letta.
 *
 * Si scrive a pezzi mentre esce, invece di costruirlo tutto e poi mandarlo:
 * un indice vero sono decine di migliaia di documenti, e tenerne una seconda
 * copia in memoria vorrebbe dire prendersi la memoria di tutti per il tempo
 * di una richiesta.
 */
app.post('/api/conto/dati', async (req, res) => {
  try {
    if (!await chiediLaPassword(req, res)) return
    const miei = await gettoni.elenco(chi.serve())
    const oggi = new Date().toISOString().slice(0, 10)
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('content-disposition', `attachment; filename="myynd-dati-${oggi}.json"`)
    for (const pezzo of fascicolo.scrivi(miei)) {
      // se il client legge più piano di quanto scriviamo si aspetta, invece di
      // riempire la memoria del processo con quello che non è ancora partito
      if (!res.write(pezzo)) await new Promise(f => res.once('drain', f))
    }
    res.end()
  } catch (e) {
    // a intestazioni già mandate un JSON d'errore non arriverebbe: si tronca,
    // e un JSON troncato si vede subito che è troncato
    if (res.headersSent) res.destroy()
    else errore(res, e)
  }
})

// — i gettoni con un ambito —
//
// Vedi `gettoni.ts`: sono la risposta a un credenziale che una persona incolla
// in una variabile d'ambiente e poi non guarda più. Non scadono, si revocano, e
// arrivano solo dove il loro ambito dice.

app.get('/api/conto/gettoni', async (_req, res) => {
  try { res.json({ gettoni: await gettoni.elenco(chi.serve()), ambiti: gettoni.AMBITI }) }
  catch (e) { errore(res, e) }
})

app.post('/api/conto/gettoni', async (req, res) => {
  try {
    const e = await gettoni.crea(chi.serve(), String(req.body?.nome ?? ''), String(req.body?.ambito ?? 'desktop'))
    if (!e.ok) return res.status(400).json({ errore: e.errore })
    // il gettone in chiaro esce **una volta sola**, adesso: sul database c'è
    // la sua impronta, e da quella non si torna indietro
    res.json({ ok: true, id: e.id, gettone: e.gettone, gettoni: await gettoni.elenco(chi.serve()) })
  } catch (e) { errore(res, e) }
})

app.delete('/api/conto/gettoni/:id', async (req, res) => {
  try {
    const tolto = await gettoni.revoca(chi.serve(), String(req.params.id))
    if (!tolto) return res.status(404).json({ errore: 'Questo gettone non c’è più.' })
    res.json({ ok: true, gettoni: await gettoni.elenco(chi.serve()) })
  } catch (e) { errore(res, e) }
})

app.get('/api/stato', (_req, res) => {
  const c = cfg.leggi()
  const n = store.conteggi()
  res.json({
    // `pubblica()` guarda solo la chiave, perché da lì non si può chiedere a
    // `modello.ts` senza girare in tondo: la risposta vera — chiave *o*
    // abbonamento — si mette qui sopra, dove le due si conoscono entrambe
    config: { ...cfg.pubblica(c), claude: mod.conClaude() ? { collegato: true } : null },
    conteggi: n,
    // quelli che leggono *questa macchina* non si offrono su un server: dentro
    // un contenitore troverebbero una cartella vuota, e chi li prova penserebbe
    // che sia rotto Myynd invece che fuori posto
    // su un server, e senza l'app di chi ospita, il ballo di Google e Microsoft
    // non può girare: la scheda lo dice invece di chiedere un client ID e fallire
    connettori: CATALOGO.filter(v => ospitato.disponibile(v.id)).map(v => ({
      ...v,
      // solo su una scheda che *sarebbe* offerta: se il catalogo la dà già per
      // «arriva presto», la sua nota dice qualcosa di più utile di questa
      ...(v.pronto && ospitato.fermoSulServer(v.id) ? { pronto: false, nota: 'Non ancora disponibile su questo server.' } : {}),
      collegato:
        v.id === 'posta' ? !!c.posta :
        v.id === 'desktop' ? !!c.desktop :
        v.id === 'notion' ? !!c.notion :
        v.id === 'calendario' ? !!c.calendario :
        // la scheda parla di Claude — chiave o abbonamento — e non di «Myynd
        // può ragionare», che da quando c'è un altro fornitore non coincide più
        v.id === 'claude' ? mod.conClaude() :
        // collegato vuol dire «c'è», non «è lui che lavora»: quello lo dice il motore
        v.id === 'compatibile' ? !!c.compatibile :
        v.id === 'google' ? google.collegato() :
        v.id === 'slack' ? slack.collegato(c) :
        v.id === 'drive' ? drive.collegato() :
        v.id === 'microsoft' ? microsoft.collegato('posta') :
        v.id === 'sharepoint' ? microsoft.collegato('file') :
        v.id === 'dropbox' ? dropbox.collegato() :
        v.id === 'whatsapp' ? whatsapp.collegato() :
        // non c'è niente da collegare: è dentro l'app, e c'è finché c'è l'app
        v.id === 'mind2do' ? true : false,
      // i compiti NON si contano come documenti: gonfiavano il totale in alto
      // a ogni cosa aggiunta in lista, e quel numero che cresceva da solo
      // sembrava — giustamente — finto
      documenti: n.perFonte.find(f => f.fonte === v.id)?.n ?? 0
    })),
    // su un server sarebbero le cartelle di root dentro il contenitore: non
    // servono a nessuno, e dicono com'è fatto il server a chiunque sia entrato
    /*
     * Il conto a secco, se risulta.
     *
     * Non è una domanda ad Anthropic — costerebbe una chiamata a ogni apertura
     * di schermata. È quello che si è già scoperto: l'ultima volta che una
     * richiesta è stata respinta per soldi, e non ne è ancora passata una buona.
     * Serve alla schermata per dirlo con un cartellino invece che con una riga
     * rossa dentro una chat, che è dove finora si perdeva.
     */
    credito: mod.mancaIlCredito(),
    suggerimentiDesktop: ospitato.OSPITATO ? [] : desktop.suggerimenti(),
    presetPosta: posta.PRESET,
    home: ospitato.OSPITATO ? '' : homedir(),
    ospitato: ospitato.OSPITATO,
    oauth: ospitato.oauthWeb()
  })
})

/**
 * Cosa scriverebbe negli argomenti, senza scriverlo.
 *
 * Serve al caso in cui quel campo l'ha scritto lei — e allora non si tocca —
 * ma quello che legge dice qualcos'altro. La proposta si mette accanto al
 * campo e si accetta con un dito: è l'unico modo in cui una macchina può
 * correggere quello che hai scritto tu senza toglierti niente.
 *
 * Costa una chiamata al modello più economico, e per questo sta su un bottone
 * invece che sull'apertura della schermata.
 */
app.post('/api/argomenti/proposta', async (_req, res) => {
  try { res.json({ ok: true, argomenti: await gusto.proposta() }) }
  catch (e) { errore(res, e) }
})

app.post('/api/profilo', async (req, res) => {
  // solo i campi davvero presenti: un patch parziale non deve cancellare il resto
  const b = req.body ?? {}
  const patch: Record<string, unknown> = {}
  for (const k of ['nome', 'ruolo', 'tono', 'autonomia', 'onboarding', 'modello', 'lingua', 'oreFatte', 'giro', 'argomenti', 'tetto', 'fuso'] as const) {
    if (b[k] !== undefined) patch[k] = b[k]
  }
  // il fuso è un nome IANA o niente: uno storto farebbe esplodere ogni conto sulle ore
  if (patch.fuso !== undefined && (typeof patch.fuso !== 'string' || !fuso.fusoValido(patch.fuso))) {
    return res.status(400).json({ errore: 'Non conosco questo fuso orario.' })
  }

  /**
   * I valori, non solo i campi.
   *
   * Prima si controllava *quali* chiavi si potevano scrivere e mai *cosa* ci
   * finiva dentro. Così l'interfaccia ha potuto scrivere per mesi tono
   * 'cordiale' e autonomia 'agire' — nomi che il ragionamento non conosce — e
   * il risultato non è stato un errore ma il silenzio: la riga spariva dal
   * prompt e due preferenze su tre non facevano niente.
   *
   * Un valore sconosciuto adesso è un 400. Se le due metà dell'app tornano a
   * divergere, la prima persona che clicca lo scopre subito.
   */
  const ammessi: Record<string, readonly string[]> = {
    // i nomi vecchi si accettano ancora: un client non aggiornato non deve
    // prendere un errore per una parola che sappiamo tradurre
    tono: [...cfg.TONI_VALIDI, 'cordiale'],
    autonomia: [...cfg.AUTONOMIE_VALIDE, 'osservare', 'agire'],
    modello: cfg.MODELLI.map(m => m.id),
    lingua: ['it', 'en']
  }
  for (const [campo, valori] of Object.entries(ammessi)) {
    if (patch[campo] !== undefined && !valori.includes(String(patch[campo]))) {
      return res.status(400).json({ errore: `Non so cosa sia «${String(patch[campo])}» per ${campo}.` })
    }
  }
  if (patch.oreFatte !== undefined) {
    const n = Number(patch.oreFatte)
    if (!Number.isFinite(n) || n < 0 || n > 8760) {
      return res.status(400).json({ errore: 'Le ore devono essere un numero fra 0 e un anno.' })
    }
    patch.oreFatte = n
  }
  if (patch.tetto !== undefined) {
    const n = Math.floor(Number(patch.tetto))
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
      return res.status(400).json({ errore: 'Il tetto è un numero di token al giorno, o zero per nessun tetto.' })
    }
    patch.tetto = n
  }
  // gli argomenti sono una riga, non un tema: un muro di testo davanti a
  // settanta titoli non li sceglie meglio, li sceglie a caso
  if (patch.argomenti !== undefined) {
    patch.argomenti = String(patch.argomenti).trim().slice(0, 400)
    /*
     * Scriverli a mano vuol dire riprenderseli.
     *
     * Da qui in avanti quella riga è sua e Myynd non la tocca più — nemmeno
     * quando quello che legge cambia. È la stessa regola di `ottimizza` sulle
     * automazioni: una cosa che riscrive quello che hai scritto tu, senza che
     * tu l'abbia chiesto, non è un aiuto. Resta la proposta, che si accetta con
     * un dito, e quella non toglie niente a nessuno.
     */
    patch.argomentiDaMe = false
  }

  const prima = cfg.lingua()
  const dopo = cfg.pubblica(cfg.aggiorna(patch))

  // Cambiare lingua non basta a cambiare quello che ti ha già scritto: il feed
  // e le domande stanno nel database nella lingua in cui sono nati. Si aspetta
  // la traduzione prima di rispondere, così quando l'app si ricarica è tutta
  // nella stessa lingua invece che mezza e mezza.
  if (patch.lingua && patch.lingua !== prima) {
    // le righe nate da un'automazione non passano dal modello: la stessa frase
    // nell'altra lingua sta già scritta nella ricetta, basta rimetterla
    try { automazioni.rinominaInLista(String(patch.lingua)) } catch { /* non ferma il resto */ }
    try { await traduci.inLingua(String(patch.lingua)) } catch { /* resta quello che c'era */ }
  }

  res.json(dopo)
})

// — connettori —

/** Da un indirizzo al suo server IMAP, così non lo deve sapere nessuno. */
app.get('/api/connettori/posta/scopri', async (req, res) => {
  try {
    res.json(await posta.scopri(String(req.query.email ?? '')) ?? { host: null })
  } catch { res.json({ host: null }) }
})

/**
 * Il modello che gira su questa macchina.
 *
 * Non è una cosa da fare di nascosto. Se una parte del lavoro smette di passare
 * da Claude, chi usa Myynd ha il diritto di saperlo — e di dire di no. Questa
 * rotta va a guardare *davvero* se c'è qualcosa in ascolto, invece di fidarsi
 * di quello che c'è scritto nel file: chi accende Ollama a metà giornata deve
 * vederlo comparire senza riavviare niente.
 */
/** Quanto ha speso oggi e negli ultimi giorni, e dove sta il tetto. */
app.get('/api/uso', (_req, res) => {
  try {
    res.json({ oggi: mod.usoDiOggi(), giorni: store.usoPerGiorno(14) })
  } catch (e) { errore(res, e) }
})

app.get('/api/modello/locale', async (_req, res) => {
  try { res.json(await mod.statoLocale()) } catch (e) { errore(res, e) }
})

/**
 * Ragionare con il suo abbonamento invece che a consumo.
 *
 * `installato` dice se c'è `claude` su questa macchina, `entrato` se ci è
 * entrato davvero. La seconda si chiede a `claude auth status`, che non parla
 * con nessun modello e non costa un token: è la differenza fra offrire una
 * strada pronta e offrirne una che fallirà al primo lavoro vero.
 */
app.get('/api/modello/abbonamento', async (_req, res) => {
  try { res.json(await abbonamento.stato()) } catch (e) { errore(res, e) }
})

app.post('/api/modello/abbonamento', async (req, res) => {
  if (ospitato.OSPITATO) {
    return res.status(400).json({ errore: 'Su un server l’abbonamento non si può usare: qui ragiona con una chiave API.' })
  }
  const attivo = req.body?.attivo === true
  // le due scritture stanno insieme: `claudeCon` è quella che conta, `attivo`
  // resta per chi legge una configurazione vecchia senza sapere della scelta
  cfg.aggiorna({ abbonamento: { attivo }, claudeCon: attivo ? 'abbonamento' : 'chiave' })
  try { res.json({ ok: true, ...await abbonamento.stato() }) } catch (e) { errore(res, e) }
})

/**
 * Con quale dei due si paga Claude.
 *
 * Sono due strade per lo stesso modello, non due modelli: l'abbonamento che uno
 * paga già, e la chiave a consumo. Si collegano tutt'e due, si sceglie quale
 * lavora, e si cambia idea quando si vuole — è la stessa richiesta di
 * `/api/modello/motore`, un piano più sotto.
 *
 * Si può scegliere anche quella che adesso non è pronta: chi collega la chiave
 * stasera e farà l'accesso a Claude Code domani deve poterlo dire stasera. Cosa
 * manca lo dice `/api/modello/claude`, e la scheda lo scrive.
 */
app.post('/api/modello/claude-con', async (req, res) => {
  const con = String(req.body?.con ?? '')
  if (con !== 'abbonamento' && con !== 'chiave') {
    return res.status(400).json({ errore: 'Non so con quale dei due far lavorare Claude.' })
  }
  if (con === 'abbonamento' && ospitato.OSPITATO) {
    return res.status(400).json({ errore: 'Su un server l’abbonamento non si può usare: qui ragiona con una chiave API.' })
  }
  cfg.aggiorna({ claudeCon: con, abbonamento: { attivo: con === 'abbonamento' } })
  try { res.json({ ok: true, con, ...await abbonamento.stato() }) } catch (e) { errore(res, e) }
})

/**
 * Le due strade di Claude, com'è messa ciascuna.
 *
 * La schermata deve mostrarle tutt'e due insieme — quella scelta e l'altra —
 * con lo stato vero di ognuna, o non si capisce cosa succede girando
 * l'interruttore. `abbonamento.utilizzabile()` esiste per questo: `pronto()`
 * risponderebbe no a una strada che funziona benissimo, solo perché non è
 * quella scelta adesso.
 */
app.get('/api/modello/claude', async (_req, res) => {
  const c = cfg.leggi()
  try {
    res.json({
      con: c.claudeCon ?? (c.abbonamento?.attivo === true ? 'abbonamento' : 'chiave'),
      // ospitati l'abbonamento non esiste: la scheda mostra solo la chiave
      abbonamentoPossibile: !ospitato.OSPITATO,
      abbonamento: await abbonamento.stato(),
      chiave: { collegata: !!c.claude?.apiKey }
    })
  } catch (e) { errore(res, e) }
})

app.post('/api/modello/locale', (req, res) => {
  const attivo = req.body?.attivo !== false
  const c = cfg.leggi()
  cfg.aggiorna({ locale: { ...(c.locale ?? {}), attivo } })
  res.json({ ok: true, attivo })
})

/** La chiave di Claude può già essere nell'ambiente: se c'è, un clic basta. */
app.get('/api/connettori/claude/ambiente', (_req, res) => {
  // su un server la chiave nell'ambiente è di chi ospita, non di chi è
  // entrato: non si offre e non si copia dentro il suo conto
  res.json({ presente: !ospitato.OSPITATO && !!process.env.ANTHROPIC_API_KEY })
})

app.post('/api/connettori/claude/ambiente', async (_req, res) => {
  const k = ospitato.OSPITATO ? undefined : process.env.ANTHROPIC_API_KEY
  if (!k) return res.status(400).json({ errore: 'Nessuna chiave nell\'ambiente.' })
  const e = await claude.prova(k)
  if (!e.ok) return res.status(400).json({ errore: e.errore })
  cfg.aggiorna({ claude: { apiKey: k } })
  res.json({ ok: true, ...(e.avviso ? { avviso: e.avviso } : {}), ...(e.dettaglio ? { dettaglio: e.dettaglio } : {}) })
})

/** «Ho capito»: il cartellino del credito si chiude finché non ricapita. */
app.post('/api/credito/visto', (_req, res) => {
  mod.scordaIlCredito()
  res.json({ ok: true })
})

app.post('/api/connettori/posta', async (req, res) => {
  const { host, porta, utente, password, giorni, cartelle } = req.body ?? {}
  if (!host || !utente || !password) return res.status(400).json({ errore: 'Servono host, indirizzo e password.' })
  if (!ospitato.hostRaggiungibile(String(host))) return res.status(400).json({ errore: 'Quell’host non si può raggiungere da qui.' })
  const portaScelta = Number(porta) || 993
  // su un server anche la porta fa parte di «dove bussare»: IMAP sta su 993 o
  // 143, e un'altra porta è un servizio interno di chi ospita — la stessa
  // regola che `trasloco.ts` applica a un pacco importato
  if (ospitato.OSPITATO && ![993, 143].includes(portaScelta)) {
    return res.status(400).json({ errore: 'Su un server la posta si legge solo sulle porte 993 o 143.' })
  }
  // e il nome si risolve prima di collegarsi: un nome pubblico può puntare
  // alla rete interna, e il controllo sulla stringa non lo vede
  if (!(await ospitato.hostRaggiungibileDavvero(String(host)))) {
    return res.status(400).json({ errore: 'Quell’host non si può raggiungere da qui.' })
  }
  // gli spazi con cui Google mostra la password per le app non fanno parte
  // della password: toglierli qui evita un «utente o password non accettati»
  // che non è vero e che non si può indovinare
  const c: cfg.ConfigPosta = {
    host, porta: portaScelta, utente,
    password: posta.normalizza(String(password), String(host)),
    giorni: Number(giorni) || 30, cartelle
  }
  try {
    const esito = await posta.prova(c)
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ posta: c })
    res.json({ ok: true, cartelle: esito.cartelle, certificatoAdattato: esito.certificatoAdattato })
  } catch (e) { errore(res, e) }
})

app.post('/api/connettori/desktop', async (req, res) => {
  /*
   * Un percorso è sempre e solo un percorso *del server*.
   *
   * `ospitato.disponibile('desktop')` non basta più qui: il connettore nel
   * suo insieme è offerto anche ospitati, dalla scheda che chiede al browser
   * una cartella — ma questa rotta è quella vecchia, quella che chiede *un
   * percorso*, e un percorso scritto qui non è mai una cartella di chi la
   * scrive: è sempre una cartella del server. `/etc`, la cartella dei dati —
   * provato, rispondeva «ok». Quindi qui si guarda `OSPITATO` direttamente,
   * non il catalogo.
   */
  if (ospitato.OSPITATO) {
    return res.status(400).json({ errore: 'Su un server non ci sono cartelle da leggere: le fonti sono quelle collegate in rete.' })
  }
  const cartelle: string[] = req.body?.cartelle ?? []
  if (!cartelle.length) return res.status(400).json({ errore: 'Scegli almeno una cartella.' })
  try {
    const esito = await desktop.prova({ cartelle })
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ desktop: { cartelle: esito.cartelle } })
    res.json({ ok: true, cartelle: esito.cartelle })
  } catch (e) { errore(res, e) }
})

/**
 * Il desktop, spinto da fuori — non letto qui.
 *
 * Questa rotta esiste apposta *per* un server: quello che riceve l'ha già
 * letto un Myynd in casa, con `MYYND_DESKTOP_REMOTO` puntata qui — vedi
 * `connettori/desktopRemoto.ts`. Per questo non passa da
 * `ospitato.disponibile('desktop')`: quel controllo dice «non c'è niente da
 * *sfogliare* qui», e qui non si sfoglia niente, si riceve.
 *
 * Fonte e gruppo li decide questa rotta, non chi manda: sono la chiave con
 * cui `riconcilia()` sa cosa toccare, e fidarsi di un valore arrivato da fuori
 * vorrebbe dire lasciare che una richiesta imprevista cancelli documenti di
 * un'altra fonte. Chi può chiamarla è già dentro la guardia — lo stesso
 * token di sempre — quindi questi documenti finiscono nell'indice di chi ha
 * mandato la richiesta e di nessun altro.
 */
app.post('/api/connettori/desktop/carica', async (req, res) => {
  const grezzi: unknown[] = Array.isArray(req.body?.docs) ? req.body.docs : []
  const docs: store.Documento[] = grezzi
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .map(d => ({
      id: String(d.id ?? ''),
      fonte: 'desktop',
      tipo: String(d.tipo ?? 'testo'),
      titolo: String(d.titolo ?? ''),
      corpo: String(d.corpo ?? ''),
      autore: d.autore == null ? null : String(d.autore),
      percorso: d.percorso == null ? null : String(d.percorso),
      quando: d.quando == null ? null : String(d.quando),
      gruppo: 'documenti'
    }))
  /*
   * Gli id li scrive il lettore in casa, ma la forma è nostra. Un id fuori
   * dal prefisso `desktop:` finirebbe sopra un documento di un'altra fonte —
   * e `riconcilia` non lo toglierebbe mai, perché guarda solo la sua. Una
   * radice vuota o relativa farebbe cancellare quello che non ha mai visto:
   * `''` è prefisso di tutto.
   */
  if (docs.some(d => !d.id.startsWith('desktop:'))) {
    return res.status(400).json({ errore: 'Gli id dei documenti del desktop cominciano con «desktop:».' })
  }
  const complete: string[] = Array.isArray(req.body?.complete) ? req.body.complete.map(String) : []
  if (complete.some(r => !r.trim() || !r.startsWith('/'))) {
    return res.status(400).json({ errore: 'Le cartelle lette fino in fondo vanno indicate con un percorso assoluto.' })
  }
  const visti: string[] = Array.isArray(req.body?.visti) ? req.body.visti.map(String) : []
  // senza titolo non si indicizza, ma l'id conta comunque come visto
  const buoni = docs.filter(d => d.titolo)
  try {
    await store.salvaDocumentiAPezzi(buoni)
    const tolti = store.riconcilia('desktop', { completo: !!complete.length, radiciViste: complete },
      [...docs.map(d => d.id), ...visti])
    // ospitati, la scheda «Desktop» si accende da qui: il server non legge
    // nessuna cartella (vedi `leggiTutto`), ma quello che il Mac ha spinto è
    // collegato a tutti gli effetti, e senza questa riga l'app diceva «non hai
    // collegato niente» con i documenti già dentro
    if (ospitato.OSPITATO && complete.length) {
      const c = cfg.leggi()
      const radici = [...new Set([...(c.desktop?.cartelle ?? []), ...complete])]
      if (radici.length !== (c.desktop?.cartelle ?? []).length) cfg.aggiorna({ desktop: { ...(c.desktop ?? {}), cartelle: radici } })
    }
    res.json({ ok: true, documenti: buoni.length, tolti })
  } catch (e) { errore(res, e) }
})

/**
 * Il desktop, scelto nel browser — senza installare niente.
 *
 * Un server ospitato non può leggere le tue cartelle, ma un browser sì: chi
 * preme «scegli una cartella» ottiene il selettore vero del sistema, e da lì
 * in avanti è la pagina — non il server — a leggere i file e a spedirli qui,
 * un pezzo alla volta. Quello che arriva è testo, non documenti già letti:
 * l'estrazione da PDF e Word (`estrai.daBuffer`) gira su questi byte esattamente
 * come girerebbe su un file aperto dal disco — è la stessa funzione, e non
 * poteva che esserlo, o un PDF letto da qui e uno letto in casa avrebbero
 * raccontato due mondi diversi dello stesso file.
 *
 * `radice` è il nome della cartella scelta, non un percorso: sul disco di chi
 * ha caricato non esiste nessun `/Users/...` che il server possa verificare, e
 * non ne serve uno — `radice` serve solo a `riconcilia`, per sapere quali id
 * appartengono a *questo* giro e quali a un altro caricamento fatto ieri.
 */
app.post('/api/connettori/desktop/carica-file', async (req, res) => {
  const grezzi: unknown[] = Array.isArray(req.body?.file) ? req.body.file : []
  const radice = String(req.body?.radice ?? '').trim()
  const completo = !!req.body?.completo
  const visti: string[] = Array.isArray(req.body?.visti) ? req.body.visti.map(String) : []

  const docs: store.Documento[] = []
  for (const grezzo of grezzi) {
    if (!grezzo || typeof grezzo !== 'object') continue
    const f = grezzo as Record<string, unknown>
    const percorso = String(f.percorso ?? '')
    const nome = percorso.split('/').pop() ?? percorso
    if (!percorso || !estrai.leggibile(nome)) continue

    let buf: Buffer
    try { buf = Buffer.from(String(f.base64 ?? ''), 'base64') } catch { continue }
    // stesso tetto della lettura in casa: un file più grande di dodici mega
    // è quasi sempre un video o un archivio finito nella cartella sbagliata
    if (!buf.length || buf.length > 12_000_000) continue

    try {
      const corpo = (await estrai.daBuffer(buf, nome)).slice(0, 20_000)
      if (corpo.length < 20) continue
      const quando = typeof f.quando === 'number' ? new Date(f.quando).toISOString() : null
      docs.push({
        id: `desktop:${percorso}`, fonte: 'desktop', tipo: estrai.tipoDi(nome),
        titolo: nome, corpo, autore: null, percorso, quando, gruppo: 'documenti'
      })
    } catch { /* un file che non si estrae non ferma gli altri */ }
  }

  try {
    await store.salvaDocumentiAPezzi(docs)
    const tolti = store.riconcilia('desktop', { completo, radiciViste: radice ? [radice] : [] },
      [...docs.map(d => d.id), ...visti])
    /*
     * E il desktop risulta collegato. `/api/stato` guarda `cfg.desktop`, e
     * senza questa riga l'indice si riempiva mentre la scheda diceva ancora
     * «da collegare» e il primo avvio non andava avanti. La radice è il nome
     * della cartella scelta, non un percorso: nessuno la percorre, perché su
     * un server `leggiTutto` il desktop lo salta — arriva da qui, non dal disco.
     */
    if (radice) {
      const c = cfg.leggi()
      const cartelle = c.desktop?.cartelle ?? []
      if (!cartelle.includes(radice)) cfg.aggiorna({ desktop: { ...(c.desktop ?? {}), cartelle: [...cartelle, radice] } })
    }
    res.json({ ok: true, documenti: docs.length, tolti })
  } catch (e) { errore(res, e) }
})

app.post('/api/connettori/notion', async (req, res) => {
  const token: string = req.body?.token ?? ''
  if (!token) return res.status(400).json({ errore: 'Serve il token di integrazione.' })
  try {
    const esito = await notion.prova({ token })
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ notion: { token } })
    res.json({ ok: true, pagine: esito.pagine })
  } catch (e) { errore(res, e) }
})

/**
 * Il calendario: un indirizzo, e basta.
 *
 * La prova è già una lettura vera — si scarica il file e si contano gli eventi
 * — perché su questa fonte «collegato» e «funziona» sono la stessa cosa, e
 * perché il numero che torna è l'unica conferma che chi incolla può capire:
 * «142 eventi» vuol dire che ha copiato il link giusto.
 */
app.post('/api/connettori/calendario', async (req, res) => {
  const url: string = req.body?.url ?? ''
  const nome: string = req.body?.nome ?? ''
  const giorni = Number(req.body?.giorni) || 30
  if (!url.trim()) return res.status(400).json({ errore: 'Serve l’indirizzo del calendario.' })
  try {
    const c: cfg.ConfigCalendario = { url: url.trim(), nome: nome.trim() || undefined, giorni }
    const esito = await calendario.prova(c)
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ calendario: { ...c, nome: esito.nome || undefined } })
    res.json({ ok: true, nome: esito.nome, eventi: esito.eventi })
  } catch (e) { errore(res, e) }
})

app.post('/api/connettori/claude', async (req, res) => {
  const apiKey: string = req.body?.apiKey ?? ''
  if (!apiKey) return res.status(400).json({ errore: 'Serve la chiave API.' })
  try {
    const esito = await claude.prova(apiKey)
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ claude: { apiKey } })
    // `avviso` è una frase nostra e passa dal dizionario; `dettaglio` è la frase
    // di Anthropic, e va riportata com'è — è quella che dice cosa fare
    res.json({ ok: true, ...(esito.avviso ? { avviso: esito.avviso } : {}), ...(esito.dettaglio ? { dettaglio: esito.dettaglio } : {}) })
  } catch (e) { errore(res, e) }
})

/**
 * Un fornitore compatibile con OpenAI al posto di Claude, per il lavoro grosso.
 *
 * Si prova prima di scrivere, come per tutti gli altri: un token basta a
 * scoprire chiave, modello e indirizzo sbagliati mentre la persona ha ancora
 * le mani sulla tastiera. E collegarlo lo *sceglie* anche come motore — è per
 * quello che lo si collega — mentre scollegarlo rimette Claude: la scelta e il
 * collegamento vanno insieme, e la schermata delle preferenze dice sempre
 * quale dei due sta lavorando.
 *
 * L'indirizzo passa da `indirizzoAmmesso`: `http` solo verso questa macchina o
 * la rete di casa, e su un server nemmeno quella. Non è pignoleria: un URL
 * scritto da una persona che il server va a chiamare è la definizione di una
 * porta aperta verso dentro, e va tenuta stretta.
 */
app.post('/api/connettori/compatibile', async (req, res) => {
  const url = compatibile.base(String(req.body?.url ?? ''))
  const chiave = String(req.body?.chiave ?? '').trim()
  const modello = String(req.body?.modello ?? '').trim()
  const nome = String(req.body?.nome ?? '').trim()
  if (!url || !modello) return res.status(400).json({ errore: 'Servono l’indirizzo e il nome del modello.' })
  const perche = compatibile.indirizzoAmmesso(url, ospitato.OSPITATO)
  if (perche) return res.status(400).json({ errore: perche })
  const f: compatibile.Fornitore = {
    url, modello,
    ...(chiave ? { chiave } : {}),
    ...(nome ? { nome } : {})
  }
  try {
    const esito = await compatibile.prova(f)
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ compatibile: f, motore: 'compatibile' })
    res.json({ ok: true, motore: 'compatibile' })
  } catch (e) { errore(res, e) }
})

/** I modelli che il fornitore dice di avere, per il menu del modulo. Vuoto se non risponde. */
// POST perché porta una chiave: nell'indirizzo finirebbe nei registri
app.post('/api/connettori/compatibile/modelli', async (req, res) => {
  const url = compatibile.base(String(req.body?.url ?? ''))
  const chiave = String(req.body?.chiave ?? '').trim()
  if (!url || compatibile.indirizzoAmmesso(url, ospitato.OSPITATO)) return res.json({ modelli: [] })
  res.json({ modelli: await compatibile.modelli({ url, ...(chiave ? { chiave } : {}) }) })
})

/**
 * Chi fa il lavoro grosso: Claude, o il fornitore collegato.
 *
 * Si può scegliere il fornitore solo se c'è: una scelta senza niente dietro
 * si rifiuta qui, invece di lasciare che ogni chiamata vada a vuoto.
 */
app.post('/api/modello/motore', (req, res) => {
  const scelto = req.body?.motore === 'compatibile' ? 'compatibile' : 'claude'
  if (scelto === 'compatibile' && !cfg.leggi().compatibile) {
    return res.status(400).json({ errore: 'Prima collega un fornitore compatibile.' })
  }
  cfg.aggiorna({ motore: scelto })
  res.json({ ok: true, motore: scelto })
})

/**
 * Google: si apre il browser e si aspetta il sì.
 *
 * La chiamata resta appesa finché la persona non ha finito di dire di sì a
 * Google — fino a due minuti. È voluto: la finestra che si è aperta e questa
 * risposta sono la stessa cosa, e far tornare subito un «ok, controlla dopo»
 * vorrebbe dire un'interfaccia che non sa mai se è collegata.
 */
app.post('/api/connettori/google', async (req, res) => {
  const clientId: string = String(req.body?.clientId ?? '').trim()
  const clientSecret: string = String(req.body?.clientSecret ?? '').trim()
  if (!clientId) return res.status(400).json({ errore: 'Serve il client ID di Google.' })
  try {
    const { email } = await google.collega(clientId, clientSecret || undefined)
    res.json({ ok: true, email })
  } catch (e) { errore(res, e) }
})

/**
 * Slack: si prova il token prima di scriverlo.
 *
 * Provarlo non è cortesia: un token sbagliato scritto nel file dà una fonte
 * che resta a zero e un errore che compare solo alla prima rilettura
 * automatica, cioè fra sei ore, nel terminale, dove non guarda nessuno. Qui
 * invece il no arriva mentre la persona ha ancora le mani sulla tastiera.
 */
app.post('/api/connettori/slack', async (req, res) => {
  const token: string = String(req.body?.token ?? '').trim()
  if (!token) return res.status(400).json({ errore: 'Serve il token di Slack.' })
  try {
    const e = await slack.prova({ token })
    if (!e.ok) return res.status(400).json({ errore: e.errore })
    cfg.aggiorna({ slack: { token, squadra: e.squadra, utente: e.utente, giorni: 30 } })
    res.json({ ok: true, squadra: e.squadra })
  } catch (e) { errore(res, e) }
})

/**
 * Google Drive: lo stesso ballo di Gmail, un consenso diverso.
 *
 * Il client id si può riusare — è lo stesso progetto su Google Cloud — e
 * infatti l'interfaccia lo propone già scritto se Gmail è collegato. Quello
 * che non si riusa è il *sì*: quello si chiede di nuovo, perché riguarda i
 * file e non la posta.
 */
/**
 * Il primo tempo del ballo, via web: torna l'indirizzo, e il browser della
 * persona ci va. Ospitati soltanto — in casa il ballo passa da 127.0.0.1 e
 * l'app è la sua.
 */
function partiPerIlConsenso(res: express.Response, a: { dove: string; biglietto: string }) {
  consegnaIlBiglietto(res, a.biglietto)
  res.json({ dove: a.dove })
}
app.post('/api/connettori/google/avvia', (_req, res) => {
  try { partiPerIlConsenso(res, google.avvia()) } catch (e) { errore(res, e, 400) }
})
app.post('/api/connettori/drive/avvia', (_req, res) => {
  try { partiPerIlConsenso(res, drive.avvia()) } catch (e) { errore(res, e, 400) }
})
app.post('/api/connettori/microsoft/avvia', (req, res) => {
  const parte = String(req.body?.parte ?? 'posta')
  if (parte !== 'posta' && parte !== 'file') return res.status(400).json({ errore: 'Non so cosa collegare di Microsoft.' })
  try { partiPerIlConsenso(res, microsoft.avvia(parte)) } catch (e) { errore(res, e, 400) }
})

app.post('/api/connettori/drive', async (req, res) => {
  const clientId = String(req.body?.clientId ?? '').trim()
  const clientSecret = String(req.body?.clientSecret ?? '').trim()
  if (!clientId) return res.status(400).json({ errore: 'Serve il client ID di Google.' })
  try {
    const { email } = await drive.collega(clientId, clientSecret || undefined)
    res.json({ ok: true, email })
  } catch (e) { errore(res, e) }
})

/**
 * Microsoft: una registrazione, due metà.
 *
 * `parte` dice quale si sta collegando — `posta` per Outlook e l'agenda,
 * `file` per SharePoint e OneDrive — e il modulo chiede a Microsoft il
 * consenso per quella *più* quelle già concesse. L'unione è il punto: chiedere
 * solo la metà nuova tornerebbe un token che ha perso l'altra, e romperebbe un
 * collegamento che funzionava.
 */
app.post('/api/connettori/microsoft', async (req, res) => {
  const clientId = String(req.body?.clientId ?? '').trim()
  const tenant = String(req.body?.tenant ?? '').trim()
  const parte = String(req.body?.parte ?? 'posta')
  if (parte !== 'posta' && parte !== 'file') {
    return res.status(400).json({ errore: 'Non so cosa collegare di Microsoft.' })
  }
  if (!clientId) return res.status(400).json({ errore: 'Serve l\u2019ID applicazione di Entra ID.' })
  try {
    const { email } = await microsoft.collega(clientId, tenant, parte)
    res.json({ ok: true, email, parti: microsoft.parti() })
  } catch (e) { errore(res, e) }
})

/**
 * Dropbox, primo tempo: apre il browser e torna l'indirizzo.
 *
 * L'indirizzo torna anche a chi ha già visto aprirsi la finestra, e non è una
 * ridondanza: se il browser non si apre — succede, su una macchina senza
 * predefinito — quello è l'unico modo per andare avanti invece di restare
 * davanti a un bottone che sembra rotto.
 */
app.post('/api/connettori/dropbox/inizia', async (req, res) => {
  try {
    res.json({ ok: true, ...await dropbox.inizia(String(req.body?.chiave ?? '')) })
  } catch (e) { errore(res, e, 400) }
})

/** Dropbox, secondo tempo: il codice che ha scritto sullo schermo. */
app.post('/api/connettori/dropbox', async (req, res) => {
  try {
    const { conto } = await dropbox.finisci(String(req.body?.codice ?? ''))
    res.json({ ok: true, conto })
  } catch (e) { errore(res, e, 400) }
})

/**
 * WhatsApp Business: si prova il numero prima di scrivere il resto.
 *
 * Quattro campi, e uno di quelli — il segreto — non serve a parlare con Meta:
 * serve a **difendere l'indirizzo pubblico** da cui entreranno i messaggi. Per
 * questo `prova` lo rifiuta se manca, invece di lasciarlo vuoto e lasciare
 * aperta una porta che accetta qualunque cosa.
 */
app.post('/api/connettori/whatsapp', async (req, res) => {
  const c = {
    token: String(req.body?.token ?? '').trim(),
    numero: String(req.body?.numero ?? '').trim(),
    segreto: String(req.body?.segreto ?? '').trim(),
    parola: String(req.body?.parola ?? '').trim()
  }
  if (!c.parola) return res.status(400).json({ errore: 'Serve una parola d\u2019ordine: la riscriverai su Meta.' })
  try {
    const e = await whatsapp.prova(c)
    if (!e.ok) return res.status(400).json({ errore: e.errore })
    cfg.aggiorna({ whatsapp: { ...c, etichetta: e.etichetta, arrivati: 0 } })
    res.json({ ok: true, etichetta: e.etichetta })
  } catch (e) { errore(res, e) }
})

app.delete('/api/connettori/:id', (req, res) => {
  const id = req.params.id
  const c = cfg.leggi()
  if (id === 'posta') delete c.posta
  else if (id === 'desktop') delete c.desktop
  else if (id === 'notion') delete c.notion
  else if (id === 'calendario') delete c.calendario
  /*
    «Scollega» su Claude vuol dire che Myynd deve smettere di ragionare, e da
    quando le strade sono due toglierne una sola non lo fa: chi ha collegato il
    suo abbonamento e nessuna chiave premerebbe il bottone e vedrebbe la scheda
    restare collegata — perché `collegato()` guarda anche l'abbonamento, ed è
    giusto che lo guardi. Si spengono tutte e due. Per spegnere solo
    l'abbonamento e tenere la chiave c'è l'interruttore nelle preferenze, che è
    il posto dove quella distinzione ha senso.
  */
  else if (id === 'claude') { delete c.claude; c.abbonamento = { attivo: false } }
  // via il fornitore, e via anche la scelta: il lavoro grosso torna a Claude
  else if (id === 'compatibile') { delete c.compatibile; delete c.motore }
  else if (id === 'google') { delete c.google; google.scordaIlToken() }
  else if (id === 'slack') delete c.slack
  else if (id === 'drive') { delete c.drive; drive.scordaIlToken() }
  else if (id === 'dropbox') { delete c.dropbox; dropbox.scordaIlToken() }
  else if (id === 'whatsapp') delete c.whatsapp
  /*
    Le due metà di Microsoft si staccano una per volta, e non passano di qui:
    `scollega` sa che quando resta l'altra il token va tenuto. Scriverle in
    questa catena avrebbe voluto dire che staccare SharePoint spegneva Outlook
    — un collegamento che ne rompe un altro, senza dirlo.
  */
  else if (id === 'microsoft' || id === 'sharepoint') {
    microsoft.scollega(id === 'microsoft' ? 'posta' : 'file')
    store.svuotaFonte(id)
    return res.json({ ok: true })
  }
  else return res.status(400).json({ errore: 'Connettore sconosciuto.' })
  cfg.scrivi(c)
  if (id !== 'claude' && id !== 'compatibile') store.svuotaFonte(id)
  res.json({ ok: true })
})

// — sincronizzazione, in streaming —

/*
 * Chi sta leggendo le sue fonti adesso. Un solo booleano per tutto il server
 * voleva dire che mentre A leggeva la posta, B riceveva «sto già leggendo» e
 * il suo giro di sfondo veniva saltato: per persona, come tutto il resto.
 */
const sincronizzazioniInCorso = new Set<string>()
const sincronizzazioneInCorso = () => sincronizzazioniInCorso.has(chi.adesso() ?? '')

/**
 * Rileggere le fonti. Una funzione sola, usata da due strade.
 *
 * Prima stava tutta dentro la rotta, quindi l'unico modo di far rileggere le
 * fonti era che qualcuno premesse un bottone. Ma un cervello che si aggiorna
 * solo quando glielo chiedi è un cervello che è quasi sempre indietro — e il
 * brief è netto su questo: deve migliorare da solo, senza che nessuno gli dia
 * da mangiare.
 */
async function leggiTutto(
  soloFonte: string | null,
  avvisa: (d: unknown) => void,
  fermo: () => boolean = () => false
): Promise<number> {
  const c = cfg.leggi()
  let totale = 0

  /*
   * Ogni fonte per conto suo.
   *
   * Prima solo il calendario stava dentro un try: un token di Slack scaduto
   * fermava la lettura lì, e Drive, SharePoint e Dropbox — che vengono dopo —
   * restavano indietro per sei ore senza che nessuno l'avesse chiesto. Il
   * guaio si dice, con la fonte accanto, e si passa alla successiva; il totale
   * conta solo quello che è arrivato davvero.
   */
  const fonte = async (nome: string, leggi: () => Promise<number>) => {
    if (fermo() || (soloFonte && soloFonte !== nome)) return
    try {
      totale += await leggi()
    } catch (err) {
      avvisa({ fase: nome, stato: 'guaio', errore: err instanceof Error ? err.message : String(err) })
    }
  }

  // su un server il desktop non si legge da qui: arriva dal browser o da un
  // Myynd in casa, e le «cartelle» in configurazione sono nomi, non percorsi
  const desk = c.desktop
  if (desk && !ospitato.OSPITATO) await fonte('desktop', async () => {
    avvisa({ fase: 'desktop', stato: 'apro le cartelle' })
    const e = await desktop.sincronizza(desk, n => avvisa({ fase: 'desktop', stato: `${n} documenti`, fatti: n }))
    await store.salvaDocumentiAPezzi(e.docs)
    // si cancella solo dalle radici percorse fino in fondo: altrove il
    // silenzio non prova niente
    // gli id visti contano quanto quelli indicizzati: un file che c'è ma che
    // non abbiamo riletto non è un file cancellato
    const tolti = store.riconcilia('desktop', { completo: !!e.complete.length, radiciViste: e.complete },
      [...e.docs.map(d => d.id), ...e.visti])
    avvisa({
      fase: 'desktop', stato: 'fatto', documenti: e.docs.length,
      saltati: e.saltatiProgetti.length, falliti: e.falliti,
      illeggibili: e.illeggibili, troncato: e.troncato, tolti
    })
    // Verso un server ospitato, se qualcuno l'ha impostato: la stessa lettura
    // appena fatta, mandata anche là. Un guaio qui non deve fermare le altre
    // fonti — la posta non aspetta che il desktop sia arrivato a destinazione.
    if (desktopRemoto.ATTIVO) {
      try {
        const spinto = await desktopRemoto.spingi(e)
        if (spinto) avvisa({ fase: 'desktop-remoto', stato: 'fatto', documenti: spinto.documenti, tolti: spinto.tolti })
      } catch (err) {
        avvisa({ fase: 'desktop-remoto', stato: 'guaio', errore: err instanceof Error ? err.message : String(err) })
      }
    }
    return e.docs.length
  })
  const ntn = c.notion
  if (ntn) await fonte('notion', async () => {
    avvisa({ fase: 'notion', stato: 'leggo le pagine' })
    const e = await notion.sincronizza(ntn)
    await store.salvaDocumentiAPezzi(e.docs)
    const tolti = store.riconcilia('notion', { completo: !e.interrotto },
      [...e.docs.map(d => d.id), ...e.visti])
    avvisa({ fase: 'notion', stato: 'fatto', documenti: e.docs.length, parziali: e.parziali, interrotto: e.interrotto, tolti, invariate: e.invariate, resto: e.resto })
    return e.docs.length
  })
  const cal = c.calendario
  if (cal) await fonte('calendario', async () => {
    avvisa({ fase: 'calendario', stato: 'apro l’agenda' })
    const e = await calendario.sincronizza(cal)
    await store.salvaDocumentiAPezzi(e.docs)
    /*
      Si riconcilia, ed è il caso in cui serve di più: un impegno spostato o
      annullato deve *sparire*, altrimenti Myynd continua a ragionare su una
      riunione che non c'è più — che è peggio che non saperne niente. Il file
      iCal è sempre completo, quindi quello che non c'è dentro non c'è.
    */
    const tolti = store.riconcilia('calendario', { completo: !e.troncato }, e.docs.map(d => d.id))
    avvisa({ fase: 'calendario', stato: 'fatto', documenti: e.docs.length, troncato: e.troncato, tolti })
    return e.docs.length
  })
  const pst = c.posta
  if (pst) await fonte('posta', async () => {
    avvisa({ fase: 'posta', stato: 'mi collego alla casella' })
    // gli uid già nell'indice, cartella per cartella: quelli non si riscaricano
    const giaIndicizzati = (cartella: string) => new Set(
      store.idsConPrefisso(`posta:${cartella}:`).map(id => Number(id.slice(id.lastIndexOf(':') + 1))).filter(n => n > 0)
    )
    const e = await posta.sincronizza(pst, (fatti, tot) =>
      avvisa({ fase: 'posta', stato: `${fatti} di ${tot} messaggi`, fatti, tot }), giaIndicizzati)
    await store.salvaDocumentiAPezzi(e.docs)
    /*
     * Quello che sul server non c'è più esce anche da qui.
     *
     * Finora nessuno riconciliava la posta: un messaggio cancellato o spostato
     * restava nell'indice per sempre, veniva citato in una risposta, e
     * alimentava le proposte di archiviazione — cioè Myynd proponeva di mettere
     * via una cosa che non esisteva. Si tocca solo dentro le finestre che
     * `sincronizza` dichiara lette fino in fondo: una cartella che ha fallito,
     * o che si è fermata al tetto, non ne produce nessuna, e lì non si cancella
     * niente. Sbagliare per eccesso qui vuol dire buttare via la posta di
     * qualcuno.
     */
    const tolti = store.riconciliaPosta(e.finestre, [...e.docs.map(d => d.id), ...e.visti])
    // l'UIDVALIDITY vista si conserva: è quello che rende possibile saltare la prossima volta
    if (JSON.stringify(e.validita) !== JSON.stringify(pst.validita ?? {})) {
      cfg.aggiorna({ posta: { ...pst, validita: e.validita } })
    }
    avvisa({
      fase: 'posta', stato: 'fatto', documenti: e.docs.length, giaLetti: e.saltati, tolti,
      cartelleFallite: e.cartelleFallite, troncato: e.troncato, resto: e.resto
    })
    return e.docs.length
  })
  const ggl = c.google
  if (ggl) await fonte('google', async () => {
    avvisa({ fase: 'google', stato: 'mi collego alla casella' })
    const e = await google.sincronizza(ggl, (fatti, tot) =>
      avvisa({ fase: 'google', stato: `${fatti} di ${tot} messaggi`, fatti, tot }))
    await store.salvaDocumentiAPezzi(e.docs)
    avvisa({ fase: 'google', stato: 'fatto', documenti: e.docs.length, troncato: e.troncato })
    return e.docs.length
  })
  const ms = c.microsoft
  if (ms?.parti.includes('posta')) await fonte('microsoft', async () => {
    avvisa({ fase: 'microsoft', stato: 'mi collego alla casella' })
    const e = await microsoft.sincronizzaPosta(ms, (fatti, tot) =>
      avvisa({ fase: 'microsoft', stato: `${fatti} di ${tot} messaggi`, fatti, tot }))
    await store.salvaDocumentiAPezzi(e.docs)
    avvisa({ fase: 'microsoft', stato: 'fatto', documenti: e.docs.length, troncato: e.troncato })
    return e.docs.length
  })
  const slk = c.slack
  if (slk) await fonte('slack', async () => {
    avvisa({ fase: 'slack', stato: 'apro le conversazioni' })
    const e = await slack.sincronizza(slk, (fatti, tot) =>
      avvisa({ fase: 'slack', stato: `${fatti} di ${tot} canali` }))
    await store.salvaDocumentiAPezzi(e.docs)
    /*
      Si riconcilia solo se nessun canale è caduto e non si è toccato il tetto.
      Un canale che non risponde non prova che le sue conversazioni siano
      sparite — e cancellarle vorrebbe dire perdere mesi di scambi per un
      errore di rete durato tre secondi.
    */
    const tolti = store.riconcilia('slack', { completo: !e.falliti.length && !e.troncato },
      e.docs.map(d => d.id))
    avvisa({ fase: 'slack', stato: 'fatto', documenti: e.docs.length, falliti: e.falliti, troncato: e.troncato, tolti, resto: e.resto })
    return e.docs.length
  })
  const drv = c.drive
  if (drv) await fonte('drive', async () => {
    avvisa({ fase: 'drive', stato: 'apro i documenti' })
    const e = await drive.sincronizza(drv, (fatti, tot) =>
      avvisa({ fase: 'drive', stato: `${fatti} di ${tot} file` }))
    await store.salvaDocumentiAPezzi(e.docs)
    const tolti = store.riconcilia('drive', { completo: !e.troncato && !e.falliti },
      [...e.docs.map(d => d.id), ...e.visti])
    avvisa({ fase: 'drive', stato: 'fatto', documenti: e.docs.length, falliti: e.falliti, troncato: e.troncato, tolti, resto: e.resto })
    return e.docs.length
  })
  if (ms?.parti.includes('file')) await fonte('sharepoint', async () => {
    avvisa({ fase: 'sharepoint', stato: 'apro i siti' })
    const e = await microsoft.sincronizzaFile(ms, (fatti, tot) =>
      avvisa({ fase: 'sharepoint', stato: `${fatti} di ${tot} file` }))
    await store.salvaDocumentiAPezzi(e.docs)
    const tolti = store.riconcilia('sharepoint', { completo: e.completo },
      [...e.docs.map(d => d.id), ...e.visti])
    avvisa({ fase: 'sharepoint', stato: 'fatto', documenti: e.docs.length, falliti: e.falliti, troncato: e.troncato, tolti, resto: e.resto })
    return e.docs.length
  })
  const dbx = c.dropbox
  if (dbx) await fonte('dropbox', async () => {
    avvisa({ fase: 'dropbox', stato: 'apro la cartella' })
    const e = await dropbox.sincronizza(dbx, (fatti, tot) =>
      avvisa({ fase: 'dropbox', stato: `${fatti} di ${tot} file` }))
    await store.salvaDocumentiAPezzi(e.docs)
    const tolti = store.riconcilia('dropbox', { completo: e.completo && !e.falliti },
      [...e.docs.map(d => d.id), ...e.visti])
    avvisa({ fase: 'dropbox', stato: 'fatto', documenti: e.docs.length, falliti: e.falliti, troncato: e.troncato, tolti, resto: e.resto })
    return e.docs.length
  })
  /*
    WhatsApp non compare qui, e non è una dimenticanza.

    Non c'è nessun posto da cui rileggerlo: la Cloud API di Meta non ha una
    chiamata per «cosa mi è arrivato», i messaggi li spinge lei e li scriviamo
    mentre arrivano. Aggiungerlo a questo giro vorrebbe dire una fase che non
    fa niente, e — molto peggio — la tentazione di riconciliarla: un giro che
    non trova nessun id cancellerebbe dall'indice tutte le conversazioni.
  */
  return totale
}

app.get('/api/sincronizza', async (req, res) => {
  if (sincronizzazioneInCorso()) {
    return res.status(409).json({ errore: 'Una lettura è già in corso.' })
  }
  sincronizzazioniInCorso.add(chi.adesso() ?? '')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const invia = (d: unknown) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(d)}\n\n`) }

  let annullata = false
  req.on('close', () => { annullata = true })
  // lo stesso battito della chat: fra «mi collego alla casella» e il primo
  // messaggio il filo tace, e un proxy che lo vede tacere lo chiude
  const battito = setInterval(() => { if (!res.writableEnded) res.write(': vivo\n\n') }, 15_000)

  try {
    const totale = await leggiTutto(
      typeof req.query.fonte === 'string' ? req.query.fonte : null,
      invia,
      () => annullata
    )
    invia({ fase: 'fine', totale, conteggi: store.conteggi() })
    // «quando arriva» vale anche per quello che è arrivato premendo il bottone,
    // non solo per il giro delle sei ore
    if (totale > 0 && claude.collegato()) {
      const utente = chi.adesso()
      const gira = () => automazioni.quandoArriva()
      void (utente ? chi.dentro(utente, gira) : gira())
        .catch(e => console.error('myynd · le automazioni «quando arriva» non sono partite:', e instanceof Error ? e.message : e))
    }
  } catch (e) {
    invia({ fase: 'errore', errore: e instanceof Error ? e.message : String(e) })
  } finally {
    clearInterval(battito)
    sincronizzazioniInCorso.delete(chi.adesso() ?? '')
    if (!res.writableEnded) res.end()
  }
})

/**
 * La rilettura che nessuno chiede.
 *
 * Ogni sei ore, in silenzio, senza bottoni. Se una lettura è già in corso si
 * salta il giro invece di accodarsene un'altra: due letture insieme sulla
 * stessa casella non vanno il doppio più veloci, vanno il doppio peggio.
 */
const OGNI = 6 * 60 * 60 * 1000

/**
 * La rilettura che nessuno chiede, e cosa succede dopo.
 *
 * Fino a ieri finiva qui: leggeva le fonti, scriveva nell'indice, stampava una
 * riga sul terminale che non legge nessuno. Il file nuovo comparso sulla
 * scrivania entrava nella mente e non produceva *niente* — la prima pagina
 * restava quella di ieri finché non premevi «fai una lettura».
 *
 * Ma il brief è netto, ed è la promessa centrale del prodotto: «migliora da
 * solo, e nessuno deve dargli da mangiare. Se una persona si sente a fare
 * inserimento dati, qualcosa è andato storto». Un cervello che si aggiorna solo
 * quando glielo chiedi è un cervello quasi sempre indietro.
 *
 * Quindi adesso, quando è arrivato qualcosa di davvero nuovo, la lettura
 * riparte da sé — su quello che è arrivato, non su quello che è solo recente —
 * e da lì può nascere anche una domanda. Se non è cambiato niente non si
 * chiama nessun modello: una rilettura a vuoto non deve costare.
 */
async function rileggiDaSola() {
  if (sincronizzazioneInCorso()) return
  const c = cfg.leggi()
  // una fonte nuova che non compare qui è una fonte che non si aggiorna mai
  // da sola: il bottone funziona, e in silenzio l'indice resta indietro
  if (!c.desktop && !c.notion && !c.posta && !c.google && !c.slack
    && !c.drive && !c.microsoft && !c.dropbox && !c.calendario) return
  sincronizzazioniInCorso.add(chi.adesso() ?? '')
  const daQuando = new Date().toISOString()
  try {
    const totale = await leggiTutto(null, d => {
      // il giro silenzioso resta silenzioso, ma un guaio no: un token del
      // desktop remoto scaduto era un 401 che nessuno vedeva mai, e ogni giro
      // fallito in silenzio sembrava un giro andato bene
      const x = d as { fase?: string; stato?: string; errore?: string }
      if (x.stato === 'guaio') console.error(`myynd · ${x.fase === 'desktop-remoto' ? 'desktop remoto' : x.fase}: ${x.errore}`)
    })
    const nuovi = store.appenaArrivati(daQuando, 20)
    console.log(`myynd · rilettura automatica: ${totale} documenti letti, ${nuovi.length} nuovi o cambiati`)

    if (!nuovi.length || !claude.collegato()) return

    const voci = await claude.generaFeed(nuovi)
    if (voci.length) {
      store.salvaFeed(voci)
      console.log(`myynd · ${voci.length} cose nuove messe da parte senza che nessuno le chiedesse`)
    }
    // e, ogni tanto e quasi mai, una domanda. I cinque cancelli stanno dentro
    // `forseChiedi`: qui si dà solo l'occasione.
    await domande.forseChiedi().catch(() => {})

    // le automazioni che aspettano l'arrivo di qualcosa: è arrivato
    await automazioni.quandoArriva().catch(() => {})
  } catch (e) {
    // una fonte che non risponde non è un guasto dell'app: si riprova fra sei ore
    console.error('myynd · la rilettura automatica non è riuscita:', e instanceof Error ? e.message : e)
  } finally {
    sincronizzazioniInCorso.delete(chi.adesso() ?? '')
  }
}

// — la mente —

/**
 * Quello che c'è dentro, e — solo se lo si chiede — il grafo.
 *
 * `store.mappa()` costruisce un indice rovesciato su millecinquecento parole
 * per duemilaseicento documenti e ne cava i legami: non è gratis, e finora
 * girava a ogni avvio dell'app perché il client la chiamava al montaggio, su
 * qualunque schermata. La Mappa sta dietro a un menù e quasi nessuno la apre.
 *
 * I conteggi restano sempre — servono al titolo e alla legenda — e il grafo
 * arriva solo a chi lo sta per disegnare.
 */
app.get('/api/mente', (req, res) => {
  const n = store.conteggi()
  const g = req.query.grafo === '1' ? store.mappa() : null
  res.json({
    totale: n.totale,
    gruppi: n.perGruppo.map(gr => ({
      id: gr.gruppo,
      nome: gr.gruppo === 'posta' ? 'Posta' : gr.gruppo === 'documenti' ? 'Documenti' : gr.gruppo === 'note' ? 'Note' : 'Altre fonti',
      colore: gr.gruppo === 'posta' ? '#C4553C' : gr.gruppo === 'documenti' ? '#E0A44A' : gr.gruppo === 'note' ? '#5B9BC9' : '#7FA98A',
      nodi: gr.n
    })),
    grafo: g
  })
})

app.get('/api/cerca', (req, res) => {
  const q = String(req.query.q ?? '').trim()
  // senza query mostro gli ultimi letti: così si vede subito cosa c'è dentro
  const trovati = q ? store.cerca(q, 20) : store.recenti(20)
  res.json(trovati.map(d => ({
    id: d.id, titolo: d.titolo, fonte: d.fonte, gruppo: d.gruppo,
    quando: d.quando, estratto: d.corpo.slice(0, 180)
  })))
})

// id come query: gli identificativi contengono ':' e '/' (posta:INBOX:42, desktop:/Users/…)
// Il corpo si ricuce anche in lettura, non solo quando si indicizza: chi ha
// già la sua roba nell'indice non deve rifare una sincronizzazione intera per
// smettere di vedere le frasi spezzate. Su un testo già ricucito `riflua` non
// tocca niente, quindi passarci due volte non costa nulla.
app.get('/api/documento', (req, res) => {
  const d = store.documento(String(req.query.id ?? ''))
  if (!d) return res.status(404).json({ errore: 'Non trovato.' })
  res.json({ ...d, corpo: riflua(d.corpo ?? '') })
})

// — feed —

app.get('/api/feed', (_req, res) => {
  const ore = cfg.leggi().oreFatte ?? 48
  res.json({ aperti: store.elencoFeed('aperto'), fatte: store.elencoFeed('fatto', ore) })
})

app.post('/api/feed/genera', async (_req, res) => {
  try {
    const voci = await claude.generaFeed()
    // niente id costruito qui: salvaFeed calcola il suo da (doc | titolo), ed
    // è quello che impedisce a una rilettura di duplicare il feed. Quello che
    // si passava veniva ignorato a ogni giro.
    store.salvaFeed(voci)
    res.json({ ok: true, generate: voci.length, feed: store.elencoFeed('aperto') })

    // Dopo aver risposto, non prima: capire se c'è qualcosa da chiedere non deve
    // mai far aspettare una lettura. Quasi sempre non conclude niente, ed è giusto.
    domande.forseChiedi().catch(() => {})
  } catch (e) { errore(res, e) }
})

// — quello che chiede lui —

app.get('/api/domanda', (_req, res) => res.json({ domanda: store.domandaAperta() }))

app.post('/api/domanda/:id/rispondi', async (req, res) => {
  try {
    const { esito } = await domande.rispondiADomanda(req.params.id, String(req.body?.testo ?? ''))
    res.json({ ok: true, esito })
  } catch (e) { errore(res, e) }
})

app.post('/api/domanda/:id/ignora', (req, res) => {
  domande.ignora(req.params.id)
  res.json({ ok: true })
})

/**
 * Rispondere a una voce con parole tue. È l'altra metà del feed: finora poteva
 * solo dirti le cose, adesso puoi ribattere — «è già fatto», «l'ho aggiornato,
 * non è sul desktop», «questo lascialo stare».
 */
app.post('/api/feed/:id/rispondi', async (req, res) => {
  const testo = String(req.body?.testo ?? '')
  try {
    const stato = req.body?.stato ? String(req.body.stato) : undefined
    const esito = await timone.rispondiAVoce(req.params.id, testo, stato)
    const ore = cfg.leggi().oreFatte ?? 48
    res.json({ ...esito, aperti: store.elencoFeed('aperto'), fatte: store.elencoFeed('fatto', ore) })
  } catch (e) { errore(res, e) }
})

/** Su cosa concentrarsi adesso: vale per tutte le letture che verranno. */
app.get('/api/feed/fuoco', (_req, res) => res.json({ fuoco: timone.fuoco() }))

app.post('/api/feed/fuoco', (req, res) => {
  timone.scriviFuoco(String(req.body?.testo ?? ''))
  res.json({ ok: true, fuoco: timone.fuoco() })
})

app.post('/api/feed/:id/:stato', (req, res) => {
  store.cambiaStatoFeed(req.params.id, req.params.stato === 'fatto' ? 'fatto' : 'aperto')
  res.json({ ok: true })
})

// — la rassegna —
//
// L'unica parte di Myynd che guarda fuori. Le rotte sono tre e fanno tre cose
// sole: dammi quello che c'è, vai a vedere se c'è di nuovo, l'ho letta.
//
// `GET` non va mai a prendere niente: aprire la pagina non deve poter far
// partire quindici richieste ai giornali e una al modello. Chi aggiorna è
// l'orologio, in sottofondo, o il bottone — cioè una persona che l'ha chiesto.

app.get('/api/rassegna', (_req, res) => {
  const e = rassegna.elenco()
  res.json({ ...e, argomenti: rassegna.interessi(), gusto: gusto.inParole(gusto.gusto(), cfg.lingua() === 'en') })
})

app.post('/api/rassegna/aggiorna', async (req, res) => {
  try {
    const e = await rassegna.aggiorna(req.body?.forza !== false)
    res.json({ ...e, argomenti: rassegna.interessi(), gusto: gusto.inParole(gusto.gusto(), cfg.lingua() === 'en') })
  } catch (e) { errore(res, e) }
})

app.post('/api/rassegna/:id/letta', (req, res) => {
  store.segnaNotiziaLetta(req.params.id)
  res.json({ ok: true })
})

/** «Questa non mi interessa»: non torna, né domani né mai. */
app.post('/api/rassegna/:id/scarta', (req, res) => {
  store.segnaNotiziaScartata(req.params.id)
  res.json({ ok: true })
})

// — compiti —
//
// La lista. È l'altra metà del feed: lì c'è quello che Myynd ha notato, qui
// quello che hai deciso tu, e le due cose non si mescolano — una voce del feed
// promossa a compito *chiude* la voce, così la stessa cosa non esiste due volte
// in due stati diversi.
//
// Le rotte con un pezzo fisso stanno prima di quelle con `:id`, altrimenti
// `/api/compiti/flusso` finisce dentro `/api/compiti/:id`.

app.get('/api/compiti', (_req, res) => {
  res.json({
    compiti: store.elencoCompiti(),
    chiusi: store.compitiChiusi(),
    fuoco: timone.fuoco()
  })
})

/**
 * Il filo dei compiti affidati.
 *
 * Una delega dura mezzo minuto e chi guarda non deve ricaricare per scoprire
 * com'è andata. È anche il modo in cui il punto nella barra dei menù si accende
 * senza che nessuna finestra sia aperta: chi ascolta non è per forza l'interfaccia.
 */
app.get('/api/compiti/flusso', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const invia = (d: unknown) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(d)}\n\n`) }
  invia({ fase: 'aperto' })

  const basta = compiti.ascolta(invia)
  // senza un segno di vita ogni tanto, un proxy o il sistema chiudono il socket
  // e il flusso muore in silenzio: qui il silenzio è il difetto, non il traffico
  const battito = setInterval(() => { if (!res.writableEnded) res.write(': vivo\n\n') }, 15_000)

  req.on('close', () => { clearInterval(battito); basta(); if (!res.writableEnded) res.end() })
})

app.post('/api/compiti', (req, res) => {
  const testo = String(req.body?.testo ?? '').trim()
  if (!testo) return res.status(400).json({ errore: 'Scrivi cosa c\'è da fare.' })

  const quando = SECCHI.includes(String(req.body?.quando)) ? String(req.body.quando) : 'oggi'
  // l'id lo può portare il client: un compito dettato altrove e uno scritto qui
  // devono poter nascere con lo stesso nome senza chiedere il permesso a nessuno
  const id = String(req.body?.id ?? '').trim() || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  try {
    store.scriviCompito({
    id, testo,
    nota: req.body?.nota ? String(req.body.nota) : null,
    quando,
    ordine: ordine.dopo(store.ultimoOrdine(quando)),
    origine: String(req.body?.origine ?? 'mano'),
    voce: req.body?.voce ? String(req.body.voce) : null,
    doc: req.body?.doc ? String(req.body.doc) : null
  })

  // una voce del feed promossa non resta anche nel feed: sarebbe la stessa cosa
  // in due posti, con due stati che divergono al primo tocco
  if (req.body?.voce && store.voceFeed(String(req.body.voce))) {
    store.cambiaStatoFeed(String(req.body.voce), 'fatto', 'Passata nella lista.')
  }
  } catch (e) { return errore(res, e) }

  res.json({ ok: true, id, compiti: store.elencoCompiti() })
  compiti.annunciaCambio()
})

app.patch('/api/compiti/:id', (req, res) => {
  const c = store.compito(req.params.id)
  // rispondere «fatto» a una modifica di una riga che non c'è vuol dire dire a
  // chi ha perso una corsa che l'ha vinta
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })

  const b = req.body ?? {}
  const patch: { testo?: string; nota?: string | null } = {}
  if (b.testo !== undefined) {
    const testo = String(b.testo).trim()
    if (!testo) return res.status(400).json({ errore: 'Un compito senza testo non è un compito.' })
    patch.testo = testo
  }
  if (b.nota !== undefined) patch.nota = b.nota === null ? null : String(b.nota)

  let quando: string | undefined
  if (b.quando !== undefined) {
    quando = String(b.quando)
    if (!SECCHI.includes(quando)) return res.status(400).json({ errore: 'Non so cosa sia questo momento.' })
  }

  try {
    if (Object.keys(patch).length) store.cambiaCompito(req.params.id, patch)
    // Cambiare secchio vuol dire cambiare fila, e una chiave nata nell'altra
    // fila lì non vuol dire niente: può essere identica a una che c'è già, e da
    // due righe con la stessa chiave in poi l'ordine non esiste più.
    if (quando && quando !== c.quando) {
      store.riordina(req.params.id, quando, ordine.dopo(store.ultimoOrdine(quando)))
    }
  } catch (e) { return errore(res, e) }

  res.json({ ok: true, compiti: store.elencoCompiti() })
  compiti.annunciaCambio()
})

/**
 * Sposta una riga fra due altre.
 *
 * Arrivano gli id dei vicini e non una posizione: una posizione calcolata su una
 * lista vecchia di due secondi sposta la riga nel posto sbagliato, e su due
 * dispositivi lo fa sempre. I vicini, invece, sono veri quando ci arrivano.
 */
app.post('/api/compiti/:id/sposta', (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })

  const quando = SECCHI.includes(String(req.body?.quando)) ? String(req.body.quando) : c.quando
  // un vicino di un altro secchio darebbe una chiave che qui non vuol dire
  // niente, e la riga finirebbe in un punto a caso
  const vicino = (v: unknown) => {
    if (!v) return null
    const n = store.compito(String(v))
    return n && n.quando === quando && !n.sparito ? n : null
  }
  const sopra = vicino(req.body?.sopra)
  const sotto = vicino(req.body?.sotto)

  try {
    store.riordina(req.params.id, quando, ordine.fra(sopra?.ordine ?? '', sotto?.ordine ?? ''))
  } catch {
    // il messaggio dell'algoritmo parla di chiavi, che a chi trascina una riga
    // non dicono niente: si rimette in fondo, che è sempre un posto valido
    try {
      store.riordina(req.params.id, quando, ordine.dopo(store.ultimoOrdine(quando)))
    } catch (e) { return errore(res, e) }
  }

  res.json({ ok: true, compiti: store.elencoCompiti() })
  compiti.annunciaCambio()
})

const MODI = ['bozza', 'tutto']

app.post('/api/compiti/:id/delega', (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })
  if (!claude.collegato()) {
    return res.status(400).json({ errore: 'Collega Claude e potrò lavorarci.' })
  }
  /*
   * Le bozze vogliono un motore vero, non l'abbonamento.
   *
   * `svolgi` cerca e apre documenti a più giri, e quella strada Claude Code non
   * la fa. Ma «un motore vero» è la chiave di Claude *oppure* il fornitore
   * compatibile: chiedere `cliente()` — che è solo Anthropic — vietava le bozze
   * proprio a chi aveva appena collegato OpenAI, mentre chat, feed e automazioni
   * gli funzionavano. Meglio dirlo qui, prima di affidare, che con una rotella.
   */
  if (!mod.motore()) {
    return res.status(400).json({ errore: 'Per le bozze serve una chiave API o un fornitore: l’abbonamento basta per la chat.' })
  }
  const modo = MODI.includes(String(req.body?.modo)) ? String(req.body.modo) : 'bozza'
  compiti.affida(c.id, modo)
  res.json({ ok: true, compiti: store.elencoCompiti() })
  compiti.annunciaCambio()
})

/**
 * Chiude un compito con le tue parole.
 *
 * `testo` non è un'etichetta: fra un mese «fatto» non dice niente e «mandato
 * lunedì col listino nuovo» sì. E se il compito aveva una bozza, quello che hai
 * tenuto davvero contro quello che aveva scritto lui è la lezione più preziosa
 * che questo prodotto raccoglie — passa alla memoria, dopo aver risposto.
 */
/** Ci ho ripensato: il compito torna mio. Quello che sta girando si butta. */
app.post('/api/compiti/:id/richiama', (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })
  if (c.stato !== 'delegato' && c.stato !== 'pronto' && c.stato !== 'chiede') {
    return res.status(400).json({ errore: 'Questo non è in mano a Myynd.' })
  }
  compiti.richiama(req.params.id)
  res.json({ ok: true, compiti: store.elencoCompiti() })
  // come tutte le altre rotte dei compiti: l'altra finestra deve saperlo,
  // altrimenti resta con la colonna sbagliata accesa
  compiti.annunciaCambio()
})

/**
 * La risposta a quello che ti ha chiesto.
 *
 * Non è una nota qualunque: è il pezzo che gli mancava. Si attacca al compito e
 * lo si riaffida subito, con lo stesso modo di prima — chi risponde a una
 * domanda si aspetta che il lavoro riparta, non di dover premere ancora.
 */
app.post('/api/compiti/:id/rispondi', (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })
  const testo = String(req.body?.testo ?? '').trim()
  if (!testo) return res.status(400).json({ errore: 'Scrivi la risposta.' })

  try {
    store.cambiaCompito(c.id, { nota: c.nota ? `${c.nota}\n${testo}` : testo })
    store.cambiaStatoCompito(c.id, 'aperto')
    store.sbozzaCompito(c.id)
    // le domande di prima hanno avuto risposta: non devono ripresentarsi sotto
    // la riga mentre lui sta già rilavorando
    store.scordaChieste(c.id)
  } catch (e) { return errore(res, e) }

  compiti.affida(c.id, c.modo === 'io' ? 'bozza' : c.modo)
  res.json({ ok: true, compiti: store.elencoCompiti() })
  compiti.annunciaCambio()
})

/**
 * Da una bozza a un'email, e poi fuori.
 *
 * Due rotte, e sono due apposta. `prepara` smonta la bozza e dice a chi
 * andrebbe; `invia` la manda. Fra l'una e l'altra c'è una persona che ha letto
 * il testo e premuto un bottone — è l'unico passo che non si automatizza, ed è
 * la ragione per cui il resto si può automatizzare.
 *
 * `conosciuto` non blocca niente: dice se quell'indirizzo compare già nel
 * materiale letto. Se non compare, l'interfaccia lo segnala e chi guarda decide.
 * Un destinatario mai visto non è un errore — è solo la cosa su cui vale la
 * pena posare gli occhi un secondo in più.
 */
app.post('/api/compiti/:id/prepara-email', async (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })
  if (!c.risultato?.trim()) return res.status(400).json({ errore: 'Non c\'è ancora niente da mandare.' })
  if (!cfg.leggi().posta) return res.status(400).json({ errore: 'Collega la posta e potrò mandarla.' })

  try {
    // dalle fonti che la bozza ha citato, non da una ricerca nuova: il
    // destinatario deve venire da quello che ha letto lei
    const e = await claude.preparaEmail(c.testo, c.risultato, c.fonti)
    if (!e) return res.status(400).json({ errore: 'Non sono riuscito a ricavarne un\'email.' })
    res.json({ ...e, conosciuto: e.a ? store.indirizzoConosciuto(e.a) : false })
  } catch (e) { errore(res, e) }
})

app.post('/api/compiti/:id/invia', async (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })
  const conf = cfg.leggi()
  if (!conf.posta) return res.status(400).json({ errore: 'Collega la posta e potrò mandarla.' })

  const a = String(req.body?.a ?? '').trim()
  const oggetto = String(req.body?.oggetto ?? '').trim()
  const corpo = String(req.body?.corpo ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)) return res.status(400).json({ errore: 'Manca un indirizzo valido.' })
  if (!corpo) return res.status(400).json({ errore: 'Il messaggio è vuoto.' })

  try {
    await posta.invia(conf.posta, { a, oggetto, corpo })
  } catch (e) {
    // anche il fallimento va nel registro: il giorno che una mail non parte è
    // proprio quello in cui vuoi trovarne traccia
    store.registraAzione({
      tipo: 'email', verso: a, cosa: oggetto || c.testo, compito: c.id,
      esito: 'fallita', dettaglio: e instanceof Error ? e.message : String(e)
    })
    return errore(res, e)
  }

  store.registraAzione({ tipo: 'email', verso: a, cosa: oggetto || c.testo, compito: c.id, esito: 'fatta' })
  // mandata vuol dire fatta: la riga si chiude con le parole giuste, e quello
  // che hai tenuto davvero passa alla memoria come per ogni altra chiusura
  store.tieniLaTua(c.id, corpo)
  store.cambiaStatoCompito(c.id, 'fatto', `Mandata a ${a}.`)
  res.json({ ok: true, compiti: store.elencoCompiti(), chiusi: store.compitiChiusi() })
  compiti.annunciaCambio()
  compiti.imparaSeCorretto(c.risultato, corpo)
})

/**
 * Eseguire una proposta. L'unico altro punto da cui Myynd tocca qualcosa.
 *
 * Vale parola per parola quello che vale per `invia`: la proposta è nata sola,
 * l'elenco l'ha scritto il modello, ma quello che succede lo decide chi legge —
 * e succede *esattamente* quello che ha letto. Per questo si agisce su quello
 * che è scritto nella riga e non su quello che il client rimanda indietro: un
 * elenco che arriva dal browser è un elenco che si può cambiare per strada.
 *
 * E non si cancella niente. `sposta` porta in una cartella; il cestino è una
 * cartella, e da una cartella si torna indietro trascinando.
 */
app.post('/api/compiti/:id/esegui', async (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })
  const p = c.proposta
  if (!p) return res.status(400).json({ errore: 'Non c\'è niente da eseguire.' })
  const conf = cfg.leggi()

  // — in agenda —
  //
  // Passa da Calendario del Mac, che è già collegato agli account di chi lo usa
  // e sincronizza da sé: scrivere lì vuol dire scrivere su Google senza toccare
  // Google. La prima volta macOS chiede il permesso, ed è giusto che lo chieda.
  if (p.azione === 'agenda.aggiungi') {
    if (!p.eventi?.length) return res.status(400).json({ errore: 'Non c\'è niente da eseguire.' })
    const cosa = `${p.eventi.length} ${p.eventi.length === 1 ? 'evento' : 'eventi'}`
    try {
      const quanti = await agenda.aggiungi(p.eventi)
      store.registraAzione({ tipo: 'agenda', cosa, compito: c.id, esito: 'fatta' })
      store.scordaProposta(c.id)
      store.cambiaStatoCompito(c.id, 'fatto', `${quanti} in agenda.`)
      res.json({ ok: true, spostati: quanti, dove: 'Calendario', compiti: store.elencoCompiti(), chiusi: store.compitiChiusi() })
      compiti.annunciaCambio()
    } catch (e) {
      store.registraAzione({
        tipo: 'agenda', cosa, compito: c.id, esito: 'fallita',
        dettaglio: e instanceof Error ? e.message : String(e)
      })
      errore(res, e)
    }
    return
  }

  // — la posta —
  //
  // Due caselle possibili, due strade: quella di Gmail si sposta con la sua API
  // — dove il cestino è un'etichetta e si torna indietro togliendola — e quella
  // IMAP spostando il messaggio in una cartella. Per chi guarda è lo stesso
  // bottone, e dev'esserlo: la casella è un dettaglio di come, non di cosa.
  if (!p.voci?.length) return res.status(400).json({ errore: 'Non c\'è niente da eseguire.' })
  const daGoogle = p.voci.filter(v => v.doc.startsWith('google:')).map(v => v.doc)
  if (daGoogle.length) {
    const cosaG = `${daGoogle.length} ${daGoogle.length === 1 ? 'messaggio' : 'messaggi'}`
    const cestinaG = p.azione === 'posta.cestina'
    try {
      const quanti = cestinaG ? await google.cestina(daGoogle) : await google.archivia(daGoogle)
      store.scordaDocumenti(daGoogle)
      store.registraAzione({
        tipo: p.azione, verso: cestinaG ? 'Cestino' : 'Archiviati', cosa: cosaG, compito: c.id, esito: 'fatta'
      })
      store.scordaProposta(c.id)
      store.cambiaStatoCompito(c.id, 'fatto', `${quanti} ${cestinaG ? 'nel cestino' : 'archiviati'}.`)
      res.json({ ok: true, spostati: quanti, dove: cestinaG ? 'Cestino' : 'Archiviati', compiti: store.elencoCompiti(), chiusi: store.compitiChiusi() })
      compiti.annunciaCambio()
    } catch (e) {
      store.registraAzione({
        tipo: p.azione, cosa: cosaG, compito: c.id, esito: 'fallita',
        dettaglio: e instanceof Error ? e.message : String(e)
      })
      errore(res, e)
    }
    return
  }
  if (!conf.posta) return res.status(400).json({ errore: 'Collega la posta e potrò farlo.' })

  const mosse = posta.mosseDa(p.voci.map(v => v.doc))
  if (!mosse.length) return res.status(400).json({ errore: 'Non ce n\'è nessuno che si possa spostare.' })

  const cestino = p.azione === 'posta.cestina'
  const cosa = `${mosse.length} ${mosse.length === 1 ? 'messaggio' : 'messaggi'}`
  try {
    const { spostati, dove } = await posta.sposta(conf.posta, mosse, cestino ? '\\Trash' : '\\Archive')
    // l'indice parla di messaggi che stanno in un altro posto: le righe vanno
    // tolte, o restano fonti che non si aprono più
    store.scordaDocumenti(p.voci.map(v => v.doc))
    store.registraAzione({
      tipo: cestino ? 'posta.cestina' : 'posta.archivia',
      verso: dove, cosa, compito: c.id, esito: 'fatta'
    })
    store.scordaProposta(c.id)
    store.cambiaStatoCompito(c.id, 'fatto', `${spostati} in «${dove}».`)
    res.json({ ok: true, spostati, dove, compiti: store.elencoCompiti(), chiusi: store.compitiChiusi() })
    compiti.annunciaCambio()
  } catch (e) {
    // anche qui il fallimento va nel registro: se una casella rifiuta lo
    // spostamento, il giorno dopo si vuole poterlo leggere
    store.registraAzione({
      tipo: cestino ? 'posta.cestina' : 'posta.archivia',
      cosa, compito: c.id, esito: 'fallita',
      dettaglio: e instanceof Error ? e.message : String(e)
    })
    errore(res, e)
  }
})

/**
 * Da una bozza a un documento vero, sul disco, aperto.
 *
 * È il terzo punto da cui esce qualcosa, e il primo che lascia un segno fuori
 * dall'app senza mandarlo a nessuno. Stessa forma degli altri due: il testo si
 * legge prima, il bottone lo preme una persona, e quello che è successo finisce
 * nel registro con il percorso — non «documento salvato», ma dove.
 *
 * La riga si chiude: il lavoro è uscito. Se poi lo riapri e lo cambi in Word,
 * quello è il tuo documento, e non è più affare di Myynd.
 */
app.post('/api/compiti/:id/documento', async (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })
  const testo = String(req.body?.testo ?? c.risultato ?? '')
  if (!testo.trim()) return res.status(400).json({ errore: 'Non c\'è ancora niente da salvare.' })

  const conf = cfg.leggi()
  const formato = String(req.body?.formato ?? '.md') as scrivania.Formato
  const cartella = String(req.body?.cartella ?? conf.desktop?.cartelle?.[0] ?? '')
  const nome = String(req.body?.nome ?? '').trim() || c.testo

  try {
    const f = await scrivania.scrivi(conf.desktop, { cartella, nome, testo, formato })
    store.registraAzione({
      tipo: 'documento', verso: f.percorso, cosa: f.nome, compito: c.id, esito: 'fatta'
    })
    // aprirlo è metà del punto: un file che devi andare a cercare nel Finder è
    // un file che hai salvato, non un lavoro che hai finito
    if (req.body?.apri !== false) {
      await scrivania.apri(conf.desktop, f.percorso).catch(() => { /* il file c'è comunque */ })
    }
    store.tieniLaTua(c.id, testo)
    store.cambiaStatoCompito(c.id, 'fatto', `Salvato in «${f.nome}».`)
    res.json({ ok: true, ...f, compiti: store.elencoCompiti(), chiusi: store.compitiChiusi() })
    compiti.annunciaCambio()
  } catch (e) {
    store.registraAzione({
      tipo: 'documento', cosa: nome, compito: c.id, esito: 'fallita',
      dettaglio: e instanceof Error ? e.message : String(e)
    })
    errore(res, e)
  }
})

/**
 * Affidare una riga a Claude Code, dentro un progetto.
 *
 * Due passi in una rotta sola, scelti da `passo`: «piano» legge il progetto e
 * scrive cosa farebbe senza toccare niente; «fai» lo fa. Il primo si chiede da
 * solo, il secondo lo chiede una persona che ha appena letto il piano.
 *
 * Quello che torna finisce dove finisce ogni altro lavoro: nel `risultato`
 * della riga, che è già quello che l'interfaccia sa mostrare, correggere e
 * chiudere. Un agente che lavora in una cartella non ha bisogno di una
 * schermata sua — ha bisogno di consegnare dove consegnano gli altri.
 */
app.post('/api/compiti/:id/lavora', async (req, res) => {
  if (ospitato.OSPITATO) {
    return res.status(400).json({ errore: 'Su un server non posso lavorare in una cartella: serve Myynd sul tuo computer.' })
  }
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })
  const conf = cfg.leggi()
  const passo = req.body?.passo === 'fai' ? 'fai' : 'piano'
  const cartella = String(req.body?.cartella ?? '').trim()
  if (!cartella) return res.status(400).json({ errore: 'Dimmi in quale cartella lavorare.' })

  const richiesta = [
    c.testo,
    c.nota ? `\n${c.nota}` : '',
    // al secondo passo il piano è già stato letto e approvato: si dice di
    // eseguire quello, non di ripensarlo da capo
    passo === 'fai' && c.risultato ? `\n\nIl piano approvato:\n${c.risultato}` : ''
  ].join('')

  try {
    const e = await lavoro.fai(conf.desktop, { cartella, richiesta, passo })
    store.registraAzione({
      tipo: passo === 'piano' ? 'lavoro.piano' : 'lavoro.fatto',
      verso: e.cartella, cosa: c.testo, compito: c.id,
      esito: e.finito ? 'fatta' : 'fallita',
      dettaglio: e.finito ? undefined : 'fermato dopo il tetto di tempo'
    })
    // il piano si legge come una bozza; quello che ha fatto davvero anche —
    // con la differenza che i file nella cartella adesso sono cambiati
    store.risultatoCompito(c.id, e.testo, [], 'pronto')
    const dopo = store.compito(c.id)
    res.json({ ok: true, passo, finito: e.finito, compiti: store.elencoCompiti(), compito: dopo })
    compiti.annunciaCambio()
  } catch (e) { errore(res, e) }
})

/** C'è Claude Code su questa macchina? Serve alla schermata, per non offrirlo a vuoto. */
app.get('/api/lavoro/pronto', (_req, res) => {
  res.json({ pronto: !!lavoro.installato(), cartelle: cfg.leggi().desktop?.cartelle ?? [] })
})

/** Quello che è uscito da qui, per giorno. Il brief la chiama la pagina del sì. */
app.get('/api/azioni', (_req, res) => res.json({ azioni: store.azioni(120) }))

app.post('/api/compiti/:id/chiudi', (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })

  const stato = req.body?.stato === 'lasciato' ? 'lasciato' : 'fatto'
  const esito = String(req.body?.esito ?? '').trim()
  const tenuto = String(req.body?.tenuto ?? '')

  // Quello che hai tenuto davvero è la cosa più preziosa che passa di qui, e
  // finiva soltanto dentro una convinzione: il testo com'è uscito non lo
  // rileggevi più da nessuna parte. Adesso resta sulla riga, e quando la
  // riapri fra le fatte trovi la versione tua, non la sua.
  if (tenuto && tenuto.trim() && tenuto.trim() !== (c.risultato ?? '').trim()) {
    store.tieniLaTua(c.id, tenuto.trim())
  }
  store.cambiaStatoCompito(c.id, stato, esito || undefined)
  res.json({ ok: true, compiti: store.elencoCompiti(), chiusi: store.compitiChiusi() })
  compiti.annunciaCambio()

  // Dopo la risposta, mai davanti: chiudere non deve aspettare che impari.
  //
  // Due lezioni diverse, e vanno prese tutte e due. Quello che hai *tenuto*
  // della sua bozza dice come scrivi; quello che hai *scritto* chiudendo dice
  // com'è andata e perché. Prima si raccoglieva solo la prima, che è anche la
  // più rara — e tutte le righe chiuse a mano passavano senza lasciare niente.
  if (tenuto) compiti.imparaSeCorretto(c.risultato, tenuto)
  compiti.imparaDallaChiusura(c, stato, esito)
})

app.post('/api/compiti/:id/riapri', (req, res) => {
  const c = store.compito(req.params.id)
  if (!c) return res.status(404).json({ errore: 'Compito non trovato.' })
  try {
    store.cambiaStatoCompito(req.params.id, 'aperto')
    // una riga che torna in lista non si porta dietro il guaio e la bozza della
    // vita precedente: sarebbero un errore vecchio e un lavoro già visto
    store.sbozzaCompito(req.params.id)
    // e riprende una chiave sua: quella di prima può essere stata assegnata a
    // un'altra riga mentre lei era fra le fatte
    store.riordina(req.params.id, c.quando, ordine.dopo(store.ultimoOrdine(c.quando)))
  } catch (e) { return errore(res, e) }
  res.json({ ok: true, compiti: store.elencoCompiti(), chiusi: store.compitiChiusi() })
  compiti.annunciaCambio()
})

app.delete('/api/compiti/:id', (req, res) => {
  if (!store.compito(req.params.id)) return res.status(404).json({ errore: 'Compito non trovato.' })
  // Prima si toglie il lavoro dalle mani di Myynd, poi si toglie la riga.
  // Al contrario, una delega già partita andava avanti per conto suo e mezzo
  // minuto dopo scriveva la bozza sopra a un compito che avevi cancellato:
  // risultatoCompito controlla lo stato, non se la riga è sparita.
  compiti.richiama(req.params.id)
  store.scordaCompito(req.params.id)
  res.json({ ok: true, compiti: store.elencoCompiti() })
  compiti.annunciaCambio()
})

// — automazioni —
//
// La ricetta arriva con l'azienda: chi apre Myynd se le ritrova già lì, e
// non deve installare niente. Quello che è suo è solo se tenerle accese.

app.get('/api/automazioni', (_req, res) => {
  res.json({ automazioni: automazioni.elenco(), ricette: automazioni.statoRicette() })
})

/**
 * Vai a vedere se ce ne sono di nuove.
 *
 * C'è anche a mano, oltre che ogni sei ore, per il momento in cui serve
 * davvero: si è al telefono con un cliente, gli si è appena scritta
 * un'automazione, e la si vuole vedere comparire adesso invece che stasera.
 */
/** Le undici del pacchetto: prenderle, o rimandarle indietro. */
app.post('/api/automazioni/diSerie', (req, res) => {
  cfg.aggiorna({ diSerie: req.body?.attivo === true })
  automazioni.scordaLeRicette()
  res.json({ ok: true, automazioni: automazioni.elenco() })
})

app.post('/api/automazioni/aggiorna', async (_req, res) => {
  try {
    const e = await automazioni.aggiornaRicette()
    if (!e) return res.status(400).json({ errore: 'Non è impostato nessun repository di ricette.' })
    res.json({ ok: true, ...e, automazioni: automazioni.elenco(), ricette: automazioni.statoRicette() })
  } catch (e) { errore(res, e) }
})

/**
 * Scrivertene una tu.
 *
 * È la rotta che risponde a «ma queste posso farmele io?»: una frase, e dopo
 * qualche secondo c'è un'automazione tua nell'elenco, uguale in tutto a quelle
 * arrivate con l'azienda. Nasce spenta di proposito — vedi il commento nel
 * client: prima la si guarda e la si prova, poi la si accende.
 */
app.post('/api/automazioni', async (req, res) => {
  try {
    const a = await automazioni.daUnaFrase(String(req.body?.descrizione ?? ''))
    store.accendiAutomazione(a.id, false)
    res.json({ ok: true, id: a.id, automazioni: automazioni.elenco() })
  } catch (e) { errore(res, e, 400) }
})

/** Cambiarne una. Quella dell'azienda si copre con una tua, senza toccare l'originale. */
app.patch('/api/automazioni/:id', (req, res) => {
  try {
    automazioni.cambia(req.params.id, req.body ?? {})
    res.json({ ok: true, automazioni: automazioni.elenco() })
  } catch (e) { errore(res, e, 400) }
})

app.delete('/api/automazioni/:id', (req, res) => {
  if (!automazioni.butta(req.params.id)) {
    return res.status(400).json({ errore: 'Questa automazione non è tua da buttare.' })
  }
  res.json({ ok: true, automazioni: automazioni.elenco() })
})

app.post('/api/automazioni/:id/accendi', (req, res) => {
  const c = automazioni.ricette().find(a => a.id === req.params.id)
  if (!c) return res.status(404).json({ errore: 'Non conosco questa automazione.' })
  automazioni.accendi(req.params.id, req.body?.accesa !== false)
  res.json({ ok: true, automazioni: automazioni.elenco() })
})

/** Falla girare adesso, senza aspettare la sua ora. Per vederla lavorare. */
app.post('/api/automazioni/:id/adesso', async (req, res) => {
  const a = automazioni.ricette().find(x => x.id === req.params.id)
  if (!a) return res.status(404).json({ errore: 'Non conosco questa automazione.' })
  try {
    // a mano: un dito che preme non è la spesa ricorrente che il tetto del
    // giorno tiene a bada, e «ha guardato e non c'era niente» sarebbe una bugia
    const esito = await automazioni.fai(a, { aMano: true })
    res.json({ ok: true, esito, automazioni: automazioni.elenco(), compiti: store.elencoCompiti() })
  } catch (e) { errore(res, e) }
})

/**
 * Cambiarla dicendo a parole cosa deve cambiare.
 *
 * Sta accanto al `PATCH` a campi e non al suo posto: sono due gesti diversi
 * per due momenti diversi. Il modulo serve quando sai già quale tendina
 * toccare; questo serve quando sai cosa vuoi e non dove sta.
 */
/**
 * Cosa guarderebbe adesso, senza fare niente.
 *
 * Non è «provala adesso» con un altro nome: quella scrive una riga in lista e
 * chiama il modello. Questa fa girare solo la metà che sceglie il materiale e
 * si ferma — nessuna scrittura, nessun token, nessun `ultima` spostato — e
 * serve a rispondere alla domanda che si fa chi sta scrivendo le parole della
 * ricerca: «con queste, cosa troverebbe?». Si può premere venti volte di fila.
 */
app.get('/api/automazioni/:id/anteprima', (req, res) => {
  try {
    res.json({ ok: true, ...automazioni.anteprima(req.params.id) })
  } catch (e) { errore(res, e, 404) }
})

app.post('/api/automazioni/:id/riscrivi', async (req, res) => {
  try {
    const a = await automazioni.riscrivi(req.params.id, String(req.body?.richiesta ?? ''))
    res.json({ ok: true, id: a.id, automazioni: automazioni.elenco() })
  } catch (e) { errore(res, e, 400) }
})

/** Falla guardare a Claude e falla scrivere meglio. Solo su richiesta. */
app.post('/api/automazioni/:id/ottimizza', async (req, res) => {
  try {
    const a = await automazioni.ottimizza(req.params.id)
    res.json({ ok: true, id: a.id, automazioni: automazioni.elenco() })
  } catch (e) { errore(res, e, 400) }
})

/** Spostarla in una cartella. `raccolta: null` la tira fuori da tutte. */
app.post('/api/automazioni/:id/raccolta', (req, res) => {
  if (!automazioni.ricette().some(a => a.id === req.params.id)) {
    return res.status(404).json({ errore: 'Non conosco questa automazione.' })
  }
  const dove = req.body?.raccolta
  const nome = dove == null ? null : String(dove).trim().slice(0, 40) || null
  // in una cartella che non esiste non ci si mette niente: sparirebbe
  if (nome && !store.raccolte().some(r => r.nome === nome)) {
    return res.status(400).json({ errore: 'Questa cartella non c’è.' })
  }
  store.mettiInRaccolta(req.params.id, nome)
  res.json({ ok: true, automazioni: automazioni.elenco(), raccolte: store.raccolte() })
})

// — le cartelle in cui te le organizzi —

app.get('/api/raccolte', (_req, res) => {
  res.json({ raccolte: store.raccolte() })
})

app.post('/api/raccolte', (req, res) => {
  const nome = String(req.body?.nome ?? '').trim().slice(0, 40)
  if (!nome) return res.status(400).json({ errore: 'Dalle un nome.' })
  if (!store.creaRaccolta(nome)) return res.status(400).json({ errore: 'Ce n’è già una che si chiama così.' })
  res.json({ ok: true, raccolte: store.raccolte() })
})

app.patch('/api/raccolte/:nome', (req, res) => {
  const a = String(req.body?.nome ?? '').trim().slice(0, 40)
  if (!a) return res.status(400).json({ errore: 'Dalle un nome.' })
  if (!store.rinominaRaccolta(req.params.nome, a)) {
    return res.status(400).json({ errore: 'Non si può: o non c’è, o ce n’è già una con quel nome.' })
  }
  res.json({ ok: true, raccolte: store.raccolte(), automazioni: automazioni.elenco() })
})

app.delete('/api/raccolte/:nome', (req, res) => {
  // quello che c'era dentro torna in elenco: si butta la cartella, non il lavoro
  if (!store.buttaRaccolta(req.params.nome)) return res.status(404).json({ errore: 'Questa cartella non c’è.' })
  res.json({ ok: true, raccolte: store.raccolte(), automazioni: automazioni.elenco() })
})

/**
 * Il catalogo degli attrezzi, con dentro cosa è collegato.
 *
 * È quello che riempie il menù della chiocciola. `collegato` non serve a
 * nascondere niente — un attrezzo che non puoi ancora usare si vede lo stesso,
 * spento, perché è così che uno scopre che Myynd saprebbe leggergli il
 * calendario. Serve a non far scrivere un'automazione che ogni mattina non
 * troverà niente senza che nessuno le abbia detto perché.
 */
app.get('/api/attrezzi', (_req, res) => {
  res.json({ attrezzi: attrezzi.catalogo(), cartelle: cfg.leggi().desktop?.cartelle ?? [] })
})

// — portare il proprio Myynd altrove —

/**
 * Il proprio Myynd, in un file.
 *
 * `express.raw` sulla rotta che riceve, e con un tetto alto: un indice vero
 * pesa una decina di megabyte, e il limite di due che vale per il resto
 * dell'API farebbe fallire l'importazione con un errore che parla di JSON.
 */
/**
 * Portarsi via tutto chiede la password, adesso.
 *
 * Nel pacco ci sono la password della casella e i token di ogni fonte: con
 * una sessione rubata — una scheda lasciata aperta, un token copiato — si
 * portava via tutto in una richiesta. La password la sa solo lei.
 */
app.post('/api/trasloco/esporta', async (req, res) => {
  try {
    const v = await auth.verificaPassword(chi.serve(), String(req.body?.password ?? ''))
    if (!v.ok) {
      if (v.attesa > 0) return res.status(429).json({ errore: auth.fraTroppi(v.attesa) })
      return res.status(403).json({ errore: 'La password non è corretta.' })
    }
    const pacco = trasloco.esporta()
    const oggi = new Date().toISOString().slice(0, 10)
    res.setHeader('content-type', 'application/gzip')
    res.setHeader('content-disposition', `attachment; filename="myynd-${oggi}.myynd"`)
    res.send(pacco)
  } catch (e) { errore(res, e) }
})

/*
 * Cento megabyte e non duecento: il pacco si apre in memoria, in un colpo
 * solo, e quello che si apre pesa il doppio di quello che arriva. Un file
 * costruito apposta teneva fermo il processo — di tutti — per il tempo di
 * gonfiarsi. E non mentre una lettura è in corso: l'indice si sostituisce
 * sotto i piedi di chi ci sta scrivendo, e quel lavoro finisce in un file che
 * non esiste più.
 */
app.post('/api/trasloco', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
  try {
    const dati = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (!dati.length) return res.status(400).json({ errore: 'Non è arrivato nessun file.' })
    if (sincronizzazioneInCorso()) return res.status(409).json({ errore: 'Una lettura è già in corso.' })
    sincronizzazioniInCorso.add(chi.adesso() ?? '')
    try {
      res.json({ ok: true, ...await trasloco.importa(dati) })
    } finally {
      sincronizzazioniInCorso.delete(chi.adesso() ?? '')
    }
  } catch (e) { errore(res, e, 400) }
})

// — memoria: quello che Myynd sa di te —
//
// Deve essere leggibile e modificabile dalla persona. Non è una comodità: un
// gemello che tiene convinzioni su di te che non puoi vedere né correggere non
// è uno strumento, e nessuno gli consegna la propria posta.

app.get('/api/memoria', (_req, res) => {
  res.json({
    // quello che ha imparato è nella lingua in cui gliel'hai detto, e può
    // non essere quella che stai leggendo: la schermata lo scopre da qui
    daTradurre: traduci.daTradurre(cfg.lingua()),
    carta: memoria.carta(),
    blocchi: memoria.BLOCCHI_BASE.map(b => {
      const scritto = store.blocchi().find(x => x.etichetta === b.etichetta)
      return {
        ...b,
        valore: scritto?.valore ?? '', tetto: scritto?.tetto ?? 700,
        // chi ha parlato per ultimo. Un ritratto scritto da una macchina che
        // non dice di averlo scritto è la cosa contro cui è fatta questa
        // schermata: si vede, e si corregge.
        daMe: scritto?.daMe ?? null
      }
    }),
    convinzioni: store.convinzioni(),
    storiche: store.convinzioniStoriche()
  })
})

/**
 * Rimettere in ordine adesso quello che ha imparato.
 *
 * Gira già da solo ogni sei ore. Questo bottone esiste per il momento in cui
 * uno finisce una conversazione lunga e vuole *vedere* cosa ne è uscito, invece
 * di scoprirlo domani per caso. `forza` salta i cancelli del tempo, non quelli
 * del materiale: se non c'è abbastanza da dire, non inventa niente.
 */
app.post('/api/memoria/consolida', async (_req, res) => {
  try { res.json({ ok: true, ...await memoria.consolida(true), blocchi_ora: store.blocchi() }) }
  catch (e) { errore(res, e) }
})

/** Mettere la memoria nella lingua dell'interfaccia. Lo chiede la schermata. */
app.post('/api/memoria/traduci', async (_req, res) => {
  try {
    const n = await traduci.soloMemoria(cfg.lingua())
    res.json({ ok: true, tradotte: n })
  } catch (e) { errore(res, e) }
})

app.post('/api/memoria/blocco', (req, res) => {
  const { etichetta, valore } = req.body ?? {}
  if (!etichetta) return res.status(400).json({ errore: 'Serve l\'etichetta del blocco.' })
  const base = memoria.BLOCCHI_BASE.find(b => b.etichetta === etichetta)
  store.scriviBlocco({
    etichetta: String(etichetta),
    descrizione: base?.descrizione ?? String(req.body?.descrizione ?? ''),
    valore: String(valore ?? '')
  })
  res.json({ ok: true })
})

/**
 * Rimettere in ordine una nota, senza aggiungerci niente.
 *
 * Non salva: restituisce e basta. Chi ha scritto quella nota deve poter
 * leggere la versione riordinata *prima* che diventi quello che Myynd pensa
 * di lei — e poter dire di no.
 */
app.post('/api/memoria/riscrivi', async (req, res) => {
  const etichetta = String(req.body?.etichetta ?? '')
  const testo = String(req.body?.testo ?? '')
  if (!testo.trim()) return res.status(400).json({ errore: 'Non c\'è niente da riordinare.' })
  const base = memoria.BLOCCHI_BASE.find(b => b.etichetta === etichetta)
  try {
    const fuori = await memoria.riscrivi(base?.descrizione ?? '', testo)
    if (!fuori) return res.status(400).json({ errore: 'Non sono riuscito a riordinarla.' })
    res.json({ testo: fuori })
  } catch (e) { errore(res, e) }
})

app.post('/api/memoria/convinzione', (req, res) => {
  const { enunciato, ambito } = req.body ?? {}
  if (!String(enunciato ?? '').trim()) return res.status(400).json({ errore: 'Scrivi la convinzione.' })
  // scritta a mano da lei: è esplicita per definizione, e non si discute
  const id = store.ricorda({
    enunciato: String(enunciato).trim(),
    ambito: String(ambito || 'persona'),
    genere: 'esplicita',
    fiducia: 1,
    origine: 'mano'
  })
  res.json({ ok: true, id })
})

app.delete('/api/memoria/convinzione/:id', (req, res) => {
  store.scordaConvinzione(req.params.id)
  res.json({ ok: true })
})

/**
 * «Tienila»: una convinzione indotta comincia a contare.
 *
 * Finché nessuno l'ha guardata non entra in nessun prompt — vedi
 * `memoria.attendibile`. È l'unico gesto che la fa passare da una cosa che
 * Myynd ha creduto di notare a una cosa su cui può ragionare.
 */
app.post('/api/memoria/convinzione/:id/conferma', (req, res) => {
  if (!store.confermaConvinzione(req.params.id)) {
    return res.status(404).json({ errore: 'Questa convinzione non c’è più.' })
  }
  res.json({ ok: true })
})

/** Quello che avevi preparato contro quello che ha mandato davvero. */
app.post('/api/memoria/correzione', async (req, res) => {
  const { bozza, inviato } = req.body ?? {}
  try {
    const n = await memoria.imparaDallaCorrezione(String(bozza ?? ''), String(inviato ?? ''))
    res.json({ ok: true, imparate: n })
  } catch (e) { errore(res, e) }
})

// — chat —

app.get('/api/chat', (_req, res) => res.json(store.elencoChat()))
app.get('/api/chat/:id', (req, res) => res.json(store.messaggi(req.params.id)))
app.delete('/api/chat/:id', (req, res) => { store.eliminaChat(req.params.id); res.json({ ok: true }) })

/**
 * La risposta, mentre nasce.
 *
 * Manda il testo a pezzi via SSE invece di far aspettare la fine. Il tempo
 * totale è lo stesso; quello che cambia è che comincia subito — e su una
 * risposta da venti secondi è la differenza fra uno strumento e una clessidra.
 *
 * Gli errori arrivano come evento, non come stato HTTP: la risposta è già
 * partita con 200, quindi un 500 a metà non esiste più come opzione.
 */
app.post('/api/chat/:id', async (req, res) => {
  const chat = req.params.id
  const domanda: string = req.body?.testo ?? ''
  if (!domanda.trim()) return res.status(400).json({ errore: 'Scrivi qualcosa.' })

  const idMsg = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const idUtente = idMsg('u')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const invia = (d: unknown) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(d)}\n\n`) }

  // Un battito, mentre il modello ragiona.
  //
  // Fra «inizio» e la prima parola possono passare venti secondi in cui sul
  // filo non viaggia niente, e un socket che tace è un socket che un proxy si
  // sente autorizzato a chiudere. Due punti e un a capo non sono un evento —
  // chi legge li salta — ma tengono la linea viva.
  const battito = setInterval(() => { if (!res.writableEnded) res.write(': vivo\n\n') }, 15_000)
  // Se il browser se ne va a metà, si ferma anche il modello: una risposta a
  // quattro giri che nessuno legge costa come una che si legge.
  const controllo = new AbortController()
  res.on('close', () => { clearInterval(battito); if (!res.writableEnded) controllo.abort() })

  try {
    if (!store.esisteChat(chat)) {
      store.creaChat(chat, domanda.slice(0, 40))
      claude.titoloChat(domanda).then(t => store.rinominaChat(chat, t)).catch(() => {})
    }
    // la conversazione precedente, così i seguiti hanno senso
    const storico = store.messaggi(chat).map(m => ({ ruolo: m.role, testo: m.text }))
    store.salvaMessaggio({ id: idUtente, chat, ruolo: 'u', testo: domanda })
    invia({ fase: 'inizio' })

    const r = await claude.rispondiInStreaming(domanda, storico, delta => invia({ fase: 'testo', delta }), {
      // «segnati che devo richiamare Rossi» detto in chat finisce in lista, e
      // «falla fare a te» la affida pure: la lista e la chat sono la stessa testa
      aggiungiCompito: ({ testo, quando, modo }) => {
        const dove = SECCHI.includes(String(quando)) ? String(quando) : 'oggi'
        const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        store.scriviCompito({ id, testo, quando: dove, ordine: ordine.dopo(store.ultimoOrdine(dove)), origine: 'chat' })
        if (modo === 'bozza' || modo === 'tutto') compiti.affida(id, modo)
        compiti.annunciaCambio()
        return { id }
      }
      // Claude Code è caduto dopo aver già scritto mezza risposta, e il motore
      // a chiave sta per rifarla da capo: chi guarda butta via quella mezza,
      // invece di vedersela accodare a quella intera.
    }, controllo.signal, () => invia({ fase: 'ricomincio' }))
    store.salvaMessaggio({ id: idMsg('a'), chat, ruolo: 'a', testo: r.testo, fonti: r.fonti })
    invia({ fase: 'fine', messaggi: store.messaggi(chat) })

    // La memoria si aggiorna dopo aver risposto, mai prima: chi scrive non deve
    // aspettare che Myynd rifletta su di lui. Se fallisce, la chat resta valida.
    // E se se n'è andato prima della fine, non si riflette su una risposta che
    // non ha letto.
    if (!controllo.signal.aborted) {
      memoria.distilla([{ ruolo: 'u', testo: domanda }, { ruolo: 'a', testo: r.testo }])
        .catch(() => {})
    }
  } catch (e) {
    // niente domanda orfana se la risposta non arriva
    store.togliMessaggio(idUtente)
    invia({ fase: 'errore', errore: e instanceof Error ? e.message : String(e) })
  } finally {
    clearInterval(battito)
    if (!res.writableEnded) res.end()
  }
})

// Svuotare l'indice è irreversibile e non ha nessun chiamante nell'app: finché
// non ce l'ha, tenerlo raggiungibile è solo un grilletto lasciato carico.
// Quando servirà, dovrà chiedere l'email dell'account nel corpo e fare
// un'istantanea prima di cancellare.
app.post('/api/azzera', (req, res) => {
  const conferma = String(req.body?.conferma ?? '')
  const conto = auth.conto()
  if (!conto || conferma !== conto.email) {
    return res.status(400).json({ errore: 'Per svuotare la mente serve la conferma con la tua email.' })
  }
  store.azzeraTutto()
  res.json({ ok: true })
})

// qualunque cosa sfugga ai singoli handler esce come JSON, non come stack HTML
/**
 * Un'API che non esiste risponde come un'API.
 *
 * Senza questa, una rotta sbagliata cadeva fino al 404 di serie di Express, che
 * è una paginetta HTML: il client provava a leggerla come JSON e diceva
 * «Errore 404» senza sapere altro. Poco male finché lo sbaglio è nostro, ma è
 * il tipo di risposta che rende difficile capire cosa è andato storto.
 */
app.use('/api', (_req, res) => {
  res.status(404).json({ errore: 'Questa strada non esiste.' })
})

/**
 * Qualunque percorso che non sia un'API è l'app.
 *
 * In fondo a tutto, così non copre nessuna rotta vera, e sotto la guardia
 * perché a questo punto `express.static` ha già risposto per i file veri: qui
 * arrivano solo gli indirizzi interni dell'interfaccia.
 */
if (existsSync(INTERFACCIA)) {
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(INTERFACCIA, 'index.html')))
}

app.use((e: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('myynd · errore non gestito:', e instanceof Error ? e.message : e)
  if (!res.headersSent) res.status(500).json({ errore: 'Errore interno.' })
})

/**
 * Un lavoro di sfondo che non può portarsi giù il server.
 *
 * `void fai()` non è una rete: una promessa rifiutata e senza `catch` è un
 * rifiuto non gestito, e per Node quello è un motivo per chiudere il processo.
 * È successo davvero — il giro delle automazioni cercava una tabella che non
 * c'era — e da fuori non si vedeva un'automazione rotta: si vedeva Myynd che
 * non risponde più, due minuti dopo averlo aperto.
 *
 * Un timer che chiama qualcosa non può decidere se l'app resta viva. Qui il
 * guaio finisce nel terminale, e al giro dopo ci si riprova.
 */
function aParte(cosa: string, fai: () => Promise<unknown>): () => void {
  const guaio = (e: unknown) => console.error(`myynd · ${cosa}:`, e instanceof Error ? e.message : e)
  return () => { try { fai().catch(guaio) } catch (e) { guaio(e) } }
}

/**
 * Lo stesso lavoro, per ognuno.
 *
 * I giri di sfondo — rileggere le fonti, far girare le automazioni, mettere in
 * ordine quello che si è imparato — sono nati quando la persona era una sola e
 * lavoravano su «la» configurazione e «l'» indice. Fuori da una richiesta non
 * c'è nessun contesto aperto, quindi senza questo giro lavorerebbero sulla
 * cartella radice: cioè su nessuno, in silenzio, mentre le automazioni di tutti
 * non girano mai.
 *
 * Uno per volta e non tutti insieme, di proposito: sono letture di caselle di
 * posta e chiamate a un modello, e farne dieci in parallelo vuol dire dieci
 * volte il carico nello stesso istante per finire tutto qualche secondo prima.
 * E il guaio di uno non ferma gli altri — è il caso normale, non l'eccezione:
 * basta una casella che non risponde.
 */
function perOgnuno(cosa: string, fai: () => Promise<unknown>): () => void {
  return aParte(cosa, async () => {
    for (const utente of conti.tutti()) {
      try {
        await chi.dentro(utente, fai)
      } catch (e) {
        console.error(`myynd · ${cosa} (${utente}):`, e instanceof Error ? e.message : e)
      }
    }
  })
}

/*
 * Prima di ascoltare: i conti, e le configurazioni.
 *
 * In casa è un attimo. Su Postgres è la creazione delle tabelle e la lettura
 * di tutto quello che c'è — e finché non è fatto la guardia non saprebbe di
 * chi è nessun token. Quindi si aspetta, e si ascolta dopo. Un server che
 * risponde «sessione scaduta» a tutti per due secondi all'avvio è un server
 * che sembra rotto.
 */
await conti.avvia()
await cfg.avvia()

/*
 * Chi c'era prima che i conti fossero più di uno.
 *
 * Un'installazione che gira da mesi ha l'account dentro `config.json` nella
 * radice, e accanto tutto il resto. Senza questo passaggio si riaprirebbe
 * Myynd e si troverebbe una schermata che chiede di registrarsi, con mesi di
 * lavoro ancora sul disco ma invisibili.
 */
{
  const vecchio = cfg.leggi().account
  if (vecchio && !conti.quanti()) {
    const id = await conti.adotta(vecchio.email, vecchio.sale, vecchio.hash, cfg.RADICE)
    if (id) {
      // chi c'era già le aveva, con la loro storia di quante volte sono girate:
      // toglierle in un aggiornamento sarebbe stato peggio che non averle mai date
      cfg.aggiorna({ diSerie: true })
      console.log(`myynd · l'account che c'era già è adesso un conto: ${vecchio.email}`)
    }
  }
}

/*
 * Spegnersi per bene.
 *
 * Railway manda SIGTERM a ogni redeploy. Su Postgres le configurazioni
 * partono un attimo dopo la scrittura: chiudere il processo in quell'attimo
 * vorrebbe dire perdere l'ultima cosa che qualcuno ha salvato — una password
 * di posta appena scritta, per dire. Prima si finisce di scrivere, poi si esce.
 */
for (const segnale of ['SIGTERM', 'SIGINT'] as const) {
  process.once(segnale, () => {
    cfg.scaricato(10_000)
      .catch(e => console.error('myynd · spegnendomi non sono riuscito a scrivere tutto:', e instanceof Error ? e.message : e))
      .finally(() => process.exit(0))
  })
}

/**
 * La porta occupata non deve essere una traccia di stack.
 *
 * È esattamente il caso che il commento sulla porta qui sopra dice di voler
 * evitare — e finora l'unica difesa era chiedere la porta 0. Se qualcuno parte
 * sulla 5174 e la trova presa, deve leggere una frase, non un errore di Node.
 */
const servizio = app.listen(PORTA_CHIESTA, ospitato.INDIRIZZO, () => {
  /*
   * `address()` è `null` finché il server non è davvero in ascolto.
   *
   * Il commento qui sopra prometteva che una porta occupata non sarebbe stata
   * una traccia di stack, e poi la difesa non c'era: nessuno ascoltava
   * l'evento `error`, questa riga leggeva `.port` di `null`, e quello che
   * arrivava sul terminale era «Cannot read properties of null» — un errore
   * che parla di tutt'altro e che manda a cercare il guasto nel posto
   * sbagliato. Il vero motivo, EADDRINUSE, non compariva da nessuna parte.
   */
  const dove = servizio.address()
  if (!dove || typeof dove === 'string') return
  porta = dove.port
  // chi ha avviato questo processo deve sapere dove bussare. `parentPort` lo
  // aggiunge Electron quando gira come utilityProcess: fuori di lì non c'è, e
  // non deve essere un errore — questo file parte anche da solo con `node`.
  const dentroElectron = process as unknown as { parentPort?: { postMessage(m: unknown): void } }
  dentroElectron.parentPort?.postMessage({ porta })
  console.log(`myynd · server su http://${ospitato.INDIRIZZO}:${porta}`)
  if (ospitato.OSPITATO) {
    console.log(
      `myynd · ospitato${ospitato.DOMINIO ? ` su ${ospitato.DOMINIO}` : ' (dominio non ancora noto)'}` +
      ` · i dati stanno in ${ospitato.DATI}`
    )
    /*
     * E quei dati sopravvivono al prossimo redeploy, o no?
     *
     * Senza un volume montato la risposta è no, e il modo in cui lo si scopre
     * è il peggiore possibile: tutto funziona finché non si ridistribuisce,
     * poi i conti non ci sono più e chi prova a entrare con la password giusta
     * si sente rispondere che è sbagliata. Nessun errore, da nessuna parte,
     * dice cos'è successo — il database è integro, semplicemente è nuovo.
     *
     * Va detto adesso, all'avvio, mentre c'è ancora tempo per montarlo.
     */
    if (ospitato.suUnVolume() === false) {
      // con Postgres i conti e le configurazioni restano: a rifarsi è solo
      // l'indice, e va detto con il peso giusto — non è più «hai perso tutto»
      console.error(postgres.ATTIVO
        ? `myynd · ATTENZIONE: ${ospitato.DATI} non sta su un volume. I conti e le credenziali sono su Postgres ` +
          'e restano; ma a ogni ridistribuzione spariscono i compiti, la memoria, le chat, le automazioni scritte ' +
          `qui e il registro dell'uso — non si rifanno rileggendo le fonti. Su Railway: Volume → Mount path ${ospitato.DATI}.`
        : `myynd · ATTENZIONE: ${ospitato.DATI} non sta su un volume.\n` +
          '  È il disco del contenitore: a ogni ridistribuzione riparte vuoto —\n' +
          '  nessun conto, nessun documento, nessuna automazione. Chi si era\n' +
          '  registrato troverà «indirizzo o password non corretti» con la password giusta.\n' +
          `  Su Railway: Volume → Mount path ${ospitato.DATI}, poi ridistribuisci — ` +
          'oppure MYYND_POSTGRES, e i conti non dipendono più dal disco.')
    }
  }

  // un compito il cui lavoro è morto insieme al processo non torna da solo:
  // senza questa riga resta «da Myynd» per sempre, e la lista mente
  // la prima rilettura non è all'avvio ma dopo un minuto: accendere l'app non
  // deve voler dire aspettare che abbia finito di leggere la posta
  const rilettura = perOgnuno('la rilettura automatica si è fermata', rileggiDaSola)
  setTimeout(rilettura, 60_000)
  setInterval(rilettura, OGNI)

  // Le automazioni guardano l'orologio ogni quarto d'ora. Il primo giro dopo
  // due minuti e non subito: all'avvio c'è già la lettura delle fonti, e due
  // cose pesanti insieme si sentono proprio nel momento in cui si apre l'app.
  // dentro un contesto qualunque: le ricette di serie sono le stesse per
  // tutti, e fuori da un contesto questa riga leggerebbe la cartella radice
  const quante = conti.tutti().length
    ? chi.dentro(conti.tutti()[0], () => automazioni.ricette().length)
    : 0
  if (quante) console.log(`myynd · ${quante} automazion${quante === 1 ? 'e' : 'i'} in linea`)
  // il giro non conta come «questa persona sta usando Myynd»: vedi senzaToccare
  const giro = perOgnuno('il giro delle automazioni si è fermato', () => store.senzaToccare(() => automazioni.giro()))
  setTimeout(giro, 120_000)
  setInterval(giro, automazioni.OGNI)

  // E le ricette nuove: subito dopo l'avvio — è il momento in cui una persona
  // ha appena riaperto l'app e potrebbe averne una che l'aspetta — e poi ogni
  // sei ore. Prima del primo giro delle automazioni, così una ricetta appena
  // pubblicata può girare oggi stesso.
  // Quello che è già scritto nella lingua sbagliata.
  //
  // Finora la traduzione partiva solo quando si *cambiava* lingua. Ma chi ha
  // l'app in inglese da sempre, e in lista una domanda scritta in italiano da
  // una versione che si dimenticava di dirlo al modello, non ha mai cambiato
  // niente: quella frase gli resta lì sotto gli occhi per sempre. Si guarda una
  // volta all'avvio, e si tocca solo se serve davvero — la prova è contare
  // parole, non chiamare un modello.
  setTimeout(perOgnuno('la rimessa in lingua non è riuscita', async () => {
    const l = cfg.lingua()
    if (!traduci.daTradurre(l) && !traduci.compitiDaTradurre(l)) return
    const n = await traduci.inLingua(l)
    if (n) console.log(`myynd · ${n} cose riscritte nella lingua dell'app`)
  }), 40_000)

  const ricette = perOgnuno('le ricette non si sono aggiornate', () => automazioni.aggiornaRicette())
  setTimeout(ricette, 20_000)
  setInterval(ricette, 6 * 3600_000)

  /*
   * Le due cose che si scrivono da sole.
   *
   * Sono i due campi che restavano vuoti per sempre, e per la stessa ragione:
   * nessuno si siede a rispondere in astratto a «su cosa vuoi essere tenuto
   * aggiornato?» o a «come decidi una cosa?». Le risposte però esistono già —
   * una in quello che apre ogni mattina, l'altra in quello che Myynd ha
   * imparato parlandogli — e finora nessuna delle due arrivava dove serviva.
   *
   * Girano in sottofondo e hanno i loro cancelli dentro: senza materiale nuovo
   * non chiamano nessun modello, e quello che chiamano è il più economico che
   * c'è. Tardi dopo l'avvio, apposta: aprire l'app non deve voler dire
   * aspettare che finisca di ragionare su di te.
   */
  const imparaDaSolo = perOgnuno('non sono riuscito a mettere in ordine quello che ho imparato', async () => {
    const argomenti = await gusto.tieniAggiornati()
    if (argomenti) console.log(`myynd · argomenti scritti da quello che leggi: ${argomenti}`)
    const m = await memoria.consolida()
    if (m.blocchi.length) {
      console.log(`myynd · ritratto aggiornato: ${m.blocchi.join(', ')} (da ${m.guardate} convinzioni)`)
    }
  })
  setTimeout(imparaDaSolo, 180_000)
  setInterval(imparaDaSolo, 6 * 3600_000)

  /**
   * La rassegna, prima di tutto il resto.
   *
   * Dieci secondi dopo l'avvio, e non un minuto: è la prima cosa che si guarda
   * la mattina, e deve essere già lì quando la pagina finisce di aprirsi.
   * Costa poco — quindici richieste a dei feed pubblici — e `aggiorna()` senza
   * `forza` non fa niente se ce n'è già una di meno di tre ore fa, quindi
   * riaprire l'app dieci volte in una mattina non rifà dieci rassegne.
   *
   * Poi ogni ora: la finestra utile la decide `ORE_VALIDA`, e guardare più
   * spesso di così serve solo a essere pronti quando quelle tre ore scadono
   * mentre l'app è aperta.
   */
  const giornali = perOgnuno('la rassegna non si è aggiornata', () => rassegna.aggiorna(false))
  setTimeout(giornali, 10_000)
  setInterval(giornali, 3600_000)

  /*
   * La compattazione, una volta al giorno e per ognuno.
   *
   * Non è manutenzione per il gusto di farla: quello che si cancella — una
   * fonte scollegata, una riconciliazione, un indice di ricerca rifatto da una
   * migrazione — resta a occupare il file finché qualcuno non lo riscrive.
   * `compatta()` guarda prima se ne vale la pena, quindi quasi tutti i giorni
   * non fa niente e non costa niente.
   */
  const compattazione = perOgnuno('la compattazione si è fermata', async () => {
    // prima che si guardi lo spazio: un indice di ricerca marcio non si vede
    // da nessuna parte — i documenti ci sono e non si trovano — e l'unico modo
    // di accorgersene è chiederglielo
    const i = store.verificaLIndice()
    if (i.rifatto) console.log('myynd · indice di ricerca rifatto: i documenti erano lì, l’indice no')
    const e = store.compatta()
    if (e.fatto) console.log(`myynd · compattato l'indice: ${e.liberate} pagine riprese`)
  })
  setTimeout(compattazione, 10 * 60_000)
  setInterval(compattazione, 24 * 3600_000)

  /*
   * I compiti rimasti a metà si riaprono, per ognuno.
   *
   * Sta dentro `chi.dentro` come tutto il resto: fuori da un contesto questa
   * riga aprirebbe l'indice della radice — che non è di nessuno — e i compiti
   * appesi di tutti resterebbero appesi per sempre.
   */
  // l'adozione del conto che c'era prima è più su, prima di mettersi in
  // ascolto: su Postgres è una scrittura da aspettare, e qui non si può

  let appesi = 0
  /*
   * Gli indici si aprono — e si migrano — adesso, per tutti, invece che dentro
   * la prima richiesta di ognuno. Una migrazione che rilegge il corpus intero
   * dentro una richiesta è una pagina che gira per un minuto senza dire perché.
   * Qui invece è una riga nel registro, prima che qualcuno bussi.
   */
  for (const u of conti.tutti()) {
    try { chi.dentro(u, () => store.conteggi()) } catch (e) {
      console.error(`myynd · l'indice di ${u} non si apre:`, e instanceof Error ? e.message : e)
    }
  }
  for (const u of conti.tutti()) {
    try { appesi += chi.dentro(u, () => compiti.riprendiAppesi()) } catch { /* uno rotto non ferma gli altri */ }
  }
  if (appesi) console.log(`myynd · ${appesi} compit${appesi === 1 ? 'o rimasto' : 'i rimasti'} a metà, riaperti`)
  const quantiConti = conti.quanti()
  console.log(`myynd · ${quantiConti} cont${quantiConti === 1 ? 'o' : 'i'} su questa installazione`)
  if (ospitato.OSPITATO && !ospitato.REGISTRAZIONE_SCELTA) {
    const r = auth.registrazione()
    console.log(r === 'aperta'
      ? 'myynd · registrazione aperta finché non c\'è il primo conto; poi si chiude (MYYND_REGISTRAZIONE per decidere)'
      : `myynd · registrazione ${r === 'invito' ? 'a invito (MYYND_INVITO)' : 'chiusa'}: MYYND_REGISTRAZIONE=aperta per riaprirla`)
  }

  if (auth.DEV) {
    // un build vero non deve poter nascere con questa variabile accesa — e un
    // server nemmeno: `npm start` su una macchina remota non mette NODE_ENV,
    // e una sessione dal token noto sarebbe una porta aperta sul primo conto
    if (process.env.NODE_ENV === 'production' || ospitato.OSPITATO) throw new Error('MYYND_DEV acceso in un build di produzione')
    void auth.apriSessioneDiSviluppo()
    console.log('myynd · MYYND_DEV=1 — sessione di sviluppo aperta, l\'accesso è già fatto')
  }
})

servizio.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(
      `myynd · la porta ${PORTA_CHIESTA} è già occupata. ` +
      'Un altro Myynd è già aperto, oppure c\'è qualcos\'altro su quella porta. ' +
      'Con MYYND_PORT=0 se ne fa scegliere una libera.'
    )
  } else {
    console.error('myynd · il server non è partito:', e.message)
  }
  process.exit(1)
})
