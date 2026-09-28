// «Come lavori»: le soglie, gli stati, e le frasi per il modello.
//
//   node --test server/abitudini.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-abitudini-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const seg = await import('./segnali.ts')
const ab = await import('./abitudini.ts')
const memoria = await import('./memoria.ts')
const fuso = await import('./fuso.ts')
const progetti = await import('./progetti.ts')

let anna = ''
const ADESSO = new Date('2026-09-24T12:00:00.000Z')
const GIORNO = 86_400_000
const ORA = 3_600_000

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  assert.ok(a.ok); anna = a.ok ? a.id : ''
  chi.dentro(anna, () => { cfg.scrivi({ lingua: 'en', fuso: 'Europe/Rome', posta: { host: 'h', porta: 993, utente: 'anna@esempio.it', password: 'x' } }); store.azzeraTutto() })
})
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

let n = 0
/** Una mail da `chi` `giorniFa` giorni fa alle 9 di Roma, risposta dopo `dopoMin` minuti (o mai). */
function mail(chi: string, nome: string, giorniFa: number, dopoMin: number | null, x: { titolo?: string } = {}) {
  n++
  const quando = new Date(ADESSO.getTime() - giorniFa * GIORNO - 3 * ORA)
  seg.scrivi({ id: `posta.arrivata|posta:INBOX:${n}`, genere: 'posta.arrivata', quando: quando.toISOString(), chi, ref: `posta:INBOX:${n}`, dati: { messageId: `m${n}@x`, filo: `f${n}`, nome, titolo: x.titolo ?? `Mail ${n}`, richiesta: false } })
  if (dopoMin !== null) {
    seg.scrivi({ id: `posta.inviata|posta:Sent:${n}`, genere: 'posta.inviata', quando: new Date(quando.getTime() + dopoMin * 60_000).toISOString(), chi, ref: `posta:Sent:${n}`, dati: { messageId: `s${n}@x`, risponde: `m${n}@x`, filo: `f${n}`, destinatari: [chi] } })
  }
}
const riga = (chiave: string) => ab.tutte().find(a => a.chiave === chiave)
const pulisci = () => { store.default.exec('DELETE FROM segnali; DELETE FROM abitudini; DELETE FROM sessioni_app; DELETE FROM agenda_viste'); n = 0 }

test('posta.risponde_sempre nasce a cinque mail con l’85%; a 0,84 no; posta.lascia a sei con il 10%, a quattro no', () => {
  chi.dentro(anna, () => {
    pulisci()
    // Nora: 15 mail, 14 risposte in due ore circa
    for (let i = 0; i < 15; i++) mail('nora@h.example', 'Nora Vance', 30 - i, i === 3 ? null : 120 + i)
    // Sam: 19 mail, 16 risposte = 0,842: niente riga
    for (let i = 0; i < 19; i++) mail('sam@l.example', 'Sam Ortiz', 30 - i, i < 3 ? null : 240)
    // Priya: 12 mail, 1 risposta: lascia; Dan: 4 mail, 0 risposte: troppo poche
    for (let i = 0; i < 12; i++) mail('priya@a.example', 'Priya Shah', 30 - i, i === 0 ? 60 : null)
    for (let i = 0; i < 4; i++) mail('dan@d.example', 'Dan', 20 - i, null)
    ab.ricalcola(ADESSO)
    const nora = riga('posta.risponde_sempre:nora@h.example')!
    assert.ok(nora); assert.equal(nora.casi, 14); assert.equal(nora.su, 15); assert.equal(nora.dati.nome, 'Nora Vance')
    assert.ok(Number(nora.dati.latenzaMin) >= 120 && Number(nora.dati.latenzaMin) <= 135)
    assert.equal(nora.inVigore, false, 'quindici casi non bastano da soli')
    assert.equal(nora.esempi.length, 5)
    assert.equal(riga('posta.risponde_sempre:sam@l.example'), undefined, '0,84 non è sempre')
    const priya = riga('posta.lascia:priya@a.example')!
    assert.ok(priya); assert.equal(priya.casi, 11); assert.equal(priya.su, 12)
    assert.equal(riga('posta.lascia:dan@d.example'), undefined, 'quattro mail non fanno una regola')
    // il tempo e le ore: 34 risposte negli ultimi trenta giorni, tutte alle 9 di Roma più la latenza
    const tempo = riga('posta.tempo')!
    assert.ok(tempo); assert.ok(tempo.casi >= 10); assert.equal(tempo.inVigore, true, 'oltre venti risposte valgono da sole')
    const ore = riga('posta.ore')!
    assert.ok(ore, 'le risposte stanno in una finestra di tre ore'); assert.ok(typeof ore.dati.da === 'number')
    // il perché: fino a cinque risposte scritte dentro quelle tre ore
    assert.ok(ore.esempi.length >= 1 && ore.esempi.length <= 5, String(ore.esempi.length))
    for (const e of ore.esempi) assert.ok((fuso.parti(new Date(e.quando)).ora - Number(ore.dati.da) + 24) % 24 < 3, e.quando)
    // «Portami lì» solo dove il documento c'è ancora: qui l'indice è vuoto, quindi nessun esempio lo porta
    assert.ok(ab.tutte().every(a => a.esempi.every(e => e.doc === null)))
    const grezza = JSON.parse((store.default.prepare("SELECT prova FROM abitudini WHERE chiave = 'posta.tempo'").get() as { prova: string }).prova) as { esempi: { doc: string }[] }
    store.salvaDocumenti([{ id: grezza.esempi[0]!.doc, fonte: 'posta', tipo: 'email', titolo: 'Re', corpo: 'x', quando: '2026-09-20T08:00:00.000Z' }])
    const conDoc = riga('posta.tempo')!
    assert.equal(conDoc.esempi.filter(e => e.doc !== null).length, 1, 'solo l’esempio il cui documento è nell’indice')
    store.default.exec('DELETE FROM documenti')
  })
})

