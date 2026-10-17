// Il diario del giorno: cosa si è mosso, cosa è fermo, chi aspetta. Per progetto.
//
// Gli episodi li fa il codice (`osservazioni.ts`), sul Mac, senza modello.
// Qui una volta al giorno si mettono in fila, progetto per progetto, in una
// pagina corta: l'ora, i minuti, le app, i nomi ripuliti dei documenti di
// lavoro (vedi `nomeSicuro`), i commit senza autori, il ramo e i file non
// salvati. Mai il testo delle finestre, mai il titolo di una finestra, mai un
// indirizzo intero né un nome di file fuori dal progetto. Quella pagina va al modello più economico che c'è, in una chiamata
// sola, e torna da cinque a dieci righe per progetto, ognuna con le prove su
// cui poggia. Le righe restano nel diario e arrivano nel contesto del
// progetto (`project-memory.ts`); quelle che poggiano su un'ora dimenticata
// se ne vanno con lei.
//
// Una chiamata al giorno per conto: la sera alle sette per il giorno che
// finisce, o la mattina dopo se la sera non c'era.

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { extname } from 'node:path'
import db from './store.ts'
import { cercatoreDiProgetti } from './attenzione.ts'
import * as store from './store.ts'
import * as fuso from './fuso.ts'
import * as progetti from './progetti.ts'
import * as oss from './osservazioni.ts'
import { chiediJSON, collegato } from './modello.ts'
import { senzaTrattini } from './testo.ts'

/** Dalle sette di sera il diario si scrive per oggi; prima, per ieri. */
export const ORA_SERA = 19
/** Le righe per progetto. */
export const RIGHE_MAX = 10
export const RIGA_MAX = 220
const CHIAMATA = 'diario:chiamata'
const FATTO = 'diario:fatto'

export type Materiale = { testo: string; prove: Map<string, number[]>; progetti: string[] }

const hhmm = (iso: string, zona: string) => {
  const p = fuso.parti(new Date(iso), zona)
  return `${String(p.ora).padStart(2, '0')}:${String(p.minuti).padStart(2, '0')}`
}

