// Il punto: cosa gli si manda, quando si chiama il modello, e cosa resta scritto.
//
// Il modello qui è finto — un fornitore compatibile che risponde sempre lo
// stesso punto e si ricorda cosa ha ricevuto — perché quello che va provato
// non è la qualità del testo: è che il materiale sia quello giusto e tagliato,
// che il cancello tenga (tre al giorno, tre ore, niente su niente di nuovo),
// che le quattro sezioni siano quelle e solo quelle, e soprattutto che le cose
// da fare finiscano in lista con dentro il documento da cui vengono — che è
// tutto il senso del cambio: «quello lo devi mettere nel mio feed, non lì».
//
// L'orologio del punto si passa a mano, ma `indicizzato` dei documenti è
// quello vero: per questo ogni prova prende «adesso» *dopo* aver seminato, e
// aspetta qualche millisecondo prima di far entrare un documento «nuovo».
//
//   node --test server/punto.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-punto-'))
process.env.MYYND_DATI = CASA
// la chiave di casa non deve entrare in queste prove
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const compatibile = await import('./compatibile.ts')
const punto = await import('./punto.ts')
const progetti = await import('./progetti.ts')
const chi = await import('./chi.ts')
const conti = await import('./conti.ts')
const timone = await import('./timone.ts')

before(() => pulisci())
after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

/** Da capo: l'indice, il registro delle azioni, e il foglio del punto. */
function pulisci() {
  store.azzeraTutto()
  store.default.exec('DELETE FROM azioni; DELETE FROM notizie')
  rmSync(punto.perProva.file(), { force: true })
}

const doc = (id: string, titolo: string, sopra: Partial<Documento> = {}): Documento => ({
  id, fonte: 'posta', tipo: 'email', titolo, corpo: `Il testo di ${titolo}. `.repeat(40),
  autore: 'Rossi <rossi@esempio.it>', percorso: 'INBOX',
  quando: '2026-09-07T10:00:00.000Z', gruppo: 'posta', ...sopra
})

/** Una notizia da GitHub, come la porta il connettore: «repo #12: titolo». */
const suGithub = (id: string, titolo: string, sopra: Partial<Documento> = {}): Documento =>
  doc(id, titolo, { fonte: 'github', tipo: 'attività', autore: 'tobiadonadon', gruppo: 'codice', percorso: null, ...sopra })

/** Il progetto di cui parla il modello finto: senza riga in tabella, non passa. */
const seminaProgetto = () => progetti.scrivi({ nome: 'Myynd', obiettivo: 'Un gemello che sceglie per lui.' })

const RISPOSTA = {
  progetti: [{ nome: 'Myynd', novita: 'Il punto adesso ha quattro sezioni.', doc: 'posta:INBOX:1' }],
  github: [],
  daLeggere: [{ titolo: 'Notizia sui modelli', perche: 'C’entra con Myynd.' }],
  risposte: [],
  compiti: []
}

/**
 * Un fornitore compatibile finto: risponde con questo punto e si ricorda cosa ha ricevuto.
 *
 * L'app qui è in italiano, ed è una dichiarazione e non un dettaglio: il punto
 * finto qui sopra è scritto in italiano, e da quando il punto controlla la
 * lingua di quello che torna un punto italiano dentro un'app inglese viene
 * buttato — che è esattamente quello che si vuole. Le prove della lingua stanno
 * in fondo al file, e l'app se la scelgono loro.
 */
function fornitoreFinto(risposta: object = RISPOSTA, lingua: 'it' | 'en' = 'it') {
  cfg.scrivi({ lingua, motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: Record<string, unknown>[] = []
  compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    return Response.json({
      id: 'chatcmpl-1', model: 'gpt-prova',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(risposta) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    })
  }) as typeof fetch)
  return ricevute
}

