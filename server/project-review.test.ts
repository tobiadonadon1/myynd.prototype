import {test} from 'node:test'
import assert from 'node:assert/strict'
import {chmod,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {executeInCopy} from './esecuzione-isolata.ts'
import {reviewArguments,reviewProjectReport} from './project-review.ts'

async function fixture(fn:(root:string)=>Promise<void>) {
  const root=await mkdtemp(join(tmpdir(),'myynd-review-'))
  try {await fn(root)} finally {await rm(root,{recursive:true,force:true})}
}
async function verified(root:string) {
  const source=join(root,'source');await mkdir(source)
  await writeFile(join(source,'value.mjs'),'export const value=1\n')
  await writeFile(join(source,'package.json'),JSON.stringify({type:'module',scripts:{test:'node --test'}}))
  await writeFile(join(source,'value.test.mjs'),"import{test}from'node:test';import{strict as a}from'node:assert';import{value}from'./value.mjs';test('value',()=>a.equal(value,2));")
  return executeInCopy(source,async copy=>{await writeFile(join(copy,'value.mjs'),'export const value=2\n');return {text:'changed',finished:true,exitCode:0}},{baseDir:join(root,'work')})
}
async function runner(root:string,code:string) {
  const executable=join(root,'reviewer');await writeFile(executable,'#!/usr/bin/env node\n'+code);await chmod(executable,0o755)
  return {id:'claude' as const,status:'supported' as const,executable,version:'fixture'}
}

test('reviewer argv disables all tools, hooks, memory and MCP with a bounded economical run',()=>{
  const args=reviewArguments('criteria')
  assert.equal(args[args.indexOf('--tools')+1],'')
  assert.equal(args[args.indexOf('--setting-sources')+1],'')
  assert.ok(args.includes('--strict-mcp-config'))
  assert.equal(JSON.parse(args[args.indexOf('--settings')+1]).disableAllHooks,true)
  assert.equal(args[args.indexOf('--max-budget-usd')+1],'0.25')
})
test('strict structured approval observes a saved checked copy without making changes',async()=>fixture(async root=>{
  const report=await verified(root)
  const runtime=await runner(root,'process.stdout.write(JSON.stringify({accepted:true,findings:["The supplied value is 2 and its test passed."]}))')
  const team=await reviewProjectReport(report,'value must equal 2',{worker:'hermes',runtime})
  assert.equal(team.accepted,true);assert.equal(team.roles[1].outcome,'approved')
  assert.equal(await readFile(join(report.source,'value.mjs'),'utf8'),'export const value=1\n')
  assert.equal(await readFile(join(report.workspace,'value.mjs'),'utf8'),'export const value=2\n')
  assert.equal(report.workspace,JSON.parse(await readFile(report.reportFile,'utf8')).workspace)
}))
test('failed tests, cancellation, prose and rejected verdicts cannot approve',async()=>fixture(async root=>{
  const report=await verified(root)
  const runtime=await runner(root,'process.stdout.write("Everything looks done!")')
  assert.equal((await reviewProjectReport(report,'value must equal 2',{worker:'claude',runtime})).roles[1].outcome,'incomplete')
  const rejected=await runner(root,'process.stdout.write(JSON.stringify({accepted:false,findings:["A criterion is unproven."]}))')
  assert.equal((await reviewProjectReport(report,'value must equal 2',{worker:'claude',runtime:rejected})).accepted,false)
  const cancelled=new AbortController();cancelled.abort()
  assert.equal((await reviewProjectReport(report,'value must equal 2',{worker:'claude',runtime,signal:cancelled.signal})).roles[1].outcome,'cancelled')
  const failed={...report,state:'failed' as const}
  assert.equal((await reviewProjectReport(failed,'value must equal 2',{worker:'claude',runtime})).roles[1].outcome,'not_run')
  await assert.rejects(()=>reviewProjectReport(report,'',{worker:'claude',runtime}),/acceptance criteria/)
}))
test('subprocess failure and edits during review invalidate approval',async()=>fixture(async root=>{
  const report=await verified(root)
  const runtime=await runner(root,'process.stderr.write("authentication");process.exit(1)')
  assert.equal((await reviewProjectReport(report,'value must equal 2',{worker:'claude',runtime})).roles[1].outcome,'failed')
  const empty=await runner(root,'process.stdout.write(JSON.stringify({accepted:true,findings:[]}))')
  assert.equal((await reviewProjectReport(report,'value must equal 2',{worker:'claude',runtime:empty})).roles[1].outcome,'incomplete')
  const tamper=await runner(root,"require('node:fs').writeFileSync('value.mjs','export const value=3\\n');process.stdout.write(JSON.stringify({accepted:true,findings:['Value is 2.']}))")
  assert.equal((await reviewProjectReport(report,'value must equal 2',{worker:'claude',runtime:tamper})).roles[1].outcome,'incomplete')
}))
