// Il regista dell'osservatore, guidato con finti: una fonte che emette quello
// che le si dice, un server che risponde quando glielo si dice, un orologio
// finto. Nessuna fonte vera parte, nessuno viene guardato.
//
//   node --test desktop/osservatore.test.ts

import { afterEach, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import * as oss from './osservatore.ts'
import type { OpzioniFonte } from './fronte.ts'
import type { StatoLocale } from './osservatore.ts'

const T0 = Date.parse('2026-09-24T07:00:00.000Z')
const ACCESO = { tipo: 'osservatore-stato', acceso: true, titoli: true, pausaFino: null }
const SPENTO = { tipo: 'osservatore-stato', acceso: false, titoli: false, pausaFino: null }

type Finta = { opts: OpzioniFonte; tipo: 'aiutante' | 'ripiego'; fermata: boolean; chieste: number; chiedi(): void; ferma(): void }

function scena(o: { piattaforma?: string; permesso?: boolean } = {}) {
  const mandati: any[] = []
  const cambi: StatoLocale[] = []
  const righe: string[] = []
  const fonti: Finta[] = []
  const x = { mandaOk: true, idle: 0, permesso: o.permesso ?? false }
  oss.avvia({
    manda: m => { mandati.push(structuredClone(m)); return x.mandaOk },
    creaFonte: opts => {
      const f: Finta = {
        opts, tipo: opts.ripiego ? 'ripiego' : 'aiutante', fermata: false, chieste: 0,
        chiedi() { this.chieste++ }, ferma() { this.fermata = true }
      }
      fonti.push(f)
      return f
    },
    inattivoSecondi: () => x.idle,
    permesso: () => x.permesso,
    adesso: () => Date.now(),
    mioPid: 999,
    piattaforma: o.piattaforma ?? 'darwin',
    suCambio: s => cambi.push(s),
    registra: r => righe.push(r)
  })
  const fonte = () => fonti.at(-1)!
  const emetti = (bundle: string, app: string, titolo: string | null = null, pid = 10) =>
    fonte().opts.suEvento({ bundle, app, pid, titolo, t: Date.now() })
  const sessioni = () => mandati.filter(m => m.tipo === 'osservatore').flatMap(m => m.sessioni)
  const tipi = () => mandati.map(m => m.tipo)
  return { x, mandati, cambi, righe, fonti, fonte, emetti, sessioni, tipi }
}

const avanti = (ms: number) => mock.timers.tick(ms)

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: T0 }))
afterEach(async () => { await chiudi(); mock.timers.reset() })

/** Ogni prova lascia il modulo fermo: `ferma()` con l'orologio finto va spinto. */
async function chiudi() {
  const p = oss.ferma()
  avanti(2_000)
  await p
}

test('niente parte prima di uno stato con acceso: true', () => {
  const s = scena()
  assert.equal(s.fonti.length, 0)
  assert.equal(s.cambi.at(-1)?.guarda, false)
  oss.nuovoServer()
  assert.deepEqual(s.mandati, [{ tipo: 'osservatore-chiedi' }])
  oss.daServer(SPENTO)
  assert.equal(s.fonti.length, 0)
  oss.daServer({ tipo: 'osservatore-stato', acceso: 'sì', titoli: true, pausaFino: null })
  assert.equal(s.fonti.length, 0, 'uno stato storto non accende niente')
  oss.daServer(ACCESO)
  assert.equal(s.fonti.length, 1)
  assert.equal(s.cambi.at(-1)?.guarda, true)
  assert.equal(s.fonte().opts.titoli, false, 'titoli voluti ma senza permesso: niente titoli')
})

test('acceso: false ferma la fonte e chiude la sessione', () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari', 'Doc')
  avanti(30_000)
  oss.daServer(SPENTO)
  assert.equal(s.fonti[0].fermata, true)
  assert.deepEqual(s.sessioni().map(x => [x.app, x.secondi]), [['Safari', 30]])
  assert.equal(s.cambi.at(-1)?.guarda, false)
  assert.ok(s.righe.includes('guscio · osservatore spento'))
})

test('le sessioni fatte prima della risposta di un server nuovo aspettano e partono subito dopo', () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari')
  avanti(30_000)
  oss.nuovoServer()
  s.emetti('com.microsoft.VSCode', 'Code')
  avanti(60_000)
  assert.deepEqual(s.sessioni(), [], 'il server nuovo non ha ancora risposto')
  assert.deepEqual(s.tipi(), ['osservatore-chiedi'])
  oss.daServer(ACCESO)
  assert.deepEqual(s.sessioni().map(x => x.app), ['Safari'])
  assert.deepEqual(s.tipi(), ['osservatore-chiedi', 'osservatore'])
})

