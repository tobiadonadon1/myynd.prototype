// La misura del feed: quante carte ha visto, quante erano giuste, quante gli sono sfuggite.
//
// Due numeri, per chi costruisce (lui li vedrà nel resoconto della settimana,
// P9): la **precisione**, cioè di quello che ha visto quanto ha fatto, tenuto
// o fatto già da solo, contro quello che ha scartato o lasciato scadere sotto
// gli occhi; e la **mancanza**, cioè quante cose ha fatto da solo senza che il
// feed gliele avesse messe davanti (`mancate.ts`), contro tutte quelle su cui
// ha agito. Obiettivo: precisione almeno 0,8, mancanza sotto 0,1.
//
// Si legge da tre posti: `GET /api/feed/misura`, una riga di registro a ogni
// lettura, e da riga di comando su una **copia** dei dati:
//
//   npm run misura:feed -- --conto <email> --dati <copia> [--giorni 30] [--json]
//
// La riga di comando non chiama mai Jev né un modello, e si rifiuta di aprire
// la cartella vera (`~/.myynd`): la misura si fa su una copia, sempre.
//
// **Gli import sono dinamici, ed è voluto** (come in `valuta-feed.ts`):
// `--dati` deve valere prima che `config.ts` legga MYYND_DATI, e gli import
// statici partono prima di qualunque riga di questo file. I moduli puri
// (`feed-esiti.ts`) si possono importare subito.

import { resolve, join, relative, isAbsolute } from 'node:path'
import { userInfo } from 'node:os'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { esitoCarta, ragioneDi, type Ragione } from './feed-esiti.ts'
import type { Mancata } from './mancate.ts'

export type Misura = {
  da: string; a: string; giorni: number
  carte: {
    nate: number; viste: number; storiche: number
    agite: number; fuori: number; tardive: number; tenute: number
    scartate: { vecchia: number; non_mia: number; non_chiara: number; senza: number }
    scadute: { tempo: number; data: number; tetto: number }
    superate: number
  }
  precisione: number | null
  precisioneChiusa: number | null
  mancate: { totale: number; risposte: number; compiti: number; perFase: Record<string, number> }
  mancanza: number | null
  mancanzaCompiti: number | null
  perGiorno: { giorno: string; nate: number; viste: number; giuste: number; sbagliate: number; mancate: number }[]
  perMittente: { mittente: string; viste: number; giuste: number; sbagliate: number }[]
  copertura: { postaInviata: boolean }
}

const GIORNO = 86_400_000
/** Sotto tante carte una percentuale non dice niente. */
export const MINIMO = 5
/** Una carta nata da meno di tanti giorni non ha ancora avuto il suo tempo: la precisione «chiusa» la lascia fuori. */
export const GIORNI_CHIUSA = 4

type Riga = { id: string; stato: string; ragione: string | null; motivo: string | null; vista: string | null; quando: string; risposto: string | null; doc: string | null; contesto: string | null }
type Classe = 'agite' | 'fuori' | 'tardive' | 'tenute' | 'superate' | `scartate.${'vecchia' | 'non_mia' | 'non_chiara' | 'senza'}` | `scadute.${'tempo' | 'data' | 'tetto'}`

/** In quale classe cade una carta vista, data la sua ragione e se ha risposto dalla posta. */
export function classeDi(r: Pick<Riga, 'stato' | 'ragione' | 'motivo'>, risposta: 'dopo' | 'prima' | null): Classe {
  const ragione: Ragione | null = ragioneDi(r.stato, r.ragione, r.motivo)
  switch (r.stato) {
    case 'fatto': return ragione === 'fuori' ? 'fuori' : 'agite'
    case 'scartato':
      if (ragione === 'fatta') return 'tardive'
      return ragione === 'vecchia' || ragione === 'non_mia' || ragione === 'non_chiara' ? `scartate.${ragione}` : 'scartate.senza'
    case 'aperto': return risposta === 'dopo' ? 'fuori' : risposta === 'prima' ? 'tardive' : 'tenute'
    case 'scaduto':
      if (ragione === 'superata') return 'superate'
      if (risposta === 'dopo') return 'fuori'
      if (risposta === 'prima') return 'tardive'
      return ragione === 'data' || ragione === 'tetto' ? `scadute.${ragione}` : 'scadute.tempo'
    default: return 'tenute'
  }
}

