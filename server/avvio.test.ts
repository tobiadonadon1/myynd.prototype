import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const casa = mkdtempSync(join(tmpdir(), 'myynd-avvio-'))
process.env.MYYND_DATI = casa
const avvio = await import('./avvio.ts')
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const chi = await import('./chi.ts')
const conti = await import('./conti.ts')
const desktop = await import('./connettori/desktop.ts')
const cfg = await import('./config.ts')

before(async () => { await conti.avvia() })
beforeEach(() => { avvio.perProva.dopoCompito(null); store.azzeraTutto(); rmSync(join(casa, 'avvio.json'), { force: true }) })
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })

/** Le fonti che le prove leggono, collegate per chi sta chiedendo: l'avvio non ne accetta altre. */
function collega() {
  cfg.aggiorna({
    desktop: { cartelle: [casa], scelte: true },
    calendario: { url: 'https://example.invalid/agenda.ics' },
    posta: { host: 'imap.example.invalid', porta: 993, utente: 'prova@example.invalid', password: 'x' }
  })
}

function progetto() {
  collega()
  return avvio.progetto({ nome: 'Aurora', obiettivo: 'Preparare il lancio della nuova piattaforma Aurora', revisione: avvio.stato().revisione })
}

function documento(id: string, corpo: string, fonte = 'desktop') {
  return { id, fonte, tipo: 'testo', titolo: `Aurora — ${id}`, corpo, quando: '2026-09-08T12:00:00Z' }
}

function fonti() {
  const docs = [
    documento('brief', 'Aurora: la revisione della pagina prezzi è fissata per venerdì con il team prodotto.'),
    documento('verbale', 'Per Aurora dobbiamo consegnare la nuova documentazione prima della revisione del lancio.'),
    documento('bozza', 'Aurora prevede una prova con cinque clienti già invitati alla sessione della prossima settimana.'),
    { ...documento('promo', 'Aurora propone uno sconto sul nuovo prodotto per tutti gli abbonati alla newsletter.'), massa: true },
    { ...documento('altro', 'Una newsletter sportiva priva di collegamenti con il progetto e con la piattaforma.'), titolo: 'Sport' },
    documento('privato', 'Aurora: questo documento della posta non deve apparire scegliendo soltanto Desktop.', 'posta')
  ]
  store.salvaDocumenti(docs)
  return docs
}

test('first project resumes from disk without marking profile onboarding complete', () => {
  const primo = avvio.stato()
  assert.equal(primo.fase, 'progetto')
  assert.deepEqual(avvio.stato(), primo)
  const salvato = progetto()
  store.chiudiIndici()
  assert.deepEqual(avvio.stato(), salvato)
  assert.equal(salvato.fase, 'fonte')
  assert.equal(progetti.elenco().length, 0, 'the draft must not claim a completed project yet')
})

test('three facts are literal relevant excerpts from only the selected real source', () => {
  const docs = fonti()
  const p = progetto()
  const stato = avvio.fonte({ fonte: 'desktop', revisione: p.revisione })
  assert.equal(stato.fase, 'verifica')
  assert.equal(stato.fatti.length, 3)
  for (const f of stato.fatti) {
    assert.equal(f.confermato, false)
    assert.equal(f.evidenza.fonte, 'desktop')
    assert.equal(f.testo, f.evidenza.estratto)
    assert.ok(docs.find(d => d.id === f.evidenza.doc)?.corpo.includes(f.testo))
    assert.ok(!['promo', 'altro', 'privato'].includes(f.evidenza.doc))
  }
  assert.deepEqual(avvio.stato(), stato, 'polling must not invalidate the client revision')
})

