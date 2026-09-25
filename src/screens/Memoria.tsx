// Quello che Myynd sa di te, e che devi poter correggere.
//
// «I think the thing that is confusing is the settings and all of the
// memory.» (P5) La Memoria ha adesso la stessa forma delle Preferenze: a
// sinistra quattro sezioni con la loro nota di stato, a destra le schede.
//
//   · Progetti: prima «Le tue parole», la riga che Myynd legge per prima;
//     poi le schede dei progetti, e quella per farne uno nuovo.
//   · Come lavori: le righe contate di P1B, com'erano.
//   · Il tuo ritratto: quello che aspetta di essere guardato, le cinque
//     risposte, quello che sa, quello che pensava prima.
//   · Cosa ha fatto Myynd: i documenti consegnati, un clic per aprirli.
//
// Due scelte vengono da prima e restano: da dove viene una convinzione si
// vede (una parola neutra), e niente si cancella senza dirlo: quello che non
// vale più prende una data di fine e scende in «Prima pensava».

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api, memoriaP5, type Blocco, type CambioProgetto, type Compito, type Convinzione, type DocumentoProdotto,
  type Memoria as Dati, type Progetto, type Sommario
} from '../api'
import { frasi, t, loc } from '../lingua'
import { DOMANDE } from '../data'
import { IconGiu } from '../icons'
import { desktop } from '../desktop'
import { annunciaProgetti, ascoltaProgetti, ascoltaProgetto, dimenticaProgetto, portaAlProgetto, progettoAtteso, type Vals } from '../vals'
import { SchedaProgetto } from './ProgettoEditor'
import { ComeLavori } from './ComeLavori'
import { CosaHaFatto } from './CosaHaFatto'
import { RigaConvinzione, inAttesa } from './RigaConvinzione'
import { Bottone, Campo, Carta, Casella } from '../components/forme'
import { PaginaASezioni, sezioneRicordata } from '../components/PaginaASezioni'
import { sezioneAttesa, sezioneIniziale, sezioniMemoria, type SezioneMem } from '../sezioni.ts'
import './memoria.css'

const detto = (e: unknown) => (e instanceof Error ? t(e.message) : String(e))
const giorno = (iso: string) => new Date(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })

/** Il segno che lascia la riga di ieri (P1B) per atterrare su «Come lavori»: si guarda, lo consuma ComeLavori. */
function vaiComeLavori(): string | null {
  try { return sessionStorage.getItem('myynd:vai') === 'come-lavori' ? 'come-lavori' : null } catch { return null }
}

/** I conti già tradotti in questa sessione: cambiare sezione non rifà la traduzione. */
const tradotti = new Set<string>()

/**
 * «Le tue parole»: su cosa lavori adesso, progetto per progetto, detto da te.
 * È il testo che Myynd legge prima di scegliere. Un nome in testa a una riga
 * che corrisponde a una cartella di lavoro diventa un progetto.
 */
function LeTueParole({ accendi }: { accendi: (nomi: string[]) => void }) {
  const [r, setR] = useState<{ testo: string; aggiornato: string | null } | null>(null)
  const [nati, setNati] = useState<string[]>([])
  useEffect(() => { memoriaP5.riferimento().then(setR).catch(() => setR({ testo: '', aggiornato: null })) }, [])
  const salva = async (testo: string) => {
    const x = await memoriaP5.scriviRiferimento(testo)
    setR({ testo: x.testo, aggiornato: x.aggiornato })
    setNati(x.nuovi)
    if (x.nuovi.length) { annunciaProgetti(); accendi(x.nuovi) }
  }
  const stato = nati.length ? frasi.nuoviProgetti(nati) : r?.aggiornato ? frasi.scritteIl(giorno(r.aggiornato)) : undefined
  return (
    <Carta titolo={t('Le tue parole')} id="parole" larga stato={stato}>
      <Campo etichettaDa="carta-parole" righe={6} vuotoVietato limite={1500} valore={r?.testo ?? ''} salva={salva}
        disabilitato={!r} esempio={t('Northwind: la revisione dell’app, poi il lancio. Harbor Labs: in pausa fino a ottobre.')} />
    </Carta>
  )
}

