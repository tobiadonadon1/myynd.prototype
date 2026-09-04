// I test dell'indice.
//
// Non provano che il codice funzioni: provano che i modi in cui si rompe *in
// silenzio* restano rotti rumorosamente. Ogni caso qui sotto corrisponde a un
// guasto che non darebbe nessun errore — l'indice resterebbe aperto, l'app
// continuerebbe a rispondere, e la risposta sarebbe sbagliata.
//
//   node --test server/*.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// `import type` è cancellato in compilazione: non fa partire store.ts prima
// che $HOME sia stata spostata
import type { Documento } from './store.ts'

// Va fatto prima di importare store.ts: config.ts legge DIR da $HOME al
// caricamento del modulo, quindi la casa finta deve esistere già.
const CASA = mkdtempSync(join(tmpdir(), 'myynd-test-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const store = await import('./store.ts')
const ordine = await import('./ordine.ts')

const doc = (id: string, sopra: Partial<Documento> = {}): Documento => ({
  id,
  fonte: 'desktop',
  tipo: 'file',
  titolo: `Titolo di ${id}`,
  corpo: 'Il contenuto di prova.',
  autore: null,
  percorso: `/prova/${id}`,
  quando: '2026-01-01T00:00:00.000Z',
  gruppo: 'documenti',
  ...sopra
})

/**
 * Le due tabelle devono restare allineate: l'FTS è un indice, non un archivio.
 *
 * E non `SELECT COUNT(*) FROM ricerca`, che è quello che c'era scritto qui:
 * da quando l'indice è a contenuto esterno quella conta le righe di
 * `documenti` — cioè risponde «allineate» sempre, anche con l'indice a pezzi.
 * Un controllo che non può fallire è peggio di nessun controllo, perché uno
 * ci si fida. `documentiNellIndice()` guarda dentro l'indice vero.
 */
function conteggi() {
  const d = store.default.prepare('SELECT COUNT(*) AS n FROM documenti').get() as { n: number }
  return { documenti: d.n, ricerca: store.perProva.documentiNellIndice() }
}

before(() => store.azzeraTutto())
after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

test('salvare due volte lo stesso documento lascia una riga sola in ogni tabella', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('a')])
  store.salvaDocumenti([doc('a')])
  assert.deepEqual(conteggi(), { documenti: 1, ricerca: 1 })
})

test('aggiornare un documento rende il testo vecchio irraggiungibile', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('a', { corpo: 'il preventivo per il capannone' })])
  assert.equal(store.cerca('capannone').length, 1)

  store.salvaDocumenti([doc('a', { corpo: 'il preventivo per la tettoia' })])
  assert.equal(store.cerca('capannone').length, 0, 'il corpo vecchio è rimasto nell FTS')
  assert.equal(store.cerca('tettoia').length, 1)
  assert.deepEqual(conteggi(), { documenti: 1, ricerca: 1 })
})

test('una lettura incompleta non cancella niente', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('a'), doc('b'), doc('c')])

  // è il caso vero: una cartella su due illeggibile, quindi `completo: false`
  const tolti = store.riconcilia('desktop', { completo: false }, ['desktop:a'])
  assert.equal(tolti, 0)
  assert.equal(conteggi().documenti, 3, 'una lettura parziale ha cancellato dei documenti')
})

test('una lettura completa cancella solo quello che non ha più visto', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('a'), doc('b'), doc('c')])
  const tolti = store.riconcilia('desktop', { completo: true }, ['a', 'b'])
  assert.equal(tolti, 1)
  assert.deepEqual(conteggi(), { documenti: 2, ricerca: 2 })
})

test('la riconciliazione non esce dalle radici che ha percorso', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('dentro', { percorso: '/casa/Documenti/uno.pdf' }),
    doc('fuori', { percorso: '/casa/Scrivania/due.pdf' })
  ])
  // ho letto solo Documenti, e lì non ho più visto niente
  const tolti = store.riconcilia('desktop', { completo: true, radiciViste: ['/casa/Documenti'] }, ['altro'])
  assert.equal(tolti, 1)
  assert.ok(store.documento('fuori'), 'ha cancellato fuori dalle radici che ha letto')
})

test('svuotare una fonte lascia le due tabelle allineate', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('a'), doc('b', { fonte: 'notion' })])
  store.svuotaFonte('desktop')
  const c = conteggi()
  assert.equal(c.documenti, c.ricerca, 'FTS e documenti sono andati fuori sincrono')
  assert.equal(c.documenti, 1)
})

/*
 * L'indice a contenuto esterno, per un giro intero.
 *
 * Da quando `ricerca` non tiene più il testo ma se lo rilegge da `documenti`,
 * togliere una riga dall'indice vuol dire passargli i *vecchi* valori. Un
 * `DELETE FROM ricerca` non lo fa e non dà nessun errore: lascia i termini
 * attaccati a un rowid che non esiste più, e da lì in poi la ricerca risponde
 * con righe che non si aprono. È il difetto peggiore possibile qui dentro,
 * perché si vede solo dopo, e da fuori sembra che l'app abbia le allucinazioni.
 */
test('scritture, modifiche e cancellazioni lasciano l’indice pulito', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('a', { corpo: 'il preventivo per il capannone' }),
    doc('b', { corpo: 'la fattura del cliente Rossi' }),
    doc('c', { corpo: 'il collaudo del ponteggio' }),
    doc('d', { corpo: 'il verbale della riunione' })
  ])
  assert.deepEqual(conteggi(), { documenti: 4, ricerca: 4 })

  store.salvaDocumenti([doc('a', { corpo: 'il preventivo per la tettoia' })])
  store.scordaDocumenti(['b'])
  store.riconcilia('desktop', { completo: true }, ['a', 'c'])   // porta via la d

  assert.deepEqual(conteggi(), { documenti: 2, ricerca: 2 })
  for (const sparito of ['capannone', 'fattura', 'verbale']) {
    assert.deepEqual(store.cerca(sparito), [], `«${sparito}» è rimasto nell’indice`)
  }
  assert.deepEqual(store.cerca('tettoia').map(d => d.id), ['a'])
  assert.deepEqual(store.cerca('collaudo').map(d => d.id), ['c'])
})

test('scrivere il filo non fa rifare l’indice, e non lo rompe', () => {
  // il filo e «l'ho scritta io» arrivano dopo su email che non sono cambiate:
  // migliaia di righe alla prima lettura. Il trigger deve stare fermo, ma
  // quello che c'è nell'indice deve restare al suo posto
  store.azzeraTutto()
  const email = { fonte: 'posta', tipo: 'email', corpo: 'la fattura di settembre, da saldare' }
  store.salvaDocumenti([doc('e', email)])
  const e = store.salvaDocumenti([doc('e', { ...email, filo: 'f1', inviato: true })])
  assert.deepEqual(e, { nuovi: 0, cambiati: 0, invariati: 1 }, 'una chiave in più è passata per un arrivo')
  assert.equal(store.documento('e')!.filo, 'f1')
  assert.equal(store.cerca('fatture').length, 1, 'l’indice si è perso il documento')
  assert.deepEqual(conteggi(), { documenti: 1, ricerca: 1 })
})

