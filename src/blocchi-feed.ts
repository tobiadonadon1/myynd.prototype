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
// Dal 21 settembre le domande di Myynd sui progetti non stanno più qui
// dentro: «if it's multiple questions, don't stack them one over the other,
// just ask them in one unique card». Stanno in una carta sola, sotto i
// blocchi, e la disegna `Myynd.tsx`. I blocchi sono il lavoro.
//
//   node --test src/blocchi-feed.test.ts

/**
 * Una voce del feed, per quel che serve a metterla in un blocco.
 *
 * `peso` è quanto conta adesso, da 0 a 3, giudicato quando la voce è nata
 * (`server/rifinitura.ts`): «organise it by importance on my feed». Chi non
 * l'ha, perché è nata prima o perché Jev non c'era, sta in mezzo.
 */
export type VoceDaBlocco = { id: string; progetto?: string | null; quando: string; peso?: number | null }
/** Una riga della lista: `origine` e `madre` dicono se è «la cosa dopo» di un'altra. */
export type CompitoDaBlocco = { id: string; progetto?: string | null; stato: string; origine: string; madre?: string | null; aggiornato: string; testo?: string; nota?: string | null }
/** Un progetto: solo quelli attivi hanno un blocco. `priorita` «alta» lo porta davanti. */
export type ProgettoDaBlocco = { id: string; nome: string; stato?: string; priorita?: string | null }

export type RigaBlocco<V, C> =
  | { genere: 'voce'; voce: V }
  /** `seguito` è la cosa che Myynd propone dopo questa, se l'ha proposta: si legge sotto, non è una riga sua. */
  | { genere: 'compito'; compito: C; seguito: C | null }

