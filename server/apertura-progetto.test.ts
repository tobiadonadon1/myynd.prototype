import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aperturaProgetto } from './apertura-progetto.ts'
import type { ProjectInitiative } from './project-initiative.ts'

const base: ProjectInitiative = {
  id: 'pi-1', projectId: 'p1', projectName: 'Myynd', goal: 'Finish Myynd with useful intelligence',
  kind: 'question', title: 'Move Myynd forward', description: 'x', question: 'What next?', provenance: 'explicit-project', urgent: false
}

test('senza un passo concordato Myynd chiede su cosa lavora e il prossimo risultato', () => {
  const en = aperturaProgetto(base, 'en')
  assert.match(en, /^Let’s talk about Myynd\. The goal you wrote down is: “Finish Myynd with useful intelligence”\. What are you working on right now\?/)
  assert.match(aperturaProgetto(base, 'it'), /^Parliamo di Myynd\. L’obiettivo che hai scritto è: “Finish Myynd/)
  assert.doesNotMatch(en, /«|»|—/)
})

test('con un passo aperto chiede a che punto è; con i passi fatti chiede se l’obiettivo è raggiunto', () => {
  assert.match(aperturaProgetto({ ...base, kind: 'next-step', title: 'Write the brief', taskId: 't1', question: undefined }, 'en'),
    /There’s an open step: “Write the brief”\. Where does it stand/)
  assert.match(aperturaProgetto({ ...base, title: 'Where does Myynd stand?', description: 'Some steps are marked done, but this goal is still active: x', question: 'Is the goal for Myynd complete, or what remains to be done?' }, 'en'),
    /Some steps are marked done\. Is the goal reached/)
  assert.match(aperturaProgetto({ ...base, title: 'A che punto è Myynd?', description: 'Ci sono passi segnati come fatti, ma questo obiettivo è ancora attivo: x' }, 'it'), /Alcuni passi sono segnati come fatti/)
  // «what would make it complete?» non è «è completato?»
  assert.match(aperturaProgetto({ ...base, question: 'What concrete result should we work toward next for Myynd, and what would make it complete?' }, 'en'), /What are you working on right now\?/)
})

test('senza obiettivo scritto lo dice, invece di citare il vuoto', () => {
  assert.match(aperturaProgetto({ ...base, goal: '' }, 'en'), /I don’t have a written goal for this project yet\./)
})
