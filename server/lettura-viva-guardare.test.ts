// Chi ricarica durante la lettura torna a guardarla, e solo allora (P4).
//
//   node --test server/lettura-viva-guardare.test.ts

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// La cartella si sceglie prima di importare config.ts (letta all'import): senza,
// `primaLettura.inCoda` (in memoria, non tocca il disco) andrebbe bene lo
// stesso, ma `primaLettura.continua` guarda anche le fonti collegate, e senza
// questo leggerebbe la configurazione vera in ~/.myynd.
const CASA = mkdtempSync(join(tmpdir(), 'myynd-viva-guardare-'))
process.env.MYYND_DATI = CASA
const viva = await import('./lettura-viva.ts')
const prima = await import('./prima-lettura.ts')
const store = await import('./store.ts')
const cfg = await import('./config.ts')

// Vuota, come `chi.adesso() ?? ''` fuori da una richiesta: senza un conto vero
// registrato, `prima.continua` (che avvolge il lavoro in `chi.dentro`) non
// deve cercare una cartella per persona che non esiste.
const CONTO = ''
// Un giro solo: la fonte finta non finisce mai da sé (la promessa del test la
// tiene in mano), e senza questo il resto aspetterebbe `pausa` fra un giro e
// l'altro fino a `giri` volte prima di arrendersi.
before(() => { prima.perProva({ pausa: 10, giri: 1, occupato: 10 }) })
beforeEach(() => { viva.chiudi(CONTO); prima.fermaRiprese(); store.azzeraTutto(); cfg.scrivi({}, { togli: [...cfg.CON_SEGRETI] }) })
after(() => { prima.perProva(null); store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

test('una prima lettura chiesta da lui: si guarda, a qualunque passo', () => {
  viva.apri(CONTO, { tutte: true, prima: true, fonti: ['calendario'] })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), true)
  assert.equal(viva.daGuardare(CONTO, 'verifica'), true)
})

test('sul passo delle fonti, «Leggi» quando il giro di fondo e il resto hanno già finito i novanta giorni: si guarda', () => {
  viva.apri(CONTO, { tutte: true, prima: false, fonti: ['calendario', 'desktop', 'postamac'] })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), true)
})

test('la stessa lettura dopo il passo delle fonti, il giro di fondo, una fonte sola, una lettura finita: no (counter-case)', () => {
  const v = viva.apri(CONTO, { tutte: true, prima: false, fonti: ['calendario'] })
  assert.equal(viva.daGuardare(CONTO, 'verifica'), false, '«Rileggi tutto» dalle Fonti non riporta nessuno all’avvio')
  assert.equal(viva.daGuardare(CONTO, 'completo'), false)
  v.avvisa({ fase: 'fine', totale: 0 })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), false, 'finita, non c’è più niente da guardare')

  viva.apri(CONTO, { tutte: true, prima: true, fonti: ['calendario'], chiesta: false })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), false, 'il giro dei dieci minuti non è una lettura sua')

  viva.chiudi(CONTO)
  assert.equal(viva.daGuardare(CONTO, 'fonte'), false, 'nessuna lettura, e il resto della prima lettura non gira')
})

/*
 * Il guasto verificato il 25 set: il resto della prima lettura (P4) legge una
 * fonte alla volta con un `Viva` suo (`tutte: false, prima: false`, vedi
 * `leggiUna` in server/index.ts). Chi ricaricava mentre il resto leggeva la
 * posta (la più lenta, l'ultima nell'ordine, con il calendario già finito o
 * saltato prima di lei) tornava sempre all'introduzione, perché `daGuardare`
 * guardava solo quel `Viva` e non il fatto che il resto stesse ancora girando
 * (`primaLettura.inCoda`).
 */
test('il resto della prima lettura legge una fonte alla volta: si guarda comunque, mentre gira (P4, 25 set)', async () => {
  // La posta è collegata e la sua prima lettura non è ancora finita: `inCorso()`
  // (che `continua` guarda per sapere cosa manca) la trova.
  cfg.aggiorna({ posta: { host: 'imap.example.invalid', porta: 993, utente: 'prova@example.invalid', password: 'x' } })

  viva.apri(CONTO, { tutte: false, prima: false, fonti: ['posta'] })
  assert.equal(viva.daGuardare(CONTO, 'fonte'), false, 'il suo Viva da solo non basta più')

  // Il resto sta davvero girando in sottofondo per questo conto: una `leggiUna`
  // finta che non torna finché il test non gliela lascia tornare, proprio come
  // una casella da 912 messaggi che ancora non ha finito.
  let lascia: (() => void) | null = null
  const inAttesa = new Promise<void>(r => { lascia = r })
  const gira = prima.continua(CONTO, async () => { await inAttesa; return 'letta' })
  assert.equal(prima.inCoda(CONTO), true, 'il resto è in volo')
  assert.equal(viva.daGuardare(CONTO, 'fonte'), true, 'si guarda anche con il suo Viva a fonte sola')
  assert.equal(viva.daGuardare(CONTO, 'verifica'), true, 'a qualunque passo, come una prima lettura vera')

  lascia!()
  await gira
  assert.equal(prima.inCoda(CONTO), false, 'finito, il resto non gira più')
  assert.equal(viva.daGuardare(CONTO, 'fonte'), false, 'counter-case: senza il resto in volo, un Viva a fonte sola non basta')
})
