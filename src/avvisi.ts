// Gli avvisi di sistema: quando dirgli una cosa, e come.
//
// Lo scopo è uno: che non debba aprire Myynd per sapere se c'è qualcosa da
// guardare. Un lavoro pronto, una risposta pronta per una mail, un file
// consegnato, una carta del feed che oggi conta davvero, il punto della
// mattina: quando succede e lui non sta guardando, il Mac glielo dice.
//
// E il rovescio, che conta di più: mai una raffica. Prima ogni pezzo
// dell'app chiamava `notifica` per conto suo e il guscio buttava via quello
// che arrivava a meno di due secondi dal precedente — perso, non rimandato.
// Adesso tutto passa da qui:
//
// — ogni cosa si dice una volta sola (genere e id, ricordati per la sessione);
// — non più di un avviso per genere ogni dieci minuti, e non più di sei
//   all'ora in tutto: quello che non può uscire aspetta, non si butta;
// — quello che arriva insieme esce insieme, in un avviso solo («3 things are
//   ready»), e quello che non entra nel corpo dell'avviso non conta come detto;
// — di notte, nella finestra del turno (se il turno è acceso), niente suona:
//   quello che è pronto aspetta la fine della notte, ed esce col punto della
//   mattina;
// — quando torna sulla finestra, quello che la schermata davanti a lui
//   mostra l'ha visto; il resto aspetta ancora.
//
// La parte che decide è `decidi`, pura e provata da sola, con `componi`,
// `visto` e `rimetti`; il resto la chiama con l'orologio e il deposito della
// finestra.

import { avvisiAccesi, desktop, type Dove } from './desktop.ts'
import { t } from './lingua.ts'

export type Genere = 'lavoro' | 'chiede' | 'bozza' | 'file' | 'feed' | 'punto' | 'fonte'

/** Una cosa che si potrebbe dire. `titolo` solo quando non basta quello del genere (una fonte rotta). */
export type Candidato = { genere: Genere; id: string; corpo: string; dove: Dove; titolo?: string }

/** Quello che resta fra un giro e l'altro: sta nel deposito della sessione. */
export type Memoria = {
  /** Le chiavi già dette (o viste da lui sulla schermata). */
  visti: string[]
  /** L'ultimo avviso di ogni genere. */
  ultimo: Partial<Record<Genere, number>>
  /** Gli avvisi usciti nell'ultima ora. */
  inviati: number[]
  /** Quello che aspetta il suo turno, con quando è arrivato. */
  attesa: (Candidato & { dal: number })[]
}

/** Un avviso per genere ogni dieci minuti. */
export const OGNI_GENERE_MS = 10 * 60_000
/** Al massimo sei avvisi in un'ora, di qualunque genere. */
export const MASSIMO_ORA = 6
const ORA_MS = 3_600_000
/** Le chiavi ricordate: oltre, le più vecchie se ne vanno. */
const VISTI_MAX = 400
/** Quante cose possono aspettare: un avviso ne dice al massimo qualche titolo. */
const ATTESA_MAX = 20
/** Quello che aspetta da più di mezza giornata non è più una notizia. */
const ATTESA_VECCHIA_MS = 12 * ORA_MS
/** Gli avvisi erano spenti e tornano accesi: quello che aspetta da più di due ore non è più una notizia. */
export const VECCHIE_ALLA_RIACCENSIONE_MS = 2 * ORA_MS
/** Dopo la fine della notte si aspetta un poco: il punto della mattina arriva in quel minuto, ed esce insieme. */
export const DOPO_LA_NOTTE_MS = 90_000
/** Il peso da cui una carta del feed merita un avviso: «oggi, o in ritardo» (`PESO_CARTA` nel server). */
export const SOGLIA_FEED = 2.5

export const vuota = (): Memoria => ({ visti: [], ultimo: {}, inviati: [], attesa: [] })

const chiave = (c: Pick<Candidato, 'genere' | 'id'>) => `${c.genere}:${c.id}`

/**
 * Cosa esce adesso, e cosa aspetta.
 *
 * `fineNotte` è quando finisce (o è appena finita) la notte, o null: vedi
 * `fineDellaNotte`. Torna la memoria nuova, quello che esce in un avviso solo
 * (o null), e quando ripassare per quello che è rimasto ad aspettare.
 */
