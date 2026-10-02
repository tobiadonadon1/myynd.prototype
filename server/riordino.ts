// Mettere ordine fra i progetti, chiedendolo.
//
// «It should be automatic. The client shouldn't have to clean it up by
// itself. The feed should tell it, "Hey, I noticed that I'm a bit confused
// because H-Farm appears twice, and this Evermute deck is not kind of right.
// Is it right for me to delete one of them?"… make sure that the user
// understands it's right» (2 ottobre 2026).
//
// I progetti nati dal punto prendevano il nome da quello che il punto vedeva:
// «Evermute deck» da un file, «H-Farm: I want to help to solidify…» da una
// riga di memoria accanto a «H-Farm» scritto da lui. Qui si trovano, senza
// modello e senza toccare niente: due nomi che sono lo stesso progetto, e un
// nome che è la cartella più una parola di troppo. Poi una domanda sola sulla
// prima pagina, con quello che farei detto per intero; si fa solo con un sì.
// Un no si ricorda: la stessa domanda non torna.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import * as store from './store.ts'
import * as progetti from './progetti.ts'
import { cartella, lingua } from './config.ts'

export const TEMA = 'riordino:'

export type Piano = {
  /** Due progetti che sono lo stesso: `da` entra in `in`, con le sue righe, carte e memoria. */
  unisci: { da: string; in: string; daNome: string; inNome: string }[]
  /** Un nome con una parola di troppo: diventa quello della sua cartella. */
  rinomina: { id: string; prima: string; dopo: string }[]
}

const piano = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Le parole che un nome nato da un file si porta dietro: «Evermute deck», «Lumen site». */
const DI_TROPPO = /^(?:deck|app|site|sito|website|project|progetto|pitch|outline|doc|docs)$/i

/**
 * Cosa non torna fra i progetti, senza modello: due nomi che sono lo stesso
 * progetto (uno è l'altro più una coda, «H-Farm» e «H-Farm: I want to…»), e
 * un nome nato dal punto che è il nome della sua cartella più una parola di
 * troppo («Evermute deck» con la cartella «Evermute»). Quello scritto da lui
 * resta: si unisce dentro il suo, e il suo nome non si cambia mai.
 */
export function trova(suoi: readonly progetti.Progetto[], cartelle: readonly string[]): Piano {
  const vivi = suoi.filter(p => p.stato !== 'chiuso')
  const unisci: Piano['unisci'] = []
  const presi = new Set<string>()
  for (const a of vivi) {
    for (const b of vivi) {
      if (a.id === b.id || presi.has(a.id) || presi.has(b.id)) continue
      const na = piano(a.nome), nb = piano(b.nome)
      if (na.length < 3) continue
      // uguali: entra quello non suo (o il più giovane). b è a più una coda
      // (un due punti, una frase): b entra in a. Uno scritto da lui non entra mai in un altro.
      let stesso = false
      if (b.origine === 'mano') stesso = false
      else if (na === nb) stesso = a.origine === 'mano' || a.dal <= b.dal
      else if (nb.startsWith(`${na} `)) stesso = b.nome.includes(':') || nb.length >= na.length + 12
      if (!stesso) continue
      unisci.push({ da: b.id, in: a.id, daNome: b.nome, inNome: a.nome })
      presi.add(b.id)
    }
  }
  const rinomina: Piano['rinomina'] = []
  const nomiCartelle = cartelle.map(c => basename(c))
  for (const p of vivi) {
    if (presi.has(p.id) || p.origine === 'mano') continue
    const parole = p.nome.trim().split(/\s+/)
    if (parole.length < 2 || !DI_TROPPO.test(parole[parole.length - 1]!)) continue
    const base = parole.slice(0, -1).join(' ')
    const cartella = nomiCartelle.find(c => piano(c) === piano(base))
    // il nome nuovo non deve essere già di un altro progetto
    if (cartella && !vivi.some(x => x.id !== p.id && piano(x.nome) === piano(cartella))) rinomina.push({ id: p.id, prima: p.nome, dopo: cartella })
  }
  return { unisci, rinomina }
}

const vuoto = (p: Piano) => !p.unisci.length && !p.rinomina.length

