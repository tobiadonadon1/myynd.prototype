// L'aiuto: la guida, dentro l'app.
//
// «La guida» era un indirizzo su claude.ai, e privato: chi ci cliccava trovava
// una pagina che gli chiedeva un accesso che non aveva. Adesso sta qui, nelle
// due lingue dell'app, e descrive Myynd com'è nel codice — non com'era pensato
// in un documento di un anno fa.
//
// Il testo lungo sta in questo file e non nel dizionario: `t()` è fatto per le
// etichette, e un paragrafo indicizzato sulla sua versione italiana è una
// chiave che nessuno ritroverebbe. Ogni pezzo è una coppia `{ it, en }`, e la
// lingua la decide `lingua()`. Le etichette dell'interfaccia citate nel testo
// passano invece dal dizionario — `{{leggiAdesso}}` diventa t('Leggi adesso')
// — così se un bottone cambia nome, cambia anche qui.
//
// Impaginato come Preferenze: una colonna di schede di vetro, una per sezione.
// A finestra larga, a sinistra, un indice che resta fermo mentre si scorre.

import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { lingua, t } from '../lingua'
import { CARD_GLASS, Hov, LABEL, useLarghezza } from '../ui'
import type { Vals } from '../vals'

type Testo = { it: string; en: string }

/**
 * Le etichette dell'interfaccia che il testo cita.
 *
 * Passano da `t()` scritto per esteso, e non da una chiave calcolata: così la
 * prova sul dizionario le vede una per una, e un bottone rinominato senza
 * aggiornare qui è un test rosso invece di una frase che mente.
 */
const ETICHETTE: Record<string, () => string> = {
  daFare: () => t('Da fare'),
  oggi: () => t('Oggi'),
  settimana: () => t('Questa settimana'),
  poi: () => t('Prima o poi'),
  io: () => t('io'),
  bozza: () => t('bozza'),
  pronta: () => t('pronta'),
  tiChiede: () => t('ti chiede'),
  vaBene: () => t('Va bene'),
  correggi: () => t('Correggi'),
  rifallo: () => t('Rifallo'),
  richiamala: () => t('Richiamala'),
  manda: () => t('Manda'),
  leggiAdesso: () => t('Leggi adesso'),
  rileggi: () => t('Rileggi'),
  inLista: () => t('in lista'),
  fatto: () => t('Fatto'),
  piuTardi: () => t('Più tardi'),
  letta: () => t('Letta'),
  nonMiInteressa: () => t('Non mi interessa'),
  guardaIGiornali: () => t('Guarda i giornali'),
  rassegna: () => t('La rassegna'),
  scrivineUna: () => t('Scrivine una a parole'),
  cosaTroverebbe: () => t('Cosa troverebbe adesso'),
  ottimizza: () => t('Ottimizza'),
  comeLavori: () => t('Come lavori'),
  pensavaPrima: () => t('Quello che pensava prima'),
  aggiornaRitratto: () => t('Aggiorna da quello che hai imparato'),
  riordina: () => t('Riordina'),
  fuoco: () => t('Su cosa mi concentro'),
  argomenti: () => t('Di cosa ti tengo aggiornato'),
  trasloco: () => t('Portalo su un’altra macchina'),
  scaricalo: () => t('Scaricalo'),
  caricaneUno: () => t('Caricane uno'),
  soloOsservare: () => t('Solo osservare'),
  preparareEAspettare: () => t('Preparare e aspettare'),
  finoAllUltimoPasso: () => t("Fino all'ultimo passo"),
  modello: () => t('Con quale modello ragiona'),
  abbonamento: () => t('Con il tuo abbonamento'),
  lavoroPiccolo: () => t('Il lavoro piccolo, su questo computer'),
  connettori: () => t('Connettori'),
  preferenze: () => t('Preferenze'),
  memoria: () => t('Memoria'),
  usaAbbonamento: () => t('Usa il tuo abbonamento'),
  portaloQui: () => t('Ho già un Myynd: portalo qui'),
  ciStaLavorando: () => t('ci sta lavorando'),
  nonHoLetto: () => t('Non ho ancora letto niente.'),
  senzaCredito: () => t('La chiave di Claude è senza credito. Ricaricala su console.anthropic.com.'),
  myyndNonRisponde: () => t('Myynd non risponde.')
}

/** Un pezzo di sezione: un paragrafo, dei passi numerati, o un elenco con un titolo per voce. */
type Pezzo =
  | { p: Testo }
  | { passi: Testo[] }
  | { voci: { nome: Testo; testo: Testo }[] }

type Sezione = {
  id: string
  titolo: Testo
  pezzi: Pezzo[]
  /** L'unica azione della scheda, se ce n'è una: un posto dell'app, o un indirizzo. */
  azione?: { etichetta: () => string; vai?: (v: Vals) => void; href?: string }
}

const SOTTOTITOLO: Testo = {
  it: 'Che cos’è, come si comincia, e cosa fare quando qualcosa non va.',
  en: 'What it is, how to start, and what to do when something goes wrong.'
}

