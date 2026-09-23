import { useEffect, useRef, useState } from 'react'
import { api, letturaDesktop, rigaSincronizzazione, type LetturaDesktop, type Stato } from '../api'
import { moduloDaFinire } from '../collegamenti'
import { AccessoDisco, Form } from './forms'
import { frasi, loc, t } from '../lingua'
import { BottoneSicuro, useFocoDialogo } from '../ui'
import { ConnectorIcon, ConnectorTile } from './ConnectorIcon'
import { avanzaLettura, chiudiLettura, iniziaLettura, leggiAlProprioTurno, type RigaLettura } from '../lettura-fonti'
import './connessioni.css'

// Quelli che non portano documenti: niente «Rileggi», perché non c'è niente da rileggere.
const MOTORI = ['claude', 'openai', 'compatibile']

/**
 * Le fonti che si possono cambiare senza scollegarle prima.
 *
 * Per il computer non è un vezzo: scollegare e ricollegare vuol dire buttare
 * l'indice di quei documenti e rifarlo da capo, per cambiare tre cartelle. E
 * senza un «Cambia» l'unica strada per passare da tre cartelle a tutto il Mac
 * era proprio quella — cioè nessuna, per chi non se la sente.
 */
// Anthropic e OpenAI hanno due strade: «Cambia» riapre la scheda per scegliere l'altra, o cambiare chiave
const CAMBIABILI = ['compatibile', 'claude', 'openai', 'desktop']

