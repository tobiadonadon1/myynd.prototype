// C'è o non c'è (F2).
//
// Il turno fa partire le proposte di Myynd quando lei non c'è: di notte, o
// di giorno quando il Mac è fermo. «Fermo» lo sa solo il guscio dell'app —
// `powerMonitor.getSystemIdleTime()` e lo schermo bloccato — e lo dice al
// server con un messaggio su `parentPort`, come la sveglia:
//
//   { tipo: 'presenza', inattivo: <secondi> }
//
// ogni minuto, e subito quando lo schermo si blocca o si sblocca. Solo un
// numero: nessuna app, nessun titolo, niente di quello che fa.
//
// Fuori da Electron (un server, una prova) non arriva niente, e allora non
// si sa: `assente()` dice di no, e le proposte aspettano la notte.

/** Quanto deve essere fermo il Mac perché lei «non ci sia»: un quarto d'ora. */
export const ASSENTE_DOPO = 15 * 60
/** Un'ultima notizia più vecchia di così non vale più: il guscio può essere morto. */
const VALE_PER = 3 * 60_000

let ultima: { inattivo: number; quando: number; batteria?: boolean } | null = null

/** L'ultima notizia dal guscio, se c'è. Solo per chi la mostra (lo stato del turno). */
export function ultimaNotizia(): { inattivo: number; quando: number; batteria?: boolean } | null { return ultima }

/**
 * Il guscio ha detto quanto è fermo il Mac, e (F9) se va a batteria: di
 * notte, senza corrente, il Mac si addormenta anche con il permesso di
 * restare sveglio, e le preferenze lo dicono.
 */
export function registra(inattivo: unknown, quando = Date.now(), batteria?: unknown) {
  const n = Number(inattivo)
  if (!Number.isFinite(n) || n < 0) return
  ultima = { inattivo: Math.floor(n), quando, ...(typeof batteria === 'boolean' ? { batteria } : {}) }
}

/** F9 · il Mac va a batteria, detto di recente dal guscio. Fuori dall'app non si sa, e si dice di no. */
export function aBatteria(adesso = Date.now()): boolean {
  return !!ultima && adesso - ultima.quando <= VALE_PER && ultima.batteria === true
}

/** Lei non c'è: il Mac è fermo da un quarto d'ora, detto di recente. */
export function assente(adesso = Date.now()): boolean {
  return !!ultima && adesso - ultima.quando <= VALE_PER && ultima.inattivo >= ASSENTE_DOPO
}

type Filo = { on(evento: 'message', f: (m: { data?: unknown }) => void): unknown }

/** Si mette in ascolto sul filo del guscio, se c'è. Torna `true` se c'era. */
export function ascolta(filo?: Filo | null): boolean {
  const f = filo ?? (process as unknown as { parentPort?: Filo }).parentPort
  if (!f) return false
  f.on('message', m => {
    const d = m?.data as { tipo?: unknown; inattivo?: unknown; batteria?: unknown } | undefined
    if (d?.tipo === 'presenza') registra(d.inattivo, Date.now(), d.batteria)
  })
  return true
}

/** Solo per le prove. */
export function perProva(v: { inattivo: number; quando: number } | null) { ultima = v }
