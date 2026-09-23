// A resumable first project, grounded in quoted documents and the user's goal.
// This module never calls a model or treats an excerpt as verified understanding.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cartella, lingua } from './config.ts'
import * as progetti from './progetti.ts'
import * as store from './store.ts'
import { dopo } from './ordine.ts'
import { giornoValido } from './giorno-compito.ts'
import { parti } from './fuso.ts'
import { CATALOGO } from './connettori/registro.ts'

/** Quanto indietro si guarda per spiegare un progetto che comincia adesso. */
const GIORNI_EVIDENZE = 180

export type FattoAvvio = {
  id: string
  testo: string
  evidenza: { doc: string; titolo: string; fonte: string; estratto: string }
  confermato: boolean
}

export type RisultatoAvvio = {
  tipo: 'prima_traccia'
  progetto: { id: string; nome: string; obiettivo: string }
  compito: { id: string; testo: string; giorno: string | null }
  /** `fonte` manca negli avvii chiusi quando la fonte era una sola: era quella di `Salvato.fonte`. */
  traccia: { obiettivo: string; estratti: { testo: string; doc: string; titolo: string; fonte?: string }[]; prossimaAzione: string }
}

export type StatoAvvio = {
  id: string
  revisione: number
  fase: 'progetto' | 'fonte' | 'verifica' | 'azione' | 'completo'
  progetto: { nome: string; obiettivo: string } | null
  /** Le fonti lette insieme per questo avvio, nell'ordine in cui le ha messe la persona. */
  fonti: string[]
  /** La prima di `fonti`: resta per chi parla ancora con una fonte sola. */
  fonte: string | null
  fonteSaltata: boolean
  fatti: FattoAvvio[]
  azione: string
  risultato: RisultatoAvvio | null
  aggiornato: string
}

/*
 * Le fonti sono diventate una lista, e il file resta alla versione 1.
 *
 * Prima di chiedere di collegarle tutte e leggerle insieme l'avvio ne teneva
 * una sola, in `fonte`. Un avvio salvato così deve riprendere da dove era: se
 * `fonti` manca, la lista è quella fonte sola (`fontiDi`). E si continua a
 * scrivere anche `fonte`, la prima della lista, così un'app di prima che
 * riapre questo file trova quello che si aspetta invece di un avvio illeggibile.
 */
type Salvato = {
  versione: 1; id: string; revisione: number; progetto: StatoAvvio['progetto']
  fonte: string | null; fonti?: string[]; fonteScelta: boolean; verificato: boolean; confermati: string[]
  azione: string; risultato: RisultatoAvvio | null; aggiornato: string
  inCorso?: Intenzione | null
}

function fontiDi(s: Salvato): string[] {
  if (Array.isArray(s.fonti)) return s.fonti.filter((f): f is string => typeof f === 'string')
  return s.fonte ? [s.fonte] : []
}

type Intenzione = {
  progetto: { nome: string; obiettivo: string }; azione: string; giorno: string | null
  estratti: RisultatoAvvio['traccia']['estratti']; inglese: boolean
}
let dopoCompitoPerProva: (() => void) | null = null
export const perProva = { dopoCompito: (fn: (() => void) | null) => { dopoCompitoPerProva = fn } }

export class ErroreAvvio extends Error {
  readonly stato: number
  constructor(messaggio: string, stato = 400) { super(messaggio); this.stato = stato }
}

const file = () => join(cartella(), 'avvio.json')
function salva(s: Salvato) {
  mkdirSync(cartella(), { recursive: true, mode: 0o700 })
  const temporaneo = `${file()}.${randomUUID()}.tmp`
  writeFileSync(temporaneo, JSON.stringify(s, null, 2), { mode: 0o600, flush: true })
  renameSync(temporaneo, file())
}

function leggi(): Salvato {
  if (!existsSync(file())) {
    const nuovo: Salvato = { versione: 1, id: randomUUID(), revisione: 0, progetto: null, fonte: null, fonti: [],
      fonteScelta: false, verificato: false, confermati: [], azione: '', risultato: null, aggiornato: new Date().toISOString() }
    salva(nuovo)
    return nuovo
  }
  let s: Salvato
  try {
    s = JSON.parse(readFileSync(file(), 'utf8')) as Salvato
    if (s.versione !== 1 || !s.id || !Number.isInteger(s.revisione) || !Array.isArray(s.confermati)) throw new Error('schema')
  } catch { throw new ErroreAvvio('Non riesco a rileggere questo avvio. I dati sono ancora al loro posto.', 500) }
  return s.inCorso && !s.risultato ? finalizza(s) : s
}

