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

import type { Compito, StatoTurno } from '../api'
import { frasi, t } from '../lingua'
import type { Lista } from '../oggi/useCompiti'
import { carteDiStanotte, consegnata } from '../oggi/bacheca'
import './stanotte.css'

/**
 * Le carte della notte da dire, o null se non c'è niente da dire adesso.
 * F9: anche una notte senza carte finite ha da dire, se si è fermata (il
 * budget, il bottone) o se il Mac ha dormito con delle carte in coda.
 */
export function laNotte(l: Lista | undefined): { fatte: Compito[]; attende: Compito[] } | null {
  const s = l?.turno
  if (!l || !s || s.inNotte) return null
  const { fatte, attende } = carteDiStanotte(l.compiti, l.chiusi, s)
  const daDire = !!s.stanotte.fermata || !!s.stanotte.buchi?.length
  return fatte.length || attende.length || daDire ? { fatte, attende } : null
}

/** «HH:MM» di un istante ISO. */
const ora = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/**
 * F9 · la riga della notte, solo con i pezzi che ci sono: «Last night: 5
 * done, 1 needs you · $1.42 of $3 · 2 wait for tonight's budget · Mac asleep
 * 01:10 to 05:40». Il costo si dice se la notte ha speso, o se c'è un budget.
 */
export function rigaDellaNotte(s: StatoTurno | null | undefined, n: { fatte: Compito[]; attende: Compito[] }): string {
  const pezzi = [frasi.stanotteFatte(n.fatte.length, n.attende.length)]
  const x = s?.stanotte
  if (x) {
    const costo = x.costo ?? 0
    if (x.limite) { if (costo > 0 || x.fermata === 'budget') pezzi.push(frasi.spesaDelTurno(costo, x.limite)) }
    else if (costo > 0) pezzi.push(frasi.dollari(costo))
    if (x.fermata === 'budget' && x.rimaste) pezzi.push(frasi.aspettanoIlBudget(x.rimaste))
    if (x.fermata === 'stop') pezzi.push(t('fermato da te'))
    for (const b of (x.buchi ?? []).slice(0, 2)) pezzi.push(frasi.macAddormentato(ora(b.da), ora(b.a)))
  }
  return pezzi.join(' · ')
}

/** Le righe della notte: prima quelle che aspettano lei, poi quelle finite. */
export function RigheDellaNotte({ l, notte, apri }: {
  l: Lista; notte: { fatte: Compito[]; attende: Compito[] }; apri: (c: Compito) => void
}) {
  return (
    <>
    {/* F9 · in testa, la riga della notte: quante, quanto è costata, cosa l'ha fermata */}
    <p className="stanotte-conto">{rigaDellaNotte(l.turno, notte)}</p>
    <ul className="stanotte-righe">
      {notte.attende.map(c => <Riga key={c.id} c={c} l={l} apri={apri} aspetta />)}
      {notte.fatte.map(c => <Riga key={c.id} c={c} l={l} apri={apri} />)}
    </ul>
    </>
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
