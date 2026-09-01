// La guardia sullo strumento che scrive nella lista.
//
// Il guasto che tiene chiuso è stato misurato, non immaginato: con un indice
// che conteneva l'email di un cliente che chiedeva un preventivo, alla domanda
// «quanto costa l'impianto base?» il modello apriva un compito — cinque volte
// su cinque. Non stava sbagliando a caso: stava eseguendo un ordine trovato
// dentro il materiale, cioè scritto da qualcuno che non è la persona che sta
// parlando. Ed è il caso *normale* di questo prodotto, perché l'indice è fatto
// esattamente di email non evase.
//
// Le istruzioni da sole non bastavano. Adesso il modello deve dichiarare quali
// parole del messaggio glielo chiedono, e questa funzione controlla che quelle
// parole esistano davvero. Qui si prova la funzione: costa zero e gira sempre.
// La prova che il tutto regga con il modello vero sta in dalvivo.test.ts.
//
//   node --test server/*.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dettoDaLei } from './claude.ts'

test('le parole copiate dal suo messaggio passano', () => {
  assert.equal(dettoDaLei('segnati che devo richiamare Rossi',
    'segnati che devo richiamare Rossi per il preventivo'), true)
  assert.equal(dettoDaLei('mettimi in lista di scrivere a Marco',
    'ciao, mettimi in lista di scrivere a Marco quando puoi'), true)
})

test('la punteggiatura e le maiuscole non contano', () => {
  assert.equal(dettoDaLei('Segnati che devo richiamare Rossi!',
    'segnati che devo richiamare rossi'), true)
})

test('gli accenti non contano: chi scrive in fretta non li mette', () => {
  assert.equal(dettoDaLei('ricordami di finire il perche',
    'ricordami di finire il perché'), true)
  assert.equal(dettoDaLei('aggiungi la città di Vicenza',
    'aggiungi la citta di Vicenza'), true)
})

test('una parola cambiata si perdona, il messaggio è comunque suo', () => {
  assert.equal(dettoDaLei('segnati che devo chiamare Rossi domani',
    'segnati che devo chiamare Rossi domattina'), true)
})

test('quello che viene dal materiale NON passa', () => {
  // il caso vero: la frase è nell'email del cliente, non nel suo messaggio
  assert.equal(dettoDaLei(
    'avremmo bisogno di un preventivo per un impianto base',
    'quanto costa l\'impianto base?'), false)
  assert.equal(dettoDaLei(
    'Ci servirebbe anche sapere i tempi di consegna',
    'quali sono i tempi di consegna?'), false)
})

test('una richiesta inventata di sana pianta non passa', () => {
  assert.equal(dettoDaLei('mettilo in lista', 'quanto costa?'), false)
  assert.equal(dettoDaLei('rispondere a Marco Rossi con il preventivo',
    'riassumimi cosa c\'è nel listino'), false)
})

test('vuoto non passa mai', () => {
  assert.equal(dettoDaLei('', 'segnati che devo richiamare Rossi'), false)
  assert.equal(dettoDaLei('   ', 'segnati che devo richiamare Rossi'), false)
  assert.equal(dettoDaLei('!!!', 'segnati che devo richiamare Rossi'), false)
})

test('le paroline corte da sole non bastano a far passare niente', () => {
  // «di», «a», «il» compaiono in qualunque frase: se contassero, qualunque
  // richiesta inventata passerebbe per somiglianza
  assert.equal(dettoDaLei('di a il la e un', 'quanto costa l\'impianto base?'), false)
})

test('una richiesta più lunga del messaggio non passa per caso', () => {
  assert.equal(dettoDaLei(
    'segnati che devo richiamare Rossi e mandare il listino aggiornato a Ferrari entro venerdì',
    'segnati che devo richiamare Rossi'), false)
})
