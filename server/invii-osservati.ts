// L'osservatore degli invii: una bozza salvata nella sua posta che poi è partita.
//
// Gmail e Mail mandano da soli; Myynd non vede il gesto. Quello che vede,
// alla lettura dopo, è la posta inviata nell'indice: una mail mandata dopo
// la consegna, che risponde al messaggio da cui è nata la riga (`risponde`,
// l'In-Reply-To pulito) o che sta nello stesso filo. Qui si abbinano, si
// misura quanto la bozza è stata ritoccata (`ritocco.ts`), e si scrive
// `compiti.mandata` nella forma che legge P9 e la riga di `misure_compiti`.
//
// Tre cose che non fa: non chiude mai la riga (togliere una cosa visibile
// vuole il suo sì), non riscrive una `mandata` già scritta, e non impara
// da una risposta che ha riscritto da capo (quella è sua, non una
// correzione della bozza). Gira dentro il contesto di chi legge.

import { createHash } from 'node:crypto'
import * as store from './store.ts'
import * as lavoroDati from './lavoro-dati.ts'
import * as memoria from './memoria.ts'
import * as compiti from './compiti.ts'
import { classe, parole, ritocco } from './ritocco.ts'
import { corpoAttuale } from './rilevanza.ts'
import { senzaFirma } from './voce.ts'

/** Oltre questa distanza, con il solo filo come prova, la mail è sua e non la bozza. */
export const SOGLIA_PROPRIA = 0.6
const FINESTRA = 30 * 86_400_000

type Ferri = { impara: (bozza: string, inviato: string) => Promise<unknown> }
const VERI: Ferri = { impara: (b, i) => memoria.imparaDallaCorrezione(b, i) }
let ferri: Ferri = VERI
/** Solo per le prove: sostituisce la memoria, o la rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/** Il Message-ID che `salvaBozzaCasella` dà alla bozza di questa riga. */
export function idDellaBozza(task: string, source: string): string {
  return `myynd-${createHash('sha256').update(task + '\n' + source).digest('hex')}@draft.myynd.local`
}

/** Le righe che possono essere partite: bozza salvata, non ancora segnate, degli ultimi trenta giorni. */
function candidati(): store.Compito[] {
  const da = new Date(Date.now() - FINESTRA).toISOString()
  const righe = store.default.prepare(`
    SELECT id FROM compiti
    WHERE email LIKE '%"stato":"salvata"%' AND doc IS NOT NULL AND mandata IS NULL AND sparito IS NULL
      AND chiesto IS NOT NULL AND chiesto >= ?
  `).all(da) as { id: string }[]
  return righe.map(r => store.compito(r.id)).filter((c): c is store.Compito => !!c)
}

export type Visto = { mandata: true; certezza: 'id' | 'filo'; ritocco: number } | { mandata: false; via: 'propria' } | null

/**
 * Una riga sola: se una sua mail è partita, lo si scrive. Torna cosa ha visto,
 * o null se non ha trovato niente. Idempotente: una riga già segnata torna
 * senza scrivere.
 */
export async function osservaUno(c: store.Compito): Promise<Visto> {
  if (c.mandata || !c.doc || c.email?.casella?.stato !== 'salvata' || !c.chiesto) return null
  const m = lavoroDati.misura(c.id)
  const dopo = m?.consegnato ?? c.chiesto
  const sorgente = store.documento(c.doc)
  const filo = sorgente?.filo && !sorgente.filo.startsWith('s:') ? sorgente.filo : null
  const mandate = lavoroDati.inviatiDopo(c.email.rispondeA?.messageId, filo, dopo)
  if (!mandate.length) return null
  const inviata = mandate[0]
  const certezza: 'id' | 'filo' = inviata.messageId && inviata.messageId === idDellaBozza(c.id, c.doc) ? 'id' : 'filo'
  const bozza = senzaFirma(c.email.corpo)
  const corpo = senzaFirma(corpoAttuale(inviata))
  const r = ritocco(bozza, corpo)
  const quando = inviata.quando ?? new Date().toISOString()
  if (certezza === 'filo' && r > SOGLIA_PROPRIA) {
    lavoroDati.registraInvio(c.id, { via: 'propria', inviato: quando, classe: 'riscritto' })
    return { mandata: false, via: 'propria' }
  }
  if (!lavoroDati.segnaMandata(c.id, { doc: inviata.id, quando, certezza, ritocco: r })) return null
  const cl = classe(r)
  lavoroDati.registraInvio(c.id, { via: 'casella', inviato: quando, distanza: r, parole: parole(corpo).length, classe: cl })
  if (cl === 'ritocco' || cl === 'modificato') ferri.impara(c.email.corpo, corpo).catch(() => { /* la memoria è un di più */ })
  return { mandata: true, certezza, ritocco: r }
}

/** Tutte le righe che possono essere partite. Torna quante ha segnate, e annuncia una volta se ha scritto. */
export async function osserva(): Promise<number> {
  let scritte = 0
  for (const c of candidati()) {
    try {
      const v = await osservaUno(c)
      if (v) scritte++
    } catch (e) {
      console.warn(`myynd · invii · ${c.id}:`, e instanceof Error ? e.message : e)
    }
  }
  if (scritte) compiti.annunciaCambio()
  return scritte
}
