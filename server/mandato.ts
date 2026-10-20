// Il mandato di un progetto: fin dove Myynd arriva da solo.
//
// La decisione del 17 ottobre: l'autonomia non si chiede passo per passo, si
// conferma una volta per progetto. Il mandato dice a cosa punta il progetto
// (`esito`), come si saprà che ci è arrivato (`misura`), entro quando, da
// quali fonti può leggere, quanto può spendere al mese, quando lo si
// rivede, e per ogni classe di azione una di tre regole:
//
//   · `auto`   la fa e basta (una bozza nella casella, un file, una nota);
//   · `chiedi` non la fa: la prepara come proposta, e la fa il suo tocco;
//   · `mai`    non la fa, e lo dice a chi lavora come errore dell'attrezzo.
//
// Tre cose che questo file tiene ferme:
//
//   · Il mandato lo scrive solo lei. `salva` è chiamato dalla rotta delle
//     impostazioni del progetto e dalle sue risposte a una domanda di Myynd
//     (il sì al mandato proposto, il sì al lato in `lato-nota.ts`, con le
//     regole fisse di `LATI`); niente di quello che passa dal modello, da una
//     pagina web, da una mail o dall'uscita di un attrezzo arriva qui.
//     `decidi` legge e basta.
//   · Finché non l'ha confermato valgono le regole di serie, o le sue se sono
//     più strette: un mandato proposto non allarga mai niente.
//   · Un attrezzo che non conosciamo chiede. Un nome nuovo è un permesso
//     nuovo, e un permesso nuovo non si dà per distrazione.
//
// API per chi viene dopo (la coda dei candidati): `di`, `regole`, `regolaPer`,
// `classeDi`, `decidi`, `autonomia`, `fonteAmmessa`, `budgetFinito`.

