// I suggerimenti: le automazioni che non si è ancora scritto.
//
// Prima erano cinque modelli scritti a mano — «fatture», «riunioni»,
// «preventivi» — appesi a una parola nel titolo dei documenti. Funzionavano
// come funziona un oroscopo: la frase era vera per chiunque, e proprio per
// questo non parlava di nessuno. Chi la leggeva non capiva *cosa* gli stesse
// proponendo, perché la proposta non nominava niente di suo.
//
// Adesso la scrive il modello, e la scrive **guardando il materiale vero**:
// gli attrezzi collegati, i documenti arrivati, le righe ancora aperte, i
// progetti, il fuoco. La regola che tiene in piedi la differenza sta nel
// prompt e si controlla a occhio: `spiega` deve **nominare la roba che ha
// davanti**. «Ogni mattina, le fatture di Aruba e Fastweb dalla posta nella
// lista di oggi» è una proposta; «unisci due cose» non lo è.
//
// E costa. Per questo si chiama **al massimo una volta al giorno per conto**,
// con la risposta su un foglio accanto agli altri: aprire la schermata non
// paga niente finché quel foglio ha meno di ventiquattro ore. Il giro si rifà
// solo se lo chiede lei, con il bottone.
//
// Senza modello collegato resta la strada di prima — i cinque modelli, sulle
// prove che ci sono nell'indice — perché una schermata che non propone mai
// niente non insegna a nessuno che le automazioni esistono. Ma anche lì la
// frase adesso nomina la fonte e il conto, invece di raccontare.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as store from './store.ts'
import * as attrezzi from './attrezzi.ts'
import * as auto from './automazioni.ts'
import * as progetti from './progetti.ts'
import { cartella, leggi, lingua, nellaLingua, tono, autonomia } from './config.ts'
import { fuoco } from './timone.ts'
import { chiediJSON, collegato } from './modello.ts'
import { senzaTrattini } from './testo.ts'

/**
 * Una proposta, con dentro tutto quello che servirà a scriverla davvero.
 *
 * `quando`, `guarda`, `attrezzi` e `metti` sono i campi di una ricetta vera:
 * `adotta()` non li reinventa con dei valori fissi — se la scheda dice «ogni
 * lunedì alle 17», accendendola gira il lunedì alle 17.
 */
export type Suggerimento = {
  id: string
  nome: string
  spiega: string
  /** Quante prove ci sono nell'indice: si vede solo nel dettaglio. */
  quanti: number
  esempi: string[]
  attrezzi: string[]
  quando: auto.Quando
  guarda: { cerca?: string; soloNuovi?: boolean; limite?: number }
  metti: { inLista: 'oggi' | 'settimana' | 'poi'; modo?: 'io' | 'bozza' | 'tutto' | 'prompt' }
}

const SECCHI = ['oggi', 'settimana', 'poi']
const MODI = ['io', 'bozza', 'tutto', 'prompt']

// — la strada senza modello: i cinque modelli di sempre —

/** La frase di una proposta: il conto delle prove e dove le ha viste. */
type Frase = (quanti: number, dove: string) => string
type Modello = {
  id: string
  pattern?: RegExp
  fonti?: string[]
  minimo?: number
  it: [string, Frase]
  en: [string, Frase]
}

