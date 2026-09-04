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
import { api, type Blocco, type Convinzione, type Memoria as Dati } from '../api'
import { frasi, t, loc } from '../lingua'
import { DOMANDE } from '../data'
import { CARD_GLASS, Cestino, Hov, LABEL, useAttiva } from '../ui'
import { IconGiu } from '../icons'
import { Glifo } from '../components/Stato'

/** Quanto pesa una convinzione, detto a parole invece che con un numero. */
function quanto(f: number): string {
  return f >= 0.8 ? t('certo') : f >= 0.5 ? t('probabile') : t('da confermare')
}

/** Da dove viene: esplicita è tua, indotta è sua. Non è la stessa cosa. */
const COLORE_GENERE: Record<string, { testo: string; fondo: string }> = {
  esplicita: { testo: '#2F4A33', fondo: 'rgba(126,156,130,.18)' },
  dedotta: { testo: '#8A6317', fondo: 'rgba(216,164,110,.2)' },
  indotta: { testo: '#8E3F1F', fondo: 'rgba(196,98,59,.14)' }
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
    <div style={{ padding: '15px 0', borderTop: '1px solid rgba(34,39,31,.08)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: '13.5px', color: 'rgba(34,39,31,.72)', textWrap: 'pretty' }}>
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
            <span style={{ display: 'block', marginTop: 3, fontSize: '11.5px', color: 'rgba(34,39,31,.42)' }}>
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
              background: riordino ? 'rgba(196,98,59,.12)' : 'rgba(196,98,59,.16)',
              cursor: riordino ? 'default' : 'pointer', fontFamily: 'inherit',
              fontSize: '12px', fontWeight: 500, color: '#8E3F1F',
              whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6
            }}
            hover={riordino ? {} : { background: 'rgba(196,98,59,.26)' }}>
            {/* il glifo del pensare, lo stesso che gira sulle righe delegate:
                dice senza parole che qui dietro c'è il modello */}
            <Glifo tipo="penso" dim={11} colore="#8E3F1F" />
            {riordino ? t('Riordino…') : t('Riordina')}
          </Hov>
        )}
        {prima !== null && (
          <Hov as="button" onClick={() => { setTesto(prima); setPrima(null) }}
            style={{
              flex: 'none', border: 'none', background: 'none', padding: '3px 0',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', color: 'rgba(34,39,31,.45)'
            }}
            hover={{ color: '#8E3F1F' }}>{t('Rimetti com’era')}</Hov>
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
          border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.75)',
          color: '#22271F', fontSize: '14px', lineHeight: 1.55, fontFamily: 'inherit',
          outline: 'none', resize: 'vertical'
        }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <span style={{ flex: 'none', fontSize: '11.5px', color: resta < 60 ? '#8E3F1F' : 'rgba(34,39,31,.4)' }}>
          {resta < 120 ? `${resta} ${t('caratteri rimasti')}` : ''}
        </span>

        <div style={{ flex: 1 }} />
        {cambiato && (
          <Hov as="button" onClick={salva} disabled={salvando}
            style={{
              flex: 'none', padding: '6px 14px', borderRadius: 99, border: 'none',
              background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
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
        padding: '13px 0', borderTop: '1px solid rgba(34,39,31,.08)',
        opacity: storica ? 0.6 : 1
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '14.5px', lineHeight: 1.5, color: '#22271F', textWrap: 'pretty',
            textDecoration: storica ? 'line-through' : 'none'
          }}>{c.enunciato}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
            <Etichetta genere={c.genere} />
            {aspetta && (
              <span style={{ fontSize: '11.5px', color: '#8E3F1F' }}>{t('non la sto usando')}</span>
            )}
            <span style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.5)' }}>{quanto(c.fiducia)}</span>
            {c.ambito !== 'persona' && (
              // «cliente:Nick» è come sta scritto nel database, non come si legge
              <span style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.5)' }}>
                · {c.ambito === 'azienda' ? t('azienda') : c.ambito.replace(/^cliente:/, '')}
              </span>
            )}
            <span style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.4)' }}>
              · {t('da')} {t(c.origine)}
            </span>
            {storica && c.al && (
              <span style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.4)' }}>
                · {t('fino al')} {new Date(c.al).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            {haProva && (
              <Hov as="button" onClick={() => setAperta(a => !a)}
                style={{
                  border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '11.5px', color: 'rgba(34,39,31,.45)', display: 'inline-flex', alignItems: 'center', gap: 4
                }}
                hover={{ color: '#8E3F1F' }}>
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
              flex: 'none', border: '1px solid rgba(34,39,31,.16)', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '12px', color: '#22271F', padding: '4px 11px', borderRadius: 7
            }}
            hover={{ borderColor: 'rgba(34,39,31,.4)' }}>{t('Tienila')}</Hov>
        )}
        {/* scordare chiede una volta: è la sua testa, ma è una cosa che non torna */}
        {scorda && <Cestino fai={() => scorda(c.id)} titolo={t('Scordala')} visibile={attiva} />}
      </div>

      {aperta && (
        <div style={{
          marginTop: 9, padding: '10px 13px', borderRadius: 11,
          background: 'rgba(34,39,31,.04)', fontSize: '12.5px', lineHeight: 1.6, color: 'rgba(34,39,31,.7)',
          // la citazione è copiata da un documento: può essere un indirizzo lungo
          overflowWrap: 'anywhere'
        }}>
          {c.prova?.citazione && <div style={{ fontStyle: 'italic' }}>«{c.prova.citazione}»</div>}
          {c.premesse?.length ? (
            <div style={{ marginTop: c.prova?.citazione ? 7 : 0 }}>
              <div style={{ fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(34,39,31,.45)', marginBottom: 3 }}>
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
        <div style={{ marginTop: 16, fontSize: '13.5px', color: '#8E3F1F' }}>{t(guasto)}</div>
      </div>
    )
  }

  return (
    <div style={{ width: 720, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 4px 8px' }}>
        <div style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em' }}>{t('Memoria')}</div>
        <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.65)', marginTop: 8, maxWidth: 540, lineHeight: 1.6, textWrap: 'pretty' }}>
          {t('Quello che Myynd sa di te, separato da quello che ha letto. I documenti sono fatti; qui sta il giudizio, e puoi cambiarlo.')}
        </div>
      </div>

      {/* — i cinque blocchi — */}
      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '20px 24px 18px' }}>
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
              fontFamily: 'inherit', fontSize: '12px', color: '#8E3F1F',
              cursor: ordino ? 'default' : 'pointer'
            }}
            hover={ordino ? {} : { color: '#C4623B' }}>
            {ordino ? t('Ci penso…') : t('Aggiorna da quello che hai imparato')}
          </Hov>
        </div>
        {dettoRitratto && (
          <div style={{ fontSize: '12px', color: 'rgba(34,39,31,.5)', marginTop: 6 }}>{dettoRitratto}</div>
        )}
        {(d?.blocchi ?? []).map(b => <Campo key={b.etichetta} b={b} salvato={carica} />)}
        {!d && <div style={{ fontSize: '13px', color: 'rgba(34,39,31,.45)', padding: '14px 0' }}>{t('carico…')}</div>}
      </div>

      {/* — quello che ha capito da solo — */}
      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '20px 24px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ ...LABEL, flex: 1 }}>{t('Quello che ha capito')}</span>
          {/* mentre le rimette nella tua lingua: una riga, e poi sparisce */}
          {traduco && (
            <span style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.45)' }}>{t('Le rimetto nella tua lingua…')}</span>
          )}
          <span style={{ fontSize: '12px', color: 'rgba(34,39,31,.45)' }}>{d?.convinzioni.length ?? 0}</span>
        </div>

        {d && d.convinzioni.length === 0 && (
          <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.55)', marginTop: 12, lineHeight: 1.6, textWrap: 'pretty' }}>
            {t('Ancora niente. Impara parlandoti, e da quello che correggi delle sue bozze.')}
          </div>
        )}

        {/*
          * Quelle che aspettano stanno in cima, e con una riga che dice perché.
          * Senza, «non la sto usando» sarebbe una scritta senza spiegazione in
          * mezzo a un elenco — e la cosa da capire è che Myynd non le sta usando.
          */}
        {!!quanteInAttesa && (
          <div style={{ fontSize: '13px', color: 'rgba(34,39,31,.6)', marginTop: 12, lineHeight: 1.6, textWrap: 'pretty' }}>
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
              border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.7)',
              color: '#22271F', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none'
            }} />
          <button onClick={aggiungi} disabled={!nuova.trim()} style={{
            flex: 'none', padding: '10px 18px', borderRadius: 99, border: 'none',
            background: nuova.trim() ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.1)',
            color: nuova.trim() ? '#FFF7F0' : 'rgba(34,39,31,.3)',
            fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
            cursor: nuova.trim() ? 'pointer' : 'default'
          }}>{t('Aggiungi')}</button>
        </div>
      </div>

      {/* — quello che pensava prima — */}
      {!!d?.storiche.length && (
        <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '18px 24px' }}>
          <Hov as="button" onClick={() => setStoricheAperte(v => !v)} aria-expanded={storicheAperte}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none',
              background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left'
            }}
            hover={{ color: '#8E3F1F' }}>
            <span style={{ display: 'flex', transform: storicheAperte ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }}>
              <IconGiu size={10} stroke="currentColor" />
            </span>
            <span style={{ ...LABEL, flex: 1 }}>{t('Quello che pensava prima')}</span>
            <span style={{ fontSize: '12px', color: 'rgba(34,39,31,.45)' }}>{d.storiche.length}</span>
          </Hov>
          {storicheAperte && (
            <>
              <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.55)', marginTop: 10, lineHeight: 1.55, textWrap: 'pretty' }}>
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
