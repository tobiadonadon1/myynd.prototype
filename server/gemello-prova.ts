// La prova del gemello sul passato: quanto ci avrebbe preso, giorno per giorno.
//
//   node --disable-warning=ExperimentalWarning server/gemello-prova.ts --dati <copia> --conto <id> [--dal AAAA-MM-GG] [--al AAAA-MM-GG] [--ora 08:00]
//   npm run prova:gemello -- --dati <copia> --conto <id>
//
// Vuole una **copia** dei dati (`--dati`), e rifiuta la cartella vera: non
// apre `~/.myynd`, non la copia, non ci scrive. La copia la fa chi guida, con
// le credenziali tolte (decisioni.md, «Real data»). Nessuna rete, nessun
// modello: si ricostruisce il registro della posta dalla copia, e per ogni
// giorno D si fanno le affermazioni alle `--ora` con le sole cose di prima,
// poi si guardano le risposte fra t0 e la fine di D.
//
// Le distorsioni note, stampate in fondo: la posta mandata c'è solo da quando
// la cartella Inviata è nell'indice; la posta archiviata prima che il registro
// esistesse manca (spinge verso «non risponde»); la storia dei compiti è
// approssimata (si conosce solo lo stato di adesso); niente storia delle app.
//
// Gli import sono dinamici: `--dati` deve entrare in MYYND_DATI prima che
// `config.ts` legga la radice (lo stesso schema di valuta-feed.ts).

import { homedir } from 'node:os'
import { resolve, join, sep, dirname, basename } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import type { Candidato } from './previsioni.ts'

export type Argomenti = { dati?: string; conto?: string; dal?: string; al?: string; ora?: string }

export function leggiArgomenti(argv: string[]): Argomenti {
  const a: Argomenti = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!
    const v = argv[i + 1]
    if (k === '--dati' && v) { a.dati = v; i++ }
    else if (k === '--conto' && v) { a.conto = v; i++ }
    else if (k === '--dal' && v) { a.dal = v; i++ }
    else if (k === '--al' && v) { a.al = v; i++ }
    else if (k === '--ora' && v) { a.ora = v; i++ }
  }
  return a
}

/** La cartella vera, o una dentro di lei: mai. Senza aprire e senza creare niente. */
/**
 * Il percorso com'è davvero: i collegamenti simbolici risolti, e sul Mac
 * (dove il disco non distingue le maiuscole) tutto minuscolo. Un percorso che
 * non esiste resta com'è, senza aprire né creare niente.
 */
function reale(p: string): string {
  const assoluto = resolve(p)
  // si risolve il pezzo che esiste (anche solo la casa) e si riattacca il resto: `~/.myynd/utenti/nuovo` resta vietata
  let base = assoluto
  const resto: string[] = []
  while (!existsSync(base) && dirname(base) !== base) { resto.unshift(basename(base)); base = dirname(base) }
  let r = assoluto
  try { r = join(realpathSync.native(base), ...resto) } catch { /* resta com'è */ }
  return process.platform === 'darwin' ? r.toLowerCase() : r
}

export function cartellaVietata(dati: string, casa = homedir(), radicePredefinita = join(homedir(), '.myynd')): string | null {
  const d = reale(dati)
  const vera = reale(resolve(casa, '.myynd'))
  if (d === vera || d.startsWith(vera + sep)) return 'è la cartella vera (~/.myynd) o una dentro di lei'
  const pre = reale(radicePredefinita)
  if (d === pre || d.startsWith(pre + sep)) return 'è la radice di serie'
  return null
}

export type Riga = { giorno: string; genere: string; ref: string; p: number; esito: 'giusta' | 'sbagliata' | 'annullata'; base: boolean; spinta: boolean }
type Secchio = { da: number; a: number; n: number; giuste: number }
export type Rapporto = {
  conto: string; dal: string; al: string; ora: string; giorni: number
  /** Per genere (posta.risponde, posta.non_risponde, compito.chiude, compito.slitta), non per famiglia. */
  perGenere: Record<string, { affermazioni: number; alGiorno: number; giuste: number; base: number; brier: number; calibrazione: Secchio[] }>
  totale: { affermazioni: number; giuste: number; base: number; lift: number; brier: number; calibrazione: Secchio[] }
  /** Sezione 8: i giorni attivi (almeno cinque candidate), le affermazioni per giorno attivo, la quota di giorni attivi con almeno cinque. */
  copertura: { giorniAttivi: number; alGiorno: number; quotaConCinque: number }
  /** Il Brier giorno per giorno. */
  perGiorno: { giorno: string; candidati: number; affermazioni: number; giuste: number; brier: number | null }[]
  /** Con una carta del feed sulla stessa mail, e senza. */
  spinta: { con: { n: number; giuste: number }; senza: { n: number; giuste: number } }
  distorsioni: string[]
}

