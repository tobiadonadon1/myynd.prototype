// La stesura: chiedere o presumere, il giro in più, il conto delle chiamate.
//
// Tutto con le mani finte: `lavora`, `chiedeAiuto`, `pesaLaDomanda`,
// `giudica`. Quello che si prova è il giro attorno al modello, che è quello
// che nessuno vedrebbe sbagliare: una domanda morbida che diventa un'ipotesi,
// un indirizzo che resta una domanda, un prezzo dopo la risposta che diventa
// un segnaposto, il fondo che non chiede mai, il tetto delle tre stesure.
//
//   node --test server/stesura.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-stesura-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY
const { stendi, STESURE_MAX, RILETTURE_MAX } = await import('./stesura.ts')
const claude = await import('./claude.ts')
type Ferri = Parameters<typeof stendi>[0]['ferri']
type Uscita = Awaited<ReturnType<Parameters<typeof stendi>[0]['lavora']>>
after(() => rmSync(CASA, { recursive: true, force: true }))

const PASSA: import('./revisione-lavoro.ts').Giudizio = { esito: 'pass', per: 'Nora', comeTe: '', comeLoro: '', problemi: [], verificato: [] }
const RIVEDI: import('./revisione-lavoro.ts').Giudizio = { ...PASSA, esito: 'revise', problemi: ['the date is wrong'] }
const c = { id: 'c1', testo: 'Write the kickoff note for the Harbor pilot', modo: 'tutto', domandeFatte: 0 }
const DOMANDA = 'I read Nora\'s mail and the pilot plan.\nWhat day is the kickoff?\nOtherwise I\'ll assume Tuesday, October 6.'
const NOTA = 'Done: the kickoff note.\n\nThe kickoff note, three paragraphs long, with the agenda, the people and the two goals of the pilot.\n\nFrom Nora\'s mail [1].\nI assumed Tuesday, October 6 as the kickoff.'

/** Un `lavora` che risponde in fila e ricorda cosa gli è stato chiesto. */
function copione(uscite: (string | Uscita)[]) {
  const chiamate: { nota: string | null; extra?: { fissa?: string[]; giri?: number } }[] = []
  const lavora = async (nota: string | null, extra?: { fissa?: string[]; giri?: number }) => {
    chiamate.push({ nota, extra })
    const u = uscite[Math.min(chiamate.length - 1, uscite.length - 1)]
    return typeof u === 'string' ? { testo: u, fonti: [], lette: [`d${chiamate.length}`] } : u
  }
  return { lavora, chiamate }
}

/** Il classificatore finto: legge la forma, come farebbe quello vero senza modello. */
const classifica: Ferri['chiedeAiuto'] = async (_c, risposta) => {
  const righe = risposta.split('\n').filter(Boolean)
  if (/^Done:/.test(righe[0])) return { chiede: false, manca: [], domanda: '' }
  const domanda = righe.find(r => r.endsWith('?')) ?? ''
  if (!domanda) return { chiede: false, manca: [], domanda: '' }
  return { chiede: true, manca: [], domanda, visto: righe[0] }
}

type Giudizio = import('./revisione-lavoro.ts').Giudizio
function ferri(o: { peso?: Awaited<ReturnType<Ferri['pesaLaDomanda']>>; giudizi?: Giudizio[]; chiedeAiuto?: Ferri['chiedeAiuto'] }) {
  const pesate: string[] = []
  const giudicati: string[] = []
  let g = 0
  const f: Ferri = {
    chiedeAiuto: o.chiedeAiuto ?? classifica,
    pesaLaDomanda: async (_c, domanda) => { pesate.push(domanda); return o.peso ?? null },
    giudica: async x => { giudicati.push(x.risultato); return (o.giudizi ?? [PASSA])[Math.min(g++, (o.giudizi ?? [PASSA]).length - 1)] }
  }
  return { f, pesate, giudicati }
}

const base = (lavora: Parameters<typeof stendi>[0]['lavora'], f: Ferri, extra: Partial<Parameters<typeof stendi>[0]> = {}) =>
  stendi({ c, nota: 'Progetto: Harbor', progetto: null, nativa: true, lingua: 'en', lavora, ferri: f, fermo: () => false, ...extra })

