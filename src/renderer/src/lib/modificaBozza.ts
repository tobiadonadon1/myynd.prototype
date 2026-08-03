/**
 * Stato di modifica di una bozza, condiviso a livello di modulo — non nello
 * stato di `Attesa`, che smonta ogni volta che si naviga altrove. Due cose
 * vivono qui perché entrambe devono sopravvivere a uno smontaggio:
 *
 * 1. Il corpo salvato con "salva" ma non ancora inviato, per proposta
 *    (`id` → testo). "salva" esce dalla modifica senza inviare nulla — è
 *    esattamente il gesto che invita a guardare altrove e tornare, e un
 *    salvataggio perso in quel momento manderebbe poi la mail originale,
 *    non quella corretta.
 *
 * 2. Chi può annullare la modifica in corso adesso, se c'è. Serve al
 *    gestore globale di `esc` in `App.tsx`: `Attesa` intercetta già `esc`
 *    quando il focus è dentro il testo editabile (e ferma lì la
 *    propagazione), ma non quando il focus è altrove nello schermo — per
 *    esempio sul bottone "salva" dopo un tab. In quel caso l'evento
 *    raggiunge `window` così com'è, e senza questo registro il gestore
 *    globale non ha modo di sapere che una modifica è aperta: nasconderebbe
 *    la finestra invece di annullare, perdendo la modifica in corso.
 */

const corpiModificati = new Map<string, string>()

export function leggiCorpoModificato(id: string): string | null {
  return corpiModificati.get(id) ?? null
}

export function impostaCorpoModificato(id: string, testo: string): void {
  corpiModificati.set(id, testo)
}

export function rimuoviCorpoModificato(id: string): void {
  corpiModificati.delete(id)
}

let annullaCorrente: (() => void) | null = null

/** `Attesa` chiama questa ogni volta che entra/esce dalla modifica, passando
 *  la funzione che annulla (o `null` quando non si sta modificando). */
export function registraAnnullaBozza(fn: (() => void) | null): void {
  annullaCorrente = fn
}

/** Chiamata dal gestore globale di `esc`: se una modifica è aperta la
 *  annulla e torna `true` (la finestra non va nascosta); altrimenti `false`. */
export function annullaBozzaGlobale(): boolean {
  if (!annullaCorrente) return false
  annullaCorrente()
  return true
}
