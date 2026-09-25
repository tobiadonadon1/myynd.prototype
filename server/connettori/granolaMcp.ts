// Granola, con il tuo account: le riunioni dal suo server MCP ufficiale.
//
// **Perché questa strada, e non più la cache.** Da maggio 2026 Granola cifra
// quello che tiene sul Mac e da luglio la chiave sta in un portachiavi che
// solo il suo codice firmato apre (vedi `granola.ts`): su un Granola di oggi
// il file da leggere non c'è più. Granola però ha aperto una porta ufficiale,
// `https://mcp.granola.ai/mcp`, su tutti i piani, con l'accesso via browser e
// senza niente da registrare a mano
// (docs.granola.ai/help-center/sharing/integrations/mcp). È la stessa porta
// da cui passano Claude e ChatGPT, ed è l'unica che Granola ha promesso di
// tenere.
//
// **Cosa si è visto davvero, e cosa no** (23 settembre 2026, senza account):
// i metadati pubblici — la risorsa `https://mcp.granola.ai/mcp`, l'ambito
// `mcp`, il server d'autorizzazione `https://mcp-auth.granola.ai` (WorkOS
// AuthKit) con registrazione dinamica, PKCE S256 e `offline_access` — e il
// 401 con `resource_metadata`. Sono in `review/connessioni/granola-mcp-
// discovery.txt`. Le risposte degli strumenti invece no: servono un account.
// La loro forma viene dallo schema ufficiale ripubblicato da chi lo usa
// (github.com/maton-ai/api-gateway-skill, references/granola-mcp): `content[0]`
// è un testo con dentro un XML leggero —
//
//   <meetings_data from=".." to=".." count="2">
//   <meeting id="uuid" title="Team sync" date="Feb 4, 2026 7:30 PM">
//     <known_participants>
//     John Doe (note creator) from Acme <john@acme.com>
//     </known_participants>
//     <summary>## Key Decisions …</summary>
//   </meeting>
//   </meetings_data>
//
// — e la specifica MCP permette anche `structuredContent`, o un JSON dentro il
// testo. Qui si leggono tutte e tre, e quando nessuna si riconosce il
// connettore lo dice invece di tornare zero riunioni: zero riunioni vuol dire
// «Granola è vuoto», e `riconcilia` butterebbe via l'indice.
//
// **Sola lettura.** Si chiamano `list_meetings`, `get_meetings` e
// `get_account_info`, nient'altro: Granola non ha strumenti che scrivono, e
// questo modulo non ne chiamerebbe comunque.

import { randomBytes } from 'node:crypto'
import * as chi from '../chi.ts'
import { leggi, lingua, scrivi as scriviConfig, type RegistrazioneMcp } from '../config.ts'
import type { Documento } from '../store.ts'
import { oauthWeb } from '../ospitato.ts'
import { avviaLocale, avviaWeb, chiediGettoni, Vivo, type Gettoni, type Sportello } from './oauth.ts'
import { ClienteMcp, ErroreMcp, registra, scopri, testoDi, type Registrazione, type Risultato, type Scoperta, type Strumento } from './mcp.ts'
import { ripulisci, testoLibero, type ConfigGranola, type EsitoGranola } from './granola.ts'
import { GuaioFonte, type Rimedio } from './guaio.ts'

/** Il server di Granola. Le prove ci mettono il loro, finto, con `MYYND_GRANOLA_MCP`. */
export const INDIRIZZO = 'https://mcp.granola.ai/mcp'
export function endpoint(): string {
  return (process.env.MYYND_GRANOLA_MCP ?? '').trim() || INDIRIZZO
}

/**
 * L'http su questo computer, solo per i server finti.
 *
 * Chi mette `MYYND_GRANOLA_MCP` sta provando: lì i metadati possono rimandare a
 * `http://127.0.0.1`. Senza, solo https: un metadato che rimandasse a una
 * porta di questa macchina darebbe il codice a chiunque ci stia in ascolto.
 */
const httpLocale = () => !!(process.env.MYYND_GRANOLA_MCP ?? '').trim()

const GIORNO = 86_400_000
/** Quanto si aspetta chi sta facendo l'accesso: Granola può chiedere un secondo accesso, a Google. */
const ATTESA = 5 * 60_000
/** Una finestra di `list_meetings`: lo strumento non ha pagine, ha date. */
const FINESTRA_GIORNI = 30
/** Quanto indietro si guarda. Oltre due anni, una riunione è archivio. */
const ORIZZONTE_GIORNI = 730
/** Tre mesi di fila senza riunioni: prima di lì Granola non c'era. */
const VUOTE_DI_FILA = 3
/** Le note chieste in un giro: il resto al giro dopo, dalle più nuove. */
const PER_GIRO = 300
/** Una nota di una riunione recente si rilegge: Granola la riscrive nei giorni dopo. */
const FRESCHE_GIORNI = 7
/** Una finestra che ne torna tante così potrebbe essere tagliata: si divide. */
const SOSPETTO = 100
const TETTO = 4000
const TESTO_MAX = 24_000
/**
 * Il tempo di tutta una lettura, non della singola richiesta.
 *
 * Granola si legge dentro lo stesso giro della posta e dell'agenda: un
 * Granola lento non deve tenere fermo tutto il resto. Allo scadere la lettura
 * si ferma dov'è, vale come «non finita» (niente si cancella), e riparte al
 * giro dopo. La prima, al collegamento, ha più tempo: è quella che si aspetta.
 */
const DURATA_GIRO = 90_000
const DURATA_PRIMA = 180_000
/** Una riunione chiesta e tornata senza testo non si richiede prima di così. */
const RIPROVA_VUOTE_GIORNI = 7
/** Una registrazione più vecchia di così si rifà: meglio una in più che una che Granola ha buttato. */
const REGISTRAZIONE_VALE = 30 * GIORNO

// — le frasi —

export const RETE = 'Non riesco a raggiungere Granola: controlla la connessione e riprova.'
export const SCADUTO = 'Il collegamento con Granola è scaduto: collegalo di nuovo.'
export const NIENTE_ACCESSO = 'Granola non mi lascia più leggere le riunioni: collegalo di nuovo.'
export const RALLENTA = 'Granola ha chiesto di rallentare: riprovo al prossimo giro.'
export const CAMBIATO = 'Granola ha cambiato il modo in cui si collega: questo collegamento va aggiornato.'
export const REGISTRAZIONE = 'Granola non ha accettato Myynd come app: riprova più tardi.'
export const NON_LEGGE = 'Granola non mi ha dato le riunioni: riprova più tardi.'
export const SENZA_DURATA = 'Granola non ha dato il permesso duraturo: riprova.'
export const GIU = 'Granola non risponde in questo momento: riprova più tardi.'
export const LENTO = 'Granola ci mette troppo a rispondere: riprovo al prossimo giro.'
export const GUASTO = 'Qualcosa non è andato leggendo Granola: riprova.'
export const NON_SALVATO = 'Non riesco a salvare il collegamento con Granola su questo computer: riprova.'

/**
 * Da un guaio a una frase che dice cosa fare. Mai il messaggio tecnico.
 *
 * Quello tecnico va nel registro, una riga: la frase dice cosa fare a chi
 * collega, la riga dice a chi lo aiuta quale passo Granola ha rifiutato. Dentro
 * ci sono indirizzi e stati HTTP, mai un token.
 */
