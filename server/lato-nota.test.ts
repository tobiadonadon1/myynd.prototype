// Il lato notato, chiesto una volta, e il sì che diventa un mandato.
//
// «it is something that myynd should text you because it changes based per
// user»: qui si prova che due persone con due lavori diversi ricevono due
// domande diverse, che la domanda si fa una volta sola, e che il sì scrive
// progetto, mandato confermato e due righe in chat solo per chi l'ha dato.
//
//   node --import ./build/test-profile.mjs --test server/lato-nota.test.ts

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-lato-'))
process.env.MYYND_DATI = CASA
process.env.RAILWAY_ENVIRONMENT = 'prova'

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const mandato = await import('./mandato.ts')
const domande = await import('./domande.ts')
const lati = await import('./lato-lati.ts')
const nota = await import('./lato-nota.ts')

type Doc = Parameters<typeof store.salvaDocumenti>[0][number]
const GIORNO = 86_400_000
const fa = (giorni: number, ore = 0) => new Date(Date.now() - giorni * GIORNO - ore * 3_600_000).toISOString()
/** Oggi a mezzogiorno: di giorno, qualunque ora sia quando gira la prova. */
const mezzogiorno = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime() }

let n = 0
const mail = (titolo: string, corpo: string, giorni: number, o: { filo?: string; inviato?: boolean; autore?: string } = {}): Doc => ({
  id: `posta:INBOX:${++n}`, fonte: 'posta', tipo: 'email', titolo, corpo, autore: o.autore ?? 'qualcuno@esempio.it',
  percorso: null, quando: fa(giorni), gruppo: 'posta', filo: o.filo ?? `filo-${n}`, inviato: !!o.inviato
})

/** Mail di tutti i giorni che non dicono nessun lato. */
const qualunque = (quante: number): Doc[] => Array.from({ length: quante }, (_, i) =>
  mail(['Dentist on Tuesday', 'Flight to Lisbon confirmed', 'Dinner on Saturday?', 'Your new library card', 'Gym opening hours', 'Photos from the trip', 'Moving the team lunch', 'Book club picks', 'Parking permit is ready'][i % 9],
    'See you soon, nothing else to add.', 1 + (i * 3) % 27))

/** Una fondatrice: sei investitori in un mese, quattro aspettano lei; e qualche post su X. */
function fondatrice(): Doc[] {
  const docs: Doc[] = []
  const investitori = [
    ['Seed round: next steps', 'Thanks for the pitch. Could you send the updated deck and the cap table?', 3],
    ['Following up on our call', 'We enjoyed the pitch. Is the round still open? We would like to see the deck.', 6],
    ['Term sheet questions', 'Two questions on the term sheet before our partners meet.', 9],
    ['Due diligence list', 'Here is the due diligence list for the seed round.', 13],
    ['Intro from Marco: angel investor', 'Marco said you are raising a pre-seed round. Happy to chat.', 18],
    ['Fund update and your round', 'Our fund is reviewing your deck this week.', 24]
  ] as const
  investitori.forEach(([t, c, g], i) => {
    const filo = `inv-${i}`
    docs.push(mail(t, c, g, { filo, autore: `vc${i}@fondo.example` }))
    // a due ha già risposto lei: quei fili non aspettano nessuno
    if (i >= 4) docs.push(mail(`Re: ${t}`, 'Thanks, sending it today.', g - 1, { filo, inviato: true, autore: 'anna@esempio.it' }))
  })
  docs.push(...qualunque(12))
  for (let i = 0; i < 4; i++) {
    docs.push({ id: `x:mio:18460000000000000${i}`, fonte: 'x', tipo: 'post', titolo: `Building in public, day ${i}`,
      corpo: `Building in public, day ${i}. Shipped one more thing.`, autore: null, percorso: null, quando: fa(2 + i * 6), gruppo: 'note', inviato: true })
  }
  return docs
}

