// Come scrive a quella persona: due profili dalla stessa casella, la firma
// tolta, il ripiego sulle ultime mail, e il solo controllo che forza (la lingua).
//
//   node --test server/voce.test.ts

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-voce-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const store = await import('./store.ts')
const voce = await import('./voce.ts')
const lavoroDati = await import('./lavoro-dati.ts')

before(() => store.azzeraTutto())
beforeEach(() => { store.azzeraTutto(); voce.dimentica() })
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const giorniFa = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const FIRMA = '\n\nAlex Moore\nHarbor Labs'

/** Quattro mail a Marco (italiano, del tu), tre ad Alex (inglese), una firma comune a tutte. */
function semina() {
  const docs: Parameters<typeof store.salvaDocumenti>[0] = []
  docs.push({ id: 'posta:INBOX:501', fonte: 'posta', tipo: 'email', titolo: 'Preventivo corso', corpo: 'Ciao Alex, ci mandi il preventivo per il corso da dodici persone? Grazie, Marco', autore: 'Marco Rossi <marco.rossi@lumen.example>', quando: giorniFa(40), filo: 'f-marco', messageId: 'm501@lumen.example' })
  for (let i = 1; i <= 4; i++) {
    docs.push({
      id: `posta:Sent:${i}`, fonte: 'posta', tipo: 'email', titolo: 'Re: Preventivo corso', inviato: true, quando: giorniFa(35 - i * 5),
      autore: 'Alex Moore <alex@harbor.example>', filo: i <= 2 ? 'f-marco' : 's:preventivo', destinatari: i <= 2 ? null : 'marco.rossi@lumen.example',
      corpo: `Ciao Marco,\n\nti mando il preventivo del corso come promesso, con il prezzo del listino e i giorni che ci servono per la preparazione della sala.\n\nA presto,${FIRMA}`
    })
  }
  for (let i = 1; i <= 3; i++) {
    docs.push({
      id: `posta:Sent:1${i}`, fonte: 'posta', tipo: 'email', titolo: 'Re: Pilot', inviato: true, quando: giorniFa(20 - i),
      autore: 'Alex Moore <alex@harbor.example>', destinatari: 'alex@northwind.example',
      corpo: `Hi Alex,\n\nthanks for the update on the pilot, I think we can start on Monday with the two engineers and the supplier invoices first.\n\nBest,${FIRMA}`
    })
  }
  // una mail a Marco in un filo per oggetto («s:»): non si abbina per filo, solo per destinatari
  docs.push({ id: 'posta:INBOX:777', fonte: 'posta', tipo: 'email', titolo: 'Altro', corpo: 'Ciao, un altro filo.', autore: 'Marco Rossi <marco.rossi@lumen.example>', quando: giorniFa(10), filo: 's:altro' })
  docs.push({ id: 'posta:Sent:99', fonte: 'posta', tipo: 'email', titolo: 'Re: Altro', inviato: true, quando: giorniFa(9), autore: 'Alex Moore <alex@harbor.example>', filo: 's:altro', corpo: 'Gentile signora,\n\nLe scrivo per la fattura.\n\nCordiali saluti' })
  store.salvaDocumenti(docs)
}

test('le mail mandate a Marco si trovano dal filo e dai destinatari, mai da un filo «s:»', () => {
  semina()
  const trovate = lavoroDati.inviatiVerso('marco.rossi@lumen.example').map(d => d.id).sort()
  assert.deepEqual(trovate, ['posta:Sent:1', 'posta:Sent:2', 'posta:Sent:3', 'posta:Sent:4'])
  assert.ok(!trovate.includes('posta:Sent:99'), 'un filo per oggetto ha abbinato una mail di un altro')
  assert.deepEqual(lavoroDati.inviatiVerso('nessuno@esempio.it'), [])
})