test('una domanda di sola punteggiatura non fa esplodere la ricerca', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('a')])
  for (const q of ['', '   ', '???', '"', '*', '^', 'AND', 'NOT OR']) {
    assert.doesNotThrow(() => store.cerca(q), `cerca(${JSON.stringify(q)}) ha lanciato`)
  }
})

test('i jolly di LIKE non sono jolly quando li scrive l utente', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('a', { titolo: 'Contratto', corpo: 'niente di speciale' })])
  // '%' non deve diventare «qualsiasi cosa» e tirare su tutto l'indice
  assert.equal(store.cerca('%').length, 0)
  assert.equal(store.cerca('_').length, 0)
})

test('la ricerca trova il singolare quando cerchi il plurale', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('f', { titolo: 'Fattura 2026-114', corpo: 'La fattura del cliente Rossi, da saldare.' }),
    doc('x', { titolo: 'Verbale', corpo: 'Riunione di reparto, nessun allegato.' })
  ])
  assert.equal(store.cerca('fatture').length, 1, 'plurale → singolare')
  assert.equal(store.cerca('clienti').length, 1)
  assert.equal(store.cerca('FATTURE').length, 1, 'le maiuscole contano, e non dovrebbero')
})

test('le parole vanno in AND: una parola in comune non basta a farsi trovare', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('giusto', { titolo: 'Preventivo Rossi', corpo: 'preventivo per il cliente Rossi' }),
    doc('quasi', { titolo: 'Preventivo Bianchi', corpo: 'preventivo per il cliente Bianchi' })
  ])
  const trovati = store.cerca('preventivo Rossi')
  assert.equal(trovati[0].id, 'giusto', 'il documento che contiene entrambe le parole non è primo')
})

/*
 * Il ripiego della ricerca: quello che l'FTS da solo non prende.
 *
 * Qui c'era `titolo LIKE '%…%' OR corpo LIKE '%…%'`, cioè la lettura di ogni
 * corpo di ogni documento — su un indice grosso, secondi di server fermo per
 * tutti a ogni domanda che l'FTS non aveva capito. Adesso la stessa domanda si
 * fa al vocabolario dell'indice. Questi test sono la prova che il ripiego è
 * cambiato di *strada* e non di *risposte*: quello che si trovava prima si
 * deve trovare ancora, altrimenti si è tolto un costo e con lui una risposta.
 */

test('un pezzo preso in mezzo a un codice si trova ancora', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('iban', { titolo: 'Bonifico di settembre', corpo: 'Accreditare su IT60X0542811101000000123456 entro venerdì.' }),
    doc('altro', { titolo: 'Verbale', corpo: 'Riunione di reparto, nessun allegato.' })
  ])
  // per il tokenizzatore l'IBAN è una parola sola: né la radice né il prefisso
  // ci arrivano, e chi cerca ha in mano un pezzo di carta e copia quello che vede
  assert.deepEqual(store.cerca('0542811101').map(d => d.id), ['iban'])
  assert.deepEqual(store.cerca('123456').map(d => d.id), ['iban'])
})

test('la coda di una parola si trova ancora', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('f', { titolo: 'Amministrazione', corpo: 'la fattura del cliente Rossi, da saldare.' }),
    doc('x', { titolo: 'Verbale', corpo: 'Riunione di reparto.' })
  ])
  // «ttura» non è né la radice né il prefisso di «fattura»: senza ripiego, zero
  assert.deepEqual(store.cerca('ttura').map(d => d.id), ['f'])
})

test('anche il ripiego resta dentro il recinto delle fonti', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('p', { fonte: 'posta', corpo: 'Bonifico su IT60X0542811101000000123456.' }),
    doc('d', { fonte: 'desktop', corpo: 'Bonifico su IT60X0542811101000000123456.' })
  ])
  assert.deepEqual(store.cerca('0542811101', 20, ['posta']).map(d => d.id), ['p'],
    'un attrezzo che può guardare solo la posta si è portato indietro un file del disco')
})

test('un pezzo che non c’è non tira su mezzo indice', () => {
  store.azzeraTutto()
  store.salvaDocumenti([doc('a'), doc('b'), doc('c')])
  assert.deepEqual(store.cerca('zqzqzq'), [])
})

test('il ripiego non torna alle righe cancellate', () => {
  // il pezzo di parola si cerca nell'indice: se l'indice tiene i termini di un
  // documento che non c'è più, questa ricerca lo ripesca e non si apre
  store.azzeraTutto()
  store.salvaDocumenti([doc('iban', { corpo: 'IT60X0542811101000000123456' })])
  assert.equal(store.cerca('0542811101').length, 1)
  store.scordaDocumenti(['iban'])
  assert.deepEqual(store.cerca('0542811101'), [])
})

test('idFeed è stabile e rigenerare il feed non riapre quello che hai chiuso', () => {
  store.azzeraTutto()
  const voce = { tipo: 'Da leggere', titolo: 'Scadenza fornitore', testo: 'entro venerdì', doc: 'a' }
  store.salvaFeed([voce])
  const [prima] = store.elencoFeed('aperto')
  store.cambiaStatoFeed(prima.id as string, 'fatto')

  store.salvaFeed([voce])
  assert.equal(store.elencoFeed('aperto').length, 0, 'rigenerare ha riaperto una voce già chiusa')
  assert.equal(store.elencoFeed('fatto').length, 1)
})

