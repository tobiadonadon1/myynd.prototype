// Il lato dell'attività che Myynd prende in mano: il vocabolario e lo stato.
//
// «The whole idea is that it works while you sleep, just like you do if you
// were awake. While you are awake he handles a side of the business just like
// you would» (20 ottobre 2026). E il lato non lo sceglie il codice: «it is
// something that myynd should text you because it changes based per user».
//
// Qui stanno solo le cose che tre pezzi si dicono fra loro: quali lati
// esistono (un elenco chiuso, con le parole che li riconoscono e le regole di
// partenza del loro mandato), dove sta lo stato di una persona, e i nomi
// comuni (il tema della domanda, l'id del messaggio in chat, l'origine delle
// carte). Chi nota il lato e lo chiede sta in `lato-nota.ts`; chi lavora di
// notte su quel lato sta in `lato-lavoro.ts`.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as cfg from './config.ts'
import type { Classe, Regola } from './mandato.ts'

export type LatoId = 'investitori' | 'fatture' | 'partner' | 'clienti' | 'x' | 'video' | 'libero'

/** Il genere di lavoro che il lato fa nascere di notte. */
export type GenereLato = 'risposta' | 'fattura' | 'contenuto' | 'lavoro'

export type DefLato = {
  id: LatoId
  nome: { it: string; en: string }
  /** Il progetto che nasce dal sì: il suo «esito» nel mandato. */
  esito: { it: string; en: string }
  /** Come si saprà che va: la «misura» del mandato. */
  misura: { it: string; en: string }
  /** Le parole che lo riconoscono in oggetto e testo (posta, righe, carte scartate). Null per `libero`. */
  parole: RegExp | null
  genere: GenereLato
  /** Le regole del mandato al sì: sopra le predefinite, mai più larghe di quanto una mano sa fare. */
  classi: Partial<Record<Classe, Regola>>
  /** Le righe di serie del messaggio: cosa farebbe da solo, cosa chiederebbe sempre. */
  fa: { it: string[]; en: string[] }
  chiede: { it: string[]; en: string[] }
}

const MAI_SOLDI: Partial<Record<Classe, Regola>> = { paga: 'mai', cancella: 'mai' }

