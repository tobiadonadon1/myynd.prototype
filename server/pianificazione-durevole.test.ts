import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const folder=mkdtempSync(join(tmpdir(),'myynd-catchup-'));process.env.MYYND_DATI=folder
const {runScheduled,scheduledStatus}=await import('./pianificazione-durevole.ts')
const {backgroundWorkScope}=await import('./lavoro-background.ts')
after(()=>rmSync(folder,{recursive:true,force:true}))
test('startup and repeated wake coalesce missed slots, persisting completion',async()=>{
 let calls=0
 assert.equal((await runScheduled('automation',60_000,async()=>++calls,600_000)).ran,true)
 assert.equal((await runScheduled('automation',60_000,async()=>++calls,620_000)).ran,false)
 assert.equal((await runScheduled('automation',60_000,async()=>++calls,86_400_000)).ran,true)
 assert.equal(calls,2);assert.equal(scheduledStatus().automation.state,'complete')
})
test('concurrent wakeups do not duplicate dispatch and crash-claimed slots are not replayed',async()=>{
 let finish:()=>void=()=>{};let calls=0
 const pending=runScheduled('drafts',60_000,()=>new Promise<void>(resolve=>{calls++;finish=resolve}),600_000)
 assert.equal((await runScheduled('drafts',60_000,async()=>{calls++},600_000)).ran,false)
 finish();await pending;assert.equal(calls,1)
 writeFileSync(join(folder,'scheduled-catchup.json'),JSON.stringify({interrupted:{slot:10,started:600_000,state:'running'}}))
 assert.equal(scheduledStatus().interrupted.state,'interrupted')
 assert.equal((await runScheduled('interrupted',60_000,async()=>{calls++},620_000)).ran,false)
 assert.equal((await runScheduled('interrupted',60_000,async()=>{calls++},660_000)).ran,true)
 assert.equal(calls,2)
})
test('failed work is recorded and next interval can recover without an immediate loop',async()=>{
 await assert.rejects(runScheduled('failure',60_000,async()=>{throw Error('network')},600_000))
 assert.equal(scheduledStatus().failure.state,'failed')
 assert.equal((await runScheduled('failure',60_000,async()=>true,620_000)).ran,false)
 assert.equal((await runScheduled('failure',60_000,async()=>true,660_000)).ran,true)
})
test('overlapping actual work shares a power lease and errors release it',async()=>{
 const messages:unknown[]=[];const scope=backgroundWorkScope({postMessage:x=>messages.push(x)})
 let finish:()=>void=()=>{}
 const pending=scope(()=>new Promise<void>(resolve=>{finish=resolve}))
 await assert.rejects(scope(async()=>{throw Error('failure')}))
 assert.deepEqual(messages,[{tipo:'lavoro-background',attivo:true}])
 finish();await pending
 assert.deepEqual(messages,[{tipo:'lavoro-background',attivo:true},{tipo:'lavoro-background',attivo:false}])
})
