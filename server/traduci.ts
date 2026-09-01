// Quando cambi lingua, cambia anche quello che ti ha già scritto.
//
// Il resto dell'interfaccia si traduce da sé: è testo scritto nel codice, e
// basta un dizionario. Ma il feed e le domande *le ha scritte il modello*, e
// stanno nel database nella lingua in cui sono nate. Cambiare lingua e trovare
// mezza pagina nell'altra è peggio che non poterla cambiare affatto: sembra che
// una parte dell'app non sappia cosa fa l'altra.
//
// Si traduce invece di rigenerare, e non è la via più comoda ma la più giusta:
// rigenerare vorrebbe dire una lettura nuova, quindi voci diverse e stati persi
// — cambi lingua e ti ritrovi un'altra prima pagina. Tradurre lascia lì le
// stesse cose, con le stesse risposte che hai già dato, dette nell'altra lingua.

import { chiediJSON } from './modello.ts'
import * as store from './store.ts'

const SCHEMA = {
  type: 'object',
  properties: {
    voci: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tipo: { type: 'string' },
          titolo: { type: 'string' },
          testo: { type: 'string' },
          urgenza: { type: 'string' }
        },
        required: ['id', 'tipo', 'titolo', 'testo', 'urgenza'],
        additionalProperties: false
      }
    },
    domanda: { type: 'string' }
  },
  required: ['voci', 'domanda'],
  additionalProperties: false
} as const

const NOMI: Record<string, string> = { it: 'italiano', en: 'inglese' }

/**
 * Quello che ha in pancia è nella lingua sbagliata?
 *
 * Serve perché la traduzione finora partiva solo quando si *cambiava* lingua.
 * Chi ha l'app in inglese da sempre e le convinzioni scritte in italiano non
 * ha mai cambiato niente, quindi non è mai partita: apriva la Memoria e
 * trovava sette righe in una lingua che non aveva scelto.
 *
 * Il riconoscimento è grezzo di proposito. Non serve sapere che lingua è:
 * serve sapere se è *quella*. Una manciata di parole che in inglese non
 * esistono bastano, e costano zero: nessuna chiamata a nessun modello per
 * una domanda a cui si risponde contando parole.
 */
const SPIA_ITALIANO = /\b(che|non|una|per|con|della|nella|sono|come|quando|perché|questo|questa|degli|delle|scarta|valuta|preferisce|costruisce|evita)\b/i

/**
 * Le righe della lista scritte nella lingua sbagliata, una per una.
 *
 * Qui non vale la media che va bene per la memoria. La memoria si guarda tutta
 * insieme e o è di là o è di qua; la lista si guarda ogni mattina, e *una* riga
 * italiana in mezzo a nove inglesi si vede benissimo — mentre in una media fa
 * l'undici per cento e non fa scattare niente. È esattamente com'era andata:
 * una domanda in italiano ferma lì, e il controllo che diceva «tutto a posto».
 */
function compitiStorti(lingua: string) {
  if (lingua !== 'en') return []
  return store.elencoCompiti()
    .filter(c => (c.risultato ?? '').trim().length > 15 && SPIA_ITALIANO.test(c.risultato!))
}

/** Ce n'è anche una sola? Basta quella. */
export function compitiDaTradurre(lingua: string): boolean {
  return compitiStorti(lingua).length > 0
}

export function daTradurre(lingua: string): boolean {
  const righe = [
    ...store.convinzioni().map(c => c.enunciato),
    ...store.blocchi().filter(b => b.etichetta !== 'fuoco').map(b => b.valore)
  ].filter(r => r && r.trim().length > 15)
  if (!righe.length) return false
  const italiane = righe.filter(r => SPIA_ITALIANO.test(r)).length
  // in inglese: se più di un terzo sembra italiano, c'è da tradurre.
  // in italiano non si guarda: una convinzione inglese in un'app italiana
  // è possibile ma rara, e tradurre a vuoto costerebbe senza servire.
  return lingua === 'en' && italiane / righe.length > 0.34
}

