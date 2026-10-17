// Il giro di quello che si vede senza chiedere permessi, e la pagina «Cosa ho visto oggi».
//
// Ogni quarto d'ora, solo per il conto che possiede l'osservatore di questo
// Mac, solo se è acceso e non in pausa: i file usati di recente (Spotlight),
// la cronologia dei browser dall'ultima passata, lo stato dei repository
// (le cartelle di lavoro, quelli che Spotlight conosce, quelli che
// contengono un file appena usato), le cartelle aperte negli editor. Ogni
// cosa passa da `osservazioni.registra`, che la ripulisce, ne fa l'impronta e
// la scrive solo se è nuova. Poi la conservazione, e il diario se tocca.
//
// Ogni lettore sta in `connettori/` ed è provato su file finti. Qui non si
// legge niente da solo: si chiama chi legge, con le dipendenze che le prove
// possono sostituire.

import { homedir } from 'node:os'
import { basename } from 'node:path'
import * as chi from './chi.ts'
import * as store from './store.ts'
import * as fuso from './fuso.ts'
import * as ospitato from './ospitato.ts'
import * as segnali from './segnali.ts'
import * as osservatore from './osservatore.ts'
import * as oss from './osservazioni.ts'
import * as diario from './diario.ts'
import * as progetti from './progetti.ts'
import { cercatoreDiProgetti } from './attenzione.ts'
import * as spotlight from './connettori/spotlight-recenti.ts'
import * as cronologia from './connettori/cronologia-browser.ts'
import * as gitProfondo from './connettori/git-profondo.ts'
import * as editor from './connettori/editor-recenti.ts'

/** I repository letti per giro, al massimo. */
export const REPO_MAX = 25
/** La prima passata sulla cronologia guarda indietro un giorno, non di più. */
const PRIMA_CRONOLOGIA = 24 * 3600_000
const GIORNO = 86_400_000

export type Lettori = {
  recenti: () => Promise<spotlight.FileRecente[]>
  repository: () => Promise<string[]>
  cronologia: (dal: (p: cronologia.ProfiloBrowser) => number, esclusi: readonly string[], visto: (p: cronologia.ProfiloBrowser) => number) => Promise<cronologia.Lettura[]>
  statoRepo: (percorso: string, mie: Iterable<string>) => Promise<gitProfondo.StatoRepo | null>
  editor: () => Promise<editor.VoceEditor[]>
  cartelle: () => string[]
  casa: string
}

const VERI: Lettori = {
  recenti: () => spotlight.recenti(),
  repository: () => spotlight.repository(),
  cronologia: (dal, esclusi, visto) => cronologia.leggiTutto(dal, { esclusi, visto }),
  statoRepo: (p, mie) => gitProfondo.statoRepo(p, mie),
  editor: () => editor.leggiEditor(),
  cartelle: () => segnali.cartelleNote(),
  casa: homedir()
}
let lettori: Lettori = VERI
/** Solo per le prove. */
export function perProva(l: Partial<Lettori> | null) { lettori = l ? { ...VERI, ...l } : VERI }

const iso = (ms: number) => new Date(ms).toISOString()

/** Il conto di chi chiede possiede l'osservatore, ed è acceso e non in pausa? */
export function puoGuardare(adesso = new Date()): boolean {
  if (ospitato.OSPITATO || !osservatore.disponibile()) return false
  const me = chi.adesso()
  if (!me || osservatore.proprietario() !== me) return false
  const s = osservatore.stato(adesso)
  return s.acceso && !s.pausaFino
}

/**
 * Una passata su tutto quello che non chiede permessi. Torna quante cose
 * nuove ha scritto. `forza` salta il controllo del proprietario (le prove).
 */
