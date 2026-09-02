// Il catalogo dei connettori. Quelli con `pronto: true` funzionano davvero;
// gli altri restano visibili perché fanno parte del disegno, ma dicono
// chiaramente che non sono ancora collegabili.
//
// La `nota` non è una didascalia: è quello che una persona legge *prima* di
// premere «Collega», e deve dire la cosa che le costerà — «serve un'app
// registrata», «serve un indirizzo pubblico». Una nota che promette meno
// attrito di quello vero è il modo più veloce per far abbandonare un
// collegamento a metà, con le credenziali già mezze incollate.

export type VoceConnettore = {
  id: string
  nome: string
  gruppo: 'Comunicazione' | 'File' | 'Note' | 'Ragionamento' | 'Gestionale'
  /**
   * Si può collegare adesso.
   *
   * Non è «il codice c'è»: è «lo offriamo». Gmail, Calendario, Drive, Outlook e
   * SharePoint funzionano — il ballo del consenso è scritto e provato — ma
   * prima che una persona possa premere quel bottone Google e Microsoft devono
   * conoscere Myynd: un'app registrata da chi ospita, e per Google una
   * verifica che chiede settimane perché legge la posta. Finché non c'è,
   * offrirli vorrebbe dire un bottone che non può funzionare. Stanno fra
   * quelli che arrivano, con gli altri.
   */
  pronto: boolean
  /**
   * Porta documenti nell'indice: c'è un `sincronizza` dietro.
   *
   * Separato da `pronto` di proposito. Teams e Fatture non hanno codice, e non
   * devono entrare nel recinto delle automazioni; Gmail e Outlook ce l'hanno,
   * e devono restarci anche mentre non si offrono — perché chi li ha collegati
   * prima continua a portare documenti, e un'automazione deve poterli
   * dichiarare. Il recinto segue il codice, non la vetrina.
   */
  legge?: boolean
  nota: string
}

export const CATALOGO: VoceConnettore[] = [
  { id: 'posta', nome: 'Posta', gruppo: 'Comunicazione', pronto: true, legge: true, nota: 'IMAP: host, indirizzo e password della casella.' },
  /*
   * L'agenda prima di Gmail, e non è un ordine casuale.
   *
   * È l'unica fonte che si collega incollando una cosa sola, senza registrare
   * niente da nessuna parte: sta accanto a «Posta» perché insieme fanno il
   * novanta per cento di quello che una persona voleva da Google.
   */
  { id: 'calendario', nome: 'Calendario', gruppo: 'Comunicazione', pronto: true, legge: true, nota: 'Un indirizzo da incollare: quello segreto in formato iCal della tua agenda. Google, Outlook, iCloud.' },
  { id: 'google', nome: 'Gmail e Calendario', gruppo: 'Comunicazione', pronto: false, legge: true, nota: 'Arriva presto. Intanto la posta si collega da «Posta» e l’agenda da «Calendario».' },
  { id: 'microsoft', nome: 'Outlook e Calendario', gruppo: 'Comunicazione', pronto: false, legge: true, nota: 'Arriva presto: posta e agenda di Microsoft 365.' },
  { id: 'slack', nome: 'Slack', gruppo: 'Comunicazione', pronto: true, legge: true, nota: 'Un token da utente: legge i canali di cui fai già parte.' },
  { id: 'whatsapp', nome: 'WhatsApp Business', gruppo: 'Comunicazione', pronto: true, legge: true, nota: 'Cloud API. Riceve i messaggi mentre arrivano: serve un indirizzo pubblico.' },
  { id: 'desktop', nome: 'Desktop', gruppo: 'File', pronto: true, legge: true, nota: 'Le cartelle che scegli tu, lette in sola lettura.' },
  { id: 'drive', nome: 'Google Drive', gruppo: 'File', pronto: false, legge: true, nota: 'Arriva presto, insieme a Gmail.' },
  { id: 'sharepoint', nome: 'SharePoint e OneDrive', gruppo: 'File', pronto: false, legge: true, nota: 'Arriva presto, insieme a Outlook.' },
  { id: 'dropbox', nome: 'Dropbox', gruppo: 'File', pronto: true, legge: true, nota: 'La chiave dell’app, e un codice da incollare una volta sola.' },
  { id: 'notion', nome: 'Notion', gruppo: 'Note', pronto: true, legge: true, nota: 'Token di integrazione interna, pagine condivise con l’integrazione.' },
  { id: 'claude', nome: 'Claude', gruppo: 'Ragionamento', pronto: true, nota: 'La chiave API che fa ragionare Myynd sul tuo materiale.' },
  // Un'altra testa al posto di Claude, non un'altra fonte: OpenAI e chi parla
  // come lei, compresi i modelli che girano su questa macchina. Sta nel
  // catalogo perché si collega da qui come tutto il resto, con una scheda.
  { id: 'compatibile', nome: 'Fornitore compatibile con OpenAI', gruppo: 'Ragionamento', pronto: true, nota: 'OpenAI, OpenRouter, Groq, Mistral — o Ollama e LM Studio in casa. Un indirizzo e un modello.' },
  // La lista è una fonte come le altre: quello che decidi di fare dice di te
  // quanto un documento — e sta qui perché chi guarda le fonti si aspetta di
  // vedere tutto quello che Myynd ha in mano, non solo quello che ha letto.
  { id: 'mind2do', nome: 'Da fare', gruppo: 'Note', pronto: true, nota: 'La tua lista. Collegata da sola, sempre.' },

  { id: 'teams', nome: 'Microsoft Teams', gruppo: 'Comunicazione', pronto: false, nota: 'Richiede una app registrata su Entra ID.' },
  { id: 'fatture', nome: 'Fatture in Cloud', gruppo: 'Gestionale', pronto: false, nota: 'Richiede OAuth Fatture in Cloud.' }
]

export const PRONTI = CATALOGO.filter(c => c.pronto).map(c => c.id)

/**
 * Le fonti che portano documenti nell'indice.
 *
 * Non è lo stesso elenco dei connettori pronti, e la differenza conta: `claude`
 * e `compatibile` non portano niente — sono il ragionamento, non una fonte — e
 * `mind2do` è la lista, che vive in un'altra tabella. Chi ha bisogno di sapere
 * «da dove può arrivare un documento» — la riconciliazione, il recinto delle
 * automazioni, i conteggi — deve chiederlo qui e non dedurlo, perché dedurlo è
 * come si finisce con una fonte nuova che nessuno ha aggiunto al recinto.
 *
 * Segue `legge` e non `pronto`: una fonte che smettiamo di offrire continua a
 * portare documenti per chi l'aveva già collegata, e resta dichiarabile da
 * un'automazione. Togliere una scheda dalla vetrina non toglie i suoi documenti
 * dall'indice.
 */
export const FONTI = CATALOGO.filter(c => c.legge).map(c => c.id)
