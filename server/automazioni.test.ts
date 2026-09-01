// Le automazioni.
//
// Un'automazione gira quando non la guarda nessuno, e questo cambia cosa vuol
// dire sbagliare. Un errore in chat si vede e si corregge; un errore qui scrive
// una riga alle nove di mattina ogni mattina, e la si scopre dopo una settimana
// con la lista piena della stessa cosa.
//
// Perciò le tre cose provate qui sono, in ordine: che una ricetta scritta male
// venga *rifiutata* invece che eseguita a metà; che l'orologio non la faccia
// partire due volte; e che non ne nasca una seconda finché la prima è ancora lì
// da guardare.
//
//   node --test server/*.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-auto-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const store = await import('./store.ts')
const auto = await import('./automazioni.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const RICETTA = {
  id: 'prova', nome: 'Una prova', spiega: 'Serve solo ai test.',
  quando: { ogni: 'giorno' as const, ora: 9 },
  guarda: { cerca: 'preventivo' },
  fai: 'Fai qualcosa.',
  metti: { inLista: 'oggi' as const, modo: 'io' as const },
  en: { nome: 'A test', spiega: 'Only the tests use it.', fai: 'Do something.', cerca: 'quote' }
}

// — quando tocca —

const alle = (giorno: number, ora: number) => {
  // 2026-08-31 è un lunedì: da lì si conta
  const d = new Date(2026, 7, 31 + giorno, ora, 0, 0)
  return d
}

test('un\'automazione giornaliera non parte prima della sua ora', () => {
  assert.equal(auto.tocca(RICETTA, null, alle(0, 8)), false)
  assert.equal(auto.tocca(RICETTA, null, alle(0, 9)), true)
})

test('e non parte due volte nello stesso giorno', () => {
  const adesso = alle(0, 10)
  const gia = { id: 'prova', spenta: 0, ultima: alle(0, 9).toISOString(), quante: 1, esito: 'fatta', guaio: null }
  assert.equal(auto.tocca(RICETTA, gia, adesso), false, 'è ripartita nello stesso giorno')
  // il giorno dopo sì
  assert.equal(auto.tocca(RICETTA, gia, alle(1, 9)), true)
})

test('una settimanale aspetta il suo giorno', () => {
  const r = { ...RICETTA, quando: { ogni: 'settimana' as const, giorno: 3, ora: 10 } }
  // lunedì, alle 10: non è il suo giorno
  assert.equal(auto.tocca(r, null, alle(0, 10)), false)
  // mercoledì, alle 9: è il suo giorno ma non la sua ora
  assert.equal(auto.tocca(r, null, alle(2, 9)), false)
  // mercoledì, alle 10
  assert.equal(auto.tocca(r, null, alle(2, 10)), true)
})

test('spenta non parte mai', () => {
  assert.equal(auto.tocca({ ...RICETTA, spenta: true }, null, alle(0, 12)), false)
  const spentaQui = { id: 'prova', spenta: 1, ultima: null, quante: 0, esito: null, guaio: null }
  assert.equal(auto.tocca(RICETTA, spentaQui, alle(0, 12)), false,
    'spenta su questa macchina, ma è partita lo stesso')
})

test('quella che aspetta l\'arrivo non la fa partire l\'orologio', () => {
  // la chiama la rilettura delle fonti, non il giro dei quarti d'ora: se la
  // chiamassero tutt'e due partirebbe due volte per lo stesso arrivo
  const r = { ...RICETTA, quando: { quandoArriva: true as const } }
  assert.equal(auto.tocca(r, null, alle(0, 12)), false)
})

// — che una ricetta rotta non giri —

/** Scrive una ricetta nella cartella comune e prova a rileggerle tutte. */
function conRicetta(nome: string, contenuto: unknown): string[] {
  const dove = join(process.cwd(), 'automazioni', '_comuni', nome)
  writeFileSync(dove, JSON.stringify(contenuto, null, 2))
  auto.scordaLeRicette()
  const ids = auto.ricette().map(a => a.id)
  rmSync(dove, { force: true })
  auto.scordaLeRicette()
  return ids
}

