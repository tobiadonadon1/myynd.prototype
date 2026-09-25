// Il registro dei segnali: le coppie, la posta, l'agenda, i commit.
//
//   node --test server/segnali.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import type { SegnaleArrivata, SegnaleInviata, VistaAgenda } from './segnali.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-segnali-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const seg = await import('./segnali.ts')
const prev = await import('./previsioni.ts')

let anna = ''
before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  assert.ok(a.ok); anna = a.ok ? a.id : ''
  chi.dentro(anna, () => { cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', posta: { host: 'imap.esempio.it', porta: 993, utente: 'anna@esempio.it', password: 'x' } }); store.azzeraTutto() })
})
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const arr = (n: number, chi: string, quando: string, x: Partial<SegnaleArrivata['dati']> = {}): SegnaleArrivata =>
  ({ id: `posta.arrivata|posta:INBOX:${n}`, quando, chi, ref: `posta:INBOX:${n}`, progetto: null, dati: { messageId: `m${n}@x`, filo: `f${n}`, nome: chi, titolo: `Mail ${n}`, richiesta: false, ...x } })
const inv = (n: number, quando: string, x: Partial<SegnaleInviata['dati']> = {}, chi: string | null = null): SegnaleInviata =>
  ({ id: `posta.inviata|posta:Sent:${n}`, quando, chi, ref: `posta:Sent:${n}`, dati: { messageId: `s${n}@x`, risponde: null, filo: null, destinatari: [], ...x } })

test('coppieRisposta: il risponde esatto, il filo con il mittente fra i destinatari, il terzo messaggio di un filo', () => {
  const a1 = arr(1, 'nora@h.example', '2026-09-01T08:00:00.000Z', { filo: 'root@x' })
  const a2 = arr(2, 'nora@h.example', '2026-09-02T08:00:00.000Z', { filo: 'root@x' })
  const s1 = inv(1, '2026-09-01T09:00:00.000Z', { risponde: 'm1@x', filo: 'root@x', destinatari: ['nora@h.example'] })
  const s2 = inv(2, '2026-09-02T10:00:00.000Z', { filo: 'root@x', destinatari: ['nora@h.example'] })
  const c = seg.coppieRisposta([a1, a2], [s1, s2])
  assert.deepEqual(c, [
    { arrivata: a1.id, inviata: s1.id, latenza: 3600 },
    { arrivata: a2.id, inviata: s2.id, latenza: 7200 }
  ])
})

test('coppieRisposta, i casi che non si appaiano: filo «s:», altro destinatario, risposta prima della mail, mail a se stesso, due volte la stessa', () => {
  const miei = new Set(['anna@esempio.it'])
  const soggetto = arr(1, 'x@y.example', '2026-09-01T08:00:00.000Z', { filo: 's:ciao' })
  assert.deepEqual(seg.coppieRisposta([soggetto], [inv(1, '2026-09-01T09:00:00.000Z', { filo: 's:ciao', destinatari: ['x@y.example'] })]), [])
  const a = arr(2, 'x@y.example', '2026-09-01T08:00:00.000Z', { filo: 'r@x' })
  assert.deepEqual(seg.coppieRisposta([a], [inv(2, '2026-09-01T09:00:00.000Z', { filo: 'r@x', destinatari: ['altro@z.example'] })]), [], 'stesso filo, altro destinatario')
  assert.deepEqual(seg.coppieRisposta([a], [inv(3, '2026-09-01T07:00:00.000Z', { filo: 'r@x', destinatari: ['x@y.example'] })]), [], 'mandata prima che arrivasse')
  const me = arr(3, 'anna@esempio.it', '2026-09-01T08:00:00.000Z', { filo: 'me@x' })
  assert.deepEqual(seg.coppieRisposta([me], [inv(4, '2026-09-01T09:00:00.000Z', { risponde: 'm3@x', filo: 'me@x', destinatari: ['anna@esempio.it'] })], miei), [], 'a se stesso')
  const due = seg.coppieRisposta([a], [
    inv(5, '2026-09-01T09:00:00.000Z', { risponde: 'm2@x', filo: 'r@x', destinatari: ['x@y.example'] }),
    inv(6, '2026-09-01T10:00:00.000Z', { risponde: 'm2@x', filo: 'r@x', destinatari: ['x@y.example'] })
  ])
  assert.equal(due.length, 1); assert.equal(due[0]!.inviata, 'posta.inviata|posta:Sent:5', 'la risposta più vecchia')
  // senza destinatari il filo basta
  assert.equal(seg.coppieRisposta([a], [inv(7, '2026-09-01T09:00:00.000Z', { filo: 'r@x' })]).length, 1)
})

