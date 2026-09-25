// Il resoconto su una copia dei dati, settimana per settimana (P9).
//
//   npm run prova:resoconto -- --conto <email o id> --dati <copia> [--dal AAAA-MM-GG] [--json]
//
// Stampa solo generi, chiavi, prove e minuti: nessun oggetto, destinatario o
// titolo sullo schermo. Le voci intere (titoli compresi) vanno in
// <dati>/valutazioni/resoconto-<data>.json, dentro la copia. Non accende giri
// né connettori, non importa index.ts, e rifiuta la cartella vera prima di
// aprire qualunque cosa: `--dati` deve valere prima che config.ts legga
// MYYND_DATI, quindi gli import dei moduli del conto sono dinamici.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARTELLA_VERA, dentroA, eLaCartellaVera } from './misura-feed.ts'

export type Argomenti = { conto: string | null; dati: string | null; dal: string | null; json: boolean; aiuto: boolean; sbagliato: string | null }

/** Gli argomenti, letti senza aprire niente. Un argomento che non si conosce è un errore. */
export function leggiArgomenti(argv: string[]): Argomenti {
  const a: Argomenti = { conto: null, dati: null, dal: null, json: false, aiuto: false, sbagliato: null }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!
    const valore = () => { const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) { a.sbagliato = x; return null } i++; return v }
    if (x === '--conto') a.conto = valore()
    else if (x === '--dati') a.dati = valore()
    else if (x === '--dal') { const v = valore(); if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) a.dal = v; else a.sbagliato = x }
    else if (x === '--json') a.json = true
    else if (x === '--aiuto' || x === '--help' || x === '-h') a.aiuto = true
    else a.sbagliato = x
  }
  return a
}

const USO = `Uso: npm run prova:resoconto -- --conto <email o id> --dati <copia> [--dal AAAA-MM-GG] [--json]
  --conto   l'email o l'id del conto
  --dati    una COPIA della cartella dei dati (obbligatoria; mai ~/.myynd)
  --dal     da quale giorno (di serie: da quando ha cominciato)
  --json    le righe in JSON invece che in colonne`

async function main() {
  const a = leggiArgomenti(process.argv.slice(2))
  if (a.aiuto) { console.log(USO); return }
  if (a.sbagliato) { console.error(`Argomento che non conosco: ${a.sbagliato}\n\n${USO}`); process.exitCode = 2; return }
  if (!a.dati) { console.error(`Dimmi la copia dei dati: --dati <cartella>. Mai la cartella vera.\n\n${USO}`); process.exitCode = 2; return }
  if (eLaCartellaVera(a.dati)) { console.error(`--dati è la cartella vera di Myynd (${CARTELLA_VERA()}): il resoconto si prova su una copia.`); process.exitCode = 2; return }
  if (!a.conto) { console.error(`Dimmi il conto: --conto <email o id>\n\n${USO}`); process.exitCode = 2; return }
  process.env.MYYND_DATI = resolve(a.dati)

  const [conti, chi, config, store, fuso, r, rc] = await Promise.all([
    import('./conti.ts'), import('./chi.ts'), import('./config.ts'), import('./store.ts'), import('./fuso.ts'), import('./resoconto.ts'), import('./resoconto-conta.ts')
  ])
  await conti.avvia()
  await config.avvia()
  await r.prepara()
  const cerco = a.conto.trim().toLowerCase()
  const id = conti.tutti().find(u => u === a.conto || conti.conto(u)?.email === cerco) ?? null
  if (!id) { console.error(`Non c'è nessun conto ${a.conto} in ${config.RADICE}.`); process.exitCode = 2; return }
  try {
    chi.dentro(id, () => {
      const cartella = config.cartella()
      if (!dentroA(cartella, a.dati!)) throw new Error('La cartella del conto sta fuori da --dati: mi fermo, per non toccare i dati veri.')
      const f = fuso.fusoDi()
      const ora = new Date()
      const dal = a.dal ? fuso.istante(...(a.dal.split('-').map(Number) as [number, number, number]), 0, f) : new Date(r.inizio())
      // i lunedì, dal primo fino a questo
      const lunedi: Date[] = [new Date(r.settimana(dal, 'questa', f).da)]
      while (true) {
        const p = fuso.parti(lunedi[lunedi.length - 1]!, f)
        const prossimo = fuso.istante(p.anno, p.mese, p.giorno + 7, 0, f)
        if (prossimo.getTime() >= ora.getTime()) break
        lunedi.push(prossimo)
      }
      const m = r.materiale(lunedi[0]!.toISOString(), ora.toISOString())
      const settimane = lunedi.map((l, i) => {
        const da = l.toISOString(), fino = (lunedi[i + 1] ?? ora).toISOString()
        const c = rc.conta(m, { da, a: fino, fuso: f })
        return { da, a: fino, ...rc.numeri(c.voci), voci: c.voci, esclusi: c.esclusi, automazioni: c.automazioni }
      })
      if (a.json) {
        console.log(JSON.stringify(settimane.map(s => ({ da: s.da, a: s.a, numeri: s.numeri, voci: s.voci.map(v => ({ genere: v.genere, chiave: v.chiave, prova: v.prova, minuti: v.minuti })), esclusi: s.esclusi })), null, 2))
      } else {
        for (const s of settimane) {
          const n = s.numeri
          console.log(`\n${fuso.giornoIn(new Date(s.da), f)}  mail ${n.mail} · lavori ${n.lavori} · scadenze ${n.scadenze} · segnalate ${n.segnalate} · minuti ${n.minuti}`)
          for (const v of s.voci) console.log(`  ${v.genere.padEnd(10)} ${v.chiave.padEnd(34)} ${v.prova.padEnd(20)} ${v.minuti}`)
          const perche = new Map<string, number>()
          for (const e of s.esclusi) perche.set(e.perche, (perche.get(e.perche) ?? 0) + 1)
          for (const [p, k] of perche) console.log(`  esclusi · ${p}: ${k}`)
          for (const x of s.automazioni) console.log(`  automazione ${x.id}: usate ${x.usate}, prodotte ${x.prodotte}`)
        }
        console.log('\nI risultati nel vassoio delle automazioni (esiti) non sono righe: non si contano.')
      }
      const cartellaValutazioni = join(resolve(a.dati!), 'valutazioni')
      mkdirSync(cartellaValutazioni, { recursive: true })
      const file = join(cartellaValutazioni, `resoconto-${fuso.giornoIn(ora, f)}.json`)
      writeFileSync(file, JSON.stringify({ conto: id, fatto: ora.toISOString(), settimane }, null, 2), { mode: 0o600 })
      console.log(`\nLe voci intere: ${file}`)
    })
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  } finally {
    store.chiudiIndici()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
