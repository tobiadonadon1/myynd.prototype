/**
 * chiedi — una domanda, una risposta. Non è una chat: la risposta nuova
 * prende il posto della vecchia, niente cronologia, niente bolle.
 */

import { useEffect, useState } from 'react'
import type { Answer, ModelStatus } from '@shared/types'
import { api } from '../lib/api'
import { pollUntilReady } from '../lib/pollUntilReady'
import { useAsk, impostaDomanda } from '../lib/useAsk'
import { nascondiMarcatoreIncompleto } from '../lib/markers'
import { Testo } from '../components/Testo'

function paragrafi(testo: string): string[] {
  return testo
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

// La frase e la riga grigia del "non lo so" a volte si sovrappongono (la
// riga grigia ripete la frase, in tutto o in parte): l'onestà del prodotto
// passa da qui, quindi si mostra una sola riga anche se il motore ne manda
// due che dicono la stessa cosa.
function testoENota(text: string, note: string | undefined): { text: string; note: string | null } {
  const t = (text ?? '').trim()
  const n = (note ?? '').trim()
  if (!n) return { text: t, note: null }
  if (!t) return { text: n, note: null }
  if (t.includes(n) || n.includes(t)) return { text: t, note: null }
  return { text: t, note: n }
}

export function Chiedi() {
  const { domanda, testo, pensando, risposta, errore, inCorso, chiedi } = useAsk()
  const [modello, setModello] = useState<ModelStatus | null>(null)
  const [fase, setFase] = useState(0)

  useEffect(() => {
    // stesso motivo di Dashboard.tsx: al cold start il modello può
    // diventare pronto pochi secondi dopo il mount di questa schermata.
    return pollUntilReady(
      () => api.getModelStatus(),
      (m) => m.ready,
      (m) => setModello(m),
      {
        // tutti i tentativi falliti, mai una lettura riuscita: senza
        // questo `modello` resterebbe `null` per sempre — schermo bianco
        // invece dello stato onesto già previsto per il modello assente.
        onUnavailable: () => setModello({ ready: false, reason: 'claude non raggiungibile.', model: '—' }),
      },
    )
  }, [])

  // la riga d'attesa varia con il tempo invece di restare identica per
  // tutta la durata dell'attesa: altrimenti una richiesta lenta sembra
  // bloccata invece che al lavoro.
  useEffect(() => {
    if (!pensando) {
      setFase(0)
      return
    }
    const t = setTimeout(() => setFase(1), 900)
    return () => clearTimeout(t)
  }, [pensando])

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    const testoDomanda = domanda.trim()
    if (!testoDomanda) return
    // una domanda alla volta: se una è ancora aperta se ne ignora una
    // nuova invece di accodarla nella sessione della CLI, dove non c'è
    // modo di annullarla. L'input resta disabilitato finché dura, così
    // non sembra semplicemente ignorata.
    if (inCorso) return
    chiedi(testoDomanda)
  }

  if (!modello) return null

  if (!modello.ready) {
    return (
      <div className="screen">
        <h1 className="screen-title">chiedi</h1>
        <div className="firstrun">
          <p className="firstrun__lede">{modello.reason?.trim() || 'claude non collegato.'}</p>
          <p className="firstrun__status">il lavoro già preparato resta leggibile.</p>
        </div>
      </div>
    )
  }

  const rispostaOk: Answer | null = risposta?.status === 'ok' ? risposta : null
  const rispostaIgnota = risposta?.status === 'insufficiente' ? testoENota(risposta.text, risposta.note) : null

  return (
    <div className="screen">
      <h1 className="screen-title">chiedi</h1>

      <form className="ask" onSubmit={handleSubmit}>
        <input
          className="ask__input"
          type="text"
          placeholder="chiedi."
          value={domanda}
          disabled={inCorso}
          onChange={(e) => impostaDomanda(e.target.value)}
        />

        {pensando && (
          <p className="thinking">{fase === 0 ? 'sto leggendo la domanda.' : 'sto cercando nei documenti.'}</p>
        )}

        {!pensando && errore && (
          <div className="firstrun">
            <p className="firstrun__lede">{errore}</p>
            <p className="firstrun__status">il lavoro già preparato resta leggibile.</p>
          </div>
        )}

        {!pensando && !errore && rispostaIgnota && (
          <div className="unknown">
            <p className="unknown__text">
              <Testo testo={rispostaIgnota.text} sorgenti={risposta?.sources ?? []} />
            </p>
            {rispostaIgnota.note && (
              <p className="unknown__why">
                <Testo testo={rispostaIgnota.note} sorgenti={risposta?.sources ?? []} />
              </p>
            )}
          </div>
        )}

        {!pensando && !errore && risposta?.status === 'non_disponibile' && (
          <div className="firstrun">
            <p className="firstrun__lede">{risposta.note?.trim() || 'claude non collegato.'}</p>
            <p className="firstrun__status">il lavoro già preparato resta leggibile.</p>
          </div>
        )}

        {!pensando && !errore && rispostaOk && (
          <div className="answer prose">
            {paragrafi(rispostaOk.text).map((p, i) => (
              <p key={i}>
                <Testo testo={p} sorgenti={rispostaOk.sources} />
              </p>
            ))}
          </div>
        )}

        {!pensando && !errore && !risposta && testo && (
          <div className="answer prose">
            {paragrafi(nascondiMarcatoreIncompleto(testo)).map((p, i, arr) => (
              <p key={i}>
                <Testo testo={p} sorgenti={[]} />
                {i === arr.length - 1 && <span className="caret" />}
              </p>
            ))}
          </div>
        )}
      </form>
    </div>
  )
}
