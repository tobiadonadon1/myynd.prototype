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
  pronto: boolean
  nota: string
}

export const CATALOGO: VoceConnettore[] = [
  { id: 'posta', nome: 'Posta', gruppo: 'Comunicazione', pronto: true, nota: 'IMAP: host, indirizzo e password della casella.' },
  { id: 'google', nome: 'Gmail e Calendario', gruppo: 'Comunicazione', pronto: true, nota: 'Google Workspace: posta e agenda, dalla loro API.' },
  { id: 'microsoft', nome: 'Outlook e Calendario', gruppo: 'Comunicazione', pronto: true, nota: 'Microsoft 365: posta e agenda. Serve un’app registrata su Entra ID.' },
  { id: 'slack', nome: 'Slack', gruppo: 'Comunicazione', pronto: true, nota: 'Un token da utente: legge i canali di cui fai già parte.' },
  { id: 'whatsapp', nome: 'WhatsApp Business', gruppo: 'Comunicazione', pronto: true, nota: 'Cloud API. Riceve i messaggi mentre arrivano: serve un indirizzo pubblico.' },
  { id: 'desktop', nome: 'Desktop', gruppo: 'File', pronto: true, nota: 'Le cartelle che scegli tu, lette in sola lettura.' },
  { id: 'drive', nome: 'Google Drive', gruppo: 'File', pronto: true, nota: 'I tuoi documenti su Drive, in sola lettura.' },
  { id: 'sharepoint', nome: 'SharePoint e OneDrive', gruppo: 'File', pronto: true, nota: 'I file dei siti che segui, e il tuo OneDrive. Stessa app di Outlook.' },
  { id: 'dropbox', nome: 'Dropbox', gruppo: 'File', pronto: true, nota: 'La chiave dell’app, e un codice da incollare una volta sola.' },
  { id: 'notion', nome: 'Notion', gruppo: 'Note', pronto: true, nota: 'Token di integrazione interna, pagine condivise con l’integrazione.' },
  { id: 'claude', nome: 'Claude', gruppo: 'Ragionamento', pronto: true, nota: 'La chiave API che fa ragionare Myynd sul tuo materiale.' },
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
 * non porta niente — è il ragionamento, non una fonte — e `mind2do` è la lista,
 * che vive in un'altra tabella. Chi ha bisogno di sapere «da dove può arrivare
 * un documento» — la riconciliazione, il recinto delle automazioni, i conteggi
 * — deve chiederlo qui e non dedurlo, perché dedurlo è come si finisce con una
 * fonte nuova che nessuno ha aggiunto al recinto.
 */
export const FONTI = CATALOGO
  .filter(c => c.pronto && c.id !== 'claude' && c.id !== 'mind2do')
  .map(c => c.id)
