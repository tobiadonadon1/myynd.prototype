// Myynd su un server, invece che sul computer di chi lo usa.
//
// **Questo file esiste per rendere una differenza esplicita, non per
// cancellarla.** Myynd è nato per girare sulla macchina di una persona: legge
// la sua posta, i suoi file, e non esce di lì. È la promessa che regge tutto
// il resto — il brief la chiama «la ragione per cui un'azienda italiana dice
// di sì». Metterlo su un server la capovolge: le credenziali smettono di stare
// sul computer di chi le ha scritte e cominciano a stare da qualcun altro.
//
// Quella scelta non si può prendere per sbaglio, e non si può prendere di
// nascosto. Perciò non c'è nessun valore predefinito che accende questa
// modalità: si accende scrivendo un nome di dominio in `MYYND_PUBBLICO`, e chi
// lo scrive sa cosa sta facendo.
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
//   · **registrarsi vuole un invito.** Su un computer di casa il primo che
//     apre l'app è il padrone di casa. Su un indirizzo pubblico il primo che
//     lo trova diventerebbe il padrone della posta di qualcun altro, perché
//     `auth.registra` accetta un account solo e chiunque arrivi dopo entra in
//     quello. Senza `MYYND_INVITO` questa modalità non lascia registrare
//     nessuno — non è una comodità disattivabile, è la serratura.

import { homedir } from 'node:os'
import { join } from 'node:path'

/** Il dominio pubblico da cui si arriva, se ce n'è uno. Vuoto = da casa. */
export const DOMINIO = (process.env.MYYND_PUBBLICO ?? '').trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/\/.*$/, '')

/** Vero quando Myynd sta girando su un server e non sul computer di qualcuno. */
export const OSPITATO = !!DOMINIO

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

/** La parola che serve per registrarsi, quando si è su un indirizzo pubblico. */
export const INVITO = (process.env.MYYND_INVITO ?? '').trim()

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
  const railway = (process.env.RAILWAY_PUBLIC_DOMAIN ?? '').trim().toLowerCase()
  if (railway) fuori.add(railway)
  return fuori
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

export function disponibile(connettore: string): boolean {
  return !OSPITATO || !SOLO_IN_CASA.includes(connettore)
}