export const DISTORSIONI = [
  'La posta mandata c’è solo da quando la cartella Inviata è nell’indice: prima, ogni mail sembra senza risposta.',
  'La posta risposta e archiviata prima che il registro esistesse manca: spinge verso «non risponde».',
  'La storia dei compiti è approssimata: si conosce solo lo stato di adesso, non quello di quel giorno.',
  'Niente storia delle app: nessuna affermazione sul progetto del giorno.'
]

const brierDi = (xs: Riga[]) => xs.length ? xs.reduce((s, r) => s + (r.p - (r.esito === 'giusta' ? 1 : 0)) ** 2, 0) / xs.length : 0
const secchi = (xs: Riga[]): Secchio[] => [0, 0.2, 0.4, 0.6, 0.8].map(x => {
  const dentro = xs.filter(r => r.p >= x && (x === 0.8 || r.p < x + 0.2))
  return { da: x, a: x + 0.2, n: dentro.length, giuste: dentro.filter(r => r.esito === 'giusta').length }
})

export function riassumi(righe: Riga[], o: { conto: string; dal: string; al: string; ora: string; candidatiPerGiorno?: Record<string, number> }): Rapporto {
  const { candidatiPerGiorno = {}, ...testata } = o
  const decise = righe.filter(r => r.esito !== 'annullata')
  const giorniTutti = new Set([...righe.map(r => r.giorno), ...Object.keys(candidatiPerGiorno)])
  const giorni = giorniTutti.size
  const perGenere: Rapporto['perGenere'] = {}
  const generi = new Map<string, Riga[]>()
  for (const r of decise) { const l = generi.get(r.genere) ?? []; l.push(r); generi.set(r.genere, l) }
  for (const [g, xs] of [...generi].sort((a, b) => a[0].localeCompare(b[0]))) {
    perGenere[g] = {
      affermazioni: xs.length, alGiorno: giorni ? xs.length / giorni : 0,
      giuste: xs.filter(r => r.esito === 'giusta').length / xs.length, base: xs.filter(r => r.base).length / xs.length, brier: brierDi(xs),
      calibrazione: secchi(xs)
    }
  }
  const giuste = decise.filter(r => r.esito === 'giusta').length
  const base = decise.filter(r => r.base).length
  const perGiorno = [...giorniTutti].sort().map(giorno => {
    const mie = righe.filter(r => r.giorno === giorno), dec = mie.filter(r => r.esito !== 'annullata')
    return { giorno, candidati: candidatiPerGiorno[giorno] ?? mie.length, affermazioni: mie.length, giuste: dec.filter(r => r.esito === 'giusta').length, brier: dec.length ? brierDi(dec) : null }
  })
  const attivi = perGiorno.filter(g => g.candidati >= 5)
  const con = decise.filter(r => r.spinta), senza = decise.filter(r => !r.spinta)
  return {
    ...testata, giorni, perGenere,
    totale: { affermazioni: decise.length, giuste: decise.length ? giuste / decise.length : 0, base: decise.length ? base / decise.length : 0, lift: decise.length ? (giuste - base) / decise.length : 0, brier: brierDi(decise), calibrazione: secchi(decise) },
    copertura: {
      giorniAttivi: attivi.length,
      alGiorno: attivi.length ? attivi.reduce((s, g) => s + g.affermazioni, 0) / attivi.length : 0,
      quotaConCinque: attivi.length ? attivi.filter(g => g.affermazioni >= 5).length / attivi.length : 0
    },
    perGiorno,
    spinta: { con: { n: con.length, giuste: con.filter(r => r.esito === 'giusta').length }, senza: { n: senza.length, giuste: senza.filter(r => r.esito === 'giusta').length } },
    distorsioni: DISTORSIONI
  }
}

