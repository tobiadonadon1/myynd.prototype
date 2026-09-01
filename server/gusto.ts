// Il gusto: cosa impara Myynd da quello che apri e da quello che butti via.
//
// La rassegna, da sola, indovina. Sa quello che gli hai scritto negli argomenti
// — se gliel'hai scritto — e per il resto sceglie con il buon senso di un
// modello che non ti conosce. Ma ogni mattina tu fai due gesti che valgono più
// di qualunque frase: apri una notizia, e ne butti via un'altra. Quelli sono
// dati veri, non dichiarazioni; e la differenza fra quello che uno dice di
// voler leggere e quello che legge davvero è il motivo per cui esiste questo
// file.
//
// Due regole, e sono quelle che tengono in piedi la cosa:
//
//   · **inclina, non filtra.** Il gusto sposta l'ordine, non chiude la porta.
//     Una rassegna che ti dà solo quello che hai già letto smette di dirti
//     qualcosa il terzo giorno, e nessuno se ne accorge dall'interno — sembra
//     solo che il mondo si sia fatto noioso. Il giro fra gli argomenti in
//     `rassegna.ts` resta il primo criterio: prima si copre il mondo, poi
//     dentro ogni argomento vince quello che ti somiglia.
//   · **serve una prova.** Sotto una manciata di gesti non si conclude niente.
//     Tre letture non sono un gusto, sono tre letture, e costruirci sopra un
//     profilo vuol dire inseguire il rumore.
//
// Non costa niente: sono conteggi su righe che stanno già nell'indice. Nessuna
// chiamata a un modello per sapere cosa ti piace — quello che si manda al
// modello, quando c'è, sono due elenchi di parole.

import * as store from './store.ts'

/** Sotto questi gesti non si conclude niente: sarebbe rumore. */
export const MINIMO = 6

/** Quante parole si tengono per parte. Poche: sono un suggerimento, non un filtro. */
const QUANTE_PAROLE = 12

/** Il peso massimo che il gusto può avere nella scelta a mano. */
const TETTO = 6

/**
 * Le parole che non dicono niente di cosa ti piace.
 *
 * Non è un elenco di stop-word linguistiche: è l'elenco delle parole che
 * *ricorrono nei titoli di giornale* in ogni argomento. «Dice», «nuovo»,
 * «dopo» stanno ovunque, quindi non distinguono niente — e se restassero
 * dentro, il gusto imparerebbe che ti piacciono i titoli.
 */
const VUOTE = new Set([
  'dice', 'dopo', 'come', 'anche', 'ancora', 'contro', 'senza', 'primo', 'prima',
  'nuovo', 'nuova', 'nuove', 'nuovi', 'oggi', 'anni', 'anno', 'oltre', 'verso',
  'says', 'said', 'after', 'with', 'from', 'that', 'this', 'they', 'will', 'more',
  'over', 'into', 'about', 'than', 'been', 'have', 'what', 'when', 'here', 'just',
  'first', 'could', 'would', 'their', 'there', 'these', 'those', 'other', 'still',
  'live', 'updates', 'news', 'report', 'says:', 'video', 'watch', 'best', 'make'
])

function parole(testo: string): string[] {
  return testo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(p => p.length >= 4 && !VUOTE.has(p))
}

export type Gusto = {
  /** Vero quando i gesti bastano a concludere qualcosa. */
  vale: boolean
  lette: number
  scartate: number
  /** Le parole che ricorrono in quello che apri, dalle più forti. */
  piace: string[]
  /** Quelle che ricorrono in quello che butti via, e in nient'altro. */
  stufa: string[]
  /** I giornali che apri più spesso di quanto li scarti. */
  fonti: string[]
}

/**
 * Cosa si può concludere, adesso, da quello che è successo.
 *
 * Una parola finisce in `piace` se compare in quello che apri; finisce in
 * `stufa` solo se compare in quello che butti **e non** in quello che apri —
 * altrimenti «Iran» diventerebbe insieme un pregio e un difetto, e le due cose
 * si annullerebbero in silenzio.
 */
