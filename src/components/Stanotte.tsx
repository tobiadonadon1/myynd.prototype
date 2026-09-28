// «Fatto stanotte» (F5): la prima cosa della mattina.
//
// Il turno (F2) lavora la coda di notte. La mattina, prima del punto e prima
// dei blocchi, una carta dice cosa è successo mentre lei dormiva: le carte
// finite, ognuna con la sua prova e la cosa consegnata, e quelle che
// aspettano lei, con la domanda. Su ognuna, aprirla o disfarla. «Visto» la
// mette via fino alla notte dopo.
//
// Non compare di notte (il turno sta ancora lavorando), né se la notte non ha
// fatto niente: una carta che dice «stanotte niente» è rumore.

import { useState } from 'react'
import type { Compito } from '../api'
import { frasi, t } from '../lingua'
import type { Lista } from '../oggi/useCompiti'
import { carteDiStanotte, consegnata } from '../oggi/bacheca'
import './stanotte.css'

const CHIAVE = 'myynd.stanotteVista'
const vistaSalvata = (): string => { try { return localStorage.getItem(CHIAVE) ?? '' } catch { return '' } }

export function Stanotte({ l, apri }: { l: Lista; apri: (c: Compito) => void }) {
  const s = l.turno
  const [vista, setVista] = useState(vistaSalvata)
  const { fatte, attende } = carteDiStanotte(l.compiti, l.chiusi, s)
  if (!s || s.inNotte || (!fatte.length && !attende.length) || vista === s.stanotte.dal) return null
  const metti = () => { setVista(s.stanotte.dal); try { localStorage.setItem(CHIAVE, s.stanotte.dal) } catch { /* senza memoria torna alla prossima apertura */ } }
  return (
    <section className="stanotte" aria-labelledby="stanotte-titolo">
      <header>
        <div>
          <h2 id="stanotte-titolo"><i aria-hidden="true">☾</i>{t('Mentre dormivi')}</h2>
          <p>{frasi.stanotteFatte(fatte.length, attende.length)}</p>
        </div>
        <button type="button" className="stanotte-visto" onClick={metti}>{t('Visto')}</button>
      </header>
      <ul>
        {attende.map(c => <Riga key={c.id} c={c} l={l} apri={apri} aspetta />)}
        {fatte.map(c => <Riga key={c.id} c={c} l={l} apri={apri} />)}
      </ul>
    </section>
  )
}

function Riga({ c, l, apri, aspetta = false }: { c: Compito; l: Lista; apri: (c: Compito) => void; aspetta?: boolean }) {
  const chiusa = c.stato === 'fatto'
  const cosa = consegnata(c)
  const detto = aspetta
    ? (c.chieste?.[0]?.domanda ?? (c.stato === 'chiede' ? c.risultato?.split('\n').find(r => r.trim().endsWith('?')) : null) ?? (c.guaio ? t(c.guaio) : c.prova?.perche) ?? '')
    : c.prova?.esito === 'pass' ? c.prova.perche : ''
  return (
    <li className={aspetta ? 'aspetta' : chiusa ? 'chiusa' : 'fatta'}>
      <span className="stanotte-segno" aria-hidden="true">{aspetta ? '?' : '✓'}</span>
      <div className="stanotte-testo">
        <span className="stanotte-titolo">{c.testo}</span>
        {detto && <span className="stanotte-detto">{detto}</span>}
        {!aspetta && cosa.tipo === 'file' && cosa.nome && <span className="stanotte-cosa">{cosa.nome}</span>}
        {!aspetta && cosa.tipo === 'casella' && <span className="stanotte-cosa">{t('Bozza nella tua casella')}</span>}
      </div>
      {!chiusa && (
        <span className="stanotte-gesti">
          {(c.stato === 'pronto' || c.stato === 'chiede') && (
            <button type="button" className="pieno" onClick={() => apri(c)}>{aspetta ? t('Rispondi') : t('Apri')}</button>
          )}
          {(c.stato === 'pronto' || c.stato === 'chiede') && (
            <button type="button" onClick={() => void l.disfa(c.id)}>{t('Disfa')}</button>
          )}
        </span>
      )}
    </li>
  )
}
