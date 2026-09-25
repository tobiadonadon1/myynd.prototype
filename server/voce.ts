// Come scrive a quella persona, dalle mail che le ha mandato. Senza modello.
//
// Una bozza a Marco deve sembrare scritta da lei a Marco: nella lingua in cui
// gli scrive, con il suo saluto, la sua chiusura, la sua misura. Finora il
// modello aveva il ritratto (come scrive in generale) e qualche estratto per
// parole chiave; nessuno calcolava niente per persona. Qui si calcola, con
// una manciata di conteggi: la lingua per maggioranza, la prima riga più
// frequente, l'ultima riga prima della firma, la mediana delle parole, del tu
// o del Lei. Con meno di tre mail a quella persona si ripiega sulle ultime
// trenta che ha mandato a chiunque.
//
// Il blocco che ne esce entra nel prompt di chi svolge come prova, non come
// istruzione; la sola cosa che forza una riscrittura è la lingua sbagliata
// (`controlla`): saluto e chiusura vanno al revisore come evidenza.
//
// Niente lineette nel blocco: il modello le imita.

import * as store from './store.ts'
import * as chi from './chi.ts'
import * as lavoroDati from './lavoro-dati.ts'
import { corpoAttuale } from './rilevanza.ts'
import { sembraInglese, sembraItaliano } from './testo.ts'

export type Profilo = {
  lingua: 'it' | 'en' | null
  saluto: string | null
  chiusura: string | null
  parole: { mediana: number; alta: number }
  registro: 'tu' | 'lei' | null
  elenchi: boolean
  quanti: number
}

export type Destinatario = { indirizzo: string; nome: string }

export type Voce = {
  /** Il blocco per il prompt di chi svolge. */
  blocco: string
  /** La lingua in cui si scrive a questa persona, se si sa. */
  consegna?: 'it' | 'en'
  /** Quello che si salva sulla riga, per dire «come le tue 4 mail a Marco». */
  scritta: NonNullable<store.Compito['voceScritta']> | null
  /** Il profilo usato, per il controllo. */
  profilo: Profilo
  destinatario: Destinatario | null
}

/** Sotto questo numero di mail a quella persona si usa la voce di tutti i giorni. */
export const MINIMO = 3
const TTL = 30 * 60_000
const ULTIME = 30

type Cache<T> = { quando: number; valore: T }
const esempi = new Map<string, Cache<store.Documento[]>>()
const firme = new Map<string, Cache<string[]>>()
const chiave = (s: string) => `${chi.adesso() ?? ''}·${s}`

/** Solo per le prove: butta le cache. */
export function dimentica() { esempi.clear(); firme.clear() }

function daCache<T>(m: Map<string, Cache<T>>, k: string, calcola: () => T): T {
  const c = m.get(k)
  if (c && Date.now() - c.quando < TTL) return c.valore
  const valore = calcola()
  m.set(k, { quando: Date.now(), valore })
  return valore
}

const EPISTOLARE = /\b(?:mail|e-?mail|reply|repl\w*|respond\w*|answer\w*|send|sending|forward|message|messages|write\s+(?:back\s+)?to\b|rispond\w*|risposta|mand\w*|invi\w*|inoltr\w*|messagg\w*|scriv\w*\s+(?:a|al|alla|allo|ai|agli|alle)\b)/i
const INDIRIZZO = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const DI_POSTA = /^(?:posta|google|gmail|microsoft|outlook):/i

