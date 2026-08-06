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

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { aggiorna, leggi, type Account } from './config.ts'

export type { Account }

const N = 16384          // costo scrypt: lento quanto basta
const LUNGHEZZA = 64

function impasta(password: string, sale: string): string {
  return scryptSync(password, sale, LUNGHEZZA, { N, r: 8, p: 1 }).toString('hex')
}

/** Le sessioni vivono in memoria: se riavvii il server, rientri. */
const sessioni = new Set<string>()

export function registrato(): boolean {
  return !!leggi().account
}

export function conto(): { email: string; azienda: string } | null {
  const a = leggi().account
  return a ? { email: a.email, azienda: a.azienda } : null
}

export function registra(email: string, password: string, azienda: string):
  { ok: true; token: string } | { ok: false; errore: string } {
  if (registrato()) return { ok: false, errore: 'Un account esiste già su questa macchina.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, errore: 'Indirizzo non valido.' }
  if (password.length < 8) return { ok: false, errore: 'Almeno otto caratteri.' }
  if (!azienda.trim()) return { ok: false, errore: 'Manca il nome dell’azienda.' }

  const sale = randomBytes(16).toString('hex')
  aggiorna({ account: { email: email.trim(), sale, hash: impasta(password, sale), azienda: azienda.trim() } })
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
  if (!passwordOk || !emailOk) return { ok: false, errore: 'Email o password non corrispondono.' }

  return { ok: true, token: apri() }
}

function apri(): string {
  const t = randomBytes(32).toString('hex')
  sessioni.add(t)
  return t
}

export function esci(token?: string) {
  if (token) sessioni.delete(token)
}

export function valida(token?: string): boolean {
  return !!token && sessioni.has(token)
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