const vuote = (): Misura['carte'] => ({
  nate: 0, viste: 0, storiche: 0, agite: 0, fuori: 0, tardive: 0, tenute: 0,
  scartate: { vecchia: 0, non_mia: 0, non_chiara: 0, senza: 0 },
  scadute: { tempo: 0, data: 0, tetto: 0 }, superate: 0
})

function aggiungi(c: Misura['carte'], classe: Classe) {
  if (classe.startsWith('scartate.')) c.scartate[classe.slice(9) as keyof Misura['carte']['scartate']]++
  else if (classe.startsWith('scadute.')) c.scadute[classe.slice(8) as keyof Misura['carte']['scadute']]++
  else c[classe as 'agite' | 'fuori' | 'tardive' | 'tenute' | 'superate']++
}

/** (agite + fuori + tardive + tenute) / (quelle + scartate + scadute per tempo); null sotto il minimo. */
function precisioneDi(c: Misura['carte']): number | null {
  const buone = c.agite + c.fuori + c.tardive + c.tenute
  const cattive = c.scartate.vecchia + c.scartate.non_mia + c.scartate.non_chiara + c.scartate.senza + c.scadute.tempo
  const tutte = buone + cattive
  return tutte < MINIMO ? null : buone / tutte
}

/** Il giorno di un'ora ISO, nel calendario di chi guarda: alle 22:49 di giovedì una carta è di giovedì, non del venerdì UTC. */
export const giornoDi = (iso: string) => {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * La misura sulla finestra `[a − giorni, a]`, letta dal database del conto.
 *
 * Una carta è «vista» se la pagina l'ha segnata vista nella finestra; o se
 * l'ha chiusa lui (fatto, scartato) nella finestra senza che la pagina
 * l'avesse segnata (ha agito: l'ha vista); o, per la storia di prima della
 * colonna `vista`, se è nata prima della prima `vista` mai scritta ed è
 * scaduta nella finestra («storiche»). Una carta nuova senza `vista`, aperta
 * o scaduta, non è stata vista: non conta né a favore né contro.
 *
 * `extra.mancate` sono mancate trovate senza scriverle (la riga di comando),
 * sommate a quelle registrate, senza doppioni.
 */