export function decidi(m: Memoria, nuovi: readonly Candidato[], adesso: number, fineNotte: number | null = null): {
  memoria: Memoria; esce: Candidato[] | null; prossimo: number | null
} {
  const visti = new Set(m.visti)
  const attesa = m.attesa.filter(c => c.dal > adesso - ATTESA_VECCHIA_MS)
  const inAttesa = new Set(attesa.map(chiave))
  for (const c of nuovi) {
    const k = chiave(c)
    if (visti.has(k) || inAttesa.has(k)) continue
    inAttesa.add(k)
    attesa.push({ ...c, dal: adesso })
  }
  // troppe in coda: restano le più recenti, e il punto sempre
  while (attesa.length > ATTESA_MAX) {
    const i = attesa.findIndex(c => c.genere !== 'punto')
    attesa.splice(i < 0 ? 0 : i, 1)
  }
  const inviati = m.inviati.filter(x => adesso - x < ORA_MS)
  const fermo = (prossimo: number | null) => ({ memoria: { ...m, inviati, attesa }, esce: null, prossimo: attesa.length ? prossimo : null })

  if (!attesa.length) return fermo(null)
  // la notte vale fino a un minuto e mezzo dopo la sua fine: il punto della mattina arriva lì, ed esce insieme
  if (fineNotte !== null && fineNotte + DOPO_LA_NOTTE_MS > adesso) return fermo(fineNotte + DOPO_LA_NOTTE_MS)
  if (inviati.length >= MASSIMO_ORA) return fermo(inviati[0] + ORA_MS)

  const libero = (g: Genere) => adesso - (m.ultimo[g] ?? -Infinity) >= OGNI_GENERE_MS
  const esce = attesa.filter(c => libero(c.genere))
  const resta = attesa.filter(c => !libero(c.genere))
  if (!esce.length) return fermo(Math.min(...resta.map(c => (m.ultimo[c.genere] ?? adesso) + OGNI_GENERE_MS)))

  const ultimo = { ...m.ultimo }
  for (const c of esce) ultimo[c.genere] = adesso
  const memoria: Memoria = {
    visti: [...m.visti, ...esce.map(chiave)].slice(-VISTI_MAX),
    ultimo,
    inviati: [...inviati, adesso],
    attesa: resta
  }
  const prossimo = resta.length ? Math.min(...resta.map(c => (ultimo[c.genere] ?? adesso) + OGNI_GENERE_MS)) : null
  return { memoria, esce, prossimo }
}

/** Le schermate dell'app (`Screen` in data.ts). `myynd` è la prima pagina. */
export type Schermo = 'myynd' | 'oggi' | 'chat' | 'mappa' | 'pref' | 'conn' | 'memoria' | 'aiuto' | 'progetti'
/** Dove una cosa si vede da sé: le righe nella lista (a lato della prima pagina, o in To do), il resto sulla prima pagina. */
const SI_VEDE: Record<Genere, readonly Schermo[]> = {
  lavoro: ['myynd', 'oggi'], bozza: ['myynd', 'oggi'], file: ['myynd', 'oggi'], chiede: ['myynd', 'oggi'],
  feed: ['myynd'], punto: ['myynd'], fonte: ['myynd']
}

/**
 * Lui sta guardando la schermata `schermo`: quello che aspettava e che lei
 * mostra l'ha visto da sé, e non si dice più. Il resto (e quello di `anche`
 * che lei non mostra) aspetta ancora: una domanda arrivata mentre era sulla
 * chat non l'ha vista nessuno.
 */
export function visto(m: Memoria, anche: readonly Candidato[], schermo: Schermo | null, adesso: number): Memoria {
  const si = (c: Candidato) => !!schermo && SI_VEDE[c.genere].includes(schermo)
  const note = new Set([...m.visti, ...m.attesa.map(chiave)])
  const nuove = anche.filter(c => !note.has(chiave(c)))
  const viste = [...m.attesa, ...nuove].filter(si).map(chiave)
  const attesa = [...m.attesa.filter(c => !si(c)), ...nuove.filter(c => !si(c)).map(c => ({ ...c, dal: adesso }))]
  if (!viste.length && attesa.length === m.attesa.length) return m
  return { ...m, visti: [...m.visti, ...viste].slice(-VISTI_MAX), attesa }
}

