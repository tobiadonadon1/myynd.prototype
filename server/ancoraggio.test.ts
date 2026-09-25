// L'ancoraggio: fatti duri, rifiuti, segni puliti, passi trovati solo dove ci sono.
//
//   node --test server/ancoraggio.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-ancoraggio-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const { fattiDuri, eUnRifiuto, pulisciCitazioni, passoPer, ancora, coperto, NON_CE_LHO } = await import('./ancoraggio.ts')
const store = await import('./store.ts')
const claude = await import('./claude.ts')
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

type Doc = Parameters<typeof ancora>[1]['visti'][number]
const doc = (id: string, titolo: string, corpo: string, extra: Partial<Doc> = {}): Doc =>
  ({ id, fonte: 'posta', tipo: 'email', titolo, corpo, autore: 'Nora Vance <nora@harbor.example>', quando: '2026-09-21T10:00:00.000Z', ...extra })

// — fattiDuri —

test('la stessa cifra scritta in quattro modi è un fatto solo', () => {
  assert.deepEqual(fattiDuri('€4,800'), ['4800'])
  assert.deepEqual(fattiDuri('4.800 €'), ['4800'])
  assert.deepEqual(fattiDuri('4800 EUR'), ['4800'])
  assert.deepEqual(fattiDuri('1 200 euro e 1,5 kg'), ['1200', '1.5'])
  assert.deepEqual(fattiDuri('1.200,50 €'), ['1200.5'])
})

test('le date in italiano, in inglese e numeriche cadono sulla stessa forma', () => {
  for (const s of ['27 July 2026', '27 luglio 2026', '27/07/2026', '27.07.2026', '2026-07-27', 'July 27, 2026', 'on the 27th of July 2026']) {
    assert.deepEqual(fattiDuri(s), ['2026-07-27'], s)
  }
  assert.deepEqual(fattiDuri('July 27'), ['07-27'])
  assert.deepEqual(fattiDuri('il 9 ottobre'), ['10-09'])
  assert.ok(coperto('07-27', ['2026-07-27']), 'senza anno vale per la data intera')
  assert.ok(coperto('2026-07-27', ['07-27']), 'e viceversa')
  assert.ok(!coperto('07-28', ['2026-07-27']))
})

test('ore, indirizzi, codici; e quello che non è un fatto', () => {
  assert.deepEqual(fattiDuri('at 9:30'), ['09:30'])
  assert.deepEqual(fattiDuri('at 09:30'), ['09:30'])
  assert.deepEqual(fattiDuri('Write to Marco.Rossi@Studio.example'), ['marco.rossi@studio.example'])
  assert.deepEqual(fattiDuri('invoice inv-2231 and AB1234'), ['INV-2231', 'AB1234'])
  assert.deepEqual(fattiDuri('3 files'), [])
  assert.deepEqual(fattiDuri('the 1st one'), [])
  assert.deepEqual(fattiDuri('plain words, nothing else'), [])
  assert.deepEqual(fattiDuri('3 days ago it was set'), [])
  assert.deepEqual(fattiDuri('€4,800 and again 4800 EUR and 4.800'), ['4800'], 'senza doppioni, in ordine')
})

// — eUnRifiuto —

test('il rifiuto si riconosce con tutt’e due gli apostrofi, nelle due lingue e nelle righe vecchie', () => {
  assert.ok(eUnRifiuto(NON_CE_LHO.it))
  assert.ok(eUnRifiuto(NON_CE_LHO.en))
  assert.ok(eUnRifiuto("Non ce l'ho."))
  assert.ok(eUnRifiuto("I don't have that"))
  assert.ok(eUnRifiuto('Non ho trovato niente su questo.'))
  assert.ok(eUnRifiuto('I found nothing on this'))
  assert.ok(eUnRifiuto('I don’t have that. I found no rent for the Lisbon office.'))
  assert.ok(eUnRifiuto('Non ce l’ho. Non c’è un affitto per l’ufficio di Lisbona.'))
})

test('non è un rifiuto: la risposta a metà, «non ce l’ho fatta», una seconda frase lunga, due frasi in più', () => {
  assert.ok(!eUnRifiuto('Delivery is Friday[1]. I don’t have the price.'))
  assert.ok(!eUnRifiuto('Non ce l’ho fatta.'))
  assert.ok(!eUnRifiuto('I don’t have that. ' + 'word '.repeat(20).trim() + '.'))
  assert.ok(!eUnRifiuto('I don’t have that. One sentence. And another one.'))
})

// — pulisciCitazioni —

