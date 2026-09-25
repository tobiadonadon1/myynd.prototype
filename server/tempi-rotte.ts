// Le due rotte dei tempi (P10), montate da `index.ts`.
//
// Stanno qui e non dentro `index.ts` per una ragione sola: il «mai su un
// server» si prova con un'app piccola, senza accendere un server ospitato
// (che ascolterebbe su tutte le interfacce del Mac di chi lancia le prove).

import type { Express } from 'express'
import * as tempi from './tempi.ts'

export function rotteTempi(app: Express, o: { ospitato: () => boolean; bordo: () => tempi.Bordo }): void {
  app.get('/api/tempi', (_req, res) => {
    if (o.ospitato()) return res.status(404).json({ errore: 'Questa strada non esiste.' })
    res.json({ ...tempi.riassunto(), bordo: o.bordo() })
  })

  app.post('/api/tempi', (req, res) => {
    if (o.ospitato()) return res.status(404).json({ errore: 'Questa strada non esiste.' })
    const segni = tempi.segniDelClient(req.body)
    if (!segni) return res.status(400).json({ errore: 'Segni non validi.' })
    console.log(tempi.rigaSegni(segni))
    res.json({ ok: true })
  })
}
