// La coerenza dell'interfaccia, tenuta ferma (P5). Un cricchetto: i numeri
// scritti qui sono quelli raggiunti il 25 settembre 2026 dopo P5, e possono
// solo scendere. Chi aggiunge un campo grezzo, un raggio fuori scala o un
// gradiente scritto a mano fa diventare rosso il test, e sa dove guardare.
//
//   node --test src/coerenza.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('.', import.meta.url).pathname

function file(d: string, est: RegExp, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) file(p, est, out)
    else if (est.test(n) && !n.endsWith('.test.ts')) out.push(p)
  }
  return out
}
const rel = (p: string) => p.slice(SRC.length)
const leggi = (p: string) => readFileSync(p, 'utf8')
/** Il codice senza i commenti: un commento che nomina `<input` non è un campo. */
const senzaCommenti = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/**
 * Dove un campo grezzo ha una ragione: il palco (accesso e primo avvio, col
 * suo disegno scuro), le barre che scrivono (la chat, la lista, la barra
 * rapida), le date e le ore, le ricerche, gli editor delle automazioni, e la
 * correzione sul posto di una riga (P1B e la convinzione che la imita).
 */
const CAMPI_CONSENTITI = new Set([
  'components/forme.tsx',
  'components/forms.tsx', 'onboarding/Onboarding.tsx', 'Accesso.tsx',
  'screens/Chat.tsx', 'oggi/Barra.tsx', 'screens/Myynd.tsx', 'oggi/Oggi.tsx',
  'screens/Agenda.tsx', 'oggi/Dettaglio.tsx', 'modals.tsx',
  'automazioni/Costruttore.tsx', 'automazioni/Editor.tsx', 'automazioni/Chiocciola.tsx', 'screens/Automazioni.tsx',
  'screens/ComeLavori.tsx', 'screens/RigaConvinzione.tsx', 'screens/ProgettoEditor.tsx', 'screens/Mappa.tsx',
  'components/SenderRules.tsx', 'oggi/Calendario.tsx', 'oggi/Giro.tsx', 'richiamo/Richiamo.tsx'
])

function campiGrezzi(): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of file(SRC, /\.tsx$/)) {
    const n = (senzaCommenti(leggi(p)).match(/<(input|textarea)\b/g) ?? []).length
    if (n) m.set(rel(p), n)
  }
  return m
}

/** Un raggio è in scala se è 10, 14, 20, 99 (o più: una pastiglia), 50% o 0. */
const inScala = (v: string) => v.trim().split(/\s+/).every(x => /^(0|10px|14px|20px|99px|999px|50%|inherit)$/.test(x) || /^\d{3,}px$/.test(x))

function raggiCss(): string[] {
  const fuori: string[] = []
  for (const p of file(SRC, /\.css$/)) {
    const s = senzaCommenti(leggi(p))
    for (const m of s.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const regola = m[2]!
      const r = regola.match(/border-radius\s*:\s*([^;}]+)/)
      if (!r || inScala(r[1]!)) continue
      // un elemento di dodici pixel o meno (un pallino, una tacca) non conta
      const lato = Math.max(...[...regola.matchAll(/(?:^|;|\s)(?:width|height)\s*:\s*(\d+(?:\.\d+)?)px/g)].map(x => Number(x[1])), 0)
      if (lato && lato <= 12) continue
      fuori.push(`${rel(p)} · ${m[1]!.trim().slice(-50)} · ${r[1]!.trim()}`)
    }
  }
  return fuori
}

function raggiInLinea(): string[] {
  const fuori: string[] = []
  for (const p of file(SRC, /\.tsx$/)) {
    const s = senzaCommenti(leggi(p))
    for (const m of s.matchAll(/borderRadius:\s*('([^']*)'|\d+(?:\.\d+)?)/g)) {
      const v = m[2] !== undefined ? m[2] : `${m[1]}px`
      if (inScala(v) || v === '50%') continue
      const intorno = s.slice(Math.max(0, m.index! - 160), m.index! + 160)
      const lato = Math.max(...[...intorno.matchAll(/(?:width|height):\s*(\d+)/g)].map(x => Number(x[1])), 0)
      if (lato && lato <= 12) continue
      fuori.push(`${rel(p)} · ${v}`)
    }
  }
  return fuori
}

const GRADIENTE = 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))'

test('i campi di testo grezzi stanno solo dove hanno una ragione', () => {
  const m = campiGrezzi()
  const fuori = [...m.keys()].filter(f => !CAMPI_CONSENTITI.has(f))
  assert.deepEqual(fuori, [], 'un campo nuovo passa da Campo o Casella in components/forme.tsx')
  const totale = [...m.values()].reduce((a, b) => a + b, 0)
  console.log(`coerenza · campi grezzi: ${totale}`)
  // 25 set 2026: 111 sul main prima di P5, 100 dopo (Preferenze e Memoria a zero; forme.tsx ne ha 3)
  assert.ok(totale <= 100, `campi grezzi: ${totale}, il cricchetto è a 100`)
})

test('Preferenze e Memoria non hanno campi grezzi né le schede di prima', () => {
  for (const f of ['screens/Preferenze.tsx', 'screens/Memoria.tsx']) {
    const s = senzaCommenti(leggi(join(SRC, f)))
    assert.doesNotMatch(s, /<(input|textarea)\b/, f)
    assert.doesNotMatch(s, /prefs-card|mem-card\b/, f)
  }
})

test('i raggi fuori scala non crescono', () => {
  const css = raggiCss()
  const tsx = raggiInLinea()
  console.log(`coerenza · raggi fuori scala: ${css.length} nei fogli, ${tsx.length} in linea`)
  // 25 set 2026: 100 nei fogli e 58 in linea sul main prima di P5; 91 e 57 dopo
  assert.ok(css.length <= 91, `raggi nei fogli: ${css.length}\n${css.join('\n')}`)
  assert.ok(tsx.length <= 57, `raggi in linea: ${tsx.length}\n${tsx.join('\n')}`)
})

test('il gradiente di rame si scrive col gettone', () => {
  const colpevoli = file(SRC, /\.(tsx?|css)$/).filter(p => !p.endsWith('index.css') && leggi(p).replace(/\s/g, '').includes(GRADIENTE))
  console.log(`coerenza · gradienti scritti a mano: ${colpevoli.length}`)
  // 9 file sul main prima di P5; resta Myynd.tsx, che P5 non tocca
  assert.ok(colpevoli.length <= 1, colpevoli.map(rel).join('\n'))
})

test('il verde decorativo del vecchio avatar non torna', () => {
  const colpevoli = file(SRC, /\.(tsx?|css)$/).filter(p => /#8FA593/i.test(leggi(p)))
  assert.deepEqual(colpevoli.map(rel), [])
})

test('controcaso: il conto dei raggi vede un raggio fuori scala e lascia stare un pallino', () => {
  assert.equal(inScala('14px'), true)
  assert.equal(inScala('13px'), false)
  assert.equal(inScala('0 14px 14px 0'), true)
})
