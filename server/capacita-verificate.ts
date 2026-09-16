// The app describes only actions with a real local implementation and a
// concrete result that can be checked after execution. Connector names or
// model assurances alone never expand this registry.
import { lstat, readFile, readlink, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isAbsolute, join, relative, sep } from 'node:path'
import type { ExecutionReport } from './esecuzione-isolata.ts'
import type { TeamEvidence } from './project-review.ts'

export type CapabilityId =
  | 'project.plan' | 'project.edit'
  | 'calendar.create' | 'mail.draft' | 'mail.send'
  | 'document.native.create'
  | 'hermes.special' | 'supabase.arbitrary' | 'connector.arbitrary'

export type CapabilityContext = {
  desktop: boolean
  claudeInstalled: boolean
  hermesInstalled?: boolean
  connectedFolders: number
  /** Calendar runs through the Mac app, with a separate macOS permission. */
  macCalendarAvailable: boolean
  macCalendarPermission: boolean
  googleConnected: boolean
  mailConnected: boolean
  nativeDocuments: boolean
}

export type Capability = {
  id: CapabilityId
  status: 'ready' | 'needs_setup' | 'unsupported'
  scope: string
  proof: string
  reason?: string
}

const unsupported: Record<'hermes.special' | 'supabase.arbitrary' | 'connector.arbitrary', string> = {
  'hermes.special': 'Hermes supports explicitly selected project-file replacements through the scoped project action. Live agent configuration, GUI control and weight training have no executor.',
  'supabase.arbitrary': 'Non esiste un esecutore Supabase generale nell’app.',
  'connector.arbitrary': 'La presenza di un account o di un connettore non autorizza azioni arbitrarie.'
}

export function capability(id: CapabilityId, context: CapabilityContext): Capability {
  if (id in unsupported) return { id, status: 'unsupported', scope: '', proof: '', reason: unsupported[id as keyof typeof unsupported] }
  if (id === 'project.plan' || id === 'project.edit') {
    const ready = context.desktop && (context.claudeInstalled || id === 'project.edit' && context.hermesInstalled) && context.connectedFolders > 0
    return {
      id, status: ready ? 'ready' : 'needs_setup',
      scope: id === 'project.edit' ? 'Modifiche soltanto nella copia del progetto collegato; nessun commit, push o deploy.' : 'Piano in lettura nella cartella collegata.',
      proof: id === 'project.edit' ? 'File cambiati, report salvato e test locale superato.' : 'Processo concluso con codice zero e testo del piano.',
      ...(ready ? {} : { reason: id === 'project.edit' ? 'Connect a local folder and install a compatible Claude or Hermes runtime. The selected agent also needs an inference account.' : 'Serve il desktop con Claude Code e almeno una cartella collegata.' })
    }
  }
  if (id === 'calendar.create') return {
    id, status: context.desktop && context.macCalendarAvailable && context.macCalendarPermission ? 'ready' : 'needs_setup',
    scope: 'Creazione nel Calendario del Mac dopo il permesso di Automazione.', proof: 'Identificatori degli eventi e verifica di lettura restituiti dal Calendario.',
    ...(context.desktop && context.macCalendarAvailable && context.macCalendarPermission ? {} : { reason: 'Serve Calendario sul Mac e il permesso di Automazione di macOS.' })
  }
  if (id === 'mail.draft' || id === 'mail.send') {
    const ready = id === 'mail.send' ? context.mailConnected : context.googleConnected || context.mailConnected
    return { id, status: ready ? 'ready' : 'needs_setup',
      scope: id === 'mail.draft' ? 'Bozza salvata nell’account posta collegato.' : 'Invio di un messaggio preparato nell’account posta collegato.',
      proof: id === 'mail.draft' ? 'Identificatore della bozza restituito dal provider.' : 'Identificatore del messaggio inviato restituito dal provider.',
      ...(ready ? {} : { reason: id === 'mail.send' ? 'Collega un account posta con invio SMTP.' : 'Collega Gmail o un account posta.' }) }
  }
  return { id, status: context.nativeDocuments ? 'ready' : 'needs_setup',
    scope: 'Creazione locale di Pages o TextEdit sul Mac.', proof: 'File presente e risultato di verifica del creatore nativo.',
    ...(context.nativeDocuments ? {} : { reason: 'Serve l’app desktop su Mac con la creazione nativa disponibile.' }) }
}

export function capabilities(context: CapabilityContext): Capability[] {
  const ids: CapabilityId[] = ['project.plan', 'project.edit', 'calendar.create', 'mail.draft', 'mail.send', 'document.native.create', 'hermes.special', 'supabase.arbitrary', 'connector.arbitrary']
  return ids.map(id => capability(id, context))
}

export type Proof =
  | { id: 'project.plan'; exitCode: number | null; finished: boolean; text: string }
  | { id: 'project.edit'; report: ExecutionReport }
  | { id: 'calendar.create'; events: { id: string; verificato: true }[] }
  | { id: 'mail.draft'; providerDraftId: string }
  | { id: 'mail.send'; providerMessageId: string }
  | { id: 'document.native.create'; path: string; verified: boolean }

async function artifactMatches(report: ExecutionReport): Promise<boolean> {
  if (Object.keys(report.artifactHashes).length !== report.changedFiles.length) return false
  for (const file of report.changedFiles) {
    const path = join(report.workspace, file.path)
    const rel = relative(report.workspace, path)
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false
    const expected = report.artifactHashes[file.path]
    if (!expected) return false
    const current = await lstat(path).catch(() => null)
    if (expected === 'deleted') { if (current) return false; continue }
    if (!current) return false
    const hash = current.isFile()
      ? createHash('sha256').update(await readFile(path)).digest('hex')
      : current.isSymbolicLink() ? `link:${await readlink(path)}` : ''
    if (hash !== expected) return false
  }
  return true
}

/** A positive proof lets the UI say "done". Missing proof stays pending. */
export async function proofValid(proof: Proof): Promise<boolean> {
  switch (proof.id) {
    case 'project.plan': return proof.finished && proof.exitCode === 0 && proof.text.trim().length > 0
    case 'project.edit': {
      const r = proof.report
      if (r.state !== 'verified' || !r.agentFinished || r.agentExitCode !== 0 || !r.changedFiles.length || r.verification.status !== 'passed') return false
      try {
        const team=(r as ExecutionReport & {team?:TeamEvidence}).team
        if(team && (team.mode!=='worker-reviewer' || !team.acceptanceCriteria.trim() || !team.accepted || team.roles.length!==2 || team.roles[0].role!=='worker' || team.roles[0].outcome!=='verified' || team.roles[1].role!=='reviewer' || team.roles[1].outcome!=='approved' || !team.roles[1].finished || team.roles[1].exitCode!==0 || !team.roles[1].findings.length || team.roles[1].findings.some(f=>!f.trim()))) return false
        const saved = JSON.parse(await readFile(r.reportFile, 'utf8')) as ExecutionReport
        const folder = await stat(r.workspace)
        return folder.isDirectory() && JSON.stringify(saved) === JSON.stringify(r) && await artifactMatches(r)
      } catch { return false }
    }
    case 'calendar.create': return proof.events.length > 0 && proof.events.every(e => e.verificato === true && e.id.trim().length > 0) && new Set(proof.events.map(e => e.id)).size === proof.events.length
    case 'mail.draft': return proof.providerDraftId.trim().length > 0
    case 'mail.send': return proof.providerMessageId.trim().length > 0
    case 'document.native.create': {
      if (!proof.verified) return false
      try { const result = await stat(proof.path); return result.isFile() || result.isDirectory() } catch { return false }
    }
  }
}
