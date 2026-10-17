// I segnali di lavoro di Slack: cosa gli hanno chiesto, cosa ha promesso,
// cosa si è deciso.
//
// Sono i tre fatti che servono alla mattina di chi vende il proprio lavoro:
// la risposta da preparare (una domanda di un cliente rimasta lì), l'impegno
// da mantenere («ti mando il preventivo entro venerdì»), e la decisione da
// non rimettere in discussione («andiamo con la B»). Stanno nel registro dei
// segnali (`segnali.ts`), una riga ciascuno, con un id che non cambia: un
// giro che rilegge le stesse 48 ore non scrive niente due volte.
//
// Il registro non si riscrive, quindi una domanda a cui ha risposto non si
// cancella: le si affianca un `slack.risolto` con lo stesso riferimento, e
// `daRispondere` tiene solo quelle senza. Così resta anche quanto ci ha messo.
//
// Niente modello: espressioni regolari in italiano e in inglese, e una
// fiducia scritta accanto (`valore`) perché chi le usa sappia quanto pesarle.

import db from './store.ts'
import * as segnali from './segnali.ts'
import { contieneRichiesta } from './rilevanza.ts'
import { cercatoreDiProgetti } from './attenzione.ts'
import type { Ambito, EsitoSlack, Riga } from './connettori/slack.ts'

export const CHIESTO = 'slack.chiesto_a_me'
export const PROMESSO = 'slack.promesso'
export const DECISO = 'slack.deciso'
export const RISOLTO = 'slack.risolto'

const ORA = 3_600_000
const GIORNO = 24 * ORA
/** Un messaggio nel canale fuori da un filo si dice risposto se lui scrive nel canale entro questo tempo. */
const RISPOSTA_NEL_CANALE = 6 * ORA
/** Le reazioni che valgono una risposta: «fatto», «ok». Gli occhi no: vogliono dire «ci guardo». */
const REAZIONI_RISPOSTA = new Set(['white_check_mark', 'heavy_check_mark', '+1', 'thumbsup', 'ok_hand', 'ok'])

const FINE = '(?=$|[^\\p{L}\\p{N}])'
const ALTRE_RICHIESTE = new RegExp(`(?:^|[^\\p{L}])(?:riesci a|riusciresti|mi (?:mandi|invii|giri|passi|fai sapere|dici|aggiorni)|ci (?:mandi|invii|giri|aggiorni)|mandami|inviami|girami|fammi sapere|fateci sapere|let me know|any update|any news|novità su|hai (?:modo|tempo)|quando (?:puoi|riesci|pensi)|when (?:can|could|will) you|send me|share the)${FINE}`, 'iu')

/** Gli chiedono qualcosa: una domanda, o una richiesta anche senza punto di domanda. */
export function chiede(testo: string): boolean {
  const t = testo.replace(/\(https?:[^)]+\)|https?:\S+/g, ' ').trim()
  if (t.length < 6) return false
  return /\?/.test(t) || contieneRichiesta(t) || ALTRE_RICHIESTE.test(t)
}

const IMPEGNO = new RegExp(`(?:^|[^\\p{L}])(?:i['’]ll|i will|i['’]m going to|i am going to|will do|on it|let me (?:check|look|get back|send|share)|i can (?:send|share|do)|i['’]ll get back|ti (?:mando|invio|giro|faccio sapere|preparo|scrivo|chiamo|aggiorno|passo|mander[oò]|invier[oò])|vi (?:mando|invio|giro|faccio sapere|preparo|scrivo|aggiorno|passo|mander[oò])|te lo (?:mando|preparo|giro|faccio)|ve lo (?:mando|preparo|giro|faccio)|lo (?:faccio|preparo|mando) (?:io|entro|domani|oggi|stasera)|ci penso io|me ne occupo|mi occupo|provvedo|preparo io|mando io)${FINE}`, 'iu')
const SCADENZA = new RegExp(`(?:^|[^\\p{L}])(entro (?:(?:il |la |lo )?(?:luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|domani|stasera|oggi|fine (?:giornata|settimana|mese)|\\d{1,2}(?:/\\d{1,2})?|la prossima settimana))|domani|stasera|in giornata|la prossima settimana|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|eod|end of (?:the )?(?:day|week|month)|next week|\\d{1,2}(?:st|nd|rd|th)?)|tomorrow|tonight|later today|first thing|eod|next week)${FINE}`, 'iu')
const IN_PRIMA_PERSONA = /(?:^|[^\p{L}])(?:i|io|me|mi)(?=$|[^\p{L}])/iu

