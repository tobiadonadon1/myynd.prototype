// Semina un conto di prova da una scena JSON, con i moduli veri di Myynd.
//
//   env -i PATH="$PATH" HOME=<casa finta> MYYND_DATI=<dati finti> \
//     node --disable-warning=ExperimentalWarning prove/semina.ts prove/scene/pieno.json \
//       [--modello http://127.0.0.1:18701/v1/]
//
// Di solito non si lancia a mano: lo fa `prove/scena.sh`. Rifiuta di partire
// se MYYND_DATI manca o se HOME è la casa vera: una semina sui dati veri è
// esattamente la cosa che questo file non deve poter fare.
//
// Il conto è `sviluppo@myynd.local`, il primo e unico: il server lanciato con
// MYYND_DEV=1 gli apre la sessione `sviluppo-non-in-produzione`. La
// configurazione dice lingua, nome, onboarding e giro fatti, niente automazioni
// di serie, e una fonte «desktop» con `scelte: true` su una cartella dentro la
// casa finta (senza `scelte`, all'avvio il server la allargherebbe a tutta la
// casa). Con --modello il conto ragiona col modello finto (prove/finto-modello.mjs).
//
// La scena (tutto facoltativo; i tempi si scrivono «-3h», «-2d», «+1d», «-30m»,
// «adesso», o come data ISO):
//   { "lingua": "en", "nome": "Alex", "ruolo": "Founder",
//     "progetti":  [{ "chiave": "ev", "nome": "Evermute", "obiettivo": "…", "alias": ["everwave"], "priorita": "alta" }],
//     "file":      [{ "nome": "launch-plan.md", "testo": "…" }],
//     "documenti": [{ "id": "posta:INBOX:1", "fonte": "posta", "tipo": "email", "titolo": "…", "corpo": "…", "quando": "-2h", … }],
//     "feed":      [{ "id": "f1", "tipo": "Priorità", "titolo": "…", "testo": "…", "progetto": "ev", "quando": "-3h", "peso": 2, "stato": "aperto", … }],
//     "compiti":   [{ "id": "c1", "testo": "…", "quando": "oggi", "progetto": "ev", "stato": "pronto", "modo": "bozza", "risultato": "…", "chieste": […], "revisione": {…} }],
//     "domande":   [{ "tema": "riferimento", "testo": "…", "progetto": "ev" }],
//     "riferimento": "Evermute: shipping 1.0 this week.",
//     "punto":     { "progetti": [{ "progetto": "ev", "novita": "…", "doc": "posta:INBOX:1" }],
//                    "risposte": [{ "testo": "…", "doc": "…" }], "github": [], "daLeggere": [], "aggiornamenti": [] } }
//
// Senza «punto» il punto di oggi lo chiede il server al modello finto, che col
// copione di base torna vuoto: la prima pagina direbbe «0 cose» sopra una
// scrivania piena. Con «punto» si scrive il foglio di oggi com'è su disco, fatto
// adesso, e il server non lo rifà per tre ore.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { userInfo } from 'node:os'
import { fileURLToPath } from 'node:url'

type Scena = {
  lingua?: string; nome?: string; ruolo?: string
  progetti?: { chiave?: string; nome: string; obiettivo?: string; alias?: string[]; priorita?: string | null; stato?: string }[]
  file?: { nome: string; testo: string }[]
  documenti?: (Record<string, unknown> & { id: string; fonte: string; tipo: string; titolo: string; corpo: string; quando?: string })[]
  feed?: (Record<string, unknown> & { id: string; titolo: string })[]
  compiti?: (Record<string, unknown> & { id: string; testo: string })[]
  domande?: { tema: string; testo: string; progetto?: string }[]
  riferimento?: string
  punto?: {
    progetti?: { progetto: string; novita: string; doc?: string }[]
    github?: { testo: string; doc?: string }[]
    daLeggere?: { titolo: string; perche: string; link?: string }[]
    risposte?: { testo: string; doc?: string }[]
    aggiornamenti?: { testo: string; doc?: string }[]
  }
}

