// Il catalogo dei connettori. Quelli con `pronto: true` funzionano davvero;
// gli altri restano visibili perché fanno parte del disegno, ma dicono
// chiaramente che non sono ancora collegabili.

export type VoceConnettore = {
  id: string
  nome: string
  gruppo: 'Comunicazione' | 'File' | 'Note' | 'Ragionamento' | 'Gestionale'
  pronto: boolean
  nota: string
}

export const CATALOGO: VoceConnettore[] = [
  { id: 'posta', nome: 'Posta', gruppo: 'Comunicazione', pronto: true, nota: 'IMAP: host, indirizzo e password della casella.' },
  { id: 'desktop', nome: 'Desktop', gruppo: 'File', pronto: true, nota: 'Le cartelle che scegli tu, lette in sola lettura.' },
  { id: 'notion', nome: 'Notion', gruppo: 'Note', pronto: true, nota: 'Token di integrazione interna, pagine condivise con l’integrazione.' },
  { id: 'claude', nome: 'Claude', gruppo: 'Ragionamento', pronto: true, nota: 'La chiave API che fa ragionare Myynd sul tuo materiale.' },

  { id: 'whatsapp', nome: 'WhatsApp Business', gruppo: 'Comunicazione', pronto: false, nota: 'Richiede un account WhatsApp Business API.' },
  { id: 'teams', nome: 'Microsoft Teams', gruppo: 'Comunicazione', pronto: false, nota: 'Richiede una app registrata su Entra ID.' },
  { id: 'slack', nome: 'Slack', gruppo: 'Comunicazione', pronto: false, nota: 'Richiede una app Slack con OAuth.' },
  { id: 'calendario', nome: 'Calendario', gruppo: 'Comunicazione', pronto: false, nota: 'CalDAV o Google Calendar.' },
  { id: 'drive', nome: 'Google Drive', gruppo: 'File', pronto: false, nota: 'Richiede OAuth Google.' },
  { id: 'sharepoint', nome: 'SharePoint', gruppo: 'File', pronto: false, nota: 'Richiede una app registrata su Entra ID.' },
  { id: 'dropbox', nome: 'Dropbox', gruppo: 'File', pronto: false, nota: 'Richiede OAuth Dropbox.' },
  { id: 'fatture', nome: 'Fatture in Cloud', gruppo: 'Gestionale', pronto: false, nota: 'Richiede OAuth Fatture in Cloud.' }
]

export const PRONTI = CATALOGO.filter(c => c.pronto).map(c => c.id)
