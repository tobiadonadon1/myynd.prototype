// La prima lettura: novanta giorni finché non sono dentro, poi la finestra di
// sempre; chi c'era già non se ne accorge; niente gira per sempre.
//
//   node --test server/prima-lettura.test.ts

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const casa = mkdtempSync(join(tmpdir(), 'myynd-prima-lettura-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const cfg = await import('./config.ts')
const prima = await import('./prima-lettura.ts')
const cancellati = await import('./cancellati.ts')
const desktop = await import('./connettori/desktop.ts')
const { silenzioArrivi } = await import('./salute-regole.ts')

const doc = (id: string, fonte: string) => ({ id, fonte, tipo: 'testo', titolo: id, corpo: `corpo di ${id}`, quando: new Date().toISOString() })
const collega = () => cfg.aggiorna({
  calendario: { url: 'https://example.invalid/agenda.ics' },
  posta: { host: 'imap.example.invalid', porta: 993, utente: 'prova@example.invalid', password: 'x' }
})

before(() => { prima.perProva({ pausa: 1, giri: 12, occupato: 1 }) })
beforeEach(() => {
  prima.fermaRiprese()
  store.azzeraTutto()
  cancellati.dimentica()
  cfg.scrivi({}, { togli: [...cfg.CON_SEGRETI] })
})
after(() => { prima.perProva(null); store.chiudiIndici(); rmSync(casa, { recursive: true, force: true }) })

test('una fonte nuova, senza documenti, comincia la sua prima lettura', () => {
  assert.equal(prima.statoPrima('posta'), 'in-corso')
  assert.equal(store.cursore('prima:posta'), 'in-corso')
  assert.ok(store.cursore('prima:iniziata'), 'il conto sa quando ha cominciato')
})

test('chi c’era già, con i documenti di quella fonte, è «fatto» dal primo giorno (counter-case)', () => {
  store.salvaDocumenti([doc('posta:INBOX:1', 'posta')])
  assert.equal(prima.statoPrima('posta'), 'fatto')
  assert.equal(prima.giorniDi('posta', 30), 30)
  assert.equal(store.cursore('prima:iniziata'), null, 'un conto vecchio non comincia nessuna prima lettura')
})

test('novanta giorni finché dura, poi quelli della configurazione; mai meno di quelli scelti', () => {
  assert.equal(prima.giorniDi('posta', 30), 90)
  assert.equal(prima.giorniDi('posta', undefined), 90)
  assert.equal(prima.giorniDi('calendario', 365), 365, 'uno che ne ha scelti di più li tiene')
  prima.finita('posta')
  assert.equal(prima.giorniDi('posta', 30), 30)
  assert.equal(prima.giorniDi('posta', undefined, 45), 45)
})

test('la posta con altro da leggere resta in corso; tutta dentro, è fatta', () => {
  prima.statoPrima('posta')
  prima.esito('posta', false)
  assert.equal(store.cursore('prima:posta'), 'in-corso')
  assert.equal(store.cursore('prima:posta:giri'), '1')
  prima.esito('posta', true)
  assert.equal(store.cursore('prima:posta'), 'fatto')
  assert.equal(store.cursore('prima:posta:giri'), null)
})

test('il Mac troncato dalla profondità ma non pieno ha finito (counter-case al giro senza fine)', async () => {
  // un albero più fondo delle regole: `troncato` scatta, `pieno` no
  const radice = join(casa, 'mac')
  let dove = radice
  for (let i = 0; i < 9; i++) dove = join(dove, `livello${i}`)
  mkdirSync(dove, { recursive: true })
  writeFileSync(join(radice, 'appunti.md'), 'Appunti di lavoro sul progetto, abbastanza lunghi da essere un documento vero.')
  writeFileSync(join(dove, 'fondo.md'), 'Questo sta troppo in fondo e non si legge in questo giro.')
  const e = await desktop.sincronizza({ cartelle: [radice], scelte: true }, undefined, undefined, undefined, { dal: 0, nuoviMax: 1500 })
  assert.equal(e.troncato, true)
  assert.equal(e.pieno, false)
  prima.statoPrima('desktop')
  prima.esito('desktop', !e.pieno)
  assert.equal(store.cursore('prima:desktop'), 'fatto')
})

test('il calendario troncato ha finito dopo una lettura sola: rileggerlo darebbe lo stesso', () => {
  prima.statoPrima('calendario')
  prima.esito('calendario', true)
  assert.equal(store.cursore('prima:calendario'), 'fatto')
})

test('al quarantesimo giro la prima lettura si arrende', () => {
  prima.statoPrima('posta')
  for (let i = 0; i < prima.GIRI_MASSIMI - 1; i++) prima.esito('posta', false)
  assert.equal(store.cursore('prima:posta'), 'in-corso')
  prima.esito('posta', false)
  assert.equal(store.cursore('prima:posta'), 'fatto')
})

test('una fonte «fatto» non torna indietro, e un esito non la tocca', () => {
  prima.finita('posta')
  prima.esito('posta', false)
  assert.equal(store.cursore('prima:posta'), 'fatto')
  assert.equal(store.cursore('prima:posta:giri'), null)
})

test('scollegata, la fonte ricomincia da capo', () => {
  prima.statoPrima('posta'); prima.esito('posta', false); prima.finita('posta')
  prima.scorda('posta')
  assert.equal(store.cursore('prima:posta'), null)
  assert.equal(prima.statoPrima('posta'), 'in-corso')
})

test('solo le fonti collegate e a finestra sono «in corso»', () => {
  assert.deepEqual(prima.inCorso(), [])
  collega()
  assert.deepEqual(prima.inCorso().sort(), ['calendario', 'posta'])
  assert.equal(prima.eUnaPrima(), true)
  prima.finita('posta'); prima.finita('calendario')
  assert.equal(prima.eUnaPrima(), false)
})

test('la prima volta l’agenda e la posta prima del Mac; le altre volte l’ordine di sempre (counter-case)', () => {
  const passi = ['desktop', 'notion', 'note', 'conversazioni', 'x', 'calendario', 'posta', 'google', 'slack', 'github'].map(nome => ({ nome }))
  const primo = prima.ordina(passi, true).map(p => p.nome)
  assert.deepEqual(primo.slice(0, 2), ['calendario', 'posta'])
  assert.equal(primo[primo.length - 1], 'desktop')
  assert.deepEqual(prima.ordina(passi, false).map(p => p.nome), passi.map(p => p.nome))
  // un nome che non si conosce resta prima del Mac, nel suo ordine
  const ignoti = prima.ordina([{ nome: 'desktop' }, { nome: 'nuova' }, { nome: 'altra' }], true).map(p => p.nome)
  assert.deepEqual(ignoti, ['nuova', 'altra', 'desktop'])
})

test('la prima pagina comincia prima del Mac, che è lento: non aspetta migliaia di file', async () => {
  const passi = [{ nome: 'desktop' }, { nome: 'posta' }, { nome: 'notion' }, { nome: 'calendario' }]
  const storia: string[] = []
  let desktopFinito = false
  await prima.inOrdine(passi, true, async p => {
    storia.push(`inizio ${p.nome}`)
    // il Mac finto è lento: la pagina deve essere già partita prima che cominci
    if (p.nome === 'desktop') { await new Promise(r => setTimeout(r, 30)); desktopFinito = true }
  }, () => { storia.push('pagina'); assert.equal(desktopFinito, false) })
  assert.deepEqual(storia, ['inizio calendario', 'inizio posta', 'inizio notion', 'pagina', 'inizio desktop'])
})

test('senza il Mac la prima pagina parte alla fine, una volta; fuori da una prima lettura non parte (counter-case)', async () => {
  const storia: string[] = []
  await prima.inOrdine([{ nome: 'posta' }, { nome: 'calendario' }], true, async p => { storia.push(p.nome) }, () => storia.push('pagina'))
  assert.deepEqual(storia, ['calendario', 'posta', 'pagina'])
  const dopo: string[] = []
  await prima.inOrdine([{ nome: 'desktop' }, { nome: 'posta' }], false, async p => { dopo.push(p.nome) }, () => dopo.push('pagina'))
  assert.deepEqual(dopo, ['desktop', 'posta'], 'l’ordine di sempre, e nessuna pagina')
})

test('il resto in sottofondo: legge finché non è tutto dentro, e dopo si ferma', async () => {
  collega()
  const lette: string[] = []
  let giri = 0
  await prima.continua('', async fonte => {
    lette.push(fonte)
    if (fonte === 'calendario') prima.esito('calendario', true)
    if (fonte === 'posta' && ++giri >= 3) prima.esito('posta', true)
    else if (fonte === 'posta') prima.esito('posta', false)
    return 'letta'
  })
  assert.deepEqual(lette.filter(f => f === 'calendario').length, 1)
  assert.equal(lette.filter(f => f === 'posta').length, 3)
  assert.equal(prima.inCorso().length, 0)
  assert.equal(prima.inCoda(''), false)
})

test('uno per conto: due chiamate insieme sono lo stesso giro', async () => {
  collega()
  let chiamate = 0
  const leggi = async () => { chiamate++; await new Promise(r => setTimeout(r, 5)); prima.finita('posta'); prima.finita('calendario'); return 'letta' as const }
  const a = prima.continua('', leggi)
  const b = prima.continua('', leggi)
  assert.equal(a, b)
  assert.equal(prima.inCoda(''), true)
  await a
  assert.equal(chiamate, 1)
})

test('la serratura presa: si riprova una volta, poi si lascia al giro dei dieci minuti', async () => {
  collega()
  const viste: string[] = []
  await prima.continua('', async fonte => { viste.push(fonte); return 'occupato' })
  assert.equal(viste.length, 2, 'una volta, e una volta ancora dopo l’attesa')
  const poi: string[] = []
  await prima.continua('', async fonte => { poi.push(fonte); if (poi.length === 1) return 'occupato'; prima.finita(fonte); return 'letta' })
  assert.ok(poi.length >= 2, 'il secondo tentativo passa e il giro continua')
})

test('una fonte che non risponde si salta fino al prossimo giro, le altre vanno avanti', async () => {
  collega()
  const viste: string[] = []
  await prima.continua('', async fonte => {
    viste.push(fonte)
    if (fonte === 'posta') return 'guaio'
    prima.finita(fonte)
    return 'letta'
  })
  assert.equal(viste.filter(f => f === 'posta').length, 1)
  assert.equal(store.cursore('prima:calendario'), 'fatto')
  assert.equal(store.cursore('prima:posta'), 'in-corso')
})

test('un conto cancellato ferma tutto, subito', async () => {
  collega()
  cancellati.segna(cfg.cartella())
  let chiamate = 0
  await prima.continua('', async () => { chiamate++; return 'letta' })
  assert.equal(chiamate, 0)
  cancellati.dimentica()
})

test('quando tutto è dentro, il primo giro di apprendimento parte una volta, e non al giro dopo', async () => {
  collega()
  let imparato = 0
  prima.quandoFinisce(() => { imparato++ })
  await prima.continua('', async fonte => { prima.finita(fonte); return 'letta' })
  assert.equal(imparato, 1)
  assert.ok(store.cursore('prima:imparato'))
  await prima.continua('', async () => 'letta')
  assert.equal(imparato, 1)
})

test('il giorno grande della prima lettura non fa sembrare muta la fonte nei giorni dopo', () => {
  // tremila arrivi il primo giorno, poi giorni tranquilli: la mediana guarda il solito
  assert.equal(silenzioArrivi([3000, 2, 1, 0, 1, 0, 2], 2), false)
  assert.equal(silenzioArrivi([3000, 0, 0, 0, 0, 0, 0], 3), false)
  // e una fonte davvero muta resta muta (counter-case)
  assert.equal(silenzioArrivi([3000, 20, 18, 25, 22, 19, 21], 2), true)
})

test('le opzioni del Mac: prima novanta giorni e 1500, poi 2000; verso un server ospitato nessuna (counter-case)', () => {
  const adesso = Date.parse('2026-09-25T10:00:00Z')
  assert.deepEqual(prima.opzioniMac(true, false, adesso), { dal: adesso - 90 * 86_400_000, nuoviMax: 1500 })
  assert.deepEqual(prima.opzioniMac(false, false, adesso), { nuoviMax: 2000 })
  assert.deepEqual(prima.opzioniMac(true, true, adesso), {})
  assert.deepEqual(prima.opzioniMac(false, true, adesso), {})
})

test('una lettura chiesta mentre gira il resto: il resto finisce la fonte che ha in mano e cede il passo', async () => {
  collega()
  const viste: string[] = []
  await prima.continua('', async fonte => {
    viste.push(fonte)
    // la persona preme «Leggi» mentre il resto legge la prima fonte
    if (viste.length === 1) prima.cedi('')
    return 'letta'
  })
  assert.equal(viste.length, 1, 'la fonte in mano si finisce, la seconda non si comincia')
  assert.equal(prima.inCoda(''), false, 'la serratura resta libera per chi l’ha chiesta')
  // e la volta dopo (la lettura della persona, finita, lo fa ripartire) il resto riprende
  const poi: string[] = []
  await prima.continua('', async fonte => { poi.push(fonte); prima.finita(fonte); return 'letta' })
  assert.deepEqual(poi.sort(), ['calendario', 'posta'])
})

test('il resto che ha ceduto il passo, se nessuno prende la serratura, riparte da sé', async () => {
  collega()
  const viste: string[] = []
  // chi ha chiesto ha chiuso la pagina: nessuna lettura sua prende la serratura
  await prima.continua('', async fonte => {
    viste.push(fonte)
    if (viste.length === 1) { prima.cedi(''); return 'letta' }
    prima.finita(fonte); return 'letta'
  })
  assert.equal(viste.length, 1)
  const fine = Date.now() + 2000
  while (Date.now() < fine && prima.inCorso().length) await new Promise(r => setTimeout(r, 5))
  assert.deepEqual(prima.inCorso(), [], 'il resto è ripartito e ha finito, senza aspettare il giro dei dieci minuti')
  assert.ok(viste.length >= 3, `riletta la fonte a metà, poi l’altra: ${viste.join(', ')}`)
})

test('il resto fermato da una serratura presa (non ceduto) non riparte da sé (counter-case)', async () => {
  collega()
  const viste: string[] = []
  await prima.continua('', async fonte => { viste.push(fonte); return 'occupato' })
  assert.equal(viste.length, 2)
  await new Promise(r => setTimeout(r, 50))
  assert.equal(viste.length, 2, 'nessuna ripresa: lo fa la lettura che tiene la serratura, finita')
  assert.equal(prima.inCoda(''), false)
})

test('cedere senza un resto in corso non ferma il resto che parte dopo (counter-case)', async () => {
  collega()
  prima.cedi('')
  const viste: string[] = []
  await prima.continua('', async fonte => { viste.push(fonte); prima.finita(fonte); return 'letta' })
  assert.deepEqual(viste.sort(), ['calendario', 'posta'])
})

test('chi chiede di leggere mentre il resto aspetta una serratura presa: il resto non riprova, cede il passo', async () => {
  collega()
  const viste: string[] = []
  await prima.continua('', async fonte => {
    viste.push(fonte)
    // la serratura è presa (il giro dei dieci minuti) e, durante l'attesa, la persona preme «Leggi» e prende un 409
    prima.cedi('')
    return 'occupato'
  })
  assert.equal(viste.length, 1, 'nessun secondo tentativo: la serratura che si libera è di chi l’ha chiesta')
  assert.equal(prima.inCoda(''), false)
  prima.fermaRiprese()
})
