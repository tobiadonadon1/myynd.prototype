/** Coalesced local catch-up. Durable claims avoid duplicate dispatch after a crash. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cartella } from './config.ts'
import { withBackgroundWork } from './lavoro-background.ts'

type Entry={slot:number;started:number;finished?:number;state:'running'|'complete'|'interrupted'|'failed'}
type Journal=Record<string,Entry>
const running=new Set<string>()
const boot=Date.now()
const path=()=>join(cartella(),'scheduled-catchup.json')
function read():Journal{
 try{
  const value=JSON.parse(readFileSync(path(),'utf8'))
  if(!value || typeof value!=='object' || Array.isArray(value))return {}
  return Object.fromEntries(Object.entries(value).filter(([name,raw])=>{
   const e=raw as Entry
   return /^[a-z][a-z0-9_-]{0,63}$/.test(name) && e && Number.isSafeInteger(e.slot) && Number.isFinite(e.started) && ['running','complete','interrupted','failed'].includes(e.state)
  })) as Journal
 }catch{return {}}
}
function save(j:Journal){mkdirSync(cartella(),{recursive:true});writeFileSync(path()+'.tmp',JSON.stringify(j),{mode:0o600});renameSync(path()+'.tmp',path())}
export function scheduledStatus(){
 const j=read()
 for(const e of Object.values(j)) if(e.state==='running' && e.started<boot)e.state='interrupted'
 return j
}
/** At most one scan per current slot, never a backlog of every missed interval.
 * A crash-claimed slot is not replayed: the next interval rechecks current sources.
 * Task-producing callbacks must retain their normal source/task deduplication. */
export async function runScheduled<T>(name:string, intervalMs:number, work:()=>Promise<T>, now=Date.now()):Promise<{ran:boolean;result?:T}> {
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(name) || !Number.isSafeInteger(intervalMs) || intervalMs<60_000)throw new Error('Invalid scheduled job')
 const key=cartella()+'\0'+name
 if(running.has(key))return {ran:false}
 running.add(key)
 try {
  const slot=Math.floor(now/intervalMs),j=read(),previous=j[name]
  if(previous && previous.slot>=slot)return {ran:false}
  j[name]={slot,started:now,state:'running'};save(j)
  try {
   const result=await withBackgroundWork(work)
   const latest=read();latest[name]={slot,started:now,finished:Date.now(),state:'complete'};save(latest)
   return {ran:true,result}
  }catch(error){
   const latest=read();latest[name]={slot,started:now,finished:Date.now(),state:'failed'};save(latest)
   throw error
  }
 }finally{running.delete(key)}
}
