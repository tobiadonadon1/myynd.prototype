// Mandare: l'ultimo gesto, e quello che ci sta attorno.
//
// La regola del brief non si tratta: Myynd prepara, una persona preme. Prima
// il «prepara» stava dopo il bottone — premevi «Mandala per email…», aspettavi
// il modello, rileggevi tre campi, premevi ancora. Due attese per un gesto che
// nella testa è uno solo. Adesso l'email si smonta quando la bozza diventa
// pronta, e sulla riga resta scritta: quando arrivi tu, c'è già.
//
// Questo file tiene le tre cose che stanno attorno alla spedizione e che non
// sono la spedizione:
//
//   · capire se una bozza *è* un messaggio, prima di pagare un modello per
//     smontarla — un riassunto o un elenco non hanno un destinatario;
//   · mettere insieme quello che parte da quello che c'è sulla riga e da
//     quello che la persona ha corretto, con la persona che vince sempre;
//   · chiudere la riga quando la posta dice che è partita, e scriverlo nel
//     registro anche quando non parte.
//
// Nessuna strada di qui parte da sola: `manda` la chiama una rotta che la
// chiama un bottone.

import * as store from './store.ts'
import * as posta from './connettori/posta.ts'
import type { ConfigPosta } from './config.ts'

const INDIRIZZO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/*
 * I segni di un messaggio, nella riga o nella bozza.
 *
 * Non serve che sia perfetto: sbagliare in un verso costa una chiamata a un
 * modello piccolo, nell'altro costa una email che si prepara in due passi
 * invece di uno. Serve che sia largo sulle parole con cui una persona si
 * scrive un promemoria — «scrivere a», «rispondere», «mandare» — e sulla forma
 * che ha una email quando è scritta: un saluto in testa, una firma in coda.
 */
const VERBI = /\b(mail|e-?mail|scriv\w*|rispond\w*|mand\w*|invi\w*|inoltr\w*|messagg\w*|write|writ\w*|reply|repl\w*|send|sending|answer\w*|message|forward)\b/i
const SALUTO = /^\s*(oggetto\s*:|subject\s*:|gentil\w*|buongiorno|buonasera|salve|ciao|car[oa]\b|egregi\w*|spett\.?\w*|dear\b|hi\b|hello\b)/im
const FIRMA = /(cordiali saluti|distinti saluti|un saluto|a presto|buona giornata|best regards|kind regards|regards,|thanks,|cheers,)/i

/** Se vale la pena chiedere a un modello di ricavarne un'email. */
export function sembraUnMessaggio(testo: string, bozza: string, ids: (string | null | undefined)[] = []): boolean {
  if (ids.some(id => !!id && id.startsWith('posta:'))) return true
  if (VERBI.test(testo)) return true
  return SALUTO.test(bozza) || FIRMA.test(bozza)
}

/**
 * Quello che parte: la persona vince, la riga riempie.
 *
 * Il corpo della richiesta può essere vuoto — è il gesto solo: si manda quello
 * che era già pronto sulla riga. Se invece porta un campo, è perché qualcuno
 * l'ha corretto, e allora vale quello. Il filo si tiene solo se il
 * destinatario è rimasto chi aveva scritto: cambiato lui, la risposta non è
 * più una risposta, e un `In-Reply-To` verso un messaggio che quella persona
 * non ha mai ricevuto la farebbe comparire dentro una conversazione altrui.
 */
export function daMandare(
  c: store.Compito,
  corpoRichiesta: unknown
): { ok: true; m: posta.DaMandare } | { ok: false; errore: string } {
  const b = (corpoRichiesta && typeof corpoRichiesta === 'object' ? corpoRichiesta : {}) as Record<string, unknown>
  const dato = (k: string) => (b[k] === undefined || b[k] === null ? undefined : String(b[k]).trim())
  const a = dato('a') ?? c.email?.a ?? ''
  const oggetto = dato('oggetto') ?? c.email?.oggetto ?? ''
  const corpo = dato('corpo') ?? c.email?.corpo ?? ''
  if (!INDIRIZZO.test(a)) return { ok: false, errore: 'Manca un indirizzo valido.' }
  if (!corpo) return { ok: false, errore: 'Il messaggio è vuoto.' }
  const stessoDestinatario = a.toLowerCase() === (c.email?.a ?? '').trim().toLowerCase()
  const rispondeA = stessoDestinatario ? (c.email?.rispondeA ?? null) : null
  return { ok: true, m: { a, oggetto, corpo, rispondeA } }
}

/** La spedizione vera, sostituibile solo nelle prove: una prova che manda non è una prova. */
let inviaVera: typeof posta.invia = (...a) => posta.invia(...a)

export const perProva = {
  invia(f: typeof posta.invia | null) { inviaVera = f ?? ((...a) => posta.invia(...a)) }
}

/**
 * Manda, e chiude la riga con le parole giuste.
 *
 * Lancia se la posta non parte, dopo averlo scritto nel registro: il giorno
 * che una mail non parte è proprio quello in cui vuoi trovarne traccia. Se
 * parte, la riga si chiude — mandata vuol dire fatta — e quello che hai
 * tenuto davvero prende il posto della bozza, così la memoria impara da lì.
 */
export async function manda(c: store.Compito, conf: ConfigPosta, m: posta.DaMandare): Promise<void> {
  try {
    await inviaVera(conf, m)
  } catch (e) {
    store.registraAzione({
      tipo: 'email', verso: m.a, cosa: m.oggetto || c.testo, compito: c.id,
      esito: 'fallita', dettaglio: e instanceof Error ? e.message : String(e)
    })
    throw e
  }
  store.registraAzione({ tipo: 'email', verso: m.a, cosa: m.oggetto || c.testo, compito: c.id, esito: 'fatta' })
  store.tieniLaTua(c.id, m.corpo)
  store.cambiaStatoCompito(c.id, 'fatto', `Mandata a ${m.a}.`)
}