test('in vigore a venti casi, non a diciannove; mai per le app senza un tocco', () => {
  chi.dentro(anna, () => {
    pulisci()
    for (let i = 0; i < 19; i++) mail('nora@h.example', 'Nora', 40 - i, 60)
    ab.ricalcola(ADESSO)
    assert.equal(riga('posta.risponde_sempre:nora@h.example')!.inVigore, false)
    mail('nora@h.example', 'Nora', 21, 60)
    ab.ricalcola(ADESSO)
    assert.equal(riga('posta.risponde_sempre:nora@h.example')!.inVigore, true)
    // le app: venti giorni attivi, e non valgono
    const ins = store.default.prepare('INSERT INTO sessioni_app (bundle, app, titolo, inizio, fine, secondi, giorno, progetto, cartella) VALUES (?,?,?,?,?,?,?,?,?)')
    for (let i = 1; i <= 13; i++) {
      const g = new Date(ADESSO.getTime() - i * GIORNO)
      const giorno = g.toISOString().slice(0, 10)
      ins.run('com.apple.Safari', 'Safari', null, `${giorno}T07:00:00.000Z`, `${giorno}T10:30:00.000Z`, 12600, giorno, null, null)
      ins.run('com.microsoft.VSCode', 'Code', null, `${giorno}T11:00:00.000Z`, `${giorno}T13:00:00.000Z`, 7200, giorno, null, null)
    }
    ab.ricalcola(ADESSO)
    const app = riga('app.principale')!
    assert.ok(app); assert.equal(app.dati.app, 'Safari'); assert.equal(app.dati.oreGiorno, 3.5); assert.equal(app.casi, 13); assert.equal(app.inVigore, false)
    const giornata = riga('app.giornata')!
    assert.ok(giornata); assert.equal(giornata.dati.da, 9 * 60); assert.equal(giornata.dati.a, 15 * 60)
    assert.equal(giornata.inVigore, false)
  })
})

