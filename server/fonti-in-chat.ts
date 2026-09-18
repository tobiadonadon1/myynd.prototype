// Le fonti, chieste in chat.
//
// «When I say "my sources", it doesn't really take it. It doesn't really
// work on it.» Diceva «leggi le mie fonti» e la domanda finiva nella ricerca
// per parole: il modello cercava «fonti» nell'indice, non trovava niente, e
// rispondeva che non aveva trovato niente. Le fonti non stanno nell'indice:
// sono la cosa che lo riempie, e chi le chiede vuole sapere cosa c'è
// collegato, quanto ha letto, cosa non si è aperto, e se può rileggerle
// adesso.
//
// Niente modello: è una lettura di stato, e uno stato si dice con quello che
// si sa. Il riconoscimento è stretto apposta. «Le mie fonti» è il soggetto
// della frase, non una parola dentro un'altra domanda: «cosa dice la fonte
// su Rossi» è una domanda sul materiale, e va al modello con `cerca` in mano.
//
// Niente stato di modulo: i conteggi e le fonti incomplete sono già per
// conto, e il resto è una funzione pura sul testo.

import { leggi as configurazione, lingua as linguaApp, type Config } from './config.ts'
import db, { conteggi } from './store.ts'
import { fontiIncomplete, type FonteIncompleta } from './lettura-feed.ts'
import * as chi from './chi.ts'
import { giornoIn, oraIn } from './fuso.ts'
import { senzaTrattini } from './testo.ts'

export type Lettura = 'avviata' | 'in-corso'

/** Cosa chiede: lo stato, oppure lo stato e una rilettura. */
export type Richiesta = { rileggi: boolean }

/*
 * Le forme in cui lo dice, nelle due lingue dell'app. Ognuna è ancorata in
 * testa (dopo un «please», un «puoi», un «myynd») e quasi tutte in coda: una
 * frase che continua dopo «le fonti» sta chiedendo un'altra cosa.
 */
const APERTURA = String.raw`^\W*(?:(?:please|hey|hi|ok|okay|so|myynd|allora|ehi|ciao|per favore|dai)[,!. ]+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|(?:puoi|potresti|riesci a|mi)\s+)?`
const FONTI = String.raw`(?:(?:all\s+)?(?:my|the|your|our)\s+(?:connected\s+|linked\s+)?(?:data\s+)?sources?|(?:tutte\s+)?le\s+(?:mie\s+|tue\s+|nostre\s+)?fonti(?:\s+collegate)?)`
const CODA = String.raw`(?:\s+(?:again|now|please|first|all|adesso|ora|di nuovo|per favore|tutte|prima))*(?:\s*(?:,|and|e|then|poi)\s*(?:tell me|dimmi|let me know|fammi sapere)\s+(?:what's|what is|whats|what|if|cosa|se|che)\s+(?:new|there|there's|changed|arrived|c'è|c’è|di nuovo|è arrivato|e arrivato)[^.?!]{0,20})?[?.!\s]*$`

/** I verbi che chiedono di rileggere: la risposta dice lo stato, e la lettura parte. */
const RILEGGI = new RegExp(APERTURA + String.raw`(?:re-?read|read|refresh|re-?sync|sync|synchroni[sz]e|update|reload|re-?scan|scan|go through|check on|check|(?:ri)?leggi|(?:ri)?leggere|aggiorna|aggiornare|sincronizza|sincronizzare|ricarica|ricaricare|controlla|controllare|riguarda|riguardare)\s+(?:again\s+|all\s+)?` + FONTI + CODA, 'i')

