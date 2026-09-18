// I blocchi della prima pagina: ogni cosa sotto il progetto a cui appartiene.
//
// «Raggruppate per progetto, e ogni progetto un blocco suo, così vedo a colpo
// d'occhio dove stanno le cose.» Prima la pagina era una carta grande e una
// lista sola: le voci del feed, le righe della lista e le domande sui
// progetti, tutte in fila, e per capire di che progetto fosse una riga
// bisognava leggerla. Qui si decide chi sta con chi e in che ordine; come si
// disegna lo sa `Myynd.tsx`. Sta in un file suo perché si prova da solo,
// senza React e senza server.
//
//   node --test src/blocchi-feed.test.ts

/** Una voce del feed, per quel che serve a metterla in un blocco. */
export type VoceDaBlocco = { id: string; progetto?: string | null; quando: string }
/** Una riga della lista: `origine` e `madre` dicono se è «la cosa dopo» di un'altra. */
export type CompitoDaBlocco = { id: string; progetto?: string | null; stato: string; origine: string; madre?: string | null; aggiornato: string; testo?: string; nota?: string | null }
/** La domanda di Myynd su un progetto. */
export type DomandaDaBlocco = { id: string; projectId: string; projectName: string }
/** Un progetto: solo quelli attivi hanno un blocco. */
export type ProgettoDaBlocco = { id: string; nome: string; stato?: string }

export type RigaBlocco<V, C, D> =
  | { genere: 'voce'; voce: V }
  /** `seguito` è la cosa che Myynd propone dopo questa, se l'ha proposta: si legge sotto, non è una riga sua. */
  | { genere: 'compito'; compito: C; seguito: C | null }
  | { genere: 'domanda'; domanda: D }

export type Blocco<V, C, D> = {
  /** L'id del progetto; null è «Il resto», cioè quello che non sta in nessun progetto. */
  progetto: string | null
  nome: string
  righe: RigaBlocco<V, C, D>[]
  /** Quando è arrivata l'ultima cosa del blocco: decide l'ordine fra i blocchi. */
  ultimo: string
}

/**
 * Quante righe della lista stanno in prima pagina, in tutto.
 *
 * Sei, come prima: la prima pagina non è la lista, e diciassette righe sotto
 * le voci del feed la facevano diventare quello. Quelle che aspettano lui
 * (pronte, o con una domanda) passano davanti alle altre, così il tetto non
 * nasconde mai una bozza pronta.
 */
export const COMPITI_IN_PAGINA = 6

const ATTESA: Record<string, number> = { pronto: 0, chiede: 0, delegato: 1 }
const peso = (stato: string) => ATTESA[stato] ?? 2

/** I nomi sono entità: Acme non è AcmeCloud. Stessa regola del server (`nominaAmbito`). */
function nomeNormalizzato(testo: string): string {
  return (testo.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []).join(' ')
}

