import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type Compito, type Priorita, type Progetto } from '../api'
import { t } from '../lingua'
import { Cestino } from '../ui'
import type { Lista } from './useCompiti'
import { giornoCompito, giornoLocale, spostaGiorno } from './giorni'
import { oraDi } from '../agenda-ore'
import { cambiDelDettaglio, valoriDi } from './cambi-dettaglio'
import './calendario.css'

/** Native modal semantics provide focus containment, Escape and focus restoration. */
export function Dettaglio({ c, l, chiudi }: { c: Compito; l: Lista; chiudi: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const [testo, setTesto] = useState(c.testo)
  const [nota, setNota] = useState(() => valoriDi(c, giornoLocale()).nota)
  const [progetti, setProgetti] = useState<Progetto[]>([])
  const [progetto, setProgetto] = useState(c.progetto ?? '')
  useEffect(() => { let vivo = true; api.progetti(c.progetto ?? undefined).then(r => { if (vivo) setProgetti(r.progetti) }).catch(() => {}); return () => { vivo = false } }, [c.progetto])
  const oggi = giornoLocale()
  const [giorno, setGiorno] = useState(giornoCompito(c, oggi) ?? '')
  /** L'ora dentro quel giorno: vuota vuol dire senza ora, cioè vale tutto il giorno. */
  const [ora, setOra] = useState(oraDi(c) ?? '')
  const [priorita, setPriorita] = useState<Priorita | null>(c.priorita ?? null)
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
    // solo quello che ha toccato (`cambi-dettaglio.ts`): niente di cambiato, niente da mandare
    const cambi = cambiDelDettaglio(c, { testo, nota, giorno, ora, progetto, priorita }, oggi)
    if (!Object.keys(cambi).length) { chiudi(); return }
    setSalvando(true); setErrore(false)
    const fatto = await l.cambia(c.id, cambi)
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
        {errore && <p role="alert" className="task-detail-error">{t('Non sono riuscito a salvarlo.')}</p>}
      </div>
      <footer><div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>{!salvando && <Cestino fai={() => { l.elimina(c.id); chiudi() }} titolo={t('Toglila')} visibile dim={32} icona={14} subito />}
        {/* F9 · il lavoro di Myynd si disfa per sette giorni: i file nel Cestino, la carta torna sua */}
        {!salvando && puoDisfare(c) && <button type="button" data-disfa onClick={() => { void l.disfa(c.id); chiudi() }}>{t('Disfa')}</button>}</div><button type="button" disabled={salvando} onClick={chiudi}>{t('Annulla')}</button><button type="submit" className="task-detail-save" disabled={!testo.trim() || salvando}>{salvando ? t('Salvo…') : t('Salva')}</button></footer>
    </form>
  </dialog>, document.body)
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

