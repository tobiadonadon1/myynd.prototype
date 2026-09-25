// L'insieme delle domande: i controlli del codice scartano quello che non
// regge, le sue domande entrano solo con una citazione e una seconda
// risposta che concorda, le assenti solo se la ricerca non trova niente, il
// budget ferma e scrive comunque, e `ritira` toglie quello che non c'è più.
//
//   node --test server/domande-prova.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-domande-prova-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const dp = await import('./domande-prova.ts')
const archivio = await import('./risposte-archivio.ts')
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const ieri = (g: number) => new Date(Date.now() - g * 86_400_000).toISOString()
const HARBOR = 'Hi Alex, we confirm the Harbor pilot starts on 14 October 2026 with two suppliers, Brightline and Keel. The fee is €4,800 for the first phase. ' + 'More context about the pilot and the suppliers follows here. '.repeat(8) + 'Nora'
const LOGO = 'Ciao Alex, la consegna dei file del logo è confermata per venerdì 9 ottobre 2026. Il preventivo resta 1.200 € più IVA. ' + 'Altre righe sul lavoro del logo e sulle varianti. '.repeat(8) + 'Marco'
const PRIYA = 'Owner: Priya Shah. Build 1.0.3 goes to App Review on 2 October 2026. ' + 'Checklist items follow in this release note. '.repeat(9)

before(() => {
  cfg.scrivi({ lingua: 'en', diSerie: false, onboarding: true, giro: true, nome: 'Alex' })
  progetti.scrivi({ nome: 'Harbor Labs', obiettivo: 'Launch the Harbor invoice pilot' })
  progetti.scrivi({ nome: 'Aurora', obiettivo: 'Launch the pilot' })
  store.salvaDocumenti([
    { id: 'posta:INBOX:701', fonte: 'posta', tipo: 'email', titolo: 'Harbor pilot kickoff', corpo: HARBOR, autore: 'Nora Vance <nora@harbor.example>', quando: ieri(3), filo: 'f701' },
    { id: 'posta:INBOX:702', fonte: 'posta', tipo: 'email', titolo: 'Consegna del logo Northwind', corpo: LOGO, autore: 'Marco Rossi <marco@studio-rossi.example>', quando: ieri(2), filo: 'f702' },
    { id: 'posta:INBOX:703', fonte: 'posta', tipo: 'email', titolo: 'Release checklist', corpo: PRIYA, autore: 'Priya Shah <priya@northwind.example>', quando: ieri(1), filo: 'f703' },
    { id: 'posta:INBOX:704', fonte: 'posta', tipo: 'email', titolo: 'Newsletter', corpo: 'Promo '.repeat(200), autore: 'news@shop.example', quando: ieri(1), massa: true },
    { id: 'posta:INBOX:705', fonte: 'posta', tipo: 'email', titolo: 'Short', corpo: 'Too short to ask anything.', autore: 'x@y.example', quando: ieri(1) }
  ])
  store.creaChat('c1', 'una')
  const scrivi = (id: string, testo: string) => store.default.prepare('INSERT INTO messaggi (id, chat, ruolo, testo, fonti, quando) VALUES (?,?,?,?,?,?)').run(id, 'c1', 'u', testo, null, ieri(5))
  scrivi('u1', 'When does the Harbor pilot start?')
  scrivi('u2', 'Save my goal for Aurora: launch the pilot')
  scrivi('u3', 'ok thanks')
})

/** I documenti dentro un prompt: «[n] titolo\nFonte…\ncorpo». */
function documentiNel(contenuto: string): { n: number; titolo: string; corpo: string }[] {
  return contenuto.split('\n\n---\n\n').map(b => {
    const m = b.match(/\[(\d+)\] ([^\n]+)\nFonte:[^\n]*\n([\s\S]*)$/)
    return m ? { n: Number(m[1]), titolo: m[2], corpo: m[3] } : null
  }).filter((x): x is { n: number; titolo: string; corpo: string } => !!x)
}

type Chiamata = { lavoro: string; system: string; content: string }
const chiamate: Chiamata[] = []