import { createHash } from 'node:crypto'
import { isAbsolute, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import db, * as store from './store.ts'
import { lingua } from './config.ts'
import * as ordine from './ordine.ts'
import * as tracce from './tracce.ts'

// — le classi di azione —

export type Classe =
  | 'bozza_posta' | 'file' | 'notion' | 'nota' | 'codice_copia' | 'codice_applica'
  | 'invio' | 'pubblica' | 'calendario' | 'paga' | 'cancella' | 'contatto_nuovo'
export const CLASSI: readonly Classe[] = [
  'bozza_posta', 'file', 'notion', 'nota', 'codice_copia', 'codice_applica',
  'invio', 'pubblica', 'calendario', 'paga', 'cancella', 'contatto_nuovo'
]

export type Regola = 'auto' | 'chiedi' | 'mai'
export const REGOLE: readonly Regola[] = ['auto', 'chiedi', 'mai']

/** Le regole di serie: prepara da solo, chiede per tutto quello che esce, mai soldi né cancellazioni. */
export const PREDEFINITE: Readonly<Record<Classe, Regola>> = {
  bozza_posta: 'auto', file: 'auto', notion: 'auto', nota: 'auto', codice_copia: 'auto',
  codice_applica: 'chiedi', invio: 'chiedi', pubblica: 'chiedi', calendario: 'chiedi', contatto_nuovo: 'chiedi',
  paga: 'mai', cancella: 'mai'
}

/**
 * Le classi che il lavoro da solo non sa ancora fare: nessuna mano manda,
 * pubblica, paga o tocca l'agenda. Per loro «auto» non si può scegliere, così
 * il mandato non promette quello che non esiste: solo «chiedi» o «mai».
 */
export const SENZA_MANO: readonly Classe[] = ['invio', 'pubblica', 'paga', 'calendario']

/** Gli attrezzi che una proposta con un dito sa eseguire (`proposte.ts`, con `mani.esegui`). */
export const ESEGUIBILI_COL_TOCCO: readonly string[] = ['crea_nota', 'scrivi_file', 'scrivi_notion', 'lavora_nel_codice']

/** Quanto pesa una regola: la più stretta vince. */
const PESO: Record<Regola, number> = { auto: 0, chiedi: 1, mai: 2 }
export function piuStretta(a: Regola, b: Regola): Regola { return PESO[a] >= PESO[b] ? a : b }

/**
 * Ogni attrezzo che c'è, con la sua classe. `leggi` non è una classe del
 * mandato: leggere non esce da niente, e vale sempre (dentro le fonti).
 * Le chiavi sono i nomi dei tool come li vede il modello (`mani.ts`,
 * `claude.ts`) e i nomi delle proposte con un dito (`store.Proposta`).
 */
export const ATTREZZI: Readonly<Record<string, Classe | 'leggi'>> = {
  // le mani (`mani.ts`)
  leggi_file: 'leggi', leggi_pagina: 'leggi', cerca_web: 'leggi',
  crea_nota: 'nota', scrivi_file: 'file', scrivi_notion: 'notion', lavora_nel_codice: 'codice_copia',
  // i due di sempre, e il documento nativo (`claude.ts`)
  cerca: 'leggi', apri: 'leggi', crea_documento_app: 'file',
  // le proposte con un dito (`store.Proposta`)
  'posta.bozza': 'bozza_posta', 'nota.crea': 'nota', 'file.crea': 'file',
  'agenda.aggiungi': 'calendario', 'posta.cestina': 'cancella'
}

/**
 * La classe di un attrezzo, o null se non lo conosciamo (allora chiede).
 * Gli attrezzi dichiarati di `attrezzi.ts` finiscono tutti in `.leggi` (o
 * sono `claude.lavora`, che legge in modalità piano): leggono e basta.
 */
export function classeDi(nome: string): Classe | 'leggi' | null {
  const n = String(nome ?? '').trim()
  if (Object.hasOwn(ATTREZZI, n)) return ATTREZZI[n]
  if (/^[a-z]+\.leggi$/.test(n) || /^[a-z]+_leggi$/.test(n) || n === 'claude.lavora') return 'leggi'
  return null
}

// — il mandato —

export type Stato = 'proposto' | 'confermato'

export type Mandato = {
  progetto: string
  /** A cosa punta: una riga. */
  esito: string
  /** Come si saprà che ci è arrivato: «un pagamento su Stripe», «una risposta firmata». */
  misura: string
  /** Entro quando, `YYYY-MM-DD`, o null. */
  scadenza: string | null
  /** Le fonti che può leggere: id di fonti collegate e cartelle. Null: tutte. */
  fonti: string[] | null
  classi: Record<Classe, Regola>
  /** Dollari al mese per il lavoro di questo progetto, o null (vale il tetto di sempre). */
  budget: number | null
  /** Quando lo si rivede, `YYYY-MM-DD`, o null. */
  revisione: string | null
  stato: Stato
  /** Chi l'ha scritto: `serie` (nessuna riga ancora), `dedotto` (Myynd lo propone), `lei`. */
  origine: 'serie' | 'dedotto' | 'lei'
  aggiornato: string | null
  confermato: string | null
}

const GIORNO = /^\d{4}-\d{2}-\d{2}$/
/** Il budget più alto che si può scrivere su un progetto, in dollari al mese. */
export const BUDGET_MAX = 1000

type Riga = {
  progetto: string; esito: string | null; misura: string | null; scadenza: string | null; fonti: string | null
  classi: string; budget: number | null; revisione: string | null; stato: string; origine: string | null
  aggiornato: string; confermato: string | null
}

function classiDa(json: string | null | undefined): Record<Classe, Regola> {
  let grezzo: Record<string, unknown> = {}
  try { const x = JSON.parse(json ?? '{}'); if (x && typeof x === 'object') grezzo = x } catch { /* di serie */ }
  const fuori = { ...PREDEFINITE } as Record<Classe, Regola>
  for (const c of CLASSI) {
    const r = grezzo[c]
    if (typeof r === 'string' && (REGOLE as readonly string[]).includes(r)) fuori[c] = r as Regola
  }
  return fuori
}

function daRiga(r: Riga): Mandato {
  let fonti: string[] | null = null
  try { const x = r.fonti ? JSON.parse(r.fonti) : null; if (Array.isArray(x)) fonti = x.filter((s): s is string => typeof s === 'string') } catch { /* tutte */ }
  return {
    progetto: r.progetto, esito: r.esito ?? '', misura: r.misura ?? '', scadenza: r.scadenza, fonti,
    classi: classiDa(r.classi), budget: r.budget, revisione: r.revisione,
    stato: r.stato === 'confermato' ? 'confermato' : 'proposto',
    origine: r.origine === 'lei' ? 'lei' : 'dedotto', aggiornato: r.aggiornato, confermato: r.confermato
  }
}

/** Il mandato di serie, per un progetto che non ne ha ancora uno (o per una carta senza progetto). */
export function diSerie(progetto: string | null): Mandato {
  return {
    progetto: progetto ?? '', esito: '', misura: '', scadenza: null, fonti: null, classi: { ...PREDEFINITE },
    budget: null, revisione: null, stato: 'proposto', origine: 'serie', aggiornato: null, confermato: null
  }
}

/** Il mandato scritto di un progetto, o null se non c'è ancora una riga. */
export function scritto(progetto: string): Mandato | null {
  const r = db.prepare('SELECT * FROM mandati WHERE progetto = ?').get(progetto) as Riga | undefined
  return r ? daRiga(r) : null
}

/** Il mandato di un progetto: quello scritto, o quello di serie. Mai null. */
export function di(progetto: string | null | undefined): Mandato {
  if (!progetto) return diSerie(null)
  try { return scritto(progetto) ?? diSerie(progetto) } catch { return diSerie(progetto) }
}

/**
 * Le regole che valgono adesso. Confermato: le sue. Proposto: per ogni
 * classe la più stretta fra la sua e quella di serie, così un mandato non
 * ancora confermato non allarga mai niente.
 */
export function regole(m: Mandato): Record<Classe, Regola> {
  if (m.stato === 'confermato') return { ...m.classi }
  const fuori = {} as Record<Classe, Regola>
  for (const c of CLASSI) fuori[c] = piuStretta(m.classi[c], PREDEFINITE[c])
  return fuori
}

export function regolaPer(progetto: string | null | undefined, c: Classe): Regola {
  return regole(di(progetto))[c]
}

/**
 * Quanto Myynd può fare da sé su questo progetto. Finché il mandato non è
 * confermato prepara e basta (le regole di serie); confermato, sceglie e fa
 * i passi a basso rischio dentro il mandato senza che glielo si chieda.
 */
export function autonomia(progetto: string | null | undefined): 'prepara' | 'agisce' {
  return di(progetto).stato === 'confermato' ? 'agisce' : 'prepara'
}

// — scrivere: solo dalla rotta delle impostazioni —

export type Cambio = {
  esito?: unknown; misura?: unknown; scadenza?: unknown; fonti?: unknown; classi?: unknown
  budget?: unknown; revisione?: unknown
}

const riga1 = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').replace(/\s*—\s*/g, ', ').trim().slice(0, max)

/**
 * Valida un cambio e torna i campi puliti, o lancia con una frase sua.
 * Una classe sconosciuta o una regola sconosciuta non passano: un mandato è
 * un vocabolario chiuso, come gli attrezzi.
 */
export function pulisci(c: Cambio): Partial<Pick<Mandato, 'esito' | 'misura' | 'scadenza' | 'fonti' | 'classi' | 'budget' | 'revisione'>> {
  const fuori: Partial<Pick<Mandato, 'esito' | 'misura' | 'scadenza' | 'fonti' | 'classi' | 'budget' | 'revisione'>> = {}
  if (c.esito !== undefined) fuori.esito = riga1(c.esito, 200)
  if (c.misura !== undefined) fuori.misura = riga1(c.misura, 160)
  for (const k of ['scadenza', 'revisione'] as const) {
    if (c[k] === undefined) continue
    if (c[k] === null || c[k] === '') { fuori[k] = null; continue }
    if (typeof c[k] !== 'string' || !GIORNO.test(c[k] as string) || !Number.isFinite(Date.parse(c[k] as string))) throw new Error('Una data è giorno, mese e anno.')
    fuori[k] = c[k] as string
  }
  if (c.fonti !== undefined) {
    if (c.fonti === null) fuori.fonti = null
    else if (Array.isArray(c.fonti) && c.fonti.every(s => typeof s === 'string')) {
      fuori.fonti = [...new Set((c.fonti as string[]).map(s => s.trim()).filter(Boolean))].slice(0, 60)
    } else throw new Error('Le fonti sono un elenco.')
  }
  if (c.classi !== undefined) {
    if (!c.classi || typeof c.classi !== 'object' || Array.isArray(c.classi)) throw new Error('Le regole non sono valide.')
    const cl = {} as Record<Classe, Regola>
    for (const [k, v] of Object.entries(c.classi as Record<string, unknown>)) {
      if (!(CLASSI as readonly string[]).includes(k)) throw new Error('Questa azione non la conosco.')
      if (typeof v !== 'string' || !(REGOLE as readonly string[]).includes(v)) throw new Error('Una regola è «da solo», «chiedi» o «mai».')
      if (v === 'auto' && (SENZA_MANO as readonly string[]).includes(k)) throw new Error('Questa azione Myynd non la fa ancora da solo: chiedi o mai.')
      cl[k as Classe] = v as Regola
    }
    fuori.classi = cl
  }
  if (c.budget !== undefined) {
    if (c.budget === null || c.budget === '') fuori.budget = null
    else {
      const n = Number(c.budget)
      if (!Number.isFinite(n) || n < 0 || n > BUDGET_MAX) throw new Error('Il budget è in dollari al mese, da 0 a 1000.')
      // zero è «nessun budget del progetto», come nel resto dell'app
      fuori.budget = n === 0 ? null : Math.round(n * 100) / 100
    }
  }
  return fuori
}

/**
 * Scrive il mandato. La chiamano la rotta delle impostazioni del progetto
 * (con `origine: 'lei'`), le sue risposte alle domande di Myynd
 * (`mandato-proposta.rispondi` e `lato-nota.rispondi`, `origine: 'lei'`:
 * il sì l'ha dato lei, e le regole del lato sono quelle fisse di `LATI`), e
 * `mandato-proposta.ts` per la prima proposta (`origine: 'dedotto'`, mai
 * sopra una riga che c'è già).
 * `conferma` lo porta a «confermato»; un cambio suo senza conferma lascia
 * lo stato com'era.
 */
export function salva(progetto: string, cambio: Cambio, o: { conferma?: boolean; origine?: 'lei' | 'dedotto' } = {}): Mandato {
  if (!progetto) throw new Error('Questo progetto non c’è.')
  const pulito = pulisci(cambio)
  const prima = scritto(progetto)
  const base = prima ?? diSerie(progetto)
  const ora = new Date().toISOString()
  const dopo: Mandato = {
    ...base, ...pulito,
    classi: { ...base.classi, ...(pulito.classi ?? {}) },
    stato: o.conferma ? 'confermato' : base.stato,
    origine: o.origine ?? 'lei',
    aggiornato: ora,
    confermato: o.conferma ? ora : base.confermato
  }
  db.prepare(`
    INSERT INTO mandati (progetto, esito, misura, scadenza, fonti, classi, budget, revisione, stato, origine, creato, aggiornato, confermato)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(progetto) DO UPDATE SET
      esito = excluded.esito, misura = excluded.misura, scadenza = excluded.scadenza, fonti = excluded.fonti,
      classi = excluded.classi, budget = excluded.budget, revisione = excluded.revisione, stato = excluded.stato,
      origine = excluded.origine, aggiornato = excluded.aggiornato, confermato = excluded.confermato
  `).run(
    progetto, dopo.esito, dopo.misura, dopo.scadenza, dopo.fonti ? JSON.stringify(dopo.fonti) : null,
    JSON.stringify(dopo.classi), dopo.budget, dopo.revisione, dopo.stato, dopo.origine, ora, ora, dopo.confermato
  )
  return scritto(progetto)!
}

// — le fonti e il budget —

const espandi = (p: string) => p === '~' || p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p)
const sotto = (radice: string, p: string) => p === radice || p.startsWith(radice.endsWith(sep) ? radice : radice + sep)