test('nessuna ricetta di serie viene scartata', () => {
  // Non «almeno sette»: *tutte*. Una ricetta rifiutata si vede solo nel
  // terminale, e chi la scrive per un cliente se ne accorge quando il cliente
  // chiede perché quell'automazione non è mai comparsa.
  const dentro = readdirSync(join(import.meta.dirname, '..', 'automazioni', '_comuni'))
    .filter(f => f.endsWith('.json'))
  auto.scordaLeRicette()
  const r = auto.ricette()
  assert.equal(r.length, dentro.length,
    `nella cartella ce ne sono ${dentro.length} e ne carica ${r.length}: una è stata rifiutata`)
  for (const a of r) {
    assert.ok(a.id && a.nome && a.spiega && a.fai, `«${a.id}» è incompleta`)
  }
})

test('una proposta che il motore non sa fare fa scartare la ricetta', () => {
  const ids = conRicetta('zz-proposta.json', { ...RICETTA, id: 'strana', proponi: 'posta.cancella' })
  assert.ok(!ids.includes('strana'), 'ha accettato un verbo che il motore non conosce')
})

// — le due lingue —
//
// Non è una prova di stile. Il nome di una ricetta finisce dentro il compito
// che nasce stanotte, e le parole di `guarda.cerca` sono quelle con cui fruga
// l'indice: in un'installazione inglese, cercare in italiano non trova poco,
// non trova niente. Sono i due modi in cui questa app tornava metà in italiano.

test('ogni ricetta di serie è scritta in tutte e due le lingue', () => {
  auto.scordaLeRicette()
  for (const a of auto.ricette()) {
    assert.ok(a.en?.nome && a.en?.spiega && a.en?.fai, `«${a.id}» non ha l'inglese`)
    assert.equal(!!a.guarda.cerca, !!a.en.cerca, `«${a.id}»: la ricerca è tradotta a metà`)
  }
})

test('in inglese cambiano il nome, la spiegazione e le parole della ricerca', () => {
  auto.scordaLeRicette()
  const a = auto.ricette().find(x => x.id === 'sollecito-preventivi')!
  const en = auto.nella(a, 'en')
  assert.equal(en.nome, a.en.nome)
  assert.equal(en.spiega, a.en.spiega)
  assert.equal(en.fai, a.en.fai)
  assert.equal(en.guarda.cerca, a.en.cerca)
  // e l'italiano resta quello che è
  assert.equal(auto.nella(a, 'it').nome, a.nome)
})

test('cambiando lingua cambiano anche le righe già in lista', async () => {
  store.salvaDocumenti([{
    id: 'd-lingua', fonte: 'posta', tipo: 'email', titolo: 'Preventivo 12',
    corpo: 'preventivo mandato', quando: new Date().toISOString()
  }])
  auto.scordaLeRicette()
  const r = auto.ricette().find(x => x.id === 'sollecito-preventivi')!
  await auto.fai(r)

  const riga = store.elencoCompiti().find(c => c.origine === 'auto:sollecito-preventivi')
  assert.ok(riga, 'l\'automazione non ha scritto niente')
  assert.equal(riga!.testo, r.nome)

  assert.equal(auto.rinominaInLista('en'), 1)
  assert.equal(store.compito(riga!.id)!.testo, r.en.nome)
  assert.ok(store.compito(riga!.id)!.nota!.startsWith(r.en.fai), 'la nota è rimasta in italiano')

  // e una riga a cui hai messo mano resta tua: torna italiana la nota, che è
  // testo dell'automazione, e non il titolo, che ormai è tuo
  store.cambiaCompito(riga!.id, { testo: 'La riscrivo io' })
  auto.rinominaInLista('it')
  assert.equal(store.compito(riga!.id)!.testo, 'La riscrivo io')
  assert.ok(store.compito(riga!.id)!.nota!.startsWith(r.fai))
  // e quando non c'è più niente da rimettere a posto, non tocca niente
  assert.equal(auto.rinominaInLista('it'), 0)
  store.scordaCompito(riga!.id)
})

test('una ricetta senza inglese viene scartata', () => {
  const { en: _via, ...senza } = { ...RICETTA, id: 'muta' }
  const ids = conRicetta('zz-muta.json', senza)
  assert.ok(!ids.includes('muta'), 'ha accettato una ricetta che sa parlare una lingua sola')
})

test('una ricerca tradotta a metà viene scartata', () => {
  const ids = conRicetta('zz-mezza.json', {
    ...RICETTA, id: 'mezza', en: { ...RICETTA.en, cerca: undefined }
  })
  assert.ok(!ids.includes('mezza'), 'ha accettato una ricerca che in inglese non trova niente')
})