/** Alla riaccensione degli avvisi: via quello che aspetta da troppo. */
export function senzaVecchie(m: Memoria, adesso: number, ms = VECCHIE_ALLA_RIACCENSIONE_MS): Memoria {
  const attesa = m.attesa.filter(c => c.dal > adesso - ms)
  return attesa.length === m.attesa.length ? m : { ...m, attesa }
}

/**
 * Rimette ad aspettare quello che è uscito ma l'avviso non ha potuto dire
 * (il corpo era pieno): non è stato detto, quindi non è visto.
 */
export function rimetti(m: Memoria, fuori: readonly Candidato[], adesso: number): Memoria {
  if (!fuori.length) return m
  const via = new Set(fuori.map(chiave))
  return { ...m, visti: m.visti.filter(k => !via.has(k)), attesa: [...m.attesa, ...fuori.map(c => ({ ...c, dal: adesso }))] }
}

/** Il titolo di ogni genere, in italiano: la lingua la mette `t()`. */
const TITOLI: Record<Genere, string> = {
  lavoro: 'Il lavoro è pronto.',
  chiede: 'Myynd ti chiede una cosa.',
  bozza: 'La risposta è pronta.',
  file: 'Il file è pronto.',
  feed: 'Una cosa conta oggi.',
  punto: 'Il punto è pronto.',
  fonte: 'Una fonte non risponde.'
}

const CORPO_MAX = 200
const taglia = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
/** Prima quello che aspetta lui, poi il resto. */
const ORDINE: Genere[] = ['chiede', 'feed', 'bozza', 'file', 'lavoro', 'fonte', 'punto']

/**
 * L'avviso che esce, in parole, e quello che non ci è stato.
 *
 * Uno: il titolo del suo genere, il suo titolo sotto, e un clic porta lì.
 * Tanti: quante sono, i loro titoli in fila (prima le domande e il feed), e
 * un clic porta dove stanno tutte — la prima pagina, se non stanno nello
 * stesso posto. Con dentro il punto della mattina, parla il punto: il lavoro
 * della notte è già nel suo «fatte stanotte», ma una domanda o una carta del
 * feed si nominano lo stesso. Quello che non entra nel corpo torna in
 * `fuori`: non è stato detto, e aspetta il suo turno.
 */
export function componi(esce: readonly Candidato[], tr: (s: string) => string = t): { titolo: string; corpo: string; dove: Dove; fuori: Candidato[] } {
  if (esce.length === 1) {
    const c = esce[0]
    return { titolo: c.titolo ?? tr(TITOLI[c.genere]), corpo: taglia(c.corpo, CORPO_MAX), dove: c.dove, fuori: [] }
  }
  const punto = esce.find(c => c.genere === 'punto')
  const altre = esce.filter(c => c !== punto).sort((a, b) => ORDINE.indexOf(a.genere) - ORDINE.indexOf(b.genere))
  const daNominare = punto ? altre.filter(c => c.genere === 'chiede' || c.genere === 'feed') : altre
  const pezzi: string[] = punto?.corpo ? [punto.corpo] : []
  const dette: Candidato[] = []
  const fuori: Candidato[] = []
  for (const c of daNominare) {
    const testo = c.corpo || c.titolo || ''
    if (!testo) { dette.push(c); continue }
    if (!pezzi.length) { pezzi.push(taglia(testo, CORPO_MAX)); dette.push(c) }
    else if ([...pezzi, testo].join(' · ').length <= CORPO_MAX) { pezzi.push(testo); dette.push(c) }
    else fuori.push(c)
  }
  const corpo = pezzi.join(' · ')
  if (punto) return { titolo: punto.titolo ?? tr(TITOLI.punto), corpo, dove: punto.dove, fuori }
  if (dette.length === 1) {
    const c = dette[0]
    return { titolo: c.titolo ?? tr(TITOLI[c.genere]), corpo, dove: c.dove, fuori }
  }
  const stesso = dette.every(c => JSON.stringify(c.dove) === JSON.stringify(dette[0].dove))
  return {
    titolo: tr('{n} cose sono pronte.').replace('{n}', String(dette.length)),
    corpo, dove: stesso ? dette[0].dove : 'casa', fuori
  }
}

/* — da dove arrivano — */

