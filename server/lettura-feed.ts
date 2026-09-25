/**
 * Quello che una lettura non è riuscita a leggere, per conto.
 *
 * Prima una fonte andata storta faceva saltare tutta la lettura a mano: la
 * risposta era un 502 con dentro «desktop: The source read did not complete.
 * note: The source is currently unavailable.», e la pagina lo metteva in una
 * carta fra la voce in cima e i progetti, con «Riprova». Due giorni di Note
 * senza accesso al disco erano due giorni senza feed — e «desktop» ci finiva
 * per un file su ottantasette che non si è aperto.
 *
 * Adesso la lettura va avanti con quello che c'è, e qui si guarda passare:
 * ogni fase che finisce lascia la sua riga del giorno e, se è andata storta,
 * il suo episodio (`salute-fonti.ts`). La schermata lo dice in una riga fissa
 * con la strada per sistemarlo, finché la lettura dopo non lo trova a posto.
 * Vale per la lettura a mano e per quella automatica: è la stessa lettura, e
 * la riga deve sparire da sola quando il permesso torna. Prima era una `Map`
 * in memoria, e un riavvio la cancellava.
 */
import db from './store.ts'
import { RIMEDI, type Rimedio } from './connettori/guaio.ts'
import * as saluteFonti from './salute-fonti.ts'
import type { Esito } from './salute-fonti.ts'

export type Motivo = 'non-disponibile' | 'incompleta'
export type FonteIncompleta = saluteFonti.FonteIncompleta

/** Le fonti che la riga fissa deve dire, per chi chiede. `conto` resta per chi chiama: vale il contesto. */
export function fontiIncomplete(_conto?: string): FonteIncompleta[] {
  return saluteFonti.fontiIncomplete()
}

type Evento = {
  fase?: string; stato?: string; errore?: string; rimedio?: unknown; frase?: unknown; documenti?: unknown; tolti?: unknown; negate?: unknown
  falliti?: number | unknown[]; illeggibili?: number | unknown[]; cartelleFallite?: unknown[]; interrotto?: boolean
}
const elenco = (v: unknown) => Array.isArray(v) && v.length > 0
const FASE = /^[a-z][a-z0-9_-]{0,40}$/i
/** Le fasi che non sono fonti: il lavoro delle cartelle di codice, la spinta verso un server, la fine e l'errore della lettura. */
const NON_FONTI = new Set(['lavoro', 'desktop-remoto', 'fine', 'errore'])

/** Un segno che la fonte ha risposto, ma non tutta. */
function aMeta(e: Evento): boolean {
  return elenco(e.falliti) || elenco(e.illeggibili) || elenco(e.cartelleFallite) || !!e.interrotto
    || (typeof e.negate === 'number' && e.negate > 0)
}

/**
 * Cosa dice un evento di lettura su una fonte: niente, oppure un motivo.
 *
 * `guaio` è la fonte che non ha risposto — un permesso negato, un token
 * scaduto. «Incompleta» è una fonte che ha risposto ma non tutta: un canale
 * di Slack o un repo che non si è aperto, una cartella del Mac che non si
 * può guardare, una lettura di Notion interrotta. I *conteggi* invece —
 * `falliti: 3`, `illeggibili: 1` — sono singoli file o note che non si sono
 * aperti in mezzo a centinaia che sì: sono la norma di un disco vero, non un
 * motivo per dire che la fonte non si legge. Quello che è in `troncato` è
 * una lettura sana con un tetto, e non c'entra.
 */
export function motivoLettura(raw: unknown): { fonte: string; motivo: Motivo } | null {
  const e = raw as Evento
  if (!e || typeof e.fase !== 'string') return null
  // la diagnostica di un connettore può portarsi dietro dati del conto o un
  // percorso del disco: di qui passa solo un nome di fonte, e corto
  const fonte = FASE.test(e.fase) ? e.fase : 'source'
  if (e.stato === 'guaio') return { fonte, motivo: 'non-disponibile' }
  if (e.stato !== 'fatto') return null
  if (elenco(e.falliti) || elenco(e.illeggibili) || elenco(e.cartelleFallite) || e.interrotto) return { fonte, motivo: 'incompleta' }
  return null
}

const unRimedio = (x: unknown): Rimedio | null => typeof x === 'string' && (RIMEDI as readonly string[]).includes(x) ? x as Rimedio : null
const numero = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : 0

/**
 * Com'è finita una fase, per la salute delle fonti: pulita, a metà, o un guaio.
 *
 * Solo le fasi che sono fonti, e solo con un nome pulito: una fase che non
 * passa non si registra affatto (non diventa «source»). La frase è quella
 * classificata dal connettore, o niente.
 */
