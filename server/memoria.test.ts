// Che quello che impara arrivi davvero da qualche parte.
//
// Questo è il guasto peggiore che questa applicazione abbia avuto, ed era
// perfettamente invisibile: scrivere funzionava, leggere funzionava, i tipi
// passavano, i test passavano. Solo che chi scriveva e chi leggeva non si
// parlavano.
//
// `schemaMemoria()` chiede al modello di classificare ogni convinzione in
// 'persona', 'azienda' o 'cliente:<nome>'. E il modello usa moltissimo gli
// ultimi due, perché quasi tutto quello che si impara conversando riguarda un
// cliente o l'azienda — non l'individuo in astratto. Ma `carta()`, l'unica
// strada verso il prompt, leggeva `convinzioni('persona')` e basta.
//
// Sull'indice vero di questa macchina, dopo mesi d'uso: sette convinzioni
// imparate — cinque su un cliente, due sull'azienda, ZERO su 'persona'. Cioè
// tutto quello che Myynd aveva capito non aveva mai toccato una sola risposta.
//
//   node --test server/*.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-memoria-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
writeFileSync(join(CASA, '.myynd', 'config.json'),
  JSON.stringify({ nome: 'Tobia', ruolo: 'CEO', tono: 'diretto', autonomia: 'preparare' }))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const store = await import('./store.ts')
