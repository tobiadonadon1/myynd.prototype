import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const dati = mkdtempSync(join(tmpdir(), 'myynd-discovery-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en' }))
const { rileva } = await import('./scoperte.ts')
after(() => rmSync(dati, { recursive: true, force: true }))
const docs = [{ id: '1', titolo: 'Invoice for September', fonte: 'desktop' }, { id: '2', titolo: 'Invoice for August', fonte: 'desktop' }]
const catalogo = [{ nome: 'desktop.leggi', collegato: true }]
test('suggestions require repeated evidence from a currently connected source', () => {
  assert.equal(rileva(docs.slice(0, 1), catalogo, new Set()).length, 0)
  assert.equal(rileva(docs, [{ ...catalogo[0], collegato: false }], new Set()).length, 0)
  const r = rileva(docs, catalogo, new Set())
  assert.equal(r.length, 1); assert.equal(r[0].quanti, 2)
  assert.deepEqual(r[0].attrezzi, ['desktop.leggi'])
  assert.deepEqual(r[0].esempi, docs.map(d => d.titolo))
})
test('adopted and dismissed suggestions stay out, and labels follow the language', () => {
  assert.equal(rileva(docs, catalogo, new Set(['mind-invoices'])).length, 0)
  assert.equal(rileva(docs, catalogo, new Set(), false)[0].nome, 'Fatture sotto controllo')
  assert.equal(rileva([{ id: '3', titolo: 'Hello', fonte: 'desktop' }], catalogo, new Set()).length, 0)
})
test('adoption persists a paused workflow, is idempotent, and dismissal persists', async () => {
  const cfg = await import('./config.ts')
  const store = await import('./store.ts')
  const auto = await import('./automazioni.ts')
  const discovery = await import('./scoperte.ts')
  cfg.scrivi({ ...cfg.leggi(), desktop: { cartelle: [dati] } })
  store.salvaDocumenti(docs.map(d => ({ ...d, tipo: 'file', corpo: 'Example invoice', quando: new Date().toISOString() })))
  assert.equal((await discovery.suggerimenti()).length, 1)
  const a = discovery.adotta('mind-invoices')
  assert.equal(auto.elenco().find(x => x.id === a.id)?.accesa, false)
  assert.equal(a.passi?.[0].tipo, 'condizione')
  assert.equal((await discovery.suggerimenti()).length, 0)
  assert.equal(discovery.adotta(a.id).id, a.id)
  assert.equal(auto.elenco().filter(x => x.id === a.id).length, 1)
  store.salvaDocumenti([
    { id: 'm1', fonte: 'desktop', titolo: 'Meeting notes one', corpo: '', tipo: 'file' },
    { id: 'm2', fonte: 'desktop', titolo: 'Meeting notes two', corpo: '', tipo: 'file' }
  ])
  assert.ok((await discovery.suggerimenti()).some(x => x.id === 'mind-meetings'))
  store.togliAutomazione('mind-meetings')
  assert.ok(!(await discovery.suggerimenti()).some(x => x.id === 'mind-meetings'))
  assert.throws(() => discovery.adotta('mind-meetings'))
})
test('general inbox and project suggestions work without invoice keywords', () => {
  const mail = Array.from({ length: 3 }, (_, i) => ({ id: `mail-${i}`, titolo: `A question ${i}`, fonte: 'posta' }))
  assert.equal(rileva(mail, [{ nome: 'posta.leggi', collegato: true }], new Set())[0].id, 'mind-inbox')
  assert.equal(rileva(mail, [{ nome: 'posta.leggi', collegato: false }], new Set()).length, 0)
  const files = Array.from({ length: 5 }, (_, i) => ({ id: `file-${i}`, titolo: `Design ${i}`, fonte: 'desktop' }))
  assert.equal(rileva(files, catalogo, new Set())[0].id, 'mind-files')
})

/*
 * Da qui in giù: la strada nuova.
 *
 * Un suggerimento adesso lo scrive il modello guardando il materiale vero, e
 * costa. Le due cose da tenere ferme sono queste — che senza modello la
 * schermata proponga lo stesso, e che con il modello lo chiami **una volta al
 * giorno** e non a ogni apertura della pagina.
 */
let idea = ''

test('senza modello la frase locale nomina la fonte e il conto, in una riga sola', async () => {
  const store = await import('./store.ts')
  const discovery = await import('./scoperte.ts')
  store.salvaDocumenti([
    { id: 'p1', fonte: 'desktop', titolo: 'Proposal for Rossi', corpo: '', tipo: 'file' },
    { id: 'p2', fonte: 'desktop', titolo: 'Proposal for Bianchi', corpo: '', tipo: 'file' }
  ])
  const s = await discovery.suggerimenti()
  assert.ok(s.length, 'senza modello i suggerimenti locali restano')
  for (const x of s) {
    // niente lineette: la regola vale anche per il testo che scriviamo noi
    assert.ok(!/[—–]/.test(x.spiega), x.spiega)
    // una frase sola
    assert.ok(!/[.!?]\s/.test(x.spiega), x.spiega)
    // che nomina la fonte, con il nome che ha in questa macchina («my Mac» o «my PC»), e il conto
    assert.match(x.spiega, /my (Mac|PC)/)
    assert.match(x.spiega, /\d/)
  }
})

