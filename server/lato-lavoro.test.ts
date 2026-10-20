// La notte sul lato scelto (`lato-lavoro.ts`): i fili che aspettano lui
// diventano fino a tre candidati del lato, coi documenti arrivati, il modo
// «bozza» e il progetto del lato; ieri conta; il modello giù ha un ripiego;
// la bozza va alla controparte e mai a lui; le idee per X e il copione nascono
// solo se ci conta; due persone non si vedono.
//
//   node --import ./build/test-profile.mjs --test server/lato-lavoro.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-lato-lavoro-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const chi = await import('./chi.ts')
const conti = await import('./conti.ts')
const progetti = await import('./progetti.ts')
const mandato = await import('./mandato.ts')
const tracce = await import('./tracce.ts')
const lati = await import('./lato-lati.ts')
const lavoro = await import('./lato-lavoro.ts')
const candidati = await import('./candidati.ts')
const seguito = await import('./seguito.ts')
const turno = await import('./turno.ts')
const daSe = await import('./da-se.ts')
const compiti = await import('./compiti.ts')
const x = await import('./connettori/x.ts')

const ORA = Date.now()
const ORA_ = 3_600_000
const GIORNO = 86_400_000
const SI = () => true
const IO = 'me@myynd-prova.example'

function base() {
  cfg.scrivi({ lingua: 'en', nome: 'Tobia', autonomia: 'preparare', turno: {}, posta: { utente: IO } } as never)
}
function pulisci() {
  store.azzeraTutto()
  for (const f of ['lato.json', 'seguito.json', 'da-se.json']) rmSync(join(cfg.cartella(), f), { force: true })
  rmSync(join(cfg.cartella(), 'mailbox-drafts'), { recursive: true, force: true })
  candidati.dimentica()
  lavoro.perProva(null)
  seguito.perProva(null)
  turno.perProva(null)
  base()
}