export const LATI: readonly DefLato[] = [
  {
    id: 'investitori',
    nome: { it: 'i follow-up con gli investitori', en: 'investor follow-ups' },
    esito: { it: 'Nessun investitore resta senza risposta', en: 'No investor is left waiting for a reply' },
    misura: { it: 'Ogni filo con un investitore ha una risposta entro due giorni', en: 'Every investor thread gets a reply within two days' },
    parole: /\b(investor[sei]?|investitor[ei]|vc|fund(raising)?|seed|pre-?seed|term ?sheet|due diligence|cap table|angel|lp|pitch)\b/i,
    genere: 'risposta',
    classi: { bozza_posta: 'auto', nota: 'auto', file: 'auto', invio: 'chiedi', contatto_nuovo: 'chiedi', calendario: 'chiedi', ...MAI_SOLDI },
    fa: { it: ['preparo ogni risposta nelle tue bozze', 'tengo una nota di dove sta ognuno'], en: ['draft each follow-up in your Drafts', 'keep a note of where each one stands'] },
    chiede: { it: ['prima di mandare', 'prima di scrivere a qualcuno di nuovo'], en: ['before sending', 'before writing to someone new'] }
  },
  {
    id: 'fatture',
    nome: { it: 'le fatture e i pagamenti da incassare', en: 'invoices and payments to chase' },
    esito: { it: 'Ogni fattura viene pagata', en: 'Every invoice gets paid' },
    misura: { it: 'Nessuna fattura scaduta senza un sollecito', en: 'No overdue invoice without a reminder' },
    parole: /\b(invoice[sd]?|fattur[ae]|payment|pagament[oi]|overdue|scadut[ao]|sollecito|receipt|ricevuta|bonifico|wire|unpaid|non pagat[ao]|iban)\b/i,
    genere: 'fattura',
    classi: { bozza_posta: 'auto', nota: 'auto', file: 'auto', invio: 'chiedi', contatto_nuovo: 'chiedi', ...MAI_SOLDI },
    fa: { it: ['preparo i solleciti nelle tue bozze', 'tengo l\'elenco di chi deve pagare'], en: ['draft the reminders in your Drafts', 'keep the list of who still owes you'] },
    chiede: { it: ['prima di mandare', 'per qualsiasi cosa sui soldi'], en: ['before sending', 'before anything about money'] }
  },
  {
    id: 'partner',
    nome: { it: 'le risposte ai partner', en: 'partner replies' },
    esito: { it: 'Ogni partner ha una risposta', en: 'Every partner gets an answer' },
    misura: { it: 'Nessun filo con un partner aspetta più di due giorni', en: 'No partner thread waits more than two days' },
    parole: /\b(partner(ship)?s?|collaborazion[ei]|collaboration|integration|integrazion[ei]|reseller|agency|agenzia|sponsor(ship)?)\b/i,
    genere: 'risposta',
    classi: { bozza_posta: 'auto', nota: 'auto', file: 'auto', invio: 'chiedi', contatto_nuovo: 'chiedi', calendario: 'chiedi', ...MAI_SOLDI },
    fa: { it: ['preparo le risposte di routine nelle tue bozze', 'ti dico chi ha avuto risposta'], en: ['draft the routine replies in your Drafts', 'tell you who got an answer'] },
    chiede: { it: ['prima di mandare', 'per qualsiasi cosa sui soldi'], en: ['before sending', 'before anything about money'] }
  },
  {
    id: 'clienti',
    nome: { it: 'le risposte ai clienti', en: 'client replies' },
    esito: { it: 'Ogni cliente ha una risposta', en: 'Every client gets an answer' },
    misura: { it: 'Nessun filo con un cliente aspetta più di un giorno', en: 'No client thread waits more than a day' },
    parole: /\b(client[sei]?|customer[s]?|quote|preventiv[oi]|proposal|proposta|ordine|revision[ei]?)\b/i,
    genere: 'risposta',
    classi: { bozza_posta: 'auto', nota: 'auto', file: 'auto', invio: 'chiedi', contatto_nuovo: 'chiedi', calendario: 'chiedi', ...MAI_SOLDI },
    fa: { it: ['preparo le risposte nelle tue bozze', 'tengo traccia di cosa aspetta ognuno'], en: ['draft the replies in your Drafts', 'keep track of what each one is waiting for'] },
    chiede: { it: ['prima di mandare', 'per prezzi e scadenze'], en: ['before sending', 'before prices and deadlines'] }
  },
  {
    id: 'x',
    nome: { it: 'la tua presenza su X', en: 'your X presence' },
    esito: { it: 'Su X esce qualcosa di vero ogni settimana', en: 'Something real goes out on X every week' },
    misura: { it: 'Post pronti ogni mattina, scritti come scrivi tu', en: 'Posts ready every morning, written the way you write' },
    // il lato X si nota dai suoi post (`segnali`), mai da queste parole: servono solo a capire cosa dice lui
    parole: /\b(x\.com|twitter|tweet[s]?|post[s]?|thread|follower[s]?|impressions?)\b/i,
    genere: 'contenuto',
    classi: { file: 'auto', nota: 'auto', pubblica: 'chiedi', ...MAI_SOLDI },
    fa: { it: ['scrivo i post come li scrivi tu', 'guardo cosa ha funzionato'], en: ['write posts the way you write them', 'look at what worked'] },
    chiede: { it: ['prima di pubblicare'], en: ['before posting'] }
  },
  {
    id: 'video',
    nome: { it: 'i video sui tuoi progetti', en: 'videos about your projects' },
    esito: { it: 'Un video pronto quando un progetto fa un passo', en: 'A video ready whenever a project moves' },
    misura: { it: 'Un copione da dire in camera per ogni traguardo', en: 'A script to film for every milestone' },
    parole: /\b(video|youtube|reel[s]?|tiktok|shorts?|copione|script|camera)\b/i,
    genere: 'contenuto',
    classi: { file: 'auto', nota: 'auto', pubblica: 'chiedi', ...MAI_SOLDI },
    fa: { it: ['scrivo il copione quando un progetto fa un passo'], en: ['write the script when a project moves'] },
    chiede: { it: ['prima di pubblicare'], en: ['before posting'] }
  },
  {
    id: 'libero',
    nome: { it: 'questo lato', en: 'this side' },
    esito: { it: '', en: '' },
    misura: { it: '', en: '' },
    parole: null,
    genere: 'lavoro',
    classi: { bozza_posta: 'auto', nota: 'auto', file: 'auto', invio: 'chiedi', contatto_nuovo: 'chiedi', calendario: 'chiedi', ...MAI_SOLDI },
    fa: { it: ['preparo il lavoro nelle tue bozze e in file'], en: ['prepare the work in your Drafts and in files'] },
    chiede: { it: ['prima di mandare o pubblicare'], en: ['before sending or posting'] }
  }
]

export const lato = (id: string | null | undefined): DefLato | null => LATI.find(l => l.id === id) ?? null

// — i nomi comuni —

