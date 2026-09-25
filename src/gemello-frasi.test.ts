// Le frasi del gemello, in tutte e due le lingue, senza lineette.
//
//   node --test src/gemello-frasi.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
// `impostaLingua` scrive `document.documentElement.lang`, e qui il documento non c'è
;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const g = await import('./gemello-frasi.ts')

const LINEETTE = /[—–]/
const NOME_LUNGO = 'Maria Antonietta Giuseppina Vittoria della Rovere Colonna'  // 58 + 2

const ognuna = (f: () => string) => {
  const fuori: Record<string, string> = {}
  for (const l of ['it', 'en'] as const) { impostaLingua(l); fuori[l] = f() }
  impostaLingua('en')
  return fuori
}

test('ogni riga di «Come lavori» esiste in italiano e in inglese, oggetto per primo', () => {
  const righe: { genere: string; dati: Record<string, string | number> }[] = [
    { genere: 'posta.risponde_sempre', dati: { nome: 'Nora Vance', latenzaMin: 150 } },
    { genere: 'posta.lascia', dati: { nome: 'Priya Shah' } },
    { genere: 'posta.tempo', dati: { latenzaMin: 40 } },
    { genere: 'posta.ore', dati: { da: 9, a: 12 } },
    { genere: 'agenda.sposta', dati: { ogni: 4 } },
    { genere: 'agenda.rifiuta', dati: { nome: 'Tom Brill' } },
    { genere: 'app.principale', dati: { app: 'Safari', oreGiorno: 3.5 } },
    { genere: 'app.giornata', dati: { da: 540, a: 1140 } },
    { genere: 'codice.con_agenti', dati: { cartella: 'northwind', agente: 'Claude Code' } }
  ]
  for (const r of righe) {
    const f = ognuna(() => g.rigaAbitudine({ ...r, stato: 'osservata', testoSuo: null }))
    assert.ok(f.it && f.en && f.it !== f.en, `${r.genere}: ${JSON.stringify(f)}`)
    assert.doesNotMatch(f.it, LINEETTE); assert.doesNotMatch(f.en, LINEETTE)
  }
  impostaLingua('en')
  assert.equal(g.rigaAbitudine({ genere: 'posta.risponde_sempre', dati: { nome: 'Nora Vance', latenzaMin: 150 }, stato: 'osservata', testoSuo: null }), 'You always answer Nora Vance, usually within 3 hours')
  assert.equal(g.rigaAbitudine({ genere: 'posta.lascia', dati: { nome: 'Priya Shah' }, stato: 'osservata', testoSuo: null }), "Priya Shah's mail usually goes unanswered")
  assert.equal(g.rigaAbitudine({ genere: 'app.principale', dati: { app: 'Safari', oreGiorno: 3.5 }, stato: 'osservata', testoSuo: null }), 'Safari is where you spend most time, 3.5 hours a day')
  impostaLingua('it')
  assert.equal(g.rigaAbitudine({ genere: 'app.principale', dati: { app: 'Safari', oreGiorno: 3.5 }, stato: 'osservata', testoSuo: null }), 'Safari è dove passi più tempo, 3,5 ore al giorno')
  impostaLingua('en')
})

test('una riga corretta è nelle sue parole, in qualunque lingua', () => {
  const f = ognuna(() => g.rigaAbitudine({ genere: 'posta.lascia', dati: { nome: 'Priya' }, stato: 'corretta', testoSuo: 'Priya la leggo il venerdì' }))
  assert.equal(f.it, 'Priya la leggo il venerdì'); assert.equal(f.en, 'Priya la leggo il venerdì')
})

test('le affermazioni al futuro, e un nome di sessanta caratteri torna intero', () => {
  impostaLingua('en')
  assert.equal(g.rigaPrevisione({ genere: 'posta.risponde', nome: 'Nora' }), "You'll answer Nora")
  assert.equal(g.rigaPrevisione({ genere: 'posta.non_risponde', nome: 'Priya' }), "You won't answer Priya")
  assert.equal(g.rigaPrevisione({ genere: 'progetto.del_giorno', nome: 'Northwind' }), "You'll work mostly on Northwind")
  assert.equal(g.rigaPrevisione({ genere: 'compito.chiude', nome: 'Reply to Apple' }), "You'll close: Reply to Apple")
  assert.equal(g.rigaPrevisione({ genere: 'compito.slitta', nome: 'Reply to Apple' }), "You'll put off: Reply to Apple")
  impostaLingua('it')
  assert.equal(g.rigaPrevisione({ genere: 'posta.risponde', nome: NOME_LUNGO }), `Risponderai a ${NOME_LUNGO}`)
  assert.equal(g.rigaPrevisione({ genere: 'compito.slitta', nome: 'x' }), 'Rimanderai: x')
  impostaLingua('en')
})

test('il punteggio: da venti; prima, quanto manca; con zero, niente', () => {
  impostaLingua('en')
  assert.equal(g.frasePunteggio(0, 0, 0), '')
  assert.equal(g.frasePunteggio(7, 19, 5), 'Score after 20 predictions. 19 so far.')
  assert.equal(g.frasePunteggio(16, 20, 12), 'Right 8 times in 10. Without knowing you, 6.')
  impostaLingua('it')
  assert.equal(g.frasePunteggio(16, 20, 12), 'Ci ha preso 8 volte su 10. Senza conoscerti, 6.')
  assert.equal(g.frasePunteggio(3, 7, 2), 'Il punteggio dopo 20 previsioni. Finora 7.')
  impostaLingua('en')
})

