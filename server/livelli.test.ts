// I tre livelli di un lavoro, e la promessa che ne regge il cambiamento.
//
// `LAVORI` è passata da `frontiera: true|false` a `livello: casa|media|frontiera`
// per far arrivare il modello di casa dove sta il volume — la lettura del feed,
// la cernita, le domande — invece che solo sui titoli delle chat.
//
// Un cambio così ha un modo preciso di andare male, e non è un errore: è un
// peggioramento silenzioso. Bastava che `modelloPer` leggesse «non è frontiera,
// quindi economico» sui livelli nuovi, e da lì in poi la lettura del feed —
// senza nessun modello locale in giro, senza niente che cambiasse sullo schermo,
// senza una riga di registro — si sarebbe fatta su Haiku invece che su Sonnet.
// Nessuno se ne accorge finché il feed non è peggiore, e a quel punto nessuno
// pensa più a questa riga.
//
// Quindi la prova non è «i livelli sono scritti giusti». È: **ciò che andava in
// rete ci va ancora, allo stesso modello di prima**. Il livello nuovo apre una
// strada al locale, non ne chiude una alla rete.
//
//   node --test server/livelli.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-livelli-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const mod = await import('./modello.ts')
after(() => rmSync(CASA, { recursive: true, force: true }))

const ECONOMICO = 'claude-haiku-4-5'

/** I lavori che prima della tabella a tre livelli erano `frontiera: true`. */
const ERANO_FRONTIERA = ['risposta', 'bozza', 'lettura', 'cernita', 'domande', 'punto', 'ricetta']

/** Quelli che erano `frontiera: false`, e devono restare sull'economico. */
const ERANO_PICCOLI = ['rassegna', 'titolo', 'classifica', 'traduzione', 'estrazione',
  'giudizio', 'ritratto', 'smistamento']

test('nessun lavoro che pagava il modello grande è finito sull’economico', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5' })
  for (const l of ERANO_FRONTIERA) {
    assert.equal(mod.modelloPer(l), 'claude-sonnet-5',
      `«${l}» è sceso a ${mod.modelloPer(l)}: in rete deve valere quanto valeva prima`)
  }
})

test('e i lavori piccoli continuano a costare poco', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5' })
  for (const l of ERANO_PICCOLI) {
    assert.equal(mod.modelloPer(l), ECONOMICO, `«${l}» non va più sull’economico`)
  }
})

test('il modello scelto resta quello scelto, qualunque sia', () => {
  cfg.scrivi({ modello: 'claude-opus-5' })
  assert.equal(mod.modelloPer('bozza'), 'claude-opus-5')
  assert.equal(mod.modelloPer('lettura'), 'claude-opus-5')
  // l'economico è una scelta nostra, non la sua: non segue le preferenze
  assert.equal(mod.modelloPer('titolo'), ECONOMICO)
})

test('l’email che esce dall’azienda non la scrive il modello piccolo', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5' })
  // `preparaEmail` girava sotto `classifica`, cioè fra le manovre interne:
  // sembra una classificazione — tre campi da un testo — ma il campo `corpo`
  // è la lettera che legge un cliente. L'indirizzo era già difeso a valle da
  // una regex; il testo non è difendibile a valle, e quindi la difesa è qui.
  assert.equal(mod.modelloPer('email'), 'claude-sonnet-5')
  assert.notEqual(mod.modelloPer('email'), ECONOMICO)
})

test('un lavoro che non esiste non finisce per sbaglio sull’economico', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5' })
  // `modelloPer` prende una stringa qualunque — la chiama anche `nomeMotore`
  // con `''`. Il ramo sbagliato qui vorrebbe dire mandare al modello piccolo
  // roba di cui non sappiamo niente, che è esattamente il caso in cui non si
  // risparmia.
  assert.equal(mod.modelloPer('non-esiste'), 'claude-sonnet-5')
  assert.equal(mod.modelloPer(''), 'claude-sonnet-5')
})

test('i parametri di un lavoro «media» sono ancora quelli di prima', () => {
  cfg.scrivi({ modello: 'claude-sonnet-5' })
  // la lettura pensa, e lo faceva anche quando era di frontiera: il livello
  // nuovo non deve averle tolto il ragionamento per strada
  const p = mod.parametri('lettura', 8000) as Record<string, unknown>
  assert.equal(p.model, 'claude-sonnet-5')
  assert.deepEqual(p.thinking, { type: 'adaptive' })
  assert.deepEqual(p.output_config, { effort: 'medium' })
})