/**
 * Se una fonte si può leggere. Null nel mandato: tutte. Una cartella vale
 * per tutto quello che sta sotto; `web` vale per le pagine e le ricerche.
 */
export function fonteAmmessa(m: Mandato, fonte: { id?: string; percorso?: string }, cartellaDelCompito?: string | null): boolean {
  if (!m.fonti) return true
  if (fonte.percorso) {
    // un percorso relativo si intende dalla cartella della carta, come fa `leggi_file`; mai dalla cartella del processo
    const relativo = !isAbsolute(fonte.percorso) && fonte.percorso !== '~' && !fonte.percorso.startsWith('~/')
    if (relativo && !(cartellaDelCompito && isAbsolute(cartellaDelCompito))) return false
    const p = relativo ? resolve(cartellaDelCompito!, fonte.percorso) : espandi(fonte.percorso)
    if (cartellaDelCompito && isAbsolute(cartellaDelCompito) && sotto(resolve(cartellaDelCompito), p)) return true
    if (m.fonti.includes('file')) return true
    return m.fonti.some(f => (f.startsWith('/') || f.startsWith('~')) && sotto(espandi(f), p))
  }
  return !!fonte.id && m.fonti.includes(fonte.id)
}

/** Dollari spesi questo mese dalle carte di un progetto (dal registro dell'uso, in micro-dollari). */
export function spesaDelMese(progetto: string, adesso = new Date()): number {
  const inizio = new Date(adesso.getFullYear(), adesso.getMonth(), 1).toISOString()
  const r = db.prepare(`
    SELECT COALESCE(SUM(u.costo), 0) AS c FROM uso u JOIN compiti c ON c.id = u.compito
    WHERE c.progetto = ? AND u.quando >= ?
  `).get(progetto, inizio) as { c: number }
  return r.c / 1_000_000
}

