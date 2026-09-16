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
 * Adesso la lettura va avanti con quello che c'è, e qui si tiene a mente cosa
 * è mancato: la schermata lo dice in una riga fissa con la strada per le
 * Fonti, finché la lettura dopo non lo trova a posto. Vale per la lettura a
 * mano e per quella automatica: è la stessa lettura, e la riga deve sparire
 * da sola quando il permesso torna.
 *
 * Una Map per conto, come tutto quello che dipende da chi chiede.
 */
export type Motivo = 'non-disponibile' | 'incompleta'
export type FonteIncompleta = { fonte: string; motivo: Motivo }

const incomplete = new Map<string, Map<string, Motivo>>()

/** Le fonti che l'ultima lettura di questo conto non ha letto per intero. */
export function fontiIncomplete(conto: string): FonteIncompleta[] {
  return [...(incomplete.get(conto) ?? [])].map(([fonte, motivo]) => ({ fonte, motivo }))
}

type Evento = {
  fase?: string; stato?: string; errore?: string
  falliti?: number | unknown[]; illeggibili?: number | unknown[]; cartelleFallite?: unknown[]; interrotto?: boolean
}
const elenco = (v: unknown) => Array.isArray(v) && v.length > 0

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
  const fonte = /^[a-z][a-z0-9_-]{0,40}$/i.test(e.fase) ? e.fase : 'source'
  if (e.stato === 'guaio') return { fonte, motivo: 'non-disponibile' }
  if (e.stato !== 'fatto') return null
  if (elenco(e.falliti) || elenco(e.illeggibili) || elenco(e.cartelleFallite) || e.interrotto) return { fonte, motivo: 'incompleta' }
  return null
}

/**
 * Guarda una lettura passare e, alla fine, aggiorna quello che si sa del conto.
 *
 * Una lettura di tutto sostituisce l'elenco: quello che adesso è a posto
 * sparisce. Una lettura di una fonte sola tocca solo quella. Una lettura
 * fermata a metà aggiunge e basta: di quello che non ha letto non sa niente.
 */
export function osservaLettura(conto: string, soloFonte: string | null) {
  const viste = new Map<string, Motivo>()
  return {
    avvisa(evento: unknown) {
      const m = motivoLettura(evento)
      // un guaio pesa più di una lettura a metà: non si scrive sopra
      if (m && viste.get(m.fonte) !== 'non-disponibile') viste.set(m.fonte, m.motivo)
    },
    chiudi(interrotta = false) {
      const prima = incomplete.get(conto) ?? new Map<string, Motivo>()
      const dopo = new Map(soloFonte || interrotta ? prima : [])
      if (soloFonte) dopo.delete(soloFonte)
      for (const [fonte, motivo] of viste) dopo.set(fonte, motivo)
      if (dopo.size) incomplete.set(conto, dopo); else incomplete.delete(conto)
    }
  }
}

/** Serve ai test: un conto che ricomincia da zero. */
export function dimenticaLetture(conto: string) { incomplete.delete(conto) }

/** La lettura è già in corso per questo conto: si aspetta, non si raddoppia. */
export class LetturaInCorso extends Error {
  status = 409
  constructor() { super('Una lettura delle fonti è già in corso. Attendi che finisca e riprova.') }
  perLingua(lingua: 'it' | 'en'): string {
    return lingua === 'en' ? 'A source read is already running. Wait for it to finish and try again.' : this.message
  }
}

/**
 * Una lettura a mano rilegge le fonti prima di chiedere al modello, con lo
 * stesso lucchetto della sincronizzazione: non può correre insieme a una
 * lettura già partita. Quello che non si è letto non ferma niente: lo dice
 * `fontiIncomplete`, e la pagina lo scrive accanto a quello che ha trovato.
 */
export async function generaDaFontiFresche<T>(conto: string, lock: Set<string>,
  leggi: () => Promise<unknown>, genera: () => Promise<T>): Promise<T> {
  if (lock.has(conto)) throw new LetturaInCorso()
  lock.add(conto)
  try {
    await leggi()
    return await genera()
  } finally { lock.delete(conto) }
}
