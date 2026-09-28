// I filtri del feed nati dai suoi scarti (F7): le soglie, «Annulla» che li
// ritira, il cestino che li spegne, e la lettura che li rispetta davvero.
//
//   node --test server/feed-regole.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-feed-regole-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const claude = await import('./claude.ts')
const compatibile = await import('./compatibile.ts')
const feedDati = await import('./feed-dati.ts')
const ab = await import('./abitudini.ts')
const domande = await import('./domande.ts')
const nuove = await import('./memoria-nuove.ts')
const misuraFeed = await import('./misura-feed.ts')
await misuraFeed.caricaModuli()

before(() => store.azzeraTutto())
beforeEach(() => store.azzeraTutto())
after(() => {
  compatibile.usaRete(null)
  domande.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

const fraOre = (ore: number) => new Date(Date.now() - ore * 3_600_000).toISOString()
const doc = (id: string, titolo: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `Il messaggio su ${titolo}, per conoscenza.`,
  autore: 'Rossi <rossi@esempio.it>', percorso: 'INBOX', quando: fraOre(2), gruppo: 'posta', ...sopra
})
let n = 0
/** Una carta nata da un documento e chiusa: con «Non è mia», o senza una parola (`null`). */
function chiusa(d: Documento, ragione: 'non_mia' | 'vecchia' | null, o: { tipo?: string; stato?: 'scartato' | 'fatto' } = {}): string {
  store.salvaDocumenti([d])
  store.salvaFeed([{ tipo: o.tipo ?? 'Da decidere', titolo: `Carta ${++n} ${d.titolo}`, testo: 'Il testo della carta.', perche: 'Chi aspetta e da quando.', fonte: d.fonte, doc: d.id }])
  const v = store.elencoFeed('aperto').find(x => x.doc === d.id)!
  if (o.stato === 'fatto') store.cambiaStatoFeed(v.id, 'fatto', 'Già fatto.', 'lui')
  else store.cambiaStatoFeed(v.id, 'scartato', ragione ? 'prova' : 'Non mi interessa.', ragione)
  return v.id
}
const riga = (chiave: string) => ab.tutte().find(a => a.chiave === chiave)

test('una macchina: uno scarto è una regola in vigore, e «Annulla» la ritira senza passare da «Non valgono più»', () => {
  const id = chiusa(doc('posta:INBOX:1', 'Payout', { autore: 'Stripe <notifications@stripe.com>' }), null)
  const entrate = ab.ricalcolaFiltri()
  assert.deepEqual(entrate.map(e => e.chiave), ['feed.filtro:mittente:notifications@stripe.com'])
  assert.deepEqual(ab.chiaviDellaCarta(id).slice(0, 1), ['feed.filtro:mittente:notifications@stripe.com'])
  const r = riga('feed.filtro:mittente:notifications@stripe.com')!
  assert.equal(r.inVigore, true); assert.equal(r.dati.specie, 'macchina'); assert.equal(r.dati.nome, 'Stripe'); assert.equal(r.casi, 1)
  assert.deepEqual(ab.ricalcolaFiltri(), [], 'già in vigore: non entra una seconda volta')
  store.cambiaStatoFeed(id, 'aperto')
  ab.ricalcolaFiltri()
  assert.equal(riga('feed.filtro:mittente:notifications@stripe.com'), undefined)
  assert.equal(ab.tutte().filter(a => a.stato === 'superata').length, 0)
})

test('una persona: due scarti si vedono, il terzo vale; una carta fatta da lei la toglie; «vecchia» non conta', () => {
  const tom = (i: number) => doc(`posta:INBOX:2${i}`, `Nota ${i}`, { autore: 'Tom Reed <tom@reed.example>' })
  chiusa(tom(1), 'non_mia')
  chiusa(tom(2), 'vecchia')
  ab.ricalcolaFiltri()
  assert.equal(riga('feed.filtro:mittente:tom@reed.example'), undefined, 'uno scarto «Non è mia» non si vede ancora')
  chiusa(tom(3), null)
  ab.ricalcolaFiltri()
  const due = riga('feed.filtro:mittente:tom@reed.example')!
  assert.ok(due); assert.equal(due.casi, 2); assert.equal(due.inVigore, false); assert.equal(due.dati.specie, 'persona'); assert.equal(due.dati.nome, 'Tom Reed')
  chiusa(tom(4), 'non_mia')
  const entrate = ab.ricalcolaFiltri()
  assert.deepEqual(entrate.map(e => e.chiave), ['feed.filtro:mittente:tom@reed.example'])
  assert.equal(riga('feed.filtro:mittente:tom@reed.example')!.inVigore, true)
  assert.ok(ab.filtriInVigore().persone.has('tom@reed.example'))
  // una carta sua fatta: la sua posta a volte è sua
  chiusa(tom(5), null, { stato: 'fatto' })
  ab.ricalcolaFiltri()
  assert.equal(riga('feed.filtro:mittente:tom@reed.example'), undefined)
})

test('il dominio della posta automatica: tre scarti da due indirizzi; mai un dominio di tutti; il genere di carta da una fonte', () => {
  chiusa(doc('posta:INBOX:31', 'Promo uno', { autore: 'Acme <newsletter@acme.example>' }), null)
  chiusa(doc('posta:INBOX:32', 'Promo due', { autore: 'Acme <newsletter@acme.example>' }), null)
  ab.ricalcolaFiltri()
  assert.equal(riga('feed.filtro:dominio:acme.example'), undefined, 'un indirizzo solo: basta la sua regola')
  chiusa(doc('posta:INBOX:33', 'Avviso', { autore: 'Acme <alerts@acme.example>' }), null)
  ab.ricalcolaFiltri()
  const dominio = riga('feed.filtro:dominio:acme.example')!
  assert.ok(dominio); assert.equal(dominio.casi, 3); assert.equal(dominio.inVigore, true)
  assert.equal(ab.filtroMacchina('Acme <billing-noreply@acme.example>', ab.filtriInVigore()), 'feed.filtro:dominio:acme.example')
  assert.equal(ab.filtroMacchina('Ana <ana@acme.example>', ab.filtriInVigore()), null, 'una persona sotto quel dominio non è una macchina')
  for (let i = 0; i < 3; i++) chiusa(doc(`posta:INBOX:34${i}`, `G ${i}`, { autore: `Bot <noreply${i}@gmail.com>` }), null)
  ab.ricalcolaFiltri()
  assert.equal(riga('feed.filtro:dominio:gmail.com'), undefined)
  // tre «Da leggere» dalla posta, da tre persone diverse: il genere
  for (let i = 0; i < 3; i++) chiusa(doc(`posta:INBOX:35${i}`, `Aggiornamento ${i}`, { autore: `P${i} <p${i}@diversi.example>` }), null, { tipo: 'Da leggere' })
  ab.ricalcolaFiltri()
  const genere = riga('feed.filtro:tipo:posta|Da leggere')!
  assert.ok(genere); assert.equal(genere.inVigore, true)
  const f = ab.filtriInVigore()
  assert.equal(ab.filtroTipo({ fonte: 'posta', tipo: 'Da leggere' }, 'Il report è in allegato.', f), 'feed.filtro:tipo:posta|Da leggere')
  assert.equal(ab.filtroTipo({ fonte: 'posta', tipo: 'Da leggere' }, 'Can you confirm by Friday?', f), null, 'chi chiede qualcosa passa')
  assert.equal(ab.filtroTipo({ fonte: 'posta', tipo: 'Scadenza' }, 'Il report è in allegato.', f), null)
})

test('il cestino: la regola non rinasce, il punto e le mancate non tacciono più quel mittente, e dopo dieci minuti resta solo la chiave', () => {
  chiusa(doc('posta:INBOX:4', 'Payout', { autore: 'Stripe <notifications@stripe.com>' }), null)
  ab.ricalcolaFiltri()
  assert.deepEqual(store.mittentiScartati().indirizzi, ['notifications@stripe.com'])
  const adesso = new Date()
  ab.cambia('feed.filtro:mittente:notifications@stripe.com', 'togli', undefined, undefined, adesso)
  assert.deepEqual(store.mittentiScartati().indirizzi, [], 'una regola tolta tace ancora il mittente')
  ab.ricalcolaFiltri()
  assert.equal(riga('feed.filtro:mittente:notifications@stripe.com'), undefined, 'una tolta è rinata')
  assert.equal(ab.filtriInVigore().macchine.size, 0)
  ab.ricalcolaFiltri(new Date(adesso.getTime() + 11 * 60_000))
  const grezza = store.default.prepare("SELECT dati, prova FROM abitudini WHERE chiave = 'feed.filtro:mittente:notifications@stripe.com'").get() as { dati: string; prova: string }
  assert.equal(grezza.dati, '{}'); assert.doesNotMatch(grezza.prova, /Payout/)
})

test('quello che un filtro tiene fuori si vede sotto la regola: quante questa settimana, e le ultime con «Portami lì»; il punto della Memoria si accende', () => {
  const vista = new Date(Date.now() - 60_000).toISOString()
  chiusa(doc('posta:INBOX:5', 'Payout', { autore: 'Stripe <notifications@stripe.com>' }), null)
  ab.ricalcolaFiltri()
  store.salvaDocumenti([doc('posta:INBOX:51', 'Your weekly summary', { autore: 'Stripe <notifications@stripe.com>' })])
  feedDati.segnaEsame([{ doc: 'posta:INBOX:51', fase: 'filtro', motivo: 'feed.filtro:mittente:notifications@stripe.com' }])
  const r = riga('feed.filtro:mittente:notifications@stripe.com')!
  assert.equal(r.trattenute, 1)
  assert.equal(r.esempi[0]!.testo, 'Your weekly summary'); assert.equal(r.esempi[0]!.doc, 'posta:INBOX:51'); assert.equal(r.esempi[0]!.trattenuta, true)
  assert.equal(nuove.nuove(vista).quante, 1)
  assert.equal(nuove.nuove(vista).dove, 'come-lavori')
  // non entra nel ritratto
  assert.equal(ab.perIlRitratto(), '')
})

/** Il fornitore finto: registra quello che gli si manda, risponde con le voci date. */
function fornitoreFinto(voci: object[]) {
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: Record<string, unknown>[] = []
  compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    return Response.json({
      id: 'chatcmpl-1', model: 'gpt-prova',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ voci }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    })
  }) as typeof fetch)
  return ricevute
}
const testoDi = (r: Record<string, unknown>) => (r.messages as { content: string }[]).map(m => m.content).join('\n')
const fase = (id: string) => feedDati.esameDi([id]).get(id)