export async function raccogli(adesso = new Date(), o: { forza?: boolean } = {}): Promise<number> {
  if (!o.forza && !puoGuardare(adesso)) return 0
  const s = osservatore.statoPerChiChiede(adesso)
  const cerca = cercatoreDiProgetti()
  const ora = adesso.toISOString()
  const da14 = adesso.getTime() - oss.GIORNI_GREZZE * GIORNO
  let nuove = 0
  const conta = (e: oss.Esito) => { if (e === 'nuova') nuove++ }

  // i file usati di recente: percorso e quando, mai il contenuto
  const recenti = await lettori.recenti().catch(() => [] as spotlight.FileRecente[])
  for (const f of recenti) {
    conta(oss.registra({ kind: 'file', sourceId: `file:${f.percorso}`, title: basename(f.percorso), text: `${f.volte} uses`, observedAt: ora, eventAt: f.usato, percorso: f.percorso }, cerca))
  }

  // la cronologia, dall'ultima passata di ogni profilo
  // un file che non è cambiato dall'ultima passata non si ricopia nemmeno
  const cursore = (p: cronologia.ProfiloBrowser) => `cronologia:${p.browser}:${p.profilo}`
  const cursoreData = (p: cronologia.ProfiloBrowser) => `cronologia-mtime:${p.browser}:${p.profilo}`
  const letture = await lettori.cronologia(p => {
    const c = Number(store.cursore(cursore(p)))
    return Number.isFinite(c) && c > 0 ? c : adesso.getTime() - PRIMA_CRONOLOGIA
  }, s.siti, p => Number(store.cursore(cursoreData(p)) ?? 0)).catch(() => [] as cronologia.Lettura[])
  for (const { profilo, visite, mtime, saltato } of letture) {
    if (!saltato && mtime) store.segnaCursore(cursoreData(profilo), String(mtime))
    if (!visite.length) continue
    const vive = visite.filter(v => !oss.dimenticata(iso(v.quando)))
    for (const g of cronologia.perGiorno(vive, ms => fuso.giornoIn(new Date(ms)))) {
      const spans = vive.filter(v => fuso.giornoIn(new Date(v.quando)) === g.giorno && v.dominio === g.dominio && v.documento === g.documento)
        .map(v => [v.quando, v.quando + Math.max(60_000, v.secondi * 1000)] as [number, number])
      conta(oss.registra({
        kind: 'web', sourceId: `web:${g.documento ?? g.dominio}`, app: g.browser, title: g.titoli[0] ?? g.dominio,
        text: `${g.visite} visits on ${g.dominio}: ${g.titoli.join(' | ')}`, observedAt: iso(g.prima), endAt: iso(g.ultima),
        seconds: g.secondi, spans, percorso: `${g.dominio} ${g.url} ${g.titoli.join(' ')}`
      }, cerca))
    }
    store.segnaCursore(cursore(profilo), String(Math.max(...visite.map(v => v.quando))))
  }

  // i repository: le cartelle di lavoro, quelli di Spotlight, quelli dei file appena usati
  const repo = new Set<string>(lettori.cartelle())
  for (const r of await lettori.repository().catch(() => [] as string[])) repo.add(r)
  for (const f of recenti) { const r = gitProfondo.repoDelFile(f.percorso, lettori.casa); if (r) repo.add(r) }
  const mie = segnali.mieiIndirizzi()
  // solo dentro casa, mai un volume di rete o esterno
  for (const percorso of [...repo].filter(x => gitProfondo.repoAmmesso(x, lettori.casa)).slice(0, REPO_MAX)) {
    const r = await lettori.statoRepo(percorso, mie).catch(() => null)
    if (!r) continue
    const progetto = oss.progettoDi({ percorso: r.percorso }, cerca)
    const recentiRami = r.rami.filter(x => Date.parse(x.quando) >= adesso.getTime() - 7 * GIORNO).map(x => x.nome)
    conta(oss.registra({
      kind: 'repo', sourceId: `repo:${r.percorso}`, title: r.nome, observedAt: ora, percorso: r.percorso, projectId: progetto,
      text: `branch ${r.ramo ?? 'detached'}, ${r.modifiche} uncommitted ${r.modifiche === 1 ? 'change' : 'changes'}${recentiRami.length ? `, recent branches: ${recentiRami.join(', ')}` : ''}`
    }, cerca))
    for (const c of r.commit) {
      if (Date.parse(c.quando) < da14) continue
      conta(oss.registra({
        kind: c.mio ? 'commit' : 'commit-altri', sourceId: `commit:${r.percorso}@${c.hash}`, app: c.mio ? null : c.autore,
        title: c.messaggio, observedAt: ora, eventAt: c.quando, percorso: r.percorso, projectId: progetto
      }, cerca))
    }
  }

  // le cartelle aperte negli editor, solo con la loro data: una voce senza data
  // sarebbe «vista adesso» a ogni giro, e tornerebbe dentro un'ora dimenticata
  for (const v of await lettori.editor().catch(() => [] as editor.VoceEditor[])) {
    if (!v.quando || Date.parse(v.quando) < da14) continue
    conta(oss.registra({
      kind: 'editor', sourceId: `editor:${v.editor}:${v.percorso}`, app: v.editor, title: basename(v.percorso),
      observedAt: ora, eventAt: v.quando, percorso: v.percorso
    }, cerca))
  }
  return nuove
}

/** Il giro del quarto d'ora: raccoglie, conserva, e scrive il diario se tocca. */
export async function giro(adesso = new Date()): Promise<void> {
  if (!puoGuardare(adesso)) return
  await raccogli(adesso)
  oss.conserva(adesso)
  await diario.forse(adesso)
}

/* ------------------------------------------------------------- la pagina */

export type VistaOggi = {
  giorno: string
  episodi: { id: string; progetto: string | null; nomeProgetto: string | null; inizio: string; fine: string; minuti: number; etichetta: string; app: string[] }[]
  diario: { id: string; progetto: string | null; nomeProgetto: string | null; genere: string; testo: string }[]
  /** Il testo della finestra è acceso? La pagina lo dice. */
  testi: boolean
  /** Accesa di serie e non ancora detto: la pagina lo dice una volta. */
  avviso: boolean
}

/** Quello che ha visto oggi, per la pagina: gli episodi e il diario, coi nomi dei progetti. */
export function oggi(adesso = new Date()): VistaOggi {
  const giorno = fuso.giornoIn(adesso)
  const nomi = new Map(progetti.elenco().map(p => [p.id, p.nome]))
  const nome = (id: string | null) => (id ? nomi.get(id) ?? null : null)
  return {
    giorno,
    episodi: oss.episodi(giorno).map(e => ({ id: e.id, progetto: e.projectId, nomeProgetto: nome(e.projectId), inizio: e.inizio, fine: e.fine, minuti: e.minuti, etichetta: e.etichetta, app: e.app })),
    diario: oss.diarioDelGiorno(giorno).map(r => ({ id: r.id, progetto: r.projectId, nomeProgetto: nome(r.projectId), genere: r.kind, testo: r.text })),
    testi: osservatore.statoPerChiChiede(adesso).testi,
    avviso: osservatore.statoPerChiChiede(adesso).avviso
  }
}

/** Dimentica l'ora che contiene `quando`, o tutto il giorno di `adesso`. */
export async function dimentica(cosa: { ora: Date } | { giorno: true }, adesso = new Date()): Promise<oss.Dimenticato> {
  const r = 'ora' in cosa ? oss.oraDi(cosa.ora) : oss.giornoDi(adesso)
  // il futuro non si dimentica: un'ora che non è ancora finita si chiude adesso, e quello che arriva dopo entra
  const a = new Date(Math.min(r.a.getTime(), adesso.getTime() + 1000))
  return osservatore.dimenticaIntervallo(r.da, a, adesso)
}