test('six real Markdown source files yield body evidence, never document headings or unrelated news', async () => {
  const folder = join(casa, 'source-markdown')
  mkdirSync(folder, { recursive: true })
  const testi = [
    '# Aurora — clienti pilota\n\n[Fixture di test] Aurora avrà cinque clienti pilota, già invitati alla prima sessione di prova del lancio.',
    '# Aurora — revisione della pagina prezzi\n\n[Fixture di test] La pagina prezzi di Aurora deve essere rivista dal team prodotto prima dell’invito ai clienti pilota.',
    '# Aurora — documentazione del lancio\n\n[Fixture di test] La guida iniziale di Aurora deve spiegare come completare la prima attività durante il test con i clienti pilota.',
    '# Newsletter commerciale — offerte di settembre\n\n[Fixture di test] Solo per questo fine settimana tutti gli accessori da viaggio sono scontati del quaranta per cento.',
    '# Sport — risultati del campionato\n\n[Fixture di test] La squadra cittadina ha vinto la partita disputata domenica sera e rimane seconda in classifica.',
    '# Cultura — rassegna al museo\n\n[Fixture di test] Il museo inaugurerà una mostra dedicata alla ceramica del Novecento, aperta al pubblico per due mesi.'
  ]
  testi.forEach((testo, i) => writeFileSync(join(folder, `fonte-${i}.md`), testo))
  const letti = await desktop.leggiCartella(folder)
  assert.equal(letti.docs.length, 6)
  store.salvaDocumenti(letti.docs)
  const p = progetto()
  const s = avvio.fonte({ fonte: 'desktop', revisione: p.revisione })
  assert.equal(s.fatti.length, 3)
  for (const f of s.fatti) {
    assert.ok(f.testo.startsWith('[Fixture di test]'), f.testo)
    assert.ok(testi.slice(0, 3).some(testo => testo.includes(f.testo)), f.testo)
  }
})

test('frontmatter and Markdown headings never pad a source without useful body text', () => {
  store.salvaDocumenti([
    documento('metadata', '---\ntitle: Aurora — documentazione completa del lancio\ndescription: Aurora raccoglie tutte le informazioni del progetto\n---\n# Aurora — revisione della documentazione del lancio\n\nBreve nota.'),
    documento('setext', 'Aurora — revisione della documentazione per il lancio\n===================================================\n\n# Aurora — organizzazione della documentazione pilota')
  ])
  const p = progetto()
  const s = avvio.fonte({ fonte: 'desktop', revisione: p.revisione })
  assert.deepEqual(s.fatti, [])
})

test('an empty source has no invented facts and can be skipped for useful goal-only planning', () => {
  let s = progetto()
  s = avvio.fonte({ fonte: 'desktop', revisione: s.revisione })
  assert.deepEqual(s.fatti, [])
  assert.equal(s.fase, 'verifica')
  s = avvio.conferma({ ids: [], revisione: s.revisione })
  assert.equal(s.fase, 'azione')
  s = avvio.completa({ azione: 'Scrivere la prima pagina del piano di lancio', giorno: '2026-10-01', revisione: s.revisione })
  assert.equal(s.fase, 'completo')
  assert.deepEqual(s.risultato?.traccia.estratti, [])
  const c = store.compito(s.risultato!.compito.id)!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.giorno, '2026-10-01')
  assert.equal(c.progetto, s.risultato!.progetto.id)
  assert.equal(c.modo, 'io', 'creating a first outline never delegates work without a separate choice')
  assert.match(c.nota!, /not a completed task/)
})

test('explicit source skip works without documents or a model key', () => {
  let s = progetto()
  assert.throws(() => avvio.completa({ azione: s.azione, revisione: s.revisione }), /Conferma gli estratti/)
  s = avvio.fonte({ fonte: null, revisione: s.revisione })
  assert.equal(s.fonteSaltata, true)
  assert.equal(s.fase, 'azione')
  const risultato = avvio.completa({ azione: s.azione, revisione: s.revisione })
  assert.equal(risultato.risultato?.compito.testo, s.progetto?.obiettivo)
  assert.equal(risultato.risultato?.compito.giorno, null)
})