test('un campo che il motore non conosce fa scartare la ricetta', () => {
  // È il caso che conta più di tutti. Una ricetta accettata a metà girerebbe
  // ogni giorno facendo *quasi* quello che c'era scritto, e nessuno se ne
  // accorgerebbe: il campo di troppo verrebbe semplicemente ignorato.
  const ids = conRicetta('zz-rotta.json', { ...RICETTA, id: 'rotta', mandaEmail: true })
  assert.ok(!ids.includes('rotta'), 'ha accettato una ricetta con un campo che non sa gestire')
})

test('un\'ora impossibile fa scartare la ricetta', () => {
  const ids = conRicetta('zz-ora.json', { ...RICETTA, id: 'oraStrana', quando: { ogni: 'giorno', ora: 99 } })
  assert.ok(!ids.includes('oraStrana'))
})

test('una ricetta senza «fai» fa scartare la ricetta', () => {
  const ids = conRicetta('zz-vuota.json', { ...RICETTA, id: 'vuota', fai: '   ' })
  assert.ok(!ids.includes('vuota'))
})

test('una ricetta che non guarda niente fa scartare la ricetta', () => {
  const ids = conRicetta('zz-cieca.json', { ...RICETTA, id: 'cieca', guarda: {} })
  assert.ok(!ids.includes('cieca'))
})

// — che non riempia la lista —

test('non ne nasce una seconda finché la prima è ancora lì', async () => {
  store.salvaDocumenti([{
    id: 'd-preventivo', fonte: 'desktop', tipo: 'file', titolo: 'Preventivo Rossi',
    corpo: 'Preventivo per impianto base, 890 euro, inviato il 12 agosto.',
    autore: null, percorso: '/p', quando: '2026-08-12T09:00:00.000Z', gruppo: 'documenti'
  }])

  const primo = await auto.fai(RICETTA)
  assert.equal(primo, 'fatta', 'la prima volta doveva scrivere una riga')
  const dopo = store.elencoCompiti().filter(c => c.origine === 'auto:prova')
  assert.equal(dopo.length, 1)

  // la stessa automazione, subito dopo: la riga di prima è ancora aperta
  const secondo = await auto.fai(RICETTA)
  assert.equal(secondo, 'gia', 'ha scritto una seconda riga sopra alla prima')
  assert.equal(store.elencoCompiti().filter(c => c.origine === 'auto:prova').length, 1)
})

test('chiusa la prima, la volta dopo può ripartire', async () => {
  const riga = store.elencoCompiti().find(c => c.origine === 'auto:prova')
  assert.ok(riga, 'la premessa del test non regge')
  store.cambiaStatoCompito(riga.id, 'fatto')

  const ancora = await auto.fai(RICETTA)
  assert.equal(ancora, 'fatta', 'chiusa quella di prima, doveva poterne scrivere una nuova')
})

test('senza niente da guardare non scrive niente, e non è un errore', async () => {
  const r = { ...RICETTA, id: 'vuoto', guarda: { cerca: 'parolachenonesisteinnessundocumento' } }
  const esito = await auto.fai(r)
  assert.equal(esito, 'niente')
  assert.equal(store.elencoCompiti().filter(c => c.origine === 'auto:vuoto').length, 0,
    'ha scritto una riga pur non avendo trovato niente')
  // ma se n'è tenuta traccia: l'elenco deve poter dire «girata, niente da fare»
  assert.equal(store.statoAutomazione('vuoto')?.esito, 'niente')
})

test('quello che è girato finisce nel registro delle azioni', () => {
  const a = store.azioni(50).filter(x => x.tipo === 'automazione')
  assert.ok(a.length > 0, 'un\'automazione ha lavorato e non ne resta traccia da nessuna parte')
})

// — le tue —
//
// Quelle che ti scrivi tu passano dallo stesso motore e dallo stesso `valida()`
// di quelle che arrivano dall'azienda: se questo smettesse di essere vero, la
// risposta a «posso farmene una io?» diventerebbe «sì, ma una specie».

// `as const` no: questi oggetti si passano a `scrivi`, che prende `unknown` e
// valida, ed è proprio quello che si vuole provare
const MIA: Record<string, unknown> = {
  id: 'prova', nome: 'Prova', spiega: 'Una riga.',
  quando: { ogni: 'giorno', ora: 7 },
  guarda: { cerca: 'fattura', limite: 8 },
  fai: 'Guarda e dimmi.', metti: { inLista: 'oggi', modo: 'io' },
  en: { nome: 'Test', spiega: 'One line.', fai: 'Look and tell me.', cerca: 'invoice' }
}