function esci(m: string): never {
  console.error(`semina · ${m}`)
  process.exit(1)
}

const argomenti = process.argv.slice(2)
const fileScena = argomenti.find(a => !a.startsWith('--'))
const iModello = argomenti.indexOf('--modello')
const urlModello = iModello >= 0 ? argomenti[iModello + 1] : ''
if (!fileScena) esci('manca la scena: prove/semina.ts <scena.json> [--modello <url>]')

const DATI = process.env.MYYND_DATI
const CASA = process.env.HOME
const VERA = userInfo().homedir
if (!DATI) esci('MYYND_DATI non c’è: non semino dove capita')
if (!CASA) esci('HOME non c’è')
if (resolve(CASA) === resolve(VERA)) esci(`HOME è la casa vera (${VERA}): usa una casa finta`)
if (resolve(DATI).startsWith(resolve(VERA, '.myynd'))) esci('MYYND_DATI punta ai dati veri')

const QUI = dirname(fileURLToPath(import.meta.url))
const SERVER = join(QUI, '..', 'server')
const conti = await import(join(SERVER, 'conti.ts'))
const chi = await import(join(SERVER, 'chi.ts'))
const cfg = await import(join(SERVER, 'config.ts'))
const store = await import(join(SERVER, 'store.ts'))
const progetti = await import(join(SERVER, 'progetti.ts'))
const riferimento = await import(join(SERVER, 'riferimento.ts'))
const chiavi = await import(join(SERVER, 'ordine.ts'))

const scena = JSON.parse(readFileSync(fileScena, 'utf8')) as Scena

/** «-3h», «+1d», «-30m», «adesso», o una data: un istante ISO. */
function tempo(v: unknown): string {
  if (typeof v !== 'string' || !v || v === 'adesso') return new Date().toISOString()
  const m = v.match(/^([+-])(\d+(?:\.\d+)?)([mhd])$/)
  if (!m) return new Date(v).toISOString()
  const ms = Number(m[2]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 } as Record<string, number>)[m[3]]
  return new Date(Date.now() + (m[1] === '-' ? -ms : ms)).toISOString()
}
const json = (v: unknown) => v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v)

const conto = await conti.registra('sviluppo@myynd.local', 'sviluppo-non-in-produzione')
if (!conto.ok) esci(`il conto non nasce: ${conto.errore}`)

const cartella = join(CASA, 'Documents')
mkdirSync(cartella, { recursive: true })
for (const f of scena.file ?? []) writeFileSync(join(cartella, f.nome), f.testo)

