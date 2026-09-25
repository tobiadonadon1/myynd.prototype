// Dopo un arrivo si chiama il modello solo se c'è qualcosa da feed: un giro
// che ha portato solo file vecchi del Mac non paga una lettura.
//
//   node --test server/dopo-arrivo.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qualcosaDaFeed } from './rilevanza.ts'

const adesso = Date.parse('2026-09-24T10:00:00Z')
const vecchio = (i: number) => ({ id: `desktop:/Users/prova/Documents/vecchio-${i}.md`, fonte: 'desktop', tipo: 'testo', titolo: `Appunti ${i}`, corpo: 'Appunti presi durante un corso, niente da fare.', autore: null, percorso: `/Users/prova/Documents/vecchio-${i}.md`, quando: '2026-03-02T10:00:00Z', gruppo: 'documenti' })
const mail = { id: 'posta:INBOX:7', fonte: 'posta', tipo: 'email', titolo: 'Can you confirm the menu wording?', corpo: 'Hi Alex, could you confirm the wording for the menu by Thursday? Thanks, Maya', autore: 'Maya Lindqvist <maya@northwind-studio.test>', percorso: 'INBOX', quando: '2026-09-24T08:30:00Z', gruppo: 'posta', inviato: false, letto: false, massa: false }

test('solo file vecchi del Mac: nessuna lettura del feed', () => {
  assert.equal(qualcosaDaFeed(Array.from({ length: 12 }, (_, i) => vecchio(i)), adesso), false)
})

test('una mail diretta appena arrivata basta a chiamarla (counter-case)', () => {
  assert.equal(qualcosaDaFeed([...Array.from({ length: 12 }, (_, i) => vecchio(i)), mail], adesso), true)
})

test('niente arrivato, niente da leggere', () => {
  assert.equal(qualcosaDaFeed([], adesso), false)
})
