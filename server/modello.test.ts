// Chi fa il lavoro grosso, e cosa dice quando non ce la fa.
//
// `motore()` è la porta unica: di là c'è Claude o un fornitore che parla la
// lingua di OpenAI, e chi chiama non lo sa. Le prove qui sotto guardano le tre
// cose che quella porta deve garantire, e che sbagliano tutte in silenzio:
//
//   · il tipo, perché è da lì che la chat decide se accorciare il prompt;
//   · `pronto()`, la domanda da due secondi che permette di dire «accendi
//     Ollama» invece di far girare a vuoto un giro di strumenti e finire con
//     «non riesco a raggiungere il fornitore»;
//   · il tetto sulla prima parola, che deve diventare una frase sul *modello*
//     — troppo grosso per questa macchina — e non l'ennesimo «riprova».
//
//   node --test server/modello.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-modello-'))
process.env.MYYND_DATI = CASA

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const compatibile = await import('./compatibile.ts')
const modello = await import('./modello.ts')

after(() => {
  compatibile.usaRete(null)
  store.chiudiIndici()
  delete process.env.MYYND_DATI
  rmSync(CASA, { recursive: true, force: true })
})

/** Il fornitore compatibile scelto come motore, con l'indirizzo che gli si dà. */
function colFornitore(url = 'https://esempio.test/v1') {
  cfg.scrivi({ motore: 'compatibile', compatibile: { url, modello: 'qwen3.5:9b', nome: 'il mio Ollama' } })
  compatibile.scordaOllama()
}

test('scelto un fornitore, il motore è lui e si chiama come l’ha chiamato lei', () => {
  colFornitore()
  const m = modello.motore()
  assert.equal(m?.tipo, 'compatibile')
  assert.equal(m?.nome, 'il mio Ollama')
})

test('pronto: con il fornitore spento si dice di accenderlo, non «riprova»', async () => {
  colFornitore()
  compatibile.usaRete((async () => { throw new TypeError('fetch failed') }) as typeof fetch)
  await assert.rejects(
    () => modello.motore()!.pronto(),
    /Il modello sul tuo computer non risponde/
  )
})

test('pronto: se qualcuno risponde si va avanti senza dire niente', async () => {
  colFornitore()
  compatibile.usaRete((async () => Response.json({ data: [{ id: 'qwen3.5:9b' }] })) as typeof fetch)
  await modello.motore()!.pronto()
})

test('con Claude non si bussa a nessuno prima di rispondere', async () => {
  cfg.scrivi({ claude: { apiKey: 'sk-ant-prova' } }, { togli: ['compatibile'] })
  let bussate = 0
  compatibile.usaRete((async () => { bussate++; return Response.json({}) }) as typeof fetch)
  const m = modello.motore()
  assert.equal(m?.tipo, 'claude')
  await m!.pronto()
  assert.equal(bussate, 0, 'chiedere ad Anthropic «ci sei?» prima di ogni domanda è una chiamata sprecata')
})

test('quindici secondi per cominciare, e poi si dice che il modello è troppo grosso', async () => {
  colFornitore()
  // non comincia mai: il filo resta aperto finché non lo si taglia
  compatibile.usaRete(((_: unknown, init?: RequestInit) => new Promise<Response>((_r, rifiuta) => {
    init?.signal?.addEventListener('abort', () => rifiuta(new DOMException('interrotto', 'AbortError')))
  })) as typeof fetch)

  const m = modello.motore()!
  const richiesta = { model: 'q', max_tokens: 10, messages: [{ role: 'user' as const, content: 'ciao' }] }

  // con il budget della chat: la frase parla del modello e di cosa fare
  await assert.rejects(
    () => m.flusso(richiesta, () => {}, 30),
    /più di quindici secondi per cominciare/
  )

  /*
   * Sotto, niente è cambiato.
   *
   * Chi non ha un budget suo — una bozza, la rassegna della notte — continua a
   * leggere la frase di sempre: il tempo che si è preso lì non dice niente sul
   * modello, dice solo che quella volta non è andata. La riscrittura la fa il
   * motore, e solo per chi ha chiesto un tetto da chat.
   */
  const f = { url: 'https://esempio.test/v1', modello: 'q' }
  await assert.rejects(
    () => compatibile.flusso(f, richiesta, () => {}, 30),
    (e: Error) => e.name === compatibile.ATTESA_SCADUTA && /Ci ha messo troppo/.test(e.message)
  )
})
