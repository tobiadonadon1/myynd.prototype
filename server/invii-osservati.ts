// L'osservatore degli invii: una bozza salvata nella sua posta che poi è partita.
//
// Gmail e Mail mandano da soli; Myynd non vede il gesto. Quello che vede,
// alla lettura dopo, è la posta inviata nell'indice: una mail mandata dopo
// la consegna, che risponde al messaggio da cui è nata la riga (`risponde`,
// l'In-Reply-To pulito) o che sta nello stesso filo. Qui si abbinano, si
// misura quanto la bozza è stata ritoccata (`ritocco.ts`), e si scrive
// `compiti.mandata` nella forma che legge P9 e la riga di `misure_compiti`.
//
// Quattro cose che non fa: non chiude mai la riga (togliere una cosa visibile
// vuole il suo sì), non riscrive una `mandata` già scritta, non impara da una
// risposta che ha riscritto da capo (quella è sua, non una correzione della
// bozza), e non guarda due volte una riga di cui un invio è già segnato: una
// bozza partita da «Manda» (SMTP) finisce anche lei nella posta inviata, e
// senza questo la stessa mail contava due volte e si imparava due volte.
// E una quinta: una mail partita si segna su una riga sola. Dopo «Cambia» su
// una bozza salvata la bozza nella casella è della figlia di revisione, e la
// madre non la guarda più; una mail già segnata su un'altra riga non si
// abbina una seconda volta.
// Gira dentro il contesto di chi legge.

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

/**
 * Le righe che possono essere partite: bozza salvata, non ancora segnate,
 * senza un invio già scritto nelle misure (da «Manda», o una risposta sua
 * vista al giro prima), degli ultimi trenta giorni.
 */
function candidati(): store.Compito[] {
  const da = new Date(Date.now() - FINESTRA).toISOString()
  const righe = store.default.prepare(`
    SELECT c.id FROM compiti c LEFT JOIN misure_compiti m ON m.compito = c.id
    WHERE c.email LIKE '%"stato":"salvata"%' AND c.doc IS NOT NULL AND c.mandata IS NULL AND c.sparito IS NULL
      AND c.chiesto IS NOT NULL AND c.chiesto >= ? AND m.inviato IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM compiti f WHERE f.madre = c.id AND f.id LIKE 'rev-%' AND f.sparito IS NULL AND f.email LIKE '%"stato":"salvata"%'
      )
  `).all(da) as { id: string }[]
  return righe.map(r => store.compito(r.id)).filter((c): c is store.Compito => !!c)
}

export type Visto = { mandata: true; certezza: 'id' | 'filo'; ritocco: number } | { mandata: false; via: 'propria' } | null

/**
 * Una riga sola: se una sua mail è partita, lo si scrive. Torna cosa ha visto,
 * o null se non ha trovato niente o non ha scritto niente. Idempotente: una
 * riga già segnata, o con un invio già nelle misure, torna senza scrivere.
 */
export async function osservaUno(c: store.Compito): Promise<Visto> {
  if (c.mandata || !c.doc || c.email?.casella?.stato !== 'salvata' || !c.chiesto) return null
  const m = lavoroDati.misura(c.id)
  // un invio c'è già: da «Manda», o una risposta sua vista prima. La copia
  // nella posta inviata è quella mail, non una seconda
  if (m?.inviato) return null
  // «Cambia» su questa bozza ha fatto una figlia che ha riscritto la stessa
  // bozza nella casella: la bozza è sua, e la mail che parte è sua. Guardare
  // anche la madre contava una mail due volte e imparava la revisione di
  // Myynd come se fosse una correzione di lei
  if (lavoroDati.figliaConBozza(c.id)) return null
  const dopo = m?.consegnato ?? c.chiesto
  const sorgente = store.documento(c.doc)
  const filo = sorgente?.filo && !sorgente.filo.startsWith('s:') ? sorgente.filo : null
  // una mail partita si segna su una riga sola: quelle già di un'altra riga non si guardano
  const mandate = lavoroDati.inviatiDopo(c.email.rispondeA?.messageId, filo, dopo).filter(d => !lavoroDati.mandataGiaSegnata(d.id, c.id))
  if (!mandate.length) return null
  const inviata = mandate[0]
  const certezza: 'id' | 'filo' = inviata.messageId && inviata.messageId === idDellaBozza(c.id, c.doc) ? 'id' : 'filo'
  const bozza = senzaFirma(c.email.corpo)
  const corpo = senzaFirma(corpoAttuale(inviata))
  const r = ritocco(bozza, corpo)
  const quando = inviata.quando ?? new Date().toISOString()
  if (certezza === 'filo' && r > SOGLIA_PROPRIA) {
    if (!lavoroDati.registraInvio(c.id, { via: 'propria', inviato: quando, classe: 'riscritto' })) return null
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
