// La salute delle fonti, detta a una persona.
//
// Il server sa perché una fonte non si legge (`rimedio`), da quando, e com'è
// andato ogni giorno. Qui quelle cose diventano parole: la riga fissa in cima
// alla prima pagina (una frase in prima persona e un controllo solo, quello
// che sistema davvero), la riga di stato nel pannello di una fonte, la riga
// del silenzio sulla scheda, e la striscia dei trenta giorni.
//
// «I would design it more like an error banner that is persistent. With a
// link that directs you to the sources.» E con la regola di sempre: quello
// che la pagina dice è vero. Niente React e niente rete: solo funzioni, che
// le prove girano in italiano e in inglese.

import { lingua, t } from './lingua.ts'
import type { Rimedio, RispostaSalute, Silenzio, Stato } from './api.ts'

/** Una fonte da dire nella riga fissa, col nome che ha la sua scheda. */
export type Mancanza = { id: string; nome: string; motivo: 'non-disponibile' | 'incompleta'; rimedio: Rimedio; dal: string; dopoAggiornamento: boolean }

/** L'unico controllo della riga: quello che sistema la prima frase che ha un guaio. */
export type Controllo =
  | { tipo: 'impostazioni' }
  | { tipo: 'accessibilita' }
  | { tipo: 'riapri' }
  | { tipo: 'accedi-claude' }
  | { tipo: 'fonti'; id: string | null }

/** Sostituisce `{chiave}` con i valori, dopo la traduzione della frase intera. */
export function riempi(testo: string, v: Record<string, string | number>): string {
  return testo.replace(/\{(\w+)\}/g, (tutto, k: string) => k in v ? String(v[k]) : tutto)
}

/** La prima lettera maiuscola: «la posta non accetta…» apre una frase. */
function maiuscola(s: string): string {
  return s ? s[0].toLocaleUpperCase(lingua() === 'en' ? 'en' : 'it') + s.slice(1) : s
}

/**
 * Il nome di una fonte dentro una frase.
 *
 * Il nome della scheda è quello che la persona clicca («Posta», «Il mio
 * Mac»), ma in una frase italiana vuole l'articolo: «Non riesco a leggere le
 * Note», «la posta non accetta più la password». Per gli altri resta il nome
 * della scheda, che è un nome proprio (Granola, Slack, Anthropic).
 */
export function nomeInFrase(id: string, nomeScheda: string): string {
  switch (id) {
    case 'posta': return t('la posta')
    case 'calendario': return t('il calendario')
    case 'note': return t('le Note')
    case 'desktop': return nomeScheda === 'Il mio PC' ? t('il tuo PC') : t('il tuo Mac')
    case 'conversazioni': return t('le conversazioni')
    case 'x': return 'X'
    default: return t(nomeScheda)
  }
}

const due = (n: number) => String(n).padStart(2, '0')

/** Il giorno corto, com'è scritto nella lingua dell'app: «22 set», «Sep 22». */
function giornoCorto(d: Date): string {
  return d.toLocaleDateString(lingua() === 'en' ? 'en-US' : 'it-IT', { day: 'numeric', month: 'short' })
}

/**
 * Da quando: «dalle 9:41», «da ieri alle 9:41», «dal 22 set», «dall’8 ott».
 *
 * Nell'ora locale di chi guarda. L'italiano elide davanti all'1, all'8 e
 * all'11, per il giorno e per l'ora («dall’11 ott», «dall’1:05», «da ieri
 * all’8:30»); l'inglese dice «since» e basta.
 */
export function da(iso: string, adesso = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const ora = `${d.getHours()}:${due(d.getMinutes())}`
  const stesso = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const elide = [1, 8, 11].includes(d.getHours())
  if (stesso(d, adesso)) return riempi(elide ? t('dall’{ora}') : t('dalle {ora}'), { ora })
  const ieri = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() - 1, 12)
  if (stesso(d, ieri)) return riempi(elide ? t('da ieri all’{ora}') : t('da ieri alle {ora}'), { ora })
  const giorno = giornoCorto(d)
  return riempi([1, 8, 11].includes(d.getDate()) ? t('dall’{giorno}') : t('dal {giorno}'), { giorno })
}

/** «A», «A e B», «A, B e C». */
export function elenco(nomi: string[]): string {
  if (nomi.length <= 1) return nomi[0] ?? ''
  return riempi(t('{a} e {b}'), { a: nomi.slice(0, -1).join(', '), b: nomi[nomi.length - 1] })
}