/** Il modello finto: per documento risponde secondo il titolo, per una sua domanda cerca il documento giusto. */
function modelloFinto(o: { seconda?: (domanda: string) => string; assenti?: { domanda: string; paroleIt: string[]; paroleEn: string[] }[]; risponde?: (domanda: string) => boolean } = {}) {
  dp.perProva({ chiediJSON: (async (r: { lavoro: string; system: string; messages: { content: string }[] }) => {
    const content = String(r.messages[0].content)
    chiamate.push({ lavoro: r.lavoro, system: r.system, content })
    if (r.lavoro === 'esame' && content.startsWith('Progetti:')) return { domande: o.assenti ?? [] }
    if (r.lavoro === 'esame' && content.startsWith('Domanda:')) {
      const docs = documentiNel(content)
      const d = docs.find(x => x.corpo.includes('Harbor pilot starts'))
      if (!d) return { buona: false, n: 0, attesa: '', citazione: '', genere: 'data' }
      return { buona: true, n: d.n, attesa: '14 October 2026', citazione: 'the Harbor pilot starts on 14 October 2026', genere: 'data' }
    }
    if (r.lavoro === 'esame') {
      const titolo = content.match(/^Il documento \(dati\):\n\n([^\n]+)/)?.[1] ?? ''
      const proposte: Record<string, unknown> = {
        'Harbor pilot kickoff': { buona: true, domanda: 'What is the fee for the first phase of the Harbor pilot?', attesa: '€4,800', citazione: 'The fee is €4,800 for the first phase.', genere: 'cifra' },
        'Consegna del logo Northwind': { buona: true, domanda: 'When will Marco deliver the logo files?', attesa: '9 October 2026', citazione: 'la consegna dei file del logo è confermata per venerdì 9 ottobre 2026', genere: 'data' },
        'Release checklist': { buona: true, domanda: 'Who owns the release checklist?', attesa: 'Priya Shah', citazione: 'Owner: Priya Shah. Build 1.0.3 goes to App Review', genere: 'persona' }
      }
      return proposte[titolo] ?? { buona: false, domanda: '', attesa: '', citazione: '', genere: 'stato' }
    }
    if (r.lavoro === 'verifica' && content.includes('Quello che sai di lei')) {
      const domanda = content.match(/^Domanda: ([^\n]+)/)?.[1] ?? ''
      return { risponde: o.risponde ? o.risponde(domanda) : false, n: 0 }
    }
    if (r.lavoro === 'verifica') {
      const domanda = content.match(/^Domanda: ([^\n]+)/)?.[1] ?? ''
      const risposta = o.seconda ? o.seconda(domanda) : ({
        'When does the Harbor pilot start?': 'On 14 October 2026.',
        'What is the fee for the first phase of the Harbor pilot?': 'The fee is 4800 euro.',
        'When will Marco deliver the logo files?': 'On 9 October 2026.',
        'Who owns the release checklist?': 'Priya Shah owns the release checklist.'
      } as Record<string, string>)[domanda] ?? ''
      return { risposta, citazione: '' }
    }
    return null
  }) as never })
}

test('i controlli del codice: citazione assente, fatto fuori dalla citazione, tempo relativo, titolo ricopiato, doppione', () => {
  const doc = { titolo: 'Harbor pilot kickoff', corpo: HARBOR }
  const buona = { domanda: 'What is the fee for the first phase?', attesa: '€4,800', citazione: 'The fee is €4,800 for the first phase.', genere: 'cifra' }
  const ok = dp.controlla(buona, doc, [])
  assert.equal(ok.scarto, null)
  assert.ok(!ok.scarto && ok.posizione > 0 && HARBOR.slice(ok.posizione).startsWith('The fee is €4,800'))
  assert.equal(dp.controlla({ ...buona, citazione: 'The fee is €4,900 for the first phase.' }, doc, []).scarto, 'citazione')
  assert.equal(dp.controlla({ ...buona, attesa: '€4,900' }, doc, []).scarto, 'fatti')
  assert.equal(dp.controlla({ ...buona, domanda: 'What is the fee due next Friday?' }, doc, []).scarto, 'tempo')
  assert.equal(dp.controlla({ ...buona, attesa: '€4,800 — first phase' }, doc, []).scarto, 'trattini')
  assert.equal(dp.controlla({ ...buona, domanda: 'What is the Harbor pilot kickoff?' }, doc, []).scarto, 'titolo')
  assert.equal(dp.controlla(buona, doc, ['What is the fee for the first phase?']).scarto, 'doppione')
  assert.equal(dp.controlla({ ...buona, genere: 'boh' }, doc, []).scarto, 'genere')
  assert.equal(dp.controlla({ ...buona, citazione: 'short' }, doc, []).scarto, 'citazione')
  // la citazione si trova anche con apostrofi e spazi diversi
  assert.ok(dp.trovaCitazione("la consegna dei file del logo e' confermata", LOGO) < 0, 'un apostrofo in più cambia la parola')
  assert.ok(dp.trovaCitazione('la consegna  dei file del logo è confermata', LOGO) >= 0)
})