/** Lo stesso fornitore, ma il conto è a secco: è quello che è successo davvero. */
function fornitoreSenzaCredito(): () => number {
  cfg.scrivi({ lingua: 'it', motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  let chiamate = 0
  compatibile.usaRete((async () => {
    chiamate++
    return new Response(JSON.stringify({ error: { message: 'insufficient_quota' } }), { status: 402 })
  }) as typeof fetch)
  return () => chiamate
}

/** Tutto il testo mandato al modello, system e messaggi insieme. */
const testoDi = (r: Record<string, unknown>) =>
  (r.messages as { content: string }[]).map(m => m.content).join('\n')
/** Solo l'istruzione: è lì che stanno i progetti e le regole delle sezioni. */
const istruzioneDi = (r: Record<string, unknown>) =>
  String((r.messages as { role: string; content: string }[]).find(m => m.role === 'system')?.content)

/** Una lista con una riga pronta, una che chiede, una per oggi e una chiusa. */
function seminaLista() {
  store.scriviCompito({ id: 'c1', testo: 'Rispondere a Bianchi', ordine: 'a', quando: 'oggi' })
  store.affidaCompito('c1', 'bozza')
  store.risultatoCompito('c1', 'Gentile Bianchi, ecco il preventivo aggiornato.', [])
  store.scriviCompito({ id: 'c2', testo: 'Preparare il contratto', ordine: 'b', quando: 'oggi' })
  store.affidaCompito('c2', 'bozza')
  store.risultatoCompito('c2', 'Mi manca la data di inizio.', [], 'chiede')
  store.scriviCompito({ id: 'c3', testo: 'Chiamare lo studio', ordine: 'c', quando: 'oggi' })
  store.scriviCompito({ id: 'c4', testo: 'Pagare la fattura di marzo', ordine: 'd', quando: 'oggi' })
  store.cambiaStatoCompito('c4', 'fatto')
}

const ore = (n: number) => n * 3600_000
const minuti = (n: number) => n * 60_000
/** «Adesso», un millisecondo dopo tutto quello che è già stato scritto. */
const adesso = () => Date.now() + 1
/** Perché il prossimo documento risulti entrato *dopo* l'ultimo punto. */
const unAttimo = () => new Promise(r => setTimeout(r, 5))

// — il materiale —

test('il materiale: i documenti arrivati (senza la posta in massa, al massimo venti), la lista, il feed, il fuoco', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([
    doc('posta:INBOX:1', 'Preventivo Rossi'),
    doc('posta:INBOX:2', 'Offerte della settimana', { autore: 'Vinted <noreply@vinted.com>' }),
    ...Array.from({ length: 30 }, (_, i) => doc(`posta:INBOX:${100 + i}`, `Email numero ${i}`))
  ])
  seminaLista()
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Il deck per lunedì è a metà', testo: 'Mancano due slide.', fonte: 'desktop' }])
  timone.scriviFuoco('Questa settimana solo i preventivi.')
  store.ricorda({ enunciato: 'Non fa sconti al primo giro.', ambito: 'persona', genere: 'esplicita', fiducia: 1, origine: 'mano' })

  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const e = await punto.punto({ via: 240 }, t0)
  assert.equal(ricevute.length, 1, 'il modello va chiamato una volta')
  assert.ok(e.generatoAdesso)
  const mandato = testoDi(ricevute[0])

  assert.match(mandato, /id: posta:INBOX:1\n  Preventivo Rossi/)
  assert.doesNotMatch(mandato, /Offerte della settimana/, 'la posta in massa è entrata nel punto')
  assert.equal((mandato.match(/— id: /g) ?? []).length, 20, 'i documenti non sono tagliati a venti')
  // duecento caratteri di corpo, non il documento intero
  assert.ok(!mandato.includes('Il testo di Preventivo Rossi. '.repeat(10)), 'il corpo intero è finito nel prompt')

  assert.match(mandato, /Aspettano lui:[\s\S]*\[c1\] Rispondere a Bianchi \(pronto, per oggi\)\n  bozza: Gentile Bianchi/)
  assert.match(mandato, /\[c2\] Preparare il contratto \(chiede/)
  assert.match(mandato, /Aperte per oggi:[\s\S]*Chiamare lo studio/)
  assert.match(mandato, /Chiuse da allora:[\s\S]*Pagare la fattura di marzo/)
  assert.match(mandato, /SUL FEED[\s\S]*Il deck per lunedì è a metà/)
  assert.match(mandato, /concentrarti su questo[\s\S]*solo i preventivi/)
  assert.match(mandato, /Non fa sconti al primo giro/)
  assert.match(mandato, /È stato via circa 4 ore/)
  // senza GitHub e senza risposte le due sezioni si dicono vuote, invece di tacere
  assert.match(mandato, /SU GITHUB: niente/)
  assert.match(mandato, /HANNO RISPOSTO: nessuno/)
  // l'istruzione va nel blocco che si mette in cache, il materiale nel messaggio
  assert.match(istruzioneDi(ricevute[0]), /Sei Myynd\. Questa persona torna/)
  assert.doesNotMatch(istruzioneDi(ricevute[0]), /ARRIVATO/)

  // e quello che torna è ricucito: gli id passano solo se stanno nel materiale
  assert.equal(e.punto?.via, 240, 'l’assenza la porta la richiesta, non il modello')
  assert.equal(e.punto?.progetti[0].nome, 'Myynd')
  assert.equal(e.punto?.progetti[0].novita, 'Il punto adesso ha quattro sezioni.')
  assert.equal(e.punto?.progetti[0].doc, 'posta:INBOX:1')
})

/** Un file sul disco, con il percorso che decide se è una notizia. */
const file = (percorso: string, quando = '2026-09-07T10:00:00.000Z'): Documento => ({
  id: `desktop:${percorso}`, fonte: 'desktop', tipo: 'documento',
  titolo: percorso.slice(percorso.lastIndexOf('/') + 1),
  corpo: 'Il testo del file, abbastanza lungo da contare come documento.',
  autore: null, percorso, quando, gruppo: 'documenti'
})

test('dal disco entra un documento vero, non un log di terminale', () => {
  pulisci()
  const dal = new Date(Date.now() - 60_000).toISOString()
  store.salvaDocumenti([
    file('/Users/x/terminals/1.txt'),
    file('/Users/x/Documents/Contratto.pdf'),
    file('/Users/x/Desktop/Fattura.pdf'),
    file('/Users/x/Library/Mobile Documents/com~apple~CloudDocs/Bozza.docx'),
    file('/Users/x/Downloads/appunti.md'),
    file('/Users/x/Documents/Archivio/2025/Vecchia.pdf'),
    file('/Users/tobiadonadon/Desktop/myynd.prototype/server/punto.ts')
  ])
  const ids = punto.raccogli(dal).arrivati.map(d => d.id)
  assert.ok(!ids.includes('desktop:/Users/x/terminals/1.txt'), 'un log di terminale è una notizia')
  assert.ok(ids.includes('desktop:/Users/x/Documents/Contratto.pdf'), 'un contratto nei documenti non è entrato')
  assert.ok(ids.includes('desktop:/Users/x/Desktop/Fattura.pdf'))
  assert.ok(ids.includes('desktop:/Users/x/Library/Mobile Documents/com~apple~CloudDocs/Bozza.docx'))
  assert.ok(!ids.includes('desktop:/Users/x/Downloads/appunti.md'), 'un markdown non è un documento arrivato')
  assert.ok(!ids.includes('desktop:/Users/x/Documents/Archivio/2025/Vecchia.pdf'), 'tre cartelle sotto è archivio')
  assert.ok(!ids.includes('desktop:/Users/tobiadonadon/Desktop/myynd.prototype/server/punto.ts'))
})

test('dal disco al massimo cinque, i più recenti', () => {
  pulisci()
  const dal = new Date(Date.now() - 60_000).toISOString()
  store.salvaDocumenti([
    ...Array.from({ length: 8 }, (_, i) => file(`/Users/x/Documents/Contratto ${i}.pdf`)),
    doc('posta:INBOX:1', 'Preventivo Rossi'),
    doc('posta:INBOX:2', 'Fattura Bianchi')
  ])
  const m = punto.raccogli(dal)
  assert.equal(m.arrivati.filter(d => d.fonte === 'desktop').length, 5, 'dal disco ne sono passati più di cinque')
  assert.equal(m.arrivati.filter(d => d.fonte === 'posta').length, 2, 'la posta è stata tagliata insieme al disco')
  assert.equal(m.indicizzati, 7, 'il conto dice anche quello che non è una notizia')
})

// — le quattro domande —
//
// Le sezioni sono quelle che ha chiesto lui, e nessun'altra: i progetti che si
// sono mossi, GitHub, una notizia, chi ha risposto. Quello che le riempie deve
// venire dal materiale, e ogni riga deve poter aprire qualcosa.

test('GitHub: le righe escono solo se ci sono documenti di GitHub', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  fornitoreFinto({
    ...RISPOSTA,
    github: [{ testo: 'La pipeline di myynd è fallita.', doc: 'posta:INBOX:1' }]
  })
  const senza = await punto.punto({}, adesso())
  assert.deepEqual(senza.punto?.github, [], 'una riga di GitHub è uscita senza GitHub')

  // adesso il connettore c'è, e porta due notizie dal repository
  pulisci()
  store.salvaDocumenti([
    doc('posta:INBOX:1', 'Preventivo Rossi'),
    suGithub('github:myynd#12', 'myynd #12: il punto a quattro sezioni'),
    suGithub('github:myynd#13', 'myynd #13: la vedetta sulle cartelle')
  ])
  const ricevute = fornitoreFinto({
    ...RISPOSTA,
    github: [
      { testo: 'La #12 di myynd è stata unita.', doc: 'github:myynd#12' },
      { testo: 'La #13 aspetta una revisione.', doc: 'github:myynd#13' },
      // senza un documento dietro la freccia non apre niente: non esce
      { testo: 'Qualcosa si muove sul repository.', doc: '' }
    ]
  })
  const e = await punto.punto({}, adesso())
  assert.match(testoDi(ricevute[0]), /SU GITHUB \(da allora\):[\s\S]*myynd #12/)
  assert.deepEqual(e.punto?.github.map(r => r.doc), ['github:myynd#12', 'github:myynd#13'])
  assert.equal(e.punto?.github[0].testo, 'La #12 di myynd è stata unita.')
})

test('risposte: solo le mail che continuano una conversazione sua', async () => {
  pulisci()
  store.salvaDocumenti([
    // una risposta dall'oggetto
    doc('posta:INBOX:20', 'Re: preventivo per la sede nuova', { autore: 'Verdi <verdi@esempio.it>' }),
    // una mail dentro un filo dove ha scritto anche lui
    doc('posta:INBOX:0', 'Il listino aggiornato', { filo: 'f1', inviato: true, autore: 'Io <io@esempio.it>' }),
    doc('posta:INBOX:21', 'Il listino aggiornato, seconda parte', { filo: 'f1', autore: 'Anna <anna@esempio.it>' }),
    // e una che arriva e basta
    doc('posta:INBOX:22', 'Preventivo Rossi')
  ])
  const m = punto.raccogli(new Date(Date.now() - 60_000).toISOString())
  assert.deepEqual(m.risposte.map(d => d.id).sort(), ['posta:INBOX:20', 'posta:INBOX:21'])
  assert.ok(!m.arrivati.some(d => d.id === 'posta:INBOX:20'), 'una risposta è stata detta due volte')

  const ricevute = fornitoreFinto({
    ...RISPOSTA,
    risposte: [
      { testo: 'Verdi chiede il preventivo per la sede.', doc: 'posta:INBOX:20' },
      // una mail che non è una risposta non entra in questa sezione
      { testo: 'Rossi ha mandato un preventivo nuovo.', doc: 'posta:INBOX:22' }
    ]
  })
  const e = await punto.punto({}, adesso())
  assert.match(testoDi(ricevute[0]), /HANNO RISPOSTO \(email dentro conversazioni dove ha scritto anche lui\):/)
  assert.deepEqual(e.punto?.risposte.map(r => r.doc), ['posta:INBOX:20'])
})

test('un id che non sta nel materiale non passa, nemmeno se il modello lo scrive', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  fornitoreFinto({
    ...RISPOSTA,
    progetti: [{ nome: 'Myynd', novita: 'Una cosa.', doc: 'posta:INBOX:999' }]
  })
  const e = await punto.punto({}, adesso())
  assert.equal(e.punto?.progetti[0].doc, null)
})

test('un progetto che non sta in tabella non entra: il punto ne parla, non ne inventa', async () => {
  pulisci()
  const vero = progetti.scrivi({ nome: 'Nextas', obiettivo: 'Chiudere il round seed entro ottobre' })
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  fornitoreFinto({
    ...RISPOSTA,
    progetti: [
      { nome: 'nextas', novita: 'Bianchi ha confermato il term sheet.', doc: 'posta:INBOX:1' },
      { nome: 'Orto', novita: 'I semi sono arrivati.', doc: '' }
    ]
  })
  const e = await punto.punto({}, adesso())
  assert.deepEqual(e.punto?.progetti.map(p => p.nome), ['Nextas'], 'un progetto inventato è entrato nel punto')
  assert.equal(e.punto?.progetti[0].id, vero.id)
  assert.equal(progetti.trovaPerNome('Orto'), undefined, 'il punto ha scritto un progetto in tabella')
})

test('le lineette non arrivano in pagina: il modello le scrive dappertutto, il punto le toglie', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([
    doc('posta:INBOX:1', 'Preventivo Rossi'),
    doc('posta:INBOX:20', 'Re: la sede nuova', { autore: 'Verdi <verdi@esempio.it>' }),
    suGithub('github:myynd#12', 'myynd #12: il punto')
  ])
  store.salvaNotizie([{
    id: 'n1', titolo: 'I modelli piccoli — la svolta', riassunto: 'Girano su un portatile.',
    perche: null, fonte: 'Prova', link: 'https://esempio.test/n1', argomento: 'lavoro',
    quando: new Date().toISOString()
  }])

  fornitoreFinto({
    progetti: [{ nome: 'Myynd', novita: 'Il punto è in lavorazione — quasi pronto.', doc: 'posta:INBOX:1' }],
    github: [{ testo: 'La #12 è stata unita — ieri sera.', doc: 'github:myynd#12' }],
    daLeggere: [{ titolo: 'I modelli piccoli — la svolta', perche: 'C’entra con Myynd — da leggere oggi.' }],
    risposte: [{ testo: 'Verdi conferma la sede — con le date.', doc: 'posta:INBOX:20' }],
    compiti: []
  })

  const e = await punto.punto({}, adesso())
  assert.ok(e.generatoAdesso)
  const tutto = JSON.stringify(e.punto)
  assert.doesNotMatch(tutto, /[—–]/, `una lineetta è arrivata in pagina: ${tutto}`)
  // l'inciso non sparisce: diventa una frase sua, con la maiuscola
  assert.equal(e.punto?.progetti[0].novita, 'Il punto è in lavorazione. Quasi pronto.')
  assert.equal(e.punto?.github[0].testo, 'La #12 è stata unita. Ieri sera.')
  assert.equal(e.punto?.daLeggere[0].titolo, 'I modelli piccoli. La svolta')
  assert.equal(e.punto?.daLeggere[0].perche, 'C’entra con Myynd. Da leggere oggi.')
  assert.equal(e.punto?.risposte[0].testo, 'Verdi conferma la sede. Con le date.')
})

