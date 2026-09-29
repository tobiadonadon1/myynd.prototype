// Il turno e il guscio dell'app sul Mac (F9).
//
// «A first full night on your Mac before anyone else gets it.» Perché una
// notte vada fino in fondo servono tre cose che solo il guscio può fare, e
// che il server gli chiede su `parentPort`:
//
//   · tenere sveglio il Mac. Il permesso di non addormentarsi c'era solo
//     mentre una carta lavorava (`lavoro-background.ts`): se il Mac si
//     addormentava prima delle dieci, la notte non cominciava mai. Qui, ogni
//     quindici secondi, finché la notte è vicina (un'ora prima) o in corso,
//     il turno acceso e non fermo, carte in coda e budget, si rinnova lo
//     stesso permesso. Nessuna sveglia programmata: niente permessi da
//     amministratore, e un server morto non tiene sveglio niente (il
//     permesso scade da solo);
//   · sapere se c'è una notte in attesa, per chiedere prima di uscire;
//   · fermare il turno dalla barra dei menu: `{ tipo: 'turno', azione: 'ferma' }`.
//
// Fuori da Electron (un server, una prova) non c'è il filo, e non succede niente.

import * as chi from './chi.ts'
import * as conti from './conti.ts'
import * as store from './store.ts'
import * as osservatore from './osservatore.ts'
import * as turno from './turno.ts'

type Filo = {
  on(evento: 'message', f: (m: { data?: unknown }) => void): unknown
  postMessage?(m: unknown): void
}

const filoDiProcesso = () => (process as unknown as { parentPort?: Filo }).parentPort ?? null

/**
 * I conti di questo Mac: quello di chi ha acceso l'osservatore, o l'unico
 * che c'è. Con più conti e nessun proprietario, tutti: fermare è una
 * sicurezza, e sul Mac di casa i conti sono di chi ci sta davanti.
 */
export function contiDelMac(): string[] {
  const p = osservatore.proprietario()
  return p ? [p] : conti.tutti()
}

/** Il turno, visto dal guscio: quello di tutti i conti del Mac messo insieme. */
export function vegliaDelMac(adesso = new Date()): turno.Veglia {
  const v: turno.Veglia = { sveglio: false, inAttesa: false, lavora: false, fermo: false }
  for (const u of contiDelMac()) {
    try {
      const x = chi.dentro(u, () => store.senzaToccare(() => turno.veglia(adesso)))
      v.sveglio ||= x.sveglio; v.inAttesa ||= x.inAttesa; v.lavora ||= x.lavora; v.fermo ||= x.fermo
    } catch { /* un conto che non risponde non ferma gli altri */ }
  }
  return v
}

/** Ogni quanto si rinnova il permesso di restare sveglio: il guscio lo tiene per 45 secondi. */
export const OGNI = 15_000

let avviato = false
/**
 * All'avvio, dentro l'app: ascolta il «ferma» della barra dei menu, e ogni
 * quindici secondi dice al guscio se tenere sveglio il Mac e com'è il turno.
 * Torna `true` se c'era il filo. Una volta sola per processo.
 */
export function avvia(filo: Filo | null = filoDiProcesso()): boolean {
  if (!filo || avviato) return false
  avviato = true
  filo.on('message', m => {
    const d = m?.data as { tipo?: unknown; azione?: unknown } | undefined
    if (d?.tipo !== 'turno' || d.azione !== 'ferma') return
    for (const u of contiDelMac()) {
      try { chi.dentro(u, () => turno.ferma()) } catch (e) { console.warn('myynd · il turno non si è fermato:', e instanceof Error ? e.message : e) }
    }
    manda(filo)
  })
  const giro = () => manda(filo)
  setTimeout(giro, 2_000).unref?.()
  setInterval(giro, OGNI).unref?.()
  return true
}

function manda(filo: Filo) {
  const v = vegliaDelMac()
  try {
    // solo `attivo: true`: il permesso scade da solo, e un `false` qui spegnerebbe quello di una carta al lavoro
    if (v.sveglio) filo.postMessage?.({ tipo: 'lavoro-background', attivo: true })
    filo.postMessage?.({ tipo: 'turno-stato', inAttesa: v.inAttesa, lavora: v.lavora, fermo: v.fermo })
  } catch { /* il guscio è uscito */ }
}
