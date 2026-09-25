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
import { resolve, join, sep } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

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
export function cartellaVietata(dati: string, casa = homedir(), radicePredefinita = join(homedir(), '.myynd')): string | null {
  const d = resolve(dati)
  const vera = resolve(casa, '.myynd')
  if (d === vera || d.startsWith(vera + sep)) return 'è la cartella vera (~/.myynd) o una dentro di lei'
  const pre = resolve(radicePredefinita)
  if (d === pre || d.startsWith(pre + sep)) return 'è la radice di serie'
  return null
}

export type Riga = { giorno: string; genere: string; ref: string; p: number; esito: 'giusta' | 'sbagliata' | 'annullata'; base: boolean }
export type Rapporto = {
  conto: string; dal: string; al: string; ora: string; giorni: number
  perGenere: Record<string, { affermazioni: number; alGiorno: number; giuste: number; base: number; brier: number; calibrazione: { da: number; a: number; n: number; giuste: number }[] }>
  totale: { affermazioni: number; giuste: number; base: number; lift: number; brier: number }
  distorsioni: string[]
}

export const DISTORSIONI = [
  'La posta mandata c’è solo da quando la cartella Inviata è nell’indice: prima, ogni mail sembra senza risposta.',
  'La posta risposta e archiviata prima che il registro esistesse manca: spinge verso «non risponde».',
  'La storia dei compiti è approssimata: si conosce solo lo stato di adesso, non quello di quel giorno.',
  'Niente storia delle app: nessuna affermazione sul progetto del giorno.'
]

export function riassumi(righe: Riga[], o: { conto: string; dal: string; al: string; ora: string }): Rapporto {
  const decise = righe.filter(r => r.esito !== 'annullata')
  const giorni = new Set(righe.map(r => r.giorno)).size
  const perGenere: Rapporto['perGenere'] = {}
  const famiglie = new Map<string, Riga[]>()
  for (const r of decise) { const f = r.genere.split('.')[0]!; const l = famiglie.get(f) ?? []; l.push(r); famiglie.set(f, l) }
  const brier = (xs: Riga[]) => xs.length ? xs.reduce((s, r) => s + (r.p - (r.esito === 'giusta' ? 1 : 0)) ** 2, 0) / xs.length : 0
  for (const [f, xs] of famiglie) {
    perGenere[f] = {
      affermazioni: xs.length, alGiorno: giorni ? xs.length / giorni : 0,
      giuste: xs.filter(r => r.esito === 'giusta').length / xs.length, base: xs.filter(r => r.base).length / xs.length, brier: brier(xs),
      calibrazione: [0, 0.2, 0.4, 0.6, 0.8].map(x => {
        const dentro = xs.filter(r => r.p >= x && (x === 0.8 || r.p < x + 0.2))
        return { da: x, a: x + 0.2, n: dentro.length, giuste: dentro.filter(r => r.esito === 'giusta').length }
      })
    }
  }
  const giuste = decise.filter(r => r.esito === 'giusta').length
  const base = decise.filter(r => r.base).length
  return {
    ...o, giorni, perGenere,
    totale: { affermazioni: decise.length, giuste: decise.length ? giuste / decise.length : 0, base: decise.length ? base / decise.length : 0, lift: decise.length ? (giuste - base) / decise.length : 0, brier: brier(decise) },
    distorsioni: DISTORSIONI
  }
}

export function stampa(r: Rapporto): string {
  const pc = (x: number) => `${Math.round(x * 100)}%`
  const righe = [`gemello · ${r.conto} · dal ${r.dal} al ${r.al} alle ${r.ora} · ${r.giorni} giorni`]
  righe.push('genere        affermazioni  al giorno  giuste  base  lift    brier  calibrazione')
  for (const [g, x] of Object.entries(r.perGenere)) {
    const cal = x.calibrazione.map(c => `${c.n ? pc(c.giuste / c.n) : '-'}/${c.n}`).join(' ')
    righe.push(`${g.padEnd(13)} ${String(x.affermazioni).padStart(12)}  ${x.alGiorno.toFixed(1).padStart(9)}  ${pc(x.giuste).padStart(6)}  ${pc(x.base).padStart(4)}  ${pc(x.giuste - x.base).padStart(5)}  ${x.brier.toFixed(2).padStart(5)}  ${cal}`)
  }
  righe.push(`totale        ${String(r.totale.affermazioni).padStart(12)}  ${' '.repeat(9)}  ${pc(r.totale.giuste).padStart(6)}  ${pc(r.totale.base).padStart(4)}  ${pc(r.totale.lift).padStart(5)}  ${r.totale.brier.toFixed(2).padStart(5)}`)
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
  const esito = chi.dentro(conto, () => {
    segnali.raccogliPosta(oggi)
    const tutteArrivate = segnali.arrivate('1970-01-01T00:00:00.000Z', oggi.toISOString())
    const tutteInviate = segnali.inviate('1970-01-01T00:00:00.000Z', oggi.toISOString())
    const miei = segnali.mieiIndirizzi()
    const primaInviata = tutteInviate.reduce((m, s) => (s.quando < m ? s.quando : m), oggi.toISOString())
    const dal = a.dal ?? fuso.giornoIn(new Date(Math.max(Date.parse(primaInviata) + 7 * GIORNO, oggi.getTime() - 60 * GIORNO)))
    const al = a.al ?? gemello.giornoPrima(fuso.giornoIn(oggi))
    const [hh, mm] = ora.split(':').map(Number) as [number, number]
    const perInviata = new Map(tutteInviate.map(s => [s.id, s.quando]))
    const tutteLeCoppie = segnali.coppieRisposta(tutteArrivate, tutteInviate, miei)
    // come nel giro vero: una mail si afferma una volta sola
    const giaDette = new Set<string>()
    for (let g = dal; g <= al; g = fuso.giornoIn(new Date(gemello.inizioGiorno(g).getTime() + GIORNO + 12 * 3_600_000))) {
      const t0 = new Date(gemello.inizioGiorno(g).getTime() + hh * 3_600_000 + mm * 60_000)
      const fine = gemello.fineGiorno(g)
      const inviatePrima = tutteInviate.filter(s => Date.parse(s.quando) < t0.getTime())
      if (!inviatePrima.length) continue
      const coppiePrima = segnali.coppieRisposta(tutteArrivate, inviatePrima, miei)
      const candidati = previsioni.candidatiPosta(tutteArrivate, coppiePrima, t0, fine).filter(c => !giaDette.has(c.ref))
      const { scelte } = previsioni.scegli(candidati)
      for (const c of scelte) {
        giaDette.add(c.ref)
        const e = previsioni.esitoPosta(c, tutteLeCoppie, t0, fine, id => perInviata.get(id) ?? null)
        righe.push({ giorno: g, genere: c.genere, ref: c.ref, p: c.p, esito: e, base: previsioni.base({ genere: c.genere, ref: c.ref, dati: {} }, { esito: e }) })
      }
    }
    return { dal, al }
  })
  store.chiudiIndici()
  const rapporto = riassumi(righe, { conto, dal: esito.dal, al: esito.al, ora })
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
