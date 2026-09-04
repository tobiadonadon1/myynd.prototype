// Il conto giusto, e il recinto.
//
// Due cose sole, e sono le due che se sbagliano non fanno rumore.
//
// La prima: la chiave API di Myynd non deve *mai* finire nell'ambiente di Claude
// Code. Se ci finisse, Claude Code la userebbe — è la sua prima scelta — e ogni
// lavoro che credevamo gratis arriverebbe sulla bolletta sbagliata. Non si
// romperebbe niente: funzionerebbe tutto, e il conto lo scopriresti a fine mese.
//
// La seconda: da qui non si tocca niente. Questa strada esiste per rispondere a
// domande, non per aprire file — e il programma che lancia sa fare tutte e due.
//
//   node --test server/abbonamento.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const QUI = new URL('.', import.meta.url).pathname
const sorgente = readFileSync(join(QUI, 'abbonamento.ts'), 'utf8')

test('la chiave di Myynd non entra nell’ambiente di Claude Code', () => {
  assert.match(sorgente, /const \{ ANTHROPIC_API_KEY: _mia, \.\.\.ambiente \} = process\.env/,
    'senza questa riga il lavoro finisce sul conto sbagliato, e sembra tutto a posto')
  assert.match(sorgente, /env: ambiente\(\)/, 'passa process.env intero: la chiave va con lui')
})

/**
 * Da quando i processi sono due, dimenticarsene in uno solo basta.
 *
 * Il primo test qui sopra guarda che la riga esista. Questo guarda che valga
 * per *tutti* — perché il modo in cui questa protezione si perde non è che
 * qualcuno la cancelli, è che qualcuno aggiunga un terzo `spawn` e non la copi.
 */
