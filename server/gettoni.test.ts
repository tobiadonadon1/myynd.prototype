// I gettoni con un ambito, e il confine che li rende possibili.
//
// La prova che conta più di tutte è una sola: **un gettone `desktop` non deve
// arrivare a `/api/conto/…`.** Tutto il resto — che nasca, che si elenchi, che
// si revochi — è contorno; se cade quella, quello che resta è una chiave
// eterna che apre l'API intera e sta scritta in chiaro dentro un file di
// configurazione su un portatile. Sarebbe peggio del token di sessione che
// questi gettoni sostituiscono.
//
//   node --test server/gettoni.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Request, Response } from 'express'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-gettoni-'))
process.env.MYYND_DATI = CASA
// più persone sulla stessa installazione è il caso ospitato, ed è lì che
// questi gettoni servono davvero
process.env.RAILWAY_ENVIRONMENT = 'prova'

const conti = await import('./conti.ts')
const gettoni = await import('./gettoni.ts')
const auth = await import('./auth.ts')
const chi = await import('./chi.ts')

let anna = ''
let bruno = ''

before(async () => {
  const a = await conti.registra('anna@esempio.it', 'passwordlunga1')
  const b = await conti.registra('bruno@esempio.it', 'passwordlunga2')
  assert.ok(a.ok && b.ok)
  anna = a.ok ? a.id : ''
  bruno = b.ok ? b.id : ''
})

after(() => {
  delete process.env.MYYND_DATI
  delete process.env.RAILWAY_ENVIRONMENT
  rmSync(CASA, { recursive: true, force: true })
})

/**
 * Una bussata alla guardia, con quello che la guardia guarda davvero.
 *
 * Non un finto Express: la guardia legge tre cose — il percorso,
 * l'intestazione, e cosa fa `next` — e passare da un server vero vorrebbe dire
 * provare Express invece di provare il confine.
 */
function bussa(percorso: string, portato: string):
  Promise<{ stato: number; errore: string | null; utente: string | null }> {
  return new Promise(risolvi => {
    let stato = 200
    const req = { path: percorso, headers: { authorization: `Bearer ${portato}` } } as unknown as Request
    const res = {
      status(n: number) { stato = n; return this },
      json(c: { errore?: string }) { risolvi({ stato, errore: c.errore ?? null, utente: null }) }
    } as unknown as Response
    // dentro `next` il contesto è già aperto: è lì che si vede di chi è la richiesta
    const passa = () => risolvi({ stato, errore: null, utente: chi.adesso() })
    void auth.guardia(req, res, passa)
  })
}

const CARICA = '/api/connettori/desktop/carica'

// — il giro di vita —

test('nasce con un nome, si vede una volta, e si ritrova dall’impronta', async () => {
  const e = await gettoni.crea(anna, 'il MacBook di Anna', 'desktop')
  assert.ok(e.ok)
  const g = e.ok ? e.gettone : ''
  assert.ok(g.startsWith(gettoni.PREFISSO), 'senza prefisso la guardia non saprebbe che strada prendere')

  const trovato = await gettoni.trova(g)
  assert.equal(trovato?.utente, anna)
  assert.equal(trovato?.ambito, 'desktop')

  // nell'elenco c'è il nome, mai il gettone
  const elenco = await gettoni.elenco(anna)
  assert.equal(elenco.length, 1)
  assert.equal(elenco[0]!.nome, 'il MacBook di Anna')
  assert.ok(!JSON.stringify(elenco).includes(g), 'il gettone in chiaro esce dall’elenco')
})

test('senza nome non nasce, e con un ambito che non esiste nemmeno', async () => {
  assert.equal((await gettoni.crea(anna, '   ', 'desktop')).ok, false)
  assert.equal((await gettoni.crea(anna, 'buono', 'tutto')).ok, false)
})

test('revocare è immediato, e non si revoca quello di un altro', async () => {
  const e = await gettoni.crea(bruno, 'il fisso di Bruno', 'desktop')
  assert.ok(e.ok)
  const id = e.ok ? e.id : ''
  const g = e.ok ? e.gettone : ''

  // Anna non può togliere di mezzo il gettone di Bruno
  assert.equal(await gettoni.revoca(anna, id), false)
  assert.ok(await gettoni.trova(g), 'il gettone di Bruno è sparito per mano di Anna')

  assert.equal(await gettoni.revoca(bruno, id), true)
  assert.equal(await gettoni.trova(g), null)
})

