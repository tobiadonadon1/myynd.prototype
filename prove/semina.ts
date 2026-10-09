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
//                    "risposte": [{ "testo": "…", "doc": "…" }], "github": [], "aggiornamenti": [] } }
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
  /** P7: l'insieme delle domande della prova, copiato nel conto; `attiva` accende la prova settimanale. */
  risposte?: { insieme?: string; attiva?: boolean }
  punto?: {
    progetti?: { progetto: string; novita: string; doc?: string }[]
    github?: { testo: string; doc?: string }[]
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
/** L'origine del modello finto (`http://127.0.0.1:<porta>`), per le scene P4 che
 * servono un file statico da lì (`{{modello}}` in `p4.calendario.url`): la
 * porta cambia a ogni giro (P4 ha la sua, l'integrazione un'altra), e un URL
 * scritto a mano nella scena punterebbe sempre alla porta sbagliata altrove. */
const origineModello = urlModello ? new URL(urlModello).origin : ''
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
const regoleTurno = await import(join(SERVER, 'turno-regole.ts'))

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
/** «+1d» → il giorno locale di domani, «AAAA-MM-GG»; un giorno già scritto resta com'è. */
function giornoRelativo(v: string): string {
  const m = v.match(/^([+-])(\d+)d$/)
  if (!m) return v
  const d = new Date(); d.setDate(d.getDate() + (m[1] === '-' ? -1 : 1) * Number(m[2]))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Un turno di carta con i tempi relativi («-2h») resi veri. */
function turnoVero(t: unknown): string | null {
  if (!t || typeof t !== 'object') return null
  const x = { ...(t as Record<string, unknown>) }
  if (typeof x.dal === 'string') x.dal = tempo(x.dal)
  if (typeof x.ultimo === 'string') x.ultimo = tempo(x.ultimo)
  return JSON.stringify(x)
}

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

  // — P2: inizio —
  // Le note di un progetto (la memoria da cui nasce una priorità), i documenti
  // con «indicizzato» (quando Myynd li ha visti, per le carte mancate), e una
  // riga di controllo: la posta inviata passa intera da `salvaDocumenti`.
  for (const p of scena.progetti ?? []) {
    const id = ids.get(p.chiave ?? p.nome)
    const note = (p as { note?: string }).note
    if (id && note) progetti.cambia(id, { note })
  }
  for (const d of scena.documenti ?? []) {
    if (typeof d.indicizzato === 'string') store.default.prepare('UPDATE documenti SET indicizzato = ? WHERE id = ?').run(tempo(d.indicizzato), d.id)
  }
  const inviataDiControllo = (scena.documenti ?? []).find(d => d.inviato)
  if (inviataDiControllo) {
    const letta = store.documento(inviataDiControllo.id)
    for (const campo of ['inviato', 'filo', 'messageId', 'risponde', 'destinatari'] as const) {
      const atteso = inviataDiControllo[campo]
      if (atteso !== undefined && atteso !== null && String(letta?.[campo] ?? '') !== String(campo === 'inviato' ? 1 : atteso)) esci(`«${campo}» non è passato da salvaDocumenti per ${inviataDiControllo.id}: ${String(letta?.[campo])}`)
    }
  }
  // — P2: fine —

  const insFeed = store.default.prepare(`
    INSERT INTO feed (id, tipo, titolo, testo, urgenza, fonte, doc, stato, quando, perche, offerta, progetto, peso, ragione)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  for (const v of scena.feed ?? []) {
    insFeed.run(v.id, String(v.tipo ?? 'Priorità'), v.titolo, String(v.testo ?? ''), (v.urgenza as string) ?? null,
      (v.fonte as string) ?? null, (v.doc as string) ?? null, String(v.stato ?? 'aperto'), tempo(v.quando),
      (v.perche as string) ?? null, (v.offerta as string) ?? null, progetto(v.progetto),
      typeof v.peso === 'number' ? v.peso : null, (v.ragione as string) ?? null)
    // — P2: inizio —
    // quando l'ha vista, il motivo, quando l'ha chiusa, e l'istantanea (un
    // oggetto: il progetto dentro si scrive con l'id vero, non con la chiave)
    const contesto = v.contesto && typeof v.contesto === 'object'
      ? JSON.stringify({ ...(v.contesto as Record<string, unknown>), ...('progetto' in (v.contesto as object) ? { progetto: progetto((v.contesto as { progetto?: unknown }).progetto) } : {}) })
      : typeof v.contesto === 'string' ? v.contesto : null
    store.default.prepare('UPDATE feed SET vista = ?, motivo = ?, risposto = ?, contesto = ? WHERE id = ?').run(
      v.vista ? tempo(v.vista) : null, (v.motivo as string) ?? null, v.risposto ? tempo(v.risposto) : null, contesto, v.id)
    // — P2: fine —
  }

  for (const c of scena.compiti ?? []) {
    // in fondo al suo secchio, come una riga scritta a mano
    const quando = String(c.quando ?? 'oggi')
    store.scriviCompito({
      id: c.id, testo: c.testo, quando, ordine: chiavi.dopo(store.ultimoOrdine(quando)),
      progetto: progetto(c.progetto), nota: (c.nota as string) ?? null, doc: (c.doc as string) ?? null,
      // — P2: inizio —
      ...(c.origine ? { origine: String(c.origine) } : {}),
      // — P2: fine —
      // un giorno relativo («+1d», «-2d») diventa il giorno locale: le scene non invecchiano
      ...(c.giorno ? { giorno: giornoRelativo(String(c.giorno)) } : {}), ...(c.ora ? { ora: String(c.ora) } : {})
    })
    const campi: [string, unknown][] = [
      ['stato', c.stato], ['modo', c.modo], ['risultato', c.risultato], ['chieste', json(c.chieste)],
      ['revisione', json(c.revisione)], ['fonti', json(c.fonti)], ['ipotesi', json(c.ipotesi)],
      ['chiesto', c.stato && c.stato !== 'aperto' ? tempo(c.chiesto ?? '-1h') : undefined],
      ['chiuso', c.stato === 'fatto' ? tempo(c.chiuso ?? '-1h') : undefined],
      // — P2: inizio —
      ['creato', c.creato ? tempo(c.creato) : undefined]
      // — P2: fine —
    ]
    for (const [k, v] of campi) {
      if (v === undefined || v === null) continue
      store.default.prepare(`UPDATE compiti SET ${k} = ? WHERE id = ?`).run(v as string, c.id)
    }
    // — P3: inizio —
    // l'email pronta, la voce usata, la bozza partita dalla posta, la consegna,
    // le domande fatte e un guaio: le colonne di una riga consegnata
    const p3: [string, unknown][] = [
      ['email', json(c.email)], ['voceScritta', json(c.voceScritta)], ['mandata', json(c.mandata)], ['consegna', json(c.consegna)],
      ['domandeFatte', typeof c.domandeFatte === 'number' ? c.domandeFatte : undefined], ['guaio', (c.guaio as string) ?? undefined],
      // — F1: il contratto, la prova e il diario di una carta —
      ['contratto', json(c.contratto)], ['prova', json(c.prova)], ['diario', json(c.diario)], ['turno', turnoVero(c.turno)],
      ['aggiornato', c.aggiornato ? tempo(c.aggiornato) : undefined], ['priorita', (c.priorita as string) ?? undefined],
      // — E: la proposta di un ordine fisso, da approvare con un dito —
      ['proposta', json(c.proposta)]
    ]
    for (const [k, v] of p3) {
      if (v === undefined || v === null) continue
      store.default.prepare(`UPDATE compiti SET ${k} = ? WHERE id = ?`).run(v as string | number, c.id)
    }
    // — P3: fine —
  }

  // — F9: inizio —
  // Il turno di una scena: il budget, e una notte messa attorno all'ora della
  // prova («dentro»: cominciata un'ora fa; «fuori»: finita un'ora fa; «giorno»:
  // finita dieci ore fa, il pomeriggio della ricevuta), così la
  // scena non dipende da quando gira. Poi le spese delle carte nel registro
  // dell'uso, il diario con i tempi relativi resi veri, e quello che il conto
  // del turno ricorda dell'ultima notte (la fermata, i buchi).
  const f9 = scena as { turno?: { budget?: number; notte?: 'dentro' | 'fuori' | 'giorno' }; uso?: { compito: string; quando?: string; dollari: number; motore?: string }[]; turnoNotte?: { fermata?: 'budget' | 'stop'; buchi?: { da: string; a: string }[] } }
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  let finestra = regoleTurno.NOTTE_DI_SERIE
  if (f9.turno) {
    const adesso = Date.now()
    if (f9.turno.notte === 'dentro') finestra = { da: hhmm(new Date(adesso - 3_600_000)), a: hhmm(new Date(adesso + 6 * 3_600_000)) }
    if (f9.turno.notte === 'fuori') finestra = { da: hhmm(new Date(adesso - 8 * 3_600_000)), a: hhmm(new Date(adesso - 3_600_000)) }
    if (f9.turno.notte === 'giorno') finestra = { da: hhmm(new Date(adesso - 16 * 3_600_000)), a: hhmm(new Date(adesso - 10 * 3_600_000)) }
    cfg.aggiorna({ turno: { ...(f9.turno.budget !== undefined ? { budget: f9.turno.budget } : {}), ...(f9.turno.notte ? { notteDa: finestra.da, notteA: finestra.a } : {}) } })
  }
  for (const u of f9.uso ?? []) {
    store.default.prepare('INSERT INTO uso (quando, lavoro, motore, entrata, cache, uscita, compito, costo) VALUES (?,?,?,?,?,?,?,?)')
      .run(tempo(u.quando ?? '-1h'), 'bozza', u.motore ?? 'claude-sonnet-5', 4000, 0, 800, u.compito, Math.round(u.dollari * 1_000_000))
  }
  for (const c of scena.compiti ?? []) {
    if (!Array.isArray(c.diario)) continue
    const diario = (c.diario as { t?: string }[]).map(v => (typeof v.t === 'string' ? { ...v, t: tempo(v.t) } : v))
    store.default.prepare('UPDATE compiti SET diario = ? WHERE id = ?').run(JSON.stringify(diario), c.id)
  }
  // — F9: fine —

  // La ricevuta: le bozze partite questa settimana, come le scrivono «Manda»
  // e l'osservatore degli invii nelle misure (`via`, `inviato`, `classe`).
  for (const i of (scena as { invii?: { compito: string; via: string; classe: string; inviato?: string }[] }).invii ?? []) {
    store.default.prepare('INSERT OR REPLACE INTO misure_compiti (compito, affidato, via, inviato, classe) VALUES (?,?,?,?,?)')
      .run(i.compito, tempo('-2d'), i.via, tempo(i.inviato ?? '-1h'), i.classe)
  }

  // F2 · quante carte il turno ha già fatto partire oggi (F9: e quello che ricorda dell'ultima notte)
  if (typeof (scena as { turnoAvviate?: unknown }).turnoAvviate === 'number' || f9.turnoNotte) {
    const adesso = new Date()
    const notte = f9.turnoNotte
      ? { dal: regoleTurno.inizioUltimaNotte(adesso, finestra).toISOString(), fermata: f9.turnoNotte.fermata ? { perche: f9.turnoNotte.fermata, quando: tempo('-2h') } : null, buchi: (f9.turnoNotte.buchi ?? []).map(b => ({ da: tempo(b.da), a: tempo(b.a) })) }
      : undefined
    writeFileSync(join(cfg.cartella(), 'turno.json'), JSON.stringify({ giornata: regoleTurno.inizioGiornata(adesso, finestra).toISOString(), avviate: (scena as { turnoAvviate?: number }).turnoAvviate ?? 0, ...(notte ? { notte } : {}) }))
  }
  for (const d of scena.domande ?? []) {
    store.apriDomanda({ tema: d.tema, testo: d.testo, spunto: [], progetto: progetto(d.progetto) })
  }
  if (scena.riferimento) riferimento.scrivi(scena.riferimento)

  // — P7: inizio —
  if (scena.risposte) {
    if (scena.risposte.insieme) {
      const dove = join(cfg.cartella(), 'valutazioni', 'risposte')
      mkdirSync(dove, { recursive: true, mode: 0o700 })
      // un documento del disco ha per id il suo percorso, e la casa finta cambia
      // a ogni scena: «desktop:~/…» nell'insieme diventa la casa di questa scena
      const insieme = readFileSync(resolve(QUI, '..', scena.risposte.insieme), 'utf8').replaceAll('desktop:~/', `desktop:${resolve(CASA)}/`)
      writeFileSync(join(dove, 'domande.json'), insieme, { mode: 0o600 })
    }
    if (scena.risposte.attiva !== undefined) cfg.aggiorna({ provaRisposte: { attiva: scena.risposte.attiva } })
  }
  // — P7: fine —

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
      risposte: (p.risposte ?? []).map(riga),
      aggiornamenti: (p.aggiornamenti ?? []).map(riga)
    }
    // la forma dell'archivio di server/punto.ts; una chiamata contata oggi, come se l'avesse fatto lui
    writeFileSync(join(cfg.cartella(), 'punto.json'),
      JSON.stringify({ ultimo, progetti: [], scartati: [], chiamate: [adesso], avviate: [] }, null, 2), { mode: 0o600 })
  }
})

// — P1B: inizio —
// Il gemello: trentacinque giorni di posta con quattro mittenti, venti giorni di
// sessioni delle app, le righe di oggi e di ieri, l'osservatore acceso; poi si
// simula il passato con il codice vero (un giro alle otto, uno a mezzanotte e
// quaranta, per quattordici giorni) così la pagina ha un punteggio e delle righe.
//   "gemello": { "giorni": 35, "seme": 7, "osservatore": true }
type ScenaGemello = { giorni?: number; seme?: number; osservatore?: boolean }
const ricetta = (scena as unknown as { gemello?: ScenaGemello }).gemello
if (ricetta) {
  const gemello = await import(join(SERVER, 'gemello.ts'))
  const osservatore = await import(join(SERVER, 'osservatore.ts'))
  const fuso = await import(join(SERVER, 'fuso.ts'))
  const GIORNO = 86_400_000
  // un generatore piccolo e fisso: la stessa scena ogni volta
  let stato = (ricetta.seme ?? 7) >>> 0 || 7
  const caso = () => { stato = (stato * 1664525 + 1013904223) >>> 0; return stato / 4294967296 }
  const giorni = ricetta.giorni ?? 35
  const oggi = fuso.giornoIn(new Date())
  const [aa, mm, gg] = oggi.split('-').map(Number) as [number, number, number]
  const alle = (giorniFa: number, ore: number, minuti = 0) => new Date(fuso.istante(aa, mm, gg - giorniFa, ore).getTime() + minuti * 60_000)
  const feriale = (d: Date) => { const s = fuso.parti(d).settimana; return s >= 1 && s <= 5 }

  await chi.dentro(conto.id, async () => {
    // la casella: serve perché il gemello parli di posta; l'indirizzo è il suo, e nessun server risponde lì
    cfg.aggiorna({ posta: { host: '127.0.0.1', porta: 1, utente: 'alex@acme.example', password: 'finta', cartelle: ['INBOX', 'Sent'], giorni: 30 }, fuso: fuso.fusoDi() })
    const idNw = progetti.elenco('attivo').find(p => p.nome === 'Northwind')?.id ?? null
    const idHb = progetti.elenco('attivo').find(p => p.nome === 'Harbor Labs')?.id ?? null

    type Mittente = { nome: string; indirizzo: string; alGiorno: number; risponde: number; oreRisposta: number; titoli: string[]; massa?: boolean }
    const mittenti: Mittente[] = [
      { nome: 'Nora Vance', indirizzo: 'nora@harbor.example', alGiorno: 1, risponde: 1, oreRisposta: 2, titoli: ['Harbor Labs pilot scope', 'Harbor Labs invoices batch', 'Harbor Labs kickoff notes'] },
      { nome: 'Sam Ortiz', indirizzo: 'sam@lumen.example', alGiorno: 0.6, risponde: 0.9, oreRisposta: 4, titoli: ['Course outline draft', 'Lumen landing page copy', 'Pricing question'] },
      { nome: 'Priya Shah', indirizzo: 'priya@audit.example', alGiorno: 0.8, risponde: 0.05, oreRisposta: 6, titoli: ['Audit checklist reminder', 'Can you confirm the audit slot?', 'Compliance questionnaire'] },
      { nome: 'Deals Weekly', indirizzo: 'news@deals.example', alGiorno: 1, risponde: 0, oreRisposta: 0, titoli: ['This week: 40% off everything'], massa: true }
    ]
    const docs: Record<string, unknown>[] = []
    let n = 1000
    // una risposta non può stare nel futuro: quella della mattina dopo a una mail di ieri sera, se la scena
    // parte prima di quell'ora, non c'è ancora (e la mail resta, com'è vero, senza risposta)
    const tettoRisposte = Date.now() - 60_000
    for (let d = giorni; d >= 1; d--) {
      for (const m of mittenti) {
        if (caso() >= m.alGiorno) continue
        n++
        // un terzo delle mail di Nora arriva la sera e ha risposta la mattina dopo: sono le affermazioni «risponderai»
        const sera = m.nome === 'Nora Vance' && caso() < 0.35
        const quando = sera ? alle(d, 18 + Math.floor(caso() * 3), Math.floor(caso() * 60)) : alle(d, 9 + Math.floor(caso() * 8), Math.floor(caso() * 60))
        const titolo = m.titoli[Math.floor(caso() * m.titoli.length)]!
        docs.push({
          id: `posta:INBOX:${n}`, fonte: 'posta', tipo: 'email', titolo, corpo: m.massa ? 'Shop now. Unsubscribe here.' : `Hi Alex, ${titolo.toLowerCase()}. Could you have a look? Thanks, ${m.nome.split(' ')[0]}`,
          autore: `${m.nome} <${m.indirizzo}>`, percorso: 'INBOX', gruppo: 'posta', quando: quando.toISOString(), filo: `f${n}@acme.example`, messageId: `m${n}@${m.indirizzo.split('@')[1]}`,
          ...(m.massa ? { massa: true } : {})
        })
        if (!m.massa && caso() < m.risponde) {
          const dopo = sera ? alle(d - 1, 9, 10 + Math.floor(caso() * 90)) : new Date(quando.getTime() + m.oreRisposta * 3_600_000 * (0.6 + caso() * 0.8))
          if (dopo.getTime() > tettoRisposte) continue
          docs.push({
            id: `posta:Sent:${n}`, fonte: 'posta', tipo: 'email', titolo: `Re: ${titolo}`, corpo: `Hi ${m.nome.split(' ')[0]}, sure. Alex`,
            autore: 'Alex <alex@acme.example>', percorso: 'Sent', gruppo: 'posta', quando: dopo.toISOString(), inviato: true,
            filo: `f${n}@acme.example`, messageId: `s${n}@acme.example`, risponde: `m${n}@${m.indirizzo.split('@')[1]}`, destinatari: m.indirizzo
          })
        }
      }
    }
    store.salvaDocumenti(docs as Parameters<typeof store.salvaDocumenti>[0])

    // le sessioni delle app: venti giorni, Safari tre ore e mezza e Code due, dalle nove alle diciannove
    const ins = store.default.prepare('INSERT INTO sessioni_app (bundle, app, titolo, inizio, fine, secondi, giorno, progetto, cartella) VALUES (?,?,?,?,?,?,?,?,?)')
    for (let d = 20; d >= 1; d--) {
      if (!feriale(alle(d, 12))) continue
      const giorno = fuso.giornoIn(alle(d, 12))
      const blocchi: [string, string, string | null, number, number, string | null][] = [
        ['com.apple.Safari', 'Safari', 'Northwind pricing - Google Docs', 9, 2, idNw],
        ['com.microsoft.VSCode', 'Code', 'northwind - app.tsx', 11, 2, idNw],
        ['com.apple.Safari', 'Safari', 'Inbox - Gmail', 14, 1.5, null],
        ['com.apple.mail', 'Mail', null, 16, 1, null],
        ['com.tinyspeck.slackmacgap', 'Slack', 'general - Harbor Labs', 17.5, 1.5, idHb]
      ]
      for (const [bundle, app, titolo, ora, ore, progetto] of blocchi) {
        const inizio = alle(d, ora), fine = new Date(inizio.getTime() + ore * 3_600_000)
        ins.run(bundle, app, titolo, inizio.toISOString(), fine.toISOString(), Math.round(ore * 3600), giorno, progetto, titolo?.startsWith('northwind') ? 'northwind' : null)
      }
    }

    // le righe: tre di oggi (una pronta, una alta), otto nei giorni scorsi (cinque chiuse in giornata, tre dopo)
    const riga = (id: string, testo: string, giorno: string, progetto: string | null) =>
      store.scriviCompito({ id, testo, quando: 'oggi', ordine: chiavi.dopo(store.ultimoOrdine('oggi')), progetto, giorno })
    riga('g-oggi-1', 'Reply to App Review with the differences from similar apps', oggi, idNw)
    riga('g-oggi-2', 'Send Nora the pilot outline', oggi, idHb)
    riga('g-oggi-3', 'Record the review video for build 1.0.4', oggi, idNw)
    store.default.prepare("UPDATE compiti SET stato = 'pronto', risultato = 'Hi Nora, here is the outline.' WHERE id = 'g-oggi-2'").run()
    store.default.prepare("UPDATE compiti SET priorita = 'alta' WHERE id = 'g-oggi-1'").run()
    for (let i = 1; i <= 8; i++) {
      const giornoRiga = fuso.giornoIn(alle(i + 1, 12))
      riga(`g-passata-${i}`, `Planned thing ${i}`, giornoRiga, i % 2 ? idNw : idHb)
      const chiusa = i <= 5 ? alle(i + 1, 16) : alle(i - 1 > 0 ? i - 1 : 0, 10)
      store.default.prepare("UPDATE compiti SET stato = 'fatto', chiuso = ?, creato = ? WHERE id = ?").run(chiusa.toISOString(), alle(i + 2, 9).toISOString(), `g-passata-${i}`)
    }

    // l'osservatore: il conto di sviluppo è il proprietario, coi titoli
    if (ricetta.osservatore) osservatore.imposta({ acceso: true, titoli: true })

    // il passato, con il codice vero: ogni giorno D un giro alle otto, poi la lettura di mezzanotte e un giro alle 00:40
    // la lettura di mezzanotte non può stare nel futuro: fra mezzanotte e le 00:30 vale un minuto fa
    const tetto = Date.now() - 60_000
    for (let d = 14; d >= 1; d--) {
      await gemello.giro(alle(d, 8))
      store.segnaCursore('gemello:letta', new Date(Math.min(alle(d - 1, 0, 30).getTime(), tetto)).toISOString())
      await gemello.giro(alle(d - 1, 0, 40))
    }
    // anche la mattina di oggi alle otto (o adesso, se le otto non sono passate): dalle sedici non si afferma più
    await gemello.giro(new Date(Math.min(alle(0, 8).getTime(), Date.now())))
    await gemello.giro(new Date())
    const affermazioni = (store.default.prepare('SELECT COUNT(*) AS n FROM previsioni').get() as { n: number }).n
    const verificati = (store.default.prepare('SELECT COUNT(*) AS n FROM punteggi').get() as { n: number }).n
    const righe = (store.default.prepare('SELECT COUNT(*) AS n FROM abitudini').get() as { n: number }).n
    console.log(`semina · gemello: ${docs.length} mail, ${affermazioni} affermazioni, ${verificati} giorni verificati, ${righe} righe`)
  })
}
// — P1B: fine —

// — P8: inizio —
if ((scena as Record<string, unknown>).p8) {
  const p8 = await import(join(QUI, 'semina-p8.ts'))
  chi.dentro(conto.id, () => p8.semina((scena as Record<string, unknown>).p8, { casa: CASA }))
}
// — P8: fine —

// — P6: inizio —
if ((scena as Record<string, unknown>).p6) {
  const p6 = await import(join(QUI, 'semina-p6.ts'))
  chi.dentro(conto.id, () => p6.semina((scena as Record<string, unknown>).p6, { dati: DATI }))
}
// — P6: fine —

// — P9: inizio —
if ((scena as Record<string, unknown>).p9) {
  const p9 = await import(join(QUI, 'semina-p9.ts'))
  chi.dentro(conto.id, () => p9.semina((scena as Record<string, unknown>).p9, { casa: CASA }))
}
// — P9: fine —

// — P4: inizio —
/*
 * Il primo avvio di un conto nuovo: `scena.p4` = { onboarding?: false,
 * imbuto?: true, senzaModello?: true, calendario?: { url, nome },
 * postaMac?: { caselle, inArrivo, inviate, vecchie, spazzatura },
 * fileDatati?: { nome, testo, giorni }[] }. Mail del Mac la collegano i passi;
 * qui si scrive solo la sua cartella finta, sotto la casa finta.
 */
type ScenaP4 = {
  onboarding?: boolean; imbuto?: boolean; senzaModello?: boolean
  calendario?: { url: string; nome?: string }
  postaMac?: { caselle: number; inArrivo: number; inviate: number; vecchie: number; spazzatura: number; risposte?: number }
  fileDatati?: { nome: string; testo: string; giorni: number }[]
  /** L'accesso completo al disco negato: un archivio delle Note che non si apre (permessi 000), così il server dice «no». */
  discoChiuso?: boolean
}
const p4 = (scena as Record<string, unknown>).p4 as ScenaP4 | undefined
if (p4) {
  const { utimesSync } = await import('node:fs')
  const imbuto = await import(join(SERVER, 'imbuto.ts'))
  const { costruisciMail } = await import(join(SERVER, 'posta-mac-finta.ts'))
  for (const f of p4.fileDatati ?? []) {
    const p = join(cartella, f.nome)
    writeFileSync(p, f.testo)
    const quando = new Date(Date.now() - Math.abs(f.giorni) * 86_400_000)
    utimesSync(p, quando, quando)
  }
  if (p4.postaMac) costruisciMail(CASA, p4.postaMac)
  if (p4.discoChiuso) {
    // un file e non una cartella: chi pulisce la casa finta lo toglie anche con i permessi a zero
    const note = join(CASA, 'Library', 'Group Containers', 'group.com.apple.notes')
    mkdirSync(note, { recursive: true })
    writeFileSync(join(note, 'NoteStore.sqlite'), '', { mode: 0o000 })
  }
  chi.dentro(conto.id, () => {
    const c = cfg.leggi()
    if (p4.onboarding === false) { c.onboarding = false; c.giro = false }
    if (p4.calendario) c.calendario = { url: p4.calendario.url.replace('{{modello}}', origineModello), ...(p4.calendario.nome ? { nome: p4.calendario.nome } : {}) }
    if (p4.senzaModello) { delete c.compatibile; delete c.motore }
    cfg.scrivi(c, { togli: p4.senzaModello ? ['compatibile', 'motore', 'credenzialiModelli'] : [] })
    if (p4.imbuto) imbuto.nasce()
  })
}
// — P4: fine —

// — P5: inizio —
// La Memoria chiara e le Preferenze: convinzioni (che aspettano, tenute, dette
// da lei), le cinque risposte, il fuoco scritto da Myynd, qualche scelta di
// configurazione, l'ultima visita alla Memoria, e una consegna per compito
// (un file che c'è, uno spostato). Gira per ultimo: la convinzione più nuova
// è sua, e la Memoria atterra sul ritratto.
//   "convinzioni": [{ "enunciato": "…", "genere": "indotta", "fiducia": 0.6, "origine": "chiusura", "confermata": true }]
//   "blocchi": [{ "etichetta": "come_decido", "valore": "…" }]
//   "fuoco": "Supplier invoices and payments"
//   "config": { "tono": "diretto", "tema": "sistema", "autonomia": "chiedere", "osservatore": true }
//   "memoriaVista": "-1d"
//   "compiti": [{ …, "consegna": { "titolo": "…", "percorso": "~/Documents/x.md" | "/non/c/e.md", "app": "File" } }]
type ScenaP5 = {
  convinzioni?: { enunciato: string; genere: 'esplicita' | 'dedotta' | 'indotta'; fiducia?: number; origine: string; ambito?: string; confermata?: boolean; dal?: string }[]
  blocchi?: { etichetta: string; valore: string }[]
  fuoco?: string
  config?: { tono?: string; tema?: string; autonomia?: string; osservatore?: boolean }
  memoriaVista?: string
  compiti?: { id: string; consegna?: { titolo: string; percorso: string; app?: string; dove?: string } }[]
}
const p5 = scena as unknown as ScenaP5
if (p5.convinzioni || p5.blocchi || p5.fuoco || p5.config || p5.memoriaVista || p5.compiti?.some(c => c.consegna)) {
  const timone = await import(join(SERVER, 'timone.ts'))
  const osservatoreP5 = await import(join(SERVER, 'osservatore.ts'))
  chi.dentro(conto.id, () => {
    if (p5.config) {
      const { osservatore: oss, ...resto } = p5.config
      cfg.aggiorna(resto)
      if (oss) osservatoreP5.imposta({ acceso: true, titoli: true })
    }
    if (p5.fuoco) { timone.scriviFuoco(p5.fuoco); cfg.aggiorna({ fuocoDaMe: true }) }
    for (const b of p5.blocchi ?? []) store.scriviBlocco({ etichetta: b.etichetta, descrizione: b.etichetta, valore: b.valore })
    for (const c of p5.compiti ?? []) {
      if (!c.consegna) continue
      const percorso = c.consegna.percorso.startsWith('~/') ? join(CASA, c.consegna.percorso.slice(2)) : c.consegna.percorso
      if (c.consegna.percorso.startsWith('~/')) { mkdirSync(dirname(percorso), { recursive: true }); writeFileSync(percorso, `# ${c.consegna.titolo}\n`) }
      store.default.prepare('UPDATE compiti SET consegna = ? WHERE id = ?')
        .run(JSON.stringify({ titolo: c.consegna.titolo, percorso, app: c.consegna.app ?? 'File', ...(c.consegna.dove ? { dove: c.consegna.dove } : {}) }), c.id)
    }
    if (p5.memoriaVista) cfg.aggiorna({ memoriaVista: tempo(p5.memoriaVista) })
    // le convinzioni per ultime: la più nuova è quella che accende il punto
    for (const k of p5.convinzioni ?? []) {
      const id = store.ricorda({ enunciato: k.enunciato, ambito: k.ambito ?? 'persona', genere: k.genere, fiducia: k.fiducia ?? (k.genere === 'esplicita' ? 1 : 0.6), origine: k.origine, ...(k.dal ? { dal: tempo(k.dal) } : {}) })
      if (k.confermata) store.confermaConvinzione(id)
    }
  })
  console.log(`semina · P5: ${p5.convinzioni?.length ?? 0} convinzioni, ${p5.blocchi?.length ?? 0} risposte`)
}
// — P5: fine —

