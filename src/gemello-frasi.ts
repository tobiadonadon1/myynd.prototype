// Le frasi del gemello: pure, in tutte e due le lingue, senza lineette.
//
// Ogni frase è una coppia { it, en } scritta intera, così l'inglese mette le
// parole nel suo ordine. I numeri stanno negli stessi secchi che il server
// usa per il ritratto (server/abitudini.ts `durata`): «entro 3 ore» qui e là.
// Le parole sole e i bottoni passano da `t()`.

import { lingua, loc, t } from './lingua.ts'
import type { AbitudineVista, Gemello, PrevisioneVista } from './api.ts'

const en = () => lingua() === 'en'
const scegli = (f: { it: string; en: string }) => (en() ? f.en : f.it)

/** Le durate, a secchi: cambiano solo quando cambia il secchio. */
export function durata(min: number): string {
  if (min <= 60) return scegli({ it: 'un’ora', en: 'an hour' })
  if (min <= 180) return scegli({ it: '3 ore', en: '3 hours' })
  if (min <= 480) return scegli({ it: 'qualche ora', en: 'a few hours' })
  if (min <= 1440) return scegli({ it: 'un giorno', en: 'a day' })
  const n = Math.round(min / 1440)
  return scegli({ it: `${n} giorni`, en: `${n} days` })
}

/**
 * Un'ora del giorno (o i minuti da mezzanotte) come la si dice, con `Intl`:
 * «9», «19» in italiano; "9 AM", "7 PM" in inglese.
 *
 * In inglese si passa da en-US e non da `loc()` (en-GB), perché en-GB scrive
 * «09», che nessuno dice: è l'unica differenza voluta dalla regola delle ore
 * con `Intl`.
 */
export function ora(h: number): string {
  const ore = h > 24 ? Math.round(h / 60) % 24 : Math.round(h) % 24
  try {
    return new Intl.DateTimeFormat(en() ? 'en-US' : loc(), { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1, ore)))
  } catch { return String(ore) }
}

/** «tra le 9 e le 12» / "between 9 AM and 12 PM". */
export function ore(da: number, a: number): string {
  return scegli({ it: `tra le ${ora(da)} e le ${ora(a)}`, en: `between ${ora(da)} and ${ora(a)}` })
}

const numeroIt = (n: number) => String(n).replace('.', ',')

/** La riga di «Come lavori», presente, oggetto per primo. Una corretta è nelle sue parole. */
export function rigaAbitudine(a: Pick<AbitudineVista, 'genere' | 'dati' | 'stato' | 'testoSuo'>): string {
  if (a.stato === 'corretta' && a.testoSuo) return a.testoSuo
  const d = a.dati
  const nome = String(d.nome ?? '')
  switch (a.genere) {
    case 'posta.risponde_sempre': return scegli({
      it: `A ${nome} rispondi sempre, di solito entro ${durata(Number(d.latenzaMin))}`,
      en: `You always answer ${nome}, usually within ${durata(Number(d.latenzaMin))}` })
    case 'posta.lascia': return scegli({ it: `Le mail di ${nome} di solito restano senza risposta`, en: `${nome}'s mail usually goes unanswered` })
    case 'posta.tempo': return scegli({ it: `Di solito rispondi entro ${durata(Number(d.latenzaMin))}`, en: `You usually reply within ${durata(Number(d.latenzaMin))}` })
    case 'posta.ore': return scegli({
      it: `Le risposte le scrivi soprattutto tra le ${ora(Number(d.da))} e le ${ora(Number(d.a))}`,
      en: `You write most replies between ${ora(Number(d.da))} and ${ora(Number(d.a))}` })
    case 'agenda.sposta': return scegli({ it: `Sposti una riunione su ${d.ogni}`, en: `You move one meeting in ${d.ogni}` })
    case 'agenda.rifiuta': return scegli({ it: `Gli inviti di ${nome} li rifiuti`, en: `You decline ${nome}'s invites` })
    case 'app.principale': {
      const oreG = Number(d.oreGiorno)
      return scegli({
        it: `${d.app} è dove passi più tempo, ${numeroIt(oreG)} ore al giorno`,
        en: `${d.app} is where you spend most time, ${oreG} ${oreG === 1 ? 'hour' : 'hours'} a day` })
    }
    case 'app.giornata': return scegli({
      it: `Cominci verso le ${ora(Number(d.da) / 60)} e smetti verso le ${ora(Number(d.a) / 60)}`,
      en: `You start around ${ora(Number(d.da) / 60)} and stop around ${ora(Number(d.a) / 60)}` })
    case 'codice.con_agenti': return scegli({
      it: `Su ${d.cartella} lavori con ${d.agente} quasi ogni giorno`,
      en: `You work on ${d.cartella} with ${d.agente} almost every day` })
    default: return a.testoSuo ?? ''
  }
}

