// Le impostazioni di un progetto: la sua riga, aperta.
//
// «Il progetto» era una riga con dentro un nome, un obiettivo e tre pastiglie,
// e tutto il resto di quello che il server sa di un progetto (gli altri nomi,
// il progetto dentro cui sta, le note, quello che Myynd ricorda) non aveva
// nessun posto dove essere scritto o corretto. Qui c'è quel posto.
//
// Tre scelte, e perché:
//
//   · si apre *dentro* la lista, non sopra. Un riquadro in mezzo allo schermo
//     nasconde gli altri progetti, e metà delle cose che si fanno qui, unire
//     due progetti o metterne uno dentro un altro, si decidono guardando gli
//     altri. La lista resta, la riga cresce.
//   · si salva lasciando il campo, con una spunta piccola che lo dice. Niente
//     bottone «Salva»: un bottone grosso in fondo a undici campi è la promessa
//     che se sbagli la pagina prima di premerlo hai perso tutto.
//   · ogni guaio sta sotto al suo campo. Una riga rossa in fondo alla schermata
//     dice che qualcosa non è andato, non dice cosa.

import { useEffect, useRef, useState } from 'react'
import {
  api, type CambioProgetto, type Progetto, type ProjectEvidence, type StatoProgetto
} from '../api'
import './project-evidence.css'
import { AttivitaProgetto } from '../components/AttivitaProgetto'
import { frasi, loc, t } from '../lingua'
import { Hov, LABEL } from '../ui'
import { IconGiu, IconSpunta } from '../icons'
import { COLORE_VALIDO, TAVOLOZZA, coloreProgetto } from '../colori-progetto'
import { SPIEGA_STATO, STATI, aggiungiAlias, aliasPuliti, togliAlias } from '../progetto-modifica'
import { portaAlleAttivita, siPuoAprireLeCose } from '../vals'
import { GRADIENTE, RAME, RAME_CUPO, SALVIA } from '../tema'

const INCHIOSTRO = '#22271F'
const SPENTO = 'rgba(34,39,31,.55)'
const APPENA = 'rgba(34,39,31,.42)'
const RIGA = '1px solid rgba(34,39,31,.08)'

/** Chi cambia un progetto: se il server dice di no, l'eccezione arriva a chi chiama. */
export type Cambia = (id: string, c: CambioProgetto) => Promise<void>

export const COLORE_STATO: Record<StatoProgetto, { testo: string; fondo: string }> = {
  attivo: { testo: '#2F4A33', fondo: 'rgba(126,156,130,.18)' },
  fermo: { testo: '#8A6317', fondo: 'rgba(216,164,110,.2)' },
  chiuso: { testo: 'rgba(34,39,31,.55)', fondo: 'rgba(34,39,31,.08)' }
}

const CASELLA = {
  width: '100%', boxSizing: 'border-box' as const, padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.75)',
  color: INCHIOSTRO, fontSize: '13.5px', lineHeight: 1.5, fontFamily: 'inherit', outline: 'none'
}

/** La spunta che dice «l'ho salvato», e se ne va da sola. */
function Tic({ mostra }: { mostra: boolean }) {
  return (
    <span aria-live="polite" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px',
      color: SALVIA, opacity: mostra ? 1 : 0, transition: 'opacity .35s'
    }}>
      {mostra && <><IconSpunta size={11} />{t('Salvato')}</>}
    </span>
  )
}

