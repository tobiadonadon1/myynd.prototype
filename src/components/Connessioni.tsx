import { useEffect, useRef, useState } from 'react'
import { api, rigaSincronizzazione, type Stato } from '../api'
import { AccessoDisco, Form } from './forms'
import { frasi, loc, t } from '../lingua'
import { BottoneSicuro, useFocoDialogo } from '../ui'
import { ConnectorIcon, ConnectorTile } from './ConnectorIcon'
import './connessioni.css'

const MOTORI = ['claude', 'compatibile']

/** A quiet source picker; credentials and account controls appear only after choosing. */
export function Connessioni({ fonte, chiudi, cambiato }: {
  fonte?: string; chiudi: () => void; cambiato: () => void
}) {
  const [s, setS] = useState<Stato | null>(null)
  const [cerca, setCerca] = useState('')
  const [soloQuesta, setSoloQuesta] = useState(fonte || '')
  const [modifica, setModifica] = useState(false)
  const [fonteInLettura, setFonteInLettura] = useState<string | null>(null)
  const [avanzamento, setAvanzamento] = useState<string | null>(null)
  const [guaio, setGuaio] = useState<string | null>(null)
  const [subito, setSubito] = useState<string[]>([])
  const [collegando, setCollegando] = useState(false)
  const finestra = useRef<HTMLDivElement>(null)
  const indietro = useRef<HTMLButtonElement>(null)
  const ultimo = useRef(fonte || '')
  useFocoDialogo(finestra, chiudi)

  const ricarica = async () => { const n = await api.stato(); setS(n); return n }
  const carica = () => {
    setGuaio(null)
    void ricarica().catch(e => setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a rileggere questa fonte.')))
  }
  useEffect(() => { carica() }, [])
  useEffect(() => {
    if (!s) return
    const desktop = s.connettori.find(c => c.id === 'desktop')
    const puoi = desktop && !desktop.collegato && s.suggerimentiDesktop.length ? ['desktop'] : []
    let attuale = true
    api.chiaveNellAmbiente().then(r => {
      if (!attuale) return
      const claude = s.connettori.find(c => c.id === 'claude')
      setSubito(r.presente && claude && !claude.collegato ? [...puoi, 'claude'] : puoi)
    }).catch(() => { if (attuale) setSubito(puoi) })
    return () => { attuale = false }
  }, [s])

  const leggi = async (id: string) => {
    if (fonteInLettura) return
    setFonteInLettura(id); setAvanzamento(null); setGuaio(null)
    try {
      await api.sincronizza(m => { if (m.fase !== 'fine') setAvanzamento(rigaSincronizzazione(m)) }, id)
      await ricarica(); cambiato()
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a rileggere questa fonte.')) }
    setFonteInLettura(null); setAvanzamento(null)
  }
  const collegaSubito = async (id: string) => {
    if (collegando) return
    setCollegando(true); setGuaio(null)
    try {
      if (id === 'desktop' && s) await api.collegaDesktop(s.suggerimentiDesktop)
      else if (id === 'claude') await api.usaChiaveAmbiente()
      else return
      await ricarica(); cambiato()
      if (id === 'desktop') void leggi(id)
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a collegare.')) }
    finally { setCollegando(false) }
  }

  const tutti = s?.connettori.filter(c => (c.pronto || c.collegato) && c.id !== 'mind2do') ?? []
  const scelta = tutti.find(c => c.id === soloQuesta)
  const pronti = tutti.filter(c => `${t(c.nome)} ${t(c.nota)}`.toLocaleLowerCase().includes(cerca.toLocaleLowerCase()))
  const dopo = s?.connettori.filter(c => !c.pronto && !c.collegato) ?? []
  const apri = (id: string) => {
    ultimo.current = id; setSoloQuesta(id); setModifica(false)
    requestAnimationFrame(() => indietro.current?.focus())
  }
  const torna = () => {
    setSoloQuesta(''); setModifica(false)
    requestAnimationFrame(() => {
      const tiles = finestra.current?.querySelectorAll<HTMLButtonElement>('[data-connector]')
      Array.from(tiles ?? []).find(el => el.dataset.connector === ultimo.current)?.focus()
    })
  }

  return <>
    <div className="connections-backdrop" onClick={chiudi} />
    <div ref={finestra} className="connections-dialog" role="dialog" aria-modal="true" aria-labelledby="connessioni-titolo" tabIndex={-1}
      onKeyDown={e => {
        if (e.key !== 'Tab') return
        const focusabili = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]'))
          .filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'))
        const primo = focusabili[0], ultimo = focusabili[focusabili.length - 1]
        if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo?.focus() }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo?.focus() }
      }}>
      <header className="connections-dialog-header">
        {scelta && <button ref={indietro} className="connections-icon-button" onClick={torna} aria-label={t('‹ tutte le fonti')} title={t('‹ tutte le fonti')}>←</button>}
        <h2 id="connessioni-titolo">{scelta ? t(scelta.nome) : t('Connessioni')}</h2>
        <button className="connections-icon-button" onClick={chiudi} aria-label={t('Chiudi')} title={t('Chiudi')}>×</button>
      </header>
      <div className="connections-dialog-body">
        {guaio && <div role="alert" className="connections-feedback">{guaio}{!s && <button className="connections-button" onClick={carica}>{t('Riprova')}</button>}</div>}
        {avanzamento && <div role="status" className="connections-progress">{avanzamento}</div>}
        {!s && !guaio && <p role="status" className="connections-progress">{t('carico…')}</p>}
        {s && !scelta && <>
          <input className="connections-search" type="search" value={cerca} onChange={e => setCerca(e.target.value)} placeholder={t('Cerca connessioni…')} aria-label={t('Cerca connessioni…')} />
          {/* Lo stesso taglio della pagina intera: quello che c'è sopra, quello che
              manca sotto. Qui conta ancora di più, perché il pannello si apre per
              collegare qualcosa — e la seconda lista è quella che si è venuti a
              leggere. Vedi `connessioni.css`, «collegate sopra, da collegare sotto». */}
          {([['Collegate', pronti.filter(c => c.collegato), 'collegate'],
             ['Da collegare', pronti.filter(c => !c.collegato), 'da-collegare']] as const).map(([titolo, quali, classe]) => !!quali.length &&
            <section key={classe} className={`connections-group ${classe}`} aria-labelledby={`gruppo-${classe}`}>
              <h3 className="connections-group-heading" id={`gruppo-${classe}`}>{t(titolo)}<span>{quali.length}</span></h3>
              <div className="connector-tiles compact">{quali.map(c => <ConnectorTile key={c.id} id={c.id} nome={c.nome} collegata={c.collegato} apri={() => apri(c.id)} />)}</div>
            </section>)}
          {!pronti.length && <p className="connections-progress">{t('Nessun risultato')}</p>}
          {!!dopo.length && !cerca && <details className="connections-future"><summary>{t('Più avanti')} <span>{dopo.length}</span></summary><div>{dopo.map(c => <span key={c.id} title={t(c.nota)}>{t(c.nome)}</span>)}</div></details>}
        </>}
        {scelta && <div className="connection-detail">
          <div className={`connection-detail-overview ${scelta.collegato ? 'connected' : ''}`}>
            <span className="connector-tile-mark"><ConnectorIcon id={scelta.id} size={30} spenta={!scelta.collegato} /></span>
            <div><span className="connection-detail-status">{scelta.collegato ? t('Collegato') : t('Da collegare')}</span>
              <p>{scelta.collegato
                ? scelta.id === 'compatibile' && s?.config.compatibile
                  ? [s.config.compatibile.nome, s.config.compatibile.modello].filter(Boolean).join(' · ')
                  : [
                    scelta.documenti ? frasi.nDocumenti(scelta.documenti.toLocaleString(loc())) : null,
                    // il desktop dice se è la casa intera, e se la sta guardando dal vivo
                    scelta.id === 'desktop' && s?.config.desktop?.tutto ? t('il Mac intero') : null,
                    scelta.id === 'desktop' && s?.vedetta?.attiva ? t('in ascolto') : null
                  ].filter(Boolean).join(' · ') || t(scelta.nota)
                : t(scelta.nota)}</p>
            </div>
          </div>
          {/* le Note senza il permesso restano a zero: la riga con la strada sta qui, dove si guarda */}
          {scelta.id === 'note' && s?.accessoDisco === 'no' && <div className="connection-detail-form"><AccessoDisco tema="chiaro" /></div>}
          {scelta.collegato && <div className="connection-detail-actions">
            {!MOTORI.includes(scelta.id) && scelta.id !== 'whatsapp' && <button className="connections-button" disabled={!!fonteInLettura} onClick={() => leggi(scelta.id)}>{fonteInLettura === scelta.id ? t('leggo…') : t('Rileggi')}</button>}
            {scelta.id === 'compatibile' && <button className="connections-button" aria-expanded={modifica} onClick={() => setModifica(!modifica)}>{t('Cambia')}</button>}
            <BottoneSicuro titolo={t('Scollega')} guaio={m => setGuaio(t(m))} fai={async () => { await api.scollega(scelta.id); await ricarica(); cambiato() }}>{t('Scollega')}</BottoneSicuro>
          </div>}
          {!scelta.collegato && subito.includes(scelta.id) && <div className="connection-quick">
            <p>{scelta.id === 'desktop' ? t('Scrivania, Documenti e Download in sola lettura') : t('la chiave di Claude che è già qui')}</p>
            <button className="connections-button connect" onClick={() => collegaSubito(scelta.id)} disabled={collegando}>{collegando ? t('Collego…') : t('Consenti')}</button>
          </div>}
          {(!scelta.collegato || (scelta.id === 'compatibile' && modifica)) && <div className="connection-detail-form"><Form id={scelta.id} tema="chiaro" ok={async () => {
            await ricarica(); setModifica(false); cambiato()
            if (!MOTORI.includes(scelta.id)) void leggi(scelta.id)
          }} /></div>}
        </div>}
      </div>
    </div>
  </>
}
