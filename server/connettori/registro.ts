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
   * Separato da `pronto` di proposito. Teams non ha codice, e non deve
   * entrare nel recinto delle automazioni; Gmail e Outlook ce l'hanno,
   * e devono restarci anche mentre non si offrono — perché chi li ha collegati
   * prima continua a portare documenti, e un'automazione deve poterli
   * dichiarare. Il recinto segue il codice, non la vetrina.
   */
  legge?: boolean
  nota: string
}

/**
 * Come si chiama la fonte «questo computer»: «Il mio Mac» o «Il mio PC».
 *
 * Il nome vecchio — «Desktop» — era il nome della cartella, e chi lo leggeva
 * capiva quello: che Myynd guardava la Scrivania e basta. Ma la fonte è la
 * macchina intera, e il nome deve dire quella. Resta una funzione pura, con la
 * piattaforma passata da fuori, perché è l'unico modo di provarla per un
 * Windows da un Mac: il catalogo la chiama una volta con `process.platform`.
 *
 * L'id resta `desktop` per sempre: è la chiave con cui la configurazione, gli
 * id dei documenti (`desktop:/Users/…`) e gli attrezzi si riconoscono. Un nome
 * si cambia, un id no.
 */
export function nomeComputer(piattaforma: string): string {
  return piattaforma === 'darwin' ? 'Il mio Mac' : 'Il mio PC'
}

export const CATALOGO: VoceConnettore[] = [
  { id: 'posta', nome: 'Posta', gruppo: 'Comunicazione', pronto: true, legge: true, nota: 'La tua casella, letta ogni giorno.' },
  /*
   * L'agenda prima di Gmail, e non è un ordine casuale.
   *
   * È l'unica fonte che si collega incollando una cosa sola, senza registrare
   * niente da nessuna parte: sta accanto a «Posta» perché insieme fanno il
   * novanta per cento di quello che una persona voleva da Google.
   */
  { id: 'calendario', nome: 'Calendario', gruppo: 'Comunicazione', pronto: true, legge: true, nota: 'La tua agenda, sempre aggiornata.' },
  { id: 'google', nome: 'Gmail e Calendario', gruppo: 'Comunicazione', pronto: false, legge: true, nota: 'Arriva presto. Intanto la posta si collega da «Posta» e l’agenda da «Calendario».' },
  { id: 'microsoft', nome: 'Outlook e Calendario', gruppo: 'Comunicazione', pronto: false, legge: true, nota: 'Arriva presto: posta e agenda di Microsoft 365.' },
  { id: 'slack', nome: 'Slack', gruppo: 'Comunicazione', pronto: true, legge: true, nota: 'I canali di cui fai già parte.' },
  // «Business» nel nome e basta: la condizione vera — un numero registrato
  // sulla piattaforma di Meta per le aziende, non quello personale — la dice
  // la scheda prima dei campi (forms.tsx), con il perché. La nota dice cos'è.
  { id: 'whatsapp', nome: 'WhatsApp Business', gruppo: 'Comunicazione', pronto: true, legge: true, nota: 'I messaggi di un numero WhatsApp Business.' },
  { id: 'desktop', nome: nomeComputer(process.platform), gruppo: 'File', pronto: true, legge: true, nota: 'Tutto quello che tieni sul computer, in sola lettura: cartelle, file, download.' },
  { id: 'drive', nome: 'Google Drive', gruppo: 'File', pronto: false, legge: true, nota: 'Arriva presto, insieme a Gmail.' },
  { id: 'sharepoint', nome: 'SharePoint e OneDrive', gruppo: 'File', pronto: false, legge: true, nota: 'Arriva presto, insieme a Outlook.' },
  { id: 'dropbox', nome: 'Dropbox', gruppo: 'File', pronto: true, legge: true, nota: 'I tuoi file su Dropbox.' },
  { id: 'notion', nome: 'Notion', gruppo: 'Note', pronto: true, legge: true, nota: 'Le pagine che condividi con Myynd.' },
  /*
   * Granola, e la nota dice l'unica cosa che costa: niente.
   *
   * È l'altro collegamento senza attrito, insieme al Calendario — non c'è un
   * token da andare a prendere, non c'è un'app da registrare — e la nota lo
   * dice in chiaro perché è esattamente il contrario di quello che una persona
   * si aspetta leggendo il nome di un'altra app. L'unica condizione vera è che
   * Granola stia su questo computer, e quella la dice `SOLO_IN_CASA`.
   */
  { id: 'granola', nome: 'Granola', gruppo: 'Note', pronto: true, legge: true, nota: 'Le note delle tue riunioni, già su questo Mac.' },
  // Le Note di Apple stanno in una cartella che macOS protegge: senza «Accesso
  // completo al disco» si aprono con «operazione non permessa». Lo dice la
  // scheda, prima del bottone (AccessoDisco in forms.tsx), e lo dice la nota:
  // è la condizione che decide se vale la pena aprire la scheda.
  { id: 'note', nome: 'Note', gruppo: 'Note', pronto: true, legge: true, nota: 'Le Note di Apple su questo Mac: serve l’accesso completo al disco.' },
  /*
   * Le conversazioni, e la nota dice il passaggio che costa: l'esportazione.
   *
   * ChatGPT e Claude non lasciano rileggere le chat da un'API; mandano un
   * archivio via email, e va chiesto a mano. La nota lo dice prima che
   * qualcuno apra la scheda aspettandosi un bottone come quello di Granola.
   * Le sessioni di Claude Code invece sono già su questo disco, e quelle sì
   * si leggono premendo un interruttore.
   */
  { id: 'conversazioni', nome: 'Conversazioni', gruppo: 'Note', pronto: true, legge: true, nota: 'Le chat esportate da ChatGPT e Claude.' },
  { id: 'claude', nome: 'Claude', gruppo: 'Ragionamento', pronto: true, nota: 'La chiave con cui Myynd ragiona.' },
  // Un'altra testa al posto di Claude, non un'altra fonte: OpenAI e chi parla
  // come lei, compresi i modelli che girano su questa macchina. Sta nel
  // catalogo perché si collega da qui come tutto il resto, con una scheda.
  { id: 'compatibile', nome: 'Fornitore compatibile con OpenAI', gruppo: 'Ragionamento', pronto: true, nota: 'Un altro fornitore AI, o un modello sul tuo computer.' },
  // La lista è una fonte come le altre: quello che decidi di fare dice di te
  // quanto un documento — e sta qui perché chi guarda le fonti si aspetta di
  // vedere tutto quello che Myynd ha in mano, non solo quello che ha letto.
  { id: 'mind2do', nome: 'Da fare', gruppo: 'Note', pronto: true, nota: 'La tua lista, sempre collegata.' },

  { id: 'teams', nome: 'Microsoft Teams', gruppo: 'Comunicazione', pronto: false, nota: 'Microsoft Teams: arriva presto.' }
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