/** Ripulito, compatto, corto: tutto quello che esce dal Mac passa di qui. */
export function pulito(s: string, tetto: number): string {
  return oss.compatto(oss.redigi(s), tetto).replace(/"/g, "'")
}

/** I documenti di lavoro riconosciuti per identità: solo per loro esce il titolo della pagina. */
const DOCUMENTI_NOTI = /^web:(gdoc|notion|figma|github|linear|canva):/

/**
 * Il nome di una cosa vista che può uscire dal Mac, o null.
 *
 * Una pagina: il titolo solo se è un documento di lavoro riconosciuto (un
 * Google Doc, una pagina di Notion, un file di Figma, una PR, un'issue, un
 * design di Canva); altrimenti il dominio e basta, così una ricerca o una
 * mail aperta nel browser non dicono niente di sé. Un file: il percorso
 * dentro la cartella del progetto, se ci sta; altrimenti solo il tipo. Le
 * finestre e le sessioni non danno mai il loro titolo: basta il nome dell'app.
 */
export function nomeSicuro(r: Pick<oss.Osservazione, 'kind' | 'sourceId' | 'title'>, progetto: string, cerca: (t: string) => string | null): string | null {
  if (r.kind === 'web') {
    if (DOCUMENTI_NOTI.test(r.sourceId)) return r.title ? `"${pulito(oss.titoloCorto(r.title), 80)}"` : null
    const dominio = r.sourceId.slice('web:'.length)
    return /^[a-z0-9.-]+$/i.test(dominio) ? dominio : null
  }
  if (r.kind === 'file' || r.kind === 'editor') {
    const percorso = r.sourceId.slice(r.sourceId.indexOf('/'))
    const dentro = dentroDelProgetto(percorso, progetto, cerca, r.kind === 'editor')
    if (dentro !== null) return dentro ? `"${pulito(dentro, 80)}"` : 'the project folder'
    const ext = extname(percorso).slice(1).toLowerCase()
    return r.kind === 'editor' ? null : /^[a-z0-9]{1,8}$/.test(ext) ? `a .${ext} file` : 'a file'
  }
  return null
}

/**
 * Il percorso di un file dentro la cartella del progetto («src/pricing.ts»):
 * la prima cartella, salendo da casa, che nomina il progetto. Vuoto se è la
 * cartella stessa, null se il file non sta in una cartella del progetto.
 */
export function dentroDelProgetto(percorso: string, progetto: string, cerca: (t: string) => string | null, cartella = false): string | null {
  const casa = homedir()
  const resto = percorso.startsWith(casa + '/') ? percorso.slice(casa.length + 1) : percorso.replace(/^\/+/, '')
  const pezzi = resto.split('/').filter(Boolean)
  // per un file contano solo le cartelle: un nome di file che nomina il progetto non lo mette dentro
  for (let i = 0; i < pezzi.length - (cartella ? 0 : 1); i++) {
    if (cerca(pezzi[i]!) === progetto) return pezzi.slice(i + 1).join('/')
  }
  return null
}

/**
 * La pagina del giorno per il modello. Null se non c'è niente di un
 * progetto: senza materiale non si chiama nessuno.
 */
export function materiale(giorno: string, zona = fuso.fusoDi()): Materiale | null {
  const righe = oss.delGiorno(giorno)
  const eps = oss.episodi(giorno, righe)
  const nomi = new Map(progetti.elenco().map(p => [p.id, p.nome]))
  const prove = new Map<string, number[]>()
  let n = 0
  const id = (lista: number[]) => { const k = `e${++n}`; prove.set(k, lista); return k }
  const blocchi: string[] = []
  const conProgetto = [...new Set(righe.map(r => r.projectId).filter((x): x is string => !!x && nomi.has(x)))]
  const cerca = cercatoreDiProgetti()
  const perId = new Map(righe.map(r => [r.id, r]))
  for (const p of conProgetto) {
    const linee: string[] = []
    const nomiDi = (ids: number[], quanti: number) => [...new Set(ids.map(i => perId.get(i)).filter((r): r is oss.Osservazione => !!r)
      .map(r => nomeSicuro(r, p, cerca)).filter((x): x is string => !!x))].slice(0, quanti)
    for (const e of eps.filter(x => x.projectId === p)) {
      const visti = nomiDi(e.prove, 4)
      linee.push(`[${id(e.prove)}] ${hhmm(e.inizio, zona)}-${hhmm(e.fine, zona)}, ${e.minuti ? `${e.minuti} min` : 'seen'}${e.app.length ? `, ${e.app.join(', ')}` : ''}${visti.length ? `: ${visti.join(', ')}` : ''}`)
    }
    const suoi = righe.filter(r => r.projectId === p && r.kind === 'commit')
    if (suoi.length) linee.push(`[${id(suoi.map(r => r.id))}] own commits: ${suoi.length} (${suoi.slice(0, 5).map(r => `"${pulito(r.title ?? '', 100)}"`).join(', ')})`)
    const altri = righe.filter(r => r.projectId === p && r.kind === 'commit-altri')
    if (altri.length) linee.push(`[${id(altri.map(r => r.id))}] teammate commits: ${altri.length} (${altri.slice(0, 4).map(r => `"${pulito(r.title ?? '', 100)}"`).join(', ')})`)
    for (const r of righe.filter(x => x.projectId === p && x.kind === 'repo')) linee.push(`[${id([r.id])}] repository ${pulito(r.title ?? '', 60)}: ${pulito(r.text ?? '', 200)}`)
    const documenti = righe.filter(r => r.projectId === p && (r.kind === 'web' || r.kind === 'file'))
    const nomiDoc = nomiDi(documenti.map(r => r.id), 8)
    if (nomiDoc.length) linee.push(`[${id(documenti.map(r => r.id))}] documents and pages: ${nomiDoc.join(', ')}`)
    if (!linee.length) continue
    blocchi.push(`Project: ${nomi.get(p)} (id ${p})\n${linee.join('\n')}`)
  }
  if (!blocchi.length) return null
  const senza = eps.filter(e => !e.projectId).reduce((s, e) => s + e.minuti, 0)
  return {
    testo: `Day: ${giorno}\n\n${blocchi.join('\n\n')}${senza ? `\n\nNot tied to a project: ${senza} min` : ''}`,
    prove,
    progetti: conProgetto
  }
}

const SISTEMA = `You write the day log of the user's projects, from a compact list of what Myynd saw on their Mac.
For each project, write 5 to 10 short bullets, only from the lines given: what moved (work done, commits, documents touched), what is stuck (something opened again and again with no progress, uncommitted work left for long), who is waiting (others' commits or documents that ask for a reply). Fewer bullets when there is little.
Each bullet cites the ids in square brackets it rests on, like "e2". Never invent a fact, a name or a number.
Short plain sentences, no dashes, no jargon, no file paths.`

const FORMA = {
  type: 'object',
  properties: {
    progetti: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          progetto: { type: 'string', description: 'The project id exactly as given.' },
          righe: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                testo: { type: 'string', description: 'One short sentence.' },
                genere: { type: 'string', enum: ['mosso', 'fermo', 'attesa'], description: 'mosso = moved, fermo = stuck, attesa = someone is waiting.' },
                prove: { type: 'array', items: { type: 'string' }, description: 'The ids like e1, e2 this bullet rests on.' }
              },
              required: ['testo', 'genere', 'prove'],
              additionalProperties: false
            }
          }
        },
        required: ['progetto', 'righe'],
        additionalProperties: false
      }
    }
  },
  required: ['progetti'],
  additionalProperties: false
}

