// Le fonti chieste in chat: il riconoscimento, il racconto, e il filo fino
// alla rilettura. Niente modello: è tutto deterministico apposta.
//
//   node --test server/fonti-in-chat.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-fonti-in-chat-'))
process.env.MYYND_DATI = casa
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const fonti = await import('./fonti-in-chat.ts')
const lettura = await import('./lettura-feed.ts')
const claude = await import('./claude.ts')
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })

test('le frasi sulle fonti si riconoscono, nelle due lingue, e si distingue chi chiede di rileggere', () => {
  const stato = ['my sources', 'My sources?', 'what sources', 'which sources are connected?', 'how many documents', 'how many documents do you have?',
    'le mie fonti', 'quante fonti', 'quali fonti hai collegato?', 'what have you read?', 'cosa hai letto finora?', 'status of my sources',
    'what is connected?', 'cosa hai collegato?', 'show me my sources', 'Hey Myynd, which sources do you have?']
  for (const f of stato) assert.deepEqual(fonti.richiestaSulleFonti(f), { rileggi: false }, f)
  const rileggi = ['read my sources', 'check the sources', 'leggi le fonti', 'rileggi le mie fonti', 'can you reread my sources?', 'aggiorna le fonti',
    'please read my sources again', 'sync all my sources now', 'read my sources and tell me what\'s new', 'puoi leggere le mie fonti?']
  for (const f of rileggi) assert.deepEqual(fonti.richiestaSulleFonti(f), { rileggi: true }, f)
})

test('una frase che contiene «fonti» dentro un\'altra domanda non si intercetta: le fonti devono essere il soggetto', () => {
  const no = ['what does the source say about X?', 'which sources mention Rossi?', 'find the invoice in my sources', 'is the contract in my sources?',
    'how many documents did Rossi send?', 'summarise the sources of the contract', 'cosa dice la fonte su Rossi?', 'quali fonti parlano del preventivo?',
    'read my sources about the tender', 'tell me what the sources say', 'what is the source of this number?']
  for (const f of no) assert.equal(fonti.richiestaSulleFonti(f), null, f)
})

test('il racconto in inglese: collegate con i conteggi, le incomplete col motivo, l\'ultimo arrivo, la lettura partita', () => {
  const adesso = new Date()
  const s = {
    fonti: [{ fonte: 'desktop', documenti: 3410 }, { fonte: 'posta', documenti: 1240 }, { fonte: 'note', documenti: 88 }, { fonte: 'lavoro', documenti: 12 }, { fonte: 'calendario', documenti: 0 }],
    incomplete: [{ fonte: 'note', motivo: 'non-disponibile' as const, rimedio: 'guarda' as const, dal: adesso.toISOString() }],
    ultimoArrivo: adesso.toISOString()
  }
  const t = fonti.raccontaFonti(s, 'en', 'avviata', adesso, 'darwin')
  assert.match(t, /^Connected sources, with how many documents each: files on the Mac \(3,410\), Mail \(1,240\), Notes \(88\), work folders \(12\), calendar \(nothing yet\)\./m)
  assert.match(t, /Not fully read last time: Notes \(could not be opened\)\. Go to Sources to fix it\./)
  assert.match(t, /Last thing indexed: today at \d\d:\d\d\./)
  assert.match(t, /Reading them now; what arrives shows up on your first page\./)
  assert.doesNotMatch(t, /[—–]/, 'niente lineette')
  // un'altra lettura già in corso lo dice, e senza la strada per rileggere rimanda alle Fonti
  assert.match(fonti.raccontaFonti(s, 'en', 'in-corso', adesso), /A read is already running/)
  assert.match(fonti.raccontaFonti(s, 'en', 'non-posso', adesso), /use the Sources page/)
  // un giorno diverso da oggi si scrive con la data
  assert.match(fonti.raccontaFonti({ ...s, ultimoArrivo: '2026-01-05T10:00:00.000Z' }, 'en', null, adesso), /Last thing indexed: on 2026-01-0[56] at \d\d:\d\d\./)
})

