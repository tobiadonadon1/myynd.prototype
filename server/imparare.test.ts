// Le due cose che si scrivono da sole, e i due modi in cui potrebbero fare danno.
//
// Gli argomenti della rassegna e i cinque blocchi del ritratto adesso si
// riempiono da soli — da quello che apri ogni mattina, e da quello che Myynd ha
// imparato parlandoti. È esattamente il genere di funzione che, sbagliando, non
// dà nessun errore: continua a girare, e intanto fa una delle due cose che non
// deve fare mai.
//
//   · **riscrive quello che hai scritto tu.** È la regola che regge tutta la
//     faccenda, ed è la stessa di `ottimizza` sulle automazioni: una cosa che
//     ti riscrive addosso senza che tu l'abbia chiesto non è un aiuto, è una
//     cosa di cui non ti puoi fidare. Il giorno che quel campo si sovrascrive
//     da solo, nessuno lo compila più a mano.
//   · **spende un token per niente.** Girano in sottofondo, ogni sei ore, per
//     sempre. Un cancello che non chiude non si vede da nessuna parte: si vede
//     sulla bolletta a fine mese.
//
// Perciò qui non si prova il modello — si prova che **non venga chiamato**. La
// spia è un `chiediJSON` che, se qualcuno lo tocca, se ne accorge.
//
//   node --test server/imparare.test.ts

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-imparare-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const gusto = await import('./gusto.ts')
const memoria = await import('./memoria.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const IERI = new Date(Date.now() - 26 * 3600_000).toISOString()
const ADESSO = Date.now()

beforeEach(() => {
  cfg.scrivi({})
  for (const b of memoria.BLOCCHI_BASE) store.scordaBlocco(b.etichetta)
})

// — gli argomenti: di chi è quella riga —

test('quello che hai scritto tu non si tocca, e non costa niente', async () => {
  /*
   * Il caso che conta più di tutti. Se questo passa, quel campo si può
   * riempire a mano sapendo che resta com'è — e se non passasse, non lo
   * riempirebbe più nessuno.
   *
   * Che non chiami nemmeno il modello non è un dettaglio di efficienza: è la
   * prova che si è fermato *prima* di decidere, invece di decidere e poi
   * scartare il risultato. La seconda si rompe alla prima rifattorizzazione.
   */
  cfg.scrivi({ argomenti: 'mercati, politica estera', argomentiDaMe: false })
  assert.equal(await gusto.tieniAggiornati(ADESSO), null)
  assert.equal(cfg.leggi().argomenti, 'mercati, politica estera')
})

test('senza abbastanza gesti non conclude niente', async () => {
  // due letture non sono un gusto, sono due letture. Costruirci sopra un
  // profilo vuol dire scrivere in quel campo l'ultima cosa letta per caso
  cfg.scrivi({ argomenti: '' })
  assert.equal(await gusto.tieniAggiornati(ADESSO), null)
  assert.equal(cfg.leggi().argomenti ?? '', '')
})

test('se l’ha scritto lui, non ci riprova prima del giorno dopo', async () => {
  /*
   * Il cancello del tempo. Questo giro sta agganciato a un timer che scatta
   * ogni sei ore: senza, riscriverebbe la stessa riga quattro volte al giorno,
   * per sempre, chiamando il modello ogni volta.
   */
  cfg.scrivi({
    argomenti: 'intelligenza artificiale',
    argomentiDaMe: true,
    imparato: { argomenti: new Date(ADESSO - 3600_000).toISOString() }
  })
  assert.equal(await gusto.tieniAggiornati(ADESSO), null)
})

test('passato un giorno il cancello si riapre', async () => {
  // arriva fino a guardare il gusto, e lì si ferma perché non c'è materiale:
  // quello che conta è che non si sia fermato *prima*, sul tempo
  cfg.scrivi({
    argomenti: 'intelligenza artificiale',
    argomentiDaMe: true,
    imparato: { argomenti: IERI }
  })
  assert.equal(await gusto.tieniAggiornati(ADESSO), null, 'senza gusto non scrive comunque')
  // e la riga di prima è ancora lì: fermarsi non vuol dire cancellare
  assert.equal(cfg.leggi().argomenti, 'intelligenza artificiale')
})

// — il ritratto: chi ha scritto ogni blocco —

test('un blocco scritto a mano non si dichiara di Myynd', () => {
  /*
   * `daMe` è la mezza riga che dice chi ha parlato per ultimo, e il suo valore
   * predefinito è `null` apposta: chi scrive senza dirlo sta scrivendo per
   * conto di una persona — è la rotta dell'interfaccia. Se il predefinito
   * fosse l'opposto, ogni riga scritta a mano comparirebbe firmata da Myynd.
   */
  store.scriviBlocco({
    etichetta: 'come_scrivo',
    descrizione: 'prova',
    valore: 'Chiudo sempre con «Un caro saluto».'
  })
  const b = store.blocchi().find(x => x.etichetta === 'come_scrivo')
  assert.equal(b?.daMe ?? null, null)
})

test('un blocco consolidato porta la data e si vede', () => {
  const quando = new Date(ADESSO).toISOString()
  store.scriviBlocco({
    etichetta: 'come_decido',
    descrizione: 'prova',
    valore: 'Guarda il margine prima del volume.',
    daMe: quando
  })
  assert.equal(store.blocchi().find(x => x.etichetta === 'come_decido')?.daMe, quando)
})

test('riscriverlo a mano se lo riprende', () => {
  // il gesto più importante della schermata: correggere una riga vuol dire
  // che da quel momento è tua, e la firma di Myynd deve sparire
  store.scriviBlocco({ etichetta: 'chi_conta', descrizione: 'p', valore: 'sua', daMe: new Date().toISOString() })
  store.scriviBlocco({ etichetta: 'chi_conta', descrizione: 'p', valore: 'mia' })
  const b = store.blocchi().find(x => x.etichetta === 'chi_conta')
  assert.equal(b?.valore, 'mia')
  assert.equal(b?.daMe ?? null, null, 'la firma di Myynd è rimasta su una riga scritta a mano')
})

// — i cancelli del consolidamento —

test('senza convinzioni non si scomoda nessun modello', async () => {
  cfg.scrivi({})
  const e = await memoria.consolida(false, ADESSO)
  assert.deepEqual(e.blocchi, [])
  assert.equal(e.guardate, 0)
})

test('appena consolidato non lo rifà', async () => {
  cfg.scrivi({ imparato: { memoria: new Date(ADESSO - 3600_000).toISOString() } })
  for (let i = 0; i < 5; i++) {
    store.ricorda({
      enunciato: `una cosa numero ${i}`, ambito: 'persona', genere: 'esplicita',
      fiducia: 0.9, prova: null, origine: 'prova'
    })
  }
  const e = await memoria.consolida(false, ADESSO)
  assert.deepEqual(e.blocchi, [], 'ha rifatto lo stesso lavoro un’ora dopo')
})

test('senza convinzioni nuove non rifà lo stesso lavoro sullo stesso materiale', async () => {
  /*
   * Il cancello che conta di più per la bolletta. Le convinzioni ci sono e il
   * tempo è passato, ma non è successo niente di nuovo: rileggere le stesse
   * frasi per riscrivere gli stessi cinque blocchi è cinque chiamate al modello
   * per un risultato identico, ogni sei ore, all'infinito.
   */
  store.ricorda({
    enunciato: 'una cosa vecchia', ambito: 'persona', genere: 'esplicita',
    fiducia: 0.9, prova: null, origine: 'prova'
  })
  // l'ultima consolidazione è *dopo* quella convinzione: niente di nuovo
  cfg.scrivi({ imparato: { memoria: new Date(Date.now() + 1000).toISOString() } })
  const e = await memoria.consolida(false, ADESSO)
  assert.deepEqual(e.blocchi, [])
})

test('le due date non si pestano i piedi', () => {
  /*
   * Erano una sola, e sarebbe stato un difetto invisibile: i due giri hanno
   * ritmi diversi, e il primo che gira avrebbe zittito l'altro fino al giorno
   * dopo. Niente si rompe — semplicemente uno dei due non succede quasi mai.
   */
  cfg.aggiorna({ imparato: { argomenti: IERI } })
  cfg.aggiorna({ imparato: { ...cfg.leggi().imparato, memoria: IERI } })
  const i = cfg.leggi().imparato
  assert.equal(i?.argomenti, IERI)
  assert.equal(i?.memoria, IERI)
})
