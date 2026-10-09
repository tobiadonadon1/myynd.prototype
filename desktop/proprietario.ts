// Chi c'è davanti al Mac: la prova per rimettere una password dimenticata.
//
// In casa non c'è nessuna posta che possa mandare un collegamento, e la
// password di Myynd protegge l'interfaccia, non il disco (vedi server/auth.ts):
// chi dimostra al Mac di esserne il padrone ha già in mano tutto quello che
// Myynd custodisce. Touch ID quando c'è; altrimenti la finestra del Mac che
// chiede la sua password, la stessa di un'installazione. Nessuna delle due la
// vede Myynd: risponde il sistema, sì o no.
//
// Il guscio chiede, e solo dopo un sì chiama il server con il segreto che gli
// ha dato alla partenza (`server.segretoGuscio`). La pagina non chiama mai il
// server per questo: non conosce il segreto.

import { execFile } from 'node:child_process'

export type Sistema = {
  canPromptTouchID(): boolean
  promptTouchID(ragione: string): Promise<void>
}

/** Come si è confermato: con il dito o con la password del Mac. */
export type Via = 'touchid' | 'password'

/**
 * La finestra del Mac che chiede la password di un amministratore.
 *
 * `do shell script … with administrator privileges` è il modo che macOS dà a
 * un'app per farsi confermare la password del Mac senza vederla: il comando che
 * gira è `/usr/bin/true`, cioè niente. Annullare è l'errore -128.
 */
export function passwordDelMac(ragione: string): Promise<void> {
  const frase = ragione.replace(/["\\]/g, '')
  return new Promise((risolvi, rifiuta) => {
    execFile('/usr/bin/osascript', ['-e', `do shell script "/usr/bin/true" with prompt "${frase}" with administrator privileges`],
      { timeout: 120_000 }, errore => {
        if (!errore) return risolvi()
        rifiuta(new Error(/-128/.test(String(errore.message)) ? 'annullato' : 'negato'))
      })
  })
}

/**
 * Chiede al Mac chi c'è davanti. Torna come si è confermato; lancia se no.
 *
 * `via: 'password'` la sceglie la persona («Usa la password del Mac»): chi ha
 * Touch ID ma ha il dito bagnato non deve restare chiuso fuori.
 */
export async function confermaProprietario(o: {
  sistema: Sistema; ragione: string; via?: Via
  password?: (ragione: string) => Promise<void>
}): Promise<Via> {
  const password = o.password ?? passwordDelMac
  if (o.via !== 'password' && o.sistema.canPromptTouchID()) {
    await o.sistema.promptTouchID(o.ragione).catch(() => { throw new Error('Touch ID non ha confermato.') })
    return 'touchid'
  }
  await password(o.ragione).catch((e: unknown) => {
    throw new Error(e instanceof Error && e.message === 'annullato' ? 'Annullato.' : 'Il Mac non ha confermato la password.')
  })
  return 'password'
}

/**
 * Tutto il giro: il Mac conferma, poi il server cambia la password.
 *
 * `chiama` è la richiesta al server (di serie `fetch` sulla porta del server,
 * con il segreto nell'intestazione). Torna quello che il server risponde: il
 * gettone della sessione nuova e il conto.
 */
export async function reimposta(o: {
  sistema: Sistema; ragione: string; via?: Via; email: string; nuova: string
  password?: (ragione: string) => Promise<void>
  chiama: (corpo: { email: string; password: string }) => Promise<{ token: string; account: { email: string } }>
}): Promise<{ token: string; account: { email: string } }> {
  if (!o.email.trim()) throw new Error('Scrivi il tuo indirizzo.')
  if (o.nuova.length < 8) throw new Error('Almeno otto caratteri.')
  await confermaProprietario(o)
  return o.chiama({ email: o.email.trim(), password: o.nuova })
}

/** La richiesta al server, con il segreto del guscio. */
export function chiamaServer(porta: () => number | null, segreto: string) {
  return async (corpo: { email: string; password: string }) => {
    const p = porta()
    if (!p) throw new Error('Myynd non è ancora partito. Riprova fra un momento.')
    const r = await fetch(`http://127.0.0.1:${p}/api/auth/reimposta/mac`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-myynd-guscio': segreto }, body: JSON.stringify(corpo)
    })
    const j = await r.json().catch(() => ({})) as { token?: string; account?: { email: string }; errore?: string }
    if (!r.ok || !j.token || !j.account) throw new Error(j.errore || 'Non sono riuscito a cambiare la password.')
    return { token: j.token, account: j.account }
  }
}
