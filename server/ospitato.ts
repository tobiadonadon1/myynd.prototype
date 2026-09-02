// Myynd su un server, invece che sul computer di chi lo usa.
//
// **Questo file esiste per rendere una differenza esplicita, non per
// cancellarla.** Myynd è nato per girare sulla macchina di una persona: legge
// la sua posta, i suoi file, e non esce di lì. È la promessa che regge tutto
// il resto — il brief la chiama «la ragione per cui un'azienda italiana dice
// di sì». Metterlo su un server la capovolge: le credenziali smettono di stare
// sul computer di chi le ha scritte e cominciano a stare da qualcun altro.
//
// Quella scelta non si può prendere per sbaglio — ma **accorgersi di essere
// su un server non è una scelta, è un fatto**, e va letto dai fatti. La prima
// versione di questo file pretendeva che qualcuno scrivesse `MYYND_PUBBLICO`
// per ammettere di essere ospitato, e senza quella riga il server si metteva in
// ascolto su 127.0.0.1 dentro un contenitore: irraggiungibile, con un registro
// che diceva «avviato» e un proxy che rispondeva «Application failed to
// respond». Un'ora persa a cercare un guasto che era una variabile mancante.
//
// Adesso la piattaforma si annuncia da sola e le si crede. Quello che resta
// una scelta esplicita è l'unica cosa che lo deve essere: chi può entrare.
//
// Quello che cambia, e perché ognuna delle tre cose è necessaria:
//
//   · **si ascolta su 0.0.0.0.** Dentro un contenitore, il proxy che porta le
//     richieste arriva da fuori: un server in ascolto solo su 127.0.0.1 non
//     lo vede nemmeno, e il dominio risponde «application failed to respond»
//     senza che nel registro compaia niente.
//   · **la guardia sull'Host accetta quel dominio.** Non «qualunque dominio»:
//     quello. Il controllo esiste contro il DNS rebinding — un dominio che si
//     ri-risolve su 127.0.0.1 diventerebbe same-origin — e allargarlo a `*`
//     vorrebbe dire toglierlo. Allargarlo a un nome solo lo tiene intero.
//   · **ognuno la sua cartella.** `DATI` è la radice, e sotto `utenti/<id>`
//     vive una persona: la sua configurazione, il suo indice, le sue
//     automazioni. È quello che rende sicuro lasciare aperta la registrazione.

import { homedir } from 'node:os'
import { join } from 'node:path'

const pulisci = (x: string) => x.trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/\/.*$/, '')

/**
 * Chi ospita si annuncia da solo, e conviene ascoltarlo.
 *
 * La prima versione di questo file accendeva la modalità ospitata solo con
 * `MYYND_PUBBLICO` scritto a mano. Sembrava prudente ed era un rastrello: se
 * quella variabile manca, il server si mette in ascolto su 127.0.0.1 *dentro
 * un contenitore*, il proxy di chi ospita non lo trova, e quello che si legge è
 * «Application failed to respond» — una frase che parla dell'applicazione e non
 * dice che il problema è una variabile d'ambiente. Il registro, intanto, dice
 * tranquillamente «server avviato».
 *
 * Queste variabili le mette la piattaforma, non una persona: se ce n'è una,
 * siamo su un server, punto. Restare in ascolto solo su localhost va bene sul
 * computer di qualcuno — dove è la prima difesa — e non ha nessun senso qui.
 */
const SEGNI_DI_UN_SERVER = [
  'RAILWAY_ENVIRONMENT', 'RAILWAY_PROJECT_ID',
  'RENDER', 'FLY_APP_NAME', 'K_SERVICE', 'DYNO', 'KUBERNETES_SERVICE_HOST'
]

/**
 * Il dominio pubblico da cui si arriva.
 *
 * Scritto a mano se c'è; altrimenti quello che Railway si assegna da sé, che
 * cambia a ogni ridistribuzione e che nessuno ha voglia di ricopiare ogni
 * volta. Può restare vuoto anche su un server — si è ospitati lo stesso, e la
 * guardia sull'Host userà quello che trova.
 */
export const DOMINIO = pulisci(process.env.MYYND_PUBBLICO ?? '')
  || pulisci(process.env.RAILWAY_PUBLIC_DOMAIN ?? '')

/** Vero quando Myynd sta girando su un server e non sul computer di qualcuno. */
export const OSPITATO = !!DOMINIO || SEGNI_DI_UN_SERVER.some(v => !!process.env[v])

/**
 * La porta, e chi la decide.
 *
 * `PORT` la scrive chi ospita — Railway, Render, Fly — e non è negoziabile: il
 * loro proxy bussa lì e da nessun'altra parte. `MYYND_PORT` resta per chi
 * sviluppa. L'ordine conta: se ci fosse prima `MYYND_PORT`, una variabile
 * dimenticata nell'ambiente farebbe ascoltare sulla porta sbagliata e il
 * dominio risponderebbe a vuoto.
 */
export const PORTA = Number(process.env.PORT ?? process.env.MYYND_PORT ?? 5174)