test('a. una scadenza morbida con la strada proposta: il secondo giro presume, con la nota e i documenti letti, e non chiede', async () => {
  const { lavora, chiamate } = copione([DOMANDA, NOTA])
  const { f, pesate } = ferri({ peso: { genere: 'data', costo: 'basso' } })
  const s = (await base(lavora, f))!
  assert.equal(s.mossa, 'presumi')
  assert.equal(s.genere, 'data')
  assert.equal(s.chiamate, 2)
  assert.equal(chiamate.length, 2)
  assert.match(chiamate[1].nota ?? '', /^Progetto: Harbor\n\nNon fermarti a chiedere «What day is the kickoff\?»\. Vale questa ipotesi: Tuesday, October 6\./)
  assert.match(chiamate[1].nota ?? '', /comincia con «Ho supposto»/)
  assert.deepEqual(chiamate[1].extra, { fissa: ['d1'], giri: 2 })
  assert.equal(s.ipotesiProposta, 'Tuesday, October 6')
  assert.deepEqual(pesate, ['What day is the kickoff?'])
  assert.match(s.testo, /^Done: the kickoff note\./)
  assert.equal(s.verdetto?.esito, 'pass')
})

test('b. (contro) un indirizzo che manca resta una domanda, una sola, senza pesare niente', async () => {
  const { lavora, chiamate } = copione(['I read the thread with Dana.\nWhat is Dana\'s email address?\nOtherwise I\'ll assume dana@example.com.'])
  const { f, pesate } = ferri({ peso: { genere: 'preferenza', costo: 'basso' } })
  const s = (await base(lavora, f))!
  assert.equal(s.mossa, 'chiedi')
  assert.equal(s.genere, 'destinatario')
  assert.equal(s.domanda, 'What is Dana\'s email address?')
  assert.equal(s.visto, 'I read the thread with Dana.')
  assert.equal(chiamate.length, 1)
  assert.deepEqual(pesate, [], 'il pavimento ha già deciso: non si pesa')
})