/** Un libero professionista: clienti e fatture scadute da inseguire. */
function freelance(): Doc[] {
  const docs: Doc[] = []
  const fatture = [
    ['Invoice 1042 is overdue', 'Our records show invoice 1042 is still unpaid. Can you resend it?', 2],
    ['Re: Invoice 1038 payment', 'We will pay invoice 1038 next week, sorry for the delay.', 5],
    ['Payment reminder', 'Friendly reminder: the payment for March is overdue.', 8],
    ['Invoice 1045 for Studio Nord', 'Please send the invoice to accounts, with the IBAN.', 11],
    ['Wire transfer received?', 'Did the wire for invoice 1031 arrive?', 15],
    ['Overdue invoice 1029', 'This invoice is overdue by 30 days.', 20],
    ['Receipt for April', 'Can you send the receipt for April?', 26]
  ] as const
  fatture.forEach(([t, c, g], i) => {
    const filo = `fat-${i}`
    docs.push(mail(t, c, g, { filo, autore: `ammin${i}@cliente.example` }))
    if (i >= 5) docs.push(mail(`Re: ${t}`, 'Sent, thanks.', g - 1, { filo, inviato: true, autore: 'bruno@esempio.it' }))
  })
  const clienti = [
    ['Logo revision', 'The client wants one more revision of the logo.', 4],
    ['Quote for the new site', 'Could you send a quote for the new site?', 10],
    ['Brochure brief', 'Here is the brief for the brochure.', 17]
  ] as const
  clienti.forEach(([t, c, g], i) => docs.push(mail(t, c, g, { filo: `cli-${i}`, autore: `cliente${i}@studio.example` })))
  docs.push(...qualunque(8))
  return docs
}

type Persona = { id: string; email: string }
/** Una persona nuova, seminata e col modello spento. */
async function persona(email: string, docs: Doc[]): Promise<Persona> {
  const c = await conti.registra(email, 'passwordlunga1')
  assert.ok(c.ok, `il conto ${email} non è nato`)
  const id = c.ok ? c.id : ''
  chi.dentro(id, () => {
    cfg.scrivi({ lingua: 'en', nome: email.split('@')[0], ruolo: 'Founder', onboarding: true } as Parameters<typeof cfg.scrivi>[0])
    store.salvaDocumenti(docs)
  })
  return { id, email }
}
const dentro = <T>(p: Persona, f: () => T) => chi.dentro(p.id, f)

