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

function client(c: ConfigPosta, servername?: string) {
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
        risolvi(concreto ?? (jolly ? jolly.slice(2) : null))
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
    return { ok: false, errore: messaggioErrore(e) }
  }
}

function messaggioErrore(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/auth/i.test(m)) return 'Utente o password non accettati dal server.'
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return 'Host IMAP non trovato: controlla il nome del server.'
  if (/ETIMEDOUT|timeout/i.test(m)) return 'Il server non risponde. Controlla host e porta.'
  if (/altnames/i.test(m)) return 'Il certificato del server è intestato a un altro nome e non sono riuscito a combaciarlo.'
  if (/certificate/i.test(m)) return 'Certificato TLS non valido sul server.'
  return m
}

export type EsitoPosta = { docs: Documento[]; cartelleFallite: string[] }

export async function sincronizza(
  c: ConfigPosta,
  avanzamento?: (fatti: number, totale: number) => void
): Promise<EsitoPosta> {
  const giorni = c.giorni ?? 30
  const da = new Date(Date.now() - giorni * 86400_000)
  const cartelle = c.cartelle?.length ? c.cartelle : ['INBOX']
  const docs: Documento[] = []
  const cartelleFallite: string[] = []
  const { cl } = await apri(c)

  try {
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
  return { docs, cartelleFallite }
}
