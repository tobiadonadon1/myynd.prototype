import {test} from 'node:test'
import assert from 'node:assert/strict'
import {workPowerLease} from './lavoro-background.ts'
test('power lease exists only during actual reported work and expires after a crash',()=>{
 let time=0,starts=0,stops=0
 const lease=workPowerLease({start:type=>{assert.equal(type,'prevent-app-suspension');return ++starts},stop:()=>{stops++}},()=>time,45)
 lease.message({tipo:'other',attivo:true});assert.equal(starts,0)
 lease.message({tipo:'lavoro-background',attivo:true});assert.equal(starts,1)
 time=30;lease.message({tipo:'lavoro-background',attivo:true});assert.equal(starts,1)
 time=50;lease.tick();assert.equal(lease.active(),true)
 time=76;lease.tick();assert.equal(lease.active(),false);assert.equal(stops,1)
 lease.message({tipo:'lavoro-background',attivo:true});lease.release();assert.equal(stops,2)
})
