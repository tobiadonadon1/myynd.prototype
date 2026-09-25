// Le rotte del feed con l'asticella (P2), provate fuori dal processo:
// «Non utile» con la ragione, le carte viste (senza evento sul filo), la
// misura, e «fatto» che sa se ha già risposto dalla posta.
//
//   node --test server/feed-rotte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const casa = mkdtempSync(join(tmpdir(), 'myynd-feed-rotte-'))
process.env.MYYND_DATI = casa
const home = join(casa, 'casa-finta')
mkdirSync(join(home, 'Documents'), { recursive: true })
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')

let servizio: ChildProcess | undefined
let base = ''
const token = 'feed-rotte-token-di-prova'
let utente = ''
const ids: Record<string, string> = {}

function porta(p: ChildProcess): Promise<string> {
  return new Promise((ok, no) => {
    const scade = setTimeout(() => no(new Error('il server non è partito')), 20000)
    let fuori = ''
    p.stdout!.on('data', c => {
      fuori += String(c)
      const m = fuori.match(/server su http:\/\/127\.0\.0\.1:(\d+)/)
      if (m) { clearTimeout(scade); ok(m[1]) }
    })
    p.on('exit', code => { clearTimeout(scade); no(new Error(`il server è uscito ${code}`)) })
    p.on('error', no)
  })
}

const ORA = 3_600_000
const fa = (ore: number) => new Date(Date.now() - ore * ORA).toISOString()

before(async () => {
  const account = await conti.registra('feed-rotte@esempio.test', 'parola-di-prova-lunga')
  assert.ok(account.ok)
  utente = account.id
  await conti.perProva.apriCon(token, account.id)
  chi.dentro(account.id, () => {
    cfg.scrivi({ lingua: 'en', diSerie: false, onboarding: true, giro: true, desktop: { cartelle: [join(home, 'Documents')], scelte: true } })
    store.salvaDocumenti([
      { id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'Logo files', corpo: 'Can you send me the logo files?', autore: 'Leo <leo@studio.example>', quando: fa(4), percorso: 'INBOX', messageId: 'leo1@ex', filo: 'leo1@ex' },
      { id: 'posta:Sent:1', fonte: 'posta', tipo: 'email', titolo: 'Re: Logo files', corpo: 'Here are the logo files.', autore: 'Alex <alex@northwind.example>', quando: fa(1), percorso: 'Sent', inviato: true, risponde: 'leo1@ex', destinatari: 'leo@studio.example', filo: 'leo1@ex', messageId: 's1@ex' },
      { id: 'posta:INBOX:2', fonte: 'posta', tipo: 'email', titolo: 'Pilot scope', corpo: 'Can you confirm the pilot scope?', autore: 'Nora <nora@harbor.example>', quando: fa(2), percorso: 'INBOX', messageId: 'nora2@ex', filo: 'nora2@ex' }
    ])
    store.salvaFeed([
      { tipo: 'Da decidere', titolo: 'Send Leo the logo files', testo: 'Leo is waiting on the files.', perche: 'Leo is waiting on the files to finish the site.', fonte: 'posta', doc: 'posta:INBOX:1' },
      { tipo: 'Da decidere', titolo: 'Confirm the pilot scope with Nora', testo: 'Nora asks you to confirm the pilot scope.', perche: 'Nora waits for the scope.', fonte: 'posta', doc: 'posta:INBOX:2' },
      { tipo: 'Da decidere', titolo: 'A card to dismiss', testo: 'Something that is not useful at all.', perche: 'Nobody waits for this.', fonte: 'posta' },
      { tipo: 'Da decidere', titolo: 'A card for the list', testo: 'Something that goes to the list.', perche: 'It goes to the list.', fonte: 'posta' },
      { tipo: 'Da decidere', titolo: 'A card to see', testo: 'Something he will look at.', perche: 'He looks at it.', fonte: 'posta' }
    ])
    for (const v of store.elencoFeed('aperto')) ids[v.titolo] = v.id
  })
  store.chiudiIndici()
  servizio = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: home, MYYND_DATI: casa, MYYND_PORT: '0', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe']
  })
  base = `http://127.0.0.1:${await porta(servizio)}`
})

after(async () => {
  if (servizio && servizio.exitCode === null) {
    const spento = new Promise<void>(r => servizio!.once('exit', () => r()))
    servizio.kill('SIGTERM')
    await spento
  }
  store.chiudiIndici()
  rmSync(casa, { recursive: true, force: true })
})

const chiama = (via: string, metodo = 'GET', corpo?: unknown) => fetch(`${base}${via}`, {
  method: metodo, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo)
})
const riga = (id: string) => chi.dentro(utente, () => store.voceFeed(id))

test('«Non utile» con una ragione: la carta si chiude con la ragione; una ragione sconosciuta è un errore tradotto', async () => {
  const id = ids['A card to dismiss']
  const r = await chiama(`/api/feed/${encodeURIComponent(id)}/rispondi`, 'POST', { testo: '', stato: 'scartato', ragione: 'vecchia' })
  assert.equal(r.status, 200)
  const e = await r.json() as { stato: string; motivo: string }
  assert.equal(e.stato, 'scartato')
  assert.equal(e.motivo, 'Vecchia: non vale più.')
  assert.equal(riga(id)?.ragione, 'vecchia')
  const male = await chiama(`/api/feed/${encodeURIComponent(id)}/rispondi`, 'POST', { testo: '', stato: 'scartato', ragione: 'boh' })
  assert.equal(male.status, 500)
  assert.equal((await male.json() as { errore: string }).errore, 'Ragione sconosciuta.')
  // «Annulla»: riaperta, senza ragione
  const annulla = await chiama(`/api/feed/${encodeURIComponent(id)}/aperto`, 'POST')
  assert.equal(annulla.status, 200)
  assert.equal(riga(id)?.stato, 'aperto')
  assert.equal(riga(id)?.ragione, null)
  assert.equal(riga(id)?.motivo, '')
})