function esigiRevisione(s: Salvato, revisione: unknown) {
  if (!Number.isInteger(revisione) || revisione !== s.revisione) {
    throw new ErroreAvvio('Questo avvio è cambiato in un’altra finestra. Rileggilo e riprova.', 409)
  }
}

function testoValido(v: unknown, limite: number, messaggio: string): string {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > limite) throw new ErroreAvvio(messaggio)
  return v.trim()
}

function cambia(s: Salvato): StatoAvvio {
  s.revisione++
  s.aggiornato = new Date().toISOString()
  salva(s)
  return pubblico(s)
}

/** At most three literal excerpts, from the selected sources and real project matches. */
function evidenze(s: Salvato): FattoAvvio[] {
  const fonti = fontiDi(s)
  if (!s.progetto || !fonti.length) return []
  const p = s.progetto
  /*
   * Una ricerca per fonte, non una sola su tutte.
   *
   * Con trenta risultati in comune, una casella di posta che nomina il
   * progetto in cinquanta messaggi riempie la lista da sola, e il documento
   * del progetto che sta sul Mac non arriva nemmeno a essere guardato. Ogni
   * fonte ha i suoi trenta, e più sotto si prende a turno da ognuna.
   */
  const documenti = fonti.flatMap(f => [...store.cerca(p.nome, 30, [f]), ...store.cerca(p.obiettivo, 30, [f])])
  /*
   * E non quello che è vecchio.
   *
   * Questa ricerca guardava l'indice intero, senza guardare le date, e su
   * questa persona ha pescato il suo curriculum: il progetto si chiama
   * «H-Farm», che è anche la scuola che ha fatto, e «H-FARM» sta scritto dieci
   * volte in un PDF di un anno fa. Da lì è uscita la frase che è diventata il
   * suo primo compito, e da quel compito il punto ha staccato figli per giorni
   * — «Identify who will own and score the clean number for the proof», che
   * non vuol dire niente ed è una riga del suo curriculum.
   *
   * Un progetto che comincia adesso non si spiega con un file di un anno fa:
   * si spiega con quello che sta succedendo. Sei mesi è largo — un contratto
   * firmato a primavera spiega ancora — e taglia comunque un curriculum e i
   * compiti dell'università.
   *
   * Il filtro sulla forma (`documentoVero`) qui non serve e farebbe danno: lì
   * un `.md` non è un documento vero perché non è «arrivato», ma un appunto di
   * progetto scritto a mano è esattamente la prova migliore che ci sia. E il
   * curriculum, che è un PDF sulla scrivania, lo passerebbe comunque.
   */
  const soglia = Date.now() - GIORNI_EVIDENZE * 86_400_000
  const recente = (d: store.Documento) => !d.quando || Date.parse(d.quando) >= soglia
  const unici = [...new Map(documenti.map(d => [d.id, d])).values()]
    .filter(d => !d.massa && recente(d) && progetti.tocca(p, `${d.titolo}\n${d.corpo}`))
  /*
   * A turno fra le fonti: il primo documento di ognuna, poi il secondo.
   *
   * Il giro qui sotto prende la prima frase di ogni documento nell'ordine in
   * cui li trova, e con le fonti una dopo l'altra i tre estratti venivano
   * tutti dalla prima: chi aveva collegato il Mac e l'agenda vedeva solo il
   * Mac, cioè l'avvio che ne legge una sola. Mescolati così, tre fonti danno
   * un estratto ciascuna. Dentro una fonte resta l'ordine della ricerca.
   */
  const perFonte = fonti.map(f => unici.filter(d => d.fonte === f))
  const alterni = Array.from({ length: Math.max(0, ...perFonte.map(l => l.length)) }, (_, i) => perFonte.map(l => l[i]))
    .flat().filter((d): d is store.Documento => !!d)
  const perDocumento = alterni.map(d => {
    // Markdown titles and metadata identify a document; they are not facts
    // about the project. Remove only structural lines, keeping body excerpts
    // literal so every displayed character remains verifiable at the source.
    const corpo = d.corpo.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, '')
    const linee = corpo.split(/\r?\n/)
    const contenuto = linee.filter((r, i) => !/^\s{0,3}#{1,6}(?:\s|$)/.test(r)
      && !/^\s*(?:=+|-+)\s*$/.test(r)
      && !/^\s*(?:=+|-+)\s*$/.test(linee[i + 1] ?? ''))
    const righe = contenuto.flatMap(r => r.split(/(?<=[.!?])\s+/u)).map(r => r.trim()).filter(r => r.length >= 35)
    const pertinenti = righe.filter(r => progetti.tocca(p, r))
    // The title itself can identify the project. Every returned character is
    // still from the source body, with no paraphrase or inferred commitment.
    const scelte = pertinenti.length ? pertinenti : righe
    return scelte.slice(0, 3).map(r => {
      const estratto = r.slice(0, 420)
      return { id: createHash('sha256').update(`${d.id}\0${estratto}`).digest('hex').slice(0, 24), testo: estratto,
        evidenza: { doc: d.id, titolo: d.titolo, fonte: d.fonte, estratto }, confermato: false }
    })
  })
  const fatti: FattoAvvio[] = []
  const testi = new Set<string>()
  for (let giro = 0; giro < 3 && fatti.length < 3; giro++) {
    for (const righe of perDocumento) {
      const fatto = righe[giro]
      if (!fatto || testi.has(fatto.testo)) continue
      testi.add(fatto.testo)
      fatti.push({ ...fatto, confermato: s.confermati.includes(fatto.id) })
      if (fatti.length === 3) break
    }
  }
  return fatti
}