chi.dentro(conto.id, () => {
  cfg.scrivi({
    lingua: scena.lingua ?? 'en', nome: scena.nome ?? 'Alex', ...(scena.ruolo ? { ruolo: scena.ruolo } : {}),
    onboarding: true, giro: true, diSerie: false,
    desktop: { cartelle: [cartella], scelte: true },
    ...(urlModello ? { motore: 'compatibile', compatibile: { url: urlModello, chiave: 'sk-finta', modello: 'finto' } } : {})
  })

  const ids = new Map<string, string>()
  for (const p of scena.progetti ?? []) {
    const fatto = progetti.scrivi({ nome: p.nome, obiettivo: p.obiettivo ?? '' })
    ids.set(p.chiave ?? p.nome, fatto.id)
    const cambio: Record<string, unknown> = {}
    if (p.alias?.length) cambio.alias = p.alias
    if (p.priorita !== undefined) cambio.priorita = p.priorita
    if (p.stato) cambio.stato = p.stato
    if (Object.keys(cambio).length) progetti.cambia(fatto.id, cambio)
  }
  const progetto = (k: unknown) => typeof k === 'string' && k ? (ids.get(k) ?? k) : null

  if (scena.documenti?.length) {
    store.salvaDocumenti(scena.documenti.map(d => ({ ...d, quando: tempo(d.quando) })))
  }

  const insFeed = store.default.prepare(`
    INSERT INTO feed (id, tipo, titolo, testo, urgenza, fonte, doc, stato, quando, perche, offerta, progetto, peso, ragione)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  for (const v of scena.feed ?? []) {
    insFeed.run(v.id, String(v.tipo ?? 'Priorità'), v.titolo, String(v.testo ?? ''), (v.urgenza as string) ?? null,
      (v.fonte as string) ?? null, (v.doc as string) ?? null, String(v.stato ?? 'aperto'), tempo(v.quando),
      (v.perche as string) ?? null, (v.offerta as string) ?? null, progetto(v.progetto),
      typeof v.peso === 'number' ? v.peso : null, (v.ragione as string) ?? null)
  }

  for (const c of scena.compiti ?? []) {
    // in fondo al suo secchio, come una riga scritta a mano
    const quando = String(c.quando ?? 'oggi')
    store.scriviCompito({
      id: c.id, testo: c.testo, quando, ordine: chiavi.dopo(store.ultimoOrdine(quando)),
      progetto: progetto(c.progetto), nota: (c.nota as string) ?? null, doc: (c.doc as string) ?? null,
      ...(c.giorno ? { giorno: String(c.giorno) } : {}), ...(c.ora ? { ora: String(c.ora) } : {})
    })
    const campi: [string, unknown][] = [
      ['stato', c.stato], ['modo', c.modo], ['risultato', c.risultato], ['chieste', json(c.chieste)],
      ['revisione', json(c.revisione)], ['fonti', json(c.fonti)], ['ipotesi', json(c.ipotesi)],
      ['chiesto', c.stato && c.stato !== 'aperto' ? tempo(c.chiesto ?? '-1h') : undefined],
      ['chiuso', c.stato === 'fatto' ? tempo(c.chiuso ?? '-1h') : undefined]
    ]
    for (const [k, v] of campi) {
      if (v === undefined || v === null) continue
      store.default.prepare(`UPDATE compiti SET ${k} = ? WHERE id = ?`).run(v as string, c.id)
    }
  }

  for (const d of scena.domande ?? []) {
    store.apriDomanda({ tema: d.tema, testo: d.testo, spunto: [], progetto: progetto(d.progetto) })
  }
  if (scena.riferimento) riferimento.scrivi(scena.riferimento)

  if (scena.punto) {
    const adesso = new Date().toISOString()
    const p = scena.punto
    const riga = (r: { testo: string; doc?: string }) => ({ testo: r.testo, doc: r.doc ?? null })
    const ultimo = {
      quando: adesso, via: null,
      progetti: (p.progetti ?? []).map(x => {
        const id = progetto(x.progetto)
        const nome = (scena.progetti ?? []).find(q => (q.chiave ?? q.nome) === x.progetto)?.nome ?? x.progetto
        return { id, nome, novita: x.novita, doc: x.doc ?? null }
      }),
      github: (p.github ?? []).map(riga),
      daLeggere: (p.daLeggere ?? []).map(n => ({ titolo: n.titolo, perche: n.perche, link: n.link ?? null })),
      risposte: (p.risposte ?? []).map(riga),
      aggiornamenti: (p.aggiornamenti ?? []).map(riga)
    }
    // la forma dell'archivio di server/punto.ts; una chiamata contata oggi, come se l'avesse fatto lui
    writeFileSync(join(cfg.cartella(), 'punto.json'),
      JSON.stringify({ ultimo, progetti: [], scartati: [], chiamate: [adesso], avviate: [] }, null, 2), { mode: 0o600 })
  }
})

// — P8: inizio —
if ((scena as Record<string, unknown>).p8) {
  const p8 = await import(join(QUI, 'semina-p8.ts'))
  chi.dentro(conto.id, () => p8.semina((scena as Record<string, unknown>).p8, { casa: CASA }))
}
// — P8: fine —

store.chiudiIndici()
console.log(`semina · fatto: ${conto.id} in ${DATI}`)
