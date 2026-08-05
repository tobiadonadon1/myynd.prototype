// Corpus del prototipo. Tutti i dati sono inventati: Donadon Srl, i clienti,
// i fornitori e i documenti servono solo a far vedere come si comporta Myynd.

export type Campo = { k: string; v: string }

export type FeedItem = {
  id: string
  tipo: string
  fonte: string
  ora: string
  colore: string
  urgenza: string
  app: string
  editabile?: boolean
  orig: { titolo: string; campi: Campo[]; corpo: string }
  testo: string
  quoteFonte: string
  quoteTitolo: string
  quote: string
  quoteFull: string
  expand: string
  p: string
  esito: string
  toast: string
  undo?: boolean
  q: string
  a: string
  src: Fonte[]
}

export type Fonte = { id: string; label: string }

export const FEED: FeedItem[] = [
  {
    id: 'draft', tipo: 'Bozza pronta', fonte: 'Gmail', ora: '08:12', colore: '#C4623B', urgenza: 'entro venerdì',
    app: 'Gmail', editabile: true,
    orig: {
      titolo: 'Studio Ferri — Richiesta preventivo aggiornato',
      campi: [
        { k: 'Da', v: 'Marta Ferri · marta@studioferri.it' },
        { k: 'A', v: 'Tobia Donadon' },
        { k: 'Ricevuta', v: 'venerdì 31 luglio · 16:48' }
      ],
      corpo: 'Ciao Tobia,\n\npuoi mandarmi il preventivo aggiornato con i prezzi di luglio? Mi serve entro venerdì prossimo per la riunione con i soci.\n\nGrazie,\nMarta'
    },
    testo: "Marta di Studio Ferri voleva il preventivo aggiornato entro venerdì. L'ho scritto con il listino di luglio, nel tuo tono.",
    quoteFonte: 'La mia bozza', quoteTitolo: 'Preventivo aggiornato — Studio Ferri',
    quote: 'Ciao Marta,\n\ncome promesso ti mando il preventivo aggiornato con il listino di luglio. Ho tenuto lo sconto del 7% che applichiamo dal 2024 e la consegna a quattro settimane dalla conferma.',
    quoteFull: 'Ciao Marta,\n\ncome promesso ti mando il preventivo aggiornato con il listino di luglio. Ho tenuto lo sconto del 7% che applichiamo dal 2024 e la consegna a quattro settimane dalla conferma.\n\nLe tre voci che avevamo discusso a giugno sono in allegato, con il dettaglio delle quantità: 240 pannelli 60×120, 120 pannelli 40×80 e i profili di giunzione.\n\nSe ti serve una revisione prima di venerdì dimmelo pure.\n\nUn saluto,\nTobia Donadon\nDonadon Srl · 0422 445 118',
    expand: 'Rileggi tutta', p: 'Invia', esito: 'Inviata a Marta — Studio Ferri', toast: 'Inviata a Marta — Studio Ferri.', undo: true,
    q: 'Perché hai scritto così a Marta?',
    a: "Ho ripreso il tuo ultimo preventivo di giugno e aggiornato i prezzi con il listino di luglio. Lo sconto del 7% è quello che le applichi dal 2024, quindi l'ho tenuto.",
    src: [{ id: 'd1', label: 'Listino luglio 2026' }, { id: 'd2', label: 'Gmail · Marta Ferri' }]
  },
  {
    id: 'task', tipo: 'Approvazione', fonte: 'Teams · Luca', ora: '09:02', colore: '#7E9C82', urgenza: 'scade domani',
    app: 'Teams',
    orig: {
      titolo: 'Luca Bettin · Acquisti',
      campi: [
        { k: 'Canale', v: 'Ordini 2026' },
        { k: 'Scritto', v: 'oggi · 09:02' },
        { k: 'Allegato', v: 'Ordine 2411.pdf' }
      ],
      corpo: 'Tobia, ho preparato il 2411 per Lodi: 400 pezzi serie 400, € 8.240 netti.\n\nConfermo io o vuoi guardarlo prima? Serve risposta entro domani a mezzogiorno.\n\n— Ordine 2411.pdf: prezzo unitario € 20,60, condizioni di giugno, trasporto € 320, consegna 14 settembre.'
    },
    testo: "Luca ti ha chiesto di approvare l'ordine № 2411 di Ceramiche Lodi. Ho controllato: tutto come a giugno, tranne il trasporto.",
    quoteFonte: 'Messaggio di Luca · Teams', quoteTitolo: 'Ordine № 2411 — Ceramiche Lodi',
    quote: '«Tobia, ho preparato il 2411 per Lodi: 400 pezzi serie 400, € 8.240 netti. Confermo io o vuoi guardarlo prima? Serve risposta entro domani a mezzogiorno.»',
    quoteFull: '«Tobia, ho preparato il 2411 per Lodi: 400 pezzi serie 400, € 8.240 netti. Confermo io o vuoi guardarlo prima? Serve risposta entro domani a mezzogiorno.»\n\nAllegato: Ordine 2411.pdf — 400 pezzi serie 400, prezzo unitario € 20,60, condizioni di giugno, trasporto € 320 (era € 200 sull\'ordine 2398), consegna 14 settembre.',
    expand: "Apri l'originale", p: 'Approva', esito: 'Ordine № 2411 approvato', toast: 'Ordine № 2411 approvato.', undo: true,
    q: "Cosa cambia rispetto all'ordine precedente?",
    a: 'Solo il trasporto: € 320 contro € 200 del 2398, perché Rossi ha alzato del 12% da giugno. Prezzo unitario e condizioni sono identici.',
    src: [{ id: 't1', label: 'Ordine 2411.pdf' }, { id: 't2', label: 'Ordine 2398.pdf' }]
  },
  {
    id: 'brief', tipo: 'Brief riunione', fonte: 'Calendario', ora: '16:00', colore: '#D8A46E', urgenza: 'tra 40 minuti',
    app: 'Calendario',
    orig: {
      titolo: 'Ceramiche Lodi — allineamento saldo e consegne',
      campi: [
        { k: 'Quando', v: 'oggi · 16:00 – 16:45' },
        { k: 'Con', v: 'Elena Lodi, Tobia Donadon' },
        { k: 'Dove', v: 'Teams' }
      ],
      corpo: 'Ordine del giorno mandato da Elena:\n\n1. Saldo fattura № 112 (€ 3.100)\n2. Anticipo consegna settembre\n3. Listino 2027, prime indicazioni'
    },
    testo: 'Call con Ceramiche Lodi tra 40 minuti. Ho raccolto gli ultimi scambi e i due punti che restano aperti.',
    quoteFonte: 'Il mio brief', quoteTitolo: 'Ceramiche Lodi — 16:00, con Elena Lodi',
    quote: 'Due punti aperti: il saldo della № 112 (€ 3.100, scaduto da 21 giorni) e la richiesta di anticipare la consegna di settembre.',
    quoteFull: "Due punti aperti: il saldo della № 112 (€ 3.100, scaduto da 21 giorni) e la richiesta di anticipare la consegna di settembre.\n\nContesto: nell'ultima call del 12 luglio avevi promesso una risposta sull'anticipo entro questa settimana. Pagano in media a 47 giorni, sempre senza sollecito. Fatturato 2026 con loro: € 61.400, il secondo cliente per volume.",
    expand: 'Apri il brief', p: 'Segna letto', esito: 'Brief letto prima della call', toast: 'Brief segnato come letto.',
    q: 'Cosa avevo promesso a Elena?',
    a: "Una risposta sull'anticipo della consegna di settembre entro questa settimana. Lo hai detto in call il 12 luglio, minuto 14.",
    src: [{ id: 'b1', label: 'Note call 12 lug' }, { id: 'b2', label: 'Calendario' }]
  },
  {
    id: 'arch', tipo: 'Già gestito', fonte: 'SharePoint', ora: '07:40', colore: '#5C7660', urgenza: 'nessuna azione',
    app: 'SharePoint',
    orig: {
      titolo: 'Fattura 118 Rossi Trasporti.pdf',
      campi: [
        { k: 'Cartella', v: 'Fornitori / 2026 / agosto' },
        { k: 'Caricata', v: 'oggi · 07:40' },
        { k: 'Importo', v: '€ 640,00 (IVA 22%)' }
      ],
      corpo: 'Fornitore: Rossi Trasporti Srl\nRiferimento ordine: 2398\nImponibile: € 524,59\nIVA 22%: € 115,41\nTotale: € 640,00\nScadenza pagamento: 31 agosto 2026'
    },
    testo: "Fattura № 118 di Rossi Trasporti verificata contro l'ordine e archiviata in Fornitori / 2026.",
    quoteFonte: 'Cosa ho fatto', quoteTitolo: 'Fattura № 118 — Rossi Trasporti · € 640',
    quote: "Importo, IVA e riferimento ordine coincidono con l'ordine 2398. Archiviata in Fornitori / 2026, segnata da pagare il 31 agosto.",
    quoteFull: "Importo, IVA e riferimento ordine coincidono con l'ordine 2398. Archiviata in Fornitori / 2026, segnata da pagare il 31 agosto.\n\nControlli fatti: totale € 640 = € 524,59 + IVA 22%; riferimento ordine 2398 presente; fornitore già in anagrafica; nessun duplicato nello stesso mese.",
    expand: 'Vedi i controlli', p: 'Va bene', esito: 'Fattura № 118 archiviata', toast: 'Ok, non te la ripropongo.',
    q: 'Come verifichi le fatture?',
    a: "Confronto importo, IVA e riferimento ordine con l'ordine collegato. Se torna tutto archivio, se no te la porto nel feed con la differenza evidenziata.",
    src: [{ id: 'f1', label: 'Fatture in Cloud' }, { id: 'f2', label: 'Ordine 2398.pdf' }]
  }
]

