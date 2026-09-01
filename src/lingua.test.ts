// Le chiavi che mancano al dizionario.
//
// È il modo in cui questa app torna a essere metà in italiano senza che
// nessuno se ne accorga: `t()` su una chiave che non c'è non è un errore, è
// una frase italiana in mezzo a un'interfaccia inglese. Il codice sembra
// giusto. Questo test guarda tutte le chiavi usate davvero e tutte quelle
// definite, e dice quali non si incontrano.
//
//   node --test src/lingua.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = new URL('.', import.meta.url).pathname

function tuttiIFile(dove: string, out: string[] = []): string[] {
  for (const n of readdirSync(dove)) {
    const p = join(dove, n)
    if (statSync(p).isDirectory()) tuttiIFile(p, out)
    else if (/\.tsx?$/.test(n) && !n.endsWith('.test.ts')) out.push(p)
  }
  return out
}

/**
 * Il testo com'è, non com'è scritto nel sorgente.
 *
 * `JSON.parse` qui non va: `\'` è una fuga valida in JavaScript e non in JSON,
 * e proprio le frasi con l'apostrofo — che in italiano sono metà — la facevano
 * esplodere. Si sfugge a mano, che sono quattro casi.
 */
function vero(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\(['"\\])/g, '$1')
}

/** Le chiavi scritte a mano: `t('...')`. Quelle dinamiche non si vedono da qui. */
function chiaviUsate(): Set<string> {
  const usate = new Set<string>()
  for (const f of tuttiIFile(RADICE)) {
    // il dizionario non è un consumatore: nel suo commento c'è un `t()` di
    // esempio che mostra proprio come NON si fa
    if (f.endsWith('lingua.ts')) continue
    const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g)) usate.add(vero(m[1]))
    for (const m of s.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) usate.add(vero(m[1]))
  }
  return usate
}

function chiaviDefinite(): Set<string> {
  const s = readFileSync(join(RADICE, 'lingua.ts'), 'utf8')
  const i = s.indexOf('const EN: Record<string, string> = {')
  const j = s.indexOf('\n}', i)
  const dentro = s.slice(i, j)
  const chiavi = new Set<string>()
  for (const m of dentro.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm)) {
    chiavi.add(vero(m[1] ?? m[2] ?? ''))
  }
  return chiavi
}

test('ogni chiave usata sta nel dizionario inglese', () => {
  const usate = chiaviUsate()
  const definite = chiaviDefinite()
  const manca = [...usate].filter(k => !definite.has(k)).sort()
  assert.deepEqual(manca, [],
    `queste frasi restano in italiano con l'interfaccia in inglese:\n  ${manca.join('\n  ')}`)
})

test('nessuna chiave è definita due volte', () => {
  const s = readFileSync(join(RADICE, 'lingua.ts'), 'utf8')
  const i = s.indexOf('const EN: Record<string, string> = {')
  const j = s.indexOf('\n}', i)
  const viste = new Set<string>()
  const doppie: string[] = []
  for (const m of s.slice(i, j).matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm)) {
    const k = m[1] ?? m[2] ?? ''
    if (viste.has(k)) doppie.push(k)
    viste.add(k)
  }
  // la seconda vince in silenzio: due traduzioni per la stessa frase vuol dire
  // che una delle due non si vedrà mai e nessuno saprà quale
  assert.deepEqual(doppie, [], `chiavi ripetute: ${doppie.join(', ')}`)
})

test('quello che arriva dal server ha una traduzione', () => {
  const definite = chiaviDefinite()
  const catalogo = readFileSync(join(RADICE, '..', 'server', 'connettori', 'registro.ts'), 'utf8')
  const manca: string[] = []
  // i nomi propri (Notion, Slack…) degradano bene a sé stessi; le note no
  for (const m of catalogo.matchAll(/nota: '((?:[^'\\]|\\.)*)'/g)) {
    const k = vero(m[1])
    if (!definite.has(k)) manca.push(k)
  }
  // il vocabolario chiuso delle voci del feed
  for (const k of ['Da decidere', 'Da leggere', 'Scadenza', 'Già gestito']) {
    if (!definite.has(k)) manca.push(k)
  }
  /*
   * Le cinque domande del ritratto.
   *
   * Arrivano dal server dentro `descrizione` e la schermata le disegna con
   * `t(b.descrizione)` — una chiave *calcolata*, che la prova sulle chiavi
   * scritte a mano non può vedere. Sono le cinque righe più visibili della
   * schermata «Come lavori»: se una manca, resta italiana sotto a un'interfaccia
   * inglese e nessuna prova se ne accorge.
   */
  const memoria = readFileSync(join(RADICE, '..', 'server', 'memoria.ts'), 'utf8')
  for (const m of memoria.matchAll(/descrizione: '((?:[^'\\]|\\.)*)'/g)) {
    const k = vero(m[1])
    if (!definite.has(k)) manca.push(k)
  }
  assert.deepEqual(manca, [], `senza traduzione:\n  ${manca.join('\n  ')}`)
})

