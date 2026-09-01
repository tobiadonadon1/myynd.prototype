// Quello che un'automazione ha il permesso di aprire.
//
// Fino a qui un'automazione guardava «l'indice»: un mucchio solo con dentro la
// posta, i file del disco e Notion, frugato con delle parole. Funziona finché
// tutte le automazioni vogliono la stessa cosa, e smette di funzionare al primo
// «guarda solo nella cartella dei progetti» — perché non c'era modo di dirlo.
//
// Qui gli attrezzi diventano un **vocabolario chiuso**, e la scelta è la stessa
// che regge tutto il resto di `automazioni.ts`: una ricetta è dati, non codice.
// Un'automazione non descrive *come* leggere la posta, dice `posta.leggi` — un
// nome, che questo file sa tradurre in una funzione. Non può inventarne uno:
// se non è in questa tabella non esiste, e `valida()` rifiuta la ricetta prima
// che tocchi il disco.
//
// Perché conta più qui che altrove: un attrezzo è un permesso. La differenza
// fra un'automazione che legge la posta e una che non può è tutta in una riga
// di JSON che una persona vede scritta sulla sua scheda, e che può togliere. Se
// gli attrezzi fossero impliciti — «il modello si arrangia con quello che
// trova» — quella riga non ci sarebbe, e nessuno saprebbe cosa quell'automazione
// apre alle sette di mattina mentre dorme.
//
// **Tutti leggono, nessuno scrive.** Non è una fase di sviluppo: è la regola.
// L'unico che si avvicina a fare qualcosa è `claude.lavora`, e ci si avvicina
// in modalità piano — Claude Code legge il progetto e scrive cosa farebbe,
// senza toccare un file. Quello che torna è un testo che una persona legge, e
// il verbo lo esegue il suo dito. Il giorno che un attrezzo di questo elenco
// modifica qualcosa da solo alle sette di mattina, questo prodotto ha smesso di
// essere affidabile.

import type Anthropic from '@anthropic-ai/sdk'
import { leggi } from './config.ts'
import * as store from './store.ts'
import * as agenda from './agenda.ts'
import * as lavoro from './lavoro.ts'
import * as microsoft from './connettori/microsoft.ts'

/** Il nome di un attrezzo. Fuori da questo elenco non esiste niente. */
export type Nome =
  | 'posta.leggi'
  | 'desktop.leggi'
  | 'notion.leggi'
  | 'slack.leggi'
  | 'drive.leggi'
  | 'sharepoint.leggi'
  | 'dropbox.leggi'
  | 'whatsapp.leggi'
  | 'agenda.leggi'
  | 'chat.leggi'
  | 'claude.lavora'

export type Attrezzo = {
  nome: Nome
  /** Come si chiama nel menù della chiocciola, nelle due lingue. */
  etichetta: { it: string; en: string }
  /** Una riga che dice cosa apre, per chi legge la scheda. */
  spiega: { it: string; en: string }
  /** Quale connessione gli serve. Null = non gliene serve nessuna. */
  serve: 'posta' | 'desktop' | 'notion' | 'slack' | 'drive' | 'sharepoint'
    | 'dropbox' | 'whatsapp' | 'agenda' | null
  /** Il colore con cui compare, che è quello della sua fonte. */
  tinta: string
  /** Come si presenta al modello. */
  tool: Anthropic.Tool
}

/**
 * Le fonti dell'indice dietro a ciascun attrezzo di lettura.
 *
 * `posta.leggi` ne prende due — la casella IMAP e Gmail — perché da fuori sono
 * la stessa cosa: la tua posta. Chi ha collegato Google e chiede «guarda nella
 * posta» non sta chiedendo un protocollo.
 */
const FONTI: Partial<Record<Nome, string[]>> = {
  // tre protocolli, una cosa sola: chi dice «guarda nella posta» non sta
  // chiedendo se quella casella parli IMAP, Gmail o Graph
  'posta.leggi': ['posta', 'google', 'microsoft'],
  'desktop.leggi': ['desktop'],
  'notion.leggi': ['notion'],
  'slack.leggi': ['slack'],
  'drive.leggi': ['drive'],
  // SharePoint e OneDrive stanno insieme per lo stesso motivo: da fuori sono
  // «i file dell'azienda», e la differenza fra i due la conosce solo Microsoft
  'sharepoint.leggi': ['sharepoint'],
  'dropbox.leggi': ['dropbox'],
  'whatsapp.leggi': ['whatsapp']
}

