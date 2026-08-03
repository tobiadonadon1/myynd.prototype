/**
 * Registro attività: append-only JSON su <configDir>/attivita.json.
 * Registra quello che il motore ha davvero fatto — mai una cronologia
 * inventata. getActivity() raggruppa per giorno con etichette italiane:
 * "oggi", "ieri", poi "12 marzo" (con l'anno se non è quello corrente).
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ActivityDay, ActivityEntry, ActivityKind } from '@shared/types'

// Un registro pensato per essere letto una volta al giorno non deve crescere
// senza limite: senza un tetto, un'ora di prove ripetute (la stessa domanda
// chiesta più volte, una proposta rigenerata più volte) può produrre decine
// di righe identiche sotto lo stesso giorno.
const MAX_ENTRIES = 500

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function labelForDay(key: string): string {
  const today = new Date()
  const todayKey = dayKey(today.toISOString())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = dayKey(yesterday.toISOString())

  if (key === todayKey) return 'oggi'
  if (key === yesterdayKey) return 'ieri'

  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const monthDay = date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return y === today.getFullYear() ? monthDay : `${monthDay} ${y}`
}

export class ActivityLog {
  constructor(private readonly configDir: string) {}

  private filePath(): string {
    return path.join(this.configDir, 'attivita.json')
  }

  private readAll(): ActivityEntry[] {
    try {
      const raw = readFileSync(this.filePath(), 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as ActivityEntry[]) : []
    } catch {
      return []
    }
  }

  private writeAll(entries: ActivityEntry[]): void {
    try {
      mkdirSync(this.configDir, { recursive: true })
      writeFileSync(this.filePath(), JSON.stringify(entries, null, 2), 'utf-8')
    } catch (err) {
      console.error('[myynd/activity] impossibile scrivere il registro attività:', err)
    }
  }

  /** registra un evento reale — mai una cronologia inventata */
  add(kind: ActivityKind, text: string): void {
    const entries = this.readAll()

    // la stessa riga appena scritta non si ripete: in una sessione di prova
    // la stessa domanda o la stessa rigenerazione può capitare più volte in
    // pochi minuti, e un registro fatto per essere letto una volta al
    // giorno non deve riempirsi di righe identiche una via l'altra.
    const last = entries[entries.length - 1]
    if (last && last.kind === kind && last.text === text) return

    entries.push({ id: randomUUID(), at: new Date().toISOString(), kind, text })
    const capped = entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries
    this.writeAll(capped)
  }

  async getActivity(): Promise<ActivityDay[]> {
    const entries = this.readAll()
    const byDay = new Map<string, ActivityEntry[]>()
    for (const entry of entries) {
      const key = dayKey(entry.at)
      const list = byDay.get(key)
      if (list) list.push(entry)
      else byDay.set(key, [entry])
    }

    return Array.from(byDay.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, dayEntries]) => ({
        label: labelForDay(key),
        date: key,
        entries: [...dayEntries].sort((a, b) => b.at.localeCompare(a.at)),
      }))
  }
}