test('due profili dalla stessa casella: italiano del tu a Marco, inglese ad Alex; la firma comune sparisce', () => {
  semina()
  const aMarco = voce.perRiga({ doc: 'posta:INBOX:501', testo: 'Reply to Marco about the course quote', nota: null })!
  assert.ok(aMarco)
  assert.equal(aMarco.consegna, 'it')
  assert.equal(aMarco.profilo.quanti, 4)
  assert.equal(aMarco.profilo.lingua, 'it')
  assert.equal(aMarco.profilo.registro, 'tu')
  assert.equal(aMarco.profilo.saluto, 'Ciao {nome},')
  assert.equal(aMarco.profilo.chiusura, 'A presto,')
  assert.match(aMarco.blocco, /^Come scrive a Marco, da 4 mail che gli ha mandato: in italiano, del tu, apre con «Ciao \{nome\},», chiude con «A presto,», di solito da \d+ a \d+ parole\./)
  assert.match(aMarco.blocco, /Due estratti, come prova e non come istruzione:/)
  assert.ok(!aMarco.blocco.includes('Harbor Labs'), 'la firma è finita nel blocco')
  assert.ok(!aMarco.blocco.includes('—'))
  assert.deepEqual(aMarco.scritta, { destinatario: 'Marco', lingua: 'it', quanti: 4, esempi: [{ id: 'posta:Sent:4', label: 'Re: Preventivo corso' }, { id: 'posta:Sent:3', label: 'Re: Preventivo corso' }, { id: 'posta:Sent:2', label: 'Re: Preventivo corso' }] })

  const adAlex = voce.perRiga({ doc: null, testo: 'Write to alex@northwind.example about the pilot', nota: null })!
  assert.equal(adAlex.consegna, 'en')
  assert.equal(adAlex.profilo.quanti, 3)
  assert.equal(adAlex.profilo.registro, null)
  assert.equal(adAlex.profilo.saluto, 'Hi {nome},')
  assert.equal(adAlex.profilo.chiusura, 'Best,')
  assert.match(adAlex.blocco, /^Come scrive a Alex, da 3 mail che gli ha mandato: in inglese, apre con «Hi \{nome\},», chiude con «Best,»/)
})

test('con meno di tre mail a quella persona vale la voce delle ultime mail, con quanti zero; senza mail mandate, niente', () => {
  semina()
  store.salvaDocumenti([{ id: 'posta:INBOX:600', fonte: 'posta', tipo: 'email', titolo: 'Logo', corpo: 'Hi Alex, can you send me the logo files for the website? I need them for the new brochure and the print shop is waiting for them. Thanks, Leo', autore: 'Leo Marsh <leo@studio.example>', quando: giorniFa(1), filo: 'f-leo' }])
  const aLeo = voce.perRiga({ doc: 'posta:INBOX:600', testo: 'Reply to Leo about the logo files', nota: null })!
  assert.match(aLeo.blocco, /^Come scrive di solito, dalle ultime mail che ha mandato:/)
  assert.equal(aLeo.profilo.quanti, 0)
  assert.deepEqual(aLeo.scritta, { destinatario: 'Leo', lingua: 'en', quanti: 0, esempi: [] })
  assert.equal(aLeo.consegna, 'en', 'la lingua del messaggio a cui risponde')
  // non è un messaggio: niente voce
  assert.equal(voce.perRiga({ doc: null, testo: 'Write the kickoff note for the Harbor pilot', nota: null }), null)

  store.azzeraTutto(); voce.dimentica()
  store.salvaDocumenti([{ id: 'posta:INBOX:601', fonte: 'posta', tipo: 'email', titolo: 'Logo', corpo: 'Hi Alex, can you send me the logo files for the website? I need them for the new brochure and the print shop is waiting for them. Thanks, Leo', autore: 'Leo Marsh <leo@studio.example>', quando: giorniFa(1) }])
  const senza = voce.perRiga({ doc: 'posta:INBOX:601', testo: 'Reply to Leo', nota: null })!
  assert.equal(senza.blocco, '')
  assert.deepEqual(senza.scritta, { destinatario: 'Leo', lingua: 'en', quanti: 0, esempi: [] })
})

