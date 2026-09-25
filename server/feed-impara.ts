// Quello che le sue ragioni insegnano alla lettura dopo. Senza modello.
//
// «Non utile» chiede una di quattro ragioni, e ognuna cambia una cosa:
//
//   · vecchia: da quella fonte, una cosa di quell'età di solito non gli serve
//     più. I documenti più vecchi della mediana vanno in coda alla fila, e il
//     modello legge gli ultimi tre esempi.
//   · non si capisce: non è un segnale sulla cosa, è sul modo di scriverla.
//     La soglia di chiarezza sale (si riscrive di più), e gli esempi vanno al
//     modello che legge e a quello che riscrive.
//   · già fatta: la carta era giusta, arrivata tardi. Prima di proporre una
//     carta da quel mittente si guarda se lui ha già scritto a quell'indirizzo
//     dopo la mail: se sì, è già risposta.
//   · non è mia: due volte da una persona, e mai un fatto: la sua posta
//     entra solo se chiede qualcosa alla lettera, e il modello lo sa. Una
//     persona non si tace mai del tutto; i mittenti automatici li tace già
//     `mittentiScartati`.
//
// E le carte mancate (`mancate.ts`): a chi ha risposto da solo senza che il
// feed gliel'avesse mostrato, i documenti passano davanti, e il modello lo sa.
//
// Si legge lo stato di adesso, ogni lettura, senza cache: così «Annulla»
// (ragione a NULL) ritira quello che aveva insegnato senza altro codice.

import db, { documento } from './store.ts'
import { indirizzoAttenzione, mittenteAutomatico } from './rilevanza.ts'
import { SOGLIA_CHIARA } from './giudizi.ts'

const GIORNO = 86_400_000
/** Quanto indietro guardano «vecchia» e «non si capisce»: sono sul gusto di adesso. */
export const GIORNI_CORTI = 30
/** Quanto indietro guardano le persone: un mittente resta quello che è. */
export const GIORNI_LUNGHI = 90
/** Quanto sale la soglia di chiarezza per ogni «non si capisce», e il tetto. */
export const PASSO_CHIARA = 0.05
export const CHIARA_MAX = 0.75
/** Quanti indirizzi si nominano al modello, per riga. */
const NOMINATI = 10

export type Imparato = {
  /** Le ultime tre scartate come vecchie, con l'età della fonte quando la carta è nata. */
  vecchie: { titolo: string; fonte: string; giorni: number }[]
  /** Per fonte, la mediana dell'età di quello che ha scartato come vecchio (solo con almeno due). */
  etaVecchia: Map<string, number>
  /** Le ultime tre che non ha capito. */
  oscure: { titolo: string; perche: string }[]
  /** Sotto questa chiarezza si riscrive. */
  sogliaChiara: number
  /** Gli indirizzi da cui ha scartato una carta come «già fatta»: prima si guarda la posta inviata. */
  ricontrolla: Set<string>
  /** Le persone la cui posta di solito non è per lui. */
  nonSuoi: Set<string>
  /** Le persone a cui ha risposto da solo, o che gli servono davvero: i loro documenti passano davanti. */
  daNonPerdere: Set<string>
}

type Riga = { titolo: string; fonte: string | null; doc: string | null; contesto: string | null; stato: string; ragione: string | null; perche: string | null; quando: string; risposto: string | null }

/** Chi ha scritto il documento dietro una carta, dall'istantanea o dal documento. */
function mittenteDi(r: Pick<Riga, 'doc' | 'contesto'>): { indirizzo: string; automatico: boolean; quando: string | null } | null {
  let autore: string | null | undefined
  let quando: string | null | undefined
  if (r.contesto) {
    try {
      const c = JSON.parse(r.contesto) as { autore?: string | null; quando?: string | null }
      autore = c.autore; quando = c.quando
    } catch { /* un'istantanea storta non ferma niente */ }
  }
  if (autore === undefined && r.doc) {
    const d = documento(r.doc)
    autore = d?.autore; quando = d?.quando
  }
  const indirizzo = indirizzoAttenzione(autore ?? null)
  if (!indirizzo) return null
  return { indirizzo, automatico: mittenteAutomatico(autore), quando: quando ?? null }
}

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b)
  const m = o.length >> 1
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * Quello che ha imparato dalle sue risposte fino ad adesso. Una lettura sola
 * del feed e delle mancate, calcolata una volta per lettura.
 */
