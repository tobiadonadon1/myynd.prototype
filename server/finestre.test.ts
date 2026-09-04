// Quando si può cancellare un'email dall'indice, e quando non si può.
//
// Fin qui: mai. Niente riconciliava la posta, quindi un messaggio cestinato o
// spostato restava nell'indice per sempre — veniva citato in una risposta come
// se fosse ancora in casella, e finiva dentro le proposte «archivia questi»,
// cioè Myynd proponeva di archiviare roba archiviata da mesi.
//
// La cura ha però un verso pericoloso. Cancellare «tutto quello che stavolta
// non ho visto» vorrebbe dire svuotare l'indice ogni volta che una cartella non
// si apre, o che la lettura si ferma al tetto, o che la finestra di trenta
// giorni ha lasciato fuori la posta vecchia. Un'email tolta per sbaglio non
// torna.
//
// Quindi `sincronizza` non dice solo cosa ha visto: dice **dove ha guardato**,
// e lo dice solo delle cartelle che ha finito di leggere. Queste prove
// guardano quel confine, da tutt'e due i lati.
//
//   node --test server/finestre.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ImapFlow } from 'imapflow'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-finestre-'))
process.env.MYYND_DATI = CASA

const posta = await import('./connettori/posta.ts')
const store = await import('./store.ts')

