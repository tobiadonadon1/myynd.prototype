// La prima lettura di una fonte: novanta giorni, e fino in fondo.
//
// Una fonte appena collegata si legge da novanta giorni indietro, non da
// trenta: il gemello deve cominciare con tre mesi di lei, non con uno. Ma
// una casella grande non entra in un giro solo (quattrocento messaggi per
// cartella, milleottocento file), e se il segno dei novanta giorni vivesse
// solo nel giro che l'ha cominciato, il giro dopo tornerebbe a trenta e i
// giorni fra trenta e novanta non arriverebbero mai. Il segno sta quindi
// nell'indice, per conto, fra i cursori: `prima:<fonte>` vale «in-corso»
// finché i novanta giorni non sono dentro, poi «fatto», e da lì le letture
// tornano alla loro finestra di sempre. La configurazione non cambia mai.
//
// Chi c'era già (con documenti di quella fonte) è «fatto» dal primo giorno:
// per lui niente cambia. Una fonte scollegata perde il segno, e ricollegata
// ricomincia da capo.

import * as store from './store.ts'
import * as cfg from './config.ts'
import * as chi from './chi.ts'
import * as ospitato from './ospitato.ts'
import * as cancellati from './cancellati.ts'
import { fonteCollegata } from './fonti-collegate.ts'

export const GIORNI_PRIMA = 90
/** Quante letture di una fonte prima che la prima lettura si arrenda. */
export const GIRI_MASSIMI = 40
/** Le fonti che leggono una finestra di giorni: solo queste hanno una prima lettura. */
export const A_FINESTRA = ['posta', 'postamac', 'calendario', 'agendamac', 'slack', 'github', 'desktop'] as const
/** In che ordine si leggono la prima volta: prima l'agenda e la posta, il Mac per ultimo. */
export const ORDINE_PRIMA = ['calendario', 'agendamac', 'posta', 'postamac', 'google', 'microsoft',
  'note', 'notion', 'slack', 'conversazioni', 'github', 'granola', 'x', 'drive', 'sharepoint', 'dropbox', 'desktop']

/** Le fonti che si leggono da questa macchina e basta: su un server non si leggono da qui. */
const DI_QUESTA_MACCHINA = new Set(['desktop', 'agendamac', 'postamac'])
const SOLO_MAC = new Set(['agendamac', 'postamac'])

const segno = (fonte: string) => `prima:${fonte}`
const giri = (fonte: string) => `prima:${fonte}:giri`

/** A che punto è la prima lettura di una fonte collegata che sta per leggersi. */
export function statoPrima(fonte: string): 'in-corso' | 'fatto' {
  const v = store.cursore(segno(fonte))
  if (v === 'fatto' || v === 'in-corso') return v
  if (store.haDocumenti(fonte)) {
    store.segnaCursore(segno(fonte), 'fatto')
    return 'fatto'
  }
  store.segnaCursore(segno(fonte), 'in-corso')
  if (!store.cursore('prima:iniziata')) store.segnaCursore('prima:iniziata', new Date().toISOString())
  return 'in-corso'
}

/** I giorni da leggere adesso: novanta durante la prima lettura, poi quelli di sempre. */
export function giorniDi(fonte: string, giorni: number | undefined, base = 30): number {
  const suoi = giorni ?? base
  return statoPrima(fonte) === 'in-corso' ? Math.max(suoi, GIORNI_PRIMA) : suoi
}

/**
 * Come si legge il Mac in questo giro: la prima volta i file degli ultimi
 * novanta giorni e al massimo millecinquecento nuovi, poi duemila nuovi per
 * giro. Estrarre costa, e il tetto si conta sui file che l'indice non ha.
 *
 * Verso un server ospitato niente di tutto questo: lì la lettura non sa cosa
 * c'è già (si spinge tutto, a ogni giro), quindi ogni file conterebbe come
 * nuovo e ogni giro si fermerebbe agli stessi primi file, per sempre. Si legge
 * per intero, come prima, e il primo giro basta.
 */