test('le sezioni sono tagliate corte, e una riga lunga si accorcia a centoventi', async () => {
  pulisci()
  store.salvaDocumenti([
    suGithub('github:myynd#12', 'myynd #12'),
    suGithub('github:myynd#13', 'myynd #13'),
    suGithub('github:myynd#14', 'myynd #14'),
    suGithub('github:myynd#15', 'myynd #15')
  ])
  const lunga = 'Una riga che va avanti e non finisce mai, con dentro tutto quello che il modello ha trovato nel materiale di oggi e anche di ieri.'
  fornitoreFinto({
    ...RISPOSTA,
    github: [
      { testo: lunga, doc: 'github:myynd#12' },
      { testo: 'La seconda, sul deploy.', doc: 'github:myynd#13' },
      { testo: 'La terza, sulla revisione.', doc: 'github:myynd#14' },
      { testo: 'La quarta, che non deve passare.', doc: 'github:myynd#15' }
    ]
  })
  const e = await punto.punto({}, adesso())
  assert.equal(e.punto?.github.length, 3, 'la quarta riga di GitHub è passata')
  assert.ok((e.punto?.github[0].testo.length ?? 0) <= 120, 'la riga lunga non è stata accorciata')
  assert.match(e.punto?.github[0].testo ?? '', /…$/)
})

// — una cosa una volta sola —
//
// Il punto dell'undici settembre diceva del dev server di tobiaweb in quattro
// sezioni diverse, e lui l'ha letto come «mi sta dicendo sempre la stessa
// cosa». Qui si conta invece di sperare.

test('ridondante: due frasi che dicono la stessa cosa, e due che non c’entrano', () => {
  assert.equal(punto.ridondante(
    'Il server di tobiaweb è ripartito più volte.',
    'Controlla se il server di tobiaweb è ripartito.'
  ), true)
  // la punteggiatura e le maiuscole non contano
  assert.equal(punto.ridondante('È arrivato il preventivo di Rossi!', 'è ARRIVATO il preventivo, di rossi'), true)
  assert.equal(punto.ridondante(
    'È arrivato il preventivo di Rossi.',
    'Approva la bozza per Bianchi.'
  ), false)
  // le parole corte non fanno somiglianza: qui in comune c'è solo «che per la»
  assert.equal(punto.ridondante('La casa che ha in mano.', 'La rete che ha di sua.'), false)
  assert.equal(punto.ridondante('', 'Una riga qualunque.'), false)
})

