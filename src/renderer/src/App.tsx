/**
 * Shell + stato di navigazione. Quattro schermi, nessun router.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ModelStatus, Proposal } from '@shared/types'
import { api } from './lib/api'
import { pollUntilReady } from './lib/pollUntilReady'
import { BUDGET_DASHBOARD_PRONTA, dashboardPronta } from './lib/preparazione'
import { askInCorso } from './lib/useAsk'
import { annullaBozzaGlobale } from './lib/modificaBozza'
import { Dashboard } from './screens/Dashboard'
import { Attesa } from './screens/Attesa'
import { Chiedi } from './screens/Chiedi'
import { Trasparenza } from './screens/Trasparenza'

export type Vista =
  | { s: 'dashboard' }
  | { s: 'attesa'; id?: string }
  | { s: 'chiedi' }
  | { s: 'trasparenza' }

export default function App() {
  const [vista, setVista] = useState<Vista>({ s: 'dashboard' })
  const [inAttesa, setInAttesa] = useState(0)
  const [modello, setModello] = useState<ModelStatus | null>(null)

  useEffect(() => {
    // subito dopo l'avvio la CLI è ancora in fase di probe: un'unica
    // lettura al mount può cadere proprio nella finestra in cui il modello
    // non è ancora pronto e restare così per sempre. Si ripete finché non
    // si assesta lo stato da cui dipende davvero questa riga — modello
    // pronto E bozze non più in rigenerazione, non il solo modello: quello
    // da solo può tornare pronto con `waiting` ancora a zero, e il rail
    // (punto e conteggio, l'unico colore concesso in tutta l'interfaccia)
    // resterebbe spento per l'intera sessione mentre tre proposte aspettano
    // — e ci si ferma da soli non appena risolve (o esaurisce i tentativi).
    let cancellaPoll: (() => void) | null = null

    const avviaPoll = (): void => {
      cancellaPoll?.()
      cancellaPoll = pollUntilReady(
        () => api.getDashboard(),
        dashboardPronta,
        (d) => {
          setInAttesa(d.waiting.length)
          setModello(d.model)
        },
        {
          ...BUDGET_DASHBOARD_PRONTA,
          onUnavailable: () => setModello({ ready: false, reason: 'claude non raggiungibile.', model: '—' }),
        },
      )
    }

    avviaPoll()

    // il main segnala che la finestra è tornata in primo piano: è il
    // momento della scena d'apertura, si torna a "oggi" con dati freschi.
    const disiscriviShown = api.onShown(() => {
      setVista({ s: 'dashboard' })
      avviaPoll()
    })

    return () => {
      cancellaPoll?.()
      disiscriviShown()
    }
  }, [])

  useEffect(() => {
    // esc nasconde la finestra — ma non mentre si modifica una bozza (lì
    // annulla la modifica, da qualunque punto dello schermo abbia il
    // focus: non basta controllare il focus stesso, perché un tab fuori
    // dal testo editabile — es. sul bottone "salva" — lo sposterebbe
    // altrove e l'evento arriverebbe qui senza che nulla l'abbia fermato
    // prima) né a metà di una domanda in streaming (si lascia proseguire
    // in silenzio).
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      if (annullaBozzaGlobale()) return
      if (askInCorso()) return
      api.hideWindow()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const onProposteAggiornate = useCallback((lista: Proposal[]) => {
    setInAttesa(lista.filter((p) => p.status === 'in_attesa').length)
  }, [])

  return (
    <div className="shell">
      <div className="topbar">
        <span className="wordmark">myynd</span>
        <span className="topbar__status">
          {modello ? (modello.ready ? 'sincronizzato.' : 'il modello non è raggiungibile.') : ''}
        </span>
      </div>

      <nav className="rail">
        <button
          className={`rail__item${vista.s === 'dashboard' ? ' is-active' : ''}`}
          aria-current={vista.s === 'dashboard' ? 'page' : undefined}
          onClick={() => setVista({ s: 'dashboard' })}
        >
          oggi
        </button>

        <button
          className={`rail__item${vista.s === 'attesa' ? ' is-active' : ''}`}
          aria-current={vista.s === 'attesa' ? 'page' : undefined}
          onClick={() => setVista({ s: 'attesa' })}
        >
          {inAttesa > 0 && <span className="dot-attesa" />}
          lavoro in attesa
          {inAttesa > 0 && <span className="rail__count">{inAttesa}</span>}
        </button>

        <button
          className={`rail__item${vista.s === 'chiedi' ? ' is-active' : ''}`}
          aria-current={vista.s === 'chiedi' ? 'page' : undefined}
          onClick={() => setVista({ s: 'chiedi' })}
        >
          chiedi
        </button>

        <button
          className={`rail__item${vista.s === 'trasparenza' ? ' is-active' : ''}`}
          aria-current={vista.s === 'trasparenza' ? 'page' : undefined}
          onClick={() => setVista({ s: 'trasparenza' })}
        >
          trasparenza
        </button>
      </nav>

      {vista.s === 'dashboard' && <Dashboard onNavigate={setVista} />}
      {vista.s === 'attesa' && (
        <Attesa id={vista.id} onNavigate={setVista} onProposteAggiornate={onProposteAggiornate} />
      )}
      {vista.s === 'chiedi' && <Chiedi />}
      {vista.s === 'trasparenza' && <Trasparenza />}
    </div>
  )
}
