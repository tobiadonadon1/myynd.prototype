import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type Compito, type ManoCompito, type Priorita, type Progetto, type VoceDiario } from '../api'
import { frasi, t } from '../lingua'
import { Cestino } from '../ui'
import { Casella } from '../components/forme'
import type { Lista } from './useCompiti'
import { giornoCompito, giornoLocale, secchioDelGiorno, spostaGiorno } from './giorni'
import { oraDi, oraValida } from '../agenda-ore'
import './calendario.css'

/** Native modal semantics provide focus containment, Escape and focus restoration. */
export function Dettaglio({ c, l, chiudi }: { c: Compito; l: Lista; chiudi: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const [testo, setTesto] = useState(c.testo)
  const [nota, setNota] = useState(c.nota ?? '')
  const [progetti, setProgetti] = useState<Progetto[]>([])
  const [progetto, setProgetto] = useState(c.progetto ?? '')
  useEffect(() => { let vivo = true; api.progetti(c.progetto ?? undefined).then(r => { if (vivo) setProgetti(r.progetti) }).catch(() => {}); return () => { vivo = false } }, [c.progetto])
  const oggi = giornoLocale()
  const [giorno, setGiorno] = useState(giornoCompito(c, oggi) ?? '')
  /** L'ora dentro quel giorno: vuota vuol dire senza ora, cioè vale tutto il giorno. */
  const [ora, setOra] = useState(oraDi(c) ?? '')
  const [priorita, setPriorita] = useState<Priorita | null>(c.priorita ?? null)
  /** F1 · il «fatto»: si mostra per le carte di Myynd, o per quelle che ne hanno già uno. */
  const conFatto = (!!c.modo && c.modo !== 'io') || !!c.contratto
  const [criterio, setCriterio] = useState(c.contratto?.criterio ?? '')
  const [riscrivo, setRiscrivo] = useState(false)
  // il criterio può arrivare mentre il dettaglio è aperto (il modello lo scrive dietro)
  useEffect(() => { setCriterio(k => (k.trim() ? k : c.contratto?.criterio ?? '')) }, [c.contratto?.criterio])
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState(false)
  useEffect(() => {
    const dialog = dialogo.current
    const precedente = document.activeElement as HTMLElement | null
    dialog?.showModal()
    dialog?.querySelector<HTMLTextAreaElement>('#task-detail-title')?.focus()
    return () => {
      dialog?.close()
      requestAnimationFrame(() => {
        if (precedente?.isConnected) precedente.focus()
        else document.querySelector<HTMLInputElement>('#task-composer')?.focus()
      })
    }
  }, [])
  const salva = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testo.trim() || salvando) return
    setSalvando(true); setErrore(false)
    const criterioCambiato = conFatto && criterio.trim() !== (c.contratto?.criterio ?? '').trim()
    const fatto = await l.cambia(c.id, { testo: testo.trim(), nota: nota.trim() || null, giorno: giorno || null, progetto: progetto || null,
      ...(criterioCambiato ? { criterio: criterio.trim() || null } : {}),
      // solo se è cambiata: una modifica che non la tocca non deve riscriverla
      ...(priorita !== (c.priorita ?? null) ? { priorita } : {}),
      // senza un giorno l'ora non sta da nessuna parte, e il server la rifiuta
      ora: giorno && oraValida(ora) ? ora : null,
      quando: giorno ? secchioDelGiorno(giorno) : (c.quando === 'settimana' ? 'settimana' : 'poi') })
    setSalvando(false)
    if (fatto) chiudi(); else setErrore(true)
  }
  return createPortal(<dialog ref={dialogo} className="task-detail" aria-labelledby="task-detail-heading"
    onCancel={e => { e.preventDefault(); if (!salvando) chiudi() }}>
    <form onSubmit={salva}>
      <header><span id="task-detail-heading">{t('Dettagli attività')}</span><button type="button" className="task-detail-close" aria-label={t('Chiudi')} disabled={salvando} aria-busy={salvando || undefined} onClick={chiudi}>×</button></header>
      <div className="task-detail-body">
        <label className="task-detail-label" htmlFor="task-detail-title">{t('Attività')}</label>
        {/* il testo intero, andando a capo: sulla riga c'è il titolo corto, qui tutto quello che ha scritto.
            Invio salva come prima; Maiuscolo+Invio va a capo. */}
        <textarea id="task-detail-title" className="task-detail-title" autoFocus required rows={1} value={testo}
          ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` } }}
          onChange={e => setTesto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }} />
        <fieldset><legend>{t('Pianificazione')}</legend><div className="task-detail-presets">
          {[['Oggi', oggi], ['Domani', spostaGiorno(oggi, 1)], ['Dopodomani', spostaGiorno(oggi, 2)], ['Senza data', '']].map(([nome, data]) =>
            <button type="button" key={nome} aria-pressed={giorno === data} onClick={() => { setGiorno(data); if (!data) setOra('') }}>{t(nome)}</button>)}
        </div><div className="task-detail-quando">
          <input type="date" aria-label={t('Data')} min="1900-01-01" max="9999-12-31" value={giorno} onChange={e => { setGiorno(e.target.value); if (!e.target.value) setOra('') }} />
          {/* l'ora sta accanto alla data perché è la stessa domanda, fatta più
              da vicino: vuota vuol dire che quella cosa vale per tutto il giorno */}
          <input type="time" aria-label={t('Ora')} value={ora} disabled={!giorno} onChange={e => setOra(e.target.value)} />
        </div></fieldset>
        <fieldset><legend>{t('Priorità')}</legend><div className="task-detail-presets" role="radiogroup" aria-label={t('Priorità')}>
          {([['bassa', 'Bassa'], [null, 'Normale'], ['alta', 'Alta']] as [Priorita | null, string][]).map(([id, nome]) =>
            <button type="button" key={nome} role="radio" aria-checked={priorita === id} aria-pressed={priorita === id} onClick={() => setPriorita(id)}>{t(nome)}</button>)}
        </div></fieldset>
        <label className="task-detail-label" htmlFor="task-detail-notes">{t('Note')}</label>
        <textarea id="task-detail-notes" className="task-detail-notes" rows={3} value={nota} placeholder={t('Aggiungi un dettaglio…')} onChange={e => setNota(e.target.value)} />
        {(progetti.length > 0 || progetto) && <><label className="task-detail-label" htmlFor="task-detail-project">{t('Progetto')}</label>
          <select id="task-detail-project" className="task-detail-project" value={progetto} onChange={e => setProgetto(e.target.value)}>
            <option value="">{t('Nessun progetto')}</option>
            {progetto && !progetti.some(p => p.id === progetto) && <option value={progetto}>{t('Progetto collegato')}</option>}
            {progetti.filter(p => p.stato !== 'chiuso' || p.id === progetto).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select></>}
        {conFatto && <div className="task-detail-fatto">
          <div className="task-detail-fatto-testa">
            <label className="task-detail-label" htmlFor="task-detail-done">{t('Fatto vuol dire')}</label>
            {c.contratto?.scritto === 'tu' ? <span className="task-detail-suo">{t('tuo')}</span>
              : <button type="button" className="task-detail-riscrivi" disabled={riscrivo}
                onClick={async () => { setRiscrivo(true); const ok = await l.contratto(c.id, true); setRiscrivo(false); if (ok) setCriterio('') }}>
                {riscrivo ? t('Lo scrivo…') : c.contratto ? t('Riscrivilo') : t('Scrivilo')}</button>}
          </div>
          <Casella id="task-detail-done" valore={criterio} cambia={setCriterio} righe={2} esempio={t('Com’è la cosa finita, e dove arriva')} />
          {!!c.contratto && <div className="task-detail-mani">
            {c.contratto.mani.map(m => <span key={m}>{t(NOME_MANO[m])}</span>)}
            <span className="task-detail-budget">{frasi.finoAMinuti(c.contratto.budget.minuti)}</span>
          </div>}
        </div>}
        {c.prova && <div className={`task-detail-prova ${c.prova.esito}`}>
          <span className="task-detail-label">{t('La prova')}</span>
          <p>{c.prova.esito === 'pass' ? '✓ ' : ''}{c.prova.perche}</p>
          {c.prova.controlli.length > 0 && <ul>{c.prova.controlli.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </div>}
        {!!c.diario?.length && <details className="task-detail-diario">
          <summary>{[t('Cosa ha fatto'), ...pezziDelCosto(c)].join(' · ')}</summary>
          <ol>{c.diario.slice(-24).map((v, i) => <li key={i}><time>{oraDellaVoce(v.t)}</time><span>{fraseDiario(v)}</span></li>)}</ol>
        </details>}
        {errore && <p role="alert" className="task-detail-error">{t('Non sono riuscito a salvarlo.')}</p>}
      </div>
      <footer><div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>{!salvando && <Cestino fai={() => { l.elimina(c.id); chiudi() }} titolo={t('Toglila')} visibile dim={32} icona={14} subito />}
        {/* F9 · il lavoro di Myynd si disfa per sette giorni: i file nel Cestino, la carta torna sua */}
        {!salvando && puoDisfare(c) && <button type="button" data-disfa onClick={() => { void l.disfa(c.id); chiudi() }}>{t('Disfa')}</button>}</div><button type="button" disabled={salvando} onClick={chiudi}>{t('Annulla')}</button><button type="submit" className="task-detail-save" disabled={!testo.trim() || salvando}>{salvando ? t('Salvo…') : t('Salva')}</button></footer>
    </form>
  </dialog>, document.body)
}

const NOME_MANO: Record<ManoCompito, string> = {
  posta: 'Bozza nella casella',
  file: 'File sul disco',
  nota: 'Nota',
  web: 'Web',
  codice: 'Codice, in una copia'
}

/** F9 · per quanti giorni dopo la chiusura il lavoro di Myynd si disfa ancora: la stessa regola di `server/disfa.ts`. */
const GIORNI_PER_DISFARE = 7

/** F9 · «Disfa» c'è solo quando il server lo farebbe: un lavoro di Myynd, pronto, o chiuso da meno di sette giorni. */
export function puoDisfare(c: Compito, adesso = Date.now()): boolean {
  const lavoro = !!c.risultato || !!c.consegna || !!c.diario?.some(v => v.tipo === 'consegnato' || v.tipo === 'file')
  if (c.stato === 'pronto' || c.stato === 'chiede') return lavoro
  if (c.stato !== 'fatto' || !lavoro) return false
  const chiuso = Date.parse(c.chiuso ?? '')
  return Number.isFinite(chiuso) && adesso - chiuso <= GIORNI_PER_DISFARE * 86_400_000
}

/** F9 · il conto della carta accanto a «Cosa ha fatto»: «$0.12 · 9 calls», con la tilde se è una stima. */
function pezziDelCosto(c: Compito): string[] {
  const k = c.costo
  if (!k?.chiamate) return []
  return [...(k.costo !== null ? [`${k.stimato ? '~' : ''}${frasi.dollari(k.costo / 1_000_000)}`] : []), frasi.chiamate(k.chiamate)]
}

/** L'ora di una voce del diario, «HH:MM». */
function oraDellaVoce(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Una voce del diario, detta nella lingua di chi legge: il server manda il tipo, la frase si compone qui. */
export function fraseDiario(v: VoceDiario): string {
  const d = v.dettaglio ?? ''
  switch (v.tipo) {
    case 'preso': return t('Presa in mano')
    case 'contratto': return frasi.fattoFissato(d)
    case 'cerco': return frasi.passoCerco(d)
    case 'apro': return frasi.passoApro(d)
    case 'scrivo': return t('Scritta la prima stesura')
    case 'rileggo': return t('Riletta contro il suo «fatto»')
    case 'riscrivo': return d ? frasi.riscrittaPerche(d) : t('Riscritta dopo la rilettura')
    case 'presumo': return t('Andata avanti con un’ipotesi')
    case 'consegnato': return d ? frasi.consegnataCome(d === 'casella' ? t('bozza nella casella') : d) : t('Consegnata')
    case 'domanda': return d ? frasi.chiestoATe(d) : t('Ti ha chiesto una cosa')
    case 'guaio': return d ? `${t('Fermata')}: ${t(d)}` : t('Fermata')
    case 'prova': return d.startsWith('pass') ? t('Controllata: regge') : d.startsWith('fail') ? t('Controllata: non regge ancora') : t('Nessuno ha potuto controllarla')
    case 'scaduto': return t('Finito il tempo che aveva')
    case 'fermato': return d === 'stop' ? t('Fermata con «Ferma adesso»: torna in coda')
      : d === 'budget' ? t('Finito il budget della notte: torna in coda')
      : d.startsWith('disfatto') ? t('Disfatta') : t('Ripresa da te')
    case 'turno': return d === 'notte' ? t('Partita di notte, col turno') : d === 'via' ? t('Partita col turno, mentre non c’eri') : t('Partita col turno')
    case 'file': return frasi.fileScritto(d)
    case 'nota': return frasi.notaCreata(d)
    default: return d
  }
}
