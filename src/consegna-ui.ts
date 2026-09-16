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

/** Execution instructions stay in the task record; the feed shows a human hand-off. */
export function presentazioneRevisione(c: { id: string; madre?: string | null; modo: string }, en: boolean): { titolo: string; descrizione: string } | null {
  if (!c.id.startsWith('rev-') || !c.madre) return null
  return {
    titolo: c.modo === 'tutto'
      ? (en ? 'Revising your document' : 'Sto aggiornando il documento')
      : (en ? 'Revising your draft' : 'Sto aggiornando la bozza'),
    descrizione: en
      ? 'Applying your feedback. The previous version is safe.'
      : 'Applico le tue indicazioni. La versione precedente è al sicuro.'
  }
}
