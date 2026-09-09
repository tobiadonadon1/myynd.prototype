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

  /*
   * Due gruppi, non una griglia sola.
   *
   * Prima le collegate e le da collegare stavano mescolate nello stesso
   * riquadro, in ordine di catalogo, e l'unica cosa che le distingueva era la
   * tinta della piastrella. Funziona per chi già sa cosa sta guardando; per
   * chiunque altro «cos'è acceso?» diventa un lavoro di lettura, tessera per
   * tessera. Il filtro qui sopra c'era già, ma un filtro chiede di sapere in
   * anticipo cosa cercare — e la domanda vera è quasi sempre l'altra: *cosa mi
   * manca?*. Divise, con il conto scritto accanto al titolo, la risposta si
   * legge senza cliccare niente e senza contare.
   *
   * L'ordine non è alfabetico e non è casuale: dentro ogni gruppo resta quello
   * del catalogo, che è già stato deciso una volta in `registro.ts`.
   */
  const collegate = viste.filter(c => c.collegata)
  const daCollegare = viste.filter(c => !c.collegata)
  const gruppo = (titolo: string, quali: typeof viste, classe: string) => !!quali.length &&
    <section className={`connections-group ${classe}`} aria-labelledby={`gruppo-${classe}`}>
      <h2 className="connections-group-heading" id={`gruppo-${classe}`}>{t(titolo)}<span>{quali.length}</span></h2>
      <div className="connector-tiles">
        {quali.map(c => <ConnectorTile key={c.id} id={c.id} nome={c.nome} collegata={c.collegata} apri={() => v.apriConnessioni(c.id)} />)}
      </div>
    </section>

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
    {gruppo('Collegate', collegate, 'collegate')}
    {gruppo('Da collegare', daCollegare, 'da-collegare')}
    {!viste.length && <div className="connections-empty"><p>{t('Nessun risultato')}</p><button className="connections-button" onClick={() => { setCerca(''); setFiltro('tutti') }}>{t('Mostra tutte')}</button></div>}
    {!!v.connFuturi.length && <details className="connections-future"><summary>{t('Più avanti')} <span>{v.connFuturi.length}</span></summary>
      <p>{t('Questi restano qui perché fanno parte del disegno, ma non sono ancora collegabili.')}</p>
      <div>{v.connFuturi.map(c => <span key={c.id} title={t(c.nota)}>{t(c.nome)}</span>)}</div>
    </details>}
  </main>
}