/** L'evidenza sotto la riga: «14 su 15», «su 23 giorni», «23 risposte». */
export function provaAbitudine(a: Pick<AbitudineVista, 'genere' | 'casi' | 'su'>): string {
  if (a.su !== null) return scegli({ it: `${a.casi} su ${a.su}`, en: `${a.casi} of ${a.su}` })
  if (a.genere.startsWith('app.')) return scegli({ it: `su ${a.casi} giorni`, en: `over ${a.casi} days` })
  return scegli({ it: `${a.casi} risposte`, en: `${a.casi} replies` })
}

/** L'affermazione, al futuro, oggetto per primo. */
export function rigaPrevisione(p: Pick<PrevisioneVista, 'genere' | 'nome'>): string {
  switch (p.genere) {
    case 'posta.risponde': return scegli({ it: `Risponderai a ${p.nome}`, en: `You'll answer ${p.nome}` })
    case 'posta.non_risponde': return scegli({ it: `Non risponderai a ${p.nome}`, en: `You won't answer ${p.nome}` })
    case 'progetto.del_giorno': return scegli({ it: `Lavorerai soprattutto a ${p.nome}`, en: `You'll work mostly on ${p.nome}` })
    case 'compito.chiude': return scegli({ it: `Chiuderai: ${p.nome}`, en: `You'll close: ${p.nome}` })
    case 'compito.slitta': return scegli({ it: `Rimanderai: ${p.nome}`, en: `You'll put off: ${p.nome}` })
    default: return p.nome
  }
}

/** Il segno accanto all'affermazione, a parole: per chi non vede l'icona. */
export function esitoPrevisione(e: PrevisioneVista['esito']): string {
  return e === 'giusta' ? t('giusta') : e === 'sbagliata' ? t('sbagliata') : e === 'annullata' ? t('non conta') : t('ancora aperta')
}

/**
 * Il punteggio, sempre accanto a chi non ti conosce. Da venti affermazioni;
 * prima, quanto manca. Vuoto con zero. La condivide P9.
 */
export function frasePunteggio(giuste: number, totale: number, base: number): string {
  if (totale <= 0) return ''
  if (totale < 20) return scegli({ it: `Il punteggio dopo 20 previsioni. Finora ${totale}.`, en: `Score after 20 predictions. ${totale} so far.` })
  const su10 = (n: number) => Math.round((n / totale) * 10)
  return scegli({
    it: `Ci ha preso ${su10(giuste)} volte su 10. Senza conoscerti, ${su10(base)}.`,
    en: `Right ${su10(giuste)} times in 10. Without knowing you, ${su10(base)}.` })
}

/** La riga di oggi: sigillata, o i conti dalle venti. */
export function faseOggi(o: Gemello['oggi']): string {
  if (!o.quante) return ''
  if (o.sigillate) {
    return o.quante === 1
      ? scegli({ it: 'Oggi una previsione, la apro stasera.', en: '1 prediction today, opened tonight.' })
      : scegli({ it: `Oggi ${o.quante} previsioni, le apro stasera.`, en: `${o.quante} predictions today, opened tonight.` })
  }
  const giuste = o.previsioni.filter(p => p.esito === 'giusta').length
  const sbagliate = o.previsioni.filter(p => p.esito === 'sbagliata').length
  const aperte = o.previsioni.filter(p => p.esito === null).length
  return scegli({
    it: `Oggi: ${giuste} giust${giuste === 1 ? 'a' : 'e'}, ${sbagliate} sbagliat${sbagliate === 1 ? 'a' : 'e'}, ${aperte} ancora apert${aperte === 1 ? 'a' : 'e'}.`,
    en: `Today: ${giuste} right, ${sbagliate} wrong, ${aperte} still open.` })
}

