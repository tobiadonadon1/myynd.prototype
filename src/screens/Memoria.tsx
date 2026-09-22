// Quello che Myynd sa di te — e che devi poter correggere.
//
// Il server questa roba la teneva da sempre: cinque blocchi da riempire, le
// convinzioni con il loro genere e la loro fiducia, la storia di quelle che non
// valgono più. Quattro rotte, funzionanti, con zero chiamanti. Nessuno poteva
// vedere niente di tutto questo, e i cinque blocchi — «come decido», «cosa
// controllo», «come scrivo» — restavano vuoti per sempre perché non c'era
// nessun posto dove scriverli.
//
// Il commento sulla rotta, nel server, spiegava già perché è un problema:
// «un gemello che tiene convinzioni su di te che non puoi vedere né correggere
// non è uno strumento, e nessuno gli consegna la propria posta».
//
// Due scelte di questa schermata, che vengono da lì:
//
//   · il genere di ogni convinzione si vede. Esplicita vuol dire «me l'hai
//     detto», indotta vuol dire «l'ho notato io»: sono cose diversissime e
//     confonderle è il modo in cui un assistente comincia a inventarti.
//   · niente si cancella davvero: quello che non vale più prende una data di
//     fine e scende in fondo, dove si può ancora leggere.
//
// La forma, dal 21 settembre 2026. Era una colonna di elenchi dentro tre
// riquadroni, e la sua frase era «especially the memory. It's difficult».
// Adesso ogni cosa è una scheda della stessa griglia: i progetti, le cinque
// domande su come lavori, le convinzioni. Una scheda si legge da lontano, si
// corregge dove è scritta, e quello che si tocca una volta al mese sta in una
// finestra che si apre cliccandola.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api, type Blocco, type CambioProgetto, type Compito, type Convinzione, type DocumentoProdotto, type Memoria as Dati, type Progetto
} from '../api'
import { frasi, t, loc } from '../lingua'
import { DOMANDE } from '../data'
import { Cestino, useAttiva, useFocoDialogo } from '../ui'
import { IconGiu } from '../icons'
import { Glifo } from '../components/Stato'
import { ascoltaProgetto, dimenticaProgetto, progettoAtteso } from '../vals'
import { ProgettoEditor, SchedaProgetto, Tic } from './ProgettoEditor'
import './memoria.css'

/** Quanto pesa una convinzione, detto a parole invece che con un numero. */
function quanto(f: number): string {
  return f >= 0.8 ? t('certo') : f >= 0.5 ? t('probabile') : t('da confermare')
}

/** Da dove viene: esplicita è tua, indotta è sua. Non è la stessa cosa. */
const COLORE_GENERE: Record<string, { testo: string; fondo: string }> = {
  esplicita: { testo: 'var(--verde-cupo)', fondo: 'rgba(var(--salvia-rgb),.18)' },
  dedotta: { testo: 'var(--rame-testo)', fondo: 'rgba(var(--rame-rgb),.2)' },
  indotta: { testo: 'var(--rame-testo)', fondo: 'rgba(var(--rame-rgb),.14)' }
}

function Etichetta({ genere }: { genere: string }) {
  const c = COLORE_GENERE[genere] ?? COLORE_GENERE.indotta
  return <span className="mem-genere" style={{ color: c.testo, background: c.fondo }}>{t(genere)}</span>
}

/** Il titolo di una sezione: la parola, il conto, e al massimo un'azione. */
function Testata({ titolo, conto, stato, children }: {
  titolo: string
  conto?: string
  /** Una riga che dice come sta la sezione adesso. Mai una che spieghi. */
  stato?: string
  children?: React.ReactNode
}) {
  return (
    <div className="mem-section-head">
      <h2>{titolo}</h2>
      {conto !== undefined && <span className="mem-conta">{conto}</span>}
      {stato && <span className="mem-stato">{stato}</span>}
      {children}
    </div>
  )
}

