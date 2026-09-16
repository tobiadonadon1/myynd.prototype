import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const dir=mkdtempSync(join(tmpdir(),'myynd-sender-provider-'));process.env.MYYND_DATI=dir
const google=await import('./connettori/google.ts'),posta=await import('./connettori/posta.ts'),cfg=await import('./config.ts')
const realFetch=globalThis.fetch
after(()=>{globalThis.fetch=realFetch;posta.usaClient(null);rmSync(dir,{recursive:true,force:true})})
const sender='sender@example.com',messageId='original@example.com'

test('Gmail checks current identity and verifies INBOX removal without deleting or trashing',async()=>{
 cfg.scrivi({google:{clientId:'fixture',refresh:'fixture'}});google.scordaIlToken()
 let moved=false;const writes:unknown[]=[]
 globalThis.fetch=(async(url,options)=>{
  if(String(url).includes('/token'))return Response.json({access_token:'fixture',expires_in:3600})
  if(options?.method==='POST'){writes.push(JSON.parse(String(options.body)));moved=true;return Response.json({})}
  return Response.json({id:'abc',labelIds:moved?[]:['INBOX'],payload:{headers:[{name:'From',value:`Sender <${sender}>`},{name:'Message-ID',value:`<${messageId}>`}]}})
 }) as typeof fetch
 assert.equal(await google.verificaEArchiviaPerRegola('google:abc',sender,messageId),1)
 assert.deepEqual(writes,[{removeLabelIds:['INBOX']}])
})
test('Gmail changed identity, ambiguous sender, missing proof and failed readback never claim success',async()=>{
 for(const scenario of ['sender','message-id','sent','different-id','readback']){
  let writes=0
  globalThis.fetch=(async(_url,options)=>{
   if(options?.method==='POST'){writes++;return Response.json({})}
   return Response.json({id:scenario==='different-id'?'wrong':'abc',labelIds:scenario==='sent'?['INBOX','SENT']:['INBOX'],payload:{headers:[{name:'From',value:scenario==='sender'?'other@example.com':sender},{name:'Message-ID',value:scenario==='message-id'?'<changed@example.com>':`<${messageId}>`}]}})
  }) as typeof fetch
  await assert.rejects(google.verificaEArchiviaPerRegola('google:abc',sender,messageId),/./,scenario)
  assert.equal(writes,scenario==='readback'?1:0)
 }
 await assert.rejects(google.verificaEArchiviaPerRegola('google:abc',sender,null))
})

test('IMAP verifies live headers and UID validity under lock, uses MOVE and reads archive identity back',async()=>{
 let folder='INBOX',locked=false,moved=false,moves=0
 const raw=Buffer.from(`From: Sender <${sender}>\r\nMessage-ID: <${messageId}>\r\n\r\nA message.`)
 const mock={connect:async()=>{},capabilities:new Map([['MOVE',true]]),mailbox:{uidValidity:1n},list:async()=>[{path:'Archive',specialUse:'\\Archive'}],
  getMailboxLock:async(path:string)=>{assert.equal(locked,false);locked=true;folder=path;mock.mailbox.uidValidity=path==='INBOX'?1n:2n;return{release(){locked=false}}},
  fetchOne:async()=>folder==='INBOX'&&moved?false:{source:raw},
  messageMove:async(ids:unknown,target:string,options:unknown)=>{assert.equal(locked,true);assert.equal(folder,'INBOX');assert.deepEqual(ids,[7]);assert.equal(target,'Archive');assert.deepEqual(options,{uid:true});moved=true;moves++;return{uidValidity:2n,uidMap:new Map([[7,9]])}},logout:async()=>{},close(){} }
 posta.usaClient(()=>mock as never)
 assert.equal(await posta.verificaEArchiviaPerRegola({host:'mail.example.com',porta:993,utente:'me@example.com',password:'fixture',validita:{INBOX:'1'}},'posta:INBOX:7',sender,messageId),1)
 assert.equal(moves,1);assert.equal(locked,false)
})
test('IMAP UID reuse and missing MOVE prohibit mutation; missing destination proof is uncertain',async()=>{
 for(const scenario of ['uidvalidity','message-id','sender','no-move','readback']){
  let moved=false,moves=0,folder='INBOX'
  const raw=Buffer.from(`From: ${scenario==='sender'?'other@example.com':sender}\r\nMessage-ID: <${scenario==='message-id'?'changed@example.com':messageId}>\r\n\r\nBody`)
  const mock={connect:async()=>{},capabilities:new Map(scenario==='no-move'?[]:[['MOVE',true]]),mailbox:{uidValidity:scenario==='uidvalidity'?8n:1n},list:async()=>[{path:'Archive',specialUse:'\\Archive'}],
   getMailboxLock:async(path:string)=>{folder=path;return{release(){}}},fetchOne:async()=>folder==='Archive'||moved?false:{source:raw},
   messageMove:async()=>{moves++;moved=true;return{uidValidity:1n,uidMap:new Map([[7,9]])}},logout:async()=>{},close(){} }
  posta.usaClient(()=>mock as never)
  await assert.rejects(posta.verificaEArchiviaPerRegola({host:'mail.example.com',porta:993,utente:'me@example.com',password:'fixture',validita:{INBOX:'1'}},'posta:INBOX:7',sender,messageId),/./,scenario)
  assert.equal(moves,scenario==='readback'?1:0)
 }
})