type Grezzo = { progetti?: { progetto?: unknown; righe?: { testo?: unknown; genere?: unknown; prove?: unknown }[] }[] }

type Ferri = { chiediJSON: typeof chiediJSON; collegato: typeof collegato }
const VERI: Ferri = { chiediJSON: o => chiediJSON(o), collegato: () => collegato() }
let ferri: Ferri = VERI
/** Solo per le prove. */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/** Le righe buone di una risposta: un progetto noto, prove che esistono, testo corto e piano. */
export function ripulisci(g: Grezzo | null, m: Materiale): { projectId: string; kind: string; text: string; evidence: number[] }[] {
  const fuori: { projectId: string; kind: string; text: string; evidence: number[] }[] = []
  for (const p of Array.isArray(g?.progetti) ? g!.progetti! : []) {
    if (typeof p?.progetto !== 'string' || !m.progetti.includes(p.progetto)) continue
    let quante = 0
    for (const r of Array.isArray(p.righe) ? p.righe : []) {
      if (quante >= RIGHE_MAX) break
      if (typeof r?.testo !== 'string' || !r.testo.trim()) continue
      const kind = r.genere === 'fermo' || r.genere === 'attesa' ? r.genere : 'mosso'
      const ids = (Array.isArray(r.prove) ? r.prove : []).map(x => String(x).replace(/[[\]\s]/g, ''))
      const evidence = [...new Set(ids.flatMap(x => m.prove.get(x) ?? []))]
      if (!evidence.length) continue
      const text = senzaTrattini(r.testo.replace(/\s+/g, ' ').trim()).slice(0, RIGA_MAX)
      fuori.push({ projectId: p.progetto, kind, text, evidence })
      quante++
    }
  }
  return fuori
}

/** Il giorno da scrivere adesso: oggi dalla sera, altrimenti ieri. */
export function giornoDaScrivere(adesso: Date, zona = fuso.fusoDi()): string {
  const p = fuso.parti(adesso, zona)
  if (p.ora >= ORA_SERA) return fuso.giornoIn(adesso, zona)
  return fuso.giornoIn(fuso.istante(p.anno, p.mese, p.giorno - 1, 12, zona), zona)
}

/**
 * Il diario, se tocca: una chiamata al giorno per conto, al massimo.
 *
 * Il segno della chiamata si mette prima di chiamare: una chiamata andata
 * male non si ripete lo stesso giorno, e nessun giro la paga due volte.
 * Torna quante righe ha scritto.
 */
export async function forse(adesso = new Date()): Promise<number> {
  const zona = fuso.fusoDi()
  const oggi = fuso.giornoIn(adesso, zona)
  if (store.cursore(CHIAMATA) === oggi) return 0
  const giorno = giornoDaScrivere(adesso, zona)
  const fatto = store.cursore(FATTO)
  if (fatto && fatto >= giorno) return 0
  const m = materiale(giorno, zona)
  if (!m) return 0
  if (!ferri.collegato()) return 0
  store.segnaCursore(CHIAMATA, oggi)
  const r = await ferri.chiediJSON<Grezzo>({
    lavoro: 'diario', system: SISTEMA, max_tokens: 2000, formato: FORMA,
    messages: [{ role: 'user', content: m.testo }]
  })
  if (!r) return 0
  const righe = ripulisci(r, m)
  // un'ora dimenticata mentre il modello scriveva: le righe che poggiano anche su una sola osservazione sparita non entrano
  const vive = new Set((db.prepare('SELECT id FROM osservazioni WHERE day = ?').all(giorno) as { id: number }[]).map(x => x.id))
  const ins = db.prepare('INSERT INTO diario (id, day, projectId, kind, text, evidence, createdAt) VALUES (?,?,?,?,?,?,?)')
  let scritte = 0
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM diario WHERE day = ?').run(giorno)
    for (const x of righe) {
      // basta una prova dimenticata e la riga non entra: poggiava anche su quella
      const evidence = x.evidence
      if (!evidence.every(e => vive.has(e))) continue
      ins.run(randomUUID(), giorno, x.projectId, x.kind, x.text, JSON.stringify(evidence), adesso.toISOString())
      scritte++
    }
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
  store.segnaCursore(FATTO, giorno)
  return scritte
}

export const perProvaForma = FORMA
