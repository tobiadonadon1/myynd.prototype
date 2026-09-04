// WhatsApp Business: i messaggi che arrivano, mentre arrivano.
//
// **Questo connettore funziona in modo diverso da tutti gli altri, e la
// differenza non è una scelta: è come è fatta l'API di Meta.** Tutti gli altri
// si collegano e poi *vanno a leggere* — la casella, la cartella, le pagine.
// Qui non si può: la Cloud API di WhatsApp non ha nessun modo di chiedere «cosa
// mi è arrivato negli ultimi trenta giorni». Non è un permesso che manca, non è
// un endpoint che non abbiamo trovato: quella chiamata non esiste. Meta i
// messaggi in arrivo li *spinge*, uno per uno, su un indirizzo che gli dai tu.
//
// Il che vuol dire due cose, e vanno dette in chiaro perché una persona che
// collega questa cosa deve saperle prima:
//
//   1. **La storia di prima non c'è.** Si comincia a vedere dal momento in cui
//      si collega, e non un minuto prima. Non è un limite di Myynd.
//   2. **Serve un indirizzo pubblico.** Myynd gira su questo computer, e Meta
//      deve poterci bussare da fuori. Senza un tunnel — o un dominio che punta
//      qui — non arriverà mai niente, e non arriverà *in silenzio*: nessun
//      errore, solo una fonte che resta a zero per sempre. Per questo la
//      schermata lo scrive prima di far collegare, invece di lasciarlo
//      scoprire dopo una settimana.
//
// **Come si difende un indirizzo che deve stare aperto.** Il resto dell'app è
// chiuso dietro un controllo sull'Host: solo 127.0.0.1 entra. Questo indirizzo
// non può esserlo — Meta bussa da fuori, con il suo nome di dominio — quindi
// la sua difesa dev'essere un'altra, e più forte: **ogni messaggio porta una
// firma HMAC** del proprio corpo, fatta con il segreto dell'app. Chi non ha
// quel segreto non può fabbricarne una. Senza segreto configurato, questo
// indirizzo non accetta niente da nessuno — non «accetta tutto per comodità»,
// che è il modo in cui una porta di servizio diventa una porta.
//
// **Si legge, non si scrive.** La Cloud API saprebbe anche mandare messaggi.
// Da qui non si può, e non perché ci si sia dimenticati: un'automazione che
// scrive a un cliente su WhatsApp alle sette di mattina è esattamente la cosa
// che questo prodotto ha promesso di non essere.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { leggi, scrivi as scriviConfig } from '../config.ts'
import * as store from '../store.ts'
import * as chi from '../chi.ts'
import { riflua } from '../testo.ts'

export type ConfigWhatsapp = {
  /** Il token del System User, quello che non scade. */
  token: string
  /** L'id del numero, non il numero. */
  numero: string
  /** Il segreto dell'app: è quello che firma i messaggi in arrivo. */
  segreto: string
  /** La parola che Meta rimanda quando verifica l'indirizzo. */
  parola: string
  /** Come si legge il numero, per le schermate. */
  etichetta?: string
  /** Quanti messaggi sono arrivati da quando è collegato. */
  arrivati?: number
}

const GRAFO = 'https://graph.facebook.com/v21.0'

export function collegato(): boolean {
  const w = leggi().whatsapp
  return !!(w?.token && w?.numero)
}

export async function prova(c: ConfigWhatsapp): Promise<
  { ok: true; etichetta: string } | { ok: false; errore: string }
> {
  if (!c.token.trim()) return { ok: false, errore: 'Serve il token di WhatsApp Business.' }
  if (!c.numero.trim()) return { ok: false, errore: 'Serve l’ID del numero di telefono.' }
  if (!c.segreto.trim()) {
    // non è un campo facoltativo travestito da obbligatorio: senza segreto
    // l'indirizzo pubblico non saprebbe distinguere Meta da chiunque altro
    return { ok: false, errore: 'Serve il segreto dell’app: è quello che firma i messaggi in arrivo.' }
  }
  try {
    const r = await fetch(`${GRAFO}/${encodeURIComponent(c.numero.trim())}?fields=display_phone_number,verified_name`, {
      headers: { authorization: `Bearer ${c.token.trim()}` },
      signal: AbortSignal.timeout(20_000)
    })
    const j = await r.json().catch(() => ({})) as {
      display_phone_number?: string; verified_name?: string
      error?: { message?: string; code?: number }
    }
    if (!r.ok) {
      if (j.error?.code === 190) return { ok: false, errore: 'Il token di WhatsApp non è valido o è scaduto.' }
      if (r.status === 404) return { ok: false, errore: 'Quell’ID del numero non esiste su questo account.' }
      return { ok: false, errore: 'Meta ha rifiutato il collegamento.' }
    }
    const etichetta = [j.verified_name, j.display_phone_number].filter(Boolean).join(' · ')
    return { ok: true, etichetta }
  } catch {
    return { ok: false, errore: 'Meta non ha risposto.' }
  }
}

