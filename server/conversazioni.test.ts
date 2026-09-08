// Le conversazioni: tre formati di file, un documento per chat.
//
// Quello che si prova non è che i file si aprano: è che quello che finisce
// nell'indice sia *la conversazione* — e non l'albero di ChatGPT con dentro
// tutti i rami scartati, non i risultati degli attrezzi di Claude Code, non
// un «ciao» di quattro parole che sembra un documento. E che un file
// sbagliato lo dica, con la frase giusta, invece di collegarsi a zero.
//
// I file sono inventati qui: nessuna conversazione vera entra in una prova.
//
//   node --test server/conversazioni.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-conversazioni-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
// in italiano: le voci della trascrizione («Tu», «Progetto») seguono la lingua scelta
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({ lingua: 'it' }), { mode: 0o600 })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const conv = await import('./connettori/conversazioni.ts')
const registro = await import('./connettori/registro.ts')
const attrezzi = await import('./attrezzi.ts')
const ospitato = await import('./ospitato.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const scrivi = (nome: string, cosa: unknown) => {
  const p = join(CASA, nome)
  writeFileSync(p, typeof cosa === 'string' ? cosa : JSON.stringify(cosa))
  return p
}

// — ChatGPT: l'albero diventa un filo —

/** Un nodo di `mapping`, scritto come lo scrive ChatGPT. */
const nodo = (id: string, parent: string | null, children: string[], ruolo: string | null, testo: string | null, t: number, tipo = 'text') => ({
  id, parent, children,
  message: ruolo === null ? null : {
    id, author: { role: ruolo }, create_time: t,
    content: tipo === 'text' || tipo === 'multimodal_text' ? { content_type: tipo, parts: [testo] } : { content_type: tipo, text: testo }
  }
})

/**
 * Una chat con un ramo scartato: il primo «rispondi in francese» è stato
 * riscritto in «rispondi in spagnolo», e ChatGPT tiene tutti e due sotto lo
 * stesso padre. Quello che la persona vede è il ramo di `current_node`.
 */
const chatgptConRamo = () => [{
  id: 'c-1', title: 'Preventivo per il tetto', create_time: 1_725_000_000.5, update_time: 1_725_000_400,
  current_node: 'n-5',
  mapping: {
    'n-0': nodo('n-0', null, ['n-1'], null, null, 0),
    'n-1': nodo('n-1', 'n-0', ['n-2'], 'system', 'istruzioni di sistema', 1_725_000_000),
    'n-2': nodo('n-2', 'n-1', ['n-3', 'n-4'], 'user', 'Mi aiuti a scrivere il preventivo per rifare il tetto del capannone di via Roma?', 1_725_000_100),
    'n-3': nodo('n-3', 'n-2', [], 'assistant', 'Ecco una bozza in francese.', 1_725_000_200),
    'n-4': nodo('n-4', 'n-2', ['n-5'], 'assistant', 'Ecco una bozza in italiano: lavori di rimozione, nuova guaina, posa.', 1_725_000_300),
    'n-5': nodo('n-5', 'n-4', [], 'user', 'Perfetto, aggiungi lo smaltimento.', 1_725_000_400)
  }
}]

test('ChatGPT: il filo si ricostruisce da current_node, e il ramo scartato resta fuori', async () => {
  const f = scrivi('chatgpt.json', chatgptConRamo())
  const e = await conv.leggi({ file: [f], codice: false })
  assert.equal(e.docs.length, 1)
  const d = e.docs[0]!
  assert.equal(d.id, 'conversazioni:chatgpt:c-1')
  assert.equal(d.fonte, 'conversazioni')
  assert.equal(d.tipo, 'chat')
  assert.equal(d.gruppo, 'note')
  assert.equal(d.titolo, 'Preventivo per il tetto')
  assert.equal(d.percorso, f)
  assert.match(d.corpo, /^Tu: Mi aiuti a scrivere il preventivo/)
  assert.match(d.corpo, /ChatGPT: Ecco una bozza in italiano/)
  assert.match(d.corpo, /Tu: Perfetto, aggiungi lo smaltimento\.$/)
  // il ramo che la persona ha riscritto non è la conversazione che ha avuto
  assert.ok(!d.corpo.includes('francese'), 'il ramo scartato è finito nell’indice')
  // il messaggio di sistema non l'ha scritto nessuno dei due
  assert.ok(!d.corpo.includes('istruzioni di sistema'))
  // `quando` è l'ultima battuta, in secondi con la virgola → ISO
  assert.equal(d.quando, new Date(1_725_000_400_000).toISOString())
  assert.deepEqual(e.perFile, [{ file: f, formato: 'chatgpt', conversazioni: 1 }])
})