test('i segni fuori dall’elenco spariscono e si elencano, i gruppi si aprono, [M] segue la memoria', () => {
  assert.deepEqual(pulisciCitazioni('The fee is €4,800 [1][9].', 6, false), { testo: 'The fee is €4,800[1].', nonValide: [9] })
  assert.deepEqual(pulisciCitazioni('Zero [0] here.', 3, false), { testo: 'Zero here.', nonValide: [0] })
  assert.equal(pulisciCitazioni('Two [1, 2] and [1,2].', 3, false).testo, 'Two[1][2] and[1][2].')
  assert.equal(pulisciCitazioni('Three [1-3].', 3, false).testo, 'Three[1][2][3].')
  assert.equal(pulisciCitazioni('Three [1–3].', 3, false).testo, 'Three[1][2][3].')
  assert.equal(pulisciCitazioni('Goal [M].', 3, true).testo, 'Goal[M].')
  assert.equal(pulisciCitazioni('Goal [M].', 3, false).testo, 'Goal.')
  assert.equal(pulisciCitazioni('In [2024] and [a] nothing changes.', 1, false).testo, 'In [2024] and [a] nothing changes.')
})

// — ancora —

const HARBOR = 'Hi Alex, we confirm the Harbor pilot starts on 14 October 2026 with two suppliers, Brightline and Keel. The fee is €4,800 for the first phase. Nora'
const LOGO = 'Ciao Alex, la consegna dei file del logo è confermata per venerdì 14 ottobre 2026. Il preventivo resta 1.200 € più IVA. Marco'

test('le etichette e l’ordine sono quelli di fontiCitate, sullo stesso testo', () => {
  const visti = [doc('a', 'Harbor pilot kickoff', HARBOR), doc('b', 'Consegna del logo', LOGO), doc('c', 'Terzo', 'niente')]
  const testo = 'Delivery on 14 October 2026 [2]. The fee is €4,800 [1].'
  const r = ancora(testo, { visti, estratti: new Map([['a', 1500], ['b', 1500], ['c', 1500]]), letto: '', memoria: false, via: 'claude' })
  assert.deepEqual(r.fonti.map(f => ({ id: f.id, label: f.label })), claude.fontiCitate(testo, visti))
  assert.equal(r.verifica.citazioni, 2)
  assert.equal(r.fonti[0].fonte, 'posta')
  assert.equal(r.fonti[0].inviato, false)
})

test('una frase inglese trova il suo passo in un estratto italiano, per la data', () => {
  const p = passoPer('Marco delivers the logo files on 14 October 2026 [1].', LOGO)
  assert.ok(p && p.includes('14 ottobre 2026'), String(p))
  assert.ok(p!.length <= 220)
})

test('una radice sola e nessun fatto: niente passo; tre radici bastano', () => {
  assert.equal(passoPer('The pilot is fine.', 'The pilot has two suppliers and a fee.'), undefined)
  assert.ok(passoPer('The pilot starts with two suppliers, Brightline and Keel.', HARBOR))
})

test('il passo si cerca solo dentro l’estratto visto; il fatto oltre resta scoperto', () => {
  const lungo = 'x'.repeat(400) + ' The total is €9,900 for phase two.'
  const visti = [doc('a', 'Long', lungo)]
  const r = ancora('The total is €9,900 [1].', { visti, estratti: new Map([['a', 350]]), letto: 'system and question without numbers', memoria: false, via: 'compatibile' })
  assert.equal(r.fonti[0].passo, undefined)
  assert.deepEqual(r.verifica.scoperti, ['9900'])
  const r2 = ancora('The total is €9,900 [1].', { visti, estratti: new Map([['a', 4000]]), letto: lungo, memoria: false, via: 'compatibile' })
  assert.ok(r2.fonti[0].passo?.includes('€9,900'))
  assert.deepEqual(r2.verifica.scoperti, [])
})

test('un fatto nella storia citata dentro l’estratto si trova: l’estratto è il corpo, non il corpo attuale', () => {
  const citata = 'Thanks Nora.\n\n> On 21 Sep Nora wrote:\n> The fee is €4,800 for the first phase.'
  const r = ancora('The fee is €4,800 [1].', { visti: [doc('a', 'Re: kickoff', citata, { inviato: true })], estratti: new Map([['a', 1500]]), letto: citata, memoria: false, via: 'claude' })
  assert.ok(r.fonti[0].passo?.includes('€4,800'))
  assert.equal(r.fonti[0].inviato, true)
})

