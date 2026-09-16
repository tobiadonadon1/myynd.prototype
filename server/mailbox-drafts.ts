/** Publish unsent mailbox drafts, never messages. A durable reservation prevents
 * duplicate creation after an ambiguous network response or process crash. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as cfg from './config.ts'
import * as google from './connettori/google.ts'
import * as posta from './connettori/posta.ts'
import type { EmailPronta } from './store.ts'
import type { Compito } from './store.ts'

export type BozzaCasella = { stato: 'salvata' | 'errore'; id?: string; url?: string; errore?: string }
export type BozzaAttuale = {stato:'presente'|'sparita';source:string;id:string;corpo?:string;oggetto?:string;a?:string;messageId?:string;uidValidity?:string;impronta?:string}
type Leggi = (source:string,id:string)=>Promise<{stato:'presente'|'sparita';corpo?:string;oggetto?:string;a?:string;messageId?:string;uidValidity?:string}>
async function leggi(source:string,id:string) {
  if (source.startsWith('google:')) return google.leggiBozza(id)
  if (source.startsWith('posta:')) {
    const c = cfg.leggi().posta
    if (!c) throw new Error('Reconnect your email account to read the saved draft.')
    return posta.leggiBozza(c,id)
  }
  throw new Error('This mailbox draft cannot be read back from its provider.')
}
/** Read the provider's current draft, rather than Myynd's old generated body. */
export async function leggiBozzaAttuale(source:string, casella:BozzaCasella, read:Leggi=leggi):Promise<BozzaAttuale> {
  if (casella.stato !== 'salvata' || !casella.id || !source) throw new Error('The saved mailbox draft has no verifiable identity.')
  const current = await read(source,casella.id)
  if (current.stato === 'sparita') return {stato:'sparita',source,id:casella.id}
  if (current.stato !== 'presente' || typeof current.corpo !== 'string' || typeof current.oggetto !== 'string' || typeof current.a !== 'string') throw new Error('The mailbox did not return a valid current draft.')
  const body = {source,id:casella.id,corpo:current.corpo,oggetto:current.oggetto,a:current.a,messageId:current.messageId ?? '',...(current.uidValidity?{uidValidity:current.uidValidity}:{})}
  return {stato:'presente',...body,impronta:createHash('sha256').update(JSON.stringify(body)).digest('hex')}
}
export async function verificaBozzaInvariata(prima:BozzaAttuale, get:typeof leggiBozzaAttuale=leggiBozzaAttuale):Promise<void> {
  if (prima.stato !== 'presente') throw new Error('The previous mailbox draft was removed or sent. Review the current thread before revising it.')
  const now = await get(prima.source,{stato:'salvata',id:prima.id})
  if (now.stato !== 'presente' || now.impronta !== prima.impronta) throw new Error('The mailbox draft changed or disappeared while this revision was prepared. Read the current draft and revise again before saving.')
}
export function mimeBozza(da: string, e: Pick<EmailPronta, 'a' | 'oggetto' | 'corpo' | 'rispondeA'>, messageId: string): string {
  if (![da, e.a, e.oggetto, messageId, e.rispondeA?.messageId ?? '', ...(e.rispondeA?.references ?? [])].every(s => !/[\r\n]/.test(s))) throw new Error('Invalid email header.')
  const refs = [...new Set([...(e.rispondeA?.references ?? []), e.rispondeA?.messageId].filter(Boolean))].map(s => `<${s!.replace(/[<>]/g, '')}>`).join(' ')
  return [`From: ${da}`, `To: ${e.a}`, `Subject: =?UTF-8?B?${Buffer.from(e.oggetto).toString('base64')}?=`, `Message-ID: <${messageId}>`,
    ...(e.rispondeA?.messageId ? [`In-Reply-To: <${e.rispondeA.messageId.replace(/[<>]/g, '')}>`, `References: ${refs}`] : []),
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(e.corpo).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? ''].join('\r\n')
}
export function indirizzo(s: string): string { return (s.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '').toLowerCase() }
export function destinatarioVerificato(atteso: string, header: string) {
  if (!indirizzo(atteso) || indirizzo(atteso) !== atteso.trim().toLowerCase() || indirizzo(atteso) !== indirizzo(header)) throw new Error('The draft recipient does not match the original email. Review it before saving.')
}
const occupati = new Map<string, Promise<BozzaCasella>>()
type Crea = (source: string, email: EmailPronta, messageId: string) => Promise<{ id: string; url: string }>
async function crea(source: string, e: EmailPronta, messageId: string) {
  if (source.startsWith('google:')) return google.salvaBozza(source.slice(7), e, messageId)
  if (source.startsWith('posta:')) {
    const c = cfg.leggi().posta
    if (!c) throw new Error('Reconnect your email account to save drafts.')
    return posta.salvaBozza(c, source, e, messageId)
  }
  if (source.startsWith('microsoft:')) throw new Error('Your Outlook connection is read-only. Saving mailbox drafts needs Mail.ReadWrite; this connection cannot save drafts yet.')
  throw new Error('This email source cannot save mailbox drafts yet.')
}
export async function salvaBozzaCasella(task: string, source: string, e: EmailPronta, create: Crea = crea, profile = cfg.cartella()): Promise<BozzaCasella> {
  const key = createHash('sha256').update(task + '\n' + source).digest('hex')
  const lock = profile + key
  if (occupati.has(lock)) return occupati.get(lock)!
  const run = (async (): Promise<BozzaCasella> => {
    const dir = join(profile, 'mailbox-drafts'); mkdirSync(dir, { recursive: true, mode: 0o700 })
    const path = join(dir, key + '.json')
    if (existsSync(path)) {
      const saved = JSON.parse(readFileSync(path, 'utf8')) as BozzaCasella
      return saved.stato === 'salvata' ? saved : { stato: 'errore', errore: 'A previous mailbox save is uncertain. Check Drafts before trying again; Myynd will not create a duplicate.' }
    }
    // Reserve before any request. Never retry a potentially successful POST.
    writeFileSync(path, JSON.stringify({ stato: 'errore' }), { mode: 0o600, flag: 'wx' })
    try {
      const result: BozzaCasella = { stato: 'salvata', ...await create(source, e, `myynd-${key}@draft.myynd.local`) }
      writeFileSync(path + '.tmp', JSON.stringify(result), { mode: 0o600 }); renameSync(path + '.tmp', path)
      return result
    } catch (err) { return { stato: 'errore', errore: err instanceof Error ? err.message : String(err) } }
  })()
  occupati.set(lock, run)
  try { return await run } finally { occupati.delete(lock) }
}

