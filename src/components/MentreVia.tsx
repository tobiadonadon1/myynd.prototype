// Mentre non c'eri: la carta in cima alla prima pagina.
//
// «When I hop on it, there's not such a big cluster.» Al suo posto c'era la
// ricevuta, che metteva in cima le stesse righe dei blocchi sotto: la carta
// che chiede, la bozza da approvare, la domanda di Myynd. Tre righe dette due
// volte. Adesso in cima c'è quello che ha fatto lui, e basta: una frase con i
// numeri («I read 41 things, prepared 2 drafts… and set aside 29.»), e al
// più tre cose fatte e non ancora viste, una riga ciascuna, col pallino. Ogni
// numero apre il suo elenco; quello che aspetta lui sta nei blocchi, con il
// suo gesto. Senza niente da dire la carta non c'è: mai «niente da segnalare».

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { frasi, lingua, t } from '../lingua'
import { useFocoDialogo } from '../ui'
import { IconAvanti, IconCroce } from '../icons'
import { api, type AspettaMattina, type Compito, type LavoroVia, type Mattina, type RigaElencoVia, type SettimanaTracce } from '../api'
import type { Vals } from '../vals'
import type { Lista } from '../oggi/useCompiti'
import { contiVia, frase, inCima, lavoriDi, qualcosa, RAGIONI, type GenereConto } from '../via'
import { segnaVisto, useVistiOra } from '../visti'
import { CARTA, FOGLIO, VELO } from './Punto'
import './mentre-via.css'

/** Dove sta una cosa fatta, in due parole accanto al titolo. */
function doveDi(x: LavoroVia): string {
  if (x.genere === 'file') return x.nome ?? ''
  if (x.genere === 'bozza') return t('nella tua casella')
  if (x.genere === 'notion') return t('su Notion')
  if (x.genere === 'nota') return t('in Note')
  return ''
}

/** Il titolo dell'elenco dietro un conto. */
const TITOLI: Record<GenereConto, string> = {
  letti: 'Letto', bozze: 'Bozze', file: 'File', notion: 'Pagine di Notion', daParte: 'Messo da parte'
}

/**
 * Aprire una cosa fatta: la carta se è ancora in lista (si apre il lavoro),
 * il file o la bozza dal server se è già chiusa, la pagina di Notion nel
 * browser. In ogni caso è vista.
 */
function useApri(l: Lista | undefined, apri: (c: Compito) => void) {
  return (x: LavoroVia) => {
    segnaVisto(x.id)
    if (x.genere === 'notion') {
      if (x.url) window.open(x.url, '_blank', 'noopener')
      return
    }
    const c = l?.compiti.find(k => k.id === x.id)
    if (c) apri(c)
    else void l?.portami(x.id)
  }
}

function RigaLavoro({ x, nuova, apri }: { x: LavoroVia; nuova: boolean; apri: (x: LavoroVia) => void }) {
  const dove = doveDi(x)
  return (
    <button type="button" className="via-riga" onClick={() => apri(x)} aria-label={`${t('Apri')}: ${x.titolo}`}>
      <span className={nuova ? 'via-punto' : 'via-punto spento'} aria-hidden="true" />
      <span className="via-titolo" title={x.titolo}>{x.titolo}</span>
      {dove && <span className="via-dove" title={dove}>· {dove}</span>}
      <IconAvanti size={11} style={{ flex: 'none', opacity: .45 }} />
    </button>
  )
}

