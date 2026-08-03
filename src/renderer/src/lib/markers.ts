/**
 * Parsing dei marcatori di sorgente ⟦s1⟧.
 *
 * Il testo generato contiene ⟦s1⟧ subito dopo la frase che fonda. `dividi`
 * lo scompone in pezzi di testo semplice e pezzi "sorgente" (frase + id
 * della fonte). Un marcatore senza fonte corrispondente viene rimosso dal
 * testo: non è mai mostrato grezzo.
 */

import type { SourceRef } from '@shared/types'

export type Pezzo = { t: 'testo'; v: string } | { t: 'sorgente'; id: string; v: string }

/**
 * Durante lo streaming il testo arriva a pezzi (chunk IPC) e può spezzare
 * un marcatore proprio a metà, es. "...⟦s1" prima che arrivi "⟧" nel chunk
 * successivo. `dividi()` da solo non basta a nasconderlo: la sua regex
 * richiede la parentesi di chiusura, quindi un marcatore a metà non viene
 * riconosciuto come marcatore e resta testo normale, grezzo, in pagina.
 *
 * Questa funzione va applicata al testo ancora in streaming (mai al testo
 * finale, già completo): toglie dalla coda tutto ciò che segue l'ultima
 * "⟦" priva di una "⟧" corrispondente, così quel frammento non viene mai
 * dipinto e riappare intero al chunk successivo.
 */
export function nascondiMarcatoreIncompleto(testo: string): string {
  const ultimaApertura = testo.lastIndexOf('⟦')
  if (ultimaApertura === -1) return testo
  const chiusuraSuccessiva = testo.indexOf('⟧', ultimaApertura)
  if (chiusuraSuccessiva !== -1) return testo
  return testo.slice(0, ultimaApertura)
}

export function dividi(testo: string, sorgenti: SourceRef[]): Pezzo[] {
  const idNoti = new Set(sorgenti.map((s) => s.id))
  const pezzi: Pezzo[] = []
  const marcatore = /⟦(s\d+)⟧/g

  let cursore = 0
  let buffer = ''

  let match: RegExpExecArray | null
  while ((match = marcatore.exec(testo))) {
    const id = match[1]
    buffer += testo.slice(cursore, match.index)
    cursore = match.index + match[0].length

    if (idNoti.has(id)) {
      pezzi.push({ t: 'sorgente', id, v: buffer })
      buffer = ''
    }
    // marcatore senza fonte: viene semplicemente saltato, il buffer resta
    // e si fonde con il testo che segue.
  }

  buffer += testo.slice(cursore)
  if (buffer.length > 0) {
    pezzi.push({ t: 'testo', v: buffer })
  }

  return pezzi
}

/**
 * L'inverso di `dividi`, usato quando il corpo di una bozza torna editabile
 * in linea (`.draft__body[contenteditable]`). Ricostruisce una stringa
 * piana a partire dal DOM modificato dall'utente: i nodi di testo restano
 * testo, ogni segno di sorgente (marcato con `data-src-id`) torna al suo
 * marcatore ⟦sN⟧, senza mai leggere il contenuto nascosto del popover.
 */
export function estraiTesto(nodo: Node): string {
  if (nodo.nodeType === Node.TEXT_NODE) {
    return nodo.textContent ?? ''
  }

  if (nodo.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const el = nodo as HTMLElement
  const idSorgente = el.getAttribute('data-src-id')
  if (idSorgente) {
    return `⟦${idSorgente}⟧`
  }

  if (el.tagName === 'BR') {
    return '\n'
  }

  let out = ''
  el.childNodes.forEach((figlio) => {
    out += estraiTesto(figlio)
  })
  return out
}
