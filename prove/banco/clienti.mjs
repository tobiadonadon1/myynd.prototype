// Il banco della qualità: due clienti inventati, il loro materiale, la loro
// voce e venti lavori veri da fare. Ogni nome, indirizzo e numero è inventato.
//
// La voce sono righe che il cliente ha scritto di suo (a Myynd e nelle
// sessioni con un assistente): è quello su cui il giudice misura «sembra lui».

import * as alex from '../qualita/dati.mjs'
import * as chiara from '../qualita/dati-it.mjs'

const ORA = Date.now()
const ore = h => new Date(ORA - h * 3600_000).toISOString()
const file = (id, titolo, corpo, h = 100) => ({ id: `desktop:${id}`, fonte: 'desktop', tipo: 'testo', titolo, corpo, quando: ore(h), percorso: `/banco/Documents/${titolo}` })

export const CLIENTI = {
  alex: {
    config: { nome: 'Alex Rivera', ruolo: 'Founder, Northwind Studio', lingua: 'en', fuso: 'Europe/Rome' },
    profilo: 'Alex Rivera runs Northwind Studio, a 6-person design and web studio. Writes short, warm, direct emails, signs "Cheers, Alex".',
    docs: [
      ...alex.INBOX, ...alex.INVIATE, ...alex.FILE,
      file('relaunch-offer', 'Relaunch offer autumn.md', '# Website relaunch offer, autumn\n\nFor studios and shops with an old site.\n6 weeks, from EUR 14,000.\nIncludes: new design, CMS, copy help, launch.\nSlots open from November: 2 projects.'),
      file('kesto', 'Kesto launch notes.md', 'Kesto launch on the 3rd.\nWaiting from Tom: final copy and product photos, promised by Friday.\nIf late, launch moves a week.', 70)
    ],
    voce: [
      'ok so harbor wants the quote again, just drop the second workshop and keep the rest as is',
      'no long intros in emails pls, people know us',
      'can you check what we charged kesto for the relaunch last year',
      'lets not promise dates we cant hit, I would rather say early november',
      'honestly the meetup was good, jonas seems legit, send him the pricing',
      'keep it friendly but short, thats how we write'
    ],
    lavori: [
      { testo: 'Reply to Nora with the revised pilot quote', doc: 'posta:INBOX:101', tipo: 'mail' },
      { testo: 'Reply to Giulia about the Q3 VAT return', doc: 'posta:INBOX:102', tipo: 'mail' },
      { testo: 'Reply to Marco to schedule the interview', doc: 'posta:INBOX:103', tipo: 'mail' },
      { testo: 'Reply to Printhouse about their new bank details', doc: 'posta:INBOX:104', tipo: 'mail' },
      { testo: 'Send Jonas the pricing one-pager', doc: 'posta:INBOX:105', tipo: 'mail' },
      { testo: 'Draft the lease renewal notice for Unit 4B', doc: 'posta:INBOX:106', tipo: 'documento' },
      { testo: 'Reply to Sam about the typeface', doc: 'posta:INBOX:107', tipo: 'mail' },
      { testo: 'Write a one-page proposal for the Harbor pilot', tipo: 'documento' },
      { testo: 'Write a brief for a Meta ads campaign for the autumn relaunch offer', tipo: 'documento' },
      { testo: 'Write a LinkedIn post saying we have two relaunch slots from November', tipo: 'post' },
      { testo: 'Follow up with Tom at Kesto about the final copy and photos', tipo: 'mail' }
    ]
  },
  chiara: {
    config: { nome: 'Chiara Bianchi', ruolo: 'Titolare, Studio Bianchi Architetti', lingua: 'it', fuso: 'Europe/Rome' },
    profilo: 'Chiara Bianchi è titolare di uno studio di architettura a Treviso. Scrive mail cortesi e asciutte, firma "Un saluto, Chiara".',
    docs: [
      ...chiara.INBOX, ...chiara.INVIATE,
      file('mestre', 'Cantiere Mestre note.md', 'Cantiere Mestre, via Piave 12.\nDemolizioni finite, impianti in corso.\nPavimenti: gres 60x60, ordine 5521, consegna prevista il 20.\nRiunione di cantiere: giovedì 9:00, impresa Lago.'),
      file('scia', 'SCIA 2026-1184 promemoria.md', 'Pratica SCIA 2026/1184, appartamento Riva.\nMancano: relazione tecnica asseverata firmata, elaborato grafico stato di fatto aggiornato.\nScadenza integrazioni: 30 giorni dalla richiesta.'),
      file('tariffe', 'Tariffe studio 2026.md', '# Tariffe Studio Bianchi 2026\n\nRistrutturazione appartamento: progetto e direzione lavori dal 9% dell\'importo lavori, minimo EUR 4.500.\nSopralluogo e consulenza iniziale: EUR 150, scalati dall\'incarico.\nIVA e cassa esclusi.')
    ],
    voce: [
      'allora, per Paolo il computo lo aggiorno io domani mattina, tu prepara la mail',
      'non mettere troppi convenevoli, i clienti mi conoscono',
      'la riunione di Mestre la possiamo spostare a venerdì, ma non prima delle 10',
      'per la SCIA manca la relazione firmata, il resto c\'è',
      'scrivi come scrivo io, corto e gentile',
      'il gres lo confermiamo, è quello che ha scelto il cliente'
    ],
    lavori: [
      { testo: 'Rispondi a Paolo sul computo metrico', doc: 'posta:INBOX:401', tipo: 'mail' },
      { testo: 'Rispondi al SUAP sulle integrazioni della SCIA', doc: 'posta:INBOX:402', tipo: 'mail' },
      { testo: 'Conferma l\'ordine 5521 a Ceramiche Venete', doc: 'posta:INBOX:403', tipo: 'mail' },
      { testo: 'Rispondi a Luca sullo spostamento della riunione', doc: 'posta:INBOX:404', tipo: 'mail' },
      { testo: 'Rispondi a Giulia Riva per il preventivo', doc: 'posta:INBOX:406', tipo: 'mail' },
      { testo: 'Scrivi un post Instagram sul cantiere di Mestre', tipo: 'post' },
      { testo: 'Prepara la checklist delle integrazioni per la SCIA 2026/1184', tipo: 'documento' },
      { testo: 'Scrivi la mail ai clienti per la chiusura dello studio a Natale', tipo: 'mail' },
      { testo: 'Prepara un riepilogo dello stato del cantiere di Mestre per il cliente', tipo: 'documento' }
    ]
  }
}