test('con un modello collegato i suggerimenti li scrive lui, una volta al giorno', async () => {
  const discovery = await import('./scoperte.ts')
  let chiamate = 0
  discovery.perProva({
    collegato: () => true,
    chiediJSON: async () => {
      chiamate++
      return {
        automazioni: [
          {
            nome: 'Fatture di Aruba e Fastweb',
            spiega: 'Ogni lunedì, le fatture di Aruba dal desktop nella lista della settimana.',
            quando: { ogni: 'settimana', giorno: 2, ora: 17 },
            guarda: { cerca: 'invoice september' },
            attrezzi: ['desktop.leggi'],
            metti: { inLista: 'settimana', modo: 'io' }
          },
          // un attrezzo che non esiste: la proposta cade, non si ripulisce a metà
          {
            nome: 'Roba inventata', spiega: 'Ogni mattina, quello che vuoi.',
            quando: { ogni: 'giorno', giorno: 1, ora: 7 }, guarda: { cerca: 'x' },
            attrezzi: ['posta.manda'], metti: { inLista: 'oggi', modo: 'bozza' }
          },
          // uno vero ma non collegato: girerebbe ogni mattina senza trovare niente
          {
            nome: 'Posta che non c’è', spiega: 'Ogni mattina, le richieste dalla posta.',
            quando: { ogni: 'giorno', giorno: 1, ora: 7 }, guarda: { cerca: 'y' },
            attrezzi: ['posta.leggi'], metti: { inLista: 'oggi', modo: 'bozza' }
          }
        ]
      }
    }
  })
  try {
    const s = await discovery.suggerimenti(true)
    assert.equal(chiamate, 1)
    assert.deepEqual(s.map(x => x.nome), ['Fatture di Aruba e Fastweb'])
    assert.deepEqual(s[0].attrezzi, ['desktop.leggi'])
    assert.deepEqual(s[0].quando, { ogni: 'settimana', giorno: 2, ora: 17 })
    idea = s[0].id

    // aprire la schermata di nuovo, lo stesso giorno, non paga niente
    const ancora = await discovery.suggerimenti()
    assert.equal(chiamate, 1)
    assert.deepEqual(ancora.map(x => x.id), [idea])

    // il bottone sì
    await discovery.suggerimenti(true)
    assert.equal(chiamate, 2)
  } finally { discovery.perProva(null) }
})

test('adottata, tiene la sua ora e le sue fonti', async () => {
  const auto = await import('./automazioni.ts')
  const discovery = await import('./scoperte.ts')
  const a = discovery.adotta(idea)
  assert.deepEqual(a.quando, { ogni: 'settimana', giorno: 2, ora: 17 })
  assert.deepEqual(a.attrezzi, ['desktop.leggi'])
  assert.equal(a.guarda.cerca, 'invoice september')
  assert.equal(a.metti.inLista, 'settimana')
  assert.equal(a.en.cerca, 'invoice september')
  // e nasce spenta, come tutte: l'interruttore lo tira lei
  assert.equal(auto.elenco().find(x => x.id === a.id)?.accesa, false)
})

/*
 * scarta(): il cancello sull'id, e la memoria del nome.
 *
 * Da questa strada non deve poter sparire un'automazione vera — solo un id di
 * proposta lo attraversa. E chi rifiuta una proposta vera non deve rivederla
 * con un nome diverso al prossimo giro: il nome resta sul foglio, e il modello
 * lo legge nel materiale che gli si dà.
 */

test('scarta non tocca un id che non è mai stato una proposta', async () => {
  const store = await import('./store.ts')
  const auto = await import('./automazioni.ts')
  const discovery = await import('./scoperte.ts')

  // una stringa a caso: non è la scheda di niente
  assert.equal(discovery.scarta('non-esiste-proprio-' + Date.now()), false)

  // una vera automazione, scritta a mano: il suo id non è una proposta
  const vera = auto.scrivi({
    id: 'una-automazione-scritta-a-mano',
    nome: 'Una automazione scritta a mano',
    spiega: 'Fa qualcosa di vero, non è un suggerimento.',
    fai: 'Fa qualcosa di vero, non è un suggerimento.',
    quando: { ogni: 'giorno', ora: 8 },
    guarda: { soloNuovi: true },
    metti: { inLista: 'oggi' },
    en: {
      nome: 'A handwritten automation',
      spiega: 'Does something real, not a suggestion.',
      fai: 'Does something real, not a suggestion.'
    }
  })
  assert.equal(discovery.scarta(vera.id), false)
  assert.ok(auto.ricette().some(a => a.id === vera.id), 'resta fra le ricette')
  assert.ok(!store.automazioniTolte().has(vera.id), 'non viene tolta')
})

