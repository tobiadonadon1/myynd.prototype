import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { salvaBozzaCasella, salvaRevisioneCasella, leggiBozzaAttuale, verificaBozzaInvariata, mimeBozza } from './mailbox-drafts.ts'
import { createHash } from 'node:crypto'
import * as posta from './connettori/posta.ts'
const dir = mkdtempSync(join(tmpdir(), 'myynd-maildraft-'))
after(() => { posta.usaClient(null); rmSync(dir, { recursive: true, force: true }) })
const email = { a: 'sender@example.com', oggetto: 'Hello', corpo: 'A useful reply.', conosciuto: true, rispondeA: { messageId: 'original@example.com' } }
test('simultaneous publication and relaunch reuse one confirmed draft', async () => {
  let calls = 0
  const create = async () => { calls++; await new Promise(r => setTimeout(r, 5)); return { id: 'draft1', url: 'message://draft1' } }
  const [a,b] = await Promise.all([salvaBozzaCasella('same', 'posta:INBOX:1', email, create, dir), salvaBozzaCasella('same', 'posta:INBOX:1', email, create, dir)])
  assert.deepEqual(a,b); assert.equal(a.stato,'salvata')
  assert.deepEqual(await salvaBozzaCasella('same','posta:INBOX:1',email,create,dir), a)
  assert.equal(calls,1)
})
test('ambiguous network failure never blindly creates another draft', async () => {
  let calls = 0
  const create = async () => { calls++; throw new Error('Connection lost after APPEND') }
  assert.equal((await salvaBozzaCasella('lost', 'posta:INBOX:2', email, create, dir)).stato, 'errore')
  assert.match((await salvaBozzaCasella('lost','posta:INBOX:2',email,create,dir)).errore!, /uncertain/)
  assert.equal(calls,1)
})
test('IMAP selects existing Drafts and preserves actual reply headers without sending', async () => {
  const appends: unknown[][] = []
  const mock = { connect: async()=>{}, list:async()=>[{path:'INBOX.Bozze',specialUse:'\\Drafts'}], getMailboxLock:async()=>({release(){}}),
    fetchOne:async()=>({source:Buffer.from('From: Sender <sender@example.com>\r\nMessage-ID: <original@example.com>\r\nSubject: Original\r\n\r\nPlease reply.')}),
    append:async(...args:unknown[])=>{appends.push(args);return {uid:42}},logout:async()=>{},close(){} }
  posta.usaClient(()=>mock as never)
  const result=await posta.salvaBozza({host:'mail.example.com',porta:993,utente:'me@example.com',password:'test'},'posta:INBOX:1',email,'test@myynd.local')
  assert.equal(result.id,'INBOX.Bozze:42');assert.match(result.url,/^message:/)
  assert.equal(appends.length,1);assert.equal(appends[0][0],'INBOX.Bozze')
  assert.deepEqual(appends[0][2],['\\Draft','\\Seen'])
  assert.match(String(appends[0][1]),/In-Reply-To: <original@example.com>/)
  await assert.rejects(posta.salvaBozza({host:'mail.example.com',porta:993,utente:'me@example.com',password:'test'},'posta:INBOX:1',{...email,a:'other@example.com'},'other@myynd.local'),/recipient/)
  assert.equal(appends.length,1)
  await assert.rejects(posta.salvaBozza({host:'mail.example.com',porta:993,utente:'me@example.com',password:'test'},'posta:INBOX:1',{...email,rispondeA:{messageId:'different@example.com'}},'other@myynd.local'),/original message/)
  assert.equal(appends.length,1)
})
test('MIME refuses header injection and safely encodes Unicode body',()=>{
  assert.throws(()=>mimeBozza('me@example.com',{...email,oggetto:'Hi\r\nBcc: bad@example.com'},'a@b'),/header/)
  assert.match(mimeBozza('me@example.com',{...email,corpo:'Caffè'},'a@b'),/Q2FmZsOo/)
})
test('provider current draft body is fingerprinted and a manual edit or deletion blocks revision',async()=>{
 let body='A manually edited reply.'
 let exists=true
 const read=async()=>exists ? {stato:'presente' as const,corpo:body,oggetto:'Re: Hello',a:'sender@example.com',messageId:'myynd@test'} : {stato:'sparita' as const}
 const get=(source:string,casella:{stato:'salvata'|'errore';id?:string})=>leggiBozzaAttuale(source,casella,read)
 const before=await get('google:source',{stato:'salvata',id:'draft1'})
 assert.equal(before.corpo,'A manually edited reply.')
 await verificaBozzaInvariata(before,get)
 body='Another edit in Gmail.'
 await assert.rejects(verificaBozzaInvariata(before,get),/changed/)
 exists=false
 await assert.rejects(verificaBozzaInvariata(before,get),/disappeared/)
})
test('Gmail uses drafts endpoint and exact source thread, never send', async () => {
  const cfg=await import('./config.ts'), google=await import('./connettori/google.ts')
  cfg.scrivi({...cfg.leggi(),google:{clientId:'test',refresh:'test',email:'me@example.com'}})
  google.scordaIlToken()
  const real=globalThis.fetch
  const writes: {url:string;body:any}[]=[]
  globalThis.fetch=(async(url,options)=>{
    const path=String(url)
    if(path.includes('oauth2.googleapis.com'))return Response.json({access_token:'fake',expires_in:3600})
    if(options?.method==='POST') { writes.push({url:path,body:JSON.parse(String(options.body))});return Response.json({id:'d1',message:{id:'m1'}}) }
    return Response.json({id:'source',threadId:'actual-thread',labelIds:['INBOX'],payload:{headers:[{name:'From',value:'sender@example.com'},{name:'Message-ID',value:'<original@example.com>'},{name:'Subject',value:'Original'}]}})
  }) as typeof fetch
  try {
    const result=await google.salvaBozza('source',email,'draft@myynd.local')
    assert.equal(result.id,'d1');assert.equal(writes.length,1)
    assert.match(writes[0].url,/\/drafts$/);assert.equal(writes[0].body.message.threadId,'actual-thread')
    assert.match(Buffer.from(writes[0].body.message.raw,'base64url').toString(),/In-Reply-To: <original@example.com>/)
  } finally {globalThis.fetch=real;google.scordaIlToken()}
})
test('Gmail reads the current provider draft and recognizes removal',async()=>{
 const cfg=await import('./config.ts'), google=await import('./connettori/google.ts')
 cfg.scrivi({...cfg.leggi(),google:{clientId:'test',refresh:'test',email:'me@example.com'}})
 google.scordaIlToken()
 const real=globalThis.fetch
 let missing=false
 const raw=mimeBozza('me@example.com',{a:'sender@example.com',oggetto:'Re: Hello',corpo:'Edited in Gmail.',rispondeA:null},'myynd@test')
 globalThis.fetch=(async(url)=>{
  if(String(url).includes('oauth2.googleapis.com')) return Response.json({access_token:'fake',expires_in:3600})
  if(missing) return Response.json({error:{message:'missing'}},{status:404})
  return Response.json({id:'d1',message:{raw:Buffer.from(raw).toString('base64url')}})
 }) as typeof fetch
 try {
  const current=await google.leggiBozza('d1')
  assert.equal(current.corpo,'Edited in Gmail.')
  assert.equal(current.stato,'presente')
  missing=true
  assert.equal((await google.leggiBozza('d1')).stato,'sparita')
 } finally {globalThis.fetch=real;google.scordaIlToken()}
})