export function frase(e: unknown): string {
  console.error(`myynd · granola · ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
  if (e instanceof ErroreMcp) {
    if (e.tipo === 'rete') return RETE
    if (e.tipo === 'accesso') return NIENTE_ACCESSO
    if (e.tipo === 'limite') return RALLENTA
    if (e.tipo === 'registrazione') return REGISTRAZIONE
    if (e.tipo === 'strumento') return NON_LEGGE
    // Granola che sta male, o che è lenta, non è un collegamento da rifare
    if (e.tipo === 'servizio') return GIU
    if (e.tipo === 'tempo') return LENTO
    return CAMBIATO
  }
  // `fetch` che non arriva da nessuna parte, o che ci mette troppo
  if (e instanceof TypeError) return RETE
  if (e instanceof Error) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return RETE
    /*
     * Solo le frasi scritte per chi legge passano così come sono: quelle di
     * questo modulo e di `oauth.ts`, che sono `Error` semplici. Un errore del
     * disco (`EACCES`, con dentro un percorso) o uno di programma
     * (`RangeError`) finiva sulla scheda tale e quale.
     */
    if (e.constructor !== Error || typeof (e as { code?: unknown }).code === 'string') return GUASTO
    return e.message
  }
  return GUASTO
}

// — le chiavi —

/** Quello che serve per parlare con Granola a nome di una persona. */
type Chiavi = {
  clientId: string
  clientSecret?: string
  metodo?: string
  gettoni: string
  risorsa: string
  mcp: string
  refresh: string
}

/** Collegato con l'account: da qui in poi la cache non si legge più (vedi `index.ts`). */
export function conAccount(c: { granola?: ConfigGranola }): boolean {
  return !!chiaviDi(c.granola)
}

/**
 * Il refresh ruotato che il disco non ha voluto, per persona.
 *
 * WorkOS usa ogni refresh una volta: quello nuovo va tenuto anche se la
 * scrittura della configurazione fallisce (un disco pieno, un permesso), o il
 * giro dopo userebbe quello vecchio e si sentirebbe dire «scaduto». Resta qui
 * finché una scrittura va, e vale solo per la registrazione con cui è nato.
 */
const inMemoria = new Map<string, { clientId: string; refresh: string }>()

/**
 * La generazione del collegamento, per persona.
 *
 * Cresce quando si scollega e quando un collegamento nuovo si scrive. Una
 * lettura si ricorda quella con cui è partita, e se alla fine è cambiata non
 * scrive niente: «Scollega» premuto mentre Granola rispondeva deve vincere, e
 * così una lettura della registrazione di prima finita dopo un «Accedi di
 * nuovo».
 */
const generazioni = new Map<string, number>()
const generazione = (di: string) => generazioni.get(di) ?? 0
const avanti = (di: string) => { generazioni.set(di, generazione(di) + 1) }

function chiaviDi(g: ConfigGranola | undefined): Chiavi | null {
  if (!g?.refresh || !g.clientId || !g.gettoni) return null
  const tenuto = inMemoria.get(chi.adesso() ?? '')
  return {
    clientId: g.clientId,
    ...(g.clientSecret ? { clientSecret: g.clientSecret } : {}),
    ...(g.metodo ? { metodo: g.metodo } : {}),
    gettoni: g.gettoni,
    risorsa: g.risorsa || g.mcp || endpoint(),
    mcp: g.mcp || endpoint(),
    refresh: tenuto && tenuto.clientId === g.clientId ? tenuto.refresh : g.refresh
  }
}

function chiaviDa(s: Scoperta, r: Registrazione): Chiavi {
  return {
    clientId: r.clientId,
    ...(r.clientSecret ? { clientSecret: r.clientSecret, metodo: r.metodo } : {}),
    gettoni: s.gettoni,
    risorsa: s.risorsa,
    mcp: endpoint(),
    refresh: ''
  }
}

function traduci(j: Record<string, unknown>): string | null {
  const e = String(j.error ?? '')
  // un codice usato, un refresh già ruotato, una registrazione che Granola ha buttato
  if (e === 'invalid_grant' || e === 'invalid_client') return SCADUTO
  return null
}

/**
 * Lo sportello di `oauth.ts`, scritto con quello che ha detto la scoperta.
 *
 * `resource` in tutte e due le richieste — consenso e token — perché lo vuole
 * la specifica MCP (RFC 8707): il token che torna vale per questo server e
 * per nessun altro.
 */
function sportello(c: Chiavi, s?: Scoperta): Sportello {
  const basic = !!c.clientSecret && c.metodo === 'client_secret_basic'
  return {
    nome: 'Granola',
    gettoni: c.gettoni,
    campi: {
      client_id: c.clientId,
      resource: c.risorsa,
      ...(c.clientSecret && !basic ? { client_secret: c.clientSecret } : {})
    },
    ...(basic ? { intestazioni: { authorization: `Basic ${Buffer.from(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret!)}`).toString('base64')}` } } : {}),
    traduci,
    autorizza: ({ redirect, sfida, stato }) => {
      if (!s) return ''
      const u = new URL(s.autorizza)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('client_id', c.clientId)
      u.searchParams.set('redirect_uri', redirect)
      if (s.ambiti.length) u.searchParams.set('scope', s.ambiti.join(' '))
      u.searchParams.set('state', stato)
      u.searchParams.set('code_challenge', sfida)
      u.searchParams.set('code_challenge_method', 'S256')
      u.searchParams.set('resource', s.risorsa)
      return u.toString()
    }
  }
}

/**
 * Un token nuovo, e il refresh nuovo con lui.
 *
 * Il server di Granola è WorkOS, e WorkOS usa ogni refresh una volta sola:
 * quello che torna va tenuto *subito*, perché il vecchio da adesso vale zero.
 * Perderlo vuol dire un collegamento che si rompe al giro dopo, senza che
 * nessuno abbia fatto niente.
 */
async function rinnovaCon(c: Chiavi): Promise<Gettoni> {
  if (!c.refresh) throw new Error(SCADUTO)
  const g = await chiediGettoni(sportello(c), { grant_type: 'refresh_token', refresh_token: c.refresh })
  if (typeof g.refresh_token === 'string' && g.refresh_token) c.refresh = g.refresh_token
  return g
}

/**
 * Il refresh nuovo, scritto solo sopra il collegamento da cui è nato.
 *
 * Mentre questo rinnovo era in volo qualcuno può aver rifatto l'accesso
 * («Accedi di nuovo»: un'altra registrazione, un altro refresh) o scollegato:
 * scriverlo lo stesso metteva il refresh della registrazione vecchia accanto
 * al `clientId` nuovo, e il giro dopo si rompeva. Si scrive se la
 * registrazione è la stessa e il refresh sul disco (o in memoria) è ancora
 * quello usato; se il disco dice di no, resta in memoria.
 */
