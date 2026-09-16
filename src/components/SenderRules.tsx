import { useEffect, useRef, useState } from 'react'
import { api, type SenderRule } from '../api'
import { loc, t } from '../lingua'
import './sender-rules.css'

/** Every mailbox-changing rule starts with an explicit submit, never on typing. */
export function SenderRules() {
  const [open,setOpen]=useState(false)
  const requestVersion=useRef(0)
  const [rules,setRules]=useState<SenderRule[] | null>(null)
  const [sender,setSender]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [reload,setReload]=useState(0)
  const [notice,setNotice]=useState('')
  useEffect(()=>{
    if(!open)return
    let live=true
    const version=++requestVersion.current
    api.regoleMittenti().then(r=>{if(live && version===requestVersion.current){setRules(r.rules.filter(x=>x.enabled));setError('')}})
      .catch(()=>{if(live && version===requestVersion.current)setError(t('Impossibile caricare le regole mittenti.'))})
    return ()=>{live=false}
  },[open,reload])
  const add=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault()
    if(busy || !sender.trim() || !e.currentTarget.reportValidity())return
    requestVersion.current++
    setBusy(true);setError('');setNotice('')
    try {const r=await api.aggiungiRegolaMittente(sender.trim());setRules(r.rules.filter(x=>x.enabled));setSender('')}
    catch(e){setError(e instanceof Error?t(e.message):t('Impossibile salvare la regola mittente.'))}
    finally{setBusy(false)}
  }
  const remove=async(id:string)=>{
    if(busy)return
    requestVersion.current++
    setBusy(true);setError('');setNotice('')
    try{const r=await api.rimuoviRegolaMittente(id);setRules(r.rules.filter(x=>x.enabled));setNotice(t('Le prossime email restano nella posta in arrivo.'))}
    catch(e){setError(e instanceof Error?t(e.message):t('Impossibile rimuovere la regola mittente.'))}
    finally{setBusy(false)}
  }
  return <details className="sender-rules" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>{t('Regole mittenti')}{!!rules?.length && <small>{rules.length}</small>}</summary>
    <p className="sender-rules-description">{t('Le nuove email da questi indirizzi vengono archiviate mentre Myynd è in esecuzione. I messaggi restano nella casella: non vengono eliminati e il mittente non viene bloccato dal provider.')}</p>
    <form onSubmit={add}>
      <label>{t('Indirizzo esatto del mittente')}<input type="email" required maxLength={254} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" value={sender} disabled={busy} onChange={e=>setSender(e.target.value)} /></label>
      <button type="submit" disabled={busy || rules===null || !sender.trim()}>{busy?t('Salvo…'):t('Archivia le prossime email')}</button>
    </form>
    {rules===null && !error && <p role="status">{t('Caricamento…')}</p>}
    {rules?.length===0 && <p className="sender-rules-empty">{t('Nessuna regola mittente.')}</p>}
    {!!rules?.length && <ul>{rules.map(rule=><li key={rule.id}>
      <div className="sender-rule-text"><strong>{rule.sender}</strong>
        <small>{rule.lastCheckedAt && Number.isFinite(Date.parse(rule.lastCheckedAt))
          ? `${t('Ultimo controllo')}: ${new Date(rule.lastCheckedAt).toLocaleString(loc(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`
          : t('In attesa di nuove email')}{rule.archivedCount!==undefined?` · ${t('Archiviate')}: ${rule.archivedCount}`:''}</small>
        {rule.lastError && <small className="sender-rule-error" role="status">{t(rule.lastError)}</small>}
      </div>
      <button type="button" disabled={busy} onClick={()=>void remove(rule.id)} aria-label={`${t('Rimuovi regola')}: ${rule.sender}`}>{t('Rimuovi regola')}</button>
    </li>)}</ul>}
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert" className="sender-rules-error">{error} <button type="button" disabled={busy} onClick={()=>setReload(x=>x+1)}>{t('Riprova')}</button></div>}
  </details>
}