test('ChatGPT: le parti che non sono testo si saltano, e senza titolo si prende la prima riga', async () => {
  const f = scrivi('chatgpt-2.json', [{
    id: 'c-2', title: '', create_time: 1_725_100_000, update_time: 1_725_100_100, current_node: 'n-3',
    mapping: {
      'n-1': nodo('n-1', null, ['n-2'], 'user', 'Riassumi questo contratto di fornitura che ti allego, in dieci righe al massimo.', 1_725_100_000),
      'n-2': nodo('n-2', 'n-1', ['n-3'], 'assistant', 'print("codice per l’interprete")', 1_725_100_050, 'code'),
      'n-3': nodo('n-3', 'n-2', [], 'assistant', 'Il contratto dura tre anni.', 1_725_100_100)
    }
  }])
  const e = await conv.leggi({ file: [f], codice: false })
  const d = e.docs[0]!
  assert.equal(d.titolo, 'Riassumi questo contratto di fornitura che ti allego, in dieci righe al massimo.')
  assert.ok(!d.corpo.includes('interprete'), 'il codice mandato all’interprete non è una battuta')
  assert.match(d.corpo, /ChatGPT: Il contratto dura tre anni\./)
})

// — Claude: l'elenco è già un filo —

const claudeExport = () => [{
  uuid: 'u-1', name: 'Lettera al commercialista', created_at: '2026-08-01T09:00:00Z', updated_at: '2026-08-01T09:30:00Z',
  chat_messages: [
    { uuid: 'm-1', sender: 'human', text: 'Scrivimi una lettera al commercialista per chiedere il rinvio della scadenza IVA.', created_at: '2026-08-01T09:00:00Z' },
    { uuid: 'm-2', sender: 'assistant', text: 'Gentile dottore, le scrivo per chiedere…', created_at: '2026-08-01T09:01:00Z' },
    { uuid: 'm-3', sender: 'human', text: '', content: [{ type: 'text', text: 'Più corta.' }], created_at: '2026-08-01T09:02:00Z' }
  ]
}]

test('Claude: le chat esportate diventano documenti con la voce giusta', async () => {
  const f = scrivi('claude.json', claudeExport())
  const e = await conv.leggi({ file: [f], codice: false })
  assert.equal(e.docs.length, 1)
  const d = e.docs[0]!
  assert.equal(d.id, 'conversazioni:claude:u-1')
  assert.equal(d.titolo, 'Lettera al commercialista')
  assert.match(d.corpo, /^Tu: Scrivimi una lettera/)
  assert.match(d.corpo, /Claude: Gentile dottore/)
  // il testo può stare anche nei blocchi `content`, quando `text` è vuoto
  assert.match(d.corpo, /Tu: Più corta\.$/)
  assert.equal(d.quando, '2026-08-01T09:02:00.000Z')
  assert.equal(e.perFile[0]!.formato, 'claude')
})

// — Claude Code: una riga per battuta, e molte righe che non lo sono —

/** Una sessione come la scrive Claude Code: JSON per riga, e di tutto in mezzo. */
const sessioneCodice = (id: string, cwd: string, righe: unknown[]) => righe.map(r => JSON.stringify(r)).join('\n') + '\n'

const righeSessione = (id: string, cwd: string) => [
  { type: 'last-prompt', sessionId: id },
  { type: 'user', isMeta: true, sessionId: id, cwd, timestamp: '2026-09-01T10:00:00Z', message: { role: 'user', content: 'una riga del programma, non sua' } },
  { type: 'user', sessionId: id, cwd, timestamp: '2026-09-01T10:00:01Z', message: { role: 'user', content: '<command-name>/aiuto</command-name>' } },
  { type: 'user', sessionId: id, cwd, timestamp: '2026-09-01T10:00:02Z', message: { role: 'user', content: 'Aggiungi la validazione del codice fiscale nel modulo di iscrizione.<system-reminder>promemoria</system-reminder>' } },
  { type: 'assistant', sessionId: id, cwd, timestamp: '2026-09-01T10:00:10Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'ragionamento nascosto' }] } },
  { type: 'assistant', sessionId: id, cwd, timestamp: '2026-09-01T10:00:11Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Guardo il modulo.' }] } },
  { type: 'assistant', sessionId: id, cwd, timestamp: '2026-09-01T10:00:12Z', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/segreto' } }] } },
  { type: 'user', sessionId: id, cwd, timestamp: '2026-09-01T10:00:13Z', message: { role: 'user', content: [{ type: 'tool_result', content: 'CONTENUTO DEL FILE APERTO' }] } },
  { type: 'assistant', sessionId: id, cwd, timestamp: '2026-09-01T10:00:20Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Fatto: la validazione è in campo.ts.' }] } },
  { type: 'user', isSidechain: true, sessionId: id, cwd, timestamp: '2026-09-01T10:00:21Z', message: { role: 'user', content: 'un sotto-agente che parla con un altro' } },
  { type: 'ai-title', aiTitle: 'Validazione del codice fiscale', sessionId: id },
  { type: 'summary', summary: 'un riassunto del programma' }
]

