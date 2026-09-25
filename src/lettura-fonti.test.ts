// Più fonti lette insieme, una riga per fonte.
//
// Il filo della lettura arriva mescolato: il Mac, poi le sue cartelle di
// lavoro, poi l'agenda, poi una fonte che non risponde. Queste prove tengono
// ferme le cose che una persona vede: ogni fonte collegata ha la sua riga, il
// verde arriva solo quando quella fonte ha finito, e una fonte che non si
// legge dice perché senza fermare le altre.
//
//   node --test src/lettura-fonti.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { document: unknown }).document = { documentElement: { lang: '' } }
const { impostaLingua } = await import('./lingua.ts')
const { avanzaLettura, chiudiLettura, creaLettura, daGuardare, dettaglioSincronizzazione, iniziaLettura, leggiAlProprioTurno, leggiPoiScegli, nonLette, GIA_IN_CORSO } = await import('./lettura-fonti.ts')
impostaLingua('en')

test('each connected source gets its own row, in the order given, once', () => {
  const r = iniziaLettura(['desktop', 'calendario', 'desktop', 'notion'])
  assert.deepEqual(r.map(x => [x.id, x.stato]), [['desktop', 'attesa'], ['calendario', 'attesa'], ['notion', 'attesa']])
})

test('a mixed stream becomes one row per source, and green comes only when that source is done', () => {
  let r = iniziaLettura(['desktop', 'calendario', 'notion', 'whatsapp'])
  const filo: Record<string, unknown>[] = [
    { fase: 'desktop', stato: 'apro le cartelle' },
    { fase: 'desktop', stato: '3 documenti', fatti: 3 },
    // le cartelle di lavoro finiscono prima del Mac: il Mac non deve diventare verde
    { fase: 'lavoro', stato: 'fatto', documenti: 2 },
    { fase: 'x', stato: 'fatto', documenti: 40 },
    { fase: 'desktop', stato: 'fatto', documenti: 5, tolti: 1 },
    { fase: 'notion', stato: 'guaio', errore: 'Il token di Notion non è valido.' },
    { fase: 'calendario', stato: 'apro l’agenda' }
  ]
  const visti: string[] = []
  for (const m of filo) {
    r = avanzaLettura(r, m)
    visti.push(r.find(x => x.id === 'desktop')!.stato)
  }
  assert.deepEqual(visti.slice(0, 4), ['leggo', 'leggo', 'leggo', 'leggo'])
  assert.equal(r.find(x => x.id === 'desktop')!.stato, 'fatto')
  assert.equal(r.find(x => x.id === 'desktop')!.testo, '5 files · 1 gone')
  assert.equal(r.find(x => x.id === 'calendario')!.stato, 'leggo', 'a source that failed before it does not stop it')
  assert.equal(r.find(x => x.id === 'notion')!.stato, 'guaio')
  assert.ok(r.every(x => x.id !== 'x'), 'a phase without a card adds no row')
  assert.equal(nonLette(r), 1)

  r = avanzaLettura(r, { fase: 'calendario', stato: 'fatto', documenti: 1 })
  assert.equal(r.find(x => x.id === 'calendario')!.testo, '1 event')
  // WhatsApp non manda niente: alla fine è letta, con i documenti che ha
  r = chiudiLettura(r, id => id === 'whatsapp' ? 12 : undefined)
  assert.deepEqual(r.map(x => [x.id, x.stato, x.testo]), [
    ['desktop', 'fatto', '5 files · 1 gone'],
    ['calendario', 'fatto', '1 event'],
    ['notion', 'guaio', 'Il token di Notion non è valido.'],
    ['whatsapp', 'fatto', '12 conversations']
  ])
})

test('the detail is the old progress line without the source name in front', () => {
  assert.equal(dettaglioSincronizzazione({ fase: 'posta', stato: 'x', fatti: 40, tot: 120 }), '40 of 120 messages')
  assert.equal(dettaglioSincronizzazione({ fase: 'posta', stato: 'fatto', documenti: 7, giaLetti: 30 }), '7 emails · 30 already read')
  impostaLingua('it')
  assert.equal(dettaglioSincronizzazione({ fase: 'desktop', stato: 'fatto', documenti: 1 }), '1 file')
  impostaLingua('en')
})