test('azzeraTutto svuota davvero tutte le tabelle', () => {
  store.salvaDocumenti([doc('a')])
  store.salvaFeed([{ tipo: 'x', titolo: 't', testo: 'y', doc: 'a' }])
  store.creaChat('c1', 'prova')
  store.salvaMessaggio({ id: 'm1', chat: 'c1', ruolo: 'u', testo: 'ciao' })

  store.azzeraTutto()
  for (const t of ['documenti', 'ricerca', 'feed', 'messaggi', 'chat']) {
    const n = (store.default.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
    assert.equal(n, 0, `${t} non è stata svuotata`)
  }
})

// — memoria —

test('una convinzione che ne contraddice un altra non la cancella: la chiude', () => {
  store.azzeraTutto()
  const vecchia = store.ricorda({
    enunciato: 'Con Rossi non fa mai sconti.',
    ambito: 'cliente:rossi', genere: 'esplicita', fiducia: 1, origine: 'onboarding'
  })
  const nuova = store.ricorda({
    enunciato: 'Con Rossi accetta uno sconto fino al 5%.',
    ambito: 'cliente:rossi', genere: 'esplicita', fiducia: 1, origine: 'correzione',
    sostituisce: vecchia
  })

  const vive = store.convinzioni('cliente:rossi')
  assert.equal(vive.length, 1, 'ne vale ancora più di una')
  assert.equal(vive[0].id, nuova)

  // «da quando hai cambiato idea» deve restare una domanda con risposta
  const storiche = store.convinzioniStoriche()
  assert.equal(storiche.length, 1)
  assert.equal(storiche[0].id, vecchia)
  assert.ok(storiche[0].al, 'alla convinzione superata manca la data di fine')
})

test('lo stesso enunciato nello stesso ambito non si duplica', () => {
  store.azzeraTutto()
  const a = store.ricorda({ enunciato: 'Firma solo di lunedì.', ambito: 'persona', genere: 'dedotta', fiducia: .6, origine: 'conversazione' })
  const b = store.ricorda({ enunciato: 'Firma solo di lunedì.', ambito: 'persona', genere: 'dedotta', fiducia: .9, origine: 'conversazione' })
  assert.equal(a, b)
  assert.equal(store.convinzioni('persona').length, 1)
  assert.equal(store.convinzioni('persona')[0].fiducia, .9, 'la fiducia non si è aggiornata')
})

test('un blocco non può sforare il suo tetto', () => {
  store.azzeraTutto()
  store.scriviBlocco({ etichetta: 'come_decido', descrizione: 'x', valore: 'a'.repeat(5000), tetto: 700 })
  const b = store.blocchi().find(x => x.etichetta === 'come_decido')!
  assert.equal(b.valore.length, 700, 'il tetto non è stato applicato alla scrittura')
})

test('le convinzioni si possono cancellare a mano', () => {
  store.azzeraTutto()
  const id = store.ricorda({ enunciato: 'Sbagliata.', ambito: 'persona', genere: 'indotta', fiducia: .3, origine: 'conversazione' })
  store.scordaConvinzione(id)
  assert.equal(store.convinzioni('persona').length, 0)
})

test('confermare una convinzione due volte non le sposta la data', () => {
  store.azzeraTutto()
  const id = store.ricorda({
    enunciato: 'Fattura a trenta giorni.', ambito: 'azienda', genere: 'indotta', fiducia: .5, origine: 'conversazione'
  })
  assert.equal(store.convinzioni('azienda')[0].confermata, null, 'nasce già confermata da sola')

  assert.equal(store.confermaConvinzione(id), true)
  const quando = store.convinzioni('azienda')[0].confermata
  assert.ok(quando, 'confermarla non ha scritto niente')

  assert.equal(store.confermaConvinzione(id), true, 'la seconda volta ha risposto «non c’è»')
  assert.equal(store.convinzioni('azienda')[0].confermata, quando,
    'la data si è spostata: era il momento in cui qualcuno l’ha guardata, e adesso non lo è più')

  assert.equal(store.confermaConvinzione('mai-esistita'), false)
  store.chiudiConvinzione(id)
  assert.equal(store.confermaConvinzione(id), false, 'ha confermato una convinzione che non vale più')
})

test('chi vuole solo quello che è stato detto non si porta dietro le ipotesi', () => {
  store.azzeraTutto()
  const detta = store.ricorda({ enunciato: 'Non lavora il venerdì.', ambito: 'persona', genere: 'esplicita', fiducia: 1, origine: 'onboarding' })
  const dedotta = store.ricorda({ enunciato: 'Risponde di mattina.', ambito: 'persona', genere: 'dedotta', fiducia: .7, origine: 'conversazione' })
  const ipotesi = store.ricorda({ enunciato: 'Preferisce le mail corte.', ambito: 'persona', genere: 'indotta', fiducia: .4, origine: 'conversazione' })
  const guardata = store.ricorda({ enunciato: 'Firma solo di lunedì.', ambito: 'persona', genere: 'indotta', fiducia: .4, origine: 'conversazione' })
  store.confermaConvinzione(guardata)

  // la chiamata di sempre non cambia di una virgola: la schermata della
  // memoria le vuole tutte, comprese quelle da guardare — sono il lavoro da fare
  assert.equal(store.convinzioni('persona').length, 4)
  assert.equal(store.convinzioni().length, 4)

  const solide = store.convinzioni('persona', { indotteSoloSeConfermate: true }).map(c => c.id)
  assert.ok(!solide.includes(ipotesi), 'un’ipotesi che nessuno ha guardato è passata per un fatto')
  assert.deepEqual([...solide].sort(), [detta, dedotta, guardata].sort())
})

// — la mappa —

test('la mappa lega i documenti che parlano davvero della stessa cosa', () => {
  store.azzeraTutto()
  const temi: Record<string, string[]> = {
    fatture: ['fattura', 'pagamento', 'scadenza', 'importo', 'insoluto'],
    cantiere: ['cantiere', 'muratore', 'cemento', 'ponteggio', 'collaudo']
  }
  const docs: Documento[] = []
  let n = 0
  for (const [tema, parole] of Object.entries(temi)) {
    for (let i = 0; i < 20; i++) {
      docs.push(doc(`${tema}:${i}`, {
        titolo: `${tema} numero ${i}`,
        corpo: `${parole.join(' ')} pratica numero ${i} del reparto`,
        percorso: `/x/${n++}`
      }))
    }
  }
  store.salvaDocumenti(docs)

  const g = store.mappa()
  assert.equal(g.nodi.length, 40)
  assert.ok(g.archi.length > 0, 'nessun legame: la mappa sarebbe di nuovo decorativa')

  const attraverso = g.archi.filter(([i, j]) =>
    g.nodi[i].id.split(':')[0] !== g.nodi[j].id.split(':')[0]).length
  const quota = attraverso / g.archi.length
  assert.ok(quota < 0.2, `il ${Math.round(quota * 100)}% dei legami attraversa temi diversi: sono rumore`)
})

test('con la mente vuota la mappa non inventa niente', () => {
  store.azzeraTutto()
  const g = store.mappa()
  assert.deepEqual(g, { nodi: [], archi: [] })
})

// — il feed che si può indirizzare —

test('rispondere a una voce ne conserva le parole, non solo lo stato', () => {
  store.azzeraTutto()
  store.salvaFeed([{ tipo: 'Da decidere', titolo: 'Deck a metà', testo: 'Mancano le slide.', doc: 'd1' }])
  const [voce] = store.elencoFeed('aperto')

  store.cambiaStatoFeed(voce.id as string, 'fatto', "L'ho finito venerdì, il file nuovo è su Drive")
  const dopo = store.voceFeed(voce.id as string)!
  assert.equal(dopo.stato, 'fatto')
  assert.match(dopo.motivo as string, /venerdì/, 'il perché è stato buttato via')
  assert.ok(dopo.risposto, 'manca quando ha risposto')
})

test('quello a cui hai già risposto non torna nella lettura dopo', () => {
  store.azzeraTutto()
  store.salvaFeed([
    { tipo: 'x', titolo: 'Già sistemata', testo: 'a', doc: 'd1' },
    { tipo: 'x', titolo: 'Ancora aperta', testo: 'b', doc: 'd2' }
  ])
  const chiusa = store.elencoFeed('aperto').find(v => v.titolo === 'Già sistemata')!
  store.cambiaStatoFeed(chiusa.id as string, 'scartato', 'Non mi interessa')

  const visto = store.feedGiaVisto()
  assert.equal(visto.length, 1)
  assert.equal(visto[0].titolo, 'Già sistemata')
  assert.equal(visto[0].motivo, 'Non mi interessa')
})

test('cambiare stato senza motivo non cancella il motivo di prima', () => {
  store.azzeraTutto()
  store.salvaFeed([{ tipo: 'x', titolo: 'Una cosa', testo: 'a', doc: 'd1' }])
  const [voce] = store.elencoFeed('aperto')
  store.cambiaStatoFeed(voce.id as string, 'fatto', 'Mandato lunedì')
  store.cambiaStatoFeed(voce.id as string, 'aperto')   // «rimetti in cima»
  const dopo = store.voceFeed(voce.id as string)!
  assert.equal(dopo.stato, 'aperto')
  assert.equal(dopo.motivo, 'Mandato lunedì', 'ha perso quello che avevi detto')
})

test('il fuoco è uno solo e si riscrive', () => {
  store.azzeraTutto()
  store.scriviBlocco({ etichetta: 'fuoco', descrizione: 'x', valore: 'I preventivi', tetto: 400 })
  store.scriviBlocco({ etichetta: 'fuoco', descrizione: 'x', valore: 'I pagamenti', tetto: 400 })
  const trovati = store.blocchi().filter(b => b.etichetta === 'fuoco')
  assert.equal(trovati.length, 1)
  assert.equal(trovati[0].valore, 'I pagamenti')
})

// — quando è lui a chiedere —

const scarta = (titolo: string, motivo: string) => {
  store.salvaFeed([{ tipo: 'Da decidere', titolo, testo: 'x', doc: 'd:' + titolo }])
  const v = store.elencoFeed('aperto').find(x => x.titolo === titolo)!
  store.cambiaStatoFeed(v.id as string, 'scartato', motivo)
}

test('uno scarto è rumore: sotto la soglia non si chiede niente', () => {
  store.azzeraTutto()
  scarta('Rinnovo automatico Dropbox', 'Non mi interessa.')
  scarta('Rinnovo automatico Adobe', 'Non mi interessa.')
  assert.deepEqual(store.temiScartati(3), [], 'due scarti hanno già fatto scattare un segnale')
})

test('tre scarti muti sullo stesso tema sono un segnale', () => {
  store.azzeraTutto()
  for (const s2 of ['Dropbox', 'Adobe', 'Figma']) scarta(`Rinnovo automatico ${s2}`, 'Non mi interessa.')
  const temi = store.temiScartati(3)
  assert.ok(temi.length > 0, 'la ricorrenza non è stata vista')
  assert.ok(temi[0].quanti >= 3)
})

test('se il perché lo hai già scritto, non è ambiguo e non fa segnale', () => {
  store.azzeraTutto()
  for (const s2 of ['Dropbox', 'Adobe', 'Figma']) {
    scarta(`Rinnovo automatico ${s2}`, 'Li gestisce l amministrazione, non io.')
  }
  assert.deepEqual(store.temiScartati(3), [],
    'ha considerato segnale degli scarti che erano già spiegati')
})

test('sullo stesso tema non si chiede due volte, mai', () => {
  store.azzeraTutto()
  const prima = store.apriDomanda({ tema: 'rinnov', testo: 'I rinnovi li vuoi vedere?', spunto: ['a'] })
  assert.ok(prima, 'la prima domanda non si è aperta')
  const seconda = store.apriDomanda({ tema: 'rinnov', testo: 'Ancora sui rinnovi?', spunto: [] })
  assert.equal(seconda, null, 'ha riaperto lo stesso tema')
  assert.equal(store.domandaGiaFatta('rinnov'), true)
})

test('due domande ravvicinate non si annullano a vicenda', () => {
  store.azzeraTutto()
  const a = store.apriDomanda({ tema: 'uno', testo: 'Prima?', spunto: [] })
  const b = store.apriDomanda({ tema: 'due', testo: 'Seconda?', spunto: [] })
  // nello stesso millisecondo l'id nasceva identico e la seconda spariva
  assert.ok(a && b, 'una delle due è andata persa')
  assert.equal(store.domandaAperta()!.tema, 'due', 'chi legge deve vedere la più recente')
})

test('lasciarla cadere la chiude e non la ripropone', () => {
  store.azzeraTutto()
  const d = store.apriDomanda({ tema: 'x', testo: 'Domanda?', spunto: [] })!
  store.chiudiDomanda(d.id, 'ignorata', undefined, 'lasciata cadere')
  assert.equal(store.domandaAperta(), null)
  assert.equal(store.domandaGiaFatta('x'), true, 'il tema deve restare bruciato')
})

// — i compiti —

const compito = (id: string, sopra: Partial<Parameters<typeof store.scriviCompito>[0]> = {}) => {
  const quando = sopra.quando ?? 'oggi'
  store.scriviCompito({
    id, testo: `Compito ${id}`, quando,
    ordine: ordine.dopo(store.ultimoOrdine(quando)),
    ...sopra
  })
  return id
}

test('un compito nuovo va in fondo al suo secchio, non in cima', () => {
  store.azzeraTutto()
  compito('a'); compito('b'); compito('c')
  const testi = store.elencoCompiti().map(c => c.id)
  assert.deepEqual(testi, ['a', 'b', 'c'], 'l\'ordine di inserimento non è stato rispettato')
})

test('i secchi non si mescolano nell\'ordine', () => {
  store.azzeraTutto()
  compito('oggi1', { quando: 'oggi' })
  compito('poi1', { quando: 'poi' })
  compito('oggi2', { quando: 'oggi' })
  const oggi = store.elencoCompiti().filter(c => c.quando === 'oggi').map(c => c.id)
  assert.deepEqual(oggi, ['oggi1', 'oggi2'], 'una riga di un altro secchio si è messa in mezzo')
})

test('riscrivere un compito non ne annulla lo stato', () => {
  store.azzeraTutto()
  compito('a')
  store.cambiaStatoCompito('a', 'fatto', 'mandato lunedì')
  // capita alla sincronizzazione: la stessa riga riscritta da un altro
  // dispositivo non deve resuscitare una cosa già chiusa
  store.scriviCompito({ id: 'a', testo: 'Compito a', quando: 'oggi', ordine: 'n' })
  assert.equal(store.compito('a')!.stato, 'fatto', 'una riscrittura ha riaperto un compito chiuso')
  assert.equal(store.compito('a')!.esito, 'mandato lunedì', 'le sue parole sono sparite')
})

test('chiudere un compito tiene le parole, non solo l\'etichetta', () => {
  store.azzeraTutto()
  compito('a')
  store.cambiaStatoCompito('a', 'fatto', 'l\'ho mandato lunedì col listino nuovo')
  const c = store.compito('a')!
  assert.equal(c.esito, 'l\'ho mandato lunedì col listino nuovo')
  assert.ok(c.chiuso, 'manca la data di chiusura')
})

test('cambiare stato senza parole non cancella quelle di prima', () => {
  store.azzeraTutto()
  compito('a')
  store.cambiaStatoCompito('a', 'fatto', 'mandato lunedì')
  store.cambiaStatoCompito('a', 'aperto')
  assert.equal(store.compito('a')!.esito, 'mandato lunedì', 'il motivo è stato azzerato di straforo')
})

test('un compito chiuso esce dalla lista ma non dal mondo', () => {
  store.azzeraTutto()
  compito('a'); compito('b')
  store.cambiaStatoCompito('a', 'fatto', 'fatta')
  assert.deepEqual(store.elencoCompiti().map(c => c.id), ['b'], 'la chiusa è rimasta in lista')
  assert.deepEqual(store.compitiChiusi().map(c => c.id), ['a'], 'la chiusa non si ritrova più')
})

test('affidare un compito lo toglie dalle tue mani ma non dalla lista', () => {
  store.azzeraTutto()
  compito('a')
  store.affidaCompito('a', 'bozza')
  const c = store.compito('a')!
  assert.equal(c.stato, 'delegato')
  assert.ok(c.chiesto, 'manca l\'ora in cui è stato affidato')
  assert.equal(store.elencoCompiti().length, 1, 'un compito affidato è sparito dalla vista')
})

test('un guaio riapre il compito invece di lasciarlo appeso', () => {
  store.azzeraTutto()
  compito('a')
  store.affidaCompito('a', 'bozza')
  store.guaioCompito('a', 'Claude non è collegato.')
  const c = store.compito('a')!
  assert.equal(c.stato, 'aperto', 'il compito è rimasto in mano a Myynd dopo un errore')
  assert.equal(c.guaio, 'Claude non è collegato.', 'il perché non è stato tenuto')
})

test('un risultato pulisce il guaio di prima', () => {
  store.azzeraTutto()
  compito('a')
  store.affidaCompito('a', 'bozza')
  store.guaioCompito('a', 'era giù')
  store.affidaCompito('a', 'bozza')
  store.risultatoCompito('a', 'Ciao Rossi, ecco il preventivo.', [{ id: 'd1', label: '[1] Preventivo' }])
  const c = store.compito('a')!
  assert.equal(c.stato, 'pronto')
  assert.equal(c.guaio, null, 'il vecchio errore è rimasto accanto a una bozza riuscita')
  assert.deepEqual(c.fonti, [{ id: 'd1', label: '[1] Preventivo' }], 'le fonti non sono tornate indietro intere')
})

test('i compiti rimasti a metà si ritrovano', () => {
  store.azzeraTutto()
  compito('a'); compito('b')
  store.affidaCompito('a', 'bozza')
  // è quello che succede se il server muore mentre Myynd lavora
  assert.deepEqual(store.compitiAppesi().map(c => c.id), ['a'], 'un compito appeso non si ritrova all\'avvio')
})

test('azzerare la mente porta via anche i compiti', () => {
  store.azzeraTutto()
  compito('a')
  store.azzeraTutto()
  assert.equal(store.elencoCompiti().length, 0, 'i compiti sono sopravvissuti all\'azzeramento')
})

test('quello che sta in lista arriva al modello in ordine di urgenza', () => {
  store.azzeraTutto()
  compito('p', { quando: 'poi' })
  compito('o', { quando: 'oggi' })
  compito('s', { quando: 'settimana' })
  const righe = store.compitiPerIlModello()
  assert.match(righe[0], /oggi/, 'il primo che legge non è quello di oggi')
  assert.match(righe[2], /poi/, 'l\'ultimo non è quello rimandabile')
})

test('togliere un compito non lo cancella davvero', () => {
  store.azzeraTutto()
  compito('a')
  store.scordaCompito('a')
  assert.equal(store.elencoCompiti().length, 0, 'la riga tolta è rimasta in lista')
  // la pietra tombale deve restare: senza, un altro dispositivo non saprebbe
  // mai di doverla togliere e la riga tornerebbe da sola
  const riga = store.default.prepare('SELECT sparito FROM compiti WHERE id = ?').get('a') as { sparito: string } | undefined
  assert.ok(riga?.sparito, 'la riga è stata cancellata invece che segnata')
})

test('ogni scrittura fa avanzare la versione', () => {
  store.azzeraTutto()
  compito('a')
  const prima = store.compito('a')!.versione
  store.cambiaCompito('a', { testo: 'altro' })
  assert.ok(store.compito('a')!.versione > prima, 'la versione non è avanzata: la sincronizzazione non saprebbe chi ha ragione')
})

test('nessuna riga condivide la chiave d\'ordine con un\'altra', () => {
  store.azzeraTutto()
  // il giro che le faceva collidere: si chiude una riga, se ne aggiunge una
  // nuova (che si riprende la chiave liberata), poi si rimette in lista quella
  // chiusa — e adesso sono in due sulla stessa chiave
  compito('a'); compito('b')
  store.cambiaStatoCompito('b', 'fatto', 'fatta')
  compito('c')
  store.cambiaStatoCompito('b', 'aperto')
  const chiavi = store.elencoCompiti().map(c => c.ordine)
  assert.equal(new Set(chiavi).size, chiavi.length,
    `due righe hanno la stessa chiave (${chiavi.join(', ')}): da qui l'ordine lo decide SQLite`)
})

test('una bozza in ritardo non riapre un compito che hai già chiuso', () => {
  store.azzeraTutto()
  compito('a')
  store.affidaCompito('a', 'bozza')
  // mentre il modello lavora, la fai tu e la spunti
  store.cambiaStatoCompito('a', 'fatto', 'l\'ho fatta io')
  const scritto = store.risultatoCompito('a', 'una bozza in ritardo', [])
  assert.equal(scritto, false, 'ha scritto la bozza su un compito chiuso')
  assert.equal(store.compito('a')!.stato, 'fatto', 'il compito chiuso è tornato su in lista')
  assert.equal(store.compitiChiusi().length, 1, 'è sparito dalle fatte')
})

test('un guaio in ritardo non riapre un compito che hai già chiuso', () => {
  store.azzeraTutto()
  compito('a')
  store.affidaCompito('a', 'bozza')
  store.cambiaStatoCompito('a', 'lasciato', 'lascia perdere')
  assert.equal(store.guaioCompito('a', 'era giù'), false)
  assert.equal(store.compito('a')!.stato, 'lasciato')
})

test('riscrivere una riga non le porta via la nota né la posizione', () => {
  store.azzeraTutto()
  compito('a'); compito('b')
  store.cambiaCompito('a', { nota: 'il dettaglio che conta' })
  const posto = store.compito('a')!.ordine
  // è la stessa forma che manda il client quando la riga arriva da un'altra
  // parte: senza la nota, e con una chiave calcolata da capo
  store.scriviCompito({ id: 'a', testo: 'Compito a', quando: 'oggi', ordine: 'zzz' })
  assert.equal(store.compito('a')!.nota, 'il dettaglio che conta', 'la nota è stata cancellata da una riscrittura')
  assert.equal(store.compito('a')!.ordine, posto, 'la riga è stata teletrasportata in fondo')
})

test('una riga tolta e riscritta torna, invece di sparire in silenzio', () => {
  store.azzeraTutto()
  compito('a')
  store.scordaCompito('a')
  store.scriviCompito({ id: 'a', testo: 'Compito a', quando: 'oggi', ordine: 'm' })
  assert.equal(store.elencoCompiti().length, 1,
    'il server ha risposto «fatto» e la riga non compare da nessuna parte')
})

test('ogni scrittura fa avanzare la versione, anche il togliere', () => {
  store.azzeraTutto()
  const versione = () => store.compito('a')!.versione
  compito('a')
  let v = versione()
  const passi: [string, () => void][] = [
    ['cambiaCompito', () => store.cambiaCompito('a', { testo: 'altro' })],
    ['scriviCompito', () => store.scriviCompito({ id: 'a', testo: 'ancora', quando: 'oggi', ordine: 'm' })],
    ['affidaCompito', () => store.affidaCompito('a', 'bozza')],
    ['risultatoCompito', () => store.risultatoCompito('a', 'bozza', [])],
    ['cambiaStatoCompito', () => store.cambiaStatoCompito('a', 'aperto')],
    ['riordina', () => store.riordina('a', 'oggi', 'q')],
    // il tombstone è quello che sbagliava: una pietra tombale che non avanza
    // perde contro qualunque modifica fatta altrove, e la riga torna a galla
    ['scordaCompito', () => store.scordaCompito('a')]
  ]
  for (const [nome, fai] of passi) {
    fai()
    const dopo = store.compito('a')!.versione
    assert.ok(dopo > v, `${nome} non ha fatto avanzare la versione (${v} → ${dopo})`)
    v = dopo
  }
})

test('quello che il modello legge non contiene le righe chiuse o tolte', () => {
  store.azzeraTutto()
  compito('a'); compito('b'); compito('c')
  store.cambiaStatoCompito('b', 'fatto', 'fatta')
  store.scordaCompito('c')
  const righe = store.compitiPerIlModello().join(' | ')
  assert.ok(!/Compito b/.test(righe), 'una riga chiusa finisce ancora nel prompt del feed')
  assert.ok(!/Compito c/.test(righe), 'una riga tolta finisce ancora nel prompt del feed')
})

test('rimettere in lista una riga non le riattacca la bozza di prima', () => {
  store.azzeraTutto()
  compito('a')
  store.affidaCompito('a', 'bozza')
  store.risultatoCompito('a', 'la vecchia bozza', [{ id: 'd', label: '[1] x' }])
  store.cambiaStatoCompito('a', 'fatto', 'mandata')
  store.cambiaStatoCompito('a', 'aperto')
  store.sbozzaCompito('a')
  const c = store.compito('a')!
  assert.equal(c.risultato, null, 'la bozza vecchia è rimasta attaccata alla riga riaperta')
  assert.equal(c.fonti, null, 'le fonti vecchie sono rimaste')
})

test('i compiti appesi si riaprono tutti in un colpo', () => {
  store.azzeraTutto()
  compito('a'); compito('b'); compito('c')
  store.affidaCompito('a', 'bozza'); store.affidaCompito('b', 'bozza')
  const quanti = store.riapriGliAppesi('interrotto')
  assert.equal(quanti, 2, 'non li ha riaperti tutti')
  assert.equal(store.compitiAppesi().length, 0)
  assert.equal(store.compito('a')!.guaio, 'interrotto')
  assert.equal(store.compito('a')!.chiesto, null, 'resta scritto che è affidato a lui')
})

// — quello che si offre di fare —

const PROPOSTA = {
  azione: 'posta.cestina' as const,
  voci: [
    { doc: 'posta:INBOX:1', titolo: 'Novità di settembre', perche: 'Newsletter di Vinted' },
    { doc: 'posta:INBOX:2', titolo: '-30% solo oggi', perche: 'Promozione di Zalando' }
  ]
}

test('una proposta torna indietro intera, non come stringa', () => {
  // È il difetto che si nasconde meglio: la colonna è testo, e se la riga
  // tornasse senza essere aperta, `p.voci.length` sarebbe la lunghezza del JSON
  // — un numero grande e plausibile. Il bottone direbbe «mettine 214 nel
  // cestino» e nessuno saprebbe da dove viene.
  store.azzeraTutto()
  compito('a')
  store.proponi('a', PROPOSTA, '2 messaggi da mettere nel cestino.')
  const c = store.compito('a')!
  assert.equal(typeof c.proposta, 'object')
  assert.equal(c.proposta!.azione, 'posta.cestina')
  const posta = c.proposta as { azione: string; voci: { doc: string; titolo: string; perche: string }[] }
  assert.equal(posta.voci.length, 2)
  assert.equal(posta.voci[0].perche, 'Newsletter di Vinted')
})

test('proporre mette la riga pronta e le dà una frase da leggere', () => {
  store.azzeraTutto()
  compito('a')
  store.proponi('a', PROPOSTA, '2 messaggi da mettere nel cestino.')
  const c = store.compito('a')!
  assert.equal(c.stato, 'pronto', 'la riga non si è aperta da sola')
  assert.equal(c.risultato, '2 messaggi da mettere nel cestino.')
})

test('una proposta eseguita non resta lì premibile', () => {
  store.azzeraTutto()
  compito('a')
  store.proponi('a', PROPOSTA, 'due messaggi.')
  store.scordaProposta('a')
  assert.equal(store.compito('a')!.proposta, null, 'si potrebbe premere due volte')
})

test('i messaggi spostati escono anche dall’indice', () => {
  // il loro id contiene la cartella: dopo lo spostamento parla di un posto in
  // cui non sono più, e resterebbe una fonte citata che non si apre
  store.azzeraTutto()
  store.salvaDocumenti([
    doc('posta:INBOX:1', { fonte: 'posta', titolo: 'Novità' }),
    doc('posta:INBOX:2', { fonte: 'posta', titolo: 'Sconti' }),
    doc('posta:INBOX:3', { fonte: 'posta', titolo: 'Fattura 12' })
  ])
  assert.equal(store.scordaDocumenti(['posta:INBOX:1', 'posta:INBOX:2']), 2)
  assert.equal(store.documento('posta:INBOX:1'), null)
  assert.ok(store.documento('posta:INBOX:3'), 'ha tolto anche quello che non c’entrava')
  // e non deve più tornare fra i risultati di una ricerca
  assert.ok(!store.cerca('Novità', 10).some(d => d.id === 'posta:INBOX:1'), 'è rimasto nell’indice della ricerca')
})

test('scordare un documento che non c’è non è un errore', () => {
  store.azzeraTutto()
  assert.equal(store.scordaDocumenti(['posta:INBOX:99']), 0)
  assert.equal(store.scordaDocumenti([]), 0)
})

// — la posta cancellata di là —
//
// `riconcilia` cancella quello che una lettura *completa* non ha più visto, e
// una casella non si legge mai tutta: si leggono gli ultimi messaggi. Quindi
// una mail buttata via dal telefono restava qui per sempre, cercabile, e
// finiva fra le fonti che Claude cita — una risposta costruita su una mail che
// aprendola non c'è.
//
// Il permesso di cancellare è ristretto a mano, finestra per finestra. Questi
// test guardano soprattutto il verso che fa male: quello che *non* si deve
// toccare. Lasciare una riga vecchia è un difetto; cancellare la posta di
// qualcuno è un'altra cosa.

const email = (cartella: string, uid: number) =>
  doc(`posta:${cartella}:${uid}`, { fonte: 'posta', tipo: 'email', percorso: cartella })

test('la posta sparita dalla casella se ne va dall’indice', () => {
  store.azzeraTutto()
  store.salvaDocumenti([email('INBOX', 10), email('INBOX', 11), email('INBOX', 12)])
  // ho riletto INBOX dal 10 al 12 e il messaggio 11 non c'era più
  const tolti = store.riconciliaPosta(
    [{ cartella: 'INBOX', daUid: 10, aUid: 12 }],
    ['posta:INBOX:10', 'posta:INBOX:12']
  )
  assert.equal(tolti, 1)
  assert.equal(store.documento('posta:INBOX:11'), null)
  assert.deepEqual(conteggi(), { documenti: 2, ricerca: 2 }, 'l’indice si è tenuto la riga cancellata')
})

test('fuori dalla finestra letta non si tocca niente', () => {
  store.azzeraTutto()
  store.salvaDocumenti([
    email('INBOX', 10), email('INBOX', 11), email('INBOX', 40),   // 40 è fuori
    email('INBOX:2024', 11),   // una cartella che comincia uguale
    email('Inviata', 11),      // un'altra cartella
    doc('desktop:11', { fonte: 'desktop' })
  ])
  const tolti = store.riconciliaPosta([{ cartella: 'INBOX', daUid: 10, aUid: 12 }], ['posta:INBOX:10'])
  assert.equal(tolti, 1)
  assert.equal(store.documento('posta:INBOX:11'), null)
  assert.ok(store.documento('posta:INBOX:40'), 'ha cancellato un uid fuori dalla finestra letta')
  assert.ok(store.documento('posta:INBOX:2024:11'), 'una cartella che comincia uguale non è la stessa cartella')
  assert.ok(store.documento('posta:Inviata:11'), 'ha cancellato in una cartella di cui non gli era stato detto niente')
  assert.ok(store.documento('desktop:11'), 'ha cancellato un documento che non è nemmeno posta')
})

test('senza finestre, o con una al contrario, non si cancella niente', () => {
  store.azzeraTutto()
  store.salvaDocumenti([email('INBOX', 10), email('INBOX', 11)])
  assert.equal(store.riconciliaPosta([], []), 0)
  assert.equal(store.riconciliaPosta([{ cartella: 'INBOX', daUid: 12, aUid: 10 }], []), 0,
    'una finestra al contrario è stata letta come «tutto»')
  assert.equal(store.riconciliaPosta([{ cartella: '', daUid: 1, aUid: 99 }], []), 0)
  assert.equal(store.riconciliaPosta([{ cartella: 'INBOX', daUid: NaN, aUid: 99 }], []), 0)
  assert.equal(conteggi().documenti, 2)
})

test('una finestra in cui non manca niente non tocca niente', () => {
  store.azzeraTutto()
  store.salvaDocumenti([email('INBOX', 10), email('INBOX', 11)])
  const tolti = store.riconciliaPosta(
    [{ cartella: 'INBOX', daUid: 10, aUid: 11 }],
    ['posta:INBOX:10', 'posta:INBOX:11']
  )
  assert.equal(tolti, 0)
  assert.equal(conteggi().documenti, 2)
})

// — dove si era fermato un connettore —

test('il cursore di una fonte si ricorda, e non si mescola con le altre', () => {
  store.azzeraTutto()
  assert.equal(store.cursore('posta:INBOX'), null, 'una fonte mai vista ha già un paletto')
  store.segnaCursore('posta:INBOX', '812')
  store.segnaCursore('posta:Inviata', '19')
  assert.equal(store.cursore('posta:INBOX'), '812')
  assert.equal(store.cursore('posta:Inviata'), '19')

  store.segnaCursore('posta:INBOX', '900')
  assert.equal(store.cursore('posta:INBOX'), '900', 'il paletto non si è mosso')
  assert.equal(store.cursore('posta:Inviata'), '19', 'due fonti si sono pestate i piedi')

  // la casella ricreata: il vecchio paletto indica un posto che non esiste più
  store.segnaCursore('posta:INBOX', null)
  assert.equal(store.cursore('posta:INBOX'), null)
  assert.equal(store.cursore('posta:Inviata'), '19')
})

// — quello che gli serve sapere —

test('le domande a scelta stanno accanto alla bozza, non al suo posto', () => {
  // il paragrafo dice *perché* si è fermato, e le opzioni da sole non lo
  // direbbero: cancellarlo per far posto alle domande sarebbe una perdita
  store.azzeraTutto()
  compito('a')
  store.affidaCompito('a', 'bozza')
  store.risultatoCompito('a', 'Non ho trovato nessun blog.', [], 'chiede')
  store.chiediSuCompito('a', [
    { domanda: 'Di cosa parlano?', opzioni: ['Il prodotto', 'Il settore'], multipla: false }
  ])
  const c = store.compito('a')!
  assert.equal(c.risultato, 'Non ho trovato nessun blog.')
  assert.equal(c.chieste!.length, 1)
  assert.equal(c.chieste![0].opzioni.length, 2)
  assert.equal(c.stato, 'chiede')
})

test('risposto, le domande non si ripresentano', () => {
  store.azzeraTutto()
  compito('a')
  store.chiediSuCompito('a', [{ domanda: 'Quante?', opzioni: ['Tre', 'Cinque'], multipla: false }])
  store.scordaChieste('a')
  assert.equal(store.compito('a')!.chieste, null)
})

test('una riga sola nella lingua sbagliata basta a farsi notare', async () => {
  // la media andava bene per la memoria e non per la lista: una domanda
  // italiana in mezzo a nove righe inglesi faceva l'undici per cento, e il
  // controllo diceva «tutto a posto» mentre la si aveva sotto gli occhi
  const traduci = await import('./traduci.ts')
  store.azzeraTutto()
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
    compito(id)
    store.affidaCompito(id, 'bozza')
    store.risultatoCompito(id, 'Here is the draft you asked for, ready to send.', [], 'pronto')
  }
  assert.equal(traduci.compitiDaTradurre('en'), false)
  compito('z')
  store.affidaCompito('z', 'bozza')
  store.risultatoCompito('z', 'Non ho trovato nessun blog né un sito con articoli.', [], 'chiede')
  assert.equal(traduci.compitiDaTradurre('en'), true, 'una riga italiana è passata inosservata')
  // in un’app italiana non si guarda: tradurre a vuoto costa e non serve
  assert.equal(traduci.compitiDaTradurre('it'), false)
})

