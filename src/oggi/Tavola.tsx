// La bacheca (F1): la lista, lavorata.
//
// La stessa lista del calendario e dell'elenco, vista come la vede chi la
// lavora: le tue a sinistra, poi quelle di Myynd nell'ordine in cui passano
// di mano — in coda, al lavoro, aspetta te, fatte. Si trascina una carta
// dalle tue a Myynd ed è affidata; indietro, è tua di nuovo. Nient'altro si
// trascina: una carta non si «mette» al lavoro o fra le fatte, ci arriva.
//
// Ogni carta di Myynd porta il suo «fatto»: la riga contro cui il lavoro
// viene controllato prima di dirlo pronto. Si legge sulla carta, e si
// riscrive con un clic: scritta da lei, resta sua.
//
// Poche parole, come nella lista. I nomi delle corsie, i conti, il
// criterio, e sulle fatte la prova. Nessun paragrafo che spiega.

import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type Compito, type ManoCompito, type PassoCompito, type Progetto, type StatoTurno } from '../api'
import { frasi, t } from '../lingua'
import { Cestino } from '../ui'
import { Casella } from '../components/forme'
import { coloreProgetto } from '../colori-progetto'
import type { Lista } from './useCompiti'
import { secchioDelGiorno } from './giorni'
import { CORSIE, consegnata, cosaAspetta, perCorsia, provenienza, quandoParte, SI_LASCIA, staControllando, type Corsia, type Provenienza } from './bacheca'
import './tavola.css'

const NOME_CORSIA: Record<Corsia, string> = {
  tue: 'Tue',
  coda: 'Pronte per Myynd',
  lavora: 'Al lavoro',
  attende: 'Aspetta te',
  fatte: 'Fatte'
}

const NOME_MANO: Record<ManoCompito, string> = {
  posta: 'Bozza nella casella',
  file: 'File sul disco',
  nota: 'Nota',
  web: 'Web',
  codice: 'Codice, in una copia'
}

const NOME_PROVENIENZA: Record<Provenienza, string> = {
  posta: 'Dalla posta',
  riunione: 'Da una riunione',
  tu: 'Scritta da te',
  myynd: 'Da Myynd',
  seguito: 'Il passo dopo',
  automazione: 'Da un’automazione',
  feed: 'Dal feed'
}

/** Il passo, detto nella lingua di chi legge. */
export function frasePassoTavola(p: PassoCompito): string {
  if (p.passo === 'cerco') return frasi.passoCerco(p.dettaglio ?? '')
  if (p.passo === 'apro') return frasi.passoApro(p.dettaglio ?? '')
  if (p.passo === 'rileggo') return t('Controllo contro il suo «fatto»')
  if (p.passo === 'preparo') return t('Preparo…')
  return t('Scrivo…')
}

