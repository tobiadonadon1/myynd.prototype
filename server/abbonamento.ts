// Far ragionare Myynd con l'abbonamento di chi lo usa, invece che a consumo.
//
// È la risposta alla domanda che decide se questo prodotto si può vendere: chi
// compra Myynd non deve trovarsi una bolletta a fine mese. Una chiave API si
// paga a token, e su un'app che gira tutti i giorni diventa in fretta la voce di
// spesa più grossa — mentre l'abbonamento a Claude quella persona quasi sempre
// ce l'ha già, e lo paga comunque.
//
// Come, senza chiedere una password a nessuno: sul suo computer c'è `claude`,
// installato e già entrato con il *suo* account. Myynd non tiene le sue
// credenziali, non le vede e non le manda da nessuna parte — lancia un
// programma che è già lì e legge quello che risponde. È lo stesso ragionamento
// di `agenda.ts` con il Calendario del Mac: non chiedere una chiave per una
// cosa che è già collegata.
//
// La differenza con `lavoro.ts`, che lancia lo stesso programma: là gli si dà
// una cartella e il permesso di cambiarla; qui non gli si dà niente. Niente
// file, niente comandi, niente rete: una domanda e una risposta. `--restricted`
// più l'elenco degli attrezzi negati è il recinto, e la cartella di lavoro è una
// cartella vuota apposta.
//
// Il prezzo, che è giusto conoscere prima di accenderlo, e che qui è misurato
// invece che stimato: una domanda di quattro parole, con un prompt di sistema
// di una riga, costa 5.650 token. Non sono la domanda — sono il preambolo che
// Claude Code si porta dietro comunque. E non si ammortizzano stando attenti:
// ogni `claude -p` è una sessione nuova, quindi la seconda chiamata identica li
// riscrive da capo. (`cache_read_input_tokens: 0`, due volte di fila.)
//
// Da cui la regola che governa `modello.ts`. Sul suo abbonamento quei token non
// si pagano in denaro, ma si pagano sul suo tetto d'uso: cinquemilaseicento per
// una risposta lunga sono niente, cinquemilaseicento per dare un titolo a una
// chat sono tutto il costo e nessun beneficio. Quindi il lavoro piccolo passa
// di qui soltanto quando l'alternativa è peggio — cioè quando non c'è un
// modello di casa *e* non c'è una chiave. Fra spendere il suo tetto e mandargli
// una bolletta, si spende il tetto.

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DIR, leggi, modello } from './config.ts'
import { installato } from './lavoro.ts'

/**
 * Una cartella vuota, che è tutto quello che gli diamo da guardare.
 *
 * Claude Code, partendo, legge il `CLAUDE.md` della cartella in cui si trova:
 * lanciato dentro un progetto si porterebbe dietro le istruzioni di quel
 * progetto dentro una domanda che non c'entra niente. Da qui non c'è niente da
 * leggere, ed è il punto.
 */
const VUOTA = join(DIR, 'vuota')

/** Gli attrezzi che non gli servono: non deve toccare niente, deve rispondere. */
const NEGATI = [
  'Read', 'Write', 'Edit', 'NotebookEdit', 'Glob', 'Grep',
  'WebSearch', 'WebFetch', 'Task', 'TodoWrite', 'Bash'
]

/** Il nome che Claude Code dà ai modelli. */
function alias(): string {
  const m = modello()
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('opus')) return 'opus'
  return 'sonnet'
}

/**
 * Acceso o spento.
 *
 * Assente vuol dire spento: a differenza del modello di casa, questo si accende
 * di proposito. Manda il lavoro di qualcun altro sul suo abbonamento, e una cosa
 * del genere non si fa di nascosto nemmeno quando conviene a lui.
 */
export function scelto(): boolean {
  return leggi().abbonamento?.attivo === true
}

/**
 * Quando l'ultimo tentativo è andato male.
 *
 * Resta per quello che non si può sapere prima: il tetto d'uso finito, un
 * limite di frequenza, un processo che muore. Cinque minuti di silenzio evitano
 * che ogni singolo lavoro paghi due secondi di processo che parte e muore prima
 * di andare dove sarebbe dovuto andare subito.
 */
let spento = 0
const RIPOSO = 5 * 60_000

