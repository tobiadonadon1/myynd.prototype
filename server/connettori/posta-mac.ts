// Mail del Mac: le email che Mail tiene già su questo disco, lette e basta (P4).
//
// Chi usa Mail ha già collegato lì la sua casella, Gmail, iCloud o Exchange
// che sia: niente password per le app da andare a generare. Si leggono i file
// `.emlx` di Mail (uno per messaggio), mai il suo database: niente copie,
// niente lucchetti, niente scritture. Solo la posta in arrivo e quella
// inviata di ogni casella; mai la posta indesiderata, il cestino, le bozze
// o gli archivi. Le cartelle di Mail sono protette da macOS: senza
// l'accesso completo al disco non si apre niente, e lo si dice con il suo
// rimedio. Un messaggio che arriva anche dalla casella letta via IMAP (stesso
// Message-ID) non si scrive due volte: vince la casella, che sa rispondere.

import { readdir, readFile, stat, open } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { simpleParser } from 'mailparser'
import type { Documento } from '../store.ts'
import * as store from '../store.ts'
import { riflua } from '../testo.ts'
import { filoDi, idPulito, rispondeDi, destinatariDi } from '../filo.ts'
import { massaDi } from './posta.ts'
import { resto, type Resto } from './ripresa.ts'
import { GuaioFonte } from './guaio.ts'
import { FONTI_POSTA } from './registro.ts'

export const NON_C_E = 'Mail non è su questo Mac, o non è mai stata aperta.'
export const PERMESSO = 'Per leggere Mail serve l’accesso completo al disco.'
export const FORMATO = 'Mail ha cambiato formato: serve un aggiornamento di Myynd.'

/** Le caselle lette via IMAP o API: i loro Message-ID vincono su quelli di Mail del Mac. */
const ALTRE_POSTE = FONTI_POSTA.filter(f => f !== 'postamac')
const IN_ARRIVO = /^inbox$/i
const INVIATA = /^(sent|sent messages|sent mail|sent items|posta inviata|inviati|inviata|messaggi inviati|elementi inviati)$/i
/** Quanto di un file si legge per trovare la data e il Message-ID. */
const TESTA = 16 * 1024
/** Un margine sull'orologio: un file scritto prima di `dal` meno questo non può essere più nuovo. */
const MARGINE_MS = 2 * 86_400_000

const negato = (e: unknown) => {
  const c = (e as { code?: string }).code
  return c === 'EPERM' || c === 'EACCES'
}

/** La cartella di Mail più recente (`~/Library/Mail/V10`, o la più alta che c'è). */
export async function radice(casa = homedir()): Promise<string> {
  const dove = join(casa, 'Library', 'Mail')
  let voci: string[]
  try { voci = await readdir(dove) }
  catch (e) { throw negato(e) ? new GuaioFonte(PERMESSO, 'permesso-disco') : new GuaioFonte(NON_C_E, 'apri-app') }
  const versioni = voci.map(v => /^V(\d+)$/.exec(v)).filter((m): m is RegExpExecArray => !!m).sort((a, b) => Number(b[1]) - Number(a[1]))
  if (!versioni.length) throw new GuaioFonte(NON_C_E, 'apri-app')
  return join(dove, versioni[0]![0])
}

export type Casella = { conto: string; nome: string; percorso: string; inviata: boolean }

async function cartelle(dove: string): Promise<{ nome: string; percorso: string; dir: boolean }[]> {
  const voci = await readdir(dove, { withFileTypes: true })
  return voci.map(v => ({ nome: v.name, percorso: join(dove, v.name), dir: v.isDirectory() }))
}