/** Il budget del mese di questo progetto è finito? Senza budget, mai. */
export function budgetFinito(progetto: string | null | undefined, adesso = new Date()): boolean {
  if (!progetto) return false
  const m = di(progetto)
  if (m.budget == null) return false
  try { return spesaDelMese(progetto, adesso) >= m.budget } catch { return false }
}

// — il cancello —

/** Chi sta lavorando: per quale progetto, su quale carta, e se lei è lì a guardare. */
export type ChiLavora = {
  progetto: string | null
  compito?: string | null
  /** Lavoro presente (la chat, il suo tocco): solo `mai` ferma. Lavoro da solo (la coda): tutto il mandato. */
  presente: boolean
  cartella?: string | null
  luogo?: string | null
  chiaveNotion?: string | null
}

export type Verdetto =
  | { via: 'esegui'; classe: Classe | 'leggi'; soloCopia?: boolean }
  | { via: 'rifiuta'; classe: Classe | 'leggi' | null; motivo: 'mai' | 'fonte'; testo: string }
  | { via: 'chiedi'; classe: Classe | null; testo: string; proposta?: string | null }

const NOMI_IT: Record<Classe, string> = {
  bozza_posta: 'mettere bozze nella casella', file: 'scrivere file', notion: 'scrivere in Notion', nota: 'creare note',
  codice_copia: 'lavorare sul codice in una copia', codice_applica: 'posare il codice nel progetto vero',
  invio: 'mandare messaggi', pubblica: 'pubblicare', calendario: 'toccare il calendario', paga: 'pagare',
  cancella: 'cancellare', contatto_nuovo: 'scrivere a chi non ha mai sentito'
}

