// Le previsioni: puro, senza database.
//
// Liste dentro, affermazioni fuori. Così il giro del mattino, la prova sul
// passato (gemello-prova.ts) e le prove automatiche fanno gli stessi conti
// con le stesse funzioni: se qui si cambia un peso, cambia dappertutto.
//
// Tre generi di affermazione, tutte binarie, ognuna con la probabilità che
// sia giusta:
//   · posta.risponde / posta.non_risponde: a questa mail risponderà oggi?
//   · progetto.del_giorno: su quale progetto lavorerà di più?
//   · compito.chiude / compito.slitta: questa riga di oggi la chiude oggi?
//
// La regola per scegliere cosa affermare è fissa (`scegli`): tutto quello che
// passa 0,7 dentro i tetti, e comunque almeno cinque righe se ci sono almeno
// cinque candidate. Non si può gonfiare il punteggio scegliendo solo le
// facili. E accanto a ogni affermazione si conta cosa avrebbe detto una regola
// che di lui non sa niente (`base`): «non risponde», «lo stesso di ieri»,
// «quelle in programma le chiude».

import type { Coppia, SegnaleArrivata } from './segnali.ts'

export type Genere = 'posta.risponde' | 'posta.non_risponde' | 'progetto.del_giorno' | 'compito.chiude' | 'compito.slitta'
export type Candidato = { genere: Genere; ref: string; p: number; dati: Record<string, unknown> }
export type Esito = 'giusta' | 'sbagliata'

export const PESI_POSTA = { base: -0.4, mittente: 1.0, dominio: 0.3, filo: 0.8, richiesta: 0.6, eta: 0.35 }
/** I domini di tutti: il tasso del dominio non dice niente di quel mittente. */
export const DOMINI_PUBBLICI = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com', 'libero.it'])
export const TETTI = { posta: 8, compiti: 5, progetto: 1, totale: 12, minime: 5, soglia: 0.7 }

const GIORNO = 86_400_000
const sigma = (x: number) => 1 / (1 + Math.exp(-x))
const logit = (p: number) => Math.log(p / (1 - p))
const laplace = (r: number, n: number) => (r + 1) / (n + 2)
const dominio = (addr: string) => addr.split('@')[1]?.toLowerCase() ?? ''

// — la posta —

/**
 * Le mail a cui potrebbe rispondere oggi, con la probabilità.
 *
 * Solo fatti di prima di `t0` (le coppie passate devono venire da mail
 * mandate prima di t0). Una mail sconosciuta senza una richiesta non riceve
 * un «non risponderà»: sugli estranei non si scommette.
 */
export function candidatiPosta(arrivate: SegnaleArrivata[], coppie: Coppia[], t0: Date, fineGiorno: Date): Candidato[] {
  void fineGiorno
  const t = t0.getTime()
  const risposte = new Set(coppie.map(c => c.arrivata))
  const prima = arrivate.filter(a => Date.parse(a.quando) < t)
  const da90 = t - 90 * GIORNO
  const giudicabili = t - GIORNO
  // i tassi per mittente e dominio, sulle mail di almeno un giorno fa
  const perMittente = new Map<string, { n: number; r: number }>()
  const perDominio = new Map<string, { n: number; r: number }>()
  const filiRisposti = new Set<string>()
  for (const a of prima) {
    const q = Date.parse(a.quando)
    if (risposte.has(a.id) && a.dati.filo) filiRisposti.add(a.dati.filo)
    if (q < da90 || q > giudicabili) continue
    const m = perMittente.get(a.chi) ?? { n: 0, r: 0 }
    m.n++; if (risposte.has(a.id)) m.r++; perMittente.set(a.chi, m)
    const d = dominio(a.chi)
    if (d && !DOMINI_PUBBLICI.has(d)) {
      const x = perDominio.get(d) ?? { n: 0, r: 0 }
      x.n++; if (risposte.has(a.id)) x.r++; perDominio.set(d, x)
    }
  }
  const fuori: Candidato[] = []
  for (const a of prima) {
    const q = Date.parse(a.quando)
    if (q < t - 7 * GIORNO || risposte.has(a.id)) continue
    const m = perMittente.get(a.chi) ?? { n: 0, r: 0 }
    const d = perDominio.get(dominio(a.chi))
    const richiesta = !!a.dati.richiesta
    const etaGiorni = (t - q) / GIORNO
    let x = PESI_POSTA.base + PESI_POSTA.mittente * logit(laplace(m.r, m.n))
    if (d) x += PESI_POSTA.dominio * logit(laplace(d.r, d.n))
    if (a.dati.filo && filiRisposti.has(a.dati.filo)) x += PESI_POSTA.filo
    if (richiesta) x += PESI_POSTA.richiesta
    x -= PESI_POSTA.eta * Math.min(etaGiorni, 7)
    const p = sigma(x)
    const dati = { nome: a.dati.nome, titolo: a.dati.titolo, chi: a.chi, filo: a.dati.filo, messageId: a.dati.messageId, doc: a.ref, quando: a.quando, progetto: a.progetto ?? null }
    if (p >= 0.5) fuori.push({ genere: 'posta.risponde', ref: a.id, p, dati })
    else if (m.n >= 3 || richiesta) fuori.push({ genere: 'posta.non_risponde', ref: a.id, p: 1 - p, dati })
  }
  return fuori
}

/** È giusta se la risposta è arrivata fra t0 e la fine del giorno (le coppie sono quelle di adesso). */
export function esitoPosta(pred: { genere: string; ref: string }, coppie: Coppia[], t0: Date, fine: Date, quandoInviata: (id: string) => string | null): Esito {
  const c = coppie.find(x => x.arrivata === pred.ref)
  const q = c ? quandoInviata(c.inviata) : null
  const risposta = !!q && Date.parse(q) >= t0.getTime() && Date.parse(q) < fine.getTime()
  return (pred.genere === 'posta.risponde') === risposta ? 'giusta' : 'sbagliata'
}