export function misura(giorni = 14, adesso = Date.now(), extra?: { mancate?: Mancata[] }): Misura {
  // qui e non in testa: la riga di comando deve poter rifiutare `--dati`
  // prima che lo store apra qualunque cosa
  const { default: db } = requireStore()
  const { risposteFuori } = requireFeedDati()
  const { postaInviata } = requireMancate()
  const a = new Date(adesso).toISOString()
  const da = new Date(adesso - giorni * GIORNO).toISOString()
  const righe = db.prepare('SELECT id, stato, ragione, motivo, vista, quando, risposto, doc, contesto FROM feed').all() as Riga[]
  const primaVista = (db.prepare('SELECT MIN(vista) AS m FROM feed WHERE vista IS NOT NULL').get() as { m: string | null } | undefined)?.m ?? null
  const nellaFinestra = (t: string | null) => !!t && t >= da && t <= a

  const carte = vuote()
  const viste: { r: Riga; giornoVista: string; storica: boolean }[] = []
  for (const r of righe) {
    if (nellaFinestra(r.quando)) carte.nate++
    if (nellaFinestra(r.vista)) { viste.push({ r, giornoVista: r.vista!, storica: false }); continue }
    if (!r.vista && (r.stato === 'fatto' || r.stato === 'scartato') && nellaFinestra(r.risposto)) { viste.push({ r, giornoVista: r.risposto!, storica: false }); continue }
    if (!r.vista && r.stato === 'scaduto' && (!primaVista || r.quando < primaVista) && nellaFinestra(r.quando)) viste.push({ r, giornoVista: r.quando, storica: true })
  }
  carte.viste = viste.length
  carte.storiche = viste.filter(v => v.storica).length

  const fuori = risposteFuori(viste.map(v => ({ id: v.r.id, doc: v.r.doc, contesto: v.r.contesto, quando: v.r.quando })))
  const chiuse = vuote()
  const perGiorno = new Map<string, Misura['perGiorno'][number]>()
  const giornoVuoto = (g: string) => perGiorno.get(g) ?? (perGiorno.set(g, { giorno: g, nate: 0, viste: 0, giuste: 0, sbagliate: 0, mancate: 0 }), perGiorno.get(g)!)
  for (let t = Date.parse(da); t <= adesso; t += GIORNO) giornoVuoto(giornoDi(new Date(t).toISOString()))
  for (const r of righe) if (nellaFinestra(r.quando)) giornoVuoto(giornoDi(r.quando)).nate++
  const perMittente = new Map<string, Misura['perMittente'][number]>()
  const { indirizzoAttenzione } = requireRilevanza()
  for (const v of viste) {
    const f = fuori.get(v.r.id)
    const risposta = f ? (f.dopo ? 'dopo' : 'prima') : null
    const classe = classeDi(v.r, risposta)
    aggiungi(carte, classe)
    if (Date.parse(v.r.quando) <= adesso - GIORNI_CHIUSA * GIORNO) aggiungi(chiuse, classe)
    const esito = esitoCarta({ stato: v.r.stato, ragione: v.r.ragione, motivo: v.r.motivo, vista: v.r.vista, risposta })
    const g = giornoVuoto(giornoDi(v.giornoVista))
    g.viste++
    if (esito === 'giusta') g.giuste++
    else if (esito === 'sbagliata') g.sbagliate++
    let autore: string | null = null
    if (v.r.contesto) { try { autore = (JSON.parse(v.r.contesto) as { autore?: string | null }).autore ?? null } catch { autore = null } }
    const mittente = indirizzoAttenzione(autore)
    if (mittente) {
      const m = perMittente.get(mittente) ?? { mittente, viste: 0, giuste: 0, sbagliate: 0 }
      m.viste++
      if (esito === 'giusta') m.giuste++
      else if (esito === 'sbagliata') m.sbagliate++
      perMittente.set(mittente, m)
    }
  }

  const registrate = db.prepare('SELECT id, genere, fase, motivo, agito FROM mancate WHERE agito >= ? AND agito <= ?').all(da, a) as Pick<Mancata, 'id' | 'genere' | 'fase' | 'motivo' | 'agito'>[]
  const tutte = new Map(registrate.map(m => [m.id, m]))
  for (const m of extra?.mancate ?? []) if (nellaFinestra(m.agito) && !tutte.has(m.id)) tutte.set(m.id, m)
  const perFase: Record<string, number> = {}
  let risposte = 0, compiti = 0
  for (const m of tutte.values()) {
    if (m.genere === 'risposta') risposte++; else compiti++
    const chiave = (m.fase === 'regole' || m.fase === 'verifica') && m.motivo ? `${m.fase}:${m.motivo}` : m.fase
    perFase[chiave] = (perFase[chiave] ?? 0) + 1
    giornoVuoto(giornoDi(m.agito)).mancate++
  }
  const mancate = { totale: tutte.size, risposte, compiti, perFase }
  const copertura = { postaInviata: postaInviata(adesso) }
  const agite = carte.agite + carte.fuori + carte.tardive
  const mancanza = !copertura.postaInviata || agite + mancate.totale < MINIMO ? null : mancate.totale / (agite + mancate.totale)
  const mancanzaCompiti = agite + mancate.compiti < MINIMO ? null : mancate.compiti / (agite + mancate.compiti)

  return {
    da, a, giorni, carte,
    precisione: precisioneDi(carte), precisioneChiusa: precisioneDi(chiuse),
    mancate, mancanza, mancanzaCompiti,
    perGiorno: [...perGiorno.values()].sort((x, y) => x.giorno.localeCompare(y.giorno)),
    perMittente: [...perMittente.values()].sort((x, y) => y.viste - x.viste || x.mittente.localeCompare(y.mittente)).slice(0, 10),
    copertura
  }
}

