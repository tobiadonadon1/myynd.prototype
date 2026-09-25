import { useState, type CSSProperties, type ReactNode } from 'react'

/**
 * La scatola in cui si scrive: la stessa della barra che aggiunge una cosa
 * da fare (`Barra.tsx`), copiata e non ridisegnata.
 *
 * «This input bar is very small and it's not designed like the others. I
 * liked the other designs better.» Un campo sottolineato in fondo alla
 * pagina e una casella con un altro raggio dentro una riga erano tre disegni
 * per lo stesso mestiere. Da qui in poi è uno: raggio 14, la carta all'86%,
 * il vetro, e il bordo che si accende quando ci sei dentro.
 *
 * Stava in `Myynd.tsx`; sta qui perché la usano anche le righe della lista
 * e la riga dell'ipotesi, e un componente che importa la prima pagina per
 * prendersi una scatola è un giro che non serve.
 */
export function Scatola({ children, alto = false }: { children: ReactNode; alto?: boolean }) {
  const [fuoco, setFuoco] = useState(false)
  return (
    <div onFocus={() => setFuoco(true)} onBlur={() => setFuoco(false)} style={{
      flex: 1, minWidth: 0, display: 'flex', alignItems: alto ? 'flex-end' : 'center', gap: 6,
      padding: alto ? '9px 9px 9px 15px' : '3px 9px 3px 15px', borderRadius: 14,
      background: 'rgba(var(--carta-rgb),.86)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
      border: `1px solid ${fuoco ? 'rgba(var(--inchiostro-rgb),.26)' : 'rgba(var(--luce-rgb),.9)'}`,
      boxShadow: fuoco ? '0 8px 26px rgba(var(--ombra-rgb),.10)' : '0 4px 16px rgba(var(--ombra-rgb),.05)',
      transition: 'border-color .15s, box-shadow .15s'
    }}>{children}</div>
  )
}

/** Il campo dentro la scatola: senza bordo suo, è la scatola che lo veste. */
export const CAMPO: CSSProperties = {
  flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none',
  color: 'var(--inchiostro)', fontSize: '13.5px', fontFamily: 'inherit', padding: '7px 0'
}
