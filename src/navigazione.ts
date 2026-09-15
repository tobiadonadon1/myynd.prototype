import { desktop } from './desktop.ts'
import type { Portato } from './api.ts'

type Finestra = {
  opener: unknown
  closed: boolean
  location: { replace(url: string): void }
  close(): void
}

type Ambiente = {
  apriFuori?: (url: string) => Promise<void>
  apriQui?: (url: string) => void
  prenota?: () => Finestra | null
}

/** Only a stored source's web URL may become a browser destination. */
export function linkNavigabile(link: string): string | null {
  try {
    const url = new URL(link)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

/**
 * Reserve a tab during the click, before fetching the source destination.
 * Opening it after the request loses the browser's user gesture and is blocked.
 * Native destinations and failures always close the unused reservation.
 */
export function preparaApertura(ambiente?: Ambiente) {
  const ponte = desktop()
  const a = ambiente ?? {
    ...(ponte ? { apriFuori: (url: string) => ponte.apriFuori(url) } : {}),
    apriQui: (url: string) => window.location.assign(url),
    prenota: () => typeof window === 'undefined' ? null : window.open('', '_blank')
  }
  const finestra = !a.apriFuori ? a.prenota?.() ?? null : null
  if (finestra) finestra.opener = null
  let consegnata = false
  const annulla = () => { if (!consegnata && finestra && !finestra.closed) finestra.close() }
  return {
    annulla,
    async completa(r: Portato): Promise<Portato> {
      if (!r.ok || r.dove !== 'pagina' || !r.url) { annulla(); return r }
      const url = linkNavigabile(r.url)
      if (!url) { annulla(); return { ok: false, errore: 'Il collegamento alla fonte non è valido.' } }
      try {
        if (a.apriFuori) await a.apriFuori(url)
        else if (finestra && !finestra.closed) { finestra.location.replace(url); consegnata = true }
        else if (!finestra && a.apriQui) a.apriQui(url)
        else return { ok: false, errore: 'Consenti le finestre a comparsa per aprire la fonte.' }
        return r
      } catch {
        annulla()
        return { ok: false, errore: 'Non sono riuscito ad aprirlo.' }
      }
    }
  }
}
