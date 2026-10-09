import { useEffect, useState } from 'react'
import { api, type DelPacchetto } from '../api'
import { t } from '../lingua'
import { quandoGira } from './quando'
import type { Vals } from '../vals'
import './automazioni.css'

/** Le righe delle quattro di partenza: il nome, cosa fa, quando, e il suo interruttore. */
export function RighePacchetto({ righe, occupato, prendi }: {
  righe: DelPacchetto[]
  occupato: boolean
  prendi: (id: string, accesa: boolean) => void
}) {
  return <ul>{righe.map(p => <li key={p.id}>
    <div className="auto-pacchetto-testo"><b>{p.nome}</b><span>{p.spiega}</span>
      <small>{quandoGira(p.quando)}{p.staccati.length ? ` · ${t('manca una fonte')}` : ''}</small></div>
    <button className="auto-switch" role="switch" aria-checked={p.accesa} aria-label={`${p.accesa ? t('Mettila in pausa') : t('Accendila')}: ${p.nome}`}
      disabled={occupato} onClick={() => prendi(p.id, !p.accesa)}><span /></button>
  </li>)}</ul>
}

/**
 * Le quattro di partenza sulla prima pagina, al primo avvio (E).
 *
 * Stavano solo nella pagina degli ordini fissi, e chi non la apriva restava
 * senza nessuno: il conto nuovo che il pacchetto doveva servire. Qui si
 * offrono finché non ne ha accesa nessuna e non ne ha scritta una sua (lo
 * decide il server, `offerta`), con un interruttore ciascuna e «Non ora».
 * Accesa una, la carta resta finché è aperta la pagina, così si può
 * accenderne un'altra; e porta alla pagina dove ognuna ha la sua scheda.
 */
export function CartaPacchetto({ v }: { v: Vals }) {
  const [righe, setRighe] = useState<DelPacchetto[] | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [guaio, setGuaio] = useState('')
  useEffect(() => {
    let vivo = true
    api.pacchetto().then(r => { if (vivo && r.offerta) setRighe(r.pacchetto) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  if (!righe?.length) return null
  const prendi = async (id: string, accesa: boolean) => {
    if (occupato) return
    setOccupato(true); setGuaio('')
    // il dito vede subito l'interruttore girare; la risposta lo conferma
    setRighe(x => x?.map(p => p.id === id ? { ...p, accesa } : p) ?? x)
    try { setRighe((await api.dalPacchetto(id, accesa)).pacchetto) }
    catch (e) {
      setRighe(x => x?.map(p => p.id === id ? { ...p, accesa: !accesa } : p) ?? x)
      setGuaio(e instanceof Error ? e.message : String(e))
    }
    setOccupato(false)
  }
  const presa = righe.some(p => p.accesa)
  return (
    <section className="auto-pacchetto casa" aria-labelledby="casa-pacchetto-titolo">
      <div className="auto-pacchetto-testa">
        <h2 id="casa-pacchetto-titolo">{t('Ordini fissi per cominciare')}</h2>
        {presa
          ? <button type="button" className="auto-link" onClick={() => v.goAuto()}>{t('Vai agli ordini fissi')}</button>
          : <button type="button" className="auto-link" disabled={occupato} onClick={() => { setRighe(null); api.pacchettoVisto().catch(() => {}) }}>{t('Non ora')}</button>}
      </div>
      <RighePacchetto righe={righe} occupato={occupato} prendi={prendi} />
      {guaio && <p role="alert" className="auto-error">{t(guaio)}</p>}
    </section>
  )
}
