// La salute delle fonti, detta a una persona: la riga fissa, il pannello, la
// scheda che tace, la striscia dei trenta giorni. In italiano e in inglese.
//
//   node --test src/salute-fonti.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// `impostaLingua` scrive `document.documentElement.lang`: una finta pagina, prima dell'import
;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua, t, tradotta } = await import('./lingua.ts')
const sf = await import('./salute-fonti.ts')
const { rigaDelleMancanze } = await import('./collegamenti.ts')
type Mancanza = import('./salute-fonti.ts').Mancanza
type RispostaSalute = import('./api.ts').RispostaSalute
type Stato = import('./api.ts').Stato

/** Con l'app in questa lingua, cosa dice. */
function in_<T>(l: 'it' | 'en', f: () => T): T {
  impostaLingua(l)
  try { return f() } finally { impostaLingua('en') }
}

const ADESSO = new Date(2026, 8, 24, 15, 30)
const ORA_FA = new Date(2026, 8, 24, 9, 41).toISOString()

/** Una mancanza col nome come lo mette la pagina (`nomeInFrase` nella lingua di adesso). */
function manca(id: string, rimedio: Mancanza['rimedio'], o: Partial<Mancanza> & { scheda?: string } = {}): Mancanza {
  const scheda = o.scheda ?? ({ posta: 'Posta', calendario: 'Calendario', note: 'Note', desktop: 'Il mio Mac', slack: 'Slack', github: 'GitHub', notion: 'Notion', granola: 'Granola', whatsapp: 'WhatsApp Business', dropbox: 'Dropbox' } as Record<string, string>)[id] ?? id
  return { id, nome: sf.nomeInFrase(id, scheda), motivo: 'non-disponibile', rimedio, dal: ORA_FA, dopoAggiornamento: false, ...o }
}
const BASE = { ragiona: true, testa: null, guastoLettura: null, chiedeClaude: 'CHIEDE', titoliNegati: false, dopoImpostazioni: false, puoAprire: true, puoRiavviare: true, puoAprireTitoli: true, adesso: ADESSO }
const riga = (l: 'it' | 'en', mancanze: () => Mancanza[], o: Partial<Parameters<typeof sf.rigaFonti>[0]> = {}) =>
  in_(l, () => sf.rigaFonti({ ...BASE, mancanze: mancanze(), ...o }))

test('ogni riga della tabella, in italiano e in inglese', () => {
  const casi: [() => Mancanza[], string, string, string][] = [
    [() => [manca('note', 'permesso-disco')], 'Non riesco a leggere le Note: manca l’accesso completo al disco.', 'I can’t read Notes: Full Disk Access is off.', 'impostazioni'],
    [() => [manca('desktop', 'permesso-disco', { motivo: 'incompleta' })], 'Leggo il tuo Mac solo in parte: manca l’accesso completo al disco.', 'I only read part of your Mac: Full Disk Access is off.', 'impostazioni'],
    [() => [manca('granola', 'accedi')], 'Devo accedere di nuovo a Granola.', 'I need to sign in to Granola again.', 'fonti:granola'],
    [() => [manca('posta', 'credenziale')], 'La posta non accetta più la password.', 'Your mail no longer accepts the password.', 'fonti:posta'],
    [() => [manca('calendario', 'credenziale')], 'Il calendario non risponde più a quell’indirizzo.', 'The calendar no longer answers at that address.', 'fonti:calendario'],
    [() => [manca('slack', 'credenziale')], 'Slack non accetta più il token.', 'Slack no longer accepts the token.', 'fonti:slack'],
    [() => [manca('whatsapp', 'credenziale')], 'WhatsApp Business non accetta più il token.', 'WhatsApp Business no longer accepts the token.', 'fonti:whatsapp'],
    [() => [manca('posta', 'amministratore')], 'La posta aspetta il via libera del tuo amministratore.', 'Your mail is waiting for your admin’s approval.', 'fonti:posta'],
    [() => [manca('note', 'apri-app')], 'Non trovo le Note su questo Mac.', 'I can’t find Notes on this Mac.', 'fonti:note'],
    [() => [manca('note', 'aggiorna')], 'Non so più leggere le Note: a Myynd serve un aggiornamento.', 'I no longer know how to read Notes: Myynd needs an update.', 'fonti:note'],
    [() => [manca('granola', 'attendi')], 'Non riesco a raggiungere Granola dalle 9:41.', 'I can’t reach Granola since 9:41.', 'fonti:granola'],
    [() => [manca('github', 'guarda')], 'Non riesco a leggere GitHub.', 'I can’t read GitHub.', 'fonti:github'],
    [() => [manca('slack', 'attendi', { motivo: 'incompleta' })], 'Leggo Slack solo in parte.', 'I only read part of Slack.', 'fonti:slack'],
    [() => [manca('desktop', 'guarda', { motivo: 'incompleta' })], 'Leggo il tuo Mac solo in parte.', 'I only read part of your Mac.', 'fonti:desktop'],
  ]
  for (const [m, it, en, c] of casi) {
    for (const [l, atteso] of [['it', it], ['en', en]] as const) {
      const r = riga(l, m)
      assert.ok(r, atteso)
      assert.equal(r.frase, atteso)
      const cc = r.controllo
      assert.equal(cc.tipo === 'fonti' ? `fonti:${cc.id}` : cc.tipo, c, atteso)
    }
  }
})