export function opzioniMac(prima: boolean, remoto: boolean, adesso = Date.now()): { dal?: number; nuoviMax?: number } {
  if (remoto) return {}
  return prima ? { dal: adesso - GIORNI_PRIMA * 86_400_000, nuoviMax: 1500 } : { nuoviMax: 2000 }
}

/** La prima lettura di questa fonte è finita. */
export function finita(fonte: string, perche = 'letta'): void {
  store.segnaCursore(segno(fonte), 'fatto')
  store.segnaCursore(giri(fonte), null)
  console.log(`myynd · prima lettura · ${fonte} completa (${perche})`)
}

/**
 * Com'è andata una lettura di questa fonte, per la sua prima lettura.
 *
 * `completa`: i novanta giorni sono dentro. Se no si conta il giro, e al
 * quarantesimo ci si arrende: nessun giro può restare «prima» per sempre.
 * Una fonte già «fatto» non si tocca.
 */
export function esito(fonte: string, completa: boolean): void {
  if (store.cursore(segno(fonte)) !== 'in-corso') return
  if (completa) { finita(fonte); return }
  const n = Number(store.cursore(giri(fonte)) ?? 0) + 1
  if (n >= GIRI_MASSIMI) { finita(fonte, 'si arrende'); return }
  store.segnaCursore(giri(fonte), String(n))
}

/** La fonte è stata scollegata: ricollegata, ricomincia da capo. */
export function scorda(fonte: string): void {
  store.segnaCursore(segno(fonte), null)
  store.segnaCursore(giri(fonte), null)
}

/** Le fonti collegate la cui prima lettura non è finita. */
export function inCorso(c: cfg.Config = cfg.leggi()): string[] {
  return A_FINESTRA.filter(f => {
    if (DI_QUESTA_MACCHINA.has(f) && ospitato.OSPITATO) return false
    if (SOLO_MAC.has(f) && process.platform !== 'darwin') return false
    return fonteCollegata(f, c) && statoPrima(f) === 'in-corso'
  })
}

/** Almeno una fonte sta facendo la sua prima lettura. */
export function eUnaPrima(c?: cfg.Config): boolean {
  return inCorso(c).length > 0
}

/** I passi della lettura nell'ordine della prima volta; le altre volte com'erano. */
export function ordina<T extends { nome: string }>(passi: T[], prima: boolean): T[] {
  if (!prima) return passi
  const desktop = ORDINE_PRIMA.indexOf('desktop')
  const posto = (nome: string) => {
    const i = ORDINE_PRIMA.indexOf(nome)
    return i >= 0 ? i : desktop - 0.5
  }
  return [...passi].sort((a, b) => posto(a.nome) - posto(b.nome))
}

/**
 * I passi della lettura, uno dopo l'altro, nell'ordine giusto. Durante una
 * prima lettura `dopoLeVeloci` parte appena prima del Mac (la prima pagina
 * non aspetta migliaia di file), o alla fine se il Mac non c'è; le altre
 * volte non parte.
 */
export async function inOrdine<T extends { nome: string }>(passi: T[], prima: boolean, fai: (p: T) => Promise<void>, dopoLeVeloci?: () => void): Promise<void> {
  let veloci = false
  for (const p of ordina(passi, prima)) {
    if (prima && !veloci && p.nome === 'desktop') { veloci = true; dopoLeVeloci?.() }
    await fai(p)
  }
  if (prima && !veloci) dopoLeVeloci?.()
}

// — dopo la prima lettura —

const finali: (() => Promise<void> | void)[] = []

/** Quello che deve succedere una volta, quando i novanta giorni sono tutti dentro. */
export function quandoFinisce(f: () => Promise<void> | void): void {
  finali.push(f)
}

// — il resto, in sottofondo —

