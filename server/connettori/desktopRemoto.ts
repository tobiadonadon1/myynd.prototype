// Spingere il desktop verso un Myynd ospitato — non leggerlo da lì.
//
// Un server non ha le tue cartelle, e non c'è verso onesto di aggirarlo: gira
// su un contenitore, non sul tuo Mac, e un contenitore non ha un `/Users/te`
// da guardare. Quello che *può* fare è ricevere quello che un Myynd in casa
// ha già letto — lo stesso lavoro che il giro di rilettura fa qui ogni sei
// ore, mandato anche là.
//
// Con `MYYND_DESKTOP_REMOTO` vuota questo file non fa niente: è un'aggiunta al
// giro che c'è già, non un cammino diverso. Chi non la imposta non vede
// cambiare nulla — né in casa, né sul server.

import type { Esito } from './desktop.ts'

const URL_REMOTO = (process.env.MYYND_DESKTOP_REMOTO ?? '').trim().replace(/\/+$/, '')
const TOKEN = (process.env.MYYND_DESKTOP_REMOTO_TOKEN ?? '').trim()

export const ATTIVO = !!URL_REMOTO && !!TOKEN

/**
 * Spinge quello che si è appena letto in casa. `null` se non c'è niente da
 * spingere — variabili assenti, o un giro che non ha trovato né documenti né
 * radici complete — così chi chiama non deve saperlo prima di chiamare.
 */
export async function spingi(e: Esito): Promise<{ documenti: number; tolti: number } | null> {
  if (!ATTIVO) return null
  if (!e.docs.length && !e.complete.length) return null
  const r = await fetch(`${URL_REMOTO}/api/connettori/desktop/carica`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ docs: e.docs, complete: e.complete, visti: e.visti })
  })
  if (!r.ok) {
    const testo = await r.text().catch(() => '')
    throw new Error(`il Myynd ospitato ha risposto ${r.status}: ${testo.slice(0, 200)}`)
  }
  return (await r.json()) as { documenti: number; tolti: number }
}
