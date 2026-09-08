import { useState } from 'react'
import { t } from '../lingua'
import { ConnectorTile } from '../components/ConnectorIcon'
import type { Vals } from '../vals'
import '../components/connessioni.css'

/** Only available integrations are in the catalog; planned sources stay secondary. */
export function Connettori({ v }: { v: Vals }) {
  const [cerca, setCerca] = useState('')
  const [filtro, setFiltro] = useState<'tutti' | 'attivi' | 'nuovi'>('tutti')
  const fonti = [
    ...v.connAttivi.map(c => ({ id: c.id, nome: c.nome, nota: c.stato, collegata: true })),
    ...v.connSpenti.map(c => ({ id: c.id, nome: c.nome, nota: t(c.nota), collegata: false }))
  ]
  const viste = fonti.filter(c =>
    (filtro === 'tutti' || (filtro === 'attivi' ? c.collegata : !c.collegata)) &&
    `${t(c.nome)} ${c.nota}`.toLocaleLowerCase().includes(cerca.toLocaleLowerCase()))

  return <main className="connections-page">
    <header className="connections-header">
      <h1>{t('Connettori')}</h1>
      {v.connCount > 0 && <button className="connections-button" onClick={v.sincronizza} disabled={!!v.sincronizzando}>{v.sincronizzando ?? t('Rileggi tutto')}</button>}
    </header>
    <div className="connections-toolbar">
      <div className="connections-filters" aria-label={t('Filtra connessioni')}>
        {([['tutti', 'Tutti'], ['attivi', 'Collegati'], ['nuovi', 'Da collegare']] as const).map(([id, label]) =>
          <button key={id} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{t(label)}<span>{id === 'tutti' ? fonti.length : id === 'attivi' ? v.connAttivi.length : v.connSpenti.length}</span></button>)}
      </div>
      <input type="search" aria-label={t('Cerca connessioni…')} placeholder={t('Cerca connessioni…')} value={cerca} onChange={e => setCerca(e.target.value)} />
    </div>
    <div className="connector-tiles">
      {viste.map(c => <ConnectorTile key={c.id} id={c.id} nome={c.nome} collegata={c.collegata} apri={() => v.apriConnessioni(c.id)} />)}
    </div>
    {!viste.length && <div className="connections-empty"><p>{t('Nessun risultato')}</p><button className="connections-button" onClick={() => { setCerca(''); setFiltro('tutti') }}>{t('Mostra tutte')}</button></div>}
    {!!v.connFuturi.length && <details className="connections-future"><summary>{t('Più avanti')} <span>{v.connFuturi.length}</span></summary>
      <p>{t('Questi restano qui perché fanno parte del disegno, ma non sono ancora collegabili.')}</p>
      <div>{v.connFuturi.map(c => <span key={c.id} title={t(c.nota)}>{t(c.nome)}</span>)}</div>
    </details>}
  </main>
}
