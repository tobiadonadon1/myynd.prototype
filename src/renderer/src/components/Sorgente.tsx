/**
 * Il popover della sorgente. `.src` è il puntino tenue che sostituisce il
 * marcatore; al passaggio del mouse o al focus da tastiera rivela titolo,
 * meta ed estratto esatto. Vicino ai bordi della finestra cambia lato:
 * la posizione si misura con `getBoundingClientRect()`, non si indovina.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SourceRef } from '@shared/types'
import { api } from '../lib/api'

interface SorgenteProps {
  source: SourceRef
}

// il titolo del documento che ha sostituito una fonte superata: SourceRef
// porta solo il flag `superseded`, il titolo del successore vive sul Doc
// completo (`supersededBy`), quindi va risolto con una lettura in più.
// Cache per docId così un secondo hover sulla stessa fonte non rifà la
// stessa coppia di letture.
const cacheSuccessori = new Map<string, Promise<string | null>>()

function risolviSuccessore(docId: string): Promise<string | null> {
  const esistente = cacheSuccessori.get(docId)
  if (esistente) return esistente

  const promessa = api.getSource(docId).then(async (doc) => {
    if (!doc?.supersededBy) return null
    const successore = await api.getSource(doc.supersededBy)
    return successore?.title ?? null
  })

  cacheSuccessori.set(docId, promessa)
  return promessa
}

function formattaData(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
}

// margine di rispetto oltre l'altezza misurata del popover: copre il gap
// verticale che il css apre fra segno e popover (`--s2`) più un po' di
// respiro. Non è un valore di design — non sceglie un colore, una misura o
// un tempo dell'interfaccia, serve solo al calcolo "ci sta sopra?".
const MARGINE_VERTICALE = 12

export function Sorgente({ source }: SorgenteProps) {
  const rifSrc = useRef<HTMLSpanElement>(null)
  const rifPop = useRef<HTMLSpanElement>(null)
  const [aDestra, setADestra] = useState(false)
  const [aSotto, setASotto] = useState(false)
  const [successore, setSuccessore] = useState<string | null>(null)

  // Il popover è sempre nel DOM (solo `opacity: 0` finché non è rivelato),
  // quindi la sua altezza reale è misurabile anche prima dell'hover: mai
  // una soglia indovinata come i 140px di prima, che assumevano un'altezza
  // che il popover reale (195–214px, di più con il flag di sorgente
  // superata) supera già nel caso comune, tagliandolo fuori dalla finestra.
  const misura = useCallback(() => {
    const el = rifSrc.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setADestra(window.innerWidth - rect.right < 320)

    const pop = rifPop.current
    const altezzaPop = pop ? pop.getBoundingClientRect().height : 0
    setASotto(rect.top < altezzaPop + MARGINE_VERTICALE)

    if (source.superseded) {
      risolviSuccessore(source.docId).then(setSuccessore)
    }
  }, [source.docId, source.superseded])

  // il flag "fonte superata da" arriva async e allunga il popover dopo che
  // l'hover ha già misurato: si ricontrolla quando compare, così il lato
  // giusto non dipende dall'ordine di arrivo dei dati.
  useEffect(() => {
    if (successore) misura()
  }, [successore, misura])

  const data = formattaData(source.date)
  const classiPop = ['src-pop', aDestra ? 'src-pop--right' : '', aSotto ? 'src-pop--below' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <span
      ref={rifSrc}
      className="src"
      data-src-id={source.id}
      tabIndex={0}
      contentEditable={false}
      onMouseEnter={misura}
      onFocus={misura}
    >
      <span ref={rifPop} className={classiPop}>
        <span className="src-pop__title">{source.title}</span>
        <span className="src-pop__meta">
          {source.kind}
          {data ? ` · ${data}` : ''}
        </span>
        <span className="src-pop__excerpt">{source.excerpt}</span>
        {source.superseded && successore && (
          <span className="src-pop__flag">fonte superata da: {successore}</span>
        )}
      </span>
    </span>
  )
}