test('tolta non torna; corretta tiene le sue parole mentre i numeri cambiano; ripristina scade dopo dieci minuti', () => {
  chi.dentro(anna, () => {
    pulisci()
    for (let i = 0; i < 10; i++) mail('nora@h.example', 'Nora', 30 - i, 60)
    for (let i = 0; i < 10; i++) mail('sam@l.example', 'Sam', 30 - i, 60)
    ab.ricalcola(ADESSO)
    ab.cambia('posta.risponde_sempre:nora@h.example', 'togli', undefined, undefined, ADESSO)
    assert.equal(riga('posta.risponde_sempre:nora@h.example'), undefined)
    ab.ricalcola(new Date(ADESSO.getTime() + ORA))
    assert.equal(riga('posta.risponde_sempre:nora@h.example'), undefined, 'una tolta non rinasce')
    assert.throws(() => ab.cambia('posta.risponde_sempre:nora@h.example', 'ripristina', undefined, 'osservata', new Date(ADESSO.getTime() + 11 * 60_000)), /troppo tempo/)
    ab.cambia('posta.risponde_sempre:nora@h.example', 'ripristina', undefined, 'osservata', new Date(ADESSO.getTime() + 9 * 60_000))
    assert.equal(riga('posta.risponde_sempre:nora@h.example')?.stato, 'osservata')
    assert.throws(() => ab.cambia('posta.risponde_sempre:nora@h.example', 'ripristina', undefined, 'osservata', ADESSO), /troppo tempo/, 'non era tolta')
    // corretta
    ab.cambia('posta.risponde_sempre:sam@l.example', 'correggi', 'A Sam rispondo — sempre, ma con calma', undefined, ADESSO)
    const sam = riga('posta.risponde_sempre:sam@l.example')!
    assert.equal(sam.stato, 'corretta'); assert.equal(sam.testoSuo, 'A Sam rispondo. Sempre, ma con calma'); assert.equal(sam.inVigore, true)
    mail('sam@l.example', 'Sam', 5, 60); mail('sam@l.example', 'Sam', 4, 60)
    ab.ricalcola(new Date(ADESSO.getTime() + ORA))
    const sam2 = riga('posta.risponde_sempre:sam@l.example')!
    assert.equal(sam2.su, 12); assert.equal(sam2.testoSuo, 'A Sam rispondo. Sempre, ma con calma'); assert.equal(sam2.stato, 'corretta')
    assert.throws(() => ab.cambia('posta.risponde_sempre:sam@l.example', 'correggi', 'ab', undefined, ADESSO), /poche parole/)
    assert.throws(() => ab.cambia('boh', 'tieni'), /Non la trovo/)
    assert.throws(() => ab.cambia('posta.risponde_sempre:sam@l.example', 'boh' as never), /sconosciuta/)
  })
})

test('una riga che non regge più diventa superata, poi torna osservata; una corretta non diventa mai superata da sola', () => {
  chi.dentro(anna, () => {
    pulisci()
    for (let i = 0; i < 6; i++) mail('nora@h.example', 'Nora', 30 - i, 60)
    for (let i = 0; i < 6; i++) mail('sam@l.example', 'Sam', 30 - i, 60)
    ab.ricalcola(ADESSO)
    ab.cambia('posta.risponde_sempre:sam@l.example', 'correggi', 'Sam lo sento sempre', undefined, ADESSO)
    // tre mail a Nora e a Sam senza risposta: 6 su 9 = 0,67
    for (let i = 0; i < 3; i++) { mail('nora@h.example', 'Nora', 3 - i, null); mail('sam@l.example', 'Sam', 3 - i, null) }
    ab.ricalcola(new Date(ADESSO.getTime() + ORA))
    assert.equal(riga('posta.risponde_sempre:nora@h.example')?.stato, 'superata')
    assert.ok(riga('posta.risponde_sempre:nora@h.example')?.fino)
    assert.equal(riga('posta.risponde_sempre:sam@l.example')?.stato, 'corretta', 'le sue parole restano')
    // Nora torna a rispondere sempre: 20 risposte su 23
    for (let i = 0; i < 14; i++) mail('nora@h.example', 'Nora', 60 - i, 60)
    ab.ricalcola(new Date(ADESSO.getTime() + 2 * ORA))
    assert.equal(riga('posta.risponde_sempre:nora@h.example')?.stato, 'osservata')
  })
})

