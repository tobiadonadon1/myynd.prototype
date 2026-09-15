import { loc, t } from './lingua.ts'

/** Keep source prose readable in the short preview; the original retains its links. */
export function anteprimaDocumentoMappa(testo: string): string {
  return testo
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
    .replace(/\s*[[(]https?:\/\/[^\s)\]]+[)\]]/g, '')
    .replace(/https?:\/\/[^\s<>"')\]]+/g, '')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+/g, ' ').trim()
}

/** Knowledge spans years: never make an old source look like this year's item. */
export function dataDocumentoMappa(iso: string | null | undefined): string {
  if (!iso) return ''
  const data = new Date(iso)
  if (!Number.isFinite(data.getTime())) return ''
  return data.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Internal classification codes never become the description of someone's work. */
export function motivoMappa(motivo: string | undefined): string {
  switch (motivo) {
    case 'fonte_non_recente': return t('Conservato come contesto storico; non richiede attenzione adesso.')
    case 'gia_inviato': return t('Questo messaggio è già stato inviato.')
    case 'istruzioni_interne': case 'file_tecnico': case 'materiale_di_riferimento': return t('Conservato per consultazione, non come nuova richiesta.')
    case 'mittente_sconosciuto': return t('Il mittente non è stato identificato con certezza.')
    case 'posta_in_serie': return t('Messaggio automatico o inviato a una lista; escluso dalle attività.')
    case 'letta_senza_richiesta': return t('Già letto, senza una nuova richiesta da seguire.')
    case 'posta_diretta_recente': return t('Messaggio diretto e recente; da valutare insieme ai tuoi impegni.')
    case 'aggiornamento_di_servizio': return t('Aggiornamento su un ordine, una consegna o un servizio.')
    case 'evento': return t('Un evento del tuo calendario.')
    case 'attivita_repository': return t('Attività recente del repository, utile per il punto.')
    case 'novita_del_progetto': return t('Aggiornamento di un progetto che stai seguendo.')
    case 'richiesta_del_progetto': return t('Contiene una richiesta relativa a un progetto attivo.')
    case 'nessun_progetto_attivo': return t('Non è collegato a un progetto attivo.')
    case 'feedback_fatto': return t('Hai già completato questa attività. La fonte resta consultabile.')
    case 'feedback_scartato': return t('Hai escluso questo suggerimento. La fonte resta consultabile.')
    case 'fonte_non_disponibile': return t('Non trovo più il documento.')
    default: return ''
  }
}
