/** Project progress is distinct from urgent source-backed attention. No inferred
 * receipt, file or old email can create a project initiative here. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cartella, lingua } from './config.ts'
import db, { elencoCompiti, type Compito } from './store.ts'
import { perContesto } from './progetti.ts'
import { projectEvidence } from './project-memory.ts'

export type ProjectInitiative = {
  id: string; projectId: string; projectName: string; goal: string
  kind: 'next-step' | 'question'; title: string; description: string
  question?: string; taskId?: string
  provenance: 'explicit-project'; urgent: false
}
type Feedback = { id: string; projectId: string; goalKey: string; outcome: 'dismissed' | 'answered' | 'done'; at: string }
const file = () => join(cartella(), 'project-initiative-feedback.json')
const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 24)
const normalized = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')
function read(): Feedback[] {
  if (!existsSync(file())) return []
  // A damaged journal must not silently resurrect dismissed suggestions.
  const rows: unknown = JSON.parse(readFileSync(file(), 'utf8'))
  if (!Array.isArray(rows) || rows.some(r => !r || typeof r.projectId !== 'string' || typeof r.goalKey !== 'string')) throw new Error('Invalid project initiative feedback')
  return rows as Feedback[]
}

/** At most two grounded suggestions. No task creation or execution occurs.
 * Pass the already-filtered task view to exclude obsolete source suggestions. */
export function projectInitiatives(tasks: Compito[] = elencoCompiti()): ProjectInitiative[] {
  let feedback: Feedback[]
  try { feedback = read() } catch { return [] }
  const it = lingua() === 'it'
  const result: ProjectInitiative[] = []
  for (const project of perContesto()) {
    if (result.length >= 2) break
    if (project.stato !== 'attivo' || project.origine === 'punto' || !project.obiettivo.trim()) continue
    const goalKey = hash(normalized(project.obiettivo))
    // Dismissal applies to the goal, not a wording variant of its question.
    if (feedback.some(f => f.projectId === project.id && f.goalKey === goalKey && f.outcome !== 'answered')) continue
    const linked = tasks.filter(t => t.progetto === project.id)
    if (linked.some(t => ['delegato', 'pronto', 'chiede'].includes(t.stato))) continue
    const next = linked.find(t => t.stato === 'aperto' && (t.origine !== 'punto' || t.versione > 1) && !t.sparito)
    // If the person closed or discarded the project's work, don't invent the
    // same work again. A genuinely changed goal can start a new conversation.
    const goalSince = projectEvidence(project.id).find(e => e.kind === 'goal' && e.value === project.obiettivo)?.evidenceAt ?? project.dal
    const closed = db.prepare(`SELECT 1 FROM compiti WHERE progetto = ? AND
      (stato IN ('fatto','lasciato') OR sparito IS NOT NULL) AND aggiornato >= ? LIMIT 1`)
      .get(project.id, goalSince)
    const completed = !!db.prepare("SELECT 1 FROM compiti WHERE progetto = ? AND stato = 'fatto' AND sparito IS NULL AND aggiornato >= ? LIMIT 1").get(project.id, goalSince)
    if (!next && closed && !completed) continue
    const id = 'pi-' + hash(`${project.id}:${goalKey}:${next?.id ?? 'clarify'}`)
    if (feedback.some(f => f.id === id)) continue
    const question = completed && !next
      ? (it ? `L'obiettivo di ${project.nome} è completato, oppure cosa resta da fare?` : `Is the goal for ${project.nome} complete, or what remains to be done?`)
      : it
      ? `Qual è il prossimo risultato concreto che vuoi ottenere per ${project.nome}, e cosa manca per considerarlo completato?`
      : `What concrete result should we work toward next for ${project.nome}, and what would make it complete?`
    result.push({ id, projectId: project.id, projectName: project.nome, goal: project.obiettivo,
      kind: next ? 'next-step' : 'question',
      title: next?.testo ?? (completed ? (it ? `A che punto è ${project.nome}?` : `Where does ${project.nome} stand?`) : (it ? `Facciamo avanzare ${project.nome}` : `Move ${project.nome} forward`)),
      description: next
        ? (it ? `Un passo aperto verso il tuo obiettivo: ${project.obiettivo}` : `An open step toward your goal: ${project.obiettivo}`)
        : completed ? (it ? `Ci sono passi segnati come fatti, ma questo obiettivo è ancora attivo: ${project.obiettivo}` : `Some steps are marked done, but this goal is still active: ${project.obiettivo}`)
        : (it ? `Il tuo obiettivo: ${project.obiettivo}. Non ho ancora un prossimo passo concordato.` : `Your goal: ${project.obiettivo}. I don't yet have an agreed next step.`),
      ...(next ? { taskId: next.id } : { question }), provenance: 'explicit-project', urgent: false })
  }
  return result
}

/** Explicit feedback only; this never marks the underlying task/project done. */
export function feedbackProjectInitiative(id: string, outcome: Feedback['outcome']): boolean {
  if (!['dismissed', 'answered', 'done'].includes(outcome)) throw new Error('Invalid initiative feedback')
  const candidate = projectInitiatives().find(c => c.id === id)
  if (!candidate) return false
  const rows = read()
  rows.push({ id, projectId: candidate.projectId, goalKey: hash(normalized(candidate.goal)), outcome, at: new Date().toISOString() })
  mkdirSync(cartella(), { recursive: true })
  writeFileSync(file() + '.tmp', JSON.stringify(rows), { mode: 0o600 })
  renameSync(file() + '.tmp', file())
  return true
}