/** La sola memoria, su richiesta: la chiama la schermata quando serve. */
export async function soloMemoria(lingua: string): Promise<number> {
  return memoriaInLingua(lingua)
}

/**
 * Traduce sul posto le voci aperte del feed e la domanda in sospeso.
 *
 * Un solo giro, a sforzo basso: sono poche frasi corte e non c'è niente da
 * ragionare, solo da dire nell'altra lingua. Se fallisce non succede niente di
 * grave — resta quello che c'era, e la prossima lettura nasce già giusta.
 */
export async function inLingua(lingua: string): Promise<number> {
  const voci = store.elencoFeed('aperto').map(v => ({
    id: String(v.id), tipo: String(v.tipo ?? ''), titolo: String(v.titolo ?? ''),
    testo: String(v.testo ?? ''), urgenza: String(v.urgenza ?? '')
  }))
  const domanda = store.domandaAperta()
  // Il feed vuoto non vuol dire «non c'è niente da tradurre»: qui sotto ci sono
  // la memoria e le righe della lista, che hanno una vita loro. Con un `return`
  // in questo punto — e c'era — chi aveva il feed vuoto non vedeva tradotto mai
  // niente, e la cosa che restava in italiano era proprio quella che si guarda
  // ogni mattina.
  const n = voci.length || domanda ? await feedInLingua(lingua, voci, domanda) : 0
  return n
    + await memoriaInLingua(lingua).catch(() => 0)
    + await compitiInLingua(lingua).catch(() => 0)
}

async function feedInLingua(
  lingua: string,
  voci: { id: string; tipo: string; titolo: string; testo: string; urgenza: string }[],
  domanda: { id: string; testo: string } | null
): Promise<number> {
  const out = await chiediJSON<{ voci: typeof voci; domanda: string }>({
    lavoro: 'traduzione',
    max_tokens: 4000,
    system:
      `Traduci in ${NOMI[lingua] ?? 'italiano'}. Rendi solo il testo: gli id restano ` +
      'identici, e quello che non è testo — nomi di persone, di aziende, di file, ' +
      'sigle, cifre — resta com\'è.\n\n' +
      'Il tono è quello di partenza: se una voce era corta e diretta, la traduzione ' +
      'è corta e diretta. L\'urgenza resta di due o tre parole. Se un campo è vuoto ' +
      'lo lasci vuoto.',
    formato: SCHEMA,
    messages: [{ role: 'user', content: JSON.stringify({ voci, domanda: domanda?.testo ?? '' }) }]
  })
  if (!out) return 0

  let n = 0
  for (const v of out.voci ?? []) {
    // solo le voci che esistevano: un id inventato non deve creare niente
    if (!voci.some(x => x.id === v.id)) continue
    // e solo se ha davvero tradotto qualcosa: un modello piccolo ogni tanto
    // rimanda indietro un campo vuoto, e sovrascriverci sopra vorrebbe dire
    // cancellare una voce del feed per aver cambiato lingua
    if (!v.titolo?.trim() || !v.testo?.trim()) continue
    store.traduciVoceFeed(v.id, { tipo: v.tipo, titolo: v.titolo, testo: v.testo, urgenza: v.urgenza })
    n++
  }
  if (domanda && out.domanda?.trim()) {
    store.traduciDomanda(domanda.id, out.domanda.trim())
    n++
  }

  return n
}

/**
 * Le bozze e le domande già scritte, ridette nell'altra lingua.
 *
 * Il `testo` della riga non si tocca: quello l'hai scritto tu — «re write the
 * blogs for the website» resta tuo anche se l'app cambia lingua. Si tocca solo
 * quello che ha scritto lui: la bozza, e la domanda che ti fa quando non ce la
 * fa da solo. È esattamente la frase che si legge in mezzo alla lista, e quella
 * che si nota quando è nella lingua sbagliata.
 */
