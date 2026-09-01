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

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { aggiorna, leggi, type Account } from './config.ts'
import * as store from './store.ts'
import * as ospitato from './ospitato.ts'

export type { Account }

const N = 16384          // costo scrypt: lento quanto basta
const LUNGHEZZA = 64

function impasta(password: string, sale: string): string {
  return scryptSync(password, sale, LUNGHEZZA, { N, r: 8, p: 1 }).toString('hex')
}

/**
 * Le sessioni stanno nell'indice, non in memoria: prima ogni riavvio del server
 * — e con `node --watch` ne basta un salvataggio — rimandava all'accesso, che è
 * il motivo per cui sembrava di dover ricollegare tutto ogni volta.
 *
 * Nel file finisce solo l'impronta: chi legge mente.db non ottiene un token
 * valido, e un token rubato scade comunque.
 */
function impronta(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

store.potaSessioni()

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

export function apriSessioneDiSviluppo(): string {
  store.apriSessione(impronta(TOKEN_SVILUPPO), 1)
  return TOKEN_SVILUPPO
}

export function registrato(): boolean {
  return !!leggi().account
}

export function conto(): { email: string } | null {
  const a = leggi().account
  return a ? { email: a.email } : null
}

/**
 * Registrarsi, e la serratura che serve solo quando si è raggiungibili da fuori.
 *
 * Su un computer di casa il primo che apre l'app è il padrone di casa: non c'è
 * nessun altro che possa arrivarci prima. Su un indirizzo pubblico quella
 * stessa riga diventa la cosa più pericolosa di tutto il programma — il primo
 * che trova l'URL si registra, e da quel momento è **lui** l'account di questa
 * installazione: chiunque arrivi dopo entra in quello, e quello legge la posta
 * che ci è stata collegata.
 *
 * Quindi ospitato serve l'invito, e senza invito configurato non si registra
 * nessuno. Non è una comodità che si può spegnere: è la serratura, e una
 * serratura che si apre quando la chiave manca non è una serratura.
 */
export function registra(email: string, password: string, invito = ''):
  { ok: true; token: string } | { ok: false; errore: string } {
  if (ospitato.OSPITATO) {
    if (!ospitato.INVITO) return { ok: false, errore: 'Qui non ci si può registrare.' }
    // confronto a lunghezza costante: un invito che si può indovinare a
    // tentativi cronometrati non è meglio di nessun invito
    const dato = Buffer.from(invito.trim())
    const atteso = Buffer.from(ospitato.INVITO)
    if (dato.length !== atteso.length || !timingSafeEqual(dato, atteso)) {
      return { ok: false, errore: 'Invito non valido.' }
    }
  }
  if (registrato()) return { ok: false, errore: 'Un account esiste già su questa macchina.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, errore: 'Indirizzo non valido.' }
  if (password.length < 8) return { ok: false, errore: 'Almeno otto caratteri.' }

  const sale = randomBytes(16).toString('hex')
  aggiorna({ account: { email: email.trim(), sale, hash: impasta(password, sale) } })
  return { ok: true, token: apri() }
}

export function entra(email: string, password: string):
  { ok: true; token: string } | { ok: false; errore: string } {
  const a = leggi().account
  if (!a) return { ok: false, errore: 'Nessun account su questa macchina.' }

  const atteso = Buffer.from(a.hash, 'hex')
  const dato = Buffer.from(impasta(password, a.sale), 'hex')
  // confronto a tempo costante, e l'email non deve dire se esiste o no
  const passwordOk = atteso.length === dato.length && timingSafeEqual(atteso, dato)
  const emailOk = email.trim().toLowerCase() === a.email.toLowerCase()
  segnaTentativo(email, passwordOk && emailOk)
  if (!passwordOk || !emailOk) return { ok: false, errore: 'Email o password non corrispondono.' }

  return { ok: true, token: apri() }
}

function apri(): string {
  const t = randomBytes(32).toString('hex')
  store.apriSessione(impronta(t))
  return t
}

export function esci(token?: string) {
  if (token) store.chiudiSessione(impronta(token))
}

export function valida(token?: string): boolean {
  return !!token && store.sessioneValida(impronta(token))
}

function estrai(req: Request): string | undefined {
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ')) return h.slice(7)
  // EventSource non manda intestazioni: per lo stream il token viaggia in query
  const q = req.query?.t
  return typeof q === 'string' && q ? q : undefined
}

/** Guardia su tutto tranne le rotte di accesso. */
export function guardia(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith('/api/auth')) return next()
  if (!registrato()) return res.status(401).json({ errore: 'Nessun account.', serve: 'registrazione' })
  if (!valida(estrai(req))) return res.status(401).json({ errore: 'Sessione scaduta.', serve: 'accesso' })
  next()
}

export const tokenDi = estrai