test('perIlRitratto: le due intestazioni solo quando servono, otto righe, cinquecento caratteri, niente indirizzi o titoli, e stabile dentro il secchio', () => {
  chi.dentro(anna, () => {
    pulisci()
    assert.equal(ab.perIlRitratto(), '')
    for (let i = 0; i < 22; i++) mail('nora@h.example', 'Nora Vance', 40 - i, 130, { titolo: 'SEGRETO pricing' })
    ab.ricalcola(ADESSO)
    const uno = ab.perIlRitratto()
    assert.ok(uno.startsWith('Come lavora, misurato su almeno 20 casi:'))
    assert.ok(!uno.includes('confermato da lei'))
    assert.ok(uno.includes('A Nora Vance risponde sempre, di solito entro 3 ore.'), uno)
    assert.ok(!uno.includes('nora@h.example')); assert.ok(!uno.includes('SEGRETO')); assert.doesNotMatch(uno, /[—–]/)
    // la latenza si muove dentro il secchio (61..180): il testo non cambia
    store.default.prepare("UPDATE abitudini SET dati = ? WHERE chiave = 'posta.risponde_sempre:nora@h.example'").run(JSON.stringify({ nome: 'Nora Vance', latenzaMin: 170 }))
    assert.equal(ab.perIlRitratto(), uno)
    // una tenuta con pochi casi va sotto «confermato da lei»
    for (let i = 0; i < 6; i++) mail('priya@a.example', 'Priya Shah', 30 - i, null)
    ab.ricalcola(ADESSO)
    assert.ok(!ab.perIlRitratto().includes('Priya'), 'sei casi non bastano')
    ab.cambia('posta.lascia:priya@a.example', 'tieni')
    const due = ab.perIlRitratto()
    assert.ok(due.includes('Come lavora, confermato da lei:\n· Le mail di Priya Shah di solito restano senza risposta.'), due)
    // la carta la mette per ultima
    const carta = memoria.carta()
    assert.ok(carta.endsWith(due), carta)
    // il tetto: molti mittenti, al massimo otto righe e cinquecento caratteri
    for (let m = 0; m < 12; m++) for (let i = 0; i < 21; i++) mail(`m${m}@h.example`, `Mittente Numero ${m} Con Un Nome Lungo`, 40 - i, 60)
    ab.ricalcola(ADESSO)
    const tanto = ab.perIlRitratto()
    assert.ok(tanto.split('\n').filter(r => r.startsWith('· ')).length <= 8)
    assert.ok(tanto.length <= 500, String(tanto.length))
    ab.cambia('posta.lascia:priya@a.example', 'togli')
    assert.ok(!ab.perIlRitratto().includes('Priya'), 'una tolta esce subito dal prompt')
  })
})