const cercaIn = (nome: Nome, cosa: string, dove: string): Anthropic.Tool => ({
  name: nome.replace('.', '_'),
  description:
    `Cerca fra ${cosa}. Torna i documenti che assomigliano alle parole che gli dai, con il loro ` +
    `id e l'inizio del testo.\n\nCerca con le parole che userebbe chi ha scritto quel documento, ` +
    `non con quelle del compito: per una fattura cerca il nome del fornitore o il numero, non ` +
    `«fattura». Se non trovi niente, prova nell'altra lingua prima di dire che non c'è — ` +
    `${dove} può essere scritto in una lingua diversa da quella in cui ti sto parlando.`,
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Due o quattro parole. Nomi propri, numeri e codici funzionano bene.' }
    },
    required: ['query']
  }
})

export const ATTREZZI: Attrezzo[] = [
  {
    nome: 'posta.leggi',
    etichetta: { it: 'la posta', en: 'email' },
    spiega: { it: 'Legge e cerca nella tua casella.', en: 'Reads and searches your mailbox.' },
    serve: 'posta',
    tinta: '#C4623B',
    tool: cercaIn('posta.leggi', 'i messaggi della sua casella di posta', 'la posta')
  },
  {
    nome: 'desktop.leggi',
    etichetta: { it: 'il desktop', en: 'desktop' },
    spiega: { it: 'Legge i file nelle cartelle che hai collegato.', en: 'Reads files in your connected folders.' },
    serve: 'desktop',
    tinta: '#2F7B93',
    tool: cercaIn('desktop.leggi', 'i file nelle cartelle che ha collegato sul suo computer', 'un file')
  },
  {
    nome: 'notion.leggi',
    etichetta: { it: 'Notion', en: 'Notion' },
    spiega: { it: 'Legge le pagine del tuo Notion.', en: 'Reads your Notion pages.' },
    serve: 'notion',
    tinta: '#4A3D9E',
    tool: cercaIn('notion.leggi', 'le pagine del suo Notion', 'una pagina')
  },
  {
    nome: 'slack.leggi',
    etichetta: { it: 'Slack', en: 'Slack' },
    spiega: { it: 'Rilegge le conversazioni dei canali di cui fai parte.', en: 'Re-reads conversations in the channels you belong to.' },
    serve: 'slack',
    tinta: '#3D8A6E',
    tool: cercaIn('slack.leggi', 'le conversazioni dei suoi canali su Slack', 'un canale')
  },
  {
    nome: 'drive.leggi',
    etichetta: { it: 'Drive', en: 'Drive' },
    spiega: { it: 'Legge i documenti del tuo Google Drive.', en: 'Reads the documents in your Google Drive.' },
    serve: 'drive',
    tinta: '#2E6FBF',
    tool: cercaIn('drive.leggi', 'i documenti del suo Google Drive', 'un documento')
  },
  {
    nome: 'sharepoint.leggi',
    etichetta: { it: 'SharePoint', en: 'SharePoint' },
    spiega: { it: 'Legge i file dei siti che segui e del tuo OneDrive.', en: 'Reads files from the sites you follow and your OneDrive.' },
    serve: 'sharepoint',
    tinta: '#1F6F74',
    tool: cercaIn('sharepoint.leggi', 'i file su SharePoint e OneDrive', 'un file')
  },
  {
    nome: 'dropbox.leggi',
    etichetta: { it: 'Dropbox', en: 'Dropbox' },
    spiega: { it: 'Legge i file della tua Dropbox.', en: 'Reads the files in your Dropbox.' },
    serve: 'dropbox',
    tinta: '#3B5BC4',
    tool: cercaIn('dropbox.leggi', 'i file della sua Dropbox', 'un file')
  },
  {
    nome: 'whatsapp.leggi',
    etichetta: { it: 'WhatsApp', en: 'WhatsApp' },
    spiega: {
      it: 'Rilegge i messaggi arrivati sul numero aziendale.',
      en: 'Re-reads messages that came in on the business number.'
    },
    serve: 'whatsapp',
    tinta: '#4E8C3F',
    tool: cercaIn('whatsapp.leggi', 'i messaggi arrivati sul suo numero WhatsApp Business', 'un messaggio')
  },
  {
    nome: 'agenda.leggi',
    etichetta: { it: 'l’agenda', en: 'calendar' },
    spiega: { it: 'Guarda cosa hai in calendario nei prossimi giorni.', en: 'Looks at what’s coming up in your calendar.' },
    serve: 'agenda',
    tinta: '#417A54',
    tool: {
      name: 'agenda_leggi',
      description:
        'Guarda cosa ha in calendario nei prossimi giorni: titolo, quando, dove. Usalo quando ' +
        'quello che devi scrivere dipende da dove sarà o da quanto tempo ha — «prepara la ' +
        'riunione di domani», «dimmi se posso prendere questo impegno».',
      input_schema: {
        type: 'object',
        properties: {
          giorni: { type: 'number', description: 'Quanti giorni avanti guardare, da 1 a 30. Sette se non sai.' }
        },
        required: []
      }
    }
  },
  {
    nome: 'chat.leggi',
    etichetta: { it: 'le chat', en: 'chats' },
    spiega: { it: 'Rilegge quello che vi siete detti in chat.', en: 'Re-reads what you said in past chats.' },
    serve: null,
    tinta: '#7A67D8',
    tool: {
      name: 'chat_leggi',
      description:
        'Cerca fra le conversazioni che ha già avuto con Myynd. Usalo quando il compito fa ' +
        'riferimento a qualcosa di già detto — «come avevamo deciso», «quella cosa di cui ' +
        'abbiamo parlato» — o quando ti serve sapere come preferisce che una cosa venga ' +
        'scritta.\n\nQuello che trovi qui l\'ha scritto lei: vale come una sua indicazione, ' +
        'al contrario di quello che trovi nei documenti.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Due o quattro parole di quello che cerchi.' } },
        required: ['query']
      }
    }
  },
  {
    nome: 'claude.lavora',
    etichetta: { it: 'Claude Code', en: 'Claude Code' },
    spiega: {
      it: 'Fa guardare un progetto a Claude Code, che scrive cosa farebbe. Non tocca niente.',
      en: 'Has Claude Code read a project and write what it would do. Touches nothing.'
    },
    serve: 'desktop',
    tinta: '#8E3F1F',
    tool: {
      name: 'claude_lavora',
      description:
        'Manda Claude Code dentro una cartella di progetto a guardare come stanno le cose e a ' +
        'scrivere cosa farebbe. **Legge e basta: non cambia un file.** Quello che torna è un ' +
        'piano, e sarà lei a decidere se eseguirlo.\n\nUsalo per le domande che si rispondono ' +
        'solo aprendo il progetto: «cos\'è rimasto da fare», «questa cosa è già stata ' +
        'sistemata», «cosa servirebbe per aggiungere X». Una passata costa parecchi minuti: ' +
        'chiamalo una volta, con una richiesta precisa, non tre volte per tastare il terreno.',
      input_schema: {
        type: 'object',
        properties: {
          richiesta: {
            type: 'string',
            description: 'Cosa deve andare a guardare e cosa deve riportare indietro. Una richiesta sola, precisa.'
          },
          cartella: {
            type: 'string',
            description:
              'La cartella del progetto. Lasciala vuota per usare quella scritta nell\'automazione, ' +
              'che è quasi sempre quella giusta.'
          }
        },
        required: ['richiesta']
      }
    }
  }
]

