// Il Markdown, letto da una persona.
//
// Il visualizzatore del documento mostrava il corpo indicizzato così com'era:
// un file `.md` arrivava sullo schermo con i cancelletti dei titoli, gli
// asterischi del grassetto, le pipe delle tabelle e i link scritti in due
// pezzi. Chi lo apriva vedeva il sorgente di un documento, non il documento —
// e la parola di Tobia è stata netta: «è un file MD, confuso e non leggibile
// da un essere umano».
//
// Qui dentro non c'è un motore di Markdown e non deve entrarci: quello che
// serve è togliere la punteggiatura che serviva alla macchina e lasciare le
// parole. Niente HTML generato, niente `dangerouslySetInnerHTML`: si torna un
// elenco di blocchi — una riga, un titolo, un pezzo di codice, una riga vuota
// — e chi disegna decide come vestirli.
//
// Vive fuori da `vals.ts` e da `modals.tsx` per la stessa ragione di
// `essenza.ts`: è una funzione pura, si prova da sola sotto `node --test`
// senza trascinarsi dietro React.
//
//   node --test src/leggibile.test.ts

/** Un pezzo di documento, già pronto da mettere in pagina. */
export type Blocco = {
  /** `riga` è la prosa; `titolo` va in grassetto; `codice` in monospazio; `vuota` è aria. */
  tipo: 'riga' | 'titolo' | 'codice' | 'vuota'
  testo: string
}

const APERTURA = /^\s{0,3}(?:```|~~~)/
const TITOLO = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const ELENCO = /^(\s*)[-*+]\s+(.*)$/
const RIGA_TABELLA = /^\s*\|(.*)\|\s*$/
const SEPARATORE = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/
const CITAZIONE = /^\s{0,3}(?:>\s?)+/

/** Il puntino di mezzo: separa le voci di un elenco e le celle di una tabella. */
const PUNTO = '·'

/**
 * Quello che sta dentro una riga, senza i segni.
 *
 * L'ordine conta: prima i link — la loro parentesi quadra contiene testo che
 * potrebbe avere asterischi dentro — poi il grassetto, poi il corsivo, e per
 * ultimo il codice fra apici, che non deve mangiarsi niente di quello sopra.
 */
function dentroLaRiga(riga: string): string {
  return riga
    // <https://…> scritto per forza fra parentesi angolari: restano solo i caratteri
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
    // ![alt](url) e [testo](url): il testo, e l'indirizzo fra parentesi tonde
    .replace(/!?\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+"[^"]*")?\s*\)/g, (_m, testo: string, url: string) => {
      const parola = testo.trim()
      if (!parola) return url
      return url ? `${parola} (${url})` : parola
    })
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1')
    .replace(/(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+$/, '')
}

/** Le celle di una riga di tabella, senza le pipe. */
function celle(riga: string): string[] {
  const dentro = RIGA_TABELLA.exec(riga)?.[1] ?? ''
  return dentro.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim())
}

/** La riga di trattini sotto le intestazioni di una tabella: non si disegna. */
function soloTrattini(riga: string): boolean {
  const c = celle(riga).filter(x => x !== '')
  return c.length > 0 && c.every(x => /^:?-{2,}:?$/.test(x))
}

/**
 * Il frontespizio YAML in cima a un file Markdown.
 *
 * Tre trattini, un blocco di chiavi, altri tre trattini. Non è il documento:
 * è la scheda che gli sta davanti, e una persona che apre un appunto non ha
 * nessun motivo di leggere `layout: post`.
 */
function senzaFrontespizio(righe: string[]): string[] {
  if (righe[0]?.trim() !== '---') return righe
  const fine = righe.findIndex((r, i) => i > 0 && /^(?:---|\.\.\.)\s*$/.test(r))
  return fine > 0 ? righe.slice(fine + 1) : righe
}

/**
 * Da Markdown a blocchi da leggere.
 *
 * Non tocca il testo semplice: una mail che non ha nessun segno esce riga per
 * riga come è entrata, e le righe vuote restano dove le ha messe chi scriveva.
 */
export function leggibile(md: string): Blocco[] {
  const fuori: Blocco[] = []
  const spingi = (b: Blocco) => {
    if (b.tipo === 'vuota') {
      // una sola riga d'aria: dieci righe vuote di fila sono un difetto del
      // file, non un respiro voluto — e in cima non ce ne vuole nessuna
      if (!fuori.length || fuori[fuori.length - 1].tipo === 'vuota') return
    }
    fuori.push(b)
  }

  const righe = senzaFrontespizio(md.replace(/\r\n?/g, '\n').split('\n'))
  let i = 0
  while (i < righe.length) {
    const riga = righe[i]

    // il codice esce intatto: dentro un blocco recintato ogni segno è voluto
    if (APERTURA.test(riga)) {
      const dentro: string[] = []
      i++
      while (i < righe.length && !APERTURA.test(righe[i])) { dentro.push(righe[i]); i++ }
      i++   // la riga di chiusura
      const testo = dentro.join('\n').replace(/\s+$/, '')
      if (testo) spingi({ tipo: 'codice', testo })
      continue
    }

    i++
    const pulita = riga.replace(CITAZIONE, '')

    if (!pulita.trim()) { spingi({ tipo: 'vuota', testo: '' }); continue }

    // una riga di soli trattini divide: vale come aria, non come testo
    if (SEPARATORE.test(pulita)) { spingi({ tipo: 'vuota', testo: '' }); continue }

    const titolo = TITOLO.exec(pulita)
    if (titolo) {
      const testo = dentroLaRiga(titolo[2]).trim()
      if (testo) spingi({ tipo: 'titolo', testo })
      continue
    }

    if (RIGA_TABELLA.test(pulita)) {
      if (soloTrattini(pulita)) continue
      const testo = celle(pulita).filter(c => c !== '').map(dentroLaRiga).join(` ${PUNTO} `).trim()
      if (testo) spingi({ tipo: 'riga', testo })
      continue
    }

    const voce = ELENCO.exec(pulita)
    if (voce) {
      const testo = dentroLaRiga(voce[2]).trim()
      // un trattino con niente dietro è un errore di battitura, non una voce
      if (testo) spingi({ tipo: 'riga', testo: `${PUNTO} ${testo}` })
      continue
    }

    const testo = dentroLaRiga(pulita)
    if (testo.trim()) spingi({ tipo: 'riga', testo })
    else spingi({ tipo: 'vuota', testo: '' })
  }

  while (fuori.length && fuori[fuori.length - 1].tipo === 'vuota') fuori.pop()
  return fuori
}