export function stampa(r: Rapporto): string {
  const pc = (x: number) => `${Math.round(x * 100)}%`
  const cal = (c: Secchio[]) => c.map(x => `${x.n ? pc(x.giuste / x.n) : '-'}/${x.n}`).join(' ')
  const righe = [`gemello · ${r.conto} · dal ${r.dal} al ${r.al} alle ${r.ora} · ${r.giorni} giorni`]
  righe.push('genere              affermazioni  al giorno  giuste  base  lift    brier  calibrazione')
  for (const [g, x] of Object.entries(r.perGenere)) {
    righe.push(`${g.padEnd(19)} ${String(x.affermazioni).padStart(12)}  ${x.alGiorno.toFixed(1).padStart(9)}  ${pc(x.giuste).padStart(6)}  ${pc(x.base).padStart(4)}  ${pc(x.giuste - x.base).padStart(5)}  ${x.brier.toFixed(2).padStart(5)}  ${cal(x.calibrazione)}`)
  }
  righe.push(`${'totale'.padEnd(19)} ${String(r.totale.affermazioni).padStart(12)}  ${' '.repeat(9)}  ${pc(r.totale.giuste).padStart(6)}  ${pc(r.totale.base).padStart(4)}  ${pc(r.totale.lift).padStart(5)}  ${r.totale.brier.toFixed(2).padStart(5)}  ${cal(r.totale.calibrazione)}`)
  const c = r.copertura
  righe.push(`copertura: ${c.giorniAttivi} giorni attivi (almeno cinque candidate) · ${c.alGiorno.toFixed(1)} affermazioni al giorno attivo · ${pc(c.quotaConCinque)} dei giorni attivi con almeno cinque (obiettivo 100%)`)
  const brier = r.perGiorno.map(g => g.brier).filter((b): b is number => b !== null).sort((a, b) => a - b)
  if (brier.length) righe.push(`brier per giorno: migliore ${brier[0]!.toFixed(2)} · mediana ${brier[Math.floor(brier.length / 2)]!.toFixed(2)} · peggiore ${brier[brier.length - 1]!.toFixed(2)} (giorno per giorno nel file)`)
  const s = r.spinta
  righe.push(`con una carta del feed: giuste ${s.con.giuste} su ${s.con.n} · senza: giuste ${s.senza.giuste} su ${s.senza.n}`)
  righe.push('Distorsioni note:')
  for (const d of r.distorsioni) righe.push(`  · ${d}`)
  return righe.join('\n')
}

