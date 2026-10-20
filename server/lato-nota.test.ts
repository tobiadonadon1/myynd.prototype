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
    ['Following up on our call', 'We enjoyed the pitch. As investors we would like to see the numbers.', 6],
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
  docs.push(...postSuoi(4))
  return docs
}

/** I suoi post su X, uno ogni `ogni` giorni (a partire da due giorni fa). */
function postSuoi(quanti: number, ogni = 6): Doc[] {
  return Array.from({ length: quanti }, (_, i) => ({
    id: `x:mio:18460000000000000${i}`, fonte: 'x', tipo: 'post', titolo: `Building in public, day ${i}`,
    corpo: `Building in public, day ${i}. Shipped one more thing.`, autore: null, percorso: null, quando: fa(2 + i * ogni), gruppo: 'note', inviato: true
  }))
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
    docs.push(mail(t, c, g, { filo, autore: `ammin${i}@contabilita.example` }))
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
  assert.equal(f[0].corrispondenti, 4)
  assert.ok(f[0].punti >= nota.SOGLIA)
  assert.ok(!f.some(s => s.id === 'x'), 'con quattro post suoi X non è una presenza')
  const b = nota.segnali(arrivi(freelance()), [{ testo: 'Chase invoice 1042 with Studio Nord', stato: 'aperto', quando: fa(5) }], Date.now())
  assert.equal(b[0].id, 'fatture')
  assert.equal(b[0].scivolano, 1)
  assert.ok(b[0].punti > (b.find(s => s.id === 'clienti')?.punti ?? 0))
  for (const s of [...f, ...b]) assert.ok(s.esempi.length <= 5)
  // ordinati, il più forte per primo
  assert.deepEqual(f.map(s => s.punti), [...f.map(s => s.punti)].sort((a, c) => c - a))
})

test('X si giudica dai suoi post: nove in tre settimane, e mai dalle parole delle mail', () => {
  const senza = fondatrice().filter(d => !d.id.startsWith('x:mio:'))
  const con = (n: number, ogni: number) => nota.segnali(arrivi([...senza, ...postSuoi(n, ogni)]), [], Date.now())
  assert.ok(!con(8, 3).some(s => s.id === 'x'), 'otto post non bastano')
  assert.ok(!con(9, 0.5).some(s => s.id === 'x'), 'nove post in un giorno solo non sono una presenza')
  const x = con(10, 3).find(s => s.id === 'x')
  assert.ok(x, 'dieci post in un mese sì')
  assert.equal(x!.arrivate, 10)
  assert.equal(x!.aspettano, 0)
  // e le mail piene di «post» e «thread» non fanno nascere X
  const parlano = Array.from({ length: 16 }, (_, i) => mail('Your post and thread', 'A post, a thread, a tweet.', 1 + i, { autore: `a${i}@esempio.it` }))
  assert.ok(!nota.segnali(arrivi(parlano), [], Date.now()).some(s => s.id === 'x'))
})

test('le mail di massa o di un noreply non fanno un lato', () => {
  const noreply = Array.from({ length: 20 }, (_, i) => mail(`Invoice ${i} is overdue`, 'Pay now.', 1 + (i % 25), { autore: 'Billing <noreply@fatturazione.example>', filo: `nr-${i}` }))
  assert.deepEqual(nota.segnali(arrivi([...qualunque(16), ...noreply]), [], Date.now()), [])
  const massa = noreply.map(d => ({ ...d, autore: `p${d.id}@esempio.it`, massa: true }) as unknown as Doc)
  assert.deepEqual(nota.segnali(arrivi([...qualunque(16), ...massa]), [], Date.now()), [])
})

