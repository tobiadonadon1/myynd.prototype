/** Missing review is not a pass, including documents created by older app versions. */
export function statoRevisione(revisione: { esito: 'pass' | 'revise' | 'unavailable' } | undefined, en: boolean): string {
  if (revisione?.esito === 'pass') return en ? 'Review passed' : 'Revisione superata'
  if (revisione?.esito === 'revise') return en ? 'Review found issues — needs revision' : 'La revisione ha trovato problemi — da correggere'
  return en ? 'Review unavailable — not verified' : 'Revisione non disponibile — non verificato'
}

/** Only a completed artifact with a passed review gets the uncomplicated hand-off. */
export function consegnaPronta(c: { stato: string; consegna?: { revisione?: { esito: string } } | null }): boolean {
  return c.stato === 'pronto' && c.consegna?.revisione?.esito === 'pass'
}

/** Desktop wording is evidence-based, never guessed from the document title. */
export function messaggioConsegna(d: { desktop?: string }, en: boolean): string {
  if (d.desktop) return en
    ? 'Saved to your desktop. Take a look and tell me what you think in chat.'
    : 'Salvato sulla scrivania. Guardalo e dimmi cosa ne pensi in chat.'
  return en
    ? 'Your document is saved. Take a look and tell me what you think in chat.'
    : 'Il documento è salvato. Guardalo e dimmi cosa ne pensi in chat.'
}

/** Il titolo di una revisione finita: il compito com'era, senza le istruzioni della revisione che stanno nel testo. */
export function titoloDellaRevisione(testo: string): string {
  return testo.split('\n\nOriginal task: ').at(-1)?.trim() || testo
}

/**
 * Execution instructions stay in the task record; the feed shows a human hand-off.
 *
 * «Sto aggiornando il documento» vale finché lavora: finita, la riga porta il
 * titolo del compito, come ogni altra riga consegnata. Senza `stato` (chi
 * chiama non ce l'ha) si legge come se lavorasse.
 */
export function presentazioneRevisione(c: { id: string; madre?: string | null; modo: string; stato?: string; testo?: string }, en: boolean): { titolo: string; descrizione: string } | null {
  if (!c.id.startsWith('rev-') || !c.madre) return null
  if (c.stato && c.stato !== 'delegato') return { titolo: titoloDellaRevisione(c.testo ?? ''), descrizione: '' }
  return {
    titolo: c.modo === 'tutto'
      ? (en ? 'Revising your document' : 'Sto aggiornando il documento')
      : (en ? 'Revising your draft' : 'Sto aggiornando la bozza'),
    descrizione: en
      ? 'Applying your feedback. The previous version is safe.'
      : 'Applico le tue indicazioni. La versione precedente è al sicuro.'
  }
}
