// Andarsene, e chiedere cosa tenete su di me.
//
// Sono le due metà della stessa domanda, e la seconda serve a poter fare la
// prima con cognizione di causa: prima di cancellare tutto si deve poter
// leggere tutto. Quello che si prova qui è che «tutto» voglia dire tutto —
// niente cartella dimenticata sul disco, niente riga di configurazione con
// dentro una password che resta su un database dopo che il conto non c'è più —
// e che il fascicolo si possa mandare in giro senza mandare in giro le chiavi.
//
//   node --test server/addio.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-addio-'))
process.env.MYYND_DATI = CASA
process.env.RAILWAY_ENVIRONMENT = 'prova'
process.env.MYYND_REGISTRAZIONE = 'aperta'

const conti = await import('./conti.ts')
const cfg = await import('./config.ts')
const chi = await import('./chi.ts')
const store = await import('./store.ts')
const gettoni = await import('./gettoni.ts')
const addio = await import('./addio.ts')
const fascicolo = await import('./fascicolo.ts')

let anna = ''
let bruno = ''

const doc = (id: string, titolo: string) => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `il testo di ${titolo}`,
  autore: 'chi@scrive.it', percorso: null, quando: '2026-01-01T00:00:00.000Z', gruppo: 'posta'
})

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok)
  anna = a.ok ? a.id : ''
  bruno = b.ok ? b.id : ''

  for (const [chiE, nome] of [[anna, 'Anna'], [bruno, 'Bruno']] as const) {
    chi.dentro(chiE, () => {
      cfg.aggiorna({
        nome, ruolo: 'titolare',
        posta: { host: 'imap.esempio.it', porta: 993, utente: `${nome.toLowerCase()}@esempio.it`, password: `segreto-di-${nome}` },
        notion: { token: `notion-di-${nome}` },
        calendario: { url: `https://agenda.esempio.it/segreto-di-${nome}.ics`, nome: 'la mia agenda' },
        compatibile: { url: 'https://api.openai.com/v1', chiave: `sk-di-${nome}`, modello: 'gpt-4o' }
      })
      store.salvaDocumenti([doc(`posta:1:${nome}`, `una mail per ${nome}`)])
      store.scriviCompito({ id: `c-${nome}`, testo: `una cosa da fare per ${nome}`, quando: 'oggi', ordine: store.ultimoOrdine('oggi') })
    })
  }
})

after(() => {
  store.chiudiIndici()
  for (const v of ['MYYND_DATI', 'RAILWAY_ENVIRONMENT', 'MYYND_REGISTRAZIONE']) delete process.env[v]
  rmSync(CASA, { recursive: true, force: true })
})

// — il fascicolo —

function fascicoloDi(utente: string): Record<string, unknown> {
  return chi.dentro(utente, () => JSON.parse([...fascicolo.scrivi([])].join('')))
}

test('c’è dentro tutto quello che serve a capire cosa tieni', () => {
  const f = fascicoloDi(anna)
  for (const chiave of ['conto', 'configurazione', 'documenti', 'compiti', 'memoria', 'chat', 'automazioni', 'azioni', 'uso', 'gettoni']) {
    assert.ok(chiave in f, `nel fascicolo manca «${chiave}»`)
  }
  assert.equal((f.conto as { email: string }).email, 'anna@esempio.it')
  assert.equal((f.documenti as unknown[]).length, 1)
  assert.equal((f.compiti as { aperti: unknown[] }).aperti.length, 1)
})

test('le credenziali non ci sono, e non ci sono davvero', () => {
  /*
   * La prova che conta di più in questo file. Questo file si inoltra a un
   * consulente, si stampa, si mette in un allegato: se dentro ci fosse la
   * password della casella, «dammi i miei dati» diventerebbe il modo più comodo
   * di far uscire una credenziale da qui.
   *
   * Si guarda il testo intero e non i singoli campi: un campo nuovo aggiunto
   * fra sei mesi non passerebbe da un controllo scritto campo per campo.
   */
  const testo = chi.dentro(anna, () => [...fascicolo.scrivi([])].join(''))
  for (const segreto of ['segreto-di-Anna', 'notion-di-Anna', 'sk-di-Anna', 'segreto-di-Anna.ics']) {
    assert.ok(!testo.includes(segreto), `il fascicolo contiene «${segreto}»`)
  }
  // e quello che non è una credenziale resta, o non servirebbe a niente
  assert.ok(testo.includes('imap.esempio.it'), 'l’host della casella è sparito: non era un segreto')
  assert.ok(testo.includes('api.openai.com'), 'l’indirizzo del fornitore è sparito: non era un segreto')
  assert.ok(testo.includes('una mail per Anna'))
})