export function scollega() {
  const { whatsapp: _via, ...resto } = leggi()
  scriviConfig(resto)
}

// — l'indirizzo che Meta chiama —

/**
 * La stretta di mano iniziale.
 *
 * Meta chiama una volta con una parola d'ordine e un numero a caso, e vuole
 * indietro quel numero e nient'altro — nessun JSON, nessuna virgoletta. È
 * l'unico momento in cui non c'è una firma da controllare, e la difesa è la
 * parola: la sceglie chi collega, e sta solo qui e su Meta.
 */
export function verifica(q: Record<string, unknown>): { ok: true; sfida: string } | { ok: false } {
  const w = leggi().whatsapp
  if (!w?.parola) return { ok: false }
  if (String(q['hub.mode'] ?? '') !== 'subscribe') return { ok: false }
  const detta = String(q['hub.verify_token'] ?? '')
  const attesa = w.parola
  // stessa lunghezza prima del confronto: `timingSafeEqual` esplode se
  // differiscono, e sarebbe un modo di raccontare la lunghezza del segreto
  if (detta.length !== attesa.length) return { ok: false }
  if (!timingSafeEqual(Buffer.from(detta), Buffer.from(attesa))) return { ok: false }
  return { ok: true, sfida: String(q['hub.challenge'] ?? '') }
}

/**
 * La firma del corpo, che è tutta la sicurezza di questo indirizzo.
 *
 * Va calcolata sui **byte esatti** che sono arrivati, non su un oggetto
 * riserializzato: `JSON.stringify(JSON.parse(x))` non torna `x` — cambia
 * l'ordine di niente ma cambia gli spazi, e la firma non torna più. È il
 * classico modo in cui questo controllo finisce disattivato «perché non
 * funzionava».
 */
export function firmaBuona(corpo: Buffer, firma: string | undefined): boolean {
  const w = leggi().whatsapp
  if (!w?.segreto) return false
  if (!firma?.startsWith('sha256=')) return false
  const mia = 'sha256=' + createHmac('sha256', w.segreto).update(corpo).digest('hex')
  if (mia.length !== firma.length) return false
  return timingSafeEqual(Buffer.from(mia), Buffer.from(firma))
}

// — quello che arriva —

type Messaggio = {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: { list_reply?: { title?: string }; button_reply?: { title?: string } }
  image?: { caption?: string }
  document?: { caption?: string; filename?: string }
}

type Cambio = {
  value?: {
    metadata?: { display_phone_number?: string }
    contacts?: { wa_id?: string; profile?: { name?: string } }[]
    messages?: Messaggio[]
  }
}

/** Il testo di un messaggio, qualunque forma abbia. */
function testoDi(m: Messaggio): string {
  if (m.text?.body) return m.text.body
  if (m.button?.text) return m.button.text
  if (m.interactive?.button_reply?.title) return m.interactive.button_reply.title
  if (m.interactive?.list_reply?.title) return m.interactive.list_reply.title
  if (m.image?.caption) return `[foto] ${m.image.caption}`
  if (m.type === 'image') return '[foto]'
  if (m.document?.filename) return `[documento] ${m.document.filename}${m.document.caption ? ` — ${m.document.caption}` : ''}`
  if (m.type === 'audio') return '[messaggio vocale]'
  if (m.type === 'location') return '[posizione]'
  return ''
}

function giornoDi(ts: string): { chiave: string; data: Date } {
  const data = new Date((Number(ts) || Date.now() / 1000) * 1000)
  const due = (n: number) => String(n).padStart(2, '0')
  return { chiave: `${data.getFullYear()}-${due(data.getMonth() + 1)}-${due(data.getDate())}`, data }
}