/** L'impronta di un piano: la stessa domanda, lo stesso tema, e un no che resta. */
export function impronta(p: Piano): string {
  const base = [...p.unisci.map(u => `u:${u.da}>${u.in}`), ...p.rinomina.map(r => `r:${r.id}>${r.dopo}`)].sort().join('|')
  let h = 5381
  for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** La domanda, con quello che farei detto per intero: lui deve capire cosa dice di sì. */
export function domanda(p: Piano, l: 'it' | 'en' = lingua()): string {
  const it = l === 'it'
  const cosa: string[] = []
  const fare: string[] = []
  for (const u of p.unisci) {
    const corto = u.inNome
    cosa.push(it ? `«${corto}» compare due volte` : `«${corto}» appears twice`)
    fare.push(it ? `unisco i due «${corto}» in uno` : `merge the two «${corto}» into one`)
  }
  for (const r of p.rinomina) {
    cosa.push(it ? `«${r.prima}» sembra proprio «${r.dopo}»` : `«${r.prima}» looks like it's really «${r.dopo}»`)
    fare.push(it ? `rinomino «${r.prima}» in «${r.dopo}»` : `rename «${r.prima}» to «${r.dopo}»`)
  }
  const elenco = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')}${it ? ' e ' : ' and '}${xs[xs.length - 1]}`
  return it
    ? `Sui tuoi progetti sono un po' confuso: ${elenco(cosa)}. Va bene se ${elenco(fare)}? Le righe, le carte e le note vengono con loro.`
    : `I'm a bit confused about your projects: ${elenco(cosa)}. OK if I ${elenco(fare)}? Their tasks, cards and notes move with them.`
}

type Archivio = { piani: Record<string, Piano>; no: string[] }
const FILE = () => join(cartella(), 'riordino.json')
function leggiArchivio(): Archivio {
  try { return { piani: {}, no: [], ...JSON.parse(readFileSync(FILE(), 'utf8')) as Partial<Archivio> } } catch { return { piani: {}, no: [] } }
}
function scriviArchivio(a: Archivio) {
  const dentro = cartella()
  if (!existsSync(dentro)) mkdirSync(dentro, { recursive: true, mode: 0o700 })
  writeFileSync(FILE(), JSON.stringify(a, null, 2), { mode: 0o600 })
}

/**
 * Se c'è disordine, la domanda sulla prima pagina. Mai una seconda volta lo stesso piano, né dopo un sì né dopo un no.
 */
export function forse(cartelle: readonly string[]): boolean {
  const p = trova(progetti.elenco(), cartelle)
  if (vuoto(p)) return false
  const chiave = impronta(p)
  const tema = `${TEMA}${chiave}`
  const a = leggiArchivio()
  // non aspetta che le altre domande siano chiuse: due nomi per la stessa cosa sporcano ogni quadro, e
  // la domanda più nuova è quella che la prima pagina mostra
  if (a.no.includes(chiave) || store.domandaPerTema(tema)) return false
  const d = store.apriDomanda({ tema, testo: domanda(p), spunto: [], progetto: null })
  if (!d) return false
  scriviArchivio({ ...a, piani: { ...a.piani, [chiave]: p } })
  console.log(`myynd · riordino · chiesto: ${p.unisci.length} da unire, ${p.rinomina.length} da rinominare`)
  return true
}

const SI = /^\s*(?:s[iì]|yes|yep|yeah|ok(?:ay)?|sure|certo|va bene|vai|fallo|fai pure|do it|go ahead|go|please do|d'accordo|perfetto|esatto|right|correct|giusto)\b/i
const NO = /^\s*(?:no|nope|non|lascia|leave|don'?t|meglio di no|aspetta|wait)\b/i

/**
 * La risposta: un sì fa quello che la domanda diceva, un no si ricorda, e
 * qualunque altra cosa non tocca niente (meglio una domanda inutile che un
 * progetto unito per sbaglio). Torna l'esito da mostrare al posto della domanda.
 */
export function rispondi(tema: string, risposta: string, l: 'it' | 'en' = lingua()): string {
  const it = l === 'it'
  const chiave = tema.slice(TEMA.length)
  const a = leggiArchivio()
  const p = a.piani[chiave]
  if (!p) return it ? 'Me lo sono segnato.' : 'Noted.'
  if (NO.test(risposta) || !SI.test(risposta)) {
    scriviArchivio({ ...a, no: [...a.no, chiave] })
    return it ? 'Va bene, li lascio come sono.' : 'OK, I\'ll leave them as they are.'
  }
  const fatti: string[] = []
  for (const u of p.unisci) {
    if (!progetti.trova(u.da) || !progetti.trova(u.in)) continue
    try { progetti.unisci(u.da, u.in); fatti.push(it ? `uniti i due «${u.inNome}»` : `merged the two «${u.inNome}»`) } catch (e) { console.warn('myynd · riordino · unione:', e instanceof Error ? e.message : e) }
  }
  for (const r of p.rinomina) {
    if (!progetti.trova(r.id)) continue
    try { if (progetti.cambia(r.id, { nome: r.dopo }, 'user-chat')) fatti.push(it ? `«${r.prima}» ora è «${r.dopo}»` : `«${r.prima}» is now «${r.dopo}»`) } catch (e) { console.warn('myynd · riordino · nome:', e instanceof Error ? e.message : e) }
  }
  scriviArchivio({ ...a, piani: Object.fromEntries(Object.entries(a.piani).filter(([k]) => k !== chiave)) })
  console.log(`myynd · riordino · fatto: ${fatti.join('; ')}`)
  return fatti.length ? `${it ? 'Fatto' : 'Done'}: ${fatti.join('; ')}.` : (it ? 'Erano già a posto.' : 'They were already in order.')
}