test('le sessioni tenute da parte partono a pezzi di 200 al massimo, in ordine', () => {
  const s = scena({ permesso: true })
  oss.daServer(ACCESO)
  oss.nuovoServer()
  for (let i = 0; i < 250; i++) { s.emetti('com.x.app', 'X', `pagina ${i}`); avanti(11_000) }
  assert.deepEqual(s.sessioni(), [])
  oss.daServer(ACCESO)
  const pezzi = s.mandati.filter(m => m.tipo === 'osservatore').map(m => m.sessioni.length)
  assert.deepEqual(pezzi, [200, 49])
  assert.deepEqual(s.sessioni().map(x => x.titolo).slice(0, 2), ['pagina 0', 'pagina 1'])
})

test('ogni minuto le sessioni chiuse partono', () => {
  const s = scena({ permesso: true })
  oss.daServer(ACCESO)
  s.emetti('com.x.app', 'X', 'uno')
  avanti(20_000)
  s.emetti('com.x.app', 'X', 'due')
  assert.deepEqual(s.sessioni(), [])
  avanti(40_000)
  assert.deepEqual(s.sessioni().map(x => x.titolo), ['uno'])
})

test('manda falso rimette il pezzo in coda e non riprova fino allo stato dopo', () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari')
  avanti(30_000)
  s.emetti('com.microsoft.VSCode', 'Code')
  s.x.mandaOk = false
  avanti(30_000)   // il giro del minuto: manda torna falso
  const tentati = s.mandati.length
  assert.ok(tentati >= 1)
  s.x.mandaOk = true
  avanti(60_000)
  assert.equal(s.mandati.length, tentati, 'niente nuovi tentativi prima di uno stato')
  oss.daServer(ACCESO)
  const arrivate = s.mandati.slice(tentati).filter(m => m.tipo === 'osservatore').flatMap(m => m.sessioni)
  assert.deepEqual(arrivate.map(x => x.app), ['Safari', 'Code'].slice(0, arrivate.length))
  assert.equal(arrivate[0].app, 'Safari')
})

test('pausa ottimista: cambia subito, la conferma la tiene', () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari')
  avanti(20_000)
  const prima = s.cambi.length
  oss.pausa(60)
  assert.equal(s.cambi.length, prima + 1)
  assert.equal(s.cambi.at(-1)?.guarda, false)
  assert.equal(s.fonti[0].fermata, true)
  assert.deepEqual(s.mandati.at(-1), { tipo: 'osservatore-pausa', minuti: 60 })
  assert.deepEqual(s.sessioni().map(x => x.secondi), [], 'la sessione chiusa parte al giro dopo')
  // il server risponde con il suo orologio, trenta secondi avanti: vale
  oss.daServer({ ...ACCESO, pausaFino: new Date(Date.now() + 60 * 60_000 + 30_000).toISOString() })
  avanti(6_000)
  assert.equal(oss.stato().guarda, false)
  assert.equal(s.fonti.length, 1, 'in pausa nessuna fonte nuova')
  assert.ok(s.righe.some(r => r.startsWith('guscio · osservatore in pausa fino alle ')))
})

test('pausa ottimista: senza conferma entro 5 secondi torna com’era', () => {
  const s = scena()
  oss.daServer(ACCESO)
  oss.pausa()
  assert.equal(oss.stato().guarda, false)
  avanti(4_900)
  assert.equal(oss.stato().guarda, false)
  // uno stato che non c'entra (pausa non ancora vista dal server) non conferma
  oss.daServer(ACCESO)
  assert.equal(oss.stato().guarda, false)
  avanti(200)
  assert.equal(oss.stato().guarda, true)
  assert.equal(s.cambi.at(-1)?.guarda, true)
  assert.equal(s.fonti.length, 2, 'la fonte riparte')
})

test('pausa ottimista: manda falso torna indietro subito', () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.x.mandaOk = false
  oss.pausa(60)
  assert.equal(oss.stato().guarda, true)
  assert.equal(oss.stato().pausaFino, null)
  assert.deepEqual(s.cambi.slice(-2).map(c => c.guarda), [false, true])
})