export const ALLEGATI: Record<string, { nome: string; meta: string }> = {
  draft: { nome: 'Preventivo 2026-084 — Studio Ferri.pdf', meta: '2 pagine · scritto da Myynd' },
  task: { nome: 'Ordine 2411.pdf', meta: '1 pagina · allegato da Luca' },
  brief: { nome: 'Brief Ceramiche Lodi.pdf', meta: '1 pagina · scritto da Myynd' },
  arch: { nome: 'Fattura 118 Rossi Trasporti.pdf', meta: '1 pagina · da Rossi Trasporti' }
}

export type Doc = {
  tipo: string
  numero: string
  data: string
  meta: Campo[]
  righe: { d: string; q: string; p: string; t: string }[]
  totali: Campo[]
  note: string
}

export const DOCS: Record<string, Doc> = {
  draft: {
    tipo: 'Preventivo', numero: '2026-084', data: '3 agosto 2026',
    meta: [
      { k: 'Cliente', v: 'Studio Ferri Srl\nVia Cornaro 8 · Padova\nP. IVA 02887410288' },
      { k: 'Riferimento', v: 'Richiesta del 31 luglio\nListino luglio 2026' }
    ],
    righe: [
      { d: 'Serie 400 — pannello 60×120, finitura opaca', q: '240 pz', p: '€ 20,60', t: '€ 4.944,00' },
      { d: 'Serie 400 — pannello 40×80, finitura opaca', q: '120 pz', p: '€ 14,90', t: '€ 1.788,00' },
      { d: 'Profili di giunzione in alluminio', q: '180 m', p: '€ 8,20', t: '€ 1.476,00' },
      { d: 'Posa e collaudo in cantiere', q: '2 gg', p: '€ 380,00', t: '€ 760,00' }
    ],
    totali: [
      { k: 'Imponibile', v: '€ 8.968,00' },
      { k: 'Sconto cliente 7%', v: '– € 627,76' },
      { k: 'Trasporto', v: '€ 320,00' },
      { k: 'Totale netto', v: '€ 8.660,24' }
    ],
    note: "Consegna: quattro settimane dalla conferma scritta.\nPagamento: 30 giorni data fattura, come da accordo 2024.\nValidità dell'offerta: 30 giorni."
  },
  task: {
    tipo: 'Ordine', numero: '2411', data: '3 agosto 2026',
    meta: [
      { k: 'Fornitore', v: 'Ceramiche Lodi Srl\nVia Emilia 220 · Sassuolo' },
      { k: 'Consegna', v: '14 settembre 2026\nMagazzino Treviso' }
    ],
    righe: [
      { d: 'Serie 400 — pannello 60×120', q: '400 pz', p: '€ 20,60', t: '€ 8.240,00' },
      { d: 'Trasporto (Rossi Trasporti)', q: '1', p: '€ 320,00', t: '€ 320,00' }
    ],
    totali: [
      { k: 'Totale ordine', v: '€ 8.560,00' },
      { k: 'Differenza vs 2398', v: '+ € 120,00' }
    ],
    note: "Condizioni di giugno confermate dal fornitore.\nUnica differenza rispetto all'ordine 2398: trasporto, per l'aumento del 12% di Rossi da giugno.\nPreparato da Luca Bettin, in attesa della tua approvazione."
  },
  brief: {
    tipo: 'Brief', numero: 'Ceramiche Lodi', data: 'oggi · 16:00',
    meta: [
      { k: 'Con', v: 'Elena Lodi\nDirezione commerciale' },
      { k: 'Storico', v: 'Cliente dal 2021\n€ 61.400 fatturati nel 2026' }
    ],
    righe: [], totali: [],
    note: "1. Saldo fattura № 112 — € 3.100, scaduta da 21 giorni. Pagano in media a 47 giorni, mai dopo sollecito.\n\n2. Anticipo consegna settembre — nell'ultima call del 12 luglio avevi promesso una risposta entro questa settimana. Il magazzino può anticipare di otto giorni, non di più.\n\n3. Listino 2027 — Elena l'ha accennato via mail il 28 luglio. Nessun impegno preso."
  },
  arch: {
    tipo: 'Fattura', numero: '№ 118', data: '31 luglio 2026',
    meta: [
      { k: 'Fornitore', v: 'Rossi Trasporti Srl\nVia Postumia 44 · Treviso' },
      { k: 'Riferimento', v: 'Ordine 2398\nScadenza 31 agosto 2026' }
    ],
    righe: [{ d: 'Trasporti luglio — 14 consegne', q: '1', p: '€ 524,59', t: '€ 524,59' }],
    totali: [
      { k: 'Imponibile', v: '€ 524,59' },
      { k: 'IVA 22%', v: '€ 115,41' },
      { k: 'Totale', v: '€ 640,00' }
    ],
    note: 'Controlli fatti da Myynd: totale coerente con imponibile e IVA, riferimento ordine presente, fornitore in anagrafica, nessun duplicato nel mese.\nArchiviata in Fornitori / 2026 / agosto.'
  }
}

