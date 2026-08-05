// Posta via IMAP. Su Register.it (il tuo dominio) bastano host, indirizzo e
// password della casella — niente OAuth.

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { ConfigPosta } from '../config.ts'
import type { Documento } from '../store.ts'

export const PRESET: Record<string, { host: string; porta: number; smtp: string; smtpPorta: number }> = {
  'register.it': { host: 'imap.register.it', porta: 993, smtp: 'smtp.register.it', smtpPorta: 465 },
  'gmail': { host: 'imap.gmail.com', porta: 993, smtp: 'smtp.gmail.com', smtpPorta: 465 },
  'outlook': { host: 'outlook.office365.com', porta: 993, smtp: 'smtp.office365.com', smtpPorta: 587 },
  'aruba': { host: 'imaps.aruba.it', porta: 993, smtp: 'smtps.aruba.it', smtpPorta: 465 }
}

function client(c: ConfigPosta) {
  return new ImapFlow({
    host: c.host,
    port: c.porta || 993,
    secure: true,
    auth: { user: c.utente, pass: c.password },
    logger: false,
    // il server non deve restare appeso se la rete cade a metà
    socketTimeout: 60_000
  })
}

/** Prova la connessione senza indicizzare niente. */
export async function prova(c: ConfigPosta): Promise<{ ok: true; cartelle: string[] } | { ok: false; errore: string }> {
  const cl = client(c)
  try {
    await cl.connect()
    const lista = await cl.list()
    await cl.logout()
    return { ok: true, cartelle: lista.map(l => l.path).slice(0, 40) }
  } catch (e) {
    try { await cl.close() } catch { /* già chiusa */ }
    return { ok: false, errore: messaggioErrore(e) }
  }
}

function messaggioErrore(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/auth/i.test(m)) return 'Utente o password non accettati dal server.'
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return 'Host IMAP non trovato: controlla il nome del server.'
  if (/ETIMEDOUT|timeout/i.test(m)) return 'Il server non risponde. Controlla host e porta.'
  if (/certificate/i.test(m)) return 'Certificato TLS non valido sul server.'
  return m
}

export async function sincronizza(
  c: ConfigPosta,
  avanzamento?: (fatti: number, totale: number) => void
): Promise<Documento[]> {
  const giorni = c.giorni ?? 30
  const da = new Date(Date.now() - giorni * 86400_000)
  const cartelle = c.cartelle?.length ? c.cartelle : ['INBOX']
  const docs: Documento[] = []
  const cl = client(c)

  await cl.connect()
  try {
    for (const cartella of cartelle) {
      let lock
      try {
        lock = await cl.getMailboxLock(cartella)
      } catch {
        continue // cartella sparita o senza permessi: la salto
      }
      try {
        const uids = await cl.search({ since: da }, { uid: true })
        if (!uids || !uids.length) continue
        // le più recenti prima, con un tetto per non tirare giù anni di posta
        const scelti = uids.slice(-400)
        let fatti = 0
        for await (const msg of cl.fetch(scelti, { uid: true, source: true, envelope: true }, { uid: true })) {
          try {
            const p = await simpleParser(msg.source as Buffer)
            const testo = (p.text || '').trim()
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
              gruppo: 'posta'
            })
          } catch {
            // un messaggio illeggibile non deve fermare la sincronizzazione
          }
          fatti++
          if (avanzamento && fatti % 20 === 0) avanzamento(fatti, scelti.length)
        }
      } finally {
        lock.release()
      }
    }
  } finally {
    try { await cl.logout() } catch { /* la connessione è già caduta */ }
  }
  return docs
}
