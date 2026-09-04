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
import type { Documento } from '../store.ts'

const URL_REMOTO = (process.env.MYYND_DESKTOP_REMOTO ?? '').trim().replace(/\/+$/, '')
const TOKEN = (process.env.MYYND_DESKTOP_REMOTO_TOKEN ?? '').trim()

export const ATTIVO = !!URL_REMOTO && !!TOKEN

/** Quanti documenti per richiesta. Cinquanta da venti kilobyte stanno in un mega. */
const PEZZO = 50

/**
 * Spinge quello che si è appena letto in casa. `null` se non c'è niente da
 * spingere — variabili assenti, o un giro che non ha trovato né documenti né
 * radici complete — così chi chiama non deve saperlo prima di chiamare.
 *
 * A pezzi, non in una richiesta sola: una cartella vera sono migliaia di
 * documenti, e un corpo da decine di mega o non passa il tetto del server o
 * muore a metà su una linea lenta senza dire dove. Le radici complete e gli
 * id visti viaggiano solo con l'ultimo pezzo, insieme agli id di tutti i pezzi
 * prima: `riconcilia()` cancella quello che non vede nella stessa richiesta,
 * e vedere un pezzo solo vorrebbe dire cancellare gli altri.
 */
export async function spingi(e: Esito): Promise<{ documenti: number; tolti: number } | null> {
  if (!ATTIVO) return null
  if (!e.docs.length && !e.complete.length) return null

  const pezzi: Documento[][] = []
  for (let i = 0; i < e.docs.length; i += PEZZO) pezzi.push(e.docs.slice(i, i + PEZZO))
  if (!pezzi.length) pezzi.push([])

  const totale = { documenti: 0, tolti: 0 }
  const mandati: string[] = []
  for (let i = 0; i < pezzi.length; i++) {
    const docs = pezzi[i]!
    const ultimo = i === pezzi.length - 1
    const corpo = ultimo ? { docs, complete: e.complete, visti: [...e.visti, ...mandati] } : { docs }
    const r = await fetch(`${URL_REMOTO}/api/connettori/desktop/carica`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(120_000)
    })
    if (!r.ok) {
      const testo = await r.text().catch(() => '')
      throw new Error(`il Myynd ospitato ha risposto ${r.status}: ${testo.slice(0, 200)}`)
    }
    const esito = (await r.json()) as { documenti?: number; tolti?: number }
    totale.documenti += esito.documenti ?? 0
    totale.tolti += esito.tolti ?? 0
    mandati.push(...docs.map(d => d.id))
  }
  return totale
}