const STATO: RegExp[] = [
  // «my sources», «le mie fonti»
  new RegExp(APERTURA + FONTI + String.raw`[?.!\s]*$`, 'i'),
  // «show me my sources», «elenca le fonti»
  new RegExp(APERTURA + String.raw`(?:look at|show|show me|list|tell me|mostra|mostrami|mostrare|elenca|elencare|dimmi|dire|guarda|guardare)\s+(?:all\s+)?` + FONTI + CODA, 'i'),
  // «what sources», «which sources are connected», «quali fonti hai»
  new RegExp(APERTURA + String.raw`(?:what|which|quali|che|quale)\s+(?:sources?|fonti|fonte)\s*(?:(?:are|is)\s+(?:connected|linked|available|there|indexed|in)|do you have|have you(?:\s+(?:got|connected|read|linked))?|can you (?:read|see|access)|(?:sono|hai|ci sono|leggi|usi)(?:\s+collegat[oei])?)?[?.!\s]*$`, 'i'),
  // «what is connected», «cosa hai collegato»
  new RegExp(APERTURA + String.raw`(?:what|which|what's|whats)\s+(?:is|are|do you have)?\s*(?:connected|linked|hooked up)\b[?.!\s]*$`, 'i'),
  new RegExp(APERTURA + String.raw`(?:cosa|che cosa|che)\s+(?:c'è|c’è|hai|è|e|risulta|abbiamo)\s+(?:di\s+)?collegat[oaei]\b[?.!\s]*$`, 'i'),
  // «how many documents», «quante fonti hai»
  new RegExp(APERTURA + String.raw`(?:how many|quant[ei])\s+(?:documents?|docs|documenti|sources?|fonti|files?|emails?|mails?)\s*(?:do you have|have you (?:read|indexed|got|seen)|are (?:there|indexed|in (?:the|your) (?:index|memory|mind))|did you (?:read|index)|hai(?:\s+(?:letto|indicizzato|in memoria|dentro))?|ci sono|leggi|conosci)?\s*(?:now|so far|in total|already|adesso|ora|finora|in tutto)?[?.!\s]*$`, 'i'),
  // «status of my sources», «stato delle fonti», «how are my sources»
  new RegExp(APERTURA + String.raw`(?:(?:what's|what is|whats)\s+)?(?:the\s+)?(?:status|state)\s+of\s+` + FONTI + String.raw`[?.!\s]*$`, 'i'),
  new RegExp(APERTURA + String.raw`(?:qual è|qual e|com'è|com’è|come sta|come stanno|come va|come vanno)?\s*(?:lo\s+|la\s+)?(?:stato|situazione)\s+delle\s+(?:mie\s+|tue\s+)?fonti\b[?.!\s]*$`, 'i'),
  new RegExp(APERTURA + FONTI + String.raw`\s+(?:status|state)\b[?.!\s]*$`, 'i'),
  new RegExp(APERTURA + String.raw`(?:how are|how is|come stanno|come vanno)\s+` + FONTI + String.raw`[?.!\s]*$`, 'i'),
  // «what have you read», «cosa hai letto»
  new RegExp(APERTURA + String.raw`(?:what|which)\s+(?:have|did|do)\s+you\s+(?:read|index|ingest)(?:\s+(?:so far|already|until now))?[?.!\s]*$`, 'i'),
  new RegExp(APERTURA + String.raw`(?:cosa|che cosa|che)\s+hai\s+(?:letto|indicizzato)(?:\s+(?:finora|fin qui|già))?[?.!\s]*$`, 'i')
]

/**
 * Le parole che dicono che la domanda è sul contenuto, non sulle fonti:
 * «cosa dice la fonte», «quali fonti parlano di Rossi». Con una di queste
 * dentro non si intercetta niente, qualunque forma abbia il resto.
 */
const SUL_CONTENUTO = /\b(?:say|says|said|saying|mention|mentions|mentioned|according|contain|contains|search|find|look for|dice|dicono|detto|parla|parlano|contiene|contengono|menziona|menzionano|cerca|trova|scritto)\b|\b(?:about|regarding|concerning|riguardo a|a proposito di)\s+(?!(?:all\s+)?(?:my|the|your|our|le|mie|tue|nostre)\b|sources?\b|fonti\b)/i

/** Una richiesta sulle fonti, o niente: è il soggetto della frase, o non conta. */
export function richiestaSulleFonti(messaggio: string): Richiesta | null {
  const m = messaggio.trim()
  if (!m || m.length > 160 || SUL_CONTENUTO.test(m)) return null
  if (RILEGGI.test(m)) return { rileggi: true }
  return STATO.some(r => r.test(m)) ? { rileggi: false } : null
}

// — lo stato —

export type StatoFonti = {
  /** Collegate, o con documenti nell'indice: per documenti, le più piene prima. */
  fonti: { fonte: string; documenti: number }[]
  incomplete: FonteIncompleta[]
  /** Quando è entrata l'ultima cosa nell'indice, ISO; null se è vuoto. */
  ultimoArrivo: string | null
}

/** Le chiavi della configurazione che sono una fonte collegata. */
const COLLEGABILI: (keyof Config)[] = ['posta', 'desktop', 'notion', 'github', 'granola', 'note', 'conversazioni', 'x', 'calendario', 'slack', 'google', 'microsoft', 'drive', 'dropbox', 'whatsapp']

export function statoFonti(c: Config = configurazione()): StatoFonti {
  const n = conteggi()
  const documenti = new Map(n.perFonte.map(f => [f.fonte, f.n]))
  const nomi = new Set<string>([...COLLEGABILI.filter(k => !!c[k]) as string[], ...n.perFonte.filter(f => f.n > 0).map(f => f.fonte)])
  const fonti = [...nomi].map(fonte => ({ fonte, documenti: documenti.get(fonte) ?? 0 })).sort((a, b) => b.documenti - a.documenti || a.fonte.localeCompare(b.fonte))
  const ultimo = db.prepare('SELECT MAX(indicizzato) AS m FROM documenti').get() as { m: string | null } | undefined
  return { fonti, incomplete: fontiIncomplete(chi.adesso() ?? ''), ultimoArrivo: ultimo?.m ?? null }
}

// — dirlo —

