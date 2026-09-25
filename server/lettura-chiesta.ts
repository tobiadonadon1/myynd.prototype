// «Leggi adesso», di fondo, sotto una riga che lavora (P10).
//
// «Quando premo Leggi adesso ci mette un'eternità.» La lettura non cambia: è
// la stessa catena di prima (il modello sceglie dall'indice, poi le fonti si
// rileggono, poi il quadro dei progetti se non era arrivato niente). Cambia
// che la rotta risponde subito, la catena corre di fondo come un lavoro solo
// per conto, e la pagina la segue sul filo dei compiti: `corre` con il suo
// passo, poi `fine` con le carte nuove, o `guaio`.
//
// La stessa idea della lettura viva delle fonti (`lettura-viva.ts`, P4): un
// registro per conto, e chi arriva dopo si attacca invece di farne partire
// un'altra. Un secondo «Leggi», un'altra finestra, un ricaricamento: vedono
// la stessa lettura, con lo stesso id. Qui il riascolto passa dal filo dei
// compiti (`compiti.ascolta` rimanda l'ultimo `corre`), non da una rotta sua.
//
// Dopo `fine` o `guaio` non resta niente: il registro dice la verità solo
// mentre la lettura corre. Dopo tre minuti la riga si posa comunque (`fine`),
// e il resto della catena va avanti senza riga.

import * as chi from './chi.ts'
import * as compiti from './compiti.ts'
import * as store from './store.ts'
import * as tempi from './tempi.ts'
import { withBackgroundWork } from './lavoro-background.ts'

export type PassoLettura = 'arrivato' | 'scelgo' | 'ordine' | 'fonti' | 'progetti'
export type Lettura = { id: string; dal: string; passo: PassoLettura; n: number | null; unita: boolean }
export type Controllo = { passo(p: PassoLettura, n?: number): void; scegli<T>(f: () => Promise<T>): Promise<T> }

export let POSA = 3 * 60_000
const letture = new Map<string, Lettura>()
const scegliendo = new Set<string>()

/** La lettura di questo conto, se ne corre una. */
export function inCorso(conto = chi.adesso() ?? ''): Lettura | null {
  return letture.get(conto) ?? null
}

/** Il modello sta scegliendo le carte per questo conto, adesso. */
export function staScegliendo(conto = chi.adesso() ?? ''): boolean {
  return scegliendo.has(conto)
}

const nuovoId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).padEnd(4, '0')

/**
 * Avvia la lettura di questo conto, o torna quella che corre già.
 * `fai` è la catena; parte senza essere aspettata.
 */
export function avvia(conto: string, fai: (c: Controllo) => Promise<void>, o: { unita: boolean }): { lettura: Lettura; nuova: boolean } {
  const gia = letture.get(conto)
  if (gia) return { lettura: gia, nuova: false }
  const lettura: Lettura = { id: nuovoId(), dal: new Date().toISOString(), passo: o.unita ? 'fonti' : 'arrivato', n: null, unita: o.unita }
  letture.set(conto, lettura)
  chi.dentro(conto, () => compiti.annunciaLettura({ stato: 'corre', lettura: { ...lettura } }))
  let chiusa = false
  // `fine` o `guaio` una volta sola, e il registro se ne va nello stesso momento
  const chiudi = (e: { stato: 'fine' } | { stato: 'guaio'; errore: string }) => {
    if (chiusa) return
    chiusa = true
    if (letture.get(conto) === lettura) letture.delete(conto)
    scegliendo.delete(conto)
    if (e.stato === 'fine') compiti.annunciaLettura({ stato: 'fine', lettura: { ...lettura }, nuove: store.feedNateDal(lettura.dal) })
    else compiti.annunciaLettura({ stato: 'guaio', lettura: { ...lettura }, errore: e.errore })
  }
  const controllo: Controllo = {
    passo(p, n) {
      if (chiusa) return
      const nn = n ?? null
      if (lettura.passo === p && lettura.n === nn) return
      lettura.passo = p
      lettura.n = nn
      compiti.annunciaLettura({ stato: 'corre', lettura: { ...lettura } })
    },
    async scegli(f) {
      if (!chiusa) scegliendo.add(conto)
      try { return await f() } finally { scegliendo.delete(conto) }
    }
  }
  void chi.dentro(conto, () => withBackgroundWork(() => tempi.misuraLavoro('lettura-chiesta', async () => {
    let posa: ReturnType<typeof setTimeout> | undefined
    const posata = new Promise<'posa'>(r => { posa = setTimeout(() => r('posa'), POSA); posa.unref?.() })
    const catena = fai(controllo)
    try {
      const primo = await Promise.race([catena.then(() => 'fatto' as const), posata])
      if (primo === 'posa') {
        console.log('myynd · lettura chiesta · oltre tre minuti: la riga si posa, il resto continua')
        chiudi({ stato: 'fine' })
        // il resto della catena va avanti, senza riga: un suo errore finisce nel registro
        await catena.catch(e => console.error('myynd · lettura chiesta, dopo la riga:', e instanceof Error ? e.message : e))
        return
      }
      chiudi({ stato: 'fine' })
    } catch (e) {
      console.error('myynd · lettura chiesta:', e instanceof Error ? e.message : e)
      chiudi({ stato: 'guaio', errore: e instanceof Error && e.message ? e.message : 'La lettura non è riuscita.' })
    } finally {
      clearTimeout(posa)
      if (letture.get(conto) === lettura) letture.delete(conto)
    }
  })))
  return { lettura: { ...lettura }, nuova: true }
}

export function perProva(o: { posa?: number } = {}): void {
  letture.clear()
  scegliendo.clear()
  POSA = o.posa ?? 3 * 60_000
}