test('mai un indirizzo: un mittente senza nome e un organizzatore senza CN escono col nome dell’indirizzo, e le righe confermate non restano fuori dal ritratto', () => {
  chi.dentro(anna, () => {
    pulisci()
    // ventidue mail da un mittente senza nome (il registro ha l'indirizzo come nome, com'era prima della regola)
    for (let i = 0; i < 22; i++) mail('bob@corp.example', 'bob@corp.example', 40 - i, 50)
    // ventidue inviti rifiutati da un organizzatore senza nome, e quattro da uno col nome
    const up = store.default.prepare("INSERT INTO agenda_viste (uid, titolo, inizio, fine, originale, stato, mio, visto, organizzatore) VALUES (?,?,?,?,?,?,?,?,?)")
    for (let i = 0; i < 22; i++) { const t = new Date(ADESSO.getTime() - (30 - i) * GIORNO).toISOString(); up.run(`r${i}|${t}`, 'Sync', t, null, t, 'CONFIRMED', 'DECLINED', ADESSO.toISOString(), 'tom@brill.example') }
    for (let i = 0; i < 4; i++) { const t = new Date(ADESSO.getTime() - (20 - i) * GIORNO).toISOString(); up.run(`k${i}|${t}`, 'Sync', t, null, t, 'CONFIRMED', 'DECLINED', ADESSO.toISOString(), 'Kim Lee <kim@lee.example>') }
    ab.ricalcola(ADESSO)
    const righe = ab.tutte()
    assert.equal(riga('posta.risponde_sempre:bob@corp.example')?.dati.nome, 'Bob')
    assert.equal(riga('agenda.rifiuta:tom@brill.example')?.dati.nome, 'Tom')
    assert.equal(riga('agenda.rifiuta:kim@lee.example')?.dati.nome, 'Kim Lee')
    for (const r of righe) assert.ok(!String(r.dati.nome ?? '').includes('@'), `${r.chiave}: ${r.dati.nome}`)
    const ritratto = ab.perIlRitratto()
    assert.ok(ritratto.includes('A Bob risponde sempre'), ritratto)
    assert.ok(ritratto.includes('Rifiuta gli inviti di Tom.'), ritratto)
    assert.ok(!ritratto.includes('@'), ritratto)
    assert.ok(!memoria.carta().includes('@corp.example') && !memoria.carta().includes('@brill.example'))
    // una riga col vecchio indirizzo dentro `dati.nome` non entra nel prompt (e la si salta senza intestazione vuota)
    store.default.prepare("UPDATE abitudini SET dati = ? WHERE chiave = 'posta.risponde_sempre:bob@corp.example'").run(JSON.stringify({ nome: 'bob@corp.example', latenzaMin: 50 }))
    assert.ok(!ab.perIlRitratto().includes('@'))
    // otto righe misurate più una tenuta: la tenuta ha il suo posto, nessuna intestazione resta senza righe
    pulisci()
    for (let m = 0; m < 8; m++) for (let i = 0; i < 21; i++) mail(`m${m}@h.example`, `Al ${m}`, 40 - i, 60)
    for (let i = 0; i < 6; i++) mail('priya@a.example', 'Priya Shah', 30 - i, null)
    ab.ricalcola(ADESSO)
    ab.cambia('posta.lascia:priya@a.example', 'tieni')
    const t = ab.perIlRitratto()
    const linee = t.split('\n')
    assert.ok(t.includes('Come lavora, confermato da lei:\n· Le mail di Priya Shah di solito restano senza risposta.'), t)
    assert.equal(linee.filter(l => l.startsWith('· ')).length, 8)
    assert.ok(!linee[linee.length - 1]!.endsWith(':'), 'nessuna intestazione in coda')
    for (let i = 0; i < linee.length; i++) if (linee[i]!.endsWith(':')) assert.ok(linee[i + 1]?.startsWith('· '), `intestazione vuota: ${linee[i]}`)
    // nomi lunghi: il taglio dei cinquecento caratteri non lascia un'intestazione sola
    pulisci()
    for (let m = 0; m < 8; m++) for (let i = 0; i < 21; i++) mail(`l${m}@h.example`, `Mittente Numero ${m} Con Un Nome Lungo Davvero`, 40 - i, 60)
    for (let i = 0; i < 6; i++) mail('priya@a.example', 'Priya Shah', 30 - i, null)
    ab.ricalcola(ADESSO)
    ab.cambia('posta.lascia:priya@a.example', 'tieni')
    const corto = ab.perIlRitratto()
    assert.ok(corto.length <= 500 && corto.includes('Priya Shah'), corto)
    const ll = corto.split('\n')
    for (let i = 0; i < ll.length; i++) if (ll[i]!.endsWith(':')) assert.ok(ll[i + 1]?.startsWith('· '), `intestazione vuota: ${ll[i]}`)
  })
})

test('perMittente e imparateDal', () => {
  chi.dentro(anna, () => {
    pulisci()
    for (let i = 0; i < 10; i++) mail('nora@h.example', 'Nora', 30 - i, 90)
    ab.ricalcola(ADESSO)
    const m = ab.perMittente('Nora@H.example')!
    assert.ok(m); assert.equal(m.casi, 10); assert.equal(m.risponde, 1); assert.equal(m.latenzaMin, 90); assert.equal(m.inVigore, false)
    assert.equal(ab.perMittente('boh@x.example'), null)
    assert.equal(ab.imparateDal('2020-01-01T00:00:00.000Z').length, 1)
    assert.equal(ab.imparateDal('2099-01-01T00:00:00.000Z').length, 0)
  })
})

