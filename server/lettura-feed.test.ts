import {test} from 'node:test'
import assert from 'node:assert/strict'
import {generaDaFontiFresche,ErroreLetturaFeed} from './lettura-feed.ts'

test('manual scan reads configured sources once before generating with their current evidence',async()=>{
 const order:string[]=[],lock=new Set<string>()
 let source='old indexed body'
 const result=await generaDaFontiFresche('account',lock,async()=>{assert.equal(lock.has('account'),true);order.push('read');source='fresh provider body'},async()=>{order.push('generate');return source})
 assert.equal(result,'fresh provider body');assert.deepEqual(order,['read','generate']);assert.equal(lock.size,0)
})
test('a current source failure or partial folder read cannot become a false all-clear',async()=>{
 for(const event of [{fase:'note',stato:'guaio',errore:'Current access denied'},
  {fase:'posta',stato:'fatto',cartelleFallite:['Drafts']},{fase:'drive',stato:'fatto',falliti:1},
  {fase:'slack',stato:'fatto',falliti:['channel']},{fase:'github',stato:'fatto',falliti:['repo']},
  {fase:'notion',stato:'fatto',parziali:1},{fase:'notion',stato:'fatto',interrotto:true},
  {fase:'desktop',stato:'fatto',illeggibili:['private-file']},{fase:'note',stato:'fatto',illeggibili:1}]) {
  const lock=new Set<string>()
  await assert.rejects(generaDaFontiFresche('account',lock,async report=>{report(event)},async()=>assert.fail('must not generate stale all-clear')),
   e=>e instanceof ErroreLetturaFeed&&e.status===502&&e.message.includes(event.fase))
  assert.equal(lock.size,0)
 }
})
test('normal source caps and zero failures stay distinct from failed source reads',async()=>{
 const result=await generaDaFontiFresche('account',new Set(),async report=>{
  report({fase:'slack',stato:'fatto',falliti:[],troncato:true})
  report({fase:'note',stato:'fatto',illeggibili:0,troncato:true})
  report({fase:'notion',stato:'fatto',parziali:0,interrotto:false})
  report({fase:'posta',stato:'fatto',cartelleFallite:[],troncato:true})
 },async()=>'fresh bounded evidence')
 assert.equal(result,'fresh bounded evidence')
})
test('manual scan shares account sync lock and always releases it after unexpected failure',async()=>{
 const lock=new Set(['account'])
 await assert.rejects(generaDaFontiFresche('account',lock,async()=>assert.fail('no second import'),async()=>assert.fail('no generation')),e=>e instanceof ErroreLetturaFeed&&e.status===409)
 assert.equal(lock.has('account'),true)
 lock.clear()
 await assert.rejects(generaDaFontiFresche('account',lock,async()=>{throw new Error('network')},async()=>assert.fail('no generation')),/network/)
 assert.equal(lock.size,0)
})
test('source failures use the selected language without exposing private provider diagnostics',async()=>{
 for(const phase of ['note','/private/account/notes']) {
  await assert.rejects(generaDaFontiFresche('account',new Set(),async report=>report({fase:phase,stato:'guaio',errore:'token=private-secret /Users/private'}),async()=>assert.fail('must not generate')),
   e=>{
    assert.ok(e instanceof ErroreLetturaFeed)
    assert.deepEqual(e.fonti,[{fonte:phase==='note'?'note':'source',motivo:'non-disponibile'}])
    assert.match(e.perLingua('en'),/^I could not refresh every source\./)
    assert.match(e.perLingua('it'),/^Non ho potuto aggiornare tutte le fonti\./)
    assert.doesNotMatch(e.perLingua('en'),/private|Non ho|La fonte|token=/)
    return true
   })
 }
 const busy=new ErroreLetturaFeed('Una lettura delle fonti è già in corso. Attendi che finisca e riprova.',409)
 assert.equal(busy.perLingua('en'),'A source read is already running. Wait for it to finish and try again.')
})
