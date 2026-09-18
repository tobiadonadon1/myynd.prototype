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
//   · in fondo c'è il testo *vero* che finisce nel prompt, alla lettera. Non un
//     riassunto rassicurante: quello. È l'unica forma di trasparenza che non si
//     può falsificare.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api, type Blocco, type CambioProgetto, type Compito, type Convinzione, type Memoria as Dati, type Progetto
} from '../api'
import { frasi, t, loc } from '../lingua'
import { DOMANDE } from '../data'
import { CARD_GLASS, Cestino, Hov, LABEL, useAttiva } from '../ui'
import { IconGiu } from '../icons'
import { Glifo } from '../components/Stato'
import { ascoltaProgetto, dimenticaProgetto, progettoAtteso } from '../vals'
import { RigaProgetto } from './ProgettoEditor'

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
  return (
    <span style={{
      flex: 'none', fontSize: '10.5px', fontWeight: 600, letterSpacing: '.08em',
      textTransform: 'uppercase', padding: '3px 8px', borderRadius: 5,
      color: c.testo, background: c.fondo
    }}>{t(genere)}</span>
  )
}

/**
 * Un blocco: una domanda su di te, e la tua risposta.
 *
 * Il tetto di caratteri non è una scortesia: è quello che costringe a
 * consolidare invece di accumulare. Un ritratto che cresce senza limite smette
 * di essere un ritratto e diventa un archivio, e il modello lo legge come
 * rumore. Il contatore si accende in rosso prima del limite, non dopo.
 */
function Campo({ b, salvato }: { b: Blocco; salvato: () => void }) {
  const [testo, setTesto] = useState(b.valore)
  const [salvando, setSalvando] = useState(false)
  const [riordino, setRiordino] = useState(false)
  /** Com'era prima che la riordinasse: senza, «riordina» è un gesto senza ritorno. */
  const [prima, setPrima] = useState<string | null>(null)
  useEffect(() => { setTesto(b.valore); setPrima(null) }, [b.valore])

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
    setSalvando(true)
    try { await api.scriviBlocco(b.etichetta, testo.slice(0, b.tetto)); salvato() } catch { /* il valore vero lo dirà il ricarico */ }
    setSalvando(false)
  }

  return (
    <div style={{ padding: '15px 0', borderTop: '1px solid rgba(var(--inchiostro-rgb),.08)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: '13.5px', color: 'rgba(var(--inchiostro-rgb),.72)', textWrap: 'pretty' }}>
          {/* la domanda in seconda persona, la stessa dell'onboarding: qui la
              legge la stessa persona che l'ha già letta là */}
          {t(DOMANDE[b.etichetta]?.domanda ?? b.descrizione)}
          {/*
            Chi ha scritto questa riga.

            Queste cinque caselle restavano vuote per sempre — nessuno si siede
            a scrivere un ritratto di sé stesso — e adesso le riempie Myynd da
            quello che ha imparato lavorando. Il che rende questa mezza riga
            obbligatoria: un ritratto scritto da una macchina che non dice di
            averlo scritto è esattamente la cosa contro cui è fatta questa
            schermata. Appena ci metti mano tu, sparisce: da lì in poi quelle
            sono parole tue.
          */}
          {b.daMe && !cambiato && (
            <span style={{ display: 'block', marginTop: 3, fontSize: '11.5px', color: 'rgba(var(--inchiostro-rgb),.42)' }}>
              {frasi.scrittoDaMe(new Date(b.daMe).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }))}
            </span>
          )}
        </div>
        {/* La pastiglia sta qui, in cima al riquadro che riordina: accanto al
            campo si legge come un'altra azione fra tante, qui si legge come
            una cosa che appartiene a *questa* domanda. */}
        {!!testo.trim() && (
          <Hov as="button" onClick={riordina} disabled={riordino}
            style={{
              flex: 'none', padding: '5px 13px', borderRadius: 99, border: 'none',
              background: riordino ? 'rgba(var(--rame-rgb),.12)' : 'rgba(var(--rame-rgb),.16)',
              cursor: riordino ? 'default' : 'pointer', fontFamily: 'inherit',
              fontSize: '12px', fontWeight: 500, color: 'var(--rame-testo)',
              whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6
            }}
            hover={riordino ? {} : { background: 'rgba(var(--rame-rgb),.26)' }}>
            {/* il glifo del pensare, lo stesso che gira sulle righe delegate:
                dice senza parole che qui dietro c'è il modello */}
            <Glifo tipo="penso" dim={11} colore="var(--rame-testo)" />
            {riordino ? t('Riordino…') : t('Riordina')}
          </Hov>
        )}
        {prima !== null && (
          <Hov as="button" onClick={() => { setTesto(prima); setPrima(null) }}
            style={{
              flex: 'none', border: 'none', background: 'none', padding: '3px 0',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', color: 'rgba(var(--inchiostro-rgb),.45)'
            }}
            hover={{ color: 'var(--rame-testo)' }}>{t('Rimetti com’era')}</Hov>
        )}
      </div>
      <textarea
        value={testo}
        onChange={e => setTesto(e.target.value.slice(0, b.tetto))}
        onBlur={salva}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) salva() }}
        // l'esempio, come nell'onboarding: davanti a un riquadro vuoto vale più
        // di una spiegazione
        placeholder={t(DOMANDE[b.etichetta]?.esempio ?? 'Non gliel’hai ancora detto.')}
        rows={testo.length > 90 ? 3 : 2}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 12,
          border: '1px solid rgba(var(--inchiostro-rgb),.16)', background: 'rgba(var(--luce-rgb),.75)',
          color: 'var(--inchiostro)', fontSize: '14px', lineHeight: 1.55, fontFamily: 'inherit',
          outline: 'none', resize: 'vertical'
        }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <span style={{ flex: 'none', fontSize: '11.5px', color: resta < 60 ? 'var(--rame-testo)' : 'rgba(var(--inchiostro-rgb),.4)' }}>
          {resta < 120 ? `${resta} ${t('caratteri rimasti')}` : ''}
        </span>

        <div style={{ flex: 1 }} />
        {cambiato && (
          <Hov as="button" onClick={salva} disabled={salvando}
            style={{
              flex: 'none', padding: '6px 14px', borderRadius: 99, border: 'none',
              background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)',
              fontSize: '12.5px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
            }}
            hover={{ opacity: 0.92 }}>{salvando ? t('Salvo…') : t('Salva')}</Hov>
        )}
      </div>
    </div>
  )
}