test('la lettura: la macchina fuori con «filtro»; la persona con la regola passa se chiede, e dopo il cestino passa comunque', async () => {
  chiusa(doc('posta:INBOX:60', 'Payout', { autore: 'Stripe <notifications@stripe.com>', quando: fraOre(80) }), null)
  for (let i = 1; i <= 3; i++) chiusa(doc(`posta:INBOX:6${i}`, `Nota ${i}`, { autore: 'Tom Reed <tom@reed.example>', quando: fraOre(70 - i) }), 'non_mia')
  ab.ricalcolaFiltri()
  const macchina = doc('posta:INBOX:70', 'Your payout failed', { autore: 'Stripe <notifications@stripe.com>', corpo: 'Please update your bank details by Friday.' })
  const fyi = doc('posta:INBOX:71', 'Weekly notes', { autore: 'Tom Reed <tom@reed.example>', corpo: 'The weekly notes from the team, just so you have them.' })
  const chiede = doc('posta:INBOX:72', 'Pilot dates', { autore: 'Tom Reed <tom@reed.example>', corpo: 'Can you confirm by Friday?' })
  store.salvaDocumenti([macchina, fyi, chiede])
  let ricevute = fornitoreFinto([])
  await claude.generaFeed()
  const mandato = testoDi(ricevute[0]!)
  assert.doesNotMatch(mandato, /id: posta:INBOX:70/)
  assert.deepEqual(fase(macchina.id), { fase: 'filtro', motivo: 'feed.filtro:mittente:notifications@stripe.com', quando: fase(macchina.id)!.quando })
  assert.doesNotMatch(mandato, /id: posta:INBOX:71/, 'la posta senza richiesta di una persona filtrata è arrivata al modello')
  assert.equal(fase(fyi.id)?.fase, 'non_suo'); assert.equal(fase(fyi.id)?.motivo, 'feed.filtro:mittente:tom@reed.example')
  assert.match(mandato, /id: posta:INBOX:72/, 'una richiesta della persona filtrata è stata tolta')
  // «held back 1 this week»
  assert.equal(riga('feed.filtro:mittente:tom@reed.example')?.trattenute, 1)
  // il cestino: alla lettura dopo la sua posta passa
  ab.cambia('feed.filtro:mittente:tom@reed.example', 'togli')
  store.default.prepare('DELETE FROM feed_esame').run()
  ricevute = fornitoreFinto([])
  await claude.generaFeed()
  assert.match(testoDi(ricevute[0]!), /id: posta:INBOX:71/, 'dopo il cestino la sua posta è ancora fuori')
})