// — F7: inizio —
// Le regole nate dai gesti: righe di «Come lavori» scritte com'erano, i filtri
// del feed rifatti dalla tabella (dopo il feed seminato sopra), i temi dedotti,
// e quello che un filtro ha tenuto fuori (una riga di `feed_esame`).
//   "abitudini": [{ "chiave": "bozza.tono:corta", "genere": "bozza.tono", "dati": {…}, "casi": 2, "esempi": [{ "quando": "-1d", "testo": "…" }], "mostra": 2, "stato": "osservata", "visto": "-3d", "dal": "-1d" }]
//   "filtri": true
//   "temi": [{ "tema": "rinnov", "frase": "…", "titoli": ["…"] }]
//   "esame": [{ "doc": "posta:INBOX:1", "fase": "filtro", "motivo": "feed.filtro:mittente:…", "quando": "-1d" }]
type ScenaF7 = {
  abitudini?: { chiave: string; genere: string; dati: Record<string, string | number>; casi: number; esempi?: { quando: string; testo: string; doc?: string }[]; mostra?: number; soglia?: number; stato?: string; visto?: string; dal?: string }[]
  filtri?: boolean
  temi?: { tema: string; frase: string; titoli: string[] }[]
  esame?: { doc: string; fase: string; motivo: string; quando?: string }[]
}
const f7 = scena as unknown as ScenaF7
if (f7.abitudini || f7.filtri || f7.temi || f7.esame) {
  const abitudiniF7 = await import(join(SERVER, 'abitudini.ts'))
  const feedDatiF7 = await import(join(SERVER, 'feed-dati.ts'))
  chi.dentro(conto.id, () => {
    const ins = store.default.prepare(`INSERT OR REPLACE INTO abitudini (chiave, genere, dati, prova, fiducia, stato, testoSuo, visto, aggiornato, tolta) VALUES (?,?,?,?,1,?,NULL,?,?,NULL)`)
    for (const a of f7.abitudini ?? []) {
      const prova = { casi: a.casi, su: null, esempi: (a.esempi ?? []).map(e => ({ quando: tempo(e.quando), testo: e.testo, doc: e.doc ?? null })),
        ...(a.mostra ? { mostra: a.mostra } : {}), ...(a.soglia ? { soglia: a.soglia } : {}), ...(a.dal ? { dal: tempo(a.dal) } : {}) }
      ins.run(a.chiave, a.genere, JSON.stringify(a.dati), JSON.stringify(prova), a.stato ?? 'osservata', tempo(a.visto ?? '-2d'), tempo(a.visto ?? '-2d'))
    }
    for (const t of f7.temi ?? []) abitudiniF7.regolaTema(t.tema, t.frase, t.titoli)
    if (f7.filtri) abitudiniF7.ricalcolaFiltri()
    for (const e of f7.esame ?? []) feedDatiF7.segnaEsame([{ doc: e.doc, fase: e.fase, motivo: e.motivo }], tempo(e.quando ?? 'adesso'))
  })
  console.log(`semina · F7: ${f7.abitudini?.length ?? 0} regole, ${f7.temi?.length ?? 0} temi, filtri ${f7.filtri ? 'rifatti' : 'no'}`)
}
// — F7: fine —

