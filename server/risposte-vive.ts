// Le risposte vive: quello che il verbale di ogni risposta dice, letto dopo.
//
// Ogni risposta della chat porta con sé `messaggi.verifica` (vedi
// ancoraggio.ts): da quale strada è arrivata, quante fonti ha tenuto, se ha
// rifiutato, quali cifre non stanno in niente di letto. Qui non c'è nessun
// modello: si segna quando il suo messaggio dopo la contraddice, si scrive
// una riga di registro senza il contenuto, e si sommano i verbali per la
// riga di comando (`--vive`).

import db from './store.ts'
import type { Verifica } from './ancoraggio.ts'

const apostrofi = (s: string) => s.replace(/[’‘`´]/g, '\'').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Il suo messaggio è una correzione di quello che Myynd ha appena detto.
 *
 * Comincia con un no secco, un «sbagliato», un «non è così». Un «no» che
 * continua con un'altra domanda («no, and also the invoice?») non lo è, e
 * nemmeno «no worries» o «no problem».
 */
export function eUnaCorrezione(testo: string): boolean {
  const t = apostrofi(testo).trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return false
  // «No, thanks» e «no thanks» sono la stessa cortesia: la virgola dopo il «no» non conta
  if (/^(?:no worries|no problem|no thanks|no grazie|nessun problema)\b/.test(t.replace(/^no[\s,.!;:]+/, 'no '))) return false
  const inizi = /^(?:nope|wrong|that's wrong|that's not|not what i asked|incorrect|sbagliat\w*|non e cosi|non e vero|non hai capito|non e quello)(?![a-z])/
  if (inizi.test(t)) return true
  if (!/^no\b/.test(t)) return false
  // «no» seguito, entro due parole, da una congiunzione: non sta correggendo, sta aggiungendo
  const dopo = t.slice(2).replace(/^[\s,.:;!]+/, '').split(/\s+/).slice(0, 3)
  const seguito = ['and', 'also', 'but', 'anche', 'ma']
  for (let i = 0; i < Math.min(2, dopo.length); i++) {
    if (seguito.includes(dopo[i])) return false
    if (dopo[i] === 'e' && dopo[i + 1] === 'anche') return false
  }
  return true
}

const TRE_MINUTI = 3 * 60_000

/**
 * Segna la risposta appena data come corretta da lui, se il suo messaggio
 * la contraddice entro tre minuti. Solo l'ultima risposta di quella chat, e
 * solo se porta un verbale.
 */
export function segnaCorrezione(chat: string, domanda: string, adesso: Date): boolean {
  if (!eUnaCorrezione(domanda)) return false
  const ultima = db.prepare("SELECT id, quando, verifica FROM messaggi WHERE chat = ? AND ruolo = 'a' ORDER BY quando DESC, id DESC LIMIT 1")
    .get(chat) as { id: string; quando: string; verifica: string | null } | undefined
  if (!ultima?.verifica) return false
  const eta = adesso.getTime() - new Date(ultima.quando).getTime()
  if (!Number.isFinite(eta) || eta < 0 || eta > TRE_MINUTI) return false
  let v: Verifica
  try { v = JSON.parse(ultima.verifica) as Verifica } catch { return false }
  if (v.corretta) return true
  v.corretta = true
  db.prepare('UPDATE messaggi SET verifica = ? WHERE id = ?').run(JSON.stringify(v), ultima.id)
  return true
}

/** La riga di registro per una risposta: numeri e stati, mai la domanda o la risposta. */
export function rigaRisposta(v: Verifica): string {
  const sn = (b: boolean) => (b ? 'si' : 'no')
  return `myynd · risposta · via ${v.via} · fonti ${v.citazioni} · memoria ${sn(v.memoria)} · rifiuto ${sn(v.rifiuto)} · scoperti ${v.scoperti.length} · tolte ${v.nonValide.length}`
}

export type Somma = {
  risposte: number
  conFonti: number
  conMemoria: number
  rifiuti: number
  senzaFonti: number
  conScoperti: number
  conTolte: number
  corrette: number
}

export type Vive = { giorni: number; totale: Somma; perVia: Record<string, Somma> }

const vuota = (): Somma => ({ risposte: 0, conFonti: 0, conMemoria: 0, rifiuti: 0, senzaFonti: 0, conScoperti: 0, conTolte: 0, corrette: 0 })

/** I verbali delle risposte degli ultimi `giorni`, sommati: in tutto e per strada. */
export function vive(giorni: number): Vive {
  const da = new Date(Date.now() - giorni * 86_400_000).toISOString()
  const righe = db.prepare("SELECT verifica FROM messaggi WHERE ruolo = 'a' AND verifica IS NOT NULL AND quando >= ?").all(da) as { verifica: string }[]
  const totale = vuota()
  const perVia: Record<string, Somma> = {}
  for (const r of righe) {
    let v: Verifica
    try { v = JSON.parse(r.verifica) as Verifica } catch { continue }
    const via = perVia[v.via] ??= vuota()
    for (const s of [totale, via]) {
      s.risposte++
      if (v.citazioni > 0 || v.memoria) s.conFonti++
      if (v.memoria) s.conMemoria++
      if (v.rifiuto) s.rifiuti++
      if (v.senzaFonti) s.senzaFonti++
      if (v.scoperti?.length) s.conScoperti++
      if (v.nonValide?.length) s.conTolte++
      if (v.corretta) s.corrette++
    }
  }
  return { giorni, totale, perVia }
}
