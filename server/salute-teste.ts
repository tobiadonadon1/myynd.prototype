// La salute del motore che lavora: guardata dal vivo, mai un episodio.
//
// Un motore non si «legge»: o risponde o no, e la risposta cambia da sola
// (si rientra in Claude Code dal Terminale, si incolla una chiave nuova). Qui
// si dice il suo guaio di adesso — uscito dall'account, chiave rifiutata,
// credito finito — e si scrive una riga al giorno per lui, solo quando lo
// stato cambia. Il modello sul computer (`compatibile`) non conta mai: non ha
// una riga, e il suo spegnersi non fa un giorno guasto.
//
// «Anthropic keeps disconnecting, every time you redeploy»: con questo, il
// giorno in cui succede resta scritto, e la prima pagina lo dice con il
// bottone per rientrare.

import db from './store.ts'
import * as chi from './chi.ts'
import * as mod from './modello.ts'
import * as abbonamento from './abbonamento.ts'
import { giornoIn } from './fuso.ts'
import { peggiore, type Rimedio } from './connettori/guaio.ts'
import { versioneApp } from './salute-fonti.ts'

export type Testa = 'claude' | 'openai'

/** Il guaio del motore, se c'è: un nuovo accesso, una chiave, o il credito. */
export function problemaTesta(id: Testa): { rimedio: 'accedi' | 'credenziale' | 'credito' } | null {
  // uscito dall'account anche se una chiave lo tiene in piedi: sta pagando a
  // consumo senza saperlo, e va detto
  if (id === 'claude' && abbonamento.uscito()) return { rimedio: 'accedi' }
  if (mod.rifiutata(id)) return { rimedio: 'credenziale' }
  if (mod.testaAlLavoro() === id && mod.mancaIlCredito()) return { rimedio: 'credito' }
  return null
}

/**
 * Il guaio da dire nella riga fissa: solo del motore che lavora, e solo
 * accesso o chiave. Il credito ha già la sua carta.
 */
export function testaDaMostrare(): { id: Testa; rimedio: 'accedi' | 'credenziale' } | null {
  const t = mod.testaAlLavoro()
  if (t !== 'claude' && t !== 'openai') return null
  const p = problemaTesta(t)
  return p && p.rimedio !== 'credito' ? { id: t, rimedio: p.rimedio } : null
}

/** L'ultimo stato scritto, per persona: si scrive solo quando cambia. */
const scritti = new Map<string, { giorno: string; testa: Testa; stato: string }>()

/**
 * Una riga del giorno per il motore che lavora, quando il suo stato cambia.
 *
 * `'ok'` dice solo che una chiamata è appena andata bene: un account da cui
 * si è usciti mentre una chiave risponde resta «accedi».
 */
export function segnaTesta(_esito?: 'ok'): void {
  const t = mod.testaAlLavoro()
  if (t !== 'claude' && t !== 'openai') return
  const stato = problemaTesta(t)?.rimedio ?? 'ok'
  const adesso = new Date()
  const giorno = giornoIn(adesso)
  const k = chi.adesso() ?? ''
  const prima = scritti.get(k)
  if (prima && prima.giorno === giorno && prima.testa === t && prima.stato === stato) return
  const iso = adesso.toISOString()
  const r = db.prepare('SELECT rimedio FROM salute_fonti WHERE giorno = ? AND fonte = ?').get(giorno, t) as { rimedio: string | null } | undefined
  const rimedio = stato === 'ok' ? (r?.rimedio ?? null) : peggiore((r?.rimedio ?? null) as Rimedio | null, stato)
  db.prepare(`
    INSERT INTO salute_fonti (giorno, fonte, letture, pulite, guai, rimedio, versione, prima, ultima)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(giorno, fonte) DO UPDATE SET letture = letture + 1, pulite = pulite + excluded.pulite, guai = guai + excluded.guai,
      rimedio = excluded.rimedio, versione = excluded.versione, ultima = excluded.ultima
  `).run(giorno, t, stato === 'ok' ? 1 : 0, stato === 'ok' ? 0 : 1, rimedio, versioneApp(), iso, iso)
  scritti.set(k, { giorno, testa: t, stato })
}

/** Solo per le prove: si dimentica cosa si è scritto. */
export function perProva() { scritti.clear() }
