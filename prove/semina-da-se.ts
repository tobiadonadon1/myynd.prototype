// La parte della semina che serve al lavoro da sé (`server/da-se.ts`).
//
// La chiama `prove/semina.ts` dentro il conto, quando la scena ha «dase»:
// scrive i quadri dei progetti com'erano appena fatti (della versione di
// adesso, con la sintesi), così il server non li rifà col modello finto per
// due ore e il lavoro da sé legge quello che la scena dice.
//
// «dase»:
//   quadri   [{ progetto: "<chiave>", sintesi, stato, traguardo, blocco?, mosse?: ["titolo"], domanda? }]

import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

const SERVER = new URL('../server/', import.meta.url).pathname
const cfg = await import(join(SERVER, 'config.ts'))
const quadro = await import(join(SERVER, 'quadro.ts'))

type Q = { progetto: string; sintesi?: string; stato?: string; traguardo?: string; blocco?: string; mosse?: string[]; domanda?: string }
export type DaSe = { quadri?: Q[] }

export function semina(s: DaSe, o: { ids: Map<string, string>; nomi: Map<string, string> }) {
  const adesso = new Date().toISOString()
  const quadri: Record<string, unknown> = {}
  for (const q of s.quadri ?? []) {
    const id = o.ids.get(q.progetto) ?? q.progetto
    quadri[id] = {
      progetto: id, nome: o.nomi.get(id) ?? '', stato: q.stato ?? '', sintesi: q.sintesi ?? '', traguardo: q.traguardo ?? '', blocco: q.blocco ?? '',
      mosse: (q.mosse ?? []).map(titolo => ({ genere: 'consiglio', titolo, testo: '', leva: 2, urgenza: 'settimana', offerta: '', prova: '', doc: null, origine: 'memoria' })),
      ...(q.domanda ? { domanda: q.domanda, domandaTipo: 'osservazione' } : {}),
      quando: adesso, impronta: 'seminato', versione: quadro.VERSIONE, letto: { scena: 1 }
    }
  }
  writeFileSync(join(cfg.cartella(), 'quadri.json'), JSON.stringify({ quadri }, null, 2), { mode: 0o600 })
}