function pubblico(s: Salvato): StatoAvvio {
  const fatti = s.risultato ? s.risultato.traccia.estratti.map(e => ({
    id: createHash('sha256').update(`${e.doc}\0${e.testo}`).digest('hex').slice(0, 24), testo: e.testo,
    evidenza: { doc: e.doc, titolo: e.titolo, fonte: e.fonte ?? s.fonte ?? '', estratto: e.testo }, confermato: true
  })) : evidenze(s)
  const fonti = fontiDi(s)
  return { id: s.id, revisione: s.revisione,
    fase: s.risultato ? 'completo' : !s.progetto ? 'progetto' : !s.fonteScelta ? 'fonte'
      : s.verificato ? 'azione' : 'verifica',
    progetto: s.progetto, fonti, fonte: fonti[0] ?? null, fonteSaltata: s.fonteScelta && !fonti.length,
    fatti, azione: s.azione, risultato: s.risultato, aggiornato: s.aggiornato }
}

export function stato(): StatoAvvio { return pubblico(leggi()) }

export function progetto(b: { nome?: unknown; obiettivo?: unknown; revisione?: unknown }): StatoAvvio {
  const s = leggi(); esigiRevisione(s, b.revisione)
  if (s.risultato) return pubblico(s)
  const nome = testoValido(b.nome, 160, 'Scrivi un nome per il progetto, entro 160 caratteri.')
  const obiettivo = testoValido(b.obiettivo, 1_000, 'Scrivi un obiettivo concreto, entro 1.000 caratteri.')
  if (s.progetto?.nome !== nome || s.progetto?.obiettivo !== obiettivo) {
    s.confermati = []; s.verificato = false
  }
  s.progetto = { nome, obiettivo }; s.azione = obiettivo
  return cambia(s)
}

/**
 * Le fonti da leggere insieme: `fonti`, una lista; vuota vuol dire «continuo senza».
 *
 * `fonte` da sola — una stringa, o `null` per saltare — è la domanda di prima,
 * quando se ne sceglieva una: un client rimasto indietro la manda ancora, e
 * vale come una lista di una.
 */
export function fonte(b: { fonti?: unknown; fonte?: unknown; revisione?: unknown }): StatoAvvio {
  const s = leggi(); esigiRevisione(s, b.revisione)
  if (s.risultato) return pubblico(s)
  if (!s.progetto) throw new ErroreAvvio('Scegli prima il progetto e l’obiettivo.')
  const chieste: unknown[] = Array.isArray(b.fonti) ? b.fonti : b.fonte === null ? [] : [b.fonte]
  if (chieste.length > CATALOGO.length || chieste.some(f => !CATALOGO.some(c => c.legge && c.id === f))) {
    throw new ErroreAvvio('Scegli una fonte disponibile oppure continua senza.')
  }
  const fonti = [...new Set(chieste as string[])]
  // l'ordine non cambia cosa si legge: solo un'altra fonte, o una in meno, rimette in discussione gli estratti
  const prima = fontiDi(s)
  const uguali = s.fonteScelta && prima.length === fonti.length && fonti.every(f => prima.includes(f))
  s.fonti = fonti; s.fonte = fonti[0] ?? null; s.fonteScelta = true
  // ma l'ordine decide chi parla per primo nel giro a turno: se un estratto
  // confermato non c'è più fra i tre, la conferma non vale più
  const ancora = uguali && s.confermati.length ? new Set(evidenze(s).map(f => f.id)) : null
  if (!uguali || (ancora && s.confermati.some(id => !ancora.has(id)))) { s.confermati = []; s.verificato = false }
  if (!fonti.length) s.verificato = true
  return cambia(s)
}