test('invalid dates and empty actions cannot partially create a first result', () => {
  let s = progetto()
  s = avvio.fonte({ fonte: null, revisione: s.revisione })
  assert.throws(() => avvio.completa({ azione: s.azione, giorno: '2026-02-30', revisione: s.revisione }), /Data non valida/)
  assert.throws(() => avvio.completa({ azione: ' ', revisione: s.revisione }), /prossima azione/)
  assert.equal(progetti.elenco().length, 0)
  assert.equal(store.elencoCompiti().length, 0)
  assert.deepEqual(avvio.stato(), s)
})

test('stale revisions and changed source excerpts cannot be confirmed', () => {
  const docs = fonti()
  const p = progetto()
  const s = avvio.fonte({ fonte: 'desktop', revisione: p.revisione })
  assert.throws(() => avvio.fonte({ fonte: null, revisione: p.revisione }), e => e instanceof avvio.ErroreAvvio && e.stato === 409)
  assert.throws(() => avvio.conferma({ ids: ['inventato'], revisione: s.revisione }), /estratti sono cambiati/)
  store.salvaDocumenti([{ ...docs[0], corpo: 'Aurora: il vecchio accordo è stato sostituito e serve una nuova verifica del documento.' }])
  assert.throws(() => avvio.conferma({ ids: s.fatti.map(f => f.id), revisione: s.revisione }), /estratti sono cambiati/)
})

test('confirmed evidence is stored in the first task and a lost-response retry does not duplicate it', () => {
  fonti()
  let s = progetto()
  s = avvio.fonte({ fonte: 'desktop', revisione: s.revisione })
  s = avvio.conferma({ ids: s.fatti.map(f => f.id), revisione: s.revisione })
  const completato = avvio.completa({ azione: 'Rivedere la pagina prezzi con il team', revisione: s.revisione })
  assert.equal(completato.risultato?.traccia.estratti.length, 3)
  const compito = store.compito(completato.risultato!.compito.id)!
  for (const f of s.fatti) {
    assert.ok(compito.nota?.includes(f.evidenza.doc))
    assert.ok(compito.nota?.includes(f.testo))
  }
  assert.deepEqual(avvio.completa({ azione: 'retry', revisione: s.revisione }), completato)
  assert.equal(store.elencoCompiti().length, 1)
  assert.equal(progetti.elenco().length, 1)
})

test('a post-insert crash resumes the recorded intent before accepting project or evidence changes', () => {
  fonti()
  let s = progetto()
  s = avvio.fonte({ fonte: 'desktop', revisione: s.revisione })
  s = avvio.conferma({ ids: s.fatti.map(f => f.id), revisione: s.revisione })
  avvio.perProva.dopoCompito(() => { throw new Error('simulated crash after task insert') })
  assert.throws(() => avvio.completa({ azione: 'Rivedere la pagina prezzi con il team', revisione: s.revisione }), /simulated crash/)
  const task = store.elencoCompiti()[0]
  assert.ok(task)
  const journal = JSON.parse(readFileSync(join(casa, 'avvio.json'), 'utf8'))
  assert.equal(journal.inCorso.azione, task.testo)
  assert.equal(journal.risultato, null)
  avvio.perProva.dopoCompito(null)
  // leggi() recovers the durable intent first, so this stale edit cannot
  // retarget the already created task to an unrelated project.
  assert.throws(() => avvio.progetto({ nome: 'Altro', obiettivo: 'Cambiare completamente il lavoro', revisione: s.revisione }), e => e instanceof avvio.ErroreAvvio && e.stato === 409)
  const recuperato = avvio.stato()
  assert.equal(recuperato.fase, 'completo')
  assert.equal(recuperato.risultato!.compito.id, task.id)
  assert.equal(recuperato.risultato!.compito.testo, task.testo)
  assert.equal(recuperato.risultato!.progetto.id, task.progetto)
  assert.equal(recuperato.risultato!.progetto.nome, 'Aurora')
  assert.equal(recuperato.risultato!.traccia.estratti.length, 3)
  assert.equal(store.elencoCompiti().length, 1)
  assert.equal(progetti.elenco().length, 1)
})

