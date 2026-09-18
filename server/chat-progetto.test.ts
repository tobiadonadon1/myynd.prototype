import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const casa = mkdtempSync(join(tmpdir(), 'myynd-chat-progetto-'))
process.env.MYYND_DATI = casa
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const memoria = await import('./memoria.ts')
const pm = await import('./project-memory.ts')
// tutti gli import prima della prima prova: un `await import` in mezzo al
// file lascia partire le prove già registrate mentre il modulo carica ancora,
// e l'ordine fra le prove non regge più
const claude = await import('./claude.ts')
const cfg = await import('./config.ts')
const riferimento = await import('./riferimento.ts')
const compatibile = await import('./compatibile.ts')
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(casa, { recursive: true, force: true }) })

test('raccontare su cosa si lavora non è un ordine di salvare un progetto', () => {
  // la frase vera, con i suoi errori: prima finiva nel parser e Myynd rispondeva «dimmi il nome del progetto»
  assert.equal(memoria.salvaProgettiEspliciti('I am working on setting up the inteligence in a way in which it is autonomus, it works by itself, and helps me seriously to run my career and my work life.'), null)
  assert.equal(memoria.salvaProgettiEspliciti('ok, i told you what you asked me'), null)
})

test('«I am working on Aurora to launch the portal» resta una dichiarazione che crea il progetto', () => {
  const r = memoria.salvaProgettiEspliciti('I am working on Aurora to launch the client portal in October.')
  assert.ok(r && !r.incompleta && r.salvati.some(p => p.nome === 'Aurora'))
})

test('una chat nata da «Parliamone» sa di quale progetto parla, e la risposta entra nella memoria del progetto', () => {
  const p = progetti.scrivi({ nome: 'Myynd', obiettivo: 'Finish Myynd' })
  store.creaChat('th1', 'Myynd', { progetto: p.id, iniziativa: 'pi-x' })
  store.creaChat('th2', 'una chat qualsiasi')
  const sul = store.chatSulProgetto('th1')
  assert.deepEqual(sul && { progetto: sul.progetto, iniziativa: sul.iniziativa }, { progetto: p.id, iniziativa: 'pi-x' })
  assert.ok(sul && Number.isFinite(Date.parse(sul.quando)))
  assert.equal(store.chatSulProgetto('th2'), null)
  pm.recordCurrentWork(p.id, 'Setting up the intelligence so it works by itself.')
  pm.recordCurrentWork(p.id, 'Now the project cards.')
  const ctx = pm.projectMemoryContext(p.id)
  assert.match(ctx, /"kind":"work"/)
  assert.match(ctx, /Now the project cards\./)
  assert.doesNotMatch(ctx, /Setting up the intelligence/)
  assert.match(progetti.perIlModello('Myynd'), /Now the project cards\./)
})

test('«Myynd for Dad» è Myynd: il punto non lo fa nascere come progetto a sé', () => {
  const myynd = progetti.trovaPerNome('Myynd')!
  const doppio = progetti.scrivi({ nome: 'Myynd for Dad', origine: 'punto' })
  assert.equal(doppio.id, myynd.id)
  assert.ok(!progetti.perContesto().some(p => p.nome === 'Myynd for Dad'))
  // ma un nome che condivide solo una parola non è un alias
  assert.notEqual(progetti.scrivi({ nome: 'Myynd Studio', origine: 'punto' }).id, myynd.id)
})

test('il prossimo risultato concordato entra nel contesto del progetto, e l’ultimo vale', () => {
  const p = progetti.trovaPerNome('Myynd')!
  pm.recordNextResult(p.id, 'A build the first three users can install alone.')
  const ctx = pm.projectMemoryContext(p.id)
  assert.match(ctx, /A build the first three users can install alone\./)
  assert.match(ctx, /Now the project cards\./)
})

// — quello che dice dei suoi progetti si salva: «aggiorna_progetto» —
//
// La conversazione vera del diciotto settembre: «I am actually pausing that
// project, is that ok?», «H-Brain is just a spin off of myynd», e Myynd che
// rispondeva «Understood» senza toccare niente. Qui si prova l'altra metà:
// lo strumento cambia lo stato, scrive la memoria, rifiuta una citazione che
// non è nel messaggio, trova il progetto anche scritto storto, e il legame
// finisce su tutt'e due i progetti.

