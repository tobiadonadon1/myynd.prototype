// La misura della prova sui dati veri (P6, sezione 8): una riga di comando.
//
//   node --disable-warning=ExperimentalWarning server/valuta-prove.ts --dati <copia> [--ricette a,b] [--utente <id>]
//
// Gira solo su una COPIA dei dati (decisioni: «Real data»): senza `--dati`, o
// con la casa vera (~/.myynd), si rifiuta. Non accende giri di fondo né
// connettori: importa la prova e basta, fa girare le ricette scelte una alla
// volta e stampa, per ognuna, le volte, i risultati, le bozze, i gettoni, i
// secondi, il conto e l'accordo del giudice con le sue mosse e i suoi segni.

import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'

export function argomenti(argv: string[]): { dati: string | null; ricette: string[]; utente: string | null } {
  const val = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] ?? null : null }
  return {
    dati: val('--dati'),
    ricette: (val('--ricette') ?? '').split(',').map(x => x.trim()).filter(Boolean),
    utente: val('--utente')
  }
}

/** Perché no, o null se si può: la casa vera non si tocca mai. */
export function rifiuto(dati: string | null, casa = homedir()): string | null {
  if (!dati) return 'Serve --dati con una copia dei dati.'
  const d = resolve(dati)
  const vera = resolve(join(casa, '.myynd'))
  if (d === vera || d.startsWith(vera + '/')) return 'Questa è la cartella vera: serve una copia.'
  if (!existsSync(d)) return 'La cartella dei dati non esiste.'
  return null
}

async function principale() {
  const a = argomenti(process.argv.slice(2))
  const no = rifiuto(a.dati)
  if (no) { console.error(no); process.exit(2) }
  process.env.MYYND_DATI = resolve(a.dati!)
  const chi = await import('./chi.ts')
  const auto = await import('./automazioni.ts')
  const collaudo = await import('./collaudo.ts')
  const store = await import('./store.ts')
  const lavora = async () => {
    const tutte = auto.ricette().filter(r => !a.ricette.length || a.ricette.includes(r.id))
    if (!tutte.length) { console.error('Nessuna ricetta con questi id.'); return }
    for (const r of tutte) {
      const t0 = Date.now()
      const v = collaudo.avvia(r, 'editor')
      if (!v.id) { console.log(`${r.id} · ${v.stato}`); continue }
      await collaudo.finche(60 * 60_000)
      const p = store.prova(v.id)!
      const s = collaudo.vista(v.id)!
      console.log([
        r.id, p.stato, `volte ${p.occorrenze}`, `risultati ${s.risultati}`, `bozze ${s.bozze}`, `gettoni ${p.gettoni}`,
        `secondi ${Math.round((Date.now() - t0) / 1000)}`, `conto ${s.giusti}/${s.giudicati} (${s.esito ?? '-'})`, `tue ${s.tue}`
      ].join(' · '))
    }
    const m = collaudo.misura()
    const q = (x: { n: number; si: number }) => x.n ? `${x.si}/${x.n}` : '-'
    console.log(`accordo del giudice · ${m.accordo.quota === null ? '-' : Math.round(m.accordo.quota * 100) + '%'} · tuoi segni ${q(m.accordo.tuo)} · sue mosse ${q(m.accordo.mosse)}`)
    store.chiudiIndici()
  }
  await (a.utente ? chi.dentro(a.utente, lavora) : lavora())
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  principale().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
