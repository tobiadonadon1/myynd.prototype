import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectInitiativeDraft } from './project-initiative-ui.ts'
import type { ProjectInitiative } from './api.ts'
const item: ProjectInitiative = { id:'pi-test',projectId:'p-test',projectName:'Myynd',goal:'Ship a useful assistant',kind:'question',title:'Move Myynd forward',description:'Saved goal',question:'What comes next?',provenance:'explicit-project',urgent:false }
test('project discussion draft grounds the editable request in exact saved project and goal', () => {
  const draft=projectInitiativeDraft(item,'en')
  assert.match(draft,/«Myynd»/)
  assert.match(draft,/«Ship a useful assistant»/)
  assert.match(draft,/Help me clarify this question: What comes next/)
  assert.doesNotMatch(draft,/delegate|execute|create.*task|urgent/i)
  assert.match(projectInitiativeDraft(item,'it'),/Aiutami a chiarire/)
})
test('an existing open step retains its exact title in the discussion draft', () => {
  const draft=projectInitiativeDraft({...item,kind:'next-step',taskId:'task-1',title:'Test the real workflow'},'en')
  assert.match(draft,/The open step is: «Test the real workflow»/)
  assert.doesNotMatch(draft,/pi-test|p-test|task-1/)
})