test('una parola sola nel corpo non basta, due parole diverse sì; l’oggetto basta da solo', () => {
  const base = (titolo: string, corpo: string, i: number) => mail(titolo, corpo, 1 + i, { autore: `p${i}@esempio.it`, filo: `f${i}` })
  const una = [...qualunque(14), base('Hello', 'Quick note about the pitch.', 1), base('Hello again', 'Another word about the pitch.', 2)]
  assert.ok(!nota.segnali(arrivi(una), [], Date.now()).some(s => s.id === 'investitori'), 'una parola sola nel corpo')
  const due = [...qualunque(14), base('Hello', 'A pitch for investors.', 1), base('Hello again', 'The pitch and the term sheet.', 2)]
  assert.equal(nota.segnali(arrivi(due), [], Date.now())[0]?.id, 'investitori')
  const oggetto = [...qualunque(14), base('Investor update', 'Hi.', 1), base('Seed round', 'Hi.', 2)]
  assert.equal(nota.segnali(arrivi(oggetto), [], Date.now())[0]?.id, 'investitori')
  // le parole che sbagliano troppo non sono più del lato
  const generiche = [...qualunque(14), base('Order', 'The deck and the round, feedback on the brief, deadline and reminder.', 1), base('Order 2', 'Round two of feedback on the deck, the brief and the deadline.', 2)]
  assert.deepEqual(nota.segnali(arrivi(generiche), [], Date.now()), [])
})

test('un solo corrispondente che aspetta non fa un lato di posta', () => {
  const uno = [...qualunque(14), mail('Investor update', 'Hi.', 1, { autore: 'solo@fondo.example' }), mail('Seed round', 'Hi.', 2, { autore: 'solo@fondo.example' }),
    mail('Term sheet', 'Hi.', 3, { autore: 'solo@fondo.example' }), mail('Due diligence', 'Hi.', 4, { autore: 'solo@fondo.example' })]
  assert.ok(!nota.segnali(arrivi(uno), [], Date.now()).some(s => s.id === 'investitori'))
})

test('sotto le quindici mail di persone nessun lato di posta, e i post bastano da soli per X', () => {
  const poche = fondatrice().filter(d => !d.id.startsWith('x:mio:')).slice(0, 10)
  assert.deepEqual(nota.segnali(arrivi(poche), [], Date.now()), [])
  const soloX = [...qualunque(2), ...postSuoi(12, 2)]
  assert.deepEqual(nota.segnali(arrivi(soloX), [], Date.now()).map(s => s.id), ['x'])
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
    assert.equal(m!.text, 'I could take over investor follow-ups: 4 investors are waiting for your reply. I\'d draft each follow-up in your Drafts and always ask before sending. Shall I?')
    assert.ok(m!.text.split(/\s+/).length <= 30, 'trenta parole al massimo')
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
  nota.perProva({ chiediJSON: async () => ({ lato: 'investitori', perche: '4 investors are still waiting on you', fa: ['draft the follow-ups in your Drafts'], chiede: ['before sending'] }) as never })
  const buona = await nota.scegli(s, 'en')
  assert.equal(buona.daModello, true)
  assert.equal(nota.messaggio(lati.lato('investitori')!, buona.parti, 'en'),
    'I could take over investor follow-ups: 4 investors are still waiting on you. I\'d draft the follow-ups in your Drafts and always ask before sending. Shall I?')
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
  assert.match(dentro(bruno, () => store.messaggi('myynd')[0].text), /^I could take over invoices and payments to chase: 5 people are waiting for your reply\./)

  const primaDiBruno = dentro(bruno, () => JSON.stringify(lati.leggi()))
  await dentro(anna, () => domande.rispondiADomanda(da!.id, 'yes'))
  assert.equal(dentro(anna, () => lati.leggi().scelto?.id), 'investitori')
  assert.equal(dentro(bruno, () => JSON.stringify(lati.leggi())), primaDiBruno)
  assert.equal(dentro(bruno, () => progetti.elenco().length), 0)
  assert.equal(dentro(bruno, () => store.default.prepare('SELECT COUNT(*) AS n FROM mandati').get() as { n: number }).n, 0)
  assert.equal(dentro(bruno, () => store.domanda(db!.id)?.stato), 'aperta')
  assert.equal(dentro(bruno, () => store.messaggi('myynd').length), 1)
})

// — i no, i vaghi, i nomi, i progetti che c'erano già —

const SENZA_PAROLE = { id: 'q-prova', spunto: ['investitori'] }
/** Torna come prima di rispondere: né rifiutato né scelto. */
const azzera = () => lati.aggiorna(st => { delete st.rifiutato; delete st.scelto })

