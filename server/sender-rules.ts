// A person's exact-address rule archives incoming mail. It is a local rule,
// not a provider-level block. Disabling it stops future suppression/actions;
// previously archived messages remain in the mailbox's Archive folder.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cartella, leggi } from './config.ts'
import * as store from './store.ts'
import * as google from './connettori/google.ts'
import * as posta from './connettori/posta.ts'

const RUN_MAX = 20
const CANDIDATE_MAX = 300
const RULE_MAX = 100
const JOURNAL_MAX = 100_000

export type SenderRule = { id: string; sender: string; action: 'archive'; enabled: boolean; createdAt: string; updatedAt: string; lastCheckedAt?: string; archivedCount?: number; lastError?: string }
export type SenderJournal = { sender: string; status: 'pending' | 'confirmed' | 'uncertain'; messageId: string | null; at: string; detail?: string }
type RuleFile = { version: 1; rules: SenderRule[]; journal: Record<string, SenderJournal> }
export type SenderPreview = { id: string; sender: string; title: string; source: 'google' | 'posta'; date: string | null }
export type SenderRun = { processed: number; archived: number; uncertain: number; skipped: number; matched: number; limit: number }

const locks = new Map<string, Promise<void>>()
const activeCache = new Map<string, { mtimeNs: bigint; size: bigint; senders: Set<string> }>()
const ruleFile = () => join(cartella(), 'sender-rules.json')
const empty = (): RuleFile => ({ version: 1, rules: [], journal: {} })

