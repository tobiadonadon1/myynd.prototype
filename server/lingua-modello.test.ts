// Ogni istruzione che parte da qui dice in che lingua rispondere.
//
// È il difetto che è tornato più volte, e ogni volta nello stesso modo: non una
// traduzione sbagliata, ma testo *nato* nella lingua sbagliata — una domanda
// italiana in mezzo a una lista inglese, che nessun dizionario del client può
// recuperare perché non è una chiave, è una frase scritta ieri notte.
//
// La causa era sempre la stessa: la lingua stava scritta a mano dentro i
// prompt, uno per uno, e in tre non c'era. Adesso la mette `chiedi()`, che è
// l'unica porta verso qualsiasi modello; chi bussa altrove — le chiamate dirette
// all'SDK, che servono per lo streaming — deve avvolgere il suo `system` in
// `conLaLingua()`.
//
// Questo test guarda che non ci siano terze strade. Se ne aggiungi una, si
// lamenta qui invece che in faccia a chi usa l'app.
//
//   node --test server/lingua-modello.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const QUI = join(new URL('.', import.meta.url).pathname)

function fileDelServer(): string[] {
  return readdirSync(QUI)
    .filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts') && n !== 'modello.ts')
    .map(n => join(QUI, n))
}

test('ogni prompt passa dalla porta che ci mette la lingua', () => {
  const fuori: string[] = []
  for (const f of fileDelServer()) {
    const righe = readFileSync(f, 'utf8').split('\n')
    righe.forEach((riga, i) => {
      if (!/^\s*system:/.test(riga)) return
      /**
       * Una dichiarazione di tipo non è un prompt.
       *
       * `system: string` dentro la firma di una funzione descrive un campo, non
       * ne scrive uno: la frase vera l'ha già avvolta chi chiama. Senza questa
       * riga, qualunque modulo che accetti un `system` come parametro risulta
       * colpevole di una cosa che non ha fatto — e un test che accusa gli
       * innocenti è un test che si impara a ignorare.
       */
      if (/^\s*system\??:\s*(string|Anthropic\.|[A-Z])[\w.<>[\]|\s]*$/.test(riga)) return
      // o è avvolto qui,
      if (riga.includes('conLaLingua(')) return
      // o sta dentro una chiamata a chiedi/chiediJSON, che lo avvolge da sé:
      // `lavoro:` è il campo che solo quelle hanno
      const prima = righe.slice(Math.max(0, i - 10), i).join('\n')
      if (/\blavoro:\s*'/.test(prima)) return
      fuori.push(`${f.split('/').pop()}:${i + 1}`)
    })
  }
  assert.deepEqual(fuori, [],
    'questi prompt possono uscire nella lingua sbagliata:\n  ' + fuori.join('\n  '))
})

test('nessuno parla con l’SDK senza passare di lì', () => {
  // una chiamata diretta è legittima — lo streaming non passa da `chiedi()` —
  // ma il suo system dev'essere avvolto: qui si controlla che ce ne sia uno
  const fuori: string[] = []
  for (const f of fileDelServer()) {
    const testo = readFileSync(f, 'utf8')
    for (const m of testo.matchAll(/messages\.(create|stream)\(/g)) {
      const finestra = testo.slice(m.index, m.index + 1200)
      if (!/^\s*system:/m.test(finestra)) continue      // una chiamata senza istruzioni
      if (finestra.includes('conLaLingua(')) continue
      fuori.push(`${f.split('/').pop()} · ${testo.slice(0, m.index).split('\n').length}`)
    }
  }
  assert.deepEqual(fuori, [], 'chiamate dirette al modello senza la regola della lingua:\n  ' + fuori.join('\n  '))
})

test('la regola si attacca una volta sola', async () => {
  const { conLaLingua } = await import('./modello.ts')
  const una = conLaLingua('Fai una cosa.')
  assert.ok(una.length > 'Fai una cosa.'.length, 'non ha attaccato niente')
  assert.equal(conLaLingua(una), una, 'applicata due volte, la raddoppia')
})
