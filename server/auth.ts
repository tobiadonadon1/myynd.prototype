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
import { REGISTRAZIONE, INVITO, DOMINI_AMMESSI } from './ospitato.ts'



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

/** Quanto bisogna aspettare prima di riprovare, in millisecondi. */
export function attesa(email: string): number {
  const t = tentativi.get(email.trim().toLowerCase())
  if (!t || t.quanti < ATTESA_DA) return 0
  const dovuta = Math.min(2 ** (t.quanti - ATTESA_DA) * 1000, 5 * 60_000)
  return Math.max(0, t.ultimo + dovuta - Date.now())
}

function segnaTentativo(email: string, riuscito: boolean) {
  const k = email.trim().toLowerCase()
  if (riuscito) { tentativi.delete(k); return }
  const t = tentativi.get(k) ?? { quanti: 0, ultimo: 0 }
  tentativi.set(k, { quanti: t.quanti + 1, ultimo: Date.now() })
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
export async function registra(email: string, password: string, invito = ''):
  Promise<{ ok: true; token: string; utente: string } | { ok: false; errore: string }> {
  // il cancello di chi ospita, prima di toccare il database
  if (REGISTRAZIONE === 'chiusa') return { ok: false, errore: 'Le registrazioni sono chiuse su questo server.' }
  if (REGISTRAZIONE === 'invito') {
    const a = Buffer.from(invito.trim()), b = Buffer.from(INVITO)
    if (!INVITO || a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, errore: 'Serve il codice d’invito per registrarsi qui.' }
    }
  }
  if (DOMINI_AMMESSI.length) {
    const dominio = email.trim().toLowerCase().split('@')[1] ?? ''
    if (!DOMINI_AMMESSI.includes(dominio)) return { ok: false, errore: 'Questo server accetta solo indirizzi dell’azienda.' }
  }
  const e = await conti.registra(email, password)
  if (!e.ok) return e
  return { ok: true, token: e.token, utente: e.id }
}

export async function entra(email: string, password: string):
  Promise<{ ok: true; token: string; utente: string } | { ok: false; errore: string }> {
  const e = await conti.entra(email, password)
  segnaTentativo(email, e.ok)
  if (!e.ok) return e
  return { ok: true, token: e.token, utente: e.id }
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
  if (!await conti.verifica(utente, attuale)) return { ok: false, errore: 'La password attuale non è corretta.' }
  const e = await conti.cambiaPassword(utente, nuova)
  if (!e.ok) return e
  return { ok: true, token: await conti.apri(utente) }
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

/** Le porte che stanno prima dell'accesso: queste e nessun'altra. */
const PRIMA_DELL_ACCESSO = new Set(['/api/auth', '/api/auth/registra', '/api/auth/entra', '/api/auth/esci'])

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
  // asincrona perché su Postgres il token si chiede al database: Express 5
  // aspetta una promessa, e se si rompe la passa al gestore degli errori
  const utente = await conti.utenteDelToken(estrai(req))
  if (!utente) { res.status(401).json({ errore: 'Sessione scaduta.', serve: 'accesso' }); return }
  chi.dentro(utente, next)
}

export const tokenDi = estrai
