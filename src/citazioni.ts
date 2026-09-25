// Le citazioni in pagina: i pezzi puri del segno e della sua nuvoletta.
//
// Stanno qui e non in Testo.tsx perché `.tsx` non entra nelle prove di node:
// il numero che si legge nell'etichetta, la riga «Posta · Marco Rossi · 3 set»,
// il nome piano di una fonte, le virgolette della lingua, e dove sta un passo
// dentro i blocchi di un documento.

import { lingua, t } from './lingua.ts'

export type Fonte = {
  id: string
  label: string
  fonte?: string
  tipo?: string
  autore?: string | null
  quando?: string | null
  inviato?: boolean
  passo?: string
  /** Un passo per ogni segno [n] di questa fonte, nell'ordine del testo; c'è solo quando i segni sono più di uno. */
  passi?: (string | null)[]
}

/**
 * Il passo del k-esimo segno di una fonte (da zero). Con `passi` è quello
 * della sua frase; senza, `passo` vale solo per il primo segno: la data del
 * primo non prova il prezzo del secondo, e un segno senza passo resta senza.
 */
export function passoDi(f: Fonte | undefined, k: number): string | undefined {
  if (!f) return undefined
  if (f.passi) return f.passi[k] ?? undefined
  return k === 0 ? f.passo : undefined
}

/** La fonte il cui numero combacia con quello scritto nel testo, non la posizione nell'elenco. */
export function perNumero(fonti: Fonte[], n: number): Fonte | undefined {
  return fonti.find(f => Number(f.label.match(/^\[(\d+)\]/)?.[1]) === n)
}

/** La fonte della memoria, quella con «[M]» in testa. */
export function fonteMemoria(fonti: Fonte[]): Fonte | undefined {
  return fonti.find(f => /^\[M\]/.test(f.label))
}

/** Il titolo di una fonte: l'etichetta senza il segno davanti. */
export function titoloDi(f: Fonte): string {
  return f.label.replace(/^\[(?:\d+|M)\]\s*/, '')
}

const MARCHI: Record<string, string> = {
  notion: 'Notion', granola: 'Granola', slack: 'Slack', drive: 'Google Drive', google: 'Google Drive',
  dropbox: 'Dropbox', github: 'GitHub', whatsapp: 'WhatsApp Business', x: 'X'
}

/**
 * Il nome piano di una fonte, per chi legge: «Posta», «Agenda», «Il mio Mac»,
 * i marchi come sono. Passa da `t()`: in inglese «Mail», «Calendar», «My Mac».
 */
export function nomeFonteDoc(fonte?: string, tipo?: string): string {
  const f = (fonte ?? '').toLowerCase()
  const k = (tipo ?? '').toLowerCase()
  if (f === 'email' || f === 'posta' || k === 'email') return t('Posta')
  if (f === 'evento' || f === 'calendario' || k === 'evento') return t('Agenda')
  if (f === 'desktop') return t('Il mio Mac')
  if (f === 'note') return t('Note')
  if (f === 'lavoro') return t('Cartella di lavoro')
  if (f === 'conversazioni') return t('Conversazioni')
  if (f === 'memoria') return t('Dalla tua memoria')
  if (MARCHI[f]) return MARCHI[f]
  return fonte ? fonte.charAt(0).toUpperCase() + fonte.slice(1) : ''
}

/** Il nome di chi scrive, senza l'indirizzo e senza virgolette: «"Marco Rossi" <m@x>» → «Marco Rossi». */
export function nomeAutore(autore?: string | null): string {
  if (!autore) return ''
  const senzaIndirizzo = autore.replace(/<[^>]*>/g, '').replace(/["']/g, '').trim()
  // solo un indirizzo, senza nome: la parte prima della chiocciola
  if (!senzaIndirizzo || (/@/.test(senzaIndirizzo) && !/\s/.test(senzaIndirizzo))) return autore.replace(/[<>]/g, '').trim().split('@')[0].trim()
  return senzaIndirizzo
}

const MESI = {
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
}

/**
 * «3 set» o «Sep 3», e l'anno solo se non è questo: «3 set 2025», «Sep 3, 2025».
 *
 * La stessa lista di mesi della riga delle preferenze (risposte-archivio.ts),
 * non il locale del browser: «21 Sept» nella nuvoletta e «Sep 24» nella riga
 * accanto sarebbero due app.
 */
export function giornoCorto(iso: string, oggi = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const en = lingua() === 'en'
  const mese = MESI[en ? 'en' : 'it'][d.getMonth()]
  const anno = d.getFullYear() === oggi.getFullYear() ? '' : en ? `, ${d.getFullYear()}` : ` ${d.getFullYear()}`
  return en ? `${mese} ${d.getDate()}${anno}` : `${d.getDate()} ${mese}${anno}`
}

/**
 * La riga sotto il titolo nella nuvoletta: «Posta · Marco Rossi · 3 set».
 * «Tu» quando l'ha mandata lei; le parti che mancano si lasciano fuori.
 */
export function rigaFonte(f: Fonte, oggi = new Date()): string {
  const pezzi: string[] = []
  const nome = nomeFonteDoc(f.fonte, f.tipo)
  if (nome) pezzi.push(nome)
  if (f.inviato) pezzi.push(t('Tu'))
  else { const a = nomeAutore(f.autore); if (a) pezzi.push(a) }
  if (f.quando) { const g = giornoCorto(f.quando, oggi); if (g) pezzi.push(g) }
  return pezzi.join(' · ')
}

/** Il passo fra virgolette: «…» in italiano, “…” in inglese. */
export function virgolette(passo: string, en: boolean): string {
  return en ? `“${passo}”` : `«${passo}»`
}

const piano = (s: string) => s.normalize('NFKC').replace(/[’‘`´]/g, '\'').replace(/[“”«»]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * In quale blocco leggibile sta il passo, o -1. Il passo arriva com'è nella
 * nuvoletta, con «…» dove è stato tagliato: si toglie e si cerca il resto,
 * a spazi e apostrofi normalizzati.
 */
export function trovaPasso(blocchi: { testo: string }[], passo: string): number {
  const p = piano(passo.replace(/^…|…$/g, ''))
  if (p.length < 8) return -1
  return blocchi.findIndex(b => piano(b.testo).includes(p))
}

/** Il pezzo del testo del blocco che combacia col passo, per evidenziarlo: [inizio, fine) o null. */
export function doveNelBlocco(testo: string, passo: string): [number, number] | null {
  const p = piano(passo.replace(/^…|…$/g, ''))
  if (p.length < 8) return null
  // mappa dal testo piano alle posizioni vere
  const mappa: number[] = []
  let piatto = ''
  const norm = testo.normalize('NFKC')
  for (let i = 0; i < norm.length; i++) {
    let ch = norm[i].replace(/[’‘`´]/g, '\'').replace(/[“”«»]/g, '"').toLowerCase()
    if (/\s/.test(ch)) { if (!piatto || piatto.endsWith(' ')) continue; ch = ' ' }
    piatto += ch; mappa.push(i)
  }
  const i = piatto.indexOf(p)
  if (i < 0) return null
  const fine = mappa[i + p.length - 1]
  return [mappa[i], (fine ?? testo.length - 1) + 1]
}