test('i nomi si ripuliscono: «Nora <script>» diventa «Nora script»; senza un nome vale la parte prima della chiocciola, mai l’indirizzo', () => {
  assert.equal(seg.nomePulito('Nora <script>alert(1)</script>', 'nora@h.example'), 'Nora alert 1')
  assert.equal(seg.nomePulito('Nora <script>', 'nora@h.example'), 'Nora')
  assert.equal(seg.nomeDaAutore('"Nora Vance" <nora@h.example>', 'nora@h.example'), 'Nora Vance')
  assert.equal(seg.nomeDaAutore('nora@h.example', 'nora@h.example'), 'Nora')
  assert.equal(seg.nomeDaAutore('tom.brill@corp.example', 'tom.brill@corp.example'), 'Tom Brill')
  assert.equal(seg.nomePulito('x'.repeat(80), 'a@b.c').length, 40)
  assert.equal(seg.nomePulito('  ', 'bob@corp.example'), 'Bob')
  assert.equal(seg.nomeDallIndirizzo('sam_ortiz+news@lumen.example'), 'Sam Ortiz News')
  // una riga scritta prima della regola, col l'indirizzo come nome, si mostra col nome dell'indirizzo
  assert.equal(seg.nomeMostrabile('bob@corp.example', 'bob@corp.example'), 'Bob')
  assert.equal(seg.nomeMostrabile('Bob Ross', 'bob@corp.example'), 'Bob Ross')
  for (const n of [seg.nomePulito('', 'a.b@c.d'), seg.nomeDaAutore(null, 'x@y.z'), seg.nomeMostrabile(null, 'q@w.e')]) assert.ok(!n.includes('@'), n)
  // l'organizzatore: nella colonna col nome, e di ritorno mai l'indirizzo
  assert.equal(seg.colonnaOrganizzatore({ organizzatore: 'Tom@Brill.example', organizzatoreNome: 'Tom Brill' }), 'Tom Brill <tom@brill.example>')
  assert.equal(seg.colonnaOrganizzatore({ organizzatore: 'tom@brill.example' }), 'tom@brill.example')
  assert.deepEqual(seg.organizzatoreDi('Tom Brill <tom@brill.example>'), { indirizzo: 'tom@brill.example', nome: 'Tom Brill' })
  assert.deepEqual(seg.organizzatoreDi('tom@brill.example'), { indirizzo: 'tom@brill.example', nome: 'Tom' })
  assert.equal(seg.organizzatoreDi(null), null)
})

