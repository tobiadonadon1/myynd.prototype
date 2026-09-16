import {realpath,readFile} from 'node:fs/promises'
import {join,dirname,relative,isAbsolute} from 'node:path'
import {cartella} from './config.ts'
import db from './store.ts'
/** Only a persisted execution from this profile can open its exact working copy. */
export async function copiaVerificata(reportFile:string):Promise<string>{
 const root=await realpath(join(cartella(),'project-work'))
 const file=await realpath(reportFile)
 const rel=relative(root,file)
 if(!rel || rel.startsWith('..') || isAbsolute(rel))throw new Error('Unknown working copy.')
 const report=JSON.parse(await readFile(file,'utf8'))
 const records=db.prepare("SELECT dettaglio FROM azioni WHERE tipo = 'lavoro.fatto'").all() as {dettaglio:string|null}[]
 const owned=records.some(a=>{try{return JSON.parse(a.dettaglio || '{}').reportFile===file}catch{return false}})
 if(!owned || report.reportFile!==file)throw new Error('Working copy does not belong to a recorded task.')
 const workspace=await realpath(report.workspace)
 if(workspace!==join(dirname(file),'project'))throw new Error('Invalid working copy path.')
 return workspace
}
