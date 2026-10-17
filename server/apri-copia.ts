import {realpath,readFile} from 'node:fs/promises'
import {join,dirname,relative,isAbsolute} from 'node:path'
import {cartella} from './config.ts'
import db from './store.ts'
import type {ExecutionReport} from './esecuzione-isolata.ts'

/** The recorded kinds of project work whose copy may be opened or applied. */
const REGISTRATI = ['lavoro.fatto','lavoro.copia']

/**
 * The execution report as it was recorded when the work finished, if this
 * profile owns it: inside its project-work folder, and written down by a
 * task (the chat route) or by a card whose work stayed in the copy.
 */
export async function reportRegistrato(reportFile:string):Promise<ExecutionReport>{
 const root=await realpath(join(cartella(),'project-work'))
 const file=await realpath(reportFile)
 const rel=relative(root,file)
 if(!rel || rel.startsWith('..') || isAbsolute(rel))throw new Error('Unknown working copy.')
 const report=JSON.parse(await readFile(file,'utf8'))
 const records=db.prepare(`SELECT dettaglio FROM azioni WHERE tipo IN (${REGISTRATI.map(()=>'?').join(',')}) ORDER BY quando DESC`).all(...REGISTRATI) as {dettaglio:string|null}[]
 // the recorded path may be spelled through a link (/var → /private/var): compare the real ones
 const same=async(p:unknown)=>typeof p==='string' && (p===file || await realpath(p).catch(()=>null)===file)
 let owned:ExecutionReport|null=null
 for(const a of records){let r:ExecutionReport|null=null;try{r=JSON.parse(a.dettaglio || '{}')}catch{/* a broken record is not ours */}if(r && await same(r.reportFile)){owned=r;break}}
 if(!owned || !await same(report.reportFile))throw new Error('Working copy does not belong to a recorded task.')
 const workspace=await realpath(report.workspace)
 if(workspace!==join(dirname(file),'project'))throw new Error('Invalid working copy path.')
 return owned
}

/** Only a persisted execution from this profile can open its exact working copy. */
export async function copiaVerificata(reportFile:string):Promise<string>{
 const report=await reportRegistrato(reportFile)
 return await realpath(report.workspace)
}

/** This copy was already applied: a second tap must not land it twice. */
export function giaApplicata(reportFile:string):boolean{
 const records=db.prepare("SELECT dettaglio FROM azioni WHERE tipo = 'lavoro.applicato'").all() as {dettaglio:string|null}[]
 return records.some(a=>{try{return JSON.parse(a.dettaglio || '{}').reportFile===reportFile}catch{return false}})
}
