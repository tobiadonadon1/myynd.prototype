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

/*
 * Via i trattini lunghi.
 *
 * Il modello scrive con la lineetta — così — a ogni inciso, e Tobia a quel
 * segno smette di leggere. Un inciso è quasi sempre una frase a sé: la
 * lineetta diventa un punto, e la parola dopo prende la maiuscola. Quando
 * la lineetta è in coda, o apre la riga (un elenco), si toglie e basta. Il
 * trattino corto fra due parole («week-end», «2024-09») non è una lineetta
 * e non si tocca.
 */
export function senzaTrattini(testo: string): string {
  // «10–12» e «2024–2025» sono intervalli, non incisi: si mettono da parte e tornano alla fine
  const SEGNAPOSTO = '\u0000'
  return testo
    .replace(/(\d)[—–](\d)/g, `$1${SEGNAPOSTO}$2`)
    // in apertura di riga: un elenco scritto con la lineetta diventa un elenco con il trattino
    .replace(/^[ \t]*[—–][ \t]+/gm, '- ')
    // in coda a una riga: sparisce
    .replace(/[ \t]*[—–][ \t]*$/gm, '')
    // in mezzo: un punto, e la frase dopo ricomincia
    .replace(/[ \t]*[—–][ \t]*([^\s])/g, (_, c: string) => `. ${c.toLocaleUpperCase()}`)
    // due chiusure di fila, se l'inciso finiva già con un segno
    .replace(/([.!?:;,])\. /g, '$1 ')
    .replace(new RegExp(SEGNAPOSTO, 'g'), '–')
}

/*
 * Una domanda sola, e che si legga.
 *
 * Quando una riga della lista si ferma, quello che compare sotto è quello che
 * le serve per andare avanti. Il quattordici settembre era un piano in quattro
 * punti con tre domande in coda, e non si capiva a quale rispondere.
 *
 * Il modello che la riscrive è piccolo e ogni tanto ci ricasca: rimette il
 * cappello («Per assisterti avrei bisogno di sapere:»), rimette il grassetto,
 * ne infila due nella stessa riga. Qui non si spera: si prende la prima
 * domanda vera e si butta il resto. Se non c'è nessun punto interrogativo si
 * prende la prima frase, che è comunque una riga sola e non un documento.
 *
 * Pura apposta: è la differenza fra provare dodici testi storti in un secondo
 * e affidare una riga a un modello per vedere cosa ne esce.
 */

/** Oltre questa lunghezza non è più una domanda: è un paragrafo col punto interrogativo. */
const DOMANDA_MAX = 180

/** Le parole con cui comincia una domanda, nelle due lingue dell'app. */
const INTERROGATIVE = /^\s*(?:che|cosa|chi|quale|quali|quanto|quanta|quanti|quante|come|quando|dove|perch|what|which|who|whom|whose|when|where|why|how|do|does|did|is|are|was|were|can|could|should|would|will|shall|have|has)\b/i

function togliIlCappello(riga: string): string {
  const due = riga.indexOf(':')
  if (due < 0 || due > 60) return riga
  const davanti = riga.slice(0, due)
  const dietro = riga.slice(due + 1).trim()
  // «What is the focus: …»: i due punti stanno dentro la domanda, non prima
  if (!dietro || INTERROGATIVE.test(davanti)) return riga
  // e quello che resta deve essere ancora una domanda, se lo era
  if (riga.includes('?') && !dietro.includes('?')) return riga
  return dietro
}