test('più fonti sul disco condividono «Apri Impostazioni»; più cause diverse vanno alla griglia', () => {
  const disco = riga('it', () => [manca('note', 'permesso-disco'), manca('desktop', 'permesso-disco', { motivo: 'incompleta' })])
  assert.equal(disco?.frase, 'Non riesco a leggere le Note e il tuo Mac: manca l’accesso completo al disco.')
  assert.deepEqual(disco?.controllo, { tipo: 'impostazioni' })
  const misto = riga('en', () => [manca('note', 'permesso-disco'), manca('calendario', 'credenziale'), manca('slack', 'attendi')])
  assert.equal(misto?.frase, 'I couldn’t read everything: Notes, the calendar and Slack.')
  assert.deepEqual(misto?.controllo, { tipo: 'fonti', id: null })
})

test('Anthropic uscito vince il controllo e tiene la frase delle fonti', () => {
  const r = riga('en', () => [manca('note', 'permesso-disco'), manca('calendario', 'credenziale')], { testa: { id: 'claude', rimedio: 'accedi' } })
  assert.equal(r?.frase, 'Anthropic signed out. I couldn’t read everything: Notes and the calendar.')
  assert.deepEqual(r?.controllo, { tipo: 'accedi-claude' })
  const chiave = riga('it', () => [], { testa: { id: 'openai', rimedio: 'credenziale' } })
  assert.equal(chiave?.frase, 'OpenAI non accetta più la chiave.')
  assert.deepEqual(chiave?.controllo, { tipo: 'fonti', id: 'openai' })
  // con un guaio del motore «Serve Claude» non si aggiunge
  const giu = riga('it', () => [], { ragiona: false, testa: { id: 'claude', rimedio: 'accedi' } })
  assert.equal(giu?.frase, 'Anthropic si è scollegato.')
})