test('le due risposte concordano sui fatti duri per cifre e date, sulle radici per il resto', () => {
  assert.ok(dp.concordano('cifra', '€4,800', 'The fee is 4800 euro.'))
  assert.ok(!dp.concordano('cifra', '€4,800', 'The fee is 4900 euro.'))
  assert.ok(dp.concordano('data', '9 October 2026', 'On 9 October 2026.'))
  assert.ok(dp.concordano('persona', 'Priya Shah', 'Priya Shah owns the release checklist.'))
  assert.ok(!dp.concordano('persona', 'Priya Shah', 'Marco Rossi owns it.'))
})

test('una sua domanda entra con il suo documento; l’ordine di salvare non è mai una candidata; il resto viene dai documenti', async () => {
  chiamate.length = 0
  modelloFinto({ assenti: [
    { domanda: 'What is the rent for the Lisbon office?', paroleIt: ['affitto', 'Lisbona'], paroleEn: ['rent', 'Lisbon'] },
    { domanda: 'How many seats did Keel order?', paroleIt: ['posti', 'Keel'], paroleEn: ['seats', 'Keel'] },
    { domanda: 'What is Nora’s birthday?', paroleIt: ['compleanno', 'Nora'], paroleEn: ['birthday', 'Nora'] }
  ], risponde: d => d.includes('Keel') })
  const r = await dp.generaInsieme({ n: 10 })
  const att = dp.attive(r.insieme)
  const sua = att.find(d => d.origine === 'sua')
  assert.ok(sua, 'la sua domanda è entrata')
  assert.equal(sua!.domanda, 'When does the Harbor pilot start?')
  assert.equal(sua!.doc?.id, 'posta:INBOX:701')
  assert.equal(sua!.genere, 'data')
  assert.ok(!chiamate.some(c => c.content.includes('Save my goal for Aurora')), 'l’ordine di salvare non arriva mai al modello')
  const costruite = att.filter(d => d.origine === 'costruita' && d.tipo === 'risponde')
  assert.ok(costruite.some(d => d.doc?.id === 'posta:INBOX:702' && d.interlingua === true), 'la domanda inglese sul documento italiano è interlingua')
  assert.ok(costruite.some(d => d.doc?.id === 'posta:INBOX:701' && d.genere === 'cifra'))
  assert.ok(!chiamate.some(c => c.content.includes('Newsletter')), 'la posta di massa non è candidata')
  assert.ok(!chiamate.some(c => c.content.includes('Too short to ask')), 'un documento corto non è candidato')
  const assenti = att.filter(d => d.tipo === 'non_ce')
  assert.deepEqual(assenti.map(d => d.domanda).sort(), ['What is Nora’s birthday?', 'What is the rent for the Lisbon office?'])
  assert.ok(assenti.every(d => d.assenza && d.assenza.cercato.length === 2))
  assert.equal(r.scartate.assente, 1, 'quella a cui il materiale risponde non entra')
  assert.ok(chiamate.every(c => c.lavoro === 'esame' || c.lavoro === 'verifica'))
  assert.deepEqual(archivio.leggiInsieme<typeof r.insieme>()!.domande.map(d => d.id), r.insieme.domande.map(d => d.id), 'scritto su disco')
  assert.ok(att.every(d => /^q\d\d$/.test(d.id)))
})

test('una seconda risposta che non concorda scarta la domanda', async () => {
  archivio.togli()
  modelloFinto({ seconda: d => d.includes('logo') ? 'On 12 October 2026.' : d.includes('Harbor pilot start') ? 'On 14 October 2026.' : d.includes('fee') ? '4800' : 'Priya Shah' })
  const r = await dp.generaInsieme({ n: 10 })
  assert.ok(!dp.attive(r.insieme).some(d => d.doc?.id === 'posta:INBOX:702'))
  assert.ok((r.scartate.riAnswer ?? 0) >= 1)
})