before(() => { nota.perProva({ chiediJSON: async () => null }) })
after(() => {
  nota.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const arrivi = (docs: Doc[]) => docs as unknown as Documento[]

// — segnali, puri —

test('la fondatrice ha il lato degli investitori, il libero professionista quello delle fatture', () => {
  const f = nota.segnali(arrivi(fondatrice()), [], Date.now())
  assert.equal(f[0].id, 'investitori')
  assert.equal(f[0].aspettano, 4)
  assert.ok(f[0].punti >= nota.SOGLIA)
  assert.ok(f.some(s => s.id === 'x'), 'con quattro post suoi anche X conta')
  const b = nota.segnali(arrivi(freelance()), [{ testo: 'Chase invoice 1042 with Studio Nord', stato: 'aperto', quando: fa(5) }], Date.now())
  assert.equal(b[0].id, 'fatture')
  assert.equal(b[0].scivolano, 1)
  assert.ok(b[0].punti > (b.find(s => s.id === 'clienti')?.punti ?? 0))
  for (const s of [...f, ...b]) assert.ok(s.esempi.length <= 5)
  // ordinati, il più forte per primo
  assert.deepEqual(f.map(s => s.punti), [...f.map(s => s.punti)].sort((a, c) => c - a))
})

test('X non conta senza almeno tre post suoi', () => {
  const pochi = fondatrice().filter(d => !d.id.startsWith('x:mio:') || d.id.endsWith('0'))
  assert.ok(!nota.segnali(arrivi(pochi), [], Date.now()).some(s => s.id === 'x'))
})

// — notare e chiedere —

test('pochi dati: niente domanda, e il tentativo del giorno è segnato', async () => {
  const p = await persona('poca@esempio.it', qualunque(10))
  await dentro(p, async () => {
    assert.equal(await nota.forseNota(mezzogiorno()), null)
    assert.equal(store.domandaAperta(), null)
    assert.ok(lati.leggi().tentato)
    assert.equal(lati.leggi().notato, undefined)
  })
})

test('senza modello il messaggio di serie arriva in chat, e regge le regole del testo', async () => {
  const p = await persona('fondatrice@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = await nota.forseNota(mezzogiorno())
    assert.ok(d, 'la domanda non si è aperta')
    assert.equal(d!.tema, lati.TEMA_PRIMO)
    assert.equal(lati.leggi().notato?.id, 'investitori')
    assert.equal(lati.leggi().notato?.domanda, d!.id)
    const m = store.messaggi('myynd').find(x => x.id === lati.idMessaggio(d!.id))
    assert.ok(m, 'il messaggio in chat non c’è')
    assert.equal(m!.role, 'a')
    assert.equal(m!.text, d!.testo)
    assert.match(m!.text, /^I could take over investor follow-ups\. 6 emails from investors came in this month and 4 are waiting for your reply\. On my own I'd draft each follow-up in your Drafts and keep a note of where each one stands\. I'd always ask before sending or before writing to someone new\. Shall I\?$/)
    assert.ok(nota.regge(m!.text, 'en'))
    assert.ok(!m!.text.includes('—'))
    assert.ok(!/\b(cost|price|token|budget)\b/i.test(m!.text))

    // la seconda volta non chiede niente: né oggi, né domani, né fra un mese
    assert.equal(await nota.forseNota(mezzogiorno()), null)
    assert.equal(await nota.forseNota(mezzogiorno() + GIORNO), null)
    assert.equal(store.domandeConTema(lati.TEMA).length, 1)
  })
})

test('il modello riempie le parti, e se mette «—» si torna a quelle di serie', async () => {
  const s = nota.segnali(arrivi(fondatrice()), [], Date.now()).slice(0, 3)
  nota.perProva({ chiediJSON: async () => ({ lato: 'investitori', perche: '4 investors are still waiting on you.', fa: ['draft the follow-ups in your Drafts'], chiede: ['before sending'] }) as never })
  const buona = await nota.scegli(s, 'en')
  assert.equal(buona.daModello, true)
  assert.equal(nota.messaggio(lati.lato('investitori')!, buona.parti, 'en'),
    'I could take over investor follow-ups. 4 investors are still waiting on you. On my own I\'d draft the follow-ups in your Drafts. I\'d always ask before sending. Shall I?')
  nota.perProva({ chiediJSON: async () => ({ lato: 'investitori', perche: 'Four are waiting — reply soon.', fa: ['draft'], chiede: ['before sending'] }) as never })
  assert.equal((await nota.scegli(s, 'en')).daModello, false)
  nota.perProva({ chiediJSON: async () => ({ lato: 'fatture', perche: 'Not one of the three.', fa: ['x'], chiede: ['y'] }) as never })
  assert.equal((await nota.scegli(s, 'en')).daModello, false)
  nota.perProva({ chiediJSON: async () => ({ lato: 'investitori', perche: 'It would cost you nothing in tokens.', fa: ['draft'], chiede: ['before sending'] }) as never })
  assert.equal((await nota.scegli(s, 'en')).daModello, false)
  nota.perProva({ chiediJSON: async () => null })
})

// — la risposta —

test('il sì fa nascere il progetto e il mandato confermato con le regole del lato', async () => {
  const p = await persona('si@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = (await nota.forseNota(mezzogiorno()))!
    const r = await domande.rispondiADomanda(d.id, 'yes')
    assert.equal(r.esito, 'Done. From tonight I’ll handle investor follow-ups.')
    assert.equal(store.domanda(d.id)?.stato, 'risposta')
    const s = lati.leggi().scelto!
    assert.equal(s.id, 'investitori')
    assert.equal(s.parole, undefined)
    const pr = progetti.trova(s.progetto)!
    assert.equal(pr.nome, 'Investor follow-ups')
    assert.equal(pr.obiettivo, lati.lato('investitori')!.esito.en)
    const m = mandato.scritto(pr.id)!
    assert.equal(m.stato, 'confermato')
    assert.equal(m.origine, 'lei')
    assert.equal(m.esito, lati.lato('investitori')!.esito.en)
    for (const [k, v] of Object.entries(lati.lato('investitori')!.classi)) assert.equal(m.classi[k as keyof typeof m.classi], v, k)
    assert.equal(m.classi.invio, 'chiedi')
    assert.equal(m.classi.paga, 'mai')
    assert.equal(mandato.autonomia(pr.id), 'agisce')
    // in chat: la domanda, la sua risposta, la riga di Myynd
    const chat = store.messaggi('myynd')
    const i = chat.findIndex(x => x.id === lati.idMessaggio(d.id))
    assert.deepEqual(chat.slice(i + 1).map(x => [x.role, x.text]), [['u', 'yes'], ['a', r.esito]])
    // e non si chiede più
    assert.equal(await nota.forseNota(mezzogiorno() + 2 * GIORNO), null)
  })
})