// — la rassegna —
//
// Letta e scartata si somigliano — tutt'e due tolgono la notizia dal mazzo — e
// confonderle si paga in un modo solo: una cosa che hai buttato via ti torna
// davanti. È il difetto che fa smettere di fidarsi di una fascia di notizie,
// e non dà nessun errore.

const notizia = (id: string, sopra: Record<string, unknown> = {}) => ({
  id, titolo: `Titolo ${id}`, riassunto: 'Due righe.', perche: null,
  fonte: 'Giornale', link: `https://esempio.it/${id}`, argomento: 'mondo',
  quando: new Date().toISOString(), ...sopra
})

test('una notizia scartata sparisce dall’elenco ma resta nell’indice', () => {
  store.salvaNotizie([notizia('n1'), notizia('n2')])
  store.segnaNotiziaScartata('n1')

  assert.deepEqual(store.notizie().map(n => n.id), ['n2'], 'la scartata è ancora in elenco')
  assert.deepEqual(store.notizieScartate(), ['n1'],
    'sparita anche dall’indice: domani la rassegna la ripesca dal feed e te la rimette davanti')
})

test('letta e scartata sono due cose diverse', () => {
  store.salvaNotizie([notizia('n3')])
  store.segnaNotiziaLetta('n3')

  const letta = store.notizie().find(n => n.id === 'n3')
  assert.ok(letta?.letta, 'non si è segnata come letta')
  assert.equal(letta?.scartata, null, 'leggerla l’ha anche buttata via')
  assert.ok(!store.notizieScartate().includes('n3'), 'una letta non deve smettere di poter tornare')
})