/** L'ora di un istante, se è di oggi; se no il giorno. Corta, da carta. */
function quandoCorto(iso: string | null | undefined, oggi: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  const giorno = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  if (giorno === oggi) return `${p(d.getHours())}:${p(d.getMinutes())}`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function Tavola({ l, oggi, modifica, apri }: {
  l: Lista
  oggi: string
  /** Apre il dettaglio della carta: il testo, il giorno, il «fatto», il diario. */
  modifica: (c: Compito) => void
  /** Apre il lavoro consegnato o la domanda, sotto la bacheca. */
  apri: (c: Compito) => void
}) {
  const corsie = useMemo(() => perCorsia(l.compiti, l.passi, l.chiusi, oggi), [l.compiti, l.passi, l.chiusi, oggi])
  const [progetti, setProgetti] = useState<Progetto[]>([])
  useEffect(() => {
    let vivo = true
    api.progetti().then(r => { if (vivo) setProgetti(r.progetti) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  const [trascinata, setTrascinata] = useState<string | null>(null)
  const [sopra, setSopra] = useState<Corsia | null>(null)

  /*
   * Lasciare una carta: a Myynd, o a te. A Myynd vale solo per una carta
   * aperta (una domanda o un lavoro consegnato non si «rimettono in coda»:
   * si rispondono o si cambiano); a te vale da qualunque corsia.
   */
  const lascia = (id: string, dove: Corsia) => {
    const c = l.compiti.find(x => x.id === id)
    if (!c) return
    if (dove === 'coda' && c.stato === 'aperto' && (c.modo === 'io' || !c.modo || !!c.guaio)) void l.mettiInCoda(id)
    else if (dove === 'tue' && (c.stato !== 'aperto' || (c.modo && c.modo !== 'io'))) l.richiama(id)
  }

  return (
    <section className="tavola" aria-label={t('Bacheca')}>
      {l.turno && <RigaTurno s={l.turno} l={l} />}
      <div className="tavola-corsie">
        {CORSIE.map(corsia => {
          const carte = corsia === 'fatte' ? corsie.fatte : corsie[corsia]
          const accetta = SI_LASCIA.includes(corsia)
          return (
            <section key={corsia} data-corsia={corsia}
              className={['tavola-corsia', trascinata && accetta ? 'accetta' : '', sopra === corsia ? 'sopra' : ''].filter(Boolean).join(' ')}
              aria-labelledby={`tavola-${corsia}`}
              onDragOver={e => { if (!accetta || !trascinata) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (sopra !== corsia) setSopra(corsia) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSopra(s => (s === corsia ? null : s)) }}
              onDrop={e => {
                if (!accetta) return
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain') || trascinata
                setSopra(null); setTrascinata(null)
                if (id) lascia(id, corsia)
              }}>
              <header>
                <h3 id={`tavola-${corsia}`}>{t(NOME_CORSIA[corsia])}</h3>
                <span className="tavola-conto" aria-label={`${carte.length}`}>{carte.length}</span>
              </header>
              <ul className="tavola-carte">
                {carte.map(c => (
                  <CartaTavola key={c.id} c={c} corsia={corsia} l={l} oggi={oggi} passo={l.passi[c.id]}
                    progetto={progetti.find(p => p.id === c.progetto) ?? null} progetti={progetti}
                    modifica={modifica} apri={apri}
                    trascina={id => setTrascinata(id)} lasciaAndare={() => { setTrascinata(null); setSopra(null) }}
                    trascinata={trascinata === c.id} />
                ))}
              </ul>
              {corsia === 'tue' && <Aggiungi l={l} oggi={oggi} />}
              {corsia === 'coda' && trascinata && !carte.length && <div className="tavola-posa" aria-hidden="true">{t('A Myynd')}</div>}
            </section>
          )
        })}
      </div>
    </section>
  )
}

function CartaTavola({ c, corsia, l, oggi, passo, progetto, progetti, modifica, apri, trascina, lasciaAndare, trascinata }: {
  c: Compito; corsia: Corsia; l: Lista; oggi: string; passo?: PassoCompito
  progetto: Progetto | null; progetti: Progetto[]
  modifica: (c: Compito) => void; apri: (c: Compito) => void
  trascina: (id: string) => void; lasciaAndare: () => void; trascinata: boolean
}) {
  const chiusa = c.stato === 'fatto'
  const diMyynd = corsia !== 'tue' && !chiusa
  const controlla = corsia === 'lavora' && staControllando(passo)
  const prov = provenienza(c)
  const classi = ['tavola-carta', `in-${corsia}`, controlla ? 'controlla' : '', chiusa ? 'chiusa' : '', trascinata ? 'trascinata' : '',
    corsia === 'fatte' && c.prova?.esito === 'pass' ? 'provata' : ''].filter(Boolean).join(' ')
  const siTrascina = !chiusa && (corsia === 'tue' || corsia === 'coda' || corsia === 'attende' || corsia === 'fatte')
  const aspetta = corsia === 'attende' ? cosaAspetta(c) : ''
  const cosa = consegnata(c)
  return (
    <li className={classi} draggable={siTrascina}
      onDragStart={e => { if (!siTrascina) return; e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; trascina(c.id) }}
      onDragEnd={lasciaAndare}>
      <div className="tavola-testa">
        {progetto && <span className="tavola-progetto"><i style={{ background: coloreProgetto(progetto, progetti) }} />{progetto.nome}</span>}
        {/* da dove viene serve finché la carta è da fare; fatta, conta cosa è diventata */}
        {!progetto && prov !== 'tu' && corsia !== 'fatte' && <span className="tavola-da">{t(NOME_PROVENIENZA[prov])}</span>}
        {progetto && prov !== 'tu' && corsia !== 'fatte' && <span className="tavola-da">· {t(NOME_PROVENIENZA[prov])}</span>}
        {corsia === 'fatte' && c.turno?.notte
          ? <span className="tavola-ora tavola-notte" title={t('Fatta stanotte, mentre dormivi')}><i aria-hidden="true">☾</i>{t('Fatta stanotte')}</span>
          : <span className="tavola-ora">{quandoCorto(corsia === 'fatte' ? (c.chiuso ?? c.aggiornato) : corsia === 'lavora' ? c.chiesto : null, oggi)}</span>}
      </div>

      <button type="button" className="tavola-titolo" onClick={() => (corsia === 'attende' || (corsia === 'fatte' && !chiusa) ? apri(c) : modifica(c))}>
        {chiusa && <span className="tavola-spunta" aria-hidden="true">✓</span>}
        {c.testo}
      </button>

      {diMyynd && <Fatto c={c} l={l} />}

      {diMyynd && !!c.contratto?.mani.length && corsia !== 'fatte' && (
        <div className="tavola-mani" aria-label={t('Mani')}>
          {c.contratto.mani.map(m => <span key={m}>{t(NOME_MANO[m])}</span>)}
        </div>
      )}

      {corsia === 'coda' && <Quando c={c} s={l.turno} />}

      {corsia === 'lavora' && passo && (
        <p className={`tavola-passo${controlla ? ' controlla' : ''}`} aria-live="polite">
          <i aria-hidden="true" />{frasePassoTavola(passo)}
        </p>
      )}

      {corsia === 'attende' && aspetta && <p className="tavola-aspetta">{t(aspetta)}</p>}

      {corsia === 'fatte' && !chiusa && (
        <div className="tavola-prova">
          {c.prova?.esito === 'pass' && <p className="si"><span aria-hidden="true">✓</span>{c.prova.perche || t('Controllata contro il suo «fatto».')}</p>}
          {c.prova?.esito === 'unavailable' && <p className="forse">{t('Non controllata: rileggila prima di usarla.')}</p>}
          {!c.prova && <p className="forse">{t('Pronta da guardare.')}</p>}
          {cosa.tipo === 'file' && cosa.nome && <p className="tavola-cosa">{cosa.nome}</p>}
          {cosa.tipo === 'casella' && <p className="tavola-cosa">{t('Bozza nella tua casella')}</p>}
        </div>
      )}

      {(corsia === 'attende' || (corsia === 'fatte' && !chiusa)) && (
        <div className="tavola-gesti">
          <button type="button" className="tavola-gesto pieno" onClick={() => apri(c)}>
            {corsia === 'fatte' ? t('Apri') : (c.stato === 'chiede' || c.chieste?.length) ? t('Rispondi') : c.prova?.esito === 'fail' ? t('Completala') : t('Guarda')}
          </button>
        </div>
      )}

      {/* I gesti che servono ogni tanto: sopra la carta, quando è sotto la mano.
          Non tengono posto: una carta ferma è alta quanto quello che dice. */}
      {!chiusa && corsia !== 'fatte' && corsia !== 'attende' && (
        <div className="tavola-sopra">
          {corsia === 'tue' && <button type="button" className="tavola-gesto" onClick={() => { void l.mettiInCoda(c.id) }}>{t('A Myynd')}</button>}
          {corsia === 'coda' && c.stato === 'aperto' && <button type="button" className="tavola-gesto" onClick={() => l.delega(c.id, c.modo && c.modo !== 'io' ? c.modo : 'tutto')}>{t('Adesso')}</button>}
          {(corsia === 'coda' || corsia === 'lavora') && <button type="button" className="tavola-gesto" onClick={() => l.richiama(c.id)}>{t('Riprendila')}</button>}
          {corsia === 'tue' && <Cestino fai={() => l.elimina(c.id)} titolo={t('Toglila')} dim={24} icona={11} subito />}
        </div>
      )}
    </li>
  )
}

/**
 * Il «fatto» della carta, sulla carta.
 *
 * Si legge in una riga. Un clic e si scrive: Invio salva, Esc lascia com'era,
 * uscire dal campo salva se è cambiato. Scritto da lei, resta suo — e la
 * carta lo dice con una parola sola, «tuo». Una carta di Myynd che non ne ha
 * ancora uno lo chiede a Myynd con un tocco.
 */
function Fatto({ c, l }: { c: Compito; l: Lista }) {
  const k = c.contratto
  const [scrivo, setScrivo] = useState(false)
  const [testo, setTesto] = useState(k?.criterio ?? '')
  const [chiedo, setChiedo] = useState(false)
  const scatola = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!scrivo) setTesto(k?.criterio ?? '') }, [k?.criterio, scrivo])
  useEffect(() => {
    if (!scrivo) return
    const el = scatola.current?.querySelector('textarea')
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [scrivo])
  /*
   * Uscire salva, se è cambiato. Vuoto non salva mai da qui: Esc nella
   * casella svuota, e un «fatto» scritto da lei non deve sparire per un tasto.
   * Per toglierlo c'è il dettaglio della carta.
   */
  const salva = () => {
    const nuovo = testo.trim()
    setScrivo(false)
    if (!nuovo || nuovo === (k?.criterio ?? '').trim()) { setTesto(k?.criterio ?? ''); return }
    void l.cambia(c.id, { criterio: nuovo })
  }
  if (scrivo) {
    return (
      <div className="tavola-fatto scrivo" ref={scatola}
        // Esc lascia com'era e chiude, prima che la casella lo prenda per «svuota»
        onKeyDownCapture={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTesto(k?.criterio ?? ''); setScrivo(false) } }}>
        <span>{t('Fatto vuol dire')}</span>
        <Casella valore={testo} cambia={setTesto} righe={3} invio={salva} alUscire={salva} aria-label={t('Fatto vuol dire')} />
      </div>
    )
  }
  if (!k) {
    return (
      <button type="button" className="tavola-fatto vuoto" disabled={chiedo}
        onClick={async () => { setChiedo(true); await l.contratto(c.id); setChiedo(false) }}>
        <span>{t('Fatto vuol dire')}</span>{chiedo ? t('Lo scrivo…') : t('Scrivilo')}
      </button>
    )
  }
  return (
    <button type="button" className="tavola-fatto" onClick={() => setScrivo(true)} title={t('Cambialo')}>
      <span>{t('Fatto vuol dire')}{k.scritto === 'tu' && <em>{t('tuo')}</em>}</span>
      {k.criterio}
    </button>
  )
}

/** Una cosa nuova, nelle tue: per oggi, tua. Invio la scrive e lascia il campo pronto per la prossima. */
function Aggiungi({ l, oggi }: { l: Lista; oggi: string }) {
  const [apri, setApri] = useState(false)
  const [testo, setTesto] = useState('')
  const scatola = useRef<HTMLDivElement>(null)
  const fuoco = () => scatola.current?.querySelector('input')?.focus()
  useEffect(() => { if (apri) fuoco() }, [apri])
  const scrivi = async () => {
    const r = testo.trim()
    if (!r) { setApri(false); return }
    setTesto('')
    await l.aggiungi(r, secchioDelGiorno(oggi), oggi)
    fuoco()
  }
  if (!apri) return <button type="button" className="tavola-aggiungi" onClick={() => setApri(true)}><span aria-hidden="true">+</span>{t('Aggiungi')}</button>
  return (
    <div className="tavola-nuova" ref={scatola}
      onKeyDownCapture={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTesto(''); setApri(false) } }}>
      <Casella valore={testo} cambia={setTesto} invio={() => { void scrivi() }} esempio={t('Cosa c’è da fare')} aria-label={t('Cosa c’è da fare')}
        alUscire={() => { if (!testo.trim()) setApri(false) }} />
    </div>
  )
}