type Aggiorna = (source:string,oldId:string,e:EmailPronta,messageId:string,baseline:BozzaAttuale)=>Promise<{id:string;url:string}>
async function aggiorna(source:string,oldId:string,e:EmailPronta,messageId:string,baseline:BozzaAttuale) {
  if (source.startsWith('google:')) return google.aggiornaBozza(source.slice(7),oldId,e,messageId,baseline)
  if (source.startsWith('posta:')) {
    const c=cfg.leggi().posta
    if (!c) throw new Error('Reconnect your email account to revise its draft.')
    return posta.aggiornaBozza(c,source,oldId,e,messageId,baseline)
  }
  throw new Error('This mailbox does not support safe draft revision.')
}
/** Update one exact provider draft for a revision. The journal prevents a
 * retry after an ambiguous PUT/APPEND response; manual edits are checked
 * again immediately before any provider mutation. */
export async function salvaRevisioneCasella(c:Pick<Compito,'id'|'madre'|'doc'|'nota'>,e:EmailPronta,
  update:Aggiorna=aggiorna, get:typeof leggiBozzaAttuale=leggiBozzaAttuale, profile=cfg.cartella()):Promise<BozzaCasella> {
  if (!c.madre || !c.doc) throw new Error('A mailbox revision needs its original task and email source.')
  const marker=c.nota?.match(/(?:^|\n)REVISION BASELINE: (\{[^\n]+\})/)
  if (!marker) throw new Error('The mailbox revision has no current draft baseline.')
  const base=JSON.parse(marker[1]) as {tipo?:string;source?:string;id?:string;impronta?:string;messageId?:string;uidValidity?:string}
  if (base.tipo !== 'bozza' || base.source !== c.doc || !base.id || !base.impronta) throw new Error('The mailbox revision does not match its saved provider draft.')
  const snapshot:BozzaAttuale={stato:'presente',source:base.source,id:base.id,impronta:base.impronta,messageId:base.messageId,uidValidity:base.uidValidity}
  const key=createHash('sha256').update('revision\n'+c.id+'\n'+c.doc+'\n'+base.id).digest('hex')
  const lock=profile+key
  if (occupati.has(lock)) return occupati.get(lock)!
  const run=(async():Promise<BozzaCasella>=>{
    const dir=join(profile,'mailbox-drafts');mkdirSync(dir,{recursive:true,mode:0o700})
    const path=join(dir,key+'.json')
    if (existsSync(path)) {
      const saved=JSON.parse(readFileSync(path,'utf8')) as BozzaCasella
      return saved.stato==='salvata' ? saved : {stato:'errore',errore:'A previous draft revision is uncertain. Check Drafts before trying again; Myynd will not create a duplicate.'}
    }
    await verificaBozzaInvariata(snapshot,get)
    writeFileSync(path,JSON.stringify({stato:'errore'}),{mode:0o600,flag:'wx'})
    try {
      const result=await update(c.doc!,base.id!,e,`myynd-${key}@draft.myynd.local`,snapshot)
      if (!result.id || !result.url) throw new Error('The mailbox did not confirm the revised draft identity.')
      const saved:BozzaCasella={stato:'salvata',...result}
      writeFileSync(path+'.tmp',JSON.stringify(saved),{mode:0o600});renameSync(path+'.tmp',path)
      return saved
    } catch(err) {return {stato:'errore',errore:err instanceof Error?err.message:String(err)}}
  })()
  occupati.set(lock,run)
  try {return await run} finally {occupati.delete(lock)}
}