test('un rifiuto è un no, comunque sia scritto: «No, thanks», «Not interested», «later», «nah»', async () => {
  const p = await persona('rifiuti@esempio.it', fondatrice())
  await dentro(p, async () => {
    const no = ['No, thanks', 'Not interested', 'No grazie, non ora', 'later', 'nah', 'maybe later', 'Non mi interessa', 'Not now, thanks', 'no thank you', 'Nope.', 'Forse dopo', 'Lascia stare']
    for (const t of no) {
      azzera()
      const r = await nota.rispondi(SENZA_PAROLE, t)
      assert.equal(r.riga, 'Okay, I’ll leave it.', t)
      assert.equal(r.chiusa, true, t)
      assert.ok(lati.leggi().rifiutato, t)
      assert.equal(lati.leggi().scelto, undefined, t)
    }
    assert.equal(progetti.elenco().length, 0, 'nessun progetto è nato da un no')
    assert.equal(mandato.scritto('qualunque'), null)
  })
})

test('«No problem, go ahead» non è un no, e un punto interrogativo non è mai un sì', async () => {
  const p = await persona('quasi@esempio.it', fondatrice())
  await dentro(p, async () => {
    azzera()
    const a = await nota.rispondi(SENZA_PAROLE, 'No problem, go ahead')
    assert.equal(lati.leggi().rifiutato, undefined, 'non è un no')
    assert.equal(a.chiusa, false)
    for (const t of ['yes?', 'Yes, but what would you do exactly?', 'sure, can you show me first?']) {
      azzera()
      const r = await nota.rispondi(SENZA_PAROLE, t)
      assert.equal(lati.leggi().scelto, undefined, t)
      assert.equal(r.chiusa, false, t)
    }
    assert.equal(progetti.elenco().length, 0)
  })
})

test('parole vaghe non fanno nascere niente: la domanda resta aperta e Myynd chiede quale parte', async () => {
  const p = await persona('vago@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = (await nota.forseNota(mezzogiorno()))!
    const r = await domande.rispondiADomanda(d.id, 'hmm what would you do exactly')
    assert.equal(r.esito, 'Yes, no, or which part? A few words are enough.')
    assert.equal(store.domanda(d.id)?.stato, 'aperta')
    assert.equal(store.domandaAperta()?.id, d.id)
    assert.equal(progetti.elenco().length, 0)
    assert.equal(lati.leggi().scelto, undefined)
    assert.equal(lati.leggi().rifiutato, undefined)
    assert.ok(store.messaggi('myynd').some(x => x.role === 'a' && x.text === r.esito), 'la riga di Myynd è in chat')
    // poi dice la parte, e si fa
    const dopo = await domande.rispondiADomanda(d.id, 'yes')
    assert.equal(dopo.esito, 'Done. From tonight I’ll handle investor follow-ups.')
    assert.equal(store.domanda(d.id)?.stato, 'risposta')
  })
})

test('un lato libero solo se il modello conferma una parte concreta: il nome non comincia con un verbo', async () => {
  const p = await persona('libero@esempio.it', fondatrice())
  await dentro(p, async () => {
    // il modello dice libero ma non concreto: niente
    nota.perProva({ chiediJSON: async () => ({ decisione: 'non_chiaro', lato: 'libero', esito: '' }) as never })
    const vago = await nota.rispondi(SENZA_PAROLE, 'please take over my supplier stuff')
    assert.equal(vago.chiusa, false)
    assert.equal(progetti.elenco().length, 0)
    // concreto: nasce, e il nome non è «Take over my supplier calls»
    nota.perProva({ chiediJSON: async () => ({ decisione: 'altro', lato: 'libero', esito: 'Take over my supplier calls' }) as never })
    const r = await nota.rispondi(SENZA_PAROLE, 'please take over my supplier calls')
    assert.equal(r.chiusa, true)
    assert.equal(progetti.elenco().map(x => x.nome).join(), 'Supplier calls')
    assert.equal(r.riga, 'Done. From tonight I’ll handle supplier calls.')
    nota.perProva({ chiediJSON: async () => null })
  })
  assert.equal(nota.nomeLibero('Handle my invoices'), 'Invoices')
  assert.equal(nota.nomeLibero('Take over the weekly newsletter'), 'Weekly newsletter')
  assert.equal(nota.nomeLibero('Occupati dei miei fornitori'), 'Fornitori')
  assert.equal(nota.nomeLibero('Do'), 'Do')
})

