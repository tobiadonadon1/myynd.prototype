import type { CSSProperties } from 'react'
import { t } from '../lingua'
import { aperta, type RigaLettura } from '../lettura-fonti'
import { ConnectorIcon } from './ConnectorIcon'

/** Quello che una riga dice di sé, a destra del nome. */
export function testoRiga(r: RigaLettura): string {
  return r.stato === 'attesa' ? t('In coda')
    : r.stato === 'leggo' ? r.testo || t('Leggo…')
    : r.stato === 'fatto' ? `✓ ${r.testo}`
    : r.stato === 'avviso' ? r.testo
    : `${t('Non letta')} · ${r.testo}`
}

const NASCOSTO: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }

/**
 * Una riga per fonte mentre si leggono insieme: nel primo avvio e nel pannello
 * delle connessioni, con le classi di ognuno.
 *
 * La lista intera stava sotto `aria-live`, e un lettore di schermo annunciava
 * ogni avanzamento: «12 documenti», «13 documenti», «14 documenti». Adesso si
 * annuncia una fonte quando finisce (letta, a metà, o non letta), una volta.
 */
export function RigheLettura({ righe, nome, classe, icona = 16 }: {
  righe: RigaLettura[]; nome: (id: string) => string; classe: 'onboard' | 'connections'; icona?: number
}) {
  return <>
    <ul className={`${classe}-reading`} aria-label={t('Lettura delle fonti')}>
      {righe.map(r => <li key={r.id} className={`${classe}-reading-row is-${r.stato}`}>
        <ConnectorIcon id={r.id} size={icona} />
        <span className={`${classe}-reading-name`}>{nome(r.id)}</span>
        <span className={`${classe}-reading-state`}>{testoRiga(r)}</span>
      </li>)}
    </ul>
    <div style={NASCOSTO} aria-live="polite">
      {righe.filter(r => !aperta(r)).map(r => <span key={r.id}>{`${nome(r.id)}: ${testoRiga(r).replace(/[.!?]?$/, '.')} `}</span>)}
    </div>
  </>
}