test('una ricetta tua si scrive, si rilegge, ed è marcata come tua', () => {
  auto.scrivi(MIA)
  const v = auto.elenco().find(a => a.id === 'prova')
  assert.ok(v, 'scritta e sparita')
  assert.equal(v.mia, true, 'una tua non si distingue da una dell’azienda: non sapresti cosa puoi toccare')
})

test('una ricetta tua scritta male viene rifiutata come le altre', () => {
  assert.throws(() => auto.scrivi({ ...MIA, id: 'rotta', metti: { inLista: 'lunedì' } }),
    /inLista|metti/i, 'una tua entra anche se il motore non sa eseguirla')
  assert.throws(() => auto.scrivi({ ...MIA, id: 'rotta2', fai: '' }), /fai/)
})

test('cambiarla riscrive tutt’e due le lingue', () => {
  auto.scrivi(MIA)
  const dopo = auto.cambia('prova', { nome: 'Rinominata', fai: 'Fa un’altra cosa.' })
  assert.equal(dopo.nome, 'Rinominata')
  assert.equal(dopo.en.nome, 'Rinominata',
    'l’inglese resta indietro: chi legge l’app in inglese vede il nome vecchio per sempre')
  assert.equal(dopo.en.fai, 'Fa un’altra cosa.')
})

test('una che non esiste non si cambia e non si butta', () => {
  assert.throws(() => auto.cambia('non-esiste', { nome: 'X' }), /trovo/i)
  assert.equal(auto.butta('non-esiste'), false)
})

test('buttata, sparisce dall’elenco e non torna', () => {
  auto.scrivi({ ...MIA, id: 'da-buttare' })
  assert.ok(auto.elenco().some(a => a.id === 'da-buttare'))
  assert.ok(auto.butta('da-buttare'))
  assert.ok(!auto.elenco().some(a => a.id === 'da-buttare'), 'buttata e ancora lì')

  // e non basta che il file torni: chi l'ha tolta l'ha tolta
  auto.scordaLeRicette()
  assert.ok(!auto.elenco().some(a => a.id === 'da-buttare'),
    'ricompare da sola: un aggiornamento la rimetterebbe in elenco')
})

test('quella che non è tua si cambia lo stesso: la tua le si scrive sopra', () => {
  // due gesti per cambiare una parola erano due di troppo: adesso si cambia e
  // basta, e quello che scrivi finisce nella tua cartella con lo stesso id
  auto.scrivi({ ...MIA, id: 'pacchetto' })
  const dopo = auto.cambia('pacchetto', { nome: 'Come la voglio io' })
  assert.equal(dopo.id, 'pacchetto', 'ne ha fatta una seconda invece di coprire quella')
  assert.equal(auto.elenco().filter(a => a.id === 'pacchetto').length, 1, 'ne sono comparse due in elenco')
  auto.butta('pacchetto')
})

test('due ricette con lo stesso nome non si sovrascrivono', () => {
  const presi = new Set(['fatture-in-scadenza'])
  assert.equal(auto.idPer('Fatture in scadenza', new Set()), 'fatture-in-scadenza')
  assert.equal(auto.idPer('Fatture in scadenza', presi), 'fatture-in-scadenza-2')
  // e un nome che non lascia niente di scrivibile ha comunque un id
  assert.ok(auto.idPer('!!! ???', new Set()).length > 0)
})

test('buttarla si porta via anche la sua storia', () => {
  auto.scrivi({ ...MIA, id: 'effimera' })
  store.automazioneGirata('effimera', 'fatta')
  store.accendiAutomazione('effimera', false)
  assert.ok(auto.butta('effimera'))

  auto.scrivi({ ...MIA, id: 'effimera' })
  const v = auto.elenco().find(a => a.id === 'effimera')
  assert.equal(v?.quante, 0, 'la nuova nasce con addosso il conteggio di quella di prima')
  assert.equal(v?.accesa, true, 'e nasce spenta perché lo era quella di prima')
  auto.butta('effimera')
})

// — quando girerà —