test('a reading already running is waited for, anything else is reported at once', async () => {
  let volte = 0
  const attese: number[] = []
  await leggiAlProprioTurno(async () => { if (++volte < 3) throw new Error(GIA_IN_CORSO) }, async ms => { attese.push(ms) })
  assert.equal(volte, 3)
  assert.equal(attese.length, 2)

  volte = 0
  await assert.rejects(leggiAlProprioTurno(async () => { volte++; throw new Error('Lettura interrotta.') }, async () => {}), /interrotta/)
  assert.equal(volte, 1)

  volte = 0
  await assert.rejects(leggiAlProprioTurno(async () => { volte++; throw new Error(GIA_IN_CORSO) }, async () => {}, 4), /già in corso/)
  assert.equal(volte, 5, 'it gives up after its limit instead of waiting forever')
})

test('behind the rest of the first read (409 with coda) a reading waits longer, and still not forever', async () => {
  const dalResto = () => Object.assign(new Error(GIA_IN_CORSO), { coda: true })
  // il resto tiene la serratura per più dei due minuti soliti (qui: 10 tentativi su 4), poi la molla
  let volte = 0
  await leggiAlProprioTurno(async () => { if (++volte <= 10) throw dalResto() }, async () => {}, 4, 20)
  assert.equal(volte, 11)
  // counter-case: un'altra lettura (senza coda) si aspetta solo il tetto solito
  volte = 0
  await assert.rejects(leggiAlProprioTurno(async () => { if (++volte <= 10) throw new Error(GIA_IN_CORSO) }, async () => {}, 4, 20), /già in corso/)
  assert.equal(volte, 5)
  // e anche dietro al resto c'è un tetto
  volte = 0
  await assert.rejects(leggiAlProprioTurno(async () => { volte++; throw dalResto() }, async () => {}, 4, 20), /già in corso/)
  assert.equal(volte, 21)
})

/*
 * Una cartella del Mac sparita o chiusa non è un successo.
 *
 * «✓ 0 documents · 1 folders without permission», in verde, e l'avvio che
 * passava da solo agli estratti: la revisione l'ha trovato togliendo la
 * cartella di prova. Zero documenti con una cartella che non si apre è una
 * fonte non letta; qualche documento con una cartella chiusa è letta a metà,
 * e nemmeno quella lascia andare avanti da soli.
 */
test('a Mac folder that cannot be opened is a problem row, never a green one', () => {
  let r = iniziaLettura(['desktop', 'calendario'])
  r = avanzaLettura(r, { fase: 'desktop', stato: 'fatto', documenti: 0, illeggibili: ['/Users/x/Lavoro'] })
  assert.equal(r[0].stato, 'guaio')
  assert.equal(r[0].testo, '1 folder would not open', 'no «0 documents» in front of the reason')
  r = avanzaLettura(r, { fase: 'calendario', stato: 'fatto', documenti: 4 })
  assert.equal(nonLette(r), 1)
  assert.equal(daGuardare(r), 1)

  let parte = iniziaLettura(['desktop'])
  parte = avanzaLettura(parte, { fase: 'desktop', stato: 'fatto', documenti: 5, illeggibili: ['/Users/x/Privato'] })
  assert.equal(parte[0].stato, 'avviso', 'some documents with a closed folder is read in part')
  assert.equal(nonLette(parte), 0)
  assert.equal(daGuardare(parte), 1, 'a warning stops the automatic step forward too')

  // un conteggio di file illeggibili su un disco vero è la norma, non un avviso
  let normale = iniziaLettura(['desktop'])
  normale = avanzaLettura(normale, { fase: 'desktop', stato: 'fatto', documenti: 80, falliti: 3 })
  assert.equal(normale[0].stato, 'fatto')
})