test('«fatto» scrive «fuori» se ha già risposto dalla posta, «lui» altrimenti; qualunque altra parola è uno stato sconosciuto', async () => {
  const leo = ids['Send Leo the logo files'], nora = ids['Confirm the pilot scope with Nora']
  // la pagina lo dice: risposta, e ancora aperta
  const feed = await (await chiama('/api/feed')).json() as { aperti: { id: string; risposta: string | null; stato: string }[] }
  const l = feed.aperti.find(v => v.id === leo)!
  assert.ok(l.risposta, 'la carta di Leo non dice che ha risposto')
  assert.equal(l.stato, 'aperto')
  assert.equal(feed.aperti.find(v => v.id === nora)!.risposta, null)
  assert.equal((await chiama(`/api/feed/${encodeURIComponent(leo)}/fatto`, 'POST')).status, 200)
  assert.deepEqual([riga(leo)?.stato, riga(leo)?.ragione, riga(leo)?.motivo], ['fatto', 'fuori', 'Hai risposto dalla posta.'])
  assert.equal((await chiama(`/api/feed/${encodeURIComponent(nora)}/fatto`, 'POST')).status, 200)
  assert.deepEqual([riga(nora)?.stato, riga(nora)?.ragione, riga(nora)?.motivo], ['fatto', 'lui', 'Già fatto.'])
  const tocco = await chiama(`/api/feed/${encodeURIComponent(nora)}/tocco`, 'POST')
  assert.equal(tocco.status, 400)
  assert.equal((await tocco.json() as { errore: string }).errore, 'Stato sconosciuto.')
  assert.equal(riga(nora)?.stato, 'fatto', 'uno stato sconosciuto ha toccato la carta')
})

test('una carta passata nella lista vale «lista»', async () => {
  const id = ids['A card for the list']
  const r = await chiama('/api/compiti', 'POST', { testo: 'A card for the list', voce: id })
  assert.equal(r.status, 200)
  assert.deepEqual([riga(id)?.stato, riga(id)?.ragione, riga(id)?.motivo], ['fatto', 'lista', 'Passata nella lista.'])
})

test('le carte viste: una volta, solo le aperte, al massimo cinquanta, mai senza un elenco, e nessun evento sul filo', async () => {
  const id = ids['A card to see']
  const chiuso = ids['A card for the list']
  // il filo dei compiti: nessun «feed» deve arrivare da questa rotta
  const eventi: string[] = []
  const abort = new AbortController()
  const filo = fetch(`${base}/api/compiti/flusso`, { headers: { authorization: `Bearer ${token}` }, signal: abort.signal }).then(async r => {
    const lettore = r.body!.getReader()
    const dec = new TextDecoder()
    try { for (;;) { const { value, done } = await lettore.read(); if (done) break; eventi.push(dec.decode(value)) } } catch { /* chiuso da noi */ }
  })
  await new Promise(r => setTimeout(r, 300))
  const male = await chiama('/api/feed/viste', 'POST', { ids: 'x' })
  assert.equal(male.status, 400)
  assert.equal((await male.json() as { errore: string }).errore, 'Mancano le voci.')
  const tanti = Array.from({ length: 70 }, (_, i) => `finta-${i}`)
  const r = await chiama('/api/feed/viste', 'POST', { ids: [id, id, chiuso, 'x'.repeat(65), ...tanti] })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { ok: true, segnate: 1 })
  const prima = riga(id)?.vista
  assert.ok(prima)
  assert.equal(riga(chiuso)?.vista, null, 'una carta chiusa non si segna vista')
  const di_nuovo = await chiama('/api/feed/viste', 'POST', { ids: [id] })
  assert.deepEqual(await di_nuovo.json(), { ok: true, segnate: 0 })
  assert.equal(riga(id)?.vista, prima, 'la vista si scrive una volta sola')
  await new Promise(r => setTimeout(r, 600))
  abort.abort()
  await filo
  assert.ok(!eventi.some(e => /"fase":"feed"/.test(e)), `un evento «feed» è partito da /api/feed/viste: ${eventi.join(' ')}`)
})

test('la misura dalla rotta è quella del modulo, sui giorni chiesti', async () => {
  const misuraFeed = await import('./misura-feed.ts')
  await misuraFeed.caricaModuli()
  const r = await chiama('/api/feed/misura?giorni=7')
  assert.equal(r.status, 200)
  const m = await r.json() as { giorni: number; carte: { viste: number; agite: number; fuori: number }; precisione: number | null }
  assert.equal(m.giorni, 7)
  const mia = chi.dentro(utente, () => misuraFeed.misura(7))
  assert.deepEqual([m.carte.viste, m.carte.agite, m.carte.fuori, m.precisione], [mia.carte.viste, mia.carte.agite, mia.carte.fuori, mia.precisione])
  assert.ok(m.carte.viste >= 3, 'le tre carte chiuse da lui, e quella vista, sono viste')
  const senza = await (await chiama('/api/feed/misura?giorni=abc')).json() as { giorni: number }
  assert.equal(senza.giorni, 14)
  const tetto = await (await chiama('/api/feed/misura?giorni=500')).json() as { giorni: number }
  assert.equal(tetto.giorni, 90)
})