test('la lettura: il genere di carta scartato tre volte si toglie dopo il modello, salvo chi chiede; il tema spinge in fondo e il modello lo sa', async () => {
  for (let i = 0; i < 3; i++) chiusa(doc(`posta:INBOX:80${i}`, `Aggiornamento ${i}`, { autore: `P${i} <p${i}@diversi.example>`, quando: fraOre(90 - i) }), null, { tipo: 'Da leggere' })
  ab.ricalcolaFiltri()
  const info = doc('posta:INBOX:81', 'Staging build', { autore: 'Ana <ana@studio.example>', corpo: 'There is an issue with the staging build, details below.' })
  store.salvaDocumenti([info])
  const ricevute = fornitoreFinto([{ tipo: 'Da leggere', titolo: 'Review the staging build issue', testo: 'Ana reports an issue with the staging build and shares the details.', urgenza: '', fonte: 'posta', doc: info.id, perche: 'Ana found an issue with the staging build.', prova: 'There is an issue with the staging build' }])
  const voci = await claude.generaFeed()
  assert.equal(ricevute.length, 1)
  assert.equal(voci.length, 0, 'una carta «Da leggere» dalla posta è passata')
  assert.deepEqual([fase(info.id)?.fase, fase(info.id)?.motivo], ['filtro', 'feed.filtro:tipo:posta|Da leggere'])
  // il tema: in coda, e una riga nel prompt
  store.azzeraTutto()
  ab.regolaTema('fattur', 'You set aside invoice reminders.', ['Fattura marzo', 'Fattura aprile', 'Fattura maggio'])
  const tema = doc('posta:INBOX:90', 'Fattura giugno', { autore: 'Ufficio <ufficio@acme.example>', quando: fraOre(1), corpo: 'La fattura di giugno, per conoscenza.' })
  const altra = doc('posta:INBOX:91', 'Visita', { autore: 'Ana <ana@studio.example>', quando: fraOre(3), corpo: 'Il verbale della visita, per conoscenza.' })
  store.salvaDocumenti([tema, altra])
  const r2 = fornitoreFinto([])
  await claude.generaFeed()
  const ordine = [...testoDi(r2[0]!).matchAll(/^id: (\S+)/gm)].map(m => m[1])
  assert.deepEqual(ordine, ['posta:INBOX:91', 'posta:INBOX:90'], 'il tema messo da parte non è andato in fondo')
  assert.match(String((r2[0]!.messages as { role: string; content: string }[])[0]!.content), /Ha messo da parte più volte le cose su questi temi[^\n]*\n— You set aside invoice reminders\./)
})

