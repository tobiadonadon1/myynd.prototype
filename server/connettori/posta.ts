// Posta via IMAP. Su Register.it (il tuo dominio) bastano host, indirizzo e
// password della casella — niente OAuth.

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { ConfigPosta } from '../config.ts'
import type { Documento } from '../store.ts'
import { riflua } from '../testo.ts'
import { filoDi } from '../filo.ts'
import { resto, type Resto } from './ripresa.ts'

export const PRESET: Record<string, { host: string; porta: number; smtp: string; smtpPorta: number }> = {
  'register.it': { host: 'imap.register.it', porta: 993, smtp: 'smtp.register.it', smtpPorta: 465 },
  'gmail': { host: 'imap.gmail.com', porta: 993, smtp: 'smtp.gmail.com', smtpPorta: 465 },
  'outlook': { host: 'outlook.office365.com', porta: 993, smtp: 'smtp.office365.com', smtpPorta: 587 },
  'aruba': { host: 'imaps.aruba.it', porta: 993, smtp: 'smtps.aruba.it', smtpPorta: 465 }
}

/** I domini noti, per non andare a cercare quello che già sappiamo. */
const NOTI: Record<string, string> = {
  'gmail.com': 'imap.gmail.com', 'googlemail.com': 'imap.gmail.com',
  'outlook.com': 'outlook.office365.com', 'hotmail.com': 'outlook.office365.com',
  'hotmail.it': 'outlook.office365.com', 'live.it': 'outlook.office365.com',
  'aruba.it': 'imaps.aruba.it', 'pec.it': 'imaps.pec.aruba.it',
  'libero.it': 'imapmail.libero.it', 'virgilio.it': 'in.virgilio.it',
  'tiscali.it': 'imap.tiscali.it', 'alice.it': 'in.alice.it',
  'fastwebnet.it': 'imap.fastwebnet.it', 'icloud.com': 'imap.mail.me.com',
  'me.com': 'imap.mail.me.com', 'yahoo.it': 'imap.mail.yahoo.com',
  'yahoo.com': 'imap.mail.yahoo.com', 'pec.aruba.it': 'imaps.pec.aruba.it'
}

/** Da un nome di server di posta al suo IMAP: chi ospita, non chi possiede. */
const OSPITI: Record<string, string> = {
  'register.it': 'imap.register.it',
  'aruba.it': 'imaps.aruba.it',
  'google.com': 'imap.gmail.com',
  'googlemail.com': 'imap.gmail.com',
  'outlook.com': 'outlook.office365.com',
  'protection.outlook.com': 'outlook.office365.com',
  'secureserver.net': 'imap.secureserver.net',
  'ionos.it': 'imap.ionos.it',
  'ovh.net': 'ssl0.ovh.net',
  'zoho.com': 'imap.zoho.com',
  'qboxmail.com': 'imap.qboxmail.com',
  'seeweb.it': 'imap.seeweb.it'
}

/** Un server IMAP risponde su questa porta? Mezzo secondo per saperlo. */
async function rispondeImap(host: string): Promise<boolean> {
  const tls = await import('node:tls')
  return new Promise(risolvi => {
    let chiuso = false
    const fine = (esito: boolean) => { if (!chiuso) { chiuso = true; risolvi(esito) } }
    const s = tls.connect({ host, port: 993, servername: host, rejectUnauthorized: false }, () => {
      // un server IMAP saluta da solo: se arriva un saluto, è lui
      s.once('data', d => { fine(d.toString('utf8', 0, 4).startsWith('* OK')); s.destroy() })
    })
    s.setTimeout(3500, () => { fine(false); s.destroy() })
    s.on('error', () => { fine(false); s.destroy() })
  })
}

/**
 * Trova il server IMAP partendo dall'indirizzo.
 *
 * Prima si doveva sapere il proprio host e scriverlo a mano, con
 * "imap.register.it" preimpostato per tutti: chi non era su Register partiva da
 * un valore sbagliato senza sapere con cosa sostituirlo. Qui lo si cerca.
 *
 * Nessun servizio esterno di configurazione: prima quello che già sappiamo, poi
 * il record SRV che lo stesso dominio pubblica (RFC 6186), poi i nomi che i
 * provider usano quasi sempre — provati direttamente sul server della persona,
 * dove la sua posta sta comunque per andare. Il dominio non esce da qui.
 */