test('il racconto in italiano, e senza fonti si manda alle Fonti', () => {
  const adesso = new Date()
  const s = { fonti: [{ fonte: 'posta', documenti: 2 }, { fonte: 'conversazioni', documenti: 1 }, { fonte: 'x', documenti: 0 }], incomplete: [{ fonte: 'desktop', motivo: 'incompleta' as const, rimedio: 'attendi' as const, dal: adesso.toISOString() }], ultimoArrivo: adesso.toISOString() }
  const t = fonti.raccontaFonti(s, 'it', 'avviata', adesso, 'win32')
  assert.match(t, /^Fonti collegate, con quanti documenti ciascuna: Posta \(2\), chat con i modelli \(1\), X \(ancora niente\)\./m)
  assert.match(t, /Non lette per intero l'ultima volta: file sul PC \(letta solo in parte\)\. Vai alle Fonti per sistemarle\./)
  assert.match(t, /Ultimo arrivo nell'indice: oggi alle \d\d:\d\d\./)
  assert.match(t, /Le leggo adesso; quello che arriva compare sulla tua prima pagina\./)
  const vuoto = fonti.raccontaFonti({ fonti: [], incomplete: [], ultimoArrivo: null }, 'it', null, adesso)
  assert.equal(vuoto, 'Nessuna fonte collegata: vai alle Fonti per collegare la posta, il computer o le note.')
  assert.equal(fonti.raccontaFonti({ fonti: [], incomplete: [], ultimoArrivo: null }, 'en', null, adesso), 'No sources connected yet: go to Sources to connect your mail, your computer or your notes.')
})

test('lo stato vero: la configurazione e l\'indice, per conto, e l\'ultimo arrivo', () => {
  cfg.scrivi({})
  assert.deepEqual(fonti.statoFonti(), { fonti: [], incomplete: [], ultimoArrivo: null })
  store.salvaDocumenti([
    { id: 'posta:1', fonte: 'posta', tipo: 'email', titolo: 'Preventivo', corpo: 'Il preventivo.', autore: 'Rossi', percorso: 'INBOX', quando: '2026-03-01T10:00:00.000Z', gruppo: 'posta' },
    { id: 'posta:2', fonte: 'posta', tipo: 'email', titolo: 'Fattura', corpo: 'La fattura.', autore: 'Rossi', percorso: 'INBOX', quando: '2026-03-02T10:00:00.000Z', gruppo: 'posta' },
    { id: 'desktop:/x', fonte: 'desktop', tipo: 'file', titolo: 'x.md', corpo: 'x', autore: null, percorso: '/x', quando: '2026-03-03T10:00:00.000Z', gruppo: 'documenti' }
  ])
  cfg.scrivi({ note: { note: 0 } })
  const s = fonti.statoFonti()
  assert.deepEqual(s.fonti, [{ fonte: 'posta', documenti: 2 }, { fonte: 'desktop', documenti: 1 }, { fonte: 'note', documenti: 0 }])
  assert.ok(s.ultimoArrivo && Number.isFinite(Date.parse(s.ultimoArrivo)))
  assert.deepEqual(s.incomplete, [])
})

test('«read my sources» in chat risponde subito con lo stato e fa partire la rilettura; senza modello, e senza cercare niente', async () => {
  let chiamate = 0
  let scritto = ''
  const r = await claude.rispondiInStreaming('read my sources', [], t => { scritto += t }, { aggiungiCompito: () => ({ id: 'mai' }), rileggiFonti: () => { chiamate++; return 'avviata' } })
  assert.equal(chiamate, 1, 'la rilettura è partita una volta')
  assert.equal(r.testo, scritto)
  assert.match(r.testo, /Connected sources, with how many documents each: Mail \(2\), files on the Mac \(1\), Notes \(nothing yet\)\./)
  assert.match(r.testo, /Reading them now/)
  assert.deepEqual(r.fonti, [])
  // solo lo stato: la rilettura non si tocca
  await claude.rispondiInStreaming('which sources are connected?', [], () => {}, { aggiungiCompito: () => ({ id: 'mai' }), rileggiFonti: () => { chiamate++; return 'avviata' } })
  assert.equal(chiamate, 1)
  // una domanda sul materiale passa oltre: qui non c'è un motore, e lo dice
  const oltre = await claude.rispondiInStreaming('what does the source say about Rossi?', [], () => {}, { aggiungiCompito: () => ({ id: 'mai' }) })
  assert.match(oltre.testo, /Collega Claude/)
})

test('una fonte che non si è aperta compare col suo motivo, e la lingua è quella dell\'app', () => {
  const oss = lettura.osservaLettura('', null)
  oss.avvisa({ fase: 'note', stato: 'guaio', errore: 'operazione non permessa' })
  oss.chiudi()
  cfg.scrivi({ lingua: 'it', note: { note: 0 } })
  const t = fonti.rispostaSulleFonti('quante fonti hai?')
  assert.ok(t)
  assert.match(t, /Non lette per intero l'ultima volta: Note \(non si è aperta\)/)
  assert.match(t, /Fonti collegate, con quanti documenti ciascuna: Posta \(2\)/)
  lettura.dimenticaLetture('')
  cfg.scrivi({})
})

test('fra parentesi la causa: il permesso, l’accesso, la credenziale, l’amministratore, la rete (P8)', () => {
  const adesso = new Date()
  const dal = adesso.toISOString()
  const s = {
    fonti: [{ fonte: 'note', documenti: 1 }],
    incomplete: [
      { fonte: 'note', motivo: 'non-disponibile' as const, rimedio: 'permesso-disco' as const, dal },
      { fonte: 'granola', motivo: 'non-disponibile' as const, rimedio: 'accedi' as const, dal },
      { fonte: 'posta', motivo: 'non-disponibile' as const, rimedio: 'credenziale' as const, dal },
      { fonte: 'google', motivo: 'non-disponibile' as const, rimedio: 'amministratore' as const, dal },
      { fonte: 'slack', motivo: 'non-disponibile' as const, rimedio: 'attendi' as const, dal },
      { fonte: 'github', motivo: 'incompleta' as const, rimedio: 'attendi' as const, dal },
      { fonte: 'notion', motivo: 'non-disponibile' as const, rimedio: 'guarda' as const, dal }
    ],
    ultimoArrivo: null
  }
  assert.match(fonti.raccontaFonti(s, 'en', null, adesso),
    /Not fully read last time: Notes \(Full Disk Access is off\), Granola \(needs a new sign-in\), Mail \(the credential no longer works\), Gmail \(waiting for your admin’s approval\), Slack \(not responding\), GitHub \(only partly read\), Notion \(could not be opened\)\./)
  assert.match(fonti.raccontaFonti(s, 'it', null, adesso),
    /Note \(manca l’accesso completo al disco\), Granola \(serve un nuovo accesso\), Posta \(la credenziale non va più\), Gmail \(aspetta il via libera del tuo amministratore\), Slack \(non risponde\), GitHub \(letta solo in parte\), Notion \(non si è aperta\)/)
})
