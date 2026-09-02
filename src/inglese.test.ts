// Il dizionario inglese è davvero in inglese.
//
// `lingua.test.ts` controlla che ogni frase *abbia* una voce, e quella è la
// metà che si dimentica di più. Questa controlla l'altra: che la voce non sia
// italiana. Sono due modi diversi di sbagliare — una riga senza traduzione e
// una riga «tradotta» con la stessa frase — e la seconda non la vede nessuno,
// perché il dizionario risponde e l'app non si lamenta.
//
// La regola di Tobia è netta: l'app è in inglese, e in italiano si traduce
// tutto. Qui si tiene ferma la prima metà.
//
//   node --test src/inglese.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Parole che esistono solo in italiano. Corte no: «e», «o», «si» sono anche
 * inglesi o pezzi di altro, e darebbero rumore invece che segnale.
 */
const ITALIANE = new RegExp(
  '\\b(che|non|una|uno|della|dello|delle|degli|con|sono|questo|questa|quello|quella|' +
  'nella|nello|quando|perché|perche|anche|tutto|tutti|tutte|ancora|adesso|solo|senza|' +
  'dopo|prima|già|gia|niente|nessuno|qualcosa|cosa|cose|scrivi|leggi|collega|apri|chiudi|' +
  'fatto|fatta|detto|detta|dalla|sulla|tuoi|puoi|deve|devi|serve|vuoi|oppure|invece|' +
  'sempre|mai|molto|poco|quasi|proprio|stesso|altro|altra)\\b', 'i')

/**
 * Le voci che *devono* restare uguali: nomi propri e parole che si scrivono
 * allo stesso modo nelle due lingue. Ognuna è una scelta, non una dimenticanza.
 */
const UGUALI_APPOSTA = new Set([
  'Myynd', 'Chat', 'Desktop', 'Email', 'Password', 'Notion', 'Slack', 'Dropbox',
  'WhatsApp Business', 'Google Drive', 'Word, Pages', 'Claude', 'Claude Code'
])

const sorgente = readFileSync(new URL('./lingua.ts', import.meta.url), 'utf8')
const inizio = sorgente.indexOf('const EN')
const fine = sorgente.indexOf('export const frasi')
assert.ok(inizio > 0 && fine > inizio, 'non trovo il dizionario in lingua.ts')
const righe = sorgente.slice(inizio, fine).split('\n')

/** `'chiave': 'valore',` → [chiave, valore]. Salta i commenti e le righe spezzate. */
function voce(riga: string): [string, string] | null {
  const m = /^\s*(['"])(.+?)\1\s*:\s*(['"])(.+?)\3\s*,?\s*$/.exec(riga)
  return m ? [m[2], m[4]] : null
}

test('nessuna voce inglese è rimasta in italiano', () => {
  const male: string[] = []
  righe.forEach((r, i) => {
    const v = voce(r)
    if (!v) return
    const [, valore] = v
    const parola = ITALIANE.exec(valore)
    if (parola) male.push(`lingua.ts:${i + 1} — «${parola[0]}» dentro: ${valore.slice(0, 90)}`)
  })
  assert.deepEqual(male, [], `queste righe le legge chi ha l’app in inglese:\n  ${male.join('\n  ')}`)
})

test('una voce uguale alla sua chiave è una scelta, non una dimenticanza', () => {
  const male: string[] = []
  righe.forEach((r, i) => {
    const v = voce(r)
    if (!v) return
    const [chiave, valore] = v
    if (chiave === valore && !UGUALI_APPOSTA.has(valore)) {
      male.push(`lingua.ts:${i + 1} — «${valore}»`)
    }
  })
  assert.deepEqual(male, [],
    'queste voci ripetono la chiave: o vanno tradotte, o messe in UGUALI_APPOSTA con la ragione.\n  ' + male.join('\n  '))
})

test('il dizionario ha un numero di voci che ha senso', () => {
  const quante = righe.filter(voce).length
  // se qualcuno rompe il taglio del file, questa prova smette di guardare
  // niente senza dirlo: qui si accorge
  assert.ok(quante > 700, `solo ${quante} voci lette: il taglio del dizionario non funziona più`)
})