test('«gira da sola» dice anche quando: ogni giorno', () => {
  const a = auto.scrivi({ ...MIA, id: 'ogni-giorno', quando: { ogni: 'giorno', ora: 7 } })
  // alle sei di mattina tocca oggi; alle otto è già passata e tocca domani
  const presto = auto.prossima(a, null, new Date(2026, 7, 31, 6))
  const tardi = auto.prossima(a, null, new Date(2026, 7, 31, 8))
  assert.equal(new Date(presto ?? '').getDate(), 31)
  assert.equal(new Date(tardi ?? '').getDate(), 1, 'passata l’ora, dice ancora oggi')
  auto.butta('ogni-giorno')
})

test('«gira da sola» dice anche quando: ogni settimana', () => {
  const a = auto.scrivi({ ...MIA, id: 'ogni-lunedi', quando: { ogni: 'settimana', giorno: 1, ora: 8 } })
  // lunedì 31 agosto 2026, alle nove: la prossima è lunedì prossimo
  const q = auto.prossima(a, null, new Date(2026, 7, 31, 9))
  assert.equal(new Date(q ?? '').getDay(), 1)
  assert.equal(new Date(q ?? '').getDate(), 7)
  auto.butta('ogni-lunedi')
})

test('in pausa non c’è nessuna prossima volta: sarebbe una promessa falsa', () => {
  const scritta = auto.scrivi(MIA)
  assert.equal(auto.prossima(scritta, { id: 'prova', spenta: 1, ultima: null, quante: 0, esito: null, guaio: null }), null)
  assert.equal(auto.prossima(auto.scrivi({ ...MIA, id: 'arrivo', quando: { quandoArriva: true } }), null), null)
  auto.butta('prova'); auto.butta('arrivo')
})

// — il turno che si perde, e quello che si recupera —
//
// Tre prove per un difetto solo, ed è il difetto peggiore che una cosa che
// gira da sola possa avere: **non girare, senza dirlo.** L'interruttore
// acceso, la scheda che promette «lunedì alle 9», e niente che succede — mai,
// per sempre, senza un errore da nessuna parte.

type Stato = Parameters<typeof auto.tocca>[1]

const STATO = (p: Partial<NonNullable<Stato>>): NonNullable<Stato> => ({
  id: 'prova', spenta: 0, ultima: null, quante: 0, esito: null, guaio: null, ...p
})

test('una settimanale saltata perché il computer era spento si recupera', () => {
  const r = { ...RICETTA, quando: { ogni: 'settimana' as const, giorno: 1, ora: 9 } }
  // è girata lunedì 31 agosto. Il lunedì dopo il computer è spento tutto il
  // giorno, e si riapre mercoledì 9 settembre.
  const s = STATO({ ultima: new Date(2026, 7, 31, 9).toISOString(), quante: 1, esito: 'fatta' })

  // prima si contava «è oggi il suo giorno?»: di mercoledì la risposta era no,
  // e la settimana intera spariva senza lasciare traccia
  assert.equal(auto.tocca(r, s, new Date(2026, 8, 9, 11)), true,
    'il lunedì saltato non è stato recuperato')
})

test('ma si recupera una volta sola, non una per ogni giorno perso', () => {
  const r = { ...RICETTA, quando: { ogni: 'giorno' as const, ora: 9 } }
  // ferma da una settimana, e adesso ha appena girato
  const appena = STATO({ ultima: new Date(2026, 8, 9, 11).toISOString(), quante: 2, esito: 'fatta' })
  assert.equal(auto.tocca(r, appena, new Date(2026, 8, 9, 12)), false,
    'sette giorni persi non devono diventare sette righe in lista')
})

test('una giornaliera a un’ora in cui il computer è spento gira lo stesso', () => {
  /*
   * È il caso che non girava *mai*. «Ogni giorno alle 23» su una macchina che
   * la sera è spenta: il vecchio conto chiedeva «che ore sono adesso?», e ogni
   * mattina alle 9 la risposta era 9 < 23 — quindi no, e via da capo. Undici
   * mesi con l'interruttore acceso e zero righe in lista.
   *
   * Adesso il turno si conta dall'ultima volta: le 23 di ieri sono passate, e
   * il recupero arriva alla prima riapertura utile.
   */
  const r = { ...RICETTA, quando: { ogni: 'giorno' as const, ora: 23 } }
  const s = STATO({ ultima: new Date(2026, 7, 30, 23).toISOString(), quante: 1, esito: 'fatta' })

  // la mattina dopo non è ancora in ritardo: le 23 di ieri le ha fatte
  assert.equal(auto.tocca(r, s, new Date(2026, 7, 31, 9)), false)
  // ma dopo una notte saltata sì, e senza aspettare un'altra sera
  assert.equal(auto.tocca(r, s, new Date(2026, 8, 1, 9)), true,
    'la sera saltata non è stata recuperata')
})