/** Un campo: la sua etichetta, la sua spunta, la sua riga di aiuto, il suo guaio. */
function Riquadro({ etichetta, aiuto, guaio, salvato, children }: {
  etichetta: string
  aiuto?: string
  guaio?: string
  salvato?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <span style={{ ...LABEL, flex: 'none' }}>{etichetta}</span>
        <Tic mostra={!!salvato} />
      </div>
      {children}
      {aiuto && (
        <div style={{ fontSize: '12px', color: APPENA, marginTop: 6, lineHeight: 1.55, textWrap: 'pretty' }}>{aiuto}</div>
      )}
      {guaio && (
        <div role="alert" style={{ fontSize: '12px', color: RAME_CUPO, marginTop: 6, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {t(guaio)}
        </div>
      )}
    </div>
  )
}

/**
 * Un elenco a tendina che sembra quello che è.
 *
 * L'aspetto di sistema stona con tutto il resto (su macOS è un controllo grigio
 * con il suo raggio e la sua ombra), ma togliendolo sparisce anche la freccia,
 * e un elenco senza freccia si legge come una casella di testo che non si
 * lascia scrivere. La freccia gliela rimettiamo noi, con l'icona dell'app.
 */
function Tendina({ children, ...resto }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <select {...resto} style={{ ...CASELLA, cursor: 'pointer', appearance: 'none', paddingRight: 36 }}>
        {children}
      </select>
      <span style={{
        position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', pointerEvents: 'none'
      }}>
        <IconGiu size={12} />
      </span>
    </span>
  )
}

/**
 * `x` sta dentro `radice`, anche passando per un progetto di mezzo.
 *
 * Serve a non far scegliere un padre che è già un figlio: due progetti che si
 * tengono dentro a vicenda sono un giro infinito per chiunque li legga, a
 * partire dal prompt.
 */
function discendeDa(x: Progetto, radice: string, tutti: Progetto[]): boolean {
  const visti = new Set<string>()
  let g = x.genitore ?? null
  while (g && !visti.has(g)) {
    if (g === radice) return true
    visti.add(g)
    g = tutti.find(y => y.id === g)?.genitore ?? null
  }
  return false
}

/**
 * Quello che Myynd ricorda di questo progetto: decisioni, lavoro, cose notate.
 *
 * Si carica solo aperto, e quello che non vale più resta visibile senza
 * sembrare attuale. Non c'è nessun «scordalo»: il server queste righe non le
 * cancella, e un bottone che non fa niente sarebbe peggio di nessun bottone.
 */
function MemoriaProgetto({ p }: { p: Progetto }) {
  const [aperto, setAperto] = useState(false)
  const [righe, setRighe] = useState<ProjectEvidence[] | null>(null)
  const [guasto, setGuasto] = useState(false)
  const en = loc().startsWith('en')
  useEffect(() => {
    if (!aperto) return
    let vivo = true
    setGuasto(false)
    api.memoriaProgetto(p.id).then(r => { if (vivo) setRighe(r.records) }).catch(() => { if (vivo) setGuasto(true) })
    return () => { vivo = false }
  }, [aperto, p.id, p.aggiornato])

  const provenienza: Record<ProjectEvidence['provenance'], string> = {
    'user-field': en ? 'You saved this' : 'Salvato da te',
    'user-chat': en ? 'You said this in chat' : 'Dalla tua chat',
    'source-inference': en ? 'Inferred from a source' : 'Dedotto da una fonte',
    'task-record': en ? 'Recorded work outcome' : 'Risultato del lavoro'
  }
  const genere: Record<ProjectEvidence['kind'], string> = {
    goal: en ? 'Goal' : 'Obiettivo', note: en ? 'Note' : 'Nota', decision: en ? 'Decision' : 'Decisione',
    observation: en ? 'Observation' : 'Osservazione', work: en ? 'Work' : 'Lavoro'
  }
  const data = (v: string) => Number.isFinite(Date.parse(v))
    ? new Date(v).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })
    : (en ? 'Date unknown' : 'Data sconosciuta')

  const riga = (r: ProjectEvidence) => (
    <li key={r.id} className="project-evidence-item" data-history={!!r.supersededBy}>
      <div className="project-evidence-meta">
        <strong>{genere[r.kind]}</strong>
        <span>{r.supersededBy ? (en ? 'Replaced' : 'Sostituito') : r.stale ? (en ? 'Needs rechecking' : 'Da ricontrollare') : (en ? 'Current record' : 'Attuale')}</span>
      </div>
      <p>{r.value || (en ? 'Removed from the current project' : 'Rimosso dal progetto')}</p>
      <div className="project-evidence-origin">
        {provenienza[r.provenance]} · <time dateTime={r.evidenceAt || undefined}>{data(r.evidenceAt)}</time>
      </div>
      {r.stale && (
        <small className="project-evidence-warning">
          {en ? 'Not used as current knowledge. The source or task changed, is missing, or is too old.'
            : 'Non usato come informazione attuale: fonte o attività cambiata, mancante o datata.'}
        </small>
      )}
      {r.quote && r.quote !== r.value && <blockquote>{r.quote}</blockquote>}
    </li>
  )

  const attuali = righe?.filter(r => !r.supersededBy) ?? []
  const prima = righe?.filter(r => r.supersededBy) ?? []
  return (
    <details className="project-evidence" onToggle={e => setAperto(e.currentTarget.open)}>
      <summary>{en ? 'What Myynd remembers' : 'Cosa ricorda Myynd'} {righe ? <small>{attuali.length}</small> : null}</summary>
      {guasto
        ? <p role="alert">{en ? 'Could not load this project’s memory. Close and reopen to retry.' : 'Memoria non disponibile. Chiudi e riapri per riprovare.'}</p>
        : !righe
          ? <p role="status">{en ? 'Loading…' : 'Caricamento…'}</p>
          : <>
            {!righe.length && <p>{en ? 'No evidence history yet. Your saved goal and notes remain above.' : 'Nessuna cronologia. Obiettivo e note restano salvati.'}</p>}
            <ul className="project-evidence-list">{attuali.map(riga)}</ul>
            {!!prima.length && (
              <details className="project-evidence-history">
                <summary>{en ? 'Previous versions' : 'Versioni precedenti'} <small>{prima.length}</small></summary>
                <ul className="project-evidence-list">{prima.map(riga)}</ul>
              </details>
            )}
          </>}
    </details>
  )
}