/**
 * Ha promesso qualcosa: «I'll send…», «ti mando…», «entro venerdì».
 *
 * Un verbo d'impegno con una scadenza è quasi certo; il verbo da solo è
 * probabile; la sola scadenza, detta in prima persona, è un indizio. Una
 * domanda («ti mando io il file?») non è una promessa.
 */
export function promessa(testo: string): { fiducia: number; scadenza: string | null } | null {
  const t = testo.trim()
  if (!t || /\?\s*$/.test(t)) return null
  const impegno = IMPEGNO.test(t)
  const s = SCADENZA.exec(t)
  const scadenza = s ? s[1]!.trim() : null
  if (impegno && scadenza) return { fiducia: 0.9, scadenza }
  if (impegno) return { fiducia: 0.7, scadenza: null }
  if (scadenza && IN_PRIMA_PERSONA.test(t)) return { fiducia: 0.4, scadenza }
  return null
}

const DECISO_FORTE = new RegExp(`(?:^|[^\\p{L}])(?:we decided|we['’]ve decided|we have decided|decided to|final decision|decision(?: is|:)|let['’]s go with|we['’]re going with|green light|abbiamo deciso|ho deciso|si è deciso|è deciso|decidiamo|deciso:|decisione:|andiamo con|procediamo con|via libera)${FINE}`, 'iu')
const DECISO_DEBOLE = new RegExp(`(?:^|[^\\p{L}])(?:agreed|approved|confirmed|ship it|go ahead|si procede|si parte|approvato|approvata|confermato|confermata|d['’]accordo)${FINE}`, 'iu')

/** Una decisione detta: «abbiamo deciso», «let's go with B»; «approvato» pesa meno. */
export function decisione(testo: string): { fiducia: number } | null {
  const t = testo.trim()
  if (!t || /\?\s*$/.test(t)) return null
  if (DECISO_FORTE.test(t)) return { fiducia: 0.8 }
  if (DECISO_DEBOLE.test(t)) return { fiducia: 0.5 }
  return null
}

/** La chiave del posto in cui si risponde a un messaggio: il filo, il messaggio diretto, o il filo che nascerebbe sotto. */
export function ambitoDi(a: Pick<Ambito, 'conversazione' | 'filo' | 'tipo'>, ts: string): string {
  if (a.filo) return `${a.conversazione}:${a.filo}`
  return a.tipo === 'canale' ? `${a.conversazione}:${ts}` : a.conversazione
}

const pulito = (nome: string) => segnali.nomePulito(nome, '') || 'Qualcuno'
const breve = (s: string, n = 300) => s.replace(/\s+/g, ' ').trim().slice(0, n)
const ref = (a: Pick<Ambito, 'conversazione'>, ts: string) => `slack:${a.conversazione}:${ts}`

type Chiesta = segnali.Segnale & { dati: { testo: string; link: string; dove: string; ambito: string; conversazione: string; filo: string | null; tipo: string; ts: string } }
type Risolta = { chiesta: string; ts: string | null; come: 'risposta' | 'reazione' | 'cancellato' | 'inviato'; latenza: number | null }

/**
 * I segnali di un giro, senza toccare il registro: le domande, le promesse,
 * le decisioni, e le risposte che chiudono le domande di questo giro.
 */