test('la deduzione sui temi scartati è una regola in vigore subito, e la chat dice quello che succede davvero', async () => {
  cfg.scrivi({ lingua: 'en' })
  for (let i = 0; i < 3; i++) chiusa(doc(`posta:INBOX:10${i}`, `Rinnovo abbonamento ${i}`, { autore: `Servizio ${i} <s${i}@servizi.example>` }), null)
  domande.perProva({ chiediJSON: (async () => ({ vaChiesto: false, deduzione: 'You do not care about subscription renewals.', domanda: '' })) as never })
  const esito = await domande.forseChiedi()
  assert.equal(esito.chiesta, false)
  const temi = ab.filtriInVigore().temi
  assert.ok(temi.length >= 1, 'la deduzione non è diventata una regola')
  const t = ab.tutte().find(a => a.chiave === temi[0]!.chiave)!
  assert.equal(t.inVigore, true); assert.equal(t.dati.frase, 'You do not care about subscription renewals.')
  const chat = store.messaggi('myynd').map(m => m.text).join('\n')
  assert.match(chat, /From now on these go to the bottom of your feed\. The rule is in Memory if you want to remove it\./)
  assert.doesNotMatch(chat, /stop suggesting/)
  // e le convinzioni indotte non si riempiono più di deduzioni che nessuno legge
  assert.equal(store.convinzioni().filter(k => k.origine === 'scarti').length, 0)
})

test('alla lettura i filtri si rifanno al massimo una volta l’ora; gli scarti li rifanno subito', () => {
  store.azzeraTutto()
  const adesso = new Date()
  ab.ricalcolaFiltriSeServe(adesso)
  const primo = store.cursore('abitudini:filtri')
  assert.ok(primo, 'la prima lettura non ha contato i filtri')
  ab.ricalcolaFiltriSeServe(new Date(adesso.getTime() + 10 * 60_000))
  assert.equal(store.cursore('abitudini:filtri'), primo, 'dieci minuti dopo ha ricontato')
  const dopo = new Date(adesso.getTime() + 61 * 60_000)
  ab.ricalcolaFiltriSeServe(dopo)
  assert.equal(store.cursore('abitudini:filtri'), dopo.toISOString())
  // uno scarto non aspetta l'ora: la sua rotta chiama `ricalcolaFiltri`, che conta sempre
  const ancora = new Date(dopo.getTime() + 60_000)
  ab.ricalcolaFiltri(ancora)
  assert.equal(store.cursore('abitudini:filtri'), ancora.toISOString())
})
