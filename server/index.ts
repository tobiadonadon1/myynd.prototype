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
import * as notion from './connettori/notion.ts'
import * as slack from './connettori/slack.ts'
import * as drive from './connettori/drive.ts'
import * as microsoft from './connettori/microsoft.ts'
import * as dropbox from './connettori/dropbox.ts'
import * as whatsapp from './connettori/whatsapp.ts'
import { CATALOGO } from './connettori/registro.ts'
import * as ospitato from './ospitato.ts'
import * as auth from './auth.ts'
import * as conti from './conti.ts'
import * as chi from './chi.ts'
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
app.get('/api/whatsapp/webhook', (req, res) => {
  const e = whatsapp.verifica(req.query as Record<string, unknown>)
  if (!e.ok) return res.status(403).end()
  res.type('text/plain').send(e.sfida)
})

app.post('/api/whatsapp/webhook', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  if (!whatsapp.firmaBuona(corpo, req.headers['x-hub-signature-256'] as string | undefined)) {
    return res.status(403).end()
  }
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
    const quanti = whatsapp.incassa(JSON.parse(corpo.toString('utf8')))
    if (quanti) console.log(`myynd · whatsapp: ${quanti} messagg${quanti === 1 ? 'io' : 'i'} arrivat${quanti === 1 ? 'o' : 'i'}`)
  } catch (e) {
    console.error('myynd · un messaggio di WhatsApp non si è lasciato leggere:', e instanceof Error ? e.message : e)
  }
  res.status(200).end()
})

app.use(express.json({ limit: '2mb' }))

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

app.get('/api/auth', (req, res) => {
  /*
   * Chi sei, non «esiste un account».
   *
   * Prima questa rotta diceva se sull'installazione c'era un conto, e la
   * schermata ne ricavava se mostrare «entra» o «crea». Con più persone quella
   * domanda non ha senso: chi apre la pagina sa se ha un conto, il server no.
   * La schermata adesso offre tutte e due le cose e lascia scegliere.
   */
  const utente = auth.tokenDi(req)
  const dentro = auth.valida(utente)
  const rispondi = () => res.json({
    entrato: dentro,
    account: dentro ? auth.conto() : null,
    ospitato: ospitato.OSPITATO
  })
  if (!dentro) return rispondi()
  chi.dentro(conti.utenteDelToken(utente)!, rispondi)
})

app.post('/api/auth/registra', (req, res) => {
  const { email, password } = req.body ?? {}
  const e = auth.registra(String(email ?? ''), String(password ?? ''))
  if (!e.ok) return res.status(400).json({ errore: e.errore })
  // dentro il contesto del conto appena fatto: `auth.conto()` legge da lì, e
  // fuori non saprebbe di chi parlare
  chi.dentro(e.utente, () => res.json({ ok: true, token: e.token, account: auth.conto() }))
})

app.post('/api/auth/entra', (req, res) => {
  const attesa = auth.attesa(String(req.body?.email ?? ''))
  if (attesa > 0) {
    const secondi = Math.ceil(attesa / 1000)
    return res.status(429).json({ errore: `Troppi tentativi. Riprova fra ${secondi} second${secondi === 1 ? 'o' : 'i'}.` })
  }
  const { email, password } = req.body ?? {}
  const e = auth.entra(String(email ?? ''), String(password ?? ''))
  if (!e.ok) return res.status(401).json({ errore: e.errore })
  chi.dentro(e.utente, () => res.json({ ok: true, token: e.token, account: auth.conto() }))
})

app.post('/api/auth/esci', (req, res) => {
  auth.esci(auth.tokenDi(req))
  res.json({ ok: true })
})

// da qui in giù serve essere dentro
app.use(auth.guardia)

function errore(res: express.Response, e: unknown, stato = 500) {
  const m = e instanceof Error ? e.message : String(e)
  res.status(stato).json({ errore: m })
}

// — stato generale —

