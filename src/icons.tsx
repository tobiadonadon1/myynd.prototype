type P = { size?: number; style?: React.CSSProperties }

export const IconCerca = ({ size = 16, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={style}>
    <circle cx="11" cy="11" r="6.5" /><path d="M16.5 16.5 21 21" />
  </svg>
)

export const IconPiu = ({ size = 14, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={style}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconSu = ({ size = 17, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
)

export const IconCestino = ({ size = 13, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.8 12.2A1.6 1.6 0 0 0 8.9 20.7h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
  </svg>
)

// Il colore lo decide chi la usa: `currentColor` la fa ereditare dal testo che
// le sta accanto. Era fissa color ruggine, e sulla card scura in cima — dove
// tutto il resto è bianco — restava l'unica cosa che sembrava di un'altra app.
export const IconDoc = ({ size = 22, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" style={style}>
    <path d="M6 3.2h7.4L18.6 8.4V20.8H6Z" /><path d="M13.2 3.4v5.2h5.2" />
    <path d="M8.6 12.6h7M8.6 15.4h7M8.6 18h4.4" strokeLinecap="round" />
  </svg>
)

// Una freccia con l'asta, non un chevron: in fondo alla frase ce n'è già uno
// che apre il testo, e due segni uguali con due significati diversi nella
// stessa riga si leggono come lo stesso segno rotto. Questa indica la voce —
// «questa qui» — e la riga intera ci porta sopra.
export const IconFrecciaDx = ({ size = 13, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M4 12h14M13 7l5 5-5 5" />
  </svg>
)

export const IconApri = ({ size = 12, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </svg>
)

export const IconSpunta = ({ size = 15, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#3E7350" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

export const IconGiu = ({ size = 12, stroke = 'rgba(34,39,31,.5)' }: P & { stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10l5 5 5-5" />
  </svg>
)

export const IconSuPiccola = ({ size = 13 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgba(34,39,31,.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 14l5-5 5 5" />
  </svg>
)

export const IconEspandi = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
)

export const IconChat = ({ size = 18, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" style={style}>
    <path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-4.5 4v-4.4A3.5 3.5 0 0 1 4 12.5Z" />
  </svg>
)

export const IconFulmine = ({ size = 18, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" style={style}>
    <path d="M13 2.5 5.5 13H11l-1 8.5L18.5 10H13Z" />
  </svg>
)

export const IconIngranaggio = ({ size = 17, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" style={style}>
    <path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.86a.5.5 0 0 0 .12.62l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.12.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z" />
  </svg>
)

export const IconMappa = ({ size = 16, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={style}>
    <circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="13" r="2.4" />
    <circle cx="6.5" cy="18.5" r="2" /><circle cx="18" cy="18" r="2" />
    <path d="m7.7 8.5 2.6 3M16.4 7.6 13.6 11.4M10.4 14.6l-2.5 2.5M14 14.4l2.6 2.2" />
  </svg>
)

export const IconSpina = ({ size = 16, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={style}>
    <path d="M9 2.8v4.4M15 2.8v4.4" />
    <rect x="6.2" y="7.2" width="11.6" height="7" rx="3" />
    <path d="M12 14.2v3.6a3.2 3.2 0 0 1-3.2 3.2H7" />
  </svg>
)

export const IconEsci = ({ size = 16, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M14.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-3.5" />
    <path d="M10 15.5 13.5 12 10 8.5M13.5 12H4.5" />
  </svg>
)

/** Il giro: «vai a guardare di nuovo». La rassegna lo usa per ribussare ai giornali. */
export const IconGiro = ({ size = 14, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M20 11a8 8 0 1 0-.9 4.6" /><path d="M20 5v6h-6" />
  </svg>
)

/**
 * La croce del «non mi interessa».
 *
 * Disegnata, non scritta. Il carattere «×» ha le sue metriche e nel tondo di un
 * bottone si siede alto e a sinistra: due tratti in un riquadro sono centrati
 * per costruzione, a qualunque misura.
 */
export const IconCroce = ({ size = 11, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={style}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

/** Scrive: le automazioni che ti preparano un testo. */
export const IconPenna = ({ size = 15, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M14.5 7.5 16.5 9.5" />
  </svg>
)

/** Segnala: quelle che ti lasciano una riga e basta. */
export const IconOcchio = ({ size = 15, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" />
  </svg>
)

/** Riordina: quelle che si offrono di mettere via qualcosa. */
export const IconScatola = ({ size = 15, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8Z" /><path d="M2.5 4.5h19V8h-19z" /><path d="M10 12h4" />
  </svg>
)