/** La frase del disco: una o più fonti, tutte ferme sull'accesso completo al disco. */
function fraseDisco(ms: Mancanza[], dopoImpostazioni: boolean): string {
  const nome = elenco(ms.map(m => m.nome))
  if (dopoImpostazioni) return riempi(t('Non riesco ancora a leggere {nome}. Se il permesso è già acceso, riapri Myynd.'), { nome })
  if (ms.every(m => m.dopoAggiornamento)) return riempi(t('Dall’aggiornamento non riesco a leggere {nome}: togli e rimetti Myynd in Accesso completo al disco.'), { nome })
  if (ms.every(m => m.motivo === 'incompleta')) return riempi(t('Leggo {nome} solo in parte: manca l’accesso completo al disco.'), { nome })
  return riempi(t('Non riesco a leggere {nome}: manca l’accesso completo al disco.'), { nome })
}

/** La frase di una fonte sola, per motivo e rimedio. */
function fraseUna(m: Mancanza, adesso: Date): string {
  const nome = m.nome
  switch (m.rimedio) {
    case 'accedi': return riempi(t('Devo accedere di nuovo a {nome}.'), { nome })
    case 'credenziale':
      return riempi(m.id === 'posta' ? t('{nome} non accetta più la password.')
        : m.id === 'calendario' ? t('{nome} non risponde più a quell’indirizzo.')
        : t('{nome} non accetta più il token.'), { nome })
    case 'amministratore': return riempi(t('{nome} aspetta il via libera del tuo amministratore.'), { nome })
    case 'apri-app': return riempi(t('Non trovo {nome} su questo Mac.'), { nome })
    case 'aggiorna': return riempi(t('Non so più leggere {nome}: a Myynd serve un aggiornamento.'), { nome })
    default:
      if (m.motivo === 'incompleta') return riempi(t('Leggo {nome} solo in parte.'), { nome })
      if (m.rimedio === 'attendi') return riempi(t('Non riesco a raggiungere {nome} {da}.'), { nome, da: da(m.dal, adesso) }).replace(/\s+\./, '.')
      return riempi(t('Non riesco a leggere {nome}.'), { nome })
  }
}

/**
 * La riga fissa: fino a tre frasi, e un controllo solo.
 *
 * Prima il motore che lavora (uscito dall'account, chiave rifiutata; o, senza
 * guai del motore, «Serve Claude…» come prima), poi le fonti, poi i titoli
 * delle finestre. Il controllo sistema la prima frase che ha un guaio: il
 * permesso del disco apre le Impostazioni (o riapre l'app, dopo il giro dalle
 * Impostazioni), l'account di Anthropic rientra da qui, tutto il resto porta
 * al pannello giusto delle Fonti. Mai «Riprova».
 *
 * Senza nessun guaio di P8 dà la stessa frase di `rigaDelleMancanze`.
 */
export function rigaFonti(o: {
  ragiona: boolean
  testa: { id: 'claude' | 'openai'; rimedio: 'accedi' | 'credenziale' } | null
  guastoLettura: string | null
  chiedeClaude: string
  mancanze: Mancanza[]
  titoliNegati: boolean
  dopoImpostazioni: boolean
  puoAprire: boolean
  puoRiavviare: boolean
  /** Il guscio sa aprire la schermata dell'Accessibilità (un guscio vecchio no). */
  puoAprireTitoli?: boolean
  adesso?: Date
}): { frase: string; controllo: Controllo } | null {
  const adesso = o.adesso ?? new Date()
  const frasi: string[] = []
  let controllo: Controllo | null = null
  const primo = (c: Controllo) => { if (!controllo) controllo = c }

  // 1. il motore
  if (o.testa) {
    const nomeTesta = o.testa.id === 'claude' ? 'Anthropic' : 'OpenAI'
    if (o.testa.rimedio === 'accedi') {
      frasi.push(o.testa.id === 'claude' ? t('Anthropic si è scollegato.') : riempi(t('Devo accedere di nuovo a {nome}.'), { nome: nomeTesta }))
      primo(o.testa.id === 'claude' ? { tipo: 'accedi-claude' } : { tipo: 'fonti', id: o.testa.id })
    } else {
      frasi.push(riempi(t('{nome} non accetta più la chiave.'), { nome: nomeTesta }))
      primo({ tipo: 'fonti', id: o.testa.id })
    }
  } else if (!o.ragiona) {
    frasi.push(t('Serve Claude per scegliere cosa conta.'))
    primo({ tipo: 'fonti', id: null })
  }

  // 2. le fonti: una lettura a mano fallita prende il posto dell'elenco, come prima
  const guasto = o.guastoLettura === o.chiedeClaude ? null : o.guastoLettura
  if (guasto) {
    frasi.push(guasto)
    primo({ tipo: 'fonti', id: null })
  } else if (o.mancanze.length) {
    const disco = o.mancanze.every(m => m.rimedio === 'permesso-disco')
    if (disco) {
      frasi.push(fraseDisco(o.mancanze, o.dopoImpostazioni))
      if (o.puoAprire) primo(o.dopoImpostazioni && o.puoRiavviare ? { tipo: 'riapri' } : { tipo: 'impostazioni' })
    } else if (o.mancanze.length === 1) {
      frasi.push(fraseUna(o.mancanze[0], adesso))
    } else {
      frasi.push(riempi(t('Non ho letto tutto: {elenco}.'), { elenco: elenco(o.mancanze.map(m => m.nome)) }))
    }
    primo({ tipo: 'fonti', id: o.mancanze.length === 1 ? o.mancanze[0].id : null })
  }

  // 3. i titoli delle finestre
  if (o.titoliNegati) {
    frasi.push(t('Non vedo i titoli delle finestre: manca il permesso di Accessibilità.'))
    primo(o.puoAprire && o.puoAprireTitoli ? { tipo: 'accessibilita' } : { tipo: 'fonti', id: null })
  }

  if (!frasi.length || !controllo) return null
  return { frase: frasi.map(maiuscola).join(' '), controllo }
}