export const COMPOSER: Record<string, { label: string; stato: string; campi: Campo[] }> = {
  draft: {
    label: 'Modifica', stato: 'bozza · non ancora inviata',
    campi: [
      { k: 'A', v: 'Marta Ferri · marta@studioferri.it' },
      { k: 'Oggetto', v: 'Preventivo aggiornato — Studio Ferri' }
    ]
  },
  task: { label: 'Rispondi a Luca', stato: 'risposta · non inviata', campi: [{ k: 'A', v: 'Luca Bettin · canale Ordini 2026' }] },
  brief: { label: 'Modifica il brief', stato: 'nota tua sul brief', campi: [{ k: 'Riunione', v: 'Ceramiche Lodi · oggi 16:00' }] },
  arch: { label: 'Aggiungi una nota', stato: "nota sull'archiviazione", campi: [{ k: 'File', v: 'Fattura 118 Rossi Trasporti.pdf' }] }
}

export type Automazione = {
  id: string
  nome: string
  desc: string
  esecuzioni: number
  ore: number
  ultima: string
  steps: { n: number; titolo: string; dettaglio: string }[]
}

export const AUTOS: Automazione[] = [
  {
    id: 'a1', nome: 'Fatture fornitori',
    desc: "Legge le fatture in arrivo, controlla importo e IVA contro l'ordine, archivia in SharePoint.",
    esecuzioni: 214, ore: 27, ultima: '3 ago · 11:40',
    steps: [
      { n: 1, titolo: 'Arriva una PEC o una mail con allegato', dettaglio: 'Gmail e PEC, cartella Fornitori' },
      { n: 2, titolo: 'Estrae numero, importo, IVA, scadenza', dettaglio: "Confronto con l'ordine collegato" },
      { n: 3, titolo: 'Se coincide, archivia e segna da pagare', dettaglio: 'SharePoint / Fornitori / anno' },
      { n: 4, titolo: 'Se non coincide, te la mette nel feed', dettaglio: 'Con la differenza già evidenziata' }
    ]
  },
  {
    id: 'a2', nome: 'Risposte ai preventivi',
    desc: 'Prepara la bozza con il listino corrente e lo storico sconti del cliente.',
    esecuzioni: 86, ore: 14, ultima: '3 ago · 08:12',
    steps: [
      { n: 1, titolo: 'Riconosce una richiesta di preventivo', dettaglio: 'Gmail, WhatsApp Business' },
      { n: 2, titolo: 'Recupera listino e storico sconti', dettaglio: 'Fatture in Cloud + Drive' },
      { n: 3, titolo: 'Scrive la bozza nel tuo tono', dettaglio: 'Resta in attesa del tuo Invia' }
    ]
  },
  {
    id: 'a3', nome: 'Brief prima delle call',
    desc: 'Quaranta minuti prima di ogni riunione raccoglie gli scambi recenti e i punti aperti.',
    esecuzioni: 132, ore: 9, ultima: '2 ago · 15:30',
    steps: [
      { n: 1, titolo: 'Guarda il calendario', dettaglio: 'Ogni riunione con persone esterne' },
      { n: 2, titolo: 'Raccoglie mail, note e documenti recenti', dettaglio: 'Ultimi 60 giorni' },
      { n: 3, titolo: 'Ti manda il brief nel feed', dettaglio: 'Con i due o tre punti aperti' }
    ]
  },
  {
    id: 'a4', nome: 'Solleciti pagamenti',
    desc: 'Dopo 15 giorni dalla scadenza scrive il sollecito, gentile la prima volta.',
    esecuzioni: 41, ore: 6, ultima: '31 lug · 09:15',
    steps: [
      { n: 1, titolo: 'Controlla le fatture scadute', dettaglio: 'Fatture in Cloud, ogni mattina' },
      { n: 2, titolo: 'Prepara il sollecito', dettaglio: 'Tono progressivo: 15, 30, 45 giorni' },
      { n: 3, titolo: 'Aspetta la tua conferma', dettaglio: 'Non invia mai da solo' }
    ]
  }
]