export async function scopri(email: string): Promise<{ host: string; come: string } | null> {
  const dominio = email.split('@')[1]?.trim().toLowerCase()
  if (!dominio) return null

  if (NOTI[dominio]) return { host: NOTI[dominio], come: 'noto' }

  // Chi ospita la posta di questo dominio? Il record MX lo dice, ed è il passo
  // che risolve il caso più comune di tutti: un dominio aziendale su un
  // provider. donadon.com non risponde su imap.donadon.com — il suo MX è
  // mail.register.it, e da lì si arriva a imap.register.it.
  try {
    const { resolveMx } = await import('node:dns/promises')
    const mx = (await resolveMx(dominio)).sort((a, b) => a.priority - b.priority)
    for (const r of mx) {
      const e = r.exchange.toLowerCase()
      for (const [frammento, host] of Object.entries(OSPITI)) {
        if (e.includes(frammento)) return { host, come: 'mx' }
      }
    }
    // un MX su un altro dominio è comunque un indizio: mail.tizio.it → imap.tizio.it
    const base = mx[0]?.exchange.toLowerCase().replace(/^(mx\d*|mail|smtp|in)\./, '')
    if (base && base !== dominio && await rispondeImap(`imap.${base}`)) {
      return { host: `imap.${base}`, come: 'mx' }
    }
  } catch { /* dominio senza MX: si va avanti */ }

  // il dominio può dire da sé dov'è la sua posta
  try {
    const { resolveSrv } = await import('node:dns/promises')
    const rec = await resolveSrv(`_imaps._tcp.${dominio}`)
    const buono = rec.filter(r => r.name && r.port === 993).sort((a, b) => a.priority - b.priority)[0]
    if (buono) return { host: buono.name, come: 'srv' }
  } catch { /* quasi nessuno lo pubblica: si va avanti */ }

  for (const nome of [`imap.${dominio}`, `imaps.${dominio}`, `mail.${dominio}`, `posta.${dominio}`]) {
    if (await rispondeImap(nome)) return { host: nome, come: 'provato' }
  }
  return null
}

/**
 * La connessione, sostituibile nelle prove.
 *
 * Le finestre di riconciliazione decidono cosa **cancellare** dall'indice, e
 * una regola sbagliata lì non si vede da nessuna parte finché non manca una
 * email. Provarle contro una casella vera vorrebbe dire non provarle: qui si
 * mette una casella finta e si guarda esattamente cosa dichiara.
 */
let fabbrica: ((c: ConfigPosta, servername?: string) => ImapFlow) | null = null
export function usaClient(f: ((c: ConfigPosta, servername?: string) => ImapFlow) | null) { fabbrica = f }

function client(c: ConfigPosta, servername?: string) {
  if (fabbrica) return fabbrica(c, servername)
  return new ImapFlow({
    host: c.host,
    port: c.porta || 993,
    secure: true,
    ...(servername ? { tls: { servername } } : {}),
    auth: { user: c.utente, pass: c.password },
    logger: false,
    // il server non deve restare appeso se la rete cade a metà
    socketTimeout: 60_000
  })
}

/**
 * Diversi provider (Register.it fra questi) rispondono su imap.dominio.it con
 * un certificato intestato al loro dominio di posta — *.securemail.pro nel
 * caso di Register. La catena è valida e firmata da una CA pubblica: è solo il
 * nome a non combaciare. Leggo il nome dal certificato che il server presenta
 * e riprovo con quello, così la verifica della catena resta attiva.
 */
async function nomeDalCertificato(c: ConfigPosta): Promise<string | null> {
  const tls = await import('node:tls')
  return new Promise(risolvi => {
    const s = tls.connect(
      { host: c.host, port: c.porta || 993, servername: c.host, rejectUnauthorized: false },
      () => {
        const cert = s.getPeerCertificate()
        const alt = String(cert?.subjectaltname ?? '')
        const nomi = alt.split(',').map(x => x.trim().replace(/^DNS:/, '')).filter(Boolean)
        // preferisco un nome concreto al jolly
        const concreto = nomi.find(x => !x.startsWith('*.'))
        const jolly = nomi.find(x => x.startsWith('*.'))
        s.destroy()
        // Da «*.securemail.pro» si ricavava «securemail.pro» — cioè l'unico
        // nome che quel jolly NON copre: un certificato jolly vale per le
        // etichette figlie, non per il dominio nudo. Il secondo tentativo
        // falliva quindi esattamente come il primo, e il recupero non ha mai
        // recuperato niente. Con una qualunque etichetta al posto
        // dell'asterisco si ricade dentro quello che il certificato copre.
        risolvi(concreto ?? (jolly ? jolly.replace('*', 'imap') : null))
      }
    )
    s.setTimeout(12_000, () => { s.destroy(); risolvi(null) })
    s.on('error', () => risolvi(null))
  })
}

