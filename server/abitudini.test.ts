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
