import { useEffect, useRef } from 'react'
import type { PassoCompito } from '../api'
// con l'estensione, perché la costante qui sotto la legge anche
// `aurora-compito.test.ts` in Node
import { frasi, t, loc } from '../lingua.ts'
import './aurora-compito.css'

/*
 * La riga su cui Myynd sta lavorando. (28 settembre 2026)
 *
 * Dal 21 settembre era un fuoco su una tela: righe verticali che scorrevano,
 * un fascio di luce, fiamme, fumo, braci. Una settimana dopo, guardandolo in
 * pagina: «the animation of Myynd working has to be redone because I do not
 * like how it appears. I don't think it's professional. It looks like a
 * barcode moving. It's very whack.» Aveva ragione: le righe verticali a
 * contrasto alto, su una riga di testo, si leggono come un codice a barre
 * prima che come un lavoro in corso.
 *
 * Adesso è quieta, e dice la stessa cosa: sta succedendo. Tre strati, tutti
 * in CSS, nessuna tela:
 *
 *   1. un velo di rame appena percettibile, che respira lento (sei secondi):
 *      la riga si distingue da una ferma anche con la coda dell'occhio;
 *   2. una lucentezza larga e sfocata che attraversa la riga in diagonale,
 *      una volta ogni tre secondi e mezzo, da sinistra a destra, e poi riposa:
 *      il segno che è vivo, senza strisce;
 *   3. un filo sottile sul bordo di sotto, dove una luce corta scivola avanti:
 *      non una barra che si riempie (non sa quanto manca), un filo che lavora.
 *
 * La riga del passo («Cerco…», «Controllo contro il suo fatto») dice a parole
 * cosa sta facendo; qui c'è solo il tono.
 *
 * Quando il lavoro finisce, `fase="finita"`: il filo si completa da un capo
 * all'altro, la riga prende per un attimo il verde di «fatto», e tutto si
 * spegne. Poi `onFinita`. Con il moto ridotto resta il velo fermo, e la fine
 * è immediata.
 */

/** Quanto dura la posa, in millisecondi: la stessa durata di `.task-aurora[data-fase="finita"]` nel CSS. */
export const DURATA_POSA_MS = 1200

export function AuroraCompito({ fase = 'lavora', onFinita }: { fase?: 'lavora' | 'finita'; onFinita?: () => void }) {
  // la richiamata cambia a ogni disegno del componente: si tiene in un
  // riferimento, o la posa ripartirebbe da capo ogni volta
  const fine = useRef(onFinita)
  fine.current = onFinita
  useEffect(() => {
    if (fase !== 'finita') return
    const fermo = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(() => fine.current?.(), fermo ? 0 : DURATA_POSA_MS)
    return () => clearTimeout(timer)
  }, [fase])
  return (
    <span className="task-aurora" aria-hidden="true" data-fase={fase === 'finita' ? 'finita' : undefined}>
      <span className="task-aurora-velo" />
      <span className="task-aurora-luce" />
      <span className="task-aurora-filo" />
    </span>
  )
}

export function PassoAttivo({ passo }: { passo: PassoCompito }) {
  const testo = passo.passo === 'preparo' ? (loc().startsWith('en') ? 'Preparing your task…' : 'Preparazione…')
    : passo.passo === 'cerco' ? frasi.passoCerco(passo.dettaglio ?? '')
    : passo.passo === 'apro' ? frasi.passoApro(passo.dettaglio ?? '')
    : passo.passo === 'rileggo' ? t('Controllo contro il suo «fatto»')
      : [t('Scrivo…'), passo.dettaglio].filter(Boolean).join(' ')
  return <div className="task-working-step" role="status" aria-live="polite">{testo}</div>
}
