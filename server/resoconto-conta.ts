// Quello che Myynd ha fatto per lui, contato (P9): la parte pura.
//
// Riceve righe già lette (compiti, registro delle azioni, misure, carte) e
// decide, per ogni catena di righe, se ne esce una voce sola e di che genere.
// Niente database, niente modello, niente orologio: la finestra [da, a) dice
// solo *quando* una voce conta, mai *se* è già stata contata. Una riga, una
// azione o una carta finiscono al più dietro una voce.
//
// Le ipotesi sul tempo sono quelle scritte da lui: 4 minuti a risposta, 20 a
// documento, 5 a bozza, 15 a lavoro sul codice, 1 a evento, 6 secondi a
// messaggio riordinato; niente per carte e scadenze; niente per una risposta
// riscritta oltre metà.

import { istante } from './fuso.ts'
import { classe, ritocco, SOGLIA_MODIFICATO } from './ritocco.ts'
import { ragioneDi } from './feed-esiti.ts'
import { scadenzaDi } from './data-carta.ts'

export const MINUTI = { mail: 4, documento: 20, codice: 15, bozza: 5, agenda: 1, riordino: 0.1 } as const
export type Minuti = { [K in keyof typeof MINUTI]: number }
export type Genere = 'mail' | 'documento' | 'codice' | 'agenda' | 'riordino' | 'bozza' | 'scadenza' | 'segnalata'
export type Sezione = 'mail' | 'lavori' | 'scadenze' | 'segnalate'
export const SEZIONE: Record<Genere, Sezione> = {
  mail: 'mail', documento: 'lavori', codice: 'lavori', agenda: 'lavori', riordino: 'lavori', bozza: 'lavori',
  scadenza: 'scadenze', segnalata: 'segnalate'
}
/** L'ordine della riga delle stime. */
export const ORDINE_STIME = ['mail', 'documento', 'codice', 'bozza', 'agenda', 'riordino'] as const

export type Voce = {
  chiave: string
  genere: Genere
  titolo: string
  chi?: string | null
  quando: string
  apre: { doc: string } | { compito: string } | null
  anteprima?: string | null
  minuti: number
  quanti?: number | null
  riscritta?: boolean
  preparata?: boolean
  scade?: string | null
  presa?: 'fatta' | 'nella lista' | 'vista' | null
  prova: string
  automazione?: string | null
  /** riordino: nel cestino invece che archiviati */
  cestino?: boolean
}

// — il materiale: righe strette, come le legge `resoconto.ts` —

type Json<T> = T | string | null
type Mandata = { doc: string; quando: string; certezza: 'id' | 'filo'; ritocco: number }
export type RigaCompito = {
  id: string; testo: string; stato: string; origine?: string | null; voce?: string | null; madre?: string | null
  doc?: string | null; progetto?: string | null; chiesto?: string | null; chiuso?: string | null; esito?: string | null
  sparito?: string | null; creato?: string | null
  consegna?: Json<{ app?: string; titolo?: string; percorso?: string; desktop?: string }>
  email?: Json<{ a?: string; oggetto?: string; corpo?: string; casella?: { stato?: string } }>
  mandata?: Json<Mandata>
  risultato?: string | null
}
export type RigaAzione = { id: string; tipo: string; verso?: string | null; cosa: string; compito?: string | null; esito: string; dettaglio?: string | null; quando: string }
export type RigaMisura = { compito: string; consegnato?: string | null; via?: string | null; distanza?: number | null }
/** Il testo tenuto di una bozza (P1B, `segnali` genere `myynd.bozza`, ref = la riga). */
export type RigaTenuta = { ref: string; valore: number; quando: string }
export type RigaFeed = {
  id: string; tipo: string; titolo: string; urgenza?: string | null; quando: string; stato: string
  motivo?: string | null; ragione?: string | null; vista?: string | null; risposto?: string | null; doc?: string | null; progetto?: string | null
}
export type Materiale = {
  compiti: RigaCompito[]
  azioni: RigaAzione[]
  misure: RigaMisura[]
  tenute: RigaTenuta[]
  feed: RigaFeed[]
  /** doc → autore («Dana Whitfield <dana@…>»), per il nome di chi ha scritto */
  autori: Record<string, string>
}

