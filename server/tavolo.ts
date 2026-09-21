// Il tavolo non resta mai vuoto.
//
// Le sue parole, del 21 settembre: «If there is nothing else to do, it is
// not okay that there is the "nothing left, read now" card… It sounds like
// it's mechanical, as if he needs to tell me what to do. He's surfacing
// things to do, and there is always stuff to do because the projects are
// not completed unless the user says so, so he can continue working.»
//
// Quindi un progetto attivo senza niente sul tavolo — nessuna voce del feed,
// nessuna riga della lista, nessuna domanda — riceve la cosa dopo: una riga
// proposta, che comincia con un verbo, verso il suo obiettivo, scritta con
// davanti la memoria del progetto, il riferimento, la cartella di lavoro e
// le ultime cose chiuse. Non una domanda: «cosa faccio adesso?» è quello che
// lui non vuole sentirsi chiedere. Si passa di qui all'avvio, dopo ogni
// rilettura, dopo «Leggi adesso», e quando la pagina si trova vuota.
//
// Quello che non si fa conta quanto quello che si fa: un progetto fermo o
// chiuso non riceve niente; una riga simile già in lista non si raddoppia;
// dopo che lui ha tolto una proposta quel progetto tace per un giorno; fra
// una proposta e l'altra sullo stesso progetto passa almeno un'ora, così un
// modello che non sa non viene richiamato in tondo. E non fallisce mai
// verso chi chiama: al peggio scrive una riga nel registro.
//
//   node --test server/tavolo.test.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as store from './store.ts'
import * as progetti from './progetti.ts'
import * as compiti from './compiti.ts'
import * as ordine from './ordine.ts'
import { cartella } from './config.ts'
import { chiediJSON, collegato, conLaLingua } from './modello.ts'
import { simili } from './revisione-lavoro.ts'

/** L'origine delle righe che nascono qui: la pagina le tratta come ogni altra riga sua. */
export const ORIGINE = 'proposta'
/** Fra una proposta e l'altra sullo stesso progetto. */
const ORE_FRA = 1
/** Dopo una proposta tolta da lui. */
const ORE_DOPO_UN_NO = 24

// — quando si è proposto, per progetto —

type Archivio = Record<string, string>
const FILE = () => join(cartella(), 'tavolo.json')
function leggiArchivio(): Archivio {
  try {
    const a = JSON.parse(readFileSync(FILE(), 'utf8')) as unknown
    return a && typeof a === 'object' && !Array.isArray(a) ? a as Archivio : {}
  } catch { return {} }
}
function segna(id: string, adesso: number) {
  const a = leggiArchivio()
  a[id] = new Date(adesso).toISOString()
  const dentro = cartella()
  if (!existsSync(dentro)) mkdirSync(dentro, { recursive: true, mode: 0o700 })
  writeFileSync(FILE(), JSON.stringify(a, null, 2), { mode: 0o600 })
}

// — le mani, sostituibili solo nelle prove —

type Ferri = { collegato: () => boolean; prossimo: typeof prossimoPassoDelProgetto }
const VERI: Ferri = { collegato: () => collegato(), prossimo: (...a) => prossimoPassoDelProgetto(...a) }
let ferri: Ferri = VERI
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/** I progetti attivi che non hanno niente sul tavolo, e a cui si può proporre adesso. */
export function scoperti(adesso = Date.now()): progetti.Progetto[] {
  const righe = store.elencoCompiti()
  const voci = store.elencoFeed('aperto') as { progetto?: string | null }[]
  const domanda = store.domandaAperta()
  const chiusi = store.compitiChiusi(200)
  const archivio = leggiArchivio()
  return progetti.elenco('attivo').filter(p => {
    if (righe.some(c => c.progetto === p.id)) return false
    if (voci.some(v => v.progetto === p.id)) return false
    if (domanda?.progetto === p.id) return false
    const ultima = Date.parse(archivio[p.id] ?? '')
    if (Number.isFinite(ultima) && adesso - ultima < ORE_FRA * 3_600_000) return false
    // una proposta che lui ha tolto: quel progetto tace per un giorno
    const tolta = chiusi.find(c => c.progetto === p.id && c.origine === ORIGINE && c.stato === 'lasciato')
    if (tolta && adesso - Date.parse(tolta.chiuso ?? '') < ORE_DOPO_UN_NO * 3_600_000) return false
    return true
  })
}