const MODELLI: Modello[] = [
  { id: 'invoices', pattern: /\b(invoice|fattura|fatture|billing)\b/i,
    it: ['Fatture sotto controllo',
      (n, dove) => `Ogni mattina, le ${n} fatture viste ${dove} vanno in lista con importo, fornitore e scadenza.`],
    en: ['Invoices, taken care of',
      (n, dove) => `Every morning, the ${n} invoices seen ${dove} go into your list with amount, supplier and due date.`] },
  { id: 'meetings', pattern: /\b(meeting|riunione|riunioni|verbale|minutes)\b/i,
    it: ['Dalle riunioni ai prossimi passi',
      (n, dove) => `Ogni mattina, dalle ${n} note di riunione ${dove} tiro fuori decisioni, responsabili e prossimi passi.`],
    en: ['Meetings into next steps',
      (n, dove) => `Every morning, from the ${n} meeting notes ${dove} I pull out decisions, owners and next steps.`] },
  { id: 'proposals', pattern: /\b(proposal|quote|preventivo|preventivi|quotation)\b/i,
    it: ['Preventivi da seguire',
      (n, dove) => `Ogni mattina, i ${n} preventivi ${dove} vanno in lista con il prossimo passo di ciascuno.`],
    en: ['Keep proposals moving',
      (n, dove) => `Every morning, the ${n} proposals ${dove} go into your list with the next step for each.`] },
  { id: 'inbox', fonti: ['posta', 'google', 'microsoft'], minimo: 3,
    it: ['Le priorità della posta',
      (n, dove) => `Ogni mattina, dai ${n} messaggi ${dove} raccolgo le richieste ancora aperte, con mittente e prossimo passo.`],
    en: ['Inbox priorities',
      (n, dove) => `Every morning, from the ${n} messages ${dove} I collect the open requests, with sender and next step.`] },
  { id: 'files', fonti: ['desktop', 'drive', 'notion', 'sharepoint', 'dropbox'], minimo: 5,
    it: ['Novità nei progetti',
      (n, dove) => `Ogni mattina, dai ${n} documenti nuovi ${dove} riepilogo cambiamenti, scadenze e prossimi passi.`],
    en: ['Project updates',
      (n, dove) => `Every morning, from the ${n} new documents ${dove} I summarize changes, deadlines and next steps.`] }
]

/**
 * Dove le ha viste, scritto come si direbbe a voce.
 *
 * L'etichetta dell'attrezzo porta l'articolo — «la posta», «il desktop» —
 * perché nel menù della chiocciola sta in mezzo a una frase. Qui va dopo un
 * «in», e «in la posta» non lo scrive nessuno.
 */
