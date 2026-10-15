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
  // lo stesso giorno, e anche con la carta chiusa: niente
  assert.equal((await daSe.giro(ORA + 60_000, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('idee-x-')).length, 0)
  chiudiLeMie()
  assert.equal((await daSe.giro(ORA + 60_000, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('idee-x-')).length, 0, 'lo stesso giorno')
  // il giorno dopo, senza niente di nuovo: niente
  assert.equal((await daSe.giro(ORA + GIORNO, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('idee-x-')).length, 0, 'niente di nuovo')
  // un post nuovo: il lotto nasce
  post('Shipped the morning receipt: what the twin did while I slept, in one card.', 0)
  assert.equal((await daSe.giro(ORA + GIORNO, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('idee-x-')).length, 1)
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
  assert.match(p.system, /Never invent numbers/)
  assert.match(p.system, /does not use hashtags/)
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

test('il copione: al progetto che si è mosso abbastanza, una volta alla settimana per progetto, uno al giorno in tutto', async () => {
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
  chiudiLeMie()
  // il giorno dopo, con altro progresso su Myynd: dentro la settimana, niente
  chiusa('Shipped v0.3 with the receipt', myynd.id)
  assert.equal((await daSe.giro(ORA + GIORNO, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('copione-video-')).length, 0)
  // otto giorni dopo, senza niente di nuovo: niente; con il traguardo raggiunto e uno nuovo: il copione
  assert.equal((await daSe.giro(ORA + 8 * GIORNO, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('copione-video-')).length, 0)
  quadri({
    [myynd.id]: { sintesi: 'Myynd drafts replies overnight.', traguardo: 'Ten paying founders by December' },
    [evermute.id]: { sintesi: 'Evermute is a sleep app.', traguardo: 'App Store review' }
  })
  const dopo = (await daSe.giro(ORA + 8 * GIORNO + 3_600_000, { pronto: SI, pagina: () => false })).filter(id => id.startsWith('copione-video-'))
  assert.equal(dopo.length, 1)
  assert.ok(dopo[0]!.includes(myynd.id))
  assert.equal(daSe.leggiStato().video?.[myynd.id]?.primaDelVideo, 'First paying founder')
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
  const p = daSe.promptVideo({ progetto: myynd, foto, progresso, post: daSe.suoiPost(ORA), lingua: 'en' })
  const tutto = `${p.system}\n${p.utente}`
  assert.match(p.utente, /\[E1\] .*Launched the notes sync|\[E\d\] .*Shipped v0\.3/)
  assert.match(p.utente, /\[P2\] Where it stands: Myynd drafts replies overnight/)
  assert.match(p.system, /exactly 3 beats/)
  assert.match(p.system, /150 to 230 words/)
  assert.match(p.utente, /How he writes on X/)
  for (const segreto of ['SEGRETO-DELLA-POSTA', 'ntn_SEGRETO', 'sk-SEGRETO']) assert.ok(!tutto.includes(segreto))
})

test('il copione che regge: tre battute con le loro fonti, fra 120 e 260 parole', () => {
  const fonti = new Map([['E1', { id: 'E1', testo: 'x', etichetta: 'Launched notes sync' }], ['P1', { id: 'P1', testo: 'x', etichetta: 'Myynd' }]])
  const frase = 'This week the twin started to sync my notes overnight and I stopped copying things by hand every single morning. '
  const buono = { titolo: 'Notes sync', gancio: 'I stopped copying notes by hand this week.', battute: [1, 2, 3].map(() => ({ testo: frase.repeat(2), fonti: ['E1'] })), chiusura: 'More next week — same time.', inquadrature: ['Me to camera', 'Screen recording of the sync'], perche: 'You launched notes sync.' }
  const c = daSe.copioneValido(buono, fonti)!
  assert.ok(c)
  assert.ok(!c.chiusura.includes('—'))
  assert.equal(daSe.copioneValido({ ...buono, battute: buono.battute.slice(0, 2) }, fonti), null, 'due battute')
  assert.equal(daSe.copioneValido({ ...buono, battute: buono.battute.map(b => ({ ...b, fonti: ['Q1'] })) }, fonti), null, 'fonti inventate')
  assert.equal(daSe.copioneValido({ ...buono, battute: buono.battute.map(b => ({ ...b, testo: 'Short.' })) }, fonti), null, 'troppo corto')
  const f = daSe.fileCopione(c, myynd, fonti, true)
  assert.match(f.testo, /## Hook[\s\S]*## Beat 1[\s\S]*## Beat 3[\s\S]*## Close[\s\S]*## Shots/)
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
  const nate = await daSe.giro(ORA + 3 * GIORNO, { pronto: SI, pagina: () => false })
  const id = nate.find(i => i.startsWith('idee-x-'))!
  const e = await daSe.lavora(store.compito(id)!, { adesso: ORA + 3 * GIORNO })
  assert.deepEqual(chiamate, ['bozza'])
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
  assert.match(p.utente, /His most engaged posts ever, from his archive \(for the voice only, not facts to cite\):\n- Most founders/)
  assert.ok(![...p.fonti.values()].some(f => f.testo.includes('fewer tabs')), 'il campione non si cita')
  const v = daSe.promptVideo({ progetto: myynd, foto: null, progresso: [], post: daSe.suoiPost(ORA), lingua: 'en' })
  assert.match(v.utente, /Ship on Friday\. Fix on Saturday/)
  // un'idea uguale a un post del campione non passa
  assert.equal(daSe.ideeValide({ idee: [{ testo: 'Ship on Friday. Fix on Saturday. Sleep on Sunday.', perche: 'x', fonti: ['P1'] }] }, p.fonti, m).length, 0)
})