test('l’ultimo uso si segna una volta all’ora, non a ogni richiesta', async () => {
  const e = await gettoni.crea(anna, 'quello che spinge', 'desktop')
  assert.ok(e.ok)
  const g = e.ok ? e.gettone : ''
  const id = e.ok ? e.id : ''

  await gettoni.trova(g)
  const primo = (await gettoni.elenco(anna)).find(x => x.id === id)?.usato
  assert.ok(primo, 'il primo uso non è stato segnato')

  // cinquanta richieste di fila — che è quello che fa una spinta vera — non
  // devono diventare cinquanta scritture
  await new Promise(f => setTimeout(f, 5))
  for (let i = 0; i < 50; i++) await gettoni.trova(g)
  const dopo = (await gettoni.elenco(anna)).find(x => x.id === id)?.usato
  assert.equal(dopo, primo, 'la data è stata riscritta a ogni richiesta')

  // dimenticato l'ultimo giro — come un processo appena riacceso — si riscrive
  gettoni.perProva.dimentica()
  await gettoni.trova(g)
  assert.notEqual((await gettoni.elenco(anna)).find(x => x.id === id)?.usato, primo)
})

// — il confine, che è il punto di tutto —

test('un gettone desktop arriva alle due rotte della spinta, e a nient’altro', async () => {
  const e = await gettoni.crea(anna, 'il Mac di casa', 'desktop')
  assert.ok(e.ok)
  const g = e.ok ? e.gettone : ''

  for (const rotta of ['/api/connettori/desktop/carica', '/api/connettori/desktop/carica-file']) {
    const r = await bussa(rotta, g)
    assert.equal(r.stato, 200, `${rotta} doveva passare`)
    assert.equal(r.utente, anna, `${rotta} è passata senza sapere di chi è`)
  }

  /*
   * Le rotte che non deve toccare. `/api/conto/…` è la lista che conta:
   * cambiare la password, cancellare il conto, portarsi via tutto. Ma anche una
   * lettura qualunque — la chat, la memoria — deve dire di no: la risposta di
   * serie è no, e quello che passa è solo quello scritto nell'ambito.
   */
  for (const rotta of [
    '/api/conto/password', '/api/conto/cancella', '/api/conto/dati', '/api/conto/gettoni',
    '/api/conto/esci-ovunque', '/api/trasloco/esporta', '/api/stato', '/api/memoria', '/api/chat'
  ]) {
    const r = await bussa(rotta, g)
    assert.equal(r.stato, 403, `${rotta} ha lasciato passare un gettone desktop`)
    assert.equal(r.utente, null, `${rotta} ha aperto il contesto a un gettone che non ci arriva`)
  }
})

test('un prefisso giusto con dentro niente non apre niente', async () => {
  const r = await bussa(CARICA, gettoni.PREFISSO + 'a'.repeat(48))
  assert.equal(r.stato, 401)
})

test('una sessione vera continua ad arrivare dappertutto', async () => {
  const sessione = await conti.perProva.apri(anna)
  for (const rotta of [CARICA, '/api/conto/password', '/api/stato']) {
    const r = await bussa(rotta, sessione)
    assert.equal(r.stato, 200, `${rotta} ha rifiutato una sessione buona`)
    assert.equal(r.utente, anna)
  }
})

test('un gettone non è una sessione: `valida` continua a dire di no', async () => {
  // `/api/auth` chiede questo per dire all'interfaccia «sei dentro»: un gettone
  // per una macchina non è qualcuno che ha aperto l'app
  const e = await gettoni.crea(anna, 'non è una scheda', 'desktop')
  assert.ok(e.ok)
  assert.equal(await auth.valida(e.ok ? e.gettone : ''), false)
})

// — quando il conto se ne va —

test('cancellare il conto porta via i suoi gettoni', async () => {
  const e = await gettoni.crea(bruno, 'da portare via', 'desktop')
  assert.ok(e.ok)
  const g = e.ok ? e.gettone : ''
  assert.ok(await gettoni.trova(g))

  await conti.cancella(bruno)
  assert.equal(await gettoni.trova(g), null, 'il gettone di un conto cancellato apre ancora')
  assert.equal((await gettoni.elenco(bruno)).length, 0)
})