test('la stessa cosa detta in due sezioni esce una volta sola', async () => {
  pulisci()
  progetti.scrivi({ nome: 'tobiadonadon.com', obiettivo: 'Il sito nuovo in linea' })
  store.salvaDocumenti([
    doc('posta:INBOX:20', 'Re: il deploy di tobiaweb', { autore: 'Anna <anna@esempio.it>' }),
    suGithub('github:tobiaweb#3', 'tobiaweb #3: il deploy')
  ])
  fornitoreFinto({
    progetti: [{ nome: 'tobiadonadon.com', novita: 'Il server di tobiaweb è ripartito più volte.', doc: '' }],
    github: [{ testo: 'Controlla il server di tobiaweb, ripartito più volte.', doc: 'github:tobiaweb#3' }],
    daLeggere: [],
    risposte: [{ testo: 'Anna chiede la data della prova sul campo.', doc: 'posta:INBOX:20' }],
    compiti: []
  })

  const e = await punto.punto({}, adesso())
  assert.ok(e.generatoAdesso)
  assert.equal(e.punto?.progetti.length, 1, 'la prima volta che una cosa si dice resta')
  assert.deepEqual(e.punto?.github, [], 'la stessa cosa è tornata sotto GitHub')
  assert.equal(e.punto?.risposte.length, 1, 'una riga che parla d’altro è stata buttata con l’eco')
})

test('otto righe in tutto: quando il modello riempie tutto, le notizie saltano', async () => {
  pulisci()
  progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Chiudere l’audit' })
  progetti.scrivi({ nome: 'tobiadonadon.com', obiettivo: 'Il sito nuovo in linea' })
  progetti.scrivi({ nome: 'Nextas', obiettivo: 'Chiudere il round seed' })
  store.salvaDocumenti([
    suGithub('github:myynd#12', 'myynd #12'),
    suGithub('github:myynd#13', 'myynd #13'),
    suGithub('github:myynd#14', 'myynd #14'),
    doc('posta:INBOX:20', 'Re: audit', { autore: 'Anna <anna@esempio.it>' }),
    doc('posta:INBOX:21', 'Re: sede', { autore: 'Verdi <verdi@esempio.it>' }),
    doc('posta:INBOX:22', 'Re: listino', { autore: 'Bianchi <bianchi@esempio.it>' })
  ])
  store.salvaNotizie([
    {
      id: 'n1', titolo: 'I modelli piccoli girano su un portatile', riassunto: 'Ci girano.',
      perche: null, fonte: 'Prova', link: 'https://esempio.test/n1', argomento: 'lavoro',
      quando: new Date().toISOString()
    },
    {
      id: 'n2', titolo: 'Le agende condivise cambiano formato', riassunto: 'Cambiano.',
      perche: null, fonte: 'Prova', link: 'https://esempio.test/n2', argomento: 'lavoro',
      quando: new Date().toISOString()
    }
  ])

  fornitoreFinto({
    progetti: [
      { nome: 'H-Farm', novita: 'Quattro domande senza risposta.', doc: '' },
      { nome: 'tobiadonadon.com', novita: 'Il sito è in linea da lunedì.', doc: '' },
      { nome: 'Nextas', novita: 'Il term sheet arriva venerdì.', doc: '' }
    ],
    github: [
      { testo: 'La #12 è stata unita.', doc: 'github:myynd#12' },
      { testo: 'La #13 aspetta revisione.', doc: 'github:myynd#13' },
      { testo: 'La #14 ha rotto il deploy.', doc: 'github:myynd#14' }
    ],
    daLeggere: [
      { titolo: 'I modelli piccoli girano su un portatile', perche: 'C’entra con Myynd.' },
      { titolo: 'Le agende condivise cambiano formato', perche: 'Tocca il calendario.' }
    ],
    risposte: [
      { testo: 'Anna vuole l’unità da misurare.', doc: 'posta:INBOX:20' },
      { testo: 'Verdi conferma il sopralluogo.', doc: 'posta:INBOX:21' },
      { testo: 'Bianchi aspetta il listino.', doc: 'posta:INBOX:22' }
    ],
    compiti: []
  })

  const p = (await punto.punto({}, adesso())).punto!
  const righe = p.progetti.length + p.github.length + p.daLeggere.length + p.risposte.length
  assert.equal(righe, 8, `il punto è lungo ${righe} righe`)
  assert.equal(p.progetti.length, 3)
  assert.deepEqual(p.daLeggere, [], 'sopra le otto righe le notizie sono le prime a saltare')
  assert.equal(p.github.length, 2, 'dopo le notizie si toglie dal fondo di GitHub')
  assert.equal(p.risposte.length, 3, 'le risposte si toccano per ultime: qualcuno aspetta')
})

// — quello che nota va in lista —
//
// È il cuore del cambio. Le cose da fare non si mostrano nella finestra: il
// modello le vede nel materiale, e il punto le mette in lista con dentro il
// documento da cui vengono. La freccia nel feed apre quella mail.

test('una cosa da fare vista in una mail diventa una riga della lista con dentro quella mail', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  fornitoreFinto({
    ...RISPOSTA,
    compiti: [{ testo: 'Manda a Rossi il preventivo aggiornato.', doc: 'posta:INBOX:1' }]
  })

  const e = await punto.punto({}, adesso())
  const righe = store.elencoCompiti()
  assert.equal(righe.length, 1, 'la cosa da fare non è diventata una riga')
  assert.equal(righe[0].testo, 'Manda a Rossi il preventivo aggiornato', 'il punto in fondo è finito in lista')
  assert.equal(righe[0].doc, 'posta:INBOX:1', 'la riga non porta la mail da cui viene: la freccia non apre niente')
  assert.equal(righe[0].origine, 'punto')
  assert.equal(righe[0].quando, 'oggi')
  assert.equal(righe[0].stato, 'aperto')
  // e nella finestra non se ne vede traccia: il punto racconta, non comanda
  assert.ok(!('compiti' in (e.punto as object)), 'le cose da fare sono arrivate al client')
  assert.ok(!JSON.stringify(e.punto).includes('preventivo aggiornato'), 'la cosa da fare è finita nel punto mostrato')
})

test('una cosa da fare che parla di una riga aperta non ne fa nascere un’altra', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  store.scriviCompito({ id: 'c9', testo: 'Rispondere alle quattro domande sull’ambito di H-Farm', ordine: 'a', quando: 'oggi' })
  fornitoreFinto({
    ...RISPOSTA,
    compiti: [{ testo: 'Rispondi alle quattro domande sull’ambito di H-Farm.', doc: 'posta:INBOX:1' }]
  })

  await punto.punto({}, adesso())
  assert.equal(store.elencoCompiti().length, 1, 'ha scritto una riga nuova invece di riconoscere quella che c’era')
})