export function segnaliDi(ambiti: Ambito[], me: string, progettoDi: (t: string) => string | null = () => null): { nuovi: segnali.Segnale[]; risolte: Risolta[] } {
  const nuovi: segnali.Segnale[] = []
  const risolte: Risolta[] = []
  for (const a of ambiti) {
    if (!a.righe.length) continue
    const partecipa = a.tipo === 'im' || a.righe.some(r => r.mio)
    for (let i = 0; i < a.righe.length; i++) {
      const r = a.righe[i]!
      const dopo = a.righe.slice(i + 1)
      if (!r.mio && !r.bot && chiede(r.testo) && (a.tipo === 'im' || r.menzionaMe || (partecipa && (a.filo || a.tipo === 'mpim')))) {
        const chiave = ambitoDi(a, r.ts)
        nuovi.push({
          id: `${CHIESTO}|${ref(a, r.ts)}`, genere: CHIESTO, quando: r.quando, chi: pulito(r.nome), ref: ref(a, r.ts),
          progetto: progettoDi(r.testo), valore: r.menzionaMe || a.tipo === 'im' ? 0.9 : 0.6,
          dati: { testo: breve(r.testo), link: r.link, dove: a.dove, ambito: chiave, conversazione: a.conversazione, filo: a.filo, tipo: a.tipo, ts: r.ts }
        })
        // ha già risposto: con un messaggio dopo, nello stesso posto, o con un ✅
        const sua = dopo.find(x => x.mio && (a.filo || a.tipo !== 'canale' || Date.parse(x.quando) - Date.parse(r.quando) <= RISPOSTA_NEL_CANALE))
        const reazione = r.reazioni.some(x => REAZIONI_RISPOSTA.has(x.nome) && x.utenti.includes(me))
        if (sua || reazione) risolte.push({
          chiesta: ref(a, r.ts), ts: sua?.ts ?? null, come: sua ? 'risposta' : 'reazione',
          latenza: sua ? Math.round((Date.parse(sua.quando) - Date.parse(r.quando)) / 1000) : null
        })
      }
      if (r.mio) {
        const p = promessa(r.testo)
        if (p) {
          // a chi: a chi gliel'aveva chiesto, o a chi ha aperto il filo, o all'ultimo che ha parlato
          const altri = [...a.righe.slice(0, i)].reverse().filter(x => !x.mio && !x.bot)
          const prima = altri.find(x => x.menzionaMe || chiede(x.testo)) ?? (a.filo && !a.righe[0]!.mio ? a.righe[0] : undefined) ?? altri[0]
          nuovi.push({
            id: `${PROMESSO}|${ref(a, r.ts)}`, genere: PROMESSO, quando: r.quando,
            chi: pulito(a.tipo === 'im' ? a.dove : prima?.nome ?? a.dove), ref: ref(a, r.ts), progetto: progettoDi(r.testo), valore: p.fiducia,
            dati: { testo: breve(r.testo), link: r.link, dove: a.dove, ambito: ambitoDi(a, r.ts), conversazione: a.conversazione, filo: a.filo, tipo: a.tipo, ts: r.ts, scadenza: p.scadenza }
          })
        }
      }
      if (!r.bot && (partecipa || a.tipo !== 'canale')) {
        const d = decisione(r.testo)
        if (d) nuovi.push({
          id: `${DECISO}|${ref(a, r.ts)}`, genere: DECISO, quando: r.quando, chi: pulito(r.nome), ref: ref(a, r.ts),
          progetto: progettoDi(r.testo), valore: d.fiducia,
          dati: { testo: breve(r.testo), link: r.link, dove: a.dove, ambito: ambitoDi(a, r.ts), conversazione: a.conversazione, filo: a.filo, tipo: a.tipo, ts: r.ts }
        })
      }
    }
  }
  return { nuovi, risolte }
}