/**
 * Una scheda di «come lavori»: una domanda su di te, e la tua risposta.
 *
 * Il tetto di caratteri non è una scortesia: è quello che costringe a
 * consolidare invece di accumulare. Un ritratto che cresce senza limite smette
 * di essere un ritratto e diventa un archivio, e il modello lo legge come
 * rumore. Il contatore compare solo quando manca poco, e si accende in rame
 * prima del limite, non dopo.
 *
 * Non c'è nessun bottone «Salva»: si salva lasciando il campo, o con ⌘Invio,
 * e una spunta piccola lo dice — la stessa regola dell'editor di un progetto.
 */
function Campo({ b, salvato }: { b: Blocco; salvato: () => void }) {
  const [testo, setTesto] = useState(b.valore)
  const [fatto, setFatto] = useState(false)
  const [riordino, setRiordino] = useState(false)
  /** Com'era prima che la riordinasse: senza, «riordina» è un gesto senza ritorno. */
  const [prima, setPrima] = useState<string | null>(null)
  const orologio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { setTesto(b.valore); setPrima(null) }, [b.valore])
  useEffect(() => () => clearTimeout(orologio.current), [])

  const riordina = async () => {
    const grezzo = testo.trim()
    if (!grezzo) return
    setRiordino(true)
    try {
      const r = await api.riscriviBlocco(b.etichetta, grezzo)
      if (r.testo && r.testo !== grezzo) { setPrima(grezzo); setTesto(r.testo) }
    } catch { /* resta quello che avevi scritto: è già la cosa giusta */ }
    setRiordino(false)
  }

  const cambiato = testo.trim() !== b.valore.trim()
  const resta = b.tetto - testo.length

  const salva = async () => {
    if (!cambiato) return
    try {
      await api.scriviBlocco(b.etichetta, testo.slice(0, b.tetto))
      setFatto(true)
      clearTimeout(orologio.current)
      orologio.current = setTimeout(() => setFatto(false), 2400)
      salvato()
    } catch { /* il valore vero lo dirà il ricarico */ }
  }

  return (
    <details className="mem-profile-field">
      <summary>
        <span className="mem-disclosure"><IconGiu size={13} stroke="currentColor" /></span>
        <span className="mem-profile-heading">
          <strong>{t(DOMANDE[b.etichetta]?.domanda ?? b.descrizione)}</strong>
          {!!testo.trim() && <span>{testo}</span>}
        </span>
        <Tic mostra={fatto} />
      </summary>
      <div className="mem-profile-body">
        {b.daMe && !cambiato && (
          <div className="mem-stato">
            {frasi.scrittoDaMe(new Date(b.daMe).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }))}
          </div>
        )}
        <textarea
          className="mem-campo"
          value={testo}
          onChange={e => setTesto(e.target.value.slice(0, b.tetto))}
          onBlur={salva}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) salva() }}
          placeholder={t(DOMANDE[b.etichetta]?.esempio ?? 'Non gliel’hai ancora detto.')}
          aria-label={t(DOMANDE[b.etichetta]?.domanda ?? b.descrizione)}
          rows={testo.length > 140 ? 4 : 3} />
        <div className="mem-card-piede nudo">
          <span className="mem-conto">
            {resta < 120 ? <span style={{ color: resta < 60 ? 'var(--rame-testo)' : undefined }}>{resta} {t('caratteri rimasti')}</span> : ''}
          </span>
          {prima !== null && (
            <button type="button" className="mem-quieto" onClick={() => { setTesto(prima); setPrima(null) }}>
              {t('Rimetti com’era')}
            </button>
          )}
          {!!testo.trim() && (
            <button type="button" className="mem-pill" onClick={riordina} disabled={riordino}>
              <Glifo tipo="penso" dim={11} colore="var(--rame-testo)" />
              {riordino ? t('Riordino…') : t('Riordina')}
            </button>
          )}
        </div>
      </div>
    </details>
  )
}