test('onboarding drafts, evidence and results are isolated per account', () => {
  const anna = chi.dentro('avvio-anna', () => { fonti(); return progetto() })
  const bruno = chi.dentro('avvio-bruno', () => avvio.stato())
  assert.notEqual(anna.id, bruno.id)
  assert.equal(bruno.progetto, null)
  const suoi = chi.dentro('avvio-bruno', () => { const p = progetto(); return avvio.fonte({ fonte: 'desktop', revisione: p.revisione }) })
  assert.deepEqual(suoi.fatti, [], 'another account must never inherit document excerpts')
  assert.equal(chi.dentro('avvio-anna', () => avvio.stato()).revisione, anna.revisione)
})

test('a corrupt saved session is reported and retained, not reset into duplicate work', () => {
  avvio.stato()
  writeFileSync(join(casa, 'avvio.json'), '{broken')
  assert.throws(() => avvio.stato(), /dati sono ancora/)
  assert.equal(readFileSync(join(casa, 'avvio.json'), 'utf8'), '{broken')
})

/*
 * Il curriculum che ha fatto partire tutto.
 *
 * Il progetto si chiama «H-Farm», che è anche la scuola che ha fatto: «H-FARM»
 * sta scritto dieci volte in un suo PDF di un anno fa. La ricerca dell'avvio
 * guardava l'indice intero senza guardare le date, ha preso quel file, e la
 * frase che ne è uscita è diventata il suo primo compito. Da lì, per giorni,
 * il punto ha staccato figli: «Identify who will own and score the clean
 * number for the proof», che è una riga di un curriculum.
 */
test('un file di un anno fa non spiega un progetto che comincia adesso', async () => {
  const folder = join(casa, 'source-vecchio')
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'recente.md'),
    '# Aurora\n\n[Fixture di test] Aurora avrà cinque clienti pilota, già invitati alla prima sessione di prova.')
  writeFileSync(join(folder, 'curriculum.md'),
    '# Curriculum\n\n[Fixture di test] Aurora clienti pilota lancio prova sessione, scritto un anno fa e mai toccato.')
  const letti = await desktop.leggiCartella(folder)
  assert.equal(letti.docs.length, 2)
  // il secondo porta la data di un anno fa, come il suo curriculum
  const vecchio = new Date(Date.now() - 400 * 86_400_000).toISOString()
  store.salvaDocumenti(letti.docs.map(d => d.id.includes('curriculum') ? { ...d, quando: vecchio } : d))

  const p = progetto()
  const s = avvio.fonte({ fonte: 'desktop', revisione: p.revisione })
  assert.ok(s.fatti.length > 0, 'non è rimasta nessuna prova')
  for (const f of s.fatti) {
    assert.ok(!f.evidenza.doc.includes('curriculum'),
      `una prova viene da un file di un anno fa: ${f.evidenza.doc}`)
  }
})

/*
 * Collegare tutto, poi leggere tutto insieme.
 *
 * La prima persona di fuori si aspettava di collegare le sue fonti e che
 * Myynd le leggesse insieme; l'avvio ne leggeva una. Queste prove tengono
 * ferme le regole di prima (estratti letterali, niente posta di massa, niente
 * fonti non scelte) con più fonti alla volta.
 */
function tanteFonti() {
  const docs = [
    documento('brief', 'Aurora: la revisione della pagina prezzi è fissata per venerdì con il team prodotto.'),
    documento('verbale', 'Per Aurora dobbiamo consegnare la nuova documentazione prima della revisione del lancio.'),
    documento('bozza', 'Aurora prevede una prova con cinque clienti già invitati alla sessione della prossima settimana.'),
    documento('riunione', 'Aurora: la riunione con i clienti pilota è fissata per martedì alle dieci in sala grande.', 'calendario'),
    documento('prova', 'Aurora: la prova generale del lancio è in agenda giovedì con tutto il team prodotto.', 'calendario'),
    { ...documento('invito', 'Aurora: iscriviti alla newsletter per scoprire tutte le novità della piattaforma.', 'calendario'), massa: true },
    documento('posta', 'Aurora: questo messaggio della posta non deve apparire se la posta non è stata scelta.', 'posta')
  ]
  store.salvaDocumenti(docs)
  return docs
}

