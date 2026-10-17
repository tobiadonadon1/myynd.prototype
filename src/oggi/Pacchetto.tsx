import { useEffect, useState, type CSSProperties } from 'react'
import { Hov } from '../ui'
import { frasi, t } from '../lingua'
import { api, type Compito, type PacchettoSeguito } from '../api'
import { preparaApertura } from '../navigazione'
import { Casella } from '../components/forme'
import type { Lista } from './useCompiti'

const PIENO: CSSProperties = {
  padding: '8px 17px', borderRadius: 99, border: '1px solid transparent',
  background: 'var(--gradiente-rame)', color: 'var(--avorio)',
  fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
}
const CONTORNO: CSSProperties = { ...PIENO, border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'none', color: 'var(--inchiostro)' }
const LINK: CSSProperties = { border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12, color: 'var(--rame-testo)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }
const PICCOLO: CSSProperties = { fontSize: '12.5px', color: 'rgba(var(--inchiostro-rgb),.55)', lineHeight: 1.5, overflowWrap: 'anywhere' }
const PARTE: CSSProperties = { marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(var(--inchiostro-rgb),.08)' }
const TITOLO: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(var(--inchiostro-rgb),.45)', marginBottom: 6 }

/** Apre un documento dell'indice (la mail, il file originale) dove sta sul Mac. */
async function apriDocumento(id: string) {
  const apertura = preparaApertura()
  try { await apertura.completa(await api.portamiDocumento(id)) } catch { /* resta dov'è */ } finally { apertura.annulla() }
}

/**
 * Il pacchetto del seguito, sotto la carta: la risposta, il documento nuovo,
 * il prossimo impegno, ognuno col suo perché e le sue prove. Tre gesti: Manda
 * su Slack (o Apri la bozza), Fatto, Non rilevante.
 */
export function Pacchetto({ c, l }: { c: Compito; l: Lista }) {
  const [p, setP] = useState<PacchettoSeguito | null>(null)
  const [testo, setTesto] = useState('')
  const [mando, setMando] = useState(false)
  const [errore, setErrore] = useState('')
  useEffect(() => {
    let vivo = true
    api.pacchetto(c.id).then(r => { if (vivo) { setP(r.pacchetto); setTesto(r.pacchetto.risposta?.testo ?? '') } }).catch(() => {})
    return () => { vivo = false }
  }, [c.id, c.versione])
  if (!p) return null
  const r = p.risposta
  const slack = r?.canale === 'slack' && !!p.slack && !r.inviata
  /** Non ha passato il controllo: parte solo dopo che lui l'ha cambiata (il server rifiuta lo stesso). */
  const ferma = slack && p.stato === 'non_regge' && testo.trim() === r!.testo.trim()
  const manda = async () => {
    if (!p.slack || mando || !testo.trim()) return
    setMando(true); setErrore('')
    try {
      await api.slackInvia({ conversazione: p.slack.conversazione, filo: p.slack.filo, testo, compito: c.id })
    } catch (e) { setErrore(e instanceof Error ? t(e.message) : t('Non sono riuscito a mandarlo.')) }
    setMando(false)
  }
  const prove = p.conversazione.prove.filter(x => !x.id.includes('#'))
  return (
    <div style={{
      gridColumn: '1 / -1', marginTop: 11, marginBottom: 2, padding: '14px 17px', borderRadius: 13,
      background: 'rgba(var(--inchiostro-rgb),.045)', border: '1px solid rgba(var(--luce-rgb),.5)',
      boxShadow: 'inset 0 1px 3px rgba(var(--ombra-rgb),.09)'
    }}>
      {p.perche && <div style={PICCOLO}>{p.perche}</div>}
      {p.problemi.length > 0 && <div role="status" style={{ ...PICCOLO, color: 'var(--rame-testo)', marginTop: 6 }}>! {p.problemi[0]}</div>}

      {r && <div style={PARTE}>
        <div style={TITOLO}>{t('La risposta')}{r.a ? ` · ${r.a}` : ''}</div>
        {slack
          ? <Casella valore={testo} cambia={setTesto} righe={Math.min(8, testo.split('\n').length + 1)} etichetta={t('La risposta')} />
          : <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 280, overflowY: 'auto' }}>{r.testo}</div>}
        <div style={{ ...PICCOLO, marginTop: 6 }}>
          {r.inviata ? t('Mandata su Slack.')
            : r.casella === 'salvata' ? t('Nelle tue Bozze, non mandata.')
            : r.casella === 'trattenuta' ? t('Resta qui: le regole del progetto tengono le bozze per te.')
            : r.casella === 'errore' ? t('La casella non l’ha presa: è qui.')
            : null}
        </div>
      </div>}

      {p.consegna && <div style={PARTE}>
        <div style={TITOLO}>{t('Il documento')}</div>
        {p.consegna.percorso
          ? <><div style={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>{p.consegna.titolo}</div><div style={PICCOLO}>{frasi.versioneNuovaDi(p.consegna.da)}</div></>
          : <div style={PICCOLO}>{frasi.daCambiareIn(p.consegna.da)}</div>}
        {p.consegna.cambiamenti.length > 0 && <ul style={{ ...PICCOLO, margin: '4px 0 0', paddingLeft: 18 }}>{p.consegna.cambiamenti.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      </div>}

      {p.impegni.length > 0 && <div style={PARTE}>
        <div style={TITOLO}>{t('Il prossimo impegno')}</div>
        {p.impegni.map((i, n) => <div key={n} style={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>
          {i.cosa} <span style={PICCOLO}>· {i.chi} · {frasi.entroIl(i.entro)}{i.stimata ? ` · ${t('nel filo non c’è una data')}` : ''}</span>
        </div>)}
      </div>}

      <div style={{ ...PARTE, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={PICCOLO}>{t('Le prove')}:</span>
        {prove.map(x => x.link
          ? <a key={x.id} href={x.link} target="_blank" rel="noreferrer" style={LINK}>{x.fonte === 'slack' ? t('Apri su Slack') : x.chi}</a>
          : <button key={x.id} type="button" style={LINK} title={x.citazione.slice(0, 200)} onClick={() => void apriDocumento(x.id)}>
              {x.fonte === 'posta' ? `${t('La mail')} · ${x.chi}` : x.fonte === 'file' ? x.chi : t('La nota')}
            </button>)}
      </div>

      {errore && <p role="alert" style={{ ...PICCOLO, color: 'var(--rame-testo)' }}>{errore}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
        {ferma && <span style={{ ...PICCOLO, color: 'var(--rame-testo)', flexBasis: '100%' }}>{t('Cambiala prima di mandarla: non ha passato il controllo.')}</span>}
        {slack && <Hov as="button" type="button" onClick={() => void manda()} disabled={mando || !testo.trim() || ferma} style={{ ...PIENO, ...(ferma ? { opacity: 0.45, cursor: 'default' } : {}) }} hover={{ opacity: ferma ? 0.45 : 0.92 }}>
          {mando ? t('Mando…') : t('Manda su Slack')}</Hov>}
        {r?.casella === 'salvata' && r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ ...CONTORNO, textDecoration: 'none' }}>{t('Apri la bozza')}</a>}
        {!!p.consegna?.percorso && <Hov as="button" type="button" onClick={() => void l.portami(c.id)} style={CONTORNO} hover={{ borderColor: 'var(--rame)', color: 'var(--rame-testo)' }}>{t('Apri il file')}</Hov>}
        <Hov as="button" type="button" onClick={() => l.chiudi(c.id, t('Va bene così.'))} style={slack ? CONTORNO : PIENO}
          hover={slack ? { borderColor: 'var(--rame)', color: 'var(--rame-testo)' } : { opacity: 0.92 }}>{t('Fatto')}</Hov>
        <div style={{ flex: 1 }} />
        <Hov as="button" type="button" onClick={() => void l.lascia(c.id, 'non_mia')}
          style={{ padding: '8px 4px', border: 'none', background: 'none', color: 'rgba(var(--inchiostro-rgb),.45)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}
          hover={{ color: 'var(--inchiostro)' }}>{t('Non rilevante')}</Hov>
      </div>
    </div>
  )
}

/** «3 waiting for you on Slack»: le domande che nessun pacchetto copre ancora. Niente, se sono zero. */
export function SlackInAttesa() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    const leggi = () => { api.seguito().then(r => { if (vivo) setN(r.slackInAttesa) }).catch(() => {}) }
    leggi()
    const timer = window.setInterval(leggi, 120_000)
    window.addEventListener('focus', leggi)
    return () => { vivo = false; window.clearInterval(timer); window.removeEventListener('focus', leggi) }
  }, [])
  if (!n) return null
  return <div style={{ marginTop: 6, fontSize: '12.5px', color: 'var(--rame-testo)' }}>{frasi.slackTiAspetta(n)}</div>
}
