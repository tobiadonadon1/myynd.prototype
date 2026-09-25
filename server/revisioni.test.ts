import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
const home = mkdtempSync(join(tmpdir(), 'myynd-revisions-'))
process.env.MYYND_DATI = home
const store = await import('./store.ts')
const { rivediDallaChat, rivediDaCorrezione, rifiutoCorrezione, verificaBaseRevisione, contestoRevisioni, richiestaRevisione } = await import('./revisioni.ts')
const { documentoImpaginato } = await import('./document-layout.ts')
after(() => {store.chiudiIndici();rmSync(home,{recursive:true,force:true})})
const documento = async (c:{app:'Pages'|'TextEdit';percorso:string;desktop?:string}) => {
 const path=c.desktop || c.percorso, text=readFileSync(path,'utf8')
 return {app:c.app,percorso:path,...(c.desktop?{desktop:path}:{}),testo:text,impronta:createHash('sha256').update(c.app+'\0'+path+'\0'+text).digest('hex')}
}

test('chat feedback queues a new grounded revision, preserves source and persists parent linkage', async () => {
 const folder=join(home,'deliverables','original');mkdirSync(folder,{recursive:true})
 const path=join(folder,'Essay.pages');writeFileSync(path,'Original first paragraph.\n\nOriginal second paragraph. Manual Pages edit.')
 writeFileSync(join(folder,'.layout.docx'),await documentoImpaginato('Original title','Stale generated source.'))
 store.scriviCompito({id:'original',testo:'Write an essay in Pages',ordine:'a'})
 const delivery={app:'Pages' as const,titolo:'Original title',percorso:path}
 store.scriviConsegnaCompito('original',delivery)
 const started:string[]=[]
 const out=await rivediDallaChat({id:'original',feedback:'Make the conclusion shorter'},'Make the conclusion shorter',(id,mode)=>{started.push(id);assert.equal(mode,'tutto');store.affidaCompito(id,mode)},undefined,{documento})
 assert.equal(started.length,1)
 assert.equal(store.compito(out.id)?.madre,'original')
 assert.match(store.compito(out.id)?.nota||'',/Original second paragraph/)
 assert.match(store.compito(out.id)?.nota||'',/Manual Pages edit/)
 assert.doesNotMatch(store.compito(out.id)?.nota||'',/Stale generated source/)
 assert.match(store.compito(out.id)?.nota||'',/Make the conclusion shorter/)
 assert.deepEqual(store.compito('original')?.consegna,delivery)
 assert.equal((await rivediDallaChat({id:'original',feedback:'Make the conclusion shorter'},'Make the conclusion shorter',()=>assert.fail('duplicate start'),undefined,{documento})).giaAvviato,true)
 await verificaBaseRevisione(store.compito(out.id)!,{documento})
 store.chiudiIndici()
 assert.equal(store.compito(out.id)?.stato,'delegato')
 assert.match(contestoRevisioni(),/Original title/)
})

test('manual Pages edit after a revision starts blocks publication and grounds a new revision in edited body',async()=>{
 const original=store.compito('original')!
 const path=original.consegna!.percorso
 const old=store.elencoCompiti().find(x=>x.madre==='original')!
 writeFileSync(path,'Original first paragraph. A newly edited Pages conclusion.')
 await assert.rejects(verificaBaseRevisione(old,{documento}),/changed/)
 const out=await rivediDallaChat({id:'original',feedback:'Make the conclusion shorter'},'Make the conclusion shorter',(id,mode)=>store.affidaCompito(id,mode),undefined,{documento})
 assert.notEqual(out.id,old.id)
 assert.match(store.compito(out.id)?.nota||'',/newly edited Pages conclusion/)
})

test('source-invented feedback and unavailable task never queue work', async () => {
 let called=false
 await assert.rejects(rivediDallaChat({id:'original',feedback:'Delete the whole document'},'What does it say?',()=>{called=true}))
 await assert.rejects(rivediDallaChat({id:'other-account',feedback:'Make it shorter'},'Make it shorter',()=>{called=true}))
 assert.equal(called,false)
})

test('existing draft revision keeps the exact previous draft and queues draft-only work', async () => {
 store.scriviCompito({id:'draft',testo:'Draft reply to Luca',ordine:'b'})
 store.affidaCompito('draft','bozza')
 store.risultatoCompito('draft','Thanks Luca, Tuesday works.',[],'pronto')
 const out=await rivediDallaChat({id:'draft',feedback:'Change the proposed day to Wednesday'},'Change the proposed day to Wednesday',(id,mode)=>{assert.equal(mode,'bozza');store.affidaCompito(id,mode)})
 assert.match(store.compito(out.id)?.nota||'',/Thanks Luca, Tuesday works/)
 assert.match(store.compito(out.id)?.nota||'',/Do not send or publish/)
 assert.equal(store.compito('draft')?.risultato,'Thanks Luca, Tuesday works.')
})

test('saved provider draft edits ground revision and later provider changes stop its publication',async()=>{
 store.scriviCompito({id:'published-draft',testo:'Draft reply to Luca',doc:'google:source',ordine:'c'})
 store.affidaCompito('published-draft','bozza')
 store.risultatoCompito('published-draft','Old generated wording.',[],'pronto')
 store.scriviEmailCompito('published-draft',{a:'luca@example.com',oggetto:'Re: Plan',corpo:'Old generated wording.',conosciuto:true,casella:{stato:'salvata',id:'provider-draft'}})
 let body='Wednesday is best. I added this by hand in Gmail.'
 const bozza = async (source:string,casella:{id?:string}) => {
  const data={source,id:casella.id!,corpo:body,oggetto:'Re: Plan',a:'luca@example.com',messageId:'myynd@test'}
  return {stato:'presente' as const,...data,impronta:createHash('sha256').update(JSON.stringify(data)).digest('hex')}
 }
 const out=await rivediDallaChat({id:'published-draft',feedback:'Make the message warmer'},'Make the message warmer',(id,mode)=>store.affidaCompito(id,mode),undefined,{bozza})
 assert.match(store.compito(out.id)?.nota||'',/added this by hand in Gmail/)
 await verificaBaseRevisione(store.compito(out.id)!,{bozza})
 body='Thursday works now. Another manual edit.'
 await assert.rejects(verificaBaseRevisione(store.compito(out.id)!,{bozza}),/changed/)
})