/** Apre la connessione, con un solo tentativo di recupero sul nome del certificato. */
async function apri(c: ConfigPosta): Promise<{ cl: ImapFlow; adattato: string | null }> {
  const primo = client(c)
  try {
    await primo.connect()
    return { cl: primo, adattato: null }
  } catch (e) {
    try { await primo.close() } catch { /* già chiusa */ }
    const codice = (e as { code?: string }).code
    if (codice !== 'ERR_TLS_CERT_ALTNAME_INVALID') throw e
    const nome = await nomeDalCertificato(c)
    if (!nome) throw e
    const secondo = client(c, nome)
    await secondo.connect()
    return { cl: secondo, adattato: nome }
  }
}

/** Prova la connessione senza indicizzare niente. */
export async function prova(c: ConfigPosta): Promise<
  { ok: true; cartelle: string[]; certificatoAdattato: string | null } | { ok: false; errore: string }
> {
  let cl: ImapFlow | null = null
  try {
    const a = await apri(c)
    cl = a.cl
    const lista = await cl.list()
    await cl.logout()
    return { ok: true, cartelle: lista.map(l => l.path).slice(0, 40), certificatoAdattato: a.adattato }
  } catch (e) {
    if (cl) { try { await cl.close() } catch { /* già chiusa */ } }
    return { ok: false, errore: messaggioErrore(e, c.host) }
  }
}

/**
 * Quali server vogliono una «password per le app», e non la tua.
 *
 * Gmail, iCloud e Yahoo la chiedono, e la fanno lunga sedici lettere. Outlook
 * non accetta più nessuna password via IMAP e sta in un elenco a parte, perché
 * per lui non c'è niente da generare: c'è un'altra scheda.
 */
export function vuolePasswordPerLeApp(host: string): 'google' | 'apple' | 'yahoo' | null {
  const h = host.toLowerCase()
  if (/gmail|googlemail/.test(h)) return 'google'
  if (/mail\.me\.com|icloud/.test(h)) return 'apple'
  if (/yahoo/.test(h)) return 'yahoo'
  return null
}

/**
 * La password, senza gli spazi che ci ha messo chi la mostra.
 *
 * Google scrive la password per le app a gruppi di quattro — «abcd efgh ijkl
 * mnop» — e chi la copia si porta dietro gli spazi. IMAP la rifiuta, e il
 * messaggio che torna è lo stesso di una password sbagliata: nessun modo di
 * capire che erano tre spazi. Apple fa lo stesso con i trattini.
 *
 * Si tolgono **solo** quando quello che resta ha esattamente la forma di una
 * password per le app — sedici lettere — e solo su quei tre server. Una
 * password vera può contenere spazi, e toglierli a tutti vorrebbe dire
 * rompere le caselle di chi ne ha una.
 */
export function normalizza(password: string, host: string): string {
  if (!vuolePasswordPerLeApp(host)) return password
  const nudo = password.replace(/[\s-]/g, '')
  return /^[a-z]{16}$/i.test(nudo) ? nudo : password
}

/**
 * «Password non accettata» è vero e non serve a niente, se il server è Gmail:
 * Gmail non accetta *mai* la password dell'account via IMAP, vuole una
 * «password per le app». Lo stesso iCloud e Yahoo. E Outlook.com da un pezzo
 * non accetta più nessuna password via IMAP. Dirlo qui è la differenza fra
 * una persona che riprova la stessa password tre volte e una che sa dove andare.
 */