test('al massimo quindici sono sue', async () => {
  archivio.togli()
  const ids: string[] = []
  // venti domande diverse davvero: con lo stesso testo e un numero diverso sarebbero doppioni, e giustamente
  const temi = ['budget', 'logo', 'audit', 'pilot', 'launch', 'contract', 'invoice', 'review', 'roadmap', 'hiring', 'offsite', 'demo', 'pricing', 'renewal', 'migration', 'training', 'survey', 'webinar', 'partnership', 'rollout']
  for (let i = 1; i <= 20; i++) {
    ids.push(`posta:INBOX:8${String(i).padStart(2, '0')}`)
    store.salvaDocumenti([{ id: ids[i - 1], fonte: 'posta', tipo: 'email', titolo: `Agenda ${i}`, corpo: `Hi, the ${temi[i - 1]} session with the client is on 14 October 2026 at the office. ` + 'Some more text about the agenda follows. '.repeat(10), autore: `p${i}@x.example`, quando: ieri(i), filo: `m${i}` }])
    store.default.prepare('INSERT INTO messaggi (id, chat, ruolo, testo, fonti, quando) VALUES (?,?,?,?,?,?)').run(`m${i}`, 'c1', 'u', `When is the ${temi[i - 1]} session?`, null, ieri(1))
  }
  dp.perProva({ chiediJSON: (async (r: { lavoro: string; messages: { content: string }[] }) => {
    const content = String(r.messages[0].content)
    if (r.lavoro === 'esame' && content.startsWith('Domanda:')) {
      const tema = content.match(/^Domanda: When is the (\w+) session/)?.[1]
      const d = documentiNel(content).find(x => x.corpo.includes(`the ${tema} session with`))
      if (!d) return { buona: false, n: 0, attesa: '', citazione: '', genere: 'data' }
      return { buona: true, n: d.n, attesa: '14 October 2026', citazione: `the ${tema} session with the client is on 14 October 2026`, genere: 'data' }
    }
    if (r.lavoro === 'verifica') return { risposta: 'On 14 October 2026.', citazione: '' }
    return r.lavoro === 'esame' && content.startsWith('Progetti:') ? { domande: [] } : { buona: false, domanda: '', attesa: '', citazione: '', genere: 'stato' }
  }) as never })
  const r = await dp.generaInsieme({ n: 50 })
  assert.equal(dp.attive(r.insieme).filter(d => d.origine === 'sua').length, dp.SUE_MAX)
  for (const id of ids) store.default.prepare('DELETE FROM documenti WHERE id = ?').run(id)
  store.default.exec("DELETE FROM messaggi WHERE id LIKE 'm%'")
})

test('il budget ferma la costruzione e scrive quello che ha accettato', async () => {
  archivio.togli()
  let chiamateFatte = 0
  dp.perProva({ chiediJSON: (async (r: { lavoro: string; messages: { content: string }[] }) => {
    chiamateFatte++
    // ogni chiamata costa più di mezzo budget: dalla seconda in poi si è oltre
    store.segnaUso({ lavoro: r.lavoro, motore: 'finto', entrata: dp.BUDGET_GENERA / 2 + 1, cache: 0, uscita: 1 })
    const content = String(r.messages[0].content)
    if (r.lavoro === 'esame' && content.startsWith('Domanda:')) {
      const d = documentiNel(content).find(x => x.corpo.includes('Harbor pilot starts'))
      return d ? { buona: true, n: d.n, attesa: '14 October 2026', citazione: 'the Harbor pilot starts on 14 October 2026', genere: 'data' } : { buona: false, n: 0, attesa: '', citazione: '', genere: 'data' }
    }
    if (r.lavoro === 'verifica') return { risposta: 'On 14 October 2026.', citazione: '' }
    return { buona: false, domanda: '', attesa: '', citazione: '', genere: 'stato' }
  }) as never })
  const r = await dp.generaInsieme({ n: 50 })
  assert.equal(r.interrotta, 'budget')
  assert.equal(dp.attive(r.insieme).length, 1, 'la prima domanda, accettata prima del limite, resta')
  assert.ok(chiamateFatte <= 3)
  assert.ok(r.gettoni >= dp.BUDGET_GENERA)
  assert.ok(archivio.leggiInsieme(), 'scritto lo stesso')
  const righe = store.default.prepare("SELECT lavoro FROM uso WHERE lavoro LIKE 'prova:%'").all() as { lavoro: string }[]
  assert.ok(righe.length > 0 && righe.every(x => /^prova:(esame|verifica)$/.test(x.lavoro)), 'l’uso porta l’etichetta della prova')
  store.default.exec('DELETE FROM uso')
})