/**
 * Mette in fondo a una giornata di conversazione, o ne comincia una.
 *
 * Un documento per contatto per giorno, come per Slack e per la stessa
 * ragione: «ok» e «grazie» indicizzati uno per uno non sono documenti, sono
 * rumore che si prende il posto delle cose vere nella ricerca. Il giorno però
 * qui si costruisce **un messaggio alla volta**, perché arrivano così: si
 * rilegge quello che c'è e ci si scrive sotto.
 */
/**
 * Gli id già scritti, per persona.
 *
 * Meta ripete un messaggio finché non riceve un 200 — e a volte anche dopo
 * averlo ricevuto, se la risposta è arrivata tardi. Lo stesso id arrivava due
 * volte e finiva due volte in fondo alla stessa giornata. Per persona, come
 * ogni stato di questo server: una Map per utente, non una variabile di
 * modulo. Con un tetto, perché un elenco che cresce per sempre è una perdita
 * di memoria travestita da cautela: il Set tiene l'ordine d'arrivo, e si
 * butta il più vecchio.
 */
const VISTI_MAX = 2000
const vistiPerPersona = new Map<string, Set<string>>()
function visti(): Set<string> {
  const u = chi.adesso() ?? ''
  let s = vistiPerPersona.get(u)
  if (!s) { s = new Set(); vistiPerPersona.set(u, s) }
  return s
}
function segnaVisto(id: string) {
  const s = visti()
  s.add(id)
  if (s.size > VISTI_MAX) {
    const primo = s.values().next().value
    if (primo !== undefined) s.delete(primo)
  }
}

export function incassa(corpo: unknown): number {
  const b = corpo as { entry?: { changes?: Cambio[] }[] }
  let quanti = 0

  for (const e of b?.entry ?? []) {
    for (const c of e.changes ?? []) {
      const messaggi = c.value?.messages ?? []
      if (!messaggi.length) continue
      // il nome del contatto arriva accanto ai messaggi, e senza resterebbe un
      // numero di telefono — cioè una cosa che non si ritrova cercando
      const chi = new Map<string, string>()
      for (const x of c.value?.contacts ?? []) if (x.wa_id) chi.set(x.wa_id, x.profile?.name ?? x.wa_id)

      for (const m of messaggi) {
        if (m.id && visti().has(m.id)) continue
        const testo = testoDi(m).trim()
        if (!testo || !m.from) continue
        const nome = chi.get(m.from) ?? m.from
        const { chiave, data } = giornoDi(m.timestamp ?? '')
        const id = `whatsapp:${m.from}:${chiave}`

        const gia = store.documento(id)
        const riga = `${data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} ${nome}: ${testo}`
        const corpoNuovo = gia?.corpo ? `${gia.corpo}\n${riga}` : riga

        store.salvaDocumenti([{
          id,
          fonte: 'whatsapp',
          tipo: 'messaggi',
          titolo: `${nome} · ${data.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`,
          corpo: riflua(corpoNuovo).slice(0, 20_000),
          autore: nome,
          percorso: c.value?.metadata?.display_phone_number ?? null,
          // l'ultimo messaggio della giornata: è quando quella conversazione
          // si è mossa l'ultima volta, ed è per data che si ordina
          quando: data.toISOString(),
          gruppo: 'conversazioni'
        }])
        if (m.id) segnaVisto(m.id)
        quanti++
      }
    }
  }

  if (quanti) {
    const w = leggi().whatsapp
    if (w) scriviConfig({ ...leggi(), whatsapp: { ...w, arrivati: (w.arrivati ?? 0) + quanti } })
  }
  return quanti
}

/**
 * Non c'è niente da rileggere, e dirlo è più utile che fingere.
 *
 * Il giro delle letture chiama `sincronizza` su ogni fonte collegata. Qui non
 * c'è nessun posto da cui rileggere — quello che è arrivato è già dentro,
 * scritto mentre arrivava — e questa funzione esiste per rendere quella verità
 * esplicita a chi legge il codice, invece di lasciare un buco nell'elenco che
 * sembra una dimenticanza.
 */
export function nienteDaRileggere(): { docs: never[]; sempreVivo: true } {
  return { docs: [], sempreVivo: true }
}