/** Una riga della lista pronta o con una domanda, come la porta il filo. */
type Riga = { id: string; testo: string; titolo?: string | null; versione?: number; aggiornato?: string
  consegna?: unknown; email?: unknown }

/**
 * Una riga che ha finito, come cosa da dire.
 *
 * Il genere viene da quello che ha consegnato: un file, una risposta a una
 * mail, o un lavoro qualunque. La versione nella chiave: la stessa riga
 * rifatta con «Cambia» e pronta di nuovo è una notizia nuova.
 */
export function daRiga(fase: 'pronto' | 'chiede', c: Riga): Candidato {
  const genere: Genere = fase === 'chiede' ? 'chiede' : c.consegna ? 'file' : c.email ? 'bozza' : 'lavoro'
  return {
    genere, id: `${c.id}@${c.versione ?? c.aggiornato ?? ''}`,
    corpo: (c.titolo || c.testo || '').trim(), dove: { dove: 'compito', id: c.id }
  }
}

/** Le carte del feed nate da `prima` in qua che oggi contano davvero, e che lui non ha ancora visto. */
export function dalFeed(prima: ReadonlySet<string>, voci: readonly { id: string; titolo: string; peso?: number | null; vista?: string | null }[]): Candidato[] {
  return voci
    .filter(v => !prima.has(v.id) && typeof v.peso === 'number' && v.peso >= SOGLIA_FEED && !v.vista)
    .map(v => ({ genere: 'feed' as const, id: v.id, corpo: v.titolo.trim(), dove: { dove: 'voce' as const, id: v.id } }))
}