export type Blocco<V, C> = {
  /** L'id del progetto; null è «Il resto», cioè quello che non sta in nessun progetto. */
  progetto: string | null
  nome: string
  righe: RigaBlocco<V, C>[]
  /** Quando è arrivata l'ultima cosa del blocco: decide l'ordine fra i blocchi a parità di peso. */
  ultimo: string
  /** Il peso della cosa più pesante del blocco: decide l'ordine fra i blocchi, dopo chi aspetta lui. */
  peso: number
  /** Il progetto l'ha segnato alto lui: il blocco sta davanti agli altri. */
  alto?: boolean
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
/**
 * Quanto aspetta lui una riga della lista: zero è «adesso», due è la lista.
 *
 * `fermi` sono le righe che hanno appena finito: per il tempo in cui il
 * fuoco si posa tengono il posto di una riga affidata, così quello che si
 * guardava non salta in cima a metà animazione. Vedi `useCompiti.appenaFinite`.
 */
const pesoRiga = (c: { id: string; stato: string }, fermi?: ReadonlySet<string>) =>
  fermi?.has(c.id) && (c.stato === 'pronto' || c.stato === 'chiede') ? ATTESA.delegato : ATTESA[c.stato] ?? 2

/**
 * Il peso di una voce, come numero sempre.
 *
 * In mezzo (1.5) quando non c'è: una voce nata prima di oggi, o senza Jev,
 * non deve né scavalcare quello che è stato giudicato urgente né finire
 * dietro a quello che è stato giudicato di sfondo.
 */
export const SENZA_PESO = 1.5
export function pesoDi(v: { peso?: number | null }): number {
  const p = v.peso
  return typeof p === 'number' && Number.isFinite(p) ? p : SENZA_PESO
}

/** I nomi sono entità: Acme non è AcmeCloud. Stessa regola del server (`nominaAmbito`). */
function nomeNormalizzato(testo: string): string {
  return (testo.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []).join(' ')
}

export function blocchiFeed<V extends VoceDaBlocco, C extends CompitoDaBlocco>(dati: {
  voci: V[]
  compiti: C[]
  progetti: ProgettoDaBlocco[]
  /** Il nome del blocco senza progetto, già nella lingua giusta. */
  nomeResto: string
  massimoCompiti?: number
  /** Le righe che hanno appena finito: restano al loro posto finché il fuoco si posa. */
  fermi?: ReadonlySet<string>
  /**
   * Progetti che hanno un blocco anche senza righe: quelli appena nati.
   *
   * Un progetto senza niente sul tavolo non ha un blocco, ed è giusto: la
   * prima pagina è il lavoro. Ma uno appena creato da qui deve comparire nel
   * momento in cui lo si crea, con il posto per il primo passo, altrimenti il
   * gesto sembra non aver fatto niente.
   */
  vuoti?: readonly string[]
}): Blocco<V, C>[] {
  const attivi = new Map(dati.progetti.filter(p => !p.stato || p.stato === 'attivo').map(p => [p.id, p.nome]))
  const alti = new Set(dati.progetti.filter(p => p.priorita === 'alta').map(p => p.id))
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
    .sort((a, b) => pesoRiga(a.c, dati.fermi) - pesoRiga(b.c, dati.fermi) || a.i - b.i)
    .map(x => x.c)
    .slice(0, dati.massimoCompiti ?? COMPITI_IN_PAGINA)

  type B = Blocco<V, C> & { attese: RigaBlocco<V, C>[]; voci: { riga: RigaBlocco<V, C>; peso: number; i: number }[]; altre: RigaBlocco<V, C>[] }
  const blocchi = new Map<string | null, B>()
  const blocco = (id: string | null): B => {
    let b = blocchi.get(id)
    if (!b) {
      b = { progetto: id, nome: id ? attivi.get(id)! : dati.nomeResto, righe: [], ultimo: '', peso: 0, attese: [], voci: [], altre: [] }
      blocchi.set(id, b)
    }
    return b
  }
  const piuRecente = (b: B, quando: string) => { if (quando > b.ultimo) b.ultimo = quando }

  dati.voci.forEach((voce, i) => {
    const b = blocco(chiave(voce.progetto))
    const p = pesoDi(voce)
    b.voci.push({ riga: { genere: 'voce', voce }, peso: p, i })
    if (p > b.peso) b.peso = p
    piuRecente(b, voce.quando)
  })
  for (const compito of compiti) {
    const b = blocco(casa(compito))
    const riga: RigaBlocco<V, C> = { genere: 'compito', compito, seguito: seguiti.get(compito.id) ?? null }
    ;(pesoRiga(compito, dati.fermi) === 0 ? b.attese : b.altre).push(riga)
    piuRecente(b, compito.aggiornato)
  }

  /*
   * Dentro un blocco: prima quello che aspetta lui (una bozza pronta, una
   * domanda su una riga), poi quello che ha notato Myynd dal più pesante al
   * più leggero (a parità, nell'ordine in cui è arrivato), poi le sue righe.
   */
  for (const id of dati.vuoti ?? []) if (attivi.has(id)) blocco(id)
  const vuoti = new Set(dati.vuoti ?? [])
  const pronti = [...blocchi.values()].map(b => ({
    progetto: b.progetto, nome: b.nome, ultimo: b.ultimo, peso: b.peso, alto: !!b.progetto && alti.has(b.progetto),
    righe: [
      ...b.attese,
      ...b.voci.sort((x, y) => y.peso - x.peso || x.i - y.i).map(x => x.riga),
      ...b.altre
    ]
  })).filter(b => b.righe.length || (b.progetto && vuoti.has(b.progetto)))

  // quelli segnati alti in cima, poi il più recente; «Il resto» sempre in fondo, qualunque data abbia
  return pronti.sort((a, b) => {
    if (a.progetto === null) return 1
    if (b.progetto === null) return -1
    return Number(b.alto) - Number(a.alto) || b.ultimo.localeCompare(a.ultimo) || a.nome.localeCompare(b.nome)
  })
}

/**
 * Quante cose ci sono sul tavolo: tutte le righe dei blocchi, e le domande
 * nella loro carta.
 *
 * «Dice quattro cose sul tavolo, io ne conto cinque.» Erano tre conti
 * diversi: il titolo lasciava fuori le domande sui progetti, il numero nel
 * menù contava solo le voci del feed, e lui contava quello che vedeva. Da
 * qui esce un numero solo, da questi blocchi, e lo usano tutti e due: se
 * una riga si vede, si conta; se non si vede (oltre il tetto dei compiti),
 * no. Le domande stanno nella loro carta, e ognuna è una cosa che aspetta lui.
 */
export function sulTavolo(blocchi: { righe: unknown[] }[], domande: number): number {
  return blocchi.reduce((n, b) => n + b.righe.length, 0) + Math.max(0, domande)
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
function aspettaLui<B extends { righe: RigaBlocco<VoceDaBlocco, CompitoDaBlocco>[] }>(b: B): boolean {
  return b.righe.some(r => r.genere === 'compito' && (r.compito.stato === 'pronto' || r.compito.stato === 'chiede'))
}

/**
 * L'ordine dei blocchi in pagina: il suo se l'ha scelto, altrimenti il nostro.
 *
 * «Vorrei poter trascinare e dare priorità a una sezione sull'altra; dovrebbe
 * capire da sé quali sono le più urgenti, ma poterle trascinare sarebbe
 * meglio.» Sono due cose, e questa funzione le tiene separate apposta.
 *
 * Il nostro ordine è quello che capisce da sé, dopo l'unica cosa che ha detto
 * lui: prima i progetti che ha segnato a priorità alta, poi quelli dove qualcosa
 * aspetta lui (una bozza pronta, una domanda senza risposta), poi quelli con
 * la cosa più pesante dentro («organise it by importance on my feed»), poi i
 * più recenti, e «Il resto» in fondo a parità, perché quello che non sta in
 * nessun progetto non passa mai davanti a un progetto.
 *
 * Il suo vince sempre, e non si discute: un blocco che ha trascinato in cima
 * ci resta anche il giorno in cui un altro ha una bozza pronta. Un blocco che
 * nell'ordine salvato non c'è (un progetto nato ieri) va in fondo, fra gli
 * altri sconosciuti, nell'ordine che avrebbe avuto da solo: il riordino è
 * stabile, e chi non ha un posto resta come stava.
 */
export function ordinaBlocchi<V extends VoceDaBlocco, C extends CompitoDaBlocco>(
  blocchi: Blocco<V, C>[], ordine?: readonly string[] | null
): Blocco<V, C>[] {
  // «Il resto» sta dietro ai progetti a parità di attesa: il peso ordina i
  // progetti fra loro, non tira su quello che non sta in nessun progetto
  const predefinito = [...blocchi].sort((a, b) =>
    Number(!!b.alto) - Number(!!a.alto)
    || Number(aspettaLui(b)) - Number(aspettaLui(a))
    || Number(a.progetto === null) - Number(b.progetto === null)
    || b.peso - a.peso
    || b.ultimo.localeCompare(a.ultimo)
    || a.nome.localeCompare(b.nome))
  if (!ordine?.length) return predefinito
  const posto = new Map(ordine.map((id, i) => [id, i]))
  const dove = (b: Blocco<V, C>) => posto.get(chiaveBlocco(b)) ?? Number.MAX_SAFE_INTEGER
  return predefinito.sort((a, b) => dove(a) - dove(b))
}

/**
 * L'ordine salvato con questo progetto in cima: quello che succede quando lo
 * segna alto. È la stessa regola del server (`progetti.inCimaAllOrdine`), fatta
 * anche qui perché il blocco salga nell'istante del gesto e non al giro dopo.
 * Senza un ordine suo non se ne inventa uno: decide la priorità da sé.
 */
export function inCimaAllOrdine(ordine: readonly string[], id: string): string[] {
  return ordine.length ? [id, ...ordine.filter(x => x !== id)] : []
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

/**
 * L'ordine che si vede non si rimescola sotto la mano.
 *
 * «When I click "done" on a specific item, some other items kind of switch
 * the position.» Era vero: l'ordine dei blocchi dipende dalla cosa più
 * pesante che c'è dentro e da quando è stata toccata l'ultima riga, quindi
 * spuntare la riga più recente di H-Farm faceva scendere H-Farm sotto
 * Myynd, un attimo dopo il clic, sotto il dito. Provato il 22 settembre nella
 * cornice vera: H-Farm, Myynd, Il resto → Myynd, H-Farm, Il resto.
 *
 * Qui: i blocchi che erano già in pagina restano nell'ordine in cui erano;
 * uno nuovo entra dove lo metterebbe l'ordine di sempre, spingendo giù gli
 * altri senza scambiarli. Uno sparito se ne va e basta. Chi chiama decide
 * quando ricominciare da capo (la pagina riaperta, un «Sposta su»).
 */
export function ordineStabile(correnti: readonly string[], visti: readonly string[]): string[] {
  const dove = new Map(visti.map((k, i) => [k, i]))
  const fuori = correnti.filter(k => dove.has(k)).sort((a, b) => dove.get(a)! - dove.get(b)!)
  correnti.forEach((k, i) => { if (!dove.has(k)) fuori.splice(Math.min(i, fuori.length), 0, k) })
  return fuori
}
