// Il lavoro suo fatto da sé: le idee per X, il copione di un video, la
// pagina di Notion. Il ritmo (una volta al giorno, solo con materiale nuovo,
// una volta alla settimana per progetto, Notion solo se il quadro è cambiato
// e solo con la pagina scelta), i prompt (il materiale giusto, niente
// segreti, niente posta), il lavoro con mani finte, e che niente pubblichi.
//
//   node --import ./build/test-profile.mjs --test server/da-se.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-da-se-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const progetti = await import('./progetti.ts')
const x = await import('./connettori/x.ts')
const daSe = await import('./da-se.ts')
const compiti = await import('./compiti.ts')
const turno = await import('./turno.ts')
type Evento = import('./compiti.ts').Evento

const ORA = Date.now()
const GIORNO = 86_400_000
const SI = () => true

before(() => { store.azzeraTutto(); cfg.aggiorna({ lingua: 'en', nome: 'Tobia' }) })
after(() => {
  daSe.perProva(null)
  compiti.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

let n = 0
function post(testo: string, giorniFa: number, numeri: Partial<import('./connettori/x.ts').Numeri> | null = { visualizzazioni: 1000, mipiace: 10, repost: 1, risposte: 2, segnalibri: 1 }) {
  const d = x.documentoMio({
    postId: String(1840000000000000000n + BigInt(++n)), testo, url: null, risposta: false,
    quando: new Date(ORA - giorniFa * GIORNO).toISOString(),
    numeri: numeri ? { visualizzazioni: 0, mipiace: 0, repost: 0, risposte: 0, segnalibri: 0, ...numeri } : null
  }, false)!
  store.salvaDocumenti([d])
  return d.id
}
function quadri(q: Record<string, Partial<import('./quadro.ts').Quadro> & { sintesi?: string }>) {
  const tutti = Object.fromEntries(Object.entries(q).map(([id, v]) => [id, { progetto: id, nome: '', stato: '', traguardo: '', blocco: '', mosse: [], quando: new Date(ORA).toISOString(), impronta: 'i', ...v }]))
  writeFileSync(join(cfg.cartella(), 'quadri.json'), JSON.stringify({ quadri: tutti }))
}
function chiusa(testo: string, progetto: string) {
  const id = `chiusa-${++n}`
  store.scriviCompito({ id, testo, progetto, ordine: `z${n}` })
  store.cambiaStatoCompito(id, 'fatto')
  return id
}
const mie = () => store.elencoCompiti().filter(c => daSe.suo(c.origine))
/** Le carte di questo file chiuse, come se fosse passata la giornata: il ritmo si prova da solo. */
function chiudiLeMie() { for (const c of mie()) store.cambiaStatoCompito(c.id, 'fatto') }
function ripulisci() {
  chiudiLeMie()
  rmSync(join(cfg.cartella(), 'da-se.json'), { force: true })
}

/** Il modello finto che riesce: due idee che reggono, e un copione che regge. */
const IDEE_BUONE = { idee: [
  { angolo: 'behind the scenes', testo: 'Day four of building in public and the inbox still answers itself.', perche: 'You keep the daily thread going.', fonti: ['X1'] },
  { angolo: 'a belief his best posts share', testo: 'Reading mail is not work. Deciding what to say is.', perche: 'Your posts keep coming back to it.', fonti: ['X2'] }
] }
const COPIONE_BUONO = {
  titolo: 'Notes sync', gancio: 'My notes and my inbox finally talk to each other.',
  battute: [
    { testo: 'On Tuesday the beta testers got notes sync. Every draft the twin writes now reads the notes I took that morning, before it says a single word to anyone.', fonti: ['E1'] },
    { testo: 'I built it because I kept fixing the same reply twice. The draft was polite and wrong, because it never knew what I had promised in a meeting an hour earlier.', fonti: ['E1', 'P1'] },
    { testo: 'If you run a small company from your inbox, this is the difference between a draft you rewrite and a draft you send. That gap is where my mornings used to go.', fonti: ['P2'] }
  ],
  chiusura: 'Next on the list is the first founder who pays for it. Would you trust a draft that read your notes?',
  inquadrature: ['Me to camera at the desk', 'Screen recording of a draft with a note beside it'], perche: 'Notes sync shipped this week.'
}
const salvaFinta = (o: { titolo: string; luogo: import('./mani.ts').Luogo }) => ({ percorso: join(CASA, `${o.titolo}.docx`), nome: `${o.titolo}.docx`, luogo: o.luogo })

let myynd: import('./progetti.ts').Progetto
let evermute: import('./progetti.ts').Progetto
before(() => {
  myynd = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Sell the Mac app to founders' })
  evermute = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Ship Evermute 1.0 on the App Store' })
  // la posta che tocca un progetto: non deve mai finire in un prompt di X o del video
  store.salvaDocumenti([{ id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'Myynd pricing', corpo: 'Marco from Lumen says the Myynd price of 4900 euro is SEGRETO-DELLA-POSTA.', autore: 'marco@lumen.test', percorso: null, quando: new Date(ORA - GIORNO).toISOString(), gruppo: 'posta' }])
  cfg.aggiorna({ notion: { token: 'ntn_SEGRETO_NON_DIRE', paginaMyynd: { id: 'p1', titolo: 'Myynd' } } as never, compatibile: { url: 'http://127.0.0.1:9/v1', chiave: 'sk-SEGRETO-CHIAVE', modello: 'finto' } as never })
})
beforeEach(() => { daSe.perProva(null); cfg.aggiorna({ autonomia: 'preparare' as never, turno: {} }) })

// — il ritmo, puro —

test('una volta al giorno: mai nello stesso giorno, mai a meno di dodici ore; una volta alla settimana: sette giorni pieni', () => {
  const mezzanotte = new Date(2026, 9, 15, 0, 30).getTime()
  assert.equal(daSe.unaVoltaAlGiorno(undefined, mezzanotte), true)
  assert.equal(daSe.unaVoltaAlGiorno(new Date(2026, 9, 15, 0, 5).toISOString(), mezzanotte), false, 'lo stesso giorno')
  assert.equal(daSe.unaVoltaAlGiorno(new Date(2026, 9, 14, 23, 50).toISOString(), mezzanotte), false, 'un altro giorno, ma quaranta minuti fa')
  assert.equal(daSe.unaVoltaAlGiorno(new Date(2026, 9, 14, 9, 0).toISOString(), mezzanotte), true)
  assert.equal(daSe.unaVoltaAllaSettimana(new Date(mezzanotte - 6.9 * GIORNO).toISOString(), mezzanotte), false)
  assert.equal(daSe.unaVoltaAllaSettimana(new Date(mezzanotte - 7 * GIORNO).toISOString(), mezzanotte), true)
})

test('gli interruttori: la pausa, il turno spento o fermato, nessun motore: niente nasce', async () => {
  for (let i = 0; i < 4; i++) post(`Building in public, day ${i}: the twin reads my mail so I don't have to.`, i + 1)
  assert.equal(daSe.permesso(SI), true)
  cfg.aggiorna({ autonomia: 'chiedere' as never })
  assert.equal(daSe.permesso(SI), false)
  assert.deepEqual(await daSe.giro(ORA, { pronto: SI, pagina: SI }), [])
  cfg.aggiorna({ autonomia: 'preparare' as never, turno: { spento: true } })
  assert.equal(daSe.permesso(SI), false)
  cfg.aggiorna({ turno: { fermo: new Date().toISOString() } })
  assert.equal(daSe.permesso(SI), false)
  cfg.aggiorna({ turno: {} })
  assert.equal(daSe.permesso(() => false), false)
  assert.deepEqual(await daSe.giro(ORA, { pronto: () => false, pagina: SI }), [])
  assert.equal(mie().length, 0)
})

// — 1 · le idee per X —

test('le idee per X: una carta in coda per il turno, con la mano del file, priorità bassa; una volta al giorno, e solo con materiale nuovo', async () => {
  ripulisci()
  const nate = await daSe.giro(ORA, { pronto: SI, pagina: () => false })
  const idea = nate.find(id => id.startsWith('idee-x-'))
  assert.ok(idea, `nate: ${nate.join(', ')}`)
  const c = store.compito(idea!)!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.modo, 'tutto')
  assert.equal(c.priorita, 'bassa')
  assert.equal(c.turno?.da, 'myynd')
  assert.equal(c.turno?.quando, 'notte')
  assert.deepEqual(c.contratto?.mani, ['file'])
  // il testo non nomina un progetto: la prima pagina la mette fra il resto, non sotto «Myynd»
  assert.ok(!/Myynd|Evermute/.test(`${c.testo}\n${c.nota}`), c.nota ?? '')
  // nascere non scrive il ritmo: lo scrive solo il lavoro consegnato
  assert.equal(daSe.leggiStato().x?.ultimo, undefined)
  daSe.perProva({ chiedi: (async () => IDEE_BUONE) as never, salva: salvaFinta })
  const e = await daSe.lavora(c, { adesso: ORA })
  assert.equal(e.consegna?.app, 'File', JSON.stringify(e))
  assert.ok(daSe.leggiStato().x?.ultimo)
  chiudiLeMie()
  // lo stesso giorno: niente
  assert.equal((await daSe.giro(ORA + 60_000, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('idee-x-')).length, 0, 'lo stesso giorno')
  // il giorno dopo, senza niente di nuovo: niente
  assert.equal((await daSe.giro(ORA + GIORNO, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('idee-x-')).length, 0, 'niente di nuovo')
  // un post nuovo: il lotto nasce
  post('Shipped the morning receipt: what the twin did while I slept, in one card.', 0)
  assert.equal((await daSe.giro(ORA + GIORNO, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('idee-x-')).length, 1)
  chiudiLeMie()
})

test('una carta caduta non brucia il suo giorno: col modello giù domani ne nasce un\'altra; «niente che regga» aspetta materiale nuovo', async () => {
  ripulisci()
  const id = (await daSe.giro(ORA + 2 * GIORNO, { pronto: SI, pagina: () => false })).find(x => x.startsWith('idee-x-'))!
  assert.ok(id)
  daSe.perProva({ chiedi: (async () => { throw new Error('motore giù') }) as never, salva: salvaFinta })
  await assert.rejects(daSe.lavora(store.compito(id)!, { adesso: ORA + 2 * GIORNO }))
  assert.equal(daSe.leggiStato().x?.ultimo, undefined, 'il guasto non scrive il ritmo')
  chiudiLeMie()
  // lo stesso giorno la carta c'è già (anche chiusa): l'id ha il giorno dentro
  assert.equal((await daSe.giro(ORA + 2 * GIORNO + 60_000, { pronto: SI, pagina: () => false })).filter(x => x.startsWith('idee-x-')).length, 0)
  const domani = (await daSe.giro(ORA + 3 * GIORNO, { pronto: SI, pagina: () => false })).find(x => x.startsWith('idee-x-'))
  assert.ok(domani, 'lo stesso materiale, il giorno dopo')
  daSe.perProva({ chiedi: (async () => ({ idee: [] })) as never, salva: salvaFinta })
  const e = await daSe.lavora(store.compito(domani!)!, { adesso: ORA + 3 * GIORNO })
  assert.ok(e.ritira)
  assert.ok(daSe.leggiStato().x?.visto, 'niente che regga: quel materiale è guardato, non si ritenta ogni giorno')
  assert.equal(daSe.leggiStato().x?.ultimo, undefined, 'e il ritmo non si scrive: non è stato consegnato niente')
  chiudiLeMie()
  assert.equal((await daSe.giro(ORA + 4 * GIORNO, { pronto: SI, pagina: () => false })).filter(x => x.startsWith('idee-x-')).length, 0, 'stesso materiale: nessuna carta nuova')
  // una carta ferma su un guaio da più di dodici ore si ritira, e non tiene il posto
  ripulisci()
  assert.ok((await daSe.giro(ORA + 4 * GIORNO, { pronto: SI, pagina: () => false })).some(x => x.startsWith('idee-x-')))
  const ferma = mie().find(c => c.origine === 'idee-x')!
  store.default.prepare("UPDATE compiti SET guaio = 'x', aggiornato = ? WHERE id = ?").run(new Date(ORA).toISOString(), ferma.id)
  await daSe.giro(ORA + 5 * GIORNO, { pronto: SI, pagina: () => false })
  assert.equal(store.compito(ferma.id)!.stato, 'ritirato')
  chiudiLeMie()
})

test('le idee per X: senza almeno tre post suoi recenti non si sa come scrive, e niente nasce', () => {
  // fra duecento giorni i suoi post sono tutti fuori dalla finestra
  assert.equal(daSe.materialeX(ORA + 200 * GIORNO), null)
  assert.equal(daSe.sceltaX([], ORA + 200 * GIORNO), null)
})

test('il prompt delle idee: i suoi post con i numeri, i progetti, il lavoro chiuso; niente posta, niente segreti', () => {
  quadri({ [myynd.id]: { sintesi: 'Myynd is a Mac twin that drafts replies overnight. The beta runs on two Macs.', traguardo: 'First paying founder', stato: 'Beta on two Macs.' } })
  chiusa('Ship the morning receipt card', myynd.id)
  const m = daSe.materialeX(ORA)!
  assert.ok(m)
  const p = daSe.promptX(m)
  const tutto = `${p.system}\n${p.utente}`
  assert.match(p.utente, /views, \d+ likes/)
  assert.match(p.utente, /Building in public/)
  assert.match(p.utente, /\[P\d\] Myynd: Sell the Mac app to founders\. Where it stands: Myynd is a Mac twin that drafts replies overnight\. The beta runs on two Macs\. Next milestone: First paying founder\./)
  assert.match(p.utente, /Ship the morning receipt card/)
  assert.match(p.system, /Never invent users/)
  assert.match(p.system, /No hashtags\./)
  assert.match(p.system, /No em dashes/)
  assert.ok(p.fonti.has('P1') && p.fonti.has('L1') && p.fonti.has('X1'))
  for (const segreto of ['SEGRETO-DELLA-POSTA', 'ntn_SEGRETO', 'sk-SEGRETO', 'marco@lumen']) assert.ok(!tutto.includes(segreto), `nel prompt: ${segreto}`)
})

test('le idee che reggono: fonte vera, niente hashtag se non li usa, niente lineette, niente doppioni dei suoi post', () => {
  const m = daSe.materialeX(ORA)!
  const { fonti } = daSe.promptX(m)
  const idee = daSe.ideeValide({ idee: [
    { testo: 'The twin now writes the receipt of the night — one card, done. #buildinpublic', perche: 'You shipped the receipt card this week (L1).', fonti: ['[L1]'] },
    { testo: 'An idea from nowhere', perche: 'Because.', fonti: ['Z9'] },
    { testo: 'No source at all', perche: 'Because.', fonti: [] },
    { testo: m.post[0]!.testo, perche: 'Again.', fonti: ['X1'] }
  ] }, fonti, m)
  assert.equal(idee.length, 1)
  assert.ok(!/[—–#]/.test(idee[0]!.testo), idee[0]!.testo)
  assert.deepEqual(idee[0]!.fonti, ['L1'])
  assert.equal(idee[0]!.perche, 'You shipped the receipt card this week.', 'le etichette restano nelle fonti')
  const f = daSe.fileIdee(idee, fonti, ORA, true)
  assert.match(f.testo, /^# Ideas for X, /)
  assert.match(f.testo, /\*\*Why now:\*\* You shipped/)
  assert.match(f.testo, /\*\*From:\*\* Myynd, Ship the morning receipt card/)
})

// — 2 · il copione —

test('il copione: al progetto che si è mosso abbastanza, una volta alla settimana per progetto dall\'ultimo consegnato, uno al giorno in tutto', async () => {
  ripulisci()
  quadri({
    [myynd.id]: { sintesi: 'Myynd drafts replies overnight.', traguardo: 'First paying founder' },
    [evermute.id]: { sintesi: 'Evermute is a sleep app.', traguardo: 'App Store review' }
  })
  // Evermute: una riga chiusa sola, poco; Myynd: una cosa uscita e una riga chiusa
  chiusa('Fix the onboarding copy', evermute.id)
  chiusa('Launched the notes sync to beta users', myynd.id)
  const prima = await daSe.giro(ORA, { pronto: SI, pagina: () => false })
  const video = prima.filter(id => id.startsWith('copione-video-'))
  assert.deepEqual(video, [`copione-video-${myynd.id}-${new Date(ORA).toLocaleDateString('en-CA')}`])
  assert.deepEqual(store.compito(video[0]!)!.contratto?.mani, ['file'])
  // il primo traguardo visto si scrive una volta, e il giro dopo non riscrive niente
  assert.equal(daSe.leggiStato().video?.[myynd.id]?.traguardo, 'First paying founder')
  const disco = readFileSync(join(cfg.cartella(), 'da-se.json'), 'utf8')
  await daSe.giro(ORA + 60_000, { pronto: SI, pagina: () => false })
  assert.equal(readFileSync(join(cfg.cartella(), 'da-se.json'), 'utf8'), disco, 'niente cambia, niente si scrive')
  // consegnato: il ritmo parte da qui
  daSe.perProva({ chiedi: (async () => COPIONE_BUONO) as never, salva: salvaFinta })
  const e = await daSe.lavora(store.compito(video[0]!)!, { adesso: ORA })
  assert.equal(e.consegna?.app, 'File', JSON.stringify(e))
  assert.ok(daSe.leggiStato().video?.[myynd.id]?.ultimo)
  chiudiLeMie()
  // il giorno dopo, con altro progresso su Myynd: dentro la settimana, niente
  chiusa('Shipped v0.3 with the receipt', myynd.id)
  assert.equal((await daSe.giro(ORA + GIORNO, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('copione-video-')).length, 0)
  // otto giorni dopo, senza niente di nuovo: niente; con un traguardo nuovo: il copione
  assert.equal((await daSe.giro(ORA + 8 * GIORNO, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('copione-video-')).length, 0)
  quadri({
    [myynd.id]: { sintesi: 'Myynd drafts replies overnight.', traguardo: 'Ten paying founders by December' },
    [evermute.id]: { sintesi: 'Evermute is a sleep app.', traguardo: 'App Store review' }
  })
  const dopo = (await daSe.giro(ORA + 8 * GIORNO + 3_600_000, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('copione-video-'))
  assert.equal(dopo.length, 1)
  assert.ok(dopo[0]!.includes(myynd.id))
  chiudiLeMie()
})

test('un copione caduto non brucia la settimana: il giorno dopo il progetto torna in gara', async () => {
  ripulisci()
  quadri({ [myynd.id]: { sintesi: 'Myynd drafts replies overnight.', traguardo: 'First paying founder' } })
  chiusa('Launched the morning receipt to beta users', myynd.id)
  chiusa('Shipped the notes sync', myynd.id)
  const id = (await daSe.giro(ORA + 2 * GIORNO, { pronto: SI, pagina: () => false })).find(x => x.startsWith('copione-video-'))
  assert.ok(id)
  daSe.perProva({ chiedi: (async () => ({ ...COPIONE_BUONO, battute: COPIONE_BUONO.battute.slice(0, 1) })) as never, salva: salvaFinta })
  await assert.rejects(daSe.lavora(store.compito(id!)!, { adesso: ORA + 2 * GIORNO }), /did not hold up/)
  assert.equal(daSe.leggiStato().video?.[myynd.id]?.ultimo, undefined)
  chiudiLeMie()
  assert.ok((await daSe.giro(ORA + 3 * GIORNO, { pronto: SI, pagina: () => false })).some(x => x.startsWith('copione-video-')))
  chiudiLeMie()
})

test('il progresso: una cosa uscita e un traguardo nuovo pesano tre, una riga chiusa uno; il traguardo nuovo conta solo se è un altro', () => {
  const foto = daSe.fotoDi({ progetto: evermute.id, nome: 'Evermute', stato: 'In review.', traguardo: 'Featured on the App Store', blocco: '', mosse: [], quando: '', impronta: '' })!
  const solo = daSe.progressoDi(evermute, foto, ORA - 7 * GIORNO, ORA, 'Featured on the App Store')
  assert.ok(daSe.pesoDi(solo) < daSe.PESO_VIDEO, JSON.stringify(solo))
  const mosso = daSe.progressoDi(evermute, foto, ORA - 7 * GIORNO, ORA, 'Pass App Store review')
  assert.ok(mosso.some(e => /^Milestone moved/.test(e.testo)))
  assert.ok(daSe.pesoDi(mosso) >= daSe.PESO_VIDEO)
  assert.deepEqual(mosso.map(e => e.id).slice(0, 2), ['E1', 'E2'])
})

test('il prompt del copione: il progresso con le etichette, la forma, la voce; niente posta né segreti', () => {
  const foto = daSe.fotoDi({ progetto: myynd.id, nome: 'Myynd', stato: '', sintesi: 'Myynd drafts replies overnight.', traguardo: 'First paying founder', blocco: '', mosse: [], quando: '', impronta: '' } as never)
  const progresso = daSe.progressoDi(myynd, foto, ORA - 7 * GIORNO, ORA)
  // la cartella del progetto: i commit e il changelog, scritti da lui
  const oggi = new Date(ORA).toISOString().slice(0, 10)
  store.salvaDocumenti([{ id: '/casa/code/myynd'.replace(/^/, 'lavoro:'), fonte: 'lavoro', tipo: 'cartella', gruppo: 'documenti', titolo: 'Lavoro: myynd', percorso: '/casa/code/myynd', quando: new Date(ORA).toISOString(),
    corpo: `Cartella di lavoro: myynd (/casa/code/myynd).\nUltimi commit:\n${oggi}  drafts read the notes you took that morning\n${oggi}  receipt card counts what was set aside\nREADME: Myynd, a digital twin for founders.\nAppunti: CHANGELOG - 0.3: drafts read your notes before writing. - 0.2: the morning receipt.` } as never])
  const cartella = daSe.cartellaPerVideo(myynd, ORA)
  assert.ok(cartella.some(f => /commit: drafts read the notes/.test(f.testo)), JSON.stringify(cartella))
  assert.ok(cartella.some(f => /notes: 0\.3: drafts read your notes before writing/.test(f.testo)), JSON.stringify(cartella))
  const p = daSe.promptVideo({ progetto: myynd, foto, progresso, cartella, post: daSe.suoiPost(ORA), lingua: 'en' })
  assert.match(p.utente, /From the project folder \(commits and his notes\):\n\[C1\] /)
  const tutto = `${p.system}\n${p.utente}`
  assert.match(p.utente, /\[E1\] .*Launched the notes sync|\[E\d\] .*Shipped v0\.3/)
  assert.match(p.utente, /\[P2\] In short: Myynd drafts replies overnight/)
  assert.match(p.system, /Exactly 3 beats, in this order/)
  assert.match(p.system, /150 to 230 words/)
  assert.match(p.utente, /How he talks on X \(his voice only, not facts\)/)
  for (const segreto of ['SEGRETO-DELLA-POSTA', 'ntn_SEGRETO', 'sk-SEGRETO']) assert.ok(!tutto.includes(segreto))
})

test('il copione che regge: tre battute con le loro fonti, nessuna frase bandita, nessuna frase detta due volte', () => {
  const fonti = new Map([['E1', { id: 'E1', testo: 'x', etichetta: 'Launched notes sync' }], ['P1', { id: 'P1', testo: 'x', etichetta: 'Myynd' }], ['P2', { id: 'P2', testo: 'x', etichetta: 'Myynd, where it stands' }]])
  const problemi = (o: unknown) => { const p: string[] = []; daSe.copioneValido(o, fonti, p); return p.join(' | ') }
  const c = daSe.copioneValido(COPIONE_BUONO, fonti)!
  assert.ok(c, problemi(COPIONE_BUONO))
  assert.match(problemi({ ...COPIONE_BUONO, battute: COPIONE_BUONO.battute.slice(0, 2) }), /2 beats instead of 3/)
  assert.match(problemi({ ...COPIONE_BUONO, battute: COPIONE_BUONO.battute.map(b => ({ ...b, fonti: ['Q1'] })) }), /no label from the material/)
  assert.match(problemi({ ...COPIONE_BUONO, battute: COPIONE_BUONO.battute.map(b => ({ ...b, testo: 'Short.' })) }), /words, it must be/)
  assert.match(problemi({ ...COPIONE_BUONO, chiusura: 'Back to work. Stay tuned.' }), /banned phrase "Back to work"/i)
  assert.match(problemi({ ...COPIONE_BUONO, titolo: 'No more guessing' }), /banned phrase "No more"/i, 'anche nel titolo')
  const conProgetto: string[] = []
  daSe.copioneValido({ ...COPIONE_BUONO, gancio: 'Myynd now reads your notes before it writes.' }, fonti, conProgetto, { progetto: 'Myynd' })
  assert.match(conProgetto.join(' '), /the hook opens with the project name/)
  // il gancio detto di nuovo nella prima battuta, con altre parole
  const ripete = { ...COPIONE_BUONO, battute: [{ testo: 'My inbox and my notes finally talk to each other now. ' + COPIONE_BUONO.battute[0]!.testo, fonti: ['E1'] }, ...COPIONE_BUONO.battute.slice(1)] }
  assert.match(problemi(ripete), /two sentences say the same thing/)
  const f = daSe.fileCopione(c, myynd, fonti, true)
  assert.match(f.testo, /## Hook[\s\S]*## Beat 1[\s\S]*## Beat 3[\s\S]*## Close[\s\S]*## Shots/)
})

test('le idee: angoli diversi, prime parole diverse, niente frasi bandite, nessun numero che il materiale non dica, mai il nome del progetto in apertura', () => {
  const m = daSe.materialeX(ORA)!
  const { fonti, utente } = daSe.promptX(m)
  const scarti: string[] = []
  const idee = daSe.ideeValide({ idee: [
    { angolo: 'result', testo: 'Excited to share that the receipt is live.', perche: 'x', fonti: ['X1'] },
    { angolo: 'result', testo: 'Myynd now writes the receipt of the night.', perche: 'x', fonti: ['X1'] },
    { angolo: 'a number he gave', testo: '412 people asked for this and now it exists.', perche: 'x', fonti: ['X1'] },
    { angolo: 'behind the scenes', testo: 'Day four of building in public and the inbox still answers itself.', perche: 'x', fonti: ['X1'] },
    { angolo: 'behind the scenes', testo: 'Late night, one more fix, the drafts finally read my notes.', perche: 'x', fonti: ['X1'] },
    { angolo: 'decision and reason', testo: 'Day five: I cut the settings page. Nobody opened it.', perche: 'x', fonti: ['X1'] },
    { angolo: 'mistake or surprise', testo: 'The receipt went out twice this morning, and the second copy was the one I wanted.', perche: 'x', fonti: ['X1'] }
  ] }, fonti, m, { materiale: utente, scarti })
  assert.deepEqual(idee.map(i => i.testo), ['Day four of building in public and the inbox still answers itself.', 'The receipt went out twice this morning, and the second copy was the one I wanted.'], scarti.join('\n'))
  const tutti = scarti.join('\n')
  assert.match(tutti, /banned phrase/)
  assert.match(tutti, /opens with the project name/)
  assert.match(tutti, /numbers not in the material: 412/)
  assert.match(tutti, /angle "behind the scenes" used twice/)
  assert.match(tutti, /opens with the same word/)
})

test('la rilettura: una seconda chiamata riscrive il lotto con i problemi trovati, e vince se regge almeno quanto la stesura', async () => {
  ripulisci()
  const chiamate: { system: string; utente: string }[] = []
  const deboli = { idee: [{ angolo: 'result', testo: 'Myynd got better this week.', perche: 'x', fonti: ['X1'] }] }
  daSe.perProva({
    chiedi: (async (o: { system: string; messages: { content: string }[] }) => { chiamate.push({ system: o.system, utente: o.messages[0]!.content }); return chiamate.length === 1 ? deboli : IDEE_BUONE }) as never,
    salva: salvaFinta
  })
  const id = (await daSe.giro(ORA + 40 * GIORNO, { pronto: SI, pagina: () => false })).find(x => x.startsWith('idee-x-'))
  assert.ok(id)
  const e = await daSe.lavora(store.compito(id!)!, { adesso: ORA + 40 * GIORNO })
  assert.equal(chiamate.length, 2)
  assert.match(chiamate[1]!.system, /editor of X post drafts/)
  assert.match(chiamate[1]!.system, /weakest idea/)
  assert.match(chiamate[1]!.utente, /opens with the project name/, 'i problemi trovati arrivano alla rilettura')
  assert.equal(e.consegna?.app, 'File')
  chiudiLeMie()
})

test('quello che viene dalla posta non entra: un indirizzo, una cifra in denaro, il nome di chi ha scritto', () => {
  const pulita = daSe.senzaPosta('The beta runs on two Macs. Marco Neri wants the quote by Friday. Pricing is 4900 euro. Write to marco@lumen.test.', ['marco neri', 'neri'])
  assert.equal(pulita, 'The beta runs on two Macs.')
  const f = daSe.fotoPulita({ sintesi: 'Beta on two Macs. Neri asked for a discount.', stato: '', traguardo: 'First paying founder', blocco: 'Lumen wants 4.900 € before Friday', mosse: ['Renew the certificate', 'Reply to Marco Neri'], domanda: '' }, ['marco neri', 'neri'])
  assert.equal(f.sintesi, 'Beta on two Macs.')
  assert.equal(f.blocco, '')
  assert.deepEqual(f.mosse, ['Renew the certificate'])
  // i nomi vengono dalla posta ricevuta, non da quella mandata da lui
  store.salvaDocumenti([{ id: 'posta:INBOX:9', fonte: 'posta', tipo: 'email', titolo: 'Quote', corpo: 'x', autore: 'Giulia Bassi <giulia@harbor.test>', percorso: null, quando: new Date(ORA - GIORNO).toISOString(), gruppo: 'posta' } as never])
  assert.ok(daSe.nomiDallaPosta(ORA).includes('giulia bassi'))
  assert.ok(daSe.nomiDallaPosta(ORA).includes('bassi'))
})

// — 3 · Notion —

test('Notion: senza la pagina scelta niente; con la pagina, una al giorno per progetto e solo se il quadro è cambiato', async () => {
  ripulisci()
  quadri({ [myynd.id]: { sintesi: 'Myynd drafts replies overnight.', traguardo: 'First paying founder', stato: 'Beta on two Macs.' } })
  assert.equal((await daSe.giro(ORA, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('pagina-notion-')).length, 0)
  const nate = (await daSe.giro(ORA, { pronto: SI, pagina: SI })).filter(id => id.startsWith('pagina-notion-'))
  assert.deepEqual(nate, [`pagina-notion-${myynd.id}-${new Date(ORA).toLocaleDateString('en-CA')}`])
  const c = store.compito(nate[0]!)!
  assert.deepEqual(c.contratto?.mani, ['notion'])
  assert.equal(c.quando, 'poi')
  // scritta: il giorno dopo, quadro uguale (anche riscritto con altre parole), niente
  let chiamata: { chiave: string; testo: string } | null = null
  daSe.perProva({
    pagina: SI, chiedi: async () => null,
    scriviNotion: async o => { chiamata = o; return { testo: 'ok', fatto: { attrezzo: 'scrivi_notion', esito: 'ok', dettaglio: o.titolo } } }
  })
  const e = await daSe.lavora(c, { adesso: ORA })
  assert.equal(chiamata!.chiave, `progetto:${myynd.id}`)
  assert.match(chiamata!.testo, /## In short[\s\S]*## What changed since the last update\n\nFirst page\./)
  assert.ok(e.chiudi, 'la prima pagina non è una carta')
  chiudiLeMie()
  quadri({ [myynd.id]: { sintesi: 'Myynd drafts the replies overnight.', traguardo: 'First paying founder', stato: 'Beta on two Macs.' } })
  assert.equal((await daSe.giro(ORA + GIORNO, { pronto: SI, pagina: SI })).filter(id => id.startsWith('pagina-notion-')).length, 0, 'stesso senso, altre parole')
  // il traguardo cambia: una pagina nuova, e stavolta è una carta
  quadri({ [myynd.id]: { sintesi: 'Myynd drafts replies overnight.', traguardo: 'Ten paying founders by December', stato: 'Beta on two Macs.' } })
  const dopo = (await daSe.giro(ORA + GIORNO, { pronto: SI, pagina: SI })).filter(id => id.startsWith('pagina-notion-'))
  assert.equal(dopo.length, 1)
  assert.equal((await daSe.giro(ORA + GIORNO + 60_000, { pronto: SI, pagina: SI })).filter(id => id.startsWith('pagina-notion-')).length, 0, 'una al giorno')
  const e2 = await daSe.lavora(store.compito(dopo[0]!)!, { adesso: ORA + GIORNO })
  assert.equal(e2.chiudi, undefined)
  assert.match(e2.testo, /Next milestone: was "First paying founder", now "Ten paying founders by December"/)
})

test('il prompt della pagina: il quadro di adesso e quello di prima, niente segreti', () => {
  const ora = daSe.fotoDi({ progetto: myynd.id, nome: 'Myynd', stato: 'Beta.', traguardo: 'Ten founders', blocco: 'Signing the app', mosse: [{ titolo: 'Renew the Developer ID' } as never], quando: '', impronta: '' })!
  const prima = { ...ora, traguardo: 'One founder', blocco: '' }
  const p = daSe.promptNotion({ progetto: myynd, foto: ora, prima })
  assert.match(p.utente, /Now:\n[\s\S]*Next milestone: Ten founders[\s\S]*The previous page said:\n[\s\S]*Next milestone: One founder/)
  assert.match(p.utente, /Blocked by: Signing the app/)
  assert.ok(!`${p.system}${p.utente}`.includes('ntn_SEGRETO'))
  assert.equal(daSe.importante(prima, ora), true)
  assert.equal(daSe.importante(ora, ora), false)
  assert.equal(daSe.cambiata(ora, { ...ora }), false)
})

test('il tetto: al massimo tre carte di questo genere vive insieme', async () => {
  ripulisci()
  const tanti = Array.from({ length: 4 }, (_, i) => progetti.scrivi({ nome: `Progetto ${i}`, obiettivo: 'x' }))
  quadri(Object.fromEntries(tanti.map(p => [p.id, { sintesi: `Lo stato di ${p.nome}.`, traguardo: 'Uscire' }])))
  await daSe.giro(ORA, { pronto: SI, pagina: SI })
  await daSe.giro(ORA + 1000, { pronto: SI, pagina: SI })
  assert.ok(mie().length <= daSe.VIVE_MAX, `${mie().length}`)
  for (const p of tanti) progetti.chiudi(p.id)
  ripulisci()
})

// — il lavoro, con mani finte —

test('il lavoro delle idee: una chiamata al modello, un file nella cartella Myynd sotto X, nessuna pagina di Notion', async () => {
  ripulisci()
  quadri({ [myynd.id]: { sintesi: 'Myynd drafts replies overnight.', traguardo: 'First paying founder' } })
  const chiamate: string[] = []
  let salvato: { titolo: string; testo: string; luogo: string; sotto?: string | null } | null = null
  daSe.perProva({
    chiedi: (async (o: { lavoro: string }) => { chiamate.push(o.lavoro); return { idee: [{ testo: 'Two Macs, zero inbox. The twin drafts while I sleep.', perche: 'You shipped the receipt this week.', fonti: ['L1', 'P1'] }] } }) as never,
    salva: o => { salvato = o; return { percorso: join(CASA, 'idee.docx'), nome: 'idee.docx', luogo: o.luogo } },
    scriviNotion: async () => { throw new Error('mai') }
  })
  const nate = await daSe.giro(ORA + 6 * GIORNO, { pronto: SI, pagina: () => false })
  const id = nate.find(i => i.startsWith('idee-x-'))!
  const e = await daSe.lavora(store.compito(id)!, { adesso: ORA + 6 * GIORNO })
  assert.deepEqual(chiamate, ['bozza', 'bozza'], 'la stesura e la rilettura')
  assert.equal(salvato!.luogo, 'myynd')
  assert.equal(salvato!.sotto, 'X')
  assert.match(salvato!.testo, /Two Macs, zero inbox/)
  assert.equal(e.consegna?.app, 'File')
  assert.match(e.testo, /idee\.docx.*Myynd folder/)
  // il lotto si ricorda: le stesse idee non tornano
  assert.ok(daSe.leggiStato().x?.idee?.includes('Two Macs, zero inbox. The twin drafts while I sleep.'))
})

test('dentro la coda vera: la carta affidata passa da `lavora`, diventa pronta col file e annuncia «pronto»; la pagina tranquilla si chiude da sola', async () => {
  const sentiti: Evento[] = []
  const smetti = compiti.ascolta(e => { sentiti.push(e) }, null)
  const aspetta = async (id: string, fase: string) => {
    for (let i = 0; i < 100 && !sentiti.some(e => 'id' in e && e.id === id && e.fase === fase); i++) await new Promise(r => setTimeout(r, 20))
  }
  compiti.perProva({ daSe: async () => ({ testo: 'Done: «idee.docx» is on your Desktop, in the Myynd folder.', consegna: { app: 'File', titolo: 'idee.docx', percorso: join(CASA, 'idee.docx'), dove: 'myynd' }, fatti: [{ attrezzo: 'scrivi_file', esito: 'ok', dettaglio: join(CASA, 'idee.docx') }] }) })
  writeFileSync(join(CASA, 'idee.docx'), 'x')
  store.scriviCompito({ id: 'idee-x-prova', testo: 'Post ideas for X', origine: 'idee-x', ordine: 'zz1' })
  compiti.affida('idee-x-prova', 'tutto', false)
  await aspetta('idee-x-prova', 'pronto')
  const c = store.compito('idee-x-prova')!
  assert.equal(c.stato, 'pronto')
  assert.equal(c.consegna?.titolo, 'idee.docx')
  assert.equal(c.prova?.esito, 'pass')

  compiti.perProva({ daSe: async () => ({ testo: 'Done: the page is up to date.', fatti: [{ attrezzo: 'scrivi_notion', esito: 'ok', dettaglio: 'Myynd' }], chiudi: 'Notion page updated' }) })
  store.scriviCompito({ id: 'pagina-notion-prova', testo: 'Update the Notion page for Myynd', origine: 'pagina-notion', ordine: 'zz2' })
  compiti.affida('pagina-notion-prova', 'tutto', false)
  await aspetta('pagina-notion-prova', 'richiamato')
  assert.equal(store.compito('pagina-notion-prova')!.stato, 'fatto')
  assert.ok(!sentiti.some(e => 'id' in e && e.id === 'pagina-notion-prova' && e.fase === 'pronto'), 'nessun avviso per una pagina tranquilla')
  smetti()
  compiti.perProva(null)
})

test('la pausa: una carta di questo genere in coda aspetta, il resto del turno no', () => {
  store.scriviCompito({ id: 'idee-x-pausa', testo: 'Post ideas for X', origine: 'idee-x', ordine: 'zz3', quando: 'oggi' })
  store.mettiCompitoInCoda('idee-x-pausa', 'tutto', { da: 'myynd', quando: 'presto', dal: new Date().toISOString(), tentativi: 0 })
  const notte = new Date(2026, 9, 16, 2, 0)
  cfg.aggiorna({ autonomia: 'chiedere' as never })
  assert.ok(!turno.pronte(notte).some(c => c.id === 'idee-x-pausa'))
  cfg.aggiorna({ autonomia: 'preparare' as never })
  assert.ok(turno.pronte(notte).some(c => c.id === 'idee-x-pausa'))
  store.cambiaStatoCompito('idee-x-pausa', 'fatto')
})

test('niente pubblica: da-se.ts non tocca la posta, l\'invio o X in scrittura, e X non ha una mano che pubblica', () => {
  const sorgente = readFileSync(new URL('./da-se.ts', import.meta.url), 'utf8')
  for (const vietato of [/from '\.\/invio\.ts'/, /postaUscita/, /mailbox-drafts/, /bozza-mail-mac/, /\bsmtp\b/i, /\.send\(/, /pubblica\(/, /crea_nota/, /lavora_nel_codice/]) {
    assert.ok(!vietato.test(sorgente), `da-se.ts: ${vietato}`)
  }
  // le sole mani che scrive: il file nella cartella Myynd e la pagina sotto quella scelta
  assert.deepEqual([...sorgente.matchAll(/mani\.esegui\('(\w+)'/g)].map(m => m[1]), ['scrivi_notion'])
  const xs = readFileSync(new URL('./connettori/x.ts', import.meta.url), 'utf8')
  assert.ok(!/\b(?:fetch|request)\([^)]*(?:tweets|statuses\/update|CreateTweet)/i.test(xs), 'x.ts legge soltanto')
})

test('i numeri che non si sanno non sono zeri: un post senza gesti noti non è fra i migliori', () => {
  assert.equal(daSe.punti({ visualizzazioni: null, mipiace: null, repost: null, risposte: null, segnalibri: null }), null)
  assert.equal(daSe.punti({ visualizzazioni: null, mipiace: 10, repost: 2, risposte: null, segnalibri: null }), 14)
  const post = [
    { id: 'a', testo: 'archivio', quando: '2026-10-01', risposta: false, numeri: { visualizzazioni: null, mipiace: null, repost: null, risposte: null, segnalibri: null }, punti: null },
    { id: 'b', testo: 'pochi', quando: '2026-10-02', risposta: false, numeri: { visualizzazioni: 10, mipiace: 1, repost: 0, risposte: 0, segnalibri: 0 }, punti: 1.05 }
  ]
  assert.deepEqual(daSe.postModello(post).migliori.map(p => p.id), ['b'])
})

test('il campione della sua voce dall\'archivio entra nei prompt come voce, non come fatto da citare', async () => {
  const archivio = await import('./connettori/x-archivio.ts')
  store.salvaDocumenti(archivio.documentiVoce([
    { postId: '1', testo: 'Most founders don\'t need more tools. They need fewer tabs.', quando: '2024-03-01T10:00:00.000Z', risposta: false, mipiace: 900, repost: 120 },
    { postId: '2', testo: 'Ship on Friday. Fix on Saturday. Sleep on Sunday.', quando: '2025-05-01T10:00:00.000Z', risposta: false, mipiace: 600, repost: 80 }
  ], false, new Date(ORA).toISOString()))
  const m = daSe.materialeX(ORA)!
  assert.equal(m.voce[0], 'Most founders don\'t need more tools. They need fewer tabs.')
  const p = daSe.promptX(m)
  assert.match(p.utente, /His most engaged posts ever, from his archive \(his voice; not facts to cite\):\n- Most founders/)
  assert.ok(![...p.fonti.values()].some(f => f.testo.includes('fewer tabs')), 'il campione non si cita')
  const v = daSe.promptVideo({ progetto: myynd, foto: null, progresso: [], post: daSe.suoiPost(ORA), lingua: 'en' })
  assert.match(v.utente, /Ship on Friday\. Fix on Saturday/)
  // un'idea uguale a un post del campione non passa
  assert.equal(daSe.ideeValide({ idee: [{ testo: 'Ship on Friday. Fix on Saturday. Sleep on Sunday.', perche: 'x', fonti: ['P1'] }] }, p.fonti, m).length, 0)
})
