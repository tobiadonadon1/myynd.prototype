// Il gusto: cosa impara Myynd da quello che apri e da quello che butti via.
//
// La rassegna, da sola, indovina. Sa quello che gli hai scritto negli argomenti
// — se gliel'hai scritto — e per il resto sceglie con il buon senso di un
// modello che non ti conosce. Ma ogni mattina tu fai due gesti che valgono più
// di qualunque frase: apri una notizia, e ne butti via un'altra. Quelli sono
// dati veri, non dichiarazioni; e la differenza fra quello che uno dice di
// voler leggere e quello che legge davvero è il motivo per cui esiste questo
// file.
//
// Due regole, e sono quelle che tengono in piedi la cosa:
//
//   · **inclina, non filtra.** Il gusto sposta l'ordine, non chiude la porta.
//     Una rassegna che ti dà solo quello che hai già letto smette di dirti
//     qualcosa il terzo giorno, e nessuno se ne accorge dall'interno — sembra
//     solo che il mondo si sia fatto noioso. Il giro fra gli argomenti in
//     `rassegna.ts` resta il primo criterio: prima si copre il mondo, poi
//     dentro ogni argomento vince quello che ti somiglia.
//   · **serve una prova.** Sotto una manciata di gesti non si conclude niente.
//     Tre letture non sono un gusto, sono tre letture, e costruirci sopra un
//     profilo vuol dire inseguire il rumore.
//
// Non costa niente: sono conteggi su righe che stanno già nell'indice. Nessuna
// chiamata a un modello per sapere cosa ti piace — quello che si manda al
// modello, quando c'è, sono due elenchi di parole.
//
// E poi c'è la seconda prova, che è arrivata dopo e conta di più: **quello che
// fa**. Aprire e buttare via una notizia resta un gesto che nessuno è obbligato
// a fare, e per chi non lo fa qui non si concludeva niente. Quello che ha in
// lista, quello che ha chiuso, i progetti vivi e le domande che fa sono lì da
// sempre e dicono di lui più di una rassegna: `evidenzaDalLavoro` li mette in
// un blocco solo, e da quel blocco si scrivono tutti e due i campi che
// restavano vuoti per sempre — gli argomenti e il fuoco.

import db from './store.ts'
import * as store from './store.ts'
import * as progetti from './progetti.ts'
import { fuoco, scriviFuoco } from './timone.ts'
import { aggiorna, leggi, nellaLingua } from './config.ts'
import { chiediJSON } from './modello.ts'

/** Sotto questi gesti non si conclude niente: sarebbe rumore. */
export const MINIMO = 6

/** Quante parole si tengono per parte. Poche: sono un suggerimento, non un filtro. */
const QUANTE_PAROLE = 12

/** Il peso massimo che il gusto può avere nella scelta a mano. */
const TETTO = 6

/**
 * Le parole che non dicono niente di cosa ti piace.
 *
 * Non è un elenco di stop-word linguistiche: è l'elenco delle parole che
 * *ricorrono nei titoli di giornale* in ogni argomento. «Dice», «nuovo»,
 * «dopo» stanno ovunque, quindi non distinguono niente — e se restassero
 * dentro, il gusto imparerebbe che ti piacciono i titoli.
 */
const VUOTE = new Set([
  'dice', 'dopo', 'come', 'anche', 'ancora', 'contro', 'senza', 'primo', 'prima',
  'nuovo', 'nuova', 'nuove', 'nuovi', 'oggi', 'anni', 'anno', 'oltre', 'verso',
  'says', 'said', 'after', 'with', 'from', 'that', 'this', 'they', 'will', 'more',
  'over', 'into', 'about', 'than', 'been', 'have', 'what', 'when', 'here', 'just',
  'first', 'could', 'would', 'their', 'there', 'these', 'those', 'other', 'still',
  'live', 'updates', 'news', 'report', 'says:', 'video', 'watch', 'best', 'make'
])

function parole(testo: string): string[] {
  return testo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(p => p.length >= 4 && !VUOTE.has(p))
}

export type Gusto = {
  /** Vero quando i gesti bastano a concludere qualcosa. */
  vale: boolean
  lette: number
  scartate: number
  /** Le parole che ricorrono in quello che apri, dalle più forti. */
  piace: string[]
  /** Quelle che ricorrono in quello che butti via, e in nient'altro. */
  stufa: string[]
  /** I giornali che apri più spesso di quanto li scarti. */
  fonti: string[]
}