test('l’aggiornamento, il giro dalle Impostazioni, il browser, i titoli', () => {
  const agg = () => [manca('note', 'permesso-disco', { dopoAggiornamento: true })]
  assert.equal(riga('en', agg)?.frase, 'Since the update I can’t read Notes: remove Myynd from Full Disk Access and add it again.')
  assert.deepEqual(riga('en', agg)?.controllo, { tipo: 'impostazioni' })
  // l'aggiornamento solo quando lo sono tutte
  assert.equal(riga('it', () => [manca('note', 'permesso-disco', { dopoAggiornamento: true }), manca('desktop', 'permesso-disco')])?.frase,
    'Non riesco a leggere le Note e il tuo Mac: manca l’accesso completo al disco.')
  const giro = riga('en', agg, { dopoImpostazioni: true })
  assert.equal(giro?.frase, 'I still can’t read Notes. If the permission is already on, reopen Myynd.')
  assert.deepEqual(giro?.controllo, { tipo: 'riapri' })
  assert.deepEqual(riga('en', agg, { dopoImpostazioni: true, puoRiavviare: false })?.controllo, { tipo: 'impostazioni' })
  // nel browser non si apre niente: si va alle Fonti, sulla scheda
  assert.deepEqual(riga('en', agg, { puoAprire: false, puoRiavviare: false })?.controllo, { tipo: 'fonti', id: 'note' })
  const titoli = riga('en', () => [], { titoliNegati: true })
  assert.equal(titoli?.frase, 'I can’t see window titles: Accessibility is off.')
  assert.deepEqual(titoli?.controllo, { tipo: 'accessibilita' })
  // un guscio che non sa aprire l'Accessibilità: si va alle Fonti, niente attesa a vuoto (counter-case)
  assert.deepEqual(riga('en', () => [], { titoliNegati: true, puoAprireTitoli: false })?.controllo, { tipo: 'fonti', id: null })
  const insieme = riga('it', agg, { titoliNegati: true })
  assert.equal(insieme?.frase, 'Dall’aggiornamento non riesco a leggere le Note: togli e rimetti Myynd in Accesso completo al disco. Non vedo i titoli delle finestre: manca il permesso di Accessibilità.')
  assert.deepEqual(insieme?.controllo, { tipo: 'impostazioni' })
})

test('senza nessun guaio di P8 la riga è quella di prima (counter-case)', () => {
  for (const l of ['it', 'en'] as const) {
    for (const [ragiona, guasto] of [[true, null], [false, null], [true, 'La lettura non è riuscita.'], [false, 'CHIEDE'], [true, 'CHIEDE'], [false, 'Rotto.']] as const) {
      const nuova = riga(l, () => [], { ragiona, guastoLettura: guasto })
      const vecchia = in_(l, () => rigaDelleMancanze({ ragiona, serveClaude: t('Serve Claude per scegliere cosa conta.'), guastoLettura: guasto, chiedeClaude: 'CHIEDE', fontiNonLette: null }))
      assert.equal(nuova?.frase ?? null, vecchia)
      if (nuova) assert.deepEqual(nuova.controllo, { tipo: 'fonti', id: null })
    }
  }
  // e nessuna riga quando va tutto bene
  assert.equal(riga('it', () => []), null)
})

test('da quando: oggi, ieri, prima, e l’elisione italiana', () => {
  const a = ADESSO
  assert.equal(in_('it', () => sf.da(new Date(2026, 8, 24, 9, 41).toISOString(), a)), 'dalle 9:41')
  assert.equal(in_('en', () => sf.da(new Date(2026, 8, 24, 9, 41).toISOString(), a)), 'since 9:41')
  assert.equal(in_('it', () => sf.da(new Date(2026, 8, 23, 21, 5).toISOString(), a)), 'da ieri alle 21:05')
  assert.equal(in_('en', () => sf.da(new Date(2026, 8, 23, 21, 5).toISOString(), a)), 'since yesterday at 21:05')
  assert.equal(in_('it', () => sf.da(new Date(2026, 8, 22, 8, 0).toISOString(), a)), 'dal 22 set')
  assert.equal(in_('en', () => sf.da(new Date(2026, 8, 22, 8, 0).toISOString(), a)), 'since Sep 22')
  const ottobre = new Date(2026, 9, 20, 10)
  assert.equal(in_('it', () => sf.da(new Date(2026, 9, 8, 7, 0).toISOString(), ottobre)), 'dall’8 ott')
  assert.equal(in_('it', () => sf.da(new Date(2026, 9, 11, 7, 0).toISOString(), ottobre)), 'dall’11 ott')
  assert.equal(in_('it', () => sf.da(new Date(2026, 9, 1, 7, 0).toISOString(), ottobre)), 'dall’1 ott')
  assert.equal(in_('en', () => sf.da(new Date(2026, 9, 8, 7, 0).toISOString(), ottobre)), 'since Oct 8')
  // il primo di gennaio, visto il due: è ieri anche a cavallo dell'anno
  assert.equal(in_('it', () => sf.da(new Date(2025, 11, 31, 23, 50).toISOString(), new Date(2026, 0, 1, 8))), 'da ieri alle 23:50')
  // l'ora elide come il giorno: all'1, all'8 e all'11; alle 13 no
  assert.equal(in_('it', () => sf.da(new Date(2026, 8, 24, 1, 5).toISOString(), a)), 'dall’1:05')
  assert.equal(in_('it', () => sf.da(new Date(2026, 8, 24, 8, 30).toISOString(), a)), 'dall’8:30')
  assert.equal(in_('it', () => sf.da(new Date(2026, 8, 24, 11, 0).toISOString(), a)), 'dall’11:00')
  assert.equal(in_('it', () => sf.da(new Date(2026, 8, 24, 13, 5).toISOString(), a)), 'dalle 13:05')
  assert.equal(in_('it', () => sf.da(new Date(2026, 8, 23, 8, 30).toISOString(), a)), 'da ieri all’8:30')
  assert.equal(in_('en', () => sf.da(new Date(2026, 8, 24, 1, 5).toISOString(), a)), 'since 1:05')
  assert.equal(in_('en', () => sf.da(new Date(2026, 8, 23, 8, 30).toISOString(), a)), 'since yesterday at 8:30')
})