// — F6: inizio —
// Il primo giorno: quello che c'è su un Mac vero prima dell'installazione.
//   "f6": {
//     "git": [{ "cartella": "atlas", "commit": [12, 15, …] }],   // un commit suo per ogni giorno fa, nella casa finta
//     "sessioni": { "cwd": "/Users/alex/Code/atlas", "giorni": [1, 2, …] },   // Claude Code, sotto ~/.claude/projects
//     "chatgpt": { "titolo": "New website", "giorni": [3, 9, …] }             // un'esportazione di ChatGPT, collegata
//   }
// Le sessioni hanno una cartella fuori dalla casa finta apposta: quelle sotto
// la cartella temporanea Myynd non le legge (sono le sue).
type ScenaF6 = {
  git?: { cartella: string; commit: number[] }[]
  sessioni?: { cwd: string; giorni: number[] }
  chatgpt?: { titolo: string; giorni: number[] }
}
const f6 = (scena as Record<string, unknown>).f6 as ScenaF6 | undefined
if (f6) {
  const { execFileSync } = await import('node:child_process')
  const giorniFa = (g: number, ora = 10) => { const d = new Date(Date.now() - g * 86_400_000); d.setHours(ora, 0, 0, 0); return d }
  writeFileSync(join(CASA, '.gitconfig'), '[user]\n\tname = Alex Morgan\n\temail = alex@morgan-works.test\n')
  for (const r of f6.git ?? []) {
    const dir = join(cartella, r.cartella)
    mkdirSync(dir, { recursive: true })
    const git = (args: string[], quando?: Date) => execFileSync('git', ['-C', dir, ...args], {
      env: { PATH: process.env.PATH ?? '', HOME: CASA, ...(quando ? { GIT_AUTHOR_DATE: quando.toISOString(), GIT_COMMITTER_DATE: quando.toISOString() } : {}) }, stdio: 'ignore'
    })
    git(['init', '-q'])
    writeFileSync(join(dir, 'README.md'), `# ${r.cartella}\n\nThe ${r.cartella} importer.\n`)
    const messaggi = ['Fix the CSV importer for empty rows', 'Add retries to the sync job', 'Tidy the settings page', 'Speed up the search index', 'Handle time zones in reports', 'Write tests for the parser']
    r.commit.slice().sort((a, b) => b - a).forEach((g, i) => {
      writeFileSync(join(dir, 'CHANGES.md'), `change ${i}\n`)
      git(['add', '-A'])
      git(['commit', '-q', '-m', messaggi[i % messaggi.length]!], giorniFa(g, 9 + (i % 6)))
    })
  }
  if (f6.sessioni) {
    const cartellaProgetto = join(CASA, '.claude', 'projects', f6.sessioni.cwd.replace(/[/.]/g, '-'))
    mkdirSync(cartellaProgetto, { recursive: true })
    for (const [i, g] of f6.sessioni.giorni.entries()) {
      const t0 = giorniFa(g, 11)
      const riga = (tipo: 'user' | 'assistant', testo: string, min: number) => JSON.stringify({ type: tipo, sessionId: `sessione-${i}`, cwd: f6.sessioni!.cwd,
        timestamp: new Date(t0.getTime() + min * 60_000).toISOString(), message: { role: tipo, content: testo } })
      writeFileSync(join(cartellaProgetto, `sessione-${i}.jsonl`), [
        riga('user', `Let's work on the atlas importer today: the CSV rows with empty cells still break the sync, can you look at session ${i}?`, 0),
        riga('assistant', 'I found the problem in the row parser and fixed it, the tests pass now.', 12)
      ].join('\n') + '\n')
    }
  }
  if (f6.chatgpt) {
    const esportazione = f6.chatgpt.giorni.map((g, i) => {
      const t = giorniFa(g, 18).getTime() / 1000
      return {
        id: `chatgpt-${i}`, title: `${f6.chatgpt!.titolo}: idea ${i + 1}`, create_time: t, update_time: t + 600, current_node: 'b',
        mapping: {
          a: { id: 'a', parent: null, children: ['b'], message: { author: { role: 'user' }, create_time: t, content: { content_type: 'text', parts: [`Help me think about the ${f6.chatgpt!.titolo} launch: what should the homepage say first, and what can wait until after October?`] } } },
          b: { id: 'b', parent: 'a', children: [], message: { author: { role: 'assistant' }, create_time: t + 60, content: { content_type: 'text', parts: ['Lead with what the studio does, then the work, then the contact.'] } } }
        }
      }
    })
    const file = join(CASA, 'Downloads', 'chatgpt-export', 'conversations.json')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(esportazione))
    chi.dentro(conto.id, () => cfg.aggiorna({ conversazioni: { file: [file], codice: true } }))
  }
  console.log(`semina · F6: ${f6.git?.length ?? 0} cartelle git, ${f6.sessioni?.giorni.length ?? 0} sessioni, ${f6.chatgpt?.giorni.length ?? 0} chat`)
}
// — F6: fine —

