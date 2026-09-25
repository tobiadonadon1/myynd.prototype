// La riga della lettura chiesta con l'occhio (P10): a che punto è, in parole.
//
// Il passo lo dice il server (`lettura-chiesta.ts`), solo quando succede
// davvero; qui diventa una frase, nella lingua dell'app. Prima della risposta
// (niente lettura ancora) si dice il primo passo: l'occhio è appena stato premuto.

import type { Lettura } from './api.ts'
import { t } from './lingua.ts'

export function testoPasso(l: Pick<Lettura, 'passo' | 'n'> | null): string {
  switch (l?.passo ?? 'arrivato') {
    case 'scelgo':
      if (l?.n === 1) return t('Scelgo cosa conta in un documento')
      if (typeof l?.n === 'number') return t('Scelgo cosa conta fra {n} documenti').replace('{n}', String(l.n))
      return t('Guardo cosa è arrivato')
    case 'ordine': return t('Metto in ordine')
    case 'fonti': return t('Aggiorno le fonti')
    case 'progetti': return t('Guardo i tuoi progetti')
    default: return t('Guardo cosa è arrivato')
  }
}
