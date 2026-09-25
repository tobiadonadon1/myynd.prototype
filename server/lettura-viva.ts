// La lettura che sta girando adesso, per conto: chi arriva dopo si attacca.
//
// La lettura moriva con la pagina: chiudere la finestra a metà fermava le
// fonti che non erano ancora partite, e chi ricaricava tornava alle schede.
// Adesso una lettura di tutte le fonti va fino in fondo anche senza nessuno
// che guarda, e chi apre la pagina (o preme «Leggi» di nuovo) riceve quello
// che è già successo, fonte per fonte, poi il resto dal vivo, e la fine.
//
// Il registro è per conto (una `Map`), e dice la verità solo finché la
// lettura non è finita: dopo `fine` non c'è più niente a cui attaccarsi.

import type { Request, Response } from 'express'

export type Viva = {
  tutte: boolean
  /** È la prima lettura di almeno una fonte. */
  prima: boolean
  /**
   * L'ha chiesta una persona («Leggi», una fonte collegata), o una persona ci
   * si è attaccata. Il giro dei dieci minuti sul passo delle fonti no: chi
   * ricarica lì non deve ritrovarsi a guardare una lettura che non ha
   * chiesto, e poi al passo dopo (P4).
   */
  chiesta: boolean
  /** Le fonti che questa lettura visiterà. */
  fonti: string[]
  avvisa(e: unknown): void
  ascolta(f: (e: unknown) => void): () => void
  ultimi(): unknown[]
  finita(): boolean
}

const vive = new Map<string, Viva>()

type Apri = { tutte: boolean; prima: boolean; fonti: string[]; chiesta?: boolean }

function crea({ chiesta = true, ...o }: Apri): Viva {
  const ultimi = new Map<string, unknown>()
  const ascoltatori = new Set<(e: unknown) => void>()
  let finita = false
  return {
    ...o,
    chiesta,
    avvisa(e) {
      const fase = String((e as { fase?: unknown } | null)?.fase ?? '')
      if (fase === 'fine' || fase === 'errore') finita = true
      else if (fase) {
        // l'ultimo per fase, nell'ordine in cui le fasi sono comparse la prima volta
        ultimi.set(fase, e)
      }
      for (const f of [...ascoltatori]) {
        try { f(e) } catch { ascoltatori.delete(f) }
      }
    },
    ascolta(f) {
      ascoltatori.add(f)
      return () => { ascoltatori.delete(f) }
    },
    ultimi: () => [...ultimi.values()],
    finita: () => finita
  }
}

/** Comincia il registro di una lettura per questo conto. */
export function apri(conto: string, o: Apri): Viva {
  const v = crea(o)
  vive.set(conto, v)
  return v
}

/** La lettura di questo conto, se ce n'è una non ancora finita. */
export function di(conto: string): Viva | null {
  const v = vive.get(conto)
  return v && !v.finita() ? v : null
}

/** Una prima lettura chiesta da una persona sta girando: chi ricarica torna a guardarla. */
export function primaChiesta(conto: string): boolean {
  const v = di(conto)
  return !!v && v.prima && v.chiesta
}

/** La lettura è chiusa: il registro se ne va. */
export function chiudi(conto: string): void {
  vive.delete(conto)
}

/**
 * Una risposta in streaming attaccata alla lettura: prima quello che è già
 * successo, poi il resto. Finisce con `fine` o `errore`. Una pagina che se
 * ne va smette di ascoltare, e basta: la lettura continua.
 */
export function attacca(req: Request, res: Response, v: Viva): void {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const scrivi = (d: unknown) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(d)}\n\n`) }
  const battito = setInterval(() => { if (!res.writableEnded) res.write(': vivo\n\n') }, 15_000)
  let via: (() => void) | null = null
  const chiudi = () => {
    clearInterval(battito)
    via?.()
    via = null
  }
  scrivi({ fase: 'inizio', fonti: v.fonti })
  for (const e of v.ultimi()) scrivi(e)
  via = v.ascolta(e => {
    scrivi(e)
    const fase = (e as { fase?: unknown } | null)?.fase
    if (fase === 'fine' || fase === 'errore') {
      chiudi()
      if (!res.writableEnded) res.end()
    }
  })
  req.on('close', chiudi)
}