test('agenda: una serie rifiutata è un invito solo, le occorrenze future non contano, e gli spostamenti si contano sulle stesse occorrenze del denominatore', () => {
  chi.dentro(anna, () => {
    pulisci()
    const up = store.default.prepare("INSERT INTO agenda_viste (uid, titolo, inizio, fine, originale, stato, mio, visto, organizzatore) VALUES (?,?,?,?,?,?,?,?,?)")
    const TOM = 'Tom Brill <tom@brill.example>'
    const a = (giorni: number) => new Date(ADESSO.getTime() + giorni * GIORNO).toISOString()
    // una settimanale di Tom dalle quattro settimane fa alle venticinque avanti, rifiutata: trenta occorrenze, una decisione
    for (let w = -4; w <= 25; w++) up.run(`serie-tom|${a(7 * w)}`, 'Weekly', a(7 * w), null, a(7 * w), 'CONFIRMED', 'DECLINED', ADESSO.toISOString(), TOM)
    ab.ricalcola(ADESSO)
    assert.equal(riga('agenda.rifiuta:tom@brill.example'), undefined, 'una serie rifiutata non fa riga da sola')
    assert.ok(!ab.perIlRitratto().includes('Tom Brill'))
    // quattro inviti singoli passati, tre rifiutati, e uno futuro rifiutato che non conta: con la serie, quattro su cinque
    for (let i = 0; i < 4; i++) up.run(`solo-${i}`, `Call ${i}`, a(-10 - i), null, a(-10 - i), 'CONFIRMED', i < 3 ? 'DECLINED' : 'ACCEPTED', ADESSO.toISOString(), TOM)
    up.run('solo-futuro', 'Call', a(3), null, a(3), 'CONFIRMED', 'DECLINED', ADESSO.toISOString(), TOM)
    ab.ricalcola(ADESSO)
    const tom = riga('agenda.rifiuta:tom@brill.example')!
    assert.ok(tom); assert.equal(tom.casi, 4); assert.equal(tom.su, 5); assert.equal(tom.inVigore, false)
    assert.ok(tom.esempi.every(e => e.quando <= ADESSO.toISOString()), 'gli esempi sono nel passato')
    // gli spostamenti: una riunione al giorno, dodici passate e venti future
    pulisci()
    for (let i = -12; i <= 20; i++) { if (i === 0) continue; up.run(`daily|${a(i)}`, 'Standup', a(i), null, a(i), 'CONFIRMED', null, ADESSO.toISOString(), 'kim@lee.example') }
    const spostata = (i: number) => seg.scrivi({ id: `agenda.spostato|daily|${a(i)}|x`, genere: 'agenda.spostato', quando: a(-1), ref: `daily|${a(i)}`, valore: 30, dati: { titolo: 'Standup' } })
    for (let i = 5; i <= 7; i++) spostata(i)
    ab.ricalcola(ADESSO)
    assert.equal(riga('agenda.sposta'), undefined, 'tre riunioni future spostate non sono una riga sul passato')
    for (let i = -3; i <= -1; i++) spostata(i)
    ab.ricalcola(ADESSO)
    const sp = riga('agenda.sposta')!
    assert.ok(sp); assert.equal(sp.casi, 3); assert.equal(sp.su, 12); assert.equal(sp.dati.ogni, 4)
  })
})

// — F6: le tre righe del primo giorno —

