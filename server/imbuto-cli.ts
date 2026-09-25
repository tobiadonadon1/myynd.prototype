// `npm run imbuto`: la riga dell'imbuto del primo giorno, da questa macchina.
//
// Legge solo il file dei numeri (`<dati>/misure/imbuto.json`): nessun
// indice si apre, nessun conto si tocca, niente esce. `--dati <cartella>`
// per guardarne un'altra.

import { join } from 'node:path'
import { homedir } from 'node:os'
import { leggiAggregatoIn, riga } from './imbuto-riga.ts'

const i = process.argv.indexOf('--dati')
const radice = i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : ((process.env.MYYND_DATI ?? '').trim() || join(homedir(), '.myynd'))
const a = leggiAggregatoIn(radice)
console.log(riga(a))
if (a?.dal) console.log(`dal ${a.dal.slice(0, 10)}`)