/** «Ieri · 7 su 9», o «ancora aperte». */
export function rigaIeri(i: NonNullable<Gemello['ieri']>): string {
  if (!i.chiuso) return t('Ieri · ancora aperte')
  return scegli({ it: `Ieri · ${i.giuste} su ${i.totale}`, en: `Yesterday · ${i.giuste} of ${i.totale}` })
}

/** La riga in fondo al punto, che porta a «Come lavori». */
export function fraseIeri(giuste: number, totale: number): string {
  return scegli({ it: `Ieri ci ho preso ${giuste} volte su ${totale}.`, en: `Yesterday I got ${giuste} of ${totale} right.` })
}

/** La scala della fiducia, per genere, senza gradini. */
export function rigaFiducia(f: { genere: string; giuste: number; totale: number }): string {
  switch (f.genere) {
    case 'bozza.email': return scegli({ it: `Bozze di risposta: giuste ${f.giuste} su ${f.totale}`, en: `Reply drafts: right ${f.giuste} of ${f.totale}` })
    case 'bozza.documento': return scegli({ it: `Documenti: giusti ${f.giuste} su ${f.totale}`, en: `Documents: right ${f.giuste} of ${f.totale}` })
    case 'feed.carta': return scegli({ it: `Carte del feed: giuste ${f.giuste} su ${f.totale}`, en: `Feed cards: right ${f.giuste} of ${f.totale}` })
    case 'previsione.posta': return scegli({ it: `Previsioni sulla posta: giuste ${f.giuste} su ${f.totale}`, en: `Mail predictions: right ${f.giuste} of ${f.totale}` })
    case 'previsione.progetto': return scegli({ it: `Previsioni sul progetto: giuste ${f.giuste} su ${f.totale}`, en: `Project predictions: right ${f.giuste} of ${f.totale}` })
    case 'previsione.compito': return scegli({ it: `Previsioni sulle righe: giuste ${f.giuste} su ${f.totale}`, en: `Task predictions: right ${f.giuste} of ${f.totale}` })
    default: return ''
  }
}

/** «Tutte (12)» / "All (12)". */
export function tutte(n: number): string {
  return scegli({ it: `Tutte (${n})`, en: `All (${n})` })
}

/** «Non valgono più (3)» / "No longer true (3)". */
export function nonValgonoPiu(n: number): string {
  return `${t('Non valgono più')} (${n})`
}

/** «12 set» / "Sep 12": la stessa regola delle ore, così la pagina ha una convenzione sola (en-GB scriverebbe «12 Sept» accanto a «1 PM»). */
function giorno(d: Date): string {
  return d.toLocaleDateString(en() ? 'en-US' : loc(), { day: 'numeric', month: 'short' })
}

/** «fino al 12 set» / "until Sep 12". */
export function finoAl(iso: string): string {
  const d = new Date(iso)
  const data = Number.isNaN(d.getTime()) ? iso : giorno(d)
  return `${t('fino al')} ${data}`
}

/** «In pausa fino alle 15:10» / "Paused until 3:10 PM": la stessa regola delle ore di `ora()`, così la pagina ha un orologio solo. */
export function inPausaFino(iso: string): string {
  const d = new Date(iso)
  let o = iso
  if (!Number.isNaN(d.getTime())) {
    try { o = new Intl.DateTimeFormat(en() ? 'en-US' : loc(), { hour: 'numeric', minute: '2-digit' }).format(d) } catch { o = d.toLocaleTimeString() }
  }
  return scegli({ it: `In pausa fino alle ${o}`, en: `Paused until ${o}` })
}

/** «12 set · Pilot scope»: un esempio del perché. */
export function esempio(e: { quando: string; testo: string }): string {
  const d = new Date(e.quando)
  const data = Number.isNaN(d.getTime()) ? '' : giorno(d)
  return [data, e.testo].filter(Boolean).join(' · ')
}
