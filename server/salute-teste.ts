// La salute del motore che lavora: guardata dal vivo, mai un episodio.
//
// Un motore non si «legge»: o risponde o no, e la risposta cambia da sola
// (si rientra in Claude Code dal Terminale, si incolla una chiave nuova). Qui
// si dice il suo guaio di adesso — uscito dall'account, chiave rifiutata,
// credito finito — e si scrive una riga al giorno per lui, solo quando lo
// stato cambia. Il modello sul computer (`compatibile`) non conta mai: non ha
// una riga, e il suo spegnersi non fa un giorno guasto.
//
// «Anthropic keeps disconnecting, every time you redeploy»: con questo, il
// giorno in cui succede resta scritto, e la prima pagina lo dice con il
// bottone per rientrare.
//
// E ogni motore, non solo Claude. Il modello sul Mac spento, ChatGPT da cui
// si è usciti, il ponte dell'AI inclusa che rifiuta: prima nessuno lo diceva,
// e la prima pagina restava vuota come in una giornata senza niente. Adesso la
// salute bussa al motore scelto ogni pochi minuti (`sonda`), solo a quello, e
// la riga fissa dice il guaio con il posto dove si sistema. Se è morto e un
// altro motore collegato risponde, lavora l'altro finché il primo non torna
// (`modello.riparaIlMotore`), e la riga lo dice.

import db from './store.ts'
import * as chi from './chi.ts'
import * as mod from './modello.ts'
import * as abbonamento from './abbonamento.ts'
import * as compatibile from './compatibile.ts'
import * as chatgpt from './chatgpt.ts'
import * as incluso from './incluso.ts'
import { leggi } from './config.ts'
import { giornoIn } from './fuso.ts'
import { peggiore, type Rimedio } from './connettori/guaio.ts'
import { versioneApp } from './salute-fonti.ts'

export type Testa = 'claude' | 'openai'

/** Il guaio del motore, se c'è: un nuovo accesso, una chiave, o il credito. */
export function problemaTesta(id: Testa): { rimedio: 'accedi' | 'credenziale' | 'credito' } | null {
  // uscito dall'account anche se una chiave lo tiene in piedi: sta pagando a
  // consumo senza saperlo, e va detto
  if (id === 'claude' && abbonamento.uscito()) return { rimedio: 'accedi' }
  if (mod.rifiutata(id)) return { rimedio: 'credenziale' }
  if (mod.testaAlLavoro() === id && mod.mancaIlCredito()) return { rimedio: 'credito' }
  return null
}


/** L'ultimo stato scritto, per persona: si scrive solo quando cambia. */
const scritti = new Map<string, { giorno: string; testa: Testa; stato: string }>()

/**
 * Una riga del giorno per il motore che lavora, quando il suo stato cambia.
 *
 * `'ok'` dice solo che una chiamata è appena andata bene: un account da cui
 * si è usciti mentre una chiave risponde resta «accedi».
 */
export function segnaTesta(_esito?: 'ok'): void {
  const t = mod.testaAlLavoro()
  if (t !== 'claude' && t !== 'openai') return
  const stato = problemaTesta(t)?.rimedio ?? 'ok'
  const adesso = new Date()
  const giorno = giornoIn(adesso)
  const k = chi.adesso() ?? ''
  const prima = scritti.get(k)
  if (prima && prima.giorno === giorno && prima.testa === t && prima.stato === stato) return
  const iso = adesso.toISOString()
  const r = db.prepare('SELECT rimedio FROM salute_fonti WHERE giorno = ? AND fonte = ?').get(giorno, t) as { rimedio: string | null } | undefined
  const rimedio = stato === 'ok' ? (r?.rimedio ?? null) : peggiore((r?.rimedio ?? null) as Rimedio | null, stato)
  db.prepare(`
    INSERT INTO salute_fonti (giorno, fonte, letture, pulite, guai, rimedio, versione, prima, ultima)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(giorno, fonte) DO UPDATE SET letture = letture + 1, pulite = pulite + excluded.pulite, guai = guai + excluded.guai,
      rimedio = excluded.rimedio, versione = excluded.versione, ultima = excluded.ultima
  `).run(giorno, t, stato === 'ok' ? 1 : 0, stato === 'ok' ? 0 : 1, rimedio, versioneApp(), iso, iso)
  scritti.set(k, { giorno, testa: t, stato })
}