/**
 * Acceso e installato: cioè Myynd *può* ragionare per questa strada.
 *
 * Diverso da `disponibile()` di un dettaglio che conta. Questo non guarda il
 * riposo, e non deve: serve a rispondere «Claude è collegato?» — una domanda
 * sullo stato dell'app, che non può diventare «no» per cinque minuti perché una
 * chiamata è andata storta. Il riposo è una faccenda fra `modello.ts` e la
 * prossima richiesta, non una cosa da mostrare in faccia a qualcuno.
 */
export function pronto(): boolean {
  return scelto() && !!installato()
}

export function disponibile(): boolean {
  return pronto() && Date.now() > spento
}

/**
 * C'è, ma ci è entrato?
 *
 * Qui sopra c'era scritto che sondare non si può — «una chiamata di prova costa
 * undicimila token del suo tetto per scoprire una cosa che si scopre gratis
 * fallendo». Era vero per una domanda vera. Non è vero per questa: `claude auth
 * status` non parla con nessun modello, risponde in centottanta millisecondi,
 * in JSON, e non costa un token.
 *
 * La differenza si vede tutta in faccia a chi ha installato Claude Code e non ci
 * è ancora entrato — che è il caso più comune che ci sia, perché installare e
 * fare l'accesso sono due gesti e il secondo si rimanda. Senza questo, gli si
 * offriva una strada che sembrava pronta e che falliva al primo lavoro vero.
 *
 * Vale mezzo minuto: chi fa l'accesso in un'altra finestra deve vederlo
 * comparire senza riavviare Myynd, e non serve chiederlo a ogni giro.
 */
let accesso = { entrato: false, quando: 0 }
const ACCESSO_VALE = 30_000

export async function entrato(): Promise<boolean> {
  const exe = installato()
  if (!exe) return false

  const ora = Date.now()
  if (ora - accesso.quando < ACCESSO_VALE) return accesso.entrato

  try { mkdirSync(VUOTA, { recursive: true, mode: 0o700 }) } catch { /* c'è già */ }

  const sì = await new Promise<boolean>(risolvi => {
    const p = spawn(exe, ['auth', 'status'], { cwd: VUOTA, env: ambiente() })
    let fuori = ''
    // non dovrebbe metterci niente; se ci mette, la risposta è «non lo so»,
    // che qui si dice «no» — e il primo lavoro vero lo scoprirà davvero
    const tetto = setTimeout(() => { p.kill('SIGTERM'); risolvi(false) }, 5_000)
    p.stdout.on('data', d => { if (fuori.length < 8000) fuori += String(d) })
    p.on('error', () => { clearTimeout(tetto); risolvi(false) })
    p.on('close', () => {
      clearTimeout(tetto)
      try { risolvi((JSON.parse(fuori) as { loggedIn?: boolean }).loggedIn === true) }
      catch { risolvi(false) }
    })
  })

  accesso = { entrato: sì, quando: ora }
  return sì
}

/** Cosa dire nelle preferenze, senza spendere un token per saperlo. */
export async function stato(): Promise<{
  installato: boolean; entrato: boolean; acceso: boolean; inRiposo: boolean
}> {
  const c = !!installato()
  return {
    installato: c,
    entrato: c ? await entrato() : false,
    acceso: scelto(),
    inRiposo: Date.now() <= spento
  }
}

type Messaggio = { role: 'user' | 'assistant'; content: string }

/**
 * Le istruzioni e la conversazione, appiattite in un prompt solo.
 *
 * Claude Code prende una domanda, non un elenco di turni. Quasi tutte le
 * chiamate di Myynd hanno un messaggio solo; quelle che ne hanno di più si
 * scrivono con l'etichetta davanti, che è il modo in cui un modello legge una
 * conversazione riportata senza confonderla con quello che deve fare adesso.
 */
function unSoloPrompt(messages: Messaggio[]): string {
  if (messages.length === 1) return messages[0].content
  return messages.map(m => `${m.role === 'user' ? 'Lei' : 'Tu'}: ${m.content}`).join('\n\n')
}