test('raccogliPosta: una mail in una cartella scelta a mano ma scritta da lui è inviata; la massa e gli automatici non entrano; una seconda passata non scrive niente', () => {
  chi.dentro(anna, () => {
    store.salvaDocumenti([
      { id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'Pilot scope', corpo: 'Can you confirm the scope by Thursday?', autore: 'Nora Vance <nora@h.example>', quando: '2026-09-20T08:00:00.000Z', filo: 'r1@x', messageId: 'm1@x' },
      { id: 'posta:INBOX:2', fonte: 'posta', tipo: 'email', titolo: 'Re: Pilot scope', corpo: 'Yes', autore: 'Anna <anna@esempio.it>', quando: '2026-09-20T09:00:00.000Z', filo: 'r1@x', messageId: 's1@x', risponde: 'm1@x', destinatari: 'nora@h.example' },
      { id: 'posta:INBOX:3', fonte: 'posta', tipo: 'email', titolo: 'Deals', corpo: 'Buy now', autore: 'Deals <news@deals.example>', quando: '2026-09-20T10:00:00.000Z', massa: true },
      { id: 'posta:INBOX:4', fonte: 'posta', tipo: 'email', titolo: 'Ping', corpo: 'x', autore: 'no-reply@svc.example', quando: '2026-09-20T11:00:00.000Z' }
    ])
    const r = seg.raccogliPosta(new Date('2026-09-21T00:00:00.000Z'))
    assert.deepEqual(r, { arrivate: 1, inviate: 1 })
    const a = seg.arrivate('2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
    assert.equal(a.length, 1); assert.equal(a[0]!.chi, 'nora@h.example'); assert.equal(a[0]!.dati.nome, 'Nora Vance'); assert.equal(a[0]!.dati.richiesta, true); assert.equal(a[0]!.dati.ricostruito, true)
    const s = seg.inviate('2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
    assert.equal(s.length, 1); assert.deepEqual(s[0]!.dati.destinatari, ['nora@h.example']); assert.equal(s[0]!.dati.risponde, 'm1@x')
    assert.deepEqual(seg.raccogliPosta(new Date('2026-09-21T00:00:00.000Z')), { arrivate: 0, inviate: 0 })
    assert.equal(seg.coperturaInviata(new Date('2026-09-21T00:00:00.000Z')), true)
    assert.equal(seg.coperturaInviata(new Date('2026-11-21T00:00:00.000Z')), false)
    // la mail archiviata: sparisce dall'indice, resta nel registro, e la coppia si trova ancora
    store.default.prepare("DELETE FROM documenti WHERE id = 'posta:INBOX:1'").run()
    assert.equal(store.documento('posta:INBOX:1'), null)
    const coppie = seg.coppieRisposta(seg.arrivate('2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'), seg.inviate('2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'))
    assert.equal(coppie.length, 1)
    const esito = prev.esitoPosta({ genere: 'posta.risponde', ref: 'posta.arrivata|posta:INBOX:1' }, coppie, new Date('2026-09-20T08:30:00.000Z'), new Date('2026-09-21T00:00:00.000Z'), () => '2026-09-20T09:00:00.000Z')
    assert.equal(esito, 'giusta')
  })
})

test('il ripasso dell’indice cammina a pezzi e a più chiamate: dodicimila documenti, mai più di quattromila per volta, tutti ricostruiti; dopo, una mail nuova non lo è', () => {
  chi.dentro(anna, () => {
    store.azzeraTutto()
    const docs = [...Array(12_000)].map((_, i) => ({
      id: `posta:INBOX:${1000 + i}`, fonte: 'posta', tipo: 'email', titolo: `Mail ${i}`, corpo: 'x', autore: `p${i % 50}@h.example`,
      quando: new Date(Date.parse('2026-06-01T00:00:00.000Z') + i * 60_000).toISOString()
    }))
    for (let i = 0; i < docs.length; i += 2000) store.salvaDocumenti(docs.slice(i, i + 2000))
    let totale = 0, chiamate = 0
    do {
      const r = seg.raccogliPosta(new Date('2026-09-21T00:00:00.000Z'))
      assert.ok(r.arrivate <= 4000, `una chiamata non ferma il server: ${r.arrivate}`)
      totale += r.arrivate; chiamate++
      assert.ok(chiamate < 40)
    } while (seg.ripassoInCorso())
    assert.equal(totale, 12_000)
    assert.ok(chiamate >= 3, `il ripasso è a più chiamate: ${chiamate}`)
    assert.equal((store.default.prepare("SELECT COUNT(*) AS n FROM segnali WHERE genere = 'posta.arrivata' AND dati LIKE '%\"ricostruito\":true%'").get() as { n: number }).n, 12_000)
    // finito il ripasso, la chiamata dopo non ripassa l'ultimo pezzo, e una mail nuova nasce senza «ricostruito»
    assert.deepEqual(seg.raccogliPosta(new Date('2026-09-21T00:00:00.000Z')), { arrivate: 0, inviate: 0 })
    store.salvaDocumenti([{ id: 'posta:INBOX:99999', fonte: 'posta', tipo: 'email', titolo: 'Nuova', corpo: 'x', autore: 'Nora <nora@h.example>', quando: '2026-09-20T08:00:00.000Z' }])
    assert.deepEqual(seg.raccogliPosta(new Date('2026-09-21T00:00:00.000Z')), { arrivate: 1, inviate: 0 })
    const nuova = seg.arrivate('2026-09-20T00:00:00.000Z', '2026-09-21T00:00:00.000Z').find(a => a.ref === 'posta:INBOX:99999')!
    assert.equal(nuova.dati.ricostruito, undefined)
    store.azzeraTutto(); store.default.exec('DELETE FROM cursori')
  })
})

const vista = (chiave: string, inizio: string, x: Partial<VistaAgenda> = {}): VistaAgenda =>
  ({ chiave, titolo: 'Weekly', inizio, fine: null, originale: chiave.split('|')[1]!, stato: 'CONFIRMED', organizzatore: 'tom@b.example', partecipanti: [], ...x })
const FIN = { da: '2026-09-01T00:00:00.000Z', a: '2026-09-30T00:00:00.000Z' }

test('raccogliAgenda: occorrenze separate, una spostata, una sparita in futuro; una passata che esce dalla finestra e una lettura tronca non danno niente', () => {
  chi.dentro(anna, () => {
    const adesso = new Date('2026-09-10T12:00:00.000Z')
    const settimane = ['2026-09-07T09:00:00.000Z', '2026-09-14T09:00:00.000Z', '2026-09-21T09:00:00.000Z'].map(t => vista(`w|${t}`, t))
    assert.equal(seg.raccogliAgenda(settimane, FIN, adesso), 0)
    assert.equal((store.default.prepare('SELECT COUNT(*) AS n FROM agenda_viste').get() as { n: number }).n, 3, 'una riga per occorrenza')
    // la seconda si sposta di un'ora; la terza sparisce (è nel futuro): annullata
    const dopo = [settimane[0]!, { ...settimane[1]!, inizio: '2026-09-14T10:00:00.000Z' }]
    assert.equal(seg.raccogliAgenda(dopo, FIN, adesso), 2)
    const sp = seg.leggi('agenda.spostato', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
    assert.equal(sp.length, 1); assert.equal(sp[0]!.valore, 60); assert.equal(sp[0]!.chi, 'tom@b.example')
    assert.equal(seg.leggi('agenda.annullato', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z').length, 1)
    // una passata che scivola fuori dalla finestra: niente
    const passata = vista('p|2026-09-02T09:00:00.000Z', '2026-09-02T09:00:00.000Z')
    seg.raccogliAgenda([...dopo, passata], FIN, adesso)
    const strettaFin = { da: '2026-09-05T00:00:00.000Z', a: '2026-09-30T00:00:00.000Z' }
    assert.equal(seg.raccogliAgenda(dopo, strettaFin, adesso), 0)
    // un rifiuto suo
    const rifiutata = { ...settimane[0]!, partecipanti: [{ indirizzo: 'anna@esempio.it', stato: 'DECLINED' }] }
    assert.equal(seg.raccogliAgenda([rifiutata, dopo[1]!], FIN, adesso), 1)
    assert.equal(seg.leggi('agenda.rifiutato', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z').length, 1)
    assert.equal(seg.raccogliAgenda([rifiutata, dopo[1]!], FIN, adesso), 0, 'la seconda volta non è un nuovo rifiuto')
  })
})

test('un impegno singolo spostato è uno spostato, non uno sparito e uno nuovo; e la colonna tiene il nome di chi organizza', () => {
  chi.dentro(anna, () => {
    store.default.exec('DELETE FROM segnali; DELETE FROM agenda_viste')
    const adesso = new Date('2026-09-10T12:00:00.000Z')
    // la chiave di un impegno singolo è il solo UID: l'inizio originale cambia con lui
    const solo = (inizio: string) => vista('solo-1', inizio, { originale: inizio, organizzatoreNome: 'Tom Brill' })
    assert.equal(seg.raccogliAgenda([solo('2026-10-01T09:00:00.000Z')], FIN2, adesso), 0)
    assert.equal(seg.raccogliAgenda([solo('2026-10-01T10:00:00.000Z')], FIN2, adesso), 1)
    const sp = seg.leggi('agenda.spostato', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
    assert.deepEqual(sp.map(x => [x.ref, x.valore]), [['solo-1', 60]])
    assert.equal(seg.leggi('agenda.annullato', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z').length, 0, 'nessuna falsa cancellazione')
    const r = store.default.prepare("SELECT organizzatore FROM agenda_viste WHERE uid = 'solo-1'").get() as { organizzatore: string }
    assert.equal(r.organizzatore, 'Tom Brill <tom@b.example>')
    assert.equal(seg.organizzatoreDi(r.organizzatore)?.nome, 'Tom Brill')
  })
})
const FIN2 = { da: '2026-09-01T00:00:00.000Z', a: '2026-10-31T00:00:00.000Z' }

test('i commit: solo i suoi, il trailer segna l’agente, e una cartella ferma non chiama git', async () => {
  const repo = join(CASA, 'repo-prova')
  mkdirSync(repo, { recursive: true })
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-20T10:00:00Z', GIT_COMMITTER_DATE: '2026-09-20T10:00:00Z' } })
  git('init', '-q')
  git('config', 'user.email', 'anna@esempio.it'); git('config', 'user.name', 'Anna')
  writeFileSync(join(repo, 'a.txt'), '1'); git('add', 'a.txt'); git('commit', '-q', '-m', 'primo')
  writeFileSync(join(repo, 'a.txt'), '2'); git('add', 'a.txt'); git('commit', '-q', '-m', 'con agente\n\nCo-Authored-By: Claude <noreply@anthropic.com>')
  writeFileSync(join(repo, 'a.txt'), '3'); git('add', 'a.txt'); git('commit', '-q', '--author=Altro <altro@z.example>', '-m', 'di un altro')
  await chi.dentro(anna, async () => {
    cfg.aggiorna({ desktop: { cartelle: [CASA], scelte: true } })
    seg.impostaCartelleDiLavoro([repo])
    const r = await seg.raccogliCodice(new Date('2026-09-21T00:00:00.000Z'))
    assert.equal(r.commit, 2)
    const c = seg.leggi('codice.commit', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
    assert.deepEqual(c.map(x => [x.dati.messaggio, x.dati.agente]).sort(), [['con agente', true], ['primo', false]])
    // la cartella non è cambiata: niente git (l'occhiata resta uguale e non c'è nessun commit nuovo)
    const prima = seg.perProva.ultimeOcchiate.get(anna)!.get(repo)
    const r2 = await seg.raccogliCodice(new Date('2026-09-21T00:00:00.000Z'))
    assert.equal(r2.commit, 0)
    assert.equal(seg.perProva.ultimeOcchiate.get(anna)!.get(repo), prima)
    assert.equal(store.cursore('segnali:commit'), '2026-09-21T00:00:00.000Z')
    // una cartella su cui git non risponde (c'è il registro, non c'è un deposito) tiene fermo il cursore
    const rotta = join(CASA, 'repo-rotto')
    mkdirSync(join(rotta, '.git', 'logs'), { recursive: true }); writeFileSync(join(rotta, '.git', 'logs', 'HEAD'), 'x')
    seg.impostaCartelleDiLavoro([repo, rotta])
    await seg.raccogliCodice(new Date('2026-09-22T00:00:00.000Z'))
    assert.equal(store.cursore('segnali:commit'), '2026-09-21T00:00:00.000Z', 'il cursore non avanza: i commit di quella cartella non si perdono')
    seg.impostaCartelleDiLavoro([repo])
    await seg.raccogliCodice(new Date('2026-09-22T00:00:00.000Z'))
    assert.equal(store.cursore('segnali:commit'), '2026-09-22T00:00:00.000Z')
  })
})

test('leggiCommit legge il formato con i separatori', () => {
  const r = seg.leggiCommit('abc1234\x1f2026-09-20T10:00:00+02:00\x1fA@B.it\x1fprimo\x1f\x1e\nabc1235\x1f2026-09-20T11:00:00+02:00\x1fa@b.it\x1fsecondo\x1fClaude <x@y>\x1e\n')
  assert.deepEqual(r.map(c => [c.hash, c.autore, c.messaggio, c.agente]), [['abc1234', 'a@b.it', 'primo', false], ['abc1235', 'a@b.it', 'secondo', true]])
})