const SEZIONI: Sezione[] = [
  {
    id: 'aiuto-cosa',
    titolo: { it: 'Che cos’è Myynd', en: 'What Myynd is' },
    pezzi: [
      {
        p: {
          it: 'Myynd legge le fonti che colleghi — posta, file, note, chat — e risponde alle tue domande da quello che ha letto, citando da dove viene ogni risposta. Prepara anche lavoro per te: risposte, bozze, documenti, piccole automazioni. Niente esce senza un tuo clic.',
          en: 'Myynd reads the sources you connect — mail, files, notes, chats — and answers your questions from what it has read, citing where each answer comes from. It also prepares work for you: replies, drafts, documents, small automations. Nothing leaves without your click.'
        }
      }
    ]
  },
  {
    id: 'aiuto-primi-passi',
    titolo: { it: 'I primi passi', en: 'First steps' },
    pezzi: [
      {
        passi: [
          {
            it: 'Crea l’accesso. Bastano un indirizzo email e una password di almeno otto caratteri. Se hai già un Myynd su un’altra macchina, in questo passo puoi portarne qui il file ({{portaloQui}}).',
            en: 'Create your login. An email address and a password of at least eight characters are enough. If you already have a Myynd on another machine, you can bring its file over at this step ({{portaloQui}}).'
          },
          {
            it: 'Collega Claude. Myynd ragiona con Claude: prendi una chiave API su [console.anthropic.com](https://console.anthropic.com) e incollala quando te la chiede. La chiave deve avere credito sul conto Anthropic: su console.anthropic.com apri Billing e aggiungi credito, altrimenti ogni richiesta fallisce. Se su questo Mac c’è Claude Code con l’accesso fatto, puoi usare il tuo abbonamento al posto della chiave ({{usaAbbonamento}}).',
            en: 'Connect Claude. Myynd thinks with Claude: get an API key at [console.anthropic.com](https://console.anthropic.com) and paste it when asked. The key needs credit on the Anthropic account: on console.anthropic.com open Billing and add credit, otherwise every request fails. If Claude Code is installed and signed in on this Mac, you can use your subscription instead of the key ({{usaAbbonamento}}).'
          },
          {
            it: 'Collega le fonti. Almeno una: la posta, una cartella, Notion. Ognuna si legge e basta. Puoi aggiungerne e toglierne quando vuoi da {{connettori}}, nel menù sotto il tuo nome.',
            en: 'Connect your sources. At least one: your mail, a folder, Notion. Each one is only read, never written to. You can add or remove sources at any time from {{connettori}}, in the menu under your name.'
          },
          {
            it: 'Aspetta la prima lettura. È la più lunga: qualche minuto, se la casella è grande. Poi Myynd mette in prima pagina quello che sembra richiedere te. Da lì in poi rilegge da solo ogni sei ore; per non aspettare, premi {{leggiAdesso}} in prima pagina o {{rileggi}} accanto a una fonte.',
            en: 'Wait for the first read. It is the longest one: a few minutes, if the mailbox is large. Then Myynd puts what seems to need you on the front page. From then on it reads again on its own every six hours; to skip the wait, press {{leggiAdesso}} on the front page or {{rileggi}} next to a source.'
          }
        ]
      }
    ],
    azione: { etichetta: () => t('Apri le connessioni'), vai: v => v.apriConnessioni() }
  },
  {
    id: 'aiuto-fonti',
    titolo: { it: 'Le fonti', en: 'Sources' },
    pezzi: [
      {
        p: {
          it: 'Ogni fonte si legge e basta: Myynd non scrive, non sposta e non cancella niente da solo. Le credenziali restano nella cartella dei dati di Myynd, leggibile solo da te, e non vanno mai a Claude.',
          en: 'Every source is read-only: Myynd never writes, moves or deletes anything on its own. Credentials stay in Myynd’s data folder, readable only by you, and never go to Claude.'
        }
      },
      {
        voci: [
          {
            nome: { it: 'Posta', en: 'Email' },
            testo: {
              it: 'IMAP: indirizzo e password della casella. Il server lo trova Myynd dall’indirizzo; se non ci riesce, scrivi tu l’host IMAP (porta 993, SSL). Gmail e iCloud non accettano la password dell’account: serve una «password per le app» — per Google la crei su [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), per iCloud su [appleid.apple.com](https://appleid.apple.com) sotto «Password per le app». Le caselle Outlook e Microsoft 365 collegale con la fonte Microsoft. Da questa casella partono anche le email che approvi in lista.',
              en: 'IMAP: the address and the mailbox password. Myynd finds the server from the address; if it cannot, type the IMAP host yourself (port 993, SSL). Gmail and iCloud do not accept the account password: you need an “app password” — for Google create one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), for iCloud at [appleid.apple.com](https://appleid.apple.com) under “App-Specific Passwords”. Connect Outlook and Microsoft 365 mailboxes through the Microsoft source instead. The emails you approve in the list are sent from this mailbox.'
            }
          },
          {
            nome: { it: 'Gmail e Calendario (Google)', en: 'Gmail and Calendar (Google)' },
            testo: {
              it: 'Legge posta e agenda dall’API di Google. Vuole un’app registrata su [console.cloud.google.com](https://console.cloud.google.com): crea un progetto, attiva Gmail API e Calendar API, poi Credenziali › ID client OAuth › Applicazione desktop. Incolla in Myynd l’ID client e il segreto; Google chiede il consenso nel browser.',
              en: 'Reads mail and calendar through Google’s API. It needs an app registered at [console.cloud.google.com](https://console.cloud.google.com): create a project, enable Gmail API and Calendar API, then Credentials › OAuth client ID › Desktop app. Paste the client ID and secret into Myynd; Google asks for consent in the browser.'
            }
          },
          {
            nome: { it: 'Outlook e Calendario (Microsoft)', en: 'Outlook and Calendar (Microsoft)' },
            testo: {
              it: 'Microsoft 365: posta e agenda. Vuole un’app registrata su [entra.microsoft.com](https://entra.microsoft.com): Registrazioni app › Nuova registrazione, piattaforma «App per dispositivi mobili e desktop», URI di reindirizzamento `http://localhost`. Incolla l’ID applicazione; Microsoft chiede il consenso, solo in lettura.',
              en: 'Microsoft 365: mail and calendar. It needs an app registered at [entra.microsoft.com](https://entra.microsoft.com): App registrations › New registration, platform “Mobile and desktop applications”, redirect URI `http://localhost`. Paste the Application ID; Microsoft asks for consent, read-only.'
            }
          },
          {
            nome: { it: 'SharePoint e OneDrive', en: 'SharePoint and OneDrive' },
            testo: {
              it: 'I file dei siti che segui e il tuo OneDrive. Stessa app di Outlook: l’ID è già lì, ma il consenso si rifà perché stavolta riguarda i file.',
              en: 'Files from the sites you follow and your OneDrive. Same app as Outlook: the ID is already there, but consent is asked again because this time it is about files.'
            }
          },
          {
            nome: { it: 'Google Drive', en: 'Google Drive' },
            testo: {
              it: 'I tuoi documenti su Drive, in sola lettura. Stesso progetto di Gmail: riusa l’ID client e attiva anche Google Drive API. Il consenso si rifà.',
              en: 'Your documents on Drive, read-only. Same project as Gmail: reuse the client ID and enable Google Drive API too. Consent is asked again.'
            }
          },
          {
            nome: { it: 'Dropbox', en: 'Dropbox' },
            testo: {
              it: 'Su [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) crea un’app «Scoped access» con i permessi files.metadata.read e files.content.read. Incolla la App key, apri Dropbox, e incolla il codice che ti mostra.',
              en: 'At [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) create a “Scoped access” app with the permissions files.metadata.read and files.content.read. Paste the App key, open Dropbox, then paste the code it shows you.'
            }
          },
          {
            nome: { it: 'Slack', en: 'Slack' },
            testo: {
              it: 'Un token da utente: legge solo i canali di cui fai già parte. Su [api.slack.com/apps](https://api.slack.com/apps) crea un’app, in «OAuth & Permissions» aggiungi gli ambiti utente channels:history, groups:history, im:history, mpim:history, channels:read e users:read, installala e copia il token che comincia per xoxp-.',
              en: 'A user token: it reads only the channels you already belong to. At [api.slack.com/apps](https://api.slack.com/apps) create an app, under “OAuth & Permissions” add the user scopes channels:history, groups:history, im:history, mpim:history, channels:read and users:read, install it and copy the token that starts with xoxp-.'
            }
          },
          {
            nome: { it: 'WhatsApp Business', en: 'WhatsApp Business' },
            testo: {
              it: 'Cloud API: Meta manda i messaggi mentre arrivano, non li fa chiedere. Quindi quello che è arrivato prima non c’è, e la macchina su cui gira Myynd deve essere raggiungibile da internet. Servono l’ID del numero, un token permanente, il segreto dell’app e una parola d’ordine per il webhook, il cui indirizzo è il tuo indirizzo pubblico seguito da `/api/whatsapp/webhook`.',
              en: 'Cloud API: Meta pushes messages as they arrive, they cannot be fetched. So what arrived before is not there, and the machine running Myynd must be reachable from the internet. You need the phone number ID, a permanent token, the app secret and a verify word for the webhook, whose address is your public address followed by `/api/whatsapp/webhook`.'
            }
          },
          {
            nome: { it: 'Notion', en: 'Notion' },
            testo: {
              it: 'Crea un’integrazione interna su [notion.so/my-integrations](https://www.notion.so/my-integrations) e incolla il token. Poi condividi con l’integrazione ogni pagina che deve leggere: senza quel passaggio l’API non le vede, anche col token giusto.',
              en: 'Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and paste the token. Then share each page it should read with the integration: without that step the API does not see them, even with the right token.'
            }
          },
          {
            nome: { it: 'Desktop', en: 'Desktop' },
            testo: {
              it: 'Le cartelle che scegli tu, in sola lettura: PDF, Word, testo e Markdown. Salta i progetti di codice. C’è solo quando Myynd gira sul tuo computer: su un server non ha nessuna cartella tua da leggere.',
              en: 'The folders you choose, read-only: PDF, Word, text and Markdown. It skips code projects. It is available only when Myynd runs on your own computer: on a server it has no folder of yours to read.'
            }
          },
          {
            nome: { it: 'Da fare', en: 'To do' },
            testo: {
              it: 'La tua lista è una fonte come le altre: quello che decidi di fare dice di te quanto un documento. È collegata da sola, sempre.',
              en: 'Your list is a source like the others: what you decide to do says as much about you as a document. It is always connected, on its own.'
            }
          }
        ]
      }
    ],
    azione: { etichetta: () => t('Vai ai connettori'), vai: v => v.goConn() }
  },
  {
    id: 'aiuto-da-fare',
    titolo: { it: 'Da fare: la lista', en: 'To do: the list' },
    pezzi: [
      {
        p: {
          it: '{{daFare}} è la tua lista. Scrivi una riga come la diresti a voce e premi Invio. Ogni riga sta in uno di tre gruppi: {{oggi}}, {{settimana}}, {{poi}}. Batti / per scegliere il gruppo o affidarla subito senza toccare il mouse.',
          en: '{{daFare}} is your list. Type a line the way you would say it out loud and press Enter. Each line sits in one of three groups: {{oggi}}, {{settimana}}, {{poi}}. Type / to pick the group or hand a line over without touching the mouse.'
        }
      },
      {
        voci: [
          {
            nome: { it: 'Le tre colonne', en: 'The three columns' },
            testo: {
              it: '{{io}}: la fai tu, Myynd non la tocca. {{bozza}}: te la scrive, rileggi e mandi tu. Myynd: la porta fino all’ultimo passo — testo, allegati, a chi va. Scegliere la colonna è delegare; tornare su {{io}} è richiamarla indietro.',
              en: '{{io}}: you do it, Myynd does not touch it. {{bozza}}: Myynd writes it, you read it over and send it. Myynd: it carries it to the last step — text, attachments, who it goes to. Choosing the column is delegating; going back to {{io}} takes it back.'
            }
          },
          {
            nome: { it: 'Cos’è una bozza', en: 'What a draft is' },
            testo: {
              it: 'Il testo che Myynd ha scritto per quella riga. Quando è pronto la riga si apre da sola e porta la pastiglia {{pronta}}. Puoi approvarla ({{vaBene}}), correggerla ({{correggi}}), farla rifare ({{rifallo}}), mandarla per email o salvarla come documento. Quello che correggi, Myynd se lo ricorda.',
              en: 'The text Myynd wrote for that line. When it is ready the line opens on its own and shows the {{pronta}} tag. You can approve it ({{vaBene}}), edit it ({{correggi}}), have it redone ({{rifallo}}), send it by email or save it as a document. What you correct, Myynd remembers.'
            }
          },
          {
            nome: { it: 'Cosa vuol dire «ti chiede»', en: 'What “asks you” means' },
            testo: {
              it: 'Myynd non inventa: se gli manca qualcosa — un indirizzo, cosa vuoi dire — si ferma e lo chiede, e la riga porta la pastiglia {{tiChiede}}. Rispondi sotto la riga, anche con cinque parole, e il lavoro riparte da lì.',
              en: 'Myynd does not make things up: if something is missing — an address, what you want to say — it stops and asks, and the line shows the {{tiChiede}} tag. Answer under the line, five words are enough, and the work picks up from there.'
            }
          },
          {
            nome: { it: 'Niente parte senza un tuo clic', en: 'Nothing is sent without your click' },
            testo: {
              it: 'Un’email parte solo quando premi {{manda}} nel pannello che mostra destinatario, oggetto e testo, tutti modificabili. Quando Myynd propone di archiviare o cestinare dei messaggi, vedi l’elenco per intero e li sposti tu: si spostano, non si cancellano.',
              en: 'An email leaves only when you press {{manda}} in the panel that shows recipient, subject and text, all editable. When Myynd proposes to archive or bin some messages, you see the full list and you move them: they are moved, not deleted.'
            }
          }
        ]
      }
    ],
    azione: { etichetta: () => t('Apri la lista'), vai: v => v.goOggi() }
  },
  {
    id: 'aiuto-chat',
    titolo: { it: 'La chat', en: 'Chat' },
    pezzi: [
      {
        p: {
          it: 'Chiedi qualcosa al tuo materiale, come lo chiederesti a un collega. Myynd cerca fra quello che ha letto e risponde in poche righe.',
          en: 'Ask something about your material, the way you would ask a colleague. Myynd searches what it has read and answers in a few lines.'
        }
      },
      {
        p: {
          it: 'Le fonti stanno nel testo: un numerino accanto alla parola. Passaci sopra per vedere da dove viene, cliccalo per aprire il documento.',
          en: 'The sources sit in the text: a small number next to the word. Hover it to see where it comes from, click it to open the document.'
        }
      },
      {
        p: {
          it: 'Se la prima ricerca non trova niente, Myynd riprova con altre parole — e, se i tuoi documenti possono essere in un’altra lingua, con le parole di quella lingua. Se davvero non c’è, lo dice invece di inventare.',
          en: 'If the first search finds nothing, Myynd tries again with other words — and, if your documents may be in another language, with the words of that language. If it really is not there, it says so instead of guessing.'
        }
      },
      {
        p: {
          it: 'Le conversazioni restano nella colonna di sinistra. Senza Claude collegato la chat non può rispondere.',
          en: 'Conversations stay in the left column. Without Claude connected, the chat cannot answer.'
        }
      }
    ],
    azione: { etichetta: () => t('Apri la chat'), vai: v => v.goChat() }
  },
  {
    id: 'aiuto-prima-pagina',
    titolo: { it: 'La prima pagina e la rassegna', en: 'The front page and the briefing' },
    pezzi: [
      {
        p: {
          it: 'La schermata Myynd è la prima pagina. In alto c’è {{rassegna}}; sotto, quello che Myynd ha trovato nelle tue cose.',
          en: 'The Myynd screen is the front page. On top is {{rassegna}}; below it, what Myynd found in your material.'
        }
      },
      {
        voci: [
          {
            nome: { it: 'La rassegna', en: 'The briefing' },
            testo: {
              it: 'Myynd guarda un gruppo di giornali qualche volta al giorno e sceglie una manciata di notizie. In {{preferenze}}, sotto {{argomenti}}, scrivi cosa ti interessa; vuoto vuol dire un po’ di tutto. Impara anche da quello che apri. Clicca una carta per leggere l’articolo; {{letta}} la toglie, {{nonMiInteressa}} la scarta e non torna più. La freccia ({{guardaIGiornali}}) ribussa ai giornali.',
              en: 'Myynd checks a set of newspapers a few times a day and picks a handful of stories. In {{preferenze}}, under {{argomenti}}, write what interests you; empty means a bit of everything. It also learns from what you open. Click a card to read the article; {{letta}} removes it, {{nonMiInteressa}} discards it for good. The arrow ({{guardaIGiornali}}) checks the papers again.'
            }
          },
          {
            nome: { it: 'Quello che richiede te', en: 'What needs you' },
            testo: {
              it: 'Dalle tue fonti Myynd mette da parte quello che sembra richiedere te: cose da decidere, da leggere, scadenze. La prima sta in grande, le altre sotto. Da ogni voce puoi metterla {{inLista}}, chiedere a Myynd, segnarla {{fatto}} o rimandarla ({{piuTardi}}). Ogni tanto Myynd ti fa una domanda qui: bastano cinque parole.',
              en: 'From your sources Myynd sets aside what seems to need you: things to decide, to read, deadlines. The first one is shown large, the others below. From each item you can put it {{inLista}}, ask Myynd, mark it {{fatto}} or postpone it ({{piuTardi}}). Now and then Myynd asks you a question here: five words are enough.'
            }
          },
          {
            nome: { it: 'Rileggere', en: 'Reading again' },
            testo: {
              it: '{{leggiAdesso}} rilegge le fonti collegate. Se Myynd non ha ancora letto niente, lo dice, e lo stesso bottone è il punto da cui partire.',
              en: '{{leggiAdesso}} reads the connected sources again. If Myynd has not read anything yet, it says so, and the same button is where to start.'
            }
          }
        ]
      }
    ],
    azione: { etichetta: () => t('Vai alla prima pagina'), vai: v => v.goMyynd() }
  },
  {
    id: 'aiuto-automazioni',
    titolo: { it: 'Le automazioni', en: 'Automations' },
    pezzi: [
      {
        p: {
          it: 'Un’automazione è un lavoro che Myynd fa da solo: a un’ora fissa, ogni giorno o un giorno alla settimana, oppure quando arriva qualcosa di nuovo. Quando trova qualcosa ti lascia una riga in lista. Non manda niente a nessuno.',
          en: 'An automation is a job Myynd does on its own: at a fixed hour, every day or one day a week, or when something new arrives. When it finds something it leaves a line in your list. It sends nothing to anyone.'
        }
      },
      {
        voci: [
          {
            nome: { it: 'Scriverne una', en: 'Writing one' },
            testo: {
              it: 'Premi {{scrivineUna}} e descrivila a parole: «Ogni lunedì dimmi quali preventivi nella posta sono ancora senza risposta». Scrivi @ per dirle cosa può aprire. Al resto pensa Myynd: il nome, l’ora, le parole della ricerca.',
              en: 'Press {{scrivineUna}} and describe it in words: “Every Monday tell me which quotes in my mail are still unanswered”. Type @ to say what it may open. Myynd does the rest: the name, the hour, the search words.'
            }
          },
          {
            nome: { it: 'Cosa può leggere', en: 'What it may read' },
            testo: {
              it: 'Solo gli attrezzi che le hai dato: la posta, il desktop, Notion, Slack, Drive, SharePoint, Dropbox, WhatsApp, l’agenda, le chat passate. Claude Code è un attrezzo a parte: guarda un progetto e scrive cosa farebbe, senza toccare niente. Un attrezzo è un permesso: se la fonte non è collegata, l’automazione lo dice e non trova niente.',
              en: 'Only the tools you gave it: mail, desktop, Notion, Slack, Drive, SharePoint, Dropbox, WhatsApp, calendar, past chats. Claude Code is a tool of its own: it reads a project and writes what it would do, touching nothing. A tool is a permission: if the source is not connected, the automation says so and finds nothing.'
            }
          },
          {
            nome: { it: 'Nasce in pausa', en: 'It starts paused' },
            testo: {
              it: 'Una nuova automazione nasce in pausa. Aprila e premi {{cosaTroverebbe}}: vedi subito cosa leggerebbe e cosa ne verrebbe fuori, senza aspettare l’ora. Quando ti convince, accendila con l’interruttore. {{ottimizza}} la fa riscrivere meglio a Claude, solo se lo chiedi tu.',
              en: 'A new automation starts paused. Open it and press {{cosaTroverebbe}}: you see right away what it would read and what would come out, without waiting for its hour. When it convinces you, switch it on. {{ottimizza}} has Claude rewrite it better, only when you ask.'
            }
          },
          {
            nome: { it: 'Le cartelle', en: 'Folders' },
            testo: {
              it: 'Le cartelle a sinistra sono tue: creale come vuoi e trascinaci dentro le schede. Sotto, «per cosa aprono» filtra le automazioni per attrezzo.',
              en: 'The folders on the left are yours: create them as you like and drag cards into them. Below, “by what they open” filters automations by tool.'
            }
          }
        ]
      }
    ],
    azione: { etichetta: () => t('Apri le automazioni'), vai: v => v.goAuto() }
  },
  {
    id: 'aiuto-memoria',
    titolo: { it: 'La memoria', en: 'Memory' },
    pezzi: [
      {
        p: {
          it: '{{memoria}} è quello che Myynd crede di te, separato da quello che ha letto. I documenti sono fatti; qui sta il giudizio, e puoi cambiarlo.',
          en: '{{memoria}} is what Myynd believes about you, separate from what it has read. Documents are facts; this is judgement, and you can change it.'
        }
      },
      {
        voci: [
          {
            nome: { it: 'Il ritratto', en: 'The portrait' },
            testo: {
              it: 'Cinque blocchi sotto {{comeLavori}}: come decidi, cosa controlli sempre prima di dire di sì, come scrivi, gli errori da evitare, le persone che contano. Li riempie Myynd da quello che impara, e lo dice. Appena ci metti mano tu diventano parole tue. {{riordina}} rimette in ordine un blocco; {{aggiornaRitratto}} li aggiorna adesso invece che al prossimo giro.',
              en: 'Five blocks under {{comeLavori}}: how you decide, what you always check before saying yes, how you write, mistakes to avoid, the people who matter. Myynd fills them from what it learns, and says so. As soon as you edit one, it becomes your words. {{riordina}} tidies up a block; {{aggiornaRitratto}} updates them now instead of at the next round.'
            }
          },
          {
            nome: { it: 'Quello che ha capito', en: 'What it has worked out' },
            testo: {
              it: 'Ogni convinzione porta la sua origine — te l’ha sentita dire, l’ha dedotta, l’ha notata — e quanto ci crede. Apri «perché» per vedere la prova. Passaci sopra e usa il cestino per fargliela scordare; scrivine una tua nel campo in fondo.',
              en: 'Each belief carries its origin — you told it, it inferred it, it noticed it — and how sure it is. Open “why” to see the evidence. Hover a belief and use the bin to make it forget; write one of your own in the field at the bottom.'
            }
          },
          {
            nome: { it: 'Quando cambia idea', en: 'When it changes its mind' },
            testo: {
              it: 'Niente si cancella in silenzio: alla vecchia convinzione mette una data di fine e la sposta in {{pensavaPrima}}.',
              en: 'Nothing is erased silently: the old belief gets an end date and moves to {{pensavaPrima}}.'
            }
          }
        ]
      }
    ],
    azione: { etichetta: () => t('Apri la memoria'), vai: v => v.goMemoria() }
  },
  {
    id: 'aiuto-preferenze',
    titolo: { it: 'Le preferenze', en: 'Preferences' },
    pezzi: [
      {
        voci: [
          {
            nome: { it: 'Motore e modello', en: 'Engine and model' },
            testo: {
              it: 'Sotto {{modello}} scegli con quale Claude ragiona: Haiku 4.5, il più rapido ed economico; Sonnet 5, il predefinito; Opus 5, il più capace e il più caro. Se su questo Mac c’è Claude Code con l’accesso fatto, sotto {{abbonamento}} puoi far passare il lavoro grosso dal tuo abbonamento invece che dalla chiave a consumo. Se sul tuo Mac gira un modello locale (Ollama), {{lavoroPiccolo}} gli affida i titoli delle chat, le traduzioni e gli appunti su di te; risposte e bozze restano a Claude.',
              en: 'Under {{modello}} you choose which Claude it thinks with: Haiku 4.5, the fastest and cheapest; Sonnet 5, the default; Opus 5, the most capable and the most expensive. If Claude Code is installed and signed in on this Mac, {{abbonamento}} lets the heavy work go through your subscription instead of the pay-per-use key. If a local model (Ollama) is running on your Mac, {{lavoroPiccolo}} gives it chat titles, translations and the notes about you; answers and drafts stay with Claude.'
            }
          },
          {
            nome: { it: 'Lingua', en: 'Language' },
            testo: {
              it: 'Italiano o inglese. Vale per l’interfaccia, le risposte e la prima pagina; i documenti si leggono comunque nella lingua in cui sono. Cambiare lingua traduce anche il feed, quindi ci mette qualche secondo.',
              en: 'Italian or English. It applies to the interface, the answers and the front page; documents are read in whatever language they are in. Switching also translates the feed, so it takes a few seconds.'
            }
          },
          {
            nome: { it: 'Tono', en: 'Tone' },
            testo: {
              it: 'Diretto, cordiale o formale: è la voce delle bozze. Sotto i tre bottoni c’è un esempio di come suona.',
              en: 'Direct, warm or formal: it is the voice of the drafts. Under the three buttons there is an example of how it sounds.'
            }
          },
          {
            nome: { it: 'Autonomia', en: 'Autonomy' },
            testo: {
              it: 'Tre livelli. {{soloOsservare}}: legge e indicizza, e prima di proporti qualcosa di operativo chiede. {{preparareEAspettare}}: scrive bozze e brief. {{finoAllUltimoPasso}}: prepara tutto fino in fondo. In tutti e tre l’ultimo passo — premere invio — resta tuo.',
              en: 'Three levels. {{soloOsservare}}: it reads and indexes, and asks before proposing anything operational. {{preparareEAspettare}}: it writes drafts and briefs. {{finoAllUltimoPasso}}: it prepares everything to the end. In all three the last step — pressing send — stays yours.'
            }
          },
          {
            nome: { it: 'Fuoco e argomenti', en: 'Focus and topics' },
            testo: {
              it: '{{fuoco}} dice a Myynd dove guardare prima, dentro le tue cose («questa settimana solo i preventivi»). {{argomenti}} dice cosa cercare fuori, nei giornali. Vuoti vogliono dire: guarda tutto.',
              en: '{{fuoco}} tells Myynd where to look first, inside your material (“this week only the quotes”). {{argomenti}} tells it what to look for outside, in the papers. Empty means: look at everything.'
            }
          }
        ]
      }
    ],
    azione: { etichetta: () => t('Apri le preferenze'), vai: v => v.goPref() }
  },
  {
    id: 'aiuto-dati',
    titolo: { it: 'I tuoi dati', en: 'Your data' },
    pezzi: [
      {
        voci: [
          {
            nome: { it: 'Dove stanno', en: 'Where they live' },
            testo: {
              it: 'Su un Mac tutto sta in `~/.myynd`: l’indice in `mente.db`, le credenziali in `config.json`, leggibili solo da te. Su un server sta nella cartella dei dati di Myynd, in una sottocartella che è solo tua: gli altri account non la vedono. Quello che esce sono le richieste a Claude — la domanda e i pezzi di documento che servono a rispondere — e le chiamate ai giornali per la rassegna.',
              en: 'On a Mac everything lives in `~/.myynd`: the index in `mente.db`, the credentials in `config.json`, readable only by you. On a server it lives in Myynd’s data folder, in a subfolder that is yours alone: other accounts cannot see it. What goes out are the requests to Claude — the question and the pieces of document needed to answer — and the calls to the newspapers for the news.'
            }
          },
          {
            nome: { it: 'Portarli altrove', en: 'Moving them elsewhere' },
            testo: {
              it: 'In {{preferenze}}, sotto {{trasloco}}, {{scaricalo}} ti dà un file `.myynd` con dentro tutto: documenti, lista, memoria, automazioni e fonti collegate. Dentro ci sono anche le password delle caselle e i token: quel file apre la tua posta. Trattalo come una password — spostalo, poi cancellalo. Su un altro Myynd, {{caricaneUno}} lo carica e sostituisce quello che c’è: non si fonde niente.',
              en: 'In {{preferenze}}, under {{trasloco}}, {{scaricalo}} gives you a `.myynd` file with everything in it: documents, list, memory, automations and connected sources. It also contains your mailbox passwords and tokens: that file opens your mail. Treat it like a password — move it, then delete it. On another Myynd, {{caricaneUno}} uploads it and replaces what is there: nothing is merged.'
            }
          },
          {
            nome: { it: 'Cancellare tutto', en: 'Deleting everything' },
            testo: {
              it: 'Non c’è ancora un bottone. Sul tuo Mac: chiudi Myynd e cancella la cartella `~/.myynd`. Su un server: chiedilo a chi lo ospita.',
              en: 'There is no button yet. On your Mac: quit Myynd and delete the `~/.myynd` folder. On a server: ask the person who hosts it.'
            }
          }
        ]
      }
    ]
  },
  {
    id: 'aiuto-problemi',
    titolo: { it: 'Quando qualcosa non va', en: 'Troubleshooting' },
    pezzi: [
      {
        voci: [
          {
            nome: { it: '{{senzaCredito}}', en: '{{senzaCredito}}' },
            testo: {
              it: 'La chiave funziona ma il conto Anthropic è a zero. Su [console.anthropic.com](https://console.anthropic.com) apri Billing e aggiungi credito. Poi riprova: non c’è bisogno di ricollegare la chiave.',
              en: 'The key works but the Anthropic account is at zero. At [console.anthropic.com](https://console.anthropic.com) open Billing and add credit. Then try again: there is no need to reconnect the key.'
            }
          },
          {
            nome: { it: '«Il modello … non accetta questa richiesta»', en: '“The model … does not accept this request”' },
            testo: {
              it: 'Il modello scelto ha rifiutato la richiesta. In {{preferenze}}, sotto {{modello}}, scegli Sonnet 5 e riprova.',
              en: 'The chosen model refused the request. In {{preferenze}}, under {{modello}}, pick Sonnet 5 and try again.'
            }
          },
          {
            nome: { it: 'La posta non si collega', en: 'Email will not connect' },
            testo: {
              it: 'Con Gmail e iCloud serve la password per le app, non quella dell’account. Controlla l’host IMAP — imap.gmail.com, imap.mail.me.com, imap.register.it, imaps.aruba.it — e la porta, che è 993 con SSL. Le caselle Outlook e Microsoft 365 di solito rifiutano la password semplice: collegale con la fonte Microsoft.',
              en: 'With Gmail and iCloud you need the app password, not the account one. Check the IMAP host — imap.gmail.com, imap.mail.me.com, imap.register.it, imaps.aruba.it — and the port, which is 993 with SSL. Outlook and Microsoft 365 mailboxes usually refuse a plain password: connect them through the Microsoft source.'
            }
          },
          {
            nome: { it: '{{nonHoLetto}}', en: '{{nonHoLetto}}' },
            testo: {
              it: 'Nessuna fonte è stata letta ancora. Collega una fonte, premi {{leggiAdesso}} e aspetta: la prima lettura può durare qualche minuto.',
              en: 'No source has been read yet. Connect a source, press {{leggiAdesso}} and wait: the first read can take a few minutes.'
            }
          },
          {
            nome: { it: 'Una riga resta {{ciStaLavorando}}', en: 'A line stays {{ciStaLavorando}}' },
            testo: {
              it: 'Myynd ha preso la riga e non è tornato. Clicca la colonna {{io}} per richiamarla ({{richiamala}}), poi affidala di nuovo scegliendo la colonna {{bozza}} o Myynd.',
              en: 'Myynd took the line and has not come back. Click the {{io}} column to take it back ({{richiamala}}), then hand it over again by choosing the {{bozza}} or Myynd column.'
            }
          },
          {
            nome: { it: '{{myyndNonRisponde}}', en: '{{myyndNonRisponde}}' },
            testo: {
              it: 'Il motore locale non risponde. Myynd riprova da solo qualche volta; se non torna, chiudi l’app e riaprila.',
              en: 'The local engine is not answering. Myynd retries on its own a few times; if it does not come back, quit the app and open it again.'
            }
          }
        ]
      }
    ]
  },
  {
    id: 'aiuto-scrivi',
    titolo: { it: 'Serve una mano?', en: 'Need a hand?' },
    pezzi: [
      {
        p: {
          it: 'Qualcosa non è chiaro, o non va come dovrebbe? Una riga basta.',
          en: 'Something unclear, or not working as it should? One line is enough.'
        }
      }
    ],
    azione: { etichetta: () => t('Scrivi a Tobia'), href: 'mailto:tobia@donadon.com' }
  }
]