export const AUTO_ON: Record<string, boolean> = { a1: true, a2: true, a3: true, a4: false }

export type Cluster = {
  id: string
  nome: string
  colore: string
  tipo: string
  peso: number
  testo: string
  fatti: Campo[]
  chiesto: { q: string; a: string }[]
}

export const CLUSTERS: Cluster[] = [
  {
    id: 'clienti', nome: 'Clienti', colore: '#5B9BC9', tipo: 'Persone e aziende', peso: 1.35,
    testo: 'Ogni cliente tiene insieme mail, preventivi, fatture e note delle call. Myynd li collega da sola quando riconosce il nome.',
    fatti: [
      { k: 'Nodi', v: '48 clienti · 612 documenti' },
      { k: 'Aggiornato', v: '3 ago · 08:12' },
      { k: 'Aperti', v: '3 preventivi in attesa' }
    ],
    chiesto: [
      { q: 'Chi paga più tardi di tutti?', a: 'Ceramiche Lodi: 47 giorni di media sulle ultime tre fatture. Poi Bertoli a 41.' },
      { q: 'Quali clienti non sentiamo da tre mesi?', a: 'Undici. Sei di questi avevano comprato più di 10.000 euro nel 2025.' }
    ]
  },
  {
    id: 'fornitori', nome: 'Fornitori', colore: '#C4553C', tipo: 'Persone e aziende', peso: 0.8,
    testo: "Fatture, ordini e condizioni concordate. Se un importo non torna con l'ordine finisce nel feed invece che nell'archivio.",
    fatti: [
      { k: 'Nodi', v: '23 fornitori · 388 fatture' },
      { k: 'Aggiornato', v: '3 ago · 11:40' },
      { k: 'Aperti', v: '1 differenza da verificare' }
    ],
    chiesto: [
      { q: "Chi ha alzato i prezzi quest'anno?", a: 'Rossi Trasporti +12% da giugno, Imballaggi Piave +4% da marzo.' },
      { q: 'Quanto spendiamo di trasporti al mese?', a: '€ 9.400 di media nel 2026, contro € 7.900 nel 2025.' }
    ]
  },
  {
    id: 'progetti', nome: 'Commesse', colore: '#7FA98A', tipo: 'Lavoro in corso', peso: 0.6,
    testo: 'Le commesse aperte con le persone coinvolte, le scadenze e i documenti che le riguardano.',
    fatti: [
      { k: 'Nodi', v: '12 commesse · 96 documenti' },
      { k: 'Aggiornato', v: '2 ago · 17:05' },
      { k: 'Aperti', v: '2 scadenze questa settimana' }
    ],
    chiesto: [
      { q: 'Quali commesse sono in ritardo?', a: 'Due: Lodi 2026 (otto giorni) e Ristrutturazione sede (tre settimane, ferma sui permessi).' }
    ]
  },
  {
    id: 'documenti', nome: 'Documenti', colore: '#E0A44A', tipo: 'Archivio', peso: 1.15,
    testo: 'Tutto quello che è stato scritto in azienda, indicizzato. Quando Myynd cita una fonte in chat, viene da qui.',
    fatti: [
      { k: 'Nodi', v: '1.204 file indicizzati' },
      { k: 'Aggiornato', v: 'in tempo reale' },
      { k: 'Ultimo', v: 'Listino luglio 2026' }
    ],
    chiesto: [
      { q: 'Qual è la versione buona del listino?', a: "Listino luglio 2026, caricato l'1 luglio. Le due copie in Drive sono più vecchie." }
    ]
  },
  {
    id: 'team', nome: 'Il tuo team', colore: '#C3CBD2', tipo: 'Interno', peso: 0.55,
    testo: 'Chi fa cosa, chi ha risposto per ultimo a un cliente, chi aspetta una tua approvazione.',
    fatti: [
      { k: 'Nodi', v: '9 persone · 4 reparti' },
      { k: 'Aggiornato', v: '3 ago · 09:02' },
      { k: 'Aperti', v: '1 approvazione a te' }
    ],
    chiesto: [
      { q: 'Chi ha fatto più straordinari a luglio?', a: 'Marco, 62 ore. Il magazzino in totale 186, il 40% in più di giugno.' }
    ]
  }
]