/**
 * Cosa si può concludere, adesso, da quello che è successo.
 *
 * Una parola finisce in `piace` se compare in quello che apri; finisce in
 * `stufa` solo se compare in quello che butti **e non** in quello che apri —
 * altrimenti «Iran» diventerebbe insieme un pregio e un difetto, e le due cose
 * si annullerebbero in silenzio.
 */
export function gusto(giorni = 30): Gusto {
  const tutte = store.notiziePerGusto(giorni)
  const lette = tutte.filter(n => n.letta)
  const scartate = tutte.filter(n => n.scartata)

  const conta = (righe: typeof tutte) => {
    const m = new Map<string, number>()
    for (const n of righe) for (const p of parole(n.titolo)) m.set(p, (m.get(p) ?? 0) + 1)
    return m
  }
  const buone = conta(lette)
  const cattive = conta(scartate)

  const inOrdine = (m: Map<string, number>, escludi?: Map<string, number>) =>
    [...m.entries()]
      .filter(([p, n]) => n >= 2 && !escludi?.has(p))
      .sort((a, b) => b[1] - a[1])
      .slice(0, QUANTE_PAROLE)
      .map(([p]) => p)

  // i giornali: quelli che apri più di quanto li butti, e almeno due volte
  const perFonte = new Map<string, { su: number; giu: number }>()
  for (const n of lette) {
    const v = perFonte.get(n.fonte) ?? { su: 0, giu: 0 }
    v.su++
    perFonte.set(n.fonte, v)
  }
  for (const n of scartate) {
    const v = perFonte.get(n.fonte) ?? { su: 0, giu: 0 }
    v.giu++
    perFonte.set(n.fonte, v)
  }

  return {
    vale: lette.length + scartate.length >= MINIMO && (lette.length >= 2 || scartate.length >= 3),
    lette: lette.length,
    scartate: scartate.length,
    piace: inOrdine(buone),
    stufa: inOrdine(cattive, buone),
    fonti: [...perFonte.entries()]
      .filter(([, v]) => v.su >= 2 && v.su > v.giu)
      .sort((a, b) => (b[1].su - b[1].giu) - (a[1].su - a[1].giu))
      .slice(0, 4)
      .map(([f]) => f)
  }
}

/**
 * Quanto una notizia somiglia a quello che leggi.
 *
 * Positivo tira verso l'alto, negativo verso il basso, e il valore è tagliato
 * a `TETTO` da tutte e due le parti: senza il tetto, un titolo che azzecca sei
 * parole del profilo scavalcherebbe qualunque cosa sia successa nel mondo
 * stamattina, che è il modo in cui una rassegna diventa una camera d'eco.
 */
export function affinita(g: Gusto, titolo: string, fonte: string): number {
  if (!g.vale) return 0
  const dentro = new Set(parole(titolo))
  let punti = 0
  for (const p of g.piace) if (dentro.has(p)) punti += 2
  for (const p of g.stufa) if (dentro.has(p)) punti -= 2
  if (g.fonti.includes(fonte)) punti += 1
  return Math.max(-TETTO, Math.min(TETTO, punti))
}

/**
 * Il gusto come si racconta al modello.
 *
 * Vuoto quando non c'è ancora abbastanza per dire qualcosa — e allora nel
 * prompt non compare proprio, invece di comparire come «non so niente di lei»,
 * che è una riga che il modello prende comunque per buona e che non aiuta.
 */
export function perIlModello(g: Gusto): string {
  if (!g.vale) return ''
  const parti: string[] = []
  if (g.piace.length) parti.push(`Apre volentieri notizie su: ${g.piace.join(', ')}.`)
  if (g.stufa.length) parti.push(`Ha buttato via, senza mai aprirne una, notizie su: ${g.stufa.join(', ')}.`)
  if (g.fonti.length) parti.push(`Legge più spesso: ${g.fonti.join(', ')}.`)
  parti.push(
    'Usalo per ordinare soltanto le notizie pertinenti al lavoro attuale. ' +
    'Non riempire la selezione con cronaca generica e non ripetere un fatto già scartato.'
  )
  return parti.join(' ')
}

