import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { creaDocumento, leggiDocumentoAttuale, creatoreDocumento, lettoreDocumento, verificaDocumentoInvariato, SCRIPT_DOCUMENTO, SCRIPT_LEGGI_DOCUMENTO, renderDocumento, pubblicaDocumentoDesktop } from './native-document.ts'

const root = mkdtempSync(join(tmpdir(), 'myynd-native-doc-test-'))
process.once('exit', () => rmSync(root, { recursive: true, force: true }))
const request = { app: 'Pages' as const, titolo: 'An essay', testo: 'A real essay.\n\nWith a second paragraph and café.' }
function setup(run: (path: string, signal?: AbortSignal) => Promise<string>, options: { hosted?: boolean; platform?: string } = {}) {
  const directory = mkdtempSync(join(root, 'profile-'))
  return { directory, create: creatoreDocumento({ directory: () => directory, platform: 'darwin', hosted: false, run, ...options }) }
}
async function saved(path: string) {
  const input = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(lstatSync(path).mode & 0o777, 0o600)
  writeFileSync(input.percorso, 'fixture native document data')
  return JSON.stringify(input)
}

test('reports completion only after app text and a saved artifact match; titles never overwrite', async () => {
  const { create } = setup(saved)
  const [first, second] = await Promise.all([create(request), create(request)])
  assert.notEqual(first.percorso, second.percorso)
  assert.equal(first.verificato, true)
  assert.equal(first.caratteri, request.testo.length)
  assert.equal(existsSync(join(first.percorso, '..', '.input.json')), false)
})

test('text is passed as private JSON data and cannot become script or a path', async () => {
  const text = '\"; do shell script \"touch /tmp/no\"\n${x} `cmd` 雪'
  const { create, directory } = setup(async path => {
    const input = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(input.testo, text)
    assert.ok(input.percorso.startsWith(join(directory, 'deliverables')))
    assert.equal(SCRIPT_DOCUMENTO.includes(text), false)
    return saved(path)
  })
  const result = await create({ ...request, titolo: '../../outside/file', testo: text })
  assert.equal(existsSync(result.percorso), true)
})

test('rejects missing artifacts, wrong app/path, truncated content, and empty files', async () => {
  for (const mode of ['missing', 'wrong-app', 'wrong-path', 'truncated', 'empty']) {
    const { create } = setup(async path => {
      const input = JSON.parse(readFileSync(path, 'utf8'))
      if (mode !== 'missing') writeFileSync(input.percorso, mode === 'empty' ? '' : 'file')
      if (mode === 'wrong-app') input.app = 'TextEdit'
      if (mode === 'wrong-path') input.percorso += '-wrong'
      if (mode === 'truncated') input.testo = 'only a fragment'
      return JSON.stringify(input)
    })
    await assert.rejects(create(request), /not complete/)
  }
})

test('rejects unsupported environments and invalid document data before launching any app', async () => {
  let calls = 0
  const run = async () => { calls++; return '' }
  await assert.rejects(setup(run, { hosted: true }).create(request), /desktop app/)
  await assert.rejects(setup(run, { platform: 'win32' }).create(request), /desktop app/)
  const { create } = setup(run)
  for (const bad of [{ app: 'Word' }, { testo: '' }, { testo: 'x'.repeat(200_001) }, { titolo: '' }, { titolo: 'x'.repeat(201) }, { testo: '\0' }]) {
    await assert.rejects(create({ ...request, ...bad } as typeof request))
  }
  assert.equal(calls, 0)
})

test('cancellation before launch or during save is never reported as a completed task', async () => {
  const controller = new AbortController()
  let calls = 0
  const { create } = setup(async path => { calls++; const result = await saved(path); controller.abort(); return result })
  await assert.rejects(create(request, controller.signal), /cancel|abort/i)
  assert.equal(calls, 1)
  await assert.rejects(create(request, controller.signal), /cancel|abort/i)
  assert.equal(calls, 1)
})

test('a deliverables symlink cannot redirect newly created customer documents', async () => {
  const { create, directory } = setup(saved)
  symlinkSync(root, join(directory, 'deliverables'))
  await assert.rejects(create(request), /folder is unavailable/)
})

