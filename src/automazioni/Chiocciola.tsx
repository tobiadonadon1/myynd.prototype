// La casella in cui un'automazione si scrive parlando, e la chiocciola.
//
// Il modulo a campi c'è ancora e serve — ma non è il posto in cui una persona
// *decide* cosa automatizzare. Quel momento è mentre lo sta dicendo, e otto
// tendine davanti sono il modo più sicuro di farlo smettere.
//
// La chiocciola è il pezzo che rende la casella più di una casella. Scrivendo
// `@` compare quello che Myynd sa aprire — la posta, il desktop, l'agenda, le
// chat, Claude Code — e sceglierne uno non scrive solo una parola: **attacca
// l'attrezzo**. La frase e il permesso si scrivono con lo stesso gesto, e la
// pastiglia che resta sotto è la stessa cosa che chi guarderà la scheda leggerà
// domani. Chiedere le fonti in un secondo momento, in un pannello a parte,
// vorrebbe dire che la metà che decide se l'automazione funziona si compila per
// ultima e quasi sempre male.
//
// Quello che *non* fa: non toglie niente. Un attrezzo attaccato per sbaglio si
// stacca dalla sua pastiglia, e la parola nel testo resta lì come una parola —
// perché è quello che è.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Attrezzo } from '../api'
import { t } from '../lingua'
import { Hov } from '../ui'
import { IconCroce } from '../icons'

export const RIGO: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 13,
  border: '1px solid rgba(34,39,31,.15)', background: 'rgba(255,255,255,.72)',
  color: '#22271F', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none'
}

/**
 * La pastiglia di un attrezzo.
 *
 * Porta la sua tinta, che è quella della sua fonte: le pastiglie di una scheda
 * si leggono di colpo d'occhio da due metri, e questo è il punto — «cosa apre
 * questa cosa mentre dormo» dev'essere la prima domanda a cui la scheda
 * risponde, non una da andare a cercare aprendola.
 *
 * Quando la connessione manca, la pastiglia si spegne e mette un puntino: non
 * si nasconde. Un attrezzo scollegato è la spiegazione di un'automazione che
 * non trova mai niente, ed è un'informazione, non un errore da togliere di
 * mezzo.
 */