export const NAMES: Record<string, string[]> = {
  clienti: ['Studio Ferri', 'Ceramiche Lodi', 'Bertoli', 'Molin & Co', 'Arredi Vicentini', 'Zanon Group'],
  fornitori: ['Rossi Trasporti', 'Vetreria Sile', 'Metalli Nord', 'Imballaggi Piave'],
  progetti: ['Lodi 2026', 'Ristrutturazione sede', 'Linea Sile', 'Export DACH'],
  documenti: ['Listino luglio 2026', 'Contratto Lodi', 'Capitolato Ferri', 'Condizioni 2026'],
  team: ['Luca', 'Silvia', 'Marco', 'Anna', 'Giulia']
}

export type Connettore = { id: string; nome: string; stato: string; on: boolean }

export const CONNETTORI: Connettore[] = [
  { id: 'gmail', nome: 'Gmail', stato: '2 minuti fa', on: true },
  { id: 'teams', nome: 'Microsoft Teams', stato: '8 minuti fa', on: true },
  { id: 'sp', nome: 'SharePoint', stato: '20 minuti fa', on: true },
  { id: 'cal', nome: 'Calendario', stato: 'ora', on: true },
  { id: 'fic', nome: 'Fatture in Cloud', stato: '1 ora fa', on: true },
  { id: 'drive', nome: 'Google Drive', stato: '35 minuti fa', on: true },
  { id: 'wa', nome: 'WhatsApp Business', stato: '', on: false },
  { id: 'slack', nome: 'Slack', stato: '', on: false },
  { id: 'dbx', nome: 'Dropbox', stato: '', on: false }
]