test('una appena scritta aspetta il suo turno invece di partire subito', () => {
  // il rovescio della stessa medaglia: `dal` distingue «in ritardo di tre
  // giorni» da «scritta due minuti fa», e senza, ogni automazione nuova
  // partirebbe nell'istante in cui la salvi
  const r = { ...RICETTA, quando: { ogni: 'giorno' as const, ora: 9 } }
  const nata = STATO({ dal: new Date(2026, 7, 31, 14).toISOString() })
  assert.equal(auto.tocca(r, nata, new Date(2026, 7, 31, 15)), false)
  // e il giorno dopo, alla sua ora, sì
  assert.equal(auto.tocca(r, nata, new Date(2026, 8, 1, 9)), true)
})

test('scritta prima della sua ora, il primo giro è oggi e non domani', () => {
  const r = { ...RICETTA, quando: { ogni: 'giorno' as const, ora: 9 } }
  const nata = STATO({ dal: new Date(2026, 7, 31, 8).toISOString() })
  assert.equal(auto.tocca(r, nata, new Date(2026, 7, 31, 9)), true)
})

test('quello che dice la scheda e quello che fa il motore sono la stessa cosa', () => {
  /*
   * Non è una prova di stile. `prossima()` disegna «domani alle 9» e `tocca()`
   * decide se girare: erano due funzioni con due conti che si somigliavano, ed
   * è così che una schermata comincia a promettere una cosa mentre il motore
   * ne fa un'altra — senza che niente vada in errore.
   */
  const casi = [
    { ogni: 'giorno' as const, ora: 7 },
    { ogni: 'giorno' as const, ora: 23 },
    { ogni: 'settimana' as const, giorno: 1, ora: 9 },
    { ogni: 'settimana' as const, giorno: 5, ora: 17 }
  ]
  for (const quando of casi) {
    for (const ore of [0, 5, 9, 13, 23]) {
      for (const giorni of [0, 1, 3, 8]) {
        const adesso = new Date(2026, 7, 31 + giorni, ore)
        const s = STATO({ ultima: new Date(2026, 7, 28, 9).toISOString(), quante: 1 })
        const r = { ...RICETTA, quando }
        const q = auto.prossima(r, s, adesso)
        assert.equal(
          auto.tocca(r, s, adesso),
          !!q && new Date(q) <= adesso,
          `${JSON.stringify(quando)} il ${adesso.toISOString()}: la scheda dice una cosa e il motore ne fa un'altra`
        )
      }
    }
  }
})

// — la riga rimasta aperta non deve far saltare quello che arriva —

test('rimandata non sposta il paletto da cui riparte «solo i nuovi»', () => {
  /*
   * Il difetto che questo controlla non si vedeva da nessuna parte.
   *
   * Con una riga ancora aperta in lista, `fai()` si ferma e segna il giro. Ma
   * segnarlo con `automazioneGirata` spostava `ultima` — che è anche il
   * momento da cui `soloNuovi` riparte a guardare. Ogni quarto d'ora il
   * paletto avanzava senza che nessuno avesse letto niente, e tutto quello che
   * arrivava nel frattempo finiva *dietro*: non rimandato, saltato per sempre.
   * E la cosa saltata era esattamente la fattura che doveva prendere.
   */
  const prima = new Date(2026, 7, 31, 9).toISOString()
  store.automazioneGirata('rimando', 'fatta', undefined, 3)
  const dopoLaPrima = store.statoAutomazione('rimando')!.ultima

  store.automazioneRimandata('rimando')
  const dopoIlRimando = store.statoAutomazione('rimando')!

  assert.equal(dopoIlRimando.ultima, dopoLaPrima, 'il paletto si è mosso senza che si sia letto niente')
  assert.equal(dopoIlRimando.esito, 'gia')
  // e non gonfia nemmeno il conto: rimandare non è girare
  assert.equal(dopoIlRimando.quante, 1)
  assert.ok(prima)
  store.scordaAutomazione('rimando')
})

// — capire perché non fa niente —

