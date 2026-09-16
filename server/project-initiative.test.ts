import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { rmSync, writeFileSync } from 'node:fs'
import { cartella } from './config.ts'
import db, * as store from './store.ts'
import * as projects from './progetti.ts'
import { projectInitiatives, feedbackProjectInitiative } from './project-initiative.ts'
import { iniziativeProgetti, feedAttuale } from './attenzione.ts'
beforeEach(() => {
  db.exec('DELETE FROM compiti; DELETE FROM progetti')
  for (const f of ['project-initiative-feedback.json','project-evidence.json']) rmSync(join(cartella(),f),{force:true})
})
after(() => store.chiudiIndici())
test('explicit saved goal without next step produces a useful nonurgent question, not a fake source card', () => {
  const p = projects.scrivi({nome:'Myynd',obiettivo:'Finish a useful intelligence system'})
  const [suggestion] = iniziativeProgetti()
  assert.equal(suggestion.projectId,p.id)
  assert.equal(suggestion.kind,'question')
  assert.equal(suggestion.goal,p.obiettivo)
  assert.match(suggestion.question!,/concrete result.*Myynd/)
  assert.equal(suggestion.urgent,false)
  assert.equal(store.elencoCompiti().length,0)
  assert.equal(feedAttuale().length,0)
})
test('inferred, paused, closed and goalless projects cannot generate work', () => {
  projects.scrivi({nome:'Receipts',obiettivo:'Process old receipts',origine:'punto'})
  for(const stato of ['fermo','chiuso'] as const) {
    const p=projects.scrivi({nome:stato,obiettivo:'Finish this'})
    projects.cambia(p.id,{stato})
  }
  projects.scrivi({nome:'Unknown'})
  assert.deepEqual(projectInitiatives(),[])
})
test('actual linked open task is surfaced with exact identity; active or ready work is not duplicated', () => {
  const p=projects.scrivi({nome:'App',obiettivo:'Launch release'})
  store.scriviCompito({id:'real-step',testo:'Verify the settings screen',ordine:'a',progetto:p.id})
  assert.equal(projectInitiatives()[0].taskId,'real-step')
  assert.equal(projectInitiatives()[0].title,'Verify the settings screen')
  for(const state of ['delegato','pronto','chiede']) {
    db.prepare('UPDATE compiti SET stato = ? WHERE id = ?').run(state,'real-step')
    assert.deepEqual(projectInitiatives(),[])
  }
})
test('completed or discarded work is never reconstructed by recalculation or project note edits', () => {
  const p=projects.scrivi({nome:'Essay',obiettivo:'Finish essay'})
  store.scriviCompito({id:'old-step',testo:'Write essay',ordine:'a',progetto:p.id})
  store.cambiaStatoCompito('old-step','fatto')
  projects.cambia(p.id,{note:'Updated my preferred font'})
  assert.equal(projectInitiatives()[0].kind,'question')
  assert.equal(projectInitiatives()[0].taskId,undefined)
  assert.match(projectInitiatives()[0].question!,/complete, or what remains/)
  assert.equal(store.compito('old-step')?.stato,'fatto')
  store.cambiaStatoCompito('old-step','lasciato')
  assert.deepEqual(projectInitiatives(),[])
})
test('goal-level feedback persists across reload and paraphrased titles but does not close actual tasks', () => {
  const p=projects.scrivi({nome:'Launch',obiettivo:'Ship the release'})
  store.scriviCompito({id:'open-step',testo:'Review release notes',ordine:'a',progetto:p.id})
  assert.equal(feedbackProjectInitiative(projectInitiatives()[0].id,'dismissed'),true)
  store.chiudiIndici()
  projects.cambia(p.id,{nome:'Launch renamed',note:'More context'})
  assert.deepEqual(projectInitiatives(),[])
  assert.equal(store.compito('open-step')?.stato,'aperto')
  assert.equal(feedbackProjectInitiative('fabricated','done'),false)
  projects.cambia(p.id,{obiettivo:'Prepare a different launch'})
  assert.equal(projectInitiatives().length,1)
})
test('bounded suggestions and damaged feedback fail closed', () => {
  for(let i=0;i<4;i++) projects.scrivi({nome:'Project '+i,obiettivo:'Explicit goal '+i})
  assert.equal(projectInitiatives().length,2)
  writeFileSync(join(cartella(),'project-initiative-feedback.json'),'not JSON')
  assert.deepEqual(projectInitiatives(),[])
})
test('answered questions stay answered but a subsequently agreed real next step can appear', () => {
  const p=projects.scrivi({nome:'Product',obiettivo:'Finish the app'})
  assert.equal(feedbackProjectInitiative(projectInitiatives()[0].id,'answered'),true)
  assert.deepEqual(projectInitiatives(),[])
  store.scriviCompito({id:'agreed-next',testo:'Test the first user workflow',ordine:'a',progetto:p.id})
  assert.equal(projectInitiatives()[0].taskId,'agreed-next')
})
test('completed work for an older goal does not characterize or reopen the new goal', () => {
  const p=projects.scrivi({nome:'Evolving project',obiettivo:'Finish the pilot'})
  store.scriviCompito({id:'pilot-done',testo:'Finish pilot',ordine:'a',progetto:p.id})
  store.cambiaStatoCompito('pilot-done','fatto')
  // Establish distinct evidence times without relying on wall-clock sleeps.
  db.prepare('UPDATE compiti SET aggiornato = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z','pilot-done')
  projects.cambia(p.id,{obiettivo:'Run the next study'})
  const [suggestion]=projectInitiatives()
  assert.match(suggestion.question!,/concrete result/)
  assert.doesNotMatch(suggestion.description,/marked done/)
  store.scriviCompito({id:'study-discarded',testo:'Draft next study',ordine:'b',progetto:p.id})
  store.cambiaStatoCompito('study-discarded','lasciato')
  assert.deepEqual(projectInitiatives(),[])
  assert.equal(store.compito('pilot-done')?.stato,'fatto')
})