export function esitoLettura(raw: unknown): { fonte: string; esito: Esito; rimedio: Rimedio | null; frase: string | null; documenti: number; tolti: number } | null {
  const e = raw as Evento
  if (!e || typeof e.fase !== 'string' || NON_FONTI.has(e.fase) || !FASE.test(e.fase)) return null
  const base = { fonte: e.fase, documenti: numero(e.documenti), tolti: numero(e.tolti) }
  if (e.stato === 'guaio') {
    return { ...base, esito: 'guaio', rimedio: unRimedio(e.rimedio) ?? 'guarda', frase: typeof e.frase === 'string' && e.frase ? e.frase.slice(0, 300) : null }
  }
  if (e.stato !== 'fatto') return null
  if (aMeta(e)) return { ...base, esito: 'incompleta', rimedio: unRimedio(e.rimedio) ?? 'attendi', frase: null }
  return { ...base, esito: 'pulita', rimedio: null, frase: null }
}

type Fine = NonNullable<ReturnType<typeof esitoLettura>> & { quando: number }

/**
 * Guarda una lettura passare e, alla fine, scrive quello che ha visto.
 *
 * Ogni fase che finisce lascia la sua riga del giorno; la durata va dal suo
 * primo evento all'ultimo. Una lettura di tutto, intera, chiude gli episodi
 * delle fonti che non ha letto; una lettura di una fonte sola tocca solo
 * quella; una lettura fermata a metà aggiunge e basta: di quello che non ha
 * letto non sa niente. Se la riga fissa deve cambiare, `quandoCambia` lo dice
 * una volta sola.
 */
export function osservaLettura(
  _conto: string,
  soloFonte: string | null,
  o: { quandoCambia?: () => void; adesso?: () => number; risveglio?: number } = {}
) {
  const ora = o.adesso ?? (() => Date.now())
  const fasi = new Map<string, { primo: number; fine?: Fine }>()
  const scollegate = new Set<string>()
  return {
    avvisa(evento: unknown) {
      const e = evento as Evento
      if (!e || typeof e.fase !== 'string' || NON_FONTI.has(e.fase) || !FASE.test(e.fase)) return
      const quando = ora()
      if (e.stato === 'scollegata') { scollegate.add(e.fase); return }
      const f = fasi.get(e.fase) ?? { primo: quando }
      fasi.set(e.fase, f)
      const x = esitoLettura(evento)
      // un guaio pesa più di quello che arriva dopo per la stessa fase
      if (x && f.fine?.esito !== 'guaio') f.fine = { ...x, quando }
    },
    chiudi(interrotta = false) {
      let cambiato = false
      const lette = new Set<string>()
      for (const [fonte, f] of fasi) {
        if (!f.fine) continue
        lette.add(fonte)
        const x = f.fine
        try {
          const r = saluteFonti.registra({
            fonte, esito: x.esito, rimedio: x.rimedio, frase: x.frase, durata: x.quando - f.primo, tolti: x.tolti,
            inventario: x.esito === 'pulita' && saluteFonti.portaInventario(fonte) ? x.documenti : null, quando: x.quando
          }, o.risveglio === undefined ? {} : { risveglio: o.risveglio })
          if (r.cambiato) cambiato = true
        } catch (err) {
          console.error(`myynd · fonti · la lettura di ${fonte} non si è scritta:`, err instanceof Error ? err.message : err)
        }
      }
      try {
        for (const fonte of scollegate) { lette.add(fonte); if (saluteFonti.dimentica(fonte)) cambiato = true }
        if (!soloFonte && !interrotta && saluteFonti.chiudiAssenti(lette)) cambiato = true
      } catch (err) {
        console.error('myynd · fonti · gli episodi non si sono chiusi:', err instanceof Error ? err.message : err)
      }
      if (cambiato) { try { o.quandoCambia?.() } catch { /* chi ascolta si arrangia */ } }
    }
  }
}

/** Serve ai test: un conto che ricomincia da zero (nel contesto di adesso). */
export function dimenticaLetture(_conto?: string) { db.exec('DELETE FROM stato_fonti') }

/** La lettura è già in corso per questo conto: si aspetta, non si raddoppia. */
export class LetturaInCorso extends Error {
  status = 409
  constructor() { super('Una lettura delle fonti è già in corso. Attendi che finisca e riprova.') }
  perLingua(lingua: 'it' | 'en'): string {
    return lingua === 'en' ? 'A source read is already running. Wait for it to finish and try again.' : this.message
  }
}