test('riprendi ottimista, confermato da uno stato senza pausa', () => {
  const s = scena()
  oss.daServer({ ...ACCESO, pausaFino: new Date(Date.now() + 3_600_000).toISOString() })
  assert.equal(s.fonti.length, 0)
  oss.riprendi()
  assert.equal(oss.stato().guarda, true)
  assert.deepEqual(s.mandati.at(-1), { tipo: 'osservatore-riprendi' })
  oss.daServer(ACCESO)
  avanti(6_000)
  assert.equal(oss.stato().guarda, true)
  assert.equal(s.fonti.length, 1)
})

test('pausa e riprendi non fanno niente a osservatore spento', () => {
  const s = scena()
  oss.pausa(60)
  oss.riprendi()
  assert.deepEqual(s.mandati, [])
})

test('alla fine della pausa la fonte riparte senza messaggi', () => {
  const s = scena()
  oss.daServer({ ...ACCESO, pausaFino: new Date(Date.now() + 10 * 60_000).toISOString() })
  assert.equal(s.fonti.length, 0)
  const messaggi = s.mandati.length
  avanti(9 * 60_000)
  assert.equal(s.fonti.length, 0)
  avanti(61_000)
  assert.equal(s.fonti.length, 1)
  assert.equal(s.cambi.at(-1)?.guarda, true)
  assert.equal(s.mandati.length, messaggi)
})

test('il permesso che cambia fa ripartire la fonte con i titoli accesi e spenti', () => {
  const s = scena()
  oss.daServer(ACCESO)
  assert.equal(s.fonte().opts.titoli, false)
  s.x.permesso = true
  avanti(60_000)
  assert.equal(s.fonti.length, 2)
  assert.equal(s.fonti[0].fermata, true)
  assert.equal(s.fonte().opts.titoli, true)
  assert.equal(oss.stato().permesso, true)
  s.x.permesso = false
  assert.equal(oss.rileggiPermesso(), false)
  assert.equal(s.fonti.length, 3)
  assert.equal(s.fonte().opts.titoli, false)
  // col permesso ma senza titoli dal server: niente titoli
  s.x.permesso = true
  oss.daServer({ ...ACCESO, titoli: false })
  oss.rileggiPermesso()
  assert.equal(s.fonte().opts.titoli, false)
})

test('senza titoli, i titoli che la fonte manda si perdono', () => {
  const s = scena({ permesso: true })
  oss.daServer({ ...ACCESO, titoli: false })
  s.emetti('com.apple.Safari', 'Safari', 'Segreto di bottega')
  avanti(20_000)
  oss.daServer(SPENTO)
  assert.deepEqual(s.sessioni().map(x => x.titolo), [null])
})

test('le finestre escluse chiudono quella di prima e non compaiono mai', () => {
  const s = scena({ permesso: true })
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari', 'Doc')
  avanti(20_000)
  s.emetti('com.1password.1password', '1Password', 'Vault')
  avanti(40_000)
  s.emetti('com.google.Chrome', 'Google Chrome', 'New Tab - Google Chrome (Incognito)')
  avanti(20_000)
  s.emetti('com.x', 'Myynd', 'io', 999)
  avanti(20_000)
  oss.daServer(SPENTO)
  const fatte = s.sessioni()
  assert.deepEqual(fatte.map(x => [x.app, x.titolo, x.secondi]), [['Safari', 'Doc', 20], ['Google Chrome', null, 20]])
})

test('due minuti fermi chiudono la sessione all’ultimo gesto, e si riapre al ritorno', () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari')
  avanti(285_000)
  s.x.idle = 135   // al giro dei 300 s: fermo da 135 s, cioè da 165
  avanti(15_000)
  s.x.idle = 150
  avanti(15_000)
  s.x.idle = 2
  avanti(15_000)   // di ritorno a 330 s
  avanti(40_000)
  oss.daServer(SPENTO)
  const fatte = s.sessioni()
  assert.equal(fatte[0].secondi, 165)
  assert.equal(fatte[1].inizio, new Date(T0 + 330_000).toISOString())
  assert.equal(fatte[1].secondi, 40)
})

test('un evento mentre la persona è ferma non apre una sessione, ma è quella che riparte', () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari')
  avanti(30_000)
  s.x.idle = 200
  avanti(15_000)
  s.emetti('com.apple.mail', 'Mail')
  avanti(120_000)
  s.x.idle = 0
  avanti(15_000)
  avanti(30_000)
  oss.daServer(SPENTO)
  assert.deepEqual(s.sessioni().map(x => x.app), ['Mail'], 'Safari era sotto i dieci secondi prima dell’inattività')
})