export function blocchiFeed<V extends VoceDaBlocco, C extends CompitoDaBlocco, D extends DomandaDaBlocco>(dati: {
  voci: V[]
  compiti: C[]
  domande: D[]
  progetti: ProgettoDaBlocco[]
  /** Il nome del blocco senza progetto, già nella lingua giusta. */
  nomeResto: string
  massimoCompiti?: number
}): Blocco<V, C, D>[] {
  const attivi = new Map(dati.progetti.filter(p => !p.stato || p.stato === 'attivo').map(p => [p.id, p.nome]))
  // un progetto fermo o chiuso, o un id che non si conosce, non ha un blocco:
  // quello che lo nomina va fra il resto, non sparisce
  const chiave = (id: string | null | undefined) => (id && attivi.has(id) ? id : null)

  /*
   * Una riga che nomina un progetto sta in quel progetto, anche senza averlo scritto.
   *
   * «Definire un pilota Myynd dentro H-Farm» finiva sotto «Il resto», e lui
   * l'ha letta per quello che era: una cosa di H-Farm messa fra le cose di
   * nessuno. Nasceva da una voce del feed, e chi la creava non le metteva il
   * progetto. Qui, se il progetto non c'è, si guarda se il testo (o la nota)
   * nomina un progetto attivo: stesso confine di parola del server, e il nome
   * più lungo per primo, così «H-Farm» vince su «Farm» dove ci sono tutti e
   * due. Il server intanto lo scrive alla nascita: i due devono dire la stessa
   * cosa, non una ciascuno.
   */
  const nomi = [...attivi]
    .map(([id, nome]) => [id, nomeNormalizzato(nome)] as const)
    .filter(([, nome]) => nome.replace(/ /g, '').length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
  const perNome = (testo: string): string | null => {
    if (!testo.trim() || !nomi.length) return null
    const dentro = ` ${nomeNormalizzato(testo)} `
    return nomi.find(([, nome]) => dentro.includes(` ${nome} `))?.[0] ?? null
  }
  /** Il blocco di una riga della lista: il suo progetto, quello che nomina, o «Il resto». */
  const casa = (c: C): string | null => {
    const suo = chiave(c.progetto)
    if (suo || c.progetto) return suo
    return perNome(`${c.testo ?? ''}\n${c.nota ?? ''}`)
  }

  /*
   * «La cosa dopo»: una riga nata da un'altra, che Myynd propone quando quella
   * è finita. Se la madre è in pagina si legge sotto di lei, in una riga
   * piccola, e non anche come riga sua: sarebbe la stessa cosa scritta due
   * volte. Se la madre non c'è più (è chiusa, e le chiuse non stanno qui) è
   * una riga come le altre, perché è comunque una cosa da fare.
   */
  const inLista = new Set(dati.compiti.map(c => c.id))
  const seguiti = new Map<string, C>()
  for (const c of dati.compiti) {
    if (c.origine === 'seguito' && c.madre && inLista.has(c.madre) && !seguiti.has(c.madre)) seguiti.set(c.madre, c)
  }
  const appesi = new Set([...seguiti.values()].map(c => c.id))
  const compiti = dati.compiti
    .filter(c => !appesi.has(c.id))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => peso(a.c.stato) - peso(b.c.stato) || a.i - b.i)
    .map(x => x.c)
    .slice(0, dati.massimoCompiti ?? COMPITI_IN_PAGINA)

  type B = Blocco<V, C, D> & { attese: RigaBlocco<V, C, D>[]; voci: RigaBlocco<V, C, D>[]; altre: RigaBlocco<V, C, D>[]; domanda: RigaBlocco<V, C, D> | null }
  const blocchi = new Map<string | null, B>()
  const blocco = (id: string | null): B => {
    let b = blocchi.get(id)
    if (!b) {
      b = { progetto: id, nome: id ? attivi.get(id)! : dati.nomeResto, righe: [], ultimo: '', attese: [], voci: [], altre: [], domanda: null }
      blocchi.set(id, b)
    }
    return b
  }
  const piuRecente = (b: B, quando: string) => { if (quando > b.ultimo) b.ultimo = quando }

  for (const voce of dati.voci) {
    const b = blocco(chiave(voce.progetto))
    b.voci.push({ genere: 'voce', voce })
    piuRecente(b, voce.quando)
  }
  for (const compito of compiti) {
    const b = blocco(casa(compito))
    const riga: RigaBlocco<V, C, D> = { genere: 'compito', compito, seguito: seguiti.get(compito.id) ?? null }
    ;(peso(compito.stato) === 0 ? b.attese : b.altre).push(riga)
    piuRecente(b, compito.aggiornato)
  }
  // la domanda sul progetto è l'ultima riga del suo blocco, mai sopra le cose
  // da fare: una domanda di Myynd viene dopo il lavoro. Una sola per progetto.
  for (const domanda of dati.domande) {
    const id = chiave(domanda.projectId)
    if (!id) continue
    const b = blocco(id)
    if (!b.domanda) b.domanda = { genere: 'domanda', domanda }
  }

  /*
   * Dentro un blocco: prima quello che aspetta lui (una bozza pronta, una
   * domanda su una riga), poi quello che ha notato Myynd, poi le sue righe,
   * in fondo la domanda sul progetto.
   */
  const pronti = [...blocchi.values()].map(b => ({
    progetto: b.progetto, nome: b.nome, ultimo: b.ultimo,
    righe: [...b.attese, ...b.voci, ...b.altre, ...(b.domanda ? [b.domanda] : [])]
  })).filter(b => b.righe.length)

  // il più recente in cima; «Il resto» sempre in fondo, qualunque data abbia
  return pronti.sort((a, b) => {
    if (a.progetto === null) return 1
    if (b.progetto === null) return -1
    return b.ultimo.localeCompare(a.ultimo) || a.nome.localeCompare(b.nome)
  })
}

/**
 * Quante cose ci sono sul tavolo: tutte le righe dei blocchi, e la domanda
 * in cima se c'è.
 *
 * «Dice quattro cose sul tavolo, io ne conto cinque.» Erano tre conti
 * diversi: il titolo lasciava fuori le domande sui progetti, il numero nel
 * menù contava solo le voci del feed, e lui contava quello che vedeva. Da
 * qui esce un numero solo, da questi blocchi, e lo usano tutti e due: se
 * una riga si vede, si conta; se non si vede (oltre il tetto dei compiti),
 * no. La domanda in cima è una riga come le altre.
 */
