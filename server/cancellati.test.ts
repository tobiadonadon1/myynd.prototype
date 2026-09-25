// Cancellare un conto a metà lettura: la lettura in volo non ricrea niente.
//
// Il caso vero: una casella lenta, «Elimina il conto» premuto mentre scarica,
// e i messaggi che arrivano dopo. Scriverli apriva l'indice, cioè ricreava la
// cartella con dentro la posta di chi se n'era appena andato.
//
//   node --test server/cancellati.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ImapFlow } from 'imapflow'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-cancellati-'))
process.env.MYYND_DATI = CASA
process.env.MYYND_REGISTRAZIONE = 'aperta'
const conti = await import('./conti.ts')
const cfg = await import('./config.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const addio = await import('./addio.ts')
const imbuto = await import('./imbuto.ts')
const cancellati = await import('./cancellati.ts')
const posta = await import('./connettori/posta.ts')

let lascia: () => void = () => {}
/** Una casella che risponde solo quando la si lascia andare. */
function casellaLenta(): ImapFlow {
  const grezzo = 'From: Rossi <rossi@esempio.it>\r\nSubject: Ultima\r\nDate: Wed, 23 Sep 2026 10:00:00 +0200\r\nMessage-ID: <u1@esempio.it>\r\n\r\nIl corpo della mail che arriva tardi.\r\n'
  return {
    connect: async () => {}, close: async () => {}, logout: async () => {},
    list: async () => [{ path: 'INBOX', name: 'INBOX', specialUse: undefined }],
    get mailbox() { return { uidValidity: 1n } },
    getMailboxLock: async () => ({ release: () => {} }),
    search: async () => { await new Promise<void>(r => { lascia = r }); return [1] },
    fetch: () => (async function* () { yield { uid: 1, flags: new Set<string>(), source: Buffer.from(grezzo), envelope: { date: new Date() } } })()
  } as unknown as ImapFlow
}

before(async () => { await conti.avvia() })
after(() => { posta.usaClient(null); store.chiudiIndici(); cancellati.dimentica(); rmSync(CASA, { recursive: true, force: true }) })

test('cancellato mentre la posta scarica: niente cartella, niente config.json, niente imbuto.json', async () => {
  const a = await conti.registra('lenta@esempio.it', 'passwordlunga1')
  assert.ok(a.ok)
  const id = a.ok ? a.id : ''
  const dove = cfg.cartellaDi(id)
  const c = { host: 'imap.esempio.it', porta: 993, utente: 'lenta@esempio.it', password: 'x', cartelle: ['INBOX'] }
  chi.dentro(id, () => {
    cfg.aggiorna({ posta: c })
    imbuto.nasce()
    store.salvaDocumenti([{ id: 'posta:INBOX:0', fonte: 'posta', tipo: 'email', titolo: 'prima', corpo: 'già dentro', quando: new Date().toISOString() }])
  })
  assert.ok(existsSync(join(dove, 'imbuto.json')))
  posta.usaClient(() => casellaLenta())
  // la lettura parte, come farebbe il blocco della posta
  const lettura = chi.dentro(id, async () => {
    const e = await posta.sincronizza(c)
    const guai: string[] = []
    for (const scrivi of [
      () => store.salvaDocumenti(e.docs),
      () => cfg.aggiorna({ posta: { ...c, validita: e.validita } }),
      () => imbuto.controlla()
    ]) { try { scrivi() } catch (x) { guai.push(x instanceof Error ? x.message : String(x)) } }
    return guai
  })
  await new Promise(r => setTimeout(r, 20))
  await addio.cancella(id)
  assert.equal(existsSync(dove), false)
  lascia()
  const guai = await lettura
  assert.ok(guai.every(g => g === cancellati.CONTO_CANCELLATO), guai.join(' | '))
  assert.ok(guai.length >= 2, 'l’indice e la configurazione si sono rifiutati')
  assert.equal(existsSync(dove), false, 'la cartella non è rinata')
  assert.equal(existsSync(join(dove, 'config.json')), false)
  assert.equal(existsSync(join(dove, 'imbuto.json')), false)
})

test('un altro conto, intanto, scrive come sempre (counter-case)', async () => {
  const b = await conti.registra('viva@esempio.it', 'passwordlunga2')
  assert.ok(b.ok)
  const id = b.ok ? b.id : ''
  chi.dentro(id, () => {
    cfg.aggiorna({ nome: 'Viva' })
    store.salvaDocumenti([{ id: 'x:1', fonte: 'desktop', tipo: 'testo', titolo: 'x', corpo: 'x', quando: null }])
    assert.equal(store.conteggi().totale, 1)
  })
  assert.ok(existsSync(join(cfg.cartellaDi(id), 'config.json')))
})
