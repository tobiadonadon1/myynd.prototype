// Le frasi del resoconto (P9): pure, in tutte e due le lingue, senza lineette.
//
// Ogni frase che porta un numero o un nome si scrive intera qui, italiano e
// inglese accanto, così l'inglese mette le parole nel suo ordine. Le parole
// sole passano da `t()` e stanno nel blocco P9 di lingua.ts. I nomi dei mesi
// e dei giorni sono scritti a mano: «Sept» di en-GB non è la parola del foglio.

import { lingua, t } from './lingua.ts'
import type { GenereResoconto, QualeResoconto, VoceResoconto } from './api.ts'
import { frasePunteggio } from './gemello-frasi.ts'

const en = () => lingua() === 'en'
const scegli = (f: { it: string; en: string }) => (en() ? f.en : f.it)

const MESI = {
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
}
const MESI_CORTI = {
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
}
const GIORNI = {
  it: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
}
const l = () => (en() ? 'en' : 'it') as 'it' | 'en'
const mese = (d: Date) => MESI[l()][d.getMonth()]!

/** «5 mail mandate, 6 lavori consegnati, 2 scadenze segnalate.»: solo i numeri che non sono zero. */
export function rigaNumeri(n: { mail: number; lavori: number; scadenze: number }): string {
  const parti: string[] = []
  if (n.mail > 0) parti.push(n.mail === 1 ? scegli({ it: '1 mail mandata', en: '1 email sent' }) : scegli({ it: `${n.mail} mail mandate`, en: `${n.mail} emails sent` }))
  if (n.lavori > 0) parti.push(n.lavori === 1 ? scegli({ it: '1 lavoro consegnato', en: '1 piece of work delivered' }) : scegli({ it: `${n.lavori} lavori consegnati`, en: `${n.lavori} pieces of work delivered` }))
  if (n.scadenze > 0) parti.push(n.scadenze === 1 ? scegli({ it: '1 scadenza segnalata', en: '1 deadline flagged' }) : scegli({ it: `${n.scadenze} scadenze segnalate`, en: `${n.scadenze} deadlines flagged` }))
  return parti.length ? `${parti.join(', ')}.` : ''
}

/** Il titolo del foglio. */
export function titoloFoglio(quale: QualeResoconto): string {
  return quale === 'scorsa' ? t('La settimana scorsa.') : quale === 'questa' ? t('Questa settimana.') : t('Da quando hai iniziato.')
}

/** «dal» davanti a un numero: «dall’8», «dall’11», «dall’1». */
const elide = (prep: 'da' | 'a', giorno: number) => ([1, 8, 11].includes(giorno) ? `${prep === 'da' ? 'dall' : 'all'}’${giorno}` : `${prep === 'da' ? 'dal' : 'al'} ${giorno}`)

/**
 * La riga delle date sotto il titolo. `a` è escluso (il lunedì dopo, o
 * adesso): l'ultimo giorno è quello prima.
 */
export function periodo(da: string, a: string, quale: QualeResoconto): string {
  const d = new Date(da)
  if (quale === 'questa') return scegli({ it: `da ${GIORNI.it[d.getDay()]} ${d.getDate()} ${MESI.it[d.getMonth()]}`, en: `since ${GIORNI.en[d.getDay()]} ${d.getDate()} ${MESI.en[d.getMonth()]}` })
  if (quale === 'inizio') return scegli({ it: `${elide('da', d.getDate())} ${MESI.it[d.getMonth()]}`, en: `since ${d.getDate()} ${MESI.en[d.getMonth()]}` })
  const f = new Date(Date.parse(a) - 60_000)
  const stessoMese = f.getMonth() === d.getMonth()
  if (stessoMese) return scegli({ it: `${elide('da', d.getDate())} ${elide('a', f.getDate())} ${MESI.it[f.getMonth()]}`, en: `${d.getDate()} to ${f.getDate()} ${MESI.en[f.getMonth()]}` })
  return scegli({
    it: `${elide('da', d.getDate())} ${MESI.it[d.getMonth()]} ${elide('a', f.getDate())} ${MESI.it[f.getMonth()]}`,
    en: `${d.getDate()} ${MESI.en[d.getMonth()]} to ${f.getDate()} ${MESI.en[f.getMonth()]}`
  })
}

