// I cinque compiti della prova di chiarezza (P5), giudicati leggendo solo il
// server: niente foto, niente pagina. Si lancia a server acceso (TIENI=1).
//
//   node prove/verifica-compiti.mjs http://127.0.0.1:18760 [OUT]
//
// Stampa una riga per compito e, con OUT, scrive OUT/usabilita.json.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const base = process.argv[2] || 'http://127.0.0.1:18760'
const out = process.argv[3]
const TOKEN = process.env.TOKEN || 'sviluppo-non-in-produzione'
const leggi = async p => {
  const r = await fetch(base + p, { headers: { authorization: `Bearer ${TOKEN}` } })
  // Alcune rotte (es. /api/osservatore quando manca l'osservatore) rispondono
  // apposta con uno stato non-ok ma un corpo JSON valido (disponibile:false):
  // va letto lo stesso, non scartato, altrimenti T1 sembra fallito invece che «non applicabile».
  if ((r.headers.get('content-type') ?? '').includes('json')) { try { return await r.json() } catch { return { __stato: r.status } } }
  return r.ok ? r.json() : { __stato: r.status }
}

const compiti = {
  // Smetti di leggere i titoli delle finestre, ma continua a guardare le app
  T1: async () => { const o = await leggi('/api/osservatore'); return o.disponibile === false ? null : o.acceso === true && o.titoli === false },
  // Concentrati sul lancio di Northwind
  T2: async () => /northwind/i.test((await leggi('/api/feed/fuoco')).fuoco ?? ''),
  // Scorda «Prefers calls to email with suppliers», tieni «Replies to Harbor Labs within the hour»
  T3: async () => {
    const m = await leggi('/api/memoria')
    const tutte = [...(m.convinzioni ?? []), ...(m.storiche ?? [])]
    const sbagliata = tutte.some(c => /prefers calls to email/i.test(c.enunciato))
    const giusta = (m.convinzioni ?? []).find(c => /replies to harbor labs/i.test(c.enunciato))
    return !sbagliata && !!giusta?.confermata
  },
  // Un progetto «Newsletter» con l'obiettivo «Send the first issue»
  T4: async () => ((await leggi('/api/progetti')).progetti ?? []).some(p => p.nome === 'Newsletter' && /send the first issue/i.test(p.obiettivo)),
  // Tono formale, app scura
  T5: async () => { const s = await leggi('/api/stato'); return s.config?.tono === 'formale' && s.config?.tema === 'scuro' }
}

const esiti = {}
for (const [k, f] of Object.entries(compiti)) {
  try { esiti[k] = await f() } catch (e) { esiti[k] = `errore: ${e.message}` }
  console.log(`verifica · ${k}: ${esiti[k] === true ? 'riuscito' : esiti[k] === null ? 'non applicabile' : 'non riuscito'}`)
}
if (out) writeFileSync(join(out, 'usabilita.json'), JSON.stringify({ quando: new Date().toISOString(), esiti }, null, 1))