function messaggioErrore(e: unknown, host = ''): string {
  // imapflow dice «Command failed» nel message e mette il perché altrove:
  // `authenticationFailed`, `responseText`, `serverResponseCode`. Guardando il
  // solo message, la password sbagliata su Gmail usciva come «Command failed».
  const err = (e && typeof e === 'object' ? e : {}) as {
    message?: string; responseText?: string; response?: string
    serverResponseCode?: string; authenticationFailed?: boolean; code?: string
  }
  const m = [err.message, err.responseText, err.response, err.serverResponseCode, err.code]
    .filter(Boolean).join(' ') || String(e)
  const h = host.toLowerCase()
  if (err.authenticationFailed || /auth|invalid credentials|login failed|password/i.test(m)) {
    if (/gmail|googlemail/.test(h)) return 'Gmail ha rifiutato questa password. Se sono meno di sedici lettere è quella del tuo account Google, e via IMAP non funziona mai: creane una su myaccount.google.com/apppasswords e incolla quella.'
    if (/mail\.me\.com|icloud/.test(h)) return 'iCloud ha rifiutato questa password. Ne serve una specifica per le app, sedici lettere, da appleid.apple.com.'
    if (/yahoo/.test(h)) return 'Yahoo ha rifiutato questa password. Ne serve una per le app, dalle impostazioni di sicurezza dell’account.'
    if (/office365|outlook|hotmail|live\./.test(h)) return 'Outlook non accetta più la password via IMAP: collega «Outlook e Calendario» invece di questa scheda.'
    return 'Utente o password non accettati dal server.'
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return 'Host IMAP non trovato: controlla il nome del server.'
  if (/ETIMEDOUT|timeout/i.test(m)) return 'Il server non risponde. Controlla host e porta.'
  if (/altnames/i.test(m)) return 'Il certificato del server è intestato a un altro nome e non sono riuscito a combaciarlo.'
  if (/certificate/i.test(m)) return 'Certificato TLS non valido sul server.'
  if (/ECONNREFUSED/i.test(m)) return 'Il server rifiuta la connessione sulla porta 993.'
  if (/Command failed/i.test(m)) return 'Il server di posta ha rifiutato la connessione.'
  return err.message || m
}

/**
 * `troncato` esiste perché il tetto di quattrocento messaggi per cartella
 * tagliava dentro la finestra che avevi chiesto, senza dirlo.
 *
 * Chiedi trenta giorni, la cartella ne ha seicento: ne leggeva gli ultimi
 * quattrocento e riportava «Posta · 400 documenti», identico a una lettura
 * completa. I duecento più vecchi non venivano letti allora e non lo
 * sarebbero stati mai più, perché la lettura dopo riparte dalla stessa
 * finestra e taglia allo stesso punto. Sparivano e basta.
 */
// — mandare —
//
// Fin qui questo file sapeva solo leggere. SMTP stava nel PRESET da sempre, e
// non era collegato a nessuna azione: Myynd scriveva l'email perfetta e poi te
// la faceva ricopiare a mano, il che vuol dire che il lavoro l'avevi fatto tu.
//
// Adesso può mandarla. Una regola non si tratta, ed è quella del brief: «non
// agisce mai da solo. Prepara, e una persona preme il bottone». Qui dentro non
// c'è nessuna strada che parta da sola — `invia` la chiama una rotta che la
// chiama un bottone che hai premuto tu, dopo aver letto il testo.

/**
 * Da dove esce la posta, per questa casella.
 *
 * Nell'ordine: quello che hai scritto tu, quello che sappiamo del provider,
 * e in ultima istanza lo stesso nome con smtp al posto di imap — che è come
 * si chiama nove volte su dieci.
 */
export function smtpDi(c: ConfigPosta): { host: string; porta: number } {
  if (c.smtp?.host) return { host: c.smtp.host, porta: c.smtp.porta || 465 }
  const noto = Object.values(PRESET).find(p => p.host === c.host)
  if (noto) return { host: noto.smtp, porta: noto.smtpPorta }
  return { host: c.host.replace(/^imaps?\./, 'smtp.'), porta: 465 }
}

export type DaMandare = { a: string; oggetto: string; corpo: string }

/**
 * Manda un'email, e basta quella.
 *
 * Niente allegati per adesso: allegare vuol dire leggere un file dal disco e
 * spedirlo fuori, ed è un passo che merita la sua conversazione invece di
 * arrivare in coda a un'altra. Il testo va in chiaro perché è quello che hai
 * letto sullo schermo: se partisse in HTML, quello che arriva non sarebbe più
 * esattamente quello che hai approvato.
 */
export async function invia(c: ConfigPosta, m: DaMandare): Promise<{ id: string }> {
  const dove = smtpDi(c)
  const { createTransport } = await import('nodemailer')
  const posta = createTransport({
    host: dove.host,
    port: dove.porta,
    // 465 è TLS dal primo byte; 587 comincia in chiaro e sale con STARTTLS
    secure: dove.porta === 465,
    auth: { user: c.utente, pass: c.password },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000
  })
  try {
    const r = await posta.sendMail({
      from: c.utente,
      to: m.a,
      subject: m.oggetto,
      text: m.corpo
    })
    return { id: String(r.messageId ?? '') }
  } finally {
    posta.close()
  }
}

/** La prova che la casella accetta di far uscire posta, senza mandarne. */
export async function provaInvio(c: ConfigPosta): Promise<{ ok: true } | { ok: false; errore: string }> {
  const dove = smtpDi(c)
  try {
    const { createTransport } = await import('nodemailer')
    const posta = createTransport({
      host: dove.host, port: dove.porta, secure: dove.porta === 465,
      auth: { user: c.utente, pass: c.password },
      connectionTimeout: 15_000, greetingTimeout: 15_000
    })
    try { await posta.verify() } finally { posta.close() }
    return { ok: true }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e, c.host) }
  }
}