test('la riga del pannello, una causa alla volta', () => {
  const ieri = new Date(2026, 8, 23, 9, 41).toISOString()
  const casi: [Mancanza, string, string][] = [
    [manca('posta', 'credenziale', { dal: ieri }), 'Da ieri alle 9:41: la password non va più.', 'Since yesterday at 9:41: the password no longer works.'],
    [manca('calendario', 'credenziale'), 'Dalle 9:41: l’indirizzo non va più.', 'Since 9:41: the address no longer works.'],
    [manca('slack', 'credenziale'), 'Dalle 9:41: il token non va più.', 'Since 9:41: the token no longer works.'],
    [manca('claude', 'credenziale', { scheda: 'Anthropic' }), 'Dalle 9:41: la chiave non va più.', 'Since 9:41: the key no longer works.'],
    [manca('note', 'permesso-disco'), 'Dalle 9:41: manca l’accesso completo al disco.', 'Since 9:41: Full Disk Access is off.'],
    [manca('note', 'permesso-disco', { dopoAggiornamento: true }), 'Dall’aggiornamento: manca l’accesso completo al disco.', 'Since the update: Full Disk Access is off.'],
    [manca('granola', 'accedi'), 'Dalle 9:41: serve un nuovo accesso.', 'Since 9:41: it needs a new sign-in.'],
    [manca('posta', 'amministratore'), 'Dalle 9:41: aspetta il via libera del tuo amministratore.', 'Since 9:41: waiting for your admin’s approval.'],
    [manca('note', 'apri-app'), 'Dalle 9:41: non si trova su questo Mac.', 'Since 9:41: not found on this Mac.'],
    [manca('note', 'aggiorna'), 'Dalle 9:41: a Myynd serve un aggiornamento.', 'Since 9:41: Myynd needs an update.'],
    [manca('granola', 'attendi'), 'Dalle 9:41: non risponde più.', 'Since 9:41: not responding.'],
    [manca('github', 'guarda'), 'Dalle 9:41: non si legge.', 'Since 9:41: it can’t be read.'],
    [manca('slack', 'attendi', { motivo: 'incompleta' }), 'Dalle 9:41: si legge solo in parte.', 'Since 9:41: only part of it can be read.'],
  ]
  for (const [m, it, en] of casi) {
    assert.equal(in_('it', () => sf.lineaPannello(m, ADESSO)), it)
    assert.equal(in_('en', () => sf.lineaPannello(m, ADESSO)), en)
  }
})