test('quattro giri a vuoto di fila diventano una cosa che si può leggere', () => {
  const r = { ...RICETTA, attrezzi: [] }
  for (let i = 0; i < 4; i++) store.automazioneGirata('muta', 'niente', undefined, 0)
  const s = store.statoAutomazione('muta')
  assert.equal(auto.salute({ ...r, id: 'muta' }, s).stato, 'muta')
  store.scordaAutomazione('muta')
})

test('un giro a vuoto non basta: «non c’era niente» è la risposta normale', () => {
  store.automazioneGirata('sana', 'niente', undefined, 0)
  assert.equal(auto.salute({ ...RICETTA, id: 'sana', attrezzi: [] }, store.statoAutomazione('sana')).stato, 'bene')
  store.scordaAutomazione('sana')
})

test('aver letto dei documenti e non aver trovato niente non è una malattia', () => {
  // è un'automazione che funziona e che ti sta dicendo che è tutto a posto:
  // confonderla con una che cerca le parole sbagliate vorrebbe dire mandare
  // qualcuno a riscrivere una ricetta giusta
  for (let i = 0; i < 6; i++) store.automazioneGirata('lavora', 'niente', undefined, 5)
  assert.equal(auto.salute({ ...RICETTA, id: 'lavora', attrezzi: [] }, store.statoAutomazione('lavora')).stato, 'bene')
  store.scordaAutomazione('lavora')
})

test('una riga aperta si dice, invece di restare un mistero', () => {
  store.automazioneRimandata('ferma')
  assert.equal(auto.salute({ ...RICETTA, id: 'ferma', attrezzi: [] }, store.statoAutomazione('ferma')).stato, 'ferma')
  store.scordaAutomazione('ferma')
})

test('un attrezzo scollegato viene prima di tutto il resto', () => {
  // è la diagnosi che si ripara con un clic e non riscrivendo niente: dirle
  // «non trova mai niente» manderebbe a limare parole che sono già giuste
  const r = { ...RICETTA, id: 'staccata', attrezzi: ['notion.leggi'] }
  for (let i = 0; i < 8; i++) store.automazioneGirata('staccata', 'niente', undefined, 0)
  assert.equal(auto.salute(r, store.statoAutomazione('staccata')).stato, 'scollegata')
  store.scordaAutomazione('staccata')
})

test('la storia non cresce all’infinito', () => {
  for (let i = 0; i < 40; i++) store.automazioneGirata('lunga', 'fatta', undefined, 1)
  assert.equal(store.storiaDi(store.statoAutomazione('lunga')).length, 20)
  store.scordaAutomazione('lunga')
})

test('una storia illeggibile non butta giù la schermata', () => {
  // una colonna JSON scritta male è una cosa che succede — un disco pieno a
  // metà scrittura, una versione più vecchia — e qui deve diventare «non so
  // niente», non un'eccezione in mezzo all'elenco delle automazioni
  const rotta = STATO({ storia: '{non json' })
  assert.deepEqual(store.storiaDi(rotta), [])
  // e nemmeno qualcosa che non è un elenco
  assert.deepEqual(store.storiaDi(STATO({ storia: '"ciao"' })), [])
  assert.deepEqual(store.storiaDi(STATO({ storia: null })), [])
})

// — l'anteprima —

test('l’anteprima dice dove ha cercato, così un vuoto si può spiegare', () => {
  const a = auto.scrivi({ ...MIA, id: 'assaggio', attrezzi: ['notion.leggi'] })
  const e = auto.anteprima(a.id)
  assert.deepEqual(e.dentro, ['notion'], 'il recinto dichiarato non è quello in cui ha cercato')
  // Notion non è collegato in questa prova: è il motivo del vuoto, e va detto
  assert.deepEqual(e.staccati, ['notion.leggi'])
  auto.butta('assaggio')
})

test('l’anteprima non scrive niente e non fa girare l’automazione', () => {
  const a = auto.scrivi({ ...MIA, id: 'muta-anteprima' })
  const prima = store.statoAutomazione(a.id)
  auto.anteprima(a.id)
  auto.anteprima(a.id)
  const dopo = store.statoAutomazione(a.id)
  assert.equal(dopo?.ultima ?? null, prima?.ultima ?? null, 'guardare ha spostato il paletto')
  assert.equal(dopo?.quante ?? 0, prima?.quante ?? 0, 'guardare è stato contato come un giro')
  auto.butta('muta-anteprima')
})
