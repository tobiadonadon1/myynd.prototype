/**
 * Tokenizzazione italiana per BM25: minuscolo, accenti rimossi per il
 * confronto, stopword italiane escluse, stemming leggero per far
 * combaciare singolare/plurale ("prezzi"/"prezzo", "fornitore"/"fornitori").
 *
 * Nessuna dipendenza esterna: solo trasformazioni di stringa.
 */

// Stopword italiane comuni: articoli, preposizioni (semplici e articolate),
// congiunzioni, pronomi, ausiliari, avverbi generici. Le forme sono già
// normalizzate (minuscolo, senza accenti) perché il confronto avviene dopo
// normalize().
const STOPWORDS = new Set<string>([
  // articoli
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
  // preposizioni semplici
  'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  // preposizioni articolate
  'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle',
  'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
  'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
  'col', 'coi',
  // congiunzioni e avverbi
  'e', 'o', 'ma', 'se', 'che', 'chi', 'cui', 'non', 'come', 'quando', 'dove',
  'perche', 'anche', 'piu', 'meno', 'molto', 'poco', 'tutto', 'tutti', 'tutta',
  'tutte', 'ogni', 'alcuni', 'alcune', 'qualche', 'niente', 'nulla', 'nessuno',
  'nessuna', 'gia', 'ancora', 'sempre', 'mai', 'oggi', 'ieri', 'domani', 'qui',
  'qua', 'li', 'la2_unused', 'cosi', 'quindi', 'dunque', 'pero', 'invece',
  'mentre', 'cioe', 'insomma', 'comunque', 'infatti', 'inoltre', 'oppure',
  'altrimenti', 'nonostante', 'benche', 'poiche', 'affinche', 'purche',
  'sebbene', 'senza', 'sopra', 'sotto', 'dentro', 'fuori', 'davanti', 'dietro',
  'prima', 'dopo', 'durante', 'verso', 'contro', 'secondo', 'tramite',
  'mediante', 'circa', 'presso', 'oltre', 'salvo', 'eccetto', 'tranne',
  'entro', 'lungo', 'attraverso',
  // pronomi
  'io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro', 'mi', 'ti', 'si', 'ci', 'vi',
  'ne', 'me', 'te', 'se2_unused',
  // possessivi
  'mio', 'mia', 'miei', 'mie', 'tuo', 'tua', 'tuoi', 'tue', 'suo', 'sua',
  'suoi', 'sue', 'nostro', 'nostra', 'nostri', 'nostre', 'vostro', 'vostra',
  'vostri', 'vostre',
  // dimostrativi
  'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli',
  'quelle', 'quel', 'quei', 'quegli',
  // verbi essere/avere (forme comuni)
  'e2_unused', 'sono', 'sei', 'siamo', 'siete', 'era', 'eri', 'eravamo',
  'eravate', 'erano', 'sara', 'sarai', 'saremo', 'sarete', 'saranno', 'sia',
  'siano', 'ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno', 'avevo', 'avevi',
  'aveva', 'avevamo', 'avevate', 'avevano',
])
// rimuove le voci segnaposto usate per evitare doppioni di chiave nel Set literal
STOPWORDS.delete('la2_unused')
STOPWORDS.delete('se2_unused')
STOPWORDS.delete('e2_unused')

/** minuscolo + rimozione diacritici, per il confronto (non per la visualizzazione) */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** vero se una parola gia normalizzata e una stopword italiana (non filtra per lunghezza) */
export function isStopword(normalizedWord: string): boolean {
  return STOPWORDS.has(normalizedWord)
}

/** stemming leggero: stacca una vocale finale su parole abbastanza lunghe */
function stem(word: string): string {
  if (word.length > 5 && /[aeiou]$/.test(word)) {
    return word.slice(0, -1)
  }
  return word
}

/** tokenizza per l'indicizzazione/ricerca BM25: normalizza, filtra stopword, applica lo stemming */
export function tokenize(text: string): string[] {
  const normalized = normalize(text)
  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean)
  const out: string[] = []
  for (const w of words) {
    if (w.length < 2) continue
    if (STOPWORDS.has(w)) continue
    out.push(stem(w))
  }
  return out
}