test('several sources are read together: excerpts alternate across them, stay literal, and never come from an unchosen source', () => {
  const docs = tanteFonti()
  const p = progetto()
  const s = avvio.fonte({ fonti: ['desktop', 'calendario'], revisione: p.revisione })
  assert.equal(s.fase, 'verifica')
  assert.deepEqual(s.fonti, ['desktop', 'calendario'])
  assert.equal(s.fonte, 'desktop', 'the first source stays readable for older clients')
  assert.equal(s.fonteSaltata, false)
  assert.equal(s.fatti.length, 3)
  assert.deepEqual(new Set(s.fatti.map(f => f.evidenza.fonte)), new Set(['desktop', 'calendario']), 'both chosen sources must be represented')
  assert.equal(s.fatti[1].evidenza.fonte, 'calendario', 'the second excerpt comes from the second source, not the first source again')
  for (const f of s.fatti) {
    assert.equal(f.testo, f.evidenza.estratto)
    const d = docs.find(x => x.id === f.evidenza.doc)
    assert.ok(d?.corpo.includes(f.testo))
    assert.equal(d?.fonte, f.evidenza.fonte)
    assert.ok(!['invito', 'posta'].includes(f.evidenza.doc), f.evidenza.doc)
  }
  assert.deepEqual(avvio.stato(), s, 'polling must not invalidate the client revision')
})

test('a source with many matches does not crowd out the others', () => {
  store.salvaDocumenti([
    ...Array.from({ length: 45 }, (_, i) => documento(`mail-${i}`, `Aurora: aggiornamento numero ${i} sul lancio della piattaforma per i clienti pilota.`, 'posta')),
    documento('piano', 'Aurora: il piano del lancio della piattaforma sta tutto in questo documento del progetto.')
  ])
  const p = progetto()
  const s = avvio.fonte({ fonti: ['posta', 'desktop'], revisione: p.revisione })
  assert.ok(s.fatti.some(f => f.evidenza.doc === 'piano'), 'the one project document on the Mac must still be quoted')
})

test('a session saved with one source resumes as a list of one, and the file keeps both shapes', () => {
  tanteFonti()
  const p = progetto()
  // un avvio salvato da un'app di prima: `fonte` e nessuna lista
  const vecchio = JSON.parse(readFileSync(join(casa, 'avvio.json'), 'utf8'))
  delete vecchio.fonti
  writeFileSync(join(casa, 'avvio.json'), JSON.stringify({ ...vecchio, fonte: 'desktop', fonteScelta: true, verificato: false }))
  let s = avvio.stato()
  assert.equal(s.revisione, p.revisione)
  assert.deepEqual(s.fonti, ['desktop'])
  assert.equal(s.fase, 'verifica')
  assert.ok(s.fatti.length > 0 && s.fatti.every(f => f.evidenza.fonte === 'desktop'))
  s = avvio.conferma({ ids: [s.fatti[0].id], revisione: s.revisione })
  // la stessa fonte chiesta come lista non rimette in discussione quello che si è confermato
  s = avvio.fonte({ fonti: ['desktop'], revisione: s.revisione })
  assert.equal(s.fase, 'azione')
  assert.equal(s.fatti.filter(f => f.confermato).length, 1)
  const scritto = JSON.parse(readFileSync(join(casa, 'avvio.json'), 'utf8'))
  assert.deepEqual(scritto.fonti, ['desktop'])
  assert.equal(scritto.fonte, 'desktop', 'an older app reopening this file still finds its single source')
})

