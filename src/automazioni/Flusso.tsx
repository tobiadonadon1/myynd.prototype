import { useState } from 'react'
import type { Attrezzo, Automazione, Passo } from '../api'
import { t } from '../lingua'
import { quandoGira } from './Scheda'
import { ConnectorIcon, connectorPerAttrezzo } from '../components/ConnectorIcon'
import { IconAvanti } from '../icons'

export function Flusso({ a, catalogo, passi, cambia, dettagli }: {
  a: Automazione; catalogo: Attrezzo[]; passi: Passo[]; cambia: (p: Passo[]) => void; dettagli: () => void
}) {
  const [modifico, setModifico] = useState<string | null>(null)
  const sposta = (i: number, delta: number) => {
    const next = [...passi]; [next[i], next[i + delta]] = [next[i + delta], next[i]]; cambia(next)
  }
  return <div className="auto-workflow">
    <div className="auto-node trigger"><header><span className="auto-node-number">1</span><strong>{t('Quando parte')}</strong><button className="auto-button subtle" onClick={dettagli}>{t('Modifica')}</button></header><p>{quandoGira(a)}</p></div>
    <div className="auto-node sources"><header><span className="auto-node-number">2</span><strong>{t('Cosa legge')}</strong><button className="auto-button subtle" onClick={dettagli}>{t('Modifica')}</button></header>
      <div className="auto-chips auto-source-chips">{a.attrezzi.length ? a.attrezzi.map(n => { const c = catalogo.find(x => x.nome === n); return <span key={n}><ConnectorIcon id={connectorPerAttrezzo(n, c?.serve)} size={13} spenta={!!c && !c.collegato} />{c?.etichetta ?? n}{c && !c.collegato ? ` · ${t('Non collegato')}` : ''}</span> }) : <p>{t('Documenti indicizzati')}</p>}</div>
      <p>{a.guarda.cerca || t('Solo i nuovi documenti')}</p></div>
    {passi.map((p, i) => <div className={`auto-node ${p.tipo === 'condizione' ? 'condition' : 'transform'}`} key={p.id}><header><span className="auto-node-number">{i + 3}</span><strong>{p.tipo === 'condizione' ? t('Continua solo se…') : t('Elabora con AI')}</strong>
      <div className="auto-node-controls"><button aria-label={t('Sposta su')} disabled={i === 0} onClick={() => sposta(i, -1)}>↑</button><button aria-label={t('Sposta giù')} disabled={i === passi.length - 1} onClick={() => sposta(i, 1)}>↓</button><button aria-label={t('Rimuovi passo')} onClick={() => cambia(passi.filter(x => x.id !== p.id))}>×</button></div></header>
      {modifico === p.id || !p.testo ? <textarea rows={3} autoFocus={modifico === p.id} aria-label={`${p.tipo === 'condizione' ? t('Condizione') : t('Istruzione')} ${i + 1}`} placeholder={p.tipo === 'condizione' ? t('Ci sono richieste che richiedono una risposta…') : t('Estrai le scadenze e raggruppa per progetto…')} value={p.testo} maxLength={4000} onBlur={() => setModifico(null)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setModifico(null) } }} onFocus={() => setModifico(p.id)} onChange={e => cambia(passi.map(x => x.id === p.id ? { ...x, testo: e.target.value } : x))} />
        : <button className="auto-step-text" onClick={() => setModifico(p.id)} aria-label={`${t('Modifica')}: ${p.testo}`}><span>{p.testo}</span><span className="auto-step-edit"><IconAvanti size={11} /></span></button>}

    </div>)}
    <div className="auto-workflow-add"><button className="auto-button" disabled={passi.length >= 6} onClick={() => { const id = crypto.randomUUID(); cambia([...passi, { id, tipo: 'trasforma', testo: '' }]); setModifico(id) }}>+ {t('Passo AI')}</button><button className="auto-button" disabled={passi.length >= 6} onClick={() => { const id = crypto.randomUUID(); cambia([...passi, { id, tipo: 'condizione', testo: '' }]); setModifico(id) }}>+ {t('Condizione')}</button><span className="auto-muted">{passi.length}/6</span></div>
    <div className="auto-node result"><header><span className="auto-node-number">{passi.length + 3}</span><strong>{t('Il risultato per te')}</strong><button className="auto-button subtle" onClick={dettagli}>{t('Modifica')}</button></header><p>{a.fai}</p><p>{a.metti.modo === 'io' ? t('mette solo una riga') : t('prepara anche la bozza')} · {t(a.metti.inLista === 'oggi' ? 'in Oggi' : a.metti.inLista === 'settimana' ? 'in Questa settimana' : 'in Prima o poi')}</p></div>
  </div>
}
