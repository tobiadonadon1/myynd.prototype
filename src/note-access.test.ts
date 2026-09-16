import {test} from 'node:test'
import assert from 'node:assert/strict'
import {statoAccessoNote} from './note-access.ts'
test('fresh Notes file access outranks stale generic folder denial',()=>{
 assert.equal(statoAccessoNote({accessoDisco:'no',accessoNote:{stato:'leggibile',verificato:'now'}}).problema,false)
 assert.equal(statoAccessoNote({accessoDisco:'si',accessoNote:{stato:'negato',verificato:'now'}}).permessoNegato,true)
})
test('missing archive and read error have honest guidance without asking for disk access',()=>{
 for(const stato of ['assente','errore'] as const){
  const result=statoAccessoNote({accessoDisco:'no',accessoNote:{stato,verificato:'now'}})
  assert.equal(result.problema,true);assert.equal(result.permessoNegato,false)
 }
})
