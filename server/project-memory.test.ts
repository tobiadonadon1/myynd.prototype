import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const dir=mkdtempSync(join(tmpdir(),'myynd-project-evidence-'));process.env.MYYND_DATI=dir
const store=await import('./store.ts');const projects=await import('./progetti.ts');const memory=await import('./project-memory.ts')
after(()=>{store.chiudiIndici();rmSync(dir,{recursive:true,force:true})})
test('explicit goals and notes persist with provenance and superseded history',()=>{
 const p=projects.scrivi({nome:'Studio',obiettivo:'Launch in October',note:'Use the approved brief'})
 projects.cambia(p.id,{obiettivo:'Launch in November'})
 const all=memory.projectEvidence(p.id,{history:true});assert.equal(all.filter(r=>r.kind==='goal').length,2)
 assert.ok(all.find(r=>r.value==='Launch in October')?.supersededBy)
 store.chiudiIndici()
 assert.equal(memory.projectEvidence(p.id).find(r=>r.kind==='goal')?.value,'Launch in November')
 assert.match(projects.perIlModello('Studio'),/Use the approved brief/)
 projects.cambia(p.id,{obiettivo:''})
 assert.equal(memory.projectEvidence(p.id).find(r=>r.kind==='goal')?.value,'')
})
test('source observations cannot replace goals; changed and old evidence is withheld',()=>{
 const p=projects.scrivi({nome:'Research',obiettivo:'Validate the study'})
 const source={id:'note:research',fonte:'note',tipo:'nota',titolo:'Research',corpo:'The pilot budget is 500 euros.',quando:new Date().toISOString()}
 store.salvaDocumenti([source])
 memory.recordSourceObservation({projectId:p.id,key:'budget',value:'Pilot budget is 500 euros',sourceId:source.id,quote:source.corpo})
 assert.equal(projects.trova(p.id)?.obiettivo,'Validate the study')
 assert.match(memory.projectMemoryContext(p.id),/source-inference/)
 store.salvaDocumenti([{...source,corpo:'The pilot budget is now 700 euros.'}])
 assert.equal(memory.projectEvidence(p.id).find(r=>r.kind==='observation')?.stale,true)
 assert.doesNotMatch(memory.projectMemoryContext(p.id),/500 euros/)
 memory.recordSourceObservation({projectId:p.id,key:'budget',value:'Pilot budget is 700 euros',sourceId:source.id,quote:'The pilot budget is now 700 euros.'})
 assert.equal(memory.projectEvidence(p.id,{history:true}).filter(r=>r.kind==='observation').length,2)
 assert.equal(memory.projectEvidence(p.id,{now:Date.now()+31*86400_000}).find(r=>r.kind==='observation')?.stale,true)
})
test('decisions require literal user evidence and cannot cross project boundaries',()=>{
 const p=projects.scrivi({nome:'Decisions'})
 assert.throws(()=>memory.recordUserDecision({projectId:p.id,key:'launch',value:'Launch next week',quote:'Launch next week'},'Summarize my notes'))
 memory.recordUserDecision({projectId:p.id,key:'launch',value:'Launch next week',quote:'Launch next week'},'Launch next week')
 assert.match(memory.projectMemoryContext(p.id),/user-chat/)
 const other=projects.scrivi({nome:'Other project'})
 assert.doesNotMatch(memory.projectMemoryContext(other.id),/Launch next week/)
})
test('real delivered work enters shared project context without claiming user completion',()=>{
 const p=projects.scrivi({nome:'Publication'})
 store.scriviCompito({id:'essay',testo:'Write a publication essay',ordine:'a',progetto:p.id})
 store.affidaCompito('essay','tutto')
 const path=join(dir,'essay.pages');writeFileSync(path,'verified document fixture')
 store.scriviConsegnaCompito('essay',{app:'Pages',titolo:'Publication essay',percorso:path,revisione:{esito:'pass',problemi:[]}})
 store.risultatoCompito('essay','Saved',[],'pronto')
 assert.match(projects.perIlModello('Publication'),/Verified artifact produced; user completion not confirmed/)
 store.cambiaStatoCompito('essay','fatto')
 assert.match(projects.perIlModello('Publication'),/User marked completed/)
 assert.equal(memory.projectEvidence(p.id,{history:true}).filter(r=>r.kind==='work').length,2)
})

test('questions, hypotheticals and quoted decisions cannot enter explicit project memory',()=>{
 const p=projects.scrivi({nome:'Decision guard'})
 for(const [quote,message] of [
  ['We will launch next week','Should we say We will launch next week?'],
  ['We will launch next week','If approved, We will launch next week'],
  ['We decided to use Pages','The email says "We decided to use Pages"'],
  ['We decided to use Pages',"> We decided to use Pages"],
  ['We decided to use Pages',"```\nWe decided to use Pages\n```"],
  ['Launch next week','Maybe Launch next week'],
  ['We will use the new font','I like the example: «We will use the new font»']
 ]) assert.throws(()=>memory.recordUserDecision({projectId:p.id,key:'launch',value:quote,quote},message),message)
 assert.equal(memory.projectEvidence(p.id).length,0)
 for(const quote of ['Decision: launch in November','We decided to use Pages','I have chosen a November launch','Please remember our approved budget is 500 euros','For Decision guard, use the approved template','Abbiamo deciso di lanciare a novembre']) {
  assert.doesNotThrow(()=>memory.recordUserDecision({projectId:p.id,key:quote.slice(0,25),value:quote,quote},quote))
 }
})