/** L'ora di un istante ISO, «HH:MM». */
function oraDi(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Il turno in una riga, sopra le corsie (F2).
 *
 * Dice com'è, non come funziona: spento, fermo, in pausa fino a…, stanotte
 * dalle…, quante carte ha fatto partire oggi sul suo tetto, quanto ha speso
 * sul suo budget (F9), e la mattina quello che ha fatto la notte. Un bottone
 * solo: «Stop now» mentre lavora o di notte, «Resume the shift» da fermo.
 */
function RigaTurno({ s, l }: { s: StatoTurno; l: Lista }) {
  const [occupato, setOccupato] = useState(false)
  const fai = async (p: Parameters<Lista['impostaTurno']>[0]) => { setOccupato(true); await l.impostaTurno(p); setOccupato(false) }
  const ferma = async () => { setOccupato(true); await l.fermaTurno(); setOccupato(false) }
  if (!s.acceso) {
    return (
      <div className="tavola-turno spento">
        <span><i aria-hidden="true" />{t('Myynd non lavora la bacheca da solo.')}</span>
        <button type="button" className="tavola-gesto" disabled={occupato} onClick={() => fai({ acceso: true })}>{t('Accendi')}</button>
      </div>
    )
  }
  if (!s.motore) {
    return <div className="tavola-turno spento"><span><i aria-hidden="true" />{t('Collega Claude e potrò lavorarci.')}</span></div>
  }
  const pezzi: string[] = []
  if (!s.inNotte && s.stanotte.fatte + s.stanotte.attende > 0) pezzi.push(frasi.stanotteFatte(s.stanotte.fatte, s.stanotte.attende))
  if (s.fermo) pezzi.push(t('Fermato'))
  else if (s.pausaFino) pezzi.push(frasi.inPausaFino(oraDi(s.pausaFino)))
  else if (s.inNotte) pezzi.push(t('Lavora la notte'))
  else if (s.prossimaNotte) pezzi.push(frasi.stanotteDalle(oraDi(s.prossimaNotte)))
  pezzi.push(frasi.carteDelTurno(s.avviate, s.carte))
  // F9 · la spesa sul budget, e quando è finito lo dice: le carte aspettano la notte dopo
  if (s.budget?.limite) pezzi.push(s.budget.finito ? frasi.budgetFinito(s.budget.speso, s.budget.limite) : frasi.spesaDelTurno(s.budget.speso, s.budget.limite))
  const fermo = !!s.fermo || !!s.pausaFino
  const vivo = !fermo && !s.budget?.finito && (s.inNotte || s.prontePerOra > 0 || !!s.lavora)
  const fermabile = !fermo && (!!s.lavora || s.inNotte || s.prontePerOra > 0)
  return (
    <div className={`tavola-turno${vivo ? ' vivo' : ''}${fermo ? ' pausa' : ''}`}>
      <span><i aria-hidden="true" />{pezzi.join(' · ')}</span>
      {fermo
        ? <button type="button" className="tavola-gesto" disabled={occupato} onClick={() => fai({ pausa: 0 })}>{t('Riprendi il turno')}</button>
        : fermabile && <button type="button" className="tavola-gesto" data-ferma disabled={occupato} onClick={() => void ferma()}>{t('Ferma adesso')}</button>}
    </div>
  )
}

/**
 * Quando parte una carta in coda (F2): la prossima, stanotte, quando non ci
 * sei, o la notte prima del suo giorno. Se il turno è fermo, lo dice lei.
 */
function Quando({ c, s }: { c: Compito; s: StatoTurno | null | undefined }) {
  const q = quandoParte(c, s)
  if (!q) return null
  const testo = q.giorno ? frasi.laNottePrima(q.giorno) : t(q.chiave)
  return <p className="tavola-quando" data-prossima={q.prossima || undefined}><i aria-hidden="true" />{testo}</p>
}
