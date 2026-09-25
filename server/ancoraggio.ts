// L'ancoraggio di una risposta a quello che il modello ha letto davvero.
//
// Una citazione «[3]» è vera solo se il documento tre contiene la frase che
// la porta. Finora si controllava soltanto che il numero esistesse; qui si
// va oltre, senza chiamare nessun modello: si tolgono i numeri che non
// puntano a niente, si cerca nell'estratto *visto* dal modello il passo che
// regge la frase, e si scrive un piccolo verbale (`Verifica`) che dice quali
// cifre, date e nomi della risposta non stanno in niente di quello che le è
// stato mandato. Nessuna risposta viene cambiata o nascosta: si registra.
//
// Tutto puro: entra testo, esce testo. Le prove stanno in ancoraggio.test.ts.

import { termini, radice } from './lingua.ts'
import { senzaCodice, senzaTrattiniFuoriCodice } from './testo.ts'
export { senzaCodice }
import type { Documento } from './store.ts'

/** La riga del rifiuto, esatta, nelle due lingue. Sta nel prompt e nel dizionario. */
export const NON_CE_LHO = { it: 'Non ce l’ho.', en: 'I don’t have that.' } as const

/** Da quale strada è arrivata la risposta. */
export type Via = 'scorciatoia' | 'abbonamento' | 'claude' | 'compatibile' | 'chatgpt' | 'nessuno'

export type FonteAncorata = {
  id: string
  /** «[n] titolo», come `fontiCitate`; «[M] <progetto>» o «[M]» per la memoria. */
  label: string
  fonte?: string
  tipo?: string
  autore?: string | null
  quando?: string | null
  inviato?: boolean
  /** Il passo che regge la frase del primo segno (il pezzo fino al segno, se ne ha uno), alla lettera dall'estratto visto; al massimo 220 caratteri. */
  passo?: string
  /**
   * Un passo per ogni segno [n] di questa fonte, nell'ordine in cui compaiono
   * nel testo, null dove la frase non ne ha uno. Solo quando la fonte è
   * citata più di una volta: la data non prova il prezzo, e il secondo segno
   * mostra il suo passo, non quello del primo, anche dentro la stessa frase.
   */
  passi?: (string | null)[]
}

export type Verifica = {
  v: 1
  via: Via
  ricominciata: boolean
  /** Quante fonti distinte [n] sono rimaste. */
  citazioni: number
  /** [M] rimasto. */
  memoria: boolean
  /** I numeri tolti: fuori dall'elenco, o zero. */
  nonValide: number[]
  /** I fatti duri della risposta che non stanno in niente di quello che il modello ha letto. */
  scoperti: string[]
  /** La riga del rifiuto (`eUnRifiuto`) e nessun segno rimasto: un rifiuto che cita una fonte ha risposto. */
  rifiuto: boolean
  /** Non un rifiuto, nessun segno, e almeno un fatto duro o due frasi. */
  senzaFonti: boolean
  /** Messa dopo, da risposte-vive.ts, se il suo messaggio successivo la contraddice. */
  corretta?: true
}

// — i fatti duri —

const MESI: Record<string, number> = {
  gennaio: 1, gen: 1, january: 1, jan: 1,
  febbraio: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  aprile: 4, apr: 4, april: 4,
  maggio: 5, mag: 5, may: 5,
  giugno: 6, giu: 6, june: 6, jun: 6,
  luglio: 7, lug: 7, july: 7, jul: 7,
  // «set» e «ago» no: sono anche parole comuni («3 days ago», «the set»)
  agosto: 8, august: 8, aug: 8,
  settembre: 9, sett: 9, september: 9, sep: 9, sept: 9,
  ottobre: 10, ott: 10, october: 10, oct: 10,
  novembre: 11, nov: 11, november: 11,
  dicembre: 12, dic: 12, december: 12, dec: 12
}
const MESE = Object.keys(MESI).sort((a, b) => b.length - a.length).join('|')

const due = (n: number) => String(n).padStart(2, '0')
const giornoValido = (g: number, m: number) => g >= 1 && g <= 31 && m >= 1 && m <= 12

