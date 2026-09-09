import { useCallback, useEffect, useState } from 'react'
import { api, type ProgressoProgetto } from '../api'
import { t } from '../lingua'
import './attivita-progetto.css'

const stato = (s: string) => t(({ aperto: 'Da fare', delegato: 'Al lavoro', pronto: 'Da rivedere', chiede: 'Aspetta te', fatto: 'Completata', lasciato: 'Lasciata' } as Record<string, string>)[s] ?? s)

/** A project reports real task states and retained outcomes, without claiming the goal is done. */
export function AttivitaProgetto({ id, chiuso }: { id: string; chiuso: boolean }) {
  const [dati, setDati] = useState<ProgressoProgetto | null>(null)
  const [azione, setAzione] = useState('')
  const [errore, setErrore] = useState('')
  const [salva, setSalva] = useState(false)
  const carica = useCallback(async () => {
    try { setDati(await api.attivitaProgetto(id)); setErrore('') }
    catch (e) { setErrore(e instanceof Error ? e.message : String(e)) }
  }, [id])
  useEffect(() => { carica(); return api.flussoCompiti(() => { carica() }) }, [carica])
  const aggiungi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!azione.trim() || salva) return
    setSalva(true)
    try {
      await api.aggiungiCompito({ id: `p-${crypto.randomUUID()}`, testo: azione.trim(), progetto: id, quando: 'poi' })
      setAzione(''); await carica()
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)) }
    finally { setSalva(false) }
  }
  return <details className="project-activity">
    <summary><span>{t('Attività e risultati')}</span>{dati && <small>{dati.completate} {t('concluse')} · {dati.aperte + dati.inCorso + dati.daRivedere} {t('aperte')}</small>}</summary>
    {dati && <div className="project-activity-list">
      {dati.attivita.map(c => <details key={c.id} className="project-activity-task">
        <summary><span>{c.testo}</span><small data-state={c.stato}>{stato(c.stato)}</small></summary>
        <div className="project-activity-proof">
          {c.giorno && <time dateTime={c.giorno}>{c.giorno}</time>}
          {c.esito && <p>{c.esito}</p>}
          {c.risultato && <p>{c.risultato}</p>}
          {!c.esito && !c.risultato && <p>{t('Nessun risultato registrato.')}</p>}
          {c.fonti?.length ? <span>{t('Fonti')}: {c.fonti.map(f => f.label).join(' · ')}</span> : null}
        </div>
      </details>)}
      {!dati.attivita.length && <p className="project-activity-empty">{t('Da quale passo partiamo?')}</p>}
    </div>}
    {!chiuso && <form onSubmit={aggiungi}><input aria-label={t('Prossima azione')} placeholder={t('Prossima azione…')} value={azione} maxLength={300} onChange={e => setAzione(e.target.value)} />
      <button disabled={salva || !azione.trim()} type="submit">{salva ? t('Salvo…') : t('Aggiungi')}</button></form>}
    {errore && <p role="alert" className="project-activity-error">{t(errore)} <button type="button" onClick={carica}>{t('Riprova')}</button></p>}
  </details>
}