test('la stessa notizia che ripassa non perde il segno di letta', () => {
  store.salvaNotizie([notizia('n4')])
  store.segnaNotiziaLetta('n4')
  // il giornale la ripubblica, la rassegna la riprende: stesso indirizzo, stessa riga
  store.salvaNotizie([notizia('n4', { titolo: 'Titolo aggiornato' })])

  const dopo = store.notizie().find(n => n.id === 'n4')
  assert.equal(dopo?.titolo, 'Titolo aggiornato', 'non si è aggiornata')
  assert.ok(dopo?.letta, 'è tornata a sembrare nuova solo perché il giornale l’ha ripubblicata')
})

test('la potatura tiene le scartate più a lungo delle altre', () => {
  store.salvaNotizie([notizia('vecchia'), notizia('buttata')])
  store.segnaNotiziaScartata('buttata')
  // come se fossero entrambe di dieci giorni fa
  store.perProva.invecchiaNotizie(10)

  store.potaNotizie(8)
  assert.ok(!store.notizie().some(n => n.id === 'vecchia'), 'la vecchia non se n’è andata')
  assert.ok(store.notizieScartate().includes('buttata'),
    'la scartata è stata potata: fra otto giorni quella notizia può tornare')
})

// — scrivere a pezzi, e riprendersi lo spazio —