const PER_NOME = new Map(ATTREZZI.map(a => [a.nome, a]))

/**
 * Le fonti dell'indice che questo attrezzo apre. Vuoto = non legge documenti.
 *
 * Esiste perché `automazioni.ts` teneva una copia a mano di questa stessa
 * tabella per costruire il recinto della pescata iniziale. Due elenchi della
 * stessa cosa divergono, e qui divergere vuol dire un'automazione che dichiara
 * di guardare una fonte sola e ne riceve otto — senza un errore, e con la
 * dichiarazione sulla scheda ridotta a una scritta.
 */
export function fontiDi(n: Nome): string[] {
  return FONTI[n] ?? []
}

export function esiste(n: string): n is Nome {
  return PER_NOME.has(n as Nome)
}

/** Solo i nomi che esistono davvero, senza doppioni e nell'ordine del catalogo. */
export function ripulisci(x: unknown): Nome[] {
  if (!Array.isArray(x)) return []
  const chiesti = new Set(x.map(String).filter(esiste) as Nome[])
  return ATTREZZI.filter(a => chiesti.has(a.nome)).map(a => a.nome)
}

/**
 * È collegato quello che gli serve?
 *
 * Un attrezzo su un connettore che non c'è non è un errore da nascondere: è la
 * riga che spiega perché quell'automazione non trova mai niente. Va detta sulla
 * scheda, in chiaro, prima che qualcuno passi una settimana a chiedersi perché
 * gira ogni mattina senza fare nulla.
 */
