// Il primo gradino: la libertà che Myynd si guadagna, una persona alla volta.
//
// «Myynd earns freedom.» Una risposta preparata da Myynd e partita com'era (o
// quasi) è una prova: con quella persona scrive come scriverebbe lei. Quando
// le sue bozze a una persona partono intatte o appena ritoccate almeno quattro
// volte sulle ultime cinque, quella persona sale di un gradino: ogni sua mail
// che chiede una risposta ha la bozza pronta la mattina, senza che nessuno la
// chieda. Due bozze di fila riscritte a fondo la fanno scendere. E «Take it
// back», sotto la riga o in Memoria, la fa scendere subito: per risalire
// servono altre quattro bozze partite così.
//
// Niente tabelle nuove: ogni invio è un segnale (`myynd.risposta`, per riga,
// con la distanza di `ritocco.ts`), ogni ritiro un altro
// (`myynd.risposta.ritirata`), e lo stato si rifà dai fatti a ogni lettura.
// Così un gradino non si può scrivere a mano, e un ritiro non si dimentica.
// Gira nel contesto di chi legge: i segnali sono nel suo indice.

import db, * as store from './store.ts'
import * as segnali from './segnali.ts'
import { classe } from './ritocco.ts'
import { fonteReggeAncora } from './iniziativa.ts'

/** Le ultime quante bozze si guardano. */
export const FINESTRA = 5
/** Quante, fra quelle, devono essere partite intatte o quasi. */
export const SERVONO = 4
/** Quante riscritte di fila lo fanno scendere. */
export const PESANTI = 2
/** L'origine delle righe nate da un gradino. */
export const ORIGINE = 'guadagnata'

const INVIO = 'myynd.risposta'
const RITIRO = 'myynd.risposta.ritirata'

export type Gradino = {
  indirizzo: string
  nome: string
  /** Quando è salito: l'invio che ha fatto quattro su cinque. */
  dal: string
  /** Le ultime bozze guardate, e quante partite intatte o quasi. */
  leggere: number
  su: number
}

const pulito = (a: string) => a.trim().toLowerCase()
/** Intatta o appena ritoccata: il senso è quello, qualche parola al massimo. */
const leggera = (distanza: number) => { const c = classe(distanza); return c === 'identico' || c === 'ritocco' }
/** Riscritta a fondo: oltre metà delle parole cambiate. Una modificata a metà non è un rifiuto. */
const pesante = (distanza: number) => classe(distanza) === 'riscritto'

/**
 * Una bozza di risposta partita verso la persona a cui rispondeva. Una per
 * riga: la stessa mail vista da «Manda» e poi nella posta inviata non conta
 * due volte.
 *
 * `propria`: dalla sua posta è partita, nel filo, una risposta riscritta da
 * capo. È il rifiuto più forte della bozza, e conta come una riscritta; ma
 * con il solo filo come prova può essere una riga sua scritta prima («arrivo,
 * te li mando»), e allora cede il posto alla bozza vista partire dopo.
 */
export function registraInvio(o: { compito: string; indirizzo: string; nome?: string | null; distanza: number; quando?: string; propria?: boolean }): boolean {
  const indirizzo = pulito(o.indirizzo)
  if (!indirizzo.includes('@') || !Number.isFinite(o.distanza)) return false
  const quando = o.quando ?? new Date().toISOString()
  const id = `${INVIO}|${o.compito}`
  if (!o.propria) {
    const prima = db.prepare('SELECT dati FROM segnali WHERE id = ?').get(id) as { dati: string | null } | undefined
    let sua = false
    try { sua = !!prima && !!(JSON.parse(prima.dati ?? '{}') as { propria?: boolean }).propria } catch { /* una riga storta resta */ }
    if (sua) db.prepare('DELETE FROM segnali WHERE id = ?').run(id)
  }
  return segnali.scrivi({ id, genere: INVIO, quando, ref: indirizzo, valore: o.distanza, dati: { compito: o.compito, nome: o.nome ?? '', ...(o.propria ? { propria: true } : {}) } })
}

/**
 * «Manda» su una riga: conta se la mail va a chi aveva scritto. Una risposta
 * girata a un altro («inoltro a Sara») non dice niente della voce con lui.
 */
export function dopoManda(c: Pick<store.Compito, 'id' | 'doc'>, a: string, nome: string | null | undefined, distanza: number, quando?: string): boolean {
  const m = mittenteDi(c)
  if (!m || pulito(m) !== pulito(store.indirizzoDi(a) ?? a)) return false
  return registraInvio({ compito: c.id, indirizzo: m, nome, distanza, quando })
}

