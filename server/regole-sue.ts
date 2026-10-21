// Le regole che ha dato lui: «mai», «sempre», e le pause con una fine.
//
// «Show me what you think I'm doing, and let me correct it in one sentence.»
// Una correzione che cambia un progetto (lo stato, la priorità, un nome) ha
// già il suo posto in `progetti.ts`. Una che dice «smetti di scrivermi i
// copioni dei video» o «per H-Farm non propormi mai ricerche» non ha un
// progetto da cambiare: è una regola, e una regola che sta solo in una chat
// non ferma niente. Prima la si diceva in chat e il giro dopo il copione
// tornava.
//
// Qui stanno scritte, una riga per regola, e chi fa il lavoro le legge:
//
//   · `quadro.ts`, che lascia cadere le mosse che una regola «mai» colpisce;
//   · `priorita.ts`, che fa lo stesso con le voci del feed, e mette tutte le
//     regole nel prompt («sempre» vale solo lì: non si controlla sulle parole);
//   · `da-se.ts`, che non fa nascere e non lavora un genere fermato;
//   · `motivo.ts`, per cui una riga che una regola colpisce non ha ragione di
//     stare nella sua lista.
//
// Una regola tolta non si cancella: le si scrive la data (`tolta`), e
// «disfa» la rimette. Le pause hanno una fine (`fino`): passata la data, il
// progetto torna attivo da sé, e la pausa si chiude.

import { randomUUID } from 'node:crypto'
import db from './store.ts'
import * as progetti from './progetti.ts'

export type Tipo = 'mai' | 'sempre' | 'pausa'

/**
 * I generi di lavoro che Myynd fa da sé, e che una regola può fermare per
 * nome: sono le origini delle carte di `da-se.ts`. Scritti qui e non
 * importati di là: `da-se.ts` legge questo file, e un giro di import fra i
 * due non serve a niente.
 */
export const LAVORI = ['copione-video', 'idee-x', 'pagina-notion'] as const
export type Lavoro = typeof LAVORI[number]

/**
 * Le parole con cui si chiama ogni genere, nelle due lingue: una mossa del
 * quadro che scrive «Write a 60 second video script» è un copione anche se
 * non nasce da `da-se.ts`, e la regola la deve prendere lo stesso.
 */
const PAROLE_DEL_LAVORO: Record<Lavoro, string[]> = {
  'copione-video': ['video script', 'copione video', 'script video', 'video copione'],
  'idee-x': ['ideas for x', 'idee per x', 'post ideas', 'idee post', 'x post', 'post su x', 'tweet'],
  'pagina-notion': ['notion page', 'pagina notion', 'notion']
}

export type Regola = {
  id: string
  tipo: Tipo
  /** La regola in poche parole, come si legge nella lista di quello che lascia stare. */
  testo: string
  lavoro: Lavoro | null
  /** Le frasi che, nel titolo di un lavoro, dicono che è quel lavoro. */
  parole: string[]
  progetto: string | null
  /** Per una pausa: il giorno in cui finisce, `YYYY-MM-DD`. */
  fino: string | null
  /** La frase da cui è nata, con le sue parole. */
  frase: string
  dal: string
  tolta: string | null
}

type Riga = { id: string; tipo: string; testo: string; lavoro: string | null; parole: string | null; progetto: string | null; fino: string | null; frase: string | null; dal: string; tolta: string | null }

const eLavoro = (s: unknown): s is Lavoro => typeof s === 'string' && (LAVORI as readonly string[]).includes(s)

function daRiga(r: Riga): Regola {
  let parole: string[] = []
  try { const v = JSON.parse(r.parole ?? '[]'); if (Array.isArray(v)) parole = v.filter((x): x is string => typeof x === 'string') } catch { /* una colonna storta è un elenco vuoto */ }
  return {
    id: r.id, tipo: r.tipo === 'sempre' || r.tipo === 'pausa' ? r.tipo : 'mai', testo: r.testo,
    lavoro: eLavoro(r.lavoro) ? r.lavoro : null, parole, progetto: r.progetto || null, fino: r.fino || null,
    frase: r.frase ?? '', dal: r.dal, tolta: r.tolta || null
  }
}

/** Le regole che valgono adesso, le più nuove prima. */
export function elenco(): Regola[] {
  return (db.prepare('SELECT * FROM regole_sue WHERE tolta IS NULL ORDER BY dal DESC').all() as unknown as Riga[]).map(daRiga)
}

export function trova(id: string): Regola | null {
  const r = db.prepare('SELECT * FROM regole_sue WHERE id = ?').get(id) as Riga | undefined
  return r ? daRiga(r) : null
}

