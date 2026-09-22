import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const home = mkdtempSync(join(tmpdir(), 'myynd-route-work-'))
const data = join(home, 'profile')
const source = join(home, 'source')
const fakeHome = join(home, 'fake-home')
mkdirSync(source, { recursive: true })
mkdirSync(join(fakeHome, '.local', 'bin'), { recursive: true })
writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'route-proof', type: 'module', scripts: { test: 'node --test' } }))
writeFileSync(join(source, 'value.mjs'), 'export const value = 1\n')
writeFileSync(join(source, 'value.test.mjs'), "import {test} from 'node:test'; import {strict as assert} from 'node:assert'; import {value} from './value.mjs'; test('route edit',()=>assert.equal(value,2));\n")
const fake = join(fakeHome, '.local', 'bin', 'claude')
writeFileSync(fake, `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const mode = args[args.indexOf('--permission-mode') + 1]
if(args[0]==='auth') {process.stdout.write(JSON.stringify({loggedIn:true}));process.exit(0)}
if(args.includes('--help')) {process.stdout.write('--permission-mode --strict-mcp-config --disallowedTools --setting-sources');process.exit(0)}
if(args.includes('--version')) {process.stdout.write('Claude route fixture');process.exit(0)}
if(args.includes('--tools')) {process.stdout.write(JSON.stringify({accepted:!args[1].includes('rejectFixture'),findings:['Structured fixture review']}));process.exit(0)}
setTimeout(() => {
  if (mode === 'acceptEdits') fs.writeFileSync('value.mjs', 'export const value = 2\\n')
  process.stdout.write(mode === 'plan' ? 'Plan: change value.mjs to 2.' : 'Edited value.mjs.')
}, args.some(a=>a.includes('slowFixture')) ? 10000 : 450)
`)
chmodSync(fake, 0o755)
const fakeHermes = join(fakeHome, '.local', 'bin', 'hermes')
writeFileSync(fakeHermes, `#!/usr/bin/env node
const args=process.argv.slice(2)
if(args.includes('--help')) process.stdout.write('--query-file --oneshot --safe-mode --toolsets --run-budget --source')
else if(args.includes('--version')) process.stdout.write('Hermes route fixture')
else process.stdout.write(JSON.stringify({summary:'Updated selected file',changes:[{path:'value.mjs',content:'export const value = 2\\n'}]}))
`)
chmodSync(fakeHermes, 0o755)
mkdirSync(join(fakeHome,'.hermes'),{recursive:true})
writeFileSync(join(fakeHome,'.hermes','config.yaml'),'model:\n  default: fixture-model\n  provider: fixture-provider\n  api_key: private-value\n')
writeFileSync(join(fakeHome,'.hermes','.env'),'ANTHROPIC_API_KEY=test-fixture-only\n')
process.env.MYYND_DATI = data
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')

let service: ChildProcess | undefined
let base = ''
const firstToken = 'route-work-first-token'
const secondToken = 'route-work-second-token'

before(async () => {
  const first = await conti.registra('first-route@example.com', 'isolated-route-password')
  const second = await conti.registra('second-route@example.com', 'isolated-route-password')
  assert.ok(first.ok && second.ok)
  await conti.perProva.apriCon(firstToken, first.id)
  await conti.perProva.apriCon(secondToken, second.id)
  chi.dentro(first.id, () => {
    cfg.scrivi({ lingua: 'en', diSerie: false, desktop: { cartelle: [source], scelte: true } })
    assert.deepEqual(cfg.leggi().desktop?.cartelle, [source])
    store.scriviCompito({ id: 'route-edit', testo: 'Update the local value', origine: 'mano', ordine: 'a' })
    store.scriviCompito({ id: 'route-hermes', testo: 'Update selected value with Hermes', origine: 'mano', ordine: 'b' })
    store.scriviCompito({ id: 'route-team', testo: 'Update selected value with a reviewer', origine: 'mano', ordine: 'c' })
    for(const suffix of ['cancel','delete','close','revise']) store.scriviCompito({id:'route-'+suffix,testo:'slowFixture project work',origine:'mano',ordine:suffix})
  })
  store.chiudiIndici()
  service = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: fakeHome, MYYND_DATI: data, MYYND_PORT: '0', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('isolated execution API did not start')), 12_000)
    let out = '', err = ''
    service!.stdout!.on('data', chunk => {
      out += String(chunk)
      const match = out.match(/server su (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) { base = match[1]; clearTimeout(timer); resolveReady() }
    })
    service!.stderr!.on('data', chunk => { err += String(chunk).slice(0, 1000) })
    service!.on('exit', code => { if (!base) { clearTimeout(timer); reject(new Error(`isolated execution API exited ${code}: ${err}`)) } })
    service!.on('error', reject)
  })
})