/** Il nome di una classe detto a chi lavora (il modello legge l'italiano). */
export function nomeDellaClasse(c: Classe): string { return NOMI_IT[c] }

/**
 * Decide se un attrezzo può partire. Legge il mandato dal disco ogni volta:
 * niente di quello che è passato nella conversazione può cambiarlo.
 *
 * `chiedi` non esegue: se c'è una carta, mette la proposta nella sua lista
 * (una carta nuova, con il bottone «Approva»), e torna il testo per il modello.
 */
export function decidi(nome: string, input: unknown, chi: ChiLavora): Verdetto {
  const classe = classeDi(nome)
  const m = di(chi.progetto)
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (classe === 'leggi') {
    if (nome === 'leggi_file' && typeof i.percorso === 'string' && !fonteAmmessa(m, { percorso: i.percorso }, chi.cartella)) {
      return { via: 'rifiuta', classe, motivo: 'fonte', testo: 'Fuori dal mandato: questa cartella non è fra le fonti di questo progetto. Non leggerla; lavora con quello che hai.' }
    }
    if ((nome === 'leggi_pagina' || nome === 'cerca_web') && !fonteAmmessa(m, { id: 'web' })) {
      return { via: 'rifiuta', classe, motivo: 'fonte', testo: 'Fuori dal mandato: il web non è fra le fonti di questo progetto. Lavora con quello che hai.' }
    }
    return { via: 'esegui', classe }
  }
  const r = regole(m)
  const regola: Regola = classe ? r[classe] : 'chiedi'
  if (regola === 'mai') {
    if (!chi.presente && chi.compito) tracce.ricevuta(chi.compito, 'trattenuto', `mai:${classe}`)
    return {
      via: 'rifiuta', classe, motivo: 'mai',
      testo: `Non permesso: il mandato di questo progetto dice che Myynd non deve mai ${classe ? NOMI_IT[classe] : 'farlo'}. Non riprovare e non cercare un altro modo; nella riga finale di' che questo passo resta a lei.`
    }
  }
  /*
   * Il codice si lavora nella copia; posarlo nel progetto vero è un'altra
   * classe. Se «codice_applica» non è «auto» si resta nella copia anche con
   * lei presente (anche approvando una proposta): si posa solo col tocco
   * esplicito «Applica», che rifiuta quando è «mai» (`posaPermessa`).
   */
  const soloCopia = classe === 'codice_copia' && r.codice_applica !== 'auto'
  if (chi.presente) return { via: 'esegui', classe: classe ?? 'leggi', ...(soloCopia ? { soloCopia: true } : {}) }
  if (regola === 'auto') {
    if (soloCopia) {
      if (chi.compito) tracce.ricevuta(chi.compito, 'trattenuto', 'codice_applica')
      return { via: 'esegui', classe: classe!, soloCopia: true }
    }
    return { via: 'esegui', classe: classe! }
  }
  // una proposta solo per quello che il tocco sa eseguire: le altre non nascono per fallire all'«Approva»
  const proposta = chi.compito && ESEGUIBILI_COL_TOCCO.includes(nome) ? proponiMano({ nome, input: i, classe, chi }) : null
  if (chi.compito) tracce.ricevuta(chi.compito, 'trattenuto', `chiedi:${classe ?? nome}`)
  return {
    via: 'chiedi', classe, proposta,
    testo: `Non fatto: per ${classe ? NOMI_IT[classe] : 'questo attrezzo'} il mandato di questo progetto vuole il suo sì.` +
      (proposta ? ' L\'ho messo nella sua lista come proposta da approvare con un tocco.' : '') +
      ' Non riprovare; nella riga finale di\' che aspetta lei.'
  }
}

