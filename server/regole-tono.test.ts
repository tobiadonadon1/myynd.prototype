// Le regole sul tono (F7): i tratti di una correzione, la soglia delle due,
// la persona sola, la voce che le legge e il cestino che le spegne subito.
//
//   node --test server/regole-tono.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-regole-tono-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const store = await import('./store.ts')
const voce = await import('./voce.ts')
const ab = await import('./abitudini.ts')
const tono = await import('./regole-tono.ts')

type Chiesta = { system: string; messages: { content: string }[]; lavoro: string }
const chieste: Chiesta[] = []
let risposta: { uguale: string; nuova: string } | null = null
before(() => { store.azzeraTutto(); tono.perProva({ chiediJSON: (async (o: Chiesta) => { chieste.push(o); return risposta }) as never }) })
beforeEach(() => { store.azzeraTutto(); voce.dimentica(); chieste.length = 0; risposta = null })
after(() => { tono.perProva(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const LEO = { indirizzo: 'leo@studio.example', nome: 'Leo' }
const NORA = { indirizzo: 'nora@harbor.example', nome: 'Nora' }
const ADESSO = new Date('2026-09-28T10:00:00.000Z')
const dopo = (min: number) => new Date(ADESSO.getTime() + min * 60_000)
const riga = (chiave: string) => ab.tutte(ADESSO).find(a => a.chiave === chiave)
/** Il blocco della voce per una riga che scrive a quell'indirizzo. */
const blocco = (indirizzo: string) => voce.perRiga({ doc: null, testo: `Reply to ${indirizzo} about the logo`, nota: null })?.blocco ?? ''

const BOZZA = 'Dear Leo,\n\nthe logo files are attached in all four formats, as we agreed on the call last week.\n\nKind regards,'
const MANDATA = 'Hi Leo,\n\nthe logo files are attached in all four formats, as we agreed on the call last week.\n\nKind regards,'

test('i tratti: saluto cambiato e tolto, chiusura, tu e Lei, un terzo più corta, elenchi sciolti, una frase tolta', () => {
  const chiavi = (b: string, s: string, nome?: string) => tono.tratti(b, s, nome).map(t => t.chiave)
  assert.deepEqual(chiavi(BOZZA, MANDATA, 'Leo'), ['bozza.tono:saluto:hi {nome}'])
  assert.deepEqual(chiavi(BOZZA, MANDATA.replace('Hi Leo,\n\n', '')), ['bozza.tono:saluto-via'])
  assert.deepEqual(chiavi(BOZZA, MANDATA.replace('Kind regards,', 'Best,')), ['bozza.tono:saluto:hi {nome}', 'bozza.tono:chiusura:best'])
  // il Lei al posto del tu: una cosa dell'italiano
  assert.ok(chiavi('Ciao Marco,\n\nti mando il preventivo del corso, ti chiedo di guardarlo con calma.\n\nA presto', 'Ciao Marco,\n\nLe mando il preventivo del corso, La ringrazio se lo guarda con calma. Cordiali saluti, gentile Marco.\n\nA presto').includes('bozza.tono:registro:lei'))
  // un terzo più corta, su una bozza di almeno venticinque parole
  const lunga = 'Hi Leo,\n\nthank you so much for your message. I wanted to let you know that the files are ready and attached here. I hope they work well for you and your team, and please tell me if anything is missing at all.\n\nBest,'
  const corta = 'Hi Leo,\n\nthe files are ready and attached here. Tell me if anything is missing.\n\nBest,'
  assert.ok(chiavi(lunga, corta).includes('bozza.tono:corta'))
  // gli elenchi sciolti in frasi
  const elenco = 'Hi Leo,\n\nhere is the plan:\n- the files on Monday\n- the invoice on Tuesday\n- the call on Friday\n\nBest,'
  const frasi = 'Hi Leo,\n\nhere is the plan: the files on Monday, the invoice on Tuesday and the call on Friday.\n\nBest,'
  assert.ok(chiavi(elenco, frasi).includes('bozza.tono:elenchi-via'))
  // una frase tolta, ma si vede solo dalla seconda volta
  const conFrase = 'Hi Leo,\n\nthe files are attached. I hope this email finds you well today.\n\nBest,'
  const senzaFrase = 'Hi Leo,\n\nthe files are attached.\n\nBest,'
  const t = tono.tratti(conFrase, senzaFrase)
  assert.equal(t.length, 1); assert.match(t[0]!.chiave, /^bozza\.tono:frase:[0-9a-f]{10}$/); assert.equal(t[0]!.mostra, 2)
  assert.deepEqual(chiavi(MANDATA, MANDATA), [], 'identica: niente')
})

test('una correzione è una riga da guardare; la seconda uguale è in vigore da sola, e torna «imparato»; una sola persona: vale per lei', () => {
  const uno = tono.imparaDaBozza({ bozza: BOZZA, inviato: MANDATA, destinatario: LEO, via: 'smtp' }, ADESSO)
  assert.equal(uno.classe, 'ritocco')
  assert.deepEqual(uno.tratti, ['bozza.tono:saluto:hi {nome}'])
  assert.equal(uno.imparato, null)
  const r1 = riga('bozza.tono:saluto:hi {nome}')!
  assert.equal(r1.casi, 1); assert.equal(r1.inVigore, false); assert.equal(r1.dati.soloA, 'leo@studio.example'); assert.equal(r1.dati.nome, 'Leo')
  assert.match(r1.esempi[0]!.testo, /«Dear Leo,» → «Hi Leo,»/)
  assert.equal(blocco('leo@studio.example'), '', 'una riga da guardare non arriva a chi scrive')
  const due = tono.imparaDaBozza({ bozza: BOZZA.replace('four', 'three'), inviato: MANDATA.replace('four', 'three'), destinatario: LEO, via: 'casella' }, dopo(5))
  assert.ok(due.imparato, 'la seconda correzione uguale non è entrata in vigore')
  assert.equal(due.imparato.chiave, 'bozza.tono:saluto:hi {nome}')
  const r2 = riga('bozza.tono:saluto:hi {nome}')!
  assert.equal(r2.casi, 2); assert.equal(r2.inVigore, true); assert.equal(r2.esempi.length, 2)
  // la voce di chi scrive la legge, per Leo e non per Nora
  const aLeo = blocco('leo@studio.example')
  assert.match(aLeo, /Come corregge le tue bozze, da seguire:\n· Apre con «Hi \{nome\},», non con «Dear \{nome\},»\./)
  assert.doesNotMatch(aLeo, /[—–]/)
  assert.equal(blocco('nora@harbor.example'), '', 'una regola di Leo è arrivata alla bozza per Nora')
  // una terza correzione per Nora: la regola diventa di tutti
  tono.imparaDaBozza({ bozza: BOZZA.replace(/Leo/g, 'Nora'), inviato: MANDATA.replace(/Leo/g, 'Nora'), destinatario: NORA, via: 'smtp' }, dopo(10))
  const r3 = riga('bozza.tono:saluto:hi {nome}')!
  assert.equal(r3.dati.soloA, undefined); assert.equal(r3.casi, 3)
  assert.match(blocco('nora@harbor.example'), /Apre con «Hi \{nome\},»/)
  // e senza destinatario né posta mandata, la voce nasce solo per dirla
  assert.match(voce.perRiga({ doc: null, testo: 'Write a reply to the pilot thread', nota: null })?.blocco ?? '', /Apre con «Hi \{nome\},»/)
  // ricalcola di notte non la tocca: nasce da un gesto, non da un conto
  ab.ricalcola(dopo(60))
  assert.equal(riga('bozza.tono:saluto:hi {nome}')?.stato, 'osservata')
  assert.equal(riga('bozza.tono:saluto:hi {nome}')?.casi, 3)
  // e nel ritratto non entra
  assert.ok(!ab.perIlRitratto().includes('Hi'), ab.perIlRitratto())
})

test('una riscritta da capo non insegna niente; il ripiego parte solo su una modifica senza tratti, e prende il posto della memoria', async () => {
  const riscritta = tono.imparaDaBozza({ bozza: BOZZA, inviato: 'Sorry, I will send them tomorrow morning when I am back at my desk with the laptop.', destinatario: LEO, via: 'smtp' }, ADESSO)
  assert.equal(riscritta.classe, 'riscritto'); assert.deepEqual(riscritta.tratti, []); assert.equal(riscritta.ripiego, null)
  assert.equal(ab.tutte(ADESSO).length, 0)
  // un ritocco con un tratto: zero chiamate
  tono.imparaDaBozza({ bozza: BOZZA, inviato: MANDATA, destinatario: LEO, via: 'smtp' }, ADESSO)
  assert.equal(chieste.length, 0)
  // una modifica senza tratti: il modello piccolo, una volta, con le regole che ci sono già
  risposta = { uguale: '', nuova: 'Mention — the next step at the end.' }
  const b = 'Hi Leo,\n\nfiles attached, all four.\n\nBest,'
  const s = 'Hi Leo,\n\nfiles attached, all four. Invoice next.\n\nBest,'
  const m = tono.imparaDaBozza({ bozza: b, inviato: s, destinatario: LEO, via: 'casella' }, dopo(1))
  assert.equal(m.classe, 'modificato'); assert.deepEqual(m.tratti, [])
  assert.ok(m.ripiego)
  await m.ripiego
  assert.equal(chieste.length, 1); assert.equal(chieste[0]!.lavoro, 'estrazione')
  assert.match(chieste[0]!.system, /bozza\.tono:saluto:hi \{nome\}/, 'il modello non vede le regole che ci sono già')
  const libera = ab.tutte(ADESSO).find(a => a.dati.tratto === 'libera')!
  assert.ok(libera); assert.equal(libera.dati.frase, 'Mention. The next step at the end.'); assert.equal(libera.inVigore, false)
  // la volta dopo il modello dice che è la stessa: un caso in più, e in vigore
  risposta = { uguale: libera.chiave, nuova: '' }
  const m2 = tono.imparaDaBozza({ bozza: b.replace('four', 'three'), inviato: s.replace('four', 'three'), destinatario: LEO, via: 'casella' }, dopo(2))
  const imparata = await m2.ripiego
  assert.equal(imparata?.chiave, libera.chiave)
  assert.equal(ab.tutte(ADESSO).find(a => a.chiave === libera.chiave)?.casi, 2)
})

test('togli: la regola smette alla bozza dopo, non torna, e passati dieci minuti ne resta solo la chiave', () => {
  tono.imparaDaBozza({ bozza: BOZZA, inviato: MANDATA, destinatario: LEO, via: 'smtp' }, ADESSO)
  tono.imparaDaBozza({ bozza: BOZZA, inviato: MANDATA, destinatario: LEO, via: 'smtp' }, dopo(1))
  assert.match(blocco('leo@studio.example'), /Hi \{nome\}/)
  ab.cambia('bozza.tono:saluto:hi {nome}', 'togli', undefined, undefined, dopo(2))
  assert.equal(blocco('leo@studio.example'), '', 'una regola tolta è ancora arrivata alla bozza')
  // un'altra correzione uguale non la fa rinascere
  const di = tono.imparaDaBozza({ bozza: BOZZA, inviato: MANDATA, destinatario: LEO, via: 'smtp' }, dopo(3))
  assert.equal(di.imparato, null); assert.equal(riga('bozza.tono:saluto:hi {nome}'), undefined)
  // entro dieci minuti si rimette com'era
  ab.cambia('bozza.tono:saluto:hi {nome}', 'ripristina', undefined, 'osservata', dopo(5))
  assert.equal(riga('bozza.tono:saluto:hi {nome}')?.casi, 2)
  ab.cambia('bozza.tono:saluto:hi {nome}', 'togli', undefined, undefined, dopo(6))
  // passati i dieci minuti: i numeri e gli esempi se ne vanno davvero
  ab.ricalcola(dopo(20))
  const grezza = store.default.prepare("SELECT dati, prova, stato FROM abitudini WHERE chiave = 'bozza.tono:saluto:hi {nome}'").get() as { dati: string; prova: string; stato: string }
  assert.equal(grezza.stato, 'tolta'); assert.equal(grezza.dati, '{}'); assert.doesNotMatch(grezza.prova, /Leo/)
})

test('le frasi tolte due volte: una riga che si vede e vale; una volta sola non si vede', () => {
  const b = (x: string) => `Hi Leo,\n\n${x} I hope this email finds you well today.\n\nBest,`
  const s = (x: string) => `Hi Leo,\n\n${x}\n\nBest,`
  tono.imparaDaBozza({ bozza: b('The files are attached for the launch.'), inviato: s('The files are attached for the launch.'), destinatario: LEO, via: 'smtp' }, ADESSO)
  assert.equal(ab.tutte(ADESSO).filter(a => a.dati.tratto === 'frase').length, 0, 'una frase tolta una volta non è ancora niente')
  const e = tono.imparaDaBozza({ bozza: b('The invoice is attached for March.'), inviato: s('The invoice is attached for March.'), destinatario: NORA, via: 'smtp' }, dopo(1))
  const frase = ab.tutte(ADESSO).find(a => a.dati.tratto === 'frase')!
  assert.ok(frase); assert.equal(frase.casi, 2); assert.equal(frase.inVigore, true)
  assert.equal(e.imparato?.chiave, frase.chiave)
  assert.equal(ab.regoleTono('chiunque@esempio.it'), 'Come corregge le tue bozze, da seguire:\n· Toglie sempre la frase «I hope this email finds you well today.»: non scriverla.')
})
