// La valutazione del seguito sul modello vero: gli stessi dodici episodi delle
// prove (`seguito-episodi.ts`), ma la risposta la scrive il motore collegato.
// Si lancia a mano, mai dalle prove:
//
//   MYYND_VALUTA_URL=http://127.0.0.1:11434/v1 MYYND_VALUTA_MODELLO=qwen2.5:14b \
//     node --disable-warning=ExperimentalWarning server/valuta-seguito.ts
//
// Lavora in una cartella temporanea, mai nel profilo vero: il motore si dice
// con un fornitore compatibile (`MYYND_VALUTA_URL`, `MYYND_VALUTA_MODELLO`,
// `MYYND_VALUTA_CHIAVE` se serve), con l'account di Claude (`MYYND_VALUTA_ACCOUNT=1`),
// o con la chiave di Claude nell'ambiente.
// La casella e Slack sono finti: niente parte. Stampa, per episodio,
// «accettato» o cosa non va, e il conto in fondo. Gli episodi che provano la
// verifica contro una risposta sbagliata apposta girano col modello finto.
// Con `--finto` gira tutto col modello finto: serve a provare lo script.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-valuta-seguito-'))
process.env.MYYND_DATI = CASA

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const modello = await import('./modello.ts')
const episodi = await import('./seguito-episodi.ts')

const url = process.env.MYYND_VALUTA_URL
const base: Partial<import('./config.ts').Config> = url
  ? { motore: 'compatibile', compatibile: { url, modello: process.env.MYYND_VALUTA_MODELLO ?? 'qwen2.5:14b', ...(process.env.MYYND_VALUTA_CHIAVE ? { chiave: process.env.MYYND_VALUTA_CHIAVE } : {}) } } as never
  : process.env.MYYND_VALUTA_ACCOUNT ? { motore: 'claude', claudeCon: 'abbonamento' } as never : {}
const finto = process.argv.includes('--finto')
cfg.scrivi({ ...base, lingua: 'en' } as import('./config.ts').Config)
if (!finto && !modello.collegato()) {
  console.error('Nessun motore: dai MYYND_VALUTA_URL e MYYND_VALUTA_MODELLO (un fornitore compatibile), o la chiave di Claude nell\'ambiente.')
  rmSync(CASA, { recursive: true, force: true })
  process.exit(2)
}

const righe: { n: number; nome: string; motore: string; esito: string }[] = []
let accettati = 0
for (const [i, ep] of episodi.EPISODI.entries()) {
  const vero = !finto && !ep.soloFinto
  let esito: string
  try {
    const r = await episodi.esegui(ep, { casa: CASA, base, ...(vero ? { chiedi: (o: unknown) => modello.chiediJSON(o as Parameters<typeof modello.chiediJSON>[0]) } : {}) })
    const guai = ep.controlla(r, episodi.tempi())
    esito = guai.length ? `FAILED: ${guai.join('; ')}` : 'accepted'
    if (!guai.length) accettati++
    if (vero && r.pacchetto?.risposta) console.log(`\n— ${ep.nome}\n${r.pacchetto.risposta.testo}\n${r.pacchetto.problemi.length ? `problems: ${r.pacchetto.problemi.join(' | ')}` : ''}`)
  } catch (e) {
    esito = `FAILED: ${e instanceof Error ? e.message : e}`
  }
  righe.push({ n: i + 1, nome: ep.nome, motore: vero ? 'real' : 'fake', esito })
}

console.log('\n| # | episode | model | result |\n|---|---|---|---|')
for (const r of righe) console.log(`| ${r.n} | ${r.nome} | ${r.motore} | ${r.esito} |`)
console.log(`\n${accettati}/${righe.length} accepted`)
store.chiudiIndici()
rmSync(CASA, { recursive: true, force: true })
process.exit(accettati === righe.length ? 0 : 1)