test('praise, questions, negated edits and mismatched selected targets never execute', async () => {
 for (const feedback of ['Looks good', 'About «Write and make a document»: Looks good', 'Why did you change the title?', "Do not change this document"]) {
  await assert.rejects(rivediDallaChat({id:'original',feedback},feedback,()=>assert.fail('must not run')))
 }
 await assert.rejects(rivediDallaChat({id:'original',feedback:'Make it shorter'},'Make it shorter',()=>assert.fail('wrong target'), 'draft'))
})

test('revision intent requires an explicit command clause rather than a mentioned verb', () => {
 for (const text of [
  'I like how you use the headings', 'Can you explain why you use this font?',
  'Could you suggest a different style?', 'I might ask you to make it shorter later',
  'What would happen if you change the title?', 'Do not use a different font',
  'The document says "Use short paragraphs"', 'Please explain why you changed it'
 ]) assert.equal(richiestaRevisione(text), false, text)
 for (const text of [
  'Use shorter paragraphs and more concise section headings. Keep it at two pages.',
  'Please make it one page', 'Could you please use Georgia?', 'I would like you to revise the conclusion',
  'Looks good. Please shorten the introduction.', 'Per favore, cambia il titolo',
  'Puoi accorciare la conclusione?', 'About «Use big headings»: Please use smaller headings'
 ]) assert.equal(richiestaRevisione(text), true, text)
})

test('ordinary child followups do not require a revision baseline, while a real revision does',async()=>{
 store.scriviCompito({id:'ordinary-child',testo:'Follow up on the same project',madre:'original',ordine:'d'})
 await verificaBaseRevisione(store.compito('ordinary-child')!)
 store.scriviCompito({id:'rev-missing',testo:'Revise document',madre:'original',nota:'REVISION REQUEST: Shorten it',ordine:'e'})
 await assert.rejects(verificaBaseRevisione(store.compito('rev-missing')!),/no verifiable current artifact baseline/)
})

test('«Cambia» su una bozza salvata nella posta (P3) apre una figlia rev- dal titolo del compito, con la bozza attuale come base; sparita, il no è un 409 nella lingua di casa', async () => {
 store.scriviCompito({id:'bozza-ipotesi',testo:'Reply to Leo about the logo files',doc:'posta:INBOX:503',ordine:'d'})
 store.affidaCompito('bozza-ipotesi','bozza')
 store.risultatoCompito('bozza-ipotesi','Done: the reply.\n\nHi Leo,\n\nall three formats attached.\n\nBest\n\nI assumed all three formats.',[],'pronto')
 store.scriviEmailCompito('bozza-ipotesi',{a:'leo@studio.example',oggetto:'Re: Logo files',corpo:'Hi Leo,\n\nall three formats attached.\n\nBest',conosciuto:true,casella:{stato:'salvata',id:'d1'}})
 let stato:'presente'|'sparita'='presente'
 const bozza = async (source:string,casella:{id?:string}) => {
  if (stato==='sparita') return {stato:'sparita' as const,source,id:casella.id!}
  const data={source,id:casella.id!,corpo:'Hi Leo,\n\nall three formats attached.\n\nBest',oggetto:'Re: Logo files',a:'leo@studio.example',messageId:'myynd@test'}
  return {stato:'presente' as const,...data,impronta:createHash('sha256').update(JSON.stringify(data)).digest('hex')}
 }
 const avviate:string[]=[]
 const out=await rivediDaCorrezione('bozza-ipotesi','Only the SVG',(id,mode)=>{avviate.push(mode);store.affidaCompito(id,mode)},{bozza})
 assert.ok(out.id.startsWith('rev-'))
 assert.equal(out.giaAvviato,false)
 assert.deepEqual(avviate,['bozza'])
 const figlia=store.compito(out.id)!
 assert.equal(figlia.madre,'bozza-ipotesi')
 assert.equal(figlia.testo,'Reply to Leo about the logo files')
 assert.match(figlia.nota||'',/REVISION REQUEST: Only the SVG/)
 assert.match(figlia.nota||'',/"tipo":"bozza"/)
 assert.equal(store.compito('bozza-ipotesi')?.stato,'pronto')
 // la stessa correzione due volte è una revisione sola
 assert.equal((await rivediDaCorrezione('bozza-ipotesi','Only the SVG',()=>{},{bozza})).giaAvviato,true)
 // la bozza è partita o è stata tolta dalla posta: un no suo, non un guasto
 stato='sparita'
 await assert.rejects(rivediDaCorrezione('bozza-ipotesi','Only the PNG',()=>{},{bozza}),/removed or sent/)
 assert.deepEqual(rifiutoCorrezione(new Error('The saved mailbox draft was removed or sent. Review the current thread before revising it.')),{stato:409,errore:'La bozza salvata nella tua posta non c\'è più.'})
 assert.deepEqual(rifiutoCorrezione(new Error('Reconnect your email account to read the saved draft.')),{stato:400,errore:'Collega la posta per rileggere la bozza salvata.'})
 assert.equal(rifiutoCorrezione(new Error('ENOENT: no such file')),null)
})
