// Held-out set, never used while fixing: Studio Bianchi Architetti (8 people), Italian mail.
const ORA = Date.now()
const ore = h => new Date(ORA - h * 3600_000).toISOString()
const mail = (id, h, autore, titolo, corpo, extra = {}) => ({ id: `posta:INBOX:${id}`, fonte: 'posta', tipo: 'email', titolo, corpo, autore, quando: ore(h), destinatari: 'chiara@studiobianchi.test', ...extra })

export const DA_FARE = {
  'posta:INBOX:401': 'Cliente chiede il computo metrico aggiornato entro mercoledì',
  'posta:INBOX:402': 'Comune: integrazione documentale per la SCIA entro 10 giorni',
  'posta:INBOX:403': 'Fornitore chiede conferma ordine piastrelle',
  'posta:INBOX:404': 'Collega chiede se può spostare la riunione di cantiere',
  'posta:INBOX:405': 'Banca: firma digitale del mutuo studio in scadenza',
  'posta:INBOX:406': 'Nuova cliente chiede un preventivo per una ristrutturazione',
}

export const INBOX = [
  mail(401, 4, 'Paolo Neri <paolo.neri@mail.test>', 'Computo metrico villa Neri', 'Buongiorno Chiara,\n\nmi servirebbe il computo metrico aggiornato con le nuove finestre entro mercoledì, così lo giro all\'impresa. Grazie mille.\n\nPaolo'),
  mail(402, 20, 'SUAP Comune di Treviso <suap@comune.treviso.test>', 'Pratica SCIA 2026/1184: richiesta integrazioni', 'Gentile tecnico,\n\nper la pratica SCIA 2026/1184 si richiede l\'integrazione della relazione tecnica e degli elaborati grafici entro 10 giorni dal ricevimento della presente. In assenza, la pratica sarà archiviata.\n\nUfficio SUAP'),
  mail(403, 9, 'Ceramiche Venete <ordini@ceramichevenete.test>', 'Conferma ordine 5521', 'Buongiorno,\n\nci confermate l\'ordine 5521 (gres 60x60, 84 mq) per la consegna del 20? Senza conferma entro venerdì perdiamo lo slot di produzione.\n\nUfficio ordini'),
  mail(404, 2, 'Luca Ferraro <luca@studiobianchi.test>', 'Riunione di cantiere', 'Chiara, possiamo spostare la riunione di cantiere di Mestre da giovedì a venerdì mattina? L\'impresa ha chiesto. Dimmi tu.'),
  mail(405, 30, 'Banca del Piave <imprese@bancadelpiave.test>', 'Mutuo studio: firma richiesta', 'Gentile cliente,\n\nil contratto di mutuo per i locali dello studio è pronto. La firma digitale va apposta entro il 24 ottobre, dopodiché l\'offerta decade.\n\nBanca del Piave'),
  mail(406, 26, 'Giulia Riva <giulia.riva@mail.test>', 'Preventivo ristrutturazione appartamento', 'Salve, ho visto i vostri lavori su Instagram. Potreste farmi un preventivo per la ristrutturazione di un appartamento di 90 mq a Treviso? Sono disponibile per un sopralluogo la prossima settimana.\n\nGiulia Riva'),
  // rumore
  mail(501, 3, 'Archiproducts <news@archiproducts.test>', 'Le novità del Salone', 'Scopri i prodotti più interessanti della settimana. Iscriviti al webinar!'),
  mail(502, 5, 'Aruba <fatturazione@aruba.test>', 'Fattura disponibile', 'La fattura n. 2026-4412 di 19,90 EUR è disponibile nella tua area clienti. Pagamento già addebitato.'),
  mail(503, 7, 'Paolo Neri <paolo.neri@mail.test>', 'Re: sopralluogo', 'Perfetto, grazie per ieri. Nessuna azione da parte vostra.'),
  mail(504, 11, 'Ordine degli Architetti <info@ordinearchitetti.test>', 'Newsletter di ottobre', 'In questo numero: i corsi di aggiornamento e le novità normative.'),
  mail(505, 14, 'Google Calendar <calendar@google.test>', 'Accettato: Revisione progetto Mestre', 'Luca Ferraro ha accettato l\'invito.'),
  mail(506, 17, 'Amazon <spedizioni@amazon.test>', 'Il tuo ordine è stato spedito', 'Il pacco con il plotter di ricambio arriverà domani.'),
  mail(507, 22, 'Sara Costa <sara@studiobianchi.test>', 'Ferie', 'Vi ricordo che sono in ferie dal 27 al 31, già segnato in calendario.'),
  mail(508, 28, 'LinkedIn <notifiche@linkedin.test>', 'Hai 5 nuove visualizzazioni', 'Scopri chi ha visitato il tuo profilo.'),
  mail(509, 33, 'Impresa Gatto <info@impresagatto.test>', 'Foto avanzamento lavori', 'Vi giro le foto dell\'avanzamento di questa settimana, tutto procede come da programma.'),
  mail(510, 40, 'Autodesk <noreply@autodesk.test>', 'Il tuo abbonamento si rinnova il 1 novembre', 'Il rinnovo avverrà automaticamente. Nessuna azione richiesta.'),
]
export const INVIATE = [
  { id: 'posta:Sent:601', fonte: 'posta', tipo: 'email', titolo: 'Re: tavole', corpo: 'Ciao Paolo,\n\nti mando le tavole in giornata.\n\nUn saluto,\nChiara', autore: 'Chiara Bianchi <chiara@studiobianchi.test>', destinatari: 'paolo.neri@mail.test', quando: ore(80), inviato: true },
]
export const FILE = []