test('il silenzio sulla scheda, fonte per fonte', () => {
  const arr = (giorni: number) => ({ forma: 'arrivi' as const, giorni, n: 0 })
  const inv = (n: number) => ({ forma: 'inventario' as const, giorni: 0, n })
  assert.equal(in_('it', () => sf.lineaSilenzio('posta', arr(3))), 'Ultima mail 3 giorni fa')
  assert.equal(in_('en', () => sf.lineaSilenzio('posta', arr(3))), 'Last email 3 days ago')
  assert.equal(in_('en', () => sf.lineaSilenzio('slack', arr(4))), 'Last message 4 days ago')
  assert.equal(in_('en', () => sf.lineaSilenzio('whatsapp', arr(6))), 'Last message 6 days ago')
  assert.equal(in_('en', () => sf.lineaSilenzio('granola', arr(5))), 'Last meeting 5 days ago')
  assert.equal(in_('en', () => sf.lineaSilenzio('desktop', arr(2))), 'Last file 2 days ago')
  assert.equal(in_('en', () => sf.lineaSilenzio('github', arr(9))), 'Last arrival 9 days ago')
  assert.equal(in_('it', () => sf.lineaSilenzio('calendario', inv(0))), 'Nessun evento nell’ultima lettura')
  assert.equal(in_('en', () => sf.lineaSilenzio('calendario', inv(1))), 'Only one event in the last read')
  assert.equal(in_('en', () => sf.lineaSilenzio('calendario', inv(3))), 'Only 3 events in the last read')
  assert.equal(in_('it', () => sf.lineaSilenzio('note', inv(0))), 'Nessuna nota nell’ultima lettura')
  assert.equal(in_('it', () => sf.lineaSilenzio('note', inv(1))), 'Solo una nota nell’ultima lettura')
  assert.equal(in_('en', () => sf.lineaSilenzio('note', inv(7))), 'Only 7 notes in the last read')
  assert.equal(in_('en', () => sf.lineaSilenzio('granola', inv(0))), 'No meetings in the last read')
  assert.equal(in_('it', () => sf.lineaSilenzio('granola', inv(2))), 'Solo 2 riunioni nell’ultima lettura')
})

/** Una risposta della rotta con i verdetti dati, dal più vecchio a oggi. */
function risposta(fonte: string, verdetti: (string | null)[]): RispostaSalute {
  const oggi = new Date(2026, 8, 24, 12)
  return {
    sintesi: { puliti: 0, misurati: 0, obiettivo: 29, muti: 0, dopoAggiornamento: 0, aperti: 0 },
    adesso: [],
    giorni: verdetti.map((v, i) => {
      const d = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - (verdetti.length - 1 - i), 12)
      const giorno = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return {
        giorno, chiuso: i < verdetti.length - 1, misurato: !!v && v !== 'spento', pulito: null,
        fonti: v ? [{ fonte, verdetto: v as 'pulito', provvisorio: false, rimedio: null, letture: 1, pulite: 1, incomplete: 0, guai: 0, documenti: 0, totale: null, durata: 0, versione: null, frase: null },
          { fonte: 'altra', verdetto: 'guasto', provvisorio: false, rimedio: 'guarda', letture: 1, pulite: 0, incomplete: 0, guai: 1, documenti: 0, totale: null, durata: 0, versione: null, frase: null }] : []
      }
    })
  }
}

test('la striscia e il suo conto: il muto è verde, lo spento non si misura, oggi è l’ultima', () => {
  const r = risposta('posta', [null, 'spento', 'pulito', 'muto', 'guasto', 'pulito'])
  const c = in_('it', () => sf.striscia(r, 'posta'))
  assert.deepEqual(c.map(x => x.stato), ['spento', 'spento', 'pulito', 'pulito', 'guasto', 'pulito'])
  assert.deepEqual(c.map(x => x.oggi), [false, false, false, false, false, true])
  assert.equal(c[4].titolo, '23 set: un guaio')
  assert.equal(c[5].titolo, '24 set: senza guai')
  assert.equal(c[0].titolo, '19 set: non letta')
  assert.equal(in_('en', () => sf.striscia(r, 'posta'))[4].titolo, 'Sep 23: a problem')
  assert.equal(in_('it', () => sf.record(c)), '3 giorni su 4 senza guai')
  assert.equal(in_('en', () => sf.record(c)), '3 of 4 days without trouble')
  // l'altra fonte, guasta, non entra nel conto di questa
  assert.equal(in_('en', () => sf.record(sf.striscia(risposta('posta', ['pulito', 'guasto']), 'posta'))), 'One of 2 days without trouble')
  assert.equal(in_('it', () => sf.record(sf.striscia(risposta('posta', ['guasto', 'guasto', 'guasto']), 'posta'))), 'Nessun giorno su 3 senza guai')
  assert.equal(in_('en', () => sf.record(sf.striscia(risposta('posta', ['guasto', 'guasto', 'guasto']), 'posta'))), 'None of 3 days without trouble')
  // meno di due giorni misurati: niente riga
  assert.equal(sf.record(sf.striscia(risposta('posta', [null, 'spento', 'pulito']), 'posta')), null)
})

