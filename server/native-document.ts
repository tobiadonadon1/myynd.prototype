// A narrow native capability: model output is document data, never executable code.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, cpSync, realpathSync, readdirSync, createReadStream } from 'node:fs'
import { join, dirname, basename, sep } from 'node:path'
import { homedir } from 'node:os'
import { cartella } from './config.ts'
import { documentoImpaginato, strutturaDocumento, type StileDocumento } from './document-layout.ts'
import { OSPITATO } from './ospitato.ts'
import { openInProva } from './senza-open.ts'

export type DocumentoNativo = { app: 'Pages' | 'TextEdit'; titolo: string; testo: string; stile?: StileDocumento }
export type DocumentoCreato = { app: DocumentoNativo['app']; titolo: string; percorso: string; verificato: true; caratteri: number; desktop?: string; anteprima?: string; pagine?: number; immagini?: string[]; stile?: string }
export type StileParagrafoAttuale = {inizio:string;font:string;dimensione:number|null;colore:string}
export type DocumentoAttuale = { app: DocumentoNativo['app']; percorso: string; desktop?: string; testo: string; stili?:StileParagrafoAttuale[]; modificato?:boolean; improntaSalvata?:string; impronta: string }

/** Read a document's in-memory body. Opening an already open file returns its
 * existing document; this program never saves or closes it, including when it
 * has edits that have not reached disk. */
export const SCRIPT_LEGGI_DOCUMENTO = String.raw`
ObjC.import('Foundation');
function run(argv) {
  var raw = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null);
  if (!raw) throw new Error('Document input unavailable');
  var input = JSON.parse(ObjC.unwrap(raw));
  var app = input.app === 'Pages' ? Application('com.apple.iWork.Pages') :
    input.app === 'TextEdit' ? Application('com.apple.TextEdit') : null;
  if (!app) throw new Error('Unsupported document application');
  var doc = app.open(Path(input.percorso));
  if (!doc) throw new Error('Document unavailable');
  var body = input.app === 'Pages' ? doc.bodyText() : doc.text();
  var styles = [];
  if (input.app === 'Pages') {
    var paragraphs = doc.bodyText.paragraphs();
    if (paragraphs.length > 5000) throw new Error('Too many paragraphs to inspect safely');
    for (var i = 0; i < paragraphs.length; i++) {
      var p = doc.bodyText.paragraphs[i];
      styles.push({inizio:String(p()).slice(0,120),font:String(p.font()),dimensione:Number(p.size()),colore:String(p.color())});
    }
  }
  return JSON.stringify({app: input.app, percorso: input.percorso, testo: String(body), stili:styles, modificato:Boolean(doc.modified())});
}
`

// Fixed JXA program. Its sole argument names a private JSON file; no user/model
// string is interpolated into this program or passed to a shell.
export const SCRIPT_DOCUMENTO = String.raw`
ObjC.import('Foundation');
function run(argv) {
  var raw = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null);
  if (!raw) throw new Error('Document input unavailable');
  var input = JSON.parse(ObjC.unwrap(raw));
  var fm = $.NSFileManager.defaultManager;
  if (fm.fileExistsAtPath(input.percorso)) throw new Error('Destination already exists');
  var app;
  var doc;
  if (input.app === 'Pages') {
    app = Application('com.apple.iWork.Pages');
    doc = app.open(Path(input.sorgente));
  } else if (input.app === 'TextEdit') {
    app = Application('com.apple.TextEdit');
    doc = app.Document({text: input.testo}).make();
  } else { throw new Error('Unsupported document application'); }
  var saved = false;
  try {
    app.save(doc, {in: Path(input.percorso)});
    saved = fm.fileExistsAtPath(input.percorso);
    // TextEdit changes its document specifier after saving; reacquire by path.
    if (input.app === 'Pages') app.export(doc, {to: Path(input.anteprima), as: 'PDF'});
    var body = input.app === 'Pages' ? doc.bodyText() : app.documents.whose({path: input.percorso})[0].text();
    if (!saved) throw new Error('The app did not save the document');
    return JSON.stringify({app: input.app, percorso: input.percorso, testo: String(body)});
  } finally {
    // Only this newly created, saved working copy; never another open document.
    // Keep the file privately for review/recovery, including failed PDF export.
    if (saved) {
      if (input.app === 'Pages') app.close(doc, {saving: 'no'});
      else app.close(app.documents.whose({path: input.percorso})[0], {saving: 'no'});
    }
  }
}
`