/** Una regola nuova. Le frasi si puliscono qui: corte, al più quattro, senza doppioni. */
export function aggiungi(r: { tipo: Tipo; testo: string; lavoro?: Lavoro | null; parole?: readonly string[]; progetto?: string | null; fino?: string | null; frase?: string }): Regola {
  const id = `r${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const parole = [...new Set((r.parole ?? []).map(p => p.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40)).filter(p => paroleDi(p).length > 0))].slice(0, 4)
  db.prepare('INSERT INTO regole_sue (id, tipo, testo, lavoro, parole, progetto, fino, frase, dal, tolta) VALUES (?,?,?,?,?,?,?,?,?,NULL)').run(
    id, r.tipo, r.testo.trim().slice(0, 120), r.lavoro ?? null, JSON.stringify(parole), r.progetto ?? null, r.fino ?? null,
    (r.frase ?? '').trim().slice(0, 300), new Date().toISOString()
  )
  return trova(id)!
}

/** Tolta: resta scritta con la data, e si rimette con `rimetti`. */
export function togli(id: string, quando = new Date().toISOString()): boolean {
  return Number(db.prepare('UPDATE regole_sue SET tolta = ? WHERE id = ? AND tolta IS NULL').run(quando, id).changes) > 0
}

export function rimetti(id: string): boolean {
  return Number(db.prepare('UPDATE regole_sue SET tolta = NULL WHERE id = ?').run(id).changes) > 0
}

// — leggere un titolo contro una regola —

const VUOTE = new Set('the a an of for to on in and or my me i any some per di del della dei degli delle il lo la le gli un una uno e o mi non mai never no stop more'.split(' '))
const piano = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
/** Le parole piene di una frase: quelle che dicono la cosa. «x» resta: è il nome di un posto. */
export function paroleDi(frase: string): string[] {
  return piano(frase).split(' ').filter(w => w && !VUOTE.has(w) && (w.length >= 3 || w === 'x'))
}
/** Una parola del titolo è quella della regola, a meno del plurale e della desinenza: «scripts» è «script», «copioni» è «copione». */
const radice = (w: string) => w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2))
const combacia = (w: string, t: string) => w.length <= 2 ? t === w : t === w || t.startsWith(radice(w))

/** Il testo contiene la frase: tutte le sue parole piene, in qualunque ordine. Pura. */
export function contiene(testo: string, frase: string): boolean {
  const parole = paroleDi(frase)
  if (!parole.length) return false
  const nel = piano(testo).split(' ').filter(Boolean)
  return parole.every(w => nel.some(t => combacia(w, t)))
}

/**
 * La regola «mai» che ferma questo lavoro, o null. Il lavoro si riconosce per
 * genere (una carta di `da-se.ts`) o per le parole del suo titolo; una regola
 * di un progetto vale solo per quel progetto. Pura sulle regole che riceve.
 */
export function chiFerma(o: { testo?: string; progetto?: string | null; lavoro?: string | null }, regole: readonly Regola[] = elenco()): Regola | null {
  for (const r of regole) {
    if (r.tipo !== 'mai' || r.tolta) continue
    if (r.progetto && r.progetto !== (o.progetto ?? null)) continue
    if (r.lavoro && o.lavoro && r.lavoro === o.lavoro) return r
    const testo = o.testo ?? ''
    if (!testo.trim()) continue
    const frasi = [...r.parole, ...(r.lavoro ? PAROLE_DEL_LAVORO[r.lavoro] : [])]
    if (frasi.some(f => contiene(testo, f))) return r
  }
  return null
}

/** Questo lavoro è fermato da una sua regola. */
export const fermato = (o: Parameters<typeof chiFerma>[0]) => chiFerma(o) !== null

/** Il genere di una carta, se è uno di quelli che una regola ferma per nome. */
export const lavoroDi = (origine: string | null | undefined): Lavoro | null => eLavoro(origine) ? origine : null

/**
 * Le regole dette al modello, per i prompt del quadro e del feed: una riga
 * l'una, con il progetto se è di un progetto solo. Vuoto se non ce ne sono.
 */
export function perIlModello(regole: readonly Regola[] = elenco()): string {
  const righe = regole.filter(r => r.tipo !== 'pausa').map(r => {
    const p = r.progetto ? progetti.trova(r.progetto) : null
    return `— ${r.tipo === 'mai' ? 'Mai' : 'Sempre'}: ${r.testo}${p ? ` (solo per ${p.nome})` : ''}`
  })
  return righe.length ? `LE REGOLE CHE TI HA DATO LUI. Valgono sempre, più di ogni altra indicazione: quello che dice «mai» non si propone, nemmeno con altre parole.\n${righe.join('\n')}` : ''
}

// — le pause con una fine —

/** La pausa con una fine di questo progetto, se c'è. */
export function pausaDi(progetto: string, regole: readonly Regola[] = elenco()): Regola | null {
  return regole.find(r => r.tipo === 'pausa' && r.progetto === progetto) ?? null
}

/**
 * Le pause arrivate alla fine: il progetto ancora fermo torna attivo, e la
 * pausa si chiude. Un progetto riaperto o chiuso nel frattempo da lui non si
 * tocca: la pausa si chiude e basta. Torna gli id dei progetti ripresi.
 */
export function riprendiScaduti(adesso = Date.now()): string[] {
  const oggi = new Date(adesso).toLocaleDateString('en-CA')
  const ripresi: string[] = []
  for (const r of elenco()) {
    if (r.tipo !== 'pausa' || !r.fino || r.fino > oggi || !r.progetto) continue
    const p = progetti.trova(r.progetto)
    if (p?.stato === 'fermo') { progetti.cambia(p.id, { stato: 'attivo' }); ripresi.push(p.id) }
    togli(r.id)
  }
  return ripresi
}