let pausaTraGiri = 3000
let giriMassimi = 12
let attesaOccupato = 5000
/** Solo per le prove: tempi e giri più corti, o `null` per quelli veri. */
export function perProva(o: { pausa?: number; giri?: number; occupato?: number } | null): void {
  pausaTraGiri = o?.pausa ?? 3000
  giriMassimi = o?.giri ?? 12
  attesaOccupato = o?.occupato ?? o?.pausa ?? 5000
}

const inVolo = new Map<string, Promise<void>>()
/** I conti dove una persona ha chiesto di leggere mentre girava il resto: il resto cede il passo. */
const cedute = new Set<string>()
const aspetta = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Il resto della prima lettura sta girando in sottofondo per questo conto. */
export function inCoda(conto: string): boolean {
  return inVolo.has(conto)
}

/**
 * Una persona vuole leggere e ha trovato la serratura presa dal resto.
 *
 * Il resto legge una fonte dopo l'altra e fra una e l'altra la serratura
 * resta libera per un istante solo: chi preme «Leggi», o collega una fonte,
 * riproverebbe per due minuti senza mai trovarla libera. Così il resto finisce
 * la fonte che sta leggendo e si ferma; la lettura della persona, finita, lo
 * fa ripartire. Senza un resto in corso non fa niente.
 */
export function cedi(conto: string): void {
  if (inVolo.has(conto)) cedute.add(conto)
}

/**
 * Leggere quello che manca, un giro dopo l'altro, finché i novanta giorni
 * di ogni fonte non sono dentro.
 *
 * Uno per conto. Una lettura già in corso (la sua, o quella dei dieci
 * minuti) fa aspettare cinque secondi e riprovare una volta; poi si lascia
 * perdere: il giro dei dieci minuti ci ripassa. Una fonte che non risponde
 * si salta fino al prossimo giro. Un conto cancellato ferma tutto.
 */
export function continua(conto: string, leggiUna: (fonte: string) => Promise<'letta' | 'occupato' | 'guaio'>): Promise<void> {
  const gia = inVolo.get(conto)
  if (gia) return gia
  const lavoro = async () => {
    const via = () => cancellati.cancellata(cfg.cartella())
    const saltate = new Set<string>()
    let fermo = false
    const cede = () => {
      if (!cedute.has(conto)) return false
      console.log('myynd · prima lettura · il resto cede il passo a una lettura chiesta')
      return true
    }
    for (let giro = 0; giro < giriMassimi && !fermo; giro++) {
      if (via()) return
      const mancano = inCorso().filter(f => !saltate.has(f))
      if (!mancano.length) break
      if (giro > 0) await aspetta(pausaTraGiri)
      for (const fonte of mancano) {
        if (via()) return
        if (cede()) { fermo = true; break }
        // finita nel frattempo (da un'altra lettura): non si rilegge
        if (!inCorso().includes(fonte)) continue
        let e = await leggiUna(fonte)
        if (e === 'occupato') { await aspetta(attesaOccupato); if (via()) return; e = await leggiUna(fonte) }
        if (e === 'occupato') { fermo = true; break }
        if (e === 'guaio') saltate.add(fonte)
      }
    }
    if (via()) return
    if (!inCorso().length && store.cursore('prima:iniziata') && !store.cursore('prima:imparato')) {
      for (const f of finali) {
        try { await f() } catch (err) { console.error('myynd · prima lettura · dopo:', err instanceof Error ? err.message : err) }
      }
      store.segnaCursore('prima:imparato', new Date().toISOString())
    }
  }
  // si comincia al giro dopo: il conto è già «in coda» quando il primo passo parte
  const p = Promise.resolve().then(async () => {
    try { await (conto ? chi.dentro(conto, lavoro) : lavoro()) }
    catch (err) { console.error('myynd · prima lettura · il resto non si è letto:', err instanceof Error ? err.message : err) }
    finally { inVolo.delete(conto); cedute.delete(conto) }
  })
  inVolo.set(conto, p)
  return p
}