// — F8: inizio —
/*
 * Il lavoro senza la chiave API: `scena.f8` = { account?: true, incluso?: { token } }.
 *
 * `account`: un `claude` finto nella casa finta (`~/.local/bin/claude`, dove lo
 * cerca `lavoro.ts` all'avvio del server), che manda la domanda al modello
 * finto (`/v1/chat/completions`, con il prompt di sistema e lo stdin) e
 * rimette la risposta nella busta di `claude -p --output-format json`; il
 * conto lavora con l'account (`claudeCon: 'abbonamento'`), senza il fornitore
 * compatibile. `incluso`: il conto sceglie l'AI inclusa con quel gettone; il
 * ponte lo dà `INCLUSO=1 prove/scena.sh`, che punta MYYND_INCLUSO_URL al
 * modello finto.
 */
type ScenaF8 = { account?: boolean; incluso?: { token: string } }
const f8 = (scena as Record<string, unknown>).f8 as ScenaF8 | undefined
if (f8) {
  if (f8.account) {
    if (!urlModello) esci('f8.account vuole --modello: il claude finto parla con il modello finto')
    const bin = join(CASA, '.local', 'bin')
    mkdirSync(bin, { recursive: true })
    const { chmodSync } = await import('node:fs')
    writeFileSync(join(bin, 'claude'), `#!${process.execPath}
// Claude Code finto (F8): la domanda va al modello finto, la risposta torna nella busta.
const args = process.argv.slice(2)
if (args[0] === 'auth') { console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' })); process.exit(0) }
if (args[0] === '--help') { console.log('  --tools <tools>  --effort <level>  --no-session-persistence'); process.exit(0) }
let dentro = ''
process.stdin.on('data', d => { dentro += d })
process.stdin.on('end', async () => {
  const sistema = args[args.indexOf('--system-prompt') + 1] || ''
  try {
    const r = await fetch(${JSON.stringify(urlModello.replace(/\/?$/, '/'))} + 'chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'finto', messages: [{ role: 'system', content: sistema }, { role: 'user', content: dentro }] })
    })
    const d = await r.json()
    const result = d.choices?.[0]?.message?.content ?? ''
    console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: !result, result, usage: { input_tokens: Math.ceil((sistema.length + dentro.length) / 4), output_tokens: Math.ceil(result.length / 4) } }))
  } catch (e) {
    console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'finto: ' + e.message }))
  }
})
`)
    chmodSync(join(bin, 'claude'), 0o755)
  }
  chi.dentro(conto.id, () => {
    const c = cfg.leggi()
    delete c.compatibile
    delete c.motore
    if (f8.account) c.claudeCon = 'abbonamento'
    if (f8.incluso) { c.motore = 'incluso'; c.incluso = { token: f8.incluso.token } }
    cfg.scrivi(c, { togli: ['compatibile', 'motore', 'credenzialiModelli'] })
  })
}
// — F8: fine —

