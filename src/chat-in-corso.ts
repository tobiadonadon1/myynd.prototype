/*
 * Le risposte che stanno arrivando, una per chat.
 *
 * «If I am working with a chat, and I switch to the next one, the "thinking"
 * little pill moves from chat to chat.» (19 ott 2026). La rotella, il passo
 * («Cerco nelle tue fonti»), la domanda appena mandata e la risposta che
 * cresce erano un solo stato per tutta la finestra: aperta un'altra chat, la
 * rotella la seguiva, e la risposta di quella di prima non tornava più nella
 * sua finché non si ricaricava. Qui ogni corsa sta sotto l'id della sua chat,
 * e quella aperta mostra solo la sua.
 *
 * Funzioni pure su una Map che non si modifica: React vede una Map nuova a
 * ogni cambio, e le prove le leggono senza la pagina.
 */

export type MessaggioCorsa = { id: string; role: string; text: string }

export type Corsa = {
  /** La domanda appena mandata, finché il server non la rimanda salvata. */
  domanda: MessaggioCorsa
  /** Prima della prima parola: è qui che si vede la rotella. */
  pensando: boolean
  /** Cosa sta facendo il server, se l'ha detto. */
  passo: string | null
  /** La risposta finora. */
  vivo: string
}

export type Corse = ReadonlyMap<string, Corsa>

export const nessunaCorsa: Corse = new Map()

const con = (c: Corse, chat: string, corsa: Corsa): Corse => {
  const m = new Map(c)
  m.set(chat, corsa)
  return m
}

const cambia = (c: Corse, chat: string, f: (x: Corsa) => Corsa): Corse => {
  const x = c.get(chat)
  return x ? con(c, chat, f(x)) : c
}

export function avvia(c: Corse, chat: string, domanda: MessaggioCorsa): Corse {
  return con(c, chat, { domanda, pensando: true, passo: null, vivo: '' })
}

export function frammento(c: Corse, chat: string, delta: string): Corse {
  return cambia(c, chat, x => ({ ...x, pensando: false, passo: null, vivo: x.vivo + delta }))
}

/** Il motore è cambiato a metà e riparte da capo: quello già scritto non vale più. */
export function riparti(c: Corse, chat: string): Corse {
  return cambia(c, chat, x => ({ ...x, pensando: true, vivo: '' }))
}

export function passo(c: Corse, chat: string, testo: string | null): Corse {
  return cambia(c, chat, x => ({ ...x, passo: testo }))
}

/**
 * Finita, tagliata o andata storta. `domanda` dice quale: una chat in cui si
 * è già mandata una domanda nuova non perde la sua per la fine di quella vecchia.
 */
export function chiudi(c: Corse, chat: string, domanda?: string): Corse {
  const x = c.get(chat)
  if (!x || (domanda && x.domanda.id !== domanda)) return c
  const m = new Map(c)
  m.delete(chat)
  return m
}

export const pensaIn = (c: Corse, chat: string | null): boolean => !!chat && !!c.get(chat)?.pensando

/**
 * Quello che la chat aperta mostra: i messaggi salvati, e sopra la sua corsa
 * se ne ha una. La domanda il server la salva prima di cominciare a
 * rispondere, e una chat riaperta a metà la rilegge già dentro: allora non si
 * aggiunge due volte.
 */
export function vista<M extends MessaggioCorsa>(salvati: M[], corsa: Corsa | undefined): (M | MessaggioCorsa)[] {
  if (!corsa) return salvati
  const ultima = salvati[salvati.length - 1]
  const giaDentro = !!ultima && ultima.role === 'u' && ultima.text === corsa.domanda.text
  const fuori: (M | MessaggioCorsa)[] = giaDentro ? [...salvati] : [...salvati, corsa.domanda]
  if (corsa.vivo) fuori.push({ id: corsa.domanda.id + 'a', role: 'a', text: corsa.vivo })
  return fuori
}

/**
 * La chat appena nata, nell'elenco a sinistra da subito.
 *
 * Il server la crea alla prima domanda, ma l'elenco si rileggeva solo a
 * risposta finita: chi apriva un'altra chat mentre questa pensava non aveva
 * più una riga per tornarci. Il titolo è quello che il server le dà (le prime
 * quaranta lettere), finché il modello non gliene trova uno.
 */
export function conRiga<T extends { id: string; titolo: string; quando: string }>(elenco: T[], chat: string, domanda: string, quando: string): (T | { id: string; titolo: string; quando: string })[] {
  if (elenco.some(x => x.id === chat)) return elenco
  return [{ id: chat, titolo: domanda.slice(0, 40), quando }, ...elenco]
}