/**
 * A che indirizzo si ascolta.
 *
 * Su una macchina di casa 127.0.0.1, e sta lì il primo strato di difesa: da
 * fuori non ci si arriva proprio. Dentro un contenitore quello stesso strato
 * diventa un muro contro il proprio proxy.
 */
export const INDIRIZZO = OSPITATO ? '0.0.0.0' : '127.0.0.1'

/**
 * Dove vive la mente: l'indice, la configurazione, le automazioni tue.
 *
 * `MYYND_DATI` deve puntare a un disco che sopravvive al riavvio del
 * contenitore — su Railway è un Volume, e va montato. Senza, il contenitore
 * riparte con `~/.myynd` vuoto: nessun account, nessun documento, nessuna
 * automazione, e nessun errore da nessuna parte. È il modo più silenzioso in
 * cui questa installazione può perdere tutto, e capita al primo redeploy.
 */
export const DATI = (process.env.MYYND_DATI ?? '').trim() || join(homedir(), '.myynd')

/*
 * L'invito non c'è più, e vale la pena dire perché invece di lasciare un vuoto.
 *
 * Serviva a tappare un buco che adesso non esiste: l'installazione aveva un
 * conto solo, quindi su un indirizzo pubblico il primo che si registrava
 * diventava il padrone della casella che qualcuno avrebbe collegato dopo.
 * Era una serratura messa davanti a un difetto, e chiedeva a chi metteva su il
 * server di inventarsi una parola e passarla a mano a ogni persona.
 *
 * Adesso ogni conto ha la sua cartella e il suo indice, e registrarne uno non
 * fa vedere niente di nessuno: la porta si può lasciare aperta perché dietro
 * non c'è più la stanza di un altro.
 */

/**
 * Gli Host che si accettano.
 *
 * Il dominio scritto a mano, più quello che Railway si assegna da sé — che
 * cambia a ogni ridistribuzione e che nessuno ha voglia di ricopiare a ogni
 * giro. Localhost resta dentro sempre: serve alle prove di salute di chi
 * ospita, che bussano da dentro il contenitore.
 */
export function ospitiAmmessi(portaVera: number): Set<string> {
  const fuori = new Set<string>([
    `127.0.0.1:${portaVera}`, `localhost:${portaVera}`,
    `127.0.0.1`, `localhost`
  ])
  if (DOMINIO) fuori.add(DOMINIO)
  const railway = pulisci(process.env.RAILWAY_PUBLIC_DOMAIN ?? '')
  if (railway) fuori.add(railway)
  /*
   * Ospitati senza sapere sotto quale nome.
   *
   * Capita davvero: un dominio appena generato che la piattaforma non ha
   * ancora passato all'ambiente, o un proxy che riscrive l'Host. Rifiutare
   * tutto vorrebbe dire un servizio che non risponde a nessuno per una
   * variabile mancante — cioè esattamente il guasto muto che questo file
   * esiste per evitare. Se non sappiamo il nostro nome non possiamo usarlo
   * come difesa, e va detto invece di far finta.
   */
  return fuori
}

/**
 * Questo Host va bene?
 *
 * Sta qui e non dentro la guardia perché c'è un caso che una `Set.has` non sa
 * esprimere: **ospitati senza sapere sotto quale nome.** Capita davvero — un
 * dominio appena generato che la piattaforma non ha ancora passato
 * all'ambiente, o un proxy che riscrive l'Host. Se non conosciamo il nostro
 * nome non possiamo usarlo come difesa, e rifiutare tutto vorrebbe dire un
 * servizio che non risponde a nessuno per una variabile mancante — di nuovo il
 * guasto muto che questo file esiste per evitare.
 *
 * Perdere quel controllo lì non lascia scoperto niente di importante: era la
 * difesa contro il DNS rebinding, che serve a proteggere un server *in ascolto
 * sul computer di qualcuno*. Su un indirizzo pubblico quel bersaglio non
 * esiste, e a difendere ci sono l'accesso e l'invito.
 */
export function ospiteAmmesso(host: string, portaVera: number): boolean {
  if (ospitiAmmessi(portaVera).has(host)) return true
  return OSPITATO && !DOMINIO
}

/**
 * Le origini ammesse, come espressione.
 *
 * In casa è http su localhost; ospitato è https sul dominio, e **solo** https:
 * un'origine http su un indirizzo pubblico vorrebbe dire una sessione che
 * viaggia in chiaro, e chi ospita mette già il certificato davanti.
 */
export function origineAmmessa(origin: string, portaVera: number): boolean {
  if (new RegExp(`^http://(127\\.0\\.0\\.1|localhost):(5173|${portaVera})$`).test(origin)) return true
  if (!OSPITATO) return false
  // stesso caso di sopra: ospitati e senza nome, non c'è niente con cui
  // confrontare, e un servizio muto è peggio di un controllo in meno
  if (!DOMINIO) return true
  for (const d of ospitiAmmessi(portaVera)) {
    if (d.includes('localhost') || d.startsWith('127.')) continue
    if (origin === `https://${d}`) return true
  }
  return false
}