/** Il testo senza i segni che nessuno ha chiesto: grassetti, numerini delle fonti, segni di elenco. */
function senzaSegni(testo: string): string {
  return testo
    .replace(/\r\n?/g, '\n')
    // i segni che nessuno ha chiesto: il grassetto, il corsivo, gli apici, i cancelletti
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[*_`#]/g, '')
    // i numerini delle fonti non hanno senso dentro una domanda
    .replace(/\s*\[\d{1,2}\]/g, '')
    // il segno di elenco, o il numero, in testa a una riga
    .replace(/^[ \t]*(?:[-•·]|\d{1,3}[.)])[ \t]+/gm, '')
    .trim()
}

/** Una domanda troppo lunga per essere una domanda: si taglia all'ultimo spazio, non a metà parola. */
function accorciata(pulita: string): string {
  if (pulita.length <= DOMANDA_MAX) return pulita
  const tagliata = pulita.slice(0, DOMANDA_MAX)
  const spazio = tagliata.lastIndexOf(' ')
  return `${(spazio > 40 ? tagliata.slice(0, spazio) : tagliata).replace(/[.,;:\s]+$/, '')}?`
}

export function soloDomanda(testo: string): string {
  const piana = senzaSegni(testo)

  // la prima riga che è davvero una domanda, fra tutte quelle che ha scritto
  const righe = piana.split('\n').map(r => r.trim()).filter(Boolean)
  const chiede = righe.find(r => r.includes('?'))
  const riga = chiede ?? righe[0] ?? ''

  // dentro la riga può essercene più di una: si tiene la prima e si chiude lì
  const fino = riga.indexOf('?')
  const una = fino >= 0 ? riga.slice(0, fino + 1) : riga

  /*
   * Il cappello davanti: «Per andare avanti: di quale unità parliamo?».
   *
   * Solo quando è davvero un cappello. Il primo tentativo tagliava tutto
   * quello che stava prima di un due punti, e su «What is the focus: technical
   * deployment or compliance?» — che il modello ha scritto davvero, alla prima
   * prova — restava «technical deployment or compliance?», cioè la domanda
   * senza la domanda. Se quello che sta prima comincia con una parola
   * interrogativa, i due punti sono dentro la frase e non davanti.
   */
  return accorciata(togliIlCappello(una).trim())
}

/**
 * Tutte le domande che ha scritto, una per riga, fino a `max`. (21 set 2026)
 *
 * `soloDomanda` ne teneva una, per sua regola del diciassette: «l'unica
 * domanda che gli serve». Il ventuno ha visto l'altra faccia: una domanda,
 * il lavoro, un'altra domanda sotto il lavoro, un altro giro. «Why doesn't
 * he ask me all in one go, right as one task, before he produces?» Quindi
 * qui si tengono tutte quelle che ha scritto — pulite una per una come
 * l'unica di prima, senza doppioni, spezzate se stavano sulla stessa riga —
 * e chi le legge risponde a tutte in un colpo. Se non ne trova nessuna con
 * il punto interrogativo, torna quello che tornava `soloDomanda`.
 */
export function tutteLeDomande(testo: string, max = 1): string {
  const righe = senzaSegni(testo).split('\n').map(r => r.trim()).filter(r => r.includes('?'))
  const domande: string[] = []
  for (const riga of righe) {
    // dentro una riga possono essercene due: si spezzano al punto interrogativo
    for (const pezzo of riga.split(/(?<=\?)\s+/)) {
      const fino = pezzo.indexOf('?')
      if (fino < 0) continue
      const una = accorciata(togliIlCappello(pezzo.slice(0, fino + 1)).trim())
      if (una.length < 4 || domande.some(d => d.toLowerCase() === una.toLowerCase())) continue
      domande.push(una)
      if (domande.length >= max) return domande.join('\n')
    }
  }
  return domande.length ? domande.join('\n') : soloDomanda(testo)
}

// — la lingua in cui è nato un testo —
//
// Il difetto che si vede in faccia: l'app in inglese, e in mezzo al feed una
// voce intitolata «Cosa significa "large-object promisors" in Git?» con due
// righe in italiano sotto. Non è una traduzione sbagliata — è testo *nato*
// nella lingua sbagliata, e nessun dizionario del client lo può recuperare
// perché non è una chiave, è una frase scritta stanotte da un modello.
//
// L'istruzione al modello c'è, ripetuta in testa e in coda (`conLaLingua`), e
// un modello grande la rispetta. Un modello piccolo che gira sul portatile no,
// non sempre: legge del materiale in italiano e risponde in italiano, perché
// è quello che ha sotto gli occhi. Quindi dopo l'istruzione serve un controllo,
// e il controllo dev'essere qualcosa che si possa fare senza chiedere a
// nessuno: contare le parole di servizio.
//
// Non riconosce la lingua di un testo — non è quello il mestiere. Risponde a
// una domanda sola e più facile: «questa frase è italiana invece che inglese,
// abbastanza da vedersi?». Per questo la soglia è uno scarto di due marcatori
// e non uno, e per questo sotto le sei parole non risponde: un titolo di tre
// parole non ha abbastanza segni per dire niente, e sbagliare vuol dire
// buttare una voce giusta.

/** Le parole di servizio dell'italiano: quelle che compaiono comunque. */
const ITALIANE = [
  ' il ', ' la ', ' di ', ' che ', ' per ', ' non ', ' una ', ' un ', ' con ',
  ' sono ', ' della ', ' degli ', 'è '
]
/** Le stesse, in inglese. */
const INGLESI = [
  ' the ', ' and ', ' of ', ' to ', ' is ', ' for ', ' with ', ' that ',
  ' this ', ' are '
]
/** Sotto queste parole non si giudica: non ci sono abbastanza segni. */
const PAROLE_MIN = 6
/** Di quanto una lingua deve battere l'altra perché la risposta sia sì. */
const SCARTO = 2

/**
 * Il testo ridotto a parole separate da spazi, con uno spazio anche ai bordi.
 *
 * La punteggiatura diventa spazio perché i marcatori hanno lo spazio dentro:
 * senza, «l'app» non darebbe mai « un » e «di, Rossi» non darebbe mai « di ».
 * Lo spazio ai bordi serve alla prima e all'ultima parola, che altrimenti non
 * potrebbero mai essere un marcatore.
 */
function spianato(testo: string): string {
  return ` ${testo.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
}

/** Quante volte compaiono, contando anche quelle che condividono uno spazio. */
function quanti(spianato: string, segni: string[]): number {
  let n = 0
  for (const s of segni) {
    let i = spianato.indexOf(s)
    while (i >= 0) { n++; i = spianato.indexOf(s, i + 1) }
  }
  return n
}

function pesa(testo: string): { parole: number; it: number; en: number } {
  const t = spianato(testo)
  const parole = t.trim() ? t.trim().split(' ').length : 0
  return { parole, it: quanti(t, ITALIANE), en: quanti(t, INGLESI) }
}

/** Questo testo è scritto in italiano, abbastanza da vedersi. */
export function sembraItaliano(testo: string): boolean {
  const { parole, it, en } = pesa(testo)
  return parole >= PAROLE_MIN && it - en >= SCARTO
}

/** Questo testo è scritto in inglese, abbastanza da vedersi. */
export function sembraInglese(testo: string): boolean {
  const { parole, it, en } = pesa(testo)
  return parole >= PAROLE_MIN && en - it >= SCARTO
}

/**
 * Questo testo è nato nella lingua sbagliata per un'app in questa lingua.
 *
 * È la domanda che si fanno le quattro schermate che mostrano testo scritto da
 * un modello: il feed, il punto, la rassegna e le domande. Nel dubbio risponde
 * di no — un testo corto, o senza marcatori, o con le due lingue appaiate, non
 * è «sbagliato»: è solo un testo su cui non si sa rispondere, e buttarlo
 * costerebbe più di quanto costi tenerlo.
 */
export function linguaSbagliata(testo: string, lingua: 'it' | 'en'): boolean {
  return lingua === 'en' ? sembraItaliano(testo) : sembraInglese(testo)
}

/** L'ordine da attaccare al messaggio quando si riprova, nella sua lingua. */
export function soloInLingua(lingua: 'it' | 'en'): string {
  return lingua === 'en' ? 'IN ENGLISH ONLY' : 'SOLO IN ITALIANO'
}
