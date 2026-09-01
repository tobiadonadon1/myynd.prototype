// Ricucire le righe spezzate.
//
// Un PDF non contiene paragrafi: contiene righe, messe dove finiva la colonna
// quando il file è stato composto. Chi lo estrae si ritrova quelle righe come
// «a capo» veri, e il risultato è il testo che si vede nel visualizzatore —
// una frase che si interrompe su «and», la parola dopo su una riga da sola,
// «The» in fondo a una riga e il suo soggetto in cima a quella dopo. Lo stesso
// vale per la posta scritta in testo semplice, che a settantadue caratteri va
// a capo per convenzione.
//
// Non è un problema solo di aspetto. Quel testo è anche quello che legge il
// modello: le righe spezzate gli arrivano come confini, e i confini finti gli
// fanno perdere il filo di una frase esattamente come lo fanno perdere a te.
//
// Qui si distingue un «a capo» che porta significato da uno che è solo la
// larghezza della pagina. La regola è quella che usa chiunque legga: se la
// riga non è finita — non c'è punto, non c'è due punti, non c'è nulla che
// chiuda — allora continua, e le due righe sono una.

/**
 * Il testo con le righe ricucite in paragrafi.
 *
 * Conservativa per scelta: nel dubbio lascia l'a capo dov'è. Unire due frasi
 * che erano separate si legge male ma si capisce; spezzare una frase a metà,
 * come fa adesso, si legge male *e* cambia cosa sembra scritto.
 */
export function riflua(testo: string): string {
  const righe = testo.replace(/\r\n?/g, '\n').split('\n')
  const lunghezze = righe.map(r => r.trimEnd().length).filter(n => n > 0)
  if (lunghezze.length < 4) return testo

  // La larghezza della colonna, presa al novantesimo percentile e non al
  // massimo: basta un titolo lungo o una riga di tabella a spostare il massimo
  // e a far sembrare «corte» tutte le righe vere.
  const ordinate = [...lunghezze].sort((a, b) => a - b)
  const colonna = ordinate[Math.floor(ordinate.length * 0.9)]

  // Sopra i quattrocento caratteri il testo ha già i suoi paragrafi — è Notion,
  // è markdown, è roba nata digitale: non c'è niente da ricucire e provarci
  // farebbe solo danni. Sotto i quaranta non è prosa: è un elenco, un indice,
  // una tabella, e unirne le righe le distruggerebbe.
  if (colonna > 400 || colonna < 40) return testo

  const VOCE = /^\s*(?:[-*•·–—]\s|\d+[.)]\s|#{1,6}\s)/

  const fuori: string[] = []
  let paragrafo = ''
  // La riga fisica precedente, che è cosa diversa dal paragrafo accumulato:
  // per decidere se un a capo era finto conta quanto era piena *quella riga*,
  // non quanto è lungo il paragrafo che sta crescendo.
  let ultima = ''
  let inElenco = false
  // Il paragrafo è ancora fermo alla sua prima riga fisica: serve a riconoscere
  // i titoli, che sono corti proprio perché sono i primi.
  let appenaAperto = false

  const chiudi = () => { if (paragrafo) fuori.push(paragrafo); paragrafo = ''; ultima = ''; inElenco = false }
  const apri = (riga: string) => { paragrafo = riga; ultima = riga; inElenco = VOCE.test(riga); appenaAperto = true }

  for (const grezza of righe) {
    const riga = grezza.trimEnd()
    if (!riga.trim()) { chiudi(); fuori.push(''); continue }
    if (!paragrafo) { apri(riga); continue }

    // Elenchi e titoli cominciano sempre per conto loro: il trattino in prima
    // colonna è un segno che chi ha scritto ha voluto, non un a capo capitato.
    if (VOCE.test(riga)) { chiudi(); apri(riga); continue }

    // La riga dopo l'ultima voce di un elenco torna a essere prosa, e non è la
    // coda di quella voce: se ricomincia da bordo pagina è un paragrafo nuovo.
    // La coda vera di una voce lunga rientra sotto il trattino, e quella sì che
    // si unisce.
    if (inElenco && !/^\s/.test(grezza)) { chiudi(); apri(riga); continue }

    // Un titolo: la prima riga di un paragrafo, molto più corta della colonna.
    // In un testo mandato a capo dalla pagina la prima riga arriva sempre fino
    // al bordo — se non ci arriva, non è una riga spezzata, è una riga che
    // finisce lì. È «01 Executive summary», che senza questa riga si attaccava
    // alla frase dopo e spariva dentro il paragrafo.
    if (appenaAperto && ultima.length < colonna * 0.55 && !/[,;:]$/.test(ultima)) {
      chiudi(); apri(riga); continue
    }

    // Finita di suo: punto, punto interrogativo, due punti — anche seguiti da
    // una virgoletta o una parentesi che chiude.
    const finita = /[.!?:;][)\]"'»”’]?$/.test(ultima)
    // Piena fino al bordo: allora anche il punto in fondo è un caso, non una
    // scelta — la riga dopo è la stessa frase che continua.
    const piena = ultima.length >= colonna * 0.85

    if (!finita || piena) paragrafo = `${paragrafo} ${riga.trim()}`
    else { chiudi(); paragrafo = riga }
    ultima = riga
    appenaAperto = false
  }
  chiudi()

  return fuori.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
