import {test} from 'node:test'
import assert from 'node:assert/strict'
import {quando,aggiungiVerificati} from './agenda.ts'
test('calendar rejects invalid dates and respects explicit offsets',()=>{
 for(const s of ['2026-02-30T10:00','2026-09-15T25:00','2026-09-15 junk','2026-13-01'])assert.throws(()=>quando(s))
 assert.equal(quando('2026-09-15T10:30-04:00').toISOString(),'2026-09-15T14:30:00.000Z')
})
test('calendar records provider IDs only after every event readback',async()=>{
 let script=''
 const result=await aggiungiVerificati([{titolo:'Review "draft"',inizio:'2026-09-15T10:00'}],'task-1',undefined,async lines=>{script=lines.join('\n');return 'uid-123'})
 assert.deepEqual(result,[{id:'uid-123',verificato:true}])
 assert.match(script,/every event whose description contains/)
 assert.match(script,/Calendar start mismatch/)
 assert.match(script,/set day of inizio to 1/)
 assert.match(script,/Review \\"draft\\"/)
})
test('calendar retries use the same identity and reject incomplete proof',async()=>{
 const events=[{titolo:'Review',inizio:'2026-09-15T10:00'}];const scripts:string[]=[]
 for(let i=0;i<2;i++)await aggiungiVerificati(events,'task-2',undefined,async lines=>{scripts.push(lines.join('\n'));return 'uid-2'})
 assert.equal(scripts[0],scripts[1])
 await assert.rejects(aggiungiVerificati(events,'task-3',undefined,async()=>''),/did not verify/)
})
test('calendar concurrent clicks share execution',async()=>{
 let count=0
 const run=async()=>{count++;await new Promise(r=>setTimeout(r,10));return 'uid'}
 await Promise.all([1,2].map(()=>aggiungiVerificati([{titolo:'Review',inizio:'2026-09-15T10:00'}],'same',undefined,run)))
 assert.equal(count,1)
})