type Esecutore = (input: string, signal?: AbortSignal) => Promise<string>
function esegui(input: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT_DOCUMENTO, input], {
      encoding: 'utf8', timeout: 90_000, maxBuffer: 2 * 1024 * 1024, signal,
    }, (error, stdout, stderr) => {
      if (error) {
        if (signal?.aborted) return reject(new Error('Document creation was cancelled. Check the app for a partial document.'))
        if (/(-1743|not authorized|not permitted)/i.test(stderr)) return reject(new Error('Allow Myynd to control the document app in System Settings → Privacy & Security → Automation, then retry.'))
        // Do not relay AppleScript diagnostics, which may contain private body text.
        return reject(new Error('The document app could not finish creating and saving the document. Check that it is installed and any open permission or welcome dialog is resolved.'))
      }
      resolve(stdout)
    })
  })
}

function pulisciTesto(value: string): string { return value.replace(/\s+/g, ' ').trim() }

/** Dependencies are injectable for deterministic tests; the production tool uses only creaDocumento. */
export function creatoreDocumento(deps: { directory: () => string; platform: string; hosted: boolean; run: Esecutore; render?: typeof renderDocumento }) {
  return async function crea(input: DocumentoNativo, signal?: AbortSignal): Promise<DocumentoCreato> {
    if (deps.hosted || deps.platform !== 'darwin') throw new Error('Native document creation requires the Myynd desktop app on a Mac.')
    if (!input || !['Pages', 'TextEdit'].includes(input.app)) throw new Error('Choose Pages or TextEdit for this document.')
    if (typeof input.titolo !== 'string' || !input.titolo.trim() || input.titolo.length > 200) throw new Error('Provide a document title of 1–200 characters.')
    if (typeof input.testo !== 'string' || !input.testo.trim() || input.testo.length > 200_000 || input.testo.includes('\0')) throw new Error('Provide the complete document text (up to 200,000 characters).')
    signal?.throwIfAborted()
    const base = join(deps.directory(), 'deliverables')
    if (existsSync(base) && !lstatSync(base).isDirectory()) throw new Error('The deliverables folder is unavailable.')
    mkdirSync(base, { recursive: true, mode: 0o700 })
    chmodSync(base, 0o700)
    // A new private directory reserves the destination, even for simultaneous
    // tasks with identical titles. Never replace an existing customer document.
    const folder = mkdtempSync(join(base, 'document-'))
    chmodSync(folder, 0o700)
    let nome = input.titolo.normalize('NFKC').replace(/[\x00-\x1f\x7f/\\:]/g, '-').replace(/^\.+/, '').trim().slice(0, 100) || 'Document'
    while (Buffer.byteLength(nome, 'utf8') > 180) nome = Array.from(nome).slice(0, -1).join('')
    const percorso = join(folder, `${nome}.${input.app === 'Pages' ? 'pages' : 'rtf'}`)
    const sorgente = join(folder, '.layout.docx')
    const anteprima = join(folder, 'Preview.pdf')
    if (input.app === 'Pages') writeFileSync(sorgente, await documentoImpaginato(input.titolo, input.testo, input.stile), {flag:'wx',mode:0o600})
    const payload = join(folder, '.input.json')
    writeFileSync(payload, JSON.stringify({ app: input.app, testo: input.testo, percorso, sorgente, anteprima }), { flag: 'wx', mode: 0o600 })
    try {
      const result = JSON.parse(await deps.run(payload, signal))
      if (signal?.aborted) throw new Error('Document creation was cancelled. A saved or partial document may remain in the app; cancellation does not delete it.')
      if (result.app !== input.app || result.percorso !== percorso || typeof result.testo !== 'string' || ![pulisciTesto(input.testo), pulisciTesto(strutturaDocumento(input.titolo,input.testo).map(b=>b.testo).join(' '))].includes(pulisciTesto(result.testo))) throw new Error('The document app did not confirm the complete requested text. The task is not complete.')
      if (!existsSync(percorso)) throw new Error('The document was not saved. The task is not complete.')
      const stat = lstatSync(percorso)
      if ((!stat.isFile() && !stat.isDirectory()) || (stat.isFile() && stat.size === 0)) throw new Error('The saved document could not be verified. The task is not complete.')
      // A saved file remains accessible even when its renderer is unavailable.
      // Missing images are explicitly an unavailable review, never a pass.
      let rendered: {pagine:number;immagini:string[]} | undefined
      if (input.app === 'Pages' && deps.render) {
        try { rendered = await deps.render(anteprima,signal) }
        catch { signal?.throwIfAborted() }
      }
      return { app: input.app, titolo: input.titolo.trim(), percorso, verificato: true, caratteri: input.testo.length, ...(input.app === 'Pages' ? {stile:input.stile?.nome || 'Editorial', ...(existsSync(anteprima) ? {anteprima} : {}), ...rendered} : {}) }
    } finally { rmSync(payload, { force: true }) }
  }
}

export const creaDocumento = creatoreDocumento({ directory: cartella, platform: process.platform, hosted: OSPITATO, run: esegui, render: renderDocumento })