// — il progetto —

/**
 * Il progetto del giorno: uno solo, quando almeno due progetti si sono mossi
 * negli ultimi sette giorni. `p` è la quota softmax del primo.
 */
export function candidatoProgetto(
  attivita7: Map<string, number>, ieri: string | null,
  oggi: { eventi: Map<string, number>; compiti: Map<string, number>; alta: Set<string> }
): Candidato | null {
  const attivi = [...attivita7.entries()].filter(([, m]) => m > 0)
  if (attivi.length < 2) return null
  const totale = attivi.reduce((s, [, m]) => s + m, 0)
  const punti = new Map<string, number>()
  const ids = new Set([...attivi.map(([id]) => id), ...oggi.eventi.keys(), ...oggi.compiti.keys()])
  for (const id of ids) {
    const quota = (attivita7.get(id) ?? 0) / totale
    punti.set(id, 2 * (ieri === id ? 1 : 0) + 3 * quota + (oggi.eventi.get(id) ?? 0) + 0.5 * (oggi.compiti.get(id) ?? 0) + 0.5 * (oggi.alta.has(id) ? 1 : 0))
  }
  const ordinati = [...punti.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const somma = ordinati.reduce((s, [, x]) => s + Math.exp(x), 0)
  const [ref, x] = ordinati[0]!
  return { genere: 'progetto.del_giorno', ref, p: Math.exp(x) / somma, dati: { ieri } }
}

/** Chi ha più minuti; nessuno se non c'è niente. */
export function vincitore(minuti: Map<string, number>): string | null {
  let meglio: [string, number] | null = null
  for (const [id, m] of minuti) if (m > 0 && (!meglio || m > meglio[1] || (m === meglio[1] && id < meglio[0]))) meglio = [id, m]
  return meglio?.[0] ?? null
}

// — i compiti —

export type CompitoAperto = { id: string; testo: string; priorita: string | null; stato: string; creato: string; progetto?: string | null }
export type StoriaCompiti = { pianificati: number; chiusiInGiornata: number }

/** Le righe di oggi: chiuse oggi, o rimandate. */
export function candidatiCompiti(aperti: CompitoAperto[], storia30: StoriaCompiti, t0: Date): Candidato[] {
  const tasso = laplace(storia30.chiusiInGiornata, storia30.pianificati)
  const fuori: Candidato[] = []
  for (const c of aperti) {
    const eta = Math.max(0, (t0.getTime() - Date.parse(c.creato)) / GIORNO)
    let p = tasso
    if (c.priorita === 'alta') p += 0.15
    if (c.stato === 'pronto') p += 0.2
    p -= Math.min(0.3, 0.1 * Math.max(0, eta - 2))
    p = Math.min(0.95, Math.max(0.05, p))
    const dati = { testo: c.testo.slice(0, 160), progetto: c.progetto ?? null }
    if (p >= 0.5) fuori.push({ genere: 'compito.chiude', ref: c.id, p, dati })
    else fuori.push({ genere: 'compito.slitta', ref: c.id, p: 1 - p, dati })
  }
  return fuori
}

// — la scelta, la base, il punteggio —

/**
 * Cosa affermare: ordinate per fiducia, tutte quelle da 0,7 in su dentro i
 * tetti; se sono meno di cinque e le candidate sono almeno cinque, si aggiungono
 * le più sicure fino a cinque. Con meno di cinque candidate si prendono tutte
 * e si dice che è poco (`sottile`).
 */
export function scegli(c: Candidato[]): { scelte: Candidato[]; sottile: boolean } {
  const ordinate = c.slice().sort((a, b) => b.p - a.p || a.genere.localeCompare(b.genere) || a.ref.localeCompare(b.ref))
  if (ordinate.length < TETTI.minime) return { scelte: ordinate, sottile: true }
  const conta = { posta: 0, compiti: 0, progetto: 0 }
  const famiglia = (g: Genere) => g.startsWith('posta.') ? 'posta' : g.startsWith('compito.') ? 'compiti' : 'progetto'
  const scelte: Candidato[] = []
  const prendi = (x: Candidato) => {
    const f = famiglia(x.genere)
    if (scelte.length >= TETTI.totale || conta[f] >= TETTI[f]) return false
    conta[f]++; scelte.push(x); return true
  }
  const resto: Candidato[] = []
  for (const x of ordinate) { if (x.p >= TETTI.soglia) { if (!prendi(x)) resto.push(x) } else resto.push(x) }
  for (const x of resto) { if (scelte.length >= TETTI.minime) break; prendi(x) }
  return { scelte, sottile: false }
}

/** Cosa avrebbe detto chi di lui non sa niente, sulla stessa affermazione. */
export function base(pred: { genere: string; ref: string; dati: { ieri?: string | null } }, esito: { esito: Esito; vero?: string | null }): boolean {
  switch (pred.genere) {
    case 'posta.risponde': return esito.esito === 'sbagliata'
    case 'posta.non_risponde': return esito.esito === 'giusta'
    case 'progetto.del_giorno': return !!pred.dati.ieri && esito.vero === pred.dati.ieri
    case 'compito.chiude': return esito.esito === 'giusta'
    case 'compito.slitta': return esito.esito === 'sbagliata'
    default: return false
  }
}

/** Il punteggio di Brier: la distanza media fra la probabilità detta e quello che è successo. */
export function brier(righe: { p: number; giusta: boolean }[]): number {
  if (!righe.length) return 0
  return righe.reduce((s, r) => s + (r.p - (r.giusta ? 1 : 0)) ** 2, 0) / righe.length
}