/** Lo scaffale delle consegne: resta leggibile anche se il file è stato spostato. */
function DocumentiProdotti({ documenti }: { documenti: DocumentoProdotto[] }) {
  const [apro, setApro] = useState('')
  const [guaio, setGuaio] = useState('')
  const apri = async (d: DocumentoProdotto) => {
    if (!d.disponibile || apro) return
    setApro(d.id); setGuaio('')
    try { await api.portami(d.id) }
    catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    finally { setApro('') }
  }
  return (
    <section className="mem-section">
      <Testata titolo={t('Documenti creati')} conto={String(documenti.length)} />
      <div className="mem-card mem-documents-card">
        {documenti.map(d => (
          <div key={d.id} className="mem-document-row" data-missing={!d.disponibile ? '' : undefined}
            role={d.disponibile ? 'button' : undefined} tabIndex={d.disponibile ? 0 : undefined}
            onDoubleClick={() => apri(d)}
            onKeyDown={e => { if (d.disponibile && e.key === 'Enter') void apri(d) }}>
            <div className="mem-document-main">
              <strong>{d.titolo}</strong>
              <span>{[d.progetto, new Date(d.aggiornato).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="mem-document-status">
              {!d.disponibile ? t('Non più rintracciabile') : apro === d.id ? t('Apro…') : t('Doppio clic per aprire')}
            </span>
          </div>
        ))}
        {!documenti.length && <div className="mem-vuoto">{t('Nessun documento creato finora.')}</div>}
        {guaio && <div role="status" className="mem-guaio">{t(guaio)}</div>}
      </div>
    </section>
  )
}

/**
 * Una convinzione che aspetta.
 *
 * *Indotta* vuol dire che nessuno gliel'ha detta: l'ha notata lui, da una
 * regolarità. Quelle non pesano su nessuna bozza finché una persona non le
 * guarda — è la regola scritta in `server/memoria.ts` — e questa schermata è
 * il posto dove si guardano. Si tengono con un dito, o si buttano con quello
 * che c'era già.
 */
const inAttesa = (c: Convinzione) => c.genere === 'indotta' && !c.confermata

function SchedaConvinzione({ c, scorda, tieni, storica }:
  { c: Convinzione; scorda?: (id: string) => void; tieni?: (id: string) => void; storica?: boolean }) {
  const { attiva, props } = useAttiva()
  const [aperta, setAperta] = useState(false)
  const haProva = !!(c.prova?.citazione || c.premesse?.length)
  const aspetta = inAttesa(c) && !storica

  return (
    <div {...props} className="mem-card mem-convinzione" data-storica={storica ? '' : undefined}>
      <div className="mem-enunciato">{c.enunciato}</div>
      <div className="mem-meta">
        <Etichetta genere={c.genere} />
        {aspetta && <span style={{ color: 'var(--rame-testo)' }}>{t('non la sto usando')}</span>}
        <span>{quanto(c.fiducia)}</span>
        {c.ambito !== 'persona' && (
          // «cliente:Nick» è come sta scritto nel database, non come si legge
          <span>{c.ambito === 'azienda' ? t('azienda') : c.ambito.replace(/^(?:cliente|progetto):/, '')}</span>
        )}
        <span>{t('da')} {t(c.origine)}</span>
        {storica && c.al && (
          <span>{t('fino al')} {new Date(c.al).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        )}
        {haProva && (
          <button type="button" className="mem-perche" onClick={() => setAperta(a => !a)} aria-expanded={aperta}>
            {t('perché')}
            <span style={{ display: 'flex', transform: aperta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <IconGiu size={9} stroke="currentColor" />
            </span>
          </button>
        )}
      </div>

      {/* «tienila» non chiede conferma: è il gesto leggero dei due, e si può sempre scordare dopo */}
      {aspetta && tieni && (
        <button type="button" className="mem-tieni" onClick={() => tieni(c.id)}>{t('Tienila')}</button>
      )}
      {/* scordare chiede una volta: è la sua testa, ma è una cosa che non torna */}
      {scorda && (
        <span className="mem-card-gesti">
          <Cestino fai={() => scorda(c.id)} titolo={t('Scordala')} visibile={attiva} />
        </span>
      )}

      {aperta && (
        <div className="mem-prova">
          {c.prova?.citazione && <div style={{ fontStyle: 'italic' }}>«{c.prova.citazione}»</div>}
          {c.premesse?.length ? (
            <div style={{ marginTop: c.prova?.citazione ? 7 : 0 }}>
              <div className="mem-dedotta">{t('dedotta da')}</div>
              {c.premesse.map((p, i) => <div key={i}>— {p}</div>)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * La finestra di un progetto: gli altri nomi, dove sta dentro, le note, quello
 * che Myynd ricorda, le attività, unire.
 *
 * Una finestra e non un pannello che si apre sotto la scheda: in una griglia
 * un pannello che cresce sposta tutte le schede della riga, e quello che si
 * stava guardando finisce da un'altra parte. Esc chiude, il fuoco torna alla
 * scheda da cui si è partiti.
 */
function FinestraProgetto({ p, tutti, cambia, unisci, chiudi }: {
  p: Progetto
  tutti: Progetto[]
  cambia: (id: string, c: CambioProgetto) => Promise<void>
  unisci: (id: string, dentro: string) => Promise<void>
  chiudi: () => void
}) {
  const finestra = useRef<HTMLDivElement>(null)
  useFocoDialogo(finestra, chiudi)
  return (
    <>
      <div className="mem-velo" onClick={chiudi} />
      <div ref={finestra} className="mem-finestra" role="dialog" aria-modal="true" aria-label={p.nome}>
        <div className="mem-finestra-cima">
          <strong>{p.nome}</strong>
          {p.obiettivo && <span className="mem-obiettivo">{p.obiettivo}</span>}
          <button type="button" className="mem-chiudi" onClick={chiudi}>{t('Chiudi')}</button>
        </div>
        <div className="mem-finestra-corpo">
          <ProgettoEditor p={p} tutti={tutti} cambia={cambia} unisci={unisci} />
        </div>
      </div>
    </>
  )
}

/**
 * I progetti: su cosa lavora, e a cosa punta ciascuno.
 *
 * Stanno in cima alla Memoria, prima dei blocchi, perché sono la cosa che il
 * feed, la rassegna e il punto leggono *prima* di scegliere: un obiettivo
 * scritto in una riga vale più di trenta documenti.
 */
function Progetti({ dimmi }: { dimmi: (attivi: number) => void }) {
  const [progetti, setProgetti] = useState<Progetto[] | null>(null)
  /** Quale scheda ha la finestra aperta: una sola. */
  const [aperto, setAperto] = useState<string | null>(null)
  /**
   * La scheda da portare sotto gli occhi, e quella accesa.
   *
   * Il biglietto lo lascia la prima pagina («Da il progetto H-Farm») e qui si
   * legge quando la schermata si monta, o mentre è già aperta. Si strappa solo
   * quando la scheda esiste davvero: prima dei progetti caricati non c'è niente
   * su cui scorrere, e strapparlo lì vorrebbe dire arrivare in Memoria senza
   * sapere quale progetto si era chiesto.
   */
  const [daMostrare, setDaMostrare] = useState<string | null>(progettoAtteso)
  const [acceso, setAcceso] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [obiettivo, setObiettivo] = useState('')
  const [guaio, setGuaio] = useState('')
  const [nasce, setNasce] = useState(false)
  /** L'ultimo nato: la sua scheda prende il fuoco con il nome selezionato. */
  const [nato, setNato] = useState<string | null>(null)
  /**
   * Quante attività ha ciascuno.
   *
   * Una chiamata sola per tutta la lista, non una per scheda: il conto è una
   * cosa che si legge di sfuggita, e non vale otto richieste. Se non arriva,
   * la scheda semplicemente non lo dice.
   */
  const [conti, setConti] = useState<Record<string, { aperte: number; fatte: number }>>({})

  const carica = useCallback(async () => {
    try { setProgetti((await api.progetti()).progetti) } catch { /* la pagina resta com'è */ }
    try {
      const l = await api.compiti()
      const m: Record<string, { aperte: number; fatte: number }> = {}
      const conta = (c: Compito, quale: 'aperte' | 'fatte') => {
        if (!c.progetto) return
        const r = (m[c.progetto] ??= { aperte: 0, fatte: 0 })
        r[quale]++
      }
      for (const c of l.compiti) if (c.stato !== 'fatto' && c.stato !== 'lasciato') conta(c, 'aperte')
      for (const c of l.chiusi) if (c.stato === 'fatto') conta(c, 'fatte')
      setConti(m)
    } catch { /* la scheda non dice il conto, e basta */ }
  }, [])
  useEffect(() => { carica() }, [carica])
  useEffect(() => ascoltaProgetto(() => setDaMostrare(progettoAtteso())), [])
  useEffect(() => { dimmi((progetti ?? []).filter(p => p.stato === 'attivo').length) }, [progetti, dimmi])
  useEffect(() => {
    if (!daMostrare || !progetti?.length) return
    const scheda = document.getElementById(`progetto-${daMostrare}`)
    if (!scheda) return
    scheda.scrollIntoView({ block: 'center' })
    dimenticaProgetto()
    // chi arriva qui da una carta della prima pagina è venuto per *questo*
    // progetto: trovarlo chiuso come tutti gli altri sarebbe arrivare a metà
    setAperto(daMostrare)
    setDaMostrare(null)
    setAcceso(daMostrare)
    // un secondo e mezzo: il tempo di vedere quale scheda, non di doverla spegnere
    const via = setTimeout(() => setAcceso(null), 1500)
    return () => clearTimeout(via)
  }, [daMostrare, progetti])

  /**
   * Cambia, e lascia passare il guaio.
   *
   * L'eccezione non si mangia qui: la scheda la prende e la scrive sotto al
   * campo che l'ha causata. «Esiste già un progetto con questo nome» sotto la
   * casella del nome è una risposta; la stessa riga in fondo alla schermata è
   * un enigma.
   */
  const cambia = async (id: string, c: CambioProgetto) => {
    // subito nella pagina, poi al server: se non passa, il ricarico dice il vero
    setProgetti(ps => ps ? ps.map(p => p.id === id ? { ...p, ...c } : p) : ps)
    try { await api.cambiaProgetto(id, c) } finally { await carica() }
  }

  /** Due progetti che erano lo stesso: resta aperto quello in cui sono confluiti. */
  const unisci = async (id: string, dentro: string) => {
    try { await api.unisciProgetto(id, dentro) } finally { await carica() }
    setAperto(dentro)
  }

  const elimina = async (id: string) => {
    try { await api.eliminaProgetto(id) } finally { await carica() }
    setAperto(a => (a === id ? null : a))
  }

  const aggiungi = async () => {
    const n = nome.trim()
    if (!n || nasce) return
    setNasce(true)
    try {
      const r = await api.nuovoProgetto(n, obiettivo.trim())
      setNome(''); setObiettivo(''); setGuaio('')
      await carica()
      // appena nato, il fuoco va sulla sua scheda con il nome già selezionato:
      // è lì che si correggono il nome, l'obiettivo, lo stato e il colore, e
      // mandarlo altrove vorrebbe dire fargli cercare le stesse cose due volte
      setNato(r.progetto.id)
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    finally { setNasce(false) }
  }

  const inFinestra = progetti?.find(x => x.id === aperto) ?? null

  return (
    <section className="mem-section">
      <Testata titolo={t('Progetti')} conto={progetti ? String(progetti.length) : undefined} />

      <div className="mem-grid">
        {(progetti ?? []).map(p => (
          <SchedaProgetto key={p.id} p={p} tutti={progetti ?? []} cambia={cambia} elimina={elimina}
            apri={() => setAperto(p.id)} acceso={acceso === p.id} conto={conti[p.id]} nato={nato === p.id} />
        ))}

        {/*
          La scheda che non c'è ancora.

          Due caselle, non undici: un progetto nasce da un nome e da dove punta,
          e il colore, gli altri nomi e il progetto padre si scrivono dopo,
          aprendolo. Sta nella griglia con le altre e non in cima alla pagina:
          è una scheda in più, non un modulo.
        */}
        <div className="mem-card mem-nuovo">
          <span className="mem-etichetta">{t('Nuovo progetto')}</span>
          <input value={nome} onChange={e => setNome(e.target.value)} className="mem-campo"
            onKeyDown={e => { if (e.key === 'Enter') aggiungi() }}
            placeholder={t('Il nome del progetto')} aria-label={t('Il nome del progetto')} />
          <input value={obiettivo} onChange={e => setObiettivo(e.target.value.slice(0, 200))} className="mem-campo"
            onKeyDown={e => { if (e.key === 'Enter') aggiungi() }}
            placeholder={t('A cosa punta, in una riga')} aria-label={t('Obiettivo')} />
          {!!nome.trim() && (
            <div className="mem-nuovo-piede">
              <button type="button" className="mem-pieno" onClick={aggiungi} disabled={nasce}>
                {nasce ? t('Aggiungo…') : t('Aggiungi')}
              </button>
            </div>
          )}
          {guaio && <div role="alert" className="mem-guaio">{t(guaio)}</div>}
        </div>
      </div>

      {/* la confusione era proprio questa: un progetto senza un compito in corso
          non è finito. Una riga sola, in fondo, per tutte le schede */}
      <div className="mem-stato" style={{ margin: '11px 4px 0' }}>
        {t('Un progetto senza attività resta attivo: chiudilo solo quando è finito.')}
      </div>

      {inFinestra && (
        <FinestraProgetto p={inFinestra} tutti={progetti ?? []} cambia={cambia} unisci={unisci}
          chiudi={() => setAperto(null)} />
      )}
    </section>
  )
}

export function Memoria() {
  const [d, setD] = useState<Dati | null>(null)
  const [guasto, setGuasto] = useState('')
  const [storicheAperte, setStoricheAperte] = useState(false)
  const [nuova, setNuova] = useState('')
  const [ordino, setOrdino] = useState(false)
  const [dettoRitratto, setDettoRitratto] = useState('')
  const [attivi, setAttivi] = useState(0)
  const contaProgetti = useCallback((n: number) => setAttivi(n), [])

  const carica = useCallback(async () => {
    try { setD(await api.memoria()); setGuasto('') }
    catch (e) { setGuasto(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { carica() }, [carica])

  /**
   * Rimette in ordine adesso quello che ha imparato.
   *
   * Dire quanti blocchi ha toccato, e dire anche quando non ne ha toccato
   * nessuno: «non c'è niente di nuovo» è una risposta, e senza quella riga un
   * bottone che non fa niente sembra rotto.
   */
  const consolida = async () => {
    setOrdino(true); setDettoRitratto('')
    try {
      const r = await api.consolidaMemoria()
      await carica()
      setDettoRitratto(r.blocchi.length
        ? frasi.ritrattoAggiornato(r.blocchi.length, r.guardate)
        : t('Non c’è niente di nuovo da aggiungere.'))
    } catch { setDettoRitratto(t('Non ce l’ha fatta.')) }
    setOrdino(false)
  }

  /**
   * Quello che ha imparato, nella lingua che stai leggendo.
   *
   * Le convinzioni nascono nella lingua in cui gliele hai dette, e la
   * traduzione finora partiva solo *cambiando* lingua. Chi ha l'app in
   * inglese da sempre non ha mai cambiato niente: apriva questa pagina e
   * trovava sette righe in italiano, cioè l'unico posto dell'app rimasto
   * nella lingua sbagliata — e per giunta quello che gli chiede di fidarsi.
   *
   * Parte da sé, una volta sola, e solo quando serve davvero: è un lavoro da
   * modello piccolo, quindi su una macchina con Ollama non costa niente.
   */
  const [traduco, setTraduco] = useState(false)
  const giaFatto = useRef(false)
  useEffect(() => {
    if (!d?.daTradurre || giaFatto.current) return
    giaFatto.current = true
    setTraduco(true)
    api.traduciMemoria().then(carica).catch(() => {}).finally(() => setTraduco(false))
  }, [d?.daTradurre, carica])

  const scorda = async (id: string) => {
    // sparisce subito: è la sua testa, e toglierci una cosa non deve far aspettare
    setD(v => (v ? { ...v, convinzioni: v.convinzioni.filter(c => c.id !== id) } : v))
    try { await api.scordaConvinzione(id) } finally { carica() }
  }

  const tieni = async (id: string) => {
    const quando = new Date().toISOString()
    setD(v => (v ? { ...v, convinzioni: v.convinzioni.map(c => c.id === id ? { ...c, confermata: quando } : c) } : v))
    try { await api.confermaConvinzione(id) } finally { carica() }
  }

  /** Prima quelle che aspettano una risposta, poi il resto nell'ordine di prima. */
  const ordinate = (d?.convinzioni ?? []).slice().sort((a, b) => Number(inAttesa(b)) - Number(inAttesa(a)))
  const quanteInAttesa = ordinate.filter(inAttesa).length

  const aggiungi = async () => {
    const testo = nuova.trim()
    if (!testo) return
    setNuova('')
    try { await api.scriviConvinzione(testo) } finally { carica() }
  }

  if (guasto) {
    return (
      <main className="mem-page">
        <header className="mem-header"><h1>{t('Memoria')}</h1></header>
        <div className="mem-guaio" style={{ padding: '0 4px' }}>{t(guasto)}</div>
      </main>
    )
  }

  const imparate = d?.convinzioni.length ?? 0

  return (
    <main className="mem-page">
      <header className="mem-header">
        <h1>{t('Memoria')}</h1>
        <p>
          {attivi} {attivi === 1 ? t('progetto attivo') : t('progetti attivi')}
          {' · '}
          {imparate} {imparate === 1 ? t('cosa imparata') : t('cose imparate')}
        </p>
      </header>

      {/* — i progetti: prima di tutto, perché sono la prima cosa che legge — */}
      <Progetti dimmi={contaProgetti} />

      {/* — le cinque domande su come lavori — */}
      <section className="mem-section">
        <Testata titolo={t('Come lavori')} stato={dettoRitratto || undefined}>
          {/*
            Gira già da solo ogni sei ore. Questo sta qui per il momento in cui
            uno finisce una conversazione lunga e vuole *vedere* cosa ne è
            uscito, invece di scoprirlo domani per caso.
          */}
          <button type="button" className="mem-azione" onClick={consolida} disabled={ordino}>
            {ordino ? t('Ci penso…') : t('Aggiorna da quello che hai imparato')}
          </button>
        </Testata>
        <div className="mem-card mem-profile-card">
          {(d?.blocchi ?? []).map(b => <Campo key={b.etichetta} b={b} salvato={carica} />)}
          {!d && <div className="mem-vuoto">{t('carico…')}</div>}
        </div>
      </section>

      {d && <DocumentiProdotti documenti={d.documenti} />}

      {/* — quello che ha capito da solo — */}
      <section className="mem-section">
        <Testata titolo={t('Quello che ha capito')} conto={String(imparate)}
          stato={traduco ? t('Le rimetto nella tua lingua…') : quanteInAttesa ? frasi.inAttesa(quanteInAttesa) : undefined} />

        {/* scriverne una a mano: è la sua testa, deve poterci mettere le mani */}
        <div className="mem-aggiungi">
          <input className="mem-campo" value={nuova} onChange={e => setNuova(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') aggiungi() }}
            aria-label={t('Aggiungine una tu: «non faccio sconti sotto i mille euro»')}
            placeholder={t('Aggiungine una tu: «non faccio sconti sotto i mille euro»')} />
          <button type="button" className="mem-pieno" onClick={aggiungi} disabled={!nuova.trim()}>{t('Aggiungi')}</button>
        </div>

        <div className="mem-grid fitta">
          {ordinate.map(c => <SchedaConvinzione key={c.id} c={c} scorda={scorda} tieni={tieni} />)}
          {d && !d.convinzioni.length && (
            <div className="mem-vuoto">{t('Ancora niente. Impara parlandoti, e da quello che correggi delle sue bozze.')}</div>
          )}
        </div>
      </section>

      {/* — quello che pensava prima — */}
      {!!d?.storiche.length && (
        <section className="mem-section">
          <div className="mem-section-head">
            <button type="button" className="mem-piega" onClick={() => setStoricheAperte(v => !v)} aria-expanded={storicheAperte}>
              <span className="freccia" style={{ transform: storicheAperte ? 'none' : 'rotate(-90deg)' }}>
                <IconGiu size={10} stroke="currentColor" />
              </span>
              <h2 style={{ flex: 1 }}>{t('Quello che pensava prima')}</h2>
              <span className="mem-conta">{d.storiche.length}</span>
            </button>
          </div>
          {storicheAperte && (
            <div className="mem-grid fitta">
              {d.storiche.map(c => <SchedaConvinzione key={c.id} c={c} storica />)}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