type LettoreDocumento = (payload: string, signal?: AbortSignal) => Promise<string>
/** Content digest of the published package catches saved font/layout edits
 * even when bodyText is identical. Native package symlinks are refused. */
async function improntaPacchetto(path:string, signal?:AbortSignal):Promise<string> {
  const hash=createHash('sha256')
  let bytes=0,items=0
  const walk=async (current:string,relative:string):Promise<void>=>{
    signal?.throwIfAborted()
    const stat=lstatSync(current)
    if (stat.isSymbolicLink()) throw new Error('The current document package has redirected content.')
    if (++items>20_000) throw new Error('The current document package has too many files to verify.')
    hash.update(relative+'\0'+(stat.isDirectory()?'d':'f')+'\0')
    if (stat.isDirectory()) {
      for (const name of readdirSync(current).sort()) await walk(join(current,name),relative+'/'+name)
    } else if (stat.isFile()) {
      bytes+=stat.size
      if (bytes>500_000_000) throw new Error('The current document is too large to verify safely.')
      for await (const chunk of createReadStream(current)) {signal?.throwIfAborted();hash.update(chunk as Buffer)}
    } else throw new Error('The current document package contains unsupported content.')
  }
  await walk(path,'')
  return hash.digest('hex')
}
function eseguiLettura(payload: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT_LEGGI_DOCUMENTO, payload],
    {encoding:'utf8', timeout:30_000, maxBuffer:2*1024*1024, signal}, (error, stdout, stderr) => {
      if (error) return reject(new Error(/(-1743|not authorized|not permitted)/i.test(stderr)
        ? 'Allow Myynd to read the document app in System Settings → Privacy & Security → Automation, then retry.'
        : 'The current document could not be read from its app. Check that the file is available and any open dialog is resolved.'))
      resolve(stdout)
    }))
}

/** A current artifact snapshot, from the published Desktop copy when one
 * exists. The body is read through the native app so unsaved edits count. */
export function lettoreDocumento(deps: {profile:()=>string; desktop:()=>string; platform:string; hosted:boolean; run:LettoreDocumento}) {
  return async (consegna: Pick<DocumentoCreato,'app'|'percorso'|'desktop'>, signal?:AbortSignal):Promise<DocumentoAttuale> => {
    if (deps.hosted || deps.platform !== 'darwin') throw new Error('Reading current document edits requires the Myynd desktop app on a Mac.')
    signal?.throwIfAborted()
    const source = consegna.desktop || consegna.percorso
    const file = realpathSync(source)
    const profileRoot = realpathSync(join(deps.profile(),'deliverables'))
    const desktopRoot = join(deps.desktop(),'Myynd')
    const allowedDesktop = consegna.desktop && existsSync(desktopRoot) && !lstatSync(desktopRoot).isSymbolicLink()
      && file.startsWith(realpathSync(desktopRoot)+sep)
    const ext = consegna.app === 'Pages' ? '.pages' : consegna.app === 'TextEdit' ? '.rtf' : ''
    if ((!file.startsWith(profileRoot+sep) && !allowedDesktop) || !ext || !file.endsWith(ext)) throw new Error('The current document is outside this account’s deliverables.')
    const folder = mkdtempSync(join(deps.profile(),'document-read-'))
    chmodSync(folder,0o700)
    const payload = join(folder,'input.json')
    writeFileSync(payload,JSON.stringify({app:consegna.app,percorso:file}),{flag:'wx',mode:0o600})
    try {
      const out = JSON.parse(await deps.run(payload,signal)) as {app?:string;percorso?:string;testo?:unknown;stili?:unknown;modificato?:unknown}
      if (out.app !== consegna.app || out.percorso !== file || typeof out.testo !== 'string' || out.testo.length > 200_000 || out.testo.includes('\0')) throw new Error('The document app did not return a valid current body.')
      const styles=out.stili
      if (styles != null && (!Array.isArray(styles) || styles.length>5000 || !styles.every(s=>s && typeof s.inizio==='string' && s.inizio.length<=120 && typeof s.font==='string' && s.font.length<=200 && (s.dimensione===null || typeof s.dimensione==='number' && Number.isFinite(s.dimensione)) && typeof s.colore==='string' && s.colore.length<=200))) throw new Error('The document app did not return valid paragraph styles.')
      const saved=await improntaPacchetto(file,signal)
      const modified=typeof out.modificato==='boolean'?out.modificato:undefined
      const impression=createHash('sha256').update(JSON.stringify({app:consegna.app,path:file,testo:out.testo,stili:styles??[],modificato:modified??null,salvata:saved})).digest('hex')
      return {app:consegna.app,percorso:file,...(consegna.desktop ? {desktop:file}:{}),testo:out.testo,...(styles?{stili:styles as StileParagrafoAttuale[]}:{}),...(modified!==undefined?{modificato:modified}:{}),improntaSalvata:saved,impronta:impression}
    } finally {rmSync(folder,{recursive:true,force:true})}
  }
}
export const leggiDocumentoAttuale = lettoreDocumento({profile:cartella,desktop:()=>join(homedir(),'Desktop'),platform:process.platform,hosted:OSPITATO,run:eseguiLettura})
export async function verificaDocumentoInvariato(prima:DocumentoAttuale, leggi = leggiDocumentoAttuale):Promise<void> {
  const ora = await leggi(prima)
  if (ora.impronta !== prima.impronta) throw new Error('The document changed in its app while this revision was prepared. Read the current version and revise again before publishing.')
}