export type Risultato = {
  id: string
  titolo: string
  fonte: string
  quando: string
  colore: string
  screen: Screen
  cluster?: string
}

export const RISULTATI: Risultato[] = [
  { id: 'r1', titolo: 'Preventivo aggiornato — Studio Ferri', fonte: 'Gmail · bozza pronta', quando: '08:12', colore: '#C4623B', screen: 'myynd' },
  { id: 'r2', titolo: 'Clienti', fonte: 'Mappa · 48 nodi, 612 documenti', quando: 'cluster', colore: '#5B9BC9', screen: 'mappa', cluster: 'clienti' },
  { id: 'r3', titolo: 'Fornitori', fonte: 'Mappa · 23 nodi, 388 fatture', quando: 'cluster', colore: '#C4553C', screen: 'mappa', cluster: 'fornitori' },
  { id: 'r4', titolo: 'Listino luglio 2026.pdf', fonte: 'SharePoint / Commerciale', quando: '1 lug', colore: '#E0A44A', screen: 'mappa', cluster: 'documenti' },
  { id: 'r5', titolo: 'Ordine № 2411 — approvazione', fonte: 'Teams · Luca', quando: '09:02', colore: '#7E9C82', screen: 'myynd' },
  { id: 'r6', titolo: 'Fatture fornitori', fonte: 'Automazione · 214 esecuzioni', quando: 'attiva', colore: '#5C7660', screen: 'auto' }
]