test('scarta su una vera proposta la toglie, ricorda il nome, e il modello la sa già rifiutata', async () => {
  const discovery = await import('./scoperte.ts')
  let chiamate = 0
  let ultimoMessaggio = ''
  discovery.perProva({
    collegato: () => true,
    chiediJSON: async (o) => {
      chiamate++
      ultimoMessaggio = String(o.messages[0]?.content ?? '')
      return {
        automazioni: [{
          nome: 'Solleciti clienti in ritardo',
          spiega: 'Ogni mattina, le fatture scadute dal desktop nella lista di oggi.',
          quando: { ogni: 'giorno', ora: 8 },
          guarda: { cerca: 'sollecito scaduto' },
          attrezzi: ['desktop.leggi'],
          metti: { inLista: 'oggi', modo: 'bozza' }
        }]
      }
    }
  })
  try {
    const primo = await discovery.suggerimenti(true)
    const scartata = primo.find(x => x.nome === 'Solleciti clienti in ritardo')
    assert.ok(scartata, 'la proposta compare')
    assert.equal(chiamate, 1)

    assert.equal(discovery.scarta(scartata.id), true)

    // la stessa giornata: legge il foglio, non richiama il modello, e la proposta non c'è più
    const dopo = await discovery.suggerimenti()
    assert.equal(chiamate, 1, 'aprire la schermata non paga niente')
    assert.ok(!dopo.some(x => x.id === scartata.id), 'sparisce dal prossimo giro')

    // il bottone rifà il giro, e il materiale nomina quello che ha già rifiutato
    await discovery.suggerimenti(true)
    assert.equal(chiamate, 2)
    assert.match(ultimoMessaggio, /Solleciti clienti in ritardo/)
  } finally { discovery.perProva(null) }
})

/*
 * Un giro che fallisce — il modello non risponde, o risponde con qualcosa che
 * non si legge — costa lo stesso: `chiediJSON` vero cattura l'errore e torna
 * `null` invece di lanciare (vedi modello.ts), e qui si verifica che quel
 * `null` segni comunque il turno del giorno.
 */
test('un giro fallito brucia comunque il turno del giorno', async () => {
  const discovery = await import('./scoperte.ts')
  let chiamate = 0
  discovery.perProva({
    collegato: () => true,
    chiediJSON: async () => { chiamate++; return null }
  })
  try {
    const primo = await discovery.suggerimenti(true)
    assert.equal(chiamate, 1)
    assert.ok(Array.isArray(primo))

    // la stessa giornata: non richiama, anche se l'ultimo giro non ha prodotto niente
    const ancora = await discovery.suggerimenti()
    assert.equal(chiamate, 1, 'il turno di oggi è già segnato')
    assert.ok(Array.isArray(ancora))

    // il bottone sì
    await discovery.suggerimenti(true)
    assert.equal(chiamate, 2, 'rifai lo richiama comunque')
  } finally { discovery.perProva(null) }
})

test('senza modello, "on my Mac/PC" in inglese e "nel mio Mac/PC" in italiano', async () => {
  const store = await import('./store.ts')
  const cfg = await import('./config.ts')
  const discovery = await import('./scoperte.ts')
  store.salvaDocumenti([
    { id: 'w1', fonte: 'desktop', titolo: 'Proposal for Verdi', corpo: '', tipo: 'file' },
    { id: 'w2', fonte: 'desktop', titolo: 'Proposal for Neri', corpo: '', tipo: 'file' }
  ])

  const en = await discovery.suggerimenti()
  const enProposta = en.find(x => x.id === 'mind-proposals')
  assert.ok(enProposta, 'la proposta in inglese compare')
  assert.match(enProposta.spiega, /on my (Mac|PC)/)

  // la lingua si cambia sul conto, come in dalvivo.test.ts: `nellaLingua()`
  // e `lingua()` la rileggono a ogni chiamata
  cfg.aggiorna({ lingua: 'it' })
  try {
    const it = await discovery.suggerimenti()
    const itProposta = it.find(x => x.id === 'mind-proposals')
    assert.ok(itProposta, 'la proposta in italiano compare')
    assert.match(itProposta.spiega, /nel mio (Mac|PC)/)
  } finally {
    cfg.aggiorna({ lingua: 'en' })
  }
})
