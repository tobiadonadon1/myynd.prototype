// Il modo «prompt»: la riga non consegna la cosa, consegna la richiesta con cui
// farla fare a un altro assistente.
//
// Quello che si prova non è che il prompt sia bello — quello lo decide il
// modello — ma che le istruzioni dicano le quattro cose che lo rendono
// incollabile: si regge da solo, niente [n] in mezzo, le fonti in fondo in un
// blocco loro, la riga per lei fuori dal prompt. E che `svolgi` in quel modo
// le mandi davvero, con gli attrezzi di ricerca accanto: il materiale che non
// trova qui non arriverà mai a chi legge il prompt.
//
//   node --test server/prompt.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-prompt-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const claude = await import('./claude.ts')
const compatibile = await import('./compatibile.ts')

before(() => store.azzeraTutto())
after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

/**
 * Un fornitore compatibile finto che risponde in streaming — `svolgi` legge
 * solo così — con un testo fisso, e si ricorda cosa ha ricevuto.
 */
function fornitoreFinto(testo: string) {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: Record<string, unknown>[] = []
  compatibile.usaRete((async (_url: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    const pezzo = (delta: object, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'chatcmpl-1', model: 'gpt-prova', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
    const corpo = pezzo({ role: 'assistant', content: testo }) + pezzo({}, 'stop') + 'data: [DONE]\n\n'
    return new Response(corpo, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch)
  return ricevute
}

const sistemaDi = (r: Record<string, unknown>) =>
  (r.messages as { role: string; content: string }[]).filter(m => m.role === 'system').map(m => m.content).join('\n')

test('le istruzioni del modo prompt dicono come dev’essere fatto un prompt da incollare', () => {
  const p = claude.MODI.prompt
  assert.ok(p, 'il modo prompt non esiste')
  // a chi è rivolto, e che è la richiesta e non la cosa
  assert.match(p, /il prompt con cui/)
  assert.match(p, /Claude, ChatGPT o Claude Code/)
  assert.match(p, /pronto da incollare/)
  // si regge da solo: chi legge non ha il materiale
  assert.match(p, /non ha accesso a niente di tutto questo/)
  // niente [n] dentro, e le fonti in un blocco in fondo
  assert.match(p, /NIENTE numeri fra parentesi quadre dentro il prompt/)
  assert.match(p, /«Fonti:»/)
  // le cinque parti, nell'ordine
  for (const parte of ['l\'obiettivo', 'il contesto', 'come scrive lei', 'cosa deve uscire', 'cosa non fare']) {
    assert.ok(p.includes(parte), `manca la parte «${parte}»`)
  }
  // e la riga per lei resta fuori dal prompt
  assert.match(p, /fuori dal prompt/)
  // testo semplice, non un documento con i titoli
  assert.match(p, /niente titoli/)
})

test('«bozza» e «tutto» non sono cambiati per fare posto al prompt', () => {
  assert.doesNotMatch(claude.MODI.bozza, /prompt/)
  assert.doesNotMatch(claude.MODI.tutto, /prompt/)
})

test('svolgi in modo prompt manda quelle istruzioni, gli attrezzi di ricerca, e torna il prompt', async () => {
  store.azzeraTutto()
  store.salvaDocumenti([{
    id: 'desktop:listino', fonte: 'desktop', tipo: 'file', titolo: 'Listino 2026',
    // con dentro le parole della riga: la pescata iniziale è una ricerca, e
    // un documento che non si trova non entra nella numerazione delle fonti
    corpo: 'Listino per il preventivo a Rossi. Impianto base 890 euro. Consegna in dieci giorni lavorativi.',
    autore: null, percorso: '/listino.txt', quando: '2026-09-01T10:00:00.000Z', gruppo: 'documenti'
  }])
  const prompt = [
    'Scrivi per me un\'email a Rossi con il preventivo per l\'impianto base.',
    '',
    'Contesto: dal listino in vigore, «Impianto base 890 euro. Consegna in dieci giorni lavorativi.»',
    '',
    'Fonti:',
    '— [1] Listino 2026: prezzo e tempi di consegna',
    '',
    'Non ho trovato un preventivo precedente per Rossi: il prompt parte dal listino.'
  ].join('\n')
  const ricevute = fornitoreFinto(prompt)

  const r = await claude.svolgi('Mandare il preventivo a Rossi', null, 'prompt')

  assert.equal(ricevute.length, 1, 'il fornitore va chiamato una volta')
  const sistema = sistemaDi(ricevute[0])
  assert.ok(sistema.includes(claude.MODI.prompt.trim()), 'le istruzioni del modo prompt non sono arrivate al modello')
  assert.doesNotMatch(sistema, /Ti ha chiesto la cosa scritta\. Scrivila, e basta quella/, 'sono arrivate anche quelle della bozza')
  // gli attrezzi ci sono: un prompt senza materiale è una riga di sei parole
  const attrezzi = (ricevute[0].tools as { function: { name: string } }[]).map(t => t.function.name)
  assert.ok(attrezzi.includes('cerca') && attrezzi.includes('apri'), `attrezzi: ${attrezzi.join(', ')}`)
  // e quello che torna è il prompt, con la fonte del blocco «Fonti:» riconosciuta
  assert.equal(r.testo, prompt)
  assert.deepEqual(r.fonti, [{ id: 'desktop:listino', label: '[1] Listino 2026' }])
})