/**
 * Se il codice lavorato nella copia si può posare nel progetto vero con il
 * tocco «Applica»: no solo quando il mandato dice «mai». Per chi aggiunge
 * quella rotta (`POST /api/lavoro/applica`).
 */
export function posaPermessa(progetto: string | null | undefined): boolean {
  return regolaPer(progetto, 'codice_applica') !== 'mai'
}

/** La regola per una bozza nella casella: chi non è mai stato scritto passa da `contatto_nuovo`. */
export function regolaPosta(progetto: string | null | undefined, conosciuto: boolean): Regola {
  const r = regole(di(progetto))
  return conosciuto ? r.bozza_posta : piuStretta(r.bozza_posta, r.contatto_nuovo)
}

// — la proposta con un dito —

export const ORIGINE = 'mandato'

/** Una mano trattenuta dal mandato, in attesa del suo tocco (`store.Proposta`, azione `mandato.mano`). */
export type ManoTrattenuta = {
  nome: string
  input: Record<string, unknown>
  classe: Classe | null
  titolo: string
  perche: string
  testo?: string
  /** La carta da cui è nata. */
  da: string
  progetto: string | null
  cartella?: string | null
  luogo?: string | null
  chiaveNotion?: string | null
}

const VERBI: Record<Classe, [string, string]> = {
  bozza_posta: ['Mettere fra le bozze', 'Put in your drafts'], file: ['Salvare il file', 'Save the file'],
  notion: ['Scrivere in Notion', 'Write in Notion'], nota: ['Creare la nota', 'Create the note'],
  codice_copia: ['Lavorare sul codice', 'Work on the code'], codice_applica: ['Posare il codice', 'Apply the code'],
  invio: ['Mandare', 'Send'], pubblica: ['Pubblicare', 'Publish'], calendario: ['Mettere in agenda', 'Add to calendar'],
  paga: ['Pagare', 'Pay'], cancella: ['Cancellare', 'Delete'], contatto_nuovo: ['Scrivere a', 'Write to']
}

