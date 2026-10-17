// Quanto vede il connettore di Slack, sullo spazio finto: il prima e il dopo.
//
//   node --import ./build/test-profile.mjs prove/slack-misura.ts
//
// Settantuno posti, sessantasette di cui fa parte e non archiviati; quattro
// fili con risposte; tre domande rimaste senza risposta e due a cui ha
// risposto. Poi un messaggio diretto nuovo, da solo nella sua giornata: quanto
// ci mette a entrare.

import * as finto from './finto-slack.ts'

const f = await finto.avvia()
process.env.MYYND_DEV = '1'
process.env.MYYND_SLACK_URL = f.url
const vera = globalThis.fetch
globalThis.fetch = ((u: string | URL | Request, init?: RequestInit) =>
  vera(String(u).replace('https://slack.com/api/', f.url), init)) as typeof fetch

const slack = await import('../server/connettori/slack.ts')
const conf = { token: finto.TOKEN, giorni: 30 }
const t0 = Date.now()
const e = await slack.sincronizza(conf) as { docs: { id: string; corpo: string }[] }
const ms = Date.now() - t0
const idPosto = (id: string) => id.split(':')[1]
const posti = new Set(e.docs.map(d => idPosto(d.id)))
const corpo = e.docs.map(d => d.corpo).join('\n')
const fili = ['I can help with slides', 'What about the travel costs', 'Agreed, we decided', 'Timeline looks right'].filter(x => corpo.includes(x)).length
const diretti = ['D0NORA', 'D0TOM', 'D0LISA', 'G0MP'].filter(x => posti.has(x)).length

let aperte = 0, promesse = 0, decisioni = 0
let segnali: { registra?: (e: unknown) => unknown; daRispondere?: () => unknown[]; promesse?: () => unknown[]; decisioni?: () => unknown[] } = {}
try { segnali = await import('../server/slack-segnali.ts' as string) } catch { /* il prima non li ha */ }
if (segnali.registra) {
  segnali.registra(e)
  aperte = segnali.daRispondere!().length
  promesse = segnali.promesse!().length
  decisioni = segnali.decisioni!().length
}

// un messaggio diretto nuovo, da solo nella sua giornata
f.aggiungi('D0LISA', finto.LISA, 'Can you share the invoice for September?')
const veloce = (slack as { corsiaVeloce?: (c: unknown) => Promise<{ docs: { corpo: string }[] }> }).corsiaVeloce
const prima = Number([...f.conteggi.values()].reduce((a, b) => a + b, 0))
const dopo = veloce ? await veloce(conf) : await slack.sincronizza(conf) as { docs: { corpo: string }[] }
const entrato = dopo.docs.some(d => d.corpo.includes('invoice for September'))
const chiamateVeloce = Number([...f.conteggi.values()].reduce((a, b) => a + b, 0)) - prima

console.log(JSON.stringify({
  documenti: e.docs.length,
  posti: `${posti.size} di 67`,
  messaggiDiretti: `${diretti} di 4`,
  filiConRisposte: `${fili} di 4`,
  domandeAperte: `${aperte} di 3`,
  promesse, decisioni,
  nuovoDiretto: entrato ? (veloce ? 'entrato alla corsia dei 2 minuti' : 'entrato al giro dei 10 minuti') : 'mai (da solo nella sua giornata)',
  chiamateDelSecondoGiro: chiamateVeloce,
  ms
}, null, 2))
globalThis.fetch = vera
await f.chiudi()