// — la salute dei motori: inizio —
/*
 * `scena.motori` = { spento?: true, chatgptUscito?: true }.
 *
 * `spento`: il modello sul Mac scelto, a un indirizzo dove non risponde
 * nessuno (la porta 9 di questa macchina), e nessun altro motore: la riga
 * fissa dice che non risponde. `chatgptUscito`: l'account ChatGPT scelto, con
 * un componente finto nella casa finta che dice «nessun account»; il modello
 * finto resta collegato e risponde, quindi Myynd lavora con lui e la riga lo
 * dice. Niente esce da questa macchina.
 */
type ScenaMotori = { spento?: boolean; chatgptUscito?: boolean }
const motori = (scena as Record<string, unknown>).motori as ScenaMotori | undefined
if (motori) {
  if (motori.chatgptUscito) {
    const { VERSIONE_CHATGPT } = await import(join(SERVER, 'chatgpt-runtime.ts'))
    const base = join(CASA, 'Library', 'Caches', 'myynd-binari', 'codex', VERSIONE_CHATGPT, `${process.platform}-${process.arch}`)
    mkdirSync(join(base, 'bin'), { recursive: true })
    writeFileSync(join(base, 'runtime.json'), JSON.stringify({ version: VERSIONE_CHATGPT, platform: process.platform, arch: process.arch }))
    const { chmodSync } = await import('node:fs')
    writeFileSync(join(base, 'bin', 'codex'), `#!${process.execPath}
// Il componente di ChatGPT, finto: risponde a tutto, e dice che nessuno è entrato.
require('node:readline').createInterface({ input: process.stdin }).on('line', l => {
  let m; try { m = JSON.parse(l) } catch { return }
  if (m.id === undefined || !m.method) return
  const result = m.method === 'account/read' ? { account: null } : m.method === 'config/read' ? { config: {} } : {}
  process.stdout.write(JSON.stringify({ id: m.id, result }) + '\\n')
})
`)
    chmodSync(join(base, 'bin', 'codex'), 0o755)
  }
  chi.dentro(conto.id, () => {
    const c = cfg.leggi()
    if (motori.spento && c.compatibile) { c.compatibile = { ...c.compatibile, url: 'http://127.0.0.1:9/v1' }; c.motore = 'compatibile' }
    if (motori.chatgptUscito) { c.motore = 'chatgpt'; c.chatgpt = { attivo: true, email: 'alex@morgan-works.test' } }
    cfg.scrivi(c)
  })
}
// — la salute dei motori: fine —
// — D: inizio —
// Quello che si vede di quello che ha imparato: il primo gradino (le risposte
// partite com'erano, una per segnale) e una convinzione tenuta da un lavoro
// corretto, con la riga che la segue (l'id si sa solo dopo averla scritta).
//   "gradini": [{ "indirizzo": "nora@harbor.example", "nome": "Nora", "distanze": [0, 0.1, 0, 0] }]
//   "imparate": [{ "compito": "c-doc", "enunciato": "…", "ambito": "persona" }]
type ScenaD = {
  gradini?: { indirizzo: string; nome: string; distanze: number[] }[]
  imparate?: { compito: string; enunciato: string; ambito?: string }[]
}
const sd = scena as unknown as ScenaD
if (sd.gradini || sd.imparate) {
  const gradinoD = await import(join(SERVER, 'gradino.ts'))
  chi.dentro(conto.id, () => {
    for (const g of sd.gradini ?? []) {
      g.distanze.forEach((distanza, i) => gradinoD.registraInvio({ compito: `semina-${g.indirizzo}-${i}`, indirizzo: g.indirizzo, nome: g.nome, distanza, quando: tempo(`-${g.distanze.length - i}d`) }))
    }
    for (const k of sd.imparate ?? []) {
      const id = store.ricorda({ enunciato: k.enunciato, ambito: k.ambito ?? 'persona', genere: 'indotta', fiducia: 0.6, origine: 'correzione' })
      store.confermaConvinzione(id)
      const c = store.compito(k.compito)
      const regole = [...(c?.voceScritta?.regole ?? []), { chiave: id, genere: 'convinzione', casi: 0, testo: k.enunciato }]
      store.default.prepare('UPDATE compiti SET voceScritta = ? WHERE id = ?').run(JSON.stringify({ ...(c?.voceScritta ?? {}), regole }), k.compito)
    }
  })
  console.log(`semina · D: ${sd.gradini?.length ?? 0} gradini, ${sd.imparate?.length ?? 0} convinzioni seguite`)
}
// — D: fine —

store.chiudiIndici()
console.log(`semina · fatto: ${conto.id} in ${DATI}`)