function risolto(r: Risolta, quando: string): segnali.Segnale {
  return { id: `${RISOLTO}|${r.chiesta}`, genere: RISOLTO, quando, ref: r.chiesta, valore: r.latenza, dati: { come: r.come, ts: r.ts } }
}

/** Le domande aperte nel registro: scritte, e senza un `slack.risolto` accanto. */
function aperteNelRegistro(adesso: Date, giorni: number): Chiesta[] {
  const da = new Date(adesso.getTime() - giorni * GIORNO).toISOString()
  const a = new Date(adesso.getTime() + GIORNO).toISOString()
  const chiuse = new Set(segnali.leggi(RISOLTO, new Date(adesso.getTime() - 120 * GIORNO).toISOString(), a).map(s => s.ref))
  return segnali.leggi<Chiesta>(CHIESTO, da, a).filter(s => !chiuse.has(s.ref ?? ''))
}

/**
 * Scrive i segnali di un giro nel registro, e chiude le domande vecchie.
 *
 * Una domanda scritta a un giro passato si chiude quando, in questo giro, lui
 * ha scritto dopo nello stesso posto; o quando il messaggio che la faceva non
 * c'è più dentro un tratto letto per intero (cancellato).
 */
export function registra(e: Pick<EsitoSlack, 'ambiti' | 'io'>, adesso = new Date()): { nuovi: number; chiuse: number } {
  const progettoDi = (() => { try { return cercatoreDiProgetti() } catch { return () => null } })()
  const { nuovi, risolte } = segnaliDi(e.ambiti, e.io.utenteId, progettoDi)
  const ora = adesso.toISOString()
  let n = 0, chiuse = 0
  db.exec('BEGIN')
  try {
    for (const s of nuovi) if (segnali.scrivi(s)) n++
    for (const r of risolte) if (segnali.scrivi(risolto(r, ora))) chiuse++
    const aperte = aperteNelRegistro(adesso, 60)
    for (const a of e.ambiti) {
      const sue = a.righe.filter(r => r.mio)
      const presenti = new Set(a.presenti)
      for (const q of aperte) {
        if (q.dati.conversazione !== a.conversazione) continue
        const stessoPosto = a.filo ? q.dati.ambito === a.chiave : a.tipo !== 'canale' ? q.dati.ambito === a.conversazione : !q.dati.filo
        if (!stessoPosto) continue
        const qts = Number(q.dati.ts)
        // cancellata: dentro il tratto letto per intero, e non c'è più
        if (qts >= Number(a.dal) && !presenti.has(q.dati.ts)) {
          if (segnali.scrivi(risolto({ chiesta: q.ref!, ts: null, come: 'cancellato', latenza: null }, ora))) chiuse++
          continue
        }
        const sua = sue.find(r => Number(r.ts) > qts && (a.filo || a.tipo !== 'canale' || (Number(r.ts) - qts) * 1000 <= RISPOSTA_NEL_CANALE))
        if (sua && segnali.scrivi(risolto({ chiesta: q.ref!, ts: sua.ts, come: 'risposta', latenza: Math.round(Number(sua.ts) - qts) }, ora))) chiuse++
      }
    }
    db.exec('COMMIT')
  } catch (err) { db.exec('ROLLBACK'); throw err }
  return { nuovi: n, chiuse }
}

/** Ha risposto da Myynd: le domande di quel posto si chiudono adesso, non al giro dopo. */
export function risoltoDaQui(conversazione: string, filo: string | null, ts: string, adesso = new Date()): number {
  let n = 0
  for (const q of aperteNelRegistro(adesso, 60)) {
    if (q.dati.conversazione !== conversazione || Number(q.dati.ts) >= Number(ts)) continue
    if (filo ? q.dati.ambito !== `${conversazione}:${filo}` : q.dati.filo) continue
    if (segnali.scrivi(risolto({ chiesta: q.ref!, ts, come: 'inviato', latenza: Math.round(Number(ts) - Number(q.dati.ts)) }, adesso.toISOString()))) n++
  }
  return n
}