const ARTICOLO = /^(l['’]|la |il |lo |i |le |gli )/i
function fonteScritta(nomi: string[], inglese: boolean): string {
  // il computer ha la sua preposizione («nel mio Mac», «on my Mac»); le altre fonti stanno in un elenco con un «in» davanti
  const altri: string[] = []
  let computer: string | null = null
  for (const n of nomi) {
    const a = attrezzi.ATTREZZI.find(x => x.nome === n)
    const e = a ? (inglese ? a.etichetta.en : a.etichetta.it) : n
    if (n === 'desktop.leggi') computer = inglese ? `on ${e}` : `nel ${e.replace(ARTICOLO, '')}`
    else altri.push(e.replace(ARTICOLO, ''))
  }
  const pezzi: string[] = []
  if (altri.length) pezzi.push('in ' + (altri.length < 2 ? altri[0] : `${altri.slice(0, -1).join(', ')}${inglese ? ' and ' : ' e '}${altri[altri.length - 1]}`))
  if (computer) pezzi.push(computer)
  if (!pezzi.length) return inglese ? 'in your sources' : 'in quello che hai collegato'
  return pezzi.join(inglese ? ' and ' : ' e ')
}

export function rileva(docs: Pick<store.Documento, 'id' | 'titolo' | 'fonte'>[],
  catalogo: { nome: string; collegato: boolean }[], esistenti: Set<string>, inglese = true): Suggerimento[] {
  return MODELLI.flatMap(m => {
    const id = `mind-${m.id}`
    if (esistenti.has(id)) return []
    const prove = docs.filter(d => (m.fonti ? m.fonti.includes(d.fonte) : m.pattern!.test(d.titolo)) && catalogo.some(a =>
      a.collegato && attrezzi.esiste(a.nome) && attrezzi.fontiDi(a.nome).includes(d.fonte)))
    if (prove.length < (m.minimo ?? 2)) return []
    const suoi = catalogo.filter(a => a.collegato && attrezzi.esiste(a.nome) &&
      prove.some(d => attrezzi.fontiDi(a.nome as attrezzi.Nome).includes(d.fonte))).map(a => a.nome)
    const [nome, frase] = inglese ? m.en : m.it
    const s: Suggerimento = {
      id, nome,
      spiega: senzaTrattini(frase(prove.length, fonteScritta(suoi, inglese))),
      quanti: prove.length,
      esempi: prove.slice(0, 2).map(d => d.titolo),
      attrezzi: suoi,
      quando: { ogni: 'giorno', ora: 8 },
      guarda: { soloNuovi: true, limite: 8 },
      metti: { inLista: 'oggi', modo: 'bozza' }
    }
    return [s]
  }).slice(0, 3)
}

// — il foglio su cui restano —

/**
 * Quanto vale una passata. Un giorno.
 *
 * È il numero che tiene questa schermata dentro la bolletta: senza, ogni
 * apertura della pagina Automazioni sarebbe una chiamata al modello grande
 * con quaranta titoli in pancia, e nessuno se ne accorgerebbe fino al conto.
 */
export const ORE_VALIDE = 24

type Archivio = {
  /** Quando si è provato a scriverli. Null: mai. */
  quando: string | null
  /** In che lingua sono scritti: cambiando lingua non si tengono. */
  lingua: string
  suggerimenti: Suggerimento[]
  /** I nomi che ha rifiutato: non si ripropongono, e il modello lo sa. */
  scartati: string[]
}

const VUOTO: Archivio = { quando: null, lingua: '', suggerimenti: [], scartati: [] }
const FILE = () => join(cartella(), 'scoperte.json')

function leggiArchivio(): Archivio {
  try {
    return { ...VUOTO, ...JSON.parse(readFileSync(FILE(), 'utf8')) as Partial<Archivio> }
  } catch {
    return { ...VUOTO }
  }
}

function scriviArchivio(a: Archivio) {
  const dentro = cartella()
  if (!existsSync(dentro)) mkdirSync(dentro, { recursive: true, mode: 0o700 })
  writeFileSync(FILE(), JSON.stringify(a, null, 2), { mode: 0o600 })
}

// — come si chiede al modello —

const FORMA = {
  type: 'object',
  properties: {
    automazioni: {
      type: 'array',
      description: 'Da una a tre. Un elenco vuoto se non hai visto niente che si ripeta.',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Al massimo sei parole, come la chiamerebbe lei.' },
          spiega: {
            type: 'string',
            description: 'UNA frase piana, al massimo diciotto parole, che nomina la roba vera che hai ' +
              'visto: da quale fonte viene e che documenti o righe sono.'
          },
          quando: {
            type: 'object',
            properties: {
              ogni: {
                type: 'string', enum: ['giorno', 'settimana', 'arrivo'],
                description: '«arrivo» vuol dire appena arriva qualcosa di nuovo da quelle fonti.'
              },
              giorno: { type: 'number', description: 'Solo per «settimana»: 0 è domenica, 1 lunedì.' },
              ora: { type: 'number', description: 'Da 0 a 23. Presto, se non c’è un motivo per dire un’altra ora.' }
            },
            required: ['ogni', 'giorno', 'ora'],
            additionalProperties: false
          },
          guarda: {
            type: 'object',
            properties: {
              cerca: {
                type: 'string',
                description: 'Due o quattro parole per frugare l’indice: quelle che userebbe chi ha ' +
                  'scritto quei documenti — un nome, un numero, l’oggetto che torna — non la parola generica.'
              }
            },
            required: ['cerca'],
            additionalProperties: false
          },
          attrezzi: {
            type: 'array',
            items: { type: 'string', enum: attrezzi.ATTREZZI.map(a => a.nome) },
            description: 'Solo quelli collegati, e solo quelli che le servono davvero: ognuno è un permesso.'
          },
          metti: {
            type: 'object',
            properties: {
              inLista: { type: 'string', enum: ['oggi', 'settimana', 'poi'] },
              modo: {
                type: 'string', enum: ['io', 'bozza', 'tutto', 'prompt'],
                description: '«io» lascia una riga e basta; «bozza» la fa anche svolgere.'
              }
            },
            required: ['inLista', 'modo'],
            additionalProperties: false
          }
        },
        required: ['nome', 'spiega', 'quando', 'guarda', 'attrezzi', 'metti'],
        additionalProperties: false
      }
    }
  },
  required: ['automazioni'],
  additionalProperties: false
} as const