/**
 * Mettere via dei messaggi. Non cancellarli.
 *
 * Myynd legge la posta di qualcuno, e il giorno che può *toglierla* la
 * differenza fra spostare e cancellare non è una sfumatura: uno spostamento si
 * annulla trascinando indietro, una cancellazione no. Quindi qui non c'è
 * `messageDelete`, e non deve arrivarci: il cestino e l'archivio sono cartelle,
 * e finire in una cartella è una cosa da cui si torna.
 *
 * La cartella di destinazione non si scrive a mano. «Trash», «Cestino»,
 * «[Gmail]/Cestino», «Deleted Items»: ogni provider la chiama a modo suo, e
 * indovinare vuol dire creare una cartella nuova con il nome sbagliato sulla
 * casella di un cliente. Si chiede al server quale ha il ruolo `\Trash` — è
 * quello che serve la RFC 6154 — e se non lo dichiara non si inventa niente: si
 * dice che non si sa dove metterli.
 */
export type Mossa = { cartella: string; uid: number }

/**
 * Da `posta:cartella:uid` alla mossa che lo sposta.
 *
 * Il taglio è da destra e non da sinistra, ed è l'unica cosa delicata qui
 * dentro: una cartella può contenere i due punti — `[Gmail]/Posta inviata` non
 * ne ha, ma `INBOX:2024` sì, e certi server li usano come separatore — mentre
 * l'uid è un numero e non ne ha mai. Tagliando dall'ultimo, la cartella resta
 * intera comunque si chiami.
 *
 * Quello che non ha questa forma non diventa una mossa. Non è un caso da
 * segnalare: un documento che non viene dalla posta non ha una casella da cui
 * toglierlo, e va semplicemente lasciato dov'è.
 */
export function mosseDa(ids: string[]): Mossa[] {
  const fuori: Mossa[] = []
  for (const id of ids) {
    if (!id.startsWith('posta:')) continue
    const taglio = id.lastIndexOf(':')
    if (taglio <= 'posta:'.length - 1) continue
    const cartella = id.slice('posta:'.length, taglio)
    const uid = Number(id.slice(taglio + 1))
    if (!cartella || !Number.isInteger(uid) || uid <= 0) continue
    fuori.push({ cartella, uid })
  }
  return fuori
}

async function cartellaConRuolo(cl: ImapFlow, ruolo: string): Promise<string | null> {
  for (const c of await cl.list()) {
    // imapflow espone il ruolo come `specialUse`: '\\Trash', '\\Archive'…
    if ((c as { specialUse?: string }).specialUse === ruolo) return c.path
  }
  return null
}

export async function sposta(
  c: ConfigPosta,
  mosse: Mossa[],
  ruolo: '\\Trash' | '\\Archive'
): Promise<{ spostati: number; dove: string }> {
  if (!mosse.length) return { spostati: 0, dove: '' }
  const { cl } = await apri(c)
  try {
    const dove = await cartellaConRuolo(cl, ruolo)
    if (!dove) {
      throw new Error(ruolo === '\\Trash'
        ? 'La casella non dice qual è il cestino: non so dove metterli.'
        : 'La casella non dice qual è l\'archivio: non so dove metterli.')
    }

    // una cartella per volta: gli uid valgono dentro la loro, e mescolarli
    // vorrebbe dire spostare il messaggio numero 42 della cartella sbagliata
    let spostati = 0
    const perCartella = new Map<string, number[]>()
    for (const m of mosse) perCartella.set(m.cartella, [...(perCartella.get(m.cartella) ?? []), m.uid])

    /*
     * E valgono solo dentro la stessa UIDVALIDITY. Se la casella l'ha
     * cambiata — un ripristino, una migrazione, certi provider lo fanno da
     * soli — il numero 42 di oggi è un altro messaggio di quello indicizzato,
     * e spostarlo vorrebbe dire cestinare una cosa mai vista. Si controlla
     * tutto *prima* di muovere qualcosa: un no a metà lascerebbe la prima
     * cartella spostata e l'indice convinto che lo siano tutte.
     */
    for (const cartella of perCartella.keys()) {
      if (cartella === dove) continue
      const lock = await cl.getMailboxLock(cartella)
      try {
        const box = cl.mailbox as false | { uidValidity?: bigint }
        const adesso = box && box.uidValidity !== undefined ? String(box.uidValidity) : ''
        const nota = c.validita?.[cartella]
        if (adesso && !nota) throw new Error('Non ho ancora letto questa cartella: fai una lettura prima di spostare i messaggi.')
        if (adesso && nota !== adesso) throw new Error('La casella ha rinumerato i messaggi da quando li ho letti: rifai una lettura prima di spostarli.')
      } finally {
        lock.release()
      }
    }

    for (const [cartella, uids] of perCartella) {
      if (cartella === dove) continue          // già lì: spostarli su sé stessi non ha senso
      const lock = await cl.getMailboxLock(cartella)
      try {
        await cl.messageMove(uids, dove, { uid: true })
        spostati += uids.length
      } finally {
        lock.release()
      }
    }
    return { spostati, dove }
  } finally {
    try { await cl.logout() } catch { /* la connessione cade da sé */ }
  }
}