test('script errors clean up private document input without pretending completion', async () => {
  let payload = ''
  const { create } = setup(async path => { payload = path; throw new Error('permission refused') })
  await assert.rejects(create(request), /permission refused/)
  assert.equal(existsSync(payload), false)
})

test('long Unicode titles stay within native filename byte limits', async () => {
  const { create } = setup(saved)
  const result = await create({ ...request, titolo: '雪'.repeat(180) })
  assert.ok(Buffer.byteLength(result.percorso.split('/').at(-1)!, 'utf8') < 255)
  assert.equal(existsSync(result.percorso), true)
})


test('a failed preview preserves the verified native artifact without claiming rendered pages', async () => {
  const directory = mkdtempSync(join(root,'render-failure-'))
  const create = creatoreDocumento({directory:()=>directory,platform:'darwin',hosted:false,run:saved,render:async()=>{throw new Error('renderer unavailable')}})
  const artifact = await create(request)
  assert.ok(existsSync(artifact.percorso))
  assert.equal(artifact.immagini,undefined)
  assert.equal(artifact.pagine,undefined)
})

test('preview worker rejects unreadable input and honors cancellation', async () => {
  await assert.rejects(renderDocumento(join(root,'missing.pdf')), /ENOENT/)
  const controller=new AbortController();controller.abort()
  await assert.rejects(renderDocumento(join(root,'missing.pdf'),controller.signal))
})


test('desktop publication preserves prior deliveries and refuses foreign or redirected destinations', {skip:process.platform !== 'darwin'}, async () => {
  const {create,directory} = setup(saved)
  const artifact = await create(request)
  const desktop = mkdtempSync(join(root,'desktop-'))
  const target = pubblicaDocumentoDesktop(artifact,{profile:directory,desktop})
  assert.equal(readFileSync(target,'utf8'),readFileSync(artifact.percorso,'utf8'))
  assert.throws(()=>pubblicaDocumentoDesktop(artifact,{profile:directory,desktop}))
  const other = mkdtempSync(join(root,'desktop-symlink-'))
  symlinkSync(desktop,join(other,'Myynd'))
  assert.throws(()=>pubblicaDocumentoDesktop(artifact,{profile:directory,desktop:other}),/unavailable/)
  assert.throws(()=>pubblicaDocumentoDesktop({...artifact,percorso:target},{profile:directory,desktop}),/Invalid/)
})

test('current published Desktop body, including app edits, is read without a save or close',async()=>{
 const profile=mkdtempSync(join(root,'read-profile-'))
 const desktop=mkdtempSync(join(root,'read-desktop-'))
 const folder=join(desktop,'Myynd'), deliverables=join(profile,'deliverables')
 const {mkdirSync}=await import('node:fs')
 mkdirSync(folder,{recursive:true});mkdirSync(deliverables,{recursive:true})
 const stored=join(deliverables,'Essay.pages'),published=join(folder,'Essay.pages')
 writeFileSync(stored,'stale generated source');writeFileSync(published,'published version')
 let appBody='A manual edit still open in Pages.'
 let font='Helvetica'
 const read=lettoreDocumento({profile:()=>profile,desktop:()=>desktop,platform:'darwin',hosted:false,run:async payload=>{
  const input=JSON.parse(readFileSync(payload,'utf8'))
  assert.equal(input.percorso,realpathSync(published))
  return JSON.stringify({...input,testo:appBody,stili:[{inizio:'A manual edit',font,dimensione:12,colore:'0,0,0'}],modificato:true})
 }})
 const before=await read({app:'Pages',percorso:stored,desktop:published})
 assert.equal(before.testo,appBody)
 assert.notEqual(before.testo,readFileSync(published,'utf8'))
 assert.equal(SCRIPT_LEGGI_DOCUMENTO.includes('app.save'),false)
 assert.equal(SCRIPT_LEGGI_DOCUMENTO.includes('app.close'),false)
 await verificaDocumentoInvariato(before,read)
 font='Georgia'
 await assert.rejects(verificaDocumentoInvariato(before,read),/changed/)
 font='Helvetica'
 writeFileSync(published,'published version with a saved font change')
 await assert.rejects(verificaDocumentoInvariato(before,read),/changed/)
 writeFileSync(published,'published version')
 appBody='Another unsaved manual edit.'
 await assert.rejects(verificaDocumentoInvariato(before,read),/changed/)
})