test('«handle my invoices» dà il nome del lato (fatture), anche se il modello dice libero', async () => {
  const p = await persona('fattureparole@esempio.it', fondatrice())
  await dentro(p, async () => {
    nota.perProva({ chiediJSON: async () => ({ decisione: 'altro', lato: 'libero', esito: 'Handle my invoices' }) as never })
    const r = await nota.rispondi(SENZA_PAROLE, 'handle my invoices')
    assert.equal(lati.leggi().scelto?.id, 'fatture')
    assert.deepEqual(progetti.elenco().map(x => x.nome), ['Invoices to chase'])
    assert.match(r.riga, /invoices and payments to chase/)
    nota.perProva({ chiediJSON: async () => null })
  })
})

test('un progetto che c’era già con un mandato scritto tiene le sue regole', async () => {
  const p = await persona('gia@esempio.it', fondatrice())
  await dentro(p, async () => {
    const pr = progetti.crea({ nome: 'Investor follow-ups', obiettivo: 'Il mio', origine: 'mano' }).progetto
    mandato.salva(pr.id, { esito: 'Il mio esito', misura: 'La mia misura', classi: { nota: 'chiedi', bozza_posta: 'chiedi' } }, { conferma: false, origine: 'dedotto' })
    const prima = mandato.scritto(pr.id)!
    assert.equal(prima.stato, 'proposto')
    const r = await nota.rispondi(SENZA_PAROLE, 'yes')
    assert.match(r.riga, /^Done\./)
    const dopo = mandato.scritto(pr.id)!
    assert.deepEqual(dopo.classi, prima.classi, 'le regole che c’erano non sono riscritte')
    assert.equal(dopo.esito, 'Il mio esito')
    assert.equal(dopo.stato, 'proposto')
    assert.equal(lati.leggi().scelto?.progetto, pr.id)
  })
})

test('un progetto che c’era già ma è chiuso: Myynd lo dice, non dice «Fatto» e non sceglie il lato', async () => {
  const p = await persona('chiuso@esempio.it', fondatrice())
  await dentro(p, async () => {
    const pr = progetti.crea({ nome: 'Investor follow-ups', origine: 'mano' }).progetto
    assert.ok(progetti.chiudi(pr.id))
    azzera()
    const r = await nota.rispondi(SENZA_PAROLE, 'yes')
    assert.equal(r.riga, 'Investor follow-ups is closed. Reopen it and tell me again.')
    assert.equal(r.chiusa, false)
    assert.equal(lati.leggi().scelto, undefined)
    assert.equal(progetti.trova(pr.id)?.stato, 'chiuso', 'non lo riapre: lo fa solo chi lo scrive a mano')
    assert.equal(mandato.scritto(pr.id), null)
  })
})

// — la domanda del lato davanti alle altre —

test('la domanda del lato passa davanti a una più nuova, e quella nuova torna quando il lato ha risposto', async () => {
  const p = await persona('davanti@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = (await nota.forseNota(mezzogiorno()))!
    const altra = store.apriDomanda({ tema: 'dopo:p1', testo: 'Qual è il passo dopo?', spunto: [] })!
    assert.equal(altra.tema, 'dopo:p1', 'apriDomanda torna quella appena scritta')
    assert.equal(store.domandaAperta()?.id, d.id, 'il lato resta in testa')
    assert.equal(store.domandaAperta()?.tema, lati.TEMA_PRIMO)
    // si risponde alla domanda che si vede, e l’altra resta aperta
    await domande.rispondiADomanda(d.id, 'no')
    assert.equal(store.domandaAperta()?.id, altra.id)
  })
})

test('una domanda aperta da più di sette giorni non impedisce di chiedere il lato, e non viene toccata', async () => {
  const p = await persona('stantia@esempio.it', fondatrice())
  await dentro(p, async () => {
    const vecchia = store.apriDomanda({ tema: 'riferimento', testo: 'Su cosa stai lavorando?', spunto: [] })!
    store.default.prepare('UPDATE domande SET creata = ? WHERE id = ?').run(fa(10), vecchia.id)
    assert.equal(nota.inSospeso(), false)
    const d = await nota.forseNota(mezzogiorno())
    assert.ok(d, 'il lato si chiede lo stesso')
    assert.equal(d!.tema, lati.TEMA_PRIMO)
    const resta = store.domanda(vecchia.id)!
    assert.equal(resta.stato, 'aperta')
    assert.equal(resta.testo, 'Su cosa stai lavorando?')
    assert.equal(store.domandaAperta()?.id, d!.id)
  })
})