test('a pezzi si scrive quello che si scriverebbe in un colpo solo', async () => {
  const tanti = Array.from({ length: 450 }, (_, i) => ({
    id: `pezzi:${i}`, fonte: 'desktop', tipo: 'nota',
    titolo: `Nota numero ${i}`, corpo: `il contenuto della nota ${i}, con abbastanza parole da indicizzare`,
    autore: null, percorso: null, quando: '2026-02-01T00:00:00.000Z', gruppo: 'documenti'
  }))
  const e = await store.salvaDocumentiAPezzi(tanti, 100)
  assert.equal(e.nuovi, 450)
  assert.equal(store.documento('pezzi:449')?.titolo, 'Nota numero 449')
  // e sono cercabili: l'indice FTS è stato scritto in ogni pezzo, non solo nell'ultimo
  assert.ok(store.cerca('nota numero 7', 5).some(d => d.id === 'pezzi:7'))

  // rifarlo non duplica niente e non cambia niente
  const due = await store.salvaDocumentiAPezzi(tanti, 100)
  assert.equal(due.nuovi, 0)
  assert.equal(due.invariati, 450)
})

test('compattare non fa niente quando non c’è niente da riprendersi', () => {
  // il file di prova è piccolo: la soglia non si raggiunge, e VACUUM non parte
  const e = store.compatta()
  assert.equal(e.fatto, false)
  // e l'indice continua a rispondere
  assert.ok(store.conteggi().totale > 0)
})