test('Claude Code: si tengono le battute, non gli attrezzi, e il titolo porta il progetto', async () => {
  const progetti = join(CASA, 'sessioni')
  const cartella = join(progetti, '-Users-tizio-Progetti-iscrizioni')
  mkdirSync(cartella, { recursive: true })
  const f = join(cartella, 'sess-1.jsonl')
  writeFileSync(f, sessioneCodice('sess-1', '/Users/tizio/Progetti/iscrizioni', righeSessione('sess-1', '/Users/tizio/Progetti/iscrizioni')))
  // una sottocartella (i sotto-agenti) e un file che non è una sessione non si toccano
  mkdirSync(join(cartella, 'sess-1'), { recursive: true })
  writeFileSync(join(cartella, 'appunti.txt'), 'niente')

  const e = await conv.leggi({ file: [], codice: true }, progetti)
  assert.equal(e.codice, 1)
  const d = e.docs[0]!
  assert.equal(d.id, 'conversazioni:codice:sess-1')
  assert.equal(d.titolo, 'iscrizioni · Validazione del codice fiscale')
  assert.equal(d.percorso, f)
  assert.match(d.corpo, /^Progetto: \/Users\/tizio\/Progetti\/iscrizioni\n/)
  assert.match(d.corpo, /Tu: Aggiungi la validazione del codice fiscale/)
  assert.match(d.corpo, /Claude: Guardo il modulo\.\nFatto: la validazione è in campo\.ts\./)
  for (const fuori of ['CONTENUTO DEL FILE', 'ragionamento nascosto', 'promemoria', '/aiuto', 'sotto-agente', 'riga del programma', 'riassunto del programma']) {
    assert.ok(!d.corpo.includes(fuori), `«${fuori}» è finito nell’indice`)
  }
  assert.equal(d.quando, '2026-09-01T10:00:20.000Z')
})

test('Claude Code: senza titolo si usa la prima riga, e una sessione vuota non è un documento', async () => {
  const progetti = join(CASA, 'sessioni-2')
  const cartella = join(progetti, '-tmp-prova')
  mkdirSync(cartella, { recursive: true })
  writeFileSync(join(cartella, 'a.jsonl'), sessioneCodice('a', '/tmp/prova', [
    { type: 'user', sessionId: 'a', cwd: '/tmp/prova', timestamp: '2026-09-02T08:00:00Z', message: { role: 'user', content: 'Spiegami come funziona la coda delle migrazioni in questo progetto, con calma.' } },
    { type: 'assistant', sessionId: 'a', cwd: '/tmp/prova', timestamp: '2026-09-02T08:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Le migrazioni stanno in fondo.' }] } }
  ]))
  writeFileSync(join(cartella, 'vuota.jsonl'), sessioneCodice('vuota', '/tmp/prova', [
    { type: 'user', sessionId: 'vuota', cwd: '/tmp/prova', message: { role: 'user', content: [{ type: 'tool_result', content: 'solo attrezzi' }] } }
  ]))
  writeFileSync(join(cartella, 'rotta.jsonl'), '{"type":"user"\nnon è json\n')

  const e = await conv.leggi({ file: [], codice: true }, progetti)
  assert.deepEqual(e.docs.map(d => d.titolo), ['prova · Spiegami come funziona la coda delle migrazioni in questo progetto, con calma.'])
})

// — quello che non vale un documento, e quello che è troppo lungo —

