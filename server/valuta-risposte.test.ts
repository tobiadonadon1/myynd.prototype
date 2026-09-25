// L'esame delle risposte: le etichette le dà il codice, anche contro il
// giudice; «senza fonte» non è inventata; un solo «non sostenuta» non basta;
// «da rivedere» esce dal conto; budget, tempo e tetto fermano e salvano; una
// prova intera non tocca niente; il lavoro settimanale salta per ogni motivo
// e non consuma lo slot.
//
//   node --test server/valuta-risposte.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatiVoce, EsitoRisposta, Giudizio } from './valuta-risposte.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-valuta-risposte-'))
const CASA_VERA = process.env.HOME
process.env.HOME = join(CASA, 'casa')
mkdirSync(process.env.HOME, { recursive: true })
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const claude = await import('./claude.ts')
const ancoraggio = await import('./ancoraggio.ts')
const archivio = await import('./risposte-archivio.ts')
const vr = await import('./valuta-risposte.ts')
const { delTetto, TETTO_RAGGIUNTO } = await import('./tetto.ts')
after(() => { store.chiudiIndici(); process.env.HOME = CASA_VERA; rmSync(CASA, { recursive: true, force: true }) })

const ieri = (g: number) => new Date(Date.now() - g * 86_400_000).toISOString()
const HARBOR = 'Hi Alex, we confirm the Harbor pilot starts on 14 October 2026 with two suppliers, Brightline and Keel. The fee is €4,800 for the first phase. Nora'
const LOGO = 'Ciao Alex, la consegna dei file del logo è confermata per venerdì 9 ottobre 2026. Il preventivo resta 1.200 € più IVA. Marco'
const PRIYA = 'Owner: Priya Shah. Build 1.0.3 goes to App Review on 2 October 2026. Then the marketing screenshots.'

type Insieme = import('./domande-prova.ts').Insieme
type Domanda = import('./domande-prova.ts').DomandaProva
const item = (id: string, x: Partial<Domanda> & Pick<Domanda, 'domanda' | 'tipo' | 'genere'>): Domanda => ({
  id, attesa: '', doc: null, citazione: '', scarto: null, origine: 'costruita', interlingua: false, verificata: 'persona', creata: ieri(1), ...x
})
const INSIEME = (): Insieme => ({ versione: 1, lingua: 'en', creato: ieri(1), aggiornato: ieri(1), domande: [
  item('q01', { domanda: 'What is the fee for the first phase of the Harbor pilot?', tipo: 'risponde', genere: 'cifra', attesa: '€4,800', doc: { id: 'posta:INBOX:701', titolo: 'Harbor pilot kickoff', fonte: 'posta', quando: ieri(3) }, citazione: 'The fee is €4,800 for the first phase.', scarto: HARBOR.indexOf('The fee') }),
  item('q02', { domanda: 'When will Marco deliver the logo files?', tipo: 'risponde', genere: 'data', attesa: '9 October 2026', interlingua: true, doc: { id: 'posta:INBOX:702', titolo: 'Consegna del logo Northwind', fonte: 'posta', quando: ieri(2) }, citazione: 'confermata per venerdì 9 ottobre 2026', scarto: LOGO.indexOf('confermata') }),
  item('q03', { domanda: 'Who owns the Northwind release checklist?', tipo: 'risponde', genere: 'persona', attesa: 'Priya Shah', doc: { id: 'desktop:checklist', titolo: 'Northwind release checklist.md', fonte: 'desktop', quando: ieri(4) }, citazione: 'Owner: Priya Shah.', scarto: 0 }),
  item('q04', { domanda: 'When does the Northwind build go to App Review?', tipo: 'risponde', genere: 'data', attesa: '2 October 2026', doc: { id: 'desktop:checklist', titolo: 'Northwind release checklist.md', fonte: 'desktop', quando: ieri(4) }, citazione: 'goes to App Review on 2 October 2026', scarto: PRIYA.indexOf('goes') }),
  item('q05', { domanda: 'What is the rent for the Lisbon office?', tipo: 'non_ce', genere: 'stato', assenza: { cercato: ['affitto Lisbona', 'rent Lisbon'], guardati: 0 } }),
  item('q06', { domanda: 'How many seats did Keel order?', tipo: 'non_ce', genere: 'stato', assenza: { cercato: ['posti Keel', 'seats Keel'], guardati: 1 } })
] })

