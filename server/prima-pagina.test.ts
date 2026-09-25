// La prima pagina di un conto nuovo (P4): una volta, dalla posta arrivata di
// recente e non dagli impegni futuri che la lettura ha appena messo dentro;
// con il solo account di Claude le priorità girano lo stesso; senza modello
// la riga non promette niente; e l'avvio non si accorge di niente.
//
//   node --test server/prima-pagina.test.ts

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-prima-pagina-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const compatibile = await import('./compatibile.ts')
const priorita = await import('./priorita.ts')
const pagina = await import('./prima-pagina.ts')
const avvio = await import('./avvio.ts')
const conti = await import('./conti.ts')

const GIORNO = 86_400_000
const ora = Date.now()
const mail = (i: number) => ({
  id: `posta:INBOX:${100 + i}`, fonte: 'posta', tipo: 'email', titolo: `Launch checklist ${i}`,
  corpo: `Hi Alex, could you send me the launch checklist for the new website by Thursday? Thanks, Maya ${i}`,
  autore: 'Maya Lindqvist <maya@northwind-studio.test>', percorso: 'INBOX', quando: new Date(ora - (i + 1) * 3_600_000).toISOString(),
  gruppo: 'posta', inviato: false, letto: false, massa: false, messageId: `m${i}@northwind-studio.test`
})
const futuro = (i: number) => ({ id: `calendario:f${i}:${ora + i * 3_600_000}`, fonte: 'calendario', tipo: 'evento', titolo: `Standup ${i}`, corpo: 'Daily standup.', quando: new Date(ora + (i + 1) * 3_600_000).toISOString(), gruppo: 'agenda' })

function fornitoreFinto() {
  cfg.scrivi({ lingua: 'en', motore: 'compatibile', compatibile: { url: 'https://esempio.test/v1/', chiave: 'sk-prova', modello: 'gpt-prova' } })
  const ricevute: Record<string, unknown>[] = []
  compatibile.usaRete((async (_u: string | URL | Request, init?: RequestInit) => {
    ricevute.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {})
    return Response.json({ id: 'c1', model: 'gpt-prova', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ voci: [] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } })
  }) as typeof fetch)
  return ricevute
}
const testoDi = (r: Record<string, unknown>) => (r.messages as { content: string }[]).map(m => m.content).join('\n')

