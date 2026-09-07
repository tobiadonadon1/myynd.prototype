// Mandare in un gesto, senza mandare niente.
//
// Quello che si prova qui è quello che sta attorno alla spedizione, ed è
// esattamente quello che sbaglierebbe in silenzio:
//
//   · una richiesta vuota manda l'email che sta sulla riga — quella vista —
//     e una richiesta con i campi manda quello che la persona ha corretto;
//   · il filo si tiene solo se il destinatario è rimasto chi aveva scritto;
//   · la riga si chiude quando la posta dice che è partita, con «Mandata a…»,
//     e se non parte resta lì, con il guaio nel registro;
//   · una bozza che risponde a una email dell'indice va a chi l'ha scritta,
//     con «Re:» davanti e le intestazioni del filo — senza chiederlo al modello;
//   · un riassunto non è un messaggio, e non si paga un modello per scoprirlo.
//
// La spedizione si sostituisce con `perProva.invia`, il modello con un fetch
// finto sul fornitore compatibile: qui non parte niente, mai.
//
//   node --test server/invio.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-invio-'))
process.env.MYYND_DATI = CASA

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const invio = await import('./invio.ts')
const claude = await import('./claude.ts')
const compatibile = await import('./compatibile.ts')
type DaMandare = import('./connettori/posta.ts').DaMandare

const POSTA = { host: 'imap.esempio.it', porta: 993, utente: 'io@esempio.it', password: 'x' }