/** A quiet source picker; credentials and account controls appear only after choosing. */
export function Connessioni({ fonte, chiudi, stato: s, rileggi: ricarica }: {
  /**
   * Lo stato è quello dell'app, e lo rilegge l'app: prima il pannello ne
   * teneva una copia sua, riletta per conto suo, e per ogni collegamento
   * `/api/stato` partiva quattro volte — due qui, due fuori — con due verità
   * che potevano non coincidere per un attimo.
   */
  fonte?: string; chiudi: () => void; stato: Stato; rileggi: () => Promise<Stato>
}) {
  const [soloQuesta, setSoloQuesta] = useState(fonte || '')
  const [modifica, setModifica] = useState(false)
  /*
   * Il modulo resta aperto finché non ha finito lui.
   *
   * Lo stato del pannello adesso si rilegge appena un collegamento cambia, non
   * quando il modulo chiama `ok()`. Ma un modulo può avere ancora qualcosa da
   * dire dopo aver collegato — «la chiave è salvata, ma il conto non ha
   * credito» — e sparirebbe sotto le dita nel momento in cui l'intestazione
   * diventa «Collegato». Si tiene aperto fino al suo `ok()`, o finché non si
   * torna indietro — e si chiude pulito se la fonte si scollega: vedi
   * `moduloDaFinire`.
   */
  const [daFinire, setDaFinire] = useState(false)
  const [fonteInLettura, setFonteInLettura] = useState<string | null>(null)
  const [avanzamento, setAvanzamento] = useState<string | null>(null)
  const [guaio, setGuaio] = useState<string | null>(null)
  /*
   * Come è andata l'ultima lettura del computer, finché la scheda è aperta.
   *
   * Il collegamento sa dire quanti documenti ha; non sa dire quanti file ha
   * *visto e lasciato fuori*, né quante cartelle si sono chiuse in faccia — e
   * sono le due cose che spiegano un numero più basso di quello che una
   * persona si aspetta. Arrivano in fondo alla lettura, e restano qui: sono i
   * conti di quel giro, non una proprietà del collegamento.
   */
  const [letturaDesk, setLetturaDesk] = useState<LetturaDesktop | null>(null)
  /** Una riga per fonte, quando si leggono tutte insieme: dopo un collegamento, fino alla chiusura. */
  const [righe, setRighe] = useState<RigaLettura[] | null>(null)
  const [subito, setSubito] = useState<string[]>([])
  const [collegando, setCollegando] = useState(false)
  const finestra = useRef<HTMLDivElement>(null)
  const indietro = useRef<HTMLButtonElement>(null)
  const ultimo = useRef(fonte || '')
  /** Una lettura alla volta: lo stato arriva tardi dentro una chiusura, questo no. */
  const leggendo = useRef(false)
  /** Una fonte collegata mentre si leggeva le altre: si rilegge ancora, appena finito. */
  const ancora = useRef(false)
  useFocoDialogo(finestra, chiudi)

  const carica = () => {
    setGuaio(null)
    void ricarica().catch(e => setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a rileggere questa fonte.')))
  }
  useEffect(() => { carica() }, [])
  // conta solo se Claude è collegato: lo stato arriva nuovo a ogni lettura, e
  // chiedere la chiave nell'ambiente a ognuna era una domanda in più per niente
  const claudeCollegato = !!s?.connettori.find(c => c.id === 'claude')?.collegato
  useEffect(() => {
    // il computer non ha più la via rapida: il suo modulo ha un bottone solo, che fa la stessa cosa
    const puoi: string[] = []
    let attuale = true
    api.chiaveNellAmbiente().then(r => {
      if (!attuale) return
      setSubito(r.presente && !claudeCollegato ? [...puoi, 'claude'] : puoi)
    }).catch(() => { if (attuale) setSubito(puoi) })
    return () => { attuale = false }
  }, [claudeCollegato])

  const leggi = async (id: string) => {
    if (leggendo.current) return
    leggendo.current = true
    setFonteInLettura(id); setAvanzamento(null); setGuaio(null)
    try {
      await api.sincronizza(m => {
        if (m.fase !== 'fine') setAvanzamento(rigaSincronizzazione(m))
        const fine = letturaDesktop(m)
        if (fine) setLetturaDesk(fine)
      }, id)
      await ricarica()
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a rileggere questa fonte.')) }
    leggendo.current = false
    setFonteInLettura(null); setAvanzamento(null)
  }
  /**
   * Collegata una fonte, si leggono tutte, e non solo quella.
   *
   * Prima un collegamento leggeva la fonte appena collegata e basta: chi
   * collegava il Mac, poi l'agenda, poi Notion, si trovava tre letture
   * separate, e ognuna diceva solo di sé. La prima persona di fuori si
   * aspettava di collegare tutto e vedere Myynd leggere tutto insieme. È la
   * stessa lettura di «Rileggi tutto»: incrementale, e una fonte che non
   * risponde non ferma le altre. Se ne arriva un'altra mentre si legge, si
   * rilegge appena finito, invece di lasciarla ai prossimi dieci minuti.
   */
  const leggiTutte = async () => {
    if (leggendo.current) { ancora.current = true; return }
    leggendo.current = true
    setFonteInLettura('*'); setAvanzamento(null); setGuaio(null)
    try {
      do {
        ancora.current = false
        const prima = await ricarica()
        let r = iniziaLettura(prima.connettori.filter(c => c.collegato && !MOTORI.includes(c.id) && c.id !== 'mind2do').map(c => c.id))
        const mostra = (nuove: RigaLettura[]) => { r = nuove; setRighe(nuove) }
        mostra(r)
        try {
          await leggiAlProprioTurno(() => api.sincronizza(m => {
            mostra(avanzaLettura(r, m))
            const fine = letturaDesktop(m)
            if (fine) setLetturaDesk(fine)
          }))
          const dopo = await ricarica()
          mostra(chiudiLettura(r, id => dopo.connettori.find(c => c.id === id)?.documenti))
        } catch (e) {
          const detto = e instanceof Error ? t(e.message) : t('Non sono riuscito a rileggere questa fonte.')
          mostra(r.map(x => x.stato === 'attesa' || x.stato === 'leggo' ? { ...x, stato: 'guaio', testo: detto } : x))
        }
      } while (ancora.current)
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a rileggere questa fonte.')) }
    finally { leggendo.current = false; setFonteInLettura(null) }
  }
  const collegaSubito = async (id: string) => {
    if (collegando) return
    setCollegando(true); setGuaio(null)
    try {
      if (id === 'claude') await api.usaChiaveAmbiente()
      else return
      // qui non c'è un modulo che debba finire di parlare: si chiude come prima
      await ricarica(); setDaFinire(false)
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a collegare.')) }
    finally { setCollegando(false) }
  }

  const tutti = s?.connettori.filter(c => (c.pronto || c.collegato) && c.id !== 'mind2do') ?? []
  const scelta = tutti.find(c => c.id === soloQuesta)
  /*
   * Si guarda il cambio mentre si disegna, non dopo.
   *
   * Nel disegno in cui la fonte diventa «Collegato» il modulo deve esserci
   * ancora: un effetto arriverebbe dopo, il modulo sparirebbe per un
   * fotogramma e con lui l'avviso che stava dicendo. È il modo di React di
   * ricordare il disegno di prima: si confronta, e si corregge subito.
   */
  const collegata = scelta?.collegato
  const [visto, setVisto] = useState({ id: soloQuesta, collegata })
  if (visto.id !== soloQuesta || visto.collegata !== collegata) {
    setVisto({ id: soloQuesta, collegata })
    if (visto.id === soloQuesta) {
      const eraAperto = !visto.collegata || (CAMBIABILI.includes(soloQuesta) && modifica) || daFinire
      const dopo = moduloDaFinire(daFinire, visto.collegata, collegata, eraAperto)
      if (dopo !== daFinire) setDaFinire(dopo)
    }
  }
  const moduloVisibile = !!scelta && (!scelta.collegato || (CAMBIABILI.includes(scelta.id) && modifica) || daFinire)
  const pronti = tutti
  const dopo = s?.connettori.filter(c => !c.pronto && !c.collegato) ?? []
  const apri = (id: string) => {
    ultimo.current = id; setSoloQuesta(id); setModifica(false); setDaFinire(false)
    requestAnimationFrame(() => indietro.current?.focus())
  }
  const torna = () => {
    setSoloQuesta(''); setModifica(false); setDaFinire(false)
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
        {righe && <ul className="connections-reading" aria-live="polite" aria-label={t('Lettura delle fonti')}>
          {righe.map(r => <li key={r.id} className={`connections-reading-row is-${r.stato}`}>
            <ConnectorIcon id={r.id} size={16} />
            <span className="connections-reading-name">{t(s?.connettori.find(c => c.id === r.id)?.nome ?? r.id)}</span>
            <span className="connections-reading-state">{r.stato === 'attesa' ? t('In coda')
              : r.stato === 'leggo' ? r.testo || t('leggo…')
              : r.stato === 'fatto' ? `✓ ${r.testo}`
              : `${t('Non letta')} · ${r.testo}`}</span>
          </li>)}
        </ul>}
        {!s && !guaio && <p role="status" className="connections-progress">{t('carico…')}</p>}
        {s && !scelta && <>
          {/* Lo stesso taglio della pagina intera: quello che c'è sopra, quello che
              manca sotto. Qui conta ancora di più, perché il pannello si apre per
              collegare qualcosa — e la seconda lista è quella che si è venuti a
              leggere. Vedi `connessioni.css`, «collegate sopra, da collegare sotto». */}
          {([['Collegate', pronti.filter(c => c.collegato), 'collegate'],
             ['Da collegare', pronti.filter(c => !c.collegato), 'da-collegare']] as const).map(([titolo, quali, classe]) => !!quali.length &&
            <section key={classe} className={`connections-group ${classe}`} aria-labelledby={`gruppo-${classe}`}>
              <h3 className="connections-group-heading" id={`gruppo-${classe}`}>{t(titolo)}<span>{quali.length}</span></h3>
              <div className="connector-tiles compact">{quali.map(c => <ConnectorTile key={c.id} id={c.id} nome={c.nome} nota={t(c.nota)} collegata={c.collegato} apri={() => apri(c.id)} />)}</div>
            </section>)}
          {!!dopo.length && <details className="connections-future"><summary>{t('Più avanti')} <span>{dopo.length}</span></summary><div>{dopo.map(c => <span key={c.id} title={t(c.nota)}>{t(c.nome)}</span>)}</div></details>}
        </>}
        {scelta && <div className="connection-detail">
          <div className={`connection-detail-overview ${scelta.collegato ? 'connected' : ''}`}>
            <span className="connector-tile-mark"><ConnectorIcon id={scelta.id} size={30} spenta={!scelta.collegato} /></span>
            <div><span className="connection-detail-status">{scelta.collegato ? t('Collegato') : t('Da collegare')}</span>
              <p>{scelta.collegato
                ? scelta.id === 'compatibile' && s?.config.compatibile
                  ? [s.config.compatibile.nome, s.config.compatibile.modello].filter(Boolean).join(' · ')
                  // le due teste dicono da quale strada passano: l'account, o la chiave
                  : scelta.id === 'claude'
                    ? (s?.config.claude?.via === 'abbonamento' ? t('Con il tuo account, tramite Claude Code') : t('Con la chiave API'))
                  : scelta.id === 'openai'
                    ? (s?.config.motore === 'chatgpt' && s.config.chatgpt?.attivo ? t('Con il tuo account ChatGPT') : [t('Con la chiave API'), s?.config.openai?.modello].filter(Boolean).join(' · '))
                  : [
                    scelta.documenti ? frasi.nDocumenti(scelta.documenti.toLocaleString(loc())) : null,
                    // il computer dice se è la macchina intera, e se la sta guardando
                    // dal vivo. Mac o PC lo dice il nome che manda il server: qui non
                    // si indovina dalla finestra, si legge da quello.
                    scelta.id === 'desktop' && s?.config.desktop?.tutto
                      ? (scelta.nome === 'Il mio PC' ? t('tutto il PC') : t('tutto il Mac'))
                      : null,
                    scelta.id === 'desktop' && s?.vedetta?.attiva ? t('in ascolto') : null,
                    // quello che c'era e non è entrato: è la riga che risponde
                    // a «sul mio Mac ce n'è molti di più», e senza di questa
                    // quel numero basso non ha nessuna spiegazione
                    scelta.id === 'desktop' && letturaDesk?.saltatiPerTipo
                      ? frasi.tipiFuori(letturaDesk.saltati.media, letturaDesk.saltati.codice, letturaDesk.saltati.sistema, letturaDesk.saltati.altro)
                      : null
                  ].filter(Boolean).join(' · ') || t(scelta.nota)
                : t(scelta.nota)}</p>
              {/* «perché lascia fuori così tanti file» è la domanda che segue il
                  numero di sopra: questa riga la chiude, dicendo cos'è un
                  documento per Myynd invece di lasciarlo indovinare. */}
              {scelta.id === 'desktop' && !!letturaDesk?.saltatiPerTipo &&
                <p>{t('Myynd legge i documenti: PDF, Word, Excel, PowerPoint, testo, Markdown, HTML e RTF. Immagini, video, codice e file di sistema non sono documenti.')}</p>}
            </div>
          </div>
          {/* le Note senza il permesso restano a zero: la riga con la strada sta qui, dove si guarda */}
          {scelta.id === 'note' && s?.accessoDisco === 'no' && <div className="connection-detail-form"><AccessoDisco tema="chiaro" /></div>}
          {/* Il computer, dopo una lettura: le cartelle che si sono chiuse in
              faccia sono la prova del permesso mancante, e la prova vale più
              dell'avviso preventivo — questa riga compare quando è successo
              davvero, con il numero di quello che è rimasto fuori. */}
          {scelta.id === 'desktop' && !!letturaDesk?.illeggibili.length && <div className="connection-detail-form">
            <AccessoDisco tema="chiaro"
              testo={frasi.cartelleNonAperte(letturaDesk.illeggibili.length)}
              coda={t('Apri Impostazioni, aggiungi Myynd, poi torna qui.')} />
          </div>}
          {scelta.collegato && <div className="connection-detail-actions">
            {!MOTORI.includes(scelta.id) && scelta.id !== 'whatsapp' && <button className="connections-button" disabled={!!fonteInLettura} onClick={() => leggi(scelta.id)}>{fonteInLettura === scelta.id || (fonteInLettura === '*' && righe?.some(r => r.id === scelta.id && (r.stato === 'attesa' || r.stato === 'leggo'))) ? t('leggo…') : t('Rileggi')}</button>}
            {CAMBIABILI.includes(scelta.id) && <button className="connections-button" aria-expanded={modifica} onClick={() => setModifica(!modifica)}>{t('Cambia')}</button>}
            <BottoneSicuro titolo={t('Scollega')} guaio={m => setGuaio(t(m))} fai={async () => { await api.scollega(scelta.id); await ricarica() }}>{t('Scollega')}</BottoneSicuro>
          </div>}
          {!scelta.collegato && subito.includes(scelta.id) && <div className="connection-quick">
            <p>{t('la chiave di Claude che è già qui')}</p>
            <button className="connections-button connect" onClick={() => collegaSubito(scelta.id)} disabled={collegando}>{collegando ? t('Collego…') : t('Consenti')}</button>
          </div>}
          {moduloVisibile && <div className="connection-detail-form"><Form id={scelta.id} tema="chiaro" ok={async () => {
            await ricarica(); setModifica(false); setDaFinire(false)
            // ogni volta che una fonte viene (ri)collegata si rilegge: prima
            // succedeva solo al primo collegamento, e cambiare le cartelle del
            // computer lasciava in piedi l'indice di quelle vecchie finché non
            // passavano sei ore. E si rileggono tutte, insieme: vedi `leggiTutte`
            if (!MOTORI.includes(scelta.id)) void leggiTutte()
          }} /></div>}
        </div>}
      </div>
    </div>
  </>
}