const statoCon = (x: Partial<Stato>) => ({ connettori: [], letturaIncompleta: [], testa: null, ...x }) as unknown as Stato

test('ripresi e nuovi: chi si riprende ed è collegato, chi è nuovo; il primo caricamento non conta (counter-case)', () => {
  const prima = sf.problemiVisibili(statoCon({ letturaIncompleta: [{ fonte: 'note', motivo: 'non-disponibile', rimedio: 'permesso-disco' }, { fonte: 'slack', motivo: 'incompleta' }], testa: { id: 'claude', rimedio: 'accedi' } }))
  assert.deepEqual([...prima], [['note', 'permesso-disco'], ['slack', 'attendi'], ['claude', 'accedi']])
  const dopo = sf.problemiVisibili(statoCon({ letturaIncompleta: [{ fonte: 'posta', motivo: 'non-disponibile', rimedio: 'credenziale' }] }))
  // Slack è stato scollegato: non «si è ripreso»
  assert.deepEqual(sf.ripresi(prima, dopo, new Set(['note', 'claude', 'posta'])), ['note', 'claude'])
  assert.deepEqual(sf.nuoviGuai(prima, dopo), ['posta'])
  assert.deepEqual(sf.nuoviGuai(null, dopo), [])
  assert.deepEqual(sf.ripresi(null, dopo, new Set(['posta'])), [])
})

test('Anthropic ancora fuori mentre lavora un altro motore non «si riprende»; rientrato sì', () => {
  const claude = (x: object) => [{ id: 'claude', nome: 'Anthropic', ...x }, { id: 'compatibile', nome: 'Modello locale', collegato: true }] as Stato['connettori']
  const prima = sf.problemiVisibili(statoCon({ testa: { id: 'claude', rimedio: 'accedi' }, connettori: claude({ collegato: false, problema: 'accedi' }) }))
  // collega un modello locale: la testa sparisce, ma il connettore dice ancora «accedi»
  const s1 = statoCon({ testa: null, connettori: claude({ collegato: false, problema: 'accedi' }) })
  assert.deepEqual(sf.ripresi(prima, sf.problemiVisibili(s1), sf.saniDi(s1)), [])
  // con una chiave che lavora al posto dell'account: collegato, ma ancora fuori
  const s2 = statoCon({ testa: null, connettori: claude({ collegato: true, problema: 'accedi' }) })
  assert.deepEqual(sf.ripresi(prima, sf.problemiVisibili(s2), sf.saniDi(s2)), [])
  // rientrato davvero
  const s3 = statoCon({ testa: null, connettori: claude({ collegato: true }) })
  assert.deepEqual(sf.ripresi(prima, sf.problemiVisibili(s3), sf.saniDi(s3)), ['claude'])
})

test('le mancanze dallo stato: il nome della scheda con l’articolo, i rimedi di ripiego', () => {
  const s = statoCon({
    connettori: [{ id: 'note', nome: 'Note' }, { id: 'desktop', nome: 'Il mio PC' }] as Stato['connettori'],
    letturaIncompleta: [{ fonte: 'note', motivo: 'non-disponibile', rimedio: 'permesso-disco', dal: ORA_FA, dopoAggiornamento: true }, { fonte: 'desktop', motivo: 'incompleta' }, { fonte: 'slack', motivo: 'non-disponibile' }]
  })
  const m = in_('it', () => sf.mancanzeDi(s))
  assert.deepEqual(m.map(x => [x.id, x.nome, x.rimedio, x.dopoAggiornamento]), [['note', 'le Note', 'permesso-disco', true], ['desktop', 'il tuo PC', 'attendi', false], ['slack', 'slack', 'guarda', false]])
})

