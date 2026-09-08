import type { ReactNode } from 'react'
import { t } from '../lingua'

export function connectorPerAttrezzo(nome: string, serve?: string | null) {
  const id = serve ?? nome.split('.')[0]
  return id === 'agenda' ? 'calendario' : id === 'chat' ? 'conversazioni' : id
}

/** Local vector marks, in the same optical size and palette as Myynd controls. */
export function ConnectorIcon({ id, size = 28 }: { id: string; size?: number }) {
  const marks: Record<string, ReactNode> = {
    posta: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
    calendario: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 3h2" /></>,
    desktop: <><rect x="2.5" y="4" width="19" height="13" rx="2.5" /><path d="M8 21h8m-4-4v4M7 8h5" /></>,
    notion: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 17V7l8 10V7" strokeWidth="2" /></>,
    granola: <><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v18m3-13h4m-4 4h4" /></>,
    conversazioni: <><path d="M14 14H7l-4 3V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5a3 3 0 0 1-3 3Z" /><path d="M8 17v1a2 2 0 0 0 2 2h6l4 2V11a2 2 0 0 0-1-1.7" /></>,
    claude: <><path d="M12 2v6m0 8v6M2 12h6m8 0h6M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4M8 2.7l2.1 5.6m3.8 7.4 2.1 5.6M2.7 16l5.6-2.1m7.4-3.8L21.3 8" /></>,
    google: <><path d="M20 7a9 9 0 1 0 1 5h-9" strokeWidth="2.6" /></>,
    microsoft: <><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z" fill="currentColor" stroke="none" /></>,
    slack: <><path d="M9 3v12M3 9h12m0 12V9m6 6H9" strokeWidth="3.4" /><path d="M3 4v1m17 0h1M4 20h1m15 0v1" strokeWidth="3.4" /></>,
    whatsapp: <><path d="M21 11.5a9 9 0 0 1-13.5 7.8L3 21l1.6-4.7A9 9 0 1 1 21 11.5Z" /><path d="M8 7c-1 2 1 6 5 8 1.5.5 2.5 0 3-1l-2-2-1.5 1c-1.5-.8-2.8-2-3.5-3.5l1-1.5L8 7Z" /></>,
    drive: <><path d="m9 3 6 0 7 12-3.5 6h-13L2 15 9 3Zm0 0 9.5 18M15 3 5.5 21M2 15h20" /></>,
    sharepoint: <><circle cx="16" cy="7" r="4" /><circle cx="17" cy="16" r="5" /><rect x="2" y="7" width="11" height="12" rx="2" fill="var(--connector-face, #fcfaf4)" /><path d="M9 10H6a1.5 1.5 0 0 0 0 3h1.5a1.5 1.5 0 0 1 0 3H5" /></>,
    dropbox: <><path d="m7 3 5 4-5 4-5-4 5-4Zm10 0 5 4-5 4-5-4 5-4ZM7 11l5 4-5 4-5-4 5-4Zm10 0 5 4-5 4-5-4 5-4Zm-9 9 4 3 4-3" /></>,
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
    <span className="connector-tile-mark"><ConnectorIcon id={id} size={27} /></span>
    <span className="connector-tile-name">{t(nome)}</span>
    <span className="connector-tile-status"><i aria-hidden="true" />{collegata ? t('Collegato') : t('Collega')}</span>
    <span className="connector-tile-arrow" aria-hidden="true">↗</span>
  </button>
}