test('una domanda aperta di ieri invece sì: il lato aspetta', async () => {
  const p = await persona('recente@esempio.it', fondatrice())
  await dentro(p, async () => {
    const recente = store.apriDomanda({ tema: 'riferimento', testo: 'Su cosa stai lavorando?', spunto: [] })!
    store.default.prepare('UPDATE domande SET creata = ? WHERE id = ?').run(fa(1), recente.id)
    assert.equal(nota.inSospeso(), true)
    assert.equal(await nota.forseNota(mezzogiorno()), null)
    assert.equal(lati.leggi().notato, undefined)
  })
})

test('il messaggio di serie è di due frasi e la domanda, trenta parole al massimo, per ogni lato e in tutte e due le lingue', () => {
  const base = { punti: 20, esempi: [], arrivate: 12, aspettano: 4, settimane: 3, scivolano: 0, corrispondenti: 4 }
  for (const id of ['investitori', 'fatture', 'partner', 'clienti', 'x'] as const) {
    for (const l of ['en', 'it'] as const) {
      const t = nota.messaggio(lati.lato(id)!, nota.partiDiSerie({ id, ...base }, l), l)
      assert.ok(t.split(/\s+/).length <= 40, `${id} ${l}: ${t}`)
      assert.equal((t.match(/[.?]\s/g) ?? []).length + 1, 3, `${id} ${l}: tre frasi: ${t}`)
      assert.ok(nota.regge(t, l), `${id} ${l}: ${t}`)
      assert.ok(!/\b1 (emails|mail)\b/.test(t))
    }
  }
  assert.equal(nota.messaggio(lati.lato('investitori')!, nota.partiDiSerie({ id: 'investitori', ...base }, 'it'), 'it'),
    'Potrei prendere in mano i follow-up con gli investitori: 4 investitori aspettano una tua risposta. Da solo preparo ogni risposta nelle tue bozze e chiedo sempre prima di mandare. Lo faccio?')
  assert.match(nota.percheDiSerie({ id: 'clienti', ...base, corrispondenti: 1 }, 'en'), /^1 client is waiting for your reply$/)
})

test('«No, handle my invoices»: il no vale per il lato proposto, e il lato nominato dopo si prende', async () => {
  const p = await persona('nohandle@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = (await nota.forseNota(mezzogiorno()))!
    nota.perProva({ chiediJSON: async () => ({ decisione: 'altro', lato: 'fatture', esito: '' }) as never })
    await domande.rispondiADomanda(d.id, 'No, handle my invoices')
    nota.perProva({ chiediJSON: async () => null })
    assert.equal(lati.leggi().scelto?.id, 'fatture')
    assert.equal(lati.leggi().rifiutato, undefined)
  })
})

test('le risposte che le parole fisse leggevano male: solo i sì e i no secchi si leggono da qui', () => {
  for (const t of ['Yes', 'yes please', 'Sì grazie', 'ok', 'Sure!', 'Go ahead.', 'va bene']) assert.equal(nota.eUnSi(t), true, t)
  for (const t of ['ok?', "Don't worry, go ahead", 'Sì, però solo fatture', 'Sure, invoices first', 'No problem']) assert.equal(nota.eUnSi(t), false, t)
  for (const t of ['No', 'No, thanks', 'No grazie, non ora', 'Not interested', 'maybe later', 'not now, thanks', 'Lascia stare']) assert.equal(nota.eUnNo(t), true, t)
  for (const t of ['Not interested in invoices', 'No, handle my invoices', "I'm good with that, go ahead", "Don't ask, just do it"]) assert.equal(nota.eUnNo(t), false, t)
})

test('senza modello un lato nominato vale solo senza negazioni: «Not interested in invoices» non fa nascere le fatture', async () => {
  const p = await persona('negazione@esempio.it', fondatrice())
  await dentro(p, async () => {
    const d = (await nota.forseNota(mezzogiorno()))!
    const r = await domande.rispondiADomanda(d.id, 'Not interested in invoices')
    assert.equal(progetti.elenco().length, 0)
    assert.equal(lati.leggi().scelto, undefined)
    assert.equal(store.domanda(d.id)?.stato, 'aperta')
    assert.match(r.esito, /which part/)
    const s = await domande.rispondiADomanda(d.id, 'Sì, però solo fatture')
    assert.equal(lati.leggi().scelto?.id, 'fatture', s.esito)
  })
})