test('una cosa da fare che ripete una cosa chiusa la settimana scorsa non fa nascere niente', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  store.scriviCompito({ id: 'c9', testo: 'Mandare il preventivo aggiornato a Bianchi', ordine: 'a', quando: 'oggi' })
  store.cambiaStatoCompito('c9', 'fatto')
  fornitoreFinto({
    ...RISPOSTA,
    compiti: [{ testo: 'Manda il preventivo aggiornato a Bianchi.', doc: 'posta:INBOX:1' }]
  })

  await punto.punto({}, adesso())
  assert.deepEqual(store.elencoCompiti(), [], 'una cosa già fatta è tornata in lista')
})

test('ancoraAlleRighe: tre righe nuove al massimo, e due cose sulla stessa riga diventano una', () => {
  // il tipo esatto di quello che `ancoraAlleRighe` riceve: qui `punto` è un
  // import dinamico, e i suoi tipi si raggiungono solo passando dalla firma
  type Notata = Parameters<typeof punto.ancoraAlleRighe>[0][number]
  const riga = (testo: string, doc: string | null = null, sopra: Partial<Notata> = {}): Notata =>
    ({ testo, doc, progetto: null, compito: null, ...sopra })

  // le tre mosse del tredici settembre, e la riga della lista che le conteneva
  const chiede = { id: 'c1', testo: 'Rispondere alle quattro domande sull’ambito per H-Farm' }
  const nate: { testo: string; doc: string | null }[] = []
  const tre = punto.ancoraAlleRighe(
    [
      riga('Rispondi alle quattro domande sull’ambito per H-Farm.'),
      riga('Rispondi alle domande sull’ambito per H-Farm, tutte e quattro.'),
      riga('Di’ quale unità di H-Farm guarda l’audit.', 'posta:INBOX:7')
    ],
    { aperti: [chiede], chiuse: [], crea: (testo, doc) => { nate.push({ testo, doc }); return `n${nate.length}` } }
  )
  assert.deepEqual(tre, ['c1', 'n1'], 'la stessa riga della lista è uscita due volte')
  assert.deepEqual(nate, [{ testo: 'Di’ quale unità di H-Farm guarda l’audit', doc: 'posta:INBOX:7' }])

  const scritte: string[] = []
  const quattro = punto.ancoraAlleRighe(
    [
      riga('Chiama lo studio di Padova.'),
      riga('Prepara il preventivo per Verdi.'),
      riga('Scegli la data della prova sul campo.'),
      riga('Rileggi il contratto di affitto.')
    ],
    { aperti: [], chiuse: [], crea: t => { scritte.push(t); return `n${scritte.length}` } }
  )
  assert.equal(scritte.length, 3, 'un punto ha riempito la lista di righe nuove')
  assert.deepEqual(quattro, ['n1', 'n2', 'n3'])
  assert.deepEqual(scritte[0], 'Chiama lo studio di Padova', 'il punto in fondo è finito in lista')

  // una cosa già fatta non torna, e non fa scrivere niente
  const sparita = punto.ancoraAlleRighe(
    [riga('Approva la bozza per Bianchi.')],
    { aperti: [], chiuse: ['Approvare la bozza per Bianchi'], crea: () => { throw new Error('non doveva scrivere niente') } }
  )
  assert.deepEqual(sparita, [])
})

test('ancoraAlleRighe: una cosa nata da una riga ne eredita il progetto e il documento', () => {
  // la riga che chiedeva le quattro cose su H-Farm: sa dove sta, e le figlie no
  const chiede = { id: 'avvio-h', testo: 'Rispondere alle quattro domande sull’ambito', doc: 'posta:INBOX:3', progetto: 'p93ddacbed1bd' }
  const nate: { testo: string; doc: string | null; progetto: string | null }[] = []
  const prese = punto.ancoraAlleRighe(
    [
      { testo: 'Conferma quale unità guarda l’audit.', doc: null, progetto: null, compito: 'avvio-h' },
      // la riga da cui dice di venire non esiste: nasce nuda, non nasce sbagliata
      { testo: 'Decidi il passo dopo l’unità scelta.', doc: null, progetto: null, compito: 'mai-esistita' }
    ],
    { aperti: [chiede], chiuse: [], crea: (testo, doc, progetto) => { nate.push({ testo, doc, progetto }); return `n${nate.length}` } }
  )
  assert.deepEqual(prese, ['n1', 'n2'])
  assert.deepEqual(nate[0], { testo: 'Conferma quale unità guarda l’audit', doc: 'posta:INBOX:3', progetto: 'p93ddacbed1bd' })
  assert.deepEqual(nate[1], { testo: 'Decidi il passo dopo l’unità scelta', doc: null, progetto: null })

  // quello che dice il modello viene prima di quello che si eredita
  const suo: { doc: string | null; progetto: string | null }[] = []
  punto.ancoraAlleRighe(
    [{ testo: 'Manda il modulo firmato al notaio.', doc: 'posta:INBOX:9', progetto: 'pAltro', compito: 'avvio-h' }],
    { aperti: [chiede], chiuse: [], crea: (_t, doc, progetto) => { suo.push({ doc, progetto }); return 'n1' } }
  )
  assert.deepEqual(suo, [{ doc: 'posta:INBOX:9', progetto: 'pAltro' }])
})

test('la provenienza dal vivo: la riga madre passa il progetto, un id inventato non passa', async () => {
  pulisci()
  const pr = progetti.scrivi({ nome: 'H-Farm', obiettivo: 'Chiudere l’audit sull’AI.' })
  store.salvaDocumenti([doc('posta:INBOX:1', 'Ambito dell’audit')])
  store.scriviCompito({ id: 'avvio-h', testo: 'Rispondere alle quattro domande sull’ambito', ordine: 'a', quando: 'oggi', progetto: pr.id })
  store.affidaCompito('avvio-h', 'bozza')
  store.risultatoCompito('avvio-h', 'Mi manca l’unità a cui guarda l’audit.', [], 'chiede')

  const ricevute = fornitoreFinto({
    ...RISPOSTA,
    progetti: [],
    compiti: [
      { testo: 'Conferma quale unità guarda l’audit.', doc: '', compito: 'avvio-h', progetto: '' },
      { testo: 'Chiama il commercialista per la fattura.', doc: '', compito: '', progetto: 'pInventato' }
    ]
  })
  await punto.punto({}, adesso())

  // gli id devono essere arrivati al modello: senza, non può nominarli
  assert.ok(istruzioneDi(ricevute[0]).includes(`— [${pr.id}] H-Farm`), 'il progetto è andato al modello senza il suo id')
  assert.match(testoDi(ricevute[0]), new RegExp(`\\[avvio-h\\].*progetto \\[${pr.id}\\]`), 'la riga aperta non dice su che progetto sta')

  const nate = store.elencoCompiti().filter(c => c.origine === 'punto')
  assert.equal(nate.length, 2, 'le cose da fare non sono finite in lista')
  assert.equal(nate.find(c => c.testo.startsWith('Conferma'))?.progetto, pr.id, 'la cosa nata dalle domande di una riga non ne ha ereditato il progetto')
  assert.equal(nate.find(c => c.testo.startsWith('Chiama'))?.progetto, null, 'un progetto inventato è entrato in lista')
})