export function conferma(b: { ids?: unknown; revisione?: unknown }): StatoAvvio {
  const s = leggi(); esigiRevisione(s, b.revisione)
  if (s.risultato) return pubblico(s)
  if (!s.progetto || !s.fonteScelta) throw new ErroreAvvio('Scegli prima il progetto e una fonte, oppure salta la fonte.')
  if (!Array.isArray(b.ids) || b.ids.length > 3 || b.ids.some(id => typeof id !== 'string')) throw new ErroreAvvio('Scegli fino a tre estratti da confermare.')
  const attuali = new Set(evidenze(s).map(f => f.id))
  if (b.ids.some(id => !attuali.has(id))) throw new ErroreAvvio('Gli estratti sono cambiati. Rileggili prima di confermare.', 409)
  s.confermati = [...new Set(b.ids)] as string[]; s.verificato = true
  return cambia(s)
}

export function completa(b: { azione?: unknown; giorno?: unknown; revisione?: unknown }): StatoAvvio {
  const s = leggi()
  // A retry after a lost successful response returns the same project/task.
  if (s.risultato) return pubblico(s)
  esigiRevisione(s, b.revisione)
  if (!s.progetto) throw new ErroreAvvio('Scegli prima il progetto e l’obiettivo.')
  if (!s.fonteScelta || !s.verificato) throw new ErroreAvvio('Conferma gli estratti o scegli esplicitamente di continuare senza.')
  const azione = testoValido(b.azione, 2_000, 'Scrivi la prossima azione, entro 2.000 caratteri.')
  const giorno = b.giorno ?? null
  if (giorno !== null && !giornoValido(giorno)) throw new ErroreAvvio('Data non valida.')
  const fatti = evidenze(s)
  if (s.confermati.some(id => !fatti.some(f => f.id === id))) throw new ErroreAvvio('Gli estratti sono cambiati. Rileggili prima di confermare.', 409)
  const estratti = fatti.filter(f => f.confermato).map(f => ({ testo: f.testo, doc: f.evidenza.doc, titolo: f.evidenza.titolo, fonte: f.evidenza.fonte }))
  // Record the full intent before writing either project or task. A process
  // crash resumes this exact intent before another edit can be accepted.
  s.inCorso = { progetto: { ...s.progetto }, azione, giorno, estratti, inglese: lingua() === 'en' }
  salva(s)
  return pubblico(finalizza(s))
}

function finalizza(s: Salvato): Salvato {
  const intenzione = s.inCorso!
  const { azione, giorno, estratti, progetto, inglese: en } = intenzione
  const id = `avvio-${s.id}`
  const gia = store.compito(id)
  // Read an existing task before touching project metadata. That task may
  // have been inserted before a crash, and its identity/link must survive.
  const p = (gia?.progetto ? progetti.trova(gia.progetto) : null) ?? progetti.scrivi({ ...progetto, origine: 'mano' })
  if (!gia && p.obiettivo !== progetto.obiettivo) progetti.cambia(p.id, { obiettivo: progetto.obiettivo })
  const traccia = { obiettivo: progetto.obiettivo, estratti, prossimaAzione: azione }
  const nota = [en ? 'First outline — not a completed task.' : 'Prima traccia — attività ancora da svolgere.',
    `${en ? 'Project' : 'Progetto'}: ${progetto.nome}`,
    `${en ? 'Goal' : 'Obiettivo'}: ${traccia.obiettivo}`,
    ...estratti.map(e => `${en ? 'Source' : 'Fonte'}: ${e.titolo}\n“${e.testo}”`),
    `${en ? 'Next action' : 'Prossima azione'}: ${azione}`].join('\n\n')
  const data = parti(new Date())
  const oggi = `${data.anno}-${String(data.mese).padStart(2, '0')}-${String(data.giorno).padStart(2, '0')}`
  const quando = giorno ? giorno <= oggi ? 'oggi' : 'settimana' : 'poi'
  // If a crash occurred after task insertion, adopt that task intact.
  if (!gia) store.scriviCompito({ id, testo: azione, nota, giorno, quando, progetto: p.id,
    ordine: dopo(store.ultimoOrdine(quando)), origine: 'avvio', doc: estratti[0]?.doc ?? null })
  dopoCompitoPerProva?.()
  s.azione = gia?.testo ?? azione
  s.progetto = { ...progetto }
  s.risultato = { tipo: 'prima_traccia', progetto: { id: p.id, ...progetto },
    compito: { id, testo: gia?.testo ?? azione, giorno: gia?.giorno ?? giorno }, traccia: { ...traccia, prossimaAzione: gia?.testo ?? azione } }
  s.inCorso = null
  s.revisione++
  s.aggiornato = new Date().toISOString()
  salva(s)
  return s
}
