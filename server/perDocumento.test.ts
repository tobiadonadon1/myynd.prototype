// Una riga per ogni documento.
//
// «Risposte da dare» scriveva una riga sola con otto titoli in nota, e a chi
// l'aveva chiesta serviva il contrario: una riga per ogni mail che aspetta una
// risposta, con la risposta già scritta. Quello che si prova qui è il pezzo che
// sta attorno al modello, non il modello — che si sostituisce, come sempre:
//
//   · da N documenti scelti nascono N righe, ognuna col suo documento;
//   · la posta inviata non è mai fra i candidati di «quando arriva»;
//   · un documento che ha già la sua riga — viva, chiusa o buttata — non ne
//     riceve un'altra, e la guardia è per documento, non per ricetta;
//   · oltre il tetto del giorno le righe nascono lo stesso, senza bozza;
//   · la bozza parte dal documento della riga.
//
//   node --test server/perDocumento.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-perdoc-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
// quelle del pacchetto accese, e in italiano: qui si guarda anche la ricetta
// di serie, e i testi che le righe portano in lista
writeFileSync(join(CASA, '.myynd', 'config.json'),
  JSON.stringify({ diSerie: true, lingua: 'it' }), { mode: 0o600 })

const store = await import('./store.ts')
const auto = await import('./automazioni.ts')
const compiti = await import('./compiti.ts')

