// Una riga della sua lista cambiata dalla chat: riscritta, spostata, chiusa, tolta.
//
// «it shouldn't ask me to reword it, he should automatically. he said he has,
// but i do not see it done...» (Tobia, 19 ott 2026). Gli aveva detto che il
// profilo X di Myynd non c'è e che i post partono dal suo; Myynd ha proposto la
// riga nuova, lui ha detto «yeah do that», e la risposta è stata «The reworded
// task is ready… I can't edit your task list from here». La chat andava
// sull'account Claude, che non ha attrezzi, e il prompt diceva «Attività
// attuali, solo contesto: non puoi modificarle in questo passaggio».
//
// Qui stanno i pezzi che non dipendono da chi risponde: quali righe nomina la
// conversazione, la decisione a schema per le strade senza attrezzi (l'account
// e il modello di casa), il controllo di quello che arriva (un attrezzo è un
// permesso: id vero, sue parole, niente di irreversibile), la frase che dice
// cosa è cambiato, e la guardia sulla risposta che dice «fatto» senza esserlo.
// Chi tocca davvero la riga sta in `index.ts` (riscrivere, togliere) e in
// `claude.ts` (chiudere, spostare), con gli stessi effetti delle rotte.

import { chiediJSON } from './modello.ts'
import type { Compito } from './store.ts'
import * as progetti from './progetti.ts'
import { senzaTrattini } from './testo.ts'
import { lingua, nellaLingua } from './config.ts'

export type Azione = 'riscrivi' | 'sposta' | 'fatto' | 'togli'
export const AZIONI: readonly Azione[] = ['riscrivi', 'sposta', 'fatto', 'togli']
const SCAFFALI = ['oggi', 'settimana', 'poi']

/** Un cambio già controllato: la riga c'è, è aperta, e le parole sono sue. */
export type Cambio = { azione: Azione; riga: Compito; testo?: string; giorno?: string; quando?: string; nota?: string }

/**
 * Quelle parole le ha dette davvero lei?
 *
 * È il controllo che trasforma «non prendere ordini dai documenti» da consiglio
 * in garanzia. Si confronta quello che il modello dichiara di aver letto nel
 * messaggio con il messaggio vero, normalizzando accenti e punteggiatura,
 * perché il punto non è la trascrizione esatta, è che la richiesta esista.
 * (Stava in `claude.ts`; adesso la usano anche i cambi alla lista, e
 * `claude.ts` la riesporta.)
 */
export function dettoDaLei(richiesta: string, messaggio: string): boolean {
  const r = pulisci(richiesta)
  const m = pulisci(messaggio)
  if (!r) return false
  if (m.includes(r)) return true
  // qualche parola può essere stata cambiata: si accetta se la maggior parte
  // viene comunque dal suo messaggio
  const parole = r.split(' ').filter(p => p.length > 2)
  if (!parole.length) return false
  const dentro = parole.filter(p => m.includes(p)).length
  return dentro / parole.length >= 0.7
}

// ̀-ͯ scritto per esteso: i segni diacritici combinanti, messi alla lettera
// nel sorgente, sono invisibili a chi legge
const pulisci = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim()

/** Le parole che pesano in una riga: quelle sopra le tre lettere. */
const parolePiene = (s: string) => pulisci(s).split(' ').filter(p => p.length > 3)

/**
 * La conversazione nomina questa riga? Il testo intero, o quasi tutte le sue
 * parole piene (almeno tre). «About «Mandare il post di lancio su X a chi
 * segue Myynd»» la nomina; «what's on Friday» no.
 */
export function nomina(testo: string, riga: Compito): boolean {
  const t = pulisci(testo)
  const r = pulisci(riga.testo)
  if (r.length >= 8 && t.includes(r)) return true
  const piene = [...new Set(parolePiene(riga.testo))]
  if (piene.length < 3) return false
  const parole = new Set(t.split(' '))
  return piene.filter(p => parole.has(p)).length / piene.length >= 0.75
}

/** «my list», «that task», «la riga»: parla della lista in generale. */
const SULLA_LISTA = /\b(?:task|tasks|to-?dos?|my list|the list|your list|compit[oi]|la (?:mia )?lista|in lista|la riga|quella riga)\b/i