/** I progetti: le schede, e quella per farne uno nuovo. Ogni gesto si vede subito e torna indietro se il server dice di no. */
function Progetti({ daAccendere }: { daAccendere: string[] }) {
  const [progetti, setProgetti] = useState<Progetto[] | null>(null)
  // il biglietto della prima pagina («Da il progetto H-Farm»): si strappa quando la scheda c'è davvero
  const [daMostrare, setDaMostrare] = useState<string | null>(progettoAtteso)
  const [acceso, setAcceso] = useState<string | null>(null)
  /** L'ordine della griglia com'era quando il puntatore ci è entrato, o null. */
  const [tenuto, setTenuto] = useState<string[] | null>(null)
  const [nome, setNome] = useState('')
  const [obiettivo, setObiettivo] = useState('')
  const [guaio, setGuaio] = useState('')
  const [nasce, setNasce] = useState(false)
  const [nato, setNato] = useState<string | null>(null)
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
  useEffect(() => { void carica() }, [carica])
  useEffect(() => ascoltaProgetto(() => setDaMostrare(progettoAtteso())), [])
  const questaCopia = useRef({})
  useEffect(() => ascoltaProgetti(da => { if (da !== questaCopia.current) void carica() }), [carica])

  /** Una scheda che c'è già, portata sotto gli occhi con l'anello di rame per un attimo. */
  const mostraScheda = (id: string) => {
    requestAnimationFrame(() => document.getElementById(`progetto-${id}`)?.scrollIntoView({ block: 'center' }))
    setAcceso(id)
    setTimeout(() => setAcceso(a => (a === id ? null : a)), 1500)
  }

  useEffect(() => {
    if (!daMostrare || !progetti?.length) return
    if (!document.getElementById(`progetto-${daMostrare}`)) return
    dimenticaProgetto()
    // chi arriva con un biglietto è venuto per questo progetto: la sua pagina si apre sopra
    portaAlProgetto(daMostrare)
    setDaMostrare(null)
    mostraScheda(daMostrare)
  }, [daMostrare, progetti])

  // i progetti appena nati dalle sue parole: il primo prende l'anello
  useEffect(() => {
    if (!daAccendere.length || !progetti) return
    const primo = progetti.find(p => daAccendere.some(n => n.toLowerCase() === p.nome.toLowerCase()))
    if (primo) mostraScheda(primo.id)
  }, [daAccendere, progetti])

  // subito nella pagina, poi al server: se non passa, torna com'era e la scheda lo dice
  const cambia = async (id: string, c: CambioProgetto) => {
    const prima = progetti
    setProgetti(ps => ps ? ps.map(p => p.id === id ? { ...p, ...c } : p) : ps)
    try { await api.cambiaProgetto(id, c); annunciaProgetti(questaCopia.current) }
    catch (e) { setProgetti(prima); throw e }
    finally { void carica() }
  }

  const elimina = async (id: string) => {
    try { await api.eliminaProgetto(id); annunciaProgetti(questaCopia.current) } finally { await carica() }
  }

  // un progetto nuovo: la scheda c'è nell'istante di Invio, e sparisce se il server dice di no
  const aggiungi = async () => {
    const n = nome.trim()
    if (!n || nasce) return
    const o = obiettivo.trim()
    const noto = (progetti ?? []).find(p => p.nome.trim().toLowerCase() === n.toLowerCase())
    if (noto && noto.stato !== 'chiuso') { setGuaio(frasi.progettoEsiste(noto.nome)); mostraScheda(noto.id); return }
    const adesso = new Date().toISOString()
    const finto: Progetto = {
      id: `nuovo-${Date.now()}`, nome: n, obiettivo: o, stato: 'attivo', dal: adesso, aggiornato: adesso,
      note: '', origine: 'mano', colore: '', alias: [], genitore: null, priorita: null, memoria: null
    }
    setNasce(true)
    setNome(''); setObiettivo(''); setGuaio('')
    setProgetti(ps => [...(ps ?? []).filter(p => p.stato !== 'chiuso'), finto, ...(ps ?? []).filter(p => p.stato === 'chiuso')])
    try {
      const r = await api.nuovoProgetto(n, o)
      annunciaProgetti(questaCopia.current)
      await carica()
      if (r.esisteva) {
        setGuaio(r.riaperto ? frasi.progettoRiaperto(r.progetto.nome) : frasi.progettoEsiste(r.progetto.nome))
        mostraScheda(r.progetto.id)
        return
      }
      setNato(r.progetto.id)
    } catch (e) {
      setProgetti(ps => (ps ?? []).filter(p => p.id !== finto.id))
      setNome(n); setObiettivo(o)
      setGuaio(e instanceof Error ? e.message : String(e))
    }
    finally { setNasce(false) }
  }

  const posto = (id: string) => { const i = tenuto?.indexOf(id) ?? -1; return i < 0 ? Number.MAX_SAFE_INTEGER : i }
  const inOrdine = tenuto ? [...(progetti ?? [])].sort((a, b) => posto(a.id) - posto(b.id)) : (progetti ?? [])

  return (
    // sotto il puntatore l'ordine sta fermo: la griglia si riordina quando il puntatore se ne va
    <div className="mem-grid" data-scheda="progetti" style={{ marginTop: 11 }}
      onMouseEnter={() => setTenuto((progetti ?? []).map(p => p.id))} onMouseLeave={() => setTenuto(null)}>
      {inOrdine.map(p => (
        <SchedaProgetto key={p.id} p={p} tutti={progetti ?? []} cambia={cambia} elimina={elimina}
          apri={() => { if (!p.id.startsWith('nuovo-')) portaAlProgetto(p.id) }} acceso={acceso === p.id} conto={conti[p.id]} nato={nato === p.id} />
      ))}
      <Carta titolo={t('Nuovo progetto')} id="nuovo" stato={guaio ? t(guaio) : undefined} statoRame>
        <Casella etichetta={t('Nome')} valore={nome} cambia={setNome} avanti esempio={t('Il rilancio del sito')} />
        <Casella etichetta={t('Obiettivo')} valore={obiettivo} cambia={v => setObiettivo(v.slice(0, 200))} invio={aggiungi}
          esempio={t('Vendere il primo prodotto')} />
        {!!nome.trim() && (
          <div className="f-piede"><div style={{ flex: 1 }} />
            <Bottone tipo="pieno" piccolo onClick={aggiungi} occupato={nasce} etichettaOccupato={t('Aggiungo…')}>{t('Aggiungi')}</Bottone>
          </div>
        )}
      </Carta>
    </div>
  )
}

