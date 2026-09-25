// I segni del client (P10): quanto ci mette la prima pagina a disegnarsi, e
// quanto la chat a dire la prima parola. Solo numeri, e solo sul Mac: su un
// server non si manda niente.
//
// Una richiesta per caricamento di pagina, una per risposta in chat.

import { apiP10 } from './api'

const SEGNI = ['accesso', 'stato', 'feed', 'compiti', 'casa-disegnata', 'occhio-premuto', 'invio-premuto', 'prima-parola', 'chat-fine'] as const
export type Segno = typeof SEGNI[number]
const AVVIO: Segno[] = ['accesso', 'stato', 'feed', 'compiti', 'casa-disegnata']

let ospitato = false
let avvioMandato = false

/** Lo dice `/api/auth`: ospitati, non si manda niente. */
export function ospitatoQui(v: boolean) { ospitato = v }

/** Un segno, con il suo nome, la prima volta che succede (per l'avvio) o ogni volta (per la chat). */
export function segna(nome: Segno): void {
  try { performance.mark(nome) } catch { /* un browser senza marks: niente */ }
}

/** Il primo segno con quel nome, in ms dall'inizio della pagina. */
function primo(nome: Segno): number | null {
  try {
    const e = performance.getEntriesByName(nome, 'mark')[0]
    return e ? Math.round(e.startTime) : null
  } catch { return null }
}

/** Una volta per caricamento, subito dopo che la prima pagina si è disegnata. */
export function inviaAvvio(): void {
  if (avvioMandato || ospitato) return
  avvioMandato = true
  const segni: Record<string, number> = {}
  for (const n of AVVIO) { const v = primo(n); if (v !== null) segni[n] = v }
  if (Object.keys(segni).length) apiP10.segni(segni).catch(() => {})
}

/**
 * I tempi di una risposta in chat: `invio` quando si preme, poi la prima
 * parola e la fine. Alla fine una richiesta, con i ms da quando si è premuto.
 */
export function tempiChat() {
  const inizio = performance.now()
  segna('invio-premuto')
  let parola: number | null = null
  let chiuso = false
  return {
    primaParola() {
      if (parola !== null) return
      parola = Math.round(performance.now() - inizio)
      segna('prima-parola')
    },
    fine() {
      if (chiuso) return
      chiuso = true
      segna('chat-fine')
      if (ospitato) return
      const segni: Record<string, number> = { 'invio-premuto': 0, 'chat-fine': Math.round(performance.now() - inizio) }
      if (parola !== null) segni['prima-parola'] = parola
      apiP10.segni(segni).catch(() => {})
    }
  }
}
