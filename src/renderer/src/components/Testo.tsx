/**
 * Testo con sorgenti inline. Rende i pezzi prodotti da `dividi`: il testo
 * normale così com'è, e — subito dopo la frase che fonda — il segno tenue
 * di `Sorgente`. Se nessuno passa il mouse, non si vede nulla oltre al
 * puntino quasi invisibile.
 */

import { dividi } from '../lib/markers'
import type { SourceRef } from '@shared/types'
import { Sorgente } from './Sorgente'

interface TestoProps {
  testo: string
  sorgenti: SourceRef[]
}

export function Testo({ testo, sorgenti }: TestoProps) {
  const pezzi = dividi(testo, sorgenti)
  const perId = new Map(sorgenti.map((s) => [s.id, s]))

  return (
    <>
      {pezzi.map((pezzo, i) => {
        if (pezzo.t === 'testo') {
          return <span key={i}>{pezzo.v}</span>
        }

        const sorgente = perId.get(pezzo.id)
        if (!sorgente) {
          // dividi() garantisce che questo non accada: un marcatore senza
          // fonte non diventa mai un pezzo 'sorgente'. Difensivo comunque.
          return <span key={i}>{pezzo.v}</span>
        }

        return (
          <span key={i}>
            {pezzo.v}
            <Sorgente source={sorgente} />
          </span>
        )
      })}
    </>
  )
}