const COME_SI_SUGGERISCE = `Stai guardando il materiale vero di una persona e le proponi da una a tre
automazioni che le tolgano di mano un lavoro che rifà sempre uguale.

Un'automazione di Myynd si sveglia a un'ora, apre soltanto quello che le è
stato concesso, ci fa ragionare un modello e lascia una riga nella sua lista.
Non manda niente a nessuno, non cancella niente, non tocca niente.

Gli attrezzi che puoi darle, e nessun altro — sono quelli che ha collegato:

\${ATTREZZI}

**Quello che rende buona una proposta è che nomini la roba che hai davanti.**
«Ogni mattina, le fatture di Aruba e Fastweb dalla posta nella lista di oggi»
è una proposta: dice da dove viene quella roba e che roba è, e chi la legge
riconosce la sua giornata. «Unisci due cose», «tieni tutto sotto controllo»,
«ottimizza il flusso» non sono proposte: chi le legge non sa nemmeno cosa gli
stai proponendo, e ha ragione a non fidarsi.

Perciò «spiega» è UNA frase piana, al massimo diciotto parole, che nomina la
fonte e il tipo di documenti o di righe che hai visto davvero nel materiale.
Niente lineette lunghe, niente parole da brochure, niente promesse.

Se nel materiale non c'è niente che si ripeta, torni un elenco vuoto: è una
risposta buona, non un fallimento. Meglio nessuna proposta che una inventata —
una proposta che non c'entra insegna a non leggere più le altre.

Non riproporre quello che ha già: le automazioni che ci sono te le do scritte,
e la stessa cosa con un altro nome resta la stessa cosa. E non riproporre
quello che ha già rifiutato.

Sull'ora: presto, prima che cominci la giornata, se non c'è un motivo per dire
un'altra ora.`

/** L'elenco degli attrezzi collegati come lo legge il modello. */
function catalogoScritto(collegati: { nome: string; spiega: string }[]): string {
  return collegati.map(a => `— \`${a.nome}\` — ${a.spiega}`).join('\n')
}

/**
 * Il materiale: quello che ha, scritto in chiaro.
 *
 * Tutto di prima mano — l'indice, la lista, i progetti, il profilo — e niente
 * di riassunto: è esattamente il materiale su cui una proposta può nominare
 * qualcosa invece di raccontare.
 */
function materiale(scartati: string[]): string {
  const c = leggi()
  const collegati = attrezzi.catalogo().filter(a => a.collegato)
  const docs = store.recenti(40)
  const righe = store.elencoCompiti().slice(0, 15)
  const tolte = store.automazioniTolte()
  const gia = auto.ricette().filter(r => !tolte.has(r.id)).map(r => auto.nella(r))
  const f = fuoco()
  return [
    `CHI LA USA: ${[c.nome, c.ruolo].filter(Boolean).join(', ') || 'non l’ha detto'}.`,
    `Come vuole che si lavori: tono ${tono(c)}; autonomia ${autonomia(c)}.`,
    f ? `Le ha chiesto di concentrarsi su questo:\n${f}` : '',
    c.argomenti ? `Argomenti che segue: ${c.argomenti}` : '',
    `ATTREZZI COLLEGATI (puoi usare solo questi):\n${
      collegati.map(a => `— ${a.nome} (${a.etichetta})`).join('\n') || 'nessuno'}`,
    `PROGETTI E OBIETTIVI:\n${progetti.perIlModello() || 'nessuno'}`,
    `DOCUMENTI ARRIVATI DI RECENTE:\n${
      docs.map(d => `— [${d.fonte}] ${d.titolo}${d.quando ? ` (${d.quando.slice(0, 10)})` : ''}`).join('\n') || 'nessuno'}`,
    `RIGHE ANCORA APERTE NELLA SUA LISTA:\n${
      righe.map(r => `— ${r.testo} [${r.stato}]`).join('\n') || 'nessuna'}`,
    `AUTOMAZIONI CHE HA GIÀ (non riproporle):\n${
      gia.map(a => `— ${a.nome} (${attrezzi.ripulisci(a.attrezzi).join(', ') || 'solo l’indice'})`).join('\n') || 'nessuna'}`,
    scartati.length ? `PROPOSTE CHE HA GIÀ RIFIUTATO:\n${scartati.map(s => `— ${s}`).join('\n')}` : ''
  ].filter(Boolean).join('\n\n')
}

/**
 * Le mani con cui si chiede, sostituibili solo nelle prove.
 *
 * Come in `automazioni.ts`, e per la stessa ragione: una prova che chiama un
 * modello non è una prova, e qui c'è per giunta da contare *quante volte* lo
 * chiama — che è metà di quello che questo file promette.
 */