test('il fascicolo di una persona non contiene niente dell’altra', () => {
  const testo = chi.dentro(anna, () => [...fascicolo.scrivi([])].join(''))
  assert.ok(!testo.includes('Bruno'))
  assert.ok(!testo.includes('bruno@esempio.it'))
})

test('un gettone si vede per nome, mai per valore', async () => {
  const e = await gettoni.crea(anna, 'il Mac', 'desktop')
  assert.ok(e.ok)
  // l'elenco arriva già letto da fuori: il fascicolo è sincrono apposta, e
  // renderlo asincrono per una riga vorrebbe dire un `await` in mezzo a
  // ottantamila documenti letti nel contesto di una persona
  const miei = await gettoni.elenco(anna)
  const testo = chi.dentro(anna, () => [...fascicolo.scrivi(miei)].join(''))
  assert.ok(testo.includes('il Mac'))
  assert.ok(!testo.includes(e.ok ? e.gettone : 'x'))
})

// — la cancellazione —

test('cancellare porta via la riga, le sessioni, la cartella e la configurazione', async () => {
  const sessione = await conti.perProva.apri(bruno)
  const e = await gettoni.crea(bruno, 'il suo Mac', 'desktop')
  assert.ok(e.ok)
  const dove = cfg.cartellaDi(bruno)
  // l'indice esiste davvero sul disco: è quello che va chiuso prima di togliere
  assert.ok(existsSync(join(dove, 'mente.db')), 'la premessa non regge: l’indice non c’è')

  const esito = await addio.cancella(bruno)
  assert.equal(esito.file, true)

  assert.equal(conti.conto(bruno), null, 'la riga del conto è rimasta')
  assert.equal(await conti.utenteDelToken(sessione), null, 'una sessione apre ancora un conto cancellato')
  assert.equal(await gettoni.trova(e.ok ? e.gettone : ''), null, 'un gettone apre ancora un conto cancellato')
  assert.equal(existsSync(dove), false, 'la cartella con i documenti è rimasta sul disco')
  assert.equal(chi.dentro(bruno, () => cfg.leggi().posta?.password), undefined, 'le credenziali sono rimaste in memoria')
})

test('e non tocca quello di nessun altro', () => {
  assert.ok(conti.conto(anna))
  assert.equal(chi.dentro(anna, () => cfg.leggi().nome), 'Anna')
  assert.equal(chi.dentro(anna, () => store.conteggi().totale), 1)
})

test('l’indice si può riaprire subito dopo, senza strascichi', () => {
  // era il rischio del gesto: chiudere il file sotto a un handle vivo lascia
  // SQLite convinto di sapere cosa c'è dentro, e la richiesta dopo scriverebbe
  // dentro un file che non esiste più — ricreandolo a metà
  chi.dentro(anna, () => {
    store.salvaDocumenti([doc('posta:2:Anna', 'un’altra mail')])
    assert.equal(store.conteggi().totale, 2)
  })
})

test('la cartella nella radice non si cancella mai', async () => {
  /*
   * Il conto che c'era prima che le persone fossero più di una ha i suoi file
   * **nella radice**, insieme a `conti.db` e a quelli di tutti gli altri.
   * Cancellare la sua cartella vorrebbe dire cancellare l'installazione.
   */
  // `adotta` vale solo su un'installazione ancora vuota: qui si svuota
  await addio.cancella(anna)
  assert.equal(conti.quanti(), 0)

  mkdirSync(join(CASA, 'vecchio'), { recursive: true })
  writeFileSync(join(CASA, 'vecchio', 'config.json'), '{}')
  const id = await conti.adotta('vecchio@esempio.it', 'unsale', 'unhash', join(CASA, 'vecchio'))
  assert.ok(id, 'il conto adottato non si è creato: la prova non proverebbe niente')

  const esito = await addio.cancella(id)
  assert.equal(esito.file, false, 'ha detto di aver cancellato una cartella che non doveva toccare')
  assert.ok(existsSync(join(CASA, 'vecchio', 'config.json')), 'ha cancellato i file di un conto adottato')
  assert.equal(conti.conto(id), null, 'il conto però se n’è andato lo stesso')
})