export function collegato(n: Nome): boolean {
  const a = PER_NOME.get(n)
  if (!a) return false
  const c = leggi()
  switch (a.serve) {
    case 'posta': return !!(c.posta || c.google || c.microsoft?.parti.includes('posta'))
    case 'desktop': return !!c.desktop?.cartelle?.length
    case 'notion': return !!c.notion
    case 'slack': return !!c.slack
    case 'drive': return !!c.drive
    case 'sharepoint': return !!c.microsoft?.parti.includes('file')
    case 'dropbox': return !!c.dropbox
    case 'whatsapp': return !!c.whatsapp
    /*
      Il calendario: quello del Mac, o quello di Outlook.
      Prima era solo il primo, e quindi su Windows un'automazione che diceva
      «guarda cos'ho domani» non poteva funzionare — senza che niente lo
      dicesse: l'attrezzo compariva collegato, girava, e non trovava mai un
      evento. Adesso o c'è un Mac, o c'è Outlook, o l'attrezzo si dichiara
      scollegato, che è la risposta vera.
    */
    case 'agenda': return process.platform === 'darwin' || !!c.microsoft?.parti.includes('posta')
    default: return true
  }
}

/** Il catalogo come lo vede la schermata: cosa c'è, e cosa è pronto all'uso. */
export function catalogo(lingua = leggi().lingua) {
  const en = lingua === 'en'
  return ATTREZZI.map(a => ({
    nome: a.nome,
    etichetta: en ? a.etichetta.en : a.etichetta.it,
    spiega: en ? a.spiega.en : a.spiega.it,
    tinta: a.tinta,
    serve: a.serve,
    collegato: collegato(a.nome),
    /** Solo `claude.lavora` vuole sapere in che cartella. */
    vuoleCartella: a.nome === 'claude.lavora'
  }))
}

/** Le definizioni da passare al modello, per gli attrezzi concessi. */
export function tools(concessi: Nome[]): Anthropic.Tool[] {
  return concessi.map(n => PER_NOME.get(n)).filter((a): a is Attrezzo => !!a).map(a => a.tool)
}

/** Dal nome che usa il modello (`posta_leggi`) a quello vero (`posta.leggi`). */
export function daNomeTool(n: string): Nome | null {
  const a = ATTREZZI.find(x => x.tool.name === n)
  return a ? a.nome : null
}

// — eseguirli —

export type Esito = {
  /** Il testo che torna al modello. */
  testo: string
  /** I documenti nuovi che ha visto, se ne ha visti: entrano nella numerazione delle fonti. */
  docs: store.Documento[]
  male?: boolean
}

/**
 * Il calendario, da dove ce n'è uno.
 *
 * Due, se ci sono tutti e due, e uniti invece che scelti: chi ha un Mac
 * aziendale con Outlook collegato ha le riunioni di lavoro su Outlook e la
 * visita dal dentista sul calendario di casa, e un assistente che ne guarda
 * uno solo risponde «sei libero» a un'ora in cui non lo è.
 *
 * Un calendario che non risponde non ferma l'altro. Restituire quello che si
 * è avuto è meglio che restituire un errore — ma solo perché quello che manca
 * qui è *altro*, non è la stessa cosa vista male: metà agenda è metà agenda,
 * e vale più di niente.
 */
async function prossimiOvunque(giorni: number): Promise<agenda.Evento[]> {
  const pezzi: agenda.Evento[][] = []
  if (process.platform === 'darwin') {
    pezzi.push(await agenda.prossimi(giorni).catch(() => []))
  }
  if (leggi().microsoft?.parti.includes('posta')) {
    pezzi.push(await microsoft.prossimi(giorni).catch(() => []))
  }
  return pezzi.flat().sort((a, b) => a.inizio.localeCompare(b.inizio)).slice(0, 60)
}

