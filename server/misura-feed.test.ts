// La misura del feed: il conto su righe seminate, la regola del «visto», la
// riga di registro, e la riga di comando che si rifiuta di aprire la cartella vera.
//
//   node --test server/misura-feed.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-misura-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const store = await import('./store.ts')
const misuraFeed = await import('./misura-feed.ts')
await misuraFeed.caricaModuli()

before(() => store.azzeraTutto())
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

const GIORNO = 86_400_000
const ADESSO = Date.parse('2026-09-24T12:00:00.000Z')
const fa = (giorni: number) => new Date(ADESSO - giorni * GIORNO).toISOString()

type Riga = { id: string; stato: string; ragione?: string | null; motivo?: string | null; vista?: string | null; quando: string; risposto?: string | null; doc?: string | null; contesto?: Record<string, unknown> | null }
function semina(righe: Riga[]) {
  const ins = store.default.prepare('INSERT INTO feed (id, tipo, titolo, testo, fonte, doc, stato, quando, motivo, risposto, ragione, vista, contesto) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
  for (const r of righe) ins.run(r.id, 'Da decidere', `Carta ${r.id}`, 'Il testo.', 'posta', r.doc ?? null, r.stato, r.quando, r.motivo ?? null, r.risposto ?? null, r.ragione ?? null, r.vista ?? null, r.contesto ? JSON.stringify(r.contesto) : null)
}

test('il conto: ogni classe al suo posto, «già fatta» nel numeratore, le neutre fuori dal denominatore', () => {
  store.azzeraTutto()
  const nora = { autore: 'Nora <nora@harbor.example>' }
  semina([
    { id: 'a1', stato: 'fatto', ragione: 'lui', vista: fa(3), quando: fa(4), risposto: fa(3), contesto: nora },
    { id: 'a2', stato: 'fatto', ragione: 'lista', vista: fa(2), quando: fa(3), risposto: fa(2), contesto: nora },
    { id: 'a3', stato: 'fatto', ragione: 'fuori', motivo: 'Hai risposto dalla posta.', vista: fa(2), quando: fa(3), risposto: fa(2) },
    { id: 't1', stato: 'scartato', ragione: 'fatta', vista: fa(2), quando: fa(3), risposto: fa(2), contesto: nora },
    { id: 's1', stato: 'scartato', ragione: 'vecchia', vista: fa(2), quando: fa(3), risposto: fa(2) },
    { id: 's2', stato: 'scartato', ragione: 'non_mia', vista: fa(2), quando: fa(3), risposto: fa(2), contesto: nora },
    { id: 's3', stato: 'scartato', ragione: 'non_chiara', vista: fa(2), quando: fa(3), risposto: fa(2) },
    { id: 's4', stato: 'scartato', ragione: null, motivo: 'Non mi interessa.', vista: fa(2), quando: fa(3), risposto: fa(2) },
    { id: 'k1', stato: 'aperto', vista: fa(1), quando: fa(1) },
    { id: 'e1', stato: 'scaduto', ragione: 'tempo', vista: fa(6), quando: fa(8), risposto: fa(4) },
    { id: 'e2', stato: 'scaduto', ragione: 'data', vista: fa(6), quando: fa(8), risposto: fa(4) },
    { id: 'e3', stato: 'scaduto', ragione: 'tetto', vista: fa(6), quando: fa(8), risposto: fa(4) },
    { id: 'u1', stato: 'scaduto', ragione: 'superata', vista: fa(6), quando: fa(8), risposto: fa(4) },
    // non viste: una aperta senza vista, una scaduta nuova senza vista
    { id: 'n1', stato: 'aperto', quando: fa(1) },
    { id: 'n2', stato: 'scaduto', ragione: 'tempo', quando: fa(6), risposto: fa(2) },
    // fuori dalla finestra
    { id: 'f1', stato: 'fatto', ragione: 'lui', vista: fa(20), quando: fa(21), risposto: fa(20) }
  ])
  const m = misuraFeed.misura(14, ADESSO)
  assert.equal(m.carte.nate, 15)
  assert.equal(m.carte.viste, 13)
  assert.equal(m.carte.storiche, 0)
  assert.deepEqual([m.carte.agite, m.carte.fuori, m.carte.tardive, m.carte.tenute], [2, 1, 1, 1])
  assert.deepEqual(m.carte.scartate, { vecchia: 1, non_mia: 1, non_chiara: 1, senza: 1 })
  assert.deepEqual(m.carte.scadute, { tempo: 1, data: 1, tetto: 1 })
  assert.equal(m.carte.superate, 1)
  // (2 + 1 + 1 + 1) / (5 + 4 scartate + 1 scaduta per tempo) = 5/10
  assert.equal(m.precisione, 0.5)
  // la coorte chiusa: nate da almeno quattro giorni: a1 (agita) ed e1 (tempo) sono due: sotto le cinque, non si dice
  assert.equal(m.precisioneChiusa, null)
  // e con tre agite di cinque giorni fa in più la coorte chiusa parla: (1 + 3) / (4 + 1)
  semina([1, 2, 3].map(n => ({ id: `c${n}`, stato: 'fatto', ragione: 'lui', vista: fa(4), quando: fa(5), risposto: fa(4) })))
  assert.equal(misuraFeed.misura(14, ADESSO).precisioneChiusa, 0.8)
  assert.equal(m.mancate.totale, 0)
  assert.equal(m.mancanza, null, 'senza posta inviata la mancanza non si dice')
  assert.equal(m.copertura.postaInviata, false)
  // per mittente: Nora, vista quattro volte: giuste a1, a2, t1; sbagliata s2
  assert.deepEqual(m.perMittente, [{ mittente: 'nora@harbor.example', viste: 4, giuste: 3, sbagliate: 1 }])
  const g = m.perGiorno.find(x => x.giorno === fa(2).slice(0, 10))!
  assert.equal(g.viste, 7)
  assert.equal(g.nate, 0)
  assert.equal(m.perGiorno.length, 15)
})

test('sotto cinque carte la percentuale non si dice; la regola del visto: fatta senza vista sì, aperta senza vista no, scaduta di prima sì', () => {
  store.azzeraTutto()
  semina([
    { id: 'a1', stato: 'fatto', ragione: 'lui', quando: fa(3), risposto: fa(2) },
    { id: 'n1', stato: 'aperto', quando: fa(1) },
    // di prima della colonna vista: nessuna vista in tabella, scaduta nella finestra
    { id: 'v1', stato: 'scaduto', ragione: null, quando: fa(5), risposto: fa(1) }
  ])
  const m = misuraFeed.misura(14, ADESSO)
  assert.equal(m.carte.viste, 2)
  assert.equal(m.carte.storiche, 1)
  assert.equal(m.carte.agite, 1)
  assert.equal(m.carte.scadute.tempo, 1, 'una scaduta senza ragione è scaduta per tempo')
  assert.equal(m.precisione, null)
  // con una vista scritta in tabella, una carta nata dopo di lei e scaduta senza vista non è «di prima»
  semina([{ id: 'w1', stato: 'fatto', ragione: 'lui', vista: fa(2), quando: fa(3), risposto: fa(2) }, { id: 'v2', stato: 'scaduto', ragione: 'tempo', quando: fa(1), risposto: fa(0.5) }])
  const dopo = misuraFeed.misura(14, ADESSO)
  assert.equal(dopo.carte.storiche, 1, 'v1 è nata prima della prima vista: storica; v2 dopo: non vista')
  assert.equal(dopo.carte.viste, 3)
})

test('le mancate: dalla tabella e dalle extra, senza doppioni, per fase; la mancanza vuole la posta inviata, i compiti no', () => {
  store.azzeraTutto()
  semina([
    { id: 'a1', stato: 'fatto', ragione: 'lui', vista: fa(3), quando: fa(4), risposto: fa(3) },
    { id: 'a2', stato: 'fatto', ragione: 'lui', vista: fa(3), quando: fa(4), risposto: fa(3) },
    { id: 'a3', stato: 'fatto', ragione: 'lui', vista: fa(3), quando: fa(4), risposto: fa(3) }
  ])
  const ins = store.default.prepare('INSERT INTO mancate (id, genere, doc, prova, mittente, progetto, fase, motivo, certezza, arrivato, agito, contesto, quando) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
  ins.run('m1', 'risposta', 'd1', 'p', 'a@ex', null, 'regole', 'letta_senza_richiesta', 'id', fa(5), fa(2), '{}', fa(1))
  ins.run('m2', 'compito', 'd2', 'p', null, null, 'modello', null, 'parole', fa(5), fa(2), '{}', fa(1))
  ins.run('m3', 'risposta', 'd3', 'p', 'b@ex', null, 'verifica', 'perche:numero', 'filo', fa(5), fa(20), '{}', fa(19))
  const extra = { id: 'm2', genere: 'compito' as const, doc: 'd2', prova: 'p', mittente: null, progetto: null, fase: 'modello', motivo: null, certezza: 'parole' as const, arrivato: fa(5), agito: fa(2), contesto: '{}', quando: fa(0) }
  const extra2 = { ...extra, id: 'm4', genere: 'compito' as const, doc: 'd4' }
  const m = misuraFeed.misura(14, ADESSO, { mancate: [extra, extra2] })
  assert.deepEqual(m.mancate, { totale: 3, risposte: 1, compiti: 2, perFase: { 'regole:letta_senza_richiesta': 1, modello: 2 } })
  assert.equal(m.mancanza, null, 'senza posta inviata indicizzata la mancanza non vale')
  // compiti: 2 / (3 + 2) = 0.4
  assert.equal(m.mancanzaCompiti, 0.4)
  // con la posta inviata: 3 / (3 + 3)
  store.salvaDocumenti([{ id: 'posta:Sent:1', fonte: 'posta', tipo: 'email', titolo: 'Re', corpo: 'x', inviato: true, quando: fa(1), autore: 'io <io@ex>' }])
  const con = misuraFeed.misura(14, Date.now(), { mancate: [extra, extra2] })
  assert.equal(con.copertura.postaInviata, true)
  assert.equal(con.mancanza, 0.5)
})

test('la riga del registro, con «n.d.» dove il numero non si dice', () => {
  store.azzeraTutto()
  semina([{ id: 'a1', stato: 'fatto', ragione: 'lui', vista: fa(3), quando: fa(4), risposto: fa(3) }])
  const m = misuraFeed.misura(14, ADESSO)
  assert.equal(misuraFeed.rigaDelRegistro(m), 'myynd · misura · 14 giorni: 1 viste, 1 giuste o tenute (n.d.), 0 tardive, 0 mancate su 1 (n.d.)')
  assert.doesNotMatch(misuraFeed.rigaDelRegistro(m), /[—–]/)
  assert.doesNotMatch(misuraFeed.tabella(m, true), /[—–]/)
  assert.match(misuraFeed.tabella(m, false), /Precisione n\.d\./)
})

// — la riga di comando —

const CLI = fileURLToPath(new URL('./misura-feed.ts', import.meta.url))
const lancia = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH!, HOME: CASA, ...env } })