/**
 * La fetta di casella che una lettura ha davvero coperto.
 *
 * Serve a `store.riconciliaPosta`, ed è la risposta a una domanda che nessuno
 * si era mai posto: **come si toglie dall'indice un'email che sulla casella non
 * c'è più?** Fin qui, in nessun modo. Un messaggio cestinato o spostato in una
 * cartella che non leggiamo restava indicizzato per sempre — veniva citato in
 * una risposta come se fosse ancora lì, e finiva dentro le proposte «archivia
 * questi», che è la parte peggiore: Myynd proponeva di archiviare roba già
 * archiviata da mesi.
 *
 * Non basta però l'elenco di quello che si è visto: sulla posta non si legge
 * mai tutto, si legge una finestra di trenta giorni. Cancellare «tutto quello
 * che non ho visto» vorrebbe dire svuotare l'indice di ogni email più vecchia
 * della finestra. Quindi si dice anche **dove si è guardato**: da quale uid a
 * quale, in quale cartella. Fuori da lì il silenzio non prova niente.
 */
export type Finestra = { cartella: string; daUid: number; aUid: number }

export type EsitoPosta = {
  docs: Documento[]
  cartelleFallite: string[]
  troncato: boolean
  /** L'UIDVALIDITY vista in ogni cartella, da conservare per la prossima lettura. */
  validita: Record<string, string>
  /** Quanti messaggi c'erano già e non sono stati riscaricati. */
  saltati: number
  /**
   * Le fette coperte per intero, e solo quelle: una cartella caduta o lasciata
   * a metà non ne produce nessuna, o la riconciliazione cancellerebbe posta vera.
   */
  finestre: Finestra[]
  /**
   * Gli id di tutti i messaggi che la casella dice di avere là dentro, anche
   * quelli che stavolta non si sono riscaricati perché erano già nell'indice.
   * Senza, riconciliare cancellerebbe proprio quelli.
   */
  visti: string[]
  /** Quanti messaggi della finestra sono dentro, e quanti restano da leggere. */
  resto: Resto
}

/**
 * I nomi con cui le caselle chiamano la posta inviata, quando non dichiarano
 * il ruolo. Minuscoli: si confrontano con il percorso e con l'ultimo pezzo.
 */
const NOMI_INVIATA = [
  'sent', 'sent messages', 'sent items', 'sent mail',
  'posta inviata', 'inviata', 'inviati',
  '[gmail]/sent mail', '[gmail]/posta inviata'
]

/**
 * La cartella della posta inviata, se la casella ce l'ha.
 *
 * Prima il ruolo che il server dichiara — `\Sent`, RFC 6154, che imapflow
 * espone come `specialUse` — e solo dopo i nomi: «Sent», «Posta inviata»,
 * «[Gmail]/Sent Mail»… ogni provider la chiama a modo suo, e il ruolo è
 * l'unico nome che non cambia. Null se non c'è o se la lista non arriva.
 */
export async function cartellaInviata(cl: ImapFlow): Promise<string | null> {
  const lista = await cl.list()
  const conRuolo = lista.find(l => l.specialUse === '\\Sent')
  if (conRuolo) return conRuolo.path
  const perNome = lista.find(l =>
    NOMI_INVIATA.includes(l.path.toLowerCase()) || NOMI_INVIATA.includes(l.name.toLowerCase()))
  return perNome?.path ?? null
}