export function sulTavolo(blocchi: { righe: unknown[] }[], conDomanda: boolean): number {
  return blocchi.reduce((n, b) => n + b.righe.length, 0) + (conDomanda ? 1 : 0)
}

/**
 * Il nome con cui un blocco si riconosce nell'ordine salvato.
 *
 * L'id del progetto, e «resto» per il blocco di quello che non sta in nessun
 * progetto: `null` non si scrive in un elenco di stringhe, e un blocco senza
 * nome sarebbe un blocco che non si può trascinare.
 */
export const chiaveBlocco = (b: { progetto: string | null }): string => b.progetto ?? 'resto'

/** Un blocco che aspetta lui: dentro c'è una bozza pronta o una domanda senza risposta. */
function aspettaLui<B extends { righe: RigaBlocco<VoceDaBlocco, CompitoDaBlocco, DomandaDaBlocco>[] }>(b: B): boolean {
  return b.righe.some(r => r.genere === 'compito' && (r.compito.stato === 'pronto' || r.compito.stato === 'chiede'))
}

/**
 * L'ordine dei blocchi in pagina: il suo se l'ha scelto, altrimenti il nostro.
 *
 * «Vorrei poter trascinare e dare priorità a una sezione sull'altra; dovrebbe
 * capire da sé quali sono le più urgenti, ma poterle trascinare sarebbe
 * meglio.» Sono due cose, e questa funzione le tiene separate apposta.
 *
 * Il nostro ordine è quello che capisce da sé: prima i progetti dove qualcosa
 * aspetta lui — una bozza pronta, una domanda senza risposta — poi i più
 * recenti, e «Il resto» in fondo a parità di attesa, perché quello che non sta
 * in nessun progetto non passa mai davanti a un progetto.
 *
 * Il suo vince sempre, e non si discute: un blocco che ha trascinato in cima
 * ci resta anche il giorno in cui un altro ha una bozza pronta. Un blocco che
 * nell'ordine salvato non c'è — un progetto nato ieri — va in fondo, fra gli
 * altri sconosciuti, nell'ordine che avrebbe avuto da solo: il riordino è
 * stabile, e chi non ha un posto resta come stava.
 */
export function ordinaBlocchi<V extends VoceDaBlocco, C extends CompitoDaBlocco, D extends DomandaDaBlocco>(
  blocchi: Blocco<V, C, D>[], ordine?: readonly string[] | null
): Blocco<V, C, D>[] {
  const predefinito = [...blocchi].sort((a, b) =>
    Number(aspettaLui(b)) - Number(aspettaLui(a))
    || Number(a.progetto === null) - Number(b.progetto === null)
    || b.ultimo.localeCompare(a.ultimo)
    || a.nome.localeCompare(b.nome))
  if (!ordine?.length) return predefinito
  const posto = new Map(ordine.map((id, i) => [id, i]))
  const dove = (b: Blocco<V, C, D>) => posto.get(chiaveBlocco(b)) ?? Number.MAX_SAFE_INTEGER
  return predefinito.sort((a, b) => dove(a) - dove(b))
}

/** Sposta un blocco da un posto all'altro. Fuori dall'elenco non si sposta niente. */
export function spostaBlocco(chiavi: readonly string[], da: number, a: number): string[] {
  const fuori = da < 0 || da >= chiavi.length || a < 0 || a >= chiavi.length
  if (fuori || da === a) return [...chiavi]
  const nuove = [...chiavi]
  nuove.splice(a, 0, ...nuove.splice(da, 1))
  return nuove
}

/**
 * L'ordine da salvare dopo un trascinamento.
 *
 * Quello che si vede adesso, spostato, e in coda gli id che aveva già scelto e
 * che oggi non sono in pagina: un progetto senza niente da fare non ha un
 * blocco, e se il suo nome sparisse dall'ordine salvato il giorno che torna si
 * ritroverebbe in fondo come se non l'avesse mai toccato.
 */
export function ordineDopoIlTrascinamento(
  visibili: readonly string[], da: number, a: number, salvato?: readonly string[] | null
): string[] {
  const mosse = spostaBlocco(visibili, da, a)
  const dentro = new Set(mosse)
  return [...mosse, ...(salvato ?? []).filter(id => !dentro.has(id))]
}