test('una chat in cui la persona ha scritto quattro parole non diventa un documento', async () => {
  const f = scrivi('corta.json', [{
    uuid: 'u-corta', name: 'Ciao', created_at: '2026-08-02T09:00:00Z', updated_at: '2026-08-02T09:00:00Z',
    chat_messages: [
      { sender: 'human', text: 'ciao come va', created_at: '2026-08-02T09:00:00Z' },
      { sender: 'assistant', text: 'Bene, grazie. Tu?'.repeat(20), created_at: '2026-08-02T09:00:01Z' }
    ]
  }])
  const e = await conv.leggi({ file: [f], codice: false })
  assert.equal(e.docs.length, 0)
  // si conta, perché è la riga che spiega perché «300 chat» diventano «120 documenti»
  assert.equal(e.saltate, 1)
})

test('una chat lunga tiene l’inizio e la fine, e sta sotto il tetto', () => {
  const battute = []
  for (let i = 0; i < 400; i++) {
    battute.push({ tu: true, testo: `Domanda numero ${i}: ${'parole '.repeat(30)}`, quando: null })
    battute.push({ tu: false, testo: `Risposta numero ${i}: ${'altre parole '.repeat(30)}`, quando: null })
  }
  const t = conv.trascrizione(battute, 'Claude')
  assert.ok(t.length <= conv.CORPO_MAX + 20, `è lunga ${t.length}`)
  assert.match(t, /^Tu: Domanda numero 0:/)
  assert.match(t, /Risposta numero 399:/)
  assert.ok(t.includes('\n\n[…]\n\n'), 'il taglio non si vede')
  // il taglio cade su un a capo: nessuna battuta a metà parola davanti ai puntini
  assert.doesNotMatch(t, /\S\n\n\[…\]/)
})

// — un file sbagliato lo dice —

test('un file che non è JSON, o non è un’esportazione, ha la sua frase', async () => {
  assert.throws(() => conv.riconosci('questo non è json'), /non è un JSON/)
  assert.throws(() => conv.riconosci('{"cache":"altro"}'), /non è un’esportazione di ChatGPT né di Claude/)
  assert.throws(() => conv.riconosci('[{"titolo":"boh"}]'), /non è un’esportazione di ChatGPT né di Claude/)
  assert.throws(() => conv.riconosci('[]'), /è vuoto/)
  await assert.rejects(() => conv.apriFile(join(CASA, 'non-esiste.json')), /Non trovo questo file/)
})

test('un file che non si apre non ferma gli altri, e non prova che le sue chat siano sparite', async () => {
  const buono = scrivi('buono.json', claudeExport())
  const e = await conv.leggi({ file: [join(CASA, 'sparito.json'), buono], codice: false })
  assert.equal(e.docs.length, 1)
  assert.equal(e.guasti.length, 1)
  assert.equal(e.guasti[0]!.file, join(CASA, 'sparito.json'))
})

test('due esportazioni con la stessa chat danno un documento solo', async () => {
  const marzo = scrivi('marzo.json', claudeExport())
  const oggi = scrivi('oggi.json', claudeExport())
  const e = await conv.leggi({ file: [marzo, oggi], codice: false })
  assert.equal(e.docs.length, 1)
  assert.equal(e.docs[0]!.percorso, oggi)
})

// — la prova e la rotta —

test('la prova dice quale file è, quante chat ha, e si ferma al primo che non si apre', async () => {
  const a = scrivi('prova-a.json', chatgptConRamo())
  const b = scrivi('prova-b.json', claudeExport())
  const bene = await conv.prova({ file: [a, b], codice: false })
  assert.ok(bene.ok)
  assert.deepEqual(bene.file.map(f => [f.formato, f.conversazioni]), [['chatgpt', 1], ['claude', 1]])

  const rotto = scrivi('prova-rotto.json', 'non json')
  const male = await conv.prova({ file: [a, rotto], codice: false })
  assert.ok(!male.ok)
  assert.equal(male.file, rotto)
  assert.match(male.errore, /non è un JSON/)
})

test('quello che arriva dalla scheda: percorsi interi, senza doppioni, e almeno una cosa da leggere', () => {
  assert.deepEqual(conv.normalizza({ file: ['/a/conversations.json', ' /a/conversations.json ', 7, ''], codice: 'sì' }),
    { file: ['/a/conversations.json'], codice: false })
  assert.deepEqual(conv.normalizza({ codice: true }), { file: [], codice: true })
  assert.deepEqual(conv.normalizza({ file: ['~/Scaricati/conversations.json'] }).file, [join(CASA, 'Scaricati/conversations.json')])
  assert.throws(() => conv.normalizza({}), /Scegli almeno un file/)
  assert.throws(() => conv.normalizza({ file: ['Scaricati/conversations.json'] }), /deve essere intero/)
  assert.throws(() => conv.normalizza(null), /Scegli almeno un file/)
})