test('«I am actually pausing that project» ferma il progetto e lascia la decisione nella sua memoria, con le sue parole', () => {
  const hb = progetti.scrivi({ nome: 'H-Brain', obiettivo: 'Ingest one controlled real source in H-Brain production' })
  const messaggio = 'I am actually pausing that project, is that ok?'
  const r = claude.aggiornaDallaChat('t1', { progetto: 'H-Brain', citazione: 'I am actually pausing that project', stato: 'fermo' }, messaggio)
  assert.ok(!r.is_error, String(r.content))
  assert.match(String(r.content), /Salvato su H-Brain: stato fermo \(era attivo\)/)
  assert.match(String(r.content), /Dillo in una riga/)
  assert.equal(progetti.trova(hb.id)?.stato, 'fermo')
  const decisione = pm.projectEvidence(hb.id).find(e => e.key === 'decision:stato')
  assert.ok(decisione, 'la decisione è in memoria')
  assert.equal(decisione.kind, 'decision')
  assert.equal(decisione.provenance, 'user-chat')
  assert.equal(decisione.value, 'Stato: fermo')
  assert.equal(decisione.quote, 'I am actually pausing that project')
  assert.match(pm.projectMemoryContext(hb.id), /"kind":"decision"/)
  // e lo stesso stato detto due volte non è un cambio
  const diNuovo = claude.aggiornaDallaChat('t1b', { progetto: 'H-Brain', citazione: 'I am actually pausing that project', stato: 'fermo' }, messaggio)
  assert.match(String(diNuovo.content), /stato già fermo/)
})

test('una citazione che non è nel suo messaggio si rifiuta, senza lanciare, e non cambia niente', () => {
  const hb = progetti.trovaPerNome('H-Brain')!
  const r = claude.aggiornaDallaChat('t2', { progetto: 'H-Brain', citazione: 'I decided to close H-Brain', stato: 'chiuso' }, 'What is the weather like in Milan?')
  assert.equal(r.is_error, true)
  assert.match(String(r.content), /non sono nel suo messaggio/)
  assert.equal(progetti.trova(hb.id)?.stato, 'fermo')
  // e senza niente da salvare lo dice
  const vuoto = claude.aggiornaDallaChat('t2b', { progetto: 'H-Brain', citazione: 'I am pausing H-Brain' }, 'I am pausing H-Brain')
  assert.equal(vuoto.is_error, true)
  assert.match(String(vuoto.content), /niente da salvare/)
  // uno stato che non esiste si rifiuta
  const storto = claude.aggiornaDallaChat('t2c', { progetto: 'H-Brain', citazione: 'I am pausing H-Brain', stato: 'in pausa' }, 'I am pausing H-Brain')
  assert.equal(storto.is_error, true)
})

test('«HBrain», «H-Brain for the lab» e un alias del riferimento sono H-Brain; il riprendere lo riattiva', () => {
  const hb = progetti.trovaPerNome('H-Brain')!
  assert.equal(progetti.risolvi('HBrain')?.id, hb.id)
  assert.equal(progetti.risolvi('h brain')?.id, hb.id)
  assert.equal(progetti.risolvi('H-Brain for the lab')?.id, hb.id)
  assert.equal(progetti.risolvi(hb.id)?.id, hb.id)
  assert.equal(progetti.risolvi('Brain'), null, 'un pezzo del nome non basta')
  const r = claude.aggiornaDallaChat('t3', { progetto: 'HBrain', citazione: 'I am back on HBrain', stato: 'attivo' }, 'ok, I am back on HBrain from today')
  assert.ok(!r.is_error, String(r.content))
  assert.equal(progetti.trova(hb.id)?.stato, 'attivo')
  // l'altro nome scritto nel riferimento: «H-Brain (brainlab): …»
  riferimento.scrivi('H-Brain (brainlab): building the ingest.')
  const nota = claude.aggiornaDallaChat('t3b', { progetto: 'brainlab', citazione: 'remember that brainlab needs a real source first', nota: 'brainlab needs a real source first' }, 'remember that brainlab needs a real source first')
  assert.ok(!nota.is_error, String(nota.content))
  assert.match(progetti.trova(hb.id)!.note, /^\d{4}-\d{2}-\d{2}: brainlab needs a real source first$/m)
})

test('«H-Brain is just a spin off of myynd» scrive il legame su tutt\'e due i progetti, una volta sola', () => {
  const hb = progetti.trovaPerNome('H-Brain')!
  const myynd = progetti.trovaPerNome('Myynd')!
  const messaggio = 'Yeah i am more focused on myynd right now, H-Brain is just a spin off of myynd.'
  const r = claude.aggiornaDallaChat('t4', { progetto: 'H-Brain', citazione: 'H-Brain is just a spin off of myynd', parteDi: 'myynd' }, messaggio)
  assert.ok(!r.is_error, String(r.content))
  assert.match(String(r.content), /H-Brain is a spin-off of Myynd/)
  assert.match(progetti.trova(hb.id)!.note, /H-Brain is a spin-off of Myynd\./)
  assert.match(progetti.trova(myynd.id)!.note, /H-Brain is a spin-off of Myynd\./)
  // le note di prima restano: si aggiunge, non si riscrive
  assert.match(progetti.trova(hb.id)!.note, /brainlab needs a real source first/)
  // detto di nuovo non si raddoppia
  claude.aggiornaDallaChat('t4b', { progetto: 'H-Brain', citazione: 'H-Brain is just a spin off of myynd', parteDi: 'Myynd' }, messaggio)
  assert.equal(progetti.trova(myynd.id)!.note.split('spin-off').length, 2)
  // e in memoria del progetto la nota ha la provenienza della chat
  assert.ok(pm.projectEvidence(hb.id).some(e => e.kind === 'note' && e.provenance === 'user-chat'))
  // un progetto madre che non esiste si rifiuta con i nomi che conosce
  const ignoto = claude.aggiornaDallaChat('t4c', { progetto: 'H-Brain', citazione: 'H-Brain is just a spin off of myynd', parteDi: 'Atlantide' }, messaggio)
  assert.equal(ignoto.is_error, true)
  assert.match(String(ignoto.content), /Non conosco un progetto «Atlantide»\. Quelli registrati: .*H-Brain/)
})