/**
 * L'editor vero: undici cose, ognuna che si salva per conto suo.
 *
 * `cambia` butta l'eccezione del server invece di mangiarsela: è l'unico modo
 * per cui il messaggio «Esiste già un progetto con questo nome» possa comparire
 * sotto al campo del nome, dove serve, invece che in fondo alla schermata.
 */
export function ProgettoEditor({ p, tutti, cambia, unisci, elimina }: {
  p: Progetto
  tutti: Progetto[]
  cambia: Cambia
  unisci: (id: string, dentro: string) => Promise<void>
  elimina: (id: string) => Promise<void>
}) {
  const [guai, setGuai] = useState<Record<string, string>>({})
  const [fatti, setFatti] = useState<Record<string, boolean>>({})
  const orologi = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  useEffect(() => {
    const suoi = orologi.current
    return () => { for (const k of Object.keys(suoi)) clearTimeout(suoi[k]) }
  }, [])

  /** Manda un cambiamento, e tiene il conto di com'è andata per *quel* campo. */
  const manda = async (campo: string, c: CambioProgetto) => {
    try {
      await cambia(p.id, c)
      setGuai(g => ({ ...g, [campo]: '' }))
      setFatti(f => ({ ...f, [campo]: true }))
      clearTimeout(orologi.current[campo])
      orologi.current[campo] = setTimeout(() => setFatti(f => ({ ...f, [campo]: false })), 2400)
    } catch (e) {
      setGuai(g => ({ ...g, [campo]: e instanceof Error ? e.message : String(e) }))
    }
  }
  const segnala = (campo: string, guaio: string) => setGuai(g => ({ ...g, [campo]: guaio }))

  // — il nome e l'obiettivo: si scrivono, si lascia il campo, sono salvati —
  const [nome, setNome] = useState(p.nome)
  const [obiettivo, setObiettivo] = useState(p.obiettivo)
  useEffect(() => { setNome(p.nome) }, [p.nome])
  useEffect(() => { setObiettivo(p.obiettivo) }, [p.obiettivo])

  const salvaNome = () => {
    const v = nome.trim()
    if (v === p.nome.trim()) return
    if (!v) return segnala('nome', 'Un progetto ha bisogno di un nome.')
    void manda('nome', { nome: v })
  }
  const salvaObiettivo = () => {
    const v = obiettivo.trim()
    if (v !== p.obiettivo.trim()) void manda('obiettivo', { obiettivo: v })
  }

  // — il colore: otto tinte, e una scritta a mano —
  const colore = coloreProgetto(p, tutti)
  const [scritto, setScritto] = useState(p.colore)
  useEffect(() => { setScritto(p.colore) }, [p.colore])
  const salvaColore = () => {
    const v = scritto.trim()
    if (v === p.colore) return
    if (v && !COLORE_VALIDO.test(v)) return segnala('colore', 'Il colore di un progetto si scrive #RRGGBB.')
    void manda('colore', { colore: v })
  }

  // — gli altri nomi —
  const alias = aliasPuliti(p.alias ?? [], p.nome)
  const [altroNome, setAltroNome] = useState('')
  const aggiungiNome = () => {
    const r = aggiungiAlias(alias, altroNome, p.nome)
    if (r.guaio) return segnala('alias', r.guaio)
    setAltroNome('')
    segnala('alias', '')
    if (r.alias.length !== alias.length) void manda('alias', { alias: r.alias })
  }

  // — il progetto dentro cui sta: mai sé stesso, mai uno dei suoi —
  const padri = tutti.filter(x => x.id !== p.id && x.stato === 'attivo' && !discendeDa(x, p.id, tutti))
  const padre = tutti.find(x => x.id === p.genitore) ?? null

  // — le note: quelle di prima restano dove sono, la nuova arriva datata —
  const [nota, setNota] = useState('')
  const aggiungiNota = () => {
    const testo = nota.trim()
    if (!testo) return
    const data = new Date().toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })
    setNota('')
    void manda('note', { note: (p.note ? `${p.note}\n\n` : '') + `${data}\n${testo}` })
  }

  // — unire, e togliere —
  const [dentroChi, setDentroChi] = useState('')
  const [unisco, setUnisco] = useState(false)
  const bersaglio = tutti.find(x => x.id === dentroChi) ?? null
  const altri = tutti.filter(x => x.id !== p.id && x.stato !== 'chiuso')
  const [chiedoDiTogliere, setChiedoDiTogliere] = useState(false)
  const [tolgo, setTolgo] = useState(false)

  const facciamoUno = async () => {
    if (!bersaglio || unisco) return
    setUnisco(true)
    try { await unisci(p.id, bersaglio.id); segnala('unisci', ''); setDentroChi('') }
    catch (e) { segnala('unisci', e instanceof Error ? e.message : String(e)) }
    finally { setUnisco(false) }
  }
  const togli = async () => {
    if (tolgo) return
    setTolgo(true)
    try { await elimina(p.id); segnala('elimina', ''); setChiedoDiTogliere(false) }
    catch (e) { segnala('elimina', e instanceof Error ? e.message : String(e)) }
    finally { setTolgo(false) }
  }

  const chiuso = p.stato === 'chiuso'

  return (
    <div id={`editor-${p.id}`} style={{ padding: '4px 4px 22px 25px' }}>
      <Riquadro etichetta={t('Nome')} guaio={guai.nome} salvato={fatti.nome}>
        <input value={nome} onChange={e => setNome(e.target.value)} onBlur={salvaNome}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          aria-label={t('Nome')} style={CASELLA} />
      </Riquadro>

      <Riquadro etichetta={t('Obiettivo')} salvato={fatti.obiettivo} guaio={guai.obiettivo}
        aiuto={t('Com’è fatto quando è finito, in una riga. È la frase che decide cosa conta.')}>
        <input value={obiettivo} onChange={e => setObiettivo(e.target.value.replace(/\n/g, ' ').slice(0, 200))}
          onBlur={salvaObiettivo} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder={t('Chiudere il round entro ottobre')} aria-label={t('Obiettivo')} style={CASELLA} />
      </Riquadro>

      {/* i tre stati, ognuno con la riga che dice cosa cambia sulla prima pagina */}
      <Riquadro etichetta={t('Stato')} salvato={fatti.stato} guaio={guai.stato}>
        <div role="radiogroup" aria-label={t('Stato')}>
          {STATI.map(s => {
            const suo = p.stato === s
            return (
              <Hov key={s} as="button" type="button" role="radio" aria-checked={suo}
                onClick={() => { if (!suo) void manda('stato', { stato: s }) }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%', textAlign: 'left',
                  padding: '11px 13px', borderRadius: 10, marginTop: 7, cursor: suo ? 'default' : 'pointer',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                  border: `1px solid ${suo ? 'rgba(196,98,59,.38)' : 'rgba(34,39,31,.1)'}`,
                  background: suo ? 'rgba(196,98,59,.08)' : 'transparent'
                }}
                hover={suo ? {} : { borderColor: 'rgba(34,39,31,.3)' }}>
                <span style={{
                  flex: 'none', width: 13, height: 13, borderRadius: '50%', marginTop: 2,
                  border: `1px solid ${suo ? RAME : 'rgba(34,39,31,.3)'}`,
                  background: suo ? RAME : 'transparent',
                  boxShadow: suo ? 'inset 0 0 0 2.5px rgba(255,253,249,.92)' : 'none'
                }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 500, color: INCHIOSTRO, textTransform: 'capitalize' }}>{t(s)}</span>
                  <span style={{ display: 'block', fontSize: '12.5px', color: SPENTO, marginTop: 3, lineHeight: 1.5, textWrap: 'pretty' }}>
                    {t(SPIEGA_STATO[s])}
                  </span>
                </span>
              </Hov>
            )
          })}
        </div>
      </Riquadro>

      {/* il colore: quello con cui la prima pagina veste la carta di questo progetto */}
      <Riquadro etichetta={t('Colore')} salvato={fatti.colore} guaio={guai.colore}
        aiuto={t('Senza sceglierne uno, Myynd gliene dà uno suo, diverso da quello degli altri.')}>
        <div role="radiogroup" aria-label={t('Colore')} style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {TAVOLOZZA.map(c => (
            <Hov key={c} as="button" type="button" role="radio" aria-checked={c === colore} title={c} aria-label={c}
              onClick={() => { setScritto(c); if (c !== p.colore) void manda('colore', { colore: c }) }}
              style={{
                width: 22, height: 22, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer',
                border: '2px solid rgba(255,255,255,.9)',
                boxShadow: c === colore ? `0 0 0 2px ${c}` : '0 0 0 1px rgba(34,39,31,.15)'
              }}
              hover={{ boxShadow: `0 0 0 2px ${c}` }} />
          ))}
          <input value={scritto} onChange={e => setScritto(e.target.value)} onBlur={salvaColore}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            aria-label={t('Un altro colore, scritto #RRGGBB')} spellCheck={false} placeholder={colore}
            style={{ ...CASELLA, width: 108, flex: 'none', fontSize: '12.5px', letterSpacing: '.02em' }} />
        </div>
      </Riquadro>

      {/* gli altri nomi: le cartelle e i soprannomi con cui lo chiama davvero */}
      <Riquadro etichetta={t('Altri nomi')} salvato={fatti.alias} guaio={guai.alias}
        aiuto={t('Le cartelle e i soprannomi con cui lo chiami: così Myynd lo riconosce anche scritto in un altro modo.')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {alias.map(a => (
            <span key={a} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
              padding: '4px 5px 4px 11px', borderRadius: 99, background: 'rgba(34,39,31,.05)',
              border: '1px solid rgba(34,39,31,.1)', fontSize: '12.5px', color: INCHIOSTRO
            }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{a}</span>
              <Hov as="button" type="button" title={t('Togli questo nome')} aria-label={t('Togli questo nome')}
                onClick={() => void manda('alias', { alias: togliAlias(alias, a) })}
                style={{
                  flex: 'none', width: 18, height: 18, borderRadius: '50%', border: 'none', padding: 0,
                  background: 'none', cursor: 'pointer', color: APPENA, fontFamily: 'inherit',
                  fontSize: '14px', lineHeight: 1, display: 'grid', placeItems: 'center'
                }}
                hover={{ background: 'rgba(196,98,59,.14)', color: RAME_CUPO }}>×</Hov>
            </span>
          ))}
          <input value={altroNome} onChange={e => setAltroNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aggiungiNome() } }}
            onBlur={aggiungiNome} placeholder={t('Un altro nome: «everwave»')} aria-label={t('Un altro nome')}
            style={{ ...CASELLA, flex: '1 1 200px', minWidth: 0, fontSize: '12.5px', padding: '7px 11px' }} />
        </div>
      </Riquadro>

      {/* dentro quale progetto sta: H-Brain è uno spin-off di Myynd, non un progetto a parte */}
      <Riquadro etichetta={t('Dentro')} salvato={fatti.genitore} guaio={guai.genitore}
        aiuto={t('Se è un pezzo di un progetto più grande, dillo qui: Myynd li legge insieme.')}>
        <Tendina value={p.genitore ?? ''} aria-label={t('Dentro')}
          onChange={e => void manda('genitore', { genitore: e.target.value || null })}>
          <option value="">{t('Nessuno')}</option>
          {padri.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
          {/* un padre fermo o chiuso resta scritto: toglierlo dall'elenco lo cancellerebbe in silenzio */}
          {padre && !padri.some(x => x.id === padre.id) && <option value={padre.id}>{padre.nome}</option>}
        </Tendina>
      </Riquadro>

      {/* le note: si aggiunge, non si riscrive */}
      <Riquadro etichetta={t('Note')} salvato={fatti.note} guaio={guai.note}
        aiuto={t('Quello che scrivi si aggiunge in fondo, con la data di oggi. Quello di prima resta dov’è.')}>
        {p.note && (
          <div style={{
            whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '13px', lineHeight: 1.65,
            color: 'rgba(34,39,31,.72)', background: 'rgba(34,39,31,.035)', borderRadius: 10,
            padding: '12px 14px', marginBottom: 8
          }}>{p.note}</div>
        )}
        <textarea value={nota} onChange={e => setNota(e.target.value)} onBlur={aggiungiNota}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) aggiungiNota() }}
          rows={2} aria-label={t('Aggiungi una nota')}
          placeholder={t('Aggiungi una nota')}
          style={{ ...CASELLA, resize: 'vertical' }} />
      </Riquadro>

      {/* quello che Myynd ricorda, e le attività: si guardano, non si scrivono qui */}
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: RIGA }}>
        <MemoriaProgetto p={p} />
        <AttivitaProgetto id={p.id} chiuso={chiuso} />
        {siPuoAprireLeCose() && (
          <Hov as="button" type="button" onClick={() => portaAlleAttivita()}
            style={{
              border: 'none', background: 'none', padding: '8px 0 0', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '12.5px', color: RAME_CUPO
            }}
            hover={{ color: RAME }}>{t('Aprile in Da fare')}</Hov>
        )}
      </div>

      {/* — unire due progetti che erano lo stesso progetto — */}
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: RIGA }}>
        <Riquadro etichetta={t('Unisci in un altro')} guaio={guai.unisci}
          aiuto={altri.length ? undefined : t('Non c’è nessun altro progetto in cui unirlo.')}>
          {!!altri.length && (
            <Tendina value={dentroChi} onChange={e => { setDentroChi(e.target.value); segnala('unisci', '') }}
              aria-label={t('Unisci in un altro')}>
              <option value="">{t('Scegli un progetto')}</option>
              {altri.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </Tendina>
          )}
          {bersaglio && (
            <>
              <div style={{ fontSize: '12.5px', color: SPENTO, marginTop: 9, lineHeight: 1.6, textWrap: 'pretty' }}>
                {frasi.unisciDentro(p.nome, bersaglio.nome)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 11 }}>
                <Hov as="button" type="button" onClick={facciamoUno} disabled={unisco}
                  style={{
                    flex: 'none', padding: '9px 18px', borderRadius: 99, border: 'none', background: GRADIENTE,
                    color: '#FFF7F0', fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
                    cursor: unisco ? 'default' : 'pointer'
                  }}
                  hover={unisco ? {} : { opacity: 0.92 }}>
                  {unisco ? t('Unisco…') : t('Unisci')}
                </Hov>
              </div>
            </>
          )}
        </Riquadro>
      </div>

      {/* — toglierlo del tutto: in fondo, e scritto, mai un bottone pieno — */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: RIGA }}>
        {!chiedoDiTogliere ? (
          <Hov as="button" type="button" onClick={() => { setChiedoDiTogliere(true); segnala('elimina', '') }}
            style={{
              border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '12.5px', color: APPENA
            }}
            hover={{ color: RAME_CUPO }}>{t('Elimina il progetto')}</Hov>
        ) : (
          <>
            <div style={{ fontSize: '12.5px', color: SPENTO, lineHeight: 1.6, textWrap: 'pretty' }}>
              {frasi.eliminoProgetto(p.nome)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
              <Hov as="button" type="button" onClick={togli} disabled={tolgo}
                style={{
                  border: 'none', background: 'none', padding: 0, cursor: tolgo ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, color: RAME_CUPO
                }}
                hover={tolgo ? {} : { color: RAME }}>{tolgo ? t('Tolgo…') : t('Eliminalo davvero')}</Hov>
              <Hov as="button" type="button" onClick={() => setChiedoDiTogliere(false)}
                style={{
                  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '12.5px', color: APPENA
                }}
                hover={{ color: INCHIOSTRO }}>{t('Lascia stare')}</Hov>
            </div>
          </>
        )}
        {guai.elimina && (
          <div role="alert" style={{ fontSize: '12px', color: RAME_CUPO, marginTop: 8, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
            {t(guai.elimina)}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * La riga di un progetto nella lista, e il suo editor quando è aperta.
 *
 * Chiusa dice quattro cose e basta: il colore, il nome, dove punta, come sta.
 * Undici campi sempre aperti per otto progetti non sono una lista, sono un
 * modulo lungo due schermi.
 */
export function RigaProgetto({ p, tutti, cambia, unisci, elimina, aperta, apri, acceso }: {
  p: Progetto
  /** Gli altri: il colore assegnato a chi non l'ha scelto non deve ripetere il loro. */
  tutti: Progetto[]
  cambia: Cambia
  unisci: (id: string, dentro: string) => Promise<void>
  elimina: (id: string) => Promise<void>
  aperta: boolean
  apri: () => void
  /** Arrivato adesso da una riga della lista: un anello di rame per un attimo, e basta. */
  acceso?: boolean
}) {
  const colore = coloreProgetto(p, tutti)
  const chiuso = p.stato === 'chiuso'
  const padre = tutti.find(x => x.id === p.genitore) ?? null

  return (
    // l'id è la maniglia con cui la prima pagina porta questa riga sotto gli occhi
    <div id={`progetto-${p.id}`} style={{
      borderTop: RIGA,
      // l'anello sta fuori dal flusso: acceso non sposta di un pixel quello che c'è sotto
      borderRadius: 12, outline: acceso ? `2px solid ${RAME}` : '2px solid transparent',
      outlineOffset: 4, transition: 'outline-color .3s'
    }}>
      <Hov as="button" type="button" onClick={apri} aria-expanded={aperta} aria-controls={`editor-${p.id}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%', boxSizing: 'border-box',
          padding: '13px 10px 13px 4px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: aperta ? 'rgba(34,39,31,.04)' : 'transparent', fontFamily: 'inherit', textAlign: 'left',
          opacity: chiuso && !aperta ? 0.6 : 1
        }}
        hover={aperta ? {} : { background: 'rgba(34,39,31,.035)' }}>
        <span style={{
          flex: 'none', width: 13, height: 13, borderRadius: '50%', background: colore,
          border: '2px solid rgba(255,255,255,.9)', boxShadow: '0 0 0 1px rgba(34,39,31,.15)'
        }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{
              minWidth: 0, fontSize: '14.5px', fontWeight: 500, color: INCHIOSTRO, overflowWrap: 'anywhere',
              textDecoration: chiuso ? 'line-through' : 'none'
            }}>{p.nome}</span>
            {padre && (
              <span style={{ flex: 'none', fontSize: '11.5px', color: APPENA, whiteSpace: 'nowrap' }}>
                {frasi.dentroProgetto(padre.nome)}
              </span>
            )}
          </span>
          <span style={{
            display: 'block', fontSize: '12.5px', color: 'rgba(34,39,31,.5)', marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>{p.obiettivo || t('Obiettivo non ancora scritto.')}</span>
        </span>
        {p.origine === 'punto' && !chiuso && (
          <span style={{ flex: 'none', fontSize: '11.5px', color: APPENA, whiteSpace: 'nowrap' }}>{t('riconosciuto dal punto')}</span>
        )}
        {/* attivo è il modo normale di stare di un progetto: una pastiglia verde
            su ognuno non distingue niente, e il colore qui dentro è uno solo.
            La pastiglia compare nel momento in cui vuol dire qualcosa. */}
        {p.stato !== 'attivo' && (
          <span style={{
            flex: 'none', fontSize: '10.5px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
            color: COLORE_STATO[p.stato].testo, background: COLORE_STATO[p.stato].fondo
          }}>{t(p.stato)}</span>
        )}
        <span style={{ flex: 'none', display: 'flex', transform: aperta ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }}>
          <IconGiu size={11} />
        </span>
      </Hov>
      {aperta && <ProgettoEditor p={p} tutti={tutti} cambia={cambia} unisci={unisci} elimina={elimina} />}
    </div>
  )
}
