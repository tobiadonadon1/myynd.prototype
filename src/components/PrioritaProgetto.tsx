// La priorità di un progetto, dove il progetto si vede: il blocco della prima
// pagina, la scheda della Memoria, la sua pagina.
//
// «Add a way to mark project priority», dalla prima persona da fuori che l'ha
// provato. Una parola sola, «alta», e non tre gradini: per un progetto che
// conta meno degli altri c'è già «fermo», e due modi di dire «non adesso»
// sarebbero una domanda in più senza una risposta diversa. La parola è quella
// delle righe della lista, e la pastiglia pure (`task-priorita alta`, rame
// velato): la stessa cosa si scrive allo stesso modo.
//
// Un controllo solo, che è anche quello che la mostra. Accesa è la pastiglia
// di rame con la sua ×, come i nomi che si tolgono; spenta è la stessa
// pastiglia vuota con il suo +, e sulle schede compare sotto mano, come gli
// altri gesti che si fanno di rado. Il rame c'è solo quando è accesa: è
// l'unico accento dell'app, e qui vuol dire una cosa sola.

import { t } from '../lingua'
import { Hov } from '../ui'
import { IconPiu } from '../icons'

export function PrioritaProgetto({ alta, cambia, visibile = true, nome }: {
  alta: boolean
  cambia: (alta: boolean) => void
  /** Spenta, si vede solo quando la scheda è sotto mano; accesa si vede sempre. */
  visibile?: boolean
  /** Il nome del progetto, per chi legge con la voce: «Priorità alta: Evermute». */
  nome?: string
}) {
  const mostra = alta || visibile
  return (
    <Hov as="button" type="button" aria-pressed={alta}
      aria-label={nome ? `${t('Priorità alta')}: ${nome}` : t('Priorità alta')}
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); cambia(!alta) }}
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
      style={{
        flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: alta ? '2px 9px' : '2px 9px 2px 7px', borderRadius: 99,
        fontFamily: 'inherit', fontSize: '11px', fontWeight: 500, letterSpacing: 0, textTransform: 'none', lineHeight: 1.5,
        whiteSpace: 'nowrap', cursor: 'pointer',
        color: alta ? 'var(--rame-testo)' : 'rgba(var(--inchiostro-rgb),.55)',
        background: alta ? 'rgba(var(--rame-rgb),.12)' : 'transparent',
        border: `1px solid ${alta ? 'rgba(var(--rame-rgb),.3)' : 'rgba(var(--inchiostro-rgb),.16)'}`,
        // spenta e non sotto mano: non si vede, ma resta raggiungibile con Tab,
        // e prendendo il fuoco accende la scheda che la contiene
        opacity: mostra ? 1 : 0, transition: 'opacity .15s, border-color .15s, color .15s'
      }}
      hover={alta ? { borderColor: 'var(--rame)' } : { borderColor: 'var(--rame)', color: 'var(--rame-testo)' }}>
      {alta
        // la × dice che si toglie, e sulle schede c'è solo sotto mano: ferma, la pastiglia dice e basta
        ? <>{t('Priorità alta')}{visibile && <span aria-hidden="true" style={{ fontSize: '12.5px', lineHeight: 1, marginLeft: 1 }}>×</span>}</>
        : <><IconPiu size={10} />{t('Priorità alta')}</>}
    </Hov>
  )
}
