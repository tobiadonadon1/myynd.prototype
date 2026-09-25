// Un finto server per la prova del canale dell'osservatore.
//
// Gira come utilityProcess di Electron al posto di `server/index.ts`
// (`server.avvia(ascolto, { script })`, solo in `prove/osservatore-guscio.cjs`).
// Dice la porta come il server vero, risponde a `osservatore-chiedi`,
// `osservatore-pausa` e `osservatore-riprendi` con un `osservatore-stato`
// (acceso, con i titoli), e scrive ogni messaggio ricevuto e mandato, in
// ordine, nel JSONL di `REGISTRO`. Non apre porte, non tocca niente altro.
import { appendFileSync } from 'node:fs'

const REGISTRO = process.env.REGISTRO
const porta = process.parentPort
if (!porta || !REGISTRO) { console.error('finto server · manca parentPort o REGISTRO'); process.exit(1) }

const scrivi = (dir, m) => appendFileSync(REGISTRO, JSON.stringify({ dir, t: Date.now(), m }) + '\n')
let pausaFino = null
const stato = () => ({ tipo: 'osservatore-stato', acceso: true, titoli: true, pausaFino })
const manda = m => { scrivi('fuori', m); porta.postMessage(m) }

porta.on('message', e => {
  const m = e.data
  scrivi('dentro', m)
  if (m?.tipo === 'osservatore-pausa') {
    const minuti = Math.min(480, Math.max(1, Math.round(Number(m.minuti) || 60)))
    pausaFino = new Date(Date.now() + minuti * 60_000).toISOString()
    manda(stato())
  } else if (m?.tipo === 'osservatore-riprendi') {
    pausaFino = null
    manda(stato())
  } else if (m?.tipo === 'osservatore-chiedi') {
    manda(stato())
  }
})

process.on('SIGTERM', () => { scrivi('fine', null); process.exit(0) })
porta.postMessage({ porta: 0 })
scrivi('fuori', { porta: 0 })