test('l’interruttore di Claude Code chiede che la cartella ci sia', async () => {
  // la casa finta non ha `~/.claude/projects`
  assert.equal(conv.codicePossibile(), false)
  const e = await conv.prova({ file: [], codice: true })
  assert.ok(!e.ok)
  assert.match(e.errore, /Non trovo le sessioni di Claude Code/)
})

// — quante sono, e i titoli dell'app Claude —

test('le sessioni si contano senza aprirle, e la prova riporta il conto', async () => {
  const progetti = join(CASA, 'sessioni-conto')
  mkdirSync(join(progetti, '-a'), { recursive: true })
  mkdirSync(join(progetti, '-b', 'sotto'), { recursive: true })
  writeFileSync(join(progetti, '-a', 'uno.jsonl'), '')
  writeFileSync(join(progetti, '-b', 'due.jsonl'), '')
  writeFileSync(join(progetti, '-b', 'tre.jsonl'), '')
  writeFileSync(join(progetti, '-b', 'appunti.txt'), '')
  writeFileSync(join(progetti, 'fuori.jsonl'), '')
  assert.equal(await conv.contaSessioni(progetti), 3)
  assert.equal(await conv.contaSessioni(join(CASA, 'non-c-e')), 0)
})

test('l’app Claude tiene solo le schede: se ne prende il titolo, per le sessioni che non ne hanno uno', async () => {
  // le schede stanno due cartelle sotto, una per file: `cliSessionId` è l'id del .jsonl
  const schede = join(CASA, 'schede', 'aaa', 'bbb')
  mkdirSync(schede, { recursive: true })
  writeFileSync(join(schede, 'local_1.json'), JSON.stringify({ sessionId: 'local_1', cliSessionId: 'senza-titolo', title: 'Coda delle migrazioni', cwd: '/tmp/prova' }))
  writeFileSync(join(schede, 'local_2.json'), JSON.stringify({ sessionId: 'local_2', cliSessionId: 'sess-1', title: 'Un titolo più vecchio', cwd: '/x' }))
  writeFileSync(join(schede, 'rotta.json'), '{non è json')
  const titoli = await conv.titoliClaude(join(CASA, 'schede'))
  assert.deepEqual([...titoli.entries()].sort(), [['senza-titolo', 'Coda delle migrazioni'], ['sess-1', 'Un titolo più vecchio']])
  assert.equal((await conv.titoliClaude(join(CASA, 'schede-che-non-ci-sono'))).size, 0)

  const progetti = join(CASA, 'sessioni-titoli')
  const cartella = join(progetti, '-tmp-prova')
  mkdirSync(cartella, { recursive: true })
  writeFileSync(join(cartella, 'senza-titolo.jsonl'), sessioneCodice('senza-titolo', '/tmp/prova', [
    { type: 'user', sessionId: 'senza-titolo', cwd: '/tmp/prova', timestamp: '2026-09-02T08:00:00Z', message: { role: 'user', content: 'Spiegami come funziona la coda delle migrazioni in questo progetto, con calma.' } },
    { type: 'assistant', sessionId: 'senza-titolo', cwd: '/tmp/prova', timestamp: '2026-09-02T08:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Le migrazioni stanno in fondo.' }] } }
  ]))
  writeFileSync(join(cartella, 'sess-1.jsonl'), sessioneCodice('sess-1', '/Users/tizio/Progetti/iscrizioni', righeSessione('sess-1', '/Users/tizio/Progetti/iscrizioni')))
  const e = await conv.leggi({ file: [], codice: true }, progetti, join(CASA, 'schede'))
  assert.deepEqual(e.docs.map(d => d.titolo).sort(), [
    'iscrizioni · Validazione del codice fiscale',   // il titolo del file vince su quello della scheda
    'prova · Coda delle migrazioni'                  // senza un titolo nel file, quello della scheda
  ])
})

// — nel catalogo, nel recinto, in casa —

test('le conversazioni sono una fonte del catalogo, con un attrezzo, e solo in casa', () => {
  const voce = registro.CATALOGO.find(c => c.id === 'conversazioni')
  assert.ok(voce && voce.pronto && voce.legge && voce.gruppo === 'Note')
  assert.ok(registro.FONTI.includes('conversazioni'))
  assert.deepEqual(attrezzi.fontiDi('conversazioni.leggi'), ['conversazioni'])
  // legge file di questo disco: su un server quel disco non è di nessuno
  assert.ok(ospitato.SOLO_IN_CASA.includes('conversazioni'))
})