/**
 * Lo schema, detto a parole.
 *
 * L'API ha `output_config.format` e garantisce la forma; qui non c'è, e la
 * garanzia va chiesta. Non è un peggioramento silenzioso: chi chiama passa
 * comunque da `chiediJSON`, che se non capisce la risposta torna `null` e lascia
 * al chiamante la sua strada di riserva — la stessa che usa già quando il
 * modello di casa risponde storto.
 */
function conLoSchema(system: string, formato?: object): string {
  if (!formato) return system
  return `${system}\n\n— LA FORMA DELLA RISPOSTA —\n` +
    'Rispondi con un solo oggetto JSON valido e niente altro: nessuna spiegazione ' +
    'prima, nessun commento dopo, nessun blocco di codice attorno. Deve rispettare ' +
    `esattamente questo schema:\n${JSON.stringify(formato)}`
}

/**
 * Gli argomenti, uguali per tutte e due le strade.
 *
 * Stavano dentro `chiedi()`, e finché la strada era una sola andava benissimo.
 * Da quando ce ne sono due — una risposta intera, o una che arriva mentre nasce
 * — un elenco solo è quello che garantisce che il recinto sia lo stesso. Se un
 * domani si aggiunge un attrezzo da negare, si aggiunge per entrambe: il modo
 * in cui un recinto si buca è che qualcuno ne costruisca un secondo.
 */
function argomenti(system: string, uscita: 'json' | 'stream-json'): string[] {
  return [
    '-p',
    '--restricted',
    '--output-format', uscita,
    // `--include-partial-messages` senza `--verbose` non manda niente: la
    // risposta comparirebbe tutta insieme alla fine, che è esattamente il
    // difetto per cui questa strada esiste
    ...(uscita === 'stream-json' ? ['--include-partial-messages', '--verbose'] : []),
    '--model', alias(),
    '--system-prompt', system,
    // per ultimo: è variadico e si mangerebbe quello che gli viene dopo
    '--disallowed-tools', ...NEGATI
  ]
}

/**
 * L'ambiente, meno una cosa sola.
 *
 * Passa quasi intero — `claude` ha bisogno delle sue credenziali, che sono le
 * SUE — ma senza la chiave di Myynd: se restasse, Claude Code la userebbe (è la
 * sua prima scelta) e ogni lavoro che credevamo gratis arriverebbe sulla
 * bolletta sbagliata. Non si romperebbe niente. Funzionerebbe tutto, e il conto
 * si scoprirebbe a fine mese. È la stessa riga di `lavoro.ts`, e ora è in una
 * funzione perché i processi da lanciare sono due e devono dimenticarla insieme.
 */
function ambiente(): NodeJS.ProcessEnv {
  const { ANTHROPIC_API_KEY: _mia, ...ambiente } = process.env
  return ambiente
}

/**
 * Il motivo vero, che non sta dove uno lo cerca.
 *
 * Quando qualcosa non va, Claude Code mette `is_error: true` e lascia
 * `subtype: 'success'`: il sottotipo non dice niente, e la ragione sta dentro
 * `result`, cioè nel campo dove uno si aspetta la risposta. Il risultato era
 * «Claude Code non ha risposto (success)» — una frase che non serve a nessuno,
 * mentre due centimetri più in là c'era scritto «Not logged in · Please run
 * /login».
 *
 * Quel caso si traduce a mano perché è il più comune che ci sia — installare e
 * fare l'accesso sono due gesti, e il secondo si rimanda — e perché è l'unico
 * che chi legge può risolvere in dieci secondi, se gli si dice come.
 */
function motivo(b: { result?: string; subtype?: string }): string {
  const detto = String(b.result ?? '').trim()
  if (/not logged in|please run \/login/i.test(detto)) {
    return 'Claude Code è installato ma non ci sei ancora entrato. Apri il Terminale, scrivi «claude» e fai l’accesso.'
  }
  // quello che dice lui, se è corto abbastanza da essere una ragione e non un
  // pezzo di risposta finito nel posto sbagliato
  if (detto && detto.length <= 200) return `Claude Code: ${detto}`
  return `Claude Code non ha risposto (${b.subtype ?? 'senza motivo'}).`
}

/** Quello che torna dall'involucro JSON di Claude Code. */
type Busta = { result?: string; is_error?: boolean; subtype?: string; total_cost_usd?: number }

