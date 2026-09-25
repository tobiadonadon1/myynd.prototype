// Le sezioni delle Preferenze e della Memoria, senza disegno (P5).
//
// Quali sezioni, in che ordine, con quali schede, e la nota di stato accanto
// al titolo nella colonna di sinistra. Poi: da quale sezione si parte, il
// biglietto che porta a una scheda precisa da un'altra schermata, la chiave
// con cui si ricorda l'ultima sezione aperta, e l'etichetta che dice da dove
// viene una convinzione. Tutto qui per potersi provare sotto node.

import { frasi, t } from './lingua.ts'

export type SezionePref = 'myynd' | 'intelligenza' | 'account'
export type SezioneMem = 'progetti' | 'come-lavori' | 'ritratto' | 'fatto'
export type Pagina = 'pref' | 'memoria'

/** Quello che la Memoria sa di sé senza aprire niente: i numeri delle note. */
export type Sommario = {
  progettiAttivi: number
  ritratto: { sa: number; daGuardare: number }
  comeLavori: { daGuardare: number } | null
  fatto: { minuti: number } | null
}

export type Sezione<Id extends string = string> = {
  id: Id
  titolo: string
  /** Lo stato in due parole accanto al titolo: mai una frase che insegna. */
  nota: string
  /** La nota è una cosa che aspetta lui: di rame. */
  notaRame: boolean
  /** Le schede in ordine, con gli id che `v.apri(pagina, sezione, scheda)` sa trovare. */
  schede: string[]
}

export function sezioniPreferenze(o: { desktop: boolean; osservatore: boolean; motoreDaCollegare: boolean }): Sezione<SezionePref>[] {
  const guarda = o.desktop && o.osservatore
  return [
    {
      id: 'myynd', titolo: t('Il tuo Myynd'),
      nota: guarda ? t('Fuoco, notizie, autonomia, osservazione, tono') : t('Fuoco, notizie, autonomia, tono'),
      notaRame: false,
      schede: ['fuoco', 'notizie', 'autonomia', ...(guarda ? ['osservazione'] : []), 'tono']
    },
    {
      id: 'intelligenza', titolo: t('Intelligenza e costi'),
      nota: o.motoreDaCollegare ? t('Motore da collegare') : t('Motore, modelli, consumo'),
      notaRame: o.motoreDaCollegare,
      schede: ['motore', 'modelli', 'consumo']
    },
    {
      id: 'account', titolo: t('Account e app'),
      nota: t('Nome, lingua, aspetto, accesso, dati'),
      notaRame: false,
      schede: ['nome', 'lingua', ...(o.desktop ? ['app'] : []), 'accesso', 'dati', 'cancella']
    }
  ]
}

/** Le quattro sezioni della Memoria, con la nota che dice come stanno adesso. Senza sommario, nessuna nota. */
export function sezioniMemoria(s: Sommario | null): Sezione<SezioneMem>[] {
  const cl = s?.comeLavori?.daGuardare ?? 0
  const rg = s?.ritratto.daGuardare ?? 0
  const sa = s?.ritratto.sa ?? 0
  const minuti = s?.fatto?.minuti ?? 0
  return [
    { id: 'progetti', titolo: t('Progetti'), nota: s ? frasi.attivi(s.progettiAttivi) : '', notaRame: false, schede: ['parole', 'progetti', 'nuovo'] },
    { id: 'come-lavori', titolo: t('Come lavori'), nota: cl > 0 ? frasi.quanteDaGuardare(cl) : '', notaRame: cl > 0, schede: [] },
    {
      id: 'ritratto', titolo: t('Il tuo ritratto'),
      nota: rg > 0 ? frasi.quanteDaGuardare(rg) : s && sa > 0 ? frasi.coseCheSa(sa) : '',
      notaRame: rg > 0, schede: ['da-guardare', 'domande', 'sa', 'prima']
    },
    { id: 'fatto', titolo: t('Cosa ha fatto Myynd'), nota: minuti > 0 ? frasi.questaSettimana(minuti) : '', notaRame: false, schede: ['documenti'] }
  ]
}

/**
 * Da quale sezione si parte. In ordine: quella chiesta, poi i progetti se
 * c'è un biglietto per un progetto (solo in Memoria), poi quella della cosa
 * più nuova se il punto era acceso (solo in Memoria), poi l'ultima aperta,
 * poi la prima. Un id che non c'è si salta.
 */
export function sezioneIniziale(o: {
  pagina: Pagina; richiesta: string | null; biglietto: boolean; nuove: string | null; ricordata: string | null; valide: string[]
}): string {
  const ok = (x: string | null | undefined): x is string => !!x && o.valide.includes(x)
  if (ok(o.richiesta)) return o.richiesta
  if (o.pagina === 'memoria' && o.biglietto && ok('progetti')) return 'progetti'
  if (o.pagina === 'memoria' && ok(o.nuove)) return o.nuove
  if (ok(o.ricordata)) return o.ricordata
  return o.valide[0] ?? ''
}

// — il biglietto: «portami su quella scheda», come `progettoAtteso` in vals.ts —

type Biglietto = { sezione?: string; scheda?: string }
const biglietti = new Map<Pagina, Biglietto>()
const inAscolto = new Set<(pagina: Pagina) => void>()

export function chiediSezione(pagina: Pagina, sezione?: string, scheda?: string): void {
  biglietti.set(pagina, { ...(sezione ? { sezione } : {}), ...(scheda ? { scheda } : {}) })
  for (const f of inAscolto) f(pagina)
}
/** Guardare non consuma: la pagina può montarsi due volte e trovarlo ancora. */
export function sezioneAttesa(pagina: Pagina): Biglietto | null {
  return biglietti.get(pagina) ?? null
}
export function dimenticaSezione(pagina: Pagina): void {
  biglietti.delete(pagina)
}
/** Per una pagina già aperta: il biglietto è arrivato adesso. */
export function ascoltaSezione(f: (pagina: Pagina) => void): () => void {
  inAscolto.add(f)
  return () => { inAscolto.delete(f) }
}

/** djb2, in base 36: un indirizzo non finisce mai scritto nel deposito del browser. */
function impronta(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Dove si ricorda l'ultima sezione aperta, per conto. Mai l'indirizzo in chiaro. */
export function chiaveRicordo(pagina: Pagina, email: string | null): string {
  return `myynd.sezione.${pagina}.${email ? impronta(email.trim().toLowerCase()) : ''}`
}

/** Da dove viene una convinzione, in parole neutre. Un'origine che non si conosce non si disegna. */
export function etichettaOrigine(genere: string, origine: string): string | null {
  switch (origine) {
    case 'mano': return t('Scritta da te')
    case 'conversazione': return genere === 'esplicita' ? t('Detta in chat') : t('Da una chat')
    case 'correzione': return t('Da una bozza corretta')
    case 'chiusura': return t('Da un’attività chiusa')
    case 'abbandono': return t('Da un’attività lasciata')
    case 'scarti': return t('Da quello che scarti')
    case 'domanda': return t('Da una tua risposta')
    case 'onboarding': return t('Dal primo avvio')
    default: return null
  }
}

/** «forse» sotto lo 0,8; sopra, niente. */
export function fiduciaInParole(f: number): string | null {
  return f < 0.8 ? t('forse') : null
}