test('c. dopo una domanda già fatta, un prezzo che manca diventa un segnaposto, non una seconda domanda', async () => {
  const { lavora, chiamate } = copione(['I read the thread.\nWhat is the price for 20 people?', 'Done: the quote.\n\nHi Nora,\n\nthe price for 20 people is [to fill: price for 20 people].\n\nBest,\nAlex\n\nMissing: the price for 20 people. I left it blank.'])
  const { f, pesate } = ferri({})
  const s = (await base(lavora, f, { c: { ...c, domandeFatte: 1 } }))!
  assert.equal(s.mossa, 'segnaposto')
  assert.equal(s.genere, 'cifra')
  assert.equal(chiamate.length, 2)
  // la domanda è già stata fatta e la nota c'è: prima si dice di usare la risposta che sta lì, poi il segnaposto
  assert.match(chiamate[1].nota ?? '', /Non fermarti a chiedere «What is the price for 20 people\?»: se la nota qui sopra lo dice già \(la sua risposta\), vale quella, usala\. Se davvero non c'è, manca un dato che nessuna fonte contiene: non inventarlo e non chiederlo\./)
  assert.match(s.testo, /\[to fill: price for 20 people\]/)
  assert.deepEqual(pesate, [])
})

test('c2. (contro) nel fondo, senza una domanda fatta, l\'istruzione del segnaposto non parla di una risposta nella nota', async () => {
  const { lavora, chiamate } = copione(['I read the thread.\nWhat is the price for 20 people?', 'Done: the quote.\n\nHi Nora,\n\nthe price is [to fill: price for 20 people].\n\nBest,\nAlex\n\nMissing: the price for 20 people.'])
  const s = (await base(lavora, ferri({}).f, { nativa: false }))!
  assert.equal(s.mossa, 'segnaposto')
  assert.match(chiamate[1].nota ?? '', /Manca un dato che nessuna fonte contiene: «What is the price for 20 people\?»\. Non inventarlo e non chiederlo\./)
  assert.ok(!(chiamate[1].nota ?? '').includes('la sua risposta'))
})

test('c3. dopo la domanda, se il modello richiede lo stesso dato e poi lo prende dalla nota, la consegna è «produci»: niente ipotesi, niente segnaposto', async () => {
  const { lavora, chiamate } = copione(['I read the thread.\nWhich Giulia is the quote for?', 'Done: the quote to Giulia Neri.\n\nHi Giulia,\n\nhere is the course quote for Lumen, with the price from the list and the dates we discussed.\n\nBest,\nAlex'])
  const { f, pesate } = ferri({})
  const s = (await base(lavora, f, { c: { ...c, domandeFatte: 1 }, nota: 'Which Giulia is the quote for? → Giulia Neri' }))!
  assert.equal(s.mossa, 'produci')
  assert.equal(chiamate.length, 2)
  assert.match(chiamate[1].nota ?? '', /^Which Giulia is the quote for\? → Giulia Neri\n\nNon fermarti a chiedere «Which Giulia is the quote for\?»: se la nota qui sopra lo dice già/)
  assert.ok(!(chiamate[1].nota ?? '').includes('Manca un dato che nessuna fonte contiene: «Which'), 'la nota diceva insieme «ecco la risposta» e «manca»')
  // «Which Giulia» non è nel pavimento: si pesa, e senza etichetta è dura, quindi il giro del segnaposto e non una seconda domanda
  assert.deepEqual(pesate, ['Which Giulia is the quote for?'])
})

test('d. tre domande dal modello: ne resta una, con il classificatore vero e senza modello', async () => {
  const { lavora } = copione(['Which unit is the audit about?\nWhen is it due?\nWho signs it?'])
  const { f } = ferri({ chiedeAiuto: (...a) => claude.chiedeAiuto(...a) })
  const s = (await base(lavora, f))!
  assert.equal(s.mossa, 'chiedi')
  assert.equal(s.domanda, 'Which unit is the audit about?')
})

test('e. il conto: presume, poi la rilettura boccia una volta; tre stesure, due riletture, e l\'ultima è riletta', async () => {
  const NOTA2 = NOTA.replace('Tuesday, October 6', 'Monday, October 5')
  const { lavora, chiamate } = copione([DOMANDA, NOTA, NOTA2])
  const { f, giudicati } = ferri({ peso: { genere: 'data', costo: 'basso' }, giudizi: [RIVEDI, RIVEDI] })
  const s = (await base(lavora, f))!
  assert.equal(chiamate.length, STESURE_MAX)
  assert.equal(giudicati.length, RILETTURE_MAX)
  assert.match(giudicati[1], /Monday, October 5/, 'l\'ultima stesura non è stata riletta')
  assert.equal(s.mossa, 'presumi')
  assert.equal(s.verdetto?.esito, 'revise')
  assert.equal(s.giri, 2)
  // la riscrittura tiene sia l'ipotesi sia i problemi in nota, e i documenti fissati
  assert.match(chiamate[2].nota ?? '', /Non fermarti a chiedere/)
  assert.match(chiamate[2].nota ?? '', /Rivedi: la prima stesura non ha passato la rilettura/)
  assert.deepEqual(chiamate[2].extra, { fissa: ['d2'], giri: 2 })
})

test('f. una fonte che manca è un blocco, non una domanda, e non si pesa', async () => {
  const { lavora, chiamate } = copione(['I need your mail connected to read Dana\'s thread.'])
  const { f, pesate } = ferri({ chiedeAiuto: (...a) => claude.chiedeAiuto(...a) })
  const s = (await base(lavora, f))!
  assert.equal(s.mossa, 'blocco')
  assert.equal(chiamate.length, 1)
  assert.deepEqual(pesate, [])
})

test('f2. (contro) lo stesso testo con la posta collegata non è un blocco: è una domanda, e si pesa', async () => {
  const { lavora, chiamate } = copione(['I don\'t have access to Dana\'s thread in your mail.'])
  const { f, pesate } = ferri({ chiedeAiuto: (...a) => claude.chiedeAiuto(...a), peso: null })
  const s = (await base(lavora, f, { collegata: g => g === 'posta' }))!
  assert.notEqual(s.mossa, 'blocco')
  assert.equal(s.mossa, 'chiedi')
  assert.equal(chiamate.length, 1)
  assert.equal(pesate.length, 1)
  // con la posta scollegata resta un blocco
  const { lavora: l2 } = copione(['I don\'t have access to Dana\'s thread in your mail.'])
  const s2 = (await base(l2, ferri({ chiedeAiuto: (...a) => claude.chiedeAiuto(...a) }).f, { collegata: () => false }))!
  assert.equal(s2.mossa, 'blocco')
})

test('f4. (contro) un archivio in rete che manca resta un blocco anche con le cartelle del Mac collegate: non è una domanda', async () => {
  for (const testo of ['I need access to your Google Drive to find the signed contract.', 'I don\'t have access to the Slack thread with Dana.']) {
    const { lavora, chiamate } = copione([testo])
    const { f, pesate } = ferri({ chiedeAiuto: (...a) => claude.chiedeAiuto(...a), peso: { genere: 'collegamento', costo: 'alto' } })
    // le cartelle del Mac e la posta sono collegate: quello che manca è un'altra fonte
    const s = (await base(lavora, f, { collegata: g => g === 'file' || g === 'posta' }))!
    assert.equal(s.mossa, 'blocco', `«${testo}» con i file del Mac collegati è diventata una domanda`)
    assert.equal(chiamate.length, 1)
    assert.deepEqual(pesate, [], 'un blocco non si pesa')
  }
})

test('f3. (contro) la posta è collegata e l\'etichetta dice «collegamento»: non torna un blocco, è una domanda dura', async () => {
  for (const genere of ['collegamento', 'permesso'] as const) {
    const { lavora, chiamate } = copione(['I don\'t have access to Dana\'s thread in your mail.'])
    const { f, pesate } = ferri({ chiedeAiuto: (...a) => claude.chiedeAiuto(...a), peso: { genere, costo: 'alto' } })
    const s = (await base(lavora, f, { collegata: g => g === 'posta' }))!
    assert.notEqual(s.mossa, 'blocco', `con l'etichetta «${genere}» la riga direbbe «Collega la posta» con la posta collegata`)
    assert.equal(s.mossa, 'chiedi')
    assert.equal(s.genere, 'altro')
    assert.equal(chiamate.length, 1)
    assert.equal(pesate.length, 1)
    // nel fondo, o dopo una domanda, lo stesso testo lascia il posto vuoto: mai un blocco
    const { lavora: l2 } = copione(['I don\'t have access to Dana\'s thread in your mail.', 'Done: the reply.\n\nHi Dana, [to fill: the invoice number].\n\nMissing: the invoice number.'])
    const s2 = (await base(l2, ferri({ chiedeAiuto: (...a) => claude.chiedeAiuto(...a), peso: { genere, costo: 'alto' } }).f, { collegata: g => g === 'posta', nativa: false }))!
    assert.equal(s2.mossa, 'segnaposto')
  }
  // senza la fonte collegata l'etichetta «collegamento» resta un blocco, anche su un testo senza la forma di chi si ferma
  const { lavora: l3 } = copione(['Which mailbox has Dana\'s thread?'])
  const s3 = (await base(l3, ferri({ chiedeAiuto: (...a) => claude.chiedeAiuto(...a), peso: { genere: 'collegamento', costo: 'alto' } }).f, { collegata: () => false }))!
  assert.equal(s3.mossa, 'blocco')
})

test('g. il fondo non chiede mai: un prezzo che manca è un segnaposto al primo giro', async () => {
  const { lavora, chiamate } = copione(['I read the thread.\nWhat is the price for 20 people?', 'Done: the quote.\n\nHi Nora, the price is [to fill: price for 20 people].\n\nMissing: the price.'])
  const { f } = ferri({})
  const s = (await base(lavora, f, { nativa: false }))!
  assert.notEqual(s.mossa, 'chiedi')
  assert.equal(s.mossa, 'segnaposto')
  assert.equal(chiamate.length, 2)
  // e se anche il secondo giro chiede, si arrende: mai una domanda nel fondo
  const ancora = copione(['I read the thread.\nWhat is the price for 20 people?', 'What is the price for 20 people?'])
  const s2 = (await base(ancora.lavora, ferri({}).f, { nativa: false }))!
  assert.equal(s2.mossa, 'guaio')
})

test('h. un richiamo durante il secondo giro: null, niente in mano', async () => {
  let giro = 0
  const { lavora } = copione([DOMANDA, NOTA])
  const { f } = ferri({ peso: { genere: 'data', costo: 'basso' } })
  const s = await base(async (n, e) => { giro++; return lavora(n, e) }, f, { fermo: () => giro >= 2 })
  assert.equal(s, null)
})

test('i. la lingua sbagliata forza una riscrittura; un saluto diverso da solo no', async () => {
  const { lavora, chiamate } = copione([NOTA, NOTA])
  const { f, giudicati } = ferri({})
  const s = (await base(lavora, f, { controllaVoce: () => ['Scritta in inglese: a Marco scrive in italiano.'] }))!
  assert.equal(chiamate.length, 2, 'la lingua sbagliata doveva far riscrivere')
  assert.equal(giudicati.length, 2)
  assert.match(chiamate[1].nota ?? '', /Scritta in inglese: a Marco scrive in italiano\./)
  assert.equal(s.verdetto?.esito, 'revise')

  const senza = copione([NOTA])
  const g2 = ferri({})
  const s2 = (await base(senza.lavora, g2.f, { controllaVoce: () => [] }))!
  assert.equal(senza.chiamate.length, 1)
  assert.equal(s2.verdetto?.esito, 'pass')
  assert.equal(s2.mossa, 'produci')
})

test('un prompt non passa dalla rilettura e non prende la frase di chiusura', async () => {
  const { lavora } = copione(['You are an assistant. Write the plan.'])
  const { f, giudicati } = ferri({})
  const s = (await base(lavora, f, { c: { ...c, modo: 'prompt' } }))!
  assert.equal(giudicati.length, 0)
  assert.equal(s.testo, 'You are an assistant. Write the plan.')
  assert.equal(s.mossa, 'produci')
})
