// La coda degli avvisi di sistema, nel guscio.
//
// La pagina decide cosa dire e quando (`src/avvisi.ts`); qui si mostra e
// basta. Resta una regola sola, contro una pagina impazzita o due pagine che
// parlano insieme: non più di un avviso ogni due secondi. Prima quello che
// arrivava dentro i due secondi si buttava — una bozza pronta un attimo dopo
// un'altra non la diceva nessuno. Adesso aspetta la fine dei due secondi, e
// se nel frattempo ne sono arrivati altri escono tutti in uno: «3 things are
// ready», con i loro titoli sotto.

/** Quello che la pagina chiede di mostrare, già ripulito. */
export type Nota<D> = { titolo: string; corpo: string; dove: D }

export type Coda<D> = { metti(n: Nota<D>): void }

/** Il passo minimo fra due avvisi. */
export const PAUSA_MS = 2_000
/** Quante ne aspettano al massimo: oltre, le più vecchie se ne vanno (il numero nel titolo le conta lo stesso). */
const IN_ATTESA_MAX = 20

/**
 * Le note che aspettavano, in una.
 *
 * Una sola: lei, com'era. Tante: quante sono nel titolo, i titoli loro sotto,
 * e il posto comune — o `altrove` se stanno in posti diversi.
 */
export function unisci<D>(note: readonly Nota<D>[], quante: (n: number) => string, altrove: D): Nota<D> {
  if (note.length === 1) return note[0]
  const stesso = note.every(n => JSON.stringify(n.dove) === JSON.stringify(note[0].dove))
  const corpo = note.map(n => n.corpo || n.titolo).filter(Boolean).join(' · ')
  return { titolo: quante(note.length), corpo: corpo.length > 300 ? `${corpo.slice(0, 299)}…` : corpo, dove: stesso ? note[0].dove : altrove }
}

/**
 * Una coda: la prima nota esce subito, quelle dentro i due secondi dopo
 * aspettano e poi escono insieme. Orologio e timer si passano per poterla
 * provare senza aspettare davvero.
 */
export function creaCoda<D>(o: {
  mostra: (n: Nota<D>) => void
  quante: (n: number) => string
  altrove: D
  adesso?: () => number
  dopo?: (f: () => void, ms: number) => unknown
}): Coda<D> {
  const adesso = o.adesso ?? Date.now
  const dopo = o.dopo ?? ((f, ms) => setTimeout(f, ms))
  let ultimo = -Infinity
  let attesa: Nota<D>[] = []
  let contate = 0
  let programmato = false

  const svuota = () => {
    programmato = false
    if (!attesa.length) return
    const note = attesa
    const n = contate
    attesa = []; contate = 0
    ultimo = adesso()
    const una = unisci(note, quante => o.quante(Math.max(quante, n)), o.altrove)
    o.mostra(una)
  }

  return {
    metti(n) {
      const ora = adesso()
      if (!programmato && !attesa.length && ora - ultimo >= PAUSA_MS) {
        ultimo = ora
        o.mostra(n)
        return
      }
      attesa.push(n)
      contate++
      if (attesa.length > IN_ATTESA_MAX) attesa.shift()
      if (!programmato) {
        programmato = true
        dopo(svuota, Math.max(0, ultimo + PAUSA_MS - ora))
      }
    }
  }
}
