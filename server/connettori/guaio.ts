// Perché una fonte non si è letta, detto con una parola che sa cosa fare.
//
// Finora un guaio arrivava come una frase e basta: la riga fissa in prima
// pagina poteva solo dire «Vai alle Fonti», e una password cambiata, un
// permesso tolto da un aggiornamento e un Wi‑Fi che cade alle 23:55 erano la
// stessa cosa. Qui ogni guaio porta il suo rimedio: cosa serve perché la
// fonte torni a leggersi. Lo decide il connettore, dove l'errore nasce e si
// capisce; chi lo riceve lo legge con `rimedioDi` anche quando l'errore non
// è nostro (una rete che cade, un timeout).
//
// Nessun import di Node: lo legge anche chi non gira sul server.

/** Il rimedio: cosa serve perché la fonte torni a leggersi. */
export type Rimedio =
  | 'permesso-disco'   // Accesso completo al disco (Note, cartelle del Mac)
  | 'accedi'           // un nuovo accesso (Granola, Dropbox, Google, l'account Claude)
  | 'credenziale'      // password, token, indirizzo o chiave da rimettere nel pannello
  | 'amministratore'   // il via libera dell'amministratore
  | 'apri-app'         // l'app non c'è ancora su questo Mac (Note, Granola)
  | 'aggiorna'         // la fonte ha cambiato formato: serve un aggiornamento di Myynd
  | 'attendi'          // passeggero: rete, lentezza, limite, 5xx
  | 'guarda'           // sconosciuto
  | 'credito'          // solo per i motori, solo nel conto del giorno (la schermata ha già la carta del credito)

export const RIMEDI: readonly Rimedio[] = ['permesso-disco', 'accedi', 'credenziale', 'amministratore', 'apri-app', 'aggiorna', 'attendi', 'guarda', 'credito']

/**
 * Un guaio già capito dove è nato.
 *
 * Il messaggio è sempre una delle nostre frasi in italiano, mai il testo di un
 * server: per questo `fraseDi` lo tiene, e di un errore qualunque no.
 */
export class GuaioFonte extends Error {
  rimedio: Rimedio
  constructor(messaggio: string, rimedio: Rimedio) {
    super(messaggio)
    this.rimedio = rimedio
  }
}

const RETE = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH'])

function eRimedio(x: unknown): x is Rimedio {
  return typeof x === 'string' && (RIMEDI as readonly string[]).includes(x)
}

/**
 * Il rimedio di un errore qualunque.
 *
 * Prima quello che il connettore ha scritto (anche su un errore che non è un
 * `GuaioFonte`: `NoDiGithub` lo porta da sé), poi il caso dell'amministratore,
 * poi la rete; quello che resta non si sa, e lo si dice.
 */
export function rimedioDi(e: unknown): Rimedio {
  const x = (e ?? {}) as { rimedio?: unknown; amministratore?: unknown; caso?: unknown; code?: unknown; name?: unknown; message?: unknown; cause?: unknown }
  if (typeof x !== 'object') return 'guarda'
  if (eRimedio(x.rimedio)) return x.rimedio
  if (x.amministratore || x.caso) return 'amministratore'
  if (typeof x.code === 'string' && RETE.has(x.code)) return 'attendi'
  if (x.name === 'TimeoutError' || x.name === 'AbortError') return 'attendi'
  if (e instanceof TypeError && /fetch failed/i.test(String(x.message ?? ''))) return 'attendi'
  return 'guarda'
}

/**
 * La frase da tenere, solo se è nostra.
 *
 * Un errore classificato dove è nato porta una delle nostre frasi; tutto il
 * resto può portarsi dietro un percorso, un token, un indirizzo: non si tiene.
 */
export function fraseDi(e: unknown): string | null {
  const x = e as { rimedio?: unknown; message?: unknown } | null
  if (!x || typeof x !== 'object' || !eRimedio(x.rimedio) || typeof x.message !== 'string' || !x.message) return null
  return x.message.slice(0, 300)
}

/**
 * Il peggiore di due rimedi.
 *
 * Una causa che resta batte una passeggera; fra due che restano vale la più
 * nuova (`b`), che è quella da sistemare adesso; niente perde con tutto.
 */
export function peggiore(a: Rimedio | null | undefined, b: Rimedio | null | undefined): Rimedio | null {
  if (!a) return b ?? null
  if (!b) return a
  if (b === 'attendi') return a
  return b
}