before(() => {
  cfg.scrivi({ lingua: 'en', diSerie: false, onboarding: true, giro: true, nome: 'Alex', motore: 'claude', claude: { apiKey: 'sk-ant-prova-finta' }, tetto: 0 })
  progetti.scrivi({ nome: 'Harbor Labs', obiettivo: 'Launch the Harbor invoice pilot with two suppliers' })
  progetti.scrivi({ nome: 'Northwind', obiettivo: 'Ship Northwind 1.0 on the App Store' })
  const docs: Parameters<typeof store.salvaDocumenti>[0] = [
    { id: 'posta:INBOX:701', fonte: 'posta', tipo: 'email', titolo: 'Harbor pilot kickoff', corpo: HARBOR, autore: 'Nora Vance <nora@harbor.example>', quando: ieri(3), filo: 'f701' },
    { id: 'posta:INBOX:702', fonte: 'posta', tipo: 'email', titolo: 'Consegna del logo Northwind', corpo: LOGO, autore: 'Marco Rossi <marco@studio-rossi.example>', quando: ieri(2), filo: 'f702' },
    { id: 'desktop:checklist', fonte: 'desktop', tipo: 'documento', titolo: 'Northwind release checklist.md', corpo: PRIYA, quando: ieri(4) },
    { id: 'posta:Sent:704', fonte: 'posta', tipo: 'email', titolo: 'Re: Harbor pilot kickoff', corpo: 'Thanks Nora, confirmed.\n\n> ' + HARBOR, autore: 'Alex <alex@northwind.example>', quando: ieri(2), inviato: true, filo: 'f701' }
  ]
  const temi = [['Fattura fornitore Brightline', 'Buongiorno, in allegato la fattura di settembre per il materiale. Cordiali saluti.'], ['Weekly sync notes', 'Notes from the weekly sync: roadmap, hiring, and the offsite in Lisbon next spring.'], ['Preventivo stampa', 'Il preventivo per la stampa dei cataloghi è pronto, aspettiamo conferma.'], ['Office lease question', 'Do we renew the office lease? The landlord asked last week.'], ['Riunione con lo studio', 'La riunione con lo studio Rossi si è spostata di una settimana.'], ['Keel onboarding', 'Keel joins the pilot as the second supplier. Contact: ops@keel.example.'], ['Newsletter di ottobre', 'Le novità del mese, in dieci righe.'], ['App Review guideline 4.3', 'Your submission was reviewed under guideline 4.3. Please reply with the differences.'], ['Pranzo di squadra', 'Giovedì pranzo con tutta la squadra, prenotato.'], ['Support ticket 1188', 'A customer cannot log in on iPad; workaround shared.'], ['Nota spese agosto', 'La nota spese di agosto è approvata.'], ['Lumen course outline', 'Outline of the first course: six lessons, two exercises each.'], ['Backup del server', 'Il backup del server gira ogni notte alle due.'], ['Board update', 'Short update for the board: pilot on track, hiring one engineer.'], ['Regole di stile', 'Le regole di stile del logo: un solo colore, niente ombre.'], ['Brightline delivery slot', 'Brightline proposes the delivery slot in the third week of October.']]
  temi.forEach(([titolo, corpo], i) => docs.push({ id: `posta:INBOX:8${String(i).padStart(2, '0')}`, fonte: 'posta', tipo: 'email', titolo, corpo, autore: `p${i}@x.example`, quando: ieri(5 + i), filo: `t${i}` }))
  store.salvaDocumenti(docs)
})

type Fonte = import('./ancoraggio.ts').FonteAncorata
type Risposta = Awaited<ReturnType<typeof claude.rispondiInStreaming>>

/**
 * La chat finta: risponde con un copione e passa da `ancora` come quella vera,
 * con il numero del documento giusto al posto di «[g]». Conta i token come
 * «risposta» dentro l'etichetta della prova, come farebbe il motore.
 */
function chatFinta(copione: Record<string, string>, o: { costo?: number; lancia?: () => Error; insieme?: Insieme } = {}) {
  return async (domanda: string, _s: unknown, onTesto: (d: string) => void): Promise<Risposta> => {
    if (o.lancia) throw o.lancia()
    store.segnaUso({ lavoro: 'risposta', motore: 'finto', entrata: o.costo ?? 100, cache: 0, uscita: 10 })
    const visti = claude.materialeChat(domanda, [], false)
    const grezzo = copione[domanda] ?? 'I don’t have that.'
    // «[g]» è il documento giusto di quella domanda, al numero che ha nel materiale
    const oro = (o.insieme ?? INSIEME()).domande.find(d => d.domanda === domanda)?.doc?.id
    const estratti = new Map(visti.map(d => [d.id, 1500]))
    let g = oro ? visti.findIndex(d => d.id === oro) : -1
    // non era nel primo materiale: la chat vera lo troverebbe con un giro di `cerca`, largo quattromila
    if (g < 0 && oro) { const d = store.documento(oro); if (d) { visti.push(d); estratti.set(d.id, 4000); g = visti.length - 1 } }
    const testo = grezzo.replace('[g]', g >= 0 ? `[${g + 1}]` : '')
    onTesto(testo)
    const r = ancoraggio.ancora(testo, { visti, estratti, letto: visti.map(d => d.corpo.slice(0, 1500)).join('\n') + '\nDomanda: ' + domanda, memoria: true, progetti: progetti.vivi(), via: 'claude' })
    return { ...r, estratti: Object.fromEntries(estratti) }
  }
}

const COPIONE: Record<string, string> = {
  'What is the fee for the first phase of the Harbor pilot?': 'The fee is €4,800 [g].',
  'When will Marco deliver the logo files?': 'Marco delivers the logo files on 9 October 2026 [g].',
  'Who owns the Northwind release checklist?': 'Priya Shah owns it [g].',
  'When does the Northwind build go to App Review?': 'It goes to App Review in early October [g].',
  'What is the rent for the Lisbon office?': 'I don’t have that. I found no rent for the Lisbon office.',
  'How many seats did Keel order?': 'Keel ordered 12 seats [1].'
}

/** Il giudice finto: tutto vero, tranne dove il copione dice il contrario. */
function giudiceFinto(regola: (contenuto: string) => Partial<Giudizio> | null = () => ({})) {
  const chiamate: string[] = []
  const chiediJSON = (async (r: { lavoro: string; severo?: boolean; messages: { content: string }[] }) => {
    const c = String(r.messages[0].content)
    assert.equal(r.severo, true, 'il giudice è severo: il tetto arriva come errore, non come null')
    chiamate.push(`${r.lavoro}:${c.match(/^Domanda: ([^\n]+)/)?.[1] ?? ''}`)
    store.segnaUso({ lavoro: r.lavoro, motore: 'finto', entrata: 50, cache: 0, uscita: 5 })
    const extra = regola(c)
    if (extra === null) return null
    return { corrisponde: true, sostenuta: true, rispondeDavvero: true, motivo: 'ok', ...extra }
  }) as never
  return { chiediJSON, chiamate }
}