// — ogni motore —

/** Come si sistema il guaio di un motore: rientrare, la chiave, acceso, il ponte, il piano, la dose, o niente risposte. */
export type Guaio = 'accedi' | 'credenziale' | 'spento' | 'ponte' | 'pagamento' | 'finito' | 'fermo'
/** La scheda in cui si sistema: `openai` è anche l'account ChatGPT. */
export type Scheda = 'claude' | 'openai' | 'compatibile' | 'incluso'

/**
 * Il guaio da dire nella riga fissa, per qualunque motore.
 *
 * `via` è il motore com'è scritto nella configurazione, `id` la scheda dove
 * si sistema. `nome` c'è solo per un fornitore compatibile, che ha il nome che
 * gli ha dato lei; `locale` dice che sta su questo Mac. `intanto` è il motore
 * che lavora al posto suo, dopo un cambio fatto da Myynd. `minuti` è da quanto
 * non si riesce a pensare, per `fermo`.
 */
export type TestaGuasta = {
  id: Scheda; via: mod.Via; rimedio: Guaio
  nome?: string; locale?: boolean; minuti?: number
  intanto?: { via: mod.Via; nome?: string; locale?: boolean }
}

const SCHEDA: Record<mod.Via, Scheda> = { claude: 'claude', openai: 'openai', chatgpt: 'openai', compatibile: 'compatibile', incluso: 'incluso' }

/** Il fornitore compatibile sta su questa macchina? */
function suQuestoMac(url: string): boolean {
  try { const h = new URL(url).hostname; return h === 'localhost' || h === '[::1]' || /^127\./.test(h) } catch { return false }
}

function chiE(via: mod.Via): { nome?: string; locale?: boolean } {
  if (via !== 'compatibile') return {}
  const f = leggi().compatibile
  return f ? { ...(f.nome ? { nome: f.nome } : {}), locale: suQuestoMac(f.url) } : {}
}

/** Il motore che ha scelto lei, com'è scritto: l'account ChatGPT conta come `chatgpt`. */
function viaScelta(motore = leggi().motore): mod.Via {
  return (motore ?? 'claude') as mod.Via
}

/** Il guaio di un motore adesso, dalle bussate e dai rifiuti. */
export function guaioDi(via: mod.Via): Guaio | null {
  if (via === 'claude' || via === 'openai') {
    const p = problemaTesta(via)
    return p && p.rimedio !== 'credito' ? p.rimedio : null
  }
  const s = mod.statoVia(via)
  if (!s) return null
  if (via === 'incluso') {
    // la dose finita è un «sì» del ponte: lavora, domani
    if (s.codice === 429) return 'finito'
    if (s.vivo) return null
    return s.codice === 401 ? 'accedi' : s.codice === 402 ? 'pagamento' : 'ponte'
  }
  if (s.vivo) return null
  if (via === 'chatgpt') return s.codice === 401 ? 'accedi' : 'spento'
  return 'spento'
}

/**
 * La riga fissa del motore: prima quello che lei ha scelto e che Myynd ha
 * dovuto lasciare, poi il motore al lavoro, poi «non riesco a pensare».
 */
export function testaDaMostrare(adesso = Date.now()): TestaGuasta | null {
  const c = leggi()
  if (c.motorePrima && c.motorePrima !== c.motore) {
    const prima = viaScelta(c.motorePrima)
    const g = guaioDi(prima)
    if (g) return { id: SCHEDA[prima], via: prima, rimedio: g, ...chiE(prima), intanto: { via: viaScelta(c.motore), ...chiE(viaScelta(c.motore)) } }
  }
  const via = viaScelta(c.motore)
  const g = guaioDi(via)
  if (g) return { id: SCHEDA[via], via, rimedio: g, ...chiE(via) }
  // senza un motore collegato «non riesco a pensare» lo dice già «Serve Claude…»
  if (!mod.collegato()) return null
  const f = mod.pensieroFermo(adesso)
  return f ? { id: SCHEDA[via], via, rimedio: 'fermo', minuti: f.minuti, ...chiE(via) } : null
}