export type Escluso = { chiave: string; perche: string }
export type Conto = { voci: Voce[]; esclusi: Escluso[]; automazioni: { id: string; usate: number; prodotte: number }[] }

function oggetto<T>(v: Json<T> | undefined): T | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string') return v
  try { const x = JSON.parse(v); return x && typeof x === 'object' ? x as T : null } catch { return null }
}
function daJson(s: string | null | undefined): unknown {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}
const numeroIniziale = (s: string | null | undefined): number | null => {
  const m = (s ?? '').match(/^\s*(\d+)/)
  return m ? Number(m[1]) : null
}
/** L'oggetto senza «Re:», «Fwd:», «R:», «I:», «Fw:». */
export function senzaPrefissi(s: string): string {
  return s.replace(/^(\s*(?:re|fwd?|fw|r|i)\s*:\s*)+/i, '').trim()
}
/** «Dana Whitfield <dana@x>» → «Dana Whitfield»; senza nome, null. */
export function nomeDa(autore: string | null | undefined): string | null {
  if (!autore) return null
  const i = autore.indexOf('<')
  if (i <= 0) return null
  const n = autore.slice(0, i).trim().replace(/^["']+|["']+$/g, '').trim()
  return n || null
}
const basename = (p: string | null | undefined) => (p ?? '').replace(/\/+$/, '').split('/').pop() || null
const primoParagrafo = (s: string | null | undefined): string | null => {
  const p = (s ?? '').trim().split(/\n\s*\n/)[0]?.trim() ?? ''
  if (!p) return null
  return p.length > 400 ? p.slice(0, 399).trimEnd() + '…' : p
}
const dentro = (t: string | null | undefined, da: string, a: string) => !!t && Date.parse(t) >= Date.parse(da) && Date.parse(t) < Date.parse(a)
const tolta = (c: RigaCompito) => c.stato === 'lasciato' || c.stato === 'ritirato' || !!c.sparito
const ACCETTATA = ['Va bene così.', 'Good as is.']

type Uscita = { voce: Voce; compiti: string[] }

/**
 * Le catene: una revisione (`rev-…`) sta con la riga da cui è nata. Torna la
 * radice di ogni riga.
 */
function radici(per: Map<string, RigaCompito>): Map<string, string> {
  const radice = new Map<string, string>()
  for (const c of per.values()) {
    let r = c
    const visti = new Set<string>()
    while (r.id.startsWith('rev-') && r.madre && per.has(r.madre) && !visti.has(r.id)) {
      visti.add(r.id)
      r = per.get(r.madre)!
    }
    radice.set(c.id, r.id)
  }
  return radice
}

/**
 * Tutto quello che si può contare, deciso una volta per tutte le finestre:
 * ogni catena dà al più una voce, ogni carta al più una. La finestra si
 * applica dopo (`conta`).
 */
function classifica(m: Materiale, fuso: string, min: Minuti): { uscite: Uscita[]; esclusi: Escluso[]; catenaConVoce: Set<string>; radice: Map<string, string>; per: Map<string, RigaCompito> } {
  const per = new Map(m.compiti.map(c => [c.id, c]))
  const radice = radici(per)
  const catene = new Map<string, RigaCompito[]>()
  for (const c of per.values()) {
    const r = radice.get(c.id)!
    const xs = catene.get(r) ?? []
    xs.push(c); catene.set(r, xs)
  }
  const azioniDi = new Map<string, RigaAzione[]>()
  for (const a of m.azioni) if (a.compito && per.has(a.compito)) {
    const xs = azioniDi.get(a.compito) ?? []
    xs.push(a); azioniDi.set(a.compito, xs)
  }
  const misuraDi = new Map(m.misure.map(x => [x.compito, x]))
  const tenutaDi = new Map<string, RigaTenuta>()
  for (const t of m.tenute) {
    const g = tenutaDi.get(t.ref)
    if (!g || t.quando > g.quando) tenutaDi.set(t.ref, t)
  }
  // un messaggio partito appartiene a una riga sola: la più recente
  const mandataDi = new Map<string, Mandata>()
  const perMessaggio = new Map<string, RigaCompito>()
  for (const c of per.values()) {
    const md = oggetto<Mandata>(c.mandata)
    if (!md?.doc || !md.quando) continue
    const g = perMessaggio.get(md.doc)
    if (!g || (c.creato ?? '') > (g.creato ?? '') || ((c.creato ?? '') === (g.creato ?? '') && c.id > g.id)) perMessaggio.set(md.doc, c)
  }
  for (const [, c] of perMessaggio) mandataDi.set(c.id, oggetto<Mandata>(c.mandata)!)

  const uscite: Uscita[] = []
  const esclusi: Escluso[] = []
  const catenaConVoce = new Set<string>()
  const fatte = (xs: RigaAzione[], tipi: string[]) => xs.filter(a => tipi.includes(a.tipo) && a.esito === 'fatta').sort((x, y) => Date.parse(x.quando) - Date.parse(y.quando))

  for (const [r, membri] of catene) {
    const root = per.get(r)!
    const origine = root.origine ?? ''
    const preparata = origine === 'iniziativa' || origine.startsWith('auto:')
    const automazione = origine.startsWith('auto:') ? origine.slice(5) : null
    const tutte = membri.flatMap(c => azioniDi.get(c.id) ?? [])
    const chiaveDi = (c: RigaCompito) => `compito:${c.id}`
    const ids = membri.map(c => c.id)
    const esci = (c: RigaCompito, v: Omit<Voce, 'chiave' | 'preparata' | 'automazione'>, registro = false) => {
      if (!registro && tolta(c)) { esclusi.push({ chiave: chiaveDi(c), perche: 'riga lasciata o tolta' }); return }
      catenaConVoce.add(r)
      uscite.push({ voce: { chiave: chiaveDi(c), ...v, preparata, automazione }, compiti: ids })
    }

    // 1. mail: dal registro, o dalla sua posta
    const registro = fatte(tutte, ['email'])
    if (registro.length) {
      const a = registro[0]!
      const c = per.get(a.compito!)!
      const email = oggetto(c.email)
      const mis = misuraDi.get(c.id)
      let r2: number | null = null
      if (mis && typeof mis.distanza === 'number' && (!mis.via || mis.via === 'smtp')) r2 = mis.distanza
      if (r2 === null) {
        const d = daJson(a.dettaglio) as { ritocco?: unknown } | null
        if (d && typeof d.ritocco === 'number') r2 = d.ritocco
      }
      if (r2 === null && email?.corpo && c.risultato) r2 = ritocco(email.corpo, c.risultato)
      const riscritta = r2 !== null && classe(r2) === 'riscritto'
      const via = !!c.sparito
      esci(c, {
        genere: 'mail', titolo: senzaPrefissi(email?.oggetto || a.cosa || c.testo),
        chi: nomeDa(c.doc ? m.autori[c.doc] : null) ?? email?.a ?? a.verso ?? null,
        quando: a.quando, apre: !via && c.doc ? { doc: c.doc } : null,
        minuti: riscritta ? 0 : min.mail, riscritta, prova: `azioni:${a.id}`
      }, true)
      continue
    }
    const conMandata = membri.filter(c => mandataDi.has(c.id)).sort((x, y) => (y.creato ?? '').localeCompare(x.creato ?? ''))
    if (conMandata.length) {
      const c = conMandata[0]!
      const md = mandataDi.get(c.id)!
      if (md.certezza === 'filo' && md.ritocco > SOGLIA_MODIFICATO) {
        esclusi.push({ chiave: chiaveDi(c), perche: 'risposta sua' })
        continue
      }
      const email = oggetto(c.email)
      const riscritta = md.certezza === 'id' && classe(md.ritocco) === 'riscritto'
      esci(c, {
        genere: 'mail', titolo: senzaPrefissi(email?.oggetto || c.testo),
        chi: nomeDa(c.doc ? m.autori[c.doc] : null) ?? email?.a ?? null,
        quando: md.quando, apre: { doc: md.doc },
        minuti: riscritta ? 0 : min.mail, riscritta, prova: `mandata:${md.certezza}`
      })
      continue
    }

    // 2. codice: solo se ha cambiato dei file
    const codice = fatte(tutte, ['lavoro.fatto']).filter(a => {
      const d = daJson(a.dettaglio) as { changedFiles?: unknown } | null
      return !!d && Array.isArray(d.changedFiles) && d.changedFiles.length > 0
    })
    if (codice.length) {
      const a = codice[codice.length - 1]!
      const c = per.get(a.compito!)!
      esci(c, { genere: 'codice', titolo: c.testo, chi: basename(a.verso), quando: a.quando, apre: null, minuti: min.codice, prova: `azioni:${a.id}` })
      continue
    }

    // 3. agenda: gli eventi che ha messo
    const agenda = fatte(tutte, ['agenda'])
    if (agenda.length) {
      let quanti = 0
      for (const a of agenda) {
        const d = daJson(a.dettaglio)
        quanti += Array.isArray(d) ? d.length : (numeroIniziale(a.cosa) ?? 1)
      }
      const a = agenda[agenda.length - 1]!
      const c = per.get(a.compito!)!
      esci(c, { genere: 'agenda', titolo: c.testo, quando: a.quando, apre: null, minuti: quanti * min.agenda, quanti, prova: `azioni:${a.id}` })
      continue
    }

    // 4. riordino: quello che si è spostato davvero
    const riordino = fatte(tutte, ['posta.cestina', 'posta.archivia'])
    if (riordino.length) {
      const a = riordino[riordino.length - 1]!
      const c = per.get(a.compito!)!
      const quanti = numeroIniziale(c.esito) ?? numeroIniziale(a.cosa) ?? 1
      esci(c, {
        genere: 'riordino', titolo: c.testo, quando: a.quando, apre: null,
        minuti: Math.round(quanti * min.riordino * 10) / 10, quanti, cestino: a.tipo === 'posta.cestina', prova: `azioni:${a.id}`
      })
      continue
    }

    // 5. documento: l'ultima consegna della catena, se è un documento vero
    const documentoFatto = (c: RigaCompito) => (azioniDi.get(c.id) ?? []).find(a => a.tipo === 'documento' && a.esito === 'fatta')
    const documenti = membri.filter(c => {
      const k = oggetto(c.consegna)
      if (!k?.app) return false
      return k.app === 'Pages' || k.app === 'TextEdit' || (k.app === 'File' && !documentoFatto(c))
    }).map(c => ({ c, t: misuraDi.get(c.id)?.consegnato ?? c.chiuso ?? c.chiesto ?? null }))
      .filter(x => !!x.t).sort((x, y) => Date.parse(y.t!) - Date.parse(x.t!))
    if (documenti.length) {
      const { c, t } = documenti[0]!
      const k = oggetto(c.consegna)!
      esci(c, {
        genere: 'documento', titolo: k.titolo?.trim() || c.testo, quando: t!, apre: { compito: c.id },
        minuti: c.stato === 'fatto' ? min.documento : 0,
        prova: misuraDi.get(c.id)?.consegnato ? 'misure:consegnato' : 'chiuso'
      })
      continue
    }

    // 6. bozza: solo se è stata usata
    const bozze = membri.filter(c => c.chiesto && c.stato === 'fatto' && c.chiuso)
      .map(c => {
        const f = documentoFatto(c)
        const prova = ACCETTATA.includes(c.esito ?? '') ? 'esito' : misuraDi.get(c.id)?.via === 'copia' ? 'copia' : f ? `file:${f.id}` : null
        return { c, prova }
      }).filter(x => x.prova).sort((x, y) => Date.parse(y.c.chiuso!) - Date.parse(x.c.chiuso!))
    if (bozze.length) {
      const { c, prova } = bozze[0]!
      const tenuta = tenutaDi.get(c.id)
      const riscritta = !!tenuta && classe(tenuta.valore) === 'riscritto'
      esci(c, {
        genere: 'bozza', titolo: c.testo, quando: c.chiuso!, apre: null, anteprima: primoParagrafo(c.risultato),
        minuti: riscritta ? 0 : min.bozza, prova: prova!
      })
      continue
    }
  }

  // il registro senza riga: una mail partita resta partita
  for (const a of m.azioni) {
    if (a.tipo !== 'email' || a.esito !== 'fatta' || (a.compito && per.has(a.compito))) continue
    uscite.push({ voce: { chiave: `azione:${a.id}`, genere: 'mail', titolo: senzaPrefissi(a.cosa), chi: a.verso ?? null, quando: a.quando, apre: null, minuti: min.mail, prova: `azioni:${a.id}` }, compiti: [] })
  }
  void fuso
  return { uscite, esclusi, catenaConVoce, radice, per }
}

const FATTO = ['lui', 'lista', 'fuori']

/**
 * Le carte: una scadenza vista (o chiusa) prima della fine del suo giorno, o
 * una cosa segnalata che lui ha preso. Una carta passata in lista la
 * rappresenta la riga, se la riga ha fatto qualcosa.
 */
function carte(m: Materiale, fuso: string, catenaConVoce: Set<string>, radice: Map<string, string>, per: Map<string, RigaCompito>): { uscite: Uscita[]; esclusi: Escluso[] } {
  const uscite: Uscita[] = []
  const esclusi: Escluso[] = []
  const righeDi = new Map<string, RigaCompito[]>()
  for (const c of per.values()) if (c.voce) {
    const xs = righeDi.get(c.voce) ?? []
    xs.push(c); righeDi.set(c.voce, xs)
  }
  for (const f of m.feed) {
    const righe = righeDi.get(f.id) ?? []
    const lavoro = righe.some(c => catenaConVoce.has(radice.get(c.id) ?? c.id))
    const ragione = ragioneDi(f.stato, f.ragione, f.motivo)
    const presa = f.stato === 'fatto' && !!ragione && FATTO.includes(ragione)
    const apre = f.doc ? { doc: f.doc } : null

    let scadenza: Voce | null = null
    if ((f.tipo === 'Scadenza' || f.tipo === 'Deadline') && f.stato !== 'scartato' && f.ragione !== 'superata') {
      const D = scadenzaDi(f.urgenza, f.quando)
      if (D) {
        const fine = istante(D.getFullYear(), D.getMonth() + 1, D.getDate() + 1, 0, fuso).getTime()
        const prima = (t: string | null | undefined) => !!t && Date.parse(t) < fine
        const chiusa = righe.filter(c => c.stato === 'fatto' && prima(c.chiuso)).sort((x, y) => Date.parse(x.chiuso!) - Date.parse(y.chiuso!))[0]
        if (Date.parse(f.quando) < fine) {
          const atto = prima(f.vista) ? f.vista! : presa && prima(f.risposto) ? f.risposto! : chiusa ? chiusa.chiuso! : null
          if (atto) {
            const due = (n: number) => String(n).padStart(2, '0')
            scadenza = {
              chiave: `feed:${f.id}`, genere: 'scadenza', titolo: f.titolo, quando: f.vista ?? atto, apre, minuti: 0,
              scade: `${D.getFullYear()}-${due(D.getMonth() + 1)}-${due(D.getDate())}`,
              presa: presa && (ragione === 'lui' || ragione === 'fuori') ? 'fatta' : (presa && ragione === 'lista') || righe.length ? 'nella lista' : 'vista',
              prova: prima(f.vista) ? 'vista' : presa && prima(f.risposto) ? 'risposto' : `chiuso:${chiusa!.id}`
            }
          }
        }
      }
    }
    if (scadenza) {
      if (lavoro) esclusi.push({ chiave: `feed:${f.id}`, perche: 'contata come lavoro' })
      else uscite.push({ voce: scadenza, compiti: [] })
      continue
    }
    if (presa && f.risposto) {
      if (lavoro) { esclusi.push({ chiave: `feed:${f.id}`, perche: 'contata come lavoro' }); continue }
      uscite.push({ voce: { chiave: `feed:${f.id}`, genere: 'segnalata', titolo: f.titolo, quando: f.risposto, apre, minuti: 0, prova: 'risposto' }, compiti: [] })
    }
  }
  return { uscite, esclusi }
}

/**
 * Quello che conta in [da, a). Tutto è deciso su tutto il materiale; la
 * finestra sceglie solo quali voci tenere. `esclusi` dice cosa si è guardato
 * e lasciato fuori, e perché (per la riga di comando e le prove).
 */
export function conta(m: Materiale, opz: { da: string; a: string; fuso: string; minuti?: Minuti }): Conto {
  const min = opz.minuti ?? MINUTI
  const c = classifica(m, opz.fuso, min)
  const k = carte(m, opz.fuso, c.catenaConVoce, c.radice, c.per)
  const voci: Voce[] = []

  for (const u of [...c.uscite, ...k.uscite]) if (dentro(u.voce.quando, opz.da, opz.a)) voci.push(u.voce)

  // le pulizie delle regole: una voce per mittente, nella finestra
  const regole = new Map<string, RigaAzione[]>()
  for (const a of m.azioni) {
    if (a.tipo !== 'posta.regola.archivia' || a.esito !== 'fatta' || !dentro(a.quando, opz.da, opz.a)) continue
    const xs = regole.get(a.cosa) ?? []
    xs.push(a); regole.set(a.cosa, xs)
  }
  for (const [mittente, xs] of regole) {
    const ultima = xs.reduce((x, y) => (Date.parse(y.quando) > Date.parse(x.quando) ? y : x))
    voci.push({
      chiave: `regola:${mittente}`, genere: 'riordino', titolo: mittente, chi: mittente, quando: ultima.quando, apre: null,
      minuti: Math.round(xs.length * min.riordino * 10) / 10, quanti: xs.length, prova: `azioni:${ultima.id}`
    })
  }

  voci.sort((x, y) => Date.parse(y.quando) - Date.parse(x.quando))

  // le automazioni: quante voci ha dato, quante righe ha scritto nella finestra
  const perAuto = new Map<string, { usate: number; prodotte: number }>()
  const di = (id: string) => { const g = perAuto.get(id) ?? { usate: 0, prodotte: 0 }; perAuto.set(id, g); return g }
  for (const v of voci) if (v.automazione) di(v.automazione).usate++
  for (const r of m.compiti) if (r.origine?.startsWith('auto:') && dentro(r.creato, opz.da, opz.a)) di(r.origine.slice(5)).prodotte++

  return {
    voci,
    esclusi: [...c.esclusi, ...k.esclusi],
    automazioni: [...perAuto].map(([id, n]) => ({ id, ...n }))
  }
}

export type Numeri = { mail: number; lavori: number; scadenze: number; segnalate: number; minuti: number }

/** I numeri delle voci: righe, mai messaggi o eventi; i minuti sono la somma della tabella. */
export function numeri(voci: Voce[]): { numeri: Numeri; preparate: { mail: number; lavori: number }; stime: { genere: Genere; minuti: number }[]; riscritte: number } {
  const n: Numeri = { mail: 0, lavori: 0, scadenze: 0, segnalate: 0, minuti: 0 }
  const preparate = { mail: 0, lavori: 0 }
  const presenti = new Set<Genere>()
  let riscritte = 0
  for (const v of voci) {
    const s = SEZIONE[v.genere]
    n[s]++
    n.minuti += v.minuti
    if (v.preparata && (s === 'mail' || s === 'lavori')) preparate[s]++
    if (v.minuti > 0) presenti.add(v.genere)
    if (v.riscritta) riscritte++
  }
  n.minuti = Math.round(n.minuti * 10) / 10
  const stime = ORDINE_STIME.filter(g => presenti.has(g)).map(g => ({ genere: g as Genere, minuti: MINUTI[g] }))
  return { numeri: n, preparate, stime, riscritte }
}