// — le migrazioni si accodano, e un database vecchio arriva in fondo —

test('ogni migrazione ha davvero lasciato la sua colonna', () => {
  /*
   * La prova che serviva.
   *
   * Una migrazione infilata *in mezzo* alla lista sposta di uno tutte quelle
   * che vengono dopo: un database già arrivato a quel numero le salta senza
   * dire niente — `user_version` avanza, la colonna non compare, e non c'è
   * nessun errore da nessuna parte. È già successo due volte in questo file.
   * Qui non si guarda la lista: si guarda il database, e si chiede se c'è
   * quello che ogni migrazione dice di aver messo.
   */
  const colonne = (tabella: string) =>
    (store.default.prepare(`PRAGMA table_info(${tabella})`).all() as { name: string }[]).map(c => c.name)

  const documenti = colonne('documenti')
  for (const c of ['rid', 'id', 'fonte', 'tipo', 'titolo', 'corpo', 'autore', 'percorso',
    'quando', 'gruppo', 'indicizzato', 'filo', 'inviato']) {
    assert.ok(documenti.includes(c), `documenti non ha «${c}»: una migrazione è stata saltata`)
  }

  const automazioni = colonne('automazioni')
  for (const c of ['id', 'spenta', 'ultima', 'quante', 'esito', 'guaio', 'storia', 'giorno', 'bozze']) {
    assert.ok(automazioni.includes(c), `automazioni non ha «${c}»: una migrazione è stata saltata`)
  }

  const tabelle = (store.default.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  ).all() as { name: string }[]).map(t => t.name)
  for (const t of ['documenti', 'ricerca', 'chat', 'messaggi', 'feed', 'convinzioni', 'blocchi',
    'domande', 'compiti', 'automazioni', 'azioni', 'notizie', 'raccolte', 'uso']) {
    assert.ok(tabelle.includes(t), `manca la tabella «${t}»`)
  }
})

test('la posta inviata non conta come appena arrivata', () => {
  const ora = new Date().toISOString()
  store.salvaDocumenti([
    { id: 'arr:1', fonte: 'posta', tipo: 'email', titolo: 'Arrivata da Rossi',
      corpo: 'il testo della email che è arrivata da fuori', autore: 'Rossi', percorso: 'INBOX',
      quando: ora, gruppo: 'posta' },
    { id: 'inv:1', fonte: 'posta', tipo: 'email', titolo: 'Che ho mandato io',
      corpo: 'il testo della email che ho scritto io a qualcuno', autore: 'Anna', percorso: 'Inviata',
      quando: ora, gruppo: 'posta', inviato: true }
  ])
  const arrivati = store.appenaArrivati('2000-01-01T00:00:00.000Z', 50).map(d => d.id)
  assert.ok(arrivati.includes('arr:1'), 'quella arrivata non c’è')
  assert.ok(!arrivati.includes('inv:1'),
    'quella che ha scritto lei conta come arrivata: la prima pagina si riempirebbe della sua stessa posta')

  // ma resta cercabile, che è tutto il motivo per cui la si legge
  assert.ok(store.cerca('mandato', 5).some(d => d.id === 'inv:1'), 'la posta inviata non si trova')
})
