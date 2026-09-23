// Una fonte è collegata adesso? E quello che si è letto mentre la si scollegava.
//
// La risposta vive nella configurazione di chi chiede, e basta: nessuna rete,
// nessun connettore da caricare. È la stessa che dà `/api/stato` alle schede
// (vedi `connettori:` in `index.ts`), ristretta alle fonti che portano
// documenti: i motori non si leggono, e lì la domanda ha altre sfumature.

import * as cfg from './config.ts'
import * as store from './store.ts'

/** La fonte `id` (o la fase della lettura con quel nome) ha ancora un collegamento in `c`. */
export function fonteCollegata(id: string, c: cfg.Config = cfg.leggi()): boolean {
  switch (id) {
    case 'posta': return !!c.posta
    case 'desktop': return !!c.desktop
    case 'notion': return !!c.notion
    case 'granola': return !!c.granola
    case 'note': return !!c.note
    case 'conversazioni': return !!c.conversazioni
    case 'calendario': return !!c.calendario
    case 'x': return !!c.x
    case 'google': return !!c.google?.refresh
    case 'slack': return !!c.slack?.token
    case 'github': return !!c.github?.token
    case 'drive': return !!c.drive?.refresh
    case 'microsoft': return !!c.microsoft?.refresh && c.microsoft.parti.includes('posta')
    case 'sharepoint': return !!c.microsoft?.refresh && c.microsoft.parti.includes('file')
    case 'dropbox': return !!c.dropbox?.refresh
    case 'whatsapp': return !!(c.whatsapp?.token && c.whatsapp?.numero)
    default: return false
  }
}

/**
 * Leggere una fonte, e se intanto è stata scollegata non lasciarne niente.
 *
 * «Scollega» svuota la fonte dall'indice e va via. Ma una lettura partita un
 * momento prima ha già in mano quello che ha scaricato, e lo scrive dopo:
 * l'agenda scollegata a metà lettura tornava nell'indice con tutti i suoi
 * eventi, e Myynd continuava a citare un calendario che la persona aveva
 * appena tolto. Finita la lettura si guarda la configurazione di adesso; se
 * la fonte non c'è più si svuota di nuovo, e la lettura non conta niente.
 */
export async function leggiSeAncoraCollegata(
  nome: string,
  leggi: () => Promise<number>,
  avvisa: (d: unknown) => void
): Promise<number> {
  const n = await leggi()
  if (fonteCollegata(nome)) return n
  store.svuotaFonte(nome)
  avvisa({ fase: nome, stato: 'scollegata' })
  return 0
}