test('rifare il punto sulla stessa cosa da fare non raddoppia la riga', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  fornitoreFinto({
    ...RISPOSTA,
    compiti: [{ testo: 'Scegli chi tiene il numero della prova.', doc: 'posta:INBOX:1' }]
  })
  const t0 = adesso()
  await punto.punto({}, t0)
  const [nata] = store.elencoCompiti()
  assert.ok(nata)

  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const secondo = await punto.punto({ forza: true }, t0 + ore(4))
  assert.ok(secondo.generatoAdesso)
  assert.deepEqual(store.elencoCompiti().map(c => c.id), [nata.id], 'la stessa cosa ha fatto nascere due righe')
})

test('l’istruzione dice le quattro sezioni, dove finiscono i compiti, e la lingua', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  await punto.punto({}, adesso())
  const istr = istruzioneDi(ricevute[0])
  const lingua = cfg.nellaLingua()
  assert.match(istr, /Le quattro sezioni, e cosa ci va:/)
  assert.match(istr, /«progetti»[\s\S]*«github»[\s\S]*«daLeggere»[\s\S]*«risposte»/)
  assert.match(istr, /finiranno nella sua lista, con dentro da\n  dove vengono; non sono righe del punto/)
  // le tre strade della provenienza: senza, le righe nate dal punto non aprono niente
  assert.match(istr, /Da dove viene una cosa da fare: è obbligatorio dirlo[\s\S]*Almeno uno dei tre va riempito/)
  assert.match(istr, new RegExp(`Scrivi in ${lingua}: ogni campo, i compiti compresi`))
  // e le regole di stile viaggiano con l'istruzione
  assert.match(istr, /Quello che ha fatto Myynd da solo/)
  assert.match(istr, /Un file sul disco è una notizia solo se/)
  assert.match(istr, /dalle dieci alle dodici parole al massimo/)
  assert.match(istr, /non compare MAI la lineetta lunga/)
  // quello che il punto non racconta più: le mosse, e le automazioni da accendere
  assert.doesNotMatch(istr, /«adesso»/)
  assert.doesNotMatch(istr, /«avvii»/)
})

// — il cancello —

test('subito dopo un punto si torna quello di prima, senza chiamare nessuno', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const primo = await punto.punto({}, t0)
  assert.ok(primo.generatoAdesso)
  const secondo = await punto.punto({}, t0 + ore(1))
  assert.equal(ricevute.length, 1)
  assert.equal(secondo.generatoAdesso, false)
  assert.deepEqual(secondo.punto, primo.punto)
})

test('passate tre ore senza che sia successo niente, ancora quello di prima', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  await punto.punto({}, t0)
  const e = await punto.punto({}, t0 + ore(5))
  assert.equal(ricevute.length, 1, 'ha rifatto il punto su niente di nuovo')
  assert.equal(e.generatoAdesso, false)
})

test('passate tre ore con un documento nuovo, si rifà — e il materiale parte dall’ultimo punto', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  await punto.punto({}, t0)
  await unAttimo()
  // il documento entra adesso: il suo `indicizzato` è più recente dell'ultimo punto
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const e = await punto.punto({}, t0 + ore(4))
  assert.equal(ricevute.length, 2)
  assert.ok(e.generatoAdesso)
  const mandato = testoDi(ricevute[1])
  assert.match(mandato, /Fattura Bianchi/)
  assert.doesNotMatch(mandato, /Preventivo Rossi/, 'il materiale del punto prima è stato riletto')
})

test('«forza» salta le tre ore ma non il conto del giorno: tre, poi quello di prima e la parola «tetto»', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  await punto.punto({}, t0)
  assert.ok((await punto.punto({ forza: true }, t0 + minuti(1))).generatoAdesso)
  assert.ok((await punto.punto({ forza: true }, t0 + minuti(2))).generatoAdesso)
  assert.equal(ricevute.length, 3)
  const quarto = await punto.punto({ forza: true }, t0 + minuti(3))
  assert.equal(ricevute.length, 3, 'il quarto punto del giorno è stato pagato')
  assert.equal(quarto.generatoAdesso, false)
  assert.equal(quarto.tetto, true)
  assert.ok(quarto.punto, 'con il tetto raggiunto si mostra comunque quello di prima')
  // il giorno dopo si riparte
  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const domani = await punto.punto({ forza: true }, t0 + ore(24))
  assert.ok(domani.generatoAdesso)
  assert.equal(domani.tetto, false)
})

test('senza motore, e su una mente vuota, non c’è nessun punto e nessuna chiamata', async () => {
  pulisci()
  cfg.scrivi({})
  compatibile.usaRete(null)
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  assert.deepEqual(await punto.punto({}, adesso()), { punto: null, generatoAdesso: false, tetto: false })
  // e con un motore ma niente da dire, nemmeno
  pulisci()
  const ricevute = fornitoreFinto()
  assert.equal((await punto.punto({ forza: true }, adesso())).punto, null)
  assert.equal(ricevute.length, 0, 'ha chiamato il modello senza materiale')
})

// — quello che è cambiato da quando l'ha scritto —
//
// Un punto è la fotografia di un momento. Il resto di questa sezione è quello
// che è successo a Tobia l'undici settembre: in prima pagina «il punto di
// oggi» era dell'otto, e quello che diceva non valeva più. Tre difetti in uno
// — una fotografia mostrata come se fosse adesso, un punto di ieri chiamato di
// oggi, e tre tentativi falliti contati come punti fatti — e qui stanno le tre
// prove.

test('un progetto chiuso dopo non si mostra più, nemmeno dal foglio', async () => {
  pulisci()
  const mio = seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  fornitoreFinto()
  const t0 = adesso()
  const primo = await punto.punto({}, t0)
  assert.equal(primo.punto?.progetti[0].id, mio.id)

  // lo chiude, e mezz'ora dopo torna nell'app: quella riga non c'è più
  progetti.chiudi(mio.id)
  const dopo = await punto.punto({}, t0 + minuti(30))
  assert.equal(dopo.generatoAdesso, false, 'ha rifatto il punto invece di ripulirlo')
  assert.deepEqual(dopo.punto?.progetti, [], 'un progetto chiuso è rimasto in pagina')
  // il foglio resta com'era: si filtra quando esce, non si riscrive la storia
  assert.equal(punto.ultimo()?.progetti.length, 1)
})

test('il punto di ieri non è il punto di oggi: torna nullo, con la data di quello vecchio', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const ieri = await punto.punto({}, t0)
  assert.ok(ieri.punto)

  const e = await punto.punto({}, t0 + ore(24))
  assert.equal(ricevute.length, 1, 'ha rifatto il punto su niente di nuovo')
  assert.equal(e.punto, null, 'il punto di ieri è stato mostrato come quello di oggi')
  assert.equal(e.vecchio, ieri.punto?.quando)
  assert.equal(e.generatoAdesso, false)

  // «rifai» lo rifà comunque, e quello nuovo non è più vecchio
  const rifatto = await punto.punto({ forza: true }, t0 + ore(24))
  assert.equal(ricevute.length, 2)
  assert.ok(rifatto.generatoAdesso)
  assert.equal(rifatto.vecchio ?? null, null)
  assert.ok(rifatto.punto)
})