test('[M] punta al progetto nominato nella frase, o alla Memoria', () => {
  const progetti = [{ id: 'p1', nome: 'Northwind', alias: ['nw'] }, { id: 'p2', nome: 'Harbor Labs' }]
  const con = ancora('It serves your Northwind goal [M].', { visti: [], estratti: new Map(), letto: '', memoria: true, progetti, via: 'claude' })
  assert.deepEqual(con.fonti, [{ id: 'memoria:progetto:p1', label: '[M] Northwind', fonte: 'memoria' }])
  assert.equal(con.verifica.memoria, true)
  const senza = ancora('That is what you told me [M].', { visti: [], estratti: new Map(), letto: '', memoria: true, progetti, via: 'claude' })
  assert.deepEqual(senza.fonti, [{ id: 'memoria', label: '[M]', fonte: 'memoria' }])
  const tolto = ancora('That is what you told me [M].', { visti: [], estratti: new Map(), letto: '', memoria: false, progetti, via: 'claude' })
  assert.equal(tolto.testo, 'That is what you told me.')
  assert.equal(tolto.verifica.memoria, false)
  assert.deepEqual(tolto.fonti, [])
})

test('una cifra che sta nella domanda non è scoperta; un rifiuto con una cifra dentro sì', () => {
  const sua = ancora('Yes, 4,800 is the fee.', { visti: [], estratti: new Map(), letto: 'Domanda: is 4800 the fee?', memoria: false, via: 'abbonamento' })
  assert.deepEqual(sua.verifica.scoperti, [])
  const rifiuto = ancora('I don’t have that. The 2027 budget is not in your mail.', { visti: [], estratti: new Map(), letto: 'nothing', memoria: false, via: 'abbonamento' })
  assert.equal(rifiuto.verifica.rifiuto, true)
  assert.deepEqual(rifiuto.verifica.scoperti, ['2027'])
  assert.equal(rifiuto.verifica.senzaFonti, false)
})

test('le lineette spariscono e il verbale dice via e segni tolti', () => {
  const visti = [doc('a', 'Harbor pilot kickoff', HARBOR)]
  const r = ancora('The Harbor pilot starts on 14 October 2026 [1] — with Brightline and Keel. The fee is €4,800 [1][9].', { visti, estratti: new Map([['a', 350]]), letto: HARBOR, memoria: false, via: 'compatibile', ricominciata: true })
  assert.ok(!/[—–]/.test(r.testo))
  assert.ok(!r.testo.includes('[9]'))
  assert.deepEqual(r.verifica.nonValide, [9])
  assert.equal(r.verifica.via, 'compatibile')
  assert.equal(r.verifica.ricominciata, true)
  assert.equal(r.verifica.senzaFonti, false)
  const prosa = ancora('The fee is €4,800. It starts in October.', { visti, estratti: new Map(), letto: '', memoria: false, via: 'claude' })
  assert.equal(prosa.verifica.senzaFonti, true)
})

// — i punti dentro le cifre, il codice, gli spazi fra i numeri —

test('il punto dentro «1.200», «27.07.2026» e «1.0.3» non chiude la frase: il passo è intero, con la cifra giusta', () => {
  assert.equal(passoPer('Il preventivo resta 1.200 € più IVA [1].', LOGO), 'Il preventivo resta 1.200 € più IVA.')
  const checklist = 'Owner: Priya Shah. Build 1.0.3 goes to App Review on 2 October 2026. Then the screenshots.'
  assert.equal(passoPer('Northwind 1.0.3 goes to App Review on 2 October 2026 [1].', checklist), 'Build 1.0.3 goes to App Review on 2 October 2026.')
  assert.equal(passoPer('La scadenza è il 27.07.2026.', 'Ciao. La scadenza resta il 27.07.2026 per tutti. Saluti.'), 'La scadenza resta il 27.07.2026 per tutti.')
  // e la frase della risposta che porta il segno è intera, non da dopo il punto
  const r = ancora('Il preventivo resta 1.200 € più IVA [1].', { visti: [doc('b', 'Consegna del logo', LOGO)], estratti: new Map([['b', 1500]]), letto: LOGO, memoria: false, via: 'claude' })
  assert.equal(r.fonti[0].passo, 'Il preventivo resta 1.200 € più IVA.')
  assert.deepEqual(r.verifica.scoperti, [])
})