/**
 * Una delle cinque domande su come lavori, e la tua risposta. Il tetto di
 * caratteri costringe a consolidare invece di accumulare. «Riordina» scrive
 * la versione in ordine, e «Rimetti com’era» la riporta indietro.
 */
function Risposta({ b, salvato }: { b: Blocco; salvato: () => void }) {
  const [riordino, setRiordino] = useState(false)
  const [prima, setPrima] = useState<string | null>(null)
  const [guaio, setGuaio] = useState('')
  const id = `domanda-${b.etichetta}`
  const salva = async (testo: string) => { await api.scriviBlocco(b.etichetta, testo.slice(0, b.tetto)); salvato() }
  const riordina = async () => {
    const grezzo = b.valore.trim()
    if (!grezzo) return
    setRiordino(true); setGuaio('')
    try {
      const r = await api.riscriviBlocco(b.etichetta, grezzo)
      if (r.testo && r.testo !== grezzo) { await api.scriviBlocco(b.etichetta, r.testo.slice(0, b.tetto)); setPrima(grezzo); salvato() }
    } catch (e) { setGuaio(detto(e)) }
    setRiordino(false)
  }
  const rimetti = async () => {
    if (prima === null) return
    const x = prima
    setPrima(null)
    try { await api.scriviBlocco(b.etichetta, x); salvato() } catch (e) { setPrima(x); setGuaio(detto(e)) }
  }
  return (
    <Carta titolo={t(DOMANDE[b.etichetta]?.domanda ?? b.descrizione)} id={id}
      stato={guaio || (b.daMe ? frasi.scrittoDaMe(giorno(b.daMe)) : undefined)} statoRame={!!guaio}
      azione={b.valore.trim() ? (
        prima !== null
          ? <Bottone tipo="parola" piccolo onClick={() => void rimetti()}>{t('Rimetti com’era')}</Bottone>
          : <Bottone tipo="parola" piccolo onClick={() => void riordina()} occupato={riordino} etichettaOccupato={t('Riordino…')}>{t('Riordina')}</Bottone>
      ) : undefined}>
      <Campo etichettaDa={`carta-${id}`} righe={3} limite={b.tetto} valore={b.valore} salva={salva}
        esempio={t(DOMANDE[b.etichetta]?.esempio ?? 'Non gliel’hai ancora detto.')} />
    </Carta>
  )
}

