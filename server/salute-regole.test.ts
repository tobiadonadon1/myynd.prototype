// Le regole della salute delle fonti: ogni caso con il suo contrario.
//
//   node --test server/salute-regole.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as r from './salute-regole.ts'
import type { RigaGiorno } from './salute-regole.ts'

const riga = (x: Partial<RigaGiorno> = {}): RigaGiorno => ({
  giorno: '2026-09-20', fonte: 'posta', letture: 144, pulite: 144, incomplete: 0, guai: 0, fila: 0,
  documenti: 10, totale: null, sonda: null, rimedio: null, versione: '0.2.24', verdetto: null, ...x
})
const fonte = { testa: false, ripreso: true, muto: false }

test('un guaio della credenziale poi sistemato: la giornata è guasta', () => {
  assert.equal(r.verdetto(riga({ guai: 1, pulite: 143, rimedio: 'credenziale' }), fonte), 'guasto')
})

test('tre timeout ripresi: guasta; due timeout ripresi: pulita', () => {
  assert.equal(r.verdetto(riga({ guai: 3, pulite: 141, rimedio: 'attendi' }), fonte), 'guasto')
  assert.equal(r.verdetto(riga({ guai: 2, pulite: 142, rimedio: 'attendi' }), fonte), 'pulito')
  // una lettura a metà conta come un guaio
  assert.equal(r.verdetto(riga({ guai: 2, incomplete: 1, rimedio: 'attendi' }), fonte), 'guasto')
})

test('timeout alle 23:55 e lettura pulita alle 08:00: pulita; ancora giù alle 08:00: guasta', () => {
  const sera = riga({ guai: 1, fila: 1, rimedio: 'attendi' })
  assert.equal(r.verdetto(sera, { ...fonte, ripreso: true }), 'pulito')
  assert.equal(r.verdetto(sera, { ...fonte, ripreso: false }), 'guasto')
})

test('in attesa della lettura dopo: ancora aperta (null)', () => {
  assert.equal(r.verdetto(riga({ guai: 1, fila: 1, rimedio: 'attendi' }), { ...fonte, ripreso: null }), null)
  // counter-case: un giorno finito bene non aspetta niente
  assert.equal(r.verdetto(riga(), { ...fonte, ripreso: null }), 'pulito')
})

test('nessuna lettura e nessuna sonda: spenta; una sonda sola basta a misurare', () => {
  assert.equal(r.verdetto(riga({ letture: 0, pulite: 0 }), fonte), 'spento')
  assert.equal(r.verdetto(riga({ fonte: 'whatsapp', letture: 0, pulite: 0, sonda: 'ok' }), fonte), 'pulito')
})

test('un silenzio misurato fa un giorno muto, mai guasto', () => {
  assert.equal(r.verdetto(riga({ documenti: 0 }), { ...fonte, muto: true }), 'muto')
  // ma un guasto resta guasto anche se tace
  assert.equal(r.verdetto(riga({ guai: 1, rimedio: 'credenziale' }), { ...fonte, muto: true }), 'guasto')
})

test('un motore: guai → guasto, pulite → pulito, niente → spento', () => {
  const testa = { testa: true, ripreso: null, muto: false }
  assert.equal(r.verdetto(riga({ fonte: 'claude', letture: 1, pulite: 1, guai: 1, rimedio: 'accedi' }), testa), 'guasto')
  assert.equal(r.verdetto(riga({ fonte: 'claude', letture: 1, pulite: 1 }), testa), 'pulito')
  assert.equal(r.verdetto(riga({ fonte: 'claude', letture: 0, pulite: 0 }), testa), 'spento')
})

test('provvisorio: una causa che resta, tre guai o un episodio visibile fanno oggi guasto', () => {
  const o = { testa: false, episodioVisibile: false }
  assert.equal(r.provvisorio(null, o), 'spento')
  assert.equal(r.provvisorio(riga({ letture: 0, pulite: 0 }), o), 'spento')
  assert.equal(r.provvisorio(riga(), o), 'pulito')
  assert.equal(r.provvisorio(riga({ rimedio: 'permesso-disco', guai: 1 }), o), 'guasto')
  assert.equal(r.provvisorio(riga({ rimedio: 'attendi', guai: 3 }), o), 'guasto')
  assert.equal(r.provvisorio(riga({ rimedio: 'attendi', guai: 1, fila: 1 }), o), 'pulito')
  assert.equal(r.provvisorio(riga({ rimedio: 'attendi', guai: 1, fila: 1 }), { ...o, episodioVisibile: true }), 'guasto')
  assert.equal(r.provvisorio(null, { testa: true, episodioVisibile: false }), 'spento')
})

test('visibile: attendi alla seconda no, alla terza sì; permesso-disco subito', () => {
  assert.equal(r.visibile({ rimedio: 'attendi', fila: 2 }), false)
  assert.equal(r.visibile({ rimedio: 'attendi', fila: 3 }), true)
  assert.equal(r.visibile({ rimedio: 'permesso-disco', fila: 1 }), true)
  assert.equal(r.visibile({ rimedio: 'guarda', fila: 1 }), true)
})

test('contata: sette minuti dopo no, otto sì', () => {
  assert.equal(r.contata(null, 0), true)
  assert.equal(r.contata(0, 7 * 60_000), false)
  assert.equal(r.contata(0, 8 * 60_000), true)
})

test('la mediana, pari e dispari', () => {
  assert.equal(r.mediana([]), 0)
  assert.equal(r.mediana([3, 1, 2]), 2)
  assert.equal(r.mediana([4, 1, 3, 2]), 2.5)
})

const quattordici = (n: number) => Array.from({ length: 14 }, () => n)