/**
 * Il gusto come si racconta a lei.
 *
 * Sta nelle preferenze, accanto al campo degli argomenti, e serve a una cosa
 * sola: vedere cosa Myynd ha concluso sul suo conto. Un profilo che ti
 * influenza la prima pagina e che non puoi né vedere né contraddire è
 * esattamente la cosa che questa app dice di non voler essere.
 */
export function inParole(g: Gusto, en: boolean): string {
  if (!g.vale) {
    return en
      ? 'Not enough yet: read a few and I will start to notice what you go for.'
      : 'Non basta ancora: aprine qualcuna e comincio a notare cosa scegli.'
  }
  const parti: string[] = []
  if (g.piace.length) {
    parti.push((en ? 'You open: ' : 'Apri: ') + g.piace.slice(0, 6).join(', '))
  }
  if (g.fonti.length) {
    parti.push((en ? 'mostly from ' : 'soprattutto da ') + g.fonti.join(', '))
  }
  if (g.stufa.length) {
    parti.push((en ? 'you skip: ' : 'salti: ') + g.stufa.slice(0, 4).join(', '))
  }
  return parti.join(' · ')
}

// — la prova che sta in quello che fa —

/**
 * Quello che fa, non quello che legge.
 *
 * I due gesti della rassegna sono dati veri, ma sono anche gli unici che
 * questo file guardava — e c'è chi la rassegna non la tocca. «Se clicco su
 * Fatto o Non mi interessa è una cosa che non dovrei fare: Myynd deve
 * imparare dalle mie cose da fare». Ha ragione, e il materiale c'è già:
 * quello che si è scritto in lista, quello che ha chiuso, i progetti che
 * porta avanti e le cose che chiede in chat. Sono il ritratto più onesto di
 * cosa gli interessa che esista dentro quest'app, e fin qui non arrivava
 * dove serviva.
 *
 * Torna un blocco di testo compatto, non un oggetto da rigirare: serve a una
 * cosa sola — finire dentro un prompt — e i due posti che lo usano lo usano
 * uguale.
 */

/** Quante cose sue bastano per concludere qualcosa. Stessa soglia dei gesti. */
const QUANTE_COSE = MINIMO

/** Il tetto per parte: oltre, non è più «su cosa sta lavorando», è un archivio. */
const QUANTI_COMPITI = 40
const QUANTE_DOMANDE = 40

const taglia = (t: string, n: number) => {
  const pulito = t.replace(/\s+/g, ' ').trim()
  return pulito.length > n ? pulito.slice(0, n - 1) + '…' : pulito
}

/**
 * Le ultime cose che ha chiesto, dalle più recenti.
 *
 * Solo le sue: le risposte di Myynd sono parole di Myynd, e imparare i propri
 * argomenti dalle proprie risposte è il modo più diretto di girare in tondo.
 * `ruolo = 'u'` è come le scrive `salvaMessaggio`.
 */
function ultimeDomande(quante = QUANTE_DOMANDE): string[] {
  const righe = db.prepare(
    "SELECT testo FROM messaggi WHERE ruolo = 'u' ORDER BY quando DESC, rowid DESC LIMIT ?"
  ).all(quante) as { testo: string }[]
  return righe.map(r => taglia(String(r.testo ?? ''), 160)).filter(Boolean)
}

export type Evidenza = {
  /** Vero quando c'è abbastanza roba sua per concludere qualcosa. */
  vale: boolean
  /** Quante cose si sono guardate in tutto: compiti, progetti, domande. */
  quante: number
  /** Il blocco già pronto per il prompt. Vuoto quando non vale. */
  testo: string
}

/**
 * Il blocco di evidenza: la lista, i progetti, quello che chiede.
 *
 * Niente modello, niente rete: sono tre query su tabelle che stanno già lì. Il
 * costo di questa funzione è il costo di aprire la lista.
 */
