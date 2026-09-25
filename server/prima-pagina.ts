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
import * as avvio from './avvio.ts'
import { FONTI } from './connettori/registro.ts'
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

/** Le fonti che hanno documenti adesso, fra quelle che si collegano. */
function fontiConDocumenti(): string[] {
  const vere = new Set(FONTI)
  return store.conteggi().perFonte.filter(r => r.n > 0 && vere.has(r.fonte)).map(r => r.fonte).sort()
}

/** Per quanto una pagina rimasta vuota si rifà se arriva una fonte nuova: il primo giorno. */
export const RIFA_VUOTA_MS = 24 * 3_600_000

/*
 * La pagina è fatta. Una pagina rimasta vuota però, il primo giorno, vale solo
 * per le fonti che aveva: il segno dice quali erano («vuota|quando|calendario,
 * desktop»), e quando ne arriva una nuova quel giorno (la posta collegata
 * dopo il riavvio per l'accesso completo al disco) la pagina si rifà, una
 * volta per fonte. Dopo il primo giorno è fatta come le altre: chi collega
 * Slack fra un mese non rivede «Preparo la tua prima pagina» (spec 3.6: la
 * prima pagina gira una volta). Una pagina con delle carte è fatta per sempre.
 */
function fatta(adesso = Date.now()): boolean {
  const v = store.cursore(SEGNO)
  if (!v) return false
  if (!v.startsWith('vuota|')) return true
  const [, quando = '', fonti = ''] = v.split('|')
  const t = Date.parse(quando)
  if (!Number.isFinite(t) || adesso - t >= RIFA_VUOTA_MS) return true
  const aveva = new Set(fonti.split(',').filter(Boolean))
  return !fontiConDocumenti().some(f => !aveva.has(f))
}

/**
 * Da quando si conta il tempo della prima pagina (spec 8): dall'inizio della
 * lettura che l'ha preparata, o, se è partita da sola (un modello collegato
 * dopo la lettura), dall'inizio della prima lettura del conto.
 */
function inizioDellaLettura(dal: number | undefined, inizio: number): number {
  if (dal !== undefined) return dal
  const t = Date.parse(store.cursore('prima:iniziata') ?? '')
  return Number.isFinite(t) && t <= inizio ? t : inizio
}

/**
 * Chi è nell'avvio ha già scelto le sue fonti (o l'avvio è finito).
 *
 * Il giro dei dieci minuti legge quello che è collegato, anche mentre lui è
 * ancora sul passo delle fonti con due schede su quattro: una pagina fatta
 * lì è fatta con l'agenda e il Mac, senza la posta che sta per collegare, e
 * non si rifarebbe. Il giro di fondo la lascia a dopo; «Leggi», premuto da
 * lui, la fa (è la lettura delle fonti che ha scelto).
 */
export function fontiScelte(): boolean {
  if (cfg.leggi().onboarding) return true
  return avvio.fontiScelte() === true
}

/** La prima pagina va ancora fatta: c'è chi ragiona, c'è da leggere, e non ha mai avuto una carta. */
export function dovuta(): boolean {
  return ferri.collegato() && !fatta() && store.nessunaCarta() && store.haDocumenti()
}

/**
 * Prepara la prima pagina. Chi chiama tiene la serratura della lettura.
 * `dal`: quando è cominciata la lettura che la prepara, per il tempo nel registro.
 */
export async function prepara(dal?: number): Promise<void> {
  const via = () => cancellati.cancellata(cfg.cartella())
  if (via()) return
  metti('lavoro')
  const inizio = Date.now()
  const da = inizioDellaLettura(dal, inizio)
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
    const quando = new Date().toISOString()
    // nessuna carta, in nessuno stato: il segno ricorda con quali fonti
    store.segnaCursore(SEGNO, store.nessunaCarta() ? `vuota|${quando}|${fontiConDocumenti().join(',')}` : quando)
    metti('pronta', carte)
    // dall'inizio della lettura che l'ha preparata, o della prima lettura (spec 8)
    console.log(`myynd · prima pagina · pronta in ${Date.now() - da} ms · ${carte} carte`)
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
  if (fatta() || !store.nessunaCarta()) return { pagina: 'nessuna', carte: 0 }
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