/** Il ritratto: quello che aspetta, le cinque risposte, quello che sa, quello che pensava prima. */
function Ritratto({ d, setD, carica }: { d: Dati | null; setD: (f: (d: Dati | null) => Dati | null) => void; carica: () => Promise<void> }) {
  const [nuova, setNuova] = useState('')
  const [guaio, setGuaio] = useState('')
  const [ordino, setOrdino] = useState(false)
  const [esito, setEsito] = useState('')
  const [storicheAperte, setStoricheAperte] = useState(false)

  const consolida = async () => {
    setOrdino(true); setEsito('')
    try {
      const r = await api.consolidaMemoria()
      await carica()
      setEsito(r.blocchi.length ? frasi.ritrattoAggiornato(r.blocchi.length, r.guardate) : t('Già aggiornato.'))
    } catch { setEsito(t('Aggiornamento non riuscito.')) }
    setOrdino(false)
  }

  const togli = (id: string) => setD(v => (v ? { ...v, convinzioni: v.convinzioni.filter(c => c.id !== id) } : v))
  const scorda = (c: Convinzione) => async () => {
    togli(c.id)
    try { await api.scordaConvinzione(c.id) } catch (e) { setD(v => (v ? { ...v, convinzioni: [...v.convinzioni, c] } : v)); throw e }
  }
  const tieni = (c: Convinzione) => async () => {
    setD(v => (v ? { ...v, convinzioni: v.convinzioni.map(x => x.id === c.id ? { ...x, confermata: new Date().toISOString() } : x) } : v))
    try { await api.confermaConvinzione(c.id) } catch (e) { setD(v => (v ? { ...v, convinzioni: v.convinzioni.map(x => x.id === c.id ? c : x) } : v)); throw e }
  }
  const correggi = (c: Convinzione) => async (testo: string) => { await memoriaP5.correggiConvinzione(c.id, testo); void carica() }

  // una scritta a mano: la riga c'è subito, e se il server dice di no se ne va
  const aggiungi = async () => {
    const testo = nuova.trim()
    if (!testo) return
    const finta: Convinzione = { id: `nuova-${Date.now()}`, enunciato: testo, ambito: 'persona', genere: 'esplicita', fiducia: 1, origine: 'mano', dal: new Date().toISOString() }
    setNuova(''); setGuaio('')
    setD(v => (v ? { ...v, convinzioni: [finta, ...v.convinzioni] } : v))
    try { await api.scriviConvinzione(testo); await carica() }
    catch (e) { togli(finta.id); setNuova(testo); setGuaio(detto(e)) }
  }

  const aspettano = (d?.convinzioni ?? []).filter(inAttesa)
  const sa = (d?.convinzioni ?? []).filter(c => !inAttesa(c))
  const riga = (c: Convinzione) => (
    <RigaConvinzione key={c.id} c={c} scorda={c.id.startsWith('nuova-') ? undefined : scorda(c)}
      tieni={inAttesa(c) ? tieni(c) : undefined} correggi={c.id.startsWith('nuova-') ? undefined : correggi(c)} />
  )

  return (
    <>
      <div className="f-sezione-azione">
        <Bottone piccolo onClick={() => void consolida()} occupato={ordino} etichettaOccupato={t('Aggiorno…')}>{t('Aggiorna adesso')}</Bottone>
        {esito && <span className="f-stato">{esito}</span>}
      </div>

      {aspettano.length > 0 && (
        <div className="mem-blocco" data-scheda="da-guardare">
          <div className="mem-titoletto rame">{t('Da guardare')}</div>
          <div className="mem-grid fitta">{aspettano.map(riga)}</div>
        </div>
      )}

      <div className="f-griglia" data-scheda="domande">
        {(d?.blocchi ?? []).map(b => <Risposta key={b.etichetta} b={b} salvato={() => void carica()} />)}
      </div>

      <div className="mem-blocco" data-scheda="sa">
        <div className="mem-titoletto">{t('Quello che sa')}</div>
        {sa.length > 0 && <div className="mem-grid fitta">{sa.map(riga)}</div>}
        <div className="mem-aggiungi">
          <Casella etichetta={t('Una cosa che deve sapere')} valore={nuova} cambia={setNuova} invio={() => void aggiungi()}
            esempio={t('Non faccio sconti sotto i mille euro')} />
          <Bottone tipo="pieno" onClick={() => void aggiungi()} disabled={!nuova.trim()}>{t('Aggiungi')}</Bottone>
        </div>
        {guaio && <div className="f-guaio" role="alert">{guaio}</div>}
      </div>

      {!!d?.storiche.length && (
        <div className="mem-blocco" data-scheda="prima">
          <button type="button" className="mem-piega" onClick={() => setStoricheAperte(v => !v)} aria-expanded={storicheAperte}>
            <span className="freccia" style={{ transform: storicheAperte ? 'none' : 'rotate(-90deg)' }}><IconGiu size={10} stroke="currentColor" /></span>
            <span className="mem-titoletto" style={{ margin: 0 }}>{t('Prima pensava')}</span>
            <span className="mem-conta">{d.storiche.length}</span>
          </button>
          {storicheAperte && <div className="mem-grid fitta" style={{ marginTop: 10 }}>{d.storiche.map(c => <RigaConvinzione key={c.id} c={c} storica />)}</div>}
        </div>
      )}
    </>
  )
}

