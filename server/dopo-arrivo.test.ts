// Dopo un arrivo si chiama il modello solo se c'è qualcosa da feed: un giro
// che ha portato solo file vecchi del Mac non paga una lettura. Si contano
// le richieste che arrivano davvero al fornitore finto.
//
//   node --test server/dopo-arrivo.test.ts

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-dopo-arrivo-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const compatibile = await import('./compatibile.ts')
const { qualcosaDaFeed } = await import('./rilevanza.ts')
const { feedDegliArrivi } = await import('./dopo-arrivo.ts')

const adesso = Date.now()
const vecchio = (i: number) => ({ id: `desktop:/Users/prova/Documents/vecchio-${i}.md`, fonte: 'desktop', tipo: 'testo', titolo: `Appunti ${i}`, corpo: 'Appunti presi durante un corso, niente da fare.', autore: null, percorso: `/Users/prova/Documents/vecchio-${i}.md`, quando: new Date(adesso - 200 * 86_400_000).toISOString(), gruppo: 'documenti' })
const mail = { id: 'posta:INBOX:7', fonte: 'posta', tipo: 'email', titolo: 'Can you confirm the menu wording?', corpo: 'Hi Alex, could you confirm the wording for the menu by Thursday? Thanks, Maya', autore: 'Maya Lindqvist <maya@northwind-studio.test>', percorso: 'INBOX', quando: new Date(adesso - 90 * 60_000).toISOString(), gruppo: 'posta', inviato: false, letto: false, massa: false }

/** Un fornitore finto che conta le richieste. */
function fornitoreFinto() {
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: unknown[] = []
  compatibile.usaRete((async (_u: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) : {})
    return Response.json({ id: 'c1', model: 'gpt-prova', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ voci: [] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } })
  }) as typeof fetch)
  return ricevute
}

beforeEach(() => { store.azzeraTutto(); compatibile.usaRete(null) })
after(() => { compatibile.usaRete(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

test('solo file vecchi del Mac: nessuna chiamata al modello', async () => {
  const vecchi = Array.from({ length: 12 }, (_, i) => vecchio(i))
  store.salvaDocumenti(vecchi)
  const ricevute = fornitoreFinto()
  assert.equal(qualcosaDaFeed(vecchi, adesso), false)
  assert.deepEqual(await feedDegliArrivi(store.appenaArrivati(new Date(adesso - 60_000).toISOString(), 20), adesso), [])
  assert.equal(ricevute.length, 0)
})

test('una mail diretta appena arrivata: una chiamata sola (counter-case)', async () => {
  const arrivi = [...Array.from({ length: 12 }, (_, i) => vecchio(i)), mail]
  store.salvaDocumenti(arrivi)
  const ricevute = fornitoreFinto()
  assert.equal(qualcosaDaFeed(arrivi, adesso), true)
  await feedDegliArrivi(store.appenaArrivati(new Date(adesso - 60_000).toISOString(), 20), adesso)
  assert.equal(ricevute.length, 1)
})

test('niente arrivato, niente da leggere', async () => {
  const ricevute = fornitoreFinto()
  assert.deepEqual(await feedDegliArrivi([], adesso), [])
  assert.equal(ricevute.length, 0)
})
