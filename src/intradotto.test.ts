// L'italiano che non passa da `t()`.
//
// `lingua.test.ts` controlla il verso facile: ogni chiave che qualcuno usa
// esiste nel dizionario. Ma il modo in cui questa app torna a essere metà in
// italiano non è quello — è l'altro, e nessuno lo guardava: una frase scritta
// dritta dentro il JSX, che `t()` non tocca mai. Il codice sembra giusto, i
// tipi passano, il test delle chiavi passa, e con l'interfaccia in inglese
// spuntano frasi italiane in mezzo alla pagina.
//
// Questo test guarda quel verso. È per forza euristico — non si può decidere
// con certezza se una stringa sia testo da leggere o un valore tecnico — perciò
// è tarato per essere severo su quello che sembra una frase e muto su tutto il
// resto, e ha una lista di eccezioni per i casi che sono davvero a posto.
//
// Se aggiungendo una schermata questo test si lamenta, quasi sempre ha ragione.
// Se ha torto, la frase va nell'elenco qui sotto con una riga che dice perché.
//
//   node --test src/*.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = new URL('.', import.meta.url).pathname

/**
 * Quello che è italiano ma non è testo da leggere.
 *
 * Ogni voce ha diritto a una ragione. Senza la ragione questo elenco diventa il
 * posto dove si nasconde quello che non si ha voglia di sistemare.
 */
const AMMESSE = new Set([
  // sono esempi dentro un segnaposto, e restano in italiano di proposito:
  // mostrano *come* si scrive una riga, non parlano all'utente
  'mandare il preventivo a Rossi',
  'mandare una mail a mio padre',
  'richiamare lo studio'
])

/**
 * Le chiavi che il dizionario conosce già.
 *
 * Una frase può stare scritta in italiano dentro un elenco — i nomi dei tre
 * scaffali, i passi del giro, i comandi della barra — e venire tradotta dove si
 * disegna, con `t(NOME[dove])`. Quelle non sono un difetto: sono chiavi. E il
 * modo giusto di riconoscerle non è elencarle a mano, è chiedere al dizionario
 * se le conosce. Così quando qualcuno ne aggiunge una, o è nel dizionario e va
 * bene, o non c'è e questo test se ne accorge — che è esattamente il servizio
 * che deve rendere.
 */
function chiaviDelDizionario(): Set<string> {
  const s = readFileSync(join(RADICE, 'lingua.ts'), 'utf8')
  const i = s.indexOf('const EN: Record<string, string> = {')
  const j = s.indexOf('\n}', i)
  const vero = (x: string) => x
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1')
  const fuori = new Set<string>()
  for (const m of s.slice(i, j).matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm)) {
    fuori.add(vero(m[1] ?? m[2] ?? ''))
  }
  return fuori
}

function tuttiIFile(dove: string, out: string[] = []): string[] {
  for (const n of readdirSync(dove)) {
    const p = join(dove, n)
    if (statSync(p).isDirectory()) tuttiIFile(p, out)
    else if (/\.tsx?$/.test(n) && !n.endsWith('.test.ts')) out.push(p)
  }
  return out
}

/** Parole che in inglese non esistono: se ce n'è una, la frase è italiana. */
const SPIA = /\b(che|non|una|uno|della|nella|dello|quello|quella|questo|questa|adesso|ancora|niente|sono|serve|servono|hai|gli|dei|delle|col|sul|già|però|perché|quando|dove|come mai|invece|oppure|senza|dentro|fuori|sopra|sotto|prima|dopo|tuo|tua|suo|sua|mio|mia)\b/i

/** Una frase da leggere: comincia per lettera, ha spazi, non è un percorso o un valore CSS. */
function sembraUnaFrase(s: string): boolean {
  if (s.length < 12 || !s.includes(' ')) return false
  if (!/^[A-Za-zÀ-ù«]/.test(s)) return false
  if (/^[a-z-]+:\s/.test(s)) return false                 // 'display: flex'
  if (/\d+px|rgba?\(|linear-gradient|blur\(/.test(s)) return false
  if (/^https?:\/\//.test(s)) return false
  return SPIA.test(s)
}

type Trovata = { file: string; riga: number; testo: string }

function intradotte(): Trovata[] {
  const fuori: Trovata[] = []
  const tradotte = chiaviDelDizionario()
  for (const f of tuttiIFile(RADICE)) {
    // il dizionario è fatto di frasi italiane per definizione, e data.ts
    // contiene le etichette che *diventano* chiavi: le une e le altre passano
    // comunque da `t()` altrove
    if (f.endsWith('lingua.ts') || f.endsWith('data.ts')) continue
    const righe = readFileSync(f, 'utf8').split('\n')
    let inCommento = false

    righe.forEach((r, i) => {
      // i commenti di blocco: qui dentro l'italiano è la lingua di casa
      const tagliato = r.trim()
      if (inCommento) { if (tagliato.includes('*/')) inCommento = false; return }
      if (tagliato.startsWith('/*') || tagliato.startsWith('{/*')) {
        if (!tagliato.includes('*/')) inCommento = true
        return
      }
      if (tagliato.startsWith('//') || tagliato.startsWith('*')) return

      // via quello che sta dopo un `//` a fine riga, e quello che è già in t()
      const senzaCoda = r.replace(/\/\/.*$/, '')
      const senzaT = senzaCoda.replace(/\bt\(\s*(['"`])(?:[^\\]|\\.)*?\1\s*\)/g, 't(_)')

      const candidate: string[] = []
      for (const m of senzaT.matchAll(/(['"`])((?:[^\\\n]|\\.)*?)\1/g)) candidate.push(m[2])
      // il testo scritto fra due tag: >Ciao come stai<
      for (const m of senzaT.matchAll(/>([^<>{}\n]{12,})</g)) candidate.push(m[1].trim())

      for (const grezza of candidate) {
        const s = grezza.replace(/\\(['"`\\])/g, '$1').trim()
        if (!sembraUnaFrase(s) || AMMESSE.has(s) || tradotte.has(s)) continue
        fuori.push({ file: f.replace(RADICE, 'src/'), riga: i + 1, testo: s })
      }
    })
  }
  return fuori
}

test('nessuna frase da leggere resta fuori da t()', () => {
  const trovate = intradotte()
  const elenco = trovate.map(x => `${x.file}:${x.riga}\n      «${x.testo}»`).join('\n    ')
  assert.deepEqual(trovate, [],
    `queste frasi restano in italiano quando l'interfaccia è in inglese.\n` +
    `    Passale da t() e aggiungi la chiave al dizionario, oppure — se davvero\n` +
    `    non sono testo da leggere — mettile in AMMESSE con la ragione.\n\n    ${elenco}\n`)
})