test('IMAP reads exact Drafts UID body and treats missing UID as removed',async()=>{
 let missing=false
 const raw=mimeBozza('me@example.com',{a:'sender@example.com',oggetto:'Re: Hello',corpo:'Edited in mailbox.',rispondeA:null},'myynd@test')
 const mock={connect:async()=>{},list:async()=>[{path:'INBOX.Bozze',specialUse:'\\Drafts'}],getMailboxLock:async()=>({release(){}}),
   fetchOne:async(uid:number)=>{assert.equal(uid,42);return missing?false:{source:Buffer.from(raw)}},logout:async()=>{},close(){}}
 posta.usaClient(()=>mock as never)
 try {
  const current=await posta.leggiBozza({host:'mail.example.com',porta:993,utente:'me@example.com',password:'test'},'INBOX.Bozze:42')
  assert.equal(current.corpo,'Edited in mailbox.')
  missing=true
  assert.equal((await posta.leggiBozza({host:'mail.example.com',porta:993,utente:'me@example.com',password:'test'},'INBOX.Bozze:42')).stato,'sparita')
 } finally {posta.usaClient(null)}
})

test('revision journal updates one exact provider id once and refuses stale or uncertain retry',async()=>{
 const source='google:original', oldId='old-draft'
 let body='My hand-edited wording.'
 const get=async(s:string,c:{id?:string;stato:'salvata'|'errore'})=>{
  const data={source:s,id:c.id!,corpo:body,oggetto:'Re: Hello',a:'sender@example.com',messageId:'myynd@old'}
  return {stato:'presente' as const,...data,impronta:createHash('sha256').update(JSON.stringify(data)).digest('hex')}
 }
 const before=await get(source,{stato:'salvata',id:oldId})
 const task=(id:string)=>({id,madre:'original-task',doc:source,nota:`REVISION BASELINE: ${JSON.stringify({tipo:'bozza',source,id:oldId,impronta:before.impronta})}`})
 let calls=0
 const update=async(s:string,id:string)=>{calls++;assert.equal(s,source);assert.equal(id,oldId);return {id:oldId,url:'provider://old-draft'}}
 const first=await salvaRevisioneCasella(task('same-revision'),email,update,get,dir)
 assert.deepEqual(first,{stato:'salvata',id:oldId,url:'provider://old-draft'})
 assert.deepEqual(await salvaRevisioneCasella(task('same-revision'),email,update,get,dir),first)
 assert.equal(calls,1)
 body='Another manual edit after capture.'
 await assert.rejects(salvaRevisioneCasella(task('stale-revision'),email,update,get,dir),/changed/)
 assert.equal(calls,1)
 body='My hand-edited wording.'
 const uncertain=async()=>{calls++;throw new Error('Connection lost after provider update')}
 assert.equal((await salvaRevisioneCasella(task('uncertain-revision'),email,uncertain,get,dir)).stato,'errore')
 assert.match((await salvaRevisioneCasella(task('uncertain-revision'),email,update,get,dir)).errore!,/uncertain/)
 assert.equal(calls,2)
})