/** La causa, come la dice il pannello di una fonte. */
function causa(m: Pick<Mancanza, 'id' | 'motivo' | 'rimedio'>): string {
  if (m.motivo === 'incompleta' && (m.rimedio === 'attendi' || m.rimedio === 'guarda')) return t('si legge solo in parte')
  switch (m.rimedio) {
    case 'permesso-disco': return t('manca l’accesso completo al disco')
    case 'accedi': return t('serve un nuovo accesso')
    case 'credenziale':
      return m.id === 'posta' ? t('la password non va più')
        : m.id === 'calendario' ? t('l’indirizzo non va più')
        : m.id === 'claude' || m.id === 'openai' ? t('la chiave non va più')
        : t('il token non va più')
    case 'amministratore': return t('aspetta il via libera del tuo amministratore')
    case 'apri-app': return t('non si trova su questo Mac')
    case 'aggiorna': return t('a Myynd serve un aggiornamento')
    case 'attendi': return t('non risponde più')
    default: return t('non si legge')
  }
}

/** La riga di stato nel pannello: «Da ieri alle 9:41: la password non va più.» */
export function lineaPannello(m: Mancanza, adesso = new Date()): string {
  const quando = m.dopoAggiornamento ? t('dall’aggiornamento') : da(m.dal, adesso)
  return `${maiuscola(quando)}: ${causa(m)}.`
}

/**
 * Il silenzio, sulla scheda: un fatto, non un guasto.
 *
 * Chi porta arrivi dice da quanti giorni non arriva niente; chi porta
 * l'inventario intero (il calendario, le Note, Granola dalla cache) dice
 * quanti ne ha trovati l'ultima lettura.
 */
export function lineaSilenzio(id: string, s: Silenzio): string {
  if (s.forma === 'inventario' && ['calendario', 'agendamac', 'note', 'granola'].includes(id)) {
    const [zero, uno, tanti] = id === 'calendario' || id === 'agendamac'
      ? ['Nessun evento nell’ultima lettura', 'Solo un evento nell’ultima lettura', 'Solo {n} eventi nell’ultima lettura']
      : id === 'note'
        ? ['Nessuna nota nell’ultima lettura', 'Solo una nota nell’ultima lettura', 'Solo {n} note nell’ultima lettura']
        : ['Nessuna riunione nell’ultima lettura', 'Solo una riunione nell’ultima lettura', 'Solo {n} riunioni nell’ultima lettura']
    return s.n === 0 ? t(zero) : s.n === 1 ? t(uno) : riempi(t(tanti), { n: s.n })
  }
  const n = Math.max(0, s.giorni)
  const frase = id === 'posta' || id === 'postamac' ? 'Ultima mail {n} giorni fa'
    : id === 'slack' || id === 'whatsapp' ? 'Ultimo messaggio {n} giorni fa'
    : id === 'granola' ? 'Ultima riunione {n} giorni fa'
    : id === 'desktop' ? 'Ultimo file {n} giorni fa'
    : 'Ultimo arrivo {n} giorni fa'
  return riempi(t(frase), { n })
}

export type Cella = { giorno: string; stato: 'pulito' | 'guasto' | 'spento'; oggi: boolean; titolo: string }