test('F6 · le ore delle riunioni, la cartella dei commit, il progetto delle chat: con le prove, e nessuna in vigore da sola', () => {
  chi.dentro(anna, () => {
    pulisci()
    store.default.exec('DELETE FROM documenti')
    // venti riunioni passate: sedici fra le 9 e le 12 di Roma, quattro il pomeriggio; e una di un giorno intero, che non conta
    const eventi = Array.from({ length: 20 }, (_, i) => {
      const g = new Date(ADESSO.getTime() - (i + 1) * 3 * GIORNO)
      const ora = i < 16 ? 7 + (i % 3) : 13 + (i % 2)
      g.setUTCHours(ora, 0, 0, 0)
      return { id: `calendario:r${i}@x:${g.getTime()}`, fonte: 'calendario', tipo: 'evento', titolo: `Riunione ${i}`, corpo: 'Tuesday 09:00 — 10:00.', quando: g.toISOString() }
    })
    eventi.push({ id: 'calendario:ferie@x:1', fonte: 'calendario', tipo: 'evento', titolo: 'Ferie', corpo: 'Monday, all day.', quando: new Date(ADESSO.getTime() - 5 * GIORNO).toISOString() })
    store.salvaDocumenti(eventi)
    // quindici commit suoi: dodici su «atlas», tre su «blog»
    for (let i = 0; i < 15; i++) {
      const q = new Date(ADESSO.getTime() - (i + 1) * 4 * GIORNO).toISOString()
      const cartella = i < 12 ? '/Users/anna/Code/atlas' : '/Users/anna/Code/blog'
      seg.scrivi({ id: `codice.commit|h${i}`, genere: 'codice.commit', quando: q, chi: 'anna@esempio.it', ref: cartella, dati: { agente: false, messaggio: `Fix ${i} in the importer`, cartella: cartella.split('/').pop() } })
    }
    // un progetto attivo di cui parla con ChatGPT e Claude in sei giorni diversi, e una sessione di codice che non conta
    progetti.scrivi({ nome: 'Harbor Launch', obiettivo: 'Launch the harbor app' })
    const chat = Array.from({ length: 6 }, (_, i) => ({ id: `conversazioni:${i % 2 ? 'claude' : 'chatgpt'}:c${i}`, fonte: 'conversazioni', tipo: 'chat',
      titolo: `Harbor Launch pricing ${i}`, corpo: 'We talked about the Harbor Launch plan.', quando: new Date(ADESSO.getTime() - (i + 1) * 5 * GIORNO).toISOString() }))
    chat.push({ id: 'conversazioni:codice:k1', fonte: 'conversazioni', tipo: 'chat', titolo: 'Harbor Launch · refactor', corpo: 'Harbor Launch', quando: new Date(ADESSO.getTime() - 2 * GIORNO).toISOString() })
    store.salvaDocumenti(chat)
    ab.ricalcola(ADESSO)

    const ore = riga('agenda.ore')!
    assert.ok(ore, 'la fascia delle riunioni')
    assert.equal(ore.su, 20, 'il giorno intero non conta'); assert.ok(ore.casi >= 10 && ore.casi / 20 >= 0.5)
    assert.equal((Number(ore.dati.a) - Number(ore.dati.da) + 24) % 24, 3)
    assert.ok(ore.esempi.length && ore.esempi.every(e => e.doc?.startsWith('calendario:')), 'il perché porta alle riunioni')
    assert.equal(ore.inVigore, false)

    const commit = riga('codice.commit:atlas')!
    assert.ok(commit, 'la cartella dei commit'); assert.equal(commit.casi, 12); assert.equal(commit.su, 15)
    assert.match(commit.esempi[0]!.testo, /Fix \d+ in the importer/, 'il perché sono i messaggi dei commit')
    assert.equal(commit.inVigore, false)

    const harbor = ab.tutte().find(a => a.genere === 'chat.progetto')!
    assert.ok(harbor, 'il progetto delle chat'); assert.equal(harbor.dati.nome, 'Harbor Launch'); assert.equal(harbor.casi, 6)
    assert.ok(harbor.esempi.every(e => e.doc?.startsWith('conversazioni:chatgpt:') || e.doc?.startsWith('conversazioni:claude:')), 'solo le chat esportate')
    assert.equal(harbor.inVigore, false)

    // a venti casi non valgono comunque: aspettano Tienila
    for (const g of ['agenda.ore', 'codice.commit', 'chat.progetto']) assert.equal(ab.inVigore({ genere: g, stato: 'osservata', prova: { casi: 50, su: 50, esempi: [] } }), false, g)
    // e nel ritratto, tenute, dicono la frase giusta
    for (const a of [ore, commit, harbor]) ab.cambia(a.chiave, 'tieni')
    const r = ab.perIlRitratto()
    assert.match(r, /Le sue riunioni stanno soprattutto tra le/)
    assert.match(r, /commit va su atlas/)
    assert.match(r, /Parla spesso di Harbor Launch/)
    store.default.exec('DELETE FROM documenti; DELETE FROM progetti')
  })
})

test('F6 · sotto le quindici riunioni, o senza metà nelle tre ore, niente riga; un commit sparso nemmeno', () => {
  chi.dentro(anna, () => {
    pulisci()
    store.default.exec('DELETE FROM documenti')
    const poche = Array.from({ length: 14 }, (_, i) => ({ id: `calendario:p${i}`, fonte: 'calendario', tipo: 'evento', titolo: `R ${i}`, corpo: 'x', quando: new Date(ADESSO.getTime() - (i + 1) * GIORNO).toISOString() }))
    store.salvaDocumenti(poche)
    for (let i = 0; i < 9; i++) seg.scrivi({ id: `codice.commit|p${i}`, genere: 'codice.commit', quando: new Date(ADESSO.getTime() - (i + 1) * GIORNO).toISOString(), chi: 'anna@esempio.it', ref: '/c/uno', dati: { agente: false, messaggio: 'x' } })
    ab.ricalcola(ADESSO)
    assert.equal(riga('agenda.ore'), undefined)
    assert.equal(ab.tutte().filter(a => a.genere === 'codice.commit').length, 0, 'nove commit non bastano')
    store.default.exec('DELETE FROM documenti')
  })
})