const dump = () => {
  const tabelle = (store.default.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'ricerca%' AND name != 'uso' ORDER BY name").all() as { name: string }[]).map(t => t.name)
  return JSON.stringify(tabelle.map(t => [t, store.default.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]))
}

// — decidi, ramo per ramo —

const base = (x: Partial<DatiVoce>): DatiVoce => ({ tipo: 'risponde', genere: 'cifra', rifiuto: false, corrisponde: null, supportata: null, scoperti: [], giudizio: null, secondo: null, sostenutaDaPiuNuovo: false, ...x })
const g = (x: Partial<Giudizio>): Giudizio => ({ corrisponde: true, sostenuta: true, rispondeDavvero: true, motivo: '', ...x })

test('decidi: ogni ramo, dal codice', () => {
  assert.equal(vr.decidi(base({ rifiuto: true })), 'rifiutata_male')
  assert.equal(vr.decidi(base({ tipo: 'non_ce', rifiuto: true })), 'rifiutata_bene')
  assert.equal(vr.decidi(base({ corrisponde: true, supportata: true })), 'giusta')
  assert.equal(vr.decidi(base({ corrisponde: true, supportata: false })), 'senza_fonte', 'giusta senza segni non è inventata')
  assert.equal(vr.decidi(base({ corrisponde: true, supportata: false, giudizio: g({ sostenuta: false }) })), 'senza_fonte', 'un «non sostenuta» da solo non fa inventata')
  assert.equal(vr.decidi(base({ corrisponde: true, supportata: false, giudizio: g({ sostenuta: false }), secondo: g({ sostenuta: true }) })), 'senza_fonte')
  assert.equal(vr.decidi(base({ corrisponde: false, giudizio: g({ sostenuta: false }), scoperti: ['77'] })), 'inventata')
  assert.equal(vr.decidi(base({ corrisponde: false, giudizio: g({ sostenuta: false }), secondo: g({ sostenuta: false }) })), 'inventata')
  assert.equal(vr.decidi(base({ corrisponde: false, sostenutaDaPiuNuovo: true })), 'da_rivedere')
  assert.equal(vr.decidi(base({ corrisponde: false })), 'sbagliata')
  assert.equal(vr.decidi(base({ tipo: 'non_ce', giudizio: g({ sostenuta: true, rispondeDavvero: true }) })), 'da_rivedere')
  assert.equal(vr.decidi(base({ tipo: 'non_ce', giudizio: g({ sostenuta: true, rispondeDavvero: false }) })), 'sbagliata')
  assert.equal(vr.decidi(base({ tipo: 'non_ce', giudizio: g({ sostenuta: false }), scoperti: ['12'] })), 'inventata')
  assert.equal(vr.decidi(base({ tipo: 'non_ce', giudizio: null })), 'sbagliata')
})

test('i totali escludono «da rivedere», e passa vuole nove su dieci, zero inventate, al massimo due rifiuti sbagliati su quaranta', () => {
  const voci = (n: Partial<Record<EsitoRisposta, number>>) => Object.entries(n).flatMap(([e, k]) => Array.from({ length: k! }, () => ({ esito: e as EsitoRisposta, tipo: e.startsWith('rifiutata_bene') ? 'non_ce' : 'risponde' })))
  const t = vr.totali(voci({ giusta: 36, rifiutata_bene: 8, rifiutata_male: 1, sbagliata: 2, da_rivedere: 3 }))
  assert.equal(t.quante, 47)
  assert.equal(t.giuste, 44)
  assert.equal(t.risponde, 42, 'anche quelle da rivedere erano domande con risposta')
  assert.ok(vr.passa(t))
  assert.ok(!vr.passa(vr.totali(voci({ giusta: 37, rifiutata_bene: 10, rifiutata_male: 3 }))), 'tre rifiuti sbagliati su quaranta non passano')
  assert.ok(!vr.passa(vr.totali(voci({ giusta: 39, rifiutata_bene: 10, inventata: 1 }))), 'una inventata non passa')
  assert.ok(vr.passa(vr.totali(voci({ giusta: 38, rifiutata_bene: 10, rifiutata_male: 1, senza_fonte: 1 }))))
  assert.ok(!vr.passa(vr.totali([])))
})

// — la prova intera —

test('una prova intera: etichette dal codice, giudice solo dove serve, niente toccato, uso etichettato', async () => {
  archivio.togli()
  archivio.scriviInsieme(INSIEME())
  store.default.exec('DELETE FROM uso')
  const giudice = giudiceFinto(c => c.includes('Keel ordered') ? { sostenuta: false, corrisponde: false } : {})
  vr.perProva({ rispondi: chatFinta(COPIONE) as never, chiediJSON: giudice.chiediJSON })
  const prima = dump()
  const configPrima = readFileSync(join(cfg.cartella(), 'config.json'), 'utf8')
  const r = await vr.valutaRisposte({ origine: 'comando' })
  assert.equal(dump(), prima, 'una prova intera non tocca nessuna tabella')
  assert.equal(readFileSync(join(cfg.cartella(), 'config.json'), 'utf8'), configPrima)
  const esiti = Object.fromEntries(r.voci.map(v => [v.id, v.esito]))
  assert.deepEqual(esiti, { q01: 'giusta', q02: 'giusta', q03: 'giusta', q04: 'sbagliata', q05: 'rifiutata_bene', q06: 'inventata' })
  assert.equal(r.totali.quante, 6)
  assert.equal(r.totali.giuste, 4)
  assert.equal(r.totali.inventata, 1)
  assert.equal(r.passa, false)
  assert.equal(r.via, 'claude')
  assert.ok(r.voci.find(v => v.id === 'q01')!.fonti[0]?.passo?.includes('€4,800'))
  assert.ok(giudice.chiamate.some(c => c.startsWith('verifica:Who owns')), 'una persona la giudica il modello')
  assert.ok(!giudice.chiamate.some(c => c.includes('fee for the first phase')), 'una cifra che torna non passa dal giudice')
  assert.ok(giudice.chiamate.some(c => c.includes('Keel')), 'una non_ce non rifiutata passa dal giudice')
  assert.ok(!giudice.chiamate.some(c => c.includes('Lisbon')), 'un rifiuto non passa dal giudice')
  const righe = (store.default.prepare('SELECT lavoro FROM uso').all() as { lavoro: string }[]).map(x => x.lavoro)
  assert.ok(righe.length > 0 && righe.every(l => /^prova:(risposta|verifica)$/.test(l)), righe.join(','))
  assert.equal(r.costo.chiamate, righe.length)
  assert.ok(r.file && existsSync(r.file))
  assert.equal(archivio.leggiStorico().length, 1)
  const stato = archivio.leggiStato()
  assert.equal(stato.ultima?.giuste, 4)
  assert.equal(stato.ultimaCompleta, r.quando)
  assert.equal(stato.inCorso, undefined)
  assert.equal(archivio.inCorso(), false)
  assert.equal(r.recupero.risponde, 4)
  assert.ok(r.recupero.nelMateriale >= 3, `recupero ${r.recupero.nelMateriale}`)
  assert.ok(r.voci.find(v => v.id === 'q02')!.codice.dentroEstratto)
  assert.match(vr.tabella(r, true), /q06 {2}invented/)
  assert.match(vr.tabella(r, true), /Totals: right 4\/6/)
})

test('il codice decide per le cifre anche quando il giudice dice il contrario', async () => {
  archivio.togli()
  archivio.scriviInsieme(INSIEME())
  // una cifra scoperta («77») chiama il giudice, che dice «non corrisponde» ma «sostenuta»: il codice ha ragione
  const giudice = giudiceFinto(() => ({ corrisponde: false, sostenuta: true }))
  vr.perProva({ rispondi: chatFinta({ ...COPIONE, 'What is the fee for the first phase of the Harbor pilot?': 'The fee is €4,800 [g], reference 77.' }) as never, chiediJSON: giudice.chiediJSON })
  const r = await vr.valutaRisposte({ origine: 'comando', solo: ['q01'] })
  assert.equal(r.voci[0].esito, 'giusta')
  assert.deepEqual(r.voci[0].codice.scoperti, ['77'])
  assert.deepEqual(r.accordo, { casi: 1, concordi: 0 })
  assert.equal(archivio.leggiStato().ultimaCompleta, undefined, 'una prova parziale non è completa')
})

test('budget, tempo e tetto fermano la prova e salvano un rapporto parziale', async () => {
  archivio.togli(); archivio.scriviInsieme(INSIEME()); store.default.exec('DELETE FROM uso')
  vr.perProva({ rispondi: chatFinta(COPIONE, { costo: vr.BUDGET_RUN }) as never, chiediJSON: giudiceFinto().chiediJSON })
  let r = await vr.valutaRisposte({ origine: 'comando' })
  assert.equal(r.interrotta, 'budget')
  assert.equal(r.voci.length, 1)
  assert.ok(r.file && existsSync(r.file))
  assert.equal(archivio.leggiStato().ultima?.interrotta, 'budget')
  assert.match(vr.tabella(r, true), /stopped: token budget$/m, 'a parole, non con la chiave')
  assert.match(vr.tabella(r, false), /fermata: budget di token$/m)
  assert.equal(vr.fermata('tetto', true), 'daily token limit')

  archivio.togli(); archivio.scriviInsieme(INSIEME()); store.default.exec('DELETE FROM uso')
  let orologio = 0
  vr.perProva({ rispondi: chatFinta(COPIONE) as never, chiediJSON: giudiceFinto().chiediJSON, adesso: () => { orologio += 10 * 60_000; return orologio } })
  r = await vr.valutaRisposte({ origine: 'comando' })
  assert.equal(r.interrotta, 'tempo')
  assert.ok(r.voci.length < 6 && r.voci.length >= 1)

  archivio.togli(); archivio.scriviInsieme(INSIEME()); store.default.exec('DELETE FROM uso')
  // col tetto già raggiunto la prova non parte nemmeno
  cfg.aggiorna({ tetto: 1 }); store.segnaUso({ lavoro: 'x', motore: 'f', entrata: 5, cache: 0, uscita: 5 })
  vr.perProva({ rispondi: chatFinta(COPIONE) as never, chiediJSON: giudiceFinto().chiediJSON })
  await assert.rejects(() => vr.valutaRisposte({ origine: 'comando' }), (e: unknown) => delTetto(e) && (e as Error).message === TETTO_RAGGIUNTO)
  cfg.aggiorna({ tetto: 0 }); store.default.exec('DELETE FROM uso')
  // e un tetto raggiunto a metà, come lo lancia `controllaIlTetto`, ferma e salva
  const { controllaIlTetto } = await import('./tetto.ts')
  vr.perProva({ rispondi: (async () => { cfg.aggiorna({ tetto: 1 }); store.segnaUso({ lavoro: 'x', motore: 'f', entrata: 5, cache: 0, uscita: 5 }); controllaIlTetto(); throw new Error('mai') }) as never, chiediJSON: giudiceFinto().chiediJSON })
  r = await vr.valutaRisposte({ origine: 'comando' })
  assert.equal(r.interrotta, 'tetto')
  assert.equal(r.voci.length, 0)
  assert.ok(r.file && existsSync(r.file))
  cfg.aggiorna({ tetto: 0 }); store.default.exec('DELETE FROM uso')
  assert.equal(archivio.inCorso(), false, 'il lucchetto si lascia sempre')
})

test('senza insieme, senza motore, o su un modello locale senza --anche-locale, la prova si rifiuta; il lucchetto pure', async () => {
  archivio.togli(); cfg.aggiorna({ tetto: 0 }); store.default.exec('DELETE FROM uso')
  vr.perProva({ rispondi: chatFinta(COPIONE) as never, chiediJSON: giudiceFinto().chiediJSON })
  await assert.rejects(() => vr.valutaRisposte({ origine: 'comando' }), /Non c’è ancora un insieme/)
  archivio.scriviInsieme(INSIEME())
  cfg.scrivi({ ...cfg.leggi(), motore: 'compatibile', compatibile: { url: 'http://127.0.0.1:1/v1/', chiave: 'x', modello: 'finto' } })
  await assert.rejects(() => vr.valutaRisposte({ origine: 'comando' }), /--anche-locale/)
  const r = await vr.valutaRisposte({ origine: 'comando', ancheLocale: true, solo: ['q05'] })
  assert.equal(r.voci[0].codice.estratto, 350)
  cfg.scrivi({ ...cfg.leggi(), motore: 'claude' }, { togli: ['compatibile'] })
  cfg.scrivi({ ...cfg.leggi(), claude: { apiKey: 'sk-ant-prova-finta' } })
  const l = archivio.prendi()
  await assert.rejects(() => vr.valutaRisposte({ origine: 'comando' }), /già in corso/)
  l!.lascia()
  // e --secco non chiede né motore né modello
  const secco = await vr.valutaRisposte({ origine: 'comando', secco: true })
  assert.ok(secco.voci.every(v => v.esito === null))
  assert.equal(secco.file, null)
  assert.match(vr.tabella(secco, true), /Retrieval: gold document/)
})

test('gli argomenti: quelli sconosciuti sono un errore, --vive ha un numero facoltativo, --settimanale vuole si o no', () => {
  assert.equal(vr.leggiArgomenti(['--boh']).sbagliato, '--boh')
  assert.equal(vr.leggiArgomenti(['--conto']).sbagliato, '--conto')
  assert.deepEqual(vr.leggiArgomenti(['--solo', 'q01, q07', '--secco']).solo, ['q01', 'q07'])
  assert.equal(vr.leggiArgomenti(['--vive']).vive, 7)
  assert.equal(vr.leggiArgomenti(['--vive', '30']).vive, 30)
  assert.equal(vr.leggiArgomenti(['--settimanale', 'si']).settimanale, true)
  assert.equal(vr.leggiArgomenti(['--settimanale', 'no']).settimanale, false)
  assert.equal(vr.leggiArgomenti(['--settimanale', 'forse']).sbagliato, '--settimanale')
  assert.equal(vr.leggiArgomenti(['--anche-locale', '--genera']).ancheLocale, true)
})

test('dalla riga di comando: --dati senza --conto è il conto della radice; con --conto vale la guardia di valuta-feed', () => {
  const cli = fileURLToPath(new URL('./valuta-risposte.ts', import.meta.url))
  const radice = mkdtempSync(join(CASA, 'radice-'))
  const r1 = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', cli, '--dati', radice, '--rivedi'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } })
  assert.equal(r1.status, 0, r1.stderr)
  assert.match(r1.stdout, /No question set yet|Nessun insieme ancora/)
  const r2 = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', cli, '--dati', radice, '--conto', 'nessuno@esempio.test', '--rivedi'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } })
  assert.equal(r2.status, 2)
  assert.match(r2.stderr, /Non c'è nessun conto/)
  const r3 = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', cli, '--dati', radice, '--boh'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } })
  assert.equal(r3.status, 2)
})

// — il lavoro settimanale —

test('settimanale: spento non fa niente; poi salta per insieme, motore, locale e tetto scrivendo il motivo; e non chiama mai esame', async () => {
  archivio.togli()
  const esami: string[] = []
  vr.perProva({ rispondi: chatFinta(COPIONE) as never, chiediJSON: (async (r: { lavoro: string }) => { esami.push(r.lavoro); return { corrisponde: true, sostenuta: true, rispondeDavvero: true, motivo: '' } }) as never })
  cfg.aggiorna({ provaRisposte: { attiva: false } })
  await vr.settimanale()
  assert.deepEqual(archivio.leggiStato(), {}, 'spento: niente scritto')
  cfg.aggiorna({ provaRisposte: { attiva: true } })
  await vr.settimanale()
  assert.equal(archivio.leggiStato().saltata?.motivo, 'insieme')
  archivio.scriviInsieme({ ...INSIEME(), domande: Array.from({ length: 12 }, (_, i) => item(`q${i}`, { domanda: `q ${i}?`, tipo: 'non_ce', genere: 'stato' })) })
  const { claude: _chiave, ...senzaChiave } = cfg.leggi()
  cfg.scrivi({ ...senzaChiave, motore: 'claude' }, { togli: ['claude'] })
  await vr.settimanale()
  assert.equal(archivio.leggiStato().saltata?.motivo, 'motore')
  cfg.scrivi({ ...cfg.leggi(), motore: 'compatibile', compatibile: { url: 'http://127.0.0.1:1/v1/', chiave: 'x', modello: 'finto' } })
  await vr.settimanale()
  assert.equal(archivio.leggiStato().saltata?.motivo, 'locale')
  cfg.scrivi({ ...cfg.leggi(), motore: 'claude', claude: { apiKey: 'sk-ant-prova-finta' }, tetto: 1000 }, { togli: ['compatibile'] })
  await vr.settimanale()
  assert.equal(archivio.leggiStato().saltata?.motivo, 'tetto', 'spazio sotto 1,2 volte il budget')
  cfg.aggiorna({ tetto: 0 })
  await vr.forseSettimanale()
  assert.equal(archivio.leggiStato().ultima?.fatte, 12, 'dal timer, con tutto a posto, gira')
  assert.ok(existsSync(join(cfg.cartella(), 'scheduled-catchup.json')))
  const prima = archivio.leggiStorico().length
  await vr.forseSettimanale()
  assert.equal(archivio.leggiStorico().length, prima, 'entro sette giorni non si ripete')
  assert.ok(!esami.includes('esame'), 'il lavoro settimanale non costruisce mai l’insieme')
  archivio.togli()
  cfg.aggiorna({ tetto: 1000 })
  store.segnaUso({ lavoro: 'x', motore: 'f', entrata: 999, cache: 0, uscita: 1 })
  const catchup = readFileSync(join(cfg.cartella(), 'scheduled-catchup.json'), 'utf8')
  archivio.scriviInsieme({ ...INSIEME(), domande: Array.from({ length: 12 }, (_, i) => item(`q${i}`, { domanda: `q ${i}?`, tipo: 'non_ce', genere: 'stato' })) })
  await vr.forseSettimanale()
  assert.equal(archivio.leggiStato().saltata?.motivo, 'tetto')
  assert.equal(readFileSync(join(cfg.cartella(), 'scheduled-catchup.json'), 'utf8'), catchup, 'un salto non consuma lo slot')
  cfg.aggiorna({ tetto: 0, provaRisposte: { attiva: false } }); store.default.exec('DELETE FROM uso')
})

test('un giudizio che non si legge lascia la voce senza etichetta; il tetto e un guasto a metà fermano, salvano, e la riga dice «fermata a 1 su 6»', async () => {
  archivio.togli(); archivio.scriviInsieme(INSIEME()); store.default.exec('DELETE FROM uso'); cfg.aggiorna({ tetto: 0 })
  // il giudice torna null su «Who owns»: la voce resta senza etichetta, non «sbagliata»
  vr.perProva({ rispondi: chatFinta(COPIONE) as never, chiediJSON: giudiceFinto(c => c.includes('Who owns') ? null : c.includes('Keel ordered') ? { sostenuta: false } : {}).chiediJSON })
  let r = await vr.valutaRisposte({ origine: 'comando' })
  const q03 = r.voci.find(v => v.id === 'q03')!
  assert.equal(q03.esito, null)
  assert.equal(q03.errore, 'giudizio mancante')
  assert.equal(r.totali.sbagliata, 1, 'solo q04')
  assert.equal(r.totali.fatte, 5)
  assert.equal(r.interrotta, undefined)
  assert.match(vr.tabella(r, true), /q03 {2}error/)

  // il tetto raggiunto dentro il giudice, come lo lancia il modello vero con `severo`
  archivio.togli(); archivio.scriviInsieme(INSIEME()); store.default.exec('DELETE FROM uso')
  const { controllaIlTetto } = await import('./tetto.ts')
  vr.perProva({ rispondi: chatFinta(COPIONE) as never, chiediJSON: (async (o: { severo?: boolean; messages: { content: string }[] }) => {
    assert.equal(o.severo, true)
    if (String(o.messages[0].content).includes('Who owns')) { cfg.aggiorna({ tetto: 1 }); store.segnaUso({ lavoro: 'x', motore: 'f', entrata: 5, cache: 0, uscita: 5 }); controllaIlTetto() }
    return { corrisponde: true, sostenuta: true, rispondeDavvero: true, motivo: '' }
  }) as never })
  r = await vr.valutaRisposte({ origine: 'comando' })
  assert.equal(r.interrotta, 'tetto')
  assert.deepEqual(r.voci.map(v => [v.id, v.esito]), [['q01', 'giusta'], ['q02', 'giusta'], ['q03', null]])
  assert.ok(r.file && existsSync(r.file))
  cfg.aggiorna({ tetto: 0 }); store.default.exec('DELETE FROM uso')

  // un guasto della strada alla seconda domanda: la prima resta giudicata, il rapporto si salva, la riga è vera
  archivio.togli(); archivio.scriviInsieme(INSIEME())
  const chat = chatFinta(COPIONE)
  vr.perProva({ rispondi: (async (domanda: string, ...resto: unknown[]) => {
    if (domanda.includes('logo')) throw new Error('Claude Code ci ha messo troppo')
    return (chat as (...a: unknown[]) => Promise<Risposta>)(domanda, ...resto)
  }) as never, chiediJSON: giudiceFinto().chiediJSON })
  r = await vr.valutaRisposte({ origine: 'comando' })
  assert.equal(r.interrotta, 'errore')
  assert.equal(r.voci.length, 2)
  assert.equal(r.voci[0].esito, 'giusta')
  assert.equal(r.voci[1].esito, null)
  assert.match(r.voci[1].errore ?? '', /ci ha messo troppo/)
  assert.ok(r.file && existsSync(r.file))
  const stato = archivio.leggiStato()
  assert.equal(stato.ultima?.interrotta, 'errore')
  assert.equal(stato.ultima?.totale, 6)
  assert.equal(stato.ultimaCompleta, undefined)
  assert.equal(archivio.rigaDiStato(stato, true, true, false), `Check on ${archivio.giornoCorto(stato.ultima!.quando, true)} stopped at 1 of 6.`)
  assert.equal(archivio.rigaDiStato(stato, true, false, false), `Prova del ${archivio.giornoCorto(stato.ultima!.quando, false)} fermata a 1 su 6.`)
  assert.equal(archivio.inCorso(), false)
  store.default.exec('DELETE FROM uso')
})

test('con una prova fresca il lavoro settimanale tace: niente «Saltata» su un modello locale o col tetto raggiunto', async () => {
  archivio.togli(); store.default.exec('DELETE FROM uso')
  archivio.scriviInsieme({ ...INSIEME(), domande: Array.from({ length: 12 }, (_, i) => item(`q${i}`, { domanda: `q ${i}?`, tipo: 'non_ce', genere: 'stato' })) })
  cfg.aggiorna({ provaRisposte: { attiva: true }, tetto: 0 })
  vr.perProva({ rispondi: chatFinta(COPIONE) as never, chiediJSON: giudiceFinto().chiediJSON })
  await vr.settimanale()
  const dopo = archivio.leggiStato()
  assert.equal(dopo.ultima?.fatte, 12)
  const riga = archivio.rigaDiStato(dopo, true, true, false)!
  assert.match(riga, /^Last check on /)
  // due giorni dopo, su un modello locale: nessuna prova era dovuta, nessun salto si scrive
  cfg.scrivi({ ...cfg.leggi(), motore: 'compatibile', compatibile: { url: 'http://127.0.0.1:1/v1/', chiave: 'x', modello: 'finto' } })
  await vr.settimanale()
  await vr.forseSettimanale()
  assert.equal(archivio.leggiStato().saltata, undefined)
  assert.equal(archivio.rigaDiStato(archivio.leggiStato(), true, true, false), riga)
  // e col tetto di oggi raggiunto, lo stesso
  cfg.scrivi({ ...cfg.leggi(), motore: 'claude', claude: { apiKey: 'sk-ant-prova-finta' }, tetto: 1000 }, { togli: ['compatibile'] })
  store.segnaUso({ lavoro: 'x', motore: 'f', entrata: 999, cache: 0, uscita: 1 })
  await vr.settimanale()
  assert.equal(archivio.leggiStato().saltata, undefined)
  assert.equal(archivio.rigaDiStato(archivio.leggiStato(), true, true, false), riga)
  cfg.aggiorna({ tetto: 0, provaRisposte: { attiva: false } }); store.default.exec('DELETE FROM uso')
})

test('una prova della settimana fermata al budget non si ripete il giorno dopo: aspetta sette giorni', async () => {
  archivio.togli(); store.default.exec('DELETE FROM uso')
  archivio.scriviInsieme({ ...INSIEME(), domande: Array.from({ length: 12 }, (_, i) => item(`q${i}`, { domanda: `q ${i}?`, tipo: 'non_ce', genere: 'stato' })) })
  cfg.aggiorna({ provaRisposte: { attiva: true }, tetto: 0 })
  let orologio = Date.now()
  vr.perProva({ rispondi: chatFinta(COPIONE, { costo: vr.BUDGET_RUN }) as never, chiediJSON: giudiceFinto().chiediJSON, adesso: () => orologio })
  await vr.settimanale()
  let stato = archivio.leggiStato()
  assert.equal(stato.ultima?.interrotta, 'budget')
  assert.equal(stato.ultimaCompleta, undefined)
  assert.ok(stato.ultimaSettimanale)
  assert.equal(archivio.leggiStorico().length, 1)
  store.default.exec('DELETE FROM uso')
  orologio += 86_400_000
  await vr.settimanale()
  assert.equal(archivio.leggiStorico().length, 1, 'il giorno dopo non riparte')
  assert.equal(archivio.leggiStato().saltata, undefined)
  orologio += 7 * 86_400_000
  await vr.settimanale()
  assert.equal(archivio.leggiStorico().length, 2, 'dopo sette giorni sì')
  stato = archivio.leggiStato()
  assert.notEqual(stato.ultimaSettimanale, undefined)
  cfg.aggiorna({ tetto: 0, provaRisposte: { attiva: false } }); store.default.exec('DELETE FROM uso')
})

test('una prova a secco non ritira nessuno; quella vera sospende chi ha il documento sparito, e lo riprende quando torna', async () => {
  archivio.togli(); store.default.exec('DELETE FROM uso')
  const ins = INSIEME()
  ins.domande.push(item('q07', { domanda: 'When is the Lumen offsite?', tipo: 'risponde', genere: 'data', attesa: '3 March 2027', doc: { id: 'desktop:manca', titolo: 'Lumen offsite.md', fonte: 'desktop', quando: ieri(2) }, citazione: 'The Lumen offsite is on 3 March 2027.', scarto: 0 }))
  archivio.scriviInsieme(ins)
  const prima = readFileSync(join(archivio.cartellaRisposte(), 'domande.json'), 'utf8')
  const secco = await vr.valutaRisposte({ origine: 'comando', secco: true })
  assert.equal(secco.ritirate, 0)
  assert.ok(secco.voci.some(v => v.id === 'q07'), 'la domanda col documento che manca si vede nel secco')
  assert.equal(readFileSync(join(archivio.cartellaRisposte(), 'domande.json'), 'utf8'), prima, 'l’insieme non si tocca')
  // la prova vera la sospende
  vr.perProva({ rispondi: chatFinta(COPIONE, { insieme: ins }) as never, chiediJSON: giudiceFinto().chiediJSON })
  const vera = await vr.valutaRisposte({ origine: 'comando' })
  assert.equal(vera.ritirate, 1)
  assert.ok(!vera.voci.some(v => v.id === 'q07'))
  const dp = await import('./domande-prova.ts')
  const suDisco = archivio.leggiInsieme<Insieme>()!
  assert.equal(suDisco.domande.find(d => d.id === 'q07')?.perche, 'doc_sparito')
  assert.deepEqual(dp.sospese(suDisco).map(d => d.id), ['q07'])
  // il documento arriva (la cartella è stata riletta): la domanda torna da sola alla prova dopo
  store.salvaDocumenti([{ id: 'desktop:manca', fonte: 'desktop', tipo: 'documento', titolo: 'Lumen offsite.md', corpo: 'Plan. The Lumen offsite is on 3 March 2027. Bring the outline.', quando: ieri(2) }])
  const poi = await vr.valutaRisposte({ origine: 'comando', secco: true })
  assert.ok(!poi.voci.some(v => v.id === 'q07'), 'a secco resta sospesa: il secco non tocca l’insieme')
  const tornata = await vr.valutaRisposte({ origine: 'comando' })
  assert.ok(tornata.voci.some(v => v.id === 'q07'), 'tornata in gioco')
  assert.equal(archivio.leggiInsieme<Insieme>()!.domande.find(d => d.id === 'q07')?.ritirata, undefined)
  store.default.prepare('DELETE FROM documenti WHERE id = ?').run('desktop:manca')
})

test('una prova su poche domande («--solo») non diventa la riga delle preferenze', async () => {
  archivio.togli(); archivio.scriviInsieme(INSIEME()); store.default.exec('DELETE FROM uso')
  vr.perProva({ rispondi: chatFinta(COPIONE) as never, chiediJSON: giudiceFinto().chiediJSON })
  const intera = await vr.valutaRisposte({ origine: 'comando' })
  assert.equal(archivio.leggiStato().ultima?.quando, intera.quando)
  const parziale = await vr.valutaRisposte({ origine: 'comando', solo: ['q01'] })
  assert.ok(parziale.file && existsSync(parziale.file), 'il rapporto c’è')
  assert.equal(archivio.leggiStorico().length, 2, 'e sta nello storico')
  const stato = archivio.leggiStato()
  assert.equal(stato.ultima?.quando, intera.quando, 'ma la riga resta quella della prova intera')
  assert.equal(stato.ultima?.fatte, 6)
  assert.equal(stato.ultimaCompleta, intera.quando)
  // e senza una prova intera prima, la riga resta vuota
  archivio.togli(); archivio.scriviInsieme(INSIEME())
  await vr.valutaRisposte({ origine: 'comando', solo: ['q01'] })
  assert.equal(archivio.leggiStato().ultima, undefined)
  assert.equal(archivio.rigaDiStato(archivio.leggiStato(), true, true, false), null)
})

test('una versione è un fatto intero anche per la prova: «1.0.9» al posto di «1.0.3» è sbagliata, non giusta', async () => {
  archivio.togli(); store.default.exec('DELETE FROM uso')
  const ins = INSIEME()
  const domanda = 'Which Northwind build goes to App Review?'
  ins.domande.push(item('q07', { domanda, tipo: 'risponde', genere: 'cifra', attesa: '1.0.3', doc: { id: 'desktop:checklist', titolo: 'Northwind release checklist.md', fonte: 'desktop', quando: ieri(4) }, citazione: 'Build 1.0.3 goes to App Review', scarto: PRIYA.indexOf('Build') }))
  archivio.scriviInsieme(ins)
  const giudice = giudiceFinto()
  vr.perProva({ rispondi: chatFinta({ [domanda]: 'The build going to App Review is 1.0.9 [g].' }, { insieme: ins }) as never, chiediJSON: giudice.chiediJSON })
  let r = await vr.valutaRisposte({ origine: 'comando', solo: ['q07'] })
  assert.equal(r.voci[0].codice.corrisponde, false, 'il codice: 1.0.9 non copre 1.0.3')
  assert.deepEqual(r.voci[0].codice.scoperti, ['1.0.9'], 'e 1.0.9 non sta da nessuna parte')
  assert.equal(r.voci[0].esito, 'sbagliata', 'col giudice che dice tutto vero, decide il codice')
  vr.perProva({ rispondi: chatFinta({ [domanda]: 'Build 1.0.3 goes to App Review [g].' }, { insieme: ins }) as never, chiediJSON: giudice.chiediJSON })
  r = await vr.valutaRisposte({ origine: 'comando', solo: ['q07'] })
  assert.equal(r.voci[0].esito, 'giusta')
  assert.equal(r.voci[0].fonti[0]?.passo, 'Build 1.0.3 goes to App Review on 2 October 2026.')
})

test('una prova a secco non dice «in corso»: stato.json resta com’era', async () => {
  archivio.togli(); store.default.exec('DELETE FROM uso')
  archivio.scriviInsieme(INSIEME())
  archivio.scriviStato({ ultima: { quando: ieri(2), origine: 'comando', via: 'claude', fatte: 6, quante: 6, giuste: 5, senzaFonte: 0, sbagliate: 1, inventate: 0, rifiutateMale: 0, daRivedere: 0, passa: false, gettoni: 100, file: 'x' } })
  const prima = readFileSync(join(archivio.cartellaRisposte(), 'stato.json'), 'utf8')
  let inCorsoVisto = false
  vr.perProva({ rispondi: (async () => { inCorsoVisto = inCorsoVisto || !!archivio.leggiStato().inCorso; throw new Error('a secco non si chiama') }) as never })
  const r = await vr.valutaRisposte({ origine: 'comando', secco: true })
  assert.equal(inCorsoVisto, false)
  assert.equal(readFileSync(join(archivio.cartellaRisposte(), 'stato.json'), 'utf8'), prima, 'a secco stato.json non si tocca')
  assert.equal(archivio.rigaDiStato(archivio.leggiStato(), true, true, false)?.startsWith('Last check'), true)
  // e un documento che l'indice non ha proprio si dice, invece di un «-» che sembra un recupero mancato
  const ins = INSIEME()
  ins.domande.push(item('q07', { domanda: 'When is the Lumen offsite?', tipo: 'risponde', genere: 'data', attesa: '3 March 2027', doc: { id: 'desktop:manca', titolo: 'Lumen offsite.md', fonte: 'desktop', quando: ieri(2) }, citazione: 'The Lumen offsite is on 3 March 2027.', scarto: 0 }))
  archivio.scriviInsieme(ins)
  const conMancante = await vr.valutaRisposte({ origine: 'comando', secco: true })
  assert.equal(conMancante.voci.find(v => v.id === 'q07')!.codice.docNellIndice, false)
  assert.equal(conMancante.voci.find(v => v.id === 'q01')!.codice.docNellIndice, true)
  assert.match(vr.tabella(conMancante, true), /q07 .*document not in the index/)
  assert.ok(!/q01 .*document not in the index/.test(vr.tabella(conMancante, true)))
  void r
})

test('«svuota la mente» a metà prova: la prova si ferma e le copie private non tornano', async () => {
  archivio.togli(); store.default.exec('DELETE FROM uso')
  archivio.scriviInsieme(INSIEME())
  const giudice = giudiceFinto()
  let fatte = 0
  const chat = chatFinta(COPIONE)
  vr.perProva({
    rispondi: (async (...args: Parameters<typeof chat>) => {
      fatte++
      // alla seconda domanda lui svuota la mente: la cartella se ne va
      if (fatte === 2) archivio.togli()
      return chat(...args)
    }) as never,
    chiediJSON: giudice.chiediJSON
  })
  const r = await vr.valutaRisposte({ origine: 'comando' })
  assert.equal(r.interrotta, 'annullata')
  assert.ok(fatte <= 2, `si ferma alla domanda dopo: ${fatte}`)
  assert.equal(r.file, null)
  assert.ok(!existsSync(archivio.cartellaRisposte()), 'niente stato, storico o rapporto risorti')
  assert.equal(archivio.inCorso(), false)
  vr.perProva(null)
})