test('Gmail revision PUT targets the old exact draft id and never creates a second draft',async()=>{
 const cfg=await import('./config.ts'),google=await import('./connettori/google.ts')
 cfg.scrivi({...cfg.leggi(),google:{clientId:'test',refresh:'test',email:'me@example.com'}})
 google.scordaIlToken()
 const real=globalThis.fetch
 let existing=mimeBozza('me@example.com',{a:'sender@example.com',oggetto:'Re: Original',corpo:'Old body.',rispondeA:{messageId:'original@example.com'}},'old@myynd.local')
 let puts=0
 globalThis.fetch=(async(url,options)=>{
  const path=String(url)
  if(path.includes('oauth2.googleapis.com'))return Response.json({access_token:'fake',expires_in:3600})
  if(path.includes('/messages/source'))return Response.json({id:'source',threadId:'thread',labelIds:['INBOX'],payload:{headers:[{name:'From',value:'sender@example.com'},{name:'Message-ID',value:'<original@example.com>'},{name:'Subject',value:'Original'}]}})
  if(options?.method==='PUT') {puts++;assert.match(path,/\/drafts\/d1$/);existing=Buffer.from((JSON.parse(String(options.body)) as {message:{raw:string}}).message.raw,'base64url').toString();return Response.json({id:'d1',message:{id:'m2'}})}
  if(path.includes('/drafts/d1'))return Response.json({id:'d1',message:{raw:Buffer.from(existing).toString('base64url')}})
  assert.fail(`unexpected provider request ${path}`)
 }) as typeof fetch
 try {
  const before=await leggiBozzaAttuale('google:source',{stato:'salvata',id:'d1'})
  const out=await google.aggiornaBozza('source','d1',{...email,rispondeA:{messageId:'original@example.com'}},'new@myynd.local',before)
  assert.equal(out.id,'d1');assert.equal(puts,1)
 } finally {globalThis.fetch=real;google.scordaIlToken()}
})

