// I suggerimenti si mostrano solo dopo una prova passata (P6).
//
//   node --test server/scoperte-prova.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-scoperte-prova-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', desktop: { cartelle: [dati] } }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const cfg = await import('./config.ts')
const auto = await import('./automazioni.ts')
const collaudo = await import('./collaudo.ts')
const discovery = await import('./scoperte.ts')
after(() => {
  discovery.perProva(null); collaudo.perProva(null); auto.perProva(null)
  store.chiudiIndici()
  rmSync(dati, { recursive: true, force: true })
})

progetti.scrivi({ nome: 'Nextas', obiettivo: 'Review supplier documents and client proposals' })
const recente = (g: number) => new Date(Date.now() - g * 86_400_000).toISOString()
store.salvaDocumenti([
  { id: 'ev-aruba', fonte: 'desktop', tipo: 'file', titolo: 'Supplier bill, hosting', corpo: 'Nextas: Please review this document. hosting', autore: 'Aruba S.p.A. <fatture@aruba.it>', quando: recente(2), percorso: '/Users/test/Documents/a.pdf' },
  { id: 'ev-fastweb', fonte: 'desktop', tipo: 'file', titolo: 'Supplier bill, line', corpo: 'Nextas: Please review this document. line', autore: 'Fastweb <billing@fastweb.it>', quando: recente(1), percorso: '/Users/test/Documents/b.pdf' }
] as never)

let chiamate = 0
discovery.perProva({
  collegato: () => true,
  chiediJSON: async () => {
    chiamate++
    return { automazioni: [{
      nome: 'Supplier bills', spiega: 'Every Tuesday, the supplier bills from the desktop in this week\'s list.',
      perche: 'bills from different suppliers', prove: ['ev-aruba', 'ev-fastweb'],
      quando: { ogni: 'settimana', giorno: 2, ora: 17 }, guarda: { cerca: 'supplier bill' },
      attrezzi: ['desktop.leggi'], metti: { inLista: 'settimana', modo: 'io' }
    }] }
  }
})
collaudo.perProva({ collegato: () => true, chiediJSON: async () => ({ giudizi: [{ n: 0, giusta: true, perche: 'A bill.' }, { n: 1, giusta: true, perche: 'A bill.' }] }) })

const conteggioProve = () => (store.default.prepare('SELECT COUNT(*) AS n FROM prove').get() as { n: number }).n
let s: Awaited<ReturnType<typeof discovery.suggerimenti>>[number]

test('una proposta non provata non si mostra, e aprire la pagina non costa niente', async () => {
  const lista = await discovery.suggerimenti(true)
  assert.equal(lista.length, 1)
  s = lista[0]
  const prima = chiamate
  assert.deepEqual(discovery.inVetrina(await discovery.suggerimenti()), [])
  assert.deepEqual(discovery.nuoviInVetrina(), [])
  assert.equal(chiamate, prima, 'nessun modello')
  assert.equal(conteggioProve(), 0, 'nessuna prova')
})

test('una prova d\'idea «poco» la tiene nascosta, e non si riprova per quattordici giorni', async () => {
  assert.equal(discovery.provaLeIdee(), 1)
  await collaudo.finche(20_000)
  const imp = discovery.improntaDi(s)
  const p = store.proveDi(`idea:${imp}`, 'prova', 1)[0]
  assert.equal(p.origine, 'suggerimento')
  assert.equal(p.stato, 'finita')
  assert.deepEqual(discovery.inVetrina([s]), [], 'due giudicati: ancora pochi')
  assert.equal(discovery.provaLeIdee(), 0, 'bocciata: non si riprova')
})

test('una prova passata la mostra col suo conto; cambiare lingua non la cambia, cambiare ricetta sì', () => {
  const imp = discovery.improntaDi(s)
  store.nuovaProva({ id: 'passata', automazione: `idea:${imp}`, tipo: 'prova', stato: 'finita', origine: 'suggerimento', impronta: imp })
  discovery.provata(imp, { ...collaudo.riassunto('passata')!, esito: 'pronta', giusti: 9, giudicati: 10 })
  const v = discovery.inVetrina([s])
  assert.equal(v.length, 1)
  assert.equal(v[0].prova?.id, 'passata')
  cfg.scrivi({ ...cfg.leggi(), lingua: 'it' })
  assert.equal(discovery.improntaDi(s), imp)
  assert.equal(discovery.inVetrina([s]).length, 1)
  cfg.scrivi({ ...cfg.leggi(), lingua: 'en' })
  assert.deepEqual(discovery.inVetrina([{ ...s, guarda: { cerca: 'something else' } }]), [])
  // quelle locali non si possono provare: non si mostrano
  assert.deepEqual(discovery.inVetrina([{ ...s, id: 'mind-invoices' }]), [])
})

test('adottata, la prova passa all\'automazione e non risulta cambiata', () => {
  const a = discovery.adotta(s.id)
  const r = collaudo.ultimaDi(a.id)
  assert.ok(r, 'la prova segue l\'automazione adottata')
  assert.equal(r.cambiata, false)
})
