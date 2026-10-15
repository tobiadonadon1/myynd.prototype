import { frasi, loc, t } from './lingua.ts'

/*
 * Le parole della pagina dei Progetti che non sono componenti: quanto tempo fa,
 * e cosa ha letto. Stanno qui per potersi provare senza disegnare niente.
 */

/** Il nome di ogni genere di fonte (`tipoDiFonte` in `server/quadro.ts`), com'è scritto sulla pagina. */
const NOMI: Record<string, string> = {
  riferimento: 'Quello che hai scritto',
  memoria: 'Memoria del progetto',
  cartelle: 'Cartelle di codice',
  sessioni: 'Sessioni con gli assistenti',
  posta: 'Posta',
  note: 'Note',
  file: 'File',
  agenda: 'Agenda',
  messaggi: 'Messaggi',
  sito: 'Sito pubblico',
  x: 'I tuoi post su X',
  altro: 'Altre fonti'
}

export function nomeDelGenere(tipo: string): string {
  return t(NOMI[tipo] ?? NOMI.altro!)
}

/** Cosa ha letto, in una riga: «Mail 3 · Code folders 1». */
export function lettoInRiga(letto: readonly { tipo: string; quanti: number }[]): string {
  return letto.map(l => `${nomeDelGenere(l.tipo)} ${l.quanti}`).join(' · ')
}

/**
 * Quanto tempo fa, corto: sta sulla destra di una riga che non va a capo.
 *
 * Una data al giorno (le cartelle e i commit si datano a mezzogiorno UTC, senza
 * ora) non dice «3 h fa»: dice oggi, ieri, o quanti giorni. Oltre le due
 * settimane la data.
 */
export function daQuando(iso: string | null | undefined, adesso = Date.now()): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const soloGiorno = /T12:00:00(?:\.000)?Z$/.test(iso)
  const minuti = (adesso - ms) / 60_000
  if (!soloGiorno && minuti < 90) return frasi.minutiFa(Math.max(1, Math.round(minuti)))
  if (!soloGiorno && minuti < 22 * 60) return frasi.oreFa(Math.round(minuti / 60))
  const inizio = (x: number) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime() }
  const giorni = Math.round((inizio(adesso) - inizio(soloGiorno ? Date.parse(iso.slice(0, 10) + 'T12:00:00') : ms)) / 86_400_000)
  if (giorni <= 0) return t('oggi')
  if (giorni === 1) return t('ieri')
  if (giorni < 14) return frasi.giorniFa(giorni)
  return new Date(ms).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })
}
