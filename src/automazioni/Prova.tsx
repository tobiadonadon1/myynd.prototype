// La linguetta «Prova» dell'editor (P6): la ricetta rifatta sugli ultimi 30 giorni.
//
// In cima una riga sola, lo stato, con al più un comando; sotto, se c'è, la
// riga di quello che nel passato non si è potuto rifare. Poi i risultati, una
// colonna, dal più nuovo: la data, quello che cambia, il segno. Si aprono sul
// posto. ✓ e × compaiono sotto il mouse e sotto il fuoco, e un tocco cambia il
// segno e il conto subito; niente chiede mai di giudicare. I risultati della
// prova sono il passato: si leggono, non si mettono in lista.

import { useEffect, useRef, useState } from 'react'
import { api, apiP6, type EsitoVista, type ProvaVista, type VoceProva } from '../api'
import { t } from '../lingua'
import { data, frasiProva, intestazione } from '../prova'

const IN_CORSO = new Set(['in coda', 'in corso'])

/** Il conto, rifatto qui: un tocco lo cambia prima che il server risponda. */
function conta(esiti: EsitoVista[]) {
  const voci = esiti.flatMap(e => e.voci)
  const giusti = voci.filter(v => v.verdetto === 'giusto').length
  const giudicati = giusti + voci.filter(v => v.verdetto === 'sbagliato').length
  const tue = voci.filter(v => v.verdetto !== 'incerto' && (v.da === 'tuo' || v.da === 'mosse')).length
  return { giusti, giudicati, tue, esito: giudicati < 5 ? 'poco' as const : giusti / giudicati >= 0.9 ? 'pronta' as const : 'non passa' as const }
}

/** Il segno di un risultato: sbagliato se una sua voce lo è, giusto se una lo è, niente altrimenti. */
function segno(e: EsitoVista): 'giusto' | 'sbagliato' | null {
  if (e.voci.some(v => v.verdetto === 'sbagliato')) return 'sbagliato'
  return e.voci.some(v => v.verdetto === 'giusto') ? 'giusto' : null
}

/** Quello che cambia da un risultato all'altro: chi e cosa, la riga, il riassunto. */
function cosa(e: EsitoVista): string {
  if (e.tipo === 'proposta') return e.testo
  const nuovi = e.voci.filter(v => v.titolo)
  if (nuovi.length && e.voci.length > 1) return nuovi.map(v => `${(v.chi ?? '').split(' <')[0] || v.titolo}: ${v.titolo}`).join(' · ')
  return nuovi.length === 1 && e.testo === '' ? nuovi[0].titolo : e.testo
}

function primoParagrafo(s: string): string {
  return s.split(/\n\s*\n/).map(x => x.trim()).find(Boolean) ?? ''
}

function Prove({ e }: { e: EsitoVista }) {
  const [sua, setSua] = useState<string | null>(null)
  const [aperta, setAperta] = useState(false)
  const p = e.prova
  if (!p) return null
  const frase = p.cosa === 'risposto' ? frasiProva.risposto(p.quando) : p.cosa === 'fatto' ? frasiProva.fatta(p.quando)
    : p.cosa === 'riga' ? frasiProva.riga(p.quando) : frasiProva.scartata(p.quando)
  const apri = async () => {
    if (aperta) { setAperta(false); return }
    setAperta(true)
    if (sua !== null || !e.risposta?.doc) return
    try { const d = await api.documento(e.risposta.doc); setSua(d.corpo ?? d.testo ?? '') } catch { setSua('') }
  }
  return <div className="prova-poi">
    <span>{frase}</span>
    {e.risposta && (e.risposta.doc
      ? <> · <button type="button" className="auto-link" onClick={apri} aria-expanded={aperta}>{t('La tua risposta')}</button></>
      : <> · <span className="prova-muto">{t('Fonte non più disponibile')}</span></>)}
    {aperta && <p className="prova-sua">{sua === null ? '…' : sua || t('Fonte non più disponibile')}</p>}
  </div>
}