test('the single-source body still works, an empty list skips, and a reordered list keeps confirmations', () => {
  tanteFonti()
  let s = progetto()
  s = avvio.fonte({ fonte: 'desktop', revisione: s.revisione })
  assert.deepEqual(s.fonti, ['desktop'])
  s = avvio.fonte({ fonti: ['desktop', 'calendario'], revisione: s.revisione })
  s = avvio.conferma({ ids: s.fatti.slice(0, 2).map(f => f.id), revisione: s.revisione })
  assert.equal(s.fase, 'azione')
  s = avvio.fonte({ fonti: ['calendario', 'desktop'], revisione: s.revisione })
  assert.equal(s.fase, 'azione', 'the same sources in another order are the same reading')
  assert.equal(s.fatti.filter(f => f.confermato).length, 2)
  s = avvio.fonte({ fonti: ['calendario', 'desktop', 'posta'], revisione: s.revisione })
  assert.equal(s.fase, 'verifica', 'another source means other excerpts to look at')
  assert.equal(s.fatti.filter(f => f.confermato).length, 0)
  s = avvio.fonte({ fonti: [], revisione: s.revisione })
  assert.equal(s.fonteSaltata, true)
  assert.deepEqual(s.fonti, [])
  assert.equal(s.fonte, null)
  assert.equal(s.fase, 'azione')
})

test('a list with an unknown source, or a malformed body, changes nothing', () => {
  const p = progetto()
  for (const corpo of [{ fonti: ['desktop', 'inventata'] }, { fonti: ['claude'] }, { fonti: 'desktop' }, { fonti: [42] }, {}]) {
    assert.throws(() => avvio.fonte({ ...corpo, revisione: p.revisione }), /fonte disponibile/, JSON.stringify(corpo))
  }
  assert.deepEqual(avvio.stato(), p)
})

test('duplicates collapse, and confirmed excerpts keep their own source in the saved result', () => {
  tanteFonti()
  let s = progetto()
  s = avvio.fonte({ fonti: ['desktop', 'calendario', 'desktop'], revisione: s.revisione })
  assert.deepEqual(s.fonti, ['desktop', 'calendario'])
  const scelti = s.fatti
  s = avvio.conferma({ ids: scelti.map(f => f.id), revisione: s.revisione })
  const fatto = avvio.completa({ azione: 'Preparare la riunione con i clienti pilota', revisione: s.revisione })
  assert.deepEqual(fatto.risultato!.traccia.estratti.map(e => e.fonte), scelti.map(f => f.evidenza.fonte))
  assert.deepEqual(fatto.fatti.map(f => f.evidenza.fonte), scelti.map(f => f.evidenza.fonte),
    'after completion each excerpt still names the source it came from')
  assert.ok(fatto.fatti.some(f => f.evidenza.fonte === 'calendario'))
})

test('onboarding source lists stay per account', () => {
  const anna = chi.dentro('avvio-anna-fonti', () => { tanteFonti(); const p = progetto(); return avvio.fonte({ fonti: ['desktop', 'calendario'], revisione: p.revisione }) })
  const bruno = chi.dentro('avvio-bruno-fonti', () => { const p = progetto(); return avvio.fonte({ fonti: ['calendario'], revisione: p.revisione }) })
  assert.deepEqual(anna.fonti, ['desktop', 'calendario'])
  assert.deepEqual(bruno.fonti, ['calendario'])
  assert.deepEqual(bruno.fatti, [], 'another account must never inherit document excerpts')
  assert.deepEqual(chi.dentro('avvio-anna-fonti', () => avvio.stato()).fonti, ['desktop', 'calendario'])
})

test('a source that is not connected cannot be chosen, and nothing changes', () => {
  const p = progetto()
  for (const corpo of [{ fonti: ['desktop', 'notion'] }, { fonte: 'slack' }]) {
    assert.throws(() => avvio.fonte({ ...corpo, revisione: p.revisione }), /Collega questa fonte/, JSON.stringify(corpo))
  }
  assert.deepEqual(avvio.stato(), p)
})
