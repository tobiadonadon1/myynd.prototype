// Le sue parole: quello che ha scritto lui, con le sue dita. Senza modello.
//
// «Write like me» voleva dire questo, e fino al 21 ottobre il campione della
// sua voce erano i post pubblicati dal suo account da x-engine: testo scritto
// da un modello, minuscolo, con la cadenza di un modello. Imitarlo dava un
// modello che imita un modello. Qui si prendono solo le righe sue:
//
//   · quello che scrive a Myynd in chat (e i commenti alle consegne);
//   · le righe «You:» delle sessioni con gli assistenti, dove lavora;
//   · i post del suo archivio di X che x-engine non ha scritto.
//
// Le mail mandate no: sono lettere al padrone di casa e alla banca, un altro
// registro, e per un messaggio la voce per destinatario c'è già (`voce.ts`,
// che adesso legge solo mail vere).
//
// Il blocco entra nei prompt di chi scrive per lui come prova di come parla,
// non come istruzione e non come fatti. Niente lineette nel blocco: il
// modello le imita.

import db from './store.ts'
import { campioneVoce } from './connettori/x-archivio.ts'

export type Dove = 'chat' | 'assistente' | 'mail' | 'x'
export type Parola = { testo: string; dove: Dove; quando: string }

/** Quanti campioni entrano in un prompt, e quanto lungo ciascuno. */
export const CAMPIONI = 10
const LUNGO_MAX = 320
const CORTO_MIN = 25

// le righe «You:» che non ha scritto lui: il riassunto di una sessione ripresa, i comandi, le interruzioni
const NON_SUE = /^(?:This session is being continued|Caveat:|\[Request interrupted|<|\/[a-z-]+\b)|:\s*(?:tell me more|dimmi di più)\s*$/i
// codice, registri, percorsi: incollati, non scritti
const INCOLLATO = /```|[{}]|=>|\bconst\b|\bfunction\b|^\s*[$#>]|(?:\/[\w.-]+){3,}|https?:\/\/\S{30,}/

/** Una riga che vale come sua voce: abbastanza lunga da dire come scrive, fatta di parole e non di codice. */
export function buona(t: string): boolean {
  if (t.length < CORTO_MIN || NON_SUE.test(t) || INCOLLATO.test(t)) return false
  if (t.split(/\s+/).length < 5) return false
  const lettere = (t.match(/\p{L}/gu) ?? []).length
  return lettere / t.length >= 0.6
}

/** Taglia a una frase intera sotto il tetto, se si può. */
function corta(t: string): string {
  const piano = t.replace(/\s+/g, ' ').trim()
  if (piano.length <= LUNGO_MAX) return piano
  const pezzo = piano.slice(0, LUNGO_MAX)
  const fine = Math.max(pezzo.lastIndexOf('. '), pezzo.lastIndexOf('? '), pezzo.lastIndexOf('! '))
  return fine > CORTO_MIN ? pezzo.slice(0, fine + 1) : pezzo.replace(/\s+\S*$/, '') + '…'
}

/** Il commento a una consegna comincia con «About «file»:»: quella testa è dell'app, il resto è suo. */
export function senzaTesta(t: string): string {
  return t.replace(/^\s*(?:About|Su|A proposito di)\s+«[^»]*»\s*:\s*/i, '')
}

function dallaChat(): Parola[] {
  try {
    const righe = db.prepare(`SELECT testo, quando FROM messaggi WHERE ruolo = 'u' ORDER BY quando DESC LIMIT 80`).all() as { testo: string; quando: string }[]
    return righe.map(r => ({ testo: senzaTesta(r.testo ?? '').trim(), dove: 'chat' as const, quando: r.quando }))
  } catch { return [] }
}

function dalleSessioni(): Parola[] {
  const out: Parola[] = []
  try {
    const docs = db.prepare(`SELECT corpo, quando FROM documenti WHERE fonte = 'conversazioni' ORDER BY quando DESC LIMIT 40`).all() as { corpo: string; quando: string | null }[]
    for (const d of docs) {
      for (const m of (d.corpo ?? '').matchAll(/^You:[ \t]*(.+)$/gm)) out.push({ testo: m[1]!.trim(), dove: 'assistente', quando: d.quando ?? '' })
    }
  } catch { /* senza sessioni, le altre fonti */ }
  return out
}

/** L'inizio di un testo, per riconoscerlo: minuscolo, solo lettere e cifre. */
const segno = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 60)

/** I post dell'archivio, senza quelli di x-engine (li toglie `campioneVoce`). */
function daX(): Parola[] {
  try { return campioneVoce().map(t => ({ testo: t, dove: 'x' as const, quando: '' })) } catch { return [] }
}

/**
 * I campioni, a giro fra le fonti (una chat, una sessione, una mail, un
 * post, e di nuovo), il più recente prima dentro ogni fonte, senza doppioni.
 */
export function paroleSue(n = CAMPIONI, fonti: Parola[][] = [dallaChat(), dalleSessioni(), daX()]): Parola[] {
  const visti = new Set<string>()
  const code = fonti.map(f => f.filter(p => buona(p.testo)).map(p => ({ ...p, testo: corta(p.testo) })))
  const out: Parola[] = []
  for (let giro = 0; out.length < n && code.some(c => c.length); giro++) {
    for (const c of code) {
      while (c.length) {
        const p = c.shift()!
        const s = segno(p.testo)
        if (visti.has(s)) continue
        visti.add(s)
        out.push(p)
        break
      }
      if (out.length >= n) break
    }
  }
  return out
}

const DOVE_EN: Record<Dove, string> = { chat: 'to Myynd', assistente: 'to an assistant, while working', mail: 'email', x: 'X post' }
const DOVE_IT: Record<Dove, string> = { chat: 'a Myynd', assistente: 'a un assistente, mentre lavora', mail: 'mail', x: 'post su X' }

/** Il blocco per il prompt, o la stringa vuota se non c'è ancora niente di suo. */
export function bloccoVoce(en: boolean, parole = paroleSue()): string {
  if (parole.length < 3) return ''
  const righe = parole.map(p => `(${(en ? DOVE_EN : DOVE_IT)[p.dove]}) ${p.testo}`).join('\n')
  return en
    ? `How he actually writes. These are his own words, typed by him, not by any tool. Write the way he does: his length of sentence, his plain words, how direct he is. Do not copy their facts, and do not make it neater than he would.\n${righe}`
    : `Come scrive davvero. Queste sono parole sue, scritte da lui e non da uno strumento. Scrivi come scrive lui: la lunghezza delle sue frasi, le sue parole semplici, quanto va dritto. Non copiarne i fatti, e non renderlo più levigato di come lo farebbe lui.\n${righe}`
}
