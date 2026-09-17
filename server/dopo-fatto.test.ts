// Quando lui segna una cosa fatta, senza un modello sotto.
//
// Quello che si prova è quello che sta attorno alla chiamata: il traguardo
// finisce nella memoria del progetto, il passo dopo va in lista una volta
// sola e come figlia della cosa chiusa, e quando il modello non sa la
// domanda si apre una volta per progetto. E quello che non si fa: una riga
// lasciata perdere o una voce scartata non sono traguardi, senza progetto
// non c'è un passo dopo, senza modello si segna e basta.
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

test('una riga fatta di un progetto: il traguardo in memoria, e il passo dopo in lista una volta sola', async () => {
  const p = progetti.scrivi({ nome: 'Aurora', obiettivo: 'Lanciare con cinque clienti' })
  dopoFatto.perProva({ collegato: () => true, prossimoPasso: async () => 'Mandare il contratto firmato a Rossi' })
  const id = riga('Preparare il contratto per Rossi', p.id)
  store.cambiaStatoCompito(id, 'fatto')
  // quello che la rotta mette nella risposta, senza modello
  assert.equal(dopoFatto.progettoDelFatto({ genere: 'compito', id }), 'Aurora')

  assert.deepEqual(await dopoFatto.registraFatto({ genere: 'compito', id }), { progetto: 'Aurora', prossimo: 'passo' })
  const ricordi = fatti(p.id)
  assert.equal(ricordi.length, 1)
  assert.equal(ricordi[0].key, `fatto:${id}`)
  assert.equal(ricordi[0].kind, 'work')
  assert.match(ricordi[0].value, /Preparare il contratto per Rossi/)

  const [passo] = seguiti(p.id)
  assert.ok(passo, 'il passo dopo non è in lista')
  assert.equal(passo.testo, 'Mandare il contratto firmato a Rossi')
  assert.equal(passo.madre, id)
  assert.equal(passo.progetto, p.id)
  assert.equal(passo.quando, 'oggi')
  assert.equal(passo.stato, 'aperto')

  // la stessa chiusura registrata due volte non raddoppia il passo: è già in lista
  assert.equal((await dopoFatto.registraFatto({ genere: 'compito', id })).prossimo, 'niente')
  assert.equal(seguiti(p.id).length, 1)
  assert.equal(fatti(p.id).length, 1)
  assert.equal(store.domandaAperta(), null)
})

test('se il modello non sa il passo dopo lo chiede a lui: una domanda per progetto, non due; la risposta va in lista', async () => {
  const p = progetti.scrivi({ nome: 'Borgo', obiettivo: 'Trasloco a marzo' })
  dopoFatto.perProva({ collegato: () => true, prossimoPasso: async () => null })
  const a = riga('Chiamare il notaio', p.id)
  store.cambiaStatoCompito(a, 'fatto')
  assert.deepEqual(await dopoFatto.registraFatto({ genere: 'compito', id: a }), { progetto: 'Borgo', prossimo: 'domanda' })
  const d = store.domandaAperta()
  assert.ok(d, 'nessuna domanda aperta')
  assert.equal(d.tema, `fatto:${p.id}`)
  assert.equal(d.progetto, p.id)
  assert.equal(d.testo, 'Hai chiuso «Chiamare il notaio» di Borgo. Qual è il passo dopo?')
  assert.equal(seguiti(p.id).length, 0)

  // una seconda cosa fatta sullo stesso progetto, con la domanda ancora aperta: non si richiede
  const b = riga('Firmare il compromesso', p.id)
  store.cambiaStatoCompito(b, 'fatto')
  assert.equal((await dopoFatto.registraFatto({ genere: 'compito', id: b })).prossimo, 'niente')
  assert.equal(store.domandeConTema('fatto:').filter(x => x.progetto === p.id).length, 1)
  assert.equal(store.domandaAperta()?.id, d.id)
  // il traguardo però si segna lo stesso
  assert.equal(fatti(p.id).length, 2)

  // la risposta è il passo: va in lista sotto il progetto, e la domanda si chiude dicendo dove
  const { esito } = await domande.rispondiADomanda(d.id, 'Mandare le chiavi vecchie all’agenzia.')
  assert.equal(esito, 'In lista per Borgo: «Mandare le chiavi vecchie all’agenzia».')
  assert.equal(store.domanda(d.id)?.stato, 'risposta')
  const [passo] = seguiti(p.id)
  assert.equal(passo?.testo, 'Mandare le chiavi vecchie all’agenzia')
  assert.equal(passo?.madre, null)
  assert.equal(store.domandaAperta(), null)
})

test('una riga lasciata perdere non è un traguardo: niente memoria, niente passo, niente domanda', async () => {
  const p = progetti.scrivi({ nome: 'Cometa' })
  let chiamato = false
  dopoFatto.perProva({ collegato: () => true, prossimoPasso: async () => { chiamato = true; return 'Qualcosa da fare' } })
  const id = riga('Rifare il sito', p.id)
  store.cambiaStatoCompito(id, 'lasciato', 'Il cliente ha rinunciato')
  assert.equal((await dopoFatto.registraFatto({ genere: 'compito', id })).prossimo, 'niente')
  assert.equal(chiamato, false)
  assert.equal(fatti(p.id).length, 0)
  assert.equal(seguiti(p.id).length, 0)
  assert.equal(store.domandeConTema(`fatto:${p.id}`).length, 0)
})

