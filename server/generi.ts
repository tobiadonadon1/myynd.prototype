// Che cosa è un documento, per contarlo con il suo nome.
//
// «312 documenti» non dice niente a chi ha appena collegato la posta:
// «312 email, 42 eventi, 1.204 file» sì. Qui ogni fonte ha il suo genere,
// e i conti per fonte diventano conti per genere. Puro e senza import: lo
// usa anche l'interfaccia (`src/conta-fonti.ts`).

export type Genere = 'email' | 'evento' | 'file' | 'nota' | 'pagina' | 'conversazione' | 'riunione' | 'documento'

/** I generi che si dicono per primi, in quest'ordine; gli altri seguono per quantità. */
export const ORDINE_GENERI: readonly Genere[] = ['email', 'evento', 'file']

const PER_FONTE: Record<string, Genere> = {
  posta: 'email', google: 'email', microsoft: 'email', postamac: 'email',
  calendario: 'evento', agendamac: 'evento',
  desktop: 'file', lavoro: 'file', drive: 'file', dropbox: 'file', sharepoint: 'file',
  note: 'nota',
  notion: 'pagina',
  // un documento di Slack o di WhatsApp è un giorno di una conversazione
  slack: 'conversazione', whatsapp: 'conversazione', conversazioni: 'conversazione',
  granola: 'riunione'
}

/** Il genere dei documenti di una fonte. Quello che non si sa è un documento. */
export function genereDi(fonte: string): Genere {
  return PER_FONTE[fonte] ?? 'documento'
}

/** I conti per fonte, sommati per genere. Solo i generi con qualcosa dentro. */
export function perGenere(perFonte: { fonte: string; n: number }[]): Partial<Record<Genere, number>> {
  const fuori: Partial<Record<Genere, number>> = {}
  for (const { fonte, n } of perFonte) {
    const k = Number(n)
    if (!Number.isFinite(k) || k <= 0) continue
    const g = genereDi(fonte)
    fuori[g] = (fuori[g] ?? 0) + k
  }
  return fuori
}
