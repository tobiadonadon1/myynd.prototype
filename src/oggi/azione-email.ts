import type { Compito, Portato } from '../api.ts'
import { corpoPerChiRiceve, testoDellaBozza } from '../lavoro-affidato.ts'

type RigaEmail = Pick<Compito, 'doc' | 'porta' | 'email' | 'risultato' | 'puoInviare' | 'ipotesi'>
export type BozzaDaCopiare = { tipo: 'copia'; corpo: string; apri: boolean }

/** Receiving Gmail/Outlook messages does not imply permission to send them. */
export function azioneEmail(c: RigaEmail, correzione?: string): { tipo: 'invia' | 'nessuna' } | BozzaDaCopiare {
  if (c.puoInviare !== false) return { tipo: 'invia' }
  const mail = /^(?:posta|google|gmail|microsoft|outlook):/i.test(c.doc ?? '')
  if (!mail && !c.email) return { tipo: 'nessuna' }
  // la copia porta il testo per chi riceve: senza «Done:», senza le fonti,
  // senza l'ipotesi. Una correzione è il testo della lista cambiato da lei
  // (`testoDellaBozza`, che già non ha la riga dell'ipotesi): il testo com'è
  // non è una correzione, e anche una correzione passa dalla cornice, così
  // «Done:» e la riga delle fonti non arrivano mai a chi riceve
  const corretta = correzione !== undefined && correzione !== testoDellaBozza(c) && correzione !== (c.risultato ?? '')
  const corpo = (corretta ? corpoPerChiRiceve(correzione) : c.email?.corpo || corpoPerChiRiceve(c.risultato ?? '')).trim()
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