function Risultato({ e, puoScrivere, tocca, scrivi, scrivendo }: {
  e: EsitoVista; puoScrivere: boolean
  tocca: (id: string, suo: 'giusto' | 'sbagliato' | null) => void
  scrivi: (id: string) => void; scrivendo: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const [tutta, setTutta] = useState(false)
  const s = segno(e)
  const anche = frasiProva.anche(e.anche)
  const sbagliato = e.voci.find(v => v.verdetto === 'sbagliato' && v.perche)
  return <li className={`prova-riga${aperto ? ' aperta' : ''}`}>
    <div className="prova-testa">
      <div role="button" tabIndex={0} className="prova-apri" aria-expanded={aperto}
        onClick={() => setAperto(x => !x)}
        onKeyDown={k => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); setAperto(x => !x) } }}>
        <time>{data(e.quando)}</time>
        <span className="prova-cosa">{cosa(e)}{anche ? ` · ${anche}` : ''}</span>
      </div>
      <span className="prova-segni">
        <button type="button" className="prova-tocco giusto" aria-pressed={e.suo === 'giusto'} aria-label={t('Giusta')} title={t('Giusta')}
          onClick={() => tocca(e.id, e.suo === 'giusto' ? null : 'giusto')}>✓</button>
        <button type="button" className="prova-tocco sbagliato" aria-pressed={e.suo === 'sbagliato'} aria-label={t('Sbagliata')} title={t('Sbagliata')}
          onClick={() => tocca(e.id, e.suo === 'sbagliato' ? null : 'sbagliato')}>×</button>
      </span>
      <span className={`prova-segno ${s ?? ''}`} aria-label={s === 'giusto' ? t('Giusta') : s === 'sbagliato' ? t('Sbagliata') : undefined}>
        {s === 'giusto' ? '✓' : s === 'sbagliato' ? <i /> : null}
      </span>
    </div>
    {aperto && <div className="prova-dentro">
      {e.voci.filter((v: VoceProva) => v.titolo).map((v, i) => <div key={i} className="prova-doc">
        <div className="prova-doc-testa"><b>{v.titolo}</b>{v.chi && <span> · {v.chi.split(' <')[0]}</span>}{v.quando && <span> · {data(v.quando)}</span>}</div>
        {v.estratto ? <p>{v.estratto}</p> : <p className="prova-muto">{t('Fonte non più disponibile')}</p>}
      </div>)}
      {e.bozza && <div className="prova-bozza">
        <p>{tutta ? e.bozza : primoParagrafo(e.bozza)}</p>
        {!tutta && primoParagrafo(e.bozza) !== e.bozza.trim() && <button type="button" className="auto-link" onClick={() => setTutta(true)}>{t('Tutta la bozza')}</button>}
      </div>}
      {e.ipotesi.map((x, i) => <p key={i} className="prova-muto">{x}</p>)}
      {e.chiede && <p className="prova-muto">{frasiProva.avrebbeChiesto(e.chiede)}</p>}
      <Prove e={e} />
      {s === 'sbagliato' && sbagliato?.perche && <p className="prova-perche">{sbagliato.perche}</p>}
      {e.scrive && !e.bozza && puoScrivere && <button type="button" className="auto-button" disabled={scrivendo} onClick={() => scrivi(e.id)}>
        {scrivendo ? t('La scrivo…') : t('Scrivi la bozza')}</button>}
    </div>}
  </li>
}

export function Prova({ vista, cambia, riprova, vaiAlleFonti, guaio }: {
  vista: ProvaVista
  cambia: (v: ProvaVista) => void
  riprova: () => void
  vaiAlleFonti: () => void
  guaio: (m: string) => void
}) {
  const [scrivendo, setScrivendo] = useState<Set<string>>(new Set())
  const ultima = useRef(vista)
  ultima.current = vista
  // si rilegge ogni secondo e mezzo mentre gira, o mentre una bozza chiesta non è arrivata
  const attende = IN_CORSO.has(vista.stato) || [...scrivendo].some(id => !vista.esiti.find(e => e.id === id)?.bozza)
  useEffect(() => {
    if (!attende || !vista.id) return
    const x = setInterval(async () => {
      try {
        const n = await apiP6.prova(ultima.current.id)
        cambia(n)
        setScrivendo(s => new Set([...s].filter(id => !n.esiti.find(e => e.id === id)?.bozza)))
      } catch { /* la prossima volta */ }
    }, 1500)
    return () => clearInterval(x)
  }, [attende, vista.id, cambia])

  const tocca = async (id: string, suo: 'giusto' | 'sbagliato' | null) => {
    const prima = ultima.current
    const esiti = prima.esiti.map(e => e.id !== id ? e : {
      ...e, suo, voci: e.voci.map(v => suo ? { ...v, verdetto: suo, da: 'tuo' as const } : v)
    })
    cambia({ ...prima, esiti, ...conta(esiti) })
    try {
      await apiP6.giudicaEsito(id, suo)
      cambia(await apiP6.prova(prima.id))
    } catch (err) { cambia(prima); guaio(err instanceof Error ? err.message : String(err)) }
  }
  const scrivi = async (id: string) => {
    setScrivendo(s => new Set([...s, id]))
    try { await apiP6.bozzaEsito(id) } catch (err) {
      setScrivendo(s => new Set([...s].filter(x => x !== id)))
      guaio(err instanceof Error ? err.message : String(err))
    }
  }

  const i = intestazione(vista)
  const [primo, ...resto] = i.testo.split(' · ')
  return <div className="prova">
    <div className="prova-intestazione">
      <p className="prova-stato" role="status">
        {i.verde ? <><span className="verde">{primo}</span>{resto.length ? ` · ${resto.join(' · ')}` : ''}</> : i.testo}
      </p>
      {i.bottone && <button type="button" className="auto-link" onClick={i.bottone === 'fonti' || i.bottone === 'collega' ? vaiAlleFonti : riprova}>
        {t(i.bottone === 'riprova' ? 'Riprova' : i.bottone === 'di nuovo' ? 'Provala di nuovo' : i.bottone === 'fonti' ? 'Vai alle Fonti' : 'Collega')}
      </button>}
    </div>
    {i.seconda && <p className="prova-seconda">{i.seconda}</p>}
    {!!vista.esiti.length && <ol className="prova-righe">
      {vista.esiti.map(e => <Risultato key={e.id} e={e} puoScrivere={vista.puoScrivere} tocca={tocca} scrivi={scrivi} scrivendo={scrivendo.has(e.id)} />)}
      {vista.altri > 0 && <li className="prova-altri">{frasiProva.altri(vista.altri)}</li>}
    </ol>}
  </div>
}