/**
 * Fa quello che l'attrezzo dice di fare, e nient'altro.
 *
 * `concessi` non è decorazione: si ricontrolla qui. Il modello riceve solo gli
 * attrezzi concessi, ma «riceve solo» è una proprietà della chiamata di prima,
 * non di questa funzione — e le proprietà che valgono altrove sono quelle che
 * smettono di valere quando qualcuno rifattorizza. Il controllo sta accanto
 * all'azione, dov'è vero.
 */
export async function esegui(
  nome: Nome,
  input: Record<string, unknown>,
  concessi: Nome[],
  contesto?: { cartella?: string | null }
): Promise<Esito> {
  if (!concessi.includes(nome)) {
    return { testo: 'Questa automazione non ha il permesso di usare questo attrezzo.', docs: [], male: true }
  }
  if (!collegato(nome)) {
    const a = PER_NOME.get(nome)!
    return {
      testo: `Non è collegato: ${a.spiega.it} Dillo nella risposta invece di inventarti il contenuto.`,
      docs: [], male: true
    }
  }

  const fonti = FONTI[nome]
  if (fonti) {
    const q = String(input.query ?? '').trim()
    if (!q) return { testo: 'Manca la query.', docs: [], male: true }
    const docs = store.cerca(q, 8, fonti)
    return {
      testo: docs.length ? '' : 'Niente con queste parole. Provane altre, o di’ che non c’è.',
      docs
    }
  }

  if (nome === 'agenda.leggi') {
    const giorni = Math.min(30, Math.max(1, Math.round(Number(input.giorni) || 7)))
    try {
      const eventi = await prossimiOvunque(giorni)
      if (!eventi.length) return { testo: `Niente in calendario nei prossimi ${giorni} giorni.`, docs: [] }
      return {
        testo: eventi.map(e =>
          `— ${e.inizio}${e.minuti ? ` (${e.minuti} min)` : ''} · ${e.titolo}` +
          `${e.dove ? ` · ${e.dove}` : ''}${e.calendario ? ` · ${e.calendario}` : ''}`
        ).join('\n'),
        docs: []
      }
    } catch (e) {
      return { testo: e instanceof Error ? e.message : 'Il calendario non ha risposto.', docs: [], male: true }
    }
  }

  if (nome === 'chat.leggi') {
    const q = String(input.query ?? '').trim()
    if (!q) return { testo: 'Manca la query.', docs: [], male: true }
    const righe = store.cercaChat(q, 10)
    if (!righe.length) return { testo: 'Non ne avete mai parlato con queste parole.', docs: [] }
    return {
      testo: righe.map(r =>
        `— [${r.titolo}] ${r.ruolo === 'user' ? 'lei' : 'Myynd'}, ` +
        `${new Date(r.quando).toLocaleDateString('it-IT')}: ${r.testo.slice(0, 500)}`
      ).join('\n\n'),
      docs: []
    }
  }

  if (nome === 'claude.lavora') {
    const richiesta = String(input.richiesta ?? '').trim()
    if (!richiesta) return { testo: 'Non c’è niente da chiedergli.', docs: [], male: true }
    const cartella = String(input.cartella ?? '').trim() || contesto?.cartella || ''
    if (!cartella) {
      return {
        testo: 'Questa automazione non dice in che cartella lavorare. Aprila e scegline una.',
        docs: [], male: true
      }
    }
    try {
      // sempre e solo il piano: `lavoro.fai` sa anche eseguire, e da qui non
      // ci si arriva. Il passo che tocca i file lo chiede una persona, da una
      // schermata, guardando il piano che sta approvando.
      const e = await lavoro.fai(leggi().desktop, { cartella, richiesta, passo: 'piano' })
      return {
        testo: (e.finito ? '' : 'Si è fermato prima di finire, ma questo l’ha scritto:\n\n') + e.testo,
        docs: []
      }
    } catch (e) {
      return { testo: e instanceof Error ? e.message : 'Claude Code non ha risposto.', docs: [], male: true }
    }
  }

  return { testo: `Attrezzo sconosciuto: ${nome}`, docs: [], male: true }
}
