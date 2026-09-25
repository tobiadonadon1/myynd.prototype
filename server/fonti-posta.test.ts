// Una lista sola delle fonti di posta (P4): `FONTI_POSTA` in `registro.ts`.
//
// Erano sette liste scritte a mano, e una fonte di posta nuova ne mancava
// sempre qualcuna: la posta che il punto non vede, che le iniziative non
// guardano. Qui si legge il sorgente: un elenco che mette insieme «posta» e
// un'altra casella a mano fa fallire la prova, salvo dove serve davvero.
//
//   node --test server/fonti-posta.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SERVER = new URL('.', import.meta.url).pathname
/** Dove una lista a mano è giusta: il registro stesso, l'ordine della prima lettura, le chiavi della configurazione, e chi agisce solo su IMAP e Gmail. */
const AMMESSI = new Set(['connettori/registro.ts', 'prima-lettura.ts', 'fonti-in-chat.ts', 'config.ts', 'sender-rules.ts'])
const ALTRE = /'(google|gmail|microsoft|outlook)'/

function sorgenti(): string[] {
  const qui = readdirSync(SERVER).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  const connettori = readdirSync(join(SERVER, 'connettori')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).map(f => `connettori/${f}`)
  return [...qui, ...connettori]
}

/** Le liste letterali (fra parentesi quadre) di un sorgente. */
function liste(testo: string): string[] {
  return testo.match(/\[[^[\]]*\]/g) ?? []
}

test('nessuna lista a mano di caselle di posta fuori dai posti ammessi', () => {
  const fuori: string[] = []
  for (const f of sorgenti()) {
    if (AMMESSI.has(f)) continue
    for (const l of liste(readFileSync(join(SERVER, f), 'utf8'))) {
      if (l.includes("'posta'") && ALTRE.test(l)) fuori.push(`${f}: ${l.slice(0, 120)}`)
    }
  }
  assert.deepEqual(fuori, [])
})

test('la prova se ne accorgerebbe: una lista così nel sorgente fallisce (counter-case)', () => {
  const finto = "const POSTA = new Set(['posta', 'google', 'microsoft'])"
  assert.ok(liste(finto).some(l => l.includes("'posta'") && ALTRE.test(l)))
  // e una lista che nomina la posta da sola, o Gmail da solo, passa
  assert.ok(!liste("x.includes(['posta'])").some(l => l.includes("'posta'") && ALTRE.test(l)))
})

test('FONTI_POSTA ha anche Mail del Mac', async () => {
  const { FONTI_POSTA, CATALOGO } = await import('./connettori/registro.ts')
  assert.deepEqual([...FONTI_POSTA], ['posta', 'google', 'microsoft', 'postamac'])
  for (const f of FONTI_POSTA) assert.ok(CATALOGO.some(c => c.id === f && c.legge), f)
})