test('leggiArgomenti: pura, severa su quello che non conosce, e senza «--jev»', () => {
  assert.deepEqual(misuraFeed.leggiArgomenti(['--conto', 'a@b', '--dati', '/x', '--giorni', '30', '--json']), { conto: 'a@b', dati: '/x', giorni: 30, json: true, aiuto: false, sbagliato: null })
  assert.equal(misuraFeed.leggiArgomenti(['--conto', 'a@b', '--jev']).sbagliato, '--jev')
  assert.equal(misuraFeed.leggiArgomenti(['--conto']).sbagliato, '--conto')
  assert.equal(misuraFeed.leggiArgomenti(['--giorni', 'tanti']).sbagliato, '--giorni')
  assert.equal(misuraFeed.leggiArgomenti(['--giorni', '0']).sbagliato, '--giorni')
})

test('la cartella vera non si apre: uguale o dentro ~/.myynd', () => {
  const vera = join(userInfo().homedir, '.myynd')
  assert.equal(misuraFeed.eLaCartellaVera(vera), true)
  assert.equal(misuraFeed.eLaCartellaVera(join(vera, 'utenti', 'x')), true)
  assert.equal(misuraFeed.eLaCartellaVera(vera + '-copia'), false)
  assert.equal(misuraFeed.eLaCartellaVera(CASA), false)
})