const percento = (x: number | null) => x === null ? 'n.d.' : `${Math.round(x * 100)}%`

/**
 * Una riga per il registro: «myynd · misura · 14 giorni: 31 viste, 28 giuste o
 * tenute su 31 (90%), di cui 3 tardive, 2 mancate su 30 (7%)». Il conto e la
 * percentuale sono la stessa frazione: numeratore e denominatore della
 * precisione, con le tardive dentro il numeratore, dette a parte.
 */
export function rigaDelRegistro(m: Misura): string {
  const c = m.carte
  const buone = c.agite + c.fuori + c.tardive + c.tenute
  const tutte = buone + c.scartate.vecchia + c.scartate.non_mia + c.scartate.non_chiara + c.scartate.senza + c.scadute.tempo
  const su = c.agite + c.fuori + c.tardive + m.mancate.totale
  return `myynd · misura · ${m.giorni} giorni: ${c.viste} viste, ${buone} giuste o tenute su ${tutte} (${percento(m.precisione)}), di cui ${c.tardive} tardive, ${m.mancate.totale} mancate su ${su} (${percento(m.mancanza)})`
}

// — i moduli, caricati quando servono —
//
// `misura` è sincrona e la chiamano la rotta e la lettura, dove i moduli sono
// già caricati; qui si prendono dal registro di Node senza un import statico
// in testa, così la riga di comando può rifiutare `--dati` prima di aprire
// qualunque cosa. `caricaModuli` li carica una volta.

type Store = typeof import('./store.ts')
type FeedDati = typeof import('./feed-dati.ts')
type Mancate = typeof import('./mancate.ts')
type Rilevanza = typeof import('./rilevanza.ts')
let moduli: { store: Store; feedDati: FeedDati; mancate: Mancate; rilevanza: Rilevanza } | null = null

/** Carica i moduli del conto: lo fa la rotta, la lettura e la riga di comando prima di misurare. */
export async function caricaModuli(): Promise<void> {
  if (moduli) return
  const [store, feedDati, mancate, rilevanza] = await Promise.all([import('./store.ts'), import('./feed-dati.ts'), import('./mancate.ts'), import('./rilevanza.ts')])
  moduli = { store, feedDati, mancate, rilevanza }
}
function pronti() {
  if (!moduli) throw new Error('La misura non è pronta: prima caricaModuli().')
  return moduli
}
const requireStore = () => pronti().store
const requireFeedDati = () => pronti().feedDati
const requireMancate = () => pronti().mancate
const requireRilevanza = () => pronti().rilevanza

// — la riga di comando —

export type Argomenti = { conto: string | null; dati: string | null; giorni: number; json: boolean; aiuto: boolean; sbagliato: string | null }

/** Gli argomenti, letti senza aprire niente: si provano da soli. Un argomento che non si conosce (anche `--jev`) è un errore. */
export function leggiArgomenti(argv: string[]): Argomenti {
  const a: Argomenti = { conto: null, dati: null, giorni: 14, json: false, aiuto: false, sbagliato: null }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    const valore = () => { const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) { a.sbagliato = x; return null } i++; return v }
    if (x === '--conto') a.conto = valore()
    else if (x === '--dati') a.dati = valore()
    else if (x === '--giorni') { const v = valore(); const n = Number(v); if (v !== null && Number.isInteger(n) && n >= 1 && n <= 365) a.giorni = n; else a.sbagliato = x }
    else if (x === '--json') a.json = true
    else if (x === '--aiuto' || x === '--help' || x === '-h') a.aiuto = true
    else a.sbagliato = x
  }
  return a
}

/** La cartella vera di Myynd, che la riga di comando non deve mai aprire. */
export const CARTELLA_VERA = () => join(userInfo().homedir, '.myynd')