type Ferri = { collegato: () => boolean; chiediJSON: (o: Parameters<typeof chiediJSON>[0]) => Promise<unknown> }
const VERI: Ferri = { collegato, chiediJSON: o => chiediJSON(o) }
let ferri: Ferri = VERI

/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) {
  ferri = f ? { ...VERI, ...f } : VERI
}

type Grezza = {
  nome?: unknown
  spiega?: unknown
  quando?: { ogni?: unknown; giorno?: unknown; ora?: unknown }
  guarda?: { cerca?: unknown }
  attrezzi?: unknown
  metti?: { inLista?: unknown; modo?: unknown }
}

/** Le prime parole, e non una di più. */
function parole(testo: string, quante: number): string {
  const p = testo.split(/\s+/).filter(Boolean)
  return p.length <= quante ? p.join(' ') : p.slice(0, quante).join(' ')
}

/**
 * Una frase sola, quando ne ha scritte due.
 *
 * Il taglio scatta solo se quello che resta è già una frase intera: «Aruba
 * S.p.A.» non deve diventare la fine del discorso.
 */
function unaFrase(testo: string): string {
  const i = testo.search(/[.!?](\s|$)/)
  if (i < 40 || i >= testo.length - 1) return testo
  return testo.slice(0, i + 1)
}

/** Le stesse parole, come si confrontano: senza accenti, senza segni, minuscole. */
const nudo = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * La proposta ripulita, o niente.
 *
 * Gli attrezzi si controllano due volte: che esistano — il vocabolario chiuso
 * di `attrezzi.ts` — e che siano **collegati adesso**. Una proposta che apre
 * una casella che non c'è gira ogni mattina senza trovare niente, ed è il modo
 * più veloce per far spegnere le automazioni a chi le ha appena accese.
 */
function ripulisci(g: Grezza, collegati: Set<string>): Suggerimento | null {
  const nome = parole(senzaTrattini(String(g.nome ?? '').trim()).replace(/\s+/g, ' '), 6)
  const spiega = unaFrase(senzaTrattini(String(g.spiega ?? '').trim()).replace(/\s+/g, ' '))
  if (!nome || !spiega) return null
  const suoi = attrezzi.ripulisci(g.attrezzi).filter(n => collegati.has(n))
  if (!suoi.length) return null

  const ora = Math.min(23, Math.max(0, Math.round(Number(g.quando?.ora) || 8)))
  const ogni = String(g.quando?.ogni ?? 'giorno')
  const quando: auto.Quando = ogni === 'arrivo'
    ? { quandoArriva: true }
    : ogni === 'settimana'
      ? { ogni: 'settimana', giorno: Math.min(6, Math.max(0, Math.round(Number(g.quando?.giorno) || 1))), ora }
      : { ogni: 'giorno', ora }

  const cerca = String(g.guarda?.cerca ?? '').trim()
  const inLista = (SECCHI.includes(String(g.metti?.inLista)) ? String(g.metti?.inLista) : 'oggi') as 'oggi'
  const modo = (MODI.includes(String(g.metti?.modo)) ? String(g.metti?.modo) : 'bozza') as 'bozza'
  // le prove non le inventa lui: si contano nell'indice, dentro il recinto
  // degli attrezzi che ha chiesto
  const prove = cerca ? store.cerca(cerca, 20, attrezzi.recinto(suoi) ?? undefined) : []
  return {
    id: `idea-${auto.idPer(nome, new Set())}`,
    nome,
    spiega,
    quanti: prove.length,
    esempi: prove.slice(0, 2).map(d => d.titolo),
    attrezzi: suoi,
    quando,
    guarda: { ...(cerca ? { cerca } : {}), soloNuovi: true, limite: 8 },
    metti: { inLista, modo }
  }
}

/** Ce l'ha già? Stesso nome, o le stesse parole sulle stesse fonti. */
function giaCe(s: Suggerimento, gia: { nome: string; attrezzi: string[]; cerca: string }[]): boolean {
  const nome = nudo(s.nome)
  const cerca = nudo(s.guarda.cerca ?? '')
  return gia.some(a => nudo(a.nome) === nome ||
    (!!cerca && nudo(a.cerca) === cerca && a.attrezzi.length === s.attrezzi.length &&
      a.attrezzi.every(n => s.attrezzi.includes(n))))
}

