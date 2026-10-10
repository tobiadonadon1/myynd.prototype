// Real-model quality test of Myynd on invented data.
// Runs Myynd's own server modules against a throwaway data folder, with the
// Claude account as the engine. Nothing of the user's real data is read: no
// Mac-files source, no mail account, auto-enabled sources marked as handled.
//
//   MYYND_DATI=<tmp> node --disable-warning=ExperimentalWarning esegui.ts <repo-copy> <out.json>

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [repo, uscita] = process.argv.slice(2)
if (!process.env.MYYND_DATI || process.env.MYYND_DATI.includes('.myynd')) throw new Error('MYYND_DATI must be a throwaway folder')
const S = join(repo, 'server')
const dati = await import(join(process.cwd(), process.env.DATI ?? 'dati.mjs'))
const cfg = await import(join(S, 'config.ts'))
const store = await import(join(S, 'store.ts'))
const claude = await import(join(S, 'claude.ts'))
const compiti = await import(join(S, 'compiti.ts'))
const mod = await import(join(S, 'modello.ts'))

cfg.scrivi({
  nome: 'Alex Rivera', ruolo: 'Founder, Northwind Studio', lingua: 'en', onboarding: true, giro: true,
  claudeCon: 'abbonamento', abbonamento: { attivo: true }, motore: 'claude',
  modelli: { casa: 'claude-haiku-5-5', media: 'claude-sonnet-5-5', frontiera: 'claude-sonnet-5-5' },
  accesiDaSoli: ['conversazioni', 'x'], autonomia: 'preparare', fuso: 'Europe/Rome'
} as never)
store.salvaDocumenti([...dati.INBOX, ...dati.INVIATE, ...dati.FILE])

const risultato: Record<string, unknown> = { quando: new Date().toISOString(), puoLeggere: mod.puoLeggere(), motore: mod.motoreDelLavoro()?.nome ?? null }

// 1. Finding what needs Alex
const t0 = Date.now()
const voci = await claude.generaFeed(dati.INBOX)
const presi = new Set(voci.map((v: { doc?: string }) => v.doc).filter(Boolean))
const daFare = Object.keys(dati.DA_FARE)
const veri = daFare.filter(id => presi.has(id))
const falsi = [...presi].filter(id => !daFare.includes(id as string))
risultato.feed = {
  secondi: Math.round((Date.now() - t0) / 1000),
  carte: voci.map((v: { doc?: string; titolo?: string; testo?: string; tipo?: string }) => ({ doc: v.doc, tipo: v.tipo, titolo: v.titolo, testo: v.testo })),
  trovate: veri.length, daTrovare: daFare.length, mancate: daFare.filter(id => !presi.has(id)), falsePositive: falsi,
  precisione: presi.size ? veri.length / presi.size : null, richiamo: veri.length / daFare.length,
}
console.log('FEED', JSON.stringify(risultato.feed, null, 1))

// 2. Doing the follow-through: three replies drafted end to end by the real worker
const giri = [
  { doc: 'posta:INBOX:101', testo: 'Reply to Nora with the revised pilot quote' },
  { doc: 'posta:INBOX:105', testo: 'Send Jonas the pricing one-pager' },
  { doc: 'posta:INBOX:103', testo: 'Reply to Marco to schedule the interview' },
]
const bozze = []
for (const [i, g] of giri.entries()) {
  const id = `eval-${i}`
  store.scriviCompito({ id, testo: g.testo, doc: g.doc, quando: 'oggi', ordine: `e${i}` } as never)
  const t = Date.now()
  compiti.affida(id, 'bozza', false)
  let c = store.compito(id)
  while (Date.now() - t < 8 * 60_000) {
    await new Promise(r => setTimeout(r, 3000))
    c = store.compito(id)
    if (c && c.stato !== 'delegato') break
  }
  bozze.push({ ...g, secondi: Math.round((Date.now() - t) / 1000), stato: c?.stato, risultato: c?.risultato, email: c?.email, consegna: c?.consegna, prova: c?.prova, revisione: c?.revisione, ipotesi: c?.ipotesi, guaio: c?.guaio })
  console.log('BOZZA', i, c?.stato, Math.round((Date.now() - t) / 1000), 's')
}
risultato.bozze = bozze
writeFileSync(uscita, JSON.stringify(risultato, null, 1))
console.log('fatto', uscita)
process.exit(0)