test('la durata a secchi, e le ore nella lingua', () => {
  impostaLingua('en')
  assert.equal(g.durata(10), 'an hour'); assert.equal(g.durata(60), 'an hour'); assert.equal(g.durata(61), '3 hours')
  assert.equal(g.durata(180), '3 hours'); assert.equal(g.durata(300), 'a few hours'); assert.equal(g.durata(900), 'a day'); assert.equal(g.durata(4320), '3 days')
  impostaLingua('it')
  assert.equal(g.durata(10), 'un’ora'); assert.equal(g.durata(4320), '3 giorni')
  assert.match(g.ore(9, 12), /^tra le \S+ e le \S+$/)
  impostaLingua('en')
  assert.match(g.ore(9, 12), /^between .+ and .+$/)
})

test('oggi, ieri, la fiducia e le altre righe: niente lineette, tutte e due le lingue', () => {
  const previsioni = [
    { id: '1', genere: 'posta.risponde', nome: 'a', titolo: null, esito: 'giusta' as const },
    { id: '2', genere: 'posta.risponde', nome: 'b', titolo: null, esito: 'sbagliata' as const },
    { id: '3', genere: 'compito.chiude', nome: 'c', titolo: null, esito: null }
  ]
  const tutte = [
    () => g.faseOggi({ quante: 9, sigillate: true, previsioni: [] }),
    () => g.faseOggi({ quante: 1, sigillate: true, previsioni: [] }),
    () => g.faseOggi({ quante: 3, sigillate: false, previsioni }),
    () => g.rigaIeri({ giorno: '2026-09-23', chiuso: true, giuste: 7, totale: 9, previsioni: [] }),
    () => g.rigaIeri({ giorno: '2026-09-23', chiuso: false, giuste: 0, totale: 0, previsioni: [] }),
    () => g.fraseIeri(7, 9),
    () => g.rigaFiducia({ genere: 'bozza.email', giuste: 23, totale: 25 }),
    () => g.rigaFiducia({ genere: 'bozza.documento', giuste: 9, totale: 11 }),
    () => g.rigaFiducia({ genere: 'feed.carta', giuste: 40, totale: 52 }),
    () => g.provaAbitudine({ genere: 'posta.risponde_sempre', casi: 14, su: 15 }),
    () => g.provaAbitudine({ genere: 'app.principale', casi: 23, su: null }),
    () => g.provaAbitudine({ genere: 'posta.tempo', casi: 23, su: null }),
    () => g.tutte(12), () => g.nonValgonoPiu(3), () => g.finoAl('2026-09-12T10:00:00.000Z'), () => g.inPausaFino('2026-09-24T13:10:00.000Z'),
    () => g.esempio({ quando: '2026-09-12T10:00:00.000Z', testo: 'Pilot scope' })
  ]
  for (const f of tutte) {
    const r = ognuna(f)
    assert.ok(r.it && r.en, f.toString())
    assert.doesNotMatch(r.it, LINEETTE); assert.doesNotMatch(r.en, LINEETTE)
  }
  impostaLingua('en')
  assert.equal(g.faseOggi({ quante: 9, sigillate: true, previsioni: [] }), '9 predictions today, opened tonight.')
  assert.equal(g.faseOggi({ quante: 1, sigillate: true, previsioni: [] }), '1 prediction today, opened tonight.')
  assert.equal(g.faseOggi({ quante: 3, sigillate: false, previsioni }), 'Today: 1 right, 1 wrong, 1 still open.')
  assert.equal(g.rigaIeri({ giorno: '2026-09-23', chiuso: true, giuste: 7, totale: 9, previsioni: [] }), 'Yesterday · 7 of 9')
  assert.equal(g.rigaFiducia({ genere: 'bozza.email', giuste: 23, totale: 25 }), 'Reply drafts: right 23 of 25')
  assert.equal(g.provaAbitudine({ genere: 'posta.risponde_sempre', casi: 14, su: 15 }), '14 of 15')
  assert.equal(g.provaAbitudine({ genere: 'app.principale', casi: 23, su: null }), 'over 23 days')
  assert.equal(g.tutte(12), 'All (12)')
  assert.equal(g.faseOggi({ quante: 0, sigillate: true, previsioni: [] }), '')
  impostaLingua('it')
  assert.equal(g.faseOggi({ quante: 9, sigillate: true, previsioni: [] }), 'Oggi 9 previsioni, le apro stasera.')
  assert.equal(g.faseOggi({ quante: 1, sigillate: true, previsioni: [] }), 'Oggi una previsione, la apro stasera.')
  assert.equal(g.faseOggi({ quante: 3, sigillate: false, previsioni }), 'Oggi: 1 giusta, 1 sbagliata, 1 ancora aperta.')
  assert.equal(g.rigaIeri({ giorno: '2026-09-23', chiuso: true, giuste: 7, totale: 9, previsioni: [] }), 'Ieri · 7 su 9')
  assert.equal(g.fraseIeri(7, 9), 'Ieri ci ho preso 7 volte su 9.')
  impostaLingua('en')
})