async function compitiInLingua(lingua: string): Promise<number> {
  const righe = compitiStorti(lingua).map(c => ({ id: c.id, testo: c.risultato!.trim() }))
  if (!righe.length) return 0

  const out = await chiediJSON<{ righe: { id: string; testo: string }[] }>({
    lavoro: 'traduzione',
    max_tokens: 8000,
    system:
      `Traduci in ${NOMI[lingua] ?? 'italiano'} queste bozze e domande che un assistente ha ` +
      'scritto per chi lo usa. Gli id restano identici. Nomi di persone, di aziende, di file ' +
      'e citazioni testuali restano come sono, e la forma resta quella: una bozza di email ' +
      'resta una bozza di email, una domanda resta una domanda della stessa lunghezza.',
    formato: SCHEMA_MEMORIA,
    messages: [{ role: 'user', content: JSON.stringify({ righe }) }]
  })
  if (!out?.righe?.length) return 0

  const perId = new Map(righe.map(r => [r.id, r.testo]))
  let n = 0
  for (const r of out.righe) {
    const prima = perId.get(r.id)
    // un id inventato non deve poter riscrivere niente, e un campo vuoto
    // cancellerebbe una bozza per aver cambiato lingua
    if (!prima || !r.testo?.trim() || r.testo.trim() === prima) continue
    store.traduciRisultato(r.id, r.testo.trim())
    n++
  }
  return n
}

const SCHEMA_MEMORIA = {
  type: 'object',
  properties: {
    righe: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          testo: { type: 'string' }
        },
        required: ['id', 'testo'],
        additionalProperties: false
      }
    }
  },
  required: ['righe'],
  additionalProperties: false
} as const

/**
 * Quello che Myynd ha capito di te, nell'altra lingua.
 *
 * Le convinzioni nascono nella lingua in cui gliele hai dette, e restano lì:
 * cambi lingua e la schermata della memoria è l'unica cosa dell'app ancora in
 * italiano — proprio quella che dovrebbe essere la più leggibile, perché è
 * quella che ti chiede di fidarti.
 *
 * Si traduce sul posto: stesso id, stesso genere, stessa fiducia, stessa data.
 * Cambia solo la lingua in cui è scritta la frase. Rigenerarle sarebbe più
 * comodo e vorrebbe dire perderle: quello che ha capito di te non si rifà
 * perché hai premuto un bottone.
 */
async function memoriaInLingua(lingua: string): Promise<number> {
  const vive = store.convinzioni()
  const blocchi = store.blocchi().filter(b => b.etichetta !== 'fuoco' && b.valore.trim())
  if (!vive.length && !blocchi.length) return 0

  const righe = [
    ...vive.map(c => ({ id: `c:${c.id}`, testo: c.enunciato })),
    ...blocchi.map(b => ({ id: `b:${b.etichetta}`, testo: b.valore }))
  ]

  const out = await chiediJSON<{ righe: { id: string; testo: string }[] }>({
    lavoro: 'traduzione',
    max_tokens: 8000,
    system:
      `Traduci in ${NOMI[lingua] ?? 'italiano'} queste frasi che un assistente ha scritto ` +
      'su chi lo usa. Gli id restano identici. Nomi di persone, di aziende e di clienti ' +
      'restano come sono. Il tono resta quello: sono constatazioni brevi, non prosa — ' +
      'una frase che era secca resta secca.',
    formato: SCHEMA_MEMORIA,
    messages: [{ role: 'user', content: JSON.stringify({ righe }) }]
  })
  if (!out?.righe?.length) return 0

  const perId = new Map(righe.map(r => [r.id, r.testo]))
  let n = 0
  for (const r of out.righe) {
    const prima = perId.get(r.id)
    // solo quello che esisteva davvero, e solo se ha tradotto qualcosa: un
    // campo vuoto qui vorrebbe dire cancellare una convinzione per aver
    // cambiato lingua
    if (!prima || !r.testo?.trim() || r.testo.trim() === prima) continue
    if (r.id.startsWith('c:')) { store.traduciConvinzione(r.id.slice(2), r.testo.trim()); n++ }
    else if (r.id.startsWith('b:')) { store.traduciBlocco(r.id.slice(2), r.testo.trim()); n++ }
  }
  return n
}