export async function esegui(a: Argomenti, oggi = new Date()): Promise<{ rapporto: Rapporto; file: string }> {
  if (!a.dati) throw new Error('Serve --dati con una copia dei dati: mai la cartella vera.')
  const vietata = cartellaVietata(a.dati)
  if (vietata) throw new Error(`--dati ${vietata}: serve una copia.`)
  if (!existsSync(a.dati)) throw new Error('La copia in --dati non esiste.')
  if (!a.conto) throw new Error('Serve --conto.')
  process.env.MYYND_DATI = resolve(a.dati)
  // niente rete, mai: chi la chiede qui dentro è un errore
  globalThis.fetch = (() => { throw new Error('La prova del gemello non usa la rete.') }) as typeof fetch

  const chi = await import('./chi.ts')
  const conti = await import('./conti.ts')
  const store = await import('./store.ts')
  const fuso = await import('./fuso.ts')
  const segnali = await import('./segnali.ts')
  const previsioni = await import('./previsioni.ts')
  const gemello = await import('./gemello.ts')
  await conti.avvia()
  if (!conti.conto(a.conto)) throw new Error('Non trovo quel conto nella copia.')
  const conto = a.conto
  const ora = /^\d{2}:\d{2}$/.test(a.ora ?? '') ? a.ora! : '08:00'
  const GIORNO = 86_400_000

  const righe: Riga[] = []
  const candidatiPerGiorno: Record<string, number> = {}
  type CompitoRiga = { id: string; testo: string; priorita: string | null; stato: string; creato: string; chiuso: string | null; giorno: string; progetto: string | null; sparito: string | null }
  const esito = chi.dentro(conto, () => {
    // il registro fino in fondo, in una chiamata: qui non c'è nessuno da non fermare
    segnali.raccogliPosta(oggi, { tutto: true })
    const tutteArrivate = segnali.arrivate('1970-01-01T00:00:00.000Z', oggi.toISOString())
    const tutteInviate = segnali.inviate('1970-01-01T00:00:00.000Z', oggi.toISOString())
    const miei = segnali.mieiIndirizzi()
    const primaInviata = tutteInviate.reduce((m, s) => (s.quando < m ? s.quando : m), oggi.toISOString())
    const dal = a.dal ?? fuso.giornoIn(new Date(Math.max(Date.parse(primaInviata) + 7 * GIORNO, oggi.getTime() - 60 * GIORNO)))
    const al = a.al ?? gemello.giornoPrima(fuso.giornoIn(oggi))
    const [hh, mm] = ora.split(':').map(Number) as [number, number]
    const perInviata = new Map(tutteInviate.map(s => [s.id, s.quando]))
    const tutteLeCoppie = segnali.coppieRisposta(tutteArrivate, tutteInviate, miei)
    // le carte del feed sulla stessa mail: la spinta
    const spinte = new Set((store.default.prepare('SELECT doc FROM feed WHERE doc IS NOT NULL').all() as { doc: string }[]).map(r => r.doc))
    // i compiti com'erano quel giorno, per quanto si può dire dallo stato di adesso (distorsione nota)
    const compiti = store.default.prepare('SELECT id, testo, priorita, stato, creato, chiuso, giorno, progetto, sparito FROM compiti WHERE giorno IS NOT NULL').all() as CompitoRiga[]
    const chiusoIl = (c: CompitoRiga) => (c.stato === 'fatto' && c.chiuso ? fuso.giornoIn(new Date(c.chiuso)) : null)
    // come nel giro vero: una mail si afferma una volta sola
    const giaDette = new Set<string>()
    for (let g = dal; g <= al; g = fuso.giornoIn(new Date(gemello.inizioGiorno(g).getTime() + GIORNO + 12 * 3_600_000))) {
      const t0 = new Date(gemello.inizioGiorno(g).getTime() + hh * 3_600_000 + mm * 60_000)
      const t0Iso = t0.toISOString()
      const fine = gemello.fineGiorno(g)
      const candidati: Candidato[] = []
      const inviatePrima = tutteInviate.filter(s => Date.parse(s.quando) < t0.getTime())
      if (inviatePrima.length) {
        const coppiePrima = segnali.coppieRisposta(tutteArrivate, inviatePrima, miei)
        candidati.push(...previsioni.candidatiPosta(tutteArrivate, coppiePrima, t0, fine).filter(c => !giaDette.has(c.ref)))
      }
      // le righe di quel giorno che alle t0 erano già scritte e ancora aperte
      const aperti = compiti.filter(c => c.giorno === g && c.creato < t0Iso && (!c.chiuso || c.chiuso >= t0Iso) && (!c.sparito || c.sparito >= t0Iso))
      const da30 = gemello.giornoPrima(g, 30)
      const storia = compiti.filter(c => c.giorno >= da30 && c.giorno < g && c.creato < t0Iso)
      const storia30 = { pianificati: storia.length, chiusiInGiornata: storia.filter(c => chiusoIl(c) === c.giorno).length }
      candidati.push(...previsioni.candidatiCompiti(aperti.map(c => ({ id: c.id, testo: c.testo, priorita: c.priorita, stato: c.stato, creato: c.creato, progetto: c.progetto })), storia30, t0))
      candidatiPerGiorno[g] = candidati.length
      const { scelte } = previsioni.scegli(candidati)
      for (const c of scelte) {
        let e: 'giusta' | 'sbagliata'
        let spinta = false
        if (c.genere.startsWith('posta.')) {
          giaDette.add(c.ref)
          e = previsioni.esitoPosta(c, tutteLeCoppie, t0, fine, id => perInviata.get(id) ?? null)
          spinta = typeof c.dati.doc === 'string' && spinte.has(c.dati.doc)
        } else {
          const k = compiti.find(x => x.id === c.ref)
          const chiuso = !!k && chiusoIl(k) === g
          e = (c.genere === 'compito.chiude') === chiuso ? 'giusta' : 'sbagliata'
        }
        righe.push({ giorno: g, genere: c.genere, ref: c.ref, p: c.p, esito: e, base: previsioni.base({ genere: c.genere, ref: c.ref, dati: {} }, { esito: e }), spinta })
      }
    }
    return { dal, al }
  })
  store.chiudiIndici()
  const rapporto = riassumi(righe, { conto, dal: esito.dal, al: esito.al, ora, candidatiPerGiorno })
  const dove = join(resolve(a.dati), 'valutazioni')
  mkdirSync(dove, { recursive: true })
  const file = join(dove, `gemello-${fuso.giornoIn(oggi)}.json`)
  writeFileSync(file, JSON.stringify({ ...rapporto, righe }, null, 2))
  return { rapporto, file }
}

const questoFile = process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname
if (questoFile) {
  esegui(leggiArgomenti(process.argv.slice(2)))
    .then(({ rapporto, file }) => { console.log(stampa(rapporto)); console.log(`scritto in ${file}`) })
    .catch(e => { console.error(`gemello-prova · ${e instanceof Error ? e.message : e}`); process.exit(1) })
}