export function evidenzaDalLavoro(giorni = 30): Evidenza {
  const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString()

  const tutti = progetti.elenco()
  const nomeDi = new Map(tutti.map(p => [p.id, p.nome]))
  const vivi = tutti.filter(p => p.stato === 'attivo')

  const riga = (c: { testo: string; nota: string | null; progetto?: string | null }) => {
    const nome = c.progetto ? nomeDi.get(c.progetto) : ''
    return '· ' + [
      taglia(c.testo, 120),
      c.nota ? taglia(c.nota, 120) : '',
      nome ? `[${taglia(nome, 40)}]` : ''
    ].filter(Boolean).join(' — ')
  }

  const aperti = store.elencoCompiti().filter(c => ['mano', 'voce', 'chat', 'feed'].includes(c.origine)).slice(0, QUANTI_COMPITI)
  const chiusi = store.compitiChiusi(QUANTI_COMPITI).filter(c => c.stato === 'fatto' && (c.chiuso ?? '') >= soglia)
  const domande = ultimeDomande()

  const quante = aperti.length + chiusi.length + vivi.length + domande.length

  const parti: string[] = []
  if (aperti.length) parti.push('Ha in lista adesso:\n' + aperti.map(riga).join('\n'))
  if (chiusi.length) parti.push('Ha chiuso di recente:\n' + chiusi.map(riga).join('\n'))
  if (vivi.length) {
    parti.push('Progetti vivi:\n' + vivi.slice(0, 12)
      .map(p => `· ${taglia(p.nome, 60)}${p.obiettivo ? ` — ${taglia(p.obiettivo, 140)}` : ''}`)
      .join('\n'))
  }
  if (domande.length) parti.push('Ultime cose che ha chiesto a Myynd:\n' + domande.map(d => `· ${d}`).join('\n'))

  const vale = quante >= QUANTE_COSE
  return { vale, quante, testo: vale ? parti.join('\n\n') : '' }
}

// — dagli argomenti che non scrive nessuno a quelli che si scrivono da soli —

/**
 * Perché questa parte esiste.
 *
 * Il campo degli argomenti è vuoto quasi sempre, e resta vuoto per sempre. Non
 * è pigrizia di chi usa l'app: è che «su cosa vuoi essere tenuto aggiornato?»
 * è una domanda difficile da rispondere in astratto, davanti a una casella di
 * testo, prima di aver visto una sola rassegna. La risposta però esiste già —
 * la scrive lui ogni mattina aprendo una notizia e buttandone via un'altra — e
 * fin qui quella risposta serviva soltanto a inclinare l'ordine dei titoli.
 *
 * Da qui in poi la scrive anche nel campo, e la tiene aggiornata.
 *
 * **La regola che tiene in piedi la cosa: si scrive solo dove non c'è già
 * qualcosa di suo.** Se ha scritto lui, quel campo è suo e non si tocca mai
 * più — al massimo gli si offre un'aggiunta, che accetta con un clic. È la
 * stessa regola di `ottimizza` sulle automazioni, e per lo stesso motivo: una
 * cosa che riscrive quello che hai scritto tu, senza che tu l'abbia chiesto,
 * non è un aiuto.
 */

const FORMA_ARGOMENTI = {
  type: 'object',
  properties: {
    argomenti: {
      type: 'string',
      description:
        'Da tre a otto argomenti separati da virgola, come li scriverebbe una persona: ' +
        '«mercati e tassi, politica estera, intelligenza artificiale». Non parole sciolte, ' +
        'non un elenco di nomi propri, nessun trattino e nessun elenco puntato. ' +
        'Vuoto se da questo materiale non si capisce niente.'
    }
  },
  required: ['argomenti'],
  additionalProperties: false
} as const

/**
 * Le parole che ricorrono, dette come argomenti.
 *
 * Le parole crude di `piace` non si possono mettere in quel campo così come
 * sono: sono i pezzi dei titoli che ha aperto — «tassi», «borsa», «openai» —
 * e messe in fila descrivono le notizie di ieri, non un interesse. La
 * differenza fra «openai, nvidia, chip» e «intelligenza artificiale e chi la
 * fa» è che la seconda continua a valere il mese prossimo.
 *
 * Passa da un modello, ma dal più economico che c'è: è un lavoro di riscrittura
 * su dodici parole, non un giudizio, e gira una volta al giorno.
 */