// — come si scrive —

const TITOLO: CSSProperties = { fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em', fontWeight: 400, margin: 0 }
const SOTTO: CSSProperties = {
  fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(34,39,31,.65)', margin: '10px 0 0',
  maxWidth: '68ch', textWrap: 'pretty'
}
const TITOLO_SCHEDA: CSSProperties = {
  fontSize: 17, lineHeight: 1.3, fontWeight: 500, letterSpacing: '-.015em', color: '#22271F', margin: 0
}
/**
 * La misura del testo: circa sessantotto caratteri. Sotto, una riga si legge
 * d'un fiato; oltre, l'occhio perde il capo. `overflowWrap: 'anywhere'` è la
 * regola di casa: qui dentro ci sono indirizzi lunghi senza spazi, e un
 * indirizzo che esce dal riquadro è l'app che sembra rotta.
 */
const PARAGRAFO: CSSProperties = {
  fontSize: 14, lineHeight: 1.65, color: 'rgba(34,39,31,.78)', margin: '10px 0 0',
  maxWidth: '68ch', minWidth: 0, textWrap: 'pretty', overflowWrap: 'anywhere'
}
const ELENCO: CSSProperties = { margin: '8px 0 0', paddingLeft: 22, maxWidth: '68ch' }
const PASSO: CSSProperties = {
  fontSize: 14, lineHeight: 1.65, color: 'rgba(34,39,31,.78)', marginTop: 8,
  textWrap: 'pretty', overflowWrap: 'anywhere'
}
const NOME_VOCE: CSSProperties = { fontSize: 14, lineHeight: 1.4, fontWeight: 500, color: '#22271F', margin: 0 }
const CODICE: CSSProperties = { background: 'rgba(34,39,31,.07)', padding: '1px 6px', borderRadius: 5, fontSize: '12.5px' }
const LINK: CSSProperties = {
  color: '#8E3F1F', textDecoration: 'underline', textDecorationColor: 'rgba(142,63,31,.35)', textUnderlineOffset: 2
}
const ETICHETTA: CSSProperties = { color: '#22271F', fontWeight: 500 }
const VOCE_INDICE: CSSProperties = {
  display: 'block', padding: '6px 12px', borderRadius: 10, fontSize: '13px', lineHeight: 1.35,
  color: 'rgba(34,39,31,.62)', textDecoration: 'none'
}
const PASTIGLIA_INDICE: CSSProperties = {
  display: 'inline-block', padding: '6px 12px', borderRadius: 99, fontSize: '12.5px',
  border: '1px solid rgba(34,39,31,.14)', background: 'rgba(255,255,255,.5)',
  color: 'rgba(34,39,31,.65)', textDecoration: 'none'
}
const AZIONE: CSSProperties = { display: 'inline-block', fontSize: '13px', color: '#8E3F1F', textDecoration: 'none' }

/** I tre segni ammessi dentro un testo: un'etichetta, un link, un pezzo di codice. */
const SEGNI = /(\{\{[a-zA-Z]+\}\}|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`)/g

/**
 * Il testo di un pezzo, con dentro i suoi segni.
 *
 * Un'etichetta si legge fra virgolette — le caporali in italiano, quelle alte
 * in inglese — e nel colore pieno del testo: è una cosa che sullo schermo si
 * chiama proprio così, e deve saltare all'occhio come una parola da cercare.
 */
function inRiga(s: string): ReactNode[] {
  const en = lingua() === 'en'
  return s.split(SEGNI).map((pezzo, i) => {
    if (!pezzo) return null
    const etichetta = /^\{\{([a-zA-Z]+)\}\}$/.exec(pezzo)
    if (etichetta) {
      const nome = ETICHETTE[etichetta[1]]?.() ?? etichetta[1]
      return <span key={i} style={ETICHETTA}>{en ? `“${nome}”` : `«${nome}»`}</span>
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(pezzo)
    if (link) {
      const posta = link[2].startsWith('mailto:')
      return (
        <a key={i} href={link[2]} style={LINK} {...(posta ? {} : { target: '_blank', rel: 'noreferrer' })}>
          {link[1]}
        </a>
      )
    }
    const codice = /^`([^`]+)`$/.exec(pezzo)
    if (codice) return <code key={i} style={CODICE}>{codice[1]}</code>
    return pezzo
  })
}

function Pezzo({ p }: { p: Pezzo }) {
  const L = (x: Testo) => (lingua() === 'en' ? x.en : x.it)
  if ('p' in p) return <p style={PARAGRAFO}>{inRiga(L(p.p))}</p>
  if ('passi' in p) {
    return (
      <ol style={ELENCO}>
        {p.passi.map((x, i) => <li key={i} style={PASSO}>{inRiga(L(x))}</li>)}
      </ol>
    )
  }
  return (
    <div>
      {p.voci.map((x, i) => (
        <div key={i} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(34,39,31,.08)' }}>
          <h3 style={NOME_VOCE}>{inRiga(L(x.nome))}</h3>
          <p style={{ ...PARAGRAFO, marginTop: 5, fontSize: '13.5px', lineHeight: 1.6 }}>{inRiga(L(x.testo))}</p>
        </div>
      ))}
    </div>
  )
}

/** Una sezione: una scheda di vetro, come in Preferenze, con un'azione sola in fondo. */
function Scheda({ s, i, v }: { s: Sezione; i: number; v: Vals }) {
  const L = (x: Testo) => (lingua() === 'en' ? x.en : x.it)
  const a = s.azione
  return (
    <section id={s.id} aria-labelledby={`${s.id}-titolo`} style={{
      ...CARD_GLASS, flex: 'none', marginTop: i ? 14 : 0,
      borderRadius: i % 2 ? '20px 24px 20px 24px' : '24px 20px 24px 20px',
      padding: '22px 24px', scrollMarginTop: 12
    }}>
      <h2 id={`${s.id}-titolo`} style={TITOLO_SCHEDA}>{L(s.titolo)}</h2>
      {s.pezzi.map((p, k) => <Pezzo key={k} p={p} />)}
      {a && (
        <div style={{ marginTop: 16 }}>
          {a.href
            ? <Hov as="a" href={a.href} style={AZIONE} hover={{ color: '#C4623B' }}>{a.etichetta()}</Hov>
            : (
              <Hov as="a" href="#" style={AZIONE} hover={{ color: '#C4623B' }}
                onClick={(e: MouseEvent) => { e.preventDefault(); a.vai?.(v) }}>{a.etichetta()}</Hov>
            )}
        </div>
      )}
    </section>
  )
}

export function Aiuto({ v }: { v: Vals }) {
  // sotto i mille pixel l'indice a lato non ci sta: sale sopra, in una fila
  const largo = useLarghezza() >= 1000
  const L = (x: Testo) => (lingua() === 'en' ? x.en : x.it)

  // L'ancora è vera — `href` con il suo `#id`, per chi la legge con la tastiera
  // o con uno screen reader — ma lo scorrimento lo si fa a mano: l'app sta in
  // un riquadro fisso, e il salto secco del browser dentro una colonna che
  // scorre da sola è uno strappo, non uno spostamento.
  const vai = (id: string) => (e: MouseEvent) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ width: largo ? 940 : 720, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 4px 22px' }}>
        <h1 style={TITOLO}>{t('Aiuto')}</h1>
        <p style={SOTTO}>{L(SOTTOTITOLO)}</p>
      </div>

      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
        {largo && (
          <nav aria-label={t('In questa pagina')} style={{ width: 184, flex: 'none', position: 'sticky', top: 0 }}>
            <div style={{ ...LABEL, fontSize: '10px', padding: '0 12px 8px' }}>{t('In questa pagina')}</div>
            {SEZIONI.map(s => (
              <Hov key={s.id} as="a" href={`#${s.id}`} onClick={vai(s.id)} style={VOCE_INDICE}
                hover={{ color: '#8E3F1F', background: 'rgba(34,39,31,.05)' }}>{L(s.titolo)}</Hov>
            ))}
          </nav>
        )}

        <div style={{ flex: 1, minWidth: 0, maxWidth: 720 }}>
          {!largo && (
            <nav aria-label={t('In questa pagina')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 0 14px' }}>
              {SEZIONI.map(s => (
                <Hov key={s.id} as="a" href={`#${s.id}`} onClick={vai(s.id)} style={PASTIGLIA_INDICE}
                  hover={{ color: '#8E3F1F', borderColor: 'rgba(196,98,59,.5)' }}>{L(s.titolo)}</Hov>
              ))}
            </nav>
          )}
          {SEZIONI.map((s, i) => <Scheda key={s.id} s={s} i={i} v={v} />)}
        </div>
      </div>
    </div>
  )
}