/** Il tempo risparmiato: a cinque minuti; sotto i cinque, niente. «35 min», «1 h 05», «2 h». */
export function durata(minuti: number): string | null {
  if (!(minuti >= 5)) return null
  const r = Math.round(minuti / 5) * 5
  if (r < 60) return `${r} min`
  const h = Math.floor(r / 60), m = r % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

const STIMA: Record<string, { it: string; en: string; secondi?: boolean; valore: number }> = {
  mail: { it: 'mail', en: 'an email', valore: 4 },
  documento: { it: 'documento', en: 'a document', valore: 20 },
  codice: { it: 'lavoro sul codice', en: 'a piece of code work', valore: 15 },
  bozza: { it: 'bozza', en: 'a draft', valore: 5 },
  agenda: { it: 'evento', en: 'an event', valore: 1 },
  riordino: { it: 'messaggio', en: 'a message', secondi: true, valore: 6 }
}

/**
 * «Stima: 4 minuti a mail, 20 a documento, … 6 secondi a messaggio.»: solo i
 * generi presenti, l'unità scritta solo quando cambia; e le riscritte.
 */
export function stima(stime: { genere: GenereResoconto; minuti: number }[], riscritte: number): string {
  let unita: 'min' | 'sec' | null = null
  const pezzi = stime.filter(s => STIMA[s.genere]).map(s => {
    const k = STIMA[s.genere]!
    const u = k.secondi ? 'sec' : 'min'
    const n = k.secondi ? Math.round(s.minuti * 60) : s.minuti
    const conUnita = u !== unita
    unita = u
    const parola = !conUnita ? '' : u === 'min'
      ? scegli({ it: n === 1 ? ' minuto' : ' minuti', en: n === 1 ? ' minute' : ' minutes' })
      : scegli({ it: n === 1 ? ' secondo' : ' secondi', en: n === 1 ? ' second' : ' seconds' })
    return scegli({ it: `${n}${parola} a ${k.it}`, en: `${n}${parola} ${k.en}` })
  })
  const coda = riscritte > 0
    ? (riscritte === 1 ? scegli({ it: ', niente per quella che hai riscritto', en: ', nothing for the one you rewrote' })
      : scegli({ it: `, niente per le ${riscritte} che hai riscritto`, en: `, nothing for the ${riscritte} you rewrote` }))
    : ''
  if (!pezzi.length) return ''
  return scegli({ it: `Stima: ${pezzi.join(', ')}${coda}.`, en: `Estimate: ${pezzi.join(', ')}${coda}.` })
}

/** Il gemello, con chi non ti conosce accanto: la stessa frase della Memoria (P1B). */
export function punteggio(p: { giuste: number; totale: number; base: number }): string {
  return frasePunteggio(p.giuste, p.totale, p.base)
}

/** «2 pronte prima che le chiedessi»: il vantaggio di chi fa le cose prima. */
export function preparate(sezione: 'mail' | 'lavori', n: number): string {
  if (n <= 0) return ''
  if (sezione === 'mail') return n === 1 ? scegli({ it: '1 pronta prima che la chiedessi', en: '1 ready before you asked' }) : scegli({ it: `${n} pronte prima che le chiedessi`, en: `${n} ready before you asked` })
  return n === 1 ? scegli({ it: '1 pronto prima che lo chiedessi', en: '1 ready before you asked' }) : scegli({ it: `${n} pronti prima che li chiedessi`, en: `${n} ready before you asked` })
}

/** «12 su 15 ti sono servite. Ne ha mancate 2.» Niente percentuali. */
export function statoSegnalate(s: { utili: number; viste: number; mancate: number }): string {
  const prima = s.utili === 1 ? scegli({ it: `1 su ${s.viste} ti è servita.`, en: `1 of ${s.viste} was useful.` }) : scegli({ it: `${s.utili} su ${s.viste} ti sono servite.`, en: `${s.utili} of ${s.viste} were useful.` })
  const dopo = s.mancate <= 0 ? '' : s.mancate === 1 ? scegli({ it: ' Ne ha mancata una.', en: ' It missed 1.' }) : scegli({ it: ` Ne ha mancate ${s.mancate}.`, en: ` It missed ${s.mancate}.` })
  return prima + dopo
}

/** Una riga di posta riordinata: archiviati, nel cestino, o da una regola. */
export function riordino(v: Pick<VoceResoconto, 'chiave' | 'quanti' | 'cestino' | 'titolo'>): string {
  const n = v.quanti ?? 1
  if (v.chiave.startsWith('regola:')) {
    return n === 1 ? scegli({ it: `Archiviato 1 messaggio di ${v.titolo}`, en: `Archived 1 message from ${v.titolo}` }) : scegli({ it: `Archiviati ${n} messaggi di ${v.titolo}`, en: `Archived ${n} messages from ${v.titolo}` })
  }
  if (v.cestino) return n === 1 ? scegli({ it: '1 messaggio nel cestino', en: '1 message in the trash' }) : scegli({ it: `${n} messaggi nel cestino`, en: `${n} messages in the trash` })
  return n === 1 ? scegli({ it: 'Archiviato 1 messaggio', en: 'Archived 1 message' }) : scegli({ it: `Archiviati ${n} messaggi`, en: `Archived ${n} messages` })
}

/** «2 eventi in agenda». */
export function agenda(n: number): string {
  return n === 1 ? scegli({ it: '1 evento in agenda', en: '1 event in your calendar' }) : scegli({ it: `${n} eventi in agenda`, en: `${n} events in your calendar` })
}

/** Il giorno accanto a una riga: il nome in una settimana, la data da quando hai iniziato. */
export function quandoRiga(iso: string, quale: QualeResoconto): string {
  const d = new Date(iso)
  if (quale !== 'inizio') return GIORNI[l()][d.getDay()]!
  return scegli({ it: `${d.getDate()} ${MESI_CORTI.it[d.getMonth()]}`, en: `${MESI_CORTI.en[d.getMonth()]} ${d.getDate()}` })
}

/** «25 settembre» da «2026-09-25». */
export function dataScadenza(ymd: string): string {
  const [, m, g] = ymd.split('-').map(Number)
  if (!m || !g) return ymd
  return `${g} ${MESI[l()][m - 1]}`
}

/** «Da quando hai iniziato · 2 settembre»: l'etichetta della riga in Memoria. */
export function etichettaInizio(iso: string): string {
  const d = new Date(iso)
  return `${t('Da quando hai iniziato')} · ${d.getDate()} ${mese(d)}`
}

/** Per una finestra che ha solo cose segnalate: «3 cose segnalate.» */
export function rigaSegnalate(n: number): string {
  if (n <= 0) return ''
  return n === 1 ? scegli({ it: '1 cosa segnalata.', en: '1 thing flagged.' }) : scegli({ it: `${n} cose segnalate.`, en: `${n} things flagged.` })
}
