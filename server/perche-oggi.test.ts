// Il «perché oggi», controllato dove nasce: passa se dice chi aspetta con un
// giorno o una data che la fonte regge; cade se parla del progetto, se dice
// «domani», se inventa un numero o un giorno.
//
//   node --test server/perche-oggi.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-perche-'))
process.env.MYYND_DATI = CASA
writeFileSync(join(CASA, 'config.json'), JSON.stringify({ lingua: 'it' }))
const { percheFondato, PERCHE_PAROLE, PERCHE_PAROLE_MAX } = await import('./perche-oggi.ts')
const { giornoFondato } = await import('./rilevanza.ts')
const store = await import('./store.ts')
after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(CASA, { recursive: true, force: true }) })

/** Una mail di lunedì 21 settembre 2026. */
const LUNEDI = new Date(2026, 8, 21, 10).toISOString()
const FONTE = {
  titolo: 'Preventivo H-Farm',
  testo: 'Ciao, da lunedì aspetto il tuo sì per chiudere il preventivo. Puoi confermare entro domani? La fattura 2231 scade il 26.',
  autore: 'Sara Conti <sara@esempio.it>',
  quando: LUNEDI
}
const PROGETTI = [{ nome: 'H-Farm', obiettivo: 'Chiudere il pilota con H-Farm entro ottobre' }, { nome: 'Sito', obiettivo: 'Mettere online le tre offerte del sito' }]

test('passa: chi aspetta e da quando, con un giorno che la fonte nomina', () => {
  assert.equal(percheFondato('Sara aspetta il sì da lunedì per chiudere il preventivo.', FONTE, PROGETTI), null)
  assert.equal(percheFondato('La fattura 2231 scade il 26.', FONTE, PROGETTI), null)
})

test('cade «giorno»: un giorno che la fonte non nomina, senza una parola relativa che lo spieghi', () => {
  assert.equal(percheFondato('Sara aspetta il sì da giovedì per chiudere il preventivo.', FONTE), 'giorno')
  // e una fonte senza data non regge nessun giorno che non nomini
  assert.equal(percheFondato('Sara aspetta il sì da martedì.', { ...FONTE, quando: null }), 'giorno')
})

test('passa: il giorno che «domani» voleva dire nella fonte, letto dalla data della mail', () => {
  // la mail dice «entro domani» ed è di lunedì: martedì è fondato
  assert.equal(percheFondato('Sara aspetta la conferma entro martedì.', FONTE), null)
  assert.equal(percheFondato('Sara aspetta la conferma entro mercoledì.', FONTE), 'giorno', 'mercoledì non è «domani» per una mail di lunedì')
  assert.equal(giornoFondato('Confirm by Tuesday', { titolo: 'x', corpo: 'Can you confirm by tomorrow?', autore: null, quando: LUNEDI }), true)
  assert.equal(giornoFondato('Confirm by Wednesday', { titolo: 'x', corpo: 'Can you confirm by tomorrow?', autore: null, quando: LUNEDI }), false)
  assert.equal(giornoFondato('Confirm by Tuesday', { titolo: 'x', corpo: 'Can you confirm by Tuesday?', autore: null, quando: null }), true, 'come tempoFondato')
  assert.equal(giornoFondato('Confirm tomorrow', { titolo: 'x', corpo: 'Can you confirm by Tuesday?', autore: null, quando: LUNEDI }), false, '«domani» nella carta vuole «domani» nella fonte')
})

test('cade «obiettivo»: «Conta per il progetto H-Farm.» e «Fa avanzare il sito.»', () => {
  assert.equal(percheFondato('Conta per il progetto H-Farm.', FONTE, PROGETTI), 'obiettivo')
  assert.equal(percheFondato('Fa avanzare il sito.', FONTE, PROGETTI), 'obiettivo')
  assert.equal(percheFondato('Matters for the Northwind project.', FONTE, PROGETTI), 'obiettivo')
  // l'obiettivo di un progetto riscritto, riconosciuto dalle parole
  assert.equal(percheFondato('Mettere online le tre offerte del sito.', FONTE, PROGETTI), 'obiettivo')
  // e senza progetti resta solo la regola delle parole
  assert.equal(percheFondato('Mettere online le tre offerte del sito.', FONTE), null)
})

test('cade «numero»: una cifra che nella fonte non c’è', () => {
  assert.equal(percheFondato('La fattura 2232 scade il 26.', FONTE), 'numero')
  assert.equal(percheFondato('Sara aspetta il sì da lunedì per 3 preventivi.', FONTE), 'numero')
})

test('cade «relativo»: oggi, domani, tomorrow, tonight', () => {
  for (const p of ['Sara aspetta il sì oggi per chiudere.', 'Sara aspetta il sì entro domani.', 'Sara waits for the yes by tomorrow.', 'Sara waits for the yes tonight.']) {
    assert.equal(percheFondato(p, FONTE), 'relativo', p)
  }
})

test('cade «vuoto» sotto dodici caratteri e «lungo» sopra venti parole o duecento caratteri', () => {
  assert.equal(percheFondato('', FONTE), 'vuoto')
  assert.equal(percheFondato('Sara aspet', FONTE), 'vuoto')
  assert.equal(percheFondato('Sara aspetta', FONTE), null, 'dodici caratteri bastano')
  assert.equal(percheFondato(Array.from({ length: PERCHE_PAROLE_MAX + 1 }, () => 'sì').join(' '), FONTE), 'lungo')
  assert.equal(percheFondato('a'.repeat(201), FONTE), 'lungo')
  assert.equal(PERCHE_PAROLE, 12)
})

test('l’ordine dei guai: il primo che trova', () => {
  // relativo viene prima di obiettivo
  assert.equal(percheFondato('Conta per il progetto H-Farm da domani.', FONTE, PROGETTI), 'relativo')
})

test('passa: il giorno che «tonight» e «yesterday» volevano dire nella fonte, come li scrive `assoluto`', () => {
  const stasera = { titolo: 'x', corpo: 'Can you send me the signed contract tonight? I file it first thing.', autore: null, quando: LUNEDI }
  assert.equal(giornoFondato('Nora needs the signed contract Monday evening.', stasera), true)
  assert.equal(giornoFondato('Nora needs the signed contract Tuesday evening.', stasera), false, 'martedì non è «tonight» per una mail di lunedì')
  assert.equal(percheFondato('Nora files it Monday evening, first thing.', { testo: stasera.corpo, quando: LUNEDI }), null)
  const ieri = { titolo: 'x', corpo: 'Anna sent the draft yesterday and waits for your notes.', autore: null, quando: LUNEDI }
  assert.equal(giornoFondato('Anna sent the draft Sunday.', ieri), true)
  assert.equal(giornoFondato('Anna sent the draft Saturday.', ieri), false)
  for (const [parola, giorno] of [['stasera', 'lunedì'], ['stamattina', 'lunedì'], ['stanotte', 'lunedì'], ['this morning', 'Monday'], ['this evening', 'Monday'], ['ieri', 'domenica'], ['dopodomani', 'mercoledì']]) {
    assert.equal(giornoFondato(`Chiama ${giorno}`, { titolo: 'x', corpo: `Puoi chiamarmi ${parola}?`, autore: null, quando: LUNEDI }), true, parola)
  }
})
