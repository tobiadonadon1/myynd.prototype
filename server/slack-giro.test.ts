// Slack su uno spazio finto, via HTTP: copertura, fili, segni fra un giro e
// l'altro, modifiche e cancellazioni, il 429, la corsia corta, i nomi, i
// link, le domande aperte e chiuse, le promesse, le esclusioni, l'invio.
//
//   node --import ./build/test-profile.mjs --test server/slack-giro.test.ts

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as finto from '../prove/finto-slack.ts'
import * as slack from './connettori/slack.ts'
import * as seg from './slack-segnali.ts'
import * as store from './store.ts'
import db from './store.ts'

let f: finto.Finto
const C = (x: Partial<slack.ConfigSlack> = {}): slack.ConfigSlack => ({ token: finto.TOKEN, giorni: 30, ...x })

beforeEach(async () => {
  f = await finto.avvia()
  process.env.MYYND_DEV = '1'
  process.env.MYYND_SLACK_URL = f.url
  store.segnaCursore(slack.perProva.SEGNO, null)
  db.exec("DELETE FROM segnali WHERE genere LIKE 'slack.%'")
  store.scordaDocumenti([...store.quandoPerPrefisso('slack:').keys()])
})
afterEach(async () => { await f.chiudi() })

/** Un giro come lo fa il server: scrive i documenti, toglie quelli spariti, registra i segnali. */
async function giro(c = C(), o: { veloce?: boolean; budget?: number } = {}) {
  const esistenti = store.quandoPerPrefisso('slack:')
  const e = o.veloce
    ? await slack.corsiaVeloce(c, { esistenti, ...(o.budget ? { budget: o.budget } : {}) })
    : await slack.sincronizza(c, undefined, { esistenti, ...(o.budget ? { budget: o.budget } : {}) })
  assert.ok(e)
  await store.salvaDocumentiAPezzi(e.docs)
  store.scordaDocumenti(e.tolti)
  seg.registra(e)
  return e
}
const corpo = (id: string) => store.documento(id)?.corpo ?? ''
const idDi = (e: slack.EsitoSlack) => e.docs.map(d => d.id)
const posti = (ids: string[]) => new Set(ids.map(id => id.split(':')[1]))

test('il primo giro copre ogni conversazione di cui fa parte, salta le archiviate e quelle non sue', async () => {
  const e = await giro()
  const p = posti(idDi(e))
  assert.equal(p.size, 67, [...p].join(','))
  for (const id of ['D0NORA', 'D0TOM', 'D0LISA', 'G0MP', 'G0LEAD', 'C0T060']) assert.ok(p.has(id), id)
  assert.ok(!p.has('C0OLD') && !p.has('C0NOTME'))
  assert.equal(e.falliti.length, 0)
  assert.equal(e.troncato, false)
  assert.deepEqual(e.resto, { aGiorno: true, totale: 67, letti: 67, restano: 0 })
})

test('le pagine: #general ha più di duecento messaggi e si legge fino al trentesimo giorno', async () => {
  const e = await giro()
  const storie = f.richieste.filter(r => r.metodo === 'conversations.history' && r.q.channel === 'C0GEN')
  assert.ok(storie.length >= 2, 'almeno due pagine')
  assert.ok(storie.some(r => r.q.cursor), 'con il cursore')
  const giorni = e.docs.filter(d => d.id.startsWith('slack:C0GEN:'))
  assert.ok(giorni.length >= 19, String(giorni.length))
  assert.ok(e.docs.some(d => d.corpo.includes('Aggiornamento 0:')), 'il messaggio più vecchio c’è')
})

