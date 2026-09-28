// Il contratto dentro il lavoro (F1): il criterio arriva a chi scrive e a
// chi rilegge, la prova si scrive sulla carta, il diario racconta i passi, e
// il budget di tempo ferma una carta che non torna più.
//
//   node --test server/contratto-lavoro.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-contratto-lavoro-'))
process.env.MYYND_DATI = CASA

const store = await import('./store.ts')
const cfg = await import('./config.ts')
const compiti = await import('./compiti.ts')
type Evento = import('./compiti.ts').Evento
type Giudizio = import('./revisione-lavoro.ts').Giudizio
type Ferri = NonNullable<Parameters<typeof compiti.perProva>[0]>

before(() => { store.azzeraTutto(); cfg.aggiorna({ lingua: 'en' }) })
after(() => {
  compiti.perProva(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

let n = 0
function riga(testo: string): string {
  const id = `cl${++n}`
  store.scriviCompito({ id, testo, ordine: `o${String(n).padStart(3, '0')}` })
  return id
}

function orecchio(id: string) {
  const sentiti: Evento[] = []
  const attese = new Map<string, (e: Evento) => void>()
  const smetti = compiti.ascolta(e => {
    if (!('id' in e) || e.id !== id) return
    sentiti.push(e)
    attese.get(e.fase)?.(e)
  }, null)
  const aspetta = (fase: Evento['fase'], ms = 3000) => new Promise<Evento>((risolvi, rifiuta) => {
    const gia = sentiti.find(e => e.fase === fase)
    if (gia) return risolvi(gia)
    const t = setTimeout(() => rifiuta(new Error(`nessun «${fase}» entro ${ms}ms: ${sentiti.map(e => e.fase).join(' → ') || 'niente'}`)), ms)
    attese.set(fase, e => { clearTimeout(t); risolvi(e) })
  })
  return { sentiti, aspetta, smetti }
}

const CONSEGNE = join(CASA, 'consegne')
const salvaInCasa: Ferri['salvaConsegna'] = o => {
  mkdirSync(join(CONSEGNE, o.luogo), { recursive: true })
  const nome = `${o.titolo.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.md`
  const percorso = join(CONSEGNE, o.luogo, nome)
  writeFileSync(percorso, o.testo)
  return { percorso, nome, luogo: o.luogo }
}

const CONTRATTO = (minuti = 10) => ({
  criterio: 'A course outline file with five modules, each with a goal and one exercise.',
  mani: ['file' as const], budget: { giri: 4, minuti }, scritto: 'myynd' as const, quando: new Date().toISOString()
})
const nonChiede = async () => ({ chiede: false, manca: [], domanda: '' })
const OUTLINE = 'Done: the course outline.\n\n# First course\n\n1. Finding your angle. Goal: one audience. Exercise: three promises.\n2. The first lesson. Goal: teach one thing. Exercise: a five minute draft.\n3. The page. Goal: sell the outcome. Exercise: the headline.\n4. The first buyers. Goal: sell early. Exercise: message ten people.\n5. Shipping. Goal: publish. Exercise: five pieces of feedback.\n\nFrom your notes.'

test('il criterio arriva a chi scrive e a chi rilegge; la prova si scrive e il diario racconta i passi', async () => {
  let criterioScritto: string | undefined
  let criterioRiletto: string | null | undefined
  compiti.perProva({
    contratto: id => { const k = CONTRATTO(); store.scriviContrattoCompito(id, k); return k },
    svolgi: async (_t, _n, _m, _a, _c, passo, _d, _s, esecuzione) => {
      criterioScritto = esecuzione?.criterio
      passo?.({ passo: 'cerco', dettaglio: 'Lumen notes' })
      passo?.({ passo: 'scrivo' })
      return { testo: OUTLINE, fonti: [] }
    },
    chiedeAiuto: nonChiede,
    domandeDaFare: async () => [],
    prossimoPasso: async () => null,
    salvaConsegna: salvaInCasa,
    giudica: async o => {
      criterioRiletto = (o as { criterio?: string | null }).criterio
      return { esito: 'pass', per: 'the reader', comeTe: 'Holds.', comeLoro: 'Clear.', problemi: [], verificato: ['modules'], criterio: { esito: 'met', perche: 'Five modules, each with a goal and an exercise.' } } as Giudizio
    }
  })
  const id = riga('Write the first course outline')
  const o = orecchio(id)
  compiti.affida(id, 'tutto')
  await o.aspetta('pronto')
  const c = store.compito(id)!
  assert.equal(criterioScritto, CONTRATTO().criterio)
  assert.equal(criterioRiletto, CONTRATTO().criterio)
  assert.equal(c.prova?.esito, 'pass')
  assert.equal(c.prova?.perche, 'Five modules, each with a goal and an exercise.')
  assert.ok(c.prova?.controlli.some(x => x.startsWith('The file is there:')), JSON.stringify(c.prova))
  const tipi = (c.diario ?? []).map(v => v.tipo)
  for (const tipo of ['preso', 'contratto', 'cerco', 'scrivo', 'rileggo', 'consegnato', 'prova'] as const) assert.ok(tipi.includes(tipo), `manca «${tipo}» nel diario: ${tipi.join(', ')}`)
  // la rilettura è un passo sul filo: la bacheca la mostra come «Controllo»
  assert.ok(o.sentiti.some(e => e.fase === 'lavoro' && e.passo.passo === 'rileggo'))
  o.smetti()
})

test('un «fatto» che non regge nemmeno dopo la riscrittura: consegnata, con la prova che dice cosa manca', async () => {
  let giri = 0
  compiti.perProva({
    contratto: id => { const k = CONTRATTO(); store.scriviContrattoCompito(id, k); return k },
    svolgi: async () => ({ testo: OUTLINE, fonti: [] }),
    chiedeAiuto: nonChiede, domandeDaFare: async () => [], prossimoPasso: async () => null, salvaConsegna: salvaInCasa,
    giudica: async () => {
      giri++
      return { esito: 'revise', per: 'the reader', comeTe: '', comeLoro: '', problemi: ['Module 3 has no exercise.'], verificato: [], criterio: { esito: 'not_met', perche: 'Module 3 has no exercise.' } } as Giudizio
    }
  })
  const id = riga('Write the second course outline')
  const o = orecchio(id)
  compiti.affida(id, 'tutto')
  await o.aspetta('pronto')
  const c = store.compito(id)!
  assert.equal(giri, 2, 'una rilettura, una riscrittura, una seconda rilettura: mai un terzo giro')
  assert.equal(c.prova?.esito, 'fail')
  assert.equal(c.prova?.perche, 'Module 3 has no exercise.')
  assert.ok((c.diario ?? []).some(v => v.tipo === 'riscrivo' && v.dettaglio === 'Module 3 has no exercise.'))
  o.smetti()
})

test('un posto vuoto nel lavoro: la prova non regge, e dice cosa manca', async () => {
  compiti.perProva({
    contratto: id => { const k = { ...CONTRATTO(), criterio: 'A reminder to Sam with the invoice number and amount.', mani: [] }; store.scriviContrattoCompito(id, k); return k },
    svolgi: async () => ({ testo: 'Done: the reminder is below.\n\nHi Sam, a quick reminder about invoice [to fill: invoice number], for [to fill: amount].\n\nMissing: the invoice number and the amount.', fonti: [] }),
    chiedeAiuto: nonChiede, domandeDaFare: async () => [], prossimoPasso: async () => null, salvaConsegna: salvaInCasa,
    giudica: async () => ({ esito: 'pass', per: 'Sam', comeTe: '', comeLoro: '', problemi: [], verificato: [] }) as Giudizio
  })
  const id = riga('Chase the unpaid invoice with Sam')
  const o = orecchio(id)
  compiti.affida(id, 'bozza')
  await o.aspetta('pronto')
  const c = store.compito(id)!
  assert.equal(c.prova?.esito, 'fail')
  assert.equal(c.prova?.perche, 'Missing: the invoice number and the amount.')
  o.smetti()
})

test('il budget di tempo: una carta che non torna si ferma, con la frase fissa, e non si riprova da sola', async () => {
  let fermata = false
  compiti.perProva({
    contratto: id => { const k = CONTRATTO(0.0015); store.scriviContrattoCompito(id, k); return k },
    svolgi: (_t, _n, _m, _a, _c, _p, _d, _s, esecuzione) => new Promise((_r, rifiuta) => {
      esecuzione?.signal.addEventListener('abort', () => { fermata = true; rifiuta(new Error('La richiesta è stata interrotta a metà.')) })
    }),
    chiedeAiuto: nonChiede, domandeDaFare: async () => [], prossimoPasso: async () => null, salvaConsegna: salvaInCasa
  })
  const id = riga('A card that never comes back')
  const o = orecchio(id)
  compiti.affida(id, 'tutto')
  const g = await o.aspetta('guaio', 3000)
  assert.equal(fermata, true)
  assert.equal(g.fase === 'guaio' && g.guaio, compiti.TEMPO_FINITO)
  const c = store.compito(id)!
  assert.equal(c.stato, 'aperto')
  assert.equal(c.guaio, compiti.TEMPO_FINITO)
  assert.ok((c.diario ?? []).some(v => v.tipo === 'scaduto'))
  // «interrotta a metà» di solito si riprova fra due minuti: il tempo finito no
  await new Promise(r => setTimeout(r, 50))
  assert.equal(store.compito(id)?.stato, 'aperto')
  o.smetti()
})

test('la riga tornata sua non si porta dietro il guaio', () => {
  const id = riga('Take this one back')
  store.affidaCompito(id, 'tutto')
  store.guaioCompito(id, compiti.TEMPO_FINITO)
  compiti.richiama(id)
  const c = store.compito(id)!
  assert.equal(c.modo, 'io')
  assert.equal(c.guaio, null)
})