/** L'elenco dietro un conto: un foglio, una riga per cosa, la seconda linea dice dove o perché. */
function Elenco({ conto, m, apri, apriDoc, chiudi }: {
  conto: GenereConto; m: Mattina; apri: (x: LavoroVia) => void; apriDoc: (doc: string) => void; chiudi: () => void
}) {
  const foglio = useRef<HTMLDivElement>(null)
  useFocoDialogo(foglio, chiudi)
  const esame = conto === 'letti' || conto === 'daParte'
  const [righe, setRighe] = useState<RigaElencoVia[] | null>(esame ? null : [])
  const [totale, setTotale] = useState(0)
  const visteOra = useVistiOra()
  useEffect(() => {
    if (!esame) return
    let vivo = true
    api.elencoVia(conto).then(r => { if (vivo) { setRighe(r.righe); setTotale(r.totale) } }).catch(() => { if (vivo) setRighe([]) })
    return () => { vivo = false }
  }, [conto, esame])
  const lavori = lavoriDi(m.via, conto)
  // il numero sulla carta, e quante righe l'elenco ne porta: quello che resta si dice, non si tace
  const oltre = esame ? Math.max(0, totale - (righe?.length ?? 0)) : Math.max(0, contiVia(m.via)[conto] - lavori.length)
  // in fondo alla pagina: la carta ha il vetro sfocato, e un velo fisso dentro di lei resterebbe chiuso nella carta
  return createPortal(
    <div style={VELO} onMouseDown={e => { if (e.target === e.currentTarget) chiudi() }}>
      <div ref={foglio} role="dialog" aria-modal="true" aria-labelledby="via-elenco-titolo" tabIndex={-1} style={FOGLIO}>
        <button type="button" onClick={chiudi} title={t('Chiudi')} aria-label={t('Chiudi')}
          style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 99, border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(var(--inchiostro-rgb),.4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconCroce size={11} />
        </button>
        <h1 id="via-elenco-titolo" style={{ margin: 0, fontSize: 28, lineHeight: 1.2, paddingRight: 34, overflowWrap: 'anywhere' }}>{t(TITOLI[conto])}</h1>
        {esame && righe === null && <div style={{ marginTop: 18, fontSize: 13, color: 'rgba(var(--inchiostro-rgb),.5)' }}>{t('Un momento…')}</div>}
        {esame && righe && (
          <ul className="via-elenco">
            {righe.map(r => {
              const perche = [r.autore, r.ragione ? t(RAGIONI[r.ragione] ?? '') : r.fase === 'carta' ? t('Sul tavolo') : ''].filter(Boolean).join(' · ')
              return (
                <li key={r.doc}>
                  <button type="button" className="via-riga" onClick={() => apriDoc(r.doc)}>
                    <span className="via-testo">
                      <span className="via-titolo" title={r.titolo}>{r.titolo}</span>
                      {perche && <span className="via-perche" title={perche}>{perche}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {!esame && (
          <ul className="via-elenco">
            {lavori.map(x => (
              <li key={x.id}><RigaLavoro x={x} nuova={!x.visto && !visteOra.has(x.id)} apri={apri} /></li>
            ))}
          </ul>
        )}
        {oltre > 0 && <div className="via-oltre">{frasi.eAltre(oltre)}</div>}
      </div>
    </div>,
    document.body
  )
}

/**
 * La carta. `lettera` è la riga «Myynd ti ha scritto»: sta solo qui, perché
 * la chat non ha un blocco. Le altre cose che aspettano lui stanno nei blocchi.
 * `riassunto`: il punto di oggi, finché non l'ha aperto: una riga quieta in
 * fondo, perché la carta non ha più il bottone che lo apriva.
 */
export function MentreVia({ v, m, ricevuta, l, apri, riassunto = null }: {
  v: Vals; m: Mattina | null; ricevuta: readonly AspettaMattina[]; l?: Lista; apri: (c: Compito) => void
  riassunto?: { cose: number; apri: () => void } | null
}) {
  const [aperto, setAperto] = useState<GenereConto | null>(null)
  const visteOra = useVistiOra()
  const apriLavoro = useApri(l, apri)
  const conti = contiVia(m?.via)
  const pezzi = frase(conti, lingua())
  const cima = inCima(m?.via, visteOra)
  const lettera = ricevuta.find(a => a.genere === 'lettera')
  // il numero solo della settimana (`tracce.ts`): quante consegne ha preso, e quanto sono costate
  const [settimana, setSettimana] = useState<SettimanaTracce | null>(null)
  useEffect(() => {
    let vivo = true
    api.settimana().then(r => { if (vivo) setSettimana(r) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  const prese = settimana ? settimana.accettate + settimana.modificate : 0
  if (!m || (!qualcosa(conti) && !cima.length && !lettera && !riassunto)) return null
  return (
    <section aria-labelledby="via-titolo" style={{ ...CARTA, flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
      <h2 id="via-titolo" style={{ margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{t('Mentre non c’eri.')}</h2>
      {pezzi.length > 0 && (
        <p className="via-frase">
          {pezzi.map((p, i) => p.conto
            ? <button key={i} type="button" className="via-conto" onClick={() => setAperto(p.conto!)}>{p.testo}</button>
            : <span key={i}>{p.testo}</span>)}
        </p>
      )}
      {(cima.length > 0 || lettera) && (
        <ul className="via-righe">
          {cima.map(x => <li key={x.id}><RigaLavoro x={x} nuova apri={apriLavoro} /></li>)}
          {lettera && (
            <li>
              <button type="button" className="via-riga" onClick={() => v.goChat()}>
                <span className="via-punto" aria-hidden="true" />
                <span className="via-titolo">{lettera.titolo}</span>
                <span className="via-dove" />
                <IconAvanti size={11} style={{ flex: 'none', opacity: .45 }} />
              </button>
            </li>
          )}
        </ul>
      )}
      {prese > 0 && settimana && <p className="via-settimana">{frasi.settimanaPrese(prese, settimana.costo)}</p>}
      {riassunto && (
        <button type="button" className="via-riassunto" onClick={riassunto.apri}>
          {t('Il punto di oggi')} <span>· {frasi.coseNelPunto(riassunto.cose)}</span>
        </button>
      )}
      {aperto && (
        <Elenco conto={aperto} m={m} apri={x => { setAperto(null); apriLavoro(x) }}
          apriDoc={doc => { setAperto(null); void v.portamiFonte(doc) }} chiudi={() => setAperto(null)} />
      )}
    </section>
  )
}