type Fatto = { valore: string; inizio: number; fine: number }

/**
 * Un numero scritto in un modo qualunque, ridotto a uno solo.
 *
 * «1.200», «1,200», «1 200» sono la stessa cifra; «1,5» e «1.5» pure. La
 * regola è quella della spec: un separatore seguito da esattamente tre cifre
 * è delle migliaia, altrimenti è la virgola dei decimali.
 */
function numeroPiano(grezzo: string): string {
  // «1.0.3», «22.1.0», «192.168.1.10»: due o più separatori uguali e almeno
  // un gruppo che non è di tre cifre. Non è una cifra, è un codice: resta
  // com'è, e «1.0.3» non è «1.0.4». «1.200.000» (tutti gruppi di tre) resta
  // un milione e duecentomila, «1.234,56» (separatori diversi) un decimale.
  const separatori = grezzo.match(/[.,]/g) ?? []
  const gruppi = grezzo.split(/[.,\s]/)
  if (separatori.length >= 2 && new Set(separatori).size === 1 && gruppi.slice(1).some(g => g.length !== 3)) return grezzo
  const pezzi = grezzo.split(/([.,\s])/)
  let intero = pezzi[0]
  let decimali = ''
  for (let i = 1; i < pezzi.length; i += 2) {
    const gruppo = pezzi[i + 1] ?? ''
    if (!decimali && gruppo.length === 3 && pezzi[i] !== undefined) intero += gruppo
    else { decimali = gruppo; break }
  }
  intero = intero.replace(/^0+(?=\d)/, '')
  decimali = decimali.replace(/0+$/, '')
  return decimali ? `${intero}.${decimali}` : intero
}

const VALUTE = '€|\\$|£|eur|usd|gbp'
const UNITA = '%|k|kg|km|h|ore|min'