/** An explicit full mailbox only; no domains, wildcards or fuzzy patterns. */
export function normalizeSender(sender: string): string {
  const value = String(sender ?? '').trim().toLowerCase()
  if (value.length > 254 || /[?*]/.test(value) || !/^[a-z0-9.!#$%&'+/=^_`{|}~-]+@(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(value)
    || value.includes('..') || value.startsWith('.') || value.split('@')[0].endsWith('.')) {
    throw new Error('Inserisci un indirizzo email completo, senza jolly o dominio generico.')
  }
  return value
}

function senderFromDocument(doc: Pick<store.Documento, 'fonte' | 'tipo' | 'autore' | 'inviato'>): string | null {
  if (doc.inviato || doc.tipo !== 'email' || !['google', 'posta'].includes(doc.fonte) || !doc.autore) return null
  // Ambiguous From headers are never used for a destructive mailbox action.
  if ((doc.autore.match(/@/g) ?? []).length !== 1) return null
  const extracted = store.indirizzoDi(doc.autore)
  if (!extracted) return null
  try { return normalizeSender(extracted) } catch { return null }
}

function readRules(): RuleFile {
  const path = ruleFile()
  if (!existsSync(path)) return empty()
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as RuleFile
  if (parsed.version !== 1 || !Array.isArray(parsed.rules) || !parsed.journal || typeof parsed.journal !== 'object') {
    throw new Error('Le regole della posta non sono leggibili; non le sovrascrivo.')
  }
  return parsed
}

async function saveRules(state: RuleFile): Promise<void> {
  const path = ruleFile()
  await mkdir(cartella(), { recursive: true })
  const temp = `${path}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 })
  await rename(temp, path)
  activeCache.delete(path)
}

async function locked<T>(work: () => Promise<T>): Promise<T> {
  const key = cartella()
  const earlier = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>(resolve => { release = resolve })
  const queued = earlier.then(() => next)
  locks.set(key, queued)
  await earlier
  try { return await work() } finally { release(); if (locks.get(key) === queued) locks.delete(key) }
}

function withJournalStatus(state: RuleFile): SenderRule[] {
  return state.rules.map(rule => {
    const entries = Object.values(state.journal).filter(j => j.sender === rule.sender)
    const latestFailure = entries.filter(j => j.status === 'uncertain').sort((a, b) => b.at.localeCompare(a.at))[0]
    return { ...rule, archivedCount: entries.filter(j => j.status === 'confirmed').length,
      ...(latestFailure ? { lastError: latestFailure.detail ?? 'Archiviazione da verificare nella casella.' } : {}) }
  })
}

export function listSenderRules(): SenderRule[] { return withJournalStatus(readRules()) }

export async function enableSenderRule(sender: string, action: 'archive'): Promise<SenderRule> {
  if (action !== 'archive') throw new Error('Questa regola può solo archiviare, mai cancellare.')
  const exact = normalizeSender(sender)
  return locked(async () => {
    const state = readRules()
    const id = createHash('sha256').update(exact).digest('hex').slice(0, 20)
    const now = new Date().toISOString()
    let rule = state.rules.find(r => r.id === id)
    if (rule) { if (!rule.enabled) { rule.enabled = true; rule.updatedAt = now } }
    else {
      if (state.rules.length >= RULE_MAX) throw new Error('Ci sono troppe regole: togline una prima di aggiungerne altre.')
      rule = { id, sender: exact, action: 'archive', enabled: true, createdAt: now, updatedAt: now }
      state.rules.push(rule)
    }
    await saveRules(state)
    return { ...rule }
  })
}

export async function disableSenderRule(id: string): Promise<SenderRule[]> {
  return locked(async () => {
    const state = readRules()
    const rule = state.rules.find(r => r.id === id)
    if (!rule) throw new Error('Regola non trovata.')
    rule.enabled = false
    rule.updatedAt = new Date().toISOString()
    await saveRules(state)
    return withJournalStatus(state)
  })
}

/** Used at feed/ingestion boundaries, including before a scheduled archive. */
export function suppressSender(doc: Pick<store.Documento, 'fonte' | 'tipo' | 'autore' | 'inviato'>): boolean {
  const sender = senderFromDocument(doc)
  if (!sender) return false
  const path = ruleFile()
  if (!existsSync(path)) return false
  const stat = statSync(path, { bigint: true })
  let cached = activeCache.get(path)
  if (!cached || cached.mtimeNs !== stat.mtimeNs || cached.size !== stat.size) {
    const senders = new Set(readRules().rules.filter(r => r.enabled).map(r => r.sender))
    cached = { mtimeNs: stat.mtimeNs, size: stat.size, senders }
    activeCache.set(path, cached)
  }
  return cached.senders.has(sender)
}

function candidatesFor(sender: string, limit = CANDIDATE_MAX): store.Documento[] {
  const ids = store.default.prepare(`
    SELECT id FROM documenti WHERE fonte IN ('google','posta') AND tipo = 'email'
      AND (inviato IS NULL OR inviato = 0) AND autoreIndirizzo = ?
    ORDER BY indicizzato DESC LIMIT ?
  `).all(sender, limit) as { id: string }[]
  return ids.flatMap(row => {
    const doc = store.documento(row.id)
    return doc && senderFromDocument(doc) === sender ? [doc] : []
  })
}

export function previewSender(sender: string, limit = 20): SenderPreview[] {
  const exact = normalizeSender(sender)
  return candidatesFor(exact, Math.min(Math.max(1, limit), 50)).map(doc => ({
    id: doc.id, sender: exact, title: doc.titolo,
    source: doc.fonte as 'google' | 'posta', date: doc.quando ?? null
  }))
}

type Dependencies = {
  googleArchive?: (ids: string[]) => Promise<number>
  imapArchive?: (ids: string[]) => Promise<number>
  forget?: (ids: string[]) => void
  log?: (id: string, sender: string, success: boolean, detail: string) => void
}

function arrivedAfterEnable(doc: store.Documento, rule: SenderRule): boolean {
  if (!doc.quando) return false
  const received = new Date(doc.quando).getTime()
  const enabled = new Date(rule.updatedAt).getTime()
  const now = Date.now()
  return Number.isFinite(received) && Number.isFinite(enabled) && received >= enabled && received <= now
}

/**
 * One message per provider call. `pending` is persisted before a mutation;
 * a timeout or crash leaves it pending/uncertain and never retries blindly.
 */
export async function runSenderRules(deps: Dependencies = {}): Promise<SenderRun> {
  const active = listSenderRules().filter(r => r.enabled)
  const result: SenderRun = { processed: 0, archived: 0, uncertain: 0, skipped: 0, matched: 0, limit: RUN_MAX }
  if (!active.length) return result
  const config = leggi()
  for (const initialRule of active) {
    await locked(async () => {
      const state = readRules()
      const current = state.rules.find(r => r.id === initialRule.id)
      if (current?.enabled) { current.lastCheckedAt = new Date().toISOString(); await saveRules(state) }
    })
    for (const doc of candidatesFor(initialRule.sender)) {
      result.matched++
      if (result.processed >= RUN_MAX) return result
      // The lock covers one message, never a 20-message batch. A disable
      // waiting behind this call takes effect before the next one starts.
      await locked(async () => {
        const state = readRules()
        const rule = state.rules.find(r => r.id === initialRule.id)
        if (!rule?.enabled || !arrivedAfterEnable(doc, rule) || state.journal[doc.id]) { result.skipped++; return }
        if ((doc.fonte === 'google' && !config.google && !deps.googleArchive)
          || (doc.fonte === 'posta' && !config.posta && !deps.imapArchive)) { result.skipped++; return }
        if (Object.keys(state.journal).length >= JOURNAL_MAX) throw new Error('Il registro delle regole è pieno; serve una revisione prima di continuare.')
        const entry: SenderJournal = { sender: rule.sender, status: 'pending', messageId: doc.messageId ?? null, at: new Date().toISOString() }
        state.journal[doc.id] = entry
        await saveRules(state)
        result.processed++
        try {
          const moved = doc.fonte === 'google'
            ? deps.googleArchive ? await deps.googleArchive([doc.id]) : await google.verificaEArchiviaPerRegola(doc.id, rule.sender, doc.messageId ?? null)
            : deps.imapArchive ? await deps.imapArchive([doc.id]) : await posta.verificaEArchiviaPerRegola(config.posta!, doc.id, rule.sender, doc.messageId ?? null)
          if (moved !== 1) throw new Error('La casella non ha confermato l’archiviazione di questo messaggio.')
          entry.status = 'confirmed'
          await saveRules(state)
          result.archived++
          try { (deps.forget ?? store.scordaDocumenti)([doc.id]) } catch { /* already moved; suppression still applies */ }
          try { (deps.log ?? defaultLog)(doc.id, rule.sender, true, 'confirmed') } catch { /* journal is authoritative */ }
        } catch (error) {
          entry.status = 'uncertain'
          entry.detail = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
          await saveRules(state)
          result.uncertain++
          try { (deps.log ?? defaultLog)(doc.id, rule.sender, false, entry.detail) } catch { /* journal is authoritative */ }
        }
      })
    }
  }
  return result
}

function defaultLog(id: string, sender: string, success: boolean, detail: string): void {
  store.registraAzione({ tipo: 'posta.regola.archivia', cosa: sender, verso: id, esito: success ? 'fatta' : 'fallita', dettaglio: detail })
}
