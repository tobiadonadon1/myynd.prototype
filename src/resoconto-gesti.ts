// I gesti del resoconto (P9), senza React e senza server: si provano da soli.

import type { Portato } from './api.ts'

/** Una risposta che arriva più tardi di così dopo le carte spingerebbe giù la pagina sotto il cursore. */
export const TOLLERANZA_MS = 300

/**
 * Deve comparire la carta, adesso? Prima che le carte ci siano, sì; dopo,
 * solo se la risposta è arrivata entro `TOLLERANZA_MS`.
 */
export function inTempo(arrivata: number, feedPronto: number | null): boolean {
  return feedPronto === null || arrivata - feedPronto <= TOLLERANZA_MS
}

/** Quello che serve a una riga per aprirsi: tutto da fuori, così si prova senza Mac e senza server. */
export type Mani = {
  suMac: boolean
  chiudi: () => void
  portamiFonte: (doc: string) => unknown
  portami: (id: string) => Promise<Portato>
  prepara: () => { completa: (r: Portato) => Promise<Portato>; annulla: () => void }
  avvisa: (testo: string) => void
  t: (s: string) => string
}

/**
 * Il gesto di una riga del foglio, o null se la riga è testo: un documento si
 * apre alla fonte (e il foglio si chiude); un file consegnato si apre sul Mac
 * soltanto, e dice «Aperto.» o il guaio.
 */
export function gestoDi(apre: { doc: string } | { compito: string } | null, m: Mani): (() => Promise<void> | void) | null {
  if (!apre) return null
  if ('doc' in apre) return () => { m.chiudi(); void m.portamiFonte(apre.doc) }
  if (!m.suMac) return null
  return async () => {
    const ap = m.prepara()
    try {
      const esito = await ap.completa(await m.portami(apre.compito))
      if (!esito.ok) m.avvisa(m.t(esito.errore))
      else if (esito.dove === 'posta' || esito.dove === 'file') m.avvisa(m.t('Aperto.'))
    } catch (e) {
      ap.annulla()
      m.avvisa(m.t(e instanceof Error ? e.message : String(e)))
    }
  }
}