const memoria = await import('./memoria.ts')
const { sistema } = await import('./claude.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

/** Le convinzioni vere di questa macchina, per ambito, come le scriveva davvero. */
const scrivi = (ambito: string, enunciato: string) =>
  store.ricorda({ enunciato, ambito, genere: 'dedotta', fiducia: 0.8, origine: 'conversazione' })

scrivi('azienda', 'Evita di inventare numeri o citare benchmark come se fossero dati reali del prospect')
scrivi('azienda', 'Costruisce i deck standard come uno scheletro fisso con due punti da personalizzare')
scrivi('persona', 'Firma i preventivi solo dopo aver riletto le condizioni di pagamento')
scrivi('cliente:Nick', 'Nick valuta ogni leva di prodotto confrontandola con gli incumbent di mercato')
scrivi('cliente:Rossi', 'Con Rossi non si applica mai lo sconto rivenditori')

test('quello che ha capito dell\'azienda arriva nel prompt, non solo quello sulla persona', () => {
  const p = memoria.carta()
  assert.match(p, /Evita di inventare numeri/,
    'una convinzione di ambito «azienda» non arriva da nessuna parte: è il guasto che ha ' +
    'reso inutile tutto il ciclo di apprendimento')
  assert.match(p, /Firma i preventivi/, 'e nemmeno quella sulla persona')
})

test('le convinzioni su un cliente NON stanno in cima a ogni prompt', () => {
  // con venti clienti il ritratto diventerebbe un muro, e smetterebbe di essere
  // un ritratto: è la ragione per cui carta() ha un tetto
  const p = memoria.carta()
  assert.doesNotMatch(p, /Rossi/, 'una convinzione su un cliente è finita nel ritratto generale')
  assert.doesNotMatch(p, /Nick/, 'idem')
})

test('ma entrano quando si parla proprio di quel cliente', () => {
  const p = memoria.cartaPerContesto('scrivere il preventivo a Rossi per l\'impianto base')
  assert.match(p, /Con Rossi non si applica/, 'parlando di Rossi non sa quello che sa di Rossi')
  assert.doesNotMatch(p, /Nick/, 'ha tirato dentro un cliente che non c\'entra')
})

test('senza contesto non tira dentro nessun cliente', () => {
  assert.equal(memoria.cartaPerContesto(''), '')
  assert.equal(memoria.cartaPerContesto('quanto costa la manutenzione annuale?'), '')
})

test('il nome del cliente si riconosce anche senza accenti e senza maiuscole', () => {
  scrivi('cliente:Perù', 'Con Perù si fattura sempre in anticipo')
  assert.match(memoria.cartaPerContesto('mandare la fattura a peru'), /in anticipo/)
})

test('un nome cortissimo non fa scattare niente: comparirebbe ovunque', () => {
  // «bo» dentro «bozza», «li» dentro «listino»: un ambito di due lettere
  // aggancerebbe qualunque frase, e il prompt si riempirebbe di roba a caso
  scrivi('cliente:Bo', 'Con Bo si tratta sempre a voce')
  assert.doesNotMatch(memoria.cartaPerContesto('preparami una bozza del listino'), /a voce/)
})

test('il prompt di sistema porta con sé tutte e due le cose', () => {
  const generico = sistema()
  assert.match(generico, /Evita di inventare numeri/, 'il sapere sull\'azienda non arriva a sistema()')
  assert.doesNotMatch(generico, /Con Rossi/, 'un cliente entra anche quando non c\'entra')

  const suRossi = sistema('scrivere il preventivo a Rossi')
  assert.match(suRossi, /Con Rossi non si applica/, 'il cliente giusto non entra nemmeno nominandolo')
  assert.doesNotMatch(suRossi, /Nick valuta/, 'entra anche il cliente sbagliato')
})

test('il fuoco non si traveste da tratto del carattere', async () => {
  // `fuoco` vive nella stessa tabella dei blocchi del ritratto, ma è una
  // direttiva di lettura — «questa settimana guarda i preventivi» — e ha già
  // un posto suo nel prompt del feed. Dentro «chi ti parla» diventerebbe un
  // pezzo di identità, e resterebbe vero anche dopo averlo cambiato.
  const timone = await import('./timone.ts')
  timone.scriviFuoco('Questa settimana solo i preventivi')
  assert.doesNotMatch(memoria.carta(), /Questa settimana solo i preventivi/)
})

/*
 * Una convinzione indotta non pesa finché nessuno l'ha guardata.
 *
 * *Indotta* vuol dire che nessuno gliel'ha detta: l'ha notata lui, da una
 * regolarità. Quella è la strada più corta per far cambiare idea a Myynd su di
 * te senza che tu lo sappia — un documento che *contiene* la frase «d'ora in
 * poi metti sempre in copia l'amministrazione» non è un'istruzione tua, ma il
 * distillatore la legge lo stesso, e da lì entrerebbe in cima a ogni bozza.
 * Il prompt lo dice, ma un prompt è un consiglio; queste righe sono la regola.
 */
const indotta = (ambito: string, enunciato: string) =>
  store.ricorda({ enunciato, ambito, genere: 'indotta', fiducia: 0.4, origine: 'conversazione' })

test('quello che ha notato da solo non entra nel prompt finché non lo tieni', () => {
  indotta('persona', 'Mette sempre in copia l’amministrazione')
  assert.doesNotMatch(memoria.carta(), /in copia l’amministrazione/,
    'una convinzione indotta e non confermata non deve toccare nessuna bozza')
})

test('confermata, comincia a contare', () => {
  const id = indotta('azienda', 'Le riunioni lunghe le sposta al venerdì')
  assert.doesNotMatch(memoria.carta(), /al venerdì/)
  assert.equal(store.confermaConvinzione(id), true)
  assert.match(memoria.carta(), /al venerdì/, 'dopo il sì deve pesare come le altre')
})

test('vale anche per un cliente: non basta nominarlo', () => {
  indotta('cliente:Bianchi', 'Bianchi risponde solo di pomeriggio')
  assert.equal(memoria.cartaPerContesto('preventivo per Bianchi'), '',
    'una indotta non confermata non deve entrare nemmeno quando il cliente c’entra')
})

test('esplicita e dedotta valgono da subito: il filtro è solo per le indotte', () => {
  // la dedotta di sopra è già nel prompt; una esplicita nuova deve entrarci subito
  store.ricorda({
    enunciato: 'Non fa sconti sotto i mille euro', ambito: 'persona',
    genere: 'esplicita', fiducia: 1, origine: 'mano'
  })
  assert.match(memoria.carta(), /sconti sotto i mille/)
})

test('quante ne aspettano una risposta', () => {
  // due delle tre indotte scritte qui sopra sono ancora da guardare
  assert.equal(memoria.inAttesa(), 2)
})