/** Il tema della domanda in `domande`: unico, e così non si chiede due volte. */
export const TEMA = 'lato:'
export const TEMA_PRIMO = 'lato:primo'
export const suaDomanda = (tema: string | null | undefined): boolean => !!tema && tema.startsWith(TEMA)
/** L'id del messaggio di Myynd nella chat 'myynd' che porta la domanda: la UI ci mette sotto le due risposte. */
export const idMessaggio = (domanda: string | number) => `lato-${domanda}`
/** L'origine delle carte che il lato fa nascere di notte. */
export const ORIGINE = 'lato'
export const suo = (origine: string | null | undefined): boolean => origine === ORIGINE

// — lo stato, su disco, per persona —

export type StatoLato = {
  /** Il lato notato e chiesto: la domanda, quando, e i punti che l'hanno fatto vincere. */
  notato?: { id: LatoId; quando: string; domanda: string; punti: number }
  /** Il sì: il lato, l'esito scritto, il progetto nato, e le sue parole se ha scelto un altro lato. */
  scelto?: { id: LatoId; esito: string; progetto: string; quando: string; parole?: string }
  /** Ha detto no, o l'ha lasciata cadere: la data. Non si chiede più. */
  rifiutato?: string
  /** L'ultimo tentativo di notare (riuscito o no): una volta al giorno. */
  tentato?: string
  /**
   * La notte di lavoro in corso: quali documenti il modello ha già visto, quanti
   * lavori del lato sono già stati proposti e quante volte è stato chiesto.
   * «The night model is re-asked every 15 min about the same threads»: così
   * la stessa notte non si rilegge due volte e il tetto di tre vale per notte,
   * non per giro. Aggiunto in fondo: i `lato.json` vecchi non lo hanno.
   */
  notte?: { chiave: string; docs: string[]; proposti: number; chiamate: number }
}

const file = () => join(cfg.cartella(), 'lato.json')

export function leggi(): StatoLato {
  try {
    if (!existsSync(file())) return {}
    const s = JSON.parse(readFileSync(file(), 'utf8'))
    return s && typeof s === 'object' ? s as StatoLato : {}
  } catch { return {} }
}

function scrivi(s: StatoLato) {
  mkdirSync(cfg.cartella(), { recursive: true })
  writeFileSync(file() + '.tmp', JSON.stringify(s), { mode: 0o600 })
  renameSync(file() + '.tmp', file())
}

export function aggiorna(f: (s: StatoLato) => void): StatoLato { const s = leggi(); f(s); scrivi(s); return s }

// — chi scrive, e quando una mail parla di un lato —

/** Chi non legge le risposte: rispondere a un noreply è lavoro buttato. */
export const AUTOMATICO = /^(?:no[-.]?reply|do[-.]?not[-.]?reply|notifications?|notify|mailer-daemon|postmaster|bounce[s]?|billing|receipts?|alerts?|news(?:letter)?)\b/i
/**
 * Un dominio di programma: un pezzo del dominio che è un allarme o una
 * notifica. «chase@fraudalert.chase.com» ha un nome di persona davanti, e il
 * 20 ottobre Myynd gli aveva preparato una risposta.
 */
const DOMINIO_AUTOMATICO = /^(?:alerts?|fraud-?alerts?|notifications?|notify|no-?reply|bounces?|mailer)$/i
/** L'indirizzo dentro un «Nome <indirizzo>», in minuscolo, o null. */
export const indirizzoDi = (autore: string | null | undefined): string | null =>
  (autore?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '').toLowerCase() || null
/** Una mail di un programma: noreply, notifiche, rimbalzi. */
export const automatica = (autore: string | null | undefined): boolean => {
  const a = indirizzoDi(autore)
  if (!a) return false
  const [locale, dominio = ''] = a.split('@')
  return AUTOMATICO.test(locale) || dominio.split('.').slice(0, -2).some(p => DOMINIO_AUTOMATICO.test(p))
}

/**
 * Una mail parla di un lato se lo dicono l'oggetto o il mittente, oppure se il
 * corpo (le prime 800 lettere) ha almeno due parole diverse del lato: una
 * parola sola in fondo a una newsletter non fa un investitore.
 */
export function combacia(re: RegExp, d: { titolo?: string | null; autore?: string | null; corpo?: string | null }): boolean {
  if (re.test(`${d.titolo ?? ''} ${d.autore ?? ''}`)) return true
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  const viste = new Set<string>()
  for (const m of (d.corpo ?? '').slice(0, 800).matchAll(g)) {
    viste.add(m[0].toLowerCase())
    if (viste.size >= 2) return true
  }
  return false
}

/** Il lato scelto, se c'è. */
export function scelto(): (NonNullable<StatoLato['scelto']> & { def: DefLato }) | null {
  const s = leggi().scelto
  const def = s ? lato(s.id) : null
  return s && def ? { ...s, def } : null
}