/**
 * I trenta giorni di una fonte, una cella ciascuno, dal più vecchio a oggi.
 *
 * Un giorno muto è verde: il silenzio non è un guasto.
 */
export function striscia(r: RispostaSalute, fonte: string): Cella[] {
  const ultimo = r.giorni[r.giorni.length - 1]?.giorno
  return r.giorni.map(g => {
    const v = g.fonti.find(f => f.fonte === fonte)?.verdetto
    const stato: Cella['stato'] = v === 'guasto' ? 'guasto' : v === 'pulito' || v === 'muto' ? 'pulito' : 'spento'
    const [a, m, d] = g.giorno.split('-').map(Number)
    const giorno = giornoCorto(new Date(a, m - 1, d, 12))
    const titolo = riempi(stato === 'pulito' ? t('{giorno}: senza guai') : stato === 'guasto' ? t('{giorno}: un guaio') : t('{giorno}: non letta'), { giorno })
    return { giorno: g.giorno, stato, oggi: g.giorno === ultimo, titolo }
  })
}

/** «28 giorni su 29 senza guai»: `null` finché i giorni misurati sono meno di due. */
export function record(celle: Cella[]): string | null {
  const misurate = celle.filter(c => c.stato !== 'spento')
  if (misurate.length < 2) return null
  const n = misurate.filter(c => c.stato === 'pulito').length
  const m = misurate.length
  return n === 0 ? riempi(t('Nessun giorno su {m} senza guai'), { m })
    : n === 1 ? riempi(t('Un giorno su {m} senza guai'), { m })
    : riempi(t('{n} giorni su {m} senza guai'), { n, m })
}

/** I guai che la pagina sta mostrando: le fonti visibili e il motore che lavora, id → rimedio. */
export function problemiVisibili(s: Stato): Map<string, string> {
  const fuori = new Map<string, string>()
  for (const f of s.letturaIncompleta ?? []) fuori.set(f.fonte, f.rimedio ?? (f.motivo === 'incompleta' ? 'attendi' : 'guarda'))
  if (s.testa) fuori.set(s.testa.id, s.testa.rimedio)
  return fuori
}

/**
 * Chi è collegato e sano, per `ripresi`: una fonte scollegata non «si
 * riprende», e nemmeno Anthropic quando la pagina smette di dirlo solo perché
 * adesso lavora un altro motore (il suo connettore ha ancora il guaio).
 */
export function saniDi(s: Stato): Set<string> {
  return new Set(s.connettori.filter(c => c.collegato && !c.problema).map(c => c.id))
}

/** Chi aveva un guaio e adesso no, ed è ancora collegato: una fonte scollegata non «si riprende». */
export function ripresi(prima: Map<string, string> | null, dopo: Map<string, string>, collegati: Set<string>): string[] {
  if (!prima) return []
  return [...prima.keys()].filter(id => !dopo.has(id) && collegati.has(id))
}

/** I guai nuovi fra due stati; al primo caricamento niente, perché niente è «nuovo». */
export function nuoviGuai(prima: Map<string, string> | null, dopo: Map<string, string>): string[] {
  if (!prima) return []
  return [...dopo.keys()].filter(id => !prima.has(id))
}

/** Le fonti della riga, col nome della loro scheda, dallo stato. */
export function mancanzeDi(s: Stato): Mancanza[] {
  return (s.letturaIncompleta ?? []).map(f => ({
    id: f.fonte,
    nome: nomeInFrase(f.fonte, s.connettori.find(c => c.id === f.fonte)?.nome ?? f.fonte),
    motivo: f.motivo,
    rimedio: f.rimedio ?? (f.motivo === 'incompleta' ? 'attendi' : 'guarda'),
    dal: f.dal ?? '',
    dopoAggiornamento: !!f.dopoAggiornamento
  }))
}

/**
 * La parola della scheda con un guaio, al posto di «Collegato».
 *
 * Il permesso del disco è «Serve l’accesso» come per le Note da sempre; un
 * nuovo accesso ad Anthropic è «Accedi di nuovo», il bottone che servirà;
 * password, token e il via libera dell'amministratore sono «Da sistemare»;
 * tutto il resto «Non letta». Il credito non è mai un guaio di scheda.
 */
export function parolaProblema(id: string, r: Rimedio): string {
  switch (r) {
    case 'permesso-disco': return t('Serve l’accesso')
    case 'accedi': return id === 'claude' ? t('Accedi di nuovo') : t('Serve l’accesso')
    case 'credenziale': case 'amministratore': return t('Da sistemare')
    default: return t('Non letta')
  }
}
