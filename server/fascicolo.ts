// Tutto quello che Myynd tiene su una persona, in una forma che si legge.
//
// **Non è il pacco del trasloco, ed è la distinzione che tiene in piedi tutto
// il file.** Quello (`trasloco.ts`) serve a *spostare* un'installazione: è
// compresso, contiene l'indice byte per byte, e dentro ci sono le credenziali
// vere — quel file apre la casella di posta di chi l'ha fatto. Questo serve a
// rispondere a «dammi tutto quello che avete su di me»: è JSON, si apre con
// qualunque cosa, e **le credenziali non ci sono**. Chi lo chiede lo inoltra a
// un consulente, a un avvocato, o se lo tiene: un file che apre la sua posta
// non è la cosa giusta da mandare in giro, e mescolare i due scopi vorrebbe
// dire che uno dei due è sbagliato.
//
// **Si scrive a pezzi.** Un indice vero sono decine di migliaia di documenti
// con dentro il testo intero delle mail: costruirlo in memoria e poi
// serializzarlo vorrebbe dire due copie dell'indice dentro il processo — di
// tutti — per il tempo di una richiesta. Qui esce un documento alla volta, e in
// memoria non c'è mai più di quello.
//
// Da `store.ts` si legge e basta: quel file non lo tocca questo lavoro.

import * as chi from './chi.ts'
import * as cfg from './config.ts'
import * as conti from './conti.ts'
import * as store from './store.ts'
import * as automazioni from './automazioni.ts'
import type { Gettone } from './gettoni.ts'

/** Il posto di una credenziale, quando la credenziale non c'è. */
const TOLTA = '[credenziale rimossa / credential removed]'

/**
 * Le chiavi che dentro la configurazione sono chiavi.
 *
 * Un elenco di nomi e non «tutto quello che sembra un segreto»: indovinare
 * vorrebbe dire, il giorno che qualcuno aggiunge un campo, o togliere qualcosa
 * che serviva o — molto peggio — lasciar passare una password. Un nome nuovo va
 * aggiunto qui, e la prova in `fascicolo.test.ts` sta lì per accorgersene.
 */
const SEGRETE = new Set([
  'password', 'token', 'chiave', 'refresh', 'clientSecret', 'segreto', 'apiKey', 'sale', 'hash', 'parola'
])

/**
 * La configurazione senza le chiavi, ma con tutto il resto.
 *
 * Non passa da `config.pubblica()` di proposito: quella è fatta per
 * l'interfaccia e tiene solo i campi che una schermata disegna. Qui la domanda
 * è un'altra — «cosa avete scritto su di me» — e la risposta giusta è tutto,
 * meno quello che è una chiave. Un campo che nessuna schermata mostra è
 * proprio quello che chi chiede vuole vedere.
 *
 * `calendario.url` è a mano perché è l'unico indirizzo che *è* una credenziale:
 * chi ce l'ha legge l'agenda, senza password e senza scadenza. Gli altri `url`
 * — il fornitore compatibile, per dirne uno — sono indirizzi e basta.
 */
export function senzaLeChiavi(valore: unknown, dentro = ''): unknown {
  if (Array.isArray(valore)) return valore.map(v => senzaLeChiavi(v, dentro))
  if (!valore || typeof valore !== 'object') return valore
  const fuori: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(valore as Record<string, unknown>)) {
    if (SEGRETE.has(k) || (k === 'url' && dentro === 'calendario')) fuori[k] = v == null ? v : TOLTA
    else fuori[k] = senzaLeChiavi(v, k)
  }
  return fuori
}

/** Un pezzo di JSON già serializzato, con la sua chiave davanti. */
function riga(chiave: string, valore: unknown): string {
  return `${JSON.stringify(chiave)}:${JSON.stringify(valore, null, 2)}`
}

/**
 * Il fascicolo, un pezzo alla volta.
 *
 * Generatore sincrono e non asincrono, di proposito: tutto quello che legge —
 * `store`, `config` — è sincrono e lavora sull'utente della richiesta in corso,
 * e un generatore sincrono riprende esattamente nel contesto di chi lo tira.
 * I gettoni, che sono l'unica cosa da chiedere in modo asincrono, arrivano
 * già letti da fuori invece di rendere asincrono tutto il resto per una riga.
 */
export function* scrivi(gettoniDelConto: Gettone[] = []): Generator<string> {
  const c = cfg.leggi()
  const mio = conti.conto(chi.adesso() ?? '')

  yield '{\n'
  /*
   * La riga in cima, in tutt'e due le lingue.
   *
   * Non passa da `src/lingua.ts` e non può: quel dizionario lo legge il
   * browser, e questo file finisce in un allegato, in una stampa, sulla
   * scrivania di un consulente. Scriverla in una lingua sola vorrebbe dire
   * sbagliarla per metà di chi la legge, e sono due righe.
   */
  yield riga('cosaÈQuesto',
    'Tutto quello che Myynd tiene su di te. Le credenziali — password, token, chiavi — sono state tolte: ' +
    'per spostare un’installazione serve il file .myynd, non questo. / ' +
    'Everything Myynd holds about you. Credentials — passwords, tokens, keys — have been removed: ' +
    'to move an installation you need the .myynd file, not this one.')
  yield ',\n' + riga('quando', new Date().toISOString())

  // — chi sei per noi —
  yield ',\n' + riga('conto', {
    // ospitati l'indirizzo sta nei conti; in casa sta nella configurazione
    email: mio?.email ?? c.account?.email ?? null,
    dal: mio?.creato ?? null,
    nome: c.nome ?? null,
    ruolo: c.ruolo ?? null
  })

  // — la configurazione, senza le chiavi —
  yield ',\n' + riga('configurazione', senzaLeChiavi(c))

  // — i gettoni: quali esistono, non quali sono —
  yield ',\n' + riga('gettoni',
    gettoniDelConto.map(g => ({ nome: g.nome, ambito: g.ambito, creato: g.creato, usato: g.usato })))

  yield ',\n' + riga('conteggi', store.conteggi())

  /*
   * I documenti, uno per volta.
   *
   * Gli id prima e i documenti dopo: gli id di centomila documenti sono qualche
   * mega di stringhe, i documenti interi sono l'indice.
   */
  yield ',\n"documenti":[\n'
  let primo = true
  for (const id of store.idsConPrefisso('')) {
    const d = store.documento(id)
    if (!d) continue
    yield (primo ? '' : ',\n') + JSON.stringify(d)
    primo = false
  }
  yield '\n]'

  // — la lista —
  yield ',\n' + riga('compiti', { aperti: store.elencoCompiti(), chiusi: store.compitiChiusi(1000) })

  // — quello che ha imparato su di te —
  yield ',\n' + riga('memoria', {
    ritratto: store.blocchi(),
    convinzioni: store.convinzioni(),
    convinzioniChiuse: store.convinzioniStoriche()
  })

  // — le conversazioni, una alla volta: un filo lungo pesa quanto un documento —
  yield ',\n"chat":[\n'
  primo = true
  for (const ch of store.elencoChat()) {
    yield (primo ? '' : ',\n') + JSON.stringify({ ...ch, messaggi: store.messaggi(ch.id) })
    primo = false
  }
  yield '\n]'

  // — le automazioni, e cosa hanno fatto —
  yield ',\n' + riga('automazioni', automazioni.elenco())

  // — quello che è uscito da qui: mail mandate, file scritti —
  yield ',\n' + riga('azioni', store.azioni(5000))

  // — quanto è costato ragionare —
  yield ',\n' + riga('uso', store.usoPerGiorno(400))

  yield '\n}\n'
}