/**
 * `a` è `b`, o sta dentro? Con il separatore: `/x/copia2` non sta in `/x/copia`.
 * Sul Mac il disco non distingue le maiuscole, quindi nemmeno qui.
 */
export function dentroA(a: string, b: string): boolean {
  const piega = (s: string) => process.platform === 'darwin' || process.platform === 'win32' ? s.toLowerCase() : s
  const fra = relative(piega(resolve(b)), piega(resolve(a)))
  return fra === '' || (!fra.startsWith('..') && !isAbsolute(fra))
}

/**
 * `--dati` è la cartella vera, o sta dentro? Allora ci si ferma, prima di
 * aprire qualunque cosa. Un collegamento simbolico verso la cartella vera si
 * segue (`realpath` della copia, mai della cartella vera: quella non si tocca).
 */
export function eLaCartellaVera(dati: string): boolean {
  const vera = CARTELLA_VERA()
  if (dentroA(dati, vera)) return true
  try { return dentroA(realpathSync(dati), vera) } catch { return false }
}

const USO = `Uso: node server/misura-feed.ts --conto <email> --dati <copia> [--giorni 14] [--json]
  --conto   l'email del conto da misurare
  --dati    una COPIA della cartella dei dati (obbligatoria; mai ~/.myynd)
  --giorni  la finestra, in giorni (14)
  --json    la misura in JSON invece della tabella`

/** La misura in righe piane. */
export function tabella(m: Misura, en: boolean): string {
  const c = m.carte
  const r: string[] = []
  r.push(en ? `Window: ${m.giorni} days, ${giornoDi(m.da)} to ${giornoDi(m.a)}` : `Finestra: ${m.giorni} giorni, dal ${giornoDi(m.da)} al ${giornoDi(m.a)}`)
  r.push(en ? `Cards born ${c.nate}, seen ${c.viste} (${c.storiche} from before the seen column)` : `Carte nate ${c.nate}, viste ${c.viste} (${c.storiche} di prima della colonna vista)`)
  r.push(en
    ? `  acted ${c.agite} · replied from mail ${c.fuori} · already done ${c.tardive} · kept ${c.tenute}`
    : `  agite ${c.agite} · risposte dalla posta ${c.fuori} · già fatte ${c.tardive} · tenute ${c.tenute}`)
  r.push(en
    ? `  dismissed: old ${c.scartate.vecchia}, not mine ${c.scartate.non_mia}, unclear ${c.scartate.non_chiara}, no reason ${c.scartate.senza}`
    : `  scartate: vecchie ${c.scartate.vecchia}, non sue ${c.scartate.non_mia}, non chiare ${c.scartate.non_chiara}, senza ragione ${c.scartate.senza}`)
  r.push(en
    ? `  lapsed: time ${c.scadute.tempo}, date ${c.scadute.data}, cap ${c.scadute.tetto} · superseded ${c.superate}`
    : `  scadute: tempo ${c.scadute.tempo}, data ${c.scadute.data}, tetto ${c.scadute.tetto} · superate ${c.superate}`)
  r.push(en ? `Precision ${percento(m.precisione)} (closed cohort ${percento(m.precisioneChiusa)}), target 80%` : `Precisione ${percento(m.precisione)} (coorte chiusa ${percento(m.precisioneChiusa)}), obiettivo 80%`)
  r.push(en
    ? `Missed ${m.mancate.totale} (${m.mancate.risposte} replies, ${m.mancate.compiti} tasks) · miss rate ${percento(m.mancanza)}${m.copertura.postaInviata ? '' : ' (no sent mail indexed)'} · tasks ${percento(m.mancanzaCompiti)}, target under 10%`
    : `Mancate ${m.mancate.totale} (${m.mancate.risposte} risposte, ${m.mancate.compiti} compiti) · mancanza ${percento(m.mancanza)}${m.copertura.postaInviata ? '' : ' (posta inviata non indicizzata)'} · compiti ${percento(m.mancanzaCompiti)}, obiettivo sotto il 10%`)
  const fasi = Object.entries(m.mancate.perFase).sort((x, y) => y[1] - x[1])
  if (fasi.length) r.push((en ? '  where they were lost: ' : '  dove si sono perse: ') + fasi.map(([f, n]) => `${f} ${n}`).join(', '))
  if (m.perMittente.length) {
    r.push(en ? 'By sender (top 10 by cards seen):' : 'Per mittente (i dieci più visti):')
    for (const x of m.perMittente) r.push(`  ${x.mittente.padEnd(36)} ${en ? 'seen' : 'viste'} ${x.viste} · ${en ? 'right' : 'giuste'} ${x.giuste} · ${en ? 'wrong' : 'sbagliate'} ${x.sbagliate}`)
  }
  r.push(en ? 'By day:' : 'Per giorno:')
  for (const g of m.perGiorno) if (g.nate || g.viste || g.mancate) r.push(`  ${g.giorno}  ${en ? 'born' : 'nate'} ${g.nate} · ${en ? 'seen' : 'viste'} ${g.viste} · ${en ? 'right' : 'giuste'} ${g.giuste} · ${en ? 'wrong' : 'sbagliate'} ${g.sbagliate} · ${en ? 'missed' : 'mancate'} ${g.mancate}`)
  return r.join('\n')
}