// — la bussata —

/** Ogni quanto si bussa al motore scelto, per persona. */
export const MINUTI_SONDA = 3

type Ferri = {
  risponde: (f: { url: string; chiave?: string }) => Promise<boolean>
  statoChatGPT: () => Promise<{ installato: boolean; entrato: boolean; errore?: string }>
  saluteIncluso: (o: { url?: string; gettone?: string }) => Promise<incluso.StatoIncluso>
}
const VERI: Ferri = {
  risponde: f => compatibile.risponde(f, 5_000),
  statoChatGPT: () => chatgpt.stato(),
  saluteIncluso: o => incluso.salute(o)
}
let ferri: Ferri = VERI
/** Solo per le prove: le bussate finte. */
export function perProvaFerri(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/** Bussa a un motore e scrive cosa ha risposto. Niente per quelli che non si bussano (Claude, OpenAI con la chiave). */
async function bussa(via: mod.Via): Promise<void> {
  const c = leggi()
  if (via === 'compatibile') {
    const f = c.compatibile
    if (!f?.url || !f.modello) return
    mod.segnaVia('compatibile', await ferri.risponde(f))
    return
  }
  if (via === 'chatgpt') {
    if (!chatgpt.installato()) return
    const s = await ferri.statoChatGPT()
    // uscito dall'account: una lettura basta; il ponte che non parte può essere un attimo
    if (s.entrato) mod.segnaVia('chatgpt', true)
    else if (s.errore) mod.segnaVia('chatgpt', false, { codice: 0 })
    else mod.segnaVia('chatgpt', false, { certo: true, codice: 401 })
    return
  }
  if (via === 'incluso') {
    if (!mod.fornitoreIncluso(c)) return
    const s = await ferri.saluteIncluso({ url: process.env.MYYND_INCLUSO_URL, gettone: c.incluso?.token })
    notaPonte(s.stato === 'pronto' ? 200 : s.stato === 'finito' ? 429 : (s.codice ?? 0))
  }
}

/**
 * Quello che il ponte ha appena detto, da una bussata o da una chiamata vera:
 * 401 e 402 bastano una volta, un 5xx o la rete giù vogliono la conferma.
 */
export function notaPonte(codice: number): void {
  if (codice >= 200 && codice < 300) return mod.segnaVia('incluso', true)
  if (codice === 429) return mod.segnaVia('incluso', true, { codice: 429 })
  mod.segnaVia('incluso', false, { codice, certo: codice === 401 || codice === 402 })
}

const sondate = new Map<string, number>()

/**
 * La bussata del giro: al motore che lei ha scelto (anche se adesso lavora un
 * altro al suo posto, per sapere quando torna), al massimo ogni
 * `MINUTI_SONDA`. Se il motore al lavoro è morto, si bussa anche agli altri
 * che si possono bussare, e poi si ripara: un altro che risponde lavora al suo
 * posto, quello di prima torna quando risponde di nuovo.
 */
export async function sonda(o: { forza?: boolean; adesso?: number } = {}): Promise<void> {
  const k = chi.adesso() ?? ''
  const adesso = o.adesso ?? Date.now()
  if (!o.forza && adesso - (sondate.get(k) ?? 0) < MINUTI_SONDA * 60_000) return
  sondate.set(k, adesso)
  const c = leggi()
  const sua = viaScelta(c.motorePrima ?? c.motore)
  const fatte = new Set<mod.Via>([sua])
  await bussa(sua)
  const ora = viaScelta(leggi().motore)
  if (ora !== sua) { fatte.add(ora); await bussa(ora) }
  if (mod.morta(ora)) {
    for (const altro of ['incluso', 'compatibile', 'chatgpt'] as const) {
      if (fatte.has(altro)) continue
      const cc = leggi()
      const presente = altro === 'compatibile' ? !!(cc.compatibile?.url && cc.compatibile.modello)
        : altro === 'chatgpt' ? cc.chatgpt?.attivo === true
        : !!mod.fornitoreIncluso(cc)
      if (presente) await bussa(altro)
    }
  }
  mod.riparaIlMotore()
}

/** Solo per le prove: si dimentica cosa si è scritto. */
export function perProva() { scritti.clear(); sondate.clear() }
