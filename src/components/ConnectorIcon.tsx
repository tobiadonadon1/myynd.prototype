import type { ReactNode } from 'react'
import { t } from '../lingua'
import { IconAvanti } from '../icons'
import { MARCHI } from './marchi'

export function connectorPerAttrezzo(nome: string, serve?: string | null) {
  const id = serve ?? nome.split('.')[0]
  return id === 'agenda' ? 'calendario' : id === 'chat' ? 'conversazioni' : id
}

/**
 * Quale marchio vero porta ogni fonte.
 *
 * Non tutte ne hanno uno, e la differenza non è una mancanza: «Posta» è IMAP,
 * cioè un protocollo, non un prodotto; «Calendario» è un indirizzo iCal;
 * «Desktop» sono le tue cartelle; «Fornitore compatibile» è chiunque parli
 * come OpenAI. Mettere il logo di Gmail su «Posta» direbbe una cosa falsa —
 * che quella scheda è di Google — proprio a chi ci collega la casella di
 * Aruba. Chi non è un prodotto tiene il disegno di casa, qui sotto.
 */
const DI_MARCA: Record<string, string> = {
  google: 'gmail',
  microsoft: 'microsoftoutlook',
  slack: 'slack',
  whatsapp: 'whatsapp',
  drive: 'googledrive',
  sharepoint: 'microsoftsharepoint',
  dropbox: 'dropbox',
  notion: 'notion',
  note: 'apple',
  claude: 'claude',
  teams: 'microsoftteams'
}

/**
 * Il segno di una fonte.
 *
 * Collegata, porta i suoi colori veri: è viva, ed è quello che la fa trovare
 * in mezzo alle altre senza leggere. Da collegare, resta del colore della
 * piastrella — un grigio caldo — perché un elenco di loghi accesi tutti
 * insieme è un catalogo di prodotti altrui, non lo stato del tuo Myynd. È la
 * stessa regola del resto dell’app: il colore dove distingue, e da nessuna
 * altra parte.
 */
export function ConnectorIcon({ id, size = 28, spenta = false }: { id: string; size?: number; spenta?: boolean }) {
  const marchio = MARCHI[DI_MARCA[id] ?? '']
  if (marchio) {
    return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={marchio.d} fill={spenta ? 'currentColor' : marchio.colore} />
    </svg>
  }

  /* Le categorie, non i prodotti: stessa penna e stesso peso dei controlli di Myynd. */
  const marks: Record<string, ReactNode> = {
    posta: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
    calendario: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 3h2" /></>,
    desktop: <><rect x="2.5" y="4" width="19" height="13" rx="2.5" /><path d="M8 21h8m-4-4v4M7 8h5" /></>,
    granola: <><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v18m3-13h4m-4 4h4" /></>,
    conversazioni: <><path d="M14 14H7l-4 3V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5a3 3 0 0 1-3 3Z" /><path d="M8 17v1a2 2 0 0 0 2 2h6l4 2V11a2 2 0 0 0-1-1.7" /></>,
    mind2do: <><rect x="4" y="3" width="16" height="18" rx="4" /><path d="m8 12 3 3 5-6" strokeWidth="2" /></>,
    compatibile: <><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" /><path d="M10 10h4v4h-4z" /></>
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {marks[id] ?? <><rect x="4" y="4" width="16" height="16" rx="5" /><path d="M8 12h8m-4-4v8" /></>}
  </svg>
}

export function ConnectorTile({ id, nome, collegata, apri }: { id: string; nome: string; collegata: boolean; apri: () => void }) {
  return <button type="button" className={`connector-tile ${collegata ? 'connected' : ''}`} onClick={apri} data-connector={id}
    aria-label={`${t(nome)} · ${collegata ? t('Collegato') : t('Da collegare')}`}>
    <span className="connector-tile-mark"><ConnectorIcon id={id} size={27} spenta={!collegata} /></span>
    <span className="connector-tile-name">{t(nome)}</span>
    <span className="connector-tile-status"><i aria-hidden="true" />{collegata ? t('Collegato') : t('Collega')}</span>
    <span className="connector-tile-arrow"><IconAvanti size={12} /></span>
  </button>
}