/** Il nome piano di una fonte, come lo direbbe una persona: «Il mio Mac» è «i file sul Mac». */
export function nomeFonte(fonte: string, lingua: 'it' | 'en', piattaforma = process.platform): string {
  const pc = piattaforma === 'darwin' ? 'Mac' : 'PC'
  const it: Record<string, string> = {
    posta: 'Posta', desktop: `file sul ${pc}`, lavoro: 'cartelle di lavoro', note: 'Note', conversazioni: 'chat con i modelli', x: 'X',
    calendario: 'agenda', notion: 'Notion', github: 'GitHub', slack: 'Slack', granola: 'Granola', google: 'Gmail', microsoft: 'Outlook',
    drive: 'Google Drive', dropbox: 'Dropbox', whatsapp: 'WhatsApp', sharepoint: 'SharePoint'
  }
  const en: Record<string, string> = {
    ...it, posta: 'Mail', desktop: `files on the ${pc}`, lavoro: 'work folders', note: 'Notes', conversazioni: 'chats with the models', calendario: 'calendar'
  }
  return (lingua === 'en' ? en : it)[fonte] ?? fonte
}

/**
 * Lo stato, in piano e nella lingua dell'app.
 *
 * Quattro righe al massimo: cosa è collegato con quanti documenti, cosa non
 * si è letto per intero e perché, quando è arrivata l'ultima cosa, e se la
 * lettura è partita. Pura: la data di adesso si passa, così si prova.
 */
export function raccontaFonti(s: StatoFonti, lingua: 'it' | 'en', lettura: Lettura | 'non-posso' | null, adesso = new Date(), piattaforma = process.platform): string {
  const en = lingua === 'en'
  const nome = (f: string) => nomeFonte(f, lingua, piattaforma)
  const numero = (n: number) => n.toLocaleString(en ? 'en-GB' : 'it-IT')
  const righe: string[] = []
  if (!s.fonti.length) {
    righe.push(en
      ? 'No sources connected yet: go to Sources to connect your mail, your computer or your notes.'
      : 'Nessuna fonte collegata: vai alle Fonti per collegare la posta, il computer o le note.')
  } else {
    const voci = s.fonti.map(f => `${nome(f.fonte)} (${f.documenti ? numero(f.documenti) : en ? 'nothing yet' : 'ancora niente'})`)
    righe.push(`${en ? 'Connected sources, with how many documents each' : 'Fonti collegate, con quanti documenti ciascuna'}: ${voci.join(', ')}.`)
  }
  if (s.incomplete.length) {
    const motivo = (m: FonteIncompleta['motivo']) => m === 'non-disponibile' ? (en ? 'could not be opened' : 'non si è aperta') : (en ? 'only partly read' : 'letta solo in parte')
    const voci = s.incomplete.map(f => `${nome(f.fonte)} (${motivo(f.motivo)})`)
    righe.push(en
      ? `Not fully read last time: ${voci.join(', ')}. Go to Sources to fix it.`
      : `Non lette per intero l'ultima volta: ${voci.join(', ')}. Vai alle Fonti per sistemarle.`)
  }
  if (s.ultimoArrivo && Number.isFinite(Date.parse(s.ultimoArrivo))) {
    const [giorno, ora] = oraIn(s.ultimoArrivo).split(' ')
    const oggi = giorno === giornoIn(adesso)
    righe.push(en
      ? `Last thing indexed: ${oggi ? 'today' : `on ${giorno}`} at ${ora}.`
      : `Ultimo arrivo nell'indice: ${oggi ? 'oggi' : `il ${giorno}`} alle ${ora}.`)
  }
  if (lettura === 'avviata') righe.push(en ? 'Reading them now; what arrives shows up on your first page.' : 'Le leggo adesso; quello che arriva compare sulla tua prima pagina.')
  else if (lettura === 'in-corso') righe.push(en ? 'A read is already running; what arrives shows up on your first page.' : 'Una lettura è già in corso; quello che arriva compare sulla tua prima pagina.')
  else if (lettura === 'non-posso') righe.push(en ? 'I cannot start a read from here: use the Sources page.' : 'Da qui non posso avviare una lettura: usa la pagina delle Fonti.')
  return senzaTrattini(righe.join('\n'))
}

/**
 * La risposta pronta, o null se il messaggio non è sulle fonti.
 *
 * `rileggi` è la rilettura di sfondo messa in mano da chi ha la rotta, la
 * stessa delle sei ore: si chiama solo se lo chiede e se c'è qualcosa da
 * leggere, e torna se è partita o se ce n'era già una in corso.
 */
export function rispostaSulleFonti(messaggio: string, rileggi?: () => Lettura): string | null {
  const r = richiestaSulleFonti(messaggio)
  if (!r) return null
  const stato = statoFonti()
  let lettura: Lettura | 'non-posso' | null = null
  if (r.rileggi && stato.fonti.length) lettura = rileggi ? rileggi() : 'non-posso'
  return raccontaFonti(stato, linguaApp(), lettura)
}