test('ogni filo con risposte è un documento: la radice e tutte le risposte, anche quello di cinque giorni fa', async () => {
  const e = await giro()
  const fili = e.docs.filter(d => d.tipo === 'filo')
  assert.equal(fili.length, 4)
  const t1 = fili.find(d => d.corpo.includes('revised deck'))!
  assert.match(t1.corpo, /Tom Brill: I can help with slides/)
  assert.match(t1.corpo, /Alex Rivera: Sure, I'll send it by Friday 👍/)
  assert.match(t1.corpo, /^Persone: Nora Vance, Tom Brill, Alex Rivera/)
  assert.ok(fili.some(d => d.corpo.includes('Timeline looks right to me')))
  // le risposte non stanno anche nel giorno del canale
  assert.ok(!corpo('slack:C0ACME:' + e.docs.find(d => d.id.startsWith('slack:C0ACME:2'))!.id.split(':')[2]).includes('I can help with slides'))
})

test('i nomi, i canali, i link e le faccine in chiaro; i messaggi di servizio fuori; il file di testo letto, il PDF solo nominato', async () => {
  const e = await giro()
  const tutto = e.docs.map(d => d.corpo).join('\n')
  assert.ok(!/<@U|U0NORA|U0ME/.test(tutto.replace(/https:\S+/g, '')), 'nessun id di persona')
  assert.match(tutto, /Il brief sta in #proj-acme, vedi il brief \(https:\/\/example\.com\/brief\) 🎉/)
  assert.match(tutto, /Nora Vance: Alex Rivera can you send the revised deck/)
  assert.ok(!tutto.includes('has joined the channel'))
  // un giorno di canale con la sola riga di un'app non è una conversazione
  assert.ok(!tutto.includes('Deploy finished'))
  assert.match(tutto, /File: notes\.txt \(text\) https:\/\/northwind-studio\.slack\.com\/files\/U0ME\/F0NOTE\/notes\.txt\n {2}Scope: three screens and a login\./)
  assert.match(tutto, /File: contract\.pdf \(pdf\)/)
  assert.deepEqual(f.scaricati, ['F0NOTE'], 'il PDF da 300 KB non si scarica')
  // il gruppo si chiama con le persone, non con le maniglie, e senza di lui
  assert.ok(e.docs.some(d => d.id.startsWith('slack:G0MP:') && d.titolo.startsWith('Nora Vance, Tom Brill ·')))
})

test('i link ai messaggi e l’ora di ogni messaggio, separata da quando Myynd l’ha visto', async () => {
  const e = await giro()
  const t2 = e.docs.find(d => d.corpo.includes('Draft budget'))!
  const radice = f.conv.find(c => c.id === 'C0ACME')!.messaggi.find(m => m.text === 'Draft budget is in the doc')!
  assert.match(t2.corpo, new RegExp(`Link: https://northwind-studio\\.slack\\.com/archives/C0ACME/p${radice.ts.replace('.', '')}\\n`))
  const risposta = f.conv.find(c => c.id === 'C0ACME')!.messaggi.find(m => m.text.startsWith('What about'))!
  assert.equal(t2.quando, new Date(Number(risposta.ts) * 1000).toISOString(), 'quando = ultimo messaggio')
  assert.equal(slack.linkA('https://x.slack.com', 'C1', '1700000000.000100', '1699999999.000001'),
    'https://x.slack.com/archives/C1/p1700000000000100?thread_ts=1699999999.000001&cid=C1')
  assert.ok((store.documento(t2.id) as { indicizzato?: string } | null)?.indicizzato, 'il momento in cui l’ha visto sta a parte')
})

test('le domande: tre aperte con chi, cosa, link ed età; quelle a cui ha risposto chiuse', async () => {
  await giro()
  const aperte = seg.daRispondere()
  assert.deepEqual(aperte.map(a => [a.chi, a.domanda]).sort(), [
    ['Nora Vance', 'Hai visto la mia mail sul contratto?'],
    ['Nora Vance', 'What about the travel costs? Can you add them?'],
    ['Tom Brill', 'Are you free tomorrow for a quick call?']
  ])
  const viaggio = aperte.find(a => a.domanda.startsWith('What about'))!
  assert.match(viaggio.permalink, /\/archives\/C0ACME\/p\d+\?thread_ts=\d+\.\d+&cid=C0ACME$/)
  assert.ok(viaggio.ore >= 4 && viaggio.ore <= 6, String(viaggio.ore))
  assert.equal(viaggio.filo, viaggio.ambito.split(':')[1])
  // chiuse: la menzione nel filo (risposta), il preventivo (risposta), «ci sentiamo lunedì?» nel gruppo
  const risolti = db.prepare("SELECT ref, dati FROM segnali WHERE genere = 'slack.risolto'").all() as { ref: string; dati: string }[]
  assert.equal(risolti.length, 3)
  assert.ok(risolti.every(r => JSON.parse(r.dati).come === 'risposta'))
})

test('le promesse in italiano e in inglese, a chi le ha fatte; le decisioni nei posti dove c’era', async () => {
  await giro()
  const p = seg.promesse()
  assert.deepEqual(p.map(x => [x.chi, x.scadenza, x.fiducia]).sort(), [['Nora Vance', 'by Friday', 0.9], ['Nora Vance', 'entro venerdì', 0.9]])
  const d = seg.decisioni()
  assert.deepEqual(d.map(x => x.testo).sort(), ['Agreed, we decided to go with option B.', 'Decidiamo: si parte il 3 novembre.'])
})

test('il secondo giro riparte dai segni: rilegge solo le ultime 48 ore e costa molto meno', async () => {
  const primo = await giro()
  const prima = f.richieste.length
  const secondo = await giro()
  const nuove = f.richieste.slice(prima)
  const confine = slack.perProva.inizioGiorno(Date.now() / 1000 - 48 * 3600)
  const storie = nuove.filter(r => r.metodo === 'conversations.history')
  // i posti vivi dalle 48 ore; quello fermo da quattro giorni dal suo ultimo messaggio, non dai trenta
  for (const id of ['C0GEN', 'C0ACME', 'D0NORA', 'D0TOM', 'G0LEAD']) {
    const r = storie.find(x => x.q.channel === id)!
    assert.equal(Number(r.q.oldest), confine - 1, id)
  }
  const lisa = storie.find(x => x.q.channel === 'D0LISA')!
  assert.equal(Number(lisa.q.oldest), slack.perProva.inizioGiorno(Date.now() / 1000 - 4 * 86_400) - 1)
  const trenta = slack.perProva.inizioGiorno(Date.now() / 1000 - 30 * 86_400)
  assert.ok(storie.every(r => Number(r.q.oldest) > trenta), 'nessuno riparte dai trenta giorni')
  // i canali fermi da una settimana non si rileggono a ogni giro
  assert.ok(!nuove.some(r => r.metodo === 'conversations.history' && r.q.channel === 'C0T001'))
  assert.ok(nuove.length < primo.chiamate / 2, `${nuove.length} contro ${primo.chiamate}`)
  assert.equal(secondo.tolti.length, 0, 'niente sparisce se niente è cambiato')
  assert.equal(seg.daRispondere().length, 3, 'e i segnali non si scrivono due volte')
})

test('una modifica riscrive il documento; un messaggio cancellato sparisce, e la sua domanda si chiude', async () => {
  await giro()
  const nora = f.conv.find(c => c.id === 'D0NORA')!
  const ultimo = nora.messaggi.at(-1)!
  // la domanda nel filo del budget: cancellata da Nora
  const acme = f.conv.find(c => c.id === 'C0ACME')!
  const viaggio = acme.messaggi.find(m => m.text.startsWith('What about'))!
  f.togli('C0ACME', viaggio.ts)
  // il primo messaggio di Nora, modificato
  const primo = nora.messaggi[0]!
  primo.text = 'Ciao Alex, riesci a mandarmi il preventivo aggiornato con l’IVA?'
  primo.edited = { user: finto.NORA, ts: String(Date.now() / 1000) }
  const e = await giro()
  const giornoPrimo = e.docs.find(d => d.corpo.includes('con l’IVA'))
  assert.ok(giornoPrimo, 'la modifica è entrata')
  assert.match(giornoPrimo!.corpo, /\(modificato\)/)
  // il filo del budget è rimasto con la sola radice: esce dall'indice
  const filoBudget = `slack:C0ACME:t${viaggio.ts && acme.messaggi.find(m => m.text === 'Draft budget is in the doc')!.ts}`
  assert.ok(e.tolti.includes(filoBudget), 'il filo senza più risposte esce')
  assert.equal(store.documento(filoBudget), null)
  assert.ok(!seg.daRispondere().some(a => a.domanda.startsWith('What about')), 'la domanda cancellata non aspetta più')
  assert.ok(seg.daRispondere().some(a => a.id.endsWith(ultimo.ts)))
  // un giorno di un messaggio diretto rimasto vuoto esce
  const tom = f.conv.find(c => c.id === 'D0TOM')!
  const idTom = e.docs.find(d => d.id.startsWith('slack:D0TOM:'))?.id ?? [...store.quandoPerPrefisso('slack:D0TOM:').keys()][0]!
  f.togli('D0TOM', tom.messaggi[0]!.ts)
  const terzo = await giro()
  assert.ok(terzo.tolti.includes(idTom), idTom)
  assert.ok(!seg.daRispondere().some(a => a.chi === 'Tom Brill'), 'e la sua domanda si chiude')
})

test('una risposta tardiva a un filo di cinque giorni fa entra al giro dopo, e la domanda si chiude quando lui risponde', async () => {
  await giro()
  const acme = f.conv.find(c => c.id === 'C0ACME')!
  const radice = acme.messaggi.find(m => m.text.startsWith('Kickoff notes'))!
  f.aggiungi('C0ACME', finto.NORA, `<@${finto.ME}> did you get a chance to review the contract?`, { thread_ts: radice.ts, fa: 60 })
  await giro()
  assert.match(corpo(`slack:C0ACME:t${radice.ts}`), /did you get a chance to review the contract/)
  const q = seg.daRispondere().find(a => a.domanda.includes('review the contract'))
  assert.ok(q, 'la domanda è aperta')
  assert.equal(q!.ambito, `C0ACME:${radice.ts}`)
  f.aggiungi('C0ACME', finto.ME, 'Yes, signed and sent back', { thread_ts: radice.ts })
  await giro()
  assert.ok(!seg.daRispondere().some(a => a.domanda.includes('review the contract')), 'chiusa dalla sua risposta')
})

test('la corsia corta: un messaggio diretto nuovo e da solo entra in una passata, con la domanda aperta', async () => {
  await giro()
  const prima = f.richieste.length
  const t0 = Date.now()
  f.aggiungi('D0LISA', finto.LISA, 'Can you share the invoice for September?')
  const e = await giro(C({ utenteId: finto.ME, squadraId: 'T0NW', url: 'https://northwind-studio.slack.com/' }), { veloce: true })
  assert.ok(e.docs.some(d => d.corpo.includes('invoice for September')))
  assert.ok(Date.now() - t0 < 5000)
  const chiamate = f.richieste.slice(prima)
  assert.ok(chiamate.length <= 40, String(chiamate.length))
  assert.ok(!chiamate.some(r => r.metodo === 'auth.test'), 'la corsia corta si fida di chi sa già')
  assert.ok(chiamate.some(r => r.metodo === 'search.messages' && r.q.query.includes(`<@${finto.ME}>`)))
  assert.ok(seg.daRispondere().some(a => a.chi === 'Lisa Park' && a.domanda.includes('invoice')))
})

test('la corsia corta: una menzione in un canale fermo si legge subito, dalla ricerca', async () => {
  await giro()
  f.aggiungi('C0T005', finto.TOM, `<@${finto.ME}> can you approve the budget for team-05?`)
  const e = await giro(C({ utenteId: finto.ME, squadraId: 'T0NW', url: 'https://northwind-studio.slack.com/' }), { veloce: true })
  assert.ok(e.docs.some(d => d.id.startsWith('slack:C0T005:') && d.corpo.includes('approve the budget')))
  assert.ok(seg.daRispondere().some(a => a.dove === '#team-05'))
})

test('la corsia corta salta se il giro lungo sta girando (counter-case: non si sovrappongono)', async () => {
  const lungo = slack.sincronizza(C())
  const corta = await slack.corsiaVeloce(C({ utenteId: finto.ME, squadraId: 'T0NW', url: 'https://northwind-studio.slack.com/' }))
  assert.equal(corta, null)
  await lungo
})

test('il 429: si aspetta quanto dice Slack e si va avanti', async () => {
  f.limita('conversations.history', 2, 0)
  const e = await giro()
  assert.equal(e.fermato, undefined)
  assert.equal(posti(idDi(e)).size, 67)
  assert.ok(f.richieste.filter(r => r.metodo === 'conversations.history').length >= 69)
})

test('il 429 lungo: il giro si ferma senza errore, tiene quello che ha, e il giro dopo riprende', async () => {
  // dopo i primi messaggi diretti, Slack dice «due minuti»
  const e1 = await giro(C(), { budget: 8 })
  assert.equal(e1.fermato, 'tetto')
  f.limita('conversations.history', 1, 120)
  const e2 = await giro()
  assert.equal(e2.fermato, 'limite')
  assert.equal(e2.troncato, true)
  const e3 = await giro()
  assert.equal(e3.fermato, undefined)
  assert.equal(posti([...store.quandoPerPrefisso('slack:').keys()]).size, 67)
})

test('il tetto delle chiamate: prima i messaggi diretti e le menzioni, poi i canali; giro dopo giro si arriva in fondo', async () => {
  const e = await giro(C(), { budget: 15 })
  assert.equal(e.fermato, 'tetto')
  const p = posti(idDi(e))
  for (const id of ['D0NORA', 'D0TOM', 'D0LISA', 'G0MP']) assert.ok(p.has(id), id)
  assert.ok(p.has('C0ACME'), 'il canale dove lo hanno nominato prima degli altri')
  let giri = 1
  let ultimo = e
  while (ultimo.troncato && giri < 20) { ultimo = await giro(C(), { budget: 15 }); giri++ }
  assert.equal(ultimo.troncato, false)
  assert.equal(posti([...store.quandoPerPrefisso('slack:').keys()]).size, 67)
  assert.ok(giri > 2, String(giri))
})

test('le esclusioni: un posto escluso non si legge, ed esce dall’indice', async () => {
  await giro()
  assert.ok(store.quandoPerPrefisso('slack:C0ACME:').size > 0)
  const e = await giro(C({ esclusi: ['C0ACME'] }))
  assert.ok(!f.richieste.slice(-e.chiamate).some(r => r.q.channel === 'C0ACME'))
  assert.equal(store.quandoPerPrefisso('slack:C0ACME:').size, 0)
  seg.dimenticaConversazione('C0ACME')
  assert.ok(!seg.daRispondere().some(a => a.conversazione === 'C0ACME'))
  assert.ok(!slack.statoPerScheda().posti.some(p => p.id === 'C0ACME'))
})

test('nessun giro di fondo manda niente; l’invio parte solo da `invia`, in POST, e torna il link', async () => {
  await giro()
  await giro(C({ utenteId: finto.ME, squadraId: 'T0NW', url: 'https://northwind-studio.slack.com/' }), { veloce: true })
  assert.equal(f.conteggi.get('chat.postMessage') ?? 0, 0)
  const acme = f.conv.find(c => c.id === 'C0ACME')!
  const radice = acme.messaggi.find(m => m.text === 'Draft budget is in the doc')!
  const r = await slack.invia(C({ url: 'https://northwind-studio.slack.com/' }), { conversazione: 'C0ACME', testo: 'Added the travel costs.', filo: radice.ts })
  const post = f.richieste.filter(x => x.metodo === 'chat.postMessage')
  assert.equal(post.length, 1)
  assert.equal(post[0]!.http, 'POST')
  assert.equal(post[0]!.q.thread_ts, radice.ts)
  assert.match(r.permalink, new RegExp(`/archives/C0ACME/p${r.ts.replace('.', '')}\\?thread_ts=${radice.ts}&cid=C0ACME$`))
  assert.equal(seg.risoltoDaQui('C0ACME', radice.ts, r.ts), 1)
  assert.ok(!seg.daRispondere().some(a => a.domanda.startsWith('What about')))
  // un posto escluso, o un testo vuoto, non partono
  await assert.rejects(slack.invia(C({ esclusi: ['C0ACME'] }), { conversazione: 'C0ACME', testo: 'x' }))
  await assert.rejects(slack.invia(C(), { conversazione: 'C0ACME', testo: '   ' }))
  assert.equal(f.conteggi.get('chat.postMessage'), 1)
})

test('il token non esce: non nei risultati, non nei guai, e i file fuori da Slack non lo ricevono', async () => {
  const acme = f.conv.find(c => c.id === 'C0ACME')!
  acme.messaggi.push({ ts: finto.tsDi(Date.now() / 1000 - 30, 999), user: finto.NORA, text: 'esterno',
    files: [{ id: 'F0EXT', name: 'x.txt', filetype: 'text', mimetype: 'text/plain', size: 10, contenuto: 'segreto' }] })
  // il file punta altrove: il connettore non bussa
  const vero = globalThis.fetch
  const bussati: string[] = []
  globalThis.fetch = ((u: string | URL | Request, init?: RequestInit) => {
    const s = String(u)
    if (s.includes('/files/F0EXT')) bussati.push(s)
    return vero(s, init)
  }) as typeof fetch
  try {
    const e = await giro()
    assert.ok(!JSON.stringify(e).includes(finto.TOKEN))
  } finally { globalThis.fetch = vero }
  // F0EXT sta sullo stesso finto, quindi si legge: ma un url_private di un altro posto no
  const fuori = await slack.sincronizza({ token: 'xoxp-sbagliato' }).catch(x => x)
  assert.ok(!String(fuori.message).includes('xoxp-sbagliato'))
  assert.ok(bussati.every(u => u.startsWith(f.url.replace('/api/', ''))))
})

// — le regole, una per una —

test('chiede: domande e richieste in italiano e in inglese; un grazie no', () => {
  for (const s of ['Riesci a mandarmi il preventivo?', 'mi mandi il file entro domani', 'Can you add them?', 'let me know when it is ready', 'fammi sapere', 'Are you free tomorrow?']) assert.ok(seg.chiede(s), s)
  for (const s of ['thanks!', 'ok', 'Grazie mille, perfetto', 'Deploy finished']) assert.ok(!seg.chiede(s), s)
})

test('promessa: verbo con scadenza, verbo da solo, scadenza in prima persona; una domanda no', () => {
  assert.deepEqual(seg.promessa('Certo, ti mando il preventivo entro venerdì'), { fiducia: 0.9, scadenza: 'entro venerdì' })
  assert.deepEqual(seg.promessa("Sure, I'll send it by Friday"), { fiducia: 0.9, scadenza: 'by Friday' })
  assert.deepEqual(seg.promessa('Me ne occupo io'), { fiducia: 0.7, scadenza: null })
  assert.deepEqual(seg.promessa('I will share the deck'), { fiducia: 0.7, scadenza: null })
  assert.equal(seg.promessa('Io lo chiudo domani')?.fiducia, 0.4)
  assert.equal(seg.promessa('Ti mando io il file?'), null)
  assert.equal(seg.promessa('Il cliente ha pagato'), null)
})

test('decisione: «abbiamo deciso», «let’s go with» forti; «approvato» debole; una domanda no', () => {
  assert.equal(seg.decisione('Abbiamo deciso di partire a novembre')?.fiducia, 0.8)
  assert.equal(seg.decisione("Let's go with the blue one")?.fiducia, 0.8)
  assert.equal(seg.decisione('Approvato, grazie')?.fiducia, 0.5)
  assert.equal(seg.decisione('Abbiamo deciso?'), null)
  assert.equal(seg.decisione('Ci vediamo dopo'), null)
})

test('inChiaro: persone, canali senza etichetta, gruppi, date, mail e faccine', () => {
  const persone = new Map([['U1', 'Nora Vance']])
  const posti = new Map([['C9', '#vendite']])
  assert.equal(slack.inChiaro('<@U1> in <#C9> e <!subteam^S1|@design>, <!here> :white_check_mark: :skin-tone-2: :custom:', persone, posti),
    'Nora Vance in #vendite e @design, @tutti ✅  :custom:')
  assert.equal(slack.inChiaro('<mailto:a@b.co|a@b.co> &amp; <!date^1700000000^{date}|14 nov>', persone), 'a@b.co & 14 nov')
})

test('il manifesto chiede tutti gli ambiti, e uno solo che scrive', () => {
  const u = new URL(slack.manifesto())
  const m = JSON.parse(u.searchParams.get('manifest_json')!)
  assert.deepEqual(m.oauth_config.scopes.user, slack.AMBITI)
  assert.deepEqual(slack.AMBITI.filter(a => !/:(read|history)$/.test(a)), ['chat:write'])
})

test('prova: dice lo spazio, chi, i permessi e quelli che mancano', async () => {
  const e = await slack.prova(C())
  assert.ok(e.ok)
  if (!e.ok) return
  assert.equal(e.squadra, 'Northwind Studio')
  assert.equal(e.utenteId, finto.ME)
  assert.equal(e.url, 'https://northwind-studio.slack.com/')
  assert.deepEqual(e.mancano, [])
  await f.chiudi()
  f = await finto.avvia({ ambiti: 'channels:history,channels:read,users:read' })
  process.env.MYYND_SLACK_URL = f.url
  const meno = await slack.prova(C())
  assert.ok(meno.ok && meno.mancano!.includes('im:history') && meno.mancano!.includes('chat:write'))
})