export async function inArgomenti(g: Gusto = gusto(), e: Evidenza = evidenzaDalLavoro()): Promise<string> {
  const daiTitoli = g.vale && g.piace.length >= 3
  if (!daiTitoli && !e.vale) return ''

  const detto: string[] = []
  if (daiTitoli) detto.push(`Apre notizie con dentro: ${g.piace.join(', ')}`)
  if (e.vale) detto.push(`Quello che fa davvero:\n\n${e.testo}`)

  const r = await chiediJSON<{ argomenti: string }>({
    lavoro: 'ritratto',
    max_tokens: 300,
    system:
      `Scrivi in ${nellaLingua()}.\n\n` +
      'Qui sotto c\'è quello che una persona apre nei giornali e, soprattutto, quello su ' +
      'cui lavora davvero: le cose che ha in lista, quelle che ha chiuso, i progetti che ' +
      'porta avanti e le domande che fa. Non descrivere il materiale: di\' di che cosa si ' +
      'interessa, con le sue parole, in modo che valga anche il mese prossimo.\n\n' +
      'Gli argomenti sono quello su cui lavora e quello che chiede, non quello che gli ' +
      'capita davanti. Da tre a otto, separati da virgola, minuscoli, brevi. Nessun ' +
      'trattino, nessun elenco puntato, una riga sola. Niente nomi di testate e niente ' +
      'nomi propri di cronaca — quelli passano, gli argomenti restano; il nome di un suo ' +
      'progetto invece può restare, se è quello di cui si occupa.\n\n' +
      'Se da questo materiale non si capisce un interesse, torni una stringa vuota: è una ' +
      'risposta buona, non un fallimento.',
    formato: FORMA_ARGOMENTI,
    messages: [{ role: 'user', content: detto.join('\n\n') }]
  })
  return pulisciElenco(r?.argomenti ?? '').slice(0, 400)
}

/**
 * Una riga di argomenti, non un elenco.
 *
 * Un modello piccolo a cui si chiede «separati da virgola» risponde comunque
 * con dei trattini a capo una volta su cinque, e quella roba finisce dentro un
 * campo di testo alto una riga: si vede mezza parola e sembra rotto. Costa
 * quattro righe raddrizzarla qui invece di sperarci nel prompt.
 */
function pulisciElenco(t: string): string {
  const voci = t
    .split(/[\n,;•]+/)
    .map(v => v.replace(/^\s*[-–—*·\d.)]+\s*/, '').trim())
    .filter(Boolean)
  return voci.slice(0, 8).join(', ')
}

/** Quanto spesso ci si riprova, quando è Myynd a tenere il campo. */
const OGNI_QUANTO = 20 * 3600_000

/**
 * Tiene il campo aggiornato, se è suo da tenere.
 *
 * Tre cancelli prima di spendere un token, e sono tutti e tre necessari:
 * abbastanza gesti per concludere qualcosa, il campo libero o già suo, e non
 * più di una volta al giorno. Senza il terzo questa funzione girerebbe a ogni
 * rassegna — quattro volte al giorno — per riscrivere quasi sempre la stessa
 * riga.
 *
 * Torna quello che ha scritto, o `null` se non ha toccato niente.
 */
export async function tieniAggiornati(adesso = Date.now()): Promise<string | null> {
  const c = leggi()
  const mio = c.argomentiDaMe === true
  const vuoto = !(c.argomenti ?? '').trim()
  // scritto da lei: è suo, e non si tocca. La proposta resta disponibile
  // altrove, per chi la vuole — ma qui non si scrive niente.
  if (!vuoto && !mio) return null

  const ultima = c.imparato?.argomenti
  if (mio && ultima && adesso - Date.parse(ultima) < OGNI_QUANTO) return null

  /*
   * Due prove, e ne basta una.
   *
   * Prima c'era solo la rassegna, e per chi non la apre quel campo restava
   * vuoto per sempre: si imparava soltanto da un gesto che non deve essere
   * obbligatorio fare. Quello che ha in lista e quello che chiede sono
   * materiale almeno altrettanto buono — e quando ci sono tutti e due, al
   * modello vanno tutti e due.
   */
  const g = gusto()
  const e = evidenzaDalLavoro()
  if (!g.vale && !e.vale) return null

  const testo = await inArgomenti(g, e)
  if (!testo || testo === (c.argomenti ?? '').trim()) return null

  aggiorna({
    argomenti: testo,
    argomentiDaMe: true,
    imparato: { ...leggi().imparato, argomenti: new Date(adesso).toISOString() }
  })
  return testo
}

/**
 * Cosa scriverebbe, senza scriverlo.
 *
 * Serve al caso opposto: il campo l'ha scritto lei, quindi non si tocca, ma
 * quello che legge dice qualcos'altro. Qui la proposta si può mostrare accanto
 * al campo e si accetta con un dito — che è l'unica forma in cui una macchina
 * può correggere quello che hai scritto tu senza toglierti niente.
 */