async function componi(scartati: string[]): Promise<Suggerimento[] | null> {
  const collegati = attrezzi.catalogo().filter(a => a.collegato)
  // niente di collegato vuol dire niente da guardare: la chiamata sarebbe una
  // spesa per una risposta che si sa già
  if (!collegati.length) return []

  const r = await ferri.chiediJSON({
    lavoro: 'ricetta',
    max_tokens: 1500,
    system: `Scrivi in ${nellaLingua()}.\n\n` + COME_SI_SUGGERISCE.replace('${ATTREZZI}', catalogoScritto(collegati)),
    formato: FORMA,
    messages: [{ role: 'user', content: materiale(scartati) }]
  }) as { automazioni?: Grezza[] } | null
  if (!r) return null

  const nomi = new Set(collegati.map(a => a.nome))
  const tolte = store.automazioniTolte()
  const gia = auto.ricette().filter(a => !tolte.has(a.id)).map(a => {
    const n = auto.nella(a)
    return { nome: n.nome, attrezzi: attrezzi.ripulisci(a.attrezzi), cerca: n.guarda.cerca ?? '' }
  })
  const rifiutati = new Set(scartati.map(nudo))
  const visti = new Set<string>()
  const fuori: Suggerimento[] = []
  for (const g of r.automazioni ?? []) {
    const s = ripulisci(g, nomi)
    if (!s || visti.has(s.id) || rifiutati.has(nudo(s.nome)) || giaCe(s, gia)) continue
    visti.add(s.id)
    fuori.push(s)
    if (fuori.length === 3) break
  }
  return fuori
}

// — quello che vede la schermata —

/** Quelle che valgono ancora: già adottate e già rifiutate escono. */
function vivi(quali: Suggerimento[], esistenti: Set<string>): Suggerimento[] {
  return quali.filter(s => !esistenti.has(s.id)).slice(0, 3)
}

/*
 * Uno per persona: due richieste vicine — la schermata e un aggiornamento
 * arrivato addosso — non devono pagare due giri.
 */
const inCorso = new Map<string, Promise<Suggerimento[]>>()

/**
 * I suggerimenti, secondo il cancello.
 *
 * Senza `forza`: quelli di ieri se hanno meno di un giorno, e in quel caso
 * **non si chiama nessun modello** — è la promessa che rende gratis aprire
 * questa schermata. Con `forza`: si rifanno.
 */
export function suggerimenti(forza = false): Promise<Suggerimento[]> {
  const chiave = cartella()
  let giro = inCorso.get(chiave)
  // chi chiede di rifare non si accoda a un giro che magari sta solo leggendo la cache
  if (!giro || forza) {
    giro = fai(forza).finally(() => { inCorso.delete(chiave) })
    inCorso.set(chiave, giro)
  }
  return giro
}

async function fai(forza: boolean): Promise<Suggerimento[]> {
  const esistenti = new Set([...auto.ricette().map(a => a.id), ...store.automazioniTolte()])
  const lin = lingua()
  const locali = () => rileva(store.recenti(200), attrezzi.catalogo(), esistenti, lin !== 'it')
  // senza modello si resta ai cinque modelli, e non si scrive niente sul
  // foglio: una passata che non costa nulla non ha bisogno di una cache
  if (!ferri.collegato()) return locali()

  const a = leggiArchivio()
  const fresco = !!a.quando && Date.now() - new Date(a.quando).getTime() < ORE_VALIDE * 3_600_000 && a.lingua === lin
  if (!forza && fresco) return vivi(a.suggerimenti, esistenti)

  /*
   * Si segna il giro *prima* di chiederlo.
   *
   * Come per il punto: una risposta che non arriva — fornitore giù, chiave a
   * secco, JSON illeggibile — è costata lo stesso, e senza questa riga
   * ritenterebbe a ogni apertura della pagina. Il bottone resta la strada per
   * riprovare subito.
   */
  scriviArchivio({ ...a, quando: new Date().toISOString(), lingua: lin })
  const nuovi = await componi(a.scartati)
  if (!nuovi) return a.suggerimenti.length ? vivi(a.suggerimenti, esistenti) : locali()
  // riletto adesso, non da prima della chiamata: uno scarto arrivato nel frattempo resterebbe fuori
  scriviArchivio({ ...leggiArchivio(), quando: new Date().toISOString(), lingua: lin, suggerimenti: nuovi })
  return vivi(nuovi, esistenti)
}