test('a source disconnected during the read leaves the rows', () => {
  let r = iniziaLettura(['desktop', 'calendario'])
  r = avanzaLettura(r, { fase: 'calendario', stato: 'scollegata' })
  assert.deepEqual(r.map(x => x.id), ['desktop'])
})

/** Un server finto: una lettura alla volta, come il vero, che risponde 409 alla seconda. */
function serverFinto(ms = 5) {
  let attive = 0
  const chiamate: (string | undefined)[] = []
  let docs: Record<string, number> = { desktop: 3, calendario: 2 }
  return {
    chiamate,
    togli(id: string) { const { [id]: _via, ...resto } = docs; docs = resto },
    dipendenze: {
      sincronizza: async (su: (m: Record<string, unknown>) => void, fonte?: string) => {
        if (attive) throw new Error(GIA_IN_CORSO)
        attive++
        chiamate.push(fonte)
        try {
          await new Promise(r => setTimeout(r, ms))
          for (const id of Object.keys(docs)) if (!fonte || fonte === id) su({ fase: id, stato: 'fatto', documenti: docs[id] })
          su({ fase: 'fine' })
        } finally { attive-- }
      },
      collegate: async () => ({ ...docs }),
      attendi: async () => {}
    }
  }
}

/*
 * Una lettura sola per tutta l'app.
 *
 * Il pannello delle connessioni e la pagina delle Fonti leggevano ognuno per
 * conto suo: «Rileggi tutto» durante la lettura del pannello dava 409, le
 * schede restavano indietro, e un collegamento durante «Rileggi» su una
 * fonte sola andava perso.
 */
test('reads from the page and the dialog queue behind each other, never race, and none is lost', async () => {
  const server = serverFinto()
  const lettura = creaLettura(server.dipendenze)
  const visti: boolean[] = []
  lettura.ascolta(s => visti.push(s.occupato))

  const una = lettura.leggiUna('desktop')           // «Rileggi» su una fonte, dal pannello
  const tutte = lettura.leggiTutte()                 // un collegamento mentre quella gira
  const ancora = lettura.leggiTutte()                // «Rileggi tutto» dalla pagina, nello stesso momento
  assert.equal(lettura.stato().occupato, true)
  assert.equal(tutte, ancora, 'two requests to read everything while waiting are one')
  await una
  const righe = await tutte
  assert.deepEqual(server.chiamate, ['desktop', undefined], 'the single read, then one read of everything: no 409, nothing lost')
  assert.equal(lettura.stato().guaio, null)
  assert.deepEqual(righe.map(r => [r.id, r.stato]), [['desktop', 'fatto'], ['calendario', 'fatto']])
  assert.equal(lettura.stato().occupato, false)
  assert.equal(lettura.stato().finite, 2, 'whoever shows the state knows two reads ended')
  assert.equal(visti[0], true)
})

test('after waiting two minutes behind another read, rows are closed from the index, not all marked unread', async () => {
  const lettura = creaLettura({
    sincronizza: async () => { throw new Error(GIA_IN_CORSO) },
    collegate: async () => ({ desktop: 7, calendario: 1 }),
    attendi: async () => {}
  })
  const righe = await lettura.leggiTutte()
  assert.deepEqual(righe.map(r => [r.id, r.stato, r.testo]), [['desktop', 'fatto', '7 files'], ['calendario', 'fatto', '1 event']])
  assert.equal(lettura.stato().guaio, null)
})

test('after waiting in vain, a source with no documents stays queued: never «✓ 0» for a source that was not read', async () => {
  const lettura = creaLettura({
    sincronizza: async () => { throw new Error(GIA_IN_CORSO) },
    collegate: async () => ({ desktop: 7, postamac: 0 }),
    attendi: async () => {}
  })
  const righe = await lettura.leggiTutte()
  assert.deepEqual(righe.map(r => [r.id, r.stato]), [['desktop', 'fatto'], ['postamac', 'attesa']])
  assert.equal(lettura.stato().guaio, null)
})