test('IMAP replaces only old exact UID with UIDPLUS and reports race without deleting it',async()=>{
 const original=Buffer.from('From: Sender <sender@example.com>\r\nMessage-ID: <original@example.com>\r\nSubject: Original\r\n\r\nPlease reply.')
 let old=mimeBozza('me@example.com',{a:'sender@example.com',oggetto:'Re: Original',corpo:'Old body.',rispondeA:{messageId:'original@example.com'}},'old@myynd.local')
 let selected=''
 let appended=0,deleted:number[]=[],race=false,newRaw=''
 const mock={connect:async()=>{},capabilities:new Map([['UIDPLUS',true]]),mailbox:{uidValidity:7n},
  list:async()=>[{path:'INBOX.Bozze',specialUse:'\\Drafts'}],
  getMailboxLock:async(path:string)=>{selected=path;return {release(){}}},
  fetchOne:async(uid:number)=>selected==='INBOX'?{source:original}:uid===42&&old?{source:Buffer.from(old)}:uid===43&&newRaw?{source:Buffer.from(newRaw)}:false,
  append:async(_folder:string,raw:string)=>{appended++;newRaw=raw;if(race)old=mimeBozza('me@example.com',{a:'sender@example.com',oggetto:'Re: Original',corpo:'A concurrent manual edit.',rispondeA:{messageId:'original@example.com'}},'old@myynd.local');return {uid:43,uidValidity:7n}},
  messageDelete:async(uid:number,options:{uid?:boolean})=>{assert.deepEqual(options,{uid:true});deleted.push(uid);old='';return true},
  logout:async()=>{},close(){}}
 posta.usaClient(()=>mock as never)
 const config={host:'mail.example.com',porta:993,utente:'me@example.com',password:'test'}
 try {
  const before=await leggiBozzaAttuale('posta:INBOX:1',{stato:'salvata',id:'INBOX.Bozze:42'},async(_source,id)=>posta.leggiBozza(config,id))
  assert.equal(before.uidValidity,'7')
  const result=await posta.aggiornaBozza(config,'posta:INBOX:1','INBOX.Bozze:42',email,'new@myynd.local',before)
  assert.equal(result.id,'INBOX.Bozze:43')
  assert.equal(appended,1);assert.deepEqual(deleted,[42])
  old=mimeBozza('me@example.com',{a:'sender@example.com',oggetto:'Re: Original',corpo:'Another manual edit.',rispondeA:{messageId:'original@example.com'}},'old@myynd.local')
  await assert.rejects(posta.aggiornaBozza(config,'posta:INBOX:1','INBOX.Bozze:42',email,'newer@myynd.local',before),/edited or removed/)
  assert.equal(appended,1);assert.deepEqual(deleted,[42])
  old=mimeBozza('me@example.com',{a:'sender@example.com',oggetto:'Re: Original',corpo:'Old body.',rispondeA:{messageId:'original@example.com'}},'old@myynd.local')
  race=true
  await assert.rejects(posta.aggiornaBozza(config,'posta:INBOX:1','INBOX.Bozze:42',email,'race@myynd.local',before),/Both drafts were preserved/)
  assert.equal(appended,2);assert.deepEqual(deleted,[42])
  race=false
  mock.capabilities.delete('UIDPLUS')
  await assert.rejects(posta.aggiornaBozza(config,'posta:INBOX:1','INBOX.Bozze:42',email,'newer@myynd.local',before),/cannot replace only the exact old draft/)
  assert.equal(appended,2);assert.deepEqual(deleted,[42])
 } finally {posta.usaClient(null)}
})