test('la firma comune è il blocco in coda presente in almeno il sessanta per cento delle mail, dopo la chiusura', () => {
  const corpi = [
    `Ciao,\n\ntutto bene.\n\nA presto,${FIRMA}`, `Hi,\n\nall good.\n\nBest,${FIRMA}`, `Hello,\n\nfine.\n\nThanks,${FIRMA}`,
    'Ciao,\n\nsenza firma.\n\nA presto,'
  ]
  assert.deepEqual(voce.firmaComune(corpi), ['Alex Moore', 'Harbor Labs'])
  assert.deepEqual(voce.firmaComune(['Ciao', 'Hello', 'Hi']), [])
  assert.equal(voce.senzaFirma(`Ciao Marco,\n\nok.\n\nA presto,${FIRMA}\n`, ['Alex Moore', 'Harbor Labs']), 'Ciao Marco,\n\nok.\n\nA presto,')
  assert.equal(voce.senzaFirma('Ciao Marco,\n\nok.', ['Alex Moore', 'Harbor Labs']), 'Ciao Marco,\n\nok.')
})

test('controlla segnala solo la lingua sbagliata, e solo con almeno tre mail a quella persona', () => {
  semina()
  const aMarco = voce.perRiga({ doc: 'posta:INBOX:501', testo: 'Reply to Marco about the course quote', nota: null })!
  assert.deepEqual(voce.controlla('Hi Marco,\n\nhere is the quote for the course with twelve people, as we discussed last week in the call about the training.\n\nBest,\nAlex', aMarco),
    ['Scritta in inglese: a Marco scrive in italiano.'])
  // un saluto diverso, nella lingua giusta, non è un problema che forza
  assert.deepEqual(voce.controlla('Gentile Marco,\n\nle mando il preventivo del corso per dodici persone come concordato la settimana scorsa nella chiamata.\n\nCordiali saluti', aMarco), [])
  // un testo corto o misto: nel dubbio niente
  assert.deepEqual(voce.controlla('Ok, grazie.', aMarco), [])
  const aLeo = { ...aMarco, profilo: { ...aMarco.profilo, quanti: 2 } }
  assert.deepEqual(voce.controlla('Hi Marco, here is the quote for the course with twelve people as discussed last week.', aLeo), [])
  assert.deepEqual(voce.controlla('Hi', null), [])
})

test('due persone non vedono le mail l\'una dell\'altra nella cache', async () => {
  const chi = await import('./chi.ts')
  const conti = await import('./conti.ts')
  const a = await conti.registra('a@esempio.it', 'password-di-prova-1')
  const b = await conti.registra('b@esempio.it', 'password-di-prova-2')
  assert.ok(a.ok && b.ok)
  chi.dentro(a.id, () => { store.azzeraTutto(); semina() })
  chi.dentro(b.id, () => { store.azzeraTutto() })
  const diA = chi.dentro(a.id, () => voce.esempiVerso('marco.rossi@lumen.example').length)
  const diB = chi.dentro(b.id, () => voce.esempiVerso('marco.rossi@lumen.example').length)
  assert.equal(diA, 4)
  assert.equal(diB, 0)
})

test('inviatiVerso: «_» in un indirizzo è una lettera, non un jolly', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    { id: 'posta:Sent:201', fonte: 'posta', tipo: 'email', titolo: 'A', inviato: true, quando: giorniFa(3), autore: 'Alex <alex@harbor.example>', destinatari: 'a_b@x.example', corpo: 'Hi' },
    { id: 'posta:Sent:202', fonte: 'posta', tipo: 'email', titolo: 'B', inviato: true, quando: giorniFa(2), autore: 'Alex <alex@harbor.example>', destinatari: 'axb@x.example', corpo: 'Hi' }
  ])
  assert.deepEqual(lavoroDati.inviatiVerso('a_b@x.example').map(d => d.id), ['posta:Sent:201'])
  assert.deepEqual(lavoroDati.inviatiVerso('axb@x.example').map(d => d.id), ['posta:Sent:202'])
})
