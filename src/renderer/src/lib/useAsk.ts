/**
 * Hook per la domanda in streaming. Chiama `api.ask`, si iscrive a
 * `onAskChunk` e accumula i token mentre arrivano. Mai uno spinner: prima
 * del primo token lo dice il chiamante (riga `.thinking`), qui c'è solo
 * `pensando`. Alla ricezione di `done` sostituisce il testo accumulato con
 * `answer.text` e attacca le sorgenti.
 *
 * Lo stato vive a livello di modulo, non del componente — inclusa la
 * domanda stessa, non solo la risposta: le due devono restare insieme.
 * `chiedi` non è una chat: una domanda alla volta. Ma la richiesta prosegue
 * in main indipendentemente dallo schermo attivo — se chi la fa lascia
 * "chiedi" a metà streaming (per guardare un'altra vista) e ci torna, deve
 * trovare la stessa domanda sopra la stessa risposta, al punto in cui sono
 * arrivate, mai un buco silenzioso lasciato da uno smontaggio di React (e
 * mai una risposta sopra un campo vuoto, che non direbbe più a cosa
 * risponde). Per questo la sottoscrizione a `onAskChunk` non è legata al
 * ciclo di vita del componente: resta aperta finché la domanda non è
 * conclusa (`done`/`error`) o non ne arriva una nuova, e ogni componente
 * che monta `useAsk()` vede lo stato reale così com'è in quel momento.
 *
 * Fare una nuova domanda annulla in modo pulito quella in corso: la
 * sottoscrizione precedente viene chiusa prima di aprirne una nuova, così
 * un chunk in ritardo della domanda vecchia non può mai scrivere nella
 * risposta nuova. `inCorso` resta vero dall'invio fino a `done`/`error`
 * (più a lungo di `pensando`, che si spegne al primo token): serve a chi
 * chiama per evitare di accodare una nuova domanda nella stessa sessione
 * mentre una è ancora aperta.
 *
 * `reset` (vedi `AskChunk` in `@shared/types`): il motore lo manda quando
 * un turno muore a metà ed è stato ripetuto da capo. Il testo accumulato
 * fino a quel momento è un frammento troncato del tentativo morto, non
 * l'inizio della risposta vera — va scartato, non tenuto e concatenato
 * con quello del tentativo nuovo, altrimenti in streaming si vede per
 * qualche secondo un frammento rotto seguito dal testo corretto attaccato
 * in coda. `answer.text` a `done` è sempre pulito, ma lo streaming è
 * l'esperienza che il prodotto promette: non è solo estetica.
 */

import { useCallback, useSyncExternalStore } from 'react'
import type { Answer, AskChunk } from '@shared/types'
import { api } from './api'

interface StatoAsk {
  domanda: string
  testo: string
  pensando: boolean
  risposta: Answer | null
  errore: string | null
  /** vero dall'invio della domanda fino a 'done' o 'error', non solo fino al primo token. */
  inCorso: boolean
}

const statoIniziale: StatoAsk = {
  domanda: '',
  testo: '',
  pensando: false,
  risposta: null,
  errore: null,
  inCorso: false,
}

let stato: StatoAsk = statoIniziale
let disiscriviChunk: (() => void) | null = null
const ascoltatori = new Set<() => void>()

function aggiorna(parziale: Partial<StatoAsk>): void {
  stato = { ...stato, ...parziale }
  ascoltatori.forEach((fn) => fn())
}

function sottoscrivi(fn: () => void): () => void {
  ascoltatori.add(fn)
  return () => {
    ascoltatori.delete(fn)
  }
}

function leggiStato(): StatoAsk {
  return stato
}

function pulisci(): void {
  disiscriviChunk?.()
  disiscriviChunk = null
}

/** vero se una domanda è ancora aperta (dall'invio fino a done/error). Letta
 *  da fuori (es. per decidere se `esc` può nascondere la finestra) senza
 *  doversi iscrivere allo stato. */
export function askInCorso(): boolean {
  return stato.inCorso
}

/** aggiorna la domanda mentre si scrive, prima ancora di inviarla: anche il
 *  testo non ancora inviato vive qui, così sopravvive a una navigazione
 *  via e ritorno tanto quanto la domanda già inviata e la sua risposta. */
export function impostaDomanda(testo: string): void {
  aggiorna({ domanda: testo })
}

function avviaDomanda(domanda: string): void {
  // guardia sulla verità di modulo, non su un `inCorso` letto dal
  // chiamante: quest'ultimo può essere lo stato di un render già superato
  // (due submit nello stesso tick vedrebbero entrambi lo stesso valore
  // "non in corso" prima che React ne renda uno nuovo). Leggere `stato`
  // qui è sincrono e sempre aggiornato, quindi anche un doppio invio nello
  // stesso istante non può accodare una seconda domanda mentre una è aperta.
  if (stato.inCorso) return
  pulisci()
  aggiorna({ domanda, testo: '', pensando: true, risposta: null, errore: null, inCorso: true })

  let requestIdAttuale: string | null = null
  const bufferPrecoce: AskChunk[] = []

  const applica = (chunk: AskChunk): void => {
    if (chunk.type === 'token') {
      aggiorna({ pensando: false, testo: stato.testo + (chunk.text ?? '') })
    } else if (chunk.type === 'reset') {
      // il tentativo in corso è morto a metà ed è stato ripetuto da capo:
      // il frammento accumulato finora appartiene al tentativo morto.
      // Si torna come se non fosse ancora arrivato nessun token, in attesa
      // che il retry ne mandi di nuovi.
      aggiorna({ testo: '', pensando: true })
    } else if (chunk.type === 'done') {
      aggiorna({
        pensando: false,
        testo: chunk.answer?.text ?? stato.testo,
        risposta: chunk.answer ?? null,
        inCorso: false,
      })
      pulisci()
    } else if (chunk.type === 'error') {
      aggiorna({ pensando: false, errore: chunk.message ?? 'errore.', inCorso: false })
      pulisci()
    }
  }

  const gestisci = (chunk: AskChunk): void => {
    if (requestIdAttuale === null) {
      // il primo token può arrivare prima che `api.ask` sia risolta:
      // si mette da parte finché non si conosce il vero requestId.
      bufferPrecoce.push(chunk)
      return
    }
    if (chunk.requestId !== requestIdAttuale) return
    applica(chunk)
  }

  disiscriviChunk = api.onAskChunk(gestisci)

  void api.ask(domanda).then(({ requestId }) => {
    requestIdAttuale = requestId
    for (const chunk of bufferPrecoce) {
      if (chunk.requestId === requestId) applica(chunk)
    }
    bufferPrecoce.length = 0
  })
}

export function useAsk(): StatoAsk & { chiedi: (domanda: string) => void; annulla: () => void } {
  const statoCorrente = useSyncExternalStore(sottoscrivi, leggiStato)

  const chiedi = useCallback((domanda: string) => {
    avviaDomanda(domanda)
  }, [])

  const annulla = useCallback(() => {
    // "non lascia stato sporco" (RENDERER.md): chiudere solo la
    // sottoscrizione non basta — senza azzerare anche `inCorso`/`pensando`
    // (e il frammento accumulato, se una era in streaming) l'input
    // resterebbe disabilitato, ogni domanda successiva verrebbe ignorata
    // dalla guardia anti-accodamento, ed `esc` non potrebbe più nascondere
    // la finestra: un blocco permanente, non un annullamento pulito.
    pulisci()
    aggiorna({ pensando: false, inCorso: false, testo: '', risposta: null, errore: null })
  }, [])

  return { ...statoCorrente, chiedi, annulla }
}