after(async () => {
  if (service && service.exitCode === null) {
    const stopped = new Promise<void>(resolveStopped => service!.once('exit', () => resolveStopped()))
    service.kill('SIGTERM')
    await stopped
  }
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(home, { recursive: true, force: true })
})

/**
 * Il progetto torna com'era prima di ogni prova.
 *
 * Da quando il lavoro si posa davvero nella cartella vera (`landReport`), una
 * prova lascia `value.mjs` a 2 e la prova dopo partirebbe da lì: l'agente
 * finto scriverebbe quello che c'è già e il giro tornerebbe «no_changes».
 */
function ripristina() { writeFileSync(join(source, 'value.mjs'), 'export const value = 1\n') }

async function post(path: string, token: string, body: object): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, data: await response.json() as Record<string, unknown> }
}

test('plan result is saved and concurrent edits dispatch once; the work lands in the project', async () => {
  ripristina()
  const ready = await fetch(base + '/api/lavoro/pronto', { headers: { authorization: `Bearer ${firstToken}` } }).then(r => r.json()) as { pronto:boolean; cartelle: string[]; runtimes:{id:string;status:string;defaults?:object}[] }
  assert.deepEqual(ready.cartelle, [source])
  assert.equal(ready.pronto,true)
  assert.equal(ready.runtimes.find(r=>r.id==='hermes')?.status,'supported')
  assert.deepEqual(ready.runtimes.find(r=>r.id==='hermes')?.defaults,{model:'fixture-model',provider:'fixture-provider'})
  assert.ok(!JSON.stringify(ready).includes('private-value'))
  const plan = await post('/api/compiti/route-edit/lavora', firstToken, { cartella: source, passo: 'piano' })
  assert.equal(plan.status, 200, JSON.stringify(plan.data))
  assert.equal((plan.data.compito as { stato: string }).stato, 'pronto')
  assert.match((plan.data.compito as { risultato: string }).risultato, /Plan: change value\.mjs/)
  const first = post('/api/compiti/route-edit/lavora', firstToken, { cartella: source, passo: 'fai' })
  await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  const duplicate = await post('/api/compiti/route-edit/lavora', firstToken, { cartella: source, passo: 'fai' })
  assert.equal(duplicate.status, 409)
  const done = await first
  assert.equal(done.status, 200)
  assert.equal(done.data.finito, true)
  assert.equal((done.data.compito as { stato: string }).stato, 'pronto')
  assert.match((done.data.compito as { risultato: string }).risultato, /Working copy:/)
  const report = done.data.esecuzione as { state: string; reportFile: string; workspace: string; changedFiles: { path: string }[] }
  assert.equal(report.state, 'verified')
  assert.deepEqual(report.changedFiles.map(f => f.path), ['value.mjs'])
  // «He needs to… actually perform the changes on my Xcode project»: il giro
  // gira in una copia, e poi si posa nella cartella vera. Quello che c'era
  // prima resta accanto al rapporto, così si può sempre tornare indietro.
  assert.equal(readFileSync(join(source, 'value.mjs'), 'utf8'), 'export const value = 2\n')
  assert.equal(readFileSync(join(report.workspace, 'value.mjs'), 'utf8'), 'export const value = 2\n')
  assert.match((done.data.compito as { risultato: string }).risultato, new RegExp(`Applied to ${source}: value\\.mjs \\(modified\\)`))
  assert.equal(readFileSync(join(report.reportFile, '..', 'before', 'value.mjs'), 'utf8'), 'export const value = 1\n')
  assert.equal((JSON.parse(readFileSync(report.reportFile, 'utf8')) as { state: string }).state, 'verified')
  const foreign = await post('/api/lavoro/copia/apri', secondToken, { reportFile: report.reportFile })
  assert.notEqual(foreign.status, 200)
})