app.get('/api/stato', (_req, res) => {
  const c = cfg.leggi()
  const n = store.conteggi()
  res.json({
    config: cfg.pubblica(c),
    conteggi: n,
    // quelli che leggono *questa macchina* non si offrono su un server: dentro
    // un contenitore troverebbero una cartella vuota, e chi li prova penserebbe
    // che sia rotto Myynd invece che fuori posto
    connettori: CATALOGO.filter(v => ospitato.disponibile(v.id)).map(v => ({
      ...v,
      collegato:
        v.id === 'posta' ? !!c.posta :
        v.id === 'desktop' ? !!c.desktop :
        v.id === 'notion' ? !!c.notion :
        v.id === 'claude' ? claude.collegato() :
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
    suggerimentiDesktop: desktop.suggerimenti(),
    presetPosta: posta.PRESET,
    home: homedir()
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
  for (const k of ['nome', 'ruolo', 'tono', 'autonomia', 'onboarding', 'modello', 'lingua', 'oreFatte', 'giro', 'argomenti'] as const) {
    if (b[k] !== undefined) patch[k] = b[k]
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
  const attivo = req.body?.attivo === true
  cfg.aggiorna({ abbonamento: { attivo } })
  try { res.json({ ok: true, ...await abbonamento.stato() }) } catch (e) { errore(res, e) }
})

app.post('/api/modello/locale', (req, res) => {
  const attivo = req.body?.attivo !== false
  const c = cfg.leggi()
  cfg.aggiorna({ locale: { ...(c.locale ?? {}), attivo } })
  res.json({ ok: true, attivo })
})

/** La chiave di Claude può già essere nell'ambiente: se c'è, un clic basta. */
app.get('/api/connettori/claude/ambiente', (_req, res) => {
  res.json({ presente: !!process.env.ANTHROPIC_API_KEY })
})

app.post('/api/connettori/claude/ambiente', async (_req, res) => {
  const k = process.env.ANTHROPIC_API_KEY
  if (!k) return res.status(400).json({ errore: 'Nessuna chiave nell\'ambiente.' })
  const e = await claude.prova(k)
  if (!e.ok) return res.status(400).json({ errore: e.errore })
  cfg.aggiorna({ claude: { apiKey: k } })
  res.json({ ok: true })
})

app.post('/api/connettori/posta', async (req, res) => {
  const { host, porta, utente, password, giorni, cartelle } = req.body ?? {}
  if (!host || !utente || !password) return res.status(400).json({ errore: 'Servono host, indirizzo e password.' })
  const c: cfg.ConfigPosta = { host, porta: Number(porta) || 993, utente, password, giorni: Number(giorni) || 30, cartelle }
  try {
    const esito = await posta.prova(c)
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ posta: c })
    res.json({ ok: true, cartelle: esito.cartelle, certificatoAdattato: esito.certificatoAdattato })
  } catch (e) { errore(res, e) }
})

app.post('/api/connettori/desktop', async (req, res) => {
  const cartelle: string[] = req.body?.cartelle ?? []
  if (!cartelle.length) return res.status(400).json({ errore: 'Scegli almeno una cartella.' })
  try {
    const esito = await desktop.prova({ cartelle })
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ desktop: { cartelle: esito.cartelle } })
    res.json({ ok: true, cartelle: esito.cartelle })
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

app.post('/api/connettori/claude', async (req, res) => {
  const apiKey: string = req.body?.apiKey ?? ''
  if (!apiKey) return res.status(400).json({ errore: 'Serve la chiave API.' })
  try {
    const esito = await claude.prova(apiKey)
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ claude: { apiKey } })
    res.json({ ok: true })
  } catch (e) { errore(res, e) }
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
  if (id !== 'claude') store.svuotaFonte(id)
  res.json({ ok: true })
})

// — sincronizzazione, in streaming —

let sincronizzazioneInCorso = false

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

  if (c.desktop && (!soloFonte || soloFonte === 'desktop')) {
    avvisa({ fase: 'desktop', stato: 'apro le cartelle' })
    const e = await desktop.sincronizza(c.desktop, n => avvisa({ fase: 'desktop', stato: `${n} documenti` }))
    store.salvaDocumenti(e.docs)
    // si cancella solo dalle radici percorse fino in fondo: altrove il
    // silenzio non prova niente
    // gli id visti contano quanto quelli indicizzati: un file che c'è ma che
    // non abbiamo riletto non è un file cancellato
    const tolti = store.riconcilia('desktop', { completo: !!e.complete.length, radiciViste: e.complete },
      [...e.docs.map(d => d.id), ...e.visti])
    totale += e.docs.length
    avvisa({
      fase: 'desktop', stato: 'fatto', documenti: e.docs.length,
      saltati: e.saltatiProgetti.length, falliti: e.falliti,
      illeggibili: e.illeggibili, troncato: e.troncato, tolti
    })
  }
  if (!fermo() && c.notion && (!soloFonte || soloFonte === 'notion')) {
    avvisa({ fase: 'notion', stato: 'leggo le pagine' })
    const e = await notion.sincronizza(c.notion)
    store.salvaDocumenti(e.docs)
    const tolti = store.riconcilia('notion', { completo: !e.interrotto },
      [...e.docs.map(d => d.id), ...e.visti])
    totale += e.docs.length
    avvisa({ fase: 'notion', stato: 'fatto', documenti: e.docs.length, parziali: e.parziali, interrotto: e.interrotto, tolti })
  }
  if (!fermo() && c.posta && (!soloFonte || soloFonte === 'posta')) {
    avvisa({ fase: 'posta', stato: 'mi collego alla casella' })
    const e = await posta.sincronizza(c.posta, (fatti, tot) =>
      avvisa({ fase: 'posta', stato: `${fatti} di ${tot} messaggi` }))
    store.salvaDocumenti(e.docs)
    totale += e.docs.length
    avvisa({
      fase: 'posta', stato: 'fatto', documenti: e.docs.length,
      cartelleFallite: e.cartelleFallite, troncato: e.troncato
    })
  }
  if (!fermo() && c.google && (!soloFonte || soloFonte === 'google')) {
    avvisa({ fase: 'google', stato: 'mi collego alla casella' })
    const e = await google.sincronizza(c.google, (fatti, tot) =>
      avvisa({ fase: 'google', stato: `${fatti} di ${tot} messaggi` }))
    store.salvaDocumenti(e.docs)
    totale += e.docs.length
    avvisa({ fase: 'google', stato: 'fatto', documenti: e.docs.length, troncato: e.troncato })
  }
  if (!fermo() && c.microsoft?.parti.includes('posta') && (!soloFonte || soloFonte === 'microsoft')) {
    avvisa({ fase: 'microsoft', stato: 'mi collego alla casella' })
    const e = await microsoft.sincronizzaPosta(c.microsoft, (fatti, tot) =>
      avvisa({ fase: 'microsoft', stato: `${fatti} di ${tot} messaggi` }))
    store.salvaDocumenti(e.docs)
    totale += e.docs.length
    avvisa({ fase: 'microsoft', stato: 'fatto', documenti: e.docs.length, troncato: e.troncato })
  }
  if (!fermo() && c.slack && (!soloFonte || soloFonte === 'slack')) {
    avvisa({ fase: 'slack', stato: 'apro le conversazioni' })
    const e = await slack.sincronizza(c.slack, (fatti, tot) =>
      avvisa({ fase: 'slack', stato: `${fatti} di ${tot} canali` }))
    store.salvaDocumenti(e.docs)
    /*
      Si riconcilia solo se nessun canale è caduto e non si è toccato il tetto.
      Un canale che non risponde non prova che le sue conversazioni siano
      sparite — e cancellarle vorrebbe dire perdere mesi di scambi per un
      errore di rete durato tre secondi.
    */
    const tolti = store.riconcilia('slack', { completo: !e.falliti.length && !e.troncato },
      e.docs.map(d => d.id))
    totale += e.docs.length
    avvisa({ fase: 'slack', stato: 'fatto', documenti: e.docs.length, falliti: e.falliti, troncato: e.troncato, tolti })
  }
  if (!fermo() && c.drive && (!soloFonte || soloFonte === 'drive')) {
    avvisa({ fase: 'drive', stato: 'apro i documenti' })
    const e = await drive.sincronizza(c.drive, (fatti, tot) =>
      avvisa({ fase: 'drive', stato: `${fatti} di ${tot} file` }))
    store.salvaDocumenti(e.docs)
    const tolti = store.riconcilia('drive', { completo: !e.troncato && !e.falliti },
      [...e.docs.map(d => d.id), ...e.visti])
    totale += e.docs.length
    avvisa({ fase: 'drive', stato: 'fatto', documenti: e.docs.length, falliti: e.falliti, troncato: e.troncato, tolti })
  }
  if (!fermo() && c.microsoft?.parti.includes('file') && (!soloFonte || soloFonte === 'sharepoint')) {
    avvisa({ fase: 'sharepoint', stato: 'apro i siti' })
    const e = await microsoft.sincronizzaFile(c.microsoft, (fatti, tot) =>
      avvisa({ fase: 'sharepoint', stato: `${fatti} di ${tot} file` }))
    store.salvaDocumenti(e.docs)
    const tolti = store.riconcilia('sharepoint', { completo: e.completo },
      [...e.docs.map(d => d.id), ...e.visti])
    totale += e.docs.length
    avvisa({ fase: 'sharepoint', stato: 'fatto', documenti: e.docs.length, falliti: e.falliti, troncato: e.troncato, tolti })
  }
  if (!fermo() && c.dropbox && (!soloFonte || soloFonte === 'dropbox')) {
    avvisa({ fase: 'dropbox', stato: 'apro la cartella' })
    const e = await dropbox.sincronizza(c.dropbox, (fatti, tot) =>
      avvisa({ fase: 'dropbox', stato: `${fatti} di ${tot} file` }))
    store.salvaDocumenti(e.docs)
    const tolti = store.riconcilia('dropbox', { completo: e.completo && !e.falliti },
      [...e.docs.map(d => d.id), ...e.visti])
    totale += e.docs.length
    avvisa({ fase: 'dropbox', stato: 'fatto', documenti: e.docs.length, falliti: e.falliti, troncato: e.troncato, tolti })
  }
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
  if (sincronizzazioneInCorso) {
    return res.status(409).json({ errore: 'Una lettura è già in corso.' })
  }
  sincronizzazioneInCorso = true

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const invia = (d: unknown) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(d)}\n\n`) }

  let annullata = false
  req.on('close', () => { annullata = true })

  try {
    const totale = await leggiTutto(
      typeof req.query.fonte === 'string' ? req.query.fonte : null,
      invia,
      () => annullata
    )
    invia({ fase: 'fine', totale, conteggi: store.conteggi() })
  } catch (e) {
    invia({ fase: 'errore', errore: e instanceof Error ? e.message : String(e) })
  } finally {
    sincronizzazioneInCorso = false
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
  if (sincronizzazioneInCorso) return
  const c = cfg.leggi()
  // una fonte nuova che non compare qui è una fonte che non si aggiorna mai
  // da sola: il bottone funziona, e in silenzio l'indice resta indietro
  if (!c.desktop && !c.notion && !c.posta && !c.google && !c.slack
    && !c.drive && !c.microsoft && !c.dropbox) return
  sincronizzazioneInCorso = true
  const daQuando = new Date().toISOString()
  try {
    const totale = await leggiTutto(null, () => {})
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
    sincronizzazioneInCorso = false
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
    const e = await claude.preparaEmail(c.testo, c.risultato)
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
    const esito = await automazioni.fai(a)
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
  res.on('close', () => clearInterval(battito))

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
    })
    store.salvaMessaggio({ id: idMsg('a'), chat, ruolo: 'a', testo: r.testo, fonti: r.fonti })
    invia({ fase: 'fine', messaggi: store.messaggi(chat) })

    // La memoria si aggiorna dopo aver risposto, mai prima: chi scrive non deve
    // aspettare che Myynd rifletta su di lui. Se fallisce, la chat resta valida.
    memoria.distilla([{ ruolo: 'u', testo: domanda }, { ruolo: 'a', testo: r.testo }])
      .catch(() => {})
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
  const giro = perOgnuno('il giro delle automazioni si è fermato', () => automazioni.giro())
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
   * I compiti rimasti a metà si riaprono, per ognuno.
   *
   * Sta dentro `chi.dentro` come tutto il resto: fuori da un contesto questa
   * riga aprirebbe l'indice della radice — che non è di nessuno — e i compiti
   * appesi di tutti resterebbero appesi per sempre.
   */
  /*
   * Chi c'era prima che i conti fossero più di uno.
   *
   * Un'installazione che gira da mesi ha l'account dentro `config.json` nella
   * radice, e accanto tutto il resto. Senza questo passaggio si riaprirebbe
   * Myynd e si troverebbe una schermata che chiede di registrarsi, con mesi di
   * lavoro ancora sul disco ma invisibili.
   */
  const vecchio = cfg.leggi().account
  if (vecchio && !conti.quanti()) {
    const id = conti.adotta(vecchio.email, vecchio.sale, vecchio.hash, cfg.RADICE)
    if (id) {
      // chi c'era già le aveva, con la loro storia di quante volte sono girate:
      // toglierle in un aggiornamento sarebbe stato peggio che non averle mai date
      cfg.aggiorna({ diSerie: true })
      console.log(`myynd · l'account che c'era già è adesso un conto: ${vecchio.email}`)
    }
  }

  let appesi = 0
  for (const u of conti.tutti()) {
    try { appesi += chi.dentro(u, () => compiti.riprendiAppesi()) } catch { /* uno rotto non ferma gli altri */ }
  }
  if (appesi) console.log(`myynd · ${appesi} compit${appesi === 1 ? 'o rimasto' : 'i rimasti'} a metà, riaperti`)
  const quantiConti = conti.quanti()
  console.log(`myynd · ${quantiConti} cont${quantiConti === 1 ? 'o' : 'i'} su questa installazione`)

  if (auth.DEV) {
    // un build vero non deve poter nascere con questa variabile accesa
    if (process.env.NODE_ENV === 'production') throw new Error('MYYND_DEV acceso in un build di produzione')
    auth.apriSessioneDiSviluppo()
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