/** Il giorno locale, «AAAA-MM-GG»: la chiave del punto, una volta al giorno. */
export function giornoDi(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Il punto della mattina: quante cose sono state fatte stanotte, e quante aspettano lui. */
export function dallaMattina(e: { giorno: string; fatte: number; aspettano?: number }, tr: (s: string) => string = t): Candidato {
  const aspettano = e.aspettano ?? 0
  const corpo = aspettano > 0
    ? tr('{n} fatte stanotte, {m} aspettano te.').replace('{n}', String(e.fatte)).replace('{m}', String(aspettano))
    : e.fatte === 1 ? tr('Una cosa fatta stanotte.') : tr('{n} cose fatte stanotte.').replace('{n}', String(e.fatte))
  return { genere: 'punto', id: e.giorno, titolo: tr('Il punto di stamattina è pronto.'), corpo, dove: 'casa' }
}

/* — la notte — */

export type Notte = { da: string; a: string }
const ORA = /^([01]\d|2[0-3]):([0-5]\d)$/
const minuti = (s: string) => { const m = ORA.exec(s); return m ? Number(m[1]) * 60 + Number(m[2]) : null }

/**
 * Quando finisce la notte in corso, o quando è finita se è finita da meno
 * di `DOPO_LA_NOTTE_MS`; null se non è notte.
 *
 * La stessa regola del turno (`server/turno-regole.ts`): una finestra che
 * scavalca la mezzanotte vale da tutte e due le parti. Il minuto e mezzo
 * dopo la fine conta ancora come notte: lì arriva il punto della mattina, e
 * quello che la notte ha tenuto esce con lui, non un attimo prima.
 */
export function fineDellaNotte(adesso: Date, f: Notte | null): number | null {
  if (!f) return null
  const da = minuti(f.da), a = minuti(f.a)
  if (da === null || a === null || da === a) return null
  const fineDa = (d: Date): number | null => {
    const m = d.getHours() * 60 + d.getMinutes()
    if (!(da > a ? (m >= da || m < a) : (m >= da && m < a))) return null
    const fine = new Date(d.getTime())
    fine.setHours(Math.floor(a / 60), a % 60, 0, 0)
    if (fine.getTime() <= d.getTime()) fine.setDate(fine.getDate() + 1)
    return fine.getTime()
  }
  return fineDa(adesso) ?? fineDa(new Date(adesso.getTime() - DOPO_LA_NOTTE_MS))
}

/* — il giro vero: l'orologio, il deposito, il guscio — */

const DEPOSITO = 'myynd.avvisi'
/** Quanto si aspetta che arrivi il resto: tre carte pronte nello stesso giro sono un avviso. */
const RACCOLTA_MS = 1500

function leggi(): Memoria {
  try {
    const m = JSON.parse(sessionStorage.getItem(DEPOSITO) ?? 'null') as Memoria | null
    if (m && Array.isArray(m.visti) && Array.isArray(m.inviati) && Array.isArray(m.attesa) && m.ultimo) return m
  } catch { /* deposito illeggibile: si riparte da capo */ }
  return vuota()
}
function scrivi(m: Memoria) {
  try { sessionStorage.setItem(DEPOSITO, JSON.stringify(m)) } catch { /* senza deposito si ricorda finché la pagina vive */ }
  memoriaViva = m
}
let memoriaViva: Memoria | null = null
const memoria = () => memoriaViva ?? (memoriaViva = leggi())

let raccolta: Candidato[] = []
let timerRaccolta: ReturnType<typeof setTimeout> | undefined
let timerProssimo: ReturnType<typeof setTimeout> | undefined
let notte: Notte | null = null
let schermo: Schermo | null = null
let installato = false
/** Gli avvisi erano spenti all'ultimo giro: alla riaccensione, quello che è vecchio se ne va. */
let spenti = false

/** Lui sta guardando Myynd: la finestra è davanti e ha il fuoco. */
const davanti = () => typeof document !== 'undefined' && !document.hidden && document.hasFocus()

/** La notte del turno, da quando la lista la porta: dentro, niente suona. Null col turno spento. */
export function impostaNotte(f: Notte | null) { notte = f }

/**
 * La schermata davanti a lui. Con la finestra davanti, quello che aspettava
 * e che questa schermata mostra l'ha visto. È anche il primo segno di vita
 * della pagina: dopo un ricaricamento, la coda salvata riparte da qui.
 */
export function impostaSchermo(s: Schermo) {
  schermo = s
  installa()
  if (davanti()) scrivi(visto(memoria(), [], schermo, Date.now()))
}

/**
 * Una cosa da dire, se lui ha lasciato accesi gli avvisi e non sta guardando.
 *
 * Non esce subito: si aspetta un attimo che arrivi il resto, e poi decide
 * `decidi`. Con la finestra davanti non si dice niente — la pagina lo
 * mostra da sé.
 */
export function avvisa(c: Candidato) {
  if (!avvisiAccesi() || davanti()) return
  installa()
  raccolta.push(c)
  clearTimeout(timerRaccolta)
  timerRaccolta = setTimeout(scarica, RACCOLTA_MS)
}

function scarica() {
  const nuovi = raccolta
  raccolta = []
  clearTimeout(timerProssimo)
  if (!avvisiAccesi()) { spenti = true; return }
  const adesso = Date.now()
  let m = memoria()
  if (spenti) { m = senzaVecchie(m, adesso); spenti = false }
  if (davanti()) { scrivi(visto(m, nuovi, schermo, adesso)); return }
  const r = decidi(m, nuovi, adesso, fineDellaNotte(new Date(adesso), notte))
  let dopo = r.memoria
  let prossimo = r.prossimo
  if (r.esce) {
    const { fuori, ...nota } = componi(r.esce)
    desktop()?.notifica?.(nota)
    // quello che non è entrato nel corpo non è detto: aspetta il suo genere, dieci minuti
    dopo = rimetti(dopo, fuori, adesso)
    if (fuori.length) prossimo = Math.min(prossimo ?? Infinity, adesso + OGNI_GENERE_MS)
  }
  scrivi(dopo)
  if (prossimo !== null) timerProssimo = setTimeout(scarica, Math.max(1000, prossimo - adesso))
}

/**
 * Tornato sulla finestra: quello che aspettava e che ha davanti agli occhi
 * l'ha visto. Andato via: quello che è rimasto riparte. E al primo giro,
 * dopo un ricaricamento, la coda salvata riprende il suo orologio.
 */
function installa() {
  if (installato || typeof window === 'undefined') return
  installato = true
  window.addEventListener('focus', () => {
    clearTimeout(timerRaccolta)
    clearTimeout(timerProssimo)
    scrivi(visto(memoria(), raccolta, schermo, Date.now()))
    raccolta = []
  })
  const riparti = () => { clearTimeout(timerRaccolta); timerRaccolta = setTimeout(scarica, RACCOLTA_MS) }
  window.addEventListener('blur', () => { if (memoria().attesa.length) riparti() })
  if (memoria().attesa.length) riparti()
}