/** Le caselle di posta in arrivo e inviata di ogni conto di Mail. */
export async function caselle(v: string): Promise<Casella[]> {
  let conti: { nome: string; percorso: string; dir: boolean }[]
  try { conti = (await cartelle(v)).filter(c => c.dir && c.nome !== 'MailData' && !c.nome.startsWith('.')) }
  catch (e) { throw negato(e) ? new GuaioFonte(PERMESSO, 'permesso-disco') : new GuaioFonte(NON_C_E, 'apri-app') }
  if (!conti.length) throw new GuaioFonte(NON_C_E, 'apri-app')
  const fuori: Casella[] = []
  let conMbox = false
  for (const conto of conti) {
    // le caselle, anche una dentro l'altra («[Gmail].mbox/Sent Mail.mbox»)
    const giro = async (dove: string, prefisso: string) => {
      let voci: { nome: string; percorso: string; dir: boolean }[]
      try { voci = await cartelle(dove) } catch (e) { if (negato(e)) throw new GuaioFonte(PERMESSO, 'permesso-disco'); return }
      for (const x of voci) {
        if (!x.dir || !x.nome.endsWith('.mbox')) continue
        conMbox = true
        const nome = x.nome.slice(0, -'.mbox'.length)
        const percorso = prefisso ? `${prefisso}/${nome}` : nome
        if (IN_ARRIVO.test(nome) || INVIATA.test(nome)) fuori.push({ conto: conto.nome, nome: percorso, percorso: x.percorso, inviata: INVIATA.test(nome) })
        await giro(x.percorso, percorso)
      }
    }
    await giro(conto.percorso, '')
  }
  if (!conMbox) throw new GuaioFonte(FORMATO, 'aggiorna')
  return fuori
}

/** Tutti i `.emlx` di una casella, senza scendere nelle caselle figlie. */
async function messaggi(mbox: string): Promise<string[]> {
  const fuori: string[] = []
  const giro = async (dove: string, profondita: number) => {
    if (profondita > 8) return
    let voci: { nome: string; percorso: string; dir: boolean }[]
    try { voci = await cartelle(dove) } catch (e) { if (negato(e)) throw new GuaioFonte(PERMESSO, 'permesso-disco'); return }
    for (const x of voci) {
      if (x.dir) {
        if (x.nome.endsWith('.mbox')) continue
        await giro(x.percorso, profondita + 1)
      } else if (x.nome.endsWith('.emlx') && basename(dove) === 'Messages') fuori.push(x.percorso)
    }
  }
  await giro(mbox, 0)
  return fuori
}

/** Le intestazioni che servono a scegliere, dai primi sedici kilobyte. */
function testaDi(testo: string): { data: number | null; messageId: string | null } {
  const dopoLunghezza = testo.indexOf('\n')
  const corpo = dopoLunghezza >= 0 ? testo.slice(dopoLunghezza + 1) : testo
  const fine = corpo.search(/\r?\n\r?\n/)
  const righe = (fine >= 0 ? corpo.slice(0, fine) : corpo).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)
  let data: number | null = null, messageId: string | null = null
  for (const r of righe) {
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(r)
    if (!m) continue
    const k = m[1]!.toLowerCase()
    if (k === 'date' && data === null) { const t = Date.parse(m[2]!.replace(/\s*\([^)]*\)\s*$/, '')); if (!Number.isNaN(t)) data = t }
    else if (k === 'message-id' && messageId === null) messageId = idPulito(m[2]) || null
  }
  return { data, messageId }
}

export type Candidato = { id: string; file: string; conto: string; casella: string; inviata: boolean; quando: number; messageId: string | null }

/**
 * I messaggi della finestra, dal più recente: la stessa scelta per la scheda
 * e per la lettura, così il numero che la scheda dice è quello che si legge.
 */
export async function candidati(v: string, dal: number): Promise<{ lista: Candidato[]; caselle: number }> {
  const lista: Candidato[] = []
  const conti = new Set<string>()
  for (const c of await caselle(v)) {
    for (const file of await messaggi(c.percorso)) {
      let s
      try { s = await stat(file) } catch (e) { if (negato(e)) throw new GuaioFonte(PERMESSO, 'permesso-disco'); continue }
      // scritto prima della finestra: il messaggio non può essere più nuovo del file
      if (s.mtimeMs < dal - MARGINE_MS) continue
      let testa = ''
      try {
        const f = await open(file, 'r')
        try {
          const b = Buffer.alloc(TESTA)
          const { bytesRead } = await f.read(b, 0, TESTA, 0)
          testa = b.subarray(0, bytesRead).toString('utf8')
        } finally { await f.close() }
      } catch (e) { if (negato(e)) throw new GuaioFonte(PERMESSO, 'permesso-disco'); continue }
      const h = testaDi(testa)
      const quando = h.data ?? s.mtimeMs
      if (quando < dal) continue
      lista.push({ id: `postamac:${c.conto}/${c.nome}/${basename(file)}`, file, conto: c.conto, casella: c.nome, inviata: c.inviata, quando, messageId: h.messageId })
      conti.add(c.conto)
    }
  }
  lista.sort((a, b) => b.quando - a.quando)
  return { lista, caselle: conti.size }
}

