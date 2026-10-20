// Quando lui segna una cosa fatta, senza un modello sotto.
//
// Il traguardo finisce nella memoria del progetto, e basta: nessuna riga
// indovinata in lista, nessuna domanda. Una riga lasciata perdere o una voce
// scartata non sono traguardi, e senza progetto non c'è dove segnarle. Le
// domande «qual è il passo dopo?» già aperte si leggono ancora.
//
// Il modello si sostituisce con `perProva`: è l'unica strada, ed esiste apposta.
//
//   node --test server/dopo-fatto.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-dopo-fatto-'))
process.env.MYYND_DATI = CASA
writeFileSync(join(CASA, 'config.json'), JSON.stringify({ lingua: 'it', nome: 'Tobia' }))

const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const memoria = await import('./project-memory.ts')
const domande = await import('./domande.ts')
const dopoFatto = await import('./dopo-fatto.ts')

before(() => store.azzeraTutto())
after(() => {
  dopoFatto.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

let n = 0
function riga(testo: string, progetto: string | null = null, extra: { origine?: string; madre?: string | null } = {}): string {
  const id = `c${++n}`
  store.scriviCompito({ id, testo, progetto, ordine: `o${String(n).padStart(3, '0')}`, ...extra })
  return id
}
/** Le righe vive nate come «seguito» dentro un progetto. */
const seguiti = (pid: string) => store.elencoCompiti().filter(c => c.origine === 'seguito' && c.progetto === pid)
/** I traguardi segnati nella memoria di un progetto. */
const fatti = (pid: string) => memoria.projectEvidence(pid).filter(r => r.key.startsWith('fatto:'))

test('una riga fatta di un progetto va nella memoria del progetto, una volta sola; niente riga indovinata, niente domanda', async () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Lanciare con cinque clienti' })
  dopoFatto.perProva({ collegato: () => true, classificaPasso: async () => { throw new Error('non doveva chiamare il modello') } })
  const id = riga('Renew your Apple certificate in Xcode', p.id)
  store.cambiaStatoCompito(id, 'fatto')
  // quello che la rotta mette nella risposta, senza modello
  assert.equal(dopoFatto.progettoDelFatto({ genere: 'compito', id }), 'Aurora')

  assert.deepEqual(await dopoFatto.registraFatto({ genere: 'compito', id }), { progetto: 'Aurora', prossimo: 'niente' })
  const ricordi = fatti(p.id)
  assert.equal(ricordi.length, 1)
  assert.equal(ricordi[0].key, `fatto:${id}`)
  assert.equal(ricordi[0].kind, 'work')
  assert.match(ricordi[0].value, /Renew your Apple certificate in Xcode/)
  // il 19 ottobre da qui nasceva «Archive Myynd and upload a signed build to TestFlight»
  assert.equal(seguiti(p.id).length, 0)
  assert.ok(!store.elencoCompiti().some(c => c.madre === id))
  assert.equal(store.domandaAperta(), null)

  // la stessa chiusura registrata due volte non raddoppia il traguardo
  await dopoFatto.registraFatto({ genere: 'compito', id })
  assert.equal(fatti(p.id).length, 1)
})

test('una riga lasciata perdere non è un traguardo: niente memoria, niente riga, niente domanda', async () => {
  const p = progetti.scrivi({ nome: 'Cometa' })
  const id = riga('Rifare il sito', p.id)
  store.cambiaStatoCompito(id, 'lasciato', 'Il cliente ha rinunciato')
  assert.equal((await dopoFatto.registraFatto({ genere: 'compito', id })).prossimo, 'niente')
  assert.equal(fatti(p.id).length, 0)
  assert.equal(seguiti(p.id).length, 0)
  assert.equal(store.domandeConTema(`fatto:${p.id}`).length, 0)
})

test('una voce del feed fatta, con il progetto dedotto dal titolo, si segna lo stesso; una scartata no', async () => {
  const p = progetti.scrivi({ nome: 'Delta', obiettivo: 'Chiudere il round' })
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Mandare il deck Delta a Bianchi', testo: 'Bianchi aspetta il deck.', fonte: 'posta' }])
  const v = store.elencoFeed('aperto').find(x => x.titolo === 'Mandare il deck Delta a Bianchi')!
  assert.equal(v.progetto ?? null, null, 'la colonna deve essere vuota: il progetto si deduce')
  store.cambiaStatoFeed(v.id, 'fatto', 'Già fatto.')
  assert.equal(dopoFatto.progettoDelFatto({ genere: 'voce', id: v.id }), 'Delta')
  assert.deepEqual(await dopoFatto.registraFatto({ genere: 'voce', id: v.id }), { progetto: 'Delta', prossimo: 'niente' })
  assert.equal(fatti(p.id)[0]?.key, `fatto:${v.id}`)
  assert.equal(seguiti(p.id).length, 0)

  store.salvaFeed([{ tipo: 'Da leggere', titolo: 'Newsletter di Delta', testo: 'Il numero di settembre.', fonte: 'posta' }])
  const w = store.elencoFeed('aperto').find(x => x.titolo === 'Newsletter di Delta')!
  store.cambiaStatoFeed(w.id, 'scartato', 'Non mi interessa.')
  await dopoFatto.registraFatto({ genere: 'voce', id: w.id })
  assert.equal(fatti(p.id).length, 1)
})

test('una riga senza progetto non ha dove segnarsi', async () => {
  const id = riga('Comprare il latte')
  store.cambiaStatoCompito(id, 'fatto')
  assert.equal(dopoFatto.progettoDelFatto({ genere: 'compito', id }), null)
  assert.deepEqual(await dopoFatto.registraFatto({ genere: 'compito', id }), { progetto: null, prossimo: 'niente' })
  assert.ok(!store.elencoCompiti().some(c => c.madre === id))
})

/*
 * La risposta a «qual è il passo dopo?» si guarda prima di scrivere.
 *
 * «I have completed it, i have approved it.» è finito in lista come una cosa
 * da fare: «That is a faulty feature.» Uno stato va in memoria e la domanda
 * si chiude con «segnato»; un passo va in lista; altro si chiude e basta. Gli
 * stati ovvi non arrivano nemmeno al modello.
 */
test('uno stato («l’ho completata, l’ho approvata») va in memoria e non in lista, senza chiamare il modello', async () => {
  const p = progetti.scrivi({ nome: 'Ombra', obiettivo: 'Approvare le bozze' })
  dopoFatto.perProva({ collegato: () => true, classificaPasso: async () => { throw new Error('non doveva chiamare il modello') } })
  const d = store.apriDomanda({ tema: `fatto:${p.id}`, testo: 'You closed «Approve the X draft for Ombra». What is the next step there?', spunto: [], progetto: p.id })!
  const { esito } = await domande.rispondiADomanda(d.id, 'I have completed it, i have approved it.')
  assert.equal(esito, 'Me lo sono segnato.')
  assert.equal(seguiti(p.id).length, 0, 'uno stato non è una riga da fare')
  const detto = memoria.projectEvidence(p.id).find(r => r.key === 'lavoro-attuale')
  assert.equal(detto?.kind, 'work')
  assert.equal(detto?.value, 'Told me: I have completed it, i have approved it.')
  assert.equal(store.domanda(d.id)?.stato, 'risposta')
})

test('il modello decide quello che il filtro non vede: uno stato va in memoria, un passo in lista con le sue parole, altro si segna e basta', async () => {
  const p = progetti.scrivi({ nome: 'Pino', obiettivo: 'Un progetto' })
  const chieste: string[] = []
  dopoFatto.perProva({ collegato: () => true, classificaPasso: async o => {
    chieste.push(o.risposta)
    if (/Apple/.test(o.risposta)) return { tipo: 'stato' }
    if (/contract/.test(o.risposta)) return { tipo: 'passo', passo: 'Send the signed contract to Rossi' }
    return { tipo: 'altro' }
  } })
  let d = store.apriDomanda({ tema: `fatto:${p.id}`, testo: 'You closed «Prepare the build for Pino». What is the next step there?', spunto: [], progetto: p.id })!
  // uno stato che il filtro non riconosce: lo dice il modello
  assert.equal((await domande.rispondiADomanda(d.id, 'Apple is reviewing the build since Monday.')).esito, 'Me lo sono segnato.')
  assert.equal(seguiti(p.id).length, 0)
  assert.equal(memoria.projectEvidence(p.id).find(r => r.key === 'lavoro-attuale')?.value, 'Told me: Apple is reviewing the build since Monday.')
  // la settimana di silenzio dopo una risposta si salta riaprendo il tema a mano
  const riapri = () => { const gia = store.domandaPerTema(`fatto:${p.id}`)!; store.riapriDomanda(gia.id, 'Qual è il passo dopo?', []); return store.domandaAperta()! }
  // un passo: la riga con le parole del modello, che comincia con un verbo
  d = riapri()
  assert.equal((await domande.rispondiADomanda(d.id, 'we should probably get the contract signed by Rossi and send it over')).esito, 'In lista per Pino: «Send the signed contract to Rossi».')
  assert.deepEqual(seguiti(p.id).map(c => c.testo), ['Send the signed contract to Rossi'])
  // altro: si chiude e basta
  d = riapri()
  assert.equal((await domande.rispondiADomanda(d.id, 'Good question, let me think about it')).esito, 'Me lo sono segnato.')
  assert.equal(seguiti(p.id).length, 1)
  assert.equal(chieste.length, 3)
})

test('senza modello, quello che il filtro non riconosce come stato resta un passo, com’era', async () => {
  const p = progetti.scrivi({ nome: 'Quercia', obiettivo: 'Un progetto' })
  dopoFatto.perProva({ collegato: () => false, classificaPasso: async () => { throw new Error('senza modello non si chiama') } })
  const d = store.apriDomanda({ tema: `fatto:${p.id}`, testo: 'Qual è il passo dopo?', spunto: [], progetto: p.id })!
  assert.equal(await dopoFatto.rispostaSulPasso(d, 'Chiamare il commercialista per la fattura'), 'In lista per Quercia: «Chiamare il commercialista per la fattura».')
  assert.equal(await dopoFatto.rispostaSulPasso(d, 'L\'ho già mandata ieri'), 'Me lo sono segnato.')
  assert.deepEqual(seguiti(p.id).map(c => c.testo), ['Chiamare il commercialista per la fattura'])
})