test('a read that ran closes an empty source as a true zero (counter-case)', () => {
  const r = chiudiLettura(iniziaLettura(['postamac']), () => 0)
  assert.equal(r[0]!.stato, 'fatto')
})

test('a source disconnected while everything was read has no row at the end', async () => {
  const server = serverFinto()
  const lettura = creaLettura({ ...server.dipendenze, collegate: (() => {
    let volta = 0
    return async (): Promise<Record<string, number>> => (volta++ ? { desktop: 3 } : { desktop: 3, calendario: 2 })
  })() })
  const righe = await lettura.leggiTutte()
  assert.deepEqual(righe.map(r => r.id), ['desktop'])
})

/*
 * Le fonti dell'avvio si salvano a lettura finita, non prima.
 *
 * Salvate prima, chi ricaricava a metà lettura atterrava sugli estratti di
 * una lettura mai finita.
 */
test('the first run saves its sources only after the read ends, and not at all if it did not end', async () => {
  const ordine: string[] = []
  const lettura = creaLettura({
    sincronizza: async su => { ordine.push('legge'); su({ fase: 'desktop', stato: 'fatto', documenti: 2 }) },
    collegate: async () => ({ desktop: 2 })
  })
  const esito = await leggiPoiScegli(lettura, ['desktop'], async fonti => { ordine.push(`salva ${fonti.join()}`) })
  assert.deepEqual(ordine, ['legge', 'salva desktop'])
  assert.equal(esito.salvate, true)

  const rotta = creaLettura({
    sincronizza: async () => { throw new Error('Lettura interrotta.') },
    collegate: async () => ({ desktop: 2 })
  })
  let salvato = false
  const fallito = await leggiPoiScegli(rotta, ['desktop'], async () => { salvato = true })
  assert.equal(salvato, false, 'an interrupted read saves nothing')
  assert.equal(fallito.salvate, false)
  assert.equal(fallito.righe[0].stato, 'guaio')
})

test('a source that did not change still says how many documents it has', () => {
  let r = iniziaLettura(['desktop', 'posta'])
  r = avanzaLettura(r, { fase: 'desktop', stato: 'fatto', documenti: 0, invariati: 5 })
  r = avanzaLettura(r, { fase: 'posta', stato: 'fatto', documenti: 2, giaLetti: 30, tolti: 1 })
  assert.deepEqual(r.map(x => x.testo), ['5 files', '32 emails · 1 gone'], 'while reading: what was seen, unchanged included')
  r = chiudiLettura(r, id => ({ desktop: 5, posta: 32 } as Record<string, number>)[id])
  assert.deepEqual(r.map(x => x.testo), ['5 files', '32 emails · 1 gone'])
})

// — P4: i conti con il loro nome, le righe corte del primo avvio, e la lettura a cui ci si attacca —

test('rows say what they counted: emails, events, files, never documents for mail', () => {
  let r = iniziaLettura(['posta', 'postamac', 'agendamac', 'desktop', 'notion', 'slack'])
  r = avanzaLettura(r, { fase: 'posta', stato: 'fatto', documenti: 60 })
  r = avanzaLettura(r, { fase: 'postamac', stato: 'fatto', documenti: 1 })
  r = avanzaLettura(r, { fase: 'agendamac', stato: 'fatto', documenti: 42 })
  r = avanzaLettura(r, { fase: 'desktop', stato: 'leggo', fatti: 1204 })
  r = avanzaLettura(r, { fase: 'notion', stato: 'fatto', documenti: 40 })
  r = avanzaLettura(r, { fase: 'slack', stato: 'fatto', documenti: 3 })
  assert.deepEqual(r.map(x => x.testo), ['60 emails', '1 email', '42 events', '1,204 files', '40 pages', '3 conversations'])
  impostaLingua('it')
  assert.equal(dettaglioSincronizzazione({ fase: 'desktop', stato: 'leggo', fatti: 1204 }), '1.204 file')
  assert.equal(dettaglioSincronizzazione({ fase: 'posta', stato: 'fatto', documenti: 312 }), '312 email')
  assert.equal(dettaglioSincronizzazione({ fase: 'agendamac', stato: 'fatto', documenti: 1 }), '1 evento')
  // «40 di 120 messaggi» della posta resta com'era
  assert.equal(dettaglioSincronizzazione({ fase: 'posta', stato: 'x', fatti: 40, tot: 120 }), '40 di 120 messaggi')
  impostaLingua('en')
})