test('blocco e sonno chiudono adesso; al ritorno si riapre e si chiede chi c’è davanti', () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari')
  avanti(40_000)
  oss.bloccato()
  assert.deepEqual(s.sessioni().map(x => x.secondi), [40], 'chiusa e mandata subito')
  s.emetti('com.apple.Safari', 'Safari')
  avanti(600_000)
  oss.sbloccato()
  assert.equal(s.fonte().chieste, 1)
  avanti(20_000)
  oss.dorme()
  avanti(3_600_000)
  oss.sveglio()
  avanti(15_000)
  oss.daServer(SPENTO)
  assert.deepEqual(s.sessioni().map(x => x.secondi), [40, 20, 15])
})

test('ferma(): prima la coda, poi chiedi, e finisce alla risposta', async () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari')
  avanti(30_000)
  const p = oss.ferma()
  assert.deepEqual(s.tipi().slice(-2), ['osservatore', 'osservatore-chiedi'])
  assert.equal(s.fonti[0].fermata, true)
  let finito = false
  void p.then(() => { finito = true })
  await Promise.resolve()
  assert.equal(finito, false)
  oss.daServer(ACCESO)
  await p
  assert.equal(s.fonti.length, 1, 'uno stato dopo ferma non riaccende niente')
})

test('ferma(): senza risposta finisce dopo un secondo e mezzo', async () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari')
  avanti(30_000)
  let finito = false
  const p = oss.ferma().then(() => { finito = true })
  avanti(1_400)
  await Promise.resolve()
  assert.equal(finito, false)
  avanti(200)
  await p
  assert.equal(finito, true)
})

test('ferma(): un server appena ripartito riceve le sessioni dopo la sua risposta', async () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.emetti('com.apple.Safari', 'Safari')
  avanti(30_000)
  oss.nuovoServer()
  const p = oss.ferma()
  assert.deepEqual(s.tipi(), ['osservatore-chiedi', 'osservatore-chiedi'])
  oss.daServer(ACCESO)
  await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(s.tipi(), ['osservatore-chiedi', 'osservatore-chiedi', 'osservatore', 'osservatore-chiedi'])
  oss.daServer(ACCESO)
  await p
  assert.equal(s.sessioni()[0].secondi, 30)
})

test('il programma che cade si riavvia tre volte in dieci minuti, poi il ripiego', () => {
  const s = scena()
  oss.daServer(ACCESO)
  for (let i = 1; i <= 3; i++) {
    s.fonte().opts.suFine('uscito')
    assert.equal(s.fonti.length, i + 1)
    assert.equal(s.fonte().opts.ripiego, false)
  }
  assert.ok(s.righe.includes('guscio · aiutante uscito, lo riavvio (1/3)'))
  assert.ok(s.righe.includes('guscio · aiutante uscito, lo riavvio (3/3)'))
  s.fonte().opts.suFine('uscito')
  assert.equal(s.fonti.length, 5)
  assert.equal(s.fonte().opts.ripiego, true)
  assert.equal(s.righe.filter(r => r === 'guscio · aiutante assente: guardo solo le app').length, 1)
})

test('dopo dieci minuti i riavvii ripartono da zero', () => {
  const s = scena()
  oss.daServer(ACCESO)
  s.fonte().opts.suFine('uscito')
  s.fonte().opts.suFine('uscito')
  avanti(11 * 60_000)
  s.fonte().opts.suFine('uscito')
  s.fonte().opts.suFine('uscito')
  assert.equal(s.fonte().opts.ripiego, false)
})

test('gli eventi di una fonte vecchia non contano', () => {
  const s = scena()
  oss.daServer(ACCESO)
  const vecchia = s.fonte()
  s.fonte().opts.suFine('uscito')
  vecchia.opts.suEvento({ bundle: 'com.apple.Safari', app: 'Safari', pid: 1, titolo: null, t: Date.now() })
  avanti(30_000)
  oss.daServer(SPENTO)
  assert.deepEqual(s.sessioni(), [])
})

test('fuori dal Mac non c’è osservatore', () => {
  const s = scena({ piattaforma: 'win32' })
  oss.daServer(ACCESO)
  assert.equal(s.fonti.length, 0)
  assert.equal(oss.stato().disponibile, false)
  assert.equal(oss.stato().guarda, false)
  oss.pausa(60)
  assert.equal(s.mandati.filter(m => m.tipo === 'osservatore-pausa').length, 0)
})