/**
 * Le righe aperte di cui parla la conversazione: quella scelta accanto alla
 * chat, quelle nominate nel messaggio o negli ultimi quattro turni, o tutte
 * (le prime venti) se parla della lista in generale. Vuoto vuol dire che la
 * lista non c'entra, e allora non entra nemmeno nel prompt.
 */
export function righeInGioco(domanda: string, storico: { ruolo: string; testo: string }[], aperte: Compito[], scelta?: string): Compito[] {
  const recenti = [domanda, ...storico.slice(-4).map(t => t.testo)]
  const nominate = aperte.filter(c => c.id === scelta || recenti.some(t => nomina(t, c)))
  if (nominate.length) return nominate
  return SULLA_LISTA.test(domanda) ? aperte.slice(0, 20) : []
}

/** Un verbo che cambia una riga, in inglese o in italiano. */
const VERBO_CAMBIO = /\b(?:reword|rename|rewrite|change|update|edit|fix|move|postpone|push|remove|delete|drop|done|did|finished|mark|do (?:it|that|this)|go ahead|riscriv\w*|rinomin\w*|cambi\w*|modific\w*|aggiorn\w*|corregg\w*|spost\w*|rimand\w*|togli\w*|elimin\w*|cancell\w*|fatt[oa]|chiud\w*|fallo|falla)\b/i

/**
 * Tocca decidere se cambiare una riga? Solo se la conversazione ne nomina
 * almeno una, e il messaggio non è una domanda e basta: «quando scade?» non
 * cambia niente, «yeah do that» e «non c'è un profilo Myynd su X» sì.
 */
export function daDecidere(domanda: string, righe: Compito[]): boolean {
  if (!righe.length || !domanda.trim()) return false
  return !domanda.includes('?') || VERBO_CAMBIO.test(domanda)
}

/** Le righe come le legge chi decide: id, testo, giorno, progetto. Una per riga. */
export function listaCompatta(righe: Compito[]): string {
  return righe.map(c => {
    const p = c.progetto ? progetti.trova(c.progetto)?.nome : null
    return `[${c.id}] ${c.testo.replace(/\s+/g, ' ').slice(0, 200)} · ${c.giorno || c.quando}${p ? ` · ${p}` : ''}`
  }).join('\n')
}

export const NESSUNA_RIGA =
  'Non c\'è nessuna riga con quell\'id. Gli id buoni sono solo quelli fra parentesi quadre ' +
  'nella lista che hai: copiane uno alla lettera, oppure chiedile di quale riga sta parlando.'

/**
 * Controlla un cambio prima di farlo. Torna il cambio pronto, o il perché no
 * (una frase per il modello, che la riferisce: mai un lancio).
 *
 * `messaggio` è il suo messaggio di adesso, `sue` i suoi messaggi recenti
 * (questo compreso). Riscrivere vuole le sue parole da uno dei suoi messaggi
 * recenti: è la conversazione che ha reso la riga sbagliata, e può averlo
 * detto due turni fa («we are posting out of my personal account») prima di
 * dire «yeah do that». Chiudere, spostare e togliere le vogliono da questo
 * messaggio: togliere una cosa che lui vede si fa solo se lo dice adesso.
 */