function tieniRefresh(di: string, clientId: string, prima: string, nuovo: string) {
  const ora = leggi()
  const g = ora.granola
  if (!g || g.clientId !== clientId) return
  const tenuto = inMemoria.get(di)
  const attuale = tenuto && tenuto.clientId === clientId ? tenuto.refresh : g.refresh
  if (attuale !== prima) return
  inMemoria.set(di, { clientId, refresh: nuovo })
  try {
    scriviConfig({ ...ora, granola: { ...g, refresh: nuovo } })
    inMemoria.delete(di)
  } catch (e) {
    console.error(`myynd · granola · il refresh nuovo resta in memoria: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Un rinnovo alla volta, per persona e per registrazione.
 *
 * Due letture insieme — il giro di sfondo e un «Rileggi» — chiederebbero due
 * rinnovi con lo stesso refresh: il secondo arriva con un refresh già usato, e
 * WorkOS a quel punto può buttare anche il primo. Chi arriva mentre un rinnovo
 * è in volo aspetta quello. La registrazione sta nella chiave, qui e nel
 * `Vivo`: il token di quella vecchia non viene dato a chi legge con la nuova.
 */
const inVolo = new Map<string, Promise<Gettoni>>()
const chiaveDi = () => `${chi.adesso() ?? ''}|${leggi().granola?.clientId ?? ''}`
const vivo = new Vivo(() => {
  const di = chi.adesso() ?? ''
  const c = chiaviDi(leggi().granola)
  if (!c) return Promise.reject(new Error(NIENTE_ACCESSO))
  const chiave = `${di}|${c.clientId}`
  let p = inVolo.get(chiave)
  if (!p) {
    p = (async () => {
      const prima = c.refresh
      const g = await rinnovaCon(c)
      if (c.refresh !== prima) tieniRefresh(di, c.clientId, prima, c.refresh)
      return g
    })().finally(() => inVolo.delete(chiave))
    inVolo.set(chiave, p)
  }
  return p
}, { chiave: chiaveDi })

/**
 * Da usare quando si scollega: il token d'accesso e il refresh in memoria se
 * ne vanno, e le letture in volo non scrivono più niente.
 */
export function scorda() {
  const di = chi.adesso() ?? ''
  vivo.scorda()
  inMemoria.delete(di)
  appena.delete(di)
  avanti(di)
}

/**
 * La prima lettura è appena finita: il giro che parte subito dopo — l'«Avanti»
 * della scheda rilegge tutte le fonti — non rifà Granola. Una volta sola, e
 * solo nei cinque minuti dopo.
 */
const appena = new Map<string, number>()
export function appenaLetto(): boolean {
  const di = chi.adesso() ?? ''
  const quando = appena.get(di)
  appena.delete(di)
  return !!quando && Date.now() - quando < 5 * 60_000
}

/**
 * Le chiavi in mano, per la prima lettura: prima di scriverle da qualche parte.
 *
 * Il collegamento si scrive solo quando la prima lettura è andata, come per
 * la cache e per il calendario: la prova è la lettura. Fino a lì il token sta
 * qui, e se scade a metà si rinnova qui.
 */
function inMano(c: Chiavi, g: Gettoni) {
  let token = g.access_token
  let scade = Date.now() + Number(g.expires_in ?? 3600) * 1000
  let volo: Promise<void> | null = null
  return {
    dammi: async (): Promise<string> => {
      if (scade > Date.now() + 60_000) return token
      if (!volo) {
        volo = rinnovaCon(c).then(n => {
          token = n.access_token
          scade = Date.now() + Number(n.expires_in ?? 3600) * 1000
        }).finally(() => { volo = null })
      }
      await volo
      return token
    },
    scorda: () => { scade = 0 }
  }
}

// — la forma delle risposte —

export type Riunione = {
  id: string
  titolo: string
  /** In ISO, o `null` se Granola non l'ha detta o non si capisce. */
  quando: string | null
  persone: string[]
  testo: string
}

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
/**
 * Le entità, in un passaggio solo.
 *
 * Erano due passaggi, e il secondo rileggeva quello che il primo aveva appena
 * scritto: il titolo di un invito «&amp;#1114112;» diventava «&#1114112;», poi
 * `String.fromCodePoint` di un numero che non è un carattere — un RangeError
 * che faceva fallire ogni lettura, per sempre, per una riga scritta da chi
 * aveva mandato l'invito. Un numero fuori da Unicode, o una metà di coppia,
 * diventa il carattere di sostituzione.
 */
function decodifica(s: string): string {
  return s.replace(/&(?:#(\d{1,8})|#x([0-9a-f]{1,7})|(amp|lt|gt|quot|apos|nbsp));/gi, (tutto, dec?: string, hex?: string, nome?: string) => {
    if (nome) return ENTITA[nome.toLowerCase()] ?? tutto
    const n = dec !== undefined ? Number(dec) : parseInt(hex ?? '', 16)
    if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '\ufffd'
    return String.fromCodePoint(n)
  })
}

/**
 * Gli attributi di un tag, e il primo vince.
 *
 * Un titolo scritto male (`title="x" id="y"` senza le virgolette sfuggite)
 * non deve poter cambiare l'id della riunione: con l'ultimo che vinceva,
 * bastava un invito con quel titolo per far sovrascrivere una riunione con
 * un'altra nell'indice.
 */
function attributi(s: string): Record<string, string> {
  const fuori: Record<string, string> = {}
  for (const m of s.matchAll(/(?:^|\s)([\w:-]+)\s*=\s*"([^"]*)"/g)) {
    const k = m[1]!.toLowerCase()
    if (!(k in fuori)) fuori[k] = decodifica(m[2]!)
  }
  return fuori
}

/**
 * Una data, anche quando `Date` non la capisce al primo colpo.
 *
 * Granola scrive «Feb 4, 2026 7:30 PM»; basta un «at» in mezzo, un «4th» o il
 * giorno della settimana davanti perché `Date` dica NaN, e una riunione
 * senza data si richiedeva a ogni giro. Si tolgono quelle parole e si riprova.
 */
function isoDa(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  let d = new Date(v)
  if (Number.isNaN(d.getTime()) && typeof v === 'string') {
    const pulita = v.replace(/^[a-z]+day,?\s+/i, '').replace(/\s+at\s+/i, ' ').replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/\s+/g, ' ').trim()
    d = new Date(pulita)
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Chi c'era, dalle righe di `<known_participants>`.
 *
 * Granola le scrive così: «John Doe (note creator) from Acme <john@acme.com>».
 * Si tiene «John Doe <john@acme.com>», che è la stessa forma della cache: la
 * ricerca trova la riunione per il nome e per l'indirizzo, e «note creator» o
 * il nome dell'azienda non sono una persona.
 */
export function partecipanti(blocco: string): string[] {
  const visti = new Map<string, string>()
  for (const riga of blocco.split(/\r?\n|(?<=>)\s*[,;]\s*/)) {
    const pulita = decodifica(riga).trim()
    if (!pulita) continue
    const posta = /<([^<>\s]+@[^<>\s]+)>/.exec(pulita)?.[1] ?? (/^[^\s@<>]+@[^\s@<>]+$/.test(pulita) ? pulita : '')
    const nome = pulita.replace(/<[^<>]*>/g, '').replace(/\([^()]*\)/g, '').replace(/\s+from\s+.+$/i, '')
      .replace(/\s+/g, ' ').trim()
    const chiave = (posta || nome).toLowerCase()
    if (!chiave || visti.has(chiave) || visti.size >= 40) continue
    visti.set(chiave, nome && nome !== posta ? (posta ? `${nome} <${posta}>` : nome) : posta)
  }
  return [...visti.values()]
}

/** La stessa cosa, quando arriva in JSON: stringhe, o oggetti con nome e indirizzo. */
function partecipantiDa(x: unknown): string[] {
  if (typeof x === 'string') return partecipanti(x)
  if (!Array.isArray(x)) return []
  const righe: string[] = []
  for (const p of x) {
    if (typeof p === 'string') righe.push(p)
    else if (p && typeof p === 'object') {
      const v = p as Record<string, unknown>
      const nome = [v.name, v.displayName, v.display_name, v.full_name].find(n => typeof n === 'string' && n.trim()) as string | undefined
      const posta = typeof v.email === 'string' ? v.email.trim() : ''
      righe.push(posta ? `${nome ?? ''} <${posta}>` : nome ?? '')
    }
  }
  return partecipanti(righe.join('\n'))
}

/**
 * Il testo di una riunione, dai pezzi che Granola manda dentro `<meeting>`.
 *
 * Il riassunto prima, poi gli appunti: è l'ordine della cache (i pannelli,
 * poi le note scritte a mano), e rispondono a due domande diverse. La
 * trascrizione solo quando non c'è nient'altro, per la stessa ragione.
 */
function testoDaPezzi(pezzi: { nome: string; testo: string }[]): string {
  const peso = (n: string) => /summary|enhanced|ai_|panel/.test(n) ? 0 : /transcript/.test(n) ? 2 : 1
  // una decodifica sola: l'HTML la fa `testoLibero` (che toglie i tag), il testo semplice questa
  const leggibile = (t: string) => /<\/?[a-z][^>]*>/i.test(t) ? testoLibero(t) : decodifica(t)
  const utili = pezzi.map(p => ({ ...p, testo: ripulisci(leggibile(p.testo)) })).filter(p => p.testo)
  const senzaTrascrizione = utili.filter(p => peso(p.nome) < 2)
  const scelti = (senzaTrascrizione.length ? senzaTrascrizione : utili).sort((a, b) => peso(a.nome) - peso(b.nome))
  const tutto: string[] = []
  for (const p of scelti) if (!tutto.includes(p.testo)) tutto.push(p.testo)
  const unito = tutto.join('\n\n')
  return unito.length > TESTO_MAX ? `${unito.slice(0, TESTO_MAX)}…` : unito
}

const PARTECIPANTI = /^(known_participants|participants|attendees|people)$/

function daXml(testo: string): { riunioni: Riunione[]; dichiarate: number | null } | null {
  const busta = /<meetings_data\b([^>]*)>/.exec(testo)
  const riunioni: Riunione[] = []
  for (const m of testo.matchAll(/<meeting\b([^>]*?)(?:\/>|>([\s\S]*?)<\/meeting>)/g)) {
    // una riunione che non si legge non ferma le altre: si salta, e si dice nel registro
    try {
      const a = attributi(m[1] ?? '')
      const id = (a.id ?? '').trim()
      if (!id) continue
      const dentro = m[2] ?? ''
      const persone: string[] = []
      const pezzi: { nome: string; testo: string }[] = []
      for (const s of dentro.matchAll(/<([a-z][a-z0-9_]*)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
        const nome = s[1]!.toLowerCase()
        if (PARTECIPANTI.test(nome)) persone.push(...partecipanti(s[2]!))
        else pezzi.push({ nome, testo: s[2]! })
      }
      riunioni.push({
        id,
        titolo: (a.title ?? '').trim(),
        quando: isoDa(a.date ?? a.created_at ?? a.start),
        persone: [...new Set(persone)],
        testo: testoDaPezzi(pezzi)
      })
    } catch (e) {
      console.error(`myynd · granola · una riunione non si legge: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (!busta && !riunioni.length) return null
  const n = busta ? Number(attributi(busta[1] ?? '').count) : NaN
  return { riunioni, dichiarate: Number.isFinite(n) ? n : null }
}

const CAMPI_TESTO = ['summary', 'enhanced_notes', 'ai_summary', 'notes', 'private_notes', 'my_notes', 'notes_markdown', 'notes_plain', 'content', 'markdown', 'transcript']

function daJson(x: unknown): { riunioni: Riunione[]; dichiarate: number | null } | null {
  let elenco: unknown = x
  let dichiarate: number | null = null
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    const o = x as Record<string, unknown>
    elenco = o.meetings ?? o.notes ?? o.documents ?? o.items ?? o.data ?? o.results
    const n = Number(o.count ?? o.total)
    if (Number.isFinite(n)) dichiarate = n
    // una riunione sola, senza la busta
    if (elenco === undefined && typeof o.id === 'string') elenco = [o]
  }
  if (!Array.isArray(elenco)) return null
  const riunioni: Riunione[] = []
  for (const v of elenco) {
    if (!v || typeof v !== 'object') continue
    try {
      const o = v as Record<string, unknown>
      const id = typeof o.id === 'string' ? o.id.trim() : typeof o.meeting_id === 'string' ? o.meeting_id.trim() : ''
      if (!id) continue
      riunioni.push({
        id,
        titolo: typeof o.title === 'string' ? o.title.trim() : '',
        quando: isoDa(o.date ?? o.created_at ?? o.start_time ?? o.start ?? o.meeting_date),
        persone: partecipantiDa(o.known_participants ?? o.participants ?? o.attendees ?? o.people),
        testo: testoDaPezzi(CAMPI_TESTO.filter(k => o[k] != null).map(k => ({
          nome: k, testo: typeof o[k] === 'string' ? o[k] as string : testoLibero(o[k])
        })))
      })
    } catch (e) {
      console.error(`myynd · granola · una riunione non si legge: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { riunioni, dichiarate }
}

/**
 * Le riunioni dentro un risultato, qualunque forma abbia preso.
 *
 * `capito` falso vuol dire «c'era qualcosa, e non so leggerlo»: chi chiama lo
 * tratta come un guasto, non come un elenco vuoto. Un testo vuoto invece è un
 * elenco vuoto.
 */
export function riunioniDa(r: Risultato): { riunioni: Riunione[]; dichiarate: number | null; capito: boolean } {
  if (r.structuredContent !== undefined && r.structuredContent !== null) {
    const j = daJson(r.structuredContent)
    if (j) return { ...j, capito: true }
  }
  const testo = testoDi(r).trim()
  if (!testo) return { riunioni: [], dichiarate: null, capito: true }
  if (/^[[{]/.test(testo)) {
    try {
      const j = daJson(JSON.parse(testo))
      if (j) return { ...j, capito: true }
    } catch { /* non era JSON: si prova l'altra forma */ }
  }
  const x = daXml(testo)
  if (x) return { ...x, capito: true }
  // «nessuna riunione» detto a parole: non è un formato nuovo
  if (/\b(no|0)\s+(meetings|notes)\b/i.test(testo) && testo.length < 300) return { riunioni: [], dichiarate: 0, capito: true }
  return { riunioni: [], dichiarate: null, capito: false }
}

/**
 * Il piano gratuito, solo se Granola lo dice.
 *
 * Il piano «Basic» dà le riunioni degli ultimi trenta giorni; la scheda lo
 * scrive accanto al numero, perché altrimenti chi ne ha trecento e ne vede
 * dodici pensa a un guasto. Ma si scrive solo quando `get_account_info` o un
 * no di Granola lo nominano: indovinarlo da un elenco corto vorrebbe dire
 * dirlo anche a chi le riunioni vecchie non le ha.
 */
export function pianoGratuito(r: Risultato): boolean {
  const testo = `${testoDi(r)}\n${r.structuredContent ? JSON.stringify(r.structuredContent) : ''}`
  return /["']?\b(plan|tier|subscription)\b["']?\s*(?:name)?\s*[:=]\s*["']?(free|basic)\b/i.test(testo) ||
    /\b(free|basic)\s+(plan|tier)\b/i.test(testo)
}

/** Un no di Granola che parla del piano, non di un guasto. */
const LIMITE_PIANO = /\b(paid|plan|tier|upgrade|subscription)\b|\b30[- ]days?\b/i

// — l'elenco —

type Forma = {
  /** Come si chiede una finestra di date, se si può. */
  finestra: 'custom' | 'creati' | null
  /** Il nome del campo con gli id in `get_meetings`, e quanti se ne possono chiedere insieme. */
  campoId: string
  perVolta: number
}

function proprieta(s: Strumento | undefined): Record<string, Record<string, unknown>> {
  const p = s?.inputSchema && typeof s.inputSchema === 'object' ? (s.inputSchema as { properties?: unknown }).properties : undefined
  return (p && typeof p === 'object' ? p : {}) as Record<string, Record<string, unknown>>
}

/**
 * Come chiamare i due strumenti, dal loro schema.
 *
 * Lo schema di oggi è `time_range: "custom"` con `custom_start`/`custom_end`
 * e `meeting_ids` fino a dieci. Leggerlo da `tools/list` invece di scriverlo
 * qui a mano è quello che tiene in piedi il connettore il giorno che Granola
 * rinomina un campo: l'altra forma che circola (`created_after`/
 * `created_before`) è già qui. Senza schema, si usa quella documentata.
 */
function formaDi(elenca: Strumento, prendi: Strumento): Forma {
  const pe = proprieta(elenca)
  const conSchema = Object.keys(pe).length > 0
  const scelte = Array.isArray(pe.time_range?.enum) ? pe.time_range!.enum as unknown[] : []
  const finestra: Forma['finestra'] = !conSchema || (scelte.includes('custom') && 'custom_start' in pe)
    ? 'custom'
    : 'created_after' in pe && 'created_before' in pe ? 'creati' : null

  const pp = proprieta(prendi)
  const campoId = ['meeting_ids', 'document_ids', 'ids', 'note_ids'].find(k => k in pp)
    ?? Object.keys(pp).find(k => pp[k]?.type === 'array') ?? 'meeting_ids'
  const tetto = Number(pp[campoId]?.maxItems)
  return { finestra, campoId, perVolta: Number.isFinite(tetto) && tetto >= 1 ? Math.min(25, Math.floor(tetto)) : 10 }
}

const data = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function argomentiFinestra(f: Forma, da: number, a: number): Record<string, unknown> {
  if (f.finestra === 'creati') return { created_after: new Date(da).toISOString(), created_before: new Date(a).toISOString() }
  return { time_range: 'custom', custom_start: data(da), custom_end: data(a) }
}

type Finestra = { riunioni: Riunione[]; buco: boolean; errore?: string; piano?: boolean }

/**
 * Una finestra di date, divisa in due se sembra tagliata.
 *
 * `list_meetings` non ha pagine: se un giorno taglia l'elenco, lo si vede dal
 * `count` della busta più grande di quello che c'è dentro, o da una finestra
 * piena in modo sospetto. In tutti e due i casi si chiede di nuovo, a metà:
 * costa qualche chiamata a chi fa cento riunioni al mese, e niente agli altri.
 * Quello che resta tagliato dopo quattro divisioni si dichiara `buco`: lì
 * dentro non si cancella niente.
 */
async function elencaFinestra(cliente: ClienteMcp, f: Forma, da: number, a: number, giu = 0): Promise<Finestra> {
  const r = await cliente.chiama('list_meetings', argomentiFinestra(f, da, a))
  if (r.isError) {
    const t = testoDi(r)
    return { riunioni: [], buco: true, errore: t || 'list_meetings', piano: LIMITE_PIANO.test(t) }
  }
  const e = riunioniDa(r)
  if (!e.capito) throw new ErroreMcp('protocollo', 'list_meetings: forma sconosciuta')
  const tagliata = e.dichiarate !== null && e.dichiarate > e.riunioni.length
  if ((tagliata || e.riunioni.length >= SOSPETTO) && a - da > 2 * GIORNO && giu < 4) {
    const meta = da + Math.floor((a - da) / 2)
    const nuove = await elencaFinestra(cliente, f, meta, a, giu + 1)
    const vecchie = await elencaFinestra(cliente, f, da, meta + GIORNO, giu + 1)
    return { riunioni: [...nuove.riunioni, ...vecchie.riunioni], buco: nuove.buco || vecchie.buco }
  }
  return { riunioni: e.riunioni, buco: tagliata }
}

// — leggere —

/**
 * Quello che un giro lascia al giro dopo.
 *
 * Sta nel cursore di `store` (vedi `ripresa.ts`), che è già per persona e su
 * disco: lo legge e lo scrive `index.ts`, qui si usa e basta.
 */
export type Ricordi = {
  /** Quando si è elencato l'ultima volta tutto il tratto, fino a due anni indietro. */
  piena?: number
  /** Il giro scorso ha lasciato riunioni da chiedere, o si è fermato: il prossimo elenca tutto. */
  resto?: boolean
  /** Le riunioni chieste e tornate senza testo, con quando: non si richiedono a ogni giro. */
  vuote?: Record<string, number>
}

export type EsitoMcp = EsitoGranola & {
  /**
   * Gli id che non si possono cancellare: quelli che Granola ha elencato, e
   * quelli dell'indice fuori dal tratto di date che Granola ha coperto. Vanno a
   * `riconcilia` insieme ai documenti.
   */
  visti: string[]
  /** Il tratto letto non ha buchi: quello che manca lì dentro, Granola non ce l'ha più. */
  completo: boolean
  /** Granola ha detto che il piano dà solo gli ultimi trenta giorni. */
  trentaGiorni: boolean
  /** Quante riunioni ha elencato Granola, con o senza testo. */
  elencate: number
  /**
   * Quelle elencate che erano già nell'indice e non si sono richieste. La riga
   * della lettura le dice accanto al numero, come la posta: «4 documenti» da
   * soli, su un Granola con quaranta riunioni, sembrano un collegamento che
   * perde roba.
   */
  giaLetti: number
  /** Da ricordare per il giro dopo. */
  ricordi: Ricordi
  /** La generazione con cui è partita la lettura: vedi `valido`. */
  generazione: number
}

/**
 * Questa lettura può ancora scrivere? No se nel frattempo si è scollegato, o
 * se un collegamento nuovo ha preso il posto di quello con cui è partita.
 */
export function valido(e: { generazione: number }): boolean {
  return generazione(chi.adesso() ?? '') === e.generazione
}

/**
 * Le riunioni, lette da un cliente già pronto.
 *
 * Tre tempi. **L'elenco**: una volta al giorno (o quando il giro prima non ha
 * finito) finestre di trenta giorni all'indietro, fino a due anni o a tre mesi
 * vuoti di fila; negli altri giri solo l'ultima finestra, che è dove nascono
 * le riunioni nuove e cambiano le note. **Le note**: solo quelle che mancano
 * all'indice e quelle delle riunioni di questa settimana, a dieci per
 * chiamata, trecento per giro, dalle più nuove; una riunione tornata senza
 * testo si richiede dopo una settimana, non a ogni giro. **Cosa si può
 * cancellare**: solo quello che sta fra la riunione più vecchia che Granola ha
 * elencato e oggi. Non dall'inizio della finestra più vecchia chiesta: il
 * piano gratuito risponde vuoto, senza dirlo, oltre i trenta giorni, e tre
 * finestre vuote in fondo allargavano il tratto fino a quattro mesi — cioè
 * cancellavano riunioni che da lì non sarebbero tornate mai più.
 */
export async function leggiDa(cliente: ClienteMcp, gia: Map<string, string | null>, opz: {
  adesso?: number
  /**
   * Le note si chiedono anche per le riunioni già nell'indice. Alla prima
   * lettura dopo il collegamento: quelle dentro possono venire dalla cache di
   * un Granola vecchio, che il riassunto non l'aveva.
   */
  tutte?: boolean
  /** Tutto il tratto, invece della sola finestra recente. Di serie: una volta al giorno. */
  piena?: boolean
  ricordi?: Ricordi
} = {}): Promise<EsitoMcp> {
  const gen = generazione(chi.adesso() ?? '')
  const adesso = opz.adesso ?? Date.now()
  const ricordi = opz.ricordi ?? {}
  const piena = opz.piena ?? (!ricordi.piena || adesso - ricordi.piena > GIORNO || !!ricordi.resto)
  const strumenti = await cliente.strumenti()
  const elenca = strumenti.find(s => s.name === 'list_meetings')
  const prendi = strumenti.find(s => s.name === 'get_meetings')
  if (!elenca || !prendi) throw new ErroreMcp('protocollo', 'mancano list_meetings o get_meetings')
  const forma = formaDi(elenca, prendi)

  let trenta = false
  if (strumenti.some(s => s.name === 'get_account_info')) {
    try {
      const info = await cliente.chiama('get_account_info', {})
      if (!info.isError && pianoGratuito(info)) trenta = true
    } catch (e) {
      // l'account è un di più: un guasto qui non ferma la lettura; l'accesso negato e il tempo finito sì
      if (e instanceof ErroreMcp && (e.tipo === 'accesso' || e.tipo === 'tempo')) throw e
    }
  }

  const elencate = new Map<string, Riunione>()
  let buchi = false
  let troncato = false
  let interrotto = false

  if (!forma.finestra) {
    // lo strumento non accetta date: quello che dà da solo, cioè gli ultimi trenta giorni
    const r = await cliente.chiama('list_meetings', {})
    if (r.isError) throw new ErroreMcp('strumento', testoDi(r))
    const e = riunioniDa(r)
    if (!e.capito) throw new ErroreMcp('protocollo', 'list_meetings: forma sconosciuta')
    for (const x of e.riunioni) if (!elencate.has(x.id)) elencate.set(x.id, x)
    buchi = e.dichiarate !== null && e.dichiarate > e.riunioni.length
  } else {
    // due giorni avanti: «oggi» in un altro fuso è già domani
    let fine = adesso + 2 * GIORNO
    const limite = trenta ? adesso - FINESTRA_GIORNI * GIORNO
      : piena ? adesso - ORIZZONTE_GIORNI * GIORNO
      : fine - FINESTRA_GIORNI * GIORNO
    let vuoteDiFila = 0
    let prima = true
    for (;;) {
      const inizio = Math.max(limite, fine - FINESTRA_GIORNI * GIORNO)
      let w: Finestra
      try {
        w = await elencaFinestra(cliente, forma, inizio, fine)
      } catch (e) {
        // senza la prima finestra non c'è niente da dire; dopo, ci si ferma dove si è arrivati
        if (prima || (e instanceof ErroreMcp && (e.tipo === 'accesso' || e.tipo === 'protocollo'))) throw e
        interrotto = true
        break
      }
      if (w.errore) {
        if (w.piano) trenta = true
        else if (prima) throw new ErroreMcp('strumento', w.errore)
        else interrotto = true
        break
      }
      prima = false
      const prime = elencate.size
      for (const x of w.riunioni) if (!elencate.has(x.id)) elencate.set(x.id, x)
      if (w.buco) buchi = true
      vuoteDiFila = elencate.size === prime ? vuoteDiFila + 1 : 0
      if (elencate.size >= TETTO) { troncato = true; break }
      if (inizio <= limite || vuoteDiFila >= VUOTE_DI_FILA) break
      // un giorno di sovrapposizione: una riunione sul bordo non cade fra due finestre
      fine = inizio + GIORNO
    }
  }

  const ms = (r: Riunione) => r.quando ? Date.parse(r.quando) : NaN
  const ordinate = [...elencate.values()].sort((a, b) => (ms(b) || 0) - (ms(a) || 0))
  const vuoteViste: Record<string, number> = {}
  for (const [id, quando] of Object.entries(ricordi.vuote ?? {})) {
    if (typeof quando === 'number' && adesso - quando < RIPROVA_VUOTE_GIORNI * GIORNO) vuoteViste[id] = quando
  }
  const fresca = (r: Riunione) => { const t = ms(r); return Number.isFinite(t) && t > adesso - FRESCHE_GIORNI * GIORNO }
  /*
   * Cosa chiedere. Una riunione senza data valida si chiedeva a ogni giro, e
   * così una tornata senza testo: trecento così mangiavano tutto il tetto, e
   * le riunioni più vecchie con le note vere non arrivavano mai.
   */
  const daChiedere = ordinate.filter(r => {
    if (opz.tutte || fresca(r)) return true
    if (vuoteViste[r.id]) return false
    return !gia.has(`granola:${r.id}`)
  })
  const chieste = new Set(daChiedere.map(r => r.id))
  const giaLetti = ordinate.filter(r => !chieste.has(r.id) && gia.has(`granola:${r.id}`)).length
  let noteLasciate = daChiedere.length > PER_GIRO
  if (noteLasciate) troncato = true

  const senzaTitolo = lingua() === 'it' ? 'Riunione senza titolo' : 'Untitled meeting'
  const con = lingua() === 'it' ? 'Con' : 'With'
  const docs: Documento[] = []
  let vuote = 0
  const questo = daChiedere.slice(0, PER_GIRO)
  for (let i = 0; i < questo.length; i += forma.perVolta) {
    const lotto = questo.slice(i, i + forma.perVolta)
    let r: Risultato
    try {
      r = await cliente.chiama('get_meetings', { [forma.campoId]: lotto.map(x => x.id) })
    } catch (e) {
      // a metà, o finito il tempo: quello letto resta, il resto al giro dopo
      if (e instanceof ErroreMcp && e.tipo === 'accesso') throw e
      if (!i && !(e instanceof ErroreMcp && e.tipo === 'tempo')) throw e
      troncato = true
      noteLasciate = true
      break
    }
    if (r.isError) {
      if (!i) throw new ErroreMcp('strumento', testoDi(r))
      troncato = true
      noteLasciate = true
      break
    }
    const e = riunioniDa(r)
    if (!e.capito) throw new ErroreMcp('protocollo', 'get_meetings: forma sconosciuta')
    const chiesti = new Set(lotto.map(x => x.id))
    for (const x of e.riunioni) {
      if (!chiesti.has(x.id)) continue
      chiesti.delete(x.id)
      const base = elencate.get(x.id)
      if (!x.testo) { vuote++; vuoteViste[x.id] = adesso; continue }
      delete vuoteViste[x.id]
      const persone = [...new Set([...x.persone, ...(base?.persone ?? [])])]
      docs.push({
        // lo stesso id della cache: chi passa da una strada all'altra non si
        // ritrova la stessa riunione due volte nell'indice
        id: `granola:${x.id}`,
        fonte: 'granola',
        tipo: 'nota',
        titolo: x.titolo || base?.titolo || senzaTitolo,
        // chi c'era dentro il corpo, come nella cache: la ricerca guarda lì
        corpo: persone.length ? `${con}: ${persone.join(', ')}\n\n${x.testo}` : x.testo,
        autore: persone[0] ?? null,
        quando: x.quando ?? base?.quando ?? null,
        gruppo: 'note'
      })
    }
    // chieste e non tornate: come quelle senza testo, per non richiederle a ogni giro
    for (const id of chiesti) vuoteViste[id] = adesso
  }

  /*
   * Il tratto che Granola ha davvero coperto: dalla riunione più vecchia che ha
   * elencato fino alla fine dell'ultima finestra chiesta. Fuori da lì — più
   * vecchia, senza data, o con una data oltre la fine — una riunione
   * dell'indice non si tocca: non è sparita, non la si è guardata.
   */
  let piuVecchia = Infinity
  for (const r of elencate.values()) { const t = ms(r); if (Number.isFinite(t) && t < piuVecchia) piuVecchia = t }
  const fineLetta = adesso + 2 * GIORNO
  const visti = new Set([...elencate.keys()].map(id => `granola:${id}`))
  for (const [id, quando] of gia) {
    const t = quando ? Date.parse(quando) : NaN
    if (!Number.isFinite(t) || t < piuVecchia || t > fineLetta) visti.add(id)
  }
  // zero riunioni elencate con l'indice pieno non vuol dire «Granola è vuoto»
  const completo = !buchi && !(elencate.size === 0 && gia.size > 0)

  const vuoteTenute = Object.fromEntries(Object.entries(vuoteViste).sort((a, b) => b[1] - a[1]).slice(0, 5000))
  return {
    docs, vuote, troncato, visti: [...visti], completo, trentaGiorni: trenta,
    elencate: elencate.size, giaLetti,
    ricordi: {
      ...(piena && !interrotto ? { piena: adesso } : ricordi.piena ? { piena: ricordi.piena } : {}),
      ...(noteLasciate || interrotto ? { resto: true } : {}),
      ...(Object.keys(vuoteTenute).length ? { vuote: vuoteTenute } : {})
    },
    generazione: gen
  }
}

/**
 * Cosa serve perché Granola torni a leggersi, dalla frase che si dice.
 *
 * Un nuovo accesso quando Granola non ci riconosce più; aspettare quando è
 * lenta, giù, o ci ha chiesto di rallentare; un aggiornamento di Myynd quando
 * ha cambiato il modo in cui si collega.
 */
export function rimedioGranola(f: string): Rimedio {
  if (f === SCADUTO || f === NIENTE_ACCESSO) return 'accedi'
  if ([RETE, RALLENTA, GIU, LENTO, NON_LEGGE, REGISTRAZIONE, SENZA_DURATA].includes(f)) return 'attendi'
  if (f === CAMBIATO) return 'aggiorna'
  return 'guarda'
}

/** Il giro di sfondo: le chiavi dalla configurazione, il token rinnovato quando serve, un tempo per tutto. */
export async function sincronizza(gia: Map<string, string | null>, ricordi: Ricordi = {}): Promise<EsitoMcp> {
  const c = chiaviDi(leggi().granola)
  if (!c) throw new GuaioFonte(NIENTE_ACCESSO, 'accedi')
  const cliente = new ClienteMcp({
    endpoint: c.mcp, token: () => vivo.dammi(), scaduto: () => vivo.scorda(), scadenza: Date.now() + DURATA_GIRO
  })
  try {
    return await leggiDa(cliente, gia, { ricordi })
  } catch (e) {
    const f = frase(e)
    throw new GuaioFonte(f, rimedioGranola(f))
  } finally {
    await cliente.chiudi()
  }
}

// — collegare —

export type Azioni = {
  /** Gli id già nell'indice, con la data: chi legge sa cosa non richiedere. */
  gia: () => Map<string, string | null>
  /** Mette nell'indice quello che si è letto, e dice quante riunioni ci sono adesso. */
  salva: (e: EsitoMcp) => Promise<number>
  /** Quello che il giro scorso ha lasciato, e dove mettere quello che lascia questo. */
  ricordi?: () => Ricordi
  ricorda?: (r: Ricordi) => void
}

// — l'app registrata, riusata —

function registrazioniSalvate(): RegistrazioneMcp[] {
  const r = leggi().registrazioniMcp
  return Array.isArray(r) ? r : []
}

function scriviRegistrazioni(cambia: (r: RegistrazioneMcp[]) => RegistrazioneMcp[]) {
  try {
    const c = leggi()
    scriviConfig({ ...c, registrazioniMcp: cambia(Array.isArray(c.registrazioniMcp) ? c.registrazioniMcp : []).slice(0, 4) })
  } catch (e) {
    // non ricordarla vuol dire registrarne un'altra la prossima volta, non un guasto
    console.error(`myynd · granola · la registrazione non si ricorda: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * L'app già registrata per questo emittente e questo ritorno, invece di una
 * nuova a ogni «Collega».
 *
 * Ogni clic registrava un'app in più presso Granola: dieci tentativi, dieci
 * app a nome di Myynd nell'elenco di chi collega. Si riusa quella di prima se
 * il ritorno è lo stesso (ospitati sempre; in casa se la porta di allora è
 * ancora libera, e la si prova per prima) e se ha meno di un mese. Un
 * tentativo andato storto con lei la fa dimenticare: il clic dopo ne fa una
 * nuova, e una registrazione buttata da Granola costa un tentativo, non tutti.
 */
async function registrazione(s: Scoperta, redirect: string): Promise<Registrazione> {
  const gia = registrazioniSalvate().find(x => x.emittente === s.emittente && x.redirect === redirect)
  if (gia && Date.now() - gia.quando < REGISTRAZIONE_VALE) return { clientId: gia.clientId, metodo: 'none' }
  const r = await registra(s, redirect)
  // solo i client pubblici: un segreto non si tiene fuori dal collegamento
  if (!r.clientSecret) {
    scriviRegistrazioni(tutte => [
      { emittente: s.emittente, redirect, clientId: r.clientId, quando: Date.now() },
      ...tutte.filter(x => !(x.emittente === s.emittente && x.redirect === redirect))
    ])
  }
  return r
}

function dimenticaRegistrazione(emittente: string, redirect: string) {
  if (!registrazioniSalvate().some(x => x.emittente === emittente && x.redirect === redirect)) return
  scriviRegistrazioni(tutte => tutte.filter(x => !(x.emittente === emittente && x.redirect === redirect)))
}

/** La porta dell'ultimo ritorno in casa ancora buono: provarla per prima vuol dire riusarne la registrazione. */
function portaDi(emittente: string): number | undefined {
  for (const r of registrazioniSalvate()) {
    if (r.emittente !== emittente || Date.now() - r.quando >= REGISTRAZIONE_VALE) continue
    const m = /^http:\/\/localhost:(\d+)\/callback$/.exec(r.redirect)
    if (m) return Number(m[1])
  }
  return undefined
}

/**
 * La prima lettura, con le chiavi appena avute, e poi la scrittura.
 *
 * Nell'ordine: senza refresh non si parte (il collegamento morirebbe fra
 * qualche minuto); si legge, con un tempo per tutto; si mette nell'indice; e
 * solo allora il collegamento si scrive in configurazione. Una lettura che
 * fallisce lascia tutto com'era, e la scheda dice perché. Un «Scollega»
 * premuto mentre Granola rispondeva vince: `null`, e niente si scrive.
 */
async function primaLettura(c: Chiavi, g: Gettoni, azioni: Azioni): Promise<{ note: number; trentaGiorni: boolean } | null> {
  if (typeof g.refresh_token !== 'string' || !g.refresh_token) throw new Error(SENZA_DURATA)
  const di = chi.adesso() ?? ''
  const gen = generazione(di)
  c.refresh = g.refresh_token
  const mano = inMano(c, g)
  const cliente = new ClienteMcp({ endpoint: c.mcp, token: mano.dammi, scaduto: mano.scorda, scadenza: Date.now() + DURATA_PRIMA })
  let e: EsitoMcp
  try {
    e = await leggiDa(cliente, azioni.gia(), { tutte: true, piena: true, ricordi: azioni.ricordi?.() ?? {} })
  } finally {
    await cliente.chiudi()
  }
  if (generazione(di) !== gen) return null
  const note = await azioni.salva(e)
  if (generazione(di) !== gen) return null
  try {
    const ora = leggi()
    scriviConfig({
      ...ora,
      granola: {
        note,
        clientId: c.clientId,
        ...(c.clientSecret ? { clientSecret: c.clientSecret, metodo: c.metodo } : {}),
        refresh: c.refresh,
        gettoni: c.gettoni,
        risorsa: c.risorsa,
        mcp: c.mcp,
        ...(e.trentaGiorni ? { trentaGiorni: true } : {})
      }
    })
  } catch (err) {
    console.error(`myynd · granola · il collegamento non si scrive: ${err instanceof Error ? err.message : String(err)}`)
    throw new Error(NON_SALVATO)
  }
  inMemoria.delete(di)
  azioni.ricorda?.(e.ricordi)
  // le letture partite prima di questo collegamento erano della registrazione di prima: non scrivono più
  avanti(di)
  vivo.scorda()
  appena.set(di, Date.now())
  return { note, trentaGiorni: e.trentaGiorni }
}

export type StatoTentativo = 'attesa' | 'lettura' | 'fatto' | 'errore' | 'annullato'

type Tentativo = {
  utente: string
  stato: StatoTentativo
  errore?: string
  note?: number
  trentaGiorni?: boolean
  quando: number
  scade: number
  chiudi: () => void
}

/**
 * I collegamenti avviati e non ancora finiti, per id.
 *
 * La chiave è un segreto a caso, e dentro c'è scritto di chi è: la scheda di
 * un'altra persona che indovinasse l'id riceverebbe «non c'è», come per un id
 * che non esiste. Mezz'ora, poi si buttano.
 */
const tentativi = new Map<string, Tentativo>()

/** Uno alla volta per persona: un secondo browser sopra al primo confonde e basta. */
function nuovoTentativo(utente: string, chiudi: () => void): { id: string; t: Tentativo } {
  const ora = Date.now()
  for (const [k, t] of tentativi) {
    if (t.utente === utente && t.stato === 'attesa') { t.stato = 'annullato'; t.chiudi() }
    if (ora - t.quando > 30 * 60_000) tentativi.delete(k)
  }
  const id = randomBytes(12).toString('base64url')
  const t: Tentativo = { utente, stato: 'attesa', quando: ora, scade: ora + ATTESA, chiudi }
  tentativi.set(id, t)
  return { id, t }
}

/** Dopo il sì, uguale in casa e ospitati: la prima lettura, e lo stato che la scheda legge. */
async function dopoIlSi(t: Tentativo, c: Chiavi, g: Gettoni, azioni: Azioni): Promise<void> {
  if (t.stato !== 'attesa') return
  t.stato = 'lettura'
  try {
    const fatto = await primaLettura(c, g, azioni)
    if (!fatto) { t.stato = 'annullato'; return }
    t.stato = 'fatto'
    t.note = fatto.note
    t.trentaGiorni = fatto.trentaGiorni
  } catch (e) {
    t.stato = 'errore'
    t.errore = frase(e)
  }
}

/** Un no detto dalla persona non dice niente della registrazione; il resto (nessun ritorno, un codice rifiutato) forse sì. */
const colpaDellaRegistrazione = (frase: string) => frase !== 'Hai detto di no a Granola.' && frase !== 'Accesso annullato.'

/**
 * Primo tempo, in casa: l'indirizzo del consenso, senza aprire niente.
 *
 * Il browser lo apre chi ha premuto: dentro l'app il guscio, fuori la pagina.
 * Da qui si scopre chi autorizza, si prende l'app già registrata con questo
 * ritorno (o se ne registra una: `http://localhost:<porta>/callback`, la forma
 * che usano i client MCP che Granola dichiara supportati), e si resta in
 * ascolto. Quello che succede dopo il sì — i token, la prima lettura, la
 * scrittura — gira da solo, dentro il conto di chi ha avviato, e la scheda lo
 * segue con `statoDi`.
 */
export async function avvia(azioni: Azioni): Promise<{ id: string; dove: string; scade: number }> {
  const utente = chi.adesso() ?? ''
  let scoperta: Scoperta
  const tenuta: { reg?: Registrazione; redirect?: string } = {}
  let l: Awaited<ReturnType<typeof avviaLocale>>
  try {
    scoperta = await scopri(endpoint(), { httpLocale: httpLocale() })
    l = await avviaLocale('Granola', async redirect => {
      tenuta.redirect = redirect
      tenuta.reg = await registrazione(scoperta, redirect)
      return sportello(chiaviDa(scoperta, tenuta.reg), scoperta)
    }, { ospite: 'localhost', percorso: '/callback', durata: ATTESA, porta: portaDi(scoperta.emittente) })
  } catch (e) { throw new Error(frase(e)) }

  const locale = l
  const { id, t } = nuovoTentativo(utente, locale.chiudi)
  const dentro = (fn: () => Promise<void>) => utente ? chi.dentro(utente, fn) : fn()
  void dentro(async () => {
    let g: Gettoni
    try {
      g = await locale.gettoni
    } catch (e) {
      if (t.stato === 'annullato') return
      t.stato = 'errore'
      t.errore = frase(e)
      if (colpaDellaRegistrazione(t.errore)) dimenticaRegistrazione(scoperta.emittente, tenuta.redirect ?? '')
      return
    } finally {
      locale.chiudi()
    }
    await dopoIlSi(t, chiaviDa(scoperta, tenuta.reg!), g, azioni)
  })
  return { id, dove: locale.dove, scade: t.scade }
}

/** Com'è andato un collegamento avviato da questa persona; `null` se non è suo o non c'è. */
export function statoDi(id: string): { stato: StatoTentativo; errore?: string; note?: number; trentaGiorni?: boolean } | null {
  const t = tentativi.get(id)
  if (!t || t.utente !== (chi.adesso() ?? '')) return null
  return {
    stato: t.stato,
    ...(t.errore ? { errore: t.errore } : {}),
    ...(t.note !== undefined ? { note: t.note } : {}),
    ...(t.trentaGiorni ? { trentaGiorni: true } : {})
  }
}

/**
 * «Annulla» mentre si aspetta il browser. Durante la prima lettura no: i
 * token sono già arrivati, e fermarla a metà vorrebbe dire metà indice.
 */
export function annulla(id: string): ReturnType<typeof statoDi> {
  const t = tentativi.get(id)
  if (!t || t.utente !== (chi.adesso() ?? '')) return null
  if (t.stato === 'attesa') { t.stato = 'annullato'; t.chiudi() }
  return statoDi(id)
}

/**
 * Ospitati: lo stesso consenso, con il ritorno dal nostro dominio.
 *
 * L'app si registra (una volta) con `https://<dominio>/api/oauth/ritorno`, e
 * da lì in poi è il ballo di Google e Microsoft: `avviaWeb` tiene lo `state`
 * e il verificatore, `/api/oauth/ritorno` scambia il codice. La differenza è
 * dopo. Il ritorno risponde **subito**: la prima lettura può durare un minuto,
 * e davanti a un proxy che taglia a trenta secondi quella pagina era un 502
 * con il collegamento scritto lo stesso. La lettura parte per conto suo, nel
 * conto di chi ha avviato (`completaWeb` chiama dentro quello), e la scheda la
 * segue con `statoDi` come in casa: il consenso si fa in un'altra scheda del
 * browser, che alla fine dice di chiudersi.
 */
export async function avviaSulWeb(azioni: Azioni): Promise<{ id: string; dove: string; scade: number; biglietto: string }> {
  const ritorno = oauthWeb().ritorno
  if (!ritorno) throw new Error('Il server non conosce il proprio dominio: chi lo ospita deve impostare MYYND_PUBBLICO.')
  const utente = chi.adesso() ?? ''
  let c: Chiavi
  let s: Scoperta
  try {
    s = await scopri(endpoint(), { httpLocale: httpLocale() })
    c = chiaviDa(s, await registrazione(s, ritorno))
  } catch (e) { throw new Error(frase(e)) }
  const { id, t } = nuovoTentativo(utente, () => {})
  const emittente = s.emittente
  const a = avviaWeb({
    ...sportello(c, s),
    scheda: true,
    fallito: e => {
      if (t.stato !== 'attesa') return
      t.stato = 'errore'
      t.errore = frase(e)
      if (colpaDellaRegistrazione(t.errore)) dimenticaRegistrazione(emittente, ritorno)
    }
  }, async g => {
    if (t.stato !== 'attesa') throw new Error('Accesso annullato.')
    if (typeof g.refresh_token !== 'string' || !g.refresh_token) {
      t.stato = 'errore'
      t.errore = SENZA_DURATA
      throw new Error(SENZA_DURATA)
    }
    void dopoIlSi(t, { ...c }, g, azioni)
  })
  return { id, dove: a.dove, scade: t.scade, biglietto: a.biglietto }
}
