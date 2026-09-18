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
export type CompitoDaBlocco = { id: string; progetto?: string | null; stato: string; origine: string; madre?: string | null; aggiornato: string }
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
    const b = blocco(chiave(compito.progetto))
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