/** Una riga di quello che ha capito, con da dove viene e quanto ci crede. */
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

function Riga({ c, scorda, tieni, storica }:
  { c: Convinzione; scorda?: (id: string) => void; tieni?: (id: string) => void; storica?: boolean }) {
  const { attiva, props } = useAttiva()
  const [aperta, setAperta] = useState(false)
  const haProva = !!(c.prova?.citazione || c.premesse?.length)
  const aspetta = inAttesa(c) && !storica

  return (
    <div
      {...props}
      style={{
        padding: '13px 0', borderTop: '1px solid rgba(var(--inchiostro-rgb),.08)',
        opacity: storica ? 0.6 : 1
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '14.5px', lineHeight: 1.5, color: 'var(--inchiostro)', textWrap: 'pretty',
            textDecoration: storica ? 'line-through' : 'none'
          }}>{c.enunciato}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
            <Etichetta genere={c.genere} />
            {aspetta && (
              <span style={{ fontSize: '11.5px', color: 'var(--rame-testo)' }}>{t('non la sto usando')}</span>
            )}
            <span style={{ fontSize: '11.5px', color: 'rgba(var(--inchiostro-rgb),.5)' }}>{quanto(c.fiducia)}</span>
            {c.ambito !== 'persona' && (
              // «cliente:Nick» è come sta scritto nel database, non come si legge
              <span style={{ fontSize: '11.5px', color: 'rgba(var(--inchiostro-rgb),.5)' }}>
                · {c.ambito === 'azienda' ? t('azienda') : c.ambito.replace(/^(?:cliente|progetto):/, '')}
              </span>
            )}
            <span style={{ fontSize: '11.5px', color: 'rgba(var(--inchiostro-rgb),.4)' }}>
              · {t('da')} {t(c.origine)}
            </span>
            {storica && c.al && (
              <span style={{ fontSize: '11.5px', color: 'rgba(var(--inchiostro-rgb),.4)' }}>
                · {t('fino al')} {new Date(c.al).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            {haProva && (
              <Hov as="button" onClick={() => setAperta(a => !a)}
                style={{
                  border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '11.5px', color: 'rgba(var(--inchiostro-rgb),.45)', display: 'inline-flex', alignItems: 'center', gap: 4
                }}
                hover={{ color: 'var(--rame-testo)' }}>
                {t('perché')}
                <span style={{ display: 'flex', transform: aperta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                  <IconGiu size={9} stroke="currentColor" />
                </span>
              </Hov>
            )}
          </div>
        </div>

        {/* «tienila» non chiede conferma: è il gesto leggero dei due, e si può sempre scordare dopo */}
        {aspetta && tieni && (
          <Hov as="button" onClick={() => tieni(c.id)}
            style={{
              flex: 'none', border: '1px solid rgba(var(--inchiostro-rgb),.16)', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '12px', color: 'var(--inchiostro)', padding: '4px 11px', borderRadius: 7
            }}
            hover={{ borderColor: 'rgba(var(--inchiostro-rgb),.4)' }}>{t('Tienila')}</Hov>
        )}
        {/* scordare chiede una volta: è la sua testa, ma è una cosa che non torna */}
        {scorda && <Cestino fai={() => scorda(c.id)} titolo={t('Scordala')} visibile={attiva} />}
      </div>

      {aperta && (
        <div style={{
          marginTop: 9, padding: '10px 13px', borderRadius: 11,
          background: 'rgba(var(--inchiostro-rgb),.04)', fontSize: '12.5px', lineHeight: 1.6, color: 'rgba(var(--inchiostro-rgb),.7)',
          // la citazione è copiata da un documento: può essere un indirizzo lungo
          overflowWrap: 'anywhere'
        }}>
          {c.prova?.citazione && <div style={{ fontStyle: 'italic' }}>«{c.prova.citazione}»</div>}
          {c.premesse?.length ? (
            <div style={{ marginTop: c.prova?.citazione ? 7 : 0 }}>
              <div style={{ fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(var(--inchiostro-rgb),.45)', marginBottom: 3 }}>
                {t('dedotta da')}
              </div>
              {c.premesse.map((p, i) => <div key={i}>— {p}</div>)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * I progetti: su cosa lavora, e a cosa punta ciascuno.
 *
 * Stanno in cima alla Memoria, prima dei blocchi, perché sono la cosa che il
 * feed, la rassegna e il punto leggono *prima* di scegliere: un obiettivo
 * scritto in una riga vale più di trenta documenti.
 *
 * Una riga per progetto, e la riga è il posto dove si lavora. Il nome e
 * l'obiettivo si scrivono cliccandoci sopra, il pallino apre la tavolozza, lo
 * stato ha i suoi tre scatti, il cestino sta lì e chiede nello spazio della
 * riga. Sotto la riga si apre quello che si tocca di rado: gli altri nomi, il
 * progetto dentro cui sta, le note, quello che Myynd ricorda, unire.
 * `ProgettoEditor`.
 */
function Progetti() {
  const [progetti, setProgetti] = useState<Progetto[] | null>(null)
  /** Quale riga è aperta: una sola, altrimenti è di nuovo un modulo lungo due schermi. */
  const [aperto, setAperto] = useState<string | null>(null)
  /**
   * La riga da portare sotto gli occhi, e quella accesa.
   *
   * Il biglietto lo lascia la prima pagina («Da il progetto H-Farm») e qui si
   * legge quando la schermata si monta, o mentre è già aperta. Si strappa solo
   * quando la riga esiste davvero: prima dei progetti caricati non c'è niente
   * su cui scorrere, e strapparlo lì vorrebbe dire arrivare in Memoria senza
   * sapere quale riga si era chiesta.
   */
  const [daMostrare, setDaMostrare] = useState<string | null>(progettoAtteso)
  const [acceso, setAcceso] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [obiettivo, setObiettivo] = useState('')
  const [guaio, setGuaio] = useState('')
  const [nasce, setNasce] = useState(false)
  /** L'ultimo nato: la sua riga prende il fuoco con il nome selezionato. */
  const [nato, setNato] = useState<string | null>(null)
  /**
   * Quante attività ha ciascuno.
   *
   * Una chiamata sola per tutta la lista, non una per riga: il conto è una
   * cosa che si legge di sfuggita, e non vale otto richieste. Se non arriva,
   * la riga semplicemente non lo dice.
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
    } catch { /* la riga non dice il conto, e basta */ }
  }, [])
  useEffect(() => { carica() }, [carica])
  useEffect(() => ascoltaProgetto(() => setDaMostrare(progettoAtteso())), [])
  useEffect(() => {
    if (!daMostrare || !progetti?.length) return
    const riga = document.getElementById(`progetto-${daMostrare}`)
    if (!riga) return
    riga.scrollIntoView({ block: 'center' })
    dimenticaProgetto()
    // chi arriva qui da una carta della prima pagina è venuto per *questo*
    // progetto: trovarlo chiuso come tutti gli altri sarebbe arrivare a metà
    setAperto(daMostrare)
    setDaMostrare(null)
    setAcceso(daMostrare)
    // un secondo e mezzo: il tempo di vedere quale riga, non di doverla spegnere
    const via = setTimeout(() => setAcceso(null), 1500)
    return () => clearTimeout(via)
  }, [daMostrare, progetti])

  /**
   * Cambia, e lascia passare il guaio.
   *
   * L'eccezione non si mangia qui: l'editor la prende e la scrive sotto al
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
      // appena nato, il fuoco va sulla sua riga con il nome già selezionato:
      // è lì che si correggono il nome, l'obiettivo, lo stato e il colore, e
      // aprirgli sotto l'editor vorrebbe dire mandarlo a cercarli altrove
      setNato(r.progetto.id)
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    finally { setNasce(false) }
  }

  const campo = {
    boxSizing: 'border-box' as const, padding: '9px 12px', borderRadius: 10,
    border: '1px solid rgba(var(--inchiostro-rgb),.16)', background: 'rgba(var(--luce-rgb),.75)',
    color: 'var(--inchiostro)', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none'
  }

  return (
    // sopra le carte che vengono dopo: la tavolozza e la riga dello stato
    // escono dalla riga, e una carta disegnata dopo le coprirebbe a metà
    <div style={{
      ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '20px 24px 18px',
      position: 'relative', zIndex: 2
    }}>
      <span style={{ ...LABEL }}>{t('Progetti')}</span>
      <div style={{ fontSize: '13px', color: 'rgba(var(--inchiostro-rgb),.6)', marginTop: 8, lineHeight: 1.6, textWrap: 'pretty' }}>
        {t('Su cosa stai lavorando, e a cosa punta ciascuno. È la prima cosa che Myynd legge prima di scegliere cosa mostrarti.')}
      </div>
      {/* la confusione era proprio questa: un progetto senza un compito in corso non è finito */}
      <div style={{ fontSize: '13px', color: 'rgba(var(--inchiostro-rgb),.45)', marginTop: 4, lineHeight: 1.5, textWrap: 'pretty' }}>
        {t('Un progetto senza attività resta attivo: chiudilo solo quando è finito.')}
      </div>

      {/*
        La riga che non c'è ancora.

        Due caselle, non undici: un progetto nasce da un nome e da dove punta, e
        il colore, gli altri nomi e il progetto padre si scrivono dopo, aprendolo.
      */}
      <div style={{
        marginTop: 15, padding: '13px 14px', borderRadius: 14,
        border: '1px dashed rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.4)'
      }}>
        <span style={{ ...LABEL }}>{t('Nuovo progetto')}</span>
        <div style={{ display: 'flex', gap: 9, marginTop: 9, flexWrap: 'wrap' }}>
          <input value={nome} onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') aggiungi() }}
            placeholder={t('Il nome del progetto')} aria-label={t('Il nome del progetto')}
            style={{ ...campo, flex: '1 1 180px', minWidth: 0 }} />
          <input value={obiettivo} onChange={e => setObiettivo(e.target.value.slice(0, 200))}
            onKeyDown={e => { if (e.key === 'Enter') aggiungi() }}
            placeholder={t('A cosa punta, in una riga: «chiudere il round entro ottobre»')}
            aria-label={t('Obiettivo')}
            style={{ ...campo, flex: '2 1 260px', minWidth: 0 }} />
        </div>
        {!!nome.trim() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'flex-end', marginTop: 11 }}>
            <span style={{ fontSize: '12px', color: 'rgba(var(--inchiostro-rgb),.45)' }}>{t('Il resto si scrive aprendo la riga.')}</span>
            <Hov as="button" type="button" onClick={aggiungi} disabled={nasce}
              style={{
                flex: 'none', padding: '9px 18px', borderRadius: 99, border: 'none',
                background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)',
                fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', cursor: nasce ? 'default' : 'pointer'
              }}
              hover={nasce ? {} : { opacity: 0.92 }}>{nasce ? t('Aggiungo…') : t('Aggiungi')}</Hov>
          </div>
        )}
        {guaio && (
          <div role="alert" style={{ fontSize: '12px', color: 'var(--rame-testo)', marginTop: 8, overflowWrap: 'anywhere' }}>{t(guaio)}</div>
        )}
      </div>

      {progetti && progetti.length === 0 && (
        <div style={{ fontSize: '13.5px', color: 'rgba(var(--inchiostro-rgb),.55)', marginTop: 14, lineHeight: 1.6, textWrap: 'pretty' }}>
          {t('Nessun progetto ancora. Scrivine uno, o lascia che il punto lo riconosca dal materiale.')}
        </div>
      )}
      <div style={{ marginTop: progetti?.length ? 14 : 0 }}>
        {(progetti ?? []).map(p => (
          <RigaProgetto key={p.id} p={p} tutti={progetti ?? []} cambia={cambia} unisci={unisci} elimina={elimina}
            aperta={aperto === p.id} apri={() => setAperto(a => (a === p.id ? null : p.id))} acceso={acceso === p.id}
            conto={conti[p.id]} nato={nato === p.id} />
        ))}
      </div>
    </div>
  )
}

export function Memoria() {
  const [d, setD] = useState<Dati | null>(null)
  const [guasto, setGuasto] = useState('')
  const [storicheAperte, setStoricheAperte] = useState(false)
  const [nuova, setNuova] = useState('')
  const [ordino, setOrdino] = useState(false)
  const [dettoRitratto, setDettoRitratto] = useState('')

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
      <div style={{ width: 720, maxWidth: '100%', padding: '12px 4px' }}>
        <div style={{ fontSize: 34, letterSpacing: '-.03em' }}>{t('Memoria')}</div>
        <div style={{ marginTop: 16, fontSize: '13.5px', color: 'var(--rame-testo)' }}>{t(guasto)}</div>
      </div>
    )
  }

  return (
    <div style={{ width: 720, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 4px 8px' }}>
        <div style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em' }}>{t('Memoria')}</div>
        <div style={{ fontSize: '13.5px', color: 'rgba(var(--inchiostro-rgb),.65)', marginTop: 8, maxWidth: 540, lineHeight: 1.6, textWrap: 'pretty' }}>
          {t('Quello che Myynd sa di te, separato da quello che ha letto. I documenti sono fatti; qui sta il giudizio, e puoi cambiarlo.')}
        </div>
      </div>

      {/* — i progetti: prima di tutto, perché sono la prima cosa che legge — */}
      <Progetti />

      {/* — i cinque blocchi — */}
      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '20px 24px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...LABEL, flex: 1 }}>{t('Come lavori')}</span>
          {/*
            Gira già da solo ogni sei ore. Questo sta qui per il momento in cui
            uno finisce una conversazione lunga e vuole *vedere* cosa ne è
            uscito, invece di scoprirlo domani per caso.
          */}
          <Hov as="button" onClick={consolida} disabled={ordino}
            style={{
              flex: 'none', border: 'none', background: 'none', padding: 0,
              fontFamily: 'inherit', fontSize: '12px', color: 'var(--rame-testo)',
              cursor: ordino ? 'default' : 'pointer'
            }}
            hover={ordino ? {} : { color: 'var(--rame)' }}>
            {ordino ? t('Ci penso…') : t('Aggiorna da quello che hai imparato')}
          </Hov>
        </div>
        {dettoRitratto && (
          <div style={{ fontSize: '12px', color: 'rgba(var(--inchiostro-rgb),.5)', marginTop: 6 }}>{dettoRitratto}</div>
        )}
        {(d?.blocchi ?? []).map(b => <Campo key={b.etichetta} b={b} salvato={carica} />)}
        {!d && <div style={{ fontSize: '13px', color: 'rgba(var(--inchiostro-rgb),.45)', padding: '14px 0' }}>{t('carico…')}</div>}
      </div>

      {/* — quello che ha capito da solo — */}
      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '20px 24px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ ...LABEL, flex: 1 }}>{t('Quello che ha capito')}</span>
          {/* mentre le rimette nella tua lingua: una riga, e poi sparisce */}
          {traduco && (
            <span style={{ fontSize: '11.5px', color: 'rgba(var(--inchiostro-rgb),.45)' }}>{t('Le rimetto nella tua lingua…')}</span>
          )}
          <span style={{ fontSize: '12px', color: 'rgba(var(--inchiostro-rgb),.45)' }}>{d?.convinzioni.length ?? 0}</span>
        </div>

        {d && d.convinzioni.length === 0 && (
          <div style={{ fontSize: '13.5px', color: 'rgba(var(--inchiostro-rgb),.55)', marginTop: 12, lineHeight: 1.6, textWrap: 'pretty' }}>
            {t('Ancora niente. Impara parlandoti, e da quello che correggi delle sue bozze.')}
          </div>
        )}

        {/*
          * Quelle che aspettano stanno in cima, e con una riga che dice perché.
          * Senza, «non la sto usando» sarebbe una scritta senza spiegazione in
          * mezzo a un elenco — e la cosa da capire è che Myynd non le sta usando.
          */}
        {!!quanteInAttesa && (
          <div style={{ fontSize: '13px', color: 'rgba(var(--inchiostro-rgb),.6)', marginTop: 12, lineHeight: 1.6, textWrap: 'pretty' }}>
            {frasi.inAttesa(quanteInAttesa)} {t('Le ha notate da solo: non le usa per scrivere finché non gliele confermi.')}
          </div>
        )}

        {ordinate.map(c => <Riga key={c.id} c={c} scorda={scorda} tieni={tieni} />)}

        {/* scriverne una a mano: è la sua testa, deve poterci mettere le mani */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input
            value={nuova}
            onChange={e => setNuova(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') aggiungi() }}
            placeholder={t('Aggiungine una tu: «non faccio sconti sotto i mille euro»')}
            style={{
              flex: 1, minWidth: 0, padding: '10px 13px', borderRadius: 11,
              border: '1px solid rgba(var(--inchiostro-rgb),.16)', background: 'rgba(var(--luce-rgb),.7)',
              color: 'var(--inchiostro)', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none'
            }} />
          <button onClick={aggiungi} disabled={!nuova.trim()} style={{
            flex: 'none', padding: '10px 18px', borderRadius: 99, border: 'none',
            background: nuova.trim() ? 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))' : 'rgba(var(--inchiostro-rgb),.1)',
            color: nuova.trim() ? 'var(--avorio)' : 'rgba(var(--inchiostro-rgb),.3)',
            fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
            cursor: nuova.trim() ? 'pointer' : 'default'
          }}>{t('Aggiungi')}</button>
        </div>
      </div>

      {/* — quello che pensava prima — */}
      {!!d?.storiche.length && (
        <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 24px' }}>
          <Hov as="button" onClick={() => setStoricheAperte(v => !v)} aria-expanded={storicheAperte}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none',
              background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left'
            }}
            hover={{ color: 'var(--rame-testo)' }}>
            <span style={{ display: 'flex', transform: storicheAperte ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }}>
              <IconGiu size={10} stroke="currentColor" />
            </span>
            <span style={{ ...LABEL, flex: 1 }}>{t('Quello che pensava prima')}</span>
            <span style={{ fontSize: '12px', color: 'rgba(var(--inchiostro-rgb),.45)' }}>{d.storiche.length}</span>
          </Hov>
          {storicheAperte && (
            <>
              <div style={{ fontSize: '12.5px', color: 'rgba(var(--inchiostro-rgb),.55)', marginTop: 10, lineHeight: 1.55, textWrap: 'pretty' }}>
                {t('Non si cancella niente: quando cambia idea, alla vecchia mette una data di fine. Così «fino a marzo pensavo X» resta una domanda con una risposta.')}
              </div>
              {d.storiche.map(c => <Riga key={c.id} c={c} storica />)}
            </>
          )}
        </div>
      )}

    </div>
  )
}