/** «Take it back»: scende adesso, e per risalire servono bozze nuove. */
export function ritira(indirizzo: string, adesso = new Date()): void {
  const a = pulito(indirizzo)
  const quando = adesso.toISOString()
  segnali.scrivi({ id: `${RITIRO}|${a}|${quando}`, genere: RITIRO, quando, ref: a })
}

type Fatto = { genere: string; quando: string; ref: string; valore: number | null; dati: string | null }

/**
 * Lo stato di ogni persona, rifatto dai fatti in ordine di tempo.
 *
 * Si sale quando fra le ultime cinque bozze (dall'ultimo ritiro in poi)
 * almeno quattro sono partite intatte o quasi; si scende a due riscritte di
 * fila, o a un ritiro. Da sceso si risale con la stessa regola: dopo due
 * riscritte le ultime cinque non possono fare quattro, finché non tornano
 * bozze buone.
 */
function stati(): Map<string, Gradino & { acceso: boolean }> {
  const fatti = db.prepare('SELECT genere, quando, ref, valore, dati FROM segnali WHERE genere IN (?, ?) AND ref IS NOT NULL ORDER BY quando, id').all(INVIO, RITIRO) as Fatto[]
  const m = new Map<string, Gradino & { acceso: boolean; ultime: boolean[]; pesanti: number }>()
  for (const f of fatti) {
    const a = f.ref
    const s = m.get(a) ?? { indirizzo: a, nome: '', dal: '', leggere: 0, su: 0, acceso: false, ultime: [], pesanti: 0 }
    m.set(a, s)
    if (f.genere === RITIRO) { s.acceso = false; s.ultime = []; s.pesanti = 0; continue }
    try { const n = (JSON.parse(f.dati ?? '{}') as { nome?: string }).nome; if (n) s.nome = n } catch { /* il nome è un di più */ }
    const buona = leggera(Number(f.valore))
    s.ultime = [...s.ultime, buona].slice(-FINESTRA)
    // una modificata a metà non sale e non scende: non conta fra le buone, e non rompe né allunga la fila delle riscritte
    s.pesanti = buona ? 0 : pesante(Number(f.valore)) ? s.pesanti + 1 : s.pesanti
    if (s.acceso && s.pesanti >= PESANTI) { s.acceso = false; continue }
    const conto = s.ultime.filter(Boolean).length
    if (!s.acceso && conto >= SERVONO) { s.acceso = true; s.dal = f.quando }
  }
  return new Map([...m].map(([k, s]) => [k, { indirizzo: s.indirizzo, nome: s.nome || segnali.nomeDallIndirizzo(s.indirizzo), dal: s.dal, leggere: s.ultime.length, su: s.ultime.filter(Boolean).length, acceso: s.acceso }]))
}

/** Le persone salite di un gradino, adesso. Per «Come lavori» e per il giro della notte. */
export function guadagnati(): Gradino[] {
  return [...stati().values()].filter(s => s.acceso).map(({ acceso: _, ...g }) => g).sort((x, y) => y.dal.localeCompare(x.dal))
}

/** Questa persona è salita? */
export function acceso(indirizzo: string): Gradino | null {
  const s = stati().get(pulito(indirizzo))
  if (!s?.acceso) return null
  const { acceso: _, ...g } = s
  return g
}

/** Chi ha scritto la mail da cui è nata la riga. */
export function mittenteDi(c: Pick<store.Compito, 'doc'>): string | null {
  const d = c.doc ? store.documento(c.doc) : null
  return d ? store.indirizzoDi(d.autore) : null
}

/** Una riga nata dal gradino è ancora sua: la fonte regge, e la persona è ancora su. */
export function rigaValida(c: Pick<store.Compito, 'doc'>): boolean {
  const a = mittenteDi(c)
  return !!a && !!acceso(a) && fonteReggeAncora(c.doc)
}

/** Per la riga: a chi risponde, se la riga è nata dal gradino e la persona è ancora su. */
export function perRiga(c: Pick<store.Compito, 'origine' | 'doc'>): { indirizzo: string; nome: string } | null {
  if (c.origine !== ORIGINE) return null
  const a = mittenteDi(c)
  const g = a ? acceso(a) : null
  return g ? { indirizzo: g.indirizzo, nome: g.nome } : null
}
