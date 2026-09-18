// Gli altri nomi di un progetto, e cosa vuol dire uno stato.
//
// Due cose pure, tenute fuori dalla schermata per la ragione solita: la riga
// che decide se «everwave» è già scritto o no si prova in un test, la stessa
// riga dentro il JSX no. E le tre frasi degli stati sono quello che qualcuno
// legge un attimo prima di chiudere un progetto per sbaglio (è successo, due
// volte): vanno scritte una volta sola, in un posto solo.
//
// I testi qui dentro sono chiavi: chi li disegna li passa da `t()`.

export type Stato = 'attivo' | 'fermo' | 'chiuso'

/** Quanto può essere lungo un altro nome: è un soprannome, non una frase. */
export const TETTO_ALIAS = 60

/** Un altro nome, pulito: una riga sola, spazi normali, un tetto. */
export function normalizzaAlias(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, TETTO_ALIAS)
}

/** La forma con cui due nomi si confrontano: maiuscole e accenti non contano. */
const forma = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** «Everwave» e «everwave» sono lo stesso nome, e uno dei due è di troppo. */
export const stessoNome = (a: string, b: string) => !!forma(a) && forma(a) === forma(b)

/**
 * Gli altri nomi come vanno salvati.
 *
 * Puliti, senza vuoti, senza doppioni, e senza il nome del progetto: quello
 * non è un *altro* nome, e messo qui dentro farebbe contare due volte lo
 * stesso progetto a chi cerca per nome.
 */
export function aliasPuliti(alias: readonly string[], nome = ''): string[] {
  const fuori: string[] = []
  for (const grezzo of alias) {
    const a = normalizzaAlias(grezzo)
    if (!a) continue
    if (nome && stessoNome(a, nome)) continue
    if (fuori.some(x => stessoNome(x, a))) continue
    fuori.push(a)
  }
  return fuori
}

/** Perché questo nome non si può aggiungere, o niente. La chiave, da passare da `t()`. */
export function guaioAlias(alias: readonly string[], nuovo: string, nome = ''): string {
  const a = normalizzaAlias(nuovo)
  if (!a) return ''
  if (nome && stessoNome(a, nome)) return 'Questo è già il nome del progetto.'
  if (alias.some(x => stessoNome(x, a))) return 'Questo nome c’è già.'
  return ''
}

/**
 * Aggiunge un altro nome, o dice perché no.
 *
 * Una casella vuota non è un errore: è qualcuno che ha premuto Invio senza
 * aver scritto niente, e rispondergli con una riga rossa sarebbe scortese.
 */
export function aggiungiAlias(alias: readonly string[], nuovo: string, nome = ''): { alias: string[]; guaio: string } {
  const guaio = guaioAlias(alias, nuovo, nome)
  const a = normalizzaAlias(nuovo)
  if (guaio || !a) return { alias: [...alias], guaio }
  return { alias: aliasPuliti([...alias, a], nome), guaio: '' }
}

/** Via uno, e gli altri restano com'erano. */
export function togliAlias(alias: readonly string[], quale: string): string[] {
  return alias.filter(a => !stessoNome(a, quale))
}

/**
 * Cosa vuol dire uno stato, detto per quello che cambia sulla prima pagina.
 *
 * Non «attivo / fermo / chiuso» e arrangiati: la scelta di mezzo esiste
 * proprio perché «non sono chiusi, sono solo in pausa», e senza queste tre
 * righe la differenza fra le due è un'etichetta che non dice niente.
 */
export const SPIEGA_STATO: Record<Stato, string> = {
  attivo: 'Sta sulla prima pagina: Myynd gli porta le novità e ti propone cosa fare.',
  fermo: 'Non si perde niente, ma sparisce dalla prima pagina finché non lo riprendi.',
  chiuso: 'Finito. Esce dal punto e dal feed, e resta scritto. Riaprirlo è un clic.'
}

/** La riga di uno stato, anche se arriva un valore che non conosciamo. */
export function spiegaStato(s: string): string {
  return SPIEGA_STATO[s as Stato] ?? SPIEGA_STATO.attivo
}

/** I tre stati nell'ordine in cui si leggono, dal più vivo al più finito. */
export const STATI: Stato[] = ['attivo', 'fermo', 'chiuso']
