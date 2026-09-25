// Le sezioni delle Preferenze e della Memoria (P5), sotto node.
//
//   node --test src/sezioni.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua, tradotta } = await import('./lingua.ts')
const s = await import('./sezioni.ts')

impostaLingua('it')

test('le schede delle Preferenze, in ordine, con e senza l’app e l’osservatore', () => {
  const ordine = (desktop: boolean, osservatore: boolean) =>
    s.sezioniPreferenze({ desktop, osservatore, motoreDaCollegare: false }).map(x => [x.id, x.schede.join(' ')])
  assert.deepEqual(ordine(true, true), [
    ['myynd', 'fuoco notizie autonomia osservazione tono'],
    ['intelligenza', 'motore modelli consumo'],
    ['account', 'nome lingua app accesso dati cancella']
  ])
  assert.deepEqual(ordine(true, false)[0], ['myynd', 'fuoco notizie autonomia tono'])
  // fuori dall'app: niente «L’app» e niente osservazione, anche se il server l'avesse
  for (const oss of [true, false]) {
    const x = ordine(false, oss)
    assert.deepEqual(x[0], ['myynd', 'fuoco notizie autonomia tono'])
    assert.deepEqual(x[2], ['account', 'nome lingua accesso dati cancella'])
  }
})

test('la nota dice «osservazione» solo quando la scheda c’è', () => {
  const con = s.sezioniPreferenze({ desktop: true, osservatore: true, motoreDaCollegare: false })[0]
  const senza = s.sezioniPreferenze({ desktop: true, osservatore: false, motoreDaCollegare: false })[0]
  assert.match(con.nota, /osservazione/)
  assert.doesNotMatch(senza.nota, /osservazione/)
})

test('un motore da collegare è la nota di rame; collegato, la nota è neutra', () => {
  const da = s.sezioniPreferenze({ desktop: true, osservatore: true, motoreDaCollegare: true })[1]
  assert.equal(da.nota, 'Motore da collegare'); assert.equal(da.notaRame, true)
  const ok = s.sezioniPreferenze({ desktop: true, osservatore: true, motoreDaCollegare: false })[1]
  assert.equal(ok.notaRame, false)
})

test('nessuna nota ripete il titolo della sezione o di una scheda, e ogni titolo è nel dizionario', () => {
  const titoliSchede = ['Fuoco', 'Notizie', 'Autonomia', 'Osservazione', 'Tono', 'Motore', 'Un modello per ogni lavoro', 'Consumo',
    'Nome e ruolo', 'Lingua e aspetto', 'L’app', 'Accesso', 'I tuoi dati', 'Cancella il conto']
  for (const k of titoliSchede) assert.ok(tradotta(k), `manca in inglese: ${k}`)
  const tutte = [
    ...s.sezioniPreferenze({ desktop: true, osservatore: true, motoreDaCollegare: true }),
    ...s.sezioniMemoria({ progettiAttivi: 3, ritratto: { sa: 12, daGuardare: 1 }, comeLavori: { daGuardare: 2 }, fatto: { minuti: 100 } })
  ]
  for (const x of tutte) {
    assert.ok(tradotta(x.titolo), `titolo senza inglese: ${x.titolo}`)
    assert.notEqual(x.nota, x.titolo)
    assert.ok(!titoliSchede.includes(x.nota), `la nota «${x.nota}» è il titolo di una scheda`)
  }
})

test('le note della Memoria: con zero, uno, tanti, e senza sommario', () => {
  const note = (x: Parameters<typeof s.sezioniMemoria>[0]) => s.sezioniMemoria(x).map(y => [y.id, y.nota, y.notaRame])
  assert.deepEqual(note(null), [['progetti', '', false], ['come-lavori', '', false], ['ritratto', '', false], ['fatto', '', false]])
  assert.deepEqual(note({ progettiAttivi: 0, ritratto: { sa: 0, daGuardare: 0 }, comeLavori: { daGuardare: 0 }, fatto: null }),
    [['progetti', '0 attivi', false], ['come-lavori', '', false], ['ritratto', '', false], ['fatto', '', false]])
  assert.deepEqual(note({ progettiAttivi: 1, ritratto: { sa: 1, daGuardare: 0 }, comeLavori: { daGuardare: 1 }, fatto: { minuti: 25 } }),
    [['progetti', '1 attivo', false], ['come-lavori', '1 da guardare', true], ['ritratto', '1 cosa che sa', false], ['fatto', 'Questa settimana: circa 25 minuti', false]])
  assert.deepEqual(note({ progettiAttivi: 3, ritratto: { sa: 12, daGuardare: 2 }, comeLavori: null, fatto: { minuti: 100 } }),
    [['progetti', '3 attivi', false], ['come-lavori', '', false], ['ritratto', '2 da guardare', true], ['fatto', 'Questa settimana: circa 1 ora e 40', false]])
  impostaLingua('en')
  try {
    assert.equal(s.sezioniMemoria({ progettiAttivi: 3, ritratto: { sa: 12, daGuardare: 0 }, comeLavori: null, fatto: { minuti: 100 } })[3].nota, 'This week: about 1 h 40')
    assert.equal(s.sezioniMemoria({ progettiAttivi: 3, ritratto: { sa: 1, daGuardare: 0 }, comeLavori: null, fatto: null })[2].nota, '1 thing it knows')
  } finally { impostaLingua('it') }
})

