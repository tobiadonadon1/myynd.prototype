// Il gusto impara da due gesti, e i modi di sbagliarlo sono silenziosi.
//
// Nessuno segnala mai «la rassegna si è chiusa su tre argomenti»: si smette di
// aprirla, e sembra che il mondo si sia fatto noioso. Questi test guardano i
// due lati che contano — che impari davvero da quello che apri, e che non possa
// murarti dentro quello che hai già letto.
//
//   node --test server/gusto.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { affinita, inParole, perIlModello, type Gusto } from './gusto.ts'
import { cernita, sceltaAMano, type Grezza } from './rassegna.ts'

const ora = Date.UTC(2026, 7, 31, 12)
const fa = (ore: number) => new Date(ora - ore * 3600_000).toISOString()

function finta(x: Partial<Grezza> & { id: string }): Grezza {
  return {
    titolo: `Titolo ${x.id}`, riassunto: '', fonte: 'A', link: `https://e.it/${x.id}`,
    argomento: 'mondo', quando: fa(2), ...x
  }
}

const CONTA: Gusto = {
  vale: true, lette: 8, scartate: 4,
  piace: ['intelligenza', 'artificiale', 'chip'],
  stufa: ['calcio', 'campionato'],
  fonti: ['Bloomberg']
}

const VUOTO: Gusto = { vale: false, lette: 1, scartate: 0, piace: [], stufa: [], fonti: [] }

test('quello che apri tira su, quello che butti tira giù', () => {
  const su = affinita(CONTA, 'Nuovo chip per l’intelligenza artificiale', 'BBC')
  const giu = affinita(CONTA, 'Il campionato riparte senza tre squadre', 'BBC')
  const zero = affinita(CONTA, 'Sciopero dei treni lunedì mattina', 'BBC')

  assert.ok(su > 0, 'quello che leggi non conta niente')
  assert.ok(giu < 0, 'quello che butti non conta niente')
  assert.equal(zero, 0, 'una notizia che non c’entra niente non dovrebbe muoversi')
})

test('il giornale che apri di più vale, ma meno delle parole', () => {
  const soloFonte = affinita(CONTA, 'Sciopero dei treni lunedì', 'Bloomberg')
  const soloParole = affinita(CONTA, 'Nuovo chip artificiale', 'BBC')
  assert.ok(soloFonte > 0 && soloFonte < soloParole,
    'la fonte pesa quanto o più dell’argomento: così si finisce a leggere un giornale solo')
})

test('senza abbastanza gesti non si conclude niente', () => {
  assert.equal(affinita(VUOTO, 'Nuovo chip per l’intelligenza artificiale', 'Bloomberg'), 0)
  assert.equal(perIlModello(VUOTO), '', 'manda al modello un profilo che non ha basi')
})

test('il gusto ha un tetto: non può scavalcare tutto quello che è successo', () => {
  // un titolo che azzecca ogni parola del profilo, e viene dal giornale giusto
  const massimo = affinita(
    { ...CONTA, piace: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'] },
    'a1 a2 a3 a4 a5 a6 a7 a8', 'Bloomberg'
  )
  assert.ok(massimo <= 6, `${massimo} punti: un titolo solo può spostare troppo`)
})

test('quello che apri E butti non diventa un difetto', () => {
  // «Iran» in una che leggi e in una che scarti: se finisse in tutt’e due gli
  // elenchi i due effetti si annullerebbero senza che nessuno lo veda
  const g: Gusto = { ...CONTA, piace: ['iran'], stufa: ['iran'] }
  assert.equal(affinita(g, 'Iran', 'BBC'), 0,
    'la stessa parola da tutt’e due le parti si annulla in silenzio')
})

// — la parte che conta: non deve chiudersi —

test('il gusto non può cancellare un argomento dalla rassegna', () => {
  // otto notizie di tecnologia che le piacciono da morire, e due di mondo che
  // non la toccano: la prima pagina deve contenere comunque il mondo
  const candidate = [
    ...Array.from({ length: 8 }, (_, i) => finta({
      id: `t${i}`, fonte: `Tech${i}`, argomento: 'tecnologia',
      titolo: `Intelligenza artificiale e chip, capitolo ${i} della vicenda`
    })),
    finta({ id: 'm1', fonte: 'BBC', argomento: 'mondo', titolo: 'Riaperto il valico di frontiera dopo sei settimane' }),
    finta({ id: 'm2', fonte: 'ANSA', argomento: 'mondo', titolo: 'Sciopero dei treni annunciato per lunedì mattina' })
  ]
  const scelte = sceltaAMano(candidate, '', ora, CONTA)
  const argomenti = new Set(scelte.map(s => candidate[s.n - 1].argomento))
  assert.ok(argomenti.has('mondo'),
    'la rassegna si è chiusa su quello che legge già: è così che diventa una camera d’eco')
})

test('a parità di argomento, davanti va quella che ti somiglia', () => {
  const candidate = [
    finta({ id: 'a', fonte: 'X', argomento: 'tecnologia', titolo: 'Sciopero dei treni annunciato per lunedì', quando: fa(1) }),
    finta({ id: 'b', fonte: 'Y', argomento: 'tecnologia', titolo: 'Nuovo chip per l’intelligenza artificiale', quando: fa(3) })
  ]
  const scelte = sceltaAMano(candidate, '', ora, CONTA)
  assert.equal(candidate[scelte[0].n - 1].id, 'b',
    'il gusto non sposta niente nemmeno dentro lo stesso argomento')
})

test('senza gusto la scelta resta quella di prima', () => {
  const candidate = Array.from({ length: 6 }, (_, i) => finta({ id: `n${i}`, fonte: `F${i}` }))
  assert.deepEqual(
    sceltaAMano(candidate, '', ora).map(s => s.n),
    sceltaAMano(candidate, '', ora, VUOTO).map(s => s.n),
    'un profilo senza basi cambia comunque la rassegna'
  )
})

test('quello che si racconta a lei si legge, e in due lingue', () => {
  assert.match(inParole(CONTA, false), /Apri/)
  assert.match(inParole(CONTA, true), /You open/)
  assert.match(inParole(VUOTO, true), /Not enough/)
})

test('la cernita non è toccata dal gusto: prima il mondo, poi le preferenze', () => {
  // il giro fra i giornali resta il primo criterio, e non conosce il gusto
  const tante = [
    finta({ id: 'a', fonte: 'Uno', titolo: 'Il grano vola dopo la chiusura dello stretto' }),
    finta({ id: 'b', fonte: 'Uno', titolo: 'Apple presenta i portatili col processore nuovo' }),
    finta({ id: 'c', fonte: 'Due', titolo: 'Sciopero dei treni annunciato per lunedì mattina' })
  ]
  assert.equal(cernita(tante, ora)[1].fonte, 'Due', 'un giornale solo si prende le prime due')
})