function titoloDi(nome: string, i: Record<string, unknown>): string {
  const s = (k: string) => typeof i[k] === 'string' ? (i[k] as string).replace(/\s+/g, ' ').trim() : ''
  return (s('titolo') || s('percorso') || s('oggetto') || s('a') || s('richiesta') || nome).replace(/\s*[—–]\s*/g, ', ').slice(0, 120)
}

function proponiMano(o: { nome: string; input: Record<string, unknown>; classe: Classe | null; chi: ChiLavora }): string | null {
  try {
    const en = lingua() === 'en'
    const titolo = titoloDi(o.nome, o.input)
    const verbo = o.classe ? VERBI[o.classe][en ? 1 : 0] : (en ? 'Use' : 'Usare')
    const id = 'mand-' + createHash('sha256').update(`${o.chi.compito}\n${o.nome}\n${o.classe ?? ''}`).digest('hex').slice(0, 16)
    const testo = `${verbo}: ${titolo}`.replace(/\s*—\s*/g, ', ')
    const perche = en ? 'This project’s mandate says to ask you first.' : 'Il mandato di questo progetto dice di chiederti prima.'
    const corpo = typeof o.input.testo === 'string' ? (o.input.testo as string).slice(0, 4000) : undefined
    const mano: ManoTrattenuta = {
      nome: o.nome, input: o.input, classe: o.classe, titolo, perche, ...(corpo ? { testo: corpo } : {}),
      da: o.chi.compito!, progetto: o.chi.progetto,
      ...(o.chi.cartella ? { cartella: o.chi.cartella } : {}), ...(o.chi.luogo ? { luogo: o.chi.luogo } : {}),
      ...(o.chi.chiaveNotion ? { chiaveNotion: o.chi.chiaveNotion } : {})
    }
    const gia = store.compito(id)
    if (gia && gia.stato !== 'aperto' && gia.stato !== 'pronto') return id
    // una proposta sola per carta e attrezzo: quella in attesa prende l'ultima versione
    store.scriviCompito({ id, testo, quando: 'oggi', ordine: ordine.dopo(store.ultimoOrdine('oggi')), origine: ORIGINE, madre: o.chi.compito ?? null, progetto: o.chi.progetto })
    store.proponi(id, { azione: 'mandato.mano', mani: [mano] }, perche)
    // la traccia della carta madre sa dove è finito il passo trattenuto
    tracce.uscita(o.chi.compito!, `proposta:${id}`)
    return id
  } catch (e) {
    console.warn('myynd · mandato · la proposta non è nata:', e instanceof Error ? e.message : e)
    return null
  }
}