test('la riga di comando si rifiuta senza --dati, con --jev, e con la cartella del conto fuori da --dati; senza rete', () => {
  const senza = lancia(['--conto', 'a@b'])
  assert.equal(senza.status, 2)
  assert.match(senza.stderr, /--dati/)
  const jev = lancia(['--conto', 'a@b', '--dati', CASA, '--jev'])
  assert.equal(jev.status, 2)
  assert.match(jev.stderr, /--jev/)
  // la cartella vera: rifiutata prima di ogni import, quindi senza aprire niente
  const vera = lancia(['--conto', 'a@b', '--dati', join(userInfo().homedir, '.myynd', 'non-esiste-copia-di-prova')])
  assert.equal(vera.status, 2)
  assert.match(vera.stderr, /cartella vera/)
  assert.equal(existsSync(join(userInfo().homedir, '.myynd', 'non-esiste-copia-di-prova')), false)
  // una copia vuota: il conto non c'è, e lo dice senza cadere
  const copia = mkdtempSync(join(tmpdir(), 'myynd-misura-copia-'))
  try {
    const nessuno = lancia(['--conto', 'nessuno@esempio.test', '--dati', copia])
    assert.equal(nessuno.status, 2)
    assert.match(nessuno.stderr, /Non c'è nessun conto/)
  } finally { rmSync(copia, { recursive: true, force: true }) }
})

test('la riga di comando su una copia: stampa la misura, e non chiama mai Jev', async () => {
  // una copia con un conto vero dentro
  const copia = mkdtempSync(join(tmpdir(), 'myynd-misura-copia-'))
  const semina = `
    process.env.MYYND_DATI = ${JSON.stringify(copia)}
    const conti = await import(${JSON.stringify(fileURLToPath(new URL('./conti.ts', import.meta.url)))})
    const chi = await import(${JSON.stringify(fileURLToPath(new URL('./chi.ts', import.meta.url)))})
    const store = await import(${JSON.stringify(fileURLToPath(new URL('./store.ts', import.meta.url)))})
    const cfg = await import(${JSON.stringify(fileURLToPath(new URL('./config.ts', import.meta.url)))})
    const a = await conti.registra('misura@esempio.test', 'parola-di-prova-lunga')
    chi.dentro(a.id, () => {
      cfg.scrivi({ lingua: 'en', jev: { apiKey: 'apikey_prova' } })
      store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Una carta fatta', testo: 'Il testo della carta.', fonte: 'posta' }])
      store.cambiaStatoFeed(store.elencoFeed('aperto')[0].id, 'fatto', 'x', 'lui')
    })
    store.chiudiIndici()
  `
  const s = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', semina], { encoding: 'utf8', env: { PATH: process.env.PATH!, HOME: CASA } })
  assert.equal(s.status, 0, s.stderr)
  try {
    // la rete è chiusa: se qualcuno chiamasse Jev, si vedrebbe
    const senzaRete = join(CASA, 'senza-rete.mjs')
    writeFileSync(senzaRete, 'globalThis.fetch = () => { throw new Error("rete chiusa") }\n')
    const r = lancia(['--conto', 'misura@esempio.test', '--dati', copia, '--json'], { NODE_OPTIONS: `--import=${senzaRete}` })
    assert.equal(r.status, 0, r.stderr)
    const m = JSON.parse(r.stdout)
    assert.equal(m.carte.viste, 1)
    assert.equal(m.carte.agite, 1)
    assert.equal(m.mancate.totale, 0)
    const t = lancia(['--conto', 'misura@esempio.test', '--dati', copia])
    assert.equal(t.status, 0, t.stderr)
    assert.match(t.stdout, /^Window: 14 days/)
    assert.match(t.stdout, /Precision n\.d\./)
  } finally { rmSync(copia, { recursive: true, force: true }) }
})