after(() => {
  auto.perProva(null)
  compiti.perProva(null)
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

// — il materiale: tre mail arrivate e una mandata —

const ADESSO = new Date().toISOString()
const POSTA = [
  {
    id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'Preventivo di marzo',
    corpo: 'Buongiorno, mi confermate il preventivo di marzo? Grazie, Rossi',
    autore: 'Mario Rossi <rossi@example.com>', quando: ADESSO, filo: 'f1'
  },
  {
    id: 'posta:INBOX:2', fonte: 'posta', tipo: 'email', titolo: 'Appuntamento giovedì',
    corpo: 'Ci vediamo giovedì alle 10 in sede? Bianchi',
    autore: 'Anna Bianchi <bianchi@example.com>', quando: ADESSO, filo: 'f2'
  },
  {
    id: 'posta:INBOX:3', fonte: 'posta', tipo: 'email', titolo: 'Newsletter di settembre',
    corpo: 'Le novità del mese. Per non ricevere più queste mail, disiscriviti qui.',
    autore: 'news@shop.example', quando: ADESSO, filo: 'f3'
  },
  {
    id: 'posta:Sent:1', fonte: 'posta', tipo: 'email', titolo: 'Re: Preventivo di marzo',
    corpo: 'Grazie, le rispondo domani con il preventivo aggiornato.',
    autore: 'io@example.com', quando: ADESSO, filo: 'f1', inviato: true
  }
]

const RICETTA = {
  id: 'per-doc', nome: 'Risposte in prova', spiega: 'Serve solo ai test.',
  quando: { quandoArriva: true as const },
  guarda: { soloNuovi: true, limite: 8 },
  fai: 'Scegli chi aspetta una risposta da te.',
  metti: { inLista: 'oggi' as const, modo: 'io' as const, perDocumento: true },
  attrezzi: ['posta.leggi'],
  en: { nome: 'Test replies', spiega: 'Only the tests use it.', fai: 'Pick who is waiting on you.' }
}

/** La stessa, ma con una ricerca: trova sempre gli stessi documenti, giro dopo giro. */
const CON_RICERCA = {
  ...RICETTA,
  id: 'per-doc-cerca',
  quando: { ogni: 'giorno' as const, ora: 9 },
  guarda: { cerca: 'preventivo giovedì fattura', limite: 8 },
  en: { ...RICETTA.en, cerca: 'quote thursday invoice' }
}

/** Le righe vive nate da una ricetta. */
const righe = (id: string) => store.elencoCompiti().filter(c => c.origine === `auto:${id}`)

// — il modello finto —

type Visto = { id: string; da: string; titolo: string }
let chiamate = 0

/**
 * Il modello che smista: riceve i candidati e torna le righe che sceglie.
 *
 * Guarda anche il lavoro, che dev'essere quello economico: uno smistamento
 * che passa dal modello grande dopo ogni lettura della posta è la voce di
 * spesa che il tetto delle bozze esiste per evitare.
 */
function ilModelloSceglie(scelta: (docs: Visto[], istruzione: string) => { doc: string; testo: string }[]) {
  auto.perProva({
    chiediJSON: async o => {
      chiamate++
      assert.equal(o.lavoro, 'smistamento', 'lo smistamento deve passare dal lavoro economico')
      const docs = JSON.parse(o.messages[0].content) as Visto[]
      return { righe: scelta(docs, o.system) }
    }
  })
}

/** Le mani di `compiti`, che non devono chiamare nessun modello. */
type Svolgi = NonNullable<NonNullable<Parameters<typeof compiti.perProva>[0]>['svolgi']>
function leBozzeLeScrive(svolgi: Svolgi) {
  compiti.perProva({
    svolgi,
    chiedeAiuto: async () => ({ chiede: false, manca: [] }),
    domandeDaFare: async () => []
  })
}

// — le prove —

test('da N documenti scelti nascono N righe, e la posta inviata non è fra i candidati', async () => {
  store.salvaDocumenti(POSTA)
  let visti: Visto[] = []
  ilModelloSceglie(docs => {
    visti = docs
    // la newsletter non merita niente: è il «nel dubbio non scegliere»
    return docs.filter(d => d.id !== 'posta:INBOX:3').map(d => ({ doc: d.id, testo: `Rispondere a ${d.da}` }))
  })

  assert.equal(await auto.fai(RICETTA), 'fatta')

  // al modello sono arrivate le tre mail in arrivo, e non quella mandata:
  // un'automazione che prepara risposte alle proprie email è la lista rovinata
  assert.deepEqual(visti.map(d => d.id).sort(), ['posta:INBOX:1', 'posta:INBOX:2', 'posta:INBOX:3'])

  const r = righe('per-doc')
  assert.equal(r.length, 2, 'due documenti scelti, e non due righe')
  const rossi = r.find(c => c.doc === 'posta:INBOX:1')
  assert.ok(rossi, 'la riga di Rossi non porta il suo documento')
  assert.equal(rossi.testo, 'Rispondere a Mario Rossi <rossi@example.com>')
  assert.ok(rossi.nota?.startsWith(RICETTA.fai), 'la nota non comincia dall\'istruzione: la lingua non si potrà cambiare')
  assert.ok(rossi.nota?.includes('Preventivo di marzo'), 'la nota non dice quale documento')
  assert.deepEqual(rossi.attrezzi?.nomi, ['posta.leggi'], 'il permesso non viaggia con la riga')
  assert.equal(rossi.quando, 'oggi')
  assert.ok(r.some(c => c.doc === 'posta:INBOX:2'))
})

test('una riga ancora aperta non ferma quelle dei documenti arrivati dopo', async () => {
  // le due di prima sono ancora lì aperte. Con la guardia per ricetta questo
  // giro tornava «gia» e Verdi restava senza riga finché Rossi non veniva chiuso
  store.salvaDocumenti([{
    id: 'posta:INBOX:4', fonte: 'posta', tipo: 'email', titolo: 'Fattura 12',
    corpo: 'Mi dite se la fattura 12 è corretta prima che la paghi? Verdi',
    autore: 'Luca Verdi <verdi@example.com>', quando: new Date().toISOString(), filo: 'f4'
  }])
  ilModelloSceglie(docs => docs.filter(d => d.id !== 'posta:INBOX:3').map(d => ({ doc: d.id, testo: `Rispondere a ${d.da}` })))

  assert.equal(await auto.fai(RICETTA), 'fatta')
  const r = righe('per-doc')
  assert.equal(r.length, 3)
  assert.equal(r.filter(c => c.doc === 'posta:INBOX:4').length, 1)
  // e quelle di prima non sono raddoppiate
  assert.equal(r.filter(c => c.doc === 'posta:INBOX:1').length, 1)
  assert.equal(store.statoAutomazione('per-doc')?.esito, 'fatta')
})

test('un documento che ha già la sua riga non ne riceve una seconda: né viva, né chiusa, né buttata', async () => {
  ilModelloSceglie(docs => docs.map(d => ({ doc: d.id, testo: `Rispondere su ${d.titolo}` })))
  assert.equal(await auto.fai(CON_RICERCA), 'fatta')
  const prime = righe('per-doc-cerca')
  assert.ok(prime.length >= 2, 'la ricerca doveva trovare almeno due documenti')

  // lo stesso giro, subito dopo: i documenti sono gli stessi, hanno tutti la
  // loro riga, e non si chiama nemmeno il modello per non dire niente
  chiamate = 0
  assert.equal(await auto.fai(CON_RICERCA), 'niente')
  assert.equal(chiamate, 0, 'ha chiamato il modello su documenti che avevano già la riga')
  assert.equal(righe('per-doc-cerca').length, prime.length)

  // chiusa una e buttata un'altra, quelle mail non tornano nuove
  store.cambiaStatoCompito(prime[0].id, 'fatto')
  store.scordaCompito(prime[1].id)
  assert.equal(await auto.fai(CON_RICERCA), 'niente')
  assert.equal(chiamate, 0)
  assert.equal(righe('per-doc-cerca').length, prime.length - 2)
  // e non è un guasto: è «girata, niente da fare»
  assert.equal(store.statoAutomazione('per-doc-cerca')?.esito, 'niente')
  assert.equal(store.statoAutomazione('per-doc-cerca')?.guaio, null)
})

test('la guardia è per ricetta: un\'altra ricetta può avere la sua riga sullo stesso documento', async () => {
  // «Pagare la fattura 12» e «Rispondere a Verdi» sono due cose da fare sulla
  // stessa mail: chi le ha scritte le ha scritte apposta
  const ALTRA = { ...CON_RICERCA, id: 'per-doc-altra', fai: 'Scegli le fatture da pagare.' }
  ilModelloSceglie(docs => docs.map(d => ({ doc: d.id, testo: `Pagare ${d.titolo}` })))
  assert.equal(await auto.fai(ALTRA), 'fatta')
  assert.ok(righe('per-doc-altra').length >= 2)
})

test('oltre il tetto del giorno le righe nascono lo stesso, senza bozza', async () => {
  leBozzeLeScrive(async () => ({ testo: 'Gentile cliente, ecco la risposta.', fonti: [] }))
  const BOZZA = {
    ...CON_RICERCA, id: 'per-doc-bozza',
    metti: { inLista: 'oggi' as const, modo: 'bozza' as const, perDocumento: true }
  }
  const oggi = new Date()
  // ne resta una sola sotto il tetto
  for (let i = 0; i < auto.BOZZE_AL_GIORNO - 1; i++) store.segnaBozza(BOZZA.id, auto.giornoDi(oggi))
  ilModelloSceglie(docs => docs.slice(0, 3).map(d => ({ doc: d.id, testo: `Rispondere su ${d.titolo}` })))

  // non «saltata»: le righe ci sono tutte, è solo la bozza che aspetta domani
  assert.equal(await auto.fai(BOZZA, { adesso: oggi }), 'fatta')
  const r = righe('per-doc-bozza')
  assert.equal(r.length, 3, 'oltre il tetto ha perso delle righe')
  assert.equal(r.filter(c => c.modo === 'bozza').length, 1, 'ha affidato più righe di quante il tetto permetta')
  assert.equal(r.filter(c => c.modo === 'io' && c.stato === 'aperto').length, 2,
    'le righe oltre il tetto dovevano restare aperte, da fare a mano o da riaffidare')
  assert.equal(auto.bozzeOggi(store.statoAutomazione(BOZZA.id), oggi), auto.BOZZE_AL_GIORNO)

  // a mano il tetto non c'è: un dito che preme non è una spesa ricorrente
  const A_MANO = { ...BOZZA, id: 'per-doc-mano' }
  for (let i = 0; i < auto.BOZZE_AL_GIORNO; i++) store.segnaBozza(A_MANO.id, auto.giornoDi(oggi))
  ilModelloSceglie(docs => docs.slice(0, 2).map(d => ({ doc: d.id, testo: `Rispondere su ${d.titolo}` })))
  assert.equal(await auto.fai(A_MANO, { aMano: true, adesso: oggi }), 'fatta')
  assert.equal(righe('per-doc-mano').filter(c => c.modo === 'bozza').length, 2)
})

test('la bozza parte dal documento della riga', async () => {
  let ricevuto: string | null | undefined = undefined
  leBozzeLeScrive(async (_c, _n, _m, _a, _cart, _p, doc) => {
    ricevuto = doc
    return { testo: 'Gentile Rossi, confermo il preventivo.', fonti: [] }
  })
  const riga = righe('per-doc').find(c => c.doc === 'posta:INBOX:1')
  assert.ok(riga, 'la premessa del test non regge')

  const pronta = new Promise<void>((risolvi, rifiuta) => {
    const t = setTimeout(() => rifiuta(new Error('nessun «pronto» entro tre secondi')), 3000)
    const smetti = compiti.ascolta(e => {
      if (e.fase !== 'pronto' || e.id !== riga.id) return
      clearTimeout(t); smetti(); risolvi()
    }, null)
  })
  compiti.affida(riga.id, 'bozza')
  await pronta
  assert.equal(ricevuto, 'posta:INBOX:1', 'la bozza è partita da una ricerca invece che dalla mail di Rossi')
})

test('«perDocumento» si controlla come tutto il resto', () => {
  const MIA: Record<string, unknown> = {
    id: 'pd', nome: 'Prova', spiega: 'Una riga.',
    quando: { ogni: 'giorno', ora: 7 }, guarda: { soloNuovi: true },
    fai: 'Guarda e dimmi.', metti: { inLista: 'oggi', modo: 'io' },
    en: { nome: 'Test', spiega: 'One line.', fai: 'Look and tell me.' }
  }
  assert.throws(() => auto.scrivi({ ...MIA, id: 'pd-storta', metti: { inLista: 'oggi', perDocumento: 'sì' } }),
    /perDocumento/, 'ha accettato un valore che non è né vero né falso')
  assert.throws(() => auto.scrivi({ ...MIA, id: 'pd-proponi', proponi: 'posta.archivia', metti: { inLista: 'poi', perDocumento: true } }),
    /perDocumento/, 'una riga per documento sopra a una proposta sono due modi di dire la stessa cosa')

  const ok = auto.scrivi({ ...MIA, id: 'pd-ok', metti: { inLista: 'oggi', modo: 'bozza', perDocumento: true } })
  assert.equal(ok.metti.perDocumento, true)
  // e dalla schermata si spegne mandando `metti` senza il campo
  assert.equal(auto.cambia('pd-ok', { metti: { inLista: 'oggi', modo: 'bozza' } }).metti.perDocumento, undefined)
  auto.butta('pd-ok')
})

test('«Risposte da dare» è di serie e valida, e «primo contatto» non c\'è più', () => {
  auto.scordaLeRicette()
  const r = auto.ricette()
  const rd = r.find(a => a.id === 'risposte-da-dare')
  assert.ok(rd, 'la ricetta di serie è stata scartata')
  assert.equal(rd.metti.perDocumento, true)
  assert.equal(rd.metti.modo, 'bozza')
  assert.equal(rd.metti.inLista, 'oggi')
  assert.deepEqual(rd.quando, { quandoArriva: true })
  assert.equal(rd.guarda.soloNuovi, true)
  assert.deepEqual(rd.attrezzi, ['posta.leggi'])
  assert.ok(rd.en.nome && rd.en.fai)
  // il primo contatto è un caso della risposta da dare: due ricette sullo
  // stesso arrivo sarebbero due bozze per la stessa mail
  assert.ok(!r.some(a => a.id === 'primo-contatto'))
})

test('«quando arriva» la fa girare, e nella lingua dell\'installazione', async () => {
  const scritta = auto.scrivi({
    ...RICETTA, id: 'per-doc-arrivo', fai: 'Scegli chi chiede un appuntamento.',
    en: { ...RICETTA.en, fai: 'Pick who asks for a meeting.' }
  })
  store.salvaDocumenti([{
    id: 'posta:INBOX:5', fonte: 'posta', tipo: 'email', titolo: 'Ci vediamo?',
    corpo: 'Possiamo sentirci martedì? Neri', autore: 'Neri <neri@example.com>',
    quando: new Date().toISOString(), filo: 'f5'
  }])
  // il modello finto risponde solo a questa ricetta: le altre «quando arriva»
  // di serie girano pure, e per loro non sceglie niente
  ilModelloSceglie((docs, istruzione) =>
    istruzione.includes(scritta.fai) ? docs.map(d => ({ doc: d.id, testo: `Rispondere a ${d.da}` })) : [])
  await auto.quandoArriva()
  const r = righe('per-doc-arrivo')
  assert.ok(r.some(c => c.doc === 'posta:INBOX:5'), 'la riga di Neri non è nata')
  auto.butta('per-doc-arrivo')
})

test('quello che sta già in lista si riconosce, così il feed non lo ripropone', () => {
  const s = store.docsConRiga(['posta:INBOX:1', 'posta:INBOX:99', 'niente'])
  assert.ok(s.has('posta:INBOX:1'))
  assert.ok(!s.has('posta:INBOX:99'))
  assert.equal(s.size, 1)
  // con l'origine si guarda solo quella
  assert.equal(store.docsConRiga(['posta:INBOX:1'], 'auto:nessuna').size, 0)
  assert.equal(store.docsConRiga(['posta:INBOX:1'], 'auto:per-doc').size, 1)
  // e un elenco vuoto non fa nemmeno la query
  assert.equal(store.docsConRiga([]).size, 0)
})

test('per il feed una riga chiusa da mesi non tiene fuori il documento per sempre', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const ADESSO = new Date().toISOString()
  store.salvaDocumenti([{
    id: 'desktop:/vivo/contratto.md', fonte: 'desktop', tipo: 'md', titolo: 'Contratto',
    corpo: 'Il contratto, che intanto è cambiato.', autore: null, quando: ADESSO, gruppo: 'documenti'
  }])
  store.scriviCompito({ id: 'riga-vecchia', testo: 'Rileggere il contratto', nota: null, quando: 'oggi', ordine: 'a', origine: 'mano', doc: 'desktop:/vivo/contratto.md' })
  // viva: conta, con o senza finestra
  assert.ok(store.docsConRiga(['desktop:/vivo/contratto.md'], undefined, 30).has('desktop:/vivo/contratto.md'))
  store.cambiaStatoCompito('riga-vecchia', 'fatto', 'Letto.')
  // chiusa adesso: conta ancora nella finestra
  assert.ok(store.docsConRiga(['desktop:/vivo/contratto.md'], undefined, 30).has('desktop:/vivo/contratto.md'))
  // chiusa quattro mesi fa: per il feed non conta più, per le automazioni sì
  const db = new DatabaseSync(join(CASA, '.myynd', 'mente.db'))
  db.prepare('UPDATE compiti SET chiuso = ?, aggiornato = ? WHERE id = ?')
    .run('2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', 'riga-vecchia')
  db.close()
  assert.ok(!store.docsConRiga(['desktop:/vivo/contratto.md'], undefined, 30).has('desktop:/vivo/contratto.md'))
  assert.ok(store.docsConRiga(['desktop:/vivo/contratto.md']).has('desktop:/vivo/contratto.md'))
})
