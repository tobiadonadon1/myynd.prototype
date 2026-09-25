// La salute delle fonti, sul database vero: righe del giorno, episodi, giorni
// chiusi, silenzi, il permesso delle Note dal vivo, la sonda di WhatsApp.
// Due conti, perché è tutto per persona.
//
//   node --test server/salute-fonti.test.ts

import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config } from './config.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-salute-'))
process.env.MYYND_DATI = CASA
delete process.env.MYYND_VERSIONE
const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const sf = await import('./salute-fonti.ts')
const db = store.default

let A = ''
let B = ''
before(async () => {
  const a = await conti.registra('anna@esempio.test', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.test', 'passwordlunga2')
  if (!a.ok || !b.ok) throw new Error('conti')
  A = a.id; B = b.id
})
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

const CONFIG = {
  fuso: 'Europe/Rome', note: { note: 0 }, desktop: { cartelle: ['/tmp'], scelte: true },
  posta: { host: 'imap.esempio.test', porta: 993, utente: 'a@esempio.test', password: 'x' },
  calendario: { url: 'https://esempio.test/a.ics' }, slack: { token: 'xoxp-finto' },
  whatsapp: { token: 't', numero: '1', segreto: 's', parola: 'p' }
}
const inA = <T>(f: () => T): T => chi.dentro(A, f)
const inB = <T>(f: () => T): T => chi.dentro(B, f)
beforeEach(() => {
  for (const u of [A, B]) chi.dentro(u, () => {
    db.exec('DELETE FROM salute_fonti; DELETE FROM stato_fonti; DELETE FROM documenti; DELETE FROM cursori')
    cfg.scrivi(structuredClone(CONFIG) as Config)
  })
  sf.perProva()
})

/** Un istante a Roma: giorno di settembre 2026, ora e minuti. */
const alle = (giorno: number, ora: number, minuti = 0) => Date.UTC(2026, 8, giorno, ora - 2, minuti)
const reg = (x: Partial<Parameters<typeof sf.registra>[0]> & { fonte: string; quando: number }) =>
  sf.registra({ esito: 'pulita', rimedio: null, frase: null, durata: 0, tolti: 0, inventario: null, ...x }, { risveglio: 0 })
const rigaDi = (giorno: string, fonte: string) => db.prepare('SELECT * FROM salute_fonti WHERE giorno = ? AND fonte = ?').get(giorno, fonte) as Record<string, unknown> | undefined
const ep = (fonte: string) => db.prepare('SELECT * FROM stato_fonti WHERE fonte = ?').get(fonte) as Record<string, unknown> | undefined

// — registra —

test('registra: i contatori del giorno, la fila, la durata più lunga, il totale solo sulle letture pulite d’inventario, la versione', () => inA(() => {
  reg({ fonte: 'calendario', quando: alle(20, 9), durata: 1200, inventario: 40 })
  reg({ fonte: 'calendario', quando: alle(20, 9, 10), esito: 'guaio', rimedio: 'attendi', durata: 60_000, inventario: 3 })
  reg({ fonte: 'calendario', quando: alle(20, 9, 13), esito: 'guaio', rimedio: 'attendi', durata: 10, frase: 'Il calendario ci ha messo troppo a rispondere. Riprova.' })
  reg({ fonte: 'calendario', quando: alle(20, 9, 20), esito: 'guaio', rimedio: 'attendi', durata: 10 })
  const r = rigaDi('2026-09-20', 'calendario')!
  assert.equal(r.letture, 4)
  assert.equal(r.pulite, 1)
  assert.equal(r.guai, 2, 'quella a tre minuti dalla precedente non si conta')
  assert.equal(r.fila, 2)
  assert.equal(r.totale, 40, 'il totale viene solo da una lettura pulita')
  assert.equal(r.durata, 60_000)
  assert.equal(r.rimedio, 'attendi')
  assert.equal(r.frase, 'Il calendario ci ha messo troppo a rispondere. Riprova.')
  assert.equal(r.versione, '0.2.24')
  assert.equal(r.verdetto, null)
  // la frase non classificata non c'è: resta quella di prima
  reg({ fonte: 'calendario', quando: alle(20, 10), durata: 5, inventario: 41 })
  const s = rigaDi('2026-09-20', 'calendario')!
  assert.equal(s.fila, 0)
  assert.equal(s.totale, 41)
}))

test('un guaio passeggero 90 secondi dopo un risveglio non conta; tre minuti dopo sì; uno che resta conta sempre', () => inA(() => {
  const sveglia = alle(20, 8)
  const r1 = sf.registra({ fonte: 'posta', esito: 'guaio', rimedio: 'attendi', frase: null, durata: 0, tolti: 0, inventario: null, quando: sveglia + 90_000 }, { risveglio: sveglia })
  assert.deepEqual(r1, { cambiato: false })
  assert.equal(rigaDi('2026-09-20', 'posta'), undefined)
  assert.equal(ep('posta'), undefined)
  sf.registra({ fonte: 'posta', esito: 'guaio', rimedio: 'attendi', frase: null, durata: 0, tolti: 0, inventario: null, quando: sveglia + 180_000 }, { risveglio: sveglia })
  assert.equal(rigaDi('2026-09-20', 'posta')!.guai, 1)
  sf.registra({ fonte: 'note', esito: 'guaio', rimedio: 'permesso-disco', frase: null, durata: 0, tolti: 0, inventario: null, quando: sveglia + 30_000 }, { risveglio: sveglia })
  assert.equal(rigaDi('2026-09-20', 'note')!.guai, 1)
}))

test('l’episodio: si apre, si allunga solo sulle letture contate, prende la causa peggiore, si chiude alla prima pulita', () => inA(() => {
  assert.deepEqual(reg({ fonte: 'slack', quando: alle(20, 9), esito: 'guaio', rimedio: 'attendi' }), { cambiato: false })
  assert.equal(ep('slack')!.fila, 1)
  reg({ fonte: 'slack', quando: alle(20, 9, 5), esito: 'guaio', rimedio: 'attendi' })
  assert.equal(ep('slack')!.fila, 1, 'cinque minuti dopo non si conta')
  reg({ fonte: 'slack', quando: alle(20, 9, 10), esito: 'guaio', rimedio: 'attendi' })
  assert.equal(ep('slack')!.fila, 2)
  assert.deepEqual(sf.fontiIncomplete(), [], 'due letture passeggere non si mostrano')
  assert.deepEqual(reg({ fonte: 'slack', quando: alle(20, 9, 20), esito: 'guaio', rimedio: 'attendi' }), { cambiato: true })
  assert.deepEqual(sf.fontiIncomplete().map(f => [f.fonte, f.motivo, f.rimedio]), [['slack', 'non-disponibile', 'attendi']])
  // una causa che resta prende il posto della passeggera, e non torna indietro
  reg({ fonte: 'slack', quando: alle(20, 9, 30), esito: 'guaio', rimedio: 'credenziale' })
  reg({ fonte: 'slack', quando: alle(20, 9, 40), esito: 'incompleta', rimedio: 'attendi' })
  assert.equal(ep('slack')!.rimedio, 'credenziale')
  assert.equal(ep('slack')!.motivo, 'non-disponibile')
  assert.equal(ep('slack')!.dal, new Date(alle(20, 9)).toISOString())
  assert.deepEqual(reg({ fonte: 'slack', quando: alle(20, 10) }), { cambiato: true })
  assert.equal(ep('slack'), undefined)
}))

test('una causa che resta si mostra subito; una lettura del desktop con cartelle negate pure', () => inA(() => {
  assert.deepEqual(reg({ fonte: 'note', quando: alle(20, 9), esito: 'guaio', rimedio: 'permesso-disco' }), { cambiato: true })
  reg({ fonte: 'desktop', quando: alle(20, 9), esito: 'incompleta', rimedio: 'permesso-disco' })
  assert.deepEqual(sf.fontiIncomplete().map(f => [f.fonte, f.motivo, f.rimedio]), [['note', 'non-disponibile', 'permesso-disco'], ['desktop', 'incompleta', 'permesso-disco']])
}))

test('una lettura intera chiude gli episodi delle fonti che non ha letto, WhatsApp no', () => inA(() => {
  reg({ fonte: 'note', quando: alle(20, 9), esito: 'guaio', rimedio: 'permesso-disco' })
  reg({ fonte: 'whatsapp', quando: alle(20, 9), esito: 'guaio', rimedio: 'credenziale', sonda: 'credenziale' })
  reg({ fonte: 'posta', quando: alle(20, 9), esito: 'guaio', rimedio: 'credenziale' })
  assert.equal(sf.chiudiAssenti(new Set(['posta'])), true)
  assert.deepEqual(sf.episodi().map(e => e.fonte).sort(), ['posta', 'whatsapp'])
  assert.equal(sf.chiudiAssenti(new Set(['posta'])), false)
}))

test('una fonte scollegata non compare più, e svuotarla toglie il suo episodio', () => inA(() => {
  reg({ fonte: 'note', quando: alle(20, 9), esito: 'guaio', rimedio: 'permesso-disco' })
  cfg.scrivi({ ...structuredClone(CONFIG), note: undefined } as Config, { togli: ['note'] })
  assert.deepEqual(sf.fontiIncomplete(), [])
  cfg.scrivi(structuredClone(CONFIG) as Config)
  assert.equal(sf.fontiIncomplete().length, 1)
  store.svuotaFonte('note')
  assert.deepEqual(sf.fontiIncomplete(), [])
  assert.ok(rigaDi('2026-09-20', 'note'), 'la storia resta')
}))

test('i motori non sono mai fra le fonti da dire', () => inA(() => {
  reg({ fonte: 'claude', quando: alle(20, 9), esito: 'guaio', rimedio: 'accedi' })
  assert.deepEqual(sf.fontiIncomplete(), [])
}))

test('il guaio di A non compare per B; dopo aver chiuso e riaperto l’indice l’episodio c’è ancora', () => {
  inA(() => reg({ fonte: 'note', quando: alle(20, 9), esito: 'guaio', rimedio: 'permesso-disco' }))
  assert.deepEqual(inB(() => sf.fontiIncomplete()), [])
  store.chiudiIndici()
  assert.deepEqual(inA(() => sf.fontiIncomplete().map(f => f.fonte)), ['note'])
})

test('«dopo l’aggiornamento»: solo per il disco, solo se l’ultima lettura pulita era su un’altra versione', () => inA(() => {
  store.segnaCursore('salute:versione:note', '0.2.23')
  reg({ fonte: 'note', quando: alle(20, 9), esito: 'guaio', rimedio: 'permesso-disco' })
  assert.equal(sf.fontiIncomplete()[0].dopoAggiornamento, true)
  reg({ fonte: 'note', quando: alle(20, 10) })
  assert.equal(store.cursore('salute:versione:note'), '0.2.24')
  reg({ fonte: 'note', quando: alle(20, 11), esito: 'guaio', rimedio: 'permesso-disco' })
  assert.equal(sf.fontiIncomplete()[0].dopoAggiornamento, undefined)
  // un'altra causa non è mai colpa dell'aggiornamento
  store.segnaCursore('salute:versione:posta', '0.2.23')
  reg({ fonte: 'posta', quando: alle(20, 11), esito: 'guaio', rimedio: 'credenziale' })
  assert.equal(sf.fontiIncomplete().find(f => f.fonte === 'posta')!.dopoAggiornamento, undefined)
}))

// — il permesso delle Note, dal vivo —

test('le Note guariscono dal vivo: leggibili e con un episodio di permesso, si chiude e si rilegge; non di nuovo entro dieci minuti', () => inA(() => {
  reg({ fonte: 'note', quando: alle(20, 9), esito: 'guaio', rimedio: 'permesso-disco' })
  assert.deepEqual(sf.verificaPermessi({ note: 'negato' }, alle(20, 9, 1)), [])
  assert.deepEqual(sf.verificaPermessi({ note: 'leggibile' }, alle(20, 9, 1)), ['note'])
  assert.equal(ep('note'), undefined)
  reg({ fonte: 'note', quando: alle(20, 9, 2), esito: 'guaio', rimedio: 'permesso-disco' })
  assert.deepEqual(sf.verificaPermessi({ note: 'leggibile' }, alle(20, 9, 5)), [], 'non entro dieci minuti')
  assert.deepEqual(sf.verificaPermessi({ note: 'leggibile' }, alle(20, 9, 12)), ['note'])
  // un'altra causa non si tocca
  reg({ fonte: 'note', quando: alle(20, 9, 20), esito: 'guaio', rimedio: 'aggiorna' })
  assert.deepEqual(sf.verificaPermessi({ note: 'leggibile' }, alle(20, 10)), [])
  assert.ok(ep('note'))
}))

// — i giorni —

type R = { letture?: number; pulite?: number; guai?: number; incomplete?: number; fila?: number; documenti?: number; totale?: number | null; rimedio?: string | null; verdetto?: string | null; sonda?: string | null; versione?: string }
function metti(giorno: string, fonte: string, x: R = {}) {
  db.prepare(`INSERT OR REPLACE INTO salute_fonti (giorno, fonte, letture, pulite, incomplete, guai, fila, documenti, totale, sonda, rimedio, versione, verdetto)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(giorno, fonte, x.letture ?? 144, x.pulite ?? 144, x.incomplete ?? 0, x.guai ?? 0, x.fila ?? 0,
    x.documenti ?? 0, x.totale ?? null, x.sonda ?? null, x.rimedio ?? null, x.versione ?? '0.2.24', x.verdetto === undefined ? 'pulito' : x.verdetto)
}
const giorno = (n: number) => `2026-09-${String(n).padStart(2, '0')}`
function documento(id: string, fonte: string, indicizzato: string) {
  store.salvaDocumenti([{ id, fonte, tipo: 'nota', titolo: id, corpo: `il corpo di ${id}`, autore: null, percorso: null, quando: indicizzato, gruppo: fonte }])
  db.prepare('UPDATE documenti SET indicizzato = ? WHERE id = ?').run(indicizzato, id)
}

test('chiudiGiorni: gli arrivi dall’indice giorno per giorno, a mezzanotte di Roma', () => inA(() => {
  for (const g of [10, 11, 12]) metti(giorno(g), 'posta', { verdetto: null })
  documento('p1', 'posta', new Date(alle(10, 23, 30)).toISOString())
  documento('p2', 'posta', new Date(alle(11, 0, 30)).toISOString())
  documento('p3', 'posta', new Date(alle(11, 12)).toISOString())
  const n = sf.chiudiGiorni(new Date(alle(13, 12)))
  assert.equal(n, 3)
  assert.deepEqual([10, 11, 12].map(g => rigaDi(giorno(g), 'posta')!.documenti), [1, 2, 0])
  assert.deepEqual([10, 11, 12].map(g => rigaDi(giorno(g), 'posta')!.verdetto), ['pulito', 'pulito', 'pulito'])
  // una riga chiusa non si riscrive
  documento('p4', 'posta', new Date(alle(12, 9)).toISOString())
  assert.equal(sf.chiudiGiorni(new Date(alle(14, 12))), 0)
  assert.equal(rigaDi(giorno(12), 'posta')!.documenti, 0)
}))

test('chiudiGiorni: un guaio a fine giornata aspetta la lettura dopo; ripresa è pulita, ancora giù è guasta', () => inA(() => {
  metti(giorno(10), 'slack', { guai: 1, fila: 1, rimedio: 'attendi', verdetto: null })
  reg({ fonte: 'slack', quando: alle(10, 23, 55), esito: 'guaio', rimedio: 'attendi' })
  // nessuna lettura dopo: resta aperto
  assert.equal(sf.chiudiGiorni(new Date(alle(11, 7))), 0)
  assert.equal(rigaDi(giorno(10), 'slack')!.verdetto, null)
  // la lettura delle 8 fallisce ancora: guasto
  reg({ fonte: 'slack', quando: alle(11, 8), esito: 'guaio', rimedio: 'attendi' })
  sf.chiudiGiorni(new Date(alle(11, 9)))
  assert.equal(rigaDi(giorno(10), 'slack')!.verdetto, 'guasto')
}))

test('chiudiGiorni: timeout alle 23:55 e lettura pulita alle 8: la giornata è pulita', () => inA(() => {
  reg({ fonte: 'slack', quando: alle(10, 12) })
  reg({ fonte: 'slack', quando: alle(10, 23, 55), esito: 'guaio', rimedio: 'attendi' })
  reg({ fonte: 'slack', quando: alle(11, 8) })
  sf.chiudiGiorni(new Date(alle(11, 9)))
  assert.equal(rigaDi(giorno(10), 'slack')!.verdetto, 'pulito')
}))

test('chiudiGiorni: la lettura delle 8 fallisce di nuovo e quella delle 8:15 è pulita: il giorno prima resta guasto', () => inA(() => {
  reg({ fonte: 'slack', quando: alle(20, 9) })
  reg({ fonte: 'slack', quando: alle(20, 23, 55), esito: 'guaio', rimedio: 'attendi' })
  reg({ fonte: 'slack', quando: alle(21, 8), esito: 'guaio', rimedio: 'attendi' })
  reg({ fonte: 'slack', quando: alle(21, 8, 15) })
  assert.equal(ep('slack'), undefined, 'l’episodio è già chiuso')
  sf.chiudiGiorni(new Date(alle(21, 9)))
  assert.equal(rigaDi(giorno(20), 'slack')!.verdetto, 'guasto')
  assert.equal(store.cursore('salute:dopo:slack:2026-09-20'), null, 'il segno se ne va con la chiusura')
}))

test('chiudiGiorni: la prima lettura dopo è pulita, e poi ne fallisce un’altra: ripreso (counter-case)', () => inA(() => {
  reg({ fonte: 'slack', quando: alle(20, 9) })
  reg({ fonte: 'slack', quando: alle(20, 23, 55), esito: 'guaio', rimedio: 'attendi' })
  reg({ fonte: 'slack', quando: alle(21, 8) })
  reg({ fonte: 'slack', quando: alle(21, 8, 10), esito: 'guaio', rimedio: 'attendi' })
  sf.chiudiGiorni(new Date(alle(21, 9)))
  assert.equal(rigaDi(giorno(20), 'slack')!.verdetto, 'pulito')
}))

test('una lettura lunga che finisce dopo la chiusura del suo giorno conta su oggi: la riga chiusa non cambia', () => inA(() => {
  reg({ fonte: 'note', quando: alle(20, 12) })
  sf.chiudiGiorni(new Date(alle(21, 0, 5)))
  const prima = { ...rigaDi(giorno(20), 'note')! }
  assert.equal(prima.verdetto, 'pulito')
  sf.registra({ fonte: 'note', esito: 'guaio', rimedio: 'permesso-disco', frase: null, durata: 600_000, tolti: 0, inventario: null, quando: alle(20, 23, 59) },
    { risveglio: 0, adesso: alle(21, 0, 10) })
  assert.deepEqual({ ...rigaDi(giorno(20), 'note') }, prima)
  const oggi = rigaDi(giorno(21), 'note')!
  assert.equal(oggi.letture, 1)
  assert.equal(oggi.guai, 1)
  assert.equal(oggi.rimedio, 'permesso-disco')
  assert.equal(ep('note')!.rimedio, 'permesso-disco', 'l’episodio si apre comunque')
}))

test('chiudiGiorni: il silenzio si scrive sul giorno giusto; una fonte che di solito tace no', () => inA(() => {
  for (let g = 1; g <= 10; g++) { metti(giorno(g), 'posta', { documenti: 20 }); metti(giorno(g), 'slack', { documenti: g % 5 === 0 ? 1 : 0 }) }
  for (const g of [11, 12]) { metti(giorno(g), 'posta', { verdetto: null }); metti(giorno(g), 'slack', { verdetto: null }) }
  sf.chiudiGiorni(new Date(alle(13, 12)))
  assert.equal(rigaDi(giorno(11), 'posta')!.verdetto, 'pulito', 'un giorno vuoto solo non è un silenzio')
  assert.equal(rigaDi(giorno(12), 'posta')!.verdetto, 'muto')
  assert.equal(rigaDi(giorno(12), 'slack')!.verdetto, 'pulito')
  const s = sf.silenzi(new Date(alle(13, 12)))
  assert.deepEqual(s.get('posta'), { forma: 'arrivi', giorni: 3, n: 0 })
  assert.equal(s.has('slack'), false)
  // qualcosa è arrivato oggi: il segno sparisce subito
  documento('arrivata', 'posta', new Date(alle(13, 10)).toISOString())
  assert.equal(sf.silenzi(new Date(alle(13, 12))).has('posta'), false)
}))

test('chiudiGiorni: l’inventario rimasto vuoto è un silenzio, e il conto di adesso lo toglie', () => inA(() => {
  for (let g = 1; g <= 7; g++) metti(giorno(g), 'calendario', { totale: 40 })
  metti(giorno(8), 'calendario', { totale: 0, verdetto: null })
  sf.chiudiGiorni(new Date(alle(9, 12)))
  assert.equal(rigaDi(giorno(8), 'calendario')!.verdetto, 'muto')
  assert.deepEqual(sf.silenzi(new Date(alle(9, 12))).get('calendario'), { forma: 'inventario', giorni: 0, n: 0 })
  for (let i = 0; i < 10; i++) documento(`e${i}`, 'calendario', new Date(alle(8, 9)).toISOString())
  assert.equal(sf.silenzi(new Date(alle(9, 12))).has('calendario'), false)
}))

test('un motore chiude il suo giorno dal suo conto: guasto, pulito o spento', () => inA(() => {
  metti(giorno(10), 'claude', { letture: 1, pulite: 1, guai: 1, rimedio: 'accedi', verdetto: null })
  metti(giorno(10), 'openai', { letture: 1, pulite: 1, verdetto: null })
  sf.chiudiGiorni(new Date(alle(11, 12)))
  assert.equal(rigaDi(giorno(10), 'claude')!.verdetto, 'guasto')
  assert.equal(rigaDi(giorno(10), 'openai')!.verdetto, 'pulito')
}))

// — WhatsApp, una volta al giorno —

test('la sonda di WhatsApp: ok è pulita; il token scaduto è credenziale; Meta zitta è passeggera', async () => {
  await chi.dentro(A, async () => {
    const adesso = () => new Date(alle(20, 12))
    await sf.giornaliero({ prova: async () => ({ ok: true, etichetta: 'Bottega' }), adesso })
    let r = rigaDi('2026-09-20', 'whatsapp')!
    assert.equal(r.sonda, 'ok')
    assert.equal(r.pulite, 1)
    db.exec('DELETE FROM salute_fonti; DELETE FROM stato_fonti')
    await sf.giornaliero({ prova: async () => ({ ok: false, errore: 'Il token di WhatsApp non è valido o è scaduto.' }), adesso })
    r = rigaDi('2026-09-20', 'whatsapp')!
    assert.equal(r.sonda, 'credenziale')
    assert.equal(r.rimedio, 'credenziale')
    assert.equal(sf.fontiIncomplete()[0].rimedio, 'credenziale')
    db.exec('DELETE FROM salute_fonti; DELETE FROM stato_fonti')
    await sf.giornaliero({ prova: async () => ({ ok: false, errore: 'Meta non ha risposto.' }), adesso: () => new Date(alle(20, 12, 30)) })
    assert.equal(rigaDi('2026-09-20', 'whatsapp')!.rimedio, 'attendi')
  })
})

test('il token rimesso dal pannello: la sonda riuscita chiude subito il guaio di WhatsApp', () => inA(() => {
  assert.equal(sf.sondaWhatsapp({ ok: false, errore: 'Il token di WhatsApp non è valido o è scaduto.' }, 10, alle(20, 12)).cambiato, true)
  assert.equal(sf.fontiIncomplete()[0].fonte, 'whatsapp')
  // un altro guaio non cambia la riga (counter-case)
  assert.equal(sf.sondaWhatsapp({ ok: false, errore: 'Il token di WhatsApp non è valido o è scaduto.' }, 10, alle(20, 13)).cambiato, false)
  cfg.aggiorna({ whatsapp: { token: 'nuovo', numero: '1', segreto: 's', parola: 'p' } } as Partial<Config>)
  assert.equal(sf.sondaWhatsapp({ ok: true }, 10, alle(20, 14)).cambiato, true)
  assert.deepEqual(sf.fontiIncomplete(), [])
  assert.equal(rigaDi('2026-09-20', 'whatsapp')!.sonda, 'ok')
}))

test('un giorno che non si chiude non ferma la sonda', async () => {
  await chi.dentro(A, async () => {
    let n = 0
    let chiamata = false
    await sf.giornaliero({
      prova: async () => { chiamata = true; return { ok: true, etichetta: '' } },
      adesso: () => { if (n++ === 0) throw new Error('rotto'); return new Date(alle(20, 12)) }
    })
    assert.equal(chiamata, true)
    assert.equal(rigaDi('2026-09-20', 'whatsapp')!.sonda, 'ok')
  })
})

test('la riga del giorno per chi sviluppa', () => inA(() => {
  metti(giorno(19), 'note', { guai: 14, rimedio: 'permesso-disco', verdetto: 'guasto' })
  metti(giorno(19), 'calendario', { guai: 1, rimedio: 'credenziale', verdetto: 'guasto' })
  metti(giorno(19), 'posta')
  assert.equal(sf.rigaDelGiorno(giorno(19), new Date(alle(20, 12))), 'myynd · fonti · 2026-09-19: guasto · calendario (credenziale), note (permesso-disco) · 0 su 1')
  metti(giorno(18), 'posta')
  assert.equal(sf.rigaDelGiorno(giorno(18), new Date(alle(20, 12))), 'myynd · fonti · 2026-09-18: pulito · 1 fonti · 1 su 2')
}))

// — la rotta —

test('perRotta: esattamente i giorni chiesti, oggi per ultimo e provvisorio, il filtro per fonte, la sintesi di tutti', () => inA(() => {
  for (let g = 1; g <= 19; g++) { metti(giorno(g), 'posta', { documenti: 3 }); metti(giorno(g), 'desktop', { documenti: 1, verdetto: g === 15 ? 'guasto' : 'pulito', rimedio: g === 15 ? 'attendi' : null }) }
  reg({ fonte: 'posta', quando: alle(20, 9) })
  documento('oggi', 'posta', new Date(alle(20, 9)).toISOString())
  reg({ fonte: 'note', quando: alle(20, 9), esito: 'guaio', rimedio: 'permesso-disco' })
  const r = sf.perRotta(30, undefined, new Date(alle(20, 12)))
  assert.equal(r.giorni.length, 30)
  assert.equal(r.giorni.at(-1)!.giorno, '2026-09-20')
  assert.equal(r.giorni.at(-1)!.chiuso, false)
  assert.equal(r.giorni[0].giorno, '2026-08-22')
  assert.deepEqual(r.giorni[0].fonti, [])
  const oggi = r.giorni.at(-1)!
  assert.deepEqual(oggi.fonti.map(f => [f.fonte, f.verdetto, f.provvisorio, f.documenti]), [['note', 'guasto', true, 0], ['posta', 'pulito', true, 1]])
  assert.deepEqual(r.sintesi, { puliti: 18, misurati: 19, obiettivo: 29, muti: 0, dopoAggiornamento: 0, aperti: 0 })
  assert.deepEqual(r.adesso.map(e => [e.fonte, e.visibile]), [['note', true]])
  const solo = sf.perRotta(7, 'desktop', new Date(alle(20, 12)))
  assert.equal(solo.giorni.length, 7)
  assert.ok(solo.giorni.every(g => g.fonti.every(f => f.fonte === 'desktop')))
  assert.deepEqual(solo.adesso, [])
  assert.deepEqual(solo.sintesi, r.sintesi, 'la sintesi è sempre di tutte le fonti')
  // i limiti
  assert.equal(sf.perRotta(500, undefined, new Date(alle(20, 12))).giorni.length, 90)
  assert.equal(sf.perRotta(0, undefined, new Date(alle(20, 12))).giorni.length, 30)
}))