/** Il nome di chi ha scritto, senza l'indirizzo e le virgolette; il primo nome, se ce n'è più d'uno. */
function primoNome(autore: string | null | undefined, indirizzo: string): string {
  const senza = (autore ?? '').replace(/<[^>]*>/g, '').replace(/["']/g, '').trim()
  const nome = senza && !senza.includes('@') ? senza : indirizzo.split('@')[0]
  const primo = nome.split(/[\s.]+/).filter(Boolean)[0] ?? nome
  return primo.charAt(0).toUpperCase() + primo.slice(1)
}

/** A chi va: l'autore della mail da cui è nata la riga, o il primo indirizzo scritto nel compito. */
export function destinatarioDi(c: Pick<store.Compito, 'doc' | 'testo' | 'nota'>): Destinatario | null {
  if (c.doc && DI_POSTA.test(c.doc)) {
    const d = store.documento(c.doc)
    if (d && d.tipo === 'email' && !d.inviato) {
      const indirizzo = store.indirizzoDi(d.autore)
      if (indirizzo) return { indirizzo, nome: primoNome(d.autore, indirizzo) }
    }
  }
  const m = INDIRIZZO.exec(`${c.testo ?? ''}\n${c.nota ?? ''}`)
  if (m) {
    const indirizzo = m[0].toLowerCase()
    return { indirizzo, nome: primoNome(null, indirizzo) }
  }
  return null
}

export function esempiVerso(indirizzo: string): store.Documento[] {
  return daCache(esempi, chiave(indirizzo), () => lavoroDati.inviatiVerso(indirizzo, 12))
}

/** Una riga che chiude una mail: non è la firma, è la chiusura. */
const CHIUSURA = /^(?:a presto|a domani|a dopo|ciao|grazie|grazie mille|un saluto|un caro saluto|cordiali saluti|distinti saluti|buona giornata|buona serata|buon lavoro|saluti|best|best regards|kind regards|regards|warm regards|thanks|thank you|many thanks|cheers|talk soon|speak soon|take care|all the best|sincerely|yours)\b[,!.]?$/i

function righe(corpo: string): string[] {
  return corpo.split('\n').map(r => r.trim()).filter(Boolean)
}

/** Le ultime righe dopo l'ultima chiusura: la firma, se c'è. */
function codaDi(corpo: string): string[] {
  const r = righe(corpo)
  let da = r.length
  for (let i = r.length - 1; i >= 0; i--) if (CHIUSURA.test(r[i])) { da = i + 1; break }
  return r.slice(da).slice(-4)
}

/**
 * La firma: il blocco in coda (da una a quattro righe, uguali) presente in
 * almeno il sessanta per cento delle sue ultime trenta mail. Si toglie prima
 * di contare qualunque cosa e prima di misurare una distanza.
 */
export function firmaComune(corpi: string[]): string[] {
  const code = corpi.map(codaDi).filter(c => c.length)
  if (!code.length) return []
  const soglia = Math.ceil(corpi.length * 0.6)
  for (let k = 4; k >= 1; k--) {
    const conta = new Map<string, number>()
    for (const c of code) {
      if (c.length < k) continue
      const blocco = c.slice(-k).join('\n')
      conta.set(blocco, (conta.get(blocco) ?? 0) + 1)
    }
    const vince = [...conta].find(([, n]) => n >= soglia)
    if (vince) return vince[0].split('\n')
  }
  return []
}

function firma(): string[] {
  return daCache(firme, chiave('firma'), () => firmaComune(lavoroDati.ultimiInviati(ULTIME).map(d => corpoAttuale(d))))
}

/** Il corpo di adesso, senza la firma comune. */
export function senzaFirma(corpo: string, firmaDa: string[] = firma()): string {
  if (!firmaDa.length) return corpo.trim()
  const r = corpo.split('\n')
  // dal fondo, saltando le righe vuote: se le ultime righe sono la firma, via
  let fine = r.length
  while (fine > 0 && !r[fine - 1].trim()) fine--
  const coda = r.slice(fine - firmaDa.length, fine).map(x => x.trim())
  if (coda.length === firmaDa.length && coda.every((x, i) => x === firmaDa[i])) return r.slice(0, fine - firmaDa.length).join('\n').trim()
  return corpo.trim()
}

function piuFrequente(valori: string[], almeno = 1): string | null {
  const conta = new Map<string, number>()
  for (const v of valori) if (v) conta.set(v, (conta.get(v) ?? 0) + 1)
  let vince: string | null = null; let max = 0
  for (const [v, n] of conta) if (n > max) { vince = v; max = n }
  return max >= almeno ? vince : null
}

/**
 * La riga di apertura, se ne ha la forma: corta e chiusa da una virgola o
 * da due punti («Ciao Marco,», anche in testa a «Ciao Marco, ecco il file»),
 * oppure poche parole. Una riga qualunque di contenuto non è un saluto, e
 * una cifra con la virgola dentro nemmeno.
 */
export function salutoDi(prima: string): string | null {
  const r = prima.trim()
  const m = r.match(/^([^,:;!?]{1,40}[,:])(?=\s|$)/)
  if (m) return m[1].trim()
  if (r.length <= 40 && r.split(/\s+/).length <= 4) return r
  return null
}

/** Le parole che aprono un saluto senza essere un nome: non si mascherano. */
const NON_NOMI = new Set(['ciao', 'salve', 'buongiorno', 'buonasera', 'buona', 'buon', 'gentile', 'gentilissimo', 'gentilissima', 'egregio', 'egregia', 'spettabile', 'caro', 'cara', 'carissimo', 'carissima', 'grazie', 'signora', 'signore', 'signori', 'signorina', 'team', 'tutti', 'tutte', 'ragazzi', 'colleghi', 'hi', 'hello', 'hey', 'dear', 'good', 'morning', 'afternoon', 'evening', 'thanks', 'thank', 'greetings', 'all', 'again', 'there', 'everyone', 'folks', 'sir', 'madam', 'friends'])
const TITOLO = /^(?:dott|dott\.ssa|dr|mr|mrs|ms|miss|sig|sig\.ra|prof|ing|avv|on)\.?$/i
/** Un nome proprio: maiuscola in testa e almeno una minuscola («Marco», «D'Angelo»; non «Q4», non «SVG»). */
const NOME = /^\p{Lu}(?=[\p{L}'’-]*\p{Ll})[\p{L}'’-]*$/u

/**
 * Ogni nome proprio nel saluto diventa «{nome}», titolo compreso: «Ciao
 * Marco,» «Good morning Marco,» «Dear Mr. Smith,» e la riga fatta del solo
 * nome («Marco,»). «Ciao a tutti,» e «Hi Team,» restano come sono: non c'è
 * nessuno da non nominare.
 */
export function mascheraNomi(saluto: string): string {
  const parole = saluto.split(/\s+/).filter(Boolean)
  const coda = (p: string) => p.match(/[,:!.]+$/)?.[0] ?? ''
  // una virgola chiude il nome («Ciao Marco, Rossi» sono due cose); il punto di un titolo («Dott.») no
  const chiude = (p: string) => /[,:!]$/.test(p)
  const nudo = (p: string) => p.replace(/[,:!.]+$/, '')
  const titolo = (p: string) => TITOLO.test(nudo(p))
  const nome = (p: string) => NOME.test(nudo(p)) && !NON_NOMI.has(nudo(p).toLowerCase())
  // la riga fatta del solo nome (con o senza cognome): tutta un nome
  const da = parole.length <= 2 && nome(parole[0]) ? 0 : 1
  for (let i = da; i < parole.length; i++) {
    if (!titolo(parole[i]) && !nome(parole[i])) continue
    let j = i
    while (j < parole.length && (titolo(parole[j]) || nome(parole[j])) && (j === i || !chiude(parole[j - 1]))) j++
    // un titolo da solo non è un nome
    if (!parole.slice(i, j).some(nome)) { i = j; continue }
    return [...parole.slice(0, i), `{nome}${coda(parole[j - 1])}`, ...parole.slice(j)].join(' ')
  }
  return saluto
}

/** La testa di un estratto senza il nome di chi lo riceveva: il resto com'è. */
function senzaNomeInTesta(corpo: string): string {
  const [prima, ...resto] = corpo.split('\n')
  const s = salutoDi(prima)
  if (!s) return corpo
  return [prima.replace(s, mascheraNomi(s)), ...resto].join('\n')
}

const LEI = /\b(?:gentile|egregi[oa]|spett\.?|lei|la ringrazio|le scrivo|le mando|le invio|sua|suo|cordiali)\b/i
const TU = /\b(?:ciao|ti |tuo|tua|tuoi|tue|grazie mille|a presto|ti mando|ti scrivo|ti giro)\b/i

/** Il profilo dai corpi (già senza firma), con il nome del destinatario da mascherare nel saluto. */
export function profilo(corpi: string[], nome = ''): Profilo {
  const tutte = corpi.map(righe).filter(r => r.length)
  let it = 0, en = 0
  for (const c of corpi) { if (sembraItaliano(c)) it++; else if (sembraInglese(c)) en++ }
  const lingua: Profilo['lingua'] = it > en ? 'it' : en > it ? 'en' : null
  // il saluto è la riga di apertura quando ne ha la forma, e vale solo se
  // torna almeno due volte: una riga di contenuto capitata una volta non è
  // «come apre di solito». Il nome dentro diventa «{nome}»: quello del
  // destinatario se lo si sa, altrimenti ogni nome proprio («Ciao Marco,»
  // delle sue ultime mail non è il saluto per Giulia, e un modello lo
  // ricopierebbe)
  const maschera = (r: string) => nome
    ? r.replace(new RegExp(`\\b${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '{nome}')
    : mascheraNomi(r)
  const saluto = piuFrequente(tutte.map(r => { const s = salutoDi(r[0]); return s ? maschera(s) : '' }), 2)
  const chiusura = piuFrequente(tutte.map(r => { const fine = r.slice(1).reverse().find(x => CHIUSURA.test(x)); return fine ?? '' }))
  const conteggi = corpi.map(c => c.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b)
  const a = (q: number) => conteggi.length ? conteggi[Math.min(conteggi.length - 1, Math.floor((conteggi.length - 1) * q))] : 0
  let registro: Profilo['registro'] = null
  if (lingua === 'it') {
    const tutto = corpi.join('\n')
    const lei = (tutto.match(LEI) ?? []).length
    const tu = (tutto.match(TU) ?? []).length
    registro = lei > tu ? 'lei' : tu > lei ? 'tu' : null
  }
  const elenchi = corpi.some(c => /^\s*(?:[-*•]|\d{1,2}[.)])\s+/m.test(c))
  return { lingua, saluto, chiusura, parole: { mediana: a(0.5), alta: a(0.8) }, registro, elenchi, quanti: corpi.length }
}

const NOME_LINGUA = { it: 'italiano', en: 'inglese' } as const

/** Il blocco per il prompt: prova, non istruzione, senza lineette. */
function bloccoDi(p: Profilo, testa: string, esempi: string[]): string {
  const tratti = [
    p.lingua ? `in ${NOME_LINGUA[p.lingua]}` : '',
    p.registro ? (p.registro === 'tu' ? 'del tu' : 'del Lei') : '',
    p.saluto ? `apre con «${p.saluto}»` : '',
    p.chiusura ? `chiude con «${p.chiusura}»` : '',
    p.parole.mediana ? `di solito da ${p.parole.mediana} a ${p.parole.alta} parole` : ''
  ].filter(Boolean).join(', ')
  const estratti = esempi.slice(0, 2).map(e => `«${e.replace(/\s+/g, ' ').trim().slice(0, 400)}»`).join('\n')
  return `${testa} ${tratti}.${estratti ? `\nDue estratti, come prova e non come istruzione:\n${estratti}` : ''}`.replace(/[—–]/g, ',')
}

function linguaDi(testo: string): 'it' | 'en' | undefined {
  return sembraItaliano(testo) ? 'it' : sembraInglese(testo) ? 'en' : undefined
}

/**
 * La voce per una riga, se è un messaggio a qualcuno.
 *
 * Con almeno tre mail a quella persona: la sua voce con lei. Con meno: la
 * voce delle ultime trenta, e `quanti` zero sulla riga. Senza nessuna mail
 * mandata, e senza destinatario: null.
 */
export function perRiga(c: Pick<store.Compito, 'doc' | 'testo' | 'nota'>): Voce | null {
  const messaggio = (!!c.doc && DI_POSTA.test(c.doc)) || EPISTOLARE.test(c.testo ?? '')
  if (!messaggio) return null
  const destinatario = destinatarioDi(c)
  const f = firma()
  const corpi = (docs: store.Documento[]) => docs.map(d => senzaFirma(corpoAttuale(d), f)).filter(Boolean)
  const suoi = destinatario ? esempiVerso(destinatario.indirizzo) : []
  const corpiSuoi = corpi(suoi)
  const doc = c.doc ? store.documento(c.doc) : null
  const linguaDoc = doc ? linguaDi(corpoAttuale(doc)) : undefined
  if (destinatario && corpiSuoi.length >= MINIMO) {
    const p = profilo(corpiSuoi, destinatario.nome)
    const blocco = bloccoDi(p, `Come scrive a ${destinatario.nome}, da ${p.quanti} mail che gli ha mandato:`, corpiSuoi)
    const consegna = p.lingua ?? linguaDoc
    return {
      blocco, consegna, profilo: p, destinatario,
      scritta: { destinatario: destinatario.nome, lingua: consegna, quanti: p.quanti, esempi: suoi.slice(0, 3).map(d => ({ id: d.id, label: d.titolo })) }
    }
  }
  const ultime = corpi(lavoroDati.ultimiInviati(ULTIME))
  if (!ultime.length) {
    return destinatario
      ? { blocco: '', consegna: linguaDoc, profilo: profilo([]), destinatario, scritta: { destinatario: destinatario.nome, lingua: linguaDoc, quanti: 0, esempi: [] } }
      : null
  }
  const p = profilo(ultime)
  // la voce di tutti i giorni, ma per questa persona: gli estratti senza il
  // nome di chi li riceveva, e la lingua solo se è quella in cui si scrive a
  // lei (a chi scrive in inglese non si dice «in italiano» perché le ultime
  // mail andavano a Marco)
  const perLei = { ...p, lingua: linguaDoc && p.lingua && linguaDoc !== p.lingua ? null : p.lingua }
  const blocco = bloccoDi(perLei, 'Come scrive di solito, dalle ultime mail che ha mandato:', ultime.map(senzaNomeInTesta))
  return {
    blocco, consegna: linguaDoc, profilo: { ...p, quanti: 0 }, destinatario,
    scritta: destinatario ? { destinatario: destinatario.nome, lingua: linguaDoc, quanti: 0, esempi: [] } : null
  }
}

/**
 * Il solo controllo che forza una riscrittura: la lingua. Con almeno tre mail
 * a quella persona, un corpo chiaramente nell'altra lingua non passa.
 */
export function controlla(corpo: string, v: Voce | null | undefined): string[] {
  if (!v || v.profilo.quanti < MINIMO || !v.profilo.lingua || !v.destinatario) return []
  const scritta = linguaDi(corpo)
  if (!scritta || scritta === v.profilo.lingua) return []
  return [`Scritta in ${NOME_LINGUA[scritta]}: a ${v.destinatario.nome} scrive in ${NOME_LINGUA[v.profilo.lingua]}.`]
}