test('una chiamata fallita non conta come punto del giorno, e dice perché', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const quante = fornitoreSenzaCredito()
  const t0 = adesso()

  // tre volte «rifai il punto», come ha fatto lui: tre guai, zero tacche
  for (const n of [1, 2, 3]) {
    const e = await punto.punto({ forza: true }, t0 + minuti(n))
    assert.equal(e.punto, null)
    assert.equal(e.tetto, false, 'un tentativo fallito ha bruciato uno dei tre del giorno')
    assert.equal(e.guaio, 'Il conto del fornitore è senza credito.')
  }
  assert.equal(quante(), 3)
  assert.equal(punto.ultimo(), null)
  // il foglio non è stato nemmeno scritto: non c'è niente da segnare
  const chiamate = existsSync(join(CASA, 'punto.json'))
    ? (JSON.parse(readFileSync(join(CASA, 'punto.json'), 'utf8')) as { chiamate?: string[] }).chiamate ?? []
    : []
  assert.deepEqual(chiamate, [], 'le chiamate fallite sono finite nel conto del giorno')

  // e quando il conto torna a posto, i tre punti ci sono ancora tutti
  fornitoreFinto()
  const e = await punto.punto({ forza: true }, t0 + minuti(4))
  assert.ok(e.generatoAdesso)
  assert.equal(e.guaio, undefined)
})

test('aggiornaAlPresente: via i progetti chiusi, e niente altro', () => {
  const prima = {
    quando: '2026-09-08T13:47:00.000Z',
    via: null,
    progetti: [
      { id: 'p1', nome: 'Myynd', novita: 'Il punto ha quattro sezioni.', doc: null },
      { id: 'p2', nome: 'Orto', novita: 'I semi sono arrivati.', doc: null },
      { id: '', nome: 'Cantina', novita: 'Svuotata a metà.', doc: null }
    ],
    github: [{ testo: 'La #12 è stata unita.', doc: 'github:myynd#12' }],
    daLeggere: [{ titolo: 'Una notizia', perche: 'C’entra.', link: null }],
    risposte: [{ testo: 'Verdi conferma la sede.', doc: 'posta:INBOX:20' }]
  }

  const dopo = punto.aggiornaAlPresente(prima, { nomi: new Set(['cantina']), id: new Set(['p2']) })
  assert.deepEqual(dopo.progetti.map(x => x.nome), ['Myynd'], 'un progetto chiuso è rimasto nel punto')
  // il resto non si tocca, e l'originale nemmeno
  assert.equal(dopo.quando, prima.quando)
  assert.deepEqual(dopo.github, prima.github)
  assert.deepEqual(dopo.daLeggere, prima.daLeggere)
  assert.deepEqual(dopo.risposte, prima.risposte)
  assert.equal(prima.progetti.length, 3, 'ha cambiato il punto che gli è stato dato')
})

// — quello che resta scritto —

test('il punto sta in punto.json, e al giro dopo il modello riceve i progetti dalla tabella con la novità di prima', async () => {
  pulisci()
  const mio = seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  const primo = await punto.punto({}, t0)
  assert.ok(existsSync(join(CASA, 'punto.json')))
  const foglio = JSON.parse(readFileSync(join(CASA, 'punto.json'), 'utf8'))
  assert.equal(foglio.ultimo.via, null, 'senza una richiesta con «via», nessuna assenza inventata')
  assert.equal(primo.punto?.progetti[0].id, mio.id, 'il progetto del punto non porta l’id della riga')

  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  const secondo = await punto.punto({ forza: true }, t0 + ore(4))
  const giorno = new Date(mio.dal).toISOString().slice(0, 10)
  assert.match(istruzioneDi(ricevute[1]),
    new RegExp(`I suoi progetti, e a cosa punta ciascuno[\\s\\S]*— \\[${mio.id}\\] Myynd: Un gemello che sceglie per lui\\. \\(attivo, dal ${giorno}\\)\\n  l'ultima volta hai detto: Il punto adesso ha quattro sezioni`))
  assert.match(istruzioneDi(ricevute[1]), /Non inventarne di nuovi/)
  assert.equal(secondo.punto?.progetti[0].id, mio.id)
  assert.equal(progetti.elenco().length, 1, 'il punto ha scritto un progetto in tabella')
  assert.equal(punto.ultimo()?.quando, secondo.punto?.quando)
})

test('un foglio scritto dalla versione di prima non esplode: resta la data, le sezioni nascono vuote', () => {
  pulisci()
  const vecchio = {
    ultimo: {
      quando: '2026-09-08T13:47:00.000Z', via: null,
      mentreNonCeri: [{ testo: 'È arrivato il preventivo.', compito: null, doc: 'posta:INBOX:1' }],
      adesso: [{ testo: 'Approva la bozza.', compito: 'c1', doc: null }],
      daLeggere: [{ titolo: 'Una notizia', perche: 'C’entra.', link: null }],
      progetti: [{ id: 'p1', nome: 'Myynd', obiettivo: 'Un gemello', dal: '2026-09-01', doveSei: 'A metà.', angolo: '', angoliTenuti: [], proposto: true }],
      avvii: [{ frase: 'Ogni lunedì alle 8, un riepilogo', perche: 'Lo fa a mano.' }]
    },
    progetti: [], scartati: [], chiamate: []
  }
  writeFileSync(punto.perProva.file(), JSON.stringify(vecchio))
  const letto = punto.ultimo()
  assert.equal(letto?.quando, '2026-09-08T13:47:00.000Z')
  assert.deepEqual(letto?.progetti, [], 'un progetto senza novità è stato mostrato lo stesso')
  assert.deepEqual(letto?.github, [])
  assert.deepEqual(letto?.risposte, [])
  assert.equal(letto?.daLeggere.length, 1, 'la notizia aveva già la forma giusta')
})

test('«non è un progetto»: si chiude, ed esce dal punto mostrato', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const mio = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Un gemello che sceglie per lui.', origine: 'punto' })
  fornitoreFinto()
  await punto.punto({}, adesso())
  const r = punto.nonEUnProgetto(mio.id)
  assert.deepEqual(r.punto?.progetti, [])
  assert.deepEqual(punto.ultimo()?.progetti, [])
  assert.equal(progetti.trova(mio.id)?.stato, 'chiuso')
  assert.throws(() => punto.nonEUnProgetto('inesistente'), /non c’è nel punto/)
  // tenere un angolo su un chiuso non si può: non è più un progetto
  assert.throws(() => punto.tieni('Myynd', 'Un angolo'), /non c’è nel punto/)
})

test('«tienilo»: l’angolo diventa una convinzione con l’ambito del progetto', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  fornitoreFinto()
  await punto.punto({}, adesso())

  const angolo = 'Far crescere i progetti insieme a lui.'
  const e = punto.tieni('Myynd', angolo)
  assert.ok(e.ok)
  const conv = store.convinzioni('progetto:Myynd')
  assert.equal(conv.length, 1)
  assert.equal(conv[0].enunciato, angolo)
  assert.equal(conv[0].genere, 'esplicita')
  assert.equal(conv[0].origine, 'punto')

  assert.throws(() => punto.tieni('Inesistente', angolo), /Questo progetto non c’è nel punto/)
})

