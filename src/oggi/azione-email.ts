import type { Compito, Portato } from '../api.ts'
import { corpoPerChiRiceve } from '../lavoro-affidato.ts'

type RigaEmail = Pick<Compito, 'doc' | 'porta' | 'email' | 'risultato' | 'puoInviare'>
export type BozzaDaCopiare = { tipo: 'copia'; corpo: string; apri: boolean }

/** Receiving Gmail/Outlook messages does not imply permission to send them. */
export function azioneEmail(c: RigaEmail, correzione?: string): { tipo: 'invia' | 'nessuna' } | BozzaDaCopiare {
  if (c.puoInviare !== false) return { tipo: 'invia' }
  const mail = /^(?:posta|google|gmail|microsoft|outlook):/i.test(c.doc ?? '')
  if (!mail && !c.email) return { tipo: 'nessuna' }
  // la copia porta il testo per chi riceve: senza «Done:», senza le fonti, senza l'ipotesi
  const corpo = (correzione !== undefined && correzione !== (c.risultato ?? '')
    ? correzione : c.email?.corpo || corpoPerChiRiceve(c.risultato ?? '')).trim()
  if (!corpo) return { tipo: 'nessuna' }
  return { tipo: 'copia', corpo, apri: mail && (c.porta === 'posta' || c.porta === 'pagina') }
}

/** No send or completion capability is accepted by this handoff. */
export async function copiaBozzaEApri(bozza: BozzaDaCopiare, servizi: {
  copia: (testo: string) => Promise<boolean>
  apri: () => Promise<Portato | null>
}): Promise<'non-copiata' | 'copiata' | 'aperta' | 'non-aperta'> {
  if (!await servizi.copia(bozza.corpo)) return 'non-copiata'
  if (!bozza.apri) return 'copiata'
  const r = await servizi.apri()
  return r?.ok && (r.dove === 'posta' || r.dove === 'pagina') ? 'aperta' : 'non-aperta'
}