/**
 * Legge la casella, e riscarica solo quello che non ha già.
 *
 * Fino a ieri ogni sei ore si tiravano giù di nuovo tutti i messaggi della
 * finestra, allegati compresi, per poi scoprire in `salvaDocumenti` che erano
 * uguali: trenta giorni di posta scaricati quattro volte al giorno per non
 * cambiare niente. Adesso chi chiama passa `giaIndicizzati` — gli uid già
 * nell'indice, cartella per cartella — e quelli si saltano, purché la cartella
 * abbia la stessa UIDVALIDITY dell'ultima volta: se il server l'ha rinumerata,
 * gli uid vecchi non valgono più e si rilegge tutto.
 */
export async function sincronizza(
  c: ConfigPosta,
  avanzamento?: (fatti: number, totale: number) => void,
  giaIndicizzati?: (cartella: string) => Set<number>
): Promise<EsitoPosta> {
  const giorni = c.giorni ?? 30
  const da = new Date(Date.now() - giorni * 86400_000)
  let cartelle = c.cartelle?.length ? c.cartelle : ['INBOX']
  const docs: Documento[] = []
  const cartelleFallite: string[] = []
  const validita: Record<string, string> = { ...(c.validita ?? {}) }
  const finestre: Finestra[] = []
  const visti: string[] = []
  let saltati = 0
  let troncato = false
  /** Quanti messaggi ci sono nella finestra di giorni, in tutte le cartelle. */
  let dentroLaFinestra = 0
  /** Quanti di quelli restano da leggere dopo questo giro. */
  let arretrato = 0
  const { cl } = await apri(c)

  try {
    /*
     * Anche la posta inviata, se non ha scelto lei le cartelle.
     *
     * Fin qui si leggeva la sola casella d'arrivo, e mancava esattamente la
     * metà che serve a scrivere «nella sua voce»: quello che ha scritto *lei*.
     * Il modello imparava il tono di Rossi e dei fornitori — cioè di chiunque
     * tranne la persona per cui scrive — e le bozze uscivano educate e
     * anonime. Le sue email mandate sono l'unico esempio vero di come scrive:
     * le formule con cui apre, quanto è secca, come chiude. E sono anche
     * l'altra metà di ogni conversazione: senza, di un filo con un cliente si
     * vede solo quello che il cliente ha detto.
     *
     * Gli id restano `posta:cartella:uid`, quindi due cartelle non si pestano
     * i piedi; `fonte` resta `posta` per tutte e due, perché è la stessa
     * casella. Chi ha scelto le cartelle a mano tiene le sue.
     */
    let inviata: string | null = null
    if (!c.cartelle?.length) {
      inviata = await cartellaInviata(cl).catch(() => null)
      if (inviata && !cartelle.includes(inviata)) cartelle = [...cartelle, inviata]
    }

    for (const cartella of cartelle) {
      let lock
      try {
        lock = await cl.getMailboxLock(cartella)
      } catch {
        cartelleFallite.push(cartella)
        continue // cartella sparita o senza permessi: la salto
      }
      try {
        const uids = await cl.search({ since: da }, { uid: true })
        /*
         * Cartella vuota nella finestra: nessuna finestra, e non è pigrizia.
         *
         * Senza uid non c'è nessun intervallo da dichiarare, e dichiararne uno
         * largo — «tutta la cartella» — vorrebbe dire che una ricerca che torna
         * vuota per un raffreddore del server svuota l'indice di quella
         * cartella. Un'email tolta di mezzo per sbaglio non torna: meglio
         * riconciliare al giro dopo.
         */
        if (!uids || !uids.length) continue

        // stessa cartella di prima? allora gli uid già indicizzati sono gli stessi messaggi
        const box = cl.mailbox as false | { uidValidity?: bigint }
        const adesso = box && box.uidValidity !== undefined ? String(box.uidValidity) : ''
        const stessa = !!adesso && c.validita?.[cartella] === adesso
        const noti = stessa && giaIndicizzati ? giaIndicizzati(cartella) : new Set<number>()
        if (adesso) validita[cartella] = adesso

        /*
         * Prima quelli che mancano, *poi* il tetto — l'ordine è la differenza.
         * Prima si prendevano i quattrocento più recenti e da quelli si
         * toglievano i già letti: una casella con più di quattrocento
         * messaggi nella finestra restituiva ogni volta gli stessi
         * quattrocento, tutti noti, e quelli sotto non arrivavano a nessun
         * giro. Adesso il tetto morde su quelli ancora da leggere, i più
         * recenti per primi (gli uid crescono col tempo): ogni giro ne
         * finisce quattrocento e il prossimo prende i successivi, finché la
         * finestra è tutta dentro. `troncato` dice che ne restano, non che
         * si perdono.
         */
        const mancanti = (noti.size ? uids.filter(u => !noti.has(u)) : uids).sort((a, b) => a - b)
        saltati += uids.length - mancanti.length
        dentroLaFinestra += uids.length
        /*
         * Il segno di dove riprendere non si scrive da nessuna parte, e per la
         * posta è giusto così: **il segno è l'indice stesso.** `noti` sono gli
         * uid già dentro, quindi ogni giro ricomincia esattamente dove il
         * precedente si era fermato, senza niente da conservare e senza niente
         * da tenere allineato. Le altre fonti un cursore ce l'hanno perché non
         * hanno questo.
         */
        const troppi = Math.max(0, mancanti.length - 400)
        arretrato += troppi
        if (troppi) troncato = true
        const daScaricare = mancanti.slice(-400)

        let fatti = 0
        // esistono, e vanno detti vivi tutti: quelli che riscarichiamo adesso e
        // quelli che erano già dentro. Senza i secondi, riconciliare la
        // finestra cancellerebbe proprio la posta che avevamo già letto bene.
        for (const u of uids) visti.push(`posta:${cartella}:${u}`)

        // nessuno da scaricare è il caso normale del secondo giro in poi, e non
        // è una scorciatoia: è proprio lì che serve la finestra qui sotto,
        // perché è il giro in cui l'unica novità può essere una email sparita
        const nessuno: AsyncIterable<never> = { async *[Symbol.asyncIterator]() {} }
        for await (const msg of daScaricare.length
          ? cl.fetch(daScaricare, { uid: true, source: true, envelope: true }, { uid: true })
          : nessuno) {
          try {
            const p = await simpleParser(msg.source as Buffer)
            // La posta in testo semplice va a capo a settantadue caratteri per
            // convenzione, non per volontà di chi scrive: senza ricucirla ogni
            // frase arriva spezzata in tre.
            const testo = riflua((p.text || '').trim())
            if (!testo) continue
            const mittente = p.from?.value?.[0]
            docs.push({
              id: `posta:${cartella}:${msg.uid}`,
              fonte: 'posta',
              tipo: 'email',
              titolo: p.subject || '(senza oggetto)',
              corpo: testo.slice(0, 20_000),
              autore: mittente ? `${mittente.name || ''} <${mittente.address || ''}>`.trim() : null,
              percorso: cartella,
              quando: (p.date || msg.envelope?.date || new Date()).toISOString(),
              gruppo: 'posta',
              // la conversazione: la radice della catena degli id, o l'oggetto
              filo: filoDi({ messageId: p.messageId, inReplyTo: p.inReplyTo, references: p.references, oggetto: p.subject }),
              // scritta da lei: cercabile e utile alla voce, ma non «arrivata»
              inviato: cartella === inviata
            })
          } catch {
            // un messaggio illeggibile non deve fermare la sincronizzazione
          }
          fatti++
          if (avanzamento && fatti % 20 === 0) avanzamento(fatti, daScaricare.length)
        }

        /*
         * La finestra si dichiara qui, in fondo, e solo se si è arrivati fino
         * in fondo.
         *
         * Sotto ci sono tre modi di non arrivarci, e tutti e tre devono lasciare
         * la cartella fuori: la serratura che non si apre e l'errore a metà
         * scaricamento cadono nel `catch` senza mai passare di qui, e il tetto
         * dei quattrocento lo dice `troppi`. Il perché è sempre lo stesso: una
         * finestra dichiarata su una lettura incompleta è un permesso a
         * cancellare posta che c'è. Dirla una volta di meno costa che una email
         * cestinata resta nell'indice fino al giro dopo; dirla una volta di
         * troppo costa un'email vera.
         */
        if (!troppi) {
          // a mano e non con `Math.min(...uids)`: su una casella con decine di
          // migliaia di messaggi quello spread è una pila che scoppia
          let daUid = uids[0]!, aUid = uids[0]!
          for (const u of uids) { if (u < daUid) daUid = u; if (u > aUid) aUid = u }
          finestre.push({ cartella, daUid, aUid })
        }
      } catch {
        // una cartella che va storta non deve far perdere quelle già lette
        cartelleFallite.push(cartella)
      } finally {
        lock.release()
      }
    }
  } finally {
    try { await cl.logout() } catch { /* la connessione è già caduta */ }
  }
  return {
    docs, cartelleFallite, troncato, validita, saltati, finestre, visti,
    // «tremila di cinquemila», non «non ho finito»: chi guarda deve poter
    // vedere quanto manca, o smette di guardare
    resto: {
      ...resto(dentroLaFinestra - arretrato, dentroLaFinestra),
      aGiorno: arretrato === 0 && !cartelleFallite.length
    }
  }
}