test('«non è così»: resta scritto, e il modello viene avvertito di non riproporlo', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto()
  const t0 = adesso()
  await punto.punto({}, t0)

  punto.scarta('Myynd', 'Far crescere i progetti insieme a lui.')
  assert.equal(store.convinzioni('progetto:Myynd').length, 0, 'uno scarto non è una convinzione')

  await unAttimo()
  store.salvaDocumenti([doc('posta:INBOX:2', 'Fattura Bianchi')])
  await punto.punto({ forza: true }, t0 + ore(4))
  assert.match(istruzioneDi(ricevute[1]), /NON sono così[\s\S]*— Far crescere i progetti insieme a lui/)
})

// — più persone —

test('il foglio è di chi chiede: uno per cartella, e il punto di una non compare all’altra', async () => {
  pulisci()
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok)
  const anna = a.ok ? a.id : ''
  const bruno = b.ok ? b.id : ''

  const ricevute = await chi.dentro(anna, async () => {
    store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
    const r = fornitoreFinto()
    await punto.punto({}, adesso())
    return r
  })
  assert.equal(ricevute.length, 1)
  assert.ok(existsSync(join(cfg.cartellaDi(anna), 'punto.json')))
  assert.ok(!existsSync(join(cfg.cartellaDi(bruno), 'punto.json')))
  assert.ok(!existsSync(join(CASA, 'punto.json')), 'il foglio di Anna è finito nella radice')

  await chi.dentro(bruno, async () => {
    assert.equal(punto.ultimo(), null)
    cfg.scrivi({})
    assert.equal((await punto.punto({}, adesso())).punto, null)
  })
  assert.equal(ricevute.length, 1)
})

test('quello che ha scartato non torna nel punto', async () => {
  pulisci()
  // una mail scartata dal feed, una da un mittente scartato, una riga lasciata perdere, e una buona
  store.salvaDocumenti([
    doc('posta:INBOX:10', 'Il gestore dello stabile ha scritto', { autore: 'CERU <ceru@stabile.it>' }),
    doc('posta:INBOX:11', 'Ancora il gestore', { autore: 'CERU <ceru@stabile.it>' }),
    doc('posta:INBOX:12', 'Il flusso in CSV', { autore: 'Anna <anna@esempio.it>' }),
    doc('posta:INBOX:13', 'Preventivo Verdi', { autore: 'Verdi <verdi@esempio.it>' })
  ])
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Il gestore dello stabile ha scritto', testo: '…', doc: 'posta:INBOX:10' }])
  const voce = store.elencoFeed('aperto').find(v => v.doc === 'posta:INBOX:10')!
  store.cambiaStatoFeed(voce.id, 'scartato')
  store.scriviCompito({ id: 'c-csv', testo: 'Sistemare il flusso in CSV', ordine: 'z', quando: 'oggi', doc: 'posta:INBOX:12' })
  store.cambiaStatoCompito('c-csv', 'lasciato')

  const ricevute = fornitoreFinto()
  const e = await punto.punto({ via: 200 }, adesso())
  assert.ok(e.generatoAdesso)
  const mandato = JSON.stringify(ricevute[0])
  assert.doesNotMatch(mandato, /posta:INBOX:10/, 'la mail scartata dal feed non è nel materiale')
  assert.doesNotMatch(mandato, /posta:INBOX:11/, 'nemmeno l’altra dello stesso mittente')
  assert.doesNotMatch(mandato, /posta:INBOX:12/, 'né quella della riga lasciata perdere')
  assert.match(mandato, /posta:INBOX:13/, 'quella buona sì')
  assert.match(mandato, /NON gli interessano[\s\S]*Il gestore dello stabile ha scritto[\s\S]*Sistemare il flusso in CSV/)
  assert.match(mandato, /NON dire da quanto manca/)
  assert.match(mandato, /È stato via circa 3 ore/)
  assert.equal(e.punto?.via, 200)
})

test('quello che ha fatto Myynd da solo non arriva più al modello', async () => {
  pulisci()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  seminaLista()
  store.registraAzione({ tipo: 'automazione', cosa: 'Priorità in arrivo', esito: 'fatta' })
  store.registraAzione({ tipo: 'email', cosa: 'Preventivo aggiornato', verso: 'bianchi@esempio.it', esito: 'fatta', compito: 'c1' })
  store.registraAzione({ tipo: 'automazione', cosa: 'Rassegna del mattino', esito: 'fallita' })

  const ricevute = fornitoreFinto()
  await punto.punto({}, adesso())
  const mandato = testoDi(ricevute[0])
  assert.doesNotMatch(mandato, /FATTO DA MYYND/, 'il registro di Myynd è finito nel punto')
  assert.doesNotMatch(mandato, /Priorità in arrivo/)
  assert.doesNotMatch(mandato, /Rassegna del mattino/)
  // la lista, quella sì: è da lì che si vede cosa c'è già e non va riscritto
  assert.match(mandato, /LA SUA LISTA:[\s\S]*Rispondere a Bianchi/)
})

// — la lingua di quello che torna —
//
// «Why is this task in Italian and my app is in English?». L'istruzione al
// modello c'è, in testa e in coda, e un modello grande la rispetta; un modello
// piccolo sul portatile legge venti documenti italiani e risponde in italiano.
// Una seconda chiamata con l'ordine urlato in coda al materiale, e se sbaglia
// ancora i campi storti restano vuoti e le righe cadono da sole.

const NOVITA_IT = 'Il preventivo di Rossi non è ancora firmato e la scadenza è venerdì.'
const NOVITA_EN = 'The Rossi quote is not signed yet and the deadline is Friday.'
/** L'ultimo messaggio mandato al modello: quello dove finisce l'ordine urlato. */
const messaggioDi = (r: Record<string, unknown>) =>
  String((r.messages as { role: string; content: string }[]).findLast(m => m.role === 'user')!.content)

test('un punto nella lingua sbagliata si richiede una volta, e le righe storte non si mostrano', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto({
    ...RISPOSTA, daLeggere: [],
    progetti: [{ nome: 'Myynd', novita: NOVITA_IT, doc: 'posta:INBOX:1' }]
  }, 'en')
  const e = await punto.punto({}, adesso())
  assert.equal(ricevute.length, 2, 'un punto in italiano dentro un\'app inglese non è stato richiesto')
  assert.doesNotMatch(messaggioDi(ricevute[0]), /IN ENGLISH ONLY/)
  assert.match(messaggioDi(ricevute[1]), /IN ENGLISH ONLY$/, 'la seconda chiamata non urla la lingua')
  assert.deepEqual(e.punto?.progetti, [], 'una riga italiana è finita nel punto di un\'app inglese')
})

test('un punto nella lingua giusta passa con una chiamata sola', async () => {
  pulisci()
  seminaProgetto()
  store.salvaDocumenti([doc('posta:INBOX:1', 'Preventivo Rossi')])
  const ricevute = fornitoreFinto({
    ...RISPOSTA, daLeggere: [],
    progetti: [{ nome: 'Myynd', novita: NOVITA_EN, doc: 'posta:INBOX:1' }]
  }, 'en')
  const e = await punto.punto({}, adesso())
  assert.equal(ricevute.length, 1, 'ha richiesto un punto che andava bene')
  assert.equal(e.punto?.progetti[0].novita, NOVITA_EN)
})