/**
 * Una domanda, e il testo che torna.
 *
 * Lancia, aspetta, legge. Se va male lancia un errore: chi chiama — `chiedi()`
 * in `modello.ts` — lo prende come «questa strada non c'è» e passa a quella
 * dopo, esattamente come fa già quando il modello di casa non risponde.
 */
export async function chiedi(o: {
  system: string
  messages: Messaggio[]
  formato?: object
  attesa: number
}): Promise<string> {
  const exe = installato()
  if (!exe) throw new Error('Claude Code non è su questa macchina.')

  try { mkdirSync(VUOTA, { recursive: true, mode: 0o700 }) } catch { /* c'è già */ }

  return await new Promise<string>((risolvi, rifiuta) => {
    const p = spawn(exe, argomenti(conLoSchema(o.system, o.formato), 'json'), { cwd: VUOTA, env: ambiente() })

    /*
      La domanda entra dallo stdin, non dagli argomenti.

      `--disallowed-tools` prende un elenco a lunghezza libera: messo prima
      della domanda se la mangia, e ogni parola della domanda diventa il nome
      di un attrezzo da negare — Claude Code lo dice pure, riga per riga, e poi
      esce senza aver capito cosa gli avevamo chiesto. Dallo stdin non c'è
      niente da confondere, e in più non c'è un tetto alla lunghezza.
    */
    p.stdin.on('error', () => { /* se è morto prima, lo dice `close` */ })
    p.stdin.end(unSoloPrompt(o.messages))

    let fuori = ''
    let male = ''

    const tetto = setTimeout(() => {
      p.kill('SIGTERM')
      rifiuta(new Error('Claude Code ci ha messo troppo.'))
    }, o.attesa)

    p.stdout.on('data', d => { if (fuori.length < 400_000) fuori += String(d) })
    p.stderr.on('data', d => { if (male.length < 4000) male += String(d) })

    p.on('error', e => {
      clearTimeout(tetto)
      rifiuta(new Error(`Non sono riuscito ad avviare Claude Code: ${e.message}`))
    })

    p.on('close', codice => {
      clearTimeout(tetto)
      if (codice !== 0) {
        return rifiuta(new Error(male.trim().split('\n')[0] || `Claude Code è uscito con ${codice}.`))
      }
      let b: Busta
      try { b = JSON.parse(fuori) as Busta } catch { return rifiuta(new Error('Claude Code ha risposto in un modo che non capisco.')) }
      if (b.is_error || typeof b.result !== 'string' || !b.result.trim()) {
        return rifiuta(new Error(motivo(b)))
      }
      risolvi(b.result)
    })
  })
}

/** Un pezzo di risposta, come lo manda `--output-format stream-json`. */
type Pezzo = {
  type?: string
  event?: { type?: string; delta?: { type?: string; text?: string } }
  result?: string
  is_error?: boolean
  subtype?: string
}

/**
 * La stessa domanda, ma la risposta arriva mentre nasce.
 *
 * Esiste per una cosa sola, ed è la più importante che Myynd faccia: la chat.
 * Con `--output-format json` si aspetta in silenzio che il processo finisca e
 * poi compare tutto insieme — venti o trenta secondi di schermo fermo, che il
 * brief chiama giustamente un difetto fatale. Non è una questione di eleganza:
 * una risposta che non comincia sembra un'app rotta, e chi la usa ricarica la
 * pagina prima di vederla.
 *
 * Quello che questa strada *non* ha, e va detto qui invece che scoperto dopo:
 * gli attrezzi. `cerca` e `aggiungi_compito` vivono nel giro di `claude.ts` con
 * l'SDK, e di là non si possono passare — a Claude Code gli attrezzi glieli
 * neghiamo tutti apposta, ed è la ragione per cui questa strada è sicura. Quindi
 * qui si fa una passata sola, sul materiale che `materiale()` ha già scelto.
 * Una risposta buona su quello che le abbiamo messo in mano, invece di nessuna
 * risposta: è quello che una strada di riserva deve essere.
 */