/** Via quelli che la casella IMAP (o Gmail, o Outlook) ha già portato. */
function senzaDoppioni(lista: Candidato[]): Candidato[] {
  const gia = store.messageIdGia(lista.map(c => c.messageId ?? '').filter(Boolean), ALTRE_POSTE)
  return lista.filter(c => !c.messageId || !gia.has(c.messageId))
}

/** Prova: quante email della finestra, e da quante caselle. */
export async function prova(giorni = 90, casa = homedir(), adesso = Date.now()): Promise<{ email: number; caselle: number }> {
  const v = await radice(casa)
  const { lista } = await candidati(v, adesso - giorni * 86_400_000)
  const buoni = senzaDoppioni(lista)
  return { email: buoni.length, caselle: new Set(buoni.map(c => c.conto)).size }
}

/** Il messaggio vero, dentro un `.emlx`: la lunghezza, i byte, e in fondo le bandiere. */
export function apriEmlx(b: Buffer): { messaggio: Buffer; letto: boolean | undefined } {
  const a = b.indexOf(0x0a)
  const n = Number(b.subarray(0, a).toString('ascii').trim())
  if (a < 0 || !Number.isFinite(n) || n <= 0) return { messaggio: b, letto: undefined }
  const messaggio = b.subarray(a + 1, a + 1 + n)
  const coda = b.subarray(a + 1 + n).toString('utf8')
  const m = /<key>flags<\/key>\s*<integer>(\d+)<\/integer>/.exec(coda)
  return { messaggio, letto: m ? Number(BigInt(m[1]!) % 2n) === 1 : undefined }
}

export type EsitoPostaMac = { docs: Documento[]; visti: string[]; dal: string; resto: Resto; caselle: number }

/**
 * Legge i messaggi nuovi della finestra, i più recenti per primi, al massimo
 * `tetto` per giro: il resto arriva ai giri dopo, e `resto` dice quanto manca.
 */
export async function sincronizza(o: { giorni: number; tetto?: number; casa?: string; adesso?: number }): Promise<EsitoPostaMac> {
  const adesso = o.adesso ?? Date.now()
  const tetto = o.tetto ?? 400
  const dal = adesso - o.giorni * 86_400_000
  const v = await radice(o.casa ?? homedir())
  const { lista, caselle: n } = await candidati(v, dal)
  const visti = lista.map(c => c.id)
  const gia = new Set(store.idsConPrefisso('postamac:'))
  const buoni = senzaDoppioni(lista)
  const mancano = buoni.filter(c => !gia.has(c.id))
  const scelti = mancano.slice(0, tetto)
  const docs: Documento[] = []
  for (const c of scelti) {
    try {
      const { messaggio, letto } = apriEmlx(await readFile(c.file))
      const p = await simpleParser(messaggio)
      const testo = riflua((p.text || '').trim())
      if (!testo) continue
      const mittente = p.from?.value?.[0]
      docs.push({
        id: c.id,
        fonte: 'postamac',
        tipo: 'email',
        titolo: p.subject || '(senza oggetto)',
        corpo: testo.slice(0, 20_000),
        autore: mittente ? `${mittente.name || ''} <${mittente.address || ''}>`.trim() : null,
        percorso: c.casella,
        quando: (p.date ?? new Date(c.quando)).toISOString(),
        gruppo: 'posta',
        filo: filoDi({ messageId: p.messageId, inReplyTo: p.inReplyTo, references: p.references, oggetto: p.subject }),
        messageId: idPulito(p.messageId) || null,
        risponde: rispondeDi(p.inReplyTo),
        destinatari: destinatariDi(p.to, p.cc),
        inviato: c.inviata,
        letto,
        massa: massaDi(p)
      })
    } catch (e) {
      if (negato(e)) throw new GuaioFonte(PERMESSO, 'permesso-disco')
      // un messaggio illeggibile non ferma gli altri
    }
  }
  const arretrato = mancano.length - scelti.length
  return {
    docs, visti, dal: new Date(dal).toISOString(), caselle: n,
    resto: { ...resto(buoni.length - arretrato, buoni.length), aGiorno: arretrato === 0 }
  }
}