before(async () => { await conti.avvia() })
beforeEach(() => {
  store.azzeraTutto()
  pagina.perProva(null); pagina.dimentica(); priorita.perProva(null)
  compatibile.usaRete(null)
  cfg.scrivi({ lingua: 'en' }, { togli: [...cfg.CON_SEGRETI, 'motore'] })
})
after(() => { compatibile.usaRete(null); priorita.perProva(null); pagina.perProva(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

test('con un motore la lettura parte dalla posta arrivata, anche con quattrocento impegni futuri nell’indice', async () => {
  store.salvaDocumenti(Array.from({ length: 5 }, (_, i) => mail(i)))
  store.salvaDocumenti(Array.from({ length: 400 }, (_, i) => futuro(i)))
  const ricevute = fornitoreFinto()
  let priorita_ = 0
  pagina.perProva({ forse: async () => { priorita_++; return 0 } })
  assert.equal(pagina.dovuta(), true)
  await pagina.prepara()
  assert.ok(ricevute.length >= 1, 'il modello è stato chiamato')
  const mandato = testoDi(ricevute[0]!)
  for (let i = 0; i < 5; i++) assert.match(mandato, new RegExp(`posta:INBOX:${100 + i}`))
  assert.equal(priorita_, 1)
  assert.equal(pagina.stato().pagina, 'pronta')
  assert.ok(store.cursore('prima:pagina'))
})

test('solo l’account di Claude: niente lettura del feed, ma le priorità sì, e la pagina è pronta', async () => {
  store.salvaDocumenti([mail(0)])
  let letture = 0, priorita_ = 0, annunci = 0
  pagina.perProva({ collegato: () => true, motore: () => null, generaFeed: async () => { letture++; return [] }, forse: async forza => { assert.equal(forza, true); priorita_++; return 0 }, annuncia: () => { annunci++ } })
  assert.equal(pagina.stato().pagina, 'attesa')
  await pagina.prepara()
  assert.equal(letture, 0)
  assert.equal(priorita_, 1)
  assert.equal(annunci, 1)
  assert.equal(pagina.stato().pagina, 'pronta')
})

test('senza modello nessuna riga che lavora; appena arriva un modello la pagina è dovuta', () => {
  store.salvaDocumenti([mail(0)])
  pagina.perProva({ collegato: () => false, motore: () => null })
  assert.equal(pagina.stato().pagina, 'senza-motore')
  assert.equal(pagina.dovuta(), false)
  pagina.perProva({ collegato: () => true, motore: () => null })
  assert.equal(pagina.stato().pagina, 'attesa')
  assert.equal(pagina.dovuta(), true)
})

test('una volta sola: dopo, nemmeno ricominciando da capo', async () => {
  store.salvaDocumenti([mail(0)])
  let giri = 0
  pagina.perProva({ collegato: () => true, motore: () => null, forse: async () => { giri++; return 0 } })
  await pagina.prepara()
  assert.equal(pagina.dovuta(), false)
  pagina.dimentica()
  assert.equal(pagina.stato().pagina, 'nessuna')
  assert.equal(giri, 1)
})

test('un conto che ha già delle carte non ha una prima pagina, e non vede la riga (counter-case)', () => {
  store.salvaDocumenti([mail(0)])
  store.salvaFeed([{ tipo: 'risposta', titolo: 'Reply to Maya', testo: 'She asked for the checklist.' }])
  pagina.perProva({ collegato: () => true, motore: () => null })
  assert.equal(pagina.dovuta(), false)
  assert.equal(pagina.stato().pagina, 'nessuna')
})

test('mentre lavora lo dice, e un guaio non lascia il segno: il giro dopo riprova', async () => {
  store.salvaDocumenti([mail(0)])
  let lascia: () => void = () => {}
  pagina.perProva({ collegato: () => true, motore: () => null, forse: () => new Promise<number>(r => { lascia = () => r(0) }) })
  const p = pagina.prepara()
  assert.equal(pagina.stato().pagina, 'lavoro')
  lascia(); await p
  pagina.dimentica(); store.segnaCursore('prima:pagina', null)
  pagina.perProva({ collegato: () => true, motore: () => null, forse: async () => { throw new Error('rete') } })
  await pagina.prepara()
  assert.equal(pagina.stato().pagina, 'guaio')
  assert.equal(store.cursore('prima:pagina'), null)
  assert.equal(pagina.dovuta(), true)
})

test('la pagina che finisce fra la lettura dell’avvio e «Salva la prima attività» non fa 409', async () => {
  cfg.aggiorna({ calendario: { url: 'https://example.invalid/a.ics' } })
  store.salvaDocumenti([mail(0), futuro(1)])
  let s = avvio.progetto({ nome: 'New website', obiettivo: 'Launch the new website by October', revisione: avvio.stato().revisione })
  s = avvio.fonte({ fonti: ['calendario'], revisione: s.revisione })
  s = avvio.conferma({ ids: [], revisione: s.revisione })
  const letta = avvio.stato().revisione
  pagina.perProva({ collegato: () => true, motore: () => null, forse: async () => { store.salvaFeed([{ tipo: 'priorita', titolo: 'Send Maya the checklist', testo: 'She asked twice.' }]); return 1 } })
  await pagina.prepara()
  assert.equal(avvio.stato().revisione, letta, 'la pagina non ha scritto nell’avvio')
  const fatto = avvio.completa({ azione: 'Write the homepage copy', giorno: null, revisione: letta })
  assert.equal(fatto.fase, 'completo')
})

test('una pagina rimasta vuota si rifà quando arriva una fonte nuova, una volta; una pagina con delle carte mai più', async () => {
  store.salvaDocumenti([futuro(1)])
  let giri = 0
  pagina.perProva({ collegato: () => true, motore: () => null, forse: async () => { giri++; return 0 } })
  await pagina.prepara()
  assert.match(store.cursore('prima:pagina') ?? '', /^vuota\|.+\|calendario$/, 'il segno dice con quali fonti è rimasta vuota')
  assert.equal(pagina.dovuta(), false, 'la stessa agenda non la rifà (counter-case)')
  pagina.dimentica()
  assert.equal(pagina.stato().pagina, 'nessuna')
  // la posta collegata dopo: la pagina è di nuovo dovuta, e la riga lo dice
  store.salvaDocumenti([mail(0)])
  assert.equal(pagina.dovuta(), true)
  assert.equal(pagina.stato().pagina, 'attesa')
  pagina.perProva({ collegato: () => true, motore: () => null, forse: async () => { giri++; store.salvaFeed([{ tipo: 'priorita', titolo: 'Send Maya the checklist', testo: 'She asked twice.' }]); return 1 } })
  await pagina.prepara()
  assert.equal(giri, 2)
  assert.doesNotMatch(store.cursore('prima:pagina') ?? '', /^vuota/)
  // con delle carte è fatta per sempre: un'altra fonte nuova non la rifà
  store.salvaDocumenti([{ id: 'slack:C1:1', fonte: 'slack', tipo: 'messaggio', titolo: 'general', corpo: 'Ciao a tutti.', quando: new Date().toISOString() }])
  pagina.dimentica()
  assert.equal(pagina.dovuta(), false)
  assert.equal(pagina.stato().pagina, 'nessuna')
})

test('il giro di fondo aspetta che le fonti dell’avvio siano scelte, e non crea l’avvio per saperlo', () => {
  rmSync(join(cfg.cartella(), 'avvio.json'), { force: true })
  cfg.aggiorna({ onboarding: false })
  // un conto appena nato, ancora nell'introduzione: niente pagina, e nessun file scritto
  assert.equal(pagina.fontiScelte(), false)
  assert.equal(existsSync(join(cfg.cartella(), 'avvio.json')), false)
  // sul passo delle fonti: ancora no
  let s = avvio.progetto({ nome: 'New website', obiettivo: 'Launch the new website by October', revisione: avvio.stato().revisione })
  assert.equal(s.fase, 'fonte')
  assert.equal(pagina.fontiScelte(), false)
  // scelte (o saltate): sì
  cfg.aggiorna({ calendario: { url: 'https://example.invalid/a.ics' } })
  s = avvio.fonte({ fonti: ['calendario'], revisione: s.revisione })
  assert.equal(pagina.fontiScelte(), true)
})

test('chi ha finito l’avvio ha le sue fonti scelte, anche senza il file dell’avvio (counter-case)', () => {
  rmSync(join(cfg.cartella(), 'avvio.json'), { force: true })
  cfg.aggiorna({ onboarding: true })
  assert.equal(pagina.fontiScelte(), true)
  cfg.aggiorna({ onboarding: false })
})
