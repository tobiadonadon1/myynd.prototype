// L'italiano, per la ricerca.
//
// FTS5 con unicode61 non sa niente di morfologia: "fatture" e "fattura" sono
// due parole diverse, e chi cerca il plurale non trova il singolare. Qui non
// serve un vero stemmer — serve tagliare la coda alle parole in modo *stabile*,
// così che le forme della stessa parola cadano sulla stessa radice.
//
// Sbagliare per eccesso costa poco (due parole diverse finiscono insieme e il
// bm25 le separa comunque); sbagliare per difetto costa una domanda senza
// risposta. Quindi la mano è leggera ma decisa.

/**
 * Gli accenti spariscono: chi scrive in fretta non li mette.
 *
 * È anche il motivo per cui in VUOTE non può stare «sarà»: piegato senza
 * accento diventa «sara», e da lì in poi cercare Sara — che in Italia è un
 * nome, non un verbo — non dava zero risultati, dava quelli sbagliati, perché
 * la parola spariva dalla domanda prima ancora di arrivare all'indice.
 */
function senzaAccenti(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Parole che comparirebbero in ogni documento: cercarle non restringe niente.
 * Passano anche loro da senzaAccenti, altrimenti "è" nella lista non
 * incontrerebbe mai la "e" che arriva da termini().
 */
const VUOTE = new Set([
  'a', 'ad', 'al', 'alla', 'alle', 'allo', 'agli', 'ai', 'anche', 'ancora',
  'che', 'chi', 'ci', 'come', 'con', 'cosa', 'cui', 'da', 'dal', 'dalla',
  'dalle', 'dallo', 'dagli', 'dai', 'del', 'della', 'delle', 'dello', 'degli',
  'dei', 'di', 'do', 'dove', 'e', 'ed', 'era', 'erano', 'essere', 'fa', 'fra',
  'gli', 'ha', 'hai', 'hanno', 'ho', 'i', 'il', 'in', 'io', 'l', 'la', 'le',
  'lo', 'ma', 'me', 'mi', 'ne', 'nel', 'nella', 'nelle', 'nello', 'negli',
  'nei', 'non', 'o', 'per', 'perche', 'piu', 'po', 'qual', 'quale', 'quali',
  'quando', 'quanto', 'quel', 'quella', 'quelle', 'quello', 'questa', 'queste',
  'questi', 'questo', 'se', 'sei', 'si', 'sia', 'siamo', 'sono', 'su',
  'sul', 'sulla', 'sulle', 'sullo', 'sugli', 'sui', 'ti', 'tra', 'tu', 'tuo',
  'un', 'una', 'uno', 'va', 'vi', 'è'
].map(senzaAccenti))

/**
 * Suffissi derivativi, dal più lungo al più corto: l'ordine è la regola.
 * Coprono le forme flesse — "spedizione"/"spedizioni", "pagamento"/"pagare" —
 * non le derivate: "amministrazione" e "amministrativo" restano due parole, e
 * va bene così, perché unirle costerebbe tagli molto più profondi.
 */
const CODE: [RegExp, string][] = [
  [/(azioni|azione|amenti|amento|imenti|imento)$/, ''],
  [/(zioni|zione|sioni|sione)$/, 'z'],
  [/(mente|mento|menti)$/, ''],
  [/(issimi|issime|issimo|issima)$/, ''],
  [/(atrice|atrici|atore|atori)$/, ''],
  [/(abile|abili|ibile|ibili)$/, ''],
  [/(anza|anze|enza|enze)$/, ''],
  [/(ita|ità|eta|età)$/, ''],
  [/(oso|osa|osi|ose)$/, ''],
  [/(ico|ica|ici|iche)$/, ''],
  [/(ale|ali|are|ari)$/, '']
]

/**
 * La radice di una parola. Non è linguistica, è pratica: deve solo far
 * combaciare singolare e plurale, maschile e femminile, e le forme più comuni
 * del verbo. Sotto le quattro lettere non si tocca niente: "case" e "casa" sì,
 * "re" e "ra" no.
 */
export function radice(parola: string): string {
  let p = senzaAccenti(parola.toLowerCase())
  if (p.length < 4) return p

  for (const [re, sost] of CODE) {
    if (re.test(p)) {
      const tagliata = p.replace(re, sost)
      if (tagliata.length >= 4) { p = tagliata; break }
    }
  }

  // la vocale finale porta genere e numero: fattura/fatture, cliente/clienti
  if (p.length > 3 && /[aeio]$/.test(p)) p = p.slice(0, -1)

  /**
   * La h che tiene duro il suono, e che spaccava in due mezza lingua.
   *
   * In italiano il plurale di «banca» è «banche», e quella h esiste solo per
   * non far diventare dolce la c. Ma per chi taglia le code sono due parole
   * diverse: «banca» finiva su «banc», «banche» su «banch», e cercare il
   * plurale non trovava il singolare. Vale per banche, elenchi, obblighi,
   * carichi, colleghi, buchi, dischi, banchi — cioè per una fetta larga
   * dell'italiano d'ufficio, e in silenzio: la ricerca tornava vuota e sembrava
   * che il documento non ci fosse.
   */
  if (p.length > 3 && /(ch|gh)$/.test(p)) p = p.slice(0, -1)

  // plurali già caduti su consonante doppia: "citt" resta "citt"
  return p
}

/** I termini utili di una frase, senza le parole vuote e senza punteggiatura. */
export function termini(frase: string): string[] {
  return senzaAccenti(frase.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(t => t && !VUOTE.has(t))
    // sotto i tre caratteri resta solo ciò che è numero: le cifre sono
    // numeri di fattura, gli articoli no
    .filter(t => t.length >= 3 || /^\d+$/.test(t))
}

/** Il testo ridotto a radici: è questa la colonna che rende la ricerca italiana. */
export function radici(testo: string): string {
  return termini(testo).map(radice).join(' ')
}