export function impara(adesso = Date.now()): Imparato {
  const daLungo = new Date(adesso - GIORNI_LUNGHI * GIORNO).toISOString()
  const daCorto = new Date(adesso - GIORNI_CORTI * GIORNO).toISOString()
  const righe = db.prepare(`
    SELECT titolo, fonte, doc, contesto, stato, ragione, perche, quando, risposto FROM feed
    WHERE stato IN ('fatto', 'scartato') AND COALESCE(risposto, quando) >= ?
    ORDER BY COALESCE(risposto, quando) DESC
  `).all(daLungo) as Riga[]
  const recente = (r: Riga) => (r.risposto ?? r.quando) >= daCorto

  const vecchie: Imparato['vecchie'] = []
  const etaPerFonte = new Map<string, number[]>()
  const oscure: Imparato['oscure'] = []
  let nonChiare = 0
  const fatte = new Set<string>()
  const nonMie = new Map<string, number>()
  const nonMiaDopo = new Map<string, string>()
  const fattoDa = new Map<string, number>()

  for (const r of righe) {
    const m = mittenteDi(r)
    if (r.stato === 'scartato' && r.ragione === 'vecchia' && recente(r)) {
      const nascita = Date.parse(r.quando), fonteQuando = Date.parse(m?.quando ?? '')
      const giorni = Number.isFinite(nascita) && Number.isFinite(fonteQuando) ? Math.max(0, Math.round((nascita - fonteQuando) / GIORNO)) : null
      if (giorni !== null && r.fonte) {
        if (vecchie.length < 3) vecchie.push({ titolo: r.titolo, fonte: r.fonte, giorni })
        etaPerFonte.set(r.fonte, [...(etaPerFonte.get(r.fonte) ?? []), giorni])
      }
    }
    if (r.stato === 'scartato' && r.ragione === 'non_chiara' && recente(r)) {
      nonChiare++
      if (oscure.length < 3) oscure.push({ titolo: r.titolo, perche: r.perche ?? '' })
    }
    if (!m) continue
    if (r.stato === 'scartato' && r.ragione === 'fatta') fatte.add(m.indirizzo)
    if (r.stato === 'scartato' && r.ragione === 'non_mia' && !m.automatico) {
      nonMie.set(m.indirizzo, (nonMie.get(m.indirizzo) ?? 0) + 1)
      const q = r.risposto ?? r.quando
      if ((nonMiaDopo.get(m.indirizzo) ?? '') < q) nonMiaDopo.set(m.indirizzo, q)
    }
    if (r.stato === 'fatto') fattoDa.set(m.indirizzo, (fattoDa.get(m.indirizzo) ?? 0) + 1)
  }

  const etaVecchia = new Map<string, number>()
  for (const [fonte, giorni] of etaPerFonte) if (giorni.length >= 2) etaVecchia.set(fonte, mediana(giorni))

  const nonSuoi = new Set<string>()
  for (const [indirizzo, n] of nonMie) if (n >= 2 && !fattoDa.has(indirizzo)) nonSuoi.add(indirizzo)

  const daNonPerdere = new Set<string>()
  const mancate = db.prepare(`SELECT mittente, agito FROM mancate WHERE genere = 'risposta' AND mittente IS NOT NULL AND agito >= ?`)
    .all(daLungo) as { mittente: string; agito: string }[]
  for (const x of mancate) {
    const indirizzo = x.mittente.toLowerCase()
    const dopo = nonMiaDopo.get(indirizzo)
    if (!dopo || dopo <= x.agito) daNonPerdere.add(indirizzo)
  }
  for (const [indirizzo, n] of fattoDa) if (n >= 2 && !nonMie.has(indirizzo)) daNonPerdere.add(indirizzo)

  return {
    vecchie, etaVecchia, oscure,
    sogliaChiara: Math.min(CHIARA_MAX, SOGLIA_CHIARA + PASSO_CHIARA * nonChiare),
    ricontrolla: fatte, nonSuoi, daNonPerdere
  }
}

/** Ha già scritto a quell'indirizzo dopo quel momento: la richiesta è già risposta. */
export function inviatoDopo(indirizzo: string, dopo: string): boolean {
  const a = indirizzo.trim().toLowerCase()
  if (!a) return false
  return !!db.prepare(`
    SELECT 1 FROM documenti WHERE inviato = 1 AND quando > ? AND destinatari IS NOT NULL
      AND instr(',' || lower(destinatari) || ',', ',' || ? || ',') > 0 LIMIT 1
  `).get(dopo, a)
}

/** Le righe del prompt della lettura, o niente se non ha imparato niente. */
export function righePrompt(i: Imparato): string {
  const righe: string[] = []
  if (i.vecchie.length) {
    righe.push('Queste le ha scartate perché vecchie: una cosa di questa età, da questa fonte, di solito non le serve più.\n' +
      i.vecchie.map(v => `— «${v.titolo}» (${v.fonte}, ${v.giorni} giorni)`).join('\n'))
  }
  if (i.oscure.length) {
    righe.push('Queste non le ha capite al primo sguardo. Non scrivere così:\n' +
      i.oscure.map(o => `— «${o.titolo}» / «${o.perche}»`).join('\n'))
  }
  if (i.nonSuoi.size) {
    righe.push(`La posta di queste persone di solito non è per lei, salvo una richiesta diretta: ${[...i.nonSuoi].slice(0, NOMINATI).join(', ')}.`)
  }
  if (i.daNonPerdere.size) {
    righe.push(`A queste persone ha risposto da sola senza che il feed gliele mostrasse: una loro richiesta recente merita una voce: ${[...i.daNonPerdere].slice(0, NOMINATI).join(', ')}.`)
  }
  return righe.join('\n')
}
