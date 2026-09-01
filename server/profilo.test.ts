// Che le preferenze arrivino davvero al ragionamento.
//
// Il guasto che questi test tengono chiuso non dava nessun errore. L'interfaccia
// scriveva tono 'cordiale' e autonomia 'osservare'; `claude.ts` cercava 'caldo'
// e 'chiedere'; la ricerca tornava `undefined` e `sistema()` saltava la riga.
// Due preferenze su tre non facevano niente, il file di configurazione era
// scritto correttamente, i tipi passavano, i test passavano, e l'unico modo di
// accorgersene era leggere il prompt che usciva.
//
// Perciò qui ci sono due reti, e servono tutte e due:
//
//   · una STRUTTURALE, che legge i due file come testo e pretende che gli
//     elenchi combacino. Se un giorno qualcuno rinomina un tono in un posto
//     solo, questa cade prima ancora che l'app parta.
//   · una DI COMPORTAMENTO, che costruisce il prompt vero per ogni scelta
//     possibile e pretende di trovarci dentro tutte e due le righe. È l'unica
//     che dimostra la cosa che interessa davvero.
//
//   node --test server/*.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RADICE = join(import.meta.dirname, '..')

// Come in store.test.ts: la casa finta deve esistere prima che config.ts la
// legga, e config.ts la legge al caricamento del modulo.
const CASA = mkdtempSync(join(tmpdir(), 'myynd-profilo-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const cfg = await import('./config.ts')
const { sistema } = await import('./claude.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

// — lettura dei due elenchi come testo —
//
// Si legge il sorgente invece di importarlo perché `src/data.ts` importa
// `./lingua` senza estensione: va bene per Vite, non per Node. Ed è anche il
// motivo per cui vale la pena: il test guarda quello che c'è *scritto*, che è
// esattamente ciò che diverge.

function idsDi(file: string, nome: string): string[] {
  const s = readFileSync(file, 'utf8')
  const i = s.indexOf(`export const ${nome} = [`)
  assert.notEqual(i, -1, `${nome} non si trova in ${file}`)
  const j = s.indexOf('\n]', i)
  return [...s.slice(i, j).matchAll(/\bid:\s*'([^']+)'/g)].map(m => m[1])
}

function chiaviDi(file: string, nome: string): string[] {
  const s = readFileSync(file, 'utf8')
  const i = s.indexOf(`const ${nome}: Record<string, string> = {`)
  assert.notEqual(i, -1, `${nome} non si trova in ${file}`)
  const j = s.indexOf('\n}', i)
  return [...s.slice(i, j).matchAll(/^\s{2}([a-z_]+):/gm)].map(m => m[1])
}

const DATI = join(RADICE, 'src', 'data.ts')
const RAGIONAMENTO = join(RADICE, 'server', 'claude.ts')

test('ogni tono offerto dall\'interfaccia è un tono che il server conosce', () => {
  const offerti = idsDi(DATI, 'TONI')
  const capiti = chiaviDi(RAGIONAMENTO, 'TONI')
  assert.ok(offerti.length >= 3, 'l\'elenco dei toni si è svuotato')
  const orfani = offerti.filter(t => !capiti.includes(t))
  assert.deepEqual(orfani, [],
    `l'interfaccia offre toni che il ragionamento non sa interpretare: ${orfani.join(', ')}.\n` +
    `      server/claude.ts ne conosce: ${capiti.join(', ')}`)
})

test('ogni autonomia offerta dall\'interfaccia è un\'autonomia che il server conosce', () => {
  const offerte = idsDi(DATI, 'AUTONOMIE')
  const capite = chiaviDi(RAGIONAMENTO, 'AUTONOMIE')
  assert.ok(offerte.length >= 3, 'l\'elenco delle autonomie si è svuotato')
  const orfane = offerte.filter(a => !capite.includes(a))
  assert.deepEqual(orfane, [],
    `l'interfaccia offre autonomie che il ragionamento non sa interpretare: ${orfane.join(', ')}.\n` +
    `      server/claude.ts ne conosce: ${capite.join(', ')}`)
})

test('config.ts e claude.ts sono d\'accordo su cosa esiste', () => {
  // Se questi due divergono, la validazione della rotta accetta un valore che
  // poi il prompt scarta: si torna esattamente al guasto di prima, con in più
  // l'illusione di un controllo.
  assert.deepEqual([...cfg.TONI_VALIDI].sort(), chiaviDi(RAGIONAMENTO, 'TONI').sort())
  assert.deepEqual([...cfg.AUTONOMIE_VALIDE].sort(), chiaviDi(RAGIONAMENTO, 'AUTONOMIE').sort())
})

test('ogni tono ha la sua frase d\'esempio, altrimenti la casella mostra il vuoto', () => {
  const s = readFileSync(DATI, 'utf8')
  const i = s.indexOf('export const ESEMPIO_TONO')
  const j = s.indexOf('\n}', i)
  const esempi = [...s.slice(i, j).matchAll(/^\s{2}([a-z_]+):/gm)].map(m => m[1])
  const senza = idsDi(DATI, 'TONI').filter(t => !esempi.includes(t))
  assert.deepEqual(senza, [], `toni senza esempio: ${senza.join(', ')}`)
})

// — la rete che conta: il prompt vero —

/** Le frasi che ogni tono e ogni autonomia mettono nel prompt, una per chiave. */
const FRASE_TONO = /Vai al punto|Tono cordiale|Registro formale/
const FRASE_AUTONOMIA = /Prima di proporre|Prepara il lavoro|Prepara tutto fino/

function promptCon(tono: string, autonomia: string): string {
  cfg.scrivi({ nome: 'Tobia', tono, autonomia })
  return sistema()
}

test('ogni scelta possibile arriva davvero dentro il prompt di sistema', () => {
  for (const tono of idsDi(DATI, 'TONI')) {
    for (const autonomia of idsDi(DATI, 'AUTONOMIE')) {
      const p = promptCon(tono, autonomia)
      assert.match(p, FRASE_TONO, `tono «${tono}» non produce nessuna riga nel prompt`)
      assert.match(p, FRASE_AUTONOMIA, `autonomia «${autonomia}» non produce nessuna riga nel prompt`)
    }
  }
})

test('i nomi vecchi già scritti su disco continuano a funzionare', () => {
  // Chi ha usato Myynd prima di oggi ha uno di questi nel suo config.json, e
  // non deve accorgersi di niente: né di un errore, né di una riga che sparisce.
  for (const [tono, autonomia] of [['cordiale', 'osservare'], ['diretto', 'agire'], ['cordiale', 'agire']]) {
    const p = promptCon(tono, autonomia)
    assert.match(p, FRASE_TONO, `il vecchio tono «${tono}» si è perso`)
    assert.match(p, FRASE_AUTONOMIA, `la vecchia autonomia «${autonomia}» si è persa`)
  }
})

test('un valore che non esiste cade sul predefinito, mai sul vuoto', () => {
  // Un file scritto a mano, o un client di una versione futura: qualunque cosa
  // arrivi, il prompt esce completo. Un prompt mutilato è peggio di uno sbagliato,
  // perché non si vede.
  const p = promptCon('astronave', 'pizza')
  assert.match(p, FRASE_TONO)
  assert.match(p, FRASE_AUTONOMIA)
})

test('senza nessuna preferenza scritta il prompt è comunque completo', () => {
  cfg.scrivi({ nome: 'Tobia' })
  const p = sistema()
  assert.match(p, FRASE_TONO)
  assert.match(p, FRASE_AUTONOMIA)
})
