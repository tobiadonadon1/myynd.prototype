// Il primo giorno (F6): il ritratto senza modello, le carte per la notte, chi
// c'era già, e due conti che non si vedono.
//
//   node --test server/primo-giorno.test.ts

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Documento } from './store.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-primo-giorno-'))
process.env.MYYND_DATI = CASA
delete process.env.ANTHROPIC_API_KEY

const conti = await import('./conti.ts')
const chi = await import('./chi.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const ab = await import('./abitudini.ts')
const progetti = await import('./progetti.ts')
const pg = await import('./primo-giorno.ts')
const esiti = await import('./feed-esiti.ts')

const GIORNO = 86_400_000
const ORA = 3_600_000
let anna = '', bea = ''
let contratti: string[] = []

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1'); assert.ok(a.ok); anna = a.ok ? a.id : ''
  const b = await conti.registra('bea@esempio.it', 'passwordlunga2'); assert.ok(b.ok); bea = b.ok ? b.id : ''
})
beforeEach(() => {
  contratti = []
  pg.perProva({ motore: () => true, cartelle: async () => {}, codice: async () => ({}), contratto: id => { contratti.push(id); return null }, annuncia: () => {} })
  pg.dimentica()
  for (const [c, email] of [[anna, 'anna@esempio.it'], [bea, 'bea@esempio.it']] as const) {
    chi.dentro(c, () => {
      store.azzeraTutto()
      store.default.exec("DELETE FROM segnali; DELETE FROM abitudini; DELETE FROM cursori; DELETE FROM agenda_viste")
      cfg.scrivi({ lingua: 'en', autonomia: 'preparare', posta: { host: 'h', porta: 993, utente: email, password: 'x' } })
      // chi c'era già e non deve rileggere: niente rilettura nelle prove che non la guardano
      store.segnaCursore('prima:posta', 'fatto')
      store.segnaCursore(pg.CURS.rilettura, new Date().toISOString())
    })
  }
})
after(() => { pg.perProva(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

let n = 0
const adesso = () => Date.now()
/** Una mail arrivata `giorniFa` giorni fa; `risposta` in minuti scrive anche la risposta mandata. */
function mail(da: string, nome: string, giorniFa: number, o: { risposta?: number; corpo?: string; massa?: boolean; titolo?: string } = {}): Documento[] {
  n++
  const quando = new Date(adesso() - giorniFa * GIORNO - ORA)
  const arrivata: Documento = {
    id: `posta:INBOX:${n}`, fonte: 'posta', tipo: 'email', titolo: o.titolo ?? `Question ${n} from ${nome}`,
    corpo: o.corpo ?? 'Could you review the attached plan and reply with your feedback?', autore: `${nome} <${da}>`,
    quando: quando.toISOString(), filo: `filo-${n}`, messageId: `m${n}@esempio.test`, destinatari: 'anna@esempio.it', ...(o.massa ? { massa: true } : {})
  }
  if (o.risposta === undefined) return [arrivata]
  return [arrivata, {
    id: `posta:Sent:${n}`, fonte: 'posta', tipo: 'email', titolo: `Re: ${arrivata.titolo}`, corpo: 'Thanks, done.', autore: 'Anna <anna@esempio.it>',
    quando: new Date(quando.getTime() + o.risposta * 60_000).toISOString(), filo: `filo-${n}`, messageId: `s${n}@esempio.test`,
    risponde: `m${n}@esempio.test`, destinatari: da, inviato: true
  }]
}
/** Nora: sei mail vecchie tutte risposte, e una di due giorni fa che aspetta. */
function nora(): Documento[] {
  const vecchie = Array.from({ length: 6 }, (_, i) => mail('nora@vance.test', 'Nora Vance', 20 + i * 6, { risposta: 90 })).flat()
  return [...vecchie, ...mail('nora@vance.test', 'Nora Vance', 2)]
}

test('il ritratto senza modello: una riga «risponde sempre» con le mail come perché; la seconda volta non cambia niente', async () => {
  await chi.dentro(anna, async () => {
    pg.perProva({ motore: () => false, cartelle: async () => {}, codice: async () => ({}), annuncia: () => {} })
    store.salvaDocumenti(nora())
    const righe = await pg.ritratto()
    assert.ok(righe && righe > 0)
    const r = ab.tutte().find(a => a.chiave === 'posta.risponde_sempre:nora@vance.test')
    assert.ok(r, 'la riga di Nora c’è')
    assert.equal(r!.casi, 6); assert.equal(r!.su, 7)
    assert.ok(r!.esempi.length > 0 && r!.esempi.every(e => e.doc?.startsWith('posta:INBOX:')), 'ogni esempio porta alla sua mail')
    assert.ok(store.cursore(pg.CURS.ritratto))
    const prima = JSON.stringify(ab.tutte())
    await pg.ritratto()
    assert.equal(JSON.stringify(ab.tutte()), prima, 'rifatto, uguale')
    // senza modello le carte aspettano, e la riga del primo giorno non le promette
    assert.equal(await pg.carte(), null)
    assert.equal(pg.stato().fase, 'fatto')
  })
})

test('il ritratto aspetta la prima lettura della posta', async () => {
  await chi.dentro(anna, async () => {
    store.salvaDocumenti(nora())
    store.segnaCursore('prima:posta', 'in-corso')
    assert.deepEqual(pg.aspettaLaLettura(), ['posta'])
    assert.equal(pg.stato().fase, 'attesa')
    assert.equal(await pg.ritratto(), null)
    assert.equal(ab.tutte().length, 0)
    assert.equal(store.cursore(pg.CURS.ritratto), null)
    // una fonte ferma da quattro giri non trattiene più il ritratto
    store.segnaCursore('prima:posta:giri', String(pg.GIRI_CHE_ASPETTANO))
    assert.deepEqual(pg.aspettaLaLettura(), [])
    assert.ok(await pg.ritratto() !== null)
  })
})

test('al massimo cinque carte, in coda per la notte con la base del contratto; prima chi riceve sempre risposta; nessuna senza candidate', async () => {
  await chi.dentro(anna, async () => {
    assert.deepEqual(await pg.carte(), [], 'niente da preparare: niente carte, mai inventate')
    store.segnaCursore(pg.CURS.carte, null)
    const altre = ['jane', 'omar', 'lea', 'tom', 'ugo', 'ivy', 'max'].flatMap((x, i) => mail(`${x}@esempio.test`, x, 0.5 + i * 0.3))
    store.salvaDocumenti([...nora(), ...altre])
    await pg.ritratto()
    const nate = (await pg.carte())!
    assert.equal(nate.length, pg.CARTE_MAX)
    const prima = store.compito(nate[0]!)!
    assert.match(store.documento(prima.doc!)!.autore!, /nora@vance\.test/, 'a chi risponde sempre, prima')
    for (const id of nate) {
      const c = store.compito(id)!
      assert.equal(c.origine, 'primo-giorno')
      assert.equal(c.stato, 'aperto')
      assert.equal(c.modo, 'bozza')
      assert.equal(c.turno?.da, 'myynd')
      assert.equal(c.turno?.quando, 'notte')
      assert.equal(c.turno?.tentativi, 0)
    }
    assert.deepEqual(contratti, nate, 'la base del contratto per ognuna')
    assert.ok(store.cursore(pg.CURS.carte))
    // chiamate di nuovo, non rifanno le stesse carte: solo le candidate rimaste (otto in tutto)
    store.segnaCursore(pg.CURS.carte, null)
    const dopo = (await pg.carte())!
    assert.equal(dopo.length, 3)
    assert.equal(dopo.filter(id => nate.includes(id)).length, 0)
    const docs = store.elencoCompiti().filter(c => c.origine === 'primo-giorno').map(c => c.doc)
    assert.equal(new Set(docs).size, docs.length, 'un documento, una carta')
  })
})

test('mai un filo già risposto, posta in serie, una mail scartata, un progetto chiuso', async () => {
  await chi.dentro(anna, async () => {
    const chiuso = progetti.scrivi({ nome: 'Orchard Rebrand', obiettivo: 'Rebrand the orchard shop' })
    progetti.cambia(chiuso.id, { stato: 'chiuso' })
    const risposta = mail('rita@esempio.test', 'Rita', 1, { risposta: 30 })
    const serie = mail('news@esempio.test', 'News', 1, { massa: true })
    const scartata = mail('sam@esempio.test', 'Sam', 1)
    const delChiuso = mail('pia@esempio.test', 'Pia', 1, { titolo: 'Orchard Rebrand next steps', corpo: 'Could you review the Orchard Rebrand plan and reply?' })
    const buona = mail('ada@esempio.test', 'Ada', 1)
    store.salvaDocumenti([...risposta, ...serie, ...scartata, ...delChiuso, ...buona])
    store.salvaFeed([{ tipo: 'Da leggere', titolo: 'Sam', testo: 'x', doc: scartata[0]!.id }])
    const f = store.feedAperto(10).find(v => v.doc === scartata[0]!.id)!
    store.cambiaStatoFeed(f.id, 'scartato', 'Non è una cosa sua.', 'non_mia')
    await pg.ritratto()
    const nate = (await pg.carte())!
    assert.deepEqual(nate.map(id => store.compito(id)!.doc), [buona[0]!.id])
  })
})

test('con «Chiedimi prima» le carte si scrivono e non entrano in coda; col turno spento nemmeno', async () => {
  await chi.dentro(anna, async () => {
    cfg.aggiorna({ autonomia: 'chiedere' })
    store.salvaDocumenti(mail('ada@esempio.test', 'Ada', 1))
    await pg.ritratto()
    const [id] = (await pg.carte())!
    const c = store.compito(id!)!
    assert.equal(c.origine, 'primo-giorno')
    assert.equal(c.turno ?? null, null)
    assert.deepEqual(contratti, [])
  })
  await chi.dentro(bea, async () => {
    cfg.aggiorna({ turno: { spento: true } })
    store.salvaDocumenti(mail('ada@esempio.test', 'Ada', 1))
    await pg.ritratto()
    const [id] = (await pg.carte())!
    assert.equal(store.compito(id!)!.turno ?? null, null)
  })
})

test('una carta del feed con un’offerta diventa una carta: esce dal feed come «superata», e il punteggio non la conta', async () => {
  await chi.dentro(anna, async () => {
    const [d] = mail('leo@esempio.test', 'Leo', 1, { corpo: 'Here is the launch checklist.' })
    store.salvaDocumenti([d!])
    store.salvaFeed([{ tipo: 'Priorità', titolo: 'Send Leo the launch checklist', testo: 'Leo is waiting.', doc: d!.id, offerta: 'I can draft the reply to Leo.' }])
    const voce = store.feedAperto(10)[0]!
    await pg.ritratto()
    const [id] = (await pg.carte())!
    const c = store.compito(id!)!
    assert.equal(c.testo, 'Send Leo the launch checklist')
    assert.equal(c.voce, voce.id)
    assert.match(c.nota ?? '', /I can draft the reply to Leo/)
    const r = store.voceFeed(voce.id)!
    assert.equal(r.stato, 'scaduto'); assert.equal(r.ragione, 'superata')
    assert.equal(esiti.esitoCarta({ stato: r.stato, ragione: r.ragione, motivo: r.motivo, vista: r.vista ?? null }), 'neutra')
  })
})

test('due conti non si vedono: le carte e i segni di uno non sono dell’altro', async () => {
  await chi.dentro(anna, async () => { store.salvaDocumenti([...nora(), ...mail('ada@esempio.test', 'Ada', 1)]) })
  await pg.forse(anna)
  chi.dentro(anna, () => {
    assert.ok(store.cursore(pg.CURS.ritratto)); assert.ok(store.cursore(pg.CURS.carte))
    assert.equal(store.elencoCompiti().filter(c => c.origine === 'primo-giorno').length, 2)
  })
  chi.dentro(bea, () => {
    assert.equal(store.cursore(pg.CURS.ritratto), null)
    assert.equal(store.cursore(pg.CURS.carte), null)
    assert.equal(store.elencoCompiti().length, 0)
    assert.equal(ab.tutte().length, 0)
  })
  await pg.forse(bea)
  chi.dentro(bea, () => { assert.ok(store.cursore(pg.CURS.ritratto)); assert.equal(store.elencoCompiti().length, 0) })
})

test('chi c’era già rilegge la posta da novanta giorni una volta sola, se la mandata non arriva a ottanta', async () => {
  for (const c of [anna, bea]) chi.dentro(c, () => store.segnaCursore(pg.CURS.rilettura, null))
  await chi.dentro(anna, async () => {
    store.salvaDocumenti(mail('ada@esempio.test', 'Ada', 20, { risposta: 60 }))
    assert.deepEqual(pg.rileggiUnaVolta(), ['posta'])
    assert.equal(store.cursore('prima:posta'), 'in-corso')
    assert.ok(store.cursore(pg.CURS.rilettura))
    // finita la rilettura, non ricomincia più
    store.segnaCursore('prima:posta', 'fatto')
    assert.deepEqual(pg.rileggiUnaVolta(), [])
    assert.equal(store.cursore('prima:posta'), 'fatto')
  })
  await chi.dentro(bea, async () => {
    // la posta mandata arriva a cento giorni: niente da rileggere
    store.salvaDocumenti(mail('ada@esempio.test', 'Ada', 100, { risposta: 60 }))
    assert.deepEqual(pg.rileggiUnaVolta(), [])
    assert.equal(store.cursore('prima:posta'), 'fatto')
    assert.ok(store.cursore(pg.CURS.rilettura))
  })
})

test('la carta del primo giorno regge finché nessuno risponde nel filo', async () => {
  await chi.dentro(anna, async () => {
    const [d] = mail('ada@esempio.test', 'Ada', 1)
    store.salvaDocumenti([d!])
    assert.equal(pg.fonteValida({ doc: d!.id, voce: null }), true)
    store.salvaDocumenti([{ id: 'posta:Sent:x', fonte: 'posta', tipo: 'email', titolo: `Re: ${d!.titolo}`, corpo: 'Done.', autore: 'anna@esempio.it',
      quando: new Date().toISOString(), filo: d!.filo, messageId: 'sx@esempio.test', risponde: d!.messageId, destinatari: 'ada@esempio.test', inviato: true }])
    assert.equal(pg.fonteValida({ doc: d!.id, voce: null }), false)
  })
})

test('nessuna bozza di risposta a chi di solito resta senza risposta', async () => {
  await chi.dentro(anna, async () => {
    // Priya: sei mail vecchie mai risposte, e una di ieri che chiede qualcosa
    const priya = [...Array.from({ length: 6 }, (_, i) => mail('priya@esempio.test', 'Priya', 20 + i * 5)).flat(), ...mail('priya@esempio.test', 'Priya', 1)]
    // e una risposta mandata a qualcun altro, perché il registro abbia la posta inviata
    store.salvaDocumenti([...priya, ...mail('ada@esempio.test', 'Ada', 60, { risposta: 60 })])
    await pg.ritratto()
    assert.ok(ab.tutte().some(a => a.chiave === 'posta.lascia:priya@esempio.test'), 'la riga c’è')
    assert.deepEqual(await pg.carte(), [])
  })
})