test('a Calendar on this Mac read skipped while Calendar is closed says so, with its count', () => {
  assert.equal(dettaglioSincronizzazione({ fase: 'agendamac', stato: 'fatto', saltata: true, documenti: 42 }), '42 events · Paused while Calendar is closed')
})

test('short rows keep only the count, how much mail is left, and failures', () => {
  const m = { fase: 'posta', stato: 'fatto', documenti: 400, giaLetti: 0, tolti: 3, troncato: true, resto: { letti: 400, totale: 3000, aGiorno: false }, cartelleFallite: ['Archivio'] }
  assert.equal(dettaglioSincronizzazione(m), '400 emails · 3 gone · 400 of 3,000 read so far · 1 folder could not be read')
  assert.equal(dettaglioSincronizzazione(m, true, true), '400 emails · 400 of 3,000 read so far · 1 folder could not be read')
  const mac = { fase: 'desktop', stato: 'fatto', documenti: 1204, saltati: 3, saltatiPerTipo: 800, saltatiTipi: { media: 700, codice: 50, sistema: 30, altro: 20 }, illeggibili: ['/Users/x/Private'] }
  assert.equal(dettaglioSincronizzazione(mac, true, true), '1,204 files · 1 folder would not open')
  // tutta dentro: niente «è tutto dentro» nella riga corta (counter-case: la lunga lo dice)
  const tutta = { fase: 'posta', stato: 'fatto', documenti: 60, resto: { letti: 60, totale: 60, aGiorno: true } }
  assert.equal(dettaglioSincronizzazione(tutta, true, true), '60 emails')
  assert.equal(dettaglioSincronizzazione(tutta), '60 emails · all in')
})

test('the list of sources a read will visit is not a row', () => {
  let r = iniziaLettura(['posta'])
  r = avanzaLettura(r, { fase: 'inizio', fonti: ['posta'] })
  assert.deepEqual(r.map(x => [x.id, x.stato]), [['posta', 'attesa']])
})

test('attaching to a read already running: a source it does not visit gets one more read, never «✓ 0»', async () => {
  let letture = 0
  const lettura = creaLettura({
    sincronizza: async su => {
      letture++
      if (letture === 1) {
        // la lettura a cui ci si attacca è partita prima che Mail del Mac fosse collegata
        su({ fase: 'inizio', fonti: ['calendario'] })
        su({ fase: 'calendario', stato: 'fatto', documenti: 42 })
        su({ fase: 'fine', totale: 42 })
      } else {
        su({ fase: 'inizio', fonti: ['calendario', 'postamac'] })
        su({ fase: 'calendario', stato: 'fatto', documenti: 0, invariati: 42 })
        su({ fase: 'postamac', stato: 'fatto', documenti: 60 })
        su({ fase: 'fine', totale: 60 })
      }
    },
    collegate: async () => ({ calendario: 42, postamac: letture >= 2 ? 60 : 0 })
  })
  const righe = await lettura.leggiTutte(['calendario', 'postamac'])
  assert.equal(letture, 2)
  assert.deepEqual(righe.map(r => [r.id, r.stato, r.testo]), [['calendario', 'fatto', '42 events'], ['postamac', 'fatto', '60 emails']])
})

test('when the read visits every row, no second read (counter-case)', async () => {
  let letture = 0
  const lettura = creaLettura({
    sincronizza: async su => { letture++; su({ fase: 'inizio', fonti: ['calendario'] }); su({ fase: 'calendario', stato: 'fatto', documenti: 4 }) },
    collegate: async () => ({ calendario: 4 })
  })
  await lettura.leggiTutte(['calendario'])
  assert.equal(letture, 1)
})
