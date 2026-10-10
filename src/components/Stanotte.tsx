// Le righe della ricevuta: cosa è stato fatto, cosa aspetta lui.
//
// Stavano in tre posti. «Mentre dormivi» era una carta sua in cima alla prima
// pagina, poi la prima sezione del foglio del punto («That should be on the
// briefing. Nothing else.»); la fascia scura «Myynd ti ha scritto» stava
// sopra tutto. Il 9 ottobre 2026 sono diventate una ricevuta sola, in cima,
// con le stesse righe sulla carta (le prime tre) e nel foglio (tutte): il
// server le compone (`server/mattina.ts`), qui si disegnano.
//
// Una riga è un bersaglio solo: si clicca la riga, e si apre la carta, la
// chat o la domanda. Nessun bottone per riga, tranne «Disfa» nel foglio, che
// è un gesto diverso dall'aprire e resta scritto piccolo.

import type { AspettaMattina, Compito, FattaMattina, StatoTurno } from '../api'
import { frasi, t } from '../lingua'
import type { Lista } from '../oggi/useCompiti'
import { carteDiStanotte } from '../oggi/bacheca'
import { puoDisfare } from '../oggi/Dettaglio'
import { doveSta } from '../mattina'
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
export const ora = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

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

/** La carta dietro una riga, se è ancora in lista: senza, la riga si legge e basta. */
export const cartaDi = (l: Lista | undefined, id: string): Compito | null =>
  l ? (l.compiti.find(c => c.id === id) ?? l.chiusi.find(c => c.id === id) ?? null) : null

/** Dove sta una cosa fatta, detto in parole: «Saved on your Desktop: Course outline.md», «Draft in your mailbox». */
export function detto(f: FattaMattina): string {
  const d = doveSta(f)
  if (!d) return ''
  return d.genere === 'casella' ? t('Bozza nella tua casella') : `${frasi.salvatoDove(d.luogo)} ${d.nome}`
}

/** Il perché sotto una cosa che aspetta lui: la domanda, il blocco, o niente. */
function perche(a: AspettaMattina): string {
  if (a.genere === 'carta') return a.perche ? t(a.perche) : a.motivo === 'approva' ? t('Da approvare') : ''
  if (a.genere === 'lettera') return t('Ha qualche domanda per conoscerti: due minuti.')
  // la domanda di Myynd e quella su un progetto sono già la riga
  return ''
}

/** Le cose fatte. `disfa`: il foglio offre di disfarle, la carta no. */
export function RigheFatte({ xs, l, apri, disfa = false, inCarta = false }: {
  xs: readonly FattaMattina[]; l?: Lista; apri: (c: Compito) => void; disfa?: boolean; inCarta?: boolean
}) {
  return (
    <ul className={inCarta ? 'stanotte-righe in-carta' : 'stanotte-righe'}>
      {xs.map(f => {
        const c = cartaDi(l, f.id)
        const sotto = detto(f)
        const dentro = (
          <>
            <span className="stanotte-segno" aria-hidden="true">✓</span>
            <span className="stanotte-testo">
              <span className="stanotte-titolo">{f.titolo}</span>
              {sotto && <span className="stanotte-cosa">{sotto}</span>}
            </span>
          </>
        )
        return (
          <li key={f.id} className="fatta">
            {/* una carta già chiusa non sta più nella lista: il file o la bozza si aprono lo stesso, dal server
                (era una riga morta sotto «Fatto», 9 ottobre 2026) */}
            {c ? <button type="button" className="ricevuta-apri" onClick={() => apri(c)}>{dentro}</button>
              : l && f.dove.genere !== 'carta' ? <button type="button" className="ricevuta-apri" aria-label={`${t('Apri')}: ${f.titolo}`} onClick={() => void l.portami(f.id)}>{dentro}</button>
              : <span className="ricevuta-apri">{dentro}</span>}
            {/* F9 · una carta chiusa si disfa per sette giorni, anche da qui */}
            {disfa && c && l && puoDisfare(c) && (
              <span className="stanotte-gesti">
                <button type="button" onClick={() => void l.disfa(c.id)}>{t('Disfa')}</button>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Quello che aspetta lui: la carta si apre, la lettera apre la chat, le domande si mostrano dove si risponde. */
export function RigheAspettano({ xs, l, apri, apriChat, apriDomande, inCarta = false }: {
  xs: readonly AspettaMattina[]; l?: Lista; apri: (c: Compito) => void; apriChat: () => void; apriDomande: () => void; inCarta?: boolean
}) {
  return (
    <ul className={inCarta ? 'stanotte-righe in-carta' : 'stanotte-righe'}>
      {xs.map(a => {
        const c = a.genere === 'carta' ? cartaDi(l, a.id) : null
        const vai = a.genere === 'carta' ? (c ? () => apri(c) : null) : a.genere === 'lettera' ? apriChat : apriDomande
        const sotto = perche(a)
        const dentro = (
          <>
            <span className="stanotte-segno" aria-hidden="true">?</span>
            <span className="stanotte-testo">
              <span className="stanotte-titolo">{a.titolo}</span>
              {sotto && <span className="stanotte-detto">{sotto}</span>}
            </span>
          </>
        )
        return (
          <li key={`${a.genere}:${a.id}`} className="aspetta">
            {vai ? <button type="button" className="ricevuta-apri" onClick={vai}>{dentro}</button> : <span className="ricevuta-apri">{dentro}</span>}
          </li>
        )
      })}
    </ul>
  )
}