/**
 * Gli errori del server hanno una traduzione.
 *
 * È il buco da cui l'italiano è rientrato più volte, e sempre allo stesso modo:
 * un messaggio d'errore nasce dentro il server — dove si scrive in italiano,
 * giustamente, perché è la lingua di questo codice — viene mandato al client
 * dentro `errore`, e il client lo mostra passandolo da `t()`. Se la frase non
 * sta nel dizionario, `t()` la restituisce com'è: una riga italiana sotto un
 * compito inglese, in un'app che aveva promesso di essere tutta in una lingua.
 *
 * Non lo prendeva nessun test. `intradotto.test.ts` guarda solo `src/`, e le
 * altre due prove sul dizionario guardavano il catalogo dei connettori e quattro
 * etichette del feed. Ventotto frasi erano rimaste fuori — accumulate una alla
 * volta, ognuna invisibile a chi la scriveva.
 *
 *   node --test src/lingua.test.ts
 */

/** Quello che non arriva mai sotto gli occhi di nessuno, e perché. */
const INTERNI = new Set([
  // tornano al modello dentro il giro degli strumenti, non a una persona
  'manca la query',
  'manca il testo',
  'non posso mettere niente in lista da qui',
  // un'etichetta per una corsa persa contro il cronometro, presa lì accanto
  'troppo lento',
  // parla a chi impacchetta l'app, e succede prima che esista una finestra
  'MYYND_DEV acceso in un build di produzione',
  // la risposta a una richiesta che non viene dall'app: non la disegna nessuno
  'Origine non consentita.',
  // una guardia interna: se scatta è un difetto di programmazione — un giro di
  // sfondo che gira fuori dal contesto di una persona — non una cosa che
  // qualcuno possa leggere e correggere
  'Non so di chi sia questa richiesta.',
  // lo può vedere solo chi cambia una password da riga di comando, su questa
  // macchina, passando un id che non esiste: non è una schermata
  'Questo conto non esiste.'
])

/** Una frase da leggere, non un'etichetta tecnica. */
function daLeggere(s: string): boolean {
  if (s.length < 11 || !s.includes(' ')) return false
  return /\b(che|non|una|uno|della|nella|dello|quella|questo|questa|adesso|niente|sono|serve|hai|gli|dei|delle|già|perché|quando|dove|senza|troppo|riprova|manca|apri|collega|scrivi|dimmi|chiave|credito|trovo|riuscito|ancora|nessun|nessuna|più|il|la|le|lo|di|da|per|su|è)\b/i.test(s)
}

function fileDelServer(dove: string, out: string[] = []): string[] {
  for (const n of readdirSync(dove)) {
    const p = join(dove, n)
    if (statSync(p).isDirectory()) fileDelServer(p, out)
    else if (n.endsWith('.ts') && !n.endsWith('.test.ts')) out.push(p)
  }
  return out
}

test('ogni errore che il server può mostrare ha una traduzione', () => {
  const definite = chiaviDefinite()
  const manca = new Map<string, string>()

  for (const f of fileDelServer(join(RADICE, '..', 'server'))) {
    const testo = readFileSync(f, 'utf8')
    const trovate = [
      ...testo.matchAll(/new Error\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g),
      ...testo.matchAll(/errore:\s*'((?:[^'\\]|\\.)*)'/g)
    ]
    for (const m of trovate) {
      const k = vero(m[1])
      if (!daLeggere(k) || INTERNI.has(k) || definite.has(k) || manca.has(k)) continue
      manca.set(k, f.split('/').slice(-2).join('/'))
    }
  }

  const elenco = [...manca].map(([k, f]) => `${f}\n      «${k}»`).join('\n    ')
  assert.deepEqual([...manca.keys()], [],
    'questi errori arrivano in italiano con l’app in inglese.\n' +
    '    Aggiungili al dizionario in lingua.ts, oppure — se davvero non li vede\n' +
    `    mai nessuno — mettili in INTERNI con la ragione.\n\n    ${elenco}\n`)
})