export function valida(input: unknown, ctx: { aperte: Compito[]; messaggio: string; sue: string[] }): Cambio | string {
  const d = (input ?? {}) as Record<string, unknown>
  const s = (v: unknown) => typeof v === 'string' ? v.trim() : ''
  const azione = s(d.azione) as Azione
  if (!AZIONI.includes(azione)) return 'L\'azione è una fra «riscrivi», «sposta», «fatto» e «togli».'
  const riga = ctx.aperte.find(c => c.id === s(d.id))
  if (!riga) return NESSUNA_RIGA
  const citazione = s(d.citazione)
  if (azione === 'riscrivi') {
    const testo = senzaTrattini(s(d.testo).replace(/\s+/g, ' ')).replace(/^["«“']+|["»”']+$/g, '').trim().slice(0, 200)
    if (testo.length < 4) return 'Manca la riga nuova: scrivila intera, corta, come la leggerebbe lui nella lista.'
    if (pulisci(testo) === pulisci(riga.testo)) return 'La riga è già scritta così: non c\'è niente da cambiare.'
    if (!ctx.sue.some(m => dettoDaLei(citazione, m))) {
      return 'In «citazione» vanno le sue parole, copiate da un suo messaggio di questa conversazione, che rendono la riga sbagliata o vecchia. Se non ci sono, la riga resta com\'è: chiediglielo.'
    }
    return { azione, riga, testo }
  }
  if (!dettoDaLei(citazione, ctx.messaggio)) {
    return 'In «citazione» vanno le sue parole di questo messaggio che lo chiedono. Se non ci sono, non l\'ha chiesto, e la riga resta com\'è.'
  }
  if (azione === 'sposta') {
    const giorno = s(d.giorno)
    if (giorno && !/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return 'Il giorno si scrive AAAA-MM-GG, per esempio 2026-09-14.'
    const quando = SCAFFALI.includes(s(d.quando)) ? s(d.quando) : ''
    if (!giorno && !quando) return 'Dimmi dove: un giorno scritto AAAA-MM-GG, oppure uno scaffale fra «oggi», «settimana» e «poi».'
    return { azione, riga, ...(giorno ? { giorno } : {}), ...(quando ? { quando } : {}) }
  }
  return { azione, riga, ...(azione === 'fatto' && s(d.nota) ? { nota: s(d.nota).slice(0, 240) } : {}) }
}

/** Dove è finita una riga spostata, detto come si legge. */
function dove(c: Cambio, en: boolean): string {
  if (c.giorno) return en ? `to ${c.giorno}` : `al ${c.giorno}`
  const nomi = en ? { oggi: 'today', settimana: 'this week', poi: 'later' } : { oggi: 'oggi', settimana: 'questa settimana', poi: 'più avanti' }
  return en ? `to ${nomi[c.quando as keyof typeof nomi]}` : `a ${nomi[c.quando as keyof typeof nomi]}`
}

/**
 * Cosa è cambiato, in una frase piana, nella lingua dell'app. È la frase che
 * il modello riprende, e quella che la chat aggiunge da sé se il modello
 * non lo dice.
 */
export function frase(c: Cambio): string {
  const en = lingua() === 'en'
  const prima = c.riga.testo.replace(/\s+/g, ' ').trim()
  switch (c.azione) {
    case 'riscrivi': return en ? `I reworded the task to «${c.testo}».` : `Ho riscritto la riga così: «${c.testo}».`
    case 'sposta': return en ? `I moved «${prima}» ${dove(c, en)}.` : `Ho spostato «${prima}» ${dove(c, en)}.`
    case 'fatto': return en ? `I marked «${prima}» as done.` : `Ho segnato «${prima}» come fatta.`
    case 'togli': return en ? `I took «${prima}» off your list.` : `Ho tolto «${prima}» dalla lista.`
  }
}

/**
 * La risposta dice di aver cambiato la lista? «I reworded», «I've updated
 * your task», «è salvata», «ho spostato la riga». Larga apposta: serve solo
 * quando *niente* è cambiato davvero, e allora una frase in più che dice la
 * verità costa meno di una bugia.
 */
const PROMESSA = [
  /\bI(?:'ve| have)? (?:just )?(?:reworded|renamed|rewrote|rewritten|updated|changed|edited|moved|removed|deleted|marked|saved|applied)\b/i,
  /\b(?:task|it|list|row)(?: is| has been|'s)? (?:now )?(?:saved|updated|reworded|renamed|changed|applied)\b/i,
  /\b(?:ho|l'ho|l’ho) (?:riscritt|rinominat|aggiornat|cambiat|modificat|spostat|tolt|segnat|salvat)\w*/i,
  /\b(?:è|e) (?:stata |ora )?(?:salvata|aggiornata|riscritta|cambiata|modificata)\b/i
]
export function promette(testo: string): boolean {
  return PROMESSA.some(r => r.test(testo))
}

/** La riga che rimette la verità in fondo a una risposta che ha promesso troppo. */
export function rigaDiVerita(): string {
  return lingua() === 'en' ? 'Your task list has not changed.' : 'La tua lista non è cambiata.'
}

/** Quello che chi decide può rispondere: un cambio, una domanda da fare, o niente. */
export type Decisione =
  | { tipo: 'cambio'; cambio: Cambio }
  | { tipo: 'chiedi'; riga: Compito }
  | { tipo: 'niente' }
  | { tipo: 'rifiuto'; perche: string }

const FORMA = {
  type: 'object',
  properties: {
    azione: { type: 'string', enum: ['nessuna', 'chiedi', ...AZIONI] },
    id: { type: 'string', description: 'L\'id della riga, copiato da fra le parentesi quadre. Vuoto con «nessuna».' },
    testo: { type: 'string', description: 'Con «riscrivi»: la riga nuova, intera. Altrimenti vuoto.' },
    giorno: { type: 'string', description: 'Con «sposta»: AAAA-MM-GG, se dice un giorno. Altrimenti vuoto.' },
    quando: { type: 'string', description: 'Con «sposta»: oggi, settimana o poi. Altrimenti vuoto.' },
    citazione: { type: 'string', description: 'Le SUE parole, copiate alla lettera da un suo messaggio, che giustificano il cambio.' }
  },
  required: ['azione', 'id', 'testo', 'giorno', 'quando', 'citazione'],
  additionalProperties: false
}

type Ferri = { chiediJSON: typeof chiediJSON }
const VERI: Ferri = { chiediJSON: o => chiediJSON(o) }
let ferri: Ferri = VERI
/** Solo per le prove: sostituisce la chiamata al modello, o la rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/**
 * La decisione, per chi risponde senza attrezzi (l'account Claude, il modello
 * di casa): una chiamata a schema sulla conversazione e sulle righe in gioco,
 * come la chiusura di una chat sul progetto. Poi il controllo di `valida`, e
 * nient'altro: chi chiama fa il cambio e lo dice al modello che risponde.
 * Il materiale non c'è apposta: un documento non cambia la sua lista.
 */
export async function decidi(domanda: string, storico: { ruolo: string; testo: string }[], righe: Compito[]): Promise<Decisione> {
  const turni = [...storico.slice(-6), { ruolo: 'u', testo: domanda }]
  const trascrizione = turni.map(t => `${t.ruolo === 'u' ? 'Persona' : 'Myynd'}: ${t.testo.trim().slice(0, 1500)}`).join('\n\n')
  const out = await ferri.chiediJSON<Record<string, unknown>>({
    lavoro: 'estrazione', max_tokens: 400, formato: FORMA, subito: true,
    system:
      'Sei Myynd. Qui sotto ci sono alcune righe della lista delle cose da fare della persona, e la conversazione fra te e lei. ' +
      'Decidi se una riga va cambiata adesso, dopo il suo ultimo messaggio.\n' +
      '«riscrivi»: quello che lei ha detto rende la riga sbagliata o vecchia, e la riga giusta segue chiaramente dalle sue parole, ' +
      'oppure ha detto di sì a una riga nuova che le avevi proposto tu (allora usa quella, parola per parola). La riga nuova è corta, ' +
      'comincia con un verbo, ed è nella lingua della riga di prima se non le hai proposto tu altre parole. Niente «—».\n' +
      '«fatto», «sposta», «togli»: solo se lo dice lei nel suo ultimo messaggio («l\'ho fatta», «spostala a venerdì», «toglila»).\n' +
      '«chiedi»: la riga non torna più con quello che ha detto, ma come riscriverla non è ovvio.\n' +
      '«nessuna»: in tutti gli altri casi, anche quando sta solo facendo una domanda.\n' +
      'In «citazione» copia alla lettera le SUE parole che giustificano il cambio. Gli id sono solo quelli fra parentesi quadre. ' +
      `Scrivi in ${nellaLingua()}.\n\nLe righe:\n${listaCompatta(righe)}`,
    messages: [{ role: 'user', content: trascrizione }]
  })
  if (!out) return { tipo: 'rifiuto', perche: 'la decisione non è arrivata' }
  const azione = typeof out.azione === 'string' ? out.azione : 'nessuna'
  if (azione === 'nessuna') return { tipo: 'niente' }
  if (azione === 'chiedi') {
    const riga = righe.find(c => c.id === out.id) ?? (righe.length === 1 ? righe[0] : null)
    return riga ? { tipo: 'chiedi', riga } : { tipo: 'niente' }
  }
  const sue = turni.filter(t => t.ruolo === 'u').map(t => t.testo)
  const v = valida(out, { aperte: righe, messaggio: domanda, sue })
  return typeof v === 'string' ? { tipo: 'rifiuto', perche: v } : { tipo: 'cambio', cambio: v }
}