after(() => {
  posta.usaClient(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

/** Un messaggio grezzo che `mailparser` sa leggere. */
const grezzo = (n: number) =>
  `From: Rossi <rossi@esempio.it>\r\nSubject: Numero ${n}\r\n` +
  `Date: Wed, 02 Sep 2026 10:00:00 +0200\r\nMessage-ID: <${n}@esempio.it>\r\n\r\nIl corpo del numero ${n}.\r\n`

type Casella = {
  /** Gli uid che il server dice di avere, cartella per cartella. */
  cartelle: Record<string, number[]>
  /** Le cartelle che si rifiutano di aprirsi. */
  rotte?: string[]
  /** Le cartelle che cadono mentre si scaricano i messaggi. */
  cadenti?: string[]
  validita?: string
}

/** Una casella finta: risponde come ImapFlow, senza rete e senza password. */
function finta(k: Casella): ImapFlow {
  let aperta = ''
  const cl = {
    connect: async () => {},
    close: async () => {},
    logout: async () => {},
    list: async () => Object.keys(k.cartelle).map(path => ({ path, name: path, specialUse: undefined })),
    get mailbox() { return { uidValidity: BigInt(k.validita ?? '1') } },
    getMailboxLock: async (cartella: string) => {
      if (k.rotte?.includes(cartella)) throw new Error('nessun permesso')
      aperta = cartella
      return { release: () => { aperta = '' } }
    },
    search: async () => k.cartelle[aperta] ?? [],
    fetch: (uids: number[]) => {
      const dove = aperta
      return (async function* () {
        for (const uid of uids) {
          if (k.cadenti?.includes(dove)) throw new Error('la rete è caduta')
          yield { uid, source: Buffer.from(grezzo(uid)), envelope: { date: new Date('2026-09-02T08:00:00Z') } }
        }
      })()
    }
  }
  return cl as unknown as ImapFlow
}

const conto = { host: 'imap.esempio.it', porta: 993, utente: 'a@esempio.it', password: 'x' }

// — la finestra c'è —

test('una cartella letta fino in fondo dichiara da quale uid a quale', async () => {
  posta.usaClient(() => finta({ cartelle: { INBOX: [10, 11, 12] } }))
  const e = await posta.sincronizza({ ...conto, cartelle: ['INBOX'] })
  assert.deepEqual(e.finestre, [{ cartella: 'INBOX', daUid: 10, aUid: 12 }])
  assert.equal(e.docs.length, 3)
  // e dichiara vivi tutti e tre: senza, riconciliare li cancellerebbe subito
  assert.deepEqual(e.visti, ['posta:INBOX:10', 'posta:INBOX:11', 'posta:INBOX:12'])
})

test('il giro dopo, senza niente da scaricare, la finestra c’è lo stesso', async () => {
  /*
   * È il caso che conta più di tutti, ed è quello che una versione distratta
   * sbaglierebbe: dal secondo giro in poi non c'è mai niente da scaricare —
   * sono già tutti dentro — e uscire lì vorrebbe dire non riconciliare mai.
   * Ma è proprio quel giro l'unico in cui si può scoprire che una email è
   * sparita.
   */
  posta.usaClient(() => finta({ cartelle: { INBOX: [10, 11, 12] } }))
  const e = await posta.sincronizza(
    { ...conto, cartelle: ['INBOX'], validita: { INBOX: '1' } },
    undefined,
    () => new Set([10, 11, 12])
  )
  assert.equal(e.docs.length, 0)
  assert.equal(e.saltati, 3)
  assert.deepEqual(e.finestre, [{ cartella: 'INBOX', daUid: 10, aUid: 12 }])
  assert.deepEqual(e.visti, ['posta:INBOX:10', 'posta:INBOX:11', 'posta:INBOX:12'])
})

test('un messaggio tolto dalla casella non compare più fra i vivi', async () => {
  // l'undici non c'è più: sta dentro la finestra e fuori dai visti, che è
  // esattamente la coppia di condizioni che lo toglie dall'indice
  posta.usaClient(() => finta({ cartelle: { INBOX: [10, 12] } }))
  const e = await posta.sincronizza(
    { ...conto, cartelle: ['INBOX'], validita: { INBOX: '1' } },
    undefined,
    () => new Set([10, 11, 12])
  )
  assert.deepEqual(e.finestre, [{ cartella: 'INBOX', daUid: 10, aUid: 12 }])
  assert.ok(!e.visti.includes('posta:INBOX:11'))
})

// — la finestra non c'è —

test('una cartella che non si apre non dichiara niente', async () => {
  posta.usaClient(() => finta({ cartelle: { INBOX: [1, 2], Archivio: [7, 8] }, rotte: ['Archivio'] }))
  const e = await posta.sincronizza({ ...conto, cartelle: ['INBOX', 'Archivio'] })
  assert.deepEqual(e.cartelleFallite, ['Archivio'])
  assert.deepEqual(e.finestre.map(f => f.cartella), ['INBOX'])
})

test('una cartella che cade a metà scaricamento nemmeno', async () => {
  // la serratura si è aperta e la ricerca ha risposto: se bastasse quello, la
  // finestra ci sarebbe — e cancellerebbe tutto quello che non si è fatto in
  // tempo a rileggere
  posta.usaClient(() => finta({ cartelle: { INBOX: [1, 2], Archivio: [7, 8] }, cadenti: ['Archivio'] }))
  const e = await posta.sincronizza({ ...conto, cartelle: ['INBOX', 'Archivio'] })
  assert.deepEqual(e.cartelleFallite, ['Archivio'])
  assert.deepEqual(e.finestre.map(f => f.cartella), ['INBOX'])
})

test('una cartella lasciata a metà dal tetto nemmeno, finché non è tutta dentro', async () => {
  const tanti = Array.from({ length: 450 }, (_, i) => i + 1)
  posta.usaClient(() => finta({ cartelle: { INBOX: tanti } }))

  const primo = await posta.sincronizza({ ...conto, cartelle: ['INBOX'] })
  assert.equal(primo.troncato, true)
  assert.deepEqual(primo.finestre, [], 'una lettura a metà non è un permesso a cancellare')
  assert.equal(primo.docs.length, 400)
  assert.deepEqual(primo.resto, { aGiorno: false, totale: 450, letti: 400, restano: 50 })

  // il giro dopo prende i cinquanta che mancavano, e allora sì
  const dentro = new Set(primo.docs.map(d => Number(d.id.slice(d.id.lastIndexOf(':') + 1))))
  const secondo = await posta.sincronizza(
    { ...conto, cartelle: ['INBOX'], validita: { INBOX: '1' } }, undefined, () => dentro)
  assert.equal(secondo.docs.length, 50)
  assert.equal(secondo.troncato, false)
  assert.deepEqual(secondo.finestre, [{ cartella: 'INBOX', daUid: 1, aUid: 450 }])
  assert.deepEqual(secondo.resto, { aGiorno: true, totale: 450, letti: 450, restano: 0 })
})

test('una cartella vuota nella finestra non dichiara un intervallo che non ha', async () => {
  // una ricerca che torna vuota per un raffreddore del server non deve poter
  // svuotare l'indice di quella cartella
  posta.usaClient(() => finta({ cartelle: { INBOX: [] } }))
  const e = await posta.sincronizza({ ...conto, cartelle: ['INBOX'] })
  assert.deepEqual(e.finestre, [])
})

test('una casella rinumerata si rilegge tutta, e intanto non dichiara niente', async () => {
  /*
   * Cambiata l'UIDVALIDITY, l'uid 42 di oggi è un altro messaggio di quello
   * indicizzato ieri: non si può saltare niente e non si può cancellare niente.
   */
  const tanti = Array.from({ length: 500 }, (_, i) => i + 1)
  posta.usaClient(() => finta({ cartelle: { INBOX: tanti }, validita: '99' }))
  const e = await posta.sincronizza(
    { ...conto, cartelle: ['INBOX'], validita: { INBOX: '1' } },
    undefined,
    () => new Set(tanti)
  )
  assert.equal(e.saltati, 0, 'con gli uid rinumerati non si salta niente')
  assert.deepEqual(e.finestre, [])
  assert.equal(e.validita.INBOX, '99')
})

// — quanto manca —

test('il resto dice quanti ce n’erano e quanti ne restano, non solo «non ho finito»', async () => {
  posta.usaClient(() => finta({ cartelle: { INBOX: Array.from({ length: 1000 }, (_, i) => i + 1) } }))
  const e = await posta.sincronizza({ ...conto, cartelle: ['INBOX'] })
  assert.deepEqual(e.resto, { aGiorno: false, totale: 1000, letti: 400, restano: 600 })
})

test('una cartella caduta tiene la fonte fuori dal «tutto dentro»', async () => {
  posta.usaClient(() => finta({ cartelle: { INBOX: [1], Archivio: [2] }, rotte: ['Archivio'] }))
  const e = await posta.sincronizza({ ...conto, cartelle: ['INBOX', 'Archivio'] })
  assert.equal(e.resto.aGiorno, false, 'una cartella che non si è aperta non è «a giorno»')
})