before(() => store.azzeraTutto())
after(() => {
  invio.perProva.invia(null)
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

let n = 0
function riga(email: Partial<import('./store.ts').EmailPronta> | null, doc: string | null = null) {
  const id = `i${++n}`
  store.scriviCompito({ id, testo: `Rispondere a Rossi ${n}`, ordine: `o${String(n).padStart(3, '0')}`, doc })
  store.affidaCompito(id, 'bozza')
  store.risultatoCompito(id, 'Gentile Rossi, ecco.', [], 'pronto')
  if (email) {
    store.scriviEmailCompito(id, {
      a: 'rossi@esempio.it', oggetto: 'Re: Preventivo', corpo: 'Gentile Rossi, ecco.', conosciuto: true,
      rispondeA: { messageId: 'm1@esempio.it', references: ['m1@esempio.it'] },
      ...email
    })
  }
  return store.compito(id)!
}

// — cosa sembra un messaggio —

test('una riga che parla di scrivere, o una bozza con un saluto, è un messaggio', () => {
  assert.ok(invio.sembraUnMessaggio('Rispondere a Rossi sul preventivo', 'qualsiasi cosa'))
  assert.ok(invio.sembraUnMessaggio('Preventivo Rossi', 'Gentile Rossi,\necco il preventivo.'))
  assert.ok(invio.sembraUnMessaggio('Preventivo Rossi', 'Oggetto: preventivo\n\ntesto'))
  assert.ok(invio.sembraUnMessaggio('Reply to the supplier', 'Hi John, here it is.'))
  // una riga nata da una email è un messaggio per definizione
  assert.ok(invio.sembraUnMessaggio('Preventivo', 'Un elenco.', ['posta:INBOX:3']))
})

test('un riassunto o un elenco non lo sono: nessun modello si paga per scoprirlo', () => {
  assert.ok(!invio.sembraUnMessaggio('Riassumere la settimana', '- lunedì: riunione\n- martedì: fiera'))
  assert.ok(!invio.sembraUnMessaggio('Cosa ha chiesto il cliente', 'Il cliente vuole il listino nuovo entro marzo.'))
  assert.ok(!invio.sembraUnMessaggio('Preventivo', 'Un elenco.', ['desktop:/x.pdf', null]))
})

// — quello che parte —

test('senza campi parte l’email che sta sulla riga, filo compreso', () => {
  const c = riga({})
  const d = invio.daMandare(c, {})
  assert.ok(d.ok)
  assert.deepEqual(d.ok && d.m, {
    a: 'rossi@esempio.it', oggetto: 'Re: Preventivo', corpo: 'Gentile Rossi, ecco.',
    rispondeA: { messageId: 'm1@esempio.it', references: ['m1@esempio.it'] }
  })
  // anche senza corpo della richiesta del tutto
  assert.ok(invio.daMandare(c, undefined).ok)
})

test('i campi che arrivano vincono su quelli della riga', () => {
  const c = riga({})
  const d = invio.daMandare(c, { corpo: 'Gentile Rossi, ecco — corretto.' })
  assert.ok(d.ok)
  assert.equal(d.ok && d.m.corpo, 'Gentile Rossi, ecco — corretto.')
  assert.equal(d.ok && d.m.a, 'rossi@esempio.it')
  // lo stesso destinatario, scritto con le maiuscole: è ancora lui, il filo resta
  const e = invio.daMandare(c, { a: 'Rossi@Esempio.it' })
  assert.ok(e.ok && e.m.rispondeA)
})

test('cambiato il destinatario, la risposta non è più una risposta', () => {
  const c = riga({})
  const d = invio.daMandare(c, { a: 'bianchi@esempio.it' })
  assert.ok(d.ok)
  assert.equal(d.ok && d.m.rispondeA, null)
})

test('senza un indirizzo valido o senza testo non parte niente', () => {
  const senza = riga(null)
  assert.deepEqual(invio.daMandare(senza, {}), { ok: false, errore: 'Manca un indirizzo valido.' })
  const c = riga({})
  assert.deepEqual(invio.daMandare(c, { a: 'rossi' }), { ok: false, errore: 'Manca un indirizzo valido.' })
  assert.deepEqual(invio.daMandare(c, { corpo: '   ' }), { ok: false, errore: 'Il messaggio è vuoto.' })
})

// — mandare, con una posta finta —

test('mandata: la riga si chiude con «Mandata a …», e il registro lo sa', async () => {
  const mandate: DaMandare[] = []
  invio.perProva.invia(async (_c, m) => { mandate.push(m); return { id: 'finto' } })
  const c = riga({})
  const d = invio.daMandare(c, {})
  assert.ok(d.ok)
  await invio.manda(c, POSTA, d.ok ? d.m : { a: '', oggetto: '', corpo: '' })

  assert.equal(mandate.length, 1)
  assert.equal(mandate[0].a, 'rossi@esempio.it')
  assert.deepEqual(mandate[0].rispondeA, { messageId: 'm1@esempio.it', references: ['m1@esempio.it'] })

  const dopo = store.compito(c.id)!
  assert.equal(dopo.stato, 'fatto')
  assert.equal(dopo.esito, 'Mandata a rossi@esempio.it.')
  assert.equal(dopo.risultato, 'Gentile Rossi, ecco.')
  const azione = store.azioni(10).find(a => a.compito === c.id)
  assert.equal(azione?.esito, 'fatta')
  assert.equal(azione?.verso, 'rossi@esempio.it')
})

test('non mandata: la riga resta pronta, e il registro dice perché', async () => {
  invio.perProva.invia(async () => { throw new Error('SMTP: connessione rifiutata') })
  const c = riga({})
  const d = invio.daMandare(c, {})
  await assert.rejects(
    () => invio.manda(c, POSTA, d.ok ? d.m : { a: '', oggetto: '', corpo: '' }),
    /connessione rifiutata/
  )
  assert.equal(store.compito(c.id)!.stato, 'pronto')
  const azione = store.azioni(10).find(a => a.compito === c.id)
  assert.equal(azione?.esito, 'fallita')
  assert.match(azione?.dettaglio ?? '', /connessione rifiutata/)
})

// — la risposta a una email dell'indice —

/**
 * Il fornitore finto: qualunque cosa gli si chieda, risponde con l'email
 * smontata in cui il destinatario è *sbagliato* apposta. Se il destinatario
 * giusto arriva lo stesso, è perché non lo si è chiesto a lui.
 */
function modelloFinto(risposta: Record<string, unknown>): Record<string, unknown>[] {
  const viste: Record<string, unknown>[] = []
  compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    viste.push(corpo)
    const contenuto = JSON.stringify(risposta)
    if (corpo.stream) {
      const righe = [
        `data: ${JSON.stringify({ id: 'x', model: 'finto', choices: [{ index: 0, delta: { role: 'assistant', content: contenuto }, finish_reason: null }] })}`,
        `data: ${JSON.stringify({ id: 'x', model: 'finto', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
        'data: [DONE]', ''
      ]
      return new Response(righe.join('\n\n'), { headers: { 'content-type': 'text/event-stream' } })
    }
    return Response.json({
      id: 'x', model: 'finto',
      choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 }
    })
  }) as typeof fetch)
  return viste
}

const mail = (id: string, sopra: Partial<Documento> = {}): Documento => ({
  id: `posta:INBOX:${id}`, fonte: 'posta', tipo: 'email', titolo: 'Preventivo impianto',
  corpo: 'Buongiorno, mi mandate il preventivo? Grazie, Rossi', autore: 'Mario Rossi <mario.rossi@esempio.it>',
  percorso: 'INBOX', quando: '2026-09-01T10:00:00.000Z', gruppo: 'posta',
  filo: 'radice@esempio.it', messageId: 'm7@esempio.it', ...sopra
})

test('una bozza che risponde a una email va a chi l’ha scritta, con «Re:» e il filo', async () => {
  cfg.scrivi({
    motore: 'compatibile', compatibile: { url: 'https://finto.test/v1', modello: 'finto', nome: 'Finto' },
    locale: { attivo: false }
  })
  store.salvaDocumenti([mail('7')])
  const viste = modelloFinto({ a: 'sbagliato@altrove.it', oggetto: 'Un oggetto inventato', corpo: 'Gentile Rossi,\necco il preventivo.' })

  const e = await claude.preparaEmail('Rispondere a Rossi', 'Gentile Rossi,\necco il preventivo.\n\n(nota per te: l\'ho preso dal listino)', [
    { id: 'posta:INBOX:7', label: '[1] Preventivo impianto' }
  ])
  assert.ok(e)
  assert.equal(e.a, 'mario.rossi@esempio.it')
  assert.equal(e.oggetto, 'Re: Preventivo impianto')
  assert.equal(e.corpo, 'Gentile Rossi,\necco il preventivo.')
  assert.deepEqual(e.rispondeA, { messageId: 'm7@esempio.it', references: ['radice@esempio.it', 'm7@esempio.it'] })
  // una chiamata sola, al modello piccolo: è quella che smonta il testo
  assert.equal(viste.length, 1)
  assert.match(JSON.stringify(viste[0]), /risponde al messaggio/)
})

test('l’email da cui è nata la riga (`doc`) vale prima delle fonti, e «Re:» non si raddoppia', async () => {
  store.salvaDocumenti([mail('8', { titolo: 'RE: Preventivo impianto', autore: 'Anna <anna@esempio.it>', messageId: 'm8@esempio.it' })])
  modelloFinto({ a: '', oggetto: '', corpo: 'Ciao Anna, va bene.' })
  const e = await claude.preparaEmail('Rispondere', 'Ciao Anna, va bene.', [{ id: 'posta:INBOX:7', label: '[1]' }], 'posta:INBOX:8')
  assert.ok(e)
  assert.equal(e.a, 'anna@esempio.it')
  assert.equal(e.oggetto, 'RE: Preventivo impianto')
  assert.equal(e.rispondeA?.messageId, 'm8@esempio.it')
})

test('a una email che ha scritto lei non si risponde: non è una risposta a sé stessa', async () => {
  store.salvaDocumenti([mail('9', { autore: 'Io <io@esempio.it>', inviato: true, percorso: 'Inviata' })])
  modelloFinto({ a: 'cliente@esempio.it', oggetto: 'Seguito', corpo: 'Buongiorno, un seguito.' })
  const e = await claude.preparaEmail('Scrivere un seguito', 'Buongiorno, un seguito.', [{ id: 'posta:INBOX:9', label: '[1]' }])
  assert.ok(e)
  assert.equal(e.a, 'cliente@esempio.it')
  assert.equal(e.oggetto, 'Seguito')
  assert.equal(e.rispondeA, null)
})

test('senza Message-ID la risposta parte come email nuova, ma va comunque a chi ha scritto', async () => {
  store.salvaDocumenti([mail('10', { messageId: null, filo: 's:preventivo impianto' })])
  modelloFinto({ a: '', oggetto: '', corpo: 'Gentile Rossi, ecco.' })
  const e = await claude.preparaEmail('Rispondere a Rossi', 'Gentile Rossi, ecco.', [{ id: 'posta:INBOX:10', label: '[1]' }])
  assert.ok(e)
  assert.equal(e.a, 'mario.rossi@esempio.it')
  assert.equal(e.oggetto, 'Re: Preventivo impianto')
  assert.equal(e.rispondeA, null)
})