test('live IMAP smoke replaces one disposable self-addressed draft and cleans only its own UIDs',
 {skip:process.env.MYYND_NATIVE_IMAP_TEST!=='1',timeout:90_000},async t=>{
  const production=join(homedir(),'.myynd','config.json')
  let c:import('./config.ts').ConfigPosta|undefined
  try {c=(JSON.parse(readFileSync(production,'utf8')) as {posta?:import('./config.ts').ConfigPosta}).posta}
  catch {t.skip('No configured IMAP account');return}
  if (!c?.host || !c.porta || !c.utente || !c.password) {t.skip('No configured IMAP account');return}
  const {ImapFlow}=await import('imapflow')
  const probe=await posta.prova(c)
  if (!probe.ok) {t.skip('IMAP account unavailable for smoke');return}
  const client=new ImapFlow({host:c.host,port:c.porta,secure:true,...(probe.certificatoAdattato?{tls:{servername:probe.certificatoAdattato}}:{}),auth:{user:c.utente,pass:c.password},logger:false,connectionTimeout:12_000,greetingTimeout:12_000,socketTimeout:60_000})
  try {await client.connect()} catch {t.skip('IMAP account unavailable for smoke');return}
  const token='myynd-smoke-'+createHash('sha256').update(String(Date.now())+Math.random()).digest('hex').slice(0,18)
  const oldMessageId=`${token}-old@draft.myynd.local`,newMessageId=`${token}-new@draft.myynd.local`
  let folder='',oldUid=0,newUid=0,phase='list Drafts'
  try {
    if (!client.capabilities.has('UIDPLUS')) {t.skip('IMAP server lacks narrow UID removal');return}
    const folders=await client.list()
    folder=folders.find(f=>f.specialUse==='\\Drafts')?.path??''
    if (!folder) {t.skip('No provider Drafts folder');return}
    const oldRaw=mimeBozza(c.utente,{a:c.utente,oggetto:'Myynd private draft smoke',corpo:'Private disposable draft body.',rispondeA:null},oldMessageId)
    phase='append disposable draft'
    const appended=await client.append(folder,oldRaw,['\\Draft','\\Seen'])
    if (!appended || !appended.uid) {t.skip('Provider did not return stable disposable UID');return}
    oldUid=appended.uid
    const oldId=`${folder}:${oldUid}`,source=`posta:${folder}:${oldUid}`
    phase='read disposable draft'
    const baseline=await leggiBozzaAttuale(source,{stato:'salvata',id:oldId},async(_source,id)=>posta.leggiBozza(c!,id))
    assert.equal(baseline.uidValidity,String(appended.uidValidity))
    phase='replace disposable draft'
    const updated=await posta.aggiornaBozza(c,source,oldId,{a:c.utente,oggetto:'Myynd private draft smoke',corpo:'Private revised body.',conosciuto:true,rispondeA:{messageId:oldMessageId}},newMessageId,baseline)
    newUid=Number(updated.id.slice(folder.length+1))
    assert.ok(newUid && newUid!==oldUid)
    phase='verify provider replacement'
    assert.equal((await posta.leggiBozza(c,oldId)).stato,'sparita')
    const current=await posta.leggiBozza(c,updated.id)
    assert.equal(current.stato,'presente')
    assert.match(current.corpo||'',/Private revised body/)
  } catch(err) {
    throw new Error(`Live disposable draft smoke failed during ${phase}: ${(err as {code?:string}).code??'provider error'}`)
  } finally {
    let cleanupUncertain=false
    // The cleanup never expunges a UID unless its current Message-ID is this
    // test's disposable one. UIDPLUS is required to avoid broad EXPUNGE.
    if (folder && client.capabilities.has('UIDPLUS')) {
      const lock=await client.getMailboxLock(folder).catch(()=>null)
      if (lock) try {
        const matches=await client.search({header:{'Message-ID':'myynd-smoke-'}},{uid:true}).catch(()=>null)
        if (matches===null) cleanupUncertain=true
        const candidates=new Set<number>([oldUid,newUid,...(Array.isArray(matches)?matches:[])].filter(Boolean))
        const {simpleParser}=await import('mailparser')
        for (const uid of candidates) {
          const found=await client.fetchOne(uid,{source:true},{uid:true}).catch(()=>false)
          if (!found || typeof found!=='object' || !found.source) continue
          const parsed=await simpleParser(found.source)
          const from=parsed.from?.value?.[0]?.address?.toLowerCase(),to=Array.isArray(parsed.to)?parsed.to[0]?.value?.[0]?.address?.toLowerCase():parsed.to?.value?.[0]?.address?.toLowerCase()
          if (!/^myynd-smoke-[a-f0-9]{18}-(?:old|new)@draft\.myynd\.local$/.test(parsed.messageId??'')
            || parsed.subject!=='Myynd private draft smoke' || from!==c!.utente.toLowerCase() || to!==c!.utente.toLowerCase()) continue
          if (!await client.messageDelete(uid,{uid:true}).catch(()=>false)) cleanupUncertain=true
        }
        const remaining=await client.search({header:{'Message-ID':'myynd-smoke-'}},{uid:true}).catch(()=>null)
        if (remaining===null) cleanupUncertain=true
        if (Array.isArray(remaining)) for (const uid of remaining) {
          const found=await client.fetchOne(uid,{source:true},{uid:true}).catch(()=>false)
          if (!found || typeof found!=='object' || !found.source) continue
          const parsed=await simpleParser(found.source)
          if (/^myynd-smoke-[a-f0-9]{18}-(?:old|new)@draft\.myynd\.local$/.test(parsed.messageId??'')) cleanupUncertain=true
        }
      } finally {lock.release()}
      else if (oldUid || newUid) cleanupUncertain=true
    }
    await client.logout().catch(()=>client.close())
    if (cleanupUncertain) throw new Error('Disposable smoke draft cleanup could not be confirmed. Check only myynd-smoke tagged Drafts UIDs.')
  }
 })