test('silenzio degli arrivi: λ=20, un giorno vuoto no, due sì', () => {
  assert.equal(r.silenzioArrivi(quattordici(20), 1), false)
  assert.equal(r.silenzioArrivi(quattordici(20), 2), true)
})

test('silenzio degli arrivi: λ=1, tre e quattro giorni no, cinque sì', () => {
  assert.equal(r.silenzioArrivi(quattordici(1), 3), false)
  assert.equal(r.silenzioArrivi(quattordici(1), 4), false)
  assert.equal(r.silenzioArrivi(quattordici(1), 5), true)
})

test('una fonte che di solito tace non tace mai troppo; sei giorni di storia non bastano', () => {
  assert.equal(r.silenzioArrivi([0, 0, 0, 0, 0, 0, 0, 0, 3, 5], 30), false)
  assert.equal(r.silenzioArrivi([20, 20, 20, 20, 20, 20], 5), false)
  assert.equal(r.silenzioArrivi([20, 20, 20, 20, 20, 20, 20], 5), true)
})

test('il fine settimana: una casella con mediana 20 vuota sabato e domenica si segna; una con mediana 1 no', () => {
  // è per questo che il silenzio è solo un fatto sulla scheda, mai un guasto
  assert.equal(r.silenzioArrivi(quattordici(20), 2), true)
  assert.equal(r.silenzioArrivi(quattordici(1), 2), false)
})

test('silenzio dell’inventario: 0 contro 40 sì; 3 contro 1400 sì; 30 contro 40 no; 4 contro 4 no', () => {
  const sette = (n: number) => Array.from({ length: 7 }, () => n)
  assert.equal(r.silenzioInventario(0, sette(40)), true)
  assert.equal(r.silenzioInventario(3, sette(1400)), true)
  assert.equal(r.silenzioInventario(30, sette(40)), false)
  assert.equal(r.silenzioInventario(4, sette(4)), false)
  // senza abbastanza storia, o senza un totale, niente
  assert.equal(r.silenzioInventario(0, [40, 40, 40, 40]), false)
  assert.equal(r.silenzioInventario(null, sette(40)), false)
  // zero contro un solito piccolo ma non nullo
  assert.equal(r.silenzioInventario(0, sette(5)), true)
  assert.equal(r.silenzioInventario(0, sette(4)), false)
})

// — la sintesi —

/** Trenta giorni finti che finiscono il 30 settembre; `c` dice il verdetto di ogni riga per giorno. */
function mese(fonti: Record<string, { giorni: string; rimedio?: string; versioni?: string[] }>) {
  const g: { giorno: string; righe: RigaGiorno[] }[] = []
  for (let i = 0; i < 30; i++) {
    const giorno = `2026-09-${String(i + 1).padStart(2, '0')}`
    const righe: RigaGiorno[] = []
    for (const [id, f] of Object.entries(fonti)) {
      const c = f.giorni[i]
      if (!c || c === '-') continue
      const verdetto = ({ p: 'pulito', g: 'guasto', m: 'muto', s: 'spento', n: null } as const)[c as 'p']
      righe.push(riga({ giorno, fonte: id, verdetto, rimedio: c === 'g' ? (f.rimedio as never ?? 'attendi') : null, versione: f.versioni?.[i] ?? '0.2.23' }))
    }
    g.push({ giorno, righe })
  }
  return g
}
const P30 = 'p'.repeat(30)

test('trenta giorni con un guasto: 29 su 30', () => {
  const s = r.sintesi(mese({ posta: { giorni: P30 }, calendario: { giorni: 'p'.repeat(12) + 'g' + 'p'.repeat(17) } }))
  assert.deepEqual(s, { puliti: 29, misurati: 30, obiettivo: 29, muti: 0, dopoAggiornamento: 0, aperti: 0 })
})

test('un giorno spento non si misura; un giorno muto è pulito; un motore conta', () => {
  const s = r.sintesi(mese({ posta: { giorni: 'ss' + 'p'.repeat(25) + 'mmm' }, claude: { giorni: 'ss' + 'p'.repeat(27) + 'g' } }))
  assert.equal(s.misurati, 28)
  assert.equal(s.muti, 3)
  assert.equal(s.puliti, 27)
})

test('un giorno ancora da decidere è misurato, aperto, e non pulito', () => {
  const s = r.sintesi(mese({ posta: { giorni: 'p'.repeat(29) + 'n' } }))
  assert.equal(s.aperti, 1)
  assert.equal(s.misurati, 30)
  assert.equal(s.puliti, 29)
})

test('dopo un aggiornamento: il giorno guasto solo per il disco, a versione cambiata, si conta a parte; senza cambio no', () => {
  const versioni = [...Array(28).fill('0.2.23'), '0.2.24', '0.2.24']
  const s = r.sintesi(mese({ note: { giorni: 'p'.repeat(28) + 'gg', rimedio: 'permesso-disco', versioni } }))
  assert.equal(s.dopoAggiornamento, 1)
  // la stessa causa senza un cambio di versione non è colpa dell'aggiornamento
  const t = r.sintesi(mese({ note: { giorni: 'p'.repeat(28) + 'gg', rimedio: 'permesso-disco' } }))
  assert.equal(t.dopoAggiornamento, 0)
  // e un giorno guasto anche per un'altra ragione non conta
  const u = r.sintesi(mese({
    note: { giorni: 'p'.repeat(28) + 'gg', rimedio: 'permesso-disco', versioni },
    calendario: { giorni: 'p'.repeat(28) + 'gp', rimedio: 'credenziale' }
  }))
  assert.equal(u.dopoAggiornamento, 0)
})
