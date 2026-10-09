// Gli ordini fissi (E): le automazioni che fanno davvero qualcosa.
//
// Sul suo Mac: quattordici create, zero che giravano. I perché erano cinque, e
// queste prove ne tengono uno ciascuna: niente vassoio di quattordici giorni
// (al suo posto il mese prima, a sola lettura); una ricevuta a ogni giro; un
// giro andato storto che riprova entro l'ora invece di aspettare domani; una
// salute che non dice «da controllare» a chi aspetta l'arrivo di qualcosa;
// e le cose che un ordine fisso sa proporre oltre a una riga, da approvare con
// un dito, senza mai mandare niente.
//
//   node --test server/ordini-fissi.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-ordini-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({ lingua: 'it', fuso: 'Europe/Rome' }), { mode: 0o600 })

const store = await import('./store.ts')
const auto = await import('./automazioni.ts')
const proposte = await import('./proposte.ts')

after(() => {
  auto.perProva(null); proposte.perProva(null)
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const BASE = {
  nome: 'Una prova', spiega: 'Serve solo ai test.',
  guarda: { cerca: 'preventivo' },
  fai: 'Guarda i preventivi e dimmi quali sono fermi.',
  metti: { inLista: 'oggi' as const, modo: 'io' as const },
  en: { nome: 'A test', spiega: 'Only the tests use it.', fai: 'Look at the quotes and tell me which ones stalled.', cerca: 'preventivo' }
}
const ricetta = (id: string, x: Record<string, unknown> = {}) => ({ ...BASE, id, quando: { ogni: 'giorno' as const, ora: 9 }, ...x }) as import('./automazioni.ts').Automazione
const ROMA = (iso: string) => new Date(`${iso}+02:00`)
const stato = (id: string, x: Partial<import('./store.ts').StatoAutomazione> = {}) =>
  ({ id, spenta: 0, quante: 1, esito: 'fatta', guaio: null, ultima: null, ...x }) as import('./store.ts').StatoAutomazione

// — i giorni feriali e il mese —

test('«dal lunedì al venerdì»: dopo il venerdì il turno è il lunedì, e il sabato non gira', () => {
  const a = ricetta('feriali', { quando: { ogni: 'feriali', ora: 9 } })
  // venerdì 9 ottobre 2026 alle 9 è girata: la prossima è lunedì 12
  const s = stato('feriali', { ultima: ROMA('2026-10-09T09:00:00').toISOString() })
  assert.equal(auto.scadenza(a, s, ROMA('2026-10-09T10:00:00'))?.toISOString(), ROMA('2026-10-12T09:00:00').toISOString())
  assert.equal(auto.tocca(a, s, ROMA('2026-10-10T09:30:00')), false, 'il sabato non si lavora')
  // scritta di sabato: aspetta lunedì
  const nuova = stato('feriali', { ultima: null, dal: ROMA('2026-10-10T08:00:00').toISOString(), quante: 0, esito: null })
  assert.equal(auto.scadenza(a, nuova)?.toISOString(), ROMA('2026-10-12T09:00:00').toISOString())
  // di mercoledì prima delle 9: oggi
  const mer = stato('feriali', { ultima: ROMA('2026-10-13T09:00:00').toISOString() })
  assert.equal(auto.scadenza(a, mer)?.toISOString(), ROMA('2026-10-14T09:00:00').toISOString())
})

test('«una volta al mese»: il giorno detto, o l\'ultimo che il mese ha', () => {
  const a = ricetta('mese', { quando: { ogni: 'mese', giorno: 31, ora: 9 } })
  // girata il 31 marzo: aprile ha trenta giorni, e gira il 30
  const s = stato('mese', { ultima: ROMA('2026-03-31T09:00:00').toISOString() })
  assert.equal(auto.scadenza(a, s)?.toISOString(), ROMA('2026-04-30T09:00:00').toISOString())
  const primo = ricetta('primo', { quando: { ogni: 'mese', giorno: 1, ora: 9 } })
  // in dicembre Roma è un'ora avanti, non due
  const dic = stato('primo', { ultima: '2026-12-01T08:00:00.000Z' })
  assert.equal(auto.scadenza(primo, dic)?.toISOString(), new Date('2027-01-01T08:00:00.000Z').toISOString(), 'dopo dicembre, gennaio dell\'anno dopo')
  // un mese ha una volta sola
  assert.equal(auto.occorrenze(primo, ROMA('2026-01-15T00:00:00'), ROMA('2026-04-15T00:00:00')).length, 3)
})

test('una ricetta con un giorno del mese impossibile viene rifiutata', () => {
  assert.throws(() => auto.scrivi(ricetta('trentadue', { quando: { ogni: 'mese', giorno: 32, ora: 9 } })), /giorno del mese/)
  assert.throws(() => auto.scrivi(ricetta('zero', { quando: { ogni: 'mese', giorno: 0, ora: 9 } })), /giorno del mese/)
  assert.throws(() => auto.scrivi(ricetta('anno', { quando: { ogni: 'anno', ora: 9 } })), /feriali o mese/)
  auto.scrivi(ricetta('lavorativi', { quando: { ogni: 'feriali', ora: 8 } }))
  auto.butta('lavorativi')
})

test('la frase composta dal modello diventa il turno giusto', () => {
  assert.deepEqual(auto.quandoDa({ ogni: 'feriali', ora: 9 }), { ogni: 'feriali', ora: 9 })
  assert.deepEqual(auto.quandoDa({ ogni: 'mese', giorno: 1, ora: 8 }), { ogni: 'mese', giorno: 1, ora: 8 })
  assert.deepEqual(auto.quandoDa({ ogni: 'arrivo', ora: 8 }), { quandoArriva: true })
  const forma = auto.formaRicetta()
  assert.deepEqual(forma.properties.ogni.enum, ['giorno', 'feriali', 'settimana', 'mese', 'arrivo'])
})

test('le ricette che dicono «al mese» girano al mese, e i preventivi solo nei giorni lavorativi', () => {
  const leggi = (f: string) => JSON.parse(readFileSync(new URL(`../automazioni/_comuni/${f}.json`, import.meta.url), 'utf8'))
  for (const f of ['scambi-chiusi', 'rinnovi-in-scadenza']) {
    const r = leggi(f)
    assert.equal(r.quando.ogni, 'mese', `${f} dice «al mese» e girava ogni settimana`)
    assert.match(r.spiega, /mese/)
    assert.match(r.en.spiega, /month/i)
    assert.doesNotMatch(r.en.spiega, /monday/i)
  }
  assert.equal(leggi('sollecito-preventivi').quando.ogni, 'feriali')
})

// — un giro andato storto riprova entro l'ora —

test('un giro andato storto non sposta l\'orologio, e riprova entro l\'ora', () => {
  const a = ricetta('storta')
  auto.scrivi(a)
  store.automazioneGirata('storta', 'fatta', undefined, 3, undefined, { fatti: 1 })
  const prima = store.statoAutomazione('storta')!.ultima
  store.automazioneGirata('storta', 'guaio', 'Il fornitore non risponde.')
  const s = store.statoAutomazione('storta')!
  assert.equal(s.ultima, prima, 'un giro fallito ha spostato «ultima»: il turno era perso fino a domani')
  assert.ok(s.riprova, 'manca quando riprovare')
  const fra = Date.parse(s.riprova!) - Date.now()
  assert.ok(fra > 20 * 60_000 && fra <= 60 * 60_000, `riprova fra ${Math.round(fra / 60_000)} minuti, non entro l'ora`)
  assert.equal(auto.tocca(a, s), false, 'subito dopo il guaio non deve ripartire a ogni quarto d\'ora')
  assert.equal(auto.tocca(a, s, new Date(Date.parse(s.riprova!) + 1000)), true, 'passata l\'ora di riprovare, riprova')
  assert.equal(store.ricevutaDi(s)?.perche, 'guaio')
  // e si vede: sulla scheda, e nella riga fissa del motore
  assert.ok(auto.elenco().find(x => x.id === 'storta')?.riprova)
  assert.deepEqual(auto.inGuaio().map(x => x.id), ['storta'])
  // riuscita, il guaio se ne va
  store.automazioneGirata('storta', 'niente', undefined, 2)
  const dopo = store.statoAutomazione('storta')!
  assert.equal(dopo.riprova, null)
  assert.ok(dopo.ultima && dopo.ultima >= prima!, 'riuscita, l\'orologio riparte')
  assert.deepEqual(auto.inGuaio(), [])
  auto.butta('storta')
})

test('un guaio che si ripete aspetta di più ogni volta, fino a sei ore', () => {
  const g = (esito: string) => ({ quando: new Date().toISOString(), esito, quanti: 0 })
  assert.equal(store.attesaDopoGuai([]), 30 * 60_000, 'il primo riprova entro l\'ora')
  assert.equal(store.attesaDopoGuai([g('fatta'), g('guaio')]), 60 * 60_000)
  assert.equal(store.attesaDopoGuai([g('guaio'), g('guaio')]), 2 * 60 * 60_000)
  assert.equal(store.attesaDopoGuai(Array.from({ length: 12 }, () => g('guaio'))), 6 * 60 * 60_000, 'un guasto fisso non chiama il modello ogni mezz\'ora per sempre')
  assert.equal(store.attesaDopoGuai([g('guaio'), g('guaio'), g('fatta')]), 30 * 60_000, 'dopo una riuscita si riparte da capo')
  // dal vivo: il secondo guaio di fila aspetta un'ora
  const a = auto.scrivi(ricetta('storta-due'))
  store.automazioneGirata(a.id, 'guaio', 'x')
  store.automazioneGirata(a.id, 'guaio', 'x')
  const fra = Date.parse(store.statoAutomazione(a.id)!.riprova!) - Date.now()
  assert.ok(fra > 55 * 60_000 && fra <= 60 * 60_000, `riprova fra ${Math.round(fra / 60_000)} minuti`)
  auto.butta(a.id)
})

test('anche una «quando arriva» andata storta riprova da sola', () => {
  const a = ricetta('arriva-storta', { quando: { quandoArriva: true }, guarda: { soloNuovi: true } })
  const s = stato('arriva-storta', { esito: 'guaio', riprova: new Date(Date.now() - 1000).toISOString() })
  assert.equal(auto.tocca(a, s), true)
  assert.equal(auto.tocca(a, { ...s, esito: 'niente', riprova: null }), false)
})

test('una «quando arriva» andata storta da poco non riparte a ogni lettura: aspetta la sua ora', async () => {
  const a = auto.scrivi(ricetta('arriva-attende', { quando: { quandoArriva: true }, guarda: { soloNuovi: true }, en: { ...BASE.en, cerca: undefined } }))
  store.automazioneGirata(a.id, 'guaio', 'Il fornitore non risponde.')
  const prima = store.statoAutomazione(a.id)!.quante
  await auto.quandoArriva()
  assert.equal(store.statoAutomazione(a.id)!.quante, prima, 'è ripartita prima della sua ora')
  store.default.prepare('UPDATE automazioni SET riprova = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), a.id)
  await auto.quandoArriva()
  assert.equal(store.statoAutomazione(a.id)!.quante, prima + 1, 'passata la sua ora, alla lettura dopo riparte')
  auto.butta(a.id)
})

// — la ricevuta di ogni giro —

test('ogni giro lascia la sua ricevuta: quanti documenti, quante cose, o perché niente', async () => {
  const vuota = ricetta('ricevuta-vuota', { guarda: { cerca: 'parolachenoncenessundocumento' } })
  assert.equal(await auto.fai(vuota), 'niente')
  assert.deepEqual(
    (({ esito, quanti, perche }) => ({ esito, quanti, perche }))(store.ricevutaDi(store.statoAutomazione('ricevuta-vuota'))!),
    { esito: 'niente', quanti: 0, perche: 'vuoto' })

  store.salvaDocumenti([{ id: 'r-prev-1', fonte: 'desktop', tipo: 'file', titolo: 'Preventivo Bianchi', corpo: 'Preventivo da 1200 euro.', quando: new Date().toISOString() }] as never)
  const piena = ricetta('ricevuta-piena')
  assert.equal(await auto.fai(piena), 'fatta')
  const r = store.ricevutaDi(store.statoAutomazione('ricevuta-piena'))!
  assert.equal(r.fatti, 1)
  assert.ok(r.quanti >= 1)
  // una sua riga è ancora aperta: niente, e lo dice
  assert.equal(await auto.fai(piena), 'gia')
  assert.equal(store.ricevutaDi(store.statoAutomazione('ricevuta-piena'))?.perche, 'gia')
  assert.equal(store.statoAutomazione('ricevuta-piena')!.quante, 1, 'rimandata non conta come un giro')

  const ferma = ricetta('ricevuta-condizione', { passi: [{ id: 'gate', tipo: 'condizione', testo: 'Solo se urgente' }] })
  auto.perProva({ collegato: () => true, chiediJSON: async () => ({ continua: false, testo: '' }) })
  try {
    assert.equal(await auto.fai(ferma, { aMano: true }), 'niente')
    assert.equal(store.ricevutaDi(store.statoAutomazione('ricevuta-condizione'))?.perche, 'condizione')
  } finally { auto.perProva(null) }
})

// — la salute capisce che cosa aspetta —

test('una «quando arriva» che non trova niente non è «da controllare»: non è arrivato niente', () => {
  const arriva = ricetta('salute-arriva', { quando: { quandoArriva: true }, guarda: { soloNuovi: true } })
  for (let i = 0; i < 8; i++) store.automazioneGirata('salute-arriva', 'niente', undefined, 0)
  assert.equal(auto.salute(arriva, store.statoAutomazione('salute-arriva')).stato, 'bene')
  // una a orologio con le sue parole, invece, sì: lì il problema sono le parole
  const cerca = ricetta('salute-cerca')
  for (let i = 0; i < 4; i++) store.automazioneGirata('salute-cerca', 'niente', undefined, 0)
  assert.equal(auto.salute(cerca, store.statoAutomazione('salute-cerca')).stato, 'muta')
})

// — il mese prima, al posto del vassoio —

test('il mese prima: conta quello che avrebbe fatto negli ultimi trenta giorni, e non scrive niente', () => {
  const adesso = new Date()
  const giorni = (n: number) => new Date(adesso.getTime() - n * 86_400_000).toISOString()
  store.salvaDocumenti([
    { id: 'm-1', fonte: 'desktop', tipo: 'file', titolo: 'Offerta impianto Verdi', corpo: 'Offerta impianto, 900 euro.', quando: giorni(3) },
    { id: 'm-2', fonte: 'desktop', tipo: 'file', titolo: 'Offerta caldaia Neri', corpo: 'Offerta caldaia, 400 euro.', quando: giorni(12) },
    { id: 'm-3', fonte: 'desktop', tipo: 'file', titolo: 'Offerta vecchia Gialli', corpo: 'Offerta vecchia, fuori dal mese.', quando: giorni(45) }
  ] as never)
  const una = ricetta('mese-una', { guarda: { cerca: 'offerta' }, en: { ...BASE.en, cerca: 'offerta' }, quando: { ogni: 'settimana', giorno: 1, ora: 9 } })
  const righePrima = store.elencoCompiti().length
  const m = auto.mese(una, adesso)
  assert.equal(m.documenti, 2, 'il documento di quarantacinque giorni fa è fuori dal mese')
  assert.ok(m.volte >= 4 && m.volte <= 5)
  // una riga sola con l'elenco: una cosa per ogni volta che trova qualcosa di nuovo
  assert.ok(m.cose >= 1 && m.cose <= 2)
  assert.deepEqual(m.docs.map(d => d.id), ['m-1', 'm-2'], 'dal più recente')
  // per documento: una cosa per documento
  const per = { ...una, id: 'mese-per', metti: { inLista: 'oggi' as const, modo: 'io' as const, perDocumento: true } }
  assert.equal(auto.mese(per, adesso).cose, 2)
  assert.equal(store.elencoCompiti().length, righePrima, 'guardare il mese prima ha scritto una riga')
  assert.equal(store.statoAutomazione('mese-una'), null, 'guardare il mese prima ha toccato il suo stato')
  // e si guarda anche prima di crearla, dai campi dei binari
  const daCampi = auto.daProvare({ nome: 'Offerte', fai: 'Dimmi le offerte ferme.', cerca: 'offerta', quando: { ogni: 'feriali', ora: 9 } })
  assert.equal(auto.mese(daCampi, adesso).documenti, 2)
  assert.equal(auto.ricette().some(r => r.nome === 'Offerte'), false)
})

// — le cose che sa proporre, da approvare con un dito —

test('un ordine fisso può proporre risposte fra le bozze: da indirizzi veri, senza lineette, mai mandate', async () => {
  store.salvaDocumenti([
    { id: 'posta:p-1', fonte: 'posta', tipo: 'email', titolo: 'Preventivo cucina', corpo: 'Mi manda il preventivo della cucina?', autore: 'Sara Neri <sara@neri.example>', quando: new Date().toISOString(), messageId: '<p1@neri>' },
    { id: 'posta:p-2', fonte: 'posta', tipo: 'email', titolo: 'Preventivo bagno', corpo: 'Il preventivo del bagno è pronto?', autore: 'Luca Blu <luca@blu.example>', quando: new Date().toISOString() },
    { id: 'posta:p-3', fonte: 'posta', tipo: 'email', titolo: 'Preventivo cucina inviato', corpo: 'Ecco il preventivo della cucina.', autore: 'Alex <alex@me.example>', quando: new Date().toISOString(), inviato: true }
  ] as never)
  const r = auto.scrivi(ricetta('bozze-casella', { proponi: 'posta.bozza', attrezzi: ['posta.leggi'] }))
  let schema: unknown
  auto.perProva({
    collegato: () => true,
    uso: () => ({ tetto: 0, entrata: 0, uscita: 0 }),
    chiediJSON: async o => {
      schema = o.formato
      return { voci: [
        { doc: 'posta:p-1', oggetto: 'Re: Preventivo cucina', corpo: 'Gentile Sara — eccolo in allegato.', perche: 'Sara chiede il preventivo' },
        { doc: 'posta:inventato', oggetto: 'x', corpo: 'y', perche: 'z' }
      ] }
    }
  })
  try {
    assert.equal(await auto.fai(r), 'fatta')
  } finally { auto.perProva(null) }
  const ids = (schema as { properties: { voci: { items: { properties: { doc: { enum: string[] } } } } } }).properties.voci.items.properties.doc.enum
  assert.ok(ids.includes('posta:p-1') && !ids.includes('posta:inventato'), 'gli id sono un elenco chiuso dei documenti veri')
  assert.ok(!ids.includes('posta:p-3'), 'una risposta a una mail mandata da lui stesso')
  const riga = store.elencoCompiti().find(c => c.origine === 'auto:bozze-casella')!
  assert.equal(riga.stato, 'pronto', 'la proposta nasce pronta, da approvare')
  const p = riga.proposta as Extract<import('./store.ts').Proposta, { azione: 'posta.bozza' }>
  assert.equal(p.azione, 'posta.bozza')
  assert.equal(p.bozze.length, 1, 'l\'id inventato è passato')
  assert.equal(p.bozze[0].a, 'sara@neri.example', 'a chi va lo dice il documento, non il modello')
  assert.doesNotMatch(p.bozze[0].corpo, /—/)
  assert.equal(store.ricevutaDi(store.statoAutomazione('bozze-casella'))?.fatti, 1)

  // «Approva»: la bozza va nella casella, una per voce, e la riga si chiude. Niente parte.
  const salvate: { task: string; source: string; a: string; rispondeA?: string }[] = []
  proposte.perProva({ salvaBozzaCasella: (async (task: string, source: string, e: import('./store.ts').EmailPronta) => {
    salvate.push({ task, source, a: e.a, rispondeA: e.rispondeA?.messageId }); return { stato: 'salvata', id: 'b1', url: '' }
  }) as never })
  try {
    const fatto = await proposte.esegui(riga, p)
    assert.equal(fatto.spostati, 1)
  } finally { proposte.perProva(null) }
  assert.deepEqual(salvate, [{ task: `${riga.id}:posta:p-1`, source: 'posta:p-1', a: 'sara@neri.example', rispondeA: '<p1@neri>' }])
  assert.equal(store.compito(riga.id)?.stato, 'fatto')
  assert.equal(store.compito(riga.id)?.proposta ?? null, null, 'la proposta non resta premibile una seconda volta')
  assert.ok(store.azioni(20).some(a => a.tipo === 'posta.bozza' && a.compito === riga.id && a.esito === 'fatta'))
  assert.ok(!store.azioni(50).some(a => a.compito === riga.id && /manda|invio|send/i.test(a.tipo)), 'non deve partire niente')
})

test('se la casella non salva nessuna bozza, la riga resta lì con la sua proposta', async () => {
  const id = 'c-casella-giu'
  store.scriviCompito({ id, testo: 'Risposte', quando: 'oggi', ordine: 'a0', origine: 'auto:x' })
  const p = { azione: 'posta.bozza' as const, bozze: [{ doc: 'posta:p-2', titolo: 't', a: 'luca@blu.example', oggetto: 'Re', corpo: 'Ciao', perche: 'p' }] }
  store.proponi(id, p, 'una')
  proposte.perProva({ salvaBozzaCasella: (async () => ({ stato: 'errore', errore: 'La casella non risponde.' })) as never })
  try {
    await assert.rejects(proposte.esegui(store.compito(id)!, p), /non risponde/)
  } finally { proposte.perProva(null) }
  assert.equal(store.compito(id)?.stato, 'pronto')
  assert.ok(store.compito(id)?.proposta)
})

test('se la casella ne salva solo alcune, la riga resta con quelle che mancano', async () => {
  const id = 'c-casella-meta'
  store.scriviCompito({ id, testo: 'Risposte', quando: 'oggi', ordine: 'a0', origine: 'auto:x' })
  const b = (n: number) => ({ doc: `posta:m-${n}`, titolo: 't', a: `p${n}@blu.example`, oggetto: 'Re', corpo: 'Ciao', perche: 'p' })
  const p = { azione: 'posta.bozza' as const, bozze: [b(1), b(2)] }
  store.proponi(id, p, 'due')
  proposte.perProva({ salvaBozzaCasella: (async (_t: string, source: string) => source === 'posta:m-1'
    ? { stato: 'salvata', id: 'x', url: '' } : { stato: 'errore', errore: 'Cannot locate the original email.' }) as never })
  try {
    assert.equal((await proposte.esegui(store.compito(id)!, p)).spostati, 1)
  } finally { proposte.perProva(null) }
  const dopo = store.compito(id)!
  assert.equal(dopo.stato, 'pronto', 'si è chiusa e la seconda risposta è sparita')
  assert.deepEqual((dopo.proposta as { bozze: { doc: string }[] }).bozze.map(x => x.doc), ['posta:m-2'])
})

test('su un server la nota, il file e l\'agenda non si offrono e non si preparano', async () => {
  auto.perProva({ ospitato: () => true })
  try {
    for (const proponi of ['nota.crea', 'file.crea', 'agenda.aggiungi']) {
      assert.throws(() => auto.daCampi({ nome: 'Sul server', fai: 'Scrivi il riepilogo della settimana.', proponi }), /solo da Myynd sul Mac/)
    }
    // le bozze nella casella sì: si salvano dal server
    assert.equal(auto.daCampi({ nome: 'Bozze dal server', fai: 'Prepara le risposte fra le bozze.', cerca: 'preventivo', proponi: 'posta.bozza' }).proponi, 'posta.bozza')
  } finally { auto.perProva(null) }
  // una scritta sul Mac che propone una nota, girata su un server: mette la sua riga, senza preparare niente
  store.salvaDocumenti([{ id: 'srv-1', fonte: 'desktop', tipo: 'file', titolo: 'Preventivo Neri', corpo: 'Il preventivo per Neri.', quando: new Date().toISOString() }] as never)
  const r = auto.scrivi(ricetta('nota-sul-server', { proponi: 'nota.crea' }))
  let preparate = 0
  auto.perProva({ ospitato: () => true, collegato: () => true, uso: () => ({ tetto: 0, entrata: 0, uscita: 0 }), chiediJSON: async (o: { lavoro?: string }) => { if (o.lavoro !== 'smistamento') preparate++; return { voci: [] } } })
  try { await auto.fai(r) } finally { auto.perProva(null) }
  const riga = store.elencoCompiti().find(c => c.origine === 'auto:nota-sul-server')
  assert.ok(riga, 'su un server deve restare almeno la riga')
  assert.equal(riga?.proposta ?? null, null, 'una nota da approvare su un server non si approva')
  assert.equal(preparate, 0)
  auto.butta(r.id)
})

test('in agenda solo con una data scritta; una nota e un file sono una cosa sola', async () => {
  const docs = [{ id: 'a-1', fonte: 'desktop', tipo: 'file', titolo: 'Preventivo e sopralluogo', corpo: 'Sopralluogo martedì 20 ottobre alle 10.', quando: new Date().toISOString() }]
  store.salvaDocumenti(docs as never)
  const prova = async (id: string, proponi: string, risposta: unknown) => {
    const r = auto.scrivi(ricetta(id, { proponi }))
    auto.perProva({ collegato: () => true, uso: () => ({ tetto: 0, entrata: 0, uscita: 0 }), chiediJSON: async () => risposta })
    try { await auto.fai(r) } finally { auto.perProva(null) }
    return store.elencoCompiti().find(c => c.origine === `auto:${id}`)?.proposta ?? null
  }
  const agenda = await prova('in-agenda', 'agenda.aggiungi', { voci: [
    { doc: 'a-1', titolo: 'Sopralluogo', inizio: '2026-10-20T10:00', minuti: 60, dove: '', perche: 'scritto nel preventivo' },
    { doc: 'a-1', titolo: 'Senza data', inizio: 'martedì', minuti: 30, dove: '', perche: 'dedotto' }
  ] })
  assert.equal(agenda?.azione, 'agenda.aggiungi')
  assert.deepEqual((agenda as { eventi: { titolo: string }[] }).eventi.map(e => e.titolo), ['Sopralluogo'])
  const nota = await prova('in-nota', 'nota.crea', { voci: [
    { titolo: 'Preventivi — ottobre', testo: 'Due fermi.', perche: 'riepilogo' }, { titolo: 'Seconda', testo: 'x', perche: 'y' }
  ] })
  assert.equal(nota?.azione, 'nota.crea')
  const titolo = (nota as { note: { titolo: string }[] }).note.map(n => n.titolo)
  assert.equal(titolo.length, 1, 'una nota sola')
  assert.doesNotMatch(titolo[0], /—/)

  const file = await prova('in-file', 'file.crea', { voci: [{ titolo: 'Preventivi fermi', testo: 'Bianchi, 1200 euro.', perche: 'riepilogo' }] })
  assert.equal(file?.azione, 'file.crea')
  const riga = store.elencoCompiti().find(c => c.origine === 'auto:in-file')!
  const scritti: unknown[] = []
  proposte.perProva({ salvaConsegna: o => { scritti.push(o); return { percorso: '/Users/x/Desktop/Preventivi fermi.docx', nome: 'Preventivi fermi.docx', luogo: o.luogo } }, luogo: () => 'scrivania' })
  try { await proposte.esegui(riga, file as never) } finally { proposte.perProva(null) }
  assert.deepEqual(scritti, [{ titolo: 'Preventivi fermi', testo: 'Bianchi, 1200 euro.', luogo: 'scrivania' }])
  assert.equal(store.compito(riga.id)?.consegna?.percorso, '/Users/x/Desktop/Preventivi fermi.docx', 'il file si ritrova dalla riga')

  const rigaNota = store.elencoCompiti().find(c => c.origine === 'auto:in-nota')!
  const fatte: unknown[] = []
  proposte.perProva({ creaNota: (async (o: unknown) => { fatte.push(o); return { nome: titolo[0], cartella: 'Note' } }) as never })
  try { await proposte.esegui(rigaNota, nota as never) } finally { proposte.perProva(null) }
  assert.equal(fatte.length, 1)
  assert.equal(store.compito(rigaNota.id)?.stato, 'fatto')
})

test('preparare una proposta costa una bozza: col budget finito non si prepara niente', async () => {
  const r = auto.scrivi(ricetta('proposta-budget', { proponi: 'nota.crea' }))
  let chiamate = 0
  auto.perProva({ collegato: () => true, uso: () => ({ tetto: 100_000, entrata: 90_000, uscita: 0 }), chiediJSON: async () => { chiamate++; return { voci: [] } } })
  try { assert.equal(await auto.fai(r), 'saltata') } finally { auto.perProva(null) }
  assert.equal(chiamate, 0)
})

test('sui binari si sceglie cosa propone: una delle sei, e mai insieme a una riga per documento', () => {
  const a = auto.daCampi({ nome: 'In agenda', fai: 'Metti in agenda i sopralluoghi.', cerca: 'sopralluogo', proponi: 'agenda.aggiungi', metti: { inLista: 'oggi', modo: 'io', perDocumento: true } })
  assert.equal(a.proponi, 'agenda.aggiungi')
  assert.equal(a.metti.perDocumento, undefined)
  assert.throws(() => auto.daCampi({ nome: 'Manda', fai: 'Manda le risposte da solo.', proponi: 'posta.manda' }), /Non so fare/)
  const cambiata = auto.cambia(a.id, { proponi: null })
  assert.equal(cambiata.proponi, undefined, 'si torna a una riga in lista')
  assert.throws(() => auto.scrivi(ricetta('manda', { proponi: 'posta.manda' })), /proponi/)
  auto.butta(a.id)
})

// — da una carta: un promemoria che torna ogni settimana —

test('un promemoria nato da una carta torna in lista anche senza niente da leggere, una volta sola', async () => {
  const a = auto.daCampi({ nome: 'Send the weekly site status to Dana', fai: 'Send the weekly site status to Dana', ogniVolta: true, quando: { ogni: 'settimana', giorno: 1, ora: 8 } })
  assert.deepEqual(a.guarda, { ogniVolta: true, limite: 8 })
  assert.equal(await auto.fai(a), 'fatta', 'senza documenti un promemoria fa lo stesso la sua riga')
  const righe = store.elencoCompiti().filter(c => c.origine === `auto:${a.id}`)
  assert.equal(righe.length, 1)
  assert.equal(righe[0].nota, 'Send the weekly site status to Dana')
  assert.equal(store.ricevutaDi(store.statoAutomazione(a.id))?.fatti, 1)
  // finché la riga di lunedì scorso è aperta, non ne nasce un'altra
  assert.equal(await auto.fai(a), 'gia')
  // il mese prima: una riga per ogni lunedì
  const m = auto.mese(a)
  assert.ok(m.cose >= 4 && m.cose <= 5, `un promemoria settimanale fa quattro o cinque righe al mese, non ${m.cose}`)
  // cambiarne il nome non lo trasforma in «solo il nuovo»
  const cambiata = auto.cambia(a.id, { nome: 'Weekly status to Dana' })
  assert.equal(cambiata.guarda.ogniVolta, true)
  assert.equal(cambiata.guarda.soloNuovi, undefined)
  // una ricetta qualunque, senza materiale, resta muta come prima
  const normale = auto.scrivi(ricetta('senza-materiale', { guarda: { cerca: 'parolachenonce' } }))
  assert.equal(await auto.fai(normale), 'niente')
  auto.butta(a.id); auto.butta(normale.id)
})

// — le quattro di partenza —

test('le quattro di partenza vengono nell\'ordine di chi le usa', () => {
  assert.deepEqual(auto.ordinePacchetto('persona').slice(0, 2), ['risposte-da-dare', 'rinnovi-in-scadenza'])
  assert.deepEqual(auto.ordinePacchetto('azienda').slice(0, 2), ['sollecito-preventivi', 'coordinate-cambiate'])
  assert.deepEqual(auto.ordinePacchetto(undefined), [...auto.PACCHETTO])
  const p = auto.pacchetto()
  assert.equal(p.length, 4)
  assert.ok(p.every(x => x.nome && x.spiega && !x.accesa))
  // accenderne una la copia fra le sue e la fa girare; spegnerla la mette in pausa
  auto.dalPacchetto('coordinate-cambiate', true)
  assert.equal(auto.elenco().find(x => x.id === 'coordinate-cambiate')?.accesa, true)
  assert.equal(auto.eMia('coordinate-cambiate'), true)
  auto.dalPacchetto('coordinate-cambiate', false)
  assert.equal(auto.elenco().find(x => x.id === 'coordinate-cambiate')?.accesa, false)
  assert.equal(auto.pacchetto().find(x => x.id === 'coordinate-cambiate')?.accesa, false)
  assert.throws(() => auto.dalPacchetto('posta-di-massa', true), /partenza/)
})