test('ogni processo lanciato parte senza la chiave', () => {
  const lanci = sorgente.match(/spawn\(exe,/g)?.length ?? 0
  const puliti = sorgente.match(/env: ambiente\(\)/g)?.length ?? 0
  assert.ok(lanci >= 2, 'ci si aspetta almeno due strade: la risposta intera e quella in streaming')
  assert.equal(puliti, lanci, 'un `spawn` non passa da `ambiente()`: quel lavoro finisce sul conto sbagliato')
})

test('le due strade hanno lo stesso recinto', () => {
  // il recinto è in `argomenti()`: se una delle due si costruisse la sua lista,
  // un attrezzo negato domani lo sarebbe per una sola
  const usi = sorgente.match(/argomenti\(/g)?.length ?? 0
  assert.ok(usi >= 3, 'la lista degli argomenti non è condivisa fra le due strade')
})

test('in streaming esce il testo, non il pensiero', () => {
  // `--include-partial-messages` manda anche i `thinking_delta`: sono il
  // ragionamento, non la risposta, e non vanno sotto gli occhi di nessuno
  assert.match(sorgente, /delta\?\.type !== 'text_delta'/,
    'senza questo filtro il ragionamento finisce dritto nella chat')
})

test('«pronto» non diventa «no» perché una chiamata è andata storta', () => {
  // `pronto()` risponde a «Claude è collegato?», che è una domanda sullo stato
  // dell'app: il riposo di cinque minuti riguarda la prossima richiesta, non
  // quello che si mostra a chi guarda
  const p = sorgente.slice(sorgente.indexOf('export function pronto'))
  assert.ok(!p.slice(0, 120).includes('spento'), '`pronto()` guarda il riposo: lo stato lampeggerebbe')
})

/**
 * Il posto dell'abbonamento nella catena, che è la ragione per cui esiste.
 *
 * Qui c'era `p.frontiera || !conLaChiave()`: il lavoro grosso passava di qui
 * sempre, quello piccolo solo quando l'alternativa era una bolletta. Era una
 * risposta a «cosa conviene», e valeva finché l'abbonamento era un interruttore.
 *
 * Adesso è una scelta: due strade per pagare lo stesso Claude, e una persona che
 * dice quale. `disponibile()` contiene già quella scelta, quindi la condizione
 * non guarda più *quale* lavoro sia — chi sceglie l'abbonamento sta chiedendo di
 * non avere una bolletta, e mandargli sulla chiave i lavori più frequenti
 * sarebbe rispondere a una domanda che non ha fatto. Chi vuole tutt'e due
 * installa un modello di casa, che viene prima di questo ramo.
 */
test('scelto l’abbonamento, ci passa tutto il lavoro e non solo quello grosso', () => {
  const m = readFileSync(join(QUI, 'modello.ts'), 'utf8')
  // la seconda condizione — `!fornitore()` — è arrivata con il fornitore
  // compatibile con OpenAI: se è lui il motore scelto, l'abbonamento non
  // c'entra, perché è un modo di pagare Claude di meno e non un motore in più
  assert.match(m, /if \(abbonamento\.disponibile\(\) && !fornitore\(\)\) \{/,
    'la catena è cambiata: rileggere perché prima di riscriverla')
  // sull'`if`, non su tutto il file: il commento qui sopra la vecchia regola la
  // cita apposta, e una prova che legge i commenti non prova niente
  assert.ok(!/if \([^\n]*p\.frontiera \|\| !conLaChiave\(\)/.test(m),
    'è tornata la vecchia regola: chi ha scelto l’abbonamento si ritrova i lavori piccoli sulla chiave')
  assert.match(m, /return conLaChiave\(\) \|\| abbonamento\.pronto\(\)/,
    '«Claude è collegato?» è tornata a voler dire «c’è una chiave»: chi collega solo l’abbonamento si rivede dire di collegare Claude')
})

/**
 * La scelta è esplicita, e si può cambiare idea.
 *
 * `claudeCon` è quella che comanda; il vecchio `abbonamento.attivo` resta letto
 * perché una configurazione scritta prima di oggi non deve cambiare
 * comportamento sotto i piedi di nessuno.
 */
test('con quale dei due si paga Claude lo dice `claudeCon`, e il vecchio interruttore vale ancora', () => {
  assert.match(sorgente, /if \(c\.claudeCon\) return c\.claudeCon === 'abbonamento'/,
    'la scelta esplicita non comanda più')
  assert.match(sorgente, /return c\.abbonamento\?\.attivo === true/,
    'una configurazione vecchia non si legge più: chi aggiorna si ritrova l’abbonamento spento')
})

test('le bozze passano dall’abbonamento quando è quello scelto', () => {
  // finché non lo facevano, «lavora con l'abbonamento» non valeva per la cosa
  // che l'app fa di più — e nessuna schermata lo diceva
  const c = readFileSync(join(QUI, 'claude.ts'), 'utf8')
  assert.match(c, /const soloAbbonamento = abbonamento\.disponibile\(\)/,
    'le bozze non guardano più l’abbonamento: tornano tutte sulla chiave')
  // senza attrezzi non ha senso mandargli le loro istruzioni: gli si dice che
  // quello che ha davanti è tutto quello che avrà
  assert.match(c, /non puoi cercarne altro/,
    'gli si chiede una bozza con gli attrezzi che non ha: cercherà, non troverà, e lo dirà come un guasto')
})

test('anche la chat passa dall’abbonamento, non solo il resto', () => {
  // è la cosa più cara e più frequente che l'app fa: se resta sull'SDK,
  // l'opzione «usa il tuo abbonamento» è una promessa che non si mantiene
  const c = readFileSync(join(QUI, 'claude.ts'), 'utf8')
  assert.match(c, /abbonamento\.inStreaming\(/, 'la chat non passa dall’abbonamento')
  assert.ok(c.indexOf('abbonamento.inStreaming(') < c.indexOf('const arnesi'),
    'il ramo dell’abbonamento sta dopo il giro degli attrezzi: non lo raggiungerebbe mai')
})

test('non gli si dà nessun attrezzo per toccare le cose', () => {
  assert.match(sorgente, /'--restricted'/, 'senza, può lanciare comandi')
  for (const a of ['Read', 'Write', 'Edit', 'Bash', 'WebFetch']) {
    assert.ok(sorgente.includes(`'${a}'`), `«${a}» non è fra gli attrezzi negati`)
  }
})

test('gira in una cartella vuota, non dentro un progetto', () => {
  // lanciato dentro un progetto si porterebbe dietro il CLAUDE.md di quel
  // progetto: istruzioni di qualcun altro dentro una domanda che non c'entra
  assert.match(sorgente, /cwd: VUOTA/)
  // `RADICE` e non più `DIR`: la cartella dei dati adesso è per persona, ma
  // questa è vuota apposta e non contiene niente di nessuno — sta alla radice
  assert.match(sorgente, /const VUOTA = join\(RADICE, 'vuota'\)/)
})

test('il prompt passa dallo stdin, non dagli argomenti', () => {
  // `--disallowed-tools` è variadico: messo prima del prompt se lo mangia, e
  // ogni parola della domanda diventa il nome di un attrezzo da negare
  assert.ok(!/args\.push\(.*prompt/i.test(sorgente), 'il prompt è finito fra gli argomenti')
})

test('non si accende da solo: è il conto di una persona', async () => {
  const a = await import('./abbonamento.ts')
  // senza `abbonamento.attivo === true` in configurazione resta spento, anche
  // se `claude` è installato
  assert.equal(typeof a.scelto, 'function')
  assert.equal(typeof a.disponibile, 'function')
  const q = await a.stato()
  assert.equal(a.disponibile(), a.scelto() && q.installato && !q.inRiposo)
})