test('il codice non si tocca: «items[0]» resta, una lista resta una lista, gli spazi allineati restano', () => {
  const testo = 'Use `items[0]` here [1]. The list is `[1, 2, 3]`.\n\n```\nconst a = b[0]\nx  =  1\nc = d[2]\n```'
  const r = ancora(testo, { visti: [doc('a', 'A', 'items here')], estratti: new Map([['a', 100]]), letto: '', memoria: false, via: 'claude' })
  assert.equal(r.testo, 'Use `items[0]` here[1]. The list is `[1, 2, 3]`.\n\n```\nconst a = b[0]\nx  =  1\nc = d[2]\n```')
  assert.deepEqual(r.verifica.nonValide, [])
  assert.equal(r.verifica.citazioni, 1, 'il [2] nel codice non è una citazione')
  assert.deepEqual(pulisciCitazioni('See `x[9]` and [9].', 3, false), { testo: 'See `x[9]` and.', nonValide: [9] })
})

test('gli spazi fra i numeri: «1 200 000» è una cifra, un numero di telefono o un a capo no', () => {
  assert.deepEqual(fattiDuri('In 2026\n12 people came'), ['2026', '12'])
  assert.deepEqual(fattiDuri('Phone 555 1234 567'), ['555', '1234', '567'])
  assert.deepEqual(fattiDuri('costa 1 200 000 €'), ['1200000'])
  assert.deepEqual(fattiDuri('1 200,50 €'), ['1200.5'])
  assert.deepEqual(fattiDuri('nel 2026 100 persone'), ['2026', '100'])
})

test('i fatti duri di un testo grande costano poco: niente copia riscritta a ogni presa', () => {
  const denso = Array.from({ length: 40_000 }, (_, i) => `n ${1000 + i}`).join(' ')
  const t0 = Date.now()
  const fatti = fattiDuri(denso)
  assert.ok(Date.now() - t0 < 1500, `${Date.now() - t0} ms`)
  assert.equal(fatti.length, 40_000)
})

test('una versione o un indirizzo restano interi: «1.0.3» non è «1.0.4», e nessuno dei due è «1»', () => {
  assert.deepEqual(fattiDuri('Build 1.0.3 ships'), ['1.0.3'])
  assert.deepEqual(fattiDuri('Build 1.0.4 ships'), ['1.0.4'])
  assert.deepEqual(fattiDuri('Electron 22.1.0'), ['22.1.0'])
  assert.deepEqual(fattiDuri('192.168.1.10 e 192.168.1.20'), ['192.168.1.10', '192.168.1.20'])
  assert.ok(!coperto('1.0.9', fattiDuri('Build 1.0.3 goes to App Review')))
  // e le cifre vere restano cifre: tutti gruppi di tre sono migliaia, separatori diversi sono migliaia e decimali
  assert.deepEqual(fattiDuri('1.200.000 €'), ['1200000'])
  assert.deepEqual(fattiDuri('1.234,56 €'), ['1234.56'])
  assert.deepEqual(fattiDuri('1,5 kg'), ['1.5'])
})

test('una versione sbagliata è scoperta e non trova il passo di quella giusta', () => {
  const checklist = 'Owner: Priya Shah. Build 1.0.3 goes to App Review on 2 October 2026.'
  const d = doc('desktop:checklist', 'Northwind release checklist.md', checklist, { fonte: 'desktop', tipo: 'documento' })
  const r = ancora('The build going to App Review is 1.0.9 [1].', { visti: [d], estratti: new Map([[d.id, checklist.length]]), letto: checklist, memoria: false, via: 'claude' })
  assert.deepEqual(r.verifica.scoperti, ['1.0.9'])
  assert.equal(r.fonti[0].passo, undefined, 'la frase con 1.0.3 non prova 1.0.9')
  const g = ancora('The build going to App Review is 1.0.3 [1].', { visti: [d], estratti: new Map([[d.id, checklist.length]]), letto: checklist, memoria: false, via: 'claude' })
  assert.deepEqual(g.verifica.scoperti, [])
  assert.equal(g.fonti[0].passo, 'Build 1.0.3 goes to App Review on 2 October 2026.')
  assert.equal(passoPer('The build is 1.0.9.', checklist), undefined)
})

test('una lineetta dentro il codice resta: la prosa attorno si pulisce', () => {
  const d = doc('a', 'A', 'Use the flag. Done.')
  const r = ancora('Use this — it works:\n```\nx = a — b\n```\nDone `c — d` [1].', { visti: [d], estratti: new Map([['a', 100]]), letto: 'x', memoria: false, via: 'claude' })
  assert.equal(r.testo, 'Use this. It works:\n```\nx = a — b\n```\nDone `c — d`[1].')
})