test('nessuna frase ha una lineetta; ogni frase comincia maiuscola', () => {
  const tutte: string[] = []
  for (const l of ['it', 'en'] as const) {
    for (const r of ['permesso-disco', 'accedi', 'credenziale', 'amministratore', 'apri-app', 'aggiorna', 'attendi', 'guarda'] as const) {
      for (const id of ['posta', 'calendario', 'note', 'desktop', 'slack', 'granola']) {
        const x = riga(l, () => [manca(id, r)], { testa: { id: 'claude', rimedio: 'credenziale' }, titoliNegati: true })
        if (x) tutte.push(x.frase)
        tutte.push(in_(l, () => sf.lineaPannello(manca(id, r), ADESSO)))
      }
    }
  }
  for (const f of tutte) {
    assert.doesNotMatch(f, /[—–]/, f)
    for (const frase of f.split(/(?<=\.)\s+/)) assert.match(frase, /^[A-ZÀ-Ý]/u, frase)
  }
})

/** Il blocco P8 del dizionario, com'è scritto. */
const DIZIONARIO = readFileSync(new URL('./lingua.ts', import.meta.url), 'utf8')
const BLOCCO = DIZIONARIO.slice(DIZIONARIO.indexOf('// — P8: inizio —'), DIZIONARIO.indexOf('// — P8: fine —'))

test('ogni frase del blocco P8 ha gli stessi segnaposto in italiano e in inglese, e nessuna lineetta', () => {
  const coppie = [...BLOCCO.matchAll(/^\s*'([^']+)':\s*'([^']+)',$/gm)]
  assert.ok(coppie.length > 60, `${coppie.length}`)
  const segni = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
  for (const [, it, en] of coppie) {
    assert.equal(segni(it), segni(en), it)
    assert.doesNotMatch(en, /[—–]/, en)
    assert.doesNotMatch(it, /[—–]/, it)
  }
})

test('le chiavi riusate ci sono già, e le frasi dei connettori hanno la loro traduzione', () => {
  for (const k of ['il calendario', 'Apri Impostazioni', 'Vai alle Fonti', 'Accedi di nuovo', 'Serve l’accesso', 'Non letta', 'Collegato'])
    assert.ok(tradotta(k), k)
  const server = new URL('../server/', import.meta.url).pathname
  const file = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) file(p, out)
      else if (n.endsWith('.ts') && !n.endsWith('.test.ts')) out.push(p)
    }
    return out
  }
  for (const f of file(server)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/new GuaioFonte\('((?:[^'\\]|\\.)*)'/g)) assert.ok(tradotta(m[1]), `${f}: ${m[1]}`)
  }
})

test('i rimedi della pagina sono quelli del server', () => {
  const lista = (testo: string) => testo.match(/RIMEDI: readonly Rimedio\[\] = \[([^\]]*)\]/)?.[1].replace(/\s/g, '')
  const client = lista(readFileSync(new URL('./api.ts', import.meta.url), 'utf8'))
  const server = lista(readFileSync(new URL('../server/connettori/guaio.ts', import.meta.url), 'utf8'))
  assert.ok(client)
  assert.equal(client, server)
  const tipo = (testo: string) => testo.match(/export type Rimedio =([^\n]*(?:\n\s*\|[^\n]*)*)/)?.[1].match(/'[a-z-]+'/g)?.join(',')
  assert.equal(tipo(readFileSync(new URL('./api.ts', import.meta.url), 'utf8')), tipo(readFileSync(new URL('../server/connettori/guaio.ts', import.meta.url), 'utf8')))
})

test('la parola della scheda con un guaio', () => {
  assert.equal(in_('en', () => sf.parolaProblema('note', 'permesso-disco')), 'Needs access')
  assert.equal(in_('en', () => sf.parolaProblema('claude', 'accedi')), 'Sign in again')
  assert.equal(in_('en', () => sf.parolaProblema('granola', 'accedi')), 'Needs access')
  assert.equal(in_('en', () => sf.parolaProblema('calendario', 'credenziale')), 'Needs fixing')
  assert.equal(in_('it', () => sf.parolaProblema('posta', 'amministratore')), 'Da sistemare')
  assert.equal(in_('en', () => sf.parolaProblema('slack', 'attendi')), 'Not read')
  assert.equal(in_('en', () => sf.parolaProblema('note', 'aggiorna')), 'Not read')
})