export async function proposta(): Promise<string> {
  const g = gusto()
  const e = evidenzaDalLavoro()
  if (!g.vale && !e.vale) return ''
  return await inArgomenti(g, e)
}

// — il fuoco, scritto da quello che ha in mano —

/**
 * L'altro campo che nessuno compila.
 *
 * Il fuoco dice a Myynd dove guardare *dentro* — nella posta, nei file, negli
 * incontri — e l'intervista lo chiede una volta sola, all'inizio, quando la
 * risposta giusta uno non ce l'ha ancora. Poi resta vuoto, e il feed continua
 * a scegliere senza sapere cosa conta questa settimana.
 *
 * La risposta però è scritta nella sua lista: le cose aperte e i progetti vivi
 * *sono* quello che conta adesso. Qui si legge quello, si scrive una riga, e
 * la si firma — così lui la vede, e se non torna la corregge.
 *
 * Stessa regola degli argomenti, e senza eccezioni: se quella riga l'ha
 * scritta lui, non si tocca mai più.
 */

const FORMA_FUOCO = {
  type: 'object',
  properties: {
    fuoco: {
      type: 'string',
      description:
        'Una frase sola, piana, al massimo diciotto parole: su cosa deve guardare adesso ' +
        'dentro il suo materiale — posta, file, incontri. Niente elenchi, niente trattini, ' +
        'niente due punti. Vuota se dalla lista non si capisce una direzione.'
    }
  },
  required: ['fuoco'],
  additionalProperties: false
} as const

/** Due frasi uguali a meno di maiuscole, accenti e punteggiatura sono la stessa frase. */
const spoglia = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Scrive il fuoco da quello che ha in lista, una volta al giorno.
 *
 * I cancelli sono gli stessi di `tieniAggiornati`, e il terzo è più stretto:
 * la data si segna a ogni tentativo, non solo quando va a buon fine. Segnarla
 * solo in caso di successo vuol dire che un modello che non risponde diventa
 * quattro chiamate al giorno per sempre — il genere di difetto che non si vede
 * da nessuna parte tranne che sulla bolletta.
 *
 * Torna la frase scritta, o `null` se non ha toccato niente.
 */
export async function imparaIlFuoco(adesso = Date.now()): Promise<string | null> {
  const c = leggi()
  const mio = c.fuocoDaMe === true
  const attuale = fuoco().trim()
  // l'ha scritto lui: è suo, e non si tocca più — nemmeno quando la lista cambia
  if (attuale && !mio) return null

  const ultima = c.imparato?.fuoco
  if (ultima && adesso - Date.parse(ultima) < OGNI_QUANTO) return null

  const e = evidenzaDalLavoro()
  if (!e.vale) return null

  // la data prima della domanda: qualunque cosa risponda, oggi non si richiede
  aggiorna({ imparato: { ...leggi().imparato, fuoco: new Date(adesso).toISOString() } })

  const r = await chiediJSON<{ fuoco: string }>({
    lavoro: 'ritratto',
    max_tokens: 200,
    system:
      `Scrivi in ${nellaLingua()}.\n\n` +
      'Qui sotto c\'è quello che una persona ha in lista adesso e i progetti che porta ' +
      'avanti. Scrivi una frase sola che dica su cosa Myynd deve concentrarsi dentro il ' +
      'suo materiale — la posta, i file, gli incontri — perché quello che ha in mano vada ' +
      'avanti.\n\n' +
      'Massimo diciotto parole. Una frase piana, come la direbbe lui a voce: nessun ' +
      'elenco, nessun trattino, nessun due punti. Nomina i progetti e le cose vere che ' +
      'leggi qui sotto, con il loro nome — «i preventivi per Rossi e il lancio di Myynd» ' +
      'vale, «le tue priorità» non vale niente.\n\n' +
      'Se dalla lista non si capisce una direzione, torni una stringa vuota: è una ' +
      'risposta buona, non un fallimento.',
    formato: FORMA_FUOCO,
    messages: [{ role: 'user', content: e.testo }]
  })

  const testo = (r?.fuoco ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)
  if (!testo || spoglia(testo) === spoglia(attuale)) return null

  scriviFuoco(testo)
  aggiorna({ fuocoDaMe: true })
  return testo
}