test('«actually handle my invoices» sceglie le fatture al posto del lato notato', async () => {
  const p = await persona('altro@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = (await nota.forseNota(mezzogiorno()))!
    const r = await domande.rispondiADomanda(d.id, 'actually handle my invoices')
    const s = lati.leggi().scelto!
    assert.equal(s.id, 'fatture')
    assert.equal(s.parole, 'actually handle my invoices')
    assert.equal(progetti.trova(s.progetto)?.nome, 'Invoices to chase')
    assert.equal(mandato.scritto(s.progetto)?.classi.paga, 'mai')
    assert.equal(mandato.scritto(s.progetto)?.stato, 'confermato')
    assert.match(r.esito, /invoices and payments to chase/)
  })
})

test('un no secco chiude per sempre, senza progetto', async () => {
  const p = await persona('no@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = (await nota.forseNota(mezzogiorno()))!
    await domande.rispondiADomanda(d.id, 'no thanks')
    assert.ok(lati.leggi().rifiutato)
    assert.equal(lati.leggi().scelto, undefined)
    assert.equal(progetti.elenco().length, 0)
  })
})

test('lasciata cadere dalla prima pagina è un no', async () => {
  const p = await persona('via@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = (await nota.forseNota(mezzogiorno()))!
    domande.ignora(d.id)
    assert.ok(lati.leggi().rifiutato)
    assert.equal(await nota.forseNota(mezzogiorno() + 3 * GIORNO), null)
  })
})

test('dopo sette giorni senza risposta la domanda scade e vale un no', async () => {
  const p = await persona('scade@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = (await nota.forseNota(mezzogiorno()))!
    assert.equal(nota.scadi(Date.now() + 6 * GIORNO), false)
    assert.equal(store.domanda(d.id)?.stato, 'aperta')
    assert.equal(await nota.forseNota(mezzogiorno() + 8 * GIORNO), null)
    assert.equal(store.domanda(d.id)?.stato, 'ignorata')
    assert.ok(lati.leggi().rifiutato)
    assert.equal(store.domandaAperta(), null)
  })
})

// — due persone —

test('Anna e Bruno ricevono lati diversi, e la risposta di Anna non tocca Bruno', async () => {
  const anna = await persona('anna@esempio.it', fondatrice())
  const bruno = await persona('bruno@esempio.it', freelance())
  dentro(bruno, () => {
    store.scriviCompito({ id: 'c-bruno', testo: 'Chase invoice 1042 with Studio Nord', quando: 'oggi', ordine: 'a0' } as Parameters<typeof store.scriviCompito>[0])
    store.default.prepare('UPDATE compiti SET creato = ? WHERE id = ?').run(fa(5), 'c-bruno')
  })
  const da = await dentro(anna, () => nota.forseNota(mezzogiorno()))
  const db = await dentro(bruno, () => nota.forseNota(mezzogiorno()))
  assert.ok(da && db)
  assert.equal(dentro(anna, () => lati.leggi().notato?.id), 'investitori')
  assert.equal(dentro(bruno, () => lati.leggi().notato?.id), 'fatture')
  assert.match(dentro(bruno, () => store.messaggi('myynd')[0].text), /^I could take over invoices and payments to chase\./)

  const primaDiBruno = dentro(bruno, () => JSON.stringify(lati.leggi()))
  await dentro(anna, () => domande.rispondiADomanda(da!.id, 'yes'))
  assert.equal(dentro(anna, () => lati.leggi().scelto?.id), 'investitori')
  assert.equal(dentro(bruno, () => JSON.stringify(lati.leggi())), primaDiBruno)
  assert.equal(dentro(bruno, () => progetti.elenco().length), 0)
  assert.equal(dentro(bruno, () => store.default.prepare('SELECT COUNT(*) AS n FROM mandati').get() as { n: number }).n, 0)
  assert.equal(dentro(bruno, () => store.domanda(db!.id)?.stato), 'aperta')
  assert.equal(dentro(bruno, () => store.messaggi('myynd').length), 1)
})