export function gusto(giorni = 30): Gusto {
  const tutte = store.notiziePerGusto(giorni)
  const lette = tutte.filter(n => n.letta)
  const scartate = tutte.filter(n => n.scartata)

  const conta = (righe: typeof tutte) => {
    const m = new Map<string, number>()
    for (const n of righe) for (const p of parole(n.titolo)) m.set(p, (m.get(p) ?? 0) + 1)
    return m
  }
  const buone = conta(lette)
  const cattive = conta(scartate)

  const inOrdine = (m: Map<string, number>, escludi?: Map<string, number>) =>
    [...m.entries()]
      .filter(([p, n]) => n >= 2 && !escludi?.has(p))
      .sort((a, b) => b[1] - a[1])
      .slice(0, QUANTE_PAROLE)
      .map(([p]) => p)

  // i giornali: quelli che apri più di quanto li butti, e almeno due volte
  const perFonte = new Map<string, { su: number; giu: number }>()
  for (const n of lette) {
    const v = perFonte.get(n.fonte) ?? { su: 0, giu: 0 }
    v.su++
    perFonte.set(n.fonte, v)
  }
  for (const n of scartate) {
    const v = perFonte.get(n.fonte) ?? { su: 0, giu: 0 }
    v.giu++
    perFonte.set(n.fonte, v)
  }

  return {
    vale: lette.length + scartate.length >= MINIMO && lette.length >= 2,
    lette: lette.length,
    scartate: scartate.length,
    piace: inOrdine(buone),
    stufa: inOrdine(cattive, buone),
    fonti: [...perFonte.entries()]
      .filter(([, v]) => v.su >= 2 && v.su > v.giu)
      .sort((a, b) => (b[1].su - b[1].giu) - (a[1].su - a[1].giu))
      .slice(0, 4)
      .map(([f]) => f)
  }
}

/**
 * Quanto una notizia somiglia a quello che leggi.
 *
 * Positivo tira verso l'alto, negativo verso il basso, e il valore è tagliato
 * a `TETTO` da tutte e due le parti: senza il tetto, un titolo che azzecca sei
 * parole del profilo scavalcherebbe qualunque cosa sia successa nel mondo
 * stamattina, che è il modo in cui una rassegna diventa una camera d'eco.
 */
export function affinita(g: Gusto, titolo: string, fonte: string): number {
  if (!g.vale) return 0
  const dentro = new Set(parole(titolo))
  let punti = 0
  for (const p of g.piace) if (dentro.has(p)) punti += 2
  for (const p of g.stufa) if (dentro.has(p)) punti -= 2
  if (g.fonti.includes(fonte)) punti += 1
  return Math.max(-TETTO, Math.min(TETTO, punti))
}

/**
 * Il gusto come si racconta al modello.
 *
 * Vuoto quando non c'è ancora abbastanza per dire qualcosa — e allora nel
 * prompt non compare proprio, invece di comparire come «non so niente di lei»,
 * che è una riga che il modello prende comunque per buona e che non aiuta.
 */
export function perIlModello(g: Gusto): string {
  if (!g.vale) return ''
  const parti: string[] = []
  if (g.piace.length) parti.push(`Apre volentieri notizie su: ${g.piace.join(', ')}.`)
  if (g.stufa.length) parti.push(`Ha buttato via, senza mai aprirne una, notizie su: ${g.stufa.join(', ')}.`)
  if (g.fonti.length) parti.push(`Legge più spesso: ${g.fonti.join(', ')}.`)
  parti.push(
    'Usalo per inclinare la scelta, non per restringerla: se una cosa importante ' +
    'succede fuori dai suoi interessi, quella va messa lo stesso.'
  )
  return parti.join(' ')
}

/**
 * Il gusto come si racconta a lei.
 *
 * Sta nelle preferenze, accanto al campo degli argomenti, e serve a una cosa
 * sola: vedere cosa Myynd ha concluso sul suo conto. Un profilo che ti
 * influenza la prima pagina e che non puoi né vedere né contraddire è
 * esattamente la cosa che questa app dice di non voler essere.
 */
export function inParole(g: Gusto, en: boolean): string {
  if (!g.vale) {
    return en
      ? 'Not enough yet: read a few and I will start to notice what you go for.'
      : 'Non basta ancora: aprine qualcuna e comincio a notare cosa scegli.'
  }
  const parti: string[] = []
  if (g.piace.length) {
    parti.push((en ? 'You open: ' : 'Apri: ') + g.piace.slice(0, 6).join(', '))
  }
  if (g.fonti.length) {
    parti.push((en ? 'mostly from ' : 'soprattutto da ') + g.fonti.join(', '))
  }
  if (g.stufa.length) {
    parti.push((en ? 'you skip: ' : 'salti: ') + g.stufa.slice(0, 4).join(', '))
  }
  return parti.join(' · ')
}