/** I fatti duri con la loro posizione nel testo: cifre, date, ore, indirizzi, codici. */
function fattiConPosizione(testo: string): Fatto[] {
  const fuori: Fatto[] = []
  // quello che è già stato preso non si riprende: una maschera di occupazione,
  // non una copia del testo riscritta a ogni presa (su un prompt intero
  // costava il quadrato della lunghezza, sulla strada di ogni risposta)
  const preso = new Uint8Array(testo.length)
  const libero = (da: number, a: number) => { for (let i = da; i < a; i++) if (preso[i]) return false; return true }
  const prendi = (re: RegExp, valore: (m: RegExpExecArray) => string | null) => {
    for (const m of testo.matchAll(re)) {
      const da = m.index, a = m.index + m[0].length
      if (!libero(da, a)) continue
      const v = valore(m as RegExpExecArray)
      if (v === null) continue
      fuori.push({ valore: v, inizio: da, fine: a })
      preso.fill(1, da, a)
    }
  }
  // indirizzi e link, prima di tutto: dentro hanno cifre e punti
  prendi(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, m => m[0].toLowerCase())
  prendi(/(?:https?:\/\/|www\.)[^\s<>()«»"']+/gi, m => m[0].replace(/[.,;:!?]+$/, '').toLowerCase())
  // le date con l'anno e senza: ISO, numeriche, coi nomi dei mesi in italiano e inglese
  prendi(/\b(\d{4})-(\d{2})-(\d{2})\b/g, m => giornoValido(Number(m[3]), Number(m[2])) ? `${m[1]}-${m[2]}-${m[3]}` : null)
  prendi(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g, m => giornoValido(Number(m[1]), Number(m[2])) ? `${m[3]}-${due(Number(m[2]))}-${due(Number(m[1]))}` : null)
  prendi(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MESE})\\.?(?:,?\\s+(\\d{4}))?\\b`, 'gi'), m => {
    const mese = MESI[m[2].toLowerCase()]
    if (!giornoValido(Number(m[1]), mese)) return null
    return m[3] ? `${m[3]}-${due(mese)}-${due(Number(m[1]))}` : `${due(mese)}-${due(Number(m[1]))}`
  })
  prendi(new RegExp(`\\b(${MESE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi'), m => {
    const mese = MESI[m[1].toLowerCase()]
    if (!giornoValido(Number(m[2]), mese)) return null
    return m[3] ? `${m[3]}-${due(mese)}-${due(Number(m[2]))}` : `${due(mese)}-${due(Number(m[2]))}`
  })
  // le ore: «9:30», e «alle 9.30», «ore 9.30», «at 9.30» col punto all'italiana,
  // che senza la parola davanti sarebbe il decimale nove virgola tre
  prendi(/\b(\d{1,2}):(\d{2})\b/g, m => Number(m[1]) < 24 && Number(m[2]) < 60 ? `${due(Number(m[1]))}:${m[2]}` : null)
  prendi(/\b(?:alle|dalle|ore|at|h)\s+(\d{1,2})\.(\d{2})\b(?![.,]\d)/gi, m => Number(m[1]) < 24 && Number(m[2]) < 60 ? `${due(Number(m[1]))}:${m[2]}` : null)
  // i codici: lettere e cifre attaccate, «INV-2231», «AB1234»
  prendi(/\b[A-Za-z]{2,6}-?\d{2,}\b/g, m => m[0].toUpperCase())
  // le cifre: con valuta, unità o decimali sempre; da sole, solo con almeno due
  // cifre. Uno spazio (anche fine o non separabile) unisce le migliaia solo
  // nella forma «1 200 000», da una a tre cifre e poi gruppi di tre esatte:
  // «555 1234 567» sono tre numeri, e a capo non si unisce mai niente
  prendi(new RegExp(`(?:(?<![\\p{L}])(${VALUTE}))?\\s?(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3}(?!\\d))+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)*)\\s?(${VALUTE}|${UNITA})?(?![\\w])`, 'giu'), m => {
    const grezzo = m[2]
    const cifre = grezzo.replace(/\D/g, '')
    const conSegno = !!m[1] || !!m[3] || /[.,]\d+$/.test(grezzo) && !(/[.,]\d{3}$/.test(grezzo))
    if (cifre.length < 2 && !conSegno) return null
    const piano = numeroPiano(grezzo)
    // «4.8k» e «€4,800» sono la stessa cifra: la k vale mille
    if (m[3] && /^k$/i.test(m[3]) && /^\d+(?:\.\d+)?$/.test(piano)) return String(Math.round(Number(piano) * 1000))
    return piano
  })
  return fuori.sort((a, b) => a.inizio - b.inizio)
}

/** I fatti duri di un testo: normalizzati, senza doppioni, in ordine di comparsa. */
export function fattiDuri(testo: string): string[] {
  const visti = new Set<string>()
  const fuori: string[] = []
  for (const f of fattiConPosizione(testo)) {
    if (visti.has(f.valore)) continue
    visti.add(f.valore)
    fuori.push(f.valore)
  }
  return fuori
}

const eData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
const eGiornoMese = (v: string) => /^\d{2}-\d{2}$/.test(v)
const eAnno = (v: string) => /^(19|20)\d{2}$/.test(v)

/**
 * Un fatto è coperto da un insieme di fatti.
 *
 * Una data senza anno vale per qualunque data con lo stesso giorno e mese, e
 * viceversa; un anno da solo vale per una data di quell'anno.
 */
export function coperto(fatto: string, insieme: readonly string[]): boolean {
  if (insieme.includes(fatto)) return true
  if (eGiornoMese(fatto)) return insieme.some(x => eData(x) && x.endsWith(`-${fatto}`))
  if (eData(fatto)) return insieme.includes(fatto.slice(5))
  if (eAnno(fatto)) return insieme.some(x => eData(x) && x.startsWith(`${fatto}-`))
  return false
}

// — il rifiuto —

const apostrofi = (s: string) => s.replace(/[’‘`´]/g, '\'')

const RIGHE_DI_RIFIUTO = [
  NON_CE_LHO.it, NON_CE_LHO.en,
  'Non ho trovato niente su questo', 'I found nothing on this'
].map(r => apostrofi(r).toLowerCase().replace(/\.$/, ''))

/**
 * La risposta è un rifiuto: la riga canonica, da sola o con al massimo una
 * frase corta dopo. «Non ce l'ho fatta» non lo è, e nemmeno una risposta a
 * metà che rifiuta solo l'ultima parte. Qui si guarda solo la forma: se la
 * frase dopo cita una fonte o porta un fatto che il modello non ha letto lo
 * dicono `ancora` (le citazioni) e l'esame delle risposte (i fatti scoperti).
 */
export function eUnRifiuto(testo: string): boolean {
  // il prompt mostra la riga fra virgolette: un modello che la ricopia con le
  // virgolette, o in grassetto, ha rifiutato lo stesso
  const t = apostrofi(testo).trim().replace(/^[«»“”"'*_\s]+/, '').replace(/[«»“”"'*_\s]+$/, '').toLowerCase()
  const riga = RIGHE_DI_RIFIUTO.find(r => t.startsWith(r) && /^(?:[.!]|[«»“”"'*_]|\s*$|\n)/.test(t.slice(r.length)))
  if (riga === undefined) return false
  const dopo = t.slice(riga.length).replace(/^[.!\s«»“”"'*_]+/, '').trim()
  if (!dopo) return true
  const frasi = dopo.split(/[.!?]+(?:\s+|$)/).map(f => f.trim()).filter(Boolean)
  if (frasi.length > 1) return false
  return frasi[0].split(/\s+/).length <= 15
}

// — le citazioni —

const SEGNO = /\[(\d{1,3}|M)\]/g

/**
 * I segni della risposta, messi in ordine.
 *
 * «[1, 2]» e «[1-3]» diventano «[1][2]» e «[1][2][3]»; un numero fuori
 * dall'elenco sparisce e finisce in `nonValide`; «[M]» resta solo se c'era
 * davvero della memoria nel prompt; lo spazio prima di un segno se ne va.
 * «[2024]» e «[a]» non sono segni e non si toccano, e il codice nemmeno.
 */
export function pulisciCitazioni(testo: string, quanti: number, memoria: boolean): { testo: string; nonValide: number[] } {
  const codice = senzaCodice(testo)
  let t = codice.testo
    .replace(/\[(\d{1,3})(?:\s*[,;]\s*\d{1,3})+\]/g, m => m.slice(1, -1).split(/\s*[,;]\s*/).map(n => `[${n}]`).join(''))
    .replace(/\[(\d{1,3})\s*[-–]\s*(\d{1,3})\]/g, (m, a: string, b: string) => {
      const da = Number(a), a_ = Number(b)
      if (a_ < da) return m
      const fino = Math.min(a_, da + 9)
      const fuori: string[] = []
      for (let n = da; n <= fino; n++) fuori.push(`[${n}]`)
      return fuori.join('')
    })
  const nonValide: number[] = []
  t = t.replace(/\[(\d{1,3})\]/g, (m, n: string) => {
    const k = Number(n)
    if (k >= 1 && k <= quanti) return m
    if (!nonValide.includes(k)) nonValide.push(k)
    return ''
  })
  if (!memoria) t = t.replace(/\[M\]/g, '')
  t = t.replace(/[ \t]+(?=\[(?:\d{1,3}|M)\])/g, '')
  // una virgola o un punto rimasti staccati da un segno tolto: «€4,800 .» torna «€4,800.»
  t = t.replace(/[ \t]+(?=[.,;:!?](?:\s|$))/g, '')
  // e due spazi dove stava un segno in mezzo alla frase
  t = t.replace(/([^\s\n]) {2,}(?=[^\s\n])/g, '$1 ')
  return { testo: codice.rimetti(t), nonValide }
}

// — il passo —

const senzaSegni = (s: string) => s.replace(SEGNO, '').replace(/\s{2,}/g, ' ').trim()

/**
 * Un segno o più subito dopo il punto («2026.[1] La quota…», anche con uno
 * spazio in mezzo): chiudono la frase insieme al punto e restano con lei.
 * Molti modelli mettono il segno dopo il punto, non prima; senza questo la
 * frase non si chiudeva più e tutto il capoverso diventava una frase sola,
 * con ogni segno che mostrava il passo sbagliato.
 *
 * Fra il punto e il segno possono stare le virgolette che chiudono una
 * citazione («…phase.”[1]», «…phase.»[1]», «'…phase.'[1]»), una parentesi,
 * o la fine di un grassetto o di un corsivo («**…phase.**[1]»): il punto
 * dentro le virgolette chiude la frase lo stesso. E i tre puntini «…» sono
 * un punto come gli altri.
 *
 * Le chiusure sono una classe di caratteri sola, non un'alternativa fra
 * «**», «__», «*» e «_»: quell'alternativa era ambigua, e davanti a una
 * riga da compilare («Il sottoscritto.____________, nato a») il motore
 * provava ogni modo di spartire gli underscore prima di arrendersi, con
 * un costo che raddoppiava quasi a ogni carattere; cinquanta bastavano a
 * fermare il server per minuti, dentro la risposta di tutti.
 */
const SEGNI_DOPO_IL_PUNTO = '(?:[ \\t]*\\[(?:\\d{1,3}|M)\\])*'
const CHIUSURE_DOPO_IL_PUNTO = '[»”’"\')\\]*_]*'
const FINE_FRASE = `${CHIUSURE_DOPO_IL_PUNTO}${SEGNI_DOPO_IL_PUNTO}(?=\\s|$)`
const FRASE = new RegExp(`(?:[^.!?…\\n]|[.!?…](?!${FINE_FRASE}))+(?:[.!?…]+${FINE_FRASE}|\\n|$)`, 'g')

/**
 * Le frasi di un testo, con la posizione: prima le righe, poi le frasi dentro
 * ogni riga. Un punto chiude la frase solo davanti a uno spazio o alla fine,
 * anche attraverso una virgoletta o un grassetto che chiude e un segno:
 * quello dentro «1.200», «27.07.2026» o «1.0.3» è parte della frase.
 */
function frasiCon(testo: string): { testo: string; inizio: number; fine: number }[] {
  const fuori: { testo: string; inizio: number; fine: number }[] = []
  for (const m of testo.matchAll(FRASE)) {
    const t = m[0]
    if (!t.trim()) continue
    fuori.push({ testo: t, inizio: m.index, fine: m.index + t.length })
  }
  return fuori
}

const radiciDi = (s: string) => new Set(termini(s).map(radice).filter(r => r.length >= 3 && !/^\d+$/.test(r)))

/** Il pezzo di una finestra attorno a una posizione, tagliato a 220 caratteri con «…» dove si taglia. */
function attorno(finestra: string, dove: number, tetto = 220): string {
  const f = finestra.trim()
  if (f.length <= tetto) return f
  const inizio = Math.max(0, Math.min(dove - Math.floor(tetto / 2), f.length - tetto))
  const fine = Math.min(f.length, inizio + tetto)
  let pezzo = f.slice(inizio, fine)
  // ai bordi si tagliano le mezze parole, non le lettere
  if (inizio > 0) pezzo = pezzo.replace(/^\S*\s/, '')
  if (fine < f.length) pezzo = pezzo.replace(/\s\S*$/, '')
  return `${inizio > 0 ? '…' : ''}${pezzo.trim()}${fine < f.length ? '…' : ''}`
}

/**
 * Il passo dell'estratto che regge una frase della risposta.
 *
 * Vince la finestra con più fatti duri della frase; a parità, quella con più
 * radici in comune, contate una volta sola ciascuna (una riga che ripete
 * «pilot» undici volte non batte la frase che porta la data). Una frase con
 * dei fatti duri vale solo con almeno uno di quei fatti nella finestra:
 * «Build 1.0.3 goes to App Review» non prova «the build is 1.0.9», per quante
 * parole abbiano in comune. Una frase senza fatti vale con almeno tre radici.
 * Altrimenti non c'è nessun passo, e non se ne inventa uno.
 */
export function passoPer(frase: string, estratto: string): string | undefined {
  const f = senzaSegni(frase)
  if (!f || !estratto.trim()) return undefined
  const fatti = fattiDuri(f)
  const radici = radiciDi(f)
  let migliore: { fatti: number; radici: number; testo: string; dove: number } | null = null
  for (const fin of frasiCon(estratto)) {
    const suoi = fattiConPosizione(fin.testo)
    const valori = suoi.map(x => x.valore)
    let nFatti = 0
    let dove = -1
    for (const x of fatti) {
      if (!coperto(x, valori)) continue
      nFatti++
      if (dove < 0) {
        const p = suoi.find(s => s.valore === x || coperto(x, [s.valore]))
        dove = p ? p.inizio : 0
      }
    }
    const inComune = new Set<string>()
    for (const t of termini(fin.testo)) {
      const r = radice(t)
      if (!radici.has(r)) continue
      inComune.add(r)
      if (dove < 0) dove = Math.max(0, fin.testo.toLowerCase().indexOf(t))
    }
    const nRadici = inComune.size
    if (!nFatti && !nRadici) continue
    if (!migliore || nFatti > migliore.fatti || (nFatti === migliore.fatti && nRadici > migliore.radici)) {
      migliore = { fatti: nFatti, radici: nRadici, testo: fin.testo, dove: Math.max(0, dove) }
    }
  }
  if (!migliore || (fatti.length > 0 ? migliore.fatti < 1 : migliore.radici < 3)) return undefined
  return attorno(migliore.testo, migliore.dove)
}

// — l'ancora —

/**
 * Per ogni comparsa del segno dato, nell'ordine del testo: la frase della
 * risposta che lo porta, e il suo pezzo, dal segno precedente (di qualunque
 * fonte, o dall'inizio della frase) fino a lui.
 *
 * Claude e GPT citano spesso ogni proposizione da sé: «X il 14 ottobre [1],
 * e la quota è 4.800 € [1].» è una frase sola con due segni, e il segno
 * dopo la quota deve provare la quota, non la data.
 */
function frasiCol(testo: string, segno: string): { frase: string; pezzo: string }[] {
  const frasi = frasiCon(testo)
  const fuori: { frase: string; pezzo: string }[] = []
  for (let i = testo.indexOf(segno); i >= 0; i = testo.indexOf(segno, i + segno.length)) {
    const f = frasi.find(x => i >= x.inizio && i < x.fine)
    if (!f) { fuori.push({ frase: '', pezzo: '' }); continue }
    const prima = f.testo.slice(0, i - f.inizio)
    let da = 0
    for (const m of prima.matchAll(SEGNO)) da = m.index + m[0].length
    fuori.push({ frase: f.testo, pezzo: prima.slice(da) })
  }
  return fuori
}

/** La frase della risposta che porta il primo segno dato. */
function fraseCol(testo: string, segno: string): string {
  return frasiCol(testo, segno)[0]?.frase ?? ''
}

/** Il progetto nominato nella frase, se ce n'è esattamente uno. */
function progettoNominato(frase: string, progetti: { id: string; nome: string; alias?: string[] }[]): { id: string; nome: string } | null {
  const f = frase.toLowerCase()
  const trovati = progetti.filter(p => [p.nome, ...(p.alias ?? [])].some(n => {
    const nome = n.trim().toLowerCase()
    if (!nome) return false
    const i = f.indexOf(nome)
    if (i < 0) return false
    const prima = i === 0 ? ' ' : f[i - 1]
    const dopo = i + nome.length >= f.length ? ' ' : f[i + nome.length]
    return !/[\p{L}\p{N}]/u.test(prima) && !/[\p{L}\p{N}]/u.test(dopo)
  }))
  return trovati.length === 1 ? { id: trovati[0].id, nome: trovati[0].nome } : null
}

/**
 * La risposta pulita, le fonti con il loro passo, e il verbale.
 *
 * `estratti` dice quanti caratteri di ogni documento il modello ha visto:
 * il passo si cerca solo lì dentro. `letto` è tutto quello che gli è stato
 * mandato: un fatto che sta lì non è scoperto, anche se non è in nessun
 * documento (una cifra sua, la data di oggi).
 */
export function ancora(testo: string, o: {
  visti: Documento[]
  estratti: Map<string, number>
  letto: string
  memoria: boolean
  progetti?: { id: string; nome: string; alias?: string[] }[]
  via: Via
  ricominciata?: boolean
}): { testo: string; fonti: FonteAncorata[]; verifica: Verifica } {
  const pulita = pulisciCitazioni(testo, o.visti.length, o.memoria)
  // le lineette se ne vanno dalla prosa; dentro un blocco di codice sono sintassi e restano
  const t = senzaTrattiniFuoriCodice(pulita.testo)
  // i segni si contano e si cercano nella prosa: `b[1]` in un blocco di codice non cita niente
  const prosa = senzaCodice(t)
  const citati = new Set<number>()
  for (const m of prosa.testo.matchAll(/\[(\d{1,3})\]/g)) citati.add(Number(m[1]))
  const fonti: FonteAncorata[] = []
  o.visti.forEach((d, i) => {
    const n = i + 1
    if (!citati.has(n)) return
    const f: FonteAncorata = {
      id: d.id, label: `[${n}] ${d.titolo}`,
      fonte: d.fonte, tipo: d.tipo, autore: d.autore ?? null, quando: d.quando ?? null, inviato: !!d.inviato
    }
    // un passo per ogni segno: la frase del secondo [n] è un'altra frase, e
    // vuole il suo passo (o nessuno), non quello della prima
    const estratto = d.corpo.slice(0, o.estratti.get(d.id) ?? 0)
    const trovati = new Map<string, string | null>()
    const cerca = (fr: string) => {
      if (!trovati.has(fr)) trovati.set(fr, passoPer(prosa.rimetti(fr), estratto) ?? null)
      return trovati.get(fr)!
    }
    // Prima il pezzo di frase fino al segno: con due segni nella stessa
    // frase, quello dopo la quota prova la quota. Un pezzo senza fatti duri
    // e senza abbastanza parole in comune («e serve al tuo obiettivo [1]»)
    // torna alla frase intera; un pezzo con un fatto che l'estratto non ha
    // resta senza passo, perché la frase intera proverebbe un'altra cosa
    const passi = frasiCol(prosa.testo, `[${n}]`).map(({ frase, pezzo }) => {
      const p = cerca(pezzo)
      if (p !== null || pezzo === frase) return p
      return fattiDuri(senzaSegni(prosa.rimetti(pezzo))).length ? null : cerca(frase)
    })
    if (passi[0]) f.passo = passi[0]
    if (passi.length > 1) f.passi = passi
    fonti.push(f)
  })
  const memoria = o.memoria && prosa.testo.includes('[M]')
  if (memoria) {
    const p = progettoNominato(senzaSegni(prosa.rimetti(fraseCol(prosa.testo, '[M]'))), o.progetti ?? [])
    fonti.push(p
      ? { id: `memoria:progetto:${p.id}`, label: `[M] ${p.nome}`, fonte: 'memoria' }
      : { id: 'memoria', label: '[M]', fonte: 'memoria' })
  }
  const lettiTutti = fattiDuri(o.letto)
  const scoperti = fattiDuri(t).filter(x => !coperto(x, lettiTutti))
  // «Non ce l'ho. La quota è 4.800 € [1].» ha citato una fonte: ha risposto,
  // non ha rifiutato. Un fatto scoperto nella frase dopo resta invece nel
  // verbale come tale: chi legge il verbale vede tutt'e due le cose
  const rifiuto = eUnRifiuto(t) && citati.size === 0
  const frasi = frasiCon(senzaSegni(prosa.testo)).length
  const senzaFonti = !rifiuto && citati.size === 0 && !memoria && (fattiDuri(t).length >= 1 || frasi >= 2)
  return {
    testo: t, fonti,
    verifica: {
      v: 1, via: o.via, ricominciata: !!o.ricominciata,
      citazioni: citati.size, memoria, nonValide: pulita.nonValide,
      scoperti, rifiuto, senzaFonti
    }
  }
}