export type Screen = 'myynd' | 'chat' | 'auto' | 'mappa' | 'pref' | 'conn'

export type Messaggio = { id: string; role: 'u' | 'a'; text: string; sources?: Fonte[] }
export type Thread = { id: string; titolo: string; quando: string; messages: Messaggio[] }

export const THREADS: Thread[] = [
  {
    id: 'th0', titolo: 'Pagamenti Ceramiche Lodi', quando: 'oggi',
    messages: [
      { id: 'm2', role: 'u', text: 'Quanto ci ha messo Ceramiche Lodi a pagare le ultime tre fatture?' },
      { id: 'm3', role: 'a', text: 'In media 47 giorni: 38 sulla № 91, 52 sulla № 104, 51 sulla № 112. Sono sempre oltre i 30 concordati, ma pagano senza sollecito.', sources: [{ id: 's1', label: 'Fatture in Cloud' }, { id: 's2', label: 'Contratto 2025.pdf' }] }
    ]
  },
  {
    id: 'th1', titolo: 'Chiusura di luglio', quando: '2 ago',
    messages: [
      { id: 'n1', role: 'u', text: 'Come è andato luglio?' },
      { id: 'n2', role: 'a', text: 'Fatturato € 214.600, il 9% sopra luglio 2025. Due clienti nuovi, nessuno perso. Il margine è scivolato di un punto e mezzo per il costo dei trasporti.', sources: [{ id: 's3', label: 'Fatture in Cloud' }] },
      { id: 'n3', role: 'u', text: 'Da cosa dipende il costo trasporti?' },
      { id: 'n4', role: 'a', text: 'Rossi Trasporti ha alzato del 12% da giugno. Due consegne su tre passano da loro. Vetreria Sile costa il 6% in meno sulle stesse tratte.', sources: [{ id: 's4', label: 'Fatture fornitori' }] }
    ]
  },
  {
    id: 'th2', titolo: 'Assunzione magazzino', quando: '28 lug',
    messages: [
      { id: 'p1', role: 'u', text: 'Quante ore di straordinario ha fatto il magazzino a luglio?' },
      { id: 'p2', role: 'a', text: '186 ore, il 40% in più di giugno. Marco da solo ne ha fatte 62.', sources: [{ id: 's5', label: 'Teams' }, { id: 's6', label: 'Presenze.xlsx' }] }
    ]
  },
  {
    id: 'th3', titolo: 'Listino 2026, cosa cambiare', quando: '21 lug',
    messages: [
      { id: 'q1', role: 'u', text: 'Su quali articoli stiamo perdendo margine?' },
      { id: 'q2', role: 'a', text: 'Tre: la serie 400 (margine 11%, era 19%), gli accessori Sile e i pezzi su misura sotto i 500 euro, dove il tempo di preparazione non è coperto.', sources: [{ id: 's7', label: 'Listino luglio 2026' }] }
    ]
  },
  {
    id: 'th4', titolo: 'Preventivo Bertoli', quando: '18 lug',
    messages: [
      { id: 'v1', role: 'u', text: 'Bertoli ha risposto al preventivo di giugno?' },
      { id: 'v2', role: 'a', text: 'No. Ultimo contatto il 12 giugno, poi silenzio. Nel 2025 aveva risposto in media in quattro giorni.', sources: [{ id: 's8', label: 'Gmail' }] }
    ]
  }
]

export const WORDS = ['Niente', 'Una cosa', 'Due cose', 'Tre cose', 'Quattro cose', 'Cinque cose']

export function fmtOre(h: number): string {
  const n = Number(h)
  if (!isFinite(n) || n <= 0) return '0 h'
  if (n < 24) return n + ' h'
  const g = Math.floor(n / 24), r = n % 24
  return r ? g + ' g ' + r + ' h' : g + ' g'
}