before(() => { pulisci() })
beforeEach(() => { pulisci() })
after(() => {
  lavoro.perProva(null); seguito.perProva(null); turno.perProva(null); daSe.perProva(null); compiti.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

/** Il sì: il progetto del lato, il mandato confermato, e il lato scelto in `lato.json`. */
function scegli(id: import('./lato-lati.ts').LatoId): string {
  const def = lati.lato(id)!
  const p = progetti.crea({ nome: def.nome.en, obiettivo: def.esito.en, origine: 'conversazione' }).progetto
  mandato.salva(p.id, { esito: def.esito.en, misura: def.misura.en, classi: def.classi }, { conferma: true, origine: 'lei' })
  lati.aggiorna(s => { s.scelto = { id, esito: def.esito.en, progetto: p.id, quando: new Date(ORA).toISOString() } })
  return p.id
}

let n = 0
/** Una mail: arrivata di serie, o mandata da lui. */
function mail(o: { titolo: string; corpo: string; da?: string; ore: number; filo?: string; mia?: boolean }): string {
  const id = `posta:INBOX:${++n}`
  store.salvaDocumenti([{
    id, fonte: 'posta', tipo: 'email', titolo: o.titolo, corpo: o.corpo,
    autore: o.mia ? `Tobia <${IO}>` : o.da ?? 'Nora Vance <nora@fund.example>',
    quando: new Date(ORA - o.ore * ORA_).toISOString(), gruppo: 'posta', filo: o.filo ?? `filo-${n}`,
    inviato: !!o.mia, messageId: `m${n}@posta.example`
  } as import('./store.ts').Documento])
  return id
}

/** Quattro investitori che aspettano, più tre fili che non devono entrare. */
function investitori() {
  const attese = [
    mail({ titolo: 'Seed round: next steps', corpo: 'Hi Tobia, could you send the updated deck before our partner meeting?', da: 'Nora Vance <nora@fund.example>', ore: 30, filo: 'f-nora' }),
    mail({ titolo: 'Re: pre-seed intro', corpo: 'Thanks for the pitch. Can you share the cap table?', da: 'Leo Marsh <leo@angel.example>', ore: 20, filo: 'f-leo' }),
    mail({ titolo: 'Due diligence questions', corpo: 'Our fund has three due diligence questions for you.', da: 'Ada Kim <ada@vc.example>', ore: 10, filo: 'f-ada' }),
    mail({ titolo: 'Term sheet draft', corpo: 'Attached the term sheet for the round. Any comments?', da: 'Sam Roe <sam@capital.example>', ore: 2, filo: 'f-sam' })
  ]
  // lui ha già risposto dopo
  mail({ titolo: 'Investor update', corpo: 'Could you send the investor update?', da: 'Mia Fox <mia@lp.example>', ore: 40, filo: 'f-mia' })
  mail({ titolo: 'Re: Investor update', corpo: 'Here it is.', ore: 39, filo: 'f-mia', mia: true })
  // lui ha scritto per ultimo: nessun messaggio della controparte a cui rispondere
  mail({ titolo: 'Fundraising follow-up', corpo: 'Hi Ben, any news on the round?', ore: 5, filo: 'f-ben', mia: true })
  // non è un investitore
  mail({ titolo: 'Dinner on Friday?', corpo: 'Are you free for dinner on Friday?', da: 'Zoe <zoe@amici.example>', ore: 3, filo: 'f-zoe' })
  return attese
}

const tre = (genere = 'risposta') => ({ lavori: [1, 2, 3, 4].map(i => ({ doc: `D${i}`, genere, perche: 'Waiting since yesterday.' })) })

let k = 0
function post(testo: string, giorniFa: number) {
  const d = x.documentoMio({
    postId: String(1850000000000000000n + BigInt(++k)), testo, url: null, risposta: false,
    quando: new Date(ORA - giorniFa * GIORNO).toISOString(),
    numeri: { visualizzazioni: 1000, mipiace: 10, repost: 1, risposte: 2, segnalibri: 1 }
  }, false)!
  store.salvaDocumenti([d])
}
const postX = () => { for (let i = 0; i < 4; i++) post(`Building in public, day ${i}: the twin reads my mail so I don't have to.`, i + 1) }
/** Due carte di idee per X prese da lui nelle ultime due settimane. */
function ciConta(origine: string) {
  for (const g of ['2026-10-10', '2026-10-12']) {
    tracce.inizia({ compito: `${origine}-${g}` })
    tracce.decidi(`${origine}-${g}`, 'accettato')
  }
}

// — senza un lato —

test('senza un lato scelto il giro non propone niente, e le idee per X e il copione nascono come prima', async () => {
  investitori()
  lavoro.perProva({ chiedi: (async () => tre()) as never })
  assert.deepEqual(await lavoro.giro(ORA, { pronto: SI }), [])
  assert.equal(candidati.aperti().filter(c => lati.suo(c.carta.origine)).length, 0)
  assert.equal(lavoro.tieneRicorrente('x', ORA), true)
  assert.equal(lavoro.tieneRicorrente('video', ORA), true)
  postX()
  const nate = await daSe.giro(ORA, { pronto: SI, pagina: () => false })
  assert.ok(nate.some(id => id.startsWith('idee-x-')), nate.join(', '))
})

// — investitori —

test('investitori: fino a tre candidati del lato, col progetto, il messaggio arrivato come doc, modo bozza, e passano davanti alle idee per X', async () => {
  const progetto = scegli('investitori')
  const attese = investitori()
  let visto: { system: string; messages: { content: string }[] } | null = null
  lavoro.perProva({ chiedi: (async (o: never) => { visto = o; return tre() }) as never })
  const ids = await lavoro.giro(ORA, { pronto: SI })
  assert.equal(ids.length, 3, ids.join(', '))
  assert.match(visto!.system, /SIDE NIGHT JOBS/)
  const utente = visto!.messages[0]!.content
  assert.match(utente, /\[D1\] From: Sam Roe/, 'il più nuovo per primo')
  assert.match(utente, /\[D4\]/)
  assert.ok(!/\[D5\]/.test(utente), 'solo i quattro fili che aspettano lui')
  assert.ok(!/Zoe|Mia Fox|Ben/.test(utente), utente)
  for (const id of ids) {
    const c = candidati.leggi(id)!
    assert.equal(c.progetto, progetto)
    assert.equal(c.carta.origine, lati.ORIGINE)
    assert.equal(c.carta.modo, 'bozza')
    assert.ok(attese.includes(c.carta.doc!), c.carta.doc!)
    const d = store.documento(c.carta.doc!)!
    assert.equal(!!d.inviato, false, 'il doc è il messaggio arrivato')
    assert.equal(c.stato, 'scelto')
  }
  assert.deepEqual(new Set(ids.map(id => candidati.leggi(id)!.carta.doc)), new Set(attese.slice(1)), 'i tre che il modello ha messo per primi')
  assert.ok(lati.leggi().ultimoGiro)

  // le idee per X: lui ci conta, e nascono anche loro; nella coda vengono dopo
  ciConta(daSe.ORIGINE_X)
  postX()
  const nate = await daSe.giro(ORA, { pronto: SI, pagina: () => false })
  const idea = nate.find(id => id.startsWith('idee-x-'))
  assert.ok(idea, nate.join(', '))
  const carte = ids.map(id => candidati.leggi(id)!.compito!)
  for (const c of carte) assert.ok(candidati.punteggioDellaCarta(c) > candidati.punteggioDellaCarta(idea!), 'la politica pesa di più il lato')
  turno.perProva({ assente: () => true })
  const ordine = turno.pronte(new Date(ORA)).map(c => c.id)
  assert.ok(ordine.includes(idea!), ordine.join(', '))
  for (const c of carte) assert.ok(ordine.indexOf(c) >= 0 && ordine.indexOf(c) < ordine.indexOf(idea!), ordine.join(', '))
})

// — i modelli fissi —

test('le idee per X e il copione non nascono col lato investitori, fatture, partner o clienti se non ci conta; nascono col lato x o video, e con due prese in 14 giorni', async () => {
  for (const id of ['investitori', 'fatture', 'partner', 'clienti'] as const) {
    pulisci()
    scegli(id)
    assert.equal(lavoro.tieneRicorrente('x', ORA), false, id)
    assert.equal(lavoro.tieneRicorrente('video', ORA), false, id)
  }
  postX()
  assert.ok(!(await daSe.giro(ORA, { pronto: SI, pagina: () => false })).some(id => id.startsWith('idee-x-')), 'col lato clienti niente idee per X')
  // due prese di idee per X: ci conta, e tornano; il copione no
  ciConta(daSe.ORIGINE_X)
  assert.equal(lavoro.tieneRicorrente('x', ORA), true)
  assert.equal(lavoro.tieneRicorrente('video', ORA), false)
  // una sola presa non basta, e una scartata non conta
  pulisci(); scegli('partner')
  tracce.inizia({ compito: 'copione-video-p1-2026-10-11' }); tracce.decidi('copione-video-p1-2026-10-11', 'modificato')
  tracce.inizia({ compito: 'copione-video-p1-2026-10-13' }); tracce.decidi('copione-video-p1-2026-10-13', 'scartato')
  assert.equal(lavoro.tieneRicorrente('video', ORA), false)
  // il lato è proprio quello
  pulisci(); scegli('x')
  assert.equal(lavoro.tieneRicorrente('x', ORA), true)
  assert.equal(lavoro.tieneRicorrente('video', ORA), false)
  postX()
  assert.ok((await daSe.giro(ORA, { pronto: SI, pagina: () => false })).some(id => id.startsWith('idee-x-')))
  pulisci(); scegli('video')
  assert.equal(lavoro.tieneRicorrente('video', ORA), true)
  // col lato x la notte del lato non propone niente: il lavoro lo fa `da-se`
  pulisci(); scegli('x'); investitori()
  lavoro.perProva({ chiedi: (async () => tre()) as never })
  assert.deepEqual(await lavoro.giro(ORA, { pronto: SI }), [])
})

// — ieri —

test('due scarti di ieri dello stesso genere: meno lavori stanotte, e niente di quel genere', async () => {
  const progetto = scegli('investitori')
  investitori()
  for (const c of ['lato-risposta-aaaa', 'lato-risposta-bbbb']) {
    tracce.inizia({ compito: c, progetto })
    tracce.decidi(c, 'scartato')
  }
  // uno scarto di un altro progetto non conta
  tracce.inizia({ compito: 'lato-nota-cccc', progetto: 'altro' }); tracce.decidi('lato-nota-cccc', 'scartato')
  const i = lavoro.ieri(progetto, ORA)
  assert.deepEqual(i.scarti, { risposta: 2, nota: 0 })
  assert.deepEqual(lavoro.misura(i), { tetto: 2, generi: ['nota'] })
  let visto = ''
  lavoro.perProva({ chiedi: (async (o: { messages: { content: string }[] }) => { visto = o.messages[0]!.content; return { lavori: [...tre().lavori, { doc: 'D1', genere: 'nota', perche: 'Four investors are waiting.' }] } }) as never })
  const ids = await lavoro.giro(ORA, { pronto: SI })
  assert.equal(ids.length, 1, ids.join(', '))
  const c = candidati.leggi(ids[0]!)!
  assert.match(c.carta.id!, /^lato-nota-/)
  assert.equal(c.carta.doc, null)
  assert.equal(c.carta.modo, 'tutto')
  assert.match(c.carta.nota ?? '', /Sam Roe/)
  assert.match(visto, /at most 2 jobs, kinds allowed: nota/)
  assert.match(visto, /2 replies discarded/)
  // anche il ripiego rispetta ieri
  assert.deepEqual(lavoro.ripiego(lavoro.fili(ORA), lavoro.misura(i)).map(l => l.genere), ['nota'])
})

// — il modello giù —

test('il modello non risponde: i tre fili aperti più nuovi', async () => {
  scegli('investitori')
  const attese = investitori()
  lavoro.perProva({ chiedi: (async () => null) as never })
  const ids = await lavoro.giro(ORA, { pronto: SI })
  assert.deepEqual(new Set(ids.map(id => candidati.leggi(id)!.carta.doc)), new Set([attese[3], attese[2], attese[1]]))
  // un modello che lancia è come uno giù
  pulisci(); scegli('investitori'); const di = investitori()
  lavoro.perProva({ chiedi: (async () => { throw new Error('giù') }) as never })
  assert.equal((await lavoro.giro(ORA, { pronto: SI })).length, 3)
  // etichette inventate: il ripiego, non il nulla
  pulisci(); scegli('investitori'); investitori()
  lavoro.perProva({ chiedi: (async () => ({ lavori: [{ doc: 'D99', genere: 'risposta', perche: 'x' }] })) as never })
  assert.equal((await lavoro.giro(ORA, { pronto: SI })).length, 3)
  assert.ok(di.length)
  // senza motore, come il lavoro da sé: niente
  pulisci(); scegli('investitori'); investitori()
  assert.deepEqual(await lavoro.giro(ORA, { pronto: () => false }), [])
})

// — il destinatario —

test('la bozza va alla controparte, mai a lui: anche in un filo dove lui aveva scritto prima', async () => {
  const progetto = scegli('investitori')
  // lui scrive, lei risponde: l'ultimo messaggio è di Nora, ed è a lei che va la risposta
  mail({ titolo: 'Seed round deck', corpo: 'Hi Nora, here is the deck for the seed round.', ore: 30, filo: 'f-nora', mia: true })
  const suo = mail({ titolo: 'Re: Seed round deck', corpo: 'Thanks Tobia. Could you send the cap table too?', da: 'Nora Vance <nora@fund.example>', ore: 6, filo: 'f-nora' })
  // un filo dove lui ha scritto per ultimo resta fuori: non c'è un suo messaggio a cui rispondere
  mail({ titolo: 'Round follow-up', corpo: 'Hi Ben, any news on the round?', ore: 4, filo: 'f-ben', mia: true })
  assert.deepEqual(lavoro.fili(ORA).map(f => f.d.id), [suo])
  lavoro.perProva({ chiedi: (async () => null) as never })
  const [id] = await lavoro.giro(ORA, { pronto: SI })
  const cand = candidati.leggi(id!)!
  const carta = store.compito(cand.compito!)!
  assert.equal(carta.doc, suo)
  assert.equal(carta.progetto, progetto)
  // il pacchetto del seguito: la controparte è chi ha scritto
  const p = seguito.pacchettoDi(carta.id)!
  assert.equal(p.conversazione.cliente.indirizzo, 'nora@fund.example')
  assert.equal(p.conversazione.doc, suo)
  assert.ok(p.conversazione.prove.some(x => x.chi === 'You'), 'il suo messaggio prima è nelle prove')

  // la carta vera, nella coda vera: la stesura passa dal seguito, e la casella riceve la bozza per Nora
  const bozze: { doc: string; e: import('./store.ts').EmailPronta }[] = []
  seguito.perProva({
    chiedi: (async () => ({ risposta: 'Thanks Nora, I will send the cap table.', oggetto: '', cambia_documento: false, documento: { testo: '', cambiamenti: [] }, impegni: [], perche: 'She asked for it.' })) as never,
    salvaBozza: async (_c, doc, e) => { bozze.push({ doc, e }); return { stato: 'salvata', id: 'bozza-1', url: '' } },
    postaCollegata: () => true,
    voce: () => null
  })
  const fasi: string[] = []
  const smetti = compiti.ascolta(e => { if ('id' in e && e.id === carta.id) fasi.push(e.fase) }, null)
  compiti.affida(carta.id, 'bozza', false)
  for (let i = 0; i < 1500 && !fasi.some(f => f === 'pronto' || f === 'richiamato' || f === 'guaio'); i++) await new Promise(r => setTimeout(r, 20))
  smetti()
  assert.ok(fasi.includes('pronto'), fasi.join(', '))
  assert.equal(bozze.length, 1)
  assert.equal(bozze[0]!.doc, suo)
  assert.equal(bozze[0]!.e.a, 'nora@fund.example')
  assert.notEqual(bozze[0]!.e.a, IO)
  assert.equal(bozze[0]!.e.rispondeA?.messageId, store.documento(suo)!.messageId)
  assert.equal(store.compito(carta.id)!.email?.a, 'nora@fund.example')
})

// — la fonte —

test('candidati: la carta del lato regge finché il filo aspetta lui, e cade quando lui ha risposto', async () => {
  scegli('clienti')
  const doc = mail({ titolo: 'Quote for the new site', corpo: 'Could you send the quote for the new site?', da: 'Ivo Gale <ivo@cliente.example>', ore: 8, filo: 'f-ivo' })
  lavoro.perProva({ chiedi: (async () => ({ lavori: [{ doc: 'D1', genere: 'risposta', perche: 'He asked for a quote.' }] })) as never })
  const [id] = await lavoro.giro(ORA, { pronto: SI })
  const cand = candidati.leggi(id!)!
  const carta = store.compito(cand.compito!)!
  assert.equal(candidati.valido(cand, ORA), true)
  assert.equal(candidati.cartaValida(carta, ORA), true)
  assert.equal(lavoro.fonteValida(doc, ORA), true)
  // lui risponde dal suo programma di posta
  mail({ titolo: 'Re: Quote for the new site', corpo: 'Here it is.', ore: 1, filo: 'f-ivo', mia: true })
  assert.equal(lavoro.fonteValida(doc, ORA), false)
  assert.equal(candidati.valido(cand, ORA), false)
  assert.equal(candidati.cartaValida(carta, ORA), false)
  // la pausa non la ritira: la trattiene il turno
  const altro = mail({ titolo: 'Revision on the brief', corpo: 'Can we get a revision of the brief by Monday?', da: 'Ivo Gale <ivo@cliente.example>', ore: 0.5, filo: 'f-ivo-2' })
  const [id2] = await lavoro.giro(ORA + 60_000, { pronto: SI })
  const c2 = store.compito(candidati.leggi(id2!)!.compito!)!
  assert.equal(c2.doc, altro)
  cfg.aggiorna({ autonomia: 'chiedere' as never })
  assert.equal(candidati.cartaValida(c2, ORA), true)
  turno.perProva({ assente: () => true })
  assert.ok(!turno.pronte(new Date(ORA)).some(c => c.id === c2.id), 'in pausa aspetta')
  cfg.aggiorna({ autonomia: 'preparare' as never })
  assert.ok(turno.pronte(new Date(ORA)).some(c => c.id === c2.id))
})

// — due persone —

test('due persone: il lato dell\'una non si vede nell\'altra, e chi non ha scelto non riceve niente', async () => {
  const a = await conti.registra('anna@lato-prova.example', 'passwordlunga1')
  const b = await conti.registra('bruno@lato-prova.example', 'passwordlunga2')
  assert.ok(a.ok && b.ok)
  const anna = a.ok ? a.id : '', bruno = b.ok ? b.id : ''
  lavoro.perProva({ chiedi: (async () => null) as never })
  const diAnna = await chi.dentro(anna, async () => {
    base(); scegli('investitori'); investitori()
    return lavoro.giro(ORA, { pronto: SI })
  })
  assert.equal(diAnna.length, 3)
  const diBruno = await chi.dentro(bruno, async () => {
    base(); investitori()
    return lavoro.giro(ORA, { pronto: SI })
  })
  assert.deepEqual(diBruno, [])
  chi.dentro(bruno, () => {
    assert.equal(lati.leggi().scelto, undefined)
    assert.equal(store.elencoCompiti().filter(c => lati.suo(c.origine)).length, 0)
    assert.equal(candidati.aperti().filter(c => lati.suo(c.carta.origine)).length, 0)
  })
  chi.dentro(anna, () => {
    assert.equal(lati.leggi().scelto?.id, 'investitori')
    assert.equal(store.elencoCompiti().filter(c => lati.suo(c.origine)).length, 3)
  })
})