test('Hermes route validates explicit scope before delegation and saves checked provenance', async () => {
  ripristina()
  const badRuntime = await post('/api/compiti/route-hermes/lavora',firstToken,{cartella:source,passo:'fai',runtime:'universal'})
  assert.equal(badRuntime.status,400)
  const missing = await post('/api/compiti/route-hermes/lavora',firstToken,{cartella:source,passo:'fai',runtime:'hermes'})
  assert.equal(missing.status,400)
  const plan = await post('/api/compiti/route-hermes/lavora',firstToken,{cartella:source,passo:'piano',runtime:'hermes',hermes:{files:['value.mjs'],model:'fixture-model',provider:'fixture-provider'}})
  assert.equal(plan.status,400)
  const done = await post('/api/compiti/route-hermes/lavora',firstToken,{cartella:source,passo:'fai',runtime:'hermes',hermes:{files:['value.mjs'],model:'fixture-model',provider:'fixture-provider'}})
  assert.equal(done.status,200,JSON.stringify(done.data))
  assert.equal(done.data.finito,true)
  const report = done.data.esecuzione as {reportFile:string;workspace:string;runtimeProvenance:object}
  assert.deepEqual(report.runtimeProvenance,{runtime:'hermes',executable:fakeHermes,version:'Hermes route fixture',scope:'copy-files',model:'fixture-model',provider:'fixture-provider'})
  assert.deepEqual(JSON.parse(readFileSync(report.reportFile,'utf8')).runtimeProvenance,report.runtimeProvenance)
  assert.equal(readFileSync(join(source,'value.mjs'),'utf8'),'export const value = 2\n','anche Hermes posa nel progetto vero')
  assert.equal(readFileSync(join(report.workspace,'value.mjs'),'utf8'),'export const value = 2\n')
})

test('worker and reviewer share one copy; rejected review prevents a completed result',async()=>{
  ripristina()
  const missing=await post('/api/compiti/route-team/lavora',firstToken,{cartella:source,passo:'fai',team:true})
  assert.equal(missing.status,400)
  // The exact per-account workspace is returned by the report, so do not
  // depend on account storage naming here.
  const done=await post('/api/compiti/route-team/lavora',firstToken,{cartella:source,passo:'fai',runtime:'hermes',hermes:{files:['value.mjs'],model:'fixture-model',provider:'fixture-provider'},team:true,acceptanceCriteria:'rejectFixture: value must equal 2'})
  assert.equal(done.status,200,JSON.stringify(done.data));assert.equal(done.data.finito,false)
  const report=done.data.esecuzione as {workspace:string;state:string;reportFile:string;team:{accepted:boolean;roles:{role:string;outcome:string}[]}}
  assert.equal(report.state,'unverified');assert.equal(report.team.accepted,false)
  assert.deepEqual(report.team.roles.map(r=>[r.role,r.outcome]),[['worker','verified'],['reviewer','rejected']])
  assert.equal((done.data.compito as {stato:string}).stato,'chiede')
  const taskFolder=join(report.workspace,'..')
  assert.deepEqual(readdirSync(taskFolder).sort(),['project','report.json'])
  // una revisione respinta non è un lavoro finito: non si posa niente
  assert.equal(readFileSync(join(source,'value.mjs'),'utf8'),'export const value = 1\n')
  assert.deepEqual(JSON.parse(readFileSync(report.reportFile,'utf8')).team,report.team)
})

test('recall, deletion, closure and task edits stop project work without overwriting the user action',async()=>{
  for(const action of ['cancel','delete','close','revise']) {
    const id='route-'+action
    const started=Date.now()
    const running=post('/api/compiti/'+id+'/lavora',firstToken,{cartella:source,passo:'fai'})
    await new Promise(r=>setTimeout(r,150))
    let interruption
    if(action==='cancel') interruption=await post('/api/compiti/'+id+'/richiama',firstToken,{})
    else if(action==='close') interruption=await post('/api/compiti/'+id+'/chiudi',firstToken,{stato:'fatto',esito:'Closed by the user'})
    else {
      const r=await fetch(base+'/api/compiti/'+id,{method:action==='delete'?'DELETE':'PATCH',headers:{authorization:`Bearer ${firstToken}`,'content-type':'application/json'},body:action==='delete'?undefined:JSON.stringify({testo:'User replacement task'})})
      interruption={status:r.status,data:await r.json()}
    }
    assert.equal(interruption.status,200,JSON.stringify(interruption.data))
    const done=await running
    assert.equal(done.status,200,JSON.stringify(done.data));assert.equal(done.data.finito,false)
    assert.ok(Date.now()-started<3000,'the ten-second worker should stop promptly')
    const current=done.data.compito as {stato:string;risultato?:string;sparito?:string;testo:string;esito?:string}
    assert.ok(!current.risultato,'canceled work must not overwrite the task with a result')
    if(action==='delete') assert.ok(current.sparito)
    else if(action==='close') {assert.equal(current.stato,'fatto');assert.equal(current.esito,'Closed by the user')}
    else {assert.equal(current.stato,'aperto');if(action==='revise')assert.equal(current.testo,'User replacement task')}
    assert.equal(readFileSync(join(source,'value.mjs'),'utf8'),'export const value = 1\n')
  }
})