/** Riempie il tavolo: una riga per progetto scoperto. Torna quante ne ha scritte. */
export async function riempi(adesso = Date.now()): Promise<number> {
  if (!ferri.collegato()) return 0
  let scritte = 0
  for (const p of scoperti(adesso)) {
    segna(p.id, adesso)
    let passo: string | null = null
    try { passo = await ferri.prossimo(p) } catch (e) {
      console.warn(`myynd · tavolo · ${p.nome}: il passo dopo non è arrivato:`, e instanceof Error ? e.message : e)
      continue
    }
    if (!passo) { console.info(`myynd · tavolo · ${p.nome} · niente da proporre`); continue }
    if (store.elencoCompiti().some(v => simili(v.testo, passo!))) { console.info(`myynd · tavolo · ${p.nome} · già in lista: «${passo.slice(0, 80)}»`); continue }
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    store.scriviCompito({ id, testo: passo, quando: 'oggi', origine: ORIGINE, progetto: p.id, ordine: ordine.dopo(store.ultimoOrdine('oggi')) })
    console.info(`myynd · tavolo · ${p.nome} → ${id} · «${passo.slice(0, 80)}»`)
    scritte++
  }
  if (scritte) compiti.annunciaCambio()
  return scritte
}

const SCHEMA_PASSO = {
  type: 'object',
  properties: {
    prossimo: {
      type: 'string',
      description:
        'La cosa più utile da fare adesso in questo progetto, verso il suo obiettivo, in una riga ' +
        'sola che comincia con un verbo: «Scrivere la pagina che presenta il pilota al team», ' +
        '«Confrontare i tre fornitori sul prezzo». Sotto le dodici parole, concreta, una sola. ' +
        'Vuota solo se non c\'è davvero niente da cui partire.'
    }
  },
  required: ['prossimo'],
  additionalProperties: false
} as const

/**
 * La cosa dopo di un progetto che non ha niente sul tavolo.
 *
 * Diversa da `prossimoPasso` di `revisione-lavoro.ts`, che parte da un
 * lavoro appena finito: qui si parte dal progetto intero — obiettivo, note,
 * riferimento, memoria, cartella, ultime cose chiuse — e si chiede la mossa
 * più utile verso l'obiettivo. Torna `null` di rado, e non deve tornare una
 * cosa già chiusa detta in altre parole.
 */
export async function prossimoPassoDelProgetto(p: progetti.Progetto): Promise<string | null> {
  const materiale = compiti.materialeDelProgetto(p)
  const chiuse = store.compitiChiusi(80).filter(c => c.progetto === p.id).slice(0, 8)
  const out = await chiediJSON<{ prossimo: string }>({
    lavoro: 'estrazione',
    max_tokens: 200,
    system: conLaLingua(
      'Un progetto di una persona è attivo finché lei non lo chiude, e finché è attivo c\'è ' +
      'sempre una cosa dopo. Sul suo tavolo, per questo progetto, adesso non c\'è niente. Di\' ' +
      'qual è la cosa più utile da fare adesso verso l\'obiettivo, in una riga sola che comincia ' +
      'con un verbo, sotto le dodici parole, concreta: una cosa che un assistente può fare o ' +
      'preparare — scrivere, cercare, confrontare, definire, preparare — o che lei farebbe ' +
      'davvero. Non un consiglio generico, non «rivedere» o «controllare» e basta, non una cosa ' +
      'già chiusa detta in altre parole. Parti da quello che è stato fatto e da quello che il ' +
      'progetto dice di sé. Lascia la riga vuota solo se non c\'è davvero niente da cui partire.'
    ),
    formato: SCHEMA_PASSO,
    messages: [{
      role: 'user',
      content: [
        `Progetto: ${p.nome}. Obiettivo: ${p.obiettivo || 'non registrato'}.`,
        p.note ? `Note: ${p.note.slice(0, 600)}` : '',
        materiale.riferimento ? `Dal suo riferimento, con le sue parole: ${materiale.riferimento}` : '',
        materiale.memoria ? materiale.memoria.slice(0, 1500) : '',
        materiale.cartella ? `Cartella di lavoro: ${materiale.cartella.titolo}\n${(materiale.cartella.corpo ?? '').slice(0, 1200)}` : '',
        chiuse.length ? `Le ultime cose chiuse in questo progetto:\n${chiuse.map(c => `- ${c.testo} (${c.stato})`).join('\n')}` : ''
      ].filter(Boolean).join('\n\n')
    }]
  })
  const passo = String(out?.prossimo ?? '').replace(/\s+/g, ' ').replace(/^["'«]+|["'»]+$/g, '').replace(/[.]+$/, '').trim().slice(0, 160)
  if (!passo || passo.split(/\s+/).length < 2) return null
  if (chiuse.some(c => simili(c.testo, passo))) return null
  return passo
}