test('live Pages fixture readback sees an open edited body without itself saving or closing the fixture',
 {skip:process.platform!=='darwin'||process.env.MYYND_NATIVE_PAGES_TEST!=='1'},async()=>{
  const osascript=promisify(execFile)
  const fixture=await creaDocumento({app:'Pages',titolo:'Private unsaved readback fixture',testo:'Original body for the Pages readback fixture.'})
  const script=String.raw`function run(argv) {
    var app=Application('com.apple.iWork.Pages');
    var doc=app.open(Path(argv[0]));
    var body=doc.bodyText();
    doc.bodyText.set(String(body)+'\nA private unsaved Pages edit.');
    return JSON.stringify({body:String(doc.bodyText()),modified:Boolean(doc.modified())});
  }`
  try {
    const before=await leggiDocumentoAttuale(fixture)
    const changed=await osascript('/usr/bin/osascript',['-l','JavaScript','-e',script,fixture.percorso],{timeout:30_000})
    assert.match(changed.stdout,/private unsaved Pages edit/)
    const afterEdit=await leggiDocumentoAttuale(fixture)
    assert.match(afterEdit.testo,/private unsaved Pages edit/)
    await assert.rejects(verificaDocumentoInvariato(before),/changed/)
  } finally {
    // Only the fixture path created by this test; never any other open Pages document.
    const close=String.raw`function run(argv) {
      var app=Application('com.apple.iWork.Pages');
      var docs=app.documents();
      for(var i=docs.length-1;i>=0;i--) {
        var doc=app.documents[i];
        if(String(doc.name()).indexOf('Private unsaved readback fixture')>=0 &&
           String(doc.file()).indexOf('myynd-test-worker-')>=0)
          app.close(doc,{saving:'no'});
      }
    }`
    await osascript('/usr/bin/osascript',['-l','JavaScript','-e',close,fixture.percorso],{timeout:30_000}).catch(()=>{})
  }
 })

test('apriDocumento in una scena delle prove (MYYND_PROVA_NIENTE_OPEN=1) non lancia open: i controlli sul percorso restano, poi una riga nel registro', { skip: process.platform !== 'darwin' }, async () => {
  const { apriDocumento } = await import('./native-document.ts')
  const { cartella } = await import('./config.ts')
  const { mkdirSync } = await import('node:fs')
  const dir = join(cartella(), 'deliverables')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `prova-open-${process.pid}.rtf`)
  writeFileSync(file, '{\\rtf1 x}')
  const fuori = join(root, 'fuori.rtf')
  writeFileSync(fuori, '{\\rtf1 x}')
  const primaEnv = process.env.MYYND_PROVA_NIENTE_OPEN, log = console.log
  const righe: string[] = []
  process.env.MYYND_PROVA_NIENTE_OPEN = '1'
  console.log = (...a: unknown[]) => { righe.push(a.map(String).join(' ')) }
  try {
    await apriDocumento({ app: 'TextEdit', percorso: file })
    assert.equal(righe.length, 1)
    assert.ok(righe[0].startsWith('myynd · documento · open non eseguito (prova): -b com.apple.TextEdit ') && righe[0].endsWith(realpathSync(file)), righe[0])
    await assert.rejects(apriDocumento({ app: 'TextEdit', percorso: fuori }), /outside/)
    await assert.rejects(apriDocumento({ app: 'Pages', percorso: file }), /outside/)
    assert.equal(righe.length, 1, 'un percorso rifiutato non arriva al registro')
  } finally {
    console.log = log
    if (primaEnv === undefined) delete process.env.MYYND_PROVA_NIENTE_OPEN; else process.env.MYYND_PROVA_NIENTE_OPEN = primaEnv
    rmSync(file, { force: true })
  }
})
