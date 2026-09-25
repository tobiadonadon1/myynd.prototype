import { t } from '../lingua'
import { ConnectorTile } from '../components/ConnectorIcon'
import type { Vals } from '../vals'
import '../components/connessioni.css'

/** Only available integrations are in the catalog; planned sources stay secondary. */
export function Connettori({ v }: { v: Vals }) {
  /*
   * Durante «Rileggi tutto» ogni scheda collegata dice a che punto è la sua
   * fonte: in coda, quanti documenti, o perché non si è letta. Prima lo diceva
   * solo il bottone, una fonte alla volta, e alla fine non restava niente per
   * sapere quale era andata. Letta, torna a dire quello che dice sempre.
   */
  /*
   * Una fonte che non si è letta lo dice finché lo dice il server: la lettura
   * di sfondo dei dieci minuti che la trova a posto la toglie da
   * `fontiNonLette`, e la scheda torna a dire i suoi documenti invece di un
   * «non letta» rimasto lì da prima.
   */
  const riga = (id: string) => v.letturaFonti?.find(r => r.id === id
    && (r.stato === 'attesa' || r.stato === 'leggo' ? !!v.sincronizzando : r.stato !== 'fatto' && v.fontiNonLette.includes(id)))
  const inLettura = (id: string, solita: string) => {
    const r = riga(id)
    return !r ? solita : r.stato === 'attesa' ? t('In coda') : r.stato === 'leggo' ? r.testo || t('leggo…')
      : r.stato === 'avviso' ? r.testo : `${t('Non letta')} · ${r.testo}`
  }
  const fonti = [
    ...v.connAttivi.map(c => ({ id: c.id, nome: c.nome, nota: inLettura(c.id, c.stato), collegata: true, problema: c.problema, parola: c.parola })),
    ...v.connSpenti.map(c => ({ id: c.id, nome: c.nome, nota: t(c.nota), collegata: false, problema: false, parola: undefined as string | undefined }))
  ]
  // niente filtro e niente ricerca: sono una dozzina di tessere, e i due gruppi
  // dicono già l'unica cosa che uno cerca — cosa è acceso, cosa manca

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
  const collegate = fonti.filter(c => c.collegata)
  const daCollegare = fonti.filter(c => !c.collegata)
  const gruppo = (titolo: string, quali: typeof fonti, classe: string) => !!quali.length &&
    <section className={`connections-group ${classe}`} aria-labelledby={`gruppo-${classe}`}>
      <h2 className="connections-group-heading" id={`gruppo-${classe}`}>{t(titolo)}<span>{quali.length}</span></h2>
      <div className="connector-tiles">
        {quali.map(c => <ConnectorTile key={c.id} id={c.id} nome={c.nome} nota={c.nota} collegata={c.collegata} problema={c.problema} parola={c.parola} apri={() => v.apriConnessioni(c.id)} />)}
      </div>
    </section>

  return <main className="connections-page">
    <header className="connections-header">
      <div>
        <h1>{t('Fonti')}</h1>
      </div>
      {/* la riga di avanzamento sta sulle schede, fonte per fonte: il bottone dice solo che sta leggendo */}
      {v.connCount > 0 && <button className="connections-button" onClick={v.sincronizza} disabled={!!v.sincronizzando} aria-busy={!!v.sincronizzando || undefined}>{v.sincronizzando ? t('Leggo…') : t('Rileggi tutto')}</button>}
    </header>
    {gruppo('Collegate', collegate, 'collegate')}
    {gruppo('Da collegare', daCollegare, 'da-collegare')}
    {!!v.connFuturi.length && <details className="connections-future"><summary>{t('Più avanti')} <span>{v.connFuturi.length}</span></summary>
      <p>{t('Questi restano qui perché fanno parte del disegno, ma non sono ancora collegabili.')}</p>
      <div>{v.connFuturi.map(c => <span key={c.id} title={t(c.nota)}>{t(c.nome)}</span>)}</div>
    </details>}
  </main>
}
