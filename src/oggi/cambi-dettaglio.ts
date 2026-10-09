// Quello che il dettaglio di una riga manda quando si preme «Salva».
//
// Solo quello che è stato toccato. Il dettaglio mandava tutti i campi, anche
// i valori di prima: una riga «di oggi» senza data si ritrovava inchiodata
// alla data di oggi (e il giorno dopo era in ritardo), e una riga al lavoro
// aperta per guardarla e salvata passava per cambiata. Il primo ottobre una
// riga affidata è sparita a metà lavoro, e questo era il primo indiziato:
// aprire il dettaglio di una riga che lavora e chiuderlo non deve toccarla.
// Niente di cambiato, niente da mandare.
//
// Pura, senza React: la prova sta in `src/cambi-dettaglio.test.ts`.

import type { Compito, Priorita } from '../api.ts'
import { giornoCompito, secchioDelGiorno } from './giorni.ts'
import { oraDi, oraValida } from '../agenda-ore.ts'
import { notaDaSalvare, notaPerLei } from '../lavoro-affidato.ts'

/** I campi del dettaglio come sono adesso: stringhe vuote per «niente», come nei campi. */
export type ValoriDettaglio = { testo: string; nota: string; giorno: string; ora: string; progetto: string; priorita: Priorita | null }

export type CambiDettaglio = {
  testo?: string; nota?: string | null; progetto?: string | null; priorita?: Priorita | null
  giorno?: string | null; ora?: string | null; quando?: string
}

/** I valori con cui il dettaglio si apre su una riga. */
export function valoriDi(c: Compito, oggi: string): ValoriDettaglio {
  // una riga che Myynd si è preparato ha per nota il compito di chi lavora: lei vede solo la sua
  return { testo: c.testo, nota: notaPerLei(c), giorno: giornoCompito(c, oggi) ?? '', ora: oraDi(c) ?? '', progetto: c.progetto ?? '', priorita: c.priorita ?? null }
}

export function cambiDelDettaglio(c: Compito, v: ValoriDettaglio, oggi: string): CambiDettaglio {
  const prima = valoriDi(c, oggi)
  const ora = v.giorno && oraValida(v.ora) ? v.ora : ''
  const oraCambiata = ora !== (v.giorno ? prima.ora : '')
  // un'ora vive dentro un giorno scritto: una riga «di oggi» senza data che prende un'ora si prende anche il giorno
  const giornoCambiato = v.giorno !== prima.giorno || (oraCambiata && !!v.giorno && !c.giorno)
  return {
    ...(v.testo.trim() !== prima.testo.trim() ? { testo: v.testo.trim() } : {}),
    ...(v.nota.trim() !== prima.nota.trim() ? { nota: notaDaSalvare(c, v.nota.trim()) } : {}),
    ...(v.progetto !== prima.progetto ? { progetto: v.progetto || null } : {}),
    // solo se è cambiata: una modifica che non la tocca non deve riscriverla
    ...(v.priorita !== prima.priorita ? { priorita: v.priorita } : {}),
    ...(giornoCambiato ? { giorno: v.giorno || null, quando: v.giorno ? secchioDelGiorno(v.giorno, oggi) : (c.quando === 'settimana' ? 'settimana' : 'poi') } : {}),
    // senza un giorno l'ora non sta da nessuna parte, e il server la rifiuta
    ...(giornoCambiato || oraCambiata ? { ora: ora || null } : {})
  }
}
