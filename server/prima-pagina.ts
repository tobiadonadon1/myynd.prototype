// La prima pagina di un conto nuovo, preparata una volta sola.
//
// La lettura del primo avvio metteva nell'indice novanta giorni di posta e
// poi si fermava: la prima pagina aspettava che qualcuno premesse l'occhio,
// o il giro dei dieci minuti, che non vede niente di «appena arrivato».
// Qui, subito dopo la posta e l'agenda (e prima del Mac, che è lungo), si
// fa la lettura del feed sulla posta arrivata di recente e poi il giro delle
// priorità, una volta, sotto la serratura della lettura: niente di tutto
// questo scrive nell'avvio, così i passi D ed E non trovano mai un 409.
//
// Con il solo account di Claude non c'è un motore per il feed, ma le
// priorità passano lo stesso: si salta il primo passo e si va avanti.

import * as store from './store.ts'
import * as cfg from './config.ts'
import * as chi from './chi.ts'
import * as mod from './modello.ts'
import * as priorita from './priorita.ts'
import * as compiti from './compiti.ts'
import * as cancellati from './cancellati.ts'
import * as viva from './lettura-viva.ts'
import * as primaLettura from './prima-lettura.ts'
import { generaFeed } from './claude.ts'
import { feedAttuale } from './attenzione.ts'

export type StatoPagina = 'nessuna' | 'attesa' | 'lavoro' | 'pronta' | 'senza-motore' | 'guaio'

type Ferri = {
  generaFeed: typeof generaFeed
  forse: (forza?: boolean) => Promise<number>
  salvaFeed: typeof store.salvaFeed
  annuncia: () => void
  collegato: () => boolean
  motore: () => unknown
}
const VERI: Ferri = {
  generaFeed: n => generaFeed(n),
  forse: f => priorita.forse(f),
  salvaFeed: v => store.salvaFeed(v),
  annuncia: () => compiti.annunciaFeed(),
  collegato: () => mod.collegato(),
  motore: () => mod.motore()
}
let ferri: Ferri = VERI
/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

const SEGNO = 'prima:pagina'
/** Quanto vale lo stato in memoria: dopo, parlano l'indice e i cursori. */
const VALE_MS = 10 * 60_000
const stati = new Map<string, { pagina: StatoPagina; carte: number; quando: number }>()
const conto = () => chi.adesso() ?? ''
const metti = (pagina: StatoPagina, carte = 0) => { stati.set(conto(), { pagina, carte, quando: Date.now() }) }

/** La prima pagina va ancora fatta: c'è chi ragiona, c'è da leggere, e non ha mai avuto una carta. */
export function dovuta(): boolean {
  return ferri.collegato() && !store.cursore(SEGNO) && store.nessunaCarta() && store.haDocumenti()
}

/** Prepara la prima pagina. Chi chiama tiene la serratura della lettura. */
export async function prepara(): Promise<void> {
  const via = () => cancellati.cancellata(cfg.cartella())
  if (via()) return
  metti('lavoro')
  console.log('myynd · prima pagina · comincia')
  try {
    if (ferri.motore()) {
      const voci = await ferri.generaFeed(store.postaArrivataRecente(30, 200))
      if (via()) return
      if (voci.length) ferri.salvaFeed(voci)
    }
    if (via()) return
    await ferri.forse(true)
    if (via()) return
    ferri.annuncia()
    const carte = feedAttuale().length
    store.segnaCursore(SEGNO, new Date().toISOString())
    metti('pronta', carte)
    const dal = Date.parse(store.cursore('prima:iniziata') ?? '')
    console.log(`myynd · prima pagina · pronta in ${Number.isNaN(dal) ? 0 : Date.now() - dal} ms · ${carte} carte`)
  } catch (e) {
    if (via()) return
    metti('guaio')
    console.error('myynd · prima pagina · non è riuscita:', e instanceof Error ? e.message : e)
  }
}

/** Lo stato della prima pagina per chi chiede adesso. */
export function stato(): { pagina: StatoPagina; carte: number } {
  const m = stati.get(conto())
  if (m && Date.now() - m.quando < VALE_MS) return { pagina: m.pagina, carte: m.carte }
  // un conto che ha già avuto la sua pagina, o delle carte, non vede mai la riga
  if (store.cursore(SEGNO) || !store.nessunaCarta()) return { pagina: 'nessuna', carte: 0 }
  const legge = viva.di(conto())?.prima === true || primaLettura.inCorso().length > 0
  if (!ferri.collegato()) return { pagina: store.haDocumenti() || legge ? 'senza-motore' : 'nessuna', carte: 0 }
  if (dovuta() || legge) return { pagina: 'attesa', carte: 0 }
  return { pagina: 'nessuna', carte: 0 }
}

/** Lo stato della prima pagina di un conto preciso (P10 lo chiede per l'occhio). */
export function statoPagina(c: string): StatoPagina {
  return (c ? chi.dentro(c, () => stato()) : stato()).pagina
}

/** Solo per le prove: dimentica gli stati in memoria. */
export function dimentica() { stati.clear() }