export async function inStreaming(o: {
  system: string
  messages: Messaggio[]
  /** Quanto silenzio si accetta prima di dire che si è piantato. */
  silenzio: number
  onTesto: (pezzo: string) => void
}): Promise<string> {
  const exe = installato()
  if (!exe) throw new Error('Claude Code non è su questa macchina.')

  try { mkdirSync(VUOTA, { recursive: true, mode: 0o700 }) } catch { /* c'è già */ }

  return await new Promise<string>((risolvi, rifiuta) => {
    const p = spawn(exe, argomenti(o.system, 'stream-json'), { cwd: VUOTA, env: ambiente() })

    p.stdin.on('error', () => { /* se è morto prima, lo dice `close` */ })
    p.stdin.end(unSoloPrompt(o.messages))

    let testo = ''
    /** La riga rimasta a metà fra due pezzi di stdout: si completa col prossimo. */
    let resto = ''
    let male = ''
    let guasto: Error | null = null

    /**
     * La sveglia si riarma a ogni evento, non parte una volta sola.
     *
     * Un tetto totale taglierebbe una risposta lunga proprio mentre sta
     * arrivando bene. Questo taglia solo una che ha *smesso* di arrivare, che è
     * l'unico caso in cui aspettare non serve a niente — un processo che non
     * parla più non torna da solo, e senza questa riga la chat resterebbe a
     * «cerco tra le fonti» finché non ricarichi. Stessa guardia di
     * `senzaSilenzi` in `claude.ts`, stesso motivo.
     */
    let sveglia: ReturnType<typeof setTimeout>
    const riarma = () => {
      clearTimeout(sveglia)
      sveglia = setTimeout(() => {
        p.kill('SIGTERM')
        rifiuta(new Error('La risposta si è interrotta a metà. Riprova.'))
      }, o.silenzio)
    }
    riarma()

    const riga = (l: string) => {
      if (!l.trim()) return
      let d: Pezzo
      // una riga che non è JSON non è un guasto: è rumore, e si scavalca
      try { d = JSON.parse(l) as Pezzo } catch { return }
      riarma()

      if (d.type === 'stream_event') {
        const e = d.event
        // solo il testo. Il pensiero arriva di qui come `thinking_delta` e non
        // è roba da mettere sotto gli occhi di nessuno: è il ragionamento, non
        // la risposta
        if (e?.type !== 'content_block_delta' || e.delta?.type !== 'text_delta') return
        const pezzo = e.delta.text
        if (!pezzo) return
        if (testo.length < 400_000) testo += pezzo
        o.onTesto(pezzo)
        return
      }

      if (d.type === 'result') {
        if (d.is_error || d.subtype !== 'success') {
          guasto = new Error(motivo(d))
          return
        }
        // Se i pezzi non sono arrivati — una versione che non li manda — la
        // riga finale ha comunque tutta la risposta. Darla intera alla fine è
        // peggio che darla a poco a poco, ed è molto meglio che non darla.
        if (!testo.trim() && typeof d.result === 'string' && d.result) {
          testo = d.result
          o.onTesto(testo)
        }
      }
    }

    p.stdout.on('data', d => {
      const righe = (resto + String(d)).split('\n')
      resto = righe.pop() ?? ''
      for (const l of righe) riga(l)
    })
    p.stderr.on('data', d => { if (male.length < 4000) male += String(d) })

    p.on('error', e => {
      clearTimeout(sveglia)
      rifiuta(new Error(`Non sono riuscito ad avviare Claude Code: ${e.message}`))
    })

    p.on('close', codice => {
      clearTimeout(sveglia)
      if (resto) riga(resto)
      if (guasto) return rifiuta(guasto)
      if (codice !== 0) {
        return rifiuta(new Error(male.trim().split('\n')[0] || `Claude Code è uscito con ${codice}.`))
      }
      if (!testo.trim()) return rifiuta(new Error('Claude Code non ha risposto niente.'))
      risolvi(testo)
    })
  })
}

/**
 * Va male: si mette in riposo.
 *
 * Chiamata da `modello.ts` quando un tentativo fallisce. Cinque minuti di
 * silenzio evitano che ogni singolo lavoro paghi due secondi di processo che
 * parte e muore prima di andare dove sarebbe dovuto andare subito.
 */
export function nonRisponde() {
  spento = Date.now() + RIPOSO
}