/** I documenti consegnati: un clic li apre; quelli spostati restano scritti, e non si premono. */
function Documenti({ documenti }: { documenti: DocumentoProdotto[] }) {
  const d = desktop()
  const [apro, setApro] = useState('')
  const [guaio, setGuaio] = useState('')
  if (!documenti.length) return null
  const apri = async (x: DocumentoProdotto) => {
    if (!x.disponibile || apro) return
    setApro(x.id); setGuaio('')
    try { await api.portami(x.id) } catch (e) { setGuaio(detto(e)) } finally { setApro('') }
  }
  return (
    <Carta titolo={t('Documenti')} id="documenti" larga stato={guaio || undefined} statoRame>
      <div className="mem-documenti">
        {documenti.map(x => {
          const sotto = [x.progetto, new Date(x.aggiornato).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')
          return (
            <div key={x.id} className="mem-documento" data-missing={!x.disponibile ? '' : undefined}>
              {x.disponibile ? (
                <button type="button" className="mem-documento-apri" onClick={() => void apri(x)} aria-busy={apro === x.id || undefined}>
                  <strong>{x.titolo}</strong><span>{apro === x.id ? t('Apro…') : sotto}</span>
                </button>
              ) : (
                <div className="mem-documento-apri"><strong>{x.titolo}</strong><span>{t('Spostato o cancellato')}</span></div>
              )}
              {x.disponibile && d && (
                <Bottone tipo="parola" piccolo className="mem-finder" onClick={() => { Promise.resolve(d.mostraNelFinder(x.percorso)).catch(() => {}) }}>
                  {t('Mostra nel Finder')}
                </Bottone>
              )}
            </div>
          )
        })}
      </div>
    </Carta>
  )
}

export function Memoria({ v }: { v: Vals }) {
  const [d, setD] = useState<Dati | null>(null)
  const [guasto, setGuasto] = useState('')
  const [sommario, setSommario] = useState<Sommario | null>(null)
  const [traduco, setTraduco] = useState(false)
  const [daAccendere, setDaAccendere] = useState<string[]>([])

  const carica = useCallback(async () => {
    try { setD(await api.memoria()); setGuasto('') }
    catch (e) { setGuasto(e instanceof Error ? e.message : String(e)) }
  }, [])
  const caricaSommario = useCallback(async () => {
    try { setSommario(await memoriaP5.sommario()) } catch { /* le note restano quelle di prima */ }
  }, [])
  const tutto = useCallback(() => { void carica(); void caricaSommario() }, [carica, caricaSommario])
  useEffect(() => { tutto() }, [tutto])
  // un progetto cambiato altrove (la sua pagina, la prima pagina): la nota dei Progetti segue
  useEffect(() => ascoltaProgetti(() => { void caricaSommario() }), [caricaSommario])

  // il punto nel menù: da dove si parte se era acceso, e poi si spegne
  const allApertura = useRef(v.memoriaNuove)
  useEffect(() => { v.memoriaVista() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // qualcosa di nuovo mentre guarda: si rilegge, e il punto non si accende sotto i suoi occhi
  const quante = v.memoriaNuove.quante
  useEffect(() => {
    if (quante > 0) { tutto(); v.memoriaVista() }
  }, [quante]) // eslint-disable-line react-hooks/exhaustive-deps

  // le note del ritratto seguono la pagina, non l'ultima lettura: «Tienila» o il cestino le cambiano nello stesso fotogramma
  const sommarioVero: Sommario | null = sommario && d
    ? { ...sommario, ritratto: { sa: d.convinzioni.filter(c => !inAttesa(c)).length, daGuardare: d.convinzioni.filter(inAttesa).length } }
    : sommario
  const sezioni = sezioniMemoria(sommarioVero)
  const [sezione, setSezione] = useState<SezioneMem>(() => sezioneIniziale({
    pagina: 'memoria', richiesta: sezioneAttesa('memoria')?.sezione ?? vaiComeLavori(), biglietto: !!progettoAtteso(),
    nuove: allApertura.current.quante > 0 ? allApertura.current.dove : null,
    ricordata: sezioneRicordata('memoria', v.emailConto), valide: sezioni.map(s => s.id)
  }) as SezioneMem)
  // un biglietto per un progetto con la pagina già aperta: si va ai Progetti
  useEffect(() => ascoltaProgetto(() => { if (progettoAtteso()) setSezione('progetti') }), [])

  /*
   * Quello che ha imparato, nella lingua che stai leggendo: una volta sola per
   * conto e per sessione, a livello di pagina (cambiare sezione non la rifà).
   */
  useEffect(() => {
    const chi = v.emailConto ?? ''
    if (!d?.daTradurre || tradotti.has(chi)) return
    tradotti.add(chi)
    setTraduco(true)
    api.traduciMemoria().then(carica).catch(() => {}).finally(() => setTraduco(false))
  }, [d?.daTradurre, carica, v.emailConto])

  return (
    <PaginaASezioni titolo={t('Memoria')} pagina="memoria" etichettaNav={t('Sezioni della memoria')} sezioni={sezioni}
      attuale={sezione} scegli={id => setSezione(id as SezioneMem)} email={v.emailConto}>
      {guasto && <div className="f-guaio" role="alert" style={{ margin: '11px 4px' }}>{t(guasto)}</div>}
      {traduco && <div className="f-stato" style={{ margin: '11px 4px 0' }}>{t('Le rimetto nella tua lingua…')}</div>}

      {sezione === 'progetti' && (
        <>
          <div className="f-griglia"><LeTueParole accendi={setDaAccendere} /></div>
          <Progetti daAccendere={daAccendere} />
        </>
      )}

      {sezione === 'come-lavori' && <ComeLavori />}

      {sezione === 'ritratto' && <Ritratto d={d} setD={setD} carica={async () => { await carica(); await caricaSommario() }} />}

      {sezione === 'fatto' && (
        <div className="f-griglia">
          <CosaHaFatto titolo={false} />
          {d && <Documenti documenti={d.documenti} />}
        </div>
      )}
    </PaginaASezioni>
  )
}