/** Quella con questo id, senza chiamare nessuno: dal foglio, o dai modelli. */
function trova(id: string): Suggerimento | undefined {
  const esistenti = new Set([...auto.ricette().map(a => a.id), ...store.automazioniTolte()])
  const dal = leggiArchivio().suggerimenti.find(s => s.id === id)
  if (dal) return dal
  return rileva(store.recenti(200), attrezzi.catalogo(), esistenti, lingua() !== 'it').find(s => s.id === id)
}

/**
 * Non ora.
 *
 * Si tiene il nome, non solo l'id: al prossimo giro il modello lo legge e non
 * ripropone la stessa cosa con un id diverso. E si controlla che l'id sia
 * davvero di una proposta: da questa strada non deve poter sparire
 * un'automazione vera.
 */
export function scarta(id: string): boolean {
  const a = leggiArchivio()
  const s = a.suggerimenti.find(x => x.id === id)
  // una proposta locale non sta nell'archivio: il suo nome lo dà il modello di
  // partenza, nella lingua di adesso, così anche quella il modello la legge rifiutata
  const locale = MODELLI.find(m => `mind-${m.id}` === id)
  if (!s && !locale) return false
  const nome = s ? s.nome : (lingua() !== 'it' ? locale!.en[0] : locale!.it[0])
  scriviArchivio({
    ...a,
    suggerimenti: a.suggerimenti.filter(x => x.id !== id),
    scartati: [...new Set([...a.scartati, nome])].slice(-20)
  })
  store.togliAutomazione(id)
  return true
}

/**
 * La scrive davvero, e la lascia spenta.
 *
 * Con i campi della proposta — la sua ora, le sue fonti, la sua ricerca — e
 * non con dei valori fissi: la scheda diceva «ogni lunedì alle 17» e ne
 * nasceva una giornaliera delle 8, cioè la schermata prometteva una cosa e il
 * motore ne faceva un'altra.
 *
 * Spenta apposta: nasce sulla griglia come una scheda normale in pausa, e
 * l'interruttore lo tira lei. È il passo che rende innocuo tutto il resto.
 */
export function adotta(id: string): auto.Automazione {
  const esistente = auto.ricette().find(a => a.id === id)
  if (esistente && !store.automazioniTolte().has(id)) return esistente
  const s = trova(id)
  if (!s) throw new Error('This suggestion is no longer available. Refresh and try again.')

  /*
   * Le due lingue.
   *
   * Per i cinque modelli ci sono davvero: la ricetta nasce con la sua riga
   * italiana e la sua riga inglese, e cambiare lingua la ridice. Per quelle
   * scritte dal modello no — sono nate nella lingua del conto — e le due metà
   * restano uguali finché non ci mette mano lei nell'editor. Meglio la stessa
   * frase due volte che un campo vuoto: `valida()` rifiuterebbe la ricetta.
   */
  const m = MODELLI.find(x => `mind-${x.id}` === id)
  const due = m
    ? {
      it: { nome: m.it[0], spiega: senzaTrattini(m.it[1](s.quanti, fonteScritta(s.attrezzi, false))) },
      en: { nome: m.en[0], spiega: senzaTrattini(m.en[1](s.quanti, fonteScritta(s.attrezzi, true))) }
    }
    : { it: { nome: s.nome, spiega: s.spiega }, en: { nome: s.nome, spiega: s.spiega } }

  const a = auto.scrivi({
    id,
    nome: due.it.nome, spiega: due.it.spiega, fai: due.it.spiega,
    quando: s.quando,
    guarda: s.guarda,
    attrezzi: s.attrezzi,
    metti: s.metti,
    passi: [{
      id: 'relevance', tipo: 'condizione', testo: lingua() === 'it'
        ? `Continua solo se ci sono documenti pertinenti: ${due.it.spiega}`
        : `Continue only when relevant documents are present: ${due.en.spiega}`
    }],
    en: { ...due.en, fai: due.en.spiega, ...(s.guarda.cerca ? { cerca: s.guarda.cerca } : {}) }
  })
  auto.accendi(id, false)
  return a
}