const MEM = ['progetti', 'come-lavori', 'ritratto', 'fatto']
const base = { pagina: 'memoria' as const, richiesta: null, biglietto: false, nuove: null, ricordata: null, valide: MEM }

test('la sezione di partenza: chiesta, poi biglietto, poi il punto, poi ricordata, poi la prima', () => {
  assert.equal(s.sezioneIniziale({ ...base, richiesta: 'fatto', biglietto: true, nuove: 'ritratto', ricordata: 'come-lavori' }), 'fatto')
  assert.equal(s.sezioneIniziale({ ...base, biglietto: true, nuove: 'ritratto', ricordata: 'come-lavori' }), 'progetti')
  assert.equal(s.sezioneIniziale({ ...base, nuove: 'ritratto', ricordata: 'come-lavori' }), 'ritratto')
  assert.equal(s.sezioneIniziale({ ...base, ricordata: 'come-lavori' }), 'come-lavori')
  assert.equal(s.sezioneIniziale(base), 'progetti')
})

test('un biglietto per un progetto batte la sezione ricordata', () => {
  assert.equal(s.sezioneIniziale({ ...base, biglietto: true, ricordata: 'ritratto' }), 'progetti')
})

test('controcaso: nelle Preferenze biglietto e punto non contano; gli id sconosciuti si saltano', () => {
  const pref = { pagina: 'pref' as const, richiesta: null, biglietto: true, nuove: 'ritratto', ricordata: null, valide: ['myynd', 'intelligenza', 'account'] }
  assert.equal(s.sezioneIniziale(pref), 'myynd')
  assert.equal(s.sezioneIniziale({ ...pref, ricordata: 'sparita' }), 'myynd')
  assert.equal(s.sezioneIniziale({ ...pref, richiesta: 'inventata', ricordata: 'account' }), 'account')
})

test('il biglietto: guardare non lo consuma, dimenticare sì, e chi ascolta lo sente', () => {
  const sentite: string[] = []
  const smetti = s.ascoltaSezione(p => sentite.push(p))
  s.chiediSezione('pref', 'myynd', 'autonomia')
  assert.deepEqual(s.sezioneAttesa('pref'), { sezione: 'myynd', scheda: 'autonomia' })
  assert.deepEqual(s.sezioneAttesa('pref'), { sezione: 'myynd', scheda: 'autonomia' })
  assert.equal(s.sezioneAttesa('memoria'), null)
  s.dimenticaSezione('pref')
  assert.equal(s.sezioneAttesa('pref'), null)
  smetti()
  s.chiediSezione('memoria', 'fatto')
  assert.deepEqual(sentite, ['pref'])
  s.dimenticaSezione('memoria')
})

test('la chiave del ricordo: diversa per due indirizzi, e mai l’indirizzo', () => {
  const a = s.chiaveRicordo('memoria', 'anna@esempio.it')
  const b = s.chiaveRicordo('memoria', 'bruno@esempio.it')
  assert.notEqual(a, b)
  assert.ok(!a.includes('@') && !a.includes('anna'))
  assert.equal(s.chiaveRicordo('memoria', 'Anna@Esempio.it '), a)
  assert.equal(s.chiaveRicordo('pref', null), 'myynd.sezione.pref.')
})

test('da dove viene: un’etichetta per origine, e nessuna per quelle sconosciute', () => {
  assert.equal(s.etichettaOrigine('esplicita', 'mano'), 'Scritta da te')
  assert.equal(s.etichettaOrigine('esplicita', 'conversazione'), 'Detta in chat')
  assert.equal(s.etichettaOrigine('indotta', 'conversazione'), 'Da una chat')
  assert.equal(s.etichettaOrigine('dedotta', 'correzione'), 'Da una bozza corretta')
  assert.equal(s.etichettaOrigine('indotta', 'chiusura'), 'Da un’attività chiusa')
  assert.equal(s.etichettaOrigine('indotta', 'abbandono'), 'Da un’attività lasciata')
  assert.equal(s.etichettaOrigine('indotta', 'scarti'), 'Da quello che scarti')
  assert.equal(s.etichettaOrigine('esplicita', 'domanda'), 'Da una tua risposta')
  assert.equal(s.etichettaOrigine('esplicita', 'onboarding'), 'Dal primo avvio')
  assert.equal(s.etichettaOrigine('indotta', 'inventata'), null)
})

test('la fiducia a parole: «forse» sotto lo 0,8, niente da lì in su', () => {
  assert.equal(s.fiduciaInParole(0.8), null)
  assert.equal(s.fiduciaInParole(0.95), null)
  assert.equal(s.fiduciaInParole(0.79), 'forse')
})