test('ritira toglie la domanda di un documento sparito e di una citazione cambiata', () => {
  const ins = archivio.leggiInsieme<import('./domande-prova.ts').Insieme>()!
  ins.domande.push(
    { id: 'q90', domanda: 'x?', tipo: 'risponde', attesa: 'y', genere: 'stato', doc: { id: 'posta:INBOX:702', titolo: 'Consegna', fonte: 'posta', quando: null }, citazione: 'la consegna dei file del logo è confermata per venerdì 9 ottobre 2026', scarto: 0, origine: 'costruita', interlingua: false, verificata: 'modello', creata: ieri(0) },
    { id: 'q91', domanda: 'z?', tipo: 'risponde', attesa: 'y', genere: 'stato', doc: { id: 'posta:INBOX:999', titolo: 'Sparito', fonte: 'posta', quando: null }, citazione: 'niente di niente qui dentro', scarto: 0, origine: 'costruita', interlingua: false, verificata: 'modello', creata: ieri(0) },
    { id: 'q92', domanda: 'w?', tipo: 'non_ce', attesa: '', genere: 'stato', doc: null, citazione: '', scarto: null, origine: 'costruita', interlingua: false, verificata: 'modello', creata: ieri(0) }
  )
  assert.equal(dp.ritira(ins), 1, 'solo il documento sparito')
  assert.equal(ins.domande.find(d => d.id === 'q91')?.perche, 'doc_sparito')
  store.default.prepare('UPDATE documenti SET corpo = ? WHERE id = ?').run('Ciao Alex, il preventivo è cambiato. ' + 'x'.repeat(500), 'posta:INBOX:702')
  assert.equal(dp.ritira(ins), 1, 'ora anche la citazione sparita')
  assert.equal(ins.domande.find(d => d.id === 'q90')?.perche, 'citazione_sparita')
  assert.equal(dp.ritira(ins), 0, 'una volta ritirata non si conta più')
  assert.ok(dp.attive(ins).some(d => d.id === 'q92'), 'una non_ce non si ritira')
})

test('ogni chiamata è severa; senza un giudizio sull’assenza la domanda non entra; il tetto a metà ferma e scrive; un guasto pure', async () => {
  archivio.togli()
  const { controllaIlTetto } = await import('./tetto.ts')
  const severi: boolean[] = []
  const assenti = [
    { domanda: 'What is the rent for the Lisbon office?', paroleIt: ['affitto', 'Lisbona'], paroleEn: ['rent', 'Lisbon'] },
    { domanda: 'What is Nora’s birthday?', paroleIt: ['compleanno', 'Nora'], paroleEn: ['birthday', 'Nora'] }
  ]
  // il giudizio sull'assenza di «Lisbon» non si legge (quello che il vero chiediJSON torna su un JSON storto): la domanda non entra
  dp.perProva({ chiediJSON: (async (r: { lavoro: string; severo?: boolean; messages: { content: string }[] }) => {
    severi.push(r.severo === true)
    const content = String(r.messages[0].content)
    if (r.lavoro === 'esame' && content.startsWith('Progetti:')) return { domande: assenti }
    if (r.lavoro === 'verifica' && content.includes('Quello che sai di lei')) return content.includes('Lisbon') ? null : { risponde: false, n: 0 }
    if (r.lavoro === 'verifica') return { risposta: '', citazione: '' }
    return { buona: false, domanda: '', attesa: '', citazione: '', genere: 'stato' }
  }) as never })
  const r = await dp.generaInsieme({ n: 10 })
  assert.ok(severi.length > 0 && severi.every(Boolean), 'tutte le chiamate portano severo')
  assert.deepEqual(dp.attive(r.insieme).filter(d => d.tipo === 'non_ce').map(d => d.domanda), ['What is Nora’s birthday?'])
  assert.equal(r.scartate.verifica, 1)
  assert.equal(r.interrotta, undefined)

  // il tetto raggiunto a metà, come lo lancia il modello vero con `severo`: la costruzione si ferma con «tetto» e scrive
  archivio.togli()
  let chiamate = 0
  dp.perProva({ chiediJSON: (async () => {
    chiamate++
    cfg.aggiorna({ tetto: 1 }); store.segnaUso({ lavoro: 'x', motore: 'f', entrata: 5, cache: 0, uscita: 5 }); controllaIlTetto()
    throw new Error('mai')
  }) as never })
  const t = await dp.generaInsieme({ n: 10 })
  assert.equal(t.interrotta, 'tetto')
  assert.equal(chiamate, 1, 'al tetto si ferma subito, non scorre i candidati scartandoli uno a uno')
  assert.ok(archivio.leggiInsieme(), 'scritto lo stesso')
  cfg.aggiorna({ tetto: 0 }); store.default.exec('DELETE FROM uso')

  // e un guasto della strada (rete, motore giù) ferma con «errore», sempre scrivendo
  archivio.togli(); chiamate = 0
  dp.perProva({ chiediJSON: (async () => { chiamate++; throw new Error('fetch failed') }) as never })
  const g = await dp.generaInsieme({ n: 10 })
  assert.equal(g.interrotta, 'errore')
  assert.equal(chiamate, 1)
  assert.ok(archivio.leggiInsieme())
})