export type DaRispondere = {
  id: string
  /** Chi ha chiesto. */
  chi: string
  domanda: string
  permalink: string
  dove: string
  conversazione: string
  filo: string | null
  ambito: string
  quando: string
  /** Da quante ore aspetta. */
  ore: number
  progetto: string | null
  /** Le altre domande aperte nello stesso posto, prima di questa. */
  altre: number
  fiducia: number
}

/**
 * Le domande che aspettano lui, con la prova: chi, cosa, il link, da quanto.
 *
 * Una per posto: tre messaggi di fila dello stesso cliente sono una cosa sola
 * da rispondere, e la più recente è quella che la dice meglio. Le più vecchie
 * di quattordici giorni non aspettano più nessuno.
 */
export function daRispondere(o: { adesso?: Date; giorni?: number } = {}): DaRispondere[] {
  const adesso = o.adesso ?? new Date()
  const perPosto = new Map<string, Chiesta[]>()
  for (const q of aperteNelRegistro(adesso, o.giorni ?? 14)) {
    const l = perPosto.get(q.dati.ambito) ?? []
    l.push(q)
    perPosto.set(q.dati.ambito, l)
  }
  return [...perPosto.values()].map(l => {
    l.sort((a, b) => a.quando.localeCompare(b.quando))
    const q = l.at(-1)!
    return {
      id: q.ref!, chi: q.chi ?? 'Qualcuno', domanda: q.dati.testo, permalink: q.dati.link, dove: q.dati.dove,
      conversazione: q.dati.conversazione, filo: q.dati.filo ?? (q.dati.tipo === 'canale' ? q.dati.ts : null), ambito: q.dati.ambito,
      quando: q.quando, ore: Math.max(0, Math.round((adesso.getTime() - Date.parse(l[0]!.quando)) / ORA)),
      progetto: q.progetto ?? null, altre: l.length - 1, fiducia: q.valore ?? 0.6
    }
  }).sort((a, b) => b.ore - a.ore)
}

type Voce = { id: string; chi: string; testo: string; permalink: string; dove: string; quando: string; fiducia: number; progetto: string | null; scadenza?: string | null }

function voci(genere: string, adesso: Date, giorni: number): Voce[] {
  return segnali.leggi<segnali.Segnale & { dati: { testo: string; link: string; dove: string; scadenza?: string | null } }>(
    genere, new Date(adesso.getTime() - giorni * GIORNO).toISOString(), new Date(adesso.getTime() + GIORNO).toISOString())
    .map(s => ({ id: s.ref!, chi: s.chi ?? '', testo: s.dati.testo, permalink: s.dati.link, dove: s.dati.dove, quando: s.quando, fiducia: s.valore ?? 0, progetto: s.progetto ?? null, ...(genere === PROMESSO ? { scadenza: s.dati.scadenza ?? null } : {}) }))
    .reverse()
}

/** Quello che ha promesso su Slack, i più recenti prima. */
export function promesse(o: { adesso?: Date; giorni?: number } = {}): Voce[] { return voci(PROMESSO, o.adesso ?? new Date(), o.giorni ?? 14) }
/** Quello che si è deciso dove c'era anche lui, i più recenti prima. */
export function decisioni(o: { adesso?: Date; giorni?: number } = {}): Voce[] { return voci(DECISO, o.adesso ?? new Date(), o.giorni ?? 14) }

/** Una conversazione esclusa: via anche i suoi segnali. */
export function dimenticaConversazione(id: string): number {
  if (!/^[A-Z0-9]+$/.test(id)) return 0
  return Number(db.prepare("DELETE FROM segnali WHERE genere LIKE 'slack.%' AND ref LIKE ?").run(`slack:${id}:%`).changes)
}

export type { Riga }