test('un progetto che non conosce nasce solo se lo nomina lei adesso e ne dice l\'obiettivo o di cosa fa parte', () => {
  const senza = claude.aggiornaDallaChat('t5', { progetto: 'Nextas', citazione: 'Nextas is paused', stato: 'fermo' }, 'Nextas is paused for now')
  assert.equal(senza.is_error, true)
  assert.match(String(senza.content), /Non conosco un progetto «Nextas»/)
  assert.equal(progetti.trovaPerNome('Nextas'), undefined)
  const con = claude.aggiornaDallaChat('t5b', { progetto: 'Nextas', citazione: 'Nextas is the outreach agent I am building for Dad', obiettivo: 'the outreach agent for Dad', stato: 'attivo' }, 'Nextas is the outreach agent I am building for Dad.')
  assert.ok(!con.is_error, String(con.content))
  const nx = progetti.trovaPerNome('Nextas')!
  assert.equal(nx.origine, 'conversazione')
  assert.equal(nx.obiettivo, 'the outreach agent for Dad')
  // ma un nome che non sta nel messaggio non nasce, anche con un obiettivo
  const fantasma = claude.aggiornaDallaChat('t5c', { progetto: 'Zefiro', citazione: 'the outreach agent', obiettivo: 'x' }, 'Nextas is the outreach agent I am building for Dad.')
  assert.equal(fantasma.is_error, true)
})

test('la regola sta nel prompt di ogni chat con gli strumenti in mano, e non in quello senza', () => {
  const con = claude.testoDi(claude.corpoRichiesta('ciao', [], [], true).system)
  assert.match(con, /aggiorna_progetto/)
  assert.match(con, /una\s+domanda per volta/)
  assert.match(con, /Mai «capito» senza lo strumento/)
  const senza = claude.testoDi(claude.corpoRichiesta('ciao', [], [], false).system)
  assert.doesNotMatch(senza, /aggiorna_progetto/)
  const compatto = claude.testoDi(claude.corpoRichiesta('ciao', [], [], true, true).system)
  assert.doesNotMatch(compatto, /aggiorna_progetto/, 'a un modello di casa non si chiede uno strumento che non ha')
})

/*
 * E il filo intero: il modello finto chiama «aggiorna_progetto», e la chat
 * risponde con quello che lo strumento le ha detto. Lo stesso fornitore
 * compatibile finto di claude.test.ts, ridotto all'osso.
 */
function fornitoreFinto(giri: { testo?: string; chiamate?: { name: string; input: unknown }[] }[]) {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: Record<string, unknown>[] = []
  let n = 0
  compatibile.usaRete((async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'gpt-prova' }] })
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    const g = giri[Math.min(n++, giri.length - 1)] ?? {}
    const eventi: unknown[] = []
    if (g.testo) eventi.push({ id: 'x', model: 'gpt-prova', choices: [{ index: 0, delta: { content: g.testo } }] })
    for (const [i, c] of (g.chiamate ?? []).entries()) {
      eventi.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `t${n}-${i}`, function: { name: c.name, arguments: JSON.stringify(c.input) } }] } }] })
    }
    eventi.push({ choices: [{ index: 0, delta: {}, finish_reason: g.chiamate?.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } })
    return new Response(eventi.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch)
  return ricevute
}
after(() => compatibile.usaRete(null))

test('dalla chat: il modello chiama «aggiorna_progetto», il progetto cambia, e la risposta arriva', async () => {
  const hb = progetti.trovaPerNome('H-Brain')!
  const ricevute = fornitoreFinto([
    { chiamate: [{ name: 'aggiorna_progetto', input: { progetto: 'H-Brain', citazione: 'H-Brain is closed', stato: 'chiuso' } }] },
    { testo: 'Saved: H-Brain is closed.' }
  ])
  const r = await claude.rispondiInStreaming('Update your memory: H-Brain is closed, I will not go back to it.', [], () => {}, { aggiungiCompito: () => ({ id: 'mai' }) })
  assert.match(r.testo, /H-Brain is closed/)
  assert.equal(progetti.trova(hb.id)?.stato, 'chiuso')
  // (a un fornitore compatibile gli strumenti non si offrono: qui si prova che
  // la chiamata, quando arriva, passa dal giro e cambia il progetto)
  const tornati = ricevute.flatMap(x => ((x.messages ?? []) as { role: string; content: string }[]).filter(m => m.role === 'tool').map(m => String(m.content)))
  assert.ok(tornati.some(t => /Salvato su H-Brain: stato chiuso \(era attivo\)/.test(t)), 'il risultato dello strumento dice cos\'è cambiato')
})