/**
 * Quello che su un server non può funzionare, e che va detto invece che
 * lasciato fallire.
 *
 * Sono le tre cose che leggono *questa macchina*: le cartelle del disco, il
 * Calendario del Mac, e Claude Code. Dentro un contenitore la prima trova una
 * cartella vuota, la seconda non trova AppleScript, la terza non trova
 * l'eseguibile. Offrirle lo stesso vorrebbe dire tre schede che si possono
 * premere e che non porteranno mai niente — e chi le prova pensa che sia
 * rotto Myynd, non che siano fuori posto.
 */
export const SOLO_IN_CASA = ['desktop']

/**
 * Le app OAuth di chi ospita.
 *
 * Sul computer di una persona ognuno registra la propria app su Google Cloud o
 * Entra ID e incolla il client ID: è quello che il ballo su 127.0.0.1 richiede,
 * ed è già molto da chiedere. Su un server quel ballo non può girare affatto —
 * il browser si aprirebbe *sul server*, e il ritorno busserebbe a un 127.0.0.1
 * che non è quello di nessuno. Quindi ospitati il ritorno passa dal nostro
 * dominio, e l'app la registra chi ospita, una volta per tutti, con queste
 * variabili. Chi entra preme un bottone e dice di sì a Google: niente da
 * incollare. Senza queste variabili Gmail, Calendario, Drive, Outlook e
 * SharePoint si dichiarano «non ancora disponibili su questo server» invece di
 * offrire un modulo che chiede un client ID e poi fallisce.
 *
 * Indirizzo di ritorno da registrare presso il fornitore, esattamente:
 *   https://<dominio>/api/oauth/ritorno
 */
export const APP_GOOGLE = {
  clientId: (process.env.MYYND_GOOGLE_CLIENT_ID ?? '').trim(),
  clientSecret: (process.env.MYYND_GOOGLE_CLIENT_SECRET ?? '').trim() || undefined
}
export const APP_MICROSOFT = {
  clientId: (process.env.MYYND_MICROSOFT_CLIENT_ID ?? '').trim(),
  clientSecret: (process.env.MYYND_MICROSOFT_CLIENT_SECRET ?? '').trim() || undefined,
  tenant: (process.env.MYYND_MICROSOFT_TENANT ?? '').trim() || 'common'
}

/** Cosa può fare il ballo via web, qui. */
export function oauthWeb(): { google: boolean; microsoft: boolean; ritorno: string | null } {
  const ritorno = DOMINIO ? `https://${DOMINIO}/api/oauth/ritorno` : null
  return {
    google: !!(ritorno && APP_GOOGLE.clientId),
    microsoft: !!(ritorno && APP_MICROSOFT.clientId),
    ritorno
  }
}

/**
 * Chi può registrarsi.
 *
 * Ognuno ha la sua cartella, quindi un estraneo che si registra non vede
 * niente di nessuno — ma occupa disco, un posto nei giri di sfondo, e se chi
 * ospita ha messo una chiave nell'ambiente… no, quella ospitati non si usa più.
 * Resta comunque una scelta di chi ospita, e si fa con una variabile:
 *   MYYND_REGISTRAZIONE = aperta (predefinito) | invito | chiusa
 *   MYYND_INVITO        = la parola da dare a chi si registra, con «invito»
 *   MYYND_DOMINI        = domini email ammessi, separati da virgola (opzionale)
 */
export type Registrazione = 'aperta' | 'invito' | 'chiusa'
export const REGISTRAZIONE: Registrazione = (() => {
  const v = (process.env.MYYND_REGISTRAZIONE ?? '').trim().toLowerCase()
  return v === 'invito' || v === 'chiusa' ? v : 'aperta'
})()
export const INVITO = (process.env.MYYND_INVITO ?? '').trim()
export const DOMINI_AMMESSI = (process.env.MYYND_DOMINI ?? '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)

/** Un connettore che ospitati non può funzionare finché chi ospita non registra l'app. */
export function fermoSulServer(connettore: string): boolean {
  if (!OSPITATO) return false
  const web = oauthWeb()
  if (connettore === 'google' || connettore === 'drive') return !web.google
  if (connettore === 'microsoft' || connettore === 'sharepoint') return !web.microsoft
  return false
}

/**
 * Un host di posta che ha senso raggiungere da qui.
 *
 * Su un server, «collega la tua casella» con un host libero è anche «fai una
 * richiesta di rete a quello che dico io»: la rete interna di chi ospita, il
 * server stesso. Si escludono i nomi e gli indirizzi che di sicuro non sono un
 * fornitore di posta. Non è una difesa completa — un nome pubblico può
 * risolversi dove vuole — ma toglie i casi che si scrivono a mano.
 */
export function hostRaggiungibile(host: string): boolean {
  if (!OSPITATO) return true
  const h = host.trim().toLowerCase()
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return false
  if (h.startsWith('[') || h.includes(':')) return false // IPv6 letterale
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false
  }
  return true
}

export function disponibile(connettore: string): boolean {
  return !OSPITATO || !SOLO_IN_CASA.includes(connettore)
}