/** Reopen only a stored artifact within this account's deliverables folder. */
export async function apriDocumento(consegna: Pick<DocumentoCreato, 'app' | 'percorso' | 'anteprima' | 'desktop'>, preview = false): Promise<void> {
  if (OSPITATO || process.platform !== 'darwin') throw new Error('Open this document in the Myynd desktop app on a Mac.')
  const { realpath } = await import('node:fs/promises')
  const { sep } = await import('node:path')
  const root = await realpath(join(cartella(), 'deliverables'))
  const file = await realpath(preview ? consegna.anteprima || '' : consegna.desktop || consegna.percorso)
  const app = consegna.app === 'Pages' ? 'com.apple.iWork.Pages' : consegna.app === 'TextEdit' ? 'com.apple.TextEdit' : null
  const ext = preview ? '.pdf' : consegna.app === 'Pages' ? '.pages' : '.rtf'
  const desktopRoot = join(homedir(), 'Desktop', 'Myynd')
  const allowedDesktop = !preview && consegna.desktop && existsSync(desktopRoot) && !lstatSync(desktopRoot).isSymbolicLink() && file.startsWith(realpathSync(desktopRoot) + sep)
  if (!app || (!file.startsWith(root + sep) && !allowedDesktop) || !file.endsWith(ext)) throw new Error('The saved document is outside this account’s deliverables folder.')
  const argomenti = preview ? [file] : ['-b', app, file]
  if (openInProva('documento', argomenti)) return
  await new Promise<void>((resolve, reject) => execFile('/usr/bin/open', argomenti, { timeout: 15_000 }, error => error ? reject(new Error('The document could not be opened.')) : resolve()))
}

/** Render the exported Pages PDF, not a separate approximation of the layout. */
export async function renderDocumento(pdf: string, signal?: AbortSignal): Promise<{pagine:number; immagini:string[]}> {
  signal?.throwIfAborted()
  const { Worker } = await import('node:worker_threads')
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL('./document-render.worker.ts',import.meta.url),{workerData:{pdf}})
    let settled = false
    const finish = (error?:Error, result?:{pagine:number;immagini:string[]}) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort',abort)
      void worker.terminate()
      if (error) reject(error); else resolve(result!)
    }
    const abort = () => finish(new Error('Document preview was cancelled.'))
    const timer = setTimeout(() => finish(new Error('Document preview exceeded its time limit. The saved document needs review.')),60_000)
    signal?.addEventListener('abort',abort,{once:true})
    worker.once('error',e=>finish(e instanceof Error ? e : new Error(String(e))))
    worker.once('exit',code=>{if(!settled)finish(new Error(`Document preview stopped before verification (${code}).`))})
    worker.once('message',m=>m.ok ? finish(undefined,{pagine:m.pagine,immagini:m.immagini}) : finish(new Error(m.errore)))
    if(signal?.aborted)abort()
  })
}


/** Publish only a reviewed delivery, never provisional drafts. Existing files are preserved. */
export function pubblicaDocumentoDesktop(doc: DocumentoCreato, options: {profile?:string; desktop?:string} = {}): string {
  if (OSPITATO || process.platform !== 'darwin') throw new Error('Desktop delivery requires a Mac.')
  const root = realpathSync(join(options.profile ?? cartella(),'deliverables'))
  const source = realpathSync(doc.percorso)
  if (!source.startsWith(root+sep) || !/\.(pages|rtf)$/.test(source)) throw new Error('Invalid document delivery.')
  const targetRoot = join(options.desktop ?? join(homedir(),'Desktop'),'Myynd')
  if (existsSync(targetRoot) && (!lstatSync(targetRoot).isDirectory() || lstatSync(targetRoot).isSymbolicLink())) throw new Error('The Myynd desktop folder is unavailable.')
  mkdirSync(targetRoot,{recursive:true,mode:0o700})
  const ext=doc.app === 'Pages' ? '.pages' : '.rtf'
  const name=basename(source,ext)
  const target=join(targetRoot,`${name}-${basename(dirname(source)).slice(-6)}${ext}`)
  cpSync(source,target,{recursive:true,force:false,errorOnExist:true})
  return target
}