export function Pastiglia({ a, stacca, dim = 'normale' }: {
  a: Attrezzo
  stacca?: () => void
  dim?: 'normale' | 'piccola'
}) {
  const p = dim === 'piccola'
  return (
    <span title={a.collegato ? a.spiega : `${a.spiega} · ${t('non è collegato')}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: p ? 4 : 5, flex: 'none',
        padding: p ? '2px 7px' : '3px 9px 3px 8px', borderRadius: 99,
        fontSize: p ? '10.5px' : '11.5px', fontWeight: 500, whiteSpace: 'nowrap',
        maxWidth: '100%', overflow: 'hidden',
        background: a.collegato ? `${a.tinta}1A` : 'rgba(34,39,31,.05)',
        border: `1px solid ${a.collegato ? `${a.tinta}44` : 'rgba(34,39,31,.14)'}`,
        color: a.collegato ? a.tinta : 'rgba(34,39,31,.42)'
      }}>
      <span style={{
        width: p ? 5 : 6, height: p ? 5 : 6, borderRadius: '50%', flex: 'none',
        background: a.collegato ? a.tinta : 'transparent',
        border: a.collegato ? 'none' : '1px solid rgba(34,39,31,.3)'
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.etichetta}</span>
      {stacca && (
        <Hov as="span" onClick={(e: React.MouseEvent) => { e.stopPropagation(); stacca() }}
          title={t('Staccalo')}
          style={{ display: 'grid', placeItems: 'center', cursor: 'pointer', opacity: 0.5, marginLeft: 1 }}
          hover={{ opacity: 1 }}><IconCroce size={8} /></Hov>
      )}
    </span>
  )
}

/**
 * La casella con la chiocciola.
 *
 * Il menù si apre quando la `@` è appena stata scritta e sta attaccata a
 * quello che si sta scrivendo — non a ogni chiocciola che compare nel testo,
 * altrimenti scrivere un indirizzo email aprirebbe un menù in faccia a metà
 * frase. La finestra è «dall'ultima @ fino al cursore, senza spazi»: è la
 * regola che usano tutti, ed è quella che le dita si aspettano.
 */
export function Casella({
  testo, cambia, attaccati, attacca, stacca, catalogo,
  righe = 3, segnaposto, autoFocus, invio
}: {
  testo: string
  cambia: (s: string) => void
  attaccati: string[]
  attacca: (nome: string) => void
  stacca: (nome: string) => void
  catalogo: Attrezzo[]
  righe?: number
  segnaposto?: string
  autoFocus?: boolean
  invio?: () => void
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  /** Da che posizione parte la `@` che sta guidando il menù. -1 = chiuso. */
  const [da, setDa] = useState(-1)
  const [filtro, setFiltro] = useState('')
  const [scelto, setScelto] = useState(0)

  const liberi = catalogo.filter(a =>
    !attaccati.includes(a.nome) &&
    (!filtro || a.etichetta.toLowerCase().includes(filtro.toLowerCase()) || a.nome.includes(filtro.toLowerCase()))
  )
  const aperto = da >= 0 && liberi.length > 0

  useEffect(() => { setScelto(0) }, [filtro, da])

  const guarda = (el: HTMLTextAreaElement) => {
    const fino = el.value.slice(0, el.selectionStart ?? 0)
    const chio = fino.lastIndexOf('@')
    // la @ vale se è all'inizio o dopo uno spazio, e se da lì al cursore non
    // ci sono spazi: «scrivi a mario@posta.it» non deve aprire niente
    if (chio < 0 || (chio > 0 && !/\s/.test(fino[chio - 1]))) return setDa(-1)
    const coda = fino.slice(chio + 1)
    if (/\s/.test(coda)) return setDa(-1)
    setDa(chio)
    setFiltro(coda)
  }

  /** Attacca l'attrezzo e mette il suo nome nella frase, al posto della `@…`. */
  const prendi = (a: Attrezzo) => {
    attacca(a.nome)
    const el = area.current
    if (el && da >= 0) {
      const cur = el.selectionStart ?? testo.length
      const nuovo = testo.slice(0, da) + a.etichetta + ' ' + testo.slice(cur)
      cambia(nuovo)
      const dove = da + a.etichetta.length + 1
      // il cursore va rimesso a mano: React riscrive il valore e lo manda in fondo
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(dove, dove) })
    }
    setDa(-1)
  }

  const tasti = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (aperto) {
      if (e.key === 'ArrowDown') { e.preventDefault(); return setScelto(i => (i + 1) % liberi.length) }
      if (e.key === 'ArrowUp') { e.preventDefault(); return setScelto(i => (i - 1 + liberi.length) % liberi.length) }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return prendi(liberi[scelto]) }
      if (e.key === 'Escape') { e.preventDefault(); return setDa(-1) }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && invio) { e.preventDefault(); invio() }
  }

  const scelti = attaccati
    .map(n => catalogo.find(a => a.nome === n))
    .filter((a): a is Attrezzo => !!a)

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={area} value={testo} rows={righe} autoFocus={autoFocus}
        onChange={e => { cambia(e.target.value); guarda(e.target) }}
        onKeyUp={e => guarda(e.currentTarget)}
        onClick={e => guarda(e.currentTarget)}
        onBlur={() => setTimeout(() => setDa(-1), 140)}
        onKeyDown={tasti}
        placeholder={segnaposto}
        aria-label={segnaposto}
        style={{ ...RIGO, resize: 'vertical', lineHeight: 1.6, fontSize: '14px', padding: '12px 14px' }} />

      {aperto && (
        <div style={{
          position: 'absolute', zIndex: 20, left: 6, right: 6, top: '100%', marginTop: 5,
          borderRadius: 16, overflow: 'hidden', padding: 5,
          background: 'rgba(255,253,249,.97)',
          backdropFilter: 'blur(30px) saturate(1.5)', WebkitBackdropFilter: 'blur(30px) saturate(1.5)',
          border: '1px solid rgba(255,255,255,.9)',
          boxShadow: '0 22px 50px -14px rgba(84,64,44,.34)',
          animation: 'fadein .14s ease'
        }}>
          <div style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase',
            color: 'rgba(34,39,31,.4)', padding: '6px 10px 5px'
          }}>{t('cosa può aprire')}</div>
          {liberi.map((a, i) => (
            <div key={a.nome}
              onMouseDown={e => { e.preventDefault(); prendi(a) }}
              onMouseEnter={() => setScelto(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 11, cursor: 'pointer',
                background: i === scelto ? 'rgba(34,39,31,.06)' : 'transparent'
              }}>
              <span style={{
                width: 9, height: 9, flex: 'none', borderRadius: '50%',
                background: a.collegato ? a.tinta : 'transparent',
                border: a.collegato ? 'none' : '1px solid rgba(34,39,31,.28)',
                boxShadow: a.collegato ? `0 0 0 3px ${a.tinta}22` : 'none'
              }} />
              <span style={{ fontSize: '13.5px', color: '#22271F', flex: 'none' }}>{a.etichetta}</span>
              <span style={{
                fontSize: '11.5px', color: 'rgba(34,39,31,.48)', flex: 1, minWidth: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>{a.spiega}</span>
              {!a.collegato && (
                <span style={{ fontSize: '10px', color: 'rgba(34,39,31,.4)', flex: 'none' }}>{t('da collegare')}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!!scelti.length && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
          {scelti.map(a => <Pastiglia key={a.nome} a={a} stacca={() => stacca(a.nome)} />)}
        </div>
      )}
    </div>
  )
}
