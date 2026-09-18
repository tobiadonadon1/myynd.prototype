// I progetti: la tabella, l'importazione dal foglio vecchio, e la promessa
// che un progetto chiuso non torna.
//
// Quello che si prova qui non è la qualità di niente: è che «chiudi» non
// cancella, che lo stesso nome è lo stesso progetto, che i progetti che il
// punto aveva già capito entrano una volta sola, e che la riga per il modello
// sia corta e senza i chiusi. Il pezzo che tocca un documento — `tocca` — è
// un conteggio di parole, e si prova come tale.
//
//   node --test server/progetti.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-progetti-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const punto = await import('./punto.ts')

before(() => store.azzeraTutto())
after(() => {
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

function pulisci() {
  store.azzeraTutto()
  rmSync(punto.perProva.file(), { force: true })
}

// — la tabella —

test('scrivere, cambiare, chiudere: e chiudere non cancella', () => {
  pulisci()
  const p = progetti.scrivi({ nome: 'Nextas', obiettivo: 'Chiudere il round seed entro ottobre' })
  assert.ok(p.id.startsWith('p'))
  assert.equal(p.stato, 'attivo')
  assert.equal(p.origine, 'mano')
  assert.equal(progetti.elenco().length, 1)

  const cambiato = progetti.cambia(p.id, { obiettivo: 'Chiudere il round seed entro novembre', stato: 'fermo', note: 'aspetta Bianchi' })
  assert.equal(cambiato?.obiettivo, 'Chiudere il round seed entro novembre')
  assert.equal(cambiato?.stato, 'fermo')
  assert.equal(cambiato?.note, 'aspetta Bianchi')
  assert.ok(cambiato!.aggiornato >= p.aggiornato)

  assert.ok(progetti.chiudi(p.id))
  assert.equal(progetti.trova(p.id)?.stato, 'chiuso', 'chiudere ha cancellato la riga')
  assert.equal(progetti.elenco().length, 1, 'un progetto chiuso è sparito dalla storia')
  assert.deepEqual(progetti.vivi(), [], 'un progetto chiuso conta ancora come vivo')
  assert.deepEqual(progetti.chiusi(), ['Nextas'])

  assert.equal(progetti.cambia('inesistente', { nome: 'x' }), null)
  assert.throws(() => progetti.scrivi({ nome: '   ' }), /bisogno di un nome/)
  assert.throws(() => progetti.cambia(p.id, { stato: 'finito' }), /attivo, fermo o chiuso/)
})

test('lo stesso nome è lo stesso progetto, anche scritto diverso; riaprirlo a mano si può, dal punto no', () => {
  pulisci()
  const a = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Un gemello che sceglie per me' })
  const b = progetti.scrivi({ nome: '  myynd ' })
  assert.equal(b.id, a.id)
  assert.equal(b.obiettivo, 'Un gemello che sceglie per me', 'un obiettivo già scritto è stato sovrascritto dal vuoto')
  assert.equal(progetti.trovaPerNome('MYYND')?.id, a.id)

  progetti.chiudi(a.id)
  // il punto lo rivede nel materiale: resta chiuso
  assert.equal(progetti.scrivi({ nome: 'Myynd', origine: 'punto' }).stato, 'chiuso')
  // lui lo riscrive nella Memoria: si riapre, è una scelta sua
  assert.equal(progetti.scrivi({ nome: 'Myynd' }).stato, 'attivo')
})

// — dal foglio vecchio —

test('i progetti che il punto teneva in punto.json entrano una volta sola, con la loro data', () => {
  pulisci()
  writeFileSync(punto.perProva.file(), JSON.stringify({
    ultimo: null, scartati: [], chiamate: [],
    progetti: [
      { nome: 'Myynd', dal: '2026-08-01T08:00:00.000Z', doveSei: 'x', angolo: '', angoliTenuti: ['Un angolo'] },
      { nome: 'myynd', dal: '2026-08-02T08:00:00.000Z', doveSei: 'x', angolo: '', angoliTenuti: [] },
      { nome: 'Nextas', dal: '2026-08-10T08:00:00.000Z', doveSei: 'y', angolo: '', angoliTenuti: [] }
    ]
  }))
  const tutti = progetti.elenco()
  assert.deepEqual(tutti.map(p => p.nome).sort(), ['Myynd', 'Nextas'], 'lo stesso nome due volte è entrato due volte')
  const myynd = progetti.trovaPerNome('Myynd')!
  assert.equal(myynd.dal, '2026-08-01T08:00:00.000Z')
  assert.equal(myynd.origine, 'punto')
  assert.equal(myynd.obiettivo, '', 'l’obiettivo lo scrive lui: dal foglio non c’è')

  // chiuso, e il foglio riscritto: non rientra — l'importazione è una volta sola
  progetti.chiudi(myynd.id)
  writeFileSync(punto.perProva.file(), JSON.stringify({
    ultimo: null, scartati: [], chiamate: [], progetti: [{ nome: 'Myynd', dal: '2026-08-01T08:00:00.000Z' }]
  }))
  assert.equal(progetti.trovaPerNome('Myynd')?.stato, 'chiuso', 'un progetto chiuso è tornato dal foglio')
  assert.equal(progetti.elenco().length, 2)
})

// — per il modello —

test('la riga per il modello: nome, obiettivo, stato; senza i chiusi, e al massimo otto', () => {
  pulisci()
  for (let i = 0; i < 10; i++) progetti.scrivi({ nome: `Progetto ${i}`, obiettivo: i % 2 ? `Arrivare a ${i}` : '' })
  const fermo = progetti.trovaPerNome('Progetto 9')!
  progetti.cambia(fermo.id, { stato: 'fermo' })
  const chiuso = progetti.trovaPerNome('Progetto 0')!
  progetti.chiudi(chiuso.id)

  const righe = progetti.perIlModello().split('\n')
  assert.equal(righe.length, 8, `${righe.length} righe: il tetto è otto`)
  assert.ok(righe.every(r => r.startsWith('— ')))
  assert.ok(righe.some(r => r.includes('Progetto 1 (attivo; registrato dalla persona). Obiettivo di Progetto 1: Arrivare a 1.')), righe.join('\n'))
  assert.ok(righe.some(r => r.includes('Obiettivo di Progetto 2: non registrato; non dedurlo da altri progetti')), 'un obiettivo mancante deve essere esplicito')
  assert.ok(!righe.some(r => r.includes('Progetto 0')), 'un chiuso è arrivato al modello')
  // gli attivi prima dei fermi: con nove vivi e otto posti, resta fuori il fermo
  assert.ok(!righe.some(r => r.includes('(fermo;')), 'un fermo è passato davanti a un attivo')
})

// — cosa tocca un progetto —

test('«tocca»: il nome intero, o due parole distintive dell’obiettivo; una sola no', () => {
  const p = { nome: 'Nextas', obiettivo: 'Chiudere il round seed con Bianchi entro ottobre' }
  assert.deepEqual(progetti.paroleDi(p), ['chiudere', 'round', 'seed', 'bianchi', 'ottobre'])
  assert.ok(progetti.tocca(p, 'Re: NEXTAS — aggiornamento'), 'il nome, maiuscolo, non è stato riconosciuto')
  assert.ok(progetti.tocca(p, 'Bianchi conferma per il round'), 'due parole dell’obiettivo non bastano')
  assert.ok(!progetti.tocca(p, 'Il round di golf di domenica'), 'una parola sola ha fatto passare un documento')
  assert.ok(!progetti.tocca(p, 'Fattura della luce di settembre'))
  // un obiettivo di una parola non ha «due parole distintive»: solo il nome conta
  assert.ok(!progetti.tocca({ nome: 'Casa', obiettivo: 'Traslocare' }, 'traslocare traslocare'))
  assert.ok(progetti.toccaUnProgetto('nextas', [{ ...p, id: 'x', stato: 'attivo', dal: '', aggiornato: '', note: '', origine: 'mano', colore: '', alias: [], genitore: null }]))
})

test('un nome simile non collega materiale di un altro progetto', () => {
  assert.equal(progetti.tocca({ nome: 'Acme', obiettivo: 'Vendere vino rosso' }, 'Acme2 vende il portavino rossore'), false)
  assert.equal(progetti.tocca({ nome: 'Caffè Roma', obiettivo: '' }, 'Riunione: Caffe Roma.'), true)
})

test('attività collegate, esiti, riapertura e cancellazione seguono il progetto per ID', () => {
  pulisci()
  const p = progetti.scrivi({ nome: 'Acme', obiettivo: 'Lanciare il prodotto' })
  store.scriviCompito({ id: 'aperta', testo: 'Preparare il lancio', ordine: 'a', progetto: p.id, giorno: '2026-09-09' })
  store.scriviCompito({ id: 'bozza', testo: 'Rivedere la bozza', ordine: 'b', progetto: p.id })
  store.scriviCompito({ id: 'altro', testo: 'Altra attività', ordine: 'c' })
  store.cambiaStatoCompito('bozza', 'pronto')
  let r = progetti.progresso(p.id)
  assert.equal(r.aperte, 1)
  assert.equal(r.daRivedere, 1)
  assert.equal(r.prossima?.id, 'bozza')
  assert.equal(r.completate, 0, 'una bozza non è un risultato concluso')
  store.cambiaStatoCompito('bozza', 'fatto', 'Approvata dal cliente')
  r = progetti.progresso(p.id)
  assert.equal(r.completate, 1)
  assert.equal(r.attivita.find(c => c.id === 'bozza')?.esito, 'Approvata dal cliente')
  assert.ok(progetti.perIlModello().includes('1 attività concluse'))
  progetti.cambia(p.id, { nome: 'Acme Studio' })
  assert.equal(progetti.progresso(p.id).attivita.length, 2)
  store.cambiaStatoCompito('bozza', 'aperto')
  assert.equal(progetti.progresso(p.id).completate, 0)
  store.scordaCompito('bozza')
  assert.equal(progetti.progresso(p.id).attivita.length, 1)
  store.cambiaCompito('aperta', { progetto: null })
  assert.equal(progetti.progresso(p.id).attivita.length, 0)
})

test('rinominare conserva le decisioni e rifiuta nomi già usati', () => {
  pulisci()
  const p = progetti.scrivi({ nome: 'Acme' })
  progetti.scrivi({ nome: 'Beta' })
  store.default.prepare(`INSERT INTO convinzioni (id, enunciato, genere, fiducia, origine, ambito, dal, creata) VALUES ('decisione', 'Preferire il lancio piccolo', 'esplicita', 1, 'mano', 'progetto:Acme', '2026-09-08', '2026-09-08')`).run()
  progetti.cambia(p.id, { nome: 'Acme Studio' })
  const r = store.default.prepare('SELECT ambito FROM convinzioni WHERE id = ?').get('decisione') as { ambito: string }
  assert.equal(r.ambito, 'progetto:Acme Studio')
  assert.throws(() => progetti.cambia(p.id, { nome: 'beta' }), /già un progetto/)
})

/*
 * L'obiettivo riscritto non è una notizia.
 *
 * Il quattordici settembre il feed gli ha proposto due volte l'obiettivo del
 * suo progetto, tagliato in due: «Ship the finished site copy and offers live»
 * è tornato come «Ship live site copy for tobiadonadon.com» e «Ship finished
 * site copy for tobiadonadon.com». Una delle due l'aveva già data per fatta,
 * e infatti la sua frase è stata: «This has already been done, and I already
 * told them that it has been done».
 */
test('un obiettivo riscritto si riconosce, e una notizia vera no', () => {
  const p = { nome: 'tobiadonadon.com', obiettivo: 'Ship the finished site copy and offers live.' }

  assert.ok(progetti.eLObiettivo(p, 'Ship live site copy for tobiadonadon.com'))
  assert.ok(progetti.eLObiettivo(p, 'Ship finished site copy for tobiadonadon.com'))
  assert.ok(progetti.eLObiettivo(p, 'Ship the finished site copy and offers live'))

  // queste parlano del progetto senza esserlo: devono passare
  assert.equal(progetti.eLObiettivo(p, 'Client sent revised site copy for review'), false)
  assert.equal(progetti.eLObiettivo(p, 'Hosting invoice for tobiadonadon.com is due Friday'), false)
  assert.equal(progetti.eLObiettivo(p, 'Milena replied about the noise complaint'), false)

  // un obiettivo di due parole non basta a giudicare: nel dubbio passa
  assert.equal(progetti.eLObiettivo({ nome: 'X', obiettivo: 'Crescere.' }, 'Crescere di più'), false)
})

// — gli altri nomi, e il padre —

test('gli altri nomi: puliti, senza doppioni, mai il nome stesso, dodici al massimo; e si trovano come il nome', async () => {
  pulisci()
  const ev = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Portare la app sullo store' })
  assert.deepEqual(ev.alias, [], 'un progetto nasce senza altri nomi')
  assert.equal(ev.genitore, null)

  const troppi = Array.from({ length: 20 }, (_, i) => `nome ${i}`)
  const c = progetti.cambia(ev.id, { alias: [' everwave ', 'Everwave', 'EverMute app', 'evermute', '', '  ', ...troppi] })!
  assert.equal(c.alias[0], 'everwave', 'si tiene la grafia con cui l’ha scritto, senza gli spazi attorno')
  assert.ok(!c.alias.some(a => a.toLowerCase() === 'evermute'), 'il nome del progetto non è un altro nome')
  assert.equal(c.alias.filter(a => a.toLowerCase() === 'everwave').length, 1, 'un doppione a meno di maiuscole è uno')
  assert.equal(c.alias.length, progetti.ALIAS_MAX, `${c.alias.length} altri nomi: il tetto è ${progetti.ALIAS_MAX}`)
  assert.throws(() => progetti.cambia(ev.id, { alias: 'everwave' }), /elenco di parole/)
  assert.throws(() => progetti.cambia(ev.id, { alias: [1, 2] }), /elenco di parole/)

  // la colonna è JSON e si rilegge uguale
  assert.deepEqual(progetti.trova(ev.id)!.alias, c.alias)

  // «everwave» è Evermute: per `risolvi`, per `eUnAlias`, per il testo di una voce, per il riferimento
  assert.equal(progetti.risolvi('everwave')?.id, ev.id)
  assert.equal(progetti.risolvi('Ever-Wave')?.id, ev.id, 'anche scritto compatto, come il nome')
  assert.equal(progetti.risolvi('EverMute app')?.id, ev.id)
  assert.ok(progetti.eUnAlias('EVERWAVE', progetti.trova(ev.id)!))
  assert.ok(progetti.tocca(progetti.trova(ev.id)!, 'Re: everwave build failed'), 'un testo che nomina un altro nome tocca il progetto')
  const { progettoDelTesto } = await import('./attenzione.ts')
  assert.equal(progettoDelTesto('Reply to the everwave review'), ev.id)
  assert.equal(progettoDelTesto('Reply to the App Store review'), null)
  const riferimento = await import('./riferimento.ts')
  assert.equal(riferimento.alias().get('everwave'), ev.id, 'gli altri nomi scritti nella Memoria stanno fra quelli del riferimento')
  assert.ok(progetti.perIlModello().includes('Altri nomi: everwave'), 'il modello deve sapere gli altri nomi')

  // cambiare nome in uno degli altri nomi lo toglie dagli altri
  const rinominato = progetti.cambia(ev.id, { nome: 'Everwave' })!
  assert.ok(!rinominato.alias.some(a => a.toLowerCase() === 'everwave'))
  assert.equal(progetti.risolvi('Evermute'), null, 'il nome vecchio non è un altro nome finché non lo scrive lui')

  // il punto che rivede «everwave» nel materiale non fa nascere un secondo progetto
  progetti.cambia(ev.id, { nome: 'Evermute', alias: ['everwave'] })
  assert.equal(progetti.scrivi({ nome: 'everwave', origine: 'punto' }).id, ev.id)
  // e un vuoto toglie tutti gli altri nomi
  assert.deepEqual(progetti.cambia(ev.id, { alias: [] })!.alias, [])
})

test('il padre: un id che esiste, mai sé stesso, mai un anello; vuoto lo toglie', () => {
  pulisci()
  const myynd = progetti.scrivi({ nome: 'Myynd' })
  const hbrain = progetti.scrivi({ nome: 'H-Brain' })
  const lab = progetti.scrivi({ nome: 'H-Brain lab' })

  assert.equal(progetti.cambia(hbrain.id, { genitore: myynd.id })!.genitore, myynd.id)
  assert.equal(progetti.cambia(lab.id, { genitore: hbrain.id })!.genitore, hbrain.id)
  assert.throws(() => progetti.cambia(myynd.id, { genitore: myynd.id }), /sé stesso/)
  assert.throws(() => progetti.cambia(myynd.id, { genitore: lab.id }), /sottoprogetto/, 'Myynd dentro il lab, che sta dentro H-Brain, che sta dentro Myynd')
  assert.throws(() => progetti.cambia(myynd.id, { genitore: 'pinventato' }), /non esiste/)
  assert.equal(progetti.trova(myynd.id)!.genitore, null, 'un padre rifiutato non si scrive')
  // un cambio che non tocca il padre lo lascia com'è
  assert.equal(progetti.cambia(lab.id, { note: 'x' })!.genitore, hbrain.id)
  assert.equal(progetti.cambia(lab.id, { genitore: '' })!.genitore, null)
  assert.equal(progetti.cambia(hbrain.id, { genitore: null })!.genitore, null)
  assert.ok(!progetti.perIlModello().includes('Fa parte di Myynd'), 'senza padre non si dice niente')
  progetti.cambia(hbrain.id, { genitore: myynd.id })
  assert.ok(progetti.perIlModello().includes('Fa parte di Myynd'), 'il modello deve sapere di cosa fa parte')
})

// — unire due progetti —

test('unire: righe, voci, domande, chat, memoria, figli e decisioni passano; il nome resta come altro nome; il primo sparisce', async () => {
  pulisci()
  const cfg = await import('./config.ts')
  const memoria = await import('./project-memory.ts')
  const ev = progetti.scrivi({ nome: 'Evermute', obiettivo: 'Portare la app sullo store', note: 'Nota di Evermute' })
  const ew = progetti.scrivi({ nome: 'everwave', obiettivo: 'Chiudere la beta', note: 'Nota di everwave' })
  progetti.cambia(ew.id, { alias: ['EW', 'wave'] })
  const figlio = progetti.scrivi({ nome: 'everwave docs' })
  progetti.cambia(figlio.id, { genitore: ew.id })
  progetti.cambia(ev.id, { genitore: ew.id })

  store.scriviCompito({ id: 'u-1', testo: 'Rivedere la beta', ordine: 'a', progetto: ew.id })
  store.scriviCompito({ id: 'u-2', testo: 'Altra cosa', ordine: 'b', progetto: ev.id })
  store.salvaFeed([{ tipo: 'Da leggere', titolo: 'Build fallita', testo: 'everwave', progetto: ew.id }])
  store.apriDomanda({ tema: 'unione-prova', testo: 'A che punto è la beta?', spunto: [], progetto: ew.id })
  store.creaChat('chat-unione', 'everwave', { progetto: ew.id, iniziativa: 'i1' })
  memoria.recordCurrentWork(ew.id, 'Sto chiudendo la beta')
  store.default.prepare(`INSERT INTO convinzioni (id, enunciato, genere, fiducia, origine, ambito, dal, creata) VALUES ('dec-ew', 'Beta chiusa a ottobre', 'esplicita', 1, 'mano', 'progetto:everwave', '2026-09-08', '2026-09-08')`).run()
  cfg.aggiorna({ ordineBlocchi: [ew.id, 'resto'] })

  assert.throws(() => progetti.unisci(ew.id, ew.id), /sé stesso/)
  assert.throws(() => progetti.unisci(ew.id, 'pinventato'), /non c’è/)
  assert.throws(() => progetti.unisci('pinventato', ev.id), /non c’è/)

  const r = progetti.unisci(ew.id, ev.id)
  // tre record di memoria: l'obiettivo e la nota scritti alla nascita, e il lavoro detto in chat
  assert.deepEqual(r.spostati, { compiti: 1, feed: 1, domande: 1, chat: 1, memoria: 3, figli: 1 })
  assert.equal(r.progetto.id, ev.id)
  assert.equal(progetti.trova(ew.id), null, 'il primo si cancella: il suo nome è un altro nome del secondo')
  assert.deepEqual(progetti.chiusi(), [], 'non è un chiuso: al modello non si dice che non è un progetto')

  const dopo = progetti.trova(ev.id)!
  assert.deepEqual(dopo.alias, ['everwave', 'EW', 'wave'])
  assert.equal(dopo.genitore, null, 'il secondo stava dentro il primo: adesso non sta dentro niente')
  assert.equal(dopo.obiettivo, 'Portare la app sullo store', 'l’obiettivo del secondo resta il suo')
  const giorno = new Date().toISOString().slice(0, 10)
  assert.equal(dopo.note, `Nota di Evermute\n${giorno}: unito il progetto «everwave». Obiettivo: Chiudere la beta\nNota di everwave`)
  assert.equal(progetti.trova(figlio.id)!.genitore, ev.id, 'i sottoprogetti del primo passano al secondo')

  assert.equal(store.compito('u-1')!.progetto, ev.id)
  assert.equal(store.compito('u-2')!.progetto, ev.id)
  assert.equal(store.elencoFeed().find(v => v.titolo === 'Build fallita')?.progetto, ev.id)
  assert.equal(store.domandaPerTema('unione-prova')!.progetto, ev.id)
  assert.equal(store.chatSulProgetto('chat-unione')!.progetto, ev.id)
  const ricordi = memoria.projectEvidence(ev.id)
  assert.ok(ricordi.some(x => x.value === 'Sto chiudendo la beta' && x.provenance === 'user-chat'), 'la memoria passa con la sua provenienza')
  assert.equal((store.default.prepare('SELECT ambito FROM convinzioni WHERE id = ?').get('dec-ew') as { ambito: string }).ambito, 'progetto:Evermute')
  assert.deepEqual(cfg.leggi().ordineBlocchi, [ev.id, 'resto'], 'il blocco resta dov’era, con il nome del secondo')

  // e da adesso «everwave» è Evermute, in chat come nel feed
  assert.equal(progetti.risolvi('everwave')?.id, ev.id)
  assert.equal(progetti.scrivi({ nome: 'everwave', origine: 'punto' }).id, ev.id, 'il punto non lo fa rinascere')
  assert.equal(progetti.progresso(ev.id).attivita.length, 2)
})

test('cancellare: la riga sparisce, le attività restano senza progetto, la memoria si dimentica, i figli restano senza padre', async () => {
  pulisci()
  const cfg = await import('./config.ts')
  const memoria = await import('./project-memory.ts')
  const prova = progetti.scrivi({ nome: 'Prova', obiettivo: 'Un doppione', note: 'Nota di prova' })
  const altro = progetti.scrivi({ nome: 'Altro' })
  const figlio = progetti.scrivi({ nome: 'Prova docs' })
  progetti.cambia(figlio.id, { genitore: prova.id })
  store.scriviCompito({ id: 'c-1', testo: 'Cosa da fare', ordine: 'a', progetto: prova.id })
  store.scriviCompito({ id: 'c-2', testo: 'Cosa dell’altro', ordine: 'b', progetto: altro.id })
  store.salvaFeed([{ tipo: 'Da leggere', titolo: 'Una voce', testo: 'prova', progetto: prova.id }])
  store.apriDomanda({ tema: 'cancella-prova', testo: 'A che punto è?', spunto: [], progetto: prova.id })
  store.creaChat('chat-prova', 'prova', { progetto: prova.id, iniziativa: 'i2' })
  memoria.recordCurrentWork(prova.id, 'Ci sto lavorando')
  store.default.prepare(`INSERT INTO convinzioni (id, enunciato, genere, fiducia, origine, ambito, dal, creata) VALUES ('dec-prova', 'Resta scritta', 'esplicita', 1, 'mano', 'progetto:Prova', '2026-09-08', '2026-09-08')`).run()
  cfg.aggiorna({ ordineBlocchi: [altro.id, prova.id, 'resto'] })

  assert.throws(() => progetti.elimina('pinventato'), /non c’è/)

  const r = progetti.elimina(prova.id)
  // tre record: obiettivo e nota alla nascita, e il lavoro detto in chat
  assert.deepEqual(r.staccati, { compiti: 1, feed: 1, domande: 1, chat: 1, memoria: 3, figli: 1 })
  assert.equal(progetti.trova(prova.id), null, 'la riga non c’è più')
  assert.deepEqual(progetti.chiusi(), [], 'non è un chiuso: cancellare non è «non è un progetto»')
  assert.equal(store.compito('c-1')!.progetto, null, 'l’attività resta, senza progetto')
  assert.equal(store.compito('c-2')!.progetto, altro.id, 'quelle degli altri non si toccano')
  assert.equal(store.elencoFeed().find(v => v.titolo === 'Una voce')?.progetto, null)
  assert.equal(store.domandaPerTema('cancella-prova')!.progetto, null)
  assert.equal(store.chatSulProgetto('chat-prova'), null, 'la chat non è più «sul progetto»')
  assert.equal(memoria.dimenticaProgetto(prova.id), 0, 'la memoria del progetto si è già dimenticata: non resta niente da togliere')
  assert.equal(progetti.trova(figlio.id)!.genitore, null, 'il figlio resta, senza padre')
  assert.equal((store.default.prepare('SELECT ambito FROM convinzioni WHERE id = ?').get('dec-prova') as { ambito: string }).ambito, 'progetto:Prova', 'le sue decisioni restano sue')
  assert.deepEqual(cfg.leggi().ordineBlocchi, [altro.id, 'resto'], 'il blocco esce dall’ordine della prima pagina')
  // e il nome può rinascere: cancellare non è chiudere
  assert.equal(progetti.scrivi({ nome: 'Prova', origine: 'punto' }).nome, 'Prova')
})

test('unire quando il secondo è già nell’ordine dei blocchi toglie il primo e basta', async () => {
  pulisci()
  const cfg = await import('./config.ts')
  const a = progetti.scrivi({ nome: 'Alfa' })
  const b = progetti.scrivi({ nome: 'Beta' })
  cfg.aggiorna({ ordineBlocchi: [b.id, 'resto', a.id] })
  progetti.unisci(a.id, b.id)
  assert.deepEqual(cfg.leggi().ordineBlocchi, [b.id, 'resto'])
  assert.deepEqual(progetti.trova(b.id)!.alias, ['Alfa'])
  assert.equal(progetti.trova(b.id)!.note, `${new Date().toISOString().slice(0, 10)}: unito il progetto «Alfa»`)
})

// — l'ordine dei blocchi —

test('l’ordine dei blocchi: id che esistono e «resto», una volta ciascuno, al massimo cinquanta; non un elenco è null', () => {
  pulisci()
  const a = progetti.scrivi({ nome: 'Alfa' })
  const b = progetti.scrivi({ nome: 'Beta' })
  assert.deepEqual(progetti.ordineBlocchiValido(['resto', b.id, 'pinventato', a.id, b.id, ' ', 'resto']), ['resto', b.id, a.id])
  assert.deepEqual(progetti.ordineBlocchiValido([]), [])
  assert.equal(progetti.ordineBlocchiValido('resto'), null)
  assert.equal(progetti.ordineBlocchiValido([a.id, 3]), null)
  assert.equal(progetti.ordineBlocchiValido(null), null)
  const tanti = Array.from({ length: 60 }, (_, i) => progetti.scrivi({ nome: `P${i}` }).id)
  assert.equal(progetti.ordineBlocchiValido(tanti)!.length, progetti.ORDINE_BLOCCHI_MAX)
})