test('una voce del feed fatta, con il progetto dedotto dal titolo: stesso giro, e la riga nuova porta la voce', async () => {
  const p = progetti.scrivi({ nome: 'Delta', obiettivo: 'Chiudere il round' })
  dopoFatto.perProva({ collegato: () => true, prossimoPasso: async () => 'Fissare la chiamata con gli investitori' })
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Mandare il deck Delta a Bianchi', testo: 'Bianchi aspetta il deck.', fonte: 'posta' }])
  const v = store.elencoFeed('aperto').find(x => x.titolo === 'Mandare il deck Delta a Bianchi')!
  assert.equal(v.progetto ?? null, null, 'la colonna deve essere vuota: il progetto si deduce')
  store.cambiaStatoFeed(v.id, 'fatto', 'Già fatto.')
  assert.equal(dopoFatto.progettoDelFatto({ genere: 'voce', id: v.id }), 'Delta')

  assert.deepEqual(await dopoFatto.registraFatto({ genere: 'voce', id: v.id }), { progetto: 'Delta', prossimo: 'passo' })
  assert.equal(fatti(p.id)[0]?.key, `fatto:${v.id}`)
  const [passo] = seguiti(p.id)
  assert.equal(passo?.testo, 'Fissare la chiamata con gli investitori')
  assert.equal(passo?.voce, v.id)
  assert.equal(passo?.madre, null)
})

test('senza un modello si segna il traguardo e basta; una voce scartata non si segna', async () => {
  const p = progetti.scrivi({ nome: 'Echo' })
  dopoFatto.perProva({ collegato: () => false, prossimoPasso: async () => 'Non dovrebbe arrivare qui' })
  const id = riga('Scrivere il brief Echo', p.id)
  store.cambiaStatoCompito(id, 'fatto')
  assert.deepEqual(await dopoFatto.registraFatto({ genere: 'compito', id }), { progetto: 'Echo', prossimo: 'niente' })
  assert.equal(fatti(p.id).length, 1)
  assert.equal(seguiti(p.id).length, 0)
  assert.equal(store.domandeConTema(`fatto:${p.id}`).length, 0)

  store.salvaFeed([{ tipo: 'Da leggere', titolo: 'Newsletter di Echo', testo: 'Il numero di settembre.', fonte: 'posta' }])
  const v = store.elencoFeed('aperto').find(x => x.titolo === 'Newsletter di Echo')!
  store.cambiaStatoFeed(v.id, 'scartato', 'Non mi interessa.')
  dopoFatto.perProva({ collegato: () => true, prossimoPasso: async () => 'Non dovrebbe arrivare qui' })
  assert.equal((await dopoFatto.registraFatto({ genere: 'voce', id: v.id })).prossimo, 'niente')
  assert.equal(fatti(p.id).length, 1)
  assert.equal(seguiti(p.id).length, 0)
})

test('una riga senza progetto non ha un passo dopo del progetto', async () => {
  dopoFatto.perProva({ collegato: () => true, prossimoPasso: async () => 'Qualcosa' })
  const id = riga('Comprare il latte')
  store.cambiaStatoCompito(id, 'fatto')
  assert.equal(dopoFatto.progettoDelFatto({ genere: 'compito', id }), null)
  assert.deepEqual(await dopoFatto.registraFatto({ genere: 'compito', id }), { progetto: null, prossimo: 'niente' })
  assert.ok(!store.elencoCompiti().some(c => c.madre === id))
})

test('il seguito di un seguito va avanti; ma se la madre ha già un’altra figlia in lista non si raddoppia', async () => {
  const p = progetti.scrivi({ nome: 'Faro' })
  dopoFatto.perProva({ collegato: () => true, prossimoPasso: async () => 'Pubblicare il sito di Faro' })
  const madre = riga('Scrivere i testi di Faro', p.id)
  const figlia = riga('Rivedere i testi di Faro', p.id, { origine: 'seguito', madre })
  store.cambiaStatoCompito(figlia, 'fatto')
  assert.equal((await dopoFatto.registraFatto({ genere: 'compito', id: figlia })).prossimo, 'passo')
  assert.deepEqual(seguiti(p.id).map(c => [c.testo, c.madre]), [['Pubblicare il sito di Faro', figlia]])

  riga('Impaginare i testi di Faro', p.id, { origine: 'seguito', madre })
  const terza = riga('Correggere i refusi di Faro', p.id, { origine: 'seguito', madre })
  store.cambiaStatoCompito(terza, 'fatto')
  assert.equal((await dopoFatto.registraFatto({ genere: 'compito', id: terza })).prossimo, 'niente')
  assert.equal(seguiti(p.id).length, 2)
  // il traguardo si segna comunque
  assert.equal(fatti(p.id).length, 2)
})
