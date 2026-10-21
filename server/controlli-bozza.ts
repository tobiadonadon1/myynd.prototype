// I controlli fissi di una bozza, senza modello.
//
// Il banco della qualità (prove/banco) ha mostrato che alcune regole il
// modello le salta anche quando le ha davanti: scrive «in allegato» dove
// non c'è nessun allegato, fissa «alle 10:00» quando la persona ha detto solo
// «non prima delle 10», mette istruzioni dentro un segnaposto. Una regola che
// si può controllare col codice si controlla col codice: se scatta, la bozza
// torna a chi scrive con il problema detto in una riga, come fa il revisore.

/** Le parole che dicono che c'è un allegato. Una bozza di Myynd non allega niente da sé. */
const ALLEGATO = /\b(?:in allegato|allego|ti allego|vi allego|allegat[oaie]|attached|i(?:'ve| have) attached|attaching|please find attached|see attachment)\b/i

/** Un'ora del giorno: «10:00», «9.30», «3pm», «3 pm», «alle 10», «at 3». */
const ORA = /\b(?:([01]?\d|2[0-3])[:.]([0-5]\d)|(1[0-2]|0?[1-9])\s?(am|pm)|alle\s+(\d{1,2})(?![\d:/]|[.,]\d)|at\s+(\d{1,2})(?=\s?(?:o'clock|$|[.,;!?])))/gi

/** Dentro un segnaposto ci va il dato che manca, non un ordine per lei. */
const ISTRUZIONE = /\b(?:confirm|check|verify|attach|fill in|insert|add|make sure|update|conferma|verifica|allega|inserisci|aggiungi|controlla|assicurati|aggiorna)\b/i

/** Le ore scritte in un testo, normalizzate a «h:mm» su 24 ore quando si può. */
export function oreNel(testo: string): string[] {
  const out = new Set<string>()
  for (const m of testo.matchAll(ORA)) {
    if (m[1] !== undefined) out.add(`${Number(m[1])}:${m[2]}`)
    else if (m[3] !== undefined) { const h = Number(m[3]) % 12 + (m[4]!.toLowerCase() === 'pm' ? 12 : 0); out.add(`${h}:00`) }
    else if (m[5] !== undefined) out.add(`${Number(m[5])}:00`)
    else if (m[6] !== undefined) out.add(`${Number(m[6])}:00`)
  }
  return [...out]
}

/**
 * I problemi fissi di una bozza: un allegato che non c'è, un'ora che non sta
 * nelle fonti, un segnaposto con dentro un'istruzione. `fonti` è tutto quello
 * che chi scriveva aveva davanti (il compito, la nota, i documenti, le
 * letture). Pura.
 */
export function controlliFissi(corpo: string, fonti: string, lingua: 'it' | 'en' = 'it'): string[] {
  const en = lingua === 'en'
  const out: string[] = []
  const allegato = corpo.match(ALLEGATO)
  if (allegato) out.push(en
    ? `The draft says «${allegato[0]}» but nothing is attached: take the sentence out, and say in the final line which file to attach.`
    : `La bozza dice «${allegato[0]}» ma non c'è nessun allegato: togli la frase, e nella riga finale di' quale file allegare.`)
  const note = new Set(oreNel(fonti))
  const inventate = oreNel(corpo).filter(o => !note.has(o))
  if (inventate.length) out.push(en
    ? `The time ${inventate.join(', ')} is not in the sources: leave «[time]» for the person to choose.`
    : `L'orario ${inventate.join(', ')} non sta nelle fonti: lascia «[orario]» da scegliere a lei.`)
  for (const m of corpo.matchAll(/\[([^\]\n]{3,})\]/g)) {
    const dentro = m[1]!.replace(/^(?:to fill|da completare|da riempire)\s*:\s*/i, '')
    if (ISTRUZIONE.test(dentro) || dentro.length > 45) {
      out.push(en
        ? `The placeholder «[${m[1]}]» holds an instruction: a placeholder holds only the missing detail; instructions go in the final line.`
        : `Il segnaposto «[${m[1]}]» contiene un'istruzione: dentro ci va solo il dato che manca, le istruzioni nella riga finale.`)
      break
    }
  }
  return out
}
