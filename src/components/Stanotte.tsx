// «Mentre dormivi» (F5): cosa ha fatto il turno di notte.
//
// Il turno (F2) lavora la coda di notte. La mattina le carte finite, ognuna
// con la sua prova e la cosa consegnata, e quelle che aspettano lei, con la
// domanda; su ognuna, aprirla o disfarla.
//
// Stava in una carta sua, in cima alla prima pagina, sopra il punto. Il giorno
// stesso: «That should be on the briefing. Nothing else.» Adesso è la prima
// sezione del foglio del punto (`Punto.tsx`), e sulla carta del punto c'è una
// riga che dice quante sono. Qui restano le righe e il conto.
//
// Non si dice niente di notte (il turno sta ancora lavorando), né se la notte
// non ha fatto niente: «stanotte niente» è rumore.

import type { Compito } from '../api'
import { t } from '../lingua'
import type { Lista } from '../oggi/useCompiti'
import { carteDiStanotte, consegnata } from '../oggi/bacheca'
import './stanotte.css'

/** Le carte della notte da dire, o null se non c'è niente da dire adesso. */
export function laNotte(l: Lista | undefined): { fatte: Compito[]; attende: Compito[] } | null {
  const s = l?.turno
  if (!l || !s || s.inNotte) return null
  const { fatte, attende } = carteDiStanotte(l.compiti, l.chiusi, s)
  return fatte.length || attende.length ? { fatte, attende } : null
}

/** Le righe della notte: prima quelle che aspettano lei, poi quelle finite. */
export function RigheDellaNotte({ l, notte, apri }: {
  l: Lista; notte: { fatte: Compito[]; attende: Compito[] }; apri: (c: Compito) => void
}) {
  return (
    <ul className="stanotte-righe">
      {notte.attende.map(c => <Riga key={c.id} c={c} l={l} apri={apri} aspetta />)}
      {notte.fatte.map(c => <Riga key={c.id} c={c} l={l} apri={apri} />)}
    </ul>
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
      {!chiusa && (c.stato === 'pronto' || c.stato === 'chiede') && (
        <span className="stanotte-gesti">
          <button type="button" className="pieno" onClick={() => apri(c)}>{aspetta ? t('Rispondi') : t('Apri')}</button>
          <button type="button" onClick={() => void l.disfa(c.id)}>{t('Disfa')}</button>
        </span>
      )}
    </li>
  )
}