async function main() {
  const a = leggiArgomenti(process.argv.slice(2))
  if (a.aiuto) { console.log(USO); return }
  if (a.sbagliato) { console.error(`Argomento che non conosco: ${a.sbagliato}\n\n${USO}`); process.exitCode = 2; return }
  if (!a.conto) { console.error(`Dimmi il conto: --conto <email>\n\n${USO}`); process.exitCode = 2; return }
  // la copia è obbligatoria, e la cartella vera non si apre: prima di ogni import
  if (!a.dati) { console.error(`Dimmi la copia dei dati: --dati <cartella>. Mai la cartella vera.\n\n${USO}`); process.exitCode = 2; return }
  if (eLaCartellaVera(a.dati)) { console.error(`--dati è la cartella vera di Myynd (${CARTELLA_VERA()}): la misura si fa su una copia.`); process.exitCode = 2; return }
  process.env.MYYND_DATI = resolve(a.dati)

  const [conti, chi, config, store, mancate] = await Promise.all([import('./conti.ts'), import('./chi.ts'), import('./config.ts'), import('./store.ts'), import('./mancate.ts')])
  await caricaModuli()
  await conti.avvia()
  await config.avvia()
  const cerco = a.conto.trim().toLowerCase()
  const id = conti.tutti().find(u => conti.conto(u)?.email === cerco) ?? null
  if (!id) {
    const tutti = conti.tutti().map(u => conti.conto(u)?.email).filter(Boolean)
    console.error(`Non c'è nessun conto ${a.conto} in ${config.RADICE}.` + (tutti.length ? ` Ci sono: ${tutti.join(', ')}` : ' Non c\'è nessun conto.'))
    process.exitCode = 2
    return
  }
  try {
    // la cartella del conto deve stare dentro la copia: conti.db copiato può
    // puntare ancora ai dati veri, e allora ci si ferma prima di leggere
    const dentro = chi.dentro(id, () => config.cartella())
    if (!dentroA(dentro, a.dati)) throw new Error('La cartella del conto sta fuori da --dati: mi fermo, per non toccare i dati veri.')
    const adesso = Date.now()
    const dal = new Date(adesso - a.giorni * GIORNO).toISOString()
    // senza Jev, senza modello, senza scrivere: le mancate si contano e basta
    const trovate = await chi.dentro(id, () => mancate.trova({ dal, adesso, jev: false }))
    const m = chi.dentro(id, () => misura(a.giorni, adesso, { mancate: trovate.mancate }))
    if (a.json) console.log(JSON.stringify(m, null, 2))
    else console.log(tabella(m, chi.dentro(id, () => config.lingua()) === 'en'))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  } finally {
    store.chiudiIndici()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
